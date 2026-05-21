# Intent Evaluator

Purpose-built pipeline to evaluate Leading Change **5MAP / 5QMA** documents against the Dec 2025 weighted intent rubric and produce consistent, evidence-linked evaluation reports.

## Documentation (read in order)

1. [Product Requirements Document](docs/PRD.md) (**D16**) — what and why (**required before implementation work**)
2. [Architecture](docs/ARCHITECTURE.md) — pipeline, scoring ownership, NFRs
3. [Taskmaster](docs/TASKMASTER.md) — phased engineering checklist

**Onboarding order:** `PRD -> ARCHITECTURE -> TASKMASTER`

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -e ".[dev]"
cp .env.example .env     # then add API keys (Phase 4+)
```

**Security:** Do not commit `.env` or client `.pptx` files. API keys stay in environment only.

## Tests

```bash
pytest
```

Integration tests (LLM calls) are marked `@pytest.mark.integration` and skipped by default:

```bash
pytest -m integration
```

## Gold report quickstart (no API key)

Generate a deterministic reference report from fixtures (target: under 15 minutes on a clean setup):

```bash
python -m intent_evaluator report --scorecard fixtures/gold_simplification_scorecard.json --input fixtures/synthetic_5map_parsed.json --out outputs/gold_quickstart
```

Expected outputs in `outputs/gold_quickstart/`: `parsed.json`, `report.json`, `report.md`, `run_manifest.json`.

## Evaluate (end-to-end)

Run parse -> score -> narrate -> render in one command:

```bash
python -m intent_evaluator evaluate --input fixtures/synthetic_5map_parsed.json --out outputs --run-id demo_run --llm
```

Outputs in `outputs/demo_run/`: `parsed.json`, `scorecard.json`, `report.json`, `report.md`, `trace.jsonl`, `run_manifest.json`.

## Streamlit demo

```bash
streamlit run app/streamlit_app.py
```

## Structured LLM output contract (Phase 4)

- Schema file: `schemas/llm_dimension_response.json`
- Pydantic model: `intent_evaluator.llm.schema.LLMDimensionResponse`
- Provider compatibility:
  - OpenAI structured output mode (`response_format: json_schema`) can consume this JSON Schema directly.
  - Anthropic structured JSON mode can enforce the same fields/types using this schema contract and post-validate with `LLMDimensionResponse`.
- Required constraints:
  - `score` is strict integer `1..5` (floats rejected)
  - `evidence_quotes` requires at least one quote (`minItems: 1`)

## Environment variables (Phase 4+)

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_PROVIDER` | No (default `anthropic`) | `anthropic` for Claude or `openai` |
| `ANTHROPIC_API_KEY` | Required for Claude | Anthropic provider key |
| `CLAUDE_API_KEY` | Alternative for Claude | Accepted alias for `ANTHROPIC_API_KEY` |
| `OPENAI_API_KEY` | Required only if `LLM_PROVIDER=openai` | OpenAI provider key |
| `EVALUATOR_MODEL` | No (default `claude-sonnet-4-6`) | Model for lighter narrative calls |
| `IMPORTANT_EVALUATOR_MODEL` | No (default `claude-opus-4-7`) | Model for important scoring calls |
| `EVALUATOR_TEMPERATURE` | No (default `0`) | Sampling temperature |

## Project status

Phase 0 (foundation) — see [TASKMASTER](docs/TASKMASTER.md) for current phase gates.
