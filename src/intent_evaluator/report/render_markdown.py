"""Render canonical evaluation report to Markdown."""

from __future__ import annotations

from intent_evaluator.report.schema import EvaluationReport


def _md_table(headers: list[str], rows: list[list[str]]) -> str:
    header_line = "| " + " | ".join(headers) + " |"
    divider = "| " + " | ".join(["---"] * len(headers)) + " |"
    body = ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join([header_line, divider, *body])


def render(report: EvaluationReport) -> str:
    """Render report model to markdown with canonical section order."""
    lines: list[str] = []

    # §1
    lines.append(f"# {report.report_title}")
    lines.append("")
    lines.append(f"- Run ID: `{report.run_id}`")
    lines.append(f"- Map Title: `{report.map_title}`")
    lines.append(f"- Rubric Version: `{report.rubric_version}`")
    lines.append(f"- Created At: `{report.created_at.isoformat()}`")
    lines.append("")

    # §2
    lines.append("## 2. Executive Summary")
    lines.append(report.executive_summary)
    lines.append("")

    # §3
    lines.append("## 3. Purpose of this briefing note")
    lines.append(report.purpose_of_briefing_note)
    lines.append("")

    # §4
    lines.append("## 4. Alignment of overall intent to Higher Intent (Q1)")
    lines.append(report.alignment_to_higher_intent or "[Not provided]")
    lines.append("")

    # §5
    lines.append("## 5. Dimension scores")
    dim_headers = ["Dimension", "Weight", "Score", "Weighted", "Evidence"]
    dim_rows: list[list[str]] = []
    for row in report.dimension_scores_table:
        evidence = "; ".join(
            [f"{e.quote} ({e.source_ref or 'n/a'})" for e in row.evidence]
        ) or "-"
        dim_rows.append(
            [
                row.dimension_name,
                f"{row.weight:.2f}",
                str(row.score),
                f"{row.weighted_score:.2f}",
                evidence,
            ]
        )
    lines.append(_md_table(dim_headers, dim_rows))
    lines.append("")

    # §6
    lines.append("## 6. Total weighted score")
    total_headers = ["Section", "Subtotal"]
    total_rows = [
        ["Section A — Core Clarity (40%)", f"{report.total_weighted_score_table.section_a_total:.2f}"],
        ["Section B — Alignment (30%)", f"{report.total_weighted_score_table.section_b_total:.2f}"],
        ["Section C — Supporting Qualities (30%)", f"{report.total_weighted_score_table.section_c_total:.2f}"],
        ["Total weighted score", f"{report.total_weighted_score_table.total_weighted_score:.2f}"],
        ["Interpretation", report.total_weighted_score_table.interpretation_band],
    ]
    lines.append(_md_table(total_headers, total_rows))
    lines.append("")

    # §7
    lines.append("## 7. Commentary by 5MAP/5QMA Question")
    lines.append(report.commentary_by_question_intro)
    lines.append("")

    # §8-§12
    question_sections = [
        ("8", "Q1 Context and Higher Intent", report.q1_context_and_higher_intent),
        ("9", "Q2 Intent and Measures of Success", report.q2_intent_and_measures_of_success),
        ("10", "Q3 Tasks and Main Effort", report.q3_tasks_and_main_effort),
        ("11", "Q4 Boundaries (Freedoms and Constraints)", report.q4_boundaries_freedoms_and_constraints),
        ("12", "Q5 Achievability & Back Brief Readiness", report.q5_achievability_and_backbrief_readiness),
    ]
    for idx, (number, heading, block) in enumerate(question_sections, start=1):
        lines.append(f"## {number}. {heading}")
        lines.append(f"- Score: {block.score if block.score is not None else '[PENDING LLM]'}")
        if report.question_subscores:
            question_key = f"q{idx}"
            lines.append(f"- Question subscore: {report.question_subscores.get(question_key, '[n/a]')}")
        lines.append(f"- Strengths: {block.strengths}")
        lines.append(f"- Gaps/risks: {block.gaps_risks}")
        lines.append(f"- Suggested improvements: {block.suggested_improvements}")
        lines.append("")

    # §13
    lines.append("## 13. Overall assessment")
    lines.append(report.overall_assessment)
    lines.append("")

    # §14
    lines.append("## 14. Appendix A. Scoring rationale")
    app_headers = ["Dimension ID", "Section", "Score", "Weighted", "Rationale"]
    app_rows = [
        [
            row.dimension_id,
            row.section,
            str(row.score),
            f"{row.weighted_score:.2f}",
            row.rationale,
        ]
        for row in report.appendix_a_scoring_rationale
    ]
    lines.append(_md_table(app_headers, app_rows))
    lines.append("")

    return "\n".join(lines).strip() + "\n"

