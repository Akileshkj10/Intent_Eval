"""Command-line interface for Intent Evaluator utilities."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from intent_evaluator.eval.run_manifest import (
    append_report_footer,
    build_run_manifest,
    write_run_manifest,
)
from intent_evaluator.eval.structure_lint import lint_report_md
from intent_evaluator.llm.client import LLMClient
from intent_evaluator.narrative.section_generator import generate_full_narrative
from intent_evaluator.parsing.docling_adapter import parse_higher_intent, parse_pptx
from intent_evaluator.parsing.schema import FiveMapDocument, HigherIntentDocument
from intent_evaluator.report.assembler import build_report_skeleton
from intent_evaluator.report.render_markdown import render as render_markdown
from intent_evaluator.report.schema import EvaluationReport
from intent_evaluator.rubric.load import load_rubric
from intent_evaluator.rubric.models import Scorecard
from intent_evaluator.scoring.calculator import (
    interpretation_band,
    section_totals,
    total_weighted_score,
)
from intent_evaluator.scoring.dimension_scorer import score_all_dimensions


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _default_rubric_path() -> Path:
    return _project_root() / "rubrics" / "weighted_rubric_v2025_12_01.json"


def _default_parse_cache_dir() -> Path:
    return _project_root() / "cache" / "parsed"


def _default_model_id() -> str:
    try:
        return LLMClient.from_settings().settings.evaluator_model
    except Exception:
        return "not_configured"


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _load_scorecard(scorecard_path: Path) -> Scorecard:
    with scorecard_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return Scorecard.model_validate(payload)


def _load_5map(path: Path) -> FiveMapDocument:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return FiveMapDocument.model_validate(payload)


def _load_higher_intent(path: Path) -> HigherIntentDocument:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return HigherIntentDocument.model_validate(payload)


def _cmd_score(args: argparse.Namespace) -> int:
    rubric_path = Path(args.rubric) if args.rubric else _default_rubric_path()
    scorecard_path = Path(args.scorecard)
    rubric = load_rubric(rubric_path)
    scorecard = _load_scorecard(scorecard_path)

    sections = section_totals(scorecard, rubric)
    total = total_weighted_score(scorecard, rubric)
    band = interpretation_band(total, rubric)
    output = {
        "scorecard": str(scorecard_path),
        "rubric": str(rubric_path),
        "section_totals": sections,
        "total_weighted_score": total,
        "interpretation_band": band,
    }
    print(json.dumps(output, indent=2))
    return 0


def _cmd_report(args: argparse.Namespace) -> int:
    rubric_path = Path(args.rubric) if args.rubric else _default_rubric_path()
    scorecard_path = Path(args.scorecard)
    map_path = Path(args.map) if args.map else None
    input_path = Path(args.input) if args.input else None
    out_dir = Path(args.out)
    higher_intent_path = Path(args.higher_intent) if args.higher_intent else None

    if bool(map_path) == bool(input_path):
        raise ValueError("Provide exactly one of --map (parsed JSON) or --input (raw map file).")

    rubric = load_rubric(rubric_path)
    scorecard = _load_scorecard(scorecard_path)
    if input_path:
        five_map = parse_pptx(input_path)
        source_map_hash = _file_sha256(input_path)
        map_ref_for_output = input_path
    else:
        assert map_path is not None
        five_map = _load_5map(map_path)
        source_map_hash = _file_sha256(map_path)
        map_ref_for_output = map_path

    higher_intent = None
    if higher_intent_path:
        if higher_intent_path.suffix.lower() == ".json":
            higher_intent = _load_higher_intent(higher_intent_path)
        else:
            higher_intent = parse_higher_intent(higher_intent_path)

    report = build_report_skeleton(
        scorecard=scorecard,
        rubric=rubric,
        five_map_document=five_map,
        higher_intent_document=higher_intent,
    )
    # In parse-integrated mode, report metadata must reflect parsed map metadata.
    report = report.model_copy(update={"map_title": five_map.map_title})
    markdown = render_markdown(report)

    out_dir.mkdir(parents=True, exist_ok=True)
    report_json_path = out_dir / "report.json"
    report_md_path = out_dir / "report.md"
    parsed_json_path = out_dir / "parsed.json"

    with parsed_json_path.open("w", encoding="utf-8") as handle:
        json.dump(five_map.model_dump(mode="json"), handle, indent=2)
        handle.write("\n")

    report_payload = report.model_dump(mode="json")
    report_payload["source_map_hash"] = source_map_hash
    with report_json_path.open("w", encoding="utf-8") as handle:
        json.dump(report_payload, handle, indent=2)
        handle.write("\n")
    report_md_path.write_text(markdown, encoding="utf-8")

    run_manifest = build_run_manifest(
        run_id=scorecard.run_id or "report_run",
        rubric_version=rubric.version,
        model_id=_default_model_id(),
        input_sha256=source_map_hash,
        output_dir=out_dir,
    )
    manifest_path = write_run_manifest(out_dir, run_manifest)
    append_report_footer(report_md_path, run_manifest)

    # Validate output against schema model explicitly.
    with report_json_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    EvaluationReport.model_validate(payload)

    print(
        json.dumps(
            {
                "scorecard": str(scorecard_path),
                "map": str(map_ref_for_output),
                "source_map_hash": source_map_hash,
                "rubric": str(rubric_path),
                "out_dir": str(out_dir),
                "parsed_json": str(parsed_json_path),
                "report_json": str(report_json_path),
                "report_md": str(report_md_path),
                "run_manifest": str(manifest_path),
                "total_weighted_score": report.total_weighted_score_table.total_weighted_score,
            },
            indent=2,
        )
    )
    return 0


def _cmd_parse(args: argparse.Namespace) -> int:
    input_path = Path(args.input)
    higher_intent_path = Path(args.higher_intent) if args.higher_intent else None
    out_dir = Path(args.out)
    cache_dir = Path(args.cache_dir) if args.cache_dir else _default_parse_cache_dir()
    cache_dir.mkdir(parents=True, exist_ok=True)
    source_hash = _file_sha256(input_path)
    cache_path = cache_dir / f"{source_hash}.json"

    cache_hit = False
    if cache_path.exists():
        cache_hit = True
        print(f"cache hit: {cache_path}")
        parsed = _load_5map(cache_path)
    else:
        parsed = parse_pptx(input_path)
        with cache_path.open("w", encoding="utf-8") as handle:
            json.dump(parsed.model_dump(mode="json"), handle, indent=2)
            handle.write("\n")

    run_id = args.run_id or f"parse_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    run_dir = out_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    parsed_json_path = run_dir / "parsed.json"
    combined_json_path = run_dir / "combined.json"
    higher_intent_json_path = run_dir / "higher_intent.json"

    with parsed_json_path.open("w", encoding="utf-8") as handle:
        json.dump(parsed.model_dump(mode="json"), handle, indent=2)
        handle.write("\n")

    higher_intent = None
    if higher_intent_path:
        higher_intent = parse_higher_intent(higher_intent_path)
        with higher_intent_json_path.open("w", encoding="utf-8") as handle:
            json.dump(higher_intent.model_dump(mode="json"), handle, indent=2)
            handle.write("\n")

    combined_payload = {
        "five_map_document": parsed.model_dump(mode="json"),
        "higher_intent_document": (
            higher_intent.model_dump(mode="json") if higher_intent else None
        ),
    }
    with combined_json_path.open("w", encoding="utf-8") as handle:
        json.dump(combined_payload, handle, indent=2)
        handle.write("\n")

    if parsed.low_confidence_sections:
        print("WARNING: low_confidence_sections=true", file=sys.stderr)

    print(
        json.dumps(
            {
                "input": str(input_path),
                "source_map_hash": source_hash,
                "cache_path": str(cache_path),
                "cache_hit": cache_hit,
                "run_id": run_id,
                "out_dir": str(run_dir),
                "parsed_json": str(parsed_json_path),
                "combined_json": str(combined_json_path),
                "higher_intent_json": (
                    str(higher_intent_json_path) if higher_intent_path else None
                ),
                "slide_count": len(parsed.slides),
                "low_confidence_sections": parsed.low_confidence_sections,
            },
            indent=2,
        )
    )
    return 0


def _cmd_evaluate(args: argparse.Namespace) -> int:
    if not args.llm:
        raise ValueError("Pass --llm to run LLM scoring in evaluate command.")

    input_path = Path(args.input)
    out_dir = Path(args.out)
    run_id = args.run_id or f"eval_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    run_dir = out_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    rubric_path = Path(args.rubric) if args.rubric else _default_rubric_path()
    rubric = load_rubric(rubric_path)
    five_map = parse_pptx(input_path)
    higher_intent = (
        parse_higher_intent(Path(args.higher_intent)) if args.higher_intent else None
    )
    llm_client = LLMClient.from_settings(outputs_root=out_dir)

    scorecard = score_all_dimensions(
        map_doc=five_map,
        higher_intent=higher_intent,
        rubric=rubric,
        llm_client=llm_client,
        run_id=run_id,
    )

    parsed_json_path = run_dir / "parsed.json"
    with parsed_json_path.open("w", encoding="utf-8") as handle:
        json.dump(five_map.model_dump(mode="json"), handle, indent=2)
        handle.write("\n")

    if higher_intent:
        higher_intent_path = run_dir / "higher_intent.json"
        with higher_intent_path.open("w", encoding="utf-8") as handle:
            json.dump(higher_intent.model_dump(mode="json"), handle, indent=2)
            handle.write("\n")

    scorecard_json_path = run_dir / "scorecard.json"
    with scorecard_json_path.open("w", encoding="utf-8") as handle:
        json.dump(scorecard.model_dump(mode="json"), handle, indent=2)
        handle.write("\n")

    report_skeleton = build_report_skeleton(
        scorecard=scorecard,
        rubric=rubric,
        five_map_document=five_map,
        higher_intent_document=higher_intent,
    )
    report = generate_full_narrative(
        report_skeleton=report_skeleton,
        llm_client=llm_client,
        run_id=run_id,
        enable_question_subscores=args.enable_question_subscores,
    )
    report_md = render_markdown(report)
    report_json_path = run_dir / "report.json"
    report_md_path = run_dir / "report.md"
    report_payload = report.model_dump(mode="json")
    report_payload["source_map_hash"] = _file_sha256(input_path)
    with report_json_path.open("w", encoding="utf-8") as handle:
        json.dump(report_payload, handle, indent=2)
        handle.write("\n")
    report_md_path.write_text(report_md, encoding="utf-8")
    run_manifest = build_run_manifest(
        run_id=run_id,
        rubric_version=rubric.version,
        model_id=llm_client.settings.evaluator_model,
        input_sha256=_file_sha256(input_path),
        output_dir=run_dir,
    )
    manifest_path = write_run_manifest(run_dir, run_manifest)
    append_report_footer(report_md_path, run_manifest)
    EvaluationReport.model_validate(report_payload)

    lint_result = None
    if args.lint:
        lint_result = lint_report_md(report_md_path)
        if not lint_result.passed:
            print(
                json.dumps(
                    {
                        "run_id": run_id,
                        "lint_passed": False,
                        "missing_items": lint_result.missing_items,
                    },
                    indent=2,
                ),
                file=sys.stderr,
            )
            return 1

    sections = section_totals(scorecard, rubric)
    total = total_weighted_score(scorecard, rubric)
    band = interpretation_band(total, rubric)
    print(
        json.dumps(
            {
                "run_id": run_id,
                "input": str(input_path),
                "out_dir": str(run_dir),
                "scorecard_json": str(scorecard_json_path),
                "report_json": str(report_json_path),
                "report_md": str(report_md_path),
                "parsed_json": str(parsed_json_path),
                "run_manifest": str(manifest_path),
                "total_weighted_score": total,
                "section_totals": sections,
                "interpretation_band": band,
                "lint_passed": lint_result.passed if lint_result else None,
            },
            indent=2,
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="intent_evaluator",
        description="Intent Evaluator command-line tools",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    score_parser = subparsers.add_parser(
        "score",
        help="Compute weighted totals from a scorecard JSON file",
    )
    score_parser.add_argument(
        "--scorecard",
        required=True,
        help="Path to scorecard JSON (e.g. fixtures/gold_simplification_scorecard.json)",
    )
    score_parser.add_argument(
        "--rubric",
        required=False,
        help="Optional rubric JSON path (defaults to weighted_rubric_v2025_12_01.json)",
    )
    score_parser.set_defaults(func=_cmd_score)

    report_parser = subparsers.add_parser(
        "report",
        help="Build report skeleton from scorecard and parsed map fixture",
    )
    report_parser.add_argument("--scorecard", required=True, help="Path to scorecard JSON")
    report_parser.add_argument(
        "--map",
        required=False,
        help="Path to parsed 5MAP JSON fixture",
    )
    report_parser.add_argument(
        "--input",
        required=False,
        help="Path to raw 5MAP input (.pptx primary, synthetic .json allowed during bootstrap)",
    )
    report_parser.add_argument(
        "--higher-intent",
        required=False,
        help="Optional path to parsed higher intent JSON fixture",
    )
    report_parser.add_argument(
        "--out",
        required=True,
        help="Output directory for report files",
    )
    report_parser.add_argument(
        "--rubric",
        required=False,
        help="Optional rubric JSON path (defaults to weighted_rubric_v2025_12_01.json)",
    )
    report_parser.set_defaults(func=_cmd_report)

    parse_parser = subparsers.add_parser(
        "parse",
        help="Parse a 5MAP PPTX into FiveMapDocument JSON",
    )
    parse_parser.add_argument(
        "--input",
        required=True,
        help="Path to 5MAP .pptx (or synthetic parsed .json during bootstrap)",
    )
    parse_parser.add_argument(
        "--out",
        required=True,
        help="Base output directory where outputs/{run_id}/parsed.json is written",
    )
    parse_parser.add_argument(
        "--run-id",
        required=False,
        help="Optional run ID (defaults to UTC timestamp-based ID)",
    )
    parse_parser.add_argument(
        "--cache-dir",
        required=False,
        help="Optional parse cache directory (defaults to cache/parsed)",
    )
    parse_parser.add_argument(
        "--higher-intent",
        required=False,
        help="Optional higher-intent .pptx or parsed .json to include in combined parse output",
    )
    parse_parser.set_defaults(func=_cmd_parse)

    evaluate_parser = subparsers.add_parser(
        "evaluate",
        help="Run parse + LLM scoring for all dimensions",
    )
    evaluate_parser.add_argument(
        "--input",
        required=True,
        help="Path to 5MAP input (.pptx primary; synthetic .json supported during bootstrap)",
    )
    evaluate_parser.add_argument(
        "--out",
        required=True,
        help="Base output directory where outputs/{run_id}/scorecard.json is written",
    )
    evaluate_parser.add_argument(
        "--higher-intent",
        required=False,
        help="Optional higher-intent document path (.pptx or parsed .json)",
    )
    evaluate_parser.add_argument(
        "--rubric",
        required=False,
        help="Optional rubric JSON path (defaults to weighted_rubric_v2025_12_01.json)",
    )
    evaluate_parser.add_argument(
        "--run-id",
        required=False,
        help="Optional run ID (defaults to UTC timestamp-based ID)",
    )
    evaluate_parser.add_argument(
        "--llm",
        action="store_true",
        help="Required safety flag acknowledging live LLM scoring call",
    )
    evaluate_parser.add_argument(
        "--enable-question-subscores",
        action="store_true",
        help="Enable optional per-question subscores in commentary (excluded from weighted total)",
    )
    evaluate_parser.add_argument(
        "--lint",
        action="store_true",
        help="Run markdown structure lint against eval/checklist.yaml after report generation",
    )
    evaluate_parser.set_defaults(func=_cmd_evaluate)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except Exception as exc:  # pragma: no cover - validated in CLI behavior tests
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

