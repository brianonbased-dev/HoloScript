/**
 * HoloScript Documentation Database
 *
 * Comprehensive documentation for traits, syntax, and examples.
 */

// === TRAIT DOCUMENTATION ===

export const TRAIT_DOCS: Record<string, TraitDoc> = {
  // Interaction Traits
  '@grabbable': {
    name: '@grabbable',
    category: 'interaction',
    description:
      'Allows the object to be picked up by the user in VR/AR. When grabbed, the object follows the controller.',
    parameters: [
      {
        name: 'snap_to_hand',
        type: 'boolean',
        default: 'false',
        description: 'Snap object to hand when grabbed',
      },
      {
        name: 'two_handed',
        type: 'boolean',
        default: 'false',
        description: 'Require two hands to grab',
      },
      {
        name: 'highlight',
        type: 'boolean',
        default: 'true',
        description: 'Highlight when in grab range',
      },
    ],
    events: ['onGrab', 'onRelease', 'onGrabStart', 'onGrabEnd'],
    example: `orb Sword @grabbable(snap_to_hand: true) {
  geometry: "model/sword.glb"
  onGrab: { haptic.feedback('medium') }
  onRelease: { audio.play('drop.mp3') }
}`,
    relatedTraits: ['@throwable', '@holdable', '@equippable'],
  },

  '@throwable': {
    name: '@throwable',
    category: 'interaction',
    description: 'Allows the object to be thrown with physics. Requires @grabbable.',
    parameters: [
      {
        name: 'velocity_multiplier',
        type: 'number',
        default: '1.0',
        description: 'Multiplier for throw velocity',
      },
      { name: 'bounce', type: 'boolean', default: 'true', description: 'Bounce on impact' },
    ],
    events: ['onThrow', 'onLand'],
    example: `orb Ball @grabbable @throwable(velocity_multiplier: 1.5) {
  geometry: "sphere"
  physics: { mass: 0.5, restitution: 0.8 }
}`,
    relatedTraits: ['@grabbable', '@collidable', '@physics'],
  },

  '@holdable': {
    name: '@holdable',
    category: 'interaction',
    description: 'Object can be held without physics simulation (stays in hand exactly).',
    parameters: [
      {
        name: 'offset',
        type: 'array',
        default: '[0, 0, 0]',
        description: 'Position offset when held',
      },
      {
        name: 'rotation',
        type: 'array',
        default: '[0, 0, 0]',
        description: 'Rotation offset when held',
      },
    ],
    events: ['onHold', 'onDrop'],
    example: `orb Flashlight @grabbable @holdable(offset: [0, 0, -0.1]) {
  geometry: "cylinder"
  light: { type: "spot", intensity: 1.0 }
}`,
    relatedTraits: ['@grabbable', '@equippable'],
  },

  '@clickable': {
    name: '@clickable',
    category: 'interaction',
    description: 'Object responds to click/tap events in VR controllers or touch.',
    parameters: [
      { name: 'highlight', type: 'boolean', default: 'true', description: 'Highlight on hover' },
      { name: 'debounce', type: 'number', default: '200', description: 'Debounce time in ms' },
    ],
    events: ['onClick', 'onDoubleClick', 'onLongPress'],
    example: `orb Button @clickable {
  geometry: "cube"
  scale: [0.2, 0.1, 0.2]
  onClick: { door.open() }
}`,
    relatedTraits: ['@pointable', '@hoverable'],
  },

  '@hoverable': {
    name: '@hoverable',
    category: 'interaction',
    description: 'Object responds to hover/point events.',
    parameters: [
      {
        name: 'highlight_color',
        type: 'string',
        default: '#ffffff',
        description: 'Color when hovered',
      },
    ],
    events: ['onHoverEnter', 'onHoverExit', 'onHover'],
    example: `orb InfoPanel @hoverable {
  geometry: "plane"
  onHoverEnter: { this.opacity = 1.0 }
  onHoverExit: { this.opacity = 0.5 }
}`,
    relatedTraits: ['@clickable', '@pointable'],
  },

  '@draggable': {
    name: '@draggable',
    category: 'interaction',
    description: 'Object can be dragged (moved while clicking/holding).',
    parameters: [
      {
        name: 'axis',
        type: 'string',
        default: 'all',
        description: 'Constrain to axis: x, y, z, xy, xz, yz, all',
      },
      { name: 'bounds', type: 'object', description: 'Movement bounds' },
    ],
    events: ['onDragStart', 'onDrag', 'onDragEnd'],
    example: `orb Slider @draggable(axis: "x", bounds: { min: -1, max: 1 }) {
  geometry: "sphere"
  scale: [0.2, 0.2, 0.2]
  onDrag: { volume.set(this.position.x) }
}`,
    relatedTraits: ['@grabbable'],
  },

  '@pointable': {
    name: '@pointable',
    category: 'interaction',
    description: 'Object can be pointed at with ray casting.',
    parameters: [
      { name: 'ray_visible', type: 'boolean', default: 'true', description: 'Show pointing ray' },
    ],
    events: ['onPoint', 'onPointEnter', 'onPointExit'],
    example: `orb TeleportPad @pointable {
  geometry: "cylinder"
  scale: [0.5, 0.1, 0.5]
  onPoint: { player.teleportTo(this.position) }
}`,
    relatedTraits: ['@clickable', '@hoverable'],
  },

  '@scalable': {
    name: '@scalable',
    category: 'interaction',
    description: 'Object can be scaled with pinch gesture.',
    parameters: [
      { name: 'min_scale', type: 'number', default: '0.1', description: 'Minimum scale' },
      { name: 'max_scale', type: 'number', default: '10', description: 'Maximum scale' },
      { name: 'uniform', type: 'boolean', default: 'true', description: 'Uniform scaling only' },
    ],
    events: ['onScaleStart', 'onScale', 'onScaleEnd'],
    example: `orb Model @grabbable @scalable(min_scale: 0.5, max_scale: 3) {
  geometry: "model/sculpture.glb"
}`,
    relatedTraits: ['@grabbable', '@draggable'],
  },

  // Physics Traits
  '@collidable': {
    name: '@collidable',
    category: 'physics',
    description: 'Object participates in collision detection.',
    parameters: [
      { name: 'layer', type: 'string', default: 'default', description: 'Collision layer' },
      { name: 'mask', type: 'array', description: 'Layers to collide with' },
    ],
    events: ['onCollisionEnter', 'onCollisionExit', 'onCollision'],
    example: `orb Wall @collidable {
  geometry: "cube"
  scale: [5, 3, 0.2]
  physics: { type: "static" }
}`,
    relatedTraits: ['@physics', '@trigger'],
  },

  '@physics': {
    name: '@physics',
    category: 'physics',
    description: 'Object has full physics simulation (mass, velocity, forces).',
    parameters: [
      {
        name: 'type',
        type: 'string',
        default: 'dynamic',
        description: 'Physics body type: dynamic, kinematic, static',
      },
      { name: 'mass', type: 'number', default: '1', description: 'Mass in kg' },
      { name: 'friction', type: 'number', default: '0.5', description: 'Surface friction' },
      { name: 'restitution', type: 'number', default: '0.3', description: 'Bounciness (0-1)' },
    ],
    events: ['onSleep', 'onWake'],
    example: `orb Crate @physics(mass: 10, restitution: 0.2) @collidable {
  geometry: "cube"
  physics: { type: "dynamic" }
}`,
    relatedTraits: ['@collidable', '@gravity'],
  },

  '@rigid': {
    name: '@rigid',
    category: 'physics',
    description: 'Object is a rigid body (non-deformable physics object).',
    parameters: [],
    events: [],
    example: `orb Table @rigid @collidable {
  geometry: "model/table.glb"
  physics: { type: "kinematic" }
}`,
    relatedTraits: ['@physics', '@kinematic'],
  },

  '@kinematic': {
    name: '@kinematic',
    category: 'physics',
    description: 'Object moves via code but affects other physics objects.',
    parameters: [],
    events: [],
    example: `orb Elevator @kinematic @collidable {
  geometry: "cube"
  animation: { property: "position.y", from: 0, to: 5, duration: 3000, loop: "pingpong" }
}`,
    relatedTraits: ['@physics', '@rigid'],
  },

  '@trigger': {
    name: '@trigger',
    category: 'physics',
    description: "Object detects overlaps but doesn't physically collide.",
    parameters: [
      {
        name: 'shape',
        type: 'string',
        default: 'auto',
        description: 'Trigger shape: box, sphere, auto',
      },
    ],
    events: ['onTriggerEnter', 'onTriggerExit', 'onTriggerStay'],
    example: `orb DamagZone @trigger {
  geometry: "sphere"
  scale: [3, 3, 3]
  visible: false
  onTriggerEnter: |entity| { entity.health -= 10 }
}`,
    relatedTraits: ['@collidable'],
  },

  '@gravity': {
    name: '@gravity',
    category: 'physics',
    description: 'Object is affected by gravity.',
    parameters: [
      { name: 'scale', type: 'number', default: '1', description: 'Gravity multiplier' },
    ],
    events: [],
    example: `orb Balloon @physics @gravity(scale: -0.1) {
  geometry: "sphere"
  // Floats slowly upward
}`,
    relatedTraits: ['@physics'],
  },

  // Visual Traits
  '@glowing': {
    name: '@glowing',
    category: 'visual',
    description: 'Object emits a glow effect.',
    parameters: [
      { name: 'intensity', type: 'number', default: '0.5', description: 'Glow intensity' },
      {
        name: 'color',
        type: 'string',
        default: 'inherit',
        description: 'Glow color (defaults to object color)',
      },
      { name: 'pulse', type: 'boolean', default: 'false', description: 'Pulsing glow effect' },
    ],
    events: [],
    example: `orb Crystal @glowing(intensity: 0.8, color: "#00ffff", pulse: true) {
  geometry: "model/crystal.glb"
  color: "#00ffff"
}`,
    relatedTraits: ['@emissive'],
  },

  '@emissive': {
    name: '@emissive',
    category: 'visual',
    description: 'Object emits light (acts as a light source).',
    parameters: [
      { name: 'intensity', type: 'number', default: '1', description: 'Light intensity' },
      { name: 'range', type: 'number', default: '5', description: 'Light range in meters' },
    ],
    events: [],
    example: `orb Lamp @emissive(intensity: 2, range: 10) {
  geometry: "sphere"
  color: "#ffff88"
}`,
    relatedTraits: ['@glowing'],
  },

  '@transparent': {
    name: '@transparent',
    category: 'visual',
    description: 'Object has transparency.',
    parameters: [
      { name: 'opacity', type: 'number', default: '0.5', description: 'Opacity value (0-1)' },
    ],
    events: [],
    example: `orb Ghost @transparent(opacity: 0.3) {
  geometry: "model/ghost.glb"
  color: "#ffffff"
}`,
    relatedTraits: ['@reflective'],
  },

  '@reflective': {
    name: '@reflective',
    category: 'visual',
    description: 'Object has reflective surface.',
    parameters: [
      { name: 'roughness', type: 'number', default: '0.1', description: 'Surface roughness' },
      { name: 'metalness', type: 'number', default: '1', description: 'Metalness value' },
    ],
    events: [],
    example: `orb Mirror @reflective(roughness: 0, metalness: 1) {
  geometry: "plane"
  scale: [2, 3, 0.1]
}`,
    relatedTraits: ['@transparent'],
  },

  '@animated': {
    name: '@animated',
    category: 'visual',
    description: 'Object plays animations.',
    parameters: [
      { name: 'autoplay', type: 'boolean', default: 'true', description: 'Auto-play on load' },
      { name: 'loop', type: 'boolean', default: 'true', description: 'Loop animation' },
    ],
    events: ['onAnimationStart', 'onAnimationEnd', 'onAnimationLoop'],
    example: `orb Character @animated(autoplay: true) {
  geometry: "model/character.glb"
  animation: { clip: "idle", loop: true }
}`,
    relatedTraits: [],
  },

  '@billboard': {
    name: '@billboard',
    category: 'visual',
    description: 'Object always faces the camera.',
    parameters: [
      { name: 'axis', type: 'string', default: 'all', description: 'Rotation axis: all, y' },
    ],
    events: [],
    example: `orb NameTag @billboard(axis: "y") {
  geometry: "plane"
  text: "Player 1"
}`,
    relatedTraits: [],
  },

  // Networking Traits
  '@networked': {
    name: '@networked',
    category: 'networking',
    description: 'Object state is synchronized across clients.',
    parameters: [
      { name: 'sync_rate', type: 'string', default: '20hz', description: 'Sync rate in Hz' },
      {
        name: 'interpolate',
        type: 'boolean',
        default: 'true',
        description: 'Interpolate between updates',
      },
    ],
    events: ['onNetworkSync', 'onOwnershipChange'],
    example: `orb SharedBall @networked(sync_rate: "30hz") @grabbable {
  geometry: "sphere"
  @networked position
  @networked rotation
}`,
    relatedTraits: ['@synced', '@persistent', '@owned'],
  },

  '@synced': {
    name: '@synced',
    category: 'networking',
    description: 'Specific property is synced across network.',
    parameters: [{ name: 'property', type: 'string', description: 'Property to sync' }],
    events: [],
    example: `orb Counter @networked {
  state { count: 0 }
  @synced count
}`,
    relatedTraits: ['@networked'],
  },

  '@persistent': {
    name: '@persistent',
    category: 'networking',
    description: 'Object state persists across sessions.',
    parameters: [
      {
        name: 'storage',
        type: 'string',
        default: 'cloud',
        description: 'Storage type: cloud, local',
      },
    ],
    events: ['onSave', 'onLoad'],
    example: `orb SavedProgress @persistent {
  state {
    level: 1
    score: 0
  }
}`,
    relatedTraits: ['@networked'],
  },

  '@owned': {
    name: '@owned',
    category: 'networking',
    description: 'Object has ownership semantics - only owner can modify.',
    parameters: [],
    events: ['onOwnershipClaimed', 'onOwnershipReleased'],
    example: `orb PlayerAvatar @networked @owned {
  geometry: "model/avatar.glb"
  // Only the owning player can control this
}`,
    relatedTraits: ['@networked'],
  },

  '@host_only': {
    name: '@host_only',
    category: 'networking',
    description: 'Object can only be modified by the host/server.',
    parameters: [],
    events: [],
    example: `orb GameManager @host_only {
  state {
    gameState: "lobby"
    players: []
  }
}`,
    relatedTraits: ['@networked'],
  },

  // Behavior Traits
  '@stackable': {
    name: '@stackable',
    category: 'behavior',
    description: 'Objects can be stacked on top of each other.',
    parameters: [
      { name: 'max_stack', type: 'number', default: '10', description: 'Maximum stack height' },
    ],
    events: ['onStack', 'onUnstack'],
    example: `orb Crate @grabbable @stackable(max_stack: 5) @collidable {
  geometry: "cube"
}`,
    relatedTraits: ['@attachable'],
  },

  '@attachable': {
    name: '@attachable',
    category: 'behavior',
    description: 'Object can attach to other objects.',
    parameters: [{ name: 'attach_points', type: 'array', description: 'Named attachment points' }],
    events: ['onAttach', 'onDetach'],
    example: `orb Scope @attachable(attach_points: ["weapon_top"]) {
  geometry: "model/scope.glb"
}`,
    relatedTraits: ['@equippable'],
  },

  '@equippable': {
    name: '@equippable',
    category: 'behavior',
    description: 'Object can be equipped to body slots.',
    parameters: [
      {
        name: 'slot',
        type: 'string',
        default: 'hand',
        description: 'Equip slot: hand, head, back, chest',
      },
    ],
    events: ['onEquip', 'onUnequip'],
    example: `orb Helmet @equippable(slot: "head") {
  geometry: "model/helmet.glb"
}`,
    relatedTraits: ['@grabbable', '@attachable'],
  },

  '@consumable': {
    name: '@consumable',
    category: 'behavior',
    description: 'Object can be consumed/used once.',
    parameters: [{ name: 'effect', type: 'string', description: 'Effect on consumption' }],
    events: ['onConsume'],
    example: `orb HealthPotion @grabbable @consumable {
  geometry: "model/potion.glb"
  color: "#ff0000"
  onConsume: { player.health += 50 }
}`,
    relatedTraits: ['@grabbable'],
  },

  '@destructible': {
    name: '@destructible',
    category: 'behavior',
    description: 'Object can be destroyed.',
    parameters: [
      { name: 'health', type: 'number', default: '100', description: 'Health points' },
      { name: 'debris', type: 'boolean', default: 'true', description: 'Spawn debris on destroy' },
    ],
    events: ['onDamage', 'onDestroy'],
    example: `orb Vase @destructible(health: 10) @collidable {
  geometry: "model/vase.glb"
  onDestroy: { audio.play('shatter.mp3') }
}`,
    relatedTraits: ['@collidable'],
  },

  // Spatial Traits
  '@anchor': {
    name: '@anchor',
    category: 'spatial',
    description: 'Object is anchored to a real-world position (AR).',
    parameters: [
      {
        name: 'persist',
        type: 'boolean',
        default: 'true',
        description: 'Persist anchor across sessions',
      },
    ],
    events: ['onAnchorFound', 'onAnchorLost'],
    example: `orb ARLabel @anchor {
  geometry: "plane"
  text: "Kitchen"
}`,
    relatedTraits: ['@world_locked'],
  },

  '@tracked': {
    name: '@tracked',
    category: 'spatial',
    description: 'Object tracks a real-world entity.',
    parameters: [
      { name: 'target', type: 'string', description: 'What to track: head, left_hand, right_hand' },
    ],
    events: ['onTrackingLost', 'onTrackingFound'],
    example: `orb HeadUI @tracked(target: "head") {
  geometry: "plane"
  position: [0, 0, -0.5]
}`,
    relatedTraits: ['@hand_tracked', '@eye_tracked'],
  },

  '@world_locked': {
    name: '@world_locked',
    category: 'spatial',
    description: 'Object stays fixed in world space (ignores user movement).',
    parameters: [],
    events: [],
    example: `orb WorldMarker @world_locked {
  geometry: "sphere"
  position: [0, 0, -5]
}`,
    relatedTraits: ['@anchor'],
  },

  '@hand_tracked': {
    name: '@hand_tracked',
    category: 'spatial',
    description: 'Object uses hand tracking data.',
    parameters: [
      {
        name: 'hand',
        type: 'string',
        default: 'auto',
        description: 'Which hand: left, right, auto',
      },
    ],
    events: ['onGesture', 'onPinch', 'onPoint'],
    example: `orb HandMenu @hand_tracked(hand: "left") {
  geometry: "plane"
  position: [0, 0.1, -0.1]
}`,
    relatedTraits: ['@tracked'],
  },

  '@eye_tracked': {
    name: '@eye_tracked',
    category: 'spatial',
    description: 'Object responds to eye tracking.',
    parameters: [
      {
        name: 'dwell_time',
        type: 'number',
        default: '500',
        description: 'Dwell time in ms for activation',
      },
    ],
    events: ['onGaze', 'onGazeEnter', 'onGazeExit', 'onDwell'],
    example: `orb GazeButton @eye_tracked(dwell_time: 300) {
  geometry: "sphere"
  onDwell: { this.activate() }
}`,
    relatedTraits: ['@tracked'],
  },

  // Audio Traits
  '@spatial_audio': {
    name: '@spatial_audio',
    category: 'audio',
    description: 'Object has 3D spatial audio.',
    parameters: [
      {
        name: 'rolloff',
        type: 'string',
        default: 'linear',
        description: 'Distance rolloff: linear, logarithmic',
      },
      { name: 'max_distance', type: 'number', default: '10', description: 'Max audible distance' },
    ],
    events: [],
    example: `orb Radio @spatial_audio(max_distance: 15) {
  audio: { src: "music.mp3", loop: true }
}`,
    relatedTraits: ['@ambient'],
  },

  '@ambient': {
    name: '@ambient',
    category: 'audio',
    description: 'Object provides ambient audio (non-directional).',
    parameters: [{ name: 'volume', type: 'number', default: '1', description: 'Volume level' }],
    events: [],
    example: `orb Ambience @ambient(volume: 0.3) {
  audio: { src: "forest-ambience.mp3", loop: true }
}`,
    relatedTraits: ['@spatial_audio'],
  },

  '@voice_activated': {
    name: '@voice_activated',
    category: 'audio',
    description: 'Object responds to voice commands.',
    parameters: [{ name: 'keywords', type: 'array', description: 'Keywords to listen for' }],
    events: ['onVoiceCommand', 'onSpeechStart', 'onSpeechEnd'],
    example: `orb VoiceLight @voice_activated(keywords: ["lights on", "lights off"]) {
  onVoiceCommand: |cmd| {
    if (cmd === "lights on") this.emissive = 1
    else this.emissive = 0
  }
}`,
    relatedTraits: [],
  },

  // State Traits
  '@state': {
    name: '@state',
    category: 'state',
    description: 'Object has managed state.',
    parameters: [],
    events: ['onChange'],
    example: `orb Counter @state {
  state {
    count: 0
    maxCount: 100
  }
  onClick: { this.count++ }
}`,
    relatedTraits: ['@reactive', '@observable'],
  },

  '@reactive': {
    name: '@reactive',
    category: 'state',
    description: 'Object re-renders on state changes.',
    parameters: [],
    events: [],
    example: `orb Display @reactive {
  state { message: "Hello" }
  text: \${message}
}`,
    relatedTraits: ['@state', '@computed'],
  },

  '@observable': {
    name: '@observable',
    category: 'state',
    description: 'External code can subscribe to state changes.',
    parameters: [],
    events: ['onSubscribe', 'onUnsubscribe'],
    example: `orb GameState @observable {
  state { score: 0, level: 1 }
}`,
    relatedTraits: ['@state'],
  },

  '@computed': {
    name: '@computed',
    category: 'state',
    description: 'Property is derived from other state.',
    parameters: [{ name: 'deps', type: 'array', description: 'Dependencies' }],
    events: [],
    example: `orb Stats @state @computed {
  state { health: 100, maxHealth: 100 }
  @computed healthPercent: health / maxHealth * 100
}`,
    relatedTraits: ['@state', '@reactive'],
  },

  // Extended Interaction Traits
  '@rotatable': {
    name: '@rotatable',
    category: 'interaction',
    description: 'Object can be rotated by the user or auto-rotates on an axis.',
    parameters: [
      { name: 'speed', type: 'number', default: '1.0', description: 'Rotation speed multiplier' },
      { name: 'axis', type: 'string', default: 'y', description: 'Rotation axis: x, y, z' },
      {
        name: 'snap_angle',
        type: 'number',
        default: '0',
        description: 'Snap to angle increments in degrees (0 = free rotation)',
      },
      {
        name: 'auto_rotate',
        type: 'boolean',
        default: 'false',
        description: 'Enable continuous auto-rotation',
      },
    ],
    events: ['onRotateStart', 'onRotate', 'onRotateEnd'],
    example: `orb Turntable @rotatable(axis: "y", auto_rotate: true, speed: 0.5) {
  geometry: "cylinder"
  scale: [1, 0.1, 1]
}`,
    relatedTraits: ['@grabbable', '@draggable'],
  },

  '@snappable': {
    name: '@snappable',
    category: 'interaction',
    description: 'Object snaps to grid positions or predefined snap points when moved.',
    parameters: [
      {
        name: 'grid_size',
        type: 'number',
        default: '0.5',
        description: 'Grid cell size for snapping',
      },
      { name: 'snap_points', type: 'array', description: 'Custom [x,y,z] snap point positions' },
      {
        name: 'snap_distance',
        type: 'number',
        default: '0.3',
        description: 'Distance threshold to trigger snapping',
      },
      {
        name: 'snap_rotation',
        type: 'boolean',
        default: 'false',
        description: 'Also snap rotation to increments',
      },
      {
        name: 'rotation_snap',
        type: 'number',
        default: '45',
        description: 'Rotation snap increment in degrees',
      },
    ],
    events: ['onSnap', 'onUnsnap'],
    example: `orb BuildingBlock @grabbable @snappable(grid_size: 1, snap_rotation: true) {
  geometry: "cube"
  color: "#44aaff"
}`,
    relatedTraits: ['@grabbable', '@stackable', '@draggable'],
  },

  // Extended Behavior Traits
  '@breakable': {
    name: '@breakable',
    category: 'behavior',
    description:
      'Object shatters into fragments on impact when velocity exceeds the break force threshold.',
    parameters: [
      {
        name: 'break_force',
        type: 'number',
        default: '5',
        description: 'Minimum velocity to trigger breaking',
      },
      {
        name: 'fragments',
        type: 'number',
        default: '6',
        description: 'Number of debris fragments to spawn',
      },
      {
        name: 'fragment_lifetime',
        type: 'number',
        default: '4',
        description: 'Seconds before fragments fade away',
      },
    ],
    events: ['onBreak'],
    example: `orb GlassPane @physics @breakable(break_force: 3, fragments: 10) {
  geometry: "cube"
  scale: [1, 1, 0.05]
  color: "#aaddff"
  @transparent(opacity: 0.5)
}`,
    relatedTraits: ['@physics', '@collidable', '@destructible'],
  },

  '@character': {
    name: '@character',
    category: 'behavior',
    description:
      'Adds a basic character controller with keyboard movement (WASD), jumping, and gravity.',
    parameters: [
      { name: 'speed', type: 'number', default: '3', description: 'Movement speed in m/s' },
      { name: 'jump_force', type: 'number', default: '5', description: 'Jump impulse force' },
      { name: 'gravity', type: 'number', default: '-9.81', description: 'Gravity acceleration' },
      {
        name: 'ground_level',
        type: 'number',
        default: '0',
        description: 'Y position of the ground plane',
      },
    ],
    events: ['onJump', 'onLand', 'onMove'],
    example: `orb Player @character(speed: 5, jump_force: 6) @collidable {
  geometry: "model/player.glb"
  position: [0, 0, 0]
}`,
    relatedTraits: ['@collidable', '@physics', '@tracked'],
  },

  // Advanced Traits
  '@teleport': {
    name: '@teleport',
    category: 'advanced',
    description:
      'Parabolic arc teleportation with visual indicator ring. When activated via userData.teleporting, draws a parabolic arc from the object and shows a ground target ring at the landing point.',
    parameters: [
      {
        name: 'arcColor',
        type: 'string',
        default: '0x00aaff',
        description: 'Color of the teleport arc line',
      },
      {
        name: 'ringColor',
        type: 'string',
        default: '0x00ff88',
        description: 'Color of the ground target ring',
      },
    ],
    events: ['onTeleportStart', 'onTeleportConfirm', 'onTeleportCancel'],
    example: `orb VRController @teleport {
  geometry: "model/controller.glb"
  // Activate: userData.teleporting = true
  // Confirm:  userData.confirmTeleport = true
}`,
    relatedTraits: ['@pointable', '@portal'],
  },

  '@ui_panel': {
    name: '@ui_panel',
    category: 'advanced',
    description:
      'Creates a floating 2D UI panel in 3D space using HTML canvas rendering. Supports dynamic text updates via userData.uiText and userData.uiDirty.',
    parameters: [
      { name: 'width', type: 'number', default: '512', description: 'Canvas pixel width' },
      { name: 'height', type: 'number', default: '256', description: 'Canvas pixel height' },
      { name: 'text', type: 'string', default: '""', description: 'Initial text content' },
      {
        name: 'backgroundColor',
        type: 'string',
        default: '#222',
        description: 'Panel background color',
      },
      { name: 'textColor', type: 'string', default: '#fff', description: 'Text color' },
      { name: 'fontSize', type: 'number', default: '24', description: 'Font size in pixels' },
    ],
    events: ['onTextChange'],
    example: `orb ScoreBoard @ui_panel(width: 512, height: 128, text: "Score: 0", backgroundColor: "#111", textColor: "#0f0", fontSize: 32) @billboard {
  position: [0, 3, -5]
}`,
    relatedTraits: ['@billboard', '@tracked'],
  },

  '@particle_system': {
    name: '@particle_system',
    category: 'advanced',
    description:
      'GPU-friendly particle effects such as smoke, fire, and sparks. Particles emit from the object origin and respawn when their lifetime expires.',
    parameters: [
      { name: 'count', type: 'number', default: '500', description: 'Number of particles' },
      { name: 'color', type: 'string', default: '0xffaa00', description: 'Particle color' },
      { name: 'size', type: 'number', default: '0.05', description: 'Particle size' },
      { name: 'speed', type: 'number', default: '1', description: 'Upward emission speed' },
      {
        name: 'spread',
        type: 'number',
        default: '1',
        description: 'Horizontal emission spread radius',
      },
      {
        name: 'lifetime',
        type: 'number',
        default: '3',
        description: 'Particle lifetime in seconds before respawn',
      },
    ],
    events: [],
    example: `orb Campfire @particle_system(count: 300, color: "#ff4400", size: 0.04, speed: 2, spread: 0.5) @emissive(intensity: 1.5) {
  geometry: "model/campfire.glb"
  position: [0, 0, -3]
}`,
    relatedTraits: ['@emissive', '@glowing'],
  },

  '@weather': {
    name: '@weather',
    category: 'advanced',
    description:
      'Dynamic weather effects including rain, snow, and fog. Rain and snow use particle systems while fog modifies the scene fog settings.',
    parameters: [
      {
        name: 'type',
        type: 'string',
        default: 'rain',
        description: "Weather type: 'rain', 'snow', or 'fog'",
      },
      {
        name: 'count',
        type: 'number',
        default: '2000',
        description: 'Number of particles (rain/snow only)',
      },
      { name: 'area', type: 'number', default: '30', description: 'Area size in meters' },
      {
        name: 'intensity',
        type: 'number',
        default: '1',
        description: 'Effect intensity multiplier',
      },
    ],
    events: ['onWeatherChange'],
    example: `orb SnowEffect @weather(type: "snow", count: 3000, area: 40) {
  position: [0, 10, 0]
}`,
    relatedTraits: ['@day_night'],
  },

  '@day_night': {
    name: '@day_night',
    category: 'advanced',
    description:
      'Automated sun cycle with realistic color temperature changes. Creates a directional sun light and ambient light that orbit and change color from warm sunrise to cool moonlight over the configured cycle duration.',
    parameters: [
      {
        name: 'cycleDuration',
        type: 'number',
        default: '120',
        description: 'Full day/night cycle duration in seconds',
      },
      {
        name: 'startTime',
        type: 'number',
        default: '0',
        description: 'Starting time as fraction of day (0 = midnight, 0.5 = noon)',
      },
    ],
    events: ['onSunrise', 'onSunset', 'onNoon', 'onMidnight'],
    example: `orb WorldClock @day_night(cycleDuration: 300, startTime: 0.25) {
  position: [0, 0, 0]
  // Exposes: userData.dayNightPhase ("day"|"night")
  // Exposes: userData.dayNightProgress (0-1)
}`,
    relatedTraits: ['@weather', '@emissive'],
  },

  '@lod': {
    name: '@lod',
    category: 'advanced',
    description:
      'Level of Detail optimization that auto-simplifies distant objects. Creates three detail levels: full mesh (near), wireframe (medium), and point cloud (far). Automatically switches based on camera distance.',
    parameters: [
      {
        name: 'distances',
        type: 'array',
        default: '[0, 15, 30]',
        description: 'Distance thresholds [near, medium, far] in meters',
      },
    ],
    events: ['onLODChange'],
    example: `orb DetailedTree @lod(distances: [0, 20, 50]) {
  geometry: "model/tree_detailed.glb"
  position: [10, 0, -15]
}`,
    relatedTraits: ['@billboard'],
  },

  '@hand_tracking': {
    name: '@hand_tracking',
    category: 'advanced',
    description:
      'WebXR hand joint tracking with pinch detection. Renders fingertip spheres and a wrist indicator. Exposes pinch state via userData.pinching and userData.pinchDistance.',
    parameters: [
      {
        name: 'hand',
        type: 'string',
        default: 'right',
        description: "Which hand to track: 'left' or 'right'",
      },
      {
        name: 'sphereRadius',
        type: 'number',
        default: '0.008',
        description: 'Radius of fingertip indicator spheres',
      },
      {
        name: 'pinchThreshold',
        type: 'number',
        default: '0.02',
        description: 'Distance threshold for pinch detection (meters)',
      },
    ],
    events: ['onPinchStart', 'onPinchEnd', 'onHandFound', 'onHandLost'],
    example: `orb LeftHand @hand_tracking(hand: "left") {
  position: [0, 0, 0]
  // Exposes: userData.pinching (boolean)
  // Exposes: userData.handTracked (boolean)
}`,
    relatedTraits: ['@hand_tracked', '@tracked'],
  },

  '@haptic': {
    name: '@haptic',
    category: 'advanced',
    description:
      'VR controller vibration feedback. Triggers a haptic pulse on the specified controller when userData.triggerHaptic is set to true. Supports both standard Gamepad Haptic API and dual-rumble vibration.',
    parameters: [
      {
        name: 'intensity',
        type: 'number',
        default: '0.5',
        description: 'Vibration intensity (0-1)',
      },
      {
        name: 'duration',
        type: 'number',
        default: '100',
        description: 'Vibration duration in milliseconds',
      },
      {
        name: 'hand',
        type: 'string',
        default: 'right',
        description: "Target controller: 'left', 'right', or 'both'",
      },
      {
        name: 'cooldown',
        type: 'number',
        default: '50',
        description: 'Minimum ms between consecutive pulses',
      },
    ],
    events: ['onHapticPulse'],
    example: `orb VRController @haptic(intensity: 0.7, duration: 150, hand: "right") {
  geometry: "model/controller.glb"
  // Trigger feedback: userData.triggerHaptic = true
}`,
    relatedTraits: ['@hand_tracking', '@grabbable'],
  },

  '@portal': {
    name: '@portal',
    category: 'advanced',
    description:
      'Teleportation gateway with glowing torus ring and semi-transparent surface. Objects tagged as teleportable or isPlayer that enter the activation distance are instantly moved to the destination coordinates.',
    parameters: [
      {
        name: 'destination',
        type: 'array',
        default: '[0, 0, 0]',
        description: 'Target [x, y, z] teleport coordinates',
      },
      { name: 'color', type: 'string', default: '#8800ff', description: 'Portal glow color' },
      {
        name: 'activationDistance',
        type: 'number',
        default: '1',
        description: 'Distance in meters to trigger teleportation',
      },
      { name: 'radius', type: 'number', default: '1.2', description: 'Portal ring radius' },
    ],
    events: ['onPortalEnter', 'onPortalExit'],
    example: `orb DungeonPortal @portal(destination: [50, 0, 50], color: "#ff00ff", activationDistance: 1.5) @spatial_audio {
  position: [0, 1.5, -5]
  audio: { src: "portal-hum.mp3", loop: true }
}`,
    relatedTraits: ['@teleport', '@trigger', '@glowing'],
  },

  '@mirror': {
    name: '@mirror',
    category: 'advanced',
    description:
      'Reflective surface with metallic material and a subtle frame. Creates a highly reflective plane with configurable tint and orientation. Supports vertical, horizontal, or camera-facing modes.',
    parameters: [
      { name: 'size', type: 'number', default: '2', description: 'Mirror plane size in meters' },
      { name: 'tint', type: 'string', default: '#ffffff', description: 'Reflection tint color' },
      {
        name: 'orientation',
        type: 'string',
        default: 'vertical',
        description: "Mirror orientation: 'vertical', 'horizontal', or 'face_camera'",
      },
    ],
    events: [],
    example: `orb WallMirror @mirror(size: 3, tint: "#f0f0ff", orientation: "vertical") {
  position: [0, 1.5, -4]
}`,
    relatedTraits: ['@reflective', '@billboard'],
  },
};

interface TraitDoc {
  name: string;
  category: string;
  description: string;
  parameters: { name: string; type: string; default?: string; description: string }[];
  events: string[];
  example: string;
  relatedTraits: string[];
}

// === SYNTAX DOCUMENTATION ===

export const SYNTAX_DOCS: Record<string, SyntaxDoc> = {
  orb: {
    topic: 'orb',
    description:
      'LEGACY: Define a 3D object. Prefer using composition/template/object pattern for new code.',
    syntax: `// LEGACY SYNTAX (still supported):
orb <name> [traits] {
  geometry: "<type>"
  position: [x, y, z]
  color: "<hex>"
}

// MODERN SYNTAX (recommended):
composition "Scene" {
  template "MyTemplate" {
    @traits
    geometry: "<type>"
    color: "<hex>"
  }
  object "MyObject" using "MyTemplate" {
    position: [x, y, z]
  }
}`,
    examples: [
      {
        description: 'Modern composition pattern (recommended)',
        code: `composition "MyScene" {
  template "SphereTemplate" {
    @grabbable @glowing
    geometry: "sphere"
    color: "#00ffff"
  }

  object "MySphere" using "SphereTemplate" {
    position: [0, 1, 0]
  }
}`,
      },
      {
        description: 'Legacy orb syntax (still works)',
        code: `orb MyCube @grabbable @glowing {
  geometry: "cube"
  color: "#ff8800"
  position: [2, 1, 0]
}`,
      },
    ],
  },

  object: {
    topic: 'object',
    description: 'Define a 3D object in .holo composition syntax.',
    syntax: `object "<name>" [using "<template>"] [@traits] {
  geometry: "<type>"
  position: [x, y, z]
  // ... properties
}`,
    examples: [
      {
        description: 'Basic object',
        code: `object "Crystal" @glowing {
  geometry: "model/crystal.glb"
  position: [0, 1, -2]
}`,
      },
      {
        description: 'Object using template',
        code: `object "Enemy_1" using "EnemyTemplate" {
  position: [5, 0, 5]
  state.variant: "red"
}`,
      },
    ],
  },

  template: {
    topic: 'template',
    description: 'Define a reusable object template in .holo compositions.',
    syntax: `template "<name>" {
  geometry: "<type>"
  
  state {
    <propertyName>: <defaultValue>
    // ...
  }
  
  action <actionName>(<params>) {
    // behavior
  }
}`,
    examples: [
      {
        description: 'Enemy template',
        code: `template "Enemy" {
  geometry: "model/enemy.glb"
  
  state {
    health: 100
    damage: 10
  }
  
  action takeDamage(amount) {
    health -= amount
    if (health <= 0) destroy()
  }
}`,
      },
    ],
  },

  composition: {
    topic: 'composition',
    description: 'Top-level container for a .holo scene definition.',
    syntax: `composition "<Scene Name>" {
  environment { ... }
  
  template "<TemplateName>" { ... }
  
  spatial_group "<GroupName>" {
    object "<ObjectName>" { ... }
  }
  
  logic { ... }
}`,
    examples: [
      {
        description: 'Complete scene',
        code: `composition "Forest Clearing" {
  environment {
    skybox: "forest"
    ambient_light: 0.4
  }
  
  spatial_group "Trees" {
    object "Oak_1" { position: [-3, 0, -5] }
    object "Oak_2" { position: [3, 0, -4] }
  }
  
  logic {
    on_player_enter() {
      audio.play("forest-ambience.mp3")
    }
  }
}`,
      },
    ],
  },

  environment: {
    topic: 'environment',
    description: 'Configure scene environment (skybox, lighting, fog).',
    syntax: `environment {
  skybox: "<preset>" | "<url>"
  ambient_light: <0-1>
  fog: { enabled: true, color: "<hex>", density: <number> }
  gravity: [x, y, z]
}`,
    examples: [
      {
        description: 'Space environment',
        code: `environment {
  skybox: "nebula"
  ambient_light: 0.1
  fog: { enabled: false }
  gravity: [0, 0, 0]
}`,
      },
    ],
  },

  spatial_group: {
    topic: 'spatial_group',
    description:
      'DEPRECATED: Group objects. Instead, use multiple templates and objects within a composition.',
    syntax: `// DEPRECATED - use composition pattern instead:
composition "Scene" {
  template "FurnitureTemplate" { ... }

  // Objects can be organized logically without spatial_group
  object "Couch" using "FurnitureTemplate" { position: [0, 0, 0] }
  object "Table" using "FurnitureTemplate" { position: [2, 0, 1] }
}`,
    examples: [
      {
        description: 'Modern pattern (recommended)',
        code: `composition "LivingRoom" {
  environment {
    name: "Living Room"
  }

  template "Furniture" {
    @collidable
    geometry: "model/furniture.glb"
  }

  object "Couch" using "Furniture" { position: [0, 0, 0] }
  object "Table" using "Furniture" { position: [2, 0, 1] }
  object "Lamp" using "Furniture" { position: [3, 1, 0] }
}`,
      },
    ],
  },

  logic: {
    topic: 'logic',
    description: 'Define scene-level logic and event handlers.',
    syntax: `logic {
  on_<event>([params]) {
    // handler code
  }
  
  function <name>(<params>) {
    // function body
  }
}`,
    examples: [
      {
        description: 'Game logic',
        code: `logic {
  on_scene_start() {
    score = 0
    timer.start(60)
  }
  
  on_player_collect(item) {
    score += item.value
    audio.play("collect.mp3")
  }
  
  function checkWin() {
    if (score >= 100) scene.load("victory")
  }
}`,
      },
    ],
  },

  animation: {
    topic: 'animation',
    description: 'Define property animations in HoloScript.',
    syntax: `animation {
  property: "<prop.path>"
  from: <startValue>
  to: <endValue>
  duration: <ms>
  easing: "<function>"
  loop: "once" | "infinite" | "pingpong"
}`,
    examples: [
      {
        description: 'Hover animation',
        code: `orb Gem @animated {
  geometry: "model/gem.glb"
  animation: {
    property: "position.y"
    from: 1
    to: 1.5
    duration: 2000
    easing: "easeInOut"
    loop: "pingpong"
  }
}`,
      },
    ],
  },

  physics: {
    topic: 'physics',
    description: 'Configure physics properties for objects.',
    syntax: `physics: {
  type: "dynamic" | "kinematic" | "static"
  mass: <number>
  friction: <0-1>
  restitution: <0-1>
  linearDamping: <number>
  angularDamping: <number>
}`,
    examples: [
      {
        description: 'Bouncy ball',
        code: `orb Ball @physics @collidable {
  geometry: "sphere"
  physics: {
    type: "dynamic"
    mass: 0.5
    restitution: 0.9  // Very bouncy
    friction: 0.1
  }
}`,
      },
    ],
  },

  events: {
    topic: 'events',
    description: 'Handle interaction and lifecycle events.',
    syntax: `on<EventName>: { <handler code> }

// Or with parameters:
on<EventName>: |param1, param2| { <handler code> }`,
    examples: [
      {
        description: 'Event handlers',
        code: `orb Button @clickable @hoverable {
  geometry: "cube"
  
  onClick: { door.toggle() }
  
  onHoverEnter: { 
    this.color = "#00ff00"
    audio.play("hover.mp3")
  }
  
  onHoverExit: { this.color = "#888888" }
  
  onCollisionEnter: |other| {
    if (other.tag === "projectile") {
      this.health -= 10
    }
  }
}`,
      },
    ],
  },

  networking: {
    topic: 'networking',
    description: 'Configure multiplayer networking for objects.',
    syntax: `// Basic networked object
object "Name" @networked {
  @networked position    // Sync position
  @networked rotation    // Sync rotation
  @networked state.score // Sync custom state
}

// Ownership
object "Name" @networked @owned {
  // Only owner can modify
}`,
    examples: [
      {
        description: 'Multiplayer object',
        code: `orb SharedBall @networked(sync_rate: "30hz") @grabbable {
  geometry: "sphere"
  @networked position
  @networked rotation
  @networked color
  
  onGrab: {
    network.claim(this)
  }
  
  onRelease: {
    network.sync(this.position, this.rotation)
  }
}`,
      },
    ],
  },

  traits: {
    topic: 'traits',
    description: 'Apply VR traits to objects for behavior and interactivity.',
    syntax: `// Single trait
@traitName

// Trait with parameters
@traitName(param1: value1, param2: value2)

// Multiple traits
@trait1 @trait2 @trait3`,
    examples: [
      {
        description: 'Trait combinations',
        code: `// Interactive weapon
orb Sword @grabbable @throwable @spatial_audio {
  geometry: "model/sword.glb"
}

// Physics puzzle piece
orb Block @physics @collidable @stackable(max_stack: 10) {
  geometry: "cube"
}

// Multiplayer avatar
orb Avatar @networked @owned @hand_tracked {
  geometry: "model/avatar.glb"
}`,
      },
    ],
  },
};

interface SyntaxDoc {
  topic: string;
  description: string;
  syntax: string;
  examples: { description: string; code: string }[];
}

// === EXAMPLES ===

export const EXAMPLES: Record<string, ExampleDoc> = {
  'interactive-object': {
    pattern: 'interactive-object',
    description: 'A grabbable, interactive object with haptic feedback.',
    code: `orb Crystal @grabbable @glowing(intensity: 0.8) @collidable {
  geometry: "model/crystal.glb"
  color: "#00ffff"
  position: [0, 1, -2]
  
  state {
    isActive: false
  }
  
  onGrab: {
    haptic.feedback('medium')
    audio.play('pickup.mp3')
    isActive = true
  }
  
  onRelease: {
    audio.play('drop.mp3')
    isActive = false
  }
}`,
    useCases: ['Collectible items', 'Puzzle pieces', 'Tools'],
  },

  'multiplayer-sync': {
    pattern: 'multiplayer-sync',
    description: 'Object synchronized across all players in multiplayer.',
    code: `orb SharedBall @networked(sync_rate: "30hz") @grabbable @throwable @collidable {
  geometry: "sphere"
  color: "#ff8800"
  physics: { mass: 0.5, restitution: 0.8 }
  
  @networked position
  @networked rotation
  @networked velocity
  
  onGrab: {
    network.claim(this)  // Take ownership
    haptic.feedback('light')
  }
  
  onThrow: {
    network.sync(this.position, this.rotation, this.velocity)
  }
}`,
    useCases: ['Multiplayer games', 'Collaborative spaces', 'Shared toys'],
  },

  teleportation: {
    pattern: 'teleportation',
    description: 'Teleportation point that moves the player.',
    code: `orb TeleportPad @pointable @glowing(pulse: true) {
  geometry: "cylinder"
  scale: [0.5, 0.1, 0.5]
  color: "#0088ff"
  position: [5, 0, 5]
  
  onPoint: {
    // Visual feedback
    this.color = "#00ff00"
    audio.play('teleport-charge.mp3')
  }
  
  onPointExit: {
    this.color = "#0088ff"
  }
  
  onRelease: {
    player.teleportTo(this.position)
    audio.play('teleport.mp3')
    haptic.feedback('strong')
  }
}`,
    useCases: ['Navigation', 'Fast travel', 'Accessibility'],
  },

  portal: {
    pattern: 'portal',
    description: 'Portal that transitions to another scene.',
    code: `orb Portal @trigger @glowing(intensity: 1.5, pulse: true) @spatial_audio {
  geometry: "torus"
  scale: [1.5, 1.5, 0.3]
  rotation: [90, 0, 0]
  color: "#ff00ff"
  
  audio: { src: "portal-hum.mp3", loop: true, volume: 0.5 }
  
  state {
    destination: "NextLevel"
  }
  
  onTriggerEnter: |entity| {
    if (entity.type === "player") {
      audio.play('portal-enter.mp3')
      haptic.feedback('strong')
      
      scene.transition({
        target: destination,
        effect: "fade",
        duration: 1000
      })
    }
  }
}`,
    useCases: ['Level transitions', 'Room connections', 'Fast travel'],
  },

  inventory: {
    pattern: 'inventory',
    description: 'Inventory system with item slots.',
    code: `composition "Inventory UI" {
  template "InventorySlot" {
    @hand_tracked(hand: "left")
    
    state {
      item: null
      index: 0
    }
    
    action addItem(newItem) {
      if (item === null) {
        item = newItem
        audio.play('item-add.mp3')
        return true
      }
      return false
    }
    
    action removeItem() {
      let removed = item
      item = null
      return removed
    }
  }
  
  spatial_group "InventoryPanel" @tracked(target: "left_hand") {
    position: [0, 0.1, -0.1]
    
    object "Slot_0" using "InventorySlot" { state.index: 0 }
    object "Slot_1" using "InventorySlot" { state.index: 1 }
    object "Slot_2" using "InventorySlot" { state.index: 2 }
  }
}`,
    useCases: ['RPG games', 'Crafting systems', 'Tool management'],
  },

  animation: {
    pattern: 'animation',
    description: 'Animated object with multiple properties.',
    code: `orb FloatingGem @animated @glowing(pulse: true) {
  geometry: "model/gem.glb"
  color: "#00ffff"
  position: [0, 2, -3]
  
  // Hover animation
  animation hover {
    property: "position.y"
    from: 2
    to: 2.5
    duration: 2000
    easing: "easeInOut"
    loop: "pingpong"
  }
  
  // Rotation animation
  animation spin {
    property: "rotation.y"
    from: 0
    to: 360
    duration: 4000
    easing: "linear"
    loop: "infinite"
  }
  
  // Glow pulse (using trait)
  @glowing(intensity: 0.5, pulse: true)
}`,
    useCases: ['Decorative objects', 'Collectibles', 'Visual feedback'],
  },

  'physics-puzzle': {
    pattern: 'physics-puzzle',
    description: 'Physics-based puzzle with stackable blocks.',
    code: `composition "Block Puzzle" {
  environment {
    gravity: [0, -9.8, 0]
  }
  
  template "PuzzleBlock" {
    @physics(type: "dynamic", mass: 1)
    @collidable
    @grabbable
    @stackable(max_stack: 10)
    
    state {
      color: "#888888"
      isCorrect: false
    }
    
    action checkPosition() {
      // Check if block is in correct position
      if (isInTargetZone(position)) {
        isCorrect = true
        color = "#00ff00"
        audio.play('correct.mp3')
      }
    }
  }
  
  spatial_group "Blocks" {
    object "Block_1" using "PuzzleBlock" { 
      geometry: "cube"
      position: [0, 0.5, 0]
    }
    object "Block_2" using "PuzzleBlock" { 
      geometry: "cube"
      position: [1, 0.5, 0]
    }
    object "Block_3" using "PuzzleBlock" { 
      geometry: "cube"
      position: [2, 0.5, 0]
    }
  }
  
  // Target zone (trigger)
  object "TargetZone" @trigger {
    geometry: "cube"
    scale: [1, 0.1, 1]
    position: [5, 0, 0]
    color: "#ffff00"
    opacity: 0.3
  }
}`,
    useCases: ['Puzzle games', 'Building mechanics', 'Educational apps'],
  },

  'ui-panel': {
    pattern: 'ui-panel',
    description: 'Interactive UI panel in VR space.',
    code: `orb SettingsPanel @billboard(axis: "y") @tracked(target: "head") {
  geometry: "plane"
  scale: [0.8, 0.5, 1]
  position: [0, 0, -1.5]
  color: "#222222"
  
  children {
    // Title
    orb Title {
      geometry: "text"
      text: "Settings"
      position: [0, 0.2, 0.01]
      fontSize: 0.08
    }
    
    // Volume slider
    orb VolumeSlider @draggable(axis: "x", bounds: { min: -0.3, max: 0.3 }) {
      geometry: "sphere"
      scale: [0.05, 0.05, 0.05]
      position: [0, 0, 0.01]
      color: "#00ff00"
      
      onDrag: {
        let volume = (this.position.x + 0.3) / 0.6
        audio.setMasterVolume(volume)
      }
    }
    
    // Close button
    orb CloseButton @clickable {
      geometry: "plane"
      scale: [0.1, 0.1, 1]
      position: [0.35, 0.2, 0.01]
      color: "#ff0000"
      text: "X"
      
      onClick: {
        parent.visible = false
      }
    }
  }
}`,
    useCases: ['Menus', 'Settings', 'Information displays'],
  },

  'audio-ambient': {
    pattern: 'audio-ambient',
    description: 'Spatial and ambient audio setup.',
    code: `composition "Forest Audio" {
  // Non-directional background
  object "Ambience" @ambient(volume: 0.3) {
    audio: {
      src: "forest-ambience.mp3"
      loop: true
      autoplay: true
    }
  }
  
  // Directional waterfall
  object "Waterfall" @spatial_audio(rolloff: "logarithmic", max_distance: 20) {
    geometry: "model/waterfall.glb"
    position: [-10, 0, -15]
    
    audio: {
      src: "waterfall.mp3"
      loop: true
      volume: 0.8
    }
  }
  
  // Interactive bird
  object "Bird" @spatial_audio @clickable {
    geometry: "model/bird.glb"
    position: [5, 3, -8]
    
    onClick: {
      audio.play('bird-chirp.mp3')
    }
  }
}`,
    useCases: ['Atmosphere', 'Sound design', 'Immersive environments'],
  },

  'day-night-cycle': {
    pattern: 'day-night-cycle',
    description: 'Dynamic day/night cycle with lighting changes.',
    code: `composition "Day Night Cycle" {
  state {
    timeOfDay: 0.5  // 0 = midnight, 0.5 = noon, 1 = midnight
    cycleDuration: 120000  // 2 minutes for full cycle
  }
  
  environment {
    skybox: "dynamic"
  }
  
  object "Sun" @emissive {
    geometry: "sphere"
    scale: [5, 5, 5]
    color: "#ffff00"
    
    // Position based on time
    position: [
      cos(timeOfDay * PI * 2) * 50,
      sin(timeOfDay * PI * 2) * 50,
      0
    ]
  }
  
  object "Moon" @emissive(intensity: 0.3) {
    geometry: "sphere"
    scale: [3, 3, 3]
    color: "#aaaaff"
    
    position: [
      -cos(timeOfDay * PI * 2) * 50,
      -sin(timeOfDay * PI * 2) * 50,
      0
    ]
  }
  
  logic {
    on_update(deltaTime) {
      timeOfDay += deltaTime / cycleDuration
      if (timeOfDay > 1) timeOfDay -= 1
      
      // Update ambient light based on time
      let lightLevel = sin(timeOfDay * PI)
      environment.ambient_light = 0.1 + lightLevel * 0.6
    }
  }
}`,
    useCases: ['Open worlds', 'Simulation', 'Atmosphere'],
  },

  'procedural-generation': {
    pattern: 'procedural-generation',
    description: 'Procedurally generated content using templates.',
    code: `composition "Procedural Forest" {
  template "Tree" {
    geometry: "model/tree.glb"
    @collidable
    
    state {
      variant: Math.floor(Math.random() * 3)
      size: 0.8 + Math.random() * 0.4
    }
    
    scale: [size, size, size]
  }
  
  template "Rock" {
    geometry: "model/rock.glb"
    @collidable
    @physics(type: "static")
  }
  
  spatial_group "GeneratedForest" {
    // Generate trees in a grid with randomization
    @for i in range(10) {
      @for j in range(10) {
        object "Tree_{i}_{j}" using "Tree" {
          position: [
            i * 3 + random(-1, 1),
            0,
            j * 3 + random(-1, 1)
          ]
          rotation: [0, random(0, 360), 0]
        }
      }
    }
    
    // Scatter rocks
    @for k in range(20) {
      object "Rock_{k}" using "Rock" {
        position: [
          random(-15, 15),
          0,
          random(-15, 15)
        ]
        scale: [random(0.5, 1.5), random(0.5, 1.5), random(0.5, 1.5)]
      }
    }
  }
}`,
    useCases: ['Terrain generation', 'Decoration', 'Game levels'],
  },

  'hand-tracking': {
    pattern: 'hand-tracking',
    description: 'Hand tracking with gesture detection.',
    code: `composition "Hand Tracking Demo" {
  // Left hand UI menu
  object "LeftHandMenu" @hand_tracked(hand: "left") {
    geometry: "plane"
    scale: [0.15, 0.1, 1]
    position: [0, 0.05, -0.05]
    visible: false
    
    // Show when palm faces up
    onGesture: |gesture| {
      if (gesture === "palm_up") {
        visible = true
      } else {
        visible = false
      }
    }
  }
  
  // Right hand pointer
  object "RightHandPointer" @hand_tracked(hand: "right") {
    geometry: "cone"
    scale: [0.02, 0.1, 0.02]
    rotation: [-90, 0, 0]
    color: "#00ffff"
    
    onPinch: {
      // Ray cast from pointer
      let hit = physics.raycast(
        this.position,
        this.forward,
        10
      )
      
      if (hit) {
        hit.object.trigger('onClick')
        haptic.feedback('light')
      }
    }
  }
  
  // Gesture-controlled object
  object "GestureOrb" @grabbable {
    geometry: "sphere"
    position: [0, 1.5, -1]
    
    onGesture: |gesture| {
      switch (gesture) {
        case "thumbs_up":
          this.color = "#00ff00"
          break
        case "thumbs_down":
          this.color = "#ff0000"
          break
        case "peace":
          this.scale = [1.5, 1.5, 1.5]
          break
      }
    }
  }
}`,
    useCases: ['Gesture controls', 'Natural interaction', 'Accessibility'],
  },
};

interface ExampleDoc {
  pattern: string;
  description: string;
  code: string;
  useCases: string[];
}
