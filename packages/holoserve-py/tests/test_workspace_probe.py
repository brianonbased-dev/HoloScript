# ruff: noqa: E402 - torch availability must be gated before model imports
import json

import pytest

torch = pytest.importorskip("torch")

from holoserve.model import GPT
from holoserve.server import Handler, _workspace_request_id
from holoserve.workspace_probe import (
    ALL_VALID_CURRENT_AND_FUTURE_POSITION_POLICY,
    JACOBIAN_LENS_ESTIMATOR_V1,
    JACOBIAN_LENS_V1_REFERENCE_COMMIT,
    MODEL_WORKSPACE_RECEIPT_SCHEMA,
    ModelWorkspaceProbe,
    WorkspaceProbeError,
    fit_jacobian_lens,
    fit_jacobian_lens_v1,
    load_jacobian_lens_artifact,
    merge_jacobian_lens_v1_artifacts,
    save_jacobian_lens_artifact,
    sha256_json,
)


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
    assert 0 <= first["observation"]["layers"][0]["tailProbabilityMassE8"] <= 100_000_000
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
        }


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
