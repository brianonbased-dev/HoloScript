#!/usr/bin/env python3
"""
grpo_fleet_job.py — Non-interactive TRL GRPOTrainer fleet job.

Consumes artifacts produced by extract.ts (grpo-prompts.jsonl, dpo-pairs.jsonl)
and trains a Qwen2.5 model with OPLoRA + 5 GRPO reward functions.

Designed for unattended execution on a vast.ai GPU box.

Environment variables (all required unless marked optional):
  BASE_MODEL        HuggingFace model ID or local path (default: Qwen/Qwen2.5-7B-Instruct)
  GRPO_PROMPTS      Path to grpo-prompts.jsonl  (from extract.ts)
  DPO_PAIRS         Path to dpo-pairs.jsonl     (from extract.ts, optional for SFT warmup)
  OUTPUT_DIR        Where to write adapter + receipt JSON
  TRAINING_ROOT     Path to scripts/training/ (for grpo_rewards.py + oplora_wrapper.py)
  GRPO_MAX_STEPS    Max training steps (default: 500 for fleet smoke; set 2000 for full run)
  RUN_SFT           "1" to enable SFT warmup stage (default: "0")
  WANDB_API_KEY     Optional W&B logging
  HF_TOKEN          Optional HuggingFace Hub push

Exit codes: 0 success, 1 training error, 2 config error.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("grpo_fleet_job")

# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------

BASE_MODEL     = os.environ.get("BASE_MODEL", "Qwen/Qwen2.5-7B-Instruct")
GRPO_PROMPTS   = os.environ.get("GRPO_PROMPTS", "")
DPO_PAIRS      = os.environ.get("DPO_PAIRS", "")
OUTPUT_DIR     = os.environ.get("OUTPUT_DIR", "/workspace/exp-grpo-out")
TRAINING_ROOT  = os.environ.get("TRAINING_ROOT", str(Path(__file__).parent.parent / "training"))
MAX_STEPS      = int(os.environ.get("GRPO_MAX_STEPS", "500"))
RUN_SFT        = os.environ.get("RUN_SFT", "0") == "1"
HF_ORG         = os.environ.get("HF_ORG", "")
SEED           = int(os.environ.get("GRPO_SEED", "42"))

# LoRA from GRPOConfig.ts RECOMMENDED_GRPO_CONFIG
LORA_RANK      = int(os.environ.get("LORA_RANK", "16"))
LORA_ALPHA     = int(os.environ.get("LORA_ALPHA", "32"))
LORA_DROPOUT   = float(os.environ.get("LORA_DROPOUT", "0.05"))
LORA_TARGETS   = os.environ.get("LORA_TARGETS", "q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj").split(",")

# GRPO hyperparams from RECOMMENDED_GRPO_CONFIG
GRPO_LR        = float(os.environ.get("GRPO_LR", "1e-6"))
GRPO_BETA      = float(os.environ.get("GRPO_BETA", "0.04"))
GRPO_G         = int(os.environ.get("GRPO_G", "8"))
GRPO_TEMP      = float(os.environ.get("GRPO_TEMP", "0.6"))
GRPO_TOP_P     = float(os.environ.get("GRPO_TOP_P", "0.95"))
GRPO_BATCH     = int(os.environ.get("GRPO_BATCH", "4"))
GRPO_GRAD_ACC  = int(os.environ.get("GRPO_GRAD_ACC", "4"))
GRPO_MAX_PROMPT_LEN    = int(os.environ.get("GRPO_MAX_PROMPT_LEN", "512"))
GRPO_MAX_COMPLETION_LEN = int(os.environ.get("GRPO_MAX_COMPLETION_LEN", "1024"))
VLLM_GPU_MEM   = float(os.environ.get("VLLM_GPU_MEM", "0.35"))

# ---------------------------------------------------------------------------
# Inject training helpers from scripts/training/
# ---------------------------------------------------------------------------

sys.path.insert(0, str(Path(TRAINING_ROOT).resolve()))


def _load_grpo_rewards():
    try:
        import grpo_rewards  # type: ignore[import]
        logger.info("grpo_rewards loaded from %s", TRAINING_ROOT)
        return grpo_rewards
    except ImportError as e:
        logger.warning("grpo_rewards not importable (%s) — using heuristic fallbacks", e)
        return None


def _load_oplora_wrapper():
    try:
        import oplora_wrapper  # type: ignore[import]
        logger.info("oplora_wrapper loaded from %s", TRAINING_ROOT)
        return oplora_wrapper
    except ImportError as e:
        logger.warning("oplora_wrapper not importable (%s) — using plain LoRA", e)
        return None


# ---------------------------------------------------------------------------
# Heuristic reward functions (fallback when Node.js tools unavailable)
# Weights: 0.40, 0.20, 0.15, 0.15, 0.10 — matches GRPORewardFunctions.ts
# ---------------------------------------------------------------------------

def _heuristic_test_pass(completions, **kwargs):
    rewards = []
    for c in completions:
        text = c if isinstance(c, str) else (c[0].get("content", "") if c else "")
        score = 0.0
        if any(kw in text for kw in ("describe(", "it(", "test(", "expect(")):
            score += 0.4
        if "import" in text:
            score += 0.2
        if len(text.strip()) > 80:
            score += 0.2
        if "vitest" in text or "jest" in text:
            score += 0.2
        rewards.append(min(1.0, score))
    return rewards


def _heuristic_type_check(completions, **kwargs):
    rewards = []
    type_tokens = [": string", ": number", ": boolean", ": void", "interface ",
                   "type ", "<T>", "Promise<", "readonly ", "as const", "unknown"]
    for c in completions:
        text = c if isinstance(c, str) else (c[0].get("content", "") if c else "")
        hits = sum(1 for t in type_tokens if t in text)
        rewards.append(min(1.0, hits / 4.0))
    return rewards


def _heuristic_lint(completions, **kwargs):
    rewards = []
    for c in completions:
        text = c if isinstance(c, str) else (c[0].get("content", "") if c else "")
        score = 1.0
        if ": any" in text:   score -= 0.30
        if "var "  in text:   score -= 0.20
        if "console.log" in text: score -= 0.10
        if "== " in text and "=== " not in text: score -= 0.15
        rewards.append(max(0.0, score))
    return rewards


def _heuristic_coverage(completions, **kwargs):
    rewards = []
    cov_tokens = ["if ", "else", "try", "catch", "for ", "while",
                  ".map(", ".filter(", ".reduce(", "switch"]
    for c in completions:
        text = c if isinstance(c, str) else (c[0].get("content", "") if c else "")
        hits = sum(1 for t in cov_tokens if t in text)
        rewards.append(min(1.0, hits / 3.0))
    return rewards


def _heuristic_circuit_breaker(completions, **kwargs):
    rewards = []
    for c in completions:
        text = c if isinstance(c, str) else (c[0].get("content", "") if c else "")
        score = 0.6
        if "try" in text and "catch" in text: score += 0.2
        if "Error" in text:  score += 0.1
        if "throw" in text:  score += 0.1
        if "eval(" in text:  score -= 0.5
        rewards.append(max(0.0, min(1.0, score)))
    return rewards


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_grpo_dataset(jsonl_path: str):
    """Load grpo-prompts.jsonl → HuggingFace Dataset."""
    from datasets import Dataset  # type: ignore[import]
    records = []
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            data = json.loads(line)
            records.append({"prompt": [{"role": "user", "content": data["prompt"]}]})
    logger.info("Loaded %d GRPO prompts from %s", len(records), jsonl_path)
    return Dataset.from_list(records)


def load_sft_dataset(jsonl_path: str):
    """Load dpo-pairs.jsonl → SFT dataset (chosen completions only)."""
    from datasets import Dataset  # type: ignore[import]
    if not jsonl_path or not Path(jsonl_path).exists():
        logger.warning("SFT data not found at %s — skipping SFT stage", jsonl_path)
        return None
    examples = []
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            data = json.loads(line)
            if data.get("metadata", {}).get("chosenValid"):
                examples.append({
                    "messages": [
                        {"role": "user",      "content": data.get("prompt", "")},
                        {"role": "assistant", "content": data.get("chosen", "")},
                    ]
                })
    logger.info("Loaded %d SFT examples from %s", len(examples), jsonl_path)
    return Dataset.from_list(examples) if examples else None


# ---------------------------------------------------------------------------
# SFT warmup
# ---------------------------------------------------------------------------

def run_sft(sft_dataset, base_model: str, lora_config, output_dir: str) -> str:
    from transformers import AutoTokenizer  # type: ignore[import]
    from trl import SFTConfig, SFTTrainer  # type: ignore[import]

    logger.info("=== Stage 1: SFT warmup (%d examples) ===", len(sft_dataset))

    sft_output = str(Path(output_dir) / "sft-checkpoint")
    sft_config = SFTConfig(
        output_dir=sft_output,
        num_train_epochs=1,
        per_device_train_batch_size=4,
        learning_rate=2e-5,
        bf16=True,
        gradient_checkpointing=True,
        logging_steps=10,
        save_steps=200,
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
        report_to="wandb" if os.environ.get("WANDB_API_KEY") else "none",
        run_name="grpo-fleet-sft",
        seed=SEED,
    )
    trainer = SFTTrainer(
        model=base_model,
        args=sft_config,
        train_dataset=sft_dataset,
        peft_config=lora_config,
    )
    t0 = time.time()
    trainer.train()
    logger.info("SFT done in %.1f min", (time.time() - t0) / 60)
    trainer.save_model(sft_output)
    return sft_output


# ---------------------------------------------------------------------------
# GRPO training
# ---------------------------------------------------------------------------

def run_grpo(grpo_dataset, model_path: str, reward_funcs: list, lora_config, output_dir: str):
    from trl import GRPOConfig, GRPOTrainer  # type: ignore[import]

    logger.info("=== Stage 2: GRPO training (%d prompts, max_steps=%d) ===",
                len(grpo_dataset), MAX_STEPS)

    adapter_dir = str(Path(output_dir) / "adapter")
    grpo_config = GRPOConfig(
        output_dir=adapter_dir,
        # GRPO core
        num_generations=GRPO_G,
        max_prompt_length=GRPO_MAX_PROMPT_LEN,
        max_completion_length=GRPO_MAX_COMPLETION_LEN,
        beta=GRPO_BETA,
        temperature=GRPO_TEMP,
        top_p=GRPO_TOP_P,
        # Training
        max_steps=MAX_STEPS,
        per_device_train_batch_size=GRPO_BATCH,
        gradient_accumulation_steps=GRPO_GRAD_ACC,
        learning_rate=GRPO_LR,
        bf16=True,
        gradient_checkpointing=True,
        max_grad_norm=1.0,
        weight_decay=0.01,
        # vLLM colocate
        use_vllm=True,
        vllm_mode="colocate",
        vllm_gpu_memory_utilization=VLLM_GPU_MEM,
        vllm_enable_sleep_mode=True,
        vllm_dtype="bfloat16",
        vllm_max_num_seqs=8,
        # Schedule
        lr_scheduler_type="cosine",
        warmup_ratio=0.1,
        logging_steps=5,
        save_steps=min(MAX_STEPS // 5, 100),
        # Reporting
        report_to="wandb" if os.environ.get("WANDB_API_KEY") else "none",
        run_name="grpo-fleet-job",
        seed=SEED,
    )

    lora_cfg = lora_config if model_path == BASE_MODEL else None
    trainer = GRPOTrainer(
        model=model_path,
        args=grpo_config,
        reward_funcs=reward_funcs,
        train_dataset=grpo_dataset,
        peft_config=lora_cfg,
    )

    t0 = time.time()
    trainer.train()
    elapsed = time.time() - t0
    logger.info("GRPO done in %.1f min (%.1f hr)", elapsed / 60, elapsed / 3600)

    trainer.save_model(adapter_dir)
    logger.info("Adapter saved → %s", adapter_dir)

    # Optionally push to HuggingFace Hub
    if HF_ORG:
        try:
            trainer.push_to_hub(f"{HF_ORG}/brittney-grpo-adapter")
            logger.info("Pushed to HF Hub: %s/brittney-grpo-adapter", HF_ORG)
        except Exception as e:
            logger.warning("HF push failed: %s", e)

    return adapter_dir, elapsed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if not GRPO_PROMPTS or not Path(GRPO_PROMPTS).exists():
        logger.error("GRPO_PROMPTS=%s not found. Run extract.ts first.", GRPO_PROMPTS)
        sys.exit(2)

    try:
        from peft import LoraConfig  # type: ignore[import]
    except ImportError:
        logger.error("peft not installed. Run: pip install peft")
        sys.exit(2)

    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

    # ---- Reward functions ----
    grpo_rewards = _load_grpo_rewards()
    if grpo_rewards is not None:
        reward_funcs = [
            grpo_rewards.test_pass_reward,
            grpo_rewards.type_check_reward,
            grpo_rewards.lint_reward,
            grpo_rewards.coverage_reward,
            grpo_rewards.circuit_breaker_reward,
        ]
        logger.info("Using Node.js-backed reward functions (subprocess bridge)")
    else:
        reward_funcs = [
            _heuristic_test_pass,
            _heuristic_type_check,
            _heuristic_lint,
            _heuristic_coverage,
            _heuristic_circuit_breaker,
        ]
        logger.info("Using heuristic reward functions (Node.js unavailable)")

    # ---- LoRA config ----
    lora_config = LoraConfig(
        r=LORA_RANK,
        lora_alpha=LORA_ALPHA,
        lora_dropout=LORA_DROPOUT,
        target_modules=LORA_TARGETS,
        bias="none",
        task_type="CAUSAL_LM",
    )

    # ---- Stage 1: optional SFT warmup ----
    model_path = BASE_MODEL
    if RUN_SFT:
        sft_dataset = load_sft_dataset(DPO_PAIRS)
        if sft_dataset and len(sft_dataset) > 0:
            model_path = run_sft(sft_dataset, BASE_MODEL, lora_config, OUTPUT_DIR)
        else:
            logger.info("No valid SFT data — skipping SFT stage")

    # ---- Stage 2: GRPO ----
    grpo_dataset = load_grpo_dataset(GRPO_PROMPTS)
    if len(grpo_dataset) == 0:
        logger.error("Empty GRPO dataset — nothing to train on")
        sys.exit(2)

    # Hold out 10% for eval (written to OUTPUT_DIR/eval-prompts.jsonl)
    split = grpo_dataset.train_test_split(test_size=0.1, seed=SEED)
    train_set = split["train"]
    eval_set  = split["test"]
    eval_path = str(Path(OUTPUT_DIR) / "eval-prompts.jsonl")
    with open(eval_path, "w", encoding="utf-8") as fh:
        for row in eval_set:
            fh.write(json.dumps(row) + "\n")
    logger.info("Held-out eval set: %d prompts → %s", len(eval_set), eval_path)

    adapter_dir, elapsed = run_grpo(train_set, model_path, reward_funcs, lora_config, OUTPUT_DIR)

    # ---- Receipt JSON ----
    receipt = {
        "jobType": "grpo-fleet-job",
        "completedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "baseModel": BASE_MODEL,
        "trainedOn": len(train_set),
        "evalSetSize": len(eval_set),
        "maxSteps": MAX_STEPS,
        "grpoHyperparams": {
            "lr": GRPO_LR, "beta": GRPO_BETA, "G": GRPO_G,
            "temp": GRPO_TEMP, "batchSize": GRPO_BATCH,
            "gradAccum": GRPO_GRAD_ACC,
        },
        "loraConfig": {
            "rank": LORA_RANK, "alpha": LORA_ALPHA,
            "dropout": LORA_DROPOUT, "targets": LORA_TARGETS,
        },
        "rewardMode": "subprocess" if grpo_rewards else "heuristic",
        "sftStage": RUN_SFT,
        "adapterDir": adapter_dir,
        "evalPromptsPath": eval_path,
        "trainingTimeSec": round(elapsed, 1),
    }

    receipt_path = str(Path(OUTPUT_DIR) / "training-receipt.json")
    with open(receipt_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    logger.info("Receipt → %s", receipt_path)

    # Machine-readable stdout for driver.sh
    print(json.dumps(receipt))
    return adapter_dir


if __name__ == "__main__":
    main()
