"""
Tool registry — central place to get all tool schemas and dispatch tool calls.
"""

from tools import call_model, compare_texts, extract_quotes, make_decision

ALL_TOOL_MODULES = [
    call_model,
    compare_texts,
    extract_quotes,
    make_decision,
]


def get_tool_schemas() -> list:
    """Return list of Anthropic tool_use JSON schemas for all tools."""
    return [mod.SCHEMA for mod in ALL_TOOL_MODULES]


def get_tool_map() -> dict:
    """Return dict mapping tool name → async execute function."""
    return {mod.SCHEMA["name"]: mod.execute for mod in ALL_TOOL_MODULES}
