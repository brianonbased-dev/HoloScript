/**
 * Sensory Therapy Persistent Worlds — .hs Process
 * Sequential: profile → configure zones → run session → adapt → milestone check.
 * @version 5.0.0; @format .hs (process)
 */
environment { skybox: { type: "gradient", top: "#1a0533", bottom: "#4a1a6b" }; ambient_light: 0.3; shadows: true; fog: { color: "#2a1040", density: 0.006 } }

light "AuroraGlow" { type: "directional"; color: "#bbddff"; intensity: 0.5; position: { x: 3, y: 8, z: 5 }; cast_shadows: true }

post_processing { bloom: { enabled: true, intensity: 0.4, threshold: 0.6 }; tone_mapping: { type: "aces", exposure: 0.9 } }

object "profiler" {
  geometry: "cube"; color: "#aaccff"; position: { x: -6, y: 2, z: 0 }; scale: { x: 0.5, y: 0.5, z: 0.5 }
  state { profiles: 0 }
  function create(user_id, light_tol, sound_tol) {
    state.profiles += 1
    emit("profile_ready", { user_id: user_id, light: light_tol, sound: sound_tol })
  }
}

object "zone_configurator" {
  geometry: "octahedron"; color: "#ffddaa"; position: { x: -2, y: 2, z: 0 }; scale: { x: 0.5, y: 0.5, z: 0.5 }
  state { configs: 0 }
  function configure(profile) {
    state.configs += 1
    emit("zones_configured", { user_id: profile.user_id, light_level: profile.light * 0.7, sound_level: profile.sound * 0.6 })
  }
}

object "session_runner" {
  geometry: "sphere"; color: "#aaccff"; position: { x: 2, y: 2, z: 0 }; scale: { x: 0.5, y: 0.5, z: 0.5 }
  state { sessions: 0 }
  function run(config) {
    state.sessions += 1
    const comfort = 0.4 + Math.random() * 0.5
    emit("session_done", { user_id: config.user_id, comfort: comfort, duration: 15 + Math.floor(Math.random() * 15) })
  }
}

object "milestone_checker" {
  geometry: "torus"; color: "#2ecc71"; position: { x: 6, y: 2, z: 0 }; scale: { x: 0.5, y: 0.3, z: 0.5 }
  state { milestones: 0; avg_comfort: 0; count: 0 }
  function check(session) {
    state.count += 1
    state.avg_comfort = (state.avg_comfort * (state.count - 1) + session.comfort) / state.count
    if (session.comfort > 0.75) { state.milestones += 1; emit("milestone_reached", { user_id: session.user_id, level: state.milestones }) }
  }
}

connect profiler.profile_ready -> zone_configurator.configure
connect zone_configurator.zones_configured -> session_runner.run
connect session_runner.session_done -> milestone_checker.check
