# Mark Testing Guide

## Purpose

This is an internal pilot for Mark/practice-lead review. It is **not client self-service** and reports must be reviewed by a Leading Change consultant before any client use.

## Pilot URL

Hosted URL: **pending deployment**.

Until the URL is available, run locally:

```bash
streamlit run app/streamlit_app.py
```

## What to test

1. Open the app.
2. Try **Upload file** using `fixtures/synthetic_5map_parsed.json`.
3. Try **Paste text** using either:
   - one block labelled `Q1:` through `Q5:`, or
   - the five separate Q1-Q5 text fields.
4. Generate the report.
5. Review:
   - total weighted score
   - interpretation band
   - dimension score table
   - Q1-Q5 commentary
   - `report.md` and `report.json` downloads
6. Capture consultant scores in `eval/consultant_scores_template.csv` if reviewing calibration.

## Expected outputs

- `report.md`
- `report.json`
- `parsed.json`
- `run_manifest.json`
- visible total weighted score and interpretation band

## Known limitations

- Synthetic-first baseline remains in use until real `.pptx` examples arrive **[AWAITING D15]**.
- Real `.pptx` calibration still needs Mark-provided consultant reference scores.
- Live LLM runs require a configured provider key.
- DOCX branded export is deferred.
- Consultant review is required before client use.

## Feedback template

### Bugs

- What happened?
- What input mode was used?
- Expected result:
- Actual result:
- Screenshot or report artefact:

### Scoring Calibration

- Dimension:
- System score:
- Your score:
- Why should it differ?
- Evidence quote or section:

### Wording / Tone

- Report section:
- Current wording:
- Suggested wording:
- Reason:

### Feature Requests

- Requested feature:
- User problem it solves:
- Urgency:
- Notes:
