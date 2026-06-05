/**
 * P4 Test Suite — validates page.tsx structural requirements
 * without a browser.
 */

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

const src = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");

// ── P4-T1: File upload area ────────────────────────────────────────────────

console.log("\n── P4-T1: File upload area ──────────────────────────────────────");
assert(src.includes('accept=".pptx,.pdf"'), "File input accepts only .pptx and .pdf");
assert(src.includes("onDragOver"), "Drag-over handler present");
assert(src.includes("onDragLeave"), "Drag-leave handler present");
assert(src.includes("onDrop"), "Drop handler present");
assert(src.includes("fileInputRef.current?.click()"), "Click-to-browse triggers file input");
assert(src.includes("clearFile"), "File can be cleared");
assert(src.includes('title="Remove file"'), "X/remove button has accessible title");
assert(src.includes("fileInfo.badge"), "File badge (slide count / PDF size) is rendered");
assert(src.includes("fileInfo.name"), "Filename is displayed");

// ── P4-T2: PPTX extraction ────────────────────────────────────────────────

console.log("\n── P4-T2: PPTX client-side extraction ───────────────────────────");
assert(src.includes("parsePptx"), "parsePptx is imported and called");
assert(src.includes("file.arrayBuffer()"), "File converted to ArrayBuffer for parsePptx");
assert(src.includes("Extracting slides"), "Extracting spinner text present");
assert(src.includes("extracting"), "extracting state used");
assert(src.includes("setText(extracted)"), "Extracted text populates textarea");
assert(src.includes("slideCount"), "Slide count captured and used in badge");
// PPTX path -> text mode -> existing text API flow
assert(
  src.includes("body = { text }") || src.includes("body: JSON.stringify({ text })"),
  "After PPTX extraction, text flow used for evaluation"
);
// Old .ppt blocked
assert(
  src.includes('lowerName.endsWith(".ppt") && !lowerName.endsWith(".pptx")'),
  "Old .ppt binary format is detected and blocked"
);
assert(
  src.includes("Please save this file as .pptx first"),
  ".ppt error message is user-actionable"
);

// ── P4-T3: PDF flow ───────────────────────────────────────────────────────

console.log("\n── P4-T3: PDF flow ──────────────────────────────────────────────");
assert(src.includes("readPdfAsBase64"), "readPdfAsBase64 is imported and called");
assert(src.includes("pdfBase64"), "pdfBase64 state is present");
assert(src.includes("setPdfBase64(base64)"), "base64 stored in state on PDF load");
assert(src.includes("Sending PDF to Claude"), "PDF loading status message present");
assert(src.includes("body = { pdf: pdfBase64 }"), "PDF branch sends { pdf } to API");
assert(src.includes("body = { text }"), "Text branch sends { text } to API");
assert(
  src.indexOf("pdfBase64") < src.indexOf("body = { text }"),
  "PDF branch is checked before text branch in handleEvaluate"
);
assert(
  src.includes("Claude will read the PDF directly"),
  "PDF no-preview notice shown to user"
);
// PDF mode disables textarea
assert(
  src.includes("disabled={loading || !!pdfBase64}"),
  "Textarea disabled when PDF is loaded"
);

// ── P4-T4: Error states ───────────────────────────────────────────────────

console.log("\n── P4-T4: Error states ──────────────────────────────────────────");
assert(
  src.includes("password_protected") && src.includes("Remove the password in PowerPoint"),
  "Password-protected PPTX error with actionable message"
);
assert(
  src.includes("wrong_format") && src.includes("Try re-saving it from PowerPoint"),
  "Corrupted/wrong-format PPTX error with actionable message"
);
assert(
  src.includes("too_large") && src.includes("max 32 MB"),
  "PDF too large error with size limit"
);
assert(
  src.includes("Only .pptx and .pdf files are supported"),
  "Wrong file type error message"
);
assert(src.includes("setFileError"), "File errors use setFileError state");
assert(src.includes("fileError &&"), "File error is conditionally rendered");
assert(src.includes('title="Dismiss"'), "File error is dismissable (has dismiss button)");
assert(src.includes("setEvalError"), "Eval errors use separate state (no crash)");
// All errors shown inline — not alert/throw
assert(!src.includes("alert("), "No alert() calls — errors shown inline");

// ── General behavioural ACs ───────────────────────────────────────────────

console.log("\n── General ACs ──────────────────────────────────────────────────");
assert(src.includes("canEvaluate"), "canEvaluate guards the button");
assert(
  src.includes("!!text.trim() || !!pdfBase64"),
  "Button enabled when text OR pdf is present"
);
// Mutual exclusivity: selecting a file clears textarea
assert(
  src.includes("setText(\"\")") || src.includes('setText("")'),
  "Selecting a file clears textarea text"
);
// Mutual exclusivity: typing clears PDF
assert(
  src.includes("if (pdfBase64)") && src.includes("setPdfBase64(null)"),
  "Typing in textarea clears loaded PDF"
);
// Report component is unchanged
assert(src.includes("function Report"), "Report component still present");
assert(src.includes("scoreColour"), "Score colour helper still present");

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(60)}`);
console.log(`P4 Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("✓ P4 PASS — all acceptance criteria met");
  console.log("\nNote: Full end-to-end browser test is P5-T2 (manual smoke test).");
} else {
  console.log("✗ P4 FAIL — see errors above");
  process.exit(1);
}
