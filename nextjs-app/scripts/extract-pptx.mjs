import { readFileSync } from "fs";
import { parsePptx } from "../lib/parsePptx.ts";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/extract-pptx.mjs <path-to-pptx>");
  process.exit(1);
}

const buf = readFileSync(filePath);
const result = await parsePptx(buf);
console.log(JSON.stringify(result));
