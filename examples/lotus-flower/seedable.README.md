# Lotus Seedable Artifact — Staged

> **Status:** STAGED. Pre-genesis. Not live on holoscript.net.
> Composed by `/artist` on 2026-05-06 per `/idea` run-11 form recommendation
> (`research/2026-05-06_idea-run-11-lotus-seedable-artifact.md`).

This document explains what's in `garden.seedable.holo`, what's blocked on
trait-substrate work before it can render, and how to fire it when the
16-paper genesis trigger lands and the missing traits ship.

## Relationship to the existing files

| File | Role | Status |
|------|------|--------|
| `garden.holo` | First-pass declarative composition | LEGACY (kept for diff history) |
| `garden.refreshed.holo` | A-009's bloom-state visual-readability baseline (glow / pulse / pollen) | BASELINE (do not modify; reference for visual vocabulary) |
| `garden.seedable.holo` | This artifact — phyllotaxis spine + Fibonacci-layered petals + GPU pollen + bloom-reactive opacity | STAGED (this file) |
| `reference.anchors.json` | Pending CAEL media anchors for the three in-thread lotus reference images | STAGED (awaiting raw media ingest) |
| `reference.material-extract.json` | Photo-derived material seed for `@botanical_lotus` | STAGED (visual seed) |
| `build-reference-manifest.mjs` | Local hashing helper for replacing pending anchors with `sha256:` anchors | TOOLING |

`garden.seedable.holo` is **additive**. It does not replace either earlier
file. It composes a new form on top of A-009's visual vocabulary.

**2026-05-06 update:** `@botanical_lotus` now has a backed core handler in
`packages/core/src/traits/BotanicalLotusTrait.ts`, and holoscript-net consumes
its render profile for the live 3D proof surface. The raw reference images still
need media ingest + wallet signing before these anchors can be promoted from
pending to CAEL-signed.

## What's staged

### The form (per `/idea` run-11)

A hybrid mathematical-sculpture composition:

1. **Golden-angle phyllotaxis spine** — every petal placed by the canonical
   137.50776° spiral. `PhyllotaxisAnchor` is the abstract source; the 42
   explicit `position: [x, 5, z]` tuples are the deterministic evaluation
   of that anchor at `seed = 0x0000DEAD` (the staged placeholder).
2. **Fibonacci-layered petals (8 + 13 + 21 = 42)** —
   - Inner ring (radius 2.0, 8 petals) — Program 1 (in-flight 8-paper plan).
   - Middle ring (radius 3.4, 13 petals) — Program 2 (4 known animation
     papers + 9 reserved capacity slots).
   - Outer ring (radius 4.8, 21 petals) — Program 3 (3 known core-IR papers
     + 18 reserved slots, including Papers 17–25 + Longitudinal-RE-INTAKE).
3. **GPU pollen field** — single canopy-origin emitter using the real
   `GPUParticleTrait`. Stages a turbulence-driven amber pollen drift.
   When per-instance gating lands, this expands to 42 per-petal emitters.
4. **`@bloom_reactive` driving petal opacity** — declared in `TODO`
   placeholders on every petal. Will read from
   `lotus.api.bloom_state` (already wired in
   `packages/studio/src/lib/brittney/lotus/derive-bloom-state.ts`).

### The determinism contract

Every rendering choice is a pure function of `LOTUS_GENESIS_SEED`:

| Choice | Function of seed | Staged value |
|--------|------------------|--------------|
| Petal `(x, z)` positions | `golden-angle-spiral(petal_index, layer_radius, seed_offset)` | seed offset = 0 |
| Petal jitter angle | `HKDF(seed, petal_index)` | jitter amplitude = 0.0 |
| Particle PRNG | `HKDF(seed, "pollen")` | placeholder seed → muted palette |
| Pollen drift turbulence | `HKDF(seed, "drift")` | deterministic |

**Pre-genesis seed:** `0x0000DEAD` (placeholder).
**Post-genesis seed:** `first_16_bytes(events.jsonl[0].hash)` from the
genesis anchor file at `D:/GOLD/anchors/lotus-genesis.json`.

When genesis fires, the renderer swaps the seed. **Same composition file
byte-for-byte. Fundamentally different visual signature.** This is the
zero-code-change staged-vs-live transition `/idea` argued for.

### Backed traits actually used

These have real handler files in `packages/core/src/traits/`:

| Trait | File | Used for |
|-------|------|----------|
| `@gpu_particle` | `GPUParticleTrait.ts` | Pollen field + dormant genesis light column |
| `@spatial_audio` | `SpatialAudioCueTrait.ts` (and family) | Pond ambience + dormant genesis chime |
| `@animated` | `AnimationTrait.ts` | Stalk sway, petal unfurl, gardener idle, center rotation |
| `@glowing` | `GlowingTrait` (already exercised in baseline) | Bloom-state-driven emission readability |

## What's blocked on trait-substrate

**This file will NOT render today.** It parses locally with the current
`parseHolo` path, but rendering remains blocked by missing Pattern-B trait
handlers and placeholder assets. Brace balance and structural counts are
correct. See "How I verified" below.

### Pattern-B traits (declared, no backing files)

55 TODO[trait-binding] markers in the composition. Seven distinct trait
shapes are blocking:

| Trait | Status | What it should do |
|-------|--------|--------------------|
| `@phyllotaxis` | NEW (proposed) | Pure function `(layer, index, golden_angle, seed) -> Vector3`. Single source of petal placement. Subsumes any future procedural-growth composition. |
| `@bloom_reactive` | NEW (A-009 wishlist) | Drives mesh scale + emissive intensity + opacity from a `bloom_state` enum without a per-frame `onUpdate` hook. |
| `@lotus_root` | Pattern-B (referenced in baseline) | Substrate-tier marker. Reads from compiler/parser/provenance source-of-truth at runtime. |
| `@lotus_stalk` | Pattern-B (referenced in baseline) | Format-tier marker (.hs / .hsplus / .holo / .hs.md). |
| `@lotus_petal` | Pattern-B (referenced in baseline) | Paper-tier marker. Each petal binds to a paper by id + venue + program + bloom_state. |
| `@lotus_center` | Pattern-B (referenced in baseline) | Center-tier marker. Phase-2 SDF body activates through this trait. |
| `@lotus_genesis_trigger` | Pattern-B (referenced in baseline) | Genesis hash anchor + light-column activation. |

`/stub-audit Lotus*` confirmed in the `/idea` memo that none of these have
backing files in `packages/core/src/traits/`. This is the trait-binding
layer of W.137 (Frame Drift) — the .holo file is a stable-looking pointer
to a thing that doesn't exist.

### Known parser limitations

- `instanced_object` block (the form `/idea` recommended for the petals
  collection) is **not** used in `garden.seedable.holo` because the
  current `.holo` dialect parser does not recognize that keyword. The 42
  petals are written as explicit `object` declarations with their
  deterministic positions hard-coded. When the parser learns
  `instanced_object`, the 42 explicit declarations collapse into one
  block driven by `PhyllotaxisAnchor`.
- Active composition comments use `//`; `#` is not accepted by the current
  `.holo` parser.
- Backticks in the JSDoc header may still trip the MCP server's security gate
  when validating via the network; local validation is parser-clean.

### Asset paths referenced (not yet on disk)

- `audio/garden_pond_loop.ogg` (referenced by baseline too)
- `audio/genesis_chime_loop.ogg` (referenced by baseline too)
- `sprites/pollen_disc.png` (NEW — pollen particle texture)
- `sprites/light_quanta.png` (NEW — genesis light-column particle texture)

These are referenced in trait args as path strings; the renderer will
fault on missing assets when the parser/runtime gap closes. They are
deliberately not part of this artifact's deliverables — `/artist` does
the composition, asset production is separate work.

## How I verified (without render_preview)

Per founder gate in the directive, **no `render_preview` was run**
(would fail on Pattern-B traits and produce a misleading red bar). What
was checked instead:

1. **Brace balance:** 135 open / 135 close — confirmed balanced.
2. **Petal counts by program:** `re.findall` confirms P1=8, P2=13,
   P3=21, total=42 — Fibonacci sequence intact.
3. **Object count:** 56 `object` declarations (3 roots + 4 stalks +
   center + 42 petals + Brittney + 2 audio + pollen field + genesis
   column + phyllotaxis anchor = 56). ✓
4. **Phyllotaxis math:** the 42 `position` tuples were computed by a
   Python harness using `angle = (i * 137.50776) mod 360`, `x = r*cos`,
   `z = r*sin`. Same harness called with the same seed will reproduce
   the same coordinates byte-for-byte.
5. **TODO marker hygiene:** 55 `TODO[trait-binding]` markers, exactly
   one per Pattern-B trait reference site, each naming the specific
   trait file that needs to land.
6. **Parser parity:** local `parseHolo` returns success with 0 errors for
   both `garden.refreshed.holo` and `garden.seedable.holo`.

## How to fire when genesis triggers and traits land

### Step 1 — Implement the Pattern-B traits

Five `Lotus*Trait` files plus `PhyllotaxisTrait` and `BloomReactiveTrait`.
Each is a thin handler that wires `bloom_state` → visual-state mapping.
The `/idea` memo lists these as the BUILD blockers — file them as board
tasks via `/room`.

### Step 2 — Wire the seed env path

```bash
# Pre-genesis (today): placeholder
export LOTUS_GENESIS_SEED=0x0000DEAD

# Post-genesis (when 16 papers land):
# 1. plant-seed.mjs writes D:/GOLD/anchors/lotus-genesis.json with events[0].hash
# 2. Renderer reads that file at boot:
export LOTUS_GENESIS_SEED=$(jq -r '.events[0].hash[0:34]' D:/GOLD/anchors/lotus-genesis.json)
```

### Step 3 — Activate the dormant assets

Two things SHIP dormant in this file. They flip on automatically when
the trait substrate lands AND the genesis condition fires (NOT before):

- `GenesisChime` audio: `volume: 0.0` → fades to `0.6` over 4s.
- `GenesisLightColumn`: `enabled: false` + `emission_rate: 0` → flips
  to `enabled: true` + `emission_rate: 100` for 60s.

Founder gate per `project_lotus-genesis-trigger.md`: this is treated as
sacred. /artist does not flip the gate.

### Step 4 — Optional: collapse explicit petals into instanced form

When `@phyllotaxis` + `instanced_object` parsing lands, the 42 explicit
`object "Petal Px.y"` blocks become redundant and can be replaced with:

```holoscript
instanced_object "Petals" {
  source_trait: @phyllotaxis
  instance_trait: @lotus_petal
  @bloom_reactive { state_source: "lotus.api.bloom_state" }
  @gpu_particle { /* per-instance pollen, gated_on: state == "full" */ }
}
```

This is a future cleanup move, **not a Phase-1 requirement**. Keeping the
42 explicit positions today documents the determinism contract more
visibly than the abstract form would.

### Step 5 — Phase 2: SDF center body

Reserved for a separate `/research` run. The `Center: Dumb Glass
(placeholder)` slot becomes the SDF body for paper P3-CENTER ("rendering
as contracted synthesis"). The puzzle-aesthetic of ray-marched SDF
matches the paper's thesis. Activates only post-genesis.

## Constraints honored

- **I.007:** STAGED, not fired. Genesis chime and light column ship
  dormant. Outer ring (Program 3) starts fully sealed.
- **W.137 (Frame Drift):** every Pattern-B trait reference flagged with
  TODO[trait-binding] naming the exact file that needs to land.
- **F.014:** zero regex `.hs` parsing — the composition uses only the
  `.holo` declarative form via `@trait { ... }` blocks.
- **F.040 (peer-recent-git-log):** Verified at composition time — no
  peer commits to `examples/lotus-flower/` in the last 48h.
- **No push to `mcp.holoscript.net`:** Validation attempts only;
  staged-only per founder gate. No `compile_holoscript` run, no
  `create_share_link`, no Moltbook crosspost, no HoloMesh contribution.
- **Gallery target:** HoloScript repo `examples/lotus-flower/`, not
  ai-ecosystem worktree. ✓

## Cross-references

- `/idea` memo: `research/2026-05-06_idea-run-11-lotus-seedable-artifact.md`
- Genesis trigger spec: `~/.claude/projects/.../project_lotus-genesis-trigger.md`
- Bloom-state derivation: `packages/studio/src/lib/brittney/lotus/derive-bloom-state.ts`
- 11-stage growth schema: `~/.ai-ecosystem/research/2026-04-17_ai-driven-lotus-heartbeat-SEED-TO-BLOOM.md`
- VitePress slot: `docs/lotus.md` (currently empty per founder constraint)
- Frame-drift wisdom: MEMORY.md W.137
- Pattern-B audit pattern: `/stub-audit` skill
