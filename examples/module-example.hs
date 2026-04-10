// Module Example
// Demonstrates modular composition

environment {
  skybox: "sunset"
  ambient_light: 0.5
}

object "main_module" {
  geometry: "cube"
  color: "#4a4a6a"
  position: { x: 0, y: 1, z: 0 }
  scale: { x: 1, y: 1, z: 1 }
}

object "sub_module_a" {
  geometry: "sphere"
  color: "#ff6b6b"
  position: { x: -2, y: 1, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }
}

object "sub_module_b" {
  geometry: "sphere"
  color: "#4ecdc4"
  position: { x: 2, y: 1, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }
}

object "connector_ab" {
  geometry: "cylinder"
  color: "#888888"
  position: { x: 0, y: 1, z: 0 }
  scale: { x: 0.05, y: 4, z: 0.05 }
}
