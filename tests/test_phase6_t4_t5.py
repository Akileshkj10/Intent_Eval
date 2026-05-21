"""Acceptance tests for Phase 6 tasks T4 and T5."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from intent_evaluator.cli import main


ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"
GOLD_SCORECARD_PATH = ROOT / "fixtures" / "gold_simplification_scorecard.json"
CALIBRATION_DOC_PATH = ROOT / "docs" / "CALIBRATION_SESSION.md"
CONSULTANT_TEMPLATE_PATH = ROOT / "eval" / "consultant_scores_template.csv"


def _footer_value(md_text: str, key: str) -> str:
    prefix = f"- {key}: `"
    for line in md_text.splitlines():
        if line.startswith(prefix):
            return line.removeprefix(prefix).removesuffix("`")
    raise AssertionError(f"Missing footer key: {key}")


def test_t4_prompt_manifest_hash_is_identical_for_same_input_and_config(tmp_path: Path) -> None:
    out_a = tmp_path / "run_a"
    out_b = tmp_path / "run_b"
    exit_a = main(
        [
            "report",
            "--scorecard",
            str(GOLD_SCORECARD_PATH),
            "--input",
            str(SYNTHETIC_MAP_PATH),
            "--out",
            str(out_a),
        ]
    )
    exit_b = main(
        [
            "report",
            "--scorecard",
            str(GOLD_SCORECARD_PATH),
            "--input",
            str(SYNTHETIC_MAP_PATH),
            "--out",
            str(out_b),
        ]
    )
    assert exit_a == 0
    assert exit_b == 0

    md_a = (out_a / "report.md").read_text(encoding="utf-8")
    md_b = (out_b / "report.md").read_text(encoding="utf-8")
    hash_a = _footer_value(md_a, "prompt_manifest_hash")
    hash_b = _footer_value(md_b, "prompt_manifest_hash")
    assert hash_a == hash_b


def test_t4_run_manifest_documents_all_nine_dimension_prompt_versions(tmp_path: Path) -> None:
    out_dir = tmp_path / "manifest_case"
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
    payload = json.loads((out_dir / "run_manifest.json").read_text(encoding="utf-8"))
    prompts = [item for item in payload["prompt_versions"] if item["id"] != "__manifest__"]
    assert len(prompts) == 9


def test_t5_calibration_doc_lists_required_resolution_questions() -> None:
    text = CALIBRATION_DOC_PATH.read_text(encoding="utf-8")
    assert "subscores per Q" in text
    assert "D8-inspired extra sections" in text
    assert "DOCX timing" in text


def test_t5_consultant_csv_has_nine_rows_and_comments_column() -> None:
    with CONSULTANT_TEMPLATE_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        headers = reader.fieldnames or []
    assert "comments" in headers
    assert len(rows) == 9
