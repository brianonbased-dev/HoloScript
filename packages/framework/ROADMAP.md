# @holoscript/framework Roadmap

> The framework where agents remember, learn, and earn.

## Architecture

The framework is the **canonical home** for all agent logic. Other packages get lighter as framework gets heavier.

```
@holoscript/framework  = types, logic, BT, consensus, knowledge, agents, mesh, economy
@holoscript/mcp-server = thin HTTP layer that imports from framework (routes only, no logic)
@holoscript/core       = compilers, traits, parser, physics (NOT agent logic)
agent-protocol         = absorbed into framework, eventually deprecated
agent-sdk              = absorbed into framework, eventually deprecated
```

Every phase below has two parts: **absorb** (move logic into framework) and **shed** (delete from source package, replace with import).

---

## Current State (v0.1.0 + v0.2 partial)

**Absorbed:**
- `defineAgent()` / `defineTeam()` — fluent builders
- `Team.runCycle()` with 7-phase `ProtocolAgent` (INTAKE through EVOLVE)
- `GoalSynthesizer` — agents synthesize goals when board is empty
- `Team.addTasks()` / `scoutFromTodos()` — board population with dedup
- `Team.propose()` — consensus voting via LLM
- `Team.suggest()` / `vote()` / `suggestions()` — team improvement proposals
- `Team.setMode()` / `derive()` / `presence()` / `heartbeat()` — board features
- `Team.leaderboard()` — reputation (newcomer -> contributor -> expert -> authority)
- `KnowledgeStore` — W/P/G with search, compounding, persistence, remote sync
- `callLLM()` — provider-agnostic (Anthropic, OpenAI, xAI, OpenRouter)
- `BehaviorTree` — full node classes (Sequence, Selector, Action, Condition, etc.)
- `ProtocolAgent` / `runProtocolCycle()` — 7-phase BaseAgent backed by LLM
- Re-exports: BaseAgent, GoalSynthesizer, MicroPhaseDecomposer, PWG types

**Shed so far:**
- `board-tools.ts` handleBoardAdd + handleScout -> framework
- `team-coordinator.ts` runAgentCycle -> framework Team.runCycle

**Tests:** 54 framework + 1265 mcp-server

---

## Phase 1: Absorb agent-protocol (v0.2.0)

Move all agent-protocol logic into framework. agent-protocol becomes a re-export shim.

| Absorb into framework | Delete from agent-protocol | Effort |
|-----------------------|---------------------------|--------|
| Move `BaseAgent` class + 7-phase `runCycle` | Replace with `export { BaseAgent } from '@holoscript/framework'` | M |
| Move `GoalSynthesizer` class | Replace with re-export | S |
| Move `MicroPhaseDecomposer` class (topo sort, parallel exec) | Replace with re-export | S |
| Move `BaseService` + `ServiceLifecycle` + `ServiceError` | Replace with re-export | S |
| Move PWG types (Pattern, Wisdom, Gotcha, PWGSeverity) | Replace with re-export | S |
| Move `PhaseResult`, `CycleResult`, `AgentIdentity` types | Replace with re-export | S |
| Wire `MicroPhaseDecomposer` into Team for complex task decomposition | N/A (new wiring) | M |
| **agent-protocol/src/index.ts becomes:** `export * from '@holoscript/framework'` | Full package hollowed | S |

---

## Phase 2: Absorb board logic from mcp-server (v0.3.0)

Move board state management into framework. mcp-server routes become thin HTTP handlers.

| Absorb into framework | Delete from mcp-server | Effort |
|-----------------------|------------------------|--------|
| Move `TeamTask`, `DoneLogEntry`, `TeamSuggestion` types + logic | http-routes.ts drops inline types, imports from framework | M |
| Move board CRUD logic (add, claim, done, block, reopen, dedup) | http-routes.ts handlers become `team.X()` calls | M |
| Move suggestion logic (create, vote, auto-promote, auto-dismiss) | http-routes.ts suggestion handlers become `team.X()` calls | M |
| Move task derivation parser (checkboxes, headers, grep TODO/FIXME) | http-routes.ts derive handler becomes `team.derive()` call | S |
| Move scout endpoint logic into framework `Team.scout()` | http-routes.ts scout handler becomes `team.scout()` call | S |
| Move `ROOM_PRESETS` (audit/research/build/review) into framework | http-routes.ts mode handler imports presets from framework | S |
| Move `TeamAgentProfile` definitions (Brittney, Daemon, Absorb, Oracle) | team-agents.ts becomes re-export shim | S |
| Move `team-coordinator.ts` remaining functions (assign, compound, query) | Delete file, import from framework | M |
| Move done-log audit logic (commit verification, duplicate detection) | http-routes.ts audit handler imports from framework | S |
| **board-tools.ts becomes:** all handlers call `team.X()`, zero logic | Full file is thin wrappers | S |

---

## Phase 3: Absorb mesh + networking from agent-sdk (v0.4.0)

Move P2P and discovery logic into framework. agent-sdk becomes a re-export shim.

| Absorb into framework | Delete from agent-sdk | Effort |
|-----------------------|----------------------|--------|
| Move `MeshDiscovery` (peer detection, stale pruning, heartbeat) | Replace with re-export | M |
| Move `SignalService` (capability broadcast) | Replace with re-export | M |
| Move `GossipProtocol` (anti-entropy, dedup hashing, delta sync) | Replace with re-export | M |
| Move `AgentCard` (A2A interop metadata) | Replace with re-export | S |
| Move `MCP_TOOL_SCHEMAS` for knowledge ops | Replace with re-export | S |
| Add `team.peers()` — list discovered peers with reputation | N/A (new API) | S |
| Add agent-to-agent direct messaging on Team | N/A (new API) | M |
| **agent-sdk/src/index.ts becomes:** `export * from '@holoscript/framework'` | Full package hollowed | S |

---

## Phase 4: Absorb knowledge brain from mcp-server (v0.5.0)

Move the CRDT consolidation engine and knowledge intelligence into framework.

| Absorb into framework | Delete from mcp-server | Effort |
|-----------------------|------------------------|--------|
| Move `DOMAIN_HALF_LIVES` + `DomainConsolidationConfig` | holomesh/types.ts drops these, imports from framework | S |
| Move `ExcitabilityMetadata` + scoring formula | holomesh/types.ts drops, imports from framework | S |
| Move consolidation cycles (sleep/wake, promote/evict/merge) | crdt-sync.ts consolidation engine moves to framework | L |
| Move `HotBufferEntry` + hot buffer management | crdt-sync.ts buffer logic moves to framework | M |
| Add vector embedding pipeline (delegate to orchestrator pgvector) | N/A (new integration) | M |
| Add cross-domain pattern surfacing in KnowledgeStore | N/A (new logic) | M |
| Add contradiction detection + resolution | N/A (new logic) | M |
| Add provenance chain (author -> task -> cycle -> verification) | Wire existing `provenanceHash` into StoredEntry | S |

---

## Phase 5: Absorb economy from core (v0.6.0)

Move payment, bounty, and marketplace logic into framework. Core keeps only compilers/traits/parser.

| Absorb into framework | Delete from core | Effort |
|-----------------------|------------------|--------|
| Move `PaymentGateway` (x402, USDC settlement) | core/economy drops, imports from framework | L |
| Move `RevenueSplitter` (bigint exact, sum=total invariant) | core/economy drops, imports from framework | M |
| Move `InvisibleWallet` (env/keystore/AgentKit) | core/economy drops, imports from framework | M |
| Add distributed task claiming with conflict resolution | N/A (new logic on top of existing board API) | M |
| Add skill-based routing (match task to best agent by capabilities) | Wire existing ClaimFilter + capabilities | M |
| Add cross-team delegation (`team.delegate(otherTeam, taskId)`) | N/A (new API) | M |
| Add bounty system (tasks with USDC rewards, payout on completion) | Wire existing bounty team architecture | L |

---

## Phase 6: Self-Improvement (v1.0.0)

The framework can improve itself.

| Task | Source | Effort |
|------|--------|--------|
| Wire absorb — scan framework's own codebase, find improvements | absorb.holoscript.net service | M |
| Auto-test generation via absorb pipeline | absorb.holoscript.net `absorb_run_pipeline` | M |
| Prompt optimization — A/B test system prompts, converge on best | LLM adapter + KnowledgeStore | M |
| Framework evolution — agents propose + vote + ship API changes | suggest() + propose() already in framework | S |

**v1.0 Sprint:** The framework's own agents can propose, vote on, and ship improvements to themselves.

---

## Post-v1.0: Package Cleanup

Once framework is the canonical home, deprecated packages become shims:

| Package | Becomes | Action |
|---------|---------|--------|
| `@holoscript/agent-protocol` | `export * from '@holoscript/framework'` | Keep for backward compat, mark deprecated |
| `@holoscript/agent-sdk` | `export * from '@holoscript/framework'` | Keep for backward compat, mark deprecated |
| `@holoscript/core` | Compilers + traits + parser only | Delete agent/BT/consensus/economy modules |
| `@holoscript/mcp-server` | HTTP routes only, zero logic | All handlers call `team.X()` |

---

## Sizing

| Size | Meaning |
|------|---------|
| **S** | Move + delete + re-export. Hours. |
| **M** | Move + refactor + tests. 1-2 days. |
| **L** | Architecture change + integration tests. 3-5 days. |

## Principles

1. **Absorb, then shed.** Move logic into framework, delete from source, replace with import.
2. **Framework is the canonical home.** If it's agent logic, it lives here. Period.
3. **Other packages get lighter.** Every phase should reduce LOC in mcp-server/core/agent-protocol/agent-sdk.
4. **Local-first, server-optional.** Everything works in-process. Remote is an upgrade.
5. **Knowledge is the product.** Output is the side effect. Every operation compounds knowledge.
6. **The team gets smarter over time.** This is the north star. If a feature doesn't compound, it doesn't ship.
