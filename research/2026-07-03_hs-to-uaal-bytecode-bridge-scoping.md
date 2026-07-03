# Scoping: `.hs` (Rust/WASM parser) to UAAL bytecode bridge

> Board task `task_1783071520395_tuj4`. SCOPING ONLY -- no implementation in this pass
> (per /founder ruling 2026-07-03: a findings-only research doc with zero behavior-changing
> code is agent-decided, not a founder-tier question; the F.076 premortem gate applies to
> builds, and this task explicitly forbids building).
>
> Claimed by claudecode-claude-x402, 2026-07-03. Supersedes the memory-store framing that
> conflated this with P.017 (P.017 is agent-to-agent/Brittney mesh de-islanding -- a different,
> already-closed problem). This gap is specifically: no code anywhere bridges the canonical
> `.hs` Rust/WASM grammar (`packages/compiler-wasm/src`) to UAAL bytecode. The existing
> `.holo -> UAAL` bridge (`UaalBehaviorCompiler.ts`, shipped, G3/G4 in
> `docs/spec/spec-vs-reality-gap.md`) is a *different* AST (HoloComposition, not `.hs`'s
> Rust-parsed AST) and does not help here.

## What already exists (verified directly, this session)

- **uAAL VM + compiler is real and alive**: `packages/uaal/src/{opcodes.ts,vm.ts,compiler.ts}`.
  49 tests across `uaal.test.ts` (41), `mesh-transport.test.ts` (6), `scene-perception.test.ts` (2)
  -- count matches the commonly-cited "49/49 pass" claim (not re-executed this session; `pnpm`
  was not reachable in the tool sandbox PATH, but the test count corroborates the citation).
- **`.holo` -> UAAL bridge SHIPPED**: `UaalBehaviorCompiler.ts` (`packages/core/src/compiler/`)
  lowers HoloComposition behavioral nodes (MethodCall, EmitStatement, Assignment,
  VariableDeclaration, AwaitStatement, ExpressionStatement, ReturnStatement, IfStatement) to
  real UAAL bytecode with back-patched `JUMP`/`JUMP_IF`. Loops (`While`/`For`/`ClassicFor`) were
  the last deferred slice and are now also shipped (commit `eb01d22e3`, 2026-07-03, this same
  day) via `JUMP`/`JUMP_IF` back-edges wrapped in an `EXECUTE('cond', ...)` host callout.
- **CLI target registered**: `holo compile <file>.holo --target uaal` works end-to-end
  (`packages/cli/src/cli.ts`, G4 in the gap doc), writes `.uaal` JSON bytecode.
- **`.hsplus -> HoloComposition` bridge is a separate, already-documented, still-unbuilt gap**
  (`docs/spec/spec-vs-reality-gap.md:81-82`) -- confirmed directly by reading the file. Not
  in scope for this task, but adjacent: even if the `.hs` <-> UAAL bridge below were built,
  `.hsplus` input still can't reach `UaalBehaviorCompiler` today without that separate bridge.
- **`compile_to_kotlin` is the template precedent** for a WASM-exported compile target
  (`packages/compiler-wasm/src/lib.rs:178-185`):
  ```rust
  #[wasm_bindgen]
  pub fn compile_to_kotlin(source: &str, indent: &str) -> String {
      match kotlin_emit::compile_source_to_kotlin(source, indent) {
          Ok(kotlin) => kotlin,
          Err(e) => serde_json::to_string(&serde_json::json!({ "error": e.message }))
              .unwrap_or_else(|_| r#"{"error": "Unknown emit error"}"#.to_string()),
      }
  }
  ```
  A hypothetical `compile_to_uaal(source: &str) -> String` would mirror this shape: parse with
  the canonical `.hs` parser, emit a JSON `UAALBytecode` packet on success, JSON `{error}` on
  failure. Zero `uaal`/`UAAL` references exist anywhere in `packages/compiler-wasm/src` today
  (confirmed via grep) -- this is a wholly new emitter module, same pattern as `kotlin_emit.rs`.

## The four open design questions -- resolved with ground truth

### 1. Does UAAL have a CALL/RET convention? -- No. Confirmed directly.

Full opcode enum read (`packages/uaal/src/opcodes.ts:26-143`). Every opcode from `PUSH`/`POP`
through the Native-Orchestration tier (`OP_GRAPH_START`..`OP_RESTORE`) was enumerated. There is
no `CALL` or `RET` opcode. `CALL_NODE` (0x21) exists but is a **mesh/remote-dispatch** opcode
("Execution & Mesh Operations" section) -- it addresses a different physical agent node, not a
local function call. The library's own `isControlFlowOp()` helper (`opcodes.ts:188-190`) lists
exactly three control-flow ops: `JUMP`, `JUMP_IF`, `HALT`.

`vm.ts` confirms the runtime side. `VMState` (`vm.ts:27-32`) holds only `stack`, `pc`, `context`,
`isHalted` -- **no call-frame stack, no return-address slot, no frame pointer**. `JUMP`/`JUMP_IF`
(`vm.ts:258-271`) both set `this.state.pc` to an operand baked in at compile time -- there is
no mechanism to jump to a *dynamically determined* return address, which is exactly what `RET`
needs (the callee doesn't know at compile time where the caller will resume). The default case
for an unhandled opcode (`vm.ts:330-336`) is a **silent no-op**: it pushes `null` and, only if
`enableLogging` is on, logs a line -- it does not throw. This matches the prior investigation's
framing exactly: a hypothetical `CALL` opcode emitted today would silently degrade to "push null
and continue" instead of failing loud.

**Design decision needed before any code lands**: either (a) add real `CALL`/`RET` opcodes plus
a call-frame stack to the VM (a genuine ISA extension, touches `packages/uaal` core, needs its
own premortem/e2e test since it changes execution semantics for every existing bytecode
consumer), or (b) flatten recursion at compile time in the `.hs -> UAAL` emitter itself --
feasible only for bounded/tail-recursive patterns, and silently wrong (infinite unroll or wrong
depth) for unbounded general recursion. Option (a) is the only correct general solution; option
(b) is a scoped workaround that would need an explicit "recursion depth must be statically
boundable" carve-out documented up front, not discovered later.

### 2. Does `.hs`'s parser support recursion, or does it just not reject it? -- Confirmed: unresolved-by-construction, not specially supported.

`packages/compiler-wasm/src/parser.rs` is 3,051 lines (grown from an earlier 2,976/2,676-line
citation -- moving target, re-verify line numbers before editing). Function definitions parse via
`parse_function`. Calls parse via `parse_call_expression`, producing a `CallExpression` AST node
whose `callee` is just an `Identifier` -- **there is no symbol table or scope stack anywhere in
the crate** that resolves a callee name against known function definitions at parse time. This
means direct recursion (`A` calling `A`) and mutual recursion (`A` <-> `B`) parse through the
identical code path as an ordinary call -- not because the parser was built to support
recursion, but because it never checks callee existence or definition order at all. Confirmed no
existing test fixture anywhere in `packages/compiler-wasm` exercises recursion (grepped
`recurs`/`fib`/`factorial`/self-call patterns -- no hits).

`UaalBehaviorCompiler.ts:335-336` lowers `CallExpression` in a general fashion:
```ts
case 'CallExpression':
  return { call: this.lowerExpr(expr.callee), args: expr.arguments.map((a) => this.lowerExpr(a)) };
```
This is a data-shaped operand, not a bytecode instruction -- it doesn't touch `JUMP`/`JUMP_IF`
at all today, consistent with there being no `CALL` opcode to lower into. So "the parser parses
recursive calls fine" is true, but it proves nothing about *execution* -- the gap is entirely on
the VM/bytecode side (question 1), not the parser side.

### 3. WASM-boundary shape for a new export -- Low-risk choice confirmed, mirrors `compile_to_kotlin`.

`pub fn compile_to_uaal(source: &str) -> String` returning a JSON-serialized `UAALBytecode`
packet on success (matching the TS-side `UAALBytecode { version, instructions }` shape already
consumed by `vm.ts execute()`) or a JSON `{error}` object on failure -- same convention as
`compile_to_kotlin`. This part carries little risk; it's additive and doesn't touch the existing
`parse`/`validate`/`compile_to_kotlin` exports.

### 4. `.hsplus -> HoloComposition` bridge -- confirmed separate, adjacent, still unbuilt.

`docs/spec/spec-vs-reality-gap.md:81-82` (read directly this session): "`.hsplus` input (vs
`.holo`) needs the `.hsplus -> HoloComposition` bridge -- a known follow-up, not in this slice."
This is a prerequisite gap for anyone wanting `.hsplus` (not just `.holo`) to reach
`UaalBehaviorCompiler`, but it's orthogonal to the `.hs`-specific bridge scoped here -- `.hs` and
`.hsplus` are parsed by the same Rust grammar but are different source-language surfaces
(logic vs traits/brains, per F.120's three-format model) and would each need their own path to
UAAL bytecode.

## Recommendation -- sequencing, not implementation

1. **Do not build a `.hs -> UAAL` bridge yet.** The blocking design question is real: UAAL's VM
   has no execution model for function calls at all (no CALL/RET, no call-frame stack). Building
   an emitter before that ISA gap is resolved would produce bytecode that silently no-ops on
   every call site the moment it's not inlined -- a "lying-success" failure mode (cf. the G1/G2/G3
   lang-integrity gaps already tracked for the `.hs`/`.hsplus` parser elsewhere on this board).
2. **The real next buildable slice is the VM-side ISA decision** (CALL/RET + call-frame stack
   vs. compile-time recursion flattening with an explicit boundedness carve-out) -- that's a
   `packages/uaal` core change with its own premortem, not a `packages/compiler-wasm` change.
   Recommend filing that as its own scoped board task once a design direction is chosen, rather
   than folding it into "the .hs bridge" (the two are separable: VM ISA extension is reusable by
   a future frontend targeting UAAL generally, not just `.hs`).
3. Once the ISA question is resolved, the `.hs -> UAAL` emitter itself is a bounded, low-risk
   additive slice (new `uaal_emit.rs` module, one new `wasm_bindgen` export, same shape as
   `compile_to_kotlin`) -- no changes to `parser.rs` are needed since the parser already produces
   a `CallExpression` node adequate to drive whichever calling convention the VM adopts.
4. The `.hsplus -> HoloComposition` bridge (item 4 above) is unrelated blocking work for a
   different consumer (behavioral trait bodies via the existing `.holo`-shaped bridge) -- worth
   tracking as its own task, not conflated with this one.

## Files read directly this session (ground truth, not re-derived from memory)

- `packages/uaal/src/opcodes.ts` (full file, 191 lines)
- `packages/uaal/src/vm.ts` (full file, 362 lines)
- `packages/core/src/compiler/UaalBehaviorCompiler.ts` (grepped for CallExpression/recursion)
- `packages/compiler-wasm/src/lib.rs:74-193` (all `wasm_bindgen` exports incl. `compile_to_kotlin`)
- `docs/spec/spec-vs-reality-gap.md` (full G1-G9 table + G3/G4 detail sections)
- `packages/uaal/src/__tests__/*.test.ts` (test counts: 41+6+2=49)
- `git show --stat eb01d22e3` (loop-lowering commit, confirmed shipped same day)
- Subagent-verified (cross-checked, not solely relied upon): `packages/compiler-wasm/src/parser.rs`
  (function/call parsing, no symbol table) and `packages/compiler-wasm/src/ast.rs` (single
  `CallExpression` node, no self-call-specific node).
