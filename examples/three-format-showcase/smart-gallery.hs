// Cross-Format Comparison: Smart Gallery (.hs format)
// Same functionality in three formats: .hs, .hsplus, .holo
// This is the BASIC (.hs) version — flat scene description, no templates or state

// === SCENE: Smart Gallery ===
// Features: Paintings on walls, interactive sculptures, ambient lighting, visitor counter

// Environment
environment {
  backgroundColor: "#1a1a2e"
  ambient: 0.4
  shadows: true
}

// Gallery Floor
object "Floor" {
  geometry: "plane"
  color: "#2a2a3a"
  width: 15
  height: 10
  position: { x: 0, y: 0, z: 0 }
}

// -- Walls ---

object "WallNorth" {
  geometry: "box"
  color: "#e8e0d8"
  scale: [15, 4, 0.2]
  position: { x: 0, y: 2, z: -5 }
}

object "WallSouth" {
  geometry: "box"
  color: "#e8e0d8"
  scale: [15, 4, 0.2]
  position: { x: 0, y: 2, z: 5 }
}

object "WallEast" {
  geometry: "box"
  color: "#e8e0d8"
  scale: [0.2, 4, 10]
  position: { x: 7.5, y: 2, z: 0 }
}

object "WallWest" {
  geometry: "box"
  color: "#e8e0d8"
  scale: [0.2, 4, 10]
  position: { x: -7.5, y: 2, z: 0 }
}

// -- Paintings ---

object "Painting_Sunset" {
  geometry: "plane"
  color: "#ff6633"
  scale: [1.5, 1.0, 1]
  position: { x: -3, y: 2.2, z: -4.85 }
}

object "Painting_Ocean" {
  geometry: "plane"
  color: "#2266aa"
  scale: [1.5, 1.0, 1]
  position: { x: 0, y: 2.2, z: -4.85 }
}

object "Painting_Forest" {
  geometry: "plane"
  color: "#228844"
  scale: [1.5, 1.0, 1]
  position: { x: 3, y: 2.2, z: -4.85 }
}

object "Painting_Abstract" {
  geometry: "plane"
  color: "#aa22ff"
  scale: [1.2, 1.6, 1]
  position: { x: -7.35, y: 2.2, z: -1 }
  rotation: { x: 0, y: 90, z: 0 }
}

// -- Sculptures ---

object "Sculpture_Sphere" {
  geometry: "sphere"
  color: "#ccaa44"
  radius: 0.4
  position: { x: -2, y: 1.0, z: 0 }
  metalness: 0.9
  roughness: 0.1
  physics: true
  mass: 5.0
}

object "Sculpture_Cube" {
  geometry: "box"
  color: "#44aacc"
  scale: [0.5, 0.5, 0.5]
  position: { x: 0, y: 1.0, z: 1 }
  metalness: 0.7
  roughness: 0.3
  physics: true
  mass: 3.0
}

object "Sculpture_Torus" {
  geometry: "torus"
  color: "#cc4488"
  scale: [0.4, 0.4, 0.15]
  position: { x: 2, y: 1.2, z: 0 }
  metalness: 0.8
  roughness: 0.2
}

// -- Ambient Lights ---

object "SpotLight_1" {
  geometry: "sphere"
  radius: 0.05
  color: "#ffffee"
  emissive: "#ffffee"
  emissiveIntensity: 2.0
  position: { x: -3, y: 3.8, z: -4 }
}

object "SpotLight_2" {
  geometry: "sphere"
  radius: 0.05
  color: "#ffffee"
  emissive: "#ffffee"
  emissiveIntensity: 2.0
  position: { x: 0, y: 3.8, z: -4 }
}

object "SpotLight_3" {
  geometry: "sphere"
  radius: 0.05
  color: "#ffffee"
  emissive: "#ffffee"
  emissiveIntensity: 2.0
  position: { x: 3, y: 3.8, z: -4 }
}

// -- Visitor Counter ---

object "VisitorCounter" {
  geometry: "plane"
  color: "#111111"
  scale: [0.3, 0.12, 1]
  position: { x: 6, y: 1.5, z: -4.85 }
}

// -- Background Music ---

object "AmbientMusic" {
  geometry: "sphere"
  radius: 0.01
  position: { x: 0, y: 3, z: 0 }
  visible: false
}
