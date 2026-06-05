/**
 * Quick diagnostic — see what JSZip extracts from the PPTX files.
 */
const fs = require("fs");
const JSZip = require("jszip");
const { XMLParser } = require("fast-xml-parser");

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    ["p:sp", "a:p", "a:r", "Relationship"].includes(name),
};

async function diagnose(filePath) {
  console.log("\nFile:", filePath);
  // Pass Buffer directly (not .buffer) — JSZip supports Node.js Buffer natively
  const nodeBuf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(nodeBuf);

  const files = Object.keys(zip.files).slice(0, 20);
  console.log("ZIP contents (first 20):", files);

  const presFile = zip.file("ppt/presentation.xml");
  if (!presFile) { console.log("NO ppt/presentation.xml found!"); return; }
  console.log("✓ presentation.xml found");

  // Check rels
  const relsFile = zip.file("ppt/_rels/presentation.xml.rels");
  if (!relsFile) { console.log("NO ppt/_rels/presentation.xml.rels!"); return; }
  const relsXml = await relsFile.async("string");
  const parser = new XMLParser(PARSER_OPTIONS);
  const relsParsed = parser.parse(relsXml);
  const rels = relsParsed?.Relationships?.Relationship ?? [];
  const slideRels = rels.filter(r => r["@_Type"]?.includes("/slide") && !r["@_Type"]?.includes("Layout") && !r["@_Type"]?.includes("Master"));
  console.log("Slide relationships found:", slideRels.length);
  slideRels.slice(0, 3).forEach(r => console.log("  ", r["@_Id"], "->", r["@_Target"]));

  // Check slide order from presentation.xml
  const presXml = await presFile.async("string");
  const presParsed = parser.parse(presXml);
  const rawSldIds = presParsed?.["p:presentation"]?.["p:sldIdLst"]?.["p:sldId"] ?? [];
  const sldIds = Array.isArray(rawSldIds) ? rawSldIds : [rawSldIds];
  console.log("Slide IDs in presentation.xml:", sldIds.length);
  sldIds.slice(0, 3).forEach(s => console.log("  ", JSON.stringify(s)));

  // Try loading slide 1
  if (slideRels.length > 0) {
    const slidePath = `ppt/${slideRels[0]["@_Target"]}`;
    console.log("Trying slide path:", slidePath);
    const slideFile = zip.file(slidePath);
    if (!slideFile) { console.log("Slide file not found at that path"); } 
    else {
      const slideXml = await slideFile.async("string");
      console.log("Slide 1 XML (first 500 chars):", slideXml.slice(0, 500));
    }
  }
}

async function run() {
  await diagnose("C:\\Users\\akile\\projects\\Intent_Evaluator\\Client 5maps\\Hospitality\\5QMA Simplification# (2).pptx");
}

run().catch(console.error);
