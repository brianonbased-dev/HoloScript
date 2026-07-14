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
MODEL_WORKSPACE_RECEIPT_SCHEMA = "holoscript.model-workspace-receipt.v0.1.0"
MODEL_WORKSPACE_CAPABILITY_SCHEMA = "holoscript.model-workspace-capability.v0.1.0"
MODEL_WORKSPACE_HASH_CANONICALIZATION = "holoscript.integer-measurement-json.v0.1.0"
JACOBIAN_LENS_ESTIMATOR_V0 = "explicit_pair_average_v0"
JACOBIAN_LENS_ESTIMATOR = JACOBIAN_LENS_ESTIMATOR_V0
JACOBIAN_LENS_ESTIMATOR_V1 = "corpus_position_average_v1"
EXPLICIT_POSITION_POLICY = "explicit-source-target-pairs"
ALL_VALID_CURRENT_AND_FUTURE_POSITION_POLICY = "all-valid-current-and-future-targets"
JACOBIAN_LENS_V1_REFERENCE_REPOSITORY = "https://github.com/anthropics/jacobian-lens"
JACOBIAN_LENS_V1_REFERENCE_COMMIT = "581d398613e5602a5af361e1c34d3a92ea82ba8e"
JACOBIAN_LENS_V1_REFERENCE_LICENSE = "Apache-2.0"
JACOBIAN_LENS_V1_CORPUS_CANONICALIZATION = "ordered-post-truncation-sequence-sha256-v1"
JACOBIAN_LENS_V1_PROMPT_TRUNCATION_POLICY = "right-truncate-token-ids-to-max-seq-len"
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
    lens_sha256: str

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


def load_jacobian_lens_artifact(
    path: str | Path,
    *,
    checkpoint_sha256: str,
    tokenizer_sha256: str,
    model,
) -> LoadedJacobianLensArtifact:
    source = Path(path)
    payload = torch.load(source, map_location="cpu", weights_only=True)
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
    if not is_v0_estimator and not is_v1_estimator:
        raise WorkspaceProbeError(
            "invalid_lens_estimator",
            "lens estimator metadata is not a supported v0 or pinned-reference v1 contract",
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
    else:
        _validate_v1_calibration_metadata(calibration_meta, n_embd=n_embd)
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
    for index, layer_value in enumerate(layers):
        layer = int(layer_value)
        if (
            layer < 0
            or layer >= len(model.blocks)
            or (is_v1_estimator and layer >= len(model.blocks) - 1)
            or layer in layer_map
        ):
            raise WorkspaceProbeError(
                "invalid_lens_layer",
                f"lens layer {layer} is duplicated or outside the resident model",
            )
        matrix = matrices[index].detach().to(dtype=torch.float32, device="cpu")
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
    metadata = {key: value for key, value in payload.items() if key != "matrices"}
    return LoadedJacobianLensArtifact(
        metadata=metadata,
        matrices=layer_map,
        lens_sha256=sha256_file(source),
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
            "layers": list(self.lens.layers),
            "lensSha256": self.lens.lens_sha256,
        }
        if estimator["name"] == JACOBIAN_LENS_ESTIMATOR_V1:
            capability["parityScope"] = estimator["parityScope"]
            capability["paperExperimentParity"] = estimator["paperExperimentParity"]
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

        device = next(self.model.parameters()).device
        idx = token_ids.to(device=device, dtype=torch.long)
        with torch.no_grad():
            _, residuals = self.model.forward_with_residuals(idx)
            layer_observations = []
            for layer in selected_layers:
                matrix = self.lens.matrices[layer].to(
                    device=device,
                    dtype=residuals[layer].dtype,
                )
                for position in normalized_positions:
                    activation = residuals[layer][0, position]
                    mapped = matrix @ activation
                    mapped_logits = self.model.head(self.model.lnf(mapped.view(1, 1, -1))[0, 0])
                    control_logits = self.model.head(
                        self.model.lnf(activation.view(1, 1, -1))[0, 0]
                    )
                    mapped_probs = F.softmax(mapped_logits, dim=-1)
                    control_probs = F.softmax(control_logits, dim=-1)
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
                    concepts = self._top_concepts(mapped_logits, mapped_probs, k)
                    control_concepts = self._top_concepts(control_logits, control_probs, k)
                    layer_observations.append(
                        {
                            "layer": layer,
                            "position": position,
                            "concepts": concepts,
                            "controlConcepts": control_concepts,
                            "tailProbabilityMassE8": max(
                                0,
                                MEASUREMENT_E8 - sum(item["probabilityE8"] for item in concepts),
                            ),
                        }
                    )

        observation = {
            "status": "observed",
            "layerBand": {
                "start": min(selected_layers),
                "end": max(selected_layers),
            },
            "layers": layer_observations,
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
        receipt["receiptHash"] = sha256_json(receipt)
        return receipt

    def _top_concepts(self, logits, probabilities, k: int) -> list[dict[str, Any]]:
        values, indices = torch.topk(probabilities, k=k)
        concepts = []
        for probability, token_id_tensor in zip(values, indices, strict=True):
            token_id = int(token_id_tensor.item())
            concepts.append(
                {
                    "tokenId": token_id,
                    "token": self._token_text(token_id),
                    "scoreE8": _measurement_e8(float(logits[token_id].item())),
                    "probabilityE8": _measurement_e8(
                        float(probability.item()),
                        probability=True,
                    ),
                }
            )
        return concepts

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
    "EXPLICIT_POSITION_POLICY",
    "JACOBIAN_LENS_ARTIFACT_SCHEMA",
    "JACOBIAN_LENS_ESTIMATOR",
    "JACOBIAN_LENS_ESTIMATOR_V0",
    "JACOBIAN_LENS_ESTIMATOR_V1",
    "JACOBIAN_LENS_V1_REFERENCE_COMMIT",
    "MODEL_WORKSPACE_CAPABILITY_SCHEMA",
    "MODEL_WORKSPACE_HASH_CANONICALIZATION",
    "MODEL_WORKSPACE_RECEIPT_SCHEMA",
    "MAX_WORKSPACE_POSITIONS",
    "MAX_WORKSPACE_TOP_K",
    "LoadedJacobianLensArtifact",
    "ModelWorkspaceProbe",
    "WorkspaceProbeError",
    "fit_jacobian_lens",
    "fit_jacobian_lens_v1",
    "load_jacobian_lens_artifact",
    "merge_jacobian_lens_v1_artifacts",
    "save_jacobian_lens_artifact",
    "sha256_file",
    "sha256_json",
]
