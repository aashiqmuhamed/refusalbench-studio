"""
MultiEvaluator — User Study Multi-Model Evaluator for RefusalBench

Wraps AsyncRAGModelEvaluator to support 3 side-by-side evaluator models (A/B/C)
that all share the same evaluation engine (judge). The active model is selected by
tab_index (0 → evaluator_a, 1 → evaluator_b, 2 → evaluator_c), which the frontend
sends along with each evaluation request.
"""

import logging
from typing import Dict, Any

from refusalbench_classes.evaluator import AsyncRAGModelEvaluator

logger = logging.getLogger(__name__)


class MultiEvaluator:
    """
    Routes evaluation requests to one of three configured evaluator models based on
    a tab_index supplied by the frontend.  All models share the same evaluation engine
    (judge) so scoring is comparable across tabs.
    """

    def __init__(self):
        from config_loader import get_evaluators_config, get_evaluation_engine_config

        self.evaluator_configs: list = get_evaluators_config()
        self.engine_config: Dict[str, Any] = get_evaluation_engine_config()

        if not self.evaluator_configs:
            raise ValueError(
                "No evaluators found in config.yaml under the 'evaluators' key. "
                "Please add at least one evaluator."
            )

        logger.info(
            f"MultiEvaluator initialised with {len(self.evaluator_configs)} evaluators "
            f"and shared engine '{self.engine_config.get('display_name', self.engine_config.get('model_string'))}'"
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def run_for_tab(self, tab_index: int, entry: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run the evaluation pipeline for the evaluator model at *tab_index*.

        Args:
            tab_index: 0-based index into the ``evaluators`` list from config.yaml
                       (0 → Model A, 1 → Model B, 2 → Model C).
            entry: Dict with the perturbation fields expected by
                   AsyncRAGModelEvaluator.process_example:
                   ``perturbed_query``, ``perturbed_context``,
                   ``expected_rag_behavior``, ``original_answers`` (optional),
                   ``generator_model``, ``perturbation_class``, ``intensity``.

        Returns:
            Result dict from process_example, enriched with:
            ``tab_index``, ``evaluator_name``, ``evaluator_display_name``.
        """
        if tab_index < 0 or tab_index >= len(self.evaluator_configs):
            raise IndexError(
                f"tab_index {tab_index} is out of range — "
                f"only {len(self.evaluator_configs)} evaluators are configured."
            )

        evaluator_config = self.evaluator_configs[tab_index]
        evaluator_name = evaluator_config.get("name", f"evaluator_{tab_index}")
        evaluator_display_name = evaluator_config.get("display_name", f"Model {tab_index}")

        logger.info(
            f"Running evaluation for tab {tab_index} "
            f"({evaluator_name} / {evaluator_display_name})"
        )

        evaluator = AsyncRAGModelEvaluator(
            model_id=evaluator_config["model_string"],
            evaluator_engine_id=self.engine_config["model_string"],
            model_kwargs=evaluator_config.get("model_kwargs"),
            engine_kwargs=self.engine_config.get("model_kwargs"),
        )

        result = await evaluator.process_example(entry)

        result["tab_index"] = tab_index
        result["evaluator_name"] = evaluator_name
        result["evaluator_display_name"] = evaluator_display_name

        return result

    # ------------------------------------------------------------------
    # Introspection helpers (used by /config endpoint)
    # ------------------------------------------------------------------

    def get_tab_metadata(self) -> list:
        """Return blinded tab metadata suitable for the frontend config endpoint."""
        return [
            {
                "tab_index": i,
                "name": cfg.get("name", f"evaluator_{i}"),
                "display_name": cfg.get("display_name", f"Model {i}"),
            }
            for i, cfg in enumerate(self.evaluator_configs)
        ]
