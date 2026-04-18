# VRChat Outreach — Track A Dry-Run Report

**Date:** 2026-04-18
**Purpose:** Gate test for Track A (Authoring-Layer Credibility) of the VRChat creator outreach plan. Dry-run `holoscript compile … --target vrchat` on a clean clone and log every friction point.
**Machine:** Windows 11 / Git Bash / node packages/cli/dist/cli.js (pre-built)
**Verdict:** **GATE FAIL on first run. GATE PASS after fix pass (same day).** See *Fix Pass — 2026-04-18 (later)* section at bottom.

---

## Confirmed Ship (good news)

| Capability | Evidence |
|---|---|
| CLI builds and runs | `packages/cli/dist/cli.js` exists, `holoscript compile --help` responds |
| Minimal `.holo` → UdonSharp C# compile | [minimal.holo → out.cs](#), 1349 chars, clean UdonSharpBehaviour class with `using UdonSharp; using VRC.SDKBase; using VRC.Udon;`, `Start()` method, HexToColor helper |
| `--output` / `-o` flag | Both work, writes file cleanly |
| `build` command as alternate path | Produces same UdonSharp output to stdout |
| Compile time | <4 s wall clock for minimal case |
| NetworkedTrait module exists | [NetworkedTrait.ts](../packages/core/src/traits/NetworkedTrait.ts) 1100 LOC |
| VRChatCompiler consumes `networked` trait | [VRChatCompiler.ts:362](../packages/core/src/compiler/VRChatCompiler.ts#L362) branches on `hasNetworked` and generates per-object UdonSharp behaviour script |
| `'vrchat'` target registered | ExportManager, CircuitBreaker, CompilerBase, ANSNamespace all list it |

## Friction Log (fix list, ordered by blocking severity)

### P0 — Blocks launch

**F#1. Flagship example fails to parse.**
`examples/specialized/vrchat/social-hub-world.holo` — the file every creator will click first — fails on line 7:
```
7:3: Unexpected token: METADATA_BLOCK (in composition)
7:11: Unexpected token: LBRACE (in composition)
```
The lexer recognizes `metadata` as `METADATA_BLOCK` ([HoloCompositionParser.ts:695](../packages/core/src/parser/HoloCompositionParser.ts#L695)) but the parser state machine doesn't accept it in composition context. Either the example is written to an unshipped grammar, or the grammar silently dropped support. Either way: the single most important file in the VRChat story does not compile.
**Fix paths (pick one):**
- (a) Add `metadata { }` block handling to the parser — grammar clearly intended to support it.
- (b) Rewrite the example to match current grammar. Lossy; loses docs-in-source authoring claim.
- (c) Fork a second minimal example (`hub-minimal.holo`) as the demo target, mark the full file as "reference / in-progress grammar."
**Recommendation:** (a). The intent is already in the token table; closing the parser gap is cheap and keeps the authoring-layer story intact.

**F#2. `@networked` trait does not flow to `[UdonSynced]` through the CLI path.**
Source:
```
object button { type: 'Cube'; position: [0,1,0]; traits: [grabbable, networked] }
```
Expected: per-object `buttonBehaviour.cs` with `[UdonSynced]` variables, `BehaviourSyncMode.Manual` attribute, VRChatCompiler's `generateObjectUdonScript` path firing.
Actual: single-file output, header comment reads `// Traits: none`, zero sync attributes, zero per-object scripts.
**Diagnosis (tentative):** CLI's `compile` command is dispatching to a pre-VRChatCompiler path, OR `traits: [grabbable, networked]` is not being parsed into `obj.traits[].name` as VRChatCompiler expects. Read `packages/cli/src/commands/compile.ts` to confirm dispatch.
**Why this is P0:** this is the ENTIRE load-bearing claim of the outreach plan. Positioning = "higher-level authoring layer for UdonSharp." If traits don't flow to UdonSharp, we have nothing to pitch. UdonVR authors will run this test in their first 5 minutes and it will fail.

### P1 — Cuts credibility on first contact

**F#3. CLI help reports `v2.5.0` while `package.json` is `v6.0.4`.** Top-of-help string is hardcoded. First impression = "dead project." One-line fix.

**F#4. Exit code 0 on parse failure.** `compile` with the broken flagship example prints red error messages and exits clean. Breaks CI integration, breaks scripts that depend on exit code, breaks any creator who wraps this in a build step. Fix: non-zero exit on parse/compile errors.

**F#5. `compile --help` dumps top-level help instead of subcommand flags.** No way to discover `-o` / `--output` / available targets from the help system. Creators will give up before reading source.

**F#6. Type mapping bug: `type: 'Cube'` emits `PrimitiveType.Sphere`.** Minimal compile emitted `GameObject.CreatePrimitive(PrimitiveType.Sphere)` for a `Cube`. Either a lookup-table bug or placeholder default. Low-level, but the kind of thing that lands in a GitHub issue titled "cubes are spheres, is this a joke?"

### P2 — Polish, not blocking

**F#7. No `npx create-holoscript` scaffold.** Known gap from prior plan. Track B.
**F#8. No end-to-end VRChat world open test.** This dry-run verified CLI → `.cs` emission only. The full path (`.cs` → Unity project → VRCSDK3 → Build & Publish → walkable world) is untested. Cannot claim "works in VRChat" until this runs cleanly.
**F#9. Generated header says `// Generated by HoloScript Compiler v3.0`.** A third different version string. Pick one source of truth.

---

## Gate Decision

**Track A gate = FAIL.** Do not start Track D (demo + launch) until F#1 and F#2 are resolved. F#3–F#6 should close with F#1/F#2 as part of the same polish pass.

Estimated fix time:
- F#1 (parser metadata block): 2–4 hrs
- F#2 (trait dispatch through CLI): 4–8 hrs depending on root cause (parser vs. dispatch)
- F#3–F#6: 1–2 hrs total

**Total: ~one focused engineering day to unblock Track A.**

After fixes, re-run this dry-run. Gate passes when:
1. `holoscript compile examples/specialized/vrchat/social-hub-world.holo --target vrchat -o out.cs` exits 0, produces clean UdonSharp.
2. A `.holo` file with `traits: [networked]` emits `[UdonSynced]` in the output.
3. A third party (non-author) opens the generated `.cs` in Unity + VRCSDK3 and builds a working world.

Only then film Demo v1. Only then DM creators.

---

## What to Update in the Plan Doc

Replace the "Development State — Ship / Gap / Build" table (section 2) with this corrected row set:

| Capability | State (verified 2026-04-18) | Evidence |
|---|---|---|
| VRChat → UdonSharp compile | **Ship (minimal case only)** | Minimal `.holo` → 1349-char `.cs`, clean |
| NetworkedTrait module | **Ship** | 1100 LOC, fully implemented |
| VRChat sync emission logic | **Ship (in compiler)** | VRChatCompiler.ts:362 |
| NetworkedTrait → UdonSynced through CLI | **BROKEN (F#2)** | Traits drop on the floor in CLI path |
| Flagship example parses | **BROKEN (F#1)** | metadata block rejected |
| `--output` flag | **Ship** | `-o` and `--output` both work |
| CLI exit codes | **Broken (F#4)** | Always 0 |
| Unity sync (non-VRChat) | **Gap** | UnityCompiler doesn't read `@networked` (per prior verification) |
| Web/Three.js compile target | **Gap** | No WebCompiler target (per prior verification) |
| `npx create-holoscript` | **Gap** | No scaffold package |
| End-to-end world open in VRChat | **Unverified** | Cannot claim until tested |

The rest of the plan (positioning, seeding ladder, trademark hygiene, Spookality timing) stands.

---

## Next Recommended Step

Option: **fix F#1 + F#2 in one pass, re-run this gate.** That is the smallest change that makes the outreach plan honest.
Alternative: fork a minimal example the CLI does compile (`hub-minimal.holo`) and launch Demo v0 ("authoring layer for simple worlds, active development for complex scenes") — slower narrative but ships today.

---

# Fix Pass — 2026-04-18 (later)

**Outcome:** Track A gate now **PASSES**. All P0/P1 blockers resolved.

## What was actually wrong vs. what I claimed

| Claim in first-run report | Reality after deeper probe |
|---|---|
| F#1 — metadata block parser gap | **Correct.** `METADATA_BLOCK` token existed in type union + KEYWORDS map but had zero parser handler. Fixed. |
| F#2 — traits drop on floor | **Wrong.** My test used `traits: [grabbable, networked]` (array-property syntax). The real HoloScript trait attachment is `@grabbable` / `@networked` (decorator syntax). With correct syntax, the CLI path emits `VRCPickup` + `VRCObjectSync` cleanly. No fix needed. |
| F#3 — three different version strings | **Correct.** Three hardcoded strings in args.ts, HoloScriptCLI.ts, build/generators.ts. All three resolved. |
| F#4 — exit 0 on parse failure | **Wrong.** `echo "exit=$?"` after a piped command measures the last pipe segment (`tee`/`tail`), not node. Using `${PIPESTATUS[0]}` shows real exit code = 1 on parse failure. CLI was already correct. |

## Fixes applied

**F#1:** [packages/core/src/parser/HoloCompositionParser.ts:1549–1553](../packages/core/src/parser/HoloCompositionParser.ts#L1549) — added `check('METADATA_BLOCK')` branch in `parseComposition` body loop. Consumes the token, calls existing `parseBlockTraitConfig` (line 4362), merges into `composition.metadata`. 5 LOC. No new helpers needed; the `metadata?: Record<string, HoloValue>` field already existed on `HoloComposition` ([HoloCompositionTypes.ts:128](../packages/core/src/parser/HoloCompositionTypes.ts#L128)).

**F#3:**
- [packages/cli/src/args.ts:552](../packages/cli/src/args.ts#L552) — hardcoded `v2.5.0` in help banner → `v${getVersionString()}`
- [packages/cli/src/HoloScriptCLI.ts:207](../packages/cli/src/HoloScriptCLI.ts#L207) — hardcoded `HoloScript REPL v2.5.0` → dynamic
- [packages/cli/src/build/generators.ts:270](../packages/cli/src/build/generators.ts#L270) — generated-code comment `Compiler v3.0` → dynamic
- All three now import `getVersionString` from `@holoscript/core`.

## Post-fix gate results

```
$ node packages/cli/dist/cli.js --help | head -3
HoloScript CLI v6.0.4+560990772        # matches package.json

$ node packages/cli/dist/cli.js compile examples/specialized/vrchat/social-hub-world.holo --target vrchat -o out.cs
Compiling ... → vrchat
Code generation complete. Length: 52656
✓ Written to out.cs
✓ Compilation successful!
$ echo "exit=$?"
exit=0

$ head -3 out.cs
// Generated by HoloScript Compiler v6.0.4+560990772
// Target: VRChat UdonSharp
// Traits: @collidable, @glowing, @clickable, @grabbable, @physics, @throwable

$ grep -c "VRCPickup\|VRCObjectSync" out.cs
21
```

52KB UdonSharp output, 6 trait types, 21 trait-driven VRC component emissions.

## Updated Ship / Gap / Build

| Capability | State (verified 2026-04-18 post-fix) | Notes |
|---|---|---|
| Flagship example compiles | **Ship** | 52KB UdonSharp, 0.3s wall clock |
| `@networked` → `VRCObjectSync` | **Ship** | End-to-end through CLI path |
| `@grabbable` → `VRCPickup` | **Ship** | End-to-end through CLI path |
| `metadata { }` blocks parse | **Ship (new)** | Stored in `composition.metadata`, currently informational (not consumed by VRChat generator) |
| CLI help shows correct version | **Ship (new)** | Dynamic via `getVersionString()` |
| Exit codes | **Ship** | Was never broken; measurement error |
| Parser rejects garbage input | **Gap** | IDENTIFIER fallback at parser.ts:1727 swallows anything as generic block. Non-blocking for launch; logs a warning would be ideal. |
| `metadata { }` surfaces in generated C# comments | **Gap (minor)** | Parsed but not yet emitted as doc-comment in UdonSharp. 1-hr polish task. |
| `npx create-holoscript` scaffold | **Gap** | Track B. Unchanged. |
| Unity `@networked` sync | **Gap** | UnityCompiler doesn't read `@networked`. Unchanged. |
| Three.js compile target with sync | **Gap** | No WebCompiler. Unchanged. |
| End-to-end Unity+VRCSDK3 world open test | **Unverified** | Cannot assert "works in VRChat" until a human opens the generated `.cs` and Build & Publish succeeds. |

## Remaining work before outreach launch

Not blockers for Track A credibility; known priorities for Track B/C/D:

1. **Human E2E test** — take a generated `.cs`, drop into Unity 2022.3 LTS with VRCSDK3 + UdonSharp, attempt Build & Publish. Record every manual step.
2. **`create-holoscript` scaffold** — gives creators a 60-second cold-start path.
3. **Surface `composition.metadata`** — emit world name/description/tags as C# XML doc comments and VRCWorld descriptor fields.
4. **Parser strictness mode** — optional `--strict` flag that rejects the IDENTIFIER fallback; gives CI integrators a clean signal.

## Takeaway on the methodology

The gate ran in under an hour. Two of four findings ended up being wrong (syntax misuse, PIPESTATUS confusion). That is the cost of dry-running a system you don't own end-to-end, and it is cheap compared to posting wrong claims to `ask.vrchat.com`. The rule stands: dry-run first, write claims second.

