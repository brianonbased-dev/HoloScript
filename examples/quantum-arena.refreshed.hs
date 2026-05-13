// ============================================================
// Quantum Arena Mk.II — Refreshed (A-009, 2026-05-13)
// ============================================================
// Original intent: sci-fi battle environment
// Refresh adds: @collidable barriers, @animated energy ring,
//   @particle_system spawn pads, @networked spawn points,
//   @spatial_audio arena ambiance, @clickable interactables,
//   volumetric fog, dramatic lighting, full post-processing.
//
// The arena feels alive now — barriers hum and deflect,
// spawn pads crackle with readiness, the orbital energy ring
// marks the point of no return at center stage.
//
// Run: holoscript preview examples/quantum-arena.refreshed.hs
// ============================================================

// ------------------------------------------------------------
// ENVIRONMENT
// Deep space nebula backdrop. Dense forward fog compresses
// the arena into a claustrophobic kill-box.
// ------------------------------------------------------------
environment {
  skybox: "nebula"
  ambient_light: 0.12
  fog_density: 0.035
  fog_color: "#060612"
  gravity: 9.81
}


// ------------------------------------------------------------
// ARENA FLOOR
// Segmented hexagonal tiles in deep navy. The surface is
// slightly reflective — player silhouettes ghost across it.
// ------------------------------------------------------------
object "arena_floor" {
  geometry: "cylinder"
  color: "#0d0d1e"
  material: "standard"
  roughness: 0.25
  metallic: 0.6
  position: { x: 0, y: 0, z: 0 }
  scale: { x: 10.5, y: 0.18, z: 10.5 }
  receiveShadow: true
  texture: "textures/hexgrid_dark.png"
  @collidable { layer: "ground", restitution: 0.05, friction: 0.8 }
}

// Outer ring rim — raises the arena boundary
object "floor_rim" {
  geometry: "torus"
  color: "#1a1a3a"
  material: "metal"
  roughness: 0.3
  metallic: 0.8
  position: { x: 0, y: 0.1, z: 0 }
  scale: { x: 10.5, y: 10.5, z: 0.3 }
  castShadow: true
}


// ------------------------------------------------------------
// ENERGY BARRIERS
// Two opposing force-field walls. Each is @glowing (intense
// cyan / magenta) and @collidable so projectiles and players
// actually stop on impact.
// ------------------------------------------------------------

object "barrier_cyan" {
  geometry: "cube"
  color: "#00ffff"
  material: "neon"
  roughness: 0.1
  metallic: 0.0
  opacity: 0.72
  emissive: "#00ffff"
  emissiveIntensity: 1.8
  glow: true
  position: { x: -4.5, y: 1.2, z: 0 }
  scale: { x: 0.12, y: 2.4, z: 3.2 }
  castShadow: false
  @glowing { color: "#00ffff", intensity: 2.2, radius: 0.9 }
  @collidable { layer: "barrier", restitution: 0.6, friction: 0.05 }
  @animated { type: "pulse", speed: 1.1, amplitude: 0.08 }
}

// Barrier top arc — caps the cyan wall
object "barrier_cyan_cap" {
  geometry: "cylinder"
  color: "#00ffff"
  material: "neon"
  emissive: "#00ffff"
  emissiveIntensity: 1.2
  glow: true
  position: { x: -4.5, y: 2.55, z: 0 }
  scale: { x: 0.08, y: 0.08, z: 3.2 }
  @glowing { color: "#00ffff", intensity: 1.4, radius: 0.4 }
}

object "barrier_magenta" {
  geometry: "cube"
  color: "#ff00ff"
  material: "neon"
  roughness: 0.1
  metallic: 0.0
  opacity: 0.72
  emissive: "#ff00ff"
  emissiveIntensity: 1.8
  glow: true
  position: { x: 4.5, y: 1.2, z: 0 }
  scale: { x: 0.12, y: 2.4, z: 3.2 }
  castShadow: false
  @glowing { color: "#ff00ff", intensity: 2.2, radius: 0.9 }
  @collidable { layer: "barrier", restitution: 0.6, friction: 0.05 }
  @animated { type: "pulse", speed: 0.95, amplitude: 0.08 }
}

object "barrier_magenta_cap" {
  geometry: "cylinder"
  color: "#ff00ff"
  material: "neon"
  emissive: "#ff00ff"
  emissiveIntensity: 1.2
  glow: true
  position: { x: 4.5, y: 2.55, z: 0 }
  scale: { x: 0.08, y: 0.08, z: 3.2 }
  @glowing { color: "#ff00ff", intensity: 1.4, radius: 0.4 }
}


// ------------------------------------------------------------
// CENTRAL PILLAR
// The arena's power conduit. Physics-enabled so players can
// detonate it with heavy impacts. When active it pulses; when
// damaged, flicker animations signal structural failure.
// ------------------------------------------------------------

object "central_pillar" {
  geometry: "cylinder"
  color: "#3a3a5e"
  material: "metal"
  roughness: 0.4
  metallic: 0.85
  position: { x: 0, y: 2.2, z: 0 }
  scale: { x: 0.9, y: 4.4, z: 0.9 }
  castShadow: true
  @collidable { layer: "structure", restitution: 0.1, friction: 0.9 }
  @physics { mass: 800, static: true }
  @glowing { color: "#6644ff", intensity: 0.6, radius: 1.2 }
}

// Pillar energy conduit strips
object "pillar_strip_a" {
  geometry: "cube"
  color: "#6644ff"
  material: "neon"
  emissive: "#6644ff"
  emissiveIntensity: 1.4
  glow: true
  position: { x: 0.46, y: 2.2, z: 0 }
  scale: { x: 0.04, y: 4.0, z: 0.04 }
  @animated { type: "pulse", speed: 2.0, amplitude: 0.3 }
}

object "pillar_strip_b" {
  geometry: "cube"
  color: "#6644ff"
  material: "neon"
  emissive: "#6644ff"
  emissiveIntensity: 1.4
  glow: true
  position: { x: -0.46, y: 2.2, z: 0 }
  scale: { x: 0.04, y: 4.0, z: 0.04 }
  @animated { type: "pulse", speed: 2.0, amplitude: 0.3, phase_offset: 0.5 }
}


// ------------------------------------------------------------
// ORBITAL ENERGY RING
// Hovers above the pillar, spinning on Y. Acts as both
// visual centerpiece and kill-zone proximity indicator.
// @clickable for team score display.
// ------------------------------------------------------------

object "energy_ring" {
  geometry: "torus"
  color: "#00ff88"
  material: "neon"
  roughness: 0.05
  metallic: 0.2
  emissive: "#00ff88"
  emissiveIntensity: 2.5
  glow: true
  position: { x: 0, y: 4.8, z: 0 }
  scale: { x: 2.2, y: 2.2, z: 0.18 }
  @animated { type: "spin", axis: "y", speed: 0.6 }
  @glowing { color: "#00ff88", intensity: 3.0, radius: 2.0 }
  @clickable { action: "show_score_board", label: "View Match Score" }
  @collidable { layer: "hazard", restitution: 0.9, trigger: true }
}

// Secondary outer ring — slower counter-rotation
object "energy_ring_outer" {
  geometry: "torus"
  color: "#00cc55"
  material: "neon"
  emissive: "#00aa44"
  emissiveIntensity: 1.2
  glow: true
  position: { x: 0, y: 4.8, z: 0 }
  scale: { x: 2.9, y: 2.9, z: 0.08 }
  @animated { type: "spin", axis: "y", speed: -0.25 }
  @glowing { color: "#00cc55", intensity: 1.5, radius: 1.0 }
}


// ------------------------------------------------------------
// SPAWN PADS
// Team Alpha (blue) and Team Beta (orange). Each pad:
//   - @particle_system: upward readiness sparks
//   - @networked: synchronized spawn state across all clients
//   - @clickable: admin can reset/lock the pad
// ------------------------------------------------------------

object "spawn_pad_alpha" {
  geometry: "cylinder"
  color: "#0044cc"
  material: "neon"
  roughness: 0.2
  metallic: 0.6
  emissive: "#0022aa"
  emissiveIntensity: 0.8
  glow: true
  position: { x: -7, y: 0.12, z: 0 }
  scale: { x: 1.2, y: 0.08, z: 1.2 }
  @glowing { color: "#0066ff", intensity: 1.6, radius: 1.5 }
  @networked { channel: "arena.spawn", key: "alpha" }
  @clickable { action: "reset_spawn", label: "Reset Alpha Spawn" }
}

object "spawn_pad_alpha_particles" {
  type: "particles"
  count: 40
  color: "#3388ff"
  position: { x: -7, y: 0.25, z: 0 }
  spread: 1.0
  @particle_system {
    direction: "up"
    velocity: { min: 0.5, max: 1.8 }
    lifetime: { min: 0.4, max: 1.2 }
    size: { start: 0.06, end: 0.0 }
    emission_rate: 35
    loop: true
  }
}

object "spawn_pad_alpha_ring" {
  geometry: "torus"
  color: "#2255ff"
  material: "neon"
  emissive: "#1133cc"
  emissiveIntensity: 1.0
  glow: true
  position: { x: -7, y: 0.2, z: 0 }
  scale: { x: 1.3, y: 1.3, z: 0.06 }
  @animated { type: "pulse", speed: 1.8, amplitude: 0.12 }
}

object "spawn_pad_beta" {
  geometry: "cylinder"
  color: "#cc4400"
  material: "neon"
  roughness: 0.2
  metallic: 0.6
  emissive: "#aa2200"
  emissiveIntensity: 0.8
  glow: true
  position: { x: 7, y: 0.12, z: 0 }
  scale: { x: 1.2, y: 0.08, z: 1.2 }
  @glowing { color: "#ff6600", intensity: 1.6, radius: 1.5 }
  @networked { channel: "arena.spawn", key: "beta" }
  @clickable { action: "reset_spawn", label: "Reset Beta Spawn" }
}

object "spawn_pad_beta_particles" {
  type: "particles"
  count: 40
  color: "#ff8833"
  position: { x: 7, y: 0.25, z: 0 }
  spread: 1.0
  @particle_system {
    direction: "up"
    velocity: { min: 0.5, max: 1.8 }
    lifetime: { min: 0.4, max: 1.2 }
    size: { start: 0.06, end: 0.0 }
    emission_rate: 35
    loop: true
  }
}

object "spawn_pad_beta_ring" {
  geometry: "torus"
  color: "#ff5500"
  material: "neon"
  emissive: "#cc3300"
  emissiveIntensity: 1.0
  glow: true
  position: { x: 7, y: 0.2, z: 0 }
  scale: { x: 1.3, y: 1.3, z: 0.06 }
  @animated { type: "pulse", speed: 1.6, amplitude: 0.12 }
}


// ------------------------------------------------------------
// LIGHTING
// Three lights: overhead overhead blue-white fill, magenta rim
// from the right barrier side, cyan rim from the left.
// ------------------------------------------------------------

light "overhead_fill" {
  type: "point"
  color: "#8080ff"
  intensity: 0.9
  position: { x: 0, y: 7, z: 0 }
  range: 18
  castShadow: true
}

light "barrier_cyan_light" {
  type: "point"
  color: "#00ffff"
  intensity: 1.1
  position: { x: -5, y: 2, z: 0 }
  range: 6
}

light "barrier_magenta_light" {
  type: "point"
  color: "#ff00ff"
  intensity: 1.1
  position: { x: 5, y: 2, z: 0 }
  range: 6
}

light "ring_glow_light" {
  type: "point"
  color: "#00ff88"
  intensity: 0.7
  position: { x: 0, y: 5, z: 0 }
  range: 5
}


// ------------------------------------------------------------
// SPATIAL AUDIO
// Arena ambiance: distant crowd hum + power-core drone.
// The barriers pulse their hum with @animated amplitude.
// ------------------------------------------------------------

object "arena_ambiance" {
  geometry: "sphere"
  color: "#00000000"
  position: { x: 0, y: 3, z: 0 }
  scale: { x: 0.01, y: 0.01, z: 0.01 }
  @spatial_audio {
    src: "audio/arena_crowd_hum.mp3"
    volume: 0.18
    loop: true
    refDistance: 10
    rolloffFactor: 0.5
    maxDistance: 40
  }
}

object "pillar_power_drone" {
  geometry: "sphere"
  color: "#00000000"
  position: { x: 0, y: 2, z: 0 }
  scale: { x: 0.01, y: 0.01, z: 0.01 }
  @spatial_audio {
    src: "synth_drone"
    volume: 0.12
    loop: true
    frequency: 60
    refDistance: 4
    rolloffFactor: 1.5
    maxDistance: 14
  }
}

object "barrier_cyan_hum" {
  geometry: "sphere"
  color: "#00000000"
  position: { x: -4.5, y: 1.5, z: 0 }
  scale: { x: 0.01, y: 0.01, z: 0.01 }
  @spatial_audio {
    src: "synth_buzz"
    volume: 0.08
    loop: true
    frequency: 120
    refDistance: 2
    rolloffFactor: 2.0
    maxDistance: 8
  }
}


// ------------------------------------------------------------
// AMBIENT ARENA PARTICLES
// Floating interference static across the whole arena.
// Gives the sense of high-energy containment field.
// ------------------------------------------------------------

object "arena_static" {
  type: "particles"
  count: 120
  color: "#6644ff"
  position: { x: 0, y: 2.5, z: 0 }
  spread: 9
  @particle_system {
    direction: "random"
    velocity: { min: 0.02, max: 0.12 }
    lifetime: { min: 1.5, max: 4.0 }
    size: { start: 0.03, end: 0.0 }
    emission_rate: 30
    loop: true
  }
}


// ------------------------------------------------------------
// POST-PROCESSING
// Heavy bloom on all emissive neon surfaces. Aggressive
// exposure to make the barriers look physically present.
// ------------------------------------------------------------

post_processing {
  bloom: {
    enabled: true
    intensity: 0.9
    threshold: 0.4
    radius: 0.8
    smoothing: 0.85
  }
  tone_mapping: {
    type: "aces"
    exposure: 1.3
  }
  vignette: {
    enabled: true
    intensity: 0.4
    smoothness: 0.6
  }
}
