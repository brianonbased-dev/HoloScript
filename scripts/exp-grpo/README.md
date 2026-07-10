# exp-grpo — GRPO/OPLoRA GPU Fleet Training Job

Self-contained fleet job that trains a Qwen2.5 model on HoloScript-specific
GRPO prompts using TRL GRPOTrainer + PEFT OPLoRA adapters.

## Pipeline

```
extract.ts          → grpo-prompts.jsonl + dpo-pairs.jsonl
grpo_fleet_job.py   → adapter/ + training-receipt.json
grpo_eval.py        → eval-receipt.json
grpo_analyze.py     → verdict.json  (PROVE / KILL / INCONCLUSIVE)
driver.sh           → orchestrates all 4, posts verdict to knowledge store
```

### Corresponds to TypeScript specs

| Python file                          | TypeScript spec                                |
| ------------------------------------ | ---------------------------------------------- |
| `grpo_fleet_job.py` reward weights   | `GRPORewardFunctions.ts` `GRPO_REWARD_WEIGHTS` |
| `grpo_fleet_job.py` GRPO config      | `GRPOConfig.ts` `RECOMMENDED_GRPO_CONFIG`      |
| `scripts/training/oplora_wrapper.py` | `OPLoRAConfig.ts` `DEFAULT_OPLORA_CONFIG`      |
| `grpo_eval.py` quality_score         | `QualityScore.ts` weighted composite           |
| `grpo_analyze.py` PROVE/KILL         | `ConvergenceDetector.ts` plateau logic         |

### Related files

- `scripts/training/grpo_rewards.py` — Node.js subprocess bridge for real reward evaluation (vitest/tsc/eslint)
- `scripts/training/oplora_wrapper.py` — Full OPLoRA SVD projection + TRL callback

## Quick start (dry run, no GPU needed)

```bash
cd HoloScript
bash scripts/exp-grpo/driver.sh --dry-run
```

## Vast.ai launch

```bash
# 1. Find a cheap GPU instance (RTX 3090 / A100 SXM)
vastai search offers "gpu_name=RTX_3090 num_gpus=1 gpu_ram>=24 rentable=true verified=true"

# 2. Launch with on-start bootstrap
vastai create instance $OFFER_ID \
  --image pytorch/pytorch:2.4.0-cuda12.1-cudnn9-devel \
  --disk 80 --ssh \
  --env "-e HOLOSCRIPT_API_KEY=$HOLOSCRIPT_API_KEY \
         -e REPO_URL=https://$GITHUB_PAT@github.com/$ORG/HoloScript.git \
         -e BASE_MODEL=Qwen/Qwen2.5-7B-Instruct \
         -e GRPO_MAX_STEPS=2000 \
         -e RUN_SFT=0 \
         -e BASELINE_QUALITY=0.30" \
  --onstart-cmd "$(cat scripts/exp-grpo/driver.sh | base64 -w0 | xargs -I{} echo 'echo {} | base64 -d | bash')"
```

## Environment variables

| Variable              | Default                    | Description                                  |
| --------------------- | -------------------------- | -------------------------------------------- |
| `HOLOSCRIPT_API_KEY`  | required                   | MCP orchestrator key                         |
| `REPO_URL`            | required                   | Git clone URL (may embed PAT)                |
| `BASE_MODEL`          | `Qwen/Qwen2.5-7B-Instruct` | Base model for training                      |
| `GRPO_MAX_STEPS`      | `500`                      | Training steps (use 2000+ for real run)      |
| `RUN_SFT`             | `0`                        | Set to `1` to enable SFT warmup on DPO pairs |
| `BASELINE_QUALITY`    | `0.30`                     | Guessed baseline — **fallback only** (see below) |
| `WANDB_API_KEY`       | —                          | Optional W&B logging                         |
| `HF_TOKEN` + `HF_ORG` | —                          | Optional HuggingFace Hub push                |
| `GRPO_SEED`           | `42`                       | Reproducibility + bootstrap resample seed    |
| `BOOTSTRAP_RESAMPLES` | `10000`                    | Bootstrap CI resample count                  |
| `EXTRACT_MAX_PROMPTS` | `1500`                     | Max prompts to extract                       |

## Verdict logic

`grpo_eval.py` runs a **paired** evaluation: the base model (control) and the
adapter (treatment) are scored on the **same** held-out prompts with the **same**
decode settings — the base arm via `PeftModel.disable_adapter()` — so the
per-prompt delta isolates the adapter's effect. No hardcoded baseline guess.

`grpo_analyze.py` then decides from a **bootstrap 95% CI** on the per-prompt
delta (`grpo_stats.py`, pure stdlib, seeded):

| Verdict        | Condition (measured / preferred path)                                    |
| -------------- | ------------------------------------------------------------------------ |
| `PROVE`        | CI **lower** bound of (adapter − base) `> MIN_DELTA` AND quality `>= ABS_THRESHOLD` |
| `KILL`         | CI **upper** bound `< 0` (significantly worse) OR quality `< KILL_THRESHOLD` |
| `INCONCLUSIVE` | CI straddles the margin — the honest "within noise" band                 |

The verdict carries `baselineSource: "measured"` and a `deltaCI95` + `wilcoxonP`.
`BASELINE_QUALITY` is used **only** when no measured base arm is present (e.g. the
base pass failed); that verdict is tagged `baselineSource: "guessed"` so a guessed
result can never masquerade as a measured one.

Stats are unit-tested on CPU with **no GPU / no torch**:
`python3 scripts/exp-grpo/test_grpo_stats.py`.

## GPU requirements

| Config                       | Min VRAM | Est. time | Est. cost |
| ---------------------------- | -------- | --------- | --------- |
| `--dry-run`                  | None     | <30s      | $0        |
| `GRPO_MAX_STEPS=500` (smoke) | 24 GB    | ~45 min   | ~$0.30    |
| `GRPO_MAX_STEPS=2000` (real) | 80 GB    | ~3-4 hr   | ~$6-8     |

## Links

- [P.005](../../research/) — Training plan
- [P.008](../../research/) — Serving autoscaler (inference, separate)
- [EXP-3](../../scripts/) — Prior experiment reference
- `packages/absorb-service/src/self-improvement/` — TypeScript engine
- `scripts/training/grpo_rewards.py` — Reward function bridge
- `scripts/training/oplora_wrapper.py` — OPLoRA SVD wrapper
