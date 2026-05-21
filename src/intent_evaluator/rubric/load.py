"""Helpers for loading rubric configuration from disk."""

from __future__ import annotations

import json
from pathlib import Path

from intent_evaluator.rubric.models import Rubric


def load_rubric(path: str | Path) -> Rubric:
    """Load a rubric JSON file into a validated Rubric model."""
    rubric_path = Path(path)
    with rubric_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return Rubric.model_validate(payload)

