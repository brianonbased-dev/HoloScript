/**
 * Sensory Sanctuary — Neurodiverse Adaptive Therapy (Refreshed)
 * A-009 Phase 2 refresh — 2026-05-03
 *
 * Original intent: assess → configure → run → adapt pipeline.
 * Refresh: same four-stage pipeline, now housed inside a spatial
 * "sanctuary" scene. Each pipeline stage is represented as a ritual
 * object in a calming environment. Three sensory-support traits are
 * added:
 *   @biofeedback     — monitors heart-rate + GSR for real-time comfort
 *                      sensing; adapts session pacing via threshold events
 *   @motion_reduced  — all animated objects respect vestibular limits;
 *                      smooth locomotion replaced with fade-crossfades
 *   @high_contrast   — toggleable high-contrast mode for visual clarity
 *
 * The pipeline wiring is unchanged: assess → configure → run → adapt.
 * The addition of @biofeedback closes a feedback gap in the original
 * design — the comfort estimate was random; now it is biometrics-driven.
 *
 * @version 6.0.0
 * @format .hs (process)
 */

// === SANCTUARY ENVIRONMENT ===

environment {
  skybox: { type: "gradient", top: "#0d1a2e", bottom: "#2a4a3e" }
  ambient_light: 0.25
  shadows: true
  fog: { color: "#c8d8e0", density: 0.001 }
}

light "SoftDawn" {
  type: "directional"
  color: "#d0e8d8"
  intensity: 0.45
  position: { x: 4, y: 8, z: 6 }
  cast_shadows: true
}

light "CalmAccent" {
  type: "point"
  color: "#a0c8ff"
  intensity: 0.3
  position: { x: 0, y: 4, z: -4 }
}

post_processing {
  bloom: { enabled: true, intensity: 0.28, threshold: 0.6 }
  tone_mapping: { type: "aces", exposure: 0.85 }
  vignette: { enabled: true, intensity: 0.2, smoothness: 0.5 }
}

// ------------------------------------------------------------------
// BIOFEEDBACK SENSOR
//
// Reads heart_rate and GSR from a wearable to track physiological
// comfort. Emits threshold events that the adapter uses instead of
// the random comfort estimate in the original.
//
// This is the first use of @biofeedback in the therapy pipeline.
// Tests: sources array, thresholds nested object, ranges map.
// ------------------------------------------------------------------

object "comfort_sensor" {
  geometry: "sphere"
  color: "#00bcd4"
  position: { x: 0, y: 1.2, z: -1 }
  scale: { x: 0.18, y: 0.18, z: 0.18 }

  @biofeedback {
    sources: ["heart_rate", "gsr"]
    sample_rate_hz: 4
    normalize: true
    emit_on_threshold: true
    thresholds: {
      heart_rate: { low: 55, high: 90 }
      gsr: { low: 1.0, high: 8.0 }
    }
    ranges: {
      heart_rate: { min: 40, max: 140 }
      gsr: { min: 0.1, max: 20.0 }
    }
  }

  state { comfort_index: 0.5 }

  function receive_biofeedback(reading) {
    const hr_norm = reading.heart_rate?.normalized ?? 0.5
    const gsr_norm = reading.gsr?.normalized ?? 0.5
    state.comfort_index = 1.0 - (hr_norm * 0.55 + gsr_norm * 0.45)
    emit("comfort_updated", { comfort: state.comfort_index, source: "biofeedback" })
  }
}

// ------------------------------------------------------------------
// WATER GARDEN — calming ambient center piece
//
// @motion_reduced ensures the ripple animation never exceeds
// max_velocity, protecting vestibular-sensitive users.
// ------------------------------------------------------------------

object "water_basin" {
  geometry: "cylinder"
  color: "#1a6e8a"
  position: { x: 0, y: 0.05, z: 0 }
  scale: { x: 1.4, y: 0.12, z: 1.4 }
  material: "reflective"
  roughness: 0.05
  metallic: 0.15

  @motion_reduced {
    disable_parallax: true
    reduce_animations: true
    static_ui: false
    max_velocity: 0.4
    disable_camera_shade: true
    teleport_instead_of_smooth: true
    fade_transitions: true
    auto_detect: true
  }

  animate: "ripple"
  animSpeed: 0.3
}

object "water_ripple_ring" {
  geometry: "torus"
  color: "#88ccdd"
  position: { x: 0, y: 0.18, z: 0 }
  scale: { x: 0.9, y: 0.02, z: 0.9 }

  @motion_reduced {
    disable_parallax: true
    reduce_animations: true
    static_ui: false
    max_velocity: 0.3
    disable_camera_shade: true
    teleport_instead_of_smooth: true
    fade_transitions: true
    auto_detect: true
  }

  animate: "scale_pulse"
  animSpeed: 0.2
}

// ------------------------------------------------------------------
// UI ACCESSIBILITY OVERLAY
//
// @high_contrast can be toggled by the therapy controller. When
// active it increases luminance contrast for all labelled UI elements,
// making stage labels readable for users with low vision.
// ------------------------------------------------------------------

object "accessibility_hud" {
  geometry: "plane"
  color: "#000000"
  position: { x: 0, y: 2.8, z: -2.5 }
  scale: { x: 2.2, y: 0.5, z: 0.02 }
  material: "flat"

  @high_contrast {
    enabled: false
    contrast_ratio: 7.0
    invert_background: false
    accent_color: "#ffdd00"
    text_scale_factor: 1.3
  }

  state { hc_on: false }
  function toggle_contrast() {
    state.hc_on = !state.hc_on
    emit("hc_toggled", { enabled: state.hc_on })
  }
}

// ------------------------------------------------------------------
// PIPELINE STAGE 1 — ASSESSOR
//
// Absorbs a user profile and emits an assessment bundle.
// Positioned at the sanctuary's north-west ritual stone.
// ------------------------------------------------------------------

object "assessor" {
  geometry: "octahedron"
  color: "#4fc3f7"
  position: { x: -4, y: 1.1, z: -3 }
  scale: { x: 0.45, y: 0.45, z: 0.45 }
  material: "shiny"
  emissive: "#1e88e5"
  emissiveIntensity: 0.4

  state { assessments: 0 }

  function assess(user_profile) {
    state.assessments += 1
    emit("assessment_done", {
      user_id: user_profile.id,
      light: user_profile.light || 0.5,
      sound: user_profile.sound || 0.5,
      session_num: state.assessments,
      sensitivity_profile: user_profile.sensitivity || "moderate"
    })
  }
}

object "label_assessor" {
  geometry: "plane"
  color: "#ffffff"
  position: { x: -4, y: 1.9, z: -3 }
  scale: { x: 1.0, y: 0.22, z: 0.02 }
  text: "1 · ASSESS"
  material: "flat"
}

// ------------------------------------------------------------------
// PIPELINE STAGE 2 — ENVIRONMENT CONFIGURATOR
//
// Maps the assessment to sanctuary light/sound levels.
// Positioned at the north-east ritual stone.
// ------------------------------------------------------------------

object "env_configurator" {
  geometry: "octahedron"
  color: "#ffb74d"
  position: { x: 4, y: 1.1, z: -3 }
  scale: { x: 0.45, y: 0.45, z: 0.45 }
  material: "shiny"
  emissive: "#ef6c00"
  emissiveIntensity: 0.4

  state { configs: 0 }

  function configure(assessment) {
    state.configs += 1
    const light_safe = assessment.light * 0.65
    const sound_safe = assessment.sound * 0.55
    emit("env_ready", {
      user_id: assessment.user_id,
      light_level: light_safe,
      sound_level: sound_safe,
      ambient: "calming_garden",
      high_contrast: assessment.sensitivity_profile === "high" ? true : false
    })
  }
}

object "label_configurator" {
  geometry: "plane"
  color: "#ffffff"
  position: { x: 4, y: 1.9, z: -3 }
  scale: { x: 1.0, y: 0.22, z: 0.02 }
  text: "2 · CONFIGURE"
  material: "flat"
}

// ------------------------------------------------------------------
// PIPELINE STAGE 3 — SESSION RUNNER
//
// Runs a therapy session with the configured environment.
// Comfort now comes from biofeedback rather than random().
// ------------------------------------------------------------------

object "session_runner" {
  geometry: "sphere"
  color: "#ab47bc"
  position: { x: -4, y: 1.1, z: 3 }
  scale: { x: 0.45, y: 0.45, z: 0.45 }
  material: "shiny"
  emissive: "#6a1b9a"
  emissiveIntensity: 0.4

  state { sessions: 0; active: false; live_comfort: 0.5 }

  function run(env_config) {
    state.active = true
    state.sessions += 1
    emit("session_started", { user_id: env_config.user_id, session: state.sessions })
  }

  function update_comfort(reading) {
    state.live_comfort = reading.comfort
  }

  function finish(user_id) {
    state.active = false
    emit("session_done", {
      user_id: user_id,
      comfort: state.live_comfort,
      duration_min: 15 + Math.floor(state.live_comfort * 20)
    })
  }
}

object "label_runner" {
  geometry: "plane"
  color: "#ffffff"
  position: { x: -4, y: 1.9, z: 3 }
  scale: { x: 1.0, y: 0.22, z: 0.02 }
  text: "3 · SESSION"
  material: "flat"
}

// ------------------------------------------------------------------
// PIPELINE STAGE 4 — ADAPTER
//
// Accumulates comfort readings and proposes next-session adjustments.
// ------------------------------------------------------------------

object "adapter" {
  geometry: "torus"
  color: "#66bb6a"
  position: { x: 4, y: 1.1, z: 3 }
  scale: { x: 0.45, y: 0.28, z: 0.45 }
  material: "shiny"
  emissive: "#2e7d32"
  emissiveIntensity: 0.35

  state { adaptations: 0; avg_comfort: 0 }

  function adapt(session) {
    state.adaptations += 1
    state.avg_comfort =
      (state.avg_comfort * (state.adaptations - 1) + session.comfort) / state.adaptations
    const suggest_light = state.avg_comfort < 0.45 ? "dim_further" : "hold"
    emit("adapted", {
      user_id: session.user_id,
      comfort: session.comfort,
      avg: state.avg_comfort,
      next_light: suggest_light
    })
  }
}

object "label_adapter" {
  geometry: "plane"
  color: "#ffffff"
  position: { x: 4, y: 1.9, z: 3 }
  scale: { x: 1.0, y: 0.22, z: 0.02 }
  text: "4 · ADAPT"
  material: "flat"
}

// ------------------------------------------------------------------
// PROGRESS STONE — floats above the water basin
// ------------------------------------------------------------------

object "progress_stone" {
  geometry: "cube"
  color: "#263238"
  position: { x: 0, y: 2.5, z: 0 }
  scale: { x: 3.5, y: 0.4, z: 0.08 }
  material: "flat"

  state { stage: "idle"; completed: 0 }
  function update(name) { state.stage = name; if (name === "adapted") state.completed += 1 }
}

// ------------------------------------------------------------------
// PIPELINE WIRING
// ------------------------------------------------------------------

connect assessor.assessment_done     -> env_configurator.configure
connect env_configurator.env_ready   -> session_runner.run
connect comfort_sensor.comfort_updated -> session_runner.update_comfort
connect session_runner.session_done  -> adapter.adapt

connect assessor.assessment_done     -> progress_stone.update("assessing")
connect env_configurator.env_ready   -> progress_stone.update("configuring")
connect session_runner.session_started -> progress_stone.update("running")
connect adapter.adapted              -> progress_stone.update("adapted")
