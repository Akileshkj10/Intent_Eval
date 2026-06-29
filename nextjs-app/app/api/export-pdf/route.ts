import { NextRequest, NextResponse } from "next/server";
import { requireSiteAuthRequest } from "@/lib/requireSiteAuth";
import { canonicalHeading, TARGETED_RECOMMENDATIONS_PLACEMENT } from "@/lib/reportFormat";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ── Types (mirror of EvaluatorClient shape) ───────────────────────────────────

interface DimensionResult {
  id: string;
  name: string;
  section: string;
  weight: number;
  score: number;
  weightedScore: number;
  rationale: string;
  keyEvidence: string;
}

interface Recommendation {
  targetDimensionId: string;
  targetDimensionName: string;
  currentScore: number;
  action: string;
  expectedImpact: string;
}

interface QuestionCommentary {
  strengths: string;
  gapsRisks: string;
  suggestedImprovements: string;
}

interface ReportNarrative {
  purposeOfBriefingNote: string;
  alignmentToHigherIntent: string;
  commentaryIntro: string;
  q1Commentary: QuestionCommentary;
  q2Commentary: QuestionCommentary;
  q3Commentary: QuestionCommentary;
  q4Commentary: QuestionCommentary;
  q5Commentary: QuestionCommentary;
  overallAssessment: string;
  appendixRationale: { dimensionId: string; rationale: string }[];
}

interface EvalResult {
  total: number;
  band: string;
  dimensions: DimensionResult[];
  subtotals: { label: string; value: number }[];
  strengths: string[];
  improvements: string[];
  recommendations: Recommendation[];
  reportNarrative?: ReportNarrative;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColour(score: number): string {
  if (score >= 4) return "#15803d";
  if (score === 3) return "#b45309";
  return "#b91c1c";
}

function bandColour(total: number): string {
  if (total >= 4.0) return "#15803d";
  if (total >= 3.0) return "#b45309";
  return "#b91c1c";
}

function dots(score: number): string {
  return "●".repeat(score) + "○".repeat(5 - score);
}

function esc(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fallbackNarrative(result: EvalResult): ReportNarrative {
  const dim = (id: string) => result.dimensions.find((d) => d.id === id);
  const fallbackQ = (dimensionId: string, suggested: string): QuestionCommentary => {
    const d = dim(dimensionId);
    return {
      strengths: d ? `${d.name} currently scores ${d.score}/5.` : "Review scored dimensions.",
      gapsRisks: d?.rationale ?? "No specific rationale returned.",
      suggestedImprovements: suggested,
    };
  };
  return {
    purposeOfBriefingNote:
      "This briefing note evaluates the submitted 5MAP against the Leading Change weighted rubric and identifies the most useful refinements before wider use.",
    alignmentToHigherIntent:
      dim("alignment_higher_direction")?.rationale ??
      "Alignment to higher intent should be reviewed against Q1 and the wider business context.",
    commentaryIntro:
      "The commentary below summarises strengths, gaps, and suggested improvements by 5MAP question.",
    q1Commentary: fallbackQ(
      "alignment_higher_direction",
      "Make the link to the boss's intent, wider strategy, and current business situation explicit enough that teams can repeat it."
    ),
    q2Commentary: fallbackQ(
      "clarity_outcome",
      "Keep the intent statement outcome-led, concise, and measurable."
    ),
    q3Commentary: fallbackQ(
      "alignment_tasks",
      "Ensure each task clearly advances the intent and identify the main effort."
    ),
    q4Commentary: fallbackQ(
      "decentralised_utility",
      "Clarify freedoms, constraints, escalation points, and trade-offs."
    ),
    q5Commentary: fallbackQ(
      "testability",
      "Add specific review cadence, assumptions, and measurable indicators."
    ),
    overallAssessment:
      result.total < 3
        ? "The intent is weak and should be rewritten before operational use."
        : result.total < 4
        ? "The intent is usable but has meaningful gaps requiring targeted improvement."
        : "The intent is strong. Light refinement on lower-scoring dimensions will bring it to an exceptional standard.",
    appendixRationale: result.dimensions.map((d) => ({
      dimensionId: d.id,
      rationale: d.rationale,
    })),
  };
}

// ── HTML report builder ───────────────────────────────────────────────────────

function buildReportHtml(result: EvalResult): string {
  const col = bandColour(result.total);
  const narrative = result.reportNarrative ?? fallbackNarrative(result);
  const now = new Date().toISOString().split("T")[0];

  const sectionOrder = ["A", "B", "C"];
  const sectionDims = (s: string) => result.dimensions.filter((d) => d.section === s);

  const dimensionTableRows = (sec: string) =>
    sectionDims(sec)
      .map((d) => {
        const c = scoreColour(d.score);
        return `
      <tr>
        <td style="font-weight:600;">${esc(d.name)}</td>
        <td style="text-align:center;color:#64748b;">${d.weight}</td>
        <td style="text-align:center;">
          <span style="color:${c};font-size:12px;">${dots(d.score)}</span><br>
          <strong style="color:${c};">${d.score}/5</strong>
        </td>
        <td style="font-size:12px;line-height:1.5;">
          <div style="margin-bottom:6px;">${esc(d.rationale)}</div>
          ${d.keyEvidence ? `<div style="font-style:italic;color:#475569;padding-left:8px;border-left:2px solid #cbd5e1;">&ldquo;${esc(d.keyEvidence)}&rdquo;</div>` : ""}
        </td>
      </tr>`;
      })
      .join("");

  const sectionTables = sectionOrder
    .map((sec) => {
      const sub = result.subtotals.find((s) => s.label.startsWith(`Section ${sec}`));
      return `
    <div style="margin-bottom:20px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;padding-bottom:4px;border-bottom:1px solid #e2e8f0;margin-bottom:8px;font-family:sans-serif;">
        ${esc(sub?.label ?? `Section ${sec}`)} — subtotal: ${sub?.value.toFixed(2) ?? "—"}
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:35%;">Dimension</th>
            <th style="width:8%;text-align:center;">Wt</th>
            <th style="width:14%;text-align:center;">Score</th>
            <th style="width:43%;">Rationale &amp; Evidence</th>
          </tr>
        </thead>
        <tbody>${dimensionTableRows(sec)}</tbody>
      </table>
    </div>`;
    })
    .join("");

  const recommendationsHtml =
    result.recommendations.length === 0
      ? `<p style="font-style:italic;color:#4b5563;">No high-impact improvements identified — this intent is already operating at a strong standard across all dimensions.</p>`
      : result.recommendations
          .map((rec, idx) => {
            const rc = scoreColour(rec.currentScore);
            return `
      <div style="background:#fafafa;border:1px solid #e2e8f0;border-left:3px solid ${rc};border-radius:4px;padding:12px 16px;margin-bottom:10px;font-family:sans-serif;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <strong style="font-size:13px;">${idx + 1}. ${esc(rec.targetDimensionName)}</strong>
          <span style="font-size:11px;color:${rc};font-weight:600;">Currently ${rec.currentScore}/5</span>
        </div>
        <div style="font-size:13px;color:#1f2937;line-height:1.5;margin-bottom:6px;">${esc(rec.action)}</div>
        ${rec.expectedImpact ? `<div style="font-size:12px;font-style:italic;color:#4b5563;">Impact: ${esc(rec.expectedImpact)}</div>` : ""}
      </div>`;
          })
          .join("");

  const appendixRows = result.dimensions
    .map((d) => {
      const rat =
        narrative.appendixRationale.find((item) => item.dimensionId === d.id)?.rationale ??
        d.rationale;
      return `
      <tr>
        <td style="font-weight:600;">${esc(d.name)}</td>
        <td style="text-align:center;">${d.section}</td>
        <td style="text-align:center;">${d.score}/5</td>
        <td style="text-align:right;">${d.weightedScore.toFixed(2)}</td>
        <td style="font-size:12px;">${esc(rat)}</td>
      </tr>`;
    })
    .join("");

  const subtotalRows = result.subtotals
    .map(
      (s) =>
        `<tr><td>${esc(s.label)}</td><td style="text-align:right;font-weight:600;">${s.value.toFixed(2)}</td></tr>`
    )
    .join("");

  const qCommentaryHtml = (
    sectionNum: number,
    commentary: QuestionCommentary
  ) => `
    <h2>${esc(canonicalHeading(sectionNum))}</h2>
    <p><strong>Strengths:</strong> ${esc(commentary.strengths)}</p>
    <p><strong>Gaps / risks:</strong> ${esc(commentary.gapsRisks)}</p>
    <p><strong>Suggested improvements:</strong> ${esc(commentary.suggestedImprovements)}</p>`;

  const alignmentDim = result.dimensions.find((d) => d.id === "alignment_higher_direction");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>5MAP Evaluation Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 13px;
    line-height: 1.6;
    color: #1e293b;
    background: #fff;
  }

  h1 {
    font-family: "Arial", sans-serif;
    font-size: 20px;
    font-weight: 800;
    color: #0f172a;
    margin: 28px 0 8px;
    padding-bottom: 6px;
    border-bottom: 2px solid #0f172a;
    page-break-after: avoid;
  }

  h2 {
    font-family: "Arial", sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
    margin: 22px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e2e8f0;
    page-break-after: avoid;
  }

  h3 {
    font-family: "Arial", sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: #1e293b;
    margin: 16px 0 8px;
    page-break-after: avoid;
  }

  p {
    margin-bottom: 8px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-bottom: 12px;
    page-break-inside: avoid;
  }

  th {
    background: #0f172a;
    color: #f1f5f9;
    font-family: "Arial", sans-serif;
    font-size: 11px;
    font-weight: 600;
    padding: 7px 10px;
    text-align: left;
  }

  td {
    padding: 8px 10px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }

  tr:nth-child(even) td {
    background: #f8fafc;
  }

  blockquote {
    border-left: 3px solid #cbd5e1;
    padding-left: 10px;
    margin: 8px 0;
    font-style: italic;
    color: #475569;
    font-size: 12px;
  }

  .score-banner {
    background: #0f172a;
    border-radius: 6px;
    padding: 16px 24px;
    margin-bottom: 24px;
    display: flex;
    gap: 40px;
    align-items: center;
    page-break-inside: avoid;
  }

  .score-banner .label {
    font-family: "Arial", sans-serif;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #94a3b8;
    margin-bottom: 4px;
  }

  .score-banner .value {
    font-family: "Arial", sans-serif;
    font-size: 36px;
    font-weight: 800;
    line-height: 1;
    color: ${col};
  }

  .score-banner .sub {
    font-size: 14px;
    color: #64748b;
  }

  .score-banner .band {
    font-family: "Arial", sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: ${col};
  }

  .meta {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 12px 16px;
    font-size: 12px;
    color: #475569;
    font-family: "Arial", sans-serif;
    margin-bottom: 16px;
  }

  .meta div { margin-bottom: 3px; }

  .overall-box {
    background: #fafafa;
    border: 1px solid #e2e8f0;
    border-top: 3px solid ${col};
    border-radius: 6px;
    padding: 16px 20px;
    font-size: 13px;
    line-height: 1.7;
    page-break-inside: avoid;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1, h2, h3 { page-break-after: avoid; }
    table { page-break-inside: avoid; }
    .score-banner { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- Score banner -->
<div class="score-banner">
  <div>
    <div class="label">Overall Score</div>
    <div class="value">${result.total.toFixed(2)}<span class="sub"> / 5.00</span></div>
  </div>
  <div>
    <div class="label">Rating</div>
    <div class="band">${esc(result.band)}</div>
  </div>
</div>

<!-- 1. Evaluation Report -->
<h1>${esc(canonicalHeading(1).toUpperCase())}</h1>
<div class="meta">
  <div><strong>Title:</strong> 5MAP Evaluation Report</div>
  <div><strong>Date:</strong> ${now}</div>
  <div><strong>Rubric version:</strong> weighted_rubric_v2025_12_01</div>
  <div><strong>Scoring:</strong> Test AI Version</div>
</div>

<!-- 2. Executive Summary -->
<h2>${esc(canonicalHeading(2))}</h2>
<p>This 5MAP scored <strong>${result.total.toFixed(2)}/5.00</strong>, placing it in the band: <strong>${esc(result.band)}</strong>.</p>
<p><strong>Relative strengths:</strong> ${esc(result.strengths.join(", "))}.</p>
<p><strong>Priority improvement areas:</strong> ${esc(result.improvements.join(", "))}.</p>

<!-- 3. Purpose -->
<h2>${esc(canonicalHeading(3))}</h2>
<p>${esc(narrative.purposeOfBriefingNote)}</p>

<!-- 4. Alignment -->
<h2>${esc(canonicalHeading(4))}</h2>
<p>${esc(narrative.alignmentToHigherIntent)}</p>
${
  alignmentDim?.keyEvidence
    ? `<blockquote><span>[5MAP input]</span> &ldquo;${esc(alignmentDim.keyEvidence)}&rdquo;</blockquote>`
    : ""
}

<!-- 5. Dimension Scores -->
<h2>${esc(canonicalHeading(5))}</h2>
${sectionTables}

<!-- 6. Total Weighted Score -->
<h2>${esc(canonicalHeading(6))}</h2>
<table style="max-width:380px;">
  <thead>
    <tr>
      <th>Section</th>
      <th style="text-align:right;">Subtotal</th>
    </tr>
  </thead>
  <tbody>
    ${subtotalRows}
    <tr>
      <td style="font-weight:700;background:#0f172a;color:#f1f5f9;font-family:sans-serif;">Total weighted score</td>
      <td style="text-align:right;font-weight:800;font-size:15px;background:#0f172a;color:${col};">${result.total.toFixed(2)}</td>
    </tr>
  </tbody>
</table>

<!-- 7. Commentary + Recommendations -->
<h2>${esc(canonicalHeading(7))}</h2>
<p>${esc(narrative.commentaryIntro)}</p>
<h3>${esc(TARGETED_RECOMMENDATIONS_PLACEMENT.label)}</h3>
${recommendationsHtml}

<!-- 8–12. Q1–Q5 commentaries -->
${qCommentaryHtml(8, narrative.q1Commentary)}
${qCommentaryHtml(9, narrative.q2Commentary)}
${qCommentaryHtml(10, narrative.q3Commentary)}
${qCommentaryHtml(11, narrative.q4Commentary)}
${qCommentaryHtml(12, narrative.q5Commentary)}

<!-- 13. Overall Assessment -->
<h2>${esc(canonicalHeading(13))}</h2>
<div class="overall-box">
  <p>Score <strong>${result.total.toFixed(2)}/5.00</strong> — <strong>${esc(result.band)}</strong></p>
  <p>${esc(narrative.overallAssessment)}</p>
</div>

<!-- 14. Appendix -->
<h2>${esc(canonicalHeading(14))}</h2>
<table>
  <thead>
    <tr>
      <th>Dimension</th>
      <th style="text-align:center;">Section</th>
      <th style="text-align:center;">Score</th>
      <th style="text-align:right;">Weighted</th>
      <th>Rationale</th>
    </tr>
  </thead>
  <tbody>${appendixRows}</tbody>
</table>

</body>
</html>`;
}

// ── Chromium launcher ─────────────────────────────────────────────────────────

async function launchBrowser() {
  // Dynamic imports so the heavy chromium binary is not bundled into other routes.
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = (await import("puppeteer-core")).default;

  // In development, try to find a locally installed Chrome so the route can be
  // tested without needing the serverless Chromium binary (which is Linux-only).
  if (process.env.NODE_ENV !== "production") {
    const { existsSync } = await import("fs");
    const devCandidates = [
      process.env.PUPPETEER_EXECUTABLE_PATH ?? "",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
    ].filter(Boolean);

    for (const p of devCandidates) {
      if (existsSync(p)) {
        return puppeteer.launch({
          executablePath: p,
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
      }
    }
    // No local Chrome found — fall through to serverless Chromium (may fail on Windows dev).
  }

  // v149+ uses static class methods; no defaultViewport or headless properties on the class.
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authError = await requireSiteAuthRequest(req);
  if (authError) return authError;

  let result: EvalResult;
  try {
    result = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!result?.dimensions?.length) {
    return NextResponse.json(
      { error: "Request body must be a valid evaluation result object." },
      { status: 400 }
    );
  }

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    const html = buildReportHtml(result);

    // "load" is sufficient — the HTML is fully self-contained with no external resources.
    await page.setContent(html, { waitUntil: "load" });

    const today = new Date().toISOString().split("T")[0];

    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "22mm", right: "20mm", bottom: "22mm", left: "20mm" },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="width:100%;font-size:8px;font-family:Arial,sans-serif;color:#64748b;text-align:center;padding:0 20mm;">
          5MAP Evaluation Report &middot; COMMERCIAL IN CONFIDENCE
        </div>`,
      footerTemplate: `
        <div style="width:100%;font-size:8px;font-family:Arial,sans-serif;color:#64748b;text-align:center;padding:0 20mm;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span> &middot; ${today}
        </div>`,
    });

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="5MAP-evaluation.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[export-pdf] Failed to render PDF:", message);
    return NextResponse.json(
      { error: `PDF generation failed: ${message}` },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
