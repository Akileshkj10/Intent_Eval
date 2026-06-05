import { NextRequest, NextResponse } from "next/server";
import { identifySections, scoreAllDimensions, scoreFromPdf } from "@/lib/evaluator";
import { isClaudeJsonParseError, userFacingJsonErrorMessage } from "@/lib/json";
import { requireSiteAuthRequest } from "@/lib/requireSiteAuth";
import {
  totalWeightedScore,
  interpretationBand,
  sectionSubtotals,
  SECTION_LABELS,
} from "@/lib/rubric";

export const maxDuration = 120; // Vercel Pro: up to 300s; Hobby: 60s

export async function POST(req: NextRequest) {
  const authError = await requireSiteAuthRequest(req);
  if (authError) return authError;

  const apiKey = process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json({ error: "CLAUDE_API_KEY is not configured." }, { status: 500 });
  }

  let body: { text?: string; pdf?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // ── PDF branch (Option B) ──────────────────────────────────────────────────
  if (body.pdf) {
    const pdfBase64 = body.pdf.trim();
    if (!pdfBase64 || pdfBase64.length < 100) {
      return NextResponse.json({ error: "Invalid PDF data." }, { status: 400 });
    }

    try {
      const { sections, results, recommendations, reportNarrative } = await scoreFromPdf(pdfBase64);

      const scoresMap = Object.fromEntries(results.map((r) => [r.id, r.score]));
      const total = totalWeightedScore(scoresMap);
      const band = interpretationBand(total);
      const subtotals = sectionSubtotals(scoresMap);
      const sorted = [...results].sort((a, b) => b.score - a.score);

      return NextResponse.json({
        total: Math.round(total * 100) / 100,
        band,
        dimensions: results,
        subtotals: Object.entries(subtotals).map(([key, value]) => ({
          label: SECTION_LABELS[key] ?? key,
          value: Math.round(value * 100) / 100,
        })),
        strengths: sorted.slice(0, 3).map((r) => r.name),
        improvements: sorted.slice(-3).reverse().map((r) => r.name),
        recommendations,
        reportNarrative,
        // PDF mode also returns identified sections for debugging / display
        _sections: sections,
      });
    } catch (err) {
      const message = isClaudeJsonParseError(err)
        ? userFacingJsonErrorMessage()
        : err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `PDF evaluation failed: ${message}` }, { status: 500 });
    }
  }

  // ── Text branch (Option A / text paste) — UNCHANGED ───────────────────────
  const text = (body.text ?? "").trim();
  if (!text || text.length < 50) {
    return NextResponse.json(
      { error: "Please provide at least 50 characters of 5MAP content." },
      { status: 400 }
    );
  }

  try {
    // Step 1 — identify sections
    const sections = await identifySections(text);

    // Step 2 — score all 9 dimensions + recommendations in one Claude call
    const { results, recommendations, reportNarrative } = await scoreAllDimensions(sections);

    // Step 3 — calculate totals
    const scoresMap = Object.fromEntries(results.map((r) => [r.id, r.score]));
    const total = totalWeightedScore(scoresMap);
    const band = interpretationBand(total);
    const subtotals = sectionSubtotals(scoresMap);

    // Step 4 — identify top strengths and priority improvements
    const sorted = [...results].sort((a, b) => b.score - a.score);
    const strengths = sorted.slice(0, 3).map((r) => r.name);
    const improvements = sorted.slice(-3).reverse().map((r) => r.name);

    return NextResponse.json({
      total: Math.round(total * 100) / 100,
      band,
      dimensions: results,
      subtotals: Object.entries(subtotals).map(([key, value]) => ({
        label: SECTION_LABELS[key] ?? key,
        value: Math.round(value * 100) / 100,
      })),
      strengths,
      improvements,
      recommendations,
      reportNarrative,
      _sections: sections,
    });
  } catch (err) {
    const message = isClaudeJsonParseError(err)
      ? userFacingJsonErrorMessage()
      : err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Evaluation failed: ${message}` }, { status: 500 });
  }
}
