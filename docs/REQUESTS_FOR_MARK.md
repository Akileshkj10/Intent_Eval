# Requests for Leading Change — evaluation inputs

**Purpose:** Unblock parser development (P3-T02), calibration (P6-T05), and end-to-end validation (P6-T06).  
**Audience:** Mark Bouch / Leading Change practice lead (PRD persona P-B).

---

## Email body (copy-ready, ≤300 words)

Subject: Intent Evaluator — sample 5MAP files for build and calibration

Hi Mark,

We have the rubric, canonical report rules, and your Simplification evaluation example (scores and structure) in the build. To finish the evaluator pipeline, we still need the **input** files the agent scores, not only the output report.

Could you please share:

1. **Blank 5MAP template** (current flip-chart PowerPoint, e.g. LTI Resource 5MAP Blank v5.0) — for parser layout.  
2. **One completed 5MAP** we may use in a secure dev environment — anonymised client map or your **commercial example** is fine.  
3. **Matching higher-level intent** deck for that example (if used for alignment scoring).  
4. **Consultant reference scores** (1–5 per rubric dimension) for that same 5MAP — so we calibrate to your judgement, not only the pilot AI run.  
5. Confirmation we have access to the **OneDrive reference folder** you mentioned, or a zip of those files if easier.

We will **not** store client files in git; local/tenant-only storage with NDA in force.

Happy to jump on a short call after you have a chance to attach these.

Best regards,  
Akilesh

---

## Ask registry

| # | Item | Unblocks |
|---|------|----------|
| 1 | Blank 5MAP `.pptx` | **P3-T02** parser heuristics |
| 2 | Anonymised or commercial completed 5MAP | **P3-T05**, **P6-T06** integration tests |
| 3 | Higher-level intent for same example | **P4-T07**, UC-02 |
| 4 | Consultant 1–5 scores per dimension | **P6-T05** calibration, MAE in `docs/EVAL.md` |
| 5 | OneDrive / reference pack access | Verify D1–D7 parity with repo |

---

## Data handling

- Client `.pptx` and reports: **confidential** (mutual NDA).  
- **Do not** commit to version control (see `.gitignore`: `*.pptx`, `tests/fixtures_client/`).  
- Use `tests/fixtures_client/` locally only, with README, when files arrive.

---

*PRD: §13.1 dependencies, UC-01, UC-02 (D16).*
