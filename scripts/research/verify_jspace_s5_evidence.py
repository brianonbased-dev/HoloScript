#!/usr/bin/env python3
"""Verify the public, label-blind J-space S5 negative-pilot evidence.

The private lens tensors are intentionally absent. This verifier instead binds
the promoted evidence to exact Git blobs, checks every public artifact hash,
and recomputes the receipt/observation linkage and disclosure boundary.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from typing import Any, Iterable


SCHEMA = "holoscript.jspace-s5-pilot-evidence-manifest.v0.1.0"
FIT_SCHEMA = "holoscript.jspace-s5-fit-receipt.v0.1.0"
COLLECTION_SCHEMA = "holoserve.workspace-signal-collection.v0.1.0"
FIDELITY_SCHEMA = "holoscript.model-workspace-fidelity-evaluation.v0.4.0"
WORKSPACE_RECEIPT_SCHEMA = "holoscript.model-workspace-receipt.v0.2.0"
PROFILE = "s5-unscaled-mean-centered-jacobian-v1"
EXPECTED_ARTIFACTS = {
    "pilot-a-fit.json",
    "pilot-b-fit.json",
    "pilot-collection.json",
    "pilot-fidelity.json",
    "pilot-receipts.jsonl",
    "pilot-rows.jsonl",
}
EXPECTED_SOURCE_COUNT = 15
EXPECTED_FIT_SOURCE_COUNT = 46
EXPECTED_CASE_COUNT = 36
EXPECTED_ROW_COUNT = 72
FROZEN_BOOTSTRAP_SEED = "7301642128954031337"
FROZEN_REVISION = "c36043724c0be14ca110893515f9d06a2424d7c0"
FROZEN_MANIFEST_SELF_HASH = (
    "sha256:66f1ac6289ed025709c88b21275fd0822fde33af5859b007866b364f3581ca24"
)
FROZEN_PROMOTED_ARTIFACTS = {
    "pilot-a-fit.json": "sha256:d06c8e877a7b1d724a79b2d09f02eda1b70af668fdda59d3e51f7c431d020547",
    "pilot-b-fit.json": "sha256:6cf3e86a308c757a8c5522e1167dbc7e2250830bc8fa4525a127199140b9a296",
    "pilot-collection.json": "sha256:bdec567cef9d5526ef050d0cc814749de105bb40b1e4733278fc5bda7ba29201",
    "pilot-fidelity.json": "sha256:0daea72bfe50b25d3dd3113420ba15de2e3853f7e09d828a203d675d85e6a3d6",
    "pilot-rows.jsonl": "sha256:f7a2116b5a1d2caa594609e178ed01c18910afc7d7b9f408351f4708353fa29f",
    "pilot-receipts.jsonl": "sha256:c3340b9630b053cf5726a7cafda9e22994f2b177de4f2d4f7f8f2c9bd7eec201",
}
EXPECTED_SOURCE_PATHS = {
    "preregistration": "research/2026-07-15-jspace-s5-unscaled-centered-preregistration.md",
    "s2-corpus-manifest": "research/data/jspace-s2/corpus-manifest.json",
    "s3-selection-manifest": "research/data/jspace-s3/selection-manifest.json",
    "s4-selection-manifest": "research/data/jspace-s4/selection-manifest.json",
    "s4-control-profile": "research/data/jspace-s4/control-profile.json",
    "s4-failed-pilot-evidence": "research/measurements/jspace-s4/pilot-manifest.json",
    "selection-manifest": "research/data/jspace-s5/selection-manifest.json",
    "control-profile": "research/data/jspace-s5/control-profile.json",
    "selection-code": "scripts/research/select_jspace_s5_corpus.py",
    "fit-code": "scripts/research/fit_jspace_s5_lens.py",
    "fit-admission-tests": "scripts/research/test_fit_jspace_s5_lens.py",
    "lens-loader": "packages/holoserve-py/holoserve/workspace_probe.py",
    "collection-code": "packages/holoserve-py/holoserve/workspace_eval.py",
    "evaluation-code": "packages/holoserve-py/holoserve/workspace_fidelity.py",
    "holdout-prompt-artifact": "research/data/jspace-s5/fidelity-h-pilot.jsonl",
}
EXPECTED_FIT_SOURCE_PATHS = {
    "packages/holollama/src/__tests__/holollama.test.ts",
    "packages/holollama/src/index.ts",
    "packages/holollama/src/model-workspace-probe.ts",
    "packages/holoserve-py/holoserve/model.py",
    "packages/holoserve-py/holoserve/server.py",
    "packages/holoserve-py/holoserve/tokenizer.py",
    "packages/holoserve-py/holoserve/workspace_eval.py",
    "packages/holoserve-py/holoserve/workspace_fidelity.py",
    "packages/holoserve-py/holoserve/workspace_probe.py",
    "packages/holoserve-py/tests/test_server_registry.py",
    "packages/holoserve-py/tests/test_workspace_fidelity.py",
    "packages/holoserve-py/tests/test_workspace_probe.py",
    "research/2026-07-15-jspace-s4-centered-scalar-preregistration.md",
    "research/2026-07-15-jspace-s5-unscaled-centered-preregistration.md",
    "research/data/jspace-s2/corpus-manifest.json",
    "research/data/jspace-s2/leakage-report.json",
    "research/data/jspace-s2/reference-manifest.json",
    "research/data/jspace-s3/selection-manifest.json",
    "research/data/jspace-s4/control-profile.json",
    "research/data/jspace-s4/fidelity-h-confirmation.jsonl",
    "research/data/jspace-s4/fit-a-confirmation.jsonl",
    "research/data/jspace-s4/fit-b-confirmation.jsonl",
    "research/data/jspace-s4/selection-manifest.json",
    "research/data/jspace-s5/control-profile.json",
    "research/data/jspace-s5/fidelity-h-confirmation.jsonl",
    "research/data/jspace-s5/fidelity-h-pilot.jsonl",
    "research/data/jspace-s5/fit-a-confirmation.jsonl",
    "research/data/jspace-s5/fit-a-pilot.jsonl",
    "research/data/jspace-s5/fit-b-confirmation.jsonl",
    "research/data/jspace-s5/fit-b-pilot.jsonl",
    "research/data/jspace-s5/selection-manifest.json",
    "research/measurements/jspace-s4/pilot-a-fit.json",
    "research/measurements/jspace-s4/pilot-b-fit.json",
    "research/measurements/jspace-s4/pilot-collection.json",
    "research/measurements/jspace-s4/pilot-fidelity.json",
    "research/measurements/jspace-s4/pilot-manifest.json",
    "research/measurements/jspace-s4/pilot-receipts.jsonl",
    "research/measurements/jspace-s4/pilot-rows.jsonl",
    "scripts/research/fit_jspace_s4_lens.py",
    "scripts/research/fit_jspace_s5_lens.py",
    "scripts/research/select_jspace_s4_corpus.py",
    "scripts/research/select_jspace_s5_corpus.py",
    "scripts/research/test_fit_jspace_s4_lens.py",
    "scripts/research/test_fit_jspace_s5_lens.py",
    "scripts/research/test_select_jspace_s4_corpus.py",
    "scripts/research/test_select_jspace_s5_corpus.py",
}
EXPECTED_ROW_FIELDS = {
    "caseId",
    "coordinates",
    "frame",
    "legacyComparatorProfile",
    "legacyComparatorScoreHex",
    "lensGainE8",
    "lensSha256",
    "modelAlias",
    "modelId",
    "observationSha256",
    "originalTokenCount",
    "promptSha256",
    "receiptHash",
    "scoreE8",
    "templateId",
    "tokenCount",
    "truncated",
    "vertical",
}
SHA256_RE = re.compile(r"sha256:[0-9a-f]{64}\Z")
GIT_REVISION_RE = re.compile(r"[0-9a-f]{40}\Z")
ABSOLUTE_PATH_RE = re.compile(r"(?:[A-Za-z]:\\\\|[A-Za-z]:/)")
CREDENTIAL_RE = re.compile(
    r"(?:Bearer\s+[A-Za-z0-9._-]{16,}|\bsk-[A-Za-z0-9_-]{16,})"
)
RAW_PROMPT_KEYS = {
    "prompt",
    "ask",
    "scenario",
    "answer",
    "label",
    "labels",
    "positive",
    "solvable",
    "intended",
    "target",
    "groundtruth",
}
FORBIDDEN_RECEIPT_KEYS = {
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


class EvidenceError(ValueError):
    """Evidence failed a deterministic admission check."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise EvidenceError(message)


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
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise EvidenceError(f"cannot read JSON {path.name}: {error}") from error
    _require(isinstance(value, dict), f"{path.name} is not a JSON object")
    return value


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    values: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise EvidenceError(f"cannot read JSONL {path.name}: {error}") from error
    for line_number, raw in enumerate(lines, 1):
        try:
            value = json.loads(raw)
        except json.JSONDecodeError as error:
            raise EvidenceError(
                f"invalid JSON at {path.name}:{line_number}: {error.msg}"
            ) from error
        _require(
            isinstance(value, dict),
            f"{path.name}:{line_number} is not a JSON object",
        )
        values.append(value)
    return values


def _self_hash(value: dict[str, Any], field: str) -> str:
    payload = dict(value)
    payload[field] = None
    return _sha256_json(payload)


def _git_blob(repo_root: Path, revision: str, relative_path: str) -> bytes:
    _require(
        relative_path == Path(relative_path).as_posix()
        and not Path(relative_path).is_absolute()
        and not relative_path.startswith("/")
        and ".." not in Path(relative_path).parts,
        f"unsafe repository path: {relative_path!r}",
    )
    result = subprocess.run(
        ["git", "show", f"{revision}:{relative_path}"],
        cwd=repo_root,
        check=False,
        capture_output=True,
    )
    _require(
        result.returncode == 0,
        f"missing exact-revision Git blob: {relative_path}",
    )
    return result.stdout


def _verify_git_hashes(
    repo_root: Path, revision: str, sources: dict[str, str], label: str
) -> None:
    for relative_path, expected in sources.items():
        _require(
            isinstance(relative_path, str)
            and isinstance(expected, str)
            and SHA256_RE.fullmatch(expected) is not None,
            f"invalid {label} source entry",
        )
        observed = _sha256_bytes(_git_blob(repo_root, revision, relative_path))
        _require(observed == expected, f"{label} Git blob hash mismatch: {relative_path}")


def _fit_binding_payload(fit: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "holoscript.jspace-s5-fit-binding.v0.1.0",
        "experimentProfile": fit.get("experimentProfile"),
        "estimator": fit.get("estimator"),
        "transportProfile": fit.get("transportProfile"),
        "formulaSha256": fit.get("formulaSha256"),
        "controlProfileSha256": fit.get("controlProfileSha256"),
        "checkpointSha256": fit.get("checkpointSha256"),
        "tokenizerSha256": fit.get("tokenizerSha256"),
        "sourceArtifactSha256": fit.get("sourceArtifactSha256"),
        "calibrationCorpusSha256": fit.get("calibrationCorpusSha256"),
        "calibrationShardSha256": fit.get("calibrationShardSha256"),
        "sampleCount": fit.get("rowCount"),
        "positionBinCounts": fit.get("positionBinCounts"),
        "sequenceOrderSha256": fit.get("sequenceOrderSha256"),
        "sequenceSetSha256": fit.get("sequenceSetSha256"),
        "tensorDigestSchema": fit.get("tensorDigestSchema"),
        "tensorSha256": fit.get("tensorSha256"),
        "layers": fit.get("layers"),
        "positionBins": fit.get("positionBins"),
        "preregistrationSha256": fit.get("preregistrationSha256"),
        "selectorSha256": fit.get("selectorSha256"),
        "fitSourceSha256s": dict(sorted(fit.get("fitSourceSha256s", {}).items())),
    }


def _replay_fidelity(
    repo_root: Path,
    evidence_dir: Path,
    revision: str,
    fidelity: dict[str, Any],
) -> dict[str, Any]:
    bootstrap = fidelity.get("bootstrap")
    _require(isinstance(bootstrap, dict), "fidelity bootstrap contract is missing")
    samples = bootstrap.get("samples")
    seed = bootstrap.get("seed")
    _require(type(samples) is int and samples == 10_000, "bootstrap sample count changed")
    _require(
        isinstance(seed, str)
        and seed.isdecimal()
        and seed == FROZEN_BOOTSTRAP_SEED,
        "bootstrap seed differs from the frozen decimal string",
    )
    module_paths = {
        "workspace_fidelity.py": "packages/holoserve-py/holoserve/workspace_fidelity.py",
        "workspace_eval.py": "packages/holoserve-py/holoserve/workspace_eval.py",
        "workspace_probe.py": "packages/holoserve-py/holoserve/workspace_probe.py",
    }
    with tempfile.TemporaryDirectory(prefix="jspace-s5-replay-") as temporary:
        root = Path(temporary)
        package = root / "holoserve"
        package.mkdir()
        (package / "__init__.py").write_text("", encoding="utf-8")
        for name, relative_path in module_paths.items():
            (package / name).write_bytes(_git_blob(repo_root, revision, relative_path))
        prompt_path = root / "fidelity-h-pilot.jsonl"
        preregistration_path = root / "preregistration.md"
        prompt_path.write_bytes(
            _git_blob(
                repo_root,
                revision,
                EXPECTED_SOURCE_PATHS["holdout-prompt-artifact"],
            )
        )
        preregistration_path.write_bytes(
            _git_blob(repo_root, revision, EXPECTED_SOURCE_PATHS["preregistration"])
        )
        output_path = root / "replayed-fidelity.json"
        environment = dict(os.environ)
        environment["PYTHONPATH"] = os.pathsep.join(
            part
            for part in (str(root), environment.get("PYTHONPATH", ""))
            if part
        )
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "holoserve.workspace_fidelity",
                "--rows",
                str(evidence_dir / "pilot-rows.jsonl"),
                "--receipts",
                str(evidence_dir / "pilot-receipts.jsonl"),
                "--prompt-manifest",
                str(prompt_path),
                "--collection-manifest",
                str(evidence_dir / "pilot-collection.json"),
                "--preregistration",
                str(preregistration_path),
                "--output",
                str(output_path),
                "--bootstrap-samples",
                str(samples),
                "--bootstrap-seed",
                seed,
                "--gate-profile",
                PROFILE,
            ],
            cwd=repo_root,
            env=environment,
            check=False,
            capture_output=True,
            text=True,
            timeout=180,
        )
        detail = (result.stderr or result.stdout).strip()[-800:]
        _require(
            result.returncode == 0 and output_path.is_file(),
            f"exact-revision fidelity replay failed: {detail}",
        )
        replayed = _read_json(output_path)
    ignored = {"createdAt", "selfHash"}
    expected_semantics = {
        key: value for key, value in fidelity.items() if key not in ignored
    }
    replayed_semantics = {
        key: value for key, value in replayed.items() if key not in ignored
    }
    if replayed_semantics != expected_semantics:
        differing = sorted(
            key
            for key in set(expected_semantics) | set(replayed_semantics)
            if expected_semantics.get(key) != replayed_semantics.get(key)
        )
        raise EvidenceError(
            "exact-revision fidelity replay mismatch: " + ", ".join(differing)
        )
    return replayed


def _count_exact_keys(value: Any, forbidden: set[str]) -> int:
    if isinstance(value, dict):
        return sum(str(key).casefold() in forbidden for key in value) + sum(
            _count_exact_keys(child, forbidden) for child in value.values()
        )
    if isinstance(value, list):
        return sum(_count_exact_keys(child, forbidden) for child in value)
    return 0


def _contains_private_numeric_scalars(
    value: Any, path: tuple[str, ...] = ()
) -> bool:
    raw_symbols = {"s", "c", "si", "ci", "jbar", "xbar", "ybar", "m", "b"}
    allowed_scalar_fields = {
        "primaryalphainterior",
        "primarybetainterior",
        "scalibratedgainbootstraplowerabovezero",
        "unscaledgainbootstraplowerabovezero",
        "jacobianspecificgainbootstraplowerabovezero",
        "unscaledovercalibratedclaimadmitted",
        "jacobianspecificclaimadmitted",
    }
    if isinstance(value, dict):
        if path and path[-1] == "fitsourcesha256s":
            return any(
                not isinstance(source, str)
                or not isinstance(digest, str)
                or SHA256_RE.fullmatch(digest) is None
                for source, digest in value.items()
            )
        for key, child in value.items():
            normalized = "".join(
                character for character in str(key).lower() if character.isalnum()
            )
            public_control = (
                normalized in {"scalarcalibrated", "scalaridentity"}
                and bool(path)
                and path[-1] == "transportcontrolmetrics"
                and "observation" in path
                and "layers" in path
            )
            if normalized in raw_symbols and not isinstance(child, dict):
                return True
            if ("alpha" in normalized or "beta" in normalized) and (
                normalized not in allowed_scalar_fields
            ):
                return True
            if "statistic" in normalized or normalized.endswith("stats"):
                return True
            if "scalar" in normalized and not public_control:
                return True
            if _contains_private_numeric_scalars(child, (*path, normalized)):
                return True
    elif isinstance(value, list):
        return any(_contains_private_numeric_scalars(child, path) for child in value)
    return False


def _verify_disclosure(values: Iterable[Any], rows: list[dict[str, Any]]) -> None:
    public_values = list(values)
    for row in rows:
        row_without_coordinates = dict(row)
        coordinates = row_without_coordinates.pop("coordinates", None)
        _require(
            not _contains_private_numeric_scalars(row_without_coordinates),
            "row exposes private numeric fit state",
        )
        _require(
            not _contains_private_numeric_scalars(
                {"observation": {"layers": coordinates}}
            ),
            "row coordinates expose private numeric fit state",
        )
    _require(
        not any(_contains_private_numeric_scalars(value) for value in public_values),
        "promoted evidence exposes private numeric fit state",
    )
    all_values = [*public_values, *rows]
    serialized = "\n".join(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        for value in all_values
    )
    _require(ABSOLUTE_PATH_RE.search(serialized) is None, "absolute local path leaked")
    _require(CREDENTIAL_RE.search(serialized) is None, "credential signature leaked")
    _require(
        sum(_count_exact_keys(value, RAW_PROMPT_KEYS) for value in all_values) == 0,
        "raw prompt/answer field leaked",
    )


def verify(repo_root: Path, evidence_dir: Path) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    evidence_dir = evidence_dir.resolve()
    manifest = _read_json(evidence_dir / "pilot-manifest.json")
    _require(manifest.get("schema") == SCHEMA, "unexpected evidence manifest schema")
    _require(manifest.get("status") == "failed-frozen-gate", "unexpected pilot status")
    revision = manifest.get("gitRevision")
    _require(
        isinstance(revision, str)
        and GIT_REVISION_RE.fullmatch(revision) is not None
        and revision == FROZEN_REVISION,
        "evidence is not bound to the frozen exact Git revision",
    )
    _require(
        manifest.get("selfHash") == FROZEN_MANIFEST_SELF_HASH
        and manifest.get("selfHash") == _self_hash(manifest, "selfHash"),
        "manifest differs from the frozen trust root",
    )

    source_rows = manifest.get("sources")
    _require(
        isinstance(source_rows, list) and len(source_rows) == EXPECTED_SOURCE_COUNT,
        "manifest source set is incomplete",
    )
    sources: dict[str, str] = {}
    source_paths_by_role: dict[str, str] = {}
    for row in source_rows:
        _require(isinstance(row, dict), "invalid manifest source row")
        role = row.get("role")
        path = row.get("path")
        digest = row.get("sha256")
        _require(
            isinstance(role, str)
            and role not in source_paths_by_role
            and isinstance(path, str)
            and path not in sources
            and isinstance(digest, str),
            "duplicate or invalid manifest source row",
        )
        source_paths_by_role[role] = path
        sources[path] = digest
    _require(
        source_paths_by_role == EXPECTED_SOURCE_PATHS,
        "manifest source roles/paths differ from the frozen contract",
    )
    _verify_git_hashes(repo_root, revision, sources, "manifest")

    promoted = manifest.get("promotedArtifacts")
    _require(isinstance(promoted, list), "missing promoted artifact list")
    promoted_names: set[str] = set()
    for row in promoted:
        _require(isinstance(row, dict), "invalid promoted artifact row")
        relative_path = row.get("path")
        _require(isinstance(relative_path, str), "promoted artifact path is invalid")
        name = Path(relative_path).name
        _require(
            relative_path == f"research/measurements/jspace-s5/{name}"
            and name in FROZEN_PROMOTED_ARTIFACTS,
            f"promoted artifact path is not frozen: {relative_path}",
        )
        _require(name not in promoted_names, f"duplicate promoted artifact: {name}")
        promoted_names.add(name)
        path = evidence_dir / name
        _require(path.is_file(), f"missing promoted artifact: {name}")
        _require(path.stat().st_size == row.get("bytes"), f"byte length mismatch: {name}")
        _require(
            row.get("sha256") == FROZEN_PROMOTED_ARTIFACTS[name]
            and _sha256_file(path) == row.get("sha256"),
            f"SHA-256 mismatch: {name}",
        )
    _require(promoted_names == EXPECTED_ARTIFACTS, "promoted artifact set is not exact")
    _require(
        not list(evidence_dir.glob("confirmation-*")),
        "confirmation artifact exists despite failed pilot",
    )

    fits = {
        lane: _read_json(evidence_dir / f"pilot-{lane}-fit.json")
        for lane in ("a", "b")
    }
    fit_self_hashes = manifest.get("fitReceiptSelfHashes")
    _require(isinstance(fit_self_hashes, dict), "missing fit receipt self-hashes")
    external = manifest.get("externalDerivedArtifacts")
    _require(isinstance(external, list) and len(external) == 2, "invalid lens digest set")
    external_by_role = {
        row.get("role"): row for row in external if isinstance(row, dict)
    }
    for lane, fit in fits.items():
        _require(fit.get("schema") == FIT_SCHEMA, f"lane {lane} fit schema mismatch")
        _require(fit.get("lane") == lane and fit.get("stage") == "pilot", f"lane {lane} identity mismatch")
        _require(fit.get("gitRevision") == revision, f"lane {lane} revision mismatch")
        _require(fit.get("experimentProfile") == PROFILE, f"lane {lane} profile mismatch")
        _require(fit.get("semanticLabelsAccessed") is False, f"lane {lane} accessed semantic labels")
        _require(fit.get("primaryAlphaInterior") is True, f"lane {lane} alpha control is clipped")
        _require(fit.get("primaryBetaInterior") is True, f"lane {lane} beta control is clipped")
        expected_self_hash = fit_self_hashes.get(lane)
        _require(
            fit.get("selfHash") == expected_self_hash
            and expected_self_hash == _self_hash(fit, "selfHash"),
            f"lane {lane} fit receipt self-hash mismatch",
        )
        lens = external_by_role.get(f"lens-{lane}")
        _require(
            isinstance(lens, dict)
            and lens.get("sha256") == fit.get("lensSha256")
            and isinstance(lens.get("bytes"), int)
            and lens["bytes"] > 0,
            f"lane {lane} private lens binding mismatch",
        )
        fit_sources = fit.get("fitSourceSha256s")
        _require(
            isinstance(fit_sources, dict)
            and len(fit_sources) == EXPECTED_FIT_SOURCE_COUNT,
            f"lane {lane} fit source map is incomplete",
        )
        _require(
            set(fit_sources) == EXPECTED_FIT_SOURCE_PATHS,
            f"lane {lane} fit source path set differs from the frozen contract",
        )
        _verify_git_hashes(repo_root, revision, fit_sources, f"lane {lane} fit")
        _require(
            isinstance(fit.get("tensorSha256"), str)
            and SHA256_RE.fullmatch(fit["tensorSha256"]) is not None
            and fit.get("fitBindingSha256") == _sha256_json(_fit_binding_payload(fit)),
            f"lane {lane} fit-binding digest mismatch",
        )
    _require(
        fits["a"]["fitSourceSha256s"] == fits["b"]["fitSourceSha256s"],
        "A/B fit source maps differ",
    )

    collection_path = evidence_dir / "pilot-collection.json"
    fidelity_path = evidence_dir / "pilot-fidelity.json"
    rows_path = evidence_dir / "pilot-rows.jsonl"
    receipts_path = evidence_dir / "pilot-receipts.jsonl"
    collection = _read_json(collection_path)
    fidelity = _read_json(fidelity_path)
    rows = _read_jsonl(rows_path)
    receipt_wrappers = _read_jsonl(receipts_path)
    _require(collection.get("schema") == COLLECTION_SCHEMA, "collection schema mismatch")
    _require(collection.get("selfHash") == _self_hash(collection, "selfHash"), "collection self-hash mismatch")
    _require(collection.get("codeRevision") == revision, "collection revision mismatch")
    _require(collection.get("promptCount") == EXPECTED_CASE_COUNT, "collection case count mismatch")
    _require(collection.get("rowCount") == EXPECTED_ROW_COUNT, "collection row count mismatch")
    _require(collection.get("receiptCount") == EXPECTED_ROW_COUNT, "collection receipt count mismatch")
    _require(collection.get("truncatedRowCount") == 0, "collection contains truncated rows")
    _require(collection.get("allowTruncated") is False, "collection permits truncation")
    _require(collection.get("rowArtifactSha256") == _sha256_file(rows_path), "collection row hash mismatch")
    _require(collection.get("receiptArtifactSha256") == _sha256_file(receipts_path), "collection receipt hash mismatch")

    _require(fidelity.get("schema") == FIDELITY_SCHEMA, "fidelity schema mismatch")
    _require(fidelity.get("selfHash") == _self_hash(fidelity, "selfHash"), "fidelity self-hash mismatch")
    _require(fidelity.get("passed") is False, "failed pilot unexpectedly passed")
    _require(fidelity.get("gateProfile") == PROFILE, "fidelity gate profile mismatch")
    _require(fidelity.get("experimentProfile") == PROFILE, "fidelity experiment profile mismatch")
    _require(fidelity.get("semanticLabelsAccessed") is False, "fidelity accessed semantic labels")
    _require(fidelity.get("collectionManifestSha256") == _sha256_file(collection_path), "fidelity collection binding mismatch")
    _require(fidelity.get("rowsSha256") == _sha256_file(rows_path), "fidelity row binding mismatch")
    _require(fidelity.get("receiptsSha256") == _sha256_file(receipts_path), "fidelity receipt binding mismatch")
    _replay_fidelity(repo_root, evidence_dir, revision, fidelity)

    _require(len(rows) == EXPECTED_ROW_COUNT, "row artifact count mismatch")
    _require(len(receipt_wrappers) == EXPECTED_ROW_COUNT, "receipt artifact count mismatch")
    rows_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        _require(set(row) == EXPECTED_ROW_FIELDS, "fidelity row fields are not exact")
        case_id = row.get("caseId")
        alias = row.get("modelAlias")
        _require(isinstance(case_id, str) and alias in {"a", "b"}, "invalid row coordinate")
        key = (case_id, alias)
        _require(key not in rows_by_key, f"duplicate row coordinate: {key}")
        _require(row.get("frame") == "fidelity", f"invalid row frame: {key}")
        _require(row.get("truncated") is False, f"truncated row: {key}")
        _require(row.get("lensSha256") == fits[alias]["lensSha256"], f"row lens mismatch: {key}")
        rows_by_key[key] = row
    _require(len({case_id for case_id, _ in rows_by_key}) == EXPECTED_CASE_COUNT, "case topology mismatch")

    seen_receipts: set[tuple[str, str]] = set()
    for wrapper in receipt_wrappers:
        _require(
            set(wrapper) == {"caseId", "frame", "modelAlias", "receipt"},
            "receipt wrapper fields are not exact",
        )
        key = (wrapper["caseId"], wrapper["modelAlias"])
        _require(key in rows_by_key and key not in seen_receipts, f"invalid receipt coordinate: {key}")
        seen_receipts.add(key)
        row = rows_by_key[key]
        receipt = wrapper.get("receipt")
        _require(isinstance(receipt, dict), f"receipt is not an object: {key}")
        _require(receipt.get("schema") == WORKSPACE_RECEIPT_SCHEMA, f"receipt schema mismatch: {key}")
        _require(receipt.get("receiptHash") == _self_hash(receipt, "receiptHash"), f"receipt self-hash mismatch: {key}")
        observation = receipt.get("observation")
        _require(isinstance(observation, dict), f"missing observation: {key}")
        _require(receipt.get("observationSha256") == _sha256_json(observation), f"observation hash mismatch: {key}")
        _require(row.get("receiptHash") == receipt.get("receiptHash"), f"row/receipt hash link mismatch: {key}")
        _require(row.get("observationSha256") == receipt.get("observationSha256"), f"row/observation link mismatch: {key}")
        _require(receipt.get("input", {}).get("promptSha256") == row.get("promptSha256"), f"prompt hash link mismatch: {key}")
        _require(receipt.get("lens", {}).get("lensSha256") == fits[key[1]]["lensSha256"], f"receipt lens mismatch: {key}")
        _require(receipt.get("lens", {}).get("experimentProfile") == PROFILE, f"receipt profile mismatch: {key}")
        safety = receipt.get("safety", {})
        _require(safety.get("rawActivationsPersisted") is False, f"raw activation persisted: {key}")
        _require(safety.get("interventionApplied") is False, f"intervention applied: {key}")
    _require(seen_receipts == set(rows_by_key), "row/receipt coordinate sets differ")

    outcome = manifest.get("outcome")
    _require(isinstance(outcome, dict), "missing manifest outcome")
    _require(outcome.get("passed") is False, "manifest outcome unexpectedly passed")
    _require(outcome.get("confirmationAdmitted") is False, "confirmation was admitted")
    _require(outcome.get("semanticLabelsAccessed") is False, "manifest records semantic access")
    _require(outcome.get("sealedLineageExhausted") is True, "sealed lineage is not exhausted")
    _require(outcome.get("replicationPearsonE8", 0) < 90_000_000, "Pearson floor unexpectedly passed")
    _require(outcome.get("replicationSignAgreementE8", 0) < 90_000_000, "sign-agreement floor unexpectedly passed")
    for lane in ("laneA", "laneB"):
        lane_outcome = outcome.get(lane)
        _require(isinstance(lane_outcome, dict), f"missing {lane} outcome")
        gates = lane_outcome.get("gates")
        attribution = lane_outcome.get("attributionGates")
        _require(isinstance(gates, dict) and not all(gates.values()), f"{lane} ordinary gate unexpectedly passed")
        _require(
            isinstance(attribution, dict)
            and attribution.get("meanCentering") is True
            and attribution.get("unscaled") is False
            and attribution.get("jacobianSpecific") is False,
            f"{lane} attribution disposition mismatch",
        )

    _verify_disclosure(
        [*fits.values(), collection, fidelity, *receipt_wrappers],
        rows,
    )
    _require(
        sum(
            _count_exact_keys(wrapper.get("receipt"), FORBIDDEN_RECEIPT_KEYS)
            for wrapper in receipt_wrappers
        )
        == 0,
        "forbidden activation/semantic receipt field leaked",
    )
    # The manifest's lane map intentionally uses the public keys ``a`` and ``b``;
    # those collide with the fit-state symbol denylist, so scan it for generic
    # leaks separately instead of treating its provenance map as lens state.
    manifest_serialized = json.dumps(
        manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    _require(
        ABSOLUTE_PATH_RE.search(manifest_serialized) is None,
        "absolute local path leaked through manifest",
    )
    _require(
        CREDENTIAL_RE.search(manifest_serialized) is None,
        "credential signature leaked through manifest",
    )
    _require(
        _count_exact_keys(manifest, RAW_PROMPT_KEYS) == 0,
        "raw prompt/answer field leaked through manifest",
    )
    audit = manifest.get("disclosureAudit")
    _require(
        isinstance(audit, dict)
        and audit.get("absoluteLocalPathCount") == 0
        and audit.get("credentialSignatureCount") == 0
        and audit.get("rawPromptFieldCount") == 0
        and audit.get("privateScalarFieldCount") == 0
        and audit.get("rawActivationsPersisted") is False,
        "manifest disclosure audit is not clean",
    )

    return {
        "ok": True,
        "revision": revision,
        "manifestSelfHash": manifest["selfHash"],
        "sourceGitBlobs": len(sources),
        "fitSourceGitBlobsPerLane": EXPECTED_FIT_SOURCE_COUNT,
        "cases": EXPECTED_CASE_COUNT,
        "rows": len(rows),
        "receipts": len(receipt_wrappers),
        "fidelityPassed": False,
        "confirmationAdmitted": False,
        "semanticLabelsAccessed": False,
        "sealedLineageExhausted": True,
    }


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=_default_repo_root())
    parser.add_argument("--evidence-dir", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    evidence_dir = args.evidence_dir or (
        args.repo_root / "research" / "measurements" / "jspace-s5"
    )
    try:
        result = verify(args.repo_root, evidence_dir)
    except EvidenceError as error:
        print(f"FAIL jspace-s5-evidence: {error}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, sort_keys=True))
    else:
        print(
            "PASS jspace-s5-evidence: "
            f"revision={result['revision']} rows={result['rows']} "
            f"receipts={result['receipts']} fidelity=false confirmation=false"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
