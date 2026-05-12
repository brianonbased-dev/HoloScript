# Claude API Migration Checklist — April–May 2026

**Status**: Phase 1 ✅ · Phase 2 ✅ (largely complete via incremental commits, not the originally scoped bundle) · Phase 3 partial · **2026-05 surface gaps** open (advisor / compaction / task-budgets / files / managed-agents / security beta / AWS routing)
**Last audited**: 2026-05-11 (re-baselined after F.040 peer-activity check caught 9 in-flight commits invalidating the 2026-04-17 status)
**Scope**: HoloScript packages using `@anthropic-ai/sdk`

This is the follow-on from the 3-file deep review + 18-file audit on 2026-04-17. **Phase 2 was shipped piecewise over the following 3 weeks** — the items below are marked with the commit that landed each one. Phase 3 and the May-2026 surface gaps are the remaining work.

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

- `llm-provider` — 194/[see NUMBERS.md]  passing ✓
- `core/compiler/AgentInferenceExportTarget` — 42/[see NUMBERS.md]  passing ✓
- Typecheck: llm-provider clean; core has pre-existing R3F / WorldModelBootstrap / continual errors unrelated to these changes

---

## Phase 2 — Medium Fixes (SHIPPED piecewise, 2026-04-17 → 2026-05-08)

Verified 2026-05-11 by reading `packages/llm-provider/src/adapters/anthropic.ts` (773 LOC) + 14-day git log on related sites.

### llm-provider/src/adapters/anthropic.ts

- [x] **`stream()` + `.finalMessage()`** — `complete()` now uses `client.messages.stream(...).finalMessage()`; non-streaming path retired (see lines ~293–314, comment cites W01 H200 30s headersTimeout incident 2026-04-25). Commit: `ce9c6d9ab` (Phase 1/3 of streamCompletion unification).
- [x] **`streamCompletion()` async generator** — provider-agnostic token-by-token chunks (`text_delta`, `tool_use_start`, `tool_use_input_delta`, `tool_use_end`, `message_stop`). Commit: `ce9c6d9ab`.
- [x] **Adaptive thinking pass-through + defaults** — `buildThinkingAndOutputForAnthropic()` returns `{thinking: {type: 'adaptive', display: 'summarized'}}` for Opus 4.7/4.6 + Sonnet 4.5/4.6 unless caller sets `thinking.type: 'disabled'` (lines ~76–124).
- [x] **`output_config.effort`** — `xhigh` default for Opus 4.7, `high` for other adaptive-default models, downgrades `xhigh`/`max` on unsupported models to avoid 400s.
- [ ] **Structured outputs** (`output_config.format: {type: "json_schema", schema}`) — request shape passes through, but caller-side schema plumbing not used anywhere yet. Phase 3 follow-up.
- [x] **Typed exceptions** — `mapAnthropicError()` dispatches on HTTP status (401/403/429/4xx-context/5xx), maps to `LLMAuthenticationError` / `LLMRateLimitError` / `LLMContextLengthError` with `retry-after` parsed. String-matching `err.message.includes('context')` survives at status===400 only as a filter (line ~764). Commit: `c9311a555` (also added distinct `refusal` + `context_window_exceeded` stop_reasons).
- [x] **Prompt caching** — `enablePromptCaching` defaults to TRUE; system+tools block gets `cache_control: {type: 'ephemeral'}` AND extended message-turn breakpoints distribute the remaining 3 (Anthropic limit = 4 total). `buildMessagesWithCacheBreakpoints()` lines ~437+. Commits: initial in `complete()`, extended in `d75b49c5f`.
- [x] **`withRetry` helper** wired — exponential backoff on retryable 5xx + RateLimitError. Commit: `54db0decf`. No retry on `streamCompletion` (partial-text retries would corrupt SSE state — documented in code).
- [x] **`request_id` + response headers captured** for observability. Commit: `61f36a3ec`.
- [x] **Capability declarations** — `ANTHROPIC_CAPABILITIES` exported; routes through `LLMProviderCapabilitiesCompiler`. Commits: `985a5271d`, `9fe677222`.
- [ ] **Remove dead `apiVersion` field** — still stored in constructor (line ~189, ~198), still unused. Trivial cleanup. **Status: open.**

### studio/src/app/api/brittney/route.ts

- [x] **Migration to unified `provider.streamCompletion()`** (D.025 Phase 3). Tool-format conversion, prompt caching, adaptive thinking, effort, error handling all moved into the provider layer — the route is now provider-agnostic. Commit: `96c50a36f`. Downstream wiring: Paper-26 gates 1+2 (`289130e1f`), embodied composite cache + `read_embodied_status` (`3070548a7`), LOTUS_TOOLS (`98dc39952`), benchmark x-benchmark-key bypass (`e450a2fa4`), diagnostic 503+JSON (`63376bbfc`), `_lib` import path repair (`b278ec23e`), assistant service config hardening (`d3493854c`).
- [x] **Off-by-one in tool loop** — folded into the provider migration; the route no longer owns the loop boundary.
- [x] **Typed exceptions for rate limits in the SSE error path** — `mapAnthropicError()` surfaces typed errors through the unified stream.

### core/src/compiler/AgentInferenceExportTarget.ts

- [x] **Target-provider tool shapes** — emits provider-specific tool definitions instead of Anthropic-only. Commit: `728d2ceaa`.
- [x] **Adaptive thinking + effort emitted** through the unified codegen path (verify per provider in generated output).
- [ ] **`stop_reason === 'pause_turn'` handling** in generated agent loops — **status: verify in current codegen output**. Open.
- [ ] **Compile-time model validation** against current catalog — **status: open**. Phase 3 follow-up.
- [ ] **Structured-outputs codegen** — emit `output_config.format` when `.holo` specifies a schema. Open.

### studio/src/app/api/{generate, material/generate, autocomplete}

- [x] **All 19 unprotected call sites migrated to `@holoscript/llm-provider`** (Phase B1). Commit: `c1326b5f6`. These routes now inherit prompt caching, streaming, typed errors, adaptive thinking from the adapter automatically.
- [x] **Sonnet alias rotation** `claude-sonnet-4-20250514` → `claude-sonnet-4-6`. Commit: `00a1c0a6c`.
- [x] **`max_tokens` ≥ 16000 streaming documented** as a hard requirement. Commit: `4608c046c`.

---

## May 2026 Surface Gaps (open — these are the genuine remaining items)

**Verified open via `grep -r "advisor-tool\|managed-agents-2026\|compact-2026\|task-budgets-2026\|files-api\|claude-security" HoloScript/` returning ZERO matches outside capability-manifest declarations (2026-05-11).** The capability flags in `ANTHROPIC_CAPABILITIES` are aspirational, not wired.

### Small-scoped (single-file adapter wiring + caller opt-in)

- [ ] **Advisor tool** (`advisor-tool-2026-03-01`) — pair Opus-4.7 advisor with Haiku-4.5 executor on long-horizon Brittney loops. Wiring: add to `LLMCompletionRequest.tools`, inject beta header `anthropic-beta: advisor-tool-2026-03-01` when present, document in `LLM_CAPABILITIES.md`.
- [ ] **Compaction API** (`compact-2026-01-12`) — server-side conversation summarization. Brittney long-conversation paths are the primary beneficiary. Wiring: `compact: 'auto'` request param + beta header.
- [ ] **Task Budgets** (`task-budgets-2026-03-13`) — per-loop token caps for Opus 4.7. Pairs with `holoscript-agent` cost-guard (which currently estimates client-side; this would enforce server-side).
- [ ] **Files API** — `client.files.create(...)` for large attachments routed through generated agents. Currently we base64-encode through messages, which costs cache breakpoints and bloats prompts.

### Architecture-level (founder-gated decisions — research first, don't auto-execute)

- [ ] **Managed Agents** (`managed-agents-2026-04-01`) — would replace `packages/holoscript-agent/` headless-agent runner. **Tradeoffs**: Anthropic-managed sandboxing + native Memory Stores + native session lifecycle webhooks vs. our sovereign control + per-seat wallets + x402 + cost-guard + custom audit log. **Threat-model gate per W.GOLD.193** — secure-by-default-managed is not obviously the right answer when our headless agents enforce per-seat custody. **Status: research task.**
- [ ] **Claude Security beta** — Enterprise-tier code-vuln scanning. Tier eligibility unverified. Overlaps with `/security-audit` skill + adversarial-trust-injection Paper 21. **Status: research task** (tier check + threat-model fit assessment).
- [ ] **Claude Platform on AWS** (launched 2026-05-11) — native AWS endpoints with AWS billing + IAM auth. Tradeoffs: enterprise-ready billing + IAM scope expansion vs. cost increase + extra IAM surface. **Status: research task** (cost diff + IAM scope review).

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

## Migration guarantees — DELIVERED (Phase 2)

Every HoloScript package that uses the Claude API now inherits, via `@holoscript/llm-provider`:

1. ✅ **Opus 4.7 safe** — no sampling params sent on 4.7, no 400 errors
2. ✅ **Streaming by default** for long outputs — no HTTP timeouts (`stream().finalMessage()` + `streamCompletion()` generator)
3. ✅ **Prompt caching** on system+tools block AND extended message-turn breakpoints — ~90% cost reduction on hot prefixes within 5-min/1-hr TTL
4. ✅ **Typed SDK exceptions** — proper retry logic; `withRetry` on `complete()`, surfaced distinctly through `streamCompletion()` (no retry to avoid SSE corruption)
5. ✅ **Adaptive thinking** on Opus/Sonnet 4.x — defaulted, with effort routing
6. ⚠️ **Structured outputs** via `output_config.format` — pass-through plumbed, schema codegen still open

## Schedule

- **Phase 1**: ✅ Complete (2026-04-17)
- **Phase 2**: ✅ Shipped piecewise 2026-04-17 → 2026-05-08 (1 trivial cleanup remaining: dead `apiVersion` field)
- **Phase 3**: 🟡 Partial — SDK floor test landed, retired-model regression test + cache-hit telemetry test + "Opus 4.7 compatibility" mock-server test still open. Target: 2026-05-22.
- **May 2026 surface gaps**: 🆕 4 small-scoped wirings (advisor, compaction, task-budgets, files-api) + 3 architecture-level research items (Managed Agents, Security beta, AWS routing). Filed as board tasks 2026-05-11.

## Related

- `docs/strategy/competitive-brief-2026-04-17.md` — why this matters
- `packages/llm-provider/src/__tests__/sdk-version-floor.test.ts` — CI guard for Phase 2 prerequisites
- Memory: W.049 (plugin format), W.GOLD.041 (IDE MCP interpolation), W.GOLD.044 (Affective Causality) — related architecture context
