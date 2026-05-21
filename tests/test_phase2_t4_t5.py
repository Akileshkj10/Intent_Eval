"""Acceptance tests for Phase 2 T4 and T5."""

from __future__ import annotations

import json
from pathlib import Path

from intent_evaluator.cli import main
from intent_evaluator.report.assembler import build_report_skeleton
from intent_evaluator.report.render_markdown import render
from intent_evaluator.report.schema import EvaluationReport
from intent_evaluator.rubric.load import load_rubric
from intent_evaluator.rubric.models import Scorecard


ROOT = Path(__file__).resolve().parents[1]
RUBRIC_PATH = ROOT / "rubrics" / "weighted_rubric_v2025_12_01.json"
GOLD_SCORECARD_PATH = ROOT / "fixtures" / "gold_simplification_scorecard.json"
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _build_gold_report() -> EvaluationReport:
    rubric = load_rubric(RUBRIC_PATH)
    scorecard = Scorecard.model_validate(_load_json(GOLD_SCORECARD_PATH))
    from intent_evaluator.parsing.schema import FiveMapDocument

    map_doc = FiveMapDocument.model_validate(_load_json(SYNTHETIC_MAP_PATH))
    return build_report_skeleton(scorecard, rubric, map_doc)


def test_t4_render_has_canonical_headings_in_order() -> None:
    md = render(_build_gold_report())
    headings = [
        "## 2. Executive Summary",
        "## 3. Purpose of this briefing note",
        "## 4. Alignment of overall intent to Higher Intent (Q1)",
        "## 5. Dimension scores",
        "## 6. Total weighted score",
        "## 7. Commentary by 5MAP/5QMA Question",
        "## 8. Q1 Context and Higher Intent",
        "## 9. Q2 Intent and Measures of Success",
        "## 10. Q3 Tasks and Main Effort",
        "## 11. Q4 Boundaries (Freedoms and Constraints)",
        "## 12. Q5 Achievability & Back Brief Readiness",
        "## 13. Overall assessment",
        "## 14. Appendix A. Scoring rationale",
    ]
    index = -1
    for heading in headings:
        next_index = md.find(heading)
        assert next_index > index
        index = next_index


def test_t4_gold_tables_show_total_and_nine_dimension_rows() -> None:
    md = render(_build_gold_report())
    assert "3.64" in md
    # Count dimension rows in dimension table by dimension IDs from the gold scorecard.
    for dimension_id in [
        "clarity_outcome",
        "clarity_purpose",
        "alignment_higher_direction",
        "alignment_tasks",
        "conciseness",
        "outcome_focused",
        "decentralised_utility",
        "testability",
        "energy_engagement",
    ]:
        assert dimension_id in md


def test_t5_cli_report_writes_md_and_json_and_schema_validates(tmp_path: Path) -> None:
    out_dir = tmp_path / "gold_run"
    exit_code = main(
        [
            "report",
            "--scorecard",
            str(GOLD_SCORECARD_PATH),
            "--map",
            str(SYNTHETIC_MAP_PATH),
            "--out",
            str(out_dir),
        ]
    )
    assert exit_code == 0

    report_json_path = out_dir / "report.json"
    report_md_path = out_dir / "report.md"
    assert report_json_path.exists()
    assert report_md_path.exists()

    payload = _load_json(report_json_path)
    EvaluationReport.model_validate(payload)

    md = report_md_path.read_text(encoding="utf-8")
    assert "Clarity of Outcome (What)" in md
    assert "| 0.20 | 4 | 0.80" in md

