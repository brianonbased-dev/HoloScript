from __future__ import annotations

import copy
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from qiskit.circuit.library import QAOAAnsatz
from qiskit.quantum_info import SparsePauliOp

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

from quantum_novelty_scout import (  # noqa: E402
    build_qubo,
    canonical_hash,
    encode_pyramid_bitstring,
    evaluate_code_evidence,
    exact_baseline,
    greedy_marginal_reward,
    load_fixture,
    pyramid_equivalence_certificate,
    portfolio_metrics,
    qubo_objective,
    run_scout,
    semantic_exact_baseline,
    verify_receipt,
)
from quantum_execute import _qaoa_parameter_values  # noqa: E402
from quantum_receipt_verify import (  # noqa: E402
    _paradox_probe_fixture_errors,
    expected_receipt_hash,
    linked_code_evidence_verifies,
    novelty_scout_receipt_errors,
)
from paradox_probe_controls import verify_control_corpus  # noqa: E402


class QuantumNoveltyScoutTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture_path = (
            REPO_ROOT / "research" / "quantum-novelty-scout" / "candidates-v1.json"
        )
        self.pyramid_fixture_path = (
            REPO_ROOT
            / "research"
            / "quantum-novelty-scout"
            / "paradox-pyramid-probes-v1.json"
        )

    def pyramid_fixture(self) -> dict:
        fixture = json.loads(self.pyramid_fixture_path.read_text(encoding="utf-8"))
        fixture["paradox_probe_policy"][
            "durable_receipt_requires_committed_sources"
        ] = False
        return fixture

    def paradox_fixture(self) -> dict:
        fixture = json.loads(self.fixture_path.read_text(encoding="utf-8"))
        corpus_path = (
            REPO_ROOT
            / "research"
            / "quantum-novelty-scout"
            / "paradox-probe-controls-v1.json"
        )
        control_executor_path = REPO_ROOT / "scripts" / "paradox_probe_controls.py"
        control_receipt_path = (
            corpus_path.parent / "paradox-probe-control-receipt-v1.json"
        )
        fixture["schema"] = "holoscript.quantum-paradox-probes.v1"
        fixture["score_basis"] = (
            "Author-assigned probe-planning priors. Explicit outcome fields and "
            "known paradox-label tokens are excluded from declared optimizer "
            "channels, but the authors were not blinded and outcome independence "
            "is not claimed."
        )
        fixture["score_weights"] = {
            "expected_information_gain": 2.0,
            "falsifier_readiness": 1.5,
            "strategic_value": 1.0,
            "expected_cost": -1.0,
        }
        fixture["kill_status_adjustments"] = {
            "pending_fresh_source_check": 0.0,
        }
        fixture["paradox_probe_policy"] = {
            "ranking_field_allowlist": list(fixture["score_weights"]),
            "forbidden_ranking_tokens": [
                "adjudication",
                "bounded_tradeoff",
                "bug",
                "dissolved",
                "empirical_anomaly",
                "impossibility",
                "new_mechanism",
                "novelty",
                "outcome",
                "paradox_score",
                "productive",
                "retired",
                "unresolved",
                "value_tension",
                "verdict",
            ],
            "allowed_stages": ["normalized", "falsifiable", "reproduced"],
            "require_outcome_field_exclusion": True,
            "author_blinding_claimed": False,
            "control_labels_are_author_supplied": True,
            "require_code_state_binding": True,
            "durable_receipt_requires_committed_sources": False,
            "declared_state_path_churn_weight": 1.25,
            "adjudication_corpus": str(corpus_path.relative_to(REPO_ROOT)).replace(
                "\\", "/"
            ),
            "adjudication_corpus_schema": "holoscript.paradox-control-corpus.v1",
            "adjudication_corpus_sha256": hashlib.sha256(
                corpus_path.read_bytes()
            ).hexdigest(),
            "control_executor": str(
                control_executor_path.relative_to(REPO_ROOT)
            ).replace("\\", "/"),
            "control_executor_sha256": hashlib.sha256(
                control_executor_path.read_bytes()
            ).hexdigest(),
            "control_receipt": str(
                control_receipt_path.relative_to(REPO_ROOT)
            ).replace("\\", "/"),
            "control_receipt_sha256": hashlib.sha256(
                control_receipt_path.read_bytes()
            ).hexdigest(),
            "passing_control_receipt_required": True,
            "claim_boundary": (
                "The QUBO excludes outcome fields but the authors were not blinded "
                "to the control labels. It does not certify a paradox or novelty."
            ),
        }
        for index, candidate in enumerate(fixture["candidates"]):
            if not candidate["code_evidence"]["implementation"]:
                candidate["code_evidence"]["implementation"] = [
                    "scripts/quantum_novelty_scout.py"
                ]
            if not candidate["code_evidence"]["verification"]:
                candidate["code_evidence"]["verification"] = [
                    "scripts/__tests__/test_quantum_novelty_scout.py"
                ]
            candidate["scores"] = {
                "expected_information_gain": 0.55 + (index % 4) * 0.1,
                "falsifier_readiness": 0.8,
                "strategic_value": 0.7,
                "expected_cost": 0.25 + (index % 3) * 0.1,
            }
            candidate["tags"] = [f"probe-family-{index % 3}", f"target-{index % 2}"]
            candidate["kill_test"] = {
                "named_prior": "fresh-source check required after selection",
                "status": "pending_fresh_source_check",
                "sources": [],
            }
            candidate["paradox_probe"] = {
                "card_id": "PP-001" if index % 2 == 0 else "PP-003",
                "probe_id": f"QP-{index + 1:03d}",
                "stage": "falsifiable",
                "falsifier": f"declared falsifier {index + 1}",
                "stopping_rule": "stop after the declared deterministic replay",
                "outcome_fields_excluded": True,
                "code_state": {
                    "variable_id": f"C-{index + 1:03d}",
                    "binding_basis": "pinned_git_blob_sha256",
                    "complete": True,
                    "states": [
                        {
                            "id": "before",
                            "source_ref": "WORKTREE",
                            "paths": candidate["code_evidence"]["implementation"],
                        },
                        {
                            "id": "after",
                            "source_ref": "WORKTREE",
                            "paths": candidate["code_evidence"]["implementation"],
                        }
                    ],
                },
            }
        return fixture

    def write_temp_fixture(self, root: pathlib.Path, fixture: dict) -> pathlib.Path:
        path = root / "paradox-fixture.json"
        path.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
        return path

    @staticmethod
    def paradox_control_source_blobs(fixture: dict) -> dict[str, bytes]:
        policy = fixture["paradox_probe_policy"]
        return {
            policy[field]: (REPO_ROOT / policy[field]).read_bytes()
            for field in ("adjudication_corpus", "control_executor", "control_receipt")
        }

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

    def test_pyramid9_block_couplings_and_objective_decomposition(self) -> None:
        fixture = load_fixture(self.pyramid_fixture_path)
        qubo = build_qubo(fixture, pyramid_variant="pairwise")

        self.assertEqual(qubo["pyramid_variant"], "pairwise")
        self.assertEqual(qubo["semantic_variable_count"], 9)
        self.assertEqual(qubo["ancilla_variable_count"], 0)
        self.assertEqual(qubo["total_variable_count"], 9)
        self.assertEqual(len(qubo["matrix"]), 9)
        self.assertTrue(all(len(row) == 9 for row in qubo["matrix"]))
        self.assertEqual(
            {
                relation: sum(
                    term["relation"] == relation
                    for term in qubo["structural_pair_terms"]
                )
                for relation in (
                    "same_face",
                    "aligned_cross_face",
                    "other_cross_face",
                )
            },
            {
                "same_face": 9,
                "aligned_cross_face": 9,
                "other_cross_face": 18,
            },
        )
        self.assertEqual(len(qubo["structural_pair_terms"]), 36)
        self.assertAlmostEqual(qubo["structural_pair_matrix"][0][1], 0.25)
        self.assertAlmostEqual(qubo["structural_pair_matrix"][0][3], -0.2)
        self.assertAlmostEqual(qubo["structural_pair_matrix"][0][4], 0.05)
        for i in range(9):
            self.assertEqual(qubo["structural_pair_matrix"][i][i], 0.0)
            self.assertTrue(
                all(qubo["structural_pair_matrix"][i][j] == 0.0 for j in range(i))
            )
        for i, j, delta in ((0, 1, 0.25), (0, 3, -0.2), (0, 4, 0.05)):
            self.assertAlmostEqual(
                qubo["matrix"][i][j],
                qubo["base_portfolio_matrix"][i][j] + delta,
            )

        semantic = "100100100"
        metrics = portfolio_metrics(semantic, fixture, qubo)
        self.assertEqual(metrics["semantic_bitstring"], semantic)
        self.assertEqual(metrics["ancilla_bitstring"], "")
        self.assertEqual(metrics["selected_count"], 3)
        self.assertEqual(metrics["face_counts"], {
            "observability": 1,
            "falsification": 1,
            "proof-scope": 1,
        })
        self.assertTrue(metrics["model_constraints_satisfied"])
        self.assertAlmostEqual(metrics["structural_pair_contribution"], -0.6)
        self.assertAlmostEqual(
            metrics["semantic_pairwise_raw_objective"],
            metrics["base_raw_qubo_objective"]
            + metrics["structural_pair_contribution"],
        )
        self.assertAlmostEqual(
            metrics["raw_qubo_objective"],
            metrics["semantic_pairwise_raw_objective"],
        )

    def test_pyramid9_rejects_invalid_geometry_coefficients_and_claims(self) -> None:
        cases: list[tuple[str, dict, str]] = []

        bad = self.pyramid_fixture()
        bad["pyramid_qubo"]["faces"][0]["candidate_ids"] = bad[
            "pyramid_qubo"
        ]["faces"][0]["candidate_ids"][:2]
        cases.append(("short-face", bad, "three unique candidates"))

        bad = self.pyramid_fixture()
        bad["pyramid_qubo"]["faces"][1]["candidate_ids"][0] = bad[
            "pyramid_qubo"
        ]["faces"][0]["candidate_ids"][0]
        cases.append(("duplicate-member", bad, "partition candidates"))

        for label, value in (
            ("nonfinite-structural", float("inf")),
            ("out-of-range-structural", 1.01),
        ):
            bad = self.pyramid_fixture()
            bad["pyramid_qubo"]["structural_pair_coefficients"]["same_face"] = value
            cases.append((label, bad, "finite, nontrivial, and in"))

        bad = self.pyramid_fixture()
        bad["pyramid_qubo"]["structural_pair_coefficients"] = {
            "same_face": 0.0,
            "aligned_cross_face": 0.0,
            "other_cross_face": 0.0,
        }
        cases.append(("zero-structure", bad, "finite, nontrivial, and in"))

        for label, value in (
            ("zero-cubic", 0.0),
            ("nonfinite-cubic", float("nan")),
            ("out-of-range-cubic", -1.01),
        ):
            bad = self.pyramid_fixture()
            bad["pyramid_qubo"]["aligned_cubic_coefficients"][0] = value
            cases.append((label, bad, "three nonzero aligned cubic coefficients"))

        bad = self.pyramid_fixture()
        bad["pyramid_qubo"]["rosenberg_margin"] = 1e-7
        cases.append(("weak-margin", bad, "margin must exceed"))

        bad = self.pyramid_fixture()
        bad["pyramid_qubo"]["quantum_advantage_claimed"] = True
        cases.append(("overclaim", bad, "quantum_advantage_claimed=false"))

        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            root = pathlib.Path(directory)
            for label, fixture, message in cases:
                with self.subTest(case=label):
                    path = root / f"{label}.json"
                    path.write_text(
                        json.dumps(fixture, indent=2) + "\n", encoding="utf-8"
                    )
                    with self.assertRaisesRegex(ValueError, message):
                        load_fixture(path)

    def test_pyramid12_rosenberg_reduction_is_exact_and_ancillas_are_separate(self) -> None:
        fixture = load_fixture(self.pyramid_fixture_path)
        qubo = build_qubo(fixture, pyramid_variant="volume_quadratized")

        self.assertEqual(qubo["semantic_variable_count"], 9)
        self.assertEqual(qubo["ancilla_variable_count"], 3)
        self.assertEqual(qubo["total_variable_count"], 12)
        self.assertEqual(len(qubo["matrix"]), 12)
        self.assertTrue(all(len(row) == 12 for row in qubo["matrix"]))
        self.assertEqual(
            [item["kind"] for item in qubo["variable_order"]],
            ["semantic"] * 9 + ["ancilla"] * 3,
        )
        self.assertEqual(
            [item["id"] for item in qubo["variable_order"][:9]],
            [candidate["id"] for candidate in fixture["candidates"]],
        )

        for term, reduction in zip(
            qubo["higher_order_terms"], qubo["quadratization"]["terms"]
        ):
            left, right = reduction["substitution_pair"]
            remaining = reduction["remaining_index"]
            ancilla = reduction["ancilla_index"]
            coefficient = term["coefficient"]
            strength = reduction["penalty_strength"]
            self.assertAlmostEqual(strength, abs(coefficient) + 0.5)
            self.assertAlmostEqual(
                qubo["matrix"][left][right],
                qubo["semantic_pairwise_matrix"][left][right] + strength,
            )
            self.assertAlmostEqual(qubo["matrix"][left][ancilla], -2 * strength)
            self.assertAlmostEqual(qubo["matrix"][right][ancilla], -2 * strength)
            self.assertAlmostEqual(qubo["matrix"][ancilla][ancilla], 3 * strength)
            self.assertAlmostEqual(qubo["matrix"][remaining][ancilla], coefficient)

        minimum_wrong_gap = float("inf")
        for semantic_mask in range(1 << 9):
            semantic = format(semantic_mask, "09b")
            semantic_bits = [int(bit) for bit in semantic]
            direct_hubo = qubo_objective(
                semantic, qubo["semantic_pairwise_matrix"]
            ) + sum(
                float(term["coefficient"])
                * semantic_bits[term["semantic_indices"][0]]
                * semantic_bits[term["semantic_indices"][1]]
                * semantic_bits[term["semantic_indices"][2]]
                for term in qubo["higher_order_terms"]
            )
            expected = encode_pyramid_bitstring(semantic, qubo)
            expected_ancillas = expected[9:]
            values = {
                format(mask, "03b"): qubo_objective(
                    semantic + format(mask, "03b"), qubo["matrix"]
                )
                for mask in range(1 << 3)
            }
            best_value = min(values.values())
            minimizing = [
                ancillas
                for ancillas, value in values.items()
                if abs(value - best_value) <= 1e-6
            ]
            self.assertEqual(minimizing, [expected_ancillas])
            self.assertAlmostEqual(best_value, direct_hubo, places=6)
            minimum_wrong_gap = min(
                minimum_wrong_gap,
                min(
                    value
                    for ancillas, value in values.items()
                    if ancillas != expected_ancillas
                )
                - direct_hubo,
            )

        certificate = qubo["quadratization"]["equivalence_certificate"]
        self.assertEqual(certificate, pyramid_equivalence_certificate(qubo))
        self.assertEqual(certificate["semantic_assignments_checked"], 512)
        self.assertEqual(certificate["expanded_assignments_checked"], 4096)
        self.assertLessEqual(certificate["max_abs_minimized_objective_error"], 1e-6)
        self.assertAlmostEqual(certificate["minimum_infeasible_gap"], 0.5)
        self.assertAlmostEqual(minimum_wrong_gap, 0.5)
        self.assertTrue(certificate["all_minimizing_ancillas_match_products"])
        self.assertTrue(certificate["expanded_optimum_projects_to_semantic_optimum"])

    def test_pyramid_exact_results_select_only_semantic_candidate_ids(self) -> None:
        fixture = load_fixture(self.pyramid_fixture_path)
        candidate_ids = {candidate["id"] for candidate in fixture["candidates"]}

        pairwise = build_qubo(fixture, pyramid_variant="pairwise")
        pairwise_exact = semantic_exact_baseline(fixture, pairwise)
        self.assertEqual(len(pairwise_exact["bitstring"]), 9)
        self.assertEqual(pairwise_exact["semantic_bitstring"], pairwise_exact["bitstring"])
        self.assertEqual(pairwise_exact["ancilla_bitstring"], "")
        self.assertEqual(pairwise_exact["selected_count"], 3)
        self.assertEqual(
            pairwise_exact["selected_count"],
            pairwise_exact["semantic_bitstring"].count("1"),
        )
        self.assertLessEqual(set(pairwise_exact["selected_ids"]), candidate_ids)

        volume = build_qubo(fixture, pyramid_variant="volume_quadratized")
        semantic_exact = semantic_exact_baseline(fixture, volume)
        expanded_exact = exact_baseline(fixture, volume)
        self.assertEqual(len(semantic_exact["bitstring"]), 12)
        self.assertEqual(semantic_exact["semantic_bitstring"], semantic_exact["bitstring"][:9])
        self.assertEqual(semantic_exact["ancilla_bitstring"], semantic_exact["bitstring"][9:])
        self.assertEqual(
            semantic_exact["ancilla_bitstring"],
            semantic_exact["expected_ancilla_bitstring"],
        )
        self.assertTrue(semantic_exact["ancilla_feasible"])
        self.assertEqual(semantic_exact["selected_count"], 3)
        self.assertEqual(
            semantic_exact["selected_count"],
            semantic_exact["semantic_bitstring"].count("1"),
        )
        self.assertLessEqual(set(semantic_exact["selected_ids"]), candidate_ids)
        self.assertFalse(
            any(item.startswith("ancilla:") for item in semantic_exact["selected_ids"])
        )
        self.assertEqual(
            expanded_exact["semantic_bitstring"], semantic_exact["semantic_bitstring"]
        )
        self.assertAlmostEqual(
            expanded_exact["raw_qubo_objective"],
            semantic_exact["raw_qubo_objective"],
        )

    def test_pyramid_receipts_recompute_and_reject_semantic_tampering(self) -> None:
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            root = pathlib.Path(directory)
            fixture = self.pyramid_fixture()
            fixture_path = root / "pyramid-fixture.json"
            fixture_path.write_text(
                json.dumps(fixture, indent=2) + "\n", encoding="utf-8"
            )
            receipts = {
                variant: run_scout(
                    fixture_path,
                    root / f"{variant}-portfolio.holo",
                    root / f"{variant}-receipt.json",
                    shots=8,
                    grid_points=2,
                    seed=23,
                    pyramid_variant=variant,
                )
                for variant in ("pairwise", "volume_quadratized")
            }

            candidate_ids = {candidate["id"] for candidate in fixture["candidates"]}
            for variant, receipt in receipts.items():
                with self.subTest(variant=variant):
                    self.assertEqual(
                        receipt["schema"],
                        "cael-quantum-v3.qaoa-paradox-pyramid-scout",
                    )
                    self.assertEqual(receipt["pyramid_variant"], variant)
                    self.assertEqual(receipt["candidate_count"], 9)
                    self.assertEqual(receipt["semantic_variable_count"], 9)
                    expected_ancillas = 3 if variant == "volume_quadratized" else 0
                    expected_qubits = 9 + expected_ancillas
                    self.assertEqual(receipt["ancilla_variable_count"], expected_ancillas)
                    self.assertEqual(receipt["total_qubit_count"], expected_qubits)
                    self.assertEqual(
                        receipt["execution_receipt"]["num_qubits"], expected_qubits
                    )
                    self.assertEqual(receipt["hardware_gate"]["decision"], "NO_GO")
                    self.assertFalse(
                        receipt["hardware_gate"]["criteria"]["nontrivial_problem_scale"]
                    )
                    self.assertEqual(
                        receipt["recommended_portfolio"],
                        receipt["results"]["semantic_exact"],
                    )
                    recommended = receipt["recommended_portfolio"]
                    self.assertEqual(recommended["selected_count"], 3)
                    self.assertEqual(
                        recommended["selected_count"],
                        recommended["semantic_bitstring"].count("1"),
                    )
                    self.assertLessEqual(set(recommended["selected_ids"]), candidate_ids)
                    self.assertFalse(
                        any(
                            item.startswith("ancilla:")
                            for item in recommended["selected_ids"]
                        )
                    )
                    self.assertEqual(novelty_scout_receipt_errors(receipt), [])
                    self.assertTrue(verify_receipt(receipt))

            pairwise = receipts["pairwise"]
            forged_structure = copy.deepcopy(pairwise)
            forged_structure["qubo"]["structural_pair_terms"][0][
                "coefficient"
            ] += 0.5
            self.rehash_full_receipt(forged_structure)
            structure_errors = novelty_scout_receipt_errors(forged_structure)
            self.assertTrue(
                any("structural_pair_terms" in error for error in structure_errors),
                structure_errors,
            )
            self.assertFalse(verify_receipt(forged_structure))

            forged_composition = copy.deepcopy(pairwise)
            forged_composition["composition"] = forged_composition["fixture"]
            fixture_record = next(
                item
                for item in forged_composition["source_state"]["files"]
                if item["path"] == forged_composition["fixture"]
            )
            forged_composition["code_hashes"]["composition_sha256"] = fixture_record[
                "git_blob_sha256"
            ]
            forged_composition["hash_payload"]["code_hashes"][
                "composition_sha256"
            ] = fixture_record["git_blob_sha256"]
            self.rehash_full_receipt(forged_composition)
            composition_errors = novelty_scout_receipt_errors(forged_composition)
            self.assertIn(
                "pyramid composition path is not a .holo artifact",
                composition_errors,
            )
            self.assertFalse(verify_receipt(forged_composition))

            forged_matrix = copy.deepcopy(pairwise)
            forged_matrix["qubo"]["matrix"] = [
                [0.0 for _ in range(21)] for _ in range(21)
            ]
            self.rehash_full_receipt(forged_matrix)
            with mock.patch(
                "quantum_receipt_verify._exact_qubo_solution",
                side_effect=AssertionError("malformed matrix reached exact replay"),
            ):
                matrix_errors = novelty_scout_receipt_errors(forged_matrix)
            self.assertIn(
                "QUBO matrix dimension does not match the declared model",
                matrix_errors,
            )
            self.assertFalse(verify_receipt(forged_matrix))

            forged_replay_budget = copy.deepcopy(pairwise)
            forged_replay_budget["results"]["qaoa"][
                "shots_per_evaluation"
            ] = 100_001
            self.rehash_full_receipt(forged_replay_budget)
            with mock.patch(
                "quantum_receipt_verify._deterministic_statevector_qaoa_replay",
                side_effect=AssertionError("unbounded replay reached the sampler"),
            ):
                replay_budget_errors = novelty_scout_receipt_errors(
                    forged_replay_budget
                )
            self.assertIn(
                "QAOA replay shots are outside the verified 1..100000 bound",
                replay_budget_errors,
            )
            self.assertFalse(verify_receipt(forged_replay_budget))

            forged_qaoa = copy.deepcopy(pairwise)
            forged_bits = "0" * forged_qaoa["total_qubit_count"]
            forged_metrics = portfolio_metrics(
                forged_bits,
                fixture,
                forged_qaoa["qubo"],
            )
            original_qaoa = forged_qaoa["results"]["qaoa"]
            forged_metrics.update(
                {
                    "runtime_seconds": original_qaoa["runtime_seconds"],
                    "shots_per_evaluation": original_qaoa["shots_per_evaluation"],
                    "optimizer_evaluations": original_qaoa["optimizer_evaluations"],
                    "measurement_budget": original_qaoa["measurement_budget"],
                    "best_sampled_expectation": 0.0,
                    "selected_parameters": [0.0, 0.0],
                }
            )
            forged_qaoa["results"]["qaoa"] = forged_metrics
            nested = forged_qaoa["execution_receipt"]
            nested["optimal_bitstring"] = forged_bits
            nested["optimal_value"] = forged_metrics["raw_qubo_objective"]
            nested["best_sampled_expectation"] = 0.0
            nested["selected_parameters"] = [0.0, 0.0]
            nested["optimality_gap"] = abs(
                nested["optimal_value"] - nested["classical_optimal_value"]
            )
            nested["hash_payload"] = {
                "input_sha256": nested["input_sha256"],
                "job_id": nested["job_id"],
                "optimal_bitstring": nested["optimal_bitstring"],
                "optimal_value": nested["optimal_value"],
            }
            nested["payload_hash"] = canonical_hash(nested["hash_payload"])
            forged_qaoa["hash_payload"]["execution_payload_hash"] = nested[
                "payload_hash"
            ]
            forged_qaoa["hash_payload"]["results"]["qaoa"] = {
                "bitstring": forged_bits,
                "objective": forged_metrics["raw_qubo_objective"],
            }
            forged_qaoa["qaoa_optimality_gap"] = (
                forged_metrics["raw_qubo_objective"]
                - forged_qaoa["results"]["exact"]["raw_qubo_objective"]
            )
            criteria = forged_qaoa["hardware_gate"]["criteria"]
            criteria["qaoa_strictly_beats_greedy"] = (
                forged_metrics["raw_qubo_objective"]
                < forged_qaoa["results"]["greedy"]["raw_qubo_objective"] - 1e-9
            )
            criteria["qaoa_strictly_beats_budget_random"] = (
                forged_metrics["raw_qubo_objective"]
                < forged_qaoa["results"]["budget_matched_random"][
                    "raw_qubo_objective"
                ]
                - 1e-9
            )
            criteria["qaoa_target_cardinality_met"] = (
                forged_metrics["selected_count"] == forged_qaoa["target_cardinality"]
            )
            criteria["qaoa_model_constraints_satisfied"] = forged_metrics[
                "model_constraints_satisfied"
            ]
            decision = "GO" if all(criteria.values()) else "NO_GO"
            forged_qaoa["hardware_gate"]["decision"] = decision
            forged_qaoa["hash_payload"]["hardware_gate_decision"] = decision
            self.rehash_full_receipt(forged_qaoa)
            qaoa_errors = novelty_scout_receipt_errors(forged_qaoa)
            self.assertTrue(
                any("QAOA" in error and "replay" in error for error in qaoa_errors),
                qaoa_errors,
            )
            self.assertFalse(verify_receipt(forged_qaoa))

            volume = receipts["volume_quadratized"]
            forged_ancilla = copy.deepcopy(volume)
            forged_ancilla["results"]["semantic_exact"]["ancilla_bitstring"] = "111"
            self.rehash_full_receipt(forged_ancilla)
            ancilla_errors = novelty_scout_receipt_errors(forged_ancilla)
            self.assertIn(
                "semantic_exact.ancilla_bitstring does not recompute",
                ancilla_errors,
            )
            self.assertFalse(verify_receipt(forged_ancilla))

            forged_certificate = copy.deepcopy(volume)
            forged_certificate["qubo"]["quadratization"][
                "equivalence_certificate"
            ]["minimum_infeasible_gap"] = 0.0
            self.rehash_full_receipt(forged_certificate)
            certificate_errors = novelty_scout_receipt_errors(forged_certificate)
            self.assertTrue(
                any("quadratization" in error for error in certificate_errors),
                certificate_errors,
            )
            self.assertFalse(verify_receipt(forged_certificate))

            forged_schema = copy.deepcopy(volume)
            forged_schema["schema"] = "cael-quantum-v2.qaoa-novelty-scout"
            self.rehash_full_receipt(forged_schema)
            schema_errors = novelty_scout_receipt_errors(forged_schema)
            self.assertTrue(schema_errors)
            self.assertTrue(
                any(
                    "12..20" in error or "legacy receipt schema" in error
                    for error in schema_errors
                ),
                schema_errors,
            )
            self.assertFalse(verify_receipt(forged_schema))

    def test_legacy_flat_fixtures_and_committed_receipts_remain_compatible(self) -> None:
        for schema in (
            "cael-quantum-v2.qaoa-novelty-scout",
            "cael-quantum-v3.qaoa-paradox-pyramid-scout",
        ):
            with self.subTest(minimal_schema=schema):
                minimal = {"schema": schema}
                self.assertFalse(verify_receipt(minimal))
                self.assertEqual(
                    novelty_scout_receipt_errors(minimal),
                    ["novelty-scout receipt is missing required structure"],
                )

        flat_fixture = load_fixture(self.fixture_path)
        flat_qubo = build_qubo(flat_fixture)
        self.assertNotIn("pyramid_qubo", flat_fixture)
        self.assertNotIn("pyramid_variant", flat_qubo)
        self.assertEqual(len(flat_fixture["candidates"]), 12)
        self.assertEqual(len(flat_qubo["matrix"]), 12)

        legacy_paths = (
            REPO_ROOT
            / "quantum_receipts"
            / "quantum_novelty_scout_statevector_receipt.json",
            REPO_ROOT
            / "quantum_receipts"
            / "quantum_paradox_probe_scout_aer_receipt_v1.json",
        )
        for path in legacy_paths:
            with self.subTest(receipt=path.name):
                receipt = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual(
                    receipt["schema"], "cael-quantum-v2.qaoa-novelty-scout"
                )
                self.assertEqual(receipt["candidate_count"], 12)
                self.assertEqual(novelty_scout_receipt_errors(receipt), [])
                self.assertTrue(verify_receipt(receipt))

    def test_paradox_probe_contract_binds_code_state_without_outcome_leakage(self) -> None:
        fixture = self.paradox_fixture()
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            loaded = load_fixture(path)
        qubo = build_qubo(loaded)
        contract = qubo["paradox_probe_contract"]
        self.assertEqual(contract["mode"], "paradox_probe_selection")
        self.assertEqual(contract["card_ids"], ["PP-001", "PP-003"])
        self.assertEqual(len(contract["code_state_variable_ids"]), 12)
        self.assertEqual(len(contract["code_state_fingerprints"]), 12)
        self.assertFalse(
            contract["explicit_outcome_fields_or_label_tokens_in_score_names_or_tags"]
        )
        self.assertFalse(contract["optimizer_outcome_independence_claimed"])
        self.assertFalse(contract["author_blinding_claimed"])
        self.assertEqual(
            contract["candidate_optimizer_input_fields"],
            [
                "candidates[].id/order",
                "scores",
                "kill_test.status",
                "tags",
                "code_evidence",
                "paradox_probe.code_state",
            ],
        )
        self.assertEqual(
            contract["qubo_configuration_input_fields"],
            [
                "score_weights",
                "target_cardinality",
                "cardinality_penalty",
                "redundancy_penalty",
                "kill_status_adjustments",
                "code_evidence_policy",
                "paradox_probe_policy.declared_state_path_churn_weight",
            ],
        )
        self.assertTrue(contract["passing_control_receipt_bound"])
        self.assertFalse(contract["control_execution_independently_verified"])
        self.assertTrue(
            all(
                binding["all_paths_available"]
                and binding["observed_completeness"] == 1.0
                and binding["state_fingerprint"]
                for binding in qubo["code_state_bindings"]
            )
        )

        changed_label_hash = copy.deepcopy(loaded)
        changed_label_hash["paradox_probe_policy"][
            "adjudication_corpus_sha256"
        ] = "0" * 64
        self.assertEqual(
            build_qubo(changed_label_hash)["matrix"],
            qubo["matrix"],
            "evaluation labels must be causally absent from the QUBO matrix",
        )

    def test_paradox_probe_contract_rejects_outcome_or_verdict_inputs(self) -> None:
        fixture = self.paradox_fixture()
        fixture["score_weights"]["verdict_confidence"] = 1.0
        fixture["paradox_probe_policy"]["ranking_field_allowlist"].append(
            "verdict_confidence"
        )
        fixture["candidates"][0]["scores"]["verdict_confidence"] = 1.0
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            with self.assertRaisesRegex(ValueError, "forbidden ranking token"):
                load_fixture(path)

        fixture = self.paradox_fixture()
        fixture["candidates"][0]["tags"].append("outcome-dissolved")
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            with self.assertRaisesRegex(ValueError, "optimizer tag contains"):
                load_fixture(path)

        for encoded_label in (
            "DISSOLVED",
            "DISSOLVED result",
            "DISSOLVED/result",
            "DISSOLVED.result",
            "preDissolvedSignal",
            "DISSOLVEDRESULT",
        ):
            with self.subTest(encoded_label=encoded_label):
                fixture = self.paradox_fixture()
                fixture["candidates"][0]["tags"].append(encoded_label)
                with tempfile.TemporaryDirectory(
                    dir=SCRIPTS_DIR / "__tests__"
                ) as directory:
                    path = self.write_temp_fixture(pathlib.Path(directory), fixture)
                    with self.assertRaisesRegex(ValueError, "optimizer tag contains"):
                        load_fixture(path)

        fixture = self.paradox_fixture()
        ordinary_fixture = self.fixture_path
        fixture["paradox_probe_policy"]["adjudication_corpus"] = str(
            ordinary_fixture.relative_to(REPO_ROOT)
        ).replace("\\", "/")
        fixture["paradox_probe_policy"]["adjudication_corpus_sha256"] = (
            hashlib.sha256(ordinary_fixture.read_bytes()).hexdigest()
        )
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            with self.assertRaisesRegex(ValueError, "corpus schema mismatch"):
                load_fixture(path)

    def test_paradox_probe_contract_requires_complete_code_state_binding(self) -> None:
        fixture = self.paradox_fixture()
        fixture["candidates"][0]["paradox_probe"]["code_state"]["complete"] = False
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            with self.assertRaisesRegex(ValueError, "complete code-state binding"):
                load_fixture(path)

        fixture = self.paradox_fixture()
        fixture["paradox_probe_policy"][
            "durable_receipt_requires_committed_sources"
        ] = True
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            with self.assertRaisesRegex(ValueError, "requires committed code states"):
                load_fixture(path)

        fixture = self.paradox_fixture()
        fixture["candidates"][0]["paradox_probe"]["code_state"]["states"][0][
            "source_ref"
        ] = "f" * 40
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            loaded = load_fixture(path)
            with self.assertRaisesRegex(ValueError, "does not resolve"):
                build_qubo(loaded)

        fixture = self.paradox_fixture()
        fixture["candidates"][0]["paradox_probe"]["code_state"]["states"] = fixture[
            "candidates"
        ][0]["paradox_probe"]["code_state"]["states"][:1]
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            with self.assertRaisesRegex(ValueError, "at least two states"):
                load_fixture(path)

        fixture = self.paradox_fixture()
        fixture["candidates"][0]["paradox_probe"]["code_state"]["states"][1][
            "paths"
        ] = ["scripts/quantum_receipt_verify.py"]
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            with self.assertRaisesRegex(ValueError, "identical implementation evidence"):
                load_fixture(path)

        fixture = self.paradox_fixture()
        fixture["paradox_probe_policy"]["declared_state_path_churn_weight"] = float(
            "nan"
        )
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            with self.assertRaisesRegex(ValueError, "finite and nonnegative"):
                load_fixture(path)

        fixture = self.paradox_fixture()
        fixture["paradox_probe_policy"]["control_executor_sha256"] = "0" * 64
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            with self.assertRaisesRegex(ValueError, "executor hash mismatch"):
                load_fixture(path)

        fixture = self.paradox_fixture()
        fixture["candidates"][0]["paradox_probe"]["code_state"]["states"][1][
            "id"
        ] = "before"
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            path = self.write_temp_fixture(pathlib.Path(directory), fixture)
            with self.assertRaisesRegex(ValueError, "IDs must be unique"):
                load_fixture(path)

        verifier_errors = _paradox_probe_fixture_errors(
            fixture,
            self.paradox_control_source_blobs(fixture),
        )
        self.assertTrue(
            any("IDs are not unique" in error for error in verifier_errors),
            verifier_errors,
        )

    def test_control_receipt_results_must_semantically_match_the_corpus(self) -> None:
        fixture = self.paradox_fixture()
        source_blobs = self.paradox_control_source_blobs(fixture)
        policy = fixture["paradox_probe_policy"]
        receipt_path = policy["control_receipt"]
        forged = json.loads(source_blobs[receipt_path].decode("utf-8"))
        forged["results"][1] = copy.deepcopy(forged["results"][0])
        forged["results"][0]["observed"] = {"fabricated": True}
        forged["payload_hash"] = canonical_hash(
            {key: value for key, value in forged.items() if key != "payload_hash"}
        )
        forged_bytes = (json.dumps(forged, indent=2) + "\n").encode("utf-8")
        policy["control_receipt_sha256"] = hashlib.sha256(forged_bytes).hexdigest()
        source_blobs[receipt_path] = forged_bytes

        verifier_errors = _paradox_probe_fixture_errors(fixture, source_blobs)
        self.assertTrue(
            any("declared passing semantics" in error for error in verifier_errors),
            verifier_errors,
        )

    def test_historical_code_delta_changes_the_qubo_from_resolved_blobs(self) -> None:
        fixture = self.paradox_fixture()
        candidate = fixture["candidates"][0]
        runner_path = "packages/core/src/plugins/PluginSandboxRunner.ts"
        candidate["code_evidence"]["implementation"] = [runner_path]
        candidate["paradox_probe"]["code_state"]["states"] = [
            {
                "id": "before",
                "source_ref": "c83c2d3c8857c88357bee226df826114ab87432e",
                "paths": [runner_path],
            },
            {
                "id": "after",
                "source_ref": "d225d6572e455d38d28d7482a315b4390870fb1b",
                "paths": [runner_path],
            },
        ]
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            loaded = load_fixture(
                self.write_temp_fixture(pathlib.Path(directory), fixture)
            )
        changed = build_qubo(loaded)
        self.assertEqual(
            changed["code_state_bindings"][0][
                "declared_state_path_churn_fraction"
            ],
            1.0,
        )
        self.assertEqual(changed["code_state_path_churn_adjustments"][0], 1.25)

        unchanged_fixture = copy.deepcopy(loaded)
        unchanged_fixture["candidates"][0]["paradox_probe"]["code_state"][
            "states"
        ][1]["source_ref"] = "c83c2d3c8857c88357bee226df826114ab87432e"
        unchanged = build_qubo(unchanged_fixture)
        self.assertEqual(
            unchanged["code_state_bindings"][0][
                "declared_state_path_churn_fraction"
            ],
            0.0,
        )
        self.assertNotEqual(changed["matrix"][0][0], unchanged["matrix"][0][0])

    def test_paradox_probe_receipt_verifier_recomputes_contract(self) -> None:
        fixture = self.paradox_fixture()
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
            root = pathlib.Path(directory)
            receipt = run_scout(
                self.write_temp_fixture(root, fixture),
                root / "paradox-portfolio.holo",
                root / "paradox-receipt.json",
                shots=8,
                grid_points=2,
                seed=19,
            )
            self.assertEqual(
                novelty_scout_receipt_errors(receipt),
                [],
            )
            forged = copy.deepcopy(receipt)
            forged["qubo"]["paradox_probe_contract"][
                "explicit_outcome_fields_or_label_tokens_in_score_names_or_tags"
            ] = True
            self.rehash_full_receipt(forged)
            self.assertTrue(
                any(
                    "paradox_probe_contract" in error
                    for error in novelty_scout_receipt_errors(forged)
                )
            )
            forged_binding = copy.deepcopy(receipt)
            forged_binding["qubo"]["code_state_bindings"][0]["files"][0][
                "git_blob_sha256"
            ] = "0" * 64
            self.rehash_full_receipt(forged_binding)
            self.assertTrue(
                any(
                    "code_state_bindings" in error
                    for error in novelty_scout_receipt_errors(forged_binding)
                )
            )

            forged_stability = copy.deepcopy(receipt)
            forged_stability["post_execution_source_state"]["files"][0][
                "worktree_sha256"
            ] = "0" * 64
            self.rehash_full_receipt(forged_stability)
            self.assertTrue(
                any(
                    "changed during execution" in error
                    for error in novelty_scout_receipt_errors(forged_stability)
                )
            )

            forged_tree = copy.deepcopy(receipt)
            forged_tree["source_state"]["head_tree"] = "0" * 40
            self.rehash_full_receipt(forged_tree)
            self.assertTrue(
                any(
                    "HEAD tree" in error
                    for error in novelty_scout_receipt_errors(forged_tree)
                )
            )

    def test_false_paradox_control_corpus_is_executable_and_adjudicated(self) -> None:
        corpus_path = (
            REPO_ROOT
            / "research"
            / "quantum-novelty-scout"
            / "paradox-probe-controls-v1.json"
        )
        result = verify_control_corpus(corpus_path)
        self.assertEqual(result["schema"], "holoscript.paradox-control-receipt.v1")
        self.assertEqual(result["record_count"], 12)
        self.assertEqual(result["passed_count"], 12)
        self.assertEqual(result["failed_count"], 0)
        self.assertEqual(
            {item["adjudication"] for item in result["results"]},
            {"DISSOLVED"},
        )
        self.assertTrue(result["all_labels_evaluation_only"])
        self.assertFalse(result["adjudication_protocol"]["author_blinding_claimed"])
        self.assertTrue(result["executor"]["sha256"])
        saved = json.loads(
            (
                corpus_path.parent / "paradox-probe-control-receipt-v1.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(saved, result)

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
        with tempfile.TemporaryDirectory(dir=SCRIPTS_DIR / "__tests__") as directory:
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

            omitted_source = copy.deepcopy(receipt)
            omitted_path = omitted_source["qubo"]["code_evidence"][0]["files"][0][
                "path"
            ]
            omitted_source["source_state"]["files"] = [
                item
                for item in omitted_source["source_state"]["files"]
                if item["path"] != omitted_path
            ]
            self.rehash_full_receipt(omitted_source)
            self.assertTrue(
                any(
                    "existing fixture path is omitted" in error
                    for error in novelty_scout_receipt_errors(omitted_source)
                )
            )
            self.assertFalse(verify_receipt(omitted_source))

            forged_deletion = copy.deepcopy(omitted_source)
            forged_deletion["source_state"]["scoped_dirty"] = True
            forged_deletion["source_state"]["scoped_status"] = [f" D {omitted_path}"]
            self.rehash_full_receipt(forged_deletion)
            self.assertTrue(
                any(
                    "status is not live-verifiable" in error
                    for error in novelty_scout_receipt_errors(forged_deletion)
                )
            )
            self.assertFalse(verify_receipt(forged_deletion))

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
