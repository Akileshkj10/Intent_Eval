# Intent Evaluator — Architecture Decision Record

| Field | Value |
|-------|--------|
| **Version** | 1.0 |
| **Status** | Approved for Phase 0–1 implementation |
| **Related documents** | [PRD §7](PRD.md) (D16), Canonical Source D1, [TASKMASTER](TASKMASTER.md) |

---

## 1. Context

Leading Change evaluates client **5MAP / 5QMA** submissions (typically PowerPoint) against a proprietary **weighted rubric** (Dec 2025). A general-purpose M365 copilot agent proved that AI-assisted evaluation is feasible but **failed operational requirements**: non-repeatable scores, manual report assembly, and weak binding to the approved 14-section structure.

Intent Evaluator replaces ad-hoc prompting with a **deterministic pipeline**: versioned rubric, schema-validated LLM steps, Python-owned mathematics, and auditable run artefacts. See **PRD §1–§2** (D16) for problem and goals.

---

## 2. Goals

| Goal | Source (D16) | Architectural response |
|------|----------------|-------------------------|
| Scoring consistency | §3.2 G1, NFR-CON-02 | Per-dimension structured LLM calls; T=0; calculator in code |
| Methodology fidelity | §3.2 G2, FR-RPT-01 | Locked `rubrics/*.json` + canonical 14-section schema |
| Evidence grounding | §3.2 G3, FR-LLM-03 | Quote + slide_id validation before accepting scores |
| Auditability | §3.2 G5, §6.4 | `run_manifest.json`, `trace.jsonl`, rubric/prompt hashes |
| Consultant efficiency | §3.2 G4 | Single `evaluate` command; Markdown + JSON output |

---

## 3. Non-goals (Phase 1)

Aligned with **PRD §10** (D16) and TASKMASTER Phase 7:

- Client self-service evaluation
- Fine-tuning on Leading Change or client documents
- Vector RAG over rubric corpora (static injection only)
- **LLM-computed weighted totals or section aggregates**
- Branded Word export (Markdown/JSON first)
- Multi-5MAP team-set evaluation
- Real-time workshop coaching / 5MAP authoring replacement
- Copilot-in-prompt business logic (M365 is a channel only, Phase 3+)

---

## 4. High-level architecture

Per **PRD §7.2** (D16):

```
Presentation (Streamlit Ph1, Dashboard Ph2, M365 Ph3)
        │
        ▼
API / Orchestration (CLI Ph1, HTTP Ph2, LangGraph optional)
        │
        ▼
Core pipeline: Ingest → Parse → Score → Calculate → Narrate → Render → Lint
        │
        ├── Knowledge: rubric JSON, prompt packs, reference manifest
        └── External: LLM API, filesystem / blob storage
```

### 4.1 Processing flow

**PRD §7.3** (D16):

1. **Ingest** — Validate `.pptx`, SHA-256, assign `run_id`.
2. **Parse** — Docling (primary) → `FiveMapDocument`; optional `HigherIntentDocument`.
3. **Score** — Nine structured LLM calls → `DimensionScore` with evidence.
4. **Calculate** — Python-only weighted sums and interpretation band.
5. **Assemble** — Populate `EvaluationReport` tables from calculator.
6. **Narrate** — Section LLM writers; **frozen scorecard** in prompts.
7. **Render** — `report.md` + `report.json`.
8. **Lint & persist** — Structure linter, manifest, traces.

---

## 5. Scoring ownership (critical)

**Weighted totals MUST NOT be computed by an LLM.** (PRD **FR-RUB-04**, D16 §5.1.)

| Responsibility | Owner |
|----------------|--------|
| Integer score 1–5 per dimension | LLM (structured output) |
| Evidence quotes + slide references | LLM, validated in code |
| `score × weight` per dimension | **Python `calculator` module** |
| Section totals A / B / C | **Python** |
| Overall total (max 5.0) | **Python** |
| Interpretation band (4.5–5.0, etc.) | **Python** from rubric JSON |
| Executive summary, Q1–Q5 coaching text | LLM (cannot change numeric tables) |

This split addresses the copilot failure mode documented in the product history (PRD §2.1).

---

## 6. Component design

### 6.1 Rubric engine (Phase 1)

- **Input:** `rubrics/weighted_rubric_v2025_12_01.json` (from D1)
- **Models:** `Rubric`, `DimensionScore`, `Scorecard` (PRD §8.1)
- **Output:** `scorecard.json` with reproducible maths

### 6.2 Parsing (Phase 3)

- **Primary:** Docling → slide-level JSON (PRD §5.2, §7.4)
- **Fallback:** python-pptx heuristics for non-standard decks
- **Output:** `parsed.json`; cache keyed by file hash (FR-PARSE-05)
- **Flag:** `low_confidence_sections` when Q1–Q5 boundaries unclear
- **Higher intent optionality:** if no higher-intent document is supplied, alignment analysis defaults to Q1 context text only.

**External dependency D15:** Blank and anonymised client `.pptx` samples from Leading Change for parser tuning.

### 6.3 LLM scoring (Phase 4)

- One structured call per dimension (FR-LLM-01)
- Prompt pack injects D1 level descriptors + D4 section context — **no fuzzy RAG on rubric** (PRD §10)
- Temperature **0** default (FR-LLM-05)
- Provider: OpenAI or Anthropic via env (PRD §9.1)

### 6.4 Report generation (Phase 2, 5)

- **Phase 1 formats:** JSON + Markdown only (FR-RPT-07)
- Tables from calculator; narrative after scores finalised (FR-RPT-02, FR-RPT-03)
- 14 sections per D1 / PRD §8.2
- Word template (D7) deferred to Phase 7 / PRD Phase 4

### 6.5 Orchestration

- Phase 1: Python package + CLI `evaluate`
- Optional: LangGraph for per-node retries
- Phase 2+: HTTP API, run persistence for dashboard (PRD §5.7)
- Phase 3+: Temporal under graph for durable M365-triggered runs (PRD §12 Phase 5)

---

## 7. Output artefacts

Per **PRD §8.3** (D16), each run writes:

```
outputs/{run_id}/
  parsed.json
  scorecard.json
  report.json
  report.md
  trace.jsonl
  run_manifest.json
```

`run_manifest.json` includes rubric version, model id, prompt manifest hash, input SHA-256 (NFR-AUD-01).

---

## 8. Evaluation and quality strategy

**PRD §3.2** (D16):

| Metric | Implementation |
|--------|----------------|
| Calculator correctness | Unit tests vs gold scorecard (3.64 / section totals) |
| Structural compliance | `structure_lint` on generated Markdown |
| Score stability | Integration test: 3 runs, variance ≤ 0.1 |
| Evidence rate | Validator pass/fail counts in trace |

Gold reference: Simplification 5QMA example (~3.8 displayed, 3.64 summed) — see `docs/gold_example_simplification.md`.

---

## 9. Security and confidentiality

**PRD §6.3** (D16):

- Client `.pptx` and reports are confidential (mutual NDA).
- No client files in git (`.gitignore` covers `*.pptx`, `outputs/`).
- No fine-tuning on proprietary or client content.
- Secrets in `.env` only; `.env.example` in repo.
- Production target: tenant-isolated Azure storage + Key Vault (PRD §9.2).

---

## 10. Technology stack (Phase 1 baseline)

| Layer | Choice | PRD ref |
|-------|--------|---------|
| Language | Python 3.11+ | §7.4 |
| Validation | Pydantic v2 | §7.1 |
| Config | pydantic-settings + dotenv | §9.1 |
| Parsing | Docling | §5.2 |
| LLM | OpenAI / Anthropic structured outputs | §5.3 |
| Tests | pytest | §7.4 |
| UI | Streamlit (Phase 6) | §5.6 |

---

## 11. Risks and mitigations

See **PRD §11** (D16). Architecture-specific mitigations:

| Risk | Mitigation |
|------|------------|
| LLM score drift | T=0, per-dimension calls, stability CI |
| Hallucinated evidence | Substring validator + retry |
| PPTX layout variance | `low_confidence_sections` + manual override YAML (later) |
| Missing test decks | Synthetic fixtures until D15 delivered |

---

## 12. Roadmap alignment

| PRD delivery phase | Engineering phase (TASKMASTER) |
|--------------------|--------------------------------|
| Phase 0–1 Foundation + scoring engine | P0–P1 |
| Phase 1 MVP (parse, score, report) | P2–P5 |
| Phase 1 demo + calibration | P6 |
| Phase 2 Dashboard + DOCX | P7 + PRD Phase 4 |
| Phase 3 M365 | P7 + PRD Phase 5 |

---

## 13. Deferred work (TASKMASTER P7)

- P7-T01 DOCX (`docxtpl`, D7)
- P7-T02 Consultant email wrapper
- P7-T03–T04 Azure / M365 shell
- P7-T05 Multi-MAP sets
- P7-T06 Client context RAG
- P7-T07 LangGraph + Temporal
- P7-T08 Management dashboard

---

*End of Architecture v1.0*
