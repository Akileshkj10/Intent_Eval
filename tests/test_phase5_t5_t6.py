"""Acceptance tests for Phase 5 tasks T5 and T6."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from intent_evaluator.cli import main
from intent_evaluator.llm.client import LLMClient
from intent_evaluator.parsing.schema import FiveMapDocument
from intent_evaluator.report.assembler import build_report_skeleton
from intent_evaluator.report.render_markdown import render
from intent_evaluator.rubric.load import load_rubric
from intent_evaluator.rubric.models import DimensionScore, EvidenceQuote, Scorecard
from intent_evaluator.scoring.calculator import interpretation_band, section_totals, total_weighted_score
from intent_evaluator.scoring.dimension_scorer import score_all_dimensions


ROOT = Path(__file__).resolve().parents[1]
RUBRIC_PATH = ROOT / "rubrics" / "weighted_rubric_v2025_12_01.json"
GOLD_SCORECARD_PATH = ROOT / "fixtures" / "gold_simplification_scorecard.json"
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def test_t5_evaluate_outputs_all_required_files_and_report_total_matches_calculator(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    out_dir = tmp_path / "outputs"
    run_id = "p5_t5_case"
    rubric = load_rubric(RUBRIC_PATH)

    with GOLD_SCORECARD_PATH.open("r", encoding="utf-8") as handle:
        gold_payload = json.load(handle)
    template_scorecard = Scorecard.model_validate(gold_payload)

    def fake_score_all_dimensions(
        map_doc: FiveMapDocument,
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
        trace_path.write_text(json.dumps({"prompt_hash": "hash123", "token_usage": {"total_tokens": 55}}) + "\n", encoding="utf-8")
        return template_scorecard.model_copy(update={"run_id": run_id})

    monkeypatch.setattr("intent_evaluator.cli.score_all_dimensions", fake_score_all_dimensions)
    monkeypatch.setattr(
        "intent_evaluator.cli.generate_full_narrative",
        lambda report_skeleton, llm_client, run_id, enable_question_subscores=False: report_skeleton,
    )

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
        ]
    )
    assert exit_code == 0

    run_dir = out_dir / run_id
    expected = [
        "report.md",
        "report.json",
        "scorecard.json",
        "trace.jsonl",
        "parsed.json",
        "run_manifest.json",
    ]
    for name in expected:
        assert (run_dir / name).exists()

    report_payload = _load_json(run_dir / "report.json")
    scorecard = Scorecard.model_validate(_load_json(run_dir / "scorecard.json"))
    expected_total = total_weighted_score(scorecard, rubric)
    assert report_payload["total_weighted_score_table"]["total_weighted_score"] == expected_total


def test_t6_gold_regression_bypasses_llm_and_checks_structure_math() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    scorecard = Scorecard.model_validate(_load_json(GOLD_SCORECARD_PATH))
    totals = section_totals(scorecard, rubric)
    assert totals == {"A": 1.6, "B": 1.2, "C": 0.84}
    total = total_weighted_score(scorecard, rubric)
    assert 3.0 <= total <= 3.9
    assert "Adequate" in interpretation_band(total, rubric)

    map_doc = FiveMapDocument.model_validate(_load_json(SYNTHETIC_MAP_PATH))
    report = build_report_skeleton(scorecard=scorecard, rubric=rubric, five_map_document=map_doc)
    md = render(report)
    for heading in [
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
    ]:
        assert heading in md


@pytest.mark.integration
def test_t6_optional_llm_gold_soft_compare_within_plus_minus_one() -> None:
    if os.getenv("RUN_LLM_GOLD") != "1":
        pytest.skip("Set RUN_LLM_GOLD=1 to enable optional LLM-gold comparison.")
    if not os.getenv("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not configured.")

    rubric = load_rubric(RUBRIC_PATH)
    map_doc = FiveMapDocument.model_validate(_load_json(SYNTHETIC_MAP_PATH))
    gold = Scorecard.model_validate(_load_json(GOLD_SCORECARD_PATH))
    client = LLMClient.from_settings(outputs_root=ROOT / "outputs")
    scored = score_all_dimensions(
        map_doc=map_doc,
        higher_intent=None,
        rubric=rubric,
        llm_client=client,
        run_id="gold_soft_compare",
    )

    gold_by_id = {item.dimension_id: item.score for item in gold.dimension_scores}
    scored_by_id = {item.dimension_id: item.score for item in scored.dimension_scores}
    for dimension_id, gold_score in gold_by_id.items():
        assert abs(scored_by_id[dimension_id] - gold_score) <= 1
