"""Receipt-bound Jacobian-lens observation for native HoloServe models.

The serving path only applies a precomputed, corpus-averaged lens. Fitting is an
offline operation because live per-request autograd would be expensive, would
make latency input-dependent, and could be mistaken for Anthropic's averaged
Jacobian lens when it is only a prompt-local gradient.

This module deliberately exposes observation only. It has no activation-write,
steering, ablation, or intervention API.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

import torch
from torch.nn import functional as F


JACOBIAN_LENS_ARTIFACT_SCHEMA = "holoscript.jacobian-lens-artifact.v0.1.0"
MODEL_WORKSPACE_RECEIPT_SCHEMA = "holoscript.model-workspace-receipt.v0.2.0"
MODEL_WORKSPACE_CAPABILITY_SCHEMA = "holoscript.model-workspace-capability.v0.2.0"
MODEL_WORKSPACE_HASH_CANONICALIZATION = "holoscript.integer-measurement-json.v0.1.0"
MODEL_WORKSPACE_MEASUREMENT_PROFILE = "full-distribution-v1"
MODEL_WORKSPACE_CONTROL_PROFILE = "uncorrected-logit-lens-v1"
MODEL_WORKSPACE_SCORE_PROFILE = "mean-mapped-control-full-vocabulary-jsd-nats-v1"
JACOBIAN_LENS_ESTIMATOR_V0 = "explicit_pair_average_v0"
JACOBIAN_LENS_ESTIMATOR = JACOBIAN_LENS_ESTIMATOR_V0
JACOBIAN_LENS_ESTIMATOR_V1 = "corpus_position_average_v1"
JACOBIAN_LENS_ESTIMATOR_V2 = "endpoint_self_jacobian_affine_v1"
JACOBIAN_LENS_ESTIMATOR_V3 = "endpoint_self_jacobian_local_taylor_v1"
JACOBIAN_LENS_ESTIMATOR_V4 = "endpoint_self_jacobian_scalar_calibrated_v1"
EXPLICIT_POSITION_POLICY = "explicit-source-target-pairs"
ALL_VALID_CURRENT_AND_FUTURE_POSITION_POLICY = "all-valid-current-and-future-targets"
ENDPOINT_SELF_POSITION_POLICY = "endpoint-self-only"
JACOBIAN_LENS_V1_REFERENCE_REPOSITORY = "https://github.com/anthropics/jacobian-lens"
JACOBIAN_LENS_V1_REFERENCE_COMMIT = "581d398613e5602a5af361e1c34d3a92ea82ba8e"
JACOBIAN_LENS_V1_REFERENCE_LICENSE = "Apache-2.0"
JACOBIAN_LENS_V1_CORPUS_CANONICALIZATION = "ordered-post-truncation-sequence-sha256-v1"
JACOBIAN_LENS_V1_PROMPT_TRUNCATION_POLICY = "right-truncate-token-ids-to-max-seq-len"
JACOBIAN_LENS_V2_PROMPT_TRUNCATION_POLICY = "reject-over-max-seq-len"
JACOBIAN_LENS_V2_CORPUS_CANONICALIZATION = "ordered-whole-sequence-sha256-v1"
JACOBIAN_LENS_V2_TRANSPORT_PROFILE = "mean-anchored-affine-final-residual-v1"
JACOBIAN_LENS_V3_TRANSPORT_PROFILE = "local-taylor-affine-final-residual-v1"
JACOBIAN_LENS_V4_TRANSPORT_PROFILE = (
    "mean-centered-scalar-jacobian-final-residual-v1"
)
JACOBIAN_LENS_V4_SCALAR_CALIBRATION_PROFILE = (
    "binwise-mean-centered-multiplicative-shrink-clipped-v1"
)
JACOBIAN_LENS_V4_SCALAR_IDENTITY_CONTROL_PROFILE = (
    "binwise-mean-centered-scalar-identity-v1"
)
JACOBIAN_LENS_V4_RIDGE_FRACTION = 0.001
JACOBIAN_LENS_V4_CLIP_BOUNDS = (0.0, 2.0)
JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256 = (
    "sha256:9c914202bc680ba5e6d1d3fc2413ba81cc61e2bd7cae52d8dda9a9bf314204fa"
)
JACOBIAN_LENS_V4_FIT_BINDING_SCHEMA = "holoscript.jspace-s4-fit-binding.v0.1.0"
JACOBIAN_LENS_V4_FIT_RECEIPT_SCHEMA = "holoscript.jspace-s4-fit-receipt.v0.1.0"
JACOBIAN_LENS_V4_SCALAR_STATISTICS_DIGEST_SCHEMA = (
    "holoscript.jspace-s4-scalar-statistics-digest.v0.1.0"
)
JACOBIAN_LENS_V4_SCALAR_STATISTIC_KEYS = (
    "centeredJacobianEnergyMeans",
    "centeredJacobianTargetCrossMeans",
    "centeredIdentityEnergyMeans",
    "centeredIdentityTargetCrossMeans",
)
WORKSPACE_PROBE_IMPLEMENTATION_VERSION = "0.1.0"
MAX_WORKSPACE_TOP_K = 25
MAX_WORKSPACE_POSITIONS = 4
MAX_JACOBIAN_LENS_DIM_BATCH = 64
MAX_JACOBIAN_LENS_SEQUENCE_LENGTH = 4096
DEFAULT_MAX_JACOBIAN_LENS_CPU_MATRIX_BYTES = 512 * 1024 * 1024
MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991
MEASUREMENT_E8 = 100_000_000


class WorkspaceProbeError(ValueError):
    """A bounded, caller-visible probe validation failure."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class LoadedJacobianLensArtifact:
    metadata: dict[str, Any]
    matrices: dict[int, torch.Tensor]
    biases: dict[int, torch.Tensor]
    target_means: dict[int, torch.Tensor]
    lens_sha256: str
    control_matrices: dict[str, dict[int, torch.Tensor]] | None = None
    control_biases: dict[str, dict[int, torch.Tensor]] | None = None
    control_scalars: dict[str, dict[int, torch.Tensor]] | None = None

    @property
    def layers(self) -> tuple[int, ...]:
        return tuple(sorted(self.matrices))


def sha256_file(path: str | Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def sha256_json(value: Any) -> str:
    encoded = json.dumps(
        _validate_hash_value(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def sha256_contract_json(value: Any) -> str:
    """Hash a finite JSON research contract that intentionally contains literals."""

    try:
        encoded = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise WorkspaceProbeError(
            "invalid_contract_digest",
            "research contract must be finite canonical JSON",
        ) from error
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def jacobian_lens_v4_scalar_formula_contract() -> dict[str, Any]:
    """Return the literal frozen S4 scalar formula used by fitter and loader."""

    return {
        "schema": "holoscript.jspace-s4-scalar-formula.v0.1.0",
        "estimator": JACOBIAN_LENS_ESTIMATOR_V4,
        "transportProfile": JACOBIAN_LENS_V4_TRANSPORT_PROFILE,
        "scalarCalibration": JACOBIAN_LENS_V4_SCALAR_CALIBRATION_PROFILE,
        "scalarIdentityControl": JACOBIAN_LENS_V4_SCALAR_IDENTITY_CONTROL_PROFILE,
        "sourceCentering": "x_i-xbar",
        "targetCentering": "y_i-ybar",
        "jacobianProjection": "z_i=Jbar@(x_i-xbar)",
        "jacobianEnergy": "S=sum_i(dot(z_i,z_i))/(n*d)",
        "jacobianCross": "C=sum_i(dot(z_i,y_i-ybar))/(n*d)",
        "identityEnergy": "S_I=sum_i(dot(x_i-xbar,x_i-xbar))/(n*d)",
        "identityCross": "C_I=sum_i(dot(x_i-xbar,y_i-ybar))/(n*d)",
        "operationOrder": [
            "denominator=(1.0+rho)*energy",
            "raw=cross/denominator",
            "scalar=clip(raw,0.0,2.0)",
            "matrix=scalar*Jbar",
            "bias=ybar-matrix@xbar",
        ],
        "ridgeFraction": JACOBIAN_LENS_V4_RIDGE_FRACTION,
        "clipBounds": list(JACOBIAN_LENS_V4_CLIP_BOUNDS),
        "statisticsDtype": "float64",
        "servedDtype": "float32",
        "biasTolerance": {"rtol": 0.00002, "atol": 0.00002},
        "primaryLayers": [2, 5],
    }


def jacobian_lens_v4_scalar_formula_sha256() -> str:
    return sha256_contract_json(jacobian_lens_v4_scalar_formula_contract())


def jacobian_lens_v4_scalar_statistics_payload(
    artifact: dict[str, Any],
) -> dict[str, Any]:
    tensors = []
    for name in JACOBIAN_LENS_V4_SCALAR_STATISTIC_KEYS:
        tensor = artifact.get(name)
        if (
            not isinstance(tensor, torch.Tensor)
            or tensor.dtype != torch.float64
            or not torch.isfinite(tensor).all()
        ):
            raise WorkspaceProbeError(
                "invalid_scalar_calibration",
                f"scalar statistic {name} must be a finite float64 tensor",
            )
        cpu = tensor.detach().to(device="cpu")
        tensors.append(
            {
                "name": name,
                "dtype": "float64",
                "shape": list(cpu.shape),
                "valuesFloatHex": [
                    float(item).hex() for item in cpu.reshape(-1).tolist()
                ],
            }
        )
    return {
        "schema": JACOBIAN_LENS_V4_SCALAR_STATISTICS_DIGEST_SCHEMA,
        "tensors": tensors,
    }


def jacobian_lens_v4_scalar_statistics_sha256(artifact: dict[str, Any]) -> str:
    return sha256_json(jacobian_lens_v4_scalar_statistics_payload(artifact))


def jacobian_lens_v4_fit_binding_payload(
    artifact: dict[str, Any],
    *,
    control_profile_sha256: str,
) -> dict[str, Any]:
    calibration = artifact.get("calibration")
    if (
        not isinstance(calibration, dict)
        or control_profile_sha256 != JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256
    ):
        raise WorkspaceProbeError(
            "invalid_lens_fit_binding",
            "S4 fit binding requires calibration metadata and a control-profile digest",
        )
    sequence_sha256s = calibration.get("sequenceSha256s")
    position_bin_counts = calibration.get("positionBinCounts")
    if (
        not isinstance(sequence_sha256s, list)
        or not sequence_sha256s
        or any(not _is_sha256(value) for value in sequence_sha256s)
        or len(set(sequence_sha256s)) != len(sequence_sha256s)
        or not isinstance(position_bin_counts, list)
        or any(type(count) is not int or count < 1 for count in position_bin_counts)
        or sum(position_bin_counts) != len(sequence_sha256s)
    ):
        raise WorkspaceProbeError(
            "invalid_lens_fit_binding",
            "S4 fit binding requires unique sequences and exact positive bin counts",
        )
    return {
        "schema": JACOBIAN_LENS_V4_FIT_BINDING_SCHEMA,
        "sequenceOrderSha256": sha256_json(sequence_sha256s),
        "sequenceSetSha256": sha256_json(sorted(sequence_sha256s)),
        "sampleCount": len(sequence_sha256s),
        "positionBinCounts": position_bin_counts,
        "scalarStatisticsSha256": jacobian_lens_v4_scalar_statistics_sha256(artifact),
        "scalarFormulaSha256": jacobian_lens_v4_scalar_formula_sha256(),
        "controlProfileSha256": control_profile_sha256,
    }


def fit_jacobian_lens(
    model,
    calibration_batches: Iterable[torch.Tensor],
    *,
    layers: Sequence[int],
    position_pairs: Sequence[tuple[int, int]],
    checkpoint_sha256: str,
    tokenizer_sha256: str,
    calibration_corpus_sha256: str,
    architecture: str = "holorunner-s0-gpt",
    position_policy: str = EXPLICIT_POSITION_POLICY,
) -> dict[str, Any]:
    """Fit an average layer-to-final-residual Jacobian artifact.

    Each pair is `(source_position, target_position)`. Negative positions use
    normal Python indexing. A target must be at or after its source because the
    decoder is causal. The returned artifact is suitable for `torch.save` via
    :func:`save_jacobian_lens_artifact`.
    """

    if any(type(layer) is not int for layer in layers):
        raise WorkspaceProbeError("invalid_layers", "layers must contain integers")
    layer_ids = sorted(set(layers))
    if not layer_ids:
        raise WorkspaceProbeError("layers_required", "at least one layer is required")
    if not position_pairs:
        raise WorkspaceProbeError(
            "position_pairs_required",
            "at least one source/target position pair is required",
        )
    if any(
        not isinstance(pair, (list, tuple))
        or len(pair) != 2
        or any(type(position) is not int for position in pair)
        for pair in position_pairs
    ):
        raise WorkspaceProbeError(
            "invalid_position_pairs",
            "position pairs must contain exactly two integers",
        )
    if len(set(tuple(pair) for pair in position_pairs)) != len(position_pairs):
        raise WorkspaceProbeError(
            "duplicate_position_pairs",
            "position pairs must be unique",
        )
    for label, value in (
        ("checkpoint", checkpoint_sha256),
        ("tokenizer", tokenizer_sha256),
        ("calibration corpus", calibration_corpus_sha256),
    ):
        if not _is_sha256(value):
            raise WorkspaceProbeError(
                "invalid_provenance_hash",
                f"{label} hash must be a sha256 digest",
            )
    if not isinstance(architecture, str) or not architecture.strip():
        raise WorkspaceProbeError("invalid_architecture", "architecture must be non-empty")
    if position_policy != EXPLICIT_POSITION_POLICY:
        raise WorkspaceProbeError(
            "invalid_position_policy",
            f"position policy must be {EXPLICIT_POSITION_POLICY}",
        )
    layer_count = len(model.blocks)
    for layer in layer_ids:
        if layer < 0 or layer >= layer_count:
            raise WorkspaceProbeError(
                "layer_out_of_range",
                f"layer {layer} must be in [0, {layer_count - 1}]",
            )

    n_embd = int(model.head.in_features)
    totals = {layer: torch.zeros((n_embd, n_embd), dtype=torch.float64) for layer in layer_ids}
    counts = {layer: 0 for layer in layer_ids}
    device = next(model.parameters()).device
    was_training = model.training
    model.eval()
    model.zero_grad(set_to_none=True)

    try:
        for batch in calibration_batches:
            if batch.ndim != 2 or batch.size(0) < 1 or batch.size(1) < 1:
                raise WorkspaceProbeError(
                    "invalid_calibration_batch",
                    "calibration batches must have shape [batch, sequence]",
                )
            token_ids = batch.to(device=device, dtype=torch.long)
            with torch.no_grad():
                _, residuals = model.forward_with_residuals(token_ids)
            sequence_length = int(token_ids.size(1))

            for source_raw, target_raw in position_pairs:
                source_position = _normalize_position(source_raw, sequence_length)
                target_position = _normalize_position(target_raw, sequence_length)
                if target_position < source_position:
                    raise WorkspaceProbeError(
                        "noncausal_position_pair",
                        "target_position must be greater than or equal to source_position",
                    )

                for batch_index in range(int(token_ids.size(0))):
                    for layer in layer_ids:
                        base = residuals[layer][batch_index : batch_index + 1].detach()
                        source = base[0, source_position].detach().clone().requires_grad_(True)
                        mask = torch.zeros(
                            (1, sequence_length, 1),
                            dtype=base.dtype,
                            device=base.device,
                        )
                        mask[:, source_position, :] = 1

                        def continue_from_source(source_value):
                            sequence = base * (1 - mask) + source_value.view(1, 1, -1) * mask
                            final_residual = model.forward_from_residual(
                                sequence,
                                layer + 1,
                                normalize=False,
                            )
                            return final_residual[0, target_position]

                        jacobian = torch.autograd.functional.jacobian(
                            continue_from_source,
                            source,
                            create_graph=False,
                            strict=False,
                            vectorize=False,
                        )
                        if jacobian.shape != (n_embd, n_embd) or not torch.isfinite(jacobian).all():
                            raise WorkspaceProbeError(
                                "invalid_jacobian",
                                f"layer {layer} produced a non-finite or malformed Jacobian",
                            )
                        totals[layer] += jacobian.detach().to(dtype=torch.float64, device="cpu")
                        counts[layer] += 1
    finally:
        model.zero_grad(set_to_none=True)
        model.train(was_training)

    if not all(counts.values()):
        raise WorkspaceProbeError("empty_calibration", "no calibration Jacobians were fitted")

    matrices = torch.stack(
        [(totals[layer] / counts[layer]).to(dtype=torch.float32) for layer in layer_ids]
    )
    if not torch.isfinite(matrices).all():
        raise WorkspaceProbeError(
            "invalid_jacobian",
            "averaged Jacobian overflowed the float32 serving representation",
        )
    degenerate_layers = [
        layer
        for index, layer in enumerate(layer_ids)
        if float(torch.linalg.vector_norm(matrices[index]).item()) <= 1e-12
    ]
    if degenerate_layers:
        raise WorkspaceProbeError(
            "degenerate_jacobian",
            f"calibration produced zero-information lens layers: {degenerate_layers}",
        )
    return {
        "schema": JACOBIAN_LENS_ARTIFACT_SCHEMA,
        "kind": "JacobianLensArtifact",
        "method": "jacobian_lens",
        "estimator": {
            "name": JACOBIAN_LENS_ESTIMATOR,
            "paperParity": False,
            "vectorization": "full-output-jacobian-per-explicit-pair",
        },
        "implementationVersion": WORKSPACE_PROBE_IMPLEMENTATION_VERSION,
        "model": {
            "architecture": architecture,
            "checkpointSha256": checkpoint_sha256,
            "nLayer": layer_count,
            "nEmbd": n_embd,
            "vocabSize": int(model.head.out_features),
        },
        "tokenizer": {"sha256": tokenizer_sha256},
        "calibration": {
            "corpusSha256": calibration_corpus_sha256,
            "jacobianCount": int(next(iter(counts.values()))),
            "positionPolicy": position_policy,
            "positionPairs": [[int(source), int(target)] for source, target in position_pairs],
        },
        "layers": layer_ids,
        "matrices": matrices,
    }


def fit_jacobian_lens_v1(
    model,
    calibration_batches: Iterable[torch.Tensor],
    *,
    layers: Sequence[int],
    checkpoint_sha256: str,
    tokenizer_sha256: str,
    calibration_corpus_sha256: str | None = None,
    architecture: str = "holorunner-s0-gpt",
    dim_batch: int = 8,
    max_seq_len: int = 128,
    skip_first: int = 16,
    max_cpu_matrix_bytes: int = DEFAULT_MAX_JACOBIAN_LENS_CPU_MATRIX_BYTES,
) -> dict[str, Any]:
    """Fit the paper-shaped, corpus/position-averaged Jacobian estimator.

    This follows Anthropic's pinned reference implementation: a prompt is
    replicated ``dim_batch`` times, each replica carries a one-hot output
    cotangent at every valid target position, and one retained graph supplies
    every requested source layer. Causality reduces each source-position
    gradient to current-and-future targets; valid source positions are averaged.

    Calibration provenance is derived from the exact post-truncation token-id
    sequences. A supplied corpus digest is an expected value and fails closed on
    mismatch. Raw token sequences are not retained in the artifact.
    """

    if any(type(layer) is not int for layer in layers):
        raise WorkspaceProbeError("invalid_source_layers", "layers must contain integers")
    layer_ids = sorted(set(layers))
    if not layer_ids:
        raise WorkspaceProbeError(
            "invalid_source_layers",
            "at least one source layer is required",
        )

    layer_count = len(model.blocks)
    target_layer = layer_count - 1
    if target_layer < 1 or any(layer < 0 or layer >= target_layer for layer in layer_ids):
        raise WorkspaceProbeError(
            "invalid_source_layers",
            f"source layers must be a non-empty subset of [0, {target_layer - 1}]",
        )

    n_embd = int(model.head.in_features)
    if type(max_cpu_matrix_bytes) is not int or max_cpu_matrix_bytes < 1:
        raise WorkspaceProbeError(
            "invalid_matrix_budget",
            "max_cpu_matrix_bytes must be a positive integer",
        )
    # Float64 accumulation, the final active per-prompt matrices, stack inputs,
    # stacked output, and conversion temporaries can coexist during finalization.
    # Budget six float32-equivalents per element before allocating any lens.
    projected_matrix_bytes = len(layer_ids) * n_embd * n_embd * 24
    if projected_matrix_bytes > max_cpu_matrix_bytes:
        raise WorkspaceProbeError(
            "matrix_budget_exceeded",
            f"projected CPU lens workspace {projected_matrix_bytes} bytes exceeds "
            f"the {max_cpu_matrix_bytes}-byte budget",
        )
    if (
        type(dim_batch) is not int
        or dim_batch < 1
        or dim_batch > min(MAX_JACOBIAN_LENS_DIM_BATCH, n_embd)
    ):
        raise WorkspaceProbeError(
            "invalid_dim_batch",
            f"dim_batch must be in [1, {min(MAX_JACOBIAN_LENS_DIM_BATCH, n_embd)}]",
        )
    model_sequence_capacity = int(getattr(model.pos, "num_embeddings", 0))
    sequence_limit = min(MAX_JACOBIAN_LENS_SEQUENCE_LENGTH, model_sequence_capacity)
    if type(max_seq_len) is not int or max_seq_len < 2 or max_seq_len > sequence_limit:
        raise WorkspaceProbeError(
            "invalid_max_seq_len",
            f"max_seq_len must be in [2, {sequence_limit}] for the resident model",
        )
    if type(skip_first) is not int or skip_first < 0 or skip_first > max_seq_len - 2:
        raise WorkspaceProbeError(
            "invalid_skip_first",
            f"skip_first must be in [0, {max_seq_len - 2}]",
        )
    for label, value in (
        ("checkpoint", checkpoint_sha256),
        ("tokenizer", tokenizer_sha256),
    ):
        if not _is_sha256(value):
            raise WorkspaceProbeError(
                "invalid_provenance_hash",
                f"{label} hash must be a sha256 digest",
            )
    if calibration_corpus_sha256 is not None and not _is_sha256(calibration_corpus_sha256):
        raise WorkspaceProbeError(
            "invalid_provenance_hash",
            "calibration corpus hash must be a sha256 digest when supplied",
        )
    if not isinstance(architecture, str) or not architecture.strip():
        raise WorkspaceProbeError("invalid_architecture", "architecture must be non-empty")

    prompts: list[torch.Tensor] = []
    sequence_sha256s: list[str] = []
    sequence_token_counts: list[int] = []
    vocab_size = int(model.head.out_features)
    for batch in calibration_batches:
        if (
            not isinstance(batch, torch.Tensor)
            or batch.ndim != 2
            or batch.size(0) < 1
            or batch.size(1) < 1
            or batch.dtype == torch.bool
            or batch.dtype.is_floating_point
            or batch.dtype.is_complex
        ):
            raise WorkspaceProbeError(
                "invalid_calibration_batch",
                "calibration batches must be integer tensors shaped [batch, sequence]",
            )
        truncated = batch.detach().to(device="cpu", dtype=torch.long)[:, :max_seq_len]
        for row in truncated:
            # Own the normalized row before advancing a lazy calibration iterator.
            # A producer may reuse and mutate one CPU-long buffer between yields;
            # retaining a view would then fit the mutated tokens under stale hashes.
            normalized = row.clone(memory_format=torch.contiguous_format)
            sequence_length = int(normalized.numel())
            if sequence_length <= skip_first + 1:
                raise WorkspaceProbeError(
                    "prompt_too_short",
                    f"prompt has {sequence_length} tokens; need more than {skip_first + 1}",
                )
            if bool(((normalized < 0) | (normalized >= vocab_size)).any()):
                raise WorkspaceProbeError(
                    "invalid_calibration_token",
                    f"calibration token ids must be in [0, {vocab_size - 1}]",
                )
            tokens = [int(token) for token in normalized.tolist()]
            prompts.append(normalized.unsqueeze(0))
            sequence_sha256s.append(sha256_json(tokens))
            sequence_token_counts.append(sequence_length)

    if not prompts:
        raise WorkspaceProbeError("empty_calibration", "no calibration prompts were supplied")
    if not (len(prompts) == len(sequence_sha256s) == len(sequence_token_counts)):
        raise WorkspaceProbeError(
            "inconsistent_calibration",
            "each normalized prompt must have exactly one hash and token count",
        )
    derived_corpus_sha256 = sha256_json(sequence_sha256s)
    if calibration_corpus_sha256 is not None and calibration_corpus_sha256 != derived_corpus_sha256:
        raise WorkspaceProbeError(
            "calibration_corpus_hash_mismatch",
            "supplied corpus hash does not match the post-truncation token sequences",
        )

    totals = {layer: torch.zeros((n_embd, n_embd), dtype=torch.float64) for layer in layer_ids}
    n_passes = math.ceil(n_embd / dim_batch)
    device = next(model.parameters()).device
    was_training = model.training
    model.eval()
    model.zero_grad(set_to_none=True)

    try:
        for prompt in prompts:
            token_ids = prompt.to(device=device, dtype=torch.long)
            sequence_length = int(token_ids.size(1))
            valid_positions = torch.arange(
                skip_first,
                sequence_length - 1,
                device=device,
            )
            replicated_ids = token_ids.expand(dim_batch, -1)

            with torch.enable_grad():
                _, residuals = model.forward_with_residuals(replicated_ids)
                if len(residuals) != layer_count:
                    raise WorkspaceProbeError(
                        "invalid_model_residuals",
                        "resident model did not retain every transformer-layer residual",
                    )
                target_activation = residuals[target_layer]
                source_activations = [residuals[layer] for layer in layer_ids]
                if not target_activation.requires_grad or any(
                    not activation.requires_grad for activation in source_activations
                ):
                    raise WorkspaceProbeError(
                        "non_differentiable_model",
                        "resident model residual graph is not differentiable",
                    )

                per_prompt = {
                    layer: torch.zeros((n_embd, n_embd), dtype=torch.float32) for layer in layer_ids
                }
                batch_indices = torch.arange(dim_batch, device=device)
                cotangent = torch.zeros_like(target_activation)
                for pass_index, dim_start in enumerate(range(0, n_embd, dim_batch)):
                    dimensions_this_pass = min(dim_batch, n_embd - dim_start)
                    active_batch = batch_indices[:dimensions_this_pass]
                    cotangent.zero_()
                    cotangent[
                        active_batch[:, None],
                        valid_positions[None, :],
                        dim_start + active_batch[:, None],
                    ] = 1.0
                    gradients = torch.autograd.grad(
                        outputs=target_activation,
                        inputs=source_activations,
                        grad_outputs=cotangent,
                        retain_graph=pass_index < n_passes - 1,
                    )
                    for layer, gradient in zip(layer_ids, gradients, strict=True):
                        rows = (
                            gradient[
                                :dimensions_this_pass,
                                valid_positions.to(gradient.device),
                                :,
                            ]
                            .float()
                            .mean(dim=1)
                        )
                        per_prompt[layer][
                            dim_start : dim_start + dimensions_this_pass,
                            :,
                        ] = rows.detach().cpu()

            for layer in layer_ids:
                matrix = per_prompt[layer]
                if not torch.isfinite(matrix).all():
                    raise WorkspaceProbeError(
                        "invalid_jacobian",
                        f"layer {layer} produced a non-finite or malformed Jacobian",
                    )
                totals[layer] += matrix.to(dtype=torch.float64)
    finally:
        model.zero_grad(set_to_none=True)
        model.train(was_training)

    prompt_count = len(prompts)
    matrices = torch.stack(
        [(totals[layer] / prompt_count).to(dtype=torch.float32) for layer in layer_ids]
    )
    _require_finite_non_degenerate_matrices(matrices, layer_ids)
    calibration = _build_v1_calibration_metadata(
        sequence_sha256s=sequence_sha256s,
        sequence_token_counts=sequence_token_counts,
        dim_batch=dim_batch,
        max_seq_len=max_seq_len,
        skip_first=skip_first,
    )
    return {
        "schema": JACOBIAN_LENS_ARTIFACT_SCHEMA,
        "kind": "JacobianLensArtifact",
        "method": "jacobian_lens",
        "estimator": _v1_estimator_metadata(),
        "implementationVersion": WORKSPACE_PROBE_IMPLEMENTATION_VERSION,
        "model": {
            "architecture": architecture,
            "checkpointSha256": checkpoint_sha256,
            "nLayer": layer_count,
            "nEmbd": n_embd,
            "vocabSize": vocab_size,
        },
        "tokenizer": {"sha256": tokenizer_sha256},
        "calibration": calibration,
        "layers": layer_ids,
        "matrices": matrices,
    }


def _fit_endpoint_jacobian_lens_v1(
    model,
    calibration_batches: Iterable[torch.Tensor],
    *,
    layers: Sequence[int],
    checkpoint_sha256: str,
    tokenizer_sha256: str,
    calibration_corpus_sha256: str | None = None,
    architecture: str = "holorunner-s0-gpt",
    dim_batch: int = 8,
    max_seq_len: int = 512,
    position_bins: Sequence[tuple[int, int]] | None = None,
    max_cpu_matrix_bytes: int = DEFAULT_MAX_JACOBIAN_LENS_CPU_MATRIX_BYTES,
    control_profile_sha256: str | None = None,
    estimator_name: str,
) -> dict[str, Any]:
    """Fit a bounded same-endpoint Jacobian with an explicit affine anchor contract.

    Unlike :func:`fit_jacobian_lens_v1`, this estimator is not the paper's
    present-and-future causal-disposition lens. For every complete calibration
    prompt it differentiates the final post-block residual at the last token
    only with respect to the source residual at that same token. Learned
    absolute positions are kept explicit through caller-declared position bins.

    Each bin serves ``M @ h + b``. The public wrappers select a registered
    mean anchor, per-example local-Taylor intercept, or mean-centered scalar
    calibration while sharing the same bounded Jacobian computation. Oversize
    prompts fail closed; no partial stream chunk or silently truncated
    calibration sequence is admitted.
    """

    estimator_mode = _ENDPOINT_ESTIMATOR_MODES.get(estimator_name)
    if estimator_mode is None:
        _endpoint_estimator_metadata(estimator_name)
        raise AssertionError("unreachable endpoint estimator dispatch")
    if estimator_mode == "mean_centered_scalar":
        if control_profile_sha256 != JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256:
            raise WorkspaceProbeError(
                "invalid_lens_fit_binding",
                "scalar calibration requires a frozen control-profile digest",
            )
    elif control_profile_sha256 is not None:
        raise WorkspaceProbeError(
            "invalid_lens_fit_binding",
            "control-profile digests are only valid for scalar-calibrated artifacts",
        )

    if any(type(layer) is not int for layer in layers):
        raise WorkspaceProbeError("invalid_source_layers", "layers must contain integers")
    layer_ids = sorted(set(layers))
    if not layer_ids:
        raise WorkspaceProbeError(
            "invalid_source_layers",
            "at least one source layer is required",
        )

    layer_count = len(model.blocks)
    target_layer = layer_count - 1
    if target_layer < 1 or any(layer < 0 or layer >= target_layer for layer in layer_ids):
        raise WorkspaceProbeError(
            "invalid_source_layers",
            f"source layers must be a non-empty subset of [0, {target_layer - 1}]",
        )

    n_embd = int(model.head.in_features)
    if (
        type(dim_batch) is not int
        or dim_batch < 1
        or dim_batch > min(MAX_JACOBIAN_LENS_DIM_BATCH, n_embd)
    ):
        raise WorkspaceProbeError(
            "invalid_dim_batch",
            f"dim_batch must be in [1, {min(MAX_JACOBIAN_LENS_DIM_BATCH, n_embd)}]",
        )
    model_sequence_capacity = int(getattr(model.pos, "num_embeddings", 0))
    sequence_limit = min(MAX_JACOBIAN_LENS_SEQUENCE_LENGTH, model_sequence_capacity)
    if type(max_seq_len) is not int or max_seq_len < 1 or max_seq_len > sequence_limit:
        raise WorkspaceProbeError(
            "invalid_max_seq_len",
            f"max_seq_len must be in [1, {sequence_limit}] for the resident model",
        )
    normalized_bins = _normalize_endpoint_position_bins(position_bins, max_seq_len=max_seq_len)
    if type(max_cpu_matrix_bytes) is not int or max_cpu_matrix_bytes < 1:
        raise WorkspaceProbeError(
            "invalid_matrix_budget",
            "max_cpu_matrix_bytes must be a positive integer",
        )
    projected_matrix_bytes = len(normalized_bins) * len(layer_ids) * n_embd * n_embd * 24
    if estimator_mode in {"local_taylor", "mean_centered_scalar"}:
        projected_matrix_bytes += len(normalized_bins) * len(layer_ids) * n_embd * 8
    if projected_matrix_bytes > max_cpu_matrix_bytes:
        raise WorkspaceProbeError(
            "matrix_budget_exceeded",
            f"projected CPU lens workspace {projected_matrix_bytes} bytes exceeds "
            f"the {max_cpu_matrix_bytes}-byte budget",
        )
    for label, value in (
        ("checkpoint", checkpoint_sha256),
        ("tokenizer", tokenizer_sha256),
    ):
        if not _is_sha256(value):
            raise WorkspaceProbeError(
                "invalid_provenance_hash",
                f"{label} hash must be a sha256 digest",
            )
    if calibration_corpus_sha256 is not None and not _is_sha256(calibration_corpus_sha256):
        raise WorkspaceProbeError(
            "invalid_provenance_hash",
            "calibration corpus hash must be a sha256 digest when supplied",
        )
    if not isinstance(architecture, str) or not architecture.strip():
        raise WorkspaceProbeError("invalid_architecture", "architecture must be non-empty")

    prompts: list[tuple[torch.Tensor, int]] = []
    sequence_sha256s: list[str] = []
    sequence_token_counts: list[int] = []
    vocab_size = int(model.head.out_features)
    bin_counts = [0] * len(normalized_bins)
    for batch in calibration_batches:
        if (
            not isinstance(batch, torch.Tensor)
            or batch.ndim != 2
            or batch.size(0) < 1
            or batch.size(1) < 1
            or batch.dtype == torch.bool
            or batch.dtype.is_floating_point
            or batch.dtype.is_complex
        ):
            raise WorkspaceProbeError(
                "invalid_calibration_batch",
                "calibration batches must be integer tensors shaped [batch, sequence]",
            )
        if int(batch.size(1)) > max_seq_len:
            raise WorkspaceProbeError(
                "calibration_prompt_too_long",
                f"calibration prompt has {int(batch.size(1))} tokens; maximum is {max_seq_len}",
            )
        normalized_batch = batch.detach().to(device="cpu", dtype=torch.long)
        for row in normalized_batch:
            normalized = row.clone(memory_format=torch.contiguous_format)
            sequence_length = int(normalized.numel())
            if bool(((normalized < 0) | (normalized >= vocab_size)).any()):
                raise WorkspaceProbeError(
                    "invalid_calibration_token",
                    f"calibration token ids must be in [0, {vocab_size - 1}]",
                )
            bin_index = _endpoint_position_bin(sequence_length - 1, normalized_bins)
            if bin_index is None:
                raise WorkspaceProbeError(
                    "calibration_position_uncovered",
                    f"endpoint {sequence_length - 1} is not covered by the position bins",
                )
            tokens = [int(token) for token in normalized.tolist()]
            prompts.append((normalized.unsqueeze(0), bin_index))
            sequence_sha256s.append(sha256_json(tokens))
            sequence_token_counts.append(sequence_length)
            bin_counts[bin_index] += 1

    if not prompts:
        raise WorkspaceProbeError("empty_calibration", "no calibration prompts were supplied")
    empty_bins = [normalized_bins[index] for index, count in enumerate(bin_counts) if count == 0]
    if empty_bins:
        raise WorkspaceProbeError(
            "empty_position_bin",
            f"every endpoint position bin requires calibration prompts; empty bins: {empty_bins}",
        )
    derived_corpus_sha256 = sha256_json(sequence_sha256s)
    if calibration_corpus_sha256 is not None and calibration_corpus_sha256 != derived_corpus_sha256:
        raise WorkspaceProbeError(
            "calibration_corpus_hash_mismatch",
            "supplied corpus hash does not match the complete token sequences",
        )
    if estimator_mode == "mean_centered_scalar":
        projected_matrix_bytes += len(prompts) * (len(layer_ids) + 1) * n_embd * 8
        if projected_matrix_bytes > max_cpu_matrix_bytes:
            raise WorkspaceProbeError(
                "matrix_budget_exceeded",
                f"projected CPU lens workspace {projected_matrix_bytes} bytes exceeds "
                f"the {max_cpu_matrix_bytes}-byte budget",
            )

    matrix_totals = [
        {layer: torch.zeros((n_embd, n_embd), dtype=torch.float64) for layer in layer_ids}
        for _ in normalized_bins
    ]
    source_totals = [
        {layer: torch.zeros(n_embd, dtype=torch.float64) for layer in layer_ids}
        for _ in normalized_bins
    ]
    needs_jacobian_source_products = estimator_mode in {
        "local_taylor",
        "mean_centered_scalar",
    }
    jacobian_source_product_totals = (
        [
            {layer: torch.zeros(n_embd, dtype=torch.float64) for layer in layer_ids}
            for _ in normalized_bins
        ]
        if needs_jacobian_source_products
        else None
    )
    target_totals = [torch.zeros(n_embd, dtype=torch.float64) for _ in normalized_bins]
    source_samples = (
        [
            {layer: [] for layer in layer_ids}
            for _ in normalized_bins
        ]
        if estimator_mode == "mean_centered_scalar"
        else None
    )
    target_samples = (
        [[] for _ in normalized_bins]
        if estimator_mode == "mean_centered_scalar"
        else None
    )
    n_passes = math.ceil(n_embd / dim_batch)
    device = next(model.parameters()).device
    was_training = model.training
    model.eval()
    model.zero_grad(set_to_none=True)

    try:
        for prompt, bin_index in prompts:
            token_ids = prompt.to(device=device, dtype=torch.long)
            replicated_ids = token_ids.expand(dim_batch, -1)
            with torch.enable_grad():
                _, residuals = model.forward_with_residuals(replicated_ids)
                if len(residuals) != layer_count:
                    raise WorkspaceProbeError(
                        "invalid_model_residuals",
                        "resident model did not retain every transformer-layer residual",
                    )
                target_activation = residuals[target_layer]
                source_activations = [residuals[layer] for layer in layer_ids]
                if not target_activation.requires_grad or any(
                    not activation.requires_grad for activation in source_activations
                ):
                    raise WorkspaceProbeError(
                        "non_differentiable_model",
                        "resident model residual graph is not differentiable",
                    )

                per_prompt = {
                    layer: torch.zeros((n_embd, n_embd), dtype=torch.float32)
                    for layer in layer_ids
                }
                target_endpoint = target_activation[0, -1].detach().to(
                    device="cpu", dtype=torch.float64
                )
                source_endpoints = {
                    layer: activation[0, -1].detach().to(device="cpu", dtype=torch.float64)
                    for layer, activation in zip(layer_ids, source_activations, strict=True)
                }
                batch_indices = torch.arange(dim_batch, device=device)
                cotangent = torch.zeros_like(target_activation)
                for pass_index, dim_start in enumerate(range(0, n_embd, dim_batch)):
                    dimensions_this_pass = min(dim_batch, n_embd - dim_start)
                    active_batch = batch_indices[:dimensions_this_pass]
                    cotangent.zero_()
                    cotangent[
                        active_batch,
                        -1,
                        dim_start + active_batch,
                    ] = 1.0
                    gradients = torch.autograd.grad(
                        outputs=target_activation,
                        inputs=source_activations,
                        grad_outputs=cotangent,
                        retain_graph=pass_index < n_passes - 1,
                    )
                    for layer, gradient in zip(layer_ids, gradients, strict=True):
                        per_prompt[layer][
                            dim_start : dim_start + dimensions_this_pass,
                            :,
                        ] = gradient[:dimensions_this_pass, -1, :].detach().float().cpu()

            target_totals[bin_index] += target_endpoint
            if target_samples is not None:
                target_samples[bin_index].append(target_endpoint)
            for layer in layer_ids:
                matrix = per_prompt[layer]
                if not torch.isfinite(matrix).all():
                    raise WorkspaceProbeError(
                        "invalid_jacobian",
                        f"layer {layer} produced a non-finite or malformed endpoint Jacobian",
                    )
                matrix_totals[bin_index][layer] += matrix.to(dtype=torch.float64)
                source_totals[bin_index][layer] += source_endpoints[layer]
                if source_samples is not None:
                    source_samples[bin_index][layer].append(source_endpoints[layer])
                if jacobian_source_product_totals is not None:
                    jacobian_source_product_totals[bin_index][layer] += (
                        matrix.to(dtype=torch.float64) @ source_endpoints[layer]
                    )
    finally:
        model.zero_grad(set_to_none=True)
        model.train(was_training)

    binned_matrices = []
    binned_biases = []
    binned_source_means = []
    binned_target_means = []
    binned_jacobian_source_product_means = []
    binned_centered_jacobian_energy_means = []
    binned_centered_jacobian_target_cross_means = []
    binned_centered_identity_energy_means = []
    binned_centered_identity_target_cross_means = []
    ridge_fraction = JACOBIAN_LENS_V4_RIDGE_FRACTION
    clip_lower, clip_upper = JACOBIAN_LENS_V4_CLIP_BOUNDS
    for bin_index, count in enumerate(bin_counts):
        target_mean64 = target_totals[bin_index] / count
        target_mean = target_mean64.to(dtype=torch.float32)
        matrices_for_bin = []
        biases_for_bin = []
        source_means_for_bin = []
        target_means_for_bin = []
        jacobian_source_product_means_for_bin = []
        centered_jacobian_energy_means_for_bin = []
        centered_jacobian_target_cross_means_for_bin = []
        centered_identity_energy_means_for_bin = []
        centered_identity_target_cross_means_for_bin = []
        for layer in layer_ids:
            matrix64 = matrix_totals[bin_index][layer] / count
            source_mean64 = source_totals[bin_index][layer] / count
            matrix = matrix64.to(dtype=torch.float32)
            source_mean = source_mean64.to(dtype=torch.float32)
            if estimator_mode == "mean_anchor":
                bias = (target_mean64 - matrix64 @ source_mean64).to(dtype=torch.float32)
            elif estimator_mode == "local_taylor":
                jacobian_source_product_mean64 = (
                    jacobian_source_product_totals[bin_index][layer] / count
                )
                bias = (target_mean64 - jacobian_source_product_mean64).to(
                    dtype=torch.float32
                )
                jacobian_source_product_means_for_bin.append(
                    jacobian_source_product_mean64.to(dtype=torch.float32)
                )
            else:
                if source_samples is None or target_samples is None:
                    raise AssertionError("scalar calibration samples were not retained")
                sources = torch.stack(source_samples[bin_index][layer])
                targets = torch.stack(target_samples[bin_index])
                if int(sources.shape[0]) != count or int(targets.shape[0]) != count:
                    raise WorkspaceProbeError(
                        "invalid_scalar_calibration",
                        "scalar calibration sample counts do not match the position bin",
                    )
                centered_sources = sources - source_mean64
                centered_targets = targets - target_mean64
                hidden_width = float(n_embd)
                def centered_statistics() -> tuple[
                    torch.Tensor,
                    torch.Tensor,
                    torch.Tensor,
                    torch.Tensor,
                ]:
                    projected = centered_sources @ matrix64.T
                    return (
                        torch.sum(projected * projected) / (count * hidden_width),
                        torch.sum(projected * centered_targets) / (count * hidden_width),
                        torch.sum(centered_sources * centered_sources)
                        / (count * hidden_width),
                        torch.sum(centered_sources * centered_targets)
                        / (count * hidden_width),
                    )

                statistics = centered_statistics()
                recomputed_statistics = centered_statistics()
                if not all(
                    torch.equal(value, recomputed)
                    for value, recomputed in zip(
                        statistics, recomputed_statistics, strict=True
                    )
                ):
                    raise WorkspaceProbeError(
                        "invalid_scalar_calibration",
                        "scalar sufficient-statistic recomputation did not match",
                    )
                energy, cross, identity_energy, identity_cross = statistics
                if not all(torch.isfinite(value) for value in statistics):
                    raise WorkspaceProbeError(
                        "invalid_scalar_calibration",
                        "scalar calibration sufficient statistics must be finite",
                    )
                if float(energy.item()) <= 0 or float(identity_energy.item()) <= 0:
                    raise WorkspaceProbeError(
                        "degenerate_scalar_calibration",
                        "scalar calibration energies must be positive",
                    )
                alpha_raw = cross / ((1.0 + ridge_fraction) * energy)
                beta_raw = identity_cross / (
                    (1.0 + ridge_fraction) * identity_energy
                )
                if not torch.isfinite(alpha_raw) or not torch.isfinite(beta_raw):
                    raise WorkspaceProbeError(
                        "invalid_scalar_calibration",
                        "unclipped scalar calibration coefficients must be finite",
                    )
                alpha = torch.clamp(alpha_raw, min=clip_lower, max=clip_upper)
                scaled_matrix64 = alpha * matrix64
                bias = (target_mean64 - scaled_matrix64 @ source_mean64).to(
                    dtype=torch.float32
                )
                jacobian_source_product_mean64 = (
                    jacobian_source_product_totals[bin_index][layer] / count
                )
                jacobian_source_product_means_for_bin.append(
                    jacobian_source_product_mean64.to(dtype=torch.float32)
                )
                centered_jacobian_energy_means_for_bin.append(energy)
                centered_jacobian_target_cross_means_for_bin.append(cross)
                centered_identity_energy_means_for_bin.append(identity_energy)
                centered_identity_target_cross_means_for_bin.append(identity_cross)
            matrices_for_bin.append(matrix)
            biases_for_bin.append(bias)
            source_means_for_bin.append(source_mean)
            target_means_for_bin.append(target_mean)
        binned_matrices.append(torch.stack(matrices_for_bin))
        binned_biases.append(torch.stack(biases_for_bin))
        binned_source_means.append(torch.stack(source_means_for_bin))
        binned_target_means.append(torch.stack(target_means_for_bin))
        if jacobian_source_product_totals is not None:
            binned_jacobian_source_product_means.append(
                torch.stack(jacobian_source_product_means_for_bin)
            )
        if estimator_mode == "mean_centered_scalar":
            binned_centered_jacobian_energy_means.append(
                torch.stack(centered_jacobian_energy_means_for_bin)
            )
            binned_centered_jacobian_target_cross_means.append(
                torch.stack(centered_jacobian_target_cross_means_for_bin)
            )
            binned_centered_identity_energy_means.append(
                torch.stack(centered_identity_energy_means_for_bin)
            )
            binned_centered_identity_target_cross_means.append(
                torch.stack(centered_identity_target_cross_means_for_bin)
            )

    matrices = torch.stack(binned_matrices)
    biases = torch.stack(binned_biases)
    source_means = torch.stack(binned_source_means)
    target_means = torch.stack(binned_target_means)
    jacobian_source_product_means = (
        torch.stack(binned_jacobian_source_product_means)
        if needs_jacobian_source_products
        else None
    )
    _require_finite_non_degenerate_binned_transport(matrices, biases, layer_ids)
    calibration = _build_v2_calibration_metadata(
        sequence_sha256s=sequence_sha256s,
        sequence_token_counts=sequence_token_counts,
        dim_batch=dim_batch,
        max_seq_len=max_seq_len,
        position_bins=normalized_bins,
        position_bin_counts=bin_counts,
    )
    artifact = {
        "schema": JACOBIAN_LENS_ARTIFACT_SCHEMA,
        "kind": "JacobianLensArtifact",
        "method": "jacobian_lens",
        "estimator": _endpoint_estimator_metadata(estimator_name),
        "implementationVersion": WORKSPACE_PROBE_IMPLEMENTATION_VERSION,
        "model": {
            "architecture": architecture,
            "checkpointSha256": checkpoint_sha256,
            "nLayer": layer_count,
            "nEmbd": n_embd,
            "vocabSize": vocab_size,
        },
        "tokenizer": {"sha256": tokenizer_sha256},
        "calibration": calibration,
        "layers": layer_ids,
        "matrices": matrices,
        "biases": biases,
        "sourceMeans": source_means,
        "targetMeans": target_means,
    }
    if jacobian_source_product_means is not None:
        artifact["jacobianSourceProductMeans"] = jacobian_source_product_means
    if estimator_mode == "mean_centered_scalar":
        artifact["centeredJacobianEnergyMeans"] = torch.stack(
            binned_centered_jacobian_energy_means
        )
        artifact["centeredJacobianTargetCrossMeans"] = torch.stack(
            binned_centered_jacobian_target_cross_means
        )
        artifact["centeredIdentityEnergyMeans"] = torch.stack(
            binned_centered_identity_energy_means
        )
        artifact["centeredIdentityTargetCrossMeans"] = torch.stack(
            binned_centered_identity_target_cross_means
        )
        artifact["fitBinding"] = jacobian_lens_v4_fit_binding_payload(
            artifact,
            control_profile_sha256=control_profile_sha256,
        )
    return artifact


def fit_endpoint_affine_jacobian_lens_v1(
    model,
    calibration_batches: Iterable[torch.Tensor],
    *,
    layers: Sequence[int],
    checkpoint_sha256: str,
    tokenizer_sha256: str,
    calibration_corpus_sha256: str | None = None,
    architecture: str = "holorunner-s0-gpt",
    dim_batch: int = 8,
    max_seq_len: int = 512,
    position_bins: Sequence[tuple[int, int]] | None = None,
    max_cpu_matrix_bytes: int = DEFAULT_MAX_JACOBIAN_LENS_CPU_MATRIX_BYTES,
) -> dict[str, Any]:
    """Fit the existing bin-wise mean-anchored endpoint transport unchanged."""

    return _fit_endpoint_jacobian_lens_v1(
        model,
        calibration_batches,
        layers=layers,
        checkpoint_sha256=checkpoint_sha256,
        tokenizer_sha256=tokenizer_sha256,
        calibration_corpus_sha256=calibration_corpus_sha256,
        architecture=architecture,
        dim_batch=dim_batch,
        max_seq_len=max_seq_len,
        position_bins=position_bins,
        max_cpu_matrix_bytes=max_cpu_matrix_bytes,
        estimator_name=JACOBIAN_LENS_ESTIMATOR_V2,
    )


def fit_endpoint_local_taylor_jacobian_lens_v1(
    model,
    calibration_batches: Iterable[torch.Tensor],
    *,
    layers: Sequence[int],
    checkpoint_sha256: str,
    tokenizer_sha256: str,
    calibration_corpus_sha256: str | None = None,
    architecture: str = "holorunner-s0-gpt",
    dim_batch: int = 8,
    max_seq_len: int = 512,
    position_bins: Sequence[tuple[int, int]] | None = None,
    max_cpu_matrix_bytes: int = DEFAULT_MAX_JACOBIAN_LENS_CPU_MATRIX_BYTES,
) -> dict[str, Any]:
    """Fit ``J=mean(J_i)``, ``b=mean(y_i - J_i @ x_i)`` per endpoint bin."""

    return _fit_endpoint_jacobian_lens_v1(
        model,
        calibration_batches,
        layers=layers,
        checkpoint_sha256=checkpoint_sha256,
        tokenizer_sha256=tokenizer_sha256,
        calibration_corpus_sha256=calibration_corpus_sha256,
        architecture=architecture,
        dim_batch=dim_batch,
        max_seq_len=max_seq_len,
        position_bins=position_bins,
        max_cpu_matrix_bytes=max_cpu_matrix_bytes,
        estimator_name=JACOBIAN_LENS_ESTIMATOR_V3,
    )


def fit_endpoint_scalar_calibrated_jacobian_lens_v1(
    model,
    calibration_batches: Iterable[torch.Tensor],
    *,
    layers: Sequence[int],
    checkpoint_sha256: str,
    tokenizer_sha256: str,
    control_profile_sha256: str,
    calibration_corpus_sha256: str | None = None,
    architecture: str = "holorunner-s0-gpt",
    dim_batch: int = 8,
    max_seq_len: int = 512,
    position_bins: Sequence[tuple[int, int]] | None = None,
    max_cpu_matrix_bytes: int = DEFAULT_MAX_JACOBIAN_LENS_CPU_MATRIX_BYTES,
) -> dict[str, Any]:
    """Fit the frozen mean-centered scalar-calibrated endpoint transport."""

    return _fit_endpoint_jacobian_lens_v1(
        model,
        calibration_batches,
        layers=layers,
        checkpoint_sha256=checkpoint_sha256,
        tokenizer_sha256=tokenizer_sha256,
        calibration_corpus_sha256=calibration_corpus_sha256,
        architecture=architecture,
        dim_batch=dim_batch,
        max_seq_len=max_seq_len,
        position_bins=position_bins,
        max_cpu_matrix_bytes=max_cpu_matrix_bytes,
        control_profile_sha256=control_profile_sha256,
        estimator_name=JACOBIAN_LENS_ESTIMATOR_V4,
    )


def merge_jacobian_lens_v1_artifacts(
    artifacts: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    """Merge disjoint v1 prompt shards using exact prompt-count weighting."""

    if not artifacts:
        raise WorkspaceProbeError(
            "v1_artifacts_required",
            "at least one v1 Jacobian lens artifact is required",
        )
    validated = [_validate_v1_merge_artifact(artifact) for artifact in artifacts]
    first_artifact, first_layers, first_matrices = validated[0]
    first_calibration = first_artifact["calibration"]
    shared_calibration_fields = (
        "positionPolicy",
        "dimBatch",
        "maxSeqLen",
        "skipFirst",
        "promptTruncationPolicy",
        "corpusCanonicalization",
    )
    shard_ids: set[str] = set()
    seen_sequence_sha256s: set[str] = set()
    sequence_sha256s: list[str] = []
    sequence_token_counts: list[int] = []
    total_jacobians = 0
    weighted = torch.zeros_like(first_matrices, dtype=torch.float64)

    for artifact, layers, matrices in validated:
        calibration = artifact["calibration"]
        if (
            artifact["model"] != first_artifact["model"]
            or artifact["tokenizer"] != first_artifact["tokenizer"]
            or artifact["estimator"] != first_artifact["estimator"]
            or artifact["implementationVersion"] != first_artifact["implementationVersion"]
            or layers != first_layers
            or any(
                calibration[field] != first_calibration[field]
                for field in shared_calibration_fields
            )
        ):
            raise WorkspaceProbeError(
                "incompatible_v1_artifacts",
                "v1 shards must share model, tokenizer, layers, estimator, and fit configuration",
            )
        shard_sha256 = calibration["shardSha256"]
        if shard_sha256 in shard_ids:
            raise WorkspaceProbeError(
                "duplicate_v1_shard",
                "the same calibration shard cannot be merged twice",
            )
        shard_ids.add(shard_sha256)
        shard_sequence_sha256s = set(calibration["sequenceSha256s"])
        if overlap := seen_sequence_sha256s.intersection(shard_sequence_sha256s):
            raise WorkspaceProbeError(
                "overlapping_v1_sequences",
                "v1 shards must be content-disjoint; "
                f"found {len(overlap)} repeated normalized sequence hash(es)",
            )
        seen_sequence_sha256s.update(shard_sequence_sha256s)
        count = int(calibration["jacobianCount"])
        weighted += matrices.to(dtype=torch.float64) * count
        total_jacobians += count
        sequence_sha256s.extend(calibration["sequenceSha256s"])
        sequence_token_counts.extend(calibration["sequenceTokenCounts"])

    matrices = (weighted / total_jacobians).to(dtype=torch.float32)
    _require_finite_non_degenerate_matrices(matrices, first_layers)
    calibration = _build_v1_calibration_metadata(
        sequence_sha256s=sequence_sha256s,
        sequence_token_counts=sequence_token_counts,
        dim_batch=int(first_calibration["dimBatch"]),
        max_seq_len=int(first_calibration["maxSeqLen"]),
        skip_first=int(first_calibration["skipFirst"]),
    )
    return {
        "schema": first_artifact["schema"],
        "kind": first_artifact["kind"],
        "method": first_artifact["method"],
        "estimator": dict(first_artifact["estimator"]),
        "implementationVersion": first_artifact["implementationVersion"],
        "model": dict(first_artifact["model"]),
        "tokenizer": dict(first_artifact["tokenizer"]),
        "calibration": calibration,
        "layers": list(first_layers),
        "matrices": matrices,
    }


def _v1_estimator_metadata() -> dict[str, Any]:
    return {
        "name": JACOBIAN_LENS_ESTIMATOR_V1,
        "paperParity": True,
        "parityScope": "reference-estimator-only",
        "paperExperimentParity": False,
        "vectorization": "batched-output-cotangents-retained-graph",
        "reference": {
            "repository": JACOBIAN_LENS_V1_REFERENCE_REPOSITORY,
            "commit": JACOBIAN_LENS_V1_REFERENCE_COMMIT,
            "license": JACOBIAN_LENS_V1_REFERENCE_LICENSE,
        },
    }


def _v2_estimator_metadata() -> dict[str, Any]:
    return {
        "name": JACOBIAN_LENS_ESTIMATOR_V2,
        "paperParity": False,
        "vectorization": "batched-endpoint-output-cotangents-retained-graph",
        "transportProfile": JACOBIAN_LENS_V2_TRANSPORT_PROFILE,
        "anchor": "binwise-target-mean-minus-jacobian-source-mean",
    }


def _v3_estimator_metadata() -> dict[str, Any]:
    return {
        "name": JACOBIAN_LENS_ESTIMATOR_V3,
        "paperParity": False,
        "vectorization": "batched-endpoint-output-cotangents-retained-graph",
        "transportProfile": JACOBIAN_LENS_V3_TRANSPORT_PROFILE,
        "anchor": "binwise-mean-target-minus-mean-per-sample-jacobian-source-product",
    }


def _v4_estimator_metadata() -> dict[str, Any]:
    return {
        "name": JACOBIAN_LENS_ESTIMATOR_V4,
        "paperParity": False,
        "vectorization": "batched-endpoint-output-cotangents-retained-graph",
        "transportProfile": JACOBIAN_LENS_V4_TRANSPORT_PROFILE,
        "anchor": "binwise-target-mean-minus-scaled-mean-jacobian-source-mean",
        "scalarCalibration": JACOBIAN_LENS_V4_SCALAR_CALIBRATION_PROFILE,
        "ridgeFraction": JACOBIAN_LENS_V4_RIDGE_FRACTION,
        "clipBounds": list(JACOBIAN_LENS_V4_CLIP_BOUNDS),
        "scalarIdentityControl": JACOBIAN_LENS_V4_SCALAR_IDENTITY_CONTROL_PROFILE,
    }


def _is_v4_estimator_metadata(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and set(value) == set(_v4_estimator_metadata())
        and type(value.get("paperParity")) is bool
        and type(value.get("ridgeFraction")) is float
        and isinstance(value.get("clipBounds"), list)
        and len(value["clipBounds"]) == 2
        and all(type(bound) is float for bound in value["clipBounds"])
        and value == _v4_estimator_metadata()
    )


_ENDPOINT_ESTIMATOR_METADATA_FACTORIES = {
    JACOBIAN_LENS_ESTIMATOR_V2: _v2_estimator_metadata,
    JACOBIAN_LENS_ESTIMATOR_V3: _v3_estimator_metadata,
    JACOBIAN_LENS_ESTIMATOR_V4: _v4_estimator_metadata,
}
_ENDPOINT_ESTIMATOR_MODES = {
    JACOBIAN_LENS_ESTIMATOR_V2: "mean_anchor",
    JACOBIAN_LENS_ESTIMATOR_V3: "local_taylor",
    JACOBIAN_LENS_ESTIMATOR_V4: "mean_centered_scalar",
}


def _is_endpoint_estimator_name(value: Any) -> bool:
    return value in _ENDPOINT_ESTIMATOR_METADATA_FACTORIES


def _endpoint_estimator_metadata(name: str) -> dict[str, Any]:
    factory = _ENDPOINT_ESTIMATOR_METADATA_FACTORIES.get(name)
    if factory is None:
        raise WorkspaceProbeError(
            "invalid_lens_estimator",
            "endpoint fitter requires a registered affine estimator contract",
        )
    return factory()


def _normalize_endpoint_position_bins(
    position_bins: Sequence[tuple[int, int]] | None,
    *,
    max_seq_len: int,
) -> list[list[int]]:
    raw_bins: Sequence[tuple[int, int]] = position_bins or ((0, max_seq_len - 1),)
    normalized: list[list[int]] = []
    for value in raw_bins:
        if (
            not isinstance(value, (list, tuple))
            or len(value) != 2
            or any(type(bound) is not int for bound in value)
        ):
            raise WorkspaceProbeError(
                "invalid_position_bins",
                "position bins must contain inclusive integer [start, end] pairs",
            )
        start, end = map(int, value)
        if start < 0 or end < start or end >= max_seq_len:
            raise WorkspaceProbeError(
                "invalid_position_bins",
                f"position bin [{start}, {end}] is outside [0, {max_seq_len - 1}]",
            )
        normalized.append([start, end])
    if (
        not normalized
        or normalized[0][0] != 0
        or normalized[-1][1] != max_seq_len - 1
        or any(left[1] + 1 != right[0] for left, right in zip(normalized, normalized[1:]))
    ):
        raise WorkspaceProbeError(
            "invalid_position_bins",
            "position bins must be ordered, contiguous, and cover [0, max_seq_len - 1]",
        )
    return normalized


def _endpoint_position_bin(position: int, position_bins: Sequence[Sequence[int]]) -> int | None:
    for index, (start, end) in enumerate(position_bins):
        if start <= position <= end:
            return index
    return None


def _build_v2_calibration_metadata(
    *,
    sequence_sha256s: Sequence[str],
    sequence_token_counts: Sequence[int],
    dim_batch: int,
    max_seq_len: int,
    position_bins: Sequence[Sequence[int]],
    position_bin_counts: Sequence[int],
) -> dict[str, Any]:
    sequence_hashes = list(sequence_sha256s)
    token_counts = [int(count) for count in sequence_token_counts]
    bins = [[int(start), int(end)] for start, end in position_bins]
    bin_counts = [int(count) for count in position_bin_counts]
    return {
        "corpusSha256": sha256_json(sequence_hashes),
        "jacobianCount": len(sequence_hashes),
        "sequenceCount": len(sequence_hashes),
        "tokenCount": sum(token_counts),
        "positionPolicy": ENDPOINT_SELF_POSITION_POLICY,
        "positionBins": bins,
        "positionBinCounts": bin_counts,
        "dimBatch": dim_batch,
        "maxSeqLen": max_seq_len,
        "promptTruncationPolicy": JACOBIAN_LENS_V2_PROMPT_TRUNCATION_POLICY,
        "corpusCanonicalization": JACOBIAN_LENS_V2_CORPUS_CANONICALIZATION,
        "sequenceSha256s": sequence_hashes,
        "sequenceTokenCounts": token_counts,
        "shardSha256": sha256_json(
            {
                "sequenceSha256s": sequence_hashes,
                "sequenceTokenCounts": token_counts,
            }
        ),
    }


def _build_v1_calibration_metadata(
    *,
    sequence_sha256s: Sequence[str],
    sequence_token_counts: Sequence[int],
    dim_batch: int,
    max_seq_len: int,
    skip_first: int,
) -> dict[str, Any]:
    sequence_hashes = list(sequence_sha256s)
    token_counts = [int(count) for count in sequence_token_counts]
    return {
        "corpusSha256": sha256_json(sequence_hashes),
        "jacobianCount": len(sequence_hashes),
        "sequenceCount": len(sequence_hashes),
        "tokenCount": sum(token_counts),
        "positionPolicy": ALL_VALID_CURRENT_AND_FUTURE_POSITION_POLICY,
        "dimBatch": dim_batch,
        "maxSeqLen": max_seq_len,
        "skipFirst": skip_first,
        "validPositionCount": sum(count - skip_first - 1 for count in token_counts),
        "promptTruncationPolicy": JACOBIAN_LENS_V1_PROMPT_TRUNCATION_POLICY,
        "corpusCanonicalization": JACOBIAN_LENS_V1_CORPUS_CANONICALIZATION,
        "sequenceSha256s": sequence_hashes,
        "sequenceTokenCounts": token_counts,
        "shardSha256": sha256_json(
            {
                "sequenceSha256s": sequence_hashes,
                "sequenceTokenCounts": token_counts,
            }
        ),
    }


def _require_finite_non_degenerate_matrices(
    matrices: torch.Tensor,
    layer_ids: Sequence[int],
) -> None:
    if not torch.isfinite(matrices).all():
        raise WorkspaceProbeError(
            "invalid_jacobian",
            "averaged Jacobian overflowed the float32 serving representation",
        )
    degenerate_layers = [
        layer
        for index, layer in enumerate(layer_ids)
        if float(torch.linalg.vector_norm(matrices[index]).item()) <= 1e-12
    ]
    if degenerate_layers:
        raise WorkspaceProbeError(
            "degenerate_jacobian",
            f"calibration produced zero-information lens layers: {degenerate_layers}",
        )


def _require_finite_non_degenerate_binned_transport(
    matrices: torch.Tensor,
    biases: torch.Tensor,
    layer_ids: Sequence[int],
) -> None:
    if not torch.isfinite(matrices).all() or not torch.isfinite(biases).all():
        raise WorkspaceProbeError(
            "invalid_jacobian",
            "endpoint affine transport overflowed the float32 serving representation",
        )
    degenerate = [
        (bin_index, layer)
        for bin_index in range(int(matrices.shape[0]))
        for layer_index, layer in enumerate(layer_ids)
        if float(torch.linalg.vector_norm(matrices[bin_index, layer_index]).item()) <= 1e-12
    ]
    if degenerate:
        raise WorkspaceProbeError(
            "degenerate_jacobian",
            f"calibration produced zero-information endpoint matrices: {degenerate}",
        )


def _validate_v2_calibration_metadata(calibration: Any, *, n_embd: int) -> None:
    if not isinstance(calibration, dict):
        raise WorkspaceProbeError(
            "invalid_lens_metadata",
            "endpoint affine lens calibration metadata is required",
        )
    sequence_sha256s = calibration.get("sequenceSha256s")
    sequence_token_counts = calibration.get("sequenceTokenCounts")
    position_bins = calibration.get("positionBins")
    position_bin_counts = calibration.get("positionBinCounts")
    dim_batch = calibration.get("dimBatch")
    max_seq_len = calibration.get("maxSeqLen")
    sequence_count = calibration.get("sequenceCount")
    try:
        normalized_bins = _normalize_endpoint_position_bins(
            position_bins,
            max_seq_len=max_seq_len if type(max_seq_len) is int else 0,
        )
    except WorkspaceProbeError as error:
        raise WorkspaceProbeError(
            "invalid_lens_metadata",
            "endpoint affine position-bin metadata is invalid",
        ) from error
    derived_bin_counts = [0] * len(normalized_bins)
    if isinstance(sequence_token_counts, list):
        for count in sequence_token_counts:
            if type(count) is int and count >= 1:
                bin_index = _endpoint_position_bin(count - 1, normalized_bins)
                if bin_index is not None:
                    derived_bin_counts[bin_index] += 1
    if (
        not _is_sha256(calibration.get("corpusSha256"))
        or calibration.get("positionPolicy") != ENDPOINT_SELF_POSITION_POLICY
        or calibration.get("promptTruncationPolicy")
        != JACOBIAN_LENS_V2_PROMPT_TRUNCATION_POLICY
        or calibration.get("corpusCanonicalization")
        != JACOBIAN_LENS_V2_CORPUS_CANONICALIZATION
        or type(dim_batch) is not int
        or dim_batch < 1
        or dim_batch > min(MAX_JACOBIAN_LENS_DIM_BATCH, n_embd)
        or type(max_seq_len) is not int
        or max_seq_len < 1
        or max_seq_len > MAX_JACOBIAN_LENS_SEQUENCE_LENGTH
        or normalized_bins != position_bins
        or not isinstance(position_bin_counts, list)
        or position_bin_counts != derived_bin_counts
        or any(type(count) is not int or count < 1 for count in position_bin_counts)
        or type(sequence_count) is not int
        or sequence_count < 1
        or type(calibration.get("jacobianCount")) is not int
        or calibration["jacobianCount"] != sequence_count
        or not isinstance(sequence_sha256s, list)
        or len(sequence_sha256s) != sequence_count
        or any(not _is_sha256(value) for value in sequence_sha256s)
        or not isinstance(sequence_token_counts, list)
        or len(sequence_token_counts) != sequence_count
        or any(type(count) is not int or count < 1 or count > max_seq_len for count in sequence_token_counts)
        or type(calibration.get("tokenCount")) is not int
        or calibration["tokenCount"] != sum(sequence_token_counts)
        or calibration["corpusSha256"] != sha256_json(sequence_sha256s)
        or not _is_sha256(calibration.get("shardSha256"))
        or calibration["shardSha256"]
        != sha256_json(
            {
                "sequenceSha256s": sequence_sha256s,
                "sequenceTokenCounts": sequence_token_counts,
            }
        )
    ):
        raise WorkspaceProbeError(
            "invalid_lens_metadata",
            "endpoint affine lens calibration provenance is incomplete or inconsistent",
        )


def _validate_v1_calibration_metadata(
    calibration: Any,
    *,
    n_embd: int,
) -> None:
    if not isinstance(calibration, dict):
        raise WorkspaceProbeError(
            "invalid_lens_metadata",
            "v1 lens calibration metadata is required",
        )
    sequence_sha256s = calibration.get("sequenceSha256s")
    sequence_token_counts = calibration.get("sequenceTokenCounts")
    dim_batch = calibration.get("dimBatch")
    max_seq_len = calibration.get("maxSeqLen")
    skip_first = calibration.get("skipFirst")
    sequence_count = calibration.get("sequenceCount")
    if (
        not _is_sha256(calibration.get("corpusSha256"))
        or calibration.get("positionPolicy") != ALL_VALID_CURRENT_AND_FUTURE_POSITION_POLICY
        or calibration.get("promptTruncationPolicy") != JACOBIAN_LENS_V1_PROMPT_TRUNCATION_POLICY
        or calibration.get("corpusCanonicalization") != JACOBIAN_LENS_V1_CORPUS_CANONICALIZATION
        or type(dim_batch) is not int
        or dim_batch < 1
        or dim_batch > min(MAX_JACOBIAN_LENS_DIM_BATCH, n_embd)
        or type(max_seq_len) is not int
        or max_seq_len < 2
        or max_seq_len > MAX_JACOBIAN_LENS_SEQUENCE_LENGTH
        or type(skip_first) is not int
        or skip_first < 0
        or skip_first > max_seq_len - 2
        or type(sequence_count) is not int
        or sequence_count < 1
        or type(calibration.get("jacobianCount")) is not int
        or calibration["jacobianCount"] != sequence_count
        or not isinstance(sequence_sha256s, list)
        or len(sequence_sha256s) != sequence_count
        or any(not _is_sha256(value) for value in sequence_sha256s)
        or not isinstance(sequence_token_counts, list)
        or len(sequence_token_counts) != sequence_count
        or any(
            type(count) is not int or count <= skip_first + 1 or count > max_seq_len
            for count in sequence_token_counts
        )
        or type(calibration.get("tokenCount")) is not int
        or calibration["tokenCount"] != sum(sequence_token_counts)
        or type(calibration.get("validPositionCount")) is not int
        or calibration["validPositionCount"]
        != sum(count - skip_first - 1 for count in sequence_token_counts)
        or calibration["corpusSha256"] != sha256_json(sequence_sha256s)
        or not _is_sha256(calibration.get("shardSha256"))
        or calibration["shardSha256"]
        != sha256_json(
            {
                "sequenceSha256s": sequence_sha256s,
                "sequenceTokenCounts": sequence_token_counts,
            }
        )
    ):
        raise WorkspaceProbeError(
            "invalid_lens_metadata",
            "v1 lens calibration provenance is incomplete or inconsistent",
        )


def _validate_v1_merge_artifact(
    artifact: Any,
) -> tuple[dict[str, Any], list[int], torch.Tensor]:
    if (
        not isinstance(artifact, dict)
        or artifact.get("schema") != JACOBIAN_LENS_ARTIFACT_SCHEMA
        or artifact.get("kind") != "JacobianLensArtifact"
        or artifact.get("method") != "jacobian_lens"
        or artifact.get("implementationVersion") != WORKSPACE_PROBE_IMPLEMENTATION_VERSION
        or artifact.get("estimator") != _v1_estimator_metadata()
        or not isinstance(artifact.get("model"), dict)
        or not isinstance(artifact.get("tokenizer"), dict)
    ):
        raise WorkspaceProbeError(
            "invalid_v1_artifact",
            "merge inputs must be complete v1 Jacobian lens artifacts",
        )
    model_meta = artifact["model"]
    tokenizer_meta = artifact["tokenizer"]
    n_embd = model_meta.get("nEmbd")
    if (
        type(model_meta.get("nLayer")) is not int
        or type(n_embd) is not int
        or n_embd < 1
        or type(model_meta.get("vocabSize")) is not int
        or not isinstance(model_meta.get("architecture"), str)
        or not model_meta["architecture"].strip()
        or not _is_sha256(model_meta.get("checkpointSha256"))
        or not _is_sha256(tokenizer_meta.get("sha256"))
    ):
        raise WorkspaceProbeError(
            "invalid_v1_artifact",
            "v1 shard model and tokenizer provenance is incomplete",
        )
    _validate_v1_calibration_metadata(artifact.get("calibration"), n_embd=n_embd)
    layers = artifact.get("layers")
    matrices = artifact.get("matrices")
    if (
        not isinstance(layers, list)
        or not layers
        or any(type(layer) is not int for layer in layers)
        or layers != sorted(set(layers))
        or any(layer < 0 or layer >= model_meta["nLayer"] - 1 for layer in layers)
        or not isinstance(matrices, torch.Tensor)
        or matrices.ndim != 3
        or tuple(matrices.shape) != (len(layers), n_embd, n_embd)
        or not torch.isfinite(matrices).all()
    ):
        raise WorkspaceProbeError(
            "invalid_v1_artifact",
            "v1 shard layers and finite matrices are inconsistent",
        )
    _require_finite_non_degenerate_matrices(matrices, layers)
    return artifact, layers, matrices.detach().to(device="cpu", dtype=torch.float32)


def save_jacobian_lens_artifact(artifact: dict[str, Any], path: str | Path) -> str:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=target.parent,
        prefix=f".{target.name}.",
        suffix=".tmp",
        delete=False,
    ) as handle:
        temporary = Path(handle.name)
    try:
        torch.save(artifact, temporary)
        with temporary.open("rb+") as handle:
            os.fsync(handle.fileno())
        os.replace(temporary, target)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise
    return sha256_file(target)


def jacobian_lens_v4_fit_receipt_fields(
    artifact: dict[str, Any],
    *,
    lens_sha256: str,
) -> dict[str, Any]:
    """Derive the scalar-redacted fields a V4 fit receipt must bind."""

    if artifact.get("estimator") != _v4_estimator_metadata() or not _is_sha256(lens_sha256):
        raise WorkspaceProbeError(
            "invalid_lens_fit_receipt",
            "fit receipt fields require a V4 artifact and its saved lens digest",
        )
    fit_binding = artifact.get("fitBinding")
    if not isinstance(fit_binding, dict):
        raise WorkspaceProbeError(
            "invalid_lens_fit_binding",
            "V4 artifact is missing its fit binding",
        )
    expected_fit_binding = jacobian_lens_v4_fit_binding_payload(
        artifact,
        control_profile_sha256=fit_binding.get("controlProfileSha256"),
    )
    if sha256_json(fit_binding) != sha256_json(expected_fit_binding):
        raise WorkspaceProbeError(
            "invalid_lens_fit_binding",
            "V4 artifact fit binding does not match its sealed tensors and sequences",
        )

    energy = artifact["centeredJacobianEnergyMeans"].to(dtype=torch.float64)
    cross = artifact["centeredJacobianTargetCrossMeans"].to(dtype=torch.float64)
    identity_energy = artifact["centeredIdentityEnergyMeans"].to(dtype=torch.float64)
    identity_cross = artifact["centeredIdentityTargetCrossMeans"].to(dtype=torch.float64)
    if bool((energy <= 0).any()) or bool((identity_energy <= 0).any()):
        raise WorkspaceProbeError(
            "degenerate_scalar_calibration",
            "scalar calibration energies must be positive",
        )
    alpha_raw = cross / ((1.0 + JACOBIAN_LENS_V4_RIDGE_FRACTION) * energy)
    beta_raw = identity_cross / (
        (1.0 + JACOBIAN_LENS_V4_RIDGE_FRACTION) * identity_energy
    )
    if not torch.isfinite(alpha_raw).all() or not torch.isfinite(beta_raw).all():
        raise WorkspaceProbeError(
            "invalid_scalar_calibration",
            "unclipped scalar calibration coefficients must be finite",
        )
    lower, upper = JACOBIAN_LENS_V4_CLIP_BOUNDS
    alpha = torch.clamp(alpha_raw, min=lower, max=upper)
    beta = torch.clamp(beta_raw, min=lower, max=upper)
    layers = artifact.get("layers")
    primary_indices = (
        [index for index, layer in enumerate(layers) if layer in {2, 5}]
        if isinstance(layers, list)
        else []
    )
    primary_alpha_interior = bool(primary_indices) and bool(
        ((alpha[:, primary_indices] > lower) & (alpha[:, primary_indices] < upper))
        .all()
        .item()
    )
    primary_beta_interior = bool(primary_indices) and bool(
        ((beta[:, primary_indices] > lower) & (beta[:, primary_indices] < upper))
        .all()
        .item()
    )
    calibration = artifact["calibration"]
    return {
        "estimator": JACOBIAN_LENS_ESTIMATOR_V4,
        "transportProfile": JACOBIAN_LENS_V4_TRANSPORT_PROFILE,
        "scalarFormulaSha256": fit_binding["scalarFormulaSha256"],
        "controlProfileSha256": fit_binding["controlProfileSha256"],
        "scalarStatisticsDigestSchema": (
            JACOBIAN_LENS_V4_SCALAR_STATISTICS_DIGEST_SCHEMA
        ),
        "scalarStatisticsSha256": fit_binding["scalarStatisticsSha256"],
        "fitBindingSha256": sha256_json(fit_binding),
        "primaryAlphaInterior": primary_alpha_interior,
        "primaryBetaInterior": primary_beta_interior,
        "checkpointSha256": artifact["model"]["checkpointSha256"],
        "tokenizerSha256": artifact["tokenizer"]["sha256"],
        "calibrationCorpusSha256": calibration["corpusSha256"],
        "calibrationShardSha256": calibration["shardSha256"],
        "sequenceOrderSha256": fit_binding["sequenceOrderSha256"],
        "sequenceSetSha256": fit_binding["sequenceSetSha256"],
        "rowCount": fit_binding["sampleCount"],
        "positionBinCounts": fit_binding["positionBinCounts"],
        "lensSha256": lens_sha256,
    }


def _fit_receipt_contains_private_scalar(
    value: Any,
    path: tuple[str, ...] = (),
) -> bool:
    allowed_scalar_fields = {
        "primaryalphainterior",
        "primarybetainterior",
        "scalarcalibration",
        "scalarformula256",
        "scalarformulasha256",
        "scalaridentitycontrol",
        "scalarstatisticsdigestschema",
        "scalarstatisticssha256",
    }
    if isinstance(value, list):
        return any(_fit_receipt_contains_private_scalar(item, path) for item in value)
    if not isinstance(value, dict):
        return False
    if path and path[-1] == "fitsourcesha256s":
        return any(
            not isinstance(source, str) or not _is_sha256(digest)
            for source, digest in value.items()
        )
    for key, child in value.items():
        normalized = "".join(character for character in key.casefold() if character.isalnum())
        if (
            normalized in {"b", "c", "ci", "jbar", "m", "s", "si", "xbar", "ybar"}
            or "alpharaw" in normalized
            or "betaraw" in normalized
            or (
                ("alpha" in normalized or "beta" in normalized or "scalar" in normalized)
                and normalized not in allowed_scalar_fields
            )
        ):
            return True
        if _fit_receipt_contains_private_scalar(child, (*path, normalized)):
            return True
    return False


def _validate_v4_fit_receipt(
    fit_receipt_path: str | Path | None,
    *,
    artifact: dict[str, Any],
    lens_sha256: str,
) -> None:
    if fit_receipt_path is None:
        raise WorkspaceProbeError(
            "missing_lens_fit_receipt",
            "scalar-calibrated lenses require a provenance-bound fit receipt",
        )
    source = Path(fit_receipt_path)
    try:
        receipt = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise WorkspaceProbeError(
            "invalid_lens_fit_receipt",
            "scalar-calibrated fit receipt is missing or malformed",
        ) from error
    if not isinstance(receipt, dict):
        raise WorkspaceProbeError(
            "invalid_lens_fit_receipt",
            "scalar-calibrated fit receipt must be a JSON object",
        )
    expected = jacobian_lens_v4_fit_receipt_fields(
        artifact,
        lens_sha256=lens_sha256,
    )
    actual = {key: receipt.get(key) for key in expected}
    if (
        receipt.get("schema") != JACOBIAN_LENS_V4_FIT_RECEIPT_SCHEMA
        or receipt.get("semanticLabelsAccessed") is not False
        or not _is_sha256(receipt.get("selfHash"))
        or receipt["selfHash"] != sha256_json({**receipt, "selfHash": None})
        or sha256_json(actual) != sha256_json(expected)
        or _fit_receipt_contains_private_scalar(receipt)
    ):
        raise WorkspaceProbeError(
            "invalid_lens_fit_receipt",
            "scalar-calibrated fit receipt does not match the lens or privacy contract",
        )


def load_jacobian_lens_artifact(
    path: str | Path,
    *,
    checkpoint_sha256: str,
    tokenizer_sha256: str,
    model,
    fit_receipt_path: str | Path | None = None,
) -> LoadedJacobianLensArtifact:
    source = Path(path)
    payload = torch.load(source, map_location="cpu", weights_only=True)
    lens_sha256 = sha256_file(source)
    if not isinstance(payload, dict) or payload.get("schema") != JACOBIAN_LENS_ARTIFACT_SCHEMA:
        raise WorkspaceProbeError(
            "invalid_lens_schema",
            f"expected {JACOBIAN_LENS_ARTIFACT_SCHEMA}",
        )
    if payload.get("kind") != "JacobianLensArtifact":
        raise WorkspaceProbeError(
            "invalid_lens_kind",
            "lens kind must be JacobianLensArtifact",
        )
    if payload.get("method") != "jacobian_lens":
        raise WorkspaceProbeError("invalid_lens_method", "lens method must be jacobian_lens")
    estimator_meta = payload.get("estimator")
    is_v0_estimator = (
        isinstance(estimator_meta, dict)
        and estimator_meta.get("name") == JACOBIAN_LENS_ESTIMATOR_V0
        and estimator_meta.get("paperParity") is False
        and estimator_meta.get("vectorization") == "full-output-jacobian-per-explicit-pair"
    )
    is_v1_estimator = estimator_meta == _v1_estimator_metadata()
    is_v2_estimator = estimator_meta == _v2_estimator_metadata()
    is_v3_estimator = estimator_meta == _v3_estimator_metadata()
    is_v4_estimator = _is_v4_estimator_metadata(estimator_meta)
    is_endpoint_estimator = is_v2_estimator or is_v3_estimator or is_v4_estimator
    if not is_v0_estimator and not is_v1_estimator and not is_endpoint_estimator:
        raise WorkspaceProbeError(
            "invalid_lens_estimator",
            "lens estimator metadata is not a supported v0, pinned-reference v1, "
            "endpoint-affine, endpoint-local-Taylor, or endpoint-scalar contract",
        )
    if fit_receipt_path is not None and not is_v4_estimator:
        raise WorkspaceProbeError(
            "invalid_lens_fit_receipt",
            "fit receipts are only valid for scalar-calibrated lens artifacts",
        )
    expected_top_level_fields = {
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
    }
    if is_endpoint_estimator:
        expected_top_level_fields.update({"biases", "sourceMeans", "targetMeans"})
    if is_v3_estimator or is_v4_estimator:
        expected_top_level_fields.add("jacobianSourceProductMeans")
    if is_v4_estimator:
        expected_top_level_fields.update(
            {
                "centeredJacobianEnergyMeans",
                "centeredJacobianTargetCrossMeans",
                "centeredIdentityEnergyMeans",
                "centeredIdentityTargetCrossMeans",
                "fitBinding",
            }
        )
    if set(payload) != expected_top_level_fields:
        raise WorkspaceProbeError(
            "invalid_lens_shape",
            "lens artifact top-level fields do not match its exact estimator contract",
        )
    model_meta = payload.get("model")
    tokenizer_meta = payload.get("tokenizer")
    calibration_meta = payload.get("calibration")
    if (
        not isinstance(model_meta, dict)
        or not isinstance(tokenizer_meta, dict)
        or not isinstance(calibration_meta, dict)
    ):
        raise WorkspaceProbeError(
            "invalid_lens_metadata",
            "model, tokenizer, and calibration metadata are required",
        )
    if model_meta.get("checkpointSha256") != checkpoint_sha256:
        raise WorkspaceProbeError(
            "checkpoint_hash_mismatch",
            "lens checkpoint hash does not match the resident model",
        )
    if tokenizer_meta.get("sha256") != tokenizer_sha256:
        raise WorkspaceProbeError(
            "tokenizer_hash_mismatch",
            "lens tokenizer hash does not match the resident tokenizer",
        )
    if (
        not _is_sha256(model_meta.get("checkpointSha256"))
        or not _is_sha256(tokenizer_meta.get("sha256"))
        or not isinstance(model_meta.get("architecture"), str)
        or not model_meta["architecture"].strip()
    ):
        raise WorkspaceProbeError(
            "invalid_lens_metadata",
            "lens model and tokenizer provenance is incomplete",
        )

    layers = payload.get("layers")
    matrices = payload.get("matrices")
    n_embd = int(model.head.in_features)
    if (
        type(model_meta.get("nLayer")) is not int
        or type(model_meta.get("nEmbd")) is not int
        or type(model_meta.get("vocabSize")) is not int
        or model_meta.get("nLayer") != len(model.blocks)
        or model_meta.get("nEmbd") != n_embd
        or model_meta.get("vocabSize") != int(model.head.out_features)
    ):
        raise WorkspaceProbeError(
            "lens_model_shape_mismatch",
            "lens architecture dimensions do not match the resident model",
        )
    if payload.get("implementationVersion") != WORKSPACE_PROBE_IMPLEMENTATION_VERSION:
        raise WorkspaceProbeError(
            "invalid_lens_metadata",
            "lens implementation version is unsupported",
        )
    if is_v0_estimator:
        if (
            not _is_sha256(calibration_meta.get("corpusSha256"))
            or calibration_meta.get("positionPolicy") != EXPLICIT_POSITION_POLICY
            or type(calibration_meta.get("jacobianCount")) is not int
            or calibration_meta["jacobianCount"] < 1
            or not isinstance(calibration_meta.get("positionPairs"), list)
            or not calibration_meta["positionPairs"]
            or any(
                not isinstance(pair, list)
                or len(pair) != 2
                or any(type(position) is not int for position in pair)
                for pair in calibration_meta["positionPairs"]
            )
            or len({tuple(pair) for pair in calibration_meta["positionPairs"]})
            != len(calibration_meta["positionPairs"])
            or calibration_meta["jacobianCount"] % len(calibration_meta["positionPairs"]) != 0
        ):
            raise WorkspaceProbeError(
                "invalid_lens_metadata",
                "v0 lens calibration provenance is incomplete",
            )
    elif is_v1_estimator:
        _validate_v1_calibration_metadata(calibration_meta, n_embd=n_embd)
    else:
        _validate_v2_calibration_metadata(calibration_meta, n_embd=n_embd)
    if (
        not isinstance(layers, list)
        or not layers
        or any(type(layer) is not int for layer in layers)
        or layers != sorted(set(layers))
        or not isinstance(matrices, torch.Tensor)
    ):
        raise WorkspaceProbeError(
            "invalid_lens_matrices", "layers and tensor matrices are required"
        )
    biases = payload.get("biases")
    source_means = payload.get("sourceMeans")
    target_means = payload.get("targetMeans")
    jacobian_source_product_means = payload.get("jacobianSourceProductMeans")
    centered_jacobian_energy_means = payload.get("centeredJacobianEnergyMeans")
    centered_jacobian_target_cross_means = payload.get(
        "centeredJacobianTargetCrossMeans"
    )
    centered_identity_energy_means = payload.get("centeredIdentityEnergyMeans")
    centered_identity_target_cross_means = payload.get(
        "centeredIdentityTargetCrossMeans"
    )
    fit_binding = payload.get("fitBinding")
    scalar_stat_values = (
        centered_jacobian_energy_means,
        centered_jacobian_target_cross_means,
        centered_identity_energy_means,
        centered_identity_target_cross_means,
    )
    if not is_endpoint_estimator and (
        jacobian_source_product_means is not None
        or any(value is not None for value in scalar_stat_values)
    ):
        raise WorkspaceProbeError(
            "invalid_lens_shape",
            "non-endpoint artifacts cannot contain endpoint transport statistics",
        )
    if any(
        key in payload
        for key in (
            "alpha",
            "beta",
            "scalars",
            "unclippedScalars",
            "scalarIdentityScalars",
        )
    ):
        raise WorkspaceProbeError(
            "invalid_lens_shape",
            "scalar-calibrated artifacts persist sufficient statistics, not fitted scalars",
        )
    transport_matrices = matrices
    v4_centered_biases = None
    v4_local_taylor_biases = None
    v4_identity_biases = None
    v4_identity_scalars = None
    if is_endpoint_estimator:
        position_bins = calibration_meta["positionBins"]
        expected_matrix_shape = (len(position_bins), len(layers), n_embd, n_embd)
        expected_vector_shape = (len(position_bins), len(layers), n_embd)
        if (
            matrices.ndim != 4
            or tuple(matrices.shape) != expected_matrix_shape
            or not isinstance(biases, torch.Tensor)
            or not isinstance(source_means, torch.Tensor)
            or not isinstance(target_means, torch.Tensor)
            or tuple(biases.shape) != expected_vector_shape
            or tuple(source_means.shape) != expected_vector_shape
            or tuple(target_means.shape) != expected_vector_shape
            or (
                is_v4_estimator
                and any(
                    value.dtype != torch.float32
                    for value in (matrices, biases, source_means, target_means)
                )
            )
            or not all(
                torch.isfinite(value).all()
                for value in (matrices, biases, source_means, target_means)
            )
        ):
            raise WorkspaceProbeError(
                "invalid_lens_shape",
                "endpoint affine matrices, biases, and anchor means have inconsistent shapes",
            )
        if not torch.equal(
            target_means,
            target_means[:, :1].expand_as(target_means),
        ):
            raise WorkspaceProbeError(
                "invalid_lens_anchor",
                "endpoint target means must agree across repeated layer slots",
            )
        if is_v2_estimator:
            if jacobian_source_product_means is not None or any(
                value is not None for value in scalar_stat_values
            ):
                raise WorkspaceProbeError(
                    "invalid_lens_shape",
                    "endpoint mean-anchor artifacts cannot contain later-estimator statistics",
                )
            expected_biases = target_means.float() - torch.einsum(
                "blij,blj->bli", matrices.float(), source_means.float()
            )
        elif is_v3_estimator:
            if (
                not isinstance(jacobian_source_product_means, torch.Tensor)
                or tuple(jacobian_source_product_means.shape) != expected_vector_shape
                or jacobian_source_product_means.dtype != torch.float32
                or not torch.isfinite(jacobian_source_product_means).all()
                or any(value is not None for value in scalar_stat_values)
            ):
                raise WorkspaceProbeError(
                    "invalid_lens_shape",
                    "endpoint local-Taylor artifacts require finite per-sample "
                    "Jacobian-source product means",
                )
            expected_biases = target_means.float() - jacobian_source_product_means.float()
        else:
            expected_scalar_shape = (len(position_bins), len(layers))
            if (
                not isinstance(jacobian_source_product_means, torch.Tensor)
                or tuple(jacobian_source_product_means.shape) != expected_vector_shape
                or jacobian_source_product_means.dtype != torch.float32
                or not torch.isfinite(jacobian_source_product_means).all()
                or not all(isinstance(value, torch.Tensor) for value in scalar_stat_values)
                or not all(
                    tuple(value.shape) == expected_scalar_shape
                    and value.dtype == torch.float64
                    and torch.isfinite(value).all()
                    for value in scalar_stat_values
                )
            ):
                raise WorkspaceProbeError(
                    "invalid_lens_shape",
                    "endpoint scalar artifacts require finite sufficient statistics",
                )
            if not isinstance(fit_binding, dict):
                raise WorkspaceProbeError(
                    "invalid_lens_fit_binding",
                    "endpoint scalar artifact requires a sealed fit binding",
                )
            expected_fit_binding = jacobian_lens_v4_fit_binding_payload(
                payload,
                control_profile_sha256=fit_binding.get("controlProfileSha256"),
            )
            if sha256_json(fit_binding) != sha256_json(expected_fit_binding):
                raise WorkspaceProbeError(
                    "invalid_lens_fit_binding",
                    "endpoint scalar artifact fit binding does not match its source tensors",
                )
            energy = centered_jacobian_energy_means.to(dtype=torch.float64)
            cross = centered_jacobian_target_cross_means.to(dtype=torch.float64)
            identity_energy = centered_identity_energy_means.to(dtype=torch.float64)
            identity_cross = centered_identity_target_cross_means.to(dtype=torch.float64)
            if bool((energy <= 0).any()) or bool((identity_energy <= 0).any()):
                raise WorkspaceProbeError(
                    "degenerate_scalar_calibration",
                    "scalar calibration energies must be positive",
                )
            ridge_fraction = JACOBIAN_LENS_V4_RIDGE_FRACTION
            clip_lower, clip_upper = JACOBIAN_LENS_V4_CLIP_BOUNDS
            alpha_raw = cross / ((1.0 + ridge_fraction) * energy)
            beta_raw = identity_cross / (
                (1.0 + ridge_fraction) * identity_energy
            )
            if not torch.isfinite(alpha_raw).all() or not torch.isfinite(beta_raw).all():
                raise WorkspaceProbeError(
                    "invalid_scalar_calibration",
                    "unclipped scalar calibration coefficients must be finite",
                )
            alpha = torch.clamp(alpha_raw, min=clip_lower, max=clip_upper)
            beta = torch.clamp(beta_raw, min=clip_lower, max=clip_upper)
            transport_matrices = alpha[..., None, None] * matrices.to(dtype=torch.float64)
            expected_biases = target_means.to(dtype=torch.float64) - torch.einsum(
                "blij,blj->bli",
                transport_matrices,
                source_means.to(dtype=torch.float64),
            )
            v4_centered_biases = target_means.to(dtype=torch.float64) - torch.einsum(
                "blij,blj->bli",
                matrices.to(dtype=torch.float64),
                source_means.to(dtype=torch.float64),
            )
            v4_local_taylor_biases = (
                target_means.to(dtype=torch.float64)
                - jacobian_source_product_means.to(dtype=torch.float64)
            )
            v4_identity_biases = target_means.to(dtype=torch.float64) - (
                beta[..., None] * source_means.to(dtype=torch.float64)
            )
            v4_identity_scalars = beta
            if not all(
                torch.isfinite(value).all()
                for value in (
                    alpha,
                    beta,
                    transport_matrices,
                    expected_biases,
                    v4_centered_biases,
                    v4_local_taylor_biases,
                    v4_identity_biases,
                )
            ):
                raise WorkspaceProbeError(
                    "invalid_scalar_calibration",
                    "derived scalar transports must be finite",
                )
        if not torch.allclose(
            biases.to(dtype=expected_biases.dtype),
            expected_biases,
            rtol=2e-5,
            atol=2e-5,
        ):
            raise WorkspaceProbeError(
                "invalid_lens_anchor",
                "endpoint affine biases do not match the declared estimator anchor",
            )
        if is_v4_estimator:
            _validate_v4_fit_receipt(
                fit_receipt_path,
                artifact=payload,
                lens_sha256=lens_sha256,
            )
    else:
        if matrices.ndim != 3 or tuple(matrices.shape[1:]) != (n_embd, n_embd):
            raise WorkspaceProbeError(
                "invalid_lens_shape",
                f"lens matrices must have shape [layers, {n_embd}, {n_embd}]",
            )
        if len(layers) != int(matrices.shape[0]) or not torch.isfinite(matrices).all():
            raise WorkspaceProbeError(
                "invalid_lens_matrices",
                "layer metadata and finite matrix count must agree",
            )

    layer_map: dict[int, torch.Tensor] = {}
    bias_map: dict[int, torch.Tensor] = {}
    target_mean_map: dict[int, torch.Tensor] = {}
    control_matrix_maps: dict[str, dict[int, torch.Tensor]] = {}
    control_bias_maps: dict[str, dict[int, torch.Tensor]] = {}
    control_scalar_maps: dict[str, dict[int, torch.Tensor]] = {}
    if is_v4_estimator:
        control_matrix_maps = {"unscaledCentered": {}, "localTaylor": {}}
        control_bias_maps = {
            "unscaledCentered": {},
            "localTaylor": {},
            "scalarIdentity": {},
        }
        control_scalar_maps = {"scalarIdentity": {}}
    for index, layer_value in enumerate(layers):
        layer = int(layer_value)
        if (
            layer < 0
            or layer >= len(model.blocks)
            or ((is_v1_estimator or is_endpoint_estimator) and layer >= len(model.blocks) - 1)
            or layer in layer_map
        ):
            raise WorkspaceProbeError(
                "invalid_lens_layer",
                f"lens layer {layer} is duplicated or outside the resident model",
            )
        matrix = (
            transport_matrices[:, index]
            .detach()
            .to(dtype=torch.float32, device="cpu")
            if is_endpoint_estimator
            else matrices[index].detach().to(dtype=torch.float32, device="cpu")
        )
        if not torch.isfinite(matrix).all():
            raise WorkspaceProbeError(
                "invalid_lens_matrices",
                f"lens layer {layer} is non-finite after float32 conversion",
            )
        if float(torch.linalg.vector_norm(matrix).item()) <= 1e-12:
            raise WorkspaceProbeError(
                "degenerate_lens_matrix",
                f"lens layer {layer} has no measurable mapping",
            )
        layer_map[layer] = matrix
        bias_map[layer] = (
            biases[:, index].detach().to(dtype=torch.float32, device="cpu")
            if is_endpoint_estimator
            else torch.zeros(n_embd, dtype=torch.float32)
        )
        target_mean_map[layer] = (
            target_means[:, index].detach().to(dtype=torch.float32, device="cpu")
            if is_endpoint_estimator
            else torch.zeros(n_embd, dtype=torch.float32)
        )
        if is_v4_estimator:
            control_matrix_maps["unscaledCentered"][layer] = (
                matrices[:, index].detach().to(dtype=torch.float32, device="cpu")
            )
            control_matrix_maps["localTaylor"][layer] = control_matrix_maps[
                "unscaledCentered"
            ][layer]
            control_bias_maps["unscaledCentered"][layer] = (
                v4_centered_biases[:, index]
                .detach()
                .to(dtype=torch.float32, device="cpu")
            )
            control_bias_maps["localTaylor"][layer] = (
                v4_local_taylor_biases[:, index]
                .detach()
                .to(dtype=torch.float32, device="cpu")
            )
            control_bias_maps["scalarIdentity"][layer] = (
                v4_identity_biases[:, index]
                .detach()
                .to(dtype=torch.float32, device="cpu")
            )
            control_scalar_maps["scalarIdentity"][layer] = (
                v4_identity_scalars[:, index]
                .detach()
                .to(dtype=torch.float32, device="cpu")
            )
    metadata = {
        key: value
        for key, value in payload.items()
        if key
        not in {
            "matrices",
            "biases",
            "sourceMeans",
            "targetMeans",
            "jacobianSourceProductMeans",
            "centeredJacobianEnergyMeans",
            "centeredJacobianTargetCrossMeans",
            "centeredIdentityEnergyMeans",
            "centeredIdentityTargetCrossMeans",
            "fitBinding",
        }
    }
    return LoadedJacobianLensArtifact(
        metadata=metadata,
        matrices=layer_map,
        biases=bias_map,
        target_means=target_mean_map,
        lens_sha256=lens_sha256,
        control_matrices=control_matrix_maps or None,
        control_biases=control_bias_maps or None,
        control_scalars=control_scalar_maps or None,
    )


class ModelWorkspaceProbe:
    """Apply a model-bound Jacobian lens and emit a receipt, never raw activations."""

    def __init__(self, model, lens: LoadedJacobianLensArtifact, token_bytes, model_name: str):
        self.model = model
        self.lens = lens
        self.token_bytes = token_bytes
        self.model_name = model_name

    def capability(self) -> dict[str, Any]:
        estimator = self.lens.metadata["estimator"]
        capability = {
            "schema": MODEL_WORKSPACE_CAPABILITY_SCHEMA,
            "observe": True,
            "intervention": False,
            "method": "jacobian_lens",
            "estimator": estimator["name"],
            "paperParity": estimator["paperParity"],
            "measurementProfile": MODEL_WORKSPACE_MEASUREMENT_PROFILE,
            "controlProfile": MODEL_WORKSPACE_CONTROL_PROFILE,
            "layers": list(self.lens.layers),
            "lensSha256": self.lens.lens_sha256,
        }
        if estimator["name"] == JACOBIAN_LENS_ESTIMATOR_V1:
            capability["parityScope"] = estimator["parityScope"]
            capability["paperExperimentParity"] = estimator["paperExperimentParity"]
        elif _is_endpoint_estimator_name(estimator["name"]):
            capability["transportProfile"] = estimator["transportProfile"]
            capability["positionPolicy"] = self.lens.metadata["calibration"]["positionPolicy"]
            capability["positionBins"] = self.lens.metadata["calibration"]["positionBins"]
        return capability

    def observe(
        self,
        token_ids: torch.Tensor,
        *,
        prompt_sha256: str,
        requested_model: str,
        request_id: str,
        layers: Sequence[int] | None = None,
        positions: Sequence[int] | None = None,
        k: int = 10,
        created_at: str | None = None,
        original_token_count: int | None = None,
    ) -> dict[str, Any]:
        if token_ids.ndim != 2 or token_ids.size(0) != 1 or token_ids.size(1) < 1:
            raise WorkspaceProbeError(
                "invalid_probe_tokens",
                "workspace observation requires token shape [1, sequence]",
            )
        if k < 1 or k > min(MAX_WORKSPACE_TOP_K, int(self.model.head.out_features)):
            raise WorkspaceProbeError(
                "invalid_k",
                f"k must be in [1, {min(MAX_WORKSPACE_TOP_K, int(self.model.head.out_features))}]",
            )
        selected_layers = (
            list(self.lens.layers) if layers is None else sorted(set(map(int, layers)))
        )
        if not selected_layers or any(layer not in self.lens.matrices for layer in selected_layers):
            raise WorkspaceProbeError(
                "lens_layer_unavailable",
                f"layers must be a non-empty subset of {list(self.lens.layers)}",
            )
        requested_positions = [-1] if positions is None else list(map(int, positions))
        if not requested_positions or len(requested_positions) > MAX_WORKSPACE_POSITIONS:
            raise WorkspaceProbeError(
                "invalid_positions",
                f"positions must contain 1-{MAX_WORKSPACE_POSITIONS} entries",
            )
        sequence_length = int(token_ids.size(1))
        if original_token_count is None:
            original_token_count = sequence_length
        if type(original_token_count) is not int or original_token_count < sequence_length:
            raise WorkspaceProbeError(
                "invalid_original_token_count",
                "original_token_count must be an integer at least as large as the observed sequence",
            )
        was_truncated = original_token_count > sequence_length
        normalized_positions = [
            _normalize_position(position, sequence_length) for position in requested_positions
        ]
        if len(set(normalized_positions)) != len(normalized_positions):
            raise WorkspaceProbeError(
                "duplicate_positions",
                "positions must resolve to unique token coordinates",
            )
        estimator_name = self.lens.metadata["estimator"]["name"]
        if _is_endpoint_estimator_name(estimator_name) and normalized_positions != [
            sequence_length - 1
        ]:
            raise WorkspaceProbeError(
                "lens_position_unavailable",
                "endpoint affine Jacobian observations require exactly the final token position",
            )

        device = next(self.model.parameters()).device
        idx = token_ids.to(device=device, dtype=torch.long)
        with torch.no_grad():
            model_logits, residuals = self.model.forward_with_residuals(idx)
            layer_observations = []
            for layer in selected_layers:
                for position in normalized_positions:
                    if _is_endpoint_estimator_name(estimator_name):
                        position_bins = self.lens.metadata["calibration"]["positionBins"]
                        bin_index = _endpoint_position_bin(position, position_bins)
                        if bin_index is None:
                            raise WorkspaceProbeError(
                                "lens_position_unavailable",
                                f"position {position} is outside the calibrated endpoint bins",
                            )
                        matrix = self.lens.matrices[layer][bin_index].to(
                            device=device,
                            dtype=residuals[layer].dtype,
                        )
                        bias = self.lens.biases[layer][bin_index].to(
                            device=device,
                            dtype=residuals[layer].dtype,
                        )
                        target_mean = self.lens.target_means[layer][bin_index].to(
                            device=device,
                            dtype=residuals[layer].dtype,
                        )
                    else:
                        matrix = self.lens.matrices[layer].to(
                            device=device,
                            dtype=residuals[layer].dtype,
                        )
                        bias = self.lens.biases[layer].to(
                            device=device,
                            dtype=residuals[layer].dtype,
                        )
                    activation = residuals[layer][0, position]
                    mapped = matrix @ activation + bias
                    mapped_logits = self.model.head(self.model.lnf(mapped.view(1, 1, -1))[0, 0])
                    control_logits = self.model.head(
                        self.model.lnf(activation.view(1, 1, -1))[0, 0]
                    )
                    # Sparse receipt probabilities use the same float64 softmax domain as
                    # the full-distribution metrics below. This keeps the top-1 receipt
                    # mass and mapped/control max-probability metrics cross-runtime aligned.
                    mapped_probs = F.softmax(mapped_logits.to(dtype=torch.float64), dim=-1)
                    control_probs = F.softmax(control_logits.to(dtype=torch.float64), dim=-1)
                    if not all(
                        torch.isfinite(value).all()
                        for value in (
                            mapped,
                            mapped_logits,
                            control_logits,
                            mapped_probs,
                            control_probs,
                        )
                    ):
                        raise WorkspaceProbeError(
                            "nonfinite_workspace_observation",
                            f"layer {layer} position {position} produced non-finite values",
                        )
                    concepts, mapped_tail_e8 = self._top_concepts(mapped_logits, mapped_probs, k)
                    control_concepts, control_tail_e8 = self._top_concepts(
                        control_logits, control_probs, k
                    )
                    distribution_metrics = _full_distribution_metrics(
                        mapped_logits,
                        control_logits,
                        model_logits[0, position],
                    )
                    coordinate = {
                        "layer": layer,
                        "position": position,
                        "concepts": concepts,
                        "controlConcepts": control_concepts,
                        "tailProbabilityMassE8": mapped_tail_e8,
                        "controlTailProbabilityMassE8": control_tail_e8,
                        "distributionMetrics": distribution_metrics,
                    }
                    if _is_endpoint_estimator_name(estimator_name):
                        anchor_logits = self.model.head(
                            self.model.lnf(target_mean.view(1, 1, -1))[0, 0]
                        )
                        coordinate["anchorControlMetrics"] = _anchor_control_metrics(
                            mapped_logits,
                            anchor_logits,
                            model_logits[0, position],
                        )
                        if estimator_name == JACOBIAN_LENS_ESTIMATOR_V4:
                            if (
                                self.lens.control_matrices is None
                                or self.lens.control_biases is None
                                or self.lens.control_scalars is None
                            ):
                                raise WorkspaceProbeError(
                                    "invalid_scalar_calibration",
                                    "loaded scalar lens is missing private evaluation controls",
                                )
                            transport_controls: dict[str, dict[str, int]] = {}
                            for control_name in ("unscaledCentered", "localTaylor"):
                                control_matrix = self.lens.control_matrices[control_name][
                                    layer
                                ][bin_index].to(device=device, dtype=activation.dtype)
                                control_bias = self.lens.control_biases[control_name][layer][
                                    bin_index
                                ].to(device=device, dtype=activation.dtype)
                                control_mapped = control_matrix @ activation + control_bias
                                control_mapped_logits = self.model.head(
                                    self.model.lnf(control_mapped.view(1, 1, -1))[0, 0]
                                )
                                transport_controls[control_name] = (
                                    _transport_control_metrics(
                                        control_mapped_logits,
                                        model_logits[0, position],
                                    )
                                )
                            identity_scalar = self.lens.control_scalars[
                                "scalarIdentity"
                            ][layer][bin_index].to(device=device, dtype=activation.dtype)
                            identity_bias = self.lens.control_biases["scalarIdentity"][layer][
                                bin_index
                            ].to(device=device, dtype=activation.dtype)
                            identity_mapped = identity_scalar * activation + identity_bias
                            identity_logits = self.model.head(
                                self.model.lnf(identity_mapped.view(1, 1, -1))[0, 0]
                            )
                            transport_controls["scalarIdentity"] = (
                                _transport_control_metrics(
                                    identity_logits,
                                    model_logits[0, position],
                                )
                            )
                            coordinate["transportControlMetrics"] = transport_controls
                    layer_observations.append(coordinate)

        observation = {
            "status": "observed",
            "measurementProfile": MODEL_WORKSPACE_MEASUREMENT_PROFILE,
            "controlProfile": MODEL_WORKSPACE_CONTROL_PROFILE,
            "layerBand": {
                "start": min(selected_layers),
                "end": max(selected_layers),
            },
            "layers": layer_observations,
            "summary": {
                "scoreProfile": MODEL_WORKSPACE_SCORE_PROFILE,
                "coordinateCount": len(layer_observations),
                "scoreE8": _integer_mean_e8(
                    [
                        item["distributionMetrics"]["mappedControlJensenShannonDivergenceNatsE8"]
                        for item in layer_observations
                    ]
                ),
            },
        }
        metadata = self.lens.metadata
        model_meta = metadata["model"]
        tokenizer_meta = metadata["tokenizer"]
        calibration_meta = metadata["calibration"]
        receipt = {
            "schema": MODEL_WORKSPACE_RECEIPT_SCHEMA,
            "kind": "ModelWorkspaceReceipt",
            "mode": "observe",
            "createdAt": created_at or _utc_now(),
            "requestId": request_id,
            "model": {
                "requestedId": requested_model,
                "servedId": self.model_name,
                "checkpointSha256": model_meta["checkpointSha256"],
                "architecture": model_meta["architecture"],
            },
            "tokenizer": {
                "sha256": tokenizer_meta["sha256"],
                "vocabSize": int(model_meta["vocabSize"]),
            },
            "lens": {
                "method": "jacobian_lens",
                "estimator": metadata["estimator"]["name"],
                "paperParity": metadata["estimator"]["paperParity"],
                "implementationVersion": metadata["implementationVersion"],
                "corpusSha256": calibration_meta["corpusSha256"],
                "lensSha256": self.lens.lens_sha256,
                "positionPolicy": calibration_meta["positionPolicy"],
                "jacobianCount": int(calibration_meta["jacobianCount"]),
                "k": k,
            },
            "input": {
                "promptSha256": prompt_sha256,
                "tokenCount": sequence_length,
                "originalTokenCount": original_token_count,
                "truncated": was_truncated,
                "truncationPolicy": (
                    "left-truncate-to-model-block-size" if was_truncated else "none"
                ),
                "layers": selected_layers,
                "requestedPositions": requested_positions,
                "positions": normalized_positions,
                "measurementProfile": MODEL_WORKSPACE_MEASUREMENT_PROFILE,
                "seed": None,
            },
            "observation": observation,
            "observationSha256": sha256_json(observation),
            "runtime": {
                "backend": "pytorch-holo",
                "device": str(device),
                "torchVersion": torch.__version__,
                "pythonVersion": platform.python_version(),
                "holoserveVersion": WORKSPACE_PROBE_IMPLEMENTATION_VERSION,
            },
            "integrity": {
                "algorithm": "sha256",
                "canonicalization": MODEL_WORKSPACE_HASH_CANONICALIZATION,
            },
            "safety": {
                "readOnly": True,
                "interventionApplied": False,
                "rawActivationsPersisted": False,
                "identityBinding": "none",
                "retention": "receipt_only",
            },
            "limitations": [
                "Token readouts are tokenizer-bound and do not recover concept relations.",
                "Observation is not intent, truth, identity, consciousness, or policy authority.",
                "Only the loaded lens layers and calibration position policy are valid.",
            ],
            "receiptHash": None,
        }
        if metadata["estimator"]["name"] == JACOBIAN_LENS_ESTIMATOR_V1:
            receipt["lens"]["parityScope"] = metadata["estimator"]["parityScope"]
            receipt["lens"]["paperExperimentParity"] = metadata["estimator"][
                "paperExperimentParity"
            ]
        elif _is_endpoint_estimator_name(metadata["estimator"]["name"]):
            receipt["lens"]["transportProfile"] = metadata["estimator"]["transportProfile"]
            receipt["lens"]["positionBins"] = calibration_meta["positionBins"]
        receipt["receiptHash"] = sha256_json(receipt)
        return receipt

    def _top_concepts(self, logits, probabilities, k: int) -> tuple[list[dict[str, Any]], int]:
        values, indices = torch.topk(probabilities, k=k)
        top_probabilities = [float(probability.item()) for probability in values]
        tail_probability = max(0.0, 1.0 - math.fsum(top_probabilities))
        quantized = _largest_remainder_probability_e8([*top_probabilities, tail_probability])
        concepts = []
        for probability_e8, token_id_tensor in zip(quantized[:-1], indices, strict=True):
            token_id = int(token_id_tensor.item())
            concepts.append(
                {
                    "tokenId": token_id,
                    "token": self._token_text(token_id),
                    "scoreE8": _measurement_e8(float(logits[token_id].item())),
                    "probabilityE8": probability_e8,
                }
            )
        return concepts, quantized[-1]

    def _token_text(self, token_id: int) -> str:
        if 0 <= token_id < len(self.token_bytes):
            value = self.token_bytes[token_id]
            if value is not None:
                decoded = bytes(value).decode("utf-8", errors="replace")
                if decoded:
                    return decoded
        return f"<token:{token_id}>"


def _normalize_position(position: int, sequence_length: int) -> int:
    normalized = position + sequence_length if position < 0 else position
    if normalized < 0 or normalized >= sequence_length:
        raise WorkspaceProbeError(
            "position_out_of_range",
            f"position {position} is outside a sequence of length {sequence_length}",
        )
    return normalized


def _is_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 71
        and value.startswith("sha256:")
        and all(character in "0123456789abcdef" for character in value[7:])
    )


def _measurement_e8(value: float, *, probability: bool = False) -> int:
    if not math.isfinite(value):
        raise WorkspaceProbeError(
            "nonfinite_workspace_observation",
            "workspace measurements must be finite",
        )
    if probability:
        value = max(0.0, min(1.0, value))
    scaled = int(round(value * MEASUREMENT_E8))
    if abs(scaled) > MAX_SAFE_JSON_INTEGER:
        raise WorkspaceProbeError(
            "workspace_measurement_out_of_range",
            "workspace measurements must remain JavaScript-safe E8 integers",
        )
    return scaled


def _largest_remainder_probability_e8(probabilities: Sequence[float]) -> list[int]:
    """Quantize a complete categorical partition while preserving exactly one E8 mass.

    The final category is the aggregate sparse tail. Hamilton/largest-remainder
    apportionment minimizes integer quantization error, and the original category
    order is the deterministic tie-break.
    """

    if not probabilities or any(
        not math.isfinite(probability) or probability < 0 for probability in probabilities
    ):
        raise WorkspaceProbeError(
            "invalid_workspace_distribution",
            "probability partitions must be finite and nonnegative",
        )
    total = math.fsum(probabilities)
    if total <= 0:
        raise WorkspaceProbeError(
            "invalid_workspace_distribution",
            "probability partitions must contain positive mass",
        )
    scaled = [probability * MEASUREMENT_E8 / total for probability in probabilities]
    apportioned = [math.floor(value) for value in scaled]
    remaining = MEASUREMENT_E8 - sum(apportioned)
    order = sorted(
        range(len(scaled)),
        key=lambda index: (-(scaled[index] - apportioned[index]), index),
    )
    for index in order[:remaining]:
        apportioned[index] += 1
    if sum(apportioned) != MEASUREMENT_E8:
        raise WorkspaceProbeError(
            "workspace_measurement_out_of_range",
            "probability apportionment did not preserve complete distribution mass",
        )
    return apportioned


def _full_distribution_metrics(
    mapped_logits: torch.Tensor,
    control_logits: torch.Tensor,
    target_logits: torch.Tensor,
) -> dict[str, int]:
    """Compare complete vocabulary distributions before sparse receipt truncation."""

    if (
        mapped_logits.ndim != 1
        or control_logits.shape != mapped_logits.shape
        or target_logits.shape != mapped_logits.shape
        or mapped_logits.numel() < 1
    ):
        raise WorkspaceProbeError(
            "invalid_workspace_distribution",
            "workspace distributions must be non-empty vectors with matching shapes",
        )
    mapped_logits = mapped_logits.detach().to(dtype=torch.float64)
    control_logits = control_logits.detach().to(dtype=torch.float64)
    target_logits = target_logits.detach().to(dtype=torch.float64)
    if not all(
        torch.isfinite(value).all() for value in (mapped_logits, control_logits, target_logits)
    ):
        raise WorkspaceProbeError(
            "nonfinite_workspace_observation",
            "workspace distributions must be finite",
        )
    mapped_log = F.log_softmax(mapped_logits, dim=-1)
    control_log = F.log_softmax(control_logits, dim=-1)
    target_log = F.log_softmax(target_logits, dim=-1)
    mapped = mapped_log.exp()
    control = control_log.exp()
    mapped_control_jsd = _jensen_shannon_divergence_nats(mapped_log, control_log)
    mapped_target_jsd = _jensen_shannon_divergence_nats(mapped_log, target_log)
    control_target_jsd = _jensen_shannon_divergence_nats(control_log, target_log)
    total_variation = 0.5 * torch.sum(torch.abs(mapped - control))
    mapped_entropy = -torch.sum(mapped * mapped_log)
    control_entropy = -torch.sum(control * control_log)
    mapped_control_jsd_e8 = _measurement_e8(max(0.0, float(mapped_control_jsd.item())))
    mapped_target_jsd_e8 = _measurement_e8(max(0.0, float(mapped_target_jsd.item())))
    control_target_jsd_e8 = _measurement_e8(max(0.0, float(control_target_jsd.item())))
    return {
        "mappedControlJensenShannonDivergenceNatsE8": mapped_control_jsd_e8,
        "mappedTargetJensenShannonDivergenceNatsE8": mapped_target_jsd_e8,
        "controlTargetJensenShannonDivergenceNatsE8": control_target_jsd_e8,
        "lensGainJensenShannonNatsE8": control_target_jsd_e8 - mapped_target_jsd_e8,
        "totalVariationDistanceE8": _measurement_e8(
            float(total_variation.item()),
            probability=True,
        ),
        "mappedEntropyNatsE8": _measurement_e8(max(0.0, float(mapped_entropy.item()))),
        "controlEntropyNatsE8": _measurement_e8(max(0.0, float(control_entropy.item()))),
        "mappedMaxProbabilityE8": _measurement_e8(
            float(mapped.max().item()),
            probability=True,
        ),
        "controlMaxProbabilityE8": _measurement_e8(
            float(control.max().item()),
            probability=True,
        ),
    }


def _anchor_control_metrics(
    mapped_logits: torch.Tensor,
    anchor_logits: torch.Tensor,
    target_logits: torch.Tensor,
) -> dict[str, int]:
    """Measure whether the affine transport beats its bin-wise mean-only anchor."""

    if (
        mapped_logits.ndim != 1
        or anchor_logits.shape != mapped_logits.shape
        or target_logits.shape != mapped_logits.shape
        or mapped_logits.numel() < 1
    ):
        raise WorkspaceProbeError(
            "invalid_workspace_distribution",
            "anchor-control distributions must be non-empty vectors with matching shapes",
        )
    mapped_log = F.log_softmax(mapped_logits.detach().to(dtype=torch.float64), dim=-1)
    anchor_log = F.log_softmax(anchor_logits.detach().to(dtype=torch.float64), dim=-1)
    target_log = F.log_softmax(target_logits.detach().to(dtype=torch.float64), dim=-1)
    mapped = mapped_log.exp()
    anchor = anchor_log.exp()
    target = target_log.exp()
    mapped_target = _measurement_e8(
        max(0.0, float(_jensen_shannon_divergence_nats(mapped_log, target_log).item()))
    )
    anchor_target = _measurement_e8(
        max(0.0, float(_jensen_shannon_divergence_nats(anchor_log, target_log).item()))
    )
    return {
        "anchorTargetJensenShannonDivergenceNatsE8": anchor_target,
        "mappedVsAnchorLensGainJensenShannonNatsE8": anchor_target - mapped_target,
        "anchorEntropyNatsE8": _measurement_e8(
            max(0.0, float((-torch.sum(anchor * anchor_log)).item()))
        ),
        "anchorMaxProbabilityE8": _measurement_e8(
            float(anchor.max().item()),
            probability=True,
        ),
        "targetEntropyNatsE8": _measurement_e8(
            max(0.0, float((-torch.sum(target * target_log)).item()))
        ),
        "targetMaxProbabilityE8": _measurement_e8(
            float(target.max().item()),
            probability=True,
        ),
        "mappedTopTokenId": int(torch.argmax(mapped).item()),
        "anchorTopTokenId": int(torch.argmax(anchor).item()),
        "targetTopTokenId": int(torch.argmax(target).item()),
    }


def _transport_control_metrics(
    control_logits: torch.Tensor,
    target_logits: torch.Tensor,
) -> dict[str, int]:
    """Record one frozen S4 transport ablation without exposing private scalars."""

    if (
        control_logits.ndim != 1
        or target_logits.shape != control_logits.shape
        or control_logits.numel() < 1
    ):
        raise WorkspaceProbeError(
            "invalid_workspace_distribution",
            "transport-control distributions must be non-empty matching vectors",
        )
    control_log = F.log_softmax(
        control_logits.detach().to(dtype=torch.float64), dim=-1
    )
    target_log = F.log_softmax(target_logits.detach().to(dtype=torch.float64), dim=-1)
    if not torch.isfinite(control_log).all() or not torch.isfinite(target_log).all():
        raise WorkspaceProbeError(
            "nonfinite_workspace_observation",
            "transport-control distributions must be finite",
        )
    divergence = _jensen_shannon_divergence_nats(control_log, target_log)
    return {
        "targetJensenShannonDivergenceNatsE8": _measurement_e8(
            max(0.0, float(divergence.item()))
        )
    }


def _jensen_shannon_divergence_nats(
    left_log_probabilities: torch.Tensor,
    right_log_probabilities: torch.Tensor,
) -> torch.Tensor:
    midpoint_log = torch.logaddexp(left_log_probabilities, right_log_probabilities) - math.log(2.0)
    left = left_log_probabilities.exp()
    right = right_log_probabilities.exp()
    return 0.5 * (
        torch.sum(left * (left_log_probabilities - midpoint_log))
        + torch.sum(right * (right_log_probabilities - midpoint_log))
    )


def _integer_mean_e8(values: Sequence[int]) -> int:
    if not values:
        raise WorkspaceProbeError(
            "invalid_workspace_distribution",
            "workspace summary requires at least one coordinate",
        )
    return (sum(values) + len(values) // 2) // len(values)


def _validate_hash_value(value: Any) -> Any:
    """Validate the integer-only numeric receipt domain used across runtimes.

    Python and JavaScript do not serialize arbitrary floating-point values
    identically. Model measurements therefore use explicit E8 integer fields;
    every remaining receipt number is a safe integer. Sorted-key UTF-8 JSON is
    then identical in both implementations without lossy hash quantization.
    """

    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, int):
        if abs(value) > MAX_SAFE_JSON_INTEGER:
            raise WorkspaceProbeError(
                "invalid_receipt_number",
                "receipt integers must be JavaScript-safe",
            )
        return value
    if isinstance(value, float):
        raise WorkspaceProbeError(
            "invalid_receipt_number",
            "receipt measurements must use explicit E8 integers",
        )
    if isinstance(value, (list, tuple)):
        return [_validate_hash_value(item) for item in value]
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise WorkspaceProbeError(
                "invalid_receipt_key",
                "receipt object keys must be strings",
            )
        return {key: _validate_hash_value(item) for key, item in value.items()}
    raise WorkspaceProbeError(
        "invalid_receipt_value",
        f"receipt values cannot contain {type(value).__name__}",
    )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


__all__ = [
    "ALL_VALID_CURRENT_AND_FUTURE_POSITION_POLICY",
    "ENDPOINT_SELF_POSITION_POLICY",
    "EXPLICIT_POSITION_POLICY",
    "JACOBIAN_LENS_ARTIFACT_SCHEMA",
    "JACOBIAN_LENS_ESTIMATOR",
    "JACOBIAN_LENS_ESTIMATOR_V0",
    "JACOBIAN_LENS_ESTIMATOR_V1",
    "JACOBIAN_LENS_ESTIMATOR_V2",
    "JACOBIAN_LENS_ESTIMATOR_V3",
    "JACOBIAN_LENS_ESTIMATOR_V4",
    "JACOBIAN_LENS_V1_REFERENCE_COMMIT",
    "JACOBIAN_LENS_V2_TRANSPORT_PROFILE",
    "JACOBIAN_LENS_V3_TRANSPORT_PROFILE",
    "JACOBIAN_LENS_V4_TRANSPORT_PROFILE",
    "JACOBIAN_LENS_V4_CLIP_BOUNDS",
    "JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256",
    "JACOBIAN_LENS_V4_FIT_BINDING_SCHEMA",
    "JACOBIAN_LENS_V4_FIT_RECEIPT_SCHEMA",
    "JACOBIAN_LENS_V4_RIDGE_FRACTION",
    "JACOBIAN_LENS_V4_SCALAR_CALIBRATION_PROFILE",
    "JACOBIAN_LENS_V4_SCALAR_IDENTITY_CONTROL_PROFILE",
    "JACOBIAN_LENS_V4_SCALAR_STATISTICS_DIGEST_SCHEMA",
    "MODEL_WORKSPACE_CAPABILITY_SCHEMA",
    "MODEL_WORKSPACE_HASH_CANONICALIZATION",
    "MODEL_WORKSPACE_CONTROL_PROFILE",
    "MODEL_WORKSPACE_MEASUREMENT_PROFILE",
    "MODEL_WORKSPACE_SCORE_PROFILE",
    "MODEL_WORKSPACE_RECEIPT_SCHEMA",
    "MAX_WORKSPACE_POSITIONS",
    "MAX_WORKSPACE_TOP_K",
    "LoadedJacobianLensArtifact",
    "ModelWorkspaceProbe",
    "WorkspaceProbeError",
    "fit_jacobian_lens",
    "fit_jacobian_lens_v1",
    "fit_endpoint_affine_jacobian_lens_v1",
    "fit_endpoint_local_taylor_jacobian_lens_v1",
    "fit_endpoint_scalar_calibrated_jacobian_lens_v1",
    "jacobian_lens_v4_fit_binding_payload",
    "jacobian_lens_v4_fit_receipt_fields",
    "jacobian_lens_v4_scalar_formula_contract",
    "jacobian_lens_v4_scalar_formula_sha256",
    "jacobian_lens_v4_scalar_statistics_payload",
    "jacobian_lens_v4_scalar_statistics_sha256",
    "load_jacobian_lens_artifact",
    "merge_jacobian_lens_v1_artifacts",
    "save_jacobian_lens_artifact",
    "sha256_file",
    "sha256_contract_json",
    "sha256_json",
]
