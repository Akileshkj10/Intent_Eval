# Calibration Session Plan

## Objective

Validate that the generated evaluation output is consultant-sendable with light edits and calibrated to practice-lead scoring judgement.

## Agenda (30-45 minutes)

1. **Context and scope (5 min)**  
   - Confirm this session is for Phase 3 exit criteria and quality calibration.
2. **Live walkthrough (10 min)**  
   - Run Streamlit demo on synthetic 5MAP.
   - Review generated `report.md`, `report.json`, and score table.
3. **Scoring calibration exercise (15 min)**  
   - Mark fills the 9-dimension scoring sheet.
   - Compare consultant scores vs system scores and discuss deltas.
4. **Decision points (10 min)**  
   - Confirm structural readiness and open risks before wider pilot use.
5. **Actions and owners (5 min)**  
   - Capture next-step decisions and timeline.

## Live demo script

1. Launch: `streamlit run app/streamlit_app.py`
2. Upload synthetic 5MAP JSON.
3. Generate report in offline mode first.
4. Review total score + interpretation band.
5. Download report artefacts and show reproducibility footer + `run_manifest.json`.
6. Capture calibration notes and unresolved items.

## Questions to resolve

- Should **subscores per Q** be displayed by default for Q1-Q5 in client deliverables?
- Should the report include D8-inspired extra sections (for example, "Key Strengths") or keep strict canonical-only structure?
- When should branded **DOCX timing** begin relative to calibration sign-off?

## Scoring sheet instructions

- Use `eval/consultant_scores_template.csv`.
- Fill one score (1-5) per dimension and optional comments.
- Save locally (gitignored path) and share results in calibration review.
