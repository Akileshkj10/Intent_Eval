const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

const reportFormatSrc = fs.readFileSync(path.join(__dirname, "../lib/reportFormat.ts"), "utf8");
// UI logic lives in EvaluatorClient.tsx (extracted from page.tsx during Phase I4).
const pageSrc = fs.readFileSync(path.join(__dirname, "../app/EvaluatorClient.tsx"), "utf8");
const evaluatorSrc = fs.readFileSync(path.join(__dirname, "../lib/evaluator.ts"), "utf8");
const routeSrc = fs.readFileSync(path.join(__dirname, "../app/api/evaluate/route.ts"), "utf8");

const expectedSections = [
  "Evaluation report",
  "Executive summary",
  "Purpose of this briefing note",
  "Alignment of overall intent to higher intent",
  "Dimension scores",
  "Total weighted score",
  "Commentary by 5MAP question",
  "Q1 — Context and higher intent",
  "Q2 — Intent and measures of success",
  "Q3 — Tasks and main effort",
  "Q4 — Boundaries",
  "Q5 — Achievability and back-brief readiness",
  "Overall assessment",
  "Appendix A — Scoring rationale",
];

console.log("\n── I3-T1: canonical section map ─────────────────────────────────");
assert(reportFormatSrc.includes("CANONICAL_REPORT_SECTIONS"), "Canonical report section map exists");
assert(
  (reportFormatSrc.match(/title: "/g) || []).length === 14,
  "Canonical report map contains exactly 14 sections"
);

for (const [index, title] of expectedSections.entries()) {
  assert(reportFormatSrc.includes(`number: ${index + 1}`), `Section ${index + 1} number exists`);
  assert(reportFormatSrc.includes(`title: "${title}"`), `Section ${index + 1} title matches: ${title}`);
}

assert(reportFormatSrc.includes("canonicalHeading"), "Reusable canonicalHeading helper exists");

console.log("\n── I3-T2: recommendation placement ──────────────────────────────");
assert(reportFormatSrc.includes("TARGETED_RECOMMENDATIONS_PLACEMENT"), "Recommendation placement config exists");
assert(reportFormatSrc.includes("canonicalSectionNumber: 7"), "Recommendations are assigned to canonical section 7");
assert(reportFormatSrc.includes('label: "Targeted Improvement Recommendations"'), "Recommendation label is preserved");
assert(reportFormatSrc.includes("minItems: 0"), "Recommendation minimum allows zero");
assert(reportFormatSrc.includes("maxItems: 3"), "Recommendation maximum is three");
assert(
  reportFormatSrc.includes("do not restore long-form generic commentary"),
  "Decision prevents returning to long generic commentary"
);
assert(
  pageSrc.includes("TARGETED_RECOMMENDATIONS_PLACEMENT.label"),
  "Current UI uses shared recommendation label"
);
assert(
  evaluatorSrc.includes("0-3 targeted improvement recommendations") &&
    evaluatorSrc.includes("NOT always 3") &&
    evaluatorSrc.includes("(5 − score) × weight"),
  "Claude scoring prompt keeps 0-3 weighted-gap recommendation rule"
);
assert(
  evaluatorSrc.includes(".slice(0, 3)") && evaluatorSrc.includes("targetDimensionId"),
  "Recommendation renderer data remains capped and dimension-tied"
);

console.log("\n── I3-T3: Claude narrative schema ───────────────────────────────");
for (const field of [
  "purpose_of_briefing_note",
  "alignment_to_higher_intent",
  "commentary_intro",
  "q1_commentary",
  "q2_commentary",
  "q3_commentary",
  "q4_commentary",
  "q5_commentary",
  "overall_assessment",
  "appendix_rationale",
]) {
  assert(evaluatorSrc.includes(field), `Evaluator schema includes ${field}`);
}
assert(evaluatorSrc.includes("export interface ReportNarrative"), "ReportNarrative type is exported");
assert(evaluatorSrc.includes("normalizeReportNarrative"), "Narrative fallback normalizer exists");
assert(evaluatorSrc.includes("REPORT NARRATIVE RULES"), "Prompt contains narrative rules");
assert(evaluatorSrc.includes("Do NOT calculate or mention weighted totals"), "Prompt forbids LLM totals in narrative");
assert(evaluatorSrc.includes("Do NOT modify any dimension score"), "Prompt forbids score changes in narrative");
assert(routeSrc.includes("reportNarrative"), "API returns reportNarrative");
assert(pageSrc.includes("reportNarrative?: ReportNarrative"), "UI accepts reportNarrative");
assert(pageSrc.includes("narrative.q1Commentary.strengths"), "UI uses Q1 narrative fields");
assert(pageSrc.includes("narrative.q5Commentary.suggestedImprovements"), "UI uses Q5 narrative fields");

console.log("\n── I3-T4: 14-section UI rendering ───────────────────────────────");
for (let sectionNumber = 1; sectionNumber <= 14; sectionNumber++) {
  assert(
    pageSrc.includes(`canonicalHeading(${sectionNumber})`),
    `UI renders canonical section ${sectionNumber}`
  );
}
assert(pageSrc.includes("_sections?: Sections"), "UI result type accepts identified Q sections");
// Q source excerpts were intentionally removed from the report in a prior phase (user request).
// Evidence tags and quote styling on dimension rationales are preserved.
assert(pageSrc.includes("[5MAP input]"), "Dimension evidence tag is preserved");
assert(pageSrc.includes("fontStyle: \"italic\""), "Evidence quote styling is preserved");
assert(reportFormatSrc.includes("Appendix A — Scoring rationale"), "Appendix A canonical title is present");

assert(
  (routeSrc.match(/_sections: sections/g) || []).length >= 2,
  "Both text/PPTX and PDF paths return identified sections"
);

console.log("\n── I3-T5: quality regression guards ─────────────────────────────");
assert(pageSrc.includes("result.dimensions.map((d)"), "UI renders all dimension rows from result.dimensions");
assert(pageSrc.includes("d.score}/5"), "UI renders dimension integer scores");
assert(pageSrc.includes("result.total.toFixed(2)"), "UI renders code-calculated total score");
assert(routeSrc.includes("totalWeightedScore(scoresMap)"), "API total is computed by code");
assert(routeSrc.includes("sectionSubtotals(scoresMap)"), "API subtotals are computed by code");
assert(!evaluatorSrc.includes("weighted_total"), "Claude schema does not request a weighted total");
assert(pageSrc.includes("d.rationale") && pageSrc.includes("d.keyEvidence"), "Evidence rationale and quote still render");
assert(pageSrc.includes("result.recommendations.length === 0"), "UI supports zero recommendations");
assert(evaluatorSrc.includes("maxItems: 3"), "Claude recommendation schema caps at 3");
assert(evaluatorSrc.includes("minItems: 0"), "Claude recommendation schema allows zero");
assert(evaluatorSrc.includes(".slice(0, 3)"), "Recommendation post-processing caps at 3");

console.log(`\n${"═".repeat(60)}`);
console.log(`I3 Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("✓ I3 PASS — canonical map, narrative schema, 14-section UI, and quality guards confirmed");
} else {
  console.log("✗ I3 FAIL — see errors above");
  process.exit(1);
}
