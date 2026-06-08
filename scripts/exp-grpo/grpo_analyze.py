#!/usr/bin/env python3
"""
grpo_analyze.py — On-box verdict: PROVE / KILL / INCONCLUSIVE.

Reads the training receipt and eval receipt produced by grpo_fleet_job.py /
grpo_eval.py and emits a structured verdict JSON.

Verdict rules (order matters — first match wins):
  PROVE         eval quality_score >= BASELINE + MIN_DELTA  AND  quality_score >= ABS_THRESHOLD
  KILL          eval quality_score < KILL_THRESHOLD  OR  training crashed
  INCONCLUSIVE  everything else (delta too small, or quality within noise band)

Environment variables:
  TRAINING_RECEIPT  Path to training-receipt.json
  EVAL_RECEIPT      Path to eval-receipt.json
  OUTPUT_DIR        Where to write verdict.json
  BASELINE_QUALITY  Known baseline quality for the base model (default: 0.30)
  MIN_DELTA         Minimum improvement over baseline to PROVE (default: 0.05)
  ABS_THRESHOLD     Minimum absolute quality to PROVE (default: 0.35)
  KILL_THRESHOLD    Maximum quality below which we KILL (default: 0.20)

Exit 0 always; verdict is communicated via JSON stdout + verdict.json.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("grpo_analyze")

TRAINING_RECEIPT = os.environ.get("TRAINING_RECEIPT", "")
EVAL_RECEIPT     = os.environ.get("EVAL_RECEIPT", "")
OUTPUT_DIR       = os.environ.get("OUTPUT_DIR", "/workspace/exp-grpo-out")

BASELINE_QUALITY = float(os.environ.get("BASELINE_QUALITY", "0.30"))
MIN_DELTA        = float(os.environ.get("MIN_DELTA", "0.05"))
ABS_THRESHOLD    = float(os.environ.get("ABS_THRESHOLD", "0.35"))
KILL_THRESHOLD   = float(os.environ.get("KILL_THRESHOLD", "0.20"))


def _load_json(path: str) -> dict:
    if not path or not Path(path).exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def determine_verdict(quality_score: float, baseline: float) -> tuple[str, str]:
    """Returns (verdict, reason)."""
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

    if not eval_data:
        logger.warning("No eval receipt found — emitting INCONCLUSIVE")
        quality_score = 0.0
        per_dim = {}
    else:
        quality_score = eval_data.get("qualityScore", 0.0)
        per_dim = eval_data.get("perDimScores", {})

    verdict, reason = determine_verdict(quality_score, BASELINE_QUALITY)

    logger.info("Verdict: %s — %s", verdict, reason)
    logger.info("Quality score: %.4f (baseline=%.4f, delta=%.4f)",
                quality_score, BASELINE_QUALITY, quality_score - BASELINE_QUALITY)

    result = {
        "verdict": verdict,
        "reason": reason,
        "qualityScore": quality_score,
        "baselineQuality": BASELINE_QUALITY,
        "delta": round(quality_score - BASELINE_QUALITY, 4),
        "perDimScores": per_dim,
        "thresholds": {
            "minDelta": MIN_DELTA,
            "absThreshold": ABS_THRESHOLD,
            "killThreshold": KILL_THRESHOLD,
        },
        "trainingReceipt": training,
        "evalReceipt": eval_data,
        "analyzedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    verdict_path = str(Path(OUTPUT_DIR) / "verdict.json")
    with open(verdict_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)
    logger.info("Verdict → %s", verdict_path)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
