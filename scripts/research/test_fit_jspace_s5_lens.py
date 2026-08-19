#!/usr/bin/env python3
"""Focused tamper and admission tests for the frozen J-space S5 runner."""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
from pathlib import Path
import unittest

import torch


REPO_ROOT = Path(__file__).resolve().parents[2]
RUNNER_PATH = REPO_ROOT / "scripts" / "research" / "fit_jspace_s5_lens.py"
SPEC = importlib.util.spec_from_file_location("fit_jspace_s5_lens", RUNNER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("unable to load S5 fit runner")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def _read_jsonl(path: Path) -> list[dict[str, object]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]


def _fit_source_sha256s() -> dict[str, str]:
    return {
        path: runner.sha256_file(REPO_ROOT / path)
        for path in runner.FIT_SOURCE_PATHS
    }


def _affine_artifact(*, alpha_cross: float = 1.0) -> dict[str, object]:
    sequence_sha256s = [f"sha256:{index:064x}" for index in range(1, 5)]
    matrices = torch.eye(8, dtype=torch.float32).repeat(4, 3, 1, 1)
    vectors = torch.zeros((4, 3, 8), dtype=torch.float32)
    ones = torch.ones((4, 3), dtype=torch.float64)
    artifact: dict[str, object] = {
        "schema": "holoscript.jacobian-lens-artifact.v0.1.0",
        "kind": "JacobianLensArtifact",
        "method": "jacobian_lens",
        "estimator": {
            "name": runner.JACOBIAN_LENS_ESTIMATOR_V2,
            "paperParity": False,
            "vectorization": "batched-endpoint-output-cotangents-retained-graph",
            "transportProfile": runner.JACOBIAN_LENS_V2_TRANSPORT_PROFILE,
            "anchor": "binwise-target-mean-minus-jacobian-source-mean",
        },
        "implementationVersion": "test",
        "model": {
            "architecture": "holorunner-s0-gpt",
            "checkpointSha256": runner.FROZEN_CHECKPOINT_SHA256,
            "nLayer": 10,
            "nEmbd": 8,
            "vocabSize": 16,
        },
        "tokenizer": {"sha256": runner.FROZEN_TOKENIZER_SHA256},
        "calibration": {
            "positionPolicy": "endpoint-self-only",
            "positionBins": copy.deepcopy(runner.FROZEN_POSITION_BINS),
            "positionBinCounts": [1, 1, 1, 1],
            "sequenceSha256s": sequence_sha256s,
            "sequenceTokenCounts": [1, 129, 257, 385],
            "sequenceCount": 4,
            "jacobianCount": 4,
            "tokenCount": 772,
            "corpusSha256": runner.sha256_json(sequence_sha256s),
            "shardSha256": runner.sha256_json(
                {
                    "sequenceSha256s": sequence_sha256s,
                    "sequenceTokenCounts": [1, 129, 257, 385],
                }
            ),
            "dimBatch": runner.FROZEN_DIM_BATCH,
            "maxSeqLen": runner.FROZEN_MAX_SEQ_LEN,
            "promptTruncationPolicy": "reject-over-max-seq-len",
            "corpusCanonicalization": "ordered-whole-sequence-sha256-v1",
        },
        "layers": list(runner.FROZEN_LAYERS),
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
    artifact["fitBinding"] = runner.jacobian_lens_s5_fit_binding_payload(
        artifact,
        source_artifact_sha256=f"sha256:{'4' * 64}",
        preregistration_sha256=runner.FROZEN_S5_PREREGISTRATION_SHA256,
        selector_sha256=runner.FROZEN_S5_SELECTOR_SHA256,
        fit_source_sha256s=_fit_source_sha256s(),
    )
    return artifact


class JSpaceS5FitRunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = REPO_ROOT / "research" / "data" / "jspace-s5"
        cls.manifest_path = cls.data / "selection-manifest.json"
        cls.manifest = json.loads(cls.manifest_path.read_text(encoding="utf-8"))
        cls.preregistration = (
            REPO_ROOT
            / "research"
            / "2026-07-15-jspace-s5-unscaled-centered-preregistration.md"
        )

    def test_frozen_formula_selector_manifest_and_sources(self) -> None:
        control_profile = json.loads(
            (self.data / "control-profile.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            runner.JACOBIAN_LENS_S5_FORMULA_SHA256,
            "sha256:b776c634fb7b171952149c5fed7a9e3a8a73ad98798e10ce469687fc6817c6a1",
        )
        self.assertEqual(
            control_profile["schema"],
            "holoscript.jspace-s5-control-profile.v0.1.0",
        )
        self.assertEqual(
            control_profile["gateProfile"], runner.FIDELITY_GATE_PROFILE
        )
        self.assertEqual(
            control_profile["experimentProfile"], runner.FIDELITY_GATE_PROFILE
        )
        self.assertEqual(
            control_profile["preregistrationSha256"],
            runner.FROZEN_S5_PREREGISTRATION_SHA256,
        )
        self.assertEqual(
            control_profile["selfHash"], runner.FROZEN_CONTROL_PROFILE_SHA256
        )
        self.assertEqual(
            control_profile["selfHash"],
            runner.sha256_json({**control_profile, "selfHash": None}),
        )
        self.assertEqual(
            runner.sha256_file(self.preregistration),
            runner.FROZEN_S5_PREREGISTRATION_SHA256,
        )
        self.assertEqual(
            runner.sha256_file(
                REPO_ROOT / "scripts" / "research" / "select_jspace_s5_corpus.py"
            ),
            runner.FROZEN_S5_SELECTOR_SHA256,
        )
        self.assertEqual(
            runner.sha256_file(self.manifest_path),
            runner.FROZEN_S5_SELECTION_MANIFEST_SHA256,
        )
        self.assertEqual(
            self.manifest["selfHash"], runner.FROZEN_S5_SELECTION_MANIFEST_SELF_HASH
        )
        self.assertTrue(
            all((REPO_ROOT / path).is_file() for path in runner.FIT_SOURCE_PATHS)
        )

    def test_frozen_s5_partition_is_exact_36_36(self) -> None:
        pilot = _read_jsonl(self.data / "fit-a-pilot.jsonl")
        confirmation = _read_jsonl(self.data / "fit-a-confirmation.jsonl")
        self.assertEqual(len(pilot), 36)
        self.assertEqual(len(confirmation), 36)
        source_coordinates = sorted(
            runner.selector._coordinate(row)
            for row in pilot + confirmation
        )
        runner.selector._balance_proof(
            [runner.selector._coordinate(row) for row in pilot],
            source_coordinates,
            stage="pilot",
        )
        runner.selector._balance_proof(
            [runner.selector._coordinate(row) for row in confirmation],
            source_coordinates,
            stage="confirmation",
        )

    def test_affine_artifact_and_private_control_booleans_are_derived(self) -> None:
        artifact = _affine_artifact()
        sequences = artifact["calibration"]["sequenceSha256s"]
        validated = runner._validate_affine_artifact(
            artifact,
            expected_sequence_sha256s=sequences,
            expected_position_bin_counts=[1, 1, 1, 1],
            source_artifact_sha256=f"sha256:{'4' * 64}",
            fit_source_sha256s=_fit_source_sha256s(),
        )
        self.assertTrue(validated["primaryAlphaInterior"])
        self.assertTrue(validated["primaryBetaInterior"])
        self.assertEqual(
            validated["tensorSha256"],
            runner.jacobian_lens_s5_tensor_sha256(artifact),
        )

    def test_bias_and_fit_binding_tamper_are_rejected(self) -> None:
        for field in ("bias", "binding", "fit_source_extra"):
            with self.subTest(field=field):
                artifact = _affine_artifact()
                if field == "bias":
                    artifact["biases"][0, 0, 0] = 1.0
                    message = "bias"
                elif field == "binding":
                    artifact["fitBinding"]["sourceArtifactSha256"] = (
                        f"sha256:{'5' * 64}"
                    )
                    message = "fit binding"
                else:
                    artifact["fitBinding"]["fitSourceSha256s"]["extra.py"] = (
                        f"sha256:{'5' * 64}"
                    )
                    message = "fit binding"
                with self.assertRaisesRegex(ValueError, message):
                    runner._validate_affine_artifact(
                        artifact,
                        expected_sequence_sha256s=artifact["calibration"][
                            "sequenceSha256s"
                        ],
                        expected_position_bin_counts=[1, 1, 1, 1],
                        source_artifact_sha256=f"sha256:{'4' * 64}",
                        fit_source_sha256s=_fit_source_sha256s(),
                    )

    def test_nonfinite_unclipped_control_is_rejected(self) -> None:
        artifact = _affine_artifact()
        artifact["centeredJacobianEnergyMeans"].fill_(1e-308)
        artifact["centeredJacobianTargetCrossMeans"].fill_(1e308)
        artifact["fitBinding"] = runner.jacobian_lens_s5_fit_binding_payload(
            artifact,
            source_artifact_sha256=f"sha256:{'4' * 64}",
            preregistration_sha256=runner.FROZEN_S5_PREREGISTRATION_SHA256,
            selector_sha256=runner.FROZEN_S5_SELECTOR_SHA256,
            fit_source_sha256s=_fit_source_sha256s(),
        )
        with self.assertRaisesRegex(ValueError, "unclipped"):
            runner._validate_affine_artifact(
                artifact,
                expected_sequence_sha256s=artifact["calibration"][
                    "sequenceSha256s"
                ],
                expected_position_bin_counts=[1, 1, 1, 1],
                source_artifact_sha256=f"sha256:{'4' * 64}",
                fit_source_sha256s=_fit_source_sha256s(),
            )

    def test_receipt_privacy_allows_only_public_control_metrics(self) -> None:
        self.assertTrue(runner._contains_private_numeric_scalars({"alpha": 1.0}))
        self.assertTrue(
            runner._contains_private_numeric_scalars(
                {"centeredScalarStatistics": [[1.0]]}
            )
        )
        self.assertFalse(
            runner._contains_private_numeric_scalars(
                {
                    "observation": {
                        "layers": [
                            {
                                "transportControlMetrics": {
                                    "scalarCalibrated": {
                                        "targetJensenShannonDivergenceNatsE8": 1
                                    },
                                    "scalarIdentity": {
                                        "targetJensenShannonDivergenceNatsE8": 2
                                    },
                                }
                            }
                        ]
                    },
                    "primaryAlphaInterior": True,
                    "primaryBetaInterior": False,
                }
            )
        )

    def test_generated_receipt_tensor_tamper_is_rejected(self) -> None:
        artifact = _affine_artifact()
        validation = runner._validate_affine_artifact(
            artifact,
            expected_sequence_sha256s=artifact["calibration"]["sequenceSha256s"],
            expected_position_bin_counts=[1, 1, 1, 1],
            source_artifact_sha256=f"sha256:{'4' * 64}",
            fit_source_sha256s=_fit_source_sha256s(),
        )
        core = runner.jacobian_lens_s5_fit_receipt_fields(
            artifact, lens_sha256=f"sha256:{'5' * 64}"
        )
        sources = _fit_source_sha256s()
        corpus_binding = {
            "sourceSelectionSha256": f"sha256:{'1' * 64}",
            "sourceArtifactSha256": f"sha256:{'4' * 64}",
            "corpusArtifactSha256": f"sha256:{'4' * 64}",
        }
        receipt = {
            **core,
            **corpus_binding,
            "fitScriptSha256": sources["scripts/research/fit_jspace_s5_lens.py"],
            "semanticLabelsAccessed": False,
            "selfHash": None,
        }
        receipt["selfHash"] = runner.sha256_json(receipt)
        runner._validate_generated_receipt_payload(
            receipt,
            artifact=artifact,
            artifact_validation=validation,
            corpus_binding=corpus_binding,
            fit_source_sha256s=sources,
        )
        receipt["tensorSha256"] = f"sha256:{'f' * 64}"
        receipt["selfHash"] = None
        receipt["selfHash"] = runner.sha256_json(receipt)
        with self.assertRaisesRegex(RuntimeError, "frozen bindings"):
            runner._validate_generated_receipt_payload(
                receipt,
                artifact=artifact,
                artifact_validation=validation,
                corpus_binding=corpus_binding,
                fit_source_sha256s=sources,
            )

    def test_attribution_claims_use_registered_conjunctions(self) -> None:
        receipts = {
            lane: {"primaryAlphaInterior": True, "primaryBetaInterior": True}
            for lane in ("a", "b")
        }
        aliases = {
            lane: {
                "attribution": {
                    "gates": {
                        "meanCentering": True,
                        "unscaled": True,
                        "jacobianSpecific": lane == "a",
                    }
                }
            }
            for lane in ("a", "b")
        }
        admission = runner._derive_attribution_admission(receipts, aliases)
        self.assertTrue(admission["meanCenteringClaimAdmitted"])
        self.assertTrue(admission["unscaledOverCalibratedClaimAdmitted"])
        self.assertFalse(admission["jacobianSpecificClaimAdmitted"])
        aliases["b"]["attribution"]["gates"]["jacobianSpecific"] = True
        self.assertTrue(
            runner._derive_attribution_admission(receipts, aliases)[
                "jacobianSpecificClaimAdmitted"
            ]
        )

    def test_confirmation_requires_passing_exact_revision_evidence(self) -> None:
        args = argparse.Namespace(
            stage="confirmation", dry_run=False, pilot_evidence=None
        )
        with self.assertRaisesRegex(ValueError, "passing S5 pilot"):
            runner._validate_pilot_admission(
                args,
                selection_manifest_path=self.manifest_path,
                selection_manifest=self.manifest,
                preregistration_path=self.preregistration,
            )
        args.dry_run = True
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
