"""Acceptance tests for Phase 2 T6 evidence validator."""

from __future__ import annotations

import json
from pathlib import Path

from intent_evaluator.parsing.schema import FiveMapDocument
from intent_evaluator.scoring.evidence_validator import validate_quote_exists


ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_5MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"


def _load_doc() -> FiveMapDocument:
    with SYNTHETIC_5MAP_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return FiveMapDocument.model_validate(payload)


def test_validator_returns_true_for_exact_substring() -> None:
    doc = _load_doc()
    quote = "simplify where we must so that capacity is released for growth"
    assert validate_quote_exists(quote, doc) is True


def test_validator_returns_false_for_nonexistent_quote() -> None:
    doc = _load_doc()
    quote = "this text does not exist in the map"
    assert validate_quote_exists(quote, doc) is False


def test_validator_handles_whitespace_and_case_normalization() -> None:
    doc = _load_doc()
    quote = "  WE WILL SIMPLIFY ACTIVITY,   PROCESSES, SYSTEMS, POLICY, GOVERNANCE "
    assert validate_quote_exists(quote, doc) is True

