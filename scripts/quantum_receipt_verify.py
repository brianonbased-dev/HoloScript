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
import json
import math
import os
import pathlib
import random
import subprocess

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
ENERGY_KEYS = ("ibm_zne_opt_energy_Ha", "zne_energy_Ha", "ibm_energy_Ha")
ENV_NAME = "IBM_QUANTUM_API_KEY"
FULL_RECEIPT_HASH_SCOPE = "full_receipt_excluding_payload_hash"
NOVELTY_SCOUT_SCHEMA = "cael-quantum-v2.qaoa-novelty-scout"
TERMINAL_KILL_STATUSES = {"survives_tightened_claim", "narrowed", "killed"}
RANDOM_BUDGET_BASIS = (
    "one random bitstring per QAOA shot across all parameter evaluations"
)
MAX_RANDOM_REPLAY_EVALUATIONS = 1_000_000
ENV_FILE = REPO_ROOT / ".env"


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
def _git_worktree_blob_oid(path: str) -> str | None:
    completed = subprocess.run(
        ["git", "hash-object", "--", path],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return completed.stdout.strip() if completed.returncode == 0 else None


def _dirty_paths(status_lines: object) -> set[str]:
    paths: set[str] = set()
    if not isinstance(status_lines, list):
        return paths
    for line in status_lines:
        if not isinstance(line, str) or len(line) < 4:
            continue
        payload = line[3:].strip().strip('"').replace("\\", "/")
        if " -> " in payload:
            paths.update(part.strip().strip('"') for part in payload.split(" -> "))
        elif payload:
            paths.add(payload)
    return paths


def _validate_source_snapshot(
    receipt: dict,
) -> tuple[dict[str, dict], dict[str, bytes], list[str]]:
    errors: list[str] = []
    source_state = receipt["source_state"]
    status_lines = source_state["scoped_status"]
    dirty_paths = _dirty_paths(status_lines)
    if bool(status_lines) != bool(source_state["scoped_dirty"]):
        errors.append("source snapshot dirty flag does not match its status")
    head_commit = source_state["head_commit"]
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
            if path not in dirty_paths:
                errors.append(
                    f"source snapshot path is not pinned by HEAD or status: {path}"
                )
            elif _git_worktree_blob_oid(path) != oid:
                errors.append(
                    f"source snapshot dirty path no longer matches its blob: {path}"
                )
    return records, blobs, errors


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
    fixture_path = _safe_repo_path(receipt.get("fixture"))
    if fixture_path is None or fixture_path not in source_blobs:
        errors.append("pinned candidate fixture is unavailable")
        return None, errors
    try:
        fixture = json.loads(source_blobs[fixture_path].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        errors.append(f"pinned candidate fixture is malformed: {error}")
        return None, errors
    if receipt.get("input_sha256") != expected_generic_hash(fixture):
        errors.append("input hash does not match the pinned candidate fixture")

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
    for key, expected in expected_qubo_fields.items():
        if not _structure_close(qubo.get(key), expected):
            errors.append(f"QUBO {key} does not recompute from pinned source")
    return fixture, errors


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

    if not looks_like_novelty_scout_receipt(receipt):
        return []
    if receipt.get("schema") != NOVELTY_SCOUT_SCHEMA:
        return ["novelty-scout schema downgrade or mismatch"]
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

        if not 12 <= len(candidate_ids) <= 20:
            errors.append("candidate count is outside the verified 12..20 bound")
            return errors
        if len(candidate_ids) != len(set(candidate_ids)):
            errors.append("candidate order is not unique")
        if receipt["candidate_count"] != len(candidate_ids):
            errors.append("candidate_count does not match QUBO order")
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

        result_names = {
            "qaoa": "qaoa",
            "exact": "exact",
            "greedy": "greedy",
            "budget_random": "budget_matched_random",
        }
        for summary_name, result_name in result_names.items():
            result = results[result_name]
            expected_core = _portfolio_core(result["bitstring"], candidate_ids, qubo)
            for key, expected in expected_core.items():
                if not _close(result.get(key), expected):
                    errors.append(f"{result_name}.{key} does not recompute")
            expected_summary = {
                "bitstring": result["bitstring"],
                "objective": expected_core["raw_qubo_objective"],
            }
            actual_summary = hash_payload["results"][summary_name]
            if actual_summary.get("bitstring") != expected_summary[
                "bitstring"
            ] or not _close(
                actual_summary.get("objective"), expected_summary["objective"]
            ):
                errors.append(f"{summary_name} result summary mismatch")

        expected_greedy_bits = _greedy_bitstring(qubo)
        if results["greedy"]["bitstring"] != expected_greedy_bits:
            errors.append("greedy baseline does not replay from the QUBO")
        expected_greedy_evaluations = sum(
            len(candidate_ids) - index
            for index in range(int(qubo["target_cardinality"]))
        )
        if results["greedy"].get("evaluations") != expected_greedy_evaluations:
            errors.append("greedy evaluation count does not recompute")

        qaoa_result = results["qaoa"]
        shots = int(qaoa_result["shots_per_evaluation"])
        optimizer_evaluations = int(qaoa_result["optimizer_evaluations"])
        measurement_budget = shots * optimizer_evaluations
        if qaoa_result.get("measurement_budget") != measurement_budget:
            errors.append("QAOA measurement budget does not recompute")
        if execution.get("shots") != shots:
            errors.append("QAOA shots do not match the nested execution receipt")
        if execution.get("optimizer_evaluations") != optimizer_evaluations:
            errors.append(
                "QAOA evaluation count does not match the nested execution receipt"
            )

        seed = int(run_configuration["seed"])
        grid_points = int(run_configuration["grid_points"])
        if run_configuration.get("shots") != shots:
            errors.append("run configuration shots do not match QAOA results")
        if run_configuration.get("p") != 1:
            errors.append("novelty scout run configuration is not QAOA p=1")
        if run_configuration.get("execution_mode") != "aer":
            errors.append("novelty scout run configuration is not simulator-only")
        if execution.get("execution_mode") != run_configuration.get("execution_mode"):
            errors.append("execution mode does not match the nested execution receipt")
        if optimizer_evaluations != grid_points**2:
            errors.append("QAOA evaluation count does not match the declared grid")
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

        random_result = results["budget_matched_random"]
        if random_result.get("seed") != seed:
            errors.append("random baseline seed does not match run configuration")
        if random_result.get("evaluations") != measurement_budget:
            errors.append("random baseline budget is not measurement-matched")
        if random_result.get("budget_basis") != RANDOM_BUDGET_BASIS:
            errors.append("random baseline budget basis is not canonical")
        if not 1 <= measurement_budget <= MAX_RANDOM_REPLAY_EVALUATIONS:
            errors.append("random baseline replay budget exceeds verifier bound")
        else:
            expected_random_bits = _seeded_random_bitstring(
                matrix,
                measurement_budget,
                seed,
            )
            if random_result["bitstring"] != expected_random_bits:
                errors.append("seeded random baseline does not replay from the QUBO")

        exact_bits, exact_value = _exact_qubo_solution(matrix)
        if results["exact"]["bitstring"] != exact_bits or not _close(
            results["exact"]["raw_qubo_objective"], exact_value
        ):
            errors.append("claimed exact result is not the global QUBO optimum")
        if results["exact"]["selected_count"] != int(qubo["target_cardinality"]):
            errors.append("global QUBO optimum violates target cardinality")
        if results["qaoa"]["bitstring"] != execution.get(
            "optimal_bitstring"
        ) or not _close(
            results["qaoa"]["raw_qubo_objective"], execution.get("optimal_value")
        ):
            errors.append("QAOA result does not match nested execution receipt")
        if receipt["recommended_portfolio"] != results["exact"]:
            errors.append("recommended portfolio is not the exact result")

        exact_ids = _selected_ids(exact_bits, candidate_ids)
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
            "classical_exact_not_cheaper": results["exact"]["runtime_seconds"]
            > results["qaoa"]["runtime_seconds"],
            "nontrivial_problem_scale": len(candidate_ids) >= 18,
            "qaoa_target_cardinality_met": results["qaoa"]["selected_count"]
            == int(qubo["target_cardinality"]),
            "selected_kill_tests_complete": source_grounding_complete,
            "selected_claims_not_killed": selected_claims_not_killed,
            "selected_code_evidence_paths_available": selected_paths_available,
        }
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
        if isinstance(hash_payload, dict):
            stored_generic = r.get("payload_hash")
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
