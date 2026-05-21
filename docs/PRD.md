# Product Requirements Document

## Intent Evaluator

| Field | Value |
|-------|--------|
| **Product name** | Intent Evaluator (working title; aligns with Leading Change “Intent Wizard” methodology) |
| **Client / sponsor** | Leading Change Limited |
| **Document version** | 1.0 |
| **Status** | Draft for engineering kickoff |
| **Last updated** | 21 May 2026 |
| **Related documents** | Canonical evaluation specification (Dec 2025), 5MAP Coaching Guide v5.0, Weighted Intent Rubric, `docs/TASKMASTER.md` |

---

## 1. Executive summary

Leading Change helps organisations translate strategy into execution using the **5MAP** framework (five-question mission alignment plans, also referred to as **5QMA**). Consultants review client-submitted 5MAP documents—typically PowerPoint artefacts produced in workshops—and provide structured feedback against a proprietary weighted quality rubric.

An initial proof of concept used a general-purpose copilot agent inside Microsoft 365. That approach demonstrated feasibility but failed operational requirements: **scores and narrative varied on repeat runs**, reports did not reliably follow the approved structure, and producing client-ready output required multiple manual re-prompts and copy-paste.

**Intent Evaluator** is a purpose-built evaluation platform that ingests client 5MAP documents (and optional higher-level intent materials), applies a **locked, versioned scoring methodology** with deterministic aggregation, and generates **consistent, evidence-linked, client-ready evaluation reports**. Phase 1 targets **internal consultant use only**; client self-service and deep Microsoft 365 embedding are later phases.

The product is architected as a **pipeline**, not a conversational agent: large language models (LLMs) extract evidence and author coaching narrative; **application code owns all weighted mathematics and report structure**. Outputs are machine-readable (JSON) and human-readable (Markdown in Phase 1; branded document export later), with full audit trails for methodology compliance and confidentiality obligations.

---

## 2. Problem statement

### 2.1 Current state

- Consultants evaluate 5MAP submissions against nine weighted dimensions grouped into three sections: core clarity (40%), alignment (30%), and supporting qualities (30%).
- Evaluation must reference Leading Change guidance (5MAP coaching rules, intent quality criteria, organisational rubric descriptors) and, where provided, higher-level strategic intent from the client hierarchy.
- A pilot AI assistant produced high-quality feedback in some runs but **could not reproduce the same scores or structure** when the same document was evaluated again.
- Final deliverables were pasted into email or documents manually; the approved Word report template was not populated automatically.

### 2.2 Pain points

| Pain point | Impact |
|------------|--------|
| Score inconsistency | Undermines trust with consultants and clients; prevents automation |
| Uncontrolled narrative | Generic or verbose AI tone; misalignment with Leading Change voice |
| Weak evidence linkage | Feedback not tied to specific slides or sections |
| Manual assembly | Senior consultant time spent formatting, not judging |
| No audit trail | Cannot explain why a score was assigned or which rubric version applied |
| Confidentiality risk | Ad-hoc chat tools may reference documents or rubrics inconsistently |

### 2.3 Opportunity

A dedicated evaluator reduces time per 5MAP review, standardises quality across consultants, and creates a foundation for scaled delivery (team-level alignment reviews, optional client-facing tooling, and integration with existing M365 workflows).

---

## 3. Goals and success metrics

### 3.1 Product goals

| ID | Goal | Priority |
|----|------|----------|
| G1 | **Scoring consistency** — identical inputs and configuration yield identical weighted totals (within defined tolerance) | P0 |
| G2 | **Methodology fidelity** — all evaluations use the approved Dec 2025 weighted rubric and 14-section report structure | P0 |
| G3 | **Evidence grounding** — every dimension score supported by verifiable quotes from the submitted 5MAP | P0 |
| G4 | **Consultant efficiency** — materially reduce time from upload to review-ready report vs manual + copilot workflow | P1 |
| G5 | **Auditability** — reproducible runs with rubric version, model version, and input fingerprints | P1 |
| G6 | **Operational readiness** — deployable internal tool with role-appropriate access and client-data handling | P2 |

### 3.2 Success metrics (Phase 1 — internal MVP)

| Metric | Target | Measurement method |
|--------|--------|-------------------|
| Weighted total variance | ≤ 0.1 points across 3 consecutive runs on same file | Automated stability test |
| Rubric compliance | 100% of reports pass structural linter (14 sections, 9 dimension rows, appendix) | CI + linter |
| Evidence validation rate | ≥ 95% of dimension scores include at least one quote validated against parsed document | Validator logs |
| Calculator correctness | Gold reference scorecard produces section totals A=1.60, B=1.20, C=0.84, total ∈ [3.64, 3.80] | Unit tests |
| Time to report (p50) | ≤ 10 minutes end-to-end for typical 5MAP (excl. human review) | Run manifest timestamps |
| Consultant acceptance | Managing Director or delegate signs off structure and sample output as “client-sendable with light edit” | Calibration session |
| Critical failures | Zero reports shipped with LLM-computed totals (math must be code-owned) | Architecture review |

### 3.3 Non-goals for Phase 1

See Section 11 (Out of scope).

---

## 4. User personas and use cases

### 4.1 Personas

**P-A: Leading Change consultant (primary)**  
Delivers 5MAP coaching and client feedback. Needs trustworthy scores, coaching language aligned to methodology, and exportable reports. May upload optional higher-level intent decks and workshop context. Does not need to understand LLM configuration.

**P-B: Practice lead / managing director (sponsor)**  
Owns methodology and commercial outcomes. Needs confidence in consistency, version control of rubrics, and visibility into system usage and quality. Approves report structure before branded template investment.

**P-C: Platform engineer / intern builder (operator)**  
Configures deployments, monitors failures, runs regression tests against gold examples, rotates API keys. Maintains prompt packs and rubric JSON versions.

**P-D: Client executive (future)**  
Authors 5MAP in workshops. **Out of scope for Phase 1** — will not self-serve evaluate own homework until explicitly approved.

### 4.2 Use cases

| ID | Use case | Actor | Phase |
|----|----------|-------|-------|
| UC-01 | Evaluate a single client 5MAP and produce a briefing report | Consultant | 1 |
| UC-02 | Evaluate 5MAP with higher-level intent for alignment scoring | Consultant | 1 |
| UC-03 | Re-run evaluation after rubric or prompt version bump (compare runs) | Engineer | 1 |
| UC-04 | Review run history, scores, and failure rates | Practice lead | 2 |
| UC-05 | Export report to branded Word/PDF | Consultant | 2 |
| UC-06 | Evaluate a set of related 5MAPs for team alignment | Consultant | 3 |
| UC-07 | Trigger evaluation from M365 (upload via Teams/SharePoint flow) | Consultant | 3 |
| UC-08 | Attach optional client workshop artefacts (landscape maps) | Consultant | 3 |

---

## 5. Functional requirements

Requirements use **MUST / SHOULD / MAY** per RFC 2119 style. IDs are stable for traceability to `docs/TASKMASTER.md`.

### 5.1 Rubric and scoring engine

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-RUB-01 | The system MUST load a versioned weighted rubric (`weighted_rubric_v2025_12_01` or successor) defining nine dimensions, weights summing to 100%, and 1–5 level descriptors | P0 |
| FR-RUB-02 | The system MUST compute weighted contributions as `integer_score × weight` per dimension; overall score MUST be the sum of contributions, maximum 5.0 | P0 |
| FR-RUB-03 | The system MUST map overall score to interpretation bands: 4.5–5.0 exceptional; 4.0–4.4 strong; 3.0–3.9 adequate; &lt;3.0 weak | P0 |
| FR-RUB-04 | The system MUST NOT allow an LLM to compute or override weighted totals or section aggregates | P0 |
| FR-RUB-05 | The system MUST expose section subtotals for A (40%), B (30%), and C (30%) | P0 |
| FR-RUB-06 | Rubric updates MUST increment version identifier and be recorded on every evaluation run | P1 |

**Dimension catalogue (authoritative weights):**

| Section | Dimension | Weight |
|---------|-----------|--------|
| A | Clarity of outcome (“what”) | 20% |
| A | Clarity of purpose (“why”) | 20% |
| B | Alignment with higher direction, strategy and context | 15% |
| B | Alignment of 5MAP priorities/tasks with intent | 15% |
| C | Conciseness | 6% |
| C | Outcome-focused (not task-focused) | 6% |
| C | Utility for decentralised decision-making | 6% |
| C | Testability / verifiability | 6% |
| C | Energy and engagement | 6% |

### 5.2 Document ingestion and parsing

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PARSE-01 | The system MUST accept 5MAP/5QMA inputs as PowerPoint (`.pptx`) primary format | P0 |
| FR-PARSE-02 | The parser MUST produce a structured `FiveMapDocument` with slide-level IDs, text, and optional speaker notes | P0 |
| FR-PARSE-03 | The parser MUST map content into five logical sections: Q1 context (incl. higher intent where present), Q2 intent and measures, Q3 tasks and main effort, Q4 boundaries, Q5 achievability and back-brief readiness | P0 |
| FR-PARSE-04 | The system SHOULD accept optional higher-level intent as separate `.pptx` or PDF | P1 |
| FR-PARSE-05 | Parsed output MUST be cached by content hash to avoid redundant processing | P1 |
| FR-PARSE-06 | When section boundaries cannot be inferred confidently, the system MUST flag `low_confidence_sections` on the run | P1 |
| FR-PARSE-07 | The system MAY support manual section override via configuration for non-standard templates | P2 |

### 5.3 AI-assisted dimension scoring

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-LLM-01 | Each dimension MUST be scored in a separate structured LLM call (or fixed batch per section) returning integer 1–5 | P0 |
| FR-LLM-02 | Each dimension result MUST include at least one evidence quote and slide/section reference | P0 |
| FR-LLM-03 | Evidence quotes MUST be validated against parsed document text before acceptance; failed validation MUST trigger bounded retry | P0 |
| FR-LLM-04 | Prompts MUST inject locked rubric descriptors and relevant 5MAP coaching guidance; rubric text MUST NOT be retrieved via fuzzy RAG | P0 |
| FR-LLM-05 | LLM temperature MUST default to 0; model ID and prompt manifest hash MUST be logged | P0 |
| FR-LLM-06 | Alignment dimensions MUST incorporate higher-level intent text when supplied | P1 |
| FR-LLM-07 | The system MUST NOT reference documents not provided for the run | P0 |
| FR-LLM-08 | The system MAY support optional per-run client context documents in a later phase (isolated retrieval scope) | P3 |

### 5.4 Report generation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-RPT-01 | Every evaluation MUST produce a report conforming to the canonical 14-section structure (see Section 9.2) | P0 |
| FR-RPT-02 | Dimension and total score tables MUST be populated from the scoring engine, not LLM freeform | P0 |
| FR-RPT-03 | Narrative sections MUST be generated only after scores are finalised; prompts MUST forbid score modification | P0 |
| FR-RPT-04 | Executive summary MUST NOT exceed 200 words | P0 |
| FR-RPT-05 | Each 5MAP question (Q1–Q5) commentary MUST include: score (optional subscore), strengths, gaps/risks, suggested improvements | P0 |
| FR-RPT-06 | Appendix A MUST document scoring rationale for all nine dimensions and section totals | P0 |
| FR-RPT-07 | Phase 1 output formats MUST include JSON (machine-readable) and Markdown (human-readable) | P0 |
| FR-RPT-08 | Improvement suggestions MUST be actionable and tied to rubric dimensions that would raise the weighted score | P1 |
| FR-RPT-09 | The system SHOULD support branded Word export matching Leading Change template | P2 |
| FR-RPT-10 | The system MAY generate a short consultant email wrapper summarising the report | P2 |

### 5.5 Evaluation orchestration (CLI and API)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ORCH-01 | A single `evaluate` operation MUST execute: parse → score → validate → calculate → narrate → render | P0 |
| FR-ORCH-02 | Each run MUST receive a unique `run_id` and write artefacts under an isolated output directory | P0 |
| FR-ORCH-03 | Run artefacts MUST include: `parsed.json`, `scorecard.json`, `report.json`, `report.md`, `trace.jsonl`, `run_manifest.json` | P0 |
| FR-ORCH-04 | The CLI MUST support non-interactive execution suitable for CI regression | P1 |
| FR-ORCH-05 | A HTTP API MAY be exposed in Phase 2 for UI and integrations | P2 |

### 5.6 Consultant workbench (upload UI)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-UI-01 | Phase 1 MUST provide a minimal web UI for file upload and report download | P1 |
| FR-UI-02 | UI MUST display overall weighted score and interpretation band prominently | P1 |
| FR-UI-03 | UI MUST NOT persist client files beyond configured retention without explicit policy | P0 |
| FR-UI-04 | UI SHOULD show per-dimension scores and evidence quotes for consultant review before export | P2 |

### 5.7 Management dashboard

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-DASH-01 | Phase 2 SHOULD provide a dashboard for practice leads showing evaluation volume, success/failure rates, and average scores over time | P2 |
| FR-DASH-02 | Dashboard MUST NOT expose client document content by default; aggregate metrics only unless authorised role | P0 |
| FR-DASH-03 | Dashboard SHOULD show rubric version and model version distribution across runs | P2 |
| FR-DASH-04 | Dashboard SHOULD support filtering by date range, consultant (if authenticated), and client engagement ID | P2 |
| FR-DASH-05 | Dashboard MAY include calibration view: system vs consultant scores for gold-set 5MAPs | P3 |

### 5.8 Administration and methodology governance

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ADM-01 | Rubric and prompt pack versions MUST be immutable once published; changes require new version ID | P1 |
| FR-ADM-02 | System MUST support regression test suite against gold scorecards and structural report lint | P1 |
| FR-ADM-03 | Role-based access MUST separate consultant (evaluate), admin (configure), and viewer (dashboard) in Phase 2+ | P2 |

---

## 6. Non-functional requirements

### 6.1 Consistency and correctness

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-CON-01 | Deterministic weighted aggregation | Bit-identical totals for identical scorecards |
| NFR-CON-02 | LLM score stability | ≤ 0.1 total variance on 3 runs (same file, config, model) |
| NFR-CON-03 | Structural report validity | 100% pass on section linter for gold path |
| NFR-CON-04 | Evidence grounding | ≥ 95% quotes validated against source parse |

### 6.2 Performance and latency

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PERF-01 | Parse typical 5MAP (≤30 slides) | &lt; 60 seconds |
| NFR-PERF-02 | Full evaluation (9 LLM calls + narrative) | &lt; 10 minutes p50 |
| NFR-PERF-03 | Cached re-parse | &lt; 5 seconds |

### 6.3 Security and confidentiality

| ID | Requirement |
|----|-------------|
| NFR-SEC-01 | Client 5MAP and reports MUST be treated as confidential per mutual NDA |
| NFR-SEC-02 | Client artefacts MUST NOT be committed to source control or used for model fine-tuning |
| NFR-SEC-03 | API keys and secrets MUST reside in environment configuration only |
| NFR-SEC-04 | Outputs MUST be stored in tenant-controlled storage in production |
| NFR-SEC-05 | Pre-existing Leading Change IP remains with Leading Change; platform retains rights to generic engine without proprietary methodology or client data |
| NFR-SEC-06 | Production SHOULD support encryption at rest and in transit (TLS 1.2+) |

### 6.4 Auditability and compliance

| ID | Requirement |
|----|-------------|
| NFR-AUD-01 | Every report footer or manifest MUST include: rubric_version, prompt_manifest_hash, model_id, input_sha256, timestamp_utc |
| NFR-AUD-02 | Trace logs MUST capture per-dimension prompts hashes and token usage (not necessarily full prompt text in production if sensitive) |
| NFR-AUD-03 | System MUST be able to reproduce a run given run_id and stored artefacts |

### 6.5 Availability and operability

| ID | Requirement | Phase |
|----|-------------|-------|
| NFR-OPS-01 | Graceful degradation when LLM provider unavailable | Clear error, no partial client-facing report |
| NFR-OPS-02 | Health check endpoint | Phase 2 API |
| NFR-OPS-03 | Monthly gold regression in CI | Phase 1 |

### 6.6 Usability

| ID | Requirement |
|----|-------------|
| NFR-UX-01 | Consultant-facing language MUST be constructive, professional, non-judgmental (aligned with agent builder guidelines) |
| NFR-UX-02 | Reports MUST use numbered sections for client reference |
| NFR-UX-03 | Error messages MUST be actionable (e.g. parse failure vs evidence validation failure) |

---

## 7. System architecture overview

### 7.1 Architectural principles

1. **Pipeline over chat** — fixed stages with validated handoffs.  
2. **Code owns math** — LLMs judge qualitative levels; application computes weights.  
3. **Schema-first** — Pydantic models and JSON Schema at every boundary.  
4. **Version everything** — rubric, prompts, models, parsers.  
5. **Evidence or reject** — no unsubstantiated dimension scores.

### 7.2 High-level component diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Presentation layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │ Consultant   │  │ Management   │  │ M365 shell (Phase 3)         │ │
│  │ Workbench UI │  │ Dashboard    │  │ Power Automate / Copilot     │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┬───────────────┘ │
└─────────┼─────────────────┼──────────────────────────┼─────────────────┘
          │                 │                          │
          ▼                 ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         API / orchestration layer                        │
│              EvaluateController · RunRepository · Auth (Ph2+)            │
│              LangGraph-style DAG or explicit Python orchestrator         │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Core processing pipeline                         │
│                                                                          │
│  ┌────────────┐   ┌────────────┐   ┌─────────────┐   ┌──────────────┐ │
│  │ Ingestion  │──►│ Parsing    │──►│ Scoring     │──►│ Narrative    │ │
│  │ (upload)   │   │ (Docling)  │   │ (LLM+valid.)│   │ (LLM)        │ │
│  └────────────┘   └────────────┘   └──────┬──────┘   └──────┬───────┘ │
│                                           │                  │         │
│                                           ▼                  ▼         │
│                                    ┌────────────┐   ┌──────────────┐   │
│                                    │ Calculator │   │ Report       │   │
│                                    │ (Python)   │   │ renderer     │   │
│                                    └────────────┘   └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Knowledge layer (static)                         │
│  Versioned rubric JSON · Prompt packs · Reference manifest (5MAP guide)  │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         External services                                │
│  LLM provider (Azure OpenAI / OpenAI) · Object storage · Identity (AAD)  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Processing flow

1. **Ingest** — Validate file type, compute SHA-256, assign `run_id`.  
2. **Parse** — Produce `FiveMapDocument` (+ optional `HigherIntentDocument`).  
3. **Score** — For each of nine dimensions, LLM returns structured `DimensionScore`; evidence validator runs.  
4. **Calculate** — Pure functions compute weighted rows, section totals, band.  
5. **Assemble skeleton** — Populate `EvaluationReport` tables and placeholders.  
6. **Narrate** — Section writers fill executive summary, Q1–Q5 commentary, appendix (frozen scores).  
7. **Render** — Emit Markdown and JSON; optional DOCX in Phase 2.  
8. **Lint and persist** — Structural linter, manifest, traces.

### 7.4 Technology recommendations (Phase 1 baseline)

| Layer | Technology |
|-------|------------|
| Language | Python 3.11+ |
| Validation | Pydantic v2 |
| Parsing | Docling (primary), python-pptx (fallback) |
| LLM | Provider with structured outputs (e.g. Azure OpenAI GPT-4.1 family) |
| Orchestration | In-process pipeline; LangGraph optional for retries |
| UI | Streamlit (MVP) → React or internal portal (Phase 2) |
| Tests | pytest, gold fixtures, stability integration tests |
| CI | GitHub Actions or Azure DevOps |

---

## 8. Data models

### 8.1 Core entities

**`Rubric`** (versioned configuration)  
- `version`, `dimensions[]` with `id`, `name`, `section`, `weight`, `levels{1..5}`  
- `interpretation_bands[]`

**`FiveMapDocument`**  
- `map_title`, `source_filename`, `slides[]` (`slide_id`, `title`, `text`, `notes`)  
- `sections` (`q1_context`, `q2_intent`, `q3_tasks`, `q4_boundaries`, `q5_backbrief`)  
- `low_confidence_sections: bool`

**`HigherIntentDocument`** (optional)  
- `title`, `summary`, `slides[]` or `full_text`

**`DimensionScore`**  
- `dimension_id`, `score` (int 1–5)  
- `evidence_quotes[]` (`quote`, `slide_id`)  
- `rationale` (internal / appendix)  
- `gaps[]`, `improvements[]` (optional at dimension level)

**`Scorecard`**  
- `run_id`, `rubric_version`, `dimension_scores[]`  
- `section_totals` {A, B, C}, `total_weighted`, `interpretation_band`  
- `higher_intent_provided: bool`

**`EvaluationReport`**  
- Metadata: `run_id`, `created_at`, `map_title`  
- Narrative blocks for sections 2–4, 7–14  
- Tables: `dimension_scores_table`, `total_weighted_table`  
- `question_commentary[]` for Q1–Q5  
- `appendix_a[]`

**`EvaluationRun`** (persistence)  
- `run_id`, `status`, `input_hashes`, `artefact_paths`, `config_snapshot`, `errors[]`

### 8.2 Canonical 14-section report map

| § | Section title |
|---|----------------|
| 1 | Evaluation report (title) |
| 2 | Executive summary (≤200 words) |
| 3 | Purpose of this briefing note |
| 4 | Alignment of overall intent to higher intent (Q1) |
| 5 | Dimension scores (table) |
| 6 | Total weighted score (table) |
| 7 | Commentary by 5MAP question (introduction) |
| 8 | Q1 — Context and higher intent |
| 9 | Q2 — Intent and measures of success |
| 10 | Q3 — Tasks and main effort |
| 11 | Q4 — Boundaries (freedoms and constraints) |
| 12 | Q5 — Achievability and back-brief readiness |
| 13 | Overall assessment |
| 14 | Appendix A — Scoring rationale |

### 8.3 Artefact storage layout (per run)

```
outputs/{run_id}/
  parsed.json
  scorecard.json
  report.json
  report.md
  trace.jsonl
  run_manifest.json
```

---

## 9. Integration requirements

### 9.1 Phase 1 (minimal)

| Integration | Requirement |
|-------------|-------------|
| LLM API | HTTPS API with structured JSON output; API key via environment |
| Local / cloud filesystem | Writable `outputs/` and `cache/` directories |

### 9.2 Phase 2 (enterprise hardening)

| Integration | Requirement |
|-------------|-------------|
| Azure OpenAI | Preferred alignment with Leading Change M365 estate |
| Azure AD | SSO for consultant workbench and dashboard |
| Blob storage | Encrypted storage for uploads and reports with retention policy |
| Secrets management | Azure Key Vault or equivalent |

### 9.3 Phase 3 (M365 workflow)

| Integration | Requirement |
|-------------|-------------|
| SharePoint / OneDrive | Ingest 5MAP from agreed folder; write reports to consultant-controlled location |
| Power Automate | Flow triggered on file upload → call Evaluate API → notify consultant |
| Copilot Studio (optional) | Thin orchestration calling backend; **business logic remains in Intent Evaluator service** |
| Microsoft Graph | File metadata and permissions only; not primary parse path |

**Integration principle:** M365 components are **channels**, not scoring engines. All methodology logic stays in the Intent Evaluator service for testability and consistency.

---

## 10. Out of scope

The following are explicitly excluded unless approved via change control:

| Item | Rationale |
|------|-----------|
| Client self-service evaluation | Commercial and methodology risk; Phase 3+ decision |
| Fine-tuning on client or LC proprietary documents | IP, NDA, rubric churn |
| Vector RAG over rubric corpora | Retrieval drift; static injection preferred |
| LLM-computed weighted totals | Consistency failure mode |
| Branded Word template parity in Phase 1 | Defer until Markdown structure signed off |
| Multi-5MAP team alignment analysis | Separate epic; requires set semantics |
| Real-time in-workshop coaching / live slide editing | Mobile app / coach-mode is future product |
| Legal, financial, or HR advice | Explicitly excluded per agent guidelines |
| Automated sending of reports to clients without human review | Human consultant remains accountable |
| Replacement of 5MAP PowerPoint authoring tool | Separate “coach app” initiative |

---

## 11. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM score drift between runs | Medium | High | Per-dimension calls, T=0, structured outputs, stability tests, optional median-of-3 for borderline |
| Hallucinated evidence | Medium | High | Substring/fuzzy validator; retry; fail run if unrecoverable |
| PPTX template variability | High | Medium | Heuristic mapping + low-confidence flag; manual override YAML; blank template from LC |
| Missing gold 5MAP inputs for testing | High | Medium | Synthetic fixtures; consultant calibration session; gitignored client fixtures |
| Rubric methodology change | Medium | Medium | Versioned rubric JSON; regression suite; explicit migration notes |
| Confidentiality breach | Low | Critical | No client data in git; retention limits; Azure tenant isolation |
| Consultant rejection of AI tone | Medium | High | Narrative prompts grounded in LC guides; human edit step; calibration feedback loop |
| API cost overrun | Medium | Low | Cheaper model for extraction; cache parses; batch narrative where safe |
| M365 integration complexity | Medium | Medium | API-first backend; defer Copilot-in-prompt logic |
| Scope creep (dashboard, DOCX, teams) | High | Medium | Phased roadmap; PRD change control |

---

## 12. Phased delivery roadmap

### Phase 0 — Foundation (Week 0–1)

**Deliverables:** Repository structure, architecture record, reference manifest, gold scorecard specification, stakeholder input requests (blank 5MAP template, anonymised sample).

**Exit criteria:** Engineering can run empty test suite; gold math documented; no secrets in repo.

---

### Phase 1 — Scoring engine and report skeleton (Weeks 1–2)

**Deliverables:**  
- Versioned rubric JSON and Pydantic models  
- Deterministic calculator with unit tests (gold reference totals)  
- `EvaluationReport` schema and Markdown renderer  
- CLI `score` and `report` from manual scorecard  

**Exit criteria:** Gold scorecard → correct tables and 14-section Markdown without LLM.

---

### Phase 2 — Parsing and LLM scoring (Weeks 3–4)

**Deliverables:**  
- Docling-based PPTX parser → `FiveMapDocument`  
- Nine dimension scorers with evidence validation  
- CLI `evaluate` producing scorecard + skeleton report  
- Stability integration test  

**Exit criteria:** End-to-end run on synthetic 5MAP; weighted total variance within target; evidence validation ≥ 95%.

---

### Phase 3 — Narrative and consultant workbench (Weeks 5–6)

**Deliverables:**  
- Section narrative generators (frozen scorecard)  
- Full `evaluate` pipeline with JSON + Markdown  
- Structural report linter  
- Streamlit workbench (upload → download)  
- Run manifest and reproducibility footer  
- Calibration pack for practice lead review  

**Exit criteria:** Practice lead approves sample output as structurally client-ready; stability tests green in CI.

---

### Phase 4 — Operations dashboard and export (Weeks 7–10)

**Deliverables:**  
- Run persistence and aggregate metrics API  
- Management dashboard (volume, pass/fail, score distributions, version drift)  
- Authenticated access (Azure AD)  
- Branded Word export via template engine  
- Optional consultant email wrapper generation  

**Exit criteria:** Practice lead can view operational metrics without accessing client content; DOCX export matches approved branding.

---

### Phase 5 — Enterprise and M365 integration (Weeks 11–16)

**Deliverables:**  
- Azure-hosted API with blob storage and Key Vault  
- SharePoint/OneDrive ingest and report write-back  
- Power Automate connector  
- Optional client context document slot (controlled RAG)  
- Multi-5MAP team evaluation (pilot)  

**Exit criteria:** Consultant completes evaluation from M365-uploaded file without local CLI; security review passed.

---

### Phase 6 — Commercial scale (future)

**Deliverables:** Client-facing proposition support, pricing/positioning tooling, coach-mode app exploration, advanced calibration analytics.

**Gate:** Explicit commercial and methodology sign-off from Leading Change.

---

## 13. Dependencies and assumptions

### 13.1 Dependencies

- Leading Change provides blank 5MAP template and at least one anonymised completed example for parser tuning.  
- Leading Change provides consultant reference scores for calibration (nine dimensions) on at least one gold 5MAP.  
- Mutual NDA and IP terms remain in force for all client artefacts.  
- LLM provider account available for development and pilot (Azure OpenAI preferred for production).

### 13.2 Assumptions

- 5MAP remains the primary submission format (PowerPoint) for Phase 1–2.  
- Dec 2025 weighted rubric is authoritative until Leading Change publishes a new version.  
- Consultants remain in the loop before any report is sent to clients.  
- Phase 1 users are English-language documents only.

---

## 14. Glossary

| Term | Definition |
|------|------------|
| **5MAP / 5QMA** | Five-question mission alignment plan; interchangeable terms for the same artefact |
| **Intent** | Outcome-focused statement of what and why (not a task list or role description) |
| **Higher intent** | Strategic intent one or more levels above the submitter in the organisation |
| **Dimension score** | Integer 1–5 per rubric dimension before weighting |
| **Weighted total** | Sum of (dimension score × weight); maximum 5.0 |
| **Gold example** | Reference evaluation (e.g. simplification case ~3.8/5.0) used for regression |
| **Run** | Single end-to-end evaluation execution with unique `run_id` |

---

## 15. Document approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Product sponsor (Leading Change) | | | |
| Engineering lead | | | |
| Author | | | |

---

## Appendix A — Traceability to engineering backlog

Functional areas in this PRD map to `docs/TASKMASTER.md` (v1.1+). **Each engineering task lists required PRD sections in “Read before starting” as document D16 (`docs/PRD.md`).** Phase gates in the taskmaster require the phase’s PRD sections to be read before work begins. See taskmaster **Appendix C** for the full PRD ↔ task map.

| PRD section | Taskmaster phase | Primary FR/NFR IDs |
|-------------|------------------|-------------------|
| §5.1 Rubric | P1 | FR-RUB-01–06 |
| §5.2 Parsing | P3 | FR-PARSE-01–07 |
| §5.3 LLM scoring | P4 | FR-LLM-01–08 |
| §5.4 Report | P2, P5 | FR-RPT-01–10 |
| §5.5 Orchestration | P5, P6 | FR-ORCH-01–05 |
| §5.6 Workbench | P6 | FR-UI-01–04 |
| §5.7 Dashboard | P7-T08 / PRD Phase 4 | FR-DASH-01–05 |
| §5.8 Admin | P6 | FR-ADM-01–03 |
| §6 NFRs | P4, P6 | NFR-CON-*, NFR-AUD-*, etc. |
| §9 Integrations | P7 | §9.2–9.3 |
| §10 Out of scope | P0, P7 | — |

---

*End of PRD v1.0*
