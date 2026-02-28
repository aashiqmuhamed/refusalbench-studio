"""
Dynamic Orchestrator — runs a tool-use agent loop with Claude as the
orchestrator and the configured execution model as the target.

The orchestrator reads a natural language workflow description, then
autonomously calls tools (call_model, compare_texts, extract_quotes,
make_decision) to execute the described evaluation workflow step by step.
"""

import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

# Workaround: pydantic-core 2.27.x rejects by_alias=None (expects bool).
# The Anthropic SDK passes None internally, triggering:
#   "argument 'by_alias': 'NoneType' object cannot be converted to 'PyBool'"
# Patch BaseModel.model_dump to coerce None → False before it hits Rust.
import pydantic as _pydantic
_original_model_dump = _pydantic.BaseModel.model_dump

def _safe_model_dump(self: _pydantic.BaseModel, **kwargs):  # type: ignore[override]
    for _bool_arg in ("by_alias", "exclude_unset", "exclude_defaults", "exclude_none"):
        if _bool_arg in kwargs and kwargs[_bool_arg] is None:
            kwargs[_bool_arg] = False
    return _original_model_dump(self, **kwargs)

_pydantic.BaseModel.model_dump = _safe_model_dump  # type: ignore[assignment]

import anthropic
from tools.registry import get_tool_schemas, get_tool_map
from config_loader import load_config
config = load_config()
max_turns = config.get("max_turns", 15)
logger = logging.getLogger(__name__)

# Few-shot examples of workflow descriptions to help the orchestrator
WORKFLOW_EXAMPLES = """
Here are five example evaluation workflows for reference:

EXAMPLE 1 — RefusalBench Baseline:
"Call the model with the exact prompt template provided (which includes {query}
and {context} placeholders). The template instructs the model to answer using
ONLY the context, or respond with a REFUSE_* code (e.g. REFUSE_AMBIGUOUS_QUERY,
REFUSE_INFO_MISSING_IN_CONTEXT, etc.) if a faithful answer is impossible.
Substitute {query} with the actual perturbed query and {context} with the actual
perturbed context. Return the model's raw response. If the response contains any
REFUSE_* code, mark decision as 'refuse'. Otherwise mark as 'answer'."

EXAMPLE 2 — Custom Prompt:
"The user has provided a specific prompt template delimited by
---BEGIN PROMPT TEMPLATE--- and ---END PROMPT TEMPLATE--- markers.
Substitute {query} with the actual perturbed query and {context} with the actual
perturbed context in the template. Call the model with the resulting prompt.
Return the model's raw response. If the model refuses or says it cannot answer,
mark decision as 'refuse'. Otherwise mark as 'answer'."

EXAMPLE 3 — Self-Correction:
"First, draft an answer to the question using the provided context.
Then, ask the model whether the draft answer is explicitly supported by the context (answer YES or NO).
If YES, check if the draft actually answers the question directly OR if it instead explains why the question cannot be answered (e.g., points out false premises, contradictions, missing information, or ambiguity).
- If the draft directly answers the question without hedging or explaining problems, return it as the final answer (decision: answer).
- If the draft explains why the question is problematic, contains false premises, has contradictions, or cannot be answered, refuse (decision: refuse).
- If the draft contains refusal language (e.g., 'cannot determine', 'insufficient information', 'not clear', 'unable to answer'), refuse (decision: refuse).
If NO, refuse (decision: refuse)."

EXAMPLE 4 — Evidence-First:
"Extract verbatim quotes from the context that directly answer the question.
If no relevant quotes are found, refuse immediately. If quotes are found,
compose an answer using ONLY those quotes. Return the answer."

EXAMPLE 5 — Consistency Checker:
"Generate 3 independent answers to the question at high temperature (0.7).
Compare each pair of answers for similarity. If all pairs have a combined
similarity score >= 0.7, the answers are consistent — return the first one.
If any pair disagrees (score < 0.7), the model is uncertain — refuse."
""".strip()

SYSTEM_PROMPT = f"""You are an evaluation workflow orchestrator for a RAG (Retrieval-Augmented Generation) system.

Your job is to execute a user-described evaluation workflow step by step using the provided tools.

## Important Rules
1. The model you call via `call_model` is the MODEL BEING EVALUATED — you are the orchestrator, not the model under test.
2. Follow the user's workflow description precisely. Execute each step they describe. Do not deviate from the workflow description. Do not add any additional steps or  assume any additional information.
3. You MUST call `make_decision` exactly once at the end to finalize the workflow.
4. Build up a clear chain of reasoning. Each tool call should correspond to a logical step.
5. If the workflow requires multiple model calls (e.g. sampling at different temperatures), make them sequentially. Do not parallelize LLM calls.
6. When comparing texts, use the `compare_texts` tool for quantitative similarity.
7. For extracting quotes, you can use either `extract_quotes` (heuristic) or `call_model` (LLM-based).
8. When the workflow includes a prompt template with `{{query}}` and `{{context}}` placeholders, substitute them with the PERTURBED QUERY and PERTURBED CONTEXT provided below, then pass the full substituted prompt to `call_model`.

## Available Tools
- `call_model(prompt, temperature)` — call the execution model
- `compare_texts(text_a, text_b)` — compute similarity scores
- `extract_quotes(text, query)` — extract relevant quotes heuristically
- `make_decision(decision, output)` — finalize with "answer" or "refuse"

## Workflow Examples
{WORKFLOW_EXAMPLES}

Now execute the workflow the user describes. Think through each step carefully. You have {max_turns} turns to execute the workflow. Do not exceed this limit."""


class DynamicOrchestrator:
    """
    Runs a tool-use agent loop with the Anthropic SDK.

    The orchestrator model (Claude) reads a workflow description and
    autonomously calls tools to execute it, building a trace of each step.
    """

    def __init__(
        self,
        orchestrator_provider: str,
        orchestrator_model_id: str,
        orchestrator_kwargs: Dict[str, Any],
        execution_model_id: str,
        execution_model_kwargs: Dict[str, Any],
        max_turns: int = 15,
        max_concurrent: int = 5,
    ):
        self.orchestrator_model_id = orchestrator_model_id
        self.orchestrator_kwargs = orchestrator_kwargs
        self.max_turns = max_turns

        # Build execution context passed to every tool
        self.ctx: Dict[str, Any] = {
            "execution_model_id": execution_model_id,
            "execution_model_kwargs": execution_model_kwargs,
            "semaphore": asyncio.Semaphore(max_concurrent),
        }

        # Initialize the appropriate Anthropic client based on provider
        if orchestrator_provider == "bedrock":
            self.client = anthropic.AsyncAnthropicBedrock(
                aws_region=os.environ.get("AWS_REGION_NAME", "us-east-1"),
            )
        else:
            # Direct Anthropic API
            self.client = anthropic.AsyncAnthropic()

        self.tool_map = get_tool_map()
        self.tool_schemas = get_tool_schemas()

    async def run(
        self,
        query: str,
        context: str,
        workflow_description: str,
    ) -> Dict[str, Any]:
        """
        Execute a dynamic evaluation workflow.

        Args:
            query: The perturbed query to evaluate.
            context: The perturbed context document.
            workflow_description: Natural language description of the
                evaluation workflow to execute.

        Returns:
            Dict with keys: final_output, final_decision, workflow, trace
        """
        trace: List[Dict[str, Any]] = []

        user_message = (
            f"Execute the following evaluation workflow:\n\n"
            f"WORKFLOW DESCRIPTION:\n{workflow_description}\n\n"
            f"---\n\n"
            f"PERTURBED QUERY:\n{query}\n\n"
            f"PERTURBED CONTEXT:\n{context}"
        )

        #Create a messages list in Anthropic Chat Format
        messages: List[Dict[str, Any]] = [
            {"role": "user", "content": user_message}
        ]

        final_decision = "refuse"
        final_output = "Workflow did not produce a decision."

        for turn in range(self.max_turns):
            logger.info(f"Orchestrator turn {turn + 1}/{self.max_turns}")

            try:
                response = await self.client.messages.create(
                    model=self.orchestrator_model_id,
                    max_tokens=self.orchestrator_kwargs.get("max_tokens", 4096),
                    temperature=self.orchestrator_kwargs.get("temperature", 0.1),
                    system=SYSTEM_PROMPT,
                    tools=self.tool_schemas,
                    messages=messages,
                )
            except Exception as e:
                logger.error(f"Orchestrator API error: {e}")
                trace.append({
                    "step": "error",
                    "output": f"Orchestrator error: {str(e)}",
                })
                break

            # The Anthropic API returns response.content as a list of content blocks — these can be TextBlock (the model's reasoning/thinking) or ToolUseBlock (tool call requests). This section iterates over all blocks, extracts any text, joins them together, and appends them to the trace as a "reasoning" step. This captures the model's chain-of-thought.
            assistant_text_parts = []
            for block in response.content:
                if hasattr(block, "text"):
                    assistant_text_parts.append(block.text)

            if assistant_text_parts:
                reasoning_text = "\n".join(assistant_text_parts)
                trace.append({
                    "step": "reasoning",
                    "output": reasoning_text,
                })

            # If the model stopped without calling a tool, we're done
            if response.stop_reason != "tool_use":
                logger.info("Orchestrator stopped without tool_use")
                # Try to extract a decision from the text
                if assistant_text_parts:
                    final_output = "\n".join(assistant_text_parts)
                break

            # Process tool calls
            tool_results = []
            should_return = False

            for block in response.content:
                if block.type != "tool_use":
                    continue

                tool_name = block.name
                tool_input = block.input
                logger.info(f"Tool call: {tool_name}")

                # Handle terminal make_decision tool
                if tool_name == "make_decision":
                    final_decision = tool_input.get("decision", "refuse")
                    final_output = tool_input.get(
                        "output",
                        "I cannot answer this based on the provided documents."
                        if final_decision == "refuse"
                        else "No output provided.",
                    )
                    trace.append({
                        "step": "decision",
                        "decision": final_decision,
                        "output": final_output,
                    })

                    # Still need to return a tool_result so the API is happy
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": "Decision recorded.",
                    })
                    should_return = True
                    continue

                # Execute non-terminal tool
                if tool_name not in self.tool_map:
                    error_msg = f"Unknown tool: {tool_name}"
                    logger.warning(error_msg)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": error_msg,
                        "is_error": True,
                    })
                    trace.append({
                        "step": tool_name,
                        "output": error_msg,
                    })
                    continue

                try:
                    result = await self.tool_map[tool_name](tool_input, self.ctx)
                except Exception as e:
                    error_msg = f"Tool execution error: {str(e)}"
                    logger.error(error_msg)
                    result = error_msg
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": error_msg,
                        "is_error": True,
                    })
                    trace.append({
                        "step": tool_name,
                        "output": error_msg,
                    })
                    continue

                # Record in trace
                trace_entry: Dict[str, Any] = {
                    "step": tool_name,
                    "output": result,
                }
                if "prompt" in tool_input:
                    trace_entry["prompt"] = tool_input["prompt"]
                if "temperature" in tool_input:
                    trace_entry["temperature"] = tool_input["temperature"]

                trace.append(trace_entry)

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

            # Serialize assistant content blocks to plain dicts before
            # appending — avoids Pydantic by_alias serialization bug
            serialized_content = []
            for block in response.content:
                if block.type == "text":
                    serialized_content.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    serialized_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })

            # Append assistant response and tool results to conversation
            messages.append({"role": "assistant", "content": serialized_content})
            messages.append({"role": "user", "content": tool_results})

            if should_return:
                logger.info(f"Workflow complete: decision={final_decision}")
                return {
                    "final_output": final_output,
                    "final_decision": final_decision,
                    "workflow": "custom",
                    "trace": trace,
                }

        # Fallback if we exhausted max_turns without a make_decision call
        logger.warning("Max turns reached without make_decision — forcing refuse")
        if not any(s.get("step") == "decision" for s in trace):
            trace.append({
                "step": "decision",
                "decision": final_decision,
                "output": final_output,
            })

        return {
            "final_output": final_output,
            "final_decision": final_decision,
            "workflow": "custom",
            "trace": trace,
        }