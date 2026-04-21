# Causal UI testing — research / design memo

**Board:** `task_1776385413023_r0b3`  
**Source:** `~/.ai-ecosystem/research/2026-02-26_embodied-ai-8-research-cycles-phase7-autonomize.md` (TODO 6)

## Intent

Treat **UI behavior** as a **structural causal model (SCM)** over **observable variables** (props, UI state, URL/query, feature flags, async outcomes) so tests can ask **counterfactuals**: “If we had set *X* differently while holding ancestors fixed, would *Y* still occur?” The goal is **targeted edge-case generation** and **regression explanations**, not replacing snapshot or interaction tests wholesale.

This memo is **design-only**—no implementation shipped here.

## Scope correction (monorepo)

The source doc proposes `packages/frontend/src/testing/causal.ts`. This repository **does not** have a root `packages/frontend` app; UI surfaces live in packages such as:

| Surface | Package | Test stack (typical) |
|--------|---------|----------------------|
| Studio | `packages/studio` | Vitest, Testing Library, Playwright |
| Visual editor | `packages/visual` | Vitest, Testing Library |
| Marketplace web | `packages/marketplace-web` | Vitest, Testing Library |
| Agent SDK | `packages/react-agent-sdk` | Vitest, Storybook |

Any future `causal.ts` (or `@holoscript/causal-ui-testing`) should be **extracted as a small shared dev-only package** or live under `packages/devtools/` once boundaries are clear—**not** assumed to sit under a non-existent `frontend` tree.

## Problem statement

Classical UI tests excel at **replaying scripts** (“click A then expect B”). They under-explore **combinations** of inputs and **hidden conditioning paths** (race ordering, suspense, focus traps, optimistic UI). A **declarative graph** over variables makes it possible to:

1. Enumerate **minimal interventions** (do-operators) that flip an outcome.
2. Flag **ambiguous tails** where the same assertion could pass for multiple reasons (weak identifiability).
3. Attach **failure explanations** (“counterfactual passing run would require *Z* false”).

## Causal view of a component

**Endogenous variables** (examples):

- Controlled props and derived props.
- Internal state (useState, reducers, stores).
- DOM-accessible outcomes: visibility, `aria-*`, text, disabled flags.
- Side-channel outcomes: network mock call counts, navigation calls.

**Exogenous / policy variables**:

- Feature flags, theme, locale, time (fake timers), viewport.

**Directed edges** (hypothesis): prop / parent state → child state → DOM outcome; user events → state; async resolution → state. Cycles exist in reality (controlled inputs); for **testing** we usually **collapse** to a **snapshot DAG per step** or use **time-sliced** acyclic expansions.

## Architecture (phased)

### Phase A — Document the SCM by convention (no solver)

- Per feature area, maintain a **markdown or JSON** “variable inventory”: names, type, how set (prop, event, mock), and **assertions** that read them.
- Tests stay standard Vitest + Testing Library; the value is **shared vocabulary** for reviewers and agents.

### Phase B — Static scaffold from types + exports

- Optional TypeScript transformer or build plugin listing **public props** and **discriminated unions** to seed edges (“when `variant=destructive`, `aria-live` must be…”).
- Output: generated **graph skeleton** checked into `__meta__/` or emitted in CI as an artifact for diff review.

### Phase C — Trace-driven edges (developer machine / CI)

- Instrument tests with a thin **event ledger** (dispatch userEvent, flush promises, read DOM) to learn **empirical dependencies** between variables for a scenario.
- Use ledger to suggest **new counterfactual cases** (flip one binary prop, hold context).

### Phase D — Full counterfactual harness

- Given SCM fragment + test shell, generate **candidate interventions** and run ** Vitest parametrizations** with budgets (max cases, timeout).
- Integrate with Playwright for **post- unit** flows only when graph spans real navigation.

## Integration points today

- **Vitest**: parametrized `test.each`, custom **test seeds**, fake timers — natural execution layer.
- **Testing Library**: queries map well to **outcome variables**; prefer role/name queries as **stable measurement operators**.
- **Playwright** (Studio): end-to-end **constraints** that the SCM cannot model statically (full browser policy) should stay **separate layer**, linked by IDs in the memo/graph doc.

## Risks and limits

- **Identifiability:** Without randomized experiments, many UI paths are **observationally equivalent**. The harness must **mark ambiguous edges** and avoid claiming causation where only correlation was logged.
- **Flakiness:** Async and animation encode **hidden time variables**; causal statements must gate on **deterministic harness** (fake timers, `waitFor` contracts).
- **Maintenance cost:** Graphs rot unless **generated or enforced in CI**. Prefer Phase B/C automation over hand-drawn DAGs for large surfaces.

## Success criteria (from source audit — engineering interpretation)

| Source KPI | Pragmatic proxy |
|------------|-----------------|
| 100+ counterfactual cases | Parametrized test rows + CI-generated combinations from a small SCM per package |
| 20+ novel edge bugs | Tracked issues with “causal case id” linking to graph node(s) — not claimed without triage |

## What remains after this memo

- Pick **one pilot surface** (e.g. Studio settings panel or `react-agent-sdk` Storybook story) for Phase A inventory.
- Decide **package home** for shared types (`CausalVariable`, `Intervention`) and whether it ships as `@holoscript/causal-ui-testing` (devDependency only).
- Prototype Phase B generator scope (props-only vs props + zustand store keys).
