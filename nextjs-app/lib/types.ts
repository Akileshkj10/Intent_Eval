/**
 * Shared types for the Intent Evaluator input pipeline.
 * Used by page.tsx, route.ts, parsePptx.ts, parsePdf.ts, and evaluator.ts.
 */

/** Which input method the user chose. */
export type InputMode = "text" | "pptx" | "pdf";

/**
 * A parsed file ready to be sent to the evaluation pipeline.
 * - pptx mode: text extracted client-side, flows through existing text pipeline
 * - pdf mode: base64-encoded bytes sent directly to Claude document API
 */
export interface ParsedFile {
  mode: "pptx" | "pdf";
  /** PPTX only — extracted text, pre-populated into textarea */
  text?: string;
  /** PDF only — base64-encoded PDF bytes */
  pdfBase64?: string;
  /** PPTX only — number of slides found */
  slideCount?: number;
  /** Original filename for display */
  fileName: string;
}

/** User-facing parse error with an actionable message. */
export interface ParseError {
  type:
    | "password_protected"
    | "corrupted"
    | "wrong_format"
    | "too_large"
    | "unknown";
  message: string;
}
