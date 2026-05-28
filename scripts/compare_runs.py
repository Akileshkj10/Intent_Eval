"""Compare two scorecard runs for consistency."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

R1 = ROOT / "outputs" / "test_client_reports" / "hospitality_data_insights" / "scorecard.json"
R2 = ROOT / "outputs" / "test_client_reports" / "hospitality_data_insights_run2" / "scorecard.json"

WEIGHTS = {
    "clarity_outcome": 0.20,
    "clarity_purpose": 0.20,
    "alignment_higher_direction": 0.15,
    "alignment_tasks": 0.15,
    "conciseness": 0.06,
    "outcome_focused": 0.06,
    "decentralised_utility": 0.06,
    "testability": 0.06,
    "energy_engagement": 0.06,
}


def main() -> None:
    r1 = json.loads(R1.read_text())
    r2 = json.loads(R2.read_text())

    scores1 = {d["dimension_id"]: d["score"] for d in r1["dimension_scores"]}
    scores2 = {d["dimension_id"]: d["score"] for d in r2["dimension_scores"]}

    col_dim = 35
    col_num = 7
    header = f"{'Dimension':<{col_dim}} {'Run1':>{col_num}} {'Run2':>{col_num}} {'Delta':>{col_num}}"
    sep = "-" * len(header)
    print(header)
    print(sep)

    total1 = 0.0
    total2 = 0.0
    diffs: list[str] = []

    for dim, w in WEIGHTS.items():
        s1 = scores1[dim]
        s2 = scores2[dim]
        delta = s2 - s1
        flag = "  <-- CHANGED" if delta != 0 else ""
        if delta != 0:
            diffs.append(dim)
        total1 += s1 * w
        total2 += s2 * w
        print(f"{dim:<{col_dim}} {s1:>{col_num}} {s2:>{col_num}} {delta:>+{col_num}}{flag}")

    print(sep)
    print(f"{'TOTAL WEIGHTED':<{col_dim}} {total1:>{col_num}.2f} {total2:>{col_num}.2f} {total2 - total1:>+{col_num}.2f}")
    print()

    if not diffs:
        print("RESULT: All 9 dimension scores are identical. Model is fully consistent on this input.")
    else:
        print(f"RESULT: {len(diffs)} dimension(s) changed: {', '.join(diffs)}")
        print(f"  Score drift: {abs(total2 - total1):.2f} points")
        if abs(total2 - total1) <= 0.10:
            print("  Assessment: Negligible — within 0.1 of a point total.")
        elif abs(total2 - total1) <= 0.25:
            print("  Assessment: Minor — within normal LLM sampling variance.")
        else:
            print("  Assessment: Notable — warrants investigation.")


if __name__ == "__main__":
    main()
