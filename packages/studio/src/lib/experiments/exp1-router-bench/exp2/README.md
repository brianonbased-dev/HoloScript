# EXP-2 — Capability relocation (sovereign fine-tune)

**Status:** corpus generator + recipe BUILT and tested ($0). The training run is the
one founder-gated step (class-1 GPU spend). Everything below the "Gate" line is ready.

## The question

EXP-1 proved the contract-respecting capability lives in the **substrate** (IR +
offload + contract-in-loop), not the 1.5B's weights — the no-offload NL arm collapses
(52% local / 83% Opus). EXP-2 asks the **sovereignty** question:

> Can we move that capability into the **weights**, so a fine-tuned 1.5B does the
> correct mutation from a **plain NL prompt with no offload and no IR** — yielding a
> lite, portable, **downloadable** model that no longer needs the ecosystem in-context?

This is the D.053 sovereignty endpoint (per-soul finetuned + downloadable), tested
first on the generic capability before any per-soul personalization.

## Design

- **Base:** `Qwen2.5-Coder-1.5B` (the EXP-1 Arm-C model). Apache-2.0, dense, downloadable.
- **Method:** LoRA SFT (r=16, alpha=32, lr=2e-4, ~3 epochs) — small, cheap, mergeable.
- **Corpus:** `generateDataset(N)` — deterministic (seeded), `(system + NL instruction +
  scene) → exact correct mutation JSON`. The bound is NOT in the prompt; the model must
  internalise clamp / midpoint / percentage / delta-then-clamp over the trait families.
- **Eval (the falsifier):** run the merged model through the EXP-1 harness **Arm A**
  (NL, no offload) on a HELD-OUT split + the EXP-1 verdict suite. Compare to the BASE
  1.5B Arm A. **Pass = fine-tuned NL ≈ base IR+offload (Arm C)**; capability moved to
  weights. **Kill = no lift over base Arm A**; the substrate is irreducible (also a real,
  thesis-sharpening result).
- **Anti-overfit:** held-out trait/op combinations + the adversarial verdict suite (never
  trained on) measure generalisation, not memorisation.

## Emit the corpus (free, local)

```ts
import { generateDataset, toJsonl } from './generateDataset';
import { writeFileSync } from 'node:fs';
// 80/20 train/eval split by seed; keep eval trait/op combos disjoint for generalisation.
writeFileSync('exp2-train.jsonl', toJsonl(generateDataset(4000, 42)));
writeFileSync('exp2-eval.jsonl',  toJsonl(generateDataset(800, 99)));
```

## ── Gate: the GPU training run (founder-gated, class-1 spend) ──

The fine-tune itself needs a GPU. Recipe (LLaMA-Factory on a vast.ai spot card):

```bash
# ~$0.50/hr spot (AWQ-class card); LoRA on 1.5B ≈ 15–30 min ⇒ well under $1.
llamafactory-cli train \
  --model_name_or_path Qwen/Qwen2.5-Coder-1.5B-Instruct \
  --dataset exp2-train --template qwen --finetuning_type lora \
  --lora_rank 16 --lora_alpha 32 --learning_rate 2e-4 \
  --num_train_epochs 3 --output_dir ./exp2-lora --bf16
# merge → GGUF → `ollama create exp2-qwen` → run EXP-1 Arm A on the merged model.
```

**Why this is gated (F.095 class-1):** it rents a GPU = real spend on the vast account.
**Operational reality (verify before spending):** the vast fleet has been flapping
(313 queued / 0 running observed 2026-06-02). Confirm a card is actually reachable
(`sim_fleet_status` / vast CLI) BEFORE authorizing — do not spend into a fleet that
can't schedule the job. If the fleet is down, EXP-2's blocker is infra (fleet
stabilization, P.004), not the recipe.

**Cost estimate:** corpus $0, one LoRA run < $1, eval $0 (local Ollama). Comfortably
inside the standing $100 ceiling — but it is GPU spend, so it waits for an explicit
go + a confirmed reachable card.
