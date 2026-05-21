"""Evaluation report schema.

Canonical mapping to D1 report sections:
- Section 8 -> q1_context_and_higher_intent
- Section 9 -> q2_intent_and_measures_of_success
- Section 10 -> q3_tasks_and_main_effort
- Section 11 -> q4_boundaries
- Section 12 -> q5_achievability_and_backbrief_readiness
"""

from __future__ import annotations

import warnings
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class EvidenceRef(BaseModel):
    """Evidence reference for table rows and rationales."""

    quote: str = Field(min_length=1)
    source_ref: str | None = None


class DimensionScoreRow(BaseModel):
    """One row in the dimension score table."""

    dimension_id: str = Field(min_length=1)
    dimension_name: str = Field(min_length=1)
    weight: float = Field(ge=0.0, le=1.0)
    score: int = Field(ge=1, le=5)
    weighted_score: float = Field(ge=0.0, le=5.0)
    evidence: list[EvidenceRef] = Field(default_factory=list)


class TotalWeightedScoreTable(BaseModel):
    """Section subtotals and overall weighted total."""

    section_a_total: float = Field(ge=0.0, le=2.0)
    section_b_total: float = Field(ge=0.0, le=1.5)
    section_c_total: float = Field(ge=0.0, le=1.5)
    total_weighted_score: float = Field(ge=0.0, le=5.0)
    interpretation_band: str = Field(min_length=1)


class QuestionCommentary(BaseModel):
    """Structured commentary block for each 5MAP question."""

    question_label: str = Field(min_length=1)
    score: int | None = Field(default=None, ge=1, le=5)
    strengths: str = Field(min_length=1)
    gaps_risks: str = Field(min_length=1)
    suggested_improvements: str = Field(min_length=1)


class AppendixRationaleRow(BaseModel):
    """Appendix A rationale row for one dimension."""

    dimension_id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    score: int = Field(ge=1, le=5)
    weighted_score: float = Field(ge=0.0, le=5.0)
    rationale: str = Field(min_length=1)
    evidence: list[EvidenceRef] = Field(default_factory=list)


class EvaluationReport(BaseModel):
    """Canonical evaluation report with required 14 sections."""

    # Metadata
    run_id: str = Field(min_length=1)
    map_title: str = Field(min_length=1)
    rubric_version: str = Field(min_length=1)
    created_at: datetime

    # §1 Evaluation report (title)
    report_title: str = Field(default="EVALUATION REPORT", min_length=1)

    # §2 Executive summary
    executive_summary: str = Field(min_length=1, max_length=2000)

    # §3 Purpose of briefing note
    purpose_of_briefing_note: str = Field(min_length=1)

    # §4 Alignment to higher intent
    alignment_to_higher_intent: str | None = None

    # §5 Dimension scores table
    dimension_scores_table: list[DimensionScoreRow] = Field(min_length=1)

    # §6 Total weighted score table
    total_weighted_score_table: TotalWeightedScoreTable

    # §7 Commentary introduction
    commentary_by_question_intro: str = Field(min_length=1)

    # §8-§12 Commentary by Q1-Q5
    q1_context_and_higher_intent: QuestionCommentary
    q2_intent_and_measures_of_success: QuestionCommentary
    q3_tasks_and_main_effort: QuestionCommentary
    q4_boundaries_freedoms_and_constraints: QuestionCommentary
    q5_achievability_and_backbrief_readiness: QuestionCommentary

    # §13 Overall assessment
    overall_assessment: str = Field(min_length=1)

    # §14 Appendix A
    appendix_a_scoring_rationale: list[AppendixRationaleRow] = Field(min_length=1)

    # Optional per-question subscores for commentary only; excluded from weighted total.
    question_subscores: dict[str, int] | None = Field(
        default=None,
        description="Optional commentary subscores (Q1-Q5). Excluded from total_weighted_score.",
    )

    # optional_legacy: true — appears in D8 example output but not canonical D1
    key_strengths: str | None = Field(
        default=None,
        description="optional_legacy: true",
    )
    # optional_legacy: true — appears in D8 example output but maps to overall assessment
    bottom_line: str | None = Field(
        default=None,
        description="optional_legacy: true",
    )

    @field_validator("executive_summary")
    @classmethod
    def warn_if_over_200_words(cls, value: str) -> str:
        word_count = len(value.split())
        if word_count > 200:
            warnings.warn(
                f"Executive summary has {word_count} words; target is <= 200 words.",
                stacklevel=2,
            )
        return value

    @model_validator(mode="after")
    def validate_question_subscores(self) -> "EvaluationReport":
        if self.question_subscores is None:
            return self
        expected_keys = {"q1", "q2", "q3", "q4", "q5"}
        actual_keys = set(self.question_subscores.keys())
        if actual_keys != expected_keys:
            raise ValueError(
                f"question_subscores must contain exactly keys {expected_keys}, got {actual_keys}"
            )
        for key, value in self.question_subscores.items():
            if not isinstance(value, int) or not (1 <= value <= 5):
                raise ValueError(f"question_subscores[{key}] must be int in range 1..5")
        return self

