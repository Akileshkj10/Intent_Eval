# Parsing Notes (Phase 3 T1)

- Docling supports `.pptx` inputs and returns normalized document content that can be exported to Markdown, which is sufficient for a first-pass slide-to-section adapter.
- The exported Markdown does not guarantee native PowerPoint slide IDs, so the adapter synthesizes deterministic IDs as `slide_{index}_{title_slug}`.
- Speaker notes are not reliably separated in the current Markdown export path, so notes are currently set to `None` and captured as an identified limitation.
- Section mapping uses D4-aligned keyword heuristics (`Context/Q1`, `Intent/Q2`, `Tasks/Q3`, `Boundaries/Q4`, `Backbrief/Q5`) and intentionally flags low confidence when any section is missing.
- If section boundaries cannot be inferred, the parser falls back to aggregating all slide text into `q2_intent` and sets `low_confidence_sections=true` to preserve operator visibility.
- During bootstrap (before D15 sample decks are available), parser validation can run against `fixtures/synthetic_5map_parsed.json` to exercise schema and CLI output behavior.

**Decision:** Use **Docling as primary parser** and keep **python-pptx as fallback strategy** for non-standard decks or when richer slide metadata (including notes fidelity) is required.

## Phase 6 T6 synthetic-first execution (2026-05-21)

- Ran parser check on `fixtures/synthetic_5map_parsed.json`:
  - Command: `python -m intent_evaluator parse --input fixtures/synthetic_5map_parsed.json --out outputs/p6_t6_parse_check`
  - Result: `low_confidence_sections: false`, `slide_count: 5`, cache hit on deterministic hash.
- Ran full evaluate command:
  - Command: `python -m intent_evaluator evaluate --input fixtures/synthetic_5map_parsed.json --out outputs --run-id p6_t6_synth_eval --llm`
  - Result: failed in this environment due to missing `OPENAI_API_KEY` (expected actionable error path).
- Ran offline deterministic report pipeline for immediate baseline artefacts:
  - Command: `python -m intent_evaluator report --scorecard fixtures/gold_simplification_scorecard.json --input fixtures/synthetic_5map_parsed.json --out outputs/p6_t6_gold_report`
  - Result: generated `parsed.json`, `report.json`, `report.md`, `run_manifest.json`; total weighted score `3.64`.

## D15 follow-up checklist [AWAITING D15]

- Add blank and anonymized client `.pptx` to `tests/fixtures_client/` (local-only).
- Re-run parser confidence validation on real template(s); update section heuristics only if evidence warrants.
- Validate section mapping and evidence-quote anchors against real slide IDs.
- Re-run consultant MAE pipeline with real consultant CSV inputs from Mark.
