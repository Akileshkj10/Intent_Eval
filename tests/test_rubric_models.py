"""Phase 1 T1/T2 rubric model and loading tests."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from intent_evaluator.rubric.load import load_rubric
from intent_evaluator.rubric.models import DimensionScore


RUBRIC_PATH = (
    Path(__file__).resolve().parents[1]
    / "rubrics"
    / "weighted_rubric_v2025_12_01.json"
)


def test_load_rubric_returns_nine_dimensions() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    assert rubric.version == "weighted_rubric_v2025_12_01"
    assert len(rubric.dimensions) == 9


def test_rubric_weights_and_required_distribution() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    assert abs(sum(d.weight for d in rubric.dimensions) - 1.0) <= 0.0001
    weights = [d.weight for d in rubric.dimensions]
    assert weights.count(0.2) == 2
    assert weights.count(0.15) == 2
    assert weights.count(0.06) == 5


def test_each_dimension_has_non_empty_levels_1_to_5() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    for dimension in rubric.dimensions:
        assert set(dimension.levels.keys()) == {1, 2, 3, 4, 5}
        for level_text in dimension.levels.values():
            assert level_text.strip() != ""


@pytest.mark.parametrize("bad_score", [0, 6, 3.5])
def test_dimension_score_rejects_out_of_range_and_float(bad_score: float) -> None:
    with pytest.raises(ValidationError):
        DimensionScore(dimension_id="clarity_outcome", score=bad_score)

