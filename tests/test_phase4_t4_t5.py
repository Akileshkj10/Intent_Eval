"""Acceptance tests for Phase 4 tasks T4 and T5."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from intent_evaluator.cli import main
from intent_evaluator.config import Settings
from intent_evaluator.llm.client import LLMClient
from intent_evaluator.parsing.schema import FiveMapDocument
from intent_evaluator.rubric.load import load_rubric
from intent_evaluator.rubric.models import DimensionScore, EvidenceQuote, Scorecard
from intent_evaluator.scoring.calculator import total_weighted_score
from intent_evaluator.scoring.dimension_scorer import score_all_dimensions, score_dimension
from intent_evaluator.scoring.evidence_validator import validate_quote_exists


ROOT = Path(__file__).resolve().parents[1]
RUBRIC_PATH = ROOT / "rubrics" / "weighted_rubric_v2025_12_01.json"
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"
GOLD_SCORECARD_PATH = ROOT / "fixtures" / "gold_simplification_scorecard.json"


class _FakeLLMClient:
    def __init__(self, score_by_dimension: dict[str, int]) -> None:
        self.score_by_dimension = score_by_dimension

    def complete_structured(
        self, prompt: dict[str, str], schema: dict[str, Any], run_id: str = "run_pending"
    ) -> dict[str, Any]:
        _ = schema
        _ = run_id
        dimension_line = next(
            line for line in prompt["user"].splitlines() if line.startswith("Dimension:")
        )
        dimension_id = dimension_line.split(":", 1)[1].strip()
        score = self.score_by_dimension[dimension_id]
        return {
            "dimension_id": dimension_id,
            "score": score,
            "rationale": "Mocked rationale for deterministic tests.",
            "evidence_quotes": [
                {
                    "quote": "simplify where we must",
                    "slide_id": "Intent for...kshop.pptx",
                }
            ],
            "gaps": ["Needs sharper success criteria."],
            "improvements": ["Add measurable thresholds."],
        }


def _load_map() -> FiveMapDocument:
    with SYNTHETIC_MAP_PATH.open("r", encoding="utf-8") as handle:
        return FiveMapDocument.model_validate(json.load(handle))


@pytest.mark.integration
def test_t4_integration_scores_clarity_outcome_with_validated_quote() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    map_doc = _load_map()
    fake = _FakeLLMClient({"clarity_outcome": 4})
    result = score_dimension(
        dimension_id="clarity_outcome",
        map_doc=map_doc,
        higher_intent=None,
        rubric=rubric,
        llm_client=fake,
        run_id="t4_integration_mock",
    )
    assert 1 <= result.score <= 5
    assert len(result.evidence_quotes) >= 1
    assert validate_quote_exists(result.evidence_quotes[0].quote, map_doc) is True


def test_t4_calculator_applied_to_output_changes_total_deterministically() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    map_doc = _load_map()
    with GOLD_SCORECARD_PATH.open("r", encoding="utf-8") as handle:
        gold = Scorecard.model_validate(json.load(handle))

    scored_4 = score_dimension(
        "clarity_outcome",
        map_doc,
        None,
        rubric,
        llm_client=_FakeLLMClient({"clarity_outcome": 4}),
        run_id="t4_s4",
    )
    scored_3 = score_dimension(
        "clarity_outcome",
        map_doc,
        None,
        rubric,
        llm_client=_FakeLLMClient({"clarity_outcome": 3}),
        run_id="t4_s3",
    )

    dims_a = [scored_4 if d.dimension_id == "clarity_outcome" else d for d in gold.dimension_scores]
    dims_b = [scored_3 if d.dimension_id == "clarity_outcome" else d for d in gold.dimension_scores]
    scorecard_a = Scorecard(dimension_scores=dims_a)
    scorecard_b = Scorecard(dimension_scores=dims_b)
    total_a = total_weighted_score(scorecard_a, rubric)
    total_b = total_weighted_score(scorecard_b, rubric)

    assert total_a == 3.64
    assert total_b == 3.44
    assert round(total_a - total_b, 2) == 0.20
    assert total_weighted_score(scorecard_a, rubric) == total_a


def test_t4_trace_log_contains_prompt_hash(tmp_path: Path) -> None:
    rubric = load_rubric(RUBRIC_PATH)
    map_doc = _load_map()

    def transport(payload: dict[str, Any], api_key: str) -> dict[str, Any]:
        _ = payload
        _ = api_key
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "dimension_id": "clarity_outcome",
                                "score": 4,
                                "rationale": "Valid quote included.",
                                "evidence_quotes": [
                                    {
                                        "quote": "simplify where we must",
                                        "slide_id": "Intent for...kshop.pptx",
                                    }
                                ],
                                "gaps": [],
                                "improvements": [],
                            }
                        )
                    }
                }
            ],
            "usage": {"prompt_tokens": 12, "completion_tokens": 20, "total_tokens": 32},
        }

    settings = Settings.model_validate(
        {
            "OPENAI_API_KEY": "test-key",
            "LLM_PROVIDER": "openai",
            "EVALUATOR_MODEL": "gpt-4.1-mini",
            "IMPORTANT_EVALUATOR_MODEL": "gpt-4.1-mini",
            "EVALUATOR_TEMPERATURE": 0,
        }
    )
    client = LLMClient.from_settings(
        settings=settings,
        transport=transport,
        outputs_root=tmp_path / "outputs",
    )
    _ = score_dimension(
        "clarity_outcome",
        map_doc,
        None,
        rubric,
        llm_client=client,
        run_id="trace_case",
    )
    trace_path = tmp_path / "outputs" / "trace_case" / "trace.jsonl"
    assert trace_path.exists()
    entry = json.loads(trace_path.read_text(encoding="utf-8").strip())
    assert entry["prompt_hash"]


def test_t5_score_all_dimensions_produces_full_scorecard() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    map_doc = _load_map()
    all_scores = {dimension.id: 3 for dimension in rubric.dimensions}
    scorecard = score_all_dimensions(
        map_doc=map_doc,
        higher_intent=None,
        rubric=rubric,
        llm_client=_FakeLLMClient(all_scores),
        run_id="all_dimensions",
    )
    assert len(scorecard.dimension_scores) == 9
    assert {d.dimension_id for d in scorecard.dimension_scores} == {
        dimension.id for dimension in rubric.dimensions
    }


def test_t5_evaluate_writes_scorecard_and_trace_and_uses_calculator(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    out_dir = tmp_path / "outputs"
    run_id = "eval_case"

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
        trace_path.write_text(
            json.dumps(
                {
                    "model": "gpt-4.1-mini",
                    "prompt_hash": "abc123",
                    "token_usage": {"total_tokens": 30},
                }
            )
            + "\n",
            encoding="utf-8",
        )
        dims = [
            DimensionScore(
                dimension_id=dimension_id,
                score=3,
                evidence_quotes=[EvidenceQuote(quote="simplify where we must", slide_id="s1")],
            )
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
            ]
        ]
        return Scorecard(
            run_id=run_id,
            rubric_version="weighted_rubric_v2025_12_01",
            map_title="Synthetic",
            dimension_scores=dims,
            higher_intent_provided=False,
        )

    monkeypatch.setattr("intent_evaluator.cli.score_all_dimensions", fake_score_all_dimensions)
    monkeypatch.setattr("intent_evaluator.cli.total_weighted_score", lambda scorecard, rubric: 4.21)
    monkeypatch.setattr("intent_evaluator.cli.interpretation_band", lambda total, rubric: "band-4.21")
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
    scorecard_path = out_dir / run_id / "scorecard.json"
    trace_path = out_dir / run_id / "trace.jsonl"
    assert scorecard_path.exists()
    assert trace_path.exists()

    printed = capsys.readouterr().out
    assert '"total_weighted_score": 4.21' in printed
