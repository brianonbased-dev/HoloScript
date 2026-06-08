#!/usr/bin/env python3
"""
grpo_eval.py — Held-out evaluation for a trained GRPO adapter.

Loads the adapter, generates completions for each held-out eval prompt,
scores them with the 5 reward functions, and writes an eval receipt.

Environment variables:
  ADAPTER_DIR      Path to saved PEFT adapter (from grpo_fleet_job.py)
  EVAL_PROMPTS     Path to eval-prompts.jsonl
  OUTPUT_DIR       Where to write eval-receipt.json
  BASE_MODEL       Base model ID (must match training)
  TRAINING_ROOT    Path to scripts/training/

Exit 0 on success, 1 on error.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("grpo_eval")

ADAPTER_DIR   = os.environ.get("ADAPTER_DIR", "")
EVAL_PROMPTS  = os.environ.get("EVAL_PROMPTS", "")
OUTPUT_DIR    = os.environ.get("OUTPUT_DIR", "/workspace/exp-grpo-out")
BASE_MODEL    = os.environ.get("BASE_MODEL", "Qwen/Qwen2.5-7B-Instruct")
TRAINING_ROOT = os.environ.get("TRAINING_ROOT", str(Path(__file__).parent.parent / "training"))
SEED          = int(os.environ.get("GRPO_SEED", "42"))

sys.path.insert(0, str(Path(TRAINING_ROOT).resolve()))

# GRPO reward weights (must match GRPORewardFunctions.ts / grpo_rewards.py)
REWARD_WEIGHTS = {
    "test_pass":       0.40,
    "type_check":      0.20,
    "lint":            0.15,
    "coverage":        0.15,
    "circuit_breaker": 0.10,
}


def load_eval_prompts(path: str) -> List[dict]:
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    logger.info("Loaded %d eval prompts", len(records))
    return records


def generate_completions(model, tokenizer, prompts: List[dict], device: str = "cuda") -> List[str]:
    """Generate one completion per prompt using greedy decode."""
    import torch  # type: ignore[import]
    completions = []
    model.eval()
    with torch.no_grad():
        for record in prompts:
            msgs = record.get("prompt", [{"role": "user", "content": record.get("prompt", "")}])
            if isinstance(msgs, list):
                text = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
            else:
                text = str(msgs)
            inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512).to(device)
            out = model.generate(
                **inputs,
                max_new_tokens=256,
                do_sample=False,
                temperature=1.0,
                pad_token_id=tokenizer.eos_token_id,
            )
            generated = out[0, inputs["input_ids"].shape[1]:]
            completions.append(tokenizer.decode(generated, skip_special_tokens=True))
    return completions


def score_completions(completions: List[str]) -> dict:
    """Score with grpo_rewards if available, else heuristics."""
    try:
        import grpo_rewards  # type: ignore[import]
        scores = {
            "test_pass":       grpo_rewards.test_pass_reward(completions),
            "type_check":      grpo_rewards.type_check_reward(completions),
            "lint":            grpo_rewards.lint_reward(completions),
            "coverage":        grpo_rewards.coverage_reward(completions),
            "circuit_breaker": grpo_rewards.circuit_breaker_reward(completions),
        }
        mode = "subprocess"
    except ImportError:
        from grpo_fleet_job import (  # type: ignore[import]
            _heuristic_test_pass, _heuristic_type_check, _heuristic_lint,
            _heuristic_coverage, _heuristic_circuit_breaker,
        )
        scores = {
            "test_pass":       _heuristic_test_pass(completions),
            "type_check":      _heuristic_type_check(completions),
            "lint":            _heuristic_lint(completions),
            "coverage":        _heuristic_coverage(completions),
            "circuit_breaker": _heuristic_circuit_breaker(completions),
        }
        mode = "heuristic"
    return scores, mode


def compute_quality_score(scores: dict, n: int) -> float:
    """Weighted composite quality score across all N completions."""
    total = 0.0
    for dim, weight in REWARD_WEIGHTS.items():
        dim_rewards = scores.get(dim, [0.0] * n)
        avg = sum(dim_rewards) / len(dim_rewards) if dim_rewards else 0.0
        total += avg * weight
    return round(total, 4)


def main():
    if not ADAPTER_DIR or not Path(ADAPTER_DIR).exists():
        logger.error("ADAPTER_DIR=%s not found", ADAPTER_DIR)
        sys.exit(1)
    if not EVAL_PROMPTS or not Path(EVAL_PROMPTS).exists():
        logger.error("EVAL_PROMPTS=%s not found", EVAL_PROMPTS)
        sys.exit(1)

    try:
        import torch  # type: ignore[import]
        from peft import PeftModel  # type: ignore[import]
        from transformers import AutoModelForCausalLM, AutoTokenizer  # type: ignore[import]
    except ImportError as e:
        logger.error("Missing dependency: %s", e)
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Device: %s", device)

    logger.info("Loading base model %s ...", BASE_MODEL)
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )

    logger.info("Loading adapter from %s ...", ADAPTER_DIR)
    model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
    model.eval()

    eval_prompts = load_eval_prompts(EVAL_PROMPTS)
    if not eval_prompts:
        logger.error("No eval prompts found")
        sys.exit(1)

    logger.info("Generating completions for %d prompts ...", len(eval_prompts))
    t0 = time.time()
    completions = generate_completions(model, tokenizer, eval_prompts, device)
    gen_elapsed = time.time() - t0
    logger.info("Generated %d completions in %.1f s", len(completions), gen_elapsed)

    logger.info("Scoring completions ...")
    t1 = time.time()
    scores, score_mode = score_completions(completions)
    score_elapsed = time.time() - t1
    logger.info("Scored in %.1f s (mode=%s)", score_elapsed, score_mode)

    quality_score = compute_quality_score(scores, len(completions))
    per_dim = {
        dim: round(sum(v) / len(v), 4) if v else 0.0
        for dim, v in scores.items()
    }

    logger.info("Quality score: %.4f", quality_score)
    logger.info("Per-dim scores: %s", per_dim)

    receipt = {
        "jobType": "grpo-eval",
        "completedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "adapterDir": ADAPTER_DIR,
        "baseModel": BASE_MODEL,
        "evalPrompts": len(eval_prompts),
        "qualityScore": quality_score,
        "perDimScores": per_dim,
        "rewardMode": score_mode,
        "genTimeSec": round(gen_elapsed, 1),
        "scoreTimeSec": round(score_elapsed, 1),
    }

    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    receipt_path = str(Path(OUTPUT_DIR) / "eval-receipt.json")
    with open(receipt_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    logger.info("Eval receipt → %s", receipt_path)

    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
