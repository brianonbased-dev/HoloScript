#!/usr/bin/env python3
"""Targeted fail-closed tests for the J-space S3 fit runner."""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[2]
RUNNER_PATH = REPO_ROOT / "scripts" / "research" / "fit_jspace_s3_lens.py"
SPEC = importlib.util.spec_from_file_location("fit_jspace_s3_lens", RUNNER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("unable to load S3 fit runner")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def _read_jsonl(path: Path) -> list[dict[str, object]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]


class JSpaceS3FitRunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = REPO_ROOT / "research" / "data" / "jspace-s3"
        cls.manifest_path = cls.data / "selection-manifest.json"
        cls.manifest = json.loads(cls.manifest_path.read_text(encoding="utf-8"))

    def test_frozen_stage_balances_replay(self) -> None:
        runner._validate_balance(
            _read_jsonl(self.data / "fit-a-pilot.jsonl"), "pilot"
        )
        runner._validate_balance(
            _read_jsonl(self.data / "fit-a-confirmation.jsonl"), "confirmation"
        )

    def test_coordinate_tamper_is_rejected(self) -> None:
        rows = _read_jsonl(self.data / "fit-a-pilot.jsonl")
        tampered = copy.deepcopy(rows)
        tampered[0]["taskForm"] = "form_3"
        tampered[0]["variant"] = 1
        with self.assertRaises(ValueError):
            runner._validate_balance(tampered, "pilot")

    def test_artifact_tamper_breaks_manifest_binding(self) -> None:
        rows = _read_jsonl(self.data / "fit-a-pilot.jsonl")
        rows[0]["prompt"] = f"{rows[0]['prompt']}x"
        scratch = REPO_ROOT / ".scratch"
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as temporary:
            temporary_path = Path(temporary)
            artifact = temporary_path / "fit-a-pilot.jsonl"
            artifact.write_text(
                "".join(
                    json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n"
                    for row in rows
                ),
                encoding="utf-8",
                newline="\n",
            )
            binding = copy.deepcopy(self.manifest["pilotArtifacts"]["a"])
            with self.assertRaises(ValueError):
                runner._validate_s3_artifact(
                    binding,
                    manifest_path=temporary_path / "selection-manifest.json",
                    expected_rows=48,
                )

    def test_ordered_calibration_digest_is_not_set_digest(self) -> None:
        rows = _read_jsonl(self.data / "fit-a-pilot.jsonl")
        ordered = runner.sha256_json([row["sequenceSha256"] for row in rows])
        self.assertEqual(
            ordered,
            "sha256:a78c1ef084db62cfbdc0f589d2dda3300e4bd1e784b1755fe80e567a619919d3",
        )
        self.assertNotEqual(
            ordered,
            self.manifest["pilotArtifacts"]["a"]["sequenceHashSetSha256"],
        )

    def test_confirmation_without_passing_evidence_is_rejected(self) -> None:
        args = argparse.Namespace(
            stage="confirmation", dry_run=False, pilot_evidence=None
        )
        with self.assertRaisesRegex(ValueError, "passing-pilot"):
            runner._validate_pilot_admission(
                args,
                selection_manifest_path=self.manifest_path,
                selection_manifest=self.manifest,
                preregistration_path=(
                    REPO_ROOT
                    / "research"
                    / "2026-07-15-jspace-s3-latin-endpoint-preregistration.md"
                ),
            )


if __name__ == "__main__":
    unittest.main()
