#!/usr/bin/env python3
"""Focused tamper and admission tests for the frozen J-space S4 runner."""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import torch


REPO_ROOT = Path(__file__).resolve().parents[2]
RUNNER_PATH = REPO_ROOT / "scripts" / "research" / "fit_jspace_s4_lens.py"
SPEC = importlib.util.spec_from_file_location("fit_jspace_s4_lens", RUNNER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("unable to load S4 fit runner")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def _read_jsonl(path: Path) -> list[dict[str, object]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]


def _scalar_artifact(*, alpha_cross: float = 1.0) -> dict[str, object]:
    sequence_sha256s = [f"sha256:{index:064x}" for index in range(1, 5)]
    matrices = torch.eye(2, dtype=torch.float32).repeat(4, 3, 1, 1)
    vectors = torch.zeros((4, 3, 2), dtype=torch.float32)
    ones = torch.ones((4, 3), dtype=torch.float64)
    artifact = {
        "estimator": {
            "name": runner.JACOBIAN_LENS_ESTIMATOR_V4,
            "paperParity": False,
            "vectorization": "batched-endpoint-output-cotangents-retained-graph",
            "transportProfile": runner.JACOBIAN_LENS_V4_TRANSPORT_PROFILE,
            "anchor": "binwise-target-mean-minus-scaled-mean-jacobian-source-mean",
            "scalarCalibration": runner.JACOBIAN_LENS_V4_SCALAR_CALIBRATION_PROFILE,
            "ridgeFraction": 0.001,
            "clipBounds": [0.0, 2.0],
            "scalarIdentityControl": runner.JACOBIAN_LENS_V4_SCALAR_IDENTITY_CONTROL_PROFILE,
        },
        "layers": list(runner.FROZEN_LAYERS),
        "calibration": {
            "positionPolicy": "endpoint-self-only",
            "positionBins": copy.deepcopy(runner.FROZEN_POSITION_BINS),
            "positionBinCounts": [1, 1, 1, 1],
            "sequenceSha256s": sequence_sha256s,
            "sequenceCount": 4,
            "jacobianCount": 4,
            "corpusSha256": runner.sha256_json(sequence_sha256s),
            "shardSha256": f"sha256:{'6' * 64}",
            "dimBatch": runner.FROZEN_DIM_BATCH,
            "maxSeqLen": runner.FROZEN_MAX_SEQ_LEN,
        },
        "model": {"checkpointSha256": runner.FROZEN_CHECKPOINT_SHA256},
        "tokenizer": {"sha256": runner.FROZEN_TOKENIZER_SHA256},
        "matrices": matrices,
        "biases": vectors.clone(),
        "sourceMeans": vectors.clone(),
        "targetMeans": vectors.clone(),
        "jacobianSourceProductMeans": vectors.clone(),
        "centeredJacobianEnergyMeans": ones.clone(),
        "centeredJacobianTargetCrossMeans": torch.full(
            (4, 3), alpha_cross, dtype=torch.float64
        ),
        "centeredIdentityEnergyMeans": ones.clone(),
        "centeredIdentityTargetCrossMeans": ones.clone(),
    }
    artifact["fitBinding"] = runner.jacobian_lens_v4_fit_binding_payload(
        artifact,
        control_profile_sha256=runner.FROZEN_CONTROL_PROFILE_SHA256,
    )
    return artifact


class JSpaceS4FitRunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = REPO_ROOT / "research" / "data" / "jspace-s4"
        cls.manifest_path = cls.data / "selection-manifest.json"
        cls.manifest = json.loads(cls.manifest_path.read_text(encoding="utf-8"))
        cls.preregistration = (
            REPO_ROOT
            / "research"
            / "2026-07-15-jspace-s4-centered-scalar-preregistration.md"
        )

    def test_frozen_formula_and_source_files_are_present(self) -> None:
        self.assertEqual(
            runner.SCALAR_FORMULA_SHA256,
            "sha256:ee608a1b8bbc1545e4928f956417841f4743adfb0d798a15a4eb8c62923a2aac",
        )
        self.assertEqual(
            runner.CONTROL_PROFILE_SHA256,
            "sha256:9c914202bc680ba5e6d1d3fc2413ba81cc61e2bd7cae52d8dda9a9bf314204fa",
        )
        profile = runner._validate_control_profile()
        self.assertEqual(
            runner.sha256_file(self.data / "control-profile.json"),
            runner.FROZEN_CONTROL_PROFILE_FILE_SHA256,
        )
        self.assertEqual(profile["selfHash"], runner.FROZEN_CONTROL_PROFILE_SELF_HASH)
        self.assertEqual(
            profile["selfHash"], runner.JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256
        )
        self.assertEqual(
            runner.sha256_file(self.preregistration),
            runner.FROZEN_S4_PREREGISTRATION_SHA256,
        )
        self.assertTrue(
            all((REPO_ROOT / path).is_file() for path in runner.FIT_SOURCE_PATHS)
        )

    def test_frozen_s4_stage_balances_replay(self) -> None:
        pilot = _read_jsonl(self.data / "fit-a-pilot.jsonl")
        confirmation = _read_jsonl(self.data / "fit-a-confirmation.jsonl")
        pilot_coordinates = [runner.selector._coordinate(row) for row in pilot]
        confirmation_coordinates = [
            runner.selector._coordinate(row) for row in confirmation
        ]
        runner.selector._balance_proof(pilot_coordinates, stage="pilot")
        runner.selector._balance_proof(confirmation_coordinates, stage="confirmation")

    def test_artifact_tamper_breaks_manifest_binding(self) -> None:
        rows = _read_jsonl(self.data / "fit-a-pilot.jsonl")
        rows[0]["prompt"] = f"{rows[0]['prompt']}x"
        scratch = REPO_ROOT / ".scratch"
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as temporary:
            path = Path(temporary) / "fit-a-pilot.jsonl"
            path.write_text(
                "".join(
                    json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n"
                    for row in rows
                ),
                encoding="utf-8",
                newline="\n",
            )
            with self.assertRaisesRegex(ValueError, "byte hash mismatch"):
                runner.selector._verify_binding(
                    rows,
                    path,
                    self.manifest["pilotArtifacts"]["a"],
                    label="tampered S4 pilot",
                )

    def test_external_control_profile_tamper_is_rejected(self) -> None:
        tampered = copy.deepcopy(runner.CONTROL_PROFILE_CONTRACT)
        tampered["controls"][0]["ordinaryComparator"] = False
        tampered["selfHash"] = None
        tampered["selfHash"] = runner.sha256_json(tampered)
        scratch = REPO_ROOT / ".scratch"
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as temporary:
            path = Path(temporary) / "control-profile.json"
            path.write_text(
                json.dumps(tampered, sort_keys=True, indent=2) + "\n",
                encoding="utf-8",
                newline="\n",
            )
            with self.assertRaisesRegex(ValueError, "external frozen contract"):
                runner._validate_control_profile(path)

    def test_ordered_sequence_digest_is_not_the_set_digest(self) -> None:
        rows = _read_jsonl(self.data / "fit-a-pilot.jsonl")
        ordered = runner.sha256_json([row["sequenceSha256"] for row in rows])
        self.assertEqual(
            ordered,
            "sha256:f1789035e24d1ee42b1482f682a362df8494f7c334f2a8c830fd9ccac4af1b13",
        )
        self.assertNotEqual(
            ordered,
            self.manifest["pilotArtifacts"]["a"]["sequenceHashSetSha256"],
        )

    def test_scalar_digest_is_canonical_and_tamper_sensitive(self) -> None:
        artifact = _scalar_artifact()
        first = runner._scalar_statistics_sha256(artifact)
        second = runner._scalar_statistics_sha256(copy.deepcopy(artifact))
        self.assertEqual(first, second)
        tampered = copy.deepcopy(artifact)
        tampered["centeredJacobianTargetCrossMeans"][0, 0] += 1e-12
        self.assertNotEqual(first, runner._scalar_statistics_sha256(tampered))

    def test_fit_binding_tamper_is_rejected(self) -> None:
        artifact = _scalar_artifact()
        artifact["fitBinding"]["sampleCount"] += 1
        sequences = artifact["calibration"]["sequenceSha256s"]
        with self.assertRaisesRegex(ValueError, "fit binding"):
            runner._validate_scalar_artifact(
                artifact,
                expected_sequence_sha256s=sequences,
                expected_position_bin_counts=[1, 1, 1, 1],
            )

    def test_pilot_receipt_sequence_binding_is_exact(self) -> None:
        binding = runner._pilot_calibration_binding(
            "a", self.manifest["pilotArtifacts"]["a"]
        )
        rows = _read_jsonl(self.data / "fit-a-pilot.jsonl")
        self.assertEqual(
            binding["sequenceOrderSha256"],
            runner.sha256_json([row["sequenceSha256"] for row in rows]),
        )
        tampered = copy.deepcopy(self.manifest["pilotArtifacts"]["a"])
        tampered["file"] = "fit-b-pilot.jsonl"
        with self.assertRaisesRegex(ValueError, "path is not frozen"):
            runner._pilot_calibration_binding("a", tampered)

    def test_scalar_formula_and_interior_booleans_are_derived(self) -> None:
        artifact = _scalar_artifact()
        sequences = artifact["calibration"]["sequenceSha256s"]
        validated = runner._validate_scalar_artifact(
            artifact,
            expected_sequence_sha256s=sequences,
            expected_position_bin_counts=[1, 1, 1, 1],
        )
        self.assertIs(validated["primaryAlphaInterior"], True)
        self.assertIs(validated["primaryBetaInterior"], True)
        boundary = _scalar_artifact(alpha_cross=0.0)
        boundary_validation = runner._validate_scalar_artifact(
            boundary,
            expected_sequence_sha256s=sequences,
            expected_position_bin_counts=[1, 1, 1, 1],
        )
        self.assertIs(boundary_validation["primaryAlphaInterior"], False)
        self.assertIs(boundary_validation["primaryBetaInterior"], True)

    def test_bias_tamper_is_rejected(self) -> None:
        artifact = _scalar_artifact()
        artifact["biases"][0, 0, 0] = 1.0
        sequences = artifact["calibration"]["sequenceSha256s"]
        with self.assertRaisesRegex(ValueError, "frozen formula"):
            runner._validate_scalar_artifact(
                artifact,
                expected_sequence_sha256s=sequences,
                expected_position_bin_counts=[1, 1, 1, 1],
            )

    def test_nonfinite_raw_scalar_is_rejected_before_clipping(self) -> None:
        artifact = _scalar_artifact()
        artifact["centeredJacobianEnergyMeans"].fill_(1e-308)
        artifact["centeredJacobianTargetCrossMeans"].fill_(1e308)
        artifact["fitBinding"] = runner.jacobian_lens_v4_fit_binding_payload(
            artifact,
            control_profile_sha256=runner.FROZEN_CONTROL_PROFILE_SHA256,
        )
        sequences = artifact["calibration"]["sequenceSha256s"]
        with self.assertRaisesRegex(ValueError, "unclipped scalar calibration"):
            runner._validate_scalar_artifact(
                artifact,
                expected_sequence_sha256s=sequences,
                expected_position_bin_counts=[1, 1, 1, 1],
            )

    def test_scalar_metadata_rejects_boolean_numeric_aliases(self) -> None:
        artifact = _scalar_artifact()
        artifact["estimator"]["clipBounds"][0] = False
        sequences = artifact["calibration"]["sequenceSha256s"]
        with self.assertRaisesRegex(ValueError, "privacy contract"):
            runner._validate_scalar_artifact(
                artifact,
                expected_sequence_sha256s=sequences,
                expected_position_bin_counts=[1, 1, 1, 1],
            )

    def test_receipt_private_numeric_scalars_are_rejected(self) -> None:
        self.assertTrue(runner._contains_private_numeric_scalars({"alpha": 1.0}))
        self.assertTrue(
            runner._contains_private_numeric_scalars(
                {"nested": {"scalarStatistics": [[1.0]]}}
            )
        )
        self.assertTrue(runner._contains_private_numeric_scalars({"S": 1.0}))
        self.assertTrue(
            runner._contains_private_numeric_scalars(
                {"metadata": {"transportControlMetrics": {"scalarIdentity": {}}}}
            )
        )
        self.assertFalse(
            runner._contains_private_numeric_scalars(
                {
                    "observation": {
                        "layers": [
                            {
                                "transportControlMetrics": {
                                    "scalarIdentity": {
                                        "targetJensenShannonDivergenceNatsE8": 1
                                    }
                                }
                            }
                        ]
                    }
                }
            )
        )
        self.assertFalse(
            runner._contains_private_numeric_scalars(
                {
                    "primaryAlphaInterior": True,
                    "primaryBetaInterior": False,
                    "scalarStatisticsSha256": f"sha256:{'a' * 64}",
                }
            )
        )
        frozen_source_map = {
            "research/2026-07-15-jspace-s4-centered-scalar-preregistration.md": (
                f"sha256:{'b' * 64}"
            )
        }
        self.assertFalse(
            runner._contains_private_numeric_scalars(
                {"fitSourceSha256s": frozen_source_map}
            )
        )
        self.assertTrue(
            runner._contains_private_numeric_scalars(
                {
                    "fitSourceSha256s": {
                        "research/2026-07-15-jspace-s4-centered-scalar-preregistration.md": 1
                    }
                }
            )
        )

    def test_generated_receipt_digest_tamper_is_rejected(self) -> None:
        artifact = _scalar_artifact()
        sequences = artifact["calibration"]["sequenceSha256s"]
        scalar_validation = runner._validate_scalar_artifact(
            artifact,
            expected_sequence_sha256s=sequences,
            expected_position_bin_counts=[1, 1, 1, 1],
        )
        source_hash = runner.sha256_file(RUNNER_PATH)
        sources = {
            "scripts/research/fit_jspace_s4_lens.py": source_hash,
            "research/2026-07-15-jspace-s4-centered-scalar-preregistration.md": (
                f"sha256:{'6' * 64}"
            ),
        }
        corpus_binding = {
            "sourceSelectionSha256": f"sha256:{'1' * 64}",
            "sequenceOrderSha256": artifact["fitBinding"][
                "sequenceOrderSha256"
            ],
            "sequenceSetSha256": artifact["fitBinding"]["sequenceSetSha256"],
            "corpusArtifactSha256": f"sha256:{'4' * 64}",
        }
        lens_sha256 = f"sha256:{'5' * 64}"
        core_fields = runner.jacobian_lens_v4_fit_receipt_fields(
            artifact, lens_sha256=lens_sha256
        )
        receipt = {
            **core_fields,
            "scalarFormulaSha256": runner.FROZEN_SCALAR_FORMULA_SHA256,
            "controlProfileSha256": runner.FROZEN_CONTROL_PROFILE_SHA256,
            "controlProfileArtifactSha256": (
                runner.FROZEN_CONTROL_PROFILE_FILE_SHA256
            ),
            "controlProfileSelfHash": runner.FROZEN_CONTROL_PROFILE_SELF_HASH,
            "scalarStatisticsSha256": scalar_validation["scalarStatisticsSha256"],
            "fitBindingSha256": scalar_validation["fitBindingSha256"],
            "primaryAlphaInterior": True,
            "primaryBetaInterior": True,
            **corpus_binding,
            "fitSourceSha256s": sources,
            "fitScriptSha256": source_hash,
            "semanticLabelsAccessed": False,
            "selfHash": None,
        }
        receipt["selfHash"] = runner.sha256_json(receipt)
        runner._validate_generated_receipt_payload(
            receipt,
            artifact=artifact,
            scalar_validation=scalar_validation,
            corpus_binding=corpus_binding,
            fit_source_sha256s=sources,
        )
        for field in (
            "scalarStatisticsSha256",
            "fitBindingSha256",
            "controlProfileArtifactSha256",
            "controlProfileSelfHash",
        ):
            with self.subTest(field=field):
                tampered = copy.deepcopy(receipt)
                tampered[field] = f"sha256:{'f' * 64}"
                tampered["selfHash"] = None
                tampered["selfHash"] = runner.sha256_json(tampered)
                with self.assertRaisesRegex(
                    RuntimeError, "scalar, formula, or source"
                ):
                    runner._validate_generated_receipt_payload(
                        tampered,
                        artifact=artifact,
                        scalar_validation=scalar_validation,
                        corpus_binding=corpus_binding,
                        fit_source_sha256s=sources,
                    )

    def test_attribution_claims_require_the_registered_conjunctions(self) -> None:
        receipts = {
            lane: {
                "primaryAlphaInterior": True,
                "primaryBetaInterior": lane == "a",
            }
            for lane in ("a", "b")
        }
        aliases = {
            lane: {
                "attribution": {
                    "gates": {
                        "centered": True,
                        "localTaylor": True,
                        "jacobianSpecific": True,
                    }
                }
            }
            for lane in ("a", "b")
        }
        admission = runner._derive_attribution_admission(receipts, aliases)
        self.assertIs(admission["scalarCalibrationClaimAdmitted"], True)
        self.assertIs(admission["jacobianSpecificClaimAdmitted"], False)
        receipts["b"]["primaryBetaInterior"] = True
        admitted = runner._derive_attribution_admission(receipts, aliases)
        self.assertIs(admitted["jacobianSpecificClaimAdmitted"], True)
        aliases["a"]["attribution"]["gates"]["centered"] = False
        rejected = runner._derive_attribution_admission(receipts, aliases)
        self.assertIs(rejected["scalarCalibrationClaimAdmitted"], False)
        self.assertIs(rejected["jacobianSpecificClaimAdmitted"], False)

    def test_confirmation_without_passing_evidence_is_rejected(self) -> None:
        args = argparse.Namespace(
            stage="confirmation", dry_run=False, pilot_evidence=None
        )
        with self.assertRaisesRegex(ValueError, "exact-revision passing S4 pilot"):
            runner._validate_pilot_admission(
                args,
                selection_manifest_path=self.manifest_path,
                selection_manifest=self.manifest,
                preregistration_path=self.preregistration,
            )

    def test_confirmation_dry_run_can_validate_without_admission(self) -> None:
        args = argparse.Namespace(
            stage="confirmation", dry_run=True, pilot_evidence=None
        )
        admission, paths = runner._validate_pilot_admission(
            args,
            selection_manifest_path=self.manifest_path,
            selection_manifest=self.manifest,
            preregistration_path=self.preregistration,
        )
        self.assertIsNone(admission)
        self.assertEqual(paths, ())


if __name__ == "__main__":
    unittest.main()
