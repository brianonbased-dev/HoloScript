# .hsplus eval migration: security audit and UAAL dispatch scope

Date: 2026-07-03
Task: `task_1783078367059_z8oa`
Mode: room marathon, security audit, language architecture

## Executive result

The original report was correct but incomplete: `SensorTrait.ts` and
`TransformTrait.ts` are real production eval sites, and the wider sweep found
more HoloScript string-execution surfaces across core, engine, Studio, and
platform packages. The highest-risk family is not native `.hsplus` files
containing JavaScript; it is TypeScript runtime code interpreting HoloScript
configuration, computed values, lifecycle bodies, handler assignments, or
pipeline filters by calling `new Function()` or target-language `eval()`.

UAAL is now a plausible replacement path rather than greenfield. Commit
`8f7a9e0a4` added real `CALL` and `RET` opcodes to `@holoscript/uaal`, and the
current `UaalBehaviorCompiler` already lowers named actions and event handlers
to patched CALL/RET entry points. The remaining gap is expression and effect
semantics: HoloScript expressions and handler effects still need a shared,
typed IR plus host-effect ABI instead of being handed to JavaScript source
evaluation.

HoloGate note: this audit treats HoloGate as the docs umbrella term only. The
concrete replacement lanes are HoloKey/x402 receipts, routeTask/room routing,
competitor-paper-codebase triads, UAAL bytecode, MCP validation, and source-level
proof.

## Scope and commands

Primary production-source sweep:

```powershell
rg -n --hidden -g '*.ts' -g '*.tsx' -g '!**/dist/**' -g '!**/node_modules/**' -g '!**/.next/**' -g '!**/coverage/**' -g '!**/__tests__/**' -g '!**/*.test.ts' -g '!**/*.spec.ts' "new\s+Function|\beval\s*\(|\bFunction\s*\(|createContext|runInContext|runInNewContext|new\s+Script" packages services scripts src
```

HoloScript-source sweep:

```powershell
rg -n -g '*.hs' -g '*.hsplus' -g '*.holo' "new\s+Function|\beval\s*\(|\bFunction\s*\(|createContext|runInContext|runInNewContext|new\s+Script" .
```

Notes:

- A broader first pass over `packages services scripts src` timed out when run
  without tight globs; the successful sweep above excluded build outputs,
  tests, `.next`, coverage, and `node_modules`.
- The HoloScript-source sweep found detector/debug vocabulary but did not find
  production `.hs`, `.hsplus`, or `.holo` content that itself embeds raw
  JavaScript eval.
- `mcp__holoscript.holo_graph_status` timed out after 300 seconds, so this
  audit used local source proof and git evidence.

## Full eval-site inventory

### Priority 0: HoloScript content, trait, handler, and runtime semantics

These are the migration-critical sites because user-authored or generated
HoloScript-facing data can reach them as strings.

| Site                                                                      | Current behavior                                                                                                                                                                     | Blast radius                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/traits/SensorTrait.ts:120`                             | `config.transform` becomes `new Function('value', 'return ...')` during `sensor_data`.                                                                                               | Attacker-controlled transform can reach JS globals through Function-constructor semantics, allocate or loop, inspect `globalThis`, mutate values, and call any available ambient global.                   |
| `packages/core/src/traits/TransformTrait.ts:176`                          | `$field` references are text-replaced, then numeric regex-gated, then evaluated with `new Function`.                                                                                 | Narrower than SensorTrait, but still uses the Function constructor and a string parser. It should become parser/IR-driven arithmetic.                                                                      |
| `packages/core/src/traits/TestTrait.ts:313,342,372`                       | Test trait value, assertion, and computed expressions replace `$var` strings and call `new Function` with state keys plus `Math`, `String`, `Number`, `Boolean`, `Date`, and `JSON`. | Test flows can exercise globals and state-shaped identifiers through runtime code generation. "Test-only" does not make it harmless when tests become user-facing validation or agent-generated harnesses. |
| `packages/core/src/compiler/PipelineNodeCompiler.ts:325`                  | Node pipeline filter conditions use `new Function('item', 'with (item) { return (...) }')`.                                                                                          | `with(item)` makes property scope and prototype collisions part of evaluation, and Function global scope remains reachable.                                                                                |
| `packages/core/src/compiler/PipelineNodeCompiler.ts:401`                  | Python target emits `eval(condition, {'__builtins__': {}}, dict(item))`.                                                                                                             | Builtins are removed, but generated target code still interprets condition strings dynamically.                                                                                                            |
| `packages/core/src/ReactiveState.ts:133`                                  | Legacy `ExpressionEvaluator` evaluates template/interpolation expressions with `new Function(...contextKeys, '"use strict"; return (...)')`.                                         | Strict mode and null `this` do not remove Function-constructor access to global constructors.                                                                                                              |
| `packages/core/src/state/ReactiveState.ts:597`                            | Newer `ExpressionEvaluator` keyword-blocks several patterns, then uses `new Function` with context and builtins.                                                                     | Blocklists can miss alternate global access paths and do not provide typed expression provenance.                                                                                                          |
| `packages/engine/src/runtime/HoloScriptPlusRuntime.ts:891`                | Lifecycle directive bodies that look like code blocks execute via `new Function(...builtins, ...params, 'state', 'node', body)`.                                                     | Direct handler-body execution for `.hsplus` runtime semantics; this is the core "JS smuggled through a language body" problem.                                                                             |
| `packages/engine/src/runtime/HoloScriptPlusRuntime.ts:2225`               | Template migration code executes with `new Function(...Object.keys(sandbox), code)`.                                                                                                 | Migration bodies get state, node, props, and builtins; should be expressed as typed migration ops.                                                                                                         |
| `packages/engine/src/runtime/profiles/HeadlessRuntime.ts:468`             | Headless lifecycle bodies follow the same `new Function` handler-body path as the main runtime.                                                                                      | Edge/server/IoT execution inherits the same JS escape hatch, but in a headless context that may have different ambient globals.                                                                            |
| `packages/studio/src/components/holo-surface/useHoloComposition.ts:118`   | Computed values from string definitions use `new Function` with state, computed, and builtins.                                                                                       | Studio preview can execute generated/user expressions in the browser context.                                                                                                                              |
| `packages/studio/src/components/holo-surface/useHoloComposition.ts:409`   | Event handler assignment expressions use `new Function(...contextKeys, ...)`.                                                                                                        | Event payloads and state feed string execution during interactive Studio use.                                                                                                                              |
| `packages/studio/src/components/holo-surface/HoloSurfaceRenderer.tsx:218` | Renderer expression evaluation uses `new Function` with state, computed, and builtins.                                                                                               | Rendering path can execute expression strings in the UI thread.                                                                                                                                            |
| `packages/studio/src/components/console/ScriptConsole.tsx:74`             | Studio console uses raw `eval(input)`.                                                                                                                                               | Intended REPL/debug surface, but it needs explicit debug gating and isolation so it is not mistaken for runtime semantics.                                                                                 |
| `packages/core/src/debug/AgentInspector.ts:429`                           | Breakpoint conditions use `new Function(...contextKeys, 'return condition')`.                                                                                                        | Debug-only surface, but breakpoints can inspect or execute ambient globals unless moved to the same expression IR.                                                                                         |

### Priority 1: explicit sandbox execution surfaces

These are dynamic execution by design. They are not the same bug class, but the
migration should keep them clearly named and isolated instead of letting generic
trait handlers drift into them.

| Site                                                        | Current behavior                                                                                                                        | Classification                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/plugins/PluginSandboxRunner.ts:414,468`  | Uses `node:vm` `runInContext` with time budget, VM context, safe globals, permission-gated plugin APIs, and syscall shadowing.          | Keep as plugin sandbox; do not use as a generic expression evaluator.                                        |
| `packages/core/src/traits/SandboxExecutionTrait.ts:221,234` | Generates a VM context and runs `vm.Script(code).runInContext(...)` with timeout and optional fs/fetch/require permissions from config. | Keep as explicit sandbox trait. Native-module permission needs conspicuous HoloKey/x402 receipting.          |
| `packages/security-sandbox/src/index.ts:557,569,878,884`    | Security sandbox validates, shadows blocked globals, runs `node:vm` scripts with timeout, and records audit data.                       | Keep as hardened sandbox lane; useful reference for future threat tests, not the default language runtime.   |
| `packages/platform/src/security/SandboxExecutor.ts:284`     | "Sandboxed" Function constructor with blocked globals, safe globals, and Promise timeout.                                               | Lower assurance than `node:vm`; should be reviewed separately before being treated as an isolation boundary. |

### Priority 2: dynamic-import shims

These use the Function constructor to avoid bundler/static import behavior, not
to evaluate HoloScript semantics. They should be marked separately so the eval
ban does not break legitimate optional dependency loading.

| Site                                                            | Current behavior                                      |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `packages/core/src/cli/daemon-discord-bridge.ts:162`            | Dynamic import wrapper for optional module loading.   |
| `packages/core/src/io/HoloScriptIO.ts:159`                      | Dynamic import wrapper for `@holoscript/core`.        |
| `packages/engine/src/gpu/WebGPUContext.ts:41`                   | Dynamic import wrapper for optional `webgpu` package. |
| `packages/studio/src/components/hologram/HologramViewer.tsx:83` | Dynamic import wrapper for optional `holoplay-core`.  |

### Priority 3: detectors, examples, and false positives

These matches do not execute code themselves:

- `packages/core/src/compiler/QualityGates.ts:577`
- `packages/core/src/traits/VulnerabilityScannerTrait.ts:300,306`
- `packages/framework/src/ai/AIOutputValidator.ts:46`
- `packages/platform/src/security/SecurityEnforcer.ts:277,284,362`
- `packages/platform/src/security/security_enforcer.hsplus:87,88`
- `packages/marketplace-api/src/VerificationService.ts:352`
- `packages/platform/src/registry/certification/CertificationChecker.ts:702,703`
- `packages/video-tutorials/src/compositions/SecuritySandbox.tsx:16`
- React `createContext` matches, trait context factories, and compiler
  `createContextCompiler` names are search false positives for this audit.

## Security blast radius

`new Function()` evaluates in the global scope. Passing named parameters,
adding `"use strict"`, or calling the function with `null` `this` reduces some
accidental exposure but does not make the body a language-level sandbox.
Constructor chains and ambient globals remain the boundary to defend.

The dangerous reachable capabilities differ by host:

- Node contexts can expose `process`, dynamic import, global timers, memory
  allocation, and any globals provided by the runtime or bundler.
- Browser/Studio contexts expose the page global, DOM-adjacent APIs depending
  on scope, network APIs when present, and UI-thread CPU exhaustion.
- Engine/headless contexts may carry host capabilities, trait event emitters,
  state proxies, node objects, builtins, and provider-specific globals.

Blocklists are insufficient as the primary boundary. The current runtime code
blocks obvious strings such as `eval`, `require`, or `process`, but a language
runtime should not be asking "which JavaScript strings are safe?" It should be
asking "which HoloScript expression node is this, which slots may it read, and
which host effects may this bytecode request?"

## Current UAAL state

Verified locally:

- `packages/uaal/src/opcodes.ts` defines `CALL = 0x32` and `RET = 0x33`.
- `packages/uaal/src/vm.ts` maintains a `callStack`, enforces `maxCallDepth`,
  pushes `pc + 1` on CALL, jumps to the target, and returns or halts on RET.
- `git show --stat --oneline 8f7a9e0a4 --` identifies the commit that landed
  genuine return-address call frames.
- `packages/core/src/compiler/UaalBehaviorCompiler.ts` compiles
  `actions`, `eventHandlers`, and `logic` bodies into UAAL bytecode.
- Named actions are collected into a symbol set, bootstrapped with CALL, patched
  to entry-point PCs, and ended with RET.
- Calls to named actions from method calls or call expressions lower to CALL.
- Other host effects lower to `EXECUTE` tags such as `assign:*`, `declare:*`,
  `emit:*`, `cond`, `forInit:*`, `forHasNext:*`, and `forNext:*`.
- Expressions currently lower to deterministic structured operands, for example
  `{ ref }`, `{ op, l, r }`, `{ call, args }`, and `{ member, prop }`, but their
  runtime meaning is still delegated to host `EXECUTE` handlers.

This is exactly the right seam for migration: UAAL can own control flow and
dispatch, while host registries own explicit effect permissions.

## Migration scope

### Phase 0: shared expression IR

Create one structural expression IR for numeric, boolean, member, literal,
pipeline-condition, computed-value, and handler-assignment expressions. The IR
must carry:

- allowed identifier slots, for example `value`, `$field`, `state.foo`,
  `event.kind`, or declared action parameters;
- allowed operations, for example arithmetic, comparisons, boolean operators,
  null coalescing, string conversion, and explicit builtins;
- source span and provenance for receipts;
- a fail-closed parse result for anything outside the subset.

This can reuse the existing HoloScript expression parser and the native
`condition_evaluator.hsplus` contract as a bridge, but the final replacement
should be AST/IR based rather than keyword regex based.

### Phase 1: replace expression eval sites

Migrate the highest-risk string-eval sites first:

1. `SensorTrait.config.transform`: compile `value -> expression` into IR/UAAL
   or a declarative transform operation.
2. `TransformTrait.evaluateExpr`: replace text substitution plus Function with
   numeric IR over declared `$field` references.
3. `TestTrait`: evaluate values, assertions, and computed fields through the
   shared IR.
4. `ReactiveState` and `state/ReactiveState`: move interpolation and computed
   expressions to the shared IR.
5. Studio holo-surface computed/event/render expressions: use the same IR in
   browser-safe interpreter/UAAL runtime.
6. Pipeline filters: compile once to IR and emit target-native safe evaluators
   for JS and Python, avoiding both JS `new Function` and Python `eval`.

### Phase 2: handler and action dispatch

Use the existing `UaalBehaviorCompiler` seam:

- handler bodies become UAAL functions with CALL/RET entry points;
- action names resolve to symbol IDs/entry labels, not JavaScript functions;
- returns leave values on the UAAL operand stack;
- host effects are requested only through registered `EXECUTE` tags;
- the host registry maps `EXECUTE` tags to allowed effects under HoloKey/x402
  receipting and StdlibPolicy gates.

The minimum ABI should include:

- state read/write;
- event emit;
- sensor read/update;
- arithmetic/comparison/string builtins;
- array/object literal construction where needed;
- pipeline item field access;
- debug-only breakpoint evaluation, explicitly gated;
- sandbox-only code execution, explicitly named and never implicit.

### Phase 3: gate and compatibility

Add enforcement after replacement:

- a quality gate that rejects `new Function()` in trait handlers, lifecycle
  handlers, computed values, pipeline filters, and non-sandbox runtime
  interpreters;
- an allowlist exemption for explicit sandbox packages and dynamic-import shims;
- tests that malicious payloads cannot reach `globalThis`, `process`,
  `Function`, `constructor`, or `require`;
- compatibility codemods for old config strings into typed expression AST/IR;
- HoloMesh/routeTask follow-ups for engine, Studio, core, and platform owners.

## Acceptance criteria mapping

- Full eval-site inventory: provided above, including core, engine, Studio,
  platform, security-sandbox, HoloScript source files, detectors, examples, and
  dynamic-import shims.
- Security blast radius: documented for Function-constructor, Node, browser,
  headless/engine, target-language eval, and blocklist limitations.
- UAAL migration scoping: documented with current CALL/RET state, existing
  `UaalBehaviorCompiler` symbol dispatch, expression IR needs, host-effect ABI,
  and phased replacement plan.
