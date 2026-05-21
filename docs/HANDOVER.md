# Intent Evaluator Handover

## What works now

- Deterministic rubric engine and weighted calculator with gold regression coverage.
- Parser supports synthetic JSON and PPTX parse path with cache keyed by input hash.
- End-to-end CLI pipeline (`evaluate`) with trace logging, run manifest, and reproducibility footer.
- Report outputs in JSON + Markdown with canonical 14-section structure checks.
- Streamlit consultant demo for upload/text input -> generate -> download.
- Calibration pack includes session agenda + consultant score template CSV.
- Mark pilot docs are available in `docs/DEPLOYMENT_PILOT.md` and `docs/MARK_TESTING_GUIDE.md`.

## PRD phase mapping (D16 Section 12)

| Shipped in repo | D16 roadmap mapping |
|---|---|
| P0-P1 foundation + scoring engine | D16 Phase 0-1 |
| P2-P5 parsing/scoring/report pipeline | D16 Phase 2-3 |
| P6 evaluation harness + demo + calibration pack | D16 Phase 3 exit readiness |
| P7 deferred features | D16 Phase 4-6 |

## Known limitations

- Live LLM evaluate requires configured provider key (`OPENAI_API_KEY` or future Anthropic implementation).
- Real client PPTX calibration is pending D15 inputs; synthetic fixtures are currently the baseline.
- Hosted Mark URL is pending deployment host/account setup.
- DOCX branded export is intentionally deferred.
- M365/Azure integrations are intentionally deferred.

## Deferred items (Phase 7)

- `P7-T01`: DOCX render via `docxtpl` from D7 template
- `P7-T02`: Consultant email wrapper generation
- `P7-T03`: Azure OpenAI / M365 deployment shell
- `P7-T04`: SharePoint + Power Automate integration shell
- `P7-T05`: Multi-5MAP team-set evaluation
- `P7-T06`: Optional client context RAG slot
- `P7-T07`: LangGraph + Temporal durability
- `P7-T08`: Management dashboard

## Document reference index (D1-D16)

- `D1`: `OneDrive_1_5-21-2026/SINGLE CANONICAL SOURCE FOR THE INTENT WIZARD AGENT.docx`
- `D2`: `OneDrive_1_5-21-2026/Organisational Intent Statement Rubric 01 Dec 25.docx`
- `D3`: `OneDrive_1_5-21-2026/Intent Quality Criteria 01 Dec 25.pdf`
- `D4`: `OneDrive_1_5-21-2026/5MAP Coaching Guide Release 5.0.pdf`
- `D5`: `OneDrive_1_5-21-2026/Generic Briefing Notes for Intent Statements Sep 2022.pdf`
- `D6`: `OneDrive_1_5-21-2026/Agent Builder's instructions.docx`
- `D7`: `OneDrive_1_5-21-2026/5MAP Agent Report Template.docx`
- `D8`: `Gmail - INTENT EVALUATOR.pdf` (workspace reference pack)
- `D9`: `Gmail - Can I take one thing off your plate_.pdf` (workspace reference pack)
- `D10`: `docs/ARCHITECTURE.md`
- `D11`: `docs/TASKMASTER.md`
- `D12`: `rubrics/weighted_rubric_v2025_12_01.json`
- `D13`: `fixtures/gold_simplification_scorecard.json`
- `D14`: `fixtures/synthetic_5map_parsed.json`
- `D15`: blank/anonymized real 5MAP `.pptx` (not in repo; follow-up validation only)
- `D16`: `docs/PRD.md`
