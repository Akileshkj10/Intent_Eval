import Anthropic from "@anthropic-ai/sdk";
import { DIMENSIONS } from "./rubric";

const client = () =>
  new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "",
  });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Sections {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
}

export interface DimensionResult {
  id: string;
  name: string;
  section: string;
  weight: number;
  score: number;
  weightedScore: number;
  rationale: string;
  keyEvidence: string;
}

export interface Recommendation {
  targetDimensionId: string;
  targetDimensionName: string;
  currentScore: number;
  action: string;
  expectedImpact: string;
}

export interface ScoringPayload {
  results: DimensionResult[];
  recommendations: Recommendation[];
}

// ── Text cleanup helpers ─────────────────────────────────────────────────────

/**
 * Strip any quoted phrases that leak into a rationale despite prompt rules.
 * Removes content inside '...', "...", "...", '...' and tidies the leftover
 * punctuation so the sentence still reads naturally.
 */
function cleanRationale(text: string): string {
  if (!text) return "";
  let out = text.trim();

  // Remove quoted phrases of all common quote types. Repeat until none remain.
  const quotePatterns = [
    /[\u2018\u2019][^\u2018\u2019]{1,80}[\u2018\u2019]/g, // curly single
    /[\u201C\u201D][^\u201C\u201D]{1,120}[\u201C\u201D]/g, // curly double
    /'[^']{1,80}'/g,                                       // straight single
    /"[^"]{1,120}"/g,                                      // straight double
  ];
  let prev = "";
  while (prev !== out) {
    prev = out;
    for (const re of quotePatterns) out = out.replace(re, "");
  }

  // Drop "e.g." / "such as" / "for example" tails that lose meaning without their quotes.
  out = out.replace(/[,;:\-—]?\s*(e\.g\.|such as|for example)\s*[,:]?\s*[\.\?!]?/gi, "");

  // Collapse leftover artefacts: empty parens, doubled spaces, stranded commas.
  out = out
    .replace(/\(\s*\)/g, "")
    .replace(/\(\s*,\s*\)/g, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .trim();

  // Ensure terminal punctuation.
  if (out && !/[.?!]$/.test(out)) out += ".";

  return out;
}

/** Trim surrounding quote marks and whitespace from evidence. */
function cleanEvidence(text: string): string {
  if (!text) return "";
  let out = text.trim();
  // Strip a single layer of surrounding quotes (straight or curly).
  out = out.replace(/^[\u2018\u2019\u201C\u201D'"]+|[\u2018\u2019\u201C\u201D'"]+$/g, "");
  return out.trim();
}

// ── Step 1: identify Q1-Q5 sections ──────────────────────────────────────────

/**
 * Identify Q1-Q5 sections from text.
 * @param text       Extracted text (from textarea, PPTX dump, etc.)
 * @param inputHint  Optional hint about the text source for a richer prompt.
 *                   "pptx" adds slide-aware extraction instructions.
 *                   "text" (default) uses the standard prompt.
 */
export async function identifySections(
  text: string,
  inputHint: "pptx" | "text" = "text"
): Promise<Sections> {
  const schema = {
    type: "object" as const,
    properties: {
      q1: { type: "string" },
      q2: { type: "string" },
      q3: { type: "string" },
      q4: { type: "string" },
      q5: { type: "string" },
    },
    required: ["q1", "q2", "q3", "q4", "q5"],
  };

  const systemPrompt = `You are an expert in the 5MAP/5QMA strategic intent framework (Leading Change / Stephen Bungay).
Given 5MAP content, extract and return the text for each of the five questions:
- q1: Context and Higher Intent — the business situation, what the boss and boss's boss want.
- q2: Intent and Measures of Success — the mission statement, what we intend to achieve and why, KPIs.
- q3: Implied Tasks / Main Effort — what we need to do to achieve the intent.
- q4: Boundaries — freedoms to operate and constraints.
- q5: Backbrief / Achievability — performance review plan, questions for boss, questions for other teams.
If a section is absent, return an empty string. Return only valid JSON matching the schema.`;

  // PPTX-specific instructions added to the user prompt when input is from a presentation.
  const pptxContext =
    inputHint === "pptx"
      ? `IMPORTANT — this content was extracted from a PowerPoint presentation:
- Slide numbers and titles are preserved in [Slide N — "Title"] markers.
- A single Q section may span multiple slides — aggregate all related slides into one Q field.
- Ignore slides that are purely cover/branding/agenda/contact slides (no Q content).
- Section titles in this presentation may use any of these label variants:
  Q1 / Question 1 / Context / Higher Intent / Higher Direction / Business Situation
  Q2 / Question 2 / Intent / Mission / Measures of Success / KPIs / Purpose
  Q3 / Question 3 / Implied Tasks / Main Effort / Priorities / Tasks / Actions
  Q4 / Question 4 / Boundaries / Freedoms / Constraints / What Not To Do
  Q5 / Question 5 / Backbrief / Achievability / Review / Questions for Boss
- Speaker notes (labelled "Notes:") may contain the richest content — include them.
- Where a slide has no Q label, infer the section from its content and position.\n\n`
      : "";

  const userPrompt = `${pptxContext}Extract Q1-Q5 sections from this 5MAP content:\n\n${text.slice(0, 10000)}\n\nJSON Schema:\n${JSON.stringify(schema)}`;

  const response = await client().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(cleaned) as Sections;
}

// ── Step 2: score all 9 dimensions in ONE call ────────────────────────────────

export async function scoreAllDimensions(sections: Sections): Promise<ScoringPayload> {
  const rubricText = DIMENSIONS.map((d) => {
    const levels = Object.entries(d.levels)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    return `### ${d.id} — ${d.name} (weight ${d.weight})\n${levels}`;
  }).join("\n\n");

  const dimensionIds = DIMENSIONS.map((d) => d.id).join(", ");

  const systemPrompt = `You are an expert evaluator of strategic intent documents using the Leading Change 5MAP/5QMA rubric.

You will be given the five sections (Q1-Q5) of a 5MAP and the full rubric.

SCORING RULES:
- Score EVERY dimension on a scale of 1-5 (integers only) using the rubric level descriptors.
- Be honest and rigorous. Use the full 1-5 range — do not cluster scores around 3.

RATIONALE RULES (strict — violations make the output unusable):
- "rationale" must be ONE clean sentence (two short ones at the absolute maximum).
- "rationale" MUST NOT contain ANY quoted phrases — no 'single quotes', no "double quotes", no curly quotes around words from the 5MAP.
- "rationale" MUST NOT contain "e.g.", "such as", "for example" followed by document words.
- Write the rationale in the evaluator's own voice — analysis and verdict only, no echoing the document's vocabulary in quotation marks.
- All verbatim wording from the 5MAP goes in "key_evidence", NEVER in "rationale".

EVIDENCE RULES:
- "key_evidence" must be a short verbatim quote (or near-verbatim) directly from the 5MAP. 1 sentence or 1 short phrase. No surrounding quotation marks — just the raw text.
- The evidence must clearly justify the score given.

EXAMPLES (follow this style):

GOOD rationale: "Intent is clear but multi-clause and not easily repeatable in a single sentence."
BAD rationale:  "Intent mixes outcomes ('sustainable growth') with activities ('bringing the love back'), making it hard to recall."

GOOD rationale: "KPIs are sensible but lack specific targets and time-bound thresholds."
BAD rationale:  "The KPIs mention 'participation above 85%' but no time horizon is given, e.g. 'retention 98%'."

GOOD key_evidence: Increase Participation above 85%; Retention of clients 98%; Customer satisfaction / NPS
BAD key_evidence:  "The KPIs are clear" (this is analysis, not evidence)

RECOMMENDATIONS RULES:
- After scoring, produce 0-3 targeted improvement recommendations (NOT always 3 — only include ones that genuinely add value).
- Prioritise dimensions with the highest weighted gap: (5 − score) × weight.
- Skip dimensions already scoring 4 or 5 unless there is a clearly concrete win.
- Each recommendation must be SPECIFIC to this 5MAP. No generic platitudes.
- "action" must be 1-2 sentences max, written as a directive (e.g. "Rewrite Q2 to..." or "Replace the phrase X with Y...").
- "expected_impact" must be 1 short line stating what improves.
- If a 5MAP already scores ≥4.5 overall, returning 0 or 1 recommendations is fine.

Return ONLY valid JSON — no markdown fences, no prose.`;

  const contextJson = JSON.stringify(
    {
      q1_context: sections.q1,
      q2_intent: sections.q2,
      q3_tasks: sections.q3,
      q4_boundaries: sections.q4,
      q5_backbrief: sections.q5,
    },
    null,
    2
  );

  const responseSchema = {
    type: "object",
    properties: {
      scores: {
        type: "object",
        properties: Object.fromEntries(
          DIMENSIONS.map((d) => [
            d.id,
            {
              type: "object",
              properties: {
                score: { type: "integer", minimum: 1, maximum: 5 },
                rationale: { type: "string" },
                key_evidence: { type: "string" },
              },
              required: ["score", "rationale", "key_evidence"],
            },
          ])
        ),
        required: DIMENSIONS.map((d) => d.id),
      },
      recommendations: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            target_dimension_id: {
              type: "string",
              description: `Must be one of: ${dimensionIds}`,
            },
            action: { type: "string", description: "1-2 sentences, directive, 5MAP-specific" },
            expected_impact: { type: "string", description: "1 short line" },
          },
          required: ["target_dimension_id", "action", "expected_impact"],
        },
      },
    },
    required: ["scores", "recommendations"],
  };

  const userPrompt = `Here is the 5MAP content to evaluate:\n\n${contextJson}\n\n---\nRUBRIC:\n\n${rubricText}\n\n---\nReturn JSON matching this schema (note the two top-level keys: "scores" and "recommendations"):\n${JSON.stringify(responseSchema, null, 2)}`;

  const response = await client().messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    scores: Record<string, { score: number; rationale: string; key_evidence: string }>;
    recommendations?: Array<{
      target_dimension_id: string;
      action: string;
      expected_impact: string;
    }>;
  };

  const results: DimensionResult[] = DIMENSIONS.map((d) => {
    const r = parsed.scores?.[d.id] ?? { score: 1, rationale: "Not scored.", key_evidence: "" };
    const score = Math.min(5, Math.max(1, Math.round(r.score)));
    return {
      id: d.id,
      name: d.name,
      section: d.section,
      weight: d.weight,
      score,
      weightedScore: Math.round(score * d.weight * 100) / 100,
      rationale: cleanRationale(r.rationale ?? ""),
      keyEvidence: cleanEvidence(r.key_evidence ?? ""),
    };
  });

  // Validate recommendations: cap at 3, require valid dimension IDs, dedupe by dimension.
  const seen = new Set<string>();
  const recommendations: Recommendation[] = (parsed.recommendations ?? [])
    .filter((r) => {
      const dim = DIMENSIONS.find((d) => d.id === r.target_dimension_id);
      if (!dim) return false;
      if (seen.has(dim.id)) return false;
      seen.add(dim.id);
      return Boolean(r.action?.trim());
    })
    .slice(0, 3)
    .map((r) => {
      const dim = DIMENSIONS.find((d) => d.id === r.target_dimension_id)!;
      const result = results.find((x) => x.id === dim.id)!;
      return {
        targetDimensionId: dim.id,
        targetDimensionName: dim.name,
        currentScore: result.score,
        action: r.action.trim(),
        expectedImpact: (r.expected_impact ?? "").trim(),
      };
    });

  return { results, recommendations };
}

// ── Option B: score directly from a PDF document ──────────────────────────────

export interface PdfScoringPayload extends ScoringPayload {
  sections: Sections;
}

/**
 * Evaluate a 5MAP PDF in a single Claude Opus call.
 * Claude reads the PDF natively — no text extraction step needed.
 * Returns the same shape as the two-step text flow plus the identified sections.
 */
export async function scoreFromPdf(pdfBase64: string): Promise<PdfScoringPayload> {
  const rubricText = DIMENSIONS.map((d) => {
    const levels = Object.entries(d.levels)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    return `### ${d.id} — ${d.name} (weight ${d.weight})\n${levels}`;
  }).join("\n\n");

  const dimensionIds = DIMENSIONS.map((d) => d.id).join(", ");

  const systemPrompt = `You are an expert evaluator of strategic intent documents using the Leading Change 5MAP/5QMA rubric.
You will be given a PDF presentation containing a 5MAP or 5QMA document.

STEP 1 — EXTRACT SECTIONS:
Identify the five Q sections. They may be labelled as:
  Q1 / Question 1 / Context / Higher Intent — the business situation, what the boss and boss's boss want.
  Q2 / Question 2 / Intent / Mission / Measures of Success — the mission statement, KPIs, what we achieve and why.
  Q3 / Question 3 / Implied Tasks / Main Effort / Priorities — what needs to happen to achieve the intent.
  Q4 / Question 4 / Boundaries / Freedoms / Constraints — what the team can and cannot do.
  Q5 / Question 5 / Backbrief / Achievability / Review — performance review plan, questions for boss.
If a section is absent, use an empty string.

STEP 2 — SCORE ALL 9 DIMENSIONS using the rubric below (1–5 integers, full range).

RATIONALE RULES (strict):
- "rationale": ONE clean sentence. NO quoted phrases from the document inside it. Pure evaluator analysis.
- "key_evidence": short verbatim quote from the document that justifies the score. No surrounding quote marks.

RECOMMENDATIONS RULES:
- 0–3 recommendations. Only include ones that genuinely add value. Do not force 3.
- Prioritise by weighted gap: (5 − score) × weight.
- Each "action": 1–2 sentences, specific to this document, written as a directive.
- Each "expected_impact": 1 short line.

Return ONLY valid JSON — no markdown fences, no prose.`;

  const responseSchema = {
    type: "object",
    properties: {
      sections: {
        type: "object",
        properties: {
          q1: { type: "string" },
          q2: { type: "string" },
          q3: { type: "string" },
          q4: { type: "string" },
          q5: { type: "string" },
        },
        required: ["q1", "q2", "q3", "q4", "q5"],
      },
      scores: {
        type: "object",
        properties: Object.fromEntries(
          DIMENSIONS.map((d) => [
            d.id,
            {
              type: "object",
              properties: {
                score: { type: "integer", minimum: 1, maximum: 5 },
                rationale: { type: "string" },
                key_evidence: { type: "string" },
              },
              required: ["score", "rationale", "key_evidence"],
            },
          ])
        ),
        required: DIMENSIONS.map((d) => d.id),
      },
      recommendations: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            target_dimension_id: { type: "string", description: `One of: ${dimensionIds}` },
            action: { type: "string" },
            expected_impact: { type: "string" },
          },
          required: ["target_dimension_id", "action", "expected_impact"],
        },
      },
    },
    required: ["sections", "scores", "recommendations"],
  };

  const userPrompt = `Please evaluate this 5MAP document.\n\nRUBRIC:\n${rubricText}\n\nReturn JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}`;

  const response = await client().messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        // The Anthropic SDK types don't expose a document block yet;
        // cast via unknown to satisfy the type checker.
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: userPrompt },
        ] as unknown as Anthropic.MessageParam["content"],
      },
    ],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    sections: Sections;
    scores: Record<string, { score: number; rationale: string; key_evidence: string }>;
    recommendations?: Array<{
      target_dimension_id: string;
      action: string;
      expected_impact: string;
    }>;
  };

  // Extract sections
  const sections: Sections = {
    q1: parsed.sections?.q1 ?? "",
    q2: parsed.sections?.q2 ?? "",
    q3: parsed.sections?.q3 ?? "",
    q4: parsed.sections?.q4 ?? "",
    q5: parsed.sections?.q5 ?? "",
  };

  // Build dimension results (same logic as scoreAllDimensions)
  const results: DimensionResult[] = DIMENSIONS.map((d) => {
    const r = parsed.scores?.[d.id] ?? { score: 1, rationale: "Not scored.", key_evidence: "" };
    const score = Math.min(5, Math.max(1, Math.round(r.score)));
    return {
      id: d.id,
      name: d.name,
      section: d.section,
      weight: d.weight,
      score,
      weightedScore: Math.round(score * d.weight * 100) / 100,
      rationale: cleanRationale(r.rationale ?? ""),
      keyEvidence: cleanEvidence(r.key_evidence ?? ""),
    };
  });

  // Validate recommendations (same logic as scoreAllDimensions)
  const seen = new Set<string>();
  const recommendations: Recommendation[] = (parsed.recommendations ?? [])
    .filter((r) => {
      const dim = DIMENSIONS.find((d) => d.id === r.target_dimension_id);
      if (!dim) return false;
      if (seen.has(dim.id)) return false;
      seen.add(dim.id);
      return Boolean(r.action?.trim());
    })
    .slice(0, 3)
    .map((r) => {
      const dim = DIMENSIONS.find((d) => d.id === r.target_dimension_id)!;
      const result = results.find((x) => x.id === dim.id)!;
      return {
        targetDimensionId: dim.id,
        targetDimensionName: dim.name,
        currentScore: result.score,
        action: r.action.trim(),
        expectedImpact: (r.expected_impact ?? "").trim(),
      };
    });

  return { sections, results, recommendations };
}
