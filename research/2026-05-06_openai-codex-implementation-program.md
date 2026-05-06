---
doc_tier: research
research_phase: base
status: active
last_verified: 2026-05-06
canonical_for: openai-codex-implementation-program
supersedes: ''
extends: ''
---

### Machine summary (uAA2 COMPRESS)

**TL;DR:** HoloScript should absorb OpenAI/Codex as execution surfaces, not as replacements for CAEL, HoloMesh, or local hardware truth. The first committed slice is the OpenAI provider migration toward Responses API semantics, because every higher-level feature needs model/tool output fidelity. The remaining program is grouped into tool bridge, Codex worker, ChatGPT app, Agents SDK, Realtime/ChatKit, asset generation, evals, and packaging waves.

- **W --** OpenAI tools are most valuable when they compile into HoloScript evidence loops; hosted shell or apply-patch output without CAEL provenance is not enough.
- **P --** Keep Responses API as the primary LLM wire format and adapt provider-neutral `tool_use` / `tool_result` blocks at the edge.
- **G --** Do not make OpenAI vector stores, Codex cloud sandboxes, or ChatGPT app state the source of truth for HoloScript knowledge or local secrets.

**Evidence:** `packages/llm-provider/src/adapters/openai.ts`; `packages/llm-provider/src/__tests__/openai-responses.test.ts`; OpenAI official docs for Models, Responses text generation, function calling, Codex, Apps SDK, Agents SDK, Realtime, ChatKit, Skills, evals, prompt optimizer, image generation, and video generation.

---

# OpenAI and Codex Implementation Program

## Wave 0 -- Provider Substrate

Status: started 2026-05-06.

- Make `@holoscript/llm-provider` default OpenAI calls to the Responses API.
- Preserve Chat Completions as an explicit compatibility surface for older proxies.
- Map provider-neutral HoloScript tools to OpenAI function tools.
- Parse OpenAI text, function calls, usage, request ids, and assistant blocks into `LLMCompletionResponse`.
- Keep modern model aliases current: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, Codex-oriented aliases, plus legacy opt-in aliases.

## Wave 1 -- Tool Bridge Into CAEL

- Compile OpenAI function calls into HoloScript `ToolSpec` / `ToolUseBlock` without losing call ids.
- Add adapters for OpenAI built-in tools behind HoloDoor policy:
  - web search for cited research intake
  - file search for temporary user-provided files
  - code interpreter for bounded calculations
  - hosted shell and apply patch only inside explicit local-or-cloud execution envelopes
  - image/video generation as asset requests with provenance records
  - MCP and connector tools as HoloScript capability descriptors
- Every tool result must emit CAEL evidence: input hash, output hash, policy decision, runtime, and replay pointer.

## Wave 2 -- Codex Worker Surface

- Add a Codex job runner that can take HoloMesh board tasks, synthesize a Codex prompt, run in an isolated worktree, and return a patch/evidence packet.
- Support Codex app automations for recurring audits: dependency drift, model alias drift, docs drift, and local hardware build drift.
- Encode Codex local environment templates so cloud Codex and hardware Codex agree on Node, pnpm, WebGPU, WASM SIMD, and solver expectations.
- Route private credential and GPU-sensitive tasks back to local hardware Codex by default.

## Wave 3 -- ChatGPT App / Apps SDK

- Build a ChatGPT Apps SDK front door for HoloScript:
  - describe scene
  - inspect scene graph
  - run compiler
  - request CAEL validation
  - export/share artifact
- Use MCP app tools as a controlled facade over HoloScript services.
- Keep HoloMesh/HoloScript as the canonical store; ChatGPT state is a session view.

## Wave 4 -- Agents SDK Interop

- Export HoloScript agents as OpenAI Agents SDK-compatible definitions.
- Import OpenAI agent plans as HoloScript compositions where possible.
- Preserve HoloScript semantics: units, constraints, trait provenance, replay, and tool policy stay explicit.
- Add guardrail/eval adapters so Agents SDK traces can be checked against CAEL evidence.

## Wave 5 -- Realtime, Voice, and Brittney UX

- Add OpenAI Realtime as a voice control plane for Studio and in-world agents.
- Route Realtime events into deterministic HoloScript interaction events.
- Use ChatKit for embedded agent chat surfaces in Studio/Brittney where a full custom UI is not needed.
- Keep latency metrics, transcript hashes, and scene mutation traces together.

## Wave 6 -- Asset Generation Pipeline

- Add first-class image/video generation requests for texture, concept, storyboard, and demo-clip assets.
- Store prompts, model ids, generated asset hashes, license/policy metadata, and scene attachment points.
- Require human or policy approval before generated assets become canonical product examples.

## Wave 7 -- Evals and Prompt Optimizer

- Create eval suites for:
  - HoloScript syntax validity
  - trait selection correctness
  - CAEL replay pass rate
  - hallucinated API/tool use
  - security boundary compliance
  - visual/rendering regressions
- Use prompt optimizer for provider prompts, but gate adoption on local eval deltas and hardware validation.

## Wave 8 -- Skills and Packaging

- Package HoloScript authoring, debugging, CAEL validation, paper-gate, and scene asset workflows as OpenAI/Codex skills.
- Add versioned skill manifests with required tools, network policy, secret policy, and validation commands.
- Make skills usable by Codex, ChatGPT app tools, and HoloMesh workers without forking behavior.

## Non-Goals

- Do not replace HoloMesh knowledge with OpenAI vector stores.
- Do not treat hosted shell output as trusted without CAEL/local replay.
- Do not send local private credentials, unredacted vault data, or hardware-only datasets to cloud sandboxes by default.
- Do not let model aliases silently downgrade HoloScript generation quality; callers may opt down for cost/speed.

## Source Links

- OpenAI Models: https://developers.openai.com/api/docs/models
- Responses text generation: https://developers.openai.com/api/docs/guides/text-generation
- Function calling: https://developers.openai.com/api/docs/guides/function-calling
- Codex: https://developers.openai.com/codex
- Codex app features: https://developers.openai.com/codex/app/features
- Codex SDK: https://developers.openai.com/codex/sdk
- Apps SDK MCP apps: https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
- Agents SDK: https://developers.openai.com/api/docs/guides/agents
- Realtime: https://developers.openai.com/api/docs/guides/realtime
- ChatKit: https://developers.openai.com/api/docs/guides/chatkit
- Skills: https://developers.openai.com/api/docs/guides/tools-skills
- Evals: https://developers.openai.com/api/docs/guides/evaluation-getting-started
- Prompt optimizer: https://developers.openai.com/api/docs/guides/prompt-optimizer
- Image generation: https://developers.openai.com/api/docs/guides/image-generation
- Video generation: https://developers.openai.com/api/docs/guides/video-generation
