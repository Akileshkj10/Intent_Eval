"""Acceptance tests for Phase 6 task T3 Streamlit demo pipeline."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.pipeline import create_session_output_dir, outputs_root, run_ui_pipeline, save_uploaded_bytes


ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"


def test_t3_pipeline_generates_downloadable_report_from_synthetic_json(tmp_path: Path) -> None:
    session_dir = tmp_path / "outputs" / "session_a"
    session_dir.mkdir(parents=True, exist_ok=True)
    map_path = session_dir / "synthetic_5map_parsed.json"
    map_path.write_bytes(SYNTHETIC_MAP_PATH.read_bytes())

    # monkeypatch output root by creating session under real outputs path for safety check
    real_session = outputs_root() / "test_t3_session"
    real_session.mkdir(parents=True, exist_ok=True)
    real_map = real_session / "synthetic_5map_parsed.json"
    real_map.write_bytes(SYNTHETIC_MAP_PATH.read_bytes())

    result = run_ui_pipeline(map_path=real_map, session_dir=real_session, use_llm=False)
    assert result["report_md_path"].exists()
    assert result["report_json_path"].exists()
    assert result["parsed_json_path"].exists()


def test_t3_no_files_outside_outputs_session_folder() -> None:
    session_dir = create_session_output_dir("test_t3_guard")
    outside_path = ROOT / "fixtures" / "synthetic_5map_parsed.json"
    with pytest.raises(RuntimeError):
        run_ui_pipeline(map_path=outside_path, session_dir=session_dir, use_llm=False)
