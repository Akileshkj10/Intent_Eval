# Improvement Version Taskmaster — Robust Output + Report Format

**Scope:** Fix issues discovered during real PPTX UI testing and align the Next.js output with Mark's required canonical report format.
**Constraint:** Existing scoring quality, weighted calculation, evidence formatting, file upload flow, and targeted recommendations must be preserved.

---

## Phase I1 — Robust Claude JSON Handling

### I1-T1: Add safe JSON extraction utility
- Create a small utility in `nextjs-app/lib/evaluator.ts` or `nextjs-app/lib/json.ts`
- It should handle:
  - Claude returning JSON inside markdown fences
  - leading/trailing prose around JSON
  - minor trailing commas if safe to repair
  - malformed JSON producing a clear internal error
- **AC:** Unit/script test proves valid JSON, fenced JSON, and JSON with surrounding prose parse correctly.

### I1-T2: Add one retry on malformed Claude JSON
- If JSON parsing fails for a Claude response, retry once with a strict repair prompt:
  - "Return only valid JSON matching the schema. Do not include markdown."
  - Include the previous invalid response only if useful and safe.
- Do not retry for API key errors, rate limits, or non-JSON application errors.
- **AC:** A mocked malformed first response followed by valid JSON succeeds without changing the returned schema.

### I1-T3: Improve error message shown in UI
- Replace raw parse errors such as `Expected double-quoted property name...`
- User-facing message should say:
  - "The AI response was not valid JSON. Please retry. If this repeats, use a shorter input or contact support."
- Log detailed parse error server-side only.
- **AC:** UI shows a useful message; raw JSON parser internals are not exposed to the user.

---

## Phase I2 — PPTX Text Spacing Cleanup

### I2-T1: Add text-normalisation pass after extraction
- Improve `nextjs-app/lib/parsePptx.ts` output formatting.
- Fix common spacing issues from adjacent PowerPoint runs:
  - `Performancemanagement` → `Performance management` where XML run boundaries indicate separate words
  - `boss):[Name/Appointment/Role]` → `boss): [Name/Appointment/Role]`
  - missing spaces after punctuation before placeholders/brackets
  - duplicated spaces and excessive blank lines
- **AC:** No loss of real content; only whitespace/spacing is changed.

### I2-T2: Preserve meaningful slide structure
- Keep the existing structured format:
  ```
  [Slide N — "Title"]
  Body:
  ...
  Notes:
  ...
  ```
- Avoid flattening all slide content into one paragraph.
- **AC:** Q1-Q5 section detection still works on the same real PPTX files.

### I2-T3: Regression test real PPTX files
- Test at least these two files:
  - `Client 5maps/Hospitality/5QMA Participation v2.pptx`
  - `Client 5maps/Manufacturing/5MAP - Leadership.pptx`
- Check for:
  - no crashes
  - expected slide count
  - Q-section signals present
  - no obvious joined-word artefacts such as `Performancemanagement`
- **AC:** Both files pass automated checks and manual first-page preview review.

---

## Phase I3 — Restore Mark's Canonical Report Format

### I3-T1: Confirm final section map
- Use `SINGLE CANONICAL SOURCE FOR THE INTENT WIZARD AGENT.pdf` as the format source.
- Restore the canonical 14-section structure:
  1. Evaluation report title
  2. Executive summary
  3. Purpose of this briefing note
  4. Alignment of overall intent to higher intent
  5. Dimension scores
  6. Total weighted score
  7. Commentary / improvement introduction
  8. Q1 — Context and higher intent
  9. Q2 — Intent and measures of success
  10. Q3 — Tasks and main effort
  11. Q4 — Boundaries
  12. Q5 — Achievability and back-brief readiness
  13. Overall assessment
  14. Appendix A — Scoring rationale
- **AC:** Section order matches the canonical source and existing Python renderer/test checklist.

### I3-T2: Keep new improvements inside canonical structure
- Replace old long "Commentary by Question" behaviour with concise, useful narrative.
- Keep `Targeted Improvement Recommendations` as the improvement content within section 7 or immediately after section 7 if Mark accepts that label.
- Do not force 3 recommendations if fewer are genuinely useful.
- **AC:** Recommendations remain 0-3, prioritised, specific, and tied to weak weighted dimensions.

### I3-T3: Extend Claude response schema for narrative sections
- Add structured fields for:
  - `purposeOfBriefingNote`
  - `alignmentToHigherIntent`
  - `commentaryIntro`
  - `q1Commentary`
  - `q2Commentary`
  - `q3Commentary`
  - `q4Commentary`
  - `q5Commentary`
  - `overallAssessment`
  - `appendixRationale`
- Each Q commentary should include:
  - strengths
  - gaps/risks
  - suggested improvements
- **AC:** Scores and weighted totals remain computed by code, not generated or changed by Claude narrative.

### I3-T4: Update Next.js report rendering
- Render all 14 sections in the UI.
- Keep the current clean table styles.
- Keep evidence format in dimension table:
  - one clean rationale sentence
  - `[5MAP input]`
  - quote on a separate italicized line
- **AC:** UI output reads like a complete client briefing, not a short score summary.

### I3-T5: Guard against quality regression
- Add tests that verify:
  - all 14 headings exist
  - 9 dimension scores are present
  - total weighted score equals code-calculated total
  - evidence formatting is unchanged
  - recommendations still render and are not always forced to 3
- **AC:** Existing P1-P5 tests still pass plus new improvement tests pass.

---

## Phase I4 — Full End-to-End Verification

### I4-T1: Build check
- Run `npx next build`
- **AC:** 0 compile errors and 0 TypeScript errors.

### I4-T2: Real PPTX smoke tests
- Test both real files through the UI:
  - Hospitality Participation
  - Manufacturing Leadership
- Verify:
  - file badge appears
  - extraction/loading state appears correctly
  - report generation succeeds
  - output has all 14 sections
  - no obvious spacing artefacts in the report
- **AC:** Both files produce complete client-readable reports.

### I4-T3: Regression checks for text and PDF modes
- Text paste still generates report.
- PDF upload still uses direct Claude document path.
- **AC:** No cross-contamination between `text`, `pptx`, and `pdf` modes.

### I4-T4: Commit and push
- Commit message: `Improve JSON reliability, PPTX spacing, and canonical report format`
- Push to `main` on `Akileshkj10/Intent_Eval`
- **AC:** GitHub shows commit and Vercel auto-redeploys.

---

## Explicit Non-Goals
- Do not change rubric weights.
- Do not change the score bands.
- Do not let Claude compute weighted totals.
- Do not remove PDF support.
- Do not remove PPTX client-side extraction.
- Do not weaken evidence formatting.
- Do not make the report unnecessarily long; canonical format should still be concise and client-ready.

---

## Quality Bar
- The finished report should match Mark's required structure.
- The writing should still feel like a Leading Change consultant briefing.
- Fixes should be additive and controlled, not a rebuild.
