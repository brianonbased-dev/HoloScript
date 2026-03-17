# RFC: @wisdom and @gotcha — Making Atoms Explicit (Wisdom Patterns + Defensive Gotchas)

## Status

Proposed — v1

## Authors

- @JoeCoolProduce + Grok Atoms Analyst
- Open for community input

## Summary

Introduce two new meta-traits that turn implicit wisdom patterns and gotchas (already embedded in 2,000+ traits and the compiler) into first-class, queryable, self-documenting atoms.

This directly fulfills the "atoms are wisdom patterns and gotchas" revelation and slots into the existing 40 categories alongside the 38 upgraded CLASS handlers.

## Motivation

- README.md already encodes dozens of wisdom/gotchas (see `THE_BIGGEST_GOTCHA` audit, absorption warnings, assertion limits).
- Making them explicit turns every trait into self-teaching documentation.
- Studio, LSP, and MCP can surface them as tooltips, warnings, or AI suggestions.
- Ties into the DAO Governance RFC (vote on wisdom updates) and Geospatial Climate Twin (gotchas for real-time sensor data).
- Author tools (`@wisdom`) and compiler enforcement (`@gotcha critical`) close the feedback loop between codebase authors and agents generating `.holo` compositions.

## Design — New Meta-Traits

### @wisdom

Captures a battle-tested, reusable insight that applies to one or more traits or categories.

```holo
@wisdom {
  description: string               // "CRDTs prevent merge conflicts in multiplayer"
  source: url | commit | "community"  // provenance
  applies_to: trait[] | category[]  // e.g. [@state, @networked]
  examples: string[]                // optional inline .holo snippet references
}
```

### @gotcha

Captures a known failure mode, its severity, and its mitigation strategy.

```holo
@gotcha {
  warning: string                    // "Absorption loses async side-effects"
  severity: "info" | "warning" | "critical"
  mitigation: string | trait[]       // "Add @circuit_breaker" or [@circuit_breaker]
  triggers_on: event[]               // e.g. [hot_reload, absorb, onClick]
}
```

### Full Example (live in any .holo)

```holo
composition "Governed Treasury Demo" {

  object "SharedTreasury" {
    @credit { balance: 10000 }
    @escrow
    @dao_proposal
    @rate_limit { per_minute: 5 }

    @wisdom {
      description: "Escrow + credit + DAO prevents double-spend and griefing in shared treasuries"
      source: "https://github.com/brianonbased-dev/Holoscript/commit/e48fb50"
      applies_to: [@credit, @escrow, @dao_proposal]
    }

    @gotcha {
      warning: "Without rate limiting, treasury can be drained in under 60 seconds via rapid onClick"
      severity: "critical"
      mitigation: "@rate_limit { per_minute: 5 }"
      triggers_on: [onClick]
    }
  }

}
```

## Compiler & Runtime Behavior

### CLASS Handlers

Two new CLASS handlers (reusing the 38-handler upgrade pattern):

- `@onWisdomQuery` — invoked when Studio/LSP/MCP queries wisdom metadata for a trait.
- `@onGotchaTrigger` — invoked when a gotcha's `triggers_on` event fires at runtime.

### Compilation Modes

| Severity | `dev` mode | `production` mode |
|----------|-----------|------------------|
| `info` | Log to console | Silent |
| `warning` | Console warn | Console warn |
| `critical` | Console error | **Fail compilation** (opt-in flag `--enforce-gotchas`) |

`--enforce-gotchas` flag can be passed to `holo build` or `holo compile` to fail hard on critical gotchas in CI.

### MCP Tool Exposure

`holoscript traits --wisdom` query returns all wisdom atoms registered in the active composition.  
Studio auto-displays wisdoms/gotchas as inline annotations and hover tooltips.

### PyPI

The optional `holoscript[wisdom]` extra exposes a Python-side API:

```python
from holoscript.wisdom import query_wisdom, list_gotchas
wisdom = query_wisdom(trait="@credit")
critical = list_gotchas(severity="critical")
```

## Gotchas Already Encoded (Live Audit, March 17 2026)

Pulled directly from README.md and the compiler — these are existing atoms that `@gotcha` makes searchable:

| # | Warning | Severity | Mitigation | Triggers On |
|---|---------|----------|-----------|-------------|
| 1 | **THE_BIGGEST_GOTCHA**: External test harnesses decouple validation from runtime | `critical` | Use `@script_test` blocks | test_run |
| 2 | Absorption loses async side-effects and context | `warning` | Manually validate generated `.hsplus` agents | absorb |
| 3 | Assertions only support primitives — no objects, arrays, or functions | `warning` | Use dot-notation on live state exclusively | assert |
| 4 | Hot-reload thrashing without debounce corrupts scene state | `warning` | `debounce_ms: 300`, `on_reload: 'soft'` | hot_reload |
| 5 | MCP/AI tool calls can fail silently | `warning` | Wrap every MCP call in `@circuit_breaker` with retry + fallback | mcp_call |
| 6 | Untrusted plugins without sandbox risk arbitrary code execution | `critical` | `@security_sandbox` on all external plugins | plugin_load |
| 7 | Concurrent edits without CRDT state corrupt shared worlds | `critical` | `@crdt` on any shared object | state_write |

## Top 5 Wisdom Patterns (Live Extraction)

These are the recurring battle-tested structures across the 40 trait categories and every production example:

### 1. Declarative WHAT + Imperative HOW Separation
`.holo` (traits only) + `.hsplus` (logic) + compiler translation.  
→ Never mix concerns; trust the compiler for portability.

```holo
@wisdom {
  description: "Separate WHAT objects are from HOW they behave"
  applies_to: ["category:all"]
}
```

### 2. Trait Pairing Discipline
`@physics` always paired with `@state` or `@grabbable`; `@llm_agent` always with `@protocol` + `@knowledge`.  
→ Prevents orphan behaviors and compile-time explosions.

### 3. Resilience by Default
Circuit breakers, CRDTs, soft reloads, permission-based plugins.  
→ Every system assumes failure: network, AI, hot-reload.

### 4. Semantic Over Syntactic
GraphRAG + MCP over raw text; absorption builds semantic graphs.  
→ Code understanding is meaning-first, not token-first.

### 5. Even Playing Field Governance
"No owner advantage — public APIs only" + RFC process for all major changes.  
→ Every implementation (Hololand included) uses exactly the same atoms.

## Implementation Plan

### Phase 1 — 1 week
- Add `@wisdom` and `@gotcha` to `@holoscript/core` trait registry (2 new traits).
- Add `@onWisdomQuery` and `@onGotchaTrigger` CLASS handlers (2 new handlers, pattern follows existing 38).
- Update TRAITS_REFERENCE.md with new meta-trait category.
- Create `examples/wisdom-demo/wisdom-demo.holo` as reference composition.
- Backward compatible — all existing traits unchanged.

### Phase 2 — Follow-on
- Studio tooltip integration (surface `@wisdom` on hover).
- MCP `holoscript traits --wisdom` query endpoint.
- `--enforce-gotchas` flag in `holo build`.
- `holoscript[wisdom]` PyPI extra.
- `@memory_persistent` lattice to persist wisdom across sessions and worlds.

## Open Questions

1. Should `@gotcha` with `severity: "critical"` auto-fail compilation by default, or only under `--enforce-gotchas`?
2. Should `@wisdom` entries be votable/updatable via the DAO Governance RFC (`@dao_proposal` on wisdom entries)?
3. Should `@gotcha` fire `@onGotchaTrigger` at parse-time (static analysis) or only at runtime (dynamic check)?
4. Integrate `@memory_persistent` to allow wisdom atoms to accumulate across world sessions?

## Related RFCs

- [proposals/DAO_Governance_v1.md](DAO_Governance_v1.md) — governance layer for wisdom voting
- [proposals/Geospatial_Climate_Twin_RFC.md](Geospatial_Climate_Twin_RFC.md) — gotchas for real-time sensor data
- [proposals/culture-keyword-extension.md](culture-keyword-extension.md) — keyword extension pattern
