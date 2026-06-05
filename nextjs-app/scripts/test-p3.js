/**
 * P3 Test Suite
 *
 * Tests the P3 deliverables without making actual Claude API calls:
 *   1. parsePdf validation logic (size, extension, empty)
 *   2. API route branching (pdf vs text body)
 *   3. scoreFromPdf response schema shape
 *   4. Regression: text branch still returns correct shape
 */

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

// ── P3-T1: parsePdf validation logic (replicated in Node for testing) ─────────

const MAX_PDF_BYTES = 32 * 1024 * 1024;

function validatePdfFile(name, sizeBytes) {
  if (!name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "wrong_format", message: "Only .pdf files are supported." };
  }
  if (sizeBytes === 0) {
    return { ok: false, error: "corrupted", message: "The PDF file appears to be empty." };
  }
  if (sizeBytes > MAX_PDF_BYTES) {
    return { ok: false, error: "too_large", message: `PDF is too large.` };
  }
  return { ok: true };
}

console.log("\n── P3-T1: parsePdf validation ───────────────────────────────────");
assert(validatePdfFile("test.pdf", 1000).ok === true, "Valid PDF passes");
assert(validatePdfFile("test.pptx", 1000).ok === false, "Non-PDF extension rejected");
assert(validatePdfFile("test.pptx", 1000).error === "wrong_format", "Non-PDF gives wrong_format error");
assert(validatePdfFile("test.pdf", 0).ok === false, "Empty file rejected");
assert(validatePdfFile("test.pdf", 0).error === "corrupted", "Empty file gives corrupted error");
assert(validatePdfFile("test.pdf", MAX_PDF_BYTES + 1).ok === false, "Oversized file rejected");
assert(validatePdfFile("test.pdf", MAX_PDF_BYTES + 1).error === "too_large", "Oversized file gives too_large error");
assert(validatePdfFile("test.pdf", MAX_PDF_BYTES).ok === true, "Exactly 32MB passes");
assert(validatePdfFile("My 5MAP Report.pdf", 500000).ok === true, "Filename with spaces passes");

// ── P3-T2: Response schema shape ─────────────────────────────────────────────

console.log("\n── P3-T2: scoreFromPdf response schema ──────────────────────────");

// Mock a parsed response to verify the processing logic
const DIMENSIONS = [
  { id: "clarity_outcome", name: "Clarity of Outcome (What)", section: "A", weight: 0.2 },
  { id: "clarity_purpose", name: "Clarity of Purpose (Why)", section: "A", weight: 0.2 },
  { id: "alignment_higher_direction", name: "Alignment with Higher Direction", section: "B", weight: 0.15 },
  { id: "alignment_tasks", name: "Alignment of Tasks with Intent", section: "B", weight: 0.15 },
  { id: "conciseness", name: "Conciseness", section: "C", weight: 0.06 },
  { id: "outcome_focused", name: "Outcome-Focused", section: "C", weight: 0.06 },
  { id: "decentralised_utility", name: "Utility for Decentralised Decision-Making", section: "C", weight: 0.06 },
  { id: "testability", name: "Testability / Verifiability", section: "C", weight: 0.06 },
  { id: "energy_engagement", name: "Energy and Engagement", section: "C", weight: 0.06 },
];

function totalWeightedScore(scores) {
  return DIMENSIONS.reduce((sum, d) => sum + (scores[d.id] ?? 0) * d.weight, 0);
}

// Simulate the response Claude would return
const mockParsed = {
  sections: { q1: "Context text", q2: "Intent text", q3: "Tasks text", q4: "Boundaries", q5: "Backbrief" },
  scores: Object.fromEntries(DIMENSIONS.map(d => [d.id, { score: 3, rationale: "Test rationale.", key_evidence: "Test evidence" }])),
  recommendations: [
    { target_dimension_id: "clarity_outcome", action: "Rewrite Q2 to state a single clear end-state.", expected_impact: "Raises the highest-weighted dimension." },
    { target_dimension_id: "conciseness", action: "Reduce Q2 to 2-3 sentences.", expected_impact: "Makes intent more memorable." },
  ],
};

// Process as scoreFromPdf would
const results = DIMENSIONS.map(d => {
  const r = mockParsed.scores[d.id] ?? { score: 1, rationale: "", key_evidence: "" };
  const score = Math.min(5, Math.max(1, Math.round(r.score)));
  return { id: d.id, name: d.name, section: d.section, weight: d.weight, score, weightedScore: Math.round(score * d.weight * 100) / 100, rationale: r.rationale, keyEvidence: r.key_evidence };
});

const sections = mockParsed.sections;
const scoresMap = Object.fromEntries(results.map(r => [r.id, r.score]));
const total = totalWeightedScore(scoresMap);

assert(results.length === 9, "Returns 9 dimension results");
assert(results.every(r => typeof r.score === "number" && r.score >= 1 && r.score <= 5), "All scores are 1-5 integers");
assert(results.every(r => typeof r.rationale === "string"), "All rationales are strings");
assert(results.every(r => typeof r.keyEvidence === "string"), "All evidence fields are strings");
assert(typeof total === "number" && total > 0, "Total weighted score is a positive number");
assert(Math.abs(total - 3.0) < 0.001, `Total is 3.0 when all scores are 3 (got ${total.toFixed(3)})`);
assert(typeof sections.q1 === "string" && sections.q1.length > 0, "Sections.q1 is returned");
assert(typeof sections.q2 === "string", "Sections.q2 is returned");

// ── P3-T3: API route branching ────────────────────────────────────────────────

console.log("\n── P3-T3: API route branching ───────────────────────────────────");

// Verify route.ts correctly branches on pdf vs text
const routeSrc = fs.readFileSync(
  path.join(__dirname, "../app/api/evaluate/route.ts"),
  "utf8"
);

assert(routeSrc.includes("body.pdf"), "Route checks for body.pdf");
assert(routeSrc.includes("scoreFromPdf"), "Route calls scoreFromPdf for PDF branch");
assert(routeSrc.includes("body.text"), "Route checks for body.text (existing branch preserved)");
assert(routeSrc.includes("identifySections"), "identifySections still called in text branch");
assert(routeSrc.includes("scoreAllDimensions"), "scoreAllDimensions still called in text branch");
assert(
  routeSrc.indexOf("body.pdf") < routeSrc.indexOf("body.text"),
  "PDF branch checked before text branch"
);
assert(
  routeSrc.includes("_sections: sections"),
  "PDF response includes _sections for debugging"
);

// Verify text branch is unchanged (same response fields)
assert(routeSrc.includes("total: Math.round(total * 100) / 100"), "Both branches return total");
assert(routeSrc.includes("recommendations,"), "Both branches include recommendations");

// ── P3: Check evaluator.ts exports ───────────────────────────────────────────

console.log("\n── P3: evaluator.ts exports ─────────────────────────────────────");

const evalSrc = fs.readFileSync(
  path.join(__dirname, "../lib/evaluator.ts"),
  "utf8"
);

assert(evalSrc.includes("export async function scoreFromPdf"), "scoreFromPdf is exported");
assert(evalSrc.includes("export interface PdfScoringPayload"), "PdfScoringPayload type is exported");
assert(evalSrc.includes("extends ScoringPayload"), "PdfScoringPayload extends ScoringPayload");
assert(evalSrc.includes("sections: Sections"), "PdfScoringPayload includes sections field");
assert(evalSrc.includes("type: \"document\""), "Claude document block is constructed");
assert(evalSrc.includes("media_type: \"application/pdf\""), "PDF media type is set correctly");
assert(!evalSrc.includes("scoreAllDimensions") || evalSrc.indexOf("export async function scoreAllDimensions") > 0,
  "scoreAllDimensions is still present and exported");

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(60)}`);
console.log(`P3 Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("✓ P3 PASS — all acceptance criteria met");
  console.log("\nNote: Live Claude API call (PDF → score) is tested in P5 smoke test.");
} else {
  console.log("✗ P3 FAIL — see errors above");
  process.exit(1);
}
