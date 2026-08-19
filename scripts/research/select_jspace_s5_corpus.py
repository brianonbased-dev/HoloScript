"""Seal the preregistered, label-blind J-space S5 36/36 split.

The selector consumes only the still-unobserved S4 confirmation artifacts. It
uses sealed identifiers plus coordinate metadata, reproduces the exact frozen
table, verifies the complete S2 -> S4 provenance/evidence chain, and emits a
byte-stable manifest. It performs no model inference or semantic ranking.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path
from types import ModuleType
from typing import Any, Iterable, Mapping, Sequence


SCHEMA = "holoscript.jspace-s5-selection-manifest.v0.1.0"
S4_MANIFEST_SCHEMA = "holoscript.jspace-s4-selection-manifest.v0.1.0"
S4_EVIDENCE_SCHEMA = "holoscript.jspace-s4-pilot-evidence-manifest.v0.1.0"
S2_EVIDENCE_SCHEMA = "holoscript.jspace-s2-pilot-evidence-manifest.v0.1.0"

EXPECTED_S5_PREREGISTRATION_SHA256 = (
    "sha256:9802d838be9832aa011903ae29799f44b176820d9c12a8600d97e39e4338b599"
)
EXPECTED_S5_PREREGISTRATION_REVISION = "34eba1121a0a324e9fdbd53e0221b039246cb10d"
EXPECTED_S4_PREREGISTRATION_SHA256 = (
    "sha256:aab413a443cefbcc2dbacf5506c8fe687e4c4cde7b38fddd0d341d50ca1df930"
)
EXPECTED_S4_SELECTOR_SHA256 = (
    "sha256:36f98bb07e03b611191f2a7596c2cb00e58a44ba73ce80fcf52ec631f7ae5af6"
)
EXPECTED_S4_MANIFEST_SHA256 = (
    "sha256:addb0a5ff2e37a9507989ace490c86dfb3b1da5bbc1543c849b01932339d706f"
)
EXPECTED_S4_MANIFEST_SELF_HASH = (
    "sha256:870a25aeb2462df8c57e0291e93a9785b74d366478a881f319c0dfa76a046a20"
)
EXPECTED_S4_EVIDENCE_SHA256 = (
    "sha256:1d3ca97311f929343b6569a211324b45133934f4e05caaabd5464989f1ffcfe0"
)
EXPECTED_S4_EVIDENCE_SELF_HASH = (
    "sha256:21d7b5f82e141773fe32634ba50c62759c9929ba9386fd2ce2bbaaa76df8a38f"
)
EXPECTED_S2_PREREGISTRATION_SHA256 = (
    "sha256:3f94f416d6087bb104762a8b96de61862d423668d2f13adeee3967d91e45c431"
)
EXPECTED_S2_SELECTOR_SHA256 = (
    "sha256:d576674597db0065680206f3718c37480362d0febd62df44ce13f3cf51219952"
)
EXPECTED_S2_EVIDENCE_SHA256 = (
    "sha256:0ec48d4537f24dee6ec5bf43e0e6a5005ad9c4a13702914d2faeac768cfa7318"
)
EXPECTED_S2_EVIDENCE_SELF_HASH = (
    "sha256:56b078f581a7cfb601e9bbef05af824878b0e8f424634c61907191713ddfdffc"
)
EXPECTED_CHECKPOINT_SHA256 = (
    "sha256:abbda748c6bd6dec69bd72f25ca5ab28876fbbdbf195f218439ddbd0a10ff914"
)
EXPECTED_TOKENIZER_SHA256 = (
    "sha256:f92af6207d211728a530e95e44c60b3c95f700ea9c755ab6bd8614fbdac623d4"
)
EXPECTED_S4_CONFIRMATION_COORDINATE_SHA256 = (
    "sha256:1a5a1291a0f215c1a73f74683bbf34bef79b1ed953b8cb17e21192a46ce93ecc"
)
EXPECTED_PILOT_COORDINATE_SHA256 = (
    "sha256:fe99904c0fe98b8a42f7d7ec23612f1f9617cdf7e53467c92bb322ac4878049c"
)
EXPECTED_CONFIRMATION_COORDINATE_SHA256 = (
    "sha256:592062be0ba631607608f0b3240fc4f930928e3cae3b3172eee8c07f9d17fd82"
)

S2_REPO_DIR = "research/data/jspace-s2"
S3_REPO_DIR = "research/data/jspace-s3"
S4_REPO_DIR = "research/data/jspace-s4"
S3_MEASUREMENT_REPO_DIR = "research/measurements/jspace-s3"
S4_MEASUREMENT_REPO_DIR = "research/measurements/jspace-s4"
S2_MEASUREMENT_REPO_DIR = "research/measurements/jspace-s2"

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

S4_LANE_FILES = {
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

EXPECTED_OUTPUT_SHA256: dict[str, dict[str, str]] = {
    "pilot": {
        "a": "sha256:f744a9e445409c463288c952cf405b27c27a1bb439caabde646b72f6b4d8bace",
        "b": "sha256:077b3a39981ba27fd2d5df594f2a4e0860062a0b30a7e57e86def5779240c89d",
        "h": "sha256:4e74d069a11c27d6a254c21a627f5426a6b6c2526309868e4ae61dc119bf3e6b",
    },
    "confirmation": {
        "a": "sha256:2eaf9b5df0d59426eefee647a8993d07fd0eecb67aeabe1c07263c8a3a18bb49",
        "b": "sha256:28ae25ba2d8ebb6930da3cafac28c9f2064e24c500766dcef42b7283e73830dc",
        "h": "sha256:c238b3de16dba25f8ca645c8a3f6c15825e81781548684c434d00cfb36cca236",
    },
}

# Exact preregistered P cells, indexed by family then position bin.
PILOT_SLOT_TABLE = (
    ((5,), (5, 6), (0,), (1, 4)),
    ((2, 7), (4,), (0, 3), (0,)),
    ((3,), (2, 6), (4,), (1, 5)),
    ((0, 2), (3,), (3, 7), (5,)),
    ((6,), (0, 7), (1,), (4, 6)),
    ((1, 3), (6,), (5, 7), (2,)),
)
EXPECTED_ENDPOINT_COUNTS = {
    "pilot": (5, 4, 4, 5, 4, 5, 5, 4),
    "confirmation": (4, 5, 5, 4, 5, 4, 4, 5),
}

Coordinate = tuple[int, int, int]


def _load_s4_selector() -> ModuleType:
    path = Path(__file__).with_name("select_jspace_s4_corpus.py")
    spec = importlib.util.spec_from_file_location("_jspace_s4_selector_for_s5", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the frozen S4 selector")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


S4 = _load_s4_selector()

# Stable helper surface shared with the S5 fitter/admission code.
_sha256_bytes = S4._sha256_bytes
_sha256_file = S4._sha256_file
_sha256_json = S4._sha256_json
_read_json = S4._read_json
_read_jsonl = S4._read_jsonl
_jsonl_bytes = S4._jsonl_bytes
_write_json = S4._write_json
_require = S4._require
_verify_self_hash = S4._verify_self_hash
_set_hash = S4._set_hash
_prompt_hash = S4._prompt_hash
_identifier_sets = S4._identifier_sets
_identifier_digests = S4._identifier_digests
_coordinate = S4._coordinate
_coordinate_hash = S4._coordinate_hash
_verify_binding = S4._verify_binding
_source_binding = S4._source_binding
_merge_identifier_sets = S4._merge_identifier_sets


def _assert_binding(actual: Mapping[str, Any], expected: Mapping[str, Any], *, label: str) -> None:
    for key in (
        "sha256",
        "rowCount",
        "caseIdSetSha256",
        "promptHashSetSha256",
        "sequenceHashSetSha256",
        "coordinateSetSha256",
    ):
        if key in expected:
            _require(actual.get(key) == expected.get(key), f"{label} {key} mismatch")


def _verify_semantic_boundary(value: Any, *, label: str) -> None:
    """Reject any explicit semantic-label access marker that is not false."""

    if isinstance(value, Mapping):
        for key, child in value.items():
            if key == "semanticLabelsAccessed":
                _require(child is False, f"{label} semantic-label boundary violated")
            _verify_semantic_boundary(child, label=label)
    elif isinstance(value, list):
        for child in value:
            _verify_semantic_boundary(child, label=label)


def _verify_s4_evidence(
    measurement_dir: Path,
    manifest: Mapping[str, Any],
) -> dict[str, Any]:
    evidence_path = measurement_dir / "pilot-manifest.json"
    evidence = _read_json(evidence_path)
    _require(_sha256_file(evidence_path) == EXPECTED_S4_EVIDENCE_SHA256, "unexpected S4 evidence manifest")
    _require(evidence.get("schema") == S4_EVIDENCE_SCHEMA, "S4 evidence schema mismatch")
    _verify_self_hash(evidence, label="S4 evidence manifest")
    _require(evidence.get("selfHash") == EXPECTED_S4_EVIDENCE_SELF_HASH, "S4 evidence self-hash mismatch")
    _require(evidence.get("status") == "failed-frozen-gate", "S4 evidence is not frozen failed")
    _require(evidence.get("stage") == "pilot", "S4 evidence stage mismatch")
    _require(evidence.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "S4 evidence checkpoint mismatch")
    _require(evidence.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "S4 evidence tokenizer mismatch")
    outcome = evidence.get("outcome")
    _require(isinstance(outcome, dict) and outcome.get("passed") is False, "S4 failed outcome missing")
    _verify_semantic_boundary(evidence, label="S4 evidence")

    source_by_role = {item.get("role"): item for item in evidence.get("sources", [])}
    expected_sources = {
        "preregistration": EXPECTED_S4_PREREGISTRATION_SHA256,
        "s2-corpus-manifest": S4.EXPECTED_S2_MANIFEST_SHA256,
        "s3-selection-manifest": S4.EXPECTED_S3_MANIFEST_SHA256,
        "selection-manifest": EXPECTED_S4_MANIFEST_SHA256,
        "selection-code": EXPECTED_S4_SELECTOR_SHA256,
        "holdout-prompt-artifact": manifest["pilotArtifacts"]["h"]["sha256"],
    }
    for role, expected_hash in expected_sources.items():
        _require(source_by_role.get(role, {}).get("sha256") == expected_hash, f"S4 evidence {role} mismatch")

    promoted = evidence.get("promotedArtifacts")
    _require(isinstance(promoted, list), "S4 promoted-artifact bindings missing")
    promoted_by_name = {Path(str(item.get("path"))).name: item for item in promoted}
    expected_names = {
        "pilot-a-fit.json",
        "pilot-b-fit.json",
        "pilot-collection.json",
        "pilot-fidelity.json",
        "pilot-rows.jsonl",
        "pilot-receipts.jsonl",
    }
    _require(set(promoted_by_name) == expected_names, "S4 promoted-artifact set mismatch")
    for name, binding in promoted_by_name.items():
        path = measurement_dir / name
        _require(path.stat().st_size == binding.get("bytes"), f"S4 {name} byte count mismatch")
        _require(_sha256_file(path) == binding.get("sha256"), f"S4 {name} hash mismatch")

    for lane in ("a", "b"):
        fit = _read_json(measurement_dir / f"pilot-{lane}-fit.json")
        _verify_self_hash(fit, label=f"S4 {lane} fit receipt")
        _verify_semantic_boundary(fit, label=f"S4 {lane} fit receipt")
        binding = manifest["pilotArtifacts"][lane]
        _require(fit.get("stage") == "pilot" and fit.get("lane") == lane, f"S4 {lane} fit stage/lane mismatch")
        _require(fit.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, f"S4 {lane} fit checkpoint mismatch")
        _require(fit.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, f"S4 {lane} fit tokenizer mismatch")
        _require(fit.get("preregistrationSha256") == EXPECTED_S4_PREREGISTRATION_SHA256, f"S4 {lane} fit prereg mismatch")
        _require(fit.get("selectionManifestSha256") == EXPECTED_S4_MANIFEST_SHA256, f"S4 {lane} fit manifest mismatch")
        _require(fit.get("selectionManifestSelfHash") == EXPECTED_S4_MANIFEST_SELF_HASH, f"S4 {lane} fit self-hash mismatch")
        expected_fields = {
            "corpusArtifactSha256": binding["sha256"],
            "rowCount": binding["rowCount"],
            "caseIdSetSha256": binding["caseIdSetSha256"],
            "promptHashSetSha256": binding["promptHashSetSha256"],
            "sequenceSetSha256": binding["sequenceHashSetSha256"],
            "coordinateSetSha256": binding["coordinateSetSha256"],
        }
        for key, expected in expected_fields.items():
            _require(fit.get(key) == expected, f"S4 {lane} fit {key} mismatch")

    collection_path = measurement_dir / "pilot-collection.json"
    fidelity_path = measurement_dir / "pilot-fidelity.json"
    rows_path = measurement_dir / "pilot-rows.jsonl"
    receipts_path = measurement_dir / "pilot-receipts.jsonl"
    collection = _read_json(collection_path)
    fidelity = _read_json(fidelity_path)
    _verify_self_hash(collection, label="S4 collection manifest")
    _verify_self_hash(fidelity, label="S4 fidelity evaluation")
    _verify_semantic_boundary(collection, label="S4 collection manifest")
    _verify_semantic_boundary(fidelity, label="S4 fidelity evaluation")
    _require(fidelity.get("passed") is False, "S4 fidelity unexpectedly passed")
    _require(collection.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "S4 collection checkpoint mismatch")
    _require(collection.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "S4 collection tokenizer mismatch")
    _require(fidelity.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "S4 fidelity checkpoint mismatch")
    _require(fidelity.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "S4 fidelity tokenizer mismatch")
    h_binding = manifest["pilotArtifacts"]["h"]
    _require(collection.get("promptManifestSha256") == h_binding["sha256"], "S4 collection prompt mismatch")
    _require(collection.get("promptCount") == 48, "S4 collection prompt count mismatch")
    _require(collection.get("rowArtifactSha256") == _sha256_file(rows_path), "S4 collection row hash mismatch")
    _require(collection.get("receiptArtifactSha256") == _sha256_file(receipts_path), "S4 collection receipt hash mismatch")
    _require(fidelity.get("rowsSha256") == _sha256_file(rows_path), "S4 fidelity row hash mismatch")
    _require(fidelity.get("receiptsSha256") == _sha256_file(receipts_path), "S4 fidelity receipt hash mismatch")
    return evidence


def _verify_s2_evidence(
    measurement_dir: Path,
    manifest: Mapping[str, Any],
) -> dict[str, Any]:
    evidence_path = measurement_dir / "pilot-manifest.json"
    evidence = _read_json(evidence_path)
    _require(_sha256_file(evidence_path) == EXPECTED_S2_EVIDENCE_SHA256, "unexpected S2 evidence manifest")
    _require(evidence.get("schema") == S2_EVIDENCE_SCHEMA, "S2 evidence schema mismatch")
    _verify_self_hash(evidence, label="S2 evidence manifest")
    _require(evidence.get("selfHash") == EXPECTED_S2_EVIDENCE_SELF_HASH, "S2 evidence self-hash mismatch")
    _require(evidence.get("status") == "failed-frozen-gate", "S2 evidence is not frozen failed")
    _require(evidence.get("stage") == "pilot", "S2 evidence stage mismatch")
    _require(evidence.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "S2 evidence checkpoint mismatch")
    _require(evidence.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "S2 evidence tokenizer mismatch")
    outcome = evidence.get("outcome")
    _require(isinstance(outcome, dict) and outcome.get("passed") is False, "S2 failed outcome missing")
    _verify_semantic_boundary(evidence, label="S2 evidence")

    source_by_role = {item.get("role"): item for item in evidence.get("sources", [])}
    _require(
        source_by_role.get("preregistration", {}).get("sha256")
        == EXPECTED_S2_PREREGISTRATION_SHA256,
        "S2 evidence preregistration mismatch",
    )
    _require(
        source_by_role.get("corpus-manifest", {}).get("sha256")
        == S4.EXPECTED_S2_MANIFEST_SHA256,
        "S2 evidence corpus manifest mismatch",
    )

    promoted = evidence.get("promotedArtifacts")
    _require(isinstance(promoted, list), "S2 promoted-artifact bindings missing")
    promoted_by_name = {Path(str(item.get("path"))).name: item for item in promoted}
    expected_names = {
        "pilot-a-fit.json",
        "pilot-b-fit.json",
        "pilot-collection.json",
        "pilot-fidelity.json",
        "pilot-rows.jsonl",
        "pilot-receipts.jsonl",
    }
    _require(set(promoted_by_name) == expected_names, "S2 promoted-artifact set mismatch")
    for name, binding in promoted_by_name.items():
        path = measurement_dir / name
        _require(path.stat().st_size == binding.get("bytes"), f"S2 {name} byte count mismatch")
        _require(_sha256_file(path) == binding.get("sha256"), f"S2 {name} hash mismatch")

    for lane in ("a", "b"):
        fit = _read_json(measurement_dir / f"pilot-{lane}-fit.json")
        _verify_self_hash(fit, label=f"S2 {lane} fit receipt")
        _verify_semantic_boundary(fit, label=f"S2 {lane} fit receipt")
        binding = manifest["pilotArtifacts"][lane]
        _require(fit.get("stage") == "pilot" and fit.get("lane") == lane, f"S2 {lane} fit stage/lane mismatch")
        _require(fit.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, f"S2 {lane} fit checkpoint mismatch")
        _require(fit.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, f"S2 {lane} fit tokenizer mismatch")
        _require(fit.get("preregistrationSha256") == EXPECTED_S2_PREREGISTRATION_SHA256, f"S2 {lane} fit prereg mismatch")
        _require(fit.get("corpusManifestSha256") == S4.EXPECTED_S2_MANIFEST_SHA256, f"S2 {lane} fit manifest mismatch")
        _require(fit.get("corpusArtifactSha256") == binding["sha256"], f"S2 {lane} fit artifact mismatch")
        _require(fit.get("rowCount") == binding["rowCount"], f"S2 {lane} fit row count mismatch")

    collection_path = measurement_dir / "pilot-collection.json"
    fidelity_path = measurement_dir / "pilot-fidelity.json"
    rows_path = measurement_dir / "pilot-rows.jsonl"
    receipts_path = measurement_dir / "pilot-receipts.jsonl"
    collection = _read_json(collection_path)
    fidelity = _read_json(fidelity_path)
    _verify_self_hash(collection, label="S2 collection manifest")
    _verify_self_hash(fidelity, label="S2 fidelity evaluation")
    _verify_semantic_boundary(collection, label="S2 collection manifest")
    _verify_semantic_boundary(fidelity, label="S2 fidelity evaluation")
    _require(fidelity.get("passed") is False, "S2 fidelity unexpectedly passed")
    _require(collection.get("promptManifestSha256") == manifest["pilotArtifacts"]["h"]["sha256"], "S2 collection prompt mismatch")
    _require(collection.get("promptCount") == 24, "S2 collection prompt count mismatch")
    _require(collection.get("rowArtifactSha256") == _sha256_file(rows_path), "S2 collection row hash mismatch")
    _require(collection.get("receiptArtifactSha256") == _sha256_file(receipts_path), "S2 collection receipt hash mismatch")
    _require(fidelity.get("rowsSha256") == _sha256_file(rows_path), "S2 fidelity row hash mismatch")
    _require(fidelity.get("receiptsSha256") == _sha256_file(receipts_path), "S2 fidelity receipt hash mismatch")
    return evidence


def _verify_s4(
    s4_dir: Path,
    measurement_dir: Path,
    s3_confirmation: Mapping[str, Sequence[Mapping[str, Any]]],
    s2_manifest: Mapping[str, Any],
    s2_leakage: Mapping[str, Any],
    s2_reference: Mapping[str, Any],
    s2_exposed: Mapping[str, Sequence[Mapping[str, Any]]],
    s3_manifest: Mapping[str, Any],
    s3_pilot: Mapping[str, Sequence[Mapping[str, Any]]],
    s3_evidence: Mapping[str, Any],
) -> tuple[
    dict[str, Any],
    dict[str, list[dict[str, Any]]],
    dict[str, list[dict[str, Any]]],
    dict[str, dict[Coordinate, dict[str, Any]]],
    dict[str, Any],
]:
    repo_root = Path(__file__).resolve().parents[2]
    preregistration = repo_root / "research" / "2026-07-15-jspace-s4-centered-scalar-preregistration.md"
    selector = repo_root / "scripts" / "research" / "select_jspace_s4_corpus.py"
    manifest_path = s4_dir / "selection-manifest.json"
    manifest = _read_json(manifest_path)
    _require(_sha256_file(preregistration) == EXPECTED_S4_PREREGISTRATION_SHA256, "S4 preregistration hash mismatch")
    _require(_sha256_file(selector) == EXPECTED_S4_SELECTOR_SHA256, "S4 selector hash mismatch")
    _require(_sha256_file(manifest_path) == EXPECTED_S4_MANIFEST_SHA256, "S4 selection-manifest hash mismatch")
    _require(manifest.get("schema") == S4_MANIFEST_SCHEMA, "S4 selection schema mismatch")
    _verify_self_hash(manifest, label="S4 selection manifest")
    _require(manifest.get("selfHash") == EXPECTED_S4_MANIFEST_SELF_HASH, "S4 selection self-hash mismatch")
    _require(manifest.get("preregistrationSha256") == EXPECTED_S4_PREREGISTRATION_SHA256, "S4 prereg binding mismatch")
    _require(manifest.get("selectorSourceSha256") == EXPECTED_S4_SELECTOR_SHA256, "S4 selector binding mismatch")
    _require(manifest.get("checkpointSha256") == EXPECTED_CHECKPOINT_SHA256, "S4 checkpoint mismatch")
    _require(manifest.get("tokenizerSha256") == EXPECTED_TOKENIZER_SHA256, "S4 tokenizer mismatch")
    _verify_semantic_boundary(manifest, label="S4 selection manifest")

    source_s2 = manifest.get("sourceS2")
    _require(isinstance(source_s2, dict), "S4 source-S2 binding missing")
    _require(source_s2.get("corpusManifest", {}).get("sha256") == S4.EXPECTED_S2_MANIFEST_SHA256, "S4 S2 manifest binding mismatch")
    _require(source_s2.get("corpusManifest", {}).get("selfHash") == s2_manifest.get("selfHash"), "S4 S2 self-hash mismatch")
    _require(source_s2.get("leakageReport", {}).get("selfHash") == s2_leakage.get("selfHash"), "S4 S2 leakage self-hash mismatch")
    _require(source_s2.get("referenceManifest", {}).get("selfHash") == s2_reference.get("selfHash"), "S4 S2 reference self-hash mismatch")
    for lane in S4.S2_LANE_FILES:
        expected = _source_binding(
            f"{S2_REPO_DIR}/{S4.S2_LANE_FILES[lane][1]}",
            Path(S4.__file__).resolve().parents[2] / S2_REPO_DIR / S4.S2_LANE_FILES[lane][1],
            s2_exposed[lane],
        )
        _assert_binding(source_s2["exposedPilotArtifacts"][lane], expected, label=f"S4 S2 {lane} pilot")

    source_s3 = manifest.get("sourceS3")
    _require(isinstance(source_s3, dict), "S4 source-S3 binding missing")
    _require(source_s3.get("selectionManifest", {}).get("sha256") == S4.EXPECTED_S3_MANIFEST_SHA256, "S4 S3 manifest binding mismatch")
    _require(source_s3.get("selectionManifest", {}).get("selfHash") == s3_manifest.get("selfHash"), "S4 S3 self-hash mismatch")
    _require(source_s3.get("failedPilotEvidenceManifest", {}).get("selfHash") == s3_evidence.get("selfHash"), "S4 S3 evidence mismatch")

    pilot_by_lane: dict[str, list[dict[str, Any]]] = {}
    confirmation_by_lane: dict[str, list[dict[str, Any]]] = {}
    confirmation_maps: dict[str, dict[Coordinate, dict[str, Any]]] = {}
    for lane, (pilot_name, confirmation_name) in S4_LANE_FILES.items():
        pilot_path = s4_dir / pilot_name
        confirmation_path = s4_dir / confirmation_name
        _require(
            _sha256_file(pilot_path) == manifest["pilotArtifacts"][lane]["sha256"],
            f"S4 {lane} pilot byte hash mismatch",
        )
        _require(
            _sha256_file(confirmation_path)
            == manifest["confirmationArtifacts"][lane]["sha256"],
            f"S4 {lane} confirmation byte hash mismatch",
        )
        pilot = _read_jsonl(pilot_path)
        confirmation = _read_jsonl(confirmation_path)
        _verify_binding(pilot, pilot_path, manifest["pilotArtifacts"][lane], label=f"S4 {lane} pilot")
        _verify_binding(confirmation, confirmation_path, manifest["confirmationArtifacts"][lane], label=f"S4 {lane} confirmation")
        _require(len(pilot) == 48 and len(confirmation) == 72, f"S4 {lane} row count mismatch")
        _require(all(row.get("lane") == lane for row in pilot + confirmation), f"S4 {lane} lane mismatch")
        _require(sorted(pilot + confirmation, key=_coordinate) == list(s3_confirmation[lane]), f"S4 {lane} is not exact S3-confirmation partition")
        coordinates = [_coordinate(row) for row in confirmation]
        _require(coordinates == sorted(coordinates), f"S4 {lane} confirmation order mismatch")
        _require(_coordinate_hash(coordinates) == EXPECTED_S4_CONFIRMATION_COORDINATE_SHA256, f"S4 {lane} confirmation coordinate mismatch")
        coordinate_map = {_coordinate(row): row for row in confirmation}
        _require(len(coordinate_map) == 72, f"S4 {lane} confirmation coordinate collision")
        pilot_by_lane[lane] = pilot
        confirmation_by_lane[lane] = confirmation
        confirmation_maps[lane] = coordinate_map

        expected_pilot = _source_binding(f"{S3_REPO_DIR}/{S4.S3_LANE_FILES[lane][0]}", Path(S4.__file__).resolve().parents[2] / S3_REPO_DIR / S4.S3_LANE_FILES[lane][0], s3_pilot[lane])
        expected_confirmation = _source_binding(f"{S3_REPO_DIR}/{S4.S3_LANE_FILES[lane][1]}", Path(S4.__file__).resolve().parents[2] / S3_REPO_DIR / S4.S3_LANE_FILES[lane][1], s3_confirmation[lane])
        _assert_binding(source_s3["exposedPilotArtifacts"][lane], expected_pilot, label=f"S4 S3 {lane} pilot")
        _assert_binding(source_s3["stillUnobservedConfirmationArtifacts"][lane], expected_confirmation, label=f"S4 S3 {lane} confirmation")

    coordinate_sets = [set(value) for value in confirmation_maps.values()]
    _require(all(value == coordinate_sets[0] for value in coordinate_sets[1:]), "S4 A/B/H confirmation coordinates differ")
    evidence = _verify_s4_evidence(measurement_dir, manifest)
    return manifest, pilot_by_lane, confirmation_by_lane, confirmation_maps, evidence


def _pilot_coordinates() -> list[Coordinate]:
    coordinates = sorted(
        (family_index, bin_index, slot)
        for family_index, bins in enumerate(PILOT_SLOT_TABLE)
        for bin_index, slots in enumerate(bins)
        for slot in slots
    )
    _require(len(coordinates) == len(set(coordinates)) == 36, "S5 pilot coordinate count mismatch")
    _require(_coordinate_hash(coordinates) == EXPECTED_PILOT_COORDINATE_SHA256, "S5 pilot coordinate hash mismatch")
    return coordinates


def _balance_proof(
    coordinates: Sequence[Coordinate],
    source_coordinates: Sequence[Coordinate],
    *,
    stage: str,
) -> dict[str, Any]:
    _require(stage in ("pilot", "confirmation"), "invalid S5 stage")
    _require(coordinates == sorted(coordinates), f"S5 {stage} coordinates are not lexicographic")
    _require(len(coordinates) == len(set(coordinates)) == 36, f"S5 {stage} row count mismatch")
    by_cell = Counter((family, bin_index) for family, bin_index, _ in coordinates)
    expected_cells = Counter(
        {
            (family, bin_index): 1 + ((family + bin_index) % 2)
            if stage == "pilot"
            else 2 - ((family + bin_index) % 2)
            for family in range(6)
            for bin_index in range(4)
        }
    )
    _require(by_cell == expected_cells, f"S5 {stage} cell quota mismatch")
    by_family = Counter(family for family, _, _ in coordinates)
    by_bin = Counter(bin_index for _, bin_index, _ in coordinates)
    by_endpoint = Counter(slot for _, _, slot in coordinates)
    by_form = Counter(ENDPOINT_SLOTS[slot][1] for _, _, slot in coordinates)
    by_variant = Counter(ENDPOINT_SLOTS[slot][2] for _, _, slot in coordinates)
    _require(by_family == Counter({index: 6 for index in range(6)}), f"S5 {stage} family balance mismatch")
    _require(by_bin == Counter({index: 9 for index in range(4)}), f"S5 {stage} bin balance mismatch")
    _require(tuple(by_endpoint[index] for index in range(8)) == EXPECTED_ENDPOINT_COUNTS[stage], f"S5 {stage} endpoint counts mismatch")
    _require(by_form == Counter({f"form_{index}": 9 for index in range(4)}), f"S5 {stage} task-form balance mismatch")
    _require(by_variant == Counter({0: 18, 1: 18}), f"S5 {stage} variant balance mismatch")

    source_bin_endpoint = Counter((bin_index, slot) for _, bin_index, slot in source_coordinates)
    selected_bin_endpoint = Counter((bin_index, slot) for _, bin_index, slot in coordinates)
    for key, count in source_bin_endpoint.items():
        if count >= 2:
            _require(0 < selected_bin_endpoint[key] < count, f"S5 {stage} bin/endpoint coverage mismatch {key}")
    _require(
        sum(selected_bin_endpoint[(0, slot)] for slot in (0, 4)) == 1,
        f"S5 {stage} bin-0 singleton split mismatch",
    )
    _require(
        sum(selected_bin_endpoint[(1, slot)] for slot in (1, 5)) == 1,
        f"S5 {stage} bin-1 singleton split mismatch",
    )
    unique_by_family = {
        family: len({slot for selected_family, _, slot in coordinates if selected_family == family})
        for family in range(6)
    }
    _require(all(count >= 5 for count in unique_by_family.values()), f"S5 {stage} family endpoint diversity mismatch")
    return {
        "coordinateSetSha256": _coordinate_hash(coordinates),
        "rowCount": len(coordinates),
        "rowsPerFamily": {FAMILIES[index]: by_family[index] for index in range(6)},
        "rowsPerPositionBin": {str(index): by_bin[index] for index in range(4)},
        "rowsPerCell": {
            FAMILIES[family]: {str(bin_index): by_cell[(family, bin_index)] for bin_index in range(4)}
            for family in range(6)
        },
        "endpointProfileCounts": {ENDPOINT_SLOTS[index][0]: by_endpoint[index] for index in range(8)},
        "taskFormCounts": {f"form_{index}": by_form[f"form_{index}"] for index in range(4)},
        "variantCounts": {str(index): by_variant[index] for index in range(2)},
        "minimumUniqueEndpointProfilesPerFamily": min(unique_by_family.values()),
        "allRepeatedBinEndpointPairsSplitAcrossStages": True,
        "registeredSingletonPairsSplitAcrossStages": True,
    }


def _artifact_binding(path: Path, rows: Sequence[Mapping[str, Any]], coordinates: Sequence[Coordinate]) -> dict[str, Any]:
    return {
        "file": path.name,
        "sha256": _sha256_file(path),
        "coordinateSetSha256": _coordinate_hash(coordinates),
        **_identifier_digests(rows),
    }


def _promoted_bindings(evidence: Mapping[str, Any]) -> dict[str, Any]:
    return {
        Path(str(item["path"])).name: {
            "file": str(item["path"]),
            "bytes": item["bytes"],
            "sha256": item["sha256"],
        }
        for item in evidence["promotedArtifacts"]
    }


def select(args: argparse.Namespace) -> None:
    s2_dir = Path(args.s2_corpus_dir).resolve()
    s2_measurements = Path(args.s2_measurement_dir).resolve()
    s3_dir = Path(args.s3_corpus_dir).resolve()
    s3_measurements = Path(args.s3_measurement_dir).resolve()
    s4_dir = Path(args.s4_corpus_dir).resolve()
    s4_measurements = Path(args.s4_measurement_dir).resolve()
    preregistration = Path(args.preregistration).resolve()
    output = Path(args.output_dir).resolve()

    _require(preregistration.name == "2026-07-15-jspace-s5-unscaled-centered-preregistration.md", "unexpected S5 preregistration")
    _require(preregistration.is_file(), "S5 preregistration is missing")
    _require(_sha256_file(preregistration) == EXPECTED_S5_PREREGISTRATION_SHA256, "S5 preregistration byte hash mismatch")
    _require(not output.exists() or not any(output.iterdir()), "output directory must be absent or empty")

    s2_manifest, s2_leakage, s2_reference, s2_full, s2_exposed = S4._verify_s2(s2_dir)
    repo_root = Path(__file__).resolve().parents[2]
    s2_preregistration = repo_root / "research" / "2026-07-15-jspace-s2-varied-endpoint-preregistration.md"
    s2_selector = repo_root / "scripts" / "research" / "generate_jspace_s2_corpus.py"
    _require(_sha256_file(s2_preregistration) == EXPECTED_S2_PREREGISTRATION_SHA256, "S2 preregistration hash mismatch")
    _require(_sha256_file(s2_selector) == EXPECTED_S2_SELECTOR_SHA256, "S2 selector hash mismatch")
    _require(s2_manifest.get("preregistrationSha256") == EXPECTED_S2_PREREGISTRATION_SHA256, "S2 prereg binding mismatch")
    _require(s2_manifest.get("generatorSourceSha256") == EXPECTED_S2_SELECTOR_SHA256, "S2 selector binding mismatch")
    s2_evidence = _verify_s2_evidence(s2_measurements, s2_manifest)
    s3_manifest, s3_pilot, s3_confirmation, _, s3_evidence = S4._verify_s3(
        s2_full,
        s2_exposed,
        s2_manifest,
        s2_leakage,
        s2_reference,
        s3_dir,
        s3_measurements,
    )
    s4_manifest, s4_pilot, s4_confirmation, coordinate_maps, s4_evidence = _verify_s4(
        s4_dir,
        s4_measurements,
        s3_confirmation,
        s2_manifest,
        s2_leakage,
        s2_reference,
        s2_exposed,
        s3_manifest,
        s3_pilot,
        s3_evidence,
    )

    source_coordinate_set = set(next(iter(coordinate_maps.values())))
    _require(all(set(value) == source_coordinate_set for value in coordinate_maps.values()), "S4-confirmation A/B/H coordinates differ")
    by_cell = Counter((family, bin_index) for family, bin_index, _ in source_coordinate_set)
    _require(by_cell == Counter({(family, bin_index): 3 for family in range(6) for bin_index in range(4)}), "S4 source is not three rows per cell")
    pilot_coordinates = _pilot_coordinates()
    _require(set(pilot_coordinates) <= source_coordinate_set, "S5 pilot table is not contained in S4 confirmation")
    confirmation_coordinates = sorted(source_coordinate_set - set(pilot_coordinates))
    _require(len(confirmation_coordinates) == 36, "S5 confirmation does not contain 36 rows")
    _require(
        _coordinate_hash(confirmation_coordinates) == EXPECTED_CONFIRMATION_COORDINATE_SHA256,
        "S5 confirmation coordinate hash mismatch",
    )
    pilot_proof = _balance_proof(pilot_coordinates, sorted(source_coordinate_set), stage="pilot")
    confirmation_proof = _balance_proof(confirmation_coordinates, sorted(source_coordinate_set), stage="confirmation")

    selected: dict[str, dict[str, list[dict[str, Any]]]] = {"pilot": {}, "confirmation": {}}
    for lane in S4_LANE_FILES:
        selected["pilot"][lane] = [coordinate_maps[lane][coordinate] for coordinate in pilot_coordinates]
        selected["confirmation"][lane] = [coordinate_maps[lane][coordinate] for coordinate in confirmation_coordinates]
        _require(
            sorted(selected["pilot"][lane] + selected["confirmation"][lane], key=_coordinate) == s4_confirmation[lane],
            f"S5 {lane} is not the exact ordered S4-confirmation partition",
        )

    exposed_global = {key: set() for key in ("caseId", "promptHash", "sequenceHash")}
    exposed_rows = list(s2_exposed.values()) + list(s3_pilot.values()) + list(s4_pilot.values())
    for rows in exposed_rows:
        _merge_identifier_sets(exposed_global, rows)
    exposed_binding = {
        "rowCountAcrossInputArtifacts": sum(len(rows) for rows in exposed_rows),
        "uniqueCaseIdCount": len(exposed_global["caseId"]),
        "caseIdSetSha256": _set_hash(exposed_global["caseId"]),
        "uniquePromptHashCount": len(exposed_global["promptHash"]),
        "promptHashSetSha256": _set_hash(exposed_global["promptHash"]),
        "uniqueSequenceHashCount": len(exposed_global["sequenceHash"]),
        "sequenceHashSetSha256": _set_hash(exposed_global["sequenceHash"]),
    }

    combined_ids: dict[str, dict[str, set[str]]] = {}
    for lane in S4_LANE_FILES:
        combined = selected["pilot"][lane] + selected["confirmation"][lane]
        identifiers = _identifier_sets(combined)
        combined_ids[lane] = identifiers
        for key, values in identifiers.items():
            _require(not values & exposed_global[key], f"S5 {lane} overlaps exposed S2/S3/S4 {key}")
        pilot_ids = _identifier_sets(selected["pilot"][lane])
        confirmation_ids = _identifier_sets(selected["confirmation"][lane])
        for key in pilot_ids:
            _require(not pilot_ids[key] & confirmation_ids[key], f"S5 {lane} pilot/confirmation {key} overlap")

    pairwise_overlaps: dict[str, dict[str, int]] = {}
    lanes = tuple(S4_LANE_FILES)
    for left_index, left in enumerate(lanes):
        for right in lanes[left_index + 1 :]:
            pair = f"{left}:{right}"
            pairwise_overlaps[pair] = {}
            for key in combined_ids[left]:
                overlap = combined_ids[left][key] & combined_ids[right][key]
                pairwise_overlaps[pair][key] = len(overlap)
                _require(not overlap, f"S5 lanes {left}/{right} overlap by {key}")

    encoded: dict[str, dict[str, bytes]] = {"pilot": {}, "confirmation": {}}
    for stage in ("pilot", "confirmation"):
        for lane in S4_LANE_FILES:
            artifact = _jsonl_bytes(selected[stage][lane])
            expected = EXPECTED_OUTPUT_SHA256.get(stage, {}).get(lane)
            if expected is not None:
                _require(_sha256_bytes(artifact) == expected, f"S5 {stage} {lane} preregistered artifact hash mismatch")
            encoded[stage][lane] = artifact

    output.mkdir(parents=True, exist_ok=True)
    artifact_bindings: dict[str, dict[str, Any]] = {"pilot": {}, "confirmation": {}}
    for stage, coordinates in (("pilot", pilot_coordinates), ("confirmation", confirmation_coordinates)):
        for lane in S4_LANE_FILES:
            path = output / OUTPUT_FILES[stage][lane]
            path.write_bytes(encoded[stage][lane])
            artifact_bindings[stage][lane] = _artifact_binding(path, selected[stage][lane], coordinates)

    source_s4_confirmation = {
        lane: _source_binding(
            f"{S4_REPO_DIR}/{S4_LANE_FILES[lane][1]}",
            s4_dir / S4_LANE_FILES[lane][1],
            s4_confirmation[lane],
        )
        for lane in S4_LANE_FILES
    }
    source_s4_pilot = {
        lane: _source_binding(
            f"{S4_REPO_DIR}/{S4_LANE_FILES[lane][0]}",
            s4_dir / S4_LANE_FILES[lane][0],
            s4_pilot[lane],
        )
        for lane in S4_LANE_FILES
    }

    source_s2 = dict(s4_manifest["sourceS2"])
    source_s2.update(
        {
            "preregistration": {
                "file": "research/2026-07-15-jspace-s2-varied-endpoint-preregistration.md",
                "sha256": EXPECTED_S2_PREREGISTRATION_SHA256,
            },
            "selector": {
                "file": "scripts/research/generate_jspace_s2_corpus.py",
                "sha256": EXPECTED_S2_SELECTOR_SHA256,
            },
            "failedPilotEvidenceManifest": {
                "file": f"{S2_MEASUREMENT_REPO_DIR}/pilot-manifest.json",
                "sha256": EXPECTED_S2_EVIDENCE_SHA256,
                "selfHash": EXPECTED_S2_EVIDENCE_SELF_HASH,
                "status": "failed-frozen-gate",
            },
            "promotedObservationArtifacts": _promoted_bindings(s2_evidence),
        }
    )

    selection_manifest: dict[str, Any] = {
        "schema": SCHEMA,
        "preregistrationSha256": EXPECTED_S5_PREREGISTRATION_SHA256,
        "preregistrationGitRevision": EXPECTED_S5_PREREGISTRATION_REVISION,
        "selectorSourceSha256": _sha256_file(Path(__file__).resolve()),
        "semanticLabelsAccessed": False,
        "checkpointSha256": EXPECTED_CHECKPOINT_SHA256,
        "tokenizerSha256": EXPECTED_TOKENIZER_SHA256,
        "positionBins": [list(value) for value in POSITION_BINS],
        "sourceS2": source_s2,
        "sourceS3": s4_manifest["sourceS3"],
        "sourceS4": {
            "semanticLabelsAccessed": False,
            "preregistration": {
                "file": "research/2026-07-15-jspace-s4-centered-scalar-preregistration.md",
                "sha256": EXPECTED_S4_PREREGISTRATION_SHA256,
            },
            "selector": {
                "file": "scripts/research/select_jspace_s4_corpus.py",
                "sha256": EXPECTED_S4_SELECTOR_SHA256,
            },
            "selectionManifest": {
                "file": f"{S4_REPO_DIR}/selection-manifest.json",
                "sha256": EXPECTED_S4_MANIFEST_SHA256,
                "selfHash": EXPECTED_S4_MANIFEST_SELF_HASH,
            },
            "exposedPilotArtifacts": source_s4_pilot,
            "stillUnobservedConfirmationArtifacts": source_s4_confirmation,
            "failedPilotEvidenceManifest": {
                "file": f"{S4_MEASUREMENT_REPO_DIR}/pilot-manifest.json",
                "sha256": EXPECTED_S4_EVIDENCE_SHA256,
                "selfHash": EXPECTED_S4_EVIDENCE_SELF_HASH,
                "status": "failed-frozen-gate",
            },
            "promotedObservationArtifacts": _promoted_bindings(s4_evidence),
        },
        "selector": {
            "familyOrder": list(FAMILIES),
            "positionBins": [list(value) for value in POSITION_BINS],
            "endpointSlots": [
                {"slot": slot, "profile": profile, "taskForm": form, "variant": variant}
                for slot, (profile, form, variant) in enumerate(ENDPOINT_SLOTS)
            ],
            "pilotSlotTable": [[[slot for slot in slots] for slots in bins] for bins in PILOT_SLOT_TABLE],
            "quota": "q(f,b)=1+((f+b) mod 2)",
            "coordinateOrder": "lexicographic [familyIndex,positionBinIndex,endpointSlot]",
            "confirmationRule": "exact ordered complement within sealed S4 confirmation",
            "ranking": None,
            "semanticFieldsInspected": [],
        },
        "identifierHashing": {
            "promptHash": "sha256(exact prompt UTF-8; digest only, never selected or ranked by content)",
            "setDigest": "sha256(canonical JSON of sorted unique strings)",
            "coordinateSetDigest": "sha256(canonical JSON of sorted unique [familyIndex,positionBinIndex,endpointSlot] arrays)",
        },
        "pilotArtifacts": artifact_bindings["pilot"],
        "confirmationArtifacts": artifact_bindings["confirmation"],
        "proof": {
            "sourceRowsAreExactSealedS4ConfirmationMembers": True,
            "fullS2ThroughS4ProvenanceReverified": True,
            "noPromptGenerationEditsSemanticRankingOrModelObservation": True,
            "coordinatesIdenticalAcrossLanes": True,
            "coordinateOrderExact": True,
            "pilot": pilot_proof,
            "confirmation": confirmation_proof,
            "exposedObservationUnion": exposed_binding,
            "zeroOverlapWithExposedS2S3S4ByCaseIdPromptHashAndSequenceHash": True,
            "zeroPilotConfirmationOverlapByCaseIdPromptHashAndSequenceHash": True,
            "selectedLanesPairwiseDisjoint": pairwise_overlaps,
        },
        "selfHash": None,
    }
    _verify_semantic_boundary(selection_manifest, label="S5 selection manifest")
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
                "pilotRowsPerLane": 36,
                "confirmationRowsPerLane": 36,
                "semanticLabelsAccessed": False,
            },
            sort_keys=True,
        )
    )


def _parser() -> argparse.ArgumentParser:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--s2-corpus-dir", default=str(repo_root / S2_REPO_DIR))
    parser.add_argument("--s2-measurement-dir", default=str(repo_root / S2_MEASUREMENT_REPO_DIR))
    parser.add_argument("--s3-corpus-dir", default=str(repo_root / S3_REPO_DIR))
    parser.add_argument("--s3-measurement-dir", default=str(repo_root / S3_MEASUREMENT_REPO_DIR))
    parser.add_argument("--s4-corpus-dir", default=str(repo_root / S4_REPO_DIR))
    parser.add_argument("--s4-measurement-dir", default=str(repo_root / S4_MEASUREMENT_REPO_DIR))
    parser.add_argument(
        "--preregistration",
        default=str(repo_root / "research" / "2026-07-15-jspace-s5-unscaled-centered-preregistration.md"),
    )
    parser.add_argument("--output-dir", required=True)
    return parser


def main() -> None:
    select(_parser().parse_args())


if __name__ == "__main__":
    main()
