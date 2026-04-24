# trait-inference — Paper 19 (ATI) Phase 3 Pipeline

Python package implementing the **frozen** Paper 19 (Automated Trait
Inference) Phase 3 training pipeline + baselines + eval harness, per:

- Spec: `ai-ecosystem/research/paper-19-trait-inference/phase-1-spec.md`
- Pre-registration: `ai-ecosystem/research/paper-19-trait-inference/preregistration.md`
- Brain: `ai-ecosystem/compositions/trait-inference-brain.hsplus`
- GPU-claim ticket: `task_1777072040695_mrr3`

**Status (2026-04-24)**: Phase 1 (CPU pipeline) shipped — dataset
loader/audit/splits + 3 baselines (keyword + TF-IDF + Brittney-stub) +
eval metrics with bootstrap CI + CLI runner + Vast.ai launcher.
**Phase 2 (model module)** — sentence-transformer encoder + constrained-
decoder LLM, requires `[model]` extra — pending follow-up commit.

---

## Quick start

### 1. Install (CPU baselines + eval only)

```bash
cd packages/trait-inference
pip install -e .
```

### 2. Smoke test (synthetic data, end-to-end)

Validates the pipeline runs without needing real data or GPU. ~2 min.

```bash
trait-inference smoke --n 200 --bootstrap-b 200
```

Should emit a JSON measurement bundle to stdout with `"smoke_test": true,
"passed": true`. Use this to validate a fresh install before committing
to a Vast.ai run.

### 3. Extract trait label space from HoloScript core

```bash
trait-inference extract-traits \
  --constants-dir ../core/src/traits/constants/ \
  --output trait_inference/data/trait_label_space.json \
  --verbose
```

Reads the 113 TS constant files, extracts string-array exports, writes
a single JSON consumed by the dataset + model modules.

### 4. Audit a real dataset

```bash
trait-inference dataset audit data/atimark.jsonl --output measurements/audit.json
```

Returns exit 0 if the dataset passes spec §1.4 acceptance (≥2k pairs,
≥300 novel combinations, ≥500 each major source, ≥200 negatives, no
novelty leak); exit 1 with `issues` list otherwise.

### 5. Run baselines

```bash
trait-inference dataset split data/atimark.jsonl --output-dir splits/ --seed 42
trait-inference baseline run keyword --train splits/train.jsonl --eval splits/held_out_novel.jsonl --output measurements/keyword.json
trait-inference baseline run tfidf   --train splits/train.jsonl --eval splits/held_out_novel.jsonl --val splits/val.jsonl --tune-threshold --output measurements/tfidf.json
trait-inference baseline run brittney --train splits/train.jsonl --eval splits/held_out_novel.jsonl --output measurements/brittney.json
```

Each emits `f1_macro`, `exact_match`, `bootstrap_ci`, sample predictions.

---

## Vast.ai GPU launch

Orchestration script: `scripts/vast-launch-paper-19.ps1` (PowerShell;
mirrors the existing `ai-ecosystem/scripts/vast-bench-runner.ps1`
pattern).

```powershell
# Cheapest end-to-end pipeline validation (~$0.30, ~5 min)
.\scripts\vast-launch-paper-19.ps1 -Phase smoke -Label paper19-smoke

# Run all 3 baselines on the real dataset (~$0.30, ~10 min)
.\scripts\vast-launch-paper-19.ps1 -Phase baseline `
  -DatasetPath data/atimark.jsonl -Label paper19-baselines

# Full training run (REQUIRES preregistration.md frozen + Phase 2 model module shipped)
.\scripts\vast-launch-paper-19.ps1 -Phase train -GpuName RTX_4090 `
  -DatasetPath data/atimark.jsonl -Label paper19-headline-cell-1
```

Pre-flight: requires `vastai set api-key` configured (see
`ai-ecosystem/.env` `VAST_API_KEY`); requires `~/.ssh/id_rsa` with the
matching public key registered on the Vast.ai account; requires
≥$0.50 credit for `train`.

---

## Cost estimate (per
`ai-ecosystem/research/paper-19-trait-inference/README.md` Phase 2-4 task table + GPU-claim ticket `_mrr3`)

| Job | GPU | Hours | Cost |
|---|---|---:|---:|
| Smoke test | RTX 4090 | 0.1 | $0.03 |
| Baselines (CPU-bound) | RTX 4090 | 0.2 | $0.06 |
| Single training cell | RTX 4090 | ~6 | ~$1.80 |
| Full sweep (30 cells × N=5 reseed = 150 runs) | RTX 4090 | ~900 (parallel: 30 GPUs × 30hr) | ~$240 |

(A100 estimates are roughly 4-8× higher; A100 supply is also tighter.
4090 is sufficient for ≤1B-param decoder per spec §3.1.)

---

## Per-spec deliverable map

| Spec section | Module | Status |
|---|---|---|
| §1.1 Sourcing 3-source mix | `dataset.py` Pair + Source | done (loader; data construction is Phase 2 task) |
| §1.2 Schema | `dataset.py` Pair dataclass | done |
| §1.3 Splits (train/val/indist/novel) | `dataset.py` make_splits | done |
| §1.4 Audit protocol | `dataset.py` audit + AuditReport | done |
| §2.1 Keyword baseline | `baselines.py` KeywordBaseline | done |
| §2.2 TF-IDF + LogReg baseline | `baselines.py` TfidfLogregBaseline | done |
| §2.3 Brittney few-shot baseline | `baselines.py` BrittneyFewShotBaseline | stub (real impl needs Brittney API integration) |
| §3.1 Constrained-decoder model | `model/` (Phase 2 commit) | pending |
| §3.2 Conditioning fields | `model/` (Phase 2 commit) | pending |
| §3.3 Hyperparameter sweep | `model/sweep.py` (Phase 2 commit) | pending |
| §4.1 Metric definitions | `metrics.py` f1_macro, f1_micro, exact_match_rate, bootstrap_ci | done |
| §4.2 Statistical protocol | `metrics.py` bootstrap_ci, evaluate_headline | done |
| §4.3 Ablation matrix | `eval/ablations.py` (Phase 2 commit) | pending |
| §4.4 Required user study | (separate UX-research task) | pending |
| §4.5 Pre-registration freeze | `ai-ecosystem/research/paper-19-trait-inference/preregistration.md` | FROZEN (do not edit) |

---

## Anti-pattern guards (binding — inherited from
`compositions/trait-inference-brain.hsplus`)

- **No train-set evaluation.** Headline metric on novel-combination split only.
- **No easy-split-only F1.** Reports include both indist (sanity) and novel (headline).
- **No single-source dataset.** Audit rejects datasets <500 from any of {existing, brittney, community}.
- **No optional user study.** §4.4 is required not optional (per F.031).
- **No after-the-fact threshold-shopping.** preregistration.md is frozen before any Phase 3 board task is filed.
- **No qualitative-only claims.** ML venue requires numbers; pipeline emits structured measurements.
- **No validity gap as "scoped contribution"** — constrained-decoding architecture (Phase 2 module) bakes ≥90% validity into the decoder, not into a post-filter.

---

## Known limitations / future work

- Brittney few-shot baseline is a stub returning empty predictions; real impl needs HoloScript MCP integration (separate task).
- Constrained-decoder model module (`model/`) is the Phase 2 deliverable — not in this commit.
- Training loop + ablation matrix runner pending Phase 2.
- User study (Phase 4 §4.4) is a separate UX-research deliverable.
- The PowerShell Vast.ai launcher targets Windows; a bash equivalent for macOS/Linux is a follow-up.

---

## Provenance

- Authored by `trait-inference-brain` (`compositions/trait-inference-brain.hsplus`).
- GPU-claim ticket: `task_1777072040695_mrr3` (live on team_1775935947314_f0noxi board).
- Capability-build provenance commit: `fc294af` (lean-theorist-brain — sibling).
- F.031 pre-emptions baked into spec; constrained decoding ships in Phase 2 model module.
