// Login Form Example
// UI form elements with environment, lighting, PBR materials, and post-processing.

environment {
  skybox: "gradient"
  ambient_light: 0.6
}

// === GROUND PLANE ===
// A subtle floor to anchor the form in space.

object "ground" {
  geometry: "plane"
  color: "#1a1a2e"
  roughness: 0.9
  metallic: 0.1
  width: 12
  height: 12
  position: { x: 0, y: 0, z: 0 }
}

// === LIGHTING ===

object "key_light" {
  type: "directional_light"
  color: "#e8e0ff"
  intensity: 0.8
  position: { x: 3, y: 5, z: 2 }
}

object "fill_light" {
  type: "point_light"
  color: "#6644cc"
  intensity: 0.4
  position: { x: -2, y: 3, z: 1 }
}

// === FORM PANEL ===

object "form_background" {
  geometry: "cube"
  color: "#2d2d44"
  roughness: 0.6
  metallic: 0.2
  position: { x: 0, y: 1.5, z: -1 }
  scale: { x: 2, y: 2.5, z: 0.1 }
}

object "username_field" {
  geometry: "cube"
  color: "#ffffff"
  roughness: 0.4
  metallic: 0.0
  position: { x: 0, y: 2, z: -0.9 }
  scale: { x: 1.5, y: 0.3, z: 0.05 }
}

object "password_field" {
  geometry: "cube"
  color: "#ffffff"
  roughness: 0.4
  metallic: 0.0
  position: { x: 0, y: 1.5, z: -0.9 }
  scale: { x: 1.5, y: 0.3, z: 0.05 }
}

object "submit_button" {
  geometry: "cube"
  color: "#00aa55"
  roughness: 0.3
  metallic: 0.4
  emissive: "#005522"
  emissiveIntensity: 0.5
  position: { x: 0, y: 0.9, z: -0.9 }
  scale: { x: 1, y: 0.3, z: 0.05 }
}

// === POST-PROCESSING ===

post_processing {
  bloom: {
    enabled: true,
    intensity: 0.35,
    threshold: 0.8,
    radius: 0.5
  }
  tone_mapping: {
    type: "aces",
    exposure: 1.0
  }
}
