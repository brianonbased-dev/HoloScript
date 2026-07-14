# @holoscript/llm-provider

## 1.5.0

### Minor Changes

- 68c87fc: Add HoloServe / `pytorch-holo` support to the local fleet lane (D.118 — sovereign PyTorch-direct serving, no llama.cpp/GGUF).

  - **Fleet router:** new `pytorch-holo` `FleetBackend`; `discoverPytorchHoloNode` shares the llama.cpp `/health`+`/props`+`/slots` discovery path plus a sovereignty gate (`/health` must assert `sovereign === true && llama_cpp === false` before the node is admitted). `backend` is now carried through `NodeDiscovery → FleetCandidate → FleetRoute → resolveLocalFleet`, so a consumer reads the routed node's API shape in-band instead of guessing from the `:11434` port. `embedAcrossFleet` skips non-Ollama route winners rather than POSTing `/api/embed` into a 404.
  - **Local adapter:** `streamCompletion` now dispatches by protocol — Ollama-native NDJSON `/api/chat` or a new OpenAI-compat SSE `/v1/chat/completions` branch (llama-server, HoloServe, LM Studio, vLLM), with an honest truncation guard (EOF without a finish frame or `[DONE]` is surfaced as an error, not a clean stop). `LLMCompletionRequest.grammar` passes through for structured-output decoding. New `createLocalLLMProviderForRoute(route)` selects the wire protocol from `route.backend`. Known-Ollama construction sites pin `nativeOllamaApi: true`.
  - **Sovereign resolver:** new `holoserve` provider preferred over HoloLlama for HOLO-arch checkpoints, with an async `/health` sovereignty verification that refuses a non-sovereign impostor on the port.

  New exports: `discoverPytorchHoloNode`, `createLocalLLMProviderForRoute`. `FleetBackend` widened, and `backend` added to the `NodeDiscovery` / `FleetCandidate` / `FleetRoute` / `resolveLocalFleet` return types (output-position only; no input-position or removed-API breakage).
