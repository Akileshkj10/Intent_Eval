/**
 * P2-T2: Test PPTX extraction against real client files.
 * Runs in Node.js using the same logic as lib/parsePptx.ts.
 */

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { XMLParser } = require("fast-xml-parser");

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
  isArray: (name) =>
    ["p:sp", "p:grpSp", "p:graphicFrame", "a:p", "a:r", "a:tc", "a:tr", "Relationship"].includes(name),
};

// ── Core extraction (mirrors parsePptx.ts logic) ──────────────────────────────

async function parsePptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  if (!zip.file("ppt/presentation.xml")) {
    throw new Error("No presentation.xml found — not a valid .pptx");
  }

  const slideFiles = await resolveSlideOrder(zip);
  const parser = new XMLParser(PARSER_OPTIONS);
  const blocks = [];
  let visibleCount = 0;

  for (const slidePath of slideFiles) {
    const slideFile = zip.file(slidePath);
    if (!slideFile) continue;

    const xmlStr = await slideFile.async("string");
    const parsed = parser.parse(xmlStr);
    const sld = parsed?.["p:sld"] ?? {};

    if (sld["@_show"] === "0" || sld["@_show"] === 0) continue;

    visibleCount++;
    const spTree = sld?.["p:cSld"]?.["p:spTree"] ?? {};
    const title = extractTitle(spTree);
    const body = extractBody(spTree, title);
    const notesPath = await resolveNotesPath(zip, slidePath);
    const notes = notesPath ? await extractNotes(zip, notesPath, parser) : "";

    const headerLine = title ? `[Slide ${visibleCount} — "${title}"]` : `[Slide ${visibleCount}]`;
    const lines = [headerLine];
    if (body.trim()) lines.push(`Body:\n${body.trim()}`);
    if (notes.trim()) lines.push(`Notes:\n${notes.trim()}`);
    if (lines.length > 1) blocks.push(lines.join("\n"));
  }

  return { text: blocks.join("\n\n"), slideCount: visibleCount };
}

async function resolveSlideOrder(zip) {
  const relsFile = zip.file("ppt/_rels/presentation.xml.rels");
  if (!relsFile) return [];
  const relsXml = await relsFile.async("string");
  const parser = new XMLParser(PARSER_OPTIONS);
  const parsed = parser.parse(relsXml);
  const rels = parsed?.Relationships?.Relationship ?? [];

  const slideRels = new Map();
  for (const rel of rels) {
    if (rel["@_Type"]?.includes("/slide") && !rel["@_Type"]?.includes("Layout") && !rel["@_Type"]?.includes("Master")) {
      slideRels.set(rel["@_Id"], `ppt/${rel["@_Target"]}`);
    }
  }

  const presFile = zip.file("ppt/presentation.xml");
  if (!presFile) return Array.from(slideRels.values());
  const presXml = await presFile.async("string");
  const presParsed = parser.parse(presXml);
  const rawSldIds = presParsed?.["p:presentation"]?.["p:sldIdLst"]?.["p:sldId"] ?? [];
  const sldIds = Array.isArray(rawSldIds) ? rawSldIds : [rawSldIds];

  const ordered = [];
  for (const s of sldIds) {
    const rId = s["@_r:id"] ?? s["@_rId"] ?? "";
    const p = slideRels.get(rId);
    if (p) ordered.push(p);
  }
  return ordered.length > 0 ? ordered : Array.from(slideRels.values()).sort();
}

async function resolveNotesPath(zip, slidePath) {
  const parts = slidePath.split("/");
  const relsPath = `${parts.slice(0, -1).join("/")}/_rels/${parts[parts.length - 1]}.rels`;
  const relsFile = zip.file(relsPath);
  if (!relsFile) return null;
  const relsXml = await relsFile.async("string");
  const parser = new XMLParser(PARSER_OPTIONS);
  const parsed = parser.parse(relsXml);
  const rels = parsed?.Relationships?.Relationship ?? [];
  for (const rel of rels) {
    if (rel["@_Type"]?.includes("notesSlide")) {
      const base = parts.slice(0, -1).join("/");
      return resolveRelativePath(base, rel["@_Target"]);
    }
  }
  return null;
}

function resolveRelativePath(base, relative) {
  const parts = base.split("/");
  for (const seg of relative.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function extractTitle(spTree) {
  for (const sp of spTree["p:sp"] ?? []) {
    const ph = sp?.["p:nvSpPr"]?.["p:nvPr"]?.["p:ph"];
    const type = ph?.["@_type"];
    if (type === "title" || type === "ctrTitle") {
      const text = extractTxBodyText(sp?.["p:txBody"]);
      if (text) return text;
    }
  }
  return "";
}

function extractBody(spTree, title) {
  const lines = [];
  for (const sp of spTree["p:sp"] ?? []) {
    const ph = sp?.["p:nvSpPr"]?.["p:nvPr"]?.["p:ph"];
    const type = ph?.["@_type"];
    if (["title", "ctrTitle", "dt", "ftr", "sldNum"].includes(type)) continue;
    const text = extractTxBodyText(sp?.["p:txBody"]);
    if (text && text !== title) lines.push(text);
  }
  for (const grp of spTree["p:grpSp"] ?? []) {
    const inner = grp?.["p:spTree"];
    if (inner) lines.push(extractBody(inner, title));
    else for (const sp of grp?.["p:sp"] ?? []) {
      const text = extractTxBodyText(sp?.["p:txBody"]);
      if (text && text !== title) lines.push(text);
    }
  }
  for (const frame of spTree["p:graphicFrame"] ?? []) {
    const tbl = frame?.["p:graphic"]?.["a:graphicData"]?.["a:tbl"];
    if (tbl) {
      const rows = tbl["a:tr"] ?? [];
      const tableText = rows.map(r => (r["a:tc"] ?? []).map(c => extractTxBodyText(c["a:txBody"])).filter(Boolean).join(" | ")).filter(Boolean).join("\n");
      if (tableText) lines.push(tableText);
    }
  }
  return lines.filter(Boolean).join("\n");
}

function extractTxBodyText(txBody) {
  if (!txBody) return "";
  return (txBody["a:p"] ?? [])
    .map(p => (p["a:r"] ?? []).map(r => typeof r["a:t"] === "string" ? r["a:t"] : "").join(""))
    .filter(l => { const t = l.trim().toLowerCase(); return t.length > 0 && !TEMPLATE_TEXTS.has(t); })
    .join("\n");
}

async function extractNotes(zip, notesPath, parser) {
  const file = zip.file(notesPath);
  if (!file) return "";
  const xml = await file.async("string");
  const parsed = parser.parse(xml);
  const spTree = parsed?.["p:notes"]?.["p:cSld"]?.["p:spTree"] ?? {};
  const lines = [];
  for (const sp of spTree["p:sp"] ?? []) {
    const ph = sp?.["p:nvSpPr"]?.["p:nvPr"]?.["p:ph"];
    const idx = ph?.["@_idx"];
    if (ph?.["@_type"] === "body" && (idx === "0" || idx === 0)) continue;
    const text = extractTxBodyText(sp?.["p:txBody"]);
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

// ── Q-section detection helper ────────────────────────────────────────────────

const Q_PATTERNS = [
  /\bq[1-5]\b/i,
  /\bquestion\s*[1-5]\b/i,
  /\b(context|higher intent|higher direction)\b/i,
  /\b(intent|mission|purpose)\b/i,
  /\b(implied tasks|main effort|tasks|priorities)\b/i,
  /\b(boundaries|freedoms|constraints)\b/i,
  /\b(backbrief|achievability|review)\b/i,
];

function detectQSections(text) {
  const detected = new Set();
  for (const pattern of Q_PATTERNS) {
    if (pattern.test(text)) detected.add(pattern.source);
  }
  return detected.size;
}

// ── Test runner ───────────────────────────────────────────────────────────────

const TEST_FILES = [
  { label: "Hospitality — Simplification",  path: "C:\\Users\\akile\\projects\\Intent_Evaluator\\Client 5maps\\Hospitality\\5QMA Simplification# (2).pptx" },
  { label: "Hospitality — Participation",    path: "C:\\Users\\akile\\projects\\Intent_Evaluator\\Client 5maps\\Hospitality\\5QMA Participation v2.pptx" },
  { label: "Manufacturing — Leadership",     path: "C:\\Users\\akile\\projects\\Intent_Evaluator\\Client 5maps\\Manufacturing\\5MAP - Leadership.pptx" },
  { label: "Manufacturing — Core Values",    path: "C:\\Users\\akile\\projects\\Intent_Evaluator\\Client 5maps\\Manufacturing\\5MAP Core Values and Pride.pptx" },
];

async function run() {
  let passed = 0;
  let failed = 0;

  for (const { label, path: filePath } of TEST_FILES) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Testing: ${label}`);
    console.log(`File:    ${path.basename(filePath)}`);

    try {
      // Pass Node.js Buffer directly — JSZip accepts it natively.
      // Do NOT use buffer.buffer which references a pooled ArrayBuffer with wrong offsets.
      const buffer = fs.readFileSync(filePath);
      const { text, slideCount } = await parsePptx(buffer);

      // AC 1: non-empty output
      if (!text || text.trim().length < 100) {
        console.log("  ✗ FAIL: extracted text is too short");
        failed++;
        continue;
      }

      // AC 2: slide count > 0
      if (slideCount === 0) {
        console.log("  ✗ FAIL: slideCount is 0");
        failed++;
        continue;
      }

      // AC 3: meaningful content detected
      const qCount = detectQSections(text);
      const wordCount = text.split(/\s+/).length;

      console.log(`  Slides extracted: ${slideCount}`);
      console.log(`  Total words:      ${wordCount}`);
      console.log(`  Q-section signals detected: ${qCount}`);

      // Print first 600 chars for manual review
      console.log(`\n  Preview (first 600 chars):\n`);
      console.log(text.slice(0, 600).split("\n").map(l => "  " + l).join("\n"));
      if (text.length > 600) console.log("  ...[truncated]");

      // Check for notes
      const hasNotes = text.includes("Notes:");
      console.log(`\n  Speaker notes present: ${hasNotes}`);

      // Check no template text leaked
      const templateLeaked = [...TEMPLATE_TEXTS].some(t => text.toLowerCase().includes(t));
      if (templateLeaked) {
        console.log("  ✗ FAIL: template placeholder text leaked into output");
        failed++;
        continue;
      }

      console.log(`  ✓ PASS — extraction succeeded`);
      passed++;
    } catch (err) {
      console.log(`  ✗ FAIL: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`P2-T2 Results: ${passed} passed, ${failed} failed out of ${TEST_FILES.length} files`);

  if (failed === 0) {
    console.log("✓ P2-T2 PASS — all client PPTX files extracted successfully");
  } else {
    console.log("✗ P2-T2 FAIL — see errors above");
    process.exit(1);
  }
}

run();
