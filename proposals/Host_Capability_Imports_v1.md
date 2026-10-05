# Holo features in the language: host capabilities as typed imports (G21) — v1

**Status:** Proposed 2026-09-28 under the Spec v0.1 gate rule (the four gates in
`docs/spec/holoscript-spec-v0.1.md` §No-break policy, not a person). This document is gate 1 (a
written proposal with measured breakage). Drafted by a research agent of the linguist seat and
reviewed by that seat, whose edits are marked "Review". claude3-x402 reviewed it at `a7facec17`
(changes requested); this revision answers that review: authority and phase 4 carry the
linguist's decisions of 2026-10-05, and the rest are corrections.
**Built:** phase 1 (the checker), 2026-09-29, branch `claude/holo-imports-checker`, with five
changes from a premortem of this plan: the stand-in rule (`HS-SCOPE-001`) sits in the check every
engine runs first; `@host` keys are strict (`authorty` makes the module unusable); a lookalike
scheme (`HOLO:absorb`) is refused, not read as a file path; the drift gate hashes the declaration
file as a build input; `.hsplus` holo imports are checked once per document, with or without typed
functions. A sixth change came from the switch-off run: a capability is only called by name, never
used as a value (`HS-HOST-003`), since `let f = manifest_audit_passes` let an untyped function
call it unchecked. The corpus has 14 cases: the ten below (numbered differently), plus a lookalike
scheme (`g21-009`), an alias's argument count (`g21-010`), a blocked name as an alias (`g21-013`)
and a capability passed on as a value (`g21-014`); the ten that were honest gaps flipped on
purpose. Engines refuse a valid Holo call by name
(`HS-HOST-004`; native refuses any `holo:` import earlier, as a non-relative path) until phase 2
binds it. **Review round (claude3, 2026-10-05; the linguist's decisions
the same day):** the checker admits a capability's name only as a direct call in the body of a
typed top-level function, by one walk over the whole file, and refuses every other use
(`HS-HOST-003`); a parameter, local, loop variable or lambda parameter that takes an import's
name, and an import that takes a built-in's name, are `HS-SCOPE-001`; a capability's arguments
must be proven of their declared types (`HS-TYPE-ARG-001`; an ordinary call accepts an unknown
one); ABI v1 is enforced when a declaration loads (moved here from phase 2), with a version up to
4294967295 and a lower-case ASCII name; a source with a space around it or a character outside
ASCII is `HS-HOST-001`, and `crdt://` reads as it did before G21. The corpus has 27 G21 cases.
**Built:** phase 2 (UAAL), 2026-10-04, branch `claude/holo-imports-uaal-exec`: `compile_to_uaal`
lowers a call to its arguments, each at its declared type, and `EXEC [abi, argc]`; a statement
call drops its result. One rule from building it: a declaration may pass only the four ABI v1
types (§Execution), so the checker never accepts a call no engine can carry. Native and Kotlin
refuse by name (`HS-HOST-004`; native refuses any `holo:` import earlier, as a non-relative path).
Phases 3–5 are not built.
**Gap:** new **G21** (suggested: next free id after G20, `docs/spec/spec-vs-reality-gap.md` 20–39).
**Board:** task_1790634920187_chz8; found while drafting: task_1790642739557_5kf8 (Kotlin
bridge), task_1790642739558_so3q (UAAL VM). **Builds on:** G11 (PR #438); phase 3 needs G15 built.
**Evidence:** lines are at commit `f15be4b45` (G11 branch). "Measured" means run on 2026-09-28
against its `pkg-node` checker (sha256 `b23ffa3a…`) or TypeScript sources, from a scratch directory;
the `.hs` snippets below also keep their verdicts on the stacked `@unknown` build `ee76333b2`.

## For Joseph, in plain words

Today a HoloScript program has no checked way to use HoloAbsorb, HoloCI or the other Holo tools. At
most it passes a tool's name as plain text, and nothing checks that name before the program runs.
The change: a program lists the Holo tools it uses at the top, and the checker refuses an unknown
or misspelled tool, or the wrong inputs, before anything runs. A tool runs only when whoever starts
the program has allowed it, and every use goes into the run's receipt. The first proof asks
HoloAbsorb whether its own product list is consistent, and it needs no internet. Nothing we have
breaks, because no file uses this form today.

## Why

- Programs reach a host through strings no checker reads: behavior-tree actions such as
  `process_exec` (`packages/core/src/stdlib/StdlibActions.ts` 293–296) and daemon actions
  (`packages/absorb-service/src/daemon/daemon-actions.ts` 1319–3256). An action with no handler gets
  no result (`packages/engine/src/runtime/profiles/HeadlessRuntime.ts` 665–758).
- The CLI turns MCP pipeline stages into a throw, a pass-through or a `console.warn`
  (`PipelineNodeCompiler.ts` 46–52, 71–72, 112–113, 141–142); the real `tools/call` emitter
  (`parser/PipelineCompiler.ts` 173–200) is imported only by tests. `mcp.call(...)` in
  `examples/brittney-workspace.holo` (410–504) has no provider in `packages/engine/src/runtime` or
  `packages/core/src/{runtime,state}`.
- G11 left "declaring host functions for typed code" as future work (its proposal, 168–172). 70
  `.hsplus` files in `packages/absorb-service/src` call undeclared host functions (e.g.
  `codebase_scanner.hsplus` 37, 51). `language-identity.md` 59–60: services move into HoloScript.

## What the change is

**Today (measured): all three readers accept the syntax; none gives it meaning.**

| Written                           | `.hs` (Rust reader)                          | `.hsplus`                                                                                | `.holo`                                             |
| --------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `import { f } from "holo:absorb"` | parses, **valid** (`parser.rs` 940–974)      | `@import { f } from …` parses (`HoloScriptPlusParser.ts` 2948–3028; on by default, 1202) | parses, kept (`HoloCompositionParser.ts` 1095–1134) |
| `import { f as g } from …`        | binds `g` only (`semantic_types.rs` 182–186) | parses, but records `f`, `as`, `g` as three names (2957–2966)                            | parses, keeps `local: "g"`                          |
| `import * as NS from …`           | refused: `Expected From, got Star`           | parses (2976–2992)                                                                       | refused: `Expected LBRACE, got STAR`                |
| `import "holo:absorb"`            | refused: `Expected From, got String`         | parses                                                                                   | parses (1100–1106)                                  |

The `.hs` checker never reads the source, and an imported name enters `values` but not `arities`
(`semantic_types.rs` 170–186): a misspelled import, a wrong argument count and
`holo:no-such-service` are all `valid: true` (measured). Every engine then refuses: `uaal_emit.rs`
531–547, `kotlin_emit.rs` 1253, native `compiler-native/src/project.rs` 165–170.
`.hsplus` imports would be read as file paths (`parser/ImportResolver.ts` 250–255, 368–371).

**The rule.** (1) An import source starting with `holo:` names a capability module: `holo:` plus
one lowercase name, `[a-z][a-z0-9_]*`, the product's name after "Holo" (`holo:absorb`; later
`holo:ci`, `holo:mesh`). (2) Named imports only; namespace and bare forms are refused for `holo:`,
so a file's import list shows every capability that file uses itself. Imports chain: native inlines
relative imports (`compiler-native/src/project.rs` 125–141), so a run can reach a capability its
entry file does not list, and run admission (phase 3) collects them from every module in the run.
(3) A capability is a typed function with its module's declared signature, and every existing
check applies. (4) The capability set is part of the checker build, because `.hs` means what
`validate_detailed(source)` accepts (Spec v0.1 decision (a), line 31). "The checker" means both
committed builds, the node build (`pkg-node`) and the browser build (`pkg`, the `@holoscript/wasm`
default), which #448 rebuilds from one source and holds to one digest. Until #448 lands the browser
build is the 2026-08-04 one and gives older verdicts; `distributions/systems/wasm` is an older
copy, not the checker. Not `@holoscript/absorb`: that is the registry pattern (`ImportResolver.ts`
185), fetched remotely (350–357). Not `holoscript/absorb`: a relative path (129). `holo:` cannot
pass for a drive letter (135).

**Names.** "Capability" already means five things here: HS010's blocked words (`lexer.rs` 5–18),
UAAL machine features (`HS-UAAL-CAP-001`–`007`, `uaal_emit.rs` 3029–3038), the runner's primitives
(`HostCapabilities`, `TraitTypes.ts` 161–172), HoloAbsorb manifest entries (`holoabsorb/index.ts`
15–35) and frames' `capability_tier` (`FrameDeclarationTrait.ts` 65). Hence `HS-HOST-*` codes and
an `@host` block; below, "capability" means only a function imported from `holo:`.

**Where declarations live.** (a) One `.hs` file per module, `packages/std/src/holo/absorb.hs`,
valid today (measured); `@host` is an existing form, a top-level trait with a config:

```hs
@host { function: "manifest_audit_passes", authority: "holo_absorb_manifest", version: 1 }

export function manifest_audit_passes(): bool {
  return unknown("holo:absorb/manifest_audit_passes needs a host")
}
```

The block names the authority and the ABI version. The body says what the call means with no
host: `unknown` with a reason (a built-in, `semantic_types.rs` 28–41). Engines never run it; they
bind the call or refuse it. (b) A JSON manifest, `{"module":"absorb","functions":[{"name":…}]}`.

|           | (a) `.hs` declarations                                                                                                                                     | (b) JSON manifest                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Types     | the same parser and checker; the signature becomes a `FunctionSignature` with parameter and result types (`semantic_types.rs` 119–122)                     | types as strings, a second grammar; today's checker context holds names and counts only (`lib.rs` 189–221)    |
| Direction | when a service function is rewritten in HoloScript, its body becomes real and its binding is deleted; callers do not change (`language-identity.md` 59–60) | a format beside HoloScript that nothing migrates out of                                                       |
| Precedent | std keeps language contracts as `.hs` (`packages/std/src/abi/scalar-v1.hs` 1–9)                                                                            | absorb tool ownership is already a TypeScript registry (`holoabsorb/index.ts` 15–35); JSON makes a third list |
| Cost      | the checker has no file system (`kotlin_emit.rs` 1253), so files are embedded with `include_str!` (today only in tests, `eval.rs` 3812–3813)               | the same: decision (a) needs the manifest inside the checker too                                              |

**Recommendation: (a).** Bindings, the host code that performs a call, belong to each service and
are keyed by ABI name; the absorb binding goes in its existing `holoabsorb/index.ts`.

**Review: the pairing is checked, not assumed.** An `@host` block names its function by a string
(`function: "manifest_audit_passes"`), so a typo would leave a function with no authority and a
block that governs nothing. Embedding a module must therefore refuse it, at checker build time,
unless its `@host` blocks and its exported functions pair one to one: every block names an
exported function of the file, every exported function has exactly one block, and no two blocks
share a function or an ABI name. This is a requirement on phase 1, not something measured: a Rust
test there feeds each broken pairing and expects the build step to refuse it. The pairing does not
check types; ABI v1 does (§Execution). (A structural form, the block written on the function
itself, would make the pairing syntactic; .hs has no annotation on functions today, so that is
left to a later revision.)

## Checker semantics

For `import { a as b } from "holo:m"`, added to `check_semantics_with` (`kotlin_emit.rs` 562–571):

| Case                                                                                                                    | Refusal                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `m` is not an embedded module; the source is malformed (`holo://…`, `holo:Absorb`, `holo:absorb/x`); not a named import | `HS-HOST-001` (new)                                                                                  |
| `m` declares no `a`; the message names the closest declared name                                                        | `HS-HOST-002` (new)                                                                                  |
| `b` is also a top-level function, struct or enum of the file                                                            | `HS-SCOPE-001`, a code phase 1 gives the top-level collision check, which has none today (see below) |
| `b` is used outside a function that states its types                                                                    | `HS-HOST-003` (new): untyped functions keep their unchecked reading (G11)                            |
| `b` is used as a value (stored, passed or returned), not called (added in phase 1, found by its switch-off run)         | `HS-HOST-003`: as a value it could reach code that calls it with nothing checked                     |
| wrong argument count, argument type or result type                                                                      | existing `HS-ARITY-001`, `HS-TYPE-ARG-001`, `HS-TYPE-ASSIGN-001`, `HS-TYPE-RETURN-001`               |
| the file's own `@frame_declaration` does not allow `a`'s authority (phase 3)                                            | `HS-HOST-005` (new)                                                                                  |
| a word on the HS010 list (`exec`, `process`, `fs`, …)                                                                   | `HS010`, unchanged (`lexer.rs` 5–18; measured on an import name)                                     |

**`HS-SCOPE-001` for a top-level collision (review).** Today that collision is refused by
`check_top_level_declaration_collisions` (`kotlin_emit.rs` 522–545) with a sentence and no code, and
`HS-SCOPE-001` means a declaration that hides a name still visible in its block (Spec v0.1 838).
Phase 1 gives the collision of a `holo:` name with a top-level function, struct or enum that code,
in that check (`holo:` names join its site list, 573–580; relative imports do not), and the spec
line widens with it. Corpus case `g21-006` pins it.

A resolved `b` enters the program's own tables, `values`, `arities` and `functions`
(`semantic_types.rs` 149–218; the last holds parameter and result types), so existing checks run
unchanged. Measured: with `{"functions":[{"name":"manifest_audit_passes","arity":0}]}` as context,
one argument is already `HS-ARITY-001` (2:10). A `bool` into an `i32` local is `HS-TYPE-ASSIGN-001`
only when the function's typed signature is in the same source: the context holds names and counts,
not types.

**`.hsplus` (fragment mode).** The context JSON gains `"imports":[{"source","specifiers"}]`, read
by `parse_check_context` (`lib.rs` 189–221) into `ExternalDeclarations` (`semantic_types.rs` 46–51)
and resolved like an `import` node. The bridge (`hsplusRustTypeCheck.ts` 132–168) sends `holo:`
imports there, not under `names`, so an older checker (it reads only `names` and `functions`)
refuses the call with `HS-NAME-002`: it fails closed. Import codes land on the `@import` line, and
the reader's three-name record of `{ a as b }` is fixed (no tracked `.hsplus` file has `as` there).

## Execution

A call lowers to `EXEC ["holo.<module>.<function>.v<N>", argc]`, beside the `hs.*` ABIs
(`uaal_emit.rs` 44–56, `packages/std/src/uaal-abi.ts` 8–14), with the `hs.i32.binary.v1` stack
contract (arguments left to right, one result pushed). `N` is the `@host` version. v1 carries
`i32`, `f32`, `f64`, `bool`; handlers may be async (`uaal-abi.ts` 33–36; awaited at `vm.ts` 726).
Nothing enforced v1 at `a7facec17`: a `string` parameter in a declaration was valid, and a stale
binding that pushes `"pass"` for a `bool` ends `HALTED` with `"pass"` (one that pushes nothing ends
with `null`). A declaration may use only the four v1 types, enforced when it loads since phase 1
(#466, moved there from #487), so no declaration names a type an engine cannot carry. A
binding's result is checked against the declared type by phase 3's binding table, so a wrong type
or no result is an `ERROR`.

**Versions.** A signature is fixed for its version. Changing a parameter's or the result's type, or
the number of parameters, needs a new version (`version: 2`, ABI name `….v2`) declared beside the
old one, and the old version stays declared, with its binding, until it is removed under the
no-break policy: announced in a spec revision, kept for at least one 0.x patch, removed through the
same gates. No 0.x patch changes what an existing version accepts.

| Engine                  | In v1                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compile_to_uaal`       | lowers a declared call to its arguments and the `EXEC` (built, phase 2)                                                                                                                                                                                           |
| UAAL host (TypeScript)  | `registerHoloScriptStdUaalExecHandler` (`uaal-abi.ts` 509–529) takes an optional table from ABI name to binding; a `holo.*` name not in it throws, as every unknown ABI does today (527)                                                                          |
| `holoscript run`        | a `.hs` file with a `holo:` import goes `validate_detailed` → `compile_to_uaal` → UAAL VM with that handler (an import with no binding: `HS-HOST-007` before start); prints `main`'s value; writes the receipt. Other files keep today's route (runner 1126; G18) |
| `.hsplus`, `.holo`      | refused at `run` admission with `HS-HOST-004`: their bodies run as JavaScript (`HeadlessRuntime.ts` 466–481; G19)                                                                                                                                                 |
| daemon                  | unchanged; not the proof path, because it exits unless an LLM answers a one-token call (runner 2314–2319)                                                                                                                                                         |
| native (Cranelift)      | `HS-HOST-004`. Later: a host call table, each capability an imported symbol `holo_<module>__<function>__v<N>` declared with `Linkage::Import` as `malloc`/`free` are (`compiler-native/src/lib.rs` 4604–4624)                                                     |
| Kotlin / Quest          | `HS-HOST-004`; a bridge is later work                                                                                                                                                                                                                             |
| MCP pipelines (phase 4) | a `type: "mcp"` stage naming a declared authority compiles to the real `tools/call` emitter, pointed at the local MCP (127.0.0.1:7411), not its default `https://mcp.holoscript.net` (`PipelineCompiler.ts` 175, 181)                                             |

**Codes.** One meaning each (the review found 004 and 005 carrying three and two):

| Code          | Meaning                                                                               | Where                       |
| ------------- | ------------------------------------------------------------------------------------- | --------------------------- |
| `HS-HOST-001` | not a capability module, a malformed `holo:` source, or not a named import            | checker                     |
| `HS-HOST-002` | the module declares no such name; the message names the closest one                   | checker                     |
| `HS-HOST-003` | a capability used outside a typed function, or used as a value                        | checker                     |
| `HS-HOST-004` | this engine or route performs no capability call (native, Kotlin, `.hsplus`, `.holo`) | engine, `run` admission     |
| `HS-HOST-005` | a frame does not allow the authority                                                  | checker, `run` at each call |
| `HS-HOST-006` | the operator did not allow the module (`--allow-capability`)                          | `run`, before start         |
| `HS-HOST-007` | no binding is installed for the capability's ABI name                                 | `run`, before start         |

Each message names the capability (`holo:absorb/manifest_audit_passes`), its authority and the
code. `holoscript run` stops with exit 2 on any of them, as it does today on an admission or parse
failure (runner 1122, 1144), and the run receipt records the refusal.

Measured on the real VM with hand-built bytecode holding one capability `EXEC`: with the std
handler the run ends `ERROR`; with no `EXEC` handler it halts normally with `null` (`EXEC` has no
built-in case, and the default pushes `null`, `vm.ts` 879–884). So the route always registers it.

## Authority

A capability call uses authority; the first refusal wins:

1. **Checker:** unknown module or name; an HS010 word; the file's own `@frame_declaration` does not
   allow the authority (`HS-HOST-005`; the Rust AST already carries frames, `ast.rs` 814–866).
2. **Engine:** an engine or route that performs no capability call refuses it (`HS-HOST-004`);
   `run` refuses a capability with no installed binding before start (`HS-HOST-007`).
3. **Host switch:** `holoscript run` builds its handler table for each run from the operator's
   list, `--allow-capability holo:absorb` (like `--allow-shell`, runner 327). A binding whose module
   is not on the list is not in the table, so nothing can call it; a program that imports one is
   refused before start (`HS-HOST-006`, exit 2). The table is the grant, so an embedder passes the
   same list and the route builds the table; it never takes a ready-made table.
4. **Frames at run time:** a call needs **both** the file's frame and the running agent's frame to
   allow its authority (the intersection): `checkToolAllowed(frame, authority)` on each, before each
   call (`FrameDeclarationTrait.ts` 177–201; the MCP gate calls it at
   `mcp-server/src/tool-call-checks.ts` 129); a denial is `HS-HOST-005`. With no frame anywhere,
   only the operator's switch decides. G15's meaning of an omitted list is unchanged. The run has
   no input for an agent's frame today; phase 3 adds one to `holoscript run`, and a frame it cannot
   read is a refusal, not a missing frame. `denied_domains` does **not** win yet:
   `checkToolAllowed` applies it only when given a third argument, a domain tag (183–189); with
   two, a frame that denies the tool's domain still allows the call, and the MCP gate passes two
   (129). Phase 3 passes the capability's domain tag before this list may say otherwise.
5. **MCP gate** (phase 4): `gateToolCall`, with founder denials, the frame, x402 scope and one
   receipt per call (`tool-call-checks.ts` 114–141).

**What phase 3 may bind (decision, 2026-10-05).** Only pure capabilities run in-process: no side
effects, no network, no writes (`manifest_audit_passes` is one; `holoabsorb/index.ts` has no
imports). An in-process binding has the whole process's rights, and its authority string is only a
label: layers 1–4 above never reach FounderGate or x402 scope. Anything that is not pure waits for
the gated route of phase 4, through `gateToolCall` (FounderGate, x402 scope, receipts).

The authority name is the MCP tool the binding performs, so one `allowed_tools` list is meant to
govern both paths. It does not yet: the stateless `/mcp` route that the pipeline emitter posts to
calls `securedToolExecution` without `gateToolCall` (`mcp-server/src/http-server.ts` 3589, 3679; the
fix, #463, is open and observe-first), so phase 4 waits for that route to be gated. G15 first: here
and on origin/main `52977e2c7` an empty list still means every tool (`FrameDeclarationTrait.ts` 108,
191–192; `ast.rs` 842–844). Every call, allowed or denied, adds a run-receipt entry (runner 983,
1058): capability, authority, decision, argument and result digests.

## First slice (the proof): HoloAbsorb's manifest audit

HoloAbsorb first: HoloCI's worker is paused by an open P0 (task brief), and this function is pure
(`packages/absorb-service/src/holoabsorb/index.ts` has no imports).

- **Capability:** `holo:absorb` `manifest_audit_passes(): bool`, true when `auditHoloAbsorbManifest()`
  (`holoabsorb/index.ts` 534–536) returns `status: "pass"` (504–507). That function also answers MCP
  tool `holo_absorb_manifest` (`mcp/codebase-tools.ts` 5907–5921, 7097–7101), owned by the manifest's
  `evidence` capability (264–275), which gains `holo:absorb` as an entrypoint.
- **Binding:** exported from `holoabsorb/index.ts` as `holo.absorb.manifest_audit_passes.v1` and
  loaded by dynamic import, as the runner loads the daemon (2013–2014); absorb-service depends on core.
- **Program** `examples/capabilities/absorb-audit.hs` (valid today, for the wrong reason):

```hs
import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  return manifest_audit_passes()
}
```

- **Demo:** `holoscript run examples/capabilities/absorb-audit.hs --allow-capability holo:absorb`
  prints `true`; the receipt shows one allowed call. No switch: `HS-HOST-006`, exit 2, zero audit
  calls. `manifest_audit_pases`: `HS-HOST-002` at 1:10, naming `manifest_audit_passes`; that
  position needs a location on `ImportSpecifier`, which has none today (`ast.rs` 532–535), so phase
  1 adds one (not serialized, as `param_locs` is not).
- **Needs:** Node, installed packages, a rebuilt `pkg-node`; no network, MCP server, LLM, cargo or
  clang. **Measured:** the audit returns `pass` in-process (6 checks, 10 capabilities, 28 tools),
  and a scratch `EXEC` handler calling it returned `true` on the real VM.

## What existing files would break

Measured on `f15be4b45` with `git grep`, tracked files only: **none.** The no-break policy (Spec
v0.1 895–899) lets a reader start refusing what it accepts today only through a proposal that
measures what breaks and passes the gates; cases 002–008 below are valid today and become
refusals, which that clause allows because no tracked file has the form.

- In 137 `.hs`, 2,474 `.hsplus` and 1,910 `.holo` files, 33 lines match
  `^\s*import\s|@import\b|^\s*using\s` (9 are comments); none has a `holo:` source or any URI scheme.
- Nearest strings, unaffected: two `holo://assets/…` asset URIs, not imports
  (`fixtures/native-renderer/assets-xr-device.holo` 20, 27), 7 `holoscript/<lib>` import lines in
  two showcase files, `@holoscript/ui-essentials` (`04-modules-imports.hsplus` 26), 32 `crdt://`
  `source:` values. ai-ecosystem: 361 sources, 0 strings that begin with `holo:`, 2 import lines,
  no scheme. Hololand (measured 2026-10-05, read only): 736 files (87 `.hs`, 402 `.hsplus`, 247
  `.holo`), 173 import lines, 0 strings that begin with `holo:` in any tracked file, no import
  source with a scheme.
- Spec corpus: 0 of 53 cases mention `holo:`. Every other new rule touches only `holo:` importers.

## The test that proves it

1. **Corpus** (`hsplus-spec-corpus.v0.jsonl`; the gate runs `validate_detailed` per case,
   `check-spec-corpus.mjs` 144), `g21-001`…`010` in order: the demo, valid; `manifest_audit_pases` →
   `HS-HOST-002`; `holo:no_such` → `HS-HOST-001`; one argument → `HS-ARITY-001`;
   `let n: i32 = manifest_audit_passes()` → `HS-TYPE-ASSIGN-001`; import plus a same-named function
   → `HS-SCOPE-001`; a call from untyped `function check()` → `HS-HOST-003`;
   `from "holo://assets/terrain"` → `HS-HOST-001`; `import { exec }` → `HS010` (true today, pinned);
   `import { add as combine } from "./math.hs"` stays valid. Cases 002–008 are valid today
   (measured): they land as `honest-gap` cases first and flip on purpose when built (gate 2).
2. **Differential:** every refusal case through the checker, `compile_to_uaal`,
   `compile_to_kotlin` and `holoscriptc`; all four refuse. The demo runs on the UAAL route
   (`true`); native and Kotlin refuse it with `HS-HOST-004`. Extends G11's differential test.
3. **Runner** (extend `packages/core/src/cli/__tests__/holoscript-runner.run.test.ts`): switch on,
   `true` and one receipt entry; switch off, `HS-HOST-006`, exit 2 and zero audit calls (spy); an
   agent frame without `holo_absorb_manifest` (after G15, also `[]`) denies at the call with zero
   audit calls.
4. **Handler** (extend `packages/std/src/__tests__/uaal-abi.test.ts`): unknown `holo.*` ABI →
   `ERROR`, never `null`. **Cross-check** (extend `holoabsorb/index.test.ts`): each declared
   function has one binding, and its authority is in the manifest's `toolNames` and the MCP tools.
5. **Switch-off run (gate 3)**, recorded on the pull request, each turning a test red: resolve
   `holo:` names as plain names (002, 003, 008); skip the signature merge (004, 005); skip
   admission; push `null` for an unknown ABI; list `holo:` names under `names`; skip the frame check.

No new script files (standing hold). Four existing gates in `scripts/holo-ci/` grow instead:
`check-spec-corpus`, `check-compiler-wasm-drift` (hashing the declarations),
`check-std-abi-conformance-node` and `check-mcp-gate-coverage`.

## Implementation phases

1. **Checker** (after #438): declaration file and embedding; rules and codes; context `imports`;
   bridge; a location on `ImportSpecifier`; a WASM export listing modules as JSON; corpus gaps, then
   flips; both builds (`pkg-node`, `pkg`) and their receipts.
2. **Engines:** `compile_to_uaal` lowers to `EXEC`; native and Kotlin refuse with `HS-HOST-004`.
3. **Host** (after G15): handler table, absorb binding, `run` route, switch, frame checks, receipt
   entries; `core` gains `@holoscript/uaal` and `@holoscript/std` (neither depends on `core`).
4. **MCP:** bindings over `tools/call` through `gateToolCall`; MCP stages compile to them; one
   `compilePipelineSourceToNode`, not two (`PipelineNodeCompiler.ts` 404, `PipelineCompiler.ts` 787).
   A stage `server:` that is not the configured MCP URL (`HOLOSCRIPT_MCP_URL`) is refused at compile
   time (decision, 2026-10-05): today the emitter takes a stage's `server:` as the base URL and sends
   `HOLOSCRIPT_API_KEY` to it (`PipelineCompiler.ts` 174–187), so a pipeline naming another host gets
   the key. That existing path is its own security task (board task obsc, PR #495), fixed apart from
   this proposal. Phase 4 also waits for the stateless `/mcp` route to run `gateToolCall` (§Authority).
5. **Reach:** `.holo` name checks; the LSP package table (`lsp/ImportResolver.ts` 36) reads the same
   export; the next module (HoloCI, once its P0 clears); the Spec v0.1 entry; G21 closes.

## Open questions

1. Authority name: the MCP tool (`holo_absorb_manifest`; proposed, one allowlist for both paths)
   or the capability path (`holo:absorb/manifest_audit_passes`; readable where it is used)?
2. Should the UAAL VM itself refuse an `EXEC` with no handler (`vm.ts` 879–884)? That changes every
   host, so it needs a census of `EXEC` users first. **Review:** yes, as its own change (task
   so3q): the default branch pushes `null` for every opcode without a case or handler, not only
   `EXEC`, which is a silent success the honesty rules do not allow. This proposal does not wait
   for it; its route always registers the handler.
3. The body relies on `unknown(...)` fitting any declared type (measured on `f15be4b45` and
   `ee76333b2`). If later `@unknown` work tightens that, is a bodiless declaration (new syntax) better?
4. Until G19, should `.hsplus` capability calls stay refused (proposed) or use the Rust evaluator's
   host bindings (JSON marshalling, `unknown-host-binding` errors; `holoscript_wasm.d.ts` 83–105)?
5. How does a declared `.hs` struct map onto a tool's JSON result? v1 binds one `bool`.

## What remains after this proposal

- One capability, one route. HoloCI, HoloMesh, HoloEmbed, HoloDaemon, HoloKey, HoloTorch, HoloServe,
  HoloClaw, HoloShell, HoloTest and HoloTune stay tool-only; native and Kotlin/Quest refuse all.
- `.hsplus` and `.holo` can import and be checked, not run capability calls (G19); `run` still reads
  other `.hs` files with the `.hsplus` reader (G18).
- Untouched: the five HoloMap traits (`holomap-reconstruction.ts` 15–21, in `VR_TRAITS` via
  `constants/index.ts` 480; handlers named only in their own files and tests), `@hololand.<event>`
  (sunset, `HoloScriptPlusParser.ts` 3260–3281), `sub_orb … "holohub://…"`
  (`HoloCompositionParser.ts` 3088), `codebase`/`module_map`/`call_graph` (`tokens.ts` 555–562),
  `holoci "x" {}` (valid, an uninterpreted `custom` block; G13), `mcp.call`, and
  `crdt://holomesh/feed`, whose loader imports `@loro/loro` (`ImportResolver.ts` 469), a name no
  `package.json` declares.
- Not settled here: a limit on a binding that never returns (`vm.ts` 726 awaits it), a switch per
  function rather than per module, an off-switch and rollback for a bad binding, and a written threat
  model; phase 3 must answer the first before it binds anything.
- Action strings stay unchecked; the VM still returns `null` for an unhandled `EXEC`; ABI v1 is
  scalars only; each capability needs a checker rebuild. Found in passing, not fixed here:
  `compile_to_kotlin` drops `export function f` while `main` still calls `f` (measured), and the
  linguist review found it also ignores a declared return type (`function f(): i32` becomes
  `fun f(): Float`); both are task 5kf8. The UAAL VM's `null` for an unhandled opcode is task so3q.
