"""Phase 1 T3/T4 acceptance tests for score fixture and calculator."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from intent_evaluator.rubric.load import load_rubric
from intent_evaluator.rubric.models import Scorecard
from intent_evaluator.scoring.calculator import (
    interpretation_band,
    section_totals,
    total_weighted_score,
    weighted_contribution,
)


ROOT = Path(__file__).resolve().parents[1]
RUBRIC_PATH = ROOT / "rubrics" / "weighted_rubric_v2025_12_01.json"
GOLD_FIXTURE = ROOT / "fixtures" / "gold_simplification_scorecard.json"


def _load_gold_scorecard() -> Scorecard:
    with GOLD_FIXTURE.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return Scorecard.model_validate(payload)


def test_gold_fixture_loads_without_error() -> None:
    scorecard = _load_gold_scorecard()
    assert scorecard.map_title == "Simplification 5QMA"
    assert len(scorecard.dimension_scores) == 9


def test_gold_fixture_scores_match_reference_table() -> None:
    scorecard = _load_gold_scorecard()
    score_by_id = {d.dimension_id: d.score for d in scorecard.dimension_scores}
    assert score_by_id == {
        "clarity_outcome": 4,
        "clarity_purpose": 4,
        "alignment_higher_direction": 5,
        "alignment_tasks": 3,
        "conciseness": 3,
        "outcome_focused": 3,
        "decentralised_utility": 3,
        "testability": 3,
        "energy_engagement": 2,
    }


@pytest.mark.parametrize(
    ("dimension_id", "expected_weighted"),
    [
        ("clarity_outcome", 0.2),
        ("clarity_purpose", 0.2),
        ("alignment_higher_direction", 0.15),
        ("alignment_tasks", 0.15),
        ("conciseness", 0.06),
        ("outcome_focused", 0.06),
        ("decentralised_utility", 0.06),
        ("testability", 0.06),
        ("energy_engagement", 0.06),
    ],
)
def test_each_dimension_weight_matches_d12(
    dimension_id: str, expected_weighted: float
) -> None:
    rubric = load_rubric(RUBRIC_PATH)
    actual = next(d.weight for d in rubric.dimensions if d.id == dimension_id)
    assert actual == expected_weighted


def test_gold_fixture_total_and_section_totals() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    scorecard = _load_gold_scorecard()
    totals = section_totals(scorecard, rubric)
    assert totals == {"A": 1.6, "B": 1.2, "C": 0.84}
    total = total_weighted_score(scorecard, rubric)
    assert 3.64 <= total <= 3.80


def test_all_fives_and_all_ones_edge_totals() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    scorecard = _load_gold_scorecard()

    all_five = scorecard.model_copy(
        update={
            "dimension_scores": [
                item.model_copy(update={"score": 5}) for item in scorecard.dimension_scores
            ]
        }
    )
    all_one = scorecard.model_copy(
        update={
            "dimension_scores": [
                item.model_copy(update={"score": 1}) for item in scorecard.dimension_scores
            ]
        }
    )

    assert total_weighted_score(all_five, rubric) == 5.0
    assert total_weighted_score(all_one, rubric) == 1.0


def test_changing_one_dimension_only_changes_its_section() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    scorecard = _load_gold_scorecard()
    before = section_totals(scorecard, rubric)

    updated_scores = []
    for item in scorecard.dimension_scores:
        if item.dimension_id == "conciseness":
            updated_scores.append(item.model_copy(update={"score": 5}))
        else:
            updated_scores.append(item)

    updated = scorecard.model_copy(update={"dimension_scores": updated_scores})
    after = section_totals(updated, rubric)

    assert before["A"] == after["A"]
    assert before["B"] == after["B"]
    assert after["C"] == round(before["C"] + weighted_contribution("conciseness", 2, rubric), 2)


def test_interpretation_band_uses_rubric_bands() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    assert "Exceptional intent" in interpretation_band(4.5, rubric)
    assert "Strong; may benefit" in interpretation_band(4.1, rubric)
    assert "Adequate; usable" in interpretation_band(3.2, rubric)
    assert "Weak; intent" in interpretation_band(2.5, rubric)


def test_weighted_contribution_raises_unknown_dimension() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    with pytest.raises(KeyError):
        weighted_contribution("unknown_dimension", 3, rubric)

