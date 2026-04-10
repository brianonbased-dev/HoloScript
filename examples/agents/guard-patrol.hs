/**
 * Guard Patrol Agent — .hs Process Example
 *
 * Demonstrates WHY .hs exists: step-by-step procedural behavior
 * that declarative .holo cannot express. Guards follow waypoints,
 * investigate disturbances, raise alarms, and coordinate responses.
 *
 * .hs captures PROCESS — the sequential logic an agent follows.
 * Compare with .holo (what things ARE) and .hsplus (how things REACT).
 *
 * @version 5.0.0
 * @format .hs (process)
 */

environment {
  skybox: "night"
  ambient_light: 0.3
  fog: { color: "#1a1a2e", density: 0.02 }
}

// ============================================================================
// WAYPOINT NETWORK — defines the patrol route as spatial graph
// ============================================================================

object "waypoint_gate" {
  geometry: "cylinder"
  color: "#ffaa00"
  position: { x: 0, y: 0.1, z: -15 }
  scale: { x: 0.3, y: 0.2, z: 0.3 }
  tag: "waypoint"
}

object "waypoint_market" {
  geometry: "cylinder"
  color: "#ffaa00"
  position: { x: 12, y: 0.1, z: -5 }
  scale: { x: 0.3, y: 0.2, z: 0.3 }
  tag: "waypoint"
}

object "waypoint_tower" {
  geometry: "cylinder"
  color: "#ffaa00"
  position: { x: -10, y: 0.1, z: 8 }
  scale: { x: 0.3, y: 0.2, z: 0.3 }
  tag: "waypoint"
}

object "waypoint_square" {
  geometry: "cylinder"
  color: "#ffaa00"
  position: { x: 5, y: 0.1, z: 10 }
  scale: { x: 0.3, y: 0.2, z: 0.3 }
  tag: "waypoint"
}

// ============================================================================
// ALARM SYSTEM — connected to guard via `connect` statements
// ============================================================================

object "alarm_bell" {
  geometry: "sphere"
  color: "#ff0000"
  position: { x: 0, y: 5, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    active: false
    cooldown: 0
  }

  function activate() {
    state.active = true
    state.cooldown = 30
    emit("alarm_triggered")
  }

  function deactivate() {
    state.active = false
    emit("alarm_cleared")
  }
}

// ============================================================================
// GUARD NPC — procedural agent with state and sequential logic
// ============================================================================

object "guard_captain" {
  geometry: "capsule"
  color: "#4a6fa5"
  position: { x: 0, y: 1, z: -15 }
  scale: { x: 0.8, y: 1.8, z: 0.8 }

  // Agent state — what the guard knows and tracks
  state {
    current_waypoint: 0
    alert_level: 0          // 0=calm, 1=cautious, 2=alert, 3=combat
    patrol_speed: 2.0       // meters per second
    investigation_target: null
    time_at_waypoint: 0
    wait_duration: 5        // seconds to observe at each waypoint
    shift_start: "22:00"
    shift_end: "06:00"
    incidents_logged: 0
  }

  // === CORE PATROL LOOP ===
  // This is what .hs is for: sequential process that runs step by step

  function patrol() {
    // Walk to next waypoint
    const waypoints = ["waypoint_gate", "waypoint_market", "waypoint_tower", "waypoint_square"]
    const target = waypoints[state.current_waypoint]

    move_to(target, state.patrol_speed)
    face_toward(target)

    // Observe surroundings at each stop
    state.time_at_waypoint = 0
    while (state.time_at_waypoint < state.wait_duration) {
      scan_area(15)  // 15 meter detection radius
      state.time_at_waypoint += delta_time
      yield  // yield control back to engine each frame
    }

    // Advance to next waypoint
    state.current_waypoint = (state.current_waypoint + 1) % waypoints.length
  }

  // === INVESTIGATION PROCEDURE ===
  // When a disturbance is detected, break from patrol to investigate

  function investigate(target) {
    state.alert_level = 2
    state.investigation_target = target

    // Approach cautiously
    move_to(target, state.patrol_speed * 0.5)
    face_toward(target)

    // Assess the situation
    const threat = assess_threat(target)

    if (threat.level > 0.7) {
      raise_alarm()
      state.alert_level = 3
    } else if (threat.level > 0.3) {
      // Issue warning
      emit("guard_warning", { target: target, message: "Halt! Identify yourself." })
      wait(3)

      // Re-assess after warning
      const reassess = assess_threat(target)
      if (reassess.level > 0.5) {
        raise_alarm()
      }
    }

    // Log the incident regardless
    state.incidents_logged += 1
    emit("incident_logged", {
      location: target,
      threat_level: threat.level,
      time: current_time(),
      resolution: state.alert_level > 2 ? "alarm_raised" : "cleared"
    })

    // Return to patrol
    state.investigation_target = null
    state.alert_level = max(state.alert_level - 1, 0)
  }

  // === ALARM PROCEDURE ===

  function raise_alarm() {
    state.alert_level = 3
    emit("guard_alarm", { guard: "guard_captain", location: position })
    // Signal the alarm bell via connected system
    alarm_bell.activate()
  }

  // === RETURN TO POST ===

  function return_to_post() {
    state.alert_level = 0
    state.investigation_target = null
    const nearest = find_nearest("waypoint")
    move_to(nearest, state.patrol_speed)
    state.current_waypoint = index_of(nearest)
  }

  // === EVENT HANDLERS ===
  // Interrupts the patrol loop when disturbances are detected

  on_detect(entity) {
    if (entity.tag == "intruder" && state.alert_level < 2) {
      investigate(entity)
    }
  }

  on_damage(amount) {
    raise_alarm()
    face_toward(damage_source)
  }

  on_shift_end() {
    return_to_post()
    emit("shift_change", { guard: "guard_captain", post: "waypoint_gate" })
  }
}

// ============================================================================
// CONNECTIONS — wiring systems together (unique to .hs)
// ============================================================================
// connect statements link objects without tight coupling.
// The guard doesn't need to know HOW the alarm works — just that it exists.

connect guard_captain.raise_alarm -> alarm_bell.activate
connect alarm_bell.alarm_triggered -> guard_captain.state.alert_level = 3

// ============================================================================
// EXECUTION — start the patrol loop
// ============================================================================
// execute is .hs's way of saying "run this process continuously"

execute guard_captain.patrol() repeat forever
