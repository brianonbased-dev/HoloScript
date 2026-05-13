# Premium MMO Shard Architecture Targets

> **Scope:** Define multi-shard orchestration targets for HoloLand at MMO scale.
> **Grounding:** Built on Frontier Shard primitives (`Shard`, `Zone`, `Encounter`, `Quest`, `Item`, `Skill`, `LootTable`) declared in `packages/framework/src/board/frontier-shard.ts` and bootstrapped in `packages/hololand-platform/src/world/frontier-shard-zero.ts`.
> **Task:** task_1778616474061_1ede
> **Date:** 2026-05-12

---

## 1. Player Density Targets

| Tier | Agents per Zone | Zones per Shard | Agents per Shard | Simultaneous Encounters |
|------|-----------------|-----------------|------------------|------------------------|
| Free / Base | 64 | 4 | 256 | 32 |
| Premium | 256 | 16 | 4,096 | 256 |
| Ultra (guild-owned) | 1,024 | 64 | 65,536 | 2,048 |

**Zone is the unit of spatial cohesion.** An agent is bound to exactly one Zone at a time. The Zone's `encounterIds` array determines which encounters are armed; encounter trigger evaluation is O(1) per agent state change (enter, interact, quest-step, timer, broadcast).

**Shard is the unit of deterministic replay.** A ShardReceipt seals the entire primitive graph. At 65K agents, the shard hash must still compute in <100ms so validation receipts can be produced at 1Hz for the live shard state.

**Constraint:** `validateShard` cross-reference integrity (zone→encounter→lootTable→item/skill) is currently O(N*M) where N = primitive count. For Ultra tier, this must be pre-computed into indexed lookup tables at shard load time, not validated per tick.

---

## 2. Premium Tier Differentiation

Premium tiers gate content through existing primitives — no new primitive types required.

### 2.1 Exclusive Zones
- Gate: Zone metadata field `tierGate: 'premium' | 'ultra'`
- Runtime enforcement: agent's subscription tier (stored outside the shard, injected at session start) is checked before `on-enter` trigger evaluation.
- Example: `zone_guild_vault` with `biome: 'liminal'` and `metadata: { tierGate: 'ultra' }` — only Ultra subscribers can enter.

### 2.2 Exclusive Encounters
- Gate: Encounter metadata field `tierGate` + `requiredSubscription`.
- The encounter's trigger is armed only if the agent's tier passes the gate. Agents below the tier see the zone geometry but the encounter is silent (no trigger, no loot table roll).

### 2.3 Elevated Loot Table Weights
- Premium agents receive a weight multiplier applied at `LootTable` roll-time.
- Implementation: the `LootTableEntry.weight` is baseline; the runtime applies `effectiveWeight = weight * (1 + tierBonus)` where `tierBonus` is 0.0 (Free), 0.5 (Premium), 2.0 (Ultra).
- The `condition` field on `LootTableEntry` can already express per-agent predicates — e.g. `condition: 'tier>=premium'`.

### 2.4 Premium-Only Skills and Items
- `Skill.rarity` already has `legendary` and `skill-other`. Premium-exclusive skills use `rarity: 'legendary'` with a `prerequisites` chain that includes a subscription-bound synthetic skill (e.g. `skill_subscription_premium`).
- `Item.category` already supports `artifact`, `equipment`, `cosmetic`. Premium cosmetics are `category: 'cosmetic'` with `metadata: { tierGate: 'premium' }`.

**Key insight:** The primitive schema already carries every field needed for premium gating. The runtime only needs a subscription-state injection point and a predicate evaluator for `metadata.tierGate` and `LootTableEntry.condition`.

---

## 3. Cross-Shard Interaction Patterns

Shards are intentionally isolated for determinism. Cross-shard interaction is async, message-based, and receipt-verified.

### 3.1 Pattern A: Shard Transfer (Agent Migration)
1. Source shard serializes the agent's durable state (`DurableAgentState` from `HoloScriptAgentRuntime`) into a signed transfer payload.
2. Target shard validates the signature and receipt hash against the ShardReceipt of the source shard.
3. Target shard re-hydrates the agent via `HoloScriptAgentRuntime.hydrate(seed, parentRuntime)`.
4. Target shard runs a `on-enter` encounter (e.g. `enc_welcome_back`) that injects the agent into the new zone.

**Constraint:** `LosableAgentState` (reactive state, running actions, raw episodes) is NOT transferred. The agent arrives "fresh" — deliberate design to prevent state synchronization complexity across shards.

### 3.2 Pattern B: Cross-Shard Broadcast (Global Events)
- A named broadcast channel (e.g. `global:market_crash`) is published by an orchestrator.
- Each shard's runtime evaluates `Encounter` triggers of kind `on-broadcast` against the channel name.
- Delivery is at-least-once; shards that are full or locked drop the broadcast with a nack. The orchestrator retries with exponential backoff.

### 3.3 Pattern C: Shared Economy (Cross-Shard LootTable)
- A `LootTable` can reference an `Item` whose `provenance` points to a different shard's receipt hash.
- The runtime verifies the provenance hash at load time, not at roll time.
- This enables "cross-shard currency" or "server-wide event artifacts" without real-time coupling.

### 3.4 Pattern D: Guild Shard (Ultra Tier)
- Guilds at Ultra tier receive a dedicated shard instance (`shard_guild_<guildId>`).
- The guild shard inherits from a template shard (same schemaVersion, cloned primitives) and overlays guild-specific zones, encounters, and loot tables.
- Guild shard ownership is recorded in the shard `metadata: { ownerGuildId, ownerAgentId }`.

---

## 4. Shard Scaling Boundaries

### 4.1 When to Split a Shard
A shard must split when ANY of the following thresholds are breached for >30 seconds:

| Metric | Threshold |
|--------|-----------|
| Active agents | 80% of tier capacity |
| Armed encounters | 90% of tier capacity |
| Tick duration (simulation step) | >50ms |
| Validation receipt generation | >200ms |
| Cross-zone broadcast latency (p99) | >100ms |

### 4.2 Shard Split Mechanics
1. **Zone affinity split:** Zones are partitioned into two shards by biome affinity (e.g. urban vs wilderness). Agents in zones that move to the new shard are migrated via Pattern A.
2. **Horizontal duplicate:** The same shard template is instantiated as `shard_oasis_0_a` and `shard_oasis_0_b`. New agents are assigned round-robin. Existing agents stay put. This is the preferred split for free/base shards because it requires zero content change.
3. **Vertical slice:** Quest chains are split across shards (e.g. early quests on shard A, endgame quests on shard B). Requires `QuestStep` to reference encounters on a different shard via `provenance` — currently unsupported; needs `crossShardEncounterRef` field.

### 4.3 Shard-of-Shards (Cluster)
At Ultra scale, a single logical world is a **cluster** of shards sharing:
- A global `LootTable` for economy-wide currency.
- A broadcast mesh for `on-broadcast` encounters.
- A shared agent registry (wallet → current shard mapping).

The cluster envelope is NOT a `Shard` primitive. It is a runtime construct managed by the orchestrator.

---

## 5. Load Balancing Strategies

### 5.1 Agent Assignment
1. **Preference-weighted round-robin:** Agent expresses zone preference (e.g. `biome: 'urban'`). The orchestrator routes to the shard with the lowest load among shards that have urban zones.
2. **Guild affinity:** All agents with the same `ownerGuildId` in their agent seed are routed to the guild shard (Pattern D). If the guild shard is full, enqueue rather than overflow — guilds pay for capacity.
3. **Tier priority:** Ultra agents preempt Free agents during assignment if a shard is near capacity. Preempted Free agents are migrated to a horizontal duplicate via Pattern A.

### 5.2 Overflow Handling
- When a shard hits 95% capacity, it enters **soft-lock**: new `on-enter` encounters are queued, not fired. Agents already in the zone continue normally.
- At 100% capacity, the shard enters **hard-lock**: no new agent migrations accepted. Broadcasts are still consumed (they don't add agents).
- Overflow agents are redirected to the horizontal duplicate with a UI message: "The Oasis is full — you've been routed to Oasis B."

### 5.3 Hot-Zone Mitigation
- A zone with >80% of its agent capacity is flagged **hot**.
- Hot zones trigger an automatic horizontal split: the zone is cloned into `zone_market_square_a` and `zone_market_square_b`, each on a different shard.
- Agents are evenly distributed between the clones. The original zone is retired (no new agents routed there; existing agents migrate out over 60 seconds).

---

## 6. Implementation Path

### 6.1 Primitives — No Changes Required
The existing `Shard`, `Zone`, `Encounter`, `Quest`, `Item`, `Skill`, `LootTable` schema already supports:
- Tier gating via `metadata` and `condition`.
- Cross-reference integrity via `provenance`.
- Deterministic replay via `hash` + `hashAlgorithm`.
- Clone + validate for testing and A/B.

### 6.2 Primitives — Extensions Needed
| Extension | Primitive | Field | Why |
|-----------|-----------|-------|-----|
| Cross-shard encounter ref | `QuestStep` | `crossShardEncounterRef?: { shardId, encounterId }` | Vertical slice (§4.2) |
| Zone capacity cap | `Zone` | `maxAgents?: number` | Hard boundary for hot-zone mitigation |
| Shard tier tag | `Shard` | `tier: 'free' | 'premium' | 'ultra'` | Orchestrator routing |
| Transfer cooldown | `Shard` metadata | `agentTransferCooldownMs?: number` | Prevent shard-hopping spam |

### 6.3 Runtime — New Components
| Component | Responsibility |
|-----------|--------------|
| `ShardOrchestrator` | Assignment, split decisions, broadcast mesh |
| `AgentTransferService` | Pattern A migration: serialize, sign, hydrate |
| `TierPredicateEvaluator` | Evaluates `metadata.tierGate` and `LootTableEntry.condition` against agent subscription state |
| `HotZoneSplitter` | Monitors zone density, triggers horizontal clone + retire |
| `ClusterEnvelope` | Manages shard-of-shards: global loot tables, shared registry |

### 6.4 Validation — Canary Coverage
The canary harness (`scripts/canary-harness.mjs`) should grow probes for:
- `mmo-shard-split`: simulate 120% capacity and assert soft-lock → hard-lock → split within 5s.
- `mmo-agent-transfer`: assert Pattern A round-trip (serialize, migrate, hydrate) produces identical `DurableAgentState`.
- `mmo-tier-gate`: assert Premium zone rejects Free agent `on-enter`.
- `mmo-hot-zone`: assert zone clone fires when density >80%.

---

## 7. Success Criteria

1. **Base tier** (256 agents/shard) runs deterministically at 60Hz simulation tick on a single Railway instance.
2. **Premium tier** (4,096 agents/shard) runs at 30Hz tick on the same instance class with batch concurrency (batchSize = 3 in `runInBatches`).
3. **Ultra tier** (65,536 agents) requires a cluster of 16 Premium shards with <50ms cross-shard broadcast latency (p99).
4. **Shard split** from 100% to two 50% shards completes in <5 seconds without agent perceptible downtime.
5. **Agent transfer** (Pattern A) serializes, signs, and hydrates in <200ms end-to-end.
6. **Premium gating** adds <1ms per `on-enter` trigger evaluation.

---

## 8. References

- `packages/framework/src/board/frontier-shard.ts` — canonical primitives with validation and cloning
- `packages/hololand-platform/src/world/frontier-shard-zero.ts` — bootstrap shard example
- `packages/core/src/HoloScriptAgentRuntime.ts` — `DurableAgentState`, `LosableAgentState`, `hydrate()`
- `scripts/canary-harness.mjs` — probe runner with `runInBatches`, retry, timeout, and secret redaction
