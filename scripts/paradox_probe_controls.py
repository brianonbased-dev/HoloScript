#!/usr/bin/env python3
"""Execute adjudicated false-paradox controls without feeding labels to QUBO.

These probes exercise the normalization gate used before a tension can enter the
Paradox-to-Proof program.  Their adjudications are evaluation-only labels: the
quantum portfolio fixture may bind this corpus by hash, but it must not consume
the labels or observations as optimizer inputs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import platform
import unicodedata
from decimal import Decimal
from typing import Any, Callable

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_CORPUS = (
    REPO_ROOT
    / "research"
    / "quantum-novelty-scout"
    / "paradox-probe-controls-v1.json"
)
DEFAULT_RECEIPT = (
    REPO_ROOT
    / "research"
    / "quantum-novelty-scout"
    / "paradox-probe-control-receipt-v1.json"
)
CORPUS_SCHEMA = "holoscript.paradox-control-corpus.v1"
RECEIPT_SCHEMA = "holoscript.paradox-control-receipt.v1"


def canonical_hash(payload: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()


def _binary_float_sum() -> dict[str, Any]:
    value = 0.1 + 0.2
    return {"decimal_repr": repr(value), "equals_decimal_0_3": value == 0.3}


def _nan_self_inequality() -> dict[str, Any]:
    value = float("nan")
    return {"is_nan": math.isnan(value), "equals_self": value == value}


def _signed_zero() -> dict[str, Any]:
    positive = 0.0
    negative = -0.0
    return {
        "numeric_equal": positive == negative,
        "positive_sign": int(math.copysign(1.0, positive)),
        "negative_sign": int(math.copysign(1.0, negative)),
    }


def _nonassociative_float_addition() -> dict[str, Any]:
    left = (1e16 + -1e16) + 1.0
    right = 1e16 + (-1e16 + 1.0)
    return {"left": left, "right": right, "different": left != right}


def _unicode_normalization() -> dict[str, Any]:
    composed = "é"
    decomposed = "e\u0301"
    return {
        "raw_equal": composed == decomposed,
        "nfc_equal": unicodedata.normalize("NFC", composed)
        == unicodedata.normalize("NFC", decomposed),
    }


def _nonempty_string_truthiness() -> dict[str, Any]:
    return {"input": "False", "bool_value": bool("False")}


def _negative_floor_division() -> dict[str, Any]:
    return {"value": -3 // 2, "floor_identity": -3 == (-3 // 2) * 2 + (-3 % 2)}


def _negative_modulo() -> dict[str, Any]:
    return {"value": -3 % 2, "divisor_sign_rule": (-3 % 2) >= 0}


def _json_tuple_roundtrip() -> dict[str, Any]:
    decoded = json.loads(json.dumps((1, 2)))
    return {"value": decoded, "type": type(decoded).__name__}


def _mutable_aliasing() -> dict[str, Any]:
    left: list[int] = []
    right = left
    left.append(1)
    return {"same_object": left is right, "right_value": right}


def _decimal_exact_sum() -> dict[str, Any]:
    value = Decimal("0.1") + Decimal("0.2")
    return {"decimal_repr": str(value), "equals_decimal_0_3": value == Decimal("0.3")}


def _chained_comparison() -> dict[str, Any]:
    value = 1 < 2 < 3
    expanded = (1 < 2) and (2 < 3)
    return {"value": value, "expanded_equal": value == expanded}


PROBES: dict[str, Callable[[], dict[str, Any]]] = {
    "binary_float_sum": _binary_float_sum,
    "nan_self_inequality": _nan_self_inequality,
    "signed_zero": _signed_zero,
    "nonassociative_float_addition": _nonassociative_float_addition,
    "unicode_normalization": _unicode_normalization,
    "nonempty_string_truthiness": _nonempty_string_truthiness,
    "negative_floor_division": _negative_floor_division,
    "negative_modulo": _negative_modulo,
    "json_tuple_roundtrip": _json_tuple_roundtrip,
    "mutable_aliasing": _mutable_aliasing,
    "decimal_exact_sum": _decimal_exact_sum,
    "chained_comparison": _chained_comparison,
}


def verify_control_corpus(path: pathlib.Path = DEFAULT_CORPUS) -> dict[str, Any]:
    corpus = json.loads(path.read_text(encoding="utf-8"))
    if corpus.get("schema") != CORPUS_SCHEMA:
        raise ValueError("false-paradox corpus schema mismatch")
    if corpus.get("optimizer_dataflow") != "excluded":
        raise ValueError("false-paradox labels must be excluded from ranking dataflow")
    if corpus.get("validation_access") != "schema-label-policy-and-replay":
        raise ValueError("false-paradox validation access must be declared")
    if corpus.get("labels_evaluation_only") is not True:
        raise ValueError("false-paradox labels must be evaluation-only")
    protocol = corpus.get("adjudication_protocol")
    if (
        not isinstance(protocol, dict)
        or protocol.get("author_blinding_claimed") is not False
        or protocol.get("independent_adjudication_claimed") is not False
        or not protocol.get("rule")
    ):
        raise ValueError("false-paradox adjudication provenance is incomplete")
    records = corpus.get("records")
    if not isinstance(records, list) or len(records) != 12:
        raise ValueError("false-paradox pilot corpus requires exactly 12 controls")
    ids = [record.get("id") for record in records]
    if len(ids) != len(set(ids)) or any(not item for item in ids):
        raise ValueError("false-paradox control IDs must be non-empty and unique")

    results = []
    for record in records:
        probe_name = record.get("probe")
        probe = PROBES.get(probe_name)
        if probe is None:
            raise ValueError(f"unknown false-paradox probe: {probe_name}")
        authority = record.get("authority")
        if (
            not isinstance(authority, dict)
            or not str(authority.get("url", "")).startswith("https://")
            or not record.get("normalization")
        ):
            raise ValueError(f"{record['id']} has no normalization authority")
        observed = probe()
        expected = record.get("expected_observation")
        replay_passed = observed == expected
        derived_adjudication = "DISSOLVED" if replay_passed else "UNRESOLVED"
        passed = replay_passed and record.get("adjudication") == derived_adjudication
        results.append(
            {
                "id": record["id"],
                "probe": probe_name,
                "observed": observed,
                "expected": expected,
                "passed": passed,
                "declared_adjudication": record.get("adjudication"),
                "adjudication": derived_adjudication,
                "normalization": record["normalization"],
                "authority": authority,
            }
        )

    passed_count = sum(bool(item["passed"]) for item in results)
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "corpus": str(path.resolve().relative_to(REPO_ROOT)).replace("\\", "/"),
        "corpus_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "record_count": len(records),
        "passed_count": passed_count,
        "failed_count": len(records) - passed_count,
        "all_labels_evaluation_only": corpus["labels_evaluation_only"],
        "adjudication_protocol": protocol,
        "executor": {
            "path": "scripts/paradox_probe_controls.py",
            "sha256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        },
        "claim_boundary": (
            "Passing proves only that twelve author-adjudicated negative controls "
            "replay their declared observations under cited normalization authorities. "
            "The authors were not blinded and no independent adjudication is claimed. "
            "It does not validate productive paradox discovery, novelty, or quantum advantage."
        ),
        "environment": {"python": platform.python_version()},
        "results": results,
    }
    receipt["payload_hash"] = canonical_hash(receipt)
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=pathlib.Path, default=DEFAULT_CORPUS)
    parser.add_argument("--out", type=pathlib.Path, default=DEFAULT_RECEIPT)
    args = parser.parse_args()
    receipt = verify_control_corpus(args.corpus.resolve())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({
        "receipt": str(args.out.resolve()),
        "passed": receipt["passed_count"],
        "failed": receipt["failed_count"],
        "payload_hash": receipt["payload_hash"],
    }, indent=2))
    return 0 if receipt["failed_count"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
