from __future__ import annotations

import copy
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

from quantum_receipt_verify import (  # noqa: E402
    expected_receipt_hash,
    sampling_benchmark_receipt_errors,
)
from quantum_sampling_benchmark import (  # noqa: E402
    BenchmarkConfig,
    RECEIPT_SCHEMA,
    run_benchmark,
)


class QuantumSamplingBenchmarkTests(unittest.TestCase):
    def tiny_receipt(self) -> dict:
        return run_benchmark(
            BenchmarkConfig(
                visible_nodes=8,
                hidden_nodes=12,
                edge_count=24,
                samples=4,
                k_values=(1, 2),
                repeats=2,
                warmup_repeats=0,
                devices=("cpu",),
                seed=37,
            )
        )

    def test_receipt_recomputes_and_hash_verifies(self) -> None:
        receipt = self.tiny_receipt()

        self.assertEqual(receipt["schema"], RECEIPT_SCHEMA)
        self.assertEqual(receipt["model"]["total_nodes"], 20)
        self.assertEqual(receipt["model"]["edge_count"], 24)
        self.assertEqual(receipt["training_scope"]["scope"], "sampling-only")
        self.assertEqual(receipt["payload_hash"], expected_receipt_hash(receipt))
        self.assertEqual(sampling_benchmark_receipt_errors(receipt), [])

    def test_tampered_timing_is_rejected_even_if_receipt_is_rehashed(self) -> None:
        receipt = self.tiny_receipt()
        tampered = copy.deepcopy(receipt)
        tampered["backends"][0]["measurements"][0]["median_wall_ms"] += 1.0
        tampered["payload_hash"] = expected_receipt_hash(tampered)

        errors = sampling_benchmark_receipt_errors(tampered)

        self.assertTrue(
            any("median_wall_ms does not recompute" in error for error in errors),
            errors,
        )

    def test_cli_receipt_passes_independent_verifier(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            receipt_path = pathlib.Path(tmp) / "sampling-receipt.json"
            run = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS_DIR / "quantum_sampling_benchmark.py"),
                    "--visible-nodes",
                    "8",
                    "--hidden-nodes",
                    "12",
                    "--edges",
                    "24",
                    "--samples",
                    "4",
                    "--k",
                    "1,2",
                    "--repeats",
                    "1",
                    "--warmup-repeats",
                    "0",
                    "--devices",
                    "cpu",
                    "--output",
                    str(receipt_path),
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            self.assertEqual(receipt["schema"], RECEIPT_SCHEMA)

            verify = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS_DIR / "quantum_receipt_verify.py"),
                    "--receipt",
                    str(receipt_path),
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(verify.returncode, 0, verify.stdout + verify.stderr)
            self.assertIn(
                "sampling-benchmark scientific claims recompute", verify.stdout
            )


if __name__ == "__main__":
    unittest.main()
