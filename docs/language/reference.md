# Language Reference

> **Live authority.** `.hs` that `packages/compiler-wasm` `validate` accepts is the live language.
> Process-only, pipeline, typed-policy, and scene-only writeups that disagree are historical,
> pipeline-only, or example-only.

Comprehensive syntax references for all three HoloScript formats.

## Overview

HoloScript provides three file formats, each occupying a distinct **role/layer** in the stack:

- **`.hs`** - Historical / process-only / not the live `.hs` meaning: process / sequential agent logic (coroutines, graph wiring, sequential procedures). Live `.hs` is the banner above.
- **`.hsplus`** - TypeScript-like semantic behavior and systems components
  (modules, templates, traits, reactive state, state machines, pipelines,
  interfaces, services/devices, and agent cognition)
- **`.holo`** - Universal IR / scene composition (the compilation unit consumed by ALL platform compilers — 2D web, VR, AR, native, and beyond)

These are not a complexity ladder. They are capability surfaces. A full
HoloScript system may use all three. The `.hs` process/policy gloss is historical / process-only /
not the live `.hs` meaning; see the live-authority banner. `.hsplus` is reusable
typed semantic components and behavior, and `.holo` is whole-system composition and
target orchestration.

## Quick Format Selection

### Use `.hs` when:

> Historical / process-only / not the live `.hs` meaning. See the live-authority banner.

- Historical / process-only / not the live `.hs` meaning: Writing sequential agent procedures (patrol loops, task pipelines, initialization sequences)
- Wiring a process graph (`connect`, `yield`, `execute … repeat forever`)
- Describing step-by-step logic that runs from top to bottom

### Use `.hsplus` when:

- Defining reusable templates or module libraries (`@import` / `@export`)
- Building typed systems components, services, interfaces, simulations, device
  behavior, or application logic
- Declaring AI brain behaviors (`brain Name : @behavior_tree`)
- Writing cognitive agent skills (`llm_call`, `recall`, `rag_query`, `plan`, `reflect`)
- Building reactive state machines, event-driven UI, or hot-reloadable components (`@version` / `@migrate`)
- Composing traits, decorators, and pipeline DSL (`transform` / `filter` / `branch`)

### Use `.holo` when:

- Composing a scene for **any** platform target (not just VR/AR — also 2D web pages, native apps, robots)
- Declaring objects, environment, lights, cameras, NPCs, quests
- Authoring the compilation unit that a `compile_to_*` tool will consume
- Building 2D web surfaces (`@page`, `@slot`, `@panel`, `@tailwind`)

## Format-Specific References

### Process Language (`.hs`)

> Historical / process-only / not the live `.hs` meaning.

- [Basic Objects Reference](./reference-hs-basic) - Complete syntax guide for `.hs` format
- Process Language (`execute`, `yield`, `connect`, agent primitives) — missing; no `reference-hs-process.md`

### Semantic Behavior & Systems Components (`.hsplus`)

- [Templates & Decorators](./reference-hsplus-templates) - Template definitions, `@decorators`
- [State & Actions](./reference-hsplus-state) - State management, actions, computed values
- [Event Handlers](./reference-hsplus-events) - All event types and handlers
- [Modules & Imports](./reference-hsplus-modules) - Module system and code organization
- [Brain Declarations](./reference-hsplus-brain) - `brain Name : @behavior_tree` and brain wiring
- [Cognitive Verbs](./reference-hsplus-cognitive) - `llm_call`, `recall`, `rag_query`, `plan`, `reflect`
- [Pipeline DSL](./reference-hsplus-pipeline) - `transform` / `filter` / `branch` / `validate`
- [Runtime System](./reference-hsplus-runtime) - `@safe_daemon`, `@version` / `@migrate`, StdlibPolicy

### Scene Composition (`.holo`)

- [Entity-Trait Pattern](./reference-holo-entity) - Entity declarations with traits
- [Object-Template Pattern](./reference-holo-object) - Alternative `.holo` syntax
- [Game Constructs](./reference-holo-game-constructs) - NPC / Quest / Ability / Achievement / TalentTree
- [2D Web Pages](./reference-holo-web2d) - `@page`, `@slot`, `@panel`, `@tailwind`

## Cross-Format Comparisons

See the same functionality implemented in all three formats:

- [Comparison: Simple VR Scene](./comparison-simple-scene) - VR room with grabbable balls
- [Comparison: Interactive Game](./comparison-interactive-game) - Target practice game with state and events

## Feature Matrix

| Feature                                            | `.hs`            | `.hsplus`               | `.holo`            |
| -------------------------------------------------- | ---------------- | ----------------------- | ------------------ |
| Basic objects                                      | ✓                | ✓                       | ✓                  |
| Templates                                          | ✗                | ✓                       | ✓ (object pattern) |
| `@trait` decorators                                | ✗                | ✓                       | ✓ (entity pattern) |
| State blocks                                       | ✓ (object-local) | ✓                       | ✓                  |
| Actions/functions                                  | ✓                | ✓                       | ✓                  |
| Event handlers                                     | ✓                | ✓                       | ✓                  |
| Sequential process (`execute`, `yield`, `connect`; historical / process-only / not the live `.hs` meaning) | ✓                | ✗                       | ✗                  |
| Brain declarations (`brain Name : @type`)          | ✗                | ✓                       | ✗                  |
| Cognitive verbs (`llm_call`, `recall`, `plan`)     | ✗                | ✓ (in brains)           | ✗                  |
| Pipeline DSL (`transform`/`filter`/`branch`)       | ✗                | ✓                       | ✗                  |
| Platform compilation target                        | ✗                | ✗                       | ✓ (all platforms)  |
| 2D web pages (`@page`, `@slot`, `@panel`)          | ✗                | ✗                       | ✓                  |
| Modules                                            | ✗                | ✓ (`@import`/`@export`) | ✓ (`import`)       |
| Hot-reload (`@version`/`@migrate`)                 | ✗                | ✓                       | ✗                  |

## For AI Agents

When generating HoloScript code:

1. **Identify the layer** — determine which role the code needs to fill (process logic, brain/behavior, or scene composition), not just the file extension
2. **Know the parser** — `.hs` and `.hsplus` are parsed by `HoloScriptPlusParser`; `.holo` is parsed by `HoloCompositionParser`. Mixing syntax across parsers will fail silently or produce wrong AST
3. **Connect layers via imports** — `.holo` scenes can `import` `.hsplus` templates; historical / process-only / not the live `.hs` meaning: `.hsplus` brains can reference `.hs` process graphs; keep the data flow explicit
4. **Reference examples** — use these format references as syntax templates
5. **Validate** — generated code should be passed to `validate_holoscript` (MCP tool) before use; `parse_holo` returns success even on semantically invalid input — always add a content gate

## Source Code

All examples are available in the [HoloScript repository](https://github.com/brianonbased-dev/HoloScript/tree/main/examples/language-reference).
