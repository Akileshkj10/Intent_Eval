"""Build deterministic report skeleton from score outputs (no LLM generation)."""

from __future__ import annotations

from datetime import datetime, timezone

from intent_evaluator.parsing.schema import FiveMapDocument, HigherIntentDocument
from intent_evaluator.report.schema import (
    AppendixRationaleRow,
    DimensionScoreRow,
    EvaluationReport,
    QuestionCommentary,
    TotalWeightedScoreTable,
)
from intent_evaluator.rubric.models import Rubric, Scorecard
from intent_evaluator.scoring.calculator import (
    interpretation_band,
    section_totals,
    total_weighted_score,
    weighted_contribution,
)


PENDING = "[PENDING LLM]"


def _build_question_block(label: str) -> QuestionCommentary:
    return QuestionCommentary(
        question_label=label,
        score=None,
        strengths=PENDING,
        gaps_risks=PENDING,
        suggested_improvements=PENDING,
    )


def build_report_skeleton(
    scorecard: Scorecard,
    rubric: Rubric,
    five_map_document: FiveMapDocument | None = None,
    higher_intent_document: HigherIntentDocument | None = None,
) -> EvaluationReport:
    """Build canonical report with deterministic tables and placeholder narrative."""
    dimension_lookup = {d.id: d for d in rubric.dimensions}
    rows: list[DimensionScoreRow] = []
    appendix_rows: list[AppendixRationaleRow] = []
    for item in scorecard.dimension_scores:
        dimension = dimension_lookup[item.dimension_id]
        weighted = weighted_contribution(item.dimension_id, item.score, rubric)
        evidence = []
        for ev in item.evidence_quotes:
            evidence.append({"quote": ev.quote, "source_ref": ev.slide_id})
        rows.append(
            DimensionScoreRow(
                dimension_id=item.dimension_id,
                dimension_name=dimension.name,
                weight=dimension.weight,
                score=item.score,
                weighted_score=weighted,
                evidence=evidence,
            )
        )
        appendix_rows.append(
            AppendixRationaleRow(
                dimension_id=item.dimension_id,
                section=dimension.section,
                score=item.score,
                weighted_score=weighted,
                rationale=PENDING,
                evidence=evidence,
            )
        )

    sections = section_totals(scorecard, rubric)
    total = total_weighted_score(scorecard, rubric)
    band = interpretation_band(total, rubric)
    total_table = TotalWeightedScoreTable(
        section_a_total=sections["A"],
        section_b_total=sections["B"],
        section_c_total=sections["C"],
        total_weighted_score=total,
        interpretation_band=band,
    )

    map_title = scorecard.map_title or (
        five_map_document.map_title if five_map_document else "Unknown 5MAP"
    )

    if higher_intent_document:
        alignment_text = PENDING
    elif scorecard.higher_intent_provided:
        alignment_text = PENDING
    else:
        alignment_text = None

    return EvaluationReport(
        run_id=scorecard.run_id or "run_pending",
        map_title=map_title,
        rubric_version=scorecard.rubric_version or rubric.version,
        created_at=datetime.now(timezone.utc),
        report_title="EVALUATION REPORT",
        executive_summary=PENDING,
        purpose_of_briefing_note=PENDING,
        alignment_to_higher_intent=alignment_text,
        dimension_scores_table=rows,
        total_weighted_score_table=total_table,
        commentary_by_question_intro=PENDING,
        q1_context_and_higher_intent=_build_question_block("Q1 Context and Higher Intent"),
        q2_intent_and_measures_of_success=_build_question_block(
            "Q2 Intent and Measures of Success"
        ),
        q3_tasks_and_main_effort=_build_question_block("Q3 Tasks and Main Effort"),
        q4_boundaries_freedoms_and_constraints=_build_question_block(
            "Q4 Boundaries (Freedoms and Constraints)"
        ),
        q5_achievability_and_backbrief_readiness=_build_question_block(
            "Q5 Achievability & Back Brief Readiness"
        ),
        overall_assessment=PENDING,
        appendix_a_scoring_rationale=appendix_rows,
    )

