# Reusable Capability Schema Proposal

> **Date**: 2026-05-14
> **Status**: Phase 1 landed — canonical types, validators, type guards, deep-clone utilities, and 25 unit tests shipped in `packages/framework/src/capability/`
> **Scope**: Reusable substrate for HoloScript Core. HoloLand-specific UX remains in HoloLand.

## 1. Problem Statement

The HoloScript framework had four colliding capability definitions:

| Location | Shape | Fields | Collision |
|---|---|---|---|
| `agents/AgentManifest.ts` | `AgentCapability` | 12 (cost, latency, inputs, output, …) | Name collision with mesh |
| `mesh/index.ts` | `AgentCapability` | 3 (id, name, kind) | Name collision with agents |
| `board/agent-steward.ts` | `StewardCapability` | 4 (kind, label, requiredSkillIds) | Ad hoc, no canonical type |
| `holoshell-human-os-frontier` | `.hsplus` capability blocks | N/A (no TS type) | No canonical TS counterpart |

The mesh/agent name collision caused real import ambiguity. Steward and Shell capabilities had no shared spine. Every domain reinvented identifiers, validation, and cloning.

## 2. Design

### 2.1 Base Spine

Every capability in the ecosystem extends `Capability`:

```ts
export interface Capability {
  id: string;              // `<context>:<kind>:<name>`
  name: string;
  description?: string;    // ~200 char convention
  version?: string;          // semantic version of this definition
  kind: CapabilityKind;
  domain?: string;         // cross-cutting label: 'vision', 'nlp', 'spatial'
  metadata?: Record<string, unknown>;
}
```

Base intentionally omits runtime/operational fields. Those live in extensions.

### 2.2 Extensions

| Extension | File | Adds | Replaces |
|---|---|---|---|
| **Agent** | `Capability.ts` | `cost`, `latency`, `inputs`, `output`, `available`, `priority` | 12-field `AgentCapability` from `agents/AgentManifest.ts` |
| **Steward** | `Capability.ts` | `kind: StewardCapabilityKind`, `label`, `requiredSkillIds` | Ad hoc `StewardCapability` from `board/agent-steward.ts` |
| **Shell** | `Capability.ts` | `agentSource`, `trustState`, `permissions`, `receiptExpectation`, `replacementPath` | No prior TS type; counterpart to `.hsplus` blocks |
| **Mesh / A2A** | `Capability.ts` | `tags?: string[]` | 3-field mesh `AgentCapability` (renamed to `MeshCapability`) |

The name collision is resolved by renaming the mesh minimal shape to `MeshCapability`.

### 2.3 Type Guards

```ts
isAgentCapability(cap)    // true if cost | latency | inputs | output present
isStewardCapability(cap)  // true if kind ∈ STEWARD_KINDS
isShellCapability(cap)    // true if agentSource + permissions + receiptExpectation present
isMeshCapability(cap)     // true if it lacks fields from richer extensions
```

Mesh is the minimal extension — it positively matches only when no richer extension claims the object.

### 2.4 Validators

Every extension carries a `validate*` function that returns `string[]` of errors. Empty array means valid. Validators compose: `validateAgentCapability` calls `validateCapability` first, then checks agent-specific fields.

### 2.5 Deep Cloning

Every extension carries a `clone*` function that produces a structurally independent copy. Nested objects (`cost`, `permissions`, `receiptExpectation`, `metadata`) are shallow-cloned so mutations to the clone do not propagate to the original.

### 2.6 Re-exports

`packages/framework/src/capability/index.ts` is the canonical barrel. Consumers import everything from `@holoscript/framework/capability` without reaching into `agents/` or `mesh/` internals.

## 3. Receipt Linker (Phase 1 Pilots)

Two absorption receipt pilots ship alongside the schema:

| Pilot | File | Trust Floor | Evidence |
|---|---|---|---|
| **Browser** | `board/holoshell-browser-receipts.ts` | `external` | Screenshots, network log (HAR), cookie/session audit, action sequence |
| **Local CLI** | `board/holoshell-cli-receipts.ts` | `known` | Exit code, stdout/stderr hashes, lockfile diff, build artifact hash, action sequence |

Both pilots use the same policy envelope pattern:

1. **Policy** constrains what the automation session may do (allowed domains/binaries, blocked paths, max duration).
2. **Receipt** is the deterministic, auditable record produced after execution.
3. **Provenance** links the receipt back to the task / commit that produced it.
4. **Verification commands** can reproduce the automation independently.

The receipt schema mirrors the legacy absorption path taxonomy documented in `experiments/holoshell-human-os-frontier/legacy-absorption-paths.md`:

| Path | Trust Floor | Pilot Status |
|---|---|---|
| Native API / MCP | `verified` | Schema ready; no pilot yet |
| CLI / PowerShell | `known` | **Pilot landed** |
| Browser Automation | `external` | **Pilot landed** |
| UI Automation / Vision | `untrusted` | Schema ready; no pilot yet |

## 4. Permission Envelopes

Shell capabilities use UCAN-style permission slices:

```ts
export interface ShellPermission {
  with: string;   // resource URI
  can: string;    // action permitted
  nb?: Record<string, unknown>;  // non-negotiable constraints
}
```

This maps directly to the `.hsplus` capability blocks in `legacy-absorption-paths.md`:

```hsplus
permissions: [
  { with: "holoscript://fs/node_modules", can: "fs/write", nb: { scoped: true } }
]
```

The `ReceiptExpectation` contract defines what artifacts must be present, the ordered lifecycle stages, and the rollback trigger:

```ts
export interface ReceiptExpectation {
  schema: string;
  requiredArtifacts: string[];
  lifecycle: string[];
  rollbackTrigger?: string;
  confidenceThreshold?: number;
  humanApprovalGate?: boolean;
}
```

## 5. Adapter Contract

Existing modules can migrate to the canonical schema incrementally:

1. **Phase 1** (current): canonical types + validators + tests live in `packages/framework/src/capability/`. Existing modules are untouched.
2. **Phase 2**: `agents/AgentManifest.ts` imports and re-exports `AgentCapability` from the canonical module. Mesh `index.ts` imports and re-exports `MeshCapability`. `board/agent-steward.ts` imports `StewardCapability`.
3. **Phase 3**: Remove legacy inline definitions once all callers have migrated.

The barrel export in `packages/framework/src/index.ts` already wires `capability` so downstream packages can import it today.

## 6. Visual Primitives (Out of Scope for Core)

HoloLand-specific UX — permissions room UI, capability token visual cards, trust-level color coding — remains in HoloLand. This proposal defines only the reusable substrate:

- Types
- Validators
- Type guards
- Cloning utilities
- Receipt schemas
- Policy envelopes

Visual rendering is a HoloLand concern, not a core framework concern.

## 7. Tests

`packages/framework/src/capability/__tests__/capability.test.ts` covers:

- Base capability validation (missing id, name, kind)
- Agent capability validation (missing domain, bad latency, deep clone)
- Steward capability validation (unsupported kind, capability-other label requirement)
- Shell capability validation (bad agentSource, bad trustState, empty permissions, missing receiptExpectation, deep clone)
- Mesh capability validation (minimal shape, does not mistake agent caps for mesh caps)
- Type guards for all four extensions

Total: 25 assertions, all passing.

## 8. Migration Path

| Step | Action | Owner |
|---|---|---|
1 | Consume canonical types from new code | All agents |
2 | Refactor `agents/AgentManifest.ts` to re-export `AgentCapability` | `@holoscript/agents` |
3 | Refactor `mesh/index.ts` to re-export `MeshCapability` | `@holoscript/mesh` |
4 | Refactor `board/agent-steward.ts` to use `StewardCapability` | `@holoscript/board` |
5 | Build UI Automation / Vision receipt pilot | `@holoscript/holoshell` |
6 | Build Native API / MCP receipt pilot | `@holoscript/holoshell` |
7 | Remove legacy inline definitions | All agents |

## 9. References

- Canonical implementation: `packages/framework/src/capability/Capability.ts`
- Barrel export: `packages/framework/src/capability/index.ts`
- Unit tests: `packages/framework/src/capability/__tests__/capability.test.ts`
- Browser receipt pilot: `packages/framework/src/board/holoshell-browser-receipts.ts`
- CLI receipt pilot: `packages/framework/src/board/holoshell-cli-receipts.ts`
- Legacy absorption paths: `experiments/holoshell-human-os-frontier/legacy-absorption-paths.md`
- Task: `task_1778625587950_qdpb` (resolved by commit `9fe6fcf5d`)
