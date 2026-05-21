"""Acceptance tests for Phase 6.A T1 text-input parser support."""

from __future__ import annotations

from pathlib import Path

from intent_evaluator.parsing import FiveMapDocument, parse_pptx, parse_text_input


LABELED_TEXT = """
Q1: Context is changing because the business must simplify how work gets done while preserving customer trust.
Q2: My intent is to remove avoidable friction so teams release capacity for growth and transformation at pace.
Q3: Teams will identify blockers, prioritise the highest-friction processes, and assign accountable leads.
Q4: Local teams may redesign processes within budget, compliance, and shared-platform constraints.
Q5: The plan depends on change capacity, cross-team cooperation, and clear escalation routes for trade-offs.
"""


def test_p6a_t1_labeled_text_produces_valid_fivemap_document() -> None:
    doc = parse_text_input(text=LABELED_TEXT)

    assert isinstance(doc, FiveMapDocument)
    assert doc.source_filename == "manual_text_input.txt"
    assert doc.low_confidence_sections is False
    assert doc.sections.q1_context.startswith("Context is changing")
    assert doc.sections.q5_backbrief.startswith("The plan depends")
    assert [slide.slide_id for slide in doc.slides] == [
        "manual_text_q1",
        "manual_text_q2",
        "manual_text_q3",
        "manual_text_q4",
        "manual_text_q5",
    ]


def test_p6a_t1_missing_labels_set_low_confidence() -> None:
    doc = parse_text_input(
        text="""
Q1: Context exists.
Q2: Intent exists.
Q3: Tasks exist.
"""
    )

    assert doc.low_confidence_sections is True
    assert "[LOW CONFIDENCE]" in doc.sections.q4_boundaries
    assert "[LOW CONFIDENCE]" in doc.sections.q5_backbrief


def test_p6a_t1_minimum_text_file_parse_is_low_confidence(tmp_path: Path) -> None:
    text_path = tmp_path / "manual_case.txt"
    text_path.write_text("A rough intent note without Q labels.", encoding="utf-8")

    doc = parse_pptx(text_path)

    assert doc.source_filename == "manual_case.txt"
    assert doc.low_confidence_sections is True
    assert "rough intent note" in doc.sections.q2_intent
