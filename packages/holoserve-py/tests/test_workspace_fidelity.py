# ruff: noqa: E402 - torch availability must be gated before model imports
import hashlib
import json
from types import SimpleNamespace

import pytest

torch = pytest.importorskip("torch")

from holoserve import workspace_eval as we
from holoserve.model import GPT

from holoserve.workspace_fidelity import (
    S1_GATE_PROFILE,
    S2_GATE_PROFILE,
    S4_GATE_PROFILE,
    _bootstrap_interval,
    _summarize_alias,
    _wilson_lower,
    evaluate_fidelity,
)
from holoserve.workspace_probe import (
    JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256,
    ModelWorkspaceProbe,
    fit_endpoint_affine_jacobian_lens_v1,
    fit_endpoint_local_taylor_jacobian_lens_v1,
    fit_endpoint_scalar_calibrated_jacobian_lens_v1,
    jacobian_lens_v4_fit_receipt_fields,
    load_jacobian_lens_artifact,
    save_jacobian_lens_artifact,
    sha256_file,
    sha256_json,
)


def _records(collapsed: bool = False):
    rows = []
    for index in range(24):
        layers = {}
        for layer in (2, 5, 8):
            gain = 0 if layer == 8 else 2_000_000 + index
            layers[layer] = {
                "gain": gain,
                "anchorGain": 0 if layer == 8 else 1_000_000 + index,
                "mappedTarget": 3_000_000,
                "controlTarget": 5_000_000,
                "entropyErrorGain": 400_000,
                "maxProbabilityErrorGain": 300_000,
                "mappedTopTokenId": 1 if collapsed else index,
                "targetTopTokenId": index,
            }
        rows.append(
            {
                "caseId": f"case-{index:03d}",
                "vertical": f"family-{index % 6}",
                "positionBin": index % 4,
                "layers": layers,
                "macroGain": 2_000_000 + index,
                "macroAnchorGain": 1_000_000 + index,
                "macroEntropyErrorGain": 400_000,
                "macroMaxProbabilityErrorGain": 300_000,
            }
        )
    return rows


def test_whole_family_bootstrap_is_deterministic_and_positive():
    records = _records()
    first = _bootstrap_interval(
        records,
        lambda record: record["macroGain"],
        samples=200,
        seed=17,
    )
    second = _bootstrap_interval(
        records,
        lambda record: record["macroGain"],
        samples=200,
        seed=17,
    )
    assert first == second
    assert first[0] > 0
    assert 0.5 < _wilson_lower(24, 24) < 1


def test_fidelity_summary_requires_input_dependent_top_token_diversity():
    passing = _summarize_alias(_records(), samples=200, seed=19)
    assert passing["passed"] is True
    assert all(passing["gates"].values())

    collapsed = _summarize_alias(_records(collapsed=True), samples=200, seed=19)
    assert collapsed["gates"]["topTokenDiversity"] is False
    assert collapsed["passed"] is False

    varied_s2 = _summarize_alias(
        _records(), samples=200, seed=19, gate_profile=S2_GATE_PROFILE
    )
    assert varied_s2["gates"]["targetTopTokenVariation"] is True
    assert varied_s2["gates"]["topTokenDiversity"] is True
    assert varied_s2["passed"] is True

    constant_target = _records(collapsed=True)
    for record in constant_target:
        for layer in (2, 5, 8):
            record["layers"][layer]["targetTopTokenId"] = 1
    inconclusive_s2 = _summarize_alias(
        constant_target, samples=200, seed=19, gate_profile=S2_GATE_PROFILE
    )
    assert inconclusive_s2["gates"]["targetTopTokenVariation"] is False
    assert inconclusive_s2["passed"] is False


@pytest.mark.parametrize(
    ("gate_profile", "fitter", "expected_schema"),
    (
        (
            S1_GATE_PROFILE,
            fit_endpoint_affine_jacobian_lens_v1,
            "holoscript.model-workspace-fidelity-evaluation.v0.1.0",
        ),
        (
            S2_GATE_PROFILE,
            fit_endpoint_local_taylor_jacobian_lens_v1,
            "holoscript.model-workspace-fidelity-evaluation.v0.2.0",
        ),
        (
            S4_GATE_PROFILE,
            fit_endpoint_scalar_calibrated_jacobian_lens_v1,
            "holoscript.model-workspace-fidelity-evaluation.v0.3.0",
        ),
    ),
)
def test_label_blind_evaluator_replays_a_complete_ab_receipt_matrix(
    tmp_path, gate_profile, fitter, expected_schema
):
    torch.manual_seed(29)
    model = GPT(
        vocab_size=12,
        n_layer=10,
        n_head=1,
        n_embd=4,
        block_size=8,
        dropout=0.0,
    )
    model.eval()
    checkpoint_sha256 = f"sha256:{'1' * 64}"
    tokenizer_sha256 = f"sha256:{'2' * 64}"
    probes = {}
    for alias, calibration in (
        ("a", torch.tensor([[1, 3, 4]], dtype=torch.long)),
        ("b", torch.tensor([[1, 5, 6]], dtype=torch.long)),
    ):
        calibration_batches = [calibration]
        if gate_profile == S4_GATE_PROFILE:
            calibration_batches.append(
                torch.tensor([[1, 7 if alias == "a" else 8, 5]], dtype=torch.long)
            )
        artifact = fitter(
            model,
            calibration_batches,
            layers=[2, 5, 8],
            checkpoint_sha256=checkpoint_sha256,
            tokenizer_sha256=tokenizer_sha256,
            dim_batch=2,
            max_seq_len=8,
            position_bins=[(0, 7)],
            **(
                {"control_profile_sha256": JACOBIAN_LENS_V4_CONTROL_PROFILE_SHA256}
                if gate_profile == S4_GATE_PROFILE
                else {}
            ),
        )
        path = tmp_path / f"lens-{alias}.pt"
        save_jacobian_lens_artifact(artifact, path)
        fit_receipt_path = None
        if gate_profile == S4_GATE_PROFILE:
            fit_receipt = {
                "schema": "holoscript.jspace-s4-fit-receipt.v0.1.0",
                **jacobian_lens_v4_fit_receipt_fields(
                    artifact,
                    lens_sha256=sha256_file(path),
                ),
                "semanticLabelsAccessed": False,
                "selfHash": None,
            }
            fit_receipt["selfHash"] = sha256_json(fit_receipt)
            fit_receipt_path = tmp_path / f"lens-{alias}-fit-receipt.json"
            fit_receipt_path.write_text(json.dumps(fit_receipt), encoding="utf-8")
        loaded = load_jacobian_lens_artifact(
            path,
            checkpoint_sha256=checkpoint_sha256,
            tokenizer_sha256=tokenizer_sha256,
            model=model,
            fit_receipt_path=fit_receipt_path,
        )
        probes[alias] = ModelWorkspaceProbe(model, loaded, [None] * 12, f"model-{alias}")

    prompts = []
    rows = []
    receipt_rows = []
    models = []
    capabilities = {}
    for alias, probe in probes.items():
        models.append(
            {
                "alias": alias,
                "modelId": f"model-{alias}",
                "lensSha256": probe.lens.lens_sha256,
            }
        )
        capabilities[alias] = probe.capability()
    for index in range(6):
        prompt = f"fidelity prompt {index}"
        prompt_row = {
            "caseId": f"case-{index}",
            "vertical": f"family-{index}",
            "templateId": f"sha256:{index + 3:064x}",
            "frame": "fidelity",
            "prompt": prompt,
        }
        prompts.append(prompt_row)
        token_ids = torch.tensor([[1, 3 + index % 6, 4]], dtype=torch.long)
        for alias, probe in probes.items():
            receipt = probe.observe(
                token_ids,
                prompt_sha256=f"sha256:{hashlib.sha256(prompt.encode()).hexdigest()}",
                requested_model=f"model-{alias}",
                request_id=f"workspace-{index}-{alias}",
                layers=[2, 5, 8],
                positions=[-1],
                k=3,
                created_at="2026-07-14T00:00:00.000Z",
            )
            binding = next(model for model in models if model["alias"] == alias)
            extracted = we._validate_receipt(
                receipt,
                prompt=prompt,
                binding=binding,
                checkpoint_sha256=checkpoint_sha256,
                tokenizer_sha256=tokenizer_sha256,
                layers=[2, 5, 8],
                positions=[-1],
                k=3,
                allow_truncated=False,
                capability=capabilities[alias],
            )
            rows.append(
                {
                    "caseId": prompt_row["caseId"],
                    "vertical": prompt_row["vertical"],
                    "templateId": prompt_row["templateId"],
                    "frame": "fidelity",
                    "modelAlias": alias,
                    "modelId": f"model-{alias}",
                    "lensSha256": binding["lensSha256"],
                    "receiptHash": receipt["receiptHash"],
                    "observationSha256": receipt["observationSha256"],
                    "promptSha256": receipt["input"]["promptSha256"],
                    "originalTokenCount": 3,
                    "tokenCount": 3,
                    "truncated": False,
                    **extracted,
                }
            )
            receipt_rows.append(
                {
                    "caseId": prompt_row["caseId"],
                    "frame": "fidelity",
                    "modelAlias": alias,
                    "receipt": receipt,
                }
            )

    prompt_path = tmp_path / "prompts.jsonl"
    row_path = tmp_path / "rows.jsonl"
    receipt_path = tmp_path / "receipts.jsonl"
    collection_path = tmp_path / "collection.json"
    preregistration_path = tmp_path / "preregistration.md"
    output_path = tmp_path / "fidelity.json"
    we._write_jsonl_atomic(prompt_path, prompts)
    we._write_jsonl_atomic(row_path, rows)
    we._write_jsonl_atomic(receipt_path, receipt_rows)
    preregistration_path.write_text("frozen\n", encoding="utf-8")
    collection = {
        "schema": we.COLLECTION_SCHEMA,
        "status": "diagnostic",
        "createdAt": "2026-07-14T00:00:00.000Z",
        "promptManifestSha256": we._sha256_file(prompt_path),
        "rowArtifactSha256": we._sha256_file(row_path),
        "receiptArtifactSha256": we._sha256_file(receipt_path),
        "codeFileSha256": we._sha256_file(we.__file__),
        "codeRevision": None,
        "checkpointSha256": checkpoint_sha256,
        "tokenizerSha256": tokenizer_sha256,
        "models": models,
        "capabilities": capabilities,
        "layers": [2, 5, 8],
        "positions": [-1],
        "k": 3,
        "maximumTokenCount": 512,
        "measurementProfile": we.MODEL_WORKSPACE_MEASUREMENT_PROFILE,
        "controlProfile": we.MODEL_WORKSPACE_CONTROL_PROFILE,
        "scoreProfile": we.MODEL_WORKSPACE_SCORE_PROFILE,
        "legacyComparatorProfile": we.LEGACY_COMPARATOR_PROFILE,
        "allowTruncated": False,
        "promptCount": len(prompts),
        "rowCount": len(rows),
        "receiptCount": len(receipt_rows),
        "truncatedRowCount": 0,
        "selfHash": None,
    }
    collection["selfHash"] = sha256_json(collection)
    we._write_json_atomic(collection_path, collection)

    evaluate_fidelity(
        SimpleNamespace(
            rows=str(row_path),
            receipts=str(receipt_path),
            prompt_manifest=str(prompt_path),
            collection_manifest=str(collection_path),
            preregistration=str(preregistration_path),
            output=str(output_path),
            bootstrap_samples=50,
            bootstrap_seed=31,
            gate_profile=gate_profile,
        )
    )
    result = json.loads(output_path.read_text(encoding="utf-8"))
    assert result["schema"] == expected_schema
    if gate_profile != S1_GATE_PROFILE:
        assert result["gateProfile"] == gate_profile
    else:
        assert "gateProfile" not in result
    if gate_profile == S4_GATE_PROFILE:
        assert all("attribution" in result["aliases"][alias] for alias in ("a", "b"))
    assert result["semanticLabelsAccessed"] is False
    assert result["selfHash"] == sha256_json({**result, "selfHash": None})
