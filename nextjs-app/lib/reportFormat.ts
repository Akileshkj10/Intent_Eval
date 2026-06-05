export interface CanonicalReportSection {
  number: number;
  title: string;
  purpose: string;
}

export const CANONICAL_REPORT_SECTIONS: CanonicalReportSection[] = [
  {
    number: 1,
    title: "Evaluation report",
    purpose: "Document title and run metadata.",
  },
  {
    number: 2,
    title: "Executive summary",
    purpose: "Concise overall result, strengths, and priority improvement areas.",
  },
  {
    number: 3,
    title: "Purpose of this briefing note",
    purpose: "Explain what this evaluation is for and how the reader should use it.",
  },
  {
    number: 4,
    title: "Alignment of overall intent to higher intent",
    purpose: "Assess Q1 linkage to higher direction, strategy, and business context.",
  },
  {
    number: 5,
    title: "Dimension scores",
    purpose: "Show the nine rubric scores with evidence grounded in the 5MAP input.",
  },
  {
    number: 6,
    title: "Total weighted score",
    purpose: "Show section subtotals and final code-calculated weighted total.",
  },
  {
    number: 7,
    title: "Commentary by 5MAP question",
    purpose: "Introduce the Q1-Q5 commentary and the priority improvement recommendations.",
  },
  {
    number: 8,
    title: "Q1 — Context and higher intent",
    purpose: "Evaluate the context, higher intent, and business situation.",
  },
  {
    number: 9,
    title: "Q2 — Intent and measures of success",
    purpose: "Evaluate the intent statement, outcome, purpose, and measures.",
  },
  {
    number: 10,
    title: "Q3 — Tasks and main effort",
    purpose: "Evaluate implied tasks, priorities, and main effort alignment.",
  },
  {
    number: 11,
    title: "Q4 — Boundaries",
    purpose: "Evaluate freedoms, constraints, trade-offs, and decision rights.",
  },
  {
    number: 12,
    title: "Q5 — Achievability and back-brief readiness",
    purpose: "Evaluate achievability, review cadence, assumptions, and backbrief readiness.",
  },
  {
    number: 13,
    title: "Overall assessment",
    purpose: "Provide the final consultant judgement and readiness message.",
  },
  {
    number: 14,
    title: "Appendix A — Scoring rationale",
    purpose: "Document the rationale behind all nine dimension scores.",
  },
];

export const TARGETED_RECOMMENDATIONS_PLACEMENT = {
  canonicalSectionNumber: 7,
  label: "Targeted Improvement Recommendations",
  minItems: 0,
  maxItems: 3,
  rule: "Use this concise recommendation block as the improvement content within canonical section 7; do not restore long-form generic commentary.",
} as const;

export function canonicalHeading(number: number): string {
  const section = CANONICAL_REPORT_SECTIONS.find((item) => item.number === number);
  if (!section) throw new Error(`Unknown canonical report section: ${number}`);
  return `${section.number}. ${section.title}`;
}
