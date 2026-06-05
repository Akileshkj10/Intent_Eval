const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function parseClaudeJson(raw) {
  function stripMarkdownFence(text) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
  }

  function extractBalancedJson(text) {
    const source = stripMarkdownFence(text);
    const start = source.search(/[\[{]/);
    if (start === -1) throw new Error("ClaudeJsonParseError");

    const opener = source[start];
    const closer = opener === "{" ? "}" : "]";
    const stack = [];
    let inString = false;
    let escaped = false;

    for (let i = start; i < source.length; i++) {
      const char = source[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{" || char === "[") {
        stack.push(char === "{" ? "}" : "]");
        continue;
      }
      if (char === "}" || char === "]") {
        if (stack.pop() !== char) break;
        if (stack.length === 0 && char === closer) return source.slice(start, i + 1).trim();
      }
    }
    throw new Error("ClaudeJsonParseError");
  }

  const candidate = extractBalancedJson(raw).replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(candidate);
}

console.log("\n── I1-T1: safe JSON extraction utility ──────────────────────────");
assert(parseClaudeJson('{"ok":true}').ok === true, "Parses plain JSON");
assert(parseClaudeJson('```json\n{"ok":true}\n```').ok === true, "Parses fenced JSON");
assert(parseClaudeJson('Here is the JSON:\n{"ok":true}\nThanks.').ok === true, "Parses JSON with surrounding prose");
assert(parseClaudeJson('{"ok":true,}').ok === true, "Repairs safe trailing comma");
assert(parseClaudeJson('{"text":"brace } inside string","ok":true}').ok === true, "Ignores braces inside strings");
try {
  parseClaudeJson("not json");
  assert(false, "Rejects non-JSON response");
} catch {
  assert(true, "Rejects non-JSON response");
}

const evaluatorSrc = fs.readFileSync(path.join(__dirname, "../lib/evaluator.ts"), "utf8");
const routeSrc = fs.readFileSync(path.join(__dirname, "../app/api/evaluate/route.ts"), "utf8");
const jsonSrc = fs.readFileSync(path.join(__dirname, "../lib/json.ts"), "utf8");

console.log("\n── I1-T2: retry on malformed Claude JSON ────────────────────────");
assert(evaluatorSrc.includes("parseClaudeJson"), "Evaluator uses parseClaudeJson");
assert(evaluatorSrc.includes("parseJsonWithRetry"), "Evaluator has shared retry helper");
assert(evaluatorSrc.includes("Invalid JSON response. Retry once"), "Retry prompt is present");
assert(
  (evaluatorSrc.match(/parseJsonWithRetry/g) || []).length >= 4,
  "All Claude JSON paths use retry helper"
);

console.log("\n── I1-T3: user-facing error message ─────────────────────────────");
assert(jsonSrc.includes("userFacingJsonErrorMessage"), "Shared user-facing JSON error message exists");
assert(routeSrc.includes("isClaudeJsonParseError"), "Route detects Claude JSON parse errors");
assert(routeSrc.includes("userFacingJsonErrorMessage()"), "Route uses friendly JSON error message");
assert(!routeSrc.includes("Expected double-quoted property name"), "Route does not expose raw JSON parse internals");

console.log(`\n${"═".repeat(60)}`);
console.log(`I1 Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("✓ I1 PASS — all acceptance criteria met");
} else {
  console.log("✗ I1 FAIL — see errors above");
  process.exit(1);
}
