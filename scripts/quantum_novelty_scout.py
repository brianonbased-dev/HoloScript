#!/usr/bin/env python3
"""Receipt-backed QUBO portfolio scout for HoloScript paper claims.

The QUBO selects a fixed-size, low-redundancy portfolio from auditable ordinal
research priors and repository-observed code evidence. It does not establish
novelty. Selected claims still require fresh primary-source kill tests and
semantic artifact validation before publication.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import pathlib
import platform
import random
import re
import subprocess
import time
from datetime import datetime, timezone
from typing import Any

from quantum_execute import run_qaoa
from quantum_receipt_verify import (
    NOVELTY_SCOUT_SCHEMA,
    RANDOM_BUDGET_BASIS,
    novelty_scout_receipt_errors,
)

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_INPUT = REPO_ROOT / "research" / "quantum-novelty-scout" / "candidates-v1.json"
DEFAULT_COMPOSITION = (
    REPO_ROOT / "research" / "quantum-novelty-scout" / "novelty-portfolio.holo"
)
DEFAULT_RECEIPT = (
    REPO_ROOT / "quantum_receipts" / "quantum_novelty_scout_statevector_receipt.json"
)
TERMINAL_KILL_STATUSES = {"survives_tightened_claim", "narrowed", "killed"}
FULL_RECEIPT_HASH_SCOPE = "full_receipt_excluding_payload_hash"
PARADOX_PROBE_FIXTURE_SCHEMA = "holoscript.quantum-paradox-probes.v1"
PARADOX_FORBIDDEN_RANKING_TOKENS = {
    "adjudication",
    "novelty",
    "outcome",
    "paradox_score",
    "verdict",
}
PARADOX_OPTIMIZER_INPUT_FIELDS = [
    "scores",
    "kill_test.status",
    "tags",
    "code_evidence",
]
PARADOX_ALLOWED_STAGES = {"normalized", "falsifiable", "reproduced"}


def canonical_hash(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def file_sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def display_path(path: pathlib.Path) -> str:
    try:
        shown = path.relative_to(REPO_ROOT)
    except ValueError:
        shown = path
    return str(shown).replace("\\", "/")


def _git_output(repo_root: pathlib.Path, *args: str) -> str | None:
    completed = subprocess.run(
        ["git", *args],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    return completed.stdout.rstrip() if completed.returncode == 0 else None


def _git_blob_oid(path: pathlib.Path, repo_root: pathlib.Path) -> str | None:
    try:
        relative = str(path.resolve().relative_to(repo_root.resolve()))
    except ValueError:
        return None
    oid = _git_output(repo_root, "hash-object", "-w", "--", relative)
    if not oid:
        return None
    return oid if _git_output(repo_root, "cat-file", "-t", oid) == "blob" else None


def _git_blob_bytes(oid: str, repo_root: pathlib.Path) -> bytes | None:
    completed = subprocess.run(
        ["git", "cat-file", "blob", oid],
        cwd=repo_root,
        capture_output=True,
        check=False,
    )
    return completed.stdout if completed.returncode == 0 else None


def source_state(
    fixture_path: pathlib.Path,
    composition_path: pathlib.Path,
    code_evidence: list[dict[str, Any]],
    extra_source_paths: list[pathlib.Path] | None = None,
) -> dict[str, Any]:
    source_paths = [
        pathlib.Path(__file__).resolve(),
        REPO_ROOT / "scripts" / "quantum_execute.py",
        REPO_ROOT / "scripts" / "quantum_receipt_verify.py",
        REPO_ROOT / "scripts" / "__tests__" / "test_quantum_novelty_scout.py",
        fixture_path.resolve(),
        composition_path.resolve(),
        REPO_ROOT / "pnpm-lock.yaml",
    ]
    source_paths.extend(extra_source_paths or [])
    source_paths.extend(
        REPO_ROOT / file_record["path"]
        for candidate_record in code_evidence
        for file_record in candidate_record["files"]
    )
    source_paths = list(dict.fromkeys(path.resolve() for path in source_paths))
    relative_paths = [display_path(path) for path in source_paths if path.is_file()]
    status = _git_output(REPO_ROOT, "status", "--porcelain", "--", *relative_paths)
    files = []
    for path in source_paths:
        if path.is_file():
            git_blob_oid = _git_blob_oid(path, REPO_ROOT)
            if not git_blob_oid:
                raise RuntimeError(
                    f"cannot persist source snapshot as a Git blob: {path}"
                )
            git_blob = _git_blob_bytes(git_blob_oid, REPO_ROOT)
            if git_blob is None:
                raise RuntimeError(f"cannot retrieve source snapshot Git blob: {path}")
            files.append(
                {
                    "path": display_path(path),
                    "worktree_bytes": path.stat().st_size,
                    "worktree_sha256": file_sha256(path),
                    "git_blob_oid": git_blob_oid,
                    "git_blob_bytes": len(git_blob),
                    "git_blob_sha256": hashlib.sha256(git_blob).hexdigest(),
                }
            )
    return {
        "head_commit": _git_output(REPO_ROOT, "rev-parse", "HEAD"),
        "head_tree": _git_output(REPO_ROOT, "rev-parse", "HEAD^{tree}"),
        "scoped_dirty": bool(status),
        "scoped_status": status.splitlines() if status else [],
        "files": files,
    }


def _has_forbidden_ranking_token(value: str, forbidden: set[str]) -> bool:
    normalized = value.strip().lower().replace("-", "_")
    return any(token in normalized for token in forbidden)


def _paradox_probe_contract(fixture: dict[str, Any]) -> dict[str, Any]:
    policy = fixture["paradox_probe_policy"]
    probes = [candidate["paradox_probe"] for candidate in fixture["candidates"]]
    return {
        "mode": "paradox_probe_selection",
        "fixture_schema": PARADOX_PROBE_FIXTURE_SCHEMA,
        "card_ids": sorted({probe["card_id"] for probe in probes}),
        "probe_ids": [probe["probe_id"] for probe in probes],
        "code_state_variable_ids": [
            probe["code_state"]["variable_id"] for probe in probes
        ],
        "ranking_field_allowlist": policy["ranking_field_allowlist"],
        "optimizer_input_fields": PARADOX_OPTIMIZER_INPUT_FIELDS,
        "adjudication_corpus": policy["adjudication_corpus"],
        "adjudication_corpus_sha256": policy["adjudication_corpus_sha256"],
        "adjudication_labels_used_by_optimizer": False,
        "claim_boundary": policy["claim_boundary"],
    }


def _validate_paradox_probe_fixture(fixture: dict[str, Any]) -> None:
    policy = fixture.get("paradox_probe_policy")
    if not isinstance(policy, dict):
        raise ValueError("paradox_probe_policy must be an object")
    weights = fixture["score_weights"]
    allowlist = policy.get("ranking_field_allowlist")
    if not isinstance(allowlist, list) or not allowlist:
        raise ValueError("paradox ranking_field_allowlist must be non-empty")
    if allowlist != list(weights):
        raise ValueError("paradox ranking allowlist must exactly match score_weights")
    forbidden = policy.get("forbidden_ranking_tokens")
    if not isinstance(forbidden, list) or any(
        not isinstance(item, str) or not item for item in forbidden
    ):
        raise ValueError("paradox forbidden_ranking_tokens must be a string list")
    forbidden_tokens = {item.strip().lower().replace("-", "_") for item in forbidden}
    if not PARADOX_FORBIDDEN_RANKING_TOKENS <= forbidden_tokens:
        raise ValueError("paradox forbidden ranking token policy is incomplete")
    for field in weights:
        if _has_forbidden_ranking_token(field, forbidden_tokens):
            raise ValueError(f"forbidden ranking token in score field: {field}")

    allowed_stages = policy.get("allowed_stages")
    if not isinstance(allowed_stages, list) or not set(allowed_stages) <= PARADOX_ALLOWED_STAGES:
        raise ValueError("paradox allowed_stages contains an unsupported stage")
    if policy.get("require_blinded_outcome") is not True:
        raise ValueError("paradox probes must require blinded outcomes")
    if policy.get("require_code_state_binding") is not True:
        raise ValueError("paradox probes must require code-state binding")
    if any(
        abs(float(value)) > 1e-12
        for value in fixture.get("kill_status_adjustments", {}).values()
    ):
        raise ValueError("paradox probe kill-status adjustments must be zero")

    corpus_raw = policy.get("adjudication_corpus")
    corpus_hash = policy.get("adjudication_corpus_sha256")
    if not isinstance(corpus_raw, str) or not corpus_raw:
        raise ValueError("paradox adjudication corpus path is required")
    corpus_path = _resolve_evidence_path(corpus_raw, REPO_ROOT)
    if not corpus_path.is_file():
        raise ValueError("paradox adjudication corpus is unavailable")
    if not isinstance(corpus_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", corpus_hash):
        raise ValueError("paradox adjudication corpus hash must be SHA-256")
    if file_sha256(corpus_path) != corpus_hash:
        raise ValueError("paradox adjudication corpus hash mismatch")
    if not isinstance(policy.get("claim_boundary"), str) or not policy["claim_boundary"]:
        raise ValueError("paradox claim boundary is required")

    probe_ids: set[str] = set()
    variable_ids: set[str] = set()
    for candidate in fixture["candidates"]:
        candidate_id = candidate["id"]
        if set(candidate["scores"]) != set(weights):
            raise ValueError(f"{candidate_id} scores must exactly match the allowlist")
        tags = candidate.get("tags")
        if not isinstance(tags, list) or any(not isinstance(tag, str) for tag in tags):
            raise ValueError(f"{candidate_id} optimizer tags must be a string list")
        for tag in tags:
            if _has_forbidden_ranking_token(tag, forbidden_tokens):
                raise ValueError(f"{candidate_id} optimizer tag contains a forbidden ranking token")
        status = candidate.get("kill_test", {}).get("status")
        if status not in fixture.get("kill_status_adjustments", {}):
            raise ValueError(f"{candidate_id} kill-test status has no zero adjustment")

        probe = candidate.get("paradox_probe")
        if not isinstance(probe, dict):
            raise ValueError(f"{candidate_id} has no paradox_probe object")
        if not re.fullmatch(r"PP-[0-9]{3}", str(probe.get("card_id", ""))):
            raise ValueError(f"{candidate_id} paradox card_id is invalid")
        probe_id = probe.get("probe_id")
        if not isinstance(probe_id, str) or not probe_id or probe_id in probe_ids:
            raise ValueError("paradox probe IDs must be non-empty and unique")
        probe_ids.add(probe_id)
        if probe.get("stage") not in allowed_stages:
            raise ValueError(f"{candidate_id} paradox stage is not allowed")
        for key in ("falsifier", "stopping_rule"):
            if not isinstance(probe.get(key), str) or not probe[key].strip():
                raise ValueError(f"{candidate_id} paradox {key} is required")
        if probe.get("blinded_outcome") is not True:
            raise ValueError(f"{candidate_id} paradox outcome must remain blinded")

        code_state = probe.get("code_state")
        if not isinstance(code_state, dict) or code_state.get("complete") is not True:
            raise ValueError(f"{candidate_id} requires a complete code-state binding")
        variable_id = code_state.get("variable_id")
        if (
            not isinstance(variable_id, str)
            or not variable_id
            or variable_id in variable_ids
        ):
            raise ValueError("code-state variable IDs must be non-empty and unique")
        variable_ids.add(variable_id)
        if code_state.get("binding_basis") != "pinned_git_blob_sha256":
            raise ValueError(f"{candidate_id} code-state binding basis is unsupported")
        states = code_state.get("states")
        if not isinstance(states, list) or not states:
            raise ValueError(f"{candidate_id} code-state binding has no states")
        state_paths: list[str] = []
        state_ids: set[str] = set()
        for state in states:
            if not isinstance(state, dict):
                raise ValueError(f"{candidate_id} code-state entry must be an object")
            state_id = state.get("id")
            if not isinstance(state_id, str) or not state_id or state_id in state_ids:
                raise ValueError(f"{candidate_id} code-state IDs must be unique")
            state_ids.add(state_id)
            if not isinstance(state.get("source_ref"), str) or not state["source_ref"]:
                raise ValueError(f"{candidate_id} code-state source_ref is required")
            paths = state.get("paths")
            if not isinstance(paths, list) or not paths or any(
                not isinstance(item, str) or not item for item in paths
            ):
                raise ValueError(f"{candidate_id} code-state paths are required")
            state_paths.extend(paths)
        implementation_paths = candidate["code_evidence"].get("implementation", [])
        if sorted(set(state_paths)) != sorted(set(implementation_paths)):
            raise ValueError(
                f"{candidate_id} code-state paths must equal implementation evidence"
            )


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
    code_policy = fixture.get("code_evidence_policy")
    if not isinstance(code_policy, dict):
        raise ValueError("code_evidence_policy must be an object")
    category_weights = code_policy.get("category_weights")
    if not isinstance(category_weights, dict) or not category_weights:
        raise ValueError("code_evidence_policy.category_weights must be non-empty")
    if abs(sum(float(value) for value in category_weights.values()) - 1.0) > 1e-9:
        raise ValueError("code evidence category weights must sum to 1")
    required_categories = code_policy.get("required_categories")
    if not isinstance(required_categories, list) or any(
        category not in category_weights for category in required_categories
    ):
        raise ValueError("required code evidence categories must have weights")
    for key in (
        "declared_path_availability_weight",
        "missing_required_path_penalty",
        "similarity_penalty",
    ):
        float(code_policy[key])
    if int(code_policy.get("max_file_bytes", 0)) <= 0:
        raise ValueError("code evidence max_file_bytes must be positive")
    allowed_extensions = code_policy.get("allowed_extensions")
    if not isinstance(allowed_extensions, list) or any(
        not isinstance(item, str) or not item.startswith(".")
        for item in allowed_extensions
    ):
        raise ValueError("code evidence allowed_extensions must be a suffix list")
    if fixture.get("schema") == PARADOX_PROBE_FIXTURE_SCHEMA:
        _validate_paradox_probe_fixture(fixture)
    for candidate in candidates:
        scores = candidate.get("scores")
        if not isinstance(scores, dict):
            raise ValueError(f"{candidate['id']} has no score object")
        for key in weights:
            value = float(scores.get(key, -1))
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{candidate['id']} score {key} must be in [0, 1]")
        evidence = candidate.get("code_evidence")
        if not isinstance(evidence, dict):
            raise ValueError(f"{candidate['id']} has no code_evidence object")
        for category in category_weights:
            paths = evidence.get(category, [])
            if not isinstance(paths, list) or any(
                not isinstance(item, str) or not item for item in paths
            ):
                raise ValueError(
                    f"{candidate['id']} code evidence {category} must be a path list"
                )
    return fixture


def _resolve_evidence_path(raw_path: str, repo_root: pathlib.Path) -> pathlib.Path:
    relative = pathlib.Path(raw_path)
    if relative.is_absolute():
        raise ValueError(f"code evidence path must be repository-relative: {raw_path}")
    root = repo_root.resolve()
    resolved = (root / relative).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ValueError(
            f"code evidence path escapes repository: {raw_path}"
        ) from error
    return resolved


def evaluate_code_evidence(
    fixture: dict[str, Any],
    repo_root: pathlib.Path = REPO_ROOT,
) -> tuple[list[dict[str, Any]], list[set[str]]]:
    """Turn declared repository paths into fixed, hash-bound observed features.

    These observations are inputs to the QUBO, never free decision variables:
    an optimizer cannot assert that missing code exists. Exact implementation
    file-hash sets discourage a portfolio backed by the same declared files.
    """

    policy = fixture["code_evidence_policy"]
    category_weights = {
        key: float(value) for key, value in policy["category_weights"].items()
    }
    required_categories = set(policy.get("required_categories", []))
    allowed_extensions = set(policy["allowed_extensions"])
    max_file_bytes = int(policy["max_file_bytes"])
    records: list[dict[str, Any]] = []
    implementation_hash_sets: list[set[str]] = []
    root = repo_root.resolve()

    for candidate in fixture["candidates"]:
        files: list[dict[str, Any]] = []
        categories: dict[str, Any] = {}
        candidate_implementation_hashes: set[str] = set()
        for category, category_weight in category_weights.items():
            declared = candidate["code_evidence"].get(category, [])
            available_count = 0
            for raw_path in declared:
                path = _resolve_evidence_path(raw_path, root)
                exists = path.is_file()
                suffix_allowed = path.suffix.lower() in allowed_extensions
                size = path.stat().st_size if exists else None
                item: dict[str, Any] = {
                    "category": category,
                    "path": str(path.relative_to(root)).replace("\\", "/"),
                    "exists": exists,
                }
                if not exists:
                    item.update(
                        {
                            "admitted": False,
                            "rejection_reason": "missing_regular_file",
                        }
                    )
                elif not suffix_allowed:
                    item.update(
                        {
                            "admitted": False,
                            "rejection_reason": "unsupported_extension",
                        }
                    )
                else:
                    worktree_sha256 = file_sha256(path)
                    git_blob_oid = _git_blob_oid(path, root)
                    if not git_blob_oid:
                        raise RuntimeError(
                            f"cannot persist code evidence as a Git blob: {raw_path}"
                        )
                    git_blob = _git_blob_bytes(git_blob_oid, root)
                    if git_blob is None:
                        raise RuntimeError(
                            f"cannot retrieve persisted code evidence blob: {raw_path}"
                        )
                    git_blob_sha256 = hashlib.sha256(git_blob).hexdigest()
                    available = len(git_blob) <= max_file_bytes
                    item.update(
                        {
                            "admitted": available,
                            "worktree_bytes": size,
                            "worktree_sha256": worktree_sha256,
                            "git_blob_oid": git_blob_oid,
                            "git_blob_bytes": len(git_blob),
                            "git_blob_sha256": git_blob_sha256,
                        }
                    )
                    if available:
                        available_count += 1
                        if category == "implementation":
                            candidate_implementation_hashes.add(git_blob_sha256)
                    else:
                        item["rejection_reason"] = "file_exceeds_max_bytes"
                files.append(item)
            declared_count = len(declared)
            availability = available_count / declared_count if declared_count else 0.0
            categories[category] = {
                "weight": category_weight,
                "declared_count": declared_count,
                "available_count": available_count,
                "availability_fraction": availability,
            }

        declared_path_availability = sum(
            category_weights[category] * categories[category]["availability_fraction"]
            for category in category_weights
        )
        missing_required = [
            category
            for category in sorted(required_categories)
            if categories[category]["declared_count"] == 0
            or categories[category]["availability_fraction"] < 1.0
        ]
        records.append(
            {
                "candidate_id": candidate["id"],
                "declared_path_availability": declared_path_availability,
                "required_paths_available": not missing_required,
                "missing_required_path_categories": missing_required,
                "categories": categories,
                "files": files,
                "implementation_file_hash_count": len(candidate_implementation_hashes),
                "implementation_set_fingerprint": canonical_hash(
                    sorted(candidate_implementation_hashes)
                ),
            }
        )
        implementation_hash_sets.append(candidate_implementation_hashes)
    return records, implementation_hash_sets


def candidate_reward(
    candidate: dict[str, Any],
    weights: dict[str, float],
    status_adjustments: dict[str, float],
    code_evidence: dict[str, Any],
    code_policy: dict[str, Any],
) -> tuple[float, float, float]:
    weighted_score = sum(
        float(weights[key]) * float(candidate["scores"][key]) for key in weights
    )
    status = str(
        candidate.get("kill_test", {}).get("status", "pending_fresh_source_check")
    )
    prior_reward = weighted_score + float(status_adjustments.get(status, 0.0))
    code_adjustment = float(code_policy["declared_path_availability_weight"]) * float(
        code_evidence["declared_path_availability"]
    )
    if not code_evidence["required_paths_available"]:
        code_adjustment += float(code_policy["missing_required_path_penalty"])
    return prior_reward + code_adjustment, prior_reward, code_adjustment


def tag_similarity(left: dict[str, Any], right: dict[str, Any]) -> float:
    left_tags = set(left.get("tags", []))
    right_tags = set(right.get("tags", []))
    union = left_tags | right_tags
    return len(left_tags & right_tags) / len(union) if union else 0.0


def build_qubo(
    fixture: dict[str, Any],
    repo_root: pathlib.Path = REPO_ROOT,
) -> dict[str, Any]:
    candidates = fixture["candidates"]
    weights = {key: float(value) for key, value in fixture["score_weights"].items()}
    target = int(fixture["target_cardinality"])
    cardinality_penalty = float(fixture["cardinality_penalty"])
    redundancy_penalty = float(fixture["redundancy_penalty"])
    status_adjustments = {
        key: float(value)
        for key, value in fixture.get("kill_status_adjustments", {}).items()
    }
    code_policy = fixture["code_evidence_policy"]
    code_evidence, implementation_hash_sets = evaluate_code_evidence(fixture, repo_root)
    reward_parts = [
        candidate_reward(
            candidate,
            weights,
            status_adjustments,
            code_evidence[index],
            code_policy,
        )
        for index, candidate in enumerate(candidates)
    ]
    rewards = [item[0] for item in reward_parts]
    prior_rewards = [item[1] for item in reward_parts]
    code_adjustments = [item[2] for item in reward_parts]
    size = len(candidates)
    matrix = [[0.0 for _ in range(size)] for _ in range(size)]
    similarities = [[0.0 for _ in range(size)] for _ in range(size)]
    code_similarities = [[0.0 for _ in range(size)] for _ in range(size)]
    code_similarity_penalty = float(code_policy["similarity_penalty"])

    for i in range(size):
        matrix[i][i] = round(-rewards[i] + cardinality_penalty * (1 - 2 * target), 10)
        for j in range(i + 1, size):
            similarity = tag_similarity(candidates[i], candidates[j])
            hash_union = implementation_hash_sets[i] | implementation_hash_sets[j]
            code_similarity = (
                len(implementation_hash_sets[i] & implementation_hash_sets[j])
                / len(hash_union)
                if hash_union
                else 0.0
            )
            similarities[i][j] = similarity
            code_similarities[i][j] = code_similarity
            matrix[i][j] = round(
                2 * cardinality_penalty
                + redundancy_penalty * similarity
                + code_similarity_penalty * code_similarity,
                10,
            )

    qubo = {
        "matrix": matrix,
        "constant_offset": cardinality_penalty * target * target,
        "candidate_rewards": rewards,
        "prior_candidate_rewards": prior_rewards,
        "code_evidence_adjustments": code_adjustments,
        "code_evidence": code_evidence,
        "tag_similarities": similarities,
        "code_similarities": code_similarities,
        "target_cardinality": target,
        "cardinality_penalty": cardinality_penalty,
        "redundancy_penalty": redundancy_penalty,
        "code_similarity_penalty": code_similarity_penalty,
        "code_evidence_policy": code_policy,
        "kill_status_adjustments": status_adjustments,
        "convention": "upper triangular: sum_i Qii*x_i + sum_{i<j} Qij*x_i*x_j",
    }
    if fixture.get("schema") == PARADOX_PROBE_FIXTURE_SCHEMA:
        qubo["paradox_probe_contract"] = _paradox_probe_contract(fixture)
    return qubo


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
    tag_redundancy = sum(
        qubo["redundancy_penalty"] * qubo["tag_similarities"][i][j]
        for offset, i in enumerate(selected_indices)
        for j in selected_indices[offset + 1 :]
    )
    code_redundancy = sum(
        qubo["code_similarity_penalty"] * qubo["code_similarities"][i][j]
        for offset, i in enumerate(selected_indices)
        for j in selected_indices[offset + 1 :]
    )
    redundancy = tag_redundancy + code_redundancy
    constraint_penalty = (
        qubo["cardinality_penalty"]
        * (len(selected_indices) - qubo["target_cardinality"]) ** 2
    )
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
        "tag_redundancy_penalty": tag_redundancy,
        "code_redundancy_penalty": code_redundancy,
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
    if result["selected_count"] != qubo["target_cardinality"]:
        raise ValueError(
            "cardinality_penalty is insufficient: global QUBO optimum violates target"
        )
    result["runtime_seconds"] = time.perf_counter() - started
    result["evaluations"] = 1 << size
    return result


def greedy_marginal_reward(
    index: int,
    selected: list[int],
    qubo: dict[str, Any],
) -> float:
    redundancy = sum(
        qubo["redundancy_penalty"]
        * qubo["tag_similarities"][min(index, prior)][max(index, prior)]
        + qubo["code_similarity_penalty"]
        * qubo["code_similarities"][min(index, prior)][max(index, prior)]
        for prior in selected
    )
    return float(qubo["candidate_rewards"][index]) - redundancy


def greedy_baseline(fixture: dict[str, Any], qubo: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    selected: list[int] = []
    available = set(range(len(fixture["candidates"])))
    for _ in range(qubo["target_cardinality"]):
        choice = max(
            available,
            key=lambda index: (
                greedy_marginal_reward(index, selected, qubo),
                -index,
            ),
        )
        selected.append(choice)
        available.remove(choice)
    bits = "".join(
        "1" if index in selected else "0"
        for index in range(len(available) + len(selected))
    )
    result = portfolio_metrics(bits, fixture, qubo)
    result["runtime_seconds"] = time.perf_counter() - started
    result["evaluations"] = sum(
        len(fixture["candidates"]) - i for i in range(qubo["target_cardinality"])
    )
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
    result["budget_basis"] = RANDOM_BUDGET_BASIS
    return result


def render_composition(
    qubo: dict[str, Any],
    input_sha256: str,
    candidate_ids: list[str],
) -> str:
    matrix_json = json.dumps(qubo["matrix"], separators=(",", ":"))
    matrix_literal = json.dumps(matrix_json)
    code_evidence_sha256 = canonical_hash(qubo["code_evidence"])
    return (
        "// Generated by scripts/quantum_novelty_scout.py\n"
        f"// Candidate fixture sha256: {input_sha256}\n"
        f"// Code evidence sha256: {code_evidence_sha256}\n"
        f"// Variable order: {','.join(f'{index}={item}' for index, item in enumerate(candidate_ids))}\n"
        "// QUBO ranks priors plus hash-bound code evidence; it does not prove novelty.\n"
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


def verify_receipt(receipt: dict[str, Any]) -> bool:
    return receipt.get("schema") == NOVELTY_SCOUT_SCHEMA and not (
        novelty_scout_receipt_errors(receipt)
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
    composition = render_composition(
        qubo,
        input_sha256,
        [candidate["id"] for candidate in fixture["candidates"]],
    )
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

    effective_shots = int(qaoa_result["shots"])
    effective_grid_points = max(2, min(int(grid_points), 16))
    qaoa = portfolio_metrics(qaoa_result["optimal_bitstring"], fixture, qubo)
    qaoa.update(
        {
            "runtime_seconds": qaoa_result["wall_time_seconds"],
            "shots_per_evaluation": effective_shots,
            "optimizer_evaluations": qaoa_result["optimizer_evaluations"],
            "measurement_budget": effective_shots
            * qaoa_result["optimizer_evaluations"],
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

    candidates_by_id = {
        candidate["id"]: candidate for candidate in fixture["candidates"]
    }
    selected_candidates = [candidates_by_id[item] for item in exact["selected_ids"]]
    code_evidence_by_id = {item["candidate_id"]: item for item in qubo["code_evidence"]}
    selected_code_evidence = [
        code_evidence_by_id[item] for item in exact["selected_ids"]
    ]
    selected_code_evidence_paths_available = all(
        item["required_paths_available"] for item in selected_code_evidence
    )
    all_candidate_code_evidence_paths_available = all(
        item["required_paths_available"] for item in qubo["code_evidence"]
    )
    source_grounding_complete = all(
        candidate["kill_test"].get("status") in TERMINAL_KILL_STATUSES
        and bool(candidate["kill_test"].get("sources"))
        for candidate in selected_candidates
    )
    selected_claims_not_killed = all(
        candidate["kill_test"].get("status") != "killed"
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
        "qaoa_target_cardinality_met": qaoa["selected_count"]
        == qubo["target_cardinality"],
        "selected_kill_tests_complete": source_grounding_complete,
        "selected_claims_not_killed": selected_claims_not_killed,
        "selected_code_evidence_paths_available": selected_code_evidence_paths_available,
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

    extra_source_paths: list[pathlib.Path] = []
    if fixture.get("schema") == PARADOX_PROBE_FIXTURE_SCHEMA:
        extra_source_paths.append(
            _resolve_evidence_path(
                fixture["paradox_probe_policy"]["adjudication_corpus"], REPO_ROOT
            )
        )
    snapshot = source_state(
        fixture_path,
        composition_path,
        qubo["code_evidence"],
        extra_source_paths,
    )
    snapshot_by_path = {item["path"]: item for item in snapshot["files"]}
    code_hashes = {
        "scout_sha256": snapshot_by_path[
            display_path(pathlib.Path(__file__).resolve())
        ]["git_blob_sha256"],
        "executor_sha256": snapshot_by_path["scripts/quantum_execute.py"][
            "git_blob_sha256"
        ],
        "verifier_sha256": snapshot_by_path["scripts/quantum_receipt_verify.py"][
            "git_blob_sha256"
        ],
        "composition_sha256": snapshot_by_path[display_path(composition_path)][
            "git_blob_sha256"
        ],
    }
    result_summary = {
        "qaoa": {
            "bitstring": qaoa["bitstring"],
            "objective": qaoa["raw_qubo_objective"],
        },
        "exact": {
            "bitstring": exact["bitstring"],
            "objective": exact["raw_qubo_objective"],
        },
        "greedy": {
            "bitstring": greedy["bitstring"],
            "objective": greedy["raw_qubo_objective"],
        },
        "budget_random": {
            "bitstring": random_result["bitstring"],
            "objective": random_result["raw_qubo_objective"],
        },
    }
    hash_payload = {
        "input_sha256": input_sha256,
        "qubo_sha256": canonical_hash(qubo["matrix"]),
        "execution_payload_hash": qaoa_result["receipt"]["payload_hash"],
        "code_hashes": code_hashes,
        "code_evidence_sha256": canonical_hash(qubo["code_evidence"]),
        "results": result_summary,
        "hardware_gate_decision": hardware_gate["decision"],
    }
    is_paradox_probe = fixture.get("schema") == PARADOX_PROBE_FIXTURE_SCHEMA
    claim_boundary = (
        fixture["paradox_probe_policy"]["claim_boundary"]
        + " QAOA, exact, greedy, and random results compare portfolio-selection "
        "objectives only; they do not establish quantum advantage."
        if is_paradox_probe
        else "QAOA prioritizes a diverse candidate portfolio from declared ordinal priors plus declared-path availability and exact shared implementation-file identity. File presence and hashes do not prove claim alignment, semantic correctness, test execution, novelty, quantum advantage, or publication readiness."
    )
    receipt = {
        "schema": NOVELTY_SCOUT_SCHEMA,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": claim_boundary,
        "fixture": display_path(fixture_path),
        "input_sha256": input_sha256,
        "candidate_count": len(fixture["candidates"]),
        "target_cardinality": fixture["target_cardinality"],
        "score_basis": fixture["score_basis"],
        "score_weights": fixture["score_weights"],
        "code_evidence_policy": fixture["code_evidence_policy"],
        "qubo": qubo,
        "composition": display_path(composition_path),
        "composition_role": "Generated declarative mirror of the matrix. The measured run invokes the Python QAOA executor directly; this file is not claimed as validated or as the execution source.",
        "run_configuration": {
            "seed": seed,
            "shots": effective_shots,
            "grid_points": effective_grid_points,
            "p": 1,
            "execution_mode": "aer",
        },
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
        "selected_code_evidence": selected_code_evidence,
        "source_grounding_complete": source_grounding_complete,
        "selected_claims_not_killed": selected_claims_not_killed,
        "selected_code_evidence_paths_available": selected_code_evidence_paths_available,
        "all_candidate_code_evidence_paths_available": all_candidate_code_evidence_paths_available,
        "hardware_gate": hardware_gate,
        "environment": {
            "python": platform.python_version(),
            "qiskit": importlib.metadata.version("qiskit"),
            "platform": platform.platform(),
        },
        "code_hash_basis": "SHA-256 of pinned Git blob bytes",
        "code_hashes": code_hashes,
        "source_state": snapshot,
        "hash_scheme": "sha256-canonical-json-v2",
        "hash_scope": FULL_RECEIPT_HASH_SCOPE,
        "hash_payload": hash_payload,
    }
    if is_paradox_probe:
        receipt["paradox_probe_policy"] = fixture["paradox_probe_policy"]
        receipt["paradox_probe_contract"] = qubo["paradox_probe_contract"]
    receipt["payload_hash"] = canonical_hash(receipt)
    if not verify_receipt(receipt):
        raise AssertionError("generated receipt failed its own canonical hash check")
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=pathlib.Path, default=DEFAULT_INPUT)
    parser.add_argument(
        "--composition-out", type=pathlib.Path, default=DEFAULT_COMPOSITION
    )
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
