"""Local-only UI pipeline helpers for Streamlit demo."""

from __future__ import annotations

import contextlib
import io
import json
import textwrap
import uuid
from pathlib import Path

from intent_evaluator.cli import main as cli_main
from intent_evaluator.parsing import parse_text_input


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def outputs_root() -> Path:
    return project_root() / "outputs"


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
        args = [
            "evaluate",
            "--input",
            str(map_path),
            "--out",
            str(outputs_root()),
            "--run-id",
            session_dir.name,
            "--llm",
        ]
        if higher_intent_path:
            args.extend(["--higher-intent", str(higher_intent_path)])
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
