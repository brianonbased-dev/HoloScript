// Quantum Arena
// Sci-fi battle environment

environment {
  skybox: "nebula"
  ambient_light: 0.3
}

object "arena_floor" {
  geometry: "cylinder"
  color: "#1a1a2e"
  position: { x: 0, y: 0, z: 0 }
  scale: { x: 10, y: 0.2, z: 10 }
}

object "barrier_1" {
  geometry: "cube"
  color: "#00ffff"
  position: { x: -4, y: 1, z: 0 }
  scale: { x: 0.2, y: 2, z: 3 }
}

object "barrier_2" {
  geometry: "cube"
  color: "#ff00ff"
  position: { x: 4, y: 1, z: 0 }
  scale: { x: 0.2, y: 2, z: 3 }
}

object "central_pillar" {
  geometry: "cylinder"
  color: "#4a4a6a"
  position: { x: 0, y: 2, z: 0 }
  scale: { x: 1, y: 4, z: 1 }
}

object "energy_ring" {
  geometry: "torus"
  color: "#00ff88"
  position: { x: 0, y: 4, z: 0 }
  scale: { x: 2, y: 2, z: 0.2 }
}

object "spawn_pad_a" {
  geometry: "cylinder"
  color: "#0066ff"
  position: { x: -6, y: 0.1, z: 0 }
  scale: { x: 1, y: 0.1, z: 1 }
}

object "spawn_pad_b" {
  geometry: "cylinder"
  color: "#ff6600"
  position: { x: 6, y: 0.1, z: 0 }
  scale: { x: 1, y: 0.1, z: 1 }
}
