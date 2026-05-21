"""Acceptance tests for Phase 6 tasks T1 and T2."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from intent_evaluator.cli import main
from intent_evaluator.eval.structure_lint import lint_markdown_text, lint_report_md
from intent_evaluator.report.assembler import build_report_skeleton
from intent_evaluator.report.render_markdown import render
from intent_evaluator.rubric.load import load_rubric
from intent_evaluator.rubric.models import DimensionScore, EvidenceQuote, Scorecard
from intent_evaluator.scoring.calculator import interpretation_band, section_totals, total_weighted_score


ROOT = Path(__file__).resolve().parents[1]
EVAL_DOC_PATH = ROOT / "docs" / "EVAL.md"
CHECKLIST_PATH = ROOT / "eval" / "checklist.yaml"
RUBRIC_PATH = ROOT / "rubrics" / "weighted_rubric_v2025_12_01.json"
GOLD_SCORECARD_PATH = ROOT / "fixtures" / "gold_simplification_scorecard.json"
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _gold_markdown() -> str:
    rubric = load_rubric(RUBRIC_PATH)
    scorecard = Scorecard.model_validate(_load_json(GOLD_SCORECARD_PATH))
    from intent_evaluator.parsing.schema import FiveMapDocument

    map_doc = FiveMapDocument.model_validate(_load_json(SYNTHETIC_MAP_PATH))
    report = build_report_skeleton(scorecard=scorecard, rubric=rubric, five_map_document=map_doc)
    return render(report)


def test_t1_eval_doc_lists_at_least_four_metrics_with_formulas() -> None:
    text = EVAL_DOC_PATH.read_text(encoding="utf-8")
    formula_lines = [line for line in text.splitlines() if "`" in line]
    assert len(formula_lines) >= 4
    assert "Weighted total variance" in text
    assert "Per-dimension MAE vs consultant" in text
    assert "Evidence hit rate" in text
    assert "Section checklist pass rate" in text


def test_t1_checklist_validator_returns_pass_fail_and_missing_items() -> None:
    md = "# EVALUATION REPORT\n\n## 2. Executive Summary\nshort text\n"
    result = lint_markdown_text(md, checklist_path=CHECKLIST_PATH)
    assert isinstance(result.passed, bool)
    assert isinstance(result.missing_items, list)
    assert result.passed is False
    assert result.missing_items


def test_t2_gold_md_passes_lint_100_percent(tmp_path: Path) -> None:
    md_path = tmp_path / "gold.md"
    md_path.write_text(_gold_markdown(), encoding="utf-8")
    lint = lint_report_md(md_path, checklist_path=CHECKLIST_PATH)
    assert lint.passed is True
    assert lint.missing_items == []


def test_t2_missing_heading_fails_with_named_section(tmp_path: Path) -> None:
    md = _gold_markdown().replace("## 9. Q2 Intent and Measures of Success", "")
    md_path = tmp_path / "missing_heading.md"
    md_path.write_text(md, encoding="utf-8")
    lint = lint_report_md(md_path, checklist_path=CHECKLIST_PATH)
    assert lint.passed is False
    assert any("## 9. Q2 Intent and Measures of Success" in item for item in lint.missing_items)


def test_t2_cli_lint_flag_returns_failure_when_structure_is_broken(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    out_dir = tmp_path / "outputs"
    run_id = "lint_fail_case"

    with GOLD_SCORECARD_PATH.open("r", encoding="utf-8") as handle:
        gold_payload = json.load(handle)
    template_scorecard = Scorecard.model_validate(gold_payload)

    def fake_score_all_dimensions(
        map_doc: Any,
        higher_intent: Any,
        rubric: Any,
        llm_client: Any = None,
        run_id: str = "run_pending",
    ) -> Scorecard:
        _ = map_doc
        _ = higher_intent
        _ = rubric
        _ = llm_client
        trace_path = out_dir / run_id / "trace.jsonl"
        trace_path.parent.mkdir(parents=True, exist_ok=True)
        trace_path.write_text(
            json.dumps({"prompt_hash": "abc", "token_usage": {"total_tokens": 12}}) + "\n",
            encoding="utf-8",
        )
        return template_scorecard.model_copy(update={"run_id": run_id})

    def fake_generate_full_narrative(
        report_skeleton: Any, llm_client: Any, run_id: str, enable_question_subscores: bool = False
    ) -> Any:
        _ = llm_client
        _ = run_id
        _ = enable_question_subscores
        broken = report_skeleton.model_copy(deep=True)
        broken.executive_summary = "ok"
        broken.purpose_of_briefing_note = "ok"
        broken.alignment_to_higher_intent = "ok"
        broken.commentary_by_question_intro = "ok"
        broken.q1_context_and_higher_intent.strengths = "ok"
        broken.q1_context_and_higher_intent.gaps_risks = "ok"
        broken.q1_context_and_higher_intent.suggested_improvements = "ok"
        broken.q2_intent_and_measures_of_success.strengths = "ok"
        broken.q2_intent_and_measures_of_success.gaps_risks = "ok"
        broken.q2_intent_and_measures_of_success.suggested_improvements = "ok"
        broken.q3_tasks_and_main_effort.strengths = "ok"
        broken.q3_tasks_and_main_effort.gaps_risks = "ok"
        broken.q3_tasks_and_main_effort.suggested_improvements = "ok"
        broken.q4_boundaries_freedoms_and_constraints.strengths = "ok"
        broken.q4_boundaries_freedoms_and_constraints.gaps_risks = "ok"
        broken.q4_boundaries_freedoms_and_constraints.suggested_improvements = "ok"
        broken.q5_achievability_and_backbrief_readiness.strengths = "ok"
        broken.q5_achievability_and_backbrief_readiness.gaps_risks = "ok"
        broken.q5_achievability_and_backbrief_readiness.suggested_improvements = "ok"
        broken.overall_assessment = "ok"
        for row in broken.appendix_a_scoring_rationale:
            row.rationale = "ok"
        return broken

    monkeypatch.setattr("intent_evaluator.cli.score_all_dimensions", fake_score_all_dimensions)
    monkeypatch.setattr("intent_evaluator.cli.generate_full_narrative", fake_generate_full_narrative)
    monkeypatch.setattr("intent_evaluator.cli.render_markdown", lambda report: "# broken\n")

    exit_code = main(
        [
            "evaluate",
            "--input",
            str(SYNTHETIC_MAP_PATH),
            "--out",
            str(out_dir),
            "--run-id",
            run_id,
            "--llm",
            "--lint",
        ]
    )
    assert exit_code == 1
