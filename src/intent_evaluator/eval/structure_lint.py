"""Checklist-driven markdown structure linting for generated reports."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class LintResult:
    passed: bool
    missing_items: list[str] = field(default_factory=list)
    details: dict[str, int] = field(default_factory=dict)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _default_checklist_path() -> Path:
    return _project_root() / "eval" / "checklist.yaml"


def _load_checklist(path: str | Path | None = None) -> dict:
    checklist_path = Path(path) if path else _default_checklist_path()
    with checklist_path.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"Checklist root must be object: {checklist_path}")
    return payload


def _extract_between(text: str, start_marker: str, end_marker: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        return ""
    start += len(start_marker)
    end = text.find(end_marker, start)
    if end < 0:
        end = len(text)
    return text[start:end]


def _count_table_data_rows(section_text: str) -> int:
    lines = [line.strip() for line in section_text.splitlines() if line.strip().startswith("|")]
    if len(lines) < 3:
        return 0
    # First two lines are header + divider; remaining are data rows.
    return max(0, len(lines) - 2)


def lint_markdown_text(markdown: str, checklist_path: str | Path | None = None) -> LintResult:
    """Validate markdown report against checklist constraints."""
    checklist = _load_checklist(checklist_path)
    missing: list[str] = []

    for heading in checklist.get("required_headings", []):
        if heading not in markdown:
            missing.append(f"missing heading: {heading}")

    dim_cfg = checklist.get("dimension_scores", {})
    dim_heading = dim_cfg.get("heading", "")
    dim_end = dim_cfg.get("end_heading", "")
    min_rows = int(dim_cfg.get("min_rows", 0))
    dim_section = _extract_between(markdown, dim_heading, dim_end)
    row_count = _count_table_data_rows(dim_section)
    if row_count < min_rows:
        missing.append(
            f"dimension table rows below minimum: found {row_count}, expected >= {min_rows}"
        )

    appendix_heading = checklist.get("appendix", {}).get("heading")
    if appendix_heading and appendix_heading not in markdown:
        missing.append(f"missing appendix heading: {appendix_heading}")

    return LintResult(
        passed=len(missing) == 0,
        missing_items=missing,
        details={"dimension_row_count": row_count, "dimension_row_min": min_rows},
    )


def lint_report_md(path: str | Path, checklist_path: str | Path | None = None) -> LintResult:
    """Lint report markdown file from disk."""
    report_path = Path(path)
    markdown = report_path.read_text(encoding="utf-8")
    return lint_markdown_text(markdown, checklist_path=checklist_path)
