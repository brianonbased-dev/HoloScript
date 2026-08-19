#!/usr/bin/env python3
"""Fit one preregistered J-space S3 Latin-balanced endpoint lens.

The command consumes only a sealed A or B subset selected from the S2 corpus
and emits one lens plus a provenance receipt. It reuses the S2 local-Taylor
estimator verbatim and never accepts a label file or semantic outcome field.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
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


SELECTION_MANIFEST_SCHEMA = "holoscript.jspace-s3-selection-manifest.v0.1.0"
FIT_RECEIPT_SCHEMA = "holoscript.jspace-s3-fit-receipt.v0.1.0"
PILOT_ADMISSION_SCHEMA = "holoscript.jspace-s3-pilot-admission.v0.1.0"
FROZEN_LAYERS = [2, 5, 8]
FROZEN_POSITION_BINS = [[0, 127], [128, 255], [256, 383], [384, 511]]
FROZEN_DIM_BATCH = 8
FROZEN_MAX_SEQ_LEN = 512
FROZEN_CHECKPOINT_SHA256 = (
    "sha256:abbda748c6bd6dec69bd72f25ca5ab28876fbbdbf195f218439ddbd0a10ff914"
)
FROZEN_TOKENIZER_SHA256 = (
    "sha256:f92af6207d211728a530e95e44c60b3c95f700ea9c755ab6bd8614fbdac623d4"
)
FROZEN_S2_MANIFEST_SHA256 = (
    "sha256:2c00dd213301a5ba57628b3226ae77f6b78216df0f8bb17ea0dddecccb2b0b64"
)
FROZEN_S2_MANIFEST_SELF_HASH = (
    "sha256:e81354d29eb295de6fb0e7441b0d9907d5d776720083cf6ea9344b39b22b3361"
)
FROZEN_S2_LEAKAGE_SHA256 = (
    "sha256:c4cbc8a65e092a756cae46466cad7938aca9fb5c1a31530d34f0badee7fb7d2a"
)
FROZEN_S2_LEAKAGE_SELF_HASH = (
    "sha256:1bdddd888ce422777e812f8f3b7781ed37dc6877c43ab6fae32e22a5154c6491"
)
FROZEN_S2_REFERENCE_SHA256 = (
    "sha256:77f4e11eea6584667d606624e7f41a4598ac1f329bd6b137633f4b39574d7a0b"
)
FROZEN_S2_REFERENCE_SELF_HASH = (
    "sha256:0dbb03057bfb3601661446bb80007ad52b11082b7b7e77365e9a642860320d24"
)
FROZEN_S3_PREREGISTRATION_SHA256 = (
    "sha256:c850d7eda595e3eda2fdbcfbcf3e8172b876f7171594569da979e54cff822c18"
)
FROZEN_S3_SELECTION_MANIFEST_SHA256 = (
    "sha256:1c700238479b2b0e54839779de3ea2efe6298879227043e8495c559b502761af"
)
FROZEN_S3_SELECTION_MANIFEST_SELF_HASH = (
    "sha256:f09d04f0e8a18d06dc95acee5f26ac40e9f4f0490af93477a84edbd3c01ac7f2"
)
FROZEN_S3_SELECTOR_SHA256 = (
    "sha256:db7989aa764bfce553b76c6e95f16e20553152192853a99a51dec93a8200966d"
)
FROZEN_FAMILIES = (
    "physical",
    "relational",
    "causal_temporal",
    "normative",
    "semantic_pragmatic",
    "planning_tension",
)
FROZEN_ENDPOINTS = {
    ("form_0", 0): ("analysis-colon", "Analysis:"),
    ("form_0", 1): ("evidence-equals", "Evidence ="),
    ("form_1", 0): ("decision-list", "Decision ["),
    ("form_1", 1): ("options-object", "Options {"),
    ("form_2", 0): ("holoscript-object-name", 'HoloScript:\nobject "'),
    ("form_2", 1): ("holoscript-line-comment", "HoloScript:\n//"),
    ("form_3", 0): ("trace-call", "Trace step("),
    ("form_3", 1): ("constraint-trait", "Constraint @"),
}
FROZEN_ENDPOINT_KEYS = tuple(FROZEN_ENDPOINTS)
FROZEN_ENDPOINT_PROFILES = tuple(value[0] for value in FROZEN_ENDPOINTS.values())
FIT_SOURCE_PATHS = (
    "scripts/research/fit_jspace_s3_lens.py",
    "scripts/research/select_jspace_s3_corpus.py",
    "scripts/research/test_fit_jspace_s3_lens.py",
    "packages/holoserve-py/holoserve/model.py",
    "packages/holoserve-py/holoserve/tokenizer.py",
    "packages/holoserve-py/holoserve/workspace_eval.py",
    "packages/holoserve-py/holoserve/workspace_fidelity.py",
    "packages/holoserve-py/holoserve/workspace_probe.py",
)


def _sha256_text(value: str) -> str:
    return f"sha256:{hashlib.sha256(value.encode('utf-8')).hexdigest()}"


def _is_sha256(value: object) -> bool:
    if not isinstance(value, str) or not value.startswith("sha256:"):
        return False
    digest = value.removeprefix("sha256:")
    return len(digest) == 64 and all(character in "0123456789abcdef" for character in digest)


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


def _resolve_repo_file(value: object) -> Path:
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise ValueError("manifest file bindings must be non-empty repo-relative paths")
    resolved = (REPO_ROOT / value).resolve()
    try:
        resolved.relative_to(REPO_ROOT)
    except ValueError as error:
        raise ValueError("manifest file binding escapes the HoloScript repository") from error
    if not resolved.is_file():
        raise FileNotFoundError(resolved)
    return resolved


def _repo_relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError as error:
        raise ValueError("fit source must be inside the HoloScript repository") from error


def _resolve_manifest_artifact_file(manifest_path: Path, value: object) -> Path:
    if (
        not isinstance(value, str)
        or not value
        or Path(value).is_absolute()
        or Path(value).name != value
    ):
        raise ValueError("S3 artifact bindings must use one manifest-relative basename")
    resolved = (manifest_path.parent / value).resolve()
    try:
        resolved.relative_to(REPO_ROOT)
    except ValueError as error:
        raise ValueError("S3 artifact binding escapes the HoloScript repository") from error
    if not resolved.is_file():
        raise FileNotFoundError(resolved)
    return resolved


def _validate_bound_json(
    binding: object, *, schema: str
) -> tuple[Path, dict[str, Any]]:
    if not isinstance(binding, dict):
        raise ValueError(f"{schema} binding must be an object")
    path = _resolve_repo_file(binding.get("file"))
    payload = _read_json(path)
    if (
        not _is_sha256(binding.get("sha256"))
        or not _is_sha256(binding.get("selfHash"))
        or binding.get("sha256") != sha256_file(path)
        or payload.get("schema") != schema
        or payload.get("selfHash") != binding.get("selfHash")
        or payload.get("selfHash") != sha256_json({**payload, "selfHash": None})
    ):
        raise ValueError(f"{schema} does not match its source binding")
    return path, payload


def _identity_sets(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "rowCount": len(rows),
        "caseIdSetSha256": sha256_json(sorted({row["caseId"] for row in rows})),
        "promptHashSetSha256": sha256_json(
            sorted({_sha256_text(row["prompt"]) for row in rows})
        ),
        "sequenceHashSetSha256": sha256_json(
            sorted({row["sequenceSha256"] for row in rows})
        ),
    }


def _identity_values(rows: list[dict[str, Any]]) -> tuple[set[str], set[str], set[str]]:
    return (
        {row["caseId"] for row in rows},
        {_sha256_text(row["prompt"]) for row in rows},
        {row["sequenceSha256"] for row in rows},
    )


def _coordinate_set_sha256(rows: list[dict[str, Any]]) -> str:
    family_index = {family: index for index, family in enumerate(FROZEN_FAMILIES)}
    endpoint_slot = {key: index for index, key in enumerate(FROZEN_ENDPOINT_KEYS)}
    try:
        coordinates = sorted(
            {
                (
                    family_index[row["vertical"]],
                    FROZEN_POSITION_BINS.index(row["positionBin"]),
                    endpoint_slot[(row["taskForm"], row["variant"])],
                )
                for row in rows
            }
        )
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("corpus contains an invalid frozen coordinate") from error
    return sha256_json([list(coordinate) for coordinate in coordinates])


def _validate_bound_jsonl_artifact(
    binding: object, *, expected_rows: int
) -> tuple[Path, list[dict[str, Any]]]:
    if not isinstance(binding, dict):
        raise ValueError("source corpus artifact binding must be an object")
    path = _resolve_repo_file(binding.get("file"))
    rows = _read_jsonl(path)
    if (
        binding.get("rowCount") != expected_rows
        or len(rows) != expected_rows
        or binding.get("sha256") != sha256_file(path)
    ):
        raise ValueError("source corpus artifact does not match its binding")
    return path, rows


def _validate_s3_artifact(
    binding: object, *, manifest_path: Path, expected_rows: int
) -> tuple[Path, list[dict[str, Any]]]:
    if not isinstance(binding, dict):
        raise ValueError("S3 corpus artifact binding must be an object")
    path = _resolve_manifest_artifact_file(manifest_path, binding.get("file"))
    rows = _read_jsonl(path)
    observed = {
        **_identity_sets(rows),
        "coordinateSetSha256": _coordinate_set_sha256(rows),
    }
    bound = {
        key: binding.get(key)
        for key in (
            "rowCount",
            "caseIdSetSha256",
            "promptHashSetSha256",
            "sequenceHashSetSha256",
            "coordinateSetSha256",
        )
    }
    if (
        expected_rows != len(rows)
        or observed != bound
        or binding.get("sha256") != sha256_file(path)
    ):
        raise ValueError("S3 corpus artifact does not match its selection binding")
    return path, rows


def _validate_bound_file(binding: object) -> Path:
    if not isinstance(binding, dict):
        raise ValueError("artifact binding must be an object")
    path = _resolve_repo_file(binding.get("file"))
    if binding.get("sha256") != sha256_file(path):
        raise ValueError("artifact does not match its SHA-256 binding")
    return path


def _validate_pilot_admission(
    args: argparse.Namespace,
    *,
    selection_manifest_path: Path,
    selection_manifest: dict[str, Any],
    preregistration_path: Path,
) -> tuple[
    Path | None,
    dict[str, Any] | None,
    Path | None,
    dict[str, Any] | None,
    tuple[Path, ...],
]:
    if args.stage != "confirmation":
        if args.pilot_evidence:
            raise ValueError("pilot admission evidence is only valid for confirmation")
        return None, None, None, None, ()
    if not args.pilot_evidence:
        if args.dry_run:
            return None, None, None, None, ()
        raise ValueError(
            "confirmation observation requires a committed passing-pilot admission manifest"
        )
    path = Path(args.pilot_evidence).resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    _repo_relative(path)
    evidence = _read_json(path)
    fidelity_binding = evidence.get("fidelityArtifact")
    fit_receipt_bindings = evidence.get("fitReceipts")
    collection_binding = evidence.get("collectionArtifact")
    rows_binding = evidence.get("rowsArtifact")
    receipts_binding = evidence.get("receiptsArtifact")
    if (
        evidence.get("schema") != PILOT_ADMISSION_SCHEMA
        or evidence.get("selfHash")
        != sha256_json({**evidence, "selfHash": None})
        or evidence.get("stage") != "pilot"
        or evidence.get("gatePassed") is not True
        or evidence.get("semanticLabelsAccessed") is not False
        or evidence.get("selectionManifestSha256")
        != sha256_file(selection_manifest_path)
        or evidence.get("selectionManifestSelfHash")
        != selection_manifest.get("selfHash")
        or not isinstance(fidelity_binding, dict)
        or not isinstance(fit_receipt_bindings, dict)
        or set(fit_receipt_bindings) != {"a", "b"}
        or not isinstance(collection_binding, dict)
        or not isinstance(rows_binding, dict)
        or not isinstance(receipts_binding, dict)
    ):
        raise ValueError("confirmation pilot-admission evidence is invalid")
    fidelity_path, fidelity = _validate_bound_json(
        fidelity_binding,
        schema="holoscript.model-workspace-fidelity-evaluation.v0.2.0",
    )
    aliases = fidelity.get("aliases")
    replication = fidelity.get("replication")
    bootstrap = fidelity.get("bootstrap")
    h_pilot = selection_manifest.get("pilotArtifacts", {}).get("h")
    source_s2 = selection_manifest.get("sourceS2")
    exact_gate_keys = {
        "ceilingLayerNonInferiority",
        "entropyError",
        "macroAnchorGain",
        "macroIdentityGain",
        "maxProbabilityError",
        "primaryLayers",
        "targetTopTokenVariation",
        "topTokenDiversity",
    }
    if (
        fidelity.get("status") != "label-blind-target-fidelity"
        or fidelity.get("passed") is not True
        or fidelity.get("semanticLabelsAccessed") is not False
        or fidelity.get("preregistrationSha256")
        != sha256_file(preregistration_path)
        or not isinstance(h_pilot, dict)
        or fidelity.get("promptManifestSha256") != h_pilot.get("sha256")
        or fidelity.get("gateProfile") != "s2-local-taylor-varied-endpoint-v1"
        or fidelity.get("positionBins") != FROZEN_POSITION_BINS
        or fidelity.get("layers") != FROZEN_LAYERS
        or fidelity.get("primaryLayers") != [2, 5]
        or fidelity.get("ceilingLayer") != 8
        or bootstrap
        != {
            "method": "whole-task-family-percentile-v1",
            "samples": 10_000,
            "seed": "7301642128954031337",
        }
        or not isinstance(source_s2, dict)
        or fidelity.get("checkpointSha256") != source_s2.get("checkpointSha256")
        or fidelity.get("tokenizerSha256") != source_s2.get("tokenizerSha256")
        or fidelity.get("codeFileSha256")
        != sha256_file(
            REPO_ROOT / "packages/holoserve-py/holoserve/workspace_fidelity.py"
        )
        or not isinstance(aliases, dict)
        or set(aliases) != {"a", "b"}
        or not isinstance(aliases["a"], dict)
        or not isinstance(aliases["b"], dict)
        or aliases["a"].get("passed") is not True
        or aliases["b"].get("passed") is not True
        or aliases["a"].get("recordCount") != 48
        or aliases["b"].get("recordCount") != 48
        or any(
            not isinstance(alias, dict)
            or not isinstance(alias.get("gates"), dict)
            or set(alias["gates"]) != exact_gate_keys
            or set(alias["gates"].values()) != {True}
            for alias in aliases.values()
        )
        or not isinstance(replication, dict)
        or replication.get("passed") is not True
        or not isinstance(replication.get("macroGainPearsonE8"), int)
        or isinstance(replication.get("macroGainPearsonE8"), bool)
        or replication["macroGainPearsonE8"] < 90_000_000
        or not isinstance(replication.get("macroGainSignAgreementE8"), int)
        or isinstance(replication.get("macroGainSignAgreementE8"), bool)
        or replication["macroGainSignAgreementE8"] < 90_000_000
        or not _is_sha256(fidelity.get("collectionManifestSha256"))
        or not _is_sha256(fidelity.get("rowsSha256"))
        or not _is_sha256(fidelity.get("receiptsSha256"))
    ):
        raise ValueError("bound pilot fidelity artifact does not admit confirmation")
    fit_receipt_paths: dict[str, Path] = {}
    fit_receipts: dict[str, dict[str, Any]] = {}
    for lane in ("a", "b"):
        receipt_path, receipt = _validate_bound_json(
            fit_receipt_bindings[lane], schema=FIT_RECEIPT_SCHEMA
        )
        pilot_artifact = selection_manifest["pilotArtifacts"][lane]
        if (
            receipt.get("stage") != "pilot"
            or receipt.get("lane") != lane
            or receipt.get("estimator") != JACOBIAN_LENS_ESTIMATOR_V3
            or receipt.get("transportProfile")
            != JACOBIAN_LENS_V3_TRANSPORT_PROFILE
            or receipt.get("positionPolicy") != "endpoint-self-only"
            or receipt.get("positionBins") != FROZEN_POSITION_BINS
            or receipt.get("layers") != FROZEN_LAYERS
            or receipt.get("rowCount") != 48
            or receipt.get("checkpointSha256") != FROZEN_CHECKPOINT_SHA256
            or receipt.get("tokenizerSha256") != FROZEN_TOKENIZER_SHA256
            or receipt.get("preregistrationSha256")
            != FROZEN_S3_PREREGISTRATION_SHA256
            or receipt.get("selectionManifestSha256")
            != FROZEN_S3_SELECTION_MANIFEST_SHA256
            or receipt.get("selectionManifestSelfHash")
            != FROZEN_S3_SELECTION_MANIFEST_SELF_HASH
            or receipt.get("sourceS2CorpusManifestSha256")
            != FROZEN_S2_MANIFEST_SHA256
            or receipt.get("corpusArtifactSha256") != pilot_artifact["sha256"]
            or receipt.get("sequenceSetSha256")
            != pilot_artifact["sequenceHashSetSha256"]
            or receipt.get("semanticLabelsAccessed") is not False
            or not _is_sha256(receipt.get("lensSha256"))
            or not isinstance(receipt.get("elapsedMillis"), int)
            or isinstance(receipt.get("elapsedMillis"), bool)
            or receipt["elapsedMillis"] <= 0
            or not isinstance(receipt.get("peakGpuMemoryShareE8"), int)
            or isinstance(receipt.get("peakGpuMemoryShareE8"), bool)
            or receipt["peakGpuMemoryShareE8"] > 90_000_000
        ):
            raise ValueError(f"pilot {lane} fit receipt does not admit confirmation")
        fit_receipt_paths[lane] = receipt_path
        fit_receipts[lane] = receipt

    projected_confirmation_fit_millis = (
        sum(receipt["elapsedMillis"] for receipt in fit_receipts.values()) * 120
        + 47
    ) // 48
    if projected_confirmation_fit_millis > 45 * 60 * 1000:
        raise ValueError("projected A+B confirmation fit exceeds 45 minutes")

    models = fidelity.get("models")
    if not isinstance(models, list) or len(models) != 2:
        raise ValueError("pilot fidelity model bindings are invalid")
    model_lenses = {
        model.get("alias"): model.get("lensSha256")
        for model in models
        if isinstance(model, dict)
    }
    if model_lenses != {
        lane: fit_receipts[lane]["lensSha256"] for lane in ("a", "b")
    }:
        raise ValueError("pilot fidelity lenses do not match A/B fit receipts")

    collection_path, collection = _validate_bound_json(
        collection_binding, schema="holoserve.workspace-signal-collection.v0.1.0"
    )
    rows_path = _validate_bound_file(rows_binding)
    receipts_path = _validate_bound_file(receipts_binding)
    collection_models = collection.get("models")
    capabilities = collection.get("capabilities")
    if (
        fidelity.get("collectionManifestSha256") != sha256_file(collection_path)
        or fidelity.get("rowsSha256") != sha256_file(rows_path)
        or fidelity.get("receiptsSha256") != sha256_file(receipts_path)
        or collection.get("promptManifestSha256") != h_pilot["sha256"]
        or collection.get("rowArtifactSha256") != sha256_file(rows_path)
        or collection.get("receiptArtifactSha256") != sha256_file(receipts_path)
        or collection.get("checkpointSha256") != FROZEN_CHECKPOINT_SHA256
        or collection.get("tokenizerSha256") != FROZEN_TOKENIZER_SHA256
        or collection.get("codeFileSha256")
        != sha256_file(REPO_ROOT / "packages/holoserve-py/holoserve/workspace_eval.py")
        or collection.get("promptCount") != 48
        or collection.get("rowCount") != 96
        or collection.get("receiptCount") != 96
        or collection.get("truncatedRowCount") != 0
        or collection.get("allowTruncated") is not False
        or not isinstance(collection_models, list)
        or {
            model.get("alias"): model.get("lensSha256")
            for model in collection_models
            if isinstance(model, dict)
        }
        != model_lenses
        or not isinstance(capabilities, dict)
        or set(capabilities) != {"a", "b"}
        or any(
            not isinstance(capability, dict)
            or capability.get("lensSha256") != model_lenses[lane]
            or capability.get("estimator") != JACOBIAN_LENS_ESTIMATOR_V3
            or capability.get("transportProfile")
            != JACOBIAN_LENS_V3_TRANSPORT_PROFILE
            for lane, capability in capabilities.items()
        )
    ):
        raise ValueError("pilot collection artifacts do not admit confirmation")
    provenance_paths = (
        fidelity_path,
        *fit_receipt_paths.values(),
        collection_path,
        rows_path,
        receipts_path,
    )
    return path, evidence, fidelity_path, fidelity, provenance_paths


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
    if len(revision) != 40 or any(
        character not in "0123456789abcdef" for character in revision
    ):
        raise ValueError("fit receipt requires an exact Git revision")
    return revision


def _require_clean_fit_sources(
    git_revision: str, additional_paths: tuple[str, ...]
) -> dict[str, str]:
    fit_source_paths = tuple(dict.fromkeys((*FIT_SOURCE_PATHS, *additional_paths)))
    status = subprocess.run(
        [
            "git",
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
            "--",
            *fit_source_paths,
        ],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    if status.stdout.strip():
        raise RuntimeError(
            "fit sources must be committed and clean before model observation: "
            f"{status.stdout.strip()}"
        )
    revision_diff = subprocess.run(
        ["git", "diff", "--quiet", git_revision, "--", *fit_source_paths],
        cwd=REPO_ROOT,
        check=False,
    )
    if revision_diff.returncode != 0:
        raise RuntimeError("fit sources do not match the claimed exact Git revision")
    tracked = subprocess.run(
        [
            "git",
            "ls-tree",
            "-r",
            "--name-only",
            git_revision,
            "--",
            *fit_source_paths,
        ],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    tracked_paths = set(tracked.stdout.splitlines())
    if tracked_paths != set(fit_source_paths):
        raise RuntimeError("every fit source must be tracked by the exact Git revision")
    return {
        relative: sha256_file(REPO_ROOT / relative) for relative in fit_source_paths
    }


def _require_unchanged_fit_sources(expected: dict[str, str]) -> None:
    observed = {
        relative: sha256_file(REPO_ROOT / relative) for relative in expected
    }
    if observed != expected:
        raise RuntimeError("fit source changed during model observation")


def _load_model(
    checkpoint_path: Path, bins_dir: Path, device: str
) -> tuple[GPT, dict[str, Any]]:
    meta = _read_json(bins_dir / "meta.json")
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=True)
    if not isinstance(checkpoint, dict) or not isinstance(checkpoint.get("model"), dict):
        raise ValueError("checkpoint must contain a model state dictionary")
    config = checkpoint.get("config", {})
    if not isinstance(config, dict):
        raise ValueError("checkpoint config must be an object")
    structural_type_count = int(
        checkpoint.get("structural_type_count", config.get("structural_type_count", 0))
        or 0
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
            f"checkpoint block size {model_config['blockSize']} does not match the frozen S3 limit"
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


def _validate_balance(rows: list[dict[str, Any]], stage: str) -> None:
    profile_counts = Counter(row["endpointProfile"] for row in rows)
    bin_counts = Counter(tuple(row["positionBin"]) for row in rows)
    profiles_by_bin: dict[tuple[int, int], set[str]] = defaultdict(set)
    profiles_by_family: dict[str, Counter[str]] = defaultdict(Counter)
    cells = Counter()
    coordinates = set()
    for row in rows:
        position_bin = tuple(row["positionBin"])
        profile = row["endpointProfile"]
        family = row["vertical"]
        profiles_by_bin[position_bin].add(profile)
        profiles_by_family[family][profile] += 1
        cells[(family, position_bin)] += 1
        coordinates.add((family, position_bin, row["taskForm"], row["variant"]))

    if len(coordinates) != len(rows):
        raise ValueError("corpus repeats a family/bin/endpoint coordinate")
    if set(bin_counts) != {tuple(value) for value in FROZEN_POSITION_BINS}:
        raise ValueError("corpus does not cover all frozen position bins")
    if set(profile_counts) != set(FROZEN_ENDPOINT_PROFILES):
        raise ValueError("corpus does not cover all frozen endpoint profiles")
    if any(profiles != set(FROZEN_ENDPOINT_PROFILES) for profiles in profiles_by_bin.values()):
        raise ValueError("every position bin must contain all eight endpoint profiles")

    if stage == "pilot":
        if len(rows) != 48 or set(profile_counts.values()) != {6}:
            raise ValueError("S3 pilot must have 48 rows and six rows per endpoint profile")
        if set(bin_counts.values()) != {12}:
            raise ValueError("S3 pilot must have 12 rows in every position bin")
        if set(profiles_by_family) != set(FROZEN_FAMILIES) or any(
            counts != Counter({profile: 1 for profile in FROZEN_ENDPOINT_PROFILES})
            for counts in profiles_by_family.values()
        ):
            raise ValueError("every S3 pilot family must see each endpoint exactly once")
        if set(cells.values()) != {2}:
            raise ValueError("S3 pilot must have two endpoints per family and position bin")
    else:
        if len(rows) != 120 or set(profile_counts.values()) != {15}:
            raise ValueError(
                "S3 confirmation must have 120 rows and 15 rows per endpoint profile"
            )
        if set(bin_counts.values()) != {30}:
            raise ValueError("S3 confirmation must have 30 rows in every position bin")
        if set(profiles_by_family) != set(FROZEN_FAMILIES):
            raise ValueError("S3 confirmation must cover every frozen family")
        if set(cells.values()) != {5}:
            raise ValueError("S3 confirmation must have five endpoints per family and position bin")

    expected_coordinates = set()
    for family_index, family in enumerate(FROZEN_FAMILIES):
        family_offset = (
            1 + 4 * (family_index % 2) + 2 * (family_index // 4)
        ) % 8
        for bin_index, position_bin in enumerate(FROZEN_POSITION_BINS):
            s2_pilot_slot = (family_index * 4 + bin_index) % 8
            s3_pilot_slots = {
                (2 * bin_index + family_offset + offset) % 8 for offset in (0, 1)
            }
            selected_slots = (
                s3_pilot_slots
                if stage == "pilot"
                else set(range(8)) - {s2_pilot_slot} - s3_pilot_slots
            )
            for slot in selected_slots:
                task_form, variant = FROZEN_ENDPOINT_KEYS[slot]
                expected_coordinates.add(
                    (family, tuple(position_bin), task_form, variant)
                )
    if coordinates != expected_coordinates:
        raise ValueError("corpus coordinates do not match the frozen S3 selector")


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
    artifacts = manifest.get(
        "pilotArtifacts" if args.stage == "pilot" else "confirmationArtifacts"
    )
    expected = artifacts.get(args.lane) if isinstance(artifacts, dict) else None
    source_s2 = manifest.get("sourceS2")
    selector = manifest.get("selector")
    expected_endpoint_slots = [
        {
            "slot": slot,
            "profile": FROZEN_ENDPOINTS[key][0],
            "taskForm": key[0],
            "variant": key[1],
        }
        for slot, key in enumerate(FROZEN_ENDPOINT_KEYS)
    ]
    if (
        manifest.get("schema") != SELECTION_MANIFEST_SCHEMA
        or manifest.get("selfHash") != sha256_json({**manifest, "selfHash": None})
        or sha256_file(manifest_path) != FROZEN_S3_SELECTION_MANIFEST_SHA256
        or manifest.get("selfHash") != FROZEN_S3_SELECTION_MANIFEST_SELF_HASH
        or manifest.get("semanticLabelsAccessed") is not False
        or manifest.get("positionBins") != FROZEN_POSITION_BINS
        or manifest.get("preregistrationSha256") != sha256_file(preregistration_path)
        or manifest.get("preregistrationSha256")
        != FROZEN_S3_PREREGISTRATION_SHA256
        or manifest.get("selectorSourceSha256")
        != sha256_file(REPO_ROOT / "scripts/research/select_jspace_s3_corpus.py")
        or manifest.get("selectorSourceSha256") != FROZEN_S3_SELECTOR_SHA256
        or manifest.get("identifierHashing")
        != {
            "coordinateSetDigest": "sha256(canonical JSON of sorted unique [familyIndex,positionBinIndex,endpointSlot] arrays)",
            "promptHash": "sha256(exact prompt UTF-8)",
            "setDigest": "sha256(canonical JSON of sorted unique strings)",
        }
        or not isinstance(selector, dict)
        or selector.get("familyOrder") != list(FROZEN_FAMILIES)
        or selector.get("positionBins") != FROZEN_POSITION_BINS
        or selector.get("endpointSlots") != expected_endpoint_slots
        or selector.get("ranking") is not None
        or selector.get("formula")
        != {
            "g": "(1 + 4 * (f mod 2) + 2 * floor(f / 4)) mod 8",
            "slot": "(2 * b + g_f + k) mod 8 for k in {0,1}",
        }
        or not isinstance(source_s2, dict)
        or source_s2.get("semanticLabelsAccessed") is not False
        or source_s2.get("checkpointSha256") != sha256_file(checkpoint_path)
        or source_s2.get("checkpointSha256") != FROZEN_CHECKPOINT_SHA256
        or source_s2.get("tokenizerSha256") != sha256_file(bins_dir / "tokenizer.json")
        or source_s2.get("tokenizerSha256") != FROZEN_TOKENIZER_SHA256
        or not isinstance(expected, dict)
    ):
        raise ValueError("fit inputs do not match the sealed S3 selection manifest")
    expected_path = _resolve_manifest_artifact_file(manifest_path, expected.get("file"))
    if expected_path != corpus_path or expected.get("sha256") != sha256_file(corpus_path):
        raise ValueError("selected corpus does not match its S3 artifact binding")

    source_corpus_binding = source_s2.get("corpusManifest")
    source_corpus_path, source_corpus_manifest = _validate_bound_json(
        source_corpus_binding,
        schema="holoscript.jspace-s2-corpus-manifest.v0.1.0",
    )
    source_leakage_path, source_leakage_report = _validate_bound_json(
        source_s2.get("leakageReport"),
        schema="holoscript.jspace-s2-leakage-report.v0.1.0",
    )
    source_reference_path, source_reference_manifest = _validate_bound_json(
        source_s2.get("referenceManifest"),
        schema="holoscript.jspace-s2-reference-manifest.v0.1.0",
    )
    if (
        source_corpus_binding.get("sha256") != FROZEN_S2_MANIFEST_SHA256
        or source_corpus_binding.get("selfHash")
        != FROZEN_S2_MANIFEST_SELF_HASH
        or source_s2.get("leakageReport", {}).get("sha256")
        != FROZEN_S2_LEAKAGE_SHA256
        or source_s2.get("leakageReport", {}).get("selfHash")
        != FROZEN_S2_LEAKAGE_SELF_HASH
        or source_s2.get("referenceManifest", {}).get("sha256")
        != FROZEN_S2_REFERENCE_SHA256
        or source_s2.get("referenceManifest", {}).get("selfHash")
        != FROZEN_S2_REFERENCE_SELF_HASH
        or source_corpus_manifest.get("semanticLabelsAccessed") is not False
        or source_corpus_manifest.get("positionBins") != FROZEN_POSITION_BINS
        or source_corpus_manifest.get("checkpointSha256")
        != source_s2["checkpointSha256"]
        or source_corpus_manifest.get("tokenizerSha256")
        != source_s2["tokenizerSha256"]
        or source_corpus_manifest.get("leakageReportSha256")
        != sha256_file(source_leakage_path)
        or source_corpus_manifest.get("referenceManifestSha256")
        != sha256_file(source_reference_path)
        or source_leakage_report.get("passed") is not True
        or source_leakage_report.get("failedCaseIds") != []
        or source_leakage_report.get("byteWindow") != 64
        or source_leakage_report.get("tokenWindow") != 32
        or source_leakage_report.get("matchCounts")
        != {
            "bodyContainment": 0,
            "crossLaneByte64": 0,
            "crossLaneToken32": 0,
            "normalizedEquality": 0,
            "referenceByte64": 0,
            "referenceToken32": 0,
        }
        or source_reference_manifest.get("checkpointSha256")
        != source_s2["checkpointSha256"]
        or source_reference_manifest.get("tokenizerSha256")
        != source_s2["tokenizerSha256"]
    ):
        raise ValueError("S3 source does not match the sealed S2 admission artifacts")

    source_split_bindings = source_s2.get("fullArtifacts")
    source_pilot_bindings = source_s2.get("exposedPilotArtifacts")
    if (
        not isinstance(source_split_bindings, dict)
        or set(source_split_bindings) != {"a", "b", "h"}
        or not isinstance(source_pilot_bindings, dict)
        or set(source_pilot_bindings) != {"a", "b", "h"}
    ):
        raise ValueError("S3 must bind all sealed S2 A/B/H source artifacts")
    source_full_paths: dict[str, Path] = {}
    source_full_rows: dict[str, list[dict[str, Any]]] = {}
    source_pilot_paths: dict[str, Path] = {}
    source_pilot_rows: dict[str, list[dict[str, Any]]] = {}
    source_full_row_hashes: dict[str, set[str]] = {}
    for lane in ("a", "b", "h"):
        full_binding = source_split_bindings[lane]
        pilot_binding = source_pilot_bindings[lane]
        full_path, full_rows = _validate_bound_jsonl_artifact(
            full_binding, expected_rows=192
        )
        pilot_path, pilot_rows = _validate_bound_jsonl_artifact(
            pilot_binding, expected_rows=24
        )
        sealed_split = source_corpus_manifest.get("splitArtifacts", {}).get(lane)
        sealed_pilot = source_corpus_manifest.get("pilotArtifacts", {}).get(lane)
        full_observed = {
            **_identity_sets(full_rows),
            "coordinateSetSha256": _coordinate_set_sha256(full_rows),
        }
        pilot_observed = {
            **_identity_sets(pilot_rows),
            "coordinateSetSha256": _coordinate_set_sha256(pilot_rows),
        }
        binding_keys = (
            "rowCount",
            "caseIdSetSha256",
            "promptHashSetSha256",
            "sequenceHashSetSha256",
            "coordinateSetSha256",
        )
        full_hashes = {sha256_json(row) for row in full_rows}
        if (
            not isinstance(sealed_split, dict)
            or not isinstance(sealed_pilot, dict)
            or {"rowCount": full_binding.get("rowCount"), "sha256": full_binding.get("sha256")}
            != sealed_split
            or {"rowCount": pilot_binding.get("rowCount"), "sha256": pilot_binding.get("sha256")}
            != sealed_pilot
            or full_observed != {key: full_binding.get(key) for key in binding_keys}
            or pilot_observed != {key: pilot_binding.get(key) for key in binding_keys}
            or any(row.get("lane") != lane for row in full_rows)
            or any(row.get("lane") != lane for row in pilot_rows)
            or len(full_hashes) != len(full_rows)
            or any(sha256_json(row) not in full_hashes for row in pilot_rows)
        ):
            raise ValueError(f"source {lane} lane does not match sealed S2")
        source_full_paths[lane] = full_path
        source_full_rows[lane] = full_rows
        source_pilot_paths[lane] = pilot_path
        source_pilot_rows[lane] = pilot_rows
        source_full_row_hashes[lane] = full_hashes

    s3_paths: dict[str, dict[str, Path]] = {"pilot": {}, "confirmation": {}}
    s3_rows: dict[str, dict[str, list[dict[str, Any]]]] = {
        "pilot": {},
        "confirmation": {},
    }
    for stage_name, expected_stage_rows in (("pilot", 48), ("confirmation", 120)):
        group = manifest.get(
            "pilotArtifacts" if stage_name == "pilot" else "confirmationArtifacts"
        )
        if not isinstance(group, dict) or set(group) != {"a", "b", "h"}:
            raise ValueError(f"S3 {stage_name} must bind exact A/B/H artifacts")
        for lane in ("a", "b", "h"):
            path, lane_rows = _validate_s3_artifact(
                group[lane],
                manifest_path=manifest_path,
                expected_rows=expected_stage_rows,
            )
            selected_hashes = {sha256_json(row) for row in lane_rows}
            selected_identities = _identity_values(lane_rows)
            exposed_identities = _identity_values(source_pilot_rows[lane])
            if (
                any(row.get("lane") != lane for row in lane_rows)
                or len(selected_hashes) != len(lane_rows)
                or any(len(values) != len(lane_rows) for values in selected_identities)
                or not selected_hashes.issubset(source_full_row_hashes[lane])
                or any(
                    selected & exposed
                    for selected, exposed in zip(
                        selected_identities, exposed_identities
                    )
                )
            ):
                raise ValueError(
                    f"S3 {stage_name} {lane} is not an exact unexposed S2 subset"
                )
            _validate_balance(lane_rows, stage_name)
            s3_paths[stage_name][lane] = path
            s3_rows[stage_name][lane] = lane_rows
        if len({_coordinate_set_sha256(value) for value in s3_rows[stage_name].values()}) != 1:
            raise ValueError(f"S3 {stage_name} A/B/H coordinates are not identical")
        for left_index, left_lane in enumerate(("a", "b", "h")):
            left_sets = _identity_values(s3_rows[stage_name][left_lane])
            for right_lane in ("a", "b", "h")[left_index + 1 :]:
                right_sets = _identity_values(s3_rows[stage_name][right_lane])
                if any(
                    left & right for left, right in zip(left_sets, right_sets)
                ):
                    raise ValueError(
                        f"S3 {stage_name} A/B/H overlap by a frozen identity"
                    )
    for lane in ("a", "b", "h"):
        if any(
            pilot & confirmation
            for pilot, confirmation in zip(
                _identity_values(s3_rows["pilot"][lane]),
                _identity_values(s3_rows["confirmation"][lane]),
            )
        ):
            raise ValueError(f"S3 {lane} pilot and confirmation overlap")
    for left_index, left_lane in enumerate(("a", "b", "h")):
        left_sets = _identity_values(
            s3_rows["pilot"][left_lane] + s3_rows["confirmation"][left_lane]
        )
        for right_lane in ("a", "b", "h")[left_index + 1 :]:
            right_sets = _identity_values(
                s3_rows["pilot"][right_lane]
                + s3_rows["confirmation"][right_lane]
            )
            if any(left & right for left, right in zip(left_sets, right_sets)):
                raise ValueError("S3 selected A/B/H sets overlap across stages")
    proof = manifest.get("proof")
    disjoint_proof = proof.get("selectedLanesPairwiseDisjoint") if isinstance(proof, dict) else None
    if (
        not isinstance(proof, dict)
        or proof.get("coordinatesIdenticalAcrossLanes") is not True
        or proof.get("sourceRowsAreExactSealedMembers") is not True
        or proof.get("zeroOverlapWithExposedS2ByCaseIdPromptHashAndSequenceHash")
        is not True
        or proof.get("zeroPilotConfirmationOverlapByCaseIdPromptHashAndSequenceHash")
        is not True
        or not isinstance(disjoint_proof, dict)
        or set(disjoint_proof) != {"a:b", "a:h", "b:h"}
        or any(
            not isinstance(counts, dict)
            or set(counts) != {"caseId", "promptHash", "sequenceHash"}
            or set(counts.values()) != {0}
            for counts in disjoint_proof.values()
        )
    ):
        raise ValueError("S3 selection manifest is missing its fail-closed proofs")

    rows = s3_rows[args.stage][args.lane]
    expected_rows = 48 if args.stage == "pilot" else 120

    tokenizer = _read_json(bins_dir / "tokenizer.json")
    merges = tokenizer.get("merges")
    if not isinstance(merges, list):
        raise ValueError("tokenizer merges are missing")
    merge_id = {merge[2]: index for index, merge in enumerate(merges)}
    if expected.get("rowCount") != expected_rows or len(rows) != expected_rows:
        raise ValueError("corpus row count does not match the frozen S3 stage")

    batches = []
    case_ids = set()
    sequence_hashes = set()
    for index, row in enumerate(rows):
        forbidden = sorted(FORBIDDEN_PROMPT_FIELDS.intersection(row))
        prompt = row.get("prompt")
        case_id = row.get("caseId")
        sequence_hash = row.get("sequenceSha256")
        if forbidden:
            raise ValueError(f"corpus row {index} exposes semantic fields: {forbidden}")
        if (
            row.get("lane") != args.lane
            or row.get("truncated") is not False
            or row.get("frame") != "fidelity"
            or not isinstance(prompt, str)
            or not prompt
            or not isinstance(case_id, str)
            or not case_id
            or case_id in case_ids
            or not _is_sha256(sequence_hash)
            or sequence_hash in sequence_hashes
            or row.get("vertical") not in FROZEN_FAMILIES
        ):
            raise ValueError(f"corpus row {index} has invalid provenance or identity fields")
        endpoint = FROZEN_ENDPOINTS.get((row.get("taskForm"), row.get("variant")))
        if (
            endpoint is None
            or row.get("endpointProfile") != endpoint[0]
            or row.get("endpointTextSha256") != _sha256_text(endpoint[1])
            or not prompt.endswith(f"\n\n{endpoint[1]}")
            or prompt.endswith(("\n", " "))
        ):
            raise ValueError(f"corpus row {index} does not match its frozen endpoint context")
        tokens = [1, *encode_text(prompt, merges, merge_id)]
        token_hash = sha256_json(tokens)
        if (
            len(tokens) > FROZEN_MAX_SEQ_LEN
            or row.get("tokenCount") != len(tokens)
            or row.get("tokenIdsSha256") != token_hash
            or sequence_hash != token_hash
        ):
            raise ValueError(f"corpus row {index} tokenization does not match its commitment")
        endpoint_position = len(tokens) - 1
        declared_bin = row.get("positionBin")
        try:
            bin_index = FROZEN_POSITION_BINS.index(declared_bin)
        except ValueError as error:
            raise ValueError(f"corpus row {index} has an unknown position bin") from error
        if (
            row.get("lengthStratum") != bin_index
            or not declared_bin[0] <= endpoint_position <= declared_bin[1]
        ):
            raise ValueError(f"corpus row {index} endpoint is outside its declared position bin")
        case_ids.add(case_id)
        sequence_hashes.add(sequence_hash)
        batches.append(torch.tensor([tokens], dtype=torch.long))

    _validate_balance(rows, args.stage)
    observed_selected_binding = {
        **_identity_sets(rows),
        "coordinateSetSha256": _coordinate_set_sha256(rows),
    }
    expected_selected_binding = {
        key: expected.get(key)
        for key in (
            "rowCount",
            "caseIdSetSha256",
            "promptHashSetSha256",
            "sequenceHashSetSha256",
            "coordinateSetSha256",
        )
    }
    if observed_selected_binding != expected_selected_binding:
        raise ValueError("corpus identity sets do not match the S3 selection manifest")
    (
        pilot_admission_path,
        pilot_admission,
        pilot_fidelity_path,
        pilot_fidelity,
        pilot_provenance_paths,
    ) = _validate_pilot_admission(
        args,
        selection_manifest_path=manifest_path,
        selection_manifest=manifest,
        preregistration_path=preregistration_path,
    )
    corpus_binding = {
        "pathSha256": sha256_file(corpus_path),
        "selectionManifestSha256": sha256_file(manifest_path),
        "selectionManifestSelfHash": manifest["selfHash"],
        "sourceS2CorpusManifestSha256": source_corpus_binding["sha256"],
        "promptHashSetSha256": expected["promptHashSetSha256"],
        "sequenceSetSha256": expected["sequenceHashSetSha256"],
        "sequenceOrderSha256": sha256_json(
            [row["sequenceSha256"] for row in rows]
        ),
        "caseIdSetSha256": expected["caseIdSetSha256"],
        "pilotAdmissionManifestSha256": (
            None
            if pilot_admission_path is None
            else sha256_file(pilot_admission_path)
        ),
        "pilotAdmissionManifestSelfHash": (
            None if pilot_admission is None else pilot_admission["selfHash"]
        ),
        "pilotFidelityArtifactSha256": (
            None if pilot_fidelity_path is None else sha256_file(pilot_fidelity_path)
        ),
        "pilotFidelityArtifactSelfHash": (
            None if pilot_fidelity is None else pilot_fidelity["selfHash"]
        ),
        "rowCount": len(rows),
    }
    paths = {
        "checkpoint": checkpoint_path,
        "bins": bins_dir,
        "corpus": corpus_path,
        "manifest": manifest_path,
        "preregistration": preregistration_path,
        "fitSourcePaths": tuple(
            sorted(
                {
                    _repo_relative(path)
                    for path in (
                        preregistration_path,
                        manifest_path,
                        source_corpus_path,
                        source_leakage_path,
                        source_reference_path,
                        *source_full_paths.values(),
                        *source_pilot_paths.values(),
                        *s3_paths["pilot"].values(),
                        *s3_paths["confirmation"].values(),
                        *(
                            ()
                            if pilot_admission_path is None
                            else (pilot_admission_path,)
                        ),
                        *pilot_provenance_paths,
                    )
                }
            )
        ),
    }
    return batches, manifest, corpus_binding, paths


def fit(args: argparse.Namespace) -> None:
    if args.layers != FROZEN_LAYERS or args.dim_batch != FROZEN_DIM_BATCH:
        raise ValueError("layers and dim batch must match the frozen S3 preregistration")
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
                    "sourceS2CorpusManifestSha256": corpus_binding[
                        "sourceS2CorpusManifestSha256"
                    ],
                    "confirmationAdmitted": (
                        args.stage == "confirmation"
                        and corpus_binding["pilotAdmissionManifestSha256"] is not None
                    ),
                    "semanticLabelsAccessed": False,
                },
                sort_keys=True,
            )
        )
        return

    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("the preregistered local fit requires an available CUDA device")
    git_revision = _git_revision()
    fit_source_sha256s = _require_clean_fit_sources(
        git_revision, paths["fitSourcePaths"]
    )
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
        checkpoint_sha256=manifest["sourceS2"]["checkpointSha256"],
        tokenizer_sha256=manifest["sourceS2"]["tokenizerSha256"],
        calibration_corpus_sha256=corpus_binding["sequenceOrderSha256"],
        dim_batch=args.dim_batch,
        max_seq_len=FROZEN_MAX_SEQ_LEN,
        position_bins=[tuple(value) for value in FROZEN_POSITION_BINS],
    )
    elapsed_millis = round((time.perf_counter() - started) * 1000)
    _require_unchanged_fit_sources(fit_source_sha256s)

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
        checkpoint_sha256=manifest["sourceS2"]["checkpointSha256"],
        tokenizer_sha256=manifest["sourceS2"]["tokenizerSha256"],
        model=model,
    )
    if loaded.lens_sha256 != artifact_sha256:
        raise RuntimeError("saved lens failed its provenance-bound loadback")
    _require_unchanged_fit_sources(fit_source_sha256s)

    calibration = artifact["calibration"]
    receipt = {
        "schema": FIT_RECEIPT_SCHEMA,
        "createdAt": _utc_now(),
        "startedAt": started_at,
        "gitRevision": git_revision,
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
        "checkpointSha256": manifest["sourceS2"]["checkpointSha256"],
        "tokenizerSha256": manifest["sourceS2"]["tokenizerSha256"],
        "preregistrationSha256": manifest["preregistrationSha256"],
        "sourceS2CorpusManifestSha256": corpus_binding[
            "sourceS2CorpusManifestSha256"
        ],
        "selectionManifestSha256": corpus_binding["selectionManifestSha256"],
        "selectionManifestSelfHash": corpus_binding["selectionManifestSelfHash"],
        "pilotAdmissionManifestSha256": corpus_binding[
            "pilotAdmissionManifestSha256"
        ],
        "pilotAdmissionManifestSelfHash": corpus_binding[
            "pilotAdmissionManifestSelfHash"
        ],
        "pilotFidelityArtifactSha256": corpus_binding[
            "pilotFidelityArtifactSha256"
        ],
        "pilotFidelityArtifactSelfHash": corpus_binding[
            "pilotFidelityArtifactSelfHash"
        ],
        "corpusArtifactSha256": corpus_binding["pathSha256"],
        "calibrationCorpusSha256": calibration["corpusSha256"],
        "calibrationShardSha256": calibration["shardSha256"],
        "promptHashSetSha256": corpus_binding["promptHashSetSha256"],
        "sequenceSetSha256": corpus_binding["sequenceSetSha256"],
        "sequenceOrderSha256": corpus_binding["sequenceOrderSha256"],
        "caseIdSetSha256": corpus_binding["caseIdSetSha256"],
        "rowCount": corpus_binding["rowCount"],
        "positionBinCounts": calibration["positionBinCounts"],
        "lensSha256": artifact_sha256,
        "fitScriptSha256": sha256_file(__file__),
        "fitSourceSha256s": fit_source_sha256s,
        "elapsedMillis": elapsed_millis,
        "peakGpuMemoryBytes": peak_bytes,
        "gpuTotalMemoryBytes": total_bytes,
        "peakGpuMemoryShareE8": (
            0
            if total_bytes == 0
            else (peak_bytes * 100_000_000 + total_bytes // 2) // total_bytes
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
    parser.add_argument("--pilot-evidence")
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
