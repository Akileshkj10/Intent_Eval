"""Structured LLM response models for per-dimension scoring."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from intent_evaluator.rubric.models import EvidenceQuote, ScoreInt


class LLMDimensionResponse(BaseModel):
    """Strict response contract for one dimension scoring call."""

    dimension_id: str = Field(min_length=1)
    score: ScoreInt
    rationale: str = Field(min_length=1)
    evidence_quotes: list[EvidenceQuote] = Field(min_length=1)
    gaps: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)

    @field_validator("gaps", "improvements")
    @classmethod
    def validate_nonempty_entries(cls, value: list[str]) -> list[str]:
        for item in value:
            if not item.strip():
                raise ValueError("list entries must be non-empty")
        return value
