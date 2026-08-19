#!/usr/bin/env python3
"""Fit one frozen J-space S5 receipt-bound unscaled centered endpoint lens.

The runner consumes only a sealed S5 A or B subset, replays the inherited
S2-through-S4 admission through the frozen selector, and emits a private lens
plus a public provenance receipt. It never accepts semantic labels.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import platform
import subprocess
import sys
import time
from typing import Any, Mapping, Sequence


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_ROOT = Path(__file__).resolve().parent
HOLOSERVE_ROOT = REPO_ROOT / "packages" / "holoserve-py"
for search_root in (SCRIPT_ROOT, HOLOSERVE_ROOT):
    if str(search_root) not in sys.path:
        sys.path.insert(0, str(search_root))

import torch  # noqa: E402

import fit_jspace_s4_lens as s4  # noqa: E402
import select_jspace_s5_corpus as selector  # noqa: E402
from holoserve.tokenizer import encode_text  # noqa: E402
from holoserve.workspace_eval import FORBIDDEN_PROMPT_FIELDS  # noqa: E402
from holoserve.workspace_probe import (  # noqa: E402
    JACOBIAN_LENS_ESTIMATOR_V2,
    JACOBIAN_LENS_S5_CONTROL_PROFILE_SHA256,
    JACOBIAN_LENS_S5_EXPERIMENT_PROFILE,
    JACOBIAN_LENS_S5_FIT_BINDING_SCHEMA,
    JACOBIAN_LENS_S5_FIT_RECEIPT_SCHEMA,
    JACOBIAN_LENS_S5_FORMULA_SHA256,
    JACOBIAN_LENS_S5_TENSOR_DIGEST_SCHEMA,
    JACOBIAN_LENS_V2_TRANSPORT_PROFILE,
    fit_endpoint_unscaled_centered_jacobian_lens_v1,
    jacobian_lens_s5_fit_binding_payload,
    jacobian_lens_s5_fit_receipt_fields,
    jacobian_lens_s5_tensor_sha256,
    load_jacobian_lens_artifact,
    save_jacobian_lens_artifact,
    sha256_file,
    sha256_json,
)


SELECTION_MANIFEST_SCHEMA = "holoscript.jspace-s5-selection-manifest.v0.1.0"
FIT_RECEIPT_SCHEMA = JACOBIAN_LENS_S5_FIT_RECEIPT_SCHEMA
PILOT_ADMISSION_SCHEMA = "holoscript.jspace-s5-pilot-admission.v0.1.0"
FIDELITY_SCHEMA = "holoscript.model-workspace-fidelity-evaluation.v0.4.0"
FIDELITY_GATE_PROFILE = JACOBIAN_LENS_S5_EXPERIMENT_PROFILE
COLLECTION_SCHEMA = "holoserve.workspace-signal-collection.v0.1.0"
FROZEN_LAYERS = [2, 5, 8]
FROZEN_PRIMARY_LAYERS = [2, 5]
FROZEN_POSITION_BINS = [[0, 127], [128, 255], [256, 383], [384, 511]]
FROZEN_DIM_BATCH = 8
FROZEN_MAX_SEQ_LEN = 512
FROZEN_STAGE_ROWS = 36
FROZEN_POSITION_BIN_COUNTS = [9, 9, 9, 9]
FROZEN_CHECKPOINT_SHA256 = s4.FROZEN_CHECKPOINT_SHA256
FROZEN_TOKENIZER_SHA256 = s4.FROZEN_TOKENIZER_SHA256
FROZEN_S4_SELECTION_MANIFEST_SHA256 = s4.FROZEN_S4_SELECTION_MANIFEST_SHA256
FROZEN_S4_SELECTION_MANIFEST_SELF_HASH = s4.FROZEN_S4_SELECTION_MANIFEST_SELF_HASH
FROZEN_S4_FAILED_PILOT_MANIFEST_SHA256 = (
    "sha256:1d3ca97311f929343b6569a211324b45133934f4e05caaabd5464989f1ffcfe0"
)
FROZEN_S4_FAILED_PILOT_MANIFEST_SELF_HASH = (
    "sha256:21d7b5f82e141773fe32634ba50c62759c9929ba9386fd2ce2bbaaa76df8a38f"
)
FROZEN_S5_PREREGISTRATION_SHA256 = (
    "sha256:9802d838be9832aa011903ae29799f44b176820d9c12a8600d97e39e4338b599"
)
FROZEN_S5_SELECTOR_SHA256 = (
    "sha256:063a92a961c7e41a64a022f3ca316c5d832afe1a7ca377756a723a66639a8317"
)
FROZEN_S5_SELECTION_MANIFEST_SHA256 = (
    "sha256:858a9da11e6feb241cec38dbf5f1ec56a2ce88a801dacb0384de11e5b44714f5"
)
FROZEN_S5_SELECTION_MANIFEST_SELF_HASH = (
    "sha256:c044400e6bcefdb0313b141876ec990911cb895640dd933b9edf9a400d933317"
)
FROZEN_S5_SOURCE_COORDINATE_SHA256 = (
    "sha256:1a5a1291a0f215c1a73f74683bbf34bef79b1ed953b8cb17e21192a46ce93ecc"
)
FROZEN_OUTPUT_SHA256 = {
    "pilot": {
        "a": "sha256:f744a9e445409c463288c952cf405b27c27a1bb439caabde646b72f6b4d8bace",
        "b": "sha256:077b3a39981ba27fd2d5df594f2a4e0860062a0b30a7e57e86def5779240c89d",
        "h": "sha256:4e74d069a11c27d6a254c21a627f5426a6b6c2526309868e4ae61dc119bf3e6b",
    },
    "confirmation": {
        "a": "sha256:2eaf9b5df0d59426eefee647a8993d07fd0eecb67aeabe1c07263c8a3a18bb49",
        "b": "sha256:28ae25ba2d8ebb6930da3cafac28c9f2064e24c500766dcef42b7283e73830dc",
        "h": "sha256:c238b3de16dba25f8ca645c8a3f6c15825e81781548684c434d00cfb36cca236",
    },
}
FROZEN_FORMULA_SHA256 = (
    "sha256:b776c634fb7b171952149c5fed7a9e3a8a73ad98798e10ce469687fc6817c6a1"
)
FROZEN_CONTROL_PROFILE_SHA256 = (
    "sha256:af99d45a1963ca975078a5b29d1803d936441ddfa1cfa42d953430880d0a4e0b"
)
FROZEN_ENDPOINT_TEXT = s4.FROZEN_ENDPOINT_TEXT
if (
    JACOBIAN_LENS_S5_FORMULA_SHA256 != FROZEN_FORMULA_SHA256
    or JACOBIAN_LENS_S5_CONTROL_PROFILE_SHA256 != FROZEN_CONTROL_PROFILE_SHA256
    or JACOBIAN_LENS_S5_EXPERIMENT_PROFILE
    != "s5-unscaled-mean-centered-jacobian-v1"
):
    raise RuntimeError("S5 runtime formula, control, or experiment profile drifted")


FIT_SOURCE_PATHS = (
    "scripts/research/fit_jspace_s5_lens.py",
    "scripts/research/test_fit_jspace_s5_lens.py",
    "scripts/research/select_jspace_s5_corpus.py",
    "scripts/research/test_select_jspace_s5_corpus.py",
    "scripts/research/fit_jspace_s4_lens.py",
    "scripts/research/test_fit_jspace_s4_lens.py",
    "scripts/research/select_jspace_s4_corpus.py",
    "scripts/research/test_select_jspace_s4_corpus.py",
    "research/2026-07-15-jspace-s4-centered-scalar-preregistration.md",
    "research/2026-07-15-jspace-s5-unscaled-centered-preregistration.md",
    "research/data/jspace-s2/corpus-manifest.json",
    "research/data/jspace-s2/leakage-report.json",
    "research/data/jspace-s2/reference-manifest.json",
    "research/data/jspace-s3/selection-manifest.json",
    "research/data/jspace-s4/selection-manifest.json",
    "research/data/jspace-s4/control-profile.json",
    "research/data/jspace-s4/fit-a-confirmation.jsonl",
    "research/data/jspace-s4/fit-b-confirmation.jsonl",
    "research/data/jspace-s4/fidelity-h-confirmation.jsonl",
    "research/measurements/jspace-s4/pilot-manifest.json",
    "research/measurements/jspace-s4/pilot-a-fit.json",
    "research/measurements/jspace-s4/pilot-b-fit.json",
    "research/measurements/jspace-s4/pilot-collection.json",
    "research/measurements/jspace-s4/pilot-fidelity.json",
    "research/measurements/jspace-s4/pilot-rows.jsonl",
    "research/measurements/jspace-s4/pilot-receipts.jsonl",
    "research/data/jspace-s5/selection-manifest.json",
    "research/data/jspace-s5/control-profile.json",
    "research/data/jspace-s5/fit-a-pilot.jsonl",
    "research/data/jspace-s5/fit-a-confirmation.jsonl",
    "research/data/jspace-s5/fit-b-pilot.jsonl",
    "research/data/jspace-s5/fit-b-confirmation.jsonl",
    "research/data/jspace-s5/fidelity-h-pilot.jsonl",
    "research/data/jspace-s5/fidelity-h-confirmation.jsonl",
    "packages/holoserve-py/holoserve/model.py",
    "packages/holoserve-py/holoserve/tokenizer.py",
    "packages/holoserve-py/holoserve/workspace_probe.py",
    "packages/holoserve-py/holoserve/workspace_eval.py",
    "packages/holoserve-py/holoserve/workspace_fidelity.py",
    "packages/holoserve-py/holoserve/server.py",
    "packages/holoserve-py/tests/test_workspace_probe.py",
    "packages/holoserve-py/tests/test_workspace_fidelity.py",
    "packages/holoserve-py/tests/test_server_registry.py",
    "packages/holollama/src/model-workspace-probe.ts",
    "packages/holollama/src/index.ts",
    "packages/holollama/src/__tests__/holollama.test.ts",
)

FIT_RECEIPT_FIELDS = {
    "schema",
    "createdAt",
    "startedAt",
    "gitRevision",
    "stage",
    "lane",
    "experimentProfile",
    "estimator",
    "paperParity",
    "transportProfile",
    "formulaSha256",
    "controlProfileSha256",
    "tensorDigestSchema",
    "tensorSha256",
    "fitBindingSha256",
    "primaryAlphaInterior",
    "primaryBetaInterior",
    "positionPolicy",
    "positionBins",
    "layers",
    "dimBatch",
    "maxSeqLen",
    "checkpointSha256",
    "tokenizerSha256",
    "preregistrationSha256",
    "selectorSha256",
    "sourceS4SelectionManifestSha256",
    "sourceS4SelectionManifestSelfHash",
    "sourceS4FailedPilotManifestSha256",
    "sourceS4FailedPilotManifestSelfHash",
    "selectionManifestSha256",
    "selectionManifestSelfHash",
    "pilotAdmissionManifestSha256",
    "pilotAdmissionManifestSelfHash",
    "sourceArtifactSha256",
    "corpusArtifactSha256",
    "coordinateSetSha256",
    "calibrationCorpusSha256",
    "calibrationShardSha256",
    "promptHashSetSha256",
    "sequenceSetSha256",
    "sequenceOrderSha256",
    "caseIdSetSha256",
    "sourceSelectionSha256",
    "rowCount",
    "positionBinCounts",
    "lensSha256",
    "fitScriptSha256",
    "fitSourceSha256s",
    "elapsedMillis",
    "peakGpuMemoryBytes",
    "gpuTotalMemoryBytes",
    "peakGpuMemoryShareE8",
    "runtime",
    "model",
    "semanticLabelsAccessed",
    "selfHash",
}


def _contains_private_numeric_scalars(
    value: object, path: tuple[str, ...] = ()
) -> bool:
    raw_symbols = {"s", "c", "si", "ci", "jbar", "xbar", "ybar", "m", "b"}
    allowed_scalar_fields = {
        "primaryalphainterior",
        "primarybetainterior",
        "scalibratedgainbootstraplowerabovezero",
        "unscaledgainbootstraplowerabovezero",
        "jacobianspecificgainbootstraplowerabovezero",
        "unscaledovercalibratedclaimadmitted",
        "jacobianspecificclaimadmitted",
    }
    if isinstance(value, dict):
        if path and path[-1] == "fitsourcesha256s":
            return any(
                not isinstance(source, str) or not s4._is_sha256(digest)
                for source, digest in value.items()
            )
        for key, nested in value.items():
            normalized = "".join(char for char in str(key).lower() if char.isalnum())
            public_control = (
                normalized in {"scalarcalibrated", "scalaridentity"}
                and bool(path)
                and path[-1] == "transportcontrolmetrics"
                and "observation" in path
                and "layers" in path
            )
            if normalized in raw_symbols and not isinstance(nested, dict):
                return True
            if "alpha" in normalized or "beta" in normalized:
                if normalized not in allowed_scalar_fields:
                    return True
            if "statistic" in normalized or normalized.endswith("stats"):
                return True
            if "scalar" in normalized and not public_control:
                return True
            if _contains_private_numeric_scalars(nested, (*path, normalized)):
                return True
    elif isinstance(value, list):
        return any(_contains_private_numeric_scalars(item, path) for item in value)
    return False


def _source_selection_payload(
    *,
    stage: str,
    lane: str,
    manifest: Mapping[str, Any],
    binding: Mapping[str, Any],
    sequence_order_sha256: str,
) -> dict[str, Any]:
    return {
        "schema": "holoscript.jspace-s5-source-selection.v0.1.0",
        "stage": stage,
        "lane": lane,
        "preregistrationSha256": FROZEN_S5_PREREGISTRATION_SHA256,
        "selectorSha256": FROZEN_S5_SELECTOR_SHA256,
        "selectionManifestSha256": FROZEN_S5_SELECTION_MANIFEST_SHA256,
        "selectionManifestSelfHash": FROZEN_S5_SELECTION_MANIFEST_SELF_HASH,
        "sourceS4SelectionManifestSha256": FROZEN_S4_SELECTION_MANIFEST_SHA256,
        "sourceS4SelectionManifestSelfHash": FROZEN_S4_SELECTION_MANIFEST_SELF_HASH,
        "sourceS4FailedPilotManifestSha256": FROZEN_S4_FAILED_PILOT_MANIFEST_SHA256,
        "sourceS4FailedPilotManifestSelfHash": FROZEN_S4_FAILED_PILOT_MANIFEST_SELF_HASH,
        "checkpointSha256": manifest["checkpointSha256"],
        "tokenizerSha256": manifest["tokenizerSha256"],
        "sourceArtifactSha256": binding["sha256"],
        "corpusArtifactSha256": binding["sha256"],
        "coordinateSetSha256": binding["coordinateSetSha256"],
        "caseIdSetSha256": binding["caseIdSetSha256"],
        "promptHashSetSha256": binding["promptHashSetSha256"],
        "sequenceSetSha256": binding["sequenceHashSetSha256"],
        "sequenceOrderSha256": sequence_order_sha256,
        "rowCount": binding["rowCount"],
    }


def _git_revision() -> str:
    return s4._git_revision()


def _require_clean_fit_sources(
    git_revision: str, additional_paths: Sequence[str]
) -> dict[str, str]:
    paths = tuple(dict.fromkeys((*FIT_SOURCE_PATHS, *additional_paths)))
    status = subprocess.run(
        ["git", "status", "--porcelain=v1", "--untracked-files=all", "--", *paths],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    if status.stdout.strip():
        raise RuntimeError(
            "fit sources must be committed and clean before S5 observation: "
            f"{status.stdout.strip()}"
        )
    tracked = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", git_revision, "--", *paths],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    if set(tracked.stdout.splitlines()) != set(paths):
        raise RuntimeError("every S5 fit source must be tracked by the exact revision")
    return {path: sha256_file(REPO_ROOT / path) for path in FIT_SOURCE_PATHS}


def _require_unchanged_fit_sources(expected: Mapping[str, str]) -> None:
    observed = {path: sha256_file(REPO_ROOT / path) for path in expected}
    if observed != dict(expected):
        raise RuntimeError("S5 fit source changed during model observation")


def _require_receipt_sources_at_revision(receipt: Mapping[str, Any]) -> None:
    revision = receipt.get("gitRevision")
    sources = receipt.get("fitSourceSha256s")
    if not s4._is_git_revision(revision) or not isinstance(sources, dict):
        raise ValueError("S5 fit receipt lacks exact-revision source hashes")
    if set(sources) != set(FIT_SOURCE_PATHS):
        raise ValueError("S5 fit receipt source set differs from its frozen source set")
    for relative, expected in sources.items():
        if not isinstance(relative, str) or not s4._is_sha256(expected):
            raise ValueError("S5 fit receipt source hash entry is invalid")
        path = s4._resolve_repo_file(relative)
        if sha256_file(path) != expected:
            raise ValueError("S5 fit receipt source bytes differ from current sources")
        blob = subprocess.run(
            ["git", "show", f"{revision}:{relative}"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
        ).stdout
        if s4._sha256_bytes(blob) != expected:
            raise ValueError("S5 fit source hash differs from its exact revision")


S5_STATISTIC_KEYS = (
    "centeredJacobianEnergyMeans",
    "centeredJacobianTargetCrossMeans",
    "centeredIdentityEnergyMeans",
    "centeredIdentityTargetCrossMeans",
)
S5_ARTIFACT_FIELDS = {
    "schema",
    "kind",
    "method",
    "estimator",
    "implementationVersion",
    "model",
    "tokenizer",
    "calibration",
    "layers",
    "matrices",
    "biases",
    "sourceMeans",
    "targetMeans",
    "jacobianSourceProductMeans",
    *S5_STATISTIC_KEYS,
    "fitBinding",
}


def _validate_affine_artifact(
    artifact: Mapping[str, Any],
    *,
    expected_sequence_sha256s: Sequence[str],
    expected_position_bin_counts: Sequence[int],
    source_artifact_sha256: str,
    fit_source_sha256s: Mapping[str, str],
) -> dict[str, Any]:
    expected_estimator = {
        "name": JACOBIAN_LENS_ESTIMATOR_V2,
        "paperParity": False,
        "vectorization": "batched-endpoint-output-cotangents-retained-graph",
        "transportProfile": JACOBIAN_LENS_V2_TRANSPORT_PROFILE,
        "anchor": "binwise-target-mean-minus-jacobian-source-mean",
    }
    if (
        set(artifact) != S5_ARTIFACT_FIELDS
        or artifact.get("estimator") != expected_estimator
        or artifact.get("layers") != FROZEN_LAYERS
        or any(
            key in artifact
            for key in ("alpha", "beta", "alphaRaw", "betaRaw", "scalars")
        )
    ):
        raise ValueError("S5 artifact estimator, fields, or privacy contract mismatch")
    calibration = artifact.get("calibration")
    if not isinstance(calibration, dict) or (
        calibration.get("positionPolicy") != "endpoint-self-only"
        or calibration.get("positionBins") != FROZEN_POSITION_BINS
        or calibration.get("positionBinCounts") != list(expected_position_bin_counts)
        or calibration.get("sequenceSha256s") != list(expected_sequence_sha256s)
        or calibration.get("sequenceCount") != len(expected_sequence_sha256s)
        or calibration.get("jacobianCount") != len(expected_sequence_sha256s)
        or calibration.get("corpusSha256")
        != sha256_json(list(expected_sequence_sha256s))
        or calibration.get("dimBatch") != FROZEN_DIM_BATCH
        or calibration.get("maxSeqLen") != FROZEN_MAX_SEQ_LEN
    ):
        raise ValueError("S5 artifact calibration source selection mismatch")

    fit_binding = artifact.get("fitBinding")
    if (
        not isinstance(fit_binding, dict)
        or set(fit_source_sha256s) != set(FIT_SOURCE_PATHS)
        or any(not s4._is_sha256(value) for value in fit_source_sha256s.values())
    ):
        raise ValueError("S5 artifact is missing its receipt-required fit binding")
    expected_binding = jacobian_lens_s5_fit_binding_payload(
        dict(artifact),
        source_artifact_sha256=source_artifact_sha256,
        preregistration_sha256=FROZEN_S5_PREREGISTRATION_SHA256,
        selector_sha256=FROZEN_S5_SELECTOR_SHA256,
        fit_source_sha256s=dict(fit_source_sha256s),
    )
    if (
        fit_binding != expected_binding
        or fit_binding.get("schema") != JACOBIAN_LENS_S5_FIT_BINDING_SCHEMA
        or fit_binding.get("experimentProfile") != FIDELITY_GATE_PROFILE
        or fit_binding.get("formulaSha256") != FROZEN_FORMULA_SHA256
        or fit_binding.get("controlProfileSha256")
        != FROZEN_CONTROL_PROFILE_SHA256
        or fit_binding.get("tensorDigestSchema")
        != JACOBIAN_LENS_S5_TENSOR_DIGEST_SCHEMA
        or fit_binding.get("tensorSha256")
        != jacobian_lens_s5_tensor_sha256(dict(artifact))
    ):
        raise ValueError("S5 artifact fit binding differs from the frozen contract")

    tensors = [
        artifact.get("matrices"),
        artifact.get("biases"),
        artifact.get("sourceMeans"),
        artifact.get("targetMeans"),
        artifact.get("jacobianSourceProductMeans"),
    ]
    if not all(isinstance(value, torch.Tensor) for value in tensors):
        raise ValueError("S5 artifact affine/control tensors are missing")
    matrices, biases, source_means, target_means, local_products = tensors
    matrix_shape = tuple(matrices.shape)
    if (
        len(matrix_shape) != 4
        or matrix_shape[:2] != (4, 3)
        or matrix_shape[2] != matrix_shape[3]
    ):
        raise ValueError("S5 artifact matrix shape mismatch")
    vector_shape = (4, 3, matrix_shape[2])
    if any(
        tuple(value.shape) != vector_shape
        for value in (biases, source_means, target_means, local_products)
    ):
        raise ValueError("S5 artifact vector shape mismatch")
    if not all(
        value.dtype == torch.float32 and torch.isfinite(value).all()
        for value in tensors
    ):
        raise ValueError("S5 affine/control tensors must be finite float32")
    if not torch.equal(target_means, target_means[:, :1].expand_as(target_means)):
        raise ValueError("S5 target means disagree across layers")

    statistics = [artifact.get(name) for name in S5_STATISTIC_KEYS]
    if not all(isinstance(value, torch.Tensor) for value in statistics):
        raise ValueError("S5 control sufficient-statistic tensors are missing")
    if any(
        tuple(value.shape) != (4, 3)
        or value.dtype != torch.float64
        or not torch.isfinite(value).all()
        for value in statistics
    ):
        raise ValueError("S5 control statistics must be finite float64 [4,3]")
    energy, cross, identity_energy, identity_cross = statistics
    if bool((energy <= 0).any()) or bool((identity_energy <= 0).any()):
        raise ValueError("S5 control calibration energies must be positive")
    alpha_raw = cross / ((1.0 + 0.001) * energy)
    beta_raw = identity_cross / ((1.0 + 0.001) * identity_energy)
    if not torch.isfinite(alpha_raw).all() or not torch.isfinite(beta_raw).all():
        raise ValueError("S5 unclipped control coefficients must be finite")
    alpha = torch.clamp(alpha_raw, min=0.0, max=2.0)
    beta = torch.clamp(beta_raw, min=0.0, max=2.0)

    expected_bias = target_means.to(torch.float64) - torch.einsum(
        "blij,blj->bli",
        matrices.to(torch.float64),
        source_means.to(torch.float64),
    )
    if not torch.allclose(
        biases.to(torch.float64), expected_bias, rtol=2e-5, atol=2e-5
    ):
        raise ValueError("S5 artifact bias does not match the frozen formula")
    primary_indices = [FROZEN_LAYERS.index(layer) for layer in FROZEN_PRIMARY_LAYERS]
    return {
        "tensorSha256": jacobian_lens_s5_tensor_sha256(dict(artifact)),
        "fitBindingSha256": sha256_json(fit_binding),
        "primaryAlphaInterior": bool(
            ((alpha[:, primary_indices] > 0) & (alpha[:, primary_indices] < 2))
            .all()
            .item()
        ),
        "primaryBetaInterior": bool(
            ((beta[:, primary_indices] > 0) & (beta[:, primary_indices] < 2))
            .all()
            .item()
        ),
    }


def _pilot_calibration_binding(
    lane: str, pilot_binding: Mapping[str, Any]
) -> dict[str, Any]:
    expected_file = f"fit-{lane}-pilot.jsonl"
    if pilot_binding.get("file") != expected_file:
        raise ValueError(f"S5 pilot {lane} fit artifact path is not frozen")
    path = REPO_ROOT / "research" / "data" / "jspace-s5" / expected_file
    if sha256_file(path) != pilot_binding.get("sha256"):
        raise ValueError(f"S5 pilot {lane} bytes differ from the manifest")
    rows = s4._read_jsonl(path)
    sequence_sha256s = [row.get("sequenceSha256") for row in rows]
    sequence_token_counts = [row.get("tokenCount") for row in rows]
    if (
        len(rows) != FROZEN_STAGE_ROWS
        or any(not s4._is_sha256(value) for value in sequence_sha256s)
        or any(
            type(value) is not int or value < 1 for value in sequence_token_counts
        )
    ):
        raise ValueError(f"S5 pilot {lane} calibration metadata is invalid")
    return {
        "sequenceOrderSha256": sha256_json(sequence_sha256s),
        "sequenceSetSha256": sha256_json(sorted(sequence_sha256s)),
        "calibrationShardSha256": sha256_json(
            {
                "sequenceSha256s": sequence_sha256s,
                "sequenceTokenCounts": sequence_token_counts,
            }
        ),
    }


def _validate_fit_receipt_payload(
    receipt: Mapping[str, Any],
    *,
    lane: str,
    pilot_binding: Mapping[str, Any],
    manifest: Mapping[str, Any],
    verify_revision_sources: bool,
) -> None:
    calibration_binding = _pilot_calibration_binding(lane, pilot_binding)
    sequence_order = receipt.get("sequenceOrderSha256")
    selection_payload = _source_selection_payload(
        stage="pilot",
        lane=lane,
        manifest=manifest,
        binding=pilot_binding,
        sequence_order_sha256=(
            sequence_order if isinstance(sequence_order, str) else ""
        ),
    )
    started_at = s4._parse_utc_timestamp(receipt.get("startedAt"))
    created_at = s4._parse_utc_timestamp(receipt.get("createdAt"))
    peak_bytes = receipt.get("peakGpuMemoryBytes")
    total_bytes = receipt.get("gpuTotalMemoryBytes")
    peak_share = receipt.get("peakGpuMemoryShareE8")
    memory_valid = (
        type(peak_bytes) is int
        and peak_bytes >= 0
        and type(total_bytes) is int
        and total_bytes >= 0
        and type(peak_share) is int
        and peak_share
        == (
            0
            if total_bytes == 0
            else (peak_bytes * 100_000_000 + total_bytes // 2) // total_bytes
        )
        and (total_bytes > 0 or peak_bytes == 0)
    )
    if (
        set(receipt) != FIT_RECEIPT_FIELDS
        or receipt.get("schema") != FIT_RECEIPT_SCHEMA
        or receipt.get("selfHash")
        != sha256_json({**receipt, "selfHash": None})
        or not s4._is_git_revision(receipt.get("gitRevision"))
        or receipt.get("stage") != "pilot"
        or receipt.get("lane") != lane
        or receipt.get("experimentProfile") != FIDELITY_GATE_PROFILE
        or receipt.get("estimator") != JACOBIAN_LENS_ESTIMATOR_V2
        or receipt.get("paperParity") is not False
        or receipt.get("transportProfile") != JACOBIAN_LENS_V2_TRANSPORT_PROFILE
        or receipt.get("formulaSha256") != FROZEN_FORMULA_SHA256
        or receipt.get("controlProfileSha256")
        != FROZEN_CONTROL_PROFILE_SHA256
        or receipt.get("tensorDigestSchema")
        != JACOBIAN_LENS_S5_TENSOR_DIGEST_SCHEMA
        or not s4._is_sha256(receipt.get("tensorSha256"))
        or not s4._is_sha256(receipt.get("fitBindingSha256"))
        or type(receipt.get("primaryAlphaInterior")) is not bool
        or type(receipt.get("primaryBetaInterior")) is not bool
        or receipt.get("positionPolicy") != "endpoint-self-only"
        or receipt.get("positionBins") != FROZEN_POSITION_BINS
        or receipt.get("layers") != FROZEN_LAYERS
        or receipt.get("dimBatch") != FROZEN_DIM_BATCH
        or receipt.get("maxSeqLen") != FROZEN_MAX_SEQ_LEN
        or receipt.get("checkpointSha256") != FROZEN_CHECKPOINT_SHA256
        or receipt.get("tokenizerSha256") != FROZEN_TOKENIZER_SHA256
        or receipt.get("preregistrationSha256")
        != FROZEN_S5_PREREGISTRATION_SHA256
        or receipt.get("selectorSha256") != FROZEN_S5_SELECTOR_SHA256
        or receipt.get("sourceS4SelectionManifestSha256")
        != FROZEN_S4_SELECTION_MANIFEST_SHA256
        or receipt.get("sourceS4SelectionManifestSelfHash")
        != FROZEN_S4_SELECTION_MANIFEST_SELF_HASH
        or receipt.get("sourceS4FailedPilotManifestSha256")
        != FROZEN_S4_FAILED_PILOT_MANIFEST_SHA256
        or receipt.get("sourceS4FailedPilotManifestSelfHash")
        != FROZEN_S4_FAILED_PILOT_MANIFEST_SELF_HASH
        or receipt.get("selectionManifestSha256")
        != FROZEN_S5_SELECTION_MANIFEST_SHA256
        or receipt.get("selectionManifestSelfHash")
        != FROZEN_S5_SELECTION_MANIFEST_SELF_HASH
        or receipt.get("pilotAdmissionManifestSha256") is not None
        or receipt.get("pilotAdmissionManifestSelfHash") is not None
        or receipt.get("sourceArtifactSha256") != pilot_binding.get("sha256")
        or receipt.get("corpusArtifactSha256") != pilot_binding.get("sha256")
        or receipt.get("coordinateSetSha256")
        != pilot_binding.get("coordinateSetSha256")
        or receipt.get("caseIdSetSha256")
        != pilot_binding.get("caseIdSetSha256")
        or receipt.get("promptHashSetSha256")
        != pilot_binding.get("promptHashSetSha256")
        or receipt.get("sequenceSetSha256")
        != pilot_binding.get("sequenceHashSetSha256")
        or receipt.get("sequenceSetSha256")
        != calibration_binding["sequenceSetSha256"]
        or receipt.get("sequenceOrderSha256")
        != calibration_binding["sequenceOrderSha256"]
        or receipt.get("calibrationCorpusSha256")
        != calibration_binding["sequenceOrderSha256"]
        or receipt.get("calibrationShardSha256")
        != calibration_binding["calibrationShardSha256"]
        or receipt.get("rowCount") != FROZEN_STAGE_ROWS
        or receipt.get("positionBinCounts") != FROZEN_POSITION_BIN_COUNTS
        or receipt.get("sourceSelectionSha256") != sha256_json(selection_payload)
        or receipt.get("semanticLabelsAccessed") is not False
        or not s4._is_sha256(receipt.get("lensSha256"))
        or type(receipt.get("elapsedMillis")) is not int
        or receipt["elapsedMillis"] <= 0
        or started_at is None
        or created_at is None
        or created_at < started_at
        or not memory_valid
        or not 0 <= receipt["peakGpuMemoryShareE8"] <= 90_000_000
        or _contains_private_numeric_scalars(receipt)
    ):
        raise ValueError(f"pilot {lane} fit receipt does not match frozen S5")
    fit_sources = receipt.get("fitSourceSha256s")
    if (
        not isinstance(fit_sources, dict)
        or set(fit_sources) != set(FIT_SOURCE_PATHS)
        or any(not s4._is_sha256(value) for value in fit_sources.values())
        or receipt.get("fitScriptSha256")
        != fit_sources.get("scripts/research/fit_jspace_s5_lens.py")
    ):
        raise ValueError("S5 fit receipt source digest binding is invalid")
    if verify_revision_sources:
        _require_receipt_sources_at_revision(receipt)


def _validate_generated_receipt_payload(
    receipt: Mapping[str, Any],
    *,
    artifact: Mapping[str, Any],
    artifact_validation: Mapping[str, Any],
    corpus_binding: Mapping[str, Any],
    fit_source_sha256s: Mapping[str, str],
) -> None:
    lens_sha256 = receipt.get("lensSha256")
    if not isinstance(lens_sha256, str):
        raise RuntimeError("generated S5 fit receipt lacks its lens digest")
    core_fields = jacobian_lens_s5_fit_receipt_fields(
        dict(artifact), lens_sha256=lens_sha256
    )
    if (
        set(fit_source_sha256s) != set(FIT_SOURCE_PATHS)
        or
        {key: receipt.get(key) for key in core_fields} != core_fields
        or receipt.get("selfHash")
        != sha256_json({**receipt, "selfHash": None})
        or receipt.get("tensorSha256")
        != artifact_validation.get("tensorSha256")
        or receipt.get("fitBindingSha256")
        != artifact_validation.get("fitBindingSha256")
        or receipt.get("primaryAlphaInterior")
        is not artifact_validation.get("primaryAlphaInterior")
        or receipt.get("primaryBetaInterior")
        is not artifact_validation.get("primaryBetaInterior")
        or receipt.get("sourceSelectionSha256")
        != corpus_binding.get("sourceSelectionSha256")
        or receipt.get("sourceArtifactSha256")
        != corpus_binding.get("sourceArtifactSha256")
        or receipt.get("corpusArtifactSha256")
        != corpus_binding.get("corpusArtifactSha256")
        or receipt.get("fitSourceSha256s") != dict(fit_source_sha256s)
        or receipt.get("fitScriptSha256")
        != fit_source_sha256s.get("scripts/research/fit_jspace_s5_lens.py")
        or receipt.get("semanticLabelsAccessed") is not False
        or _contains_private_numeric_scalars(receipt)
    ):
        raise RuntimeError("generated S5 receipt differs from frozen bindings")


def _derive_attribution_admission(
    fit_receipts: Mapping[str, Mapping[str, Any]],
    aliases: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    per_lane: dict[str, dict[str, bool]] = {}
    for lane in ("a", "b"):
        receipt = fit_receipts.get(lane)
        alias = aliases.get(lane)
        attribution = alias.get("attribution") if isinstance(alias, Mapping) else None
        gates = attribution.get("gates") if isinstance(attribution, Mapping) else None
        if (
            not isinstance(receipt, Mapping)
            or type(receipt.get("primaryAlphaInterior")) is not bool
            or type(receipt.get("primaryBetaInterior")) is not bool
            or not isinstance(gates, Mapping)
            or set(gates) != {"meanCentering", "unscaled", "jacobianSpecific"}
            or any(type(value) is not bool for value in gates.values())
        ):
            raise ValueError("S5 attribution evidence is incomplete or malformed")
        per_lane[lane] = {
            "primaryAlphaInterior": receipt["primaryAlphaInterior"],
            "primaryBetaInterior": receipt["primaryBetaInterior"],
            "meanCenteringGainBootstrapLowerAboveZero": gates["meanCentering"],
            "unscaledGainBootstrapLowerAboveZero": gates["unscaled"],
            "jacobianSpecificGainBootstrapLowerAboveZero": gates[
                "jacobianSpecific"
            ],
        }
    mean_centering = all(
        lane["meanCenteringGainBootstrapLowerAboveZero"]
        for lane in per_lane.values()
    )
    unscaled = mean_centering and all(
        lane["primaryAlphaInterior"]
        and lane["unscaledGainBootstrapLowerAboveZero"]
        for lane in per_lane.values()
    )
    jacobian_specific = all(
        lane["primaryBetaInterior"]
        and lane["jacobianSpecificGainBootstrapLowerAboveZero"]
        for lane in per_lane.values()
    )
    return {
        "experimentProfile": FIDELITY_GATE_PROFILE,
        "perLane": per_lane,
        "meanCenteringClaimAdmitted": mean_centering,
        "unscaledOverCalibratedClaimAdmitted": unscaled,
        "jacobianSpecificClaimAdmitted": jacobian_specific,
    }


def _validate_pilot_admission(
    args: argparse.Namespace,
    *,
    selection_manifest_path: Path,
    selection_manifest: Mapping[str, Any],
    preregistration_path: Path,
) -> tuple[dict[str, Any] | None, tuple[str, ...]]:
    if args.stage != "confirmation":
        if args.pilot_evidence:
            raise ValueError("pilot admission evidence is only valid for confirmation")
        return None, ()
    if not args.pilot_evidence:
        if args.dry_run:
            return None, ()
        raise ValueError(
            "confirmation observation requires a committed exact-revision passing S5 pilot"
        )
    evidence_path = Path(args.pilot_evidence).resolve()
    if not evidence_path.is_file():
        raise FileNotFoundError(evidence_path)
    s4._repo_relative(evidence_path)
    evidence = s4._read_json(evidence_path)
    fit_bindings = evidence.get("fitReceipts")
    fit_evidence = evidence.get("fitEvidence")
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
        or evidence.get("formulaSha256") != FROZEN_FORMULA_SHA256
        or evidence.get("controlProfileSha256")
        != FROZEN_CONTROL_PROFILE_SHA256
        or evidence.get("experimentProfile") != FIDELITY_GATE_PROFILE
        or not s4._is_git_revision(evidence.get("gitRevision"))
        or not isinstance(fit_bindings, dict)
        or set(fit_bindings) != {"a", "b"}
        or not isinstance(fit_evidence, dict)
        or set(fit_evidence) != {"a", "b"}
        or _contains_private_numeric_scalars(evidence)
    ):
        raise ValueError("confirmation S5 pilot-admission evidence is invalid")

    fidelity_path, fidelity = s4._validate_bound_json(
        evidence.get("fidelityArtifact"), schema=FIDELITY_SCHEMA
    )
    collection_path, collection = s4._validate_bound_json(
        evidence.get("collectionArtifact"), schema=COLLECTION_SCHEMA
    )
    rows_path = s4._validate_bound_file(evidence.get("rowsArtifact"))
    receipts_path = s4._validate_bound_file(evidence.get("receiptsArtifact"))
    fit_paths: dict[str, Path] = {}
    fit_receipts: dict[str, dict[str, Any]] = {}
    for lane in ("a", "b"):
        path, receipt = s4._validate_bound_json(
            fit_bindings[lane], schema=FIT_RECEIPT_SCHEMA
        )
        _validate_fit_receipt_payload(
            receipt,
            lane=lane,
            pilot_binding=selection_manifest["pilotArtifacts"][lane],
            manifest=selection_manifest,
            verify_revision_sources=True,
        )
        if receipt["gitRevision"] != evidence["gitRevision"]:
            raise ValueError("S5 pilot fit revisions differ from admission revision")
        fit_paths[lane] = path
        fit_receipts[lane] = receipt

    expected_fit_evidence = {
        lane: {
            "fitReceiptSha256": sha256_file(fit_paths[lane]),
            "fitReceiptSelfHash": fit_receipts[lane]["selfHash"],
            "lensSha256": fit_receipts[lane]["lensSha256"],
            "tensorSha256": fit_receipts[lane]["tensorSha256"],
            "fitBindingSha256": fit_receipts[lane]["fitBindingSha256"],
            "primaryAlphaInterior": fit_receipts[lane]["primaryAlphaInterior"],
            "primaryBetaInterior": fit_receipts[lane]["primaryBetaInterior"],
        }
        for lane in ("a", "b")
    }
    if fit_evidence != expected_fit_evidence:
        raise ValueError("S5 pilot fit/lens/tensor evidence binding mismatch")
    if sum(receipt["elapsedMillis"] for receipt in fit_receipts.values()) > 45 * 60 * 1000:
        raise ValueError("projected A+B S5 confirmation fit exceeds 45 minutes")

    aliases = fidelity.get("aliases")
    replication = fidelity.get("replication")
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
        or fidelity.get("preregistrationSha256") != sha256_file(preregistration_path)
        or fidelity.get("promptManifestSha256")
        != selection_manifest["pilotArtifacts"]["h"]["sha256"]
        or fidelity.get("gateProfile") != FIDELITY_GATE_PROFILE
        or fidelity.get("experimentProfile") != FIDELITY_GATE_PROFILE
        or fidelity.get("positionBins") != FROZEN_POSITION_BINS
        or fidelity.get("layers") != FROZEN_LAYERS
        or fidelity.get("primaryLayers") != FROZEN_PRIMARY_LAYERS
        or fidelity.get("ceilingLayer") != 8
        or fidelity.get("bootstrap")
        != {
            "method": "whole-task-family-percentile-v1",
            "samples": 10_000,
            "seed": "7301642128954031337",
        }
        or fidelity.get("checkpointSha256") != FROZEN_CHECKPOINT_SHA256
        or fidelity.get("tokenizerSha256") != FROZEN_TOKENIZER_SHA256
        or fidelity.get("codeFileSha256")
        != fit_receipts["a"]["fitSourceSha256s"][
            "packages/holoserve-py/holoserve/workspace_fidelity.py"
        ]
        or not isinstance(aliases, dict)
        or set(aliases) != {"a", "b"}
        or any(
            not isinstance(alias, dict)
            or alias.get("passed") is not True
            or alias.get("recordCount") != FROZEN_STAGE_ROWS
            or not isinstance(alias.get("gates"), dict)
            or set(alias["gates"]) != exact_gate_keys
            or set(alias["gates"].values()) != {True}
            or not isinstance(alias.get("attribution"), dict)
            or alias["attribution"].get("fitControlInteriorRequiredSeparately")
            is not True
            or not isinstance(alias["attribution"].get("gates"), dict)
            or set(alias["attribution"]["gates"])
            != {"meanCentering", "unscaled", "jacobianSpecific"}
            or any(
                type(value) is not bool
                for value in alias["attribution"]["gates"].values()
            )
            for alias in aliases.values()
        )
        or not isinstance(replication, dict)
        or replication.get("passed") is not True
        or type(replication.get("macroGainPearsonE8")) is not int
        or replication["macroGainPearsonE8"] < 90_000_000
        or type(replication.get("macroGainSignAgreementE8")) is not int
        or replication["macroGainSignAgreementE8"] < 90_000_000
        or _contains_private_numeric_scalars(fidelity)
    ):
        raise ValueError("bound S5 pilot fidelity does not admit confirmation")

    attribution_admission = _derive_attribution_admission(fit_receipts, aliases)
    if evidence.get("attributionAdmission") != attribution_admission:
        raise ValueError("S5 pilot attribution-claim binding mismatch")

    expected_lenses = {
        lane: fit_receipts[lane]["lensSha256"] for lane in ("a", "b")
    }
    model_lenses = {
        model.get("alias"): model.get("lensSha256")
        for model in fidelity.get("models", [])
        if isinstance(model, dict)
    }
    capabilities = collection.get("capabilities")
    if (
        model_lenses != expected_lenses
        or fidelity.get("collectionManifestSha256") != sha256_file(collection_path)
        or fidelity.get("rowsSha256") != sha256_file(rows_path)
        or fidelity.get("receiptsSha256") != sha256_file(receipts_path)
        or collection.get("codeRevision") != evidence["gitRevision"]
        or collection.get("codeFileSha256")
        != fit_receipts["a"]["fitSourceSha256s"][
            "packages/holoserve-py/holoserve/workspace_eval.py"
        ]
        or collection.get("checkpointSha256") != FROZEN_CHECKPOINT_SHA256
        or collection.get("tokenizerSha256") != FROZEN_TOKENIZER_SHA256
        or collection.get("promptManifestSha256")
        != selection_manifest["pilotArtifacts"]["h"]["sha256"]
        or collection.get("promptCount") != FROZEN_STAGE_ROWS
        or collection.get("rowCount") != 2 * FROZEN_STAGE_ROWS
        or collection.get("receiptCount") != 2 * FROZEN_STAGE_ROWS
        or collection.get("truncatedRowCount") != 0
        or collection.get("allowTruncated") is not False
        or collection.get("rowArtifactSha256") != sha256_file(rows_path)
        or collection.get("receiptArtifactSha256") != sha256_file(receipts_path)
        or not isinstance(capabilities, dict)
        or set(capabilities) != {"a", "b"}
        or any(
            not isinstance(capability, dict)
            or capability.get("lensSha256") != expected_lenses[lane]
            or capability.get("estimator") != JACOBIAN_LENS_ESTIMATOR_V2
            or capability.get("transportProfile")
            != JACOBIAN_LENS_V2_TRANSPORT_PROFILE
            or capability.get("experimentProfile") != FIDELITY_GATE_PROFILE
            or capability.get("positionPolicy") != "endpoint-self-only"
            or capability.get("positionBins") != FROZEN_POSITION_BINS
            or capability.get("layers") != FROZEN_LAYERS
            for lane, capability in capabilities.items()
        )
        or _contains_private_numeric_scalars(collection)
    ):
        raise ValueError("S5 pilot collection artifacts do not admit confirmation")
    provenance_paths = (
        evidence_path,
        fidelity_path,
        collection_path,
        rows_path,
        receipts_path,
        *fit_paths.values(),
    )
    return evidence, tuple(s4._repo_relative(path) for path in provenance_paths)


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
    if (
        sha256_file(checkpoint_path) != FROZEN_CHECKPOINT_SHA256
        or sha256_file(bins_dir / "tokenizer.json") != FROZEN_TOKENIZER_SHA256
        or sha256_file(preregistration_path) != FROZEN_S5_PREREGISTRATION_SHA256
        or sha256_file(REPO_ROOT / "scripts/research/select_jspace_s5_corpus.py")
        != FROZEN_S5_SELECTOR_SHA256
    ):
        raise ValueError(
            "checkpoint, tokenizer, preregistration, or S5 selector hash mismatch"
        )

    s2_manifest, s2_leakage, s2_reference, s2_full, s2_exposed = (
        selector.S4._verify_s2(REPO_ROOT / selector.S2_REPO_DIR)
    )
    s3_manifest, s3_pilot, s3_confirmation, _, s3_evidence = (
        selector.S4._verify_s3(
            s2_full,
            s2_exposed,
            s2_manifest,
            s2_leakage,
            s2_reference,
            REPO_ROOT / selector.S3_REPO_DIR,
            REPO_ROOT / selector.S3_MEASUREMENT_REPO_DIR,
        )
    )
    s4_manifest, _, s4_confirmation, coordinate_maps, s4_evidence = (
        selector._verify_s4(
            REPO_ROOT / selector.S4_REPO_DIR,
            REPO_ROOT / selector.S4_MEASUREMENT_REPO_DIR,
            s3_confirmation,
            s2_manifest,
            s2_leakage,
            s2_reference,
            s2_exposed,
            s3_manifest,
            s3_pilot,
            s3_evidence,
        )
    )
    manifest = s4._read_json(manifest_path)
    source_s4 = manifest.get("sourceS4")
    if (
        manifest.get("schema") != SELECTION_MANIFEST_SCHEMA
        or sha256_file(manifest_path) != FROZEN_S5_SELECTION_MANIFEST_SHA256
        or manifest.get("selfHash") != FROZEN_S5_SELECTION_MANIFEST_SELF_HASH
        or manifest.get("selfHash")
        != sha256_json({**manifest, "selfHash": None})
        or manifest.get("preregistrationSha256")
        != FROZEN_S5_PREREGISTRATION_SHA256
        or manifest.get("selectorSourceSha256") != FROZEN_S5_SELECTOR_SHA256
        or manifest.get("semanticLabelsAccessed") is not False
        or manifest.get("checkpointSha256") != FROZEN_CHECKPOINT_SHA256
        or manifest.get("tokenizerSha256") != FROZEN_TOKENIZER_SHA256
        or manifest.get("positionBins") != FROZEN_POSITION_BINS
        or not isinstance(source_s4, dict)
        or source_s4.get("semanticLabelsAccessed") is not False
        or source_s4.get("selectionManifest", {}).get("sha256")
        != FROZEN_S4_SELECTION_MANIFEST_SHA256
        or source_s4.get("selectionManifest", {}).get("selfHash")
        != FROZEN_S4_SELECTION_MANIFEST_SELF_HASH
        or source_s4.get("failedPilotEvidenceManifest", {}).get("sha256")
        != FROZEN_S4_FAILED_PILOT_MANIFEST_SHA256
        or source_s4.get("failedPilotEvidenceManifest", {}).get("selfHash")
        != FROZEN_S4_FAILED_PILOT_MANIFEST_SELF_HASH
        or s4_manifest.get("selfHash") != FROZEN_S4_SELECTION_MANIFEST_SELF_HASH
        or s4_evidence.get("selfHash")
        != FROZEN_S4_FAILED_PILOT_MANIFEST_SELF_HASH
        or FROZEN_OUTPUT_SHA256 != selector.EXPECTED_OUTPUT_SHA256
    ):
        raise ValueError("fit inputs do not match the frozen S5 selection manifest")

    source_coordinates = sorted(next(iter(coordinate_maps.values())))
    if selector._coordinate_hash(source_coordinates) != FROZEN_S5_SOURCE_COORDINATE_SHA256:
        raise ValueError("S5 source coordinate set differs from preregistration")
    pilot_coordinates = selector._pilot_coordinates()
    confirmation_coordinates = sorted(
        set(source_coordinates).difference(pilot_coordinates)
    )
    selector._balance_proof(
        pilot_coordinates, source_coordinates, stage="pilot"
    )
    selector._balance_proof(
        confirmation_coordinates, source_coordinates, stage="confirmation"
    )
    stage_rows: dict[str, dict[str, list[dict[str, Any]]]] = {
        "pilot": {},
        "confirmation": {},
    }
    for stage, coordinates in (
        ("pilot", pilot_coordinates),
        ("confirmation", confirmation_coordinates),
    ):
        group = manifest.get(
            "pilotArtifacts" if stage == "pilot" else "confirmationArtifacts"
        )
        if not isinstance(group, dict) or set(group) != {"a", "b", "h"}:
            raise ValueError(f"S5 {stage} must bind exact A/B/H artifacts")
        for lane in ("a", "b", "h"):
            binding = group[lane]
            path = (manifest_path.parent / binding.get("file", "")).resolve()
            if path.parent != manifest_path.parent or not path.is_file():
                raise ValueError("S5 artifact path is not manifest-relative")
            rows = s4._read_jsonl(path)
            selector._verify_binding(rows, path, binding, label=f"S5 {stage} {lane}")
            expected_rows = [coordinate_maps[lane][coordinate] for coordinate in coordinates]
            if (
                rows != expected_rows
                or binding.get("sha256") != FROZEN_OUTPUT_SHA256[stage][lane]
                or [selector._coordinate(row) for row in rows] != coordinates
            ):
                raise ValueError(f"S5 {stage} {lane} differs from frozen partition")
            stage_rows[stage][lane] = rows
    for lane in ("a", "b", "h"):
        if sorted(
            stage_rows["pilot"][lane] + stage_rows["confirmation"][lane],
            key=selector._coordinate,
        ) != s4_confirmation[lane]:
            raise ValueError(f"S5 {lane} is not exact S4-confirmation partition")

    group_name = "pilotArtifacts" if args.stage == "pilot" else "confirmationArtifacts"
    binding = manifest[group_name][args.lane]
    expected_path = (manifest_path.parent / binding["file"]).resolve()
    if expected_path != corpus_path or sha256_file(corpus_path) != binding["sha256"]:
        raise ValueError("selected corpus does not match its exact S5 binding")
    rows = stage_rows[args.stage][args.lane]
    tokenizer = s4._read_json(bins_dir / "tokenizer.json")
    merges = tokenizer.get("merges")
    if not isinstance(merges, list):
        raise ValueError("tokenizer merges are missing")
    merge_id = {merge[2]: index for index, merge in enumerate(merges)}
    batches: list[torch.Tensor] = []
    for index, row in enumerate(rows):
        forbidden = sorted(FORBIDDEN_PROMPT_FIELDS.intersection(row))
        prompt = row.get("prompt")
        endpoint = FROZEN_ENDPOINT_TEXT.get(
            (row.get("taskForm"), row.get("variant"))
        )
        if forbidden:
            raise ValueError(f"corpus row {index} exposes semantic fields: {forbidden}")
        if (
            row.get("lane") != args.lane
            or row.get("truncated") is not False
            or row.get("frame") != "fidelity"
            or not isinstance(prompt, str)
            or endpoint is None
            or not prompt.endswith(f"\n\n{endpoint}")
            or prompt.endswith(("\n", " "))
        ):
            raise ValueError(f"corpus row {index} violates frozen prompt contract")
        tokens = [1, *encode_text(prompt, merges, merge_id)]
        sequence_sha256 = sha256_json(tokens)
        if (
            len(tokens) > FROZEN_MAX_SEQ_LEN
            or row.get("tokenCount") != len(tokens)
            or row.get("tokenIdsSha256") != sequence_sha256
            or row.get("sequenceSha256") != sequence_sha256
            or not isinstance(row.get("caseId"), str)
            or row.get("endpointTextSha256") != s4._sha256_text(endpoint)
        ):
            raise ValueError(f"corpus row {index} tokenization or identity mismatch")
        bin_index = selector._coordinate(row)[1]
        if not (
            FROZEN_POSITION_BINS[bin_index][0]
            <= len(tokens) - 1
            <= FROZEN_POSITION_BINS[bin_index][1]
        ):
            raise ValueError(f"corpus row {index} endpoint is outside position bin")
        batches.append(torch.tensor([tokens], dtype=torch.long))
    if len(batches) != FROZEN_STAGE_ROWS:
        raise ValueError("S5 corpus must contain exactly 36 rows")

    sequence_order_sha256 = sha256_json([row["sequenceSha256"] for row in rows])
    source_selection = _source_selection_payload(
        stage=args.stage,
        lane=args.lane,
        manifest=manifest,
        binding=binding,
        sequence_order_sha256=sequence_order_sha256,
    )
    admission, admission_paths = _validate_pilot_admission(
        args,
        selection_manifest_path=manifest_path,
        selection_manifest=manifest,
        preregistration_path=preregistration_path,
    )
    corpus_binding = {
        **source_selection,
        "sourceSelectionSha256": sha256_json(source_selection),
        "sequenceSha256s": [row["sequenceSha256"] for row in rows],
        "pilotAdmissionManifestSha256": (
            None
            if admission is None
            else sha256_file(Path(args.pilot_evidence).resolve())
        ),
        "pilotAdmissionManifestSelfHash": (
            None if admission is None else admission["selfHash"]
        ),
    }
    return batches, manifest, corpus_binding, {
        "checkpoint": checkpoint_path,
        "bins": bins_dir,
        "fitSourcePaths": admission_paths,
    }


def fit(args: argparse.Namespace) -> None:
    if args.layers != FROZEN_LAYERS or args.dim_batch != FROZEN_DIM_BATCH:
        raise ValueError("layers and dim batch must match frozen S5 preregistration")
    batches, _, corpus_binding, paths = _validate_inputs(args)
    if args.dry_run:
        print(
            json.dumps(
                {
                    "status": "validated",
                    "lane": args.lane,
                    "stage": args.stage,
                    "rowCount": len(batches),
                    "corpusSha256": corpus_binding["corpusArtifactSha256"],
                    "sourceSelectionSha256": corpus_binding[
                        "sourceSelectionSha256"
                    ],
                    "confirmationAdmitted": (
                        args.stage == "confirmation"
                        and corpus_binding["pilotAdmissionManifestSha256"] is not None
                    ),
                    "experimentProfile": FIDELITY_GATE_PROFILE,
                    "semanticLabelsAccessed": False,
                },
                sort_keys=True,
            )
        )
        return

    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("the preregistered S5 fit requires an available CUDA device")
    output_path = Path(args.output).resolve()
    receipt_path = Path(args.receipt).resolve()
    if output_path == receipt_path or output_path.exists() or receipt_path.exists():
        raise ValueError("S5 outputs must be distinct absent paths; no overwrite")
    try:
        output_path.relative_to(REPO_ROOT)
    except ValueError:
        pass
    else:
        raise ValueError("private S5 control-statistic lens must remain outside repo")

    git_revision = _git_revision()
    fit_source_sha256s = _require_clean_fit_sources(
        git_revision, paths["fitSourcePaths"]
    )
    if args.device.startswith("cuda"):
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats(args.device)
    started_at = s4._utc_now()
    started = time.perf_counter()
    model, model_config = s4._load_model(
        paths["checkpoint"], paths["bins"], args.device
    )
    artifact = fit_endpoint_unscaled_centered_jacobian_lens_v1(
        model,
        batches,
        layers=args.layers,
        checkpoint_sha256=FROZEN_CHECKPOINT_SHA256,
        tokenizer_sha256=FROZEN_TOKENIZER_SHA256,
        source_artifact_sha256=corpus_binding["sourceArtifactSha256"],
        preregistration_sha256=FROZEN_S5_PREREGISTRATION_SHA256,
        selector_sha256=FROZEN_S5_SELECTOR_SHA256,
        fit_source_sha256s=fit_source_sha256s,
        calibration_corpus_sha256=corpus_binding["sequenceOrderSha256"],
        dim_batch=args.dim_batch,
        max_seq_len=FROZEN_MAX_SEQ_LEN,
        position_bins=[tuple(value) for value in FROZEN_POSITION_BINS],
    )
    elapsed_millis = round((time.perf_counter() - started) * 1000)
    _require_unchanged_fit_sources(fit_source_sha256s)
    artifact_validation = _validate_affine_artifact(
        artifact,
        expected_sequence_sha256s=corpus_binding["sequenceSha256s"],
        expected_position_bin_counts=FROZEN_POSITION_BIN_COUNTS,
        source_artifact_sha256=corpus_binding["sourceArtifactSha256"],
        fit_source_sha256s=fit_source_sha256s,
    )
    if artifact["calibration"]["corpusSha256"] != corpus_binding[
        "sequenceOrderSha256"
    ]:
        raise RuntimeError("fitted S5 artifact used a different source-row order")

    peak_bytes = 0
    total_bytes = 0
    if args.device.startswith("cuda"):
        peak_bytes = int(torch.cuda.max_memory_allocated(args.device))
        total_bytes = int(torch.cuda.get_device_properties(args.device).total_memory)
        if peak_bytes * 10 > total_bytes * 9:
            raise RuntimeError("S5 fit exceeded 90% GPU memory ceiling")

    artifact_sha256 = save_jacobian_lens_artifact(artifact, output_path)
    core_fields = jacobian_lens_s5_fit_receipt_fields(
        artifact, lens_sha256=artifact_sha256
    )
    receipt: dict[str, Any] = {
        "schema": FIT_RECEIPT_SCHEMA,
        "createdAt": s4._utc_now(),
        "startedAt": started_at,
        "gitRevision": git_revision,
        "stage": args.stage,
        "lane": args.lane,
        **core_fields,
        "paperParity": False,
        "positionPolicy": "endpoint-self-only",
        "dimBatch": args.dim_batch,
        "maxSeqLen": FROZEN_MAX_SEQ_LEN,
        "sourceS4SelectionManifestSha256": FROZEN_S4_SELECTION_MANIFEST_SHA256,
        "sourceS4SelectionManifestSelfHash": FROZEN_S4_SELECTION_MANIFEST_SELF_HASH,
        "sourceS4FailedPilotManifestSha256": FROZEN_S4_FAILED_PILOT_MANIFEST_SHA256,
        "sourceS4FailedPilotManifestSelfHash": (
            FROZEN_S4_FAILED_PILOT_MANIFEST_SELF_HASH
        ),
        "selectionManifestSha256": FROZEN_S5_SELECTION_MANIFEST_SHA256,
        "selectionManifestSelfHash": FROZEN_S5_SELECTION_MANIFEST_SELF_HASH,
        "pilotAdmissionManifestSha256": corpus_binding[
            "pilotAdmissionManifestSha256"
        ],
        "pilotAdmissionManifestSelfHash": corpus_binding[
            "pilotAdmissionManifestSelfHash"
        ],
        "corpusArtifactSha256": corpus_binding["corpusArtifactSha256"],
        "coordinateSetSha256": corpus_binding["coordinateSetSha256"],
        "promptHashSetSha256": corpus_binding["promptHashSetSha256"],
        "caseIdSetSha256": corpus_binding["caseIdSetSha256"],
        "sourceSelectionSha256": corpus_binding["sourceSelectionSha256"],
        "fitScriptSha256": sha256_file(__file__),
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
    if set(receipt) != FIT_RECEIPT_FIELDS:
        raise RuntimeError("generated S5 receipt fields differ from frozen schema")
    _validate_generated_receipt_payload(
        receipt,
        artifact=artifact,
        artifact_validation=artifact_validation,
        corpus_binding=corpus_binding,
        fit_source_sha256s=fit_source_sha256s,
    )
    s4._write_json_atomic(receipt_path, receipt)
    if s4._read_json(receipt_path) != receipt:
        raise RuntimeError("written S5 receipt differs from validated payload")
    loaded = load_jacobian_lens_artifact(
        output_path,
        checkpoint_sha256=FROZEN_CHECKPOINT_SHA256,
        tokenizer_sha256=FROZEN_TOKENIZER_SHA256,
        model=model,
        fit_receipt_path=receipt_path,
    )
    if loaded.lens_sha256 != artifact_sha256:
        raise RuntimeError("saved S5 lens failed receipt-bound loadback")
    _require_unchanged_fit_sources(fit_source_sha256s)
    print(
        json.dumps(
            {
                "status": "fitted",
                "lane": args.lane,
                "stage": args.stage,
                "lensSha256": artifact_sha256,
                "receiptSha256": sha256_file(receipt_path),
                "tensorSha256": artifact_validation["tensorSha256"],
                "primaryAlphaInterior": artifact_validation[
                    "primaryAlphaInterior"
                ],
                "primaryBetaInterior": artifact_validation[
                    "primaryBetaInterior"
                ],
                "elapsedMillis": elapsed_millis,
                "peakGpuMemoryShareE8": receipt["peakGpuMemoryShareE8"],
                "experimentProfile": FIDELITY_GATE_PROFILE,
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
