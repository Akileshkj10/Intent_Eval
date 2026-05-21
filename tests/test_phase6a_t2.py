"""Acceptance tests for Phase 6.A T2 Streamlit text input pipeline."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.pipeline import create_session_output_dir, run_ui_pipeline, save_text_input_document


def test_p6a_t2_text_input_generates_report_without_upload() -> None:
    session_dir = create_session_output_dir("test_p6a_text_report")
    map_path = save_text_input_document(
        session_dir,
        q1_context="Context: the business needs clarity on why simplification matters.",
        q2_intent="Intent: reduce friction so capacity is released for growth.",
        q3_tasks="Tasks: identify blockers, sequence work, and assign accountable leads.",
        q4_boundaries="Boundaries: stay within policy, budget, compliance, and platform constraints.",
        q5_backbrief="Backbrief: confirm dependencies, assumptions, and escalation routes.",
    )

    result = run_ui_pipeline(map_path=map_path, session_dir=session_dir, use_llm=False)

    assert result["report_md_path"].exists()
    assert result["report_json_path"].exists()
    assert result["report_pdf_path"].exists()
    assert result["parsed_json_path"].exists()
    assert result["low_confidence_sections"] is False
    assert result["report_pdf_path"].read_bytes().startswith(b"%PDF-")


def test_p6a_t2_text_input_writes_only_inside_outputs_session() -> None:
    session_dir = create_session_output_dir("test_p6a_text_guard")
    map_path = save_text_input_document(session_dir, pasted_text="Q2: Intent only.")

    assert session_dir.resolve() in [map_path.resolve(), *map_path.resolve().parents]

    outside_session = Path(__file__).resolve().parents[1] / "fixtures"
    with pytest.raises(RuntimeError):
        save_text_input_document(outside_session, pasted_text="Q1: outside")


def test_p6a_t2_low_confidence_result_is_exposed_to_ui_pipeline() -> None:
    session_dir = create_session_output_dir("test_p6a_low_confidence")
    map_path = save_text_input_document(session_dir, pasted_text="This note has no Q labels.")

    result = run_ui_pipeline(map_path=map_path, session_dir=session_dir, use_llm=False)

    assert result["low_confidence_sections"] is True
