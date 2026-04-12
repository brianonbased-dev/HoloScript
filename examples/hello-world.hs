// ============================================================
// Hello World — Your First HoloScript Scene
// ============================================================
// Welcome! This file shows you everything you need to build
// a 3D scene in HoloScript's .hs format. Each section below
// introduces a new concept. Read top-to-bottom, then tweak
// values and see what changes.
//
// Run this file:  holoscript preview hello-world.hs
// ============================================================


// ------------------------------------------------------------
// 1. ENVIRONMENT
//    Set the mood: skybox backdrop and global ambient light.
//    ambient_light ranges from 0.0 (pitch dark) to 1.0 (noon).
// ------------------------------------------------------------
environment {
  skybox: "sunset"
  ambient_light: 0.5
}


// ------------------------------------------------------------
// 2. GROUND PLANE
//    Every scene needs a floor. We use a thin, wide plane
//    so objects have something to rest on.
// ------------------------------------------------------------
object "ground" {
  geometry: "plane"
  color: "#3a5c3a"
  roughness: 0.9
  metallic: 0.0
  width: 20
  height: 20
  position: { x: 0, y: 0, z: 0 }
  receiveShadow: true
}


// ------------------------------------------------------------
// 3. LIGHTING
//    Three light types give depth to the scene:
//    - ambient: soft fill everywhere (set above in environment)
//    - directional: simulates the sun, casts shadows
//    - point: a local glow, like a lamp or torch
// ------------------------------------------------------------
object "sun_light" {
  type: "directional_light"
  color: "#fffbe6"
  intensity: 1.2
  position: { x: 5, y: 10, z: 5 }
  castShadow: true
}

object "warm_lamp" {
  type: "point_light"
  color: "#ffcc66"
  intensity: 0.8
  position: { x: -3, y: 3, z: 2 }
}


// ------------------------------------------------------------
// 4. BASIC SHAPES
//    HoloScript supports dozens of geometries. Here are five
//    common ones arranged in a row so you can compare them.
// ------------------------------------------------------------

// A simple cube — the "Hello World" of 3D
object "hello_cube" {
  geometry: "cube"
  color: "#00ccff"
  roughness: 0.5
  metallic: 0.1
  position: { x: -4, y: 0.5, z: -3 }
  castShadow: true
}

// A smooth sphere floating slightly above the ground
object "hello_sphere" {
  geometry: "sphere"
  color: "#ff6699"
  roughness: 0.3
  metallic: 0.2
  position: { x: -2, y: 1, z: -3 }
  castShadow: true
}

// A tall cylinder — think pillars or tree trunks
object "hello_cylinder" {
  geometry: "cylinder"
  color: "#66ff99"
  roughness: 0.7
  metallic: 0.0
  position: { x: 0, y: 0.75, z: -3 }
  scale: { x: 0.6, y: 1.5, z: 0.6 }
  castShadow: true
}

// A donut-shaped torus — great for rings and portals
object "hello_torus" {
  geometry: "torus"
  color: "#ffaa33"
  roughness: 0.4
  metallic: 0.6
  position: { x: 2, y: 1, z: -3 }
  castShadow: true
}

// A flat plane standing upright — useful for signs or walls
object "hello_wall" {
  geometry: "plane"
  color: "#cc88ff"
  roughness: 0.6
  metallic: 0.0
  width: 1.5
  height: 1.5
  position: { x: 4, y: 1, z: -3 }
  rotation: { x: 0, y: 0, z: 0 }
}


// ------------------------------------------------------------
// 5. MATERIALS — PBR (Physically Based Rendering)
//    Control how surfaces respond to light. Key properties:
//    - roughness: 0 = mirror, 1 = chalk
//    - metallic:  0 = plastic, 1 = chrome
//    - emissive:  object glows on its own
// ------------------------------------------------------------

// Polished chrome sphere — low roughness, full metallic
object "chrome_sphere" {
  geometry: "sphere"
  color: "#dddddd"
  material: "metal"
  metallic: 1.0
  roughness: 0.1
  position: { x: -3, y: 1, z: 0 }
  castShadow: true
}

// Matte clay cube — high roughness, zero metallic
object "clay_cube" {
  geometry: "cube"
  color: "#cc7744"
  material: "standard"
  roughness: 0.9
  metallic: 0.0
  position: { x: -1, y: 0.5, z: 0 }
  castShadow: true
}

// Glowing emissive torus — lights up a scene without a lamp
object "glow_torus" {
  geometry: "torus"
  color: "#00ffaa"
  roughness: 0.3
  metallic: 0.4
  emissive: "#007744"
  emissiveIntensity: 2.0
  glow: true
  position: { x: 1, y: 1, z: 0 }
}

// Glass-like transparent cylinder
object "glass_cylinder" {
  geometry: "cylinder"
  color: "#88ccff"
  material: "glass"
  opacity: 0.4
  position: { x: 3, y: 0.75, z: 0 }
}


// ------------------------------------------------------------
// 6. PHYSICS
//    Add physics: true and a mass to let objects fall, bounce,
//    and collide. The ground plane catches them.
//    - restitution: bounciness (0 = dead stop, 1 = superball)
//    - friction: surface grip
// ------------------------------------------------------------

// A heavy metal ball that will thud when it lands
object "heavy_ball" {
  geometry: "sphere"
  color: "#555555"
  material: "metal"
  metallic: 0.9
  roughness: 0.3
  position: { x: -1, y: 4, z: 3 }
  physics: true
  mass: 50
  friction: 0.7
  restitution: 0.2
  castShadow: true
}

// A light bouncy cube that hops around
object "bouncy_cube" {
  geometry: "cube"
  color: "#ff4488"
  roughness: 0.4
  metallic: 0.1
  position: { x: 1, y: 5, z: 3 }
  physics: true
  mass: 5
  friction: 0.3
  restitution: 0.85
  castShadow: true
}


// ------------------------------------------------------------
// 7. INTERACTION
//    Make objects respond to the user's cursor and clicks.
//    - onClick: fire a named action when clicked
//    - onHover: highlight or tooltip on mouse-over
// ------------------------------------------------------------

// Click this sphere to trigger "sayHello"
object "click_me" {
  geometry: "sphere"
  color: "#ffdd00"
  material: "plastic"
  roughness: 0.4
  position: { x: -2, y: 1, z: 6 }
  onClick: "sayHello"
  castShadow: true
}

// Hover over this cube to see it highlighted
object "hover_me" {
  geometry: "cube"
  color: "#44aaff"
  roughness: 0.5
  metallic: 0.2
  position: { x: 0, y: 0.5, z: 6 }
  onHover: "highlight"
  castShadow: true
}

// A torus you can both hover and click
object "interactive_ring" {
  geometry: "torus"
  color: "#ff8800"
  roughness: 0.3
  metallic: 0.5
  emissive: "#663300"
  emissiveIntensity: 0.6
  glow: true
  position: { x: 2, y: 1, z: 6 }
  onHover: "highlight"
  onClick: "activatePortal"
}


// ------------------------------------------------------------
// 8. ANIMATION
//    Add movement with animate: and control speed.
//    Types: "spin", "float", "pulse", "bounce", "orbit"
// ------------------------------------------------------------

// A slowly spinning crystal — draws the eye as a centerpiece
object "spinning_crystal" {
  geometry: "crystal"
  color: "hologram"
  material: "hologram"
  glow: true
  position: { x: 0, y: 2.5, z: -6 }
  scale: { x: 1.5, y: 1.5, z: 1.5 }
  animate: "spin"
  animSpeed: 0.3
  castShadow: true
}

// A gently bobbing sphere — like it's floating in water
object "floating_orb" {
  geometry: "sphere"
  color: "#aa66ff"
  roughness: 0.2
  metallic: 0.3
  emissive: "#553388"
  emissiveIntensity: 1.0
  glow: true
  position: { x: 3, y: 2, z: -6 }
  animate: "float"
  animSpeed: 0.6
  animAmplitude: 0.3
}

// A pulsing warning light
object "pulse_light" {
  geometry: "sphere"
  color: "#ff3333"
  roughness: 0.1
  metallic: 0.2
  emissive: "#881111"
  emissiveIntensity: 2.5
  glow: true
  position: { x: -3, y: 2, z: -6 }
  scale: { x: 0.4, y: 0.4, z: 0.4 }
  animate: "pulse"
  animSpeed: 1.5
}


// ------------------------------------------------------------
// 9. POST-PROCESSING
//    Screen-space effects applied after rendering. Bloom makes
//    emissive objects glow; tone mapping controls overall look.
// ------------------------------------------------------------

post_processing {
  bloom: {
    enabled: true,
    intensity: 0.4,
    threshold: 0.8,
    radius: 0.5
  }
  tone_mapping: {
    type: "aces",
    exposure: 1.1
  }
}


// ============================================================
// That's it! You've seen environments, lights, shapes,
// materials, physics, interaction, post-processing, and
// animation — all in one file. Edit any value above and
// re-run to experiment.
//
// Next steps:
//   - examples/advanced-features.hs   (60+ geometries, particles)
//   - examples/vr-scene.hs            (furniture & spatial layout)
//   - examples/language-reference/     (full syntax reference)
// ============================================================
