"""Acceptance tests for Phase 2 T2 and T3."""

from __future__ import annotations

import json
from pathlib import Path

from intent_evaluator.parsing.schema import FiveMapDocument, HigherIntentDocument
from intent_evaluator.report.assembler import build_report_skeleton
from intent_evaluator.rubric.load import load_rubric
from intent_evaluator.rubric.models import Scorecard


ROOT = Path(__file__).resolve().parents[1]
RUBRIC_PATH = ROOT / "rubrics" / "weighted_rubric_v2025_12_01.json"
GOLD_SCORECARD_PATH = ROOT / "fixtures" / "gold_simplification_scorecard.json"
SYNTHETIC_5MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"
SYNTHETIC_HIGHER_INTENT_PATH = ROOT / "fixtures" / "synthetic_higher_intent.json"


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _load_scorecard() -> Scorecard:
    return Scorecard.model_validate(_load_json(GOLD_SCORECARD_PATH))


def _load_5map() -> FiveMapDocument:
    return FiveMapDocument.model_validate(_load_json(SYNTHETIC_5MAP_PATH))


def _load_higher_intent() -> HigherIntentDocument:
    return HigherIntentDocument.model_validate(_load_json(SYNTHETIC_HIGHER_INTENT_PATH))


def test_t2_five_map_document_loads() -> None:
    document = _load_5map()
    assert document.map_title
    assert len(document.slides) >= 5


def test_t2_each_q_section_has_at_least_100_characters() -> None:
    document = _load_5map()
    sections = document.sections
    assert len(sections.q1_context) >= 100
    assert len(sections.q2_intent) >= 100
    assert len(sections.q3_tasks) >= 100
    assert len(sections.q4_boundaries) >= 100
    assert len(sections.q5_backbrief) >= 100


def test_t2_gold_evidence_slide_ids_exist_in_fixture() -> None:
    document = _load_5map()
    slide_ids = {slide.slide_id for slide in document.slides}
    referenced = {
        "5QMA Simplification# | PowerPoint",
        "Intent for...kshop.pptx",
        "Consolidat...ap_v1.pptx",
    }
    assert referenced.issubset(slide_ids)


def test_t2_higher_intent_fixture_loads() -> None:
    higher = _load_higher_intent()
    assert higher.title
    assert len(higher.summary) > 20


def test_t3_report_skeleton_has_correct_numeric_tables_and_band() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    scorecard = _load_scorecard()
    report = build_report_skeleton(scorecard, rubric, _load_5map(), _load_higher_intent())

    assert report.total_weighted_score_table.section_a_total == 1.6
    assert report.total_weighted_score_table.section_b_total == 1.2
    assert report.total_weighted_score_table.section_c_total == 0.84
    assert 3.64 <= report.total_weighted_score_table.total_weighted_score <= 3.80
    assert report.total_weighted_score_table.interpretation_band == (
        "Adequate; usable but requires improvement."
    )


def test_t3_all_14_sections_present_in_serialized_json() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    report = build_report_skeleton(_load_scorecard(), rubric, _load_5map(), _load_higher_intent())
    payload = report.model_dump(mode="json")

    expected_keys = {
        "report_title",  # §1
        "executive_summary",  # §2
        "purpose_of_briefing_note",  # §3
        "alignment_to_higher_intent",  # §4
        "dimension_scores_table",  # §5
        "total_weighted_score_table",  # §6
        "commentary_by_question_intro",  # §7
        "q1_context_and_higher_intent",  # §8
        "q2_intent_and_measures_of_success",  # §9
        "q3_tasks_and_main_effort",  # §10
        "q4_boundaries_freedoms_and_constraints",  # §11
        "q5_achievability_and_backbrief_readiness",  # §12
        "overall_assessment",  # §13
        "appendix_a_scoring_rationale",  # §14
    }
    assert expected_keys.issubset(payload.keys())


def test_t3_dimension_table_fields_are_not_llm_generated() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    report = build_report_skeleton(_load_scorecard(), rubric, _load_5map(), _load_higher_intent())
    first = report.dimension_scores_table[0]
    # Deterministic values should come from scorecard + rubric and never use placeholders.
    assert first.dimension_id != "[PENDING LLM]"
    assert first.dimension_name != "[PENDING LLM]"
    assert isinstance(first.weight, float)
    assert isinstance(first.score, int)
    assert isinstance(first.weighted_score, float)

