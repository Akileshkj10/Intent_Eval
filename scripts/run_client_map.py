"""Run the full evaluation pipeline on a client 5MAP and save to test_client_reports."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT))

from app.pipeline import run_ui_pipeline, save_uploaded_bytes  # noqa: E402

MAP_PATH = Path(__file__).resolve().parents[1] / "Client 5maps" / "Hospitality" / "5QMA - DATA & INSIGHTS (1).pptx"
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "outputs" / "test_client_reports" / "hospitality_data_insights"


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    map_path = save_uploaded_bytes(OUTPUT_DIR, MAP_PATH.name, MAP_PATH.read_bytes())
    print(f"Input:  {map_path}")
    print("Running pipeline with live Claude scoring...")

    result = run_ui_pipeline(map_path=map_path, session_dir=OUTPUT_DIR, use_llm=True)

    score = result["total_weighted_score"]
    band = result["interpretation_band"]
    md = result["report_md_path"]
    pdf = result["report_pdf_path"]
    low = result["low_confidence_sections"]

    print(f"\nScore:          {score:.2f} / 5.00")
    print(f"Band:           {band}")
    print(f"Low confidence: {low}")
    print(f"\nReport MD:  {md}")
    print(f"Report PDF: {pdf}")
    print(f"Session:    {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
