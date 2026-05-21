"""Local-only UI pipeline helpers for Streamlit demo."""

from __future__ import annotations

import contextlib
import io
import json
import textwrap
import uuid
from datetime import datetime, timezone
from pathlib import Path

from intent_evaluator.eval.run_manifest import (
    append_report_footer,
    build_run_manifest,
    write_run_manifest,
)
from intent_evaluator.llm.client import LLMClient
from intent_evaluator.cli import main as cli_main
from intent_evaluator.parsing import parse_higher_intent, parse_pptx, parse_text_input
from intent_evaluator.parsing.schema import FiveMapDocument
from intent_evaluator.report.assembler import build_report_skeleton
from intent_evaluator.report.render_markdown import render as render_markdown
from intent_evaluator.report.schema import EvaluationReport, QuestionCommentary
from intent_evaluator.rubric.load import load_rubric
from intent_evaluator.rubric.models import Scorecard
from intent_evaluator.scoring.calculator import interpretation_band, section_totals, total_weighted_score
from intent_evaluator.scoring.dimension_scorer import score_all_dimensions


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def outputs_root() -> Path:
    return project_root() / "outputs"


def _default_rubric_path() -> Path:
    return project_root() / "rubrics" / "weighted_rubric_v2025_12_01.json"


def _file_sha256(path: Path) -> str:
    import hashlib

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def create_session_output_dir(session_id: str | None = None) -> Path:
    safe_session = session_id or f"ui_{uuid.uuid4().hex[:12]}"
    out_dir = outputs_root() / safe_session
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


def save_uploaded_bytes(session_dir: Path, filename: str, content: bytes) -> Path:
    target = session_dir / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return target


def save_text_input_document(
    session_dir: Path,
    *,
    pasted_text: str = "",
    q1_context: str = "",
    q2_intent: str = "",
    q3_tasks: str = "",
    q4_boundaries: str = "",
    q5_backbrief: str = "",
) -> Path:
    """Convert UI text input into parsed JSON inside the session output folder."""
    _assert_within_outputs(session_dir)
    doc = parse_text_input(
        text=pasted_text,
        q1_context=q1_context,
        q2_intent=q2_intent,
        q3_tasks=q3_tasks,
        q4_boundaries=q4_boundaries,
        q5_backbrief=q5_backbrief,
    )
    target = session_dir / "manual_text_input.parsed.json"
    _assert_within_outputs(target)
    target.write_text(doc.model_dump_json(indent=2), encoding="utf-8")
    return target


def _assert_within_outputs(path: Path) -> None:
    root = outputs_root().resolve()
    resolved = path.resolve()
    if root not in [resolved, *resolved.parents]:
        raise RuntimeError(f"Path escapes outputs directory: {resolved}")


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _wrap_pdf_lines(markdown: str, width: int = 92) -> list[str]:
    lines: list[str] = []
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if not line:
            lines.append("")
            continue
        if line.startswith("#"):
            line = line.lstrip("#").strip().upper()
        wrapped = textwrap.wrap(line, width=width, replace_whitespace=False) or [""]
        lines.extend(wrapped)
    return lines


def _build_text_pdf(markdown: str) -> bytes:
    """Build a simple text-only PDF from report markdown without external binaries."""
    lines = _wrap_pdf_lines(markdown)
    lines_per_page = 52
    pages = [lines[index : index + lines_per_page] for index in range(0, len(lines), lines_per_page)]
    if not pages:
        pages = [[""]]

    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",  # Filled after page object numbers are known.
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    page_object_numbers: list[int] = []

    for page_lines in pages:
        content_lines = ["BT", "/F1 10 Tf", "50 790 Td", "14 TL"]
        for line in page_lines:
            safe = _pdf_escape(line).encode("latin-1", errors="replace").decode("latin-1")
            content_lines.append(f"({safe}) Tj")
            content_lines.append("T*")
        content_lines.append("ET")
        content = "\n".join(content_lines).encode("latin-1", errors="replace")
        stream = b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n" + content + b"\nendstream"
        content_obj_num = len(objects) + 1
        objects.append(stream)
        page_obj_num = len(objects) + 1
        page_object_numbers.append(page_obj_num)
        page = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_obj_num} 0 R >>"
        ).encode("ascii")
        objects.append(page)

    kids = " ".join(f"{number} 0 R" for number in page_object_numbers)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_numbers)} >>".encode("ascii")

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii"))
        output.extend(obj)
        output.extend(b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    return bytes(output)


def write_report_pdf(report_md_path: Path) -> Path:
    """Write a simple PDF version beside `report.md`."""
    pdf_path = report_md_path.with_suffix(".pdf")
    _assert_within_outputs(pdf_path)
    markdown = report_md_path.read_text(encoding="utf-8")
    pdf_path.write_bytes(_build_text_pdf(markdown))
    return pdf_path


def _question_block(label: str, text: str, score: int | None = None) -> QuestionCommentary:
    clipped = text.strip()
    if len(clipped) > 420:
        clipped = clipped[:417].rstrip() + "..."
    return QuestionCommentary(
        question_label=label,
        score=score,
        strengths=f"Source text provides usable material for {label}: {clipped}",
        gaps_risks="Review the scored dimensions and evidence table for the main quality gaps.",
        suggested_improvements="Sharpen wording, decision rights, measures of success, and evidence where the score is below 4.",
    )


def _populate_fast_narrative(report: EvaluationReport, map_doc: FiveMapDocument) -> EvaluationReport:
    total = report.total_weighted_score_table.total_weighted_score
    band = report.total_weighted_score_table.interpretation_band
    low_rows = [row for row in report.dimension_scores_table if row.score < 3]
    high_rows = [row for row in report.dimension_scores_table if row.score >= 4]
    low_text = ", ".join(row.dimension_name for row in low_rows) or "no dimensions below 3"
    high_text = ", ".join(row.dimension_name for row in high_rows) or "no dimensions at 4 or above"
    scores = {row.dimension_id: row.score for row in report.dimension_scores_table}

    report.executive_summary = (
        f"This 5MAP scored {total:.2f}/5.00, placing it in the band: {band}. "
        f"Relative strengths: {high_text}. Priority improvement areas: {low_text}. "
        "The score is based on live Claude rubric evaluation; this fast pilot report uses "
        "deterministic narrative so the UI returns promptly."
    )
    report.purpose_of_briefing_note = (
        "This briefing note summarises live rubric scoring and evidence for the submitted 5MAP. "
        "It is intended for consultant review before any client-facing use."
    )
    report.alignment_to_higher_intent = (
        "Review Q1 and the alignment dimensions to confirm whether the 5MAP clearly links local intent "
        "to higher direction, strategy, and business context."
    )
    report.commentary_by_question_intro = (
        "The commentary below is generated deterministically from the parsed Q1-Q5 sections and live "
        "dimension scores. Use it as a quick review pack while refining the final consultant narrative."
    )
    report.q1_context_and_higher_intent = _question_block(
        "Q1 Context and Higher Intent",
        map_doc.sections.q1_context,
        scores.get("alignment_higher_direction"),
    )
    report.q2_intent_and_measures_of_success = _question_block(
        "Q2 Intent and Measures of Success",
        map_doc.sections.q2_intent,
        min(scores.get("clarity_outcome", 1), scores.get("clarity_purpose", 1)),
    )
    report.q3_tasks_and_main_effort = _question_block(
        "Q3 Tasks and Main Effort",
        map_doc.sections.q3_tasks,
        scores.get("alignment_tasks"),
    )
    report.q4_boundaries_freedoms_and_constraints = _question_block(
        "Q4 Boundaries (Freedoms and Constraints)",
        map_doc.sections.q4_boundaries,
        scores.get("decentralised_utility"),
    )
    report.q5_achievability_and_backbrief_readiness = _question_block(
        "Q5 Achievability & Back Brief Readiness",
        map_doc.sections.q5_backbrief,
        scores.get("testability"),
    )
    report.overall_assessment = (
        f"Overall assessment: {band}. Focus improvement effort on dimensions scoring below 3 first, "
        "then strengthen any 3-scored dimensions before using the report externally."
    )
    for row in report.appendix_a_scoring_rationale:
        evidence = row.evidence[0].quote if row.evidence else "No evidence quote supplied."
        row.rationale = (
            f"Live Claude assigned {row.score}/5 for {row.dimension_id}. "
            f"Representative evidence: \"{evidence}\""
        )
    return report


def _run_live_scoring_fast_report(
    map_path: Path, session_dir: Path, higher_intent_path: Path | None = None
) -> dict:
    rubric = load_rubric(_default_rubric_path())
    map_doc = parse_pptx(map_path)
    higher_intent = parse_higher_intent(higher_intent_path) if higher_intent_path else None
    client = LLMClient.from_settings(outputs_root=outputs_root())
    run_id = session_dir.name

    scorecard = score_all_dimensions(
        map_doc=map_doc,
        higher_intent=higher_intent,
        rubric=rubric,
        llm_client=client,
        run_id=run_id,
    )

    parsed_json_path = session_dir / "parsed.json"
    scorecard_json_path = session_dir / "scorecard.json"
    report_json_path = session_dir / "report.json"
    report_md_path = session_dir / "report.md"
    parsed_json_path.write_text(map_doc.model_dump_json(indent=2), encoding="utf-8")
    scorecard_json_path.write_text(scorecard.model_dump_json(indent=2), encoding="utf-8")

    report = build_report_skeleton(
        scorecard=scorecard,
        rubric=rubric,
        five_map_document=map_doc,
        higher_intent_document=higher_intent,
    )
    report = _populate_fast_narrative(report, map_doc)
    report_payload = report.model_dump(mode="json")
    report_payload["source_map_hash"] = _file_sha256(map_path)
    report_json_path.write_text(json.dumps(report_payload, indent=2) + "\n", encoding="utf-8")
    report_md_path.write_text(render_markdown(report), encoding="utf-8")
    manifest = build_run_manifest(
        run_id=run_id,
        rubric_version=rubric.version,
        model_id=client.settings.important_evaluator_model,
        input_sha256=_file_sha256(map_path),
        output_dir=session_dir,
    )
    write_run_manifest(session_dir, manifest)
    append_report_footer(report_md_path, manifest)
    EvaluationReport.model_validate(report_payload)

    total = total_weighted_score(scorecard, rubric)
    band = interpretation_band(total, rubric)
    _ = section_totals(scorecard, rubric)
    report_pdf_path = write_report_pdf(report_md_path)
    return {
        "report_json_path": report_json_path,
        "report_md_path": report_md_path,
        "report_pdf_path": report_pdf_path,
        "parsed_json_path": parsed_json_path,
        "total_weighted_score": total,
        "interpretation_band": band,
        "session_dir": session_dir,
        "low_confidence_sections": map_doc.low_confidence_sections,
    }


def run_ui_pipeline(
    map_path: Path,
    session_dir: Path,
    higher_intent_path: Path | None = None,
    use_llm: bool = False,
) -> dict:
    """Run offline demo (`report`) or live LLM mode (`evaluate`)."""
    _assert_within_outputs(session_dir)
    _assert_within_outputs(map_path)
    if higher_intent_path:
        _assert_within_outputs(higher_intent_path)

    if use_llm:
        return _run_live_scoring_fast_report(map_path, session_dir, higher_intent_path)
    else:
        args = [
            "report",
            "--scorecard",
            str(project_root() / "fixtures" / "gold_simplification_scorecard.json"),
            "--input",
            str(map_path),
            "--out",
            str(session_dir),
        ]
        if higher_intent_path:
            args.extend(["--higher-intent", str(higher_intent_path)])

    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
        exit_code = cli_main(args)
    if exit_code != 0:
        detail = stderr_buffer.getvalue().strip() or stdout_buffer.getvalue().strip()
        if detail:
            raise RuntimeError(f"Pipeline failed with exit code {exit_code}: {detail}")
        raise RuntimeError(f"Pipeline failed with exit code {exit_code}")

    report_json_path = session_dir / "report.json"
    report_md_path = session_dir / "report.md"
    parsed_json_path = session_dir / "parsed.json"
    payload = json.loads(report_json_path.read_text(encoding="utf-8"))
    parsed_payload = json.loads(parsed_json_path.read_text(encoding="utf-8"))
    report_pdf_path = write_report_pdf(report_md_path)
    return {
        "report_json_path": report_json_path,
        "report_md_path": report_md_path,
        "report_pdf_path": report_pdf_path,
        "parsed_json_path": parsed_json_path,
        "total_weighted_score": payload["total_weighted_score_table"]["total_weighted_score"],
        "interpretation_band": payload["total_weighted_score_table"]["interpretation_band"],
        "session_dir": session_dir,
        "low_confidence_sections": bool(parsed_payload.get("low_confidence_sections", False)),
    }
