"""Document parsing schemas for 5MAP inputs."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ParsedSlide(BaseModel):
    """Normalized slide content extracted from a source document."""

    slide_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    text: str = Field(min_length=1)
    notes: str | None = None


class FiveMapSections(BaseModel):
    """Sectionized 5MAP text blocks aligned to Q1-Q5."""

    q1_context: str = Field(min_length=1)
    q2_intent: str = Field(min_length=1)
    q3_tasks: str = Field(min_length=1)
    q4_boundaries: str = Field(min_length=1)
    q5_backbrief: str = Field(min_length=1)


class FiveMapDocument(BaseModel):
    """Normalized 5MAP/5QMA source document."""

    map_title: str = Field(min_length=1)
    source_filename: str = Field(min_length=1)
    slides: list[ParsedSlide] = Field(min_length=1)
    sections: FiveMapSections
    low_confidence_sections: bool = False


class HigherIntentDocument(BaseModel):
    """Optional higher-level intent document used for alignment checks."""

    title: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    slides: list[ParsedSlide] = Field(default_factory=list)

