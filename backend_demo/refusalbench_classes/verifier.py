import litellm
import json
import os
import asyncio
from typing import Dict, List, Optional
from tenacity import retry, stop_after_attempt, wait_random_exponential
import logging

logging.basicConfig( 
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from prompt_guidelines import RefusalBenchCatalogue

# Import config loader
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config_loader import (
    load_config,
    build_model_string,
    setup_provider_env,
    get_model_kwargs,
    get_verifier_configs,
    get_processing_config
)


class MultiModelAsyncRefusalBenchVerifier:
    """
    Multi-Model Async RefusalBench Perturbation Verifier using LiteLLM.
    
    Supports multiple LLM providers:
    - AWS Bedrock (Claude, DeepSeek, etc.)
    - GCP Vertex AI (Gemini models)
    - OpenAI (GPT models)
    
    Verifies generated perturbations using the official RefusalBench lever catalogue
    across multiple models (configurable, default 4 verifiers).
    """
    
    def __init__(self, 
                 config: Optional[Dict] = None,
                 config_path: str = "config.yaml",
                 # Legacy parameters for backward compatibility
                 region_name: Optional[str] = None,
                 batch_size: Optional[int] = None,
                 max_concurrent: Optional[int] = None,
                 temperature: Optional[float] = None,
                 max_tokens: Optional[int] = None):
        """
        Initialize the multi-model async perturbation verifier.
        
        Args:
            config: Optional configuration dictionary. If not provided, loads from config_path.
            config_path: Path to YAML configuration file (default: config.yaml)
            
            Legacy parameters (override config if provided):
            region_name: AWS region for Bedrock (applied to all Bedrock models)
            batch_size: Batch size for processing
            max_concurrent: Maximum concurrent API calls
            temperature: Model temperature (applied to all models)
            max_tokens: Maximum tokens for response (applied to all models)
        """
        
        # Load configuration from file if not provided
        if config is None:
            try:
                verifier_configs = get_verifier_configs(config_path)
                processing_config = get_processing_config(config_path)
            except FileNotFoundError:
                # Fall back to legacy defaults if no config file
                logger.warning("Config file not found, using legacy defaults with 2 verifiers")
                verifier_configs = [
                    {
                        "name": "verifier_a",
                        "provider": "bedrock",
                        "model_id": "us.anthropic.claude-opus-4-1-20250805-v1:0",
                        "model_string": "bedrock/us.anthropic.claude-opus-4-1-20250805-v1:0",
                        "model_kwargs": {"temperature": 0.1, "max_tokens": 2000, "top_p": 0.99}
                    },
                    {
                        "name": "verifier_b",
                        "provider": "bedrock",
                        "model_id": "us.deepseek.r1-v1:0",
                        "model_string": "bedrock/converse/us.deepseek.r1-v1:0",
                        "model_kwargs": {"temperature": 0.1, "max_tokens": 2000, "top_p": 0.99}
                    }
                ]
                processing_config = {
                    "batch_size": 10,
                    "max_concurrent": 20
                }
        else:
            # Use provided config
            if "verifiers" in config:
                verifier_configs = config["verifiers"]
            else:
                verifier_configs = [config]  # Single verifier config
            
            processing_config = config.get("processing", {"batch_size": 10, "max_concurrent": 20})
            
            # Build model strings if not already present
            for vc in verifier_configs:
                if "model_string" not in vc:
                    vc["model_string"] = build_model_string(
                        vc.get("provider", "bedrock"),
                        vc.get("model_id", ""),
                        vc.get("use_converse", False)
                    )
                if "model_kwargs" not in vc:
                    vc["model_kwargs"] = get_model_kwargs(vc)
        
        # Apply legacy parameter overrides if provided
        if region_name is not None:
            for vc in verifier_configs:
                if vc.get("provider") == "bedrock":
                    vc["aws_region"] = region_name
        
        if temperature is not None or max_tokens is not None:
            for vc in verifier_configs:
                if temperature is not None:
                    vc["model_kwargs"]["temperature"] = temperature
                if max_tokens is not None:
                    vc["model_kwargs"]["max_tokens"] = max_tokens
        
        if batch_size is not None:
            processing_config["batch_size"] = batch_size
        if max_concurrent is not None:
            processing_config["max_concurrent"] = max_concurrent
        
        # Set up provider-specific environment variables for all verifiers
        for vc in verifier_configs:
            setup_provider_env(vc)
        
        # Store configuration
        self.verifier_configs = verifier_configs
        self.models = [vc["model_string"] for vc in verifier_configs]
        self.model_kwargs_map = {vc["model_string"]: vc["model_kwargs"] for vc in verifier_configs}
        self.model_names = {vc["model_string"]: vc.get("name", vc["model_string"]) for vc in verifier_configs}
        self.model_display_names = {
            vc["model_string"]: vc.get("display_name", vc.get("model_id", vc["model_string"])) 
            for vc in verifier_configs
        }
        
        self.batch_size = processing_config.get("batch_size", 10)
        self.max_concurrent = processing_config.get("max_concurrent", 20)
        
        # Async processing setup
        self.semaphore = asyncio.Semaphore(self.max_concurrent)
        
        # Initialize RefusalBench catalogue
        self.catalogue = RefusalBenchCatalogue()
        
        logger.info(f"Initialized verifier with {len(self.models)} models:")
        for i, model in enumerate(self.models):
            display_name = self.model_display_names.get(model, model)
            logger.info(f"  Verifier {i+1}: {display_name} ({model})")

    @retry(
        wait=wait_random_exponential(min=2, max=30),
        stop=stop_after_attempt(100),
    )
    async def _call_model_async(self, model_id: str, prompt: str) -> str:
        """Call specified model via LiteLLM asynchronously with retry logic."""
        async with self.semaphore:
            try:
                messages = [{"role": "user", "content": prompt}]
                
                # Get model-specific kwargs
                model_kwargs = self.model_kwargs_map.get(model_id, {
                    "temperature": 0.1,
                    "max_tokens": 2000,
                    "top_p": 0.99
                })
                
                # Call LiteLLM completion
                response = await litellm.acompletion(
                    model=model_id,
                    messages=messages,
                    **model_kwargs
                )
                
                return response.choices[0].message.content
                
            except Exception as e:
                logger.error(f"Error calling {model_id}: {e}")
                raise e

    def _parse_json_response(self, response: str) -> Dict:
        """Parse JSON response from model, handling common formatting issues."""
        try:
            # Remove markdown code blocks if present
            if "```json" in response:
                start = response.find("```json") + 7
                end = response.find("```", start)
                if end != -1:
                    response = response[start:end].strip()
            elif "```" in response:
                start = response.find("```") + 3
                end = response.find("```", start)
                if end != -1:
                    response = response[start:end].strip()
            
            # Parse JSON
            parsed = json.loads(response)
            parsed["parsing_successful"] = True
            return parsed
            
        except json.JSONDecodeError as e:
            return {
                "parsing_successful": False,
                "error": f"JSON parsing failed: {e}",
                "raw_response": response
            }
        except Exception as e:
            return {
                "parsing_successful": False,
                "error": f"Unexpected error: {e}",
                "raw_response": response
            }

    async def verify_perturbation_async(self, model_id: str, perturbation_data: Dict) -> Dict:
        """Verify a single perturbation asynchronously using the specified model."""
        
        try:
            # Extract required fields
            original_query = perturbation_data.get("original_query", "")
            original_context = perturbation_data.get("original_context", "")
            original_answers = perturbation_data.get("original_answers", "")
            perturbation_class = perturbation_data.get("perturbation_class", "")
            intensity = perturbation_data.get("intensity", "")
            
            # Check if generation was successful
            if not perturbation_data.get("generation_successful", False):
                return {
                    **perturbation_data,
                    "verification_model": model_id,
                    "verification_model_name": self.model_names.get(model_id, model_id),
                    "verification_display_name": self.model_display_names.get(model_id, model_id),
                    "verification_successful": False,
                    "verification_error": "Original generation failed"
                }
            
            # Validate required fields
            if not all([original_query, original_context, perturbation_class, intensity]):
                return {
                    **perturbation_data,
                    "verification_model": model_id,
                    "verification_model_name": self.model_names.get(model_id, model_id),
                    "verification_display_name": self.model_display_names.get(model_id, model_id),
                    "verification_successful": False,
                    "verification_error": "Missing required fields"
                }
            
            # Prepare generator output for verification
            generator_output = {
                "perturbed_query": perturbation_data.get("perturbed_query", ""),
                "perturbed_context": perturbation_data.get("perturbed_context", ""),
                "lever_selected": perturbation_data.get("lever_selected", ""),
                "implementation_reasoning": perturbation_data.get("implementation_reasoning", ""),
                "intensity_achieved": perturbation_data.get("intensity_achieved", "")
            }
            
            # Get the verifier prompt from catalogue
            prompt = self.catalogue.generate_verifier_prompt(
                perturbation_class, intensity,
                original_query, original_context, original_answers,
                json.dumps(generator_output, indent=2)
            )
            
            # Call the specified model
            response = await self._call_model_async(model_id, prompt)
            
            # Parse the response
            parsed = self._parse_json_response(response)
            
            # Add metadata
            result = {
                **perturbation_data,
                "verification_model": model_id,
                "verification_model_name": self.model_names.get(model_id, model_id),
                "verification_display_name": self.model_display_names.get(model_id, model_id),
                "verification_successful": parsed.get("parsing_successful", False),
                "verification_response": parsed
            }
            
            return result
            
        except Exception as e:
            return {
                **perturbation_data,
                "verification_model": model_id,
                "verification_model_name": self.model_names.get(model_id, model_id),
                "verification_display_name": self.model_display_names.get(model_id, model_id),
                "verification_successful": False,
                "verification_error": str(e)
            }

    async def verify_with_all_models(self, perturbation_data: Dict) -> List[Dict]:
        """
        Verify a perturbation with all configured verifier models.
        
        Args:
            perturbation_data: The perturbation data to verify
            
        Returns:
            List of verification results from all models
        """
        tasks = [
            self.verify_perturbation_async(model, perturbation_data)
            for model in self.models
        ]
        results = await asyncio.gather(*tasks)
        return list(results)
