"""Focused fail-closed tests for the frozen J-space S4 selector."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from types import ModuleType


REPO_ROOT = Path(__file__).resolve().parents[2]
SELECTOR_PATH = REPO_ROOT / "scripts" / "research" / "select_jspace_s4_corpus.py"


def _load_selector() -> ModuleType:
    spec = importlib.util.spec_from_file_location("select_jspace_s4_corpus", SELECTOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load S4 selector")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SELECTOR = _load_selector()


def _sha256(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


class S4SelectorTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory(prefix="jspace-s4-selector-")
        self.temp = Path(self._temporary.name)
        self.s2 = REPO_ROOT / "research" / "data" / "jspace-s2"
        self.s3 = REPO_ROOT / "research" / "data" / "jspace-s3"
        self.measurements = REPO_ROOT / "research" / "measurements" / "jspace-s3"
        self.preregistration = (
            REPO_ROOT / "research" / "2026-07-15-jspace-s4-centered-scalar-preregistration.md"
        )

    def tearDown(self) -> None:
        self._temporary.cleanup()

    def _args(
        self,
        output: Path,
        *,
        s3: Path | None = None,
        measurements: Path | None = None,
        preregistration: Path | None = None,
    ) -> argparse.Namespace:
        return argparse.Namespace(
            s2_corpus_dir=str(self.s2),
            s3_corpus_dir=str(s3 or self.s3),
            s3_measurement_dir=str(measurements or self.measurements),
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
        self.assertEqual(manifest["preregistrationSha256"], SELECTOR.EXPECTED_S4_PREREGISTRATION_SHA256)
        candidate = dict(manifest)
        candidate["selfHash"] = None
        self.assertEqual(manifest["selfHash"], SELECTOR._sha256_json(candidate))

    def test_replay_is_byte_identical(self) -> None:
        first = self.temp / "first"
        second = self.temp / "second"
        self._select(self._args(first))
        self._select(self._args(second))
        first_files = sorted(path.name for path in first.iterdir())
        second_files = sorted(path.name for path in second.iterdir())
        self.assertEqual(first_files, second_files)
        for name in first_files:
            self.assertEqual((first / name).read_bytes(), (second / name).read_bytes())

    def test_rejects_tampered_preregistration(self) -> None:
        preregistration = self.temp / self.preregistration.name
        preregistration.write_bytes(self.preregistration.read_bytes() + b"\n")
        with self.assertRaisesRegex(ValueError, "preregistration byte hash mismatch"):
            self._select(self._args(self.temp / "output", preregistration=preregistration))

    def test_rejects_tampered_s3_source(self) -> None:
        s3 = self.temp / "jspace-s3"
        shutil.copytree(self.s3, s3)
        source = s3 / "fit-a-confirmation.jsonl"
        source.write_bytes(source.read_bytes() + b"\n")
        with self.assertRaisesRegex(ValueError, "S3 a confirmation byte hash mismatch"):
            self._select(self._args(self.temp / "output", s3=s3))

    def test_rejects_tampered_failed_evidence(self) -> None:
        measurements = self.temp / "measurements"
        shutil.copytree(self.measurements, measurements)
        evidence = measurements / "pilot-manifest.json"
        evidence.write_bytes(evidence.read_bytes() + b"\n")
        with self.assertRaisesRegex(ValueError, "unexpected S3 evidence manifest"):
            self._select(self._args(self.temp / "output", measurements=measurements))

    def test_rejects_nonempty_output(self) -> None:
        output = self.temp / "output"
        output.mkdir()
        (output / "sentinel").write_text("occupied", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "output directory must be absent or empty"):
            self._select(self._args(output))


if __name__ == "__main__":
    unittest.main()
