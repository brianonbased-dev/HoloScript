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
import re
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


def _expected_paradox_probe_contract(
    fixture: dict,
    code_state_bindings: list[dict],
) -> dict:
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
        "code_state_fingerprints": [
            binding["state_fingerprint"] for binding in code_state_bindings
        ],
        "ranking_field_allowlist": policy["ranking_field_allowlist"],
        "candidate_optimizer_input_fields": PARADOX_CANDIDATE_OPTIMIZER_INPUT_FIELDS,
        "qubo_configuration_input_fields": PARADOX_QUBO_CONFIGURATION_INPUT_FIELDS,
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
    if receipt.get("input_sha256") != expected_generic_hash(fixture):
        errors.append("input hash does not match the pinned candidate fixture")

    is_paradox_probe = fixture.get("schema") == PARADOX_PROBE_FIXTURE_SCHEMA
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
            fixture, code_state_bindings
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
        "code_state_path_churn_adjustments": code_state_path_churn_adjustments,
        "tag_similarities": tag_similarities,
        "code_similarities": code_similarities,
        "target_cardinality": target,
        "cardinality_penalty": cardinality_penalty,
        "redundancy_penalty": redundancy_penalty,
        "code_similarity_penalty": code_similarity_penalty,
        "code_similarity_basis": code_similarity_basis,
        "code_evidence_policy": policy,
        "kill_status_adjustments": status_adjustments,
    }
    if is_paradox_probe:
        expected_qubo_fields["code_state_bindings"] = code_state_bindings
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
