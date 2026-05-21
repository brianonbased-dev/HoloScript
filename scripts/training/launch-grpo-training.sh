#!/usr/bin/env bash
# =============================================================================
# launch-grpo-training.sh
#
# Ready-to-execute launch script for GRPO training of Brittney Qwen-2.5 7B
# on Vast.ai H100 80GB GPU.
#
# Prerequisites:
#   - Vast.ai CLI installed: pip install vastai
#   - Vast.ai API key configured: vastai set api-key <YOUR_KEY>
#   - Weights & Biases API key: export WANDB_API_KEY=<YOUR_KEY>
#   - HuggingFace token: export HF_TOKEN=<YOUR_TOKEN>
#
# Usage:
#   chmod +x launch-grpo-training.sh
#   ./launch-grpo-training.sh [--gpu h100|a100|a6000] [--skip-sft] [--dry-run]
#
# =============================================================================
set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

# GPU Selection (default: H100 SXM 80GB)
GPU_TYPE="${1:-h100}"
SKIP_SFT=false
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --gpu)      GPU_TYPE="$2"; shift 2 ;;
        --skip-sft) SKIP_SFT=true; shift ;;
        --dry-run)  DRY_RUN=true; shift ;;
        *)          shift ;;
    esac
done

# Model Configuration
BASE_MODEL="Qwen/Qwen2.5-7B-Instruct"
SFT_CHECKPOINT_NAME="brittney-7b-sft"
GRPO_OUTPUT_NAME="brittney-7b-grpo"
HF_ORG="your-hf-org"  # CHANGE THIS to your HuggingFace organization

# Training Hyperparameters (from GRPOConfig)
GRPO_LR="1e-6"
GRPO_BETA="0.04"
GRPO_G="8"           # num_generations
GRPO_TEMP="0.6"      # sampling temperature
GRPO_MAX_STEPS="1000"
GRPO_BATCH_SIZE="4"
GRPO_GRAD_ACCUM="4"
GRPO_MAX_PROMPT_LEN="512"
GRPO_MAX_COMPLETION_LEN="1024"
GRPO_SAVE_STEPS="50"

# SFT Hyperparameters
SFT_LR="2e-5"
SFT_EPOCHS="2"
SFT_BATCH_SIZE="8"

# LoRA Configuration
LORA_R="16"
LORA_ALPHA="32"
LORA_TARGET="q_proj,v_proj,k_proj,o_proj"

# Vast.ai Configuration
DISK_SPACE="120"  # GB
DOCKER_IMAGE="pytorch/pytorch:2.4.0-cuda12.1-cudnn9-devel"

# Reward Weights
REWARD_WEIGHTS="0.40,0.20,0.15,0.15,0.10"

echo "============================================="
echo "  BRITTNEY 7B GRPO TRAINING LAUNCHER"
echo "============================================="
echo "GPU Type: $GPU_TYPE"
echo "Skip SFT: $SKIP_SFT"
echo "Dry Run:  $DRY_RUN"
echo ""

# =============================================================================
# STEP 1: Search for GPU instances on Vast.ai
# =============================================================================
echo "[STEP 1] Searching for $GPU_TYPE instances on Vast.ai..."

case $GPU_TYPE in
    h100)
        SEARCH_QUERY="gpu_name=H100_SXM num_gpus=1 gpu_ram>=80 disk_space>=$DISK_SPACE rentable=true verified=true direct_port_count>=1 inet_up>=200 cuda_vers>=12.1"
        EXPECTED_COST="1.87-2.50"
        ;;
    a100)
        SEARCH_QUERY="gpu_name=A100_SXM4 num_gpus=1 gpu_ram>=80 disk_space>=$DISK_SPACE rentable=true verified=true direct_port_count>=1 inet_up>=200 cuda_vers>=12.1"
        EXPECTED_COST="1.76-2.50"
        ;;
    a6000)
        SEARCH_QUERY="gpu_name=RTX_A6000 num_gpus=1 gpu_ram>=48 disk_space>=$DISK_SPACE rentable=true verified=true direct_port_count>=1 inet_up>=200 cuda_vers>=12.1"
        EXPECTED_COST="0.40-0.80"
        ;;
    *)
        echo "ERROR: Unknown GPU type: $GPU_TYPE. Use h100, a100, or a6000."
        exit 1
        ;;
esac

echo "Search query: $SEARCH_QUERY"
echo "Expected cost: \$$EXPECTED_COST/hr"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would search: vastai search offers \"$SEARCH_QUERY\" --order dph_total"
    INSTANCE_ID="DRY_RUN_ID"
else
    echo "Available instances:"
    vastai search offers "$SEARCH_QUERY" --order dph_total | head -20

    echo ""
    read -p "Enter instance ID to rent (or 'q' to quit): " INSTANCE_ID
    if [ "$INSTANCE_ID" = "q" ]; then
        echo "Aborted."
        exit 0
    fi
fi

# =============================================================================
# STEP 2: Create the instance
# =============================================================================
echo ""
echo "[STEP 2] Creating instance $INSTANCE_ID..."

if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would create: vastai create instance $INSTANCE_ID --image $DOCKER_IMAGE --disk $DISK_SPACE --ssh --direct"
    SSH_CMD="ssh -p 22 root@dry-run-host"
else
    vastai create instance "$INSTANCE_ID" \
        --image "$DOCKER_IMAGE" \
        --disk "$DISK_SPACE" \
        --ssh \
        --direct

    echo "Waiting for instance to start (up to 5 minutes)..."
    sleep 30

    # Get SSH connection info
    SSH_INFO=$(vastai show instances --raw | python3 -c "
import json, sys
instances = json.load(sys.stdin)
for inst in instances:
    if inst.get('cur_state') == 'running':
        print(f\"ssh -p {inst['ssh_port']} root@{inst['ssh_host']}\")
        break
")
    SSH_CMD="$SSH_INFO"
    echo "SSH Command: $SSH_CMD"
fi

# =============================================================================
# STEP 3: Setup the remote environment
# =============================================================================
echo ""
echo "[STEP 3] Setting up remote environment..."

SETUP_SCRIPT='#!/bin/bash
set -euo pipefail

echo "=== BRITTNEY 7B GRPO TRAINING SETUP ==="
echo "Date: $(date)"
echo "GPU: $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader)"

# Install system dependencies
apt-get update -qq && apt-get install -y -qq git curl tmux htop nodejs npm > /dev/null 2>&1

# Install Node.js 20 (for reward functions)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
apt-get install -y nodejs > /dev/null 2>&1
echo "Node.js $(node --version) installed"

# Install Python packages
pip install -q \
    transformers>=4.46.0 \
    trl>=0.18.0 \
    "vllm>=0.8.5" \
    peft>=0.14.0 \
    datasets \
    accelerate>=0.34.0 \
    bitsandbytes \
    wandb \
    scipy \
    sentencepiece \
    protobuf \
    flash-attn --no-build-isolation 2>/dev/null || true

echo "Python packages installed"

# Login to services
wandb login "$WANDB_API_KEY" 2>/dev/null || echo "W&B login skipped (set WANDB_API_KEY)"
huggingface-cli login --token "$HF_TOKEN" 2>/dev/null || echo "HF login skipped (set HF_TOKEN)"

# Clone HoloScript for reward functions
if [ ! -d "/workspace/HoloScript" ]; then
    git clone --depth 1 https://github.com/YOUR_ORG/HoloScript.git /workspace/HoloScript
    cd /workspace/HoloScript && npm install --production 2>/dev/null || true
fi

# Create training directory
mkdir -p /workspace/training
mkdir -p /workspace/checkpoints
mkdir -p /workspace/logs

echo "=== SETUP COMPLETE ==="
nvidia-smi
'

if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would execute setup script on remote instance"
else
    echo "$SETUP_SCRIPT" | $SSH_CMD "bash -s"
fi

# =============================================================================
# STEP 4: Upload training data
# =============================================================================
echo ""
echo "[STEP 4] Uploading training data..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOLOSCRIPT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would upload:"
    echo "  - $HOLOSCRIPT_ROOT/datasets/grpo-prompts-2026-03-06.jsonl"
    echo "  - $HOLOSCRIPT_ROOT/scripts/training/grpo_rewards.py"
    echo "  - $HOLOSCRIPT_ROOT/scripts/training/oplora_wrapper.py"
else
    # Upload training files
    SCP_CMD="${SSH_CMD/ssh/scp}"
    $SCP_CMD "$HOLOSCRIPT_ROOT/datasets/grpo-prompts-2026-03-06.jsonl" "root@remote:/workspace/training/"
    $SCP_CMD "$HOLOSCRIPT_ROOT/scripts/training/grpo_rewards.py" "root@remote:/workspace/training/"
    $SCP_CMD "$HOLOSCRIPT_ROOT/scripts/training/oplora_wrapper.py" "root@remote:/workspace/training/"

    # Upload DPO preference pairs for SFT warmup
    if [ -f "$HOLOSCRIPT_ROOT/datasets/dpo-preference-pairs.jsonl" ]; then
        $SCP_CMD "$HOLOSCRIPT_ROOT/datasets/dpo-preference-pairs.jsonl" "root@remote:/workspace/training/"
    fi
fi

# =============================================================================
# STEP 5: Create the training script
# =============================================================================
echo ""
echo "[STEP 5] Creating training script..."

TRAIN_SCRIPT="#!/usr/bin/env python3
\"\"\"
train_brittney_grpo.py

Two-stage training pipeline for Brittney 7B:
  Stage 1: SFT warmup on 673 DPO preferred completions
  Stage 2: GRPO with 5 reward functions on 251 prompts

Usage:
  python train_brittney_grpo.py [--skip-sft] [--resume-from CHECKPOINT]
\"\"\"

import argparse
import json
import os
import sys
import time
from pathlib import Path

import torch
from datasets import Dataset, load_dataset
from peft import LoraConfig
from transformers import AutoTokenizer, TrainingArguments
from trl import GRPOConfig, GRPOTrainer, SFTConfig, SFTTrainer

# ============================================================================
# Configuration
# ============================================================================

BASE_MODEL = '${BASE_MODEL}'
GRPO_PROMPTS_FILE = '/workspace/training/grpo-prompts-2026-03-06.jsonl'
DPO_PAIRS_FILE = '/workspace/training/dpo-preference-pairs.jsonl'
SFT_OUTPUT = '/workspace/checkpoints/${SFT_CHECKPOINT_NAME}'
GRPO_OUTPUT = '/workspace/checkpoints/${GRPO_OUTPUT_NAME}'

# LoRA Config
LORA_CONFIG = LoraConfig(
    r=${LORA_R},
    lora_alpha=${LORA_ALPHA},
    target_modules='${LORA_TARGET}'.split(','),
    lora_dropout=0.05,
    bias='none',
    task_type='CAUSAL_LM',
)

# ============================================================================
# Reward Functions
# ============================================================================

def test_pass_reward(completions, **kwargs):
    \"\"\"Reward: does the completion look like valid TypeScript with tests?\"\"\"
    rewards = []
    for completion in completions:
        score = 0.0
        content = completion if isinstance(completion, str) else completion[0].get('content', '')
        # Check for test structure indicators
        if 'describe(' in content or 'it(' in content or 'test(' in content:
            score += 0.3
        if 'expect(' in content:
            score += 0.3
        if 'import' in content:
            score += 0.2
        if content.strip() and len(content) > 50:
            score += 0.2
        rewards.append(min(1.0, score))
    return rewards

def type_check_reward(completions, **kwargs):
    \"\"\"Reward: does the completion use TypeScript type annotations?\"\"\"
    rewards = []
    for completion in completions:
        score = 0.0
        content = completion if isinstance(completion, str) else completion[0].get('content', '')
        type_indicators = [': string', ': number', ': boolean', ': void',
                          'interface ', 'type ', '<T>', 'Promise<',
                          ': Array', 'readonly ', 'as const']
        matches = sum(1 for t in type_indicators if t in content)
        score = min(1.0, matches / 4.0)
        rewards.append(score)
    return rewards

def lint_reward(completions, **kwargs):
    \"\"\"Reward: code quality heuristics (no obvious anti-patterns).\"\"\"
    rewards = []
    for completion in completions:
        score = 1.0
        content = completion if isinstance(completion, str) else completion[0].get('content', '')
        # Penalize anti-patterns
        if 'any' in content and ': any' in content:
            score -= 0.3
        if 'console.log' in content:
            score -= 0.1
        if 'var ' in content:
            score -= 0.2
        if '== ' in content and '=== ' not in content:
            score -= 0.2
        rewards.append(max(0.0, score))
    return rewards

def coverage_reward(completions, **kwargs):
    \"\"\"Reward: does the code exercise multiple code paths?\"\"\"
    rewards = []
    for completion in completions:
        score = 0.0
        content = completion if isinstance(completion, str) else completion[0].get('content', '')
        coverage_indicators = ['if ', 'else', 'try', 'catch', 'switch',
                              'for ', 'while', '.map(', '.filter(', '.reduce(']
        matches = sum(1 for c in coverage_indicators if c in content)
        score = min(1.0, matches / 3.0)
        rewards.append(score)
    return rewards

def circuit_breaker_reward(completions, **kwargs):
    \"\"\"Reward: safety and error handling awareness.\"\"\"
    rewards = []
    for completion in completions:
        score = 0.5  # Base score (neutral)
        content = completion if isinstance(completion, str) else completion[0].get('content', '')
        # Reward error handling
        if 'try' in content and 'catch' in content:
            score += 0.2
        if 'throw' in content:
            score += 0.1
        if 'Error' in content:
            score += 0.1
        # Penalize unsafe patterns
        if 'eval(' in content:
            score -= 0.5
        if 'Function(' in content:
            score -= 0.3
        rewards.append(max(0.0, min(1.0, score)))
    return rewards

# ============================================================================
# Data Loading
# ============================================================================

def load_grpo_prompts(filepath):
    \"\"\"Load GRPO prompts from JSONL file.\"\"\"
    prompts = []
    with open(filepath, 'r') as f:
        for line in f:
            data = json.loads(line.strip())
            prompts.append({
                'prompt': [{'role': 'user', 'content': data['prompt']}],
            })
    return Dataset.from_list(prompts)

def load_sft_data(filepath):
    \"\"\"Load DPO preferred completions for SFT warmup.\"\"\"
    examples = []
    if not os.path.exists(filepath):
        print(f'WARNING: SFT data not found at {filepath}. Skipping SFT stage.')
        return None
    with open(filepath, 'r') as f:
        for line in f:
            data = json.loads(line.strip())
            # Use the preferred completion for SFT
            messages = [
                {'role': 'user', 'content': data.get('prompt', '')},
                {'role': 'assistant', 'content': data.get('chosen', data.get('preferred', ''))},
            ]
            examples.append({'messages': messages})
    return Dataset.from_list(examples)

# ============================================================================
# Stage 1: SFT Warmup
# ============================================================================

def run_sft_stage():
    \"\"\"Fine-tune on DPO preferred completions for format alignment.\"\"\"
    print('\\n' + '=' * 60)
    print('  STAGE 1: SFT WARMUP')
    print('=' * 60)

    dataset = load_sft_data(DPO_PAIRS_FILE)
    if dataset is None:
        print('No SFT data available. Using base model directly.')
        return BASE_MODEL

    print(f'SFT dataset size: {len(dataset)} examples')

    training_args = SFTConfig(
        output_dir=SFT_OUTPUT,
        num_train_epochs=${SFT_EPOCHS},
        per_device_train_batch_size=${SFT_BATCH_SIZE},
        learning_rate=${SFT_LR},
        bf16=True,
        gradient_checkpointing=True,
        logging_steps=10,
        save_steps=100,
        report_to='wandb',
        run_name='brittney-7b-sft-warmup',
        warmup_ratio=0.1,
        lr_scheduler_type='cosine',
    )

    trainer = SFTTrainer(
        model=BASE_MODEL,
        args=training_args,
        train_dataset=dataset,
        peft_config=LORA_CONFIG,
    )

    print('Starting SFT training...')
    start = time.time()
    trainer.train()
    elapsed = time.time() - start
    print(f'SFT completed in {elapsed/60:.1f} minutes')

    trainer.save_model(SFT_OUTPUT)
    print(f'SFT checkpoint saved to {SFT_OUTPUT}')
    return SFT_OUTPUT

# ============================================================================
# Stage 2: GRPO Training
# ============================================================================

def run_grpo_stage(model_path):
    \"\"\"GRPO training with 5 reward functions.\"\"\"
    print('\\n' + '=' * 60)
    print('  STAGE 2: GRPO TRAINING')
    print('=' * 60)

    dataset = load_grpo_prompts(GRPO_PROMPTS_FILE)
    print(f'GRPO prompt count: {len(dataset)}')

    grpo_config = GRPOConfig(
        output_dir=GRPO_OUTPUT,

        # GRPO-specific
        num_generations=${GRPO_G},
        max_prompt_length=${GRPO_MAX_PROMPT_LEN},
        max_completion_length=${GRPO_MAX_COMPLETION_LEN},
        beta=${GRPO_BETA},
        temperature=${GRPO_TEMP},

        # Training
        max_steps=${GRPO_MAX_STEPS},
        per_device_train_batch_size=${GRPO_BATCH_SIZE},
        gradient_accumulation_steps=${GRPO_GRAD_ACCUM},
        learning_rate=${GRPO_LR},
        bf16=True,
        gradient_checkpointing=True,

        # vLLM colocate (single GPU)
        use_vllm=True,
        vllm_mode='colocate',
        vllm_gpu_memory_utilization=0.35,

        # Logging & Saving
        logging_steps=5,
        save_steps=${GRPO_SAVE_STEPS},
        report_to='wandb',
        run_name='brittney-7b-grpo',

        # Scheduler
        warmup_ratio=0.1,
        lr_scheduler_type='cosine',

        # Reward weights: test_pass, type_check, lint, coverage, circuit_breaker
        reward_weights=[0.40, 0.20, 0.15, 0.15, 0.10],
    )

    trainer = GRPOTrainer(
        model=model_path,
        args=grpo_config,
        reward_funcs=[
            test_pass_reward,
            type_check_reward,
            lint_reward,
            coverage_reward,
            circuit_breaker_reward,
        ],
        train_dataset=dataset,
        peft_config=LORA_CONFIG if model_path == BASE_MODEL else None,
    )

    print('Starting GRPO training...')
    print(f'  Model: {model_path}')
    print(f'  Prompts: {len(dataset)}')
    print(f'  G (num_generations): ${GRPO_G}')
    print(f'  Max steps: ${GRPO_MAX_STEPS}')
    print(f'  Beta: ${GRPO_BETA}')
    print(f'  Learning rate: ${GRPO_LR}')
    print(f'  vLLM mode: colocate')

    start = time.time()
    trainer.train()
    elapsed = time.time() - start
    print(f'GRPO completed in {elapsed/60:.1f} minutes ({elapsed/3600:.1f} hours)')

    trainer.save_model(GRPO_OUTPUT)
    print(f'GRPO checkpoint saved to {GRPO_OUTPUT}')

    # Push to HuggingFace Hub
    try:
        trainer.push_to_hub(f'{HF_ORG}/{GRPO_OUTPUT_NAME}')
        print(f'Model pushed to HuggingFace Hub: {HF_ORG}/{GRPO_OUTPUT_NAME}')
    except Exception as e:
        print(f'Failed to push to Hub: {e}')

    return GRPO_OUTPUT

# ============================================================================
# Main
# ============================================================================

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Brittney 7B GRPO Training')
    parser.add_argument('--skip-sft', action='store_true', help='Skip SFT warmup stage')
    parser.add_argument('--resume-from', type=str, default=None, help='Resume from checkpoint path')
    args = parser.parse_args()

    print('=' * 60)
    print('  BRITTNEY 7B GRPO TRAINING PIPELINE')
    print('=' * 60)
    print(f'Base model: {BASE_MODEL}')
    print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"CPU\"}')
    print(f'VRAM: {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f} GB' if torch.cuda.is_available() else 'N/A')
    print(f'Skip SFT: {args.skip_sft}')
    print(f'Resume from: {args.resume_from or \"None\"}')

    total_start = time.time()

    # Stage 1: SFT Warmup
    if args.skip_sft or args.resume_from:
        model_path = args.resume_from or BASE_MODEL
        print(f'Skipping SFT, using model: {model_path}')
    else:
        model_path = run_sft_stage()

    # Stage 2: GRPO
    final_model = run_grpo_stage(model_path)

    total_elapsed = time.time() - total_start
    print('\\n' + '=' * 60)
    print('  TRAINING COMPLETE')
    print('=' * 60)
    print(f'Total time: {total_elapsed/60:.1f} minutes ({total_elapsed/3600:.1f} hours)')
    print(f'Final model: {final_model}')
    print(f'Checkpoints: /workspace/checkpoints/')
    print(f'W&B logs: https://wandb.ai/')
"

if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Training script generated (not uploaded)"
    echo "$TRAIN_SCRIPT" > /tmp/train_brittney_grpo.py
    echo "Script saved to /tmp/train_brittney_grpo.py"
else
    echo "$TRAIN_SCRIPT" | $SSH_CMD "cat > /workspace/training/train_brittney_grpo.py"
    echo "Training script uploaded to /workspace/training/train_brittney_grpo.py"
fi

# =============================================================================
# STEP 6: Launch training in tmux session
# =============================================================================
echo ""
echo "[STEP 6] Launching training..."

LAUNCH_CMD="cd /workspace/training && tmux new-session -d -s grpo 'python train_brittney_grpo.py 2>&1 | tee /workspace/logs/grpo-training.log'"

if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would execute: $LAUNCH_CMD"
else
    $SSH_CMD "$LAUNCH_CMD"
    echo "Training launched in tmux session 'grpo'"
    echo ""
    echo "============================================="
    echo "  TRAINING LAUNCHED SUCCESSFULLY"
    echo "============================================="
    echo ""
    echo "To monitor:"
    echo "  $SSH_CMD"
    echo "  tmux attach -t grpo"
    echo ""
    echo "To check GPU usage:"
    echo "  $SSH_CMD 'nvidia-smi'"
    echo ""
    echo "To view logs:"
    echo "  $SSH_CMD 'tail -f /workspace/logs/grpo-training.log'"
    echo ""
    echo "W&B Dashboard:"
    echo "  https://wandb.ai/your-org/brittney-7b-grpo"
    echo ""
    echo "Estimated time: 2-4 hours"
    echo "Estimated cost: \$${EXPECTED_COST} x 4hr = \$$(echo "$EXPECTED_COST" | cut -d'-' -f1 | awk '{printf "%.2f", $1 * 4}')-$(echo "$EXPECTED_COST" | cut -d'-' -f2 | awk '{printf "%.2f", $1 * 4}')"
fi

echo ""
echo "============================================="
echo "  LAUNCH COMPLETE"
echo "============================================="
