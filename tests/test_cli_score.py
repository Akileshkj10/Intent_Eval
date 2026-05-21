"""CLI score command behavior tests for Phase 1 T6."""

from __future__ import annotations

import json
from pathlib import Path

from intent_evaluator.cli import main


ROOT = Path(__file__).resolve().parents[1]
GOLD_FIXTURE = ROOT / "fixtures" / "gold_simplification_scorecard.json"


def test_score_command_returns_zero_for_valid_scorecard(capsys) -> None:
    exit_code = main(["score", "--scorecard", str(GOLD_FIXTURE)])
    assert exit_code == 0
    output = capsys.readouterr().out
    parsed = json.loads(output)
    assert parsed["total_weighted_score"] >= 3.64
    assert parsed["total_weighted_score"] <= 3.80


def test_score_command_returns_nonzero_for_invalid_score(tmp_path: Path) -> None:
    bad_scorecard = {
        "map_title": "Bad Fixture",
        "rubric_version": "weighted_rubric_v2025_12_01",
        "dimension_scores": [{"dimension_id": "clarity_outcome", "score": 0}],
    }
    path = tmp_path / "bad_scorecard.json"
    path.write_text(json.dumps(bad_scorecard), encoding="utf-8")
    exit_code = main(["score", "--scorecard", str(path)])
    assert exit_code != 0

