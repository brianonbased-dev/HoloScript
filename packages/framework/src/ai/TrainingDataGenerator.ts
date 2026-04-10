/**
 * HoloScript AI Training Data Generator
 *
 * Generates diverse HoloScript examples for AI model training.
 * Creates input/output pairs covering all language features.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TrainingExample {
  id: string;
  category: TrainingCategory;
  description: string;
  holoScript: string;
  expectedOutput?: {
    type: 'r3f' | 'visionos' | 'usda';
    snippet?: string;
  };
  tags: string[];
  complexity: 'basic' | 'intermediate' | 'advanced';
}

export type TrainingCategory =
  | 'geometry'
  | 'materials'
  | 'physics'
  | 'interactions'
  | 'audio'
  | 'ui'
  | 'composition'
  | 'state'
  | 'logic'
  | 'traits'
  | 'animations'
  | 'ar_vr'
  | 'accessibility';

export interface GeneratorOptions {
  count?: number;
  categories?: TrainingCategory[];
  complexityFilter?: ('basic' | 'intermediate' | 'advanced')[];
  includeExpectedOutput?: boolean;
}

// =============================================================================
// GEOMETRY EXAMPLES
// =============================================================================

const GEOMETRY_EXAMPLES: TrainingExample[] = [
  {
    id: 'geo-001',
    category: 'geometry',
    description: 'Simple cube object',
    holoScript: `object "MyCube" {
  geometry: "cube"
  position: [0, 1, 0]
  scale: [1, 1, 1]
}`,
    tags: ['cube', 'basic', 'position'],
    complexity: 'basic',
  },
  {
    id: 'geo-002',
    category: 'geometry',
    description: 'Colored sphere with radius',
    holoScript: `object "Ball" {
  geometry: "sphere"
  radius: 0.5
  color: "#ff6600"
  position: [2, 0.5, 0]
}`,
    tags: ['sphere', 'color', 'radius'],
    complexity: 'basic',
  },
  {
    id: 'geo-003',
    category: 'geometry',
    description: 'Rotated plane as floor',
    holoScript: `object "Floor" {
  geometry: "plane"
  size: 10
  rotation: [-90, 0, 0]
  color: "#333333"
}`,
    tags: ['plane', 'rotation', 'floor'],
    complexity: 'basic',
  },
  {
    id: 'geo-004',
    category: 'geometry',
    description: 'Cylinder pillar',
    holoScript: `object "Pillar" {
  geometry: "cylinder"
  radius: 0.3
  height: 3
  position: [0, 1.5, 0]
  color: "#aaaaaa"
}`,
    tags: ['cylinder', 'height'],
    complexity: 'basic',
  },
  {
    id: 'geo-005',
    category: 'geometry',
    description: '3D text object',
    holoScript: `object "Title" {
  geometry: "text"
  text: "Hello VR"
  font_size: 0.5
  position: [0, 2, -2]
  color: "#ffffff"
}`,
    tags: ['text', '3d-text'],
    complexity: 'intermediate',
  },
  {
    id: 'geo-006',
    category: 'geometry',
    description: 'External GLB model',
    holoScript: `object "Character" {
  model: "models/robot.glb"
  position: [0, 0, 0]
  scale: 0.5
}`,
    tags: ['model', 'glb', 'import'],
    complexity: 'intermediate',
  },
  {
    id: 'geo-007',
    category: 'geometry',
    description: 'Torus ring',
    holoScript: `object "Ring" {
  geometry: "torus"
  radius: 1
  tube: 0.2
  position: [0, 1, 0]
  color: "#gold"
}`,
    tags: ['torus', 'ring'],
    complexity: 'intermediate',
  },
];

// =============================================================================
// MATERIAL EXAMPLES
// =============================================================================

const MATERIAL_EXAMPLES: TrainingExample[] = [
  {
    id: 'mat-001',
    category: 'materials',
    description: 'Metallic material',
    holoScript: `object "MetalSphere" {
  geometry: "sphere"
  material: {
    color: "#888888"
    metalness: 1.0
    roughness: 0.2
  }
}`,
    tags: ['metal', 'pbr', 'material'],
    complexity: 'intermediate',
  },
  {
    id: 'mat-002',
    category: 'materials',
    description: 'Glass material with transmission',
    holoScript: `object "GlassCube" {
  geometry: "cube"
  surface: "glass"
  color: "#ffffff"
  opacity: 0.3
}`,
    tags: ['glass', 'transparent', 'surface'],
    complexity: 'intermediate',
  },
  {
    id: 'mat-003',
    category: 'materials',
    description: 'Emissive glowing object',
    holoScript: `object "GlowOrb" {
  geometry: "sphere"
  surface: "emissive"
  color: "#00ffff"
  material: {
    emissiveIntensity: 2.0
  }
}`,
    tags: ['emissive', 'glow', 'light'],
    complexity: 'intermediate',
  },
  {
    id: 'mat-004',
    category: 'materials',
    description: 'Holographic material',
    holoScript: `object "HoloDisplay" {
  geometry: "plane"
  surface: "hologram"
  color: "#00ff88"
  opacity: 0.7
}`,
    tags: ['hologram', 'futuristic'],
    complexity: 'advanced',
  },
  {
    id: 'mat-005',
    category: 'materials',
    description: 'Textured object',
    holoScript: `object "TexturedBox" {
  geometry: "cube"
  material: {
    map: "textures/wood.jpg"
    normalMap: "textures/wood_normal.jpg"
    roughness: 0.8
  }
}`,
    tags: ['texture', 'map', 'normal'],
    complexity: 'advanced',
  },
];

// =============================================================================
// PHYSICS EXAMPLES
// =============================================================================

const PHYSICS_EXAMPLES: TrainingExample[] = [
  {
    id: 'phy-001',
    category: 'physics',
    description: 'Physics-enabled falling cube',
    holoScript: `object "FallingCube" {
  geometry: "cube"
  position: [0, 5, 0]
  @physics(mass: 1.0)
  @collidable
}`,
    tags: ['physics', 'gravity', 'fall'],
    complexity: 'basic',
  },
  {
    id: 'phy-002',
    category: 'physics',
    description: 'Bouncy ball',
    holoScript: `object "BouncyBall" {
  geometry: "sphere"
  radius: 0.3
  position: [0, 3, 0]
  @physics(mass: 0.5, restitution: 0.9)
  @collidable
}`,
    tags: ['bounce', 'restitution', 'ball'],
    complexity: 'intermediate',
  },
  {
    id: 'phy-003',
    category: 'physics',
    description: 'Static floor collider',
    holoScript: `object "Ground" {
  geometry: "plane"
  size: 20
  rotation: [-90, 0, 0]
  @static
  @collidable
}`,
    tags: ['static', 'floor', 'collider'],
    complexity: 'basic',
  },
  {
    id: 'phy-004',
    category: 'physics',
    description: 'Kinematic moving platform',
    holoScript: `object "Platform" {
  geometry: "cube"
  scale: [3, 0.2, 3]
  @kinematic
  @collidable

  logic {
    on_tick(delta) {
      position.y = sin(time) * 2
    }
  }
}`,
    tags: ['kinematic', 'platform', 'moving'],
    complexity: 'advanced',
  },
  {
    id: 'phy-005',
    category: 'physics',
    description: 'Stacked physics boxes',
    holoScript: `composition "PhysicsStack" {
  object "Ground" {
    geometry: "plane"
    size: 10
    rotation: [-90, 0, 0]
    @static
    @collidable
  }

  object "Box1" {
    geometry: "cube"
    position: [0, 0.5, 0]
    @physics(mass: 2.0)
    @collidable
    @stackable
  }

  object "Box2" {
    geometry: "cube"
    position: [0, 1.5, 0]
    @physics(mass: 1.0)
    @collidable
    @stackable
  }
}`,
    tags: ['stack', 'multiple', 'scene'],
    complexity: 'advanced',
  },
];

// =============================================================================
// INTERACTION EXAMPLES
// =============================================================================

const INTERACTION_EXAMPLES: TrainingExample[] = [
  {
    id: 'int-001',
    category: 'interactions',
    description: 'Grabbable object',
    holoScript: `object "GrabbableCube" {
  geometry: "cube"
  color: "#4444ff"
  @grabbable
  @physics
  @collidable
}`,
    tags: ['grab', 'vr', 'hand'],
    complexity: 'basic',
  },
  {
    id: 'int-002',
    category: 'interactions',
    description: 'Hoverable button',
    holoScript: `object "HoverButton" {
  geometry: "cube"
  scale: [0.2, 0.05, 0.1]
  color: "#00ff00"
  @hoverable(highlight_color: "#ffff00", scale_factor: 1.1)
  @clickable
}`,
    tags: ['hover', 'button', 'highlight'],
    complexity: 'intermediate',
  },
  {
    id: 'int-003',
    category: 'interactions',
    description: 'Throwable ball',
    holoScript: `object "ThrowBall" {
  geometry: "sphere"
  radius: 0.15
  color: "#ff0000"
  @grabbable
  @throwable(max_velocity: 15, spin: true)
  @physics(mass: 0.3)
  @collidable
}`,
    tags: ['throw', 'velocity', 'sports'],
    complexity: 'intermediate',
  },
  {
    id: 'int-004',
    category: 'interactions',
    description: 'Draggable slider',
    holoScript: `object "DragSlider" {
  geometry: "sphere"
  radius: 0.05
  color: "#ffffff"
  @draggable(constrain_axis: "x", min: -1, max: 1)
  @pointable
}`,
    tags: ['drag', 'constrain', 'slider'],
    complexity: 'intermediate',
  },
  {
    id: 'int-005',
    category: 'interactions',
    description: 'Scalable and rotatable object',
    holoScript: `object "Manipulable" {
  geometry: "cube"
  @grabbable
  @scalable(min_scale: 0.5, max_scale: 3.0)
  @rotatable
}`,
    tags: ['scale', 'rotate', 'transform'],
    complexity: 'advanced',
  },
  {
    id: 'int-006',
    category: 'interactions',
    description: 'Snappable object',
    holoScript: `object "SnapCube" {
  geometry: "cube"
  @grabbable
  @snappable(snap_distance: 0.3, snap_rotation: 45)
}`,
    tags: ['snap', 'grid', 'align'],
    complexity: 'advanced',
  },
];

// =============================================================================
// AUDIO EXAMPLES
// =============================================================================

const AUDIO_EXAMPLES: TrainingExample[] = [
  {
    id: 'aud-001',
    category: 'audio',
    description: 'Ambient background music',
    holoScript: `object "BackgroundMusic" {
  audio: "sounds/ambient.mp3"
  volume: 0.5
  loop: true
}`,
    tags: ['music', 'ambient', 'loop'],
    complexity: 'basic',
  },
  {
    id: 'aud-002',
    category: 'audio',
    description: 'Spatial audio source',
    holoScript: `object "Speaker" {
  geometry: "cube"
  scale: [0.3, 0.3, 0.3]
  position: [2, 1, 0]
  audio: "sounds/radio.mp3"
  @spatial_audio(refDistance: 2, rolloff: 1.5)
}`,
    tags: ['spatial', '3d-audio', 'positional'],
    complexity: 'intermediate',
  },
  {
    id: 'aud-003',
    category: 'audio',
    description: 'Audio zone with reverb',
    holoScript: `zone "CaveZone" {
  shape: "box"
  size: [10, 5, 10]
  position: [0, 2.5, 0]
  @reverb_zone(preset: "cave", wetLevel: 0.6)
}`,
    tags: ['reverb', 'zone', 'cave'],
    complexity: 'advanced',
  },
];

// =============================================================================
// UI EXAMPLES
// =============================================================================

const UI_EXAMPLES: TrainingExample[] = [
  {
    id: 'ui-001',
    category: 'ui',
    description: 'Floating UI panel',
    holoScript: `ui_panel "Settings" {
  position: [0, 1.5, -2]
  width: 400
  height: 300
  @ui_floating(follow_delay: 0.3, distance: 2)

  ui_text "Title" {
    content: "Settings"
    fontSize: 24
  }
}`,
    tags: ['panel', 'floating', 'vr-ui'],
    complexity: 'intermediate',
  },
  {
    id: 'ui-002',
    category: 'ui',
    description: 'Interactive button',
    holoScript: `ui_button "StartButton" {
  text: "Start Game"
  position: [0, 1, -1.5]
  @hoverable(highlight_color: "#00ff00")
  @clickable

  logic {
    on_click() {
      emit("game:start")
    }
  }
}`,
    tags: ['button', 'click', 'event'],
    complexity: 'intermediate',
  },
  {
    id: 'ui-003',
    category: 'ui',
    description: 'Slider with data binding',
    holoScript: `ui_slider "VolumeControl" {
  min: 0
  max: 100
  value: bind(state.volume)
  position: [0, 1.2, -1.5]
}`,
    tags: ['slider', 'binding', 'control'],
    complexity: 'intermediate',
  },
  {
    id: 'ui-004',
    category: 'ui',
    description: 'Hand-attached menu',
    holoScript: `ui_panel "HandMenu" {
  @ui_hand_menu(hand: "left", trigger: "palm_up")

  ui_button "Inventory" {
    text: "Inventory"
  }

  ui_button "Settings" {
    text: "Settings"
  }
}`,
    tags: ['hand-menu', 'palm', 'vr'],
    complexity: 'advanced',
  },
  {
    id: 'ui-005',
    category: 'ui',
    description: 'Curved display panel',
    holoScript: `ui_panel "CurvedDisplay" {
  position: [0, 1.5, -3]
  width: 800
  height: 400
  @ui_curved(radius: 3, arc_angle: 90)

  ui_text "Content" {
    content: "Immersive curved display"
  }
}`,
    tags: ['curved', 'display', 'immersive'],
    complexity: 'advanced',
  },
];

// =============================================================================
// COMPOSITION EXAMPLES
// =============================================================================

const COMPOSITION_EXAMPLES: TrainingExample[] = [
  {
    id: 'comp-001',
    category: 'composition',
    description: 'Basic scene composition',
    holoScript: `composition "SimpleScene" {
  environment: "studio"

  object "Floor" {
    geometry: "plane"
    size: 10
    rotation: [-90, 0, 0]
    color: "#444444"
  }

  object "Subject" {
    geometry: "sphere"
    position: [0, 1, 0]
    color: "#ff6600"
  }
}`,
    tags: ['composition', 'scene', 'basic'],
    complexity: 'basic',
  },
  {
    id: 'comp-002',
    category: 'composition',
    description: 'Spatial group hierarchy',
    holoScript: `composition "GroupedScene" {
  group "Furniture" {
    position: [2, 0, 0]

    object "Table" {
      geometry: "cube"
      scale: [1, 0.05, 0.6]
      position: [0, 0.75, 0]
    }

    object "Chair" {
      geometry: "cube"
      scale: [0.4, 0.8, 0.4]
      position: [0, 0.4, 0.5]
    }
  }
}`,
    tags: ['group', 'hierarchy', 'furniture'],
    complexity: 'intermediate',
  },
  {
    id: 'comp-003',
    category: 'composition',
    description: 'Template-based composition',
    holoScript: `template "InteractiveBox" {
  geometry: "cube"
  @grabbable
  @physics
  @collidable
  @hoverable
}

composition "TemplateDemo" {
  object "Box1" using "InteractiveBox" {
    position: [-1, 1, 0]
    color: "#ff0000"
  }

  object "Box2" using "InteractiveBox" {
    position: [0, 1, 0]
    color: "#00ff00"
  }

  object "Box3" using "InteractiveBox" {
    position: [1, 1, 0]
    color: "#0000ff"
  }
}`,
    tags: ['template', 'reuse', 'multiple'],
    complexity: 'advanced',
  },
];

// =============================================================================
// STATE EXAMPLES
// =============================================================================

const STATE_EXAMPLES: TrainingExample[] = [
  {
    id: 'state-001',
    category: 'state',
    description: 'Basic state management',
    holoScript: `composition "StatefulScene" {
  state {
    score: 0
    isPlaying: false
    playerName: "Player 1"
  }

  ui_text "ScoreDisplay" {
    content: bind("Score: " + state.score)
    position: [0, 2, -2]
  }
}`,
    tags: ['state', 'binding', 'score'],
    complexity: 'intermediate',
  },
  {
    id: 'state-002',
    category: 'state',
    description: 'State with arrays',
    holoScript: `composition "InventorySystem" {
  state {
    items: []
    selectedIndex: 0
    maxItems: 10
  }

  logic {
    action addItem(item) {
      if (state.items.length < state.maxItems) {
        state.items.push(item)
      }
    }

    action removeItem(index) {
      state.items.splice(index, 1)
    }
  }
}`,
    tags: ['array', 'inventory', 'actions'],
    complexity: 'advanced',
  },
];

// =============================================================================
// LOGIC EXAMPLES
// =============================================================================

const LOGIC_EXAMPLES: TrainingExample[] = [
  {
    id: 'logic-001',
    category: 'logic',
    description: 'Event handler on click',
    holoScript: `object "ClickTarget" {
  geometry: "cube"
  @clickable

  logic {
    on_click() {
      color = "#ff0000"
      emit("target:hit")
    }
  }
}`,
    tags: ['event', 'click', 'emit'],
    complexity: 'basic',
  },
  {
    id: 'logic-002',
    category: 'logic',
    description: 'Conditional logic',
    holoScript: `object "Door" {
  geometry: "cube"
  scale: [1, 2, 0.1]

  state {
    isOpen: false
  }

  logic {
    action toggle() {
      if (state.isOpen) {
        animate { rotation: [0, 0, 0], duration: 0.5 }
        state.isOpen = false
      } else {
        animate { rotation: [0, 90, 0], duration: 0.5 }
        state.isOpen = true
      }
    }
  }
}`,
    tags: ['conditional', 'door', 'animate'],
    complexity: 'intermediate',
  },
  {
    id: 'logic-003',
    category: 'logic',
    description: 'Timer-based logic',
    holoScript: `object "Spawner" {
  logic {
    on_tick(1.0) {
      spawn("Projectile", {
        position: position,
        velocity: [0, 5, 0]
      })
    }
  }
}`,
    tags: ['timer', 'spawn', 'tick'],
    complexity: 'intermediate',
  },
  {
    id: 'logic-004',
    category: 'logic',
    description: 'Loop iteration',
    holoScript: `composition "GridSpawner" {
  logic {
    action createGrid(rows, cols) {
      for (i in range(rows)) {
        for (j in range(cols)) {
          spawn("GridCell", {
            position: [i * 1.2, 0.5, j * 1.2]
          })
        }
      }
    }
  }
}`,
    tags: ['loop', 'grid', 'spawn'],
    complexity: 'advanced',
  },
];

// =============================================================================
// TRAIT EXAMPLES
// =============================================================================

const TRAIT_EXAMPLES: TrainingExample[] = [
  {
    id: 'trait-001',
    category: 'traits',
    description: 'Multiple physics traits',
    holoScript: `object "ComplexPhysics" {
  geometry: "sphere"
  @physics(mass: 2.0, friction: 0.5, restitution: 0.7)
  @collidable
  @grabbable(snap_to_hand: true)
  @throwable(max_velocity: 20)
}`,
    tags: ['multiple-traits', 'physics', 'interaction'],
    complexity: 'intermediate',
  },
  {
    id: 'trait-002',
    category: 'traits',
    description: 'Accessibility traits',
    holoScript: `object "AccessibleButton" {
  geometry: "cube"
  @accessible(label: "Submit form", hint: "Double tap to submit")
  @hoverable
  @clickable
}`,
    tags: ['accessible', 'a11y', 'screen-reader'],
    complexity: 'intermediate',
  },
  {
    id: 'trait-003',
    category: 'traits',
    description: 'AR anchor trait',
    holoScript: `object "ARObject" {
  model: "models/furniture.glb"
  @anchor(anchor_type: "plane")
  @grabbable
  @scalable
}`,
    tags: ['ar', 'anchor', 'plane-detection'],
    complexity: 'advanced',
  },
];

// =============================================================================
// ANIMATION EXAMPLES
// =============================================================================

const ANIMATION_EXAMPLES: TrainingExample[] = [
  {
    id: 'anim-001',
    category: 'animations',
    description: 'Simple position animation',
    holoScript: `object "MovingCube" {
  geometry: "cube"
  position: [0, 1, 0]

  logic {
    on_start() {
      animate {
        position: [3, 1, 0]
        duration: 2.0
        easing: "ease-in-out"
      }
    }
  }
}`,
    tags: ['animate', 'position', 'easing'],
    complexity: 'basic',
  },
  {
    id: 'anim-002',
    category: 'animations',
    description: 'Looping rotation',
    holoScript: `object "SpinningLogo" {
  geometry: "cube"

  logic {
    on_start() {
      animate {
        rotation: [0, 360, 0]
        duration: 4.0
        loop: true
      }
    }
  }
}`,
    tags: ['rotation', 'loop', 'spin'],
    complexity: 'basic',
  },
  {
    id: 'anim-003',
    category: 'animations',
    description: 'Timeline animation',
    holoScript: `composition "Sequence" {
  timeline "intro" {
    0.0: animate "Title" { opacity: 1, duration: 1 }
    1.5: animate "Subtitle" { opacity: 1, duration: 0.5 }
    2.5: animate "Content" { position: [0, 1, -2], duration: 1 }
    4.0: emit "intro:complete"
  }
}`,
    tags: ['timeline', 'sequence', 'keyframes'],
    complexity: 'advanced',
  },
];

// =============================================================================
// AR/VR EXAMPLES
// =============================================================================

const AR_VR_EXAMPLES: TrainingExample[] = [
  {
    id: 'arvr-001',
    category: 'ar_vr',
    description: 'Hand-tracked interaction',
    holoScript: `object "HandTarget" {
  geometry: "sphere"
  radius: 0.1
  @hand_tracking(joints: ["indexTip", "thumbTip"])
  @pointable

  logic {
    on_pinch() {
      emit("pinch:detected")
    }
  }
}`,
    tags: ['hand-tracking', 'pinch', 'gesture'],
    complexity: 'advanced',
  },
  {
    id: 'arvr-002',
    category: 'ar_vr',
    description: 'Eye tracking gaze',
    holoScript: `object "GazeTarget" {
  geometry: "sphere"
  @eye_tracking
  @hoverable

  logic {
    on_gaze_enter() {
      scale = 1.2
    }
    on_gaze_exit() {
      scale = 1.0
    }
  }
}`,
    tags: ['eye-tracking', 'gaze', 'focus'],
    complexity: 'advanced',
  },
  {
    id: 'arvr-003',
    category: 'ar_vr',
    description: 'Portal to another world',
    holoScript: `object "PortalFrame" {
  geometry: "torus"
  radius: 1.5
  tube: 0.1
  @portal(target_world: "fantasy_realm")
}`,
    tags: ['portal', 'world', 'visionos'],
    complexity: 'advanced',
  },
];

// =============================================================================
// GENERATOR CLASS
// =============================================================================

export class TrainingDataGenerator {
  private allExamples: TrainingExample[] = [];

  constructor() {
    this.allExamples = [
      ...GEOMETRY_EXAMPLES,
      ...MATERIAL_EXAMPLES,
      ...PHYSICS_EXAMPLES,
      ...INTERACTION_EXAMPLES,
      ...AUDIO_EXAMPLES,
      ...UI_EXAMPLES,
      ...COMPOSITION_EXAMPLES,
      ...STATE_EXAMPLES,
      ...LOGIC_EXAMPLES,
      ...TRAIT_EXAMPLES,
      ...ANIMATION_EXAMPLES,
      ...AR_VR_EXAMPLES,
    ];
  }

  /**
   * Generate training examples based on options
   */
  generate(options: GeneratorOptions = {}): TrainingExample[] {
    let filtered = [...this.allExamples];

    // Filter by category
    if (options.categories && options.categories.length > 0) {
      filtered = filtered.filter((ex) => options.categories!.includes(ex.category));
    }

    // Filter by complexity
    if (options.complexityFilter && options.complexityFilter.length > 0) {
      filtered = filtered.filter((ex) => options.complexityFilter!.includes(ex.complexity));
    }

    // Limit count
    if (options.count && options.count < filtered.length) {
      filtered = this.shuffleArray(filtered).slice(0, options.count);
    }

    return filtered;
  }

  /**
   * Generate all examples
   */
  generateAll(): TrainingExample[] {
    return [...this.allExamples];
  }

  /**
   * Get examples by category
   */
  getByCategory(category: TrainingCategory): TrainingExample[] {
    return this.allExamples.filter((ex) => ex.category === category);
  }

  /**
   * Get examples by complexity
   */
  getByComplexity(complexity: 'basic' | 'intermediate' | 'advanced'): TrainingExample[] {
    return this.allExamples.filter((ex) => ex.complexity === complexity);
  }

  /**
   * Get examples by tag
   */
  getByTag(tag: string): TrainingExample[] {
    return this.allExamples.filter((ex) => ex.tags.includes(tag));
  }

  /**
   * Get category statistics
   */
  getStats(): Record<TrainingCategory, number> {
    const stats = {} as Record<TrainingCategory, number>;
    for (const ex of this.allExamples) {
      stats[ex.category] = (stats[ex.category] || 0) + 1;
    }
    return stats;
  }

  /**
   * Export as JSON for training
   */
  exportJSON(): string {
    return JSON.stringify(this.allExamples, null, 2);
  }

  /**
   * Export as JSONL (one JSON per line)
   */
  exportJSONL(): string {
    return this.allExamples.map((ex) => JSON.stringify(ex)).join('\n');
  }

  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const ALL_CATEGORIES: TrainingCategory[] = [
  'geometry',
  'materials',
  'physics',
  'interactions',
  'audio',
  'ui',
  'composition',
  'state',
  'logic',
  'traits',
  'animations',
  'ar_vr',
  'accessibility',
];

export function createTrainingDataGenerator(): TrainingDataGenerator {
  return new TrainingDataGenerator();
}
