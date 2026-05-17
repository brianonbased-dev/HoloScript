// ============================================================================
// Quantum Radar — Entanglement-Enhanced Detection Station
// A-009 refresh — 2026-05-17
//
// Original: bare geometry scaffold with no traits, flat property syntax.
// Refresh: same detection-visualization concept, proper composition,
// visual story, and a richer trait set.
//
// Traits exercised:
//   @emissive      — radar rings pulse with detected echo intensity
//   @animated      — scan rings rotate and pulse on acquisition
//   @spatial_audio — 3D ping tone localised at each detected contact
//   @glowing       — target blips glow with contact classification colour
//   @clickable     — clicking a blip surfaces the IFF panel
//   @billboard     — IFF labels always face the observer
//   @networked     — multiple operators share the same live picture
//
// Scene story:
//   A research vessel, 03:00 ship time. The quantum radar (QR) uses
//   entangled photon pairs — one transmitted, one held at the crystal
//   array. Decoherence of the returned partner detects stealth targets
//   invisible to classical radar. Three rings sweep 1 km, 3 km, 7 km.
//   Red blip: surface vessel ALPHA at 3 km NE. Cyan blip: unknown wake
//   anomaly BRAVO at 5 km SSW. A dim torus marks the 7 km horizon.
//   Click any blip for bearing, speed, and classification confidence.
// ============================================================================

environment {
  skybox: "night_ocean"
  background_color: "#00020a"
  ambient_light: 0.08
  ambient_color: "#050a18"
  fog: { enabled: true, color: "#010309", density: 0.008, near: 40, far: 200 }
}

// ── Radar Mast ───────────────────────────────────────────────────────────────

object "radar_base" {
  geometry: "cylinder"
  material: { baseColor: "#1e2a38", roughness: 0.55, metallic: 0.8 }
  position: { x: 0, y: 0.5, z: 0 }
  scale: { x: 1.2, y: 1.0, z: 1.2 }

  @collidable { layer: "structure" }
}

object "radar_mast" {
  geometry: "cylinder"
  material: { baseColor: "#26354a", roughness: 0.45, metallic: 0.85 }
  position: { x: 0, y: 2.5, z: 0 }
  scale: { x: 0.15, y: 4.0, z: 0.15 }
}

object "radar_dish" {
  geometry: "sphere"
  material: { baseColor: "#3a4e6a", roughness: 0.3, metallic: 0.7 }
  position: { x: 0, y: 5.2, z: 0 }
  scale: { x: 1.6, y: 0.4, z: 1.6 }

  @animated { type: "rotate", axis: "y", speed: 6.0, loop: true }
  @emissive { intensity: 0.3, color: "#003366" }
}

// Entanglement crystal array
object "qr_crystal_array" {
  geometry: "cube"
  material: { baseColor: "#8adcff", roughness: 0.05, metallic: 0.0 }
  position: { x: 0, y: 5.0, z: 0 }
  scale: { x: 0.25, y: 0.25, z: 0.25 }
  emissive: "#22aaff"
  emissiveIntensity: 2.2

  @glowing { color: "#22aaff", radius: 0.8, falloff: 2.0 }
  @animated { type: "pulse", frequency: 4.0, amplitude: 0.12, loop: true }
}

// ── Scan Rings ────────────────────────────────────────────────────────────────

object "scan_ring_1km" {
  geometry: "torus"
  material: { baseColor: "#00ff88", roughness: 0.1, metallic: 0.0 }
  position: { x: 0, y: 0.2, z: 0 }
  scale: { x: 3.0, y: 3.0, z: 0.04 }
  emissive: "#00ff88"
  emissiveIntensity: 1.6

  @emissive { intensity: 1.6, color: "#00ff88" }
  @animated { type: "pulse", frequency: 0.42, amplitude: 0.3, loop: true }
  @networked { channel: "qr_sweep_1" }
}

object "scan_ring_3km" {
  geometry: "torus"
  material: { baseColor: "#00ffff", roughness: 0.1, metallic: 0.0 }
  position: { x: 0, y: 0.2, z: 0 }
  scale: { x: 6.0, y: 6.0, z: 0.04 }
  emissive: "#00ffff"
  emissiveIntensity: 1.2

  @emissive { intensity: 1.2, color: "#00ccff" }
  @animated { type: "pulse", frequency: 0.31, amplitude: 0.25, loop: true }
  @networked { channel: "qr_sweep_3" }
}

object "scan_ring_7km" {
  geometry: "torus"
  material: { baseColor: "#0055ff", roughness: 0.1, metallic: 0.0 }
  position: { x: 0, y: 0.2, z: 0 }
  scale: { x: 9.5, y: 9.5, z: 0.04 }
  emissive: "#0044cc"
  emissiveIntensity: 0.7

  @emissive { intensity: 0.7, color: "#0044cc" }
  @networked { channel: "qr_sweep_7" }
}

// ── Detected Contacts ─────────────────────────────────────────────────────────

object "contact_alpha" {
  geometry: "sphere"
  material: { baseColor: "#ff4422", roughness: 0.1, metallic: 0.0 }
  position: { x: 4.2, y: 0.4, z: -2.1 }
  scale: { x: 0.28, y: 0.28, z: 0.28 }
  emissive: "#ff2200"
  emissiveIntensity: 3.0

  @glowing { color: "#ff2200", radius: 0.6, falloff: 2.5 }
  @animated { type: "pulse", frequency: 1.2, amplitude: 0.08, loop: true }
  @clickable { cursor: "crosshair" }
  @spatial_audio { clip: "audio/radar_ping_contact.wav", loop: true, interval: 1.8, max_distance: 60.0, volume: 0.7 }
  @networked { channel: "qr_contacts", id: "alpha" }
}

object "iff_alpha" {
  geometry: "plane"
  material: { baseColor: "#00ff88", roughness: 0.0, metallic: 0.0 }
  position: { x: 4.2, y: 1.2, z: -2.1 }
  scale: { x: 1.8, y: 0.6, z: 1.0 }
  text: "VESSEL-A  BRG 042  SPD 12kn  CONF 94%"

  @billboard { axis: "y" }
  @glowing { color: "#00ff88", radius: 0.3 }
}

object "contact_bravo" {
  geometry: "sphere"
  material: { baseColor: "#00ccff", roughness: 0.1, metallic: 0.0 }
  position: { x: -3.5, y: 0.4, z: 3.8 }
  scale: { x: 0.22, y: 0.22, z: 0.22 }
  emissive: "#0099cc"
  emissiveIntensity: 2.4

  @glowing { color: "#0099ee", radius: 0.5, falloff: 3.0 }
  @animated { type: "pulse", frequency: 0.8, amplitude: 0.06, loop: true }
  @clickable { cursor: "crosshair" }
  @spatial_audio { clip: "audio/radar_ping_unknown.wav", loop: true, interval: 2.4, max_distance: 60.0, volume: 0.5 }
  @networked { channel: "qr_contacts", id: "bravo" }
}

object "iff_bravo" {
  geometry: "plane"
  material: { baseColor: "#ffaa00", roughness: 0.0, metallic: 0.0 }
  position: { x: -3.5, y: 1.1, z: 3.8 }
  scale: { x: 1.8, y: 0.6, z: 1.0 }
  text: "UNKNOWN   BRG 227  SPD 04kn  CONF 61%"

  @billboard { axis: "y" }
  @glowing { color: "#ffaa00", radius: 0.25 }
}

// Detection horizon arc — dim boundary ring at 7 km
object "detection_horizon" {
  geometry: "torus"
  material: { baseColor: "#223344", roughness: 0.2, metallic: 0.0 }
  position: { x: 0, y: 0.05, z: 0 }
  scale: { x: 9.6, y: 9.6, z: 0.015 }
  emissive: "#112233"
  emissiveIntensity: 0.4
}

// Mast status light
object "mast_light" {
  type: "point_light"
  position: { x: 0, y: 5.5, z: 0 }
  color: "#1155aa"
  intensity: 0.6
  distance: 12
}
