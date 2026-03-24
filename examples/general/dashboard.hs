@2d_canvas {
  title: "Quantum Ops Dashboard",
  projection: "flat-semantic",
  background: @procedural_field { turbulence: 0.2, color: "#0a0a2a" }
}

@semantic_entity {
  id: "metrics-cluster",
  type: "data-cluster",
  layout: @semantic_layout { flow: "priority", alignment: "meaning-aware" },
  children: [
    @live_metric {
      stream: @reactive_stream("cpu-load", throttle: "150ms"),
      format: "percent",
      adaptive_color: true
    },
    @semantic_entity {
      type: "agent-swarm-panel",
      children: [@agent_attention { swarm_size: 8, bounty_threshold: 120 }]
    }
  ]
}

@particle_feedback { on: "bounty", type: "swarm" }

@agent_behavior("dashboard-orchestrator") {
  on: @intent("optimize-system"),
  negotiate_with: @semantic_entity("metrics-cluster"),
  apply_bounty: 200,
  trigger: @particle_feedback { type: "success" }
}
