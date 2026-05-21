"""Deterministic evidence-quote validation against parsed 5MAP content."""

from __future__ import annotations

import re
from difflib import SequenceMatcher

from intent_evaluator.parsing.schema import FiveMapDocument


def _normalize(text: str) -> str:
    """Normalize whitespace and casing for robust text matching."""
    lowered = text.casefold()
    collapsed = re.sub(r"\s+", " ", lowered)
    return collapsed.strip()


def _document_text(document: FiveMapDocument) -> str:
    parts: list[str] = [document.map_title]
    for slide in document.slides:
        parts.append(slide.title)
        parts.append(slide.text)
        if slide.notes:
            parts.append(slide.notes)
    parts.extend(
        [
            document.sections.q1_context,
            document.sections.q2_intent,
            document.sections.q3_tasks,
            document.sections.q4_boundaries,
            document.sections.q5_backbrief,
        ]
    )
    return _normalize(" ".join(parts))


def validate_quote_exists(
    quote: str, document: FiveMapDocument, threshold: float = 0.85
) -> bool:
    """Return True if quote is present (exact or high-similarity) in document text.

    Matching strategy:
    1) Exact normalized substring check.
    2) If no exact match, compare against sentence-like chunks with SequenceMatcher.
    """
    normalized_quote = _normalize(quote)
    if not normalized_quote:
        return False

    corpus = _document_text(document)
    if normalized_quote in corpus:
        return True

    # Fuzzy fallback over coarse chunks to handle punctuation/line-break differences.
    chunks = re.split(r"[.!?;:\n]+", corpus)
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        similarity = SequenceMatcher(None, normalized_quote, chunk).ratio()
        if similarity >= threshold:
            return True
    return False

