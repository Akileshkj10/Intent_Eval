"""Build reference/manifest.yaml with SHA256 hashes for D1-D7."""

from __future__ import annotations

import hashlib
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
REF_DIR = ROOT / "OneDrive_1_5-21-2026"

ENTRIES = [
    ("D1", "SINGLE CANONICAL SOURCE FOR THE INTENT WIZARD AGENT.docx", "Authoritative prompt, weighted rubric, 14-section report"),
    ("D2", "Organisational Intent Statement Rubric 01 Dec 25.docx", "1-5 descriptors per dimension (calibration)"),
    ("D3", "Intent Quality Criteria 01 Dec 25.pdf", "Nine internal quality criteria"),
    ("D4", "5MAP Coaching Guide Release 5.0.pdf", "Q1-Q5 coaching and checklist"),
    ("D5", "Generic Briefing Notes for Intent Statements Sep 2022.pdf", "Client-facing intent education"),
    ("D6", "Agent Builder's instructions.docx", "Copilot agent tone and workflow"),
    ("D7", "5MAP Agent Report Template.docx", "Deferred Word layout reference"),
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    documents = []
    for doc_id, fname, desc in ENTRIES:
        path = REF_DIR / fname
        extracted = None
        if fname.endswith(".docx"):
            ext_path = REF_DIR / fname.replace(".docx", "_extracted.txt")
            if ext_path.exists():
                extracted = str(ext_path.relative_to(ROOT)).replace("\\", "/")
        documents.append(
            {
                "id": doc_id,
                "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                "description": desc,
                "sha256": sha256_file(path) if path.exists() else None,
                "extracted_text": extracted,
            }
        )
    manifest = {
        "version": "2025-12-01",
        "policy": "Keep originals in OneDrive_1_5-21-2026; do not duplicate PDFs in repo",
        "documents": documents,
    }
    out = ROOT / "reference" / "manifest.yaml"
    out.parent.mkdir(exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        yaml.dump(manifest, handle, sort_keys=False, allow_unicode=True)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
