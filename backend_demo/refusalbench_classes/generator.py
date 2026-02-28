import litellm
import json
import os
import asyncio
from typing import Dict, List, Union, Optional
from tenacity import retry, stop_after_attempt, wait_random_exponential

import logging
logging.basicConfig( 
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from prompt_guidelines import RefusalBenchCatalogue, get_available_combinations

# Import config loader
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config_loader import (
    load_config, 
    build_model_string, 
    setup_provider_env, 
    get_model_kwargs,
    get_generator_config,
    get_processing_config
)


class AsyncRefusalBenchGenerator:
    """
    Async RefusalBench Perturbation Generator using LiteLLM.
    
    Supports multiple LLM providers:
    - AWS Bedrock (Claude, DeepSeek, etc.)
    - GCP Vertex AI (Gemini models)
    - OpenAI (GPT models)
    
    Generates linguistically-grounded perturbations using the official RefusalBench lever catalogue.
    """
    
    def __init__(self, 
                 config: Optional[Dict] = None,
                 config_path: str = "config.yaml",
                 # Legacy parameters for backward compatibility
                 region_name: Optional[str] = None,
                 model_id: Optional[str] = None,
                 batch_size: Optional[int] = None,
                 max_concurrent: Optional[int] = None,
                 temperature: Optional[float] = None,
                 max_tokens: Optional[int] = None):
        """
        Initialize the async perturbation generator.
        
        Args:
            config: Optional configuration dictionary. If not provided, loads from config_path.
            config_path: Path to YAML configuration file (default: config.yaml)
            
            Legacy parameters (override config if provided):
            region_name: AWS region for Bedrock
            model_id: Model identifier
            batch_size: Batch size for processing
            max_concurrent: Maximum concurrent API calls
            temperature: Model temperature
            max_tokens: Maximum tokens for response
        """
        
        # Load configuration from file if not provided
        if config is None:
            try:
                generator_config = get_generator_config(config_path)
                processing_config = get_processing_config(config_path)
            except FileNotFoundError:
                # Fall back to legacy defaults if no config file
                logger.warning("Config file not found, using legacy defaults")
                generator_config = {
                    "provider": "bedrock",
                    "model_id": "us.anthropic.claude-sonnet-4-20250514-v1:0",
                    "aws_region": "us-east-1",
                    "use_converse": False,
                    "temperature": 0.1,
                    "max_tokens": 2000,
                    "top_p": 0.99
                }
                processing_config = {
                    "batch_size": 10,
                    "max_concurrent": 20
                }
                generator_config["model_string"] = build_model_string(
                    generator_config["provider"],
                    generator_config["model_id"],
                    generator_config.get("use_converse", False)
                )
                generator_config["model_kwargs"] = get_model_kwargs(generator_config)
        else:
            generator_config = config
            processing_config = config.get("processing", {"batch_size": 10, "max_concurrent": 20})
            
            # Build model string if not already present
            if "model_string" not in generator_config:
                generator_config["model_string"] = build_model_string(
                    generator_config.get("provider", "bedrock"),
                    generator_config.get("model_id", ""),
                    generator_config.get("use_converse", False)
                )
            
            # Build model kwargs if not already present
            if "model_kwargs" not in generator_config:
                generator_config["model_kwargs"] = get_model_kwargs(generator_config)
        
        # Apply legacy parameter overrides if provided
        if region_name is not None:
            generator_config["aws_region"] = region_name
        if model_id is not None:
            # If model_id is provided with prefix (e.g., "bedrock/..."), use directly
            if "/" in model_id:
                generator_config["model_string"] = model_id
            else:
                generator_config["model_id"] = model_id
                generator_config["model_string"] = build_model_string(
                    generator_config.get("provider", "bedrock"),
                    model_id,
                    generator_config.get("use_converse", False)
                )
        if temperature is not None:
            generator_config["model_kwargs"]["temperature"] = temperature
        if max_tokens is not None:
            generator_config["model_kwargs"]["max_tokens"] = max_tokens
        if batch_size is not None:
            processing_config["batch_size"] = batch_size
        if max_concurrent is not None:
            processing_config["max_concurrent"] = max_concurrent
        
        # Set up provider-specific environment variables
        setup_provider_env(generator_config)
        
        # Store configuration
        self.model_id = generator_config["model_string"]
        self.model_kwargs = generator_config["model_kwargs"]
        self.provider = generator_config.get("provider", "bedrock")
        self.display_name = generator_config.get("display_name", generator_config.get("model_id", "Unknown Model"))
        
        self.batch_size = processing_config.get("batch_size", 10)
        self.max_concurrent = processing_config.get("max_concurrent", 20)
        
        # Async processing setup
        self.semaphore = asyncio.Semaphore(self.max_concurrent)
                
        # Initialize RefusalBench catalogue
        self.catalogue = RefusalBenchCatalogue()
        
        # Get all available perturbation combinations
        self.combinations = get_available_combinations()
        
        logger.info(f"Initialized generator with model: {self.display_name} ({self.model_id}, provider: {self.provider})")
        logger.info(f"Available perturbation combinations: {len(self.combinations)}")

    @retry(
        wait=wait_random_exponential(min=2, max=30),
        stop=stop_after_attempt(100),
    )
    async def _call_model_async(self, prompt: str) -> str:
        """Call LLM model via LiteLLM asynchronously with retry logic."""
        async with self.semaphore:
            try:
                messages = [{"role": "user", "content": prompt}]
                
                # Call LiteLLM completion
                response = await litellm.acompletion(
                    model=self.model_id,
                    messages=messages,
                    **self.model_kwargs
                )
                
                return response.choices[0].message.content
                
            except Exception as e:
                logger.error(f"Error calling model {self.model_id}: {e}")
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
            logger.error(e)
            return {
                "parsing_successful": False,
                "error": f"Unexpected error: {e}",
                "raw_response": response
            }

    async def generate_perturbation_async(self, 
                                        original_query: str, 
                                        original_context: str, 
                                        original_answers: Union[str, List[str]], 
                                        perturbation_class: str, 
                                        intensity: str) -> Dict:
        """Generate a single perturbation asynchronously using the RefusalBench catalogue."""
        
        try:
            # Get the generator prompt from catalogue (already formatted)
            prompt = self.catalogue.generate_generator_prompt(
                perturbation_class, intensity,
                original_query, original_context, original_answers
            )
            
            # Call model
            response = await self._call_model_async(prompt)
            
            # Parse the response
            parsed = self._parse_json_response(response)
            
            # Add metadata
            result = {
                "original_query": original_query,
                "original_context": original_context,
                "original_answers": original_answers,
                "perturbation_class": perturbation_class,
                "intensity": intensity,
                "generator_model": self.model_id,
                "generator_display_name": self.display_name,
                "generation_successful": parsed.get("parsing_successful", False),
                **parsed
            }
            
            return result
            
        except Exception as e:
            return {
                "original_query": original_query,
                "original_context": original_context,
                "original_answers": original_answers,
                "perturbation_class": perturbation_class,
                "intensity": intensity,
                "generator_model": self.model_id,
                "generator_display_name": self.display_name,
                "generation_successful": False,
                "error": str(e)
            }


    async def process_instance_async(self, 
                                  question: str, 
                                  context: str, 
                                  answers: List[str],
                                  perturbation_class: str,
                                  intensity: str):
        """Process question, context, and generate perturbations asynchronously."""

    
        instance = {
                        'query': question,
                        'context': context,
                        'answers': answers
                    }
        task = self.generate_perturbation_async(
                    instance['query'], 
                    instance['context'], 
                    instance['answers'],
                    perturbation_class,
                    intensity
                )
        results = await task
        if results.get('generation_successful', False):
            return results
        else:
            return {
                "generation_successful": False,
                "error": results.get('error', 'Unknown error')
            }
