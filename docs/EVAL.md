# Evaluation Metrics

This document defines the quality metrics used to assess evaluation reliability and report validity.

## Core metrics

| Metric | Formula | Target | Source |
|---|---|---|---|
| Weighted total variance | `max(total_run_i) - min(total_run_i)` across 3 identical runs | `<= 0.1` | Stability test (`NFR-CON-02`) |
| Per-dimension MAE vs consultant | `(sum(abs(model_score_i - consultant_score_i)) / 9)` | As low as practical; tracked over time | Calibration runs |
| Evidence hit rate | `(validated_quotes / total_quotes)` | `>= 95%` | Evidence validator logs |
| Section checklist pass rate | `(lint_pass_reports / total_reports)` | `100%` for gold path | Structure linter + checklist |
| Calculator correctness delta | `abs(calculated_total - expected_gold_total)` | `0.00` for deterministic gold fixture | Unit tests |

## Notes

- Weighted totals are calculator-owned and must never be modified by narrative generation.
- Checklist failures should include explicit missing heading names and row-count gaps.
- Gold regression intentionally validates structure and math, not exact prose wording.

## Synthetic baseline (P6-T06)

- Parse baseline from synthetic fixture (`fixtures/synthetic_5map_parsed.json`):
  - `low_confidence_sections = false`
  - `slide_count = 5`
- Offline deterministic report baseline:
  - `python -m intent_evaluator report --scorecard fixtures/gold_simplification_scorecard.json --input fixtures/synthetic_5map_parsed.json --out outputs/p6_t6_gold_report`
  - `total_weighted_score = 3.64`
- MAE tracking baseline:
  - Current synthetic proxy MAE against consultant gold fixture (same dimension vector) = `0.00`
  - This proxy is only for pipeline wiring sanity; not a substitute for real consultant scoring sessions.

## Real-input follow-up [AWAITING D15]

- Collect consultant scoring CSVs from calibration sessions using `eval/consultant_scores_template.csv`.
- Compute and store per-run MAE against consultant scores for real 5MAP inputs.
- Track trendline over time (mean/median MAE by rubric version and model ID).
