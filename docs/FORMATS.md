# The Three Formats — Locked Definitions

> **Ratified by Joseph, 2026-11-24** ("Ratify the lock-in as proposed").
> Evidence: the three-formats research of 2026-11-24 (vision, implementation, and
> contradictions for `.holo` / `.hs` / `.hsplus`, worked firsthand from this repo,
> `ai-ecosystem`, and the cold-agent dogfood) and issue #704, where the dogfood's
> stuck log is filed.
>
> These definitions are **ratified, not yet implemented**. The work to make them
> true of the shipped product is tracked in the companion issue, "Three-formats
> lock-in: gap list (stranger-hit order)". Until the published CLI routes through
> the readers named here, the definitions are aspirational for anyone installing
> from npm.

One language, three capability surfaces: **`.holo` composes, `.hsplus` behaves,
`.hs` decides.**

## `.holo` — the composition

**Purpose.** A whole system in one file — the named composition that binds
objects, environments, state, logic entry points, contracts, targets, and
orchestration into a thing that can be inhabited, deployed, or proven. This is
the thesis's universal substrate ("one .holo, any AI, any embodiment") and the
home of `sim_contract`.

**Scope in.** `composition "Name"` (quoted); objects, templates, and spatial
groups; environment, light, camera, audio, timeline; zones; state; logic,
actions, and event entry points; inline pipeline domain blocks; imports;
contracts.

**Scope out.** Typed function declarations (they stay rejected). Root-level
unknowns must not silently succeed — see the gap list.

**Authoring posture.** Declarative and explicit; a file a
non-programmer-adjacent reader (or an AI) can survey whole. Verbosity is
accepted as the price of fine-grained control.

**Relation.** `.holo` *contains and binds*: it imports `.hsplus` components and
calls `.hs` policy.

## `.hsplus` — the behavior

**Purpose.** Typed behavior and effects — the TypeScript-like semantic surface
where state, traits, actions, events, reactions, state machines, modules, and
agent cognition live. If it *reacts*, it's `.hsplus`.

**Scope in.** Everything Spec v0.1 measures the Plus reader accepting:
compositions of components, templates with `@trait(...)` config, reactive
bindings, brains, `connect`/`execute`, and pipelines as a component-level
construct.

**Scope out.** Whole-system and spatial composition keywords (`zone`,
`spatial`, `layer` — already rejected with `HSP001` and a pointer to `.holo`;
keep that).

**Authoring posture.** A programmer's (or agent's) working surface — real code
bodies, types where they carry meaning, and the `HSP###` error system as the
standard every reader should meet.

**Relation.** `.hsplus` *behaves*: it is imported and bound by `.holo`, and it
calls `.hs` for deterministic decisions.

## `.hs` — the logic

**Purpose.** Deterministic typed logic and policy — small, headless, verifiable
computation: typed functions, object-graph declarations, and policy that must
execute identically natively and on the VM. If it must be *provably the same
every run*, it's `.hs`.

**The definition.** The Rust/WASM reader that Spec v0.1 names is the definition
of `.hs`; its `validate_detailed` is the definition of "accepts".

**Scope in.** The WASM reader's measured vocabulary: bare names; object-graph
blocks; typed `function` / `enum` / `struct`; `state_machine`; `on_*` blocks;
`move` / `action`; nested `state` in modules.

**Scope out.** Quoted object names; top-level `pipeline` / `brain` / `zone` /
`spatial` (already rejected). Interactive scene authoring is not a `.hs` use
case — scenes are `.holo`'s job; a `.hs` object-graph may *describe* objects,
but `.hs` is not the scene format.

**Authoring posture.** Terse, typed, deterministic — written to be checked, not
to be looked at.

**Relation.** `.hs` *decides*: it is the leaf of the triad — called by the other
two, containing neither.

## Ratified decisions

1. **What `.hs` is** — deterministic typed logic/policy, per the definition
   above (research Choice 1, Option A). The older stories — `.hs` as beginner
   scenes, `.hs` as the pipeline format — are retired.
2. **Pipelines** — a *construct*, not a format (research Choice 2, Option A).
   The `pipeline { source → transform → sink }` block is legal inside `.holo`
   (whole-system) and `.hsplus` (component) files, as the Composition and Plus
   readers already implement. The `examples/pipelines/*.hs` corpus is re-homed;
   the pipeline grammar itself does not change, only its address.
3. **The published toolchain is part of the definition.** The npm CLI must
   route each extension to the reader Spec v0.1 names — WASM for `.hs`, Plus
   for `.hsplus`, Composition for `.holo` — the grammar SSOT's router applied
   to the shipped product, not just the repo.
