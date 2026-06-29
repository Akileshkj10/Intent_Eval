import Anthropic from "@anthropic-ai/sdk";
import { isClaudeJsonParseError, parseClaudeJson } from "./json";
import { DIMENSIONS } from "./rubric";

const client = () =>
  new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "",
  });

type MessageCreateArgs = Parameters<ReturnType<typeof client>["messages"]["create"]>[0];

function firstTextBlock(response: unknown): string {
  const message = response as { content?: Array<{ type?: string; text?: string }> };
  return message.content?.[0]?.type === "text" ? message.content[0].text ?? "{}" : "{}";
}

async function parseJsonWithRetry<T>(
  args: MessageCreateArgs,
  schema: unknown,
  contextLabel: string
): Promise<T> {
  const claude = client();
  const first = await claude.messages.create(args);
  const firstRaw = firstTextBlock(first);

  try {
    return parseClaudeJson<T>(firstRaw);
  } catch (error) {
    if (!isClaudeJsonParseError(error)) throw error;
    console.error(`${contextLabel}: invalid Claude JSON; retrying once.`, error.message);
  }

  const retryPrompt = `Invalid JSON response. Retry once and return ONLY valid JSON matching this schema. Do not include markdown fences, commentary, trailing commas, or prose.\n\nSchema:\n${JSON.stringify(schema, null, 2)}`;
  const retryArgs: MessageCreateArgs = {
    ...args,
    messages: [
      ...args.messages,
      {
        role: "assistant",
        content: firstRaw.slice(0, 12000),
      },
      {
        role: "user",
        content: retryPrompt,
      },
    ],
  };

  const second = await claude.messages.create(retryArgs);
  return parseClaudeJson<T>(firstTextBlock(second));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Sections {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
}

/**
 * Extends Sections with metadata about which fields were inferred by the
 * content-inference fallback (Pass 2) rather than extracted by label-matching
 * (Pass 1). Only present when Pass 2 was triggered.
 */
export interface IdentifiedSections extends Sections {
  lowConfidenceFields?: string[];
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

export interface QuestionCommentary {
  strengths: string;
  gapsRisks: string;
  suggestedImprovements: string;
}

export interface AppendixRationale {
  dimensionId: string;
  rationale: string;
}

export interface ReportNarrative {
  purposeOfBriefingNote: string;
  alignmentToHigherIntent: string;
  commentaryIntro: string;
  q1Commentary: QuestionCommentary;
  q2Commentary: QuestionCommentary;
  q3Commentary: QuestionCommentary;
  q4Commentary: QuestionCommentary;
  q5Commentary: QuestionCommentary;
  overallAssessment: string;
  appendixRationale: AppendixRationale[];
}

export interface ScoringPayload {
  results: DimensionResult[];
  recommendations: Recommendation[];
  reportNarrative: ReportNarrative;
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

function narrativeSchema() {
  const questionCommentary = {
    type: "object",
    properties: {
      strengths: { type: "string" },
      gaps_risks: { type: "string" },
      suggested_improvements: { type: "string" },
    },
    required: ["strengths", "gaps_risks", "suggested_improvements"],
  };

  return {
    type: "object",
    properties: {
      purpose_of_briefing_note: { type: "string" },
      alignment_to_higher_intent: { type: "string" },
      commentary_intro: { type: "string" },
      q1_commentary: questionCommentary,
      q2_commentary: questionCommentary,
      q3_commentary: questionCommentary,
      q4_commentary: questionCommentary,
      q5_commentary: questionCommentary,
      overall_assessment: { type: "string" },
      appendix_rationale: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dimension_id: { type: "string" },
            rationale: { type: "string" },
          },
          required: ["dimension_id", "rationale"],
        },
      },
    },
    required: [
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
    ],
  };
}

type RawQuestionCommentary = {
  strengths?: string;
  gaps_risks?: string;
  suggested_improvements?: string;
};

type RawReportNarrative = {
  purpose_of_briefing_note?: string;
  alignment_to_higher_intent?: string;
  commentary_intro?: string;
  q1_commentary?: RawQuestionCommentary;
  q2_commentary?: RawQuestionCommentary;
  q3_commentary?: RawQuestionCommentary;
  q4_commentary?: RawQuestionCommentary;
  q5_commentary?: RawQuestionCommentary;
  overall_assessment?: string;
  appendix_rationale?: Array<{ dimension_id?: string; rationale?: string }>;
};

function normalizeQuestionCommentary(
  raw: RawQuestionCommentary | undefined,
  fallback: QuestionCommentary
): QuestionCommentary {
  return {
    strengths: raw?.strengths?.trim() || fallback.strengths,
    gapsRisks: raw?.gaps_risks?.trim() || fallback.gapsRisks,
    suggestedImprovements: raw?.suggested_improvements?.trim() || fallback.suggestedImprovements,
  };
}

function normalizeReportNarrative(
  raw: RawReportNarrative | undefined,
  results: DimensionResult[],
  recommendations: Recommendation[]
): ReportNarrative {
  const byId = (id: string) => results.find((r) => r.id === id);
  const fallbackAction =
    recommendations[0]?.action ??
    "Refine the lowest-scoring dimensions first, keeping the intent concise, outcome-led, and practical for teams to use.";

  const fallbackQuestion = (dimensionId: string, suggested: string): QuestionCommentary => {
    const result = byId(dimensionId);
    return {
      strengths: result
        ? `${result.name} currently scores ${result.score}/5.`
        : "Relevant strengths should be reviewed against the scored dimensions.",
      gapsRisks: result?.rationale ?? "No specific rationale was returned for this section.",
      suggestedImprovements: suggested,
    };
  };

  return {
    purposeOfBriefingNote:
      raw?.purpose_of_briefing_note?.trim() ||
      "This briefing note evaluates the submitted 5MAP against the Leading Change weighted rubric and identifies the most useful refinements before wider use.",
    alignmentToHigherIntent:
      raw?.alignment_to_higher_intent?.trim() ||
      byId("alignment_higher_direction")?.rationale ||
      "Alignment to higher intent should be reviewed against Q1 and the wider business context.",
    commentaryIntro:
      raw?.commentary_intro?.trim() ||
      "The commentary below summarises strengths, gaps, and suggested improvements by 5MAP question.",
    q1Commentary: normalizeQuestionCommentary(
      raw?.q1_commentary,
      fallbackQuestion(
        "alignment_higher_direction",
        "Make the link to the boss's intent, wider strategy, and current business situation explicit enough that teams can repeat it."
      )
    ),
    q2Commentary: normalizeQuestionCommentary(
      raw?.q2_commentary,
      fallbackQuestion(
        "clarity_outcome",
        "Keep the intent statement outcome-led, concise, and measurable, separating success measures from explanatory narrative where possible."
      )
    ),
    q3Commentary: normalizeQuestionCommentary(
      raw?.q3_commentary,
      fallbackQuestion(
        "alignment_tasks",
        "Ensure each task clearly advances the intent and identify the main effort so teams can prioritise when resources are constrained."
      )
    ),
    q4Commentary: normalizeQuestionCommentary(
      raw?.q4_commentary,
      fallbackQuestion(
        "decentralised_utility",
        "Clarify freedoms, constraints, escalation points, and trade-offs so teams know what they can decide without further permission."
      )
    ),
    q5Commentary: normalizeQuestionCommentary(
      raw?.q5_commentary,
      fallbackQuestion(
        "testability",
        "Add specific review cadence, assumptions, questions for the boss, and measurable indicators that show whether the intent is working."
      )
    ),
    overallAssessment:
      raw?.overall_assessment?.trim() ||
      `The strongest next step is to ${fallbackAction.charAt(0).toLowerCase()}${fallbackAction.slice(1)}`,
    appendixRationale: DIMENSIONS.map((dimension) => {
      const result = byId(dimension.id);
      const supplied = raw?.appendix_rationale?.find((item) => item.dimension_id === dimension.id);
      return {
        dimensionId: dimension.id,
        rationale: supplied?.rationale?.trim() || result?.rationale || "No rationale returned.",
      };
    }),
  };
}

// ── Step 1: identify Q1-Q5 sections ──────────────────────────────────────────

/** Q field keys in order. */
const Q_KEYS = ["q1", "q2", "q3", "q4", "q5"] as const;

/**
 * A Q field is considered "thin" if it has fewer than this many characters
 * after trimming. Thin fields trigger the Pass 2 fallback and the
 * sectionWarning API response field.
 */
const Q_THIN_THRESHOLD = 50;

/**
 * Returns the keys of Q fields that are empty or shorter than Q_THIN_THRESHOLD.
 * Exported so the API route can compute sectionWarning without duplicating logic.
 */
export function thinQFields(sections: Sections): string[] {
  return Q_KEYS.filter((k) => (sections[k]?.trim().length ?? 0) < Q_THIN_THRESHOLD);
}

/** Shared JSON schema for the Q1-Q5 extraction response. */
const SECTIONS_SCHEMA = {
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

/**
 * Pass 1 — label-based extraction (claude-sonnet-4-6).
 * Handles the vast majority of documents where Q section labels are present.
 * Expanded label variants support non-standard headings and multi-slide sections.
 */
async function runSectionPass1(
  text: string,
  inputHint: "pptx" | "text"
): Promise<Sections> {
  const systemPrompt = `You are an expert in the 5MAP/5QMA strategic intent framework (Leading Change / Stephen Bungay).
Given 5MAP content, extract and return the text for each of the five questions:
- q1: Context and Higher Intent — the business situation, what the boss and boss's boss want.
- q2: Intent and Measures of Success — the mission statement, what we intend to achieve and why, KPIs.
- q3: Implied Tasks / Main Effort — what we need to do to achieve the intent.
- q4: Boundaries — freedoms to operate and constraints.
- q5: Backbrief / Achievability — performance review plan, questions for boss, questions for other teams.
If a section is absent, return an empty string. Return only valid JSON matching the schema.`;

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

  // 40 000-char limit gives headroom for multi-slide Q sections and long legacy
  // PPTX templates without truncating Q2–Q5 before Claude can read them.
  const userPrompt = `${pptxContext}Extract Q1-Q5 sections from this 5MAP content:\n\n${text.slice(0, 40000)}\n\nJSON Schema:\n${JSON.stringify(SECTIONS_SCHEMA)}`;

  return parseJsonWithRetry<Sections>({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  }, SECTIONS_SCHEMA, "identifySections-pass1");
}

/**
 * Pass 2 — content-inference fallback (claude-opus-4-7).
 * Only triggered when Pass 1 leaves ≥2 Q fields thin or empty.
 * Infers section assignment from content meaning and position without
 * relying on labels.
 */
async function runSectionPass2(text: string): Promise<Sections> {
  const systemPrompt = `You are an expert in the 5MAP/5QMA strategic intent framework (Leading Change / Stephen Bungay).
The document uses non-standard or absent Q section labels.
Infer which content belongs to each of the five questions based on:
1. The typical 5MAP/5QMA structure and content patterns.
2. The order in which content appears in the document.
3. The meaning and topics present in each part of the text.

The five questions are:
- Q1 (Context): The business situation — what the boss and boss's boss want, external and internal factors, performance context.
- Q2 (Intent): The mission statement — what we intend to achieve and why, KPIs, measures of success.
- Q3 (Tasks): What needs to happen to achieve the intent — implied tasks, main effort, priorities, actions.
- Q4 (Boundaries): What the team can and cannot do — freedoms, constraints, escalation points, trade-offs.
- Q5 (Backbrief): Performance review plan, questions for boss, achievability check, assumptions.

Assign content to the most likely Q, even if uncertain. Do not leave fields empty if any relevant content exists.
Return only valid JSON matching the schema.`;

  const userPrompt = `Infer Q1-Q5 sections from this 5MAP content (section labels may be absent or non-standard):\n\n${text.slice(0, 40000)}\n\nJSON Schema:\n${JSON.stringify(SECTIONS_SCHEMA)}`;

  return parseJsonWithRetry<Sections>({
    model: "claude-opus-4-7",
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  }, SECTIONS_SCHEMA, "identifySections-pass2");
}

/**
 * Identify Q1-Q5 sections from text using a two-pass strategy.
 *
 * Pass 1 (Sonnet): Label-based extraction — the normal path for well-labelled
 * documents. Handles multi-slide Q sections and non-standard headings.
 *
 * Pass 2 (Opus): Content-inference fallback. Only fires when Pass 1 leaves
 * two or more Q fields empty or shorter than Q_THIN_THRESHOLD characters.
 * Fields filled by Pass 2 are listed in the returned `lowConfidenceFields`.
 *
 * Well-labelled documents (the common case) follow the Pass 1 path only —
 * no change to existing behaviour or output quality.
 *
 * @param text       Extracted text (from textarea, PPTX dump, etc.)
 * @param inputHint  "pptx" adds slide-aware extraction instructions to Pass 1.
 *                   "text" (default) uses the standard prompt.
 */
export async function identifySections(
  text: string,
  inputHint: "pptx" | "text" = "text"
): Promise<IdentifiedSections> {
  const pass1 = await runSectionPass1(text, inputHint);
  const thin = thinQFields(pass1);

  // Fast path: Pass 1 succeeded for all (or all but one) sections.
  if (thin.length < 2) {
    return pass1;
  }

  console.log(
    `[identifySections] Pass 1 left ${thin.length} thin fields (${thin.join(", ")}). Triggering Pass 2 content-inference.`
  );

  let pass2: Sections;
  try {
    pass2 = await runSectionPass2(text);
  } catch (err) {
    // Pass 2 failure is non-fatal: return Pass 1 result with thin fields flagged.
    console.error("[identifySections] Pass 2 failed, returning Pass 1 result.", err);
    return { ...pass1, lowConfidenceFields: thin };
  }

  // Merge: keep Pass 1 values for well-identified fields; use Pass 2 for thin ones.
  // If Pass 2 also returns thin/empty for a field, retain whatever Pass 1 had.
  const merged: IdentifiedSections = {
    q1: thin.includes("q1") ? (pass2.q1?.trim() || pass1.q1) : pass1.q1,
    q2: thin.includes("q2") ? (pass2.q2?.trim() || pass1.q2) : pass1.q2,
    q3: thin.includes("q3") ? (pass2.q3?.trim() || pass1.q3) : pass1.q3,
    q4: thin.includes("q4") ? (pass2.q4?.trim() || pass1.q4) : pass1.q4,
    q5: thin.includes("q5") ? (pass2.q5?.trim() || pass1.q5) : pass1.q5,
    // A field is low-confidence when Pass 2 filled it but the fill was still thin,
    // meaning the model was genuinely uncertain about that section's content.
    lowConfidenceFields: thin.filter(
      (k) => (pass2[k as keyof Sections]?.trim().length ?? 0) < Q_THIN_THRESHOLD
    ),
  };

  if (merged.lowConfidenceFields?.length === 0) {
    delete merged.lowConfidenceFields;
  }

  return merged;
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

REPORT NARRATIVE RULES:
- Also write concise narrative fields for the canonical report sections.
- Do NOT calculate or mention weighted totals; application code calculates totals.
- Do NOT modify any dimension score in the narrative.
- Each Q commentary should include strengths, gaps/risks, and suggested improvements.
- Keep the wording consultant-style, specific to the supplied 5MAP, and concise.

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
      report_narrative: narrativeSchema(),
    },
    required: ["scores", "recommendations", "report_narrative"],
  };

  const userPrompt = `Here is the 5MAP content to evaluate:\n\n${contextJson}\n\n---\nRUBRIC:\n\n${rubricText}\n\n---\nReturn JSON matching this schema (note the top-level keys: "scores", "recommendations", and "report_narrative"):\n${JSON.stringify(responseSchema, null, 2)}`;

  const parsed = await parseJsonWithRetry<{
    scores: Record<string, { score: number; rationale: string; key_evidence: string }>;
    recommendations?: Array<{
      target_dimension_id: string;
      action: string;
      expected_impact: string;
    }>;
    report_narrative?: RawReportNarrative;
  }>({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  }, responseSchema, "scoreAllDimensions");

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

  const reportNarrative = normalizeReportNarrative(parsed.report_narrative, results, recommendations);

  return { results, recommendations, reportNarrative };
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

REPORT NARRATIVE RULES:
- Also write concise narrative fields for the canonical report sections.
- Do NOT calculate or mention weighted totals; application code calculates totals.
- Do NOT modify any dimension score in the narrative.
- Each Q commentary should include strengths, gaps/risks, and suggested improvements.
- Keep the wording consultant-style, specific to the supplied 5MAP, and concise.

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
      report_narrative: narrativeSchema(),
    },
    required: ["sections", "scores", "recommendations", "report_narrative"],
  };

  const userPrompt = `Please evaluate this 5MAP document.\n\nRUBRIC:\n${rubricText}\n\nReturn JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}`;

  const parsed = await parseJsonWithRetry<{
    sections: Sections;
    scores: Record<string, { score: number; rationale: string; key_evidence: string }>;
    recommendations?: Array<{
      target_dimension_id: string;
      action: string;
      expected_impact: string;
    }>;
    report_narrative?: RawReportNarrative;
  }>({
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
  }, responseSchema, "scoreFromPdf");

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

  const reportNarrative = normalizeReportNarrative(parsed.report_narrative, results, recommendations);

  return { sections, results, recommendations, reportNarrative };
}
