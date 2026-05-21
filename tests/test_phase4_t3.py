"""Acceptance tests for Phase 4 T3 LLM client abstraction."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from intent_evaluator.config import Settings
from intent_evaluator.llm.client import LLMClient
from intent_evaluator.llm.schema import LLMDimensionResponse


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "schemas" / "llm_dimension_response.json"


def _schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _settings_with_openai_key() -> Settings:
    return Settings.model_validate(
        {
            "OPENAI_API_KEY": "test-key",
            "LLM_PROVIDER": "openai",
            "EVALUATOR_MODEL": "gpt-4.1-mini",
            "IMPORTANT_EVALUATOR_MODEL": "gpt-4.1-mini",
            "EVALUATOR_TEMPERATURE": 0,
        }
    )


def _settings_with_anthropic_key() -> Settings:
    return Settings.model_validate(
        {
            "ANTHROPIC_API_KEY": "test-anthropic-key",
            "LLM_PROVIDER": "anthropic",
            "EVALUATOR_MODEL": "claude-sonnet-4-6",
            "IMPORTANT_EVALUATOR_MODEL": "claude-opus-4-7",
            "EVALUATOR_TEMPERATURE": 0,
        }
    )


def test_t3_settings_accepts_claude_api_key_alias() -> None:
    settings = Settings.model_validate(
        {
            "CLAUDE_API_KEY": "test-claude-key",
            "LLM_PROVIDER": "anthropic",
        }
    )

    assert settings.effective_anthropic_api_key == "test-claude-key"
    assert settings.require_llm_api_key() == "test-claude-key"


def test_t3_mock_client_returns_fixture_without_network_and_logs_trace(
    tmp_path: Path,
) -> None:
    captured_payloads: list[dict] = []
    fixture = {
        "dimension_id": "clarity_outcome",
        "score": 4,
        "rationale": "Outcome statement is clear with limited ambiguity.",
        "evidence_quotes": [{"quote": "simplify where we must", "slide_id": "slide_2"}],
        "gaps": ["Could be more concise."],
        "improvements": ["Shorten phrasing in Q2 intent statement."],
    }

    def fake_transport(payload: dict, api_key: str) -> dict:
        captured_payloads.append(payload)
        assert api_key == "test-key"
        return {
            "choices": [{"message": {"content": json.dumps(fixture)}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 22, "total_tokens": 32},
        }

    client = LLMClient.from_settings(
        settings=_settings_with_openai_key(),
        transport=fake_transport,
        outputs_root=tmp_path / "outputs",
    )
    result = client.complete_structured(
        prompt={"system": "You are evaluator.", "user": "Return one score row."},
        schema=_schema(),
        run_id="mock_run",
    )

    assert result == fixture
    assert captured_payloads, "Expected mock transport to be called"
    assert captured_payloads[0]["temperature"] == 0

    trace_path = tmp_path / "outputs" / "mock_run" / "trace.jsonl"
    assert trace_path.exists()
    trace = json.loads(trace_path.read_text(encoding="utf-8").strip())
    assert trace["model"] == "gpt-4.1-mini"
    assert trace["provider"] == "openai"
    assert trace["prompt_hash"]
    assert trace["token_usage"]["total_tokens"] == 32


def test_t3_anthropic_client_parses_claude_text_response_and_logs_trace(tmp_path: Path) -> None:
    captured_payloads: list[dict] = []
    fixture = {
        "dimension_id": "clarity_outcome",
        "score": 4,
        "rationale": "Outcome statement is clear.",
        "evidence_quotes": [{"quote": "simplify where we must", "slide_id": "slide_2"}],
        "gaps": [],
        "improvements": [],
    }

    def fake_transport(payload: dict, api_key: str) -> dict:
        captured_payloads.append(payload)
        assert api_key == "test-anthropic-key"
        return {
            "content": [{"type": "text", "text": json.dumps(fixture)}],
            "usage": {"input_tokens": 15, "output_tokens": 25},
        }

    client = LLMClient.from_settings(
        settings=_settings_with_anthropic_key(),
        transport=fake_transport,
        outputs_root=tmp_path / "outputs",
    )
    result = client.complete_structured(
        prompt={"system": "You are evaluator.", "user": "Return one score row."},
        schema=_schema(),
        run_id="anthropic_mock_run",
    )

    assert result == fixture
    assert captured_payloads[0]["model"] == "claude-opus-4-7"
    assert "JSON Schema" in captured_payloads[0]["messages"][0]["content"]

    trace_path = tmp_path / "outputs" / "anthropic_mock_run" / "trace.jsonl"
    trace = json.loads(trace_path.read_text(encoding="utf-8").strip())
    assert trace["provider"] == "anthropic"
    assert trace["model"] == "claude-opus-4-7"
    assert trace["token_usage"]["total_tokens"] == 40


@pytest.mark.integration
def test_t3_live_openai_call_returns_valid_dimension_response(tmp_path: Path) -> None:
    if not os.getenv("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not configured; skipping live integration test")

    settings = Settings.model_validate(
        {
            "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),
            "LLM_PROVIDER": "openai",
            "EVALUATOR_MODEL": os.getenv("EVALUATOR_MODEL", "gpt-4.1-mini"),
            "EVALUATOR_TEMPERATURE": 0,
        }
    )
    client = LLMClient.from_settings(settings=settings, outputs_root=tmp_path / "outputs")
    result = client.complete_structured(
        prompt={
            "system": "You are a strict evaluator. Return JSON only.",
            "user": (
                "Return one response for dimension clarity_outcome with score 3, "
                "one evidence quote, one gap, and one improvement."
            ),
        },
        schema=_schema(),
        run_id="integration_run",
    )
    validated = LLMDimensionResponse.model_validate(result)
    assert validated.dimension_id


@pytest.mark.integration
def test_t3_live_anthropic_call_returns_valid_dimension_response(tmp_path: Path) -> None:
    if not os.getenv("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY not configured; skipping live integration test")

    settings = Settings.model_validate(
        {
            "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY"),
            "LLM_PROVIDER": "anthropic",
            "EVALUATOR_MODEL": os.getenv("EVALUATOR_MODEL", "claude-sonnet-4-6"),
            "EVALUATOR_TEMPERATURE": 0,
        }
    )
    client = LLMClient.from_settings(settings=settings, outputs_root=tmp_path / "outputs")
    result = client.complete_structured(
        prompt={
            "system": "You are a strict evaluator. Return JSON only.",
            "user": (
                "Return one response for dimension clarity_outcome with score 3, "
                "one evidence quote, one gap, and one improvement."
            ),
        },
        schema=_schema(),
        run_id="anthropic_integration_run",
    )
    validated = LLMDimensionResponse.model_validate(result)
    assert validated.dimension_id
