export class ClaudeJsonParseError extends Error {
  readonly raw: string;

  constructor(message: string, raw: string, cause?: unknown) {
    super(message);
    this.name = "ClaudeJsonParseError";
    this.raw = raw;
    if (cause) {
      this.cause = cause;
    }
  }
}

export function isClaudeJsonParseError(error: unknown): error is ClaudeJsonParseError {
  return error instanceof ClaudeJsonParseError;
}

export function userFacingJsonErrorMessage(): string {
  return "The AI response was not valid JSON. Please retry. If this repeats, use a shorter input or contact support.";
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractBalancedJson(text: string): string {
  const source = stripMarkdownFence(text);
  const start = source.search(/[\[{]/);
  if (start === -1) {
    throw new ClaudeJsonParseError("Claude response did not contain a JSON object or array.", text);
  }

  const opener = source[start];
  const closer = opener === "{" ? "}" : "]";
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
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
      if (stack.pop() !== char) {
        break;
      }
      if (stack.length === 0 && char === closer) {
        return source.slice(start, i + 1).trim();
      }
    }
  }

  throw new ClaudeJsonParseError("Claude response contained incomplete JSON.", text);
}

function repairSafeJson(json: string): string {
  // Safe repair only: trailing commas before an object/array close are a common LLM artefact.
  return json.replace(/,\s*([}\]])/g, "$1");
}

export function parseClaudeJson<T>(raw: string): T {
  const candidate = repairSafeJson(extractBalancedJson(raw));
  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    throw new ClaudeJsonParseError("Claude response was not valid JSON.", raw, error);
  }
}
