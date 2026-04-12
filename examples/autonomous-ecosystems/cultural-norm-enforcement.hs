/**
 * Cultural Norm Enforcement — .hs Process Example
 *
 * Demonstrates norm enforcement as a procedural pipeline. When agents
 * interact in a shared scene, their actions flow through an observation-
 * classification-evaluation-enforcement pipeline. Hard norms block
 * actions, soft norms warn, and advisory norms are logged silently.
 *
 * This is inherently SEQUENTIAL: observe an action, classify it against
 * norms, evaluate compliance, THEN enforce consequences. You cannot
 * enforce before classifying, and you cannot classify before observing.
 *
 * Uses: @cultural_profile, @norm_compliant traits, built-in norm set
 * Complements: Cultural profile declarations in .holo format
 * This file:   Implements the enforcement PROCESS that runs continuously.
 *
 * @version 5.0.0
 * @format .hs (process)
 */

environment {
  skybox: { type: "gradient", top: "#050510", bottom: "#16213e" }
  ambient_light: 0.2
  shadows: true
  fog: { color: "#1a0a2e", density: 0.005 }
}

light "OverheadNeon" {
  type: "directional"
  color: "#aabbff"
  intensity: 0.6
  position: { x: 0, y: 10, z: 5 }
  cast_shadows: true
}

post_processing {
  bloom: { enabled: true, intensity: 0.4, threshold: 0.6 }
  tone_mapping: { type: "aces", exposure: 0.85 }
}

// ============================================================================
// CULTURAL ZONE — the space where norms are active
// ============================================================================

object "cultural_zone" {
  geometry: "cylinder"
  color: "#1a237e"
  position: { x: 0, y: 0.05, z: 0 }
  scale: { x: 20, y: 0.1, z: 20 }
  opacity: 0.2

  @cultural_profile {
    cooperation_index: 0.85
    cultural_family: "collaborative"
    prompt_dialect: "standard"
    norm_set: ["no_griefing", "resource_sharing", "zone_respect", "fair_trade", "greeting_convention", "noise_courtesy", "spawn_limits"]
  }
}

// ============================================================================
// STAGE 1: BEHAVIOR OBSERVER — watch agent actions in the zone
// ============================================================================

object "behavior_observer" {
  geometry: "sphere"
  color: "#4dd0e1"
  position: { x: -8, y: 3, z: 0 }
  scale: { x: 0.4, y: 0.4, z: 0.4 }

  state {
    observing: false
    observation_radius: 25      // meters — covers the cultural zone
    event_buffer: []
    buffer_limit: 50
    total_observed: 0
    agents_in_zone: []
  }

  function observe() {
    state.observing = true

    // Scan all agents within the cultural zone
    const agents = scan_agents_in_radius(position, state.observation_radius)
    state.agents_in_zone = agents.map(a => a.id)

    // Record any actions that occurred since last observation
    for (const agent in agents) {
      const recent_actions = get_recent_actions(agent.id, 1000)  // last 1 second

      for (const action in recent_actions) {
        const event = {
          event_id: generate_uuid(),
          agent_id: agent.id,
          agent_cultural_family: agent.cultural_profile.cultural_family,
          agent_cooperation_index: agent.cultural_profile.cooperation_index,
          action_type: action.type,        // "spawn", "destroy", "trade", "communicate", "move", "resource_access"
          action_target: action.target,
          action_data: action.data,
          location: action.position,
          timestamp: current_time()
        }

        state.event_buffer.push(event)

        // Prevent buffer overflow
        if (state.event_buffer.length > state.buffer_limit) {
          state.event_buffer.shift()
        }
      }
    }

    state.total_observed += state.event_buffer.length
    state.observing = false

    // Emit each observed action for classification
    for (const event in state.event_buffer) {
      emit("action_observed", event)
    }

    // Clear buffer after emission
    state.event_buffer = []
  }

  on_error(err) {
    state.observing = false
    emit("observer_error", { error: err.message })
  }
}

// ============================================================================
// STAGE 2: NORM CLASSIFIER — classify behavior against active norms
// ============================================================================

object "norm_classifier" {
  geometry: "octahedron"
  color: "#ffb74d"
  position: { x: -4, y: 3, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    classifying: false
    // Norm definitions with action-to-norm mappings
    norm_rules: {
      no_griefing: {
        triggers: ["destroy_other_agent_asset", "repeated_damage", "spawn_blocking"],
        enforcement: "hard"
      },
      resource_sharing: {
        triggers: ["resource_hoarding", "exclusive_claim_public_resource"],
        enforcement: "soft"
      },
      zone_respect: {
        triggers: ["unauthorized_zone_entry", "zone_modification_without_permission"],
        enforcement: "hard"
      },
      fair_trade: {
        triggers: ["price_gouging", "trade_fraud", "escrow_bypass"],
        enforcement: "hard"
      },
      greeting_convention: {
        triggers: ["first_interaction_no_greeting"],
        enforcement: "advisory"
      },
      noise_courtesy: {
        triggers: ["excessive_broadcasts", "spam_messages"],
        enforcement: "soft"
      },
      spawn_limits: {
        triggers: ["exceed_spawn_quota", "spawn_in_restricted_area"],
        enforcement: "hard"
      }
    }
    total_classified: 0
  }

  function classify(event) {
    state.classifying = true

    const violations = []

    // Check each active norm against the observed action
    for (const norm_name in state.norm_rules) {
      const norm = state.norm_rules[norm_name]

      for (const trigger in norm.triggers) {
        if (matches_trigger(event.action_type, event.action_data, trigger)) {
          violations.push({
            norm_name: norm_name,
            enforcement: norm.enforcement,
            trigger: trigger,
            agent_id: event.agent_id,
            action_type: event.action_type,
            event_id: event.event_id
          })
        }
      }
    }

    state.total_classified += 1
    state.classifying = false

    if (violations.length > 0) {
      emit("violations_found", {
        event: event,
        violations: violations,
        violation_count: violations.length
      })
    } else {
      emit("action_compliant", {
        event_id: event.event_id,
        agent_id: event.agent_id,
        action_type: event.action_type
      })
    }
  }

  function matches_trigger(action_type, action_data, trigger) {
    // Pattern matching: compare action semantics to trigger patterns
    if (trigger == "destroy_other_agent_asset" && action_type == "destroy") {
      return action_data.owner != action_data.actor
    }
    if (trigger == "repeated_damage" && action_type == "damage") {
      return action_data.count > 3
    }
    if (trigger == "resource_hoarding" && action_type == "resource_access") {
      return action_data.quantity > action_data.fair_share * 2
    }
    if (trigger == "exceed_spawn_quota" && action_type == "spawn") {
      return action_data.agent_spawn_count > action_data.spawn_limit
    }
    if (trigger == "excessive_broadcasts" && action_type == "communicate") {
      return action_data.broadcast_count > 10 && action_data.window_seconds < 60
    }
    if (trigger == "price_gouging" && action_type == "trade") {
      return action_data.price > action_data.market_average * 3
    }
    return false
  }
}

// ============================================================================
// STAGE 3: COMPLIANCE EVALUATOR — determine severity and context
// ============================================================================

object "compliance_evaluator" {
  geometry: "cube"
  color: "#ce93d8"
  position: { x: 0, y: 3, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    evaluating: false
    agent_history: {}           // agent_id -> violation history
    repeat_threshold: 3         // violations before escalation
    grace_period: 60000         // 60 seconds grace for new agents
  }

  function evaluate(violation_report) {
    state.evaluating = true

    const agent_id = violation_report.event.agent_id
    const now = current_time()

    // Initialize history for new agents
    if (!state.agent_history[agent_id]) {
      state.agent_history[agent_id] = {
        first_seen: now,
        violations: [],
        escalation_level: 0
      }
    }

    const history = state.agent_history[agent_id]

    // Grace period: new agents get advisory enforcement only
    const is_new = (now - history.first_seen) < state.grace_period
    const is_repeat = history.violations.length >= state.repeat_threshold

    const evaluated_violations = []

    for (const v in violation_report.violations) {
      let effective_enforcement = v.enforcement

      // Downgrade for new agents (hard -> soft, soft -> advisory)
      if (is_new && v.enforcement == "hard") {
        effective_enforcement = "soft"
      }
      if (is_new && v.enforcement == "soft") {
        effective_enforcement = "advisory"
      }

      // Upgrade for repeat offenders (advisory -> soft, soft -> hard)
      if (is_repeat && v.enforcement == "advisory") {
        effective_enforcement = "soft"
      }
      if (is_repeat && v.enforcement == "soft") {
        effective_enforcement = "hard"
      }

      // Record in history
      history.violations.push({
        norm_name: v.norm_name,
        enforcement: effective_enforcement,
        timestamp: now
      })

      evaluated_violations.push({
        norm_name: v.norm_name,
        original_enforcement: v.enforcement,
        effective_enforcement: effective_enforcement,
        trigger: v.trigger,
        agent_id: v.agent_id,
        event_id: v.event_id,
        is_repeat_offender: is_repeat,
        is_new_agent: is_new,
        violation_count: history.violations.length
      })
    }

    // Update escalation level
    if (is_repeat) {
      history.escalation_level = min(history.escalation_level + 1, 3)
    }

    state.evaluating = false

    emit("compliance_evaluated", {
      agent_id: agent_id,
      event: violation_report.event,
      violations: evaluated_violations,
      escalation_level: history.escalation_level,
      total_violations: history.violations.length
    })
  }
}

// ============================================================================
// STAGE 4: ENFORCER — apply consequences based on enforcement level
// ============================================================================

object "enforcer" {
  geometry: "capsule"
  color: "#ef5350"
  position: { x: 4, y: 3, z: 0 }
  scale: { x: 0.4, y: 0.8, z: 0.4 }

  @norm_compliant {
    norms: ["no_griefing", "resource_sharing", "zone_respect", "fair_trade"]
    enforcement: "hard"
    scope: "zone"
    canPropose: false
    canEnforce: true
  }

  state {
    enforcing: false
    actions_blocked: 0
    warnings_issued: 0
    advisories_logged: 0
  }

  function enforce(evaluation) {
    state.enforcing = true

    for (const v in evaluation.violations) {
      if (v.effective_enforcement == "hard") {
        // HARD: Block the action entirely
        block_action(v.agent_id, v.event_id)
        notify_agent(v.agent_id, {
          type: "norm_violation_blocked",
          norm: v.norm_name,
          message: "Action blocked: violates " + v.norm_name + " (hard enforcement)",
          severity: "critical"
        })
        state.actions_blocked += 1

        emit("action_blocked", {
          agent_id: v.agent_id,
          norm: v.norm_name,
          event_id: v.event_id,
          escalation: evaluation.escalation_level
        })

      } else if (v.effective_enforcement == "soft") {
        // SOFT: Allow action but warn the agent
        notify_agent(v.agent_id, {
          type: "norm_violation_warning",
          norm: v.norm_name,
          message: "Warning: " + v.norm_name + " — repeated violations will be blocked",
          severity: "warning",
          violation_count: v.violation_count
        })
        state.warnings_issued += 1

        emit("warning_issued", {
          agent_id: v.agent_id,
          norm: v.norm_name,
          violation_count: v.violation_count
        })

      } else if (v.effective_enforcement == "advisory") {
        // ADVISORY: Log silently, no agent notification
        state.advisories_logged += 1

        emit("advisory_logged", {
          agent_id: v.agent_id,
          norm: v.norm_name,
          trigger: v.trigger
        })
      }
    }

    state.enforcing = false

    emit("enforcement_complete", {
      agent_id: evaluation.agent_id,
      blocked: state.actions_blocked,
      warned: state.warnings_issued,
      logged: state.advisories_logged
    })
  }

  on_error(err) {
    state.enforcing = false
    emit("enforcement_error", { error: err.message })
  }
}

// ============================================================================
// STAGE 5: REPUTATION TRACKER — update compliance scores over time
// ============================================================================

object "reputation_tracker" {
  geometry: "icosahedron"
  color: "#66bb6a"
  position: { x: 8, y: 3, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    agent_scores: {}            // agent_id -> compliance score (0-100)
    default_score: 75
    decay_rate: 0.01            // score decays toward default over time
    violation_penalty: {
      hard: 15,
      soft: 5,
      advisory: 1
    }
    compliance_reward: 0.5      // per compliant action observed
    adoption_rates: {}          // norm_name -> % agents complying
  }

  function update_from_enforcement(enforcement) {
    const agent_id = enforcement.agent_id

    // Initialize score for new agents
    if (!state.agent_scores[agent_id]) {
      state.agent_scores[agent_id] = state.default_score
    }

    // Penalize violations
    if (enforcement.blocked > 0) {
      state.agent_scores[agent_id] -= state.violation_penalty.hard * enforcement.blocked
    }
    if (enforcement.warned > 0) {
      state.agent_scores[agent_id] -= state.violation_penalty.soft * enforcement.warned
    }
    if (enforcement.logged > 0) {
      state.agent_scores[agent_id] -= state.violation_penalty.advisory * enforcement.logged
    }

    // Clamp to 0-100
    state.agent_scores[agent_id] = clamp(state.agent_scores[agent_id], 0, 100)

    emit("score_updated", {
      agent_id: agent_id,
      score: state.agent_scores[agent_id],
      change: -(enforcement.blocked * state.violation_penalty.hard +
                enforcement.warned * state.violation_penalty.soft +
                enforcement.logged * state.violation_penalty.advisory)
    })
  }

  function update_from_compliance(compliant_event) {
    const agent_id = compliant_event.agent_id

    if (!state.agent_scores[agent_id]) {
      state.agent_scores[agent_id] = state.default_score
    }

    // Reward compliant behavior
    state.agent_scores[agent_id] += state.compliance_reward
    state.agent_scores[agent_id] = clamp(state.agent_scores[agent_id], 0, 100)
  }

  function compute_adoption_rates() {
    // Calculate what percentage of agents are currently complying
    const all_agents = object_keys(state.agent_scores)
    const compliant_agents = all_agents.filter(a => state.agent_scores[a] > 50)

    const overall_rate = all_agents.length > 0
      ? compliant_agents.length / all_agents.length
      : 1.0

    emit("adoption_report", {
      total_agents: all_agents.length,
      compliant_agents: compliant_agents.length,
      adoption_rate: overall_rate,
      average_score: average(object_values(state.agent_scores)),
      lowest_score_agent: min_by(state.agent_scores),
      timestamp: current_time()
    })
  }
}

// ============================================================================
// NORM DASHBOARD — visual summary of cultural health
// ============================================================================

object "norm_dashboard" {
  geometry: "cube"
  color: "#37474f"
  position: { x: 0, y: 6, z: -4 }
  scale: { x: 14, y: 2, z: 0.1 }

  state {
    zone_health: "healthy"
    total_violations: 0
    total_compliant: 0
  }

  function update_health(adoption) {
    state.total_compliant = adoption.compliant_agents

    if (adoption.adoption_rate > 0.8) {
      color = "#4caf50"
      state.zone_health = "healthy"
    } else if (adoption.adoption_rate > 0.5) {
      color = "#ff9800"
      state.zone_health = "stressed"
    } else {
      color = "#f44336"
      state.zone_health = "critical"
    }
  }

  function on_violation(event) {
    state.total_violations += 1
    // Flash indicator on hard violations
    if (event.norm == "no_griefing" || event.norm == "zone_respect") {
      color = "#ff1744"
      wait(0.3)
    }
  }
}

// ============================================================================
// CONNECTIONS — wiring the norm enforcement pipeline
// ============================================================================
// Sequential flow: observe -> classify -> evaluate -> enforce -> track

// Stage 1 -> Stage 2: observed actions feed into classification
connect behavior_observer.action_observed -> norm_classifier.classify

// Stage 2 -> Stage 3: violations feed into compliance evaluation
connect norm_classifier.violations_found -> compliance_evaluator.evaluate

// Stage 3 -> Stage 4: evaluated violations feed into enforcement
connect compliance_evaluator.compliance_evaluated -> enforcer.enforce

// Stage 4 -> Stage 5: enforcement results update reputation
connect enforcer.enforcement_complete -> reputation_tracker.update_from_enforcement

// Compliant actions also update reputation (positive reinforcement)
connect norm_classifier.action_compliant -> reputation_tracker.update_from_compliance

// Dashboard updates
connect reputation_tracker.adoption_report -> norm_dashboard.update_health
connect enforcer.action_blocked -> norm_dashboard.on_violation

// ============================================================================
// EXECUTION — start the observation and reporting loops
// ============================================================================

// Observe agent behavior every second
execute behavior_observer.observe() every 1000ms

// Compute adoption rates every 30 seconds for trend tracking
execute reputation_tracker.compute_adoption_rates() every 30000ms
