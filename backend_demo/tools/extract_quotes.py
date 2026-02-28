"""
extract_quotes tool — extracts verbatim quotes from text that are relevant
to a given query.

This is a utility tool that helps evidence-based workflows. It performs
lightweight heuristic extraction (not LLM-based) — the orchestrator can
also use call_model for LLM-based extraction if preferred.
"""

import json
import re

SCHEMA = {
    "name": "extract_quotes",
    "description": (
        "Extract verbatim quotes from a text that are relevant to a query. "
        "Returns a JSON array of extracted quote strings. Uses heuristic "
        "sentence-level matching. For LLM-based extraction, use call_model instead."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "text": {
                "type": "string",
                "description": "The source text to extract quotes from."
            },
            "query": {
                "type": "string",
                "description": "The query/question to find relevant quotes for."
            },
        },
        "required": ["text", "query"],
    },
}


def _split_sentences(text: str) -> list:
    """Split text into sentences."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if s.strip()]


def _relevance_score(sentence: str, query: str) -> float:
    """Simple word-overlap relevance between a sentence and query."""
    s_words = set(sentence.lower().split())
    q_words = set(query.lower().split())
    # Remove stopwords-ish short words
    q_words = {w for w in q_words if len(w) > 2}
    if not q_words:
        return 0.0
    return len(s_words & q_words) / len(q_words)


async def execute(tool_input: dict, ctx: dict) -> str:
    """Extract relevant quotes from text based on query."""
    text = tool_input["text"]
    query = tool_input["query"]

    sentences = _split_sentences(text)
    scored = [(s, _relevance_score(s, query)) for s in sentences]
    # Keep sentences with at least 20% keyword overlap
    relevant = [s for s, score in scored if score >= 0.2]

    # If nothing found, return empty
    if not relevant:
        return json.dumps({"quotes": [], "found": False})

    return json.dumps({"quotes": relevant[:5], "found": True})
