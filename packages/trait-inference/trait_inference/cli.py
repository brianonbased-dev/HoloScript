"""trait-inference CLI — argparse runner.

Subcommands:
  trait-inference extract-traits   — run scripts/extract_trait_constants.py wrapped
  trait-inference smoke            — generate synthetic dataset + run keyword baseline + emit measurement
  trait-inference dataset audit    — run audit() against a JSONL dataset
  trait-inference dataset split    — emit train/val/indist/novel split files
  trait-inference baseline run     — fit + evaluate a named baseline against a dataset
  trait-inference eval headline    — compute headline measurement bundle (model + baseline preds)

Output: structured JSON to stdout OR to --output path.

CLI is the thin layer over trait_inference.{dataset,baselines,metrics}.
Heavy ML deps (torch, transformers) imported only by `model run` /
`train` subcommands which require the [model] extra.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from trait_inference.dataset import (
    Pair,
    Source,
    Split,
    audit,
    generate_smoke_dataset,
    load_jsonl,
    make_splits,
    write_jsonl,
)


def _emit(payload: dict, output: Path | None) -> None:
    """Emit JSON to stdout or output file."""
    text = json.dumps(payload, indent=2, sort_keys=False, default=str)
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text + "\n", encoding="utf-8")
        print(f"Wrote {output}", file=sys.stderr)
    else:
        print(text)


# ----------------------------------------------------------------------------
# extract-traits
# ----------------------------------------------------------------------------

def cmd_extract_traits(args: argparse.Namespace) -> int:
    from scripts.extract_trait_constants import main as extract_main
    return extract_main([
        "--constants-dir", str(args.constants_dir),
        "--output", str(args.output),
        *(["--verbose"] if args.verbose else []),
    ])


# ----------------------------------------------------------------------------
# smoke — end-to-end pipeline test
# ----------------------------------------------------------------------------

def cmd_smoke(args: argparse.Namespace) -> int:
    """Generate synthetic dataset, run keyword baseline, emit measurement.

    Exits 0 on full pipeline success, 1 on any failure. Used for CI smoke
    test + on-instance Vast.ai pipeline validation BEFORE expensive
    training runs.
    """
    from trait_inference.baselines import KeywordBaseline
    from trait_inference.metrics import bootstrap_ci, exact_match_rate, f1_macro

    # Use minimal label space for synthetic data
    label_space = ["physics", "grabbable", "collidable", "rigid", "kinematic", "softBody"]

    print(f"[smoke] Generating synthetic dataset (n={args.n})...", file=sys.stderr)
    pairs = generate_smoke_dataset(label_space, n=args.n, seed=args.seed)

    print(f"[smoke] Auditing...", file=sys.stderr)
    splits = make_splits(pairs, seed=args.seed)
    audit_report = audit(pairs, splits)

    print(f"[smoke] Fitting keyword baseline...", file=sys.stderr)
    baseline = KeywordBaseline(label_space=tuple(label_space))
    baseline.fit(splits[Split.TRAIN])

    print(f"[smoke] Predicting on novel split (n={len(splits[Split.HELD_OUT_NOVEL])})...", file=sys.stderr)
    novel = splits[Split.HELD_OUT_NOVEL]
    if not novel:
        # Smoke datasets too small to generate novel split; fall back to indist
        novel = splits[Split.HELD_OUT_INDIST]
    descriptions = [p.description for p in novel]
    gold = [list(p.trait_set) for p in novel]
    preds = baseline.predict_batch(descriptions)

    print(f"[smoke] Computing metrics + bootstrap CI...", file=sys.stderr)
    f1m = f1_macro(gold, preds, label_space=label_space)
    em = exact_match_rate(gold, preds)
    ci = bootstrap_ci(gold, preds, metric="f1_macro", b=args.bootstrap_b,
                      seed=args.seed, label_space=label_space)

    payload = {
        "smoke_test": True,
        "passed": True,
        "n_pairs": len(pairs),
        "splits": {s.value: len(p) for s, p in splits.items()},
        "audit_passes": audit_report.passes,  # expected False on smoke (size)
        "audit_issues": audit_report.issues,
        "baseline": {
            "name": baseline.name,
            "f1_macro": f1m,
            "exact_match": em,
            "bootstrap_ci": ci.to_dict(),
        },
        "smoke_completed_at": datetime.now(timezone.utc).isoformat(),
    }
    _emit(payload, args.output)
    print(f"[smoke] PASSED — pipeline ran end-to-end. F1 macro={f1m:.3f}", file=sys.stderr)
    return 0


# ----------------------------------------------------------------------------
# dataset audit / split
# ----------------------------------------------------------------------------

def cmd_dataset_audit(args: argparse.Namespace) -> int:
    pairs = load_jsonl(args.input)
    report = audit(pairs)
    _emit(report.to_dict(), args.output)
    return 0 if report.passes else 1


def cmd_dataset_split(args: argparse.Namespace) -> int:
    pairs = load_jsonl(args.input)
    splits = make_splits(pairs, seed=args.seed)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    summary: dict[str, int] = {}
    for split, split_pairs in splits.items():
        path = out_dir / f"{split.value}.jsonl"
        n = write_jsonl(path, split_pairs)
        summary[split.value] = n
    summary["seed"] = args.seed
    summary["written_at"] = datetime.now(timezone.utc).isoformat()
    _emit(summary, args.output)
    return 0


# ----------------------------------------------------------------------------
# baseline run
# ----------------------------------------------------------------------------

def cmd_baseline_run(args: argparse.Namespace) -> int:
    from trait_inference.baselines import (
        BrittneyFewShotBaseline,
        KeywordBaseline,
        TfidfLogregBaseline,
    )
    from trait_inference.metrics import bootstrap_ci, exact_match_rate, f1_macro

    train_pairs = load_jsonl(args.train)
    eval_pairs = load_jsonl(args.eval)

    label_space: list[str] = sorted({t for p in train_pairs for t in p.trait_set})

    if args.name == "keyword":
        baseline = KeywordBaseline(label_space=tuple(label_space))
    elif args.name == "tfidf":
        baseline = TfidfLogregBaseline(threshold=args.tfidf_threshold)
    elif args.name == "brittney":
        baseline = BrittneyFewShotBaseline(k_shots=args.brittney_k)
    else:
        print(f"unknown baseline: {args.name}", file=sys.stderr)
        return 1

    baseline.fit(train_pairs)

    if args.name == "tfidf" and args.tune_threshold:
        # Optional threshold tuning on a separate validation file
        if args.val:
            val_pairs = load_jsonl(args.val)
            best = baseline.tune_threshold(val_pairs)  # type: ignore[attr-defined]
            print(f"[baseline-run] tfidf tuned threshold = {best:.3f}", file=sys.stderr)

    descriptions = [p.description for p in eval_pairs]
    gold = [list(p.trait_set) for p in eval_pairs]
    preds = baseline.predict_batch(descriptions)

    f1m = f1_macro(gold, preds, label_space=label_space)
    em = exact_match_rate(gold, preds)
    ci = bootstrap_ci(gold, preds, metric="f1_macro",
                      b=args.bootstrap_b, seed=args.seed,
                      label_space=label_space)

    payload = {
        "baseline_name": baseline.name,
        "train_size": len(train_pairs),
        "eval_size": len(eval_pairs),
        "label_space_size": len(label_space),
        "f1_macro": f1m,
        "exact_match": em,
        "bootstrap_ci": ci.to_dict(),
        "predictions_sample": [
            {"id": p.id, "gold": list(p.trait_set), "pred": preds[i]}
            for i, p in enumerate(eval_pairs[:5])
        ],
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
    }
    _emit(payload, args.output)
    return 0


# ----------------------------------------------------------------------------
# parser construction
# ----------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="trait-inference",
        description="Paper 19 (ATI) — training pipeline + baselines + eval",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    # extract-traits
    et = sub.add_parser("extract-traits", help="Extract trait label space from TS constants")
    et.add_argument("--constants-dir", type=Path, required=True)
    et.add_argument("--output", type=Path, required=True)
    et.add_argument("--verbose", "-v", action="store_true")
    et.set_defaults(func=cmd_extract_traits)

    # smoke
    sm = sub.add_parser("smoke", help="End-to-end pipeline smoke test (synthetic data)")
    sm.add_argument("--n", type=int, default=100)
    sm.add_argument("--seed", type=int, default=42)
    sm.add_argument("--bootstrap-b", type=int, default=200)
    sm.add_argument("--output", type=Path, default=None)
    sm.set_defaults(func=cmd_smoke)

    # dataset
    ds = sub.add_parser("dataset", help="Dataset operations").add_subparsers(dest="ds_cmd", required=True)

    ds_audit = ds.add_parser("audit", help="Audit a JSONL dataset against spec §1.4")
    ds_audit.add_argument("input", type=Path)
    ds_audit.add_argument("--output", type=Path, default=None)
    ds_audit.set_defaults(func=cmd_dataset_audit)

    ds_split = ds.add_parser("split", help="Generate train/val/indist/novel split files")
    ds_split.add_argument("input", type=Path)
    ds_split.add_argument("--output-dir", type=Path, required=True)
    ds_split.add_argument("--seed", type=int, default=42)
    ds_split.add_argument("--output", type=Path, default=None,
                          help="Summary JSON output (separate from split files)")
    ds_split.set_defaults(func=cmd_dataset_split)

    # baseline
    bl = sub.add_parser("baseline", help="Baseline operations").add_subparsers(dest="bl_cmd", required=True)
    bl_run = bl.add_parser("run", help="Fit + evaluate a baseline")
    bl_run.add_argument("name", choices=["keyword", "tfidf", "brittney"])
    bl_run.add_argument("--train", type=Path, required=True)
    bl_run.add_argument("--eval", type=Path, required=True)
    bl_run.add_argument("--val", type=Path, default=None)
    bl_run.add_argument("--output", type=Path, default=None)
    bl_run.add_argument("--bootstrap-b", type=int, default=1000)
    bl_run.add_argument("--seed", type=int, default=42)
    bl_run.add_argument("--tfidf-threshold", type=float, default=0.5)
    bl_run.add_argument("--tune-threshold", action="store_true",
                        help="Tune tfidf threshold on --val split")
    bl_run.add_argument("--brittney-k", type=int, default=8)
    bl_run.set_defaults(func=cmd_baseline_run)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "func"):
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
