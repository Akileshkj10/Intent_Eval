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

export async function scoreAllDimensions(sections: Sections): Promise<DimensionResult[]> {
  const rubricText = DIMENSIONS.map((d) => {
    const levels = Object.entries(d.levels)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    return `### ${d.id} — ${d.name} (weight ${d.weight})\n${levels}`;
  }).join("\n\n");

  const systemPrompt = `You are an expert evaluator of strategic intent documents using the Leading Change 5MAP/5QMA rubric.
You will be given the five sections (Q1-Q5) of a 5MAP and the full rubric.
Score EVERY dimension on a scale of 1-5 (integers only) using the rubric level descriptors.
Be honest and rigorous. Use the full 1-5 range — do not cluster scores around 3.
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
  };

  const userPrompt = `Here is the 5MAP content to evaluate:\n\n${contextJson}\n\n---\nRUBRIC:\n\n${rubricText}\n\n---\nReturn JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}`;

  const response = await client().messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Record<
    string,
    { score: number; rationale: string; key_evidence: string }
  >;

  return DIMENSIONS.map((d) => {
    const r = parsed[d.id] ?? { score: 1, rationale: "Not scored.", key_evidence: "" };
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
}
