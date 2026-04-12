/**
 * IoT Sensor Pipeline — .hs Process Example
 *
 * Demonstrates HoloScript .hs as a DATA PIPELINE language, not just
 * scene description. Sensors stream readings through processing stages:
 * read → filter → aggregate → alert → visualize.
 *
 * This showcases why .hs matters: it captures sequential PROCESSES
 * with `function`, `execute`, and `connect` — concepts that don't
 * exist in declarative .holo or reactive .hsplus.
 *
 * Use case: Digital twin of a factory floor monitoring equipment health.
 *
 * @version 5.0.0
 * @format .hs (process)
 */

environment {
  skybox: "night_sky"
  ambient_light: 0.2
  fog: { color: "#0a0a1a", density: 0.012 }
}

light "MainLight" {
  type: "directional"
  color: "#4488ff"
  intensity: 0.5
  rotation: [-45, 30, 0]
  cast_shadows: true
}

light "AlertGlow" {
  type: "point"
  color: "#ff4444"
  intensity: 0.4
  position: { x: 0, y: 4, z: -6 }
  range: 10
}

post_processing {
  bloom: {
    enabled: true
    intensity: 0.45
    threshold: 0.65
  }
  tone_mapping: {
    enabled: true
    type: "aces"
  }
}

// ============================================================================
// SENSOR OBJECTS — physical devices streaming data
// ============================================================================

object "temp_sensor_A" {
  geometry: "cylinder"
  color: "#e74c3c"
  position: { x: -5, y: 2, z: 0 }
  scale: { x: 0.2, y: 0.4, z: 0.2 }

  state {
    reading: 0
    unit: "celsius"
    sample_rate: 1000     // ms between readings
    noise_floor: 0.1      // measurement noise
    min_range: -40
    max_range: 150
    location: "reactor_chamber_A"
  }

  function read() {
    // Simulate sensor reading with noise
    state.reading = sample_environment("temperature", position) + random(-state.noise_floor, state.noise_floor)
    emit("sensor_data", {
      sensor_id: "temp_sensor_A",
      type: "temperature",
      value: state.reading,
      unit: state.unit,
      timestamp: current_time(),
      location: state.location
    })
  }
}

object "pressure_sensor_B" {
  geometry: "cylinder"
  color: "#3498db"
  position: { x: 0, y: 2, z: -3 }
  scale: { x: 0.2, y: 0.4, z: 0.2 }

  state {
    reading: 0
    unit: "kPa"
    sample_rate: 500
    noise_floor: 0.05
    location: "main_pipe_junction"
  }

  function read() {
    state.reading = sample_environment("pressure", position) + random(-state.noise_floor, state.noise_floor)
    emit("sensor_data", {
      sensor_id: "pressure_sensor_B",
      type: "pressure",
      value: state.reading,
      unit: state.unit,
      timestamp: current_time(),
      location: state.location
    })
  }
}

object "vibration_sensor_C" {
  geometry: "cube"
  color: "#2ecc71"
  position: { x: 5, y: 1, z: 2 }
  scale: { x: 0.15, y: 0.15, z: 0.15 }

  state {
    reading: 0
    unit: "mm/s"
    sample_rate: 200      // high-frequency sampling
    noise_floor: 0.02
    location: "motor_housing_3"
  }

  function read() {
    state.reading = sample_environment("vibration", position) + random(-state.noise_floor, state.noise_floor)
    emit("sensor_data", {
      sensor_id: "vibration_sensor_C",
      type: "vibration",
      value: state.reading,
      unit: state.unit,
      timestamp: current_time(),
      location: state.location
    })
  }
}

// ============================================================================
// PIPELINE STAGE 1: FILTER — reject out-of-range and spike readings
// ============================================================================

object "noise_filter" {
  state {
    window_size: 5
    buffers: {}             // per-sensor rolling windows
    spike_threshold: 3.0    // standard deviations
    readings_filtered: 0
    readings_passed: 0
  }

  function process(data) {
    // Initialize buffer for new sensors
    if (!state.buffers[data.sensor_id]) {
      state.buffers[data.sensor_id] = []
    }

    const buffer = state.buffers[data.sensor_id]
    buffer.push(data.value)

    // Keep rolling window
    if (buffer.length > state.window_size) {
      buffer.shift()
    }

    // Spike detection via z-score
    const mean = average(buffer)
    const stddev = standard_deviation(buffer)

    if (stddev > 0 && abs(data.value - mean) > state.spike_threshold * stddev) {
      state.readings_filtered += 1
      return null  // discard spike
    }

    // Smooth the reading
    state.readings_passed += 1
    data.value_raw = data.value
    data.value = mean  // use rolling average
    emit("filtered_data", data)
    return data
  }
}

// ============================================================================
// PIPELINE STAGE 2: AGGREGATE — combine multi-sensor readings
// ============================================================================

object "aggregator" {
  state {
    latest: {}              // latest reading per sensor
    aggregate_interval: 5000 // ms
    last_aggregate: 0
  }

  function collect(data) {
    state.latest[data.sensor_id] = data

    // Every N seconds, emit an aggregate snapshot
    if (current_time() - state.last_aggregate > state.aggregate_interval) {
      state.last_aggregate = current_time()

      emit("aggregate_snapshot", {
        timestamp: current_time(),
        sensors: state.latest,
        health_score: compute_health_score(state.latest)
      })
    }
  }

  function compute_health_score(readings) {
    let score = 100
    for (const id in readings) {
      const r = readings[id]
      if (r.type == "temperature" && r.value > 85) score -= 20
      if (r.type == "pressure" && r.value > 500) score -= 30
      if (r.type == "vibration" && r.value > 10) score -= 25
    }
    return max(0, score)
  }
}

// ============================================================================
// PIPELINE STAGE 3: ALERT — threshold-based alerting
// ============================================================================

object "alert_manager" {
  state {
    thresholds: {
      temperature: { warning: 80, critical: 95 },
      pressure: { warning: 400, critical: 600 },
      vibration: { warning: 8, critical: 15 }
    }
    active_alerts: []
    alert_history: []
  }

  function check(data) {
    const threshold = state.thresholds[data.type]
    if (!threshold) return

    if (data.value >= threshold.critical) {
      const alert = {
        severity: "critical",
        sensor_id: data.sensor_id,
        type: data.type,
        value: data.value,
        threshold: threshold.critical,
        location: data.location,
        timestamp: current_time()
      }
      state.active_alerts.push(alert)
      state.alert_history.push(alert)
      emit("alert_critical", alert)
    } else if (data.value >= threshold.warning) {
      emit("alert_warning", {
        severity: "warning",
        sensor_id: data.sensor_id,
        type: data.type,
        value: data.value,
        location: data.location
      })
    }
  }
}

// ============================================================================
// PIPELINE STAGE 4: DASHBOARD — spatial visualization
// ============================================================================

object "dashboard" {
  geometry: "cube"
  position: { x: 0, y: 3, z: -6 }
  scale: { x: 4, y: 2, z: 0.1 }
  color: "#0a0a1a"
  roughness: 0.15
  metallic: 0.2
  emissive: "#001122"
  emissive_intensity: 0.3

  state {
    health_score: 100
    total_readings: 0
  }

  function update_display(snapshot) {
    state.health_score = snapshot.health_score
    state.total_readings += 1

    // Color-code the dashboard by health
    if (snapshot.health_score > 80) {
      color = "#2ecc71"  // green
    } else if (snapshot.health_score > 50) {
      color = "#f39c12"  // amber
    } else {
      color = "#e74c3c"  // red
    }
  }

  function on_alert(alert) {
    // Flash red on critical alerts
    color = "#ff0000"
    wait(0.5)
    color = "#e74c3c"
  }
}

// ============================================================================
// CONNECTIONS — wiring the pipeline (the heart of .hs)
// ============================================================================
// This is what makes .hs a PROCESS language: explicit data flow wiring.
// Read the connections top-to-bottom to understand the full pipeline.

// Sensors → Filter
connect temp_sensor_A.sensor_data -> noise_filter.process
connect pressure_sensor_B.sensor_data -> noise_filter.process
connect vibration_sensor_C.sensor_data -> noise_filter.process

// Filter → Aggregator + Alert (fan-out)
connect noise_filter.filtered_data -> aggregator.collect
connect noise_filter.filtered_data -> alert_manager.check

// Aggregator → Dashboard
connect aggregator.aggregate_snapshot -> dashboard.update_display

// Alerts → Dashboard
connect alert_manager.alert_critical -> dashboard.on_alert

// ============================================================================
// EXECUTION — start sensor sampling loops
// ============================================================================

execute temp_sensor_A.read() every 1000ms
execute pressure_sensor_B.read() every 500ms
execute vibration_sensor_C.read() every 200ms
