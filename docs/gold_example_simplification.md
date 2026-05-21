# Gold example — Simplification 5QMA

Reference evaluation used for calculator regression and report structure calibration. Source: Leading Change pilot output (May 2026), cross-checked against canonical rubric D1.

**PRD metrics (D16 §3.2):** Section totals A=1.60, B=1.20, C=0.84; computed total **3.64**; reported overall **3.8/5.0** with band “Adequate to strong — usable and directionally sound, but requires refinement to improve clarity, testability, and execution leverage.”

---

## Overall scoring summary

| Field | Value |
|-------|--------|
| Map title | Simplification 5QMA |
| Reported overall | 3.8 / 5.0 |
| Computed sum of weighted contributions | **3.64** |
| Display range in pilot | 3.64–3.8 (arithmetic rounding / narrative rounding) |
| Band | Adequate (3.0–3.9 per D1) |

---

## Section A — Core Clarity (40%)

| Criterion | Weight | Score (1–5) | Weighted | Evidence (summary) |
|-----------|--------|-------------|----------|-------------------|
| Clarity of Outcome (WHAT) | 20% | **4** | 0.80 | Outcome (simplify activity, processes, systems, policy, governance, technology) clear but broad |
| Clarity of Purpose (WHY) | 20% | **4** | 0.80 | Purpose: colleagues work effectively, reduce waste, future-proof business |
| **Section A total** | | | **1.60** | |

**Dimension ID mapping (D8 → implementation):**

- “Clarity of Outcome (WHAT)” → `clarity_outcome`
- “Clarity of Purpose (WHY)” → `clarity_purpose`

---

## Section B — Alignment (30%)

| Criterion | Weight | Score (1–5) | Weighted | Evidence (summary) |
|-----------|--------|-------------|----------|-------------------|
| Alignment with Higher Direction & Context | 15% | **5** | 0.75 | Aligned to sector intent “simplify where we must”, £1bn ambition |
| Alignment of Tasks with Intent | 15% | **3** | 0.45 | Tasks logical but weak line-of-sight to single Main Effort |
| **Section B total** | | | **1.20** | |

**Dimension ID mapping:**

- “Alignment with Higher Direction & Context” → `alignment_higher_direction`
- “Alignment of Tasks with Intent” → `alignment_tasks`

---

## Section C — Supporting Qualities (30%)

| Criterion | Weight | Score (1–5) | Weighted | Evidence (summary) |
|-----------|--------|-------------|----------|-------------------|
| Conciseness | 6% | **3** | 0.18 | Clear but multi-clause; not one sentence |
| Outcome-focused (not task-focused) | 6% | **3** | 0.18 | Outcome-led but task verbs in framing |
| Utility for decentralised decision-making | 6% | **3** | 0.18 | Directionally helpful; too broad for local trade-offs |
| Testability / verifiability | 6% | **3** | 0.18 | KPIs lack specific targets / time bounds |
| Energy & engagement | 6% | **2** | 0.12 | Operational tone vs motivational |
| **Section C total** | | | **0.84** | |

**Dimension ID mapping:**

| Pilot label | `dimension_id` |
|-------------|----------------|
| Conciseness | `conciseness` |
| Outcome-focused | `outcome_focused` |
| Utility for decentralised decision-making | `decentralised_utility` |
| Testability / verifiability | `testability` |
| Energy & engagement | `energy_engagement` |

---

## Weighted total verification

```
A: 0.80 + 0.80 = 1.60
B: 0.75 + 0.45 = 1.20
C: 0.18 + 0.18 + 0.18 + 0.18 + 0.12 = 0.84
Total: 1.60 + 1.20 + 0.84 = 3.64
```

The pilot report states **3.8/5.0** and “1.60 (A) + 1.20 (B) + 0.84 (C) = 3.64–3.8”. Engineering tests assert **3.64** exactly from integer scores; displayed 3.8 is treated as consultant-facing rounding, not a separate rubric.

---

## Nine dimension integer scores (machine input)

| `dimension_id` | Score |
|----------------|-------|
| `clarity_outcome` | 4 |
| `clarity_purpose` | 4 |
| `alignment_higher_direction` | 5 |
| `alignment_tasks` | 3 |
| `conciseness` | 3 |
| `outcome_focused` | 3 |
| `decentralised_utility` | 3 |
| `testability` | 3 |
| `energy_engagement` | 2 |

---

## Report structure vs canonical D1

| Pilot section | Canonical § (D1) | Notes |
|---------------|-------------------|--------|
| Purpose of this Review | §3 Purpose | Match |
| Weighted Scoring Summary | §5–§6 tables | Match |
| Alignment to Sector Intent | §4 Alignment to higher intent | Match |
| Key Strengths | — | Extra in pilot; optional in Phase 2 schema |
| Targeted Improvement Recommendations | §8–§12 themes | Fold into Q commentary + §13 |
| Bottom Line for the Client | §13 Overall assessment | Match |
| Detailed A/B/C tables | §5–§6, §14 Appendix | Match |

---

## Q1–Q5 commentary themes (consultant + AI)

**Q1 — Context / higher intent:** Context could be more self-explanatory; replicate one and two levels up for consistency with leadership intents.

**Q2 — Intent:** Punchier, inspirational wording; link simplification to operational headroom for transformation; KPI recommendations sound.

**Q3 — Tasks:** Logical phased structure; weak main effort articulation.

**Q4 — Boundaries:** Freedoms and constraints need specificity for freedom to operate.

**Q5 — Backbrief:** Include major assumptions from prior workshop work where relevant.

---

## Improvement themes (score uplift)

1. Sharpen intent to a single 12–18 month outcome (raises conciseness, outcome-focus, testability).
2. Move procedural language from Q2 to Q3 (outcome-focus, decentralised utility).
3. Add leading indicators with targets (testability).
4. Clarify local vs escalated decision rights (decentralised utility).

---

*Used by fixtures/gold_simplification_scorecard.json (P1-T03) and tests/test_calculator.py.*
