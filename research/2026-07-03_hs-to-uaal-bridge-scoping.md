# Scoping: `.hs` (Rust/WASM parser) → UAAL bytecode bridge

> Task: `task_1783071520395_tuj4` (claude-code, claimed 2026-07-03). **Scoping only — no
> implementation in this pass.** Answers the four open design questions the prior
> investigation (agent `a14ba65c9c41ad20e`, same day) left unresolved, each verified against
> live code, not memory.

## Context (recap, verified still accurate)

- `packages/uaal` is real and alive: **49/49 tests pass** (`pnpm --filter @holoscript/uaal
  test`, re-run 2026-07-03, 3 test files, 464ms).
- A working bridge from `.holo` composition AST → UAAL bytecode already exists —
  `packages/core/src/compiler/UaalBehaviorCompiler.ts`, wired to `holo compile --target uaal`
  (docs/spec/spec-vs-reality-gap.md G3/G4, both marked shipped).
- What does **not** exist: any bridge from `.hs` specifically (the Rust/WASM grammar in
  `packages/compiler-wasm/src`) to UAAL. Zero references to `uaal`/`UAAL` anywhere in the Rust
  crate; the only `wasm_bindgen` compile export today is `compile_to_kotlin`
  (`packages/compiler-wasm/src/lib.rs:178-185`).
- This is a different, harder problem than P.017 (agent-to-agent/Brittney mesh de-islanding),
  which is already closed.

## Q1 — Does UAAL have a call/return convention?

**No. Verified directly against `packages/uaal/src/opcodes.ts` and `vm.ts`.**

The full opcode enum (`packages/uaal/src/opcodes.ts:26-143`) has exactly two control-flow
opcodes:

```
JUMP = 0x30,
JUMP_IF = 0x31,
```

`isControlFlowOp()` (opcodes.ts:188-190) confirms this is the complete set: `JUMP`, `JUMP_IF`,
`HALT`. There is no `CALL`, `RET`, `INVOKE`, or equivalent anywhere in the ~90-opcode ISA
(stack/cognitive/mesh/control-flow/temporal/transcendence/real-world/local-intelligence/
swarm/discovery/timeline/HoloScript-integration/native-orchestration/error/optimization tiers
all enumerated, none is a call/return pair).

The executor (`packages/uaal/src/vm.ts:212-336`) switches on `instr.opCode`. `JUMP` (258-262)
and `JUMP_IF` (264-271) both just overwrite a flat `this.state.pc: number` — a single program
counter, not a call-frame stack. The **default case** (330-336) is the fallback for any opcode
not explicitly handled:

```ts
// ── Default: unhandled opcodes push null ──────────────
default:
  if (this.enableLogging) {
    this.log(`Unhandled opcode: ${getUAALOpcodeName(instr.opCode)}`);
  }
```

(truncated — pushes `null` and returns `false`, i.e. advances PC normally). It is a genuine
silent no-op with optional logging, not a throw. A hypothetical `CALL`/`RET` opcode, being
absent from the enum, would fall through here today if anything tried to emit one.

`VMState` (vm.ts:27-32) is the complete VM state shape:

```ts
export interface VMState {
  stack: UAALOperand[];
  pc: number;
  context: Record<string, UAALOperand>;
  isHalted: boolean;
}
```

One flat `pc`, one operand `stack` (used for PUSH/POP/PEEK values, not return addresses), one
flat `context` map. **No call-frame, no return-address stack, no nested-scope structure
anywhere in the package** (grepped case-insensitively for `callStack`/`call.frame`/
`returnAddress`/`stack pointer` across `packages/uaal/src` — zero hits).

**Conclusion:** recursion (or any function call with a return) is not executable on this VM
today. `JUMP`/`JUMP_IF` alone can express a loop back-edge (as `UaalBehaviorCompiler`'s recent
While/For lowering, commit `eb01d22e3`, already proves) but cannot express "jump to a callee,
then come back to the instruction after the call" — there is nowhere to remember the return
address. This is a real, unresolved VM-design gap, not a bridge-side detail.

## Q2 — Does `.hs`'s parser support self-referential/mutually-recursive calls with correct scoping?

**Yes, by construction — but only because there is no resolution phase at all, at any level.**
Verified against `packages/compiler-wasm/src/parser.rs` (2,676 lines; note this is *smaller*
than the 2,976 lines the prior pass recorded — the crate has been refactored/shrunk since) and
`ast.rs` (786 lines).

- `parse_function` (parser.rs:803-834) parses `function name(params) { body }` into
  `AstNode::Function(FunctionNode { name, params, body, loc })`.
- `parse_call_expression` (parser.rs:1713-1737) parses any `callee(args)` into a single node
  type, `AstNode::CallExpression` (`ast.rs:449-455`):
  ```rust
  pub struct CallExpression {
      pub callee: Box<AstNode>,
      pub arguments: Vec<AstNode>,
      pub loc: Option<Location>,
  }
  ```
  The `callee` resolves via `parse_primary` to a bare `IdentifierNode { name, loc: None }` — a
  string, nothing more.
- **There is no symbol table, no scope stack, no forward-declaration check anywhere in the
  crate.** Grepped the whole crate (case-insensitive) for `symbol_table`/`SymbolTable`/`scope`/
  `resolve`/`defined_functions` — zero real hits (one unrelated doc-comment "scope note").
  `FunctionNode` itself carries no recursion metadata or self-reference flag.
- Consequence: `A` calling `A`, or `A` calling `B` calling `A`, parses through the *identical*
  `CallExpression` code path as any other call — a builtin, an undeclared name, a
  forward-declared function. The grammar is single-pass recursive-descent with zero
  declaration-order enforcement, so recursion isn't specially permitted, it's simply never
  checked. `kotlin_emit.rs` (the one existing downstream consumer) treats every
  `CallExpression` uniformly by textual callee name too — no distinct recursion handling
  exists downstream either.
- **No existing test fixture exercises recursion.** Grepped the whole `compiler-wasm` package
  (case-insensitive) for `recursi`/`fib`/`factorial`/`self()` — the only hits were unrelated
  Rust-recursion doc comments inside `kotlin_emit.rs` (lines 80, 796). A minimal fixture
  (`function fib(n) { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); }`) was traced
  by hand through `parse_function` → `parse_statement` → `parse_call_expression` and confirmed
  to build a normal `CallExpression{callee: Identifier("fib"), ...}` — i.e. it parses
  successfully today, but this has never been asserted by a test.

**Conclusion:** "parses a function that happens to call itself" and "supports recursion with
correct scoping" collapse to the same thing here, because scoping/resolution doesn't exist yet
at the parser level for *any* call, recursive or not. The open risk isn't in the parser; it's
that **whatever consumes the AST next (a hypothetical UAAL lowering pass) must build symbol
resolution from scratch**, since nothing upstream does it.

## Q3 — WASM-boundary shape for a hypothetical `compile_to_uaal` export

**Confirmed template: mirror `compile_to_kotlin` exactly.** Read directly
(`packages/compiler-wasm/src/lib.rs:158-193`):

```rust
#[wasm_bindgen]
pub fn compile_to_kotlin(source: &str, indent: &str) -> String {
    match kotlin_emit::compile_source_to_kotlin(source, indent) {
        Ok(kotlin) => kotlin,
        Err(e) => serde_json::to_string(&serde_json::json!({ "error": e.message }))
            .unwrap_or_else(|_| r#"{"error": "Unknown emit error"}"#.to_string()),
    }
}

// Native-only re-export for tests/tooling, NOT exported to WASM:
#[cfg(not(target_arch = "wasm32"))]
pub fn __compile_to_kotlin(source: &str, indent: &str) -> Result<String, String> { ... }
```

The pattern: `(source: &str, [format-specific-params]) -> String`, success returns the target
payload as a plain string (Kotlin source text; for UAAL this would be a JSON-serialized
`UAALBytecode` per `packages/uaal/src/opcodes.ts:162-165` — `{version, instructions[]}`), and
failure returns a JSON `{"error": ...}` string rather than throwing across the WASM boundary. A
`compile_to_uaal(source: &str) -> String` export is confirmed as the low-risk, precedented
shape; no un-confirmed guess required here.

## Q4 — `.hsplus → HoloComposition` bridge (separate, adjacent gap)

**Confirmed still unbuilt**, cited correctly by the prior pass. Verified directly against
`docs/spec/spec-vs-reality-gap.md:76-82` (G4 section, "SHIPPED — scope note"):

> `.hsplus` input (vs `.holo`) needs the `.hsplus → HoloComposition` bridge — a known
> follow-up, not in this slice.

This is a precondition for a `.hsplus`-sourced UAAL bridge but is orthogonal to the `.hs`
question above (`.hs` is the imperative-logic grammar in `compiler-wasm`; `.hsplus` is the
trait/brain format whose composition-level lowering already has a *separate*, still-open gap).
Not investigated further here — out of scope for this task, flagged as a dependency only.

## What this means for a future implementation task (not this one)

Two independent, sequenced pieces of real design work are needed before `.hs → UAAL` can be a
buildable slice, not a vibe (F.076 frame):

1. **VM-side: a call/return convention for UAAL.** Two candidate directions, neither
   attempted here:
   - (a) New opcodes (`CALL`/`RET`) + a real call-frame stack (return-address + locals) added
     to `VMState` and the executor switch in `vm.ts`. Highest generality, touches the VM ISA
     (out of scope for the original G3 seam, which explicitly said "out of scope: changing the
     uaal VM ISA" — this recursion work would be the first exception to that boundary).
   - (b) Compile-time recursion flattening/inlining in the emitter (bounded-depth unrolling or
     an explicit iterative rewrite), avoiding any VM change. Lower risk, but caps recursion
     depth and doesn't generalize to unbounded/mutual recursion.
   A real decision between (a) and (b) is a prerequisite design call, not an implementation
   detail — recommend a short premortem/critic pass on both before either is started.
2. **Bridge-side: symbol resolution built fresh.** Since neither the `.hs` parser nor any
   existing UAAL compiler resolves call targets today, a `.hs → UAAL` lowering pass must build
   its own symbol table (function name → bytecode offset or index) as new code — this doesn't
   pre-exist anywhere to reuse.

Recommended prerequisite noted by the prior pass and independently confirmed real and shipped:
the `.holo`-side loop-lowering slice (commit `eb01d22e3`, "lower While/For/ClassicFor to real
back-edge bytecode", 4 new e2e tests proving genuine termination) is a completed, lower-risk
sibling that de-risks the `JUMP`/`JUMP_IF` back-patching pattern a recursion design would likely
reuse for loop bodies inside recursive functions.

## Done-when (per board task contract)

Verification evidence for this scoping pass:
- `pnpm --filter @holoscript/uaal test` → 49/49 pass, re-run live 2026-07-03 (not stale).
- Direct code citations for every claim above (`opcodes.ts`, `vm.ts`, `parser.rs`, `ast.rs`,
  `lib.rs`, `UaalBehaviorCompiler.ts`, `spec-vs-reality-gap.md`) — no speculation, all grep/read
  verified in this session.
- No code changed. This document is the deliverable; the two follow-on design questions (VM
  call convention choice, symbol-resolution build) are the recommended next board tasks, not
  closed here.
