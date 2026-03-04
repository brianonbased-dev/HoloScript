import { TraitConstraint } from '../types';

export const BUILTIN_CONSTRAINTS: TraitConstraint[] = [
  // =============================================================================
  // PHYSICS & INTERACTION REQUIREMENTS
  // =============================================================================
  {
    type: 'requires',
    source: 'physics',
    targets: ['collidable'],
    message: 'Physics enabled objects must be collidable.',
  },
  {
    type: 'requires',
    source: 'grabbable',
    targets: ['physics'],
    message: 'Grabbable objects require physics to handle movement and collisions.',
  },
  {
    type: 'requires',
    source: 'throwable',
    targets: ['grabbable'],
    message: 'Throwable objects must be grabbable first.',
  },
  {
    type: 'requires',
    source: 'stackable',
    targets: ['physics', 'collidable'],
    message: 'Stackable objects require physics and collision detection.',
  },
  {
    type: 'requires',
    source: 'breakable',
    targets: ['physics', 'collidable'],
    message: 'Breakable objects require physics and collision to detect impacts.',
  },
  {
    type: 'requires',
    source: 'snappable',
    targets: ['grabbable'],
    message: 'Snappable objects must be grabbable to snap to positions.',
  },

  // =============================================================================
  // CONFLICT RULES
  // =============================================================================
  {
    type: 'conflicts',
    source: 'static',
    targets: ['physics', 'grabbable', 'throwable', 'scalable', 'rotatable'],
    message:
      'Static objects cannot have physics or be interactive (grabbable/throwable/scalable/rotatable).',
  },
  {
    type: 'conflicts',
    source: 'kinematic',
    targets: ['physics'],
    message: 'Kinematic objects handle their own motion and conflict with physics simulation.',
  },
  {
    type: 'conflicts',
    source: 'invisible',
    targets: ['hoverable', 'pointable'],
    message: 'Invisible objects cannot have hover or pointer visual feedback.',
  },

  // =============================================================================
  // PLATFORM EXCLUSIVITY
  // =============================================================================
  {
    type: 'conflicts',
    source: 'vr_only',
    targets: ['ar_only'],
    message: 'An object cannot be marked as both VR-only and AR-only.',
  },
  {
    type: 'conflicts',
    source: 'desktop_only',
    targets: ['vr_only', 'ar_only'],
    message: 'Desktop-only objects cannot also be VR-only or AR-only.',
  },

  // =============================================================================
  // MATERIAL & MESH DEPENDENCIES
  // =============================================================================
  {
    type: 'requires',
    source: 'cloth',
    targets: ['mesh'],
    message: 'Cloth physics requires a mesh to deform.',
  },
  {
    type: 'requires',
    source: 'soft_body',
    targets: ['mesh'],
    message: 'Soft body physics requires a mesh.',
  },
  {
    type: 'requires',
    source: 'particle_emitter',
    targets: ['visible'],
    message: 'Particle emitters must be visible to render particles.',
  },

  // =============================================================================
  // AUDIO REQUIREMENTS
  // =============================================================================
  {
    type: 'requires',
    source: 'spatial_audio',
    targets: ['audio'],
    message: 'Spatial audio requires an audio source.',
  },
  {
    type: 'requires',
    source: 'audio_zone',
    targets: ['collidable'],
    message: 'Audio zones require collision bounds to detect entry/exit.',
  },

  // =============================================================================
  // INTERACTION EXCLUSIVITY (one-of rules)
  // =============================================================================
  {
    type: 'oneof',
    source: 'interaction_mode',
    targets: ['grabbable', 'clickable', 'draggable'],
    message: 'Objects should have one primary interaction mode to avoid conflicts.',
  },

  // =============================================================================
  // ANIMATION REQUIREMENTS
  // =============================================================================
  {
    type: 'requires',
    source: 'animated',
    targets: ['mesh'],
    message: 'Animated trait requires a mesh with animation data.',
  },

  // =============================================================================
  // NETWORKING REQUIREMENTS
  // =============================================================================
  {
    type: 'requires',
    source: 'networked',
    targets: ['physics'],
    message: 'Networked objects require physics for state synchronization.',
  },
  {
    type: 'conflicts',
    source: 'local_only',
    targets: ['networked'],
    message: 'Local-only objects cannot be networked.',
  },

  // =============================================================================
  // UI TRAIT CONSTRAINTS
  // =============================================================================
  {
    type: 'conflicts',
    source: 'ui_floating',
    targets: ['ui_anchored', 'ui_docked'],
    message: 'UI panels cannot be both floating and anchored/docked.',
  },
  {
    type: 'conflicts',
    source: 'ui_anchored',
    targets: ['ui_floating', 'ui_docked'],
    message: 'UI panels cannot be both anchored and floating/docked.',
  },
  {
    type: 'conflicts',
    source: 'ui_hand_menu',
    targets: ['ui_anchored', 'ui_docked'],
    message: 'Hand menus cannot be anchored to world or docked.',
  },
  {
    type: 'requires',
    source: 'ui_keyboard',
    targets: ['ui_input'],
    message: 'Keyboard trait requires an input element to target.',
  },
  {
    type: 'oneof',
    source: 'ui_position_mode',
    targets: ['ui_floating', 'ui_anchored', 'ui_docked', 'ui_hand_menu'],
    message: 'UI element can only have one positioning mode.',
  },

  // =============================================================================
  // SPATIAL CONSTRAINT TRAIT REQUIREMENTS
  // =============================================================================

  // spatial_adjacent requires collidable bounds for distance measurement
  {
    type: 'requires',
    source: 'spatial_adjacent',
    targets: ['collidable'],
    message:
      'spatial_adjacent requires collidable bounds to measure distance between entities.',
    suggestion:
      'Add @collidable to provide bounds for spatial adjacency checking.',
  },

  // spatial_contains requires collidable bounds to define the container volume
  {
    type: 'requires',
    source: 'spatial_contains',
    targets: ['collidable'],
    message:
      'spatial_contains requires collidable bounds to define the container volume.',
    suggestion:
      'Add @collidable to define the bounding volume for containment checking.',
  },

  // spatial_reachable requires spatial_awareness for runtime path validation
  {
    type: 'requires',
    source: 'spatial_reachable',
    targets: ['spatial_awareness'],
    message:
      'spatial_reachable requires spatial_awareness for runtime path and obstacle detection.',
    suggestion:
      'Add @spatial_awareness to enable spatial context for reachability checks.',
  },

  // spatial_contains conflicts with static (containers may need dynamic bounds)
  {
    type: 'conflicts',
    source: 'spatial_contains',
    targets: ['invisible'],
    message:
      'spatial_contains containers cannot be invisible; contained entities need visible boundary reference.',
    suggestion:
      'Remove @invisible or use @spatial_adjacent instead for invisible reference points.',
  },

  // Only one spatial constraint enforcement mode per entity
  {
    type: 'oneof',
    source: 'spatial_constraint_mode',
    targets: ['spatial_adjacent', 'spatial_contains'],
    message:
      'An entity should declare either spatial_adjacent or spatial_contains, not both. ' +
      'Use spatial_adjacent for proximity or spatial_contains for enclosure.',
    suggestion:
      'Choose the most appropriate spatial relationship: @spatial_adjacent for "near" or @spatial_contains for "inside".',
  },
];
