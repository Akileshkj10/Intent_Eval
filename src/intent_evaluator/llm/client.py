"""LLM client abstraction for structured dimension scoring."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib import error, request

from intent_evaluator.config import Settings, get_settings


JSONDict = dict[str, Any]
Transport = Callable[[JSONDict, str], JSONDict]


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _default_outputs_root() -> Path:
    return _project_root() / "outputs"


def _prompt_hash(prompt: JSONDict) -> str:
    encoded = json.dumps(prompt, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _total_tokens(input_tokens: Any, output_tokens: Any) -> int | None:
    if isinstance(input_tokens, int) and isinstance(output_tokens, int):
        return input_tokens + output_tokens
    return None


def _openai_transport(payload: JSONDict, api_key: str) -> JSONDict:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=60) as response:
            content = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API error {exc.code}: {detail}") from exc
    return json.loads(content)


def _is_important_schema(schema: JSONDict) -> bool:
    required = set(schema.get("required", []))
    return {"dimension_id", "score", "evidence_quotes"}.issubset(required)


def _anthropic_transport(payload: JSONDict, api_key: str) -> JSONDict:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=60) as response:
            content = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Anthropic API error {exc.code}: {detail}") from exc
    return json.loads(content)


@dataclass
class LLMClient:
    """Minimal structured-output LLM client with trace logging."""

    settings: Settings
    transport: Transport
    outputs_root: Path

    @classmethod
    def from_settings(
        cls,
        settings: Settings | None = None,
        transport: Transport | None = None,
        outputs_root: Path | None = None,
    ) -> "LLMClient":
        effective_settings = settings or get_settings()
        chosen_transport = transport or (
            _anthropic_transport
            if effective_settings.llm_provider.casefold() == "anthropic"
            else _openai_transport
        )
        return cls(
            settings=effective_settings,
            transport=chosen_transport,
            outputs_root=outputs_root or _default_outputs_root(),
        )

    def complete_structured(
        self,
        prompt: JSONDict,
        schema: JSONDict,
        run_id: str = "run_pending",
    ) -> JSONDict:
        """Execute one structured completion and return parsed JSON payload."""
        provider = self.settings.llm_provider.casefold()
        model = self._model_for_schema(schema)
        if provider == "anthropic":
            api_key = self.settings.effective_anthropic_api_key
            if not api_key:
                raise RuntimeError(
                    "No Anthropic API key configured. Set ANTHROPIC_API_KEY or CLAUDE_API_KEY in .env for Claude calls."
                )
            payload = self._anthropic_payload(prompt=prompt, schema=schema, model=model)
        elif provider == "openai":
            api_key = self.settings.openai_api_key
            if not api_key:
                raise RuntimeError(
                    "No OpenAI API key configured. Set OPENAI_API_KEY in .env for OpenAI calls."
                )
            payload = self._openai_payload(prompt=prompt, schema=schema, model=model)
        else:
            raise RuntimeError(f"Unsupported LLM_PROVIDER: {self.settings.llm_provider}")

        response = self.transport(payload, api_key)
        parsed = self._extract_json_response(response)
        self._write_trace(run_id=run_id, prompt=prompt, response=response, model=model)
        return parsed

    def _model_for_schema(self, schema: JSONDict) -> str:
        if _is_important_schema(schema):
            return self.settings.important_evaluator_model
        return self.settings.evaluator_model

    def _openai_payload(self, prompt: JSONDict, schema: JSONDict, model: str) -> JSONDict:
        return {
            "model": model,
            "temperature": self.settings.evaluator_temperature,
            "messages": [
                {"role": "system", "content": str(prompt.get("system", ""))},
                {"role": "user", "content": str(prompt.get("user", ""))},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "llm_dimension_response",
                    "strict": True,
                    "schema": schema,
                },
            },
        }

    def _anthropic_payload(self, prompt: JSONDict, schema: JSONDict, model: str) -> JSONDict:
        schema_text = json.dumps(schema, sort_keys=True)
        user_content = (
            f"{prompt.get('user', '')}\n\n"
            "Return only a single valid JSON object matching this JSON Schema. "
            "Do not include markdown fences, prose, or commentary.\n\n"
            f"JSON Schema:\n{schema_text}"
        )
        return {
            "model": model,
            "max_tokens": 2048,
            "system": str(prompt.get("system", "")),
            "messages": [
                {
                    "role": "user",
                    "content": user_content,
                }
            ],
        }

    def _extract_json_response(self, response: JSONDict) -> JSONDict:
        if "content" in response and isinstance(response["content"], list):
            text_parts = [
                item.get("text", "")
                for item in response["content"]
                if isinstance(item, dict) and item.get("type") == "text"
            ]
            content = "\n".join(part for part in text_parts if part).strip()
            return self._parse_json_content(content)

        choices = response.get("choices")
        if not isinstance(choices, list) or not choices:
            raise RuntimeError("LLM response missing choices.")
        message = choices[0].get("message", {})
        content = message.get("content")
        return self._parse_json_content(content)

    def _parse_json_content(self, content: Any) -> JSONDict:
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("LLM response missing message content.")
        stripped = content.strip()
        if stripped.startswith("```"):
            stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
            stripped = re.sub(r"\s*```$", "", stripped).strip()
        parsed = json.loads(stripped)
        if not isinstance(parsed, dict):
            raise RuntimeError("Structured response must be a JSON object.")
        return parsed

    def _write_trace(
        self, run_id: str, prompt: JSONDict, response: JSONDict, model: str | None = None
    ) -> None:
        run_dir = self.outputs_root / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        trace_path = run_dir / "trace.jsonl"
        usage = response.get("usage", {})
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "provider": self.settings.llm_provider.casefold(),
            "model": model or self.settings.evaluator_model,
            "temperature": self.settings.evaluator_temperature,
            "prompt_hash": _prompt_hash(prompt),
            "token_usage": {
                "prompt_tokens": usage.get("prompt_tokens") or usage.get("input_tokens"),
                "completion_tokens": usage.get("completion_tokens") or usage.get("output_tokens"),
                "total_tokens": usage.get("total_tokens")
                or _total_tokens(usage.get("input_tokens"), usage.get("output_tokens")),
            },
        }
        with trace_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry))
            handle.write("\n")


def complete_structured(
    prompt: JSONDict,
    schema: JSONDict,
    run_id: str = "run_pending",
) -> JSONDict:
    """Convenience wrapper using environment settings."""
    client = LLMClient.from_settings()
    return client.complete_structured(prompt=prompt, schema=schema, run_id=run_id)
