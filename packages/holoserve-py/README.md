# holoserve — native sovereign inference for HoloRunner S0 (HOLO)

`holoscript-holoserve` graduates the loose HoloServe scripts into an installable
Python distribution: a **resident-model, OpenAI-compatible HTTP server**, a
**deterministic offline sampler**, and a **byte-level NFA constrained-decoding
engine** for the from-scratch HoloRunner S0 (HOLO) model.

**Sovereign at every layer (D.118):** PyTorch-direct `torch.load(ckpt.pt)` on our own
architecture and weights. **NO llama.cpp, NO GGUF, NO HoloLlama** — the fully-sovereign
HOLO runtime north star. The server speaks the same OpenAI contract consumers already
use, but backed by the native byte-BPE tokenizer and the S0 GPT.

---

## Install

```bash
cd packages/holoserve-py

# grammar + tokenizer only (pure Python, no torch) — enough to import, self-test,
# and generate constrained-decoding masks:
pip install -e .

# to ACTUALLY serve or sample (loads a checkpoint, runs a forward pass) you need torch:
pip install -e ".[model]"
```

`holoserve.tokenizer` and `holoserve.grammar` import and run **without torch**; the
`server`, `sampler`, `model`, and `train` modules require the `[model]` extra.

## Run the server

Runtime artifacts (`ckpt.pt`, `tokenizer.json`, `meta.json`) are **not bundled** in the
wheel (the S0 checkpoint is ~582 MB) — they are supplied at launch via required CLI args:

```bash
holoserve --ckpt /path/to/s0/ckpt/ckpt.pt --bins /path/to/s0/bins --port 8080
```

Serve multiple named checkpoints from one process (e.g. the s1/s2 disposition pair) with
repeatable `--model-spec NAME=CKPT[@BINS]`; requests select via the OpenAI `model` param,
and an unknown name returns 404 (the name→weights binding stays honest for eval receipts).

```bash
curl -s localhost:8080/health
curl -s localhost:8080/v1/completions -H 'content-type: application/json' \
     -d '{"prompt": "composition \"", "max_tokens": 48, "seed": 7}'
```

### The sovereignty `/health` gate

`/health` is a **routing contract**, not decoration. The fleet-router discovers this
server as a `backend: "pytorch-holo"` node only when `/health` asserts:

```json
{ "status": "ok", "backend": "pytorch-holo", "sovereign": true, "llama_cpp": false, "gguf": false }
```

A node that cannot assert `sovereign: true && llama_cpp: false` is refused — an impostor
never gets routed sovereign traffic.

### Endpoints

| Method | Path                              | Purpose                                                                                   |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------- |
| GET    | `/health`, `/healthz`             | sovereignty + model discovery contract                                                    |
| GET    | `/props`, `/slots`                | fleet-router (llama-server) parity                                                        |
| GET    | `/v1/models`                      | resident model registry                                                                   |
| POST   | `/v1/completions`, `/completions` | free / grammar-constrained completion (+ SSE `stream:true`)                               |
| POST   | `/v1/chat/completions`            | OpenAI chat parity via **honest flattening** (the base model has no chat template, D.121) |
| POST   | `/v1/model-workspace/observe`     | read-only, receipt-bound Jacobian-lens observation                                        |

### Model workspace observation

HoloServe can apply a precomputed, corpus-averaged Jacobian lens to captured
post-block residuals. The compatibility and paper-reference estimators are:

- `explicit_pair_average_v0` (`paperParity: false`) preserves the bounded
  source/target-pair implementation.
- `corpus_position_average_v1` batches output-dimension cotangents over every
  valid target position, averages valid source positions, and reuses one
  retained graph for all requested source layers. It is pinned to Anthropic's
  Apache-2.0 reference implementation at commit
  `581d398613e5602a5af361e1c34d3a92ea82ba8e`.

For v1, `paperParity: true` has the deliberately narrow scope
`parityScope: reference-estimator-only`; every artifact also records
`paperExperimentParity: false`. It means the estimator math matches the pinned
reference, not that a calibration corpus reproduces the paper's model scale or
experimental results.

Lens fitting is offline. Serving never performs live per-request autograd and
never returns raw prompts or activation tensors. V1 bounds dimension batch,
sequence length, and projected CPU matrix workspace before allocation. Each
prompt costs one forward pass plus `ceil(hidden_width / dim_batch)` backward
passes.

Bind each artifact to the exact resident model name when launching:

```bash
holoserve --ckpt /path/to/ckpt.pt --bins /path/to/bins \
  --workspace-lens holorunner-s0=/path/to/holorunner-s0-jacobian-lens.pt

curl -s localhost:8080/v1/model-workspace/observe \
  -H 'content-type: application/json' \
  -d '{"model":"holorunner-s0","prompt":"composition \"","layers":[1],"positions":[-1],"k":10}'
```

The lens artifact binds checkpoint, tokenizer, calibration-corpus, layer, and
position-policy hashes. A mismatch fails startup. `/health.model_workspace_probe`
advertises per-model availability; a model without a bound artifact abstains.
Receipts retain the full prompt hash and record both original and observed token
counts plus the exact left-truncation policy when a prompt exceeds the model
window; v0.2 verifiers reject missing or inconsistent truncation metadata.
Receipt schema v0.2 advertises `measurementProfile: full-distribution-v1` and
computes distribution comparisons from float64 log-softmax values before the
mapped and control views are truncated to top-k. Each coordinate binds mapped
and control tail mass, full-vocabulary mapped/control JSD and total variation,
entropy and maximum-probability diagnostics, and mapped/control distance to the
model's actual final distribution. `lensGainJensenShannonNatsE8` is the signed
control-to-final minus mapped-to-final distance, so it distinguishes useful
transport from mere correction magnitude without another model forward pass.
Each sparse top-k view and its aggregate tail are quantized as one categorical
partition with Hamilton largest-remainder apportionment. Fractional-remainder
ties preserve original top-k-plus-tail category order, and every partition sums
to exactly 100,000,000 E8 units.
The receipt summary uses the fixed
`mean-mapped-control-full-vocabulary-jsd-nats-v1` profile and integer
round-half-up aggregation.

These distribution comparisons are HoloScript diagnostics, not Anthropic's
published target-token rank/pass@k metric and not paper-experiment parity. They
remain tokenizer-bound measurements; final-distribution distance is a lens
fidelity diagnostic, while mapped/control JSD is only an exploratory candidate
signal.
The endpoint accepts observation fields only and rejects `mode`, `intervention`,
`direction`, `strength`, activation vectors, and unknown fields. A future write
capability requires a separate endpoint and receipt schema.

Use `fit_jacobian_lens_v1`, `merge_jacobian_lens_v1_artifacts`, and
`save_jacobian_lens_artifact` from `holoserve.workspace_probe` in an offline
calibration job. Fit content-disjoint prompt shards, save each shard atomically,
then merge with exact prompt-count weighting for a resumable larger run. The
fitter derives its corpus hash from the exact ordered post-truncation token
sequences and rejects a caller-supplied mismatch or overlapping merge shards.
`fit_jacobian_lens` remains available for v0 compatibility. The resulting
`ModelWorkspaceReceipt` is a tokenizer-bound measurement, not intent, truth,
identity, consciousness, or policy authority. Sparse scores, probabilities,
and full-distribution diagnostics use exact E8 integer fields, allowing
HoloServe and HoloLlama to recompute the same receipt hashes without lossy
floating-point canonicalization. Receipts bind the prompt hash, requested
layers/positions/k, selected model, measurement profile, and advertised lens
artifact. SHA-256 receipts provide integrity and provenance binding, not server
authentication; deployments still need an authenticated transport boundary.

For same-endpoint fidelity work, HoloServe exposes two separately named,
`paperParity: false` estimators. Both differentiate the final post-block residual
at the prompt endpoint with respect to the same source coordinate, fit independent
maps in declared inclusive absolute-position bins, serve `J @ h + b`, reject
oversize calibration prompts instead of slicing them, and only admit final-token
observations:

- `fit_endpoint_affine_jacobian_lens_v1` retains
  `endpoint_self_jacobian_affine_v1`: `J = mean_i(J_i)` and
  `b = mean_i(y_i) - J @ mean_i(x_i)`.
- `fit_endpoint_local_taylor_jacobian_lens_v1` emits the distinct
  `endpoint_self_jacobian_local_taylor_v1`: `J = mean_i(J_i)` and
  `b = mean_i(y_i - J_i @ x_i)`. Its artifact serializes
  `jacobianSourceProductMeans = mean_i(J_i @ x_i)` and loading fails closed unless
  `b = mean_i(y_i) - jacobianSourceProductMeans` for every layer and position bin.

Receipts for both include a mean-final anchor control so a constant output prior
cannot satisfy the fidelity gate. Neither path replaces or renames Anthropic's
present-and-future v1 estimator.

For leakage-safe corpus runs, use the two-phase evaluator. `collect` accepts
prompt-only JSONL rows (`caseId`, `vertical`, `templateId`, `frame`, `prompt`),
rejects label-shaped fields and truncation by default, verifies every HoloServe
receipt, and atomically persists both canonical source receipts and each
layer/position metric. `evaluate` revalidates and re-derives the rows from those
receipts and the original prompt manifest before it opens a separate JSONL label
manifest (`caseId`, `positive`). It then reports leave-one-vertical-out
thresholds, vertical-macro AUC, delta against the
registered normalized union-top-k legacy comparator, whole-vertical bootstrap
intervals, A/B and frame agreement, and the fixed promotion gates. Diagnostic
runs can never set `promotionAllowed: true`.

```bash
python -m holoserve.workspace_eval collect \
  --endpoint http://127.0.0.1:8080 \
  --prompt-manifest prompts.jsonl --output rows.jsonl \
  --receipt-output receipts.jsonl --run-manifest collect.json \
  --model a=holorunner-s0=sha256:<lens> \
  --checkpoint-sha256 sha256:<checkpoint> --tokenizer-sha256 sha256:<tokenizer> \
  --layers 2 5 8 --positions -1 --k 25

python -m holoserve.workspace_eval evaluate \
  --rows rows.jsonl --receipts receipts.jsonl --prompt-manifest prompts.jsonl \
  --collection-manifest collect.json \
  --labels labels.jsonl --output evaluation.json \
  --status diagnostic --primary-frame unprimed --primary-alias a

python -m holoserve.workspace_fidelity \
  --rows rows.jsonl --receipts receipts.jsonl --prompt-manifest fidelity-h.jsonl \
  --collection-manifest collect.json --preregistration s1-preregistration.md \
  --output fidelity-evaluation.json
```

`workspace_fidelity` never accepts labels. It replays all source receipts and
requires positive, bootstrapped target-fidelity gain against both the identity
logit lens and the mean-final anchor at layers 2 and 5, layer-8 non-inferiority,
positive results in every position bin, entropy/max-probability improvement,
non-collapsed token diversity, and paired A/B replication.

A `fresh` run additionally requires `--fresh-manifest`, `--fresh-report`, and
`--preregistration`. Before its first HTTP observation, collection verifies the
exact 240-case balanced compact-frame design, distinct A/B lenses, zero-match
leakage commitments, independent adjudication, frozen run parameters, an
implementation commit whose complete HoloServe Python package tree and
`pyproject.toml` bytes match `git show`, and an
immutable Git-tag seal containing the exact manifest. Evaluation re-verifies the
source receipts, implementation and corpus seals, label commitment, and all 960
case/frame/lens rows before promotion is even possible.

## Native constrained decoding (no GBNF, no llama.cpp)

`holoserve.grammar` is a byte-level NFA walked directly against the S0 vocabulary, so
every sampled token keeps the emitted string a **valid uAAL IR by construction** — pure
native logit-masking (W.780) that adds **zero runtime dependencies**. Pass `grammar` in a
request to constrain output to a registered vertical:

```bash
curl -s localhost:8080/v1/completions -H 'content-type: application/json' \
     -d '{"prompt": "", "grammar": "containment-gap", "max_tokens": 512}'
```

Verticals: `containment`, `deontic`, `composition`, and their `-gap` variants (which add
an **honest-abstention** branch — a grammar that cannot say "I don't know" turns
abstention into confident wrong output). Self-test any grammar against a real bins dir:

```bash
python -m holoserve.grammar --bins /path/to/s0/bins
```

## Offline sampler

```bash
holoserve-sample --data-dir /path/to/s0/bins --ckpt /path/to/s0/ckpt/ckpt.pt \
                 --out samples.jsonl --samples 12 --seed 7
```

## Modules

| Module                      | Needs torch? | What it is                                                 |
| --------------------------- | ------------ | ---------------------------------------------------------- |
| `holoserve.tokenizer`       | no           | native byte-BPE codec (single source of truth)             |
| `holoserve.grammar`         | no           | byte-level NFA constrained-decoding engine + `GRAMMARS`    |
| `holoserve.model`           | yes          | the from-scratch S0 GPT (`Block` + `GPT`)                  |
| `holoserve.sampler`         | yes          | deterministic offline JSONL sampler                        |
| `holoserve.server`          | yes          | resident-model OpenAI-compatible HTTP server               |
| `holoserve.workspace_probe` | yes          | offline Jacobian-lens fitting + read-only receipt emission |
| `holoserve.train`           | yes          | the from-scratch, resumable GPU trainer (optional)         |

## Tests

```bash
pip install -e ".[model,dev]"
pytest        # includes the torch-backed model-workspace tests
```

## Provenance

Graduated from the sovereign HoloServe scripts (`ai-ecosystem/scripts/holoserve.py`,
`sample_holorunner_s0.py`, `holorunner_s0_ir_grammar.py`, `train_holorunner_s0.py`) per
F.145 (Jetson-work + consumption → npm AND PyPI packages, not ad-hoc repo scripts).
Design SSOT: `ai-ecosystem/research/2026-07-12_holoserve-native-sovereign-inference-server.md`.
