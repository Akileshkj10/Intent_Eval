"""Quick spike script for Docling PPTX parsing behavior."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow running the script directly from repository root.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from intent_evaluator.parsing.docling_adapter import parse_pptx


def main() -> int:
    parser = argparse.ArgumentParser(description="Spike Docling parsing on a PPTX path")
    parser.add_argument("path", help="Path to .pptx input (or synthetic .json during bootstrap)")
    args = parser.parse_args()

    source = Path(args.path)
    if source.suffix.lower() == ".pptx" and (not source.exists() or source.stat().st_size == 0):
        print(
            json.dumps(
                {
                    "status": "skipped",
                    "reason": "input_missing_or_empty",
                    "path": str(source),
                },
                indent=2,
            )
        )
        return 0

    try:
        parsed = parse_pptx(source)
    except Exception as exc:  # pragma: no cover - spike script for manual probing
        print(
            json.dumps(
                {
                    "status": "error",
                    "path": str(source),
                    "error": str(exc),
                },
                indent=2,
            )
        )
        return 0

    snippet = {
        "map_title": parsed.map_title,
        "source_filename": parsed.source_filename,
        "slide_count": len(parsed.slides),
        "slides": [slide.model_dump(mode="json") for slide in parsed.slides[:2]],
        "low_confidence_sections": parsed.low_confidence_sections,
    }
    print(json.dumps(snippet, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
