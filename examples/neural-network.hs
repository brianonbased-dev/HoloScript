// Neural Network Visualization — 3D Interactive Deep Learning Model
// Demonstrates: @particle_system, @emissive, @hoverable, @spatial_audio,
// layered node architecture, animated data-flow connections, and activation pulsing.
//
// Network Architecture:
//   Input Layer (4 nodes)  →  Hidden Layer 1 (6 nodes)  →  Hidden Layer 2 (6 nodes)  →  Output Layer (3 nodes)
//   Blue (#0088ff)             Purple (#8844ff)              Purple (#aa44ff)              Green (#00cc66)
//
// Layout: Layers are spaced along the X axis. Nodes are spread along Y.
// Connections are thin cylinders rotated between node pairs.
// Active connections have @particle_system showing data flow direction.

// ============================================================================
// ENVIRONMENT — Dark space with subtle ground plane
// ============================================================================

environment {
  skybox: "void"
  ambient_light: 0.15
  fog_density: 0.01
  fog_color: "#050510"
}

// Ground plane — dark reflective surface
object "ground" {
  geometry: "cube"
  color: "#0a0a1a"
  metallic: 0.8
  roughness: 0.2
  position: { x: 0, y: -0.5, z: 0 }
  scale: { x: 20, y: 0.05, z: 12 }
}

// Ambient glow underneath the network
object "ambient_glow" {
  type: "particles"
  count: 30
  color: "#221144"
  position: { x: 0, y: -0.3, z: 0 }
  spread: 8
}

// Scene title
object "title_text" {
  text: "NEURAL NETWORK"
  color: "#6644cc"
  material: "hologram"
  glow: true
  emissiveIntensity: 0.6
  position: { x: 0, y: 5.5, z: 0 }
  scale: { x: 0.35, y: 0.35, z: 0.35 }
}

object "subtitle_text" {
  text: "4 - 6 - 6 - 3  Feedforward Architecture"
  color: "#443388"
  position: { x: 0, y: 4.9, z: 0 }
  scale: { x: 0.12, y: 0.12, z: 0.12 }
}

// ============================================================================
// INPUT LAYER — 4 nodes (blue), X = -6
// Represents raw feature inputs. Steady glow, moderate activation.
// ============================================================================

object "input_label" {
  text: "INPUT"
  color: "#0088ff"
  position: { x: -6, y: 4, z: 0 }
  scale: { x: 0.15, y: 0.15, z: 0.15 }
}

object "input_node_1" {
  geometry: "sphere"
  color: "#0088ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.7
  position: { x: -6, y: 3, z: 0 }
  scale: { x: 0.35, y: 0.35, z: 0.35 }
  animate: "pulse"
  animSpeed: 1.2
  animAmplitude: 0.05
  @hoverable: { label: "Input 1 — Feature: x_position", detail: "Activation: 0.82" }
  @emissive: { color: "#0088ff", intensity: 0.7, pulse: true, pulse_speed: 1.2 }
}

object "input_node_2" {
  geometry: "sphere"
  color: "#0088ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.5
  position: { x: -6, y: 1.8, z: 0 }
  scale: { x: 0.35, y: 0.35, z: 0.35 }
  animate: "pulse"
  animSpeed: 0.9
  animAmplitude: 0.05
  @hoverable: { label: "Input 2 — Feature: y_position", detail: "Activation: 0.45" }
  @emissive: { color: "#0088ff", intensity: 0.5, pulse: true, pulse_speed: 0.9 }
}

object "input_node_3" {
  geometry: "sphere"
  color: "#0088ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.9
  position: { x: -6, y: 0.6, z: 0 }
  scale: { x: 0.35, y: 0.35, z: 0.35 }
  animate: "pulse"
  animSpeed: 1.5
  animAmplitude: 0.05
  @hoverable: { label: "Input 3 — Feature: velocity", detail: "Activation: 0.91" }
  @emissive: { color: "#0088ff", intensity: 0.9, pulse: true, pulse_speed: 1.5 }
}

object "input_node_4" {
  geometry: "sphere"
  color: "#0088ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.3
  position: { x: -6, y: -0.6, z: 0 }
  scale: { x: 0.35, y: 0.35, z: 0.35 }
  animate: "pulse"
  animSpeed: 0.6
  animAmplitude: 0.05
  @hoverable: { label: "Input 4 — Feature: angle", detail: "Activation: 0.23" }
  @emissive: { color: "#0088ff", intensity: 0.3, pulse: true, pulse_speed: 0.6 }
}

// ============================================================================
// HIDDEN LAYER 1 — 6 nodes (purple), X = -2
// ReLU activations. Higher intensity = stronger activation.
// ============================================================================

object "hidden1_label" {
  text: "HIDDEN 1"
  color: "#8844ff"
  position: { x: -2, y: 4, z: 0 }
  scale: { x: 0.15, y: 0.15, z: 0.15 }
}

object "h1_node_1" {
  geometry: "sphere"
  color: "#8844ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.8
  position: { x: -2, y: 3.2, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 1.4
  animAmplitude: 0.04
  @hoverable: { label: "H1 Neuron 1 — ReLU", detail: "Activation: 0.78 | Bias: -0.12" }
  @emissive: { color: "#8844ff", intensity: 0.8, pulse: true, pulse_speed: 1.4 }
}

object "h1_node_2" {
  geometry: "sphere"
  color: "#8844ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.4
  position: { x: -2, y: 2.2, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 0.7
  animAmplitude: 0.04
  @hoverable: { label: "H1 Neuron 2 — ReLU", detail: "Activation: 0.34 | Bias: 0.05" }
  @emissive: { color: "#8844ff", intensity: 0.4, pulse: true, pulse_speed: 0.7 }
}

object "h1_node_3" {
  geometry: "sphere"
  color: "#8844ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.95
  position: { x: -2, y: 1.2, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 1.8
  animAmplitude: 0.04
  @hoverable: { label: "H1 Neuron 3 — ReLU", detail: "Activation: 0.95 | Bias: 0.22" }
  @emissive: { color: "#8844ff", intensity: 0.95, pulse: true, pulse_speed: 1.8 }
}

object "h1_node_4" {
  geometry: "sphere"
  color: "#8844ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.1
  position: { x: -2, y: 0.2, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 0.3
  animAmplitude: 0.04
  @hoverable: { label: "H1 Neuron 4 — ReLU (dead)", detail: "Activation: 0.02 | Bias: -0.88" }
  @emissive: { color: "#8844ff", intensity: 0.1, pulse: true, pulse_speed: 0.3 }
}

object "h1_node_5" {
  geometry: "sphere"
  color: "#8844ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.6
  position: { x: -2, y: -0.8, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 1.0
  animAmplitude: 0.04
  @hoverable: { label: "H1 Neuron 5 — ReLU", detail: "Activation: 0.56 | Bias: 0.14" }
  @emissive: { color: "#8844ff", intensity: 0.6, pulse: true, pulse_speed: 1.0 }
}

object "h1_node_6" {
  geometry: "sphere"
  color: "#8844ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.7
  position: { x: -2, y: -1.8, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 1.2
  animAmplitude: 0.04
  @hoverable: { label: "H1 Neuron 6 — ReLU", detail: "Activation: 0.67 | Bias: -0.03" }
  @emissive: { color: "#8844ff", intensity: 0.7, pulse: true, pulse_speed: 1.2 }
}

// ============================================================================
// HIDDEN LAYER 2 — 6 nodes (deeper purple), X = 2
// ============================================================================

object "hidden2_label" {
  text: "HIDDEN 2"
  color: "#aa44ff"
  position: { x: 2, y: 4, z: 0 }
  scale: { x: 0.15, y: 0.15, z: 0.15 }
}

object "h2_node_1" {
  geometry: "sphere"
  color: "#aa44ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.6
  position: { x: 2, y: 3.2, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 1.0
  animAmplitude: 0.04
  @hoverable: { label: "H2 Neuron 1 — ReLU", detail: "Activation: 0.61 | Bias: 0.08" }
  @emissive: { color: "#aa44ff", intensity: 0.6, pulse: true, pulse_speed: 1.0 }
}

object "h2_node_2" {
  geometry: "sphere"
  color: "#aa44ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.85
  position: { x: 2, y: 2.2, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 1.6
  animAmplitude: 0.04
  @hoverable: { label: "H2 Neuron 2 — ReLU", detail: "Activation: 0.87 | Bias: 0.31" }
  @emissive: { color: "#aa44ff", intensity: 0.85, pulse: true, pulse_speed: 1.6 }
}

object "h2_node_3" {
  geometry: "sphere"
  color: "#aa44ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.3
  position: { x: 2, y: 1.2, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 0.5
  animAmplitude: 0.04
  @hoverable: { label: "H2 Neuron 3 — ReLU", detail: "Activation: 0.19 | Bias: -0.45" }
  @emissive: { color: "#aa44ff", intensity: 0.3, pulse: true, pulse_speed: 0.5 }
}

object "h2_node_4" {
  geometry: "sphere"
  color: "#aa44ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.75
  position: { x: 2, y: 0.2, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 1.3
  animAmplitude: 0.04
  @hoverable: { label: "H2 Neuron 4 — ReLU", detail: "Activation: 0.73 | Bias: 0.17" }
  @emissive: { color: "#aa44ff", intensity: 0.75, pulse: true, pulse_speed: 1.3 }
}

object "h2_node_5" {
  geometry: "sphere"
  color: "#aa44ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.5
  position: { x: 2, y: -0.8, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 0.8
  animAmplitude: 0.04
  @hoverable: { label: "H2 Neuron 5 — ReLU", detail: "Activation: 0.44 | Bias: -0.11" }
  @emissive: { color: "#aa44ff", intensity: 0.5, pulse: true, pulse_speed: 0.8 }
}

object "h2_node_6" {
  geometry: "sphere"
  color: "#aa44ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.9
  position: { x: 2, y: -1.8, z: 0 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  animate: "pulse"
  animSpeed: 1.7
  animAmplitude: 0.04
  @hoverable: { label: "H2 Neuron 6 — ReLU", detail: "Activation: 0.92 | Bias: 0.44" }
  @emissive: { color: "#aa44ff", intensity: 0.9, pulse: true, pulse_speed: 1.7 }
}

// ============================================================================
// OUTPUT LAYER — 3 nodes (green), X = 6
// Softmax outputs representing classification probabilities.
// ============================================================================

object "output_label" {
  text: "OUTPUT"
  color: "#00cc66"
  position: { x: 6, y: 4, z: 0 }
  scale: { x: 0.15, y: 0.15, z: 0.15 }
}

object "output_node_1" {
  geometry: "sphere"
  color: "#00cc66"
  material: "neon"
  glow: true
  emissiveIntensity: 0.9
  position: { x: 6, y: 2.4, z: 0 }
  scale: { x: 0.4, y: 0.4, z: 0.4 }
  animate: "pulse"
  animSpeed: 1.6
  animAmplitude: 0.06
  @hoverable: { label: "Output 1 — Class: Move Left", detail: "Softmax: 0.72 (SELECTED)" }
  @emissive: { color: "#00ff77", intensity: 0.9, pulse: true, pulse_speed: 1.6 }
}

object "output_node_2" {
  geometry: "sphere"
  color: "#00cc66"
  material: "neon"
  glow: true
  emissiveIntensity: 0.2
  position: { x: 6, y: 1.0, z: 0 }
  scale: { x: 0.4, y: 0.4, z: 0.4 }
  animate: "pulse"
  animSpeed: 0.4
  animAmplitude: 0.06
  @hoverable: { label: "Output 2 — Class: Move Right", detail: "Softmax: 0.15" }
  @emissive: { color: "#00cc66", intensity: 0.2, pulse: true, pulse_speed: 0.4 }
}

object "output_node_3" {
  geometry: "sphere"
  color: "#00cc66"
  material: "neon"
  glow: true
  emissiveIntensity: 0.15
  position: { x: 6, y: -0.4, z: 0 }
  scale: { x: 0.4, y: 0.4, z: 0.4 }
  animate: "pulse"
  animSpeed: 0.3
  animAmplitude: 0.06
  @hoverable: { label: "Output 3 — Class: Stay", detail: "Softmax: 0.13" }
  @emissive: { color: "#00cc66", intensity: 0.15, pulse: true, pulse_speed: 0.3 }
}

// ============================================================================
// CONNECTIONS: INPUT → HIDDEN 1
// Glowing lines between layers. Brighter = stronger weight.
// Only the most significant connections shown to avoid visual clutter.
// Active connections carry @particle_system to show data flowing forward.
// ============================================================================

// Strong connection: input_1 → h1_1 (weight: 0.85)
object "conn_i1_h1_1" {
  geometry: "cylinder"
  color: "#4466ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.6
  position: { x: -4, y: 3.1, z: 0 }
  scale: { x: 0.015, y: 2.0, z: 0.015 }
  rotation: { x: 0, y: 0, z: 85 }
  @hoverable: { label: "Weight: 0.85", detail: "input_1 → h1_1" }
}

object "conn_i1_h1_1_particles" {
  type: "particles"
  count: 8
  color: "#4488ff"
  position: { x: -4, y: 3.1, z: 0 }
  spread: 0.1
  @particle_system: { flow_direction: "right", speed: 1.5, along: "conn_i1_h1_1" }
}

// Strong connection: input_3 → h1_3 (weight: 0.92)
object "conn_i3_h1_3" {
  geometry: "cylinder"
  color: "#5577ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.8
  position: { x: -4, y: 0.9, z: 0 }
  scale: { x: 0.018, y: 2.0, z: 0.018 }
  rotation: { x: 0, y: 0, z: 82 }
  @hoverable: { label: "Weight: 0.92", detail: "input_3 → h1_3" }
}

object "conn_i3_h1_3_particles" {
  type: "particles"
  count: 12
  color: "#5599ff"
  position: { x: -4, y: 0.9, z: 0 }
  spread: 0.1
  @particle_system: { flow_direction: "right", speed: 2.0, along: "conn_i3_h1_3" }
}

// Medium connections (dimmer, no particles)
object "conn_i1_h1_5" {
  geometry: "cylinder"
  color: "#334488"
  glow: true
  emissiveIntensity: 0.2
  position: { x: -4, y: 1.1, z: 0 }
  scale: { x: 0.01, y: 2.5, z: 0.01 }
  rotation: { x: 0, y: 0, z: 60 }
}

object "conn_i2_h1_2" {
  geometry: "cylinder"
  color: "#334488"
  glow: true
  emissiveIntensity: 0.25
  position: { x: -4, y: 2.0, z: 0 }
  scale: { x: 0.01, y: 2.1, z: 0.01 }
  rotation: { x: 0, y: 0, z: 88 }
}

object "conn_i4_h1_6" {
  geometry: "cylinder"
  color: "#334488"
  glow: true
  emissiveIntensity: 0.3
  position: { x: -4, y: -1.2, z: 0 }
  scale: { x: 0.012, y: 2.2, z: 0.012 }
  rotation: { x: 0, y: 0, z: 75 }
}

// Weak connections (very dim — near-zero weights)
object "conn_i2_h1_4" {
  geometry: "cylinder"
  color: "#1a1a33"
  emissiveIntensity: 0.05
  position: { x: -4, y: 1.0, z: 0 }
  scale: { x: 0.006, y: 2.3, z: 0.006 }
  rotation: { x: 0, y: 0, z: 70 }
}

// ============================================================================
// CONNECTIONS: HIDDEN 1 → HIDDEN 2
// Internal representations — purple-tinted connections
// ============================================================================

// Strong: h1_3 → h2_2 (weight: 0.88)
object "conn_h1_3_h2_2" {
  geometry: "cylinder"
  color: "#9955ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.7
  position: { x: 0, y: 1.7, z: 0 }
  scale: { x: 0.016, y: 2.0, z: 0.016 }
  rotation: { x: 0, y: 0, z: 76 }
  @hoverable: { label: "Weight: 0.88", detail: "h1_3 → h2_2" }
}

object "conn_h1_3_h2_2_particles" {
  type: "particles"
  count: 10
  color: "#aa66ff"
  position: { x: 0, y: 1.7, z: 0 }
  spread: 0.1
  @particle_system: { flow_direction: "right", speed: 1.8, along: "conn_h1_3_h2_2" }
}

// Strong: h1_1 → h2_4 (weight: 0.79)
object "conn_h1_1_h2_4" {
  geometry: "cylinder"
  color: "#8844ee"
  material: "neon"
  glow: true
  emissiveIntensity: 0.55
  position: { x: 0, y: 1.7, z: 0 }
  scale: { x: 0.014, y: 2.8, z: 0.014 }
  rotation: { x: 0, y: 0, z: 50 }
  @hoverable: { label: "Weight: 0.79", detail: "h1_1 → h2_4" }
}

// Strong: h1_6 → h2_6 (weight: 0.91)
object "conn_h1_6_h2_6" {
  geometry: "cylinder"
  color: "#9955ff"
  material: "neon"
  glow: true
  emissiveIntensity: 0.75
  position: { x: 0, y: -1.8, z: 0 }
  scale: { x: 0.017, y: 2.0, z: 0.017 }
  rotation: { x: 0, y: 0, z: 88 }
  @hoverable: { label: "Weight: 0.91", detail: "h1_6 → h2_6" }
}

object "conn_h1_6_h2_6_particles" {
  type: "particles"
  count: 10
  color: "#bb77ff"
  position: { x: 0, y: -1.8, z: 0 }
  spread: 0.1
  @particle_system: { flow_direction: "right", speed: 1.6, along: "conn_h1_6_h2_6" }
}

// Medium connections
object "conn_h1_2_h2_1" {
  geometry: "cylinder"
  color: "#553399"
  glow: true
  emissiveIntensity: 0.2
  position: { x: 0, y: 2.7, z: 0 }
  scale: { x: 0.01, y: 2.1, z: 0.01 }
  rotation: { x: 0, y: 0, z: 78 }
}

object "conn_h1_5_h2_3" {
  geometry: "cylinder"
  color: "#553399"
  glow: true
  emissiveIntensity: 0.25
  position: { x: 0, y: 0.2, z: 0 }
  scale: { x: 0.01, y: 2.5, z: 0.01 }
  rotation: { x: 0, y: 0, z: 65 }
}

// ============================================================================
// CONNECTIONS: HIDDEN 2 → OUTPUT
// Final decision weights — green-tinted
// ============================================================================

// Strong: h2_2 → output_1 (weight: 0.94 — drives the selected class)
object "conn_h2_2_out_1" {
  geometry: "cylinder"
  color: "#33cc88"
  material: "neon"
  glow: true
  emissiveIntensity: 0.85
  position: { x: 4, y: 2.3, z: 0 }
  scale: { x: 0.02, y: 2.0, z: 0.02 }
  rotation: { x: 0, y: 0, z: 85 }
  @hoverable: { label: "Weight: 0.94 (dominant)", detail: "h2_2 → output_1 (Move Left)" }
}

object "conn_h2_2_out_1_particles" {
  type: "particles"
  count: 15
  color: "#44ffaa"
  position: { x: 4, y: 2.3, z: 0 }
  spread: 0.1
  @particle_system: { flow_direction: "right", speed: 2.2, along: "conn_h2_2_out_1" }
}

// Strong: h2_6 → output_1 (weight: 0.81)
object "conn_h2_6_out_1" {
  geometry: "cylinder"
  color: "#33bb77"
  material: "neon"
  glow: true
  emissiveIntensity: 0.6
  position: { x: 4, y: 0.3, z: 0 }
  scale: { x: 0.015, y: 3.0, z: 0.015 }
  rotation: { x: 0, y: 0, z: 55 }
  @hoverable: { label: "Weight: 0.81", detail: "h2_6 → output_1" }
}

object "conn_h2_6_out_1_particles" {
  type: "particles"
  count: 8
  color: "#44dd99"
  position: { x: 4, y: 0.3, z: 0 }
  spread: 0.1
  @particle_system: { flow_direction: "right", speed: 1.4, along: "conn_h2_6_out_1" }
}

// Medium connections to output_2 and output_3
object "conn_h2_4_out_2" {
  geometry: "cylinder"
  color: "#226644"
  glow: true
  emissiveIntensity: 0.2
  position: { x: 4, y: 0.6, z: 0 }
  scale: { x: 0.01, y: 2.1, z: 0.01 }
  rotation: { x: 0, y: 0, z: 80 }
}

object "conn_h2_1_out_3" {
  geometry: "cylinder"
  color: "#226644"
  glow: true
  emissiveIntensity: 0.15
  position: { x: 4, y: 1.4, z: 0 }
  scale: { x: 0.008, y: 2.8, z: 0.008 }
  rotation: { x: 0, y: 0, z: 50 }
}

object "conn_h2_5_out_2" {
  geometry: "cylinder"
  color: "#226644"
  glow: true
  emissiveIntensity: 0.18
  position: { x: 4, y: 0.1, z: 0 }
  scale: { x: 0.009, y: 2.3, z: 0.009 }
  rotation: { x: 0, y: 0, z: 68 }
}

// ============================================================================
// SPATIAL AUDIO — Ambient hum proportional to network activity
// The network "hums" louder when more neurons are active.
// Individual layers contribute their own frequency band.
// ============================================================================

object "audio_network_hum" {
  geometry: "sphere"
  color: "#00000000"
  position: { x: 0, y: 1.5, z: 0 }
  scale: { x: 0.01, y: 0.01, z: 0.01 }
  @spatial_audio: {
    source: "synth_drone",
    frequency: 80,
    volume: 0.15,
    falloff: 12,
    modulation: {
      source: "network_activity",
      min_volume: 0.05,
      max_volume: 0.3,
      min_frequency: 60,
      max_frequency: 120
    }
  }
}

object "audio_input_layer" {
  geometry: "sphere"
  color: "#00000000"
  position: { x: -6, y: 1.5, z: 0 }
  scale: { x: 0.01, y: 0.01, z: 0.01 }
  @spatial_audio: {
    source: "synth_pad",
    frequency: 220,
    volume: 0.08,
    falloff: 5,
    note: "A3"
  }
}

object "audio_hidden_layers" {
  geometry: "sphere"
  color: "#00000000"
  position: { x: 0, y: 1.5, z: 0 }
  scale: { x: 0.01, y: 0.01, z: 0.01 }
  @spatial_audio: {
    source: "synth_pad",
    frequency: 330,
    volume: 0.1,
    falloff: 6,
    note: "E4"
  }
}

object "audio_output_layer" {
  geometry: "sphere"
  color: "#00000000"
  position: { x: 6, y: 1.5, z: 0 }
  scale: { x: 0.01, y: 0.01, z: 0.01 }
  @spatial_audio: {
    source: "synth_bell",
    frequency: 440,
    volume: 0.12,
    falloff: 5,
    note: "A4",
    trigger: "output_activation"
  }
}

// ============================================================================
// DECORATIVE ELEMENTS — Framing the visualization
// ============================================================================

// Backplane — subtle dark grid behind the network
object "backplane" {
  geometry: "cube"
  color: "#0a0a18"
  material: "wireframe"
  position: { x: 0, y: 1.5, z: -2 }
  scale: { x: 16, y: 7, z: 0.02 }
}

// Base platform glow strips
object "glow_strip_left" {
  geometry: "cube"
  color: "#0044aa"
  material: "neon"
  glow: true
  emissiveIntensity: 0.4
  position: { x: -6, y: -0.4, z: 0 }
  scale: { x: 0.8, y: 0.05, z: 6 }
}

object "glow_strip_mid_1" {
  geometry: "cube"
  color: "#6622aa"
  material: "neon"
  glow: true
  emissiveIntensity: 0.3
  position: { x: -2, y: -0.4, z: 0 }
  scale: { x: 0.8, y: 0.05, z: 7 }
}

object "glow_strip_mid_2" {
  geometry: "cube"
  color: "#8833bb"
  material: "neon"
  glow: true
  emissiveIntensity: 0.3
  position: { x: 2, y: -0.4, z: 0 }
  scale: { x: 0.8, y: 0.05, z: 7 }
}

object "glow_strip_right" {
  geometry: "cube"
  color: "#008844"
  material: "neon"
  glow: true
  emissiveIntensity: 0.4
  position: { x: 6, y: -0.4, z: 0 }
  scale: { x: 0.8, y: 0.05, z: 5 }
}

// Floating data sparkles around the network
object "data_sparkles" {
  type: "particles"
  count: 50
  color: "#8866ff"
  position: { x: 0, y: 2, z: 0 }
  spread: 7
}

// Loss value display — shows current training loss
object "loss_display" {
  text: "Loss: 0.0342"
  color: "#ff6644"
  position: { x: 0, y: -1.5, z: 0 }
  scale: { x: 0.12, y: 0.12, z: 0.12 }
  @hoverable: { label: "Cross-Entropy Loss", detail: "Epoch 847 / LR: 0.001 / Batch: 32" }
}

// Accuracy display
object "accuracy_display" {
  text: "Accuracy: 97.2%"
  color: "#44ff88"
  position: { x: 0, y: -2.0, z: 0 }
  scale: { x: 0.12, y: 0.12, z: 0.12 }
  @hoverable: { label: "Validation Accuracy", detail: "Test set: 1,024 samples | 997 correct" }
}
