"""Acceptance checks for Phase 3 tasks T1 and T2."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from intent_evaluator.cli import main
from intent_evaluator.parsing.docling_adapter import parse_pptx
from intent_evaluator.parsing.schema import FiveMapDocument


ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"
PARSING_NOTES_PATH = ROOT / "docs" / "parsing_notes.md"
SPIKE_SCRIPT_PATH = ROOT / "scripts" / "spike_docling_pptx.py"


def test_t1_parsing_notes_has_findings_and_decision() -> None:
    text = PARSING_NOTES_PATH.read_text(encoding="utf-8")
    bullet_count = sum(1 for line in text.splitlines() if line.strip().startswith("- "))
    assert bullet_count >= 5
    assert "Docling as primary parser" in text
    assert "python-pptx as fallback" in text


def test_t1_spike_handles_empty_pptx_without_crashing(tmp_path: Path) -> None:
    empty_pptx = tmp_path / "empty.pptx"
    empty_pptx.write_bytes(b"")

    completed = subprocess.run(
        [sys.executable, str(SPIKE_SCRIPT_PATH), str(empty_pptx)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0
    assert "input_missing_or_empty" in completed.stdout


def test_t2_parse_pptx_supports_bootstrap_synthetic_json_path() -> None:
    parsed = parse_pptx(SYNTHETIC_MAP_PATH)
    assert isinstance(parsed, FiveMapDocument)
    assert parsed.map_title
    assert len(parsed.slides) >= 1

    for slide in parsed.slides:
        assert slide.text.strip() or (slide.notes and slide.notes.strip())


def test_t2_cli_parse_writes_parsed_json(tmp_path: Path) -> None:
    out_dir = tmp_path / "outputs"
    run_id = "phase3_t2"
    exit_code = main(
        [
            "parse",
            "--input",
            str(SYNTHETIC_MAP_PATH),
            "--out",
            str(out_dir),
            "--run-id",
            run_id,
        ]
    )
    assert exit_code == 0

    parsed_json_path = out_dir / run_id / "parsed.json"
    assert parsed_json_path.exists()
    payload = json.loads(parsed_json_path.read_text(encoding="utf-8"))
    validated = FiveMapDocument.model_validate(payload)
    assert validated.source_filename.endswith(".pptx")
