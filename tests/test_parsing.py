"""Acceptance tests for Phase 3 T5 parsing coverage."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from intent_evaluator.parsing.docling_adapter import parse_pptx
from intent_evaluator.parsing.schema import FiveMapDocument


ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_MAP_PATH = ROOT / "fixtures" / "synthetic_5map_parsed.json"
SAMPLE_BLANK_PPTX_PATH = ROOT / "fixtures" / "sample_blank.pptx"
CLIENT_FIXTURES_DIR = ROOT / "tests" / "fixtures_client"


def load_json_fixture(path: Path) -> FiveMapDocument:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return FiveMapDocument.model_validate(payload)


def test_t5_synthetic_fixture_q_sections_non_empty() -> None:
    doc = load_json_fixture(SYNTHETIC_MAP_PATH)
    assert doc.sections.q1_context.strip()
    assert doc.sections.q2_intent.strip()
    assert doc.sections.q3_tasks.strip()
    assert doc.sections.q4_boundaries.strip()
    assert doc.sections.q5_backbrief.strip()


@pytest.mark.skipif(
    not SAMPLE_BLANK_PPTX_PATH.exists(),
    reason="fixtures/sample_blank.pptx missing; D15 follow-up pending",
)
def test_t5_parse_minimal_blank_template_if_present() -> None:
    parsed = parse_pptx(SAMPLE_BLANK_PPTX_PATH)
    assert parsed.map_title
    assert len(parsed.slides) >= 1


@pytest.mark.integration
@pytest.mark.skipif(
    not CLIENT_FIXTURES_DIR.exists(),
    reason="tests/fixtures_client not provided in workspace",
)
def test_t5_integration_scaffold_real_client_fixture_if_present() -> None:
    candidates = sorted(CLIENT_FIXTURES_DIR.glob("*.pptx"))
    if not candidates:
        pytest.skip("No client pptx in tests/fixtures_client")
    parsed = parse_pptx(candidates[0])
    assert parsed.source_filename.endswith(".pptx")
