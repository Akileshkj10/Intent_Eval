"""Prompt pack loading helpers for dimension scoring."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from intent_evaluator.rubric.load import load_rubric


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _default_manifest_path() -> Path:
    return _project_root() / "prompts" / "manifest.yaml"


def _read_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"YAML root must be an object: {path}")
    return payload


def _normalize_level_map(raw_levels: dict[Any, Any]) -> dict[int, str]:
    normalized: dict[int, str] = {}
    for key, value in raw_levels.items():
        normalized[int(key)] = str(value)
    return normalized


def load_prompt_manifest(path: str | Path | None = None) -> dict[str, Any]:
    """Load prompt manifest YAML."""
    manifest_path = Path(path) if path else _default_manifest_path()
    manifest = _read_yaml(manifest_path)
    if "version" not in manifest:
        raise ValueError("Prompt manifest must include version")
    if "dimensions" not in manifest:
        raise ValueError("Prompt manifest must include dimensions")
    return manifest


def load_dimension_prompt(
    dimension_id: str, manifest_path: str | Path | None = None
) -> dict[str, Any]:
    """Load one dimension prompt by id from the manifest."""
    manifest = load_prompt_manifest(manifest_path)
    project_root = _project_root()
    for item in manifest["dimensions"]:
        if item["id"] != dimension_id:
            continue
        path = project_root / item["file"]
        prompt = _read_yaml(path)
        prompt_levels = prompt.get("rubric_levels")
        if not isinstance(prompt_levels, dict):
            raise ValueError(f"Prompt {dimension_id} must include rubric_levels")
        prompt["rubric_levels"] = _normalize_level_map(prompt_levels)
        return prompt
    raise KeyError(f"Unknown dimension id in manifest: {dimension_id}")


def load_prompt_pack(
    manifest_path: str | Path | None = None, rubric_path: str | Path | None = None
) -> dict[str, dict[str, Any]]:
    """Load and validate all dimension prompts against rubric version + levels."""
    manifest = load_prompt_manifest(manifest_path)
    rubric = load_rubric(
        Path(rubric_path)
        if rubric_path
        else _project_root() / "rubrics" / "weighted_rubric_v2025_12_01.json"
    )
    if manifest["version"] != rubric.version:
        raise ValueError(
            f"Manifest version {manifest['version']} does not match rubric {rubric.version}"
        )

    prompts: dict[str, dict[str, Any]] = {}
    rubric_by_id = {dimension.id: dimension for dimension in rubric.dimensions}
    for item in manifest["dimensions"]:
        dimension_id = item["id"]
        prompt = load_dimension_prompt(dimension_id, manifest_path)
        rubric_dimension = rubric_by_id[dimension_id]
        if prompt["rubric_levels"] != rubric_dimension.levels:
            raise ValueError(
                f"Prompt levels for {dimension_id} do not match rubric {rubric.version}"
            )
        prompts[dimension_id] = prompt
    return prompts
