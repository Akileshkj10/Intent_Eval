"""Docling-backed parser adapter for 5MAP/5QMA PPTX inputs."""

from __future__ import annotations

import json
import re
from pathlib import Path

from intent_evaluator.parsing.schema import (
    FiveMapDocument,
    FiveMapSections,
    HigherIntentDocument,
    ParsedSlide,
)


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower())
    return cleaned.strip("_") or "untitled"


def _split_markdown_blocks(markdown: str) -> list[tuple[str, str]]:
    """Split markdown into (heading, body) blocks."""
    blocks: list[tuple[str, str]] = []
    current_title = "Slide 1"
    current_lines: list[str] = []

    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if line.startswith("#"):
            if current_lines:
                body = "\n".join(current_lines).strip()
                blocks.append((current_title, body))
                current_lines = []
            current_title = line.lstrip("#").strip() or "Untitled"
            continue
        current_lines.append(raw_line)

    if current_lines:
        body = "\n".join(current_lines).strip()
        blocks.append((current_title, body))

    if not blocks:
        blocks.append(("Slide 1", markdown.strip()))
    return blocks


def _assign_sections(slides: list[ParsedSlide]) -> tuple[FiveMapSections, bool]:
    """Map slide text into Q1-Q5 sections using D4 keyword heuristics.

    Rules derived from D4 (`5MAP Coaching Guide Release 5.0.pdf`):
    - Q1 Context: titles/text mentioning "context", "higher intent", "Q1"
    - Q2 Intent: titles/text mentioning "intent", "measures", "Q2"
    - Q3 Tasks: titles/text mentioning "tasks", "main effort", "Q3"
    - Q4 Boundaries: titles/text mentioning "boundaries", "freedoms", "constraints", "Q4"
    - Q5 Backbrief: titles/text mentioning "backbrief", "achievability", "Q5"
    """
    buckets: dict[str, list[str]] = {key: [] for key in ("q1", "q2", "q3", "q4", "q5")}

    for slide in slides:
        combined = f"{slide.title}\n{slide.text}\n{slide.notes or ''}".casefold()
        body = slide.text.strip()
        matched = False

        if any(token in combined for token in ("q1", "context", "higher intent")):
            buckets["q1"].append(body)
            matched = True
        if any(token in combined for token in ("q2", "intent", "measures of success", "measures")):
            buckets["q2"].append(body)
            matched = True
        if any(token in combined for token in ("q3", "tasks", "main effort", "implied tasks")):
            buckets["q3"].append(body)
            matched = True
        if any(token in combined for token in ("q4", "boundaries", "freedoms", "constraints")):
            buckets["q4"].append(body)
            matched = True
        if any(token in combined for token in ("q5", "backbrief", "achievability", "back brief")):
            buckets["q5"].append(body)
            matched = True

        # If no section label was inferred, default this content to Q2 intent narrative.
        if not matched:
            buckets["q2"].append(body)

    low_confidence = any(len(parts) == 0 for parts in buckets.values())
    if low_confidence:
        all_text = "\n\n".join(slide.text for slide in slides if slide.text.strip())
        return (
            FiveMapSections(
                q1_context="[LOW CONFIDENCE] Section boundaries unclear in source deck.",
                q2_intent=all_text or "No parsable slide content found.",
                q3_tasks="[LOW CONFIDENCE] Section boundaries unclear in source deck.",
                q4_boundaries="[LOW CONFIDENCE] Section boundaries unclear in source deck.",
                q5_backbrief="[LOW CONFIDENCE] Section boundaries unclear in source deck.",
            ),
            True,
        )

    return (
        FiveMapSections(
            q1_context="\n\n".join(buckets["q1"]),
            q2_intent="\n\n".join(buckets["q2"]),
            q3_tasks="\n\n".join(buckets["q3"]),
            q4_boundaries="\n\n".join(buckets["q4"]),
            q5_backbrief="\n\n".join(buckets["q5"]),
        ),
        False,
    )


_TEXT_SECTION_META = {
    "q1": ("q1_context", "Q1 Context and Higher Intent"),
    "q2": ("q2_intent", "Q2 Intent and Measures of Success"),
    "q3": ("q3_tasks", "Q3 Tasks and Main Effort"),
    "q4": ("q4_boundaries", "Q4 Boundaries"),
    "q5": ("q5_backbrief", "Q5 Achievability and Backbrief"),
}


def _extract_labeled_text_sections(text: str) -> dict[str, str]:
    """Extract Q1-Q5 blocks from pasted consultant text."""
    pattern = re.compile(
        r"(?ims)(?:^|\n)\s*(q[1-5])\s*(?:[-:\).]|—)\s*(.*?)(?=(?:\n\s*q[1-5]\s*(?:[-:\).]|—)\s*)|\Z)"
    )
    sections: dict[str, str] = {}
    for match in pattern.finditer(text.strip()):
        key = match.group(1).casefold()
        body = match.group(2).strip()
        if body:
            sections[key] = body
    return sections


def parse_text_input(
    text: str | None = None,
    *,
    q1_context: str = "",
    q2_intent: str = "",
    q3_tasks: str = "",
    q4_boundaries: str = "",
    q5_backbrief: str = "",
    map_title: str = "Manual Text 5MAP",
    source_filename: str = "manual_text_input.txt",
) -> FiveMapDocument:
    """Convert pasted or field-based 5MAP text into a `FiveMapDocument`.

    The preferred contract is either a single block labelled `Q1:` through `Q5:`
    or five separate text fields. Missing labels are surfaced via
    `low_confidence_sections` rather than hidden.
    """
    labeled_sections = _extract_labeled_text_sections(text or "") if text else {}
    field_sections = {
        "q1": q1_context.strip(),
        "q2": q2_intent.strip(),
        "q3": q3_tasks.strip(),
        "q4": q4_boundaries.strip(),
        "q5": q5_backbrief.strip(),
    }
    sections_by_q = {
        key: (field_sections[key] or labeled_sections.get(key, "")).strip()
        for key in _TEXT_SECTION_META
    }

    combined_text = "\n\n".join(
        value for value in [text or "", *field_sections.values()] if value.strip()
    ).strip()
    low_confidence = any(not value for value in sections_by_q.values())
    placeholder = "[LOW CONFIDENCE] Section boundaries unclear in text input."
    section_payload = {
        field_name: sections_by_q[key] or (combined_text if key == "q2" and combined_text else placeholder)
        for key, (field_name, _title) in _TEXT_SECTION_META.items()
    }

    slides: list[ParsedSlide] = []
    if low_confidence and combined_text and not any(sections_by_q.values()):
        slides.append(
            ParsedSlide(
                slide_id="manual_text_input",
                title="Manual Text Input",
                text=combined_text,
                notes="Low confidence: Q1-Q5 labels were not detected.",
            )
        )
    else:
        for key, value in sections_by_q.items():
            if value:
                _field_name, title = _TEXT_SECTION_META[key]
                slides.append(
                    ParsedSlide(
                        slide_id=f"manual_text_{key}",
                        title=title,
                        text=value,
                        notes=None,
                    )
                )

    if not slides:
        slides.append(
            ParsedSlide(
                slide_id="manual_text_input",
                title="Manual Text Input",
                text=placeholder,
                notes="No usable 5MAP text was supplied.",
            )
        )

    return FiveMapDocument(
        map_title=map_title,
        source_filename=source_filename,
        slides=slides,
        sections=FiveMapSections(**section_payload),
        low_confidence_sections=low_confidence,
    )


def _parse_from_text_file(path: Path) -> FiveMapDocument:
    return parse_text_input(
        text=path.read_text(encoding="utf-8"),
        map_title=path.stem or "Manual Text 5MAP",
        source_filename=path.name,
    )


def _parse_from_json(path: Path) -> FiveMapDocument:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return FiveMapDocument.model_validate(payload)


def _parse_higher_intent_from_json(path: Path) -> HigherIntentDocument:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return HigherIntentDocument.model_validate(payload)


def _parse_docling_slides(source: Path) -> list[ParsedSlide]:
    if source.suffix.lower() != ".pptx":
        raise ValueError(f"Unsupported input format: {source.suffix}. Expected .pptx")

    if not source.exists() or source.stat().st_size == 0:
        raise ValueError(f"PPTX file is missing or empty: {source}")

    try:
        from docling.document_converter import DocumentConverter
    except ImportError as exc:  # pragma: no cover - environment-dependent
        raise RuntimeError("Docling is not installed. Run `pip install -e .[dev]`.") from exc

    converter = DocumentConverter()
    result = converter.convert(str(source))
    markdown = result.document.export_to_markdown().strip()
    if not markdown:
        raise ValueError(f"No parseable content returned by Docling for: {source}")

    blocks = _split_markdown_blocks(markdown)
    slides: list[ParsedSlide] = []
    for index, (title, body) in enumerate(blocks, start=1):
        normalized_title = title.strip() or f"Slide {index}"
        normalized_text = body.strip() or f"[No body text] {normalized_title}"
        slides.append(
            ParsedSlide(
                slide_id=f"slide_{index}_{_slugify(normalized_title)}",
                title=normalized_title,
                text=normalized_text,
                notes=None,
            )
        )
    return slides


def parse_pptx(path: str | Path) -> FiveMapDocument:
    """Parse a `.pptx` into `FiveMapDocument`.

    During development (until D15 sample decks are available), this adapter also
    accepts a synthetic parsed JSON file path and validates it into `FiveMapDocument`.
    """
    source = Path(path)
    if source.suffix.lower() == ".json":
        return _parse_from_json(source)
    if source.suffix.lower() == ".txt":
        return _parse_from_text_file(source)

    slides = _parse_docling_slides(source)

    sections, low_confidence = _assign_sections(slides)
    return FiveMapDocument(
        map_title=source.stem,
        source_filename=source.name,
        slides=slides,
        sections=sections,
        low_confidence_sections=low_confidence,
    )


def parse_higher_intent(path: str | Path) -> HigherIntentDocument:
    """Parse optional higher-intent input into `HigherIntentDocument`."""
    source = Path(path)
    if source.suffix.lower() == ".json":
        return _parse_higher_intent_from_json(source)

    slides = _parse_docling_slides(source)
    summary = " ".join(slide.text.strip() for slide in slides if slide.text.strip()).strip()
    return HigherIntentDocument(
        title=slides[0].title if slides else source.stem,
        summary=summary or f"Higher intent parsed from {source.name}",
        slides=slides,
    )
