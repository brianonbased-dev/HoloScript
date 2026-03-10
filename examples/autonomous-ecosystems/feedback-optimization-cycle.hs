/**
 * Feedback Optimization Cycle — .hs Process Example
 *
 * Demonstrates a closed-loop optimization pipeline where runtime
 * metrics flow through sampling, trend detection, root cause analysis,
 * signal generation, optimization, and verification. The key insight:
 * verification feeds BACK into sampling, creating a true feedback cycle.
 *
 * This is inherently SEQUENTIAL and CYCLIC — you must measure before
 * analyzing, analyze before optimizing, and verify after optimizing.
 * The loop structure IS the program.
 *
 * Uses: FeedbackLoopTrait metrics, QualityMetric, OptimizationSignal
 * Complements: 03-feedback-loop-optimization.holo (declares metric config)
 * This file:   Implements the optimization CYCLE that adapts at runtime.
 *
 * @version 5.0.0
 * @format .hs (process)
 */

environment {
  skybox: "studio"
  ambient_light: 0.6
}

// ============================================================================
// STAGE 1: METRIC SAMPLER — measure FPS, engagement, errors, latency, memory
// ============================================================================

object "metric_sampler" {
  geometry: "sphere"
  color: "#29b6f6"
  position: { x: -10, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    sampling: false
    sample_count: 0
    metrics: {
      fps: { target: 60, current: 0, min: 0, max: 144 },
      engagement_time: { target: 120, current: 0, min: 0, max: 3600 },
      error_rate: { target: 0, current: 0, min: 0, max: 100 },
      agent_response_time: { target: 500, current: 0, min: 0, max: 10000 },
      memory_usage: { target: 512, current: 0, min: 0, max: 8192 }
    }
    history_window: 60          // keep last 60 samples
    sample_history: {
      fps: [],
      engagement_time: [],
      error_rate: [],
      agent_response_time: [],
      memory_usage: []
    }
  }

  function sample() {
    state.sampling = true

    // Read current system metrics
    state.metrics.fps.current = get_system_metric("fps")
    state.metrics.engagement_time.current = get_system_metric("engagement_time")
    state.metrics.error_rate.current = get_system_metric("error_rate")
    state.metrics.agent_response_time.current = get_system_metric("agent_response_time")
    state.metrics.memory_usage.current = get_system_metric("memory_usage_mb")

    // Append to rolling history
    for (const name in state.metrics) {
      state.sample_history[name].push({
        value: state.metrics[name].current,
        timestamp: current_time()
      })

      // Trim to window size
      if (state.sample_history[name].length > state.history_window) {
        state.sample_history[name].shift()
      }
    }

    state.sample_count += 1
    state.sampling = false

    emit("metrics_sampled", {
      sample_number: state.sample_count,
      metrics: state.metrics,
      history: state.sample_history,
      timestamp: current_time()
    })
  }

  on_error(err) {
    state.sampling = false
    emit("sampler_error", { error: err.message })
  }
}

// ============================================================================
// STAGE 2: TREND DETECTOR — linear regression over sliding window
// ============================================================================

object "trend_detector" {
  geometry: "octahedron"
  color: "#ffa726"
  position: { x: -6, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    detecting: false
    min_samples: 5              // need at least 5 points for trend
    slope_threshold: 0.05       // minimum slope to call a trend
    trends: {}
  }

  function detect(sample_data) {
    state.detecting = true
    state.trends = {}

    for (const metric_name in sample_data.history) {
      const history = sample_data.history[metric_name]

      // Need minimum samples for meaningful regression
      if (history.length < state.min_samples) {
        state.trends[metric_name] = { trend: "insufficient_data", slope: 0 }
        continue
      }

      // Simple linear regression: y = mx + b
      const n = history.length
      let sum_x = 0
      let sum_y = 0
      let sum_xy = 0
      let sum_xx = 0

      for (let i = 0; i < n; i++) {
        const x = i
        const y = history[i].value
        sum_x += x
        sum_y += y
        sum_xy += x * y
        sum_xx += x * x
      }

      const slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x)
      const intercept = (sum_y - slope * sum_x) / n

      // Classify trend
      let trend = "stable"
      if (slope > state.slope_threshold) {
        trend = "increasing"
      } else if (slope < -state.slope_threshold) {
        trend = "decreasing"
      }

      // Determine if trend is good or bad relative to target
      const target = sample_data.metrics[metric_name].target
      const current = sample_data.metrics[metric_name].current
      let health = "nominal"

      // For metrics where higher is better (fps, engagement)
      if (metric_name == "fps" || metric_name == "engagement_time") {
        if (current < target * 0.8) health = "degraded"
        if (current < target * 0.5) health = "critical"
        if (trend == "decreasing" && current < target) health = "declining"
      }

      // For metrics where lower is better (error_rate, response_time, memory)
      if (metric_name == "error_rate" || metric_name == "agent_response_time" || metric_name == "memory_usage") {
        if (current > target * 1.2) health = "degraded"
        if (current > target * 1.5) health = "critical"
        if (trend == "increasing" && current > target) health = "declining"
      }

      state.trends[metric_name] = {
        trend: trend,
        slope: slope,
        intercept: intercept,
        health: health,
        current: current,
        target: target,
        deviation_pct: abs(current - target) / target * 100
      }
    }

    state.detecting = false

    // Check if any metric requires attention
    const degraded = object_values(state.trends).filter(t => t.health != "nominal")

    if (degraded.length > 0) {
      emit("trends_detected", {
        trends: state.trends,
        degraded_count: degraded.length,
        timestamp: current_time()
      })
    } else {
      emit("all_nominal", {
        trends: state.trends,
        timestamp: current_time()
      })
    }
  }
}

// ============================================================================
// STAGE 3: ROOT CAUSE ANALYZER — identify which system is degrading
// ============================================================================

object "root_cause_analyzer" {
  geometry: "cube"
  color: "#ef5350"
  position: { x: -2, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    analyzing: false
    // Correlation rules: which metrics suggest which subsystems
    subsystem_map: {
      rendering: ["fps"],
      networking: ["agent_response_time"],
      memory: ["memory_usage"],
      content: ["engagement_time"],
      reliability: ["error_rate"]
    }
    analysis_result: null
  }

  function analyze(trend_data) {
    state.analyzing = true

    const root_causes = []

    for (const metric_name in trend_data.trends) {
      const trend = trend_data.trends[metric_name]

      if (trend.health == "nominal") continue

      // Identify the responsible subsystem
      let responsible_subsystem = "unknown"
      for (const subsystem in state.subsystem_map) {
        if (state.subsystem_map[subsystem].includes(metric_name)) {
          responsible_subsystem = subsystem
          break
        }
      }

      // Determine severity and probable cause
      let probable_cause = "unknown"
      let confidence = 0.5

      if (metric_name == "fps" && trend.trend == "decreasing") {
        probable_cause = "excessive_draw_calls_or_complex_geometry"
        confidence = 0.8
      }
      if (metric_name == "memory_usage" && trend.trend == "increasing") {
        probable_cause = "memory_leak_or_asset_accumulation"
        confidence = 0.85
      }
      if (metric_name == "agent_response_time" && trend.trend == "increasing") {
        probable_cause = "network_congestion_or_overloaded_agents"
        confidence = 0.7
      }
      if (metric_name == "error_rate" && trend.trend == "increasing") {
        probable_cause = "cascading_failures_or_resource_exhaustion"
        confidence = 0.75
      }
      if (metric_name == "engagement_time" && trend.trend == "decreasing") {
        probable_cause = "content_staleness_or_poor_responsiveness"
        confidence = 0.6
      }

      root_causes.push({
        metric: metric_name,
        subsystem: responsible_subsystem,
        health: trend.health,
        trend_direction: trend.trend,
        slope: trend.slope,
        deviation_pct: trend.deviation_pct,
        probable_cause: probable_cause,
        confidence: confidence
      })
    }

    // Sort by severity (critical first, then degraded, then declining)
    const severity_order = { critical: 0, degraded: 1, declining: 2 }
    root_causes.sort((a, b) => severity_order[a.health] - severity_order[b.health])

    state.analysis_result = root_causes
    state.analyzing = false

    emit("root_causes_identified", {
      causes: root_causes,
      primary_cause: root_causes.length > 0 ? root_causes[0] : null,
      total_issues: root_causes.length,
      timestamp: current_time()
    })
  }
}

// ============================================================================
// STAGE 4: SIGNAL GENERATOR — create optimization recommendations
// ============================================================================

object "signal_generator" {
  geometry: "torus"
  color: "#ab47bc"
  position: { x: 2, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.3, z: 0.5 }

  state {
    generating: false
    // Action recommendations per subsystem
    action_catalog: {
      rendering: ["reduce_lod", "disable_shadows", "lower_resolution", "cull_distant_objects"],
      memory: ["trigger_gc", "clear_asset_cache", "unload_unused_textures", "compress_buffers"],
      networking: ["reduce_sync_frequency", "batch_messages", "enable_compression", "shed_low_priority"],
      content: ["refresh_scene_content", "increase_interactivity", "spawn_new_npcs"],
      reliability: ["restart_failed_subsystems", "enable_circuit_breaker", "increase_retry_budget"]
    }
    signals_generated: 0
  }

  function generate(analysis) {
    state.generating = true

    const signals = []

    for (const cause in analysis.causes) {
      const subsystem = cause.subsystem
      const available_actions = state.action_catalog[subsystem] || []

      if (available_actions.length == 0) continue

      // Select action based on severity
      let action = available_actions[0]  // default: least aggressive
      if (cause.health == "critical") {
        // Use most aggressive action for critical issues
        action = available_actions[available_actions.length - 1]
      } else if (cause.health == "degraded") {
        // Use moderate action
        action = available_actions[min(1, available_actions.length - 1)]
      }

      // Calculate urgency: 0.0 (can wait) to 1.0 (act now)
      let urgency = 0.3
      if (cause.health == "critical") urgency = 1.0
      if (cause.health == "degraded") urgency = 0.7
      if (cause.health == "declining") urgency = 0.4

      signals.push({
        signal_id: generate_uuid(),
        subsystem: subsystem,
        metric: cause.metric,
        action: action,
        urgency: urgency,
        confidence: cause.confidence,
        probable_cause: cause.probable_cause,
        current_deviation: cause.deviation_pct,
        generated_at: current_time()
      })
    }

    state.signals_generated += signals.length
    state.generating = false

    emit("optimization_signals", {
      signals: signals,
      signal_count: signals.length,
      timestamp: current_time()
    })
  }
}

// ============================================================================
// STAGE 5: OPTIMIZER — apply adjustments based on signals
// ============================================================================

object "optimizer" {
  geometry: "capsule"
  color: "#66bb6a"
  position: { x: 6, y: 2, z: 0 }
  scale: { x: 0.4, y: 0.8, z: 0.4 }

  state {
    optimizing: false
    applied_optimizations: []
    cooldown_ms: 10000          // min time between optimizations
    last_optimization: 0
    max_concurrent: 3           // max simultaneous optimizations
  }

  function apply(signal_data) {
    // Rate limiting: don't optimize too frequently
    if (current_time() - state.last_optimization < state.cooldown_ms) {
      emit("optimization_throttled", {
        reason: "cooldown_active",
        remaining_ms: state.cooldown_ms - (current_time() - state.last_optimization)
      })
      return
    }

    state.optimizing = true
    state.last_optimization = current_time()

    // Sort signals by urgency (highest first)
    const sorted = signal_data.signals.sort((a, b) => b.urgency - a.urgency)

    // Apply up to max_concurrent optimizations
    const to_apply = sorted.slice(0, state.max_concurrent)
    const applied = []

    for (const signal in to_apply) {
      const result = execute_optimization(signal.action, signal.subsystem)

      applied.push({
        signal_id: signal.signal_id,
        action: signal.action,
        subsystem: signal.subsystem,
        success: result.success,
        applied_at: current_time(),
        previous_value: result.previous_value,
        error: result.error
      })

      state.applied_optimizations.push({
        action: signal.action,
        metric: signal.metric,
        timestamp: current_time()
      })
    }

    state.optimizing = false

    emit("optimizations_applied", {
      applied: applied,
      count: applied.length,
      timestamp: current_time()
    })
  }

  function execute_optimization(action, subsystem) {
    // Execute the actual system adjustment
    if (action == "reduce_lod") {
      return set_render_quality("lod_bias", -1)
    }
    if (action == "disable_shadows") {
      return set_render_quality("shadows", false)
    }
    if (action == "trigger_gc") {
      return system_gc()
    }
    if (action == "clear_asset_cache") {
      return clear_cache("assets")
    }
    if (action == "reduce_sync_frequency") {
      return set_network_param("sync_interval", 200)
    }
    if (action == "batch_messages") {
      return set_network_param("batch_mode", true)
    }
    if (action == "enable_circuit_breaker") {
      return set_reliability_param("circuit_breaker", true)
    }
    // Default: no-op
    return { success: true, previous_value: null }
  }

  on_error(err) {
    state.optimizing = false
    emit("optimizer_error", { error: err.message })
  }
}

// ============================================================================
// STAGE 6: VERIFICATION PROBE — measure after optimization, confirm effect
// ============================================================================

object "verification_probe" {
  geometry: "icosahedron"
  color: "#7e57c2"
  position: { x: 10, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    verifying: false
    stabilization_delay: 3000   // wait 3 seconds for changes to take effect
    improvement_threshold: 0.05 // 5% improvement counts as success
    verification_results: []
  }

  function verify(applied_data) {
    state.verifying = true

    // Wait for system to stabilize after optimization
    wait(state.stabilization_delay)

    // Re-sample metrics after optimization
    const post_metrics = {
      fps: get_system_metric("fps"),
      engagement_time: get_system_metric("engagement_time"),
      error_rate: get_system_metric("error_rate"),
      agent_response_time: get_system_metric("agent_response_time"),
      memory_usage: get_system_metric("memory_usage_mb")
    }

    const results = []

    for (const opt in applied_data.applied) {
      if (!opt.success) {
        results.push({
          action: opt.action,
          subsystem: opt.subsystem,
          verified: false,
          reason: "optimization_failed_to_apply"
        })
        continue
      }

      // Check if the targeted metric improved
      const metric_name = get_metric_for_subsystem(opt.subsystem)
      const current = post_metrics[metric_name]
      const target = get_metric_target(metric_name)

      // Did the deviation decrease?
      const new_deviation = abs(current - target) / target
      const improved = new_deviation < (1 - state.improvement_threshold)

      results.push({
        action: opt.action,
        subsystem: opt.subsystem,
        metric: metric_name,
        post_value: current,
        target: target,
        deviation_pct: new_deviation * 100,
        improved: improved,
        verified: true
      })
    }

    state.verification_results = results
    state.verifying = false

    // Feed results back into the metric sampler to close the loop
    emit("verification_complete", {
      results: results,
      improved_count: results.filter(r => r.improved).length,
      total_count: results.length,
      post_metrics: post_metrics,
      timestamp: current_time()
    })
  }

  function get_metric_for_subsystem(subsystem) {
    if (subsystem == "rendering") return "fps"
    if (subsystem == "networking") return "agent_response_time"
    if (subsystem == "memory") return "memory_usage"
    if (subsystem == "content") return "engagement_time"
    if (subsystem == "reliability") return "error_rate"
    return "fps"
  }

  function get_metric_target(metric_name) {
    const targets = {
      fps: 60,
      engagement_time: 120,
      error_rate: 0,
      agent_response_time: 500,
      memory_usage: 512
    }
    return targets[metric_name] || 0
  }
}

// ============================================================================
// CYCLE DASHBOARD — visual summary of optimization loop health
// ============================================================================

object "cycle_dashboard" {
  geometry: "cube"
  color: "#37474f"
  position: { x: 0, y: 5, z: -4 }
  scale: { x: 16, y: 2, z: 0.1 }

  state {
    cycle_count: 0
    improvements: 0
    regressions: 0
    system_health: "nominal"
  }

  function on_cycle_complete(verification) {
    state.cycle_count += 1
    state.improvements += verification.improved_count

    if (verification.improved_count == verification.total_count) {
      color = "#4caf50"
      state.system_health = "optimizing"
    } else if (verification.improved_count > 0) {
      color = "#ff9800"
      state.system_health = "partially_improved"
    } else {
      color = "#f44336"
      state.system_health = "no_improvement"
      state.regressions += 1
    }
  }

  function on_nominal(data) {
    color = "#4caf50"
    state.system_health = "nominal"
  }
}

// ============================================================================
// CONNECTIONS — wiring the feedback optimization cycle
// ============================================================================
// The pipeline forms a LOOP: sampler -> trend -> root cause -> signal ->
// optimize -> verify -> (feeds back to sampler via execute schedule)

// Stage 1 -> Stage 2: raw metrics feed into trend detection
connect metric_sampler.metrics_sampled -> trend_detector.detect

// Stage 2 -> Stage 3: degraded trends feed into root cause analysis
connect trend_detector.trends_detected -> root_cause_analyzer.analyze

// Stage 3 -> Stage 4: root causes generate optimization signals
connect root_cause_analyzer.root_causes_identified -> signal_generator.generate

// Stage 4 -> Stage 5: signals trigger actual optimizations
connect signal_generator.optimization_signals -> optimizer.apply

// Stage 5 -> Stage 6: applied optimizations trigger verification
connect optimizer.optimizations_applied -> verification_probe.verify

// Stage 6 -> Dashboard: verification results update display
connect verification_probe.verification_complete -> cycle_dashboard.on_cycle_complete

// Nominal path: when all metrics are fine, update dashboard directly
connect trend_detector.all_nominal -> cycle_dashboard.on_nominal

// ============================================================================
// EXECUTION — start the feedback loop
// ============================================================================

// Sample metrics every 5 seconds — this drives the entire cycle
execute metric_sampler.sample() every 5000ms

// The rest of the cycle is event-driven via connect statements.
// Verification completes, system stabilizes, next sample triggers again.
// This IS the feedback loop.
