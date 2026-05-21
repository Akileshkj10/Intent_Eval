"""Acceptance tests for Phase 5 tasks T1 and T2."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from intent_evaluator.narrative.section_generator import generate_question_commentary, generate_section
from intent_evaluator.report.assembler import build_report_skeleton
from intent_evaluator.rubric.load import load_rubric
from intent_evaluator.rubric.models import Scorecard


ROOT = Path(__file__).resolve().parents[1]
PROMPTS_SECTIONS_DIR = ROOT / "prompts" / "sections"
RUBRIC_PATH = ROOT / "rubrics" / "weighted_rubric_v2025_12_01.json"
GOLD_SCORECARD_PATH = ROOT / "fixtures" / "gold_simplification_scorecard.json"
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"


class _SequencedClient:
    def __init__(self, responses: list[dict[str, Any]]) -> None:
        self.responses = responses
        self.calls = 0

    def complete_structured(
        self, prompt: dict[str, str], schema: dict[str, Any], run_id: str = "run_pending"
    ) -> dict[str, Any]:
        _ = prompt
        _ = schema
        _ = run_id
        item = self.responses[self.calls]
        self.calls += 1
        return item


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _report_skeleton():
    rubric = load_rubric(RUBRIC_PATH)
    scorecard = Scorecard.model_validate(_load_json(GOLD_SCORECARD_PATH))
    from intent_evaluator.parsing.schema import FiveMapDocument

    map_doc = FiveMapDocument.model_validate(_load_json(SYNTHETIC_MAP_PATH))
    return build_report_skeleton(scorecard=scorecard, rubric=rubric, five_map_document=map_doc)


def test_t1_section_prompt_files_exist_for_pack() -> None:
    files = sorted(PROMPTS_SECTIONS_DIR.glob("*.yaml"))
    assert len(files) >= 8


def test_t1_each_section_prompt_contains_forbidden_score_modification_clause() -> None:
    for path in PROMPTS_SECTIONS_DIR.glob("*.yaml"):
        text = path.read_text(encoding="utf-8")
        assert "FORBIDDEN: modifying dimension scores" in text


def test_t1_executive_summary_prompt_enforces_200_words() -> None:
    text = (PROMPTS_SECTIONS_DIR / "executive_summary.yaml").read_text(encoding="utf-8")
    assert "200 words or fewer" in text or "200 words or less" in text


@pytest.mark.integration
def test_t2_integration_q2_returns_nonempty_strengths_and_gaps() -> None:
    report = _report_skeleton()
    client = _SequencedClient(
        [
            {
                "strengths": "Intent states a clear transformation direction.",
                "gaps_risks": "Measures remain broad and not fully testable.",
                "suggested_improvements": "Add explicit targets and time bounds.",
            }
        ]
    )
    section = generate_question_commentary(
        name="q2_commentary",
        report_skeleton=report,
        question_label="Q2 Intent and Measures of Success",
        llm_client=client,
        run_id="p5_t2_q2",
    )
    assert section.strengths.strip()
    assert section.gaps_risks.strip()


def test_t2_exec_summary_retries_once_when_over_word_limit() -> None:
    report = _report_skeleton()
    too_long = " ".join(["word"] * 205)
    within_limit = " ".join(["word"] * 120)
    client = _SequencedClient([{"text": too_long}, {"text": within_limit}])
    text = generate_section(
        name="executive_summary",
        report_skeleton=report,
        llm_client=client,
        run_id="p5_t2_exec",
    )
    assert len(text.split()) <= 200
    assert client.calls == 2
