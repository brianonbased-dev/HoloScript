# EXP-2 — Capability relocation (sovereign fine-tune)

**Status:** corpus generator + recipe BUILT and tested ($0). The training run is the
one founder-gated step (class-1 GPU spend). Everything below the "Gate" line is ready.

## The question

EXP-1c found the capability frontier: the 1.5B respects contracts (clamp/forbidden/
required = 100% with offload) but **cannot COMPUTE** — it scores **0%** on the compute
suite (midpoint / %-of-range / delta-then-clamp), and even the 7B only 25%. The
substrate supplies the _bounds_; it does not supply _arithmetic ability_. EXP-2 asks:

> Can a small LoRA SFT install the COMPUTATION the 1.5B fails zero-shot — taking it
> from 0% toward the substrate's reach — yielding a lite, portable, **downloadable**
> model that now computes contract-correct values from the given bounds?

(NB — design correction caught by inspecting the emitted data: the bounds are
instance-specific and NOT derivable from the contract id, so they MUST be in the
prompt. Hiding them makes the target unlearnable. EXP-2 therefore relocates the
_computation_, not the _knowledge_. Memorising a fixed contract catalogue — relocating
the knowledge too — is a valid separate follow-on (EXP-2b).)

## Design

- **Base:** `Qwen2.5-Coder-1.5B` (the EXP-1 Arm-C model). Apache-2.0, dense, downloadable.
- **Method:** LoRA SFT (r=16, alpha=32, lr=2e-4, ~3 epochs) — small, cheap, mergeable.
- **Corpus:** `generateDataset(N)` — deterministic (seeded), `(system + NL instruction +
scene + GIVEN bounds) → exact correct mutation JSON`. The model learns to evaluate
  clamp / midpoint / percentage / delta-then-clamp over the bounds it is shown.
- **Eval (the falsifier):** run the merged model through the EXP-1 **compute suite**
  (`EXP1_SUITE=compute`) on a HELD-OUT seed. Compare to the BASE 1.5B (0%). **Pass =
  fine-tuned 1.5B materially > 0% on held-out compute tasks** ⇒ SFT installs arithmetic.
  **Kill = stays ~0%** ⇒ a 1.5B cannot learn this arithmetic via small LoRA (also a real,
  thesis-sharpening result — points to a bigger base or tool-use).
- **Anti-overfit:** held-out seed (disjoint scenes/bounds) + never-trained trait/op
  combos measure generalisation, not memorisation.

## Emit the corpus (free, local)

```ts
import { generateDataset, toJsonl } from './generateDataset';
import { writeFileSync } from 'node:fs';
// 80/20 train/eval split by seed; keep eval trait/op combos disjoint for generalisation.
writeFileSync('exp2-train.jsonl', toJsonl(generateDataset(4000, 42)));
writeFileSync('exp2-eval.jsonl', toJsonl(generateDataset(800, 99)));
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
