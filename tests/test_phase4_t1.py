"""Acceptance tests for Phase 4 T1 prompt pack setup."""

from __future__ import annotations

from pathlib import Path

from intent_evaluator.llm.prompt_loader import load_prompt_manifest, load_prompt_pack
from intent_evaluator.rubric.load import load_rubric


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "prompts" / "manifest.yaml"
RUBRIC_PATH = ROOT / "rubrics" / "weighted_rubric_v2025_12_01.json"


def test_t1_nine_dimension_yaml_files_exist() -> None:
    manifest = load_prompt_manifest(MANIFEST_PATH)
    assert len(manifest["dimensions"]) == 9
    for item in manifest["dimensions"]:
        file_path = ROOT / item["file"]
        assert file_path.exists()


def test_t1_each_prompt_includes_verbatim_levels_1_to_5_from_d12() -> None:
    rubric = load_rubric(RUBRIC_PATH)
    prompts = load_prompt_pack(MANIFEST_PATH, RUBRIC_PATH)
    assert len(prompts) == 9
    for dimension in rubric.dimensions:
        assert prompts[dimension.id]["rubric_levels"] == dimension.levels


def test_t1_manifest_version_matches_rubric_version() -> None:
    manifest = load_prompt_manifest(MANIFEST_PATH)
    rubric = load_rubric(RUBRIC_PATH)
    assert manifest["version"] == rubric.version
