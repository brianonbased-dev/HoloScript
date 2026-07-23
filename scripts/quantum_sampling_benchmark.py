#!/usr/bin/env python3
"""Owned-hardware sparse-RBM PCD sampling benchmark.

This runner measures only the Gibbs-sampling phase of persistent contrastive
divergence (PCD). It deliberately excludes model training, parameter updates,
model construction, device transfer, service latency, and QPU access. The
result is a ``cael-quantum-v1.sampling-benchmark`` receipt that the independent
``quantum_receipt_verify.py`` verifier can recompute structurally.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import pathlib
import platform
import statistics
import subprocess
import time
from dataclasses import asdict, dataclass
from typing import Literal, TypedDict

import torch

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
RECEIPT_SCHEMA = "cael-quantum-v1.sampling-benchmark"
FULL_RECEIPT_HASH_SCOPE = "full_receipt_excluding_payload_hash"
REFERENCE_DOI = "10.1103/2g6m-whm2"


class TimingMeasurement(TypedDict):
    k: int
    raw_wall_ms: list[float]
    median_wall_ms: float
    median_ms_per_sample: float
    quality_runs: list[dict[str, float]]


class BackendResult(TypedDict):
    device: str
    status: Literal["available", "unavailable"]
    processor: str
    measurements: list[TimingMeasurement]
    negative_controls: list[dict[str, object]]


class SamplingBenchmarkReceipt(TypedDict):
    schema: str
    benchmark_id: str
    generated_at: str
    claim_boundary: dict[str, object]
    external_reference: dict[str, object]
    model: dict[str, object]
    dataset: dict[str, object]
    sampler: dict[str, object]
    timing_scope: dict[str, object]
    training_scope: dict[str, object]
    hardware: dict[str, object]
    backends: list[BackendResult]
    source_snapshot: list[dict[str, str]]
    source_revision: dict[str, object]
    cost: dict[str, object]
    hash_payload: dict[str, object]
    hash_scope: str
    payload_hash: str


@dataclass(frozen=True)
class BenchmarkConfig:
    visible_nodes: int = 784
    hidden_nodes: int = 1200
    edge_count: int = 18025
    samples: int = 128
    k_values: tuple[int, ...] = (5, 10, 25, 50, 100)
    repeats: int = 5
    warmup_repeats: int = 1
    devices: tuple[str, ...] = ("cpu", "cuda")
    seed: int = 37
    dtype: str = "float32"
    cpu_threads: int = 0

    def validate(self) -> None:
        if self.visible_nodes <= 0 or self.hidden_nodes <= 0:
            raise ValueError("visible_nodes and hidden_nodes must be positive")
        if not 0 < self.edge_count <= self.visible_nodes * self.hidden_nodes:
            raise ValueError("edge_count must fit the bipartite topology")
        if self.samples <= 0 or self.repeats <= 0 or self.warmup_repeats < 0:
            raise ValueError("samples/repeats must be positive and warmups non-negative")
        if not self.k_values or any(k <= 0 for k in self.k_values):
            raise ValueError("all PCD K values must be positive")
        if tuple(sorted(set(self.k_values))) != self.k_values:
            raise ValueError("PCD K values must be unique and sorted")
        if not self.devices or any(device not in {"cpu", "cuda"} for device in self.devices):
            raise ValueError("devices must contain only cpu and/or cuda")
        if self.dtype != "float32":
            raise ValueError("only float32 is currently supported")
        if self.cpu_threads < 0:
            raise ValueError("cpu_threads must be non-negative")


def canonical_hash(value: object) -> str:
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def file_sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _git_revision() -> dict[str, object]:
    try:
        commit = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        dirty = (
            subprocess.run(
                [
                    "git",
                    "status",
                    "--porcelain",
                    "--",
                    "scripts/quantum_sampling_benchmark.py",
                    "scripts/quantum_receipt_verify.py",
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                check=True,
            ).stdout.strip()
            != ""
        )
        return {"commit": commit, "target_sources_dirty": dirty}
    except (OSError, subprocess.CalledProcessError):
        return {"commit": None, "target_sources_dirty": None}


def _build_sparse_model(
    config: BenchmarkConfig,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    generator = torch.Generator(device="cpu")
    generator.manual_seed(config.seed)
    flat = torch.randperm(
        config.visible_nodes * config.hidden_nodes, generator=generator
    )[: config.edge_count]
    visible_index = torch.div(flat, config.hidden_nodes, rounding_mode="floor")
    hidden_index = flat.remainder(config.hidden_nodes)
    weights = torch.randn(config.edge_count, generator=generator) * 0.08
    visible_bias = torch.randn(config.visible_nodes, generator=generator) * 0.02
    hidden_bias = torch.randn(config.hidden_nodes, generator=generator) * 0.02
    indices = torch.stack((visible_index, hidden_index))
    sparse_weight = torch.sparse_coo_tensor(
        indices,
        weights,
        size=(config.visible_nodes, config.hidden_nodes),
        dtype=torch.float32,
    ).coalesce()
    return sparse_weight, visible_bias, hidden_bias, visible_index, hidden_index


def _synchronize(device: torch.device) -> None:
    if device.type == "cuda":
        torch.cuda.synchronize(device)


def _bernoulli(probabilities: torch.Tensor, generator: torch.Generator) -> torch.Tensor:
    return (
        torch.rand(
            probabilities.shape,
            dtype=probabilities.dtype,
            device=probabilities.device,
            generator=generator,
        )
        < probabilities
    ).to(probabilities.dtype)


def _pcd_steps(
    visible: torch.Tensor,
    sparse_weight: torch.Tensor,
    visible_bias: torch.Tensor,
    hidden_bias: torch.Tensor,
    k: int,
    generator: torch.Generator,
) -> tuple[torch.Tensor, torch.Tensor]:
    hidden = torch.empty(
        (visible.shape[0], sparse_weight.shape[1]),
        dtype=visible.dtype,
        device=visible.device,
    )
    weight_t = sparse_weight.transpose(0, 1)
    for _ in range(k):
        hidden_probability = torch.sigmoid(
            torch.sparse.mm(weight_t, visible.transpose(0, 1)).transpose(0, 1)
            + hidden_bias
        )
        hidden = _bernoulli(hidden_probability, generator)
        visible_probability = torch.sigmoid(
            torch.sparse.mm(sparse_weight, hidden.transpose(0, 1)).transpose(0, 1)
            + visible_bias
        )
        visible = _bernoulli(visible_probability, generator)
    return visible, hidden


def _quality_metrics(
    initial_visible: torch.Tensor,
    visible: torch.Tensor,
    hidden: torch.Tensor,
    values: torch.Tensor,
    visible_index: torch.Tensor,
    hidden_index: torch.Tensor,
    visible_bias: torch.Tensor,
    hidden_bias: torch.Tensor,
) -> dict[str, float]:
    interaction = (
        visible[:, visible_index]
        * hidden[:, hidden_index]
        * values.unsqueeze(0)
    ).sum(dim=1)
    energy = (
        -(visible * visible_bias.unsqueeze(0)).sum(dim=1)
        - (hidden * hidden_bias.unsqueeze(0)).sum(dim=1)
        - interaction
    )
    return {
        "mean_energy": float(energy.mean().item()),
        "std_energy": float(energy.std(unbiased=False).item()),
        "visible_one_fraction": float(visible.mean().item()),
        "transition_fraction": float(
            (visible != initial_visible).to(torch.float32).mean().item()
        ),
    }


def _backend_result(
    config: BenchmarkConfig,
    requested_device: str,
    model: tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor],
) -> BackendResult:
    if requested_device == "cuda" and not torch.cuda.is_available():
        return {
            "device": "cuda",
            "status": "unavailable",
            "processor": "torch.cuda.is_available() returned false",
            "measurements": [],
            "negative_controls": [],
        }

    device = torch.device(requested_device)
    if device.type == "cpu" and config.cpu_threads:
        torch.set_num_threads(config.cpu_threads)
    sparse_weight, visible_bias, hidden_bias, visible_index, hidden_index = model
    sparse_weight = sparse_weight.to(device)
    visible_bias = visible_bias.to(device)
    hidden_bias = hidden_bias.to(device)
    visible_index = visible_index.to(device)
    hidden_index = hidden_index.to(device)
    values = sparse_weight.values()
    processor = (
        torch.cuda.get_device_name(device)
        if device.type == "cuda"
        else (platform.processor() or os.environ.get("PROCESSOR_IDENTIFIER", "unknown CPU"))
    )
    measurements: list[TimingMeasurement] = []

    for k in config.k_values:
        for warmup in range(config.warmup_repeats):
            generator = torch.Generator(device=device)
            generator.manual_seed(config.seed + 10_000 + (k * 101) + warmup)
            initial = _bernoulli(
                torch.full(
                    (config.samples, config.visible_nodes),
                    0.5,
                    dtype=torch.float32,
                    device=device,
                ),
                generator,
            )
            _pcd_steps(
                initial,
                sparse_weight,
                visible_bias,
                hidden_bias,
                k,
                generator,
            )
            _synchronize(device)

        raw_wall_ms: list[float] = []
        quality_runs: list[dict[str, float]] = []
        for repeat in range(config.repeats):
            generator = torch.Generator(device=device)
            generator.manual_seed(config.seed + (k * 1_000) + repeat)
            initial = _bernoulli(
                torch.full(
                    (config.samples, config.visible_nodes),
                    0.5,
                    dtype=torch.float32,
                    device=device,
                ),
                generator,
            )
            _synchronize(device)
            started_ns = time.perf_counter_ns()
            visible, hidden = _pcd_steps(
                initial.clone(),
                sparse_weight,
                visible_bias,
                hidden_bias,
                k,
                generator,
            )
            _synchronize(device)
            wall_ms = (time.perf_counter_ns() - started_ns) / 1_000_000
            raw_wall_ms.append(wall_ms)
            quality_runs.append(
                _quality_metrics(
                    initial,
                    visible,
                    hidden,
                    values,
                    visible_index,
                    hidden_index,
                    visible_bias,
                    hidden_bias,
                )
            )
        median_wall_ms = statistics.median(raw_wall_ms)
        measurements.append(
            {
                "k": k,
                "raw_wall_ms": raw_wall_ms,
                "median_wall_ms": median_wall_ms,
                "median_ms_per_sample": median_wall_ms / config.samples,
                "quality_runs": quality_runs,
            }
        )

    control_generator = torch.Generator(device=device)
    control_generator.manual_seed(config.seed + 999_999)
    initial = _bernoulli(
        torch.full(
            (config.samples, config.visible_nodes),
            0.5,
            dtype=torch.float32,
            device=device,
        ),
        control_generator,
    )
    _synchronize(device)
    control_started_ns = time.perf_counter_ns()
    control_visible = initial.clone()
    _synchronize(device)
    control_wall_ms = (time.perf_counter_ns() - control_started_ns) / 1_000_000
    negative_controls = [
        {
            "name": "k-zero-no-transition",
            "k": 0,
            "expected_status": "invalid-sampler",
            "observed_wall_ms": control_wall_ms,
            "transition_fraction": float(
                (control_visible != initial).to(torch.float32).mean().item()
            ),
            "interpretation": (
                "A zero-step copy may be faster than PCD but is not a sample "
                "transition and cannot support a speedup claim."
            ),
        }
    ]
    return {
        "device": requested_device,
        "status": "available",
        "processor": processor,
        "measurements": measurements,
        "negative_controls": negative_controls,
    }


def run_benchmark(config: BenchmarkConfig) -> SamplingBenchmarkReceipt:
    config.validate()
    model = _build_sparse_model(config)
    backends = [
        _backend_result(config, requested_device, model)
        for requested_device in config.devices
    ]
    sparse_weight = model[0]
    total_nodes = config.visible_nodes + config.hidden_nodes
    source_paths = [
        pathlib.Path(__file__).resolve(),
        REPO_ROOT / "scripts" / "quantum_receipt_verify.py",
    ]
    source_snapshot = [
        {
            "path": str(path.relative_to(REPO_ROOT)).replace("\\", "/"),
            "sha256": file_sha256(path),
        }
        for path in source_paths
    ]
    benchmark_id = (
        f"sparse-rbm-pcd-v{config.visible_nodes}-h{config.hidden_nodes}"
        f"-e{config.edge_count}-seed{config.seed}"
    )
    receipt: SamplingBenchmarkReceipt = {
        "schema": RECEIPT_SCHEMA,
        "benchmark_id": benchmark_id,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "claim_boundary": {
            "allowed": (
                "owned-hardware timing calibration for sparse-RBM PCD Gibbs "
                "sampling under the recorded configuration"
            ),
            "forbidden": [
                "end-to-end AI training speedup",
                "quantum advantage",
                "quality-matched comparison to D-Wave Advantage2",
                "reproduction of Kim-Gyhm-Park",
            ],
        },
        "external_reference": {
            "doi": REFERENCE_DOI,
            "reported_scope": "sampling-only",
            "reported_pcd_k100_ms_per_sample": 16.3,
            "reported_dqa_ms_per_sample": 0.256,
            "reported_ratio": 63.67,
            "comparison_status": "context-only; hardware and implementation not matched",
        },
        "model": {
            "family": "sparse restricted Boltzmann machine",
            "visible_nodes": config.visible_nodes,
            "hidden_nodes": config.hidden_nodes,
            "total_nodes": total_nodes,
            "edge_count": config.edge_count,
            "average_degree": (2.0 * config.edge_count) / total_nodes,
            "bipartite_density": config.edge_count
            / (config.visible_nodes * config.hidden_nodes),
            "weight_initialization": "normal(mean=0,std=0.08)",
            "bias_initialization": "normal(mean=0,std=0.02)",
            "topology_seed": config.seed,
            "weights_sha256": canonical_hash(
                {
                    "indices": sparse_weight.indices().tolist(),
                    "values": sparse_weight.values().tolist(),
                }
            ),
        },
        "dataset": {
            "name": "deterministic synthetic Bernoulli chains",
            "training_dataset": None,
            "mnist_used": False,
            "initial_visible_probability": 0.5,
            "seed": config.seed,
        },
        "sampler": {
            "algorithm": "persistent contrastive divergence block Gibbs",
            "k_values": list(config.k_values),
            "samples_per_run": config.samples,
            "repeats": config.repeats,
            "warmup_repeats": config.warmup_repeats,
            "dtype": config.dtype,
            "framework": "PyTorch",
            "framework_version": torch.__version__,
            "cpu_threads": torch.get_num_threads(),
            "config": asdict(config),
        },
        "timing_scope": {
            "clock": "time.perf_counter_ns",
            "device_synchronization": "torch.cuda.synchronize around CUDA timing",
            "includes": ["K alternating hidden/visible Bernoulli Gibbs transitions"],
            "excludes": [
                "model construction",
                "sparse topology construction",
                "host-device transfer",
                "initial-chain allocation",
                "quality-metric calculation",
                "optimizer updates",
                "training epochs",
                "service latency",
            ],
            "per_sample_formula": "median(raw_wall_ms) / samples_per_run",
        },
        "training_scope": {
            "scope": "sampling-only",
            "parameter_updates": False,
            "training_epochs": 0,
            "loss_evaluation": False,
            "generative_quality_evaluation": "energy and transition diagnostics only",
        },
        "hardware": {
            "host_os": platform.platform(),
            "python": platform.python_version(),
            "torch_cuda_version": torch.version.cuda,
            "cuda_available": torch.cuda.is_available(),
            "qpu_used": False,
            "qpu_provider": None,
            "qpu_job_ids": [],
        },
        "backends": backends,
        "source_snapshot": source_snapshot,
        "source_revision": _git_revision(),
        "cost": {
            "external_spend_usd": 0.0,
            "owned_hardware": True,
            "energy_measured": False,
        },
        "hash_payload": {
            "schema": RECEIPT_SCHEMA,
            "benchmark_id": benchmark_id,
            "source_snapshot_sha256": canonical_hash(source_snapshot),
        },
        "hash_scope": FULL_RECEIPT_HASH_SCOPE,
        "payload_hash": "",
    }
    receipt["payload_hash"] = canonical_hash(
        {key: value for key, value in receipt.items() if key != "payload_hash"}
    )
    return receipt


def _parse_int_tuple(value: str) -> tuple[int, ...]:
    try:
        return tuple(int(item.strip()) for item in value.split(",") if item.strip())
    except ValueError as error:
        raise argparse.ArgumentTypeError(str(error)) from error


def _parse_devices(value: str) -> tuple[str, ...]:
    devices = tuple(item.strip().lower() for item in value.split(",") if item.strip())
    if not devices or any(device not in {"cpu", "cuda"} for device in devices):
        raise argparse.ArgumentTypeError("devices must be cpu, cuda, or cpu,cuda")
    return devices


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Benchmark sparse-RBM PCD sampling and emit a CAEL receipt."
    )
    parser.add_argument("--visible-nodes", type=int, default=784)
    parser.add_argument("--hidden-nodes", type=int, default=1200)
    parser.add_argument("--edges", type=int, default=18025)
    parser.add_argument("--samples", type=int, default=128)
    parser.add_argument("--k", type=_parse_int_tuple, default=(5, 10, 25, 50, 100))
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--warmup-repeats", type=int, default=1)
    parser.add_argument("--devices", type=_parse_devices, default=("cpu", "cuda"))
    parser.add_argument("--seed", type=int, default=37)
    parser.add_argument("--cpu-threads", type=int, default=0)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()

    config = BenchmarkConfig(
        visible_nodes=args.visible_nodes,
        hidden_nodes=args.hidden_nodes,
        edge_count=args.edges,
        samples=args.samples,
        k_values=args.k,
        repeats=args.repeats,
        warmup_repeats=args.warmup_repeats,
        devices=args.devices,
        seed=args.seed,
        cpu_threads=args.cpu_threads,
    )
    receipt = run_benchmark(config)
    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    available = [backend["device"] for backend in receipt["backends"] if backend["status"] == "available"]
    print(
        json.dumps(
            {
                "schema": receipt["schema"],
                "output": str(output),
                "payload_hash": receipt["payload_hash"],
                "available_backends": available,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
