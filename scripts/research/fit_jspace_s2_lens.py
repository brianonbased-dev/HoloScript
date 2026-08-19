#!/usr/bin/env python3
"""Fit one preregistered J-space S2 endpoint local-Taylor lens.

The command is intentionally lane-local: one invocation consumes either the
sealed A or B calibration corpus and emits one lens plus a provenance receipt.
It never accepts a label file or semantic outcome field.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from collections import Counter
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import time
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
HOLOSERVE_ROOT = REPO_ROOT / "packages" / "holoserve-py"
if str(HOLOSERVE_ROOT) not in sys.path:
    sys.path.insert(0, str(HOLOSERVE_ROOT))

import torch  # noqa: E402

from holoserve.model import GPT  # noqa: E402
from holoserve.tokenizer import encode_text  # noqa: E402
from holoserve.workspace_eval import FORBIDDEN_PROMPT_FIELDS  # noqa: E402
from holoserve.workspace_probe import (  # noqa: E402
    JACOBIAN_LENS_ESTIMATOR_V3,
    JACOBIAN_LENS_V3_TRANSPORT_PROFILE,
    fit_endpoint_local_taylor_jacobian_lens_v1,
    load_jacobian_lens_artifact,
    save_jacobian_lens_artifact,
    sha256_file,
    sha256_json,
)


FIT_RECEIPT_SCHEMA = "holoscript.jspace-s2-fit-receipt.v0.1.0"
FROZEN_LAYERS = [2, 5, 8]
FROZEN_POSITION_BINS = [[0, 127], [128, 255], [256, 383], [384, 511]]
FROZEN_DIM_BATCH = 8
FROZEN_MAX_SEQ_LEN = 512


def _sha256_text(value: str) -> str:
    return f"sha256:{hashlib.sha256(value.encode('utf-8')).hexdigest()}"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain one JSON object")
    return value


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{line_number} must contain one JSON object")
        rows.append(value)
    if not rows:
        raise ValueError(f"{path} is empty")
    return rows


def _write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    handle, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _git_revision() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    revision = result.stdout.strip()
    if len(revision) != 40 or any(character not in "0123456789abcdef" for character in revision):
        raise ValueError("fit receipt requires an exact Git revision")
    return revision


def _load_model(checkpoint_path: Path, bins_dir: Path, device: str) -> tuple[GPT, dict[str, Any]]:
    meta = _read_json(bins_dir / "meta.json")
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=True)
    if not isinstance(checkpoint, dict) or not isinstance(checkpoint.get("model"), dict):
        raise ValueError("checkpoint must contain a model state dictionary")
    config = checkpoint.get("config", {})
    if not isinstance(config, dict):
        raise ValueError("checkpoint config must be an object")
    structural_type_count = int(
        checkpoint.get("structural_type_count", config.get("structural_type_count", 0)) or 0
    )
    model_config = {
        "vocabSize": int(checkpoint.get("vocab_size") or meta["vocab_size"]),
        "nLayer": int(config.get("n_layer", 4)),
        "nHead": int(config.get("n_head", 4)),
        "nEmbd": int(config.get("n_embd", 128)),
        "blockSize": int(config.get("block_size", 128)),
        "dropoutE8": round(float(config.get("dropout", 0.0)) * 100_000_000),
        "structuralTypeCount": structural_type_count,
        "iteration": int(checkpoint.get("iter", -1)),
    }
    if model_config["blockSize"] != FROZEN_MAX_SEQ_LEN:
        raise ValueError(
            f"checkpoint block size {model_config['blockSize']} does not match the frozen S2 limit"
        )
    model = GPT(
        model_config["vocabSize"],
        model_config["nLayer"],
        model_config["nHead"],
        model_config["nEmbd"],
        model_config["blockSize"],
        model_config["dropoutE8"] / 100_000_000,
        structural_type_count,
    ).to(device)
    model.load_state_dict(checkpoint["model"])
    model.eval()
    return model, model_config


def _validate_inputs(args: argparse.Namespace) -> tuple[
    list[torch.Tensor], dict[str, Any], dict[str, Any], dict[str, Any]
]:
    checkpoint_path = Path(args.checkpoint).resolve()
    bins_dir = Path(args.bins).resolve()
    corpus_path = Path(args.corpus).resolve()
    manifest_path = Path(args.corpus_manifest).resolve()
    preregistration_path = Path(args.preregistration).resolve()
    for path in (
        checkpoint_path,
        bins_dir / "tokenizer.json",
        bins_dir / "meta.json",
        corpus_path,
        manifest_path,
        preregistration_path,
    ):
        if not path.is_file():
            raise FileNotFoundError(path)

    manifest = _read_json(manifest_path)
    expected_group = "pilotArtifacts" if args.stage == "pilot" else "splitArtifacts"
    artifacts = manifest.get(expected_group)
    expected = artifacts.get(args.lane) if isinstance(artifacts, dict) else None
    if (
        manifest.get("schema") != "holoscript.jspace-s2-corpus-manifest.v0.1.0"
        or manifest.get("selfHash") != sha256_json({**manifest, "selfHash": None})
        or manifest.get("semanticLabelsAccessed") is not False
        or manifest.get("positionBins") != FROZEN_POSITION_BINS
        or manifest.get("checkpointSha256") != sha256_file(checkpoint_path)
        or manifest.get("tokenizerSha256") != sha256_file(bins_dir / "tokenizer.json")
        or manifest.get("preregistrationSha256") != sha256_file(preregistration_path)
        or not isinstance(expected, dict)
        or expected.get("sha256") != sha256_file(corpus_path)
    ):
        raise ValueError("fit inputs do not match the sealed S2 corpus manifest")

    tokenizer = _read_json(bins_dir / "tokenizer.json")
    merges = tokenizer.get("merges")
    if not isinstance(merges, list):
        raise ValueError("tokenizer merges are missing")
    merge_id = {merge[2]: index for index, merge in enumerate(merges)}
    rows = _read_jsonl(corpus_path)
    if expected.get("rowCount") != len(rows):
        raise ValueError("corpus row count does not match the sealed manifest")

    batches = []
    case_ids = set()
    endpoint_profiles = Counter()
    for index, row in enumerate(rows):
        forbidden = sorted(FORBIDDEN_PROMPT_FIELDS.intersection(row))
        prompt = row.get("prompt")
        case_id = row.get("caseId")
        if forbidden:
            raise ValueError(f"corpus row {index} exposes semantic fields: {forbidden}")
        if (
            row.get("lane") != args.lane
            or row.get("truncated") is not False
            or not isinstance(prompt, str)
            or not prompt
            or not isinstance(case_id, str)
            or not case_id
            or case_id in case_ids
        ):
            raise ValueError(f"corpus row {index} has invalid lane, prompt, or identity fields")
        endpoint_key = f"{row.get('taskForm')}:{row.get('variant')}"
        endpoint = manifest.get("endpointContexts", {}).get(endpoint_key)
        if (
            not isinstance(endpoint, dict)
            or row.get("endpointProfile") != endpoint.get("profile")
            or row.get("endpointTextSha256")
            != _sha256_text(str(endpoint.get("terminalText", "")))
            or not prompt.endswith(f"\n\n{endpoint.get('terminalText')}")
            or prompt.endswith(("\n", " "))
        ):
            raise ValueError(f"corpus row {index} does not match its frozen endpoint context")
        endpoint_profiles[row["endpointProfile"]] += 1
        tokens = [1, *encode_text(prompt, merges, merge_id)]
        token_hash = sha256_json(tokens)
        if (
            len(tokens) > FROZEN_MAX_SEQ_LEN
            or row.get("tokenCount") != len(tokens)
            or row.get("tokenIdsSha256") != token_hash
            or row.get("sequenceSha256") != token_hash
        ):
            raise ValueError(f"corpus row {index} tokenization does not match its commitment")
        endpoint = len(tokens) - 1
        declared_bin = row.get("positionBin")
        if (
            declared_bin not in FROZEN_POSITION_BINS
            or not declared_bin[0] <= endpoint <= declared_bin[1]
        ):
            raise ValueError(f"corpus row {index} endpoint is outside its declared position bin")
        case_ids.add(case_id)
        batches.append(torch.tensor([tokens], dtype=torch.long))

    expected_per_profile = 3 if args.stage == "pilot" else 24
    if (
        set(endpoint_profiles) != {
            value["profile"] for value in manifest["endpointContexts"].values()
        }
        or set(endpoint_profiles.values()) != {expected_per_profile}
    ):
        raise ValueError("corpus endpoint profiles are not frozen-stage balanced")

    corpus_binding = {
        "pathSha256": sha256_file(corpus_path),
        "manifestSha256": sha256_file(manifest_path),
        "sequenceSetSha256": sha256_json([row["sequenceSha256"] for row in rows]),
        "caseIdSetSha256": sha256_json([row["caseId"] for row in rows]),
        "rowCount": len(rows),
    }
    paths = {
        "checkpoint": checkpoint_path,
        "bins": bins_dir,
        "corpus": corpus_path,
        "manifest": manifest_path,
        "preregistration": preregistration_path,
    }
    return batches, manifest, corpus_binding, paths


def fit(args: argparse.Namespace) -> None:
    if args.layers != FROZEN_LAYERS or args.dim_batch != FROZEN_DIM_BATCH:
        raise ValueError("layers and dim batch must match the frozen S2 preregistration")
    batches, manifest, corpus_binding, paths = _validate_inputs(args)
    if args.dry_run:
        print(
            json.dumps(
                {
                    "status": "validated",
                    "lane": args.lane,
                    "stage": args.stage,
                    "rowCount": len(batches),
                    "corpusSha256": corpus_binding["pathSha256"],
                    "semanticLabelsAccessed": False,
                },
                sort_keys=True,
            )
        )
        return

    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("the preregistered local fit requires an available CUDA device")
    if args.device.startswith("cuda"):
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats(args.device)

    started_at = _utc_now()
    started = time.perf_counter()
    model, model_config = _load_model(paths["checkpoint"], paths["bins"], args.device)
    artifact = fit_endpoint_local_taylor_jacobian_lens_v1(
        model,
        batches,
        layers=args.layers,
        checkpoint_sha256=manifest["checkpointSha256"],
        tokenizer_sha256=manifest["tokenizerSha256"],
        calibration_corpus_sha256=corpus_binding["sequenceSetSha256"],
        dim_batch=args.dim_batch,
        max_seq_len=FROZEN_MAX_SEQ_LEN,
        position_bins=[tuple(value) for value in FROZEN_POSITION_BINS],
    )
    elapsed_millis = round((time.perf_counter() - started) * 1000)

    peak_bytes = 0
    total_bytes = 0
    if args.device.startswith("cuda"):
        peak_bytes = int(torch.cuda.max_memory_allocated(args.device))
        total_bytes = int(torch.cuda.get_device_properties(args.device).total_memory)
        if peak_bytes * 10 > total_bytes * 9:
            raise RuntimeError("fit exceeded the preregistered 90% GPU memory ceiling")

    output_path = Path(args.output).resolve()
    artifact_sha256 = save_jacobian_lens_artifact(artifact, output_path)
    loaded = load_jacobian_lens_artifact(
        output_path,
        checkpoint_sha256=manifest["checkpointSha256"],
        tokenizer_sha256=manifest["tokenizerSha256"],
        model=model,
    )
    if loaded.lens_sha256 != artifact_sha256:
        raise RuntimeError("saved lens failed its provenance-bound loadback")

    calibration = artifact["calibration"]
    receipt = {
        "schema": FIT_RECEIPT_SCHEMA,
        "createdAt": _utc_now(),
        "startedAt": started_at,
        "gitRevision": _git_revision(),
        "stage": args.stage,
        "lane": args.lane,
        "estimator": JACOBIAN_LENS_ESTIMATOR_V3,
        "paperParity": False,
        "transportProfile": JACOBIAN_LENS_V3_TRANSPORT_PROFILE,
        "positionPolicy": "endpoint-self-only",
        "positionBins": FROZEN_POSITION_BINS,
        "layers": args.layers,
        "dimBatch": args.dim_batch,
        "maxSeqLen": FROZEN_MAX_SEQ_LEN,
        "checkpointSha256": manifest["checkpointSha256"],
        "tokenizerSha256": manifest["tokenizerSha256"],
        "preregistrationSha256": manifest["preregistrationSha256"],
        "corpusManifestSha256": corpus_binding["manifestSha256"],
        "corpusArtifactSha256": corpus_binding["pathSha256"],
        "calibrationCorpusSha256": calibration["corpusSha256"],
        "calibrationShardSha256": calibration["shardSha256"],
        "caseIdSetSha256": corpus_binding["caseIdSetSha256"],
        "rowCount": corpus_binding["rowCount"],
        "positionBinCounts": calibration["positionBinCounts"],
        "lensSha256": artifact_sha256,
        "fitScriptSha256": sha256_file(__file__),
        "elapsedMillis": elapsed_millis,
        "peakGpuMemoryBytes": peak_bytes,
        "gpuTotalMemoryBytes": total_bytes,
        "peakGpuMemoryShareE8": (
            0 if total_bytes == 0 else (peak_bytes * 100_000_000 + total_bytes // 2) // total_bytes
        ),
        "runtime": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "device": args.device,
            "cuda": torch.version.cuda,
        },
        "model": model_config,
        "semanticLabelsAccessed": False,
        "selfHash": None,
    }
    receipt["selfHash"] = sha256_json(receipt)
    receipt_path = Path(args.receipt).resolve()
    _write_json_atomic(receipt_path, receipt)
    print(
        json.dumps(
            {
                "status": "fitted",
                "lane": args.lane,
                "stage": args.stage,
                "lensSha256": artifact_sha256,
                "receiptSha256": sha256_file(receipt_path),
                "elapsedMillis": elapsed_millis,
                "peakGpuMemoryShareE8": receipt["peakGpuMemoryShareE8"],
                "semanticLabelsAccessed": False,
            },
            sort_keys=True,
        )
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--bins", required=True)
    parser.add_argument("--corpus", required=True)
    parser.add_argument("--corpus-manifest", required=True)
    parser.add_argument("--preregistration", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--lane", choices=("a", "b"), required=True)
    parser.add_argument("--stage", choices=("pilot", "confirmation"), required=True)
    parser.add_argument("--layers", nargs="+", type=int, default=FROZEN_LAYERS)
    parser.add_argument("--dim-batch", type=int, default=FROZEN_DIM_BATCH)
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main() -> None:
    fit(_parser().parse_args())


if __name__ == "__main__":
    main()
