# Lotus Seedable Artifact — Staged

> **Status:** STAGED. Pre-genesis. Not live on holoscript.net.
> Composed by `/artist` on 2026-05-06 per `/idea` run-11 form recommendation
> (`research/2026-05-06_idea-run-11-lotus-seedable-artifact.md`).

This document explains what's in `garden.seedable.holo`, what's still gated
before it can fire, and how to fire it when the 16-paper genesis trigger lands.

## Relationship to the existing files

| File                              | Role                                                                                               | Status                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `garden.holo`                     | First-pass declarative composition                                                                 | LEGACY (kept for diff history)                            |
| `garden.refreshed.holo`           | A-009's bloom-state visual-readability baseline (glow / pulse / pollen)                            | BASELINE (do not modify; reference for visual vocabulary) |
| `garden.seedable.holo`            | This artifact — phyllotaxis spine + Fibonacci-layered petals + GPU pollen + bloom-reactive opacity | STAGED (this file)                                        |
| `reference.anchors.json`          | Pending CAEL media anchors for the three in-thread lotus reference images                          | STAGED (awaiting raw media ingest)                        |
| `reference.material-extract.json` | Photo-derived material seed for `@botanical_lotus`                                                 | STAGED (visual seed)                                      |
| `build-reference-manifest.mjs`    | Local hashing helper for replacing pending anchors with `sha256:` anchors                          | TOOLING                                                   |
| `build-fallback-assets.mjs`       | Deterministic local fallback generator/checker for staged pollen/audio/light media                 | TOOLING                                                   |
| `fallback-assets.manifest.json`   | Hash manifest for deterministic fallback media referenced by the staged composition                | FALLBACK                                                  |

`garden.seedable.holo` is **additive**. It does not replace either earlier
file. It composes a new form on top of A-009's visual vocabulary.

**2026-05-06 update:** the Lotus visual/program trait family now has backed
core handlers and runtime registration for `@botanical_lotus`, `@phyllotaxis`,
`@bloom_reactive`, `@lotus_root`, `@lotus_stalk`, `@lotus_petal`,
`@lotus_center`, and `@lotus_gardener`. holoscript-net consumes the botanical
render profile for the live 3D proof surface. The raw reference images still
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

| Choice                   | Function of seed                                              | Staged value                     |
| ------------------------ | ------------------------------------------------------------- | -------------------------------- |
| Petal `(x, z)` positions | `golden-angle-spiral(petal_index, layer_radius, seed_offset)` | seed offset = 0                  |
| Petal jitter angle       | `HKDF(seed, petal_index)`                                     | jitter amplitude = 0.0           |
| Particle PRNG            | `HKDF(seed, "pollen")`                                        | placeholder seed → muted palette |
| Pollen drift turbulence  | `HKDF(seed, "drift")`                                         | deterministic                    |

**Pre-genesis seed:** `0x0000DEAD` (placeholder).
**Post-genesis seed:** `first_16_bytes(events.jsonl[0].hash)` from the
genesis anchor file at `D:/GOLD/anchors/lotus-genesis.json`.

When genesis fires, the renderer swaps the seed. **Same composition file
byte-for-byte. Fundamentally different visual signature.** This is the
zero-code-change staged-vs-live transition `/idea` argued for.

### Backed traits actually used

These have real handler files in `packages/core/src/traits/`:

| Trait            | File                                           | Used for                                                 |
| ---------------- | ---------------------------------------------- | -------------------------------------------------------- |
| `@gpu_particle`  | `GPUParticleTrait.ts`                          | Pollen field + dormant genesis light column              |
| `@spatial_audio` | `SpatialAudioCueTrait.ts` (and family)         | Pond ambience + dormant genesis chime                    |
| `@animated`      | `AnimationTrait.ts`                            | Stalk sway, petal unfurl, gardener idle, center rotation |
| `@glowing`       | `GlowingTrait` (already exercised in baseline) | Bloom-state-driven emission readability                  |

## What's still gated on trait/render substrate

The composition remains **staged, not fired**. The earlier hard blocker
was missing Pattern-B trait files; that substrate has now landed for every
Lotus visual/program trait. `@lotus_genesis_trigger` is now backed too,
but its runtime policy remains founder-gated: it refuses to fire without
the signed genesis anchor, non-placeholder seed, and all-petals-full state.
Rendering is still gated by that trigger policy, live migration of the
commented trait-binding sites into active `@trait` blocks, and the final
CAEL photoreal material pipeline.

The 55 `TODO[trait-binding]` markers remain intentionally as migration
markers. They no longer mean the backed files are absent; they mark where
`garden.seedable.holo` should switch from explicit placeholder geometry
to active trait blocks when the founder gate allows the flower to fire.

### Trait-substrate status

| Trait                    | Status                      | What it should do                                                                                                 |
| ------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@botanical_lotus`       | Backed + registered         | Provenance-grounded lotus material contract for SSS, translucency, veins, stamen detail, and gravity sag.         |
| `@phyllotaxis`           | Backed + registered         | Pure deterministic placement `(layer, index, golden_angle, seed) -> Vector3`. Single source of petal placement.   |
| `@bloom_reactive`        | Backed + registered         | Drives mesh scale + emissive intensity + opacity from a `bloom_state` enum without ad hoc per-object update code. |
| `@lotus_root`            | Backed + registered         | Substrate-tier marker. Reads from compiler/parser/provenance source-of-truth at runtime.                          |
| `@lotus_stalk`           | Backed + registered         | Format-tier marker (.hs / .hsplus / .holo / .hs.md).                                                              |
| `@lotus_petal`           | Backed + registered         | Paper-tier marker. Each petal binds to a paper by id + venue + program + bloom_state.                             |
| `@lotus_center`          | Backed + registered         | Center-tier marker. Phase-2 SDF body activates through this trait.                                                |
| `@lotus_gardener`        | Backed + registered         | Garden coordinator for staged state, seed metadata, and bloom summaries.                                          |
| `@lotus_genesis_trigger` | Backed + registered, locked | Signed genesis anchor validation, seed derivation, and light-column activation event.                             |

`@lotus_genesis_trigger` stays dormant by design until the 16-paper benchmark
trigger is allowed to plant the seed. The remaining blocker is the founder-gated
anchor and final render activation, not an absent trait handler.

### Parser status

- `instanced_object` is now recognized by the local `.holo` parser and
  preserved as `declarationKind: "instanced_object"` with deterministic
  `instanceMetadata` (`source_trait`, `instance_trait`, count, anchor,
  seed, generator, and applied traits). `garden.seedable.holo` still keeps
  the 42 explicit petal declarations for staged readability and founder-gated
  activation, but the parser can accept the collapsed `PhyllotaxisAnchor`
  form shown below.
- Active composition comments use `//`; `#` is not accepted by the current
  `.holo` parser.
- Backticks in the JSDoc header may still trip the MCP server's security gate
  when validating via the network; local validation is parser-clean.

### Asset paths referenced (deterministic fallbacks)

- `audio/garden_pond_loop.ogg` (referenced by baseline too)
- `audio/genesis_chime_loop.ogg` (referenced by baseline too)
- `sprites/pollen_disc.png` (NEW — pollen particle texture)
- `sprites/light_quanta.png` (NEW — genesis light-column particle texture)

These paths are now backed by deterministic fallback assets generated by
`build-fallback-assets.mjs` and pinned in `fallback-assets.manifest.json`
with `sha256:` content hashes. They are deliberately marked as replaceable
fallbacks, not final art. The final CAEL media pass should replace them
with wallet-signed, reference-grounded assets while preserving the same
path contract or updating the manifest and composition together.

To regenerate or verify the current fallbacks:

```bash
node examples/lotus-flower/build-fallback-assets.mjs
node examples/lotus-flower/build-fallback-assets.mjs --check
```

The `--check` mode is the fail-loud gate: if any referenced fallback is
missing, modified, or hash-mismatched, it exits non-zero instead of letting
pollen/audio/genesis light silently vanish.

## How I verified (without render_preview)

Per founder gate in the directive, **no `render_preview` was run**
(still misleading while the genesis trigger, active trait-block migration,
and final material pipeline are gated). What was checked instead:

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
5. **TODO marker hygiene:** 55 `TODO[trait-binding]` migration markers.
   All referenced trait files are now backed; `@lotus_genesis_trigger`
   is backed but locked behind the founder-gated signed anchor.
6. **Parser parity:** local `parseHolo` returns success with 0 errors for
   both `garden.refreshed.holo` and `garden.seedable.holo`.

## How to fire when genesis triggers

### Step 1 — Migrate the staged trait-binding sites

The backed traits now exist and are registered. Replace the commented
`TODO[trait-binding]` sites with active trait blocks after the founder gate
permits firing. Keep `@lotus_genesis_trigger` dormant until the benchmark
trigger is satisfied.

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

Two things SHIP dormant in this file. They flip on automatically when the
remaining genesis trigger lands AND the genesis condition fires (NOT before):

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
- **W.137 (Frame Drift):** every staged trait migration site flagged with
  TODO[trait-binding] naming the exact trait block to activate.
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
