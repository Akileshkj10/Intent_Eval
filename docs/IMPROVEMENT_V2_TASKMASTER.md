# Improvement Version 2 Taskmaster — Q Identification & PDF Export

**Scope:** Fix Q1–Q5 section detection failures on multi-slide / legacy PPTX templates, and add automated one-click PDF download of the evaluation report.
**Trigger:** Mark's real-world test on `5MAP Exec Intent V1.5 13 Jan 23.pptx` — Q2–Q5 returned empty due to 10,000-char truncation consuming the budget on Q1's three slides + template coaching notes, resulting in a 1.71/5.00 score on a complete, well-filled document.
**Constraint:** Do not change rubric weights, scoring logic, weighted calculator, evidence formatting, or existing file upload flow. All improvements are additive.

---

## Phase Q — Improved Q1–Q5 Section Identification

### Q-T1: Raise extraction character limit from 10,000 to 40,000

**Problem:** `identifySections()` truncates input at `text.slice(0, 10000)`. A 3-slide Q1 with template coaching notes in speaker fields consumes the entire budget before Q2–Q5 slides are reached.

**Fix:**
- Change `text.slice(0, 10000)` to `text.slice(0, 40000)` in `nextjs-app/lib/evaluator.ts`.
- Update the `scoreFromPdf` path equivalently if it has its own slice.
- No other changes to the prompt or model.

**AC:**
- Mark's `5MAP Exec Intent V1.5 13 Jan 23.pptx` (8 slides, ~18,000 chars) produces non-empty Q2–Q5.
- Existing 4 client PPTX files (Hospitality Participation, Hospitality Simplification, Manufacturing Leadership, Manufacturing Core Values) still pass `test-p2-pptx.js`.
- No regression on I1/I3/P3/P4 test suites.

---

### Q-T2: Cap speaker-notes contribution per slide for the identification pass

**Problem:** Older Leading Change PPTX templates embed 400–1,000-word instructional coaching notes in the speaker-notes field of every slide. These inflate the character budget and prevent Q2–Q5 slides from being reached.

**Why not phrase-match or length-threshold?**
Phrase matching breaks when the template is updated or when a client coincidentally quotes those phrases. A length + body-size threshold risks silently truncating genuine client notes written in the notes field. Both approaches require ongoing maintenance and carry a real false-positive risk.

**Correct approach — per-slide notes cap, identification pass only:**

The key insight is that **client 5MAP answers live in the slide body, not speaker notes**. Speaker notes are supplementary. Genuine client content in notes is typically one or two short sentences; template coaching text runs to several hundred words.

**Fix in `nextjs-app/lib/parsePptx.ts`:**
- Add an optional parameter `notesCapForId: number = 250` to the `extractTextFromPptx()` function (or a dedicated `buildIdentificationText()` helper).
- When building the text string for `identifySections()`, cap each slide's notes contribution: `slideNotes.slice(0, notesCapForId)`.
- The **full** notes text is still returned for use in scoring — no data is ever permanently discarded.
- The cap is applied only to the text string passed to `identifySections()`, not to the text passed to dimension scoring.

**Why 250 characters?**
- Captures a genuine client sentence in notes (a typical sentence is 80–150 chars).
- A 1,000-word coaching note is reduced from ~6,000 chars to 250 — a ~96% reduction in budget consumption for that field.
- 250 is a named constant `NOTES_ID_CAP = 250` so it can be tuned in one place.

**AC:**
- Mark's file: total extracted text for identification drops to well under 25,000 chars, all five Q slides are included in the identification pass.
- Existing client PPTX files: no change to scoring output (cap only affects identification text, not scoring text).
- Automated test: a synthetic slide with a 2,000-char notes field produces ≤250 chars of notes in the identification string and the full 2,000 chars in the scoring string.

---

### Q-T3: Two-pass extraction — label-first, then content-inference fallback

**Problem:** When Q section labels are absent or non-standard (e.g. slide titled `"Question 1: What is the CONTEXT?"` instead of `"Q1"`), the single-pass extractor may fail to map content correctly.

**Fix in `identifySections()` in `nextjs-app/lib/evaluator.ts`:**

**Pass 1 — Label-based extraction (existing, improved):**
- Expand the label variant list to include:
  - `Question 1`, `Question 2`, `Question 3`, `Question 4`, `Question 5`
  - `CONTEXT`, `INTENT`, `IMPLIED TASKS`, `BOUNDARIES`, `BACKBRIEF`
  - Mixed case and numbered variants
- Instruct Claude: if a Q section's content spans multiple consecutive slides with the same or related label, aggregate all into one field.

**Pass 2 — Content-inference fallback (new):**
- After Pass 1, if two or more Q fields are empty, make a second Claude call on the same (now de-boilerplated) text with a different prompt:
  - "The document uses non-standard or absent Q labels. Based on content and slide position, infer which content belongs to Q1 (context/situation), Q2 (intent/mission), Q3 (tasks/priorities), Q4 (boundaries/constraints), Q5 (backbrief/review). Return your best inference even if uncertain."
  - Attach a `low_confidence: true` flag per field if inferred rather than label-matched.
- Only trigger Pass 2 if Pass 1 leaves ≥2 Q fields empty.
- Pass 2 uses `claude-opus-4-7` (better inference on ambiguous content).

**AC:**
- Mark's file: Pass 1 correctly maps slides 2–4 → Q1, slide 5 → Q2, slide 6 → Q3, slide 7 → Q4, slide 8 → Q5 using expanded label variants. Pass 2 not triggered.
- Synthetic test: a file with no Q labels triggers Pass 2 and returns plausible non-empty fields.
- `low_confidence` flag is present in API response when Pass 2 was used.
- No Pass 2 call occurs on well-labelled files (verified by test asserting single API call count).

---

### Q-T4: Warn user when Q sections are empty or very thin after extraction

**Problem:** When section detection fails silently, the user sees a low score with rationales like `"q2_intent is empty"` — confusing and unhelpful.

**Fix:**

**API side (`nextjs-app/app/api/evaluate/route.ts`):**
- After `identifySections()`, check if ≥2 Q fields are empty or <50 chars.
- If so, add `"sectionWarning": "Two or more Q sections appear to be empty or very short. The evaluation may be inaccurate — please check that the uploaded document contains all five Q sections."` to the response JSON.

**UI side (`nextjs-app/app/EvaluatorClient.tsx`):**
- If `result.sectionWarning` is present, display a prominent amber warning banner directly above the report:
  - Icon + message: `"⚠ Section detection may be incomplete. Q2–Q5 appear short or empty. Review the document and re-upload if needed."`
  - Dismissable.
  - Does not block the report — shows it with the warning.

**AC:**
- Mark's original (unfixed) run: warning banner would have appeared.
- After Q-T1/T2/T3 fixes: warning does not appear on Mark's file (all sections now populated).
- Warning appears in automated test when mock sections return empty Q2–Q5.
- Warning does not appear on the 4 existing client PPTX files.

---

## Phase P — PDF Export (Automated One-Click Download)

### P-T1: Install and configure Puppeteer for serverless PDF rendering

**Approach:** Use `@sparticuz/chromium` + `puppeteer-core` — the standard pattern for Puppeteer on Vercel serverless functions. This avoids the binary size issues of full Puppeteer.

**Steps:**
- Add to `nextjs-app/package.json`:
  - `@sparticuz/chromium` (Chromium binary optimised for serverless)
  - `puppeteer-core` (Puppeteer without bundled Chromium)
- Create `nextjs-app/app/api/export-pdf/route.ts` as a new API route.
- Set `export const maxDuration = 60` (PDF render needs more time than evaluate).
- Configure Vercel function memory to 1024MB in `vercel.json` for this route only.

**AC:**
- `npx next build` passes with 0 errors.
- `POST /api/export-pdf` with a valid JSON body returns a `Content-Type: application/pdf` response.

---

### P-T2: Build the PDF export API route

**Route:** `POST /api/export-pdf`
**Input:** The full evaluation result JSON (same shape as `/api/evaluate` response).
**Output:** PDF binary stream, `Content-Disposition: attachment; filename="5MAP-evaluation.pdf"`.

**Render logic:**
1. Accept the result JSON in the request body.
2. Reconstruct the report HTML server-side — same 14-section structure as the UI, using a standalone HTML string (not importing React components, to avoid SSR complexity).
3. Launch headless Chromium via `@sparticuz/chromium`.
4. Load the HTML, wait for fonts/styles to settle.
5. Call `page.pdf()` with A4 format, margins 20mm, `printBackground: true`.
6. Stream the PDF back.

**HTML template for the PDF:**
- Mirrors the existing 14-section report structure.
- Includes print-ready CSS: `@page { size: A4; margin: 20mm; }`.
- Header on every page: `5MAP Evaluation Report · COMMERCIAL IN CONFIDENCE`.
- Footer on every page: page number + date.
- No UI chrome (no buttons, no textarea, no nav).

**AC:**
- PDF contains all 14 canonical sections.
- Score tables render correctly (not broken across pages mid-row where avoidable).
- `COMMERCIAL IN CONFIDENCE` appears in header on every page.
- File downloads with `.pdf` extension and opens cleanly in any PDF viewer.
- No Claude API call is made in this route (pure rendering).

---

### P-T3: Add "Download as PDF" button to the UI

**Location:** In the report action bar alongside the existing "Download JSON" button.

**Behaviour:**
1. User clicks "Download as PDF".
2. Button shows loading state: `"Generating PDF…"`.
3. Frontend `POST`s the current `result` JSON to `/api/export-pdf`.
4. On success: browser downloads the PDF file automatically.
5. On error: inline error message below the button.

**AC:**
- Button is visible only when a report result is present.
- Button is disabled while PDF is generating (prevents double-click).
- Downloaded file opens as a valid PDF in Adobe Reader, Chrome, and macOS Preview.
- JSON download button is unaffected and continues to work.
- No regression to existing evaluate flow.

---

### P-T4: Verify on Vercel (production smoke test)

- Deploy to Vercel.
- Upload Mark's `5MAP Exec Intent V1.5 13 Jan 23.pptx` → generate report → click Download as PDF.
- Verify: PDF downloads, all 14 sections present, COMMERCIAL IN CONFIDENCE visible.
- Verify: function does not time out on Vercel Hobby (60s limit).

**AC:** PDF downloads successfully from the live Vercel deployment within 30 seconds.

---

## Phase V2 — Verification & Commit

### V2-T1: Run full regression suite
- `node scripts/test-i1.js` — 14/14 pass
- `node scripts/test-i3-t1-t2.js` — 94/94 pass
- `node scripts/test-p2-pptx.js` — 4/4 pass
- `node scripts/test-p3.js` — 33/33 pass
- `npx next build` — 0 errors

### V2-T2: Re-run Mark's file end-to-end
- Upload `5MAP Exec Intent V1.5 13 Jan 23.pptx` via the UI.
- Verify Q1–Q5 all non-empty in the report.
- Verify score is in a plausible range (not 1.71).
- Verify no section warning appears.
- Download as PDF and verify it opens cleanly.

### V2-T3: Commit and push
- Commit message: `Improve Q section detection and add one-click PDF export`
- Push to `main` on `Akileshkj10/Intent_Eval`
- Verify Vercel redeploys and PDF export works on production.

---

## Explicit Non-Goals (Phase V2)

- No LCL logo or full brand template (deferred to Phase V3).
- No change to rubric weights or scoring logic.
- No change to the 14-section report structure.
- No client self-service mode.
- No multi-5MAP programme review (deferred).

---

## Dependency Map

```
Q-T1 → Q-T2 → Q-T3 → Q-T4
Q-T1 (must pass) → V2-T2

P-T1 → P-T2 → P-T3 → P-T4
P-T1 (must pass build) → V2-T1

Q complete + P complete → V2-T1 → V2-T2 → V2-T3
```

---

## Files to change

| File | Change |
|------|--------|
| `nextjs-app/lib/evaluator.ts` | Raise char cap; add two-pass extraction; add `sectionWarning` to response |
| `nextjs-app/lib/parsePptx.ts` | Add `isBoilerplateNote()` filter |
| `nextjs-app/app/api/evaluate/route.ts` | Pass `sectionWarning` through response |
| `nextjs-app/app/api/export-pdf/route.ts` | New — PDF render route |
| `nextjs-app/app/EvaluatorClient.tsx` | Warning banner; Download as PDF button |
| `nextjs-app/package.json` | Add `@sparticuz/chromium`, `puppeteer-core` |
| `vercel.json` | New — set memory/duration for export-pdf function |
| `nextjs-app/scripts/test-v2.js` | New — V2 regression + smoke test script |
