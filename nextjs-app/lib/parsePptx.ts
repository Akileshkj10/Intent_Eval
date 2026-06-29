/**
 * parsePptx.ts — Client-side PPTX text extractor (Option A)
 *
 * Unzips a .pptx ArrayBuffer with JSZip, parses each slide's XML with
 * fast-xml-parser, and returns a structured text dump suitable for passing
 * to Claude's section-identification step.
 *
 * Works entirely in the browser — no server round-trip required.
 */

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { ParseError } from "./types";

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Maximum characters taken from each slide's speaker notes when building the
 * text string for section identification.
 *
 * Client 5MAP answers live in slide bodies, not notes. Speaker notes in legacy
 * Leading Change templates can run to 1 000+ words of instructional coaching
 * text — capping here prevents those notes from consuming the character budget
 * before Q2–Q5 slides are reached, without any phrase-matching or false-positive
 * risk. A genuine client note sentence is typically ≤ 150 chars, so 250 chars
 * always captures any real content while cutting template bloat by ~95 %.
 *
 * Change this single constant if a different cap is needed; no other code changes
 * are required.
 */
const NOTES_ID_CAP = 250;

/** Boilerplate placeholder strings inserted by PowerPoint — skip these. */
const TEMPLATE_TEXTS = new Set([
  "click to add title",
  "click to add text",
  "click to add notes",
  "click to add subtitle",
  "click to add footer",
  "click to edit master title style",
  "click to edit master text styles",
  "click to edit master subtitle style",
  "date and time",
  "footer",
  "page number",
  "‹#›",
]);

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Always return arrays for these container elements so we never need to normalise.
  // Note: "a:t" is intentionally excluded — it is a leaf text node, not a container.
  isArray: (name: string) =>
    [
      "p:sp",
      "p:grpSp",
      "p:graphicFrame",
      "a:p",
      "a:r",
      "a:tc",
      "a:tr",
      "Relationship",
    ].includes(name),
};

// ── Public API ─────────────────────────────────────────────────────────────────

export interface PptxExtraction {
  /** Structured text dump, one block per slide, ready for Claude. */
  text: string;
  /** Total number of visible slides processed. */
  slideCount: number;
}

/**
 * Extract all text from a .pptx file.
 * Accepts ArrayBuffer (browser) or Uint8Array/Buffer (Node.js / tests).
 * Throws a ParseError-shaped object on unrecoverable failures.
 */
export async function parsePptx(
  buffer: ArrayBuffer | Uint8Array
): Promise<PptxExtraction> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw makeParseError(
      "corrupted",
      "Could not read this file. Try re-saving it from PowerPoint (.pptx format)."
    );
  }

  // Detect old binary .ppt — JSZip will open it but won't find the expected XML.
  const hasPresXml = zip.file("ppt/presentation.xml") !== null;
  if (!hasPresXml) {
    throw makeParseError(
      "wrong_format",
      "This file doesn't appear to be a .pptx file. Please save it as .pptx from PowerPoint and re-upload."
    );
  }

  // ── 1. Slide order from presentation.xml + its rels ───────────────────────
  const slideFiles = await resolveSlideOrder(zip);
  if (slideFiles.length === 0) {
    throw makeParseError("corrupted", "No slides found in this file.");
  }

  // ── 2. Extract each slide ─────────────────────────────────────────────────
  const parser = new XMLParser(PARSER_OPTIONS);
  const blocks: string[] = [];
  let visibleCount = 0;

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const slideFile = zip.file(slidePath);
    if (!slideFile) continue;

    const xmlStr = await slideFile.async("string");
    const parsed = parser.parse(xmlStr);
    const sld = parsed?.["p:sld"] ?? {};

    // Skip hidden slides.
    if (sld["@_show"] === "0" || sld["@_show"] === 0) continue;

    visibleCount++;
    const slideNumber = visibleCount;

    // Title
    const spTree = sld?.["p:cSld"]?.["p:spTree"] ?? {};
    const title = extractTitle(spTree);

    // Body text
    const body = extractBody(spTree, title);

    // Speaker notes
    const notesPath = await resolveNotesPath(zip, slidePath);
    const notes = notesPath ? await extractNotes(zip, notesPath, parser) : "";

    // Build block.
    // Speaker notes are capped at NOTES_ID_CAP chars: client answers are in the
    // slide body; template coaching notes in the notes field can be thousands of
    // characters and would crowd out later slides in the identification pass.
    const headerLine = title
      ? `[Slide ${slideNumber} — "${title}"]`
      : `[Slide ${slideNumber}]`;
    const lines: string[] = [headerLine];
    if (body.trim()) lines.push(`Body:\n${body.trim()}`);
    const notesTrimmed = notes.trim();
    if (notesTrimmed) {
      const notesForId = notesTrimmed.length > NOTES_ID_CAP
        ? notesTrimmed.slice(0, NOTES_ID_CAP) + "…"
        : notesTrimmed;
      lines.push(`Notes:\n${notesForId}`);
    }

    if (lines.length > 1) {
      blocks.push(lines.join("\n"));
    }
  }

  if (blocks.length === 0) {
    throw makeParseError(
      "corrupted",
      "No readable text was found in this presentation. It may contain only images or be password-protected."
    );
  }

  return {
    text: normalizeExtractedText(blocks.join("\n\n")),
    slideCount: visibleCount,
  };
}

// ── Slide order resolution ────────────────────────────────────────────────────

async function resolveSlideOrder(zip: JSZip): Promise<string[]> {
  // presentation.xml.rels maps rId → slide path
  const relsPath = "ppt/_rels/presentation.xml.rels";
  const relsFile = zip.file(relsPath);
  if (!relsFile) return [];

  const relsXml = await relsFile.async("string");
  const parser = new XMLParser(PARSER_OPTIONS);
  const parsed = parser.parse(relsXml);

  const rels: Array<{ "@_Id": string; "@_Type": string; "@_Target": string }> =
    parsed?.Relationships?.Relationship ?? [];

  const slideRels = new Map<string, string>();
  for (const rel of rels) {
    if (rel["@_Type"]?.includes("/slide") && !rel["@_Type"]?.includes("Layout") && !rel["@_Type"]?.includes("Master")) {
      // Target is relative to ppt/ folder, e.g. "slides/slide1.xml"
      slideRels.set(rel["@_Id"], `ppt/${rel["@_Target"]}`);
    }
  }

  // presentation.xml defines the display order via sldIdLst
  const presFile = zip.file("ppt/presentation.xml");
  if (!presFile) return Array.from(slideRels.values());

  const presXml = await presFile.async("string");
  const presParsed = parser.parse(presXml);

  // Normalise: sldId can be a single object or an array.
  const rawSldIds =
    presParsed?.["p:presentation"]?.["p:sldIdLst"]?.["p:sldId"] ?? [];
  const sldIds = Array.isArray(rawSldIds) ? rawSldIds : [rawSldIds];

  const ordered: string[] = [];
  for (const s of sldIds) {
    const rId: string = s["@_r:id"] ?? s["@_rId"] ?? "";
    const path = slideRels.get(rId);
    if (path) ordered.push(path);
  }

  // Fallback: if ordering failed, use alphabetical slide order.
  if (ordered.length === 0) {
    return Array.from(slideRels.values()).sort();
  }

  return ordered;
}

// ── Notes path resolution ─────────────────────────────────────────────────────

async function resolveNotesPath(
  zip: JSZip,
  slidePath: string
): Promise<string | null> {
  // slidePath = "ppt/slides/slide3.xml"
  // rels file = "ppt/slides/_rels/slide3.xml.rels"
  const parts = slidePath.split("/"); // ["ppt","slides","slide3.xml"]
  const relsPath = `${parts.slice(0, -1).join("/")}/_rels/${parts[parts.length - 1]}.rels`;

  const relsFile = zip.file(relsPath);
  if (!relsFile) return null;

  const relsXml = await relsFile.async("string");
  const parser = new XMLParser(PARSER_OPTIONS);
  const parsed = parser.parse(relsXml);
  const rels: Array<{ "@_Type": string; "@_Target": string }> =
    parsed?.Relationships?.Relationship ?? [];

  for (const rel of rels) {
    if (rel["@_Type"]?.includes("notesSlide")) {
      // Target is relative, e.g. "../notesSlides/notesSlide3.xml"
      const base = parts.slice(0, -1).join("/");
      const resolved = resolveRelativePath(base, rel["@_Target"]);
      return resolved;
    }
  }
  return null;
}

function resolveRelativePath(base: string, relative: string): string {
  const parts = base.split("/");
  for (const segment of relative.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}

// ── Text extraction helpers ───────────────────────────────────────────────────

function extractTitle(spTree: Record<string, unknown>): string {
  const shapes = (spTree["p:sp"] as unknown[]) ?? [];
  for (const sp of shapes) {
    const s = sp as Record<string, unknown>;
    const phType =
      (s?.["p:nvSpPr"] as Record<string, unknown>)?.["p:nvPr"] as Record<string, unknown>;
    const ph = phType?.["p:ph"] as Record<string, unknown> | undefined;
    const type = ph?.["@_type"] as string | undefined;
    if (type === "title" || type === "ctrTitle") {
      const text = extractTxBodyText(s?.["p:txBody"] as Record<string, unknown>);
      if (text) return text;
    }
  }
  return "";
}

function extractBody(spTree: Record<string, unknown>, title: string): string {
  const lines: string[] = [];

  // Regular shapes (p:sp)
  const shapes = (spTree["p:sp"] as unknown[]) ?? [];
  for (const sp of shapes) {
    const s = sp as Record<string, unknown>;
    const phType =
      ((s?.["p:nvSpPr"] as Record<string, unknown>)?.["p:nvPr"] as Record<string, unknown>)?.["p:ph"] as Record<string, unknown> | undefined;
    const type = phType?.["@_type"] as string | undefined;
    // Skip title placeholders (already captured) and slide-number/date/footer placeholders.
    if (type === "title" || type === "ctrTitle" || type === "dt" || type === "ftr" || type === "sldNum") continue;

    const text = extractTxBodyText(s?.["p:txBody"] as Record<string, unknown>);
    if (text && text !== title) lines.push(text);
  }

  // Group shapes (p:grpSp) — recursively extract
  const groups = (spTree["p:grpSp"] as unknown[]) ?? [];
  for (const grp of groups) {
    const g = grp as Record<string, unknown>;
    const innerTree = g?.["p:spTree"] as Record<string, unknown> | undefined;
    if (innerTree) {
      lines.push(extractBody(innerTree, title));
    } else {
      // Some groups embed shapes directly
      const innerShapes = (g?.["p:sp"] as unknown[]) ?? [];
      for (const sp of innerShapes) {
        const s = sp as Record<string, unknown>;
        const text = extractTxBodyText(s?.["p:txBody"] as Record<string, unknown>);
        if (text && text !== title) lines.push(text);
      }
    }
  }

  // Graphic frames — SmartArt / tables (best-effort)
  const frames = (spTree["p:graphicFrame"] as unknown[]) ?? [];
  for (const frame of frames) {
    const f = frame as Record<string, unknown>;
    const tableText = extractTableText(f);
    if (tableText) lines.push(tableText);
    // SmartArt — recurse for any a:t nodes
    const smartText = extractAllAT(f);
    if (smartText) lines.push(smartText);
  }

  return lines.filter(Boolean).join("\n");
}

function extractTxBodyText(txBody: Record<string, unknown> | undefined): string {
  if (!txBody) return "";
  const paras = (txBody["a:p"] as unknown[]) ?? [];
  const lines = paras.map((p) => {
    const para = p as Record<string, unknown>;
    const runs = (para["a:r"] as unknown[]) ?? [];
    const runTexts = runs
      .map((r) => {
        const run = r as Record<string, unknown>;
        const t = run["a:t"];
        return typeof t === "string" ? t : "";
      })
      .filter((t) => t.length > 0);
    return joinTextRuns(runTexts);
  });
  return lines
    .filter((l) => {
      const trimmed = l.trim().toLowerCase();
      return trimmed.length > 0 && !TEMPLATE_TEXTS.has(trimmed);
    })
    .join("\n");
}

function extractTableText(frame: Record<string, unknown>): string {
  // Tables are at frame -> p:graphic -> a:graphicData -> a:tbl -> a:tr -> a:tc
  const graphic = (frame as Record<string, unknown>)?.["p:graphic"] as Record<string, unknown> | undefined;
  const graphicData = graphic?.["a:graphicData"] as Record<string, unknown> | undefined;
  const tbl = graphicData?.["a:tbl"] as Record<string, unknown> | undefined;
  if (!tbl) return "";

  const rows = (tbl["a:tr"] as unknown[]) ?? [];
  return rows
    .map((row) => {
      const cells = ((row as Record<string, unknown>)["a:tc"] as unknown[]) ?? [];
      return cells
        .map((cell) => {
          const txBody = (cell as Record<string, unknown>)["a:txBody"] as Record<string, unknown>;
          return extractTxBodyText(txBody);
        })
        .filter(Boolean)
        .join(" | ");
    })
    .filter(Boolean)
    .join("\n");
}

/** Brute-force extract all a:t values from any nested structure (SmartArt etc.) */
function extractAllAT(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const texts: string[] = [];
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (key === "a:t" && typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed && !TEMPLATE_TEXTS.has(trimmed.toLowerCase())) texts.push(trimmed);
    } else if (Array.isArray(val)) {
      for (const item of val) texts.push(extractAllAT(item));
    } else if (typeof val === "object") {
      texts.push(extractAllAT(val));
    }
  }
  return texts.filter(Boolean).join(" ");
}

function joinTextRuns(runs: string[]): string {
  return runs.reduce((out, current) => {
    if (!out) return current;
    if (!current) return out;
    return `${out}${needsInsertedSpace(out, current) ? " " : ""}${current}`;
  }, "");
}

function needsInsertedSpace(previous: string, next: string): boolean {
  if (/\s$/.test(previous) || /^\s/.test(next)) return false;

  const prev = previous.at(-1) ?? "";
  const first = next[0] ?? "";
  if (!prev || !first) return false;

  // Keep common compact tokens intact: Q1, 5MAP, £1bn, 85%, etc.
  if (/\d/.test(prev) && /[%A-Z]/.test(first)) return false;
  if (/[A-Z]/.test(prev) && /\d/.test(first)) return false;
  if (/[$£€]/.test(prev) || /[%/&+\-–—]/.test(prev) || /[%/&+\-–—]/.test(first)) return false;
  if (/^(s|es|ed|er|ers|ing|ion|ions|tion|tions|ance|ence|ment|ments|ity|ities|ive|ives|al|ally)$/i.test(next)) {
    return false;
  }

  // Separate visual text runs that represent adjacent words.
  return /[A-Za-z0-9\])]/.test(prev) && /[A-Za-z\[(]/.test(first);
}

function normalizeExtractedText(text: string): string {
  return text
    // Missing space after labels or punctuation before placeholders/brackets.
    .replace(/([):;,.!?])(?=\[)/g, "$1 ")
    .replace(/([):;,.!?])(?=[A-Za-z])/g, "$1 ")
    // Common PowerPoint artefacts observed in real 5MAP files.
    .replace(/\bPerformancemanagement\b/g, "Performance management")
    .replace(/\bprocess es\b/gi, "processes")
    .replace(/\bwhichhas\b/g, "which has")
    .replace(/\bfromSeptember\b/g, "from September")
    // Tidy spaces without flattening paragraph/slide structure.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function extractNotes(
  zip: JSZip,
  notesPath: string,
  parser: XMLParser
): Promise<string> {
  const file = zip.file(notesPath);
  if (!file) return "";

  const xml = await file.async("string");
  const parsed = parser.parse(xml);
  // Notes slide has same shape but under p:notes > p:cSld > p:spTree
  const spTree =
    parsed?.["p:notes"]?.["p:cSld"]?.["p:spTree"] ??
    parsed?.["p:notesSz"] ?? {};

  const shapes = (spTree["p:sp"] as unknown[]) ?? [];
  const lines: string[] = [];
  for (const sp of shapes) {
    const s = sp as Record<string, unknown>;
    const phType =
      ((s?.["p:nvSpPr"] as Record<string, unknown>)?.["p:nvPr"] as Record<string, unknown>)?.["p:ph"] as Record<string, unknown> | undefined;
    const type = phType?.["@_type"] as string | undefined;
    // Skip "Slide image" placeholder (type="body" idx=0 is the thumbnail — idx=1 is the notes)
    const idx = phType?.["@_idx"];
    if (type === "body" && (idx === "0" || idx === 0)) continue;

    const text = extractTxBodyText(s?.["p:txBody"] as Record<string, unknown>);
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function makeParseError(
  type: ParseError["type"],
  message: string
): ParseError & Error {
  const err = new Error(message) as ParseError & Error;
  err.type = type;
  return err;
}
