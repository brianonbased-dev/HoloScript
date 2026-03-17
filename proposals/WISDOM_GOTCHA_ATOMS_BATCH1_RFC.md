# RFC: Wisdom/Gotcha Atoms Batch 1 (Memory + Resilience Core)

## Status

Proposed - v1

## Authors

- HoloScript Core Contributors
- Spatial Intelligence Working Group

## Summary

This RFC defines the first production batch of wisdom/gotcha atoms as composable meta-traits:

1. `@memory_crystal`
2. `@recall_trigger`
3. `@forget_policy`
4. `@versioned_state`
5. `@world_heartbeat`
6. `@circuit_auto_reset`

These six atoms establish a stable substrate for persistent memory, retrieval discipline, safe forgetting, branchable state, global synchronization, and failure recovery.

## Motivation

HoloScript already encodes many implicit reliability patterns across parser/runtime/compiler/tooling layers. This RFC makes those patterns explicit and enforceable as trait-level declarations.

Key outcomes:

- Persistent intelligence can be declared in-scene, not only in infrastructure.
- Failure modes become machine-checkable gotchas instead of tribal knowledge.
- Studio/LSP/MCP can surface reliability posture directly from composition metadata.

## Scope

In scope:

- Trait signatures and semantics for Batch 1 atoms
- Compiler validation checks for each atom
- Runtime behavior contracts and event hooks
- Interactions between atoms (compatibility matrix)

Out of scope:

- DAO voting semantics for wisdom updates (covered in governance RFC)
- Film3-specific rendering controls (covered in narrative batch)
- Python package extras implementation details

## Trait Specifications

### 1) `@memory_crystal`

#### Signature

```holo
@memory_crystal {
  capacity: "semantic" | "raw" | "time-window",
  prune_threshold: number,        // 0.0..1.0
  backend: "ipfs" | "kv"
}
```

#### Semantics

- Declares a memory store attached to an object, group, or composition.
- `semantic` capacity stores embeddings/summaries keyed by relevance.
- `raw` capacity stores full artifacts until policy pruning.
- `time-window` capacity keeps a sliding TTL window.

#### Gotcha Guarded

- Unbounded memory growth causes latency and cost blowups.

#### Compiler Checks

- `prune_threshold` must be in `[0, 1]`.
- `capacity="semantic"` requires embedding-capable backend adapter at target.
- Emit warning if no paired `@forget_policy` exists in same scope.

#### Runtime Hooks

- `@onMemoryWrite`
- `@onMemoryPrune`

---

### 2) `@recall_trigger`

#### Signature

```holo
@recall_trigger {
  query: string,
  min_confidence: number,         // 0.0..1.0
  max_results?: number            // default 5
}
```

#### Semantics

- Triggers proactive recall when bound event/context pattern matches.
- Recall output is written to blackboard/state channel for downstream traits.

#### Gotcha Guarded

- Low-confidence retrieval spam can derail agents.

#### Compiler Checks

- `min_confidence` must be in `[0, 1]`.
- `query` must be non-empty.
- `max_results` must be `>= 1` if present.

#### Runtime Hooks

- `@onRecallStart`
- `@onRecallHit`
- `@onRecallMiss`

---

### 3) `@forget_policy`

#### Signature

```holo
@forget_policy {
  after: string,                  // duration, e.g. "30d"
  when: string,                   // predicate, e.g. "relevance < 0.2"
  audit: boolean
}
```

#### Semantics

- Applies deterministic retention/deletion policy to memory-bearing scopes.
- `audit=true` appends immutable deletion records to audit log channel.

#### Gotcha Guarded

- Accidental permanent deletion with no accountability.

#### Compiler Checks

- `after` must parse as valid duration.
- `when` must parse as supported predicate expression.
- If `audit=false`, emit warning for production profile.

#### Runtime Hooks

- `@onForgetEvaluate`
- `@onForgetApply`

---

### 4) `@versioned_state`

#### Signature

```holo
@versioned_state {
  strategy: "crdt" | "manual",
  branches: number                // >= 1
}
```

#### Semantics

- Enables branchable state history with explicit merge behavior.
- `crdt` strategy auto-resolves concurrent updates.
- `manual` strategy creates merge-required checkpoints.

#### Gotcha Guarded

- Merge conflict cascades in collaborative edits.

#### Compiler Checks

- `branches >= 1` and bounded by target profile max.
- If strategy is `manual` in multiplayer target, emit warning.
- If strategy is `crdt`, verify CRDT runtime capability on target.

#### Runtime Hooks

- `@onStateBranchCreate`
- `@onStateMerge`
- `@onStateConflict`

---

### 5) `@world_heartbeat`

#### Signature

```holo
@world_heartbeat {
  interval_ms: number,            // >= 100
  redundancy: number              // >= 1
}
```

#### Semantics

- Emits global pulse events to synchronize distributed systems.
- `redundancy` provisions parallel emitters to avoid SPOF behavior.

#### Gotcha Guarded

- Single heartbeat emitter failure desynchronizes world services.

#### Compiler Checks

- `interval_ms >= 100` (hard floor).
- `redundancy >= 1`.
- If `redundancy=1` in distributed targets, emit warning.

#### Runtime Hooks

- `@onHeartbeatTick`
- `@onHeartbeatFailover`

---

### 6) `@circuit_auto_reset`

#### Signature

```holo
@circuit_auto_reset {
  backoff_base: number,           // >= 1
  max_attempts: number            // >= 1
}
```

#### Semantics

- Wraps failing operation channels in exponential backoff retry policy.
- On repeated failure, transitions to open state and emits alert.
- Auto-resets after cooldown and successful probe.

#### Gotcha Guarded

- Silent retries can mask persistent failures and create cascading outages.

#### Compiler Checks

- `backoff_base >= 1`.
- `max_attempts >= 1`.
- In production profile, require logging/alert sink binding.

#### Runtime Hooks

- `@onCircuitOpen`
- `@onCircuitRetry`
- `@onCircuitReset`

## Cross-Atom Semantics

### Compatibility Matrix

| Pair | Outcome | Rule |
| --- | --- | --- |
| `@memory_crystal` + `@forget_policy` | Recommended | Enables bounded persistent memory |
| `@recall_trigger` + `@memory_crystal` | Required for semantic recall | Compiler error if no memory source in scope |
| `@versioned_state(strategy="crdt")` + multiplayer/networked traits | Recommended | Conflict-safe edits |
| `@world_heartbeat` + `@circuit_auto_reset` | Recommended | Synchronization plus resilient retries |

### Ordering Rule

- If co-declared on one object, evaluation order is:
  1. `@world_heartbeat`
  2. `@recall_trigger`
  3. domain behavior traits
  4. `@forget_policy`

## Compiler Enforcement Profile

### Development

- Structural checks: errors
- Missing best-practice pairings: warnings

### Production (`--enforce-gotchas`)

- Missing required pairings: errors
- Unsafe low-redundancy heartbeat in distributed targets: error
- Non-audited forget policy in regulated targets: error

## CLASS Handler Extensions

Additions aligned with existing CLASS upgrade path:

- `@onMemoryWrite`
- `@onMemoryPrune`
- `@onRecallStart`
- `@onRecallHit`
- `@onRecallMiss`
- `@onForgetEvaluate`
- `@onForgetApply`
- `@onStateBranchCreate`
- `@onStateMerge`
- `@onStateConflict`
- `@onHeartbeatTick`
- `@onHeartbeatFailover`
- `@onCircuitOpen`
- `@onCircuitRetry`
- `@onCircuitReset`

## Test Plan

### Parser

- Accept all six atom signatures and config variants.
- Reject out-of-range numeric values and invalid duration predicates.

### Compiler

- Validate pairing errors/warnings for missing memory source or retention policy.
- Validate target capability checks for CRDT and semantic backends.

### Runtime

- Heartbeat failover behavior under emitter kill.
- Circuit open/reset transitions with deterministic retry schedules.
- Forget-policy audit emission correctness.

## Migration Strategy

- Non-breaking introduction: all atoms opt-in.
- Existing compositions remain valid.
- Suggested codemod can add `@forget_policy` where `@memory_crystal` is detected.

## Open Questions

1. Should `@memory_crystal(capacity="raw")` be disallowed in constrained mobile targets by default?
2. Should `@world_heartbeat(redundancy=1)` be hard-error in clustered deployments?
3. Should `@recall_trigger` support a cooldown key to prevent trigger storms?

## Related Work

- `proposals/WISDOM_AND_GOTCHA_TRAITS_v1.md`
- `proposals/DAO_Governance_v1.md`
- `proposals/Geospatial_Climate_Twin_RFC.md`
