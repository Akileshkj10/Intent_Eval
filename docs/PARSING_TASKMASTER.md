# Parsing Taskmaster — PPTX (Option A) + PDF (Option B)

**Scope:** Add file upload support to the Next.js UI.
**Constraint:** Existing text-paste flow, scoring pipeline, evidence formatting, and recommendations must not change.

---

## Phase P1 — Dependencies & Groundwork

### P1-T1: Install packages
- Add `jszip` and `fast-xml-parser` to `nextjs-app/package.json`
- Verify `npm install` completes cleanly
- **AC:** `import JSZip from 'jszip'` and `import { XMLParser } from 'fast-xml-parser'` compile without error

### P1-T2: Add input mode type to shared types
- Define a union type: `InputMode = "text" | "pptx" | "pdf"` in a shared types file or inline in `page.tsx`
- Define `ParsedFile = { mode: "pptx" | "pdf"; text?: string; pdfBase64?: string; slideCount?: number }`
- **AC:** Types used consistently across `page.tsx` and `route.ts` with no `any`

---

## Phase P2 — Option A: PPTX Extraction

### P2-T1: Build `lib/parsePptx.ts`
Core extraction logic. Must handle all edge cases.

Sub-tasks:
- Open ZIP with `jszip`, detect if unzip fails (password-protected / corrupted) → throw descriptive error
- Read slide order from `ppt/presentation.xml` (respects actual order, skips hidden slides via `show="0"`)
- For each slide, extract:
  - Title text (placeholder type = `title` or `ctrTitle`)
  - All body text paragraphs in order (from `<a:t>` nodes)
  - Table cell text (row by row)
  - Shape text inside `<p:grpSp>` groups
  - Best-effort `<a:t>` from SmartArt/graphic frames
- For each slide, extract speaker notes from matching `ppt/notesSlides/notesSlide*.xml`
- Skip template placeholder text: `"Click to add title"`, `"Click to add text"`, `"Click to add notes"` (exact match + case-insensitive)
- Output: structured string, one block per slide:
  ```
  [Slide 1 — "Title Text"]
  Body: ...
  Notes: ...
  ```
- **AC:** Unit-testable pure function. Given a PPTX ArrayBuffer, returns `{ text: string; slideCount: number }`. Throws `ParseError` with user-friendly message on failure.

### P2-T2: Test `parsePptx.ts` against known files
- Run against at least 2 client 5MAP `.pptx` files from `Client 5maps/` folder
- Verify all 5 Q sections appear in extracted text
- Verify speaker notes are appended
- Verify hidden slides are absent
- **AC:** Extracted text passes manual review; no crashes on any client file

### P2-T3: Enhance section identification prompt for PPTX context
- In `lib/evaluator.ts`, update `identifySections()` to accept an optional `inputHint: "pptx" | "pdf" | "text"` parameter
- When `inputHint === "pptx"`, prepend context to the user prompt:
  - "This text was extracted from a PowerPoint presentation. Slide numbers are preserved."
  - "Aggregate content across multiple slides that belong to the same Q section."
  - "Ignore slides that are purely branding, title, agenda, or contact slides."
  - List all known Q-section label variants (Q1–Q5, Context, Higher Intent, Intent, Implied Tasks, Boundaries, Backbrief, Achievability, etc.)
- **AC:** Existing text-paste flow uses same function with no `inputHint` — no regression. PPTX flow gets enhanced prompt.

---

## Phase P3 — Option B: PDF Direct to Claude

### P3-T1: Build `lib/parsePdf.ts`
- Single function `readPdfAsBase64(file: File): Promise<{ base64: string; sizeBytes: number }>`
- Validate: `.pdf` extension, size ≤ 32MB (Anthropic limit)
- Return base64 string ready for Anthropic document API
- **AC:** Function works client-side (browser FileReader API). Throws with clear message if file too large or wrong type.

### P3-T2: Add `scoreFromPdf()` to `lib/evaluator.ts`
- New exported function alongside existing `identifySections()` and `scoreAllDimensions()`
- Takes `{ pdfBase64: string }`
- Sends a single Claude Opus call with:
  - The PDF as a `document` block (type: `base64`, media_type: `application/pdf`)
  - Combined system prompt: identify Q1–Q5 AND score all 9 dimensions AND generate recommendations in one response
  - Same JSON response schema as existing `scoreAllDimensions()` but adds a `sections` field
- Returns `{ sections: Sections; results: DimensionResult[]; recommendations: Recommendation[] }`
- **AC:** Returns same data shape as the existing two-step text flow. Existing `scoreAllDimensions()` is untouched.

### P3-T3: Update `/api/evaluate/route.ts` to handle PDF mode
- Add PDF branch: if body contains `{ pdf: string }`, call `scoreFromPdf()`
- Existing `{ text: string }` branch is unchanged — not refactored, not touched
- Same response schema returned regardless of input mode
- **AC:** Both modes return identical JSON shape. Text mode regression test passes (run manually).

---

## Phase P4 — UI

### P4-T1: Add file upload area to `app/page.tsx`
- Add a "Or upload a file" section below the textarea
- Accept `.pptx` and `.pdf` only (HTML `accept` attribute)
- Support both click-to-browse and drag-and-drop
- Show file name + type badge once selected: `hospitality.pptx · 12 slides` or `brief.pdf · PDF`
- Add an X button to clear the file and revert to text mode
- **AC:** File selection does not trigger evaluation immediately — user still clicks "Generate". Textarea remains editable when in text mode. File and text modes are mutually exclusive (selecting a file clears the textarea; clearing the file re-enables it).

### P4-T2: PPTX client-side extraction in UI
- On PPTX file select: run `parsePptx()` immediately in the browser
- Show inline spinner: "Extracting slides…"
- On success: auto-populate textarea with extracted text + show slide count badge
- On error: show red inline message (password-protected, corrupted, `.ppt` detected)
- `.ppt` (old binary): block at selection, show "Please save as .pptx in PowerPoint first"
- **AC:** User can review and edit extracted text before evaluating. Textarea is editable after population. Generating report after PPTX extraction uses normal text flow — no special API route needed.

### P4-T3: PDF flow in UI
- On PDF file select: store base64 in state, show "PDF loaded — ready to evaluate"
- Do NOT populate the textarea (Claude reads it directly)
- Show a notice: "Claude will read the PDF directly — no text preview available"
- On Generate: call `/api/evaluate` with `{ pdf: base64 }` instead of `{ text }`
- Loading status messages updated: "Sending PDF to Claude…" → "Scoring dimensions…"
- **AC:** Text paste flow is visually and functionally unchanged when no file is selected.

### P4-T4: Error states
- Password-protected PPTX → "This file is password-protected. Remove protection in PowerPoint and re-upload."
- Corrupted PPTX → "Could not read this file. Try re-saving it from PowerPoint."
- PDF over 32MB → "PDF too large (max 32MB). Try compressing or splitting the file."
- Wrong file type → "Only .pptx and .pdf files are supported."
- All errors shown inline beneath the upload area, dismissable
- **AC:** No error crashes the app. All errors are user-actionable.

---

## Phase P5 — Verification & Push

### P5-T1: Build check
- `npx next build` passes with 0 errors, 0 TS errors
- **AC:** Clean build output

### P5-T2: Manual smoke test — all three input modes
- [ ] Text paste → report generated correctly (regression)
- [ ] PPTX upload → text extracted, populated, report generated
- [ ] PDF upload → report generated directly
- [ ] Error state: try uploading a `.ppt` file → correct error message
- **AC:** All three modes produce a valid report. No cross-contamination between modes.

### P5-T3: Commit and push
- Commit message: "Add PPTX and PDF file upload (Options A and B)"
- Push to `main` on `Akileshkj10/Intent_Eval`
- **AC:** GitHub shows commit, Vercel auto-redeploys

---

## Dependency Map

```
P1-T1 → P2-T1 → P2-T2 → P2-T3
P1-T2 → P3-T1 → P3-T2 → P3-T3
         P2-T3 + P3-T3 → P4-T1 → P4-T2 → P4-T3 → P4-T4 → P5
```

## What is explicitly NOT changed
- `lib/rubric.ts` — untouched
- Scoring logic in `scoreAllDimensions()` — untouched
- Evidence formatting / `cleanRationale()` / `cleanEvidence()` — untouched
- Recommendations schema and prompt — untouched
- Report rendering in `page.tsx` — untouched (only the input section changes)
- All existing API route logic for `{ text }` input — untouched
