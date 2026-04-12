// AI Agent Example — Complete NPC with Behavior Tree, Dialogue, and State Machine
// Demonstrates: @ai_npc, @llm_agent, @pathfinding, @voice_input, behavior trees,
// state machines, waypoint navigation, proximity dialogue, and visual state indicators.
//
// Architecture Overview:
//   1. ENVIRONMENT — An enclosed arena with landmarks for the agent to navigate
//   2. WAYPOINTS — Patrol route markers the agent follows in sequence
//   3. NPC AGENT — Core entity with AI traits, behavior tree, and mood state machine
//   4. BEHAVIOR TREE — Patrol → Investigate → Engage decision hierarchy
//   5. DIALOGUE SYSTEM — Proximity-triggered conversation with voice input
//   6. VISUAL INDICATORS — Color shifts, particles, and UI that reflect agent mood

// ============================================================================
// 1. ENVIRONMENT — A small courtyard arena the agent patrols
// ============================================================================

environment {
  skybox: "twilight"
  ambient_light: 0.35
  fog_density: 0.02
  fog_color: "#1a1a2e"
}

// Ground plane — stone courtyard
object "arena_floor" {
  geometry: "cylinder"
  color: "#2a2a3e"
  metallic: 0.3
  roughness: 0.8
  position: { x: 0, y: 0, z: 0 }
  scale: { x: 14, y: 0.15, z: 14 }
}

// Perimeter walls (north, south, east, west)
object "wall_north" {
  geometry: "cube"
  color: "#3a3a5a"
  material: "stone"
  roughness: 0.85
  metallic: 0.1
  position: { x: 0, y: 1.5, z: -7 }
  scale: { x: 14, y: 3, z: 0.3 }
}

object "wall_south" {
  geometry: "cube"
  color: "#3a3a5a"
  material: "stone"
  roughness: 0.85
  metallic: 0.1
  position: { x: 0, y: 1.5, z: 7 }
  scale: { x: 14, y: 3, z: 0.3 }
}

object "wall_east" {
  geometry: "cube"
  color: "#3a3a5a"
  material: "stone"
  roughness: 0.85
  metallic: 0.1
  position: { x: 7, y: 1.5, z: 0 }
  scale: { x: 0.3, y: 3, z: 14 }
}

object "wall_west" {
  geometry: "cube"
  color: "#3a3a5a"
  material: "stone"
  roughness: 0.85
  metallic: 0.1
  position: { x: -7, y: 1.5, z: 0 }
  scale: { x: 0.3, y: 3, z: 14 }
}

// Central fountain — a landmark the agent investigates
object "fountain_base" {
  geometry: "cylinder"
  color: "#556677"
  material: "stone"
  roughness: 0.7
  metallic: 0.2
  position: { x: 0, y: 0.3, z: 0 }
  scale: { x: 1.8, y: 0.6, z: 1.8 }
}

object "fountain_pillar" {
  geometry: "cylinder"
  color: "#667788"
  material: "stone"
  roughness: 0.7
  metallic: 0.2
  position: { x: 0, y: 1.2, z: 0 }
  scale: { x: 0.3, y: 1.8, z: 0.3 }
}

object "fountain_water" {
  type: "particles"
  count: 40
  color: "#44aaff"
  emissive: "#224488"
  emissiveIntensity: 0.3
  position: { x: 0, y: 2.2, z: 0 }
  spread: 0.6
}

// Crates near the east wall — cover / investigation point
object "crate_stack_1" {
  geometry: "cube"
  color: "#8b6914"
  material: "matte"
  roughness: 0.9
  metallic: 0.0
  position: { x: 5, y: 0.5, z: -3 }
  scale: { x: 1, y: 1, z: 1 }
}

object "crate_stack_2" {
  geometry: "cube"
  color: "#7a5c12"
  material: "matte"
  roughness: 0.9
  metallic: 0.0
  position: { x: 5.5, y: 0.5, z: -2 }
  scale: { x: 0.8, y: 0.8, z: 0.8 }
}

object "crate_stack_3" {
  geometry: "cube"
  color: "#8b6914"
  material: "matte"
  roughness: 0.9
  metallic: 0.0
  position: { x: 5, y: 1.3, z: -3 }
  scale: { x: 0.7, y: 0.7, z: 0.7 }
}

// Torch lights on walls — ambient scene lighting
object "torch_nw" {
  geometry: "cone"
  color: "#ff8800"
  material: "neon"
  glow: true
  emissive: "#884400"
  emissiveIntensity: 0.8
  position: { x: -6, y: 2.5, z: -6 }
  scale: { x: 0.2, y: 0.4, z: 0.2 }
}

object "torch_ne" {
  geometry: "cone"
  color: "#ff8800"
  material: "neon"
  glow: true
  emissive: "#884400"
  emissiveIntensity: 0.8
  position: { x: 6, y: 2.5, z: -6 }
  scale: { x: 0.2, y: 0.4, z: 0.2 }
}

object "torch_se" {
  geometry: "cone"
  color: "#ff8800"
  material: "neon"
  glow: true
  emissive: "#884400"
  emissiveIntensity: 0.8
  position: { x: 6, y: 2.5, z: 6 }
  scale: { x: 0.2, y: 0.4, z: 0.2 }
}

object "torch_sw" {
  geometry: "cone"
  color: "#ff8800"
  material: "neon"
  glow: true
  emissive: "#884400"
  emissiveIntensity: 0.8
  position: { x: -6, y: 2.5, z: 6 }
  scale: { x: 0.2, y: 0.4, z: 0.2 }
}

// ============================================================================
// 2. WAYPOINTS — Patrol route markers (invisible at runtime, shown here as discs)
//    The agent walks: WP_A → WP_B → WP_C → WP_D → WP_A (loop)
// ============================================================================

object "waypoint_a" {
  geometry: "cylinder"
  color: "#00ff8844"
  material: "hologram"
  position: { x: -4, y: 0.02, z: -4 }
  scale: { x: 0.6, y: 0.02, z: 0.6 }
  @waypoint: { id: "wp_a", order: 1 }
}

object "waypoint_b" {
  geometry: "cylinder"
  color: "#00ff8844"
  material: "hologram"
  position: { x: 4, y: 0.02, z: -4 }
  scale: { x: 0.6, y: 0.02, z: 0.6 }
  @waypoint: { id: "wp_b", order: 2 }
}

object "waypoint_c" {
  geometry: "cylinder"
  color: "#00ff8844"
  material: "hologram"
  position: { x: 4, y: 0.02, z: 4 }
  scale: { x: 0.6, y: 0.02, z: 0.6 }
  @waypoint: { id: "wp_c", order: 3 }
}

object "waypoint_d" {
  geometry: "cylinder"
  color: "#00ff8844"
  material: "hologram"
  position: { x: -4, y: 0.02, z: 4 }
  scale: { x: 0.6, y: 0.02, z: 0.6 }
  @waypoint: { id: "wp_d", order: 4 }
}

// ============================================================================
// 3. NPC AGENT — The core AI entity
//    Traits: @ai_npc (base NPC behavior), @llm_agent (LLM-driven dialogue),
//    @pathfinding (A* navigation on the arena navmesh)
// ============================================================================

// Agent body — a humanoid-ish figure built from primitives
object "agent_body" {
  geometry: "capsule"
  color: "#00ff88"
  material: "hologram"
  position: { x: -4, y: 1, z: -4 }
  scale: { x: 0.5, y: 0.8, z: 0.5 }
  @ai_npc: {
    name: "Sentinel",
    role: "guardian",
    awareness_radius: 6.0,
    detection_cone: 120
  }
  @llm_agent: {
    model: "holoscript-npc-v1",
    personality: "A vigilant but fair courtyard guard. Speaks formally. Becomes curious about strangers before becoming hostile.",
    max_tokens: 150,
    temperature: 0.7
  }
  @pathfinding: {
    algorithm: "astar",
    speed: 2.0,
    turn_speed: 180,
    waypoint_route: ["wp_a", "wp_b", "wp_c", "wp_d"],
    loop: true
  }
}

// Agent head — slightly emissive to show it's an AI
object "agent_head" {
  geometry: "sphere"
  color: "#00ff88"
  material: "hologram"
  glow: true
  emissiveIntensity: 0.4
  position: { x: -4, y: 2, z: -4 }
  scale: { x: 0.35, y: 0.35, z: 0.35 }
  @follow_parent: { target: "agent_body", offset: { x: 0, y: 1, z: 0 } }
}

// Agent eye visor — color changes with mood state
object "agent_visor" {
  geometry: "cube"
  color: "#00ffcc"
  material: "neon"
  glow: true
  emissiveIntensity: 0.9
  position: { x: -4, y: 2.05, z: -3.8 }
  scale: { x: 0.3, y: 0.06, z: 0.05 }
  @follow_parent: { target: "agent_body", offset: { x: 0, y: 1.05, z: 0.2 } }
  @state_color: {
    source: "agent_mood",
    mapping: {
      friendly: "#00ffcc",
      suspicious: "#ffaa00",
      hostile: "#ff2222"
    }
  }
}

// Sensor ring — rotates around the agent, pulses faster when alert
object "agent_sensor_ring" {
  geometry: "torus"
  color: "#00ff8866"
  material: "hologram"
  position: { x: -4, y: 1.5, z: -4 }
  scale: { x: 0.8, y: 0.8, z: 0.1 }
  animate: "spin"
  animSpeed: 0.3
  @follow_parent: { target: "agent_body", offset: { x: 0, y: 0.5, z: 0 } }
  @state_anim_speed: {
    source: "agent_mood",
    mapping: { friendly: 0.3, suspicious: 1.0, hostile: 3.0 }
  }
}

// ============================================================================
// 4. BEHAVIOR TREE — Decision hierarchy
//    Priority selector: Engage > Investigate > Patrol
//    The tree runs every tick; highest-priority succeeding branch wins.
// ============================================================================

// Patrol particles — subtle trail behind the agent while walking
object "patrol_trail" {
  type: "particles"
  count: 15
  color: "#00ff8844"
  position: { x: -4, y: 0.3, z: -4 }
  spread: 0.3
  @follow_parent: { target: "agent_body", offset: { x: 0, y: -0.7, z: 0 } }
  @behavior_tree: {
    active_during: "patrol"
  }
}

// Investigation marker — appears when the agent spots something
object "investigate_marker" {
  text: "?"
  color: "#ffaa00"
  material: "neon"
  glow: true
  emissiveIntensity: 1.0
  position: { x: -4, y: 2.8, z: -4 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
  visible: false
  @follow_parent: { target: "agent_body", offset: { x: 0, y: 1.8, z: 0 } }
  animate: "float"
  animSpeed: 2.0
  animAmplitude: 0.15
  @behavior_tree: {
    show_during: "investigate",
    hide_during: ["patrol", "engage"]
  }
}

// Engage alert — red exclamation when hostile
object "engage_marker" {
  text: "!"
  color: "#ff2222"
  material: "neon"
  glow: true
  emissiveIntensity: 1.2
  position: { x: -4, y: 2.8, z: -4 }
  scale: { x: 0.35, y: 0.35, z: 0.35 }
  visible: false
  @follow_parent: { target: "agent_body", offset: { x: 0, y: 1.8, z: 0 } }
  animate: "pulse"
  animSpeed: 4.0
  @behavior_tree: {
    show_during: "engage",
    hide_during: ["patrol", "investigate"]
  }
}

// Hostile aura — red particle burst when in engage mode
object "hostile_aura" {
  type: "particles"
  count: 60
  color: "#ff2222"
  position: { x: -4, y: 1, z: -4 }
  spread: 1.2
  visible: false
  @follow_parent: { target: "agent_body", offset: { x: 0, y: 0, z: 0 } }
  @behavior_tree: {
    show_during: "engage",
    hide_during: ["patrol", "investigate"]
  }
}

// ============================================================================
// 5. STATE MACHINE — Agent Mood (friendly → suspicious → hostile)
//    Transitions:
//      friendly → suspicious : player enters awareness radius (6m)
//      suspicious → hostile   : player stays within 3m for 5 seconds
//      hostile → suspicious   : player retreats beyond 5m
//      suspicious → friendly  : no player detected for 10 seconds
// ============================================================================

object "mood_state_machine" {
  geometry: "sphere"
  color: "#00000000"
  position: { x: 0, y: -10, z: 0 }
  scale: { x: 0.01, y: 0.01, z: 0.01 }
  @state_machine: {
    id: "agent_mood",
    initial: "friendly",
    states: {
      friendly: {
        on_enter: {
          set_color: { target: "agent_body", color: "#00ff88" },
          set_emissive: { target: "agent_visor", color: "#00ffcc", intensity: 0.9 },
          set_anim_speed: { target: "agent_sensor_ring", speed: 0.3 }
        },
        transitions: [
          { to: "suspicious", when: "player_in_radius", radius: 6.0 }
        ]
      },
      suspicious: {
        on_enter: {
          set_color: { target: "agent_body", color: "#ffaa00" },
          set_emissive: { target: "agent_visor", color: "#ffaa00", intensity: 1.2 },
          set_anim_speed: { target: "agent_sensor_ring", speed: 1.0 },
          play_sound: "alert_chime"
        },
        transitions: [
          { to: "hostile", when: "player_in_radius_duration", radius: 3.0, duration: 5.0 },
          { to: "friendly", when: "no_player_duration", duration: 10.0 }
        ]
      },
      hostile: {
        on_enter: {
          set_color: { target: "agent_body", color: "#ff2222" },
          set_emissive: { target: "agent_visor", color: "#ff2222", intensity: 1.8 },
          set_anim_speed: { target: "agent_sensor_ring", speed: 3.0 },
          play_sound: "hostile_alarm"
        },
        transitions: [
          { to: "suspicious", when: "player_out_radius", radius: 5.0 }
        ]
      }
    }
  }
}

// ============================================================================
// 6. DIALOGUE SYSTEM — Triggered when player is within 2m and facing agent
//    @voice_input allows the player to speak; the LLM agent responds.
// ============================================================================

// Dialogue trigger zone — invisible proximity detector
object "dialogue_zone" {
  geometry: "sphere"
  color: "#00000000"
  position: { x: -4, y: 1, z: -4 }
  scale: { x: 2, y: 2, z: 2 }
  @follow_parent: { target: "agent_body", offset: { x: 0, y: 0, z: 0 } }
  @proximity_trigger: {
    radius: 2.0,
    on_enter: "start_dialogue",
    on_exit: "end_dialogue",
    requires_facing: true
  }
}

// Speech bubble — shows agent dialogue text
object "speech_bubble" {
  geometry: "cube"
  color: "#1a1a2ecc"
  roughness: 0.5
  metallic: 0.1
  position: { x: -4, y: 2.6, z: -3.5 }
  scale: { x: 1.8, y: 0.5, z: 0.05 }
  visible: false
  @follow_parent: { target: "agent_body", offset: { x: 0, y: 1.6, z: 0.5 } }
  @dialogue_display: {
    trigger: "start_dialogue",
    hide_on: "end_dialogue",
    font_size: 14,
    max_width: 200,
    typing_speed: 30
  }
}

// Agent dialogue text overlay
object "speech_text" {
  text: "Halt. State your business."
  color: "#ccddff"
  position: { x: -4, y: 2.65, z: -3.45 }
  scale: { x: 0.12, y: 0.12, z: 0.12 }
  visible: false
  @follow_parent: { target: "agent_body", offset: { x: 0, y: 1.65, z: 0.55 } }
  @dialogue_text: {
    source: "agent_body",
    greetings: {
      friendly: "Greetings, traveler. The courtyard is peaceful today.",
      suspicious: "Halt. State your business here.",
      hostile: "You have been warned. Leave now or face consequences."
    }
  }
}

// Voice input listener — player speaks, LLM agent processes
object "voice_listener" {
  geometry: "sphere"
  color: "#00000000"
  position: { x: 0, y: -10, z: 0 }
  scale: { x: 0.01, y: 0.01, z: 0.01 }
  @voice_input: {
    active_during: "dialogue",
    language: "en-US",
    send_to: "agent_body",
    indicator: {
      target: "mic_indicator",
      listening_color: "#00ff88",
      processing_color: "#ffaa00"
    }
  }
}

// Microphone indicator — shows when voice input is active
object "mic_indicator" {
  geometry: "sphere"
  color: "#00ff88"
  material: "neon"
  glow: true
  emissiveIntensity: 0.6
  position: { x: -4, y: 0.3, z: -3.5 }
  scale: { x: 0.08, y: 0.08, z: 0.08 }
  visible: false
  @follow_parent: { target: "agent_body", offset: { x: 0.4, y: -0.7, z: 0.5 } }
  animate: "pulse"
  animSpeed: 2.0
}

// ============================================================================
// 7. HUD — Displays agent name and current mood to the player
// ============================================================================

// Agent nameplate floating above head
object "agent_nameplate" {
  text: "Sentinel"
  color: "#aaccff"
  position: { x: -4, y: 2.5, z: -4 }
  scale: { x: 0.15, y: 0.15, z: 0.15 }
  @follow_parent: { target: "agent_body", offset: { x: 0, y: 1.5, z: 0 } }
  @billboard: true
}

// Mood label under the name
object "mood_label" {
  text: "[FRIENDLY]"
  color: "#00ff88"
  position: { x: -4, y: 2.3, z: -4 }
  scale: { x: 0.1, y: 0.1, z: 0.1 }
  @follow_parent: { target: "agent_body", offset: { x: 0, y: 1.3, z: 0 } }
  @billboard: true
  @state_text: {
    source: "agent_mood",
    mapping: {
      friendly: { text: "[FRIENDLY]", color: "#00ff88" },
      suspicious: { text: "[SUSPICIOUS]", color: "#ffaa00" },
      hostile: { text: "[HOSTILE]", color: "#ff2222" }
    }
  }
}

// ============================================================================
// Scene title
// ============================================================================

object "scene_title" {
  text: "AI AGENT DEMO"
  color: "#aaccff"
  material: "hologram"
  glow: true
  position: { x: 0, y: 4, z: -6.5 }
  scale: { x: 0.3, y: 0.3, z: 0.3 }
}

object "scene_subtitle" {
  text: "Behavior Tree + State Machine + LLM Dialogue"
  color: "#6688aa"
  position: { x: 0, y: 3.4, z: -6.5 }
  scale: { x: 0.12, y: 0.12, z: 0.12 }
}

// ============================================================================
// 8. POST-PROCESSING — Screen-space effects for visual atmosphere
// ============================================================================

post_processing {
  bloom: {
    enabled: true,
    intensity: 0.6,
    threshold: 0.7,
    radius: 0.4
  }
  tone_mapping: {
    type: "aces",
    exposure: 0.9
  }
}
