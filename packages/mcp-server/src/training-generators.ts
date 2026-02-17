/**
 * training-generators.ts
 *
 * Generates Brittney v5.1 fine-tune training examples covering:
 * - New HoloScript keywords: system, component, storage, device, import/export
 * - New traits: @networked (v2), @openxr_hal, @render_network, @zora_coins, @hitl,
 *               @room_mesh, @ai_upscaling, @neural_upscaling
 * - Hololand spatial patterns: Brittney workspace, VR builder, spatial zones
 * - 9 categories × 4 difficulties = 36 buckets
 *
 * Output format: Alpaca-style { instruction, input, output } JSONL
 */

// =============================================================================
// TYPES
// =============================================================================

export type TrainingDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'production';

export type TrainingCategory =
  | 'spatial_objects'
  | 'vr_interactions'
  | 'multiplayer_networking'
  | 'web3_zora'
  | 'ai_generation'
  | 'scene_composition'
  | 'system_components'
  | 'error_correction'
  | 'edge_cases';

export interface TrainingExample {
  instruction: string;
  input: string;
  output: string;
  metadata: {
    category: TrainingCategory;
    difficulty: TrainingDifficulty;
    traits: string[];
    keywords: string[];
    version: string;
  };
}

// =============================================================================
// CATEGORY 1: SPATIAL OBJECTS — @room_mesh, @ai_upscaling, @openxr_hal
// =============================================================================

const SPATIAL_OBJECTS: TrainingExample[] = [
  // --- BEGINNER ---
  {
    instruction: 'Create a glowing orb that players can grab and throw',
    input: '',
    output: `orb "energy_orb" {
  shape: "sphere"
  radius: 0.15
  color: "#00aaff"
  @glowing { intensity: 2.0, color: "#00aaff" }
  @grabbable { haptic_feedback: true }
  @throwable { max_velocity: 20 }
  on_grab: {
    haptic.pulse(0.3, 50)
    emit("orb_grabbed", { id: self.id })
  }
}`,
    metadata: {
      category: 'spatial_objects',
      difficulty: 'beginner',
      traits: ['@glowing', '@grabbable', '@throwable'],
      keywords: ['orb'],
      version: 'v5.1',
    },
  },
  // --- INTERMEDIATE ---
  {
    instruction: 'Create an object that uses AI upscaling to enhance its texture in real-time',
    input: '',
    output: `object "detail_mesh" {
  mesh: "assets/wall_panel.glb"
  @ai_upscaling {
    upscale_model: "real_esrgan_x4"
    scale_factor: 4
    tile_size: 256
    denoise_strength: 0.3
    input_source: "texture"
    preserve_details: true
  }
  on_load: {
    emit("upscale_request", { target: self.id, priority: "high" })
  }
}`,
    metadata: {
      category: 'spatial_objects',
      difficulty: 'intermediate',
      traits: ['@ai_upscaling'],
      keywords: ['object'],
      version: 'v5.1',
    },
  },
  // --- ADVANCED ---
  {
    instruction: 'Create a room scanning system that detects walls and floors for AR placement',
    input: '',
    output: `system "room_scanner" {
  @room_mesh {
    resolution: "medium"
    update_rate: 2
    semantic_labeling: true
    room_boundary_detection: true
    physics_collider: true
    merge_adjacent_blocks: true
    visible: false
  }
  on_room_mesh_complete: {
    const floor = room_mesh.surfaces.filter(s => s.type == "floor")
    emit("scan_complete", {
      floor_area: floor[0].area,
      surface_count: room_mesh.surfaces.length
    })
  }
  on_room_boundary_detected: {
    emit("boundary_ready", { bounds: event.bounds })
  }
}`,
    metadata: {
      category: 'spatial_objects',
      difficulty: 'advanced',
      traits: ['@room_mesh'],
      keywords: ['system'],
      version: 'v5.1',
    },
  },
  // --- PRODUCTION ---
  {
    instruction:
      'Build a production-grade XR HAL system with fallback device profiles and haptic mapping',
    input: '',
    output: `system "xr_hal" {
  @openxr_hal {
    session_type: "immersive-vr"
    fallback_mode: "simulate"
    haptic_channels: ["left_controller", "right_controller", "vest"]
    tracking_mode: "inside-out"
    render_resolution_scale: 1.2
    fixed_foveation: 2
    device_overrides: {
      name: "Meta Quest 3"
      haptic_capabilities: ["rumble", "hd_haptics"]
    }
  }
  on_session_start: {
    emit("xr_ready", {
      device: xr_hal.device_profile.name,
      supports_hd_haptics: xr_hal.capabilities.hasHDHaptics
    })
    haptic.calibrate("left_controller")
    haptic.calibrate("right_controller")
  }
  on_controller_connected: {
    emit("controller_ready", { hand: event.hand, profile: event.profile })
  }
}`,
    metadata: {
      category: 'spatial_objects',
      difficulty: 'production',
      traits: ['@openxr_hal'],
      keywords: ['system'],
      version: 'v5.1',
    },
  },
];

// =============================================================================
// CATEGORY 2: VR INTERACTIONS — @grabbable, @pointable, @openxr_hal
// =============================================================================

const VR_INTERACTIONS: TrainingExample[] = [
  {
    instruction: 'Create a VR menu panel that responds to controller pointer input',
    input: '',
    output: `object "vr_menu" {
  shape: "plane"
  width: 0.6
  height: 0.4
  position: [0, 1.5, -0.8]
  @billboard { axis: "y" }
  @pointable { highlight_on_hover: true }
  @ui_panel {
    theme: "dark"
    corner_radius: 0.02
  }
  on_point_enter: {
    self.color = "#1a1a2e"
    haptic.pulse(0.1, 20)
  }
  on_point_select: {
    emit("menu_selected", { item: event.target_id })
  }
}`,
    metadata: {
      category: 'vr_interactions',
      difficulty: 'beginner',
      traits: ['@billboard', '@pointable', '@ui_panel'],
      keywords: ['object'],
      version: 'v5.1',
    },
  },
  {
    instruction: 'Build a VR whiteboard with hand tracking and drawing support',
    input: '',
    output: `object "whiteboard" {
  shape: "plane"
  width: 1.2
  height: 0.8
  position: [0, 1.4, -1.0]
  material: { color: "#f5f5f5", roughness: 1.0 }
  @pointable { precision_mode: true }
  @drawable {
    stroke_width: 0.003
    colors: ["#000000", "#ff0000", "#0000ff", "#00aa00"]
    erase_mode: false
  }
  @persistent {
    storage_key: "whiteboard_canvas"
    auto_save: true
    save_interval: 5000
  }
  on_draw_start: {
    emit("stroke_begin", { hand: event.hand, color: drawable.active_color })
  }
  on_draw_end: {
    emit("stroke_end", { path_length: event.path.length })
    self.save()
  }
}`,
    metadata: {
      category: 'vr_interactions',
      difficulty: 'intermediate',
      traits: ['@pointable', '@drawable', '@persistent'],
      keywords: ['object'],
      version: 'v5.1',
    },
  },
  {
    instruction: 'Create a VR tool belt with grabbable tools that snap back when released',
    input: '',
    output: `object "tool_belt" {
  shape: "torus"
  major_radius: 0.35
  minor_radius: 0.03
  position: [0, 0.9, 0]
  @attachable { attach_to: "player_waist", follow: true }
  @socket {
    slots: [
      { id: "hammer_slot", position: [0.2, 0, 0], accepts: ["@tool"] },
      { id: "brush_slot", position: [-0.2, 0, 0], accepts: ["@tool"] },
      { id: "scanner_slot", position: [0, 0, 0.2], accepts: ["@scanner"] }
    ]
    snap_force: 8.0
    release_distance: 0.25
  }
}

object "hammer" {
  mesh: "assets/tools/hammer.glb"
  @tool { type: "hammer", damage: 25 }
  @grabbable {
    haptic_feedback: true
    two_handed: false
    snap_to_socket: "tool_belt"
  }
  @physics { mass: 1.2, restitution: 0.3 }
  on_release: {
    if !grabbed_by_player {
      self.snap_to_nearest_slot("tool_belt")
    }
  }
}`,
    metadata: {
      category: 'vr_interactions',
      difficulty: 'advanced',
      traits: ['@attachable', '@socket', '@tool', '@grabbable', '@physics'],
      keywords: ['object'],
      version: 'v5.1',
    },
  },
  {
    instruction:
      'Build a production VR builder system where Brittney generates objects on voice command',
    input: '',
    output: `import "brittney-workspace" as brittney
import "voice-pipeline" as voice

system "vr_builder" {
  storage builder_state {
    selected_object: null
    undo_stack: []
    redo_stack: []
    grid_snap: 0.1
  }

  device xr = storage.get("xr_session")
  device mic = audio.input("default")

  on_voice_command: {
    const intent = await brittney.parse_intent(event.transcript)
    if intent.action == "create" {
      const code = await brittney.generate({
        description: intent.description,
        context: "vr_scene",
        format: "holo"
      })
      const node = runtime.inject(code)
      builder_state.undo_stack.push({ action: "create", node_id: node.id })
      emit("object_created", { id: node.id, description: intent.description })
    } else if intent.action == "delete" {
      const target = xr.gaze_target
      builder_state.undo_stack.push({ action: "delete", snapshot: target.serialize() })
      target.destroy()
    }
  }

  on_undo: {
    const last = builder_state.undo_stack.pop()
    if last {
      builder_state.redo_stack.push(last)
      runtime.undo(last)
    }
  }
}`,
    metadata: {
      category: 'vr_interactions',
      difficulty: 'production',
      traits: [],
      keywords: ['import', 'system', 'storage', 'device'],
      version: 'v5.1',
    },
  },
];

// =============================================================================
// CATEGORY 3: MULTIPLAYER NETWORKING — @networked v2
// =============================================================================

const MULTIPLAYER_NETWORKING: TrainingExample[] = [
  {
    instruction: 'Create a multiplayer orb that syncs position and color across all players',
    input: '',
    output: `orb "sync_ball" {
  shape: "sphere"
  radius: 0.12
  color: "#ff6600"
  @networked {
    mode: "owner"
    sync_properties: ["position", "rotation", "color"]
    sync_rate: 20
    interpolation: true
    channel: "unreliable"
  }
  @physics { mass: 0.5 }
  @grabbable { haptic_feedback: true }
  on_grab: {
    networked.request_ownership()
    emit("ball_grabbed", { player: event.player_id })
  }
}`,
    metadata: {
      category: 'multiplayer_networking',
      difficulty: 'beginner',
      traits: ['@networked', '@physics', '@grabbable'],
      keywords: ['orb'],
      version: 'v5.1',
    },
  },
  {
    instruction: 'Build a shared whiteboard that multiple users can draw on simultaneously',
    input: '',
    output: `object "collab_board" {
  shape: "plane"
  width: 2.0
  height: 1.2
  @networked {
    mode: "shared"
    sync_properties: ["strokes", "cursor_positions"]
    sync_rate: 30
    channel: "reliable"
    room: "whiteboard_room"
    persistence: {
      enabled: true
      storage_key: "collab_board_strokes"
      save_on_disconnect: true
    }
  }
  @drawable {
    collaborative: true
    max_concurrent_users: 8
  }
  on_stroke_added: {
    networked.broadcast("stroke", { data: event.stroke, author: event.player_id })
  }
  on_networked_stroke: {
    drawable.apply_remote_stroke(event.data, event.author)
  }
}`,
    metadata: {
      category: 'multiplayer_networking',
      difficulty: 'intermediate',
      traits: ['@networked', '@drawable'],
      keywords: ['object'],
      version: 'v5.1',
    },
  },
  {
    instruction:
      'Implement a server-authoritative player controller with lag compensation and rollback',
    input: '',
    output: `object "player_avatar" {
  mesh: "assets/characters/avatar_base.glb"
  @networked {
    mode: "server"
    sync_properties: [
      { name: "position", priority: 10, delta_compression: true, quantization_bits: 16 },
      { name: "rotation", priority: 10, delta_compression: false },
      { name: "animation_state", priority: 5, on_change_only: true },
      { name: "health", priority: 8, on_change_only: true }
    ]
    sync_rate: 60
    interpolation: {
      enabled: true
      delay: 100
      mode: "hermite"
      max_extrapolation: 200
      snap_threshold: 3.0
    }
    authority: {
      owner: null
      transferable: false
      request_timeout: 5000
    }
  }
  on_server_state: {
    const predicted = lag_compensation.predict(event.state, network.rtt)
    self.apply_state(predicted)
  }
}`,
    metadata: {
      category: 'multiplayer_networking',
      difficulty: 'advanced',
      traits: ['@networked'],
      keywords: ['object'],
      version: 'v5.1',
    },
  },
  {
    instruction: 'Build a production multiplayer VR space with room management and ownership',
    input: '',
    output: `import "network-core" as net
import "room-manager" as rooms

system "multiplayer_space" {
  storage room_state {
    players: {}
    room_id: null
    max_players: 12
    owner_id: null
  }

  device network = net.connect({
    transport: "websocket",
    url: env.NETWORK_SERVER_URL,
    reconnect: true
  })

  on_connect: {
    room_state.room_id = await rooms.join_or_create({
      max_players: room_state.max_players,
      public: true,
      region: "auto"
    })
    emit("room_joined", { room_id: room_state.room_id })
  }

  on_player_join: {
    room_state.players[event.player_id] = {
      joined_at: time.now(),
      display_name: event.display_name
    }
    if room_state.owner_id == null {
      room_state.owner_id = event.player_id
    }
    emit("player_joined", { count: Object.keys(room_state.players).length })
  }

  on_player_leave: {
    delete room_state.players[event.player_id]
    if event.player_id == room_state.owner_id {
      const next = Object.keys(room_state.players)[0]
      room_state.owner_id = next
      emit("ownership_transferred", { new_owner: next })
    }
  }
}`,
    metadata: {
      category: 'multiplayer_networking',
      difficulty: 'production',
      traits: ['@networked'],
      keywords: ['import', 'system', 'storage', 'device'],
      version: 'v5.1',
    },
  },
];

// =============================================================================
// CATEGORY 4: WEB3 / ZORA — @zora_coins
// =============================================================================

const WEB3_ZORA: TrainingExample[] = [
  {
    instruction: 'Create a collectible NFT orb that mints when a player picks it up',
    input: '',
    output: `orb "collectible_gem" {
  shape: "icosahedron"
  radius: 0.08
  material: { color: "#aa00ff", metalness: 1.0, roughness: 0.1 }
  @glowing { intensity: 1.5 }
  @grabbable { haptic_feedback: true }
  @zora_coins {
    auto_mint: true
    collection_name: "Hololand Gems"
    symbol: "HLGEM"
    chain: "base"
    distribution: "free_mint"
    max_supply: 1000
    category: "object"
    license: "cc0"
    metadata_uri: "ipfs://QmGemCollection"
  }
  on_grab: {
    emit("gem_collected", { player: event.player_id })
  }
  on_zora_minted: {
    emit("nft_minted", { tx_hash: event.tx_hash, token_id: event.token_id })
    self.destroy()
  }
}`,
    metadata: {
      category: 'web3_zora',
      difficulty: 'beginner',
      traits: ['@glowing', '@grabbable', '@zora_coins'],
      keywords: ['orb'],
      version: 'v5.1',
    },
  },
  {
    instruction: 'Build a scene gallery that mints the scene as an NFT on publish',
    input: '',
    output: `scene "vr_gallery" {
  name: "My VR Gallery"
  @zora_coins {
    auto_mint: true
    trigger: "scene_published"
    collection_name: "VR Gallery Collection"
    symbol: "VRGAL"
    chain: "zora"
    distribution: "bonding_curve"
    category: "scene"
    license: "cc-by"
    enable_bonding_curve: true
    creator_rewards: 0.1
    referral_rewards: 0.025
  }
  on_zora_minted: {
    ui.show_toast("Scene minted! Token #" + event.token_id, "success")
    emit("scene_nft_created", { url: event.explorer_url })
  }
  on_zora_price_quote: {
    ui.show_price(event.price_eth, event.price_usd)
  }
}`,
    metadata: {
      category: 'web3_zora',
      difficulty: 'intermediate',
      traits: ['@zora_coins'],
      keywords: ['scene'],
      version: 'v5.1',
    },
  },
  {
    instruction: 'Create an in-world marketplace where players mint and trade HoloScript objects',
    input: '',
    output: `system "holo_market" {
  @zora_coins {
    chain: "base"
    distribution: "bonding_curve"
    enable_bonding_curve: true
    creator_rewards: 0.1
    referral_rewards: 0.025
    royalty_percentage: 5.0
    category: "experience"
  }

  on_wallet_connected: {
    emit("wallet_ready", { address: event.wallet_address })
    zora_coins.refresh_balance()
  }

  on_list_item: {
    const code = event.item_code
    const token = await zora_coins.mint({
      name: event.item_name,
      symbol: event.item_symbol.toUpperCase(),
      metadata_uri: event.metadata_uri
    })
    emit("item_listed", { token_id: token.id, tx_hash: token.tx_hash })
  }

  on_purchase: {
    const quote = await zora_coins.get_price_quote({ token_id: event.token_id })
    if event.confirmed && quote.price_eth <= event.max_price {
      const tx = await zora_coins.buy({ token_id: event.token_id, referrer: event.referrer })
      emit("purchase_complete", { tx_hash: tx.hash })
    }
  }
}`,
    metadata: {
      category: 'web3_zora',
      difficulty: 'advanced',
      traits: ['@zora_coins'],
      keywords: ['system'],
      version: 'v5.1',
    },
  },
];

// =============================================================================
// CATEGORY 5: AI GENERATION — @ai_upscaling, @neural_upscaling, @hitl
// =============================================================================

const AI_GENERATION: TrainingExample[] = [
  {
    instruction: 'Create a system where Brittney upscales textures automatically on low-end devices',
    input: '',
    output: `system "auto_upscaler" {
  on_scene_load: {
    const device_tier = device.get_performance_tier()
    if device_tier < 2 {
      scene.find_all("@ai_upscaling").forEach(node => {
        node.ai_upscaling.input_source = "texture"
        node.ai_upscaling.scale_factor = 2
        emit("upscale_request", { node_id: node.id })
      })
    }
  }
}

object "upscalable_wall" {
  mesh: "assets/wall_low.glb"
  @ai_upscaling {
    upscale_model: "ESRGAN"
    scale_factor: 4
    tile_size: 512
    input_source: "texture"
    preserve_details: true
    apply_to_material: "wall_diffuse"
  }
  on_ai_upscaling_result: {
    emit("texture_enhanced", { node: self.id, resolution: event.output_resolution })
  }
}`,
    metadata: {
      category: 'ai_generation',
      difficulty: 'intermediate',
      traits: ['@ai_upscaling'],
      keywords: ['system', 'object'],
      version: 'v5.1',
    },
  },
  {
    instruction:
      'Build a human-in-the-loop approval system for AI-generated world changes with rollback',
    input: '',
    output: `system "hitl_guardian" {
  @hitl {
    approval_required: ["world_mutation", "player_ban", "economy_change"]
    approval_mode: "any"
    default_timeout: 30000
    notification_webhook: env.SLACK_WEBHOOK_URL
    enable_audit_log: true
    enable_rollback: true
    rollback_retention: 86400000
    risk_levels: [
      { name: "low", auto_approve: true, timeout: 5000 },
      { name: "medium", notify_channels: ["email", "push"], timeout: 30000 },
      { name: "high", notify_channels: ["email", "push", "sms"], timeout: 300000 }
    ]
  }

  on_ai_wants_to_mutate: {
    const approval = await hitl.request_approval({
      action: "world_mutation",
      description: event.description,
      changes: event.diff,
      risk: event.risk_level
    })
    if approval.approved {
      emit("mutation_approved", { changes: event.diff })
    } else {
      emit("mutation_rejected", { reason: approval.reason })
    }
  }

  on_rollback_request: {
    hitl.rollback(event.checkpoint_id)
    emit("rolled_back", { to: event.checkpoint_id })
  }
}`,
    metadata: {
      category: 'ai_generation',
      difficulty: 'advanced',
      traits: ['@hitl'],
      keywords: ['system'],
      version: 'v5.1',
    },
  },
];

// =============================================================================
// CATEGORY 6: SCENE COMPOSITION — system/component/storage/device
// =============================================================================

const SCENE_COMPOSITION: TrainingExample[] = [
  {
    instruction: 'Create a scene with named spatial groups and an ambient lighting system',
    input: '',
    output: `scene "outdoor_plaza" {
  name: "Hololand Main Plaza"
  skybox: "assets/skies/sunset.hdr"
  fog: { color: "#ff8844", density: 0.02 }

  spatial_group "fountain_area" {
    position: [0, 0, 0]

    object "fountain_base" {
      mesh: "assets/fountain/base.glb"
      @collidable
    }

    orb "water_jet" {
      shape: "sphere"
      radius: 0.05
      @particles {
        emitter: "fountain_base"
        rate: 200
        velocity: [0, 3, 0]
        spread: 0.3
        color: "#44aaff"
        lifetime: 2.0
      }
    }
  }

  environment "lighting" {
    ambient_color: "#ff8844"
    ambient_intensity: 0.4
    sun_direction: [0.3, -0.8, 0.5]
    sun_intensity: 1.2
    cast_shadows: true
  }
}`,
    metadata: {
      category: 'scene_composition',
      difficulty: 'intermediate',
      traits: ['@collidable', '@particles'],
      keywords: ['scene', 'spatial_group', 'environment'],
      version: 'v5.1',
    },
  },
  {
    instruction:
      'Build a production Hololand zone with portals, NPCs, and Brittney spatial AI integration',
    input: '',
    output: `import "hololand-core" as hololand
import "brittney-spatial" as brittney
import "npc-system" as npcs

scene "casino_zone" {
  name: "Hololand Casino"

  system "zone_manager" {
    storage zone_state {
      visitors: 0
      active_games: []
      jackpot: 0
    }

    device analytics = hololand.analytics("casino_zone")

    on_player_enter: {
      zone_state.visitors += 1
      analytics.track("zone_enter", { player: event.player_id })
      brittney.greet(event.player_id, {
        context: "casino",
        personality: "dealer"
      })
    }
  }

  spatial_group "main_floor" {
    object "slot_machines" {
      @collidable
      @pointable
      on_point_select: {
        emit("game_start", { type: "slots", player: event.player_id })
      }
    }

    npc "dealer_npc" {
      mesh: "assets/npcs/dealer.glb"
      @brittney_host {
        persona: "Vinnie the Dealer"
        knowledge_base: "casino_rules"
        voice: "mature_male"
      }
      on_user_question: {
        const response = await brittney.answer(event.question, {
          context: "casino_dealer"
        })
        self.speak(response.text)
      }
    }
  }
}`,
    metadata: {
      category: 'scene_composition',
      difficulty: 'production',
      traits: ['@collidable', '@pointable', '@brittney_host'],
      keywords: ['import', 'scene', 'system', 'storage', 'device', 'spatial_group', 'npc'],
      version: 'v5.1',
    },
  },
];

// =============================================================================
// CATEGORY 7: SYSTEM COMPONENTS — system, component, storage, device keywords
// =============================================================================

const SYSTEM_COMPONENTS: TrainingExample[] = [
  {
    instruction: 'Create a system with persistent state storage and device access',
    input: '',
    output: `system "player_preferences" {
  storage prefs {
    theme: "dark"
    language: "en"
    haptics_enabled: true
    movement_speed: 1.0
    comfort_mode: false
  }

  device haptic = xr.haptic_device("right")
  device audio = audio.output("spatial")

  on_attach: {
    const saved = storage.load("player_prefs")
    if saved {
      prefs.theme = saved.theme
      prefs.haptics_enabled = saved.haptics_enabled
      prefs.movement_speed = saved.movement_speed
    }
  }

  on_preference_change: {
    prefs[event.key] = event.value
    storage.save("player_prefs", prefs)
    if event.key == "haptics_enabled" {
      haptic.enabled = event.value
    }
  }
}`,
    metadata: {
      category: 'system_components',
      difficulty: 'beginner',
      traits: [],
      keywords: ['system', 'storage', 'device'],
      version: 'v5.1',
    },
  },
  {
    instruction:
      'Build reusable UI components for a VR HUD with health bar, minimap, and inventory',
    input: '',
    output: `component "health_bar" {
  props: {
    value: 100
    max_value: 100
    color: "#00ff44"
    danger_color: "#ff2200"
    danger_threshold: 0.25
  }

  on_tick: {
    const ratio = props.value / props.max_value
    self.fill_ratio = ratio
    self.color = ratio < props.danger_threshold ? props.danger_color : props.color
    if ratio < 0.1 {
      self.pulse(0.5, 200)
    }
  }
}

component "minimap" {
  props: {
    radius: 25.0
    show_players: true
    show_objectives: true
    rotation_lock: false
  }

  on_tick: {
    const players = scene.find_all("@player")
    minimap.update_markers(players.map(p => ({
      id: p.id,
      position: p.position,
      type: "player"
    })))
  }
}

object "vr_hud" {
  @hud { layer: "overlay", space: "head" }

  health_bar "hp" {
    value: player.health
    max_value: player.max_health
    position: [-0.2, -0.15, -0.5]
  }

  minimap "map" {
    radius: 30.0
    position: [0.2, 0.1, -0.5]
  }
}`,
    metadata: {
      category: 'system_components',
      difficulty: 'intermediate',
      traits: ['@hud'],
      keywords: ['component', 'object'],
      version: 'v5.1',
    },
  },
  {
    instruction: 'Build the Brittney spatial AI workspace from VISION_V5 spec',
    input: '',
    output: `import "vr-git" as git
import "brittney-ai" as brittney
import "xr-platform" as xr

system "brittney_workspace" {
  storage ws_state {
    active_file: null
    unsaved_changes: false
    git_branch: "main"
    ai_context: []
  }

  device mic = audio.input("vr_mic")
  device hands = xr.hand_tracking()
  device display = xr.spatial_display()

  on_voice_command: {
    ws_state.ai_context.push({ role: "user", content: event.transcript })
    const response = await brittney.chat(ws_state.ai_context, {
      tools: ["generate_hololand_training", "parse_hs", "validate_holoscript"],
      context: "vr_builder"
    })
    ws_state.ai_context.push({ role: "assistant", content: response.content })
    if response.has_code {
      display.show_code(response.code, { highlight: true })
      emit("brittney_generated", { code: response.code })
    }
  }

  on_gesture_confirm: {
    if ws_state.unsaved_changes {
      const code = display.get_current_code()
      runtime.inject(code)
      git.auto_commit(code, "Brittney VR edit: " + ws_state.active_file)
      ws_state.unsaved_changes = false
      emit("code_applied", { file: ws_state.active_file })
    }
  }
}`,
    metadata: {
      category: 'system_components',
      difficulty: 'production',
      traits: [],
      keywords: ['import', 'system', 'storage', 'device'],
      version: 'v5.1',
    },
  },
];

// =============================================================================
// CATEGORY 8: ERROR CORRECTION
// =============================================================================

const ERROR_CORRECTION: TrainingExample[] = [
  {
    instruction: 'Fix this broken HoloScript code',
    input: `orb broken {
  @networked mode: "owner"  // wrong syntax
  @grabbable
  on_grab {  // missing colon
    haptic.pulse(0.5)
  }
}`,
    output: `orb "broken" {
  @networked {
    mode: "owner"
    sync_properties: ["position", "rotation"]
    sync_rate: 20
  }
  @grabbable { haptic_feedback: true }
  on_grab: {
    haptic.pulse(0.5)
  }
}`,
    metadata: {
      category: 'error_correction',
      difficulty: 'beginner',
      traits: ['@networked', '@grabbable'],
      keywords: ['orb'],
      version: 'v5.1',
    },
  },
  {
    instruction: 'Fix the broken system that uses old-style storage syntax',
    input: `system "inventory" {
  var items = []  // wrong — should use storage
  var max_items = 50  // wrong

  device = audio.output()  // missing name

  on_item_add: {
    if items.length < max_items {  // wrong reference
      items.push(event.item)
    }
  }
}`,
    output: `system "inventory" {
  storage inv_state {
    items: []
    max_items: 50
  }

  device sfx = audio.output("ui")

  on_item_add: {
    if inv_state.items.length < inv_state.max_items {
      inv_state.items.push(event.item)
      sfx.play("pickup.wav")
      emit("item_added", { item: event.item, count: inv_state.items.length })
    } else {
      emit("inventory_full", { item: event.item })
    }
  }
}`,
    metadata: {
      category: 'error_correction',
      difficulty: 'intermediate',
      traits: [],
      keywords: ['system', 'storage', 'device'],
      version: 'v5.1',
    },
  },
];

// =============================================================================
// CATEGORY 9: EDGE CASES
// =============================================================================

const EDGE_CASES: TrainingExample[] = [
  {
    instruction: 'Create an object with all new v3.5 traits combined in one production scene',
    input: '',
    output: `import "hololand-full" as hololand

object "omni_object" {
  mesh: "assets/demo/omni_cube.glb"

  @networked {
    mode: "shared"
    sync_properties: ["position", "rotation", "state_value"]
    sync_rate: 30
    interpolation: true
  }

  @ai_upscaling {
    upscale_model: "SwinIR"
    scale_factor: 2
    input_source: "live"
    preserve_details: true
  }

  @zora_coins {
    auto_mint: false
    chain: "base"
    distribution: "bonding_curve"
    category: "object"
  }

  @grabbable { haptic_feedback: true }
  @physics { mass: 1.0 }

  on_grab: {
    networked.request_ownership()
    emit("omni_grabbed", { player: event.player_id })
  }

  on_release: {
    if !networked.is_owned_locally() {
      zora_coins.get_price_quote()
    }
  }
}`,
    metadata: {
      category: 'edge_cases',
      difficulty: 'production',
      traits: ['@networked', '@ai_upscaling', '@zora_coins', '@grabbable', '@physics'],
      keywords: ['import', 'object'],
      version: 'v5.1',
    },
  },
  {
    instruction:
      'What does the @render_network trait do and show an example of submitting a render job',
    input: '',
    output: `// @render_network connects a scene to the decentralized Render Network (RNDR)
// for distributed GPU rendering. It supports job submission, monitoring,
// credits tracking, and volumetric/splat baking jobs.

scene "cinematic_render" {
  name: "My Cinematic Scene"

  system "render_controller" {
    @render_network {
      api_key: env.RENDER_NETWORK_API_KEY
      wallet_address: env.RNDR_WALLET
      default_quality: "cinematic"
      default_engine: "octane"
      default_priority: "normal"
      output_format: "exr"
      output_destination: "ipfs"
      max_credits_per_job: 50.0
      auto_retry: true
      webhook_url: env.RENDER_WEBHOOK_URL
    }

    on_attach: {
      // Auto-connects and validates API key
      emit("render_network_ready")
    }

    on_render_request: {
      emit("submit_render_job", {
        quality: "production",
        engine: "octane",
        priority: "normal",
        frames: { start: 1, end: 240 }
      })
    }

    on_render_job_complete: {
      emit("render_done", {
        outputs: event.job.outputs,
        credits_used: event.job.actual_credits,
        gpu_hours: event.job.gpu_hours
      })
    }
  }
}`,
    metadata: {
      category: 'edge_cases',
      difficulty: 'advanced',
      traits: ['@render_network'],
      keywords: ['scene', 'system'],
      version: 'v5.1',
    },
  },
];

// =============================================================================
// EXPORT
// =============================================================================

export const ALL_TRAINING_EXAMPLES: TrainingExample[] = [
  ...SPATIAL_OBJECTS,
  ...VR_INTERACTIONS,
  ...MULTIPLAYER_NETWORKING,
  ...WEB3_ZORA,
  ...AI_GENERATION,
  ...SCENE_COMPOSITION,
  ...SYSTEM_COMPONENTS,
  ...ERROR_CORRECTION,
  ...EDGE_CASES,
];

/**
 * Generate N random variations of a base example by shuffling values.
 * Used to inflate the dataset with structurally-valid synthetic variations.
 */
export function generateVariations(
  example: TrainingExample,
  count: number
): TrainingExample[] {
  const variations: TrainingExample[] = [example];

  const colors = ['#ff4400', '#00aaff', '#44ff00', '#ffaa00', '#aa00ff', '#00ffaa'];
  const radii = [0.08, 0.10, 0.12, 0.15, 0.18, 0.20, 0.25];
  const syncRates = [10, 15, 20, 30, 60];
  const scaleFactors = [2, 3, 4];

  for (let i = 1; i < count; i++) {
    let output = example.output;

    // Rotate color
    const c = colors[i % colors.length];
    output = output.replace(/"#[0-9a-fA-F]{6}"/g, `"${c}"`);

    // Rotate radius
    output = output.replace(/radius: 0\.\d+/g, `radius: ${radii[i % radii.length]}`);

    // Rotate sync_rate
    output = output.replace(/sync_rate: \d+/g, `sync_rate: ${syncRates[i % syncRates.length]}`);

    // Rotate scale_factor
    output = output.replace(
      /scale_factor: \d/g,
      `scale_factor: ${scaleFactors[i % scaleFactors.length]}`
    );

    if (output !== example.output) {
      variations.push({
        ...example,
        output,
        metadata: { ...example.metadata },
      });
    }
  }

  return variations;
}

/**
 * Generate the full Hololand v5.1 training dataset.
 * Base: 22 canonical examples × ~4 variations each = ~88 examples.
 */
export function generateHololandDataset(variationsPerExample = 4): TrainingExample[] {
  const dataset: TrainingExample[] = [];

  for (const example of ALL_TRAINING_EXAMPLES) {
    const variants = generateVariations(example, variationsPerExample);
    dataset.push(...variants);
  }

  return dataset;
}

/**
 * Serialize a training example to Alpaca JSONL format.
 */
export function toAlpacaJsonl(example: TrainingExample): string {
  return JSON.stringify({
    instruction: example.instruction,
    input: example.input,
    output: example.output,
  });
}

/**
 * Serialize the full dataset to JSONL string.
 */
export function datasetToJsonl(examples: TrainingExample[]): string {
  return examples.map(toAlpacaJsonl).join('\n') + '\n';
}
