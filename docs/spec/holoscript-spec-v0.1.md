# HoloScript Language Spec 0.1.0

**HoloScript Language Spec 0.1.0.**

Joseph confirmed the v0.1 target freeze and the `.hs` rule on 2026-09-27. This spec says what the three file readers accept on 2026-09-27. It does not add new syntax. It does not change any reader, compiler, or trait code. Where an older document disagrees with a reader, this spec wins for v0.1.

Measured on `main` at `d22719c509d79c37e281f9c11216ce1e424e12df`. The 2026-09-26 measurement was `c9fa873c`. Between those two commits the only compiler edit was `packages/core/src/compiler/LlamaServerCompiler.ts`, which is not one of the three official v0.1 targets. The three readers did not change.

Examples in fenced blocks below were run through the reader named by the fence tag. A fence marked `reject` is a form that reader refuses, with the message it actually printed.

## What this version number is

There is one language version in this document: **0.1.0**.

These other numbers are software versions. They are not the language version:

| What                                          | Version on this checkout                                     | Where                                           |
| --------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `@holoscript/core` package                    | 8.8.0                                                        | `packages/core/package.json`                    |
| Workspace package `holoscript`                | 6.1.3                                                        | root `package.json`                             |
| Cargo workspace                               | 3.0.0                                                        | root `Cargo.toml` line 14                       |
| `@holoscript/wasm` local package.json version | 6.1.16 (unpublished; npm latest is 6.2.0, 7.0.0 also exists) | `packages/compiler-wasm/package.json`           |
| WASM build's own `version()` string           | 3.0.0                                                        | measured from `packages/compiler-wasm/pkg-node` |

`hs-machine-vN` is an internal machine contract, not this language version. The ladder is `docs/spec/native-machine-release-ladder.md`. Machine files `docs/spec/native-machine-v0.md` through `docs/spec/native-machine-v34.md` are per-generation notes. A machine number does not bump this spec, and this spec does not bump a package.

## Confirmed decisions

**Confirmed by Joseph on 2026-09-27.**

**(a)** A `.hs` file means whatever the Rust/WASM parser in `packages/compiler-wasm` accepts, as named by `docs/spec/holoscript-grammar-ssot.md`. "Accepts" for `.hs` means `validate_detailed` returns `"valid": true`. That call parses the file and then checks types (`validate_detailed` in `packages/compiler-wasm/src/lib.rs`).

**(b)** **webgpu**, **godot**, and **urdf** are the only promised v0.1 compile targets. **webgpu** is sovereign: our code generation, and it runs on the browser's WebGPU API. No test in this repo runs the generated output yet. **godot** and **urdf** are labeled bridges. Every other `ExportTarget` member stays in the code and is listed below as unproven, not in v0.1. Nothing was deleted.

## The three files and the one reader for each

The router is `docs/spec/holoscript-grammar-ssot.md` lines 13–15. One file ending, one reader:

| File ending | What it is for in v0.1                                      | The reader that decides                                           |
| ----------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `.holo`     | A whole composition: named scene plus the blocks inside it  | `packages/core/src/parser/HoloCompositionParser.ts` (`parseHolo`) |
| `.hsplus`   | Typed behavior: objects, traits, brains, pipelines, modules | `packages/core/src/parser/HoloScriptPlusParser.ts` (`parse`)      |
| `.hs`       | The object-graph and logic subset the WASM reader accepts   | `packages/compiler-wasm` (`validate_detailed`)                    |

These three are not the authority:

- **tree-sitter** (`packages/tree-sitter-holoscript`, package 2.1.0) is editor highlighting. Its README line 9 says "Full HoloScript syntax support". The router does not list it. Highlighting can accept text the real reader rejects.
- **PipelineParser** (`packages/core/src/parser/PipelineParser.ts`, `parsePipeline` at line 648) is a helper for pipeline blocks. It is not the reader for a `.hs` file. The composition reader calls it when it keeps a pipeline block (`HoloCompositionParser.ts` line 8439). The `.hsplus` reader has its own pipeline path (`HoloScriptPlusParser.ts` around line 1808).
- **SYNTAX_DOCS** (`packages/mcp-server/src/documentation.ts` line 1396) is a help table for the syntax guide. It is not the reader. A conformance test checks those examples separately. This spec does not.

## `.hs` — what the WASM reader accepts

The reader introduces itself as a subset parser for the `.hs` object-graph dialect (`packages/compiler-wasm/src/parser.rs` lines 1–12). Top-level forms it tries are listed in `parse_top_level` (lines 115–177): a leading `@` trait, `composition`, `world`, `orb`, `entity`, `object`, `template`, `group`, `timeline`, `environment`, `logic`, `npc`, `quest`, `ability`, `dialogue`, `state_machine`, `achievement`, `talent_tree`, `import`, `export`, `function`, `enum`, `struct`, `move`, `action`, an `on_` event, and the shape words `cube`, `sphere`, `plane`, `cylinder`, `mesh`, `light`, and `camera`.

Names after `object`, `orb`, `entity`, and the shape words are bare words, not quotes (`parse_generic_object`, line 419). `composition` and `world` allow a bare word or a quoted name (`expect_string_or_identifier`).

### Accepted examples

An object with a trait and a geometry property:

```hs
object Cube {
  @grabbable
  geometry: "cube"
}
```

A composition that holds an object:

```hs
composition Scene {
  object Cube {
    geometry: "cube"
  }
}
```

```hs
world Room {
  sky: "day"
}
```

```hs
orb Hero {
  geometry: "sphere"
}
```

```hs
entity Player {
  geometry: "capsule"
}
```

```hs
template Button {
  label: "Go"
}
```

```hs
group Items {
  object Cube {
    geometry: "cube"
  }
}
```

`environment` and `logic` accept a brace block with no name in front. A name before the brace is rejected (see below).

```hs
environment {
  sky: "day"
}
```

```hs
logic {
}
```

```hs
npc Guide {
  name: "Ada"
}
```

```hs
quest FindKey {
  title: "Find the key"
}
```

```hs
ability Dash {
  cooldown: 2
}
```

```hs
dialogue Greeting {
  line: "Hello"
}
```

```hs
state_machine Door {
  initial: "closed"
}
```

```hs
achievement FirstWin {
  title: "First win"
}
```

```hs
talent_tree Mage {
}
```

```hs
import { Cube } from "shapes.hs"
```

A typed function. `let` and `return` are accepted inside it (`parser.rs` lines 988–1046, and the checked-in sample at lines 3858–3861):

```hs
function add(left: i32, right: i64): i64 {
  let result: i64 = left + right
  return result
}
```

`export` wraps another top-level form. This one type-checks:

```hs
export function id(n: i32): i32 {
  return n
}
```

```hs
enum Route {
  EnterWorld
  OpenUrl
}
```

```hs
struct Point {
  x: f32
  y: f32
}
```

```hs
move Cube to [1, 2, 3]
```

```hs
action attack { @server_side }
```

```hs
on_grab { drop() }
```

```hs
timeline Intro {
  move Cube to [1, 0, 0]
}
```

```hs
cube Box {
  geometry: "cube"
}
```

```hs
sphere Ball {
}
```

```hs
plane Floor {
}
```

```hs
cylinder Pillar {
}
```

```hs
mesh Statue {
}
```

```hs
light Sun {
}
```

```hs
camera Main {
}
```

A trait block at the top of the file:

```hs
@trait Sensor {
  reading: Temperature
}
```

A `module` nested inside a composition:

```hs
composition Scene {
  module Counter {
    state {
      count: 0
    }
  }
}
```

A field marked `@unknown` may hold no known value. There are three ways to touch it: `isKnown(record.field)` reads whether it is known, `unknownReason(record.field)` reads the reason code, and `load(record.field) ?? fallback` reads the value with a fallback. That last one is the one written form for the value (2026-09-28; `proposals/Unknown_Field_Reads_v1.md`).

```hs
struct Snapshot {
  @unknown count: i32
}

struct Receipt {
  reason: i32
}

function gate(snapshot: &Snapshot, receipt: &mut Receipt): i32 {
  if (isKnown(snapshot.count)) {
    return load(snapshot.count) ?? 0
  }
  store(receipt.reason, unknownReason(snapshot.count))
  return 0
}
```

A Holo tool is imported by name from its module, `holo:<name>` (G21). The checker knows each
module's declarations (`packages/std/src/holo/<name>.hs`), so a call is checked like a local
function's: its argument count and types, and its result type. Only a function that states its
types may call one, and only by name: a capability is not a value. A declaration states every
parameter and result type, and each is `i32`, `f32`, `f64` or `bool`, the values capability ABI
v1 carries. UAAL compiles a call to its arguments, left to right, and one host instruction,
`EXEC ["holo.<module>.<function>.v<N>", argc]`, where `N` is the declared version; the host that
runs it binds that name, or the run ends in error. Native and the Kotlin bridge refuse a Holo call
by name (`HS-HOST-004`).

```hs
import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  return manifest_audit_passes()
}
```

### Forms it rejects

Quoted object name. Message: `Expected identifier`.

```hs reject
object "Cube" {
  geometry: "cube"
}
```

A name before `environment`. Message: `Expected LBrace, got Identifier`.

```hs reject
environment Room {
  sky: "day"
}
```

`zone` is not a top-level word. Message: `Unexpected identifier: zone`.

```hs reject
zone SafeArea(x: 0, y: 0, z: 5, width: 100)
```

`pipeline` is not a top-level word. Message: `Unexpected identifier: pipeline`.

```hs reject
pipeline "CustomerJourney" {
  source Ledger {
    kind: "table"
  }
  sink Report {
    kind: "log"
  }
}
```

`spatial` is not a top-level word. Message: `Unexpected identifier: spatial`.

```hs reject
spatial ComponentName(width: number, height: number) {
  layer background {
  }
}
```

`brain` is not a top-level word. Message: `Unexpected identifier: brain`.

```hs reject
brain GoblinAI {
}
```

A function whose return type does not match the value it returns. The grammar shape is fine; the type check fails. Message: `[HS-TYPE-RETURN-001] return type mismatch in function add: expected i64, found i32`.

```hs reject
export function add(left: i32, right: i64): i64 {
  return left
}
```

Inside a function that states a parameter or return type, every name must be declared: a parameter, a local declared earlier in the same or an enclosing block, a top-level function, struct, enum or import, or a built-in. Message: ``[HS-NAME-001] unknown name `y` in function `f`; …``. (Added 2026-09-28 under the gate rule below; `proposals/HS_Checker_Names_Calls_Returns_v1.md`.)

```hs reject
function f(): i32 {
  return y
}
```

A function that states a return type must return a value on every path. Message: ``[HS-RETURN-002] function `f` declares `i32` but can finish without returning a value; …``.

```hs reject
function f(x: i32): i32 {
  if (x > 0) {
    return 1
  }
}
```

A fallback on a bare `@unknown` struct field. The one written form is `load(record.field) ?? fallback`, and the native backend refuses the bare form too. Message: ``[HS-UNKNOWN-002] function `read` supplies a fallback for `@unknown` struct field `count` without `load` — …``.

```hs reject
struct Snapshot {
  @unknown count: i32
}

function read(snapshot: &Snapshot): i32 {
  return snapshot.count ?? 7
}
```

A capability its module does not declare. The message names the closest declared one. Message:
``[HS-HOST-002] `holo:absorb` declares no `manifest_audit_pases`; did you mean `manifest_audit_passes`?``

```hs reject
import { manifest_audit_pases } from "holo:absorb"

function main(): bool {
  return manifest_audit_pases()
}
```

## `.holo` — what the composition reader accepts

`parseHolo` (`HoloCompositionParser.ts` lines 8472–8475) builds `HoloCompositionParser` and calls `parse` (line 256). The default is tolerant (`constructor`, lines 231–235): a mistake is recorded and reading continues, unless the caller asks otherwise. Success means the error list is empty (line 276).

A file may start with `composition`, or with a root object and no wrapper (`parseImplicitComposition`, line 298). Inside a named composition, the reader looks for the blocks in the chain starting at line 781.

### Accepted examples

Quoted composition name, quoted object name:

```holo
composition "Scene" {
  object "Cube" {
    geometry: "cube"
  }
}
```

A file that is only an object. The composition name stored is `implicit`:

```holo
object "Cube" {
  geometry: "cube"
}
```

A bare object name at the root is also kept:

```holo
object Cube {
  geometry: "cube"
}
```

```holo
composition "Scene" {
  template "Button" {
    label: "Go"
  }
}
```

```holo
composition "Scene" {
  spatial_group "Shelf" {
    object "Cube" {
      geometry: "cube"
    }
  }
}
```

```holo
composition "Scene" {
  environment {
    sky: "day"
  }
}
```

```holo
composition "Scene" {
  light "Sun" {
    type: "directional"
  }
}
```

```holo
composition "Scene" {
  camera "Main" {
    fov: 60
  }
}
```

```holo
composition "Scene" {
  logic {
  }
}
```

```holo
composition "Scene" {
  timeline "Intro" {
  }
}
```

```holo
composition "Scene" {
  audio "Hum" {
    src: "hum.mp3"
  }
}
```

A zone is kept only in this shape, inside a composition: quoted name, then a brace block (`parseZone`, line 1716).

```holo
composition "Scene" {
  zone "SafeArea" {
    width: 100
  }
}
```

```holo
composition "Scene" {
  npc "Guide" {
    name: "Ada"
  }
}
```

```holo
composition "Test" {
  quest "Find the Crystal" {
    giver: "Luna"
    level: 10
  }
}
```

```holo
composition "Scene" {
  state_machine "Door" {
    initial: "closed"
  }
}
```

```holo
composition "Scene" {
  action greet {
  }
}
```

```holo
composition "Scene" {
  theme {
    primary: "blue"
  }
}
```

```holo
composition "Scene" {
  state {
    score: 0
  }
}
```

```holo
import "library.holo"
composition "Scene" {
}
```

`orb` is read as an object (`KEYWORDS` maps `orb` to the object token in `packages/core/src/parser/composition/tokens.ts` line 343):

```holo
orb "Hero" {
  geometry: "sphere"
}
```

```holo
composition "Scene" {
  cube "Box" {
    color: "red"
  }
}
```

A simulation contract with no quoted name is kept on the composition:

```holo
composition "Scene" {
  sim_contract {
    claim: "one winner"
  }
}
```

A pipeline is kept as a domain block. The composition reader then calls `PipelineParser` (`HoloCompositionParser.ts` line 8439). This sample came back with one source and one sink:

```holo
composition "Scene" {
  pipeline "CustomerJourney" {
    source Ledger {
      kind: "table"
    }
    sink Report {
      kind: "log"
    }
  }
}
```

The same pipeline at the root of the file, with no composition wrapper, is also kept as a domain block:

```holo
pipeline "CustomerJourney" {
  source Ledger {
    kind: "table"
  }
  sink Report {
    kind: "log"
  }
}
```

### Forms it rejects

A bare composition name. Message: `Expected string, got SCENE (in composition)`. The same error also says: `Strings must be enclosed in double or single quotes`.

```holo reject
composition Scene {
  object Cube {
    geometry: "cube"
  }
}
```

A missing closing brace. Message: `Expected RBRACE, got EOF (in composition)`.

```holo reject
composition "Scene" {
  object "Cube" {
    geometry: "cube"
```

A typed function inside a composition. The reader does not keep functions (see Known gaps). This shape also errors. Message: `Unexpected token: LBRACE. Expected one of: environment, state, logic, template, object, spatial_group, import, light, norm, metanorm, identifier/property, or } (in composition)`.

```holo reject
composition "Scene" {
  function add(left: i32, right: i64): i64 {
    return left
  }
}
```

A quest property written as a quoted string where the reader wants a bare word. Message: `Expected identifier, got STRING (in composition > Quest "FindKey")`.

```holo reject
composition "Scene" {
  quest "FindKey" {
    title: "Find the key"
  }
}
```

## `.hsplus` — what the plus reader accepts

`parse` (`HoloScriptPlusParser.ts` line 7749) reads a document (`parseDocument`, line 1535). A top-level word becomes a node. `connect` and `execute` are special (`lines 1583–1588`). The word `brain` is special (`isBrainKeyword`). Other words go through `parseNode` (line 1687), which has extra paths for `template`, `logic`, `react`, pipeline blocks (`transform`, `filter`, `branch`, `validate`), `struct`, and raw blocks including `module`, `enum`, `function`, and `action` (lines 1871–1882).

### Accepted examples

```hsplus
object Cube {
  geometry: "cube"
}
```

```hsplus
orb Sword @grabbable() {
  geometry: "sphere"
}
```

```hsplus
template Button {
  label: "Go"
}
```

```hsplus
logic {
  function ping() {
    return 1
  }
}
```

```hsplus
brain GoblinAI : @behavior_tree {
  state idle {
  }
}
```

A pipeline at the top of a `.hsplus` file is kept. The root type measured was `pipeline`, with children `source` and `sink`:

```hsplus
pipeline "CustomerJourney" {
  source Ledger {
    kind: "table"
  }
  sink Report {
    kind: "log"
  }
}
```

```hsplus
struct Point {
  x: f32
  y: f32
}
```

```hsplus
enum Route {
  EnterWorld
  OpenUrl
}
```

A function with no colon types is kept as a raw block. The root type measured was `function`:

```hsplus
function add() {
  return 1
}
```

```hsplus
module Counter {
  state {
    count: 0
  }
}
```

```hsplus
composition "Scene" {
  object Cube {
    geometry: "cube"
  }
}
```

```hsplus
world Room {
  sky: "day"
}
```

```hsplus
connect inventory.sync -> report.write
```

```hsplus
execute report.write
```

```hsplus
react {
  on click() => emit("tapped")
}
```

```hsplus
state_machine Door {
  initial: "closed"
}
```

A lone trait, with no object, is accepted as an empty fragment (no error):

```hsplus
@grabbable
```

A field inside a brace block may carry the same two marks the `.hs` reader stores on a property. `?` after the value marks that field optional. `= <expression>` after the value stores a default and leaves the value as the type or expression written before the `=`. A plain field such as `reading: Temperature` or `maxHP: 100` is unchanged. `a ?? b` stays null-coalescing. `?.` stays optional chaining. Both marks may sit on one field. These three blocks are accepted:

```hsplus
@trait Config {
  provider: String?
  required: String
}
```

```hsplus
@trait Config {
  auto_register: Bool = true
}
```

```hsplus
@trait Config {
  llm_provider_id: String? = null
}
```

### Forms it rejects

`zone`, `spatial`, and `layer` are rejected at any depth in a `.hsplus` file, not only at the top. The reader names the word that was written, reports one error, and stores no node. A `zone` block says `HSP001: "zone" is not part of .hsplus. A zone goes inside a composition in a .holo file, with a quoted name and a brace block.` A `spatial` or `layer` block says `HSP001: "spatial" is not part of .hsplus. Use a composition in a .holo file instead.` (the same sentence, with `"layer"` in place of `"spatial"`). The same zone, with a quoted name and a brace block, stays valid inside a `.holo` composition. A property named `layer`, as in `layer: 2`, is an ordinary property.

```hsplus reject
zone SafeArea(x: 0, y: 0, z: 5, width: 100)
```

```hsplus reject
spatial ComponentName(width: number, height: number) {
  layer background {
  }
}
```

A trait written as `@name { ... }` with no `()` swallows the following object body. Message: `HSP101: Trait @grabbable used a block that looks like an object body, but no object body follows. Use @grabbable(...) for trait config, or add a separate { ... } object body.`

```hsplus reject
orb Sword @grabbable {
  geometry: "model/sword.glb"
}
```

A typed function that returns an `i32` where `i64` was declared. The Rust checker refuses it before success. A function node is still emitted, and success is false. Message: `` `[HS-TYPE-RETURN-001] return type mismatch in function `add`: expected `i64`, found `i32` ``.

```hsplus reject
function add(left: i32, right: i64): i64 {
  return left
}
```

Three `@` signs with no name. Message: `HSP201: Expected directive name, got AT. Directives start with @ followed by name (e.g., @grabbable)`.

```hsplus reject
@@@
```

## Known gaps

These are bugs and disagreements measured on this checkout. This spec records them. It does not fix them.

1. **The composition reader can say success and keep nothing.** `parseHolo` returns `success: true` with an empty object list, an empty zone list, and no domain block for these inputs: `zone SafeArea(x: 0, y: 0, z: 5, width: 100)` at the root of the file; `zone "SafeArea" { width: 100 }` at the root; and `function add(left: i32, right: i64): i64 { return left }` at the root. Unknown words at the root are skipped one token at a time (`HoloCompositionParser.ts` lines 547–549) and that skip does not record an error. Inside a composition, `function "add" { params: ["left"] }` and `function add() { return 1 }` are consumed by `skipFunctionDeclaration` (lines 993–997 and 3282–3295) and are not stored on the result. The September 26 note said the same for `pipeline` and `spatial` based on an empty object list. Re-measured today: a pipeline is kept as a domain block (see the `.holo` section). A root-level `spatial ComponentName ... { layer background { } }` returns success, does not store `spatial`, and does store the inner `layer background` as a domain block (`domain: "custom"`, `keyword: "layer"`). The same `spatial` text inside `composition "Scene" { ... }` returns success and stores nothing.

2. **The three readers disagree on the same text.**

| Text                                                                                                         | WASM `.hs`                        | `.hsplus` reader                                        | Composition reader                                                                              |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Typed `function add(left: i32, right: i64): i64` with `return result` after `let result: i64 = left + right` | valid                             | success; parameter and return types stored              | At the root: success and nothing stored. Inside a composition: error `Unexpected token: LBRACE` |
| `zone SafeArea(x: 0, y: 0, z: 5, width: 100)`                                                                | `Unexpected identifier: zone`     | rejected, `HSP001` (`"zone"` is not part of .hsplus)    | success, nothing stored                                                                         |
| `spatial ComponentName(width: number, height: number) { layer background { } }`                              | `Unexpected identifier: spatial`  | rejected, `HSP001` (`"spatial"` is not part of .hsplus) | success; `spatial` itself is not stored (see gap 1)                                             |
| `pipeline "CustomerJourney" { source Ledger { kind: "table" } sink Report { kind: "log" } }`                 | `Unexpected identifier: pipeline` | success, root type `pipeline`                           | success, kept as a pipeline domain block                                                        |

3. **The trait count is being reconciled across sources.** The canonical name list is `VR_TRAITS` in `packages/core/src/traits/constants/index.ts`, named in the Traits section. This spec does not publish a number for how many traits exist.

4. **A pipeline property can be kept under a different type name.** For `source Ledger { kind: "table" }`, the composition reader's pipeline result stored `kind: "table"` as a property and set the step type to `rest`. The file still parses. Callers that expect the type to be `table` will not see that.

5. **Version numbers still disagree with each other**, as in the table at the top. `CHANGELOG.md` has no `8.8.0` heading. This spec does not bump any of them.

6. **Godot has no golden-output file** in `packages/core/src/compiler/__tests__/golden-output/golden.test.ts` (that file names Unity, WebGPU, URDF, SDF, and WASM). Godot is covered by its own compiler tests and by `ExportTargets.e2e.test.ts`. That is a test gap, not a license to drop the target.

7. **A `holo:` import was taken on trust** (G21), measured 2026-09-28: `import { f } from "holo:absorb"` was valid with a misspelled name, an unknown or malformed module, a lookalike scheme (`HOLO:absorb`), a wrong argument count (also through an alias), a wrong result type, a call from an untyped function, the capability passed on as a value (which an untyped function could then call unchecked), and a function of the same file standing in for the import. G21 phase 1 refuses these (the codes under Error codes); the corpus records each before and after.

## Traits

The one name list this spec treats as canonical is **`VR_TRAITS`** in `packages/core/src/traits/constants/index.ts` (the array starts at line 209).

Why that file: the `.hsplus` reader asks this list when it decides an `@` word is a known trait (`HoloScriptPlusParser.ts` line 2670). The composition reader's suggestions fall back to the same list (`HoloCompositionParser.ts` lines 225–238, via `ErrorRecovery`). The compilers for webgpu, godot, and urdf do not reject an unknown trait name against a registry. They read the names the parser already stored and special-case a few (`grabbable`, `physics`, and GPU trait names in `WebGPUCompiler.ts`, `GodotCompiler.ts`, and `URDFCompiler.ts`). A separate checker, `traitExists` in `packages/core/src/compiler/TraitRegistryBridge.ts` (line 260), looks first at the runtime handler registry `vrTraitRegistry` in `packages/core/src/traits/VRTraitSystem.ts`. That checker is not what the three official compilers run. `listTraitsForTarget` for `webgpu` returns an empty list (`TraitRegistryBridge.ts` lines 249–250).

Other catalogs also name traits. The trait count is being reconciled across those sources. This spec does not publish a number.

## Error codes

### `.hs` (WASM)

The grammar reader has one numbered code. `packages/compiler-wasm/src/parser.rs` lines 60–64 emit `HS010: Security violation: blocked lexical capability \`...\`` when the lexer sees a blocked word (`packages/compiler-wasm/src/lexer.rs` lines 5–18). This spec does not include a sample of those words.

The type check that `validate_detailed` runs adds these codes (the constants at the top of `packages/compiler-wasm/src/semantic_types.rs`):

- `HS-TYPE-RETURN-001`
- `HS-TYPE-ASSIGN-001`
- `HS-TYPE-ARG-001`
- `HS-TYPE-LOGICAL-001`

Inside a function that states a parameter or return type it also refuses, since 2026-09-28 (G11):

- `HS-NAME-001` — a name that is not declared (`break` and `continue` included: they are not statements)
- `HS-NAME-002` — a call to a name that is not a function, struct, import or built-in
- `HS-ARITY-001` — the wrong number of arguments to a function of the same program
- `HS-RETURN-002` — a declared return type with a path that returns no value
- `HS-SCOPE-001` — a declaration that reuses a name still visible from its own or an enclosing block

Reading an `@unknown` struct field (in every function), and `??` (in functions that state a type):

- `HS-UNKNOWN-001` — the field read as a value, or `load(record.field)` without a fallback
- `HS-UNKNOWN-002` — a fallback on anything but `load(record.field)`: a bare `record.field ?? d`, or `??` on a plain value

An import from a Holo module, `import { f } from "holo:<name>"` (G21, since 2026-09-29):

- `HS-HOST-001` — a module the checker does not know, a malformed module source (`holo://x`, `holo:Absorb`, `holo:absorb/x`), or another scheme (`HOLO:absorb`, `https:`), which is not read as a file; also a module whose declarations are broken (a capability with no `@host` block, an unstated type, or a type ABI v1 does not carry), with the reason
- `HS-HOST-002` — a name the module does not declare, at the name, with the closest declared one
- `HS-HOST-003` — a capability used where its call cannot be checked: in a function that states no types, or as a value (stored, passed or returned) instead of called by name
- `HS-HOST-004` — a valid capability call on an engine that has no binding for it yet (the Kotlin bridge; native refuses any `holo:` import as a non-relative path). UAAL compiles the call (G21 phase 2, 2026-10-04); a UAAL host with no binding for its `EXEC` ends the run in error
- `HS-SCOPE-001` — a function, struct or enum of the file that has the name of a Holo import (every engine resolves an import by name)

These errors carry the line and column of the name, call, declaration or function. `validate_detailed_in_context` runs the same check on one function lifted out of a larger document, given the document's functions and names; the `.hsplus` reader uses it for typed functions.

Everything else the grammar prints is a sentence with no code. Measured sentences include `Expected identifier`, `Expected LBrace, got Identifier`, `Unexpected identifier: zone`, `Unexpected identifier: pipeline`, `Unexpected identifier: spatial`, and `Unexpected identifier: brain`.

### `.holo` (composition reader)

No error codes. `error()` (`HoloCompositionParser.ts` line 3978) stores a sentence. Measured sentences include:

- `Expected string, got SCENE (in composition)`
- `Expected RBRACE, got EOF (in composition)`
- `Unexpected token: LBRACE. Expected one of: environment, state, logic, template, object, spatial_group, import, light, norm, metanorm, identifier/property, or } (in composition)`
- `Expected identifier, got STRING (in composition > Quest "FindKey")`
- `Expected LBRACE, got STRING (in composition)` (a quoted name after `theme` or `sim_contract`)

### `.hsplus`

Codes are defined in `packages/core/src/parser/RichErrors.ts` lines 42–63 (`HSP001` through `HSP006`, `HSP009`, `HSP100`, `HSP101`, `HSP109`, `HSP200`, `HSP201`, and `HSP300`). The message text is `HSP###: ` plus the sentence (`createRichError`, line 266).

Codes this reader passes into `error()` or `detectCommonMistake` in `HoloScriptPlusParser.ts`: `HSP001`, `HSP002`, `HSP003`, `HSP004`, `HSP005`, `HSP006`, `HSP009`, `HSP100`, `HSP101`, `HSP109`, `HSP200`, `HSP201`, `HSP300`.

Measured messages:

- `HSP001: "zone" is not part of .hsplus. A zone goes inside a composition in a .holo file, with a quoted name and a brace block.`
- `HSP001: "spatial" is not part of .hsplus. Use a composition in a .holo file instead.`
- `HSP001: "layer" is not part of .hsplus. Use a composition in a .holo file instead.`
- `HSP001: This spot needs a colon, as in name: value. A default written with = is only allowed on a field.`
- `HSP001: A colon is not allowed at the top of the file. Start with a block such as object, composition, or function.`
- `HSP300: A value was required here, and a "|" was found instead.`
- `HSP101: Trait @grabbable used a block that looks like an object body, but no object body follows. Use @grabbable(...) for trait config, or add a separate { ... } object body.`
- `HSP201: Expected directive name, got AT. Directives start with @ followed by name (e.g., @grabbable)`

## Compile targets

**Confirmed by Joseph on 2026-09-27.** webgpu, godot, and urdf are the only promised v0.1 targets. See confirmed decision (b) above.

`ExportTarget` is the list in `packages/core/src/compiler/CircuitBreaker.ts` lines 43–107. `packages/core/src/compiler/sovereign-targets.ts` sorts that list into sovereign, bridge, and mode. North Star wording (`NORTH_STAR.md` lines 24–26 and 35–41): generating an engine project or a deployment manifest is bridge evidence, not proof that HoloScript owns the underlying layer. "Name the rung" means say which ownership is real: code owned, kernels owned, weights owned, or hardware-level owned. A bridge must be labeled. The removal condition for godot and urdf is not written in this spec.

### Official for v0.1

| Target   | Class                                      | Rung                                                                                                                                                 | What the compiler does                                                                                                  |
| -------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `webgpu` | Sovereign (`sovereign-targets.ts` line 31) | **Code owned.** Code generation is HoloScript-owned (`WebGPUCompiler` emits WGSL + host code). The GPU device is the browser's WebGPU API, not ours. | Gap: execution of the generated output is not yet proven by a test in this repo.                                        |
| `godot`  | Bridge (`sovereign-targets.ts` line 63)    | Not owned. Labeled bridge.                                                                                                                           | Emits a Godot project. Godot, a separate engine, is what runs it. That is bridge evidence under North Star lines 24–26. |
| `urdf`   | Bridge (`sovereign-targets.ts` line 55)    | Not owned. Labeled bridge.                                                                                                                           | Emits URDF XML. ROS 2 / Gazebo, separate tools, are what consume it (`CircuitBreaker.ts` line 44).                      |

### Unproven, not in v0.1

These stay in the code. Nothing was removed. They are not official v0.1 targets.

Sovereign, besides webgpu: `audio`, `desktop-gpu`, `pathtrace`, `pathtrace-cpu`, `media`, `physics-sim`, `character-webgpu`, `nir`, `canvas2d-game`, `tsl`, `wasm`, `sdk`, `svg`, `holob`, `gaussian-train`.

Bridge, besides godot and urdf: `sdf`, `mjcf`, `mjx`, `embodied-dataset`, `unity`, `unreal`, `pcg-graph`, `vrchat`, `openxr`, `android`, `android-xr`, `quest`, `ios`, `visionos`, `r3f`, `usd`, `usdz`, `fmu`, `dtdl`, `a2a-agent-card`, `agent-inference`, `omnigent-agent-yaml`, `daimon-seed`, `openxr-spatial-entities`, `3dgs`, `3dtiles`, `openapi`, `onnx`, `flutter`, `stl-export`, `lens-studio`, `colyseus`, `ai-glasses`, `scm`, `nft-marketplace`, `edge`, `bot-swarm`, `dungeon-instance`, `world-shard`, `mcp-server`.

Modes: `llama-server`, `state`, `trait-composition`, `incremental`, `multi-layer`, `code-editor`.

## No-break policy

A `.holo`, `.hs`, or `.hsplus` file that parses under 0.1.0 must keep parsing in every 0.x patch. A patch may add a reader fix that rejects a case this spec lists under Known gaps only after the proposal below passes its gates, because those cases parse as success today even when the result is empty.

Any new syntax, or any change to what the readers accept today, needs a written proposal before it is built. The proposal says what the change is, why, examples of the new form, what existing files would break (measured, not estimated), and the test that proves the claim. Proposals live in `proposals/`.

**Approval is by gates, not by a person.** On 2026-09-28 Joseph said: "as long as we have our gates, rules, and tools helping agents make the right decisions and go in the right directions my approvals are a bottleneck." This replaces the 2026-09-27 rule that he approves each proposal. A proposal is approved when all four hold:

1. It is written, with the measured list of files it breaks.
2. The executable spec corpus passes (`node scripts/holo-ci/check-spec-corpus.mjs --strict`), and every honest-gap case the change closes is flipped on purpose.
3. The proving test fails when the change is removed, and the pull request records that mutation or fault-injection run.
4. A reviewer from a different seat and a different family than the author approves the pull request.

Joseph's review stays reserved for the four protected classes: spend and custody, physical-world commitments, public commitments under his name, and governance.

Changes made under these gates:

- **2026-10-04, G21 phase 2** ([proposal](../../proposals/Host_Capability_Imports_v1.md)): `compile_to_uaal` lowers a Holo call to its arguments, each at its declared type, and `EXEC ["holo.<module>.<function>.v<N>", argc]`, the `hs.*.binary.v1` stack contract (the host pops the arguments and pushes one result); a call made as a statement drops its result. A declaration may pass only `i32`, `f32`, `f64` and `bool` (capability ABI v1). Measured: the one declared capability, `holo:absorb` `manifest_audit_passes(): bool`, already fits, so no module and no program changes verdict; the demo now compiles for UAAL, returns the host's answer when a host binds it and ends the run in error when none does. Native and the Kotlin bridge still refuse.
- **2026-09-29, G21 phase 1** ([proposal](../../proposals/Host_Capability_Imports_v1.md)): `import { f } from "holo:<name>"` is checked against the module declarations embedded in the checker (`holo:absorb` first); the codes above; a capability is only called by name, never used as a value; `.hsplus` documents send their holo imports to the checker and each document's imports are checked once. Measured in HoloScript, Hololand and ai-ecosystem: 0 of 236 tracked `.hs` files and 0 of 2,984 tracked `.hsplus` files change verdict; the ten G21 corpus cases recorded as honest gaps flip to refusals. Engines refuse a Holo call by name until phase 2 binds it.
- **2026-09-28, `@unknown` reads** ([proposal](../../proposals/Unknown_Field_Reads_v1.md)): `isKnown` and `unknownReason` are accepted as tag reads; `load(record.field) ?? fallback` is the one written form for the value; the bare fallback form and `??` on a plain value in typed functions are refused. One tracked file used the bare form (`Routing.logic.hs`) and migrates in the same change with byte-identical Kotlin; the steward example becomes valid. Gate 4 is required before merge and is recorded on the pull request.
- **2026-09-28, G11** ([proposal](../../proposals/HS_Checker_Names_Calls_Returns_v1.md)): inside typed functions, `validate_detailed` refuses unknown names and functions, the wrong argument count, a missing return and a hidden name. Measured on the build: 0 of 68 valid `.hs` files and 0 of 2,474 `.hsplus` files changed verdict. Gate 4, a review by another seat and family, is required before merge and is recorded on the pull request.

Deprecation is announced in a later revision of this spec, with the date, the old form, the replacement, and the version in which the old form will stop parsing. The old form keeps parsing for at least one 0.x patch after that announcement. Removing it passes the same four gates. A banner on an older document is a pointer. It is not, by itself, a removal.

## What remains after this plan

This spec describes today's readers. It does not make the three readers agree. It does not turn empty-success into a real error. It does not add a Godot golden file. It does not parse every code fence in `docs/language`, `docs/guides`, or HoloSchool. It does not publish a package or bump a version. The trait count is being reconciled across sources, and this spec does not publish a number. The removal condition for the godot and urdf bridges is not written yet. Execution of `WebGPUCompiler` output is still unproven by a test in this repo. Those wait on a later step.
