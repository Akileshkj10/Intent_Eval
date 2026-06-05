/**
 * parsePdf.ts — Client-side PDF reader for Option B (PDF direct to Claude).
 *
 * Reads a PDF File object in the browser using the FileReader API and returns
 * a base64-encoded string ready to be sent to Anthropic's document API.
 *
 * BROWSER ONLY — do not import this in server-side code.
 */

import type { ParseError } from "./types";

/** Anthropic's documented limit for document inputs. */
const MAX_PDF_BYTES = 32 * 1024 * 1024; // 32 MB

export interface PdfReadResult {
  /** Base64-encoded PDF content, ready for Anthropic document API. */
  base64: string;
  /** Raw file size in bytes (for display). */
  sizeBytes: number;
  /** Original filename. */
  fileName: string;
}

/**
 * Read a PDF File, validate it, and return base64-encoded content.
 * Throws a ParseError-shaped Error on validation failure.
 */
export async function readPdfAsBase64(file: File): Promise<PdfReadResult> {
  // Validate extension
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw makeParseError(
      "wrong_format",
      "Only .pdf files are supported for direct upload. For .pptx files, use the PowerPoint upload option."
    );
  }

  // Validate size
  if (file.size > MAX_PDF_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    throw makeParseError(
      "too_large",
      `PDF is too large (${sizeMB} MB). Maximum size is 32 MB. Try compressing or splitting the file.`
    );
  }

  // Validate not empty
  if (file.size === 0) {
    throw makeParseError("corrupted", "The PDF file appears to be empty.");
  }

  // Read as base64 using FileReader
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is a data URL: "data:application/pdf;base64,<base64>"
      const base64Data = result.split(",")[1];
      if (!base64Data) {
        reject(makeParseError("corrupted", "Could not read the PDF file."));
      } else {
        resolve(base64Data);
      }
    };
    reader.onerror = () =>
      reject(
        makeParseError("corrupted", "Failed to read the PDF file. Please try again.")
      );
    reader.readAsDataURL(file);
  });

  return {
    base64,
    sizeBytes: file.size,
    fileName: file.name,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function makeParseError(
  type: ParseError["type"],
  message: string
): ParseError & Error {
  const err = new Error(message) as ParseError & Error;
  err.type = type;
  return err;
}
