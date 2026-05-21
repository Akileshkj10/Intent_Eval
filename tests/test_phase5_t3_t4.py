"""Acceptance tests for Phase 5 tasks T3 and T4."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from intent_evaluator.narrative.section_generator import generate_full_narrative
from intent_evaluator.report.assembler import build_report_skeleton
from intent_evaluator.report.render_markdown import render
from intent_evaluator.rubric.load import load_rubric
from intent_evaluator.rubric.models import Scorecard


ROOT = Path(__file__).resolve().parents[1]
RUBRIC_PATH = ROOT / "rubrics" / "weighted_rubric_v2025_12_01.json"
GOLD_SCORECARD_PATH = ROOT / "fixtures" / "gold_simplification_scorecard.json"
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"


class _NarrativeClient:
    def complete_structured(
        self, prompt: dict[str, str], schema: dict[str, Any], run_id: str = "run_pending"
    ) -> dict[str, Any]:
        _ = prompt
        _ = run_id
        if "text" in schema.get("properties", {}):
            return {"text": "Generated narrative section text with constructive recommendations."}
        if "question_subscore" in schema.get("properties", {}):
            return {
                "question_subscore": 4,
                "strengths": "Clear direction and coherent intent framing.",
                "gaps_risks": "Some measures are still broad and need sharper criteria.",
                "suggested_improvements": "Add explicit thresholds and accountability milestones.",
            }
        return {
            "strengths": "Clear direction and coherent intent framing.",
            "gaps_risks": "Some measures are still broad and need sharper criteria.",
            "suggested_improvements": "Add explicit thresholds and accountability milestones.",
        }


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _skeleton():
    rubric = load_rubric(RUBRIC_PATH)
    scorecard = Scorecard.model_validate(_load_json(GOLD_SCORECARD_PATH))
    from intent_evaluator.parsing.schema import FiveMapDocument

    map_doc = FiveMapDocument.model_validate(_load_json(SYNTHETIC_MAP_PATH))
    return build_report_skeleton(scorecard=scorecard, rubric=rubric, five_map_document=map_doc)


def _score_fields_snapshot(report_payload: dict[str, Any]) -> str:
    score_fields = {
        "dimension_scores_table": [
            {
                "dimension_id": row["dimension_id"],
                "score": row["score"],
                "weighted_score": row["weighted_score"],
            }
            for row in report_payload["dimension_scores_table"]
        ],
        "total_weighted_score_table": report_payload["total_weighted_score_table"],
    }
    return json.dumps(score_fields, sort_keys=True)


def test_t3_full_narrative_removes_pending_and_keeps_numeric_tables_unchanged() -> None:
    skeleton = _skeleton()
    before = skeleton.model_dump(mode="json")
    generated = generate_full_narrative(
        report_skeleton=skeleton,
        llm_client=_NarrativeClient(),
        run_id="p5_t3",
    )
    after = generated.model_dump(mode="json")

    assert "[PENDING LLM]" not in json.dumps(after)
    assert _score_fields_snapshot(before) == _score_fields_snapshot(after)
    for row in generated.appendix_a_scoring_rationale:
        assert row.rationale.strip()
        assert "[PENDING LLM]" not in row.rationale


def test_t4_question_subscores_excluded_from_total_and_rendered_in_markdown() -> None:
    skeleton = _skeleton()
    generated = generate_full_narrative(
        report_skeleton=skeleton,
        llm_client=_NarrativeClient(),
        run_id="p5_t4",
        enable_question_subscores=True,
    )
    payload = generated.model_dump(mode="json")
    assert payload["question_subscores"] == {"q1": 4, "q2": 4, "q3": 4, "q4": 4, "q5": 4}
    assert payload["total_weighted_score_table"]["total_weighted_score"] == 3.64

    md = render(generated)
    assert md.count("- Question subscore: 4") == 5
