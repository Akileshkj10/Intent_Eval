"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { parsePptx } from "@/lib/parsePptx";
import { readPdfAsBase64 } from "@/lib/parsePdf";
import { canonicalHeading, TARGETED_RECOMMENDATIONS_PLACEMENT } from "@/lib/reportFormat";
import type { ParseError } from "@/lib/types";

/* ── Types ─────────────────────────────────────────────────────────────────── */

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

interface Sections {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
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
  _sections?: Sections;
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function scoreColour(score: number) {
  if (score >= 4) return "#15803d";
  if (score === 3) return "#b45309";
  return "#b91c1c";
}

function bandColour(total: number) {
  if (total >= 4.0) return "#15803d";
  if (total >= 3.0) return "#b45309";
  return "#b91c1c";
}

function dots(score: number) {
  return "●".repeat(score) + "○".repeat(5 - score);
}

function sourceExcerpt(text: string | undefined) {
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "The relevant source section was not clearly identified in the submitted 5MAP.";

  const readable = cleaned
    .replace(/\s*[-•]\s*/g, "; ")
    .replace(/\s*>>\s*/g, "; ")
    .replace(/;\s*;/g, "; ")
    .trim();

  const max = 420;
  if (readable.length <= max) return readable;

  const window = readable.slice(0, max);
  const cutAt = Math.max(window.lastIndexOf(". "), window.lastIndexOf("; "), window.lastIndexOf(", "));
  const softCut = cutAt > 260 ? cutAt + 1 : max;
  return `${readable.slice(0, softCut).trim()}…`;
}

function overallAssessmentText(total: number) {
  if (total < 3) {
    return "The intent is weak and should be rewritten before operational use. Focus first on sharpening the mission statement and ensuring it clearly states the desired outcome and why it matters.";
  }
  if (total < 4) {
    return "The intent is usable but has meaningful gaps. Priority improvements should strengthen dimensions below 3 first, then address dimensions at 3/5 to bring the document to a high standard.";
  }
  return "The intent is strong. Light refinement on lower-scoring dimensions will bring it to an exceptional standard suitable for full operational deployment.";
}

/* ── Report component ────────────────────────────────────────────────────────── */

function Report({ result }: { result: EvalResult }) {
  const col = bandColour(result.total);
  const now = new Date().toISOString().split("T")[0];

  const sectionOrder = ["A", "B", "C"];
  const sectionDims = (s: string) => result.dimensions.filter((d) => d.section === s);
  const dim = (id: string) => result.dimensions.find((d) => d.id === id);
  const qSections = result._sections ?? { q1: "", q2: "", q3: "", q4: "", q5: "" };
  const alignment = dim("alignment_higher_direction");
  const taskAlignment = dim("alignment_tasks");
  const clarityOutcome = dim("clarity_outcome");
  const decentralisedUtility = dim("decentralised_utility");
  const testability = dim("testability");
  const fallbackQuestion = (dimension: DimensionResult | undefined, suggested: string): QuestionCommentary => ({
    strengths: dimension
      ? `${dimension.name} currently scores ${dimension.score}/5.`
      : "Relevant strengths should be reviewed against the scored dimensions.",
    gapsRisks: dimension?.rationale ?? "No specific rationale was returned for this section.",
    suggestedImprovements: suggested,
  });
  const narrative: ReportNarrative = result.reportNarrative ?? {
    purposeOfBriefingNote:
      "This briefing note evaluates the submitted 5MAP against the Leading Change weighted rubric and identifies the most useful refinements before wider use.",
    alignmentToHigherIntent:
      alignment?.rationale ??
      "Alignment to higher intent should be reviewed against Q1 and the wider business context.",
    commentaryIntro:
      "The commentary below summarises strengths, gaps, and suggested improvements by 5MAP question.",
    q1Commentary: fallbackQuestion(
      alignment,
      "Make the link to the boss's intent, wider strategy, and current business situation explicit enough that teams can repeat it."
    ),
    q2Commentary: fallbackQuestion(
      clarityOutcome,
      "Keep the intent statement outcome-led, concise, and measurable, separating success measures from explanatory narrative where possible."
    ),
    q3Commentary: fallbackQuestion(
      taskAlignment,
      "Ensure each task clearly advances the intent and identify the main effort so teams can prioritise when resources are constrained."
    ),
    q4Commentary: fallbackQuestion(
      decentralisedUtility,
      "Clarify freedoms, constraints, escalation points, and trade-offs so teams know what they can decide without further permission."
    ),
    q5Commentary: fallbackQuestion(
      testability,
      "Add specific review cadence, assumptions, questions for the boss, and measurable indicators that show whether the intent is working."
    ),
    overallAssessment: overallAssessmentText(result.total),
    appendixRationale: result.dimensions.map((d) => ({ dimensionId: d.id, rationale: d.rationale })),
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      {/* Score banner */}
      <div
        style={{
          background: "#0f172a",
          borderRadius: 8,
          padding: "20px 28px",
          marginBottom: 28,
          display: "flex",
          gap: 40,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", marginBottom: 4 }}>
            Overall Score
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: col }}>
            {result.total.toFixed(2)}
            <span style={{ fontSize: 16, color: "#64748b" }}> / 5.00</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", marginBottom: 4 }}>
            Rating
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: col }}>{result.band}</div>
        </div>
      </div>

      {/* Document */}
      <div
        className="report"
        style={{
          background: "#fff",
          border: "1px solid #d1d5db",
          borderRadius: 6,
          padding: "40px 48px",
        }}
      >
        <h1>{canonicalHeading(1).toUpperCase()}</h1>
        <div className="meta">
          <div>Title: 5MAP Evaluation Report</div>
          <div>Date: {now}</div>
          <div>Rubric version: weighted_rubric_v2025_12_01</div>
          <div>Scoring: Test AI Version</div>
        </div>

        {/* 2. Executive Summary */}
        <h2>{canonicalHeading(2)}</h2>
        <p>
          This 5MAP scored <strong>{result.total.toFixed(2)}/5.00</strong>, placing it in the band:{" "}
          <strong>{result.band}</strong>
        </p>
        <p>
          <strong>Relative strengths:</strong> {result.strengths.join(", ")}.
        </p>
        <p>
          <strong>Priority improvement areas:</strong> {result.improvements.join(", ")}.
        </p>

        {/* 3. Purpose */}
        <h2>{canonicalHeading(3)}</h2>
        <p>{narrative.purposeOfBriefingNote}</p>

        {/* 4. Alignment */}
        <h2>{canonicalHeading(4)}</h2>
        <p>{narrative.alignmentToHigherIntent}</p>
        {alignment?.keyEvidence && (
          <blockquote>
            <span>[5MAP input]</span> &ldquo;{alignment.keyEvidence}&rdquo;
          </blockquote>
        )}

        {/* 5. Dimension Scores */}
        <h2>{canonicalHeading(5)}</h2>
        {sectionOrder.map((sec) => (
          <div key={sec} style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#64748b",
                marginBottom: 8,
                paddingBottom: 4,
                borderBottom: "1px solid #e2e8f0",
                fontFamily: "sans-serif",
              }}
            >
              {result.subtotals.find((s) => s.label.startsWith(`Section ${sec}`))?.label ?? `Section ${sec}`}
              {" — subtotal: "}
              {result.subtotals.find((s) => s.label.startsWith(`Section ${sec}`))?.value.toFixed(2)}
            </div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "36%" }}>Dimension</th>
                  <th style={{ width: "8%", textAlign: "center" }}>Wt</th>
                  <th style={{ width: "14%", textAlign: "center" }}>Score</th>
                  <th style={{ width: "42%" }}>Rationale &amp; Evidence</th>
                </tr>
              </thead>
              <tbody>
                {sectionDims(sec).map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td style={{ textAlign: "center", color: "#64748b" }}>{d.weight}</td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        className="score-cell"
                        style={{ color: scoreColour(d.score), fontSize: 13 }}
                        title={`${d.score}/5`}
                      >
                        {dots(d.score)}
                      </span>
                      <br />
                      <span style={{ color: scoreColour(d.score), fontWeight: 700, fontSize: 13 }}>
                        {d.score}/5
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                      <div style={{ marginBottom: 8 }}>
                        {d.rationale}{" "}
                        <span style={{ color: "#94a3b8", fontSize: 11.5, whiteSpace: "nowrap" }}>
                          [5MAP input]
                        </span>
                      </div>
                      {d.keyEvidence && (
                        <div
                          style={{
                            fontStyle: "italic",
                            color: "#475569",
                            fontSize: 12,
                            paddingLeft: 8,
                            borderLeft: "2px solid #cbd5e1",
                          }}
                        >
                          &ldquo;{d.keyEvidence}&rdquo;
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* 6. Total Weighted Score */}
        <h2>{canonicalHeading(6)}</h2>
        <table style={{ maxWidth: 420 }}>
          <thead>
            <tr>
              <th>Section</th>
              <th style={{ textAlign: "right" }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {result.subtotals.map((s) => (
              <tr key={s.label}>
                <td>{s.label}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{s.value.toFixed(2)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ fontWeight: 700, background: "#0f172a", color: "#f1f5f9" }}>
                Total weighted score
              </td>
              <td
                style={{
                  textAlign: "right",
                  fontWeight: 800,
                  fontSize: 16,
                  background: "#0f172a",
                  color: col,
                }}
              >
                {result.total.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 7. Commentary introduction + targeted recommendations */}
        <h2>{canonicalHeading(7)}</h2>
        <p>{narrative.commentaryIntro}</p>
        <h3>{TARGETED_RECOMMENDATIONS_PLACEMENT.label}</h3>
        {result.recommendations.length === 0 ? (
          <p style={{ fontStyle: "italic", color: "#4b5563" }}>
            No high-impact improvements identified — this intent is already operating at a strong
            standard across all dimensions.
          </p>
        ) : (
          <div>
            {result.recommendations.map((rec, idx) => {
              const col = scoreColour(rec.currentScore);
              return (
                <div
                  key={rec.targetDimensionId}
                  style={{
                    background: "#fafafa",
                    border: "1px solid #e2e8f0",
                    borderLeft: `3px solid ${col}`,
                    borderRadius: 4,
                    padding: "12px 16px",
                    marginBottom: 12,
                    fontFamily: "sans-serif",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 12,
                      marginBottom: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>
                      {idx + 1}. {rec.targetDimensionName}
                    </div>
                    <div style={{ fontSize: 11.5, color: col, fontWeight: 600 }}>
                      Currently {rec.currentScore}/5
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#1f2937", lineHeight: 1.55, marginBottom: 6 }}>
                    {rec.action}
                  </div>
                  {rec.expectedImpact && (
                    <div
                      style={{
                        fontSize: 12,
                        fontStyle: "italic",
                        color: "#4b5563",
                        lineHeight: 1.5,
                      }}
                    >
                      Impact: {rec.expectedImpact}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 8. Q1 */}
        <h2>{canonicalHeading(8)}</h2>
        <p>
          <strong>Strengths:</strong> {narrative.q1Commentary.strengths}
        </p>
        <p>
          <strong>Gaps / risks:</strong> {narrative.q1Commentary.gapsRisks}
        </p>
        <p>
          <strong>Suggested improvements:</strong> {narrative.q1Commentary.suggestedImprovements}
        </p>
        <blockquote className="source-excerpt">
          <span>Q1 source excerpt</span> {sourceExcerpt(qSections.q1)}
        </blockquote>

        {/* 9. Q2 */}
        <h2>{canonicalHeading(9)}</h2>
        <p>
          <strong>Strengths:</strong> {narrative.q2Commentary.strengths}
        </p>
        <p>
          <strong>Gaps / risks:</strong> {narrative.q2Commentary.gapsRisks}
        </p>
        <p>
          <strong>Suggested improvements:</strong> {narrative.q2Commentary.suggestedImprovements}
        </p>
        <blockquote className="source-excerpt">
          <span>Q2 source excerpt</span> {sourceExcerpt(qSections.q2)}
        </blockquote>

        {/* 10. Q3 */}
        <h2>{canonicalHeading(10)}</h2>
        <p>
          <strong>Strengths:</strong> {narrative.q3Commentary.strengths}
        </p>
        <p>
          <strong>Gaps / risks:</strong> {narrative.q3Commentary.gapsRisks}
        </p>
        <p>
          <strong>Suggested improvements:</strong> {narrative.q3Commentary.suggestedImprovements}
        </p>
        <blockquote className="source-excerpt">
          <span>Q3 source excerpt</span> {sourceExcerpt(qSections.q3)}
        </blockquote>

        {/* 11. Q4 */}
        <h2>{canonicalHeading(11)}</h2>
        <p>
          <strong>Strengths:</strong> {narrative.q4Commentary.strengths}
        </p>
        <p>
          <strong>Gaps / risks:</strong> {narrative.q4Commentary.gapsRisks}
        </p>
        <p>
          <strong>Suggested improvements:</strong> {narrative.q4Commentary.suggestedImprovements}
        </p>
        <blockquote className="source-excerpt">
          <span>Q4 source excerpt</span> {sourceExcerpt(qSections.q4)}
        </blockquote>

        {/* 12. Q5 */}
        <h2>{canonicalHeading(12)}</h2>
        <p>
          <strong>Strengths:</strong> {narrative.q5Commentary.strengths}
        </p>
        <p>
          <strong>Gaps / risks:</strong> {narrative.q5Commentary.gapsRisks}
        </p>
        <p>
          <strong>Suggested improvements:</strong> {narrative.q5Commentary.suggestedImprovements}
        </p>
        <blockquote className="source-excerpt">
          <span>Q5 source excerpt</span> {sourceExcerpt(qSections.q5)}
        </blockquote>

        {/* 13. Overall Assessment */}
        <h2>{canonicalHeading(13)}</h2>
        <div
          style={{
            background: "#fafafa",
            border: `1px solid #e2e8f0`,
            borderTop: `3px solid ${col}`,
            borderRadius: 6,
            padding: "16px 20px",
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          <p>
            Score <strong>{result.total.toFixed(2)}/5.00</strong> — <strong>{result.band}</strong>
          </p>
          <p>{narrative.overallAssessment}</p>
        </div>

        {/* 14. Appendix */}
        <h2>{canonicalHeading(14)}</h2>
        <table>
          <thead>
            <tr>
              <th>Dimension</th>
              <th style={{ textAlign: "center" }}>Section</th>
              <th style={{ textAlign: "center" }}>Score</th>
              <th style={{ textAlign: "right" }}>Weighted</th>
              <th>Rationale</th>
            </tr>
          </thead>
          <tbody>
            {result.dimensions.map((d) => (
              <tr key={`appendix-${d.id}`}>
                <td style={{ fontWeight: 600 }}>{d.name}</td>
                <td style={{ textAlign: "center" }}>{d.section}</td>
                <td style={{ textAlign: "center" }}>{d.score}/5</td>
                <td style={{ textAlign: "right" }}>{d.weightedScore.toFixed(2)}</td>
                <td>
                  {narrative.appendixRationale.find((item) => item.dimensionId === d.id)?.rationale ??
                    d.rationale}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Download */}
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => {
            const json = JSON.stringify(result, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "5map_evaluation.json";
            a.click();
          }}
          style={{
            background: "#0f172a",
            color: "#f1f5f9",
            border: "none",
            borderRadius: 6,
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Download JSON
        </button>
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────────── */

export default function Home() {
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then((data: { protectionEnabled?: boolean; authenticated?: boolean }) => {
        if (data.protectionEnabled && !data.authenticated) {
          window.location.replace("/login");
          return;
        }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  // ── Core state ─────────────────────────────────────────────────────────────
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<EvalResult | null>(null);
  const [evalError, setEvalError] = useState("");

  // ── File upload state ───────────────────────────────────────────────────────
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; badge: string } | null>(null);
  const [fileError, setFileError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ───────────────────────────────────────────────────────────

  const clearFile = useCallback(() => {
    setPdfBase64(null);
    setFileInfo(null);
    setFileError("");
    setExtracting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setFileError("");
    setExtracting(false);
    setPdfBase64(null);
    setFileInfo(null);
    setText("");

    const name = file.name;
    const lowerName = name.toLowerCase();

    // Block old .ppt binary format
    if (lowerName.endsWith(".ppt") && !lowerName.endsWith(".pptx")) {
      setFileError("Please save this file as .pptx first. Open it in PowerPoint → File → Save As → PowerPoint Presentation (.pptx).");
      return;
    }

    // Block unsupported types
    if (!lowerName.endsWith(".pptx") && !lowerName.endsWith(".pdf")) {
      setFileError("Only .pptx and .pdf files are supported.");
      return;
    }

    // ── PPTX path ─────────────────────────────────────────────────────────────
    if (lowerName.endsWith(".pptx")) {
      setExtracting(true);
      try {
        const buffer = await file.arrayBuffer();
        const { text: extracted, slideCount } = await parsePptx(buffer);
        setText(extracted);
        setFileInfo({ name, badge: `${slideCount} slide${slideCount !== 1 ? "s" : ""}` });
      } catch (err) {
        const pe = err as ParseError;
        if (pe.type === "password_protected") {
          setFileError("This file is password-protected. Remove the password in PowerPoint (File → Info → Protect Presentation) and re-upload.");
        } else if (pe.type === "wrong_format") {
          setFileError("This doesn't appear to be a valid .pptx file. Try re-saving it from PowerPoint.");
        } else {
          setFileError((err as Error).message ?? "Could not read this file. Try re-saving it from PowerPoint.");
        }
      } finally {
        setExtracting(false);
      }
      return;
    }

    // ── PDF path ──────────────────────────────────────────────────────────────
    try {
      const { base64, sizeBytes } = await readPdfAsBase64(file);
      const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
      setPdfBase64(base64);
      setFileInfo({ name, badge: `PDF · ${sizeMB} MB` });
    } catch (err) {
      const pe = err as ParseError;
      if (pe.type === "too_large") {
        setFileError("PDF is too large (max 32 MB). Try compressing it or splitting into smaller files.");
      } else {
        setFileError((err as Error).message ?? "Could not read this PDF. Please try again.");
      }
    }
  }, []);

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFile(e.target.files?.[0] ?? null);
    },
    [handleFile]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFile(e.dataTransfer.files?.[0] ?? null);
    },
    [handleFile]
  );

  // ── Evaluate ────────────────────────────────────────────────────────────────

  const canEvaluate = !loading && (!!text.trim() || !!pdfBase64);

  async function handleEvaluate() {
    if (!canEvaluate) return;
    setLoading(true);
    setResult(null);
    setEvalError("");

    try {
      let body: Record<string, string>;

      if (pdfBase64) {
        setStatus("Sending PDF to Claude…");
        body = { pdf: pdfBase64 };
      } else {
        setStatus("Identifying Q1–Q5 sections…");
        body = { text };
      }

      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setStatus("Scoring all 9 dimensions…");
      const data = await res.json();

      if (!res.ok) {
        setEvalError(data.error ?? "Unknown error.");
        return;
      }

      setResult(data as EvalResult);
      setStatus("");
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "32px 16px" }}>
        <div style={{ maxWidth: 860, margin: "80px auto 0", textAlign: "center", color: "#64748b" }}>
          Checking access…
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "32px 16px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
              5MAP Intent Evaluator
            </h1>
            <p style={{ fontSize: 13, color: "#64748b" }}>
              Test AI Version · Confidential · Outputs are not stored
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
              window.location.href = "/login";
            }}
            style={{
              alignSelf: "flex-start",
              padding: "6px 12px",
              fontSize: 12,
              color: "#64748b",
              background: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>

        {/* Input card */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: "24px 28px",
            marginBottom: 24,
          }}
        >
          {/* ── Text area ── */}
          <label
            htmlFor="map-text"
            style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}
          >
            Paste your 5MAP content
          </label>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
            Paste text directly, or upload a .pptx / .pdf file below — the AI identifies Q1–Q5 sections automatically.
          </p>
          <textarea
            id="map-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              // If user starts typing, clear any loaded PDF (modes are exclusive)
              if (pdfBase64) {
                setPdfBase64(null);
                setFileInfo(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }
            }}
            placeholder={
              pdfBase64
                ? "PDF loaded — Claude will read it directly. No text preview available."
                : "Paste your 5MAP content here…\n\nWith labels:\nQ1: [Context and higher intent]\nQ2: [Intent and KPIs]\nQ3: [Implied tasks]\nQ4: [Boundaries]\nQ5: [Backbrief]\n\nOr just paste raw text — the AI finds the sections."
            }
            style={{
              width: "100%",
              minHeight: 280,
              padding: "12px 14px",
              fontSize: 14,
              fontFamily: "inherit",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              resize: "vertical",
              outline: "none",
              color: "#1e293b",
              lineHeight: 1.6,
              background: pdfBase64 ? "#f8fafc" : "#fff",
            }}
            disabled={loading || !!pdfBase64}
          />

          {/* ── Upload area ── */}
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                marginBottom: 8,
              }}
            >
              Or upload a file
            </div>

            {/* Drop zone — hidden when a file is already loaded */}
            {!fileInfo && !extracting && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragOver ? "#0f172a" : "#cbd5e1"}`,
                  borderRadius: 6,
                  padding: "16px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: isDragOver ? "#f1f5f9" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  Drag &amp; drop or{" "}
                  <span style={{ color: "#0f172a", fontWeight: 600, textDecoration: "underline" }}>
                    click to browse
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>
                  Supports .pptx (slides extracted) and .pdf (read directly by Claude)
                </div>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pptx,.pdf"
              style={{ display: "none" }}
              onChange={onFileInputChange}
            />

            {/* Extracting spinner */}
            {extracting && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 13,
                  color: "#374151",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid #cbd5e1",
                    borderTopColor: "#0f172a",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    flexShrink: 0,
                  }}
                />
                Extracting slides…
              </div>
            )}

            {/* File loaded badge */}
            {fileInfo && !extracting && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  borderRadius: 6,
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{fileInfo.name.endsWith(".pdf") ? "📄" : "📊"}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#166534" }}>
                    {fileInfo.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      background: "#dcfce7",
                      color: "#166534",
                      border: "1px solid #86efac",
                      borderRadius: 4,
                      padding: "2px 7px",
                      fontWeight: 600,
                    }}
                  >
                    {fileInfo.badge}
                  </span>
                  {pdfBase64 && (
                    <span style={{ fontSize: 11.5, color: "#4b5563", fontStyle: "italic" }}>
                      Claude will read the PDF directly — no text preview
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { clearFile(); if (pdfBase64) setText(""); }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#6b7280",
                    fontSize: 16,
                    lineHeight: 1,
                    padding: "2px 4px",
                    flexShrink: 0,
                  }}
                  title="Remove file"
                >
                  ×
                </button>
              </div>
            )}

            {/* File error */}
            {fileError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 14px",
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: 6,
                  marginTop: 8,
                  fontSize: 13,
                  color: "#991b1b",
                }}
              >
                <span>⚠ {fileError}</span>
                <button
                  onClick={() => setFileError("")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#991b1b",
                    fontSize: 16,
                    lineHeight: 1,
                    padding: "0 4px",
                    flexShrink: 0,
                  }}
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* ── Generate button ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
            <button
              onClick={handleEvaluate}
              disabled={!canEvaluate}
              style={{
                background: !canEvaluate ? "#94a3b8" : "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "11px 28px",
                fontSize: 15,
                fontWeight: 700,
                cursor: !canEvaluate ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {loading ? "Evaluating…" : "Generate Evaluation Report"}
            </button>

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    border: "2px solid #cbd5e1",
                    borderTopColor: "#0f172a",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <span style={{ fontSize: 13, color: "#64748b" }}>{status}</span>
              </div>
            )}
          </div>
        </div>

        {/* Eval error */}
        {evalError && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: 6,
              padding: "14px 18px",
              fontSize: 14,
              color: "#991b1b",
              marginBottom: 24,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <span><strong>Error:</strong> {evalError}</span>
            <button
              onClick={() => setEvalError("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontSize: 16, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}
            >×</button>
          </div>
        )}

        {/* Report */}
        {result && <Report result={result} />}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea:focus { border-color: #0f172a; box-shadow: 0 0 0 2px rgba(15,23,42,0.08); }
        button:hover:not(:disabled) { background: #1e3a5f !important; }
      `}</style>
    </div>
  );
}
