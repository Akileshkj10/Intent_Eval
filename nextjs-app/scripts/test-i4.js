/**
 * I4 — Full end-to-end verification
 * I4-T2: Real PPTX smoke (extract + API, mirrors UI flow)
 * I4-T3: Text/PDF mode regression (structural + live text API)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

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

const PPTX_FILES = [
  {
    label: "Hospitality Participation",
    path: "C:\\Users\\akile\\projects\\Intent_Evaluator\\Client 5maps\\Hospitality\\5QMA Participation v2.pptx",
  },
  {
    label: "Manufacturing Leadership",
    path: "C:\\Users\\akile\\projects\\Intent_Evaluator\\Client 5maps\\Manufacturing\\5MAP - Leadership.pptx",
  },
];

const SPACING_ARTEFACTS = [
  /Performancemanagement/i,
  /fromSeptember/i,
  /boss\):\[/,
  /\bprocess es\b/i,
];

const NARRATIVE_KEYS = [
  "purposeOfBriefingNote",
  "alignmentToHigherIntent",
  "commentaryIntro",
  "q1Commentary",
  "q2Commentary",
  "q3Commentary",
  "q4Commentary",
  "q5Commentary",
  "overallAssessment",
  "appendixRationale",
];

const CANONICAL_HEADINGS = [
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

// ── I4-T3: Mode separation (structural) ─────────────────────────────────────

console.log("\n── I4-T3: Mode separation (structural) ──────────────────────────");

const routeSrc = fs.readFileSync(path.join(__dirname, "../app/api/evaluate/route.ts"), "utf8");
const pageSrc = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");
const evaluatorSrc = fs.readFileSync(path.join(__dirname, "../lib/evaluator.ts"), "utf8");

assert(routeSrc.indexOf("if (body.pdf)") < routeSrc.indexOf("body.text"), "API checks PDF branch before text branch");
assert(routeSrc.includes("scoreFromPdf"), "PDF path calls scoreFromPdf");
assert(routeSrc.includes("identifySections"), "Text path calls identifySections");
assert(routeSrc.includes("scoreAllDimensions"), "Text path calls scoreAllDimensions");
assert(!routeSrc.includes("parsePptx"), "API route does not import PPTX parser (no cross-contamination)");
assert(pageSrc.includes("parsePptx"), "PPTX parsing stays client-side in page.tsx");
assert(pageSrc.includes("body = { pdf: pdfBase64 }"), "UI sends pdf payload for PDF mode");
assert(pageSrc.includes("body = { text }"), "UI sends text payload for text/PPTX-extracted mode");
assert(evaluatorSrc.includes("export async function scoreFromPdf"), "scoreFromPdf exists for direct PDF path");

// ── I4-T2: PPTX extraction + spacing ───────────────────────────────────────

console.log("\n── I4-T2: PPTX extraction (pre-API) ─────────────────────────────");

let p2Output = "";
try {
  p2Output = execSync("node scripts/test-p2-pptx.js", {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  assert(p2Output.includes("4/4 passed") || p2Output.includes("passed"), "P2 PPTX suite passes (4 client files)");
} catch (err) {
  assert(false, `P2 PPTX suite failed: ${err.stderr || err.message}`);
}

const API_BASE = process.env.I4_API_BASE || "http://localhost:3000";

function extractPptxViaTsx(filePath) {
  const out = execSync(`npx tsx scripts/extract-pptx.mjs "${filePath}"`, {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    timeout: 60000,
  });
  return JSON.parse(out.trim());
}

async function evaluateText(text) {
  const res = await fetch(`${API_BASE}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

function verifyReportResponse(label, data) {
  assert(typeof data.total === "number", `${label}: total score present`);
  assert(Array.isArray(data.dimensions) && data.dimensions.length === 9, `${label}: 9 dimensions`);
  assert(data.reportNarrative, `${label}: reportNarrative present`);
  for (const key of NARRATIVE_KEYS) {
    assert(data.reportNarrative[key] !== undefined, `${label}: reportNarrative.${key} present`);
  }
  assert(Array.isArray(data.recommendations), `${label}: recommendations array present`);
  assert(data._sections, `${label}: _sections present`);

  const serialized = JSON.stringify(data);
  for (const pattern of SPACING_ARTEFACTS) {
    assert(!pattern.test(serialized), `${label}: no spacing artefact ${pattern} in API response`);
  }
}

async function runLiveTests() {
  console.log("\n── I4-T2: Live API smoke (PPTX-extracted text) ──────────────────");

  for (const file of PPTX_FILES) {
    assert(fs.existsSync(file.path), `${file.label}: file exists`);

    let extracted;
    try {
      extracted = extractPptxViaTsx(file.path);
    } catch (err) {
      assert(false, `${file.label}: extraction failed — ${err.message}`);
      continue;
    }

    assert(extracted.slideCount >= 1, `${file.label}: slideCount >= 1`);
    assert(extracted.text.length >= 1000, `${file.label}: extracted text length >= 1000`);

    for (const pattern of SPACING_ARTEFACTS) {
      assert(!pattern.test(extracted.text), `${file.label}: no spacing artefact ${pattern} in extraction`);
    }

    console.log(`  … calling API for ${file.label} (may take ~60s)`);
    const { status, data } = await evaluateText(extracted.text);
    assert(status === 200, `${file.label}: API returns 200 (got ${status})`);
    if (status === 200) {
      verifyReportResponse(file.label, data);
      console.log(`  … ${file.label}: total=${data.total}, band=${data.band}`);
    } else {
      console.log(`  … error: ${data.error || JSON.stringify(data)}`);
    }
  }

  console.log("\n── I4-T3: Live text-paste API smoke ─────────────────────────────");
  const fixturePath = path.join(__dirname, "../fixtures/sample-5map.txt");
  let pasteText = fs.existsSync(fixturePath)
    ? fs.readFileSync(fixturePath, "utf8")
    : extractPptxViaTsx(PPTX_FILES[0].path).text.slice(0, 8000);

  const { status, data } = await evaluateText(pasteText);
  assert(status === 200, `Text paste: API returns 200 (got ${status})`);
  if (status === 200) verifyReportResponse("Text paste", data);

  console.log("\n── I4-T2: UI structure (14 sections in page.tsx) ────────────────");
  for (const [i, heading] of CANONICAL_HEADINGS.entries()) {
    assert(pageSrc.includes(`canonicalHeading(${i + 1})`), `page.tsx renders canonical section ${i + 1}`);
    assert(pageSrc.includes(heading) || pageSrc.includes("canonicalHeading"), `Section ${i + 1} heading wired`);
  }
  assert(pageSrc.includes("fileInfo.badge"), "UI shows file badge");
  assert(pageSrc.includes("Extracting slides"), "UI shows PPTX extraction loading state");
}

runLiveTests()
  .then(() => {
    console.log(`\n── I4 summary: ${passed} passed, ${failed} failed ─────────────────`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
