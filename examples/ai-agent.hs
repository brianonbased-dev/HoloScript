// AI Agent Example — Complete NPC with Behavior Tree, Dialogue, and State Machine
// Demonstrates: @ai_npc, @llm_agent, @pathfinding, @voice_input, behavior trees,
// state machines, waypoint navigation, proximity dialogue, and visual state indicators.
//
// ── Visual References ──────────────────────────────────────────────────────
// REF-1: Star Wars Imperial Sentinel / KX-Series Security Droid — tall, slender
//        bipedal frame with shoulder pauldrons, chest plate inset, narrow visor
//        strip, and visible joint rings. Silhouette: broad shoulders tapering to
//        narrow waist, cylindrical limbs with articulation points.
//        URL: https://starwars.fandom.com/wiki/KX-series_security_droid
//
// REF-2: Detroit: Become Human — CyberLife android — smooth white/chrome head
//        with triangular LED visor, ear sensor pods, chest triangle indicator.
//        Silhouette: elongated cranium, flush visor slit, slim neck.
//        URL: https://detroit-become-human.fandom.com/wiki/CyberLife
//
// ── Hard-surface design principles applied ─────────────────────────────────
// - Silhouette: recognizable sentinel from 50m — broad shoulders, narrow waist,
//   triangular visor, shoulder pauldrons, chest indicator.
// - Bevels: every panel uses a slightly inset overlay for chamfer simulation.
// - Panel lines: thin dark strips between sub-assemblies.
// - Material zones: chrome joints, matte armor plates, emissive indicator zones.
// - Surface detail: greeble strips, recessed sensor apertures, vent grilles.
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

// Ground plane — stone courtyard (octagonal for visual interest)
object "arena_floor" {
  geometry: "cylinder"
  color: "#2a2a3e"
  metallic: 0.3
  roughness: 0.8
  position: { x: 0, y: 0, z: 0 }
  scale: { x: 14, y: 0.15, z: 14 }
}

// Floor detail — inner octagonal trim ring
object "arena_floor_ring" {
  geometry: "ring"
  color: "#33334d"
  metallic: 0.4
  roughness: 0.6
  position: { x: 0, y: 0.08, z: 0 }
  scale: { x: 12, y: 12, z: 0.1 }
}

// Perimeter walls (north, south, east, west) with base detail strip
object "wall_north" {
  geometry: "cube"
  color: "#3a3a5a"
  material: "stone"
  roughness: 0.85
  metallic: 0.1
  position: { x: 0, y: 1.5, z: -7 }
  scale: { x: 14, y: 3, z: 0.3 }

  // Wall base detail strip
  object "wall_north_base" {
    geometry: "cube"
    color: "#2a2a44"
    position: { x: 0, y: -1.35, z: 0.16 }
    scale: { x: 14, y: 0.3, z: 0.04 }
  }
}

object "wall_south" {
  geometry: "cube"
  color: "#3a3a5a"
  material: "stone"
  roughness: 0.85
  metallic: 0.1
  position: { x: 0, y: 1.5, z: 7 }
  scale: { x: 14, y: 3, z: 0.3 }

  object "wall_south_base" {
    geometry: "cube"
    color: "#2a2a44"
    position: { x: 0, y: -1.35, z: -0.16 }
    scale: { x: 14, y: 0.3, z: 0.04 }
  }
}

object "wall_east" {
  geometry: "cube"
  color: "#3a3a5a"
  material: "stone"
  roughness: 0.85
  metallic: 0.1
  position: { x: 7, y: 1.5, z: 0 }
  scale: { x: 0.3, y: 3, z: 14 }

  object "wall_east_base" {
    geometry: "cube"
    color: "#2a2a44"
    position: { x: -0.16, y: -1.35, z: 0 }
    scale: { x: 0.04, y: 0.3, z: 14 }
  }
}

object "wall_west" {
  geometry: "cube"
  color: "#3a3a5a"
  material: "stone"
  roughness: 0.85
  metallic: 0.1
  position: { x: -7, y: 1.5, z: 0 }
  scale: { x: 0.3, y: 3, z: 14 }

  object "wall_west_base" {
    geometry: "cube"
    color: "#2a2a44"
    position: { x: 0.16, y: -1.35, z: 0 }
    scale: { x: 0.04, y: 0.3, z: 14 }
  }
}

// Central fountain — a landmark the agent investigates (enriched geometry)
object "fountain_base" {
  geometry: "cylinder"
  color: "#556677"
  material: "stone"
  roughness: 0.7
  metallic: 0.2
  position: { x: 0, y: 0.3, z: 0 }
  scale: { x: 1.8, y: 0.6, z: 1.8 }
}

object "fountain_rim" {
  geometry: "torus"
  color: "#667788"
  material: "stone"
  roughness: 0.6
  metallic: 0.3
  position: { x: 0, y: 0.6, z: 0 }
  scale: { x: 1.7, y: 1.7, z: 0.15 }
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

object "fountain_cap" {
  geometry: "dodecahedron"
  color: "#778899"
  material: "stone"
  roughness: 0.5
  metallic: 0.4
  position: { x: 0, y: 2.15, z: 0 }
  scale: { x: 0.25, y: 0.25, z: 0.25 }
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

// Crates near the east wall — cover / investigation point (enriched with detail strips)
object "crate_stack_1" {
  geometry: "cube"
  color: "#8b6914"
  material: "matte"
  roughness: 0.9
  metallic: 0.0
  position: { x: 5, y: 0.5, z: -3 }
  scale: { x: 1, y: 1, z: 1 }

  // Crate band detail
  object "crate_1_band" {
    geometry: "cube"
    color: "#5a4410"
    position: { x: 0, y: 0, z: 0.51 }
    scale: { x: 0.95, y: 0.08, z: 0.02 }
  }
}

object "crate_stack_2" {
  geometry: "cube"
  color: "#7a5c12"
  material: "matte"
  roughness: 0.9
  metallic: 0.0
  position: { x: 5.5, y: 0.5, z: -2 }
  scale: { x: 0.8, y: 0.8, z: 0.8 }

  object "crate_2_band" {
    geometry: "cube"
    color: "#4a3808"
    position: { x: 0, y: 0, z: 0.41 }
    scale: { x: 0.76, y: 0.06, z: 0.02 }
  }
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

// Torch lights on walls — ambient scene lighting (enriched with bracket + housing)
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

object "torch_nw_bracket" {
  geometry: "cube"
  color: "#444444"
  metallic: 0.8
  roughness: 0.3
  position: { x: -6, y: 2.3, z: -6 }
  scale: { x: 0.08, y: 0.25, z: 0.15 }
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

object "torch_ne_bracket" {
  geometry: "cube"
  color: "#444444"
  metallic: 0.8
  roughness: 0.3
  position: { x: 6, y: 2.3, z: -6 }
  scale: { x: 0.08, y: 0.25, z: 0.15 }
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

object "torch_se_bracket" {
  geometry: "cube"
  color: "#444444"
  metallic: 0.8
  roughness: 0.3
  position: { x: 6, y: 2.3, z: 6 }
  scale: { x: 0.08, y: 0.25, z: 0.15 }
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

object "torch_sw_bracket" {
  geometry: "cube"
  color: "#444444"
  metallic: 0.8
  roughness: 0.3
  position: { x: -6, y: 2.3, z: 6 }
  scale: { x: 0.08, y: 0.25, z: 0.15 }
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
//    REF-1 (KX droid): broad shoulders, narrow waist, chrome joints, pauldrons.
//    REF-2 (CyberLife): smooth cranium, triangular LED visor, ear sensor pods.
//    Traits: @ai_npc, @llm_agent, @pathfinding
// ============================================================================

// ── Agent torso — broad-shouldered inverted trapezoid (REF-1) ─────────────
object "agent_torso" {
  geometry: "cube"
  color: "#00dd77"
  material: "hologram"
  position: { x: -4, y: 1.1, z: -4 }
  scale: { x: 0.7, y: 0.8, z: 0.32 }
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

  // Chest plate inset — bevel simulation (darker recessed panel)
  object "chest_plate" {
    geometry: "cube"
    color: "#009955"
    position: { x: 0, y: 0.05, z: 0.17 }
    scale: { x: 0.5, y: 0.5, z: 0.03 }
  }

  // Chest indicator triangle — REF-2 CyberLife triangle motif
  object "chest_indicator" {
    geometry: "cone"
    color: "#00ffcc"
    material: "neon"
    glow: true
    emissive: "#00ffcc"
    emissiveIntensity: 1.5
    position: { x: 0, y: 0.05, z: 0.2 }
    scale: { x: 0.08, y: 0.1, z: 0.04 }
  }

  // Panel-line gap — horizontal torso seam
  object "torso_seam" {
    geometry: "cube"
    color: "#004422"
    position: { x: 0, y: -0.1, z: 0.17 }
    scale: { x: 0.68, y: 0.02, z: 0.02 }
  }

  // Left shoulder pauldron — REF-1 broad shoulder plate
  object "left_pauldron" {
    geometry: "dodecahedron"
    color: "#00cc66"
    material: "hologram"
    position: { x: -0.42, y: 0.3, z: 0 }
    scale: { x: 0.16, y: 0.1, z: 0.14 }
  }

  // Right shoulder pauldron
  object "right_pauldron" {
    geometry: "dodecahedron"
    color: "#00cc66"
    material: "hologram"
    position: { x: 0.42, y: 0.3, z: 0 }
    scale: { x: 0.16, y: 0.1, z: 0.14 }
  }

  // Rear vent grille — heat dissipation detail
  object "rear_vent" {
    geometry: "cube"
    color: "#003322"
    position: { x: 0, y: 0.1, z: -0.17 }
    scale: { x: 0.35, y: 0.04, z: 0.02 }
  }
}

// ── Agent waist — narrow mechanical coupling (REF-1 taper) ────────────────
object "agent_waist" {
  geometry: "cylinder"
  color: "#005533"
  material: "hologram"
  position: { x: -4, y: 0.6, z: -4 }
  scale: { x: 0.22, y: 0.2, z: 0.22 }
}

object "agent_waist_ring" {
  geometry: "ring"
  color: "#00aa55"
  metallic: 0.8
  roughness: 0.15
  position: { x: -4, y: 0.6, z: -4 }
  scale: { x: 0.18, y: 0.18, z: 0.03 }
}

// ── Agent hips — ball joints for leg articulation ─────────────────────────
object "agent_hip_left" {
  geometry: "sphere"
  color: "#008855"
  material: "hologram"
  position: { x: -4.18, y: 0.48, z: -4 }
  scale: { x: 0.12, y: 0.12, z: 0.12 }
}

object "agent_hip_right" {
  geometry: "sphere"
  color: "#008855"
  material: "hologram"
  position: { x: -3.82, y: 0.48, z: -4 }
  scale: { x: 0.12, y: 0.12, z: 0.12 }
}

// ── Agent legs — slim capsule limbs with detail ────────────────────────────
object "agent_thigh_left" {
  geometry: "capsule"
  color: "#00bb66"
  material: "hologram"
  position: { x: -4.18, y: 0.25, z: -4 }
  scale: { x: 0.08, y: 0.22, z: 0.08 }
}

object "agent_thigh_right" {
  geometry: "capsule"
  color: "#00bb66"
  material: "hologram"
  position: { x: -3.82, y: 0.25, z: -4 }
  scale: { x: 0.08, y: 0.22, z: 0.08 }
}

object "agent_knee_left" {
  geometry: "sphere"
  color: "#008855"
  metallic: 0.7
  roughness: 0.2
  position: { x: -4.18, y: 0.0, z: -4 }
  scale: { x: 0.1, y: 0.1, z: 0.1 }
}

object "agent_knee_right" {
  geometry: "sphere"
  color: "#008855"
  metallic: 0.7
  roughness: 0.2
  position: { x: -3.82, y: 0.0, z: -4 }
  scale: { x: 0.1, y: 0.1, z: 0.1 }
}

object "agent_shin_left" {
  geometry: "capsule"
  color: "#00bb66"
  material: "hologram"
  position: { x: -4.18, y: -0.28, z: -4 }
  scale: { x: 0.07, y: 0.26, z: 0.07 }
}

object "agent_shin_right" {
  geometry: "capsule"
  color: "#00bb66"
  material: "hologram"
  position: { x: -3.82, y: -0.28, z: -4 }
  scale: { x: 0.07, y: 0.26, z: 0.07 }
}

// ── Agent feet — widened stance plates ─────────────────────────────────────
object "agent_foot_left" {
  geometry: "cube"
  color: "#005533"
  material: "hologram"
  position: { x: -4.18, y: -0.58, z: -3.96 }
  scale: { x: 0.14, y: 0.06, z: 0.22 }
}

object "agent_foot_right" {
  geometry: "cube"
  color: "#005533"
  material: "hologram"
  position: { x: -3.82, y: -0.58, z: -3.96 }
  scale: { x: 0.14, y: 0.06, z: 0.22 }
}

// ── Agent head — smooth cranium with visor and ear sensors (REF-2) ────────
object "agent_head" {
  geometry: "dodecahedron"
  color: "#00ee77"
  material: "hologram"
  glow: true
  emissiveIntensity: 0.3
  position: { x: -4, y: 2.05, z: -4 }
  scale: { x: 0.38, y: 0.35, z: 0.36 }

  // Ear sensor pods — REF-2 lateral sensor arrays
  object "ear_sensor_left" {
    geometry: "capsule"
    color: "#008855"
    position: { x: -0.3, y: 0, z: 0 }
    scale: { x: 0.06, y: 0.1, z: 0.06 }
  }

  object "ear_sensor_right" {
    geometry: "capsule"
    color: "#008855"
    position: { x: 0.3, y: 0, z: 0 }
    scale: { x: 0.06, y: 0.1, z: 0.06 }
  }
}

// ── Agent visor — triangular LED strip (REF-2 CyberLife visor) ─────────────
object "agent_visor" {
  geometry: "cube"
  color: "#00ffcc"
  material: "neon"
  glow: true
  emissiveIntensity: 0.9
  position: { x: -4, y: 2.05, z: -3.8 }
  scale: { x: 0.28, y: 0.06, z: 0.05 }
  @follow_parent: { target: "agent_torso", offset: { x: 0, y: 0.95, z: 0.2 } }
  @state_color: {
    source: "agent_mood",
    mapping: {
      friendly: "#00ffcc",
      suspicious: "#ffaa00",
      hostile: "#ff2222"
    }
  }
}

// Visor brow overhang — REF-2 brow plate above eyes
object "visor_brow" {
  geometry: "cube"
  color: "#005533"
  position: { x: -4, y: 2.12, z: -3.8 }
  scale: { x: 0.32, y: 0.04, z: 0.1 }
}

// ── Agent arms — shoulder-to-hand with detail ──────────────────────────────
object "agent_shoulder_left" {
  geometry: "sphere"
  color: "#00aa55"
  metallic: 0.7
  roughness: 0.2
  position: { x: -4.42, y: 1.4, z: -4 }
  scale: { x: 0.14, y: 0.14, z: 0.14 }
}

object "agent_upper_arm_left" {
  geometry: "capsule"
  color: "#00bb66"
  material: "hologram"
  position: { x: -4.48, y: 1.1, z: -4 }
  scale: { x: 0.07, y: 0.28, z: 0.07 }
}

object "agent_elbow_left" {
  geometry: "sphere"
  color: "#008855"
  metallic: 0.7
  roughness: 0.2
  position: { x: -4.48, y: 0.82, z: -4 }
  scale: { x: 0.1, y: 0.1, z: 0.1 }
}

object "agent_forearm_left" {
  geometry: "capsule"
  color: "#00bb66"
  material: "hologram"
  position: { x: -4.48, y: 0.58, z: -4 }
  scale: { x: 0.06, y: 0.24, z: 0.06 }
}

object "agent_hand_left" {
  geometry: "cube"
  color: "#009955"
  material: "hologram"
  position: { x: -4.48, y: 0.35, z: -4 }
  scale: { x: 0.1, y: 0.07, z: 0.1 }
}

object "agent_shoulder_right" {
  geometry: "sphere"
  color: "#00aa55"
  metallic: 0.7
  roughness: 0.2
  position: { x: -3.58, y: 1.4, z: -4 }
  scale: { x: 0.14, y: 0.14, z: 0.14 }
}

object "agent_upper_arm_right" {
  geometry: "capsule"
  color: "#00bb66"
  material: "hologram"
  position: { x: -3.52, y: 1.1, z: -4 }
  scale: { x: 0.07, y: 0.28, z: 0.07 }
}

object "agent_elbow_right" {
  geometry: "sphere"
  color: "#008855"
  metallic: 0.7
  roughness: 0.2
  position: { x: -3.52, y: 0.82, z: -4 }
  scale: { x: 0.1, y: 0.1, z: 0.1 }
}

object "agent_forearm_right" {
  geometry: "capsule"
  color: "#00bb66"
  material: "hologram"
  position: { x: -3.52, y: 0.58, z: -4 }
  scale: { x: 0.06, y: 0.24, z: 0.06 }
}

object "agent_hand_right" {
  geometry: "cube"
  color: "#009955"
  material: "hologram"
  position: { x: -3.52, y: 0.35, z: -4 }
  scale: { x: 0.1, y: 0.07, z: 0.1 }
}

// ── Sensor ring — rotates around the agent, pulses faster when alert ───────
object "agent_sensor_ring" {
  geometry: "torus"
  color: "#00ff8866"
  material: "hologram"
  position: { x: -4, y: 1.5, z: -4 }
  scale: { x: 0.8, y: 0.8, z: 0.1 }
  animate: "spin"
  animSpeed: 0.3
  @follow_parent: { target: "agent_torso", offset: { x: 0, y: 0.4, z: 0 } }
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
  @follow_parent: { target: "agent_torso", offset: { x: 0, y: -0.7, z: 0 } }
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
  @follow_parent: { target: "agent_torso", offset: { x: 0, y: 1.8, z: 0 } }
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
  @follow_parent: { target: "agent_torso", offset: { x: 0, y: 1.8, z: 0 } }
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
  @follow_parent: { target: "agent_torso", offset: { x: 0, y: 0, z: 0 } }
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
          set_color: { target: "agent_torso", color: "#00dd77" },
          set_color: { target: "agent_head", color: "#00ee77" },
          set_emissive: { target: "agent_visor", color: "#00ffcc", intensity: 0.9 },
          set_anim_speed: { target: "agent_sensor_ring", speed: 0.3 }
        },
        transitions: [
          { to: "suspicious", when: "player_in_radius", radius: 6.0 }
        ]
      },
      suspicious: {
        on_enter: {
          set_color: { target: "agent_torso", color: "#ccaa00" },
          set_color: { target: "agent_head", color: "#ddbb00" },
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
          set_color: { target: "agent_torso", color: "#dd2222" },
          set_color: { target: "agent_head", color: "#ee3333" },
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
  @follow_parent: { target: "agent_torso", offset: { x: 0, y: 0, z: 0 } }
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
  @follow_parent: { target: "agent_torso", offset: { x: 0, y: 1.6, z: 0.5 } }
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
  @follow_parent: { target: "agent_torso", offset: { x: 0, y: 1.65, z: 0.55 } }
  @dialogue_text: {
    source: "agent_torso",
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
    send_to: "agent_torso",
    indicator: {
      target: "mic_indicator",
      listening_color: "#00ff88",
      processing_color: "#ffaa00"
    }
  }
}

// Microphone indicator — shows when voice input is active
object "mic_indicator" {
  geometry: "icosahedron"
  color: "#00ff88"
  material: "neon"
  glow: true
  emissiveIntensity: 0.6
  position: { x: -3.6, y: 0.7, z: -3.5 }
  scale: { x: 0.08, y: 0.08, z: 0.08 }
  visible: false
  @follow_parent: { target: "agent_torso", offset: { x: 0.4, y: -0.4, z: 0.5 } }
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
  @follow_parent: { target: "agent_torso", offset: { x: 0, y: 1.5, z: 0 } }
  @billboard: true
}

// Mood label under the name
object "mood_label" {
  text: "[FRIENDLY]"
  color: "#00ff88"
  position: { x: -4, y: 2.3, z: -4 }
  scale: { x: 0.1, y: 0.1, z: 0.1 }
  @follow_parent: { target: "agent_torso", offset: { x: 0, y: 1.3, z: 0 } }
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