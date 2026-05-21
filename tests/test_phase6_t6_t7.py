"""Acceptance tests for Phase 6 tasks T6 and T7."""

from __future__ import annotations

from pathlib import Path

from intent_evaluator.cli import main


ROOT = Path(__file__).resolve().parents[1]
README_PATH = ROOT / "README.md"
PARSING_NOTES_PATH = ROOT / "docs" / "parsing_notes.md"
EVAL_DOC_PATH = ROOT / "docs" / "EVAL.md"
HANDOVER_DOC_PATH = ROOT / "docs" / "HANDOVER.md"
GOLD_SCORECARD_PATH = ROOT / "fixtures" / "gold_simplification_scorecard.json"
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"


def test_t6_synthetic_parse_confidence_or_override_documented() -> None:
    text = PARSING_NOTES_PATH.read_text(encoding="utf-8")
    assert "low_confidence_sections: false" in text


def test_t6_eval_doc_tracks_synthetic_baseline_and_real_followup() -> None:
    text = EVAL_DOC_PATH.read_text(encoding="utf-8")
    assert "Synthetic baseline (P6-T06)" in text
    assert "Real-input follow-up [AWAITING D15]" in text


def test_t7_readme_includes_required_onboarding_and_commands(tmp_path: Path) -> None:
    text = README_PATH.read_text(encoding="utf-8")
    assert "required before implementation work" in text
    assert "PRD -> ARCHITECTURE -> TASKMASTER" in text
    assert "pytest -m integration" in text
    assert "streamlit run app/streamlit_app.py" in text

    out_dir = tmp_path / "gold_quickstart"
    exit_code = main(
        [
            "report",
            "--scorecard",
            str(GOLD_SCORECARD_PATH),
            "--input",
            str(SYNTHETIC_MAP_PATH),
            "--out",
            str(out_dir),
        ]
    )
    assert exit_code == 0
    assert (out_dir / "report.md").exists()
    assert (out_dir / "run_manifest.json").exists()


def test_t7_handover_lists_d1_to_d16_and_phase7_items() -> None:
    text = HANDOVER_DOC_PATH.read_text(encoding="utf-8")
    for idx in range(1, 17):
        assert f"`D{idx}`" in text

    for task_id in [
        "P7-T01",
        "P7-T02",
        "P7-T03",
        "P7-T04",
        "P7-T05",
        "P7-T06",
        "P7-T07",
        "P7-T08",
    ]:
        assert task_id in text
