"""Acceptance tests for Phase 6.A pilot deployment and Mark testing docs."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEPLOYMENT_DOC = ROOT / "docs" / "DEPLOYMENT_PILOT.md"
MARK_GUIDE = ROOT / "docs" / "MARK_TESTING_GUIDE.md"
HANDOVER = ROOT / "docs" / "HANDOVER.md"


def test_p6a_t3_deployment_guide_includes_required_pilot_details() -> None:
    text = DEPLOYMENT_DOC.read_text(encoding="utf-8")
    assert "Host choice" in text
    assert "Required secrets" in text
    assert "streamlit run app/streamlit_app.py" in text
    assert "Rollback" in text
    assert "Data-handling warning" in text
    assert "Smoke test evidence" in text
    assert "Pending hosted deployment" in text


def test_p6a_t4_mark_testing_guide_has_steps_and_feedback_categories() -> None:
    text = MARK_GUIDE.read_text(encoding="utf-8")
    assert "not client self-service" in text
    assert "Upload file" in text
    assert "Paste text" in text
    assert "report.md" in text
    assert "report.json" in text
    assert "Bugs" in text
    assert "Scoring Calibration" in text
    assert "Wording / Tone" in text
    assert "Feature Requests" in text


def test_p6a_t4_handover_links_pilot_docs() -> None:
    text = HANDOVER.read_text(encoding="utf-8")
    assert "docs/DEPLOYMENT_PILOT.md" in text
    assert "docs/MARK_TESTING_GUIDE.md" in text
