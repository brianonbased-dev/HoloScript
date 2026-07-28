# Three-Format Showcase: Smart Gallery

This directory is a **historical syntax comparison** of one gallery scene. It
predates the canonical one-language/three-surface contract and is retained as a
migration corpus. Do not use its `.hs` scene syntax or its "basic / extended /
full" labels as current grammar authority.

For an executable, parser-authoritative product that binds all three surfaces,
use [`../three-surface-agent`](../three-surface-agent/) and run
`pnpm check:three-surface-closure`.

## The Three Formats

| Surface   | Current responsibility                                                                        |
| --------- | --------------------------------------------------------------------------------------------- |
| `.hs`     | Deterministic typed policy, logic, processes, and headless systems programs                   |
| `.hsplus` | Typed behavior, traits, agents, cognition, state, effects, and authority                      |
| `.holo`   | Whole-system composition, environments, worlds, resources, events, effects, and orchestration |

## When to Use Each

- **`.hs`** — Use when deterministic computation and native/VM policy are the
  center of the artifact.
- **`.hsplus`** — Use when typed behavior, cognition, state, traits, or authority
  are the center of the artifact.
- **`.holo`** — Use when the artifact binds systems, resources, deployment,
  embodiment, events, effects, or a world.

A product can use one surface or bind all three. The extensions are not maturity
tiers.

## Compile Commands

The files below are not a canonical compile matrix. Use the current executable
reference instead:

```bash
pnpm check:three-surface-closure
pnpm check:three-surface-closure:test
```

## What the Gallery Contains

- **4 paintings** on walls (plane geometry, each with artist metadata in .holo)
- **3 interactive sculptures** (sphere, cube, torus — grabbable and throwable)
- **Spotlights** over each painting
- **Visitor counter** panel (state-bound in .hsplus/.holo)
- **Background music** with spatial audio
- **Guided tour** waypoints (.holo only)
- **Lighting presets** — daylight, evening, spotlight (.holo only)
- **Analytics integration** — visitor tracking, artwork views (.holo only)

## Key Differences to Notice

1. **Templates eliminate repetition.** The `.hs` version duplicates material properties for each painting. The `.hsplus` version defines `PaintingFrame` once and reuses it.

2. **State enables reactivity.** The `.hs` version has a static visitor counter. The `.hsplus` version binds it to `GalleryState.visitorCount` and updates live.

3. **Systems add production capabilities.** The `.holo` version wires in analytics (PostHog), a lighting controller with presets, and a spatial audio engine — none of which exist in the simpler formats.

4. **Metadata enables deployment.** Only the `.holo` version specifies platform targets, version, author, and tags — essential for publishing to HoloLand or compiling to specific platforms.
