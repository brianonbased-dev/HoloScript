import * as vscode from 'vscode';

/**
 * Trait definition with label, description, insert text, documentation, and category.
 */
interface TraitDefinition {
  label: string;
  detail: string;
  insertText: string;
  documentation: string;
  category: string;
}

/**
 * All 56 registered runtime traits organized by category.
 */
export const ALL_TRAITS: TraitDefinition[] = [
  // =========================================================================
  // Interaction traits (11)
  // =========================================================================
  {
    label: '@grabbable',
    detail: 'Make object grabbable by VR controllers',
    insertText: 'grabbable',
    documentation:
      'Enables VR controller grab interaction. The object can be picked up, held, and released by the user. Works with both hand tracking and controller input.',
    category: 'Interaction',
  },
  {
    label: '@throwable',
    detail: 'Make object throwable after grabbing',
    insertText: 'throwable(force: ${1:10})',
    documentation:
      'Allows the object to be thrown after being grabbed. Inherits velocity from the controller motion on release. Configure `force` to scale throw strength.',
    category: 'Interaction',
  },
  {
    label: '@collidable',
    detail: 'Enable collision detection',
    insertText: 'collidable',
    documentation:
      'Adds a collision shape to the object so it can interact physically with other objects. Required for physics-based interactions like stacking or bouncing.',
    category: 'Interaction',
  },
  {
    label: '@physics',
    detail: 'Enable physics simulation',
    insertText: 'physics(mass: ${1:1.0}, restitution: ${2:0.3})',
    documentation:
      'Applies rigid-body physics simulation to the object, including gravity, mass, friction, and restitution. The object will respond to forces and collisions.',
    category: 'Interaction',
  },
  {
    label: '@gravity',
    detail: 'Apply gravity to the object',
    insertText: 'gravity(strength: ${1:9.81})',
    documentation:
      'Applies gravitational force to the object. Customize `strength` to simulate different environments (e.g., 1.62 for the Moon, 3.72 for Mars).',
    category: 'Interaction',
  },
  {
    label: '@trigger',
    detail: 'Make object act as a trigger zone',
    insertText: 'trigger',
    documentation:
      'Converts the object into a trigger volume. Other objects passing through it fire `on_trigger_enter` and `on_trigger_exit` events without physical collision.',
    category: 'Interaction',
  },
  {
    label: '@pointable',
    detail: 'Make object respond to pointer/ray input',
    insertText: 'pointable',
    documentation:
      'Allows the object to be targeted by controller ray or gaze pointer. Fires `on_point_enter` and `on_point_exit` events when the ray intersects the object.',
    category: 'Interaction',
  },
  {
    label: '@hoverable',
    detail: 'Make object respond to hover events',
    insertText: 'hoverable',
    documentation:
      'Enables hover detection on the object. Fires `on_hover_enter` and `on_hover_exit` when a controller or hand is near the object.',
    category: 'Interaction',
  },
  {
    label: '@clickable',
    detail: 'Make object respond to click/select input',
    insertText: 'clickable',
    documentation:
      'Makes the object respond to click or select actions from controllers, hand tracking, or gaze input. Fires `on_click` events.',
    category: 'Interaction',
  },
  {
    label: '@draggable',
    detail: 'Allow dragging the object in space',
    insertText: 'draggable',
    documentation:
      'Enables drag interaction on the object. Users can click/grab and move the object along a plane or freely in 3D space.',
    category: 'Interaction',
  },
  {
    label: '@scalable',
    detail: 'Allow scaling the object with gestures',
    insertText: 'scalable(min: ${1:0.1}, max: ${2:10.0})',
    documentation:
      'Allows the object to be scaled using pinch gestures or two-controller interaction. Set `min` and `max` to constrain the scale range.',
    category: 'Interaction',
  },

  // =========================================================================
  // Visual traits (10)
  // =========================================================================
  {
    label: '@glowing',
    detail: 'Add glow/emission effect',
    insertText: 'glowing(color: "${1:#00ffff}", intensity: ${2:1.0})',
    documentation:
      'Adds an emissive glow effect to the object. Configure `color` (hex) and `intensity` to control the bloom appearance.',
    category: 'Visual',
  },
  {
    label: '@transparent',
    detail: 'Make object semi-transparent',
    insertText: 'transparent(opacity: ${1:0.5})',
    documentation:
      'Sets the object to render with transparency. The `opacity` value ranges from 0.0 (fully transparent) to 1.0 (fully opaque).',
    category: 'Visual',
  },
  {
    label: '@spinning',
    detail: 'Continuously rotate the object',
    insertText: 'spinning(speed: ${1:1.0}, axis: "${2:y}")',
    documentation:
      'Applies a continuous rotation animation to the object around the specified axis ("x", "y", or "z") at the given speed (revolutions per second).',
    category: 'Visual',
  },
  {
    label: '@floating',
    detail: 'Apply a floating/bobbing animation',
    insertText: 'floating(height: ${1:0.3}, speed: ${2:1.0})',
    documentation:
      'Creates a gentle up-and-down bobbing animation. Configure `height` (amplitude) and `speed` (frequency) of the float cycle.',
    category: 'Visual',
  },
  {
    label: '@billboard',
    detail: 'Always face the camera/viewer',
    insertText: 'billboard',
    documentation:
      'Makes the object always rotate to face the active camera or viewer. Useful for labels, health bars, and 2D sprites in 3D space.',
    category: 'Visual',
  },
  {
    label: '@pulse',
    detail: 'Pulsing scale/glow animation',
    insertText: 'pulse(speed: ${1:1.0}, intensity: ${2:0.2})',
    documentation:
      'Applies a rhythmic pulsing effect that oscillates the object scale or glow intensity. Great for drawing attention to interactive elements.',
    category: 'Visual',
  },
  {
    label: '@animated',
    detail: 'Play animation clips on the object',
    insertText: 'animated(clip: "${1:idle}", loop: ${2:true})',
    documentation:
      'Plays animation clips on the object model. Supports skeletal and morph-target animations. Configure `clip` name and `loop` behavior.',
    category: 'Visual',
  },
  {
    label: '@look_at',
    detail: 'Make object orient toward a target',
    insertText: 'look_at(target: "${1:camera}")',
    documentation:
      'Rotates the object to face a specified target (another object ID or "camera"). Unlike billboard, this uses the forward axis and can be configured per-axis.',
    category: 'Visual',
  },
  {
    label: '@outline',
    detail: 'Render an outline around the object',
    insertText: 'outline(color: "${1:#ffffff}", width: ${2:2})',
    documentation:
      'Draws a colored outline/silhouette around the object. Commonly used for selection highlighting or emphasis. Configure `color` and `width`.',
    category: 'Visual',
  },
  {
    label: '@proximity',
    detail: 'React based on viewer proximity',
    insertText: 'proximity(range: ${1:5.0})',
    documentation:
      'Triggers visual or behavioral changes when a user enters or exits the specified `range` (in meters). Fires `on_proximity_enter` and `on_proximity_exit` events.',
    category: 'Visual',
  },

  // =========================================================================
  // AI/Behavior traits (5)
  // =========================================================================
  {
    label: '@behavior_tree',
    detail: 'Attach a behavior tree AI controller',
    insertText: 'behavior_tree(root: "${1:patrol}")',
    documentation:
      'Drives the object with a behavior tree AI system. Define sequences, selectors, and leaf actions to create complex NPC behaviors. Specify the `root` node name.',
    category: 'AI/Behavior',
  },
  {
    label: '@emotion',
    detail: 'Enable emotional state system',
    insertText: 'emotion(initial: "${1:neutral}")',
    documentation:
      'Adds an emotional state model to the object. Emotions like "happy", "sad", "angry", "fearful" influence animations, dialog, and behavior tree decisions.',
    category: 'AI/Behavior',
  },
  {
    label: '@goal_oriented',
    detail: 'Enable goal-oriented action planning (GOAP)',
    insertText: 'goal_oriented',
    documentation:
      'Attaches a goal-oriented action planning (GOAP) system. The AI evaluates world state and selects actions to achieve its goals dynamically.',
    category: 'AI/Behavior',
  },
  {
    label: '@perception',
    detail: 'Add sensory perception to the object',
    insertText: 'perception(sight: ${1:30}, hearing: ${2:15})',
    documentation:
      'Gives the object AI senses including sight (cone-based) and hearing (radius-based). Detected entities are available in behavior tree conditions.',
    category: 'AI/Behavior',
  },
  {
    label: '@memory',
    detail: 'Enable AI memory/knowledge system',
    insertText: 'memory(capacity: ${1:100})',
    documentation:
      'Provides the AI with a memory system that stores observed events, entity positions, and interactions. Memories decay over time based on `capacity`.',
    category: 'AI/Behavior',
  },

  // =========================================================================
  // Physics traits (9)
  // =========================================================================
  {
    label: '@cloth',
    detail: 'Simulate cloth/fabric physics',
    insertText: 'cloth(stiffness: ${1:0.5}, damping: ${2:0.1})',
    documentation:
      'Applies cloth simulation to the object mesh. The vertices respond to wind, gravity, and collisions. Configure `stiffness` and `damping` for fabric feel.',
    category: 'Physics',
  },
  {
    label: '@soft_body',
    detail: 'Enable soft body deformation physics',
    insertText: 'soft_body(pressure: ${1:1.0})',
    documentation:
      'Simulates soft body dynamics allowing the object to deform on impact. Useful for jelly-like objects, balloons, or organic materials. Adjust `pressure` for firmness.',
    category: 'Physics',
  },
  {
    label: '@fluid',
    detail: 'Simulate fluid/liquid physics',
    insertText: 'fluid(viscosity: ${1:0.5}, density: ${2:1.0})',
    documentation:
      'Enables fluid simulation on the object. Configure `viscosity` (flow resistance) and `density` for different liquid types (water, honey, lava).',
    category: 'Physics',
  },
  {
    label: '@buoyancy',
    detail: 'Enable buoyancy in fluid volumes',
    insertText: 'buoyancy(density: ${1:0.5})',
    documentation:
      'Makes the object float or sink in fluid volumes based on relative `density`. Objects with density less than the fluid will float.',
    category: 'Physics',
  },
  {
    label: '@rope',
    detail: 'Simulate rope/cable physics',
    insertText: 'rope(length: ${1:5.0}, segments: ${2:10})',
    documentation:
      'Creates a rope or cable simulation between anchor points. Configure `length` and `segments` for detail. Supports tension, slack, and collision.',
    category: 'Physics',
  },
  {
    label: '@wind',
    detail: 'Apply wind force to the object',
    insertText: 'wind(direction: [${1:1}, ${2:0}, ${3:0}], strength: ${4:5.0})',
    documentation:
      'Applies a directional wind force. Affects cloth, particles, soft bodies, and physics objects. Set `direction` vector and `strength`.',
    category: 'Physics',
  },
  {
    label: '@joint',
    detail: 'Create a physics joint/constraint',
    insertText: 'joint(type: "${1:hinge}", target: "${2:other_object}")',
    documentation:
      'Connects the object to another via a physics joint. Types: "hinge", "ball", "slider", "fixed", "spring". Specify the `target` object ID.',
    category: 'Physics',
  },
  {
    label: '@rigidbody',
    detail: 'Add rigid body physics component',
    insertText: 'rigidbody(mass: ${1:1.0}, friction: ${2:0.5})',
    documentation:
      'Attaches a rigid body physics component with configurable `mass`, `friction`, and collision response. Foundation for all physics-based interactions.',
    category: 'Physics',
  },
  {
    label: '@destruction',
    detail: 'Enable destructible object behavior',
    insertText: 'destruction(health: ${1:100}, fragments: ${2:8})',
    documentation:
      'Makes the object destructible. When `health` reaches zero, it breaks into `fragments` pieces with physics. Fires `on_destroy` event.',
    category: 'Physics',
  },

  // =========================================================================
  // Extended traits (11)
  // =========================================================================
  {
    label: '@rotatable',
    detail: 'Allow rotating the object with gestures',
    insertText: 'rotatable',
    documentation:
      'Enables rotation interaction via controller twist or two-handed gestures. The object can be rotated freely or constrained to specific axes.',
    category: 'Extended',
  },
  {
    label: '@stackable',
    detail: 'Allow objects to stack on each other',
    insertText: 'stackable',
    documentation:
      'Enables stacking behavior. Objects with this trait will snap to alignment when placed on top of each other, forming stable stacks.',
    category: 'Extended',
  },
  {
    label: '@snappable',
    detail: 'Snap to predefined positions or grid',
    insertText: 'snappable(grid: ${1:0.25})',
    documentation:
      'Makes the object snap to a grid or predefined snap points when moved. Configure `grid` size for the snap interval in meters.',
    category: 'Extended',
  },
  {
    label: '@breakable',
    detail: 'Object can be broken by force',
    insertText: 'breakable(threshold: ${1:50})',
    documentation:
      'The object breaks apart when a force exceeding `threshold` is applied. Generates fragment pieces and plays break effects. Fires `on_break` event.',
    category: 'Extended',
  },
  {
    label: '@character',
    detail: 'Define as a character with movement',
    insertText: 'character(speed: ${1:3.0}, jump_height: ${2:1.5})',
    documentation:
      'Marks the object as a character entity with built-in movement capabilities: walking, running, jumping. Configure `speed` and `jump_height`.',
    category: 'Extended',
  },
  {
    label: '@patrol',
    detail: 'Follow a patrol path automatically',
    insertText: 'patrol(path: "${1:patrol_path}", speed: ${2:2.0})',
    documentation:
      'Makes the object follow a defined patrol path. The AI navigates between waypoints at the given `speed`. Supports looping and ping-pong modes.',
    category: 'Extended',
  },
  {
    label: '@networked',
    detail: 'Synchronize object across network',
    insertText: 'networked(sync: [${1:"position", "rotation"}])',
    documentation:
      'Enables multiplayer synchronization. The specified properties are replicated across all connected clients. Supports ownership transfer and interpolation.',
    category: 'Extended',
  },
  {
    label: '@anchor',
    detail: 'Create a spatial anchor for AR persistence',
    insertText: 'anchor(persistent: ${1:true})',
    documentation:
      'Creates a spatial anchor at the object position for AR experiences. When `persistent` is true, the anchor survives across sessions.',
    category: 'Extended',
  },
  {
    label: '@spatial_audio',
    detail: 'Attach 3D spatial audio source',
    insertText: 'spatial_audio(src: "${1:sound.mp3}", rolloff: ${2:1.0})',
    documentation:
      'Attaches a spatialized 3D audio source to the object. Sound is positioned in 3D space with distance-based `rolloff` attenuation.',
    category: 'Extended',
  },
  {
    label: '@reverb_zone',
    detail: 'Define an audio reverb zone',
    insertText: 'reverb_zone(preset: "${1:hall}", radius: ${2:10})',
    documentation:
      'Creates an audio reverb zone around the object. Sounds playing within the `radius` receive the reverb `preset` (hall, cave, room, outdoor).',
    category: 'Extended',
  },
  {
    label: '@voice_proximity',
    detail: 'Enable proximity-based voice chat',
    insertText: 'voice_proximity(range: ${1:15}, falloff: ${2:1.0})',
    documentation:
      'Enables spatial voice chat. Players within `range` meters can hear each other with volume `falloff` based on distance.',
    category: 'Extended',
  },

  // =========================================================================
  // Advanced traits (10)
  // =========================================================================
  {
    label: '@teleport',
    detail: 'Enable teleportation to/from this object',
    insertText: 'teleport(target: "${1:destination}")',
    documentation:
      'Makes the object a teleportation point. Users can teleport to this location, or it can teleport the user to `target` on interaction.',
    category: 'Advanced',
  },
  {
    label: '@ui_panel',
    detail: 'Attach a floating UI panel to the object',
    insertText: 'ui_panel(width: ${1:400}, height: ${2:300})',
    documentation:
      'Renders a 2D UI panel in 3D space attached to the object. Supports buttons, text, images, and interactive form elements. Specify `width` and `height` in pixels.',
    category: 'Advanced',
  },
  {
    label: '@particle_system',
    detail: 'Attach a particle emitter to the object',
    insertText: 'particle_system(effect: "${1:fire}", rate: ${2:100})',
    documentation:
      'Attaches a particle system emitter. Built-in effects: "fire", "smoke", "sparks", "rain", "snow", "magic". Configure emission `rate` per second.',
    category: 'Advanced',
  },
  {
    label: '@weather',
    detail: 'Apply weather effects to the scene',
    insertText: 'weather(type: "${1:rain}", intensity: ${2:0.5})',
    documentation:
      'Generates environmental weather effects. Types: "rain", "snow", "fog", "storm", "sandstorm". Affects lighting, particles, and audio.',
    category: 'Advanced',
  },
  {
    label: '@day_night',
    detail: 'Enable day/night cycle',
    insertText: 'day_night(duration: ${1:300}, start_time: ${2:0.5})',
    documentation:
      'Adds a day/night cycle to the scene. `duration` is cycle length in seconds. `start_time` is 0.0 (midnight) to 1.0 (next midnight), 0.5 = noon.',
    category: 'Advanced',
  },
  {
    label: '@lod',
    detail: 'Enable level-of-detail switching',
    insertText: 'lod(distances: [${1:10, 30, 60}])',
    documentation:
      'Automatically switches between detail levels based on camera distance. Provide `distances` array for LOD transition thresholds in meters.',
    category: 'Advanced',
  },
  {
    label: '@hand_tracking',
    detail: 'Enable hand tracking interaction',
    insertText: 'hand_tracking(gestures: [${1:"pinch", "grab", "point"}])',
    documentation:
      'Enables hand-tracking-based interaction with the object. Specify recognized `gestures` array. Fires gesture events for each detected gesture.',
    category: 'Advanced',
  },
  {
    label: '@haptic',
    detail: 'Trigger haptic feedback on interaction',
    insertText: 'haptic(intensity: ${1:0.5}, duration: ${2:100})',
    documentation:
      'Sends haptic feedback (vibration) to the VR controller on interaction. Configure `intensity` (0-1) and `duration` in milliseconds.',
    category: 'Advanced',
  },
  {
    label: '@portal',
    detail: 'Create a portal to another scene or location',
    insertText: 'portal(destination: "${1:scene_name}")',
    documentation:
      'Renders a portal view showing the destination scene. Walking through the portal transitions the user to the `destination` scene or location.',
    category: 'Advanced',
  },
  {
    label: '@mirror',
    detail: 'Create a reflective mirror surface',
    insertText: 'mirror(quality: ${1:1.0})',
    documentation:
      'Renders real-time reflections on the object surface. The `quality` value (0-1) controls reflection resolution. Higher values are more GPU-intensive.',
    category: 'Advanced',
  },
];

export class HoloScriptCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    _document: vscode.TextDocument,
    _position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    // Create completion items for all traits
    const completionItems = ALL_TRAITS.map((trait) => {
      const item = new vscode.CompletionItem(trait.label, vscode.CompletionItemKind.Keyword);
      item.detail = `[${trait.category}] ${trait.detail}`;
      item.sortText = `0_${trait.category}_${trait.label}`;

      if (trait.insertText.includes('${')) {
        item.insertText = new vscode.SnippetString(trait.insertText);
      } else {
        item.insertText = trait.insertText;
      }

      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${trait.label}** \u2014 *${trait.category}*\n\n`);
      md.appendMarkdown(trait.documentation);
      item.documentation = md;

      return item;
    });

    return completionItems;
  }
}
