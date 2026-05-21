"""Phase 2 T1 schema acceptance tests."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from intent_evaluator.report.schema import EvaluationReport


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "schemas" / "evaluation_report.json"


def _sample_report_payload() -> dict:
    return {
        "run_id": "run-001",
        "map_title": "Sample 5QMA",
        "rubric_version": "weighted_rubric_v2025_12_01",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "report_title": "EVALUATION REPORT",
        "executive_summary": "Short summary.",
        "purpose_of_briefing_note": "Purpose text.",
        "alignment_to_higher_intent": "Aligned with higher direction.",
        "dimension_scores_table": [
            {
                "dimension_id": "clarity_outcome",
                "dimension_name": "Clarity of Outcome (What)",
                "weight": 0.2,
                "score": 4,
                "weighted_score": 0.8,
                "evidence": [{"quote": "Outcome text", "source_ref": "slide_2"}],
            }
        ],
        "total_weighted_score_table": {
            "section_a_total": 1.6,
            "section_b_total": 1.2,
            "section_c_total": 0.84,
            "total_weighted_score": 3.64,
            "interpretation_band": "Adequate; usable but requires improvement.",
        },
        "commentary_by_question_intro": "Commentary intro",
        "q1_context_and_higher_intent": {
            "question_label": "Q1 Context and Higher Intent",
            "score": 4,
            "strengths": "Good context.",
            "gaps_risks": "Needs more external context.",
            "suggested_improvements": "Add two-level alignment detail.",
        },
        "q2_intent_and_measures_of_success": {
            "question_label": "Q2 Intent and Measures of Success",
            "score": 3,
            "strengths": "Clear intent.",
            "gaps_risks": "KPIs not time-bound.",
            "suggested_improvements": "Add leading indicators with targets.",
        },
        "q3_tasks_and_main_effort": {
            "question_label": "Q3 Tasks and Main Effort",
            "score": 3,
            "strengths": "Tasks are phased.",
            "gaps_risks": "Main effort not explicit.",
            "suggested_improvements": "Define one main effort owner.",
        },
        "q4_boundaries_freedoms_and_constraints": {
            "question_label": "Q4 Boundaries",
            "score": 3,
            "strengths": "Some constraints listed.",
            "gaps_risks": "Decision rights unclear.",
            "suggested_improvements": "Specify local vs escalated decisions.",
        },
        "q5_achievability_and_backbrief_readiness": {
            "question_label": "Q5 Achievability & Back Brief",
            "score": 3,
            "strengths": "Assumptions considered.",
            "gaps_risks": "Dependencies are underspecified.",
            "suggested_improvements": "State critical dependencies and owners.",
        },
        "overall_assessment": "Overall adequate with clear improvement actions.",
        "appendix_a_scoring_rationale": [
            {
                "dimension_id": "clarity_outcome",
                "section": "A",
                "score": 4,
                "weighted_score": 0.8,
                "rationale": "Outcome is clear but broad.",
                "evidence": [{"quote": "Outcome text", "source_ref": "slide_2"}],
            }
        ],
    }


def test_evaluation_report_model_has_all_canonical_sections() -> None:
    payload = _sample_report_payload()
    report = EvaluationReport.model_validate(payload)
    assert report.report_title == "EVALUATION REPORT"
    assert report.executive_summary
    assert report.purpose_of_briefing_note
    assert report.dimension_scores_table
    assert report.total_weighted_score_table.total_weighted_score == 3.64
    assert report.q1_context_and_higher_intent.question_label.startswith("Q1")
    assert report.q5_achievability_and_backbrief_readiness.question_label.startswith("Q5")
    assert report.overall_assessment
    assert report.appendix_a_scoring_rationale


def test_exported_schema_file_exists_and_is_json() -> None:
    assert SCHEMA_PATH.exists()
    with SCHEMA_PATH.open("r", encoding="utf-8") as handle:
        schema = json.load(handle)
    assert "$defs" in schema
    assert "properties" in schema
    assert "key_strengths" in schema["properties"]
    assert "bottom_line" in schema["properties"]

