"""Rubric and scorecard domain models."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


ScoreInt = Annotated[int, Field(strict=True, ge=1, le=5)]


class InterpretationBand(BaseModel):
    """Interpretation band for weighted totals."""

    min: float = Field(ge=0.0, le=5.0)
    max: float = Field(ge=0.0, le=5.0)
    label: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_min_max(self) -> "InterpretationBand":
        if self.min > self.max:
            raise ValueError("interpretation band min cannot exceed max")
        return self


class Dimension(BaseModel):
    """A single weighted rubric dimension."""

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    section: Literal["A", "B", "C"]
    weight: float = Field(gt=0.0, le=1.0)
    formula: str = Field(min_length=1)
    levels: dict[int, str]

    @field_validator("levels")
    @classmethod
    def validate_levels(cls, value: dict[int, str]) -> dict[int, str]:
        expected = {1, 2, 3, 4, 5}
        actual = set(value.keys())
        if actual != expected:
            raise ValueError(f"levels must contain exactly keys {expected}, got {actual}")
        for level, text in value.items():
            if not isinstance(text, str) or not text.strip():
                raise ValueError(f"level {level} text must be non-empty")
        return value


class Rubric(BaseModel):
    """Versioned weighted rubric."""

    version: str = Field(min_length=1)
    max_score: float = Field(default=5.0, gt=0.0)
    dimensions: list[Dimension]
    interpretation_bands: list[InterpretationBand]

    @model_validator(mode="after")
    def validate_dimension_weights(self) -> "Rubric":
        total = sum(d.weight for d in self.dimensions)
        if abs(total - 1.0) > 0.0001:
            raise ValueError(f"dimension weights must sum to 1.0 (got {total})")
        if len(self.dimensions) != 9:
            raise ValueError(f"expected 9 dimensions, found {len(self.dimensions)}")
        ids = [d.id for d in self.dimensions]
        if len(ids) != len(set(ids)):
            raise ValueError("dimension ids must be unique")
        return self


class EvidenceQuote(BaseModel):
    """Evidence quote that grounds a score."""

    quote: str = Field(min_length=1)
    slide_id: str | None = None


class DimensionScore(BaseModel):
    """Scored result for one rubric dimension."""

    dimension_id: str = Field(min_length=1)
    score: ScoreInt
    evidence_quotes: list[EvidenceQuote] = Field(default_factory=list)
    slide_refs: list[str] = Field(default_factory=list)


class Scorecard(BaseModel):
    """Collection of dimension scores for a run."""

    run_id: str | None = None
    rubric_version: str | None = None
    map_title: str | None = None
    dimension_scores: list[DimensionScore]
    higher_intent_provided: bool = False

