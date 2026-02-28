/**
 * HoloScript VR Traits Documentation
 *
 * Complete reference for all 49 VR traits available in HoloScript.
 * Used by CLI for `holoscript traits` command.
 */

export interface TraitInfo {
  name: string;
  category:
    | 'interaction'
    | 'physics'
    | 'visual'
    | 'networking'
    | 'behavior'
    | 'spatial'
    | 'audio'
    | 'state'
    | 'industrial';
  description: string;
  params?: Record<string, string>;
  example: string;
  requiresTraits?: string[];
}

/**
 * All 49 VR Traits organized by category
 */
export const TRAITS: Record<string, TraitInfo> = {
  // =====================================================
  // INTERACTION TRAITS (8)
  // =====================================================
  grabbable: {
    name: 'grabbable',
    category: 'interaction',
    description:
      'Makes object grabbable by VR controllers or hand tracking. Essential for interactive objects.',
    params: {
      snap_to_hand: 'If true, object snaps to hand position when grabbed (default: false)',
      two_handed: 'Requires both hands to grab (default: false)',
      grab_distance: 'Maximum distance from which object can be grabbed (default: 1.0)',
    },
    example: `orb sword {
  @grabbable(snap_to_hand: true)
  position: [0, 1, 0]
}`,
  },
  throwable: {
    name: 'throwable',
    category: 'interaction',
    description: 'Allows grabbed object to be thrown with physics. Requires @grabbable.',
    params: {
      velocity_multiplier: 'Multiplier for throw velocity (default: 1.0)',
      bounce: 'If true, object bounces on collision (default: false)',
      max_velocity: 'Maximum throw speed (default: 50)',
    },
    example: `orb ball {
  @grabbable
  @throwable(velocity_multiplier: 1.5, bounce: true)
}`,
    requiresTraits: ['grabbable'],
  },
  holdable: {
    name: 'holdable',
    category: 'interaction',
    description: 'Object can be held and used while grabbed. For tools, weapons, etc.',
    params: {
      use_action: 'Action to trigger on use (trigger press)',
      hold_position: 'Offset from hand when held',
    },
    example: `orb flashlight {
  @grabbable
  @holdable(use_action: toggle_light)
}`,
    requiresTraits: ['grabbable'],
  },
  clickable: {
    name: 'clickable',
    category: 'interaction',
    description: 'Object responds to click/point interaction.',
    params: {
      on_click: 'Handler function to call',
      highlight_on_hover: 'Visual feedback on hover (default: true)',
    },
    example: `orb button {
  @clickable(on_click: handleClick)
  color: "#ff0000"
}`,
  },
  hoverable: {
    name: 'hoverable',
    category: 'interaction',
    description: 'Triggers events when pointer hovers over object.',
    params: {
      on_enter: 'Handler for hover start',
      on_exit: 'Handler for hover end',
      highlight_color: 'Color to apply on hover',
    },
    example: `orb info_panel {
  @hoverable(on_enter: showInfo, on_exit: hideInfo)
}`,
  },
  draggable: {
    name: 'draggable',
    category: 'interaction',
    description: 'Object can be dragged along a surface or axis.',
    params: {
      axis: 'Constrain to axis: "x", "y", "z", "xy", "xz", "yz", or "free"',
      bounds: 'Min/max bounds for dragging',
    },
    example: `orb slider {
  @draggable(axis: "x", bounds: [-5, 5])
}`,
  },
  selectable: {
    name: 'selectable',
    category: 'interaction',
    description: 'Object can be selected/deselected as part of a selection group.',
    params: {
      group: 'Selection group name for mutual exclusion',
      on_select: 'Handler for selection',
    },
    example: `orb option_a {
  @selectable(group: "choices", on_select: chooseA)
}`,
  },
  focusable: {
    name: 'focusable',
    category: 'interaction',
    description: 'Object can receive focus for keyboard/controller input.',
    params: {
      tab_index: 'Order in focus navigation',
      on_focus: 'Handler for focus gained',
    },
    example: `orb input_field {
  @focusable(tab_index: 1)
}`,
  },

  // =====================================================
  // PHYSICS TRAITS (6)
  // =====================================================
  collidable: {
    name: 'collidable',
    category: 'physics',
    description: 'Enables collision detection. Objects will physically interact.',
    params: {
      layer: 'Collision layer for filtering (e.g., "player", "enemy", "terrain")',
      trigger: 'If true, triggers events but no physical collision (default: false)',
    },
    example: `orb wall {
  @collidable(layer: "solid")
  scale: [10, 3, 0.5]
}`,
  },
  physics: {
    name: 'physics',
    category: 'physics',
    description: 'Full physics simulation with gravity and forces.',
    params: {
      mass: 'Object mass in kg (default: 1)',
      friction: 'Surface friction coefficient (default: 0.5)',
      restitution: 'Bounciness 0-1 (default: 0.3)',
    },
    example: `orb crate {
  @physics(mass: 10, restitution: 0.2)
  @collidable
}`,
  },
  rigid: {
    name: 'rigid',
    category: 'physics',
    description: 'Rigid body physics - object responds to forces but maintains shape.',
    params: {
      angular_damping: 'Rotation slowdown (default: 0.1)',
      linear_damping: 'Movement slowdown (default: 0.1)',
    },
    example: `orb bowling_ball {
  @rigid(angular_damping: 0.05)
  @physics(mass: 5)
}`,
  },
  kinematic: {
    name: 'kinematic',
    category: 'physics',
    description: 'Object moves via code but affects physics objects. Not affected by forces.',
    example: `orb moving_platform {
  @kinematic
  @collidable
}`,
  },
  trigger: {
    name: 'trigger',
    category: 'physics',
    description: 'Collision zone that triggers events without physical collision.',
    params: {
      on_enter: 'Handler when object enters',
      on_exit: 'Handler when object exits',
      filter_layer: 'Only trigger for specific layers',
    },
    example: `orb checkpoint {
  @trigger(on_enter: saveProgress)
  scale: [5, 5, 5]
}`,
  },
  gravity: {
    name: 'gravity',
    category: 'physics',
    description: 'Custom gravity settings for this object.',
    params: {
      strength: 'Gravity multiplier (default: 1)',
      direction: 'Custom gravity direction [x, y, z]',
    },
    example: `orb moon_rock {
  @gravity(strength: 0.16)
  @physics
}`,
  },

  // =====================================================
  // VISUAL TRAITS (8)
  // =====================================================
  glowing: {
    name: 'glowing',
    category: 'visual',
    description: 'Object emits a glow effect.',
    params: {
      color: 'Glow color (default: object color)',
      intensity: 'Glow brightness (default: 1)',
      radius: 'Glow spread distance (default: 0.5)',
    },
    example: `orb magic_orb {
  @glowing(color: "#00ffff", intensity: 2)
  color: "#0088ff"
}`,
  },
  emissive: {
    name: 'emissive',
    category: 'visual',
    description: 'Object appears to emit light (affects scene lighting).',
    params: {
      color: 'Emission color',
      power: 'Light power in watts (default: 10)',
    },
    example: `orb lamp {
  @emissive(color: "#ffffcc", power: 50)
}`,
  },
  transparent: {
    name: 'transparent',
    category: 'visual',
    description: 'Object has transparency.',
    params: {
      opacity: 'Opacity 0-1 (default: 0.5)',
      mode: '"blend", "additive", or "multiply"',
    },
    example: `orb ghost {
  @transparent(opacity: 0.3)
  color: "#ffffff"
}`,
  },
  reflective: {
    name: 'reflective',
    category: 'visual',
    description: 'Object has reflective surface.',
    params: {
      roughness: 'Surface roughness 0-1 (default: 0.1)',
      metalness: 'Metal-like appearance 0-1 (default: 0.9)',
    },
    example: `orb mirror_ball {
  @reflective(roughness: 0, metalness: 1)
}`,
  },
  animated: {
    name: 'animated',
    category: 'visual',
    description: 'Object plays animations from model.',
    params: {
      clip: 'Animation clip name',
      loop: 'Loop animation (default: true)',
      speed: 'Playback speed multiplier (default: 1)',
    },
    example: `orb character {
  @animated(clip: "idle", loop: true)
  model: "character.glb"
}`,
  },
  billboard: {
    name: 'billboard',
    category: 'visual',
    description: 'Object always faces the camera/player.',
    params: {
      axis: 'Lock rotation axis: "y", "full", or "none"',
    },
    example: `orb npc_name {
  @billboard(axis: "y")
  text: "Shopkeeper"
}`,
  },
  outline: {
    name: 'outline',
    category: 'visual',
    description: 'Renders an outline around the object.',
    params: {
      color: 'Outline color',
      thickness: 'Outline thickness (default: 2)',
    },
    example: `orb selected_item {
  @outline(color: "#ffff00", thickness: 3)
}`,
  },
  particle_emitter: {
    name: 'particle_emitter',
    category: 'visual',
    description: 'Object emits particles.',
    params: {
      type: 'Particle preset: "fire", "smoke", "sparkle", "rain", "snow"',
      rate: 'Particles per second (default: 10)',
      lifetime: 'Particle lifetime in seconds (default: 2)',
    },
    example: `orb torch {
  @particle_emitter(type: "fire", rate: 50)
}`,
  },

  // =====================================================
  // NETWORKING TRAITS (5)
  // =====================================================
  networked: {
    name: 'networked',
    category: 'networking',
    description: 'Object state is synchronized across all connected clients.',
    params: {
      sync_rate: 'Updates per second (default: 20)',
      interpolation: 'Smooth movement between updates (default: true)',
    },
    example: `orb shared_ball {
  @networked(sync_rate: 30)
  @grabbable
}`,
  },
  synced: {
    name: 'synced',
    category: 'networking',
    description: 'Specific properties are synced across network.',
    params: {
      properties: 'Array of property names to sync',
    },
    example: `orb scoreboard {
  @synced(properties: ["score", "player_name"])
  state { score: 0 }
}`,
  },
  persistent: {
    name: 'persistent',
    category: 'networking',
    description: 'Object state persists across sessions (saved to server).',
    params: {
      save_interval: 'Seconds between auto-saves (default: 30)',
    },
    example: `orb player_house {
  @persistent(save_interval: 60)
}`,
  },
  owned: {
    name: 'owned',
    category: 'networking',
    description: 'Object has a specific owner who has authority.',
    params: {
      transfer_on_grab: 'Ownership transfers when grabbed (default: true)',
    },
    example: `orb player_weapon {
  @owned(transfer_on_grab: true)
  @grabbable
}`,
  },
  host_only: {
    name: 'host_only',
    category: 'networking',
    description: 'Object only exists on host/server, not synced to clients.',
    example: `orb game_manager {
  @host_only
  state { game_phase: "waiting" }
}`,
  },

  // =====================================================
  // BEHAVIOR TRAITS (6)
  // =====================================================
  stackable: {
    name: 'stackable',
    category: 'behavior',
    description: 'Objects can stack on top of each other.',
    params: {
      max_stack: 'Maximum items in stack (default: 64)',
      stack_offset: 'Vertical offset per item',
    },
    example: `orb coin {
  @stackable(max_stack: 100)
  @grabbable
}`,
  },
  attachable: {
    name: 'attachable',
    category: 'behavior',
    description: 'Object can attach to other objects or surfaces.',
    params: {
      attach_to: 'Types of objects/surfaces to attach to',
      snap_points: 'Defined attachment points',
    },
    example: `orb magnet {
  @attachable(attach_to: ["metal"])
}`,
  },
  equippable: {
    name: 'equippable',
    category: 'behavior',
    description: 'Object can be equipped to a slot (hand, head, body, etc).',
    params: {
      slot: 'Equipment slot: "left_hand", "right_hand", "head", "body"',
      on_equip: 'Handler when equipped',
    },
    example: `orb helmet {
  @equippable(slot: "head", on_equip: applyArmor)
}`,
  },
  consumable: {
    name: 'consumable',
    category: 'behavior',
    description: 'Object can be consumed/used up.',
    params: {
      uses: 'Number of uses before consumed (default: 1)',
      on_consume: 'Handler when consumed',
    },
    example: `orb potion {
  @consumable(uses: 1, on_consume: heal)
  @grabbable
}`,
  },
  destructible: {
    name: 'destructible',
    category: 'behavior',
    description: 'Object can be destroyed, optionally spawning debris.',
    params: {
      health: 'Hit points (default: 100)',
      debris: 'Model to spawn as debris',
      on_destroy: 'Handler when destroyed',
    },
    example: `orb crate {
  @destructible(health: 50, debris: "crate_debris.glb")
  @collidable
}`,
  },
  spawner: {
    name: 'spawner',
    category: 'behavior',
    description: 'Object spawns other objects periodically.',
    params: {
      template: 'Template name to spawn',
      interval: 'Seconds between spawns',
      max_spawned: 'Maximum active spawned objects',
    },
    example: `orb enemy_spawner {
  @spawner(template: "Goblin", interval: 30, max_spawned: 5)
}`,
  },

  // =====================================================
  // SPATIAL TRAITS (7)
  // =====================================================
  anchor: {
    name: 'anchor',
    category: 'spatial',
    description: 'Object is anchored to real-world position (AR).',
    params: {
      type: '"plane", "image", "face", or "world"',
      persist: 'Save anchor across sessions (default: false)',
    },
    example: `orb ar_decoration {
  @anchor(type: "plane", persist: true)
}`,
  },
  tracked: {
    name: 'tracked',
    category: 'spatial',
    description: 'Object follows a tracked target (controller, hand, etc).',
    params: {
      target: '"left_hand", "right_hand", "head", "controller"',
      offset: 'Position offset from target',
    },
    example: `orb wrist_menu {
  @tracked(target: "left_hand", offset: [0, 0.1, 0])
}`,
  },
  world_locked: {
    name: 'world_locked',
    category: 'spatial',
    description: 'Object stays fixed in world space regardless of user movement.',
    example: `orb compass {
  @world_locked
  position: [0, 100, 0]
}`,
  },
  hand_tracked: {
    name: 'hand_tracked',
    category: 'spatial',
    description: 'Object responds to hand tracking gestures.',
    params: {
      gestures: 'Array of recognized gestures',
      on_gesture: 'Handler for gesture events',
    },
    example: `orb magic_effect {
  @hand_tracked(gestures: ["pinch", "point", "fist"])
}`,
  },
  eye_tracked: {
    name: 'eye_tracked',
    category: 'spatial',
    description: 'Object responds to eye tracking (gaze).',
    params: {
      dwell_time: 'Seconds of gaze to trigger action',
      on_gaze: 'Handler for gaze events',
    },
    example: `orb gaze_button {
  @eye_tracked(dwell_time: 1.5, on_gaze: activate)
}`,
  },
  bounds: {
    name: 'bounds',
    category: 'spatial',
    description: 'Object defines a boundary region.',
    params: {
      shape: '"box", "sphere", or "custom"',
      on_exit: 'Handler when player exits bounds',
    },
    example: `orb play_area {
  @bounds(shape: "box", on_exit: warnPlayer)
  scale: [10, 5, 10]
}`,
  },
  portal: {
    name: 'portal',
    category: 'spatial',
    description: 'Object acts as a portal to another location or world.',
    params: {
      destination: 'Target position, world ID, or URL',
      preview: 'Show preview of destination (default: true)',
    },
    example: `orb world_gate {
  @portal(destination: "world://dungeon", preview: true)
}`,
  },

  // =====================================================
  // AUDIO TRAITS (4)
  // =====================================================
  spatial_audio: {
    name: 'spatial_audio',
    category: 'audio',
    description: 'Object emits 3D positional audio.',
    params: {
      source: 'Audio file or stream URL',
      volume: 'Volume 0-1 (default: 1)',
      range: 'Maximum hearing distance (default: 10)',
      loop: 'Loop audio (default: false)',
    },
    example: `orb radio {
  @spatial_audio(source: "music.mp3", loop: true, range: 20)
}`,
  },
  ambient: {
    name: 'ambient',
    category: 'audio',
    description: 'Object contributes to ambient soundscape.',
    params: {
      sound: 'Ambient sound type or file',
      blend_radius: 'Distance for volume blending',
    },
    example: `orb forest_zone {
  @ambient(sound: "forest_birds.mp3", blend_radius: 30)
}`,
  },
  voice_activated: {
    name: 'voice_activated',
    category: 'audio',
    description: 'Object responds to voice commands.',
    params: {
      commands: 'Array of recognized voice commands',
      on_command: 'Handler for voice events',
    },
    example: `orb assistant {
  @voice_activated(commands: ["help", "inventory", "map"])
}`,
  },
  audio_reactive: {
    name: 'audio_reactive',
    category: 'audio',
    description: 'Object reacts to audio input (music visualization).',
    params: {
      source: 'Audio source to react to',
      property: 'Property to modulate (scale, color, etc)',
    },
    example: `orb visualizer {
  @audio_reactive(source: "microphone", property: "scale")
}`,
  },

  // =====================================================
  // STATE TRAITS (5)
  // =====================================================
  state: {
    name: 'state',
    category: 'state',
    description: 'Object has internal state that can be read/modified.',
    example: `orb counter {
  @state
  state { count: 0, active: true }
}`,
  },
  reactive: {
    name: 'reactive',
    category: 'state',
    description: 'Object automatically updates when state changes.',
    params: {
      watch: 'Properties to watch for changes',
    },
    example: `orb health_bar {
  @reactive(watch: ["player.health"])
  state { width: 100 }
}`,
  },
  observable: {
    name: 'observable',
    category: 'state',
    description: 'Other objects can subscribe to state changes.',
    example: `orb game_state {
  @observable
  state { level: 1, score: 0 }
}`,
  },
  computed: {
    name: 'computed',
    category: 'state',
    description: 'Object has computed properties derived from state.',
    params: {
      properties: 'Map of computed property definitions',
    },
    example: `orb stats {
  @computed(properties: { total: "attack + defense" })
  state { attack: 10, defense: 5 }
}`,
  },
  timed: {
    name: 'timed',
    category: 'state',
    description: 'Object has time-based state transitions.',
    params: {
      duration: 'Time in seconds for state change',
      on_timeout: 'Handler when time expires',
    },
    example: `orb power_up {
  @timed(duration: 10, on_timeout: expire)
  state { active: true }
}`,
  },

  // =====================================================
  // INDUSTRIAL / IoT TRAITS (6)
  // =====================================================
  conveyor_belt: {
    name: 'conveyor_belt',
    category: 'industrial',
    description: 'Animated conveyor belt that transports physics objects along a direction.',
    params: {
      speed: 'Belt speed in m/s (default: 1.0)',
      direction: 'Transport axis: "x", "y", or "z" (default: "x")',
    },
    example: `object "MainBelt" {
  @conveyor_belt(speed: 2, direction: "x")
  @size(10, 0.5, 2)
}`,
  },
  robot_arm: {
    name: 'robot_arm',
    category: 'industrial',
    description: 'Articulated robotic arm with configurable degrees of freedom and reach.',
    params: {
      dof: 'Degrees of freedom / joints (default: 6)',
      reach: 'Maximum reach in meters (default: 1.0)',
    },
    example: `object "PickPlace" {
  @robot_arm(dof: 6, reach: 1.2)
  @sensor(type: "proximity")
}`,
  },
  safety_fence: {
    name: 'safety_fence',
    category: 'industrial',
    description: 'Safety barrier / fence for industrial exclusion zones.',
    params: {
      height: 'Fence height in meters (default: 2)',
      color: 'Fence color hex (default: "#ff6600")',
    },
    example: `object "Perimeter" {
  @safety_fence(height: 2.5, color: "#ffcc00")
  @position(0, 0, 10)
}`,
  },
  sensor: {
    name: 'sensor',
    category: 'industrial',
    description: 'IoT sensor that emits telemetry data. Supports multiple sensor types.',
    params: {
      type: 'Sensor type: "proximity", "temp", "pressure", "camera", "gas", "particle", "counter", "airflow"',
    },
    example: `object "TempProbe" {
  @sensor(type: "temp")
  @real_time_data
}`,
  },
  emergency_stop: {
    name: 'emergency_stop',
    category: 'industrial',
    description: 'Emergency stop button that halts all equipment within a radius.',
    params: {
      radius: 'Effect radius in meters (default: 5)',
    },
    example: `object "EStop" {
  @emergency_stop(radius: 10)
  @interactive
}`,
  },
  process_time: {
    name: 'process_time',
    category: 'industrial',
    description: 'Processing time for a work station, used in throughput simulation.',
    params: {
      seconds: 'Processing time per item in seconds',
    },
    example: `object "AssemblyStation" {
  @process_time(30)
  @sensor(type: "counter")
}`,
  },
};

/**
 * Get traits by category
 */
export function getTraitsByCategory(category: TraitInfo['category']): TraitInfo[] {
  return Object.values(TRAITS).filter((t) => t.category === category);
}

/**
 * Get all categories with counts
 */
export function getCategories(): Array<{ name: string; count: number }> {
  const categories: Record<string, number> = {};
  for (const trait of Object.values(TRAITS)) {
    categories[trait.category] = (categories[trait.category] || 0) + 1;
  }
  return Object.entries(categories).map(([name, count]) => ({ name, count }));
}

/**
 * Format trait for CLI output
 */
export function formatTrait(trait: TraitInfo, verbose: boolean = false): string {
  const lines: string[] = [];

  lines.push(`\x1b[36m@${trait.name}\x1b[0m \x1b[2m(${trait.category})\x1b[0m`);
  lines.push(`  ${trait.description}`);

  if (verbose && trait.params) {
    lines.push('  \x1b[33mParameters:\x1b[0m');
    for (const [param, desc] of Object.entries(trait.params)) {
      lines.push(`    ${param}: ${desc}`);
    }
  }

  if (verbose && trait.requiresTraits) {
    lines.push(`  \x1b[33mRequires:\x1b[0m ${trait.requiresTraits.map((t) => `@${t}`).join(', ')}`);
  }

  if (verbose) {
    lines.push('  \x1b[33mExample:\x1b[0m');
    lines.push(
      trait.example
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n')
    );
  }

  return lines.join('\n');
}

/**
 * Format all traits for CLI output
 */
export function formatAllTraits(verbose: boolean = false, json: boolean = false): string {
  if (json) {
    return JSON.stringify(TRAITS, null, 2);
  }

  const categories = getCategories();
  const lines: string[] = [];

  lines.push(`\n\x1b[1mHoloScript VR Traits\x1b[0m (${Object.keys(TRAITS).length} total)\n`);

  for (const { name, count } of categories) {
    lines.push(`\x1b[1m${name.toUpperCase()}\x1b[0m (${count})`);
    const traits = getTraitsByCategory(name as TraitInfo['category']);
    for (const trait of traits) {
      lines.push(formatTrait(trait, verbose));
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Suggest traits based on object description
 */
export async function suggestTraits(description: string): Promise<TraitInfo[]> {
  const desc = description.toLowerCase();
  const suggested: TraitInfo[] = [];

  // Try AI-assisted search if adapter available
  const { getDefaultAIAdapter } = await import('@holoscript/core');
  const adapter = getDefaultAIAdapter();

  if (adapter && adapter.getEmbeddings) {
    try {
      const { SemanticSearchService } = await import('@holoscript/core');
      const traitList = Object.values(TRAITS);
      const searchService = new SemanticSearchService(adapter, traitList);

      await searchService.initialize();
      const aiResults = await searchService.search(description, 5);

      return aiResults.map((r) => r.item);
    } catch (e) {
      console.warn(
        `\x1b[2m[AI Search Failed: ${(e as Error).message}. Falling back to keywords...]\x1b[0m`
      );
    }
  }

  // Keyword matching (Fallback)
  const keywords: Record<string, string[]> = {
    grabbable: ['grab', 'pick up', 'hold', 'carry', 'interactive', 'hand'],
    throwable: ['throw', 'toss', 'ball', 'projectile'],
    physics: ['physics', 'fall', 'gravity', 'realistic', 'bounce'],
    collidable: ['solid', 'wall', 'floor', 'collision', 'block'],
    glowing: ['glow', 'shine', 'light', 'bright', 'luminous', 'magic'],
    networked: ['multiplayer', 'sync', 'shared', 'network', 'online'],
    clickable: ['click', 'button', 'press', 'interact'],
    animated: ['animate', 'move', 'character', 'creature', 'npc'],
    spatial_audio: ['sound', 'audio', 'music', 'speaker'],
    transparent: ['transparent', 'glass', 'ghost', 'see-through'],
    destructible: ['destroy', 'break', 'smash', 'health'],
    equippable: ['equip', 'wear', 'weapon', 'armor', 'tool'],
    consumable: ['consume', 'eat', 'drink', 'potion', 'health'],
    portal: ['portal', 'teleport', 'door', 'gate', 'travel'],
    conveyor_belt: ['conveyor', 'belt', 'transport', 'assembly line', 'production line'],
    robot_arm: ['robot', 'arm', 'pick and place', 'articulated', 'manipulator'],
    safety_fence: ['fence', 'barrier', 'safety', 'exclusion', 'perimeter'],
    sensor: ['sensor', 'iot', 'telemetry', 'monitor', 'detector', 'probe'],
    emergency_stop: ['emergency', 'stop', 'e-stop', 'halt', 'shutdown'],
    process_time: ['process', 'throughput', 'station', 'manufacturing', 'production'],
  };

  for (const [traitName, words] of Object.entries(keywords)) {
    if (words.some((word) => desc.includes(word))) {
      if (TRAITS[traitName]) {
        suggested.push(TRAITS[traitName]);
      }
    }
  }

  // Common combinations
  if (suggested.some((t) => t.name === 'grabbable')) {
    if (!suggested.some((t) => t.name === 'collidable')) {
      suggested.push(TRAITS.collidable);
    }
  }

  if (suggested.some((t) => t.name === 'physics')) {
    if (!suggested.some((t) => t.name === 'collidable')) {
      suggested.push(TRAITS.collidable);
    }
  }

  return suggested;
}
