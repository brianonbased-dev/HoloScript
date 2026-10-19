# @holoscript/llm-provider

## 1.7.0

### Minor Changes

- 268e183: The HoloScript generator prompt (`HOLOSCRIPT_SYSTEM_PROMPT`, newly exported with
  `HOLOSCRIPT_EXAMPLE_PROGRAM`) shows whole programs that parse: a real quickstart scene
  inside its `composition "Name" { ... }` root, plus programs for templates used with
  `using`, groups, comments and state-machine transitions. Every program in it is
  parse-tested as .holo (and as .hsplus, except the state machine). It no longer teaches
  a named material or `@advanced_pbr`, which web targets drop.

  Measured on the 14 author_holo tasks, right answers with every requested detail:
  Gemini 3.1 Pro 36 of 42 (33 with the prompt before the template, group, comment and
  state-machine programs), Qwen3-4B 10 of 14 (10 before). The forms were chosen from that
  benchmark's misses, so the gain is in-sample.

  Every framework AI adapter (OpenAI, Anthropic, Ollama, LM Studio, Gemini, xAI,
  Together, Fireworks, NVIDIA) now sends that prompt for generate, fix and optimize, and
  for chat the same knowledge with its "return only code" rule lifted. Explain uses a
  short "explain clearly" prompt on every adapter: with the long prompt, Qwen3-4B answered
  explain requests with code. Before, several adapters sent their own one-line prompts
  for generate, fix and optimize too.

## 1.6.2

### Patch Changes

- Patch: gate silent frontier / hosted-bridge LLM fallbacks (#334) and ordered native → vast-oss-coding → gated hosted backup chain (#336).

## 1.6.0

### Minor Changes

- Add exact, per-model HoloServe parity pins to the sovereign resolver. Pinned
  models require the asynchronous live-binding path, refuse artifact drift, and
  cannot fall through to HoloLlama.
- Require HoloServe health admission to bind the expected model to canonical
  checkpoint, tokenizer, and artifact digests before routing a request.
- Route owned-fleet chat through the shared sovereign resolver and keep Vast
  telemetry request-bound.
- Export contract-carrying, backend-neutral HoloWeight delta-graph planning with
  deterministic validation, topological planning, and replay tests.

## 1.5.0

### Minor Changes

- 68c87fc: Add HoloServe / `pytorch-holo` support to the local fleet lane (D.118 — sovereign PyTorch-direct serving, no llama.cpp/GGUF).
  - **Fleet router:** new `pytorch-holo` `FleetBackend`; `discoverPytorchHoloNode` shares the llama.cpp `/health`+`/props`+`/slots` discovery path plus a sovereignty gate (`/health` must assert `sovereign === true && llama_cpp === false` before the node is admitted). `backend` is now carried through `NodeDiscovery → FleetCandidate → FleetRoute → resolveLocalFleet`, so a consumer reads the routed node's API shape in-band instead of guessing from the `:11434` port. `embedAcrossFleet` skips non-Ollama route winners rather than POSTing `/api/embed` into a 404.
  - **Local adapter:** `streamCompletion` now dispatches by protocol — Ollama-native NDJSON `/api/chat` or a new OpenAI-compat SSE `/v1/chat/completions` branch (llama-server, HoloServe, LM Studio, vLLM), with an honest truncation guard (EOF without a finish frame or `[DONE]` is surfaced as an error, not a clean stop). `LLMCompletionRequest.grammar` passes through for structured-output decoding. New `createLocalLLMProviderForRoute(route)` selects the wire protocol from `route.backend`. Known-Ollama construction sites pin `nativeOllamaApi: true`.
  - **Sovereign resolver:** new `holoserve` provider preferred over HoloLlama for HOLO-arch checkpoints, with an async `/health` sovereignty verification that refuses a non-sovereign impostor on the port.

  New exports: `discoverPytorchHoloNode`, `createLocalLLMProviderForRoute`. `FleetBackend` widened, and `backend` added to the `NodeDiscovery` / `FleetCandidate` / `FleetRoute` / `resolveLocalFleet` return types (output-position only; no input-position or removed-API breakage).
