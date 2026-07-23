# `.hsplus` systems component

This example proves that `.hsplus` is broader than an agent-brain format. It
describes an ordinary resilient worker with typed inputs and guarded lifecycle
states, then runs through HoloScript's owned execution path:

```text
canonical HoloScriptPlusParser
  -> shared HSI-IR lowering
  -> HSIExactTrace / expression-ir
  -> deterministic receipt
```

Run the product tracer:

```bash
pnpm check:hsplus-systems-closure
pnpm check:hsplus-systems-closure:test
```

The self-test mutates the source to prove that undeclared states, incorrect
typed defaults, unknown guard inputs, unsupported declarations, parser-erased
syntax, and host lifecycle code all fail admission.

## Current language slice

The checked slice accepts complete documents made only of top-level
`state_machine` declarations. It supports `bool`, `int`, `float`, and `trigger`
inputs plus typed `when` guards. The example deterministically executes:

```text
idle -> running -> open -> idle
```

This is intentionally not a claim of complete `.hsplus` compilation yet.
Listeners, event-form transitions, lifecycle code, directives, and other
top-level declarations remain explicit unsupported semantics and fail closed
instead of being silently dropped.
