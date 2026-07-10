#!/usr/bin/env python3
"""
grpo_analyze.py — On-box verdict: PROVE / KILL / INCONCLUSIVE.

Reads the training receipt and eval receipt produced by grpo_fleet_job.py /
grpo_eval.py and emits a structured verdict JSON.

Preferred (measured-paired) verdict — when the eval receipt carries a base arm
(perPromptBase / perPromptAdapter, baselineSource="measured"). Uses a bootstrap
95% CI on the per-prompt delta (adapter − base):
  KILL          CI upper bound < 0 (adapter significantly worse)  OR  quality < KILL_THRESHOLD
  PROVE         CI lower bound > MIN_DELTA  AND  quality >= ABS_THRESHOLD
  INCONCLUSIVE  CI straddles the margin (honest "within noise" band)

Legacy fallback (guessed baseline) — only when no measured base arm is present.
Point estimate vs a hardcoded BASELINE_QUALITY; tagged baselineSource="guessed"
because it cannot separate the adapter's effect from error in the guess:
  PROVE / KILL / INCONCLUSIVE per determine_verdict().

Environment variables:
  TRAINING_RECEIPT     Path to training-receipt.json
  EVAL_RECEIPT         Path to eval-receipt.json
  OUTPUT_DIR           Where to write verdict.json
  BASELINE_QUALITY     Guessed base quality — FALLBACK ONLY (default: 0.30)
  MIN_DELTA            Minimum improvement over baseline to PROVE (default: 0.05)
  ABS_THRESHOLD        Minimum absolute quality to PROVE (default: 0.35)
  KILL_THRESHOLD       Maximum quality below which we KILL (default: 0.20)
  GRPO_SEED            Bootstrap resample seed (default: 42)
  BOOTSTRAP_RESAMPLES  Bootstrap resample count (default: 10000)

Exit 0 always; verdict is communicated via JSON stdout + verdict.json.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import grpo_stats  # noqa: E402  (pure-stdlib paired-stats helpers)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("grpo_analyze")

TRAINING_RECEIPT = os.environ.get("TRAINING_RECEIPT", "")
EVAL_RECEIPT     = os.environ.get("EVAL_RECEIPT", "")
OUTPUT_DIR       = os.environ.get("OUTPUT_DIR", "/workspace/exp-grpo-out")

BASELINE_QUALITY = float(os.environ.get("BASELINE_QUALITY", "0.30"))
MIN_DELTA        = float(os.environ.get("MIN_DELTA", "0.05"))
ABS_THRESHOLD    = float(os.environ.get("ABS_THRESHOLD", "0.35"))
KILL_THRESHOLD   = float(os.environ.get("KILL_THRESHOLD", "0.20"))
BOOTSTRAP_SEED   = int(os.environ.get("GRPO_SEED", "42"))
BOOTSTRAP_N      = int(os.environ.get("BOOTSTRAP_RESAMPLES", "10000"))


def _load_json(path: str) -> dict:
    if not path or not Path(path).exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def determine_verdict(quality_score: float, baseline: float) -> tuple[str, str]:
    """LEGACY fallback: point-estimate verdict against a GUESSED baseline.

    Only used when the eval receipt has no measured paired base arm. This path
    cannot separate the adapter's effect from error in the baseline guess, so its
    verdict is explicitly tagged baselineSource="guessed" downstream.
    """
    delta = quality_score - baseline

    if quality_score < KILL_THRESHOLD:
        return "KILL", f"quality_score={quality_score:.4f} < kill_threshold={KILL_THRESHOLD}"

    if delta >= MIN_DELTA and quality_score >= ABS_THRESHOLD:
        return "PROVE", (
            f"quality_score={quality_score:.4f} >= baseline+{MIN_DELTA} "
            f"(baseline={baseline:.4f}, delta={delta:.4f})"
        )

    return "INCONCLUSIVE", (
        f"quality_score={quality_score:.4f}, delta={delta:.4f} (need >={MIN_DELTA}), "
        f"abs={quality_score:.4f} (need >={ABS_THRESHOLD})"
    )


def main():
    training = _load_json(TRAINING_RECEIPT)
    eval_data = _load_json(EVAL_RECEIPT)

    per_dim = eval_data.get("perDimScores", {}) if eval_data else {}
    quality_score = eval_data.get("qualityScore", 0.0) if eval_data else 0.0

    base_arm = eval_data.get("perPromptBase") or []
    adapter_arm = eval_data.get("perPromptAdapter") or []
    measured = (
        eval_data.get("baselineSource") == "measured"
        and len(base_arm) > 0
        and len(base_arm) == len(adapter_arm)
    )

    if not eval_data:
        logger.warning("No eval receipt found — emitting INCONCLUSIVE")
        result = {
            "verdict": "INCONCLUSIVE",
            "reason": "no eval receipt",
            "baselineSource": "none",
            "qualityScore": 0.0,
        }
    elif measured:
        # Preferred path: measured paired base arm → CI-based verdict.
        stats = grpo_stats.paired_verdict(
            base_arm, adapter_arm,
            min_delta=MIN_DELTA, abs_threshold=ABS_THRESHOLD,
            kill_threshold=KILL_THRESHOLD,
            seed=BOOTSTRAP_SEED, n_resamples=BOOTSTRAP_N,
        )
        result = dict(stats)
        result["qualityScore"] = round(stats["adapterQuality"], 4)
        result["delta"] = stats["deltaMean"]
        logger.info("Verdict: %s — %s", result["verdict"], result["reason"])
        logger.info("Paired: adapter=%.4f base=%.4f deltaCI95=%s wilcoxonP=%.4f",
                    stats["adapterQuality"], stats["baselineQuality"],
                    stats["deltaCI95"], stats["wilcoxonP"])
    else:
        # Fallback: no measured base arm → legacy guessed-baseline point estimate.
        verdict, reason = determine_verdict(quality_score, BASELINE_QUALITY)
        logger.warning("No measured base arm in eval receipt — using GUESSED "
                       "baseline=%.4f (verdict is not identification-clean)",
                       BASELINE_QUALITY)
        logger.info("Verdict: %s — %s", verdict, reason)
        result = {
            "verdict": verdict,
            "reason": reason,
            "baselineSource": "guessed",
            "qualityScore": quality_score,
            "baselineQuality": BASELINE_QUALITY,
            "delta": round(quality_score - BASELINE_QUALITY, 4),
        }

    result.update({
        "perDimScores": per_dim,
        "thresholds": {
            "minDelta": MIN_DELTA,
            "absThreshold": ABS_THRESHOLD,
            "killThreshold": KILL_THRESHOLD,
        },
        "trainingReceipt": training,
        "evalReceipt": eval_data,
        "analyzedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })

    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    verdict_path = str(Path(OUTPUT_DIR) / "verdict.json")
    with open(verdict_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)
    logger.info("Verdict → %s", verdict_path)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
