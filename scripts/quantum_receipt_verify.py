#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
quantum_receipt_verify.py -- independent verifier for HoloScript quantum receipts.

Receipts emitted by scripts/quantum_execute.py are independently re-verifiable
by anyone, not just the agent that produced them. Simulator receipts use a
canonical JSON hash. IBM receipts additionally retain the legacy value/job hash
and can be checked against IBM Runtime.

  offline (default): recompute canonical ``hash_payload`` hashes for simulator
                     and IBM receipts. For legacy IBM entries, also recompute
                     sha256({"energy": <value>, "job_id": <id>}).

  online (--online): query IBM Runtime for each job_id; confirm the job exists and
                     ran on the claimed backend. For VQE energy receipts, also
                     confirm the job result expectation value matches the recorded
                     energy to <tol>. (QAOA optimal_value is derived classically
                     from sampled counts, so only job existence + backend are
                     checked online for QAOA.) Requires IBM_QUANTUM_API_KEY.

The hashed/certified value is the first present of:
    ibm_zne_opt_energy_Ha | zne_energy_Ha | ibm_energy_Ha   (VQE — also EV-checked online)
    optimal_value                                            (QAOA — existence-checked only)

Usage:
    python3 scripts/quantum_receipt_verify.py
    python3 scripts/quantum_receipt_verify.py --receipt quantum_receipts/example.json
    python3 scripts/quantum_receipt_verify.py --online
    IBM_QUANTUM_API_KEY=<token> python3 scripts/quantum_receipt_verify.py --online
"""

from __future__ import annotations

import argparse
import functools
import hashlib
import importlib.metadata
import json
import math
import os
import pathlib
import platform
import random
import re
import statistics
import subprocess

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
ENERGY_KEYS = ("ibm_zne_opt_energy_Ha", "zne_energy_Ha", "ibm_energy_Ha")
ENV_NAME = "IBM_QUANTUM_API_KEY"
FULL_RECEIPT_HASH_SCOPE = "full_receipt_excluding_payload_hash"
NOVELTY_SCOUT_SCHEMA = "cael-quantum-v2.qaoa-novelty-scout"
PYRAMID_SCOUT_SCHEMA = "cael-quantum-v3.qaoa-paradox-pyramid-scout"
SAMPLING_BENCHMARK_SCHEMA = "cael-quantum-v1.sampling-benchmark"
TERMINAL_KILL_STATUSES = {"survives_tightened_claim", "narrowed", "killed"}
RANDOM_BUDGET_BASIS = (
    "one random bitstring per QAOA shot across all parameter evaluations"
)
PYRAMID_RANDOM_BUDGET_BASIS = (
    "one random semantic bitstring per QAOA shot across all parameter evaluations; "
    "auxiliary bits are deterministically derived"
)
MAX_RANDOM_REPLAY_EVALUATIONS = 1_000_000
ENV_FILE = REPO_ROOT / ".env"
PARADOX_PROBE_FIXTURE_SCHEMA = "holoscript.quantum-paradox-probes.v1"
PARADOX_FORBIDDEN_RANKING_TOKENS = {
    "adjudication",
    "bounded_tradeoff",
    "bug",
    "dissolved",
    "empirical_anomaly",
    "impossibility",
    "new_mechanism",
    "novelty",
    "outcome",
    "paradox_score",
    "productive",
    "retired",
    "unresolved",
    "value_tension",
    "verdict",
}
PARADOX_CANDIDATE_OPTIMIZER_INPUT_FIELDS = [
    "candidates[].id/order",
    "scores",
    "kill_test.status",
    "tags",
    "code_evidence",
    "paradox_probe.code_state",
]
PARADOX_QUBO_CONFIGURATION_INPUT_FIELDS = [
    "score_weights",
    "target_cardinality",
    "cardinality_penalty",
    "redundancy_penalty",
    "kill_status_adjustments",
    "code_evidence_policy",
    "paradox_probe_policy.declared_state_path_churn_weight",
]
PARADOX_ALLOWED_STAGES = {"normalized", "falsifiable", "reproduced"}
PARADOX_CONTROL_RECEIPT_SCHEMA = "holoscript.paradox-control-receipt.v1"
PYRAMID_QUBO_SCHEMA = "holoscript.paradox-pyramid-qubo.v1"
PYRAMID_VARIANTS = {"pairwise", "volume_quadratized"}
PYRAMID_SEMANTIC_VARIABLE_COUNT = 9
PYRAMID_VOLUME_TERM_COUNT = 3
PYRAMID_EQUIVALENCE_TOLERANCE = 1e-6


def is_ibm_receipt(r: dict) -> bool:
    hardware_result = r.get("hardware_result")
    hardware_backend = (
        hardware_result.get("backend") if isinstance(hardware_result, dict) else ""
    )
    return (
        r.get("execution_mode") == "ibm-quantum"
        or str(r.get("backend", "")).startswith("ibm_")
        or str(hardware_backend).startswith("ibm_")
    )


def certified_value(r: dict):
    """Return (key, value, is_energy). is_energy gates the online EV equality check."""
    for k in ENERGY_KEYS:
        if k in r:
            return k, r[k], True
    if "optimal_value" in r:
        return "optimal_value", r["optimal_value"], False
    return None, None, False


def certified_entries(r: dict) -> list[dict]:
    """Return normalized receipt entries with job IDs and payload hashes.

    The bridge emits flat receipts. The first ibm_kingston ratchet receipt stores
    a COBYLA optimization trace under hardware_result.optimization_trace; each
    trace step is independently hash-certified and should be verified.
    """
    hardware_result = r.get("hardware_result")
    if isinstance(hardware_result, dict):
        trace = hardware_result.get("optimization_trace")
        if isinstance(trace, list):
            entries = []
            for item in trace:
                if not isinstance(item, dict):
                    continue
                entries.append(
                    {
                        "label": f"step {item.get('step', '?')}",
                        "key": "energy_ha",
                        "value": item.get("energy_ha"),
                        "job_id": item.get("job_id"),
                        "backend": hardware_result.get("backend"),
                        "payload_hash": item.get("payload_hash"),
                        "is_energy": True,
                    }
                )
            return entries

    key, value, is_energy = certified_value(r)
    return [
        {
            "label": key or "receipt",
            "key": key,
            "value": value,
            "job_id": r.get("job_id"),
            "backend": r.get("backend"),
            "payload_hash": r.get("legacy_payload_hash", r.get("payload_hash")),
            "is_energy": is_energy,
        }
    ]


def expected_hash(value: float, job_id: str) -> str:
    return hashlib.sha256(
        json.dumps({"energy": value, "job_id": job_id}, sort_keys=True).encode()
    ).hexdigest()


def expected_generic_hash(payload: object) -> str:
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def expected_receipt_hash(receipt: dict) -> str | None:
    if receipt.get("hash_scope") == FULL_RECEIPT_HASH_SCOPE:
        return expected_generic_hash(
            {key: value for key, value in receipt.items() if key != "payload_hash"}
        )
    hash_payload = receipt.get("hash_payload")
    if (
        not isinstance(hash_payload, dict)
        and receipt.get("schema") == "cael-quantum-v1.vqe-runner"
    ):
        hash_payload = receipt.get("hashPayload")
    return (
        expected_generic_hash(hash_payload) if isinstance(hash_payload, dict) else None
    )


def linked_code_evidence_verifies(receipt: dict) -> bool | None:
    """Verify the optional outer code-evidence object linked by hash_payload."""

    hash_payload = receipt.get("hash_payload")
    if not isinstance(hash_payload, dict):
        return None
    linked_hash = hash_payload.get("code_evidence_sha256")
    if linked_hash is None:
        return None
    code_evidence = receipt.get("qubo", {}).get("code_evidence")
    return isinstance(code_evidence, list) and linked_hash == expected_generic_hash(
        code_evidence
    )


def sampling_benchmark_receipt_errors(receipt: dict) -> list[str]:
    """Recompute the structural and timing claims in a sampling receipt."""

    errors: list[str] = []
    if receipt.get("schema") != SAMPLING_BENCHMARK_SCHEMA:
        return [f"schema must be {SAMPLING_BENCHMARK_SCHEMA}"]
    try:
        model = receipt["model"]
        visible_nodes = int(model["visible_nodes"])
        hidden_nodes = int(model["hidden_nodes"])
        total_nodes = int(model["total_nodes"])
        edge_count = int(model["edge_count"])
        if total_nodes != visible_nodes + hidden_nodes:
            errors.append("model total_nodes does not recompute")
        expected_degree = (2.0 * edge_count) / total_nodes
        if not math.isclose(
            float(model["average_degree"]), expected_degree, rel_tol=1e-9, abs_tol=1e-12
        ):
            errors.append("model average_degree does not recompute")
        expected_density = edge_count / (visible_nodes * hidden_nodes)
        if not math.isclose(
            float(model["bipartite_density"]),
            expected_density,
            rel_tol=1e-9,
            abs_tol=1e-12,
        ):
            errors.append("model bipartite_density does not recompute")

        sampler = receipt["sampler"]
        samples = int(sampler["samples_per_run"])
        repeats = int(sampler["repeats"])
        expected_k_values = [int(value) for value in sampler["k_values"]]
        if (
            samples <= 0
            or repeats <= 0
            or not expected_k_values
            or any(value <= 0 for value in expected_k_values)
        ):
            errors.append("sampler dimensions must be positive")
        if expected_k_values != sorted(set(expected_k_values)):
            errors.append("sampler k_values must be unique and sorted")
        if receipt["training_scope"].get("scope") != "sampling-only":
            errors.append("training_scope must remain sampling-only")
        if receipt["training_scope"].get("parameter_updates") is not False:
            errors.append("sampling benchmark cannot claim parameter updates")
        if receipt["hardware"].get("qpu_used") is not False:
            errors.append("owned PCD receipt must not claim QPU use")

        available_backends = 0
        for backend in receipt["backends"]:
            status = backend.get("status")
            if status == "unavailable":
                if backend.get("measurements"):
                    errors.append(
                        f"{backend.get('device')} unavailable backend has measurements"
                    )
                continue
            if status != "available":
                errors.append(f"{backend.get('device')} backend status is invalid")
                continue
            available_backends += 1
            measurements = backend["measurements"]
            measured_k_values = [int(item["k"]) for item in measurements]
            if measured_k_values != expected_k_values:
                errors.append(
                    f"{backend.get('device')} measurement K values do not match sampler"
                )
            for measurement in measurements:
                raw = [float(value) for value in measurement["raw_wall_ms"]]
                if len(raw) != repeats or any(
                    not math.isfinite(value) or value <= 0 for value in raw
                ):
                    errors.append(
                        f"{backend.get('device')} K={measurement.get('k')} raw timing invalid"
                    )
                    continue
                median_wall_ms = statistics.median(raw)
                if not math.isclose(
                    float(measurement["median_wall_ms"]),
                    median_wall_ms,
                    rel_tol=1e-9,
                    abs_tol=1e-9,
                ):
                    errors.append(
                        f"{backend.get('device')} K={measurement.get('k')} "
                        "median_wall_ms does not recompute"
                    )
                expected_per_sample = median_wall_ms / samples
                if not math.isclose(
                    float(measurement["median_ms_per_sample"]),
                    expected_per_sample,
                    rel_tol=1e-9,
                    abs_tol=1e-9,
                ):
                    errors.append(
                        f"{backend.get('device')} K={measurement.get('k')} "
                        "median_ms_per_sample does not recompute"
                    )
                quality_runs = measurement["quality_runs"]
                if len(quality_runs) != repeats:
                    errors.append(
                        f"{backend.get('device')} K={measurement.get('k')} "
                        "quality run count does not match repeats"
                    )
                for quality in quality_runs:
                    numeric_values = [
                        float(quality[key])
                        for key in (
                            "mean_energy",
                            "std_energy",
                            "visible_one_fraction",
                            "transition_fraction",
                        )
                    ]
                    if any(not math.isfinite(value) for value in numeric_values):
                        errors.append(
                            f"{backend.get('device')} K={measurement.get('k')} "
                            "quality diagnostics are non-finite"
                        )
                    if not 0.0 <= float(quality["visible_one_fraction"]) <= 1.0:
                        errors.append("visible_one_fraction is outside [0,1]")
                    if not 0.0 <= float(quality["transition_fraction"]) <= 1.0:
                        errors.append("transition_fraction is outside [0,1]")

            controls = backend["negative_controls"]
            zero_controls = [
                control
                for control in controls
                if control.get("name") == "k-zero-no-transition"
            ]
            if len(zero_controls) != 1:
                errors.append(
                    f"{backend.get('device')} must contain one K=0 negative control"
                )
            elif (
                int(zero_controls[0].get("k", -1)) != 0
                or zero_controls[0].get("expected_status") != "invalid-sampler"
                or not math.isclose(
                    float(zero_controls[0].get("transition_fraction", math.nan)),
                    0.0,
                    rel_tol=0.0,
                    abs_tol=0.0,
                )
            ):
                errors.append(
                    f"{backend.get('device')} K=0 negative control does not recompute"
                )
        if available_backends == 0:
            errors.append("receipt has no available benchmark backend")

        source_snapshot = receipt["source_snapshot"]
        if not source_snapshot:
            errors.append("source_snapshot is empty")
        for source in source_snapshot:
            if not re.fullmatch(r"[0-9a-f]{64}", str(source.get("sha256", ""))):
                errors.append("source_snapshot contains an invalid sha256")
        hash_payload = receipt["hash_payload"]
        if hash_payload.get("source_snapshot_sha256") != expected_generic_hash(
            source_snapshot
        ):
            errors.append("source snapshot hash does not recompute")
        if hash_payload.get("schema") != SAMPLING_BENCHMARK_SCHEMA:
            errors.append("hash_payload schema mismatch")
        if hash_payload.get("benchmark_id") != receipt.get("benchmark_id"):
            errors.append("hash_payload benchmark_id mismatch")
    except (KeyError, TypeError, ValueError, ZeroDivisionError) as error:
        errors.append(f"malformed sampling-benchmark receipt: {error}")
    return errors


def _qubo_objective(bitstring: str, matrix: list[list[float]]) -> float:
    if len(bitstring) != len(matrix) or any(bit not in "01" for bit in bitstring):
        raise ValueError("invalid QUBO bitstring")
    bits = [int(bit) for bit in bitstring]
    return float(
        sum(float(matrix[i][i]) * bits[i] for i in range(len(bits)))
        + sum(
            float(matrix[i][j]) * bits[i] * bits[j]
            for i in range(len(bits))
            for j in range(i + 1, len(bits))
        )
    )


def _qubo_matrix_errors(matrix: object, expected_size: int) -> list[str]:
    """Reject malformed or unexpectedly large matrices before exponential replay."""

    if not 1 <= expected_size <= 20:
        return ["QUBO model size is outside the verified 1..20 bound"]
    if not isinstance(matrix, list) or len(matrix) != expected_size:
        return ["QUBO matrix dimension does not match the declared model"]
    errors: list[str] = []
    for row_index, row in enumerate(matrix):
        if not isinstance(row, list) or len(row) != expected_size:
            errors.append("QUBO matrix is not square at the declared model size")
            continue
        for column_index, value in enumerate(row):
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
            ):
                errors.append("QUBO matrix contains a non-finite numeric entry")
                continue
            if row_index > column_index and abs(float(value)) > 1e-12:
                errors.append("QUBO matrix violates the upper-triangular convention")
    return sorted(set(errors))


def _selected_ids(bitstring: str, candidate_ids: list[str]) -> list[str]:
    return [candidate_ids[index] for index, bit in enumerate(bitstring) if bit == "1"]


def _exact_qubo_solution(matrix: list[list[float]]) -> tuple[str, float]:
    size = len(matrix)
    best_bits = "0" * size
    best_value = float("inf")
    for mask in range(1 << size):
        bits = format(mask, f"0{size}b")
        value = _qubo_objective(bits, matrix)
        if value < best_value:
            best_bits = bits
            best_value = value
    return best_bits, best_value


def _verifier_qaoa_pauli_terms(
    matrix: list[list[float]],
) -> list[tuple[str, float]]:
    """Construct the QUBO cost Hamiltonian without importing the executor."""

    size = len(matrix)

    def z_label(*indices: int) -> str:
        label = ["I"] * size
        for index in indices:
            label[index] = "Z"
        return "".join(label)

    terms: list[tuple[str, float]] = []
    for i in range(size):
        qii = float(matrix[i][i])
        if qii != 0.0:
            terms.append(("I" * size, qii / 2))
            terms.append((z_label(i), -qii / 2))
        for j in range(i + 1, size):
            qij = float(matrix[i][j])
            if qij == 0.0:
                continue
            terms.append(("I" * size, qij / 4))
            terms.append((z_label(i), -qij / 4))
            terms.append((z_label(j), -qij / 4))
            terms.append((z_label(i, j), qij / 4))
    return terms or [("I" * size, 0.0)]


def _verifier_qaoa_parameter_values(
    parameters: object,
    gamma: float,
    beta: float,
) -> list[float]:
    ordered = list(parameters)  # type: ignore[arg-type]
    midpoint = len(ordered) // 2
    values: list[float] = []
    for index, parameter in enumerate(ordered):
        name = str(parameter).lower()
        if "beta" in name or "\N{GREEK SMALL LETTER BETA}" in name:
            values.append(float(beta))
        elif "gamma" in name or "\N{GREEK SMALL LETTER GAMMA}" in name:
            values.append(float(gamma))
        else:
            values.append(float(beta if index < midpoint else gamma))
    return values


@functools.lru_cache(maxsize=16)
def _deterministic_statevector_qaoa_replay(
    matrix_json: str,
    shots: int,
    grid_points: int,
    seed: int,
) -> dict:
    """Replay the seeded p=1 StatevectorSampler search used by Pyramid receipts."""

    import numpy as np
    from qiskit.circuit.library import QAOAAnsatz
    from qiskit.primitives import StatevectorSampler
    from qiskit.quantum_info import SparsePauliOp

    matrix = json.loads(matrix_json)
    size = len(matrix)
    cost_op = SparsePauliOp.from_list(_verifier_qaoa_pauli_terms(matrix)).simplify()
    mixer_op = SparsePauliOp.from_list(
        [("I" * i + "X" + "I" * (size - i - 1), 1.0) for i in range(size)]
    )
    ansatz = QAOAAnsatz(cost_op, reps=1, mixer_operator=mixer_op)
    sampler_ansatz = ansatz.copy()
    sampler_ansatz.measure_all()
    sampler = StatevectorSampler(default_shots=shots, seed=seed)
    best_expectation = float("inf")
    best_counts: dict[str, int] = {}
    best_parameters: list[float] = []
    gamma_values = np.linspace(0, np.pi, grid_points)
    beta_values = np.linspace(0, np.pi / 2, grid_points)
    for gamma in gamma_values:
        for beta in beta_values:
            parameter_values = _verifier_qaoa_parameter_values(
                ansatz.parameters, gamma, beta
            )
            result = sampler.run([(sampler_ansatz, parameter_values)]).result()[0]
            counts = result.data.meas.get_counts()
            total = sum(counts.values())
            if total <= 0:
                continue
            expectation = sum(
                _qubo_objective(bitstring, matrix) * count
                for bitstring, count in counts.items()
            ) / total
            if expectation < best_expectation:
                best_expectation = float(expectation)
                best_counts = counts
                best_parameters = parameter_values
    if not best_counts:
        raise ValueError("deterministic QAOA replay produced no counts")
    sampled_values = {
        bitstring: _qubo_objective(bitstring, matrix) for bitstring in best_counts
    }
    optimal_bitstring = min(sampled_values, key=sampled_values.get)
    optimal_value = float(sampled_values[optimal_bitstring])
    classical_bitstring, classical_value = _exact_qubo_solution(matrix)
    return {
        "optimal_bitstring": optimal_bitstring,
        "optimal_value": optimal_value,
        "best_sampled_expectation": best_expectation,
        "selected_parameters": best_parameters,
        "classical_optimal_bitstring": classical_bitstring,
        "classical_optimal_value": float(classical_value),
        "optimality_gap": abs(optimal_value - float(classical_value)),
        "optimizer_evaluations": grid_points**2,
    }


def _pyramid_qaoa_execution_errors(
    execution: dict,
    qaoa_result: dict,
    matrix: list[list[float]],
    run_configuration: dict,
    environment: dict,
) -> list[str]:
    """Independently replay every deterministic local StatevectorSampler claim."""

    errors: list[str] = []
    if not isinstance(environment, dict):
        return ["pyramid QAOA replay environment is not an object"]
    shots = int(run_configuration["shots"])
    grid_points = int(run_configuration["grid_points"])
    seed = int(run_configuration["seed"])
    try:
        replay_versions = {
            "python": platform.python_version(),
            "qiskit": importlib.metadata.version("qiskit"),
            "numpy": importlib.metadata.version("numpy"),
        }
    except Exception as error:
        return [f"pyramid QAOA replay environment is unavailable: {type(error).__name__}"]
    if any(environment.get(key) != value for key, value in replay_versions.items()):
        errors.append(
            "pyramid QAOA replay requires the receipt's Python/Qiskit/NumPy versions"
        )
        return errors
    expected_input = expected_generic_hash(
        {
            "problem_type": "qubo",
            "matrix": matrix,
            "p": 1,
            "shots": shots,
            "grid_points": grid_points,
            "seed": seed,
            "execution_mode": "aer",
        }
    )
    expected_job_id = f"simulator:{expected_input[:16]}"
    try:
        replay = _deterministic_statevector_qaoa_replay(
            json.dumps(matrix, separators=(",", ":")),
            shots,
            grid_points,
            seed,
        )
    except Exception as error:
        return [f"pyramid QAOA deterministic replay failed: {type(error).__name__}"]
    expected_fixed = {
        "schema": "cael-quantum-v1.qaoa",
        "script": "scripts/quantum_execute.py",
        "task": "qaoa",
        "method": "QAOA-qubo-p1",
        "problem_type": "qubo",
        "objective_sense": "minimize",
        "matrix_convention": (
            "upper-triangular: sum_i Qii*x_i + sum_{i<j} Qij*x_i*x_j"
        ),
        "input_sha256": expected_input,
        "execution_mode": "aer",
        "backend": "statevector-sampler",
        "shots": shots,
        "job_id": expected_job_id,
        "all_job_ids": [],
        "optimizer": "expectation-grid",
        "optimizer_evaluations": grid_points**2,
        "approximation_ratio": None,
        "num_qubits": len(matrix),
        "hash_scheme": "sha256-canonical-json-v1",
    }
    for key, expected in expected_fixed.items():
        if not _structure_close(execution.get(key), expected):
            errors.append(f"nested QAOA {key} does not match deterministic replay")
    for key in (
        "optimal_bitstring",
        "optimal_value",
        "best_sampled_expectation",
        "selected_parameters",
        "classical_optimal_bitstring",
        "classical_optimal_value",
        "optimality_gap",
    ):
        if not _structure_close(execution.get(key), replay[key]):
            errors.append(f"nested QAOA {key} does not replay")
    expected_hash_payload = {
        "input_sha256": expected_input,
        "job_id": expected_job_id,
        "optimal_bitstring": replay["optimal_bitstring"],
        "optimal_value": replay["optimal_value"],
    }
    if not _structure_close(execution.get("hash_payload"), expected_hash_payload):
        errors.append("nested QAOA hash payload does not replay")
    if execution.get("payload_hash") != expected_generic_hash(expected_hash_payload):
        errors.append("nested QAOA payload hash does not replay")
    if not _structure_close(
        qaoa_result.get("best_sampled_expectation"),
        replay["best_sampled_expectation"],
    ):
        errors.append("outer QAOA sampled expectation does not replay")
    if not _structure_close(
        qaoa_result.get("selected_parameters"), replay["selected_parameters"]
    ):
        errors.append("outer QAOA selected parameters do not replay")
    wall_time = execution.get("wall_time_s")
    if (
        isinstance(wall_time, bool)
        or not isinstance(wall_time, (int, float))
        or not math.isfinite(float(wall_time))
        or float(wall_time) < 0.0
    ):
        errors.append("nested QAOA wall time is invalid")
    elif not _structure_close(qaoa_result.get("runtime_seconds"), wall_time):
        errors.append("outer QAOA runtime does not match the nested receipt")
    return errors


def _greedy_bitstring(qubo: dict) -> str:
    size = len(qubo["candidate_rewards"])
    selected: list[int] = []
    available = set(range(size))
    for _ in range(int(qubo["target_cardinality"])):
        choice = max(
            available,
            key=lambda index: (
                float(qubo["candidate_rewards"][index])
                - sum(
                    float(qubo["redundancy_penalty"])
                    * float(
                        qubo["tag_similarities"][min(index, prior)][max(index, prior)]
                    )
                    + float(qubo["code_similarity_penalty"])
                    * float(
                        qubo["code_similarities"][min(index, prior)][max(index, prior)]
                    )
                    for prior in selected
                ),
                -index,
            ),
        )
        selected.append(choice)
        available.remove(choice)
    return "".join("1" if index in selected else "0" for index in range(size))


def _pyramid_greedy_bitstring(fixture: dict, qubo: dict) -> str:
    semantic_count = int(qubo["semantic_variable_count"])
    selected: list[int] = []
    available = set(range(semantic_count))
    for _ in range(int(qubo["target_cardinality"])):
        scored_choices: list[tuple[float, int]] = []
        for index in available:
            trial = set(selected)
            trial.add(index)
            semantic = "".join(
                "1" if bit_index in trial else "0"
                for bit_index in range(semantic_count)
            )
            expanded = _encode_expected_pyramid_bitstring(semantic, qubo)
            metrics = _pyramid_portfolio_core(expanded, fixture, qubo)
            scored_choices.append((metrics["decoded_hubo_raw_objective"], index))
        _, choice = min(scored_choices, key=lambda item: (item[0], item[1]))
        selected.append(choice)
        available.remove(choice)
    semantic = "".join(
        "1" if index in selected else "0" for index in range(semantic_count)
    )
    return _encode_expected_pyramid_bitstring(semantic, qubo)


def _semantic_exact_pyramid_solution(qubo: dict) -> tuple[str, float]:
    semantic_count = int(qubo["semantic_variable_count"])
    best_bits = _encode_expected_pyramid_bitstring("0" * semantic_count, qubo)
    best_value = float("inf")
    for mask in range(1 << semantic_count):
        semantic = format(mask, f"0{semantic_count}b")
        expanded = _encode_expected_pyramid_bitstring(semantic, qubo)
        value = _qubo_objective(expanded, qubo["matrix"])
        if value < best_value:
            best_bits = expanded
            best_value = value
    return best_bits, best_value


def _seeded_pyramid_random_bitstring(
    qubo: dict, budget: int, seed: int
) -> str:
    rng = random.Random(seed)
    semantic_count = int(qubo["semantic_variable_count"])
    best_bits = _encode_expected_pyramid_bitstring("0" * semantic_count, qubo)
    best_value = float("inf")
    for _ in range(budget):
        semantic = format(
            rng.randrange(1 << semantic_count), f"0{semantic_count}b"
        )
        expanded = _encode_expected_pyramid_bitstring(semantic, qubo)
        value = _qubo_objective(expanded, qubo["matrix"])
        if value < best_value:
            best_bits = expanded
            best_value = value
    return best_bits


def _seeded_random_bitstring(
    matrix: list[list[float]],
    budget: int,
    seed: int,
) -> str:
    rng = random.Random(seed)
    size = len(matrix)
    best_bits = "0" * size
    best_value = float("inf")
    for _ in range(budget):
        bits = format(rng.randrange(1 << size), f"0{size}b")
        value = _qubo_objective(bits, matrix)
        if value < best_value:
            best_bits = bits
            best_value = value
    return best_bits


def _close(left: object, right: object) -> bool:
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return math.isclose(float(left), float(right), rel_tol=0.0, abs_tol=1e-6)
    return left == right


def _structure_close(left: object, right: object) -> bool:
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(
            _structure_close(left[key], right[key]) for key in left
        )
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(
            _structure_close(left_item, right_item)
            for left_item, right_item in zip(left, right, strict=True)
        )
    return _close(left, right)


def _scoped_source_signature(snapshot: object) -> str | None:
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("files"), list):
        return None
    try:
        return expected_generic_hash(
            {
                "scoped_dirty": snapshot["scoped_dirty"],
                "scoped_status": snapshot["scoped_status"],
                "files": [
                    {
                        "path": record["path"],
                        "worktree_bytes": record["worktree_bytes"],
                        "worktree_sha256": record["worktree_sha256"],
                        "git_blob_oid": record["git_blob_oid"],
                        "git_blob_bytes": record["git_blob_bytes"],
                        "git_blob_sha256": record["git_blob_sha256"],
                    }
                    for record in snapshot["files"]
                ],
            }
        )
    except (KeyError, TypeError):
        return None


def _post_execution_snapshot_errors(
    pre_snapshot: dict,
    post_snapshot: object,
    stability: object,
) -> list[str]:
    errors: list[str] = []
    pre_signature = _scoped_source_signature(pre_snapshot)
    post_signature = _scoped_source_signature(post_snapshot)
    if pre_signature is None or post_signature is None:
        return ["paradox execution source-stability snapshot is malformed"]
    if pre_signature != post_signature:
        errors.append("paradox scoped sources changed during execution")
    if not isinstance(post_snapshot, dict):
        return errors
    post_head = post_snapshot.get("head_commit")
    if _git_commit_tree_oid(post_head) != post_snapshot.get("head_tree"):
        errors.append("post-execution HEAD tree does not match its commit")
    post_status = post_snapshot.get("scoped_status")
    if not isinstance(post_status, list):
        errors.append("post-execution scoped status is malformed")
        post_status = []
    if bool(post_status) != bool(post_snapshot.get("scoped_dirty")):
        errors.append("post-execution dirty flag does not match its status")
    status_by_path = _status_by_path(post_status)
    for record in post_snapshot.get("files", []):
        if not isinstance(record, dict):
            errors.append("post-execution source record is malformed")
            continue
        path = _safe_repo_path(record.get("path"))
        if path is None:
            errors.append("post-execution source snapshot contains an unsafe path")
            continue
        oid = record.get("git_blob_oid")
        head_oid = _git_tree_blob_oid(post_head, path)
        if head_oid != oid:
            if path not in status_by_path:
                errors.append(
                    f"post-execution source is not pinned by HEAD or status: {path}"
                )
            elif _git_worktree_blob_oid(path) != oid:
                errors.append(
                    f"post-execution dirty source no longer matches its blob: {path}"
                )
    expected_stability = {
        "pre_scoped_signature_sha256": pre_signature,
        "post_scoped_signature_sha256": post_signature,
        "scoped_sources_unchanged_during_execution": True,
        "pre_head_commit": pre_snapshot.get("head_commit"),
        "post_head_commit": post_snapshot.get("head_commit"),
        "unrelated_head_advance_allowed": True,
    }
    if stability != expected_stability:
        errors.append("paradox execution source-stability declaration is invalid")
    return errors


def _safe_repo_path(raw_path: object) -> str | None:
    if not isinstance(raw_path, str) or not raw_path:
        return None
    normalized = raw_path.replace("\\", "/")
    path = pathlib.PurePosixPath(normalized)
    if path.is_absolute() or ".." in path.parts or ":" in path.parts[0]:
        return None
    return path.as_posix()


@functools.lru_cache(maxsize=512)
def _git_blob_bytes(oid: object) -> bytes | None:
    if not isinstance(oid, str) or len(oid) not in {40, 64}:
        return None
    if any(character not in "0123456789abcdef" for character in oid.lower()):
        return None
    completed = subprocess.run(
        ["git", "cat-file", "blob", oid],
        cwd=REPO_ROOT,
        capture_output=True,
        check=False,
    )
    return completed.stdout if completed.returncode == 0 else None


@functools.lru_cache(maxsize=2048)
def _git_tree_blob_oid(commit: object, path: str) -> str | None:
    if not isinstance(commit, str) or len(commit) not in {40, 64}:
        return None
    completed = subprocess.run(
        ["git", "rev-parse", "--verify", f"{commit}:{path}"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return completed.stdout.strip() if completed.returncode == 0 else None


@functools.lru_cache(maxsize=512)
def _git_commit_tree_oid(commit: object) -> str | None:
    if not isinstance(commit, str) or len(commit) not in {40, 64}:
        return None
    completed = subprocess.run(
        ["git", "rev-parse", "--verify", f"{commit}^{{tree}}"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return completed.stdout.strip() if completed.returncode == 0 else None


@functools.lru_cache(maxsize=512)
def _git_worktree_blob_oid(path: str) -> str | None:
    completed = subprocess.run(
        ["git", "hash-object", "--", path],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return completed.stdout.strip() if completed.returncode == 0 else None


def _status_by_path(status_lines: object) -> dict[str, str]:
    paths: dict[str, str] = {}
    if not isinstance(status_lines, list):
        return paths
    for line in status_lines:
        if not isinstance(line, str) or len(line) < 4:
            continue
        status = line[:2]
        payload = line[3:].strip().strip('"').replace("\\", "/")
        if " -> " in payload:
            for part in payload.split(" -> "):
                paths[part.strip().strip('"')] = status
        elif payload:
            paths[payload] = status
    return paths


@functools.lru_cache(maxsize=512)
def _live_status_for_path(path: str) -> str | None:
    completed = subprocess.run(
        ["git", "status", "--porcelain=v1", "--", path],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return None
    return _status_by_path(completed.stdout.splitlines()).get(path)


def _validate_source_snapshot(
    receipt: dict,
) -> tuple[dict[str, dict], dict[str, bytes], list[str]]:
    errors: list[str] = []
    source_state = receipt["source_state"]
    status_lines = source_state["scoped_status"]
    status_by_path = _status_by_path(status_lines)
    if bool(status_lines) != bool(source_state["scoped_dirty"]):
        errors.append("source snapshot dirty flag does not match its status")
    for path, status in status_by_path.items():
        if _live_status_for_path(path) != status:
            errors.append(f"source snapshot status is not live-verifiable: {path}")
    head_commit = source_state["head_commit"]
    if _git_commit_tree_oid(head_commit) != source_state.get("head_tree"):
        errors.append("source snapshot HEAD tree does not match its commit")
    records: dict[str, dict] = {}
    blobs: dict[str, bytes] = {}
    for record in source_state["files"]:
        path = _safe_repo_path(record.get("path"))
        if path is None:
            errors.append("source snapshot contains an unsafe path")
            continue
        if path in records:
            errors.append(f"source snapshot repeats path: {path}")
            continue
        records[path] = record
        oid = record.get("git_blob_oid")
        blob = _git_blob_bytes(oid)
        if blob is None:
            errors.append(f"source snapshot Git blob is unavailable: {path}")
            continue
        blobs[path] = blob
        if record.get("git_blob_bytes") != len(blob):
            errors.append(f"source snapshot Git blob size mismatch: {path}")
        if record.get("git_blob_sha256") != hashlib.sha256(blob).hexdigest():
            errors.append(f"source snapshot Git blob hash mismatch: {path}")
        head_oid = _git_tree_blob_oid(head_commit, path)
        if head_oid != oid:
            if path not in status_by_path:
                errors.append(
                    f"source snapshot path is not pinned by HEAD or status: {path}"
                )
            elif _git_worktree_blob_oid(path) != oid:
                errors.append(
                    f"source snapshot dirty path no longer matches its blob: {path}"
                )
    return records, blobs, errors


def _has_forbidden_ranking_token(value: str, forbidden: set[str]) -> bool:
    camel_split = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", value.strip())
    normalized = re.sub(r"[^a-z0-9]+", "_", camel_split.lower()).strip("_")
    compact = normalized.replace("_", "")
    return any(
        re.search(rf"(?:^|_){re.escape(token)}(?:_|$)", normalized)
        or (
            len(token.replace("_", "")) >= 5
            and token.replace("_", "") in compact
        )
        for token in forbidden
    )


def _pyramid_fixture_errors(fixture: dict) -> list[str]:
    """Independently validate the strict nine-variable pyramid fixture."""

    errors: list[str] = []
    try:
        config = fixture["pyramid_qubo"]
        if not isinstance(config, dict):
            return ["pyramid_qubo is not an object"]
        if config.get("schema") != PYRAMID_QUBO_SCHEMA:
            errors.append("pyramid_qubo schema mismatch")
        if config.get("default_variant") not in PYRAMID_VARIANTS:
            errors.append("pyramid_qubo default variant is unsupported")
        candidates = fixture["candidates"]
        if len(candidates) != PYRAMID_SEMANTIC_VARIABLE_COUNT:
            errors.append("pyramid fixture does not contain exactly nine candidates")
        fixture_ids = [candidate["id"] for candidate in candidates]
        faces = config.get("faces")
        if not isinstance(faces, list) or len(faces) != 3:
            errors.append("pyramid fixture does not contain three ordered faces")
            faces = []
        face_ids: list[str] = []
        ordered_candidate_ids: list[str] = []
        for face in faces:
            if not isinstance(face, dict):
                errors.append("pyramid face is not an object")
                continue
            face_id = face.get("id")
            members = face.get("candidate_ids")
            if (
                not isinstance(face_id, str)
                or not face_id
                or face_id in face_ids
            ):
                errors.append("pyramid face IDs are not non-empty and unique")
            else:
                face_ids.append(face_id)
            if (
                not isinstance(members, list)
                or len(members) != 3
                or len(members) != len(set(members))
                or any(not isinstance(item, str) or not item for item in members)
            ):
                errors.append("pyramid face does not contain three unique candidates")
            else:
                ordered_candidate_ids.extend(members)
        if ordered_candidate_ids != fixture_ids:
            errors.append(
                "pyramid faces do not partition candidates in declared order"
            )

        structural = config.get("structural_pair_coefficients")
        structural_keys = {
            "same_face",
            "aligned_cross_face",
            "other_cross_face",
        }
        if not isinstance(structural, dict) or set(structural) != structural_keys:
            errors.append("pyramid structural pair coefficients are incomplete")
        else:
            structural_values = [float(structural[key]) for key in structural]
            if any(
                not math.isfinite(value) or not -1.0 <= value <= 1.0
                for value in structural_values
            ) or not any(abs(value) > 1e-12 for value in structural_values):
                errors.append(
                    "pyramid structural pair coefficients are not finite, "
                    "nontrivial, and in [-1, 1]"
                )
        cubic = config.get("aligned_cubic_coefficients")
        if (
            not isinstance(cubic, list)
            or len(cubic) != PYRAMID_VOLUME_TERM_COUNT
            or any(
                not math.isfinite(float(value))
                or not -1.0 <= float(value) <= 1.0
                or abs(float(value)) <= 1e-12
                for value in cubic
            )
        ):
            errors.append(
                "pyramid aligned cubic coefficients are not three nonzero values "
                "in [-1, 1]"
            )
        margin = float(config.get("rosenberg_margin", 0.0))
        if not math.isfinite(margin) or margin <= PYRAMID_EQUIVALENCE_TOLERANCE:
            errors.append("pyramid Rosenberg margin does not exceed tolerance")
        if not isinstance(config.get("claim_boundary"), str) or not config[
            "claim_boundary"
        ]:
            errors.append("pyramid claim boundary is missing")
        if not isinstance(config.get("coefficient_provenance"), str) or not config[
            "coefficient_provenance"
        ]:
            errors.append("pyramid coefficient provenance is missing")
        for claim_field in (
            "author_blinding_claimed",
            "optimizer_outcome_independence_claimed",
            "quantum_advantage_claimed",
            "literal_3d_quantum_processing_claimed",
        ):
            if config.get(claim_field) is not False:
                errors.append(f"pyramid fixture does not set {claim_field}=false")
    except (KeyError, TypeError, ValueError) as error:
        errors.append(f"malformed pyramid fixture: {error}")
    return errors


def _pyramid_variable_contract(fixture: dict) -> list[dict]:
    variables: list[dict] = []
    for face_index, face in enumerate(fixture["pyramid_qubo"]["faces"]):
        for slot, candidate_id in enumerate(face["candidate_ids"]):
            variables.append(
                {
                    "index": len(variables),
                    "kind": "semantic",
                    "id": candidate_id,
                    "candidate_id": candidate_id,
                    "face_id": face["id"],
                    "face_index": face_index,
                    "slot": slot,
                }
            )
    return variables


def _add_expected_qubo_coefficient(
    matrix: list[list[float]], left: int, right: int, value: float
) -> None:
    i, j = sorted((left, right))
    matrix[i][j] = round(float(matrix[i][j]) + float(value), 10)


def _expected_pyramid_structure(
    fixture: dict,
    base_matrix: list[list[float]],
    variant: str,
) -> dict:
    """Construct pyramid matrices and Rosenberg metadata without scout imports."""

    semantic_count = len(fixture["candidates"])
    config = fixture["pyramid_qubo"]
    variables = _pyramid_variable_contract(fixture)
    coefficients = {
        key: float(value)
        for key, value in config["structural_pair_coefficients"].items()
    }
    structural_matrix = [
        [0.0 for _ in range(semantic_count)] for _ in range(semantic_count)
    ]
    semantic_matrix = [row[:] for row in base_matrix]
    structural_terms: list[dict] = []
    for i in range(semantic_count):
        for j in range(i + 1, semantic_count):
            left = variables[i]
            right = variables[j]
            if left["face_index"] == right["face_index"]:
                relation = "same_face"
            elif left["slot"] == right["slot"]:
                relation = "aligned_cross_face"
            else:
                relation = "other_cross_face"
            coefficient = coefficients[relation]
            structural_matrix[i][j] = coefficient
            _add_expected_qubo_coefficient(semantic_matrix, i, j, coefficient)
            structural_terms.append(
                {
                    "left_index": i,
                    "right_index": j,
                    "relation": relation,
                    "coefficient": coefficient,
                }
            )

    expected = {
        "pyramid_variant": variant,
        "semantic_variable_count": semantic_count,
        "ancilla_variable_count": 0,
        "total_variable_count": semantic_count,
        "variable_order": variables[:],
        "base_portfolio_matrix": base_matrix,
        "structural_pair_matrix": structural_matrix,
        "semantic_pairwise_matrix": semantic_matrix,
        "structural_pair_coefficients": coefficients,
        "structural_pair_terms": structural_terms,
        "higher_order_terms": [],
        "quadratization": None,
        "matrix": semantic_matrix,
        "convention": (
            "upper triangular: first nine bits are semantic candidates; "
            "sum_i Qii*x_i + sum_{i<j} Qij*x_i*x_j"
        ),
    }
    if variant == "pairwise":
        return expected

    cubic_coefficients = [
        float(value) for value in config["aligned_cubic_coefficients"]
    ]
    margin = float(config["rosenberg_margin"])
    total_count = semantic_count + PYRAMID_VOLUME_TERM_COUNT
    expanded_matrix = [[0.0 for _ in range(total_count)] for _ in range(total_count)]
    for i in range(semantic_count):
        for j in range(i, semantic_count):
            expanded_matrix[i][j] = semantic_matrix[i][j]

    higher_order_terms: list[dict] = []
    reduction_terms: list[dict] = []
    for slot, coefficient in enumerate(cubic_coefficients):
        semantic_indices = [slot, 3 + slot, 6 + slot]
        left, right, remaining = semantic_indices
        ancilla_index = semantic_count + slot
        ancilla_id = f"ancilla:aligned-volume:{slot}"
        penalty_strength = abs(coefficient) + margin
        _add_expected_qubo_coefficient(
            expanded_matrix, left, right, penalty_strength
        )
        _add_expected_qubo_coefficient(
            expanded_matrix, left, ancilla_index, -2 * penalty_strength
        )
        _add_expected_qubo_coefficient(
            expanded_matrix, right, ancilla_index, -2 * penalty_strength
        )
        _add_expected_qubo_coefficient(
            expanded_matrix, ancilla_index, ancilla_index, 3 * penalty_strength
        )
        _add_expected_qubo_coefficient(
            expanded_matrix, remaining, ancilla_index, coefficient
        )
        term_id = f"aligned-volume:{slot}"
        semantic_ids = [variables[index]["id"] for index in semantic_indices]
        higher_order_terms.append(
            {
                "id": term_id,
                "slot": slot,
                "semantic_indices": semantic_indices,
                "semantic_ids": semantic_ids,
                "coefficient": coefficient,
            }
        )
        reduction_terms.append(
            {
                "higher_order_term_id": term_id,
                "substitution": f"{ancilla_id}=x{left}*x{right}",
                "substitution_pair": [left, right],
                "remaining_index": remaining,
                "ancilla_id": ancilla_id,
                "ancilla_index": ancilla_index,
                "cubic_coefficient": coefficient,
                "penalty_strength": penalty_strength,
                "minimum_wrong_assignment_gap_bound": margin,
            }
        )
        variables.append(
            {
                "index": ancilla_index,
                "kind": "ancilla",
                "id": ancilla_id,
                "represents_product_of": [left, right],
                "higher_order_term_id": term_id,
            }
        )
    quadratization = {
        "method": "rosenberg-pair-product-v1",
        "penalty_polynomial": "M*(a*b-2*a*y-2*b*y+3*y)",
        "strength_rule": "M_k=abs(t_k)+rosenberg_margin",
        "rosenberg_margin": margin,
        "ancillas_isolated": True,
        "constant_offset_delta": 0.0,
        "terms": reduction_terms,
    }
    expected.update(
        {
            "ancilla_variable_count": PYRAMID_VOLUME_TERM_COUNT,
            "total_variable_count": total_count,
            "variable_order": variables,
            "higher_order_terms": higher_order_terms,
            "quadratization": quadratization,
            "matrix": expanded_matrix,
            "convention": (
                "upper triangular: first nine bits are semantic candidates and final "
                "three bits are deterministic Rosenberg ancillas"
            ),
        }
    )
    expected["quadratization"]["equivalence_certificate"] = (
        _expected_pyramid_equivalence_certificate(expected)
    )
    return expected


def _expected_pyramid_composition(
    model: dict,
    input_sha256: str,
    code_evidence: list[dict],
) -> str:
    """Independently reconstruct the pinned Pyramid HoloScript matrix mirror."""

    matrix_json = json.dumps(model["matrix"], separators=(",", ":"))
    matrix_literal = json.dumps(matrix_json)
    code_evidence_sha256 = expected_generic_hash(code_evidence)
    variable_ids = [variable["id"] for variable in model["variable_order"]]
    return (
        "// Generated by scripts/quantum_novelty_scout.py\n"
        f"// Canonical model input sha256: {input_sha256}\n"
        f"// Code evidence sha256: {code_evidence_sha256}\n"
        f"// Variable order: {','.join(f'{index}={item}' for index, item in enumerate(variable_ids))}\n"
        "// QUBO ranks priors plus hash-bound code evidence; it does not prove novelty.\n"
        "// Pyramid geometry is a visual metaphor for a binary interaction model; "
        "ancillas are encoding overhead, not research variables.\n"
        "// This composition mirrors the Python-executed matrix; it is not an execution receipt.\n"
        'composition "Quantum Novelty Scout" {\n'
        '  object "Novelty Portfolio" {\n'
        "    @quantum_circuit(\n"
        '      circuitType: "qaoa",\n'
        '      problemType: "qubo",\n'
        f"      quboMatrix: {matrix_literal},\n"
        "      p: 1,\n"
        '      backend: "aer"\n'
        "    )\n"
        "  }\n"
        "}\n"
    )


def _encode_expected_pyramid_bitstring(semantic_bitstring: str, model: dict) -> str:
    semantic_count = int(model["semantic_variable_count"])
    if len(semantic_bitstring) != semantic_count or any(
        bit not in "01" for bit in semantic_bitstring
    ):
        raise ValueError("invalid pyramid semantic bitstring")
    if model["pyramid_variant"] == "pairwise":
        return semantic_bitstring
    semantic_bits = [int(bit) for bit in semantic_bitstring]
    ancillas = [
        str(
            semantic_bits[term["substitution_pair"][0]]
            * semantic_bits[term["substitution_pair"][1]]
        )
        for term in model["quadratization"]["terms"]
    ]
    return semantic_bitstring + "".join(ancillas)


def _expected_pyramid_equivalence_certificate(model: dict) -> dict:
    semantic_count = int(model["semantic_variable_count"])
    ancilla_count = int(model["ancilla_variable_count"])
    max_error = 0.0
    minimum_infeasible_gap = float("inf")
    all_minimizers_match = True
    semantic_optimum = float("inf")
    semantic_optimal_bitstring = "0" * semantic_count
    expanded_optimum = float("inf")
    expanded_optimal_bitstring = "0" * (semantic_count + ancilla_count)
    for semantic_mask in range(1 << semantic_count):
        semantic = format(semantic_mask, f"0{semantic_count}b")
        semantic_bits = [int(bit) for bit in semantic]
        direct_hubo = _qubo_objective(semantic, model["semantic_pairwise_matrix"])
        direct_hubo += sum(
            float(term["coefficient"])
            * semantic_bits[term["semantic_indices"][0]]
            * semantic_bits[term["semantic_indices"][1]]
            * semantic_bits[term["semantic_indices"][2]]
            for term in model["higher_order_terms"]
        )
        expected = _encode_expected_pyramid_bitstring(semantic, model)
        expected_ancillas = expected[semantic_count:]
        values: list[tuple[float, str]] = []
        for ancilla_mask in range(1 << ancilla_count):
            ancillas = format(ancilla_mask, f"0{ancilla_count}b")
            expanded = semantic + ancillas
            value = _qubo_objective(expanded, model["matrix"])
            values.append((value, ancillas))
            if value < expanded_optimum:
                expanded_optimum = value
                expanded_optimal_bitstring = expanded
        best_value = min(value for value, _ in values)
        minimizing_ancillas = [
            ancillas
            for value, ancillas in values
            if abs(value - best_value) <= PYRAMID_EQUIVALENCE_TOLERANCE
        ]
        all_minimizers_match = all_minimizers_match and minimizing_ancillas == [
            expected_ancillas
        ]
        max_error = max(max_error, abs(best_value - direct_hubo))
        wrong_values = [
            value for value, ancillas in values if ancillas != expected_ancillas
        ]
        minimum_infeasible_gap = min(
            minimum_infeasible_gap, min(wrong_values) - direct_hubo
        )
        if direct_hubo < semantic_optimum:
            semantic_optimum = direct_hubo
            semantic_optimal_bitstring = semantic
    expected_expanded_optimum = _encode_expected_pyramid_bitstring(
        semantic_optimal_bitstring, model
    )
    certificate = {
        "semantic_assignments_checked": 1 << semantic_count,
        "expanded_assignments_checked": 1 << (semantic_count + ancilla_count),
        "max_abs_minimized_objective_error": max_error,
        "minimum_infeasible_gap": minimum_infeasible_gap,
        "all_minimizing_ancillas_match_products": all_minimizers_match,
        "semantic_optimal_bitstring": semantic_optimal_bitstring,
        "expanded_optimal_bitstring": expanded_optimal_bitstring,
        "expanded_optimum_projects_to_semantic_optimum": (
            expanded_optimal_bitstring == expected_expanded_optimum
            and abs(expanded_optimum - semantic_optimum)
            <= PYRAMID_EQUIVALENCE_TOLERANCE
        ),
    }
    if (
        max_error > PYRAMID_EQUIVALENCE_TOLERANCE
        or minimum_infeasible_gap <= PYRAMID_EQUIVALENCE_TOLERANCE
        or not certificate["all_minimizing_ancillas_match_products"]
        or not certificate["expanded_optimum_projects_to_semantic_optimum"]
    ):
        raise ValueError("pyramid Rosenberg reduction fails exact equivalence")
    return certificate


def _expected_paradox_probe_contract(
    fixture: dict,
    code_state_bindings: list[dict],
    selected_pyramid_variant: str | None = None,
) -> dict:
    policy = fixture["paradox_probe_policy"]
    probes = [candidate["paradox_probe"] for candidate in fixture["candidates"]]
    qubo_configuration_input_fields = list(PARADOX_QUBO_CONFIGURATION_INPUT_FIELDS)
    if selected_pyramid_variant is not None:
        qubo_configuration_input_fields.extend(
            ["pyramid_qubo", "selected_pyramid_variant"]
        )
    contract = {
        "mode": "paradox_probe_selection",
        "fixture_schema": PARADOX_PROBE_FIXTURE_SCHEMA,
        "card_ids": sorted({probe["card_id"] for probe in probes}),
        "probe_ids": [probe["probe_id"] for probe in probes],
        "code_state_variable_ids": [
            probe["code_state"]["variable_id"] for probe in probes
        ],
        "code_state_fingerprints": [
            binding["state_fingerprint"] for binding in code_state_bindings
        ],
        "ranking_field_allowlist": policy["ranking_field_allowlist"],
        "candidate_optimizer_input_fields": PARADOX_CANDIDATE_OPTIMIZER_INPUT_FIELDS,
        "qubo_configuration_input_fields": qubo_configuration_input_fields,
        "adjudication_corpus": policy["adjudication_corpus"],
        "adjudication_corpus_schema": policy["adjudication_corpus_schema"],
        "adjudication_corpus_sha256": policy["adjudication_corpus_sha256"],
        "control_executor": policy["control_executor"],
        "control_executor_sha256": policy["control_executor_sha256"],
        "control_receipt": policy["control_receipt"],
        "control_receipt_sha256": policy["control_receipt_sha256"],
        "passing_control_receipt_bound": policy[
            "passing_control_receipt_required"
        ],
        "control_execution_independently_verified": False,
        "explicit_outcome_fields_or_label_tokens_in_score_names_or_tags": False,
        "optimizer_outcome_independence_claimed": False,
        "author_blinding_claimed": policy["author_blinding_claimed"],
        "control_labels_are_author_supplied": policy[
            "control_labels_are_author_supplied"
        ],
        "declared_state_path_churn_weight": policy[
            "declared_state_path_churn_weight"
        ],
        "code_similarity_basis": "declared-state Git blob SHA-256 Jaccard",
        "claim_boundary": policy["claim_boundary"],
    }
    if selected_pyramid_variant is not None:
        contract["selected_pyramid_variant"] = selected_pyramid_variant
    return contract


def _paradox_probe_fixture_errors(
    fixture: dict,
    source_blobs: dict[str, bytes],
) -> list[str]:
    """Independently enforce the outcome-blind paradox-probe input contract."""

    errors: list[str] = []
    try:
        policy = fixture["paradox_probe_policy"]
        weights = fixture["score_weights"]
        allowlist = policy["ranking_field_allowlist"]
        if allowlist != list(weights):
            errors.append("paradox ranking allowlist does not match score weights")
        forbidden = {
            str(item).strip().lower().replace("-", "_")
            for item in policy["forbidden_ranking_tokens"]
        }
        if not PARADOX_FORBIDDEN_RANKING_TOKENS <= forbidden:
            errors.append("paradox forbidden ranking token policy is incomplete")
        for field in weights:
            if _has_forbidden_ranking_token(str(field), forbidden):
                errors.append(f"forbidden ranking token in score field: {field}")
        allowed_stages = set(policy["allowed_stages"])
        if not allowed_stages <= PARADOX_ALLOWED_STAGES:
            errors.append("paradox allowed stages contain an unsupported stage")
        if policy.get("require_outcome_field_exclusion") is not True:
            errors.append("paradox outcome fields are not contractually excluded")
        if policy.get("author_blinding_claimed") is not False:
            errors.append("paradox pilot makes an unsupported author-blinding claim")
        if policy.get("control_labels_are_author_supplied") is not True:
            errors.append("paradox control-label provenance is not explicit")
        if policy.get("require_code_state_binding") is not True:
            errors.append("paradox code-state binding is not required")
        durable_sources = policy.get("durable_receipt_requires_committed_sources")
        if not isinstance(durable_sources, bool):
            errors.append("paradox durable source policy is not Boolean")
        churn_weight = float(policy.get("declared_state_path_churn_weight", -1.0))
        if not math.isfinite(churn_weight) or churn_weight < 0.0:
            errors.append("paradox declared-state path-churn weight is invalid")
        if any(
            abs(float(value)) > 1e-12
            for value in fixture.get("kill_status_adjustments", {}).values()
        ):
            errors.append("paradox kill-status adjustment is nonzero")

        corpus: dict | None = None
        corpus_path = _safe_repo_path(policy["adjudication_corpus"])
        corpus_hash = policy["adjudication_corpus_sha256"]
        corpus_blob = source_blobs.get(corpus_path or "")
        if corpus_path is None or corpus_blob is None:
            errors.append("pinned paradox adjudication corpus is unavailable")
        elif not re.fullmatch(r"[0-9a-f]{64}", str(corpus_hash)):
            errors.append("paradox adjudication corpus hash is not SHA-256")
        elif hashlib.sha256(corpus_blob).hexdigest() != corpus_hash:
            errors.append("paradox adjudication corpus hash mismatch")
        else:
            try:
                corpus = json.loads(corpus_blob.decode("utf-8"))
                if corpus.get("schema") != policy.get("adjudication_corpus_schema"):
                    errors.append("paradox adjudication corpus schema mismatch")
                if corpus.get("optimizer_dataflow") != "excluded":
                    errors.append(
                        "paradox control labels are not excluded from ranking dataflow"
                    )
                if (
                    corpus.get("validation_access")
                    != "schema-label-policy-and-replay"
                ):
                    errors.append("paradox control validation access is not declared")
                if corpus.get("labels_evaluation_only") is not True:
                    errors.append("paradox control labels are not evaluation-only")
                records = corpus.get("records")
                if not isinstance(records, list) or not records:
                    errors.append("paradox control corpus has no labeled records")
                elif any(
                    not isinstance(record, dict)
                    or not isinstance(record.get("adjudication"), str)
                    or "expected_observation" not in record
                    or not isinstance(record.get("normalization"), str)
                    or not isinstance(record.get("authority"), dict)
                    or not str(record["authority"].get("url", "")).startswith(
                        "https://"
                    )
                    for record in records
                ):
                    errors.append("paradox control corpus record is incomplete")
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                errors.append(f"paradox adjudication corpus is malformed: {error}")

        executor_path = _safe_repo_path(policy.get("control_executor"))
        executor_hash = policy.get("control_executor_sha256")
        executor_blob = source_blobs.get(executor_path or "")
        if executor_path is None or executor_blob is None:
            errors.append("pinned paradox control executor is unavailable")
        elif not re.fullmatch(r"[0-9a-f]{64}", str(executor_hash)):
            errors.append("paradox control executor hash is not SHA-256")
        elif hashlib.sha256(executor_blob).hexdigest() != executor_hash:
            errors.append("paradox control executor hash mismatch")

        control_receipt_path = _safe_repo_path(policy.get("control_receipt"))
        control_receipt_hash = policy.get("control_receipt_sha256")
        control_receipt_blob = source_blobs.get(control_receipt_path or "")
        if control_receipt_path is None or control_receipt_blob is None:
            errors.append("pinned paradox control receipt is unavailable")
        elif not re.fullmatch(r"[0-9a-f]{64}", str(control_receipt_hash)):
            errors.append("paradox control receipt hash is not SHA-256")
        elif hashlib.sha256(control_receipt_blob).hexdigest() != control_receipt_hash:
            errors.append("paradox control receipt hash mismatch")
        else:
            try:
                control_receipt = json.loads(control_receipt_blob.decode("utf-8"))
                payload_hash = control_receipt.get("payload_hash")
                control_payload = {
                    key: value
                    for key, value in control_receipt.items()
                    if key != "payload_hash"
                }
                receipt_executor = control_receipt.get("executor")
                control_results = control_receipt.get("results")
                corpus_record_count = (
                    len(corpus.get("records", []))
                    if isinstance(corpus, dict)
                    else None
                )
                corpus_records = (
                    corpus.get("records", []) if isinstance(corpus, dict) else []
                )
                results_match_corpus = isinstance(control_results, list) and len(
                    control_results
                ) == len(corpus_records) and all(
                    isinstance(result, dict)
                    and result.get("id") == record.get("id")
                    and result.get("probe") == record.get("probe")
                    and result.get("expected") == record.get("expected_observation")
                    and result.get("observed") == record.get("expected_observation")
                    and result.get("passed") is True
                    and result.get("declared_adjudication")
                    == record.get("adjudication")
                    and result.get("adjudication") == record.get("adjudication")
                    and result.get("normalization") == record.get("normalization")
                    and result.get("authority") == record.get("authority")
                    for record, result in zip(corpus_records, control_results)
                )
                if (
                    control_receipt.get("schema") != PARADOX_CONTROL_RECEIPT_SCHEMA
                    or payload_hash != expected_generic_hash(control_payload)
                    or control_receipt.get("corpus") != corpus_path
                    or control_receipt.get("corpus_sha256") != corpus_hash
                    or control_receipt.get("record_count") != corpus_record_count
                    or control_receipt.get("passed_count") != corpus_record_count
                    or control_receipt.get("failed_count") != 0
                    or control_receipt.get("all_labels_evaluation_only") is not True
                    or control_receipt.get("adjudication_protocol")
                    != corpus.get("adjudication_protocol")
                    or not results_match_corpus
                    or not isinstance(receipt_executor, dict)
                    or receipt_executor.get("path") != executor_path
                    or receipt_executor.get("sha256") != executor_hash
                ):
                    errors.append(
                        "paradox control receipt does not bind the declared passing semantics"
                    )
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                errors.append(f"paradox control receipt is malformed: {error}")
        if policy.get("passing_control_receipt_required") is not True:
            errors.append("paradox passing-control-receipt binding is not explicit")

        if not isinstance(policy.get("claim_boundary"), str) or not policy[
            "claim_boundary"
        ].strip():
            errors.append("paradox claim boundary is missing")

        probe_ids: set[str] = set()
        variable_ids: set[str] = set()
        for candidate in fixture["candidates"]:
            candidate_id = candidate["id"]
            if not isinstance(candidate_id, str) or not candidate_id:
                errors.append("paradox candidate ID is invalid")
            if set(candidate["scores"]) != set(weights):
                errors.append(f"{candidate_id} score fields exceed the allowlist")
            tags = candidate.get("tags")
            if not isinstance(tags, list) or any(
                not isinstance(tag, str) for tag in tags
            ):
                errors.append(f"{candidate_id} optimizer tags are not a string list")
                tags = []
            for tag in tags:
                if _has_forbidden_ranking_token(tag, forbidden):
                    errors.append(
                        f"{candidate_id} optimizer tag contains a forbidden ranking token"
                    )
            status = candidate["kill_test"]["status"]
            if status not in fixture.get("kill_status_adjustments", {}):
                errors.append(f"{candidate_id} status has no declared zero adjustment")

            probe = candidate["paradox_probe"]
            if not re.fullmatch(r"PP-[0-9]{3}", str(probe["card_id"])):
                errors.append(f"{candidate_id} paradox card ID is invalid")
            probe_id = probe["probe_id"]
            if (
                not isinstance(probe_id, str)
                or not probe_id
                or probe_id in probe_ids
            ):
                errors.append("paradox probe IDs are not unique")
            elif isinstance(probe_id, str):
                probe_ids.add(probe_id)
            if probe["stage"] not in allowed_stages:
                errors.append(f"{candidate_id} paradox stage is not allowed")
            if any(
                not isinstance(probe.get(key), str) or not probe[key].strip()
                for key in ("falsifier", "stopping_rule")
            ):
                errors.append(f"{candidate_id} paradox falsifier is incomplete")
            if probe.get("outcome_fields_excluded") is not True:
                errors.append(f"{candidate_id} paradox outcome fields are exposed")

            code_state = probe["code_state"]
            variable_id = code_state["variable_id"]
            if (
                not isinstance(variable_id, str)
                or not variable_id
                or variable_id in variable_ids
            ):
                errors.append("code-state variable IDs are not unique")
            elif isinstance(variable_id, str):
                variable_ids.add(variable_id)
            if code_state.get("complete") is not True:
                errors.append(f"{candidate_id} code-state binding is incomplete")
            if code_state.get("binding_basis") != "pinned_git_blob_sha256":
                errors.append(f"{candidate_id} code-state basis is unsupported")
            states = code_state["states"]
            if not isinstance(states, list):
                errors.append(f"{candidate_id} code states are not a list")
                states = []
            if any(not isinstance(state, dict) for state in states):
                errors.append(f"{candidate_id} code-state entries are not objects")
                states = [state if isinstance(state, dict) else {} for state in states]
            state_ids = [state.get("id") for state in states]
            implementation_paths = candidate["code_evidence"].get(
                "implementation", []
            )
            if len(states) < 2:
                errors.append(f"{candidate_id} code-state variable has fewer than two states")
            if any(not state_id for state_id in state_ids) or len(state_ids) != len(
                set(state_ids)
            ):
                errors.append(f"{candidate_id} code-state IDs are not unique")
            if any(
                not isinstance(state.get("paths"), list)
                or any(
                    not isinstance(path, str) or not path
                    for path in state.get("paths", [])
                )
                or
                len(state.get("paths", [])) != len(set(state.get("paths", [])))
                or sorted(state.get("paths", [])) != sorted(implementation_paths)
                for state in states
            ):
                errors.append(
                    f"{candidate_id} code states do not share the implementation path set"
                )
            if any(
                not isinstance(state.get("id"), str)
                or not state["id"]
                or not isinstance(state.get("source_ref"), str)
                or not state["source_ref"]
                for state in states
            ):
                errors.append(f"{candidate_id} code-state source is incomplete")
            for state in states:
                source_ref = state.get("source_ref")
                if source_ref != "WORKTREE" and not re.fullmatch(
                    r"[0-9a-f]{40}", str(source_ref)
                ):
                    errors.append(
                        f"{candidate_id} code-state source is not a pinned commit"
                    )
                if durable_sources and source_ref == "WORKTREE":
                    errors.append(
                        f"{candidate_id} durable code-state source is not committed"
                    )
        if "pyramid_qubo" in fixture:
            errors.extend(_pyramid_fixture_errors(fixture))
    except (KeyError, TypeError, ValueError) as error:
        errors.append(f"malformed paradox-probe fixture: {error}")
    return errors


def _recompute_code_state_bindings(
    fixture: dict,
    source_records: dict[str, dict],
    source_blobs: dict[str, bytes],
) -> tuple[list[dict], list[str]]:
    """Resolve paradox code-state variables independently from receipt claims."""

    bindings: list[dict] = []
    errors: list[str] = []
    for candidate in fixture["candidates"]:
        code_state = candidate["paradox_probe"]["code_state"]
        state_records: list[dict] = []
        flat_files: list[dict] = []
        declared_count = 0
        available_count = 0
        for state in code_state["states"]:
            source_ref = state["source_ref"]
            resolved_ref = source_ref
            files = []
            for raw_path in state["paths"]:
                declared_count += 1
                path = _safe_repo_path(raw_path)
                blob_oid = None
                blob = None
                if path is None:
                    errors.append(f"{candidate['id']} code-state path is unsafe")
                elif source_ref == "WORKTREE":
                    record = source_records.get(path)
                    blob = source_blobs.get(path)
                    blob_oid = record.get("git_blob_oid") if record else None
                else:
                    blob_oid = _git_tree_blob_oid(source_ref, path)
                    blob = _git_blob_bytes(blob_oid) if blob_oid else None
                available = blob is not None
                if available:
                    available_count += 1
                file_record = {
                    "state_id": state["id"],
                    "path": path or str(raw_path),
                    "available": available,
                    "git_blob_oid": blob_oid,
                    "git_blob_bytes": len(blob) if blob is not None else None,
                    "git_blob_sha256": (
                        hashlib.sha256(blob).hexdigest() if blob is not None else None
                    ),
                }
                files.append(file_record)
                flat_files.append(file_record)
            state_records.append(
                {
                    "id": state["id"],
                    "source_ref": source_ref,
                    "resolved_ref": resolved_ref,
                    "files": files,
                }
            )
        observed_completeness = (
            available_count / declared_count if declared_count else 0.0
        )
        fingerprint_payload = [
            {
                "id": state["id"],
                "resolved_ref": state["resolved_ref"],
                "files": [
                    {
                        "path": item["path"],
                        "git_blob_sha256": item["git_blob_sha256"],
                    }
                    for item in state["files"]
                ],
            }
            for state in state_records
        ]
        path_state_ids: dict[str, set[str]] = {}
        path_hashes: dict[str, set[str]] = {}
        for record in flat_files:
            path_state_ids.setdefault(record["path"], set()).add(record["state_id"])
            if record["git_blob_sha256"]:
                path_hashes.setdefault(record["path"], set()).add(
                    record["git_blob_sha256"]
                )
        comparable_paths = [
            path for path, state_ids in path_state_ids.items() if len(state_ids) >= 2
        ]
        changed_paths = [
            path for path in comparable_paths if len(path_hashes.get(path, set())) > 1
        ]
        declared_state_path_churn_fraction = (
            len(changed_paths) / len(comparable_paths) if comparable_paths else 0.0
        )
        binding = {
            "candidate_id": candidate["id"],
            "variable_id": code_state["variable_id"],
            "binding_basis": code_state["binding_basis"],
            "states": state_records,
            "files": flat_files,
            "declared_path_count": declared_count,
            "available_path_count": available_count,
            "all_paths_available": available_count == declared_count,
            "observed_completeness": observed_completeness,
            "comparable_path_count": len(comparable_paths),
            "changed_path_count": len(changed_paths),
            "declared_state_path_churn_fraction": declared_state_path_churn_fraction,
            "state_blob_hashes": sorted(
                {
                    record["git_blob_sha256"]
                    for record in flat_files
                    if record["git_blob_sha256"]
                }
            ),
            "state_fingerprint": expected_generic_hash(fingerprint_payload),
        }
        if not binding["all_paths_available"]:
            errors.append(f"{candidate['id']} code-state path does not resolve")
        bindings.append(binding)
    return bindings, errors


def _recompute_qubo_from_source(
    receipt: dict,
    qubo: dict,
    candidate_ids: list[str],
) -> tuple[dict | None, list[str]]:
    """Rebuild every code-derived QUBO input from pinned fixture and Git blobs."""

    source_records, source_blobs, errors = _validate_source_snapshot(receipt)
    expected_code_paths = {
        "scout_sha256": "scripts/quantum_novelty_scout.py",
        "executor_sha256": "scripts/quantum_execute.py",
        "verifier_sha256": "scripts/quantum_receipt_verify.py",
        "composition_sha256": _safe_repo_path(receipt.get("composition")),
    }
    expected_code_hashes = {}
    for key, path in expected_code_paths.items():
        source = source_records.get(path or "")
        if source is None:
            errors.append(f"pinned code source is unavailable: {path}")
        else:
            expected_code_hashes[key] = source["git_blob_sha256"]
    if receipt.get("code_hash_basis") != "SHA-256 of pinned Git blob bytes":
        errors.append("code hash basis is not the pinned Git blob convention")
    if receipt.get("code_hashes") != expected_code_hashes:
        errors.append("pipeline code hashes do not match pinned source blobs")
    for required_path in (
        "scripts/__tests__/test_quantum_novelty_scout.py",
        "pnpm-lock.yaml",
    ):
        if required_path not in source_records:
            errors.append(f"required source snapshot path is unavailable: {required_path}")
    fixture_path = _safe_repo_path(receipt.get("fixture"))
    if fixture_path is None or fixture_path not in source_blobs:
        errors.append("pinned candidate fixture is unavailable")
        return None, errors
    try:
        fixture = json.loads(source_blobs[fixture_path].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        errors.append(f"pinned candidate fixture is malformed: {error}")
        return None, errors
    is_pyramid_receipt = receipt.get("schema") == PYRAMID_SCOUT_SCHEMA
    pyramid_variant = qubo.get("pyramid_variant") if is_pyramid_receipt else None
    expected_input = expected_generic_hash(
        {"fixture": fixture, "pyramid_variant": pyramid_variant}
        if is_pyramid_receipt
        else fixture
    )
    if receipt.get("input_sha256") != expected_input:
        errors.append("input hash does not match the pinned candidate fixture/model")

    is_paradox_probe = fixture.get("schema") == PARADOX_PROBE_FIXTURE_SCHEMA
    if is_pyramid_receipt:
        if not is_paradox_probe or "pyramid_qubo" not in fixture:
            errors.append("pyramid receipt is not backed by a paradox pyramid fixture")
        if pyramid_variant not in PYRAMID_VARIANTS:
            errors.append("pyramid receipt variant is unsupported")
    elif "pyramid_qubo" in fixture:
        errors.append("pyramid fixture is sealed under the legacy receipt schema")
    code_state_bindings: list[dict] = []
    if is_paradox_probe:
        errors.extend(_paradox_probe_fixture_errors(fixture, source_blobs))
        code_state_bindings, binding_errors = _recompute_code_state_bindings(
            fixture,
            source_records,
            source_blobs,
        )
        errors.extend(binding_errors)
        post_execution_snapshot = receipt.get("post_execution_source_state")
        errors.extend(
            _post_execution_snapshot_errors(
                receipt["source_state"],
                post_execution_snapshot,
                receipt.get("execution_source_stability"),
            )
        )
        if (
            fixture["paradox_probe_policy"].get(
                "durable_receipt_requires_committed_sources"
            )
            is True
            and (
                receipt["source_state"].get("scoped_dirty") is not False
                or not isinstance(post_execution_snapshot, dict)
                or post_execution_snapshot.get("scoped_dirty") is not False
            )
        ):
            errors.append(
                "durable paradox receipt did not remain clean across execution"
            )

    candidates = fixture["candidates"]
    if [candidate["id"] for candidate in candidates] != candidate_ids:
        errors.append("candidate order does not match the pinned fixture")
        return fixture, errors
    fixture_links = {
        "target_cardinality": fixture["target_cardinality"],
        "score_basis": fixture["score_basis"],
        "score_weights": fixture["score_weights"],
        "code_evidence_policy": fixture["code_evidence_policy"],
    }
    if is_paradox_probe:
        expected_contract = _expected_paradox_probe_contract(
            fixture,
            code_state_bindings,
            str(pyramid_variant) if is_pyramid_receipt else None,
        )
        fixture_links["paradox_probe_policy"] = fixture["paradox_probe_policy"]
        fixture_links["paradox_probe_contract"] = expected_contract
        if not _structure_close(
            qubo.get("paradox_probe_contract"), expected_contract
        ):
            errors.append("QUBO paradox_probe_contract does not recompute")
    for key, expected in fixture_links.items():
        if not _structure_close(receipt.get(key), expected):
            errors.append(f"{key} does not match the pinned fixture")

    policy = fixture["code_evidence_policy"]
    category_weights = {
        key: float(value) for key, value in policy["category_weights"].items()
    }
    allowed_extensions = {value.lower() for value in policy["allowed_extensions"]}
    required_categories = set(policy["required_categories"])
    max_file_bytes = int(policy["max_file_bytes"])
    implementation_sets: list[set[str]] = []
    expected_availabilities: list[float] = []
    expected_required: list[bool] = []
    head_commit = receipt["source_state"]["head_commit"]
    status_by_path = _status_by_path(receipt["source_state"]["scoped_status"])

    for candidate, evidence in zip(candidates, qubo["code_evidence"], strict=True):
        expected_file_order = [
            (category, path)
            for category in category_weights
            for path in candidate["code_evidence"].get(category, [])
        ]
        actual_file_order = [
            (record.get("category"), record.get("path")) for record in evidence["files"]
        ]
        if actual_file_order != expected_file_order:
            errors.append(
                f"{candidate['id']} code evidence paths do not match the pinned fixture"
            )

        category_records = {
            category: [
                record
                for record in evidence["files"]
                if record.get("category") == category
            ]
            for category in category_weights
        }
        implementation_hashes: set[str] = set()
        expected_categories: dict[str, dict] = {}
        for category, weight in category_weights.items():
            records = category_records[category]
            available_count = 0
            for record in records:
                path = _safe_repo_path(record.get("path"))
                source = source_records.get(path or "")
                blob = source_blobs.get(path or "")
                head_oid = _git_tree_blob_oid(head_commit, path) if path else None
                status = status_by_path.get(path or "")
                deleted_in_snapshot = bool(status and "D" in status)
                if head_oid is not None and source is None and not deleted_in_snapshot:
                    errors.append(
                        f"{candidate['id']} existing fixture path is omitted from source snapshot: {path}"
                    )
                exists = source is not None and blob is not None
                suffix_allowed = (
                    pathlib.PurePosixPath(path).suffix.lower() in allowed_extensions
                    if path
                    else False
                )
                within_limit = bool(
                    exists and int(source["git_blob_bytes"]) <= max_file_bytes
                )
                admitted = exists and suffix_allowed and within_limit
                if record.get("exists") != exists or record.get("admitted") != admitted:
                    errors.append(
                        f"{candidate['id']} code admission does not recompute: {path}"
                    )
                if admitted:
                    available_count += 1
                    for field in (
                        "worktree_bytes",
                        "worktree_sha256",
                        "git_blob_oid",
                        "git_blob_bytes",
                        "git_blob_sha256",
                    ):
                        if record.get(field) != source.get(field):
                            errors.append(
                                f"{candidate['id']} code evidence {field} mismatch: {path}"
                            )
                    if category == "implementation":
                        implementation_hashes.add(source["git_blob_sha256"])
            declared_count = len(candidate["code_evidence"].get(category, []))
            fraction = available_count / declared_count if declared_count else 0.0
            expected_categories[category] = {
                "weight": weight,
                "declared_count": declared_count,
                "available_count": available_count,
                "availability_fraction": fraction,
            }
        if not _structure_close(evidence.get("categories"), expected_categories):
            errors.append(
                f"{candidate['id']} code evidence categories do not recompute"
            )
        availability = sum(
            category_weights[category]
            * expected_categories[category]["availability_fraction"]
            for category in category_weights
        )
        missing_required = [
            category
            for category in sorted(required_categories)
            if expected_categories[category]["declared_count"] == 0
            or expected_categories[category]["availability_fraction"] < 1.0
        ]
        evidence_checks = {
            "declared_path_availability": availability,
            "required_paths_available": not missing_required,
            "missing_required_path_categories": missing_required,
            "implementation_file_hash_count": len(implementation_hashes),
            "implementation_set_fingerprint": expected_generic_hash(
                sorted(implementation_hashes)
            ),
        }
        for key, expected in evidence_checks.items():
            if not _structure_close(evidence.get(key), expected):
                errors.append(
                    f"{candidate['id']} code evidence {key} does not recompute"
                )
        implementation_sets.append(implementation_hashes)
        expected_availabilities.append(availability)
        expected_required.append(not missing_required)

    weights = {key: float(value) for key, value in fixture["score_weights"].items()}
    status_adjustments = {
        key: float(value)
        for key, value in fixture.get("kill_status_adjustments", {}).items()
    }
    prior_rewards = []
    code_adjustments = []
    rewards = []
    for index, candidate in enumerate(candidates):
        prior = sum(
            weights[key] * float(candidate["scores"][key]) for key in weights
        ) + status_adjustments.get(candidate["kill_test"]["status"], 0.0)
        adjustment = float(policy["declared_path_availability_weight"]) * float(
            expected_availabilities[index]
        )
        if not expected_required[index]:
            adjustment += float(policy["missing_required_path_penalty"])
        prior_rewards.append(prior)
        code_adjustments.append(adjustment)
        rewards.append(prior + adjustment)

    code_state_path_churn_adjustments = [0.0 for _ in candidates]
    code_similarity_basis = policy["similarity_basis"]
    if is_paradox_probe:
        change_weight = float(
            fixture["paradox_probe_policy"]["declared_state_path_churn_weight"]
        )
        code_state_path_churn_adjustments = [
            change_weight * float(binding["declared_state_path_churn_fraction"])
            for binding in code_state_bindings
        ]
        rewards = [
            reward + code_state_path_churn_adjustments[index]
            for index, reward in enumerate(rewards)
        ]
        implementation_sets = [
            set(binding["state_blob_hashes"]) for binding in code_state_bindings
        ]
        code_similarity_basis = "declared-state Git blob SHA-256 Jaccard"

    size = len(candidates)
    target = int(fixture["target_cardinality"])
    cardinality_penalty = float(fixture["cardinality_penalty"])
    redundancy_penalty = float(fixture["redundancy_penalty"])
    code_similarity_penalty = float(policy["similarity_penalty"])
    tag_similarities = [[0.0 for _ in range(size)] for _ in range(size)]
    code_similarities = [[0.0 for _ in range(size)] for _ in range(size)]
    matrix = [[0.0 for _ in range(size)] for _ in range(size)]
    for i in range(size):
        matrix[i][i] = round(-rewards[i] + cardinality_penalty * (1 - 2 * target), 10)
        for j in range(i + 1, size):
            left_tags = set(candidates[i].get("tags", []))
            right_tags = set(candidates[j].get("tags", []))
            tag_union = left_tags | right_tags
            tag_similarity = (
                len(left_tags & right_tags) / len(tag_union) if tag_union else 0.0
            )
            hash_union = implementation_sets[i] | implementation_sets[j]
            code_similarity = (
                len(implementation_sets[i] & implementation_sets[j]) / len(hash_union)
                if hash_union
                else 0.0
            )
            tag_similarities[i][j] = tag_similarity
            code_similarities[i][j] = code_similarity
            matrix[i][j] = round(
                2 * cardinality_penalty
                + redundancy_penalty * tag_similarity
                + code_similarity_penalty * code_similarity,
                10,
            )
    expected_qubo_fields = {
        "matrix": matrix,
        "constant_offset": cardinality_penalty * target * target,
        "candidate_rewards": rewards,
        "prior_candidate_rewards": prior_rewards,
        "code_evidence_adjustments": code_adjustments,
        "tag_similarities": tag_similarities,
        "code_similarities": code_similarities,
        "target_cardinality": target,
        "cardinality_penalty": cardinality_penalty,
        "redundancy_penalty": redundancy_penalty,
        "code_similarity_penalty": code_similarity_penalty,
        "code_evidence_policy": policy,
        "kill_status_adjustments": status_adjustments,
    }
    # The first flat v2 receipt predates these two metadata fields. They are
    # semantically zero/default for a non-paradox fixture, so accept their
    # joint absence only on that legacy surface. Current flat receipts that
    # carry either field must carry and recompute both; paradox receipts always
    # require both because code-state deltas affect their objective.
    has_new_code_state_metadata = any(
        key in qubo
        for key in ("code_state_path_churn_adjustments", "code_similarity_basis")
    )
    if is_paradox_probe or has_new_code_state_metadata:
        expected_qubo_fields.update(
            {
                "code_state_path_churn_adjustments": code_state_path_churn_adjustments,
                "code_similarity_basis": code_similarity_basis,
            }
        )
    if is_pyramid_receipt and pyramid_variant in PYRAMID_VARIANTS:
        try:
            pyramid_structure = _expected_pyramid_structure(
                fixture, matrix, str(pyramid_variant)
            )
            expected_qubo_fields.update(pyramid_structure)
        except (KeyError, TypeError, ValueError, IndexError) as error:
            errors.append(f"pyramid QUBO cannot be reconstructed: {error}")
    if is_paradox_probe:
        expected_qubo_fields["code_state_bindings"] = code_state_bindings
    for key, expected in expected_qubo_fields.items():
        if not _structure_close(qubo.get(key), expected):
            errors.append(f"QUBO {key} does not recompute from pinned source")
    if is_pyramid_receipt and pyramid_variant in PYRAMID_VARIANTS:
        expected_role = (
            "Generated declarative mirror of the matrix. The measured run invokes "
            "the Python QAOA executor directly; this file is not claimed as validated "
            "or as the execution source."
        )
        if receipt.get("composition_role") != expected_role:
            errors.append("pyramid composition role does not match the verifier contract")
        composition_path = _safe_repo_path(receipt.get("composition"))
        if (
            composition_path is None
            or pathlib.PurePosixPath(composition_path).suffix.lower() != ".holo"
        ):
            errors.append("pyramid composition path is not a .holo artifact")
        elif composition_path not in source_blobs:
            errors.append("pinned pyramid composition bytes are unavailable")
        elif "variable_order" in expected_qubo_fields and "matrix" in expected_qubo_fields:
            expected_composition = _expected_pyramid_composition(
                expected_qubo_fields,
                expected_input,
                qubo["code_evidence"],
            ).encode("utf-8")
            if source_blobs[composition_path] != expected_composition:
                errors.append(
                    "pinned pyramid composition does not reproduce the verified matrix"
                )
    return fixture, errors


def _pyramid_portfolio_core(bitstring: str, fixture: dict, qubo: dict) -> dict:
    semantic_count = int(qubo["semantic_variable_count"])
    total_count = int(qubo["total_variable_count"])
    if len(bitstring) != total_count or any(bit not in "01" for bit in bitstring):
        raise ValueError("invalid pyramid QUBO bitstring")
    semantic_bitstring = bitstring[:semantic_count]
    ancilla_bitstring = bitstring[semantic_count:]
    semantic_bits = [int(bit) for bit in semantic_bitstring]
    selected_indices = [index for index, bit in enumerate(semantic_bits) if bit]
    expected_expanded = _encode_expected_pyramid_bitstring(semantic_bitstring, qubo)
    expected_ancillas = expected_expanded[semantic_count:]
    ancilla_violations = [
        index
        for index, (actual, expected) in enumerate(
            zip(ancilla_bitstring, expected_ancillas)
        )
        if actual != expected
    ]
    ancilla_feasible = not ancilla_violations

    reward_sum = sum(
        float(qubo["candidate_rewards"][index]) for index in selected_indices
    )
    tag_redundancy = sum(
        float(qubo["redundancy_penalty"])
        * float(qubo["tag_similarities"][i][j])
        for offset, i in enumerate(selected_indices)
        for j in selected_indices[offset + 1 :]
    )
    code_redundancy = sum(
        float(qubo["code_similarity_penalty"])
        * float(qubo["code_similarities"][i][j])
        for offset, i in enumerate(selected_indices)
        for j in selected_indices[offset + 1 :]
    )
    redundancy = tag_redundancy + code_redundancy
    constraint_penalty = float(qubo["cardinality_penalty"]) * (
        len(selected_indices) - int(qubo["target_cardinality"])
    ) ** 2
    base_raw = _qubo_objective(semantic_bitstring, qubo["base_portfolio_matrix"])
    structural_contribution = _qubo_objective(
        semantic_bitstring, qubo["structural_pair_matrix"]
    )
    semantic_pairwise_raw = _qubo_objective(
        semantic_bitstring, qubo["semantic_pairwise_matrix"]
    )
    direct_cubic = sum(
        float(term["coefficient"])
        * semantic_bits[term["semantic_indices"][0]]
        * semantic_bits[term["semantic_indices"][1]]
        * semantic_bits[term["semantic_indices"][2]]
        for term in qubo["higher_order_terms"]
    )
    decoded_hubo_raw = semantic_pairwise_raw + direct_cubic
    quadratic_cubic = 0.0
    quadratization_penalty = 0.0
    if qubo["pyramid_variant"] == "volume_quadratized":
        ancilla_bits = [int(bit) for bit in ancilla_bitstring]
        for term, reduction in zip(
            qubo["higher_order_terms"], qubo["quadratization"]["terms"]
        ):
            left, right = reduction["substitution_pair"]
            remaining = reduction["remaining_index"]
            ancilla_offset = int(reduction["ancilla_index"]) - semantic_count
            y = ancilla_bits[ancilla_offset]
            a = semantic_bits[left]
            b = semantic_bits[right]
            c = semantic_bits[remaining]
            quadratic_cubic += float(term["coefficient"]) * y * c
            quadratization_penalty += float(reduction["penalty_strength"]) * (
                a * b - 2 * a * y - 2 * b * y + 3 * y
            )
    raw_objective = _qubo_objective(bitstring, qubo["matrix"])
    repaired_raw = _qubo_objective(expected_expanded, qubo["matrix"])
    expected_raw = semantic_pairwise_raw + quadratic_cubic + quadratization_penalty
    if abs(raw_objective - expected_raw) > PYRAMID_EQUIVALENCE_TOLERANCE:
        raise ValueError("pyramid QUBO component decomposition is inconsistent")
    if abs(repaired_raw - decoded_hubo_raw) > PYRAMID_EQUIVALENCE_TOLERANCE:
        raise ValueError("pyramid repaired objective does not equal decoded HUBO")
    expected_base_shifted = -reward_sum + redundancy + constraint_penalty
    if (
        abs(
            base_raw
            + float(qubo["constant_offset"])
            - expected_base_shifted
        )
        > PYRAMID_EQUIVALENCE_TOLERANCE
    ):
        raise ValueError("pyramid base portfolio decomposition is inconsistent")

    face_counts = {face["id"]: 0 for face in fixture["pyramid_qubo"]["faces"]}
    for index in selected_indices:
        face_counts[qubo["variable_order"][index]["face_id"]] += 1
    one_per_face = all(count == 1 for count in face_counts.values())
    target_met = len(selected_indices) == int(qubo["target_cardinality"])
    return {
        "bitstring": bitstring,
        "semantic_bitstring": semantic_bitstring,
        "ancilla_bitstring": ancilla_bitstring,
        "expected_ancilla_bitstring": expected_ancillas,
        "ancilla_feasible": ancilla_feasible,
        "ancilla_violation_count": len(ancilla_violations),
        "ancilla_violation_offsets": ancilla_violations,
        "selected_ids": [
            fixture["candidates"][index]["id"] for index in selected_indices
        ],
        "selected_count": len(selected_indices),
        "face_counts": face_counts,
        "one_per_face": one_per_face,
        "target_cardinality_met": target_met,
        "model_constraints_satisfied": target_met
        and one_per_face
        and ancilla_feasible,
        "raw_qubo_objective": raw_objective,
        "shifted_objective": raw_objective + float(qubo["constant_offset"]),
        "base_raw_qubo_objective": base_raw,
        "structural_pair_contribution": structural_contribution,
        "semantic_pairwise_raw_objective": semantic_pairwise_raw,
        "direct_cubic_contribution": direct_cubic,
        "decoded_hubo_raw_objective": decoded_hubo_raw,
        "quadratic_cubic_contribution": quadratic_cubic,
        "quadratization_penalty": quadratization_penalty,
        "repaired_bitstring": expected_expanded,
        "repaired_raw_qubo_objective": repaired_raw,
        "ancilla_excess_cost": raw_objective - repaired_raw,
        "reward_sum": reward_sum,
        "redundancy_penalty": redundancy,
        "tag_redundancy_penalty": tag_redundancy,
        "code_redundancy_penalty": code_redundancy,
        "constraint_penalty": constraint_penalty,
        "portfolio_score": (
            reward_sum - redundancy - structural_contribution - direct_cubic
        ),
    }


def _portfolio_core(
    bitstring: str,
    candidate_ids: list[str],
    qubo: dict,
) -> dict:
    matrix = qubo["matrix"]
    selected_indices = [index for index, bit in enumerate(bitstring) if bit == "1"]
    reward_sum = sum(float(qubo["candidate_rewards"][i]) for i in selected_indices)
    tag_redundancy = sum(
        float(qubo["redundancy_penalty"]) * float(qubo["tag_similarities"][i][j])
        for offset, i in enumerate(selected_indices)
        for j in selected_indices[offset + 1 :]
    )
    code_redundancy = sum(
        float(qubo["code_similarity_penalty"]) * float(qubo["code_similarities"][i][j])
        for offset, i in enumerate(selected_indices)
        for j in selected_indices[offset + 1 :]
    )
    constraint_penalty = (
        float(qubo["cardinality_penalty"])
        * (len(selected_indices) - int(qubo["target_cardinality"])) ** 2
    )
    raw_objective = _qubo_objective(bitstring, matrix)
    shifted_objective = raw_objective + float(qubo["constant_offset"])
    return {
        "bitstring": bitstring,
        "selected_ids": _selected_ids(bitstring, candidate_ids),
        "selected_count": len(selected_indices),
        "raw_qubo_objective": raw_objective,
        "shifted_objective": shifted_objective,
        "reward_sum": reward_sum,
        "redundancy_penalty": tag_redundancy + code_redundancy,
        "tag_redundancy_penalty": tag_redundancy,
        "code_redundancy_penalty": code_redundancy,
        "constraint_penalty": constraint_penalty,
        "portfolio_score": reward_sum - tag_redundancy - code_redundancy,
    }


def looks_like_novelty_scout_receipt(receipt: dict) -> bool:
    return all(
        key in receipt
        for key in (
            "qubo",
            "recommended_portfolio",
            "selected_code_evidence",
            "code_evidence_policy",
            "composition_role",
        )
    )


def novelty_scout_receipt_errors(receipt: dict) -> list[str]:
    """Independently recompute the scientific claims in a novelty-scout receipt."""

    receipt_schema = receipt.get("schema")
    if not looks_like_novelty_scout_receipt(receipt):
        if receipt_schema in {NOVELTY_SCOUT_SCHEMA, PYRAMID_SCOUT_SCHEMA}:
            return ["novelty-scout receipt is missing required structure"]
        return []
    if receipt_schema not in {NOVELTY_SCOUT_SCHEMA, PYRAMID_SCOUT_SCHEMA}:
        return ["novelty-scout schema downgrade or mismatch"]
    is_pyramid = receipt_schema == PYRAMID_SCOUT_SCHEMA
    errors: list[str] = []
    try:
        if receipt.get("payload_hash") != expected_receipt_hash(receipt):
            errors.append("full receipt hash mismatch")
        hash_payload = receipt["hash_payload"]
        qubo = receipt["qubo"]
        matrix = qubo["matrix"]
        code_evidence = qubo["code_evidence"]
        candidate_ids = [item["candidate_id"] for item in code_evidence]
        execution = receipt["execution_receipt"]
        results = receipt["results"]
        run_configuration = receipt["run_configuration"]

        valid_candidate_count = (
            len(candidate_ids) == PYRAMID_SEMANTIC_VARIABLE_COUNT
            if is_pyramid
            else 12 <= len(candidate_ids) <= 20
        )
        if not valid_candidate_count:
            errors.append(
                "pyramid candidate count is not exactly nine"
                if is_pyramid
                else "candidate count is outside the verified 12..20 bound"
            )
            return errors
        if len(candidate_ids) != len(set(candidate_ids)):
            errors.append("candidate order is not unique")
        if receipt["candidate_count"] != len(candidate_ids):
            errors.append("candidate_count does not match QUBO order")
        expected_matrix_size = len(candidate_ids)
        if is_pyramid:
            if qubo.get("pyramid_variant") not in PYRAMID_VARIANTS:
                errors.append("pyramid receipt variant is unsupported")
                return errors
            expected_semantic_count = PYRAMID_SEMANTIC_VARIABLE_COUNT
            expected_ancilla_count = (
                PYRAMID_VOLUME_TERM_COUNT
                if qubo.get("pyramid_variant") == "volume_quadratized"
                else 0
            )
            expected_total_count = expected_semantic_count + expected_ancilla_count
            pyramid_count_checks = {
                "semantic_variable_count": expected_semantic_count,
                "ancilla_variable_count": expected_ancilla_count,
                "total_qubit_count": expected_total_count,
            }
            expected_matrix_size = expected_total_count
            for key, expected in pyramid_count_checks.items():
                if receipt.get(key) != expected:
                    errors.append(f"{key} does not match the pyramid model")
            if qubo.get("semantic_variable_count") != expected_semantic_count:
                errors.append("QUBO semantic variable count is not nine")
            if qubo.get("ancilla_variable_count") != expected_ancilla_count:
                errors.append("QUBO ancilla variable count does not match the variant")
            if qubo.get("total_variable_count") != expected_total_count:
                errors.append("QUBO total variable count does not match the variant")
        matrix_errors = _qubo_matrix_errors(matrix, expected_matrix_size)
        errors.extend(matrix_errors)
        if matrix_errors:
            return errors
        fixture, source_errors = _recompute_qubo_from_source(
            receipt,
            qubo,
            candidate_ids,
        )
        errors.extend(source_errors)
        if hash_payload["input_sha256"] != receipt["input_sha256"]:
            errors.append("input hash cross-link mismatch")
        if hash_payload["qubo_sha256"] != expected_generic_hash(matrix):
            errors.append("QUBO matrix hash mismatch")
        if hash_payload["code_evidence_sha256"] != expected_generic_hash(code_evidence):
            errors.append("code evidence hash mismatch")
        if hash_payload["code_hashes"] != receipt["code_hashes"]:
            errors.append("pipeline code hash cross-link mismatch")
        if execution.get("payload_hash") != expected_receipt_hash(execution):
            errors.append("nested execution receipt hash mismatch")
        if hash_payload["execution_payload_hash"] != execution.get("payload_hash"):
            errors.append("nested execution hash cross-link mismatch")
        if is_pyramid and fixture is not None:
            variant = qubo.get("pyramid_variant")
            expected_model = {
                "semantic_variable_count": qubo.get("semantic_variable_count"),
                "ancilla_variable_count": qubo.get("ancilla_variable_count"),
                "total_variable_count": qubo.get("total_variable_count"),
                "variable_order": qubo.get("variable_order"),
                "faces": fixture["pyramid_qubo"]["faces"],
                "structural_pair_terms": qubo.get("structural_pair_terms"),
                "higher_order_terms": qubo.get("higher_order_terms"),
                "quadratization": qubo.get("quadratization"),
            }
            if receipt.get("pyramid_variant") != variant:
                errors.append("top-level pyramid variant does not match the QUBO")
            if run_configuration.get("pyramid_variant") != variant:
                errors.append("run configuration pyramid variant does not match")
            if receipt.get("pyramid_qubo") != fixture.get("pyramid_qubo"):
                errors.append("top-level pyramid configuration does not match fixture")
            if not _structure_close(receipt.get("pyramid_model"), expected_model):
                errors.append("top-level pyramid model does not recompute")
            expected_claim_boundary = (
                fixture["pyramid_qubo"]["claim_boundary"]
                + " The pyramid is a visual metaphor for a nine-variable binary "
                "interaction model. The three volume ancillas, when present, are "
                "deterministic encoding overhead. Exact, greedy, random, and local "
                "seeded StatevectorSampler QAOA "
                "results compare declared portfolio objectives only; they do not "
                "establish literal 3D quantum processing, paradox productivity, "
                "novelty, or quantum advantage. The simulator result is accepted only "
                "when it deterministically replays under the recorded Python, Qiskit, "
                "and NumPy versions; "
                "this is not proof of a historical execution event. The seeded sampler "
                "may reuse common random numbers across parameter evaluations; budget "
                "matching counts samples but does not claim independent trials."
            )
            if receipt.get("claim_boundary") != expected_claim_boundary:
                errors.append("pyramid claim boundary does not match the pinned fixture")
            pyramid_hash_checks = {
                "pyramid_variant": variant,
                "base_portfolio_matrix_sha256": expected_generic_hash(
                    qubo["base_portfolio_matrix"]
                ),
                "semantic_pairwise_matrix_sha256": expected_generic_hash(
                    qubo["semantic_pairwise_matrix"]
                ),
                "pyramid_model_sha256": expected_generic_hash(
                    {
                        "variable_order": qubo["variable_order"],
                        "structural_pair_terms": qubo["structural_pair_terms"],
                        "higher_order_terms": qubo["higher_order_terms"],
                        "quadratization": qubo["quadratization"],
                    }
                ),
            }
            for key, expected in pyramid_hash_checks.items():
                if hash_payload.get(key) != expected:
                    errors.append(f"pyramid hash binding {key} does not recompute")

        result_names = {
            "qaoa": "qaoa",
            "exact": "exact",
            "greedy": "greedy",
            "budget_random": "budget_matched_random",
        }
        if is_pyramid:
            result_names["semantic_exact"] = "semantic_exact"
        for summary_name, result_name in result_names.items():
            result = results[result_name]
            expected_core = (
                _pyramid_portfolio_core(result["bitstring"], fixture, qubo)
                if is_pyramid and fixture is not None
                else _portfolio_core(result["bitstring"], candidate_ids, qubo)
            )
            for key, expected in expected_core.items():
                if not _close(result.get(key), expected):
                    errors.append(f"{result_name}.{key} does not recompute")
            expected_summary = {
                "bitstring": result["bitstring"],
                "objective": expected_core["raw_qubo_objective"],
            }
            if summary_name == "semantic_exact":
                expected_summary["semantic_bitstring"] = expected_core[
                    "semantic_bitstring"
                ]
            actual_summary = hash_payload["results"][summary_name]
            if not _structure_close(actual_summary, expected_summary):
                errors.append(f"{summary_name} result summary mismatch")

        expected_greedy_bits = (
            _pyramid_greedy_bitstring(fixture, qubo)
            if is_pyramid and fixture is not None
            else _greedy_bitstring(qubo)
        )
        if results["greedy"]["bitstring"] != expected_greedy_bits:
            errors.append("greedy baseline does not replay from the QUBO")
        expected_greedy_evaluations = sum(
            len(candidate_ids) - index
            for index in range(int(qubo["target_cardinality"]))
        )
        if results["greedy"].get("evaluations") != expected_greedy_evaluations:
            errors.append("greedy evaluation count does not recompute")

        qaoa_result = results["qaoa"]
        raw_shots = qaoa_result.get("shots_per_evaluation")
        raw_optimizer_evaluations = qaoa_result.get("optimizer_evaluations")
        raw_grid_points = run_configuration.get("grid_points")
        raw_seed = run_configuration.get("seed")
        bounded_integers = {
            "shots": raw_shots,
            "optimizer evaluations": raw_optimizer_evaluations,
            "grid points": raw_grid_points,
            "seed": raw_seed,
        }
        invalid_integer_fields = [
            name for name, value in bounded_integers.items() if type(value) is not int
        ]
        if invalid_integer_fields:
            errors.append(
                "QAOA replay configuration has non-integer fields: "
                + ", ".join(invalid_integer_fields)
            )
            return errors
        shots = raw_shots
        optimizer_evaluations = raw_optimizer_evaluations
        grid_points = raw_grid_points
        seed = raw_seed
        if not 1 <= shots <= 100_000:
            errors.append("QAOA replay shots are outside the verified 1..100000 bound")
            return errors
        if not 2 <= grid_points <= 16:
            errors.append("QAOA replay grid is outside the verified 2..16 bound")
            return errors
        if not 0 <= seed <= (1 << 63) - 1:
            errors.append("QAOA replay seed is outside the verified nonnegative bound")
            return errors
        if optimizer_evaluations != grid_points**2:
            errors.append("QAOA evaluation count does not match the declared grid")
            return errors
        measurement_budget = shots * optimizer_evaluations
        if measurement_budget > MAX_RANDOM_REPLAY_EVALUATIONS:
            errors.append("QAOA replay budget exceeds the verifier bound")
            return errors
        if qaoa_result.get("measurement_budget") != measurement_budget:
            errors.append("QAOA measurement budget does not recompute")
        if execution.get("shots") != shots:
            errors.append("QAOA shots do not match the nested execution receipt")
        if execution.get("optimizer_evaluations") != optimizer_evaluations:
            errors.append(
                "QAOA evaluation count does not match the nested execution receipt"
            )
        if is_pyramid and execution.get("num_qubits") != qubo.get(
            "total_variable_count"
        ):
            errors.append("nested execution qubit count does not match pyramid QUBO")

        if run_configuration.get("shots") != shots:
            errors.append("run configuration shots do not match QAOA results")
        if run_configuration.get("p") != 1:
            errors.append("novelty scout run configuration is not QAOA p=1")
        if run_configuration.get("execution_mode") != "aer":
            errors.append("novelty scout run configuration is not simulator-only")
        if execution.get("execution_mode") != run_configuration.get("execution_mode"):
            errors.append("execution mode does not match the nested execution receipt")
        expected_execution_input = expected_generic_hash(
            {
                "problem_type": "qubo",
                "matrix": matrix,
                "p": 1,
                "shots": shots,
                "grid_points": grid_points,
                "seed": seed,
                "execution_mode": "aer",
            }
        )
        if execution.get("input_sha256") != expected_execution_input:
            errors.append("nested execution input does not match the QUBO run")
        if is_pyramid:
            errors.extend(
                _pyramid_qaoa_execution_errors(
                    execution,
                    qaoa_result,
                    matrix,
                    run_configuration,
                    receipt["environment"],
                )
            )

        random_result = results["budget_matched_random"]
        if random_result.get("seed") != seed:
            errors.append("random baseline seed does not match run configuration")
        if random_result.get("evaluations") != measurement_budget:
            errors.append("random baseline budget is not measurement-matched")
        expected_random_basis = (
            PYRAMID_RANDOM_BUDGET_BASIS if is_pyramid else RANDOM_BUDGET_BASIS
        )
        if random_result.get("budget_basis") != expected_random_basis:
            errors.append("random baseline budget basis is not canonical")
        if not 1 <= measurement_budget <= MAX_RANDOM_REPLAY_EVALUATIONS:
            errors.append("random baseline replay budget exceeds verifier bound")
        else:
            expected_random_bits = (
                _seeded_pyramid_random_bitstring(qubo, measurement_budget, seed)
                if is_pyramid
                else _seeded_random_bitstring(matrix, measurement_budget, seed)
            )
            if random_result["bitstring"] != expected_random_bits:
                errors.append("seeded random baseline does not replay from the QUBO")

        exact_bits, exact_value = _exact_qubo_solution(matrix)
        if results["exact"]["bitstring"] != exact_bits or not _close(
            results["exact"]["raw_qubo_objective"], exact_value
        ):
            errors.append("claimed exact result is not the global QUBO optimum")
        expected_expanded_evaluations = 1 << len(matrix)
        if results["exact"].get("evaluations") != expected_expanded_evaluations:
            errors.append("expanded exact evaluation count does not recompute")
        if results["exact"]["selected_count"] != int(qubo["target_cardinality"]):
            errors.append("global QUBO optimum violates target cardinality")
        if results["qaoa"]["bitstring"] != execution.get(
            "optimal_bitstring"
        ) or not _close(
            results["qaoa"]["raw_qubo_objective"], execution.get("optimal_value")
        ):
            errors.append("QAOA result does not match nested execution receipt")
        recommended_result = results["exact"]
        recommended_semantic_bits = exact_bits
        if is_pyramid:
            semantic_exact_bits, semantic_exact_value = (
                _semantic_exact_pyramid_solution(qubo)
            )
            semantic_exact_result = results["semantic_exact"]
            if semantic_exact_result["bitstring"] != semantic_exact_bits or not _close(
                semantic_exact_result["raw_qubo_objective"], semantic_exact_value
            ):
                errors.append(
                    "claimed semantic exact result is not the global decoded optimum"
                )
            if (
                results["exact"].get("semantic_bitstring")
                != semantic_exact_result.get("semantic_bitstring")
                or not _close(exact_value, semantic_exact_value)
            ):
                errors.append(
                    "expanded exact optimum does not project to semantic exact optimum"
                )
            if semantic_exact_result.get("evaluations") != (
                1 << PYRAMID_SEMANTIC_VARIABLE_COUNT
            ):
                errors.append("semantic exact evaluation count does not recompute")
            recommended_result = semantic_exact_result
            recommended_semantic_bits = semantic_exact_result["semantic_bitstring"]
        if receipt["recommended_portfolio"] != recommended_result:
            errors.append("recommended portfolio is not the verified exact result")

        exact_ids = _selected_ids(recommended_semantic_bits, candidate_ids)
        selected_candidates = receipt["selected_candidates"]
        selected_code_evidence = receipt["selected_code_evidence"]
        if [item["id"] for item in selected_candidates] != exact_ids:
            errors.append("selected candidate records do not match exact bitstring")
        if [item["candidate_id"] for item in selected_code_evidence] != exact_ids:
            errors.append("selected code evidence does not match exact bitstring")
        if fixture is not None:
            candidates_by_id = {
                candidate["id"]: candidate for candidate in fixture["candidates"]
            }
            expected_selected_candidates = [
                candidates_by_id[candidate_id] for candidate_id in exact_ids
            ]
            if selected_candidates != expected_selected_candidates:
                errors.append("selected candidate records do not match pinned fixture")
            evidence_by_id = {
                item["candidate_id"]: item for item in qubo["code_evidence"]
            }
            expected_selected_evidence = [
                evidence_by_id[candidate_id] for candidate_id in exact_ids
            ]
            if selected_code_evidence != expected_selected_evidence:
                errors.append("selected code evidence records do not match the QUBO")

        selected_paths_available = all(
            bool(item["required_paths_available"]) for item in selected_code_evidence
        )
        all_paths_available = all(
            bool(item["required_paths_available"]) for item in code_evidence
        )
        source_grounding_complete = all(
            item["kill_test"].get("status") in TERMINAL_KILL_STATUSES
            and bool(item["kill_test"].get("sources"))
            for item in selected_candidates
        )
        selected_claims_not_killed = all(
            item["kill_test"].get("status") != "killed" for item in selected_candidates
        )
        top_level_checks = {
            "selected_code_evidence_paths_available": selected_paths_available,
            "all_candidate_code_evidence_paths_available": all_paths_available,
            "source_grounding_complete": source_grounding_complete,
            "selected_claims_not_killed": selected_claims_not_killed,
        }
        for key, expected in top_level_checks.items():
            if receipt.get(key) != expected:
                errors.append(f"{key} does not recompute")
        expected_gap = float(results["qaoa"]["raw_qubo_objective"]) - float(
            results["exact"]["raw_qubo_objective"]
        )
        if not _close(receipt["qaoa_optimality_gap"], expected_gap):
            errors.append("qaoa_optimality_gap does not recompute")

        expected_criteria = {
            "qaoa_strictly_beats_greedy": results["qaoa"]["raw_qubo_objective"]
            < results["greedy"]["raw_qubo_objective"] - 1e-9,
            "qaoa_strictly_beats_budget_random": results["qaoa"]["raw_qubo_objective"]
            < results["budget_matched_random"]["raw_qubo_objective"] - 1e-9,
            "classical_exact_not_cheaper": (
                results["semantic_exact"]["runtime_seconds"]
                if is_pyramid
                else results["exact"]["runtime_seconds"]
            )
            > results["qaoa"]["runtime_seconds"],
            "nontrivial_problem_scale": len(candidate_ids) >= 18,
            "qaoa_target_cardinality_met": results["qaoa"]["selected_count"]
            == int(qubo["target_cardinality"]),
            "selected_kill_tests_complete": source_grounding_complete,
            "selected_claims_not_killed": selected_claims_not_killed,
            "selected_code_evidence_paths_available": selected_paths_available,
        }
        if is_pyramid:
            expected_criteria["qaoa_model_constraints_satisfied"] = bool(
                results["qaoa"]["model_constraints_satisfied"]
            )
        hardware_gate = receipt["hardware_gate"]
        if hardware_gate["criteria"] != expected_criteria:
            errors.append("hardware gate criteria do not recompute")
        expected_decision = "GO" if all(expected_criteria.values()) else "NO_GO"
        if hardware_gate["decision"] != expected_decision:
            errors.append("hardware gate decision does not recompute")
        if hash_payload["hardware_gate_decision"] != expected_decision:
            errors.append("hardware gate hash cross-link mismatch")
    except (KeyError, TypeError, ValueError, IndexError) as error:
        errors.append(f"malformed novelty-scout receipt: {error}")
    return errors


def load_ibm_key() -> str | None:
    key = os.environ.get(ENV_NAME)
    if key:
        return key
    try:
        if ENV_FILE.exists():
            for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
                if line.startswith(ENV_NAME):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


def find_receipts() -> list[pathlib.Path]:
    paths = set()
    for pat in ("quantum_receipts/*.json", "quantum*_receipt.json"):
        paths.update(REPO_ROOT.glob(pat))
    return sorted(paths)


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify HoloScript quantum receipts.")
    ap.add_argument(
        "--online", action="store_true", help="cross-check job IDs against IBM Runtime"
    )
    ap.add_argument(
        "--tol", type=float, default=1e-6, help="energy match tolerance (Ha)"
    )
    ap.add_argument(
        "--receipt",
        action="append",
        help="verify only this receipt path (repeatable)",
    )
    args = ap.parse_args()

    receipts = (
        [pathlib.Path(path).expanduser().resolve() for path in args.receipt]
        if args.receipt
        else find_receipts()
    )
    if not receipts:
        print("no receipts found")
        return 0

    svc = None
    if args.online:
        key = load_ibm_key()
        if not key:
            print(f"FAIL --online requested but {ENV_NAME} not found")
            return 2
        from qiskit_ibm_runtime import QiskitRuntimeService

        svc = QiskitRuntimeService(channel="ibm_quantum_platform", token=key)

    import numpy as np

    failures = 0
    for path in receipts:
        r = json.loads(path.read_text(encoding="utf-8"))
        name = path.name
        hash_payload = r.get("hash_payload")
        stored_generic = r.get("payload_hash")
        if (
            not isinstance(hash_payload, dict)
            and r.get("schema") == "cael-quantum-v1.vqe-runner"
        ):
            hash_payload = r.get("hashPayload")
            stored_generic = r.get("payloadHash")
        if isinstance(hash_payload, dict):
            want_generic = expected_receipt_hash(r)
            if stored_generic != want_generic:
                print(f"FAIL  {name}  canonical payload_hash mismatch")
                failures += 1
            else:
                print(f"OK    {name}  canonical payload hash verifies")
            linked_code_status = linked_code_evidence_verifies(r)
            if linked_code_status is False:
                print(f"FAIL  {name}  linked code evidence hash mismatch")
                failures += 1
            elif linked_code_status is True:
                print(f"OK    {name}  linked code evidence hash verifies")
            if looks_like_novelty_scout_receipt(r):
                semantic_errors = novelty_scout_receipt_errors(r)
                if semantic_errors:
                    for error in semantic_errors:
                        print(f"FAIL  {name}  {error}")
                    failures += 1
                else:
                    print(f"OK    {name}  novelty-scout scientific claims recompute")
            if r.get("schema") == SAMPLING_BENCHMARK_SCHEMA:
                semantic_errors = sampling_benchmark_receipt_errors(r)
                if semantic_errors:
                    for error in semantic_errors:
                        print(f"FAIL  {name}  {error}")
                    failures += 1
                else:
                    print(
                        f"OK    {name}  "
                        "sampling-benchmark scientific claims recompute"
                    )

        if not is_ibm_receipt(r):
            if not isinstance(hash_payload, dict):
                print(f"SKIP  {name}  (not an IBM-backend or generic receipt)")
            continue

        entries = certified_entries(r)
        if not entries:
            print(f"FAIL  {name}  no certified receipt entries")
            failures += 1
            continue

        for entry in entries:
            key = entry["key"]
            value = entry["value"]
            job_id = entry["job_id"]
            backend = entry["backend"]
            stored = entry["payload_hash"]
            is_energy = entry["is_energy"]
            label = entry["label"]

            if value is None or not job_id:
                print(f"FAIL  {name}  {label}: missing certified value or job_id")
                failures += 1
                continue

            want = expected_hash(value, job_id)
            if stored is None:
                print(f"FAIL  {name}  {label}: no payload_hash (not self-certifying)")
                failures += 1
            elif stored != want:
                print(
                    f"FAIL  {name}  {label}: payload_hash mismatch over {key}={value}+job_id"
                )
                failures += 1
            else:
                print(
                    f"OK    {name}  {label}: hash verifies ({key}={value}, job={job_id})"
                )

            if svc is not None:
                try:
                    j = svc.job(job_id)
                    jbackend = j.backend().name
                    ok_be = jbackend == backend
                    if is_energy:
                        ev = float(np.asarray(j.result()[0].data.evs).reshape(-1)[0])
                        ok_ev = abs(ev - value) <= args.tol
                        ok = ok_be and ok_ev
                        print(
                            f"  {'OK   ' if ok else 'FAIL '}IBM {job_id}: backend={jbackend} "
                            f"(match={ok_be}) evs={ev:+.12f} vs {value:+.12f} (match={ok_ev})"
                        )
                    else:
                        ok = ok_be and str(j.status()) in ("DONE", "JobStatus.DONE")
                        print(
                            f"  {'OK   ' if ok else 'FAIL '}IBM {job_id}: backend={jbackend} "
                            f"(match={ok_be}) status={j.status()} [QAOA: existence-checked only]"
                        )
                    if not ok:
                        failures += 1
                except Exception as e:
                    print(
                        f"  FAIL IBM {job_id} not retrievable: {type(e).__name__}: {str(e)[:140]}"
                    )
                    failures += 1

    print()
    print(
        f"{'PASS' if failures == 0 else 'FAIL'}: {len(receipts)} receipt(s) scanned, {failures} failure(s)"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
