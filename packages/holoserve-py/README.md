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

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health`, `/healthz` | sovereignty + model discovery contract |
| GET | `/props`, `/slots` | fleet-router (llama-server) parity |
| GET | `/v1/models` | resident model registry |
| POST | `/v1/completions`, `/completions` | free / grammar-constrained completion (+ SSE `stream:true`) |
| POST | `/v1/chat/completions` | OpenAI chat parity via **honest flattening** (the base model has no chat template, D.121) |

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

| Module | Needs torch? | What it is |
| --- | --- | --- |
| `holoserve.tokenizer` | no | native byte-BPE codec (single source of truth) |
| `holoserve.grammar` | no | byte-level NFA constrained-decoding engine + `GRAMMARS` |
| `holoserve.model` | yes | the from-scratch S0 GPT (`Block` + `GPT`) |
| `holoserve.sampler` | yes | deterministic offline JSONL sampler |
| `holoserve.server` | yes | resident-model OpenAI-compatible HTTP server |
| `holoserve.train` | yes | the from-scratch, resumable GPU trainer (optional) |

## Tests

```bash
pip install -e ".[dev]"
pytest        # torch-free structure/smoke tests (grammar + tokenizer)
```

## Provenance

Graduated from the sovereign HoloServe scripts (`ai-ecosystem/scripts/holoserve.py`,
`sample_holorunner_s0.py`, `holorunner_s0_ir_grammar.py`, `train_holorunner_s0.py`) per
F.145 (Jetson-work + consumption → npm AND PyPI packages, not ad-hoc repo scripts).
Design SSOT: `ai-ecosystem/research/2026-07-12_holoserve-native-sovereign-inference-server.md`.
