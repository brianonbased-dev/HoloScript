/**
 * Disaster Robotics Swarm Training — .hs Process
 * Sequential: generate rubble → deploy searchers → detect victims → extract → validate.
 * @version 5.0.0; @format .hs (process)
 */
environment { skybox: { type: "gradient", top: "#8e9eab", bottom: "#eef2f3" }; ambient_light: 0.35; shadows: true; physics: true; gravity: { x: 0, y: -9.81, z: 0 }; fog: { color: "#888888", density: 0.015 } }

light "DustySun" { type: "directional"; color: "#ffe8cc"; intensity: 0.7; position: { x: 5, y: 10, z: 5 }; cast_shadows: true }

post_processing { bloom: { enabled: true, intensity: 0.25, threshold: 0.7 }; tone_mapping: { type: "aces", exposure: 0.9 } }

object "rubble_generator" {
  geometry: "cube"; color: "#4a3728"; position: { x: -8, y: 2, z: 0 }; scale: { x: 0.5, y: 0.5, z: 0.5 }
  state { generated: 0; complexity: 0.3 }
  function generate() {
    state.generated += 1; state.complexity = Math.min(1.0, state.complexity + 0.05)
    emit("rubble_ready", { scenario_id: generate_uuid(), complexity: state.complexity, obstacles: Math.floor(state.complexity * 20) })
  }
}

object "search_deployer" {
  geometry: "octahedron"; color: "#ff3300"; position: { x: -4, y: 2, z: 0 }; scale: { x: 0.5, y: 0.5, z: 0.5 }
  state { deployed: 0; swarm_size: 4 }
  function deploy(scenario) {
    state.deployed += 1
    emit("swarm_deployed", { scenario_id: scenario.scenario_id, robots: state.swarm_size, complexity: scenario.complexity })
  }
}

object "victim_detector" {
  geometry: "sphere"; color: "#ff9800"; position: { x: 0, y: 2, z: 0 }; scale: { x: 0.5, y: 0.5, z: 0.5 }
  state { detected: 0 }
  function detect(deployment) {
    state.detected += 1
    const success = Math.random() > deployment.complexity * 0.4
    if (success) emit("victim_found", { scenario_id: deployment.scenario_id, location: { x: Math.random()*20, y: 0, z: Math.random()*20 } })
    else emit("search_failed", { scenario_id: deployment.scenario_id })
  }
}

object "extractor" {
  geometry: "torus"; color: "#2196f3"; position: { x: 4, y: 2, z: 0 }; scale: { x: 0.5, y: 0.3, z: 0.5 }
  state { extracted: 0 }
  function extract(detection) {
    state.extracted += 1
    emit("extraction_done", { scenario_id: detection.scenario_id, location: detection.location, success: Math.random() > 0.2 })
  }
}

object "result_validator" {
  geometry: "icosahedron"; color: "#4caf50"; position: { x: 8, y: 2, z: 0 }; scale: { x: 0.5, y: 0.5, z: 0.5 }
  state { validated: 0; success_rate: 0 }
  function validate(result) {
    state.validated += 1
    state.success_rate = (state.success_rate * (state.validated - 1) + (result.success ? 1 : 0)) / state.validated
    emit("validated", { scenario_id: result.scenario_id, success: result.success, overall_rate: state.success_rate })
  }
}

connect rubble_generator.rubble_ready -> search_deployer.deploy
connect search_deployer.swarm_deployed -> victim_detector.detect
connect victim_detector.victim_found -> extractor.extract
connect extractor.extraction_done -> result_validator.validate

execute rubble_generator.generate() every 15000ms
