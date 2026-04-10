/**
 * Trait Documentation for HoloScript LSP
 *
 * Provides detailed documentation for all HoloScript traits
 * to display in hover/completion/signature help.
 */

export interface TraitDoc {
  name: string;
  annotation: string;
  description: string;
  category:
    | 'physics'
    | 'animation'
    | 'rendering'
    | 'networking'
    | 'input'
    | 'ai'
    | 'utility'
    | 'hololand';
  properties: PropertyDoc[];
  methods: MethodDoc[];
  events: EventDoc[];
  example: string;
  since?: string;
  deprecated?: boolean;
  deprecationMessage?: string;
}

export interface PropertyDoc {
  name: string;
  type: string;
  description: string;
  default?: string;
  required?: boolean;
}

export interface MethodDoc {
  name: string;
  signature: string;
  description: string;
  parameters: ParameterDoc[];
  returns?: string;
}

export interface ParameterDoc {
  name: string;
  type: string;
  description: string;
  optional?: boolean;
}

export interface EventDoc {
  name: string;
  description: string;
  payload?: string;
}

/**
 * Complete trait documentation database
 */
export const TRAIT_DOCS: Record<string, TraitDoc> = {
  // ============================================================================
  // Physics Traits
  // ============================================================================
  rigidbody: {
    name: 'RigidbodyTrait',
    annotation: '@rigidbody',
    description:
      'Enables physics simulation on an object. Supports dynamic, static, and kinematic body types with configurable mass, friction, and collision detection.',
    category: 'physics',
    properties: [
      {
        name: 'type',
        type: '"dynamic" | "static" | "kinematic"',
        description:
          'Body type. Dynamic bodies are affected by forces, static never move, kinematic are script-controlled.',
        default: '"dynamic"',
      },
      {
        name: 'mass',
        type: 'number',
        description: 'Mass of the body in kg. Only affects dynamic bodies.',
        default: '1.0',
      },
      {
        name: 'friction',
        type: 'number',
        description: 'Surface friction coefficient (0-1).',
        default: '0.5',
      },
      {
        name: 'restitution',
        type: 'number',
        description: 'Bounciness coefficient (0-1).',
        default: '0.0',
      },
      {
        name: 'linearDamping',
        type: 'number',
        description: 'Air resistance for linear motion.',
        default: '0.0',
      },
      {
        name: 'angularDamping',
        type: 'number',
        description: 'Air resistance for rotational motion.',
        default: '0.05',
      },
      {
        name: 'gravityScale',
        type: 'number',
        description: 'Multiplier for gravity. Set to 0 for floating objects.',
        default: '1.0',
      },
      {
        name: 'collisionGroup',
        type: 'number',
        description: 'Collision filtering group.',
        default: '1',
      },
      {
        name: 'collisionMask',
        type: 'number',
        description: 'Bit mask for collision filtering.',
        default: '-1',
      },
    ],
    methods: [
      {
        name: 'applyForce',
        signature: 'applyForce(force: Vec3): void',
        description: 'Apply a force to the center of mass.',
        parameters: [{ name: 'force', type: 'Vec3', description: 'Force vector in world space' }],
      },
      {
        name: 'applyImpulse',
        signature: 'applyImpulse(impulse: Vec3, point?: Vec3): void',
        description: 'Apply an instant impulse.',
        parameters: [
          { name: 'impulse', type: 'Vec3', description: 'Impulse vector' },
          {
            name: 'point',
            type: 'Vec3',
            description: 'Application point (optional)',
            optional: true,
          },
        ],
      },
      {
        name: 'applyTorque',
        signature: 'applyTorque(torque: Vec3): void',
        description: 'Apply rotational force.',
        parameters: [{ name: 'torque', type: 'Vec3', description: 'Torque vector' }],
      },
      {
        name: 'setVelocity',
        signature: 'setVelocity(velocity: Vec3): void',
        description: 'Set linear velocity directly.',
        parameters: [{ name: 'velocity', type: 'Vec3', description: 'Velocity vector' }],
      },
      {
        name: 'getVelocity',
        signature: 'getVelocity(): Vec3',
        description: 'Get current linear velocity.',
        parameters: [],
        returns: 'Vec3',
      },
    ],
    events: [
      {
        name: 'onCollisionStart',
        description: 'Fired when collision begins.',
        payload: '{ other: Entity, point: Vec3, normal: Vec3 }',
      },
      {
        name: 'onCollisionEnd',
        description: 'Fired when collision ends.',
        payload: '{ other: Entity }',
      },
    ],
    example: `@rigidbody({ type: "dynamic", mass: 2.0, friction: 0.3 })
orb physics_cube {
  position: [0, 5, 0]
  on_collision: {
    play_sound: "impact.mp3"
  }
}`,
    since: '1.0.0',
  },

  trigger: {
    name: 'TriggerTrait',
    annotation: '@trigger',
    description:
      'Creates a trigger volume that detects when objects enter or exit. Does not cause physical collisions.',
    category: 'physics',
    properties: [
      {
        name: 'shape',
        type: '"box" | "sphere" | "capsule"',
        description: 'Trigger volume shape.',
        default: '"box"',
      },
      {
        name: 'size',
        type: 'Vec3',
        description: 'Size of the trigger volume.',
        default: '[1, 1, 1]',
      },
      {
        name: 'radius',
        type: 'number',
        description: 'Radius for sphere/capsule triggers.',
        default: '0.5',
      },
      {
        name: 'height',
        type: 'number',
        description: 'Height for capsule triggers.',
        default: '2.0',
      },
      {
        name: 'layer',
        type: 'string',
        description: 'Collision layer for filtering.',
        default: '"default"',
      },
      { name: 'once', type: 'boolean', description: 'Trigger only fires once.', default: 'false' },
    ],
    methods: [
      {
        name: 'enable',
        signature: 'enable(): void',
        description: 'Enable the trigger.',
        parameters: [],
      },
      {
        name: 'disable',
        signature: 'disable(): void',
        description: 'Disable the trigger.',
        parameters: [],
      },
      {
        name: 'reset',
        signature: 'reset(): void',
        description: 'Reset a once-fire trigger.',
        parameters: [],
      },
      {
        name: 'getOverlapping',
        signature: 'getOverlapping(): Entity[]',
        description: 'Get all entities currently inside.',
        parameters: [],
        returns: 'Entity[]',
      },
    ],
    events: [
      {
        name: 'onTriggerEnter',
        description: 'Fired when an object enters the trigger.',
        payload: '{ entity: Entity }',
      },
      {
        name: 'onTriggerExit',
        description: 'Fired when an object exits the trigger.',
        payload: '{ entity: Entity }',
      },
      {
        name: 'onTriggerStay',
        description: 'Fired each frame an object is inside (use cautiously).',
        payload: '{ entity: Entity }',
      },
    ],
    example: `@trigger({ shape: "sphere", radius: 3.0, layer: "player" })
orb checkpoint {
  position: [10, 0, 0]
  on_trigger_enter: {
    save_progress: true
    play_sound: "checkpoint.mp3"
  }
}`,
    since: '1.0.0',
  },

  joint: {
    name: 'JointTrait',
    annotation: '@joint',
    description:
      'Creates a physics joint connecting two rigidbodies. Supports various joint types for complex mechanical systems.',
    category: 'physics',
    properties: [
      {
        name: 'type',
        type: '"fixed" | "hinge" | "ball" | "slider" | "spring" | "distance"',
        description: 'Type of joint.',
        required: true,
      },
      { name: 'target', type: 'string', description: 'Entity ID to connect to.', required: true },
      { name: 'anchor', type: 'Vec3', description: 'Local anchor point.', default: '[0, 0, 0]' },
      {
        name: 'targetAnchor',
        type: 'Vec3',
        description: 'Anchor point on target.',
        default: '[0, 0, 0]',
      },
      {
        name: 'axis',
        type: 'Vec3',
        description: 'Axis for hinge/slider joints.',
        default: '[0, 1, 0]',
      },
      {
        name: 'minLimit',
        type: 'number',
        description: 'Minimum angle/distance limit.',
        default: '-Infinity',
      },
      {
        name: 'maxLimit',
        type: 'number',
        description: 'Maximum angle/distance limit.',
        default: 'Infinity',
      },
      {
        name: 'breakForce',
        type: 'number',
        description: 'Force required to break joint.',
        default: 'Infinity',
      },
      {
        name: 'spring',
        type: 'number',
        description: 'Spring stiffness for spring joints.',
        default: '0',
      },
      { name: 'damper', type: 'number', description: 'Damping for spring joints.', default: '0' },
    ],
    methods: [
      {
        name: 'break',
        signature: 'break(): void',
        description: 'Manually break the joint.',
        parameters: [],
      },
      {
        name: 'setMotor',
        signature: 'setMotor(speed: number, maxForce: number): void',
        description: 'Set motor parameters for hinge/slider.',
        parameters: [
          { name: 'speed', type: 'number', description: 'Target speed' },
          { name: 'maxForce', type: 'number', description: 'Maximum motor force' },
        ],
      },
    ],
    events: [
      {
        name: 'onJointBreak',
        description: 'Fired when joint breaks.',
        payload: '{ force: number }',
      },
    ],
    example: `@joint({ type: "hinge", target: "door_frame", axis: [0, 1, 0], minLimit: 0, maxLimit: 90 })
orb door {
  position: [0, 1, 0]
}`,
    since: '1.2.0',
  },

  // ============================================================================
  // Animation Traits
  // ============================================================================
  ik: {
    name: 'IKTrait',
    annotation: '@ik',
    description:
      'Inverse Kinematics for skeletal animation. Supports FABRIK, CCD, Two-Bone, and Full-Body solvers for realistic limb positioning.',
    category: 'animation',
    properties: [
      {
        name: 'solver',
        type: '"fabrik" | "ccd" | "two-bone" | "full-body"',
        description: 'IK solver algorithm to use.',
        default: '"fabrik"',
      },
      {
        name: 'iterations',
        type: 'number',
        description: 'Solver iterations per frame.',
        default: '10',
      },
      {
        name: 'tolerance',
        type: 'number',
        description: 'Position tolerance for convergence.',
        default: '0.001',
      },
      { name: 'chains', type: 'IKChain[]', description: 'IK chain definitions.', required: true },
      {
        name: 'constraints',
        type: 'JointConstraint[]',
        description: 'Joint rotation constraints.',
      },
    ],
    methods: [
      {
        name: 'solve',
        signature: 'solve(target: Vec3): boolean',
        description: 'Solve IK for a target position.',
        parameters: [
          { name: 'target', type: 'Vec3', description: 'Target position in world space' },
        ],
        returns: 'boolean',
      },
      {
        name: 'addChain',
        signature: 'addChain(chain: IKChain): void',
        description: 'Add an IK chain.',
        parameters: [{ name: 'chain', type: 'IKChain', description: 'Chain configuration' }],
      },
      {
        name: 'removeChain',
        signature: 'removeChain(name: string): void',
        description: 'Remove an IK chain.',
        parameters: [{ name: 'name', type: 'string', description: 'Chain name' }],
      },
      {
        name: 'setTarget',
        signature: 'setTarget(chainName: string, target: Vec3): void',
        description: 'Set target for a specific chain.',
        parameters: [
          { name: 'chainName', type: 'string', description: 'Chain to target' },
          { name: 'target', type: 'Vec3', description: 'Target position' },
        ],
      },
    ],
    events: [
      {
        name: 'onIKSolved',
        description: 'Fired when IK solution is found.',
        payload: '{ chain: string, iterations: number }',
      },
      {
        name: 'onIKFailed',
        description: 'Fired when IK cannot reach target.',
        payload: '{ chain: string, distance: number }',
      },
    ],
    example: `@ik({ solver: "fabrik", iterations: 20 })
@skeleton({ armature: "humanoid" })
orb character {
  chains: [
    { name: "left_arm", bones: ["shoulder_l", "elbow_l", "wrist_l"], target: "left_hand_target" },
    { name: "right_arm", bones: ["shoulder_r", "elbow_r", "wrist_r"], target: "right_hand_target" }
  ]
}`,
    since: '1.3.0',
  },

  skeleton: {
    name: 'SkeletonTrait',
    annotation: '@skeleton',
    description:
      'Skeletal animation system for rigged models. Supports blend trees, animation layers, and procedural bone control.',
    category: 'animation',
    properties: [
      {
        name: 'armature',
        type: 'string',
        description: 'Armature/skeleton asset reference.',
        required: true,
      },
      { name: 'animations', type: 'AnimationClip[]', description: 'Available animation clips.' },
      { name: 'defaultAnimation', type: 'string', description: 'Animation to play on start.' },
      {
        name: 'blendMode',
        type: '"override" | "additive"',
        description: 'How animations combine.',
        default: '"override"',
      },
    ],
    methods: [
      {
        name: 'play',
        signature: 'play(name: string, options?: PlayOptions): void',
        description: 'Play an animation.',
        parameters: [
          { name: 'name', type: 'string', description: 'Animation name' },
          { name: 'options', type: 'PlayOptions', description: 'Playback options', optional: true },
        ],
      },
      {
        name: 'stop',
        signature: 'stop(name?: string): void',
        description: 'Stop animation(s).',
        parameters: [
          {
            name: 'name',
            type: 'string',
            description: 'Specific animation or all',
            optional: true,
          },
        ],
      },
      {
        name: 'crossFade',
        signature: 'crossFade(name: string, duration: number): void',
        description: 'Smoothly transition to animation.',
        parameters: [
          { name: 'name', type: 'string', description: 'Target animation' },
          { name: 'duration', type: 'number', description: 'Transition duration in seconds' },
        ],
      },
      {
        name: 'getBone',
        signature: 'getBone(name: string): Bone',
        description: 'Get bone for manual manipulation.',
        parameters: [{ name: 'name', type: 'string', description: 'Bone name' }],
        returns: 'Bone',
      },
      {
        name: 'setLayerWeight',
        signature: 'setLayerWeight(layer: number, weight: number): void',
        description: 'Set animation layer blend weight.',
        parameters: [
          { name: 'layer', type: 'number', description: 'Layer index' },
          { name: 'weight', type: 'number', description: 'Blend weight (0-1)' },
        ],
      },
    ],
    events: [
      {
        name: 'onAnimationStart',
        description: 'Fired when animation starts.',
        payload: '{ name: string }',
      },
      {
        name: 'onAnimationEnd',
        description: 'Fired when animation completes.',
        payload: '{ name: string }',
      },
      {
        name: 'onAnimationLoop',
        description: 'Fired when animation loops.',
        payload: '{ name: string, loopCount: number }',
      },
    ],
    example: `@skeleton({ armature: "humanoid_rig" })
orb character {
  model: "character.glb"
  animations: ["idle", "walk", "run", "jump"]
  defaultAnimation: "idle"
}`,
    since: '1.0.0',
  },

  morph: {
    name: 'MorphTrait',
    annotation: '@morph',
    description:
      'Morph target (blend shape) animation for facial expressions and mesh deformation.',
    category: 'animation',
    properties: [
      { name: 'targets', type: 'string[]', description: 'Available morph target names.' },
      { name: 'weights', type: 'Record<string, number>', description: 'Initial morph weights.' },
    ],
    methods: [
      {
        name: 'setWeight',
        signature: 'setWeight(target: string, weight: number): void',
        description: 'Set morph target weight.',
        parameters: [
          { name: 'target', type: 'string', description: 'Target name' },
          { name: 'weight', type: 'number', description: 'Weight (0-1)' },
        ],
      },
      {
        name: 'getWeight',
        signature: 'getWeight(target: string): number',
        description: 'Get current weight.',
        parameters: [{ name: 'target', type: 'string', description: 'Target name' }],
        returns: 'number',
      },
      {
        name: 'animate',
        signature:
          'animate(target: string, from: number, to: number, duration: number): Promise<void>',
        description: 'Animate morph weight.',
        parameters: [
          { name: 'target', type: 'string', description: 'Target name' },
          { name: 'from', type: 'number', description: 'Start weight' },
          { name: 'to', type: 'number', description: 'End weight' },
          { name: 'duration', type: 'number', description: 'Duration in seconds' },
        ],
      },
    ],
    events: [],
    example: `@morph({ targets: ["smile", "frown", "blink_l", "blink_r"] })
orb face {
  model: "head.glb"
  weights: { smile: 0.5 }
}`,
    since: '1.4.0',
  },

  // ============================================================================
  // Rendering Traits
  // ============================================================================
  material: {
    name: 'MaterialTrait',
    annotation: '@material',
    description:
      'Custom material properties for advanced rendering. Supports PBR, custom shaders, and dynamic material updates.',
    category: 'rendering',
    properties: [
      {
        name: 'type',
        type: '"standard" | "unlit" | "custom"',
        description: 'Material type.',
        default: '"standard"',
      },
      { name: 'color', type: 'Color', description: 'Base color.', default: '[1, 1, 1]' },
      { name: 'metalness', type: 'number', description: 'Metallic factor (0-1).', default: '0.0' },
      { name: 'roughness', type: 'number', description: 'Roughness factor (0-1).', default: '1.0' },
      { name: 'emissive', type: 'Color', description: 'Emissive color.' },
      {
        name: 'emissiveIntensity',
        type: 'number',
        description: 'Emission intensity.',
        default: '1.0',
      },
      {
        name: 'transparent',
        type: 'boolean',
        description: 'Enable transparency.',
        default: 'false',
      },
      { name: 'opacity', type: 'number', description: 'Opacity (0-1).', default: '1.0' },
      { name: 'doubleSided', type: 'boolean', description: 'Render both sides.', default: 'false' },
      { name: 'map', type: 'string', description: 'Diffuse texture path.' },
      { name: 'normalMap', type: 'string', description: 'Normal map path.' },
      { name: 'roughnessMap', type: 'string', description: 'Roughness texture path.' },
      { name: 'metalnessMap', type: 'string', description: 'Metalness texture path.' },
      { name: 'emissiveMap', type: 'string', description: 'Emission texture path.' },
      { name: 'aoMap', type: 'string', description: 'Ambient occlusion texture path.' },
    ],
    methods: [
      {
        name: 'setColor',
        signature: 'setColor(color: Color): void',
        description: 'Set base color.',
        parameters: [{ name: 'color', type: 'Color', description: 'RGB color' }],
      },
      {
        name: 'setTexture',
        signature: 'setTexture(slot: string, path: string): void',
        description: 'Set a texture.',
        parameters: [
          { name: 'slot', type: 'string', description: 'Texture slot name' },
          { name: 'path', type: 'string', description: 'Asset path' },
        ],
      },
      {
        name: 'setUniform',
        signature: 'setUniform(name: string, value: any): void',
        description: 'Set custom shader uniform.',
        parameters: [
          { name: 'name', type: 'string', description: 'Uniform name' },
          { name: 'value', type: 'any', description: 'Uniform value' },
        ],
      },
    ],
    events: [],
    example: `@material({ 
  type: "standard",
  color: [0.8, 0.2, 0.2],
  metalness: 0.9,
  roughness: 0.1,
  emissive: [1, 0, 0],
  emissiveIntensity: 0.5
})
orb glowing_metal_sphere {
  model: "sphere"
}`,
    since: '1.0.0',
  },

  shader: {
    name: 'ShaderTrait',
    annotation: '@shader',
    description:
      'Custom shader support for advanced visual effects. Write GLSL or use shader graphs.',
    category: 'rendering',
    properties: [
      { name: 'vertex', type: 'string', description: 'Vertex shader source/path.' },
      { name: 'fragment', type: 'string', description: 'Fragment shader source/path.' },
      {
        name: 'uniforms',
        type: 'Record<string, UniformDef>',
        description: 'Shader uniform definitions.',
      },
      { name: 'defines', type: 'Record<string, string>', description: 'Preprocessor defines.' },
    ],
    methods: [
      {
        name: 'setUniform',
        signature: 'setUniform(name: string, value: any): void',
        description: 'Set uniform value.',
        parameters: [
          { name: 'name', type: 'string', description: 'Uniform name' },
          { name: 'value', type: 'any', description: 'Value' },
        ],
      },
      {
        name: 'recompile',
        signature: 'recompile(): void',
        description: 'Recompile shaders.',
        parameters: [],
      },
    ],
    events: [
      {
        name: 'onShaderError',
        description: 'Fired on compilation error.',
        payload: '{ error: string, line: number }',
      },
    ],
    example: `@shader({
  fragment: "shaders/hologram.frag",
  uniforms: {
    time: { type: "float", value: 0 },
    scanlineSpeed: { type: "float", value: 2.0 }
  }
})
orb hologram {
  on_update: {
    shader.time = Time.elapsed
  }
}`,
    since: '1.1.0',
  },

  lighting: {
    name: 'LightingTrait',
    annotation: '@lighting',
    description:
      'Light source configuration. Create point lights, spot lights, and directional lights.',
    category: 'rendering',
    properties: [
      {
        name: 'type',
        type: '"point" | "spot" | "directional" | "area"',
        description: 'Light type.',
        required: true,
      },
      { name: 'color', type: 'Color', description: 'Light color.', default: '[1, 1, 1]' },
      { name: 'intensity', type: 'number', description: 'Light intensity.', default: '1.0' },
      { name: 'range', type: 'number', description: 'Light range for point/spot.' },
      {
        name: 'angle',
        type: 'number',
        description: 'Cone angle for spot lights (degrees).',
        default: '45',
      },
      {
        name: 'penumbra',
        type: 'number',
        description: 'Soft edge percentage for spots.',
        default: '0.1',
      },
      {
        name: 'castShadow',
        type: 'boolean',
        description: 'Enable shadow casting.',
        default: 'false',
      },
      {
        name: 'shadowMapSize',
        type: 'number',
        description: 'Shadow map resolution.',
        default: '512',
      },
      {
        name: 'shadowBias',
        type: 'number',
        description: 'Shadow bias to prevent artifacts.',
        default: '0.0001',
      },
    ],
    methods: [
      {
        name: 'setIntensity',
        signature: 'setIntensity(intensity: number): void',
        description: 'Set light intensity.',
        parameters: [{ name: 'intensity', type: 'number', description: 'New intensity' }],
      },
      {
        name: 'setColor',
        signature: 'setColor(color: Color): void',
        description: 'Set light color.',
        parameters: [{ name: 'color', type: 'Color', description: 'RGB color' }],
      },
    ],
    events: [],
    example: `@lighting({ type: "spot", color: [1, 0.9, 0.8], intensity: 2.0, angle: 30, castShadow: true })
orb spotlight {
  position: [0, 5, 0]
  rotation: [90, 0, 0]
}`,
    since: '1.0.0',
  },

  rendering: {
    name: 'RenderingTrait',
    annotation: '@rendering',
    description:
      'Advanced rendering options for objects. Control visibility, render order, and special effects.',
    category: 'rendering',
    properties: [
      { name: 'visible', type: 'boolean', description: 'Object visibility.', default: 'true' },
      {
        name: 'castShadow',
        type: 'boolean',
        description: 'Object casts shadows.',
        default: 'true',
      },
      {
        name: 'receiveShadow',
        type: 'boolean',
        description: 'Object receives shadows.',
        default: 'true',
      },
      { name: 'renderOrder', type: 'number', description: 'Manual render order.', default: '0' },
      {
        name: 'frustumCulled',
        type: 'boolean',
        description: 'Enable frustum culling.',
        default: 'true',
      },
      { name: 'layers', type: 'number', description: 'Visibility layer mask.', default: '1' },
    ],
    methods: [
      {
        name: 'show',
        signature: 'show(): void',
        description: 'Make object visible.',
        parameters: [],
      },
      { name: 'hide', signature: 'hide(): void', description: 'Hide object.', parameters: [] },
      {
        name: 'setLayer',
        signature: 'setLayer(layer: number): void',
        description: 'Set visibility layer.',
        parameters: [{ name: 'layer', type: 'number', description: 'Layer index' }],
      },
    ],
    events: [
      { name: 'onBecameVisible', description: 'Fired when object enters camera view.' },
      { name: 'onBecameInvisible', description: 'Fired when object leaves camera view.' },
    ],
    example: `@rendering({ castShadow: true, receiveShadow: false, renderOrder: 100 })
orb ui_element {
  // Renders on top due to high renderOrder
}`,
    since: '1.0.0',
  },

  // ============================================================================
  // Networking Traits
  // ============================================================================
  networked: {
    name: 'NetworkedTrait',
    annotation: '@networked',
    description:
      'Enable multiplayer synchronization for an object. Automatically syncs position, rotation, and custom state across clients.',
    category: 'networking',
    properties: [
      {
        name: 'owner',
        type: '"server" | "client" | "shared"',
        description: 'Ownership model.',
        default: '"server"',
      },
      { name: 'syncRate', type: 'number', description: 'Sync updates per second.', default: '20' },
      {
        name: 'interpolate',
        type: 'boolean',
        description: 'Smooth position updates.',
        default: 'true',
      },
      { name: 'syncPosition', type: 'boolean', description: 'Sync position.', default: 'true' },
      { name: 'syncRotation', type: 'boolean', description: 'Sync rotation.', default: 'true' },
      { name: 'syncScale', type: 'boolean', description: 'Sync scale.', default: 'false' },
      { name: 'syncProperties', type: 'string[]', description: 'Custom properties to sync.' },
      {
        name: 'priority',
        type: '"low" | "medium" | "high"',
        description: 'Network priority.',
        default: '"medium"',
      },
    ],
    methods: [
      {
        name: 'requestOwnership',
        signature: 'requestOwnership(): Promise<boolean>',
        description: 'Request ownership of this object.',
        parameters: [],
        returns: 'Promise<boolean>',
      },
      {
        name: 'releaseOwnership',
        signature: 'releaseOwnership(): void',
        description: 'Release ownership.',
        parameters: [],
      },
      {
        name: 'rpc',
        signature: 'rpc(method: string, ...args: any[]): void',
        description: 'Call a method on all clients.',
        parameters: [
          { name: 'method', type: 'string', description: 'Method name' },
          { name: 'args', type: 'any[]', description: 'Arguments' },
        ],
      },
      {
        name: 'rpcTo',
        signature: 'rpcTo(clientId: string, method: string, ...args: any[]): void',
        description: 'Call method on specific client.',
        parameters: [
          { name: 'clientId', type: 'string', description: 'Target client' },
          { name: 'method', type: 'string', description: 'Method name' },
          { name: 'args', type: 'any[]', description: 'Arguments' },
        ],
      },
    ],
    events: [
      {
        name: 'onOwnershipChanged',
        description: 'Fired when owner changes.',
        payload: '{ oldOwner: string, newOwner: string }',
      },
      {
        name: 'onSyncReceived',
        description: 'Fired when sync update received.',
        payload: '{ delta: number }',
      },
    ],
    example: `@networked({ owner: "client", syncRate: 30, syncProperties: ["health", "score"] })
orb player {
  state: {
    health: 100
    score: 0
  }
}`,
    since: '1.0.0',
  },

  lobby: {
    name: 'LobbyTrait',
    annotation: '@lobby',
    description:
      'Multiplayer lobby management. Handle room creation, matchmaking, and player management.',
    category: 'networking',
    properties: [
      {
        name: 'maxPlayers',
        type: 'number',
        description: 'Maximum players in lobby.',
        default: '8',
      },
      {
        name: 'isPublic',
        type: 'boolean',
        description: 'Lobby is publicly visible.',
        default: 'true',
      },
      { name: 'gameMode', type: 'string', description: 'Game mode identifier.' },
      { name: 'region', type: 'string', description: 'Preferred server region.' },
      { name: 'metadata', type: 'Record<string, any>', description: 'Custom lobby metadata.' },
    ],
    methods: [
      {
        name: 'create',
        signature: 'create(options?: LobbyOptions): Promise<string>',
        description: 'Create a new lobby.',
        parameters: [
          { name: 'options', type: 'LobbyOptions', description: 'Lobby options', optional: true },
        ],
        returns: 'Promise<string>',
      },
      {
        name: 'join',
        signature: 'join(lobbyId: string): Promise<boolean>',
        description: 'Join an existing lobby.',
        parameters: [{ name: 'lobbyId', type: 'string', description: 'Lobby ID' }],
        returns: 'Promise<boolean>',
      },
      {
        name: 'leave',
        signature: 'leave(): void',
        description: 'Leave current lobby.',
        parameters: [],
      },
      {
        name: 'kick',
        signature: 'kick(playerId: string, reason?: string): void',
        description: 'Kick a player (host only).',
        parameters: [
          { name: 'playerId', type: 'string', description: 'Player to kick' },
          { name: 'reason', type: 'string', description: 'Kick reason', optional: true },
        ],
      },
      {
        name: 'startGame',
        signature: 'startGame(): void',
        description: 'Start the game (host only).',
        parameters: [],
      },
    ],
    events: [
      {
        name: 'onPlayerJoined',
        description: 'Fired when player joins.',
        payload: '{ player: PlayerInfo }',
      },
      {
        name: 'onPlayerLeft',
        description: 'Fired when player leaves.',
        payload: '{ player: PlayerInfo, reason: string }',
      },
      { name: 'onGameStarted', description: 'Fired when game starts.' },
      {
        name: 'onLobbyUpdated',
        description: 'Fired when lobby settings change.',
        payload: '{ changes: Record<string, any> }',
      },
    ],
    example: `@lobby({ maxPlayers: 4, isPublic: true, gameMode: "deathmatch" })
world arena_lobby {
  on_player_joined: {
    spawn_player: { at: "spawn_point" }
  }
}`,
    since: '1.2.0',
  },

  // ============================================================================
  // Input Traits
  // ============================================================================
  voice_input: {
    name: 'VoiceInputTrait',
    annotation: '@voice_input',
    description:
      'Voice recognition for hands-free interaction. Supports custom commands, continuous listening, and multiple languages.',
    category: 'input',
    properties: [
      { name: 'commands', type: 'VoiceCommand[]', description: 'Recognized voice commands.' },
      {
        name: 'language',
        type: 'string',
        description: 'Recognition language.',
        default: '"en-US"',
      },
      {
        name: 'continuous',
        type: 'boolean',
        description: 'Listen continuously.',
        default: 'false',
      },
      {
        name: 'interimResults',
        type: 'boolean',
        description: 'Report partial results.',
        default: 'false',
      },
      {
        name: 'confidenceThreshold',
        type: 'number',
        description: 'Minimum confidence (0-1).',
        default: '0.7',
      },
    ],
    methods: [
      {
        name: 'start',
        signature: 'start(): void',
        description: 'Start listening.',
        parameters: [],
      },
      { name: 'stop', signature: 'stop(): void', description: 'Stop listening.', parameters: [] },
      {
        name: 'addCommand',
        signature: 'addCommand(phrase: string, handler: Function): void',
        description: 'Add a voice command.',
        parameters: [
          { name: 'phrase', type: 'string', description: 'Trigger phrase' },
          { name: 'handler', type: 'Function', description: 'Handler function' },
        ],
      },
    ],
    events: [
      {
        name: 'onCommand',
        description: 'Fired when command recognized.',
        payload: '{ command: string, confidence: number }',
      },
      { name: 'onSpeechStart', description: 'Fired when speech detected.' },
      { name: 'onSpeechEnd', description: 'Fired when speech ends.' },
      { name: 'onError', description: 'Fired on recognition error.', payload: '{ error: string }' },
    ],
    example: `@voice_input({ language: "en-US", continuous: true })
orb voice_controller {
  commands: [
    "jump": { action: player.jump },
    "attack": { action: player.attack },
    "open inventory": { action: ui.openInventory }
  ]
}`,
    since: '1.3.0',
  },

  // ============================================================================
  // AI Traits
  // ============================================================================
  ai_driver: {
    name: 'AIDriverTrait',
    annotation: '@ai_driver',
    description:
      'AI-powered NPC behavior using LLM integration. Create intelligent, conversational characters.',
    category: 'ai',
    properties: [
      { name: 'model', type: 'string', description: 'LLM model to use.', default: '"gpt-4"' },
      { name: 'systemPrompt', type: 'string', description: 'System prompt defining character.' },
      {
        name: 'memory',
        type: 'boolean',
        description: 'Remember conversation history.',
        default: 'true',
      },
      {
        name: 'memoryLimit',
        type: 'number',
        description: 'Max conversation turns to remember.',
        default: '20',
      },
      {
        name: 'temperature',
        type: 'number',
        description: 'Response creativity (0-1).',
        default: '0.7',
      },
      { name: 'maxTokens', type: 'number', description: 'Max response length.', default: '150' },
    ],
    methods: [
      {
        name: 'chat',
        signature: 'chat(message: string): Promise<string>',
        description: 'Send message and get response.',
        parameters: [{ name: 'message', type: 'string', description: 'User message' }],
        returns: 'Promise<string>',
      },
      {
        name: 'setPersonality',
        signature: 'setPersonality(prompt: string): void',
        description: 'Update system prompt.',
        parameters: [{ name: 'prompt', type: 'string', description: 'New system prompt' }],
      },
      {
        name: 'clearMemory',
        signature: 'clearMemory(): void',
        description: 'Clear conversation history.',
        parameters: [],
      },
      {
        name: 'getEmotion',
        signature: 'getEmotion(): string',
        description: 'Get current emotional state.',
        parameters: [],
        returns: 'string',
      },
    ],
    events: [
      {
        name: 'onResponse',
        description: 'Fired when AI responds.',
        payload: '{ response: string, emotion: string }',
      },
      {
        name: 'onEmotionChange',
        description: 'Fired when emotion changes.',
        payload: '{ from: string, to: string }',
      },
    ],
    example: `@ai_driver({
  model: "gpt-4",
  systemPrompt: "You are a wise old wizard named Gandalf. Speak in riddles and offer cryptic advice.",
  temperature: 0.8
})
orb wizard_npc {
  traits: ["talkable"]
  on_player_approach: {
    say: "Ah, a traveler! What wisdom do you seek?"
  }
}`,
    since: '2.0.0',
  },

  dialog: {
    name: 'DialogTrait',
    annotation: '@dialog',
    description:
      'Dialog tree system for structured NPC conversations. Supports branching paths, conditions, and effects.',
    category: 'ai',
    properties: [
      { name: 'tree', type: 'DialogNode[]', description: 'Dialog tree structure.' },
      { name: 'startNode', type: 'string', description: 'Initial dialog node ID.' },
      {
        name: 'autoAdvance',
        type: 'boolean',
        description: 'Auto-advance on single option.',
        default: 'false',
      },
      {
        name: 'typewriterSpeed',
        type: 'number',
        description: 'Text reveal speed (chars/sec).',
        default: '30',
      },
    ],
    methods: [
      {
        name: 'start',
        signature: 'start(nodeId?: string): void',
        description: 'Start dialog.',
        parameters: [
          { name: 'nodeId', type: 'string', description: 'Starting node', optional: true },
        ],
      },
      {
        name: 'choose',
        signature: 'choose(optionIndex: number): void',
        description: 'Select dialog option.',
        parameters: [{ name: 'optionIndex', type: 'number', description: 'Option index' }],
      },
      {
        name: 'skip',
        signature: 'skip(): void',
        description: 'Skip current text animation.',
        parameters: [],
      },
      { name: 'end', signature: 'end(): void', description: 'End dialog tree.', parameters: [] },
    ],
    events: [
      {
        name: 'onNodeEnter',
        description: 'Fired when entering a node.',
        payload: '{ nodeId: string, text: string }',
      },
      {
        name: 'onDialogEnd',
        description: 'Fired when dialog ends.',
        payload: '{ endNode: string }',
      },
      {
        name: 'onEffectTriggered',
        description: 'Fired when node effect runs.',
        payload: '{ effect: string }',
      },
    ],
    example: `@dialog({ startNode: "greeting" })
orb shopkeeper {
  tree: [
    { id: "greeting", text: "Welcome! What can I help you with?", options: [
      { text: "Show me your wares", next: "shop" },
      { text: "Tell me about the town", next: "lore" },
      { text: "Goodbye", next: "farewell" }
    ]},
    { id: "farewell", text: "Safe travels!", end: true }
  ]
}`,
    since: '1.4.0',
  },

  character: {
    name: 'CharacterTrait',
    annotation: '@character',
    description:
      'Character controller for player or NPC movement. Handles walking, jumping, and ground detection.',
    category: 'utility',
    properties: [
      { name: 'moveSpeed', type: 'number', description: 'Movement speed.', default: '5.0' },
      { name: 'runSpeed', type: 'number', description: 'Running speed.', default: '10.0' },
      { name: 'jumpForce', type: 'number', description: 'Jump force.', default: '5.0' },
      { name: 'gravity', type: 'number', description: 'Custom gravity.', default: '-20' },
      {
        name: 'groundLayer',
        type: 'string',
        description: 'Ground collision layer.',
        default: '"ground"',
      },
      {
        name: 'slopeLimit',
        type: 'number',
        description: 'Max walkable slope (degrees).',
        default: '45',
      },
      { name: 'stepOffset', type: 'number', description: 'Max step height.', default: '0.3' },
    ],
    methods: [
      {
        name: 'move',
        signature: 'move(direction: Vec3): void',
        description: 'Move in direction.',
        parameters: [{ name: 'direction', type: 'Vec3', description: 'Movement direction' }],
      },
      {
        name: 'jump',
        signature: 'jump(): void',
        description: 'Make character jump.',
        parameters: [],
      },
      {
        name: 'teleport',
        signature: 'teleport(position: Vec3): void',
        description: 'Teleport to position.',
        parameters: [{ name: 'position', type: 'Vec3', description: 'Target position' }],
      },
      {
        name: 'isGrounded',
        signature: 'isGrounded(): boolean',
        description: 'Check if on ground.',
        parameters: [],
        returns: 'boolean',
      },
    ],
    events: [
      { name: 'onLand', description: 'Fired when landing.', payload: '{ velocity: number }' },
      { name: 'onJump', description: 'Fired when jumping.' },
    ],
    example: `@character({ moveSpeed: 6.0, jumpForce: 8.0 })
@rigidbody({ type: "kinematic" })
orb player {
  on_input: {
    move: input.direction * this.moveSpeed
  }
  on_jump_pressed: {
    if (this.isGrounded()) { this.jump() }
  }
}`,
    since: '1.0.0',
  },

  animation: {
    name: 'AnimationTrait',
    annotation: '@animation',
    description:
      'Simple keyframe animation for objects. Supports looping, easing, and property animation.',
    category: 'animation',
    properties: [
      {
        name: 'autoplay',
        type: 'boolean',
        description: 'Start animation automatically.',
        default: 'false',
      },
      { name: 'loop', type: 'boolean', description: 'Loop animation.', default: 'false' },
      { name: 'duration', type: 'number', description: 'Animation duration in seconds.' },
      {
        name: 'easing',
        type: '"linear" | "easeIn" | "easeOut" | "easeInOut"',
        description: 'Easing function.',
        default: '"linear"',
      },
      { name: 'keyframes', type: 'Keyframe[]', description: 'Animation keyframes.' },
    ],
    methods: [
      { name: 'play', signature: 'play(): void', description: 'Start animation.', parameters: [] },
      {
        name: 'pause',
        signature: 'pause(): void',
        description: 'Pause animation.',
        parameters: [],
      },
      {
        name: 'stop',
        signature: 'stop(): void',
        description: 'Stop and reset animation.',
        parameters: [],
      },
      {
        name: 'seek',
        signature: 'seek(time: number): void',
        description: 'Jump to time.',
        parameters: [{ name: 'time', type: 'number', description: 'Time in seconds' }],
      },
      {
        name: 'reverse',
        signature: 'reverse(): void',
        description: 'Reverse playback direction.',
        parameters: [],
      },
    ],
    events: [
      { name: 'onComplete', description: 'Fired when animation completes.' },
      { name: 'onLoop', description: 'Fired on each loop.', payload: '{ count: number }' },
    ],
    example: `@animation({ 
  duration: 2.0, 
  loop: true, 
  easing: "easeInOut",
  autoplay: true
})
orb rotating_coin {
  keyframes: [
    { time: 0, rotation: [0, 0, 0] },
    { time: 1, rotation: [0, 180, 0] },
    { time: 2, rotation: [0, 360, 0] }
  ]
}`,
    since: '1.0.0',
  },

  voice_output: {
    name: 'VoiceOutputTrait',
    annotation: '@voice_output',
    description:
      'Text-to-speech for NPC dialog and narration. Supports multiple voices and real-time speech.',
    category: 'input',
    properties: [
      { name: 'voice', type: 'string', description: 'Voice identifier.' },
      { name: 'pitch', type: 'number', description: 'Voice pitch (0.5-2.0).', default: '1.0' },
      { name: 'rate', type: 'number', description: 'Speech rate (0.5-2.0).', default: '1.0' },
      { name: 'volume', type: 'number', description: 'Volume (0-1).', default: '1.0' },
    ],
    methods: [
      {
        name: 'speak',
        signature: 'speak(text: string): Promise<void>',
        description: 'Speak text.',
        parameters: [{ name: 'text', type: 'string', description: 'Text to speak' }],
      },
      { name: 'stop', signature: 'stop(): void', description: 'Stop speaking.', parameters: [] },
      { name: 'pause', signature: 'pause(): void', description: 'Pause speech.', parameters: [] },
      {
        name: 'resume',
        signature: 'resume(): void',
        description: 'Resume speech.',
        parameters: [],
      },
    ],
    events: [
      { name: 'onSpeechStart', description: 'Fired when speech starts.' },
      { name: 'onSpeechEnd', description: 'Fired when speech ends.' },
      {
        name: 'onWordBoundary',
        description: 'Fired at each word.',
        payload: '{ word: string, index: number }',
      },
    ],
    example: `@voice_output({ voice: "en-US-GuyNeural", pitch: 1.2, rate: 0.9 })
orb narrator {
  on_scene_start: {
    this.speak("Welcome to the enchanted forest...")
  }
}`,
    since: '1.3.0',
  },

  // ============================================================================
  // Hololand Traits
  // ============================================================================
  manifest: {
    name: 'ManifestTrait',
    annotation: '@manifest',
    description:
      'Defines an asset manifest for organizing game assets with metadata, dependencies, and platform-specific variants.',
    category: 'hololand',
    properties: [
      { name: 'id', type: 'string', description: 'Unique manifest identifier.', required: true },
      {
        name: 'assets',
        type: 'AssetEntry[]',
        description: 'Array of asset definitions with id, path, type, and tags.',
      },
      {
        name: 'dependencies',
        type: 'Dependency[]',
        description: 'Asset dependency relationships for load ordering.',
      },
      {
        name: 'variants',
        type: 'Record<string, Record<string, string>>',
        description: 'Platform-specific asset path overrides.',
      },
    ],
    methods: [
      {
        name: 'preload_all',
        signature: 'preload_all(id: string, callback?: (progress: number) => void): Promise<void>',
        description: 'Preload all assets with progress callback.',
        parameters: [
          { name: 'id', type: 'string', description: 'Manifest ID' },
          {
            name: 'callback',
            type: 'function',
            description: 'Progress callback (0-1)',
            optional: true,
          },
        ],
      },
      {
        name: 'get_assets',
        signature: 'get_assets(id: string): Asset[]',
        description: 'Get all assets from a manifest.',
        parameters: [{ name: 'id', type: 'string', description: 'Manifest ID' }],
        returns: 'Asset[]',
      },
    ],
    events: [
      {
        name: 'onAssetLoaded',
        description: 'Fired when an asset finishes loading.',
        payload: '{ id: string, asset: Asset }',
      },
      {
        name: 'onLoadError',
        description: 'Fired when an asset fails to load.',
        payload: '{ id: string, error: Error }',
      },
    ],
    example: `@manifest("game-assets") {
  assets: [
    { id: "hero", path: "models/hero.glb", type: "model", tags: ["character"] },
    { id: "hero-tex", path: "textures/hero.png", type: "texture", tags: ["character"] }
  ]
  dependencies: [
    { parent: "hero", children: ["hero-tex"] }
  ]
}`,
    since: '2.0.0',
  },

  world_metadata: {
    name: 'WorldMetadataTrait',
    annotation: '@world_metadata',
    description:
      'Defines metadata for a Hololand world including identification, platforms, and discovery tags.',
    category: 'hololand',
    properties: [
      { name: 'id', type: 'string', description: 'Unique world identifier.', required: true },
      { name: 'name', type: 'string', description: 'World name.', required: true },
      { name: 'display_name', type: 'string', description: 'Display name for UI.' },
      { name: 'description', type: 'string', description: 'World description.' },
      { name: 'version', type: 'string', description: 'Semantic version.', default: '"1.0.0"' },
      { name: 'author', type: 'string', description: 'Creator name.' },
      { name: 'tags', type: 'string[]', description: 'Discovery tags.' },
      {
        name: 'platforms',
        type: '("web" | "quest" | "visionos" | "steamvr" | "desktop")[]',
        description: 'Supported platforms.',
        default: '["web"]',
      },
      {
        name: 'age_rating',
        type: '"everyone" | "teen" | "mature"',
        description: 'Content age rating.',
        default: '"everyone"',
      },
      {
        name: 'category',
        type: 'string',
        description: 'World category (game, social, art, etc.).',
      },
      {
        name: 'max_users',
        type: 'number',
        description: 'Maximum concurrent users.',
        default: '50',
      },
    ],
    methods: [],
    events: [],
    example: `@world_metadata {
  id: "my-world"
  name: "My VR World"
  platforms: ["web", "quest", "steamvr"]
  category: "game"
  max_users: 16
}`,
    since: '2.0.0',
  },

  world_config: {
    name: 'WorldConfigTrait',
    annotation: '@world_config',
    description:
      'Configures Hololand world settings including physics, rendering, networking, and audio.',
    category: 'hololand',
    properties: [
      {
        name: 'physics',
        type: 'PhysicsConfig',
        description: 'Physics engine settings (engine, gravity, tick_rate).',
      },
      {
        name: 'rendering',
        type: 'RenderingConfig',
        description: 'Rendering settings (target_fps, shadows, quality).',
      },
      {
        name: 'networking',
        type: 'NetworkingConfig',
        description: 'Network settings (tick_rate, protocol, compression).',
      },
      {
        name: 'audio',
        type: 'AudioConfig',
        description: 'Audio settings (spatial_audio, reverb, max_sources).',
      },
      {
        name: 'performance',
        type: 'PerformanceConfig',
        description: 'Performance budgets (max_draw_calls, max_triangles).',
      },
      {
        name: 'accessibility',
        type: 'AccessibilityConfig',
        description: 'Accessibility options (subtitles, screen_reader).',
      },
    ],
    methods: [],
    events: [],
    example: `@world_config {
  physics: { engine: "rapier", gravity: [0, -9.81, 0] }
  rendering: { target_fps: 72, shadows: true, shadow_quality: "high" }
  networking: { tick_rate: 20, protocol: "websocket" }
  audio: { spatial_audio: true }
}`,
    since: '2.0.0',
  },

  zones: {
    name: 'ZonesTrait',
    annotation: '@zones',
    description:
      'Defines spatial zones within a world with custom behaviors, triggers, and environment overrides.',
    category: 'hololand',
    properties: [
      {
        name: 'zone',
        type: 'ZoneDefinition',
        description: 'Individual zone definition with id, name, bounds, triggers.',
      },
    ],
    methods: [],
    events: [
      {
        name: 'onZoneEnter',
        description: 'Fired when player enters a zone.',
        payload: '{ zone_id: string, player: Entity }',
      },
      {
        name: 'onZoneExit',
        description: 'Fired when player exits a zone.',
        payload: '{ zone_id: string, player: Entity }',
      },
    ],
    example: `@zones {
  zone "safe-zone" {
    name: "Spawn Safe Zone"
    bounds: { type: "sphere", center: [0, 0, 0], radius: 15 }
    priority: 10
    triggers: [
      { type: "enter", action: "disable_pvp", filter: "player" }
    ]
  }
}`,
    since: '2.0.0',
  },

  spawn_points: {
    name: 'SpawnPointsTrait',
    annotation: '@spawn_points',
    description: 'Defines player spawn locations with team assignments, capacity, and conditions.',
    category: 'hololand',
    properties: [
      {
        name: 'spawn',
        type: 'SpawnDefinition',
        description: 'Individual spawn point with id, position, rotation, type, capacity.',
      },
    ],
    methods: [
      {
        name: 'getAvailableSpawn',
        signature: 'getAvailableSpawn(tags?: string[]): SpawnPoint',
        description: 'Get an available spawn point by tags.',
        parameters: [
          { name: 'tags', type: 'string[]', description: 'Filter tags', optional: true },
        ],
        returns: 'SpawnPoint',
      },
    ],
    events: [],
    example: `@spawn_points {
  spawn "team-a-spawn" {
    name: "Team A Spawn"
    position: [-40, 1, 0]
    rotation: [0, 90, 0]
    type: "default"
    capacity: 4
    tags: ["team-a"]
  }
}`,
    since: '2.0.0',
  },

  semantic: {
    name: 'SemanticTrait',
    annotation: '@semantic',
    description:
      'Adds semantic annotations to entities for AI understanding, data binding, and capability discovery.',
    category: 'hololand',
    properties: [
      {
        name: 'category',
        type: 'string',
        description: 'Semantic category (character, item, environment).',
        required: true,
      },
      { name: 'type', type: 'string', description: 'Entity type within category.', required: true },
      {
        name: 'properties',
        type: 'Record<string, PropertyAnnotation>',
        description: 'Annotated properties with metadata.',
      },
      { name: 'capabilities', type: 'string[]', description: 'List of entity capabilities.' },
    ],
    methods: [],
    events: [],
    example: `@semantic("player-character") {
  category: "character"
  type: "player"
  properties: {
    position: @annotate("position", { networked: true }),
    health: @annotate("health", { min: 0, max: 100 })
  }
  capabilities: ["movement", "jumping", "combat"]
}`,
    since: '2.0.0',
  },

  bindings: {
    name: 'BindingsTrait',
    annotation: '@bindings',
    description: 'Creates reactive data bindings between state and UI elements.',
    category: 'hololand',
    properties: [
      {
        name: 'bind',
        type: 'BindingExpression',
        description: 'Binding expression: bind(source) -> target',
      },
    ],
    methods: [],
    events: [
      {
        name: 'onBindingUpdate',
        description: 'Fired when a binding updates.',
        payload: '{ source: string, target: string, value: any }',
      },
    ],
    example: `@bindings {
  bind(@state.player_health / @state.max_health) -> HealthBar.fill_amount
  bind(@state.player_health > 0) -> HealthBar.visible
  bind(health_to_color(@state.health)) -> HealthBar.color
}`,
    since: '2.0.0',
  },

  annotate: {
    name: 'AnnotateTrait',
    annotation: '@annotate',
    description:
      'Creates property-level annotations with metadata for networking, validation, and binding.',
    category: 'hololand',
    properties: [
      {
        name: 'type',
        type: 'string',
        description: 'Property type (position, rotation, health, etc.).',
        required: true,
      },
      {
        name: 'networked',
        type: 'boolean',
        description: 'Whether property syncs across network.',
        default: 'false',
      },
      {
        name: 'interpolated',
        type: 'boolean',
        description: 'Whether to interpolate network updates.',
        default: 'false',
      },
      { name: 'min', type: 'number', description: 'Minimum value constraint.' },
      { name: 'max', type: 'number', description: 'Maximum value constraint.' },
      {
        name: 'ui_binding',
        type: 'string',
        description: 'Target UI element for automatic binding.',
      },
    ],
    methods: [],
    events: [],
    example: `health: @annotate("health", {
  min: 0,
  max: @state.player_max_health,
  networked: true,
  ui_binding: "health_bar"
})`,
    since: '2.0.0',
  },

  semantic_ref: {
    name: 'SemanticRefTrait',
    annotation: '@semantic_ref',
    description: 'References a semantic annotation defined elsewhere, applying it to an entity.',
    category: 'hololand',
    properties: [
      {
        name: 'ref',
        type: 'string',
        description: 'ID of the semantic annotation to reference.',
        required: true,
      },
    ],
    methods: [],
    events: [],
    example: `object "Player" {
  @semantic_ref("player-character")
  position: [0, 0, 0]
  model: "characters/hero.glb"
}`,
    since: '2.0.0',
  },

  artwork_metadata: {
    name: 'ArtworkMetadataTrait',
    annotation: '@artwork_metadata',
    description:
      'Defines metadata for artwork and collectible items in virtual galleries and museums.',
    category: 'hololand',
    properties: [
      { name: 'title', type: 'string', description: 'Artwork title.', required: true },
      { name: 'artist', type: 'string', description: 'Artist name.', required: true },
      { name: 'year', type: 'number', description: 'Year of creation.' },
      { name: 'description', type: 'string', description: 'Artwork description.' },
      { name: 'audio_guide_id', type: 'string', description: 'ID of audio guide content.' },
      {
        name: 'interaction_type',
        type: '"view" | "inspect" | "interact"',
        description: 'Type of interaction allowed.',
        default: '"view"',
      },
    ],
    methods: [],
    events: [
      {
        name: 'onInspect',
        description: 'Fired when user inspects the artwork.',
        payload: '{ artwork_id: string }',
      },
    ],
    example: `@artwork_metadata {
  title: "The Starry Night"
  artist: "Vincent van Gogh"
  year: 1889
  description: "One of the most recognized paintings in Western art"
  interaction_type: "inspect"
}`,
    since: '2.0.0',
  },

  npc_behavior: {
    name: 'NPCBehaviorTrait',
    annotation: '@npc_behavior',
    description:
      'Defines AI-driven NPC behaviors including patrol paths, interactions, and dialog.',
    category: 'hololand',
    properties: [
      { name: 'patrol_points', type: 'Vec3[]', description: 'Waypoints for patrol behavior.' },
      {
        name: 'interaction_radius',
        type: 'number',
        description: 'Distance at which NPC can interact.',
        default: '3',
      },
      { name: 'greeting', type: 'string', description: 'Greeting message for players.' },
      { name: 'dialog_tree', type: 'DialogNode[]', description: 'Conversation dialog tree.' },
      {
        name: 'idle_animation',
        type: 'string',
        description: 'Animation to play when idle.',
        default: '"idle"',
      },
      { name: 'walk_speed', type: 'number', description: 'Walking speed.', default: '1.5' },
    ],
    methods: [
      {
        name: 'startPatrol',
        signature: 'startPatrol(): void',
        description: 'Begin patrol behavior.',
        parameters: [],
      },
      {
        name: 'stopPatrol',
        signature: 'stopPatrol(): void',
        description: 'Stop patrol behavior.',
        parameters: [],
      },
      {
        name: 'say',
        signature: 'say(text: string): void',
        description: 'Make NPC speak.',
        parameters: [{ name: 'text', type: 'string', description: 'Text to say' }],
      },
      {
        name: 'moveTo',
        signature: 'moveTo(position: Vec3): Promise<void>',
        description: 'Move NPC to position.',
        parameters: [{ name: 'position', type: 'Vec3', description: 'Target position' }],
      },
    ],
    events: [
      {
        name: 'onPlayerApproach',
        description: 'Fired when player enters interaction radius.',
        payload: '{ player: Entity }',
      },
      {
        name: 'onDialogStart',
        description: 'Fired when dialog begins.',
        payload: '{ player: Entity }',
      },
      {
        name: 'onDialogEnd',
        description: 'Fired when dialog ends.',
        payload: '{ player: Entity }',
      },
    ],
    example: `@npc_behavior {
  patrol_points: [[0, 0, -5], [10, 0, 0], [0, 0, 5]]
  interaction_radius: 3
  greeting: "Welcome! Would you like a tour?"
  idle_animation: "idle_look_around"
}`,
    since: '2.0.0',
  },

  lod: {
    name: 'LODTrait',
    annotation: '@lod',
    description:
      'Configures level-of-detail settings for automatic quality scaling based on distance.',
    category: 'hololand',
    properties: [
      {
        name: 'distances',
        type: 'number[]',
        description: 'Distance thresholds for LOD transitions.',
        required: true,
      },
      { name: 'models', type: 'string[]', description: 'Model paths for each LOD level.' },
      {
        name: 'fade_duration',
        type: 'number',
        description: 'Crossfade duration between LODs.',
        default: '0.5',
      },
    ],
    methods: [
      {
        name: 'setForcedLOD',
        signature: 'setForcedLOD(level: number): void',
        description: 'Force a specific LOD level.',
        parameters: [{ name: 'level', type: 'number', description: 'LOD level to force' }],
      },
      {
        name: 'clearForcedLOD',
        signature: 'clearForcedLOD(): void',
        description: 'Return to automatic LOD selection.',
        parameters: [],
      },
    ],
    events: [
      {
        name: 'onLODChange',
        description: 'Fired when LOD level changes.',
        payload: '{ from: number, to: number }',
      },
    ],
    example: `@lod {
  distances: [25, 50, 100, 200]
  models: [
    "model_lod0.glb",
    "model_lod1.glb",
    "model_lod2.glb",
    "model_lod3.glb"
  ]
}`,
    since: '2.0.0',
  },

  hololand: {
    name: 'HololandTrait',
    annotation: '@hololand',
    description:
      'Provides Hololand runtime integration for connections, events, and player management.',
    category: 'hololand',
    properties: [],
    methods: [
      {
        name: 'connect',
        signature: 'connect(config: ConnectionConfig): Promise<void>',
        description: 'Connect to Hololand server.',
        parameters: [
          { name: 'config', type: 'ConnectionConfig', description: 'Connection configuration' },
        ],
      },
      {
        name: 'disconnect',
        signature: 'disconnect(): void',
        description: 'Disconnect from server.',
        parameters: [],
      },
      {
        name: 'get_local_player',
        signature: 'get_local_player(): Player',
        description: 'Get the local player entity.',
        parameters: [],
        returns: 'Player',
      },
    ],
    events: [
      {
        name: 'on connection',
        description: 'Fired on connection state change.',
        payload: '"connected" | "disconnected" | "error"',
      },
      {
        name: 'on player_joined',
        description: 'Fired when a player joins.',
        payload: '{ player: Player }',
      },
      {
        name: 'on player_left',
        description: 'Fired when a player leaves.',
        payload: '{ player: Player }',
      },
      {
        name: 'on world_joined',
        description: 'Fired when joining a world.',
        payload: '{ world_id: string }',
      },
      {
        name: 'on stream_message',
        description: 'Fired on streaming protocol message.',
        payload: '{ channel: string, data: any }',
      },
    ],
    example: `on @hololand.connection("connected") {
  notify("Connected to Hololand server")
}

on @hololand.player_joined(player) {
  spawn_particles("welcome", player.position)
}`,
    since: '2.0.0',
  },
};

/**
 * Get documentation for a trait by name or annotation
 */
export function getTraitDoc(name: string): TraitDoc | undefined {
  // Normalize the name
  const normalized = name
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/trait$/i, '')
    .replace(/_/g, '');

  // Direct lookup
  if (TRAIT_DOCS[normalized]) {
    return TRAIT_DOCS[normalized];
  }

  // Search by annotation or class name
  for (const [_key, doc] of Object.entries(TRAIT_DOCS)) {
    const annotation = doc.annotation.replace('@', '').toLowerCase();
    const className = doc.name.toLowerCase();

    if (annotation === normalized || className.includes(normalized)) {
      return doc;
    }
  }

  return undefined;
}

/**
 * Get all trait names for completion
 */
export function getAllTraitNames(): string[] {
  return Object.values(TRAIT_DOCS).map((doc) => doc.annotation);
}

/**
 * Get traits by category
 */
export function getTraitsByCategory(category: TraitDoc['category']): TraitDoc[] {
  return Object.values(TRAIT_DOCS).filter((doc) => doc.category === category);
}

/**
 * Format trait documentation as Markdown for hover
 */
export function formatTraitDocAsMarkdown(doc: TraitDoc): string {
  const lines: string[] = [];

  // Header
  lines.push(`## ${doc.annotation}`);
  lines.push('');
  lines.push(doc.description);
  lines.push('');

  // Category badge
  lines.push(`**Category:** \`${doc.category}\``);
  if (doc.since) {
    lines.push(`**Since:** v${doc.since}`);
  }
  if (doc.deprecated) {
    lines.push(`⚠️ **Deprecated:** ${doc.deprecationMessage || 'This trait is deprecated.'}`);
  }
  lines.push('');

  // Properties
  if (doc.properties.length > 0) {
    lines.push('### Properties');
    lines.push('');
    lines.push('| Property | Type | Default | Description |');
    lines.push('|----------|------|---------|-------------|');
    for (const prop of doc.properties) {
      const required = prop.required ? ' *(required)*' : '';
      const defaultVal = prop.default ?? '-';
      lines.push(
        `| \`${prop.name}\` | \`${prop.type}\` | \`${defaultVal}\` | ${prop.description}${required} |`
      );
    }
    lines.push('');
  }

  // Methods
  if (doc.methods.length > 0) {
    lines.push('### Methods');
    lines.push('');
    for (const method of doc.methods) {
      lines.push(`#### \`${method.signature}\``);
      lines.push(method.description);
      if (method.parameters.length > 0) {
        lines.push('');
        for (const param of method.parameters) {
          const opt = param.optional ? ' *(optional)*' : '';
          lines.push(`- \`${param.name}: ${param.type}\` - ${param.description}${opt}`);
        }
      }
      if (method.returns) {
        lines.push(`- **Returns:** \`${method.returns}\``);
      }
      lines.push('');
    }
  }

  // Events
  if (doc.events.length > 0) {
    lines.push('### Events');
    lines.push('');
    for (const event of doc.events) {
      lines.push(`- **\`${event.name}\`** - ${event.description}`);
      if (event.payload) {
        lines.push(`  - Payload: \`${event.payload}\``);
      }
    }
    lines.push('');
  }

  // Example
  lines.push('### Example');
  lines.push('');
  lines.push('```holoscript');
  lines.push(doc.example);
  lines.push('```');

  return lines.join('\n');
}

/**
 * Format trait documentation as compact Markdown for hover
 */
export function formatTraitDocCompact(doc: TraitDoc): string {
  const lines: string[] = [];

  lines.push(`**${doc.annotation}** - ${doc.name}`);
  lines.push('');
  lines.push(doc.description);
  lines.push('');

  // Show a few key properties
  if (doc.properties.length > 0) {
    lines.push('**Properties:**');
    const props = doc.properties.slice(0, 5);
    for (const prop of props) {
      lines.push(`- \`${prop.name}: ${prop.type}\` - ${prop.description.split('.')[0]}`);
    }
    if (doc.properties.length > 5) {
      lines.push(`- *...and ${doc.properties.length - 5} more*`);
    }
    lines.push('');
  }

  // Show example
  lines.push('```holoscript');
  // Truncate example if too long
  const exampleLines = doc.example.split('\n');
  if (exampleLines.length > 10) {
    lines.push(...exampleLines.slice(0, 8));
    lines.push('  // ...');
  } else {
    lines.push(doc.example);
  }
  lines.push('```');

  return lines.join('\n');
}
