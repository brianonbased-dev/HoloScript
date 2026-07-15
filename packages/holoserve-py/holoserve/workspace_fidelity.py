"""Label-blind target-fidelity gate for endpoint-affine workspace lenses.

This evaluator consumes HoloServe's already receipt-validated collection shape,
replays every canonical source receipt, and tests whether two independently fit
endpoint Jacobian lenses improve on both the identity logit lens and the
bin-wise mean-final anchor. It never accepts or reads semantic labels.
"""

from __future__ import annotations

import argparse
import hashlib
import math
import random
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Callable, Sequence

import numpy as np

from . import workspace_eval as we
from .workspace_probe import sha256_json


FIDELITY_EVALUATION_SCHEMA = "holoscript.model-workspace-fidelity-evaluation.v0.1.0"
FIDELITY_ESTIMATOR = "endpoint_self_jacobian_affine_v1"
FIDELITY_TRANSPORT_PROFILE = "mean-anchored-affine-final-residual-v1"
PRIMARY_LAYERS = (2, 5)
CEILING_LAYER = 8


def _mean_int(values: Sequence[int]) -> int:
    return we.integer_mean_e8(list(values))


def _position_bin(position: int, bins: Sequence[Sequence[int]]) -> int:
    for index, (start, end) in enumerate(bins):
        if start <= position <= end:
            return index
    raise ValueError(f"position {position} is outside the capability position bins")


def _bootstrap_interval(
    records: Sequence[dict[str, Any]],
    value: Callable[[dict[str, Any]], int],
    *,
    samples: int,
    seed: int,
) -> list[int]:
    if type(samples) is not int or samples < 1 or samples > 1_000_000:
        raise ValueError("bootstrap samples must be an integer in [1, 1000000]")
    if type(seed) is not int or seed < 0 or seed >= 1 << 64:
        raise ValueError("bootstrap seed must be an unsigned 64-bit integer")
    by_vertical: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        by_vertical[record["vertical"]].append(record)
    verticals = sorted(by_vertical)
    if len(verticals) < 2:
        raise ValueError("whole-task-family bootstrap requires at least two families")
    rng = random.Random(seed)
    estimates = []
    for _ in range(samples):
        sampled = [
            record
            for vertical in rng.choices(verticals, k=len(verticals))
            for record in by_vertical[vertical]
        ]
        estimates.append(_mean_int([value(record) for record in sampled]))
    return [int(round(value)) for value in np.quantile(estimates, [0.025, 0.5, 0.975])]


def _wilson_lower(positive: int, total: int, z: float = 1.959963984540054) -> float:
    if total < 1 or positive < 0 or positive > total:
        raise ValueError("Wilson interval requires a valid positive/total count")
    proportion = positive / total
    denominator = 1 + z * z / total
    centre = proportion + z * z / (2 * total)
    margin = z * math.sqrt(
        proportion * (1 - proportion) / total + z * z / (4 * total * total)
    )
    return (centre - margin) / denominator


def _capability_bins(capability: dict[str, Any]) -> list[list[int]]:
    bins = capability.get("positionBins")
    if (
        capability.get("estimator") != FIDELITY_ESTIMATOR
        or capability.get("paperParity") is not False
        or capability.get("transportProfile") != FIDELITY_TRANSPORT_PROFILE
        or capability.get("positionPolicy") != "endpoint-self-only"
        or not we._supported_endpoint_position_bins(bins)
    ):
        raise ValueError("fidelity evaluation requires the endpoint affine capability")
    return bins


def _load_bound_rows(args: argparse.Namespace) -> tuple[
    list[dict[str, Any]], dict[str, Any], dict[str, dict[str, Any]]
]:
    rows = we._read_jsonl(args.rows)
    receipts_rows = we._read_jsonl(args.receipts)
    prompts_rows = we._read_jsonl(args.prompt_manifest)
    collection = we._read_json(args.collection_manifest)
    we._validate_prompt_manifest(prompts_rows)
    if (
        collection.get("schema") != we.COLLECTION_SCHEMA
        or collection.get("status") != "diagnostic"
        or not we._self_hash_matches(collection)
        or collection.get("rowArtifactSha256") != we._sha256_file(args.rows)
        or collection.get("receiptArtifactSha256") != we._sha256_file(args.receipts)
        or collection.get("promptManifestSha256") != we._sha256_file(args.prompt_manifest)
        or collection.get("codeFileSha256") != we._sha256_file(we.__file__)
        or collection.get("rowCount") != len(rows)
        or collection.get("receiptCount") != len(receipts_rows)
        or collection.get("promptCount") != len(prompts_rows)
        or collection.get("truncatedRowCount") != 0
        or collection.get("allowTruncated") is not False
        or collection.get("layers") != list(PRIMARY_LAYERS) + [CEILING_LAYER]
        or collection.get("positions") != [-1]
    ):
        raise ValueError("collection manifest does not bind this fidelity input")
    models = collection.get("models")
    capabilities = collection.get("capabilities")
    if (
        not isinstance(models, list)
        or len(models) != 2
        or {model.get("alias") for model in models if isinstance(model, dict)} != {"a", "b"}
        or len({model.get("lensSha256") for model in models if isinstance(model, dict)}) != 2
        or not isinstance(capabilities, dict)
        or set(capabilities) != {"a", "b"}
    ):
        raise ValueError("fidelity collection requires distinct A/B lens policies")
    bins_by_alias = {alias: _capability_bins(capabilities[alias]) for alias in ("a", "b")}
    if bins_by_alias["a"] != bins_by_alias["b"]:
        raise ValueError("A/B endpoint lenses must share the frozen position bins")

    prompts = {(row["caseId"], row["frame"]): row for row in prompts_rows}
    receipts = {}
    for row in receipts_rows:
        coordinate = (row.get("caseId"), row.get("frame"), row.get("modelAlias"))
        if (
            set(row) != {"caseId", "frame", "modelAlias", "receipt"}
            or not all(isinstance(value, str) and value for value in coordinate)
            or coordinate in receipts
            or not isinstance(row.get("receipt"), dict)
        ):
            raise ValueError(f"malformed or duplicate source receipt: {coordinate}")
        receipts[coordinate] = row["receipt"]
    model_policy = {model["alias"]: model for model in models}
    seen = set()
    bound_rows = []
    for row in rows:
        coordinate = (row.get("caseId"), row.get("frame"), row.get("modelAlias"))
        model = model_policy.get(row.get("modelAlias"))
        capability = capabilities.get(row.get("modelAlias"))
        prompt = prompts.get((row.get("caseId"), row.get("frame")))
        receipt = receipts.get(coordinate)
        if (
            coordinate in seen
            or not all(isinstance(value, str) and value for value in coordinate)
            or model is None
            or not isinstance(capability, dict)
            or prompt is None
            or receipt is None
            or row.get("vertical") != prompt.get("vertical")
            or row.get("templateId") != prompt.get("templateId")
            or row.get("modelId") != model.get("modelId")
            or row.get("lensSha256") != model.get("lensSha256")
            or row.get("truncated") is not False
        ):
            raise ValueError(f"malformed or unbound fidelity row: {coordinate}")
        extracted = we._validate_receipt(
            receipt,
            prompt=prompt["prompt"],
            binding=model,
            checkpoint_sha256=collection.get("checkpointSha256"),
            tokenizer_sha256=collection.get("tokenizerSha256"),
            layers=collection["layers"],
            positions=collection["positions"],
            k=collection["k"],
            allow_truncated=False,
            capability=capability,
        )
        expected = {
            "scoreE8": row.get("scoreE8"),
            "legacyComparatorProfile": row.get("legacyComparatorProfile"),
            "legacyComparatorScoreHex": row.get("legacyComparatorScoreHex"),
            "lensGainE8": row.get("lensGainE8"),
            "coordinates": row.get("coordinates"),
        }
        if (
            extracted != expected
            or receipt.get("receiptHash") != row.get("receiptHash")
            or receipt.get("observationSha256") != row.get("observationSha256")
        ):
            raise ValueError(f"derived fidelity row does not match source receipt: {coordinate}")
        seen.add(coordinate)
        bound_rows.append(row)
    if set(receipts) != seen:
        raise ValueError("source receipts do not exactly match fidelity rows")
    expected_coordinates = {
        (case_id, frame, alias)
        for case_id, frame in prompts
        for alias in ("a", "b")
    }
    if seen != expected_coordinates:
        raise ValueError("fidelity collection is not a complete A/B prompt matrix")
    return bound_rows, collection, capabilities


def _records_for_alias(
    rows: Sequence[dict[str, Any]], alias: str, position_bins: Sequence[Sequence[int]]
) -> list[dict[str, Any]]:
    records = []
    for row in rows:
        if row["modelAlias"] != alias:
            continue
        by_layer = {int(item["layer"]): item for item in row["coordinates"]}
        if set(by_layer) != {*PRIMARY_LAYERS, CEILING_LAYER}:
            raise ValueError("fidelity row does not contain the frozen layer set")
        layer_values = {}
        for layer, coordinate in by_layer.items():
            metrics = coordinate["metrics"]
            anchor = coordinate.get("anchorControlMetrics")
            if not isinstance(anchor, dict):
                raise ValueError("endpoint fidelity row lacks the anchor control")
            mapped_entropy_error = abs(
                metrics["mappedEntropyNatsE8"] - anchor["targetEntropyNatsE8"]
            )
            control_entropy_error = abs(
                metrics["controlEntropyNatsE8"] - anchor["targetEntropyNatsE8"]
            )
            mapped_max_error = abs(
                metrics["mappedMaxProbabilityE8"] - anchor["targetMaxProbabilityE8"]
            )
            control_max_error = abs(
                metrics["controlMaxProbabilityE8"] - anchor["targetMaxProbabilityE8"]
            )
            layer_values[layer] = {
                "gain": int(metrics["lensGainJensenShannonNatsE8"]),
                "anchorGain": int(anchor["mappedVsAnchorLensGainJensenShannonNatsE8"]),
                "mappedTarget": int(metrics["mappedTargetJensenShannonDivergenceNatsE8"]),
                "controlTarget": int(metrics["controlTargetJensenShannonDivergenceNatsE8"]),
                "entropyErrorGain": control_entropy_error - mapped_entropy_error,
                "maxProbabilityErrorGain": control_max_error - mapped_max_error,
                "mappedTopTokenId": int(anchor["mappedTopTokenId"]),
                "targetTopTokenId": int(anchor["targetTopTokenId"]),
            }
        records.append(
            {
                "caseId": row["caseId"],
                "vertical": row["vertical"],
                "positionBin": _position_bin(int(row["tokenCount"]) - 1, position_bins),
                "layers": layer_values,
                "macroGain": _mean_int([layer_values[layer]["gain"] for layer in PRIMARY_LAYERS]),
                "macroAnchorGain": _mean_int(
                    [layer_values[layer]["anchorGain"] for layer in PRIMARY_LAYERS]
                ),
                "macroEntropyErrorGain": _mean_int(
                    [layer_values[layer]["entropyErrorGain"] for layer in PRIMARY_LAYERS]
                ),
                "macroMaxProbabilityErrorGain": _mean_int(
                    [layer_values[layer]["maxProbabilityErrorGain"] for layer in PRIMARY_LAYERS]
                ),
            }
        )
    return sorted(records, key=lambda record: record["caseId"])


def _diversity(values: Sequence[int]) -> dict[str, float | int]:
    counts = Counter(values)
    return {
        "uniqueCount": len(counts),
        "maximumShareE8": round(max(counts.values()) * 100_000_000 / len(values)),
    }


def _summarize_alias(
    records: list[dict[str, Any]], *, samples: int, seed: int
) -> dict[str, Any]:
    layer_results = {}
    for layer in (*PRIMARY_LAYERS, CEILING_LAYER):
        gains = [record["layers"][layer]["gain"] for record in records]
        anchor_gains = [record["layers"][layer]["anchorGain"] for record in records]
        control_mean = _mean_int(
            [record["layers"][layer]["controlTarget"] for record in records]
        )
        mean_gain = _mean_int(gains)
        layer_results[str(layer)] = {
            "mappedTargetMeanE8": _mean_int(
                [record["layers"][layer]["mappedTarget"] for record in records]
            ),
            "controlTargetMeanE8": control_mean,
            "lensGainMeanE8": mean_gain,
            "lensGainBootstrap95E8": _bootstrap_interval(
                records,
                lambda record, selected=layer: record["layers"][selected]["gain"],
                samples=samples,
                seed=(seed ^ (layer * 0x9E3779B185EBCA87)) & ((1 << 64) - 1),
            ),
            "anchorGainMeanE8": _mean_int(anchor_gains),
            "anchorGainBootstrap95E8": _bootstrap_interval(
                records,
                lambda record, selected=layer: record["layers"][selected]["anchorGain"],
                samples=samples,
                seed=(seed ^ (layer * 0xC2B2AE3D27D4EB4F)) & ((1 << 64) - 1),
            ),
            "lensGainPositiveRateE8": round(
                sum(value > 0 for value in gains) * 100_000_000 / len(gains)
            ),
            "lensGainWilsonLower95E8": round(
                _wilson_lower(sum(value > 0 for value in gains), len(gains)) * 100_000_000
            ),
            "ratioOfMeansReductionE8": (
                0 if control_mean == 0 else round(mean_gain * 100_000_000 / control_mean)
            ),
            "positionBinGainMeansE8": {
                str(position_bin): _mean_int(
                    [
                        record["layers"][layer]["gain"]
                        for record in records
                        if record["positionBin"] == position_bin
                    ]
                )
                for position_bin in sorted({record["positionBin"] for record in records})
            },
        }
    macro = {
        "lensGainMeanE8": _mean_int([record["macroGain"] for record in records]),
        "lensGainBootstrap95E8": _bootstrap_interval(
            records,
            lambda record: record["macroGain"],
            samples=samples,
            seed=seed ^ 0xA24BAED4963EE407,
        ),
        "anchorGainMeanE8": _mean_int([record["macroAnchorGain"] for record in records]),
        "anchorGainBootstrap95E8": _bootstrap_interval(
            records,
            lambda record: record["macroAnchorGain"],
            samples=samples,
            seed=seed ^ 0x9FB21C651E98DF25,
        ),
        "entropyErrorGainMeanE8": _mean_int(
            [record["macroEntropyErrorGain"] for record in records]
        ),
        "entropyErrorGainBootstrap95E8": _bootstrap_interval(
            records,
            lambda record: record["macroEntropyErrorGain"],
            samples=samples,
            seed=seed ^ 0xD6E8FEB86659FD93,
        ),
        "maxProbabilityErrorGainMeanE8": _mean_int(
            [record["macroMaxProbabilityErrorGain"] for record in records]
        ),
        "maxProbabilityErrorGainBootstrap95E8": _bootstrap_interval(
            records,
            lambda record: record["macroMaxProbabilityErrorGain"],
            samples=samples,
            seed=seed ^ 0x94D049BB133111EB,
        ),
    }
    mapped_top = [record["layers"][PRIMARY_LAYERS[0]]["mappedTopTokenId"] for record in records]
    target_top = [record["layers"][PRIMARY_LAYERS[0]]["targetTopTokenId"] for record in records]
    mapped_diversity = _diversity(mapped_top)
    target_diversity = _diversity(target_top)
    gates = {
        "macroIdentityGain": macro["lensGainBootstrap95E8"][0] > 0,
        "macroAnchorGain": macro["anchorGainBootstrap95E8"][0] > 0,
        "entropyError": macro["entropyErrorGainBootstrap95E8"][0] > 0,
        "maxProbabilityError": macro["maxProbabilityErrorGainBootstrap95E8"][0] > 0,
        "primaryLayers": all(
            layer_results[str(layer)]["lensGainBootstrap95E8"][0] > 0
            and layer_results[str(layer)]["anchorGainBootstrap95E8"][0] > 0
            and layer_results[str(layer)]["ratioOfMeansReductionE8"] >= 5_000_000
            and layer_results[str(layer)]["lensGainWilsonLower95E8"] > 50_000_000
            and all(
                value > 0
                for value in layer_results[str(layer)]["positionBinGainMeansE8"].values()
            )
            for layer in PRIMARY_LAYERS
        ),
        "ceilingLayerNonInferiority": (
            layer_results[str(CEILING_LAYER)]["lensGainMeanE8"] >= -10_000
            and layer_results[str(CEILING_LAYER)]["lensGainBootstrap95E8"][0] > -50_000
        ),
        "topTokenDiversity": (
            mapped_diversity["uniqueCount"] * 5 >= 4 * target_diversity["uniqueCount"]
            and mapped_diversity["maximumShareE8"]
            <= max(10_000_000, (5 * target_diversity["maximumShareE8"] + 3) // 4)
            and all(
                len(
                    {
                        record["layers"][PRIMARY_LAYERS[0]]["mappedTopTokenId"]
                        for record in records
                        if record["positionBin"] == position_bin
                    }
                )
                > 1
                for position_bin in sorted({record["positionBin"] for record in records})
            )
        ),
    }
    return {
        "recordCount": len(records),
        "macroPrimary": macro,
        "layers": layer_results,
        "mappedTopTokenDiversity": mapped_diversity,
        "targetTopTokenDiversity": target_diversity,
        "gates": gates,
        "passed": all(gates.values()),
    }


def evaluate_fidelity(args: argparse.Namespace) -> None:
    rows, collection, capabilities = _load_bound_rows(args)
    if not Path(args.preregistration).is_file():
        raise ValueError("fidelity evaluation requires the frozen preregistration")
    bins = _capability_bins(capabilities["a"])
    records = {
        alias: _records_for_alias(rows, alias, bins)
        for alias in ("a", "b")
    }
    if [record["caseId"] for record in records["a"]] != [
        record["caseId"] for record in records["b"]
    ]:
        raise ValueError("A/B fidelity records are not paired by case ID")
    alias_results = {
        alias: _summarize_alias(
            records[alias],
            samples=args.bootstrap_samples,
            seed=args.bootstrap_seed
            ^ int.from_bytes(hashlib.sha256(alias.encode()).digest()[:8], "big"),
        )
        for alias in ("a", "b")
    }
    gains_a = [record["macroGain"] for record in records["a"]]
    gains_b = [record["macroGain"] for record in records["b"]]
    correlation = None
    if len(set(gains_a)) > 1 and len(set(gains_b)) > 1:
        candidate = float(np.corrcoef(gains_a, gains_b)[0, 1])
        if math.isfinite(candidate):
            correlation = candidate
    sign_agreement = sum((left > 0) == (right > 0) for left, right in zip(gains_a, gains_b)) / len(
        gains_a
    )
    correlation_e8 = None if correlation is None else round(correlation * 100_000_000)
    sign_agreement_e8 = round(sign_agreement * 100_000_000)
    replication = {
        "macroGainPearsonE8": correlation_e8,
        "macroGainSignAgreementE8": sign_agreement_e8,
        "passed": correlation_e8 is not None
        and correlation_e8 >= 90_000_000
        and sign_agreement_e8 >= 90_000_000,
    }
    result = {
        "schema": FIDELITY_EVALUATION_SCHEMA,
        "status": "label-blind-target-fidelity",
        "createdAt": we._utc_now(),
        "rowsSha256": we._sha256_file(args.rows),
        "receiptsSha256": we._sha256_file(args.receipts),
        "promptManifestSha256": we._sha256_file(args.prompt_manifest),
        "collectionManifestSha256": we._sha256_file(args.collection_manifest),
        "preregistrationSha256": we._sha256_file(args.preregistration),
        "codeFileSha256": we._sha256_file(__file__),
        "checkpointSha256": collection["checkpointSha256"],
        "tokenizerSha256": collection["tokenizerSha256"],
        "models": collection["models"],
        "positionBins": bins,
        "layers": list(PRIMARY_LAYERS) + [CEILING_LAYER],
        "primaryLayers": list(PRIMARY_LAYERS),
        "ceilingLayer": CEILING_LAYER,
        "bootstrap": {
            "method": "whole-task-family-percentile-v1",
            "samples": args.bootstrap_samples,
            "seed": str(args.bootstrap_seed),
        },
        "aliases": alias_results,
        "replication": replication,
        "semanticLabelsAccessed": False,
        "passed": all(result["passed"] for result in alias_results.values())
        and replication["passed"],
        "selfHash": None,
    }
    result["selfHash"] = sha256_json(result)
    we._write_json_atomic(args.output, result)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", required=True)
    parser.add_argument("--receipts", required=True)
    parser.add_argument("--prompt-manifest", required=True)
    parser.add_argument("--collection-manifest", required=True)
    parser.add_argument("--preregistration", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--bootstrap-samples", type=int, default=10_000)
    parser.add_argument("--bootstrap-seed", type=int, default=7_301_642_128_954_031_337)
    return parser


def main() -> None:
    args = _parser().parse_args()
    evaluate_fidelity(args)


if __name__ == "__main__":
    main()
