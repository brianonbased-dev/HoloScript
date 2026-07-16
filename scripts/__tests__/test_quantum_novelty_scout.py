from __future__ import annotations

import copy
import pathlib
import sys
import tempfile
import unittest

from qiskit.circuit.library import QAOAAnsatz
from qiskit.quantum_info import SparsePauliOp

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

from quantum_novelty_scout import (  # noqa: E402
    build_qubo,
    canonical_hash,
    load_fixture,
    portfolio_metrics,
    run_scout,
    verify_receipt,
)
from quantum_execute import _qaoa_parameter_values  # noqa: E402


class QuantumNoveltyScoutTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture_path = (
            REPO_ROOT / "research" / "quantum-novelty-scout" / "candidates-v1.json"
        )

    def test_qubo_expansion_matches_portfolio_semantics(self) -> None:
        fixture = load_fixture(self.fixture_path)
        qubo = build_qubo(fixture)
        metrics = portfolio_metrics("111100000000", fixture, qubo)
        self.assertEqual(metrics["selected_count"], 4)
        self.assertAlmostEqual(
            metrics["shifted_objective"],
            -metrics["portfolio_score"],
            places=7,
        )

    def test_qiskit_greek_qaoa_parameters_bind_beta_then_gamma(self) -> None:
        ansatz = QAOAAnsatz(SparsePauliOp.from_list([("ZI", 1.0)]), reps=1)
        self.assertEqual(
            _qaoa_parameter_values(ansatz.parameters, gamma=0.75, beta=0.25),
            [0.25, 0.75],
        )

    def test_real_statevector_scout_emits_tamper_evident_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            receipt = run_scout(
                self.fixture_path,
                root / "portfolio.holo",
                root / "receipt.json",
                shots=32,
                grid_points=2,
                seed=17,
            )
            self.assertTrue(verify_receipt(receipt))
            self.assertEqual(receipt["candidate_count"], 12)
            self.assertEqual(receipt["hardware_gate"]["decision"], "NO_GO")
            self.assertEqual(receipt["execution_receipt"]["problem_type"], "qubo")

            tampered = copy.deepcopy(receipt)
            tampered["hash_payload"]["results"]["qaoa"]["objective"] += 1
            self.assertFalse(verify_receipt(tampered))
            self.assertNotEqual(
                tampered["payload_hash"], canonical_hash(tampered["hash_payload"])
            )


if __name__ == "__main__":
    unittest.main()
