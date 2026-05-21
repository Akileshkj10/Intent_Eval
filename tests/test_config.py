"""Configuration loading tests (P0-T02)."""

import pytest

from intent_evaluator.config import Settings, get_settings


def test_settings_default_temperature_zero(monkeypatch):
    monkeypatch.delenv("EVALUATOR_TEMPERATURE", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    get_settings.cache_clear()
    settings = Settings()
    assert settings.evaluator_temperature == 0.0


def test_require_llm_api_key_raises_without_keys(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    get_settings.cache_clear()
    settings = Settings()
    with pytest.raises(RuntimeError, match="LLM configuration missing"):
        settings.require_llm_api_key()


def test_require_llm_api_key_with_openai(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    get_settings.cache_clear()
    settings = Settings()
    assert settings.require_llm_api_key() == "test-key"
