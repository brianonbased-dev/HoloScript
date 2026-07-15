"""Leakage-aware collection and evaluation for model-workspace signal receipts.

`collect` accepts a prompt-only manifest and never opens labels. `evaluate`
joins a separate label manifest after receipt rows have been sealed. This keeps
blind scoring mechanically separate from label unsealing while preserving every
layer/position scalar needed for later audits.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import random
import re
import subprocess
import tempfile
from typing import Any, Iterable, Sequence
from urllib.request import Request, urlopen

import numpy as np

from holoserve.workspace_probe import (
    JACOBIAN_LENS_ESTIMATOR_V2,
    JACOBIAN_LENS_ESTIMATOR_V3,
    JACOBIAN_LENS_ESTIMATOR_V4,
    JACOBIAN_LENS_S5_EXPERIMENT_PROFILE,
    JACOBIAN_LENS_V2_TRANSPORT_PROFILE,
    JACOBIAN_LENS_V3_TRANSPORT_PROFILE,
    JACOBIAN_LENS_V4_TRANSPORT_PROFILE,
    MODEL_WORKSPACE_CAPABILITY_SCHEMA,
    MODEL_WORKSPACE_CONTROL_PROFILE,
    MODEL_WORKSPACE_MEASUREMENT_PROFILE,
    MODEL_WORKSPACE_RECEIPT_SCHEMA,
    MODEL_WORKSPACE_SCORE_PROFILE,
    sha256_json,
)


MEASUREMENT_E8 = 100_000_000
MAX_SAFE_INTEGER = (1 << 53) - 1
MAX_PROMPT_TOKENS = 512
MAX_WORKSPACE_TOP_K = 25
MAX_WORKSPACE_POSITIONS = 4
MAX_JENSEN_SHANNON_NATS_E8 = round(math.log(2) * MEASUREMENT_E8)
MODEL_WORKSPACE_HASH_CANONICALIZATION = "holoscript.integer-measurement-json.v0.1.0"
COLLECTION_SCHEMA = "holoserve.workspace-signal-collection.v0.1.0"
EVALUATION_SCHEMA = "holoserve.workspace-signal-evaluation.v0.1.0"
FRESH_MANIFEST_SCHEMA = "holoserve.workspace-signal-fresh-manifest.v0.1.0"
FRESH_REPORT_SCHEMA = "holoserve.workspace-signal-fresh-corpus-report.v0.1.0"
LEGACY_COMPARATOR_PROFILE = "normalized-union-top-k-add-one-e8-jsd-nats-v1"
BOOTSTRAP_METHOD = "whole-vertical-resampling-v1"
FRESH_BOOTSTRAP_SAMPLES = 10_000
FRESH_BOOTSTRAP_SEED = 4_731_550_821_279_453_854
FRESH_FRAMES = ("unprimed", "primed")
FRESH_ALIASES = ("a", "b")
FRESH_PRIMARY = {"frame": "unprimed", "modelAlias": "a"}
IMPLEMENTATION_SOURCE_ROOTS = ("packages/holoserve-py/holoserve",)
IMPLEMENTATION_STATIC_PATHS = ("packages/holoserve-py/pyproject.toml",)
EXPOSED_FIXTURE_BUNDLE_SHA256 = (
    "sha256:3a0fc862bb55117b48914ab4121ae6ae19d501bc39d46813a39e9eeca32f801e"
)
FORBIDDEN_PROMPT_FIELDS = {
    "label",
    "labels",
    "positive",
    "solvable",
    "intended",
    "target",
    "groundTruth",
}
FORBIDDEN_RECEIPT_FIELDS = {
    "activation",
    "activations",
    "conscious",
    "consciousness",
    "direction",
    "hiddenstate",
    "hiddenstates",
    "intent",
    "intervention",
    "residual",
    "residuals",
    "safe",
    "sentient",
    "strength",
    "truth",
    "vector",
}
ALLOWED_PUBLIC_TARGET_MEASUREMENT_FIELDS = {
    "anchortargetjensenshannondivergencenatse8",
    "controltargetjensenshannondivergencenatse8",
    "mappedtargetjensenshannondivergencenatse8",
    "targetentropynatse8",
    "targetjensenshannondivergencenatse8",
    "targetmaxprobabilitye8",
    "targettoptokenid",
}
PRIVATE_SCALAR_SHORT_NAMES = {"b", "c", "ci", "jbar", "m", "s", "si", "xbar", "ybar"}
PUBLIC_SCALAR_TRANSPORT_CONTROL_PARENT = re.compile(
    r"^observation\.layers\[\d+\]\.transportControlMetrics$"
)
ENDPOINT_ESTIMATOR_TRANSPORT_PROFILES = {
    JACOBIAN_LENS_ESTIMATOR_V2: JACOBIAN_LENS_V2_TRANSPORT_PROFILE,
    JACOBIAN_LENS_ESTIMATOR_V3: JACOBIAN_LENS_V3_TRANSPORT_PROFILE,
    JACOBIAN_LENS_ESTIMATOR_V4: JACOBIAN_LENS_V4_TRANSPORT_PROFILE,
}
GAP_PRIME = (
    " If the scene is underdetermined, or the obligations conflict with no precedence, or the"
    " dependencies form a cycle so that no single answer follows, do NOT commit an answer."
    ' Instead output exactly {"status":"unresolvable","reason":"underdetermined|'
    'unprioritized_conflict|cyclic_dependency|missing_precondition","obstruction":'
    '"<what is missing or conflicting>"}.'
)
BENEFICIARY_GAP_PRIME = (
    " Preserve the beneficiary output contract: resolved answers carry `served` and"
    " `human_floor`; abstentions carry `reason`, the family-scoped `code`"
    " (`beneficiary.unstated_impact` or `beneficiary.benefit_harm_conflict`), and an"
    " `obstruction`."
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def _is_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and value.startswith("sha256:")
        and len(value) == 71
        and all(character in "0123456789abcdef" for character in value[7:])
    )


def _is_int(value: Any, *, minimum: int | None = None, maximum: int | None = None) -> bool:
    if type(value) is not int or abs(value) > MAX_SAFE_INTEGER:
        return False
    return (minimum is None or value >= minimum) and (maximum is None or value <= maximum)


def _is_e8_probability(value: Any) -> bool:
    return _is_int(value, minimum=0, maximum=MEASUREMENT_E8)


def _is_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def _normalized_positions(requested: Sequence[int], token_count: int) -> list[int]:
    normalized = [position + token_count if position < 0 else position for position in requested]
    if any(position < 0 or position >= token_count for position in normalized):
        raise ValueError("requested workspace position is outside the observed token sequence")
    if len(set(normalized)) != len(normalized):
        raise ValueError("requested workspace positions resolve to duplicate coordinates")
    return normalized


def _supported_estimator(value: dict[str, Any]) -> bool:
    return (
        value.get("estimator") == "explicit_pair_average_v0" and value.get("paperParity") is False
    ) or (
        value.get("estimator") == "corpus_position_average_v1"
        and value.get("paperParity") is True
        and value.get("parityScope") == "reference-estimator-only"
        and value.get("paperExperimentParity") is False
    ) or (
        value.get("estimator") in ENDPOINT_ESTIMATOR_TRANSPORT_PROFILES
        and value.get("paperParity") is False
        and value.get("transportProfile")
        == ENDPOINT_ESTIMATOR_TRANSPORT_PROFILES[value["estimator"]]
    )


def _supported_position_policy(estimator: Any, position_policy: Any) -> bool:
    return (
        estimator == "explicit_pair_average_v0"
        and position_policy == "explicit-source-target-pairs"
    ) or (
        estimator == "corpus_position_average_v1"
        and position_policy == "all-valid-current-and-future-targets"
    ) or (
        estimator in ENDPOINT_ESTIMATOR_TRANSPORT_PROFILES
        and position_policy == "endpoint-self-only"
    )


def _supported_endpoint_position_bins(value: Any) -> bool:
    return (
        isinstance(value, list)
        and bool(value)
        and all(
            isinstance(item, list)
            and len(item) == 2
            and all(_is_int(bound, minimum=0, maximum=MAX_PROMPT_TOKENS - 1) for bound in item)
            and item[0] <= item[1]
            for item in value
        )
        and value[0][0] == 0
        and all(left[1] + 1 == right[0] for left, right in zip(value, value[1:]))
    )


def _find_forbidden_receipt_fields(value: Any, path: str = "") -> list[str]:
    if isinstance(value, list):
        return [
            found
            for index, child in enumerate(value)
            for found in _find_forbidden_receipt_fields(child, f"{path}[{index}]")
        ]
    if not isinstance(value, dict):
        return []
    found = []
    for key, child in value.items():
        child_path = f"{path}.{key}" if path else key
        if key.casefold() in FORBIDDEN_RECEIPT_FIELDS:
            found.append(child_path)
        found.extend(_find_forbidden_receipt_fields(child, child_path))
    return found


def _find_private_scalar_fields(value: Any, path: str = "") -> list[str]:
    if isinstance(value, list):
        return [
            found
            for index, child in enumerate(value)
            for found in _find_private_scalar_fields(child, f"{path}[{index}]")
        ]
    if not isinstance(value, dict):
        return []
    found = []
    for key, child in value.items():
        child_path = f"{path}.{key}" if path else key
        normalized_key = "".join(character for character in key.casefold() if character.isalnum())
        public_scalar_transport_control = (
            normalized_key in {"scalarcalibrated", "scalaridentity"}
            and PUBLIC_SCALAR_TRANSPORT_CONTROL_PARENT.fullmatch(path) is not None
        )
        private_artifact_shape = (
            normalized_key in PRIVATE_SCALAR_SHORT_NAMES
            or "alpha" in normalized_key
            or "beta" in normalized_key
            or ("scalar" in normalized_key and not public_scalar_transport_control)
            or "statistic" in normalized_key
            or normalized_key in {"stat", "stats"}
            or normalized_key.endswith("stats")
            or "matri" in normalized_key
            or "bias" in normalized_key
            or "source" in normalized_key
            or "mean" in normalized_key
            or "ridge" in normalized_key
            or "clipbound" in normalized_key
            or "sample" in normalized_key
            or "sequence" in normalized_key
            or (
                "target" in normalized_key
                and normalized_key not in ALLOWED_PUBLIC_TARGET_MEASUREMENT_FIELDS
            )
        )
        if private_artifact_shape:
            found.append(child_path)
        found.extend(_find_private_scalar_fields(child, child_path))
    return found


def _self_hash_matches(value: dict[str, Any]) -> bool:
    return _is_sha256(value.get("selfHash")) and value["selfHash"] == sha256_json(
        {**value, "selfHash": None}
    )


def _read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    rows = []
    for line_number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{line_number} must be a JSON object")
        rows.append(value)
    return rows


def _read_json(path: str | Path) -> dict[str, Any]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must be a JSON object")
    return value


def _write_json_atomic(path: str | Path, value: Any) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False)
    _write_text_atomic(target, encoded + "\n")


def _write_jsonl_atomic(path: str | Path, rows: Iterable[dict[str, Any]]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    encoded = "".join(
        json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
        + "\n"
        for row in rows
    )
    _write_text_atomic(target, encoded)


def _write_text_atomic(target: Path, text: str) -> None:
    handle, temporary = tempfile.mkstemp(
        prefix=f".{target.name}.", suffix=".tmp", dir=target.parent
    )
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def _http_json(endpoint: str, path: str, body: dict[str, Any] | None = None) -> Any:
    url = f"{endpoint.rstrip('/')}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        url,
        data=data,
        headers={"content-type": "application/json"} if data is not None else {},
        method="POST" if data is not None else "GET",
    )
    with urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def _parse_model_binding(value: str) -> dict[str, str]:
    parts = value.split("=", 2)
    if len(parts) != 3 or not all(parts) or not _is_sha256(parts[2]):
        raise argparse.ArgumentTypeError("model binding must be ALIAS=MODEL_ID=sha256:<digest>")
    return {"alias": parts[0], "modelId": parts[1], "lensSha256": parts[2]}


def integer_mean_e8(values: Sequence[int]) -> int:
    if not values:
        raise ValueError("cannot average an empty E8 sequence")
    total = sum(values)
    if total >= 0:
        return (total + len(values) // 2) // len(values)
    return -((-total + len(values) // 2) // len(values))


def _validate_prompt_manifest(rows: list[dict[str, Any]]) -> None:
    coordinates = set()
    for index, row in enumerate(rows):
        forbidden = sorted(FORBIDDEN_PROMPT_FIELDS.intersection(row))
        if forbidden:
            raise ValueError(f"prompt row {index} exposes label fields: {forbidden}")
        required = ("caseId", "vertical", "templateId", "frame", "prompt")
        if any(not isinstance(row.get(field), str) or not row[field] for field in required):
            raise ValueError(f"prompt row {index} has incomplete string identity fields")
        coordinate = (row["caseId"], row["frame"])
        if coordinate in coordinates:
            raise ValueError(f"duplicate prompt coordinate: {coordinate}")
        coordinates.add(coordinate)


def _model_policy(models: Sequence[dict[str, str]]) -> list[dict[str, str]]:
    return [
        {
            "alias": model["alias"],
            "modelId": model["modelId"],
            "lensSha256": model["lensSha256"],
        }
        for model in sorted(models, key=lambda item: item["alias"])
    ]


def _git_repository(path: str | Path) -> Path:
    try:
        return Path(
            subprocess.run(
                ["git", "-C", str(path), "rev-parse", "--show-toplevel"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
        ).resolve()
    except subprocess.CalledProcessError as error:
        raise ValueError("implementation is not inside a resolvable Git repository") from error


def _implementation_policy(code_revision: str) -> dict[str, Any]:
    if (
        not isinstance(code_revision, str)
        or len(code_revision) != 40
        or any(character not in "0123456789abcdef" for character in code_revision)
    ):
        raise ValueError("fresh implementation revision must be an exact Git commit")
    repository = _git_repository(Path(__file__).resolve().parent)
    try:
        resolved = subprocess.run(
            ["git", "-C", str(repository), "rev-parse", f"{code_revision}^{{commit}}"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except subprocess.CalledProcessError as error:
        raise ValueError("fresh implementation revision cannot be resolved") from error
    if resolved != code_revision:
        raise ValueError("fresh implementation revision is not the requested exact commit")
    committed_paths = set(IMPLEMENTATION_STATIC_PATHS)
    current_paths = set(IMPLEMENTATION_STATIC_PATHS)
    for source_root in IMPLEMENTATION_SOURCE_ROOTS:
        try:
            committed_listing = subprocess.run(
                [
                    "git",
                    "-C",
                    str(repository),
                    "ls-tree",
                    "-r",
                    "--name-only",
                    resolved,
                    "--",
                    source_root,
                ],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.splitlines()
        except subprocess.CalledProcessError as error:
            raise ValueError(
                f"fresh implementation source tree cannot be enumerated: {source_root}"
            ) from error
        committed_paths.update(
            path.replace("\\", "/") for path in committed_listing if path.endswith(".py")
        )
        current_root = repository / source_root
        current_paths.update(
            path.relative_to(repository).as_posix() for path in current_root.rglob("*.py")
        )
    if committed_paths != current_paths:
        added = sorted(current_paths - committed_paths)
        removed = sorted(committed_paths - current_paths)
        raise ValueError(
            "fresh implementation source tree is dirty or mismatched: "
            f"added={added}, removed={removed}"
        )
    sources = {}
    for relative_path in sorted(committed_paths):
        current_path = repository / relative_path
        try:
            committed = subprocess.run(
                ["git", "-C", str(repository), "show", f"{resolved}:{relative_path}"],
                check=True,
                capture_output=True,
            ).stdout
        except subprocess.CalledProcessError as error:
            raise ValueError(f"fresh implementation source is absent at {relative_path}") from error
        current = current_path.read_bytes()
        if current != committed:
            raise ValueError(f"fresh implementation source is dirty or mismatched: {relative_path}")
        sources[relative_path] = f"sha256:{hashlib.sha256(current).hexdigest()}"
    return {"revision": resolved, "sources": sources}


def _run_policy(
    *,
    layers: Sequence[int],
    positions: Sequence[int],
    k: int,
    implementation: dict[str, Any],
) -> dict[str, Any]:
    return {
        "frames": list(FRESH_FRAMES),
        "primaryCell": FRESH_PRIMARY,
        "layers": list(layers),
        "positions": list(positions),
        "k": k,
        "maximumTokenCount": MAX_PROMPT_TOKENS,
        "allowTruncated": False,
        "measurementProfile": MODEL_WORKSPACE_MEASUREMENT_PROFILE,
        "controlProfile": MODEL_WORKSPACE_CONTROL_PROFILE,
        "scoreProfile": MODEL_WORKSPACE_SCORE_PROFILE,
        "legacyComparatorProfile": LEGACY_COMPARATOR_PROFILE,
        "implementation": implementation,
        "bootstrap": {
            "method": BOOTSTRAP_METHOD,
            "samples": FRESH_BOOTSTRAP_SAMPLES,
            # This preregistered seed is larger than JavaScript's safe integer range.
            # Keep the manifest representation decimal and parse it only at the RNG edge.
            "seed": str(FRESH_BOOTSTRAP_SEED),
        },
    }


def _validate_fresh_prompt_matrix(prompts: list[dict[str, Any]], report: dict[str, Any]) -> None:
    required_keys = {"caseId", "vertical", "templateId", "frame", "prompt"}
    by_case: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in prompts:
        if set(row) != required_keys:
            raise ValueError("fresh prompt rows must use the exact prompt-only field contract")
        by_case[row["caseId"]].append(row)
    if set(by_case) != {row["caseId"] for row in prompts}:
        raise ValueError("fresh prompt case identities are malformed")
    for case_id, case_rows in by_case.items():
        if {row["frame"] for row in case_rows} != set(FRESH_FRAMES) or len(case_rows) != 2:
            raise ValueError(f"fresh case {case_id} lacks the exact unprimed/primed frame pair")
        if (
            len({row["vertical"] for row in case_rows}) != 1
            or len({row["templateId"] for row in case_rows}) != 1
        ):
            raise ValueError(f"fresh case {case_id} changes identity across frames")
        indexed = {row["frame"]: row for row in case_rows}
        unprimed = indexed["unprimed"]["prompt"]
        primed = indexed["primed"]["prompt"]
        prefix = "\nSituation: "
        separator = "\n\nTask: "
        suffix = " Output JSON only.\n"
        if (
            not unprimed.startswith(prefix)
            or separator not in unprimed[len(prefix) :]
            or not unprimed.endswith(suffix)
            or primed != GAP_PRIME + unprimed
        ):
            raise ValueError(f"fresh case {case_id} does not use the frozen compact frames")
        scenario, ask_with_suffix = unprimed[len(prefix) :].split(separator, 1)
        ask = ask_with_suffix[: -len(suffix)]
        if (
            not scenario
            or not ask
            or indexed["unprimed"]["templateId"]
            != _normalized_template_id(indexed["unprimed"]["vertical"], scenario, ask)
        ):
            raise ValueError(f"fresh case {case_id} has a forged or ambiguous template identity")

    vertical_counts: dict[str, int] = defaultdict(int)
    template_ids = set()
    for case_rows in by_case.values():
        vertical_counts[case_rows[0]["vertical"]] += 1
        template_ids.add(case_rows[0]["templateId"])
    expected_vertical_counts = report.get("verticalCounts")
    if (
        len(by_case) != 240
        or len(template_ids) != 240
        or report.get("caseCount") != len(by_case)
        or report.get("uniqueCaseCount") != len(by_case)
        or report.get("uniqueTemplateCount") != len(template_ids)
        or expected_vertical_counts != dict(sorted(vertical_counts.items()))
        or len(vertical_counts) < 6
        or any(count < 40 for count in vertical_counts.values())
    ):
        raise ValueError("fresh prompt corpus does not meet the frozen 240-case uniqueness policy")


def _validate_fresh_report(report: dict[str, Any]) -> None:
    leakage_checks = report.get("leakageChecks")
    vertical_counts = report.get("verticalCounts")
    if (
        report.get("schema") != FRESH_REPORT_SCHEMA
        or report.get("status") != "fresh"
        or not _self_hash_matches(report)
        or not _is_sha256(report.get("preregistrationSha256"))
        or not _is_sha256(report.get("promptManifestSha256"))
        or not _is_sha256(report.get("labelsSha256"))
        or report.get("caseCount") != 240
        or report.get("uniqueCaseCount") != 240
        or report.get("uniqueTemplateCount") != 240
        or report.get("positiveCount") != 120
        or report.get("negativeCount") != 120
        or report.get("independentAdjudication") is not True
        or not _is_int(report.get("independentReviewerCount"), minimum=2)
        or not _is_sha256(report.get("adjudicationReportSha256"))
        or not _is_sha256(report.get("leakageReportSha256"))
        or not isinstance(vertical_counts, dict)
        or len(vertical_counts) < 6
        or any(not isinstance(key, str) or not key for key in vertical_counts)
        or any(not _is_int(count, minimum=40) for count in vertical_counts.values())
        or sum(vertical_counts.values()) != 240
        or not isinstance(leakage_checks, list)
        or len(leakage_checks) < 2
    ):
        raise ValueError("fresh corpus report does not satisfy the frozen corpus contract")
    names = set()
    for check in leakage_checks:
        if (
            not isinstance(check, dict)
            or not isinstance(check.get("name"), str)
            or not check["name"]
            or check["name"] in names
            or not _is_sha256(check.get("referenceSha256"))
            or check.get("exactMatchCount") != 0
            or check.get("byteNgramMatchCount") != 0
            or check.get("tokenNgramMatchCount") != 0
        ):
            raise ValueError("fresh corpus report contains an invalid leakage check")
        names.add(check["name"])
    exposed = next(
        (check for check in leakage_checks if check["name"] == "exposed-fixture-bundle"), None
    )
    if exposed is None or exposed["referenceSha256"] != EXPOSED_FIXTURE_BUNDLE_SHA256:
        raise ValueError("fresh corpus report does not bind the exhausted fixture bundle")
    if "training-validation-bins" not in names:
        raise ValueError("fresh corpus report lacks a training/validation leakage check")


def _verify_temporal_seal(
    manifest_path: str | Path, manifest: dict[str, Any], expected_commit: str | None = None
) -> str:
    revision = manifest.get("sealRevision")
    seal_path = manifest.get("sealPath")
    if (
        not isinstance(revision, str)
        or not revision.startswith("refs/tags/")
        or len(revision) > 256
        or any(character.isspace() for character in revision)
        or not isinstance(seal_path, str)
        or not seal_path
        or Path(seal_path).is_absolute()
        or ".." in Path(seal_path).parts
        or "\\" in seal_path
    ):
        raise ValueError("fresh manifest temporal seal must use a bounded immutable tag/path")
    source = Path(manifest_path).resolve()
    try:
        repository = Path(
            subprocess.run(
                ["git", "-C", str(source.parent), "rev-parse", "--show-toplevel"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
        ).resolve()
        if (repository / Path(seal_path)).resolve() != source:
            raise ValueError("fresh manifest sealPath does not name the supplied manifest")
        resolved_commit = subprocess.run(
            ["git", "-C", str(repository), "rev-parse", f"{revision}^{{commit}}"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        if (
            len(resolved_commit) != 40
            or any(character not in "0123456789abcdef" for character in resolved_commit)
            or (expected_commit is not None and resolved_commit != expected_commit)
        ):
            raise ValueError("fresh manifest seal revision is invalid or moved")
        sealed = subprocess.run(
            ["git", "-C", str(repository), "show", f"{resolved_commit}:{seal_path}"],
            check=True,
            capture_output=True,
        ).stdout
    except subprocess.CalledProcessError as error:
        raise ValueError("fresh manifest temporal seal cannot be resolved") from error
    if sealed != source.read_bytes():
        raise ValueError("fresh manifest differs from its pre-observation git seal")
    return resolved_commit


def _load_fresh_contract(
    args: argparse.Namespace,
    *,
    prompt_sha256: str,
    labels_sha256: str | None,
    models: Sequence[dict[str, str]],
    layers: Sequence[int],
    positions: Sequence[int],
    k: int,
    code_revision: str,
    expected_seal_commit: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any], str]:
    required_paths = {
        "fresh manifest": getattr(args, "fresh_manifest", None),
        "fresh report": getattr(args, "fresh_report", None),
        "preregistration": getattr(args, "preregistration", None),
    }
    missing = [name for name, path in required_paths.items() if not path]
    if missing:
        raise ValueError(f"fresh run requires {', '.join(missing)}")
    manifest = _read_json(required_paths["fresh manifest"])
    report = _read_json(required_paths["fresh report"])
    _validate_fresh_report(report)
    preregistration_sha256 = _sha256_file(required_paths["preregistration"])
    report_sha256 = _sha256_file(required_paths["fresh report"])
    expected_models = _model_policy(models)
    expected_run_policy = _run_policy(
        layers=layers,
        positions=positions,
        k=k,
        implementation=_implementation_policy(code_revision),
    )
    if (
        manifest.get("schema") != FRESH_MANIFEST_SCHEMA
        or manifest.get("status") != "fresh"
        or not _self_hash_matches(manifest)
        or manifest.get("preregistrationSha256") != preregistration_sha256
        or manifest.get("promptManifestSha256") != prompt_sha256
        or manifest.get("labelsSha256") != report.get("labelsSha256")
        or manifest.get("reportSha256") != report_sha256
        or manifest.get("models") != expected_models
        or manifest.get("runPolicy") != expected_run_policy
        or report.get("preregistrationSha256") != preregistration_sha256
        or report.get("promptManifestSha256") != prompt_sha256
        or (labels_sha256 is not None and manifest.get("labelsSha256") != labels_sha256)
    ):
        raise ValueError("fresh manifest does not bind the exact preregistered run contract")
    seal_commit = _verify_temporal_seal(
        required_paths["fresh manifest"], manifest, expected_seal_commit
    )
    repository = _git_repository(Path(__file__).resolve().parent)
    ancestor = subprocess.run(
        ["git", "-C", str(repository), "merge-base", "--is-ancestor", code_revision, seal_commit],
        capture_output=True,
    )
    if ancestor.returncode != 0:
        raise ValueError("fresh corpus seal does not descend from the frozen implementation")
    return manifest, report, seal_commit


def _normalized_template_id(vertical: str, scenario: str, ask: str) -> str:
    normalized = "\n".join(
        (
            vertical.casefold(),
            " ".join(scenario.casefold().split()),
            " ".join(ask.casefold().split()),
        )
    )
    return f"sha256:{hashlib.sha256(normalized.encode('utf-8')).hexdigest()}"


def prepare_exposed_gaps(args: argparse.Namespace) -> None:
    """Reproduce the already-exposed S0 frames as diagnostic-only manifests."""

    gap_files = sorted(Path(args.gap_dir).glob("heldout-gap-*.jsonl"))
    if not gap_files:
        raise ValueError("no heldout-gap JSONL files were found")
    prompts = []
    labels = []
    seen_case_ids = set()
    file_inventory = []
    for path in gap_files:
        vertical = path.stem.removeprefix("heldout-gap-")
        corpus_name = (
            "holoai-beneficiary-scenario-corpus.jsonl"
            if vertical == "beneficiary"
            else f"{vertical}-scenario-corpus.jsonl"
        )
        corpus_path = Path(args.corpus_root) / corpus_name
        system = ""
        if corpus_path.exists():
            corpus_rows = _read_jsonl(corpus_path)
            if corpus_rows:
                system_value = corpus_rows[0].get("system", "")
                if not isinstance(system_value, str):
                    raise ValueError(f"{corpus_path} system field must be a string")
                system = system_value
        fixture_rows = _read_jsonl(path)
        file_inventory.append(
            {"path": path.name, "sha256": _sha256_file(path), "rowCount": len(fixture_rows)}
        )
        for fixture in fixture_rows:
            case_id = fixture.get("id")
            scenario = fixture.get("scenario")
            ask = fixture.get("ask", "")
            solvable = fixture.get("solvable")
            if (
                not isinstance(case_id, str)
                or not case_id
                or case_id in seen_case_ids
                or not isinstance(scenario, str)
                or not isinstance(ask, str)
                or type(solvable) is not bool
            ):
                raise ValueError(f"malformed or duplicate fixture in {path}: {case_id!r}")
            seen_case_ids.add(case_id)
            template_id = _normalized_template_id(vertical, scenario, ask)
            labels.append({"caseId": case_id, "positive": not solvable})
            for frame in ("unprimed", "primed"):
                active_system = system if args.frame_profile == "legacy-v1" else ""
                if frame == "primed":
                    active_system += GAP_PRIME
                    if vertical == "beneficiary" and args.frame_profile == "legacy-v1":
                        active_system += BENEFICIARY_GAP_PRIME
                prompt = (
                    f"{active_system}\nSituation: {scenario}\n\nTask: {ask} Output JSON only.\n"
                )
                prompts.append(
                    {
                        "caseId": case_id,
                        "vertical": vertical,
                        "templateId": template_id,
                        "frame": frame,
                        "prompt": prompt,
                    }
                )
    _validate_prompt_manifest(prompts)
    _write_jsonl_atomic(args.prompts, prompts)
    _write_jsonl_atomic(args.labels, labels)
    bundle_payload = "\n".join(
        f"{item['path']}\0{item['sha256'][7:]}" for item in file_inventory
    ).encode("utf-8")
    _write_json_atomic(
        args.prepare_manifest,
        {
            "schema": "holoserve.exposed-gap-diagnostic-preparation.v0.1.0",
            "status": "diagnostic",
            "frameProfile": args.frame_profile,
            "createdAt": _utc_now(),
            "fixtureBundleSha256": (f"sha256:{hashlib.sha256(bundle_payload).hexdigest()}"),
            "files": file_inventory,
            "caseCount": len(labels),
            "promptCount": len(prompts),
            "promptsSha256": _sha256_file(args.prompts),
            "labelsSha256": _sha256_file(args.labels),
        },
    )


def _legacy_union_top_k_jsd(
    concepts: Sequence[dict[str, Any]], controls: Sequence[dict[str, Any]]
) -> float:
    """Reconstruct the frozen v1 sparse comparator without using tail mass.

    The support is the sorted union of independently selected mapped/control top-k
    token IDs. Each E8 probability receives one integer pseudocount (including an
    absent token's zero), then each side is normalized over that union. Retaining the
    binary64 value with ``float.hex`` prevents decimal JSON round-trip drift.
    """

    mapped = {int(item["tokenId"]): int(item["probabilityE8"]) for item in concepts}
    control = {int(item["tokenId"]): int(item["probabilityE8"]) for item in controls}
    support = sorted(set(mapped) | set(control))
    if not support:
        raise ValueError("legacy comparator requires a non-empty union support")
    mapped_weights = [float(mapped.get(token_id, 0) + 1) for token_id in support]
    control_weights = [float(control.get(token_id, 0) + 1) for token_id in support]
    mapped_total = math.fsum(mapped_weights)
    control_total = math.fsum(control_weights)
    mapped_probabilities = [value / mapped_total for value in mapped_weights]
    control_probabilities = [value / control_total for value in control_weights]
    divergence_terms = []
    for mapped_probability, control_probability in zip(
        mapped_probabilities, control_probabilities, strict=True
    ):
        midpoint = (mapped_probability + control_probability) / 2.0
        divergence_terms.append(
            0.5
            * (
                mapped_probability * math.log(mapped_probability / midpoint)
                + control_probability * math.log(control_probability / midpoint)
            )
        )
    result = math.fsum(divergence_terms)
    if not math.isfinite(result) or result < 0 or result > math.log(2) + 1e-15:
        raise ValueError("legacy comparator produced an invalid Jensen-Shannon divergence")
    return result


def _legacy_score_from_hex(value: Any) -> float:
    if not isinstance(value, str):
        raise ValueError("legacy comparator score must be retained as float.hex")
    try:
        decoded = float.fromhex(value)
    except ValueError as error:
        raise ValueError("legacy comparator score is not a valid float.hex value") from error
    if decoded.hex() != value or not math.isfinite(decoded) or decoded < 0 or decoded > math.log(2):
        raise ValueError("legacy comparator score is non-canonical or out of range")
    return decoded


def _validate_capability(
    health: dict[str, Any], binding: dict[str, str], layers: Sequence[int]
) -> dict[str, Any]:
    capability_root = health.get("model_workspace_probe")
    capabilities = capability_root.get("models") if isinstance(capability_root, dict) else None
    capability = capabilities.get(binding["modelId"]) if isinstance(capabilities, dict) else None
    advertised_layers = capability.get("layers") if isinstance(capability, dict) else None
    estimator = capability.get("estimator") if isinstance(capability, dict) else None
    experiment_profile = (
        capability.get("experimentProfile") if isinstance(capability, dict) else None
    )
    is_s5_profile = experiment_profile == JACOBIAN_LENS_S5_EXPERIMENT_PROFILE
    expected_capability_fields = {
        "schema",
        "observe",
        "intervention",
        "method",
        "estimator",
        "paperParity",
        "measurementProfile",
        "controlProfile",
        "layers",
        "lensSha256",
    }
    if estimator == "corpus_position_average_v1":
        expected_capability_fields.update({"parityScope", "paperExperimentParity"})
    elif estimator in ENDPOINT_ESTIMATOR_TRANSPORT_PROFILES:
        expected_capability_fields.update({"transportProfile", "positionPolicy", "positionBins"})
    if is_s5_profile:
        expected_capability_fields.add("experimentProfile")
    if (
        health.get("backend") != "pytorch-holo"
        or not isinstance(capability_root, dict)
        or capability_root.get("schema") != MODEL_WORKSPACE_CAPABILITY_SCHEMA
        or capability_root.get("observe") is not True
        or capability_root.get("intervention") is not False
        or not isinstance(capability, dict)
        or set(capability) != expected_capability_fields
        or capability.get("schema") != MODEL_WORKSPACE_CAPABILITY_SCHEMA
        or capability.get("observe") is not True
        or capability.get("intervention") is not False
        or capability.get("method") != "jacobian_lens"
        or not _supported_estimator(capability)
        or ("experimentProfile" in capability and not is_s5_profile)
        or (
            is_s5_profile
            and (
                estimator != JACOBIAN_LENS_ESTIMATOR_V2
                or capability.get("transportProfile") != JACOBIAN_LENS_V2_TRANSPORT_PROFILE
            )
        )
        or bool(_find_private_scalar_fields(capability))
        or (
            capability.get("estimator") in ENDPOINT_ESTIMATOR_TRANSPORT_PROFILES
            and (
                capability.get("positionPolicy") != "endpoint-self-only"
                or not _supported_endpoint_position_bins(capability.get("positionBins"))
            )
        )
        or capability.get("measurementProfile") != MODEL_WORKSPACE_MEASUREMENT_PROFILE
        or capability.get("controlProfile") != MODEL_WORKSPACE_CONTROL_PROFILE
        or capability.get("lensSha256") != binding["lensSha256"]
        or not isinstance(advertised_layers, list)
        or not advertised_layers
        or any(not _is_int(layer, minimum=0) for layer in advertised_layers)
        or len(set(advertised_layers)) != len(advertised_layers)
        or any(layer not in advertised_layers for layer in layers)
    ):
        raise ValueError(f"capability mismatch for model alias {binding['alias']}")
    return capability


def _validate_receipt(
    receipt: dict[str, Any],
    *,
    prompt: str,
    binding: dict[str, str],
    checkpoint_sha256: str,
    tokenizer_sha256: str,
    layers: list[int],
    positions: list[int],
    k: int,
    allow_truncated: bool,
    capability: dict[str, Any],
) -> dict[str, Any]:
    expected_receipt_fields = {
        "schema",
        "kind",
        "mode",
        "createdAt",
        "requestId",
        "model",
        "tokenizer",
        "lens",
        "input",
        "observation",
        "observationSha256",
        "runtime",
        "integrity",
        "safety",
        "limitations",
        "receiptHash",
    }
    if (
        set(receipt) != expected_receipt_fields
        or
        receipt.get("schema") != MODEL_WORKSPACE_RECEIPT_SCHEMA
        or receipt.get("kind") != "ModelWorkspaceReceipt"
        or receipt.get("mode") != "observe"
        or not _is_timestamp(receipt.get("createdAt"))
        or not isinstance(receipt.get("requestId"), str)
        or not 1 <= len(receipt["requestId"]) <= 256
        or not _is_sha256(receipt.get("receiptHash"))
        or not _is_sha256(receipt.get("observationSha256"))
    ):
        raise ValueError("HoloServe returned an invalid v0.2 workspace receipt envelope")
    observation = receipt.get("observation")
    if not isinstance(observation, dict):
        raise ValueError("workspace observation is missing")
    integrity = receipt.get("integrity")
    if (
        not isinstance(integrity, dict)
        or set(integrity) != {"algorithm", "canonicalization"}
        or integrity.get("algorithm") != "sha256"
        or integrity.get("canonicalization") != MODEL_WORKSPACE_HASH_CANONICALIZATION
        or receipt["observationSha256"] != sha256_json(observation)
        or receipt["receiptHash"] != sha256_json({**receipt, "receiptHash": None})
    ):
        raise ValueError("workspace receipt hash canonicalization or digest mismatch")
    model = receipt.get("model")
    tokenizer = receipt.get("tokenizer")
    lens = receipt.get("lens")
    input_meta = receipt.get("input")
    expected_lens_fields = {
        "method",
        "estimator",
        "paperParity",
        "implementationVersion",
        "corpusSha256",
        "lensSha256",
        "positionPolicy",
        "jacobianCount",
        "k",
    }
    if isinstance(lens, dict):
        if lens.get("estimator") == "corpus_position_average_v1":
            expected_lens_fields.update({"parityScope", "paperExperimentParity"})
        elif lens.get("estimator") in ENDPOINT_ESTIMATOR_TRANSPORT_PROFILES:
            expected_lens_fields.update({"transportProfile", "positionBins"})
        if lens.get("experimentProfile") == JACOBIAN_LENS_S5_EXPERIMENT_PROFILE:
            expected_lens_fields.add("experimentProfile")
    is_s5_profile = (
        isinstance(lens, dict)
        and lens.get("experimentProfile") == JACOBIAN_LENS_S5_EXPERIMENT_PROFILE
    )
    if (
        not isinstance(model, dict)
        or set(model) != {"requestedId", "servedId", "checkpointSha256", "architecture"}
        or model.get("requestedId") != binding["modelId"]
        or model.get("servedId") != binding["modelId"]
        or model.get("checkpointSha256") != checkpoint_sha256
        or not isinstance(model.get("architecture"), str)
        or not model["architecture"]
        or not isinstance(tokenizer, dict)
        or set(tokenizer) != {"sha256", "vocabSize"}
        or tokenizer.get("sha256") != tokenizer_sha256
        or not _is_int(tokenizer.get("vocabSize"), minimum=1)
        or not isinstance(lens, dict)
        or set(lens) != expected_lens_fields
        or lens.get("method") != "jacobian_lens"
        or not _supported_estimator(lens)
        or ("experimentProfile" in lens and not is_s5_profile)
        or lens.get("experimentProfile") != capability.get("experimentProfile")
        or (
            is_s5_profile
            and (
                lens.get("estimator") != JACOBIAN_LENS_ESTIMATOR_V2
                or lens.get("transportProfile") != JACOBIAN_LENS_V2_TRANSPORT_PROFILE
            )
        )
        or lens.get("estimator") != capability.get("estimator")
        or lens.get("paperParity") != capability.get("paperParity")
        or lens.get("parityScope") != capability.get("parityScope")
        or lens.get("paperExperimentParity") != capability.get("paperExperimentParity")
        or lens.get("transportProfile") != capability.get("transportProfile")
        or lens.get("positionBins") != capability.get("positionBins")
        or not isinstance(lens.get("implementationVersion"), str)
        or not lens["implementationVersion"]
        or not _is_sha256(lens.get("corpusSha256"))
        or lens.get("lensSha256") != binding["lensSha256"]
        or not _supported_position_policy(lens.get("estimator"), lens.get("positionPolicy"))
        or not _is_int(lens.get("jacobianCount"), minimum=1)
        or lens.get("k") != k
        or not _is_int(k, minimum=1, maximum=min(MAX_WORKSPACE_TOP_K, tokenizer["vocabSize"]))
        or not isinstance(input_meta, dict)
        or set(input_meta)
        != {
            "promptSha256",
            "tokenCount",
            "originalTokenCount",
            "truncated",
            "truncationPolicy",
            "layers",
            "requestedPositions",
            "positions",
            "measurementProfile",
            "seed",
        }
    ):
        raise ValueError("workspace receipt model, tokenizer, or lens provenance is invalid")

    token_count = input_meta.get("tokenCount")
    original_token_count = input_meta.get("originalTokenCount")
    requested_positions = input_meta.get("requestedPositions")
    actual_positions = input_meta.get("positions")
    input_layers = input_meta.get("layers")
    if (
        input_meta.get("promptSha256")
        != f"sha256:{hashlib.sha256(prompt.encode('utf-8')).hexdigest()}"
        or not _is_int(token_count, minimum=1, maximum=MAX_PROMPT_TOKENS)
        or not _is_int(original_token_count, minimum=token_count)
        or input_meta.get("truncated") is not (original_token_count > token_count)
        or input_meta.get("truncationPolicy")
        != ("left-truncate-to-model-block-size" if original_token_count > token_count else "none")
        or not isinstance(input_layers, list)
        or input_layers != sorted(set(layers))
        or any(not _is_int(layer, minimum=0) for layer in input_layers)
        or not isinstance(requested_positions, list)
        or requested_positions != positions
        or not 1 <= len(requested_positions) <= MAX_WORKSPACE_POSITIONS
        or any(not _is_int(position) for position in requested_positions)
        or not isinstance(actual_positions, list)
        or actual_positions != _normalized_positions(requested_positions, token_count)
        or input_meta.get("measurementProfile") != MODEL_WORKSPACE_MEASUREMENT_PROFILE
        or input_meta.get("seed") is not None
    ):
        raise ValueError("workspace receipt bounded input provenance is invalid")
    if input_meta["truncated"] is not False and not allow_truncated:
        raise ValueError("workspace evaluation rejects truncated prompts")
    if not allow_truncated and original_token_count > MAX_PROMPT_TOKENS:
        raise ValueError("workspace evaluation rejects prompts longer than 512 tokens")
    if lens.get("estimator") in ENDPOINT_ESTIMATOR_TRANSPORT_PROFILES and (
        requested_positions != [-1] or actual_positions != [token_count - 1]
    ):
        raise ValueError("endpoint affine evaluation requires the final token position")

    runtime = receipt.get("runtime")
    if (
        not isinstance(runtime, dict)
        or set(runtime)
        != {"backend", "device", "torchVersion", "pythonVersion", "holoserveVersion"}
        or runtime.get("backend") != "pytorch-holo"
        or any(
            not isinstance(runtime.get(field), str) or not runtime[field]
            for field in ("device", "torchVersion", "pythonVersion", "holoserveVersion")
        )
    ):
        raise ValueError("workspace receipt runtime provenance is invalid")
    safety = receipt.get("safety")
    expected_safety = {
        "readOnly": True,
        "interventionApplied": False,
        "rawActivationsPersisted": False,
        "identityBinding": "none",
        "retention": "receipt_only",
    }
    if safety != expected_safety:
        raise ValueError("workspace receipt safety envelope mismatch")
    limitations = receipt.get("limitations")
    if (
        not isinstance(limitations, list)
        or not 1 <= len(limitations) <= 32
        or any(not isinstance(item, str) or not 1 <= len(item) <= 1024 for item in limitations)
    ):
        raise ValueError("workspace receipt limitations are missing or malformed")
    forbidden = _find_forbidden_receipt_fields(receipt)
    if forbidden:
        raise ValueError(f"workspace receipt contains forbidden fields: {forbidden}")
    private_scalar_fields = _find_private_scalar_fields(receipt)
    if private_scalar_fields:
        raise ValueError(
            "workspace receipt contains private scalar artifact fields: "
            f"{private_scalar_fields}"
        )

    coordinate_rows = observation.get("layers")
    summary = observation.get("summary")
    expected_coordinates = {
        (layer, position) for layer in input_layers for position in actual_positions
    }
    if (
        set(observation)
        != {"status", "measurementProfile", "controlProfile", "layerBand", "layers", "summary"}
        or
        observation.get("status") != "observed"
        or observation.get("measurementProfile") != MODEL_WORKSPACE_MEASUREMENT_PROFILE
        or observation.get("controlProfile") != MODEL_WORKSPACE_CONTROL_PROFILE
        or observation.get("layerBand") != {"start": min(input_layers), "end": max(input_layers)}
        or not isinstance(coordinate_rows, list)
        or len(coordinate_rows) != len(expected_coordinates)
        or len(coordinate_rows) > 1024
        or not isinstance(summary, dict)
        or set(summary) != {"scoreProfile", "coordinateCount", "scoreE8"}
    ):
        raise ValueError("workspace observation coordinates or summary are missing")
    metrics = []
    lens_gains = []
    legacy_scores = []
    seen_coordinates = set()
    max_entropy_e8 = round(math.log(tokenizer["vocabSize"]) * MEASUREMENT_E8)
    for index, coordinate in enumerate(coordinate_rows):
        if not isinstance(coordinate, dict):
            raise ValueError(f"workspace coordinate {index} is not an object")
        coordinate_id = (coordinate.get("layer"), coordinate.get("position"))
        concepts = coordinate.get("concepts")
        controls = coordinate.get("controlConcepts")
        metric = coordinate.get("distributionMetrics")
        anchor_control = coordinate.get("anchorControlMetrics")
        transport_controls = coordinate.get("transportControlMetrics")
        expected_coordinate_fields = {
            "layer",
            "position",
            "concepts",
            "controlConcepts",
            "tailProbabilityMassE8",
            "controlTailProbabilityMassE8",
            "distributionMetrics",
        }
        if lens.get("estimator") in ENDPOINT_ESTIMATOR_TRANSPORT_PROFILES:
            expected_coordinate_fields.add("anchorControlMetrics")
        if lens.get("estimator") == JACOBIAN_LENS_ESTIMATOR_V4 or is_s5_profile:
            expected_coordinate_fields.add("transportControlMetrics")
        if (
            coordinate_id not in expected_coordinates
            or coordinate_id in seen_coordinates
            or set(coordinate) != expected_coordinate_fields
            or not isinstance(concepts, list)
            or len(concepts) != k
            or not isinstance(controls, list)
            or len(controls) != k
            or not isinstance(metric, dict)
            or not _is_e8_probability(coordinate.get("tailProbabilityMassE8"))
            or not _is_e8_probability(coordinate.get("controlTailProbabilityMassE8"))
        ):
            raise ValueError(f"workspace coordinate {index} is malformed or out of bounds")
        seen_coordinates.add(coordinate_id)
        for name, sparse in (("mapped", concepts), ("control", controls)):
            token_ids = []
            probabilities = []
            for concept in sparse:
                if (
                    not isinstance(concept, dict)
                    or set(concept) != {"tokenId", "token", "scoreE8", "probabilityE8"}
                    or not _is_int(
                        concept.get("tokenId"), minimum=0, maximum=tokenizer["vocabSize"] - 1
                    )
                    or not isinstance(concept.get("token"), str)
                    or len(concept["token"]) > 4096
                    or not _is_int(concept.get("scoreE8"))
                    or not _is_e8_probability(concept.get("probabilityE8"))
                ):
                    raise ValueError(f"workspace coordinate {index} has an invalid {name} concept")
                token_ids.append(concept["tokenId"])
                probabilities.append(concept["probabilityE8"])
            if len(set(token_ids)) != len(token_ids) or any(
                right > left for left, right in zip(probabilities, probabilities[1:])
            ):
                raise ValueError(
                    f"workspace coordinate {index} {name} concepts are duplicated or unsorted"
                )
        mapped_mass = sum(item["probabilityE8"] for item in concepts)
        control_mass = sum(item["probabilityE8"] for item in controls)
        if mapped_mass + coordinate["tailProbabilityMassE8"] != MEASUREMENT_E8:
            raise ValueError("mapped sparse probability mass mismatch")
        if control_mass + coordinate["controlTailProbabilityMassE8"] != MEASUREMENT_E8:
            raise ValueError("control sparse probability mass mismatch")
        jsd_fields = (
            metric.get("mappedControlJensenShannonDivergenceNatsE8"),
            metric.get("mappedTargetJensenShannonDivergenceNatsE8"),
            metric.get("controlTargetJensenShannonDivergenceNatsE8"),
        )
        entropy_fields = (
            metric.get("mappedEntropyNatsE8"),
            metric.get("controlEntropyNatsE8"),
        )
        expected_distribution_fields = {
            "mappedControlJensenShannonDivergenceNatsE8",
            "mappedTargetJensenShannonDivergenceNatsE8",
            "controlTargetJensenShannonDivergenceNatsE8",
            "lensGainJensenShannonNatsE8",
            "totalVariationDistanceE8",
            "mappedEntropyNatsE8",
            "controlEntropyNatsE8",
            "mappedMaxProbabilityE8",
            "controlMaxProbabilityE8",
        }
        if (
            set(metric) != expected_distribution_fields
            or
            any(
                not _is_int(value, minimum=0, maximum=MAX_JENSEN_SHANNON_NATS_E8)
                for value in jsd_fields
            )
            or not _is_int(
                metric.get("lensGainJensenShannonNatsE8"),
                minimum=-MAX_JENSEN_SHANNON_NATS_E8,
                maximum=MAX_JENSEN_SHANNON_NATS_E8,
            )
            or metric.get("lensGainJensenShannonNatsE8") != jsd_fields[2] - jsd_fields[1]
            or not _is_e8_probability(metric.get("totalVariationDistanceE8"))
            or any(
                not _is_int(value, minimum=0, maximum=max_entropy_e8) for value in entropy_fields
            )
            or not _is_e8_probability(metric.get("mappedMaxProbabilityE8"))
            or not _is_e8_probability(metric.get("controlMaxProbabilityE8"))
            or abs(metric["mappedMaxProbabilityE8"] - concepts[0]["probabilityE8"]) > 1
            or abs(metric["controlMaxProbabilityE8"] - controls[0]["probabilityE8"]) > 1
        ):
            raise ValueError(f"workspace coordinate {index} distribution metrics are invalid")
        if lens.get("estimator") in ENDPOINT_ESTIMATOR_TRANSPORT_PROFILES:
            if (
                not isinstance(anchor_control, dict)
                or set(anchor_control)
                != {
                    "anchorTargetJensenShannonDivergenceNatsE8",
                    "mappedVsAnchorLensGainJensenShannonNatsE8",
                    "anchorEntropyNatsE8",
                    "anchorMaxProbabilityE8",
                    "targetEntropyNatsE8",
                    "targetMaxProbabilityE8",
                    "mappedTopTokenId",
                    "anchorTopTokenId",
                    "targetTopTokenId",
                }
                or not _is_int(
                    anchor_control.get("anchorTargetJensenShannonDivergenceNatsE8"),
                    minimum=0,
                    maximum=MAX_JENSEN_SHANNON_NATS_E8,
                )
                or not _is_int(
                    anchor_control.get("mappedVsAnchorLensGainJensenShannonNatsE8"),
                    minimum=-MAX_JENSEN_SHANNON_NATS_E8,
                    maximum=MAX_JENSEN_SHANNON_NATS_E8,
                )
                or anchor_control["mappedVsAnchorLensGainJensenShannonNatsE8"]
                != anchor_control["anchorTargetJensenShannonDivergenceNatsE8"]
                - metric["mappedTargetJensenShannonDivergenceNatsE8"]
                or not _is_int(
                    anchor_control.get("anchorEntropyNatsE8"),
                    minimum=0,
                    maximum=max_entropy_e8,
                )
                or not _is_e8_probability(anchor_control.get("anchorMaxProbabilityE8"))
                or not _is_int(
                    anchor_control.get("targetEntropyNatsE8"),
                    minimum=0,
                    maximum=max_entropy_e8,
                )
                or not _is_e8_probability(anchor_control.get("targetMaxProbabilityE8"))
                or any(
                    not _is_int(
                        anchor_control.get(field),
                        minimum=0,
                        maximum=tokenizer["vocabSize"] - 1,
                    )
                    for field in ("mappedTopTokenId", "anchorTopTokenId", "targetTopTokenId")
                )
            ):
                raise ValueError(f"workspace coordinate {index} anchor control is invalid")
        elif anchor_control is not None:
            raise ValueError(f"workspace coordinate {index} has an unexpected anchor control")
        if is_s5_profile:
            if (
                not isinstance(transport_controls, dict)
                or set(transport_controls)
                != {"scalarCalibrated", "localTaylor", "scalarIdentity"}
                or any(
                    not isinstance(control, dict)
                    or set(control) != {"targetJensenShannonDivergenceNatsE8"}
                    or not _is_int(
                        control.get("targetJensenShannonDivergenceNatsE8"),
                        minimum=0,
                        maximum=MAX_JENSEN_SHANNON_NATS_E8,
                    )
                    for control in transport_controls.values()
                )
            ):
                raise ValueError(
                    f"workspace coordinate {index} S5 transport controls are invalid"
                )
        elif lens.get("estimator") == JACOBIAN_LENS_ESTIMATOR_V4:
            if (
                not isinstance(transport_controls, dict)
                or set(transport_controls)
                != {"unscaledCentered", "localTaylor", "scalarIdentity"}
                or any(
                    not isinstance(control, dict)
                    or set(control) != {"targetJensenShannonDivergenceNatsE8"}
                    or not _is_int(
                        control.get("targetJensenShannonDivergenceNatsE8"),
                        minimum=0,
                        maximum=MAX_JENSEN_SHANNON_NATS_E8,
                    )
                    for control in transport_controls.values()
                )
            ):
                raise ValueError(
                    f"workspace coordinate {index} S4 transport controls are invalid"
                )
        elif transport_controls is not None:
            raise ValueError(
                f"workspace coordinate {index} has unexpected transport controls"
            )
        metrics.append(metric)
        lens_gains.append(metric["lensGainJensenShannonNatsE8"])
        legacy_scores.append(_legacy_union_top_k_jsd(concepts, controls))
    if seen_coordinates != expected_coordinates:
        raise ValueError("workspace receipt does not cover the exact requested coordinate grid")
    score = integer_mean_e8(
        [item["mappedControlJensenShannonDivergenceNatsE8"] for item in metrics]
    )
    if (
        summary.get("scoreProfile") != MODEL_WORKSPACE_SCORE_PROFILE
        or summary.get("coordinateCount") != len(metrics)
        or summary.get("scoreE8") != score
    ):
        raise ValueError("workspace observation summary mismatch")
    legacy_score = math.fsum(legacy_scores) / len(legacy_scores)
    return {
        "scoreE8": score,
        "legacyComparatorProfile": LEGACY_COMPARATOR_PROFILE,
        "legacyComparatorScoreHex": legacy_score.hex(),
        "lensGainE8": integer_mean_e8(lens_gains),
        "coordinates": [
            {
                "layer": int(coordinate["layer"]),
                "position": int(coordinate["position"]),
                "metrics": coordinate["distributionMetrics"],
                **(
                    {"anchorControlMetrics": coordinate["anchorControlMetrics"]}
                    if "anchorControlMetrics" in coordinate
                    else {}
                ),
                **(
                    {"transportControlMetrics": coordinate["transportControlMetrics"]}
                    if "transportControlMetrics" in coordinate
                    else {}
                ),
            }
            for coordinate in coordinate_rows
        ],
    }


def collect(args: argparse.Namespace) -> None:
    prompts = _read_jsonl(args.prompt_manifest)
    _validate_prompt_manifest(prompts)
    if (
        not args.layers
        or args.layers != sorted(set(args.layers))
        or any(not _is_int(layer, minimum=0) for layer in args.layers)
        or not 1 <= len(args.positions) <= MAX_WORKSPACE_POSITIONS
        or any(not _is_int(position) for position in args.positions)
        or not _is_int(args.k, minimum=1, maximum=MAX_WORKSPACE_TOP_K)
    ):
        raise ValueError("collection layers, positions, or k are malformed or non-canonical")
    aliases = [binding["alias"] for binding in args.model]
    model_ids = [binding["modelId"] for binding in args.model]
    if len(set(aliases)) != len(aliases) or len(set(model_ids)) != len(model_ids):
        raise ValueError("collection model aliases and model IDs must be unique")

    fresh_manifest = None
    fresh_report = None
    fresh_seal_commit = None
    if args.status == "fresh":
        if (
            set(aliases) != set(FRESH_ALIASES)
            or len(args.model) != 2
            or len({binding["lensSha256"] for binding in args.model}) != 2
            or args.allow_truncated
            or not isinstance(args.code_revision, str)
            or len(args.code_revision) != 40
            or any(character not in "0123456789abcdef" for character in args.code_revision)
        ):
            raise ValueError("fresh collection requires distinct A/B lenses and a frozen revision")
        fresh_manifest, fresh_report, fresh_seal_commit = _load_fresh_contract(
            args,
            prompt_sha256=_sha256_file(args.prompt_manifest),
            labels_sha256=None,
            models=args.model,
            layers=args.layers,
            positions=args.positions,
            k=args.k,
            code_revision=args.code_revision,
        )
        _validate_fresh_prompt_matrix(prompts, fresh_report)

    # Every local contract check above precedes the first network request. A fresh
    # run cannot partially observe prompts and only then discover a bad manifest.
    health = _http_json(args.endpoint, "/health")
    if not isinstance(health, dict):
        raise ValueError("HoloServe health response must be an object")
    capabilities = {
        binding["alias"]: _validate_capability(health, binding, args.layers)
        for binding in args.model
    }

    output_rows = []
    receipt_rows = []
    for prompt_row in prompts:
        for binding in args.model:
            receipt = _http_json(
                args.endpoint,
                "/v1/model-workspace/observe",
                {
                    "model": binding["modelId"],
                    "prompt": prompt_row["prompt"],
                    "layers": args.layers,
                    "positions": args.positions,
                    "k": args.k,
                },
            )
            try:
                extracted = _validate_receipt(
                    receipt,
                    prompt=prompt_row["prompt"],
                    binding=binding,
                    checkpoint_sha256=args.checkpoint_sha256,
                    tokenizer_sha256=args.tokenizer_sha256,
                    layers=args.layers,
                    positions=args.positions,
                    k=args.k,
                    allow_truncated=args.allow_truncated,
                    capability=capabilities[binding["alias"]],
                )
            except (KeyError, TypeError, ValueError) as error:
                raise ValueError(
                    "invalid receipt for "
                    f"{prompt_row['caseId']}:{prompt_row['frame']}:{binding['alias']}: {error}"
                ) from error
            output_rows.append(
                {
                    "caseId": prompt_row["caseId"],
                    "vertical": prompt_row["vertical"],
                    "templateId": prompt_row["templateId"],
                    "frame": prompt_row["frame"],
                    "modelAlias": binding["alias"],
                    "modelId": binding["modelId"],
                    "lensSha256": binding["lensSha256"],
                    "receiptHash": receipt["receiptHash"],
                    "observationSha256": receipt["observationSha256"],
                    "promptSha256": receipt["input"]["promptSha256"],
                    "originalTokenCount": receipt["input"]["originalTokenCount"],
                    "tokenCount": receipt["input"]["tokenCount"],
                    "truncated": receipt["input"]["truncated"],
                    **extracted,
                }
            )
            receipt_rows.append(
                {
                    "caseId": prompt_row["caseId"],
                    "frame": prompt_row["frame"],
                    "modelAlias": binding["alias"],
                    "receipt": receipt,
                }
            )

    _write_jsonl_atomic(args.output, output_rows)
    _write_jsonl_atomic(args.receipt_output, receipt_rows)
    manifest = {
        "schema": COLLECTION_SCHEMA,
        "status": args.status,
        "createdAt": _utc_now(),
        "promptManifestSha256": _sha256_file(args.prompt_manifest),
        "rowArtifactSha256": _sha256_file(args.output),
        "receiptArtifactSha256": _sha256_file(args.receipt_output),
        "codeFileSha256": _sha256_file(__file__),
        "codeRevision": args.code_revision,
        "checkpointSha256": args.checkpoint_sha256,
        "tokenizerSha256": args.tokenizer_sha256,
        "models": _model_policy(args.model),
        "capabilities": capabilities,
        "layers": args.layers,
        "positions": args.positions,
        "k": args.k,
        "maximumTokenCount": MAX_PROMPT_TOKENS,
        "measurementProfile": MODEL_WORKSPACE_MEASUREMENT_PROFILE,
        "controlProfile": MODEL_WORKSPACE_CONTROL_PROFILE,
        "scoreProfile": MODEL_WORKSPACE_SCORE_PROFILE,
        "legacyComparatorProfile": LEGACY_COMPARATOR_PROFILE,
        "allowTruncated": args.allow_truncated,
        "promptCount": len(prompts),
        "rowCount": len(output_rows),
        "receiptCount": len(receipt_rows),
        "truncatedRowCount": sum(bool(row["truncated"]) for row in output_rows),
    }
    if fresh_manifest is not None and fresh_report is not None:
        manifest.update(
            {
                "freshManifestSha256": _sha256_file(args.fresh_manifest),
                "freshReportSha256": _sha256_file(args.fresh_report),
                "preregistrationSha256": _sha256_file(args.preregistration),
                "labelsSha256": fresh_manifest["labelsSha256"],
                "freshSealCommit": fresh_seal_commit,
            }
        )
    manifest["selfHash"] = sha256_json({**manifest, "selfHash": None})
    _write_json_atomic(args.run_manifest, manifest)


def roc_auc(scores: Sequence[int | float], labels: Sequence[bool]) -> float:
    if len(scores) != len(labels):
        raise ValueError("ROC-AUC requires equally sized score and label sequences")
    positive_count = sum(labels)
    negative_count = len(labels) - positive_count
    if positive_count == 0 or negative_count == 0:
        return math.nan
    ordered = sorted(zip(scores, labels, strict=True), key=lambda item: item[0])
    positive_rank_sum = 0.0
    start = 0
    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and ordered[end][0] == ordered[start][0]:
            end += 1
        average_rank = ((start + 1) + end) / 2.0
        positive_rank_sum += average_rank * sum(label for _, label in ordered[start:end])
        start = end
    return (positive_rank_sum - positive_count * (positive_count + 1) / 2.0) / (
        positive_count * negative_count
    )


def threshold_at_fpr(
    scores: Sequence[int | float], labels: Sequence[bool], maximum_fpr: float = 0.05
) -> float:
    if not scores or len(scores) != len(labels) or not any(labels) or all(labels):
        raise ValueError("threshold selection requires both classes")
    candidates = [max(scores) + 1, *sorted(set(scores), reverse=True)]
    best: tuple[float, float, float] | None = None
    for threshold in candidates:
        decisions = [score >= threshold for score in scores]
        recall = sum(
            decision for decision, label in zip(decisions, labels, strict=True) if label
        ) / sum(labels)
        negatives = len(labels) - sum(labels)
        fpr = (
            sum(decision for decision, label in zip(decisions, labels, strict=True) if not label)
            / negatives
        )
        candidate = (recall, -fpr, float(threshold))
        if fpr <= maximum_fpr and (best is None or candidate > best):
            best = candidate
    if best is None:
        raise ValueError("no threshold satisfies the FPR constraint")
    return best[2]


def _rates(decisions: Sequence[bool], labels: Sequence[bool]) -> dict[str, float]:
    positive_count = sum(labels)
    negative_count = len(labels) - positive_count
    return {
        "recall": sum(decision for decision, label in zip(decisions, labels, strict=True) if label)
        / positive_count,
        "fpr": sum(decision for decision, label in zip(decisions, labels, strict=True) if not label)
        / negative_count,
    }


def cohen_kappa(left: Sequence[bool], right: Sequence[bool]) -> float | None:
    if not left or len(left) != len(right):
        raise ValueError("kappa requires equally sized non-empty decisions")
    agreement = sum(a == b for a, b in zip(left, right, strict=True)) / len(left)
    left_positive = sum(left) / len(left)
    right_positive = sum(right) / len(right)
    expected = left_positive * right_positive + (1 - left_positive) * (1 - right_positive)
    if math.isclose(expected, 1.0):
        return None
    return (agreement - expected) / (1 - expected)


def _paired_reliability(
    first_key: tuple[str, str],
    second_key: tuple[str, str],
    *,
    cells: dict[tuple[str, str], list[dict[str, Any]]],
    decision_maps: dict[tuple[str, str], dict[str, bool]],
) -> dict[str, float | None]:
    first_decisions = decision_maps[first_key]
    second_decisions = decision_maps[second_key]
    case_ids = sorted(first_decisions)
    if case_ids != sorted(second_decisions):
        raise ValueError("paired reliability cells do not contain the same cases")
    left = [first_decisions[case_id] for case_id in case_ids]
    right = [second_decisions[case_id] for case_id in case_ids]
    first_scores = {row["caseId"]: row["scoreE8"] for row in cells[first_key]}
    second_scores = {row["caseId"]: row["scoreE8"] for row in cells[second_key]}
    first_values = [first_scores[case_id] for case_id in case_ids]
    second_values = [second_scores[case_id] for case_id in case_ids]
    score_pearson = None
    if len(case_ids) >= 2 and len(set(first_values)) > 1 and len(set(second_values)) > 1:
        candidate = float(np.corrcoef(first_values, second_values)[0, 1])
        if math.isfinite(candidate):
            score_pearson = candidate
    return {
        "decisionAgreement": sum(a == b for a, b in zip(left, right, strict=True)) / len(left),
        "decisionKappa": cohen_kappa(left, right),
        "firstPositiveRate": sum(left) / len(left),
        "secondPositiveRate": sum(right) / len(right),
        "scorePearson": score_pearson,
    }


def _nested_cell(rows: list[dict[str, Any]], labels: dict[str, bool]) -> dict[str, Any]:
    verticals = sorted({row["vertical"] for row in rows})
    legacy_scores = {
        row["caseId"]: _legacy_score_from_hex(row.get("legacyComparatorScoreHex")) for row in rows
    }
    decisions: dict[str, bool] = {}
    control_decisions: dict[str, bool] = {}
    thresholds = {}
    for heldout in verticals:
        development = [row for row in rows if row["vertical"] != heldout]
        test = [row for row in rows if row["vertical"] == heldout]
        development_labels = [labels[row["caseId"]] for row in development]
        primary_threshold = threshold_at_fpr(
            [row["scoreE8"] for row in development], development_labels
        )
        control_threshold = threshold_at_fpr(
            [legacy_scores[row["caseId"]] for row in development], development_labels
        )
        thresholds[heldout] = {
            "primaryE8": primary_threshold,
            "legacyComparatorHex": control_threshold.hex(),
        }
        for row in test:
            decisions[row["caseId"]] = row["scoreE8"] >= primary_threshold
            control_decisions[row["caseId"]] = legacy_scores[row["caseId"]] >= control_threshold
    ordered_labels = [labels[row["caseId"]] for row in rows]
    ordered_decisions = [decisions[row["caseId"]] for row in rows]
    ordered_control = [control_decisions[row["caseId"]] for row in rows]
    primary_rates = _rates(ordered_decisions, ordered_labels)
    control_rates = _rates(ordered_control, ordered_labels)
    vertical_aucs = {
        vertical: roc_auc(
            [row["scoreE8"] for row in rows if row["vertical"] == vertical],
            [labels[row["caseId"]] for row in rows if row["vertical"] == vertical],
        )
        for vertical in verticals
    }
    finite_vertical_aucs = [value for value in vertical_aucs.values() if math.isfinite(value)]
    target_fidelity: dict[int, dict[str, list[int]]] = defaultdict(
        lambda: {"mapped": [], "control": [], "gain": []}
    )
    for row in rows:
        for coordinate in row["coordinates"]:
            layer = int(coordinate["layer"])
            metrics = coordinate["metrics"]
            target_fidelity[layer]["mapped"].append(
                int(metrics["mappedTargetJensenShannonDivergenceNatsE8"])
            )
            target_fidelity[layer]["control"].append(
                int(metrics["controlTargetJensenShannonDivergenceNatsE8"])
            )
            target_fidelity[layer]["gain"].append(int(metrics["lensGainJensenShannonNatsE8"]))
    return {
        "auc": roc_auc([row["scoreE8"] for row in rows], ordered_labels),
        "legacyComparatorAuc": roc_auc(
            [legacy_scores[row["caseId"]] for row in rows], ordered_labels
        ),
        "legacyComparatorProfile": LEGACY_COMPARATOR_PROFILE,
        "verticalMacroAuc": (
            None if not finite_vertical_aucs else float(np.mean(finite_vertical_aucs))
        ),
        "verticalAucs": vertical_aucs,
        "thresholdsByHeldoutVertical": thresholds,
        **primary_rates,
        "legacyComparatorRecall": control_rates["recall"],
        "legacyComparatorFpr": control_rates["fpr"],
        "recallImprovementVsLegacy": primary_rates["recall"] - control_rates["recall"],
        "meanLensGainE8": integer_mean_e8([int(row["lensGainE8"]) for row in rows]),
        "lensGainPositiveRate": sum(int(row["lensGainE8"]) > 0 for row in rows) / len(rows),
        "targetFidelityByLayer": {
            str(layer): {
                "mappedTargetMeanE8": integer_mean_e8(values["mapped"]),
                "controlTargetMeanE8": integer_mean_e8(values["control"]),
                "lensGainMeanE8": integer_mean_e8(values["gain"]),
                "lensGainPositiveRate": sum(value > 0 for value in values["gain"])
                / len(values["gain"]),
            }
            for layer, values in sorted(target_fidelity.items())
        },
        "decisions": decisions,
    }


def _bootstrap_delta(
    rows: list[dict[str, Any]],
    labels: dict[str, bool],
    *,
    samples: int,
    seed: int,
) -> list[float]:
    if type(samples) is not int or samples < 1 or samples > 1_000_000:
        raise ValueError("bootstrap samples must be an integer in [1, 1000000]")
    if type(seed) is not int or seed < 0 or seed >= 1 << 64:
        raise ValueError("bootstrap seed must be an unsigned 64-bit integer")
    rng = random.Random(seed)
    verticals = sorted({row["vertical"] for row in rows})
    if len(verticals) < 2:
        raise ValueError("whole-vertical bootstrap requires at least two verticals")
    by_vertical: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_vertical[row["vertical"]].append(row)
    deltas = []
    attempts = 0
    maximum_attempts = samples * 100
    while len(deltas) < samples and attempts < maximum_attempts:
        attempts += 1
        sampled_rows = [
            row
            for vertical in rng.choices(verticals, k=len(verticals))
            for row in by_vertical[vertical]
        ]
        sampled_labels = [labels[row["caseId"]] for row in sampled_rows]
        if not any(sampled_labels) or all(sampled_labels):
            continue
        primary = roc_auc([row["scoreE8"] for row in sampled_rows], sampled_labels)
        control = roc_auc(
            [_legacy_score_from_hex(row.get("legacyComparatorScoreHex")) for row in sampled_rows],
            sampled_labels,
        )
        if not math.isfinite(primary) or not math.isfinite(control):
            continue
        deltas.append(primary - control)
    if len(deltas) != samples:
        raise ValueError("whole-vertical bootstrap did not produce the requested samples")
    return [float(value) for value in np.quantile(deltas, [0.025, 0.5, 0.975])]


def _validate_fresh_evaluation_matrix(
    *,
    seen: set[tuple[str, str, str]],
    cells: dict[tuple[str, str], list[dict[str, Any]]],
    labels: dict[str, bool],
    case_identities: dict[str, tuple[str, str]],
    report: dict[str, Any] | None,
) -> None:
    expected = {
        (case_id, frame, alias)
        for case_id in labels
        for frame in FRESH_FRAMES
        for alias in FRESH_ALIASES
    }
    if seen != expected or set(cells) != {
        (frame, alias) for frame in FRESH_FRAMES for alias in FRESH_ALIASES
    }:
        raise ValueError("fresh evaluation requires the exact complete 2x2 case matrix")
    vertical_counts: dict[str, int] = defaultdict(int)
    for vertical, _ in case_identities.values():
        vertical_counts[vertical] += 1
    if (
        report is None
        or len(labels) != 240
        or sum(labels.values()) != 120
        or len({identity[1] for identity in case_identities.values()}) != 240
        or dict(sorted(vertical_counts.items())) != report.get("verticalCounts")
        or report.get("positiveCount") != sum(labels.values())
        or report.get("negativeCount") != len(labels) - sum(labels.values())
    ):
        raise ValueError("fresh labels or row identities contradict the sealed corpus report")


def evaluate(args: argparse.Namespace) -> None:
    if (
        type(args.bootstrap_samples) is not int
        or args.bootstrap_samples < 1
        or type(args.bootstrap_seed) is not int
        or args.bootstrap_seed < 0
        or args.bootstrap_seed >= 1 << 64
    ):
        raise ValueError("bootstrap configuration is invalid")
    if args.status == "fresh" and (
        args.primary_frame != FRESH_PRIMARY["frame"]
        or args.primary_alias != FRESH_PRIMARY["modelAlias"]
        or args.bootstrap_samples != FRESH_BOOTSTRAP_SAMPLES
        or args.bootstrap_seed != FRESH_BOOTSTRAP_SEED
    ):
        raise ValueError("fresh evaluation must use the frozen primary cell and bootstrap")

    rows = _read_jsonl(args.rows)
    collection = _read_json(args.collection_manifest)
    receipt_rows = _read_jsonl(args.receipts)
    prompt_rows = _read_jsonl(args.prompt_manifest)
    _validate_prompt_manifest(prompt_rows)
    if (
        collection.get("schema") != COLLECTION_SCHEMA
        or collection.get("status") != args.status
        or not _self_hash_matches(collection)
        or collection.get("rowArtifactSha256") != _sha256_file(args.rows)
        or collection.get("receiptArtifactSha256") != _sha256_file(args.receipts)
        or collection.get("promptManifestSha256") != _sha256_file(args.prompt_manifest)
        or collection.get("codeFileSha256") != _sha256_file(__file__)
        or collection.get("rowCount") != len(rows)
        or collection.get("receiptCount") != len(receipt_rows)
        or collection.get("promptCount") != len(prompt_rows)
        or collection.get("maximumTokenCount") != MAX_PROMPT_TOKENS
        or collection.get("measurementProfile") != MODEL_WORKSPACE_MEASUREMENT_PROFILE
        or collection.get("controlProfile") != MODEL_WORKSPACE_CONTROL_PROFILE
        or collection.get("scoreProfile") != MODEL_WORKSPACE_SCORE_PROFILE
        or collection.get("legacyComparatorProfile") != LEGACY_COMPARATOR_PROFILE
        or collection.get("truncatedRowCount") != 0
        or collection.get("allowTruncated") is not False
    ):
        raise ValueError("collection manifest does not bind this sealed evaluation input")

    prompts = {(row["caseId"], row["frame"]): row for row in prompt_rows}
    receipts: dict[tuple[str, str, str], dict[str, Any]] = {}
    for receipt_row in receipt_rows:
        coordinate = (
            receipt_row.get("caseId"),
            receipt_row.get("frame"),
            receipt_row.get("modelAlias"),
        )
        if (
            set(receipt_row) != {"caseId", "frame", "modelAlias", "receipt"}
            or not all(isinstance(value, str) and value for value in coordinate)
            or coordinate in receipts
            or not isinstance(receipt_row.get("receipt"), dict)
        ):
            raise ValueError(f"malformed or duplicate source receipt coordinate: {coordinate}")
        receipts[coordinate] = receipt_row["receipt"]
    if args.status == "fresh" and (
        not isinstance(collection.get("codeRevision"), str)
        or len(collection["codeRevision"]) != 40
        or any(character not in "0123456789abcdef" for character in collection["codeRevision"])
    ):
        raise ValueError("fresh collection requires an exact 40-character git revision")

    fresh_report = None
    if args.status == "fresh":
        models = collection.get("models")
        layers = collection.get("layers")
        positions = collection.get("positions")
        k = collection.get("k")
        if (
            not isinstance(models, list)
            or not isinstance(layers, list)
            or not isinstance(positions, list)
            or not _is_int(k, minimum=1, maximum=MAX_WORKSPACE_TOP_K)
            or set(model.get("alias") for model in models if isinstance(model, dict))
            != set(FRESH_ALIASES)
            or len(models) != 2
            or len({model.get("lensSha256") for model in models if isinstance(model, dict)}) != 2
        ):
            raise ValueError("fresh collection does not bind distinct A/B model policies")
        _, fresh_report, _ = _load_fresh_contract(
            args,
            prompt_sha256=collection.get("promptManifestSha256"),
            labels_sha256=_sha256_file(args.labels),
            models=models,
            layers=layers,
            positions=positions,
            k=k,
            code_revision=collection["codeRevision"],
            expected_seal_commit=collection.get("freshSealCommit"),
        )
        if (
            collection.get("freshManifestSha256") != _sha256_file(args.fresh_manifest)
            or collection.get("freshReportSha256") != _sha256_file(args.fresh_report)
            or collection.get("preregistrationSha256") != _sha256_file(args.preregistration)
            or collection.get("labelsSha256") != _sha256_file(args.labels)
        ):
            raise ValueError("fresh collection does not bind the supplied sealed corpus contract")

    label_rows = _read_jsonl(args.labels)
    labels = {}
    for row in label_rows:
        if (
            set(row) != {"caseId", "positive"}
            or not isinstance(row.get("caseId"), str)
            or type(row.get("positive")) is not bool
            or row["caseId"] in labels
        ):
            raise ValueError("labels require unique caseId and boolean positive fields")
        labels[row["caseId"]] = row["positive"]
    row_case_ids = {row.get("caseId") for row in rows}
    if row_case_ids != set(labels):
        raise ValueError("row and label case IDs do not match exactly")
    if args.status == "fresh" and any(row.get("truncated") is not False for row in rows):
        raise ValueError("fresh evaluation rejects every truncated row")

    cells: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    seen = set()
    case_identities: dict[str, tuple[str, str]] = {}
    model_policy = {
        model["alias"]: model for model in collection.get("models", []) if isinstance(model, dict)
    }
    capability_policy = collection.get("capabilities")
    if not isinstance(capability_policy, dict):
        raise ValueError("collection manifest lacks capability snapshots")
    for row in rows:
        coordinate = (row.get("caseId"), row.get("frame"), row.get("modelAlias"))
        if coordinate in seen:
            raise ValueError(f"duplicate evaluation row: {coordinate}")
        model = model_policy.get(row.get("modelAlias"))
        capability = capability_policy.get(row.get("modelAlias"))
        source_receipt = receipts.get(coordinate)
        prompt_row = prompts.get((row.get("caseId"), row.get("frame")))
        identity = (row.get("vertical"), row.get("templateId"))
        if (
            not all(isinstance(value, str) and value for value in coordinate)
            or not all(isinstance(value, str) and value for value in identity)
            or (row["caseId"] in case_identities and case_identities[row["caseId"]] != identity)
            or model is None
            or not isinstance(capability, dict)
            or source_receipt is None
            or prompt_row is None
            or prompt_row.get("vertical") != row.get("vertical")
            or prompt_row.get("templateId") != row.get("templateId")
            or row.get("modelId") != model.get("modelId")
            or row.get("lensSha256") != model.get("lensSha256")
            or not _is_sha256(row.get("receiptHash"))
            or not _is_sha256(row.get("observationSha256"))
            or not _is_sha256(row.get("promptSha256"))
            or not _is_int(row.get("originalTokenCount"), minimum=1)
            or not _is_int(row.get("tokenCount"), minimum=1, maximum=MAX_PROMPT_TOKENS)
            or row["originalTokenCount"] < row["tokenCount"]
            or not _is_int(row.get("scoreE8"), minimum=0, maximum=MAX_JENSEN_SHANNON_NATS_E8)
            or row.get("legacyComparatorProfile") != LEGACY_COMPARATOR_PROFILE
            or not _is_int(
                row.get("lensGainE8"),
                minimum=-MAX_JENSEN_SHANNON_NATS_E8,
                maximum=MAX_JENSEN_SHANNON_NATS_E8,
            )
            or not isinstance(row.get("coordinates"), list)
        ):
            raise ValueError(f"malformed or unbound evaluation row: {coordinate}")
        extracted = _validate_receipt(
            source_receipt,
            prompt=prompt_row["prompt"],
            binding=model,
            checkpoint_sha256=collection.get("checkpointSha256"),
            tokenizer_sha256=collection.get("tokenizerSha256"),
            layers=collection.get("layers"),
            positions=collection.get("positions"),
            k=collection.get("k"),
            allow_truncated=False,
            capability=capability,
        )
        if (
            source_receipt.get("receiptHash") != row["receiptHash"]
            or source_receipt.get("observationSha256") != row["observationSha256"]
            or source_receipt.get("input", {}).get("promptSha256") != row["promptSha256"]
            or source_receipt.get("input", {}).get("originalTokenCount")
            != row["originalTokenCount"]
            or source_receipt.get("input", {}).get("tokenCount") != row["tokenCount"]
            or source_receipt.get("input", {}).get("truncated") != row["truncated"]
            or extracted
            != {
                "scoreE8": row["scoreE8"],
                "legacyComparatorProfile": row["legacyComparatorProfile"],
                "legacyComparatorScoreHex": row["legacyComparatorScoreHex"],
                "lensGainE8": row["lensGainE8"],
                "coordinates": row["coordinates"],
            }
        ):
            raise ValueError(f"derived row does not match source receipt: {coordinate}")
        seen.add(coordinate)
        case_identities[row["caseId"]] = identity
        cells[(row["frame"], row["modelAlias"])].append(row)

    if set(receipts) != seen:
        raise ValueError("source receipt artifact does not match the derived row coordinates")

    if args.status == "fresh":
        _validate_fresh_evaluation_matrix(
            seen=seen,
            cells=cells,
            labels=labels,
            case_identities=case_identities,
            report=fresh_report,
        )
    cell_results = {}
    decision_maps = {}
    for (frame, alias), cell_rows in sorted(cells.items()):
        result = _nested_cell(cell_rows, labels)
        result["aucDelta"] = result["auc"] - result["legacyComparatorAuc"]
        cell_seed = (
            args.bootstrap_seed
            if (frame, alias) == (args.primary_frame, args.primary_alias)
            else int.from_bytes(
                hashlib.sha256(f"{args.bootstrap_seed}|{frame}|{alias}".encode()).digest()[:8],
                "big",
            )
        )
        result["deltaBootstrap95"] = _bootstrap_delta(
            cell_rows,
            labels,
            samples=args.bootstrap_samples,
            seed=cell_seed,
        )
        result["bootstrap"] = {
            "method": BOOTSTRAP_METHOD,
            "samples": args.bootstrap_samples,
            "seed": str(cell_seed),
        }
        decision_maps[(frame, alias)] = result.pop("decisions")
        cell_results[f"{frame}:{alias}"] = result

    primary_key = (args.primary_frame, args.primary_alias)
    if primary_key not in decision_maps:
        raise ValueError("primary frame/alias cell is absent")
    primary = cell_results[f"{args.primary_frame}:{args.primary_alias}"]
    other_aliases = sorted(
        alias
        for frame, alias in decision_maps
        if frame == args.primary_frame and alias != args.primary_alias
    )
    other_frames = sorted(
        frame
        for frame, alias in decision_maps
        if alias == args.primary_alias and frame != args.primary_frame
    )
    ab_reliability = (
        None
        if not other_aliases
        else _paired_reliability(
            primary_key,
            (args.primary_frame, other_aliases[0]),
            cells=cells,
            decision_maps=decision_maps,
        )
    )
    frame_reliability = (
        None
        if not other_frames
        else _paired_reliability(
            primary_key,
            (other_frames[0], args.primary_alias),
            cells=cells,
            decision_maps=decision_maps,
        )
    )
    delta_interval = primary["deltaBootstrap95"]
    gates = {
        "auc": primary["auc"] >= 0.70,
        "aucDelta": primary["aucDelta"] >= 0.10 and delta_interval[0] > 0,
        "abAgreement": (ab_reliability is not None and ab_reliability["decisionAgreement"] >= 0.90),
    }
    admission_checks = {
        "abKappa": (
            ab_reliability is not None
            and ab_reliability["decisionKappa"] is not None
            and ab_reliability["decisionKappa"] >= 0.80
        ),
        "frameAgreement": (
            frame_reliability is not None and frame_reliability["decisionAgreement"] >= 0.90
        ),
        "frameKappa": (
            frame_reliability is not None
            and frame_reliability["decisionKappa"] is not None
            and frame_reliability["decisionKappa"] >= 0.80
        ),
    }
    result = {
        "schema": EVALUATION_SCHEMA,
        "status": args.status,
        "createdAt": _utc_now(),
        "rowsSha256": _sha256_file(args.rows),
        "collectionManifestSha256": _sha256_file(args.collection_manifest),
        "codeFileSha256": _sha256_file(__file__),
        "labelsSha256": _sha256_file(args.labels),
        "primaryCell": {"frame": args.primary_frame, "modelAlias": args.primary_alias},
        "caseCount": len(labels),
        "rowCount": len(rows),
        "cells": cell_results,
        "abReliability": ab_reliability,
        "frameReliability": frame_reliability,
        "gates": gates,
        "admissionChecks": admission_checks,
        "bootstrap": {
            "method": BOOTSTRAP_METHOD,
            "samples": args.bootstrap_samples,
            "baseSeed": str(args.bootstrap_seed),
        },
        "freshContractValid": args.status == "fresh",
        "promotionAllowed": (
            args.status == "fresh" and all(gates.values()) and all(admission_checks.values())
        ),
    }
    _write_json_atomic(args.output, result)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare-exposed-gaps")
    prepare_parser.add_argument("--gap-dir", required=True)
    prepare_parser.add_argument("--corpus-root", required=True)
    prepare_parser.add_argument("--prompts", required=True)
    prepare_parser.add_argument("--labels", required=True)
    prepare_parser.add_argument("--prepare-manifest", required=True)
    prepare_parser.add_argument(
        "--frame-profile", choices=("compact-v2", "legacy-v1"), default="compact-v2"
    )
    prepare_parser.set_defaults(handler=prepare_exposed_gaps)

    collect_parser = subparsers.add_parser("collect")
    collect_parser.add_argument("--endpoint", required=True)
    collect_parser.add_argument("--prompt-manifest", required=True)
    collect_parser.add_argument("--output", required=True)
    collect_parser.add_argument("--receipt-output", required=True)
    collect_parser.add_argument("--run-manifest", required=True)
    collect_parser.add_argument(
        "--model", action="append", type=_parse_model_binding, required=True
    )
    collect_parser.add_argument("--checkpoint-sha256", required=True)
    collect_parser.add_argument("--tokenizer-sha256", required=True)
    collect_parser.add_argument("--layers", nargs="+", type=int, required=True)
    collect_parser.add_argument("--positions", nargs="+", type=int, required=True)
    collect_parser.add_argument("--k", type=int, default=25)
    collect_parser.add_argument("--allow-truncated", action="store_true")
    collect_parser.add_argument("--status", choices=("diagnostic", "fresh"), default="diagnostic")
    collect_parser.add_argument("--code-revision", default=None)
    collect_parser.add_argument("--fresh-manifest")
    collect_parser.add_argument("--fresh-report")
    collect_parser.add_argument("--preregistration")
    collect_parser.set_defaults(handler=collect)

    evaluate_parser = subparsers.add_parser("evaluate")
    evaluate_parser.add_argument("--rows", required=True)
    evaluate_parser.add_argument("--receipts", required=True)
    evaluate_parser.add_argument("--prompt-manifest", required=True)
    evaluate_parser.add_argument("--collection-manifest", required=True)
    evaluate_parser.add_argument("--labels", required=True)
    evaluate_parser.add_argument("--output", required=True)
    evaluate_parser.add_argument("--status", choices=("diagnostic", "fresh"), required=True)
    evaluate_parser.add_argument("--primary-frame", default="unprimed")
    evaluate_parser.add_argument("--primary-alias", default="a")
    evaluate_parser.add_argument("--bootstrap-samples", type=int, default=10_000)
    evaluate_parser.add_argument("--bootstrap-seed", type=int, default=4_731_550_821_279_453_854)
    evaluate_parser.add_argument("--fresh-manifest")
    evaluate_parser.add_argument("--fresh-report")
    evaluate_parser.add_argument("--preregistration")
    evaluate_parser.set_defaults(handler=evaluate)
    return parser


def main() -> None:
    args = _parser().parse_args()
    if not _is_sha256(getattr(args, "checkpoint_sha256", "sha256:" + "0" * 64)):
        raise SystemExit("--checkpoint-sha256 must be a sha256 digest")
    if not _is_sha256(getattr(args, "tokenizer_sha256", "sha256:" + "0" * 64)):
        raise SystemExit("--tokenizer-sha256 must be a sha256 digest")
    args.handler(args)


if __name__ == "__main__":
    main()
