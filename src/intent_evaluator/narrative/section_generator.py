"""Section narrative generation over report skeleton."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from intent_evaluator.llm.client import LLMClient
from intent_evaluator.report.schema import EvaluationReport, QuestionCommentary


class ExecutiveSummaryTooLongError(RuntimeError):
    """Raised when executive summary remains >200 words after retry."""


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _section_prompt_path(name: str) -> Path:
    return _project_root() / "prompts" / "sections" / f"{name}.yaml"


def _load_prompt(name: str) -> dict[str, Any]:
    path = _section_prompt_path(name)
    with path.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"Section prompt YAML must be object: {path}")
    return payload


def _frozen_payload(report: EvaluationReport) -> dict[str, Any]:
    payload = report.model_dump(mode="json")
    # Explicitly isolate immutable numeric material used as scoring source.
    return {
        "run_id": payload["run_id"],
        "map_title": payload["map_title"],
        "rubric_version": payload["rubric_version"],
        "dimension_scores_table": payload["dimension_scores_table"],
        "total_weighted_score_table": payload["total_weighted_score_table"],
        "appendix_a_scoring_rationale": payload["appendix_a_scoring_rationale"],
    }


def _build_prompt(name: str, report: EvaluationReport, extra_instruction: str = "") -> dict[str, str]:
    spec = _load_prompt(name)
    frozen_json = json.dumps(_frozen_payload(report), ensure_ascii=True, indent=2)
    user = (
        f"Generate narrative section: {name}\n"
        "Input score artefacts are FROZEN and must not be modified.\n"
        f"Frozen artefacts JSON:\n{frozen_json}"
    )
    if extra_instruction:
        user += f"\nAdditional instruction: {extra_instruction}"
    return {"system": str(spec.get("system", "")), "user": user}


def _text_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["text"],
        "properties": {"text": {"type": "string", "minLength": 1}},
    }


def _question_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["strengths", "gaps_risks", "suggested_improvements"],
        "properties": {
            "strengths": {"type": "string", "minLength": 1},
            "gaps_risks": {"type": "string", "minLength": 1},
            "suggested_improvements": {"type": "string", "minLength": 1},
        },
    }


def _question_schema_with_subscore() -> dict[str, Any]:
    schema = _question_schema()
    schema["required"] = [
        "question_subscore",
        "strengths",
        "gaps_risks",
        "suggested_improvements",
    ]
    schema["properties"]["question_subscore"] = {"type": "integer", "minimum": 1, "maximum": 5}
    return schema


def generate_section(
    name: str,
    report_skeleton: EvaluationReport,
    llm_client: Any | None = None,
    run_id: str = "run_pending",
) -> str:
    """Generate free-text narrative for one section."""
    client = llm_client or LLMClient.from_settings()
    prompt = _build_prompt(name, report_skeleton)
    response = client.complete_structured(prompt=prompt, schema=_text_schema(), run_id=run_id)
    text = str(response["text"]).strip()
    if name != "executive_summary":
        return text

    if len(text.split()) <= 200:
        return text
    retry_prompt = _build_prompt(
        name,
        report_skeleton,
        extra_instruction="Rewrite to 200 words or fewer.",
    )
    retry = client.complete_structured(prompt=retry_prompt, schema=_text_schema(), run_id=run_id)
    retry_text = str(retry["text"]).strip()
    if len(retry_text.split()) > 200:
        raise ExecutiveSummaryTooLongError(
            f"Executive summary exceeds 200 words after retry ({len(retry_text.split())})."
        )
    return retry_text


def generate_question_commentary(
    name: str,
    report_skeleton: EvaluationReport,
    question_label: str,
    include_subscore: bool = False,
    llm_client: Any | None = None,
    run_id: str = "run_pending",
) -> QuestionCommentary:
    """Generate structured Q commentary with strengths/gaps/improvements."""
    client = llm_client or LLMClient.from_settings()
    prompt = _build_prompt(name, report_skeleton)
    schema = _question_schema_with_subscore() if include_subscore else _question_schema()
    response = client.complete_structured(prompt=prompt, schema=schema, run_id=run_id)
    return QuestionCommentary(
        question_label=question_label,
        score=int(response["question_subscore"]) if include_subscore else None,
        strengths=str(response["strengths"]).strip(),
        gaps_risks=str(response["gaps_risks"]).strip(),
        suggested_improvements=str(response["suggested_improvements"]).strip(),
    )


def _appendix_rationale_text(dimension_id: str, score: int, evidence_text: str) -> str:
    return (
        f"This score is {score} for {dimension_id}, based on evidence such as "
        f"\"{evidence_text}\" and aligned to the rubric criteria."
    )


def generate_full_narrative(
    report_skeleton: EvaluationReport,
    llm_client: Any | None = None,
    run_id: str = "run_pending",
    enable_question_subscores: bool = False,
) -> EvaluationReport:
    """Populate all narrative sections while preserving numeric score tables."""
    client = llm_client or LLMClient.from_settings()
    report = report_skeleton.model_copy(deep=True)

    report.executive_summary = generate_section(
        "executive_summary", report, llm_client=client, run_id=run_id
    )
    report.purpose_of_briefing_note = generate_section(
        "purpose", report, llm_client=client, run_id=run_id
    )
    report.alignment_to_higher_intent = generate_section(
        "alignment_to_higher_intent", report, llm_client=client, run_id=run_id
    )
    report.commentary_by_question_intro = (
        "Commentary below follows the 5MAP question sequence with strengths, gaps/risks, "
        "and targeted improvements."
    )
    report.overall_assessment = generate_section(
        "overall_assessment", report, llm_client=client, run_id=run_id
    )

    question_specs = [
        ("q1", "q1_commentary", "Q1 Context and Higher Intent", "q1_context_and_higher_intent"),
        (
            "q2",
            "q2_commentary",
            "Q2 Intent and Measures of Success",
            "q2_intent_and_measures_of_success",
        ),
        ("q3", "q3_commentary", "Q3 Tasks and Main Effort", "q3_tasks_and_main_effort"),
        (
            "q4",
            "q4_commentary",
            "Q4 Boundaries (Freedoms and Constraints)",
            "q4_boundaries_freedoms_and_constraints",
        ),
        (
            "q5",
            "q5_commentary",
            "Q5 Achievability & Back Brief Readiness",
            "q5_achievability_and_backbrief_readiness",
        ),
    ]
    question_subscores: dict[str, int] = {}
    for key, prompt_name, label, attr in question_specs:
        block = generate_question_commentary(
            name=prompt_name,
            report_skeleton=report,
            question_label=label,
            include_subscore=enable_question_subscores,
            llm_client=client,
            run_id=run_id,
        )
        if enable_question_subscores and block.score is not None:
            question_subscores[key] = block.score
        setattr(report, attr, block)

    if enable_question_subscores:
        report.question_subscores = question_subscores

    appendix_rows = []
    for row in report.appendix_a_scoring_rationale:
        evidence_text = row.evidence[0].quote if row.evidence else "no direct quote provided"
        updated = row.model_copy(
            update={"rationale": _appendix_rationale_text(row.dimension_id, row.score, evidence_text)}
        )
        appendix_rows.append(updated)
    report.appendix_a_scoring_rationale = appendix_rows
    return report
