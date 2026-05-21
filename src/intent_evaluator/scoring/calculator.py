"""Deterministic weighted score calculations."""

from __future__ import annotations

from typing import Dict

from intent_evaluator.rubric.models import Rubric, Scorecard


def _dimension_lookup(rubric: Rubric) -> dict[str, object]:
    return {dimension.id: dimension for dimension in rubric.dimensions}


def weighted_contribution(dimension_id: str, score: int, rubric: Rubric) -> float:
    """Calculate weighted contribution for a dimension."""
    by_id = _dimension_lookup(rubric)
    if dimension_id not in by_id:
        raise KeyError(f"unknown dimension_id: {dimension_id}")
    dimension = by_id[dimension_id]
    return round(score * dimension.weight, 2)


def section_totals(scorecard: Scorecard, rubric: Rubric) -> Dict[str, float]:
    """Calculate subtotal for sections A/B/C."""
    by_id = _dimension_lookup(rubric)
    totals = {"A": 0.0, "B": 0.0, "C": 0.0}
    for item in scorecard.dimension_scores:
        dimension = by_id[item.dimension_id]
        totals[dimension.section] += item.score * dimension.weight
    return {section: round(value, 2) for section, value in totals.items()}


def total_weighted_score(scorecard: Scorecard, rubric: Rubric) -> float:
    """Calculate total weighted score (max 5.0)."""
    total = 0.0
    for item in scorecard.dimension_scores:
        total += weighted_contribution(item.dimension_id, item.score, rubric)
    return round(total, 2)


def interpretation_band(total: float, rubric: Rubric) -> str:
    """Return interpretation label for weighted score total."""
    for band in rubric.interpretation_bands:
        if band.min <= total <= band.max:
            return band.label
    raise ValueError(f"no interpretation band found for total score: {total}")

