# ruff: noqa: E402 - torch availability must be gated before model imports
"""Portable end-to-end proof for HoloServe's named native-model registry."""

import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pytest

torch = pytest.importorskip("torch")

from holoserve import server as server_module
from holoserve.model import GPT
from holoserve.server import (
    _parse_workspace_path_bindings,
    _validate_workspace_path_bindings,
    build_argument_parser,
)
from holoserve.workspace_probe import (
    JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256,
    fit_endpoint_scalar_calibrated_jacobian_lens_v1,
    jacobian_lens_v4_fit_receipt_fields,
    save_jacobian_lens_artifact,
    sha256_json,
)


VOCAB_SIZE = 262
PROMPT_TOKEN_ID = 6 + ord("x")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def _sha256_json(value: dict) -> str:
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _write_v4_fit_receipt(artifact: dict, lens_path: Path, receipt_path: Path) -> None:
    receipt = {
        "schema": "holoscript.jspace-s4-fit-receipt.v0.1.0",
        **jacobian_lens_v4_fit_receipt_fields(
            artifact,
            lens_sha256=_sha256_file(lens_path),
        ),
        "semanticLabelsAccessed": False,
        "selfHash": None,
    }
    receipt["selfHash"] = sha256_json(receipt)
    receipt_path.write_text(json.dumps(receipt), encoding="utf-8")


def _write_bins(path: Path) -> Path:
    path.mkdir()
    tokenizer_path = path / "tokenizer.json"
    tokenizer_path.write_text(json.dumps({"merges": []}), encoding="utf-8")
    (path / "meta.json").write_text(
        json.dumps({"vocab_size": VOCAB_SIZE}),
        encoding="utf-8",
    )
    return tokenizer_path


def _engineered_model(output_byte: int) -> GPT:
    model = GPT(
        vocab_size=VOCAB_SIZE,
        n_layer=2,
        n_head=1,
        n_embd=4,
        block_size=8,
        dropout=0.0,
    )
    output_token_id = 6 + output_byte
    with torch.no_grad():
        for parameter in model.parameters():
            parameter.zero_()
        model.lnf.weight.fill_(1)
        model.tok.weight[PROMPT_TOKEN_ID] = torch.tensor([1.0, -1.0, 0.0, 0.0])
        model.tok.weight[output_token_id] = torch.tensor([10.0, -10.0, 0.0, 0.0])
    model.eval()
    return model


def _write_checkpoint(path: Path, model: GPT) -> None:
    torch.save(
        {
            "model": model.state_dict(),
            "config": {
                "vocab_size": VOCAB_SIZE,
                "n_layer": 2,
                "n_head": 1,
                "n_embd": 4,
                "block_size": 8,
                "dropout": 0.0,
                "structural_type_count": 0,
            },
            "vocab_size": VOCAB_SIZE,
            "structural_type_count": 0,
            "iter": 1,
            "best_val": 1.0,
        },
        path,
    )


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def _request_json(url: str, body: dict | None = None) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        url,
        data=data,
        headers={"content-type": "application/json"} if data is not None else {},
        method="POST" if data is not None else "GET",
    )
    try:
        with urlopen(request, timeout=5) as response:  # noqa: S310 - loopback test server
            return int(response.status), json.loads(response.read())
    except HTTPError as error:
        return int(error.code), json.loads(error.read())


def _wait_for_health(base_url: str, process: subprocess.Popen[str]) -> dict:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if process.poll() is not None:
            stdout, stderr = process.communicate(timeout=1)
            raise AssertionError(f"HoloServe exited early\nstdout:\n{stdout}\nstderr:\n{stderr}")
        try:
            status, health = _request_json(f"{base_url}/health")
            if status == 200:
                return health
        except (URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(0.05)
    raise AssertionError("HoloServe did not become healthy within 20 seconds")


def test_workspace_fit_receipt_bindings_are_fail_closed():
    with pytest.raises(SystemExit, match="must be MODEL=PATH"):
        _parse_workspace_path_bindings(["malformed"], "--workspace-fit-receipt")

    with pytest.raises(SystemExit, match="invalid or duplicate"):
        _parse_workspace_path_bindings(
            ["holorunner-s0=first.json", "holorunner-s0=second.json"],
            "--workspace-fit-receipt",
        )

    with pytest.raises(SystemExit, match="matching --workspace-lens"):
        _validate_workspace_path_bindings(
            {},
            {"holorunner-s0": "fit-receipt.json"},
        )

    with pytest.raises(SystemExit, match="models that are not resident"):
        _validate_workspace_path_bindings(
            {"unknown-model": "lens.pt"},
            {"unknown-model": "fit-receipt.json"},
            {"holorunner-s0": object()},
        )


def test_default_model_name_cli_is_backward_compatible_and_fail_closed():
    parser = build_argument_parser()
    default = parser.parse_args(["--ckpt", "model.pt", "--bins", "bins"])
    assert default.model_name == "holorunner-s0"

    selected = parser.parse_args(
        ["--ckpt", "model.pt", "--bins", "bins", "--model-name", "HoloMind-s2"]
    )
    assert selected.model_name == "HoloMind-s2"

    with pytest.raises(SystemExit):
        parser.parse_args(
            ["--ckpt", "model.pt", "--bins", "bins", "--model-name", "HoloMind s2"]
        )


def test_additional_model_names_share_the_portable_and_duplicate_contract():
    parsed = server_module._parse_additional_model_specs(
        ["holorunner-s0=legacy.pt@legacy-bins"],
        "HoloMind-s2",
    )
    assert parsed == [("holorunner-s0", "legacy.pt", "legacy-bins")]

    with pytest.raises(SystemExit, match="invalid model name"):
        server_module._parse_additional_model_specs(
            ["Holo Mind=extra.pt@bins"],
            "HoloMind-s2",
        )

    with pytest.raises(SystemExit, match="duplicate model name: 'HoloMind-s2'"):
        server_module._parse_additional_model_specs(
            ["HoloMind-s2=duplicate.pt@bins"],
            "HoloMind-s2",
        )

    with pytest.raises(SystemExit, match="duplicate model name: 'extra-model'"):
        server_module._parse_additional_model_specs(
            ["extra-model=a.pt", "extra-model=b.pt"],
            "HoloMind-s2",
        )


def test_holo_model_passes_bound_fit_receipt_to_lens_loader(tmp_path, monkeypatch):
    bins = tmp_path / "bins"
    _write_bins(bins)
    checkpoint = tmp_path / "model.pt"
    _write_checkpoint(checkpoint, _engineered_model(ord("A")))
    lens_path = tmp_path / "lens.pt"
    fit_receipt_path = tmp_path / "fit-receipt.json"
    captured = {}
    loaded_lens = object()

    def fake_load_lens(path, **kwargs):
        captured["path"] = path
        captured.update(kwargs)
        return loaded_lens

    monkeypatch.setattr(server_module, "load_jacobian_lens_artifact", fake_load_lens)
    monkeypatch.setattr(server_module, "ModelWorkspaceProbe", lambda *args: args)

    resident = server_module.HoloModel(
        checkpoint,
        bins,
        "cpu",
        "receipt-bound-model",
        lens_path,
        fit_receipt_path,
    )

    assert resident.workspace_fit_receipt_path == fit_receipt_path
    assert captured["path"] == lens_path
    assert captured["fit_receipt_path"] == fit_receipt_path
    assert resident.workspace_probe[1] is loaded_lens


def test_health_artifact_binding_abstains_when_hashes_are_unavailable(monkeypatch):
    class LegacyResident:
        device = "cpu"
        grammars = set()
        params_millions = 0.0
        config = {}
        workspace_probe = None

    resident = LegacyResident()
    monkeypatch.setattr(server_module, "MODEL", resident)
    monkeypatch.setattr(server_module, "MODELS", {"legacy-model": resident})
    monkeypatch.setattr(server_module, "DEFAULT_MODEL_NAME", "legacy-model")

    health = server_module.Handler._health(object())

    assert health["model_artifact_bindings"]["models"]["legacy-model"] == {
        "schema": server_module.MODEL_ARTIFACT_BINDING_SCHEMA,
        "available": False,
        "reason": "artifact_hashes_unavailable",
        "missing": ["checkpointSha256", "metaSha256", "tokenizerSha256"],
    }


def test_named_registry_routes_distinct_weights_and_model_bound_lens(tmp_path):
    bins = tmp_path / "bins"
    tokenizer_path = _write_bins(bins)
    checkpoint_a = tmp_path / "a.pt"
    checkpoint_b = tmp_path / "b.pt"
    model_a = _engineered_model(ord("A"))
    model_b = _engineered_model(ord("B"))
    _write_checkpoint(checkpoint_a, model_a)
    _write_checkpoint(checkpoint_b, model_b)

    lens = fit_endpoint_scalar_calibrated_jacobian_lens_v1(
        model_b,
        [
            torch.tensor([[PROMPT_TOKEN_ID]]),
            torch.tensor([[6 + ord("y")]]),
        ],
        layers=[0],
        checkpoint_sha256=_sha256_file(checkpoint_b),
        tokenizer_sha256=_sha256_file(tokenizer_path),
        control_profile_sha256=JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256,
        dim_batch=2,
        max_seq_len=8,
        position_bins=[(0, 7)],
    )
    lens_path = tmp_path / "b-lens.pt"
    save_jacobian_lens_artifact(lens, lens_path)
    fit_receipt_path = tmp_path / "b-fit-receipt.json"
    _write_v4_fit_receipt(lens, lens_path, fit_receipt_path)

    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"
    package_root = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join([str(package_root), env.get("PYTHONPATH", "")]).rstrip(
        os.pathsep
    )
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "holoserve.server",
            "--ckpt",
            str(checkpoint_a),
            "--bins",
            str(bins),
            "--model-name",
            "HoloMind-s2",
            "--model-spec",
            f"holorunner-s0-b={checkpoint_b}@{bins}",
            "--workspace-lens",
            f"holorunner-s0-b={lens_path}",
            "--workspace-fit-receipt",
            f"holorunner-s0-b={fit_receipt_path}",
            "--device",
            "cpu",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=package_root,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        health = _wait_for_health(base_url, process)
        assert health["models"] == ["HoloMind-s2", "holorunner-s0-b"]
        artifact_registry = health["model_artifact_bindings"]
        assert artifact_registry["schema"] == server_module.MODEL_ARTIFACT_REGISTRY_SCHEMA
        assert artifact_registry["defaultModel"] == "HoloMind-s2"
        assert sorted(artifact_registry["models"]) == ["HoloMind-s2", "holorunner-s0-b"]

        bins_payload = {
            "schema": server_module.MODEL_BINS_BINDING_SCHEMA,
            "files": {
                "meta.json": _sha256_file(bins / "meta.json"),
                "tokenizer.json": _sha256_file(tokenizer_path),
            },
        }
        expected_checkpoints = {
            "HoloMind-s2": _sha256_file(checkpoint_a),
            "holorunner-s0-b": _sha256_file(checkpoint_b),
        }
        for model_name, checkpoint_sha256 in expected_checkpoints.items():
            assert artifact_registry["models"][model_name] == {
                "schema": server_module.MODEL_ARTIFACT_BINDING_SCHEMA,
                "available": True,
                "checkpointSha256": checkpoint_sha256,
                "tokenizerSha256": bins_payload["files"]["tokenizer.json"],
                "bins": {
                    **bins_payload,
                    "bindingSha256": _sha256_json(bins_payload),
                },
            }
        serialized_bindings = json.dumps(artifact_registry)
        assert str(checkpoint_a) not in serialized_bindings
        assert str(checkpoint_b) not in serialized_bindings
        assert str(bins) not in serialized_bindings
        assert health["model_workspace_probe"]["models"]["HoloMind-s2"]["observe"] is False
        bound_capability = health["model_workspace_probe"]["models"]["holorunner-s0-b"]
        assert bound_capability["observe"] is True
        assert bound_capability["estimator"] == "endpoint_self_jacobian_scalar_calibrated_v1"
        assert bound_capability["paperParity"] is False

        status, models = _request_json(f"{base_url}/v1/models")
        assert status == 200
        assert [entry["id"] for entry in models["data"]] == [
            "HoloMind-s2",
            "holorunner-s0-b",
        ]

        completions = {}
        for model_name in ("HoloMind-s2", "holorunner-s0-b"):
            status, completion = _request_json(
                f"{base_url}/v1/completions",
                {
                    "model": model_name,
                    "prompt": "x",
                    "max_tokens": 1,
                    "temperature": 1,
                    "top_k": 1,
                    "seed": 20260714,
                },
            )
            assert status == 200
            assert completion["model"] == model_name
            expected_binding = artifact_registry["models"][model_name]
            assert completion["holo"]["model_artifact_binding"] == expected_binding
            assert completion["holo"]["model_artifact_binding_sha256"] == _sha256_json(
                expected_binding
            )
            assert completion["holo"]["decoding"] == {
                "seed": 20260714,
                "temperature": 1.0,
                "top_k": 1,
                "max_tokens": 1,
                "grammar": None,
            }
            completions[model_name] = completion["choices"][0]["text"]
        assert completions == {"HoloMind-s2": "A", "holorunner-s0-b": "B"}

        status, unknown = _request_json(
            f"{base_url}/v1/completions",
            {"model": "not-resident", "prompt": "x", "max_tokens": 1},
        )
        assert status == 404
        assert unknown["error"]["code"] == "model_not_found"

        status, receipt = _request_json(
            f"{base_url}/v1/model-workspace/observe",
            {
                "model": "holorunner-s0-b",
                "prompt": "x",
                "layers": [0],
                "positions": [-1],
                "k": 1,
            },
        )
        assert status == 200
        assert receipt["model"] == {
            "requestedId": "holorunner-s0-b",
            "servedId": "holorunner-s0-b",
            "checkpointSha256": _sha256_file(checkpoint_b),
            "architecture": "holorunner-s0-gpt",
        }
        assert receipt["lens"]["estimator"] == "endpoint_self_jacobian_scalar_calibrated_v1"
        assert receipt["lens"]["paperParity"] is False
        assert receipt["input"]["originalTokenCount"] == receipt["input"]["tokenCount"]
        assert receipt["input"]["truncated"] is False
        assert receipt["input"]["truncationPolicy"] == "none"

        status, truncated = _request_json(
            f"{base_url}/v1/model-workspace/observe",
            {
                "model": "holorunner-s0-b",
                "prompt": "x" * 20,
                "layers": [0],
                "positions": [-1],
                "k": 1,
            },
        )
        assert status == 200
        assert truncated["input"]["tokenCount"] == 8
        assert truncated["input"]["originalTokenCount"] == 21
        assert truncated["input"]["truncated"] is True
        assert truncated["input"]["truncationPolicy"] == "left-truncate-to-model-block-size"

        status, unavailable = _request_json(
            f"{base_url}/v1/model-workspace/observe",
            {"model": "HoloMind-s2", "prompt": "x", "layers": [0], "k": 1},
        )
        assert status == 409
        assert unavailable["error"]["code"] == "workspace_lens_unavailable"
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
