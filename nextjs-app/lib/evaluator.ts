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

// ── Step 1: identify Q1-Q5 sections ──────────────────────────────────────────

export async function identifySections(text: string): Promise<Sections> {
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
Given raw 5MAP text, extract and return the content for each of the five questions:
- q1: Context and Higher Intent — the business situation, what the boss and boss's boss want.
- q2: Intent and Measures of Success — the mission statement, what we intend to achieve and why, KPIs.
- q3: Implied Tasks — what we need to do to achieve the intent.
- q4: Boundaries — freedoms to operate and constraints.
- q5: Backbrief/Achievability — performance review plan, questions for boss, questions for other teams.
If a section is absent, return an empty string. Return only valid JSON matching the schema.`;

  const userPrompt = `Extract Q1-Q5 sections from this 5MAP text:\n\n${text.slice(0, 8000)}\n\nJSON Schema:\n${JSON.stringify(schema)}`;

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
- Each score must be grounded in a short verbatim quote from the 5MAP (key_evidence).

RECOMMENDATIONS RULES:
- After scoring, produce 0-3 targeted improvement recommendations (NOT always 3 — only include ones that genuinely add value).
- Prioritise dimensions with the highest weighted gap: (5 − score) × weight.
- Skip dimensions already scoring 4 or 5 unless there is a clearly concrete win.
- Each recommendation must be SPECIFIC to this 5MAP — quote or reference its actual content. No generic platitudes like "improve clarity".
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
      rationale: r.rationale ?? "",
      keyEvidence: r.key_evidence ?? "",
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
