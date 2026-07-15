from __future__ import annotations

import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
EVIDENCE_DIR = REPO_ROOT / "research" / "measurements" / "jspace-s5"
sys.path.insert(0, str(HERE))

import verify_jspace_s5_evidence as verifier  # noqa: E402


def _write_json(path: Path, value: dict) -> None:
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def _rehash(value: dict, field: str = "selfHash") -> None:
    value[field] = None
    value[field] = verifier._sha256_json(value)


def _update_promoted_artifact(manifest: dict, evidence_dir: Path, name: str) -> None:
    for row in manifest["promotedArtifacts"]:
        if Path(row["path"]).name == name:
            path = evidence_dir / name
            row["bytes"] = path.stat().st_size
            row["sha256"] = verifier._sha256_file(path)
            return
    raise AssertionError(f"promoted artifact not found: {name}")


def _rotated_trust_root(manifest: dict) -> tuple[str, dict[str, str]]:
    promoted = {
        Path(row["path"]).name: row["sha256"]
        for row in manifest["promotedArtifacts"]
    }
    return manifest["selfHash"], promoted


class JSpaceS5EvidenceVerifierTests(unittest.TestCase):
    def test_preserved_negative_pilot_passes(self) -> None:
        result = verifier.verify(REPO_ROOT, EVIDENCE_DIR)
        self.assertTrue(result["ok"])
        self.assertEqual(result["rows"], 72)
        self.assertEqual(result["receipts"], 72)
        self.assertFalse(result["fidelityPassed"])
        self.assertFalse(result["confirmationAdmitted"])

    def test_tampered_row_artifact_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            copy = Path(temporary) / "jspace-s5"
            shutil.copytree(EVIDENCE_DIR, copy)
            rows = copy / "pilot-rows.jsonl"
            rows.write_bytes(rows.read_bytes() + b"\n")
            with self.assertRaisesRegex(
                verifier.EvidenceError, "(?:byte length|SHA-256) mismatch"
            ):
                verifier.verify(REPO_ROOT, copy)

    def test_contradictory_fidelity_fails_exact_replay_after_rebinding(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            copy = Path(temporary) / "jspace-s5"
            shutil.copytree(EVIDENCE_DIR, copy)
            fidelity_path = copy / "pilot-fidelity.json"
            fidelity = json.loads(fidelity_path.read_text(encoding="utf-8"))
            for alias in fidelity["aliases"].values():
                alias["passed"] = True
                alias["gates"] = {key: True for key in alias["gates"]}
            fidelity["replication"].update(
                {
                    "macroGainPearsonE8": 100_000_000,
                    "macroGainSignAgreementE8": 100_000_000,
                    "passed": True,
                }
            )
            # Preserve the outer negative bit to exercise semantic replay rather
            # than the cheap top-level admission check.
            self.assertFalse(fidelity["passed"])
            _rehash(fidelity)
            _write_json(fidelity_path, fidelity)
            manifest_path = copy / "pilot-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            _update_promoted_artifact(manifest, copy, "pilot-fidelity.json")
            _rehash(manifest)
            _write_json(manifest_path, manifest)
            manifest_hash, artifact_hashes = _rotated_trust_root(manifest)
            with (
                patch.object(verifier, "FROZEN_MANIFEST_SELF_HASH", manifest_hash),
                patch.object(verifier, "FROZEN_PROMOTED_ARTIFACTS", artifact_hashes),
                self.assertRaisesRegex(
                    verifier.EvidenceError, "fidelity replay mismatch"
                ),
            ):
                verifier.verify(REPO_ROOT, copy)

    def test_fit_source_substitution_fails_after_rebinding(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            copy = Path(temporary) / "jspace-s5"
            shutil.copytree(EVIDENCE_DIR, copy)
            replacement = "README.md"
            replacement_hash = verifier._sha256_bytes(
                verifier._git_blob(REPO_ROOT, verifier.FROZEN_REVISION, replacement)
            )
            manifest_path = copy / "pilot-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            for lane in ("a", "b"):
                name = f"pilot-{lane}-fit.json"
                path = copy / name
                fit = json.loads(path.read_text(encoding="utf-8"))
                del fit["fitSourceSha256s"][
                    "research/data/jspace-s5/fit-a-pilot.jsonl"
                ]
                fit["fitSourceSha256s"][replacement] = replacement_hash
                _rehash(fit)
                _write_json(path, fit)
                manifest["fitReceiptSelfHashes"][lane] = fit["selfHash"]
                _update_promoted_artifact(manifest, copy, name)
            _rehash(manifest)
            _write_json(manifest_path, manifest)
            manifest_hash, artifact_hashes = _rotated_trust_root(manifest)
            with (
                patch.object(verifier, "FROZEN_MANIFEST_SELF_HASH", manifest_hash),
                patch.object(verifier, "FROZEN_PROMOTED_ARTIFACTS", artifact_hashes),
                self.assertRaisesRegex(
                    verifier.EvidenceError, "source path set differs"
                ),
            ):
                verifier.verify(REPO_ROOT, copy)

    def test_semantic_label_injection_fails_after_full_rebinding(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            copy = Path(temporary) / "jspace-s5"
            shutil.copytree(EVIDENCE_DIR, copy)
            rows_path = copy / "pilot-rows.jsonl"
            rows = [
                json.loads(line)
                for line in rows_path.read_text(encoding="utf-8").splitlines()
            ]
            rows[0]["label"] = True
            rows_path.write_text(
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
            )
            collection_path = copy / "pilot-collection.json"
            collection = json.loads(collection_path.read_text(encoding="utf-8"))
            collection["rowArtifactSha256"] = verifier._sha256_file(rows_path)
            _rehash(collection)
            _write_json(collection_path, collection)
            fidelity_path = copy / "pilot-fidelity.json"
            fidelity = json.loads(fidelity_path.read_text(encoding="utf-8"))
            fidelity["rowsSha256"] = verifier._sha256_file(rows_path)
            fidelity["collectionManifestSha256"] = verifier._sha256_file(
                collection_path
            )
            _rehash(fidelity)
            _write_json(fidelity_path, fidelity)
            manifest_path = copy / "pilot-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            for name in (
                "pilot-rows.jsonl",
                "pilot-collection.json",
                "pilot-fidelity.json",
            ):
                _update_promoted_artifact(manifest, copy, name)
            _rehash(manifest)
            _write_json(manifest_path, manifest)
            manifest_hash, artifact_hashes = _rotated_trust_root(manifest)
            with (
                patch.object(verifier, "FROZEN_MANIFEST_SELF_HASH", manifest_hash),
                patch.object(verifier, "FROZEN_PROMOTED_ARTIFACTS", artifact_hashes),
                self.assertRaisesRegex(
                    verifier.EvidenceError,
                    "(?:row fields are not exact|raw prompt/answer field leaked)",
                ),
            ):
                verifier.verify(REPO_ROOT, copy)


if __name__ == "__main__":
    unittest.main()
