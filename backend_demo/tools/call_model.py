"""
call_model tool — sends a prompt to the execution model and returns its response.

This is the primary tool the orchestrator uses to interact with the model
being evaluated. Uses LiteLLM for provider-agnostic model access.
"""

import asyncio
import litellm
import logging

logger = logging.getLogger(__name__)

SCHEMA = {
    "name": "call_model",
    "description": (
        "Send a prompt to the execution model (the model being evaluated) "
        "and return its raw text response. Use this to ask the model questions, "
        "request drafts, request critiques, or any other LLM interaction needed "
        "by the evaluation workflow."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "The full prompt text to send to the execution model."
            },
            "temperature": {
                "type": "number",
                "description": (
                    "Sampling temperature (0.0-1.0). Higher values produce more "
                    "varied outputs. Default is 0.1 for deterministic behaviour."
                ),
            },
        },
        "required": ["prompt"],
    },
}


async def execute(tool_input: dict, ctx: dict) -> str:
    """Call the execution model via LiteLLM and return the response text."""
    model_id = ctx["execution_model_id"]
    base_kwargs = dict(ctx["execution_model_kwargs"])

    # Allow the orchestrator to override temperature
    temperature = tool_input.get("temperature")
    if temperature is not None:
        base_kwargs["temperature"] = temperature

    prompt = tool_input["prompt"]
    logger.info(f"call_model → {model_id} (temp={base_kwargs.get('temperature', '?')})")

    semaphore = ctx.get("semaphore")
    if semaphore:
        async with semaphore:
            response = await litellm.acompletion(
                model=model_id,
                messages=[{"role": "user", "content": prompt}],
                **base_kwargs,
            )
    else:
        response = await litellm.acompletion(
            model=model_id,
            messages=[{"role": "user", "content": prompt}],
            **base_kwargs,
        )

    result = response.choices[0].message.content.strip()
    logger.info(f"call_model ← {len(result)} chars")
    return result
