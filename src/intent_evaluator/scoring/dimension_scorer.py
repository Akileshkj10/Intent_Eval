"""LLM-backed dimension scoring orchestration."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from intent_evaluator.llm.client import LLMClient
from intent_evaluator.llm.prompt_loader import load_dimension_prompt
from intent_evaluator.llm.schema import LLMDimensionResponse
from intent_evaluator.parsing.schema import FiveMapDocument, HigherIntentDocument
from intent_evaluator.rubric.models import DimensionScore, Rubric, Scorecard
from intent_evaluator.scoring.evidence_validator import validate_quote_exists


class EvidenceValidationError(RuntimeError):
    """Raised when evidence quotes cannot be validated after retry."""


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _schema_path() -> Path:
    return _project_root() / "schemas" / "llm_dimension_response.json"


def _dimension_context(
    dimension_id: str,
    map_doc: FiveMapDocument,
    higher_intent: HigherIntentDocument | None,
) -> str:
    q = map_doc.sections
    if dimension_id in {"clarity_outcome", "clarity_purpose"}:
        sections = {"q2_intent": q.q2_intent}
    elif dimension_id == "alignment_higher_direction":
        sections = {"q1_context": q.q1_context}
        if higher_intent:
            sections["higher_intent_summary"] = higher_intent.summary
    elif dimension_id == "alignment_tasks":
        sections = {"q2_intent": q.q2_intent, "q3_tasks": q.q3_tasks}
    elif dimension_id == "decentralised_utility":
        sections = {"q4_boundaries": q.q4_boundaries, "q5_backbrief": q.q5_backbrief}
    elif dimension_id == "testability":
        sections = {"q2_intent": q.q2_intent, "q5_backbrief": q.q5_backbrief}
    else:
        sections = {
            "q1_context": q.q1_context,
            "q2_intent": q.q2_intent,
            "q3_tasks": q.q3_tasks,
            "q4_boundaries": q.q4_boundaries,
            "q5_backbrief": q.q5_backbrief,
        }
    return json.dumps(sections, ensure_ascii=True, indent=2)


def _build_prompt(
    dimension_id: str,
    map_doc: FiveMapDocument,
    higher_intent: HigherIntentDocument | None,
    extra_instruction: str = "",
) -> dict[str, str]:
    prompt_spec = load_dimension_prompt(dimension_id)
    context_json = _dimension_context(dimension_id, map_doc, higher_intent)
    user = (
        f"Dimension: {dimension_id}\n"
        f"Map title: {map_doc.map_title}\n"
        f"Evaluate using only this provided context JSON:\n{context_json}\n"
        "Return strict JSON matching the schema."
    )
    if extra_instruction:
        user += f"\nAdditional instruction: {extra_instruction}"
    return {"system": str(prompt_spec["system"]), "user": user}


def _schema_payload() -> dict[str, Any]:
    with _schema_path().open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _evidence_valid(response: LLMDimensionResponse, map_doc: FiveMapDocument) -> bool:
    return all(validate_quote_exists(ev.quote, map_doc) for ev in response.evidence_quotes)


def score_dimension(
    dimension_id: str,
    map_doc: FiveMapDocument,
    higher_intent: HigherIntentDocument | None,
    rubric: Rubric,
    llm_client: Any | None = None,
    run_id: str = "run_pending",
) -> DimensionScore:
    """Score one rubric dimension with one evidence-validation retry."""
    if dimension_id not in {dimension.id for dimension in rubric.dimensions}:
        raise KeyError(f"Unknown rubric dimension: {dimension_id}")

    client = llm_client or LLMClient.from_settings()
    schema = _schema_payload()
    prompt = _build_prompt(dimension_id, map_doc, higher_intent)
    raw = client.complete_structured(prompt=prompt, schema=schema, run_id=run_id)
    parsed = LLMDimensionResponse.model_validate(raw)
    if not _evidence_valid(parsed, map_doc):
        retry_prompt = _build_prompt(
            dimension_id,
            map_doc,
            higher_intent,
            extra_instruction="Evidence quote must be exact substring from provided context.",
        )
        retry_raw = client.complete_structured(prompt=retry_prompt, schema=schema, run_id=run_id)
        parsed = LLMDimensionResponse.model_validate(retry_raw)
        if not _evidence_valid(parsed, map_doc):
            raise EvidenceValidationError(
                f"Evidence validation failed for {dimension_id} after retry."
            )

    return DimensionScore(
        dimension_id=parsed.dimension_id,
        score=parsed.score,
        evidence_quotes=parsed.evidence_quotes,
        slide_refs=[q.slide_id for q in parsed.evidence_quotes if q.slide_id],
    )


def score_all_dimensions(
    map_doc: FiveMapDocument,
    higher_intent: HigherIntentDocument | None,
    rubric: Rubric,
    llm_client: Any | None = None,
    run_id: str = "run_pending",
) -> Scorecard:
    """Score all nine dimensions sequentially and return a scorecard."""
    client = llm_client or LLMClient.from_settings()
    results: list[DimensionScore] = []
    for dimension in rubric.dimensions:
        print(f"Scoring dimension: {dimension.id}")
        results.append(
            score_dimension(
                dimension_id=dimension.id,
                map_doc=map_doc,
                higher_intent=higher_intent,
                rubric=rubric,
                llm_client=client,
                run_id=run_id,
            )
        )
    return Scorecard(
        run_id=run_id,
        rubric_version=rubric.version,
        map_title=map_doc.map_title,
        dimension_scores=results,
        higher_intent_provided=higher_intent is not None,
    )
