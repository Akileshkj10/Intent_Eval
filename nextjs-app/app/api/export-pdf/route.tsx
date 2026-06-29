import { NextRequest, NextResponse } from "next/server";
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";

// Register Inter from Google Fonts so the PDF uses the same typeface as the UI.
Font.register({
  family: "Inter",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2",
      fontWeight: 400,
    },
    {
      src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hiJ-Ek-_EeA.woff2",
      fontWeight: 600,
    },
    {
      src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hiJ-Ek-_EeA.woff2",
      fontWeight: 700,
    },
  ],
});
import { requireSiteAuthRequest } from "@/lib/requireSiteAuth";
import { canonicalHeading, TARGETED_RECOMMENDATIONS_PLACEMENT } from "@/lib/reportFormat";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

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

function scoreColor(score: number): string {
  if (score >= 4) return "#15803d";
  if (score === 3) return "#b45309";
  return "#b91c1c";
}

function bandColor(total: number): string {
  if (total >= 4.0) return "#15803d";
  if (total >= 3.0) return "#b45309";
  return "#b91c1c";
}

function dots(score: number): string {
  return "●".repeat(score) + "○".repeat(5 - score);
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

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    paddingTop: 52,
    paddingBottom: 52,
    paddingHorizontal: 44,
    fontSize: 10,
    fontFamily: "Inter",
    color: "#1e293b",
    lineHeight: 1.5,
  },
  // Fixed header/footer
  pageHeader: {
    position: "absolute",
    top: 18,
    left: 44,
    right: 44,
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 4,
  },
  pageFooter: {
    position: "absolute",
    bottom: 18,
    left: 44,
    right: 44,
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 4,
  },
  // Score banner
  scoreBanner: {
    backgroundColor: "#0f172a",
    borderRadius: 4,
    padding: 16,
    marginBottom: 20,
    flexDirection: "row",
    gap: 40,
    alignItems: "center",
  },
  bannerLabel: { fontSize: 8, color: "#94a3b8", textTransform: "uppercase", marginBottom: 3 },
  bannerScore: { fontSize: 28, fontFamily: "Inter", fontWeight: 700, lineHeight: 1 },
  bannerSub: { fontSize: 11, color: "#64748b" },
  bannerBand: { fontSize: 12, fontFamily: "Inter", fontWeight: 700 },
  // Meta box
  metaBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 0.5,
    borderColor: "#e2e8f0",
    borderRadius: 3,
    padding: 10,
    marginBottom: 14,
    fontSize: 9,
    color: "#475569",
  },
  metaRow: { marginBottom: 2 },
  // Headings
  h1: {
    fontSize: 15,
    fontFamily: "Inter",
    fontWeight: 700,
    color: "#0f172a",
    marginTop: 20,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: "#0f172a",
  },
  h2: {
    fontSize: 12,
    fontFamily: "Inter",
    fontWeight: 700,
    color: "#0f172a",
    marginTop: 16,
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  h3: {
    fontSize: 10,
    fontFamily: "Inter",
    fontWeight: 700,
    color: "#1e293b",
    marginTop: 10,
    marginBottom: 5,
  },
  p: { marginBottom: 5, lineHeight: 1.55 },
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderRadius: 2,
    marginBottom: 1,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontFamily: "Inter",
    fontWeight: 700,
    color: "#f1f5f9",
    padding: "5 8",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    minHeight: 28,
  },
  tableRowAlt: { backgroundColor: "#f8fafc" },
  tableCell: { padding: "6 8", fontSize: 9, lineHeight: 1.45 },
  evidence: {
    fontStyle: "italic",
    color: "#475569",
    borderLeftWidth: 2,
    borderLeftColor: "#cbd5e1",
    paddingLeft: 5,
    marginTop: 3,
    fontSize: 8.5,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Inter",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#64748b",
    marginBottom: 5,
    marginTop: 8,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  // Recommendation card
  recCard: {
    borderWidth: 0.5,
    borderColor: "#e2e8f0",
    borderRadius: 3,
    padding: 10,
    marginBottom: 7,
  },
  recTitle: { fontSize: 10, fontFamily: "Inter", fontWeight: 700, marginBottom: 4 },
  recAction: { fontSize: 9, color: "#1f2937", lineHeight: 1.5, marginBottom: 3 },
  recImpact: { fontSize: 8.5, fontStyle: "italic", color: "#4b5563" },
  // Overall box
  overallBox: {
    borderWidth: 0.5,
    borderColor: "#e2e8f0",
    borderRadius: 3,
    padding: 12,
    marginTop: 6,
  },
  // Commentary section
  commentaryLabel: { fontFamily: "Inter" },
});

// ── PDF Document component ────────────────────────────────────────────────────

function ReportDocument({ result, today }: { result: EvalResult; today: string }) {
  const narrative = result.reportNarrative ?? fallbackNarrative(result);
  const col = bandColor(result.total);
  const sectionOrder = ["A", "B", "C"] as const;
  const sectionDims = (s: string) => result.dimensions.filter((d) => d.section === s);
  const alignmentDim = result.dimensions.find((d) => d.id === "alignment_higher_direction");

  const qCommentary = (sectionNum: number, commentary: QuestionCommentary) => (
    <View>
      <Text style={S.h2}>{canonicalHeading(sectionNum)}</Text>
      <Text style={S.p}>
        <Text style={S.commentaryLabel}>Strengths: </Text>
        {commentary.strengths}
      </Text>
      <Text style={S.p}>
        <Text style={S.commentaryLabel}>Gaps / risks: </Text>
        {commentary.gapsRisks}
      </Text>
      <Text style={S.p}>
        <Text style={S.commentaryLabel}>Suggested improvements: </Text>
        {commentary.suggestedImprovements}
      </Text>
    </View>
  );

  return (
    <Document title="5MAP Evaluation Report" author="Intent Evaluator">
      <Page size="A4" style={S.page}>
        {/* Fixed header */}
        <Text style={S.pageHeader} fixed>
          5MAP Evaluation Report · COMMERCIAL IN CONFIDENCE
        </Text>

        {/* Fixed footer */}
        <Text
          style={S.pageFooter}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages} · ${today}`
          }
        />

        {/* Score banner */}
        <View style={S.scoreBanner}>
          <View>
            <Text style={S.bannerLabel}>Overall Score</Text>
            <Text style={[S.bannerScore, { color: col }]}>
              {result.total.toFixed(2)}
              <Text style={S.bannerSub}> / 5.00</Text>
            </Text>
          </View>
          <View>
            <Text style={S.bannerLabel}>Rating</Text>
            <Text style={[S.bannerBand, { color: col }]}>{result.band}</Text>
          </View>
        </View>

        {/* 1. Evaluation Report */}
        <Text style={S.h1}>{canonicalHeading(1).toUpperCase()}</Text>
        <View style={S.metaBox}>
          <Text style={S.metaRow}>Title: 5MAP Evaluation Report</Text>
          <Text style={S.metaRow}>Date: {today}</Text>
          <Text style={S.metaRow}>Rubric version: weighted_rubric_v2025_12_01</Text>
          <Text style={S.metaRow}>Scoring: Test AI Version</Text>
        </View>

        {/* 2. Executive Summary */}
        <Text style={S.h2}>{canonicalHeading(2)}</Text>
        <Text style={S.p}>
          This 5MAP scored{" "}
          <Text style={{ fontFamily: "Inter", fontWeight: 700 }}>{result.total.toFixed(2)}/5.00</Text>,
          placing it in the band:{" "}
          <Text style={{ fontFamily: "Inter", fontWeight: 700 }}>{result.band}</Text>.
        </Text>
        <Text style={S.p}>
          <Text style={{ fontFamily: "Inter", fontWeight: 700 }}>Relative strengths: </Text>
          {result.strengths.join(", ")}.
        </Text>
        <Text style={S.p}>
          <Text style={{ fontFamily: "Inter" }}>Priority improvement areas: </Text>
          {result.improvements.join(", ")}.
        </Text>

        {/* 3. Purpose */}
        <Text style={S.h2}>{canonicalHeading(3)}</Text>
        <Text style={S.p}>{narrative.purposeOfBriefingNote}</Text>

        {/* 4. Alignment */}
        <Text style={S.h2}>{canonicalHeading(4)}</Text>
        <Text style={S.p}>{narrative.alignmentToHigherIntent}</Text>
        {alignmentDim?.keyEvidence ? (
          <Text style={[S.evidence, { marginBottom: 6 }]}>"{alignmentDim.keyEvidence}"</Text>
        ) : null}

        {/* 5. Dimension Scores */}
        <Text style={S.h2}>{canonicalHeading(5)}</Text>
        {sectionOrder.map((sec) => {
          const sub = result.subtotals.find((s) => s.label.startsWith(`Section ${sec}`));
          const dims = sectionDims(sec);
          return (
            <View key={sec} style={{ marginBottom: 12 }} wrap={false}>
              <Text style={S.sectionLabel}>
                {sub?.label ?? `Section ${sec}`} — subtotal: {sub?.value.toFixed(2) ?? "—"}
              </Text>
              {/* Table header */}
              <View style={S.tableHeader}>
                <Text style={[S.tableHeaderCell, { flex: 3 }]}>Dimension</Text>
                <Text style={[S.tableHeaderCell, { flex: 0.6, textAlign: "center" }]}>Wt</Text>
                <Text style={[S.tableHeaderCell, { flex: 1, textAlign: "center" }]}>Score</Text>
                <Text style={[S.tableHeaderCell, { flex: 4 }]}>Rationale &amp; Evidence</Text>
              </View>
              {dims.map((d, idx) => {
                const c = scoreColor(d.score);
                return (
                  <View
                    key={d.id}
                    style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}
                    wrap={false}
                  >
                    <View style={[S.tableCell, { flex: 3 }]}>
                      <Text style={{ fontFamily: "Inter" }}>{d.name}</Text>
                    </View>
                    <View style={[S.tableCell, { flex: 0.6, alignItems: "center" }]}>
                      <Text style={{ color: "#64748b" }}>{d.weight}</Text>
                    </View>
                    <View style={[S.tableCell, { flex: 1, alignItems: "center" }]}>
                      <Text style={{ color: c, fontSize: 9 }}>{dots(d.score)}</Text>
                      <Text style={{ color: c, fontFamily: "Inter" }}>
                        {d.score}/5
                      </Text>
                    </View>
                    <View style={[S.tableCell, { flex: 4 }]}>
                      <Text>{d.rationale}</Text>
                      {d.keyEvidence ? (
                        <Text style={S.evidence}>"{d.keyEvidence}"</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* 6. Total Weighted Score */}
        <Text style={S.h2}>{canonicalHeading(6)}</Text>
        <View style={{ maxWidth: 300, marginBottom: 12 }}>
          <View style={S.tableHeader}>
            <Text style={[S.tableHeaderCell, { flex: 3 }]}>Section</Text>
            <Text style={[S.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Subtotal</Text>
          </View>
          {result.subtotals.map((s, idx) => (
            <View key={s.label} style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}>
              <Text style={[S.tableCell, { flex: 3 }]}>{s.label}</Text>
              <Text style={[S.tableCell, { flex: 1, textAlign: "right", fontFamily: "Inter" }]}>
                {s.value.toFixed(2)}
              </Text>
            </View>
          ))}
          {/* Total row */}
          <View style={[S.tableRow, { backgroundColor: "#0f172a" }]}>
            <Text style={[S.tableCell, { flex: 3, color: "#f1f5f9", fontFamily: "Inter" }]}>
              Total weighted score
            </Text>
            <Text
              style={[
                S.tableCell,
                { flex: 1, textAlign: "right", fontFamily: "Inter", fontSize: 12, color: col },
              ]}
            >
              {result.total.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* 7. Commentary + Recommendations */}
        <Text style={S.h2}>{canonicalHeading(7)}</Text>
        <Text style={S.p}>{narrative.commentaryIntro}</Text>
        <Text style={S.h3}>{TARGETED_RECOMMENDATIONS_PLACEMENT.label}</Text>
        {result.recommendations.length === 0 ? (
          <Text style={[S.p, { fontStyle: "italic", color: "#4b5563" }]}>
            No high-impact improvements identified — this intent is already operating at a strong
            standard across all dimensions.
          </Text>
        ) : (
          result.recommendations.map((rec, idx) => {
            const rc = scoreColor(rec.currentScore);
            return (
              <View
                key={rec.targetDimensionId}
                style={[S.recCard, { borderLeftWidth: 3, borderLeftColor: rc }]}
                wrap={false}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={S.recTitle}>
                    {idx + 1}. {rec.targetDimensionName}
                  </Text>
                  <Text style={{ fontSize: 9, color: rc, fontFamily: "Inter" }}>
                    Currently {rec.currentScore}/5
                  </Text>
                </View>
                <Text style={S.recAction}>{rec.action}</Text>
                {rec.expectedImpact ? (
                  <Text style={S.recImpact}>Impact: {rec.expectedImpact}</Text>
                ) : null}
              </View>
            );
          })
        )}

        {/* 8–12. Q1–Q5 commentaries */}
        {qCommentary(8, narrative.q1Commentary)}
        {qCommentary(9, narrative.q2Commentary)}
        {qCommentary(10, narrative.q3Commentary)}
        {qCommentary(11, narrative.q4Commentary)}
        {qCommentary(12, narrative.q5Commentary)}

        {/* 13. Overall Assessment */}
        <Text style={S.h2}>{canonicalHeading(13)}</Text>
        <View style={[S.overallBox, { borderTopWidth: 2, borderTopColor: col }]} wrap={false}>
          <Text style={[S.p, { fontFamily: "Inter" }]}>
            Score {result.total.toFixed(2)}/5.00 — {result.band}
          </Text>
          <Text style={S.p}>{narrative.overallAssessment}</Text>
        </View>

        {/* 14. Appendix */}
        <Text style={S.h2}>{canonicalHeading(14)}</Text>
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderCell, { flex: 2.5 }]}>Dimension</Text>
          <Text style={[S.tableHeaderCell, { flex: 0.6, textAlign: "center" }]}>Section</Text>
          <Text style={[S.tableHeaderCell, { flex: 0.8, textAlign: "center" }]}>Score</Text>
          <Text style={[S.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Weighted</Text>
          <Text style={[S.tableHeaderCell, { flex: 4 }]}>Rationale</Text>
        </View>
        {result.dimensions.map((d, idx) => {
          const rat =
            narrative.appendixRationale.find((item) => item.dimensionId === d.id)?.rationale ??
            d.rationale;
          return (
            <View key={`appendix-${d.id}`} style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
              <Text style={[S.tableCell, { flex: 2.5, fontFamily: "Inter" }]}>{d.name}</Text>
              <Text style={[S.tableCell, { flex: 0.6, textAlign: "center" }]}>{d.section}</Text>
              <Text style={[S.tableCell, { flex: 0.8, textAlign: "center" }]}>{d.score}/5</Text>
              <Text style={[S.tableCell, { flex: 1, textAlign: "right" }]}>{d.weightedScore.toFixed(2)}</Text>
              <Text style={[S.tableCell, { flex: 4 }]}>{rat}</Text>
            </View>
          );
        })}
      </Page>
    </Document>
  );
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

  try {
    const today = new Date().toISOString().split("T")[0];
    const pdfBuffer = await renderToBuffer(
      <ReportDocument result={result} today={today} />
    );

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
  }
}
