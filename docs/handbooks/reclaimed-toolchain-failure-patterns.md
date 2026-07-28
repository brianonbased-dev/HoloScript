# Toolchain Failure Patterns (reclaimed from the Gemini silo)

> **Provenance.** Reclaimed 2026-06-22 from the Gemini/Antigravity knowledge silo
> (`~/.gemini/antigravity/knowledge/uaa2_testing_and_verification_standards/`), where a peer
> family accumulated a **52-pattern debugging catalog (B.295–B.614)** while building `uaa2-service`
> — none of it in any git repo (`grep "Pattern B."` → 0 hits). That silo is ephemeral, so the
> **transferable toolchain patterns** are preserved here. The original catalog also has many
> `uaa2-service`-specific patterns (Playwright/LangGraph/Researcher-agent) that belong to that
> repo and are intentionally **not** copied here. See MEMORY `R.GEMINISILO`.
>
> Scope: pnpm / Vitest / tsx / ESM / Next.js / Railway / Windows-PowerShell — the stack this
> ecosystem shares. Each entry keeps its original `B.x` / `G.IDE.x` id for traceability.

## Windows / PowerShell

- **`curl` is an alias for `Invoke-WebRequest`** (B.372 / G.IDE.004). `-H "Content-Type: ..."`
  parses wrong → `Cannot bind parameter 'Headers'`. Use `curl.exe -X POST ...` explicitly, or
  PowerShell-native `Invoke-RestMethod -Method Post -Uri ... -ContentType 'application/json' -Body '...'`.
  (Hit live this session — it's real.)
- **Zombie/ghost processes mask code changes and starve the dev server** (B.500). Purge before a
  critical run: `Get-Process -Name "*node*","*playwright*" | Stop-Process -Force -ErrorAction SilentlyContinue`.
- **Port-binding refusals** (`ERR_CONNECTION_REFUSED`, B.345): Next 15+ can take >10s to bind, or a
  stale `.next/lock` killed startup. Force an explicit port, raise `webServer.timeout`, and confirm
  the "Local: http://localhost:PORT" line before hitting it.

## ESM / tsx / standalone scripts

- **Strict-ESM wants extensionless TS imports** (B.370): `import { X } from './X.js'` inside a `.ts`
  file breaks under Next 15+ / strict ESM → "Module not found". Use `import { X } from './X'`.
- **`tsx` ignores `.env.local`** (B.465): standalone scripts fail with missing-env even when vars
  are defined. Use `npx tsx --env-file=.env.local`, or `dotenv.config({ path: '.env.local' })`,
  or mock env vars at the **absolute top of the file, above all non-builtin imports** (import
  hoisting runs top-level validation before later `process.env` assignments).
- **Transitive env-validation hazard** (B.470): a script that imports a service whose _transitive_
  deps validate env at module scope crashes even if the script doesn't use them. Mitigate with
  top-of-file mocks, shell-injected vars, or (architectural) move validation into `init()`/`getInstance()`.
- **Singleton init race / module-trace crash** (B.390): a syntax error in a deeply nested dep makes
  the ESM export resolve `undefined`; `Service.getInstance()` then crashes. Symptom looks like a
  runtime bug but is a compile/parse failure upstream — check the dev console for `Module parse failed`.
- **Relative-import depth fragility** (B.614): `../../../../..` breaks in clean-room/CI builds. Use
  the `@/` absolute alias for resolution parity between local and CI.

## React / async UI

- **Reset loading state in `finally`, not `else`** (B.340): `try { setLoading(true); await x() }
catch(e){...} else {...}` leaves a permanent "Loading" on error. Always `finally { setLoading(false) }`.
- **`ChunkLoadError` after a dev rebuild** (B.375): old build hashes 404 → "Something went wrong".
  Detect a 500/chunk error early and `page.reload()` / `goto('/')`; ensure the test hits the same
  `webServer` process (zombies hold stale build state).

## Logging / observability

- **Atomic logging survives crashes** (B.450): `winston`/`console.log` buffers are lost on SIGKILL.
  For critical lifecycle events use synchronous `process.stdout.write("[ATOMIC] ⚡ <ctx> <msg>\n")`.
- **High-visibility forensic logs** (B.295): many runners flush `stderr`/high-level streams first —
  `console.warn()` with a distinct emoji is near-universally flushed immediately, so the "heartbeat"
  survives early termination.

## Railway / build

- **Railway security-audit "phantom trap"** (B.610): the flagged vulnerable version may not exist in
  the local lockfile — Railway is scanning a cached manifest layer. Confirm with `npm/pnpm list <pkg>`;
  if clean, force a manifest rewrite and ensure the push actually captured current lockfile state.
- **Build-worker retry exhaustion** (B.612): `Call retries were exceeded` = the build worker OOM'd.
  Throttle (`cpus: 1`, `workerThreads: false`), raise `NODE_OPTIONS=--max-old-space-size=4096`.
- **Framework-fallback strategem** (B.613): when a major upgrade's total migration cost exceeds
  infra/time, revert to the secure-stable N-1 major and re-verify the audit gate — a legitimate move,
  not a failure.

## Codebase intelligence (corroborates this ecosystem's `/codebase`-first doctrine, F.068)

- **Structural graph over regex** (G.IDE.001): regex import-scanning ~65% accuracy, 200–500ms/1000
  files, and misses barrel exports / cross-package symbols; the structural graph is 100% at ~21ms.
  Use graph queries (callers/callees/symbols), never regex, for impact analysis.
- **`multi_replace` failures are usually context starvation, not bad logic** (G.IDE.003): an LLM
  asked to patch a subclass without seeing the base class will hallucinate the constructor. Feed it
  (1) the base class, (2) a recently-succeeded sibling as "evidence of the correct approach", and
  (3) ±15 lines around the symbol definition.

## Algorithm & agent-state hazards (deep-review pass, 2026-06-25)

> Reclaimed in a deep value-benchmark of the wider Gemini silo (24 keyword-flagged candidate
> entries; verdict: almost all dead or superseded — the good parts were already reclaimed above, and
> the rest documents the defunct `uaa2-service` monolith). These few are the genuinely transferable,
> codebase-independent residue, cross-checked as not already in canon. Sources:
> `uaa2_collective_intelligence_pwg_library/gotchas.md` (Apr 2026) and
> `uaa2_production_deployment_and_hardened_ops/overview.md`.

- **Deep-clone the incumbent best in PSO/GA/evolution loops** (G.ARCH.10). `globalBest = { ...particle }`
  shallow-copies — nested arrays like `position` stay shared by reference, so as the particle moves the
  recorded best silently tracks it and the algorithm "forgets" the true optimum. Clone the arrays:
  `globalBest = { ...particle, position: [...particle.position] }`. **Directly relevant to `@evolve_program`**
  (I.023) and any fitness search.
- **Normalize fitness to `[0,1]` before cross-engine comparison** (G.STATS.02). A GA returning raw
  milliseconds and a PSO returning a unitless probability cannot be compared on one scale — the
  orchestrator then selects the wrong "best candidate". Normalize every optimizer's `best_fitness` to
  `[0,1]` (1.0 = perfect). Relevant to the `@evolve_program` verifier-gate's candidate scoring.
- **A fixed regression-slope threshold gives false trends on stable-but-noisy data** (G.STATS.01).
  `[50,51,49,50,51,49,50]` has slope ≈ −0.07 → flagged "decreasing" at a `0.01` threshold despite being
  visually flat. Make the stability threshold configurable (≥0.1 for noisy series) for any
  convergence / trend detection.
- **The "persistence illusion": a `saveState()` that only dehydrates loses data on restart** (G.ARCH.18).
  A `saveState()` returning a serializable object is NOT a disk/DB write — code that does
  `await this.saveState()` and assumes durability silently loses state across restarts. Keep dehydrate
  (serialize) and persist (actually write) as distinct steps, and call the one that writes.
- **Double-key prefix malformation** (G.ENV.08; pairs W.721 / F.106). Copy-pasting from a `.env` into a
  CLI or variable manager yields a recursive value: `OPENAI_API_KEY="OPENAI_API_KEY=sk-..."`. The SDK
  then fails "invalid key" because the prefix is inside the value. Scan for `KEY=KEY` when a key "looks
  right" but is rejected.
- **Ordered, level-verified service startup beats best-effort init** (Slow-Start Protocol). Initialize in
  a deterministic dependency graph — Foundation (logging/config) → Infrastructure (DB/transport) →
  Orchestration → Advanced → Scheduling/loops — and verify each level before starting the next, exposed
  via a `/health/startup` endpoint. Prevents the race / circular-deadlock class of boot failure.

---

_Reclaimed catalog id: be80b802 (Jan 2026, uaa2-service). This file is the transferable subset;
the full source lived only in the Gemini silo. 2026-06-25 deep-review pass added the algorithm/
agent-state section above; the rest of the silo's 24 candidate entries benchmarked as dead/superseded._
