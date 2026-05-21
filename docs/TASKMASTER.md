# Intent Evaluator — Taskmaster

**Project:** Leading Change 5MAP / 5QMA Intent Evaluator  
**Version:** 1.1  
**Last updated:** 2026-05-21  
**Status:** Phase 0 complete — Phase 1 ready

This document is the single execution checklist for the build. Every task lists **Read before starting**, **Depends on**, and **Acceptance criteria**.

### PRD reading rule (**D16**)

**D16** — `docs/PRD.md` — is the **product** source of truth (*what* to build, *why*, NFRs, personas, scope). **D1** remains the **methodology** source of truth (rubric wording, 14-section titles). When a task lists **D16 §…**, read those PRD sections before starting.

| Phase | PRD sections (read once per engineer entering the phase) |
|-------|----------------------------------------------------------|
| **P0** | §1 Executive summary, §2 Problem, §3 Goals, §4 Personas, §7 Architecture, §10 Out of scope, §12 Roadmap (Phase 0) |
| **P1** | §5.1 Rubric engine, §3.2 Success metrics, §8.1 Data models |
| **P2** | §5.4 Report generation, §8.2 14-section map |
| **P3** | §5.2 Parsing, §8.1 `FiveMapDocument`, §6.2 Performance |
| **P4** | §5.3 LLM scoring, §6.1 Consistency, §7.3 Processing flow |
| **P5** | §5.4–§5.5 Report + orchestration, §6.6 Usability |
| **P6** | §5.5–§5.8 (orchestration, workbench, dashboard, admin), §6 NFRs, §3.2 Metrics |
| **P7** | §9 Integrations, §10 Out of scope, §12 Roadmap (Phases 4–6) |

**PRD quick map:** §5.1 Rubric · §5.2 Parsing · §5.3 LLM · §5.4 Report · §5.5 Orchestration · §5.6 Workbench · §5.7 Dashboard · §5.8 Admin · §6 NFRs · §8 Data models · §9 Integrations · §10 Out of scope

---

## Document registry (what each artifact is for)

| ID | Path / source | Use |
|----|----------------|-----|
| **D16** | `docs/PRD.md` | **Product requirements:** goals, FR/NFR IDs, architecture, data models, roadmap, out of scope — read per phase table above |
| **D1** | `OneDrive_1_5-21-2026/SINGLE CANONICAL SOURCE FOR THE INTENT WIZARD AGENT.docx` (+ `_extracted.txt`) | **Authoritative:** prompt rules, weighted rubric, 14-section report structure, score bands |
| **D2** | `OneDrive_1_5-21-2026/Organisational Intent Statement Rubric 01 Dec 25.docx` (+ `_extracted.txt`) | 1–5 descriptors per dimension (calibration; unweighted) |
| **D3** | `OneDrive_1_5-21-2026/Intent Quality Criteria 01 Dec 25.pdf` | 9 internal quality criteria (coaching language; not client-facing) |
| **D4** | `OneDrive_1_5-21-2026/5MAP Coaching Guide Release 5.0.pdf` | Q1–Q5 definitions, facilitator checklist, tasking rules |
| **D5** | `OneDrive_1_5-21-2026/Generic Briefing Notes for Intent Statements Sep 2022.pdf` | What “intent” means for clients (wording in feedback) |
| **D6** | `OneDrive_1_5-21-2026/Agent Builder's instructions.docx` (+ `_extracted.txt`) | Copilot agent tone, workflow, limitations |
| **D7** | `OneDrive_1_5-21-2026/5MAP Agent Report Template.docx` (+ `_extracted.txt`) | **Deferred** Word layout reference only (lorem ipsum; not Phase 1 output) |
| **D8** | Gmail PDF: `Gmail - INTENT EVALUATOR.pdf` (Cursor workspaceStorage) | Mark’s **gold example output:** Simplification 5QMA report, 3.8/5.0 tables, prompt, consultant email |
| **D9** | Gmail PDF: `Gmail - Can I take one thing off your plate_.pdf` | Project origin, 5MAP intro, NDA, Phase 1/2/3 scope, consistency problem |
| **D10** | `docs/ARCHITECTURE.md` | Created in **P0-T04** — pipeline, scoring split, tech choices |
| **D11** | `docs/TASKMASTER.md` | This file |
| **D12** | `rubrics/weighted_rubric_v2025_12_01.json` | Created in **P1-T01** — machine-readable rubric |
| **D13** | `fixtures/gold_simplification_scorecard.json` | Created in **P1-T03** — dimension scores from D8 |
| **D14** | `fixtures/synthetic_5map_parsed.json` | Created in **P2-T02** — hand-built parse until real PPTX |
| **D15** | Blank / client 5MAP `.pptx` | **Not in repo** — request from Mark; track as follow-up validation only (do not block active tasks) |

**Architecture decisions (from research — implement via D10):**
- LLM scores 1–5 + evidence only; **Python computes all weighted totals**
- Structured outputs (JSON Schema / Pydantic); validate → retry
- Phase 1 output: **Markdown + JSON** (not D7 DOCX)
- Small rubric corpus: **inject D1/D4 excerpts in prompts**, not vector RAG for rubric
- Optional per-run client context files later (RAG slot)

---

## Dependency graph (phases)

```
P0 (Setup)
  └─► P1 (Rubric + calculator + gold fixture)
        └─► P2 (Schemas + fixtures + manual report)
              └─► P3 (Parsing)
                    └─► P4 (LLM scoring)
                          └─► P5 (Narrative + Markdown report)
                                └─► P6 (CLI/API + eval + demo)
                                      └─► P6.A (Phase 1 pilot additions)
P7 (Deferred): DOCX template, M365, team-set eval
```

---

## Phase 0 — Project foundation

**Goal:** Repo structure, environment, shared docs, no product logic yet.  
**Estimated duration:** 1–2 days  
**PRD required reading (phase gate):** D16 §1, §2, §3, §4, §7, §10, §12 (Phase 0)

---

### P0-T01 — Initialize Python project layout

**Read before starting:** **D16 §1, §12**; D11 (this file §Phase 0); D10 (after P0-T04 — or architecture bullets in §Document registry)

**Depends on:** None

**Subtasks:**
1. Create directories: `src/intent_evaluator/`, `tests/`, `rubrics/`, `fixtures/`, `prompts/`, `docs/`, `scripts/`
2. Add `pyproject.toml` with Python ≥3.11, dependencies: `pydantic`, `pytest`, `python-dotenv`, `pyyaml` (minimal set)
3. Add `src/intent_evaluator/__init__.py`
4. Add `.gitignore`: `.env`, `__pycache__/`, `.venv/`, `outputs/`, `*.pptx` (client files), `.cursor/`
5. Add `README.md` stub: project purpose, links to `docs/PRD.md` and `docs/TASKMASTER.md`, how to run tests

**Acceptance criteria:**
- [x] `pip install -e ".[dev]"` or `pip install -r requirements.txt` succeeds in clean venv
- [x] `pytest` runs (0 tests OK)
- [x] `.env` is gitignored; README warns not to commit secrets
- [x] README links to **D16** (`docs/PRD.md`)

---

### P0-T02 — Environment and secrets template

**Read before starting:** **D16 §6.3, §9.1**; D11 (P0-T01 output paths); existing `.env` (keys only — do not copy values into repo)

**Depends on:** P0-T01

**Subtasks:**
1. Add `.env.example` with `OPENAI_API_KEY=`, `ANTHROPIC_API_KEY=` (or primary provider only), `EVALUATOR_MODEL=`, `EVALUATOR_TEMPERATURE=0`
2. Add `src/intent_evaluator/config.py`: load env via `python-dotenv`; expose `Settings` pydantic model
3. Document in README: required vars for Phase 4+

**Acceptance criteria:**
- [x] App starts without `.env` but LLM tasks fail with clear error message
- [x] With valid `.env`, `Settings` loads model name and temperature=0 default
- [x] No secret values committed (only `.env.example`)

---

### P0-T03 — Extract and version reference text from OneDrive pack

**Read before starting:** D1, D2, D6, D7 (all `_extracted.txt` if present; else run `scripts/extract_docx.py`); **D16 §13.1** (reference dependencies)

**Depends on:** P0-T01

**Subtasks:**
1. Ensure `scripts/extract_docx.py` exists and regenerates `*_extracted.txt` for all `.docx` in `OneDrive_1_5-21-2026/`
2. Add `reference/manifest.yaml` listing D1–D7 paths, SHA256 optional, `version: 2025-12-01`
3. Copy or symlink policy: keep originals in `OneDrive_1_5-21-2026/`; do not duplicate PDFs

**Acceptance criteria:**
- [x] All four docx have corresponding `_extracted.txt` with non-empty content
- [x] `reference/manifest.yaml` lists every D1–D7 file with description

---

### P0-T04 — Write architecture decision record

**Read before starting:** **D16 §7 (full), §10, §11, §12**; D1; D8; D9; D11; align with D16 §5 functional overview and §6 NFRs

**Depends on:** P0-T01

**Subtasks:**
1. Create `docs/ARCHITECTURE.md` with sections: Context, Goals, Non-goals (cross-check **D16 §10**), Pipeline diagram (align **D16 §7.2–7.3**), Scoring ownership (LLM vs Python per **D16 §5.1 FR-RUB-04**), Output formats (JSON + MD per **D16 §5.4**), Parsing (Docling per **D16 §5.2**), LLM policy (T=0, structured outputs per **D16 §5.3**), Eval strategy (**D16 §3.2**), Security/NDA (**D16 §6.3**), Future (Temporal, Azure, DOCX per **D16 §12**)
2. Link `fixtures/synthetic_5map_parsed.json` as active bootstrap dependency; track D15 as optional follow-up validation dependency **[AWAITING D15]**
3. Add “Related documents” header linking **D16** and **D1**

**Acceptance criteria:**
- [x] `docs/ARCHITECTURE.md` exists and is ≥2 pages equivalent
- [x] Explicit statement: weighted total **must not** be computed by LLM (traceable to **D16 FR-RUB-04**)
- [x] Marked deferred items match P7 in this taskmaster and **D16 §10**
- [x] Architecture doc references **D16** by section at least once per major component

---

### P0-T05 — Extract Mark gold example into structured fixture spec

**Read before starting:** D8 (full thread; focus May 8 1:11 PM email: prompt, Client Briefing Note tables, dimension scores); D1 (compare section names vs canonical 14); **D16 §3.2** (gold metrics), **§5.4**, **§8.3** (run artefacts)

**Depends on:** P0-T04

**Subtasks:**
1. Create `docs/gold_example_simplification.md`: transcribe from D8:
   - Overall score 3.8, band text
   - Section A/B/C table: criterion, weight %, score 1–5, weighted value, evidence strings
   - Q1–Q5 commentary themes (Mark’s manual bullets + AI themes)
   - Note gaps vs canonical (e.g. “Key Strengths” in email vs section 13 in D1)
2. Create empty placeholder `fixtures/gold_simplification_scorecard.json` with schema comment only

**Acceptance criteria:**
- [x] `docs/gold_example_simplification.md` contains all 9 dimension integer scores from D8
- [x] Documented mapping: D8 “Alignment with Higher Direction” → D1 dimension id `alignment_higher_direction`
- [x] Sum of weighted contributions documented and equals **3.64** (or explains 3.8 rounding/display)

---

### P0-T06 — Mark request checklist (inputs we lack)

**Read before starting:** D9, `fixtures/synthetic_5map_parsed.json`, D8 (attachments mentioned but missing), D4 (blank template mentioned in Feb email); **D16 §4** (personas), **§13.1** (dependencies), **UC-01, UC-02**  **[AWAITING D15]**

**Depends on:** P0-T05

**Subtasks:**
1. Create `docs/REQUESTS_FOR_MARK.md` with numbered asks:
   - Blank 5MAP PPTX (`LTI Resource 5MAP Blank Flip Chart Template 5.0` or current)
   - One anonymised completed 5MAP OR commercial example
   - Matching higher-level intent deck for that example
   - Consultant reference scores (1–5 per dimension) for calibration
   - OneDrive link access confirmation
2. Add “do not store client files in git” note

**Acceptance criteria:**
- [x] `docs/REQUESTS_FOR_MARK.md` is send-ready (bullet email body ≤300 words)
- [x] Each ask tied to task IDs that unblock (P3-T02, P6-T05)

---

## Phase 1 — Deterministic rubric and scoring engine

**Goal:** Rubric in code; calculator passes gold math; no LLM.  
**Estimated duration:** 3–4 days  
**Depends on:** Phase 0 complete  
**PRD required reading (phase gate):** D16 §5.1, §3.2, §8.1

---

### P1-T01 — Encode weighted rubric as JSON

**Read before starting:** D1 (SCORING RUBRIC section only), D2 (descriptor text for dimensions 1–8; S1–S5 in D1); **D16 §5.1** (dimension catalogue, FR-RUB-01–06)

**Depends on:** P0-T03, P0-T05

**Subtasks:**
1. Create `rubrics/weighted_rubric_v2025_12_01.json` with:
   - `version`, `max_score: 5.0`
   - `dimensions[]`: `id`, `name`, `section` (A|B|C), `weight`, `formula` (e.g. `score * 0.20`), `levels` {1..5: descriptor}
   - IDs: `clarity_outcome`, `clarity_purpose`, `alignment_higher_direction`, `alignment_tasks`, `conciseness`, `outcome_focused`, `decentralised_utility`, `testability`, `energy_engagement`
2. Add `interpretation_bands`: 4.5–5.0, 4.0–4.4, 3.0–3.9, <3.0 with exact strings from D1

**Acceptance criteria:**
- [x] JSON validates against internal JSON Schema or pydantic model in `src/intent_evaluator/rubric/models.py`
- [x] Sum of all `weight` fields = `1.0` (±0.0001)
- [x] 9 dimensions with weights: 0.20, 0.20, 0.15, 0.15, 0.06×5
- [x] Every level 1–5 has non-empty descriptor text from D1/D2

---

### P1-T02 — Pydantic models for rubric and scorecard

**Read before starting:** D12 (P1-T01 output), D1 (score types: integer 1–5 only); **D16 §8.1** (`Rubric`, `DimensionScore`, `Scorecard`)

**Depends on:** P1-T01

**Subtasks:**
1. `src/intent_evaluator/rubric/models.py`: `Dimension`, `Rubric`, `DimensionScore` (dimension_id, score: int 1–5, evidence_quotes[], slide_refs[] optional for later), `Scorecard` (list of DimensionScore + metadata)
2. `src/intent_evaluator/rubric/load.py`: load JSON → `Rubric`

**Acceptance criteria:**
- [x] Loading D12 returns `Rubric` with 9 dimensions
- [x] `DimensionScore.score` rejects 0, 6, floats via pydantic validation

---

### P1-T03 — Populate gold scorecard fixture from Mark example

**Read before starting:** D8, `docs/gold_example_simplification.md` (P0-T05), D12; **D16 §3.2** (calculator correctness metric)

**Depends on:** P1-T02, P0-T05

**Subtasks:**
1. Fill `fixtures/gold_simplification_scorecard.json`:
   - `map_title`: "Simplification 5QMA"
   - `dimension_scores`: all 9 scores from D8 (4,4,5,3,3,3,3,3,2)
   - `source`: "Gmail INTENT EVALUATOR May 8 2026"
2. Add `expected_section_totals`: A=1.60, B=1.20, C=0.84, `expected_total_min`: 3.64, `expected_total_max`: 3.80

**Acceptance criteria:**
- [x] Fixture loads in tests without error
- [x] 9 dimension scores match D8 tables exactly

---

### P1-T04 — Implement weighted score calculator (Python only)

**Read before starting:** D1 (formulas), D12, P1-T02 models; **D16 §5.1 FR-RUB-02–05**, **§6.1 NFR-CON-01**

**Depends on:** P1-T03

**Subtasks:**
1. `src/intent_evaluator/scoring/calculator.py`:
   - `weighted_contribution(dimension_id, score) -> float`
   - `section_totals(scorecard) -> {A, B, C}`
   - `total_weighted_score(scorecard) -> float` rounded to 2 decimals
   - `interpretation_band(total) -> str` from D12 bands
2. No LLM imports in this module

**Acceptance criteria:**
- [x] Gold fixture total ∈ [3.64, 3.80]
- [x] Section A=1.60, B=1.20, C=0.84 for gold fixture
- [x] Score all 5s → total 5.0; all 1s → total 1.0
- [x] Changing one dimension only affects its section total

---

### P1-T05 — Unit tests for calculator

**Read before starting:** P1-T04, `fixtures/gold_simplification_scorecard.json`; **D16 §3.2** (gold calculator targets)

**Depends on:** P1-T04

**Subtasks:**
1. `tests/test_calculator.py`: gold totals, edge cases (min/max), invalid score rejection
2. Parametrize each dimension weight from D12

**Acceptance criteria:**
- [x] `pytest tests/test_calculator.py` all green
- [x] Coverage on `calculator.py` ≥90%

---

### P1-T06 — CLI: compute score from JSON scorecard

**Read before starting:** P1-T04, P1-T03; **D16 §5.5 FR-ORCH-02** (run artefacts — partial)

**Depends on:** P0-T02, P1-T05

**Subtasks:**
1. `src/intent_evaluator/cli.py` subcommand: `python -m intent_evaluator score --scorecard fixtures/gold_simplification_scorecard.json`
2. Print: section totals, total, interpretation band (JSON or table to stdout)

**Acceptance criteria:**
- [x] Command runs and prints total consistent with P1-T05
- [x] Exit code 0 on valid input; non-zero on invalid score

---

## Phase 2 — Report schema, fixtures, manual end-to-end

**Goal:** Full report data model; render Markdown from gold scorecard without LLM.  
**Estimated duration:** 3–4 days  
**Depends on:** Phase 1 complete  
**PRD required reading (phase gate):** D16 §5.4, §8.2

---

### P2-T01 — Define 14-section EvaluationReport schema

**Read before starting:** D1 (REPORT STRUCTURE MANDATORY — sections 1–14), D8 (compare optional sections: Key Strengths, Alignment summary, Bottom Line); **D16 §5.4 FR-RPT-01–07**, **§8.2** (canonical 14-section map)

**Depends on:** P1-T02

**Subtasks:**
1. `src/intent_evaluator/report/schema.py` pydantic models:
   - `EvaluationReport`: metadata (run_id, map_title, rubric_version, created_at)
   - `executive_summary` (str, max 2000 chars validator warn if >200 words)
   - `purpose` (str)
   - `alignment_to_higher_intent` (str; optional if no higher intent)
   - `dimension_scores_table` (rows: dimension, weight, score, weighted, evidence[])
   - `total_weighted_score_table` (sections A/B/C + total + band)
   - `question_commentary[]` (q1..q5: question_label, section_score optional, strengths, gaps_risks, suggested_improvements)
   - `overall_assessment` (str)
   - `appendix_a` (per-dimension rationale list)
2. Document in schema docstring mapping: canonical §8–12 → Q1–Q5 labels from D1

**Acceptance criteria:**
- [x] Model has fields for all 14 canonical sections (title may be `report_title` for §1)
- [x] JSON schema export saved to `schemas/evaluation_report.json`
- [x] Deliberate optional fields for D8 extras (`key_strengths`, `bottom_line`) flagged `optional_legacy: true` in comments

---

### P2-T02 — Create synthetic parsed 5MAP fixture

**Read before starting:** D4 (Q1–Q5 content rules), D8 (quoted 5MAP phrases: simplification scope, KPIs, task verbs), `docs/gold_example_simplification.md`; **D16 §8.1** (`FiveMapDocument`), **§13.2** (synthetic until D15)

**Depends on:** P0-T05

**Subtasks:**
1. Define `src/intent_evaluator/parsing/schema.py`: `FiveMapDocument` with `slides[]` {slide_id, title, text, notes}, `sections` {q1_context, q2_intent, q3_tasks, q4_boundaries, q5_backbrief}
2. Create `fixtures/synthetic_5map_parsed.json` with ≥5 slides, text derived from D8 evidence strings
3. Add `fixtures/synthetic_higher_intent.json` (short sector intent paragraph from D8)

**Acceptance criteria:**
- [x] `FiveMapDocument` loads in pydantic
- [x] Each Q1–Q5 section has ≥100 characters of text
- [x] At least 3 `slide_id` values referenced in gold evidence strings exist in fixture

---

### P2-T03 — Build Scorecard → EvaluationReport assembler (no LLM)

**Read before starting:** P2-T01, P1-T04, P1-T03, D1 (narrative must justify scores — use placeholder text pattern); **D16 §5.4 FR-RPT-02–03**, **§7.3** steps 5–6

**Depends on:** P2-T01, P1-T04

**Subtasks:**
1. `src/intent_evaluator/report/assembler.py`:
   - Input: `Scorecard`, `Rubric`, optional `FiveMapDocument`, optional higher intent
   - Fills tables from calculator outputs
   - Populates placeholder narrative fields: `"[PENDING LLM]"` for exec summary, Q commentary, appendix rationales
2. `build_report_skeleton(scorecard, ...) -> EvaluationReport`

**Acceptance criteria:**
- [x] Gold scorecard → report with correct numeric tables and band
- [x] All 14 sections present in serialized JSON
- [x] No field in dimension table is LLM-generated in this task

---

### P2-T04 — Markdown renderer

**Read before starting:** P2-T01, D8 (table layout reference), D1 (section order); **D16 §5.4 FR-RPT-07**, **§6.6 NFR-UX-02**

**Depends on:** P2-T03

**Subtasks:**
1. `src/intent_evaluator/report/render_markdown.py`: `render(report: EvaluationReport) -> str`
2. Use numbered headings matching D1 §2–14
3. Tables: GitHub-flavored markdown for dimension + total tables
4. `outputs/` written on CLI run (gitignored)

**Acceptance criteria:**
- [x] `render` produces valid MD with all section headings in order
- [x] Gold run tables show 3.64–3.80 total and 9 dimension rows
- [x] Output file `outputs/{run_id}/report.md` created via CLI

---

### P2-T05 — CLI: skeleton report from gold scorecard

**Read before starting:** P2-T03, P2-T04, P1-T06; **D16 §8.3** (output artefact layout)

**Depends on:** P2-T04

**Subtasks:**
1. Extend CLI: `python -m intent_evaluator report --scorecard fixtures/gold_simplification_scorecard.json --map fixtures/synthetic_5map_parsed.json --out outputs/gold_run`
2. Write `report.md` + `report.json`

**Acceptance criteria:**
- [x] Single command produces both files
- [x] `report.json` validates against P2-T01 schema
- [x] Mark’s dimension scores visible in MD tables without manual editing

---

### P2-T06 — Stub evidence validator interface

**Read before starting:** D10 (evidence anchoring), P2-T02; **D16 §5.3 FR-LLM-03**, **§6.1 NFR-CON-04**

**Depends on:** P2-T02

**Subtasks:**
1. `src/intent_evaluator/scoring/evidence_validator.py`:
   - `validate_quote_exists(quote: str, document: FiveMapDocument, threshold=0.85) -> bool`
   - Normalise whitespace; substring or fuzzy ratio (document library `rapidfuzz` optional)
2. Tests with quotes from synthetic fixture (pass) and fake quote (fail)

**Acceptance criteria:**
- [x] Validator returns True for exact substring from synthetic map
- [x] Returns False for `"this text does not exist in the map"`
- [x] No LLM calls

---

## Phase 3 — Document parsing pipeline

**Goal:** PPTX → `FiveMapDocument`; cache by file hash.  
**Estimated duration:** 4–5 days  
**Depends on:** Phase 2 complete  
**Blocked by:** None (use `fixtures/synthetic_5map_parsed.json` until D15 arrives for optional real-template validation)  **[AWAITING D15]**
**PRD required reading (phase gate):** D16 §5.2, §8.1, §6.2

---

### P3-T01 — Add Docling dependency and spike

**Read before starting:** D10 (parsing section), D4 (what text must be captured per question), Docling README (external); **D16 §5.2**, **§7.4** (Docling)

**Depends on:** P0-T01

**Subtasks:**
1. Add `docling` to project dependencies
2. `scripts/spike_docling_pptx.py`: accept path arg, print JSON snippet (first 2 slides)
3. Record findings in `docs/parsing_notes.md`: slide boundaries, notes field, limitations

**Acceptance criteria:**
- [x] Spike runs on any `.pptx` path without crashing (empty file OK to skip)
- [x] `docs/parsing_notes.md` exists with ≥5 bullet findings
- [x] Decision recorded: Docling primary vs python-pptx fallback

---

### P3-T02 — Implement PPTX parser adapter

**Read before starting:** P3-T01 notes, P2-T02 `FiveMapDocument` schema, D4 (Q1–Q5), `fixtures/synthetic_5map_parsed.json` (bootstrap fixture; do not block on D15); **D16 §5.2 FR-PARSE-01–06**, **§8.1**  **[AWAITING D15]**

**Depends on:** P3-T01, P2-T02

**Subtasks:**
1. `src/intent_evaluator/parsing/docling_adapter.py`: `parse_pptx(path) -> FiveMapDocument`
2. Map slides to `slide_id` = `slide_{index}` or title slug
3. Heuristic section assignment:
   - Rule 1: slide title contains "Context"|"Q1" → q1
   - Rule 2: "Intent"|"Q2" → q2; etc. (document rules in code comments from D4)
   - Fallback: concatenate all slides into `q2_intent` with warning flag `low_confidence_sections: true`
4. Store raw parse in `outputs/{run_id}/parsed.json`

**Acceptance criteria:**
- [x] `parse_pptx` returns valid `FiveMapDocument` for minimal internal test pptx OR synthetic path documented
- [x] Every slide has non-empty `text` or `notes`
- [x] `parsed.json` written when CLI parse command runs

---

### P3-T03 — Parse CLI and content hash cache

**Read before starting:** P3-T02, P0-T02; **D16 §5.2 FR-PARSE-05**, **§6.2 NFR-PERF-03**

**Depends on:** P3-T02

**Subtasks:**
1. CLI: `python -m intent_evaluator parse --input path/to.pptx --out outputs/run_x`
2. Cache: SHA256 of file → `cache/parsed/{hash}.json` reuse if exists
3. Log warning if `low_confidence_sections`

**Acceptance criteria:**
- [x] Second parse of same file hits cache (log message "cache hit")
- [x] Different file → different cache key
- [x] Exit code 0 on successful parse

---

### P3-T04 — Higher intent parser (same adapter)

**Read before starting:** D8 (higher intent comparison in prompt), P3-T02; **D16 §5.2 FR-PARSE-04**, **§8.1** (`HigherIntentDocument`), **UC-02**

**Depends on:** P3-T02

**Subtasks:**
1. `parse_higher_intent(path) -> HigherIntentDocument` (title, summary text, slides[])
2. CLI flag on evaluate: `--higher-intent path.pptx`

**Acceptance criteria:**
- [x] Higher intent document loads alongside 5MAP in combined JSON output
- [x] Optional: if not provided, alignment dimension uses only Q1 text (documented in ARCHITECTURE)

---

### P3-T05 — Section detection tests with synthetic + real PPTX

**Read before starting:** P2-T02, `fixtures/synthetic_5map_parsed.json`, P3-T02; **D16 §11** (PPTX template variability risk)  **[AWAITING D15]**

**Depends on:** P3-T02

**Subtasks:**
1. `tests/test_parsing.py`: synthetic JSON → converter not required; pptx tests skip if `fixtures/sample_blank.pptx` missing (`pytest.mark.skip`)
2. Add `tests/fixtures_client/` gitignored + integration test scaffold now; run with synthetic fixture by default and keep real-template case as pending follow-up when D15 arrives

**Acceptance criteria:**
- [x] CI runs without D15 (skipped tests documented)
- [x] Synthetic fixture sections q1–q5 all non-empty when loaded via parser stub `load_json_fixture()`

---

### P3-T06 — Integrate parse into report CLI (no scoring yet)

**Read before starting:** P2-T05, P3-T03; **D16 §7.3** (ingest → parse)

**Depends on:** P3-T03, P2-T05

**Subtasks:**
1. `python -m intent_evaluator report --input map.pptx --scorecard fixtures/gold_simplification_scorecard.json`
2. Parse → attach map metadata to report JSON

**Acceptance criteria:**
- [x] Report JSON includes `source_map_hash` and `map_title` from parsed doc
- [x] Evidence strings in gold scorecard that exist in synthetic map pass P2-T06 validator in test

---

## Phase 4 — LLM dimension scoring layer

**Goal:** Structured dimension scores + evidence; calculator unchanged.  
**Estimated duration:** 5–7 days  
**Depends on:** Phase 3 complete (P3-T02 at minimum with synthetic path)  
**PRD required reading (phase gate):** D16 §5.3, §6.1, §7.3

---

### P4-T01 — Prompt pack structure and rubric injection

**Read before starting:** D1 (per-dimension descriptors), D3 (coaching angles), D4 (question-specific checks), D12, D10; **D16 §5.3 FR-LLM-01, 04, 07**, **§10** (no RAG on rubric)

**Depends on:** P1-T01, P0-T04

**Subtasks:**
1. `prompts/manifest.yaml`: version, list dimension prompt files
2. One file per dimension: `prompts/dimensions/clarity_outcome.yaml` with: system (evaluator role, NDA tone), rubric level text from D12, output JSON schema reference, rules (quote required, only provided docs)
3. `src/intent_evaluator/llm/prompt_loader.py`

**Acceptance criteria:**
- [x] 9 dimension YAML files exist
- [x] Each includes levels 1–5 text copied from D12 (not paraphrased away)
- [x] manifest version matches D12 `version`

---

### P4-T02 — Structured output schema for DimensionScore LLM response

**Read before starting:** P1-T02, D1 (integer 1–5), D10 (structured outputs); **D16 §8.1** (`DimensionScore`), **§5.3 FR-LLM-02**

**Depends on:** P4-T01

**Subtasks:**
1. `schemas/llm_dimension_response.json`: `{ "dimension_id", "score", "rationale", "evidence_quotes": [{ "quote", "slide_id" }], "gaps": [], "improvements": [] }`
2. Pydantic model `LLMDimensionResponse` with strict validation

**Acceptance criteria:**
- [x] Schema rejects float scores, empty evidence_quotes array (min 1 quote)
- [x] Compatible with OpenAI / Anthropic structured output modes documented in README

---

### P4-T03 — LLM client abstraction

**Read before starting:** P0-T02, D10 (T=0, pinned model); **D16 §5.3 FR-LLM-05**, **§7.4**, **§9.1**

**Depends on:** P0-T02

**Subtasks:**
1. `src/intent_evaluator/llm/client.py`: `complete_structured(prompt, schema) -> dict`
2. Implement OpenAI first (user has key in .env); interface allows second provider
3. Log: model name, prompt_hash, token usage to `outputs/{run_id}/trace.jsonl`

**Acceptance criteria:**
- [x] Mock test: fake client returns fixture response without network
- [x] Live test (marked `@pytest.mark.integration`): one dimension call returns valid schema when API key set
- [x] temperature=0 passed in API call (assert in mock)

---

### P4-T04 — Single dimension scorer end-to-end

**Read before starting:** P4-T01–T03, P2-T02, P3-T02, D4 (Q2 for clarity_outcome context); **D16 §5.3 FR-LLM-02–03**, **§7.3** step 3

**Depends on:** P4-T03, P3-T02

**Subtasks:**
1. `src/intent_evaluator/scoring/dimension_scorer.py`: `score_dimension(dimension_id, map_doc, higher_intent?, rubric) -> DimensionScore`
2. Build prompt context: relevant section text only (e.g. q2 for outcome/purpose dimensions)
3. Run evidence validator; if fail → 1 retry with “quote must be substring” instruction; else raise `EvidenceValidationError`

**Acceptance criteria:**
- [x] Integration test scores `clarity_outcome` on synthetic map (score 1–5, ≥1 validated quote)
- [x] Calculator applied to output changes total deterministically
- [x] Trace log contains prompt_hash

---

### P4-T05 — Score all nine dimensions (sequential MVP)

**Read before starting:** P4-T04, D1 (all dimensions), D3 (supporting qualities nuance); **D16 §5.3 FR-LLM-01**, **§5.1** (nine dimensions)

**Depends on:** P4-T04

**Subtasks:**
1. `score_all_dimensions(map, higher_intent?, rubric) -> Scorecard`
2. Sequential calls (parallel optional later); progress logging
3. CLI: `python -m intent_evaluator evaluate --input synthetic.json --llm` (or pptx parse path)

**Acceptance criteria:**
- [x] Full scorecard with 9 dimensions produced for synthetic map
- [x] `evaluate` writes `scorecard.json` + trace
- [x] Total score computed only via P1-T04 calculator

---

### P4-T06 — Stability test (variance gate)

**Read before starting:** D9 (consistency problem), D8 (target behaviour), P4-T05; **D16 §3.2** (weighted total variance), **§6.1 NFR-CON-02**

**Depends on:** P4-T05

**Subtasks:**
1. `tests/test_stability.py` (integration): same synthetic input, score `clarity_outcome` 5 times (or all 9 once if cost OK)
2. Assert: all 5 totals identical OR all 5 dimension scores identical for that dimension
3. Document failure threshold in `docs/EVAL.md`

**Acceptance criteria:**
- [ ] Test passes with T=0 on primary model OR documents known flaky dimension in EVAL.md with mitigation (retry/median)
- [ ] Weighted **total** variance ≤ 0.1 across 3 full runs (if API budget allows; else skip with note)

---

### P4-T07 — Alignment dimensions use higher intent

**Read before starting:** D8 (alignment 5 and 3 scores), P3-T04, P4-T05; **D16 §5.3 FR-LLM-06**, **§5.1** (alignment dimensions)

**Depends on:** P4-T05, P3-T04

**Subtasks:**
1. For `alignment_higher_direction`: prompt includes `HigherIntentDocument` text + q1_context
2. For `alignment_tasks`: prompt includes q2_intent + q3_tasks
3. Tests: without higher intent, prompt still runs with Q1-only per D10

**Acceptance criteria:**
- [ ] With `synthetic_higher_intent.json`, alignment dimension prompts include sector intent phrase from D8
- [ ] Scorecard JSON records `higher_intent_provided: true|false`

---

## Phase 5 — Narrative generation and full report

**Goal:** Replace `[PENDING LLM]` with prose; still no DOCX.  
**Estimated duration:** 5–6 days  
**Depends on:** Phase 4 complete  
**PRD required reading (phase gate):** D16 §5.4–§5.5, §6.6

---

### P5-T01 — Narrative prompt pack (section writers)

**Read before starting:** D1 (§2–14, ≤200 words exec summary), D5 (client-appropriate tone), D3 (internal depth for gaps), D6 (constructive tone), D8 (example narrative style); **D16 §5.4 FR-RPT-03–06**, **§6.6 NFR-UX-01**

**Depends on:** P4-T01

**Subtasks:**
1. `prompts/sections/` YAML files: executive_summary, purpose, alignment_to_higher_intent, q1..q5_commentary, overall_assessment, appendix_rationale
2. Each prompt receives **frozen** `Scorecard` + calculator totals as JSON — explicit instruction: **do not change scores**

**Acceptance criteria:**
- [x] 8+ section prompt files exist
- [x] Each contains "FORBIDDEN: modifying dimension scores" clause
- [x] Executive summary prompt enforces ≤200 words

---

### P5-T02 — Section narrative generator

**Read before starting:** P5-T01, P4-T03, P2-T01; **D16 §7.3** step 6 (narrate)

**Depends on:** P5-T01, P4-T05

**Subtasks:**
1. `src/intent_evaluator/narrative/section_generator.py`: `generate_section(name, report_skeleton) -> str`
2. Q commentary output parses into strengths / gaps / improvements fields (structured sub-schema or delimiter)

**Acceptance criteria:**
- [x] Integration: one Q2 section returns non-empty strengths and gaps
- [x] Word count validator on executive summary (fail retry once if >200 words)

---

### P5-T03 — Full narrative pipeline

**Read before starting:** P2-T03, P5-T02, D1 (section 7 header "Commentary by 5MAP Question"); **D16 §5.4 FR-RPT-01**, **§7.3** steps 5–7

**Depends on:** P5-T02

**Subtasks:**
1. `generate_full_narrative(skeleton) -> EvaluationReport` populated
2. Appendix A: one rationale paragraph per dimension referencing score + evidence

**Acceptance criteria:**
- [x] No field remains `[PENDING LLM]` after pipeline
- [x] Numeric tables unchanged after narrative pass (byte-equal JSON compare on score fields)

---

### P5-T04 — Per-question scores in commentary (optional subscores)

**Read before starting:** D1 (§8–12 format: Score | Strengths | Gaps | Improvements), D4 (checklist per Q); **D16 §5.4** (Q1–Q5 commentary structure)

**Depends on:** P5-T03

**Subtasks:**
1. Define optional `question_subscore` 1–5 per Q1–Q5 (LLM) — **not** mixed into weighted total unless Mark approves (default: omit from total)
2. Display in MD under each Q section

**Acceptance criteria:**
- [x] Documented in report JSON: `question_subscores` excluded from `total_weighted_score`
- [x] MD shows subscore line for each of 5 questions when enabled

---

### P5-T05 — End-to-end evaluate CLI

**Read before starting:** P3-T06, P4-T05, P5-T03, P2-T04; **D16 §5.5 FR-ORCH-01–03**, **§8.3**, **§7.3** (full flow)

**Depends on:** P5-T03, P3-T03

**Subtasks:**
1. `python -m intent_evaluator evaluate --input map.pptx [--higher-intent x.pptx] --out outputs/run_id`
2. Steps: parse → score → validate evidence → calculate → narrative → render MD/JSON
3. `README` quickstart updated

**Acceptance criteria:**
- [x] Single command produces `report.md`, `report.json`, `scorecard.json`, `trace.jsonl`, `parsed.json`
- [x] Runnable on synthetic fixture path without real pptx
- [x] Total score in report matches calculator

---

### P5-T06 — Gold example regression (structure + math, not exact prose)

**Read before starting:** D8, P1-T03, P5-T05, `docs/gold_example_simplification.md`; **D16 §3.2** (rubric compliance, calculator correctness)

**Depends on:** P5-T05

**Subtasks:**
1. `tests/test_gold_regression.py`:
   - Load gold scorecard → calculator → assert section totals and band "Adequate" range (3.0–3.9)
   - Structural assert on generated MD: headings for §2–14 present
2. **Do not** require LLM to reproduce 3.8 on synthetic map (different input)

**Acceptance criteria:**
- [x] Test passes using gold scorecard injection (bypass LLM)
- [x] Optional integration test: if env `RUN_LLM_GOLD=1`, compare dimension scores to gold within ±1 per dimension (document as soft)

---

## Phase 6 — Evaluation harness, UI demo, Mark readiness

**Goal:** Observable quality, demoable product, requests fulfilled.  
**Estimated duration:** 5–7 days  
**Depends on:** Phase 5 complete  
**PRD required reading (phase gate):** D16 §5.5–§5.8, §6 (all), §3.2

---

### P6-T01 — Evaluation documentation and metrics

**Read before starting:** D8, D9, D10, P4-T06, `docs/gold_example_simplification.md`; **D16 §3.2** (all Phase 1 metrics), **§6.1**, **§11**

**Depends on:** P5-T05

**Subtasks:**
1. Create `docs/EVAL.md`: metrics (total variance, per-dimension MAE vs consultant, evidence hit rate, section checklist pass rate)
2. Define `eval/checklist.yaml`: 14 required MD headings, 9 table rows, appendix presence

**Acceptance criteria:**
- [x] `EVAL.md` lists ≥4 metrics with formulas
- [x] Checklist validator function returns pass/fail + missing items list

---

### P6-T02 — Report structure linter

**Read before starting:** P6-T01 checklist, D1; **D16 §3.2** (structural report validity), **§5.4 FR-RPT-01**

**Depends on:** P6-T01, P2-T04

**Subtasks:**
1. `src/intent_evaluator/eval/structure_lint.py`: `lint_report_md(path) -> LintResult`
2. Wire into CLI: `--lint` flag on evaluate output

**Acceptance criteria:**
- [x] Gold MD run passes lint 100%
- [x] Removing a section heading causes lint fail with named section

---

### P6-T03 — Streamlit demo UI (upload → report)

**Read before starting:** P5-T05, D10 (security: local only); **D16 §5.6** (consultant workbench FR-UI-01–04), **§4 UC-01**, **§6.3**

**Depends on:** P5-T05

**Subtasks:**
1. `app/streamlit_app.py`: file upload 5MAP pptx, optional higher intent, run evaluate, download MD+JSON
2. Display total score + band prominently
3. Add disclaimer: confidential, not for client storage on server

**Acceptance criteria:**
- [x] `streamlit run app/streamlit_app.py` works locally
- [x] Upload synthetic pptx or json produces downloadable report
- [x] No files written outside `outputs/` session folder

---

### P6-T04 — Run manifest and reproducibility footer

**Read before starting:** D1 (audit), P4-T03 trace format; **D16 §6.4 NFR-AUD-01–03**, **§5.5 FR-ORCH-02**

**Depends on:** P5-T05

**Subtasks:**
1. Append to every `report.md` footer: rubric_version, model, prompt_manifest_hash, input_sha256, timestamp UTC
2. `run_manifest.json` alongside outputs

**Acceptance criteria:**
- [x] Re-running same input + config produces identical footer hash for prompt_manifest
- [x] manifest documents all 9 dimension prompt versions

---

### P6-T05 — Mark calibration session prep

**Read before starting:** `docs/REQUESTS_FOR_MARK.md`, D8, P6-T03, P1-T03; **D16 §4** (persona P-B), **§3.2** (consultant acceptance metric), **§12 Phase 3** exit criteria

**Depends on:** P6-T03, P0-T06

**Subtasks:**
1. Create `docs/CALIBRATION_SESSION.md`: agenda (30–45 min), live demo script, scoring sheet for Mark to fill (9 dimensions + overall)
2. Export blank CSV template `eval/consultant_scores_template.csv`

**Acceptance criteria:**
- [x] Session doc lists questions to resolve: subscores per Q, D8 extra sections, DOCX timing
- [x] CSV has 9 dimension rows + comments column

---

### P6-T06 — Process synthetic-first 5MAP pipeline **[AWAITING D15]**

**Read before starting:** `fixtures/synthetic_5map_parsed.json`, P3-T05 integration test notes, P6-T05; **D16 §13.1**, **§11** (missing gold inputs), **UC-01**  **[AWAITING D15]**

**Depends on:** P6-T03

**Subtasks:**
1. Add gitignored `tests/fixtures_client/README.md` (how to place files once D15 is provided) **[AWAITING D15]**
2. Run full evaluate on synthetic 5MAP now; record results in `docs/parsing_notes.md`
3. Keep a follow-up checklist to update section detection rules when D15 template is received **[AWAITING D15]**

**Acceptance criteria:**
- [x] Synthetic 5MAP parses with `low_confidence_sections: false` OR documented manual section map YAML override
- [x] Consultant scores template is prepared and ready for Mark input; real CSV collection tracked **[AWAITING D15]**
- [x] MAE pipeline documented in `EVAL.md` with synthetic baseline; real-MAP MAE follow-up tracked **[AWAITING D15]**

---

### P6-T07 — README and handover package

**Read before starting:** **D16 (full document)**; D11; D10; P5-T05; P6-T03

**Depends on:** P6-T02, P6-T03

**Subtasks:**
1. README: install, configure, evaluate command, streamlit, test tiers (`pytest` vs `pytest -m integration`); **onboarding order: PRD → ARCHITECTURE → TASKMASTER**
2. `docs/HANDOVER.md`: what works, what’s deferred (P7), known limitations; map shipped features to **D16 §12** phases

**Acceptance criteria:**
- [x] New developer can run gold report without API key in &lt;15 minutes
- [x] HANDOVER lists all D1–D16 references and Phase 7 items
- [x] README states **D16** is required reading before implementation work

---

## Phase 6.A — Phase 1 pilot additions

**Goal:** Make the Phase 1 evaluator easier for Mark to test by allowing text-entry 5MAP inputs in the UI and deploying a controlled online pilot.  
**Estimated duration:** 2–4 days  
**Depends on:** P6 complete  
**PRD required reading (phase gate):** D16 §5.5–§5.6, §6.3, §6.4, §9.1; D10 security and orchestration notes

---

### P6A-T01 — Text-input 5MAP support in parser layer

**Read before starting:** D14 (`fixtures/synthetic_5map_parsed.json`), D4 (Q1–Q5 definitions), D10 §6.2, **D16 §5.2 FR-PARSE-02–07**, **§8.1 `FiveMapDocument`**

**Depends on:** P3-T02, P3-T03

**Subtasks:**
1. Define a simple text input contract for consultants: either one free-text block with `Q1:`–`Q5:` labels or five separate text fields.
2. Add parser helper to convert text input into `FiveMapDocument` with deterministic synthetic `slide_id` values.
3. Set `source_filename` to a text-specific value such as `manual_text_input.txt`.
4. Preserve `low_confidence_sections=true` when Q1–Q5 labels cannot be confidently separated.
5. Add tests for complete labeled text, missing section labels, and minimum viable text.

**Acceptance criteria:**
- [x] Text input with Q1–Q5 labels produces a valid `FiveMapDocument`
- [x] Missing/ambiguous labels set `low_confidence_sections=true` instead of silently pretending confidence
- [x] Parser tests cover both complete and incomplete text input

---

### P6A-T02 — UI option for 5MAP text input

**Read before starting:** P6-T03, P6A-T01, `app/streamlit_app.py`, `app/pipeline.py`; **D16 §5.6 FR-UI-01–04**, **§6.6 NFR-UX-03**

**Depends on:** P6A-T01, P6-T03

**Subtasks:**
1. Add UI choice: upload `.pptx`/`.json` or paste 5MAP text.
2. Provide five optional text areas for Q1–Q5, plus guidance for pasted labeled text.
3. Save text input only inside the current `outputs/{session_id}` folder.
4. Reuse the existing report generation and download flow.
5. Display a warning when text input produces low-confidence sections.

**Acceptance criteria:**
- [x] Streamlit UI can generate a report from text input without requiring file upload
- [x] Text input writes no files outside `outputs/{session_id}`
- [x] UI exposes low-confidence warning when parser flags ambiguous sections

---

### P6A-T03 — Mark-accessible online pilot deployment

**Read before starting:** P6-T03, P6-T04, P6-T07, D10 §9 security, **D16 §5.6**, **§6.3 NFR-SEC-01–06**, **§9.1**

**Depends on:** P6A-T02

**Subtasks:**
1. Choose the lowest-friction pilot host (for example Streamlit Community Cloud, Render, Azure App Service, or internal tunnel) and document the decision.
2. Configure secrets through host environment settings only; never commit `.env` values.
3. Add a deployment guide (`docs/DEPLOYMENT_PILOT.md`) with setup, env vars, start command, and rollback steps.
4. Deploy a Mark-test instance with a non-production disclaimer and access restriction appropriate to the chosen host.
5. Run smoke test: upload/text input → generate report → download MD/JSON → verify `run_manifest.json`.

**Acceptance criteria:**
- [ ] Mark can access a deployed URL and run a synthetic/text-input evaluation **[BLOCKED: deployment host/account/URL required]**
- [x] Deployment guide includes host choice, required secrets, start command, rollback, and data-handling warning
- [x] No secrets are committed; deployment uses environment configuration only
- [ ] Smoke test evidence is recorded in `docs/DEPLOYMENT_PILOT.md` **[BLOCKED: deployed URL required]**

---

### P6A-T04 — Mark testing pack and feedback capture

**Read before starting:** P6-T05, P6A-T03, `docs/CALIBRATION_SESSION.md`, `eval/consultant_scores_template.csv`; **D16 §3.2 consultant acceptance**, **§4 persona P-B**

**Depends on:** P6A-T03

**Subtasks:**
1. Add a short Mark testing guide with what to try: file upload, text input, download outputs, score review.
2. Include known limitations: synthetic-first baseline, real `.pptx` calibration still **[AWAITING D15]**, consultant review required before client use.
3. Add feedback capture template for bugs, scoring disagreements, wording issues, and feature requests.
4. Link testing guide from `docs/HANDOVER.md`.

**Acceptance criteria:**
- [ ] Mark has a one-page test guide with URL, steps, and expected outputs **[BLOCKED: deployed URL required]**
- [x] Feedback template separates bugs, scoring calibration, wording/tone, and feature requests
- [x] Guide clearly says this is an internal pilot, not client self-service

---

## Phase 7 — Deferred (explicitly out of Phase 1 scope)

Track for post-sign-off; do not start until P6 Mark calibration confirms structure.  
**PRD required reading (phase gate):** D16 §9, §10, §12 (Phases 4–6)

| Task ID | Summary | Read when starting | Blocked by |
|---------|---------|-------------------|------------|
| **P7-T01** | DOCX render via `docxtpl` from D7 template | D7, P2-T01; **D16 §5.4 FR-RPT-09**, **§12 Phase 4** | Mark approves MD structure |
| **P7-T02** | Consultant email wrapper (Damon-style from D8) | D8; **D16 §5.4 FR-RPT-10** | P5 stable |
| **P7-T03** | Azure OpenAI / M365 deployment | D9, D10; **D16 §9.2–9.3**, **§12 Phase 5** | LC infra access |
| **P7-T04** | Copilot Studio / Power Automate front-end | D6; **D16 §9.3**, **§7.1** (M365 as channel) | P7-T03 |
| **P7-T05** | Multi-MAP team set evaluation | D9; **D16 §10**, **UC-06**, **§12 Phase 5** | Phase 1 single-MAP stable |
| **P7-T06** | Client context RAG (landscape maps) | D8 prompt §2; **D16 §5.3 FR-LLM-08**, **§10** | NDA storage policy |
| **P7-T07** | LangGraph + Temporal durability | D10; **D16 §7.2**, **§12** | Production volume |
| **P7-T08** | Management dashboard | **D16 §5.7** (full), **§4 persona P-B**, **§12 Phase 4** | P6 run persistence |

---

## Master checklist (phase gates)

| Phase | Gate (all must pass) |
|-------|----------------------|
| **P0** | **Done** — D16 §1–4, §7, §10, §12 read; P0-T01–T06 complete; ARCHITECTURE + REQUESTS_FOR_MARK + `reference/manifest.yaml` |
| **P1** | **D16 §5.1 read**; gold calculator tests green; CLI `score` prints 3.64–3.80 |
| **P2** | **D16 §5.4 read**; CLI `report` produces 14-section MD+JSON from gold scorecard |
| **P3** | **D16 §5.2 read**; CLI `parse` produces FiveMapDocument; cache works |
| **P4** | **D16 §5.3 read**; CLI `evaluate` produces 9 LLM scores + validated evidence (synthetic); NFR-CON-02 test documented |
| **P5** | **D16 §5.5 read**; full narrative evaluate; structure lint passes |
| **P6** | **D16 §5.6–5.8 read**; Streamlit demo + calibration docs; execute with synthetic fixture now, track real-PPTX validation **[AWAITING D15]** |
| **P6.A** | **D16 §5.5–5.6, §6.3–6.4, §9.1 read**; UI supports text input; Mark can access controlled online pilot |
| **P7** | **D16 §9–10 read**; sponsor sign-off on deferred scope |

---

## Task index (quick reference)

| ID | Title |
|----|--------|
| P0-T01 | Python project layout |
| P0-T02 | Environment template |
| P0-T03 | Reference text extraction |
| P0-T04 | ARCHITECTURE.md |
| P0-T05 | Gold example doc + fixture spec |
| P0-T06 | REQUESTS_FOR_MARK.md |
| P1-T01 | rubric JSON |
| P1-T02 | Rubric pydantic models |
| P1-T03 | Gold scorecard fixture |
| P1-T04 | Calculator |
| P1-T05 | Calculator tests |
| P1-T06 | score CLI |
| P2-T01 | EvaluationReport schema |
| P2-T02 | Synthetic 5MAP fixture |
| P2-T03 | Report assembler skeleton |
| P2-T04 | Markdown renderer |
| P2-T05 | report CLI |
| P2-T06 | Evidence validator stub |
| P3-T01 | Docling spike |
| P3-T02 | PPTX parser |
| P3-T03 | Parse CLI + cache |
| P3-T04 | Higher intent parser |
| P3-T05 | Parsing tests |
| P3-T06 | Parse + report integration |
| P4-T01 | Dimension prompt pack |
| P4-T02 | LLM response schema |
| P4-T03 | LLM client |
| P4-T04 | Single dimension scorer |
| P4-T05 | Score all dimensions |
| P4-T06 | Stability test |
| P4-T07 | Alignment + higher intent |
| P5-T01 | Narrative prompts |
| P5-T02 | Section generator |
| P5-T03 | Full narrative pipeline |
| P5-T04 | Question subscores (optional) |
| P5-T05 | evaluate CLI E2E |
| P5-T06 | Gold regression tests |
| P6-T01 | EVAL.md metrics |
| P6-T02 | Structure linter |
| P6-T03 | Streamlit UI |
| P6-T04 | Run manifest footer |
| P6-T05 | Calibration session prep |
| P6-T06 | Real 5MAP validation follow-up **[AWAITING D15]** |
| P6-T07 | README + HANDOVER |
| P6A-T01 | Text-input 5MAP parser support |
| P6A-T02 | UI option for pasted/text 5MAP input |
| P6A-T03 | Mark-accessible online pilot deployment |
| P6A-T04 | Mark testing pack + feedback capture |

---

## Appendix A — Gold dimension scores (from D8, for P1-T03)

| Dimension ID | Score | Weighted contribution |
|--------------|-------|------------------------|
| clarity_outcome | 4 | 0.80 |
| clarity_purpose | 4 | 0.80 |
| alignment_higher_direction | 5 | 0.75 |
| alignment_tasks | 3 | 0.45 |
| conciseness | 3 | 0.18 |
| outcome_focused | 3 | 0.18 |
| decentralised_utility | 3 | 0.18 |
| testability | 3 | 0.18 |
| energy_engagement | 2 | 0.12 |
| **Total** | | **3.64** (report may state 3.8) |

---

## Appendix B — Canonical 14-section report map (D1)

| § | Section | Produced by (phase) |
|---|---------|---------------------|
| 1 | EVALUATION REPORT (title) | P2-T04 |
| 2 | Executive Summary (≤200 words) | P5-T02 |
| 3 | Purpose of this briefing note | P5-T02 |
| 4 | Alignment to Higher Intent (Q1) | P5-T02 |
| 5 | Dimension scores (table) | P2-T03 (calculator) |
| 6 | Total weighted score (table) | P2-T03 |
| 7 | Commentary by 5MAP question (intro) | P5-T03 |
| 8 | Q1 Context and Higher Intent | P5-T02 |
| 9 | Q2 Intent and Measures of Success | P5-T02 |
| 10 | Q3 Tasks and Main Effort | P5-T02 |
| 11 | Q4 Boundaries | P5-T02 |
| 12 | Q5 Achievability & Back Brief | P5-T02 |
| 13 | Overall assessment | P5-T02 |
| 14 | Appendix A — Scoring Rationale | P5-T02 |

---

## Appendix C — PRD ↔ Taskmaster traceability

| PRD section | Primary tasks |
|-------------|----------------|
| §5.1 Rubric | P1-T01–T06 |
| §5.2 Parsing | P3-T01–T06 |
| §5.3 LLM scoring | P4-T01–T07 |
| §5.4 Report | P2-T01–T05, P5-T01–T06 |
| §5.5 Orchestration | P5-T05, P6-T04, P6A-T03 |
| §5.6 Workbench | P6-T03, P6A-T02, P6A-T04 |
| §5.7 Dashboard | P7-T08 |
| §5.8 Admin | P6-T01, P6-T04 |
| §6 NFRs | P4-T06, P6-T01–T02, P6-T04 |
| §9 Integrations | P6A-T03, P7-T03–T04 |
| §10 Out of scope | P0-T04, P7 (all) |

When a task’s acceptance criteria references an **FR-** or **NFR-** ID, verify against **D16** (`docs/PRD.md`).

---

*End of Taskmaster v1.1*
