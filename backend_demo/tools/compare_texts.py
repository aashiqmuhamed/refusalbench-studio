"""
compare_texts tool — computes similarity metrics between two texts.

Returns a JSON string with:
  - sequence_ratio: SequenceMatcher ratio (0-1)
  - token_overlap: Jaccard overlap of word tokens (0-1)
  - combined: average of the two
"""

import json
import re
from difflib import SequenceMatcher

SCHEMA = {
    "name": "compare_texts",
    "description": (
        "Compare two texts and return similarity scores. "
        "Returns sequence_ratio (edit-distance based), token_overlap "
        "(Jaccard word overlap), and combined (average of both). "
        "All scores range from 0.0 (completely different) to 1.0 (identical)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "text_a": {
                "type": "string",
                "description": "First text to compare."
            },
            "text_b": {
                "type": "string",
                "description": "Second text to compare."
            },
        },
        "required": ["text_a", "text_b"],
    },
}


def _normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _token_overlap(a: str, b: str) -> float:
    a_tokens = set(a.split())
    b_tokens = set(b.split())
    if not a_tokens or not b_tokens:
        return 0.0
    return len(a_tokens & b_tokens) / len(a_tokens | b_tokens)


async def execute(tool_input: dict, ctx: dict) -> str:
    """Compute similarity metrics between text_a and text_b."""
    a_norm = _normalize(tool_input["text_a"])
    b_norm = _normalize(tool_input["text_b"])

    ratio = SequenceMatcher(None, a_norm, b_norm).ratio()
    overlap = _token_overlap(a_norm, b_norm)
    combined = (ratio + overlap) / 2.0

    result = {
        "sequence_ratio": round(ratio, 4),
        "token_overlap": round(overlap, 4),
        "combined": round(combined, 4),
    }
    return json.dumps(result)
