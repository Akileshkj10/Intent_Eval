/**
 * Full diagnostic — run our exact parsePptx logic and print everything
 */
const fs = require("fs");
const JSZip = require("jszip");
const { XMLParser } = require("fast-xml-parser");

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    ["p:sp", "p:grpSp", "p:graphicFrame", "a:p", "a:r", "a:tc", "a:tr", "Relationship"].includes(name),
};

async function run() {
  const filePath = "C:\\Users\\akile\\projects\\Intent_Evaluator\\Client 5maps\\Hospitality\\5QMA Simplification# (2).pptx";
  const nodeBuf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(nodeBuf);

  // Build slide map from rels
  const relsXml = await zip.file("ppt/_rels/presentation.xml.rels").async("string");
  const parser = new XMLParser(PARSER_OPTIONS);
  const relsParsed = parser.parse(relsXml);
  const rels = relsParsed?.Relationships?.Relationship ?? [];

  const slideRels = new Map();
  for (const rel of rels) {
    if (rel["@_Type"]?.includes("/slide") && !rel["@_Type"]?.includes("Layout") && !rel["@_Type"]?.includes("Master")) {
      slideRels.set(rel["@_Id"], `ppt/${rel["@_Target"]}`);
    }
  }
  console.log("Slide rels:", Object.fromEntries(slideRels));

  // Ordered from presentation.xml
  const presXml = await zip.file("ppt/presentation.xml").async("string");
  const presParsed = parser.parse(presXml);
  const rawSldIds = presParsed?.["p:presentation"]?.["p:sldIdLst"]?.["p:sldId"] ?? [];
  const sldIds = Array.isArray(rawSldIds) ? rawSldIds : [rawSldIds];
  console.log("\nSlide IDs:", sldIds);

  const ordered = [];
  for (const s of sldIds) {
    const rId = s["@_r:id"] ?? s["@_rId"] ?? "";
    console.log("  rId:", rId, "-> path:", slideRels.get(rId));
    const p = slideRels.get(rId);
    if (p) ordered.push(p);
  }
  console.log("\nOrdered slides:", ordered);

  // Extract first slide
  if (ordered.length > 0) {
    const slideXml = await zip.file(ordered[0]).async("string");
    const slideParsed = parser.parse(slideXml);
    console.log("\nSlide 1 structure keys:", Object.keys(slideParsed?.["p:sld"] ?? {}));
    console.log("cSld keys:", Object.keys(slideParsed?.["p:sld"]?.["p:cSld"] ?? {}));
    const spTree = slideParsed?.["p:sld"]?.["p:cSld"]?.["p:spTree"] ?? {};
    console.log("spTree keys:", Object.keys(spTree));
    console.log("spTree p:sp count:", (spTree["p:sp"] ?? []).length);

    // Print first shape details
    const shapes = spTree["p:sp"] ?? [];
    for (let i = 0; i < Math.min(shapes.length, 3); i++) {
      const sp = shapes[i];
      const ph = sp?.["p:nvSpPr"]?.["p:nvPr"]?.["p:ph"];
      console.log(`\n  Shape ${i+1}:`);
      console.log("    ph:", JSON.stringify(ph));
      console.log("    txBody:", JSON.stringify(sp?.["p:txBody"])?.slice(0, 200));
    }
  }
}

run().catch(console.error);
