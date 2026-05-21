"""Application configuration from environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    claude_api_key: str | None = Field(default=None, alias="CLAUDE_API_KEY")
    llm_provider: str = Field(default="anthropic", alias="LLM_PROVIDER")
    evaluator_model: str = Field(
        default="claude-sonnet-4-6",
        alias="EVALUATOR_MODEL",
    )
    important_evaluator_model: str = Field(
        default="claude-opus-4-7",
        alias="IMPORTANT_EVALUATOR_MODEL",
    )
    evaluator_temperature: float = Field(default=0.0, alias="EVALUATOR_TEMPERATURE")

    @property
    def effective_anthropic_api_key(self) -> str | None:
        """Accept both Anthropic's canonical name and the common Claude alias."""
        return self.anthropic_api_key or self.claude_api_key

    def require_llm_api_key(self) -> str:
        """Return a usable API key or raise with a clear message."""
        provider = self.llm_provider.casefold()
        if provider == "anthropic" and self.effective_anthropic_api_key:
            return self.effective_anthropic_api_key
        if provider == "openai" and self.openai_api_key:
            return self.openai_api_key
        if self.openai_api_key:
            return self.openai_api_key
        if self.effective_anthropic_api_key:
            return self.effective_anthropic_api_key
        raise RuntimeError(
            "LLM configuration missing: set OPENAI_API_KEY, ANTHROPIC_API_KEY, or CLAUDE_API_KEY in .env "
            "(see .env.example). Phase 4+ scoring and narrative require an API key."
        )


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
