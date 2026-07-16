#!/usr/bin/env python3
"""Receipt-backed QUBO portfolio scout for HoloScript paper claims.

The QUBO selects a fixed-size, low-redundancy portfolio from auditable ordinal
research priors. It does not establish novelty. Selected claims still require
fresh primary-source kill tests and artifact evidence before publication.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import pathlib
import platform
import random
import time
from datetime import datetime, timezone
from typing import Any

from quantum_execute import run_qaoa

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_INPUT = REPO_ROOT / "research" / "quantum-novelty-scout" / "candidates-v1.json"
DEFAULT_COMPOSITION = (
    REPO_ROOT / "research" / "quantum-novelty-scout" / "novelty-portfolio.holo"
)
DEFAULT_RECEIPT = (
    REPO_ROOT / "quantum_receipts" / "quantum_novelty_scout_statevector_receipt.json"
)
TERMINAL_KILL_STATUSES = {"survives_tightened_claim", "narrowed", "killed"}


def canonical_hash(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def file_sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def display_path(path: pathlib.Path) -> str:
    try:
        shown = path.relative_to(REPO_ROOT)
    except ValueError:
        shown = path
    return str(shown).replace("\\", "/")


def load_fixture(path: pathlib.Path) -> dict[str, Any]:
    fixture = json.loads(path.read_text(encoding="utf-8"))
    candidates = fixture.get("candidates")
    if not isinstance(candidates, list) or not 12 <= len(candidates) <= 20:
        raise ValueError("novelty benchmark requires 12..20 candidates")
    ids = [candidate.get("id") for candidate in candidates]
    if len(ids) != len(set(ids)) or any(not item for item in ids):
        raise ValueError("candidate IDs must be non-empty and unique")
    target = int(fixture.get("target_cardinality", 0))
    if not 1 <= target <= len(candidates):
        raise ValueError("target_cardinality must be within the candidate count")
    weights = fixture.get("score_weights")
    if not isinstance(weights, dict) or not weights:
        raise ValueError("score_weights must be a non-empty object")
    for candidate in candidates:
        scores = candidate.get("scores")
        if not isinstance(scores, dict):
            raise ValueError(f"{candidate['id']} has no score object")
        for key in weights:
            value = float(scores.get(key, -1))
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{candidate['id']} score {key} must be in [0, 1]")
    return fixture


def candidate_reward(
    candidate: dict[str, Any],
    weights: dict[str, float],
    status_adjustments: dict[str, float],
) -> float:
    weighted_score = sum(
        float(weights[key]) * float(candidate["scores"][key]) for key in weights
    )
    status = str(candidate.get("kill_test", {}).get("status", "pending_fresh_source_check"))
    return weighted_score + float(status_adjustments.get(status, 0.0))


def tag_similarity(left: dict[str, Any], right: dict[str, Any]) -> float:
    left_tags = set(left.get("tags", []))
    right_tags = set(right.get("tags", []))
    union = left_tags | right_tags
    return len(left_tags & right_tags) / len(union) if union else 0.0


def build_qubo(fixture: dict[str, Any]) -> dict[str, Any]:
    candidates = fixture["candidates"]
    weights = {key: float(value) for key, value in fixture["score_weights"].items()}
    target = int(fixture["target_cardinality"])
    cardinality_penalty = float(fixture["cardinality_penalty"])
    redundancy_penalty = float(fixture["redundancy_penalty"])
    status_adjustments = {
        key: float(value) for key, value in fixture.get("kill_status_adjustments", {}).items()
    }
    rewards = [
        candidate_reward(candidate, weights, status_adjustments) for candidate in candidates
    ]
    size = len(candidates)
    matrix = [[0.0 for _ in range(size)] for _ in range(size)]
    similarities = [[0.0 for _ in range(size)] for _ in range(size)]

    for i in range(size):
        matrix[i][i] = round(
            -rewards[i] + cardinality_penalty * (1 - 2 * target), 10
        )
        for j in range(i + 1, size):
            similarity = tag_similarity(candidates[i], candidates[j])
            similarities[i][j] = similarity
            matrix[i][j] = round(
                2 * cardinality_penalty + redundancy_penalty * similarity,
                10,
            )

    return {
        "matrix": matrix,
        "constant_offset": cardinality_penalty * target * target,
        "candidate_rewards": rewards,
        "tag_similarities": similarities,
        "target_cardinality": target,
        "cardinality_penalty": cardinality_penalty,
        "redundancy_penalty": redundancy_penalty,
        "kill_status_adjustments": status_adjustments,
        "convention": "upper triangular: sum_i Qii*x_i + sum_{i<j} Qij*x_i*x_j",
    }


def qubo_objective(bitstring: str, matrix: list[list[float]]) -> float:
    bits = [int(bit) for bit in bitstring]
    return float(
        sum(matrix[i][i] * bits[i] for i in range(len(bits)))
        + sum(
            matrix[i][j] * bits[i] * bits[j]
            for i in range(len(bits))
            for j in range(i + 1, len(bits))
        )
    )


def portfolio_metrics(
    bitstring: str,
    fixture: dict[str, Any],
    qubo: dict[str, Any],
) -> dict[str, Any]:
    selected_indices = [index for index, bit in enumerate(bitstring) if bit == "1"]
    candidates = fixture["candidates"]
    reward_sum = sum(qubo["candidate_rewards"][index] for index in selected_indices)
    redundancy = sum(
        qubo["redundancy_penalty"] * qubo["tag_similarities"][i][j]
        for offset, i in enumerate(selected_indices)
        for j in selected_indices[offset + 1 :]
    )
    constraint_penalty = qubo["cardinality_penalty"] * (
        len(selected_indices) - qubo["target_cardinality"]
    ) ** 2
    raw_objective = qubo_objective(bitstring, qubo["matrix"])
    shifted_objective = raw_objective + qubo["constant_offset"]
    expected_shifted = -reward_sum + redundancy + constraint_penalty
    if abs(shifted_objective - expected_shifted) > 1e-6:
        raise AssertionError("QUBO expansion no longer matches portfolio semantics")
    return {
        "bitstring": bitstring,
        "selected_ids": [candidates[index]["id"] for index in selected_indices],
        "selected_count": len(selected_indices),
        "raw_qubo_objective": raw_objective,
        "shifted_objective": shifted_objective,
        "reward_sum": reward_sum,
        "redundancy_penalty": redundancy,
        "constraint_penalty": constraint_penalty,
        "portfolio_score": reward_sum - redundancy,
    }


def exact_baseline(fixture: dict[str, Any], qubo: dict[str, Any]) -> dict[str, Any]:
    size = len(fixture["candidates"])
    started = time.perf_counter()
    best_bits = "0" * size
    best_value = float("inf")
    for mask in range(1 << size):
        bits = format(mask, f"0{size}b")
        value = qubo_objective(bits, qubo["matrix"])
        if value < best_value:
            best_value = value
            best_bits = bits
    result = portfolio_metrics(best_bits, fixture, qubo)
    result["runtime_seconds"] = time.perf_counter() - started
    result["evaluations"] = 1 << size
    return result


def greedy_baseline(fixture: dict[str, Any], qubo: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    selected: list[int] = []
    available = set(range(len(fixture["candidates"])))
    for _ in range(qubo["target_cardinality"]):
        choice = max(
            available,
            key=lambda index: (
                qubo["candidate_rewards"][index]
                - sum(
                    qubo["redundancy_penalty"]
                    * qubo["tag_similarities"][min(index, prior)][max(index, prior)]
                    for prior in selected
                ),
                -index,
            ),
        )
        selected.append(choice)
        available.remove(choice)
    bits = "".join("1" if index in selected else "0" for index in range(len(available) + len(selected)))
    result = portfolio_metrics(bits, fixture, qubo)
    result["runtime_seconds"] = time.perf_counter() - started
    result["evaluations"] = sum(len(fixture["candidates"]) - i for i in range(qubo["target_cardinality"]))
    return result


def random_baseline(
    fixture: dict[str, Any],
    qubo: dict[str, Any],
    budget: int,
    seed: int,
) -> dict[str, Any]:
    started = time.perf_counter()
    rng = random.Random(seed)
    size = len(fixture["candidates"])
    best_bits = "0" * size
    best_value = float("inf")
    for _ in range(budget):
        bits = format(rng.randrange(1 << size), f"0{size}b")
        value = qubo_objective(bits, qubo["matrix"])
        if value < best_value:
            best_value = value
            best_bits = bits
    result = portfolio_metrics(best_bits, fixture, qubo)
    result["runtime_seconds"] = time.perf_counter() - started
    result["evaluations"] = budget
    result["seed"] = seed
    result["budget_basis"] = "one random bitstring per QAOA shot across all parameter evaluations"
    return result


def render_composition(qubo: dict[str, Any], input_sha256: str) -> str:
    matrix_json = json.dumps(qubo["matrix"], separators=(",", ":"))
    matrix_literal = json.dumps(matrix_json)
    return (
        "// Generated by scripts/quantum_novelty_scout.py\n"
        f"// Candidate fixture sha256: {input_sha256}\n"
        "// QUBO ranks hypotheses; it does not prove novelty.\n"
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


def verify_receipt(receipt: dict[str, Any]) -> bool:
    hash_payload = receipt.get("hash_payload")
    return isinstance(hash_payload, dict) and receipt.get("payload_hash") == canonical_hash(
        hash_payload
    )


def run_scout(
    fixture_path: pathlib.Path,
    composition_path: pathlib.Path,
    receipt_path: pathlib.Path,
    shots: int,
    grid_points: int,
    seed: int,
) -> dict[str, Any]:
    fixture = load_fixture(fixture_path)
    qubo = build_qubo(fixture)
    input_sha256 = canonical_hash(fixture)
    composition = render_composition(qubo, input_sha256)
    composition_path.parent.mkdir(parents=True, exist_ok=True)
    composition_path.write_text(composition, encoding="utf-8")

    qaoa_result = run_qaoa(
        {
            "task": "qaoa",
            "qubo_matrix": qubo["matrix"],
            "objective_sense": "minimize",
            "p": 1,
            "execution_mode": "aer",
            "shots": shots,
            "grid_points": grid_points,
            "seed": seed,
            "write_receipt": False,
        }
    )
    if "error" in qaoa_result:
        raise RuntimeError(qaoa_result["error"])

    qaoa = portfolio_metrics(qaoa_result["optimal_bitstring"], fixture, qubo)
    qaoa.update(
        {
            "runtime_seconds": qaoa_result["wall_time_seconds"],
            "shots_per_evaluation": shots,
            "optimizer_evaluations": qaoa_result["optimizer_evaluations"],
            "measurement_budget": shots * qaoa_result["optimizer_evaluations"],
            "best_sampled_expectation": qaoa_result["best_sampled_expectation"],
            "selected_parameters": qaoa_result["selected_parameters"],
        }
    )
    exact = exact_baseline(fixture, qubo)
    greedy = greedy_baseline(fixture, qubo)
    random_result = random_baseline(
        fixture,
        qubo,
        budget=qaoa["measurement_budget"],
        seed=seed,
    )

    candidates_by_id = {candidate["id"]: candidate for candidate in fixture["candidates"]}
    selected_candidates = [candidates_by_id[item] for item in exact["selected_ids"]]
    source_grounding_complete = all(
        candidate["kill_test"].get("status") in TERMINAL_KILL_STATUSES
        and bool(candidate["kill_test"].get("sources"))
        for candidate in selected_candidates
    )
    criteria = {
        "qaoa_strictly_beats_greedy": qaoa["raw_qubo_objective"]
        < greedy["raw_qubo_objective"] - 1e-9,
        "qaoa_strictly_beats_budget_random": qaoa["raw_qubo_objective"]
        < random_result["raw_qubo_objective"] - 1e-9,
        "classical_exact_not_cheaper": exact["runtime_seconds"]
        > qaoa["runtime_seconds"],
        "nontrivial_problem_scale": len(fixture["candidates"]) >= 18,
        "selected_kill_tests_complete": source_grounding_complete,
    }
    hardware_gate = {
        "decision": "GO" if all(criteria.values()) else "NO_GO",
        "criteria": criteria,
        "reason": (
            "All preregistered comparative and evidence gates passed."
            if all(criteria.values())
            else "IBM hardware is not justified unless QAOA adds comparative signal at nontrivial scale after source grounding."
        ),
        "ibm_job_submitted": False,
    }

    code_hashes = {
        "scout_sha256": file_sha256(pathlib.Path(__file__).resolve()),
        "executor_sha256": file_sha256(REPO_ROOT / "scripts" / "quantum_execute.py"),
        "verifier_sha256": file_sha256(REPO_ROOT / "scripts" / "quantum_receipt_verify.py"),
        "composition_sha256": file_sha256(composition_path),
    }
    result_summary = {
        "qaoa": {"bitstring": qaoa["bitstring"], "objective": qaoa["raw_qubo_objective"]},
        "exact": {"bitstring": exact["bitstring"], "objective": exact["raw_qubo_objective"]},
        "greedy": {"bitstring": greedy["bitstring"], "objective": greedy["raw_qubo_objective"]},
        "budget_random": {"bitstring": random_result["bitstring"], "objective": random_result["raw_qubo_objective"]},
    }
    hash_payload = {
        "input_sha256": input_sha256,
        "qubo_sha256": canonical_hash(qubo["matrix"]),
        "execution_payload_hash": qaoa_result["receipt"]["payload_hash"],
        "code_hashes": code_hashes,
        "results": result_summary,
        "hardware_gate_decision": hardware_gate["decision"],
    }
    receipt = {
        "schema": "cael-quantum-v1.qaoa-novelty-scout",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "QAOA prioritizes a diverse candidate portfolio from declared ordinal priors. It neither searches the literature nor proves novelty, quantum advantage, or publication readiness.",
        "fixture": display_path(fixture_path),
        "input_sha256": input_sha256,
        "candidate_count": len(fixture["candidates"]),
        "target_cardinality": fixture["target_cardinality"],
        "score_basis": fixture["score_basis"],
        "score_weights": fixture["score_weights"],
        "qubo": qubo,
        "composition": display_path(composition_path),
        "execution_receipt": qaoa_result["receipt"],
        "results": {
            "qaoa": qaoa,
            "exact": exact,
            "greedy": greedy,
            "budget_matched_random": random_result,
        },
        "qaoa_optimality_gap": qaoa["raw_qubo_objective"] - exact["raw_qubo_objective"],
        "recommended_portfolio": exact,
        "selected_candidates": selected_candidates,
        "source_grounding_complete": source_grounding_complete,
        "hardware_gate": hardware_gate,
        "environment": {
            "python": platform.python_version(),
            "qiskit": importlib.metadata.version("qiskit"),
            "platform": platform.platform(),
        },
        "code_hashes": code_hashes,
        "hash_scheme": "sha256-canonical-json-v1",
        "hash_payload": hash_payload,
        "payload_hash": canonical_hash(hash_payload),
    }
    if not verify_receipt(receipt):
        raise AssertionError("generated receipt failed its own canonical hash check")
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=pathlib.Path, default=DEFAULT_INPUT)
    parser.add_argument("--composition-out", type=pathlib.Path, default=DEFAULT_COMPOSITION)
    parser.add_argument("--out", type=pathlib.Path, default=DEFAULT_RECEIPT)
    parser.add_argument("--shots", type=int, default=128)
    parser.add_argument("--grid-points", type=int, default=4)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()
    receipt = run_scout(
        args.input.resolve(),
        args.composition_out.resolve(),
        args.out.resolve(),
        max(1, args.shots),
        max(2, args.grid_points),
        args.seed,
    )
    summary = {
        "receipt": str(args.out.resolve()),
        "recommended_ids": receipt["recommended_portfolio"]["selected_ids"],
        "qaoa_sampled_ids": receipt["results"]["qaoa"]["selected_ids"],
        "qaoa_objective": receipt["results"]["qaoa"]["raw_qubo_objective"],
        "exact_objective": receipt["results"]["exact"]["raw_qubo_objective"],
        "hardware_gate": receipt["hardware_gate"]["decision"],
        "payload_hash": receipt["payload_hash"],
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
