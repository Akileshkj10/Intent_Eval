"""Run manifest helpers for reproducibility and audit footer."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def prompt_manifest_components(project_root: Path | None = None) -> list[dict[str, str]]:
    """Return prompt manifest component hashes for all dimension prompts."""
    root = project_root or _project_root()
    manifest_path = root / "prompts" / "manifest.yaml"
    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = yaml.safe_load(handle)

    components: list[dict[str, str]] = [
        {
            "id": "__manifest__",
            "file": "prompts/manifest.yaml",
            "sha256": _sha256_file(manifest_path),
        }
    ]
    for item in manifest["dimensions"]:
        rel_file = item["file"]
        path = root / rel_file
        components.append(
            {
                "id": item["id"],
                "file": rel_file,
                "sha256": _sha256_file(path),
            }
        )
    return components


def prompt_manifest_hash(components: list[dict[str, str]]) -> str:
    """Deterministic hash over prompt manifest components."""
    canonical = json.dumps(components, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return _sha256_bytes(canonical)


def build_run_manifest(
    run_id: str,
    rubric_version: str,
    model_id: str,
    input_sha256: str,
    output_dir: Path,
    project_root: Path | None = None,
) -> dict[str, Any]:
    """Build manifest payload containing reproducibility metadata."""
    components = prompt_manifest_components(project_root=project_root)
    return {
        "run_id": run_id,
        "rubric_version": rubric_version,
        "model_id": model_id,
        "input_sha256": input_sha256,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "prompt_manifest_hash": prompt_manifest_hash(components),
        "prompt_versions": components,
        "output_dir": str(output_dir),
    }


def write_run_manifest(output_dir: Path, payload: dict[str, Any]) -> Path:
    """Write run_manifest.json beside other run artefacts."""
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "run_manifest.json"
    with manifest_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    return manifest_path


def append_report_footer(report_md_path: Path, manifest: dict[str, Any]) -> None:
    """Append reproducibility footer metadata to report markdown."""
    footer = [
        "",
        "---",
        "",
        "## Reproducibility metadata",
        f"- rubric_version: `{manifest['rubric_version']}`",
        f"- model_id: `{manifest['model_id']}`",
        f"- prompt_manifest_hash: `{manifest['prompt_manifest_hash']}`",
        f"- input_sha256: `{manifest['input_sha256']}`",
        f"- timestamp_utc: `{manifest['timestamp_utc']}`",
        "",
    ]
    content = report_md_path.read_text(encoding="utf-8").rstrip() + "\n" + "\n".join(footer)
    report_md_path.write_text(content, encoding="utf-8")
