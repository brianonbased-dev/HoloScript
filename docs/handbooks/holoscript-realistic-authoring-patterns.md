# Realistic-Authoring Patterns for HoloScript

> **Status:** pattern library + doctrine. Created 2026-07-03.
> **Audience:** agents (Claude + local IDE agents especially, and any LLM authoring path —
> `generateHoloScript()`, `generate_object`/`generate_scene`/`generate_world`) composing visual
> HoloScript content. **Companion docs:** [`srnh-sim-and-realism-native-holoscript.md`](srnh-sim-and-realism-native-holoscript.md)
> (the RENDER-PIPELINE gap — whether authored richness actually shows up in the sovereign
> preview; this doc does not duplicate that map), [`holoscript-native-authoring-vs-pretrained.md`](holoscript-native-authoring-vs-pretrained.md)
> (code-_structure_ nativeness — traits-as-data, gate-derived correctness; a disjoint subject
> from this doc's concern, which is visual-_content_ richness).
>
> This doc is the deliverable of `research/2026-07-03_holoscript-realistic-authoring-docs-PLAN.md`
> Stage 0 (ai-ecosystem repo). Every trait name and snippet below is grepped straight out of
> `examples/showcase/realistic-forest.refreshed.holo` — nothing here is invented syntax.

---

## 0. Why this exists (the one-paragraph diagnosis)

Ask a frontier model to author "a realistic forest" in HoloScript and it will, by default,
produce `cube { @color(red) @position(0,1,0) }` — a bare primitive with a flat hex color. This
is not a training gap or a laziness bug. It is the traced, verified behavior of a **closed
loop**: the system prompt injected into every authoring call enumerated only primitives +
4 basic traits; the deterministic fallback generator (`GEOMETRY_KEYWORDS`/`COLOR_KEYWORDS` in
`packages/mcp-server/src/generators.ts`) walks a 17-word shape map and a 15-word color map with
zero material/model branch; and 92.6% of the existing `.holo` example corpus itself shows no
richness signal for a model to pattern-match against. Fixing the prompt (done, see
`packages/llm-provider/src/base-adapter.ts`'s `HOLOSCRIPT_SYSTEM_PROMPT`) raises the ceiling.
This handbook is what fills in under that raised ceiling: a **pattern library**, not a single
long example, so an authoring model (or an agent) has a _named target_ to retrieve and compose
from instead of collapsing to the statistical average of a bare label.

## 1. The load-bearing design principle: brief, not label

External AI-authoring tooling research (UI-builder literature: v0.dev, Bolt.new, Lovable, plus
few-shot/RAG code-gen work) converges on one diagnosis for this exact failure mode: **a model
given a label ("realistic", "forest", "nice lighting") returns the statistical average of that
label — a primitive, a flat color, no light rig — because a label has no target, no vocabulary,
no constraint, and no scope.** A model given a **four-slot brief** instead produces composed,
specific output:

1. **Target** — a named archetype ("weathered outdoor prop"), never a bare adjective
   ("realistic").
2. **Conventions** — a named trait/material vocabulary to draw from (this library), not
   hand-derived hex/roughness values invented per call.
3. **Constraints** — a hard, checkable minimum ("every solid object carries one material trait;
   the scene has one light source beyond ambient").
4. **Scope** — one object or zone per generation call, not "the whole scene" in one shot.

Every pattern below is written in this four-slot shape. When authoring new content — by hand or
by prompting a generation tool — reach for the nearest matching pattern's brief instead of
re-deriving material values from scratch.

## 2. The flagship before/after (read this first)

`examples/showcase/realistic-forest.holo` (pre-refresh) and
`examples/showcase/realistic-forest.refreshed.holo` (current) are the _same scene concept_,
authored twice. The diff between them is the canonical "how to upgrade primitive content to
real content" reference — smaller than reading either file in full:

| Axis         | Before (`realistic-forest.holo`)                                                                | After (`realistic-forest.refreshed.holo`)                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Material     | flat `pbr_material` block, one `unlit_material` with no light contribution                      | `material "ForestGround" @advanced_pbr { base_color, roughness, metallic, albedo_map, normal_map, ao_map, height_map, wetness }` — full PBR decomposition |
| Environment  | static `weather{}` block, disconnected from other objects                                       | `@time_of_day` driver (4 named phases) that other objects _subscribe to_ via `time_envelope`                                                              |
| Atmosphere   | none                                                                                            | `@volumetric_clouds` + `@wind` as coupled environment drivers                                                                                             |
| Light        | campfire model with no real light contribution                                                  | `@emissive` object paired with a real `point_light { color, intensity, range, cast_shadows }` that lights neighboring geometry                            |
| Parse status | **fails to parse** (verified failing, line 352 — kept as reference only, not a working example) | **verified parsing** (`examples-health.matrix.json`)                                                                                                      |

The before file shows the trap: writing _something_ that looks like a material or an
environment block is not the same as writing one that composes, subscribes, or actually casts
light. The after file is the reference this whole library generalizes from. When in doubt,
open `examples/showcase/realistic-forest.refreshed.holo` and find the nearest pattern below.

## 3. Pattern library

Each pattern gives target / conventions / constraints / scope, then a short, syntactically
plausible snippet built from real trait names verified present in
`realistic-forest.refreshed.holo`. Snippets are illustrative fragments, not full scenes — per
the scope slot, generate one object/zone at a time.

### Pattern 1 — Weathered outdoor prop (PBR + imported mesh)

- **Target:** a real-world object with age, wear, and surface variation — a boulder, a plank, a
  worn tool. Not "a rock," which collapses to a gray sphere.
- **Conventions:** `@advanced_pbr` material with independent `base_color`/`roughness`/`metallic`
  fields plus at minimum `albedo_map` + `normal_map`; an imported `model: "*.glb"` mesh rather
  than an inline primitive; `@collidable` if it participates in physics.
- **Constraints:** the material trait must set at least `base_color`, `roughness`, and one
  texture map (`albedo_map` or `normal_map`) — `base_color` alone is a smell (§4). If the object
  is physical, pair a `collider` and `rigidbody` block.
- **Scope:** one object + its referenced material, not the whole terrain.

```holoscript
material "ForestGround" @advanced_pbr {
  base_color: "#5d4037"
  roughness: 0.85
  metallic: 0.0
  albedo_map: "textures/ground_albedo.png"
  normal_map: "textures/ground_normal.png"
  ao_map: "textures/ground_ao.png"
  wetness: 0.35
}

object "Boulder" @collidable @advanced_pbr {
  position: [12, 3, -5]
  model: "models/boulder.glb"
  collider: { type: "mesh", convex: true, friction: 0.8, restitution: 0.1 }
  rigidbody: { mass: 500, angular_damping: 0.95, linear_damping: 0.1 }
  material: "ForestGround"
}
```

### Pattern 2 — Glowing organic accent (`@bioluminescent` + `@emissive` + real light)

- **Target:** a small, alive-feeling light source — fairy-ring mushrooms, glowing moss, an
  insect swarm. Not a flat emissive cube.
- **Conventions:** `@bioluminescent` for organism-like pulsing (`pattern: "perlin"`,
  `frequency`, `phase_offset` to desynchronize adjacent instances), stacked with `@emissive` for
  the actual emission color/intensity that a renderer picks up.
- **Constraints:** if the object is meant to illuminate its surroundings (not just self-glow),
  it needs a paired `point_light` block — `@emissive` alone only affects the object's own
  material, per the smell list (§4). Multiple instances of the same organism should vary
  `phase_offset` so they don't pulse in lockstep.
- **Scope:** one emitter (or a small cluster sharing one archetype), not the whole lighting rig.

```holoscript
object "MushroomRing_A" @bioluminescent @emissive {
  position: [3.5, 0.0, 3.0]
  model: "models/mushroom_cluster.glb"

  @bioluminescent {
    pattern: "perlin"
    base_color: "#00ff88"
    pulse_color: "#88ffcc"
    frequency: 0.06
    phase_offset: 0.0
    intensity: 1.8
    falloff: 0.7
  }

  emission_color: "#00ff88"
  emission_intensity: 1.2
}
```

For a source meant to actually light a scene (not just glow), pair it with a `point_light`:

```holoscript
object "Campfire" @emissive {
  position: [0, 0.3, 0]
  model: "models/campfire_rocks.glb"
  emission_color: "#ff6030"
  emission_intensity: 8.0

  point_light {
    color: "#ff8040"
    intensity: 4.5
    range: 12
    cast_shadows: true
  }
}
```

### Pattern 3 — Time-evolving environment (`@time_of_day` + subscribers)

- **Target:** a scene whose mood changes over its runtime — dawn to dusk, not a frozen static
  lighting rig.
- **Conventions:** one `@time_of_day` driver object with named `phases` (each phase sets
  `sun_intensity`/`ambient_light`/`fog_density`/`sky_exposure`); other objects subscribe to the
  same phases via a `time_envelope` map rather than hardcoding their own clock.
- **Constraints:** a driver with only one phase is not a time-of-day system — at least two named
  phases are required. Any object whose behavior should track time (ambience volume, emission
  intensity) must read the driver's phase, not duplicate timing logic locally.
- **Scope:** the driver object plus one or two subscribers per generation call — not every
  object in the scene at once.

```holoscript
object "ForestTimeDriver" {
  @time_of_day {
    cycle_duration_minutes: 24
    start_phase: "golden"
    phases: {
      dawn:   { sun_intensity: 0.25, ambient_light: 0.10, fog_density: 0.032, sky_exposure: 0.6 }
      golden: { sun_intensity: 0.60, ambient_light: 0.18, fog_density: 0.018, sky_exposure: 1.0 }
      dusk:   { sun_intensity: 0.30, ambient_light: 0.14, fog_density: 0.024, sky_exposure: 0.7 }
      dark:   { sun_intensity: 0.02, ambient_light: 0.06, fog_density: 0.040, sky_exposure: 0.2 }
    }
  }
}

object "ForestSoundscape" {
  @ambient {
    src: "audio/forest-birds-dusk.ogg"
    volume: 0.55
    loop: true
    autoplay: true
    time_envelope: { dawn: 0.0, golden: 1.0, dusk: 0.6, dark: 0.0 }
  }
}
```

### Pattern 4 — Atmospheric volume (`@volumetric_clouds` + `@wind`)

- **Target:** air that behaves like air — moving clouds, coherent gusts that couple multiple
  surface effects — not a static skybox texture with no dynamics.
- **Conventions:** `@volumetric_clouds` with `coverage`/`altitude`/`thickness`/`density` plus a
  lit/shadow color split (`lit_color`, `shadow_color`) so clouds respond to the light direction;
  `@wind` as one source of truth (`direction`, `strength`, `turbulence`, `gust_frequency`) that
  other objects (foliage sway, smoke drift) read rather than each inventing their own motion.
- **Constraints:** a cloud layer needs both a `lit_color` and `shadow_color` (or it will render
  as a flat, unlit haze — see smell list). A wind zone should be referenced by at least one
  other effect (particle `noise`, template `wind_sway`) — an unreferenced wind object is inert
  set dressing, not a driver.
- **Scope:** the cloud layer or the wind zone as one generation call each; couple them to
  consumers in a follow-up call, not all at once.

```holoscript
object "TwilightClouds" {
  position: [0, 280, 0]
  @volumetric_clouds(
    coverage: 0.55, altitude: 280, thickness: 60,
    wind: [0.4, 0, 0.15], layers: 6, density: 0.06,
    base_color: "#c8d8f0", lit_color: "#ff9944", shadow_color: "#2a3050"
  )
}

object "ValleyWind" {
  position: [0, 5, 0]
  @wind(
    direction: [0.7, 0.05, 0.4], strength: 3.2,
    turbulence: 0.55, gust_frequency: 0.18, gust_strength: 5.5, radius: 200
  )
}
```

### Pattern 5 — Placeholder vs. real (when a bare primitive IS appropriate)

- **Target:** a _labeled_ test fixture, mock, or layout stand-in — not a finished asset
  presented as done.
- **Conventions:** a bare primitive (`mesh: { type: "cube" }`) with a flat `@color` is
  legitimate for unit tests, physics-collider stand-ins, editor gizmos, or explicitly-named
  placeholder objects (`object "PlaceholderCrate_TODO"`). It is illegitimate as the final visual
  representation of a named, story-bearing entity.
- **Constraints:** if a bare primitive is used deliberately, name it so — a `_placeholder`,
  `_mock`, or `TODO` marker in the object name or a comment, matching this ecosystem's
  no-silent-placeholder posture (see SRNH §0.1: "never a basic shape passed off as the real
  thing"). Silence is the smell, not the primitive itself.
- **Scope:** one object.

```holoscript
// Legitimate: an explicitly labeled test collider, not presented as finished content.
object "PlaceholderCrate_TEST" {
  mesh: { type: "cube", width: 1, height: 1, depth: 1 }
  @color("#888888")
  collider: { type: "box" }
}
```

```holoscript
// Illegitimate if this is meant to be the finished "Boulder" seen by a user:
object "Boulder" {
  mesh: { type: "sphere", radius: 2 }
  @color("#888888")
}
// — no material trait, no texture, no name signaling it's a stand-in. See §4 smell list.
```

### Pattern 6 — Procedural terrain / biome

- **Target:** ground that varies with real spatial structure — ridgelines, moisture gradients,
  paths — not a single flat plane mesh with one texture tiled across it.
- **Conventions:** a `procedural` block with a `layers` array (each entry a named noise type —
  `perlin`/`ridged`/`voronoi` — with `scale`/`octaves`/`amplitude` or type-specific params) and
  a `biomes` array (each entry keyed by `altitude`/`moisture` ranges, driving `density` and a
  species/`trees`/`ground_cover` list). Populate it with a `scatter` block referencing the
  terrain by name.
- **Constraints:** at least two noise layers (a base + one modifier, e.g. `perlin` base +
  `ridged` mountains) and at least two biomes keyed on different altitude/moisture ranges — one
  flat layer with one biome is functionally a plain plane with extra syntax, not a real
  procedural biome.
- **Scope:** the terrain + its biome table as one call; the `scatter` population as a follow-up.

```holoscript
procedural "ForestTerrain" @seed(42) {
  resolution: [512, 512]
  world_size: [500, 500]
  layers: [
    { type: "perlin",  name: "base",      scale: 120, octaves: 6, persistence: 0.5, amplitude: 30 },
    { type: "ridged",  name: "mountains", scale: 300, octaves: 4, weight: 0.3, offset: 1.0 },
    { type: "voronoi", name: "paths",     scale: 50,  jitter: 0.8, distance_function: "euclidean" }
  ]
  biomes: [
    { name: "DenseForest", altitude: [0, 15], moisture: [0.6, 1.0], density: 0.8, trees: ["oak", "birch", "pine"] },
    { name: "Clearing",    altitude: [0, 5],  moisture: [0.3, 0.6], density: 0.1, ground_cover: ["grass", "wildflower"] }
  ]
}

scatter "TreeDistribution" {
  source: "ForestTerrain"
  count: 2000
  min_distance: 3.0
  slope_limit: 35
  align_to_normal: true
}
```

## 4. Smell list (named anti-patterns)

Flag any of these when reviewing generated or hand-authored content — they are the concrete,
checkable signals that content has regressed to the primitive-only default:

- **A material trait with only `base_color` set** and no `roughness`, `metallic`, or texture map
  (`albedo_map`/`normal_map`/`ao_map`) is a smell — it's a flat-hex color wearing a material
  trait's syntax, not a real material.
- **A bare primitive + flat `@color` presented as a finished, named entity** (not labeled a
  placeholder/test/mock per Pattern 5) is a smell — Lambert-shaded geometry standing in for an
  asset without saying so.
- **An `@emissive` object with no paired `point_light`** doesn't actually illuminate anything —
  it glows in isolation and casts no light on neighbors. If the brief calls for something that
  _lights a scene_ (a campfire, a lantern), the light block is not optional.
- **A `@time_of_day` driver with fewer than two named phases** is a static lighting rig
  wearing a time-driver's syntax.
- **A `@wind` or environment-driver object with zero consumers** (nothing reads its
  `time_envelope`, nothing sets `wind_sway`) is inert set dressing, not a coupling mechanism —
  the point of a driver pattern is that other objects subscribe to it.
- **A `procedural` terrain block with one noise layer and one biome** collapses to a plain plane
  with extra fields — not a real procedural biome (see Pattern 6 constraints).
- **An imported `model:` path with no accompanying material reference** loses the PBR surface
  detail the mesh was presumably authored with — pair `model` with a named `material`.
- **Copy-pasted material values across unrelated objects** (same `base_color`/`roughness` on a
  boulder and a tree trunk) is a smell that no real per-object variation was authored — even a
  small preset library should vary at minimum `base_color` and one texture-map path per
  archetype.

## 5. Doctrine checklist

- [ ] **Started from a brief, not a label?** Target/conventions/constraints/scope (§1) — not "a
      realistic X."
- [ ] **Every solid object carries one material trait?** `@advanced_pbr` (or a documented
      equivalent) with more than just `base_color` set — not a bare `@color` on a primitive,
      unless explicitly labeled a placeholder (Pattern 5).
- [ ] **At least one light source beyond ambient?** A scene with only `ambient_light` and no
      `point_light`/emissive-with-light-pair under-lights everything it contains.
- [ ] **Drivers have consumers?** Any `@time_of_day`/`@wind`/`@volumetric_clouds` object is
      referenced by at least one other object's `time_envelope`, `wind_sway`, or equivalent —
      not standalone set dressing.
- [ ] **Placeholders are named, not silent?** If a bare primitive is intentional (test, mock,
      collider stand-in), the object name or a comment says so.
- [ ] **Checked the smell list (§4) before calling generation done?**
- [ ] **Consulted the pattern library before hand-deriving material values?** Reach for the
      nearest named pattern (§3) instead of inventing hex/roughness numbers per call.
- [ ] **Verified against real syntax?** Every trait name traces to a working example
      (`examples/showcase/realistic-forest.refreshed.holo` or `examples-health.matrix.json`
      `status: 'supported'` entries) — not invented from a mental model of what HoloScript
      "should" support.

> This library in one line: **a named brief plus a named pattern beats a label plus a guess —
> compose from real trait vocabulary, pair every light-emitting trait with a real light, and
> never let a bare primitive pass as finished content without saying so.**
