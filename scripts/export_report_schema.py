"""Export EvaluationReport JSON schema to schemas/evaluation_report.json."""

from __future__ import annotations

import json
from pathlib import Path

from intent_evaluator.report.schema import EvaluationReport


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out_dir = root / "schemas"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "evaluation_report.json"
    schema = EvaluationReport.model_json_schema()
    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(schema, handle, indent=2)
        handle.write("\n")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()

