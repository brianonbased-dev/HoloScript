# ruff: noqa: E402 - torch availability must be gated before model imports
import json

import pytest

torch = pytest.importorskip("torch")

from holoserve.model import GPT
from holoserve.server import Handler, _workspace_request_id
from holoserve.workspace_probe import (
    MODEL_WORKSPACE_RECEIPT_SCHEMA,
    ModelWorkspaceProbe,
    WorkspaceProbeError,
    fit_jacobian_lens,
    load_jacobian_lens_artifact,
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
