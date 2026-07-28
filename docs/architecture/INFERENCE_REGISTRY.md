# HoloScript Inference Registry

This is the human-facing map for the machine-readable registry at
[`inference-registry.json`](./inference-registry.json). It answers one narrow
question: which encoders, inference adapters, model runtimes, and local model
artifacts are real enough to route through today?

## Current Lanes

| Lane                         | What it covers                                                           | Maturity                        |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------- |
| `core-inference-trait`       | Generic adapter-backed `inference:run` contract                          | implemented                     |
| `core-embedding-trait`       | Deterministic local embedding events                                     | implemented                     |
| `absorb-embedding-providers` | GraphRAG providers: structural, HoloEmbed, Xenova, OpenAI, Ollama        | implemented                     |
| `holoembed-encoder`          | 768-dim structural/subword encoder with optional SNN-WebGPU acceleration | implemented                     |
| `jepa-world-model`           | JEPA latent context/target encoder and predictor research lane           | experimental                    |
| `onnx-runtime-trait`         | Runtime-only ONNX load/run/dispose adapter surface                       | implemented                     |
| `motion-pfnn-onnx`           | PFNN-style motion inference through pure-JS or ONNX Runtime              | runtime-backed-if-model-present |
| `hologram-depth-onnx`        | Depth-Anything ONNX inference with luminance fallback                    | runtime-backed-if-model-present |
| `local-llm-inference`        | Ollama-compatible local LLM trait                                        | declaration                     |
| `llm-service-router`         | Brittney provider router across hosted, fleet, and local providers       | implemented                     |
| `tensorrt-edge-inference`    | Jetson TensorRT engine declaration/build lane                            | declaration                     |
| `snn-webgpu-encoding`        | Spike encoders/decoders plus SNN cognition                               | implemented                     |
| `semantic-novelty-encoder`   | Local transformers.js semantic novelty advisory layer                    | experimental                    |
| `holomap-micro-encoder`      | Deterministic micro vision encoder for reconstruction                    | implemented                     |

## Routing Rules

1. Use the registry before inventing a new inference path.
2. Treat `implemented` as a local contract, not proof that every optional model
   artifact is provisioned.
3. Treat `runtime-backed-if-model-present` as real inference only after the
   checker reports the model artifact present.
4. Treat `declaration` lanes as compiler/runtime contracts that need a target
   service, device, or engine before they execute.
5. Treat `experimental` lanes as research/product surfaces unless a current run
   receipt or model card upgrades their status.

## Local Check

Run:

```bash
pnpm check:inference-registry
```

The checker fails on missing source/test files and duplicate lane IDs. Optional
artifacts are reported as present or missing without failing the run unless
`--strict-artifacts` is passed.
