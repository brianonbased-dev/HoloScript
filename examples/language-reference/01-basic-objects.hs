// HoloScript Basic Syntax (.hs) - Object Declarations
// Complete reference for basic object syntax and properties
// For AI agents: Use this pattern for simple, non-interactive scenes

environment {
  skybox: "studio"
  ambient_light: 0.6
}

light "SunLight" {
  type: "directional"
  color: "#ffffff"
  intensity: 0.8
  rotation: { x: -45, y: 30, z: 0 }
  cast_shadows: true
}

post_processing {
  bloom: { enabled: true, intensity: 0.15, threshold: 0.85 }
  tone_mapping: { enabled: true, type: "aces" }
}

// === BASIC OBJECT DECLARATION ===
// Minimal object - just geometry
object "SimpleBox" {
  geometry: "box"
}

// Object with position
object "PositionedSphere" {
  geometry: "sphere"
  position: { x: 2, y: 1, z: 0 }
}

// Object with all transform properties
object "FullTransform" {
  geometry: "cylinder"
  position: { x: -2, y: 1, z: 0 }
  rotation: { x: 0, y: 45, z: 0 }
  scale: { x: 1, y: 2, z: 1 }
}

// === ALL BASIC GEOMETRIES ===
object "Box" { geometry: "box" }
object "Sphere" { geometry: "sphere" }
object "Cylinder" { geometry: "cylinder" }
object "Cone" { geometry: "cone" }
object "Plane" { geometry: "plane" }
object "Torus" { geometry: "torus" }
object "Capsule" { geometry: "capsule" }

// Custom geometries
object "Heart" { geometry: "heart" }
object "Star" { geometry: "star" }
object "Crystal" { geometry: "crystal" }
object "Gem" { geometry: "gem" }
object "Gear" { geometry: "gear" }
object "Lightning" { geometry: "lightning" }

// === COLOR PROPERTIES ===
// Named colors
object "RedCube" {
  geometry: "box"
  color: "red"
  position: { x: 0, y: 0, z: 0 }
}

// Hex colors
object "BlueSphere" {
  geometry: "sphere"
  color: "#0088ff"
  position: { x: 1, y: 0, z: 0 }
}

// Preset color names
object "ColorPresets" {
  geometry: "box"
  color: "neon"  // Other presets: "hologram", "energy", "ice", "fire", "forest", etc.
}

// === MATERIAL PROPERTIES ===
object "ShinyMetal" {
  geometry: "sphere"
  material: "metal"
  color: "silver"
}

object "GlassObject" {
  geometry: "box"
  material: "glass"
  color: "#88ccff"
}

// All material types
object "StandardMaterial" { material: "standard" }
object "MetalMaterial" { material: "metal" }
object "GlassMaterial" { material: "glass" }
object "PlasticMaterial" { material: "plastic" }
object "RubberMaterial" { material: "rubber" }
object "WoodMaterial" { material: "wood" }
object "FabricMaterial" { material: "fabric" }
object "HologramMaterial" { material: "hologram" }
object "NeonMaterial" { material: "neon" }

// === VISUAL EFFECTS ===
object "GlowingObject" {
  geometry: "sphere"
  color: "cyan"
  glow: true
}

object "EmissiveObject" {
  geometry: "box"
  color: "orange"
  emissive: true
  emissiveIntensity: 2.0
}

object "TransparentObject" {
  geometry: "sphere"
  color: "blue"
  opacity: 0.5
}

object "WireframeObject" {
  geometry: "box"
  wireframe: true
}

// === SIZE PROPERTIES ===
object "CustomSizedBox" {
  geometry: "box"
  width: 2.0
  height: 1.0
  depth: 3.0
}

object "CustomSizedSphere" {
  geometry: "sphere"
  radius: 1.5
}

object "CustomSizedCylinder" {
  geometry: "cylinder"
  radius: 0.5
  height: 3.0
}

// === ANIMATION PROPERTIES ===
object "SpinningCube" {
  geometry: "box"
  color: "purple"
  animate: "spin"
  animSpeed: 1.0
}

// All animation types
object "PulseAnimation" { animate: "pulse" }
object "FloatAnimation" { animate: "float" }
object "BounceAnimation" { animate: "bounce" }
object "SpinAnimation" { animate: "spin" }
object "FlickerAnimation" { animate: "flicker" }
object "GrowShrinkAnimation" { animate: "grow-shrink" }
object "OscillateAnimation" { animate: "oscillate" }

// Animation with custom speed
object "FastSpin" {
  geometry: "sphere"
  animate: "spin"
  animSpeed: 3.0  // 3x speed
}

object "SlowFloat" {
  geometry: "sphere"
  animate: "float"
  animSpeed: 0.5  // Half speed
}

// === PHYSICS PROPERTIES ===
object "PhysicsEnabled" {
  geometry: "box"
  physics: true
  mass: 10
}

object "HeavyObject" {
  geometry: "sphere"
  physics: true
  mass: 100
  friction: 0.8
  restitution: 0.3
}

// === VISIBILITY ===
object "HiddenObject" {
  geometry: "box"
  visible: false
}

object "ConditionallyVisible" {
  geometry: "sphere"
  visible: true
  opacity: 1.0
}

// === SHADOWS AND LIGHTING ===
object "CastsShadow" {
  geometry: "box"
  castShadow: true
  receiveShadow: true
}

object "NoShadow" {
  geometry: "sphere"
  castShadow: false
  receiveShadow: false
}

// === LAYERING ===
object "ForegroundObject" {
  geometry: "box"
  layer: 1
  renderOrder: 10
}

object "BackgroundObject" {
  geometry: "plane"
  layer: 0
  renderOrder: 1
}

// === GROUPING (PARENT-CHILD) ===
object "ParentGroup" {
  geometry: "box"
  position: { x: 0, y: 0, z: 0 }

  // Children automatically positioned relative to parent
  child "ChildObject1" {
    geometry: "sphere"
    position: { x: 1, y: 1, z: 0 }
  }

  child "ChildObject2" {
    geometry: "cylinder"
    position: { x: -1, y: 1, z: 0 }
  }
}

// === NAMES AND IDS ===
object "NamedObject" {
  id: "unique-id-123"
  geometry: "box"
  name: "My Special Box"
}

// === COMPLETE EXAMPLE ===
object "FullyConfiguredObject" {
  // Identity
  id: "demo-object-001"
  name: "Demonstration Object"

  // Geometry
  geometry: "box"
  width: 2.0
  height: 1.0
  depth: 1.0

  // Transform
  position: { x: 0, y: 2, z: -5 }
  rotation: { x: 0, y: 45, z: 0 }
  scale: { x: 1, y: 1, z: 1 }

  // Appearance
  color: "#ff6b6b"
  material: "metal"
  opacity: 1.0

  // Visual effects
  glow: true
  emissive: true
  emissiveIntensity: 1.5

  // Animation
  animate: "float"
  animSpeed: 1.0

  // Physics
  physics: true
  mass: 10
  friction: 0.5
  restitution: 0.7

  // Rendering
  castShadow: true
  receiveShadow: true
  visible: true
  wireframe: false
  layer: 1
  renderOrder: 5
}

// === NOTES FOR AI AGENTS ===
// 1. .hs format is for simple, declarative scenes
// 2. No interactivity, templates, or state management
// 3. Use object "Name" { property: value } syntax
// 4. Properties use camelCase
// 5. Position/rotation/scale use { x, y, z } objects
// 6. Colors can be named or hex (#RRGGBB)
// 7. Always quote object names
// 8. Boolean values: true/false (lowercase)
// 9. Numbers can be integers or floats
// 10. Common geometries: box, sphere, cylinder, cone, plane, torus
