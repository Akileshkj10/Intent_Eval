"""Acceptance tests for Phase 4 T2 structured response schema."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from intent_evaluator.llm.schema import LLMDimensionResponse


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "schemas" / "llm_dimension_response.json"
README_PATH = ROOT / "README.md"


def test_t2_schema_rejects_float_scores_and_empty_evidence_quotes() -> None:
    payload = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))

    score = payload["properties"]["score"]
    assert score["type"] == "integer"
    assert score["minimum"] == 1
    assert score["maximum"] == 5

    evidence_quotes = payload["properties"]["evidence_quotes"]
    assert evidence_quotes["type"] == "array"
    assert evidence_quotes["minItems"] == 1


def test_t2_pydantic_model_rejects_float_score() -> None:
    with pytest.raises(ValidationError):
        LLMDimensionResponse.model_validate(
            {
                "dimension_id": "clarity_outcome",
                "score": 4.2,
                "rationale": "Clear intent statement.",
                "evidence_quotes": [{"quote": "simplify where we must"}],
                "gaps": [],
                "improvements": [],
            }
        )


def test_t2_pydantic_model_rejects_empty_evidence_quotes() -> None:
    with pytest.raises(ValidationError):
        LLMDimensionResponse.model_validate(
            {
                "dimension_id": "clarity_outcome",
                "score": 4,
                "rationale": "Clear intent statement.",
                "evidence_quotes": [],
                "gaps": [],
                "improvements": [],
            }
        )


def test_t2_readme_documents_openai_and_anthropic_structured_modes() -> None:
    text = README_PATH.read_text(encoding="utf-8")
    assert "OpenAI structured output mode" in text
    assert "Anthropic structured JSON mode" in text
