# Contract Blocks Reference (`.holo`)

## Overview

A `sim_contract {}` block declares the formal specification of a `.holo`
composition: what must be true before it runs (preconditions), what must stay
true throughout (invariants), and what proof it produces (receipt). The
HoloScript compiler's SimulationContract CPU verifier gate reads these at
dispatch time, realizing the NORTH_STAR thesis: **the simulation IS the proof —
preconditions → invariants → receipt**.

Only one `sim_contract` block is permitted per composition. It is optional.

---

## Syntax

```
sim_contract {
  precondition "name" { expression }
  precondition "name" "description" { expression }
  invariant "name" { expression }
  invariant "name" "description" { expression }
  receipt { field_name: type_name, ... }
}
```

All sub-blocks are optional and may appear in any order.

---

## Preconditions

Named conditions that must hold **before** the composition runs. The
SimulationContract verifier checks these at composition entry. A failing
precondition blocks Tier-2 speculative execution.

```
sim_contract {
  precondition "gravity_set" { gravity != null }
  precondition "arena_bounded" "Arena radius must be positive before match starts" {
    arena.radius > 0
  }
}
```

Each `precondition` clause has:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier for this clause (string literal or bare identifier). |
| expression | Yes | Raw expression string inside `{ }` — evaluated by the verifier. |
| `description` | No | Human-readable explanation (second string literal before `{`). |

---

## Invariants

Named properties that must hold **throughout** execution. The verifier can
check these continuously during simulation steps.

```
sim_contract {
  invariant "energy_conserved" { total_energy <= initial_energy + 0.001 }
  invariant "no_negative_health" "Player health must stay non-negative" {
    player.health >= 0
  }
}
```

Invariant clause fields are identical to precondition clause fields.

---

## Receipt

The proof artifact produced on successful completion. Declares field names and
their type annotations. At runtime the SimulationContract verifier uses this
shape to validate the execution receipt before sealing it.

```
sim_contract {
  receipt { winner: string, final_score: number, elapsed_ms: number }
}
```

Multiple fields are separated by commas. Type names are plain strings
(`string`, `number`, `boolean`, or any custom identifier).

---

## Complete Example

```
composition "PhysicsArena" {
  environment {
    gravity: -9.81
    sky_color: "#1a1a2e"
  }

  sim_contract {
    precondition "gravity_set" "Gravity must be configured before the match" {
      gravity != null
    }
    precondition "arena_bounded" "Arena radius must be positive" {
      arena.radius > 0
    }
    invariant "energy_conserved" "Total kinetic energy must not exceed initial + epsilon" {
      total_energy <= initial_energy + 0.001
    }
    invariant "no_negative_health" {
      player.health >= 0
    }
    receipt {
      winner: string,
      final_score: number,
      elapsed_ms: number
    }
  }

  object "Arena" {
    shape: "sphere"
    radius: 50
  }
}
```

---

## Connection to the SimulationContract Verifier

The `DispatchPolicy` CPU verifier (Tier-2 gate) reads `op.contract` when
present. It enforces the structural invariant that a contract block must
declare at least one precondition or invariant before Tier-2 speculative
execution is allowed. Full semantic evaluation of each expression — including
runtime checks against live state — is the `simulationContractVerifier`
callback's responsibility (injected via `DispatchPolicyConfig`).

The flow:

```
sim_contract {} in source
  ↓ parsed by HoloCompositionParser.parseContractBlock()
  ↓ stored in HoloComposition.contract (HoloContract AST node)
  ↓ attached to DispatchableOperation.contract
  ↓ read by DispatchPolicy.runCpuVerifier()
  ↓ → empty contract = reject
  ↓ → non-empty contract = anyVerifierWired = true (gates Tier-2)
  ↓ simulationContractVerifier (if wired) does full semantic evaluation
```

---

## AST Types

```typescript
interface HoloContract extends HoloNode {
  type: 'contract';
  preconditions: HoloContractClause[];
  invariants: HoloContractClause[];
  receipt: Record<string, string>;
}

interface HoloContractClause {
  name: string;
  expr: string;
  description?: string;
}
```

Exported from `@holoscript/core/parser`:

```typescript
import type { HoloContract, HoloContractClause } from '@holoscript/core/parser';
```

---

## Next Steps

- [reference-holo-entity.md](./reference-holo-entity.md) — entity blocks
- [reference-holo-object.md](./reference-holo-object.md) — object declarations
- `DispatchPolicy.ts` — `runCpuVerifier` for the full gate logic
- `simulationContractBinding.ts` — the HoloMap manifest contract assertion
