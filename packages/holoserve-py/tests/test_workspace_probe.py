# ruff: noqa: E402 - torch availability must be gated before model imports
import copy
import hashlib
import json
import math
from types import SimpleNamespace

import pytest

torch = pytest.importorskip("torch")

from holoserve.model import GPT
from holoserve.server import Handler, _workspace_request_id
from holoserve.workspace_eval import (
    GAP_PRIME,
    LEGACY_COMPARATOR_PROFILE,
    _bootstrap_delta,
    _legacy_union_top_k_jsd,
    _load_fresh_contract,
    _normalized_template_id,
    _paired_reliability,
    _validate_capability,
    _validate_fresh_evaluation_matrix,
    _validate_fresh_prompt_matrix,
    _validate_receipt,
    cohen_kappa,
    integer_mean_e8,
    roc_auc,
    threshold_at_fpr,
)
from holoserve.workspace_probe import (
    ALL_VALID_CURRENT_AND_FUTURE_POSITION_POLICY,
    ENDPOINT_SELF_POSITION_POLICY,
    JACOBIAN_LENS_ESTIMATOR_V1,
    JACOBIAN_LENS_ESTIMATOR_V2,
    JACOBIAN_LENS_ESTIMATOR_V3,
    JACOBIAN_LENS_ESTIMATOR_V4,
    JACOBIAN_LENS_V1_REFERENCE_COMMIT,
    JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256,
    JACOBIAN_LENS_S5_CONTROL_PROFILE_SHA256,
    JACOBIAN_LENS_S5_EXPERIMENT_PROFILE,
    JACOBIAN_LENS_S5_FIT_BINDING_SCHEMA,
    JACOBIAN_LENS_S5_FIT_RECEIPT_SCHEMA,
    JACOBIAN_LENS_S5_FORMULA,
    JACOBIAN_LENS_S5_FORMULA_SHA256,
    JACOBIAN_LENS_S5_TENSOR_DIGEST_SCHEMA,
    MODEL_WORKSPACE_CONTROL_PROFILE,
    MODEL_WORKSPACE_MEASUREMENT_PROFILE,
    MODEL_WORKSPACE_RECEIPT_SCHEMA,
    MODEL_WORKSPACE_SCORE_PROFILE,
    ModelWorkspaceProbe,
    WorkspaceProbeError,
    fit_jacobian_lens,
    fit_jacobian_lens_v1,
    fit_endpoint_affine_jacobian_lens_v1,
    fit_endpoint_local_taylor_jacobian_lens_v1,
    fit_endpoint_scalar_calibrated_jacobian_lens_v1,
    fit_endpoint_unscaled_centered_jacobian_lens_v1,
    jacobian_lens_s5_fit_receipt_fields,
    jacobian_lens_s5_tensor_sha256,
    jacobian_lens_v4_fit_binding_payload,
    jacobian_lens_v4_fit_receipt_fields,
    load_jacobian_lens_artifact,
    merge_jacobian_lens_v1_artifacts,
    save_jacobian_lens_artifact,
    sha256_file,
    sha256_json,
    _full_distribution_metrics,
    _largest_remainder_probability_e8,
)


TEST_S4_CONTROL_PROFILE_SHA256 = JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256
TEST_S5_FIT_SOURCE_SHA256S = {
    "research/2026-07-15-jspace-s5-unscaled-centered-preregistration.md": (
        f"sha256:{'6' * 64}"
    ),
    "scripts/research/select_jspace_s5_subset.py": f"sha256:{'7' * 64}",
}


def _write_test_v4_fit_receipt(artifact, lens_path, receipt_path):
    receipt = {
        "schema": "holoscript.jspace-s4-fit-receipt.v0.1.0",
        **jacobian_lens_v4_fit_receipt_fields(
            artifact,
            lens_sha256=sha256_file(lens_path),
        ),
        "fitSourceSha256s": {
            "research/2026-07-15-jspace-s4-centered-scalar-preregistration.md": (
                f"sha256:{'3' * 64}"
            )
        },
        "semanticLabelsAccessed": False,
        "selfHash": None,
    }
    receipt["selfHash"] = sha256_json(receipt)
    receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
    return receipt_path


def _write_test_s5_fit_receipt(artifact, lens_path, receipt_path):
    receipt = {
        "schema": JACOBIAN_LENS_S5_FIT_RECEIPT_SCHEMA,
        **jacobian_lens_s5_fit_receipt_fields(
            artifact,
            lens_sha256=sha256_file(lens_path),
        ),
        "semanticLabelsAccessed": False,
        "selfHash": None,
    }
    receipt["selfHash"] = sha256_json(receipt)
    receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
    return receipt_path


def tiny_model():
    torch.manual_seed(7)
    model = GPT(
        vocab_size=16,
        n_layer=2,
        n_head=2,
        n_embd=8,
        block_size=8,
        dropout=0.0,
    )
    model.eval()
    return model


def tiny_v1_model():
    torch.manual_seed(11)
    model = GPT(
        vocab_size=12,
        n_layer=3,
        n_head=1,
        n_embd=4,
        block_size=8,
        dropout=0.0,
    )
    model.eval()
    return model


class SyntheticEndpointModel(torch.nn.Module):
    """Minimal differentiable endpoint model with a known residual mapping."""

    def __init__(self, *, nonlinear: bool):
        super().__init__()
        self.nonlinear = nonlinear
        n_embd = 1 if nonlinear else 2
        self.blocks = torch.nn.ModuleList([torch.nn.Identity(), torch.nn.Identity()])
        self.pos = torch.nn.Embedding(4, n_embd)
        self.head = torch.nn.Linear(n_embd, 16, bias=False)
        self.lnf = torch.nn.Identity()
        self.register_buffer(
            "transform",
            torch.tensor([[2.0, -1.0], [0.5, 3.0]]) if not nonlinear else torch.eye(1),
        )
        self.register_buffer(
            "offset",
            torch.tensor([1.25, -2.0]) if not nonlinear else torch.zeros(1),
        )
        self.eval()

    def forward_with_residuals(self, token_ids):
        values = token_ids.to(dtype=self.head.weight.dtype)
        source = (
            values.unsqueeze(-1)
            if self.nonlinear
            else torch.stack((values, values * 0.5 + 1.0), dim=-1)
        ).requires_grad_(True)
        target = (
            source.square()
            if self.nonlinear
            else source @ self.transform.transpose(0, 1) + self.offset
        )
        return self.head(target), [source, target]


def brute_force_all_valid_current_and_future(model, token_ids, layers, *, skip_first):
    """Slow, explicit source-position baseline independent of v1 batching."""

    with torch.no_grad():
        _, residuals = model.forward_with_residuals(token_ids)
    sequence_length = int(token_ids.size(1))
    valid_positions = list(range(skip_first, sequence_length - 1))
    expected = {}

    for layer in layers:
        total = torch.zeros((model.head.in_features, model.head.in_features))
        base = residuals[layer].detach()
        for source_position in valid_positions:
            source = base[0, source_position].detach().clone().requires_grad_(True)
            mask = torch.zeros(
                (1, sequence_length, 1),
                dtype=base.dtype,
                device=base.device,
            )
            mask[:, source_position, :] = 1

            def sum_valid_targets(source_value):
                sequence = base * (1 - mask) + source_value.view(1, 1, -1) * mask
                final_residual = model.forward_from_residual(
                    sequence,
                    layer + 1,
                    normalize=False,
                )
                return final_residual[0, valid_positions].sum(dim=0)

            total += (
                torch.autograd.functional.jacobian(
                    sum_valid_targets,
                    source,
                    create_graph=False,
                    strict=False,
                    vectorize=False,
                )
                .detach()
                .cpu()
            )
        expected[layer] = total / len(valid_positions)
    return expected


def brute_force_endpoint_transport(model, prompts, layers, position_bins):
    """Independent endpoint Jacobian and bin-wise affine-anchor baseline."""

    grouped = {index: [] for index in range(len(position_bins))}
    for token_ids in prompts:
        with torch.no_grad():
            _, residuals = model.forward_with_residuals(token_ids)
        position = int(token_ids.size(1)) - 1
        bin_index = next(
            index
            for index, (start, end) in enumerate(position_bins)
            if start <= position <= end
        )
        row = {"target": residuals[-1][0, -1].detach().cpu(), "sources": {}, "jacobians": {}}
        for layer in layers:
            base = residuals[layer].detach()
            source = base[0, -1].detach().clone().requires_grad_(True)
            mask = torch.zeros((1, token_ids.size(1), 1), dtype=base.dtype)
            mask[:, -1, :] = 1

            def endpoint(source_value):
                sequence = base * (1 - mask) + source_value.view(1, 1, -1) * mask
                return model.forward_from_residual(sequence, layer + 1, normalize=False)[0, -1]

            row["sources"][layer] = source.detach().cpu()
            row["jacobians"][layer] = torch.autograd.functional.jacobian(
                endpoint,
                source,
                create_graph=False,
                strict=False,
                vectorize=False,
            ).detach().cpu()
        grouped[bin_index].append(row)

    matrices = []
    biases = []
    source_means = []
    target_means = []
    for bin_index in range(len(position_bins)):
        rows = grouped[bin_index]
        target_mean = torch.stack([row["target"] for row in rows]).mean(0)
        bin_matrices = []
        bin_biases = []
        bin_source_means = []
        bin_target_means = []
        for layer in layers:
            matrix = torch.stack([row["jacobians"][layer] for row in rows]).mean(0)
            source_mean = torch.stack([row["sources"][layer] for row in rows]).mean(0)
            bin_matrices.append(matrix)
            bin_biases.append(target_mean - matrix @ source_mean)
            bin_source_means.append(source_mean)
            bin_target_means.append(target_mean)
        matrices.append(torch.stack(bin_matrices))
        biases.append(torch.stack(bin_biases))
        source_means.append(torch.stack(bin_source_means))
        target_means.append(torch.stack(bin_target_means))
    return (
        torch.stack(matrices),
        torch.stack(biases),
        torch.stack(source_means),
        torch.stack(target_means),
    )


def fitted_probe(tmp_path):
    model = tiny_model()
    checkpoint_hash = f"sha256:{'1' * 64}"
    tokenizer_hash = f"sha256:{'2' * 64}"
    artifact = fit_jacobian_lens(
        model,
        [torch.tensor([[1, 3, 4], [1, 5, 6]], dtype=torch.long)],
        layers=[0, 1],
        position_pairs=[(1, 1), (1, 2)],
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        calibration_corpus_sha256=f"sha256:{'3' * 64}",
    )
    path = tmp_path / "tiny-jacobian-lens.pt"
    save_jacobian_lens_artifact(artifact, path)
    loaded = load_jacobian_lens_artifact(
        path,
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        model=model,
    )
    token_bytes = [None, None, None] + [bytes([97 + index]) for index in range(13)]
    return model, ModelWorkspaceProbe(model, loaded, token_bytes, "holorunner-s0"), path


def test_forward_with_residuals_preserves_ordinary_logits():
    model = tiny_model()
    ids = torch.tensor([[1, 3, 4]], dtype=torch.long)
    logits, loss = model(ids)
    observed_logits, residuals = model.forward_with_residuals(ids)

    assert loss is None
    assert torch.equal(logits, observed_logits)
    assert len(residuals) == 2
    assert all(tuple(residual.shape) == (1, 3, 8) for residual in residuals)


def test_v1_batched_all_future_estimator_matches_brute_force(tmp_path):
    model = tiny_v1_model()
    token_ids = torch.tensor([[1, 3, 4, 5, 6, 7]], dtype=torch.long)
    truncated_ids = token_ids[:, :5]
    expected = brute_force_all_valid_current_and_future(
        model,
        truncated_ids,
        [0, 1],
        skip_first=1,
    )

    artifact = fit_jacobian_lens_v1(
        model,
        [token_ids],
        layers=[0, 1],
        checkpoint_sha256=f"sha256:{'1' * 64}",
        tokenizer_sha256=f"sha256:{'2' * 64}",
        dim_batch=2,
        max_seq_len=5,
        skip_first=1,
    )

    assert artifact["estimator"]["name"] == JACOBIAN_LENS_ESTIMATOR_V1
    assert artifact["estimator"]["paperParity"] is True
    assert artifact["estimator"]["parityScope"] == "reference-estimator-only"
    assert artifact["estimator"]["paperExperimentParity"] is False
    assert artifact["estimator"]["vectorization"] == ("batched-output-cotangents-retained-graph")
    assert artifact["estimator"]["reference"] == {
        "repository": "https://github.com/anthropics/jacobian-lens",
        "commit": JACOBIAN_LENS_V1_REFERENCE_COMMIT,
        "license": "Apache-2.0",
    }
    sequence_sha256 = sha256_json([1, 3, 4, 5, 6])
    corpus_sha256 = sha256_json([sequence_sha256])
    assert artifact["calibration"] == {
        "corpusSha256": corpus_sha256,
        "jacobianCount": 1,
        "sequenceCount": 1,
        "tokenCount": 5,
        "positionPolicy": ALL_VALID_CURRENT_AND_FUTURE_POSITION_POLICY,
        "dimBatch": 2,
        "maxSeqLen": 5,
        "skipFirst": 1,
        "validPositionCount": 3,
        "promptTruncationPolicy": "right-truncate-token-ids-to-max-seq-len",
        "corpusCanonicalization": "ordered-post-truncation-sequence-sha256-v1",
        "sequenceSha256s": [sequence_sha256],
        "sequenceTokenCounts": [5],
        "shardSha256": sha256_json(
            {
                "sequenceSha256s": [sequence_sha256],
                "sequenceTokenCounts": [5],
            }
        ),
    }
    for index, layer in enumerate(artifact["layers"]):
        torch.testing.assert_close(
            artifact["matrices"][index],
            expected[layer],
            rtol=0,
            atol=1e-4,
        )
    assert all(parameter.grad is None for parameter in model.parameters())

    path = tmp_path / "tiny-jacobian-lens-v1.pt"
    save_jacobian_lens_artifact(artifact, path)
    loaded = load_jacobian_lens_artifact(
        path,
        checkpoint_sha256=f"sha256:{'1' * 64}",
        tokenizer_sha256=f"sha256:{'2' * 64}",
        model=model,
    )
    capability = ModelWorkspaceProbe(model, loaded, [None] * 12, "holorunner-s0").capability()
    assert capability["estimator"] == JACOBIAN_LENS_ESTIMATOR_V1
    assert capability["paperParity"] is True
    assert capability["parityScope"] == "reference-estimator-only"
    assert capability["paperExperimentParity"] is False


def test_v1_estimator_handles_a_partial_final_dimension_batch():
    model = tiny_v1_model()
    token_ids = torch.tensor([[1, 3, 4, 5, 6]], dtype=torch.long)
    expected = brute_force_all_valid_current_and_future(
        model,
        token_ids,
        [0],
        skip_first=1,
    )

    artifact = fit_jacobian_lens_v1(
        model,
        [token_ids],
        layers=[0],
        checkpoint_sha256=f"sha256:{'1' * 64}",
        tokenizer_sha256=f"sha256:{'2' * 64}",
        dim_batch=3,
        max_seq_len=5,
        skip_first=1,
    )

    torch.testing.assert_close(artifact["matrices"][0], expected[0], rtol=0, atol=1e-4)


def test_endpoint_affine_estimator_matches_brute_force_and_binds_bins(tmp_path):
    model = tiny_v1_model()
    prompts = [
        torch.tensor([[1, 3, 4]], dtype=torch.long),
        torch.tensor([[1, 5, 6, 7, 8]], dtype=torch.long),
    ]
    position_bins = [(0, 3), (4, 7)]
    expected = brute_force_endpoint_transport(model, prompts, [0, 1], position_bins)
    artifact = fit_endpoint_affine_jacobian_lens_v1(
        model,
        prompts,
        layers=[0, 1],
        checkpoint_sha256=f"sha256:{'1' * 64}",
        tokenizer_sha256=f"sha256:{'2' * 64}",
        dim_batch=3,
        max_seq_len=8,
        position_bins=position_bins,
    )

    assert artifact["estimator"] == {
        "name": JACOBIAN_LENS_ESTIMATOR_V2,
        "paperParity": False,
        "vectorization": "batched-endpoint-output-cotangents-retained-graph",
        "transportProfile": "mean-anchored-affine-final-residual-v1",
        "anchor": "binwise-target-mean-minus-jacobian-source-mean",
    }
    assert artifact["calibration"]["positionPolicy"] == ENDPOINT_SELF_POSITION_POLICY
    assert artifact["calibration"]["positionBins"] == [[0, 3], [4, 7]]
    assert artifact["calibration"]["positionBinCounts"] == [1, 1]
    assert artifact["calibration"]["promptTruncationPolicy"] == "reject-over-max-seq-len"
    assert "jacobianSourceProductMeans" not in artifact
    for actual, wanted in zip(
        (
            artifact["matrices"],
            artifact["biases"],
            artifact["sourceMeans"],
            artifact["targetMeans"],
        ),
        expected,
        strict=True,
    ):
        torch.testing.assert_close(actual, wanted, rtol=0, atol=1e-4)
    assert all(parameter.grad is None for parameter in model.parameters())

    path = tmp_path / "endpoint-affine.pt"
    save_jacobian_lens_artifact(artifact, path)
    loaded = load_jacobian_lens_artifact(
        path,
        checkpoint_sha256=f"sha256:{'1' * 64}",
        tokenizer_sha256=f"sha256:{'2' * 64}",
        model=model,
    )
    probe = ModelWorkspaceProbe(model, loaded, [None] * 12, "holorunner-s0")
    assert probe.capability() == {
        "schema": "holoscript.model-workspace-capability.v0.2.0",
        "observe": True,
        "intervention": False,
        "method": "jacobian_lens",
        "estimator": JACOBIAN_LENS_ESTIMATOR_V2,
        "paperParity": False,
        "measurementProfile": MODEL_WORKSPACE_MEASUREMENT_PROFILE,
        "controlProfile": MODEL_WORKSPACE_CONTROL_PROFILE,
        "layers": [0, 1],
        "lensSha256": loaded.lens_sha256,
        "transportProfile": "mean-anchored-affine-final-residual-v1",
        "positionPolicy": ENDPOINT_SELF_POSITION_POLICY,
        "positionBins": [[0, 3], [4, 7]],
    }
    prompt_text = "endpoint test"
    receipt = probe.observe(
        prompts[0],
        prompt_sha256=f"sha256:{hashlib.sha256(prompt_text.encode()).hexdigest()}",
        requested_model="holorunner-s0",
        request_id="workspace-endpoint-test",
        layers=[0],
        positions=[-1],
        k=3,
        created_at="2026-07-14T00:00:00.000Z",
    )
    assert receipt["lens"]["transportProfile"] == "mean-anchored-affine-final-residual-v1"
    assert receipt["lens"]["positionBins"] == [[0, 3], [4, 7]]
    binding = {
        "alias": "a",
        "modelId": "holorunner-s0",
        "lensSha256": loaded.lens_sha256,
    }
    capability = probe.capability()
    health = {
        "backend": "pytorch-holo",
        "model_workspace_probe": {
            "schema": capability["schema"],
            "observe": True,
            "intervention": False,
            "models": {"holorunner-s0": capability},
        },
    }
    validated_capability = _validate_capability(health, binding, [0])
    extracted = _validate_receipt(
        receipt,
        prompt=prompt_text,
        binding=binding,
        checkpoint_sha256=f"sha256:{'1' * 64}",
        tokenizer_sha256=f"sha256:{'2' * 64}",
        layers=[0],
        positions=[-1],
        k=3,
        allow_truncated=False,
        capability=validated_capability,
    )
    assert isinstance(extracted["lensGainE8"], int)
    with pytest.raises(WorkspaceProbeError) as error:
        probe.observe(
            prompts[0],
            prompt_sha256=f"sha256:{'4' * 64}",
            requested_model="holorunner-s0",
            request_id="workspace-endpoint-invalid-position",
            positions=[0],
            k=3,
        )
    assert error.value.code == "lens_position_unavailable"


def test_endpoint_affine_estimator_rejects_uncovered_bins_and_tampered_anchor(tmp_path):
    model = tiny_v1_model()
    kwargs = {
        "layers": [0],
        "checkpoint_sha256": f"sha256:{'1' * 64}",
        "tokenizer_sha256": f"sha256:{'2' * 64}",
        "dim_batch": 2,
        "max_seq_len": 8,
        "position_bins": [(0, 3), (4, 7)],
    }
    with pytest.raises(WorkspaceProbeError) as empty:
        fit_endpoint_affine_jacobian_lens_v1(
            model,
            [torch.tensor([[1, 3, 4]], dtype=torch.long)],
            **kwargs,
        )
    assert empty.value.code == "empty_position_bin"

    artifact = fit_endpoint_affine_jacobian_lens_v1(
        model,
        [
            torch.tensor([[1, 3, 4]], dtype=torch.long),
            torch.tensor([[1, 5, 6, 7, 8]], dtype=torch.long),
        ],
        **kwargs,
    )
    artifact["biases"][0, 0, 0] += 1
    path = tmp_path / "tampered-endpoint-affine.pt"
    torch.save(artifact, path)
    with pytest.raises(WorkspaceProbeError) as tampered:
        load_jacobian_lens_artifact(
            path,
            checkpoint_sha256=f"sha256:{'1' * 64}",
            tokenizer_sha256=f"sha256:{'2' * 64}",
            model=model,
        )
    assert tampered.value.code == "invalid_lens_anchor"


def test_endpoint_local_taylor_intercept_uses_mean_per_sample_remainder(tmp_path):
    model = SyntheticEndpointModel(nonlinear=True)
    checkpoint_hash = f"sha256:{'1' * 64}"
    tokenizer_hash = f"sha256:{'2' * 64}"
    prompts = [
        torch.tensor([[1]], dtype=torch.long),
        torch.tensor([[3]], dtype=torch.long),
    ]
    artifact = fit_endpoint_local_taylor_jacobian_lens_v1(
        model,
        prompts,
        layers=[0],
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        dim_batch=1,
        max_seq_len=4,
        position_bins=[(0, 3)],
    )

    assert artifact["estimator"] == {
        "name": JACOBIAN_LENS_ESTIMATOR_V3,
        "paperParity": False,
        "vectorization": "batched-endpoint-output-cotangents-retained-graph",
        "transportProfile": "local-taylor-affine-final-residual-v1",
        "anchor": "binwise-mean-target-minus-mean-per-sample-jacobian-source-product",
    }
    torch.testing.assert_close(artifact["matrices"][0, 0], torch.tensor([[4.0]]))
    torch.testing.assert_close(artifact["sourceMeans"][0, 0], torch.tensor([2.0]))
    torch.testing.assert_close(artifact["targetMeans"][0, 0], torch.tensor([5.0]))
    torch.testing.assert_close(
        artifact["jacobianSourceProductMeans"][0, 0], torch.tensor([10.0])
    )
    torch.testing.assert_close(artifact["biases"][0, 0], torch.tensor([-5.0]))
    mean_anchored_bias = artifact["targetMeans"][0, 0] - (
        artifact["matrices"][0, 0] @ artifact["sourceMeans"][0, 0]
    )
    torch.testing.assert_close(mean_anchored_bias, torch.tensor([-3.0]))
    assert not torch.allclose(artifact["biases"][0, 0], mean_anchored_bias)

    path = tmp_path / "endpoint-local-taylor.pt"
    save_jacobian_lens_artifact(artifact, path)
    loaded = load_jacobian_lens_artifact(
        path,
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        model=model,
    )
    with pytest.raises(WorkspaceProbeError) as confused_fit_receipt:
        load_jacobian_lens_artifact(
            path,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            model=model,
            fit_receipt_path=tmp_path / "not-valid-for-local-taylor.json",
        )
    assert confused_fit_receipt.value.code == "invalid_lens_fit_receipt"
    probe = ModelWorkspaceProbe(model, loaded, [None] * 16, "synthetic-endpoint")
    capability = probe.capability()
    assert capability["estimator"] == JACOBIAN_LENS_ESTIMATOR_V3
    assert capability["transportProfile"] == "local-taylor-affine-final-residual-v1"

    prompt = "x"
    receipt = probe.observe(
        prompts[0],
        prompt_sha256=f"sha256:{hashlib.sha256(prompt.encode()).hexdigest()}",
        requested_model="synthetic-endpoint",
        request_id="workspace-local-taylor-test",
        layers=[0],
        positions=[-1],
        k=3,
        created_at="2026-07-14T00:00:00.000Z",
    )
    binding = {
        "alias": "a",
        "modelId": "synthetic-endpoint",
        "lensSha256": loaded.lens_sha256,
    }
    health = {
        "backend": "pytorch-holo",
        "model_workspace_probe": {
            "schema": capability["schema"],
            "observe": True,
            "intervention": False,
            "models": {"synthetic-endpoint": capability},
        },
    }
    validated_capability = _validate_capability(health, binding, [0])
    extracted = _validate_receipt(
        receipt,
        prompt=prompt,
        binding=binding,
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        layers=[0],
        positions=[-1],
        k=3,
        allow_truncated=False,
        capability=validated_capability,
    )
    assert isinstance(extracted["lensGainE8"], int)

    artifact["estimator"] = {**artifact["estimator"], "anchor": "mean-anchor"}
    tampered_metadata_path = tmp_path / "tampered-local-taylor-metadata.pt"
    torch.save(artifact, tampered_metadata_path)
    with pytest.raises(WorkspaceProbeError) as tampered_metadata:
        load_jacobian_lens_artifact(
            tampered_metadata_path,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            model=model,
        )
    assert tampered_metadata.value.code == "invalid_lens_estimator"

    artifact["estimator"]["anchor"] = (
        "binwise-mean-target-minus-mean-per-sample-jacobian-source-product"
    )
    artifact.pop("jacobianSourceProductMeans")
    tampered_path = tmp_path / "missing-local-taylor-products.pt"
    torch.save(artifact, tampered_path)
    with pytest.raises(WorkspaceProbeError) as missing_products:
        load_jacobian_lens_artifact(
            tampered_path,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            model=model,
        )
    assert missing_products.value.code == "invalid_lens_shape"


def test_endpoint_scalar_calibration_is_centered_private_and_fail_closed(tmp_path):
    model = SyntheticEndpointModel(nonlinear=True)
    checkpoint_hash = f"sha256:{'1' * 64}"
    tokenizer_hash = f"sha256:{'2' * 64}"
    prompts = [
        torch.tensor([[1]], dtype=torch.long),
        torch.tensor([[3]], dtype=torch.long),
    ]
    artifact = fit_endpoint_scalar_calibrated_jacobian_lens_v1(
        model,
        prompts,
        layers=[0],
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        control_profile_sha256=TEST_S4_CONTROL_PROFILE_SHA256,
        dim_batch=1,
        max_seq_len=4,
        position_bins=[(0, 3)],
    )

    assert artifact["estimator"] == {
        "name": JACOBIAN_LENS_ESTIMATOR_V4,
        "paperParity": False,
        "vectorization": "batched-endpoint-output-cotangents-retained-graph",
        "transportProfile": "mean-centered-scalar-jacobian-final-residual-v1",
        "anchor": "binwise-target-mean-minus-scaled-mean-jacobian-source-mean",
        "scalarCalibration": "binwise-mean-centered-multiplicative-shrink-clipped-v1",
        "ridgeFraction": 0.001,
        "clipBounds": [0.0, 2.0],
        "scalarIdentityControl": "binwise-mean-centered-scalar-identity-v1",
    }
    torch.testing.assert_close(artifact["matrices"][0, 0], torch.tensor([[4.0]]))
    torch.testing.assert_close(artifact["sourceMeans"][0, 0], torch.tensor([2.0]))
    torch.testing.assert_close(artifact["targetMeans"][0, 0], torch.tensor([5.0]))
    torch.testing.assert_close(
        artifact["jacobianSourceProductMeans"][0, 0], torch.tensor([10.0])
    )
    assert artifact["centeredJacobianEnergyMeans"].dtype == torch.float64
    assert artifact["centeredJacobianTargetCrossMeans"].dtype == torch.float64
    assert artifact["centeredIdentityEnergyMeans"].dtype == torch.float64
    assert artifact["centeredIdentityTargetCrossMeans"].dtype == torch.float64
    torch.testing.assert_close(
        artifact["centeredJacobianEnergyMeans"], torch.tensor([[16.0]], dtype=torch.float64)
    )
    torch.testing.assert_close(
        artifact["centeredJacobianTargetCrossMeans"],
        torch.tensor([[16.0]], dtype=torch.float64),
    )
    torch.testing.assert_close(
        artifact["centeredIdentityEnergyMeans"],
        torch.tensor([[1.0]], dtype=torch.float64),
    )
    torch.testing.assert_close(
        artifact["centeredIdentityTargetCrossMeans"],
        torch.tensor([[4.0]], dtype=torch.float64),
    )
    assert all(key not in artifact for key in ("alpha", "beta", "scalars"))

    alpha = 1.0 / 1.001
    expected_matrix = torch.tensor([[4.0 * alpha]], dtype=torch.float32)
    expected_bias = torch.tensor([5.0 - 8.0 * alpha], dtype=torch.float32)
    torch.testing.assert_close(artifact["biases"][0, 0], expected_bias)

    path = tmp_path / "endpoint-scalar.pt"
    save_jacobian_lens_artifact(artifact, path)
    with pytest.raises(WorkspaceProbeError) as missing_fit_receipt:
        load_jacobian_lens_artifact(
            path,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            model=model,
        )
    assert missing_fit_receipt.value.code == "missing_lens_fit_receipt"
    fit_receipt_path = _write_test_v4_fit_receipt(
        artifact,
        path,
        tmp_path / "endpoint-scalar-fit-receipt.json",
    )
    for receipt_tamper in ("lensSha256", "scalarStatisticsSha256", "alphaRaw"):
        tampered_receipt = json.loads(fit_receipt_path.read_text(encoding="utf-8"))
        tampered_receipt[receipt_tamper] = (
            1 if receipt_tamper == "alphaRaw" else f"sha256:{'f' * 64}"
        )
        tampered_receipt["selfHash"] = sha256_json(
            {**tampered_receipt, "selfHash": None}
        )
        tampered_receipt_path = tmp_path / f"tampered-fit-{receipt_tamper}.json"
        tampered_receipt_path.write_text(
            json.dumps(tampered_receipt), encoding="utf-8"
        )
        with pytest.raises(WorkspaceProbeError) as tampered_fit_receipt:
            load_jacobian_lens_artifact(
                path,
                checkpoint_sha256=checkpoint_hash,
                tokenizer_sha256=tokenizer_hash,
                model=model,
                fit_receipt_path=tampered_receipt_path,
            )
        assert tampered_fit_receipt.value.code == "invalid_lens_fit_receipt"
    invalid_source_receipt = json.loads(fit_receipt_path.read_text(encoding="utf-8"))
    invalid_source_receipt["fitSourceSha256s"] = {
        "research/2026-07-15-jspace-s4-centered-scalar-preregistration.md": 1
    }
    invalid_source_receipt["selfHash"] = sha256_json(
        {**invalid_source_receipt, "selfHash": None}
    )
    invalid_source_receipt_path = tmp_path / "invalid-fit-source-digest.json"
    invalid_source_receipt_path.write_text(
        json.dumps(invalid_source_receipt), encoding="utf-8"
    )
    with pytest.raises(WorkspaceProbeError) as invalid_source_digest:
        load_jacobian_lens_artifact(
            path,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            model=model,
            fit_receipt_path=invalid_source_receipt_path,
        )
    assert invalid_source_digest.value.code == "invalid_lens_fit_receipt"
    loaded = load_jacobian_lens_artifact(
        path,
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        model=model,
        fit_receipt_path=fit_receipt_path,
    )
    torch.testing.assert_close(loaded.matrices[0][0], expected_matrix)
    torch.testing.assert_close(loaded.biases[0][0], expected_bias)
    assert loaded.control_matrices is not None
    assert loaded.control_biases is not None
    assert loaded.control_scalars is not None
    torch.testing.assert_close(
        loaded.control_matrices["unscaledCentered"][0][0], torch.tensor([[4.0]])
    )
    torch.testing.assert_close(
        loaded.control_biases["localTaylor"][0][0], torch.tensor([-5.0])
    )
    torch.testing.assert_close(
        loaded.control_scalars["scalarIdentity"][0][0], torch.tensor(2.0)
    )

    probe = ModelWorkspaceProbe(model, loaded, [None] * 16, "synthetic-scalar")
    capability = probe.capability()
    assert capability["estimator"] == JACOBIAN_LENS_ESTIMATOR_V4
    assert (
        capability["transportProfile"]
        == "mean-centered-scalar-jacobian-final-residual-v1"
    )
    assert not any(
        key in capability
        for key in ("alpha", "beta", "matrices", "centeredJacobianEnergyMeans")
    )
    prompt = "scalar x"
    receipt = probe.observe(
        prompts[0],
        prompt_sha256=f"sha256:{hashlib.sha256(prompt.encode()).hexdigest()}",
        requested_model="synthetic-scalar",
        request_id="workspace-scalar-test",
        layers=[0],
        positions=[-1],
        k=3,
        created_at="2026-07-14T00:00:00.000Z",
    )
    controls = receipt["observation"]["layers"][0]["transportControlMetrics"]
    assert set(controls) == {"unscaledCentered", "localTaylor", "scalarIdentity"}
    receipt_text = json.dumps(receipt, sort_keys=True)
    assert '"alpha"' not in receipt_text
    assert '"beta"' not in receipt_text
    binding = {
        "alias": "a",
        "modelId": "synthetic-scalar",
        "lensSha256": loaded.lens_sha256,
    }
    health = {
        "backend": "pytorch-holo",
        "model_workspace_probe": {
            "schema": capability["schema"],
            "observe": True,
            "intervention": False,
            "models": {"synthetic-scalar": capability},
        },
    }
    validated_capability = _validate_capability(health, binding, [0])
    for private_field in (
        "alphaRaw",
        "calibrationAlpha",
        "betaRaw",
        "fitScalars",
        "S",
        "C",
        "S_I",
        "C_I",
        "Jbar",
        "xbar",
        "ybar",
        "M",
        "b",
        "scalarIdentity",
    ):
        leaked_health = copy.deepcopy(health)
        leaked_health["model_workspace_probe"]["models"]["synthetic-scalar"][
            private_field
        ] = 99_900_100
        with pytest.raises(ValueError, match="capability mismatch"):
            _validate_capability(leaked_health, binding, [0])
    extracted = _validate_receipt(
        receipt,
        prompt=prompt,
        binding=binding,
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        layers=[0],
        positions=[-1],
        k=3,
        allow_truncated=False,
        capability=validated_capability,
    )
    assert set(extracted["coordinates"][0]["transportControlMetrics"]) == {
        "unscaledCentered",
        "localTaylor",
        "scalarIdentity",
    }
    for private_field in (
        "alphaRaw",
        "calibrationAlpha",
        "betaRaw",
        "fitScalars",
        "S",
        "C",
        "S_I",
        "C_I",
        "Jbar",
        "xbar",
        "ybar",
        "M",
        "b",
        "scalarIdentity",
    ):
        leaked_receipt = copy.deepcopy(receipt)
        leaked_receipt["lens"][private_field] = 99_900_100
        leaked_receipt["receiptHash"] = sha256_json(
            {**leaked_receipt, "receiptHash": None}
        )
        with pytest.raises(ValueError):
            _validate_receipt(
                leaked_receipt,
                prompt=prompt,
                binding=binding,
                checkpoint_sha256=checkpoint_hash,
                tokenizer_sha256=tokenizer_hash,
                layers=[0],
                positions=[-1],
                k=3,
                allow_truncated=False,
                capability=validated_capability,
            )
    missing_controls = copy.deepcopy(receipt)
    missing_controls["observation"]["layers"][0].pop("transportControlMetrics")
    missing_controls["observationSha256"] = sha256_json(
        missing_controls["observation"]
    )
    missing_controls["receiptHash"] = sha256_json(
        {**missing_controls, "receiptHash": None}
    )
    with pytest.raises(ValueError):
        _validate_receipt(
            missing_controls,
            prompt=prompt,
            binding=binding,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            layers=[0],
            positions=[-1],
            k=3,
            allow_truncated=False,
            capability=validated_capability,
        )

    tamper_cases = []
    missing = copy.deepcopy(artifact)
    missing.pop("centeredJacobianEnergyMeans")
    tamper_cases.append(("missing", missing, "invalid_lens_shape"))
    wrong_dtype = copy.deepcopy(artifact)
    wrong_dtype["centeredJacobianEnergyMeans"] = wrong_dtype[
        "centeredJacobianEnergyMeans"
    ].float()
    tamper_cases.append(("dtype", wrong_dtype, "invalid_lens_shape"))
    zero_energy = copy.deepcopy(artifact)
    zero_energy["centeredJacobianEnergyMeans"].zero_()
    zero_energy["fitBinding"] = jacobian_lens_v4_fit_binding_payload(
        zero_energy,
        control_profile_sha256=TEST_S4_CONTROL_PROFILE_SHA256,
    )
    tamper_cases.append(("zero", zero_energy, "degenerate_scalar_calibration"))
    leaked_scalar = copy.deepcopy(artifact)
    leaked_scalar["alpha"] = torch.tensor([[alpha]], dtype=torch.float64)
    tamper_cases.append(("alpha", leaked_scalar, "invalid_lens_shape"))
    leaked_raw_scalar = copy.deepcopy(artifact)
    leaked_raw_scalar["alphaRaw"] = torch.tensor([[alpha]], dtype=torch.float64)
    tamper_cases.append(("alpha-raw", leaked_raw_scalar, "invalid_lens_shape"))
    substituted_control_profile = copy.deepcopy(artifact)
    substituted_control_profile["fitBinding"]["controlProfileSha256"] = (
        f"sha256:{'f' * 64}"
    )
    tamper_cases.append(
        (
            "control-profile-substitution",
            substituted_control_profile,
            "invalid_lens_fit_binding",
        )
    )
    for field in (
        "matrices",
        "biases",
        "sourceMeans",
        "targetMeans",
        "jacobianSourceProductMeans",
    ):
        wrong_serving_dtype = copy.deepcopy(artifact)
        wrong_serving_dtype[field] = wrong_serving_dtype[field].double()
        tamper_cases.append(
            (f"{field}-dtype", wrong_serving_dtype, "invalid_lens_shape")
        )
    overflowing_alpha = copy.deepcopy(artifact)
    overflowing_alpha["centeredJacobianEnergyMeans"].fill_(
        torch.finfo(torch.float64).tiny
    )
    overflowing_alpha["fitBinding"] = jacobian_lens_v4_fit_binding_payload(
        overflowing_alpha,
        control_profile_sha256=TEST_S4_CONTROL_PROFILE_SHA256,
    )
    tamper_cases.append(
        ("alpha-overflow", overflowing_alpha, "invalid_scalar_calibration")
    )
    overflowing_beta = copy.deepcopy(artifact)
    overflowing_beta["centeredIdentityEnergyMeans"].fill_(
        torch.finfo(torch.float64).tiny / 2
    )
    overflowing_beta["fitBinding"] = jacobian_lens_v4_fit_binding_payload(
        overflowing_beta,
        control_profile_sha256=TEST_S4_CONTROL_PROFILE_SHA256,
    )
    tamper_cases.append(
        ("beta-overflow", overflowing_beta, "invalid_scalar_calibration")
    )
    wrong_bias = copy.deepcopy(artifact)
    wrong_bias["biases"][0, 0, 0] += 1
    tamper_cases.append(("bias", wrong_bias, "invalid_lens_anchor"))
    bool_clip_bound = copy.deepcopy(artifact)
    bool_clip_bound["estimator"]["clipBounds"] = [False, 2.0]
    tamper_cases.append(("bool-clip-bound", bool_clip_bound, "invalid_lens_estimator"))
    for name, tampered, expected_code in tamper_cases:
        tampered_path = tmp_path / f"tampered-scalar-{name}.pt"
        torch.save(tampered, tampered_path)
        try:
            load_jacobian_lens_artifact(
                tampered_path,
                checkpoint_sha256=checkpoint_hash,
                tokenizer_sha256=tokenizer_hash,
                model=model,
                fit_receipt_path=fit_receipt_path,
            )
        except WorkspaceProbeError as error:
            assert error.code == expected_code, name
        else:
            pytest.fail(f"tampered scalar artifact was accepted: {name}")

    with pytest.raises(WorkspaceProbeError) as degenerate:
        fit_endpoint_scalar_calibrated_jacobian_lens_v1(
            model,
            [prompts[0]],
            layers=[0],
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            control_profile_sha256=TEST_S4_CONTROL_PROFILE_SHA256,
            dim_batch=1,
            max_seq_len=4,
            position_bins=[(0, 3)],
        )
    assert degenerate.value.code == "degenerate_scalar_calibration"


def test_s5_unscaled_transport_is_receipt_bound_and_receipt_confusion_fails(tmp_path):
    model = SyntheticEndpointModel(nonlinear=True)
    checkpoint_hash = f"sha256:{'1' * 64}"
    tokenizer_hash = f"sha256:{'2' * 64}"
    source_hash = f"sha256:{'3' * 64}"
    preregistration_hash = f"sha256:{'4' * 64}"
    selector_hash = f"sha256:{'5' * 64}"
    prompts = [
        torch.tensor([[1]], dtype=torch.long),
        torch.tensor([[3]], dtype=torch.long),
    ]
    artifact = fit_endpoint_unscaled_centered_jacobian_lens_v1(
        model,
        prompts,
        layers=[0],
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        source_artifact_sha256=source_hash,
        preregistration_sha256=preregistration_hash,
        selector_sha256=selector_hash,
        fit_source_sha256s=TEST_S5_FIT_SOURCE_SHA256S,
        dim_batch=1,
        max_seq_len=4,
        position_bins=[(0, 3)],
    )

    assert artifact["estimator"] == {
        "name": JACOBIAN_LENS_ESTIMATOR_V2,
        "paperParity": False,
        "vectorization": "batched-endpoint-output-cotangents-retained-graph",
        "transportProfile": "mean-anchored-affine-final-residual-v1",
        "anchor": "binwise-target-mean-minus-jacobian-source-mean",
    }
    binding = artifact["fitBinding"]
    assert set(binding) == {
        "schema",
        "experimentProfile",
        "estimator",
        "transportProfile",
        "formulaSha256",
        "controlProfileSha256",
        "checkpointSha256",
        "tokenizerSha256",
        "sourceArtifactSha256",
        "calibrationCorpusSha256",
        "calibrationShardSha256",
        "sampleCount",
        "positionBinCounts",
        "sequenceOrderSha256",
        "sequenceSetSha256",
        "tensorDigestSchema",
        "tensorSha256",
        "layers",
        "positionBins",
        "preregistrationSha256",
        "selectorSha256",
        "fitSourceSha256s",
    }
    assert binding["schema"] == JACOBIAN_LENS_S5_FIT_BINDING_SCHEMA
    assert binding["experimentProfile"] == JACOBIAN_LENS_S5_EXPERIMENT_PROFILE
    assert binding["formulaSha256"] == JACOBIAN_LENS_S5_FORMULA_SHA256
    assert binding["controlProfileSha256"] == JACOBIAN_LENS_S5_CONTROL_PROFILE_SHA256
    assert JACOBIAN_LENS_S5_CONTROL_PROFILE_SHA256 != JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256
    assert binding["tensorDigestSchema"] == JACOBIAN_LENS_S5_TENSOR_DIGEST_SCHEMA
    assert binding["tensorSha256"] == jacobian_lens_s5_tensor_sha256(artifact)
    assert binding["sourceArtifactSha256"] == source_hash
    assert binding["preregistrationSha256"] == preregistration_hash
    assert binding["selectorSha256"] == selector_hash
    assert binding["fitSourceSha256s"] == TEST_S5_FIT_SOURCE_SHA256S
    assert (
        f"sha256:{hashlib.sha256(JACOBIAN_LENS_S5_FORMULA.encode('utf-8')).hexdigest()}"
        == JACOBIAN_LENS_S5_FORMULA_SHA256
    )
    torch.testing.assert_close(artifact["matrices"][0, 0], torch.tensor([[4.0]]))
    torch.testing.assert_close(artifact["biases"][0, 0], torch.tensor([-3.0]))
    assert artifact["jacobianSourceProductMeans"].dtype == torch.float32
    assert all(
        artifact[name].dtype == torch.float64
        for name in (
            "centeredJacobianEnergyMeans",
            "centeredJacobianTargetCrossMeans",
            "centeredIdentityEnergyMeans",
            "centeredIdentityTargetCrossMeans",
        )
    )

    s5_path = tmp_path / "endpoint-s5.pt"
    save_jacobian_lens_artifact(artifact, s5_path)
    with pytest.raises(WorkspaceProbeError) as missing_receipt:
        load_jacobian_lens_artifact(
            s5_path,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            model=model,
        )
    assert missing_receipt.value.code == "missing_lens_fit_receipt"

    s5_receipt_path = _write_test_s5_fit_receipt(
        artifact,
        s5_path,
        tmp_path / "endpoint-s5-fit-receipt.json",
    )
    s5_receipt = json.loads(s5_receipt_path.read_text(encoding="utf-8"))
    assert type(s5_receipt["primaryAlphaInterior"]) is bool
    assert type(s5_receipt["primaryBetaInterior"]) is bool
    assert "alphaRaw" not in s5_receipt
    assert "betaRaw" not in s5_receipt
    assert s5_receipt["fitSourceSha256s"] == TEST_S5_FIT_SOURCE_SHA256S

    source_map_mutations = {}
    omitted_sources = copy.deepcopy(s5_receipt)
    omitted_sources.pop("fitSourceSha256s")
    source_map_mutations["omitted"] = omitted_sources
    added_source = copy.deepcopy(s5_receipt)
    added_source["fitSourceSha256s"]["docs/extra.md"] = f"sha256:{'8' * 64}"
    source_map_mutations["added"] = added_source
    renamed_source = copy.deepcopy(s5_receipt)
    renamed_digest = renamed_source["fitSourceSha256s"].pop(
        "scripts/research/select_jspace_s5_subset.py"
    )
    renamed_source["fitSourceSha256s"][
        "scripts/research/select_jspace_s5_subset_v2.py"
    ] = renamed_digest
    source_map_mutations["renamed"] = renamed_source
    changed_source = copy.deepcopy(s5_receipt)
    changed_source["fitSourceSha256s"][
        "scripts/research/select_jspace_s5_subset.py"
    ] = f"sha256:{'9' * 64}"
    source_map_mutations["changed"] = changed_source
    for name, mutated in source_map_mutations.items():
        mutated["selfHash"] = sha256_json({**mutated, "selfHash": None})
        mutated_path = tmp_path / f"endpoint-s5-fit-sources-{name}.json"
        mutated_path.write_text(json.dumps(mutated), encoding="utf-8")
        with pytest.raises(WorkspaceProbeError) as source_map_error:
            load_jacobian_lens_artifact(
                s5_path,
                checkpoint_sha256=checkpoint_hash,
                tokenizer_sha256=tokenizer_hash,
                model=model,
                fit_receipt_path=mutated_path,
            )
        assert source_map_error.value.code == "invalid_lens_fit_receipt", name

    receipt_field_mutations = {
        "source": ("sourceArtifactSha256", f"sha256:{'a' * 64}"),
        "preregistration": ("preregistrationSha256", f"sha256:{'b' * 64}"),
        "selector": ("selectorSha256", f"sha256:{'c' * 64}"),
        "order": ("sequenceOrderSha256", f"sha256:{'d' * 64}"),
        "set": ("sequenceSetSha256", f"sha256:{'e' * 64}"),
        "count": ("rowCount", s5_receipt["rowCount"] + 1),
        "tensor": ("tensorSha256", f"sha256:{'f' * 64}"),
        "lens": ("lensSha256", f"sha256:{'0' * 64}"),
    }
    for name, (field, value) in receipt_field_mutations.items():
        mutated = copy.deepcopy(s5_receipt)
        mutated[field] = value
        mutated["selfHash"] = sha256_json({**mutated, "selfHash": None})
        mutated_path = tmp_path / f"endpoint-s5-fit-{name}.json"
        mutated_path.write_text(json.dumps(mutated), encoding="utf-8")
        with pytest.raises(WorkspaceProbeError) as field_error:
            load_jacobian_lens_artifact(
                s5_path,
                checkpoint_sha256=checkpoint_hash,
                tokenizer_sha256=tokenizer_hash,
                model=model,
                fit_receipt_path=mutated_path,
            )
        assert field_error.value.code == "invalid_lens_fit_receipt", name

    invalid_self_hash = copy.deepcopy(s5_receipt)
    invalid_self_hash["selfHash"] = f"sha256:{'1' * 64}"
    leaked_scalar = copy.deepcopy(s5_receipt)
    leaked_scalar["alphaRaw"] = 1
    leaked_scalar["selfHash"] = sha256_json({**leaked_scalar, "selfHash": None})
    for name, mutated in (
        ("self-hash", invalid_self_hash),
        ("privacy", leaked_scalar),
    ):
        mutated_path = tmp_path / f"endpoint-s5-fit-{name}.json"
        mutated_path.write_text(json.dumps(mutated), encoding="utf-8")
        with pytest.raises(WorkspaceProbeError) as envelope_error:
            load_jacobian_lens_artifact(
                s5_path,
                checkpoint_sha256=checkpoint_hash,
                tokenizer_sha256=tokenizer_hash,
                model=model,
                fit_receipt_path=mutated_path,
            )
        assert envelope_error.value.code == "invalid_lens_fit_receipt", name

    loaded = load_jacobian_lens_artifact(
        s5_path,
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        model=model,
        fit_receipt_path=s5_receipt_path,
    )
    torch.testing.assert_close(loaded.matrices[0][0], torch.tensor([[4.0]]))
    torch.testing.assert_close(loaded.biases[0][0], torch.tensor([-3.0]))
    assert loaded.control_matrices is not None
    assert loaded.control_biases is not None
    assert loaded.control_scalars is not None
    alpha = 1.0 / 1.001
    torch.testing.assert_close(
        loaded.control_matrices["scalarCalibrated"][0][0],
        torch.tensor([[4.0 * alpha]]),
    )
    torch.testing.assert_close(loaded.control_biases["localTaylor"][0][0], torch.tensor([-5.0]))
    torch.testing.assert_close(loaded.control_scalars["scalarIdentity"][0][0], torch.tensor(2.0))
    probe = ModelWorkspaceProbe(model, loaded, [None] * 16, "synthetic-s5")
    capability = probe.capability()
    assert capability["estimator"] == JACOBIAN_LENS_ESTIMATOR_V2
    assert capability["experimentProfile"] == JACOBIAN_LENS_S5_EXPERIMENT_PROFILE
    prompt = "s5 x"
    observation_receipt = probe.observe(
        prompts[0],
        prompt_sha256=f"sha256:{hashlib.sha256(prompt.encode()).hexdigest()}",
        requested_model="synthetic-s5",
        request_id="workspace-s5-test",
        layers=[0],
        positions=[-1],
        k=3,
        created_at="2026-07-15T00:00:00.000Z",
    )
    assert observation_receipt["lens"]["experimentProfile"] == JACOBIAN_LENS_S5_EXPERIMENT_PROFILE
    assert set(observation_receipt["observation"]["layers"][0]["transportControlMetrics"]) == {
        "scalarCalibrated",
        "localTaylor",
        "scalarIdentity",
    }
    workspace_binding = {
        "alias": "a",
        "modelId": "synthetic-s5",
        "lensSha256": loaded.lens_sha256,
    }
    health = {
        "backend": "pytorch-holo",
        "model_workspace_probe": {
            "schema": capability["schema"],
            "observe": True,
            "intervention": False,
            "models": {"synthetic-s5": capability},
        },
    }
    validated_capability = _validate_capability(health, workspace_binding, [0])
    extracted = _validate_receipt(
        observation_receipt,
        prompt=prompt,
        binding=workspace_binding,
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        layers=[0],
        positions=[-1],
        k=3,
        allow_truncated=False,
        capability=validated_capability,
    )
    assert set(extracted["coordinates"][0]["transportControlMetrics"]) == {
        "scalarCalibrated",
        "localTaylor",
        "scalarIdentity",
    }

    unknown_profile_health = copy.deepcopy(health)
    unknown_profile_health["model_workspace_probe"]["models"]["synthetic-s5"][
        "experimentProfile"
    ] = "s5-unknown-profile"
    with pytest.raises(ValueError, match="capability mismatch"):
        _validate_capability(unknown_profile_health, workspace_binding, [0])

    missing_profile = copy.deepcopy(observation_receipt)
    missing_profile["lens"].pop("experimentProfile")
    missing_profile["receiptHash"] = sha256_json(
        {**missing_profile, "receiptHash": None}
    )
    with pytest.raises(ValueError, match="lens provenance"):
        _validate_receipt(
            missing_profile,
            prompt=prompt,
            binding=workspace_binding,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            layers=[0],
            positions=[-1],
            k=3,
            allow_truncated=False,
            capability=validated_capability,
        )

    confused_controls = copy.deepcopy(observation_receipt)
    transport_controls = confused_controls["observation"]["layers"][0][
        "transportControlMetrics"
    ]
    transport_controls["unscaledCentered"] = transport_controls.pop("scalarCalibrated")
    confused_controls["observationSha256"] = sha256_json(
        confused_controls["observation"]
    )
    confused_controls["receiptHash"] = sha256_json(
        {**confused_controls, "receiptHash": None}
    )
    with pytest.raises(ValueError, match="S5 transport controls"):
        _validate_receipt(
            confused_controls,
            prompt=prompt,
            binding=workspace_binding,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            layers=[0],
            positions=[-1],
            k=3,
            allow_truncated=False,
            capability=validated_capability,
        )

    historical_v2 = fit_endpoint_affine_jacobian_lens_v1(
        model,
        prompts,
        layers=[0],
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        dim_batch=1,
        max_seq_len=4,
        position_bins=[(0, 3)],
    )
    historical_v2_path = tmp_path / "historical-v2.pt"
    save_jacobian_lens_artifact(historical_v2, historical_v2_path)
    load_jacobian_lens_artifact(
        historical_v2_path,
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        model=model,
    )
    with pytest.raises(WorkspaceProbeError) as v2_s5_receipt_confusion:
        load_jacobian_lens_artifact(
            historical_v2_path,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            model=model,
            fit_receipt_path=s5_receipt_path,
        )
    assert v2_s5_receipt_confusion.value.code == "invalid_lens_fit_receipt"

    v4_artifact = fit_endpoint_scalar_calibrated_jacobian_lens_v1(
        model,
        prompts,
        layers=[0],
        checkpoint_sha256=checkpoint_hash,
        tokenizer_sha256=tokenizer_hash,
        control_profile_sha256=TEST_S4_CONTROL_PROFILE_SHA256,
        dim_batch=1,
        max_seq_len=4,
        position_bins=[(0, 3)],
    )
    v4_path = tmp_path / "endpoint-v4-confusion.pt"
    save_jacobian_lens_artifact(v4_artifact, v4_path)
    v4_receipt_path = _write_test_v4_fit_receipt(
        v4_artifact,
        v4_path,
        tmp_path / "endpoint-v4-confusion-receipt.json",
    )
    with pytest.raises(WorkspaceProbeError) as s5_v4_receipt_confusion:
        load_jacobian_lens_artifact(
            s5_path,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            model=model,
            fit_receipt_path=v4_receipt_path,
        )
    assert s5_v4_receipt_confusion.value.code == "invalid_lens_fit_receipt"
    with pytest.raises(WorkspaceProbeError) as v4_s5_receipt_confusion:
        load_jacobian_lens_artifact(
            v4_path,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            model=model,
            fit_receipt_path=s5_receipt_path,
        )
    assert v4_s5_receipt_confusion.value.code == "invalid_lens_fit_receipt"

    tampered = copy.deepcopy(artifact)
    tampered["matrices"][0, 0, 0, 0] += 0.25
    tampered_path = tmp_path / "endpoint-s5-tampered.pt"
    torch.save(tampered, tampered_path)
    with pytest.raises(WorkspaceProbeError) as tensor_tamper:
        load_jacobian_lens_artifact(
            tampered_path,
            checkpoint_sha256=checkpoint_hash,
            tokenizer_sha256=tokenizer_hash,
            model=model,
            fit_receipt_path=s5_receipt_path,
        )
    assert tensor_tamper.value.code == "invalid_lens_fit_binding"


def test_endpoint_local_taylor_is_exact_for_known_affine_mapping():
    model = SyntheticEndpointModel(nonlinear=False)
    prompts = [
        torch.tensor([[0, 2]], dtype=torch.long),
        torch.tensor([[0, 1, 2, 4]], dtype=torch.long),
    ]
    artifact = fit_endpoint_local_taylor_jacobian_lens_v1(
        model,
        prompts,
        layers=[0],
        checkpoint_sha256=f"sha256:{'1' * 64}",
        tokenizer_sha256=f"sha256:{'2' * 64}",
        dim_batch=2,
        max_seq_len=4,
        position_bins=[(0, 1), (2, 3)],
    )

    expected_matrices = model.transform.expand(2, 1, -1, -1)
    expected_biases = model.offset.expand(2, 1, -1)
    torch.testing.assert_close(artifact["matrices"], expected_matrices, rtol=0, atol=1e-6)
    torch.testing.assert_close(artifact["biases"], expected_biases, rtol=0, atol=1e-6)
    assert artifact["calibration"]["positionBins"] == [[0, 1], [2, 3]]
    assert artifact["calibration"]["positionBinCounts"] == [1, 1]

    for bin_index, prompt in enumerate(prompts):
        _, residuals = model.forward_with_residuals(prompt)
        source = residuals[0][0, -1].detach()
        target = residuals[-1][0, -1].detach()
        mapped = artifact["matrices"][bin_index, 0] @ source + artifact["biases"][
            bin_index, 0
        ]
        torch.testing.assert_close(mapped, target, rtol=0, atol=1e-6)


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"layers": [2]}, "invalid_source_layers"),
        ({"dim_batch": 0}, "invalid_dim_batch"),
        ({"max_seq_len": 1}, "invalid_max_seq_len"),
        ({"skip_first": -1}, "invalid_skip_first"),
        ({"max_seq_len": 5, "skip_first": 4}, "invalid_skip_first"),
    ],
)
def test_v1_estimator_rejects_unbounded_configuration(overrides, code):
    model = tiny_v1_model()
    kwargs = {
        "layers": [0],
        "checkpoint_sha256": f"sha256:{'1' * 64}",
        "tokenizer_sha256": f"sha256:{'2' * 64}",
        "dim_batch": 2,
        "max_seq_len": 5,
        "skip_first": 1,
    }
    kwargs.update(overrides)

    with pytest.raises(WorkspaceProbeError) as error:
        fit_jacobian_lens_v1(
            model,
            [torch.tensor([[1, 3, 4, 5, 6]], dtype=torch.long)],
            **kwargs,
        )
    assert error.value.code == code


def test_v1_estimator_fails_closed_on_too_short_prompt():
    with pytest.raises(WorkspaceProbeError) as error:
        fit_jacobian_lens_v1(
            tiny_v1_model(),
            [torch.tensor([[1]], dtype=torch.long)],
            layers=[0],
            checkpoint_sha256=f"sha256:{'1' * 64}",
            tokenizer_sha256=f"sha256:{'2' * 64}",
            dim_batch=2,
            max_seq_len=5,
            skip_first=0,
        )
    assert error.value.code == "prompt_too_short"


def test_v1_estimator_rejects_supplied_corpus_hash_mismatch():
    with pytest.raises(WorkspaceProbeError) as error:
        fit_jacobian_lens_v1(
            tiny_v1_model(),
            [torch.tensor([[1, 3, 4, 5, 6]], dtype=torch.long)],
            layers=[0],
            checkpoint_sha256=f"sha256:{'1' * 64}",
            tokenizer_sha256=f"sha256:{'2' * 64}",
            calibration_corpus_sha256=f"sha256:{'3' * 64}",
            dim_batch=2,
            max_seq_len=5,
            skip_first=1,
        )
    assert error.value.code == "calibration_corpus_hash_mismatch"


def test_v1_estimator_rejects_a_projected_matrix_over_budget():
    with pytest.raises(WorkspaceProbeError) as error:
        fit_jacobian_lens_v1(
            tiny_v1_model(),
            [torch.tensor([[1, 3, 4, 5, 6]], dtype=torch.long)],
            layers=[0],
            checkpoint_sha256=f"sha256:{'1' * 64}",
            tokenizer_sha256=f"sha256:{'2' * 64}",
            dim_batch=2,
            max_seq_len=5,
            skip_first=1,
            max_cpu_matrix_bytes=1,
        )
    assert error.value.code == "matrix_budget_exceeded"


def test_v1_shard_merge_matches_direct_fit_with_exact_counts():
    model = tiny_v1_model()
    prompts = [
        torch.tensor([[1, 3, 4, 5, 6]], dtype=torch.long),
        torch.tensor([[2, 4, 5, 6, 7]], dtype=torch.long),
    ]
    kwargs = {
        "layers": [0, 1],
        "checkpoint_sha256": f"sha256:{'1' * 64}",
        "tokenizer_sha256": f"sha256:{'2' * 64}",
        "dim_batch": 2,
        "max_seq_len": 5,
        "skip_first": 1,
    }
    shards = [fit_jacobian_lens_v1(model, [prompt], **kwargs) for prompt in prompts]
    merged = merge_jacobian_lens_v1_artifacts(shards)
    direct = fit_jacobian_lens_v1(model, prompts, **kwargs)

    torch.testing.assert_close(merged["matrices"], direct["matrices"], rtol=1e-6, atol=1e-6)
    assert merged["calibration"] == direct["calibration"]


def test_v1_shard_merge_rejects_overlapping_normalized_sequences():
    model = tiny_v1_model()
    prompt_a = torch.tensor([[1, 3, 4, 5, 6]], dtype=torch.long)
    prompt_b = torch.tensor([[2, 4, 5, 6, 7]], dtype=torch.long)
    prompt_c = torch.tensor([[3, 5, 6, 7, 8]], dtype=torch.long)
    kwargs = {
        "layers": [0, 1],
        "checkpoint_sha256": f"sha256:{'1' * 64}",
        "tokenizer_sha256": f"sha256:{'2' * 64}",
        "dim_batch": 2,
        "max_seq_len": 5,
        "skip_first": 1,
    }
    shards = [
        fit_jacobian_lens_v1(model, [prompt_a, prompt_b], **kwargs),
        fit_jacobian_lens_v1(model, [prompt_b, prompt_c], **kwargs),
    ]

    with pytest.raises(WorkspaceProbeError) as error:
        merge_jacobian_lens_v1_artifacts(shards)
    assert error.value.code == "overlapping_v1_sequences"


def test_v1_estimator_owns_rows_from_a_reused_generator_buffer():
    model = tiny_v1_model()
    prompt_a = torch.tensor([[1, 3, 4, 5, 6]], dtype=torch.long)
    prompt_b = torch.tensor([[2, 4, 5, 6, 7]], dtype=torch.long)
    shared = torch.empty_like(prompt_a)

    def reused_buffer_batches():
        shared.copy_(prompt_a)
        yield shared
        shared.copy_(prompt_b)
        yield shared

    kwargs = {
        "layers": [0, 1],
        "checkpoint_sha256": f"sha256:{'1' * 64}",
        "tokenizer_sha256": f"sha256:{'2' * 64}",
        "dim_batch": 2,
        "max_seq_len": 5,
        "skip_first": 1,
    }
    streamed = fit_jacobian_lens_v1(model, reused_buffer_batches(), **kwargs)
    independent = fit_jacobian_lens_v1(
        model,
        [prompt_a.clone(), prompt_b.clone()],
        **kwargs,
    )

    torch.testing.assert_close(streamed["matrices"], independent["matrices"], rtol=0, atol=0)
    assert streamed["calibration"] == independent["calibration"]


def test_workspace_request_ids_are_collision_resistant():
    request_ids = {_workspace_request_id() for _ in range(1_000)}
    assert len(request_ids) == 1_000
    assert all(request_id.startswith("workspace-holo-") for request_id in request_ids)


def test_workspace_eval_statistics_are_tie_aware_and_cross_runtime_deterministic():
    assert integer_mean_e8([1, 2]) == 2
    assert integer_mean_e8([-1, -2]) == -2
    assert roc_auc([1, 1, 0], [True, False, False]) == 0.75
    assert threshold_at_fpr([9, 8, 7, 6], [True, True, False, False]) == 8
    assert math.isfinite(threshold_at_fpr([9, 8, 7, 6], [False, True, True, True]))
    assert cohen_kappa([True, True, False, False], [True, True, False, False]) == 1
    assert cohen_kappa([False, False], [False, False]) is None


def test_workspace_eval_legacy_comparator_bootstrap_and_constant_reliability():
    mapped = [
        {"tokenId": 1, "probabilityE8": 75_000_000},
        {"tokenId": 2, "probabilityE8": 25_000_000},
    ]
    control = [
        {"tokenId": 2, "probabilityE8": 75_000_000},
        {"tokenId": 1, "probabilityE8": 25_000_000},
    ]
    legacy = _legacy_union_top_k_jsd(mapped, control)
    assert legacy == pytest.approx(0.130812_032_432_678_4)

    rows = [
        {
            "caseId": f"{vertical}-{index}",
            "vertical": vertical,
            "scoreE8": score,
            "legacyComparatorScoreHex": comparator.hex(),
        }
        for vertical in ("a", "b")
        for index, (score, comparator) in enumerate(((2, 0.2), (1, 0.1)))
    ]
    labels = {"a-0": True, "a-1": False, "b-0": True, "b-1": False}
    assert _bootstrap_delta(rows, labels, samples=10, seed=7) == [0.0, 0.0, 0.0]
    with pytest.raises(ValueError, match="bootstrap samples"):
        _bootstrap_delta(rows, labels, samples=0, seed=7)

    key_a = ("unprimed", "a")
    key_b = ("unprimed", "b")
    reliability = _paired_reliability(
        key_a,
        key_b,
        cells={
            key_a: [{"caseId": "1", "scoreE8": 5}, {"caseId": "2", "scoreE8": 5}],
            key_b: [{"caseId": "1", "scoreE8": 8}, {"caseId": "2", "scoreE8": 8}],
        },
        decision_maps={key_a: {"1": False, "2": False}, key_b: {"1": False, "2": False}},
    )
    assert reliability["scorePearson"] is None
    assert reliability["decisionKappa"] is None


def test_fresh_contract_requires_attestation_and_complete_registered_matrix():
    prompts = []
    labels = {}
    identities = {}
    vertical_counts = {}
    for vertical_index in range(6):
        vertical = f"vertical-{vertical_index}"
        vertical_counts[vertical] = 40
        for item_index in range(40):
            case_id = f"{vertical}-{item_index}"
            scenario = f"Scenario {case_id}"
            ask = f"Resolve {case_id}"
            template_id = _normalized_template_id(vertical, scenario, ask)
            unprimed = f"\nSituation: {scenario}\n\nTask: {ask} Output JSON only.\n"
            for frame, prompt in (
                ("unprimed", unprimed),
                ("primed", GAP_PRIME + unprimed),
            ):
                prompts.append(
                    {
                        "caseId": case_id,
                        "vertical": vertical,
                        "templateId": template_id,
                        "frame": frame,
                        "prompt": prompt,
                    }
                )
            labels[case_id] = item_index % 2 == 0
            identities[case_id] = (vertical, template_id)
    report = {
        "caseCount": 240,
        "uniqueCaseCount": 240,
        "uniqueTemplateCount": 240,
        "positiveCount": 120,
        "negativeCount": 120,
        "verticalCounts": vertical_counts,
    }
    _validate_fresh_prompt_matrix(prompts, report)

    seen = {
        (case_id, frame, alias)
        for case_id in labels
        for frame in ("unprimed", "primed")
        for alias in ("a", "b")
    }
    cells = {(frame, alias): [] for frame in ("unprimed", "primed") for alias in ("a", "b")}
    _validate_fresh_evaluation_matrix(
        seen=seen,
        cells=cells,
        labels=labels,
        case_identities=identities,
        report=report,
    )
    seen.pop()
    with pytest.raises(ValueError, match="complete 2x2"):
        _validate_fresh_evaluation_matrix(
            seen=seen,
            cells=cells,
            labels=labels,
            case_identities=identities,
            report=report,
        )

    with pytest.raises(ValueError, match="fresh run requires"):
        _load_fresh_contract(
            SimpleNamespace(fresh_manifest=None, fresh_report=None, preregistration=None),
            prompt_sha256=f"sha256:{'1' * 64}",
            labels_sha256=None,
            models=[],
            layers=[2, 5, 8],
            positions=[-1],
            k=25,
            code_revision="0" * 40,
        )


def test_workspace_eval_rejects_rehashed_out_of_contract_receipts(tmp_path):
    _, probe, _ = fitted_probe(tmp_path)
    prompt = "Situation: test. Task: decide. Output JSON only."
    binding = {
        "alias": "a",
        "modelId": "holorunner-s0",
        "lensSha256": probe.lens.lens_sha256,
    }
    capability = probe.capability()
    health = {
        "backend": "pytorch-holo",
        "model_workspace_probe": {
            "schema": capability["schema"],
            "observe": True,
            "intervention": False,
            "models": {"holorunner-s0": capability},
        },
    }
    assert _validate_capability(health, binding, [0]) == capability
    receipt = probe.observe(
        torch.tensor([[1, 3, 4]], dtype=torch.long),
        prompt_sha256=f"sha256:{hashlib.sha256(prompt.encode()).hexdigest()}",
        requested_model="holorunner-s0",
        request_id="workspace-test",
        layers=[0],
        positions=[-1],
        k=3,
        created_at="2026-07-14T00:00:00.000Z",
    )
    extracted = _validate_receipt(
        receipt,
        prompt=prompt,
        binding=binding,
        checkpoint_sha256=f"sha256:{'1' * 64}",
        tokenizer_sha256=f"sha256:{'2' * 64}",
        layers=[0],
        positions=[-1],
        k=3,
        allow_truncated=False,
        capability=capability,
    )
    assert extracted["legacyComparatorProfile"] == LEGACY_COMPARATOR_PROFILE

    tampered = json.loads(json.dumps(receipt))
    tampered["observation"]["layers"][0]["distributionMetrics"][
        "mappedControlJensenShannonDivergenceNatsE8"
    ] = "999999999"
    tampered["observationSha256"] = sha256_json(tampered["observation"])
    tampered["receiptHash"] = sha256_json({**tampered, "receiptHash": None})
    with pytest.raises(ValueError, match="distribution metrics"):
        _validate_receipt(
            tampered,
            prompt=prompt,
            binding=binding,
            checkpoint_sha256=f"sha256:{'1' * 64}",
            tokenizer_sha256=f"sha256:{'2' * 64}",
            layers=[0],
            positions=[-1],
            k=3,
            allow_truncated=False,
            capability=capability,
        )


def test_fit_and_observe_emit_a_bounded_deterministic_receipt(tmp_path):
    model, probe, _ = fitted_probe(tmp_path)
    ids = torch.tensor([[1, 3, 4]], dtype=torch.long)
    prompt_hash = f"sha256:{'4' * 64}"
    kwargs = {
        "prompt_sha256": prompt_hash,
        "requested_model": "holorunner-s0",
        "request_id": "workspace-test",
        "layers": [0],
        "positions": [-1],
        "k": 3,
        "created_at": "2026-07-14T00:00:00.000Z",
    }

    before_logits, _ = model(ids)
    first = probe.observe(ids, **kwargs)
    second = probe.observe(ids, **kwargs)
    after_logits, _ = model(ids)

    assert first["schema"] == MODEL_WORKSPACE_RECEIPT_SCHEMA
    assert first["mode"] == "observe"
    assert first["receiptHash"] == second["receiptHash"]
    assert first["safety"] == {
        "readOnly": True,
        "interventionApplied": False,
        "rawActivationsPersisted": False,
        "identityBinding": "none",
        "retention": "receipt_only",
    }
    assert len(first["observation"]["layers"][0]["concepts"]) == 3
    assert first["input"]["measurementProfile"] == MODEL_WORKSPACE_MEASUREMENT_PROFILE
    assert first["observation"]["measurementProfile"] == MODEL_WORKSPACE_MEASUREMENT_PROFILE
    assert first["observation"]["controlProfile"] == MODEL_WORKSPACE_CONTROL_PROFILE
    assert first["observation"]["summary"] == {
        "scoreProfile": MODEL_WORKSPACE_SCORE_PROFILE,
        "coordinateCount": 1,
        "scoreE8": first["observation"]["layers"][0]["distributionMetrics"][
            "mappedControlJensenShannonDivergenceNatsE8"
        ],
    }
    assert 0 <= first["observation"]["layers"][0]["tailProbabilityMassE8"] <= 100_000_000
    assert (
        sum(item["probabilityE8"] for item in first["observation"]["layers"][0]["controlConcepts"])
        + first["observation"]["layers"][0]["controlTailProbabilityMassE8"]
        == 100_000_000
    )
    assert torch.equal(before_logits, after_logits)
    assert all(parameter.grad is None for parameter in model.parameters())
    serialized = json.dumps(first)
    assert "composition secret prompt" not in serialized
    for layer in first["observation"]["layers"]:
        assert set(layer) == {
            "layer",
            "position",
            "concepts",
            "controlConcepts",
            "tailProbabilityMassE8",
            "controlTailProbabilityMassE8",
            "distributionMetrics",
        }


def test_full_distribution_metrics_are_k_invariant_symmetric_and_zero_at_identity(tmp_path):
    _, probe, _ = fitted_probe(tmp_path)
    ids = torch.tensor([[1, 3, 4]], dtype=torch.long)
    kwargs = {
        "prompt_sha256": f"sha256:{'4' * 64}",
        "requested_model": "holorunner-s0",
        "request_id": "workspace-test",
        "layers": [0],
        "positions": [-1],
        "created_at": "2026-07-14T00:00:00.000Z",
    }
    k1 = probe.observe(ids, k=1, **kwargs)["observation"]["layers"][0]
    k3 = probe.observe(ids, k=3, **kwargs)["observation"]["layers"][0]
    assert k1["distributionMetrics"] == k3["distributionMetrics"]

    left = torch.tensor([3.0, 1.0, -2.0])
    right = torch.tensor([-1.0, 2.0, 0.5])
    forward = _full_distribution_metrics(left, right, left)
    reverse = _full_distribution_metrics(right, left, left)
    assert (
        forward["mappedControlJensenShannonDivergenceNatsE8"]
        == reverse["mappedControlJensenShannonDivergenceNatsE8"]
    )
    assert forward["lensGainJensenShannonNatsE8"] == (
        forward["controlTargetJensenShannonDivergenceNatsE8"]
        - forward["mappedTargetJensenShannonDivergenceNatsE8"]
    )
    identity = _full_distribution_metrics(left, left, left)
    assert identity["mappedControlJensenShannonDivergenceNatsE8"] == 0
    assert identity["mappedTargetJensenShannonDivergenceNatsE8"] == 0
    assert identity["lensGainJensenShannonNatsE8"] == 0

    mapped = torch.log(torch.tensor([0.75, 0.25], dtype=torch.float64))
    control = torch.log(torch.tensor([0.25, 0.75], dtype=torch.float64))
    analytic = _full_distribution_metrics(mapped, control, mapped)
    assert analytic == {
        "mappedControlJensenShannonDivergenceNatsE8": 13_081_204,
        "mappedTargetJensenShannonDivergenceNatsE8": 0,
        "controlTargetJensenShannonDivergenceNatsE8": 13_081_204,
        "lensGainJensenShannonNatsE8": 13_081_204,
        "totalVariationDistanceE8": 50_000_000,
        "mappedEntropyNatsE8": 56_233_514,
        "controlEntropyNatsE8": 56_233_514,
        "mappedMaxProbabilityE8": 75_000_000,
        "controlMaxProbabilityE8": 75_000_000,
    }


def test_sparse_probability_quantization_preserves_mass_and_tail():
    uniform = _largest_remainder_probability_e8([1 / 6] * 6 + [0.0])
    assert uniform == [16_666_667] * 4 + [16_666_666] * 2 + [0]
    assert sum(uniform) == 100_000_000

    concentrated = _largest_remainder_probability_e8([0.999_999_991, 0.000_000_004, 0.000_000_005])
    assert concentrated == [99_999_999, 0, 1]
    assert sum(concentrated) == 100_000_000


def test_lens_binding_rejects_checkpoint_mismatch(tmp_path):
    model, _, path = fitted_probe(tmp_path)
    with pytest.raises(WorkspaceProbeError, match="checkpoint hash") as error:
        load_jacobian_lens_artifact(
            path,
            checkpoint_sha256=f"sha256:{'9' * 64}",
            tokenizer_sha256=f"sha256:{'2' * 64}",
            model=model,
        )
    assert error.value.code == "checkpoint_hash_mismatch"


def test_probe_rejects_k_above_the_sparse_readout_cap(tmp_path):
    _, probe, _ = fitted_probe(tmp_path)
    with pytest.raises(WorkspaceProbeError) as error:
        probe.observe(
            torch.tensor([[1, 3, 4]], dtype=torch.long),
            prompt_sha256=f"sha256:{'4' * 64}",
            requested_model="holorunner-s0",
            request_id="workspace-test",
            k=26,
        )
    assert error.value.code == "invalid_k"


def test_receipt_hash_canonicalization_matches_typescript_and_rejects_floats():
    payload = {
        "ids": [1, 2],
        "one": 1,
        "probabilityE8": 50_000_000,
        "scoreE8": 100_000_000,
    }
    assert sha256_json(payload) == (
        "sha256:e51db8a70ed743e27e3c8013a6ae1f424f0190d216a620e580338688a077f9aa"
    )
    with pytest.raises(WorkspaceProbeError) as error:
        sha256_json({"score": 1.000000001})
    assert error.value.code == "invalid_receipt_number"


def test_lens_loader_rejects_float32_overflow_and_zero_information(tmp_path):
    model, _, path = fitted_probe(tmp_path)
    payload = torch.load(path, map_location="cpu", weights_only=True)
    payload["matrices"] = payload["matrices"].to(dtype=torch.float64)
    payload["matrices"][0, 0, 0] = 1e300
    torch.save(payload, path)
    with pytest.raises(WorkspaceProbeError) as overflow:
        load_jacobian_lens_artifact(
            path,
            checkpoint_sha256=f"sha256:{'1' * 64}",
            tokenizer_sha256=f"sha256:{'2' * 64}",
            model=model,
        )
    assert overflow.value.code == "invalid_lens_matrices"

    payload["matrices"] = torch.zeros_like(payload["matrices"], dtype=torch.float32)
    torch.save(payload, path)
    with pytest.raises(WorkspaceProbeError) as degenerate:
        load_jacobian_lens_artifact(
            path,
            checkpoint_sha256=f"sha256:{'1' * 64}",
            tokenizer_sha256=f"sha256:{'2' * 64}",
            model=model,
        )
    assert degenerate.value.code == "degenerate_lens_matrix"


def test_lens_save_is_atomic_when_serialization_fails(tmp_path, monkeypatch):
    target = tmp_path / "lens.pt"
    target.write_bytes(b"trusted-existing-artifact")

    def fail_after_partial_write(_artifact, path):
        path.write_bytes(b"partial")
        raise OSError("simulated serialization failure")

    monkeypatch.setattr(torch, "save", fail_after_partial_write)
    with pytest.raises(OSError, match="simulated serialization failure"):
        save_jacobian_lens_artifact({"matrices": torch.ones(1)}, target)

    assert target.read_bytes() == b"trusted-existing-artifact"
    assert list(tmp_path.glob(".lens.pt.*.tmp")) == []


@pytest.mark.parametrize(
    ("mutation", "code"),
    [
        ("parity_scope", "invalid_lens_estimator"),
        ("sequence_hash", "invalid_lens_metadata"),
    ],
)
def test_v1_lens_loader_rejects_tampered_reference_provenance(tmp_path, mutation, code):
    model = tiny_v1_model()
    artifact = fit_jacobian_lens_v1(
        model,
        [torch.tensor([[1, 3, 4, 5, 6]], dtype=torch.long)],
        layers=[0],
        checkpoint_sha256=f"sha256:{'1' * 64}",
        tokenizer_sha256=f"sha256:{'2' * 64}",
        dim_batch=3,
        max_seq_len=5,
        skip_first=1,
    )
    if mutation == "parity_scope":
        artifact["estimator"]["parityScope"] = "paper-experiment"
    else:
        artifact["calibration"]["sequenceSha256s"][0] = f"sha256:{'9' * 64}"
    path = tmp_path / "tampered-v1.pt"
    torch.save(artifact, path)

    with pytest.raises(WorkspaceProbeError) as error:
        load_jacobian_lens_artifact(
            path,
            checkpoint_sha256=f"sha256:{'1' * 64}",
            tokenizer_sha256=f"sha256:{'2' * 64}",
            model=model,
        )
    assert error.value.code == code


@pytest.mark.parametrize(
    ("mutation", "code"),
    [
        ("kind", "invalid_lens_kind"),
        ("architecture", "invalid_lens_metadata"),
        ("corpus", "invalid_lens_metadata"),
        ("position_pairs", "invalid_lens_metadata"),
        ("layers", "invalid_lens_matrices"),
    ],
)
def test_lens_loader_rejects_incomplete_provenance(tmp_path, mutation, code):
    model, _, path = fitted_probe(tmp_path)
    payload = torch.load(path, map_location="cpu", weights_only=True)
    if mutation == "kind":
        payload["kind"] = "Wrong"
    elif mutation == "architecture":
        payload["model"]["architecture"] = ""
    elif mutation == "corpus":
        payload["calibration"]["corpusSha256"] = "not-a-hash"
    elif mutation == "position_pairs":
        payload["calibration"].pop("positionPairs")
    else:
        payload["layers"][0] = 0.5
    torch.save(payload, path)

    with pytest.raises(WorkspaceProbeError) as error:
        load_jacobian_lens_artifact(
            path,
            checkpoint_sha256=f"sha256:{'1' * 64}",
            tokenizer_sha256=f"sha256:{'2' * 64}",
            model=model,
        )
    assert error.value.code == code


def test_observe_endpoint_rejects_intervention_shaped_fields():
    handler = object.__new__(Handler)
    responses = []
    handler._json = lambda code, body: responses.append((code, body))

    handler._model_workspace_observe({"prompt": "x", "intervention": {"direction": 1}})

    assert responses[0][0] == 400
    assert responses[0][1]["error"]["code"] == "workspace_intervention_forbidden"


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({"prompt": "x", "model": ["holorunner-s0"]}, "invalid_workspace_probe_model"),
        ({"prompt": "x", "layers": [1.5]}, "invalid_workspace_probe_layers"),
        ({"prompt": "x", "positions": [True]}, "invalid_workspace_probe_positions"),
        ({"prompt": "x", "k": "10"}, "invalid_workspace_probe_parameters"),
    ],
)
def test_observe_endpoint_rejects_coerced_parameter_types(payload, code):
    handler = object.__new__(Handler)
    responses = []
    handler._json = lambda status, body: responses.append((status, body))

    handler._model_workspace_observe(payload)

    assert responses[0][0] == 400
    assert responses[0][1]["error"]["code"] == code
