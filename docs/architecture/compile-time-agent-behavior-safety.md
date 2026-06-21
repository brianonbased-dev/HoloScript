# Compile-Time Agent Behavior Safety

This note records the first promoted runtime validator and the intended path for the full effect, linear-resource, capability-token, and zone-contract system.

## First Tracer: Authority

`@sandbox_execution` now contributes an `Authority` effect when its config allows native modules and all-filesystem access:

```hsplus
orb unsafeSandbox {
  @sandbox_execution(
    sandbox_type: "vm",
    allow_native_modules: true,
    permissions: { filesystem: "all", network: "none", environment: "none" }
  )
}
```

That composition fails type checking with `HSP030` because the config infers `authority:world`. The author must either remove the privileged sandbox settings or declare the effect on the same node:

```hsplus
orb safeSandbox {
  @authority { effects: ["authority:world"] }
  @sandbox_execution(
    sandbox_type: "vm",
    allow_native_modules: true,
    permissions: { filesystem: "all", network: "none", environment: "none" }
  )
}
```

The implementation is deliberately narrow: `AuthorityEffectBridge` performs config-aware AST extraction, then the existing `EffectChecker` enforces row inclusion. This proves the compiler can reject an unsafe agent behavior before runtime without replacing the current safety pass.

## Migration Targets

Runtime validators should move into compile-time layers as follows:

- `SandboxExecutionTrait`: infer `authority:*`, `io:*`, and `resource:*` effects from config, then require declarations or capability tokens for privileged combinations.
- `CapabilityRBAC`: mint and consume typed capability tokens such as `AuthorityToken<"world">`; operations that delegate, revoke, or cross zones must require the matching token.
- `GaussianBudgetValidator`: lower gaussian count, memory, and bandwidth ceilings into resource effects checked by `ResourceBudgetAnalyzer`.
- `ZoneConstraintValidator`: express zone entry, mutation, and cross-boundary authority as zone contracts plus linear permits such as `ZonePermit<ZoneId>`.

## Target Compile Pipeline

1. Parse trait/directive config into typed safety facts.
2. Infer effect rows from traits, calls, config, and nested children.
3. Check declared effect rows against inferred rows.
4. Resolve capability tokens required by authority and ownership effects.
5. Verify linear resources are consumed exactly once or intentionally transferred.
6. Check zone contracts and resource budgets.
7. Emit a safety certificate that summarizes verified effects, tokens, resources, zones, and residual runtime checks.

The first tracer only covers step 2 and step 3 for `authority:world`. The next useful expansion is to require a capability token for the same unsafe sandbox pattern, which turns the effect declaration from "this node may do world-authority work" into "this node is authorized to do it."
