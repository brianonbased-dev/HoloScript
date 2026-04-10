// Cross-Format Comparison: Simple Scene (.hs format)
// Same functionality in three formats: .hs, .hsplus, .holo
// This is the BASIC (.hs) version

// === SCENE: Interactive VR Room ===
// Features: 3 grabbable objects, floor, lighting

// Environment
environment {
  backgroundColor: "#1a1a2e"
  ambient: 0.6
  shadows: true
}

// Floor
object "Floor" {
  geometry: "plane"
  color: "#2a2a3a"
  width: 20
  height: 20
  position: { x: 0, y: 0, z: 0 }
}

// Red grabbable ball
object "RedBall" {
  geometry: "sphere"
  color: "#ff4444"
  radius: 0.3
  position: { x: -1, y: 1, z: -2 }
  physics: true
  mass: 1.0
}

// Green grabbable ball
object "GreenBall" {
  geometry: "sphere"
  color: "#44ff44"
  radius: 0.3
  position: { x: 0, y: 1, z: -2 }
  physics: true
  mass: 1.0
}

// Blue grabbable ball
object "BlueBall" {
  geometry: "sphere"
  color: "#4444ff"
  radius: 0.3
  position: { x: 1, y: 1, z: -2 }
  physics: true
  mass: 1.0
}

// Point light
object "Light" {
  type: "light"
  lightType: "point"
  color: "#ffffff"
  intensity: 1.0
  position: { x: 0, y: 3, z: 0 }
}

// === LIMITATIONS OF .hs FORMAT ===
// - No VR interaction (grabbable requires .hsplus @decorators)
// - No templates/reusability (must duplicate ball code 3 times)
// - No state management
// - No event handlers
// - Physics simulation is basic
// - Good for: Static scenes, prototyping, learning basics
