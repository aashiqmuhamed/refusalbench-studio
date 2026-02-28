"""
make_decision tool — terminal tool that finalises the workflow.

The orchestrator MUST call this exactly once to signal the end of the
evaluation workflow with a final decision (answer or refuse) and output text.
"""

SCHEMA = {
    "name": "make_decision",
    "description": (
        "Finalize the evaluation workflow with a decision. "
        "You MUST call this tool exactly once at the end of the workflow. "
        "Provide the final decision ('answer' if the model should answer, "
        "'refuse' if the model should refuse) and the final output text."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "decision": {
                "type": "string",
                "enum": ["answer", "refuse"],
                "description": (
                    "The final decision: 'answer' means the model's response "
                    "is grounded and should be accepted, 'refuse' means the "
                    "model should refuse because evidence is insufficient."
                ),
            },
            "output": {
                "type": "string",
                "description": (
                    "The final output text. For 'answer' decisions, this should "
                    "be the model's answer. For 'refuse' decisions, this should "
                    "be a refusal message."
                ),
            },
        },
        "required": ["decision", "output"],
    },
}


async def execute(tool_input: dict, ctx: dict) -> str:
    """Terminal tool — always returns 'OK'. Actual handling is in the orchestrator."""
    return "Decision recorded."
