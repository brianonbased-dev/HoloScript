/**
 * Agent Migration Pipeline — .hs Process Example
 *
 * Demonstrates agent migration as a step-by-step procedural pipeline.
 * When an agent needs to move between scenes (overloaded origin, better
 * resources elsewhere, task requirements), this pipeline orchestrates
 * the entire process: discover targets, plan migration, serialize state,
 * transfer, and verify arrival.
 *
 * This is inherently SEQUENTIAL — each stage must complete before the
 * next begins. Declarative .holo cannot express "first serialize, THEN
 * transmit, THEN verify." That ordering IS the program.
 *
 * Complements: 01-agent-portal-messaging.holo (declares portal config)
 * This file:   Implements the migration PROCESS that uses those portals.
 *
 * @version 5.0.0
 * @format .hs (process)
 */

environment {
  skybox: "void"
  ambient_light: 0.4
  fog: { color: "#0a0a1a", density: 0.01 }
}

// ============================================================================
// STAGE 1: SCENE SCANNER — discover available migration targets
// ============================================================================

object "scene_scanner" {
  geometry: "sphere"
  color: "#00bcd4"
  position: { x: -8, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    known_scenes: []
    scan_interval: 30000       // scan every 30 seconds
    last_scan: 0
    scanning: false
    local_scene_id: "scene_origin_001"
    relay_url: "ws://localhost:4200/portal"
    max_hop_count: 3
  }

  // Step 1: Send federation query to discover reachable scenes
  function discover() {
    state.scanning = true
    emit("scan_started", { timestamp: current_time() })

    // Query the portal relay for all connected scenes
    const query = {
      type: "federation_query",
      origin: state.local_scene_id,
      relay: state.relay_url,
      ttl: state.max_hop_count,
      request: "list_scenes"
    }

    const response = portal_query(query)

    // Filter out our own scene and unreachable nodes
    state.known_scenes = []
    for (const scene in response.scenes) {
      if (scene.id != state.local_scene_id && scene.status == "active") {
        state.known_scenes.push({
          id: scene.id,
          name: scene.name,
          agent_count: scene.agent_count,
          capacity: scene.capacity,
          capabilities: scene.capabilities,
          latency_ms: scene.latency_ms,
          last_seen: current_time()
        })
      }
    }

    state.scanning = false
    state.last_scan = current_time()

    emit("scenes_discovered", {
      count: state.known_scenes.length,
      scenes: state.known_scenes
    })
  }

  // Triggered when local scene is overloaded or agent requests migration
  on_detect(trigger) {
    if (trigger.type == "migration_requested" || trigger.type == "scene_overloaded") {
      if (state.known_scenes.length > 0) {
        emit("migration_candidate", {
          agent_id: trigger.agent_id,
          reason: trigger.reason,
          available_scenes: state.known_scenes
        })
      } else {
        // No known scenes — force a scan first
        discover()
        if (state.known_scenes.length > 0) {
          emit("migration_candidate", {
            agent_id: trigger.agent_id,
            reason: trigger.reason,
            available_scenes: state.known_scenes
          })
        } else {
          emit("migration_blocked", {
            agent_id: trigger.agent_id,
            reason: "no_available_scenes"
          })
        }
      }
    }
  }
}

// ============================================================================
// STAGE 2: MIGRATION PLANNER — evaluate targets, select best destination
// ============================================================================

object "migration_planner" {
  geometry: "octahedron"
  color: "#ff9800"
  position: { x: -4, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    planning: false
    current_plan: null
    max_latency_ms: 200         // reject scenes with latency above this
    min_free_capacity: 0.2      // require at least 20% free capacity
    required_capabilities: []
  }

  function evaluate(candidate) {
    state.planning = true
    state.required_capabilities = candidate.agent_id.capabilities || []

    let best_scene = null
    let best_score = -1

    for (const scene in candidate.available_scenes) {
      // Filter: latency check
      if (scene.latency_ms > state.max_latency_ms) {
        continue
      }

      // Filter: capacity check
      const free_ratio = 1 - (scene.agent_count / scene.capacity)
      if (free_ratio < state.min_free_capacity) {
        continue
      }

      // Filter: capability compatibility
      let compatible = true
      for (const cap in state.required_capabilities) {
        if (!scene.capabilities.includes(cap)) {
          compatible = false
          break
        }
      }
      if (!compatible) {
        continue
      }

      // Score: prefer low latency, high free capacity
      const score = free_ratio * 0.6 + (1 - scene.latency_ms / state.max_latency_ms) * 0.4
      if (score > best_score) {
        best_score = score
        best_scene = scene
      }
    }

    if (best_scene) {
      state.current_plan = {
        agent_id: candidate.agent_id,
        source_scene: "scene_origin_001",
        target_scene: best_scene.id,
        target_name: best_scene.name,
        score: best_score,
        reason: candidate.reason,
        planned_at: current_time()
      }

      emit("plan_ready", state.current_plan)
    } else {
      state.planning = false
      emit("plan_failed", {
        agent_id: candidate.agent_id,
        reason: "no_suitable_target"
      })
    }
  }
}

// ============================================================================
// STAGE 3: STATE SERIALIZER — package agent memory and cultural profile
// ============================================================================

object "state_serializer" {
  geometry: "cube"
  color: "#9c27b0"
  position: { x: 0, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    serializing: false
    serialized_payload: null
    max_payload_bytes: 1048576   // 1 MB max payload
    compression_enabled: true
  }

  function serialize(plan) {
    state.serializing = true

    // Gather agent state from the local scene
    const agent = get_agent(plan.agent_id)

    // Serialize core agent data
    const payload = {
      metadata: {
        agent_id: plan.agent_id,
        source_scene: plan.source_scene,
        target_scene: plan.target_scene,
        serialized_at: current_time(),
        format_version: "5.0.0"
      },
      // Agent memory and internal state
      memory: agent.get_state(),
      // Capabilities list for target scene validation
      capabilities: agent.capabilities,
      // Cultural profile — cooperation index, norms, dialect
      cultural_profile: {
        cooperation_index: agent.cultural_profile.cooperation_index,
        cultural_family: agent.cultural_profile.cultural_family,
        prompt_dialect: agent.cultural_profile.prompt_dialect,
        norm_set: agent.cultural_profile.norm_set
      },
      // Economy state — credit balance and transaction history
      economy: {
        balance: agent.economy.balance,
        pending_bounties: agent.economy.pending_bounties,
        subscriptions: agent.economy.active_subscriptions
      },
      // Position and spatial context
      spatial: {
        last_position: agent.position,
        last_rotation: agent.rotation
      }
    }

    // Compress if enabled
    if (state.compression_enabled) {
      payload.compressed = true
      payload.data = compress(payload)
    }

    // Validate payload size
    const size = byte_size(payload)
    if (size > state.max_payload_bytes) {
      state.serializing = false
      emit("serialize_failed", {
        agent_id: plan.agent_id,
        reason: "payload_too_large",
        size: size,
        limit: state.max_payload_bytes
      })
      return
    }

    // Generate integrity checksum
    payload.checksum = sha256(payload)

    state.serialized_payload = payload
    state.serializing = false

    emit("state_serialized", {
      agent_id: plan.agent_id,
      target_scene: plan.target_scene,
      payload: payload,
      size_bytes: size
    })
  }
}

// ============================================================================
// STAGE 4: TRANSFER ENGINE — transmit agent to target scene via portal
// ============================================================================

object "transfer_engine" {
  geometry: "torus"
  color: "#2196f3"
  position: { x: 4, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.3, z: 0.5 }

  state {
    transferring: false
    transfer_id: null
    retry_count: 0
    max_retries: 3
    retry_delay: 2000           // ms between retries
    timeout: 15000              // 15 second transfer timeout
  }

  function transmit(serialized) {
    state.transferring = true
    state.transfer_id = generate_uuid()
    state.retry_count = 0

    // Build the portal migration message
    const message = {
      type: "portal:migrate_out",
      transfer_id: state.transfer_id,
      agent_id: serialized.agent_id,
      target_scene: serialized.target_scene,
      payload: serialized.payload,
      timestamp: current_time()
    }

    // Attempt transmission with retry logic
    let success = false
    while (!success && state.retry_count < state.max_retries) {
      const result = portal_send(message, state.timeout)

      if (result.status == "accepted") {
        success = true
        emit("transfer_sent", {
          transfer_id: state.transfer_id,
          agent_id: serialized.agent_id,
          target_scene: serialized.target_scene,
          attempt: state.retry_count + 1
        })
      } else {
        state.retry_count += 1
        if (state.retry_count < state.max_retries) {
          wait(state.retry_delay)
        }
      }
    }

    if (!success) {
      state.transferring = false
      emit("transfer_failed", {
        transfer_id: state.transfer_id,
        agent_id: serialized.agent_id,
        reason: "max_retries_exceeded",
        attempts: state.retry_count
      })
    }
  }

  on_error(err) {
    state.transferring = false
    emit("transfer_error", {
      transfer_id: state.transfer_id,
      error: err.message
    })
  }
}

// ============================================================================
// STAGE 5: VERIFICATION MONITOR — confirm arrival, validate integrity
// ============================================================================

object "verification_monitor" {
  geometry: "icosahedron"
  color: "#4caf50"
  position: { x: 8, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    verifying: false
    verification_timeout: 30000  // 30 seconds to confirm arrival
    pending_verifications: []
  }

  function verify(transfer) {
    state.verifying = true

    // Wait for confirmation from target scene
    const confirmation = wait_for_event("portal:agent_migrated", {
      transfer_id: transfer.transfer_id,
      timeout: state.verification_timeout
    })

    if (!confirmation) {
      state.verifying = false
      emit("verification_timeout", {
        transfer_id: transfer.transfer_id,
        agent_id: transfer.agent_id
      })
      return
    }

    // Validate state integrity — checksum must match
    if (confirmation.checksum != transfer.payload.checksum) {
      state.verifying = false
      emit("verification_failed", {
        transfer_id: transfer.transfer_id,
        agent_id: transfer.agent_id,
        reason: "checksum_mismatch"
      })
      return
    }

    // Cleanup: remove agent from source scene
    remove_agent(transfer.agent_id)

    state.verifying = false

    emit("migration_complete", {
      transfer_id: transfer.transfer_id,
      agent_id: transfer.agent_id,
      source_scene: "scene_origin_001",
      target_scene: transfer.target_scene,
      duration_ms: current_time() - transfer.timestamp,
      verified: true
    })
  }

  on_error(err) {
    state.verifying = false
    emit("verification_error", { error: err.message })
  }
}

// ============================================================================
// PIPELINE STATUS DISPLAY — visual indicator of migration progress
// ============================================================================

object "pipeline_status" {
  geometry: "cube"
  color: "#37474f"
  position: { x: 0, y: 5, z: -3 }
  scale: { x: 10, y: 1, z: 0.1 }

  state {
    current_stage: "idle"
    migrations_completed: 0
    migrations_failed: 0
  }

  function update_stage(stage_name) {
    state.current_stage = stage_name
    // Color indicates current pipeline stage
    if (stage_name == "scanning") color = "#00bcd4"
    if (stage_name == "planning") color = "#ff9800"
    if (stage_name == "serializing") color = "#9c27b0"
    if (stage_name == "transferring") color = "#2196f3"
    if (stage_name == "verifying") color = "#4caf50"
    if (stage_name == "complete") {
      color = "#00e676"
      state.migrations_completed += 1
    }
    if (stage_name == "failed") {
      color = "#f44336"
      state.migrations_failed += 1
    }
  }
}

// ============================================================================
// CONNECTIONS — wiring the migration pipeline (the heart of .hs)
// ============================================================================
// Read top-to-bottom: this IS the pipeline architecture.
// Each stage emits an event that feeds into the next stage's function.

// Stage 1 -> Stage 2: discovered candidates feed into planning
connect scene_scanner.migration_candidate -> migration_planner.evaluate

// Stage 2 -> Stage 3: approved plan triggers state serialization
connect migration_planner.plan_ready -> state_serializer.serialize

// Stage 3 -> Stage 4: serialized payload triggers transmission
connect state_serializer.state_serialized -> transfer_engine.transmit

// Stage 4 -> Stage 5: sent transfer triggers verification
connect transfer_engine.transfer_sent -> verification_monitor.verify

// Status display updates at each stage
connect scene_scanner.scan_started -> pipeline_status.update_stage("scanning")
connect migration_planner.plan_ready -> pipeline_status.update_stage("planning")
connect state_serializer.state_serialized -> pipeline_status.update_stage("serializing")
connect transfer_engine.transfer_sent -> pipeline_status.update_stage("transferring")
connect verification_monitor.migration_complete -> pipeline_status.update_stage("complete")

// Error paths
connect migration_planner.plan_failed -> pipeline_status.update_stage("failed")
connect state_serializer.serialize_failed -> pipeline_status.update_stage("failed")
connect transfer_engine.transfer_failed -> pipeline_status.update_stage("failed")
connect verification_monitor.verification_failed -> pipeline_status.update_stage("failed")

// ============================================================================
// EXECUTION — start the pipeline processes
// ============================================================================

// Continuously scan for available scenes every 30 seconds
execute scene_scanner.discover() every 30000ms

// The rest of the pipeline is event-driven via connect statements above.
// No polling needed — each stage triggers the next automatically.
