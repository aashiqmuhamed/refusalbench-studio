"""
Config Loader for RefusalBench User Study

Handles loading YAML configuration and building provider-specific model strings
for LiteLLM compatibility. Covers generator, verifiers, evaluators, and the
Dynamic Inference Lab (orchestrator + execution models).
"""

import os
import yaml
from typing import Dict, Any, Optional, List
import logging

logger = logging.getLogger(__name__)


def load_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    """
    Load configuration from YAML file.
    
    Args:
        config_path: Path to the YAML configuration file
        
    Returns:
        Dictionary containing the configuration
    """
    # Handle relative paths - look in backend directory
    if not os.path.isabs(config_path):
        # Try current directory first
        if os.path.exists(config_path):
            full_path = config_path
        else:
            # Try backend directory
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            full_path = os.path.join(backend_dir, config_path)
    else:
        full_path = config_path
    
    try:
        with open(full_path, 'r') as f:
            config = yaml.safe_load(f)
        logger.info(f"Loaded configuration from {full_path}")
        return config
    except FileNotFoundError:
        logger.error(f"Configuration file not found: {full_path}")
        raise
    except yaml.YAMLError as e:
        logger.error(f"Error parsing YAML configuration: {e}")
        raise


def build_model_string(provider: str, model_id: str, use_converse: bool = False) -> str:
    """
    Build LiteLLM-compatible model string based on provider.
    
    Args:
        provider: The LLM provider (bedrock, vertex_ai, openai, vllm)
        model_id: The model identifier
        use_converse: For Bedrock, whether to use the converse API
        
    Returns:
        LiteLLM-compatible model string
    """
    provider = provider.lower()
    
    if provider == "bedrock":
        if use_converse:
            return f"bedrock/converse/{model_id}"
        return f"bedrock/{model_id}"
    
    elif provider == "vertex_ai":
        return f"vertex_ai/{model_id}"
    
    elif provider == "openai":
        # OpenAI models are used directly without prefix
        return model_id
    
    elif provider == "vllm":
        # vLLM uses OpenAI-compatible API, prefix with openai/
        # LiteLLM will use the api_base parameter to route to vLLM server
        return f"openai/{model_id}"
    
    else:
        logger.warning(f"Unknown provider '{provider}', using model_id directly: {model_id}")
        return model_id


def setup_provider_env(config: Dict[str, Any]) -> None:
    """
    Set up environment variables for the specified provider.
    
    Args:
        config: Configuration dictionary containing provider settings
    """
    provider = config.get("provider", "").lower()
    
    if provider == "bedrock":
        # Set AWS region if specified
        aws_region = config.get("aws_region", "us-east-1")
        os.environ["AWS_REGION_NAME"] = aws_region
        logger.debug(f"Set AWS_REGION_NAME to {aws_region}")
        
    elif provider == "vertex_ai":
        # Vertex AI uses VERTEX_PROJECT and VERTEX_LOCATION from env
        # These should be set in .env file, but we can override if specified in config
        if "vertex_project" in config:
            os.environ["VERTEX_PROJECT"] = config["vertex_project"]
        if "vertex_location" in config:
            os.environ["VERTEX_LOCATION"] = config["vertex_location"]
        logger.debug("Configured Vertex AI environment")
        
    elif provider == "openai":
        # OpenAI uses OPENAI_API_KEY from env
        # Should already be set via .env file
        logger.debug("OpenAI provider configured (uses OPENAI_API_KEY from env)")
    
    elif provider == "vllm":
        # vLLM uses OpenAI-compatible API with custom endpoint
        # api_base and api_key are passed directly via model_kwargs
        # No environment variables needed
        logger.debug("vLLM provider configured (uses api_base from config)")


def get_model_kwargs(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract model parameters from configuration.
    
    Note: Some models (e.g., Claude on Bedrock) don't allow both temperature 
    and top_p to be specified together. By default, we only include temperature.
    Set 'use_top_p: true' in config to use top_p instead of temperature.
    
    For vLLM and custom OpenAI-compatible endpoints, api_base and api_key 
    can be specified in the config and will be passed to LiteLLM.
    
    Args:
        config: Configuration dictionary
        
    Returns:
        Dictionary of model keyword arguments
    """
    kwargs = {
        "max_tokens": config.get("max_tokens", 2000),
    }
    
    # Some models don't allow both temperature and top_p
    # By default use temperature, unless use_top_p is explicitly set
    if config.get("use_top_p", False):
        kwargs["top_p"] = config.get("top_p", 0.99)
    else:
        kwargs["temperature"] = config.get("temperature", 0.1)
    
    # Add custom API base URL if specified (for vLLM or custom endpoints)
    if "api_base" in config:
        kwargs["api_base"] = config["api_base"]
        logger.debug(f"Using custom api_base: {config['api_base']}")
    
    # Add custom API key if specified (for vLLM or custom endpoints)
    if "api_key" in config:
        kwargs["api_key"] = config["api_key"]
        logger.debug("Using custom api_key from config")
    
    return kwargs


def get_generator_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    """
    Get the generator configuration with computed model string.
    
    Args:
        config_path: Path to the YAML configuration file
        
    Returns:
        Generator configuration dictionary with model_string added
    """
    config = load_config(config_path)
    generator_config = config.get("generator", {})
    
    # Build the model string
    generator_config["model_string"] = build_model_string(
        generator_config.get("provider", "bedrock"),
        generator_config.get("model_id", ""),
        generator_config.get("use_converse", False)
    )
    
    # Get model kwargs
    generator_config["model_kwargs"] = get_model_kwargs(generator_config)
    
    # Set up provider environment
    setup_provider_env(generator_config)
    
    return generator_config


def get_verifier_configs(config_path: str = "config.yaml") -> list:
    """
    Get all verifier configurations with computed model strings.
    
    Args:
        config_path: Path to the YAML configuration file
        
    Returns:
        List of verifier configuration dictionaries with model_string added
    """
    config = load_config(config_path)
    verifier_configs = config.get("verifiers", [])
    
    for verifier_config in verifier_configs:
        # Build the model string
        verifier_config["model_string"] = build_model_string(
            verifier_config.get("provider", "bedrock"),
            verifier_config.get("model_id", ""),
            verifier_config.get("use_converse", False)
        )
        
        # Get model kwargs
        verifier_config["model_kwargs"] = get_model_kwargs(verifier_config)
        
        # Set up provider environment
        setup_provider_env(verifier_config)
    
    return verifier_configs


def get_processing_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    """
    Get the processing configuration.
    
    Args:
        config_path: Path to the YAML configuration file
        
    Returns:
        Processing configuration dictionary
    """
    config = load_config(config_path)
    return config.get("processing", {
        "batch_size": 10,
        "max_concurrent": 20
    })


def get_evaluators_config(config_path: str = "config.yaml") -> list:
    """
    Get all user-study evaluator configurations (the 3 models A/B/C) with computed model strings.

    Args:
        config_path: Path to the YAML configuration file

    Returns:
        List of evaluator configuration dictionaries with model_string added
    """
    config = load_config(config_path)
    evaluator_configs = config.get("evaluators", [])

    for evaluator_config in evaluator_configs:
        evaluator_config["model_string"] = build_model_string(
            evaluator_config.get("provider", "bedrock"),
            evaluator_config.get("model_id", ""),
            evaluator_config.get("use_converse", False)
        )
        evaluator_config["model_kwargs"] = get_model_kwargs(evaluator_config)
        setup_provider_env(evaluator_config)

    return evaluator_configs


def get_evaluator_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    """
    Get the evaluator configuration (model being evaluated) with computed model string.
    
    Args:
        config_path: Path to the YAML configuration file
        
    Returns:
        Evaluator configuration dictionary with model_string added
    """
    config = load_config(config_path)
    evaluator_config = config.get("evaluator", {})
    
    # Build the model string
    evaluator_config["model_string"] = build_model_string(
        evaluator_config.get("provider", "bedrock"),
        evaluator_config.get("model_id", ""),
        evaluator_config.get("use_converse", False)
    )
    
    # Get model kwargs
    evaluator_config["model_kwargs"] = get_model_kwargs(evaluator_config)
    
    # Set up provider environment
    setup_provider_env(evaluator_config)
    
    return evaluator_config


def get_evaluation_engine_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    """
    Get the evaluation engine configuration (judge model for scoring) with computed model string.
    
    Args:
        config_path: Path to the YAML configuration file
        
    Returns:
        Evaluation engine configuration dictionary with model_string added
    """
    config = load_config(config_path)
    engine_config = config.get("evaluation_engine", {})
    
    # Build the model string
    engine_config["model_string"] = build_model_string(
        engine_config.get("provider", "bedrock"),
        engine_config.get("model_id", ""),
        engine_config.get("use_converse", False)
    )
    
    # Get model kwargs
    engine_config["model_kwargs"] = get_model_kwargs(engine_config)
    
    # Set up provider environment
    setup_provider_env(engine_config)
    
    return engine_config


# ── Dynamic Inference Lab config helpers ──────────────────────────────

def get_orchestrator_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    """
    Get orchestrator configuration for the Dynamic Inference Lab.

    Returns dict with provider, model_id, display_name, and model_kwargs.
    """
    config = load_config(config_path)
    orch = dict(config.get("orchestrator", {}))
    orch["model_kwargs"] = get_model_kwargs(orch)
    return orch


def get_execution_model_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    """
    Get the single execution model configuration for the Dynamic Inference Lab.

    Returns a dict with ``model_string`` (LiteLLM-compatible) and ``model_kwargs``.
    """
    config = load_config(config_path)
    cfg = dict(config.get("execution_model", {}))

    cfg["model_string"] = build_model_string(
        cfg.get("provider", "bedrock"),
        cfg.get("model_id", ""),
        cfg.get("use_converse", False),
    )
    cfg["model_kwargs"] = get_model_kwargs(cfg)
    setup_provider_env(cfg)

    logger.info(f"Loaded execution model: {cfg.get('display_name', cfg.get('model_id'))}")
    return cfg


def get_agent_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    """Get agent loop settings (max_turns, max_concurrent, etc.)."""
    config = load_config(config_path)
    return config.get("agent", {"max_turns": 15, "max_concurrent": 5})