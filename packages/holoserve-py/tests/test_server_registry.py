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

from holoserve.model import GPT
from holoserve.workspace_probe import fit_jacobian_lens_v1, save_jacobian_lens_artifact


VOCAB_SIZE = 262
PROMPT_TOKEN_ID = 6 + ord("x")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


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


def test_named_registry_routes_distinct_weights_and_model_bound_lens(tmp_path):
    bins = tmp_path / "bins"
    tokenizer_path = _write_bins(bins)
    checkpoint_a = tmp_path / "a.pt"
    checkpoint_b = tmp_path / "b.pt"
    model_a = _engineered_model(ord("A"))
    model_b = _engineered_model(ord("B"))
    _write_checkpoint(checkpoint_a, model_a)
    _write_checkpoint(checkpoint_b, model_b)

    lens = fit_jacobian_lens_v1(
        model_b,
        [torch.tensor([[PROMPT_TOKEN_ID, 6 + ord("B"), PROMPT_TOKEN_ID]])],
        layers=[0],
        checkpoint_sha256=_sha256_file(checkpoint_b),
        tokenizer_sha256=_sha256_file(tokenizer_path),
        dim_batch=2,
        max_seq_len=3,
        skip_first=0,
    )
    lens_path = tmp_path / "b-lens.pt"
    save_jacobian_lens_artifact(lens, lens_path)

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
            "--model-spec",
            f"holorunner-s0-b={checkpoint_b}@{bins}",
            "--workspace-lens",
            f"holorunner-s0-b={lens_path}",
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
        assert health["models"] == ["holorunner-s0", "holorunner-s0-b"]
        assert health["model_workspace_probe"]["models"]["holorunner-s0"]["observe"] is False
        bound_capability = health["model_workspace_probe"]["models"]["holorunner-s0-b"]
        assert bound_capability["observe"] is True
        assert bound_capability["estimator"] == "corpus_position_average_v1"
        assert bound_capability["paperParity"] is True

        status, models = _request_json(f"{base_url}/v1/models")
        assert status == 200
        assert [entry["id"] for entry in models["data"]] == [
            "holorunner-s0",
            "holorunner-s0-b",
        ]

        completions = {}
        for model_name in ("holorunner-s0", "holorunner-s0-b"):
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
            completions[model_name] = completion["choices"][0]["text"]
        assert completions == {"holorunner-s0": "A", "holorunner-s0-b": "B"}

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
        assert receipt["lens"]["estimator"] == "corpus_position_average_v1"
        assert receipt["lens"]["paperParity"] is True
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
            {"model": "holorunner-s0", "prompt": "x", "layers": [0], "k": 1},
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
