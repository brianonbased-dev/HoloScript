@2d_canvas {
  title: "Secure HoloLogin",
  projection: "flat-semantic",
  background: @procedural_field { turbulence: 0.1 }
}

@semantic_entity {
  id: "login-form",
  type: "auth-form",
  layout: @semantic_layout { flow: "cluster" },
  children: [
    @semantic_entity { type: "username-field", intent_driven: true },
    @semantic_entity { type: "password-field", intent_driven: true },
    @semantic_entity {
      type: "submit-button",
      dynamic_visual: @dynamic_visual { color: @dynamic_hue("security") },
      particle_feedback: @particle_feedback { on: "success", type: "burst" }
    }
  ]
}

@intent_driven {
  intents: ["login", "biometric", "agent-auth"],
  handler: @hsplus_contract("auth-flow")
}

@agent_attention { swarm_size: 4, bounty_threshold: 10 }
