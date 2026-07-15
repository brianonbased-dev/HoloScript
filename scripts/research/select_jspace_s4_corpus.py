"""Seal the preregistered, label-blind J-space S4 pilot and confirmation.

The selector performs no prompt generation, ranking, semantic inspection, or
model observation. It reopens the immutable S2/S3 provenance chain, proves
that every selected row is a still-unobserved S3-confirmation member, applies
the frozen coordinate table, and emits byte-stable artifacts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


SCHEMA = "holoscript.jspace-s4-selection-manifest.v0.1.0"
S2_MANIFEST_SCHEMA = "holoscript.jspace-s2-corpus-manifest.v0.1.0"
S2_LEAKAGE_SCHEMA = "holoscript.jspace-s2-leakage-report.v0.1.0"
S2_REFERENCE_SCHEMA = "holoscript.jspace-s2-reference-manifest.v0.1.0"
S3_MANIFEST_SCHEMA = "holoscript.jspace-s3-selection-manifest.v0.1.0"
S3_EVIDENCE_SCHEMA = "holoscript.jspace-s3-pilot-evidence-manifest.v0.1.0"

EXPECTED_S2_MANIFEST_SHA256 = (
    "sha256:2c00dd213301a5ba57628b3226ae77f6b78216df0f8bb17ea0dddecccb2b0b64"
)
EXPECTED_S3_PREREGISTRATION_SHA256 = (
    "sha256:c850d7eda595e3eda2fdbcfbcf3e8172b876f7171594569da979e54cff822c18"
)
EXPECTED_S3_SELECTOR_SHA256 = (
    "sha256:db7989aa764bfce553b76c6e95f16e20553152192853a99a51dec93a8200966d"
)
EXPECTED_S3_MANIFEST_SHA256 = (
    "sha256:1c700238479b2b0e54839779de3ea2efe6298879227043e8495c559b502761af"
)
EXPECTED_S3_MANIFEST_SELF_HASH = (
    "sha256:f09d04f0e8a18d06dc95acee5f26ac40e9f4f0490af93477a84edbd3c01ac7f2"
)
EXPECTED_S3_EVIDENCE_SHA256 = (
    "sha256:ad5b19e0b16c4963b2ad83cad0c8b0f17d4f024b3374014c5e9b9617443737da"
)
EXPECTED_S3_EVIDENCE_SELF_HASH = (
    "sha256:43ea32042b8d3676ea6917e2217456206483d47a51afe0343512cd5cbea24cf5"
)
EXPECTED_S4_PREREGISTRATION_SHA256 = (
    "sha256:aab413a443cefbcc2dbacf5506c8fe687e4c4cde7b38fddd0d341d50ca1df930"
)
EXPECTED_CHECKPOINT_SHA256 = (
    "sha256:abbda748c6bd6dec69bd72f25ca5ab28876fbbdbf195f218439ddbd0a10ff914"
)
EXPECTED_TOKENIZER_SHA256 = (
    "sha256:f92af6207d211728a530e95e44c60b3c95f700ea9c755ab6bd8614fbdac623d4"
)
EXPECTED_S3_CONFIRMATION_COORDINATE_SHA256 = (
    "sha256:fc5c05858082a3a69aa22282f67d79f94ad4e1899c050f7fc790327111d79fff"
)
EXPECTED_PILOT_COORDINATE_SHA256 = (
    "sha256:b45a9913521be33b5889bbd326e76e87bd1e5ee28ab802f03440be3ae569ccde"
)
EXPECTED_CONFIRMATION_COORDINATE_SHA256 = (
    "sha256:1a5a1291a0f215c1a73f74683bbf34bef79b1ed953b8cb17e21192a46ce93ecc"
)

S2_REPO_DIR = "research/data/jspace-s2"
S3_REPO_DIR = "research/data/jspace-s3"
S3_MEASUREMENT_REPO_DIR = "research/measurements/jspace-s3"

FAMILIES = (
    "physical",
    "relational",
    "causal_temporal",
    "normative",
    "semantic_pragmatic",
    "planning_tension",
)
POSITION_BINS = ((0, 127), (128, 255), (256, 383), (384, 511))
ENDPOINT_SLOTS = (
    ("analysis-colon", "form_0", 0),
    ("evidence-equals", "form_0", 1),
    ("decision-list", "form_1", 0),
    ("options-object", "form_1", 1),
    ("holoscript-object-name", "form_2", 0),
    ("holoscript-line-comment", "form_2", 1),
    ("trace-call", "form_3", 0),
    ("constraint-trait", "form_3", 1),
)

S2_LANE_FILES = {
    "a": ("fit-a.jsonl", "fit-a-pilot.jsonl"),
    "b": ("fit-b.jsonl", "fit-b-pilot.jsonl"),
    "h": ("fidelity-h.jsonl", "fidelity-h-pilot.jsonl"),
}
S3_LANE_FILES = {
    "a": ("fit-a-pilot.jsonl", "fit-a-confirmation.jsonl"),
    "b": ("fit-b-pilot.jsonl", "fit-b-confirmation.jsonl"),
    "h": ("fidelity-h-pilot.jsonl", "fidelity-h-confirmation.jsonl"),
}
OUTPUT_FILES = {
    "pilot": {
        "a": "fit-a-pilot.jsonl",
        "b": "fit-b-pilot.jsonl",
        "h": "fidelity-h-pilot.jsonl",
    },
    "confirmation": {
        "a": "fit-a-confirmation.jsonl",
        "b": "fit-b-confirmation.jsonl",
        "h": "fidelity-h-confirmation.jsonl",
    },
}
EXPECTED_OUTPUT_SHA256 = {
    "pilot": {
        "a": "sha256:2da3005d4c6c53e122b48388d612334d0b27577ae8cb7e3e7d2e6c598582eeae",
        "b": "sha256:df0f238b2980bfe815d2e9f1c69296565e9de4ec0ca997e43047ae3793671d72",
        "h": "sha256:f73c5f8398f809f7ef3dc3d6271dea7409cd2048354f59cd3cb1772510d8bd2d",
    },
    "confirmation": {
        "a": "sha256:005c411edc0a53684b95a627ced5672ea67ac74683531b2dd9016e52c0d68637",
        "b": "sha256:53c67df229050e9496d836d0a399e9dbe906dc2821efa5077813f976cc0d733b",
        "h": "sha256:3bdbd1c027c5408fcd96d47825c2698b703fa92239ec01e6112138197dfd54d3",
    },
}

# Frozen table indexed by family, then position-bin. Pairs are endpoint slots.
PILOT_SLOT_TABLE = (
    ((3, 4), (0, 2), (1, 7), (5, 6)),
    ((0, 1), (2, 3), (4, 7), (5, 6)),
    ((6, 7), (0, 5), (1, 3), (2, 4)),
    ((3, 7), (1, 6), (4, 5), (0, 2)),
    ((1, 2), (3, 4), (5, 6), (0, 7)),
    ((5, 6), (4, 7), (0, 2), (1, 3)),
)
EXPECTED_CONFIRMATION_ENDPOINT_COUNTS_BY_BIN = {
    0: (1, 2, 3, 3, 1, 3, 2, 3),
    1: (2, 1, 3, 2, 2, 1, 4, 3),
    2: (4, 2, 0, 4, 3, 2, 0, 3),
    3: (2, 4, 3, 0, 3, 3, 3, 0),
}

Coordinate = tuple[int, int, int]


def _sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def _sha256_json(value: Any) -> str:
    return _sha256_bytes(
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
    )


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{line_number} must contain a JSON object")
        rows.append(value)
    return rows


def _jsonl_bytes(rows: Iterable[Mapping[str, Any]]) -> bytes:
    return "".join(
        json.dumps(
            row,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
        + "\n"
        for row in rows
    ).encode("utf-8")


def _write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _verify_self_hash(value: Mapping[str, Any], *, label: str) -> None:
    _require(value.get("selfHash") is not None, f"{label} is missing selfHash")
    candidate = dict(value)
    candidate["selfHash"] = None
    _require(value["selfHash"] == _sha256_json(candidate), f"{label} selfHash mismatch")


def _set_hash(values: Iterable[str]) -> str:
    material = sorted(values)
    _require(len(material) == len(set(material)), "set digest input contains duplicates")
    return _sha256_json(material)


def _prompt_hash(row: Mapping[str, Any]) -> str:
    prompt = row.get("prompt")
    _require(isinstance(prompt, str), f"row {row.get('caseId')} has no exact prompt")
    return _sha256_bytes(prompt.encode("utf-8"))


def _identifier_sets(rows: Sequence[Mapping[str, Any]]) -> dict[str, set[str]]:
    result = {
        "caseId": {str(row.get("caseId")) for row in rows},
        "promptHash": {_prompt_hash(row) for row in rows},
        "sequenceHash": {str(row.get("sequenceSha256")) for row in rows},
    }
    for key, values in result.items():
        _require(len(values) == len(rows), f"duplicate {key} in {len(rows)}-row artifact")
        _require("None" not in values, f"missing {key} in artifact")
    return result


def _identifier_digests(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    identifiers = _identifier_sets(rows)
    return {
        "rowCount": len(rows),
        "caseIdSetSha256": _set_hash(identifiers["caseId"]),
        "promptHashSetSha256": _set_hash(identifiers["promptHash"]),
        "sequenceHashSetSha256": _set_hash(identifiers["sequenceHash"]),
    }


def _coordinate(row: Mapping[str, Any]) -> Coordinate:
    family = row.get("vertical")
    _require(family in FAMILIES, f"unknown family {family!r}")
    bin_index = row.get("lengthStratum")
    _require(type(bin_index) is int and 0 <= bin_index < 4, "invalid position-bin index")
    _require(
        row.get("positionBin") == list(POSITION_BINS[bin_index]),
        f"row {row.get('caseId')} position-bin binding mismatch",
    )
    pair = (row.get("taskForm"), row.get("variant"))
    matches = [index for index, (_, form, variant) in enumerate(ENDPOINT_SLOTS) if pair == (form, variant)]
    _require(len(matches) == 1, f"row {row.get('caseId')} has invalid endpoint coordinate")
    slot = matches[0]
    _require(
        row.get("endpointProfile") == ENDPOINT_SLOTS[slot][0],
        f"row {row.get('caseId')} endpoint profile mismatch",
    )
    return (FAMILIES.index(family), bin_index, slot)


def _coordinate_hash(coordinates: Iterable[Coordinate]) -> str:
    material = sorted(coordinates)
    _require(len(material) == len(set(material)), "coordinate digest input contains duplicates")
    return _sha256_json([list(value) for value in material])


def _verify_binding(
    rows: Sequence[Mapping[str, Any]],
    path: Path,
    binding: Mapping[str, Any],
    *,
    label: str,
) -> None:
    _require(_sha256_file(path) == binding.get("sha256"), f"{label} byte hash mismatch")
    digests = _identifier_digests(rows)
    for key, value in digests.items():
        if key in binding:
            _require(value == binding.get(key), f"{label} {key} mismatch")
    coordinates = [_coordinate(row) for row in rows]
    if "coordinateSetSha256" in binding:
        _require(
            _coordinate_hash(coordinates) == binding.get("coordinateSetSha256"),
            f"{label} coordinate digest mismatch",
        )


def _verify_s2(s2_dir: Path) -> tuple[
    dict[str, Any],
    dict[str, Any],
    dict[str, Any],
    dict[str, list[dict[str, Any]]],
    dict[str, list[dict[str, Any]]],
]:
    manifest_path = s2_dir / "corpus-manifest.json"
    leakage_path = s2_dir / "leakage-report.json"
    reference_path = s2_dir / "reference-manifest.json"
    manifest = _read_json(manifest_path)
    leakage = _read_json(leakage_path)
    reference = _read_json(reference_path)

    _require(_sha256_file(manifest_path) == EXPECTED_S2_MANIFEST_SHA256, "unexpected S2 corpus manifest")
    _require(manifest.get("schema") == S2_MANIFEST_SCHEMA, "S2 corpus schema mismatch")
    _verify_self_hash(manifest, label="S2 corpus manifest")
    _require(manifest.get("semanticLabelsAccessed") is False, "S2 semantic-label boundary violated")
    _require(manifest.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "S2 checkpoint mismatch")
    _require(manifest.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "S2 tokenizer mismatch")

    _require(manifest.get("leakageReportSha256") == _sha256_file(leakage_path), "S2 leakage hash mismatch")
    _require(leakage.get("schema") == S2_LEAKAGE_SCHEMA, "S2 leakage schema mismatch")
    _verify_self_hash(leakage, label="S2 leakage report")
    _require(leakage.get("passed") is True and leakage.get("failedCaseIds") == [], "S2 leakage failed")
    match_counts = leakage.get("matchCounts")
    _require(
        isinstance(match_counts, dict) and match_counts and all(value == 0 for value in match_counts.values()),
        "S2 leakage match counts are not all zero",
    )
    _require(leakage.get("byteWindow") == 64, "S2 byte-window contract mismatch")
    _require(leakage.get("tokenWindow") == 32, "S2 token-window contract mismatch")

    _require(manifest.get("referenceManifestSha256") == _sha256_file(reference_path), "S2 reference hash mismatch")
    _require(reference.get("schema") == S2_REFERENCE_SCHEMA, "S2 reference schema mismatch")
    _verify_self_hash(reference, label="S2 reference manifest")
    _require(reference.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "reference checkpoint mismatch")
    _require(reference.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "reference tokenizer mismatch")

    full_by_lane: dict[str, list[dict[str, Any]]] = {}
    exposed_by_lane: dict[str, list[dict[str, Any]]] = {}
    for lane, (full_name, pilot_name) in S2_LANE_FILES.items():
        full_path = s2_dir / full_name
        pilot_path = s2_dir / pilot_name
        full = _read_jsonl(full_path)
        pilot = _read_jsonl(pilot_path)
        _verify_binding(full, full_path, manifest["splitArtifacts"][lane], label=f"S2 {lane} full")
        _verify_binding(pilot, pilot_path, manifest["pilotArtifacts"][lane], label=f"S2 {lane} pilot")
        _require(len(full) == 192 and len(pilot) == 24, f"S2 {lane} row count mismatch")
        _require(all(row.get("lane") == lane for row in full + pilot), f"S2 {lane} lane mismatch")
        full_by_case = {str(row["caseId"]): row for row in full}
        _require(len(full_by_case) == len(full), f"S2 {lane} duplicate full case ID")
        _require(all(full_by_case.get(str(row["caseId"])) == row for row in pilot), f"S2 {lane} pilot is not exact")
        full_by_lane[lane] = full
        exposed_by_lane[lane] = pilot
    return manifest, leakage, reference, full_by_lane, exposed_by_lane


def _merge_identifier_sets(
    destination: dict[str, set[str]], rows: Sequence[Mapping[str, Any]]
) -> None:
    identifiers = _identifier_sets(rows)
    for key in destination:
        destination[key].update(identifiers[key])


def _verify_s3_evidence(
    measurement_dir: Path,
    s3_manifest: Mapping[str, Any],
    s3_pilot_by_lane: Mapping[str, Sequence[Mapping[str, Any]]],
) -> dict[str, Any]:
    evidence_path = measurement_dir / "pilot-manifest.json"
    evidence = _read_json(evidence_path)
    _require(_sha256_file(evidence_path) == EXPECTED_S3_EVIDENCE_SHA256, "unexpected S3 evidence manifest")
    _require(evidence.get("schema") == S3_EVIDENCE_SCHEMA, "S3 evidence schema mismatch")
    _verify_self_hash(evidence, label="S3 evidence manifest")
    _require(evidence.get("selfHash") == EXPECTED_S3_EVIDENCE_SELF_HASH, "S3 evidence self-hash mismatch")
    _require(evidence.get("status") == "failed-frozen-gate", "S3 evidence is not frozen failed")
    _require(evidence.get("stage") == "pilot", "S3 evidence stage mismatch")
    outcome = evidence.get("outcome")
    _require(isinstance(outcome, dict) and outcome.get("passed") is False, "S3 failed outcome missing")
    _require(
        outcome.get("disposition")
        == "do-not-run-confirmation-or-open-semantic-labels; register a new estimator residue",
        "S3 disposition mismatch",
    )
    _require(evidence.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "S3 evidence checkpoint mismatch")
    _require(evidence.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "S3 evidence tokenizer mismatch")

    source_by_role = {item.get("role"): item for item in evidence.get("sources", [])}
    expected_sources = {
        "preregistration": EXPECTED_S3_PREREGISTRATION_SHA256,
        "s2-corpus-manifest": EXPECTED_S2_MANIFEST_SHA256,
        "selection-manifest": EXPECTED_S3_MANIFEST_SHA256,
        "selection-code": EXPECTED_S3_SELECTOR_SHA256,
        "holdout-prompt-artifact": s3_manifest["pilotArtifacts"]["h"]["sha256"],
    }
    for role, expected_hash in expected_sources.items():
        _require(source_by_role.get(role, {}).get("sha256") == expected_hash, f"S3 evidence {role} mismatch")

    promoted = evidence.get("promotedArtifacts")
    _require(isinstance(promoted, list), "S3 promoted-artifact bindings missing")
    promoted_by_name = {Path(str(item.get("path"))).name: item for item in promoted}
    expected_names = {
        "pilot-a-fit.json",
        "pilot-b-fit.json",
        "pilot-collection.json",
        "pilot-fidelity.json",
        "pilot-rows.jsonl",
        "pilot-receipts.jsonl",
    }
    _require(set(promoted_by_name) == expected_names, "S3 promoted-artifact set mismatch")
    for name, binding in promoted_by_name.items():
        path = measurement_dir / name
        _require(path.stat().st_size == binding.get("bytes"), f"S3 {name} byte count mismatch")
        _require(_sha256_file(path) == binding.get("sha256"), f"S3 {name} hash mismatch")

    for lane in ("a", "b"):
        fit = _read_json(measurement_dir / f"pilot-{lane}-fit.json")
        _verify_self_hash(fit, label=f"S3 {lane} fit receipt")
        binding = s3_manifest["pilotArtifacts"][lane]
        _require(fit.get("semanticLabelsAccessed") is False, f"S3 {lane} fit accessed semantic labels")
        _require(fit.get("stage") == "pilot" and fit.get("lane") == lane, f"S3 {lane} fit binding mismatch")
        _require(fit.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, f"S3 {lane} checkpoint mismatch")
        _require(fit.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, f"S3 {lane} tokenizer mismatch")
        _require(fit.get("preregistrationSha256") == EXPECTED_S3_PREREGISTRATION_SHA256, f"S3 {lane} prereg mismatch")
        _require(fit.get("selectionManifestSha256") == EXPECTED_S3_MANIFEST_SHA256, f"S3 {lane} manifest mismatch")
        _require(fit.get("selectionManifestSelfHash") == EXPECTED_S3_MANIFEST_SELF_HASH, f"S3 {lane} manifest self-hash mismatch")
        expected_fields = {
            "corpusArtifactSha256": binding["sha256"],
            "rowCount": binding["rowCount"],
            "caseIdSetSha256": binding["caseIdSetSha256"],
            "promptHashSetSha256": binding["promptHashSetSha256"],
            "sequenceSetSha256": binding["sequenceHashSetSha256"],
        }
        for key, expected in expected_fields.items():
            _require(fit.get(key) == expected, f"S3 {lane} fit {key} mismatch")

    rows_path = measurement_dir / "pilot-rows.jsonl"
    receipts_path = measurement_dir / "pilot-receipts.jsonl"
    collection_path = measurement_dir / "pilot-collection.json"
    fidelity_path = measurement_dir / "pilot-fidelity.json"
    rows = _read_jsonl(rows_path)
    receipts = _read_jsonl(receipts_path)
    collection = _read_json(collection_path)
    fidelity = _read_json(fidelity_path)
    _verify_self_hash(collection, label="S3 collection manifest")
    _verify_self_hash(fidelity, label="S3 fidelity evaluation")
    _require(fidelity.get("semanticLabelsAccessed") is False, "S3 fidelity accessed semantic labels")
    _require(fidelity.get("passed") is False, "S3 fidelity unexpectedly passed")
    _require(collection.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "S3 collection checkpoint mismatch")
    _require(collection.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "S3 collection tokenizer mismatch")
    _require(fidelity.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "S3 fidelity checkpoint mismatch")
    _require(fidelity.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "S3 fidelity tokenizer mismatch")
    h_binding = s3_manifest["pilotArtifacts"]["h"]
    _require(collection.get("promptManifestSha256") == h_binding["sha256"], "S3 collection prompt binding mismatch")
    _require(collection.get("promptCount") == 48, "S3 collection prompt count mismatch")
    _require(collection.get("rowArtifactSha256") == _sha256_file(rows_path), "S3 collection row hash mismatch")
    _require(collection.get("rowCount") == len(rows) == 96, "S3 collection row count mismatch")
    _require(collection.get("receiptArtifactSha256") == _sha256_file(receipts_path), "S3 collection receipt hash mismatch")
    _require(collection.get("receiptCount") == len(receipts) == 96, "S3 collection receipt count mismatch")
    _require(fidelity.get("promptManifestSha256") == h_binding["sha256"], "S3 fidelity prompt binding mismatch")
    _require(fidelity.get("rowsSha256") == _sha256_file(rows_path), "S3 fidelity row hash mismatch")
    _require(fidelity.get("receiptsSha256") == _sha256_file(receipts_path), "S3 fidelity receipt hash mismatch")
    _require(fidelity.get("collectionManifestSha256") == _sha256_file(collection_path), "S3 fidelity collection hash mismatch")
    _require(fidelity.get("preregistrationSha256") == EXPECTED_S3_PREREGISTRATION_SHA256, "S3 fidelity prereg mismatch")

    source_h = {str(row["caseId"]): _prompt_hash(row) for row in s3_pilot_by_lane["h"]}
    _require(len(source_h) == 48, "S3 H pilot case count mismatch")
    row_keys: set[tuple[str, str]] = set()
    receipt_keys: set[tuple[str, str]] = set()
    row_case_counts: Counter[str] = Counter()
    receipt_case_counts: Counter[str] = Counter()
    for row in rows:
        case_id = str(row.get("caseId"))
        alias = str(row.get("modelAlias"))
        _require(case_id in source_h, "S3 promoted row is not an H-pilot case")
        _require(row.get("promptSha256") == source_h[case_id], "S3 promoted row prompt mismatch")
        key = (alias, case_id)
        _require(key not in row_keys, "duplicate S3 promoted row coordinate")
        row_keys.add(key)
        row_case_counts[case_id] += 1
    for wrapper in receipts:
        case_id = str(wrapper.get("caseId"))
        alias = str(wrapper.get("modelAlias"))
        receipt = wrapper.get("receipt")
        _require(isinstance(receipt, dict), "S3 promoted receipt body missing")
        receipt_input = receipt.get("input")
        _require(isinstance(receipt_input, dict), "S3 promoted receipt input missing")
        _require(case_id in source_h, "S3 promoted receipt is not an H-pilot case")
        _require(receipt_input.get("promptSha256") == source_h[case_id], "S3 promoted receipt prompt mismatch")
        key = (alias, case_id)
        _require(key not in receipt_keys, "duplicate S3 promoted receipt coordinate")
        receipt_keys.add(key)
        receipt_case_counts[case_id] += 1
    _require(row_keys == receipt_keys, "S3 promoted row/receipt coordinates differ")
    expected_counts = Counter({case_id: 2 for case_id in source_h})
    _require(row_case_counts == expected_counts, "S3 promoted rows do not cover H twice")
    _require(receipt_case_counts == expected_counts, "S3 promoted receipts do not cover H twice")
    return evidence


def _verify_s3(
    s2_full_by_lane: Mapping[str, Sequence[Mapping[str, Any]]],
    s2_exposed_by_lane: Mapping[str, Sequence[Mapping[str, Any]]],
    s2_manifest: Mapping[str, Any],
    s2_leakage: Mapping[str, Any],
    s2_reference: Mapping[str, Any],
    s3_dir: Path,
    measurement_dir: Path,
) -> tuple[
    dict[str, Any],
    dict[str, list[dict[str, Any]]],
    dict[str, list[dict[str, Any]]],
    dict[str, dict[Coordinate, dict[str, Any]]],
    dict[str, Any],
]:
    repo_root = Path(__file__).resolve().parents[2]
    s3_preregistration = repo_root / "research" / "2026-07-15-jspace-s3-latin-endpoint-preregistration.md"
    s3_selector = repo_root / "scripts" / "research" / "select_jspace_s3_corpus.py"
    manifest_path = s3_dir / "selection-manifest.json"
    manifest = _read_json(manifest_path)
    _require(_sha256_file(s3_preregistration) == EXPECTED_S3_PREREGISTRATION_SHA256, "S3 preregistration hash mismatch")
    _require(_sha256_file(s3_selector) == EXPECTED_S3_SELECTOR_SHA256, "S3 selector hash mismatch")
    _require(_sha256_file(manifest_path) == EXPECTED_S3_MANIFEST_SHA256, "S3 selection-manifest hash mismatch")
    _require(manifest.get("schema") == S3_MANIFEST_SCHEMA, "S3 selection schema mismatch")
    _verify_self_hash(manifest, label="S3 selection manifest")
    _require(manifest.get("selfHash") == EXPECTED_S3_MANIFEST_SELF_HASH, "S3 selection self-hash mismatch")
    _require(manifest.get("preregistrationSha256") == EXPECTED_S3_PREREGISTRATION_SHA256, "S3 prereg binding mismatch")
    _require(manifest.get("selectorSourceSha256") == EXPECTED_S3_SELECTOR_SHA256, "S3 selector binding mismatch")
    _require(manifest.get("semanticLabelsAccessed") is False, "S3 selection accessed semantic labels")
    source_s2 = manifest.get("sourceS2")
    _require(isinstance(source_s2, dict), "S3 source-S2 binding missing")
    _require(source_s2.get("semanticLabelsAccessed") is False, "S3 source-S2 semantic boundary violated")
    _require(source_s2.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "S3 checkpoint mismatch")
    _require(source_s2.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "S3 tokenizer mismatch")
    _require(source_s2.get("corpusManifest", {}).get("sha256") == EXPECTED_S2_MANIFEST_SHA256, "S3 S2-manifest binding mismatch")
    _require(source_s2.get("corpusManifest", {}).get("selfHash") == s2_manifest.get("selfHash"), "S3 S2 self-hash mismatch")
    _require(
        source_s2.get("leakageReport", {}).get("sha256") == s2_manifest.get("leakageReportSha256"),
        "S3 S2-leakage binding mismatch",
    )
    _require(
        source_s2.get("leakageReport", {}).get("selfHash") == s2_leakage.get("selfHash"),
        "S3 S2-leakage self-hash mismatch",
    )
    _require(
        source_s2.get("referenceManifest", {}).get("sha256") == s2_manifest.get("referenceManifestSha256"),
        "S3 S2-reference binding mismatch",
    )
    _require(
        source_s2.get("referenceManifest", {}).get("selfHash") == s2_reference.get("selfHash"),
        "S3 S2-reference self-hash mismatch",
    )
    for lane in S2_LANE_FILES:
        full_binding = source_s2.get("fullArtifacts", {}).get(lane, {})
        exposed_binding = source_s2.get("exposedPilotArtifacts", {}).get(lane, {})
        expected_full = _identifier_digests(s2_full_by_lane[lane])
        expected_exposed = _identifier_digests(s2_exposed_by_lane[lane])
        _require(
            full_binding.get("sha256") == s2_manifest["splitArtifacts"][lane]["sha256"],
            f"S3 S2 {lane} full hash binding mismatch",
        )
        _require(
            exposed_binding.get("sha256") == s2_manifest["pilotArtifacts"][lane]["sha256"],
            f"S3 S2 {lane} pilot hash binding mismatch",
        )
        for key, expected in expected_full.items():
            _require(full_binding.get(key) == expected, f"S3 S2 {lane} full {key} binding mismatch")
        for key, expected in expected_exposed.items():
            _require(exposed_binding.get(key) == expected, f"S3 S2 {lane} pilot {key} binding mismatch")

    pilot_by_lane: dict[str, list[dict[str, Any]]] = {}
    confirmation_by_lane: dict[str, list[dict[str, Any]]] = {}
    confirmation_maps: dict[str, dict[Coordinate, dict[str, Any]]] = {}
    for lane, (pilot_name, confirmation_name) in S3_LANE_FILES.items():
        pilot_path = s3_dir / pilot_name
        confirmation_path = s3_dir / confirmation_name
        _require(
            _sha256_file(pilot_path) == manifest["pilotArtifacts"][lane]["sha256"],
            f"S3 {lane} pilot byte hash mismatch",
        )
        _require(
            _sha256_file(confirmation_path) == manifest["confirmationArtifacts"][lane]["sha256"],
            f"S3 {lane} confirmation byte hash mismatch",
        )
        pilot = _read_jsonl(pilot_path)
        confirmation = _read_jsonl(confirmation_path)
        _verify_binding(pilot, pilot_path, manifest["pilotArtifacts"][lane], label=f"S3 {lane} pilot")
        _verify_binding(
            confirmation,
            confirmation_path,
            manifest["confirmationArtifacts"][lane],
            label=f"S3 {lane} confirmation",
        )
        _require(len(pilot) == 48 and len(confirmation) == 120, f"S3 {lane} row count mismatch")
        _require(all(row.get("lane") == lane for row in pilot + confirmation), f"S3 {lane} lane mismatch")
        full_by_case = {str(row["caseId"]): row for row in s2_full_by_lane[lane]}
        _require(
            all(full_by_case.get(str(row["caseId"])) == row for row in pilot + confirmation),
            f"S3 {lane} contains a non-S2 row",
        )
        pilot_ids = _identifier_sets(pilot)
        confirmation_ids = _identifier_sets(confirmation)
        for key in pilot_ids:
            _require(not pilot_ids[key] & confirmation_ids[key], f"S3 {lane} pilot/confirmation {key} overlap")
        coordinates = [_coordinate(row) for row in confirmation]
        _require(coordinates == sorted(coordinates), f"S3 {lane} confirmation order is not lexicographic")
        _require(
            _coordinate_hash(coordinates) == EXPECTED_S3_CONFIRMATION_COORDINATE_SHA256,
            f"S3 {lane} confirmation coordinate hash mismatch",
        )
        coordinate_map = {_coordinate(row): row for row in confirmation}
        _require(len(coordinate_map) == 120, f"S3 {lane} confirmation coordinate collision")
        pilot_by_lane[lane] = pilot
        confirmation_by_lane[lane] = confirmation
        confirmation_maps[lane] = coordinate_map

    for stage_rows in (pilot_by_lane, confirmation_by_lane):
        coordinate_sets = [{_coordinate(row) for row in stage_rows[lane]} for lane in S3_LANE_FILES]
        _require(all(value == coordinate_sets[0] for value in coordinate_sets[1:]), "S3 A/B/H coordinates differ")
    evidence = _verify_s3_evidence(measurement_dir, manifest, pilot_by_lane)
    return manifest, pilot_by_lane, confirmation_by_lane, confirmation_maps, evidence


def _pilot_coordinates() -> list[Coordinate]:
    coordinates = sorted(
        (family_index, bin_index, slot)
        for family_index, family_bins in enumerate(PILOT_SLOT_TABLE)
        for bin_index, pair in enumerate(family_bins)
        for slot in pair
    )
    _require(len(coordinates) == len(set(coordinates)) == 48, "S4 pilot coordinate count mismatch")
    _require(_coordinate_hash(coordinates) == EXPECTED_PILOT_COORDINATE_SHA256, "S4 pilot coordinate hash mismatch")
    return coordinates


def _balance_proof(coordinates: Sequence[Coordinate], *, stage: str) -> dict[str, Any]:
    expected_rows = 48 if stage == "pilot" else 72
    expected_per_bin = 12 if stage == "pilot" else 18
    expected_per_family = 8 if stage == "pilot" else 12
    expected_per_endpoint = 6 if stage == "pilot" else 9
    _require(coordinates == sorted(coordinates), f"S4 {stage} coordinates are not lexicographic")
    _require(len(coordinates) == len(set(coordinates)) == expected_rows, f"S4 {stage} row count mismatch")
    by_bin = Counter(bin_index for _, bin_index, _ in coordinates)
    by_family = Counter(family for family, _, _ in coordinates)
    by_endpoint = Counter(slot for _, _, slot in coordinates)
    by_family_endpoint = Counter((family, slot) for family, _, slot in coordinates)
    by_bin_endpoint = {
        bin_index: Counter(slot for _, selected_bin, slot in coordinates if selected_bin == bin_index)
        for bin_index in range(4)
    }
    _require(by_bin == Counter({index: expected_per_bin for index in range(4)}), f"S4 {stage} bin balance mismatch")
    _require(by_family == Counter({index: expected_per_family for index in range(6)}), f"S4 {stage} family balance mismatch")
    _require(by_endpoint == Counter({index: expected_per_endpoint for index in range(8)}), f"S4 {stage} endpoint balance mismatch")
    if stage == "pilot":
        _require(
            by_family_endpoint == Counter({(family, slot): 1 for family in range(6) for slot in range(8)}),
            "S4 pilot does not give each family every endpoint exactly once",
        )
        _require(all(len(value) == 8 for value in by_bin_endpoint.values()), "S4 pilot lacks an endpoint in a bin")
    else:
        _require(
            all(by_family_endpoint[(family, slot)] >= 1 for family in range(6) for slot in range(8)),
            "S4 confirmation does not retain every family/endpoint pair",
        )
        for bin_index, expected_counts in EXPECTED_CONFIRMATION_ENDPOINT_COUNTS_BY_BIN.items():
            actual = tuple(by_bin_endpoint[bin_index][slot] for slot in range(8))
            _require(actual == expected_counts, f"S4 confirmation bin {bin_index} endpoint counts mismatch")
    return {
        "coordinateSetSha256": _coordinate_hash(coordinates),
        "rowCount": len(coordinates),
        "rowsPerPositionBin": {str(index): by_bin[index] for index in range(4)},
        "rowsPerFamily": {FAMILIES[index]: by_family[index] for index in range(6)},
        "endpointProfileCounts": {ENDPOINT_SLOTS[index][0]: by_endpoint[index] for index in range(8)},
        "endpointProfileCountsPerPositionBin": {
            str(bin_index): {
                ENDPOINT_SLOTS[slot][0]: by_bin_endpoint[bin_index][slot]
                for slot in range(8)
            }
            for bin_index in range(4)
        },
        "allEndpointProfilesPresentPerPositionBin": all(
            len(value) == 8 for value in by_bin_endpoint.values()
        ),
        "eachFamilySeesEachEndpointExactlyOnce": stage == "pilot",
        "eachFamilyRetainsEachEndpointAtLeastOnce": stage == "confirmation",
    }


def _artifact_binding(
    path: Path,
    rows: Sequence[Mapping[str, Any]],
    coordinates: Sequence[Coordinate],
) -> dict[str, Any]:
    return {
        "file": path.name,
        "sha256": _sha256_file(path),
        "coordinateSetSha256": _coordinate_hash(coordinates),
        **_identifier_digests(rows),
    }


def _source_binding(
    repo_path: str,
    path: Path,
    rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    return {
        "file": repo_path,
        "sha256": _sha256_file(path),
        "coordinateSetSha256": _coordinate_hash(_coordinate(row) for row in rows),
        **_identifier_digests(rows),
    }


def select(args: argparse.Namespace) -> None:
    s2_dir = Path(args.s2_corpus_dir).resolve()
    s3_dir = Path(args.s3_corpus_dir).resolve()
    measurement_dir = Path(args.s3_measurement_dir).resolve()
    preregistration = Path(args.preregistration).resolve()
    output = Path(args.output_dir).resolve()

    _require(
        preregistration.name == "2026-07-15-jspace-s4-centered-scalar-preregistration.md",
        "unexpected S4 preregistration",
    )
    _require(preregistration.is_file(), "S4 preregistration is missing")
    _require(_sha256_file(preregistration) == EXPECTED_S4_PREREGISTRATION_SHA256, "S4 preregistration byte hash mismatch")
    _require(not output.exists() or not any(output.iterdir()), "output directory must be absent or empty")

    s2_manifest, s2_leakage, s2_reference, s2_full, s2_exposed = _verify_s2(s2_dir)
    s3_manifest, s3_pilot, s3_confirmation, coordinate_maps, s3_evidence = _verify_s3(
        s2_full,
        s2_exposed,
        s2_manifest,
        s2_leakage,
        s2_reference,
        s3_dir,
        measurement_dir,
    )

    source_coordinate_sets = [set(value) for value in coordinate_maps.values()]
    _require(
        all(value == source_coordinate_sets[0] for value in source_coordinate_sets[1:]),
        "S3-confirmation A/B/H coordinate sets differ",
    )
    pilot_coordinates = _pilot_coordinates()
    pilot_coordinate_set = set(pilot_coordinates)
    source_coordinate_set = source_coordinate_sets[0]
    _require(pilot_coordinate_set <= source_coordinate_set, "S4 pilot is not contained in S3 confirmation")
    confirmation_coordinates = sorted(source_coordinate_set - pilot_coordinate_set)
    _require(len(confirmation_coordinates) == 72, "S4 confirmation does not contain 72 rows")
    _require(
        _coordinate_hash(confirmation_coordinates) == EXPECTED_CONFIRMATION_COORDINATE_SHA256,
        "S4 confirmation coordinate hash mismatch",
    )
    pilot_balance = _balance_proof(pilot_coordinates, stage="pilot")
    confirmation_balance = _balance_proof(confirmation_coordinates, stage="confirmation")

    selected: dict[str, dict[str, list[dict[str, Any]]]] = {"pilot": {}, "confirmation": {}}
    for lane in S3_LANE_FILES:
        selected["pilot"][lane] = [coordinate_maps[lane][coordinate] for coordinate in pilot_coordinates]
        selected["confirmation"][lane] = [coordinate_maps[lane][coordinate] for coordinate in confirmation_coordinates]
        _require(
            sorted(
                selected["pilot"][lane] + selected["confirmation"][lane],
                key=_coordinate,
            )
            == s3_confirmation[lane],
            f"S4 {lane} split is not the exact ordered S3-confirmation partition",
        )

    exposed_global = {key: set() for key in ("caseId", "promptHash", "sequenceHash")}
    for rows in list(s2_exposed.values()) + list(s3_pilot.values()):
        _merge_identifier_sets(exposed_global, rows)
    exposed_binding = {
        "rowCountAcrossInputArtifacts": sum(len(rows) for rows in s2_exposed.values())
        + sum(len(rows) for rows in s3_pilot.values()),
        "uniqueCaseIdCount": len(exposed_global["caseId"]),
        "caseIdSetSha256": _set_hash(exposed_global["caseId"]),
        "uniquePromptHashCount": len(exposed_global["promptHash"]),
        "promptHashSetSha256": _set_hash(exposed_global["promptHash"]),
        "uniqueSequenceHashCount": len(exposed_global["sequenceHash"]),
        "sequenceHashSetSha256": _set_hash(exposed_global["sequenceHash"]),
    }

    combined_selected_identifiers: dict[str, dict[str, set[str]]] = {}
    for lane in S3_LANE_FILES:
        combined = selected["pilot"][lane] + selected["confirmation"][lane]
        identifiers = _identifier_sets(combined)
        combined_selected_identifiers[lane] = identifiers
        for key in identifiers:
            _require(not identifiers[key] & exposed_global[key], f"S4 {lane} overlaps exposed S2/S3 {key}")
        pilot_ids = _identifier_sets(selected["pilot"][lane])
        confirmation_ids = _identifier_sets(selected["confirmation"][lane])
        for key in pilot_ids:
            _require(not pilot_ids[key] & confirmation_ids[key], f"S4 {lane} pilot/confirmation {key} overlap")

    pairwise_overlaps: dict[str, dict[str, int]] = {}
    lanes = tuple(S3_LANE_FILES)
    for left_index, left in enumerate(lanes):
        for right in lanes[left_index + 1 :]:
            pair_key = f"{left}:{right}"
            pairwise_overlaps[pair_key] = {}
            for key in combined_selected_identifiers[left]:
                overlap = combined_selected_identifiers[left][key] & combined_selected_identifiers[right][key]
                pairwise_overlaps[pair_key][key] = len(overlap)
                _require(not overlap, f"S4 lanes {left}/{right} overlap by {key}")

    encoded_artifacts: dict[str, dict[str, bytes]] = {"pilot": {}, "confirmation": {}}
    for stage in ("pilot", "confirmation"):
        for lane in S3_LANE_FILES:
            encoded = _jsonl_bytes(selected[stage][lane])
            _require(
                _sha256_bytes(encoded) == EXPECTED_OUTPUT_SHA256[stage][lane],
                f"S4 {stage} {lane} preregistered artifact hash mismatch",
            )
            encoded_artifacts[stage][lane] = encoded

    output.mkdir(parents=True, exist_ok=True)
    artifact_bindings: dict[str, dict[str, Any]] = {"pilot": {}, "confirmation": {}}
    for stage, coordinates in (("pilot", pilot_coordinates), ("confirmation", confirmation_coordinates)):
        for lane in S3_LANE_FILES:
            path = output / OUTPUT_FILES[stage][lane]
            path.write_bytes(encoded_artifacts[stage][lane])
            _require(_sha256_file(path) == EXPECTED_OUTPUT_SHA256[stage][lane], f"written S4 {stage} {lane} hash mismatch")
            artifact_bindings[stage][lane] = _artifact_binding(path, selected[stage][lane], coordinates)

    source_s2_pilots = {
        lane: _source_binding(
            f"{S2_REPO_DIR}/{S2_LANE_FILES[lane][1]}",
            s2_dir / S2_LANE_FILES[lane][1],
            s2_exposed[lane],
        )
        for lane in S2_LANE_FILES
    }
    source_s3_pilots = {
        lane: _source_binding(
            f"{S3_REPO_DIR}/{S3_LANE_FILES[lane][0]}",
            s3_dir / S3_LANE_FILES[lane][0],
            s3_pilot[lane],
        )
        for lane in S3_LANE_FILES
    }
    source_s3_confirmation = {
        lane: _source_binding(
            f"{S3_REPO_DIR}/{S3_LANE_FILES[lane][1]}",
            s3_dir / S3_LANE_FILES[lane][1],
            s3_confirmation[lane],
        )
        for lane in S3_LANE_FILES
    }
    promoted_bindings = {
        Path(str(item["path"])).name: {
            "file": str(item["path"]),
            "bytes": item["bytes"],
            "sha256": item["sha256"],
        }
        for item in s3_evidence["promotedArtifacts"]
    }

    selection_manifest: dict[str, Any] = {
        "schema": SCHEMA,
        "preregistrationSha256": _sha256_file(preregistration),
        "selectorSourceSha256": _sha256_file(Path(__file__).resolve()),
        "semanticLabelsAccessed": False,
        "checkpointSha256": EXPECTED_CHECKPOINT_SHA256,
        "tokenizerSha256": EXPECTED_TOKENIZER_SHA256,
        "positionBins": [list(value) for value in POSITION_BINS],
        "sourceS2": {
            "semanticLabelsAccessed": False,
            "corpusManifest": {
                "file": f"{S2_REPO_DIR}/corpus-manifest.json",
                "sha256": _sha256_file(s2_dir / "corpus-manifest.json"),
                "selfHash": s2_manifest["selfHash"],
            },
            "leakageReport": {
                "file": f"{S2_REPO_DIR}/leakage-report.json",
                "sha256": _sha256_file(s2_dir / "leakage-report.json"),
                "selfHash": s2_leakage["selfHash"],
                "passed": True,
            },
            "referenceManifest": {
                "file": f"{S2_REPO_DIR}/reference-manifest.json",
                "sha256": _sha256_file(s2_dir / "reference-manifest.json"),
                "selfHash": s2_reference["selfHash"],
            },
            "exposedPilotArtifacts": source_s2_pilots,
        },
        "sourceS3": {
            "semanticLabelsAccessed": False,
            "preregistration": {
                "file": "research/2026-07-15-jspace-s3-latin-endpoint-preregistration.md",
                "sha256": EXPECTED_S3_PREREGISTRATION_SHA256,
            },
            "selector": {
                "file": "scripts/research/select_jspace_s3_corpus.py",
                "sha256": EXPECTED_S3_SELECTOR_SHA256,
            },
            "selectionManifest": {
                "file": f"{S3_REPO_DIR}/selection-manifest.json",
                "sha256": EXPECTED_S3_MANIFEST_SHA256,
                "selfHash": s3_manifest["selfHash"],
            },
            "exposedPilotArtifacts": source_s3_pilots,
            "stillUnobservedConfirmationArtifacts": source_s3_confirmation,
            "failedPilotEvidenceManifest": {
                "file": f"{S3_MEASUREMENT_REPO_DIR}/pilot-manifest.json",
                "sha256": EXPECTED_S3_EVIDENCE_SHA256,
                "selfHash": s3_evidence["selfHash"],
                "status": s3_evidence["status"],
            },
            "promotedObservationArtifacts": promoted_bindings,
        },
        "selector": {
            "familyOrder": list(FAMILIES),
            "positionBins": [list(value) for value in POSITION_BINS],
            "endpointSlots": [
                {"slot": slot, "profile": profile, "taskForm": form, "variant": variant}
                for slot, (profile, form, variant) in enumerate(ENDPOINT_SLOTS)
            ],
            "pilotSlotTable": [
                [[left, right] for left, right in family_bins]
                for family_bins in PILOT_SLOT_TABLE
            ],
            "coordinateOrder": "lexicographic [familyIndex,positionBinIndex,endpointSlot]",
            "confirmationRule": "exact ordered complement within sealed S3 confirmation",
            "ranking": None,
        },
        "identifierHashing": {
            "promptHash": "sha256(exact prompt UTF-8)",
            "setDigest": "sha256(canonical JSON of sorted unique strings)",
            "coordinateSetDigest": (
                "sha256(canonical JSON of sorted unique [familyIndex,positionBinIndex,endpointSlot] arrays)"
            ),
        },
        "pilotArtifacts": artifact_bindings["pilot"],
        "confirmationArtifacts": artifact_bindings["confirmation"],
        "proof": {
            "sourceRowsAreExactSealedS3ConfirmationMembers": True,
            "noPromptGenerationEditsOrRanking": True,
            "noSelectedSourceRowPreviouslyFitOrEvaluated": True,
            "coordinatesIdenticalAcrossLanes": True,
            "coordinateOrderExact": True,
            "pilot": pilot_balance,
            "confirmation": confirmation_balance,
            "exposedObservationUnion": exposed_binding,
            "zeroOverlapWithExposedS2AndS3ByCaseIdPromptHashAndSequenceHash": True,
            "zeroPilotConfirmationOverlapByCaseIdPromptHashAndSequenceHash": True,
            "selectedLanesPairwiseDisjoint": pairwise_overlaps,
            "uniformConfirmationEndpointByPositionClaimPermitted": False,
        },
        "selfHash": None,
    }
    selection_manifest["selfHash"] = _sha256_json(selection_manifest)
    manifest_path = output / "selection-manifest.json"
    _write_json(manifest_path, selection_manifest)
    print(
        json.dumps(
            {
                "status": "passed",
                "output": str(output),
                "manifestSha256": _sha256_file(manifest_path),
                "manifestSelfHash": selection_manifest["selfHash"],
                "pilotRowsPerLane": 48,
                "confirmationRowsPerLane": 72,
                "semanticLabelsAccessed": False,
            },
            sort_keys=True,
        )
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--s2-corpus-dir", required=True)
    parser.add_argument("--s3-corpus-dir", required=True)
    parser.add_argument("--s3-measurement-dir", required=True)
    parser.add_argument("--preregistration", required=True)
    parser.add_argument("--output-dir", required=True)
    return parser


def main() -> None:
    select(_parser().parse_args())


if __name__ == "__main__":
    main()
