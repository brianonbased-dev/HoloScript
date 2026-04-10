// Quantum Radar
// Scanning and detection visualization

environment {
  skybox: "night"
  ambient_light: 0.3
}

object "radar_base" {
  geometry: "cylinder"
  color: "#2a2a4a"
  position: { x: 0, y: 0.5, z: 0 }
  scale: { x: 2, y: 1, z: 2 }
}

object "radar_dish" {
  geometry: "sphere"
  color: "#4a4a6a"
  position: { x: 0, y: 1.5, z: 0 }
  scale: { x: 1.5, y: 0.5, z: 1.5 }
}

object "scan_ring_1" {
  geometry: "torus"
  color: "#00ff88"
  position: { x: 0, y: 0.1, z: 0 }
  scale: { x: 3, y: 3, z: 0.05 }
}

object "scan_ring_2" {
  geometry: "torus"
  color: "#00ffff"
  position: { x: 0, y: 0.1, z: 0 }
  scale: { x: 5, y: 5, z: 0.05 }
}

object "scan_ring_3" {
  geometry: "torus"
  color: "#0088ff"
  position: { x: 0, y: 0.1, z: 0 }
  scale: { x: 7, y: 7, z: 0.05 }
}

object "target_blip" {
  geometry: "sphere"
  color: "#ff0000"
  position: { x: 3, y: 0.3, z: 2 }
  scale: { x: 0.2, y: 0.2, z: 0.2 }
}
