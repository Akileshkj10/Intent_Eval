"use client";

import { useState } from "react";

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

interface EvalResult {
  total: number;
  band: string;
  sections: { q1: string; q2: string; q3: string; q4: string; q5: string };
  dimensions: DimensionResult[];
  subtotals: { label: string; value: number }[];
  strengths: string[];
  improvements: string[];
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

/* ── Report component ────────────────────────────────────────────────────────── */

function Report({ result }: { result: EvalResult }) {
  const col = bandColour(result.total);
  const now = new Date().toISOString().split("T")[0];

  const sectionOrder = ["A", "B", "C"];
  const sectionDims = (s: string) => result.dimensions.filter((d) => d.section === s);

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
        <h1>5MAP EVALUATION REPORT</h1>
        <div className="meta">
          <div>Date: {now}</div>
          <div>Rubric version: weighted_rubric_v2025_12_01</div>
          <div>Scoring: Test AI Version</div>
        </div>

        {/* 1. Executive Summary */}
        <h2>1. Executive Summary</h2>
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

        {/* 2. Dimension Scores */}
        <h2>2. Dimension Scores</h2>
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
                    <td style={{ fontSize: 12.5 }}>
                      <div style={{ marginBottom: 4 }}>{d.rationale}</div>
                      {d.keyEvidence && (
                        <div style={{ fontStyle: "italic", color: "#4b5563" }}>
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

        {/* 3. Score Summary */}
        <h2>3. Score Summary</h2>
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

        {/* 4. Q1-Q5 Commentary */}
        <h2>4. Commentary by Question</h2>
        {[
          { key: "q1" as const, label: "Q1 — Context &amp; Higher Intent" },
          { key: "q2" as const, label: "Q2 — Intent &amp; Measures of Success" },
          { key: "q3" as const, label: "Q3 — Implied Tasks &amp; Main Effort" },
          { key: "q4" as const, label: "Q4 — Boundaries" },
          { key: "q5" as const, label: "Q5 — Achievability &amp; Backbrief" },
        ].map(({ key, label }) => {
          const content = result.sections[key];
          if (!content?.trim()) return null;
          return (
            <div key={key} style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontFamily: "sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#374151",
                  marginBottom: 6,
                }}
                dangerouslySetInnerHTML={{ __html: label }}
              />
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderLeft: "3px solid #94a3b8",
                  borderRadius: 4,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "#374151",
                  whiteSpace: "pre-wrap",
                  fontFamily: "sans-serif",
                  maxHeight: 180,
                  overflowY: "auto",
                }}
              >
                {content.length > 600 ? content.slice(0, 600) + "…" : content}
              </div>
            </div>
          );
        })}

        {/* 5. Overall Assessment */}
        <h2>5. Overall Assessment</h2>
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
          {result.total < 3 && (
            <p>
              The intent is weak and should be rewritten before operational use. Focus first on
              sharpening the mission statement (Q2) and ensuring it clearly states the desired
              outcome and why it matters.
            </p>
          )}
          {result.total >= 3 && result.total < 4 && (
            <p>
              The intent is usable but has meaningful gaps. Priority improvements: strengthen
              the dimensions scoring below 3 before sharing externally, then address dimensions at
              3/5 to bring the document to a high standard.
            </p>
          )}
          {result.total >= 4 && (
            <p>
              The intent is strong. Light refinement on lower-scoring dimensions will bring it
              to an exceptional standard suitable for full operational deployment.
            </p>
          )}
        </div>
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
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<EvalResult | null>(null);
  const [error, setError] = useState("");

  async function handleEvaluate() {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");
    setStatus("Identifying Q1–Q5 sections…");

    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      setStatus("Scoring all 9 dimensions…");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Unknown error.");
        return;
      }

      setResult(data as EvalResult);
      setStatus("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "32px 16px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
            5MAP Intent Evaluator
          </h1>
          <p style={{ fontSize: 13, color: "#64748b" }}>
            Test AI Version · Confidential · Outputs are not stored
          </p>
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
          <label
            htmlFor="map-text"
            style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}
          >
            Paste your 5MAP content
          </label>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
            Paste the full text of your 5MAP or 5QMA. You can include Q labels (Q1:, Q2: …) or just paste
            raw text — the AI identifies sections automatically.
          </p>
          <textarea
            id="map-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Paste your 5MAP content here…\n\nWith labels:\nQ1: [Context and higher intent]\nQ2: [Intent and KPIs]\nQ3: [Implied tasks]\nQ4: [Boundaries]\nQ5: [Backbrief]\n\nOr just paste raw text."}
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
            }}
            disabled={loading}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
            <button
              onClick={handleEvaluate}
              disabled={loading || !text.trim()}
              style={{
                background: loading || !text.trim() ? "#94a3b8" : "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "11px 28px",
                fontSize: 15,
                fontWeight: 700,
                cursor: loading || !text.trim() ? "not-allowed" : "pointer",
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

        {/* Error */}
        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: 6,
              padding: "14px 18px",
              fontSize: 14,
              color: "#991b1b",
              marginBottom: 24,
            }}
          >
            <strong>Error:</strong> {error}
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
