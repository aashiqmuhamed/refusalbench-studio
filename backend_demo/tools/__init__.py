"""
Tools module for the Dynamic Inference Lab orchestrator.

Each tool module exposes:
  - SCHEMA: dict   — Anthropic tool_use JSON schema
  - execute(tool_input, ctx) -> str — async function that runs the tool
"""
