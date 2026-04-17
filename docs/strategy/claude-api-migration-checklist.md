# Claude API Migration Checklist — April 2026

**Status**: Phase 1 (Critical) complete · Phase 2 (Medium) not started · Phase 3 (Quality) not started
**Last audited**: 2026-04-17
**Scope**: HoloScript packages using `@anthropic-ai/sdk`

This is the follow-on from the 3-file deep review + 18-file audit on 2026-04-17. Phase 1 ships; Phases 2-3 are queued.

---

## Phase 1 — Critical Fixes (DONE 2026-04-17)

Shipping-bug severity. Merged in commit bundle `claude-api-critical-fixes-2026-04-17`.

### Completed

- [x] **`llm-provider/src/adapters/anthropic.ts`** — Catalog refreshed (6 current models; 5 retired + 1 deprecated removed). Default: `claude-opus-4-7`.
- [x] **`llm-provider/src/adapters/anthropic.ts`** — `temperature`/`top_p` conditionally omitted via `SAMPLING_PARAMS_UNSUPPORTED` set.
- [x] **`llm-provider/src/adapters/anthropic.ts`** — `max_tokens` default bumped 2048 → 16000.
- [x] **`studio/src/app/api/brittney/route.ts`** — Default model: `claude-sonnet-4-20250514` → `claude-opus-4-7`. `max_tokens` bumped 2048 → 16000.
- [x] **`studio/src/components/inspector/TraitPalette.tsx`** — `llm_agent` trait default model updated.
- [x] **`studio/src/app/api/generate/route.ts`** — Anthropic fallback default + conditional `temperature` for Opus 4.7.
- [x] **`studio/src/app/api/material/generate/route.ts`** — Same treatment.
- [x] **`studio/src/app/api/autocomplete/route.ts`** — Default model updated (Haiku for speed), conditional `temperature`.
- [x] **`mcp-server/src/ollama-client.ts`** — Date-suffixed ID → alias `claude-haiku-4-5`.
- [x] **`core/src/compiler/AgentInferenceExportTarget.ts`** — Default model: `claude-sonnet-4-20250514` → `claude-opus-4-7`. Helper `modelAcceptsSamplingParams()` gates `temperature`/`top_p` emission in all 4 sites (TS main, TS tool loop, Python main, Python tool loop). `max_tokens` default 4096 → 16000. SDK dep floor `^0.39.0` → `^0.88.0`.

### Verification

- `llm-provider` — 194/194 tests passing ✓
- `core/compiler/AgentInferenceExportTarget` — 42/42 tests passing ✓
- Typecheck: llm-provider clean; core has pre-existing R3F / WorldModelBootstrap / continual errors unrelated to these changes

---

## Phase 2 — Medium Fixes (Queued)

Ship quality issues. Not bugs, but missed value. Estimated: 1 week of work.

### llm-provider/src/adapters/anthropic.ts

- [ ] **Add `stream()` method** returning `.finalMessage()`. Required for `max_tokens > 16000` (Opus 4.x supports 128K output) to avoid HTTP timeouts.
- [ ] **Add `thinking: {type: "adaptive"}` parameter** pass-through. Adaptive thinking is the default recommendation for Opus 4.7 / 4.6 / Sonnet 4.6.
- [ ] **Add `output_config` support** for structured outputs (`format: {type: "json_schema", schema}`) and effort (`effort: "low|medium|high|max"`).
- [ ] **Switch to typed SDK exceptions** — replace string-matching error classification (current line ~172 `err.message.includes('context')`) with `err instanceof Anthropic.BadRequestError`, `Anthropic.RateLimitError`, `Anthropic.AuthenticationError`.
- [ ] **Add prompt caching opt-in** — expose `cacheSystem?: boolean` config; when true, add `cache_control: {type: 'ephemeral'}` to system block. Verify with `response.usage.cache_read_input_tokens > 0` on repeated calls.
- [ ] **Remove dead `apiVersion` field** (stored in constructor but never used).

### studio/src/app/api/brittney/route.ts

- [ ] **Hoist `convertToolsToClaudeFormat()` out of the tool-use loop** (currently called inside each round — wastes CPU and breaks cache).
- [ ] **Sort tool definitions deterministically** (by `name`) so cache prefix is stable.
- [ ] **Add prompt caching** — `cache_control: {type: 'ephemeral'}` on the system block. Benefit: ~90% cost reduction on repeated conversation turns within 5-minute window.
- [ ] **Add `thinking: {type: "adaptive"}` + `output_config: {effort: "high"}`** — Brittney is archetypal adaptive-thinking workload (5-round tool use, scene manipulation).
- [ ] **Fix off-by-one in tool loop**: `for (let round = 0; round <= MAX_TOOL_ROUNDS; round++)` runs `MAX+1` times. Change to `<`.
- [ ] **Typed exceptions** for rate limits in the SSE error path.

### core/src/compiler/AgentInferenceExportTarget.ts

- [ ] **Emit `thinking: {type: "adaptive"}`** in generated TypeScript agents (when target model supports it).
- [ ] **Emit `stop_reason === 'pause_turn'` handling** — current generated loop only breaks on `'tool_use'`; agents using server-side tools will hang when the server pauses.
- [ ] **Emit `output_config` surface** when user specifies structured output requirement in `.holo`.
- [ ] **Emit `cache_control` on system block** for generated agents.
- [ ] **Validate `agent.modelConfig.name` against current catalog** at compile time — warn on retired/deprecated models rather than emit broken code silently.
- [ ] **Emit streaming variant** (`client.messages.stream()` + `.finalMessage()`) when `max_tokens > 16000`.

### studio/src/app/api/generate/route.ts & material/generate & autocomplete

- [ ] **Switch from `fetch()` to `@anthropic-ai/sdk`** — currently raw HTTP with hand-rolled error handling. SDK has typed errors, automatic retries, streaming support.
- [ ] **Bump `max_tokens` in `generate/route.ts`** from 4096 → 16000 (material/generate's 512 is fine for short descriptors).
- [ ] **Add prompt caching** on shared system prompts.

---

## Phase 3 — Quality / Architecture (Queued)

### Consistency

- [ ] **Align `maxRetries` behavior across callers.** Current state: `llm-provider/adapter` sets `maxRetries: 0` (self-retries); `brittney` uses SDK default (2); Studio API routes use raw fetch (no retries). Pick a policy and apply uniformly.
- [ ] **Single source of truth for ANTHROPIC_MODELS.** Currently defined in `llm-provider` but Studio API routes, `TraitPalette`, `ollama-client`, and the code generator all have their own strings. Export from `llm-provider` and import everywhere.
- [ ] **Single source of truth for `SAMPLING_PARAMS_UNSUPPORTED` set.** Currently duplicated in `llm-provider/adapters/anthropic.ts` and `core/compiler/AgentInferenceExportTarget.ts`. Hoist to a shared constant.
- [ ] **Model alias vs date-suffixed ID policy.** Pick one. Aliases are recommended (auto-resolve to latest pinned build).

### Testing & Telemetry

- [ ] **Add SDK version-floor CI test** (✅ see `packages/llm-provider/src/__tests__/sdk-version-floor.test.ts`).
- [ ] **Add retired-model regression test** — scan all TS files for hardcoded retired model IDs, fail CI if any found.
- [ ] **Add "Opus 4.7 compatibility" test** — spin up a mock Anthropic server, run adapter + brittney flow, assert no 400s from unsupported params.
- [ ] **Add cache-hit telemetry** — log `usage.cache_read_input_tokens` at each call site. Fail a smoke test if cache hit rate is zero across 10 consecutive identical-prefix calls.

### Docs

- [ ] **Update `docs/strategy/` with Claude API conventions page** — which patterns are canonical, which are banned, which are pending SDK support. This doc is a draft of that.
- [ ] **Update `docs/examples/` with a "correct Anthropic adapter usage" snippet** that shows adaptive thinking + streaming + caching + typed exceptions, as a copy-paste template.

---

## Migration guarantees (what callers get for free after Phase 2)

When Phase 2 lands, every HoloScript package that uses the Claude API will have:

1. **Opus 4.7 safe** — no sampling params sent, no 400 errors
2. **Streaming by default** for long outputs — no HTTP timeouts
3. **Prompt caching** on system prompts — ~90% cost reduction on repeated prefixes
4. **Typed SDK exceptions** — proper retry logic without string-matching
5. **Adaptive thinking** on Opus/Sonnet — better reasoning quality for free
6. **Structured outputs** via `output_config.format` — schema-constrained JSON

## Schedule

- **Phase 1**: Complete (2026-04-17)
- **Phase 2**: Target 2026-04-24 — 1 week
- **Phase 3**: Target 2026-05-15 — 3 weeks (includes SDK alignment + tests + telemetry)

## Related

- `docs/strategy/competitive-brief-2026-04-17.md` — why this matters
- `packages/llm-provider/src/__tests__/sdk-version-floor.test.ts` — CI guard for Phase 2 prerequisites
- Memory: W.049 (plugin format), W.GOLD.041 (IDE MCP interpolation), W.GOLD.044 (Affective Causality) — related architecture context
