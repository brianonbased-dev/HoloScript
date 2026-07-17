from __future__ import annotations

import copy
import hashlib
import pathlib
import subprocess
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
    evaluate_code_evidence,
    greedy_marginal_reward,
    load_fixture,
    portfolio_metrics,
    run_scout,
    verify_receipt,
)
from quantum_execute import _qaoa_parameter_values  # noqa: E402
from quantum_receipt_verify import (  # noqa: E402
    expected_receipt_hash,
    linked_code_evidence_verifies,
    novelty_scout_receipt_errors,
)


class QuantumNoveltyScoutTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture_path = (
            REPO_ROOT / "research" / "quantum-novelty-scout" / "candidates-v1.json"
        )

    @staticmethod
    def rehash_full_receipt(receipt: dict) -> None:
        receipt["payload_hash"] = canonical_hash(
            {key: value for key, value in receipt.items() if key != "payload_hash"}
        )

    @staticmethod
    def recompute_hardware_gate(receipt: dict) -> None:
        results = receipt["results"]
        selected = receipt["selected_candidates"]
        source_grounding = all(
            item["kill_test"].get("status")
            in {"survives_tightened_claim", "narrowed", "killed"}
            and bool(item["kill_test"].get("sources"))
            for item in selected
        )
        not_killed = all(
            item["kill_test"].get("status") != "killed" for item in selected
        )
        paths_available = all(
            item["required_paths_available"]
            for item in receipt["selected_code_evidence"]
        )
        criteria = {
            "qaoa_strictly_beats_greedy": results["qaoa"]["raw_qubo_objective"]
            < results["greedy"]["raw_qubo_objective"] - 1e-9,
            "qaoa_strictly_beats_budget_random": results["qaoa"]["raw_qubo_objective"]
            < results["budget_matched_random"]["raw_qubo_objective"] - 1e-9,
            "classical_exact_not_cheaper": results["exact"]["runtime_seconds"]
            > results["qaoa"]["runtime_seconds"],
            "nontrivial_problem_scale": receipt["candidate_count"] >= 18,
            "qaoa_target_cardinality_met": results["qaoa"]["selected_count"]
            == receipt["target_cardinality"],
            "selected_kill_tests_complete": source_grounding,
            "selected_claims_not_killed": not_killed,
            "selected_code_evidence_paths_available": paths_available,
        }
        decision = "GO" if all(criteria.values()) else "NO_GO"
        receipt["source_grounding_complete"] = source_grounding
        receipt["selected_claims_not_killed"] = not_killed
        receipt["selected_code_evidence_paths_available"] = paths_available
        receipt["hardware_gate"]["criteria"] = criteria
        receipt["hardware_gate"]["decision"] = decision
        receipt["hash_payload"]["hardware_gate_decision"] = decision

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

    def test_greedy_marginal_includes_shared_implementation_penalty(self) -> None:
        qubo = {
            "candidate_rewards": [10.0, 9.0, 8.0],
            "redundancy_penalty": 0.0,
            "tag_similarities": [[0.0] * 3 for _ in range(3)],
            "code_similarity_penalty": 5.0,
            "code_similarities": [
                [0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0],
                [0.0, 0.0, 0.0],
            ],
        }
        self.assertEqual(greedy_marginal_reward(1, [0], qubo), 4.0)
        self.assertEqual(greedy_marginal_reward(2, [0], qubo), 8.0)

    def test_code_evidence_is_observed_from_files_not_optimizer_bits(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            subprocess.run(["git", "init", "--quiet", str(root)], check=True)
            implementation = root / "src" / "feature.ts"
            implementation.parent.mkdir(parents=True)
            implementation.write_text(
                "export function groundedFeature() { return 7; }\n",
                encoding="utf-8",
            )
            verification = root / "tests" / "feature.test.ts"
            verification.parent.mkdir(parents=True)
            verification.write_text("groundedFeature();\n", encoding="utf-8")
            fixture = {
                "code_evidence_policy": {
                    "required_categories": ["implementation", "verification"],
                    "allowed_extensions": [".ts"],
                    "max_file_bytes": 1024,
                    "category_weights": {
                        "implementation": 0.5,
                        "verification": 0.3,
                        "execution_evidence": 0.2,
                    },
                },
                "candidates": [
                    {
                        "id": "grounded",
                        "code_evidence": {
                            "implementation": ["src/feature.ts"],
                            "verification": ["tests/feature.test.ts"],
                            "execution_evidence": [],
                        },
                    }
                ],
            }

            evidence, implementation_hash_sets = evaluate_code_evidence(fixture, root)
            implementation_worktree_hash = hashlib.sha256(
                implementation.read_bytes()
            ).hexdigest()
            implementation_blob = subprocess.run(
                [
                    "git",
                    "cat-file",
                    "blob",
                    evidence[0]["files"][0]["git_blob_oid"],
                ],
                cwd=root,
                capture_output=True,
                check=True,
            ).stdout
            implementation_hash = hashlib.sha256(implementation_blob).hexdigest()
            self.assertAlmostEqual(evidence[0]["declared_path_availability"], 0.8)
            self.assertTrue(evidence[0]["required_paths_available"])
            self.assertIn(implementation_hash, implementation_hash_sets[0])
            self.assertEqual(
                evidence[0]["files"][0]["git_blob_sha256"],
                implementation_hash,
            )
            self.assertEqual(
                evidence[0]["files"][0]["worktree_sha256"],
                implementation_worktree_hash,
            )

            implementation.unlink()
            missing, _ = evaluate_code_evidence(fixture, root)
            self.assertFalse(missing[0]["required_paths_available"])
            self.assertEqual(
                missing[0]["missing_required_path_categories"], ["implementation"]
            )

            oversized = root / "src" / "oversized.ts"
            oversized.write_text("x" * 1025, encoding="utf-8")
            fixture["candidates"][0]["code_evidence"]["implementation"] = [
                "src/oversized.ts"
            ]
            rejected, _ = evaluate_code_evidence(fixture, root)
            self.assertEqual(
                rejected[0]["files"][0]["rejection_reason"],
                "file_exceeds_max_bytes",
            )

            fixture["candidates"][0]["code_evidence"]["implementation"] = [
                "../outside.ts"
            ]
            with self.assertRaisesRegex(ValueError, "escapes repository"):
                evaluate_code_evidence(fixture, root)

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
            self.assertEqual(
                receipt["run_configuration"],
                {
                    "seed": 17,
                    "shots": 32,
                    "grid_points": 2,
                    "p": 1,
                    "execution_mode": "aer",
                },
            )
            self.assertTrue(receipt["selected_code_evidence_paths_available"])
            self.assertFalse(receipt["all_candidate_code_evidence_paths_available"])
            self.assertEqual(
                receipt["hash_payload"]["code_evidence_sha256"],
                canonical_hash(receipt["qubo"]["code_evidence"]),
            )
            for source in receipt["source_state"]["files"]:
                oid = source["git_blob_oid"]
                self.assertIsNotNone(oid)
                self.assertEqual(
                    subprocess.run(
                        ["git", "cat-file", "-e", f"{oid}^{{blob}}"],
                        cwd=REPO_ROOT,
                        check=False,
                    ).returncode,
                    0,
                )

            tampered = copy.deepcopy(receipt)
            tampered["hash_payload"]["results"]["qaoa"]["objective"] += 1
            self.assertFalse(verify_receipt(tampered))

            tampered_evidence = copy.deepcopy(receipt)
            tampered_evidence["qubo"]["code_evidence"][0][
                "declared_path_availability"
            ] = 0
            self.assertFalse(verify_receipt(tampered_evidence))
            self.assertFalse(linked_code_evidence_verifies(tampered_evidence))
            self.assertTrue(linked_code_evidence_verifies(receipt))
            self.assertEqual(receipt["payload_hash"], expected_receipt_hash(receipt))

            forged_blob = copy.deepcopy(receipt)
            forged_file = forged_blob["qubo"]["code_evidence"][0]["files"][0]
            forged_file["git_blob_sha256"] = "0" * 64
            forged_source = next(
                item
                for item in forged_blob["source_state"]["files"]
                if item["path"] == forged_file["path"]
            )
            forged_source["git_blob_sha256"] = "0" * 64
            forged_blob["hash_payload"]["code_evidence_sha256"] = canonical_hash(
                forged_blob["qubo"]["code_evidence"]
            )
            self.rehash_full_receipt(forged_blob)
            self.assertTrue(
                any(
                    "Git blob hash mismatch" in error
                    for error in novelty_scout_receipt_errors(forged_blob)
                )
            )
            self.assertFalse(verify_receipt(forged_blob))

            mutations = [
                lambda value: value["qubo"]["matrix"][0].__setitem__(0, 0),
                lambda value: value["recommended_portfolio"][
                    "selected_ids"
                ].__setitem__(0, "forged"),
                lambda value: value["selected_candidates"][0].__setitem__(
                    "tightened_claim", "forged"
                ),
                lambda value: value["execution_receipt"].__setitem__(
                    "optimal_value", 0
                ),
                lambda value: value.__setitem__("input_sha256", "0" * 64),
                lambda value: value["hardware_gate"]["criteria"].__setitem__(
                    "nontrivial_problem_scale", True
                ),
            ]
            for mutate in mutations:
                forged = copy.deepcopy(receipt)
                mutate(forged)
                self.assertFalse(verify_receipt(forged))
                self.assertNotEqual(
                    forged["payload_hash"], expected_receipt_hash(forged)
                )

            forged_exact = copy.deepcopy(receipt)
            bits = list(forged_exact["results"]["exact"]["bitstring"])
            selected_index = bits.index("1")
            unselected_index = bits.index("0")
            bits[selected_index] = "0"
            bits[unselected_index] = "1"
            alternative_bits = "".join(bits)
            fixture = load_fixture(self.fixture_path)
            alternative = portfolio_metrics(
                alternative_bits,
                fixture,
                forged_exact["qubo"],
            )
            alternative["runtime_seconds"] = forged_exact["results"]["exact"][
                "runtime_seconds"
            ]
            alternative["evaluations"] = forged_exact["results"]["exact"]["evaluations"]
            forged_exact["results"]["exact"] = alternative
            forged_exact["recommended_portfolio"] = copy.deepcopy(alternative)
            candidates_by_id = {item["id"]: item for item in fixture["candidates"]}
            evidence_by_id = {
                item["candidate_id"]: item
                for item in forged_exact["qubo"]["code_evidence"]
            }
            forged_exact["selected_candidates"] = [
                candidates_by_id[item] for item in alternative["selected_ids"]
            ]
            forged_exact["selected_code_evidence"] = [
                evidence_by_id[item] for item in alternative["selected_ids"]
            ]
            forged_exact["qaoa_optimality_gap"] = (
                forged_exact["results"]["qaoa"]["raw_qubo_objective"]
                - alternative["raw_qubo_objective"]
            )
            forged_exact["hash_payload"]["results"]["exact"] = {
                "bitstring": alternative["bitstring"],
                "objective": alternative["raw_qubo_objective"],
            }
            self.recompute_hardware_gate(forged_exact)
            self.rehash_full_receipt(forged_exact)
            exact_errors = novelty_scout_receipt_errors(forged_exact)
            self.assertIn(
                "claimed exact result is not the global QUBO optimum",
                exact_errors,
            )
            self.assertFalse(verify_receipt(forged_exact))

            forged_gate = copy.deepcopy(receipt)
            forged_gate["hardware_gate"]["criteria"] = {
                key: True for key in forged_gate["hardware_gate"]["criteria"]
            }
            forged_gate["hardware_gate"]["decision"] = "GO"
            forged_gate["hash_payload"]["hardware_gate_decision"] = "GO"
            self.rehash_full_receipt(forged_gate)
            gate_errors = novelty_scout_receipt_errors(forged_gate)
            self.assertIn("hardware gate criteria do not recompute", gate_errors)
            self.assertFalse(verify_receipt(forged_gate))

            forged_schema = copy.deepcopy(receipt)
            forged_schema["schema"] = "cael-quantum-v1.qaoa-novelty-scout"
            self.rehash_full_receipt(forged_schema)
            self.assertIn(
                "novelty-scout schema downgrade or mismatch",
                novelty_scout_receipt_errors(forged_schema),
            )
            self.assertFalse(verify_receipt(forged_schema))

            forged_greedy = copy.deepcopy(receipt)
            forged_greedy["results"]["greedy"] = copy.deepcopy(
                receipt["results"]["budget_matched_random"]
            )
            forged_greedy["hash_payload"]["results"]["greedy"] = {
                "bitstring": forged_greedy["results"]["greedy"]["bitstring"],
                "objective": forged_greedy["results"]["greedy"]["raw_qubo_objective"],
            }
            self.recompute_hardware_gate(forged_greedy)
            self.rehash_full_receipt(forged_greedy)
            self.assertIn(
                "greedy baseline does not replay from the QUBO",
                novelty_scout_receipt_errors(forged_greedy),
            )
            self.assertFalse(verify_receipt(forged_greedy))

            forged_random = copy.deepcopy(receipt)
            forged_random["results"]["budget_matched_random"] = copy.deepcopy(
                receipt["results"]["greedy"]
            )
            forged_random["results"]["budget_matched_random"].update(
                {
                    "seed": 17,
                    "evaluations": receipt["results"]["qaoa"]["measurement_budget"],
                    "budget_basis": receipt["results"]["budget_matched_random"][
                        "budget_basis"
                    ],
                }
            )
            forged_random["hash_payload"]["results"]["budget_random"] = {
                "bitstring": forged_random["results"]["budget_matched_random"][
                    "bitstring"
                ],
                "objective": forged_random["results"]["budget_matched_random"][
                    "raw_qubo_objective"
                ],
            }
            self.recompute_hardware_gate(forged_random)
            self.rehash_full_receipt(forged_random)
            self.assertIn(
                "seeded random baseline does not replay from the QUBO",
                novelty_scout_receipt_errors(forged_random),
            )
            self.assertFalse(verify_receipt(forged_random))


if __name__ == "__main__":
    unittest.main()
