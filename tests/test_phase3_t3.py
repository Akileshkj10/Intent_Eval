"""Acceptance checks for Phase 3 task T3."""

from __future__ import annotations

import json
from pathlib import Path

from intent_evaluator.cli import main


ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_t3_second_parse_hits_cache(capsys, tmp_path: Path) -> None:
    cache_dir = tmp_path / "cache" / "parsed"
    out_dir = tmp_path / "outputs"

    exit_code_1 = main(
        [
            "parse",
            "--input",
            str(SYNTHETIC_MAP_PATH),
            "--out",
            str(out_dir),
            "--run-id",
            "first",
            "--cache-dir",
            str(cache_dir),
        ]
    )
    assert exit_code_1 == 0
    _ = capsys.readouterr()

    exit_code_2 = main(
        [
            "parse",
            "--input",
            str(SYNTHETIC_MAP_PATH),
            "--out",
            str(out_dir),
            "--run-id",
            "second",
            "--cache-dir",
            str(cache_dir),
        ]
    )
    assert exit_code_2 == 0
    captured = capsys.readouterr()
    assert "cache hit" in captured.out


def test_t3_different_input_produces_different_cache_key(tmp_path: Path) -> None:
    cache_dir = tmp_path / "cache" / "parsed"
    out_dir = tmp_path / "outputs"
    input_a = tmp_path / "map_a.json"
    input_b = tmp_path / "map_b.json"

    payload = _load_json(SYNTHETIC_MAP_PATH)
    input_a.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    payload_b = _load_json(SYNTHETIC_MAP_PATH)
    payload_b["map_title"] = "Synthetic Variant"
    input_b.write_text(json.dumps(payload_b, indent=2), encoding="utf-8")

    assert (
        main(
            [
                "parse",
                "--input",
                str(input_a),
                "--out",
                str(out_dir),
                "--run-id",
                "a",
                "--cache-dir",
                str(cache_dir),
            ]
        )
        == 0
    )
    assert (
        main(
            [
                "parse",
                "--input",
                str(input_b),
                "--out",
                str(out_dir),
                "--run-id",
                "b",
                "--cache-dir",
                str(cache_dir),
            ]
        )
        == 0
    )

    cache_files = list(cache_dir.glob("*.json"))
    assert len(cache_files) == 2
