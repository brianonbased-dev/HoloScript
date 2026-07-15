#!/usr/bin/env python3
"""Fit one frozen J-space S4 centered scalar-calibrated endpoint lens.

The runner consumes only a sealed S4 A or B subset, replays the complete S2/S3
source admission through the frozen selector, and emits a private lens plus a
public, scalar-redacted provenance receipt. It never accepts semantic labels.
"""

from __future__ import annotations

import argparse
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
from typing import Any, Mapping, Sequence


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_ROOT = Path(__file__).resolve().parent
HOLOSERVE_ROOT = REPO_ROOT / "packages" / "holoserve-py"
for search_root in (SCRIPT_ROOT, HOLOSERVE_ROOT):
    if str(search_root) not in sys.path:
        sys.path.insert(0, str(search_root))

import torch  # noqa: E402

import select_jspace_s4_corpus as selector  # noqa: E402
from holoserve.model import GPT  # noqa: E402
from holoserve.tokenizer import encode_text  # noqa: E402
from holoserve.workspace_eval import FORBIDDEN_PROMPT_FIELDS  # noqa: E402
from holoserve.workspace_probe import (  # noqa: E402
    JACOBIAN_LENS_ESTIMATOR_V4,
    JACOBIAN_LENS_V4_CLIP_BOUNDS,
    JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256,
    JACOBIAN_LENS_V4_FIT_BINDING_SCHEMA,
    JACOBIAN_LENS_V4_RIDGE_FRACTION,
    JACOBIAN_LENS_V4_SCALAR_CALIBRATION_PROFILE,
    JACOBIAN_LENS_V4_SCALAR_IDENTITY_CONTROL_PROFILE,
    JACOBIAN_LENS_V4_SCALAR_STATISTICS_DIGEST_SCHEMA,
    JACOBIAN_LENS_V4_TRANSPORT_PROFILE,
    fit_endpoint_scalar_calibrated_jacobian_lens_v1,
    jacobian_lens_v4_fit_binding_payload,
    jacobian_lens_v4_fit_receipt_fields,
    jacobian_lens_v4_scalar_formula_contract,
    jacobian_lens_v4_scalar_formula_sha256,
    jacobian_lens_v4_scalar_statistics_payload,
    jacobian_lens_v4_scalar_statistics_sha256,
    load_jacobian_lens_artifact,
    save_jacobian_lens_artifact,
    sha256_file,
    sha256_json,
)


SELECTION_MANIFEST_SCHEMA = "holoscript.jspace-s4-selection-manifest.v0.1.0"
FIT_RECEIPT_SCHEMA = "holoscript.jspace-s4-fit-receipt.v0.1.0"
PILOT_ADMISSION_SCHEMA = "holoscript.jspace-s4-pilot-admission.v0.1.0"
FIDELITY_SCHEMA = "holoscript.model-workspace-fidelity-evaluation.v0.3.0"
FIDELITY_GATE_PROFILE = "s4-mean-centered-scalar-jacobian-v1"
SCALAR_STATISTICS_DIGEST_SCHEMA = JACOBIAN_LENS_V4_SCALAR_STATISTICS_DIGEST_SCHEMA
FROZEN_LAYERS = [2, 5, 8]
FROZEN_PRIMARY_LAYERS = [2, 5]
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
FROZEN_S3_MANIFEST_SHA256 = (
    "sha256:1c700238479b2b0e54839779de3ea2efe6298879227043e8495c559b502761af"
)
FROZEN_S3_MANIFEST_SELF_HASH = (
    "sha256:f09d04f0e8a18d06dc95acee5f26ac40e9f4f0490af93477a84edbd3c01ac7f2"
)
FROZEN_S4_PREREGISTRATION_SHA256 = (
    "sha256:aab413a443cefbcc2dbacf5506c8fe687e4c4cde7b38fddd0d341d50ca1df930"
)
FROZEN_S4_SELECTOR_SHA256 = (
    "sha256:36f98bb07e03b611191f2a7596c2cb00e58a44ba73ce80fcf52ec631f7ae5af6"
)
FROZEN_S4_SELECTION_MANIFEST_SHA256 = (
    "sha256:addb0a5ff2e37a9507989ace490c86dfb3b1da5bbc1543c849b01932339d706f"
)
FROZEN_S4_SELECTION_MANIFEST_SELF_HASH = (
    "sha256:870a25aeb2462df8c57e0291e93a9785b74d366478a881f319c0dfa76a046a20"
)
FROZEN_OUTPUT_SHA256 = {
    "pilot": {
        "a": "sha256:2da3005d4c6c53e122b48388d612334d0b27577ae8cb7e3e7d2e6c598582eeae",
        "b": "sha256:df0f238b2980bfe815d2e9f1c69296565e9de4ec0ca997e43047ae3793671d72",
        "h": "sha256:f73c5f8398f809f7ef3dc3d6271dea7409cd2048354f59cd3cb1772510d8bd2d",
    },
    "confirmation": {
        "a": "sha256:005c411edc0a53684b95a627ced5672ea67ac74683531b2dd9016e52c0d68637",
        "b": "sha256:53c67df229050e9496d836d0a399e9dbe906dc2821efa5077813f976cc0d733b",
        "h": "sha256:3bdbd1c027c5408fcd96d47825c2698b703fa92239ec01e6112138197dfd54d3",
    },
}
FROZEN_ENDPOINT_TEXT = {
    ("form_0", 0): "Analysis:",
    ("form_0", 1): "Evidence =",
    ("form_1", 0): "Decision [",
    ("form_1", 1): "Options {",
    ("form_2", 0): 'HoloScript:\nobject "',
    ("form_2", 1): "HoloScript:\n//",
    ("form_3", 0): "Trace step(",
    ("form_3", 1): "Constraint @",
}

SCALAR_FORMULA_CONTRACT = jacobian_lens_v4_scalar_formula_contract()
SCALAR_FORMULA_SHA256 = jacobian_lens_v4_scalar_formula_sha256()
FROZEN_SCALAR_FORMULA_SHA256 = (
    "sha256:ee608a1b8bbc1545e4928f956417841f4743adfb0d798a15a4eb8c62923a2aac"
)
CONTROL_PROFILE_PAYLOAD = {
    "schema": "holoscript.jspace-s4-control-profile.v0.1.0",
    "preregistrationSha256": FROZEN_S4_PREREGISTRATION_SHA256,
    "gateProfile": FIDELITY_GATE_PROFILE,
    "layers": FROZEN_LAYERS,
    "primaryLayers": FROZEN_PRIMARY_LAYERS,
    "ceilingLayer": 8,
    "controls": [
        {
            "name": "identityLogitLens",
            "transport": "h_l",
            "ordinaryComparator": True,
        },
        {
            "name": "meanFinalAnchor",
            "transport": "ybar",
            "ordinaryComparator": True,
        },
        {
            "name": "unscaledCentered",
            "transport": "Jbar@x+ybar-Jbar@xbar",
            "attributionGain": "centered",
        },
        {
            "name": "localTaylor",
            "transport": "Jbar@x+ybar-mean_i(J_i@x_i)",
            "attributionGain": "localTaylor",
        },
        {
            "name": "scalarIdentity",
            "transport": "beta*x+ybar-beta*xbar",
            "attributionGain": "jacobianSpecific",
        },
        {
            "name": "scalarCalibratedJacobian",
            "transport": "alpha*Jbar@x+ybar-alpha*Jbar@xbar",
            "estimator": JACOBIAN_LENS_ESTIMATOR_V4,
        },
    ],
    "claimAdmission": {
        "scalarCalibration": [
            "primaryAlphaInterior",
            "centeredGainBootstrapLowerAboveZero",
            "localTaylorGainBootstrapLowerAboveZero",
        ],
        "jacobianSpecific": [
            "scalarCalibrationClaimAdmitted",
            "primaryBetaInterior",
            "jacobianSpecificGainBootstrapLowerAboveZero",
        ],
    },
}
FROZEN_CONTROL_PROFILE_SELF_HASH = (
    "sha256:9c914202bc680ba5e6d1d3fc2413ba81cc61e2bd7cae52d8dda9a9bf314204fa"
)
FROZEN_CONTROL_PROFILE_FILE_SHA256 = (
    "sha256:356c5d0e8d17fe3668bd0e365d582c049cd8fa4b1847d8d5ae5c22780b9e1d98"
)
FROZEN_CONTROL_PROFILE_SHA256 = JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256
CONTROL_PROFILE_CONTRACT = {
    **CONTROL_PROFILE_PAYLOAD,
    "selfHash": FROZEN_CONTROL_PROFILE_SELF_HASH,
}
CONTROL_PROFILE_SHA256 = selector._sha256_json(
    {**CONTROL_PROFILE_CONTRACT, "selfHash": None}
)
if (
    SCALAR_FORMULA_SHA256 != FROZEN_SCALAR_FORMULA_SHA256
    or CONTROL_PROFILE_SHA256 != FROZEN_CONTROL_PROFILE_SHA256
    or FROZEN_CONTROL_PROFILE_SELF_HASH != FROZEN_CONTROL_PROFILE_SHA256
):
    raise RuntimeError("S4 scalar formula or control profile differs from preregistration")
SCALAR_STATISTIC_KEYS = (
    "centeredJacobianEnergyMeans",
    "centeredJacobianTargetCrossMeans",
    "centeredIdentityEnergyMeans",
    "centeredIdentityTargetCrossMeans",
)

# Every implementation, selection, test, and inherited evidence source whose
# bytes must be frozen at the observation revision. Admission artifacts for a
# confirmation are appended dynamically.
FIT_SOURCE_PATHS = (
    "scripts/research/fit_jspace_s4_lens.py",
    "scripts/research/test_fit_jspace_s4_lens.py",
    "scripts/research/select_jspace_s4_corpus.py",
    "scripts/research/test_select_jspace_s4_corpus.py",
    "scripts/research/select_jspace_s3_corpus.py",
    "research/2026-07-15-jspace-s3-latin-endpoint-preregistration.md",
    "research/2026-07-15-jspace-s4-centered-scalar-preregistration.md",
    "research/data/jspace-s2/corpus-manifest.json",
    "research/data/jspace-s2/leakage-report.json",
    "research/data/jspace-s2/reference-manifest.json",
    "research/data/jspace-s2/fit-a.jsonl",
    "research/data/jspace-s2/fit-a-pilot.jsonl",
    "research/data/jspace-s2/fit-b.jsonl",
    "research/data/jspace-s2/fit-b-pilot.jsonl",
    "research/data/jspace-s2/fidelity-h.jsonl",
    "research/data/jspace-s2/fidelity-h-pilot.jsonl",
    "research/data/jspace-s3/selection-manifest.json",
    "research/data/jspace-s3/fit-a-pilot.jsonl",
    "research/data/jspace-s3/fit-a-confirmation.jsonl",
    "research/data/jspace-s3/fit-b-pilot.jsonl",
    "research/data/jspace-s3/fit-b-confirmation.jsonl",
    "research/data/jspace-s3/fidelity-h-pilot.jsonl",
    "research/data/jspace-s3/fidelity-h-confirmation.jsonl",
    "research/measurements/jspace-s3/pilot-manifest.json",
    "research/measurements/jspace-s3/pilot-a-fit.json",
    "research/measurements/jspace-s3/pilot-b-fit.json",
    "research/measurements/jspace-s3/pilot-collection.json",
    "research/measurements/jspace-s3/pilot-fidelity.json",
    "research/measurements/jspace-s3/pilot-rows.jsonl",
    "research/measurements/jspace-s3/pilot-receipts.jsonl",
    "research/data/jspace-s4/selection-manifest.json",
    "research/data/jspace-s4/control-profile.json",
    "research/data/jspace-s4/fit-a-pilot.jsonl",
    "research/data/jspace-s4/fit-a-confirmation.jsonl",
    "research/data/jspace-s4/fit-b-pilot.jsonl",
    "research/data/jspace-s4/fit-b-confirmation.jsonl",
    "research/data/jspace-s4/fidelity-h-pilot.jsonl",
    "research/data/jspace-s4/fidelity-h-confirmation.jsonl",
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
    "estimator",
    "paperParity",
    "transportProfile",
    "scalarCalibration",
    "scalarIdentityControl",
    "scalarFormulaSha256",
    "controlProfileSha256",
    "controlProfileArtifactSha256",
    "controlProfileSelfHash",
    "scalarStatisticsDigestSchema",
    "scalarStatisticsSha256",
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
    "sourceS2CorpusManifestSha256",
    "sourceS3SelectionManifestSha256",
    "selectionManifestSha256",
    "selectionManifestSelfHash",
    "pilotAdmissionManifestSha256",
    "pilotAdmissionManifestSelfHash",
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


def _sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def _sha256_text(value: str) -> str:
    return _sha256_bytes(value.encode("utf-8"))


def _is_sha256(value: object) -> bool:
    if not isinstance(value, str) or not value.startswith("sha256:"):
        return False
    digest = value.removeprefix("sha256:")
    return len(digest) == 64 and all(char in "0123456789abcdef" for char in digest)


def _is_git_revision(value: object) -> bool:
    return isinstance(value, str) and len(value) == 40 and all(
        char in "0123456789abcdef" for char in value
    )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain one JSON object")
    return value


def _validate_control_profile(path: Path | None = None) -> dict[str, Any]:
    path = path or (
        REPO_ROOT / "research" / "data" / "jspace-s4" / "control-profile.json"
    )
    profile = _read_json(path)
    if (
        sha256_file(path) != FROZEN_CONTROL_PROFILE_FILE_SHA256
        or profile != CONTROL_PROFILE_CONTRACT
        or profile.get("selfHash") != FROZEN_CONTROL_PROFILE_SELF_HASH
        or profile.get("selfHash")
        != sha256_json({**profile, "selfHash": None})
        or profile.get("preregistrationSha256")
        != FROZEN_S4_PREREGISTRATION_SHA256
    ):
        raise ValueError("S4 control profile differs from its external frozen contract")
    return profile


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line:
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{line_number} must contain one JSON object")
        rows.append(value)
    if not rows:
        raise ValueError(f"{path} is empty")
    return rows


def _repo_relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError as error:
        raise ValueError("provenance artifact must be inside the repository") from error


def _resolve_repo_file(value: object) -> Path:
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise ValueError("artifact binding must use a non-empty repository-relative path")
    path = (REPO_ROOT / value).resolve()
    _repo_relative(path)
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def _write_json_atomic(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(
        value, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False
    ) + "\n"
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


def _validate_bound_json(
    binding: object, *, schema: str
) -> tuple[Path, dict[str, Any]]:
    if not isinstance(binding, dict):
        raise ValueError(f"{schema} binding must be an object")
    path = _resolve_repo_file(binding.get("file"))
    payload = _read_json(path)
    if (
        binding.get("sha256") != sha256_file(path)
        or binding.get("selfHash") != payload.get("selfHash")
        or payload.get("schema") != schema
        or payload.get("selfHash") != sha256_json({**payload, "selfHash": None})
    ):
        raise ValueError(f"{schema} does not match its source binding")
    return path, payload


def _validate_bound_file(binding: object) -> Path:
    if not isinstance(binding, dict):
        raise ValueError("artifact binding must be an object")
    path = _resolve_repo_file(binding.get("file"))
    if binding.get("sha256") != sha256_file(path):
        raise ValueError("artifact does not match its SHA-256 binding")
    return path


def _contains_private_numeric_scalars(
    value: object, path: tuple[str, ...] = ()
) -> bool:
    raw_symbols = {"s", "c", "si", "ci", "jbar", "xbar", "ybar", "m", "b"}
    allowed_scalar_fields = {
        "primaryalphainterior",
        "primarybetainterior",
        "scalarcalibrationclaimadmitted",
        "fitscalarinteriorrequiredseparately",
        "scalarformulasha256",
        "scalarstatisticssha256",
        "scalarstatisticsdigestschema",
        "scalarcalibration",
        "scalaridentitycontrol",
    }
    if isinstance(value, dict):
        if path and path[-1] == "fitsourcesha256s":
            return any(
                not isinstance(source, str) or not _is_sha256(digest)
                for source, digest in value.items()
            )
        for key, nested in value.items():
            normalized = "".join(char for char in str(key).lower() if char.isalnum())
            scalar_identity_metric = (
                normalized == "scalaridentity"
                and bool(path)
                and path[-1] == "transportcontrolmetrics"
                and "observation" in path
                and "layers" in path
            )
            if normalized in raw_symbols and not isinstance(nested, dict):
                return True
            if (
                ("alpha" in normalized or "beta" in normalized)
                and normalized not in allowed_scalar_fields
            ):
                return True
            if ("statistic" in normalized or normalized.endswith("stats")) and (
                normalized not in allowed_scalar_fields
            ):
                return True
            if "scalar" in normalized and (
                normalized not in allowed_scalar_fields and not scalar_identity_metric
            ):
                return True
            if _contains_private_numeric_scalars(nested, (*path, normalized)):
                return True
    elif isinstance(value, list):
        return any(_contains_private_numeric_scalars(item, path) for item in value)
    return False


def _scalar_statistics_payload(artifact: Mapping[str, Any]) -> dict[str, Any]:
    return jacobian_lens_v4_scalar_statistics_payload(dict(artifact))


def _scalar_statistics_sha256(artifact: Mapping[str, Any]) -> str:
    return jacobian_lens_v4_scalar_statistics_sha256(dict(artifact))


def _validate_scalar_artifact(
    artifact: Mapping[str, Any],
    *,
    expected_sequence_sha256s: Sequence[str],
    expected_position_bin_counts: Sequence[int],
) -> dict[str, Any]:
    expected_estimator = {
        "name": JACOBIAN_LENS_ESTIMATOR_V4,
        "paperParity": False,
        "vectorization": "batched-endpoint-output-cotangents-retained-graph",
        "transportProfile": JACOBIAN_LENS_V4_TRANSPORT_PROFILE,
        "anchor": "binwise-target-mean-minus-scaled-mean-jacobian-source-mean",
        "scalarCalibration": JACOBIAN_LENS_V4_SCALAR_CALIBRATION_PROFILE,
        "ridgeFraction": 0.001,
        "clipBounds": [0.0, 2.0],
        "scalarIdentityControl": JACOBIAN_LENS_V4_SCALAR_IDENTITY_CONTROL_PROFILE,
    }
    estimator = artifact.get("estimator")
    if (
        estimator != expected_estimator
        or not isinstance(estimator, dict)
        or type(estimator.get("ridgeFraction")) is not float
        or not isinstance(estimator.get("clipBounds"), list)
        or len(estimator["clipBounds"]) != 2
        or any(type(value) is not float for value in estimator["clipBounds"])
        or artifact.get("layers") != FROZEN_LAYERS
        or any(key in artifact for key in ("alpha", "beta", "scalars", "alphaRaw", "betaRaw"))
    ):
        raise ValueError("scalar artifact estimator or privacy contract mismatch")
    calibration = artifact.get("calibration")
    if not isinstance(calibration, dict) or (
        calibration.get("positionPolicy") != "endpoint-self-only"
        or calibration.get("positionBins") != FROZEN_POSITION_BINS
        or calibration.get("positionBinCounts") != list(expected_position_bin_counts)
        or calibration.get("sequenceSha256s") != list(expected_sequence_sha256s)
        or calibration.get("sequenceCount") != len(expected_sequence_sha256s)
        or calibration.get("jacobianCount") != len(expected_sequence_sha256s)
        or calibration.get("corpusSha256") != sha256_json(list(expected_sequence_sha256s))
        or calibration.get("dimBatch") != FROZEN_DIM_BATCH
        or calibration.get("maxSeqLen") != FROZEN_MAX_SEQ_LEN
    ):
        raise ValueError("scalar artifact calibration source selection mismatch")
    fit_binding = artifact.get("fitBinding")
    if not isinstance(fit_binding, dict):
        raise ValueError("scalar artifact is missing its sealed fit binding")
    expected_fit_binding = jacobian_lens_v4_fit_binding_payload(
        dict(artifact), control_profile_sha256=FROZEN_CONTROL_PROFILE_SHA256
    )
    if (
        fit_binding != expected_fit_binding
        or fit_binding.get("schema") != JACOBIAN_LENS_V4_FIT_BINDING_SCHEMA
        or fit_binding.get("scalarFormulaSha256") != FROZEN_SCALAR_FORMULA_SHA256
        or fit_binding.get("controlProfileSha256")
        != FROZEN_CONTROL_PROFILE_SHA256
    ):
        raise ValueError("scalar artifact fit binding differs from the frozen contract")

    matrices = artifact.get("matrices")
    biases = artifact.get("biases")
    source_means = artifact.get("sourceMeans")
    target_means = artifact.get("targetMeans")
    local_products = artifact.get("jacobianSourceProductMeans")
    if not all(
        isinstance(value, torch.Tensor)
        for value in (matrices, biases, source_means, target_means, local_products)
    ):
        raise ValueError("scalar artifact affine tensors are missing")
    matrix_shape = tuple(matrices.shape)
    if len(matrix_shape) != 4 or matrix_shape[:2] != (4, 3) or matrix_shape[2] != matrix_shape[3]:
        raise ValueError("scalar artifact matrix shape mismatch")
    vector_shape = (4, 3, matrix_shape[2])
    if any(tuple(value.shape) != vector_shape for value in (biases, source_means, target_means, local_products)):
        raise ValueError("scalar artifact vector shape mismatch")
    if not all(
        value.dtype == torch.float32 and torch.isfinite(value).all()
        for value in (matrices, biases, source_means, target_means, local_products)
    ):
        raise ValueError("scalar artifact affine tensors must be finite float32")
    if not torch.equal(target_means, target_means[:, :1].expand_as(target_means)):
        raise ValueError("scalar artifact target means disagree across layers")

    statistic_shape = (4, 3)
    statistics = [artifact[name] for name in SCALAR_STATISTIC_KEYS]
    if any(tuple(value.shape) != statistic_shape for value in statistics):
        raise ValueError("scalar sufficient-statistic tensor shape mismatch")
    energy, cross, identity_energy, identity_cross = statistics
    if bool((energy <= 0).any()) or bool((identity_energy <= 0).any()):
        raise ValueError("scalar calibration energies must be positive")
    rho = JACOBIAN_LENS_V4_RIDGE_FRACTION
    lower, upper = JACOBIAN_LENS_V4_CLIP_BOUNDS
    alpha_raw = cross / ((1.0 + rho) * energy)
    beta_raw = identity_cross / ((1.0 + rho) * identity_energy)
    if not torch.isfinite(alpha_raw).all() or not torch.isfinite(beta_raw).all():
        raise ValueError("unclipped scalar calibration is non-finite")
    alpha = torch.clamp(alpha_raw, min=lower, max=upper)
    beta = torch.clamp(beta_raw, min=lower, max=upper)
    expected_bias = target_means.to(torch.float64) - torch.einsum(
        "blij,blj->bli",
        alpha[..., None, None] * matrices.to(torch.float64),
        source_means.to(torch.float64),
    )
    if not torch.allclose(
        biases.to(torch.float64), expected_bias, rtol=2e-5, atol=2e-5
    ):
        raise ValueError("scalar artifact bias does not match the frozen formula")
    primary_indices = [FROZEN_LAYERS.index(layer) for layer in FROZEN_PRIMARY_LAYERS]
    primary_alpha = alpha[:, primary_indices]
    primary_beta = beta[:, primary_indices]
    return {
        "scalarStatisticsSha256": _scalar_statistics_sha256(artifact),
        "fitBindingSha256": sha256_json(fit_binding),
        "primaryAlphaInterior": bool(
            ((primary_alpha > lower) & (primary_alpha < upper)).all().item()
        ),
        "primaryBetaInterior": bool(
            ((primary_beta > lower) & (primary_beta < upper)).all().item()
        ),
    }


def _source_selection_payload(
    *,
    stage: str,
    lane: str,
    manifest: Mapping[str, Any],
    binding: Mapping[str, Any],
    sequence_order_sha256: str,
) -> dict[str, Any]:
    return {
        "schema": "holoscript.jspace-s4-source-selection.v0.1.0",
        "stage": stage,
        "lane": lane,
        "preregistrationSha256": FROZEN_S4_PREREGISTRATION_SHA256,
        "selectorSha256": FROZEN_S4_SELECTOR_SHA256,
        "selectionManifestSha256": FROZEN_S4_SELECTION_MANIFEST_SHA256,
        "selectionManifestSelfHash": FROZEN_S4_SELECTION_MANIFEST_SELF_HASH,
        "sourceS2CorpusManifestSha256": FROZEN_S2_MANIFEST_SHA256,
        "sourceS3SelectionManifestSha256": FROZEN_S3_MANIFEST_SHA256,
        "sourceS3SelectionManifestSelfHash": FROZEN_S3_MANIFEST_SELF_HASH,
        "checkpointSha256": manifest["checkpointSha256"],
        "tokenizerSha256": manifest["tokenizerSha256"],
        "corpusArtifactSha256": binding["sha256"],
        "coordinateSetSha256": binding["coordinateSetSha256"],
        "caseIdSetSha256": binding["caseIdSetSha256"],
        "promptHashSetSha256": binding["promptHashSetSha256"],
        "sequenceSetSha256": binding["sequenceHashSetSha256"],
        "sequenceOrderSha256": sequence_order_sha256,
        "rowCount": binding["rowCount"],
    }


def _git_revision() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    revision = result.stdout.strip()
    if not _is_git_revision(revision):
        raise ValueError("fit receipt requires an exact Git revision")
    return revision


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
            "fit sources must be committed and clean before model observation: "
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
        raise RuntimeError("every fit source must be tracked by the exact Git revision")
    return {path: sha256_file(REPO_ROOT / path) for path in paths}


def _require_unchanged_fit_sources(expected: Mapping[str, str]) -> None:
    observed = {path: sha256_file(REPO_ROOT / path) for path in expected}
    if observed != dict(expected):
        raise RuntimeError("fit source changed during model observation")


def _require_receipt_sources_at_revision(receipt: Mapping[str, Any]) -> None:
    revision = receipt.get("gitRevision")
    sources = receipt.get("fitSourceSha256s")
    if not _is_git_revision(revision) or not isinstance(sources, dict):
        raise ValueError("fit receipt lacks exact-revision source hashes")
    if set(sources) != set(FIT_SOURCE_PATHS):
        raise ValueError("fit receipt source set differs from the frozen S4 source set")
    for relative, expected in sources.items():
        if not isinstance(relative, str) or not _is_sha256(expected):
            raise ValueError("fit receipt source hash entry is invalid")
        path = _resolve_repo_file(relative)
        if sha256_file(path) != expected:
            raise ValueError("fit receipt source bytes differ from current S4 sources")
        blob = subprocess.run(
            ["git", "show", f"{revision}:{relative}"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
        ).stdout
        if _sha256_bytes(blob) != expected:
            raise ValueError("fit receipt source hash differs from its exact Git revision")


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
        raise ValueError("checkpoint block size does not match the frozen S4 limit")
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


def _parse_utc_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.endswith("Z"):
        return None
    try:
        parsed = datetime.fromisoformat(f"{value[:-1]}+00:00")
    except ValueError:
        return None
    return parsed if parsed.tzinfo == timezone.utc else None


def _pilot_calibration_binding(
    lane: str, pilot_binding: Mapping[str, Any]
) -> dict[str, Any]:
    expected_file = f"fit-{lane}-pilot.jsonl"
    if pilot_binding.get("file") != expected_file:
        raise ValueError(f"pilot {lane} fit artifact path is not frozen")
    path = REPO_ROOT / "research" / "data" / "jspace-s4" / expected_file
    if sha256_file(path) != pilot_binding.get("sha256"):
        raise ValueError(f"pilot {lane} fit artifact bytes differ from the manifest")
    rows = _read_jsonl(path)
    sequence_sha256s = [row.get("sequenceSha256") for row in rows]
    sequence_token_counts = [row.get("tokenCount") for row in rows]
    if (
        len(rows) != 48
        or any(not _is_sha256(value) for value in sequence_sha256s)
        or any(type(value) is not int or value < 1 for value in sequence_token_counts)
    ):
        raise ValueError(f"pilot {lane} fit artifact calibration metadata is invalid")
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
        sequence_order_sha256=sequence_order if isinstance(sequence_order, str) else "",
    )
    started_at = _parse_utc_timestamp(receipt.get("startedAt"))
    created_at = _parse_utc_timestamp(receipt.get("createdAt"))
    peak_bytes = receipt.get("peakGpuMemoryBytes")
    total_bytes = receipt.get("gpuTotalMemoryBytes")
    peak_share = receipt.get("peakGpuMemoryShareE8")
    memory_binding_valid = (
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
        or receipt.get("selfHash") != sha256_json({**receipt, "selfHash": None})
        or not _is_git_revision(receipt.get("gitRevision"))
        or receipt.get("stage") != "pilot"
        or receipt.get("lane") != lane
        or receipt.get("estimator") != JACOBIAN_LENS_ESTIMATOR_V4
        or receipt.get("paperParity") is not False
        or receipt.get("transportProfile") != JACOBIAN_LENS_V4_TRANSPORT_PROFILE
        or receipt.get("scalarCalibration") != JACOBIAN_LENS_V4_SCALAR_CALIBRATION_PROFILE
        or receipt.get("scalarIdentityControl")
        != JACOBIAN_LENS_V4_SCALAR_IDENTITY_CONTROL_PROFILE
        or receipt.get("scalarFormulaSha256") != SCALAR_FORMULA_SHA256
        or receipt.get("controlProfileSha256") != FROZEN_CONTROL_PROFILE_SHA256
        or receipt.get("controlProfileArtifactSha256")
        != FROZEN_CONTROL_PROFILE_FILE_SHA256
        or receipt.get("controlProfileSelfHash")
        != FROZEN_CONTROL_PROFILE_SELF_HASH
        or receipt.get("scalarStatisticsDigestSchema")
        != SCALAR_STATISTICS_DIGEST_SCHEMA
        or not _is_sha256(receipt.get("scalarStatisticsSha256"))
        or not _is_sha256(receipt.get("fitBindingSha256"))
        or type(receipt.get("primaryAlphaInterior")) is not bool
        or type(receipt.get("primaryBetaInterior")) is not bool
        or receipt.get("positionPolicy") != "endpoint-self-only"
        or receipt.get("positionBins") != FROZEN_POSITION_BINS
        or receipt.get("layers") != FROZEN_LAYERS
        or receipt.get("dimBatch") != FROZEN_DIM_BATCH
        or receipt.get("maxSeqLen") != FROZEN_MAX_SEQ_LEN
        or receipt.get("checkpointSha256") != FROZEN_CHECKPOINT_SHA256
        or receipt.get("tokenizerSha256") != FROZEN_TOKENIZER_SHA256
        or receipt.get("preregistrationSha256") != FROZEN_S4_PREREGISTRATION_SHA256
        or receipt.get("selectionManifestSha256")
        != FROZEN_S4_SELECTION_MANIFEST_SHA256
        or receipt.get("selectionManifestSelfHash")
        != FROZEN_S4_SELECTION_MANIFEST_SELF_HASH
        or receipt.get("sourceS2CorpusManifestSha256")
        != FROZEN_S2_MANIFEST_SHA256
        or receipt.get("sourceS3SelectionManifestSha256")
        != FROZEN_S3_MANIFEST_SHA256
        or receipt.get("pilotAdmissionManifestSha256") is not None
        or receipt.get("pilotAdmissionManifestSelfHash") is not None
        or receipt.get("corpusArtifactSha256") != pilot_binding.get("sha256")
        or receipt.get("coordinateSetSha256")
        != pilot_binding.get("coordinateSetSha256")
        or receipt.get("caseIdSetSha256") != pilot_binding.get("caseIdSetSha256")
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
        or receipt.get("rowCount") != 48
        or receipt.get("positionBinCounts") != [12, 12, 12, 12]
        or receipt.get("sourceSelectionSha256") != sha256_json(selection_payload)
        or receipt.get("semanticLabelsAccessed") is not False
        or not _is_sha256(receipt.get("lensSha256"))
        or not isinstance(receipt.get("elapsedMillis"), int)
        or isinstance(receipt.get("elapsedMillis"), bool)
        or receipt["elapsedMillis"] <= 0
        or started_at is None
        or created_at is None
        or created_at < started_at
        or not memory_binding_valid
        or not 0 <= receipt["peakGpuMemoryShareE8"] <= 90_000_000
        or _contains_private_numeric_scalars(receipt)
    ):
        raise ValueError(f"pilot {lane} fit receipt does not match frozen S4")
    fit_sources = receipt.get("fitSourceSha256s")
    if (
        not isinstance(fit_sources, dict)
        or receipt.get("fitScriptSha256")
        != fit_sources.get("scripts/research/fit_jspace_s4_lens.py")
    ):
        raise ValueError("fit receipt source digest binding is invalid")
    if verify_revision_sources:
        _require_receipt_sources_at_revision(receipt)


def _validate_generated_receipt_payload(
    receipt: Mapping[str, Any],
    *,
    artifact: Mapping[str, Any],
    scalar_validation: Mapping[str, Any],
    corpus_binding: Mapping[str, Any],
    fit_source_sha256s: Mapping[str, str],
) -> None:
    lens_sha256 = receipt.get("lensSha256")
    if not isinstance(lens_sha256, str):
        raise RuntimeError("generated fit receipt is missing its lens digest")
    core_fields = jacobian_lens_v4_fit_receipt_fields(
        dict(artifact), lens_sha256=lens_sha256
    )
    core_actual = {key: receipt.get(key) for key in core_fields}
    if (
        core_actual != core_fields
        or receipt.get("selfHash") != sha256_json({**receipt, "selfHash": None})
        or receipt.get("scalarFormulaSha256") != FROZEN_SCALAR_FORMULA_SHA256
        or receipt.get("controlProfileSha256") != FROZEN_CONTROL_PROFILE_SHA256
        or receipt.get("controlProfileArtifactSha256")
        != FROZEN_CONTROL_PROFILE_FILE_SHA256
        or receipt.get("controlProfileSelfHash")
        != FROZEN_CONTROL_PROFILE_SELF_HASH
        or receipt.get("scalarStatisticsSha256")
        != _scalar_statistics_sha256(artifact)
        or receipt.get("scalarStatisticsSha256")
        != scalar_validation.get("scalarStatisticsSha256")
        or receipt.get("fitBindingSha256")
        != scalar_validation.get("fitBindingSha256")
        or receipt.get("primaryAlphaInterior")
        is not scalar_validation.get("primaryAlphaInterior")
        or receipt.get("primaryBetaInterior")
        is not scalar_validation.get("primaryBetaInterior")
        or receipt.get("sourceSelectionSha256")
        != corpus_binding.get("sourceSelectionSha256")
        or receipt.get("sequenceOrderSha256")
        != corpus_binding.get("sequenceOrderSha256")
        or receipt.get("sequenceSetSha256")
        != corpus_binding.get("sequenceSetSha256")
        or receipt.get("corpusArtifactSha256")
        != corpus_binding.get("corpusArtifactSha256")
        or receipt.get("fitSourceSha256s") != dict(fit_source_sha256s)
        or receipt.get("fitScriptSha256")
        != fit_source_sha256s.get("scripts/research/fit_jspace_s4_lens.py")
        or receipt.get("semanticLabelsAccessed") is not False
        or _contains_private_numeric_scalars(receipt)
    ):
        raise RuntimeError(
            "generated fit receipt differs from its scalar, formula, or source bindings"
        )


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
            or set(gates) != {"centered", "localTaylor", "jacobianSpecific"}
            or any(type(value) is not bool for value in gates.values())
        ):
            raise ValueError("S4 attribution evidence is incomplete or malformed")
        per_lane[lane] = {
            "primaryAlphaInterior": receipt["primaryAlphaInterior"],
            "primaryBetaInterior": receipt["primaryBetaInterior"],
            "centeredGainBootstrapLowerAboveZero": gates["centered"],
            "localTaylorGainBootstrapLowerAboveZero": gates["localTaylor"],
            "jacobianSpecificGainBootstrapLowerAboveZero": gates["jacobianSpecific"],
        }
    scalar_claim = all(
        lane["primaryAlphaInterior"]
        and lane["centeredGainBootstrapLowerAboveZero"]
        and lane["localTaylorGainBootstrapLowerAboveZero"]
        for lane in per_lane.values()
    )
    jacobian_claim = scalar_claim and all(
        lane["primaryBetaInterior"]
        and lane["jacobianSpecificGainBootstrapLowerAboveZero"]
        for lane in per_lane.values()
    )
    return {
        "profileSha256": FROZEN_CONTROL_PROFILE_SHA256,
        "perLane": per_lane,
        "scalarCalibrationClaimAdmitted": scalar_claim,
        "jacobianSpecificClaimAdmitted": jacobian_claim,
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
            "confirmation observation requires a committed exact-revision passing S4 pilot"
        )
    evidence_path = Path(args.pilot_evidence).resolve()
    if not evidence_path.is_file():
        raise FileNotFoundError(evidence_path)
    _repo_relative(evidence_path)
    evidence = _read_json(evidence_path)
    fit_bindings = evidence.get("fitReceipts")
    fit_evidence = evidence.get("fitEvidence")
    if (
        evidence.get("schema") != PILOT_ADMISSION_SCHEMA
        or evidence.get("selfHash") != sha256_json({**evidence, "selfHash": None})
        or evidence.get("stage") != "pilot"
        or evidence.get("gatePassed") is not True
        or evidence.get("semanticLabelsAccessed") is not False
        or evidence.get("selectionManifestSha256") != sha256_file(selection_manifest_path)
        or evidence.get("selectionManifestSelfHash") != selection_manifest.get("selfHash")
        or evidence.get("scalarFormulaSha256") != FROZEN_SCALAR_FORMULA_SHA256
        or evidence.get("controlProfileSha256") != FROZEN_CONTROL_PROFILE_SHA256
        or not _is_git_revision(evidence.get("gitRevision"))
        or not isinstance(fit_bindings, dict)
        or set(fit_bindings) != {"a", "b"}
        or not isinstance(fit_evidence, dict)
        or set(fit_evidence) != {"a", "b"}
        or _contains_private_numeric_scalars(evidence)
    ):
        raise ValueError("confirmation S4 pilot-admission evidence is invalid")

    fidelity_path, fidelity = _validate_bound_json(
        evidence.get("fidelityArtifact"), schema=FIDELITY_SCHEMA
    )
    collection_path, collection = _validate_bound_json(
        evidence.get("collectionArtifact"),
        schema="holoserve.workspace-signal-collection.v0.1.0",
    )
    rows_path = _validate_bound_file(evidence.get("rowsArtifact"))
    receipts_path = _validate_bound_file(evidence.get("receiptsArtifact"))
    fit_paths: dict[str, Path] = {}
    fit_receipts: dict[str, dict[str, Any]] = {}
    for lane in ("a", "b"):
        path, receipt = _validate_bound_json(fit_bindings[lane], schema=FIT_RECEIPT_SCHEMA)
        _validate_fit_receipt_payload(
            receipt,
            lane=lane,
            pilot_binding=selection_manifest["pilotArtifacts"][lane],
            manifest=selection_manifest,
            verify_revision_sources=True,
        )
        if receipt["gitRevision"] != evidence["gitRevision"]:
            raise ValueError("S4 pilot fit revisions differ from the admission revision")
        fit_paths[lane] = path
        fit_receipts[lane] = receipt

    expected_fit_evidence = {
        lane: {
            "fitReceiptSha256": sha256_file(fit_paths[lane]),
            "fitReceiptSelfHash": fit_receipts[lane]["selfHash"],
            "lensSha256": fit_receipts[lane]["lensSha256"],
            "scalarStatisticsSha256": fit_receipts[lane]["scalarStatisticsSha256"],
            "fitBindingSha256": fit_receipts[lane]["fitBindingSha256"],
            "primaryAlphaInterior": fit_receipts[lane]["primaryAlphaInterior"],
            "primaryBetaInterior": fit_receipts[lane]["primaryBetaInterior"],
        }
        for lane in ("a", "b")
    }
    if fit_evidence != expected_fit_evidence:
        raise ValueError("S4 pilot fit/lens/statistic evidence binding mismatch")

    projected_millis = (
        sum(receipt["elapsedMillis"] for receipt in fit_receipts.values()) * 72 + 47
    ) // 48
    if projected_millis > 45 * 60 * 1000:
        raise ValueError("projected A+B S4 confirmation fit exceeds 45 minutes")

    aliases = fidelity.get("aliases")
    replication = fidelity.get("replication")
    bootstrap = fidelity.get("bootstrap")
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
        or fidelity.get("positionBins") != FROZEN_POSITION_BINS
        or fidelity.get("layers") != FROZEN_LAYERS
        or fidelity.get("primaryLayers") != FROZEN_PRIMARY_LAYERS
        or fidelity.get("ceilingLayer") != 8
        or bootstrap
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
            or alias.get("recordCount") != 48
            or not isinstance(alias.get("gates"), dict)
            or set(alias["gates"]) != exact_gate_keys
            or set(alias["gates"].values()) != {True}
            or not isinstance(alias.get("attribution"), dict)
            or alias["attribution"].get("fitScalarInteriorRequiredSeparately") is not True
            or not isinstance(alias["attribution"].get("gates"), dict)
            or set(alias["attribution"]["gates"])
            != {"centered", "localTaylor", "jacobianSpecific"}
            or any(
                type(value) is not bool
                for value in alias["attribution"]["gates"].values()
            )
            for alias in aliases.values()
        )
        or not isinstance(replication, dict)
        or replication.get("passed") is not True
        or not isinstance(replication.get("macroGainPearsonE8"), int)
        or replication["macroGainPearsonE8"] < 90_000_000
        or not isinstance(replication.get("macroGainSignAgreementE8"), int)
        or replication["macroGainSignAgreementE8"] < 90_000_000
        or _contains_private_numeric_scalars(fidelity)
    ):
        raise ValueError("bound S4 pilot fidelity artifact does not admit confirmation")

    attribution_admission = _derive_attribution_admission(fit_receipts, aliases)
    if evidence.get("attributionAdmission") != attribution_admission:
        raise ValueError("S4 pilot attribution-claim admission binding mismatch")

    model_lenses = {
        model.get("alias"): model.get("lensSha256")
        for model in fidelity.get("models", [])
        if isinstance(model, dict)
    }
    expected_lenses = {
        lane: fit_receipts[lane]["lensSha256"] for lane in ("a", "b")
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
        or collection.get("promptCount") != 48
        or collection.get("rowCount") != 96
        or collection.get("receiptCount") != 96
        or collection.get("truncatedRowCount") != 0
        or collection.get("allowTruncated") is not False
        or collection.get("rowArtifactSha256") != sha256_file(rows_path)
        or collection.get("receiptArtifactSha256") != sha256_file(receipts_path)
        or not isinstance(capabilities, dict)
        or set(capabilities) != {"a", "b"}
        or any(
            not isinstance(capability, dict)
            or capability.get("lensSha256") != expected_lenses[lane]
            or capability.get("estimator") != JACOBIAN_LENS_ESTIMATOR_V4
            or capability.get("transportProfile") != JACOBIAN_LENS_V4_TRANSPORT_PROFILE
            or capability.get("positionPolicy") != "endpoint-self-only"
            or capability.get("positionBins") != FROZEN_POSITION_BINS
            or capability.get("layers") != FROZEN_LAYERS
            for lane, capability in capabilities.items()
        )
        or _contains_private_numeric_scalars(collection)
    ):
        raise ValueError("S4 pilot collection artifacts do not admit confirmation")
    provenance_paths = (
        evidence_path,
        fidelity_path,
        collection_path,
        rows_path,
        receipts_path,
        *fit_paths.values(),
    )
    return evidence, tuple(_repo_relative(path) for path in provenance_paths)


def _validate_inputs(args: argparse.Namespace) -> tuple[
    list[torch.Tensor], dict[str, Any], dict[str, Any], dict[str, Any]
]:
    checkpoint_path = Path(args.checkpoint).resolve()
    bins_dir = Path(args.bins).resolve()
    corpus_path = Path(args.corpus).resolve()
    manifest_path = Path(args.corpus_manifest).resolve()
    preregistration_path = Path(args.preregistration).resolve()
    control_profile_path = (
        REPO_ROOT / "research" / "data" / "jspace-s4" / "control-profile.json"
    )
    for path in (
        checkpoint_path,
        bins_dir / "tokenizer.json",
        bins_dir / "meta.json",
        corpus_path,
        manifest_path,
        preregistration_path,
        control_profile_path,
    ):
        if not path.is_file():
            raise FileNotFoundError(path)
    if (
        sha256_file(checkpoint_path) != FROZEN_CHECKPOINT_SHA256
        or sha256_file(bins_dir / "tokenizer.json") != FROZEN_TOKENIZER_SHA256
        or sha256_file(preregistration_path) != FROZEN_S4_PREREGISTRATION_SHA256
        or sha256_file(REPO_ROOT / "scripts/research/select_jspace_s4_corpus.py")
        != FROZEN_S4_SELECTOR_SHA256
    ):
        raise ValueError("checkpoint, tokenizer, preregistration, or selector hash mismatch")
    _validate_control_profile()

    # Replay the complete inherited leakage and failed-S3 evidence chain using
    # the frozen selector's verifier before trusting the S4 manifest.
    s2 = selector._verify_s2(REPO_ROOT / selector.S2_REPO_DIR)
    s3_manifest, s3_pilot, s3_confirmation, coordinate_maps, _ = selector._verify_s3(
        s2[3],
        s2[4],
        s2[0],
        s2[1],
        s2[2],
        REPO_ROOT / selector.S3_REPO_DIR,
        REPO_ROOT / selector.S3_MEASUREMENT_REPO_DIR,
    )
    manifest = _read_json(manifest_path)
    if (
        manifest.get("schema") != SELECTION_MANIFEST_SCHEMA
        or sha256_file(manifest_path) != FROZEN_S4_SELECTION_MANIFEST_SHA256
        or manifest.get("selfHash") != FROZEN_S4_SELECTION_MANIFEST_SELF_HASH
        or manifest.get("selfHash") != sha256_json({**manifest, "selfHash": None})
        or manifest.get("preregistrationSha256") != FROZEN_S4_PREREGISTRATION_SHA256
        or manifest.get("selectorSourceSha256") != FROZEN_S4_SELECTOR_SHA256
        or manifest.get("semanticLabelsAccessed") is not False
        or manifest.get("checkpointSha256") != FROZEN_CHECKPOINT_SHA256
        or manifest.get("tokenizerSha256") != FROZEN_TOKENIZER_SHA256
        or manifest.get("positionBins") != FROZEN_POSITION_BINS
        or manifest.get("sourceS2", {}).get("semanticLabelsAccessed") is not False
        or manifest.get("sourceS2", {}).get("corpusManifest", {}).get("sha256")
        != FROZEN_S2_MANIFEST_SHA256
        or manifest.get("sourceS3", {}).get("semanticLabelsAccessed") is not False
        or manifest.get("sourceS3", {}).get("selectionManifest", {}).get("sha256")
        != FROZEN_S3_MANIFEST_SHA256
        or manifest.get("sourceS3", {}).get("selectionManifest", {}).get("selfHash")
        != FROZEN_S3_MANIFEST_SELF_HASH
        or s3_manifest.get("selfHash") != FROZEN_S3_MANIFEST_SELF_HASH
        or FROZEN_OUTPUT_SHA256 != selector.EXPECTED_OUTPUT_SHA256
    ):
        raise ValueError("fit inputs do not match the frozen S4 selection manifest")

    pilot_coordinates = selector._pilot_coordinates()
    source_coordinates = set(coordinate_maps["a"])
    confirmation_coordinates = sorted(source_coordinates - set(pilot_coordinates))
    selector._balance_proof(pilot_coordinates, stage="pilot")
    selector._balance_proof(confirmation_coordinates, stage="confirmation")
    stage_rows: dict[str, dict[str, list[dict[str, Any]]]] = {
        "pilot": {},
        "confirmation": {},
    }
    stage_paths: list[Path] = []
    for stage, coordinates in (
        ("pilot", pilot_coordinates),
        ("confirmation", confirmation_coordinates),
    ):
        group = manifest.get(
            "pilotArtifacts" if stage == "pilot" else "confirmationArtifacts"
        )
        if not isinstance(group, dict) or set(group) != {"a", "b", "h"}:
            raise ValueError(f"S4 {stage} must bind exact A/B/H artifacts")
        for lane in ("a", "b", "h"):
            binding = group[lane]
            path = (manifest_path.parent / binding.get("file", "")).resolve()
            if path.parent != manifest_path.parent or not path.is_file():
                raise ValueError("S4 artifact path is not manifest-relative")
            rows = _read_jsonl(path)
            selector._verify_binding(rows, path, binding, label=f"S4 {stage} {lane}")
            expected_rows = [coordinate_maps[lane][coordinate] for coordinate in coordinates]
            if (
                rows != expected_rows
                or binding.get("sha256") != FROZEN_OUTPUT_SHA256[stage][lane]
                or [selector._coordinate(row) for row in rows] != coordinates
            ):
                raise ValueError(f"S4 {stage} {lane} differs from the frozen partition")
            stage_rows[stage][lane] = rows
            stage_paths.append(path)
    for lane in ("a", "b", "h"):
        if sorted(
            stage_rows["pilot"][lane] + stage_rows["confirmation"][lane],
            key=selector._coordinate,
        ) != s3_confirmation[lane]:
            raise ValueError(f"S4 {lane} is not the exact S3-confirmation partition")

    group_name = "pilotArtifacts" if args.stage == "pilot" else "confirmationArtifacts"
    binding = manifest[group_name][args.lane]
    expected_path = (manifest_path.parent / binding["file"]).resolve()
    if expected_path != corpus_path or sha256_file(corpus_path) != binding["sha256"]:
        raise ValueError("selected corpus does not match its exact S4 binding")
    rows = stage_rows[args.stage][args.lane]
    tokenizer = _read_json(bins_dir / "tokenizer.json")
    merges = tokenizer.get("merges")
    if not isinstance(merges, list):
        raise ValueError("tokenizer merges are missing")
    merge_id = {merge[2]: index for index, merge in enumerate(merges)}
    batches: list[torch.Tensor] = []
    for index, row in enumerate(rows):
        forbidden = sorted(FORBIDDEN_PROMPT_FIELDS.intersection(row))
        prompt = row.get("prompt")
        endpoint = FROZEN_ENDPOINT_TEXT.get((row.get("taskForm"), row.get("variant")))
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
            raise ValueError(f"corpus row {index} violates the frozen prompt contract")
        tokens = [1, *encode_text(prompt, merges, merge_id)]
        sequence_sha256 = sha256_json(tokens)
        if (
            len(tokens) > FROZEN_MAX_SEQ_LEN
            or row.get("tokenCount") != len(tokens)
            or row.get("tokenIdsSha256") != sequence_sha256
            or row.get("sequenceSha256") != sequence_sha256
            or not isinstance(row.get("caseId"), str)
            or row.get("endpointTextSha256") != _sha256_text(endpoint)
        ):
            raise ValueError(f"corpus row {index} tokenization or identity mismatch")
        bin_index = selector._coordinate(row)[1]
        if not FROZEN_POSITION_BINS[bin_index][0] <= len(tokens) - 1 <= FROZEN_POSITION_BINS[bin_index][1]:
            raise ValueError(f"corpus row {index} endpoint is outside its position bin")
        batches.append(torch.tensor([tokens], dtype=torch.long))

    expected_count = 48 if args.stage == "pilot" else 72
    if len(batches) != expected_count:
        raise ValueError("S4 corpus row count does not match the frozen stage")
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
            None if admission is None else sha256_file(Path(args.pilot_evidence).resolve())
        ),
        "pilotAdmissionManifestSelfHash": None if admission is None else admission["selfHash"],
    }
    return batches, manifest, corpus_binding, {
        "checkpoint": checkpoint_path,
        "bins": bins_dir,
        "fitSourcePaths": admission_paths,
    }


def fit(args: argparse.Namespace) -> None:
    if args.layers != FROZEN_LAYERS or args.dim_batch != FROZEN_DIM_BATCH:
        raise ValueError("layers and dim batch must match the frozen S4 preregistration")
    batches, manifest, corpus_binding, paths = _validate_inputs(args)
    if args.dry_run:
        print(
            json.dumps(
                {
                    "status": "validated",
                    "lane": args.lane,
                    "stage": args.stage,
                    "rowCount": len(batches),
                    "corpusSha256": corpus_binding["corpusArtifactSha256"],
                    "sourceSelectionSha256": corpus_binding["sourceSelectionSha256"],
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
    output_path = Path(args.output).resolve()
    receipt_path = Path(args.receipt).resolve()
    if output_path == receipt_path or output_path.exists() or receipt_path.exists():
        raise ValueError("S4 fit outputs must be distinct, absent paths; reruns cannot overwrite")
    try:
        output_path.relative_to(REPO_ROOT)
    except ValueError:
        pass
    else:
        raise ValueError("the private scalar-statistic lens must remain outside the repository")
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
    artifact = fit_endpoint_scalar_calibrated_jacobian_lens_v1(
        model,
        batches,
        layers=args.layers,
        checkpoint_sha256=FROZEN_CHECKPOINT_SHA256,
        tokenizer_sha256=FROZEN_TOKENIZER_SHA256,
        control_profile_sha256=FROZEN_CONTROL_PROFILE_SHA256,
        calibration_corpus_sha256=corpus_binding["sequenceOrderSha256"],
        dim_batch=args.dim_batch,
        max_seq_len=FROZEN_MAX_SEQ_LEN,
        position_bins=[tuple(value) for value in FROZEN_POSITION_BINS],
    )
    elapsed_millis = round((time.perf_counter() - started) * 1000)
    _require_unchanged_fit_sources(fit_source_sha256s)

    expected_bin_counts = [12, 12, 12, 12] if args.stage == "pilot" else [18, 18, 18, 18]
    scalar_validation = _validate_scalar_artifact(
        artifact,
        expected_sequence_sha256s=corpus_binding["sequenceSha256s"],
        expected_position_bin_counts=expected_bin_counts,
    )
    # The artifact sequence list must be the sealed order, not merely a valid list.
    if artifact["calibration"]["corpusSha256"] != corpus_binding["sequenceOrderSha256"]:
        raise RuntimeError("fitted scalar artifact used a different source-row order")

    peak_bytes = 0
    total_bytes = 0
    if args.device.startswith("cuda"):
        peak_bytes = int(torch.cuda.max_memory_allocated(args.device))
        total_bytes = int(torch.cuda.get_device_properties(args.device).total_memory)
        if peak_bytes * 10 > total_bytes * 9:
            raise RuntimeError("fit exceeded the preregistered 90% GPU memory ceiling")

    artifact_sha256 = save_jacobian_lens_artifact(artifact, output_path)
    calibration = artifact["calibration"]
    receipt: dict[str, Any] = {
        "schema": FIT_RECEIPT_SCHEMA,
        "createdAt": _utc_now(),
        "startedAt": started_at,
        "gitRevision": git_revision,
        "stage": args.stage,
        "lane": args.lane,
        "estimator": JACOBIAN_LENS_ESTIMATOR_V4,
        "paperParity": False,
        "transportProfile": JACOBIAN_LENS_V4_TRANSPORT_PROFILE,
        "scalarCalibration": JACOBIAN_LENS_V4_SCALAR_CALIBRATION_PROFILE,
        "scalarIdentityControl": JACOBIAN_LENS_V4_SCALAR_IDENTITY_CONTROL_PROFILE,
        "scalarFormulaSha256": SCALAR_FORMULA_SHA256,
        "controlProfileSha256": FROZEN_CONTROL_PROFILE_SHA256,
        "controlProfileArtifactSha256": FROZEN_CONTROL_PROFILE_FILE_SHA256,
        "controlProfileSelfHash": FROZEN_CONTROL_PROFILE_SELF_HASH,
        "scalarStatisticsDigestSchema": SCALAR_STATISTICS_DIGEST_SCHEMA,
        "scalarStatisticsSha256": scalar_validation["scalarStatisticsSha256"],
        "fitBindingSha256": scalar_validation["fitBindingSha256"],
        "primaryAlphaInterior": scalar_validation["primaryAlphaInterior"],
        "primaryBetaInterior": scalar_validation["primaryBetaInterior"],
        "positionPolicy": "endpoint-self-only",
        "positionBins": FROZEN_POSITION_BINS,
        "layers": args.layers,
        "dimBatch": args.dim_batch,
        "maxSeqLen": FROZEN_MAX_SEQ_LEN,
        "checkpointSha256": FROZEN_CHECKPOINT_SHA256,
        "tokenizerSha256": FROZEN_TOKENIZER_SHA256,
        "preregistrationSha256": FROZEN_S4_PREREGISTRATION_SHA256,
        "sourceS2CorpusManifestSha256": FROZEN_S2_MANIFEST_SHA256,
        "sourceS3SelectionManifestSha256": FROZEN_S3_MANIFEST_SHA256,
        "selectionManifestSha256": FROZEN_S4_SELECTION_MANIFEST_SHA256,
        "selectionManifestSelfHash": FROZEN_S4_SELECTION_MANIFEST_SELF_HASH,
        "pilotAdmissionManifestSha256": corpus_binding["pilotAdmissionManifestSha256"],
        "pilotAdmissionManifestSelfHash": corpus_binding["pilotAdmissionManifestSelfHash"],
        "corpusArtifactSha256": corpus_binding["corpusArtifactSha256"],
        "coordinateSetSha256": corpus_binding["coordinateSetSha256"],
        "calibrationCorpusSha256": calibration["corpusSha256"],
        "calibrationShardSha256": calibration["shardSha256"],
        "promptHashSetSha256": corpus_binding["promptHashSetSha256"],
        "sequenceSetSha256": corpus_binding["sequenceSetSha256"],
        "sequenceOrderSha256": corpus_binding["sequenceOrderSha256"],
        "caseIdSetSha256": corpus_binding["caseIdSetSha256"],
        "sourceSelectionSha256": corpus_binding["sourceSelectionSha256"],
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
    if set(receipt) != FIT_RECEIPT_FIELDS:
        raise RuntimeError("generated fit receipt fields differ from the frozen schema")
    _validate_generated_receipt_payload(
        receipt,
        artifact=artifact,
        scalar_validation=scalar_validation,
        corpus_binding=corpus_binding,
        fit_source_sha256s=fit_source_sha256s,
    )
    _write_json_atomic(receipt_path, receipt)
    if _read_json(receipt_path) != receipt:
        raise RuntimeError("written fit receipt differs from its validated payload")
    loaded = load_jacobian_lens_artifact(
        output_path,
        checkpoint_sha256=FROZEN_CHECKPOINT_SHA256,
        tokenizer_sha256=FROZEN_TOKENIZER_SHA256,
        model=model,
        fit_receipt_path=receipt_path,
    )
    if loaded.lens_sha256 != artifact_sha256:
        raise RuntimeError("saved S4 lens failed receipt-bound provenance loadback")
    _require_unchanged_fit_sources(fit_source_sha256s)
    print(
        json.dumps(
            {
                "status": "fitted",
                "lane": args.lane,
                "stage": args.stage,
                "lensSha256": artifact_sha256,
                "receiptSha256": sha256_file(receipt_path),
                "scalarStatisticsSha256": scalar_validation["scalarStatisticsSha256"],
                "primaryAlphaInterior": scalar_validation["primaryAlphaInterior"],
                "primaryBetaInterior": scalar_validation["primaryBetaInterior"],
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
