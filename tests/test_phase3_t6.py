"""Acceptance tests for Phase 3 T6 report CLI parse integration."""

from __future__ import annotations

import json
from pathlib import Path

from intent_evaluator.cli import main
from intent_evaluator.parsing.schema import FiveMapDocument
from intent_evaluator.rubric.models import Scorecard
from intent_evaluator.scoring.evidence_validator import validate_quote_exists


ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"
GOLD_SCORECARD_PATH = ROOT / "fixtures" / "gold_simplification_scorecard.json"


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def test_t6_report_json_includes_source_map_hash_and_map_title(tmp_path: Path) -> None:
    out_dir = tmp_path / "report_from_input"
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

    payload = _load_json(out_dir / "report.json")
    assert payload["source_map_hash"]
    assert payload["map_title"] == "Simplification 5QMA (Synthetic Parsed Fixture)"


def test_t6_gold_scorecard_evidence_quotes_validate_against_synthetic_map() -> None:
    scorecard = Scorecard.model_validate(_load_json(GOLD_SCORECARD_PATH))
    map_doc = FiveMapDocument.model_validate(_load_json(SYNTHETIC_MAP_PATH))

    quotes: list[str] = []
    for dimension in scorecard.dimension_scores:
        for evidence in dimension.evidence_quotes:
            quotes.append(evidence.quote)
            assert validate_quote_exists(evidence.quote, map_doc) is True

    assert quotes, "Expected at least one evidence quote in gold scorecard fixture"
