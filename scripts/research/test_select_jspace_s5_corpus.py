"""Focused fail-closed tests for the frozen J-space S5 selector."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType


REPO_ROOT = Path(__file__).resolve().parents[2]
SELECTOR_PATH = REPO_ROOT / "scripts" / "research" / "select_jspace_s5_corpus.py"


def _load_selector() -> ModuleType:
    spec = importlib.util.spec_from_file_location("select_jspace_s5_corpus", SELECTOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load S5 selector")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


SELECTOR = _load_selector()


def _sha256(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


class S5SelectorTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory(prefix="jspace-s5-selector-")
        self.temp = Path(self._temporary.name)
        self.s2 = REPO_ROOT / "research" / "data" / "jspace-s2"
        self.s2_measurements = REPO_ROOT / "research" / "measurements" / "jspace-s2"
        self.s3 = REPO_ROOT / "research" / "data" / "jspace-s3"
        self.s3_measurements = REPO_ROOT / "research" / "measurements" / "jspace-s3"
        self.s4 = REPO_ROOT / "research" / "data" / "jspace-s4"
        self.s4_measurements = REPO_ROOT / "research" / "measurements" / "jspace-s4"
        self.preregistration = (
            REPO_ROOT / "research" / "2026-07-15-jspace-s5-unscaled-centered-preregistration.md"
        )

    def tearDown(self) -> None:
        self._temporary.cleanup()

    def _args(
        self,
        output: Path,
        *,
        s4: Path | None = None,
        s2_measurements: Path | None = None,
        s4_measurements: Path | None = None,
        preregistration: Path | None = None,
    ) -> argparse.Namespace:
        return argparse.Namespace(
            s2_corpus_dir=str(self.s2),
            s2_measurement_dir=str(s2_measurements or self.s2_measurements),
            s3_corpus_dir=str(self.s3),
            s3_measurement_dir=str(self.s3_measurements),
            s4_corpus_dir=str(s4 or self.s4),
            s4_measurement_dir=str(s4_measurements or self.s4_measurements),
            preregistration=str(preregistration or self.preregistration),
            output_dir=str(output),
        )

    def _select(self, args: argparse.Namespace) -> None:
        with contextlib.redirect_stdout(io.StringIO()):
            SELECTOR.select(args)

    def test_frozen_selection_matches_registered_hashes(self) -> None:
        output = self.temp / "selection"
        self._select(self._args(output))
        for stage, lane_bindings in SELECTOR.EXPECTED_OUTPUT_SHA256.items():
            for lane, expected in lane_bindings.items():
                path = output / SELECTOR.OUTPUT_FILES[stage][lane]
                self.assertEqual(_sha256(path), expected)
        manifest = json.loads((output / "selection-manifest.json").read_text(encoding="utf-8"))
        self.assertFalse(manifest["semanticLabelsAccessed"])
        self.assertEqual(manifest["selector"]["semanticFieldsInspected"], [])
        self.assertEqual(
            manifest["preregistrationSha256"],
            SELECTOR.EXPECTED_S5_PREREGISTRATION_SHA256,
        )
        self.assertEqual(
            manifest["preregistrationGitRevision"],
            SELECTOR.EXPECTED_S5_PREREGISTRATION_REVISION,
        )
        candidate = dict(manifest)
        candidate["selfHash"] = None
        self.assertEqual(manifest["selfHash"], SELECTOR._sha256_json(candidate))

    def test_reproduces_exact_registered_table_and_balance(self) -> None:
        output = self.temp / "selection"
        self._select(self._args(output))
        manifest = json.loads((output / "selection-manifest.json").read_text(encoding="utf-8"))
        proof = manifest["proof"]
        self.assertEqual(
            proof["pilot"]["coordinateSetSha256"],
            SELECTOR.EXPECTED_PILOT_COORDINATE_SHA256,
        )
        self.assertEqual(
            proof["confirmation"]["coordinateSetSha256"],
            SELECTOR.EXPECTED_CONFIRMATION_COORDINATE_SHA256,
        )
        for stage in ("pilot", "confirmation"):
            self.assertEqual(proof[stage]["rowCount"], 36)
            self.assertEqual(set(proof[stage]["rowsPerPositionBin"].values()), {9})
            self.assertEqual(set(proof[stage]["rowsPerFamily"].values()), {6})
            self.assertEqual(set(proof[stage]["taskFormCounts"].values()), {9})
            self.assertEqual(proof[stage]["variantCounts"], {"0": 18, "1": 18})
            self.assertGreaterEqual(proof[stage]["minimumUniqueEndpointProfilesPerFamily"], 5)

    def test_outputs_are_exact_partition_members_of_s4_confirmation(self) -> None:
        output = self.temp / "selection"
        self._select(self._args(output))
        for lane, (_, source_name) in SELECTOR.S4_LANE_FILES.items():
            source_lines = (self.s4 / source_name).read_bytes().splitlines(keepends=True)
            pilot_lines = (output / SELECTOR.OUTPUT_FILES["pilot"][lane]).read_bytes().splitlines(keepends=True)
            confirmation_lines = (
                output / SELECTOR.OUTPUT_FILES["confirmation"][lane]
            ).read_bytes().splitlines(keepends=True)
            self.assertEqual(len(pilot_lines), 36)
            self.assertEqual(len(confirmation_lines), 36)
            self.assertEqual(set(pilot_lines) | set(confirmation_lines), set(source_lines))
            self.assertFalse(set(pilot_lines) & set(confirmation_lines))

    def test_replay_is_byte_identical(self) -> None:
        first = self.temp / "first"
        second = self.temp / "second"
        self._select(self._args(first))
        self._select(self._args(second))
        first_files = sorted(path.name for path in first.iterdir())
        self.assertEqual(first_files, sorted(path.name for path in second.iterdir()))
        for name in first_files:
            self.assertEqual((first / name).read_bytes(), (second / name).read_bytes())

    def test_rejects_tampered_preregistration(self) -> None:
        preregistration = self.temp / self.preregistration.name
        preregistration.write_bytes(self.preregistration.read_bytes() + b"\n")
        with self.assertRaisesRegex(ValueError, "preregistration byte hash mismatch"):
            self._select(self._args(self.temp / "output", preregistration=preregistration))

    def test_rejects_tampered_s4_source(self) -> None:
        s4 = self.temp / "jspace-s4"
        shutil.copytree(self.s4, s4)
        source = s4 / "fit-a-confirmation.jsonl"
        source.write_bytes(source.read_bytes() + b"\n")
        with self.assertRaisesRegex(ValueError, "S4 a confirmation byte hash mismatch"):
            self._select(self._args(self.temp / "output", s4=s4))

    def test_rejects_tampered_failed_evidence(self) -> None:
        measurements = self.temp / "measurements"
        shutil.copytree(self.s4_measurements, measurements)
        evidence = measurements / "pilot-manifest.json"
        evidence.write_bytes(evidence.read_bytes() + b"\n")
        with self.assertRaisesRegex(ValueError, "unexpected S4 evidence manifest"):
            self._select(
                self._args(self.temp / "output", s4_measurements=measurements)
            )

    def test_rejects_tampered_s2_failed_evidence(self) -> None:
        measurements = self.temp / "s2-measurements"
        shutil.copytree(self.s2_measurements, measurements)
        evidence = measurements / "pilot-manifest.json"
        evidence.write_bytes(evidence.read_bytes() + b"\n")
        with self.assertRaisesRegex(ValueError, "unexpected S2 evidence manifest"):
            self._select(
                self._args(self.temp / "output", s2_measurements=measurements)
            )

    def test_rejects_nonempty_output(self) -> None:
        output = self.temp / "output"
        output.mkdir()
        (output / "sentinel").write_text("occupied", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "output directory must be absent or empty"):
            self._select(self._args(output))


if __name__ == "__main__":
    unittest.main()
