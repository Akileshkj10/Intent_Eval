"""Acceptance checks for Phase 3 task T4."""

from __future__ import annotations

import json
from pathlib import Path

from intent_evaluator.cli import main
from intent_evaluator.parsing.docling_adapter import parse_higher_intent
from intent_evaluator.parsing.schema import HigherIntentDocument


ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"
SYNTHETIC_HIGHER_INTENT_PATH = ROOT / "fixtures" / "synthetic_higher_intent.json"
ARCHITECTURE_PATH = ROOT / "docs" / "ARCHITECTURE.md"


def test_t4_parse_higher_intent_returns_valid_document() -> None:
    parsed = parse_higher_intent(SYNTHETIC_HIGHER_INTENT_PATH)
    assert isinstance(parsed, HigherIntentDocument)
    assert parsed.title.strip()
    assert parsed.summary.strip()
    assert len(parsed.slides) >= 1


def test_t4_cli_parse_includes_higher_intent_in_combined_output(tmp_path: Path) -> None:
    out_dir = tmp_path / "outputs"
    run_id = "phase3_t4"
    exit_code = main(
        [
            "parse",
            "--input",
            str(SYNTHETIC_MAP_PATH),
            "--higher-intent",
            str(SYNTHETIC_HIGHER_INTENT_PATH),
            "--out",
            str(out_dir),
            "--run-id",
            run_id,
            "--cache-dir",
            str(tmp_path / "cache" / "parsed"),
        ]
    )
    assert exit_code == 0

    combined_path = out_dir / run_id / "combined.json"
    payload = json.loads(combined_path.read_text(encoding="utf-8"))
    assert payload["five_map_document"]["map_title"]
    assert payload["higher_intent_document"] is not None
    assert payload["higher_intent_document"]["title"]


def test_t4_architecture_documents_q1_only_fallback() -> None:
    text = ARCHITECTURE_PATH.read_text(encoding="utf-8")
    assert "alignment analysis defaults to Q1 context text only" in text
