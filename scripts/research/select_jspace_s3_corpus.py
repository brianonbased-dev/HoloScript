"""Select the preregistered, label-blind J-space S3 subsets from sealed S2.

This selector never generates or ranks prompts. It verifies the committed S2
corpus and leakage bindings, applies the frozen Latin coordinate formula, and
seals both the pilot and the independently reserved confirmation artifacts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


SCHEMA = "holoscript.jspace-s3-selection-manifest.v0.1.0"
S2_MANIFEST_SCHEMA = "holoscript.jspace-s2-corpus-manifest.v0.1.0"
S2_LEAKAGE_SCHEMA = "holoscript.jspace-s2-leakage-report.v0.1.0"
S2_REFERENCE_SCHEMA = "holoscript.jspace-s2-reference-manifest.v0.1.0"
EXPECTED_S2_MANIFEST_SHA256 = (
    "sha256:2c00dd213301a5ba57628b3226ae77f6b78216df0f8bb17ea0dddecccb2b0b64"
)
EXPECTED_CHECKPOINT_SHA256 = (
    "sha256:abbda748c6bd6dec69bd72f25ca5ab28876fbbdbf195f218439ddbd0a10ff914"
)
EXPECTED_TOKENIZER_SHA256 = (
    "sha256:f92af6207d211728a530e95e44c60b3c95f700ea9c755ab6bd8614fbdac623d4"
)
EXPECTED_S3_PREREGISTRATION_SHA256 = (
    "sha256:c850d7eda595e3eda2fdbcfbcf3e8172b876f7171594569da979e54cff822c18"
)
S2_REPO_DIR = "research/data/jspace-s2"

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
LANE_FILES = {
    "a": ("fit-a.jsonl", "fit-a-pilot.jsonl"),
    "b": ("fit-b.jsonl", "fit-b-pilot.jsonl"),
    "h": ("fidelity-h.jsonl", "fidelity-h-pilot.jsonl"),
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
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return _sha256_bytes(encoded)


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


def _write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(
            value,
            sort_keys=True,
            indent=2,
            ensure_ascii=False,
            allow_nan=False,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _write_jsonl(path: Path, rows: Iterable[Mapping[str, Any]]) -> None:
    path.write_text(
        "".join(
            json.dumps(
                row,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
                allow_nan=False,
            )
            + "\n"
            for row in rows
        ),
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
    bin_value = row.get("lengthStratum")
    _require(type(bin_value) is int and 0 <= bin_value < 4, "invalid position-bin index")
    _require(
        row.get("positionBin") == list(POSITION_BINS[bin_value]),
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
    return (FAMILIES.index(family), bin_value, slot)


def _coordinate_hash(coordinates: Iterable[Coordinate]) -> str:
    return _sha256_json([list(value) for value in sorted(coordinates)])


def _verify_source(s2_dir: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
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
    _require(manifest.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "checkpoint hash mismatch")
    _require(manifest.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "tokenizer hash mismatch")

    _require(manifest.get("leakageReportSha256") == _sha256_file(leakage_path), "leakage report hash mismatch")
    _require(leakage.get("schema") == S2_LEAKAGE_SCHEMA, "S2 leakage schema mismatch")
    _verify_self_hash(leakage, label="S2 leakage report")
    _require(leakage.get("passed") is True, "S2 leakage report did not pass")
    _require(leakage.get("failedCaseIds") == [], "S2 leakage report contains failures")
    match_counts = leakage.get("matchCounts")
    _require(
        isinstance(match_counts, dict) and match_counts and all(value == 0 for value in match_counts.values()),
        "S2 leakage match counts are not all zero",
    )
    _require(leakage.get("byteWindow") == 64, "S2 byte-window contract mismatch")
    _require(leakage.get("tokenWindow") == 32, "S2 token-window contract mismatch")

    _require(manifest.get("referenceManifestSha256") == _sha256_file(reference_path), "reference manifest hash mismatch")
    _require(reference.get("schema") == S2_REFERENCE_SCHEMA, "S2 reference schema mismatch")
    _verify_self_hash(reference, label="S2 reference manifest")
    _require(reference.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "reference checkpoint hash mismatch")
    _require(reference.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "reference tokenizer hash mismatch")
    return manifest, leakage, reference


def _load_lane(
    s2_dir: Path,
    manifest: Mapping[str, Any],
    lane: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[Coordinate, dict[str, Any]]]:
    full_name, pilot_name = LANE_FILES[lane]
    full_path = s2_dir / full_name
    pilot_path = s2_dir / pilot_name
    full_binding = manifest["splitArtifacts"][lane]
    pilot_binding = manifest["pilotArtifacts"][lane]
    _require(_sha256_file(full_path) == full_binding.get("sha256"), f"S2 {lane} full hash mismatch")
    _require(_sha256_file(pilot_path) == pilot_binding.get("sha256"), f"S2 {lane} pilot hash mismatch")
    full = _read_jsonl(full_path)
    pilot = _read_jsonl(pilot_path)
    _require(len(full) == full_binding.get("rowCount") == 192, f"S2 {lane} full row count mismatch")
    _require(len(pilot) == pilot_binding.get("rowCount") == 24, f"S2 {lane} pilot row count mismatch")
    _require(all(row.get("lane") == lane for row in full + pilot), f"S2 {lane} lane binding mismatch")

    by_coordinate: dict[Coordinate, dict[str, Any]] = {}
    by_case_id: dict[str, dict[str, Any]] = {}
    for row in full:
        coordinate = _coordinate(row)
        _require(coordinate not in by_coordinate, f"duplicate S2 {lane} coordinate {coordinate}")
        by_coordinate[coordinate] = row
        case_id = str(row.get("caseId"))
        _require(case_id not in by_case_id, f"duplicate S2 {lane} case ID")
        by_case_id[case_id] = row
    _require(len(by_coordinate) == 192, f"S2 {lane} does not cover all coordinates")
    _identifier_sets(full)

    pilot_coordinates: set[Coordinate] = set()
    for row in pilot:
        case_id = str(row.get("caseId"))
        _require(case_id in by_case_id and row == by_case_id[case_id], f"S2 {lane} pilot row is not an exact full member")
        pilot_coordinates.add(_coordinate(row))
    _require(len(pilot_coordinates) == 24, f"S2 {lane} pilot coordinates are not unique")
    _identifier_sets(pilot)
    return full, pilot, by_coordinate


def _pilot_coordinates() -> list[Coordinate]:
    coordinates: list[Coordinate] = []
    for family_index in range(6):
        g_f = (1 + 4 * (family_index % 2) + 2 * (family_index // 4)) % 8
        for bin_index in range(4):
            for k in (0, 1):
                coordinates.append((family_index, bin_index, (2 * bin_index + g_f + k) % 8))
    _require(len(coordinates) == len(set(coordinates)) == 48, "Latin selector did not yield 48 coordinates")
    return coordinates


def _balance_proof(coordinates: Sequence[Coordinate], *, stage: str) -> dict[str, Any]:
    expected_rows = 48 if stage == "pilot" else 120
    expected_per_bin = 12 if stage == "pilot" else 30
    expected_per_endpoint = 6 if stage == "pilot" else 15
    _require(len(coordinates) == len(set(coordinates)) == expected_rows, f"{stage} coordinate count mismatch")
    by_bin = Counter(bin_index for _, bin_index, _ in coordinates)
    by_endpoint = Counter(slot for _, _, slot in coordinates)
    endpoint_by_bin = {
        str(bin_index): Counter(slot for _, selected_bin, slot in coordinates if selected_bin == bin_index)
        for bin_index in range(4)
    }
    _require(by_bin == Counter({index: expected_per_bin for index in range(4)}), f"{stage} bin balance mismatch")
    _require(by_endpoint == Counter({index: expected_per_endpoint for index in range(8)}), f"{stage} endpoint balance mismatch")
    _require(all(len(counts) == 8 for counts in endpoint_by_bin.values()), f"{stage} lacks an endpoint in a bin")
    if stage == "pilot":
        by_family_endpoint = Counter((family, slot) for family, _, slot in coordinates)
        _require(
            by_family_endpoint == Counter({(family, slot): 1 for family in range(6) for slot in range(8)}),
            "pilot family-endpoint Latin balance mismatch",
        )
    return {
        "coordinateSetSha256": _coordinate_hash(coordinates),
        "rowCount": len(coordinates),
        "rowsPerPositionBin": {str(index): by_bin[index] for index in range(4)},
        "endpointProfileCounts": {
            ENDPOINT_SLOTS[index][0]: by_endpoint[index] for index in range(8)
        },
        "endpointProfileCountsPerPositionBin": {
            str(bin_index): {
                ENDPOINT_SLOTS[slot][0]: endpoint_by_bin[str(bin_index)][slot]
                for slot in range(8)
            }
            for bin_index in range(4)
        },
        "allEndpointProfilesPresentPerPositionBin": True,
        "eachFamilySeesEachEndpointExactlyOnce": stage == "pilot",
    }


def _artifact_binding(path: Path, rows: Sequence[Mapping[str, Any]], coordinates: Sequence[Coordinate]) -> dict[str, Any]:
    return {
        "file": path.name,
        "sha256": _sha256_file(path),
        "coordinateSetSha256": _coordinate_hash(coordinates),
        **_identifier_digests(rows),
    }


def select(args: argparse.Namespace) -> None:
    s2_dir = Path(args.s2_corpus_dir).resolve()
    preregistration = Path(args.preregistration).resolve()
    output = Path(args.output_dir).resolve()
    _require(preregistration.name == "2026-07-15-jspace-s3-latin-endpoint-preregistration.md", "unexpected S3 preregistration")
    _require(preregistration.is_file(), "S3 preregistration is missing")
    _require(
        _sha256_file(preregistration) == EXPECTED_S3_PREREGISTRATION_SHA256,
        "S3 preregistration byte hash mismatch",
    )
    _require(not output.exists() or not any(output.iterdir()), "output directory must be absent or empty")
    output.mkdir(parents=True, exist_ok=True)

    manifest, leakage, reference = _verify_source(s2_dir)
    full_by_lane: dict[str, list[dict[str, Any]]] = {}
    exposed_by_lane: dict[str, list[dict[str, Any]]] = {}
    coordinate_maps: dict[str, dict[Coordinate, dict[str, Any]]] = {}
    for lane in LANE_FILES:
        full, exposed, coordinate_map = _load_lane(s2_dir, manifest, lane)
        full_by_lane[lane] = full
        exposed_by_lane[lane] = exposed
        coordinate_maps[lane] = coordinate_map

    full_coordinate_sets = [set(value) for value in coordinate_maps.values()]
    _require(all(value == full_coordinate_sets[0] for value in full_coordinate_sets[1:]), "A/B/H full coordinates differ")
    exposed_coordinate_sets = [{_coordinate(row) for row in exposed_by_lane[lane]} for lane in LANE_FILES]
    _require(all(value == exposed_coordinate_sets[0] for value in exposed_coordinate_sets[1:]), "A/B/H exposed coordinates differ")

    pilot_coordinates = _pilot_coordinates()
    pilot_coordinate_set = set(pilot_coordinates)
    exposed_coordinate_set = exposed_coordinate_sets[0]
    _require(not pilot_coordinate_set & exposed_coordinate_set, "S3 pilot overlaps exposed S2 coordinates")
    confirmation_coordinates = sorted(full_coordinate_sets[0] - exposed_coordinate_set - pilot_coordinate_set)
    _require(len(confirmation_coordinates) == 120, "S3 confirmation does not contain 120 rows")
    pilot_balance = _balance_proof(pilot_coordinates, stage="pilot")
    confirmation_balance = _balance_proof(confirmation_coordinates, stage="confirmation")

    selected: dict[str, dict[str, list[dict[str, Any]]]] = {"pilot": {}, "confirmation": {}}
    for lane in LANE_FILES:
        selected["pilot"][lane] = [coordinate_maps[lane][coordinate] for coordinate in pilot_coordinates]
        selected["confirmation"][lane] = [coordinate_maps[lane][coordinate] for coordinate in confirmation_coordinates]

    exposed_global = {key: set() for key in ("caseId", "promptHash", "sequenceHash")}
    for rows in exposed_by_lane.values():
        identifiers = _identifier_sets(rows)
        for key in exposed_global:
            exposed_global[key].update(identifiers[key])
    combined_selected_identifiers: dict[str, dict[str, set[str]]] = {}
    for lane in LANE_FILES:
        combined = selected["pilot"][lane] + selected["confirmation"][lane]
        identifiers = _identifier_sets(combined)
        combined_selected_identifiers[lane] = identifiers
        for key in exposed_global:
            _require(not identifiers[key] & exposed_global[key], f"S3 {lane} overlaps exposed S2 {key}")
        pilot_ids = _identifier_sets(selected["pilot"][lane])
        confirmation_ids = _identifier_sets(selected["confirmation"][lane])
        for key in pilot_ids:
            _require(not pilot_ids[key] & confirmation_ids[key], f"S3 {lane} pilot/confirmation {key} overlap")
    pairwise_overlaps: dict[str, dict[str, int]] = {}
    lanes = tuple(LANE_FILES)
    for left_index, left in enumerate(lanes):
        for right in lanes[left_index + 1 :]:
            pairwise_overlaps[f"{left}:{right}"] = {}
            for key in combined_selected_identifiers[left]:
                overlap = combined_selected_identifiers[left][key] & combined_selected_identifiers[right][key]
                pairwise_overlaps[f"{left}:{right}"][key] = len(overlap)
                _require(not overlap, f"S3 lanes {left}/{right} overlap by {key}")

    artifact_bindings: dict[str, dict[str, Any]] = {"pilot": {}, "confirmation": {}}
    for stage, coordinates in (("pilot", pilot_coordinates), ("confirmation", confirmation_coordinates)):
        for lane in LANE_FILES:
            path = output / OUTPUT_FILES[stage][lane]
            rows = selected[stage][lane]
            _write_jsonl(path, rows)
            artifact_bindings[stage][lane] = _artifact_binding(path, rows, coordinates)

    source_full_bindings = {
        lane: {
            "file": f"{S2_REPO_DIR}/{LANE_FILES[lane][0]}",
            "sha256": manifest["splitArtifacts"][lane]["sha256"],
            "coordinateSetSha256": _coordinate_hash(
                _coordinate(row) for row in full_by_lane[lane]
            ),
            **_identifier_digests(full_by_lane[lane]),
        }
        for lane in LANE_FILES
    }
    source_exposed_pilot_bindings = {
        lane: {
            "file": f"{S2_REPO_DIR}/{LANE_FILES[lane][1]}",
            "sha256": manifest["pilotArtifacts"][lane]["sha256"],
            "coordinateSetSha256": _coordinate_hash(
                _coordinate(row) for row in exposed_by_lane[lane]
            ),
            **_identifier_digests(exposed_by_lane[lane]),
        }
        for lane in LANE_FILES
    }
    selection_manifest: dict[str, Any] = {
        "schema": SCHEMA,
        "preregistrationSha256": _sha256_file(preregistration),
        "selectorSourceSha256": _sha256_file(Path(__file__).resolve()),
        "semanticLabelsAccessed": False,
        "positionBins": [list(value) for value in POSITION_BINS],
        "sourceS2": {
            "semanticLabelsAccessed": False,
            "corpusManifest": {
                "file": f"{S2_REPO_DIR}/corpus-manifest.json",
                "sha256": _sha256_file(s2_dir / "corpus-manifest.json"),
                "selfHash": manifest["selfHash"],
            },
            "leakageReport": {
                "file": f"{S2_REPO_DIR}/leakage-report.json",
                "sha256": manifest["leakageReportSha256"],
                "selfHash": leakage["selfHash"],
            },
            "referenceManifest": {
                "file": f"{S2_REPO_DIR}/reference-manifest.json",
                "sha256": manifest["referenceManifestSha256"],
                "selfHash": reference["selfHash"],
            },
            "checkpointSha256": EXPECTED_CHECKPOINT_SHA256,
            "tokenizerSha256": EXPECTED_TOKENIZER_SHA256,
            "fullArtifacts": source_full_bindings,
            "exposedPilotArtifacts": source_exposed_pilot_bindings,
        },
        "selector": {
            "familyOrder": list(FAMILIES),
            "positionBins": [list(value) for value in POSITION_BINS],
            "endpointSlots": [
                {"slot": slot, "profile": profile, "taskForm": form, "variant": variant}
                for slot, (profile, form, variant) in enumerate(ENDPOINT_SLOTS)
            ],
            "formula": {
                "g": "(1 + 4 * (f mod 2) + 2 * floor(f / 4)) mod 8",
                "slot": "(2 * b + g_f + k) mod 8 for k in {0,1}",
            },
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
            "sourceRowsAreExactSealedMembers": True,
            "coordinatesIdenticalAcrossLanes": True,
            "pilot": pilot_balance,
            "confirmation": confirmation_balance,
            "zeroOverlapWithExposedS2ByCaseIdPromptHashAndSequenceHash": True,
            "zeroPilotConfirmationOverlapByCaseIdPromptHashAndSequenceHash": True,
            "selectedLanesPairwiseDisjoint": pairwise_overlaps,
        },
        "selfHash": None,
    }
    selection_manifest["selfHash"] = _sha256_json(selection_manifest)
    selection_manifest_path = output / "selection-manifest.json"
    _write_json(selection_manifest_path, selection_manifest)
    print(
        json.dumps(
            {
                "status": "passed",
                "output": str(output),
                "manifestSha256": _sha256_file(selection_manifest_path),
                "manifestSelfHash": selection_manifest["selfHash"],
                "pilotRowsPerLane": 48,
                "confirmationRowsPerLane": 120,
            },
            sort_keys=True,
        )
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--s2-corpus-dir", required=True)
    parser.add_argument("--preregistration", required=True)
    parser.add_argument("--output-dir", required=True)
    return parser


def main() -> None:
    select(_parser().parse_args())


if __name__ == "__main__":
    main()
