/**
 * CompletionProvider.ts
 *
 * Provides auto-completion for HoloScript editing.
 * Covers traits, directives, node types, properties, presets,
 * domain blocks, simulation constructs, HSPlus keywords,
 * and context-aware sub-block suggestions for all v4.2 grammar blocks.
 *
 * @version 4.2.1
 */

export interface CompletionItem {
    label: string;
    kind: 'trait' | 'directive' | 'property' | 'type' | 'keyword' | 'preset' | 'snippet' | 'block' | 'module';
    detail?: string;
    insertText?: string;
    documentation?: string;
}

// Known trait names
const TRAIT_COMPLETIONS: CompletionItem[] = [
    { label: 'grabbable', kind: 'trait', detail: 'Make node grabbable in VR', insertText: '@grabbable' },
    { label: 'audio', kind: 'trait', detail: 'Spatial audio source', insertText: '@audio(sound: "")' },
    { label: 'particles', kind: 'trait', detail: 'Attach particle system', insertText: '@particles(preset: "dust")' },
    { label: 'animation', kind: 'trait', detail: 'Keyframe animation', insertText: '@animation(clip: "")' },
    { label: 'state', kind: 'trait', detail: 'Finite state machine', insertText: '@state(initial: "idle")' },
    { label: 'sync', kind: 'trait', detail: 'Network synchronization', insertText: '@sync(rate: 20)' },
    { label: 'theme', kind: 'trait', detail: 'Apply theme styles', insertText: '@theme(classes: [])' },
    { label: 'events', kind: 'trait', detail: 'Event bus wiring', insertText: '@events(listen: {})' },
    { label: 'scrollable', kind: 'trait', detail: 'Physics-based scrolling', insertText: '@scrollable' },
    { label: 'keyboard', kind: 'trait', detail: 'VR keyboard input', insertText: '@keyboard' },
    // Physics & simulation traits
    { label: 'physics', kind: 'trait', detail: 'Enable physics simulation', insertText: '@physics' },
    { label: 'collidable', kind: 'trait', detail: 'Enable collision detection', insertText: '@collidable' },
    { label: 'networked', kind: 'trait', detail: 'Network replication', insertText: '@networked' },
    { label: 'pbr', kind: 'trait', detail: 'PBR material mode', insertText: '@pbr' },
    { label: 'spatial', kind: 'trait', detail: 'Spatial audio mode', insertText: '@spatial' },
    { label: 'hrtf', kind: 'trait', detail: 'HRTF spatial audio', insertText: '@hrtf' },
    { label: 'looping', kind: 'trait', detail: 'Loop animation/particles', insertText: '@looping' },
    { label: 'dynamic', kind: 'trait', detail: 'Dynamic updates enabled', insertText: '@dynamic' },
    { label: 'lod', kind: 'trait', detail: 'Level of detail system', insertText: '@lod' },
    { label: 'obstacle_avoidance', kind: 'trait', detail: 'AI obstacle avoidance', insertText: '@obstacle_avoidance' },
    { label: 'safety_rated', kind: 'trait', detail: 'Safety-rated component', insertText: '@safety_rated' },
    { label: 'telemetry', kind: 'trait', detail: 'Telemetry streaming', insertText: '@telemetry' },
    // Material & rendering traits
    { label: 'transparent', kind: 'trait', detail: 'Transparent rendering mode', insertText: '@transparent' },
    { label: 'double_sided', kind: 'trait', detail: 'Double-sided material', insertText: '@double_sided' },
    { label: 'animated', kind: 'trait', detail: 'Animated properties', insertText: '@animated' },
    { label: 'encoder', kind: 'trait', detail: 'Encoder binding', insertText: '@encoder' },
    { label: 'revolute', kind: 'trait', detail: 'Revolute joint constraint', insertText: '@revolute' },
    { label: 'seed', kind: 'trait', detail: 'Procedural seed value', insertText: '@seed' },
];

// Known directive names
const DIRECTIVE_COMPLETIONS: CompletionItem[] = [
    { label: 'version', kind: 'directive', detail: 'Scene version', insertText: '@version("1.0")' },
    { label: 'author', kind: 'directive', detail: 'Author metadata', insertText: '@author("")' },
    { label: 'if', kind: 'directive', detail: 'Conditional rendering', insertText: '@if(condition)' },
    { label: 'each', kind: 'directive', detail: 'List iteration', insertText: '@each(items as item)' },
    { label: 'on', kind: 'directive', detail: 'Event handler', insertText: '@on("event")' },
    { label: 'emit', kind: 'directive', detail: 'Emit event', insertText: '@emit("event")' },
    { label: 'slot', kind: 'directive', detail: 'Content slot', insertText: '@slot("default")' },
];

// Node types
const TYPE_COMPLETIONS: CompletionItem[] = [
    { label: 'box', kind: 'type', detail: '3D box primitive' },
    { label: 'sphere', kind: 'type', detail: '3D sphere primitive' },
    { label: 'cylinder', kind: 'type', detail: '3D cylinder primitive' },
    { label: 'plane', kind: 'type', detail: '3D plane primitive' },
    { label: 'panel', kind: 'type', detail: 'UI panel container' },
    { label: 'button', kind: 'type', detail: 'Interactive button' },
    { label: 'text', kind: 'type', detail: 'Text element' },
    { label: 'group', kind: 'type', detail: 'Container node' },
    { label: 'light', kind: 'type', detail: 'Light source' },
    { label: 'camera', kind: 'type', detail: 'Camera viewpoint' },
];

// Property names
const PROPERTY_COMPLETIONS: CompletionItem[] = [
    { label: 'position', kind: 'property', detail: 'Vec3', insertText: 'position: [0, 0, 0]' },
    { label: 'rotation', kind: 'property', detail: 'Vec3', insertText: 'rotation: [0, 0, 0]' },
    { label: 'scale', kind: 'property', detail: 'Vec3', insertText: 'scale: [1, 1, 1]' },
    { label: 'color', kind: 'property', detail: 'Color string', insertText: 'color: "#FFFFFF"' },
    { label: 'opacity', kind: 'property', detail: 'Number 0-1', insertText: 'opacity: 1' },
    { label: 'visible', kind: 'property', detail: 'Boolean', insertText: 'visible: true' },
];

// =============================================================================
// DOMAIN & SIMULATION BLOCK COMPLETIONS (v4.2)
// =============================================================================

const BLOCK_COMPLETIONS: CompletionItem[] = [
    // ── Core scene ──────────────────────────────────────────────────────────
    { label: 'composition', kind: 'block', detail: 'Scene composition', insertText: 'composition "Name" {\n  \n}' },
    { label: 'template', kind: 'block', detail: 'Reusable template', insertText: 'template "Name" {\n  \n}' },
    { label: 'object', kind: 'block', detail: 'Scene object', insertText: 'object "Name" {\n  \n}' },
    { label: 'environment', kind: 'block', detail: 'Environment settings', insertText: 'environment {\n  \n}' },
    { label: 'entity', kind: 'block', detail: 'Entity with components', insertText: 'entity "Name" {\n  \n}' },
    { label: 'world', kind: 'block', detail: 'World container', insertText: 'world "Name" {\n  \n}' },

    // ── Material & Shader System (7 material types) ─────────────────────────
    { label: 'material', kind: 'block', detail: 'PBR material definition', insertText: 'material "Name" @pbr {\n  baseColor: "#ffffff"\n  roughness: 0.5\n  metallic: 0.0\n}', documentation: 'Standard PBR material with baseColor, roughness, metallic properties' },
    { label: 'pbr_material', kind: 'block', detail: 'PBR material (explicit)', insertText: 'pbr_material "Name" {\n  baseColor: "#ffffff"\n  roughness: 0.5\n  metallic: 0.0\n  albedo_map { source: "texture.png" tiling: [1, 1] }\n}', documentation: 'Explicit PBR material with texture map sub-blocks' },
    { label: 'unlit_material', kind: 'block', detail: 'Unlit material (no lighting)', insertText: 'unlit_material "Name" {\n  emissive_color: "#ffffff"\n  opacity: 1.0\n}', documentation: 'Unlit material — not affected by scene lighting' },
    { label: 'shader', kind: 'block', detail: 'Custom shader definition', insertText: 'shader "Name" {\n  pass "ForwardBase" {\n    vertex: "shaders/custom.vert"\n    fragment: "shaders/custom.frag"\n  }\n}', documentation: 'Custom shader with vertex/fragment pass definitions' },
    { label: 'toon_material', kind: 'block', detail: 'Toon/cel-shaded material', insertText: 'toon_material "Name" {\n  baseColor: "#ffffff"\n  outline_width: 0.02\n  outline_color: "#000000"\n  shading_steps: 3\n}', documentation: 'Toon/cel-shading material with outline and step parameters' },
    { label: 'glass_material', kind: 'block', detail: 'Glass/transparent material', insertText: 'glass_material "Name" @transparent {\n  baseColor: "#ffffff"\n  opacity: 0.3\n  ior: 1.52\n  transmission: 0.95\n}', documentation: 'Glass material with IOR, transmission, and transparency' },
    { label: 'subsurface_material', kind: 'block', detail: 'Subsurface scattering material', insertText: 'subsurface_material "Name" {\n  baseColor: "#ffddcc"\n  subsurface_color: "#ff4444"\n  subsurface_radius: [1.0, 0.2, 0.1]\n  thickness: 0.5\n}', documentation: 'Subsurface scattering for skin, wax, jade, etc.' },

    // ── Texture map sub-blocks (19 channels) ────────────────────────────────
    { label: 'albedo_map', kind: 'block', detail: 'Albedo/diffuse texture', insertText: 'albedo_map { source: "textures/diffuse.png" tiling: [1, 1] filtering: "trilinear" }', documentation: 'Albedo (diffuse color) texture channel' },
    { label: 'normal_map', kind: 'block', detail: 'Normal/bump texture', insertText: 'normal_map { source: "textures/normal.png" strength: 1.0 }', documentation: 'Normal map for surface detail' },
    { label: 'roughness_map', kind: 'block', detail: 'Roughness texture', insertText: 'roughness_map { source: "textures/roughness.png" }', documentation: 'Roughness channel texture' },
    { label: 'metallic_map', kind: 'block', detail: 'Metallic texture', insertText: 'metallic_map { source: "textures/metallic.png" }', documentation: 'Metallic channel texture' },
    { label: 'emission_map', kind: 'block', detail: 'Emission texture', insertText: 'emission_map { source: "textures/emission.png" }', documentation: 'Emission/glow texture' },
    { label: 'ao_map', kind: 'block', detail: 'Ambient occlusion texture', insertText: 'ao_map { source: "textures/ao.png" }', documentation: 'Ambient occlusion texture' },
    { label: 'height_map', kind: 'block', detail: 'Height/displacement texture', insertText: 'height_map { source: "textures/height.png" scale: 0.1 }', documentation: 'Height map for parallax or displacement' },
    { label: 'opacity_map', kind: 'block', detail: 'Opacity/alpha texture', insertText: 'opacity_map { source: "textures/opacity.png" }', documentation: 'Opacity/alpha channel texture' },
    { label: 'displacement_map', kind: 'block', detail: 'Displacement texture', insertText: 'displacement_map { source: "textures/displacement.png" scale: 0.05 }', documentation: 'Displacement mapping texture' },
    { label: 'specular_map', kind: 'block', detail: 'Specular texture', insertText: 'specular_map { source: "textures/specular.png" }', documentation: 'Specular highlight texture' },
    { label: 'clearcoat_map', kind: 'block', detail: 'Clearcoat texture', insertText: 'clearcoat_map { source: "textures/clearcoat.png" }', documentation: 'Clearcoat layer texture (car paint, lacquer)' },
    { label: 'baseColor_map', kind: 'block', detail: 'Base color texture', insertText: 'baseColor_map { source: "textures/basecolor.png" tiling: [1, 1] }', documentation: 'Base color texture (PBR metallic workflow)' },
    { label: 'emissive_map', kind: 'block', detail: 'Emissive texture', insertText: 'emissive_map { source: "textures/emissive.png" }', documentation: 'Emissive glow texture' },
    { label: 'transmission_map', kind: 'block', detail: 'Transmission texture', insertText: 'transmission_map { source: "textures/transmission.png" }', documentation: 'Transmission texture (glass, thin surfaces)' },
    { label: 'sheen_map', kind: 'block', detail: 'Sheen texture', insertText: 'sheen_map { source: "textures/sheen.png" }', documentation: 'Sheen texture (fabric, velvet)' },
    { label: 'anisotropy_map', kind: 'block', detail: 'Anisotropy texture', insertText: 'anisotropy_map { source: "textures/anisotropy.png" }', documentation: 'Anisotropy direction texture (brushed metal)' },
    { label: 'thickness_map', kind: 'block', detail: 'Thickness texture', insertText: 'thickness_map { source: "textures/thickness.png" }', documentation: 'Thickness map (subsurface scattering)' },
    { label: 'subsurface_map', kind: 'block', detail: 'Subsurface texture', insertText: 'subsurface_map { source: "textures/subsurface.png" }', documentation: 'Subsurface scattering color texture' },
    { label: 'iridescence_map', kind: 'block', detail: 'Iridescence texture', insertText: 'iridescence_map { source: "textures/iridescence.png" }', documentation: 'Iridescence texture (oil slick, soap bubble)' },

    // ── Shader passes ───────────────────────────────────────────────────────
    { label: 'pass', kind: 'block', detail: 'Shader render pass', insertText: 'pass "ForwardBase" {\n  vertex: "shaders/vert.glsl"\n  fragment: "shaders/frag.glsl"\n}', documentation: 'Multi-pass shader rendering stage' },

    // ── Collider (7 shapes) ─────────────────────────────────────────────────
    { label: 'collider', kind: 'block', detail: 'Collision shape', insertText: 'collider sphere {\n  radius: 0.5\n  is_trigger: false\n}', documentation: 'Shapes: box, sphere, capsule, mesh, convex, cylinder, heightfield' },
    { label: 'trigger', kind: 'block', detail: 'Trigger volume', insertText: 'trigger box {\n  size: [1, 1, 1]\n}', documentation: 'Trigger collider (non-physical overlap detection)' },

    // ── Rigidbody ───────────────────────────────────────────────────────────
    { label: 'rigidbody', kind: 'block', detail: 'Rigid body physics', insertText: 'rigidbody {\n  mass: 1.0\n  use_gravity: true\n  linear_damping: 0.0\n  angular_damping: 0.05\n}', documentation: 'Rigid body dynamics component' },

    // ── Force fields (6 types) ──────────────────────────────────────────────
    { label: 'force_field', kind: 'block', detail: 'Directional force field', insertText: 'force_field "Name" {\n  strength: 5.0\n  direction: [0, 1, 0]\n  falloff: "linear"\n}', documentation: 'Generic directional force field' },
    { label: 'gravity_zone', kind: 'block', detail: 'Custom gravity zone', insertText: 'gravity_zone "Name" {\n  gravity: [0, -9.81, 0]\n  shape: "box"\n  bounds: [10, 10, 10]\n}', documentation: 'Override gravity within a spatial zone' },
    { label: 'wind_zone', kind: 'block', detail: 'Wind zone effect', insertText: 'wind_zone "Name" {\n  direction: [1, 0, 0]\n  strength: 3.0\n  turbulence: 0.5\n}', documentation: 'Wind force affecting particles and physics' },
    { label: 'buoyancy_zone', kind: 'block', detail: 'Buoyancy/water zone', insertText: 'buoyancy_zone "Name" {\n  density: 1000\n  surface_height: 0.0\n  drag: 0.3\n}', documentation: 'Water buoyancy simulation zone' },
    { label: 'magnetic_field', kind: 'block', detail: 'Magnetic field zone', insertText: 'magnetic_field "Name" {\n  strength: 10.0\n  pole: [0, 1, 0]\n}', documentation: 'Magnetic attraction/repulsion field' },
    { label: 'drag_zone', kind: 'block', detail: 'Drag/resistance zone', insertText: 'drag_zone "Name" {\n  linear_drag: 0.5\n  angular_drag: 0.3\n}', documentation: 'Air/fluid resistance zone' },

    // ── Articulation (with 8 joint types) ───────────────────────────────────
    { label: 'articulation', kind: 'block', detail: 'Physics articulation chain', insertText: 'articulation "Name" {\n  joint "Joint1" {\n    type: "revolute"\n    axis: [0, 1, 0]\n    limits: [-90, 90]\n  }\n}', documentation: 'Articulated physics body with joint chains' },

    // ── Joint sub-blocks (8 types) ──────────────────────────────────────────
    { label: 'joint', kind: 'block', detail: 'Generic joint', insertText: 'joint "Name" {\n  type: "revolute"\n  axis: [0, 1, 0]\n  limits: [-90, 90]\n}', documentation: 'Generic physics joint' },
    { label: 'hinge', kind: 'block', detail: 'Hinge joint (1 axis)', insertText: 'hinge "Name" {\n  axis: [0, 1, 0]\n  limits: [-90, 90]\n  motor_speed: 0\n}', documentation: 'Single-axis rotation (doors, wheels)' },
    { label: 'slider', kind: 'block', detail: 'Slider/prismatic joint', insertText: 'slider "Name" {\n  axis: [1, 0, 0]\n  limits: [0, 2]\n}', documentation: 'Linear sliding joint (pistons, drawers)' },
    { label: 'ball_socket', kind: 'block', detail: 'Ball-socket joint (3 axes)', insertText: 'ball_socket "Name" {\n  swing_limit: 45\n  twist_limit: 30\n}', documentation: 'Spherical joint (shoulders, ragdoll)' },
    { label: 'fixed_joint', kind: 'block', detail: 'Fixed/weld joint', insertText: 'fixed_joint "Name" {\n  break_force: 1000\n}', documentation: 'Rigid connection between bodies' },
    { label: 'd6_joint', kind: 'block', detail: '6-DOF configurable joint', insertText: 'd6_joint "Name" {\n  x_motion: "locked"\n  y_motion: "limited"\n  z_motion: "free"\n  swing1_limit: 45\n  swing2_limit: 45\n  twist_limit: 30\n}', documentation: 'Fully configurable 6-degree-of-freedom joint' },
    { label: 'spring_joint', kind: 'block', detail: 'Spring joint', insertText: 'spring_joint "Name" {\n  stiffness: 100\n  damping: 5\n  rest_length: 1.0\n}', documentation: 'Spring-damper connection between bodies' },
    { label: 'prismatic', kind: 'block', detail: 'Prismatic joint', insertText: 'prismatic "Name" {\n  axis: [0, 1, 0]\n  limits: [0, 5]\n}', documentation: 'Linear translation joint' },

    // ── Particle system (with 15 module sub-blocks) ─────────────────────────
    { label: 'particles', kind: 'block', detail: 'Particle system', insertText: 'particles "Name" @looping {\n  max_particles: 500\n  emission { rate: 50 }\n  lifetime { min: 1.0 max: 3.0 }\n}', documentation: 'Full particle system with module sub-blocks' },
    { label: 'emitter', kind: 'block', detail: 'Particle emitter', insertText: 'emitter "Name" {\n  rate: 100\n  shape: "cone"\n}', documentation: 'Standalone particle emitter' },
    { label: 'vfx', kind: 'block', detail: 'Visual effect', insertText: 'vfx "Name" {\n  \n}', documentation: 'Visual effect container' },
    { label: 'particle_system', kind: 'block', detail: 'Particle system (explicit)', insertText: 'particle_system "Name" {\n  max_particles: 1000\n  emission { rate: 200 }\n}', documentation: 'Explicit particle_system keyword' },

    // ── Particle module sub-blocks (15 modules) ─────────────────────────────
    { label: 'emission', kind: 'module', detail: 'Particle emission module', insertText: 'emission {\n  rate: 50\n  bursts: [{ time: 0 count: 100 }]\n}', documentation: 'Controls particle spawn rate and bursts' },
    { label: 'lifetime', kind: 'module', detail: 'Particle lifetime module', insertText: 'lifetime {\n  min: 1.0\n  max: 3.0\n}', documentation: 'Min/max particle lifetime in seconds' },
    { label: 'velocity', kind: 'module', detail: 'Particle velocity module', insertText: 'velocity {\n  initial: [0, 5, 0]\n  randomize: 0.3\n}', documentation: 'Initial velocity and randomization' },
    { label: 'force', kind: 'module', detail: 'Particle force module', insertText: 'force {\n  gravity: [0, -9.81, 0]\n  wind: [1, 0, 0]\n}', documentation: 'External forces on particles' },
    { label: 'color_over_life', kind: 'module', detail: 'Color over lifetime', insertText: 'color_over_life {\n  gradient: [{ t: 0 color: "#ffffff" }, { t: 1 color: "#000000" }]\n}', documentation: 'Color gradient over particle lifetime' },
    { label: 'size_over_life', kind: 'module', detail: 'Size over lifetime', insertText: 'size_over_life {\n  curve: [{ t: 0 size: 1.0 }, { t: 1 size: 0.0 }]\n}', documentation: 'Size curve over particle lifetime' },
    { label: 'noise', kind: 'module', detail: 'Particle noise module', insertText: 'noise {\n  strength: 0.5\n  frequency: 2.0\n  scroll_speed: 0.1\n}', documentation: 'Turbulence noise applied to particles' },
    { label: 'collision', kind: 'module', detail: 'Particle collision module', insertText: 'collision {\n  enabled: true\n  bounce: 0.3\n  lifetime_loss: 0.1\n}', documentation: 'Particle world collision behavior' },
    { label: 'sub_emitter', kind: 'module', detail: 'Sub-emitter module', insertText: 'sub_emitter {\n  trigger: "death"\n  emitter: "SparkBurst"\n}', documentation: 'Spawn sub-particles on birth/death/collision' },
    { label: 'shape', kind: 'module', detail: 'Emission shape module', insertText: 'shape {\n  type: "cone"\n  angle: 30\n  radius: 0.5\n}', documentation: 'Spatial emission shape (cone, sphere, box, edge, mesh)' },
    { label: 'renderer', kind: 'module', detail: 'Particle renderer module', insertText: 'renderer {\n  mode: "billboard"\n  material: "ParticleMat"\n  sort_mode: "by_distance"\n}', documentation: 'Particle rendering mode and material' },
    { label: 'rotation_over_life', kind: 'module', detail: 'Rotation over lifetime', insertText: 'rotation_over_life {\n  angular_velocity: 90\n  randomize: 0.2\n}', documentation: 'Rotation animation over lifetime' },
    { label: 'trails', kind: 'module', detail: 'Particle trails module', insertText: 'trails {\n  lifetime: 0.5\n  width: 0.1\n  color: "#ffffff"\n}', documentation: 'Ribbon/trail rendering behind particles' },
    { label: 'texture_sheet', kind: 'module', detail: 'Texture sheet animation', insertText: 'texture_sheet {\n  tiles: [4, 4]\n  fps: 24\n  mode: "whole_sheet"\n}', documentation: 'Flipbook/sprite sheet animation' },
    { label: 'inherit_velocity', kind: 'module', detail: 'Inherit velocity module', insertText: 'inherit_velocity {\n  mode: "initial"\n  multiplier: 0.5\n}', documentation: 'Inherit parent velocity on emission' },

    // ── Post-processing (22 effects) ────────────────────────────────────────
    { label: 'post_processing', kind: 'block', detail: 'Post-processing stack', insertText: 'post_processing "Name" {\n  bloom { intensity: 0.5 threshold: 1.0 }\n  color_grading { temperature: 6500 tint: 0 }\n}', documentation: 'Camera post-processing effect stack' },
    { label: 'post_fx', kind: 'block', detail: 'Post-FX pipeline', insertText: 'post_fx "Name" {\n  bloom { intensity: 0.5 }\n}', documentation: 'Alias for post_processing' },
    { label: 'render_pipeline', kind: 'block', detail: 'Custom render pipeline', insertText: 'render_pipeline "Name" {\n  anti_aliasing { mode: "taa" }\n}', documentation: 'Full render pipeline configuration' },

    // ── Post-processing effect sub-blocks (22 effects) ──────────────────────
    { label: 'bloom', kind: 'module', detail: 'Bloom/glow effect', insertText: 'bloom {\n  intensity: 0.5\n  threshold: 1.0\n  radius: 4\n}', documentation: 'HDR bloom/glow on bright pixels' },
    { label: 'ambient_occlusion', kind: 'module', detail: 'Ambient occlusion', insertText: 'ambient_occlusion {\n  intensity: 1.0\n  radius: 0.5\n  quality: "high"\n}', documentation: 'Screen-space ambient occlusion' },
    { label: 'ssao', kind: 'module', detail: 'SSAO effect', insertText: 'ssao {\n  intensity: 1.0\n  radius: 0.5\n}', documentation: 'Screen-space ambient occlusion (alias)' },
    { label: 'color_grading', kind: 'module', detail: 'Color grading/LUT', insertText: 'color_grading {\n  temperature: 6500\n  tint: 0\n  saturation: 1.0\n  contrast: 1.0\n  brightness: 0\n}', documentation: 'Color temperature, saturation, LUT support' },
    { label: 'tone_mapping', kind: 'module', detail: 'HDR tone mapping', insertText: 'tone_mapping {\n  mode: "aces"\n  exposure: 1.0\n}', documentation: 'HDR to LDR tone mapping (aces, reinhard, filmic)' },
    { label: 'depth_of_field', kind: 'module', detail: 'Depth of field', insertText: 'depth_of_field {\n  aperture: 2.8\n  focus_distance: 10\n  focal_length: 50\n}', documentation: 'Camera depth of field / bokeh' },
    { label: 'motion_blur', kind: 'module', detail: 'Motion blur', insertText: 'motion_blur {\n  intensity: 0.5\n  sample_count: 8\n}', documentation: 'Per-object or camera motion blur' },
    { label: 'vignette', kind: 'module', detail: 'Vignette effect', insertText: 'vignette {\n  intensity: 0.3\n  smoothness: 0.5\n}', documentation: 'Screen-edge darkening effect' },
    { label: 'chromatic_aberration', kind: 'module', detail: 'Chromatic aberration', insertText: 'chromatic_aberration {\n  intensity: 0.1\n}', documentation: 'Color fringing at screen edges' },
    { label: 'fog', kind: 'module', detail: 'Distance fog', insertText: 'fog {\n  color: "#cccccc"\n  density: 0.01\n  start: 10\n  end: 100\n}', documentation: 'Distance-based fog effect' },
    { label: 'volumetric_fog', kind: 'module', detail: 'Volumetric fog', insertText: 'volumetric_fog {\n  density: 0.02\n  albedo: "#ffffff"\n  anisotropy: 0.6\n}', documentation: 'Ray-marched volumetric fog' },
    { label: 'screen_space_reflections', kind: 'module', detail: 'Screen-space reflections', insertText: 'screen_space_reflections {\n  quality: "high"\n  max_distance: 50\n}', documentation: 'Real-time screen-space reflections' },
    { label: 'ssr', kind: 'module', detail: 'SSR (alias)', insertText: 'ssr {\n  quality: "medium"\n  max_distance: 30\n}', documentation: 'Screen-space reflections (alias)' },
    { label: 'anti_aliasing', kind: 'module', detail: 'Anti-aliasing', insertText: 'anti_aliasing {\n  mode: "taa"\n}', documentation: 'Anti-aliasing mode selector' },
    { label: 'fxaa', kind: 'module', detail: 'FXAA', insertText: 'fxaa {\n  quality: "high"\n}', documentation: 'Fast approximate anti-aliasing' },
    { label: 'smaa', kind: 'module', detail: 'SMAA', insertText: 'smaa {\n  quality: "high"\n}', documentation: 'Subpixel morphological anti-aliasing' },
    { label: 'taa', kind: 'module', detail: 'TAA', insertText: 'taa {\n  jitter_spread: 0.75\n  sharpness: 0.25\n}', documentation: 'Temporal anti-aliasing' },
    { label: 'film_grain', kind: 'module', detail: 'Film grain', insertText: 'film_grain {\n  intensity: 0.3\n  response: 0.8\n}', documentation: 'Film grain noise overlay' },
    { label: 'lens_flare', kind: 'module', detail: 'Lens flare', insertText: 'lens_flare {\n  intensity: 1.0\n  threshold: 0.9\n}', documentation: 'Lens flare from bright light sources' },
    { label: 'god_rays', kind: 'module', detail: 'God rays / light shafts', insertText: 'god_rays {\n  intensity: 0.5\n  decay: 0.95\n  density: 1.0\n}', documentation: 'Volumetric light shaft effect' },
    { label: 'outline', kind: 'module', detail: 'Outline effect', insertText: 'outline {\n  color: "#000000"\n  width: 1.0\n}', documentation: 'Edge detection outline rendering' },
    { label: 'pixelate', kind: 'module', detail: 'Pixelate effect', insertText: 'pixelate {\n  pixel_size: 4\n}', documentation: 'Retro pixelation post-effect' },

    // ── Audio source (6 keywords) ───────────────────────────────────────────
    { label: 'audio_source', kind: 'block', detail: 'Spatial audio source', insertText: 'audio_source "Name" @spatial {\n  clip: "audio.ogg"\n  volume: 0.8\n  spatialization: "hrtf"\n}', documentation: 'Spatial audio emitter with 3D positioning' },
    { label: 'audio_listener', kind: 'block', detail: 'Audio listener', insertText: 'audio_listener "Name" {\n  active: true\n}', documentation: 'Audio listener (microphone) position' },
    { label: 'reverb_zone', kind: 'block', detail: 'Reverb zone', insertText: 'reverb_zone "Name" {\n  decay_time: 2.0\n  room_size: 0.8\n  pre_delay: 20\n}', documentation: 'Spatial reverb processing zone' },
    { label: 'audio_mixer', kind: 'block', detail: 'Audio mixer channel', insertText: 'audio_mixer "Name" {\n  volume: 1.0\n  mute: false\n}', documentation: 'Audio mixing channel/group' },
    { label: 'ambience', kind: 'block', detail: 'Ambient soundscape', insertText: 'ambience "Name" {\n  clip: "ambient.ogg"\n  volume: 0.3\n  loop: true\n}', documentation: 'Background ambient audio' },
    { label: 'sound_emitter', kind: 'block', detail: 'Sound emitter', insertText: 'sound_emitter "Name" @spatial {\n  clip: "sound.ogg"\n  volume: 1.0\n}', documentation: 'Alias for spatial sound source' },

    // ── Weather & atmosphere (12 layer sub-blocks) ──────────────────────────
    { label: 'weather', kind: 'block', detail: 'Weather system', insertText: 'weather "Name" {\n  wind { speed: 3.0 direction: [1, 0, 0] }\n  rain { intensity: 0.5 }\n}', documentation: 'Dynamic weather system with layer sub-blocks' },
    { label: 'atmosphere', kind: 'block', detail: 'Atmosphere settings', insertText: 'atmosphere "Name" {\n  scattering: true\n  density: 1.0\n}', documentation: 'Atmospheric scattering settings' },
    { label: 'sky', kind: 'block', detail: 'Sky/skybox settings', insertText: 'sky "Name" {\n  type: "procedural"\n  sun_size: 0.04\n}', documentation: 'Sky rendering configuration' },
    { label: 'climate', kind: 'block', detail: 'Climate system', insertText: 'climate "Name" {\n  temperature { base: 20 variation: 5 }\n  humidity { base: 60 }\n}', documentation: 'Full climate simulation' },

    // ── Weather layer sub-blocks (12 layers) ────────────────────────────────
    { label: 'rain', kind: 'module', detail: 'Rain weather layer', insertText: 'rain {\n  intensity: 0.5\n  drop_size: 0.02\n  splash: true\n}', documentation: 'Rain precipitation effect' },
    { label: 'snow', kind: 'module', detail: 'Snow weather layer', insertText: 'snow {\n  intensity: 0.5\n  flake_size: 0.01\n  accumulation: true\n}', documentation: 'Snow precipitation effect' },
    { label: 'wind', kind: 'module', detail: 'Wind layer', insertText: 'wind {\n  speed: 3.0\n  direction: [1, 0, 0]\n  gusts: 0.3\n}', documentation: 'Wind force and direction' },
    { label: 'lightning', kind: 'module', detail: 'Lightning layer', insertText: 'lightning {\n  frequency: 5\n  intensity: 2.0\n}', documentation: 'Lightning flash and bolt effects' },
    { label: 'clouds', kind: 'module', detail: 'Cloud layer', insertText: 'clouds {\n  coverage: 0.5\n  density: 0.3\n  type: "cumulus"\n}', documentation: 'Volumetric cloud layer' },
    { label: 'hail', kind: 'module', detail: 'Hail weather layer', insertText: 'hail {\n  intensity: 0.3\n  size: 0.05\n}', documentation: 'Hail precipitation effect' },
    { label: 'time_of_day', kind: 'module', detail: 'Day/night cycle', insertText: 'time_of_day {\n  hour: 12\n  speed: 1.0\n  auto_cycle: true\n}', documentation: 'Sun position and day/night cycle' },
    { label: 'sun', kind: 'module', detail: 'Sun settings', insertText: 'sun {\n  intensity: 1.0\n  color: "#fff5e0"\n  angle: 45\n}', documentation: 'Sun light parameters' },
    { label: 'moon', kind: 'module', detail: 'Moon settings', insertText: 'moon {\n  phase: 0.5\n  intensity: 0.1\n}', documentation: 'Moon phase and light' },
    { label: 'fog_layer', kind: 'module', detail: 'Atmospheric fog layer', insertText: 'fog_layer {\n  density: 0.02\n  height: 5.0\n  color: "#cccccc"\n}', documentation: 'Height-based atmospheric fog' },
    { label: 'aurora', kind: 'module', detail: 'Aurora borealis', insertText: 'aurora {\n  intensity: 0.8\n  speed: 0.5\n  colors: ["#00ff88", "#0088ff"]\n}', documentation: 'Northern/southern lights effect' },
    { label: 'dust_storm', kind: 'module', detail: 'Dust storm layer', insertText: 'dust_storm {\n  intensity: 0.7\n  visibility: 50\n}', documentation: 'Dust/sand storm weather effect' },

    // ── Procedural generation ────────────────────────────────────────────────
    { label: 'procedural', kind: 'block', detail: 'Procedural generation', insertText: 'procedural "Name" {\n  perlin base { scale: 100 octaves: 6 persistence: 0.5 }\n  biome "Forest" { threshold: 0.6 density: 0.8 }\n}', documentation: 'Procedural content generation with noise and biomes' },
    { label: 'generate', kind: 'block', detail: 'Generate block', insertText: 'generate "Name" {\n  \n}', documentation: 'Alias for procedural generation' },
    { label: 'scatter', kind: 'block', detail: 'Distribution scatter', insertText: 'scatter "Name" {\n  count: 1000\n  radius: 50\n  seed: 42\n}', documentation: 'Scatter placement distribution' },
    { label: 'distribute', kind: 'block', detail: 'Distribution block', insertText: 'distribute "Name" {\n  pattern: "poisson"\n  density: 0.5\n}', documentation: 'Object distribution pattern' },

    // ── Noise functions (procedural sub-blocks) ─────────────────────────────
    { label: 'perlin', kind: 'module', detail: 'Perlin noise', insertText: 'perlin base {\n  scale: 100\n  octaves: 6\n  persistence: 0.5\n  lacunarity: 2.0\n}', documentation: 'Classic Perlin noise function' },
    { label: 'simplex', kind: 'module', detail: 'Simplex noise', insertText: 'simplex base {\n  scale: 100\n  octaves: 4\n}', documentation: 'Simplex noise (faster Perlin variant)' },
    { label: 'voronoi', kind: 'module', detail: 'Voronoi noise', insertText: 'voronoi base {\n  scale: 50\n  jitter: 0.8\n}', documentation: 'Voronoi/cellular noise pattern' },
    { label: 'worley', kind: 'module', detail: 'Worley noise', insertText: 'worley base {\n  scale: 50\n  distance_func: "euclidean"\n}', documentation: 'Worley/cell noise function' },
    { label: 'fbm', kind: 'module', detail: 'Fractal Brownian motion', insertText: 'fbm base {\n  octaves: 8\n  gain: 0.5\n  frequency: 1.0\n}', documentation: 'Fractal Brownian motion noise' },
    { label: 'ridged', kind: 'module', detail: 'Ridged noise', insertText: 'ridged base {\n  octaves: 6\n  sharpness: 2.0\n}', documentation: 'Ridged multifractal noise (mountain ridges)' },
    { label: 'cellular', kind: 'module', detail: 'Cellular noise', insertText: 'cellular base {\n  scale: 20\n  type: "f1"\n}', documentation: 'Cellular automata noise pattern' },
    { label: 'white_noise', kind: 'module', detail: 'White noise', insertText: 'white_noise base {\n  seed: 42\n}', documentation: 'Uniform random white noise' },
    { label: 'curl', kind: 'module', detail: 'Curl noise', insertText: 'curl base {\n  scale: 50\n  strength: 1.0\n}', documentation: 'Divergence-free curl noise (fluid flow)' },
    { label: 'domain_warp', kind: 'module', detail: 'Domain warp', insertText: 'domain_warp base {\n  strength: 50\n  frequency: 0.01\n}', documentation: 'Domain warping distortion' },

    // ── Biome rules (procedural sub-block) ──────────────────────────────────
    { label: 'biome', kind: 'module', detail: 'Biome rule', insertText: 'biome "Name" {\n  threshold: 0.5\n  density: 0.8\n  vegetation: "trees"\n}', documentation: 'Terrain biome classification rule' },

    // ── LOD (Level of Detail) ───────────────────────────────────────────────
    { label: 'lod', kind: 'block', detail: 'Level of detail', insertText: 'lod {\n  level 0 { mesh: "high.glb" }\n  level 50 { mesh: "mid.glb" }\n  level 200 { mesh: "low.glb" }\n}', documentation: 'Distance-based mesh LOD system' },
    { label: 'render', kind: 'block', detail: 'Render hints', insertText: 'render {\n  cast_shadows: true\n  receive_shadows: true\n  layer: "opaque"\n}', documentation: 'Render pass hints and shadow settings' },

    // ── Navigation & AI ─────────────────────────────────────────────────────
    { label: 'navmesh', kind: 'block', detail: 'Navigation mesh', insertText: 'navmesh "Name" {\n  agent_radius: 0.5\n  agent_height: 2.0\n  max_slope: 45\n  step_height: 0.3\n}', documentation: 'Navigable area mesh for AI pathfinding' },
    { label: 'nav_agent', kind: 'block', detail: 'Navigation agent', insertText: 'nav_agent "Name" {\n  speed: 3.5\n  acceleration: 8\n  stopping_distance: 0.5\n}', documentation: 'AI navigation agent parameters' },
    { label: 'behavior_tree', kind: 'block', detail: 'AI behavior tree', insertText: 'behavior_tree "Name" {\n  selector {\n    sequence {\n      condition has_target: true\n      leaf attack: "melee"\n    }\n    leaf patrol: "waypoints"\n  }\n}', documentation: 'AI decision tree with selector/sequence nodes' },
    { label: 'obstacle', kind: 'block', detail: 'Navigation obstacle', insertText: 'obstacle "Name" {\n  carve: true\n  shape: "box"\n  size: [2, 2, 2]\n}', documentation: 'Navigation mesh obstacle/carver' },
    { label: 'nav_link', kind: 'block', detail: 'Navigation link', insertText: 'nav_link "Name" {\n  start: [0, 0, 0]\n  end: [5, 2, 0]\n  bidirectional: true\n}', documentation: 'Off-mesh navigation link (jumps, ladders)' },
    { label: 'nav_modifier', kind: 'block', detail: 'Navigation modifier', insertText: 'nav_modifier "Name" {\n  area_type: "water"\n  cost: 3.0\n}', documentation: 'Navigation area cost modifier' },
    { label: 'crowd_manager', kind: 'block', detail: 'Crowd navigation', insertText: 'crowd_manager "Name" {\n  max_agents: 100\n  separation: 0.5\n}', documentation: 'Crowd simulation / local avoidance' },

    // ── Behavior tree node sub-blocks ───────────────────────────────────────
    { label: 'selector', kind: 'module', detail: 'BT selector (OR)', insertText: 'selector {\n  \n}', documentation: 'Tries children until one succeeds' },
    { label: 'sequence', kind: 'module', detail: 'BT sequence (AND)', insertText: 'sequence {\n  \n}', documentation: 'Runs children until one fails' },
    { label: 'condition', kind: 'module', detail: 'BT condition check', insertText: 'condition has_target: true', documentation: 'Boolean condition check node' },
    { label: 'leaf', kind: 'module', detail: 'BT leaf action', insertText: 'leaf patrol: "waypoints"', documentation: 'Terminal action node' },
    { label: 'parallel', kind: 'module', detail: 'BT parallel node', insertText: 'parallel {\n  \n}', documentation: 'Runs all children simultaneously' },
    { label: 'decorator', kind: 'module', detail: 'BT decorator', insertText: 'decorator {\n  \n}', documentation: 'Modifies child node behavior' },
    { label: 'inverter', kind: 'module', detail: 'BT inverter', insertText: 'inverter {\n  \n}', documentation: 'Inverts child success/failure' },
    { label: 'repeater', kind: 'module', detail: 'BT repeater', insertText: 'repeater repeat_count {\n  count: 3\n}', documentation: 'Repeats child N times' },
    { label: 'cooldown', kind: 'module', detail: 'BT cooldown', insertText: 'cooldown {\n  duration: 5.0\n}', documentation: 'Time-based execution cooldown' },
    { label: 'guard', kind: 'module', detail: 'BT guard', insertText: 'guard {\n  \n}', documentation: 'Priority-based guard condition' },

    // ── Input & Interaction ──────────────────────────────────────────────────
    { label: 'input', kind: 'block', detail: 'Input mapping', insertText: 'input "Name" {\n  move: "left_stick"\n  jump: "button_a"\n  look: "right_stick"\n}', documentation: 'Input action-to-binding mapping' },
    { label: 'interaction', kind: 'block', detail: 'Interaction profile', insertText: 'interaction "Name" {\n  type: "grab"\n  hand: "any"\n}', documentation: 'VR/XR interaction definition' },
    { label: 'gesture_profile', kind: 'block', detail: 'Gesture recognition profile', insertText: 'gesture_profile "Name" {\n  gestures: ["pinch", "wave", "point"]\n  sensitivity: 0.8\n}', documentation: 'Hand gesture recognition configuration' },
    { label: 'controller_map', kind: 'block', detail: 'Controller button mapping', insertText: 'controller_map "Name" {\n  trigger: "fire"\n  grip: "grab"\n}', documentation: 'Controller-to-action button mapping' },

    // ── Annotation syntax ───────────────────────────────────────────────────
    { label: '#[', kind: 'snippet', detail: 'Annotation', insertText: '#[debug, profile("gpu"), editor_only]', documentation: 'Metadata annotations: #[key, key(value)]' },

    // ── Domain blocks ───────────────────────────────────────────────────────
    { label: 'sensor', kind: 'block', detail: 'IoT sensor', insertText: 'sensor "Name" {\n  type: "temperature"\n  binding: "mqtt://device/temp"\n}' },
    { label: 'device', kind: 'block', detail: 'IoT device', insertText: 'device "Name" {\n  protocol: "mqtt"\n  capability: "dimming"\n}' },
    { label: 'dashboard', kind: 'block', detail: 'Data dashboard', insertText: 'dashboard "Name" {\n  layout: "grid"\n  refresh: 5000\n}' },
    { label: 'lesson', kind: 'block', detail: 'Educational lesson', insertText: 'lesson "Name" {\n  objective: ""\n}' },
    { label: 'contract', kind: 'block', detail: 'Web3 smart contract', insertText: 'contract "Name" {\n  chain: "base"\n  standard: "ERC-721"\n}' },
    { label: 'test', kind: 'block', detail: 'Test block', insertText: 'test "description" {\n  given { }\n  when { }\n  then { assert true }\n}', documentation: 'Built-in test framework block' },

    // ── Physics container ───────────────────────────────────────────────────
    { label: 'physics', kind: 'block', detail: 'Physics container block', insertText: 'physics {\n  collider sphere { radius: 0.5 }\n  rigidbody { mass: 1.0 use_gravity: true }\n}', documentation: 'Physics block with collider + rigidbody sub-blocks' },
];

// HSPlus language keyword completions
const HSPLUS_COMPLETIONS: CompletionItem[] = [
    { label: 'struct', kind: 'keyword', detail: 'Define a struct type', insertText: 'struct Name {\n  \n}' },
    { label: 'enum', kind: 'keyword', detail: 'Define an enum', insertText: 'enum Name {\n  \n}' },
    { label: 'interface', kind: 'keyword', detail: 'Define an interface', insertText: 'interface Name {\n  \n}' },
    { label: 'module', kind: 'keyword', detail: 'Define a module', insertText: 'module Name {\n  \n}' },
    { label: 'function', kind: 'keyword', detail: 'Define a function', insertText: 'function name() {\n  \n}' },
    { label: 'export', kind: 'keyword', detail: 'Export declaration', insertText: 'export ' },
    { label: 'import', kind: 'keyword', detail: 'Import module', insertText: 'import { } from ""' },
    { label: 'const', kind: 'keyword', detail: 'Constant declaration', insertText: 'const name = ' },
    { label: 'let', kind: 'keyword', detail: 'Variable declaration', insertText: 'let name = ' },
    { label: 'trait', kind: 'keyword', detail: 'Define a trait', insertText: 'trait Name {\n  \n}' },
    { label: 'action', kind: 'keyword', detail: 'Define an action', insertText: 'action name() {\n  \n}' },
];

// =============================================================================
// CONTEXT-SPECIFIC PROPERTY COMPLETIONS (v4.2 expanded)
// =============================================================================

const BLOCK_PROPERTY_MAP: Record<string, CompletionItem[]> = {
    // ── Material properties ─────────────────────────────────────────────────
    material: [
        { label: 'baseColor', kind: 'property', detail: 'Color hex', insertText: 'baseColor: "#ffffff"' },
        { label: 'roughness', kind: 'property', detail: '0.0 - 1.0', insertText: 'roughness: 0.5' },
        { label: 'metallic', kind: 'property', detail: '0.0 - 1.0', insertText: 'metallic: 0.0' },
        { label: 'emissive_color', kind: 'property', detail: 'Emission color', insertText: 'emissive_color: "#000000"' },
        { label: 'emissive_intensity', kind: 'property', detail: 'Emission strength', insertText: 'emissive_intensity: 1.0' },
        { label: 'opacity', kind: 'property', detail: '0.0 - 1.0', insertText: 'opacity: 1.0' },
        { label: 'ior', kind: 'property', detail: 'Index of refraction', insertText: 'ior: 1.5' },
        { label: 'transmission', kind: 'property', detail: '0.0 - 1.0 (glass)', insertText: 'transmission: 0.0' },
        { label: 'clearcoat', kind: 'property', detail: '0.0 - 1.0', insertText: 'clearcoat: 0.0' },
        { label: 'clearcoat_roughness', kind: 'property', detail: '0.0 - 1.0', insertText: 'clearcoat_roughness: 0.0' },
        { label: 'sheen', kind: 'property', detail: '0.0 - 1.0 (fabric)', insertText: 'sheen: 0.0' },
        { label: 'sheen_roughness', kind: 'property', detail: '0.0 - 1.0', insertText: 'sheen_roughness: 0.5' },
        { label: 'anisotropy', kind: 'property', detail: '0.0 - 1.0', insertText: 'anisotropy: 0.0' },
        { label: 'anisotropy_rotation', kind: 'property', detail: '0.0 - 1.0', insertText: 'anisotropy_rotation: 0.0' },
        { label: 'subsurface_color', kind: 'property', detail: 'SSS color', insertText: 'subsurface_color: "#ff4444"' },
        { label: 'subsurface_radius', kind: 'property', detail: 'SSS radius [R,G,B]', insertText: 'subsurface_radius: [1.0, 0.2, 0.1]' },
        { label: 'thickness', kind: 'property', detail: 'SSS thickness', insertText: 'thickness: 0.5' },
        { label: 'iridescence', kind: 'property', detail: '0.0 - 1.0', insertText: 'iridescence: 0.0' },
        { label: 'iridescence_ior', kind: 'property', detail: 'Iridescence IOR', insertText: 'iridescence_ior: 1.3' },
        { label: 'alpha_mode', kind: 'property', detail: '"opaque"|"blend"|"mask"', insertText: 'alpha_mode: "opaque"' },
        { label: 'alpha_cutoff', kind: 'property', detail: '0.0 - 1.0', insertText: 'alpha_cutoff: 0.5' },
        { label: 'normal_scale', kind: 'property', detail: 'Normal map strength', insertText: 'normal_scale: 1.0' },
    ],
    pbr_material: [
        { label: 'baseColor', kind: 'property', detail: 'Color hex', insertText: 'baseColor: "#ffffff"' },
        { label: 'roughness', kind: 'property', detail: '0.0 - 1.0', insertText: 'roughness: 0.5' },
        { label: 'metallic', kind: 'property', detail: '0.0 - 1.0', insertText: 'metallic: 0.0' },
        { label: 'emissive_color', kind: 'property', detail: 'Emission color', insertText: 'emissive_color: "#000000"' },
        { label: 'opacity', kind: 'property', detail: '0.0 - 1.0', insertText: 'opacity: 1.0' },
        { label: 'ior', kind: 'property', detail: 'Index of refraction', insertText: 'ior: 1.5' },
        { label: 'normal_scale', kind: 'property', detail: 'Normal map strength', insertText: 'normal_scale: 1.0' },
    ],
    unlit_material: [
        { label: 'emissive_color', kind: 'property', detail: 'Flat color', insertText: 'emissive_color: "#ffffff"' },
        { label: 'opacity', kind: 'property', detail: '0.0 - 1.0', insertText: 'opacity: 1.0' },
        { label: 'alpha_mode', kind: 'property', detail: '"opaque"|"blend"|"mask"', insertText: 'alpha_mode: "opaque"' },
    ],
    toon_material: [
        { label: 'baseColor', kind: 'property', detail: 'Color hex', insertText: 'baseColor: "#ffffff"' },
        { label: 'outline_width', kind: 'property', detail: 'Outline thickness', insertText: 'outline_width: 0.02' },
        { label: 'outline_color', kind: 'property', detail: 'Outline color', insertText: 'outline_color: "#000000"' },
        { label: 'shading_steps', kind: 'property', detail: 'Discrete shading bands', insertText: 'shading_steps: 3' },
        { label: 'specular_size', kind: 'property', detail: 'Specular highlight size', insertText: 'specular_size: 0.2' },
    ],
    glass_material: [
        { label: 'baseColor', kind: 'property', detail: 'Tint color', insertText: 'baseColor: "#ffffff"' },
        { label: 'opacity', kind: 'property', detail: '0.0 - 1.0', insertText: 'opacity: 0.3' },
        { label: 'ior', kind: 'property', detail: 'Index of refraction (1.0-2.5)', insertText: 'ior: 1.52' },
        { label: 'transmission', kind: 'property', detail: '0.0 - 1.0', insertText: 'transmission: 0.95' },
        { label: 'roughness', kind: 'property', detail: '0.0 - 1.0 (frosted)', insertText: 'roughness: 0.0' },
    ],
    subsurface_material: [
        { label: 'baseColor', kind: 'property', detail: 'Surface color', insertText: 'baseColor: "#ffddcc"' },
        { label: 'subsurface_color', kind: 'property', detail: 'Scatter color', insertText: 'subsurface_color: "#ff4444"' },
        { label: 'subsurface_radius', kind: 'property', detail: 'Scatter radius [R,G,B]', insertText: 'subsurface_radius: [1.0, 0.2, 0.1]' },
        { label: 'thickness', kind: 'property', detail: 'Material thickness', insertText: 'thickness: 0.5' },
        { label: 'roughness', kind: 'property', detail: '0.0 - 1.0', insertText: 'roughness: 0.4' },
    ],
    shader: [
        { label: 'vertex', kind: 'property', detail: 'Vertex shader path', insertText: 'vertex: "shaders/vert.glsl"' },
        { label: 'fragment', kind: 'property', detail: 'Fragment shader path', insertText: 'fragment: "shaders/frag.glsl"' },
        { label: 'compute', kind: 'property', detail: 'Compute shader path', insertText: 'compute: "shaders/compute.glsl"' },
        { label: 'defines', kind: 'property', detail: 'Preprocessor defines', insertText: 'defines: { "USE_NORMAL_MAP": true }' },
    ],

    // ── Texture map block properties ────────────────────────────────────────
    texture_map: [
        { label: 'source', kind: 'property', detail: 'Texture file path', insertText: 'source: "textures/texture.png"' },
        { label: 'tiling', kind: 'property', detail: 'UV tiling [x, y]', insertText: 'tiling: [1, 1]' },
        { label: 'offset', kind: 'property', detail: 'UV offset [x, y]', insertText: 'offset: [0, 0]' },
        { label: 'filtering', kind: 'property', detail: '"bilinear"|"trilinear"|"nearest"', insertText: 'filtering: "trilinear"' },
        { label: 'wrap', kind: 'property', detail: '"repeat"|"clamp"|"mirror"', insertText: 'wrap: "repeat"' },
        { label: 'strength', kind: 'property', detail: 'Map influence 0.0-1.0', insertText: 'strength: 1.0' },
        { label: 'channel', kind: 'property', detail: '"r"|"g"|"b"|"a"', insertText: 'channel: "r"' },
    ],

    // ── Shader pass properties ──────────────────────────────────────────────
    pass: [
        { label: 'vertex', kind: 'property', detail: 'Vertex shader path', insertText: 'vertex: "shaders/vert.glsl"' },
        { label: 'fragment', kind: 'property', detail: 'Fragment shader path', insertText: 'fragment: "shaders/frag.glsl"' },
        { label: 'blend_mode', kind: 'property', detail: '"opaque"|"alpha"|"additive"', insertText: 'blend_mode: "opaque"' },
        { label: 'cull', kind: 'property', detail: '"back"|"front"|"none"', insertText: 'cull: "back"' },
        { label: 'depth_test', kind: 'property', detail: 'Boolean', insertText: 'depth_test: true' },
        { label: 'depth_write', kind: 'property', detail: 'Boolean', insertText: 'depth_write: true' },
        { label: 'stencil', kind: 'property', detail: 'Stencil operations', insertText: 'stencil: { ref: 1 comp: "always" }' },
    ],

    // ── Collider properties ─────────────────────────────────────────────────
    collider: [
        { label: 'radius', kind: 'property', detail: 'Sphere/capsule radius', insertText: 'radius: 0.5' },
        { label: 'size', kind: 'property', detail: 'Box extents [x, y, z]', insertText: 'size: [1, 1, 1]' },
        { label: 'height', kind: 'property', detail: 'Capsule/cylinder height', insertText: 'height: 2.0' },
        { label: 'is_trigger', kind: 'property', detail: 'Boolean', insertText: 'is_trigger: false' },
        { label: 'center', kind: 'property', detail: 'Offset [x, y, z]', insertText: 'center: [0, 0, 0]' },
        { label: 'mesh', kind: 'property', detail: 'Mesh collider source', insertText: 'mesh: "collision.glb"' },
        { label: 'convex', kind: 'property', detail: 'Force convex hull', insertText: 'convex: true' },
        { label: 'friction', kind: 'property', detail: 'Surface friction', insertText: 'friction: 0.5' },
        { label: 'bounciness', kind: 'property', detail: 'Restitution 0.0-1.0', insertText: 'bounciness: 0.3' },
        { label: 'layer', kind: 'property', detail: 'Collision layer', insertText: 'layer: "default"' },
    ],

    // ── Rigidbody properties ────────────────────────────────────────────────
    rigidbody: [
        { label: 'mass', kind: 'property', detail: 'Mass in kg', insertText: 'mass: 1.0' },
        { label: 'use_gravity', kind: 'property', detail: 'Boolean', insertText: 'use_gravity: true' },
        { label: 'linear_damping', kind: 'property', detail: '0.0 - 1.0', insertText: 'linear_damping: 0.0' },
        { label: 'angular_damping', kind: 'property', detail: '0.0 - 1.0', insertText: 'angular_damping: 0.05' },
        { label: 'is_kinematic', kind: 'property', detail: 'Boolean', insertText: 'is_kinematic: false' },
        { label: 'freeze_position', kind: 'property', detail: 'Frozen axes [x, y, z]', insertText: 'freeze_position: [false, false, false]' },
        { label: 'freeze_rotation', kind: 'property', detail: 'Frozen axes [x, y, z]', insertText: 'freeze_rotation: [false, false, false]' },
        { label: 'center_of_mass', kind: 'property', detail: 'Override CoM [x, y, z]', insertText: 'center_of_mass: [0, 0, 0]' },
        { label: 'collision_detection', kind: 'property', detail: '"discrete"|"continuous"', insertText: 'collision_detection: "discrete"' },
        { label: 'interpolation', kind: 'property', detail: '"none"|"interpolate"|"extrapolate"', insertText: 'interpolation: "interpolate"' },
    ],

    // ── Force field properties ──────────────────────────────────────────────
    force_field: [
        { label: 'strength', kind: 'property', detail: 'Force magnitude', insertText: 'strength: 5.0' },
        { label: 'direction', kind: 'property', detail: 'Force direction [x, y, z]', insertText: 'direction: [0, 1, 0]' },
        { label: 'falloff', kind: 'property', detail: '"none"|"linear"|"inverse_square"', insertText: 'falloff: "linear"' },
        { label: 'radius', kind: 'property', detail: 'Effect radius', insertText: 'radius: 10.0' },
        { label: 'shape', kind: 'property', detail: '"sphere"|"box"|"infinite"', insertText: 'shape: "sphere"' },
    ],
    gravity_zone: [
        { label: 'gravity', kind: 'property', detail: 'Gravity vector [x, y, z]', insertText: 'gravity: [0, -9.81, 0]' },
        { label: 'shape', kind: 'property', detail: '"box"|"sphere"', insertText: 'shape: "box"' },
        { label: 'bounds', kind: 'property', detail: 'Zone size [x, y, z]', insertText: 'bounds: [10, 10, 10]' },
        { label: 'priority', kind: 'property', detail: 'Override priority', insertText: 'priority: 0' },
    ],
    wind_zone: [
        { label: 'direction', kind: 'property', detail: 'Wind direction [x, y, z]', insertText: 'direction: [1, 0, 0]' },
        { label: 'strength', kind: 'property', detail: 'Wind speed', insertText: 'strength: 3.0' },
        { label: 'turbulence', kind: 'property', detail: 'Turbulence 0.0-1.0', insertText: 'turbulence: 0.5' },
        { label: 'pulse_magnitude', kind: 'property', detail: 'Gust strength', insertText: 'pulse_magnitude: 0.3' },
        { label: 'pulse_frequency', kind: 'property', detail: 'Gust frequency Hz', insertText: 'pulse_frequency: 0.5' },
    ],
    buoyancy_zone: [
        { label: 'density', kind: 'property', detail: 'Fluid density (kg/m3)', insertText: 'density: 1000' },
        { label: 'surface_height', kind: 'property', detail: 'Water surface Y', insertText: 'surface_height: 0.0' },
        { label: 'drag', kind: 'property', detail: 'Fluid drag', insertText: 'drag: 0.3' },
        { label: 'angular_drag', kind: 'property', detail: 'Rotational drag', insertText: 'angular_drag: 0.1' },
        { label: 'flow_direction', kind: 'property', detail: 'Current [x, y, z]', insertText: 'flow_direction: [0, 0, 0]' },
    ],
    magnetic_field: [
        { label: 'strength', kind: 'property', detail: 'Field strength', insertText: 'strength: 10.0' },
        { label: 'pole', kind: 'property', detail: 'Pole direction [x, y, z]', insertText: 'pole: [0, 1, 0]' },
        { label: 'radius', kind: 'property', detail: 'Effect radius', insertText: 'radius: 5.0' },
        { label: 'attract_tags', kind: 'property', detail: 'Attracted object tags', insertText: 'attract_tags: ["metal"]' },
    ],
    drag_zone: [
        { label: 'linear_drag', kind: 'property', detail: 'Linear resistance', insertText: 'linear_drag: 0.5' },
        { label: 'angular_drag', kind: 'property', detail: 'Rotational resistance', insertText: 'angular_drag: 0.3' },
        { label: 'shape', kind: 'property', detail: '"box"|"sphere"', insertText: 'shape: "box"' },
        { label: 'bounds', kind: 'property', detail: 'Zone size [x, y, z]', insertText: 'bounds: [5, 5, 5]' },
    ],

    // ── Articulation properties ──────────────────────────────────────────────
    articulation: [
        { label: 'type', kind: 'property', detail: 'Joint type', insertText: 'type: "revolute"' },
        { label: 'immovable_base', kind: 'property', detail: 'Fixed root', insertText: 'immovable_base: true' },
        { label: 'solver_iterations', kind: 'property', detail: 'Physics solver steps', insertText: 'solver_iterations: 10' },
        { label: 'collision_enabled', kind: 'property', detail: 'Inter-link collision', insertText: 'collision_enabled: false' },
    ],
    joint: [
        { label: 'type', kind: 'property', detail: '"revolute"|"prismatic"|"fixed"|"spherical"', insertText: 'type: "revolute"' },
        { label: 'axis', kind: 'property', detail: 'Rotation axis [x, y, z]', insertText: 'axis: [0, 1, 0]' },
        { label: 'limits', kind: 'property', detail: '[min, max] degrees', insertText: 'limits: [-90, 90]' },
        { label: 'damping', kind: 'property', detail: 'Joint damping', insertText: 'damping: 0.1' },
        { label: 'stiffness', kind: 'property', detail: 'Joint stiffness', insertText: 'stiffness: 0.0' },
        { label: 'motor_speed', kind: 'property', detail: 'Motor target speed', insertText: 'motor_speed: 0' },
        { label: 'max_force', kind: 'property', detail: 'Motor max force', insertText: 'max_force: 100' },
        { label: 'connected_body', kind: 'property', detail: 'Connected rigidbody', insertText: 'connected_body: "BodyB"' },
        { label: 'anchor', kind: 'property', detail: 'Joint anchor [x, y, z]', insertText: 'anchor: [0, 0, 0]' },
        { label: 'break_force', kind: 'property', detail: 'Force to break joint', insertText: 'break_force: 1000' },
    ],
    hinge: [
        { label: 'axis', kind: 'property', detail: 'Rotation axis', insertText: 'axis: [0, 1, 0]' },
        { label: 'limits', kind: 'property', detail: '[min, max] degrees', insertText: 'limits: [-90, 90]' },
        { label: 'motor_speed', kind: 'property', detail: 'Motor speed', insertText: 'motor_speed: 0' },
        { label: 'max_force', kind: 'property', detail: 'Motor max force', insertText: 'max_force: 100' },
        { label: 'damping', kind: 'property', detail: 'Joint damping', insertText: 'damping: 0.1' },
    ],
    slider: [
        { label: 'axis', kind: 'property', detail: 'Slide axis', insertText: 'axis: [1, 0, 0]' },
        { label: 'limits', kind: 'property', detail: '[min, max] meters', insertText: 'limits: [0, 2]' },
        { label: 'damping', kind: 'property', detail: 'Slide damping', insertText: 'damping: 0.1' },
    ],
    ball_socket: [
        { label: 'swing_limit', kind: 'property', detail: 'Swing cone degrees', insertText: 'swing_limit: 45' },
        { label: 'twist_limit', kind: 'property', detail: 'Twist degrees', insertText: 'twist_limit: 30' },
        { label: 'damping', kind: 'property', detail: 'Joint damping', insertText: 'damping: 0.1' },
    ],
    fixed_joint: [
        { label: 'break_force', kind: 'property', detail: 'Force to break', insertText: 'break_force: 1000' },
        { label: 'break_torque', kind: 'property', detail: 'Torque to break', insertText: 'break_torque: 1000' },
    ],
    d6_joint: [
        { label: 'x_motion', kind: 'property', detail: '"locked"|"limited"|"free"', insertText: 'x_motion: "locked"' },
        { label: 'y_motion', kind: 'property', detail: '"locked"|"limited"|"free"', insertText: 'y_motion: "limited"' },
        { label: 'z_motion', kind: 'property', detail: '"locked"|"limited"|"free"', insertText: 'z_motion: "free"' },
        { label: 'swing1_limit', kind: 'property', detail: 'Swing1 degrees', insertText: 'swing1_limit: 45' },
        { label: 'swing2_limit', kind: 'property', detail: 'Swing2 degrees', insertText: 'swing2_limit: 45' },
        { label: 'twist_limit', kind: 'property', detail: 'Twist degrees', insertText: 'twist_limit: 30' },
        { label: 'linear_limit', kind: 'property', detail: 'Linear distance', insertText: 'linear_limit: 1.0' },
    ],
    spring_joint: [
        { label: 'stiffness', kind: 'property', detail: 'Spring stiffness', insertText: 'stiffness: 100' },
        { label: 'damping', kind: 'property', detail: 'Damping coefficient', insertText: 'damping: 5' },
        { label: 'rest_length', kind: 'property', detail: 'Rest length', insertText: 'rest_length: 1.0' },
        { label: 'break_force', kind: 'property', detail: 'Force to break', insertText: 'break_force: 1000' },
    ],
    prismatic: [
        { label: 'axis', kind: 'property', detail: 'Translation axis', insertText: 'axis: [0, 1, 0]' },
        { label: 'limits', kind: 'property', detail: '[min, max] meters', insertText: 'limits: [0, 5]' },
        { label: 'damping', kind: 'property', detail: 'Slide damping', insertText: 'damping: 0.1' },
    ],

    // ── Particle system properties ──────────────────────────────────────────
    particles: [
        { label: 'max_particles', kind: 'property', detail: 'Max count', insertText: 'max_particles: 500' },
        { label: 'duration', kind: 'property', detail: 'Seconds (-1 = infinite)', insertText: 'duration: -1' },
        { label: 'world_space', kind: 'property', detail: 'Boolean', insertText: 'world_space: true' },
        { label: 'start_speed', kind: 'property', detail: 'Initial speed', insertText: 'start_speed: 5.0' },
        { label: 'start_size', kind: 'property', detail: 'Initial size', insertText: 'start_size: 0.1' },
        { label: 'start_color', kind: 'property', detail: 'Initial color', insertText: 'start_color: "#ffffff"' },
        { label: 'start_lifetime', kind: 'property', detail: 'Lifetime seconds', insertText: 'start_lifetime: 2.0' },
        { label: 'gravity_modifier', kind: 'property', detail: 'Gravity scale', insertText: 'gravity_modifier: 1.0' },
        { label: 'simulation_speed', kind: 'property', detail: 'Playback speed', insertText: 'simulation_speed: 1.0' },
        { label: 'prewarm', kind: 'property', detail: 'Pre-simulate', insertText: 'prewarm: false' },
    ],
    emitter: [
        { label: 'rate', kind: 'property', detail: 'Emission rate/sec', insertText: 'rate: 100' },
        { label: 'shape', kind: 'property', detail: '"cone"|"sphere"|"box"|"edge"', insertText: 'shape: "cone"' },
        { label: 'angle', kind: 'property', detail: 'Cone angle degrees', insertText: 'angle: 30' },
        { label: 'radius', kind: 'property', detail: 'Emission radius', insertText: 'radius: 0.5' },
    ],

    // ── Audio source properties ─────────────────────────────────────────────
    audio_source: [
        { label: 'clip', kind: 'property', detail: 'Audio file path', insertText: 'clip: ""' },
        { label: 'volume', kind: 'property', detail: '0.0 - 1.0', insertText: 'volume: 0.8' },
        { label: 'pitch', kind: 'property', detail: '0.5 - 2.0', insertText: 'pitch: 1.0' },
        { label: 'loop', kind: 'property', detail: 'Boolean', insertText: 'loop: true' },
        { label: 'play_on_awake', kind: 'property', detail: 'Auto-play', insertText: 'play_on_awake: true' },
        { label: 'spatialization', kind: 'property', detail: '"hrtf"|"stereo"|"off"', insertText: 'spatialization: "hrtf"' },
        { label: 'min_distance', kind: 'property', detail: 'Min distance', insertText: 'min_distance: 1' },
        { label: 'max_distance', kind: 'property', detail: 'Max distance', insertText: 'max_distance: 50' },
        { label: 'rolloff', kind: 'property', detail: '"logarithmic"|"linear"|"custom"', insertText: 'rolloff: "logarithmic"' },
        { label: 'doppler_level', kind: 'property', detail: '0.0 - 5.0', insertText: 'doppler_level: 1.0' },
        { label: 'spread', kind: 'property', detail: 'Stereo spread 0-360', insertText: 'spread: 0' },
        { label: 'priority', kind: 'property', detail: '0 (highest) - 256', insertText: 'priority: 128' },
    ],
    audio_listener: [
        { label: 'active', kind: 'property', detail: 'Boolean', insertText: 'active: true' },
    ],
    reverb_zone: [
        { label: 'decay_time', kind: 'property', detail: 'Reverb decay seconds', insertText: 'decay_time: 2.0' },
        { label: 'room_size', kind: 'property', detail: '0.0 - 1.0', insertText: 'room_size: 0.8' },
        { label: 'pre_delay', kind: 'property', detail: 'Pre-delay ms', insertText: 'pre_delay: 20' },
        { label: 'diffusion', kind: 'property', detail: '0.0 - 1.0', insertText: 'diffusion: 0.8' },
        { label: 'high_freq_damping', kind: 'property', detail: '0.0 - 1.0', insertText: 'high_freq_damping: 0.5' },
        { label: 'min_distance', kind: 'property', detail: 'Inner radius', insertText: 'min_distance: 5' },
        { label: 'max_distance', kind: 'property', detail: 'Outer radius', insertText: 'max_distance: 20' },
    ],
    audio_mixer: [
        { label: 'volume', kind: 'property', detail: '0.0 - 1.0', insertText: 'volume: 1.0' },
        { label: 'mute', kind: 'property', detail: 'Boolean', insertText: 'mute: false' },
        { label: 'solo', kind: 'property', detail: 'Boolean', insertText: 'solo: false' },
    ],
    ambience: [
        { label: 'clip', kind: 'property', detail: 'Audio file', insertText: 'clip: "ambient.ogg"' },
        { label: 'volume', kind: 'property', detail: '0.0 - 1.0', insertText: 'volume: 0.3' },
        { label: 'loop', kind: 'property', detail: 'Boolean', insertText: 'loop: true' },
        { label: 'crossfade', kind: 'property', detail: 'Crossfade seconds', insertText: 'crossfade: 2.0' },
    ],

    // ── Weather properties ──────────────────────────────────────────────────
    weather: [
        { label: 'intensity', kind: 'property', detail: 'Overall weather intensity', insertText: 'intensity: 0.5' },
        { label: 'transition_time', kind: 'property', detail: 'Blend time seconds', insertText: 'transition_time: 5.0' },
    ],

    // ── Procedural properties ───────────────────────────────────────────────
    procedural: [
        { label: 'seed', kind: 'property', detail: 'Random seed', insertText: 'seed: 42' },
        { label: 'resolution', kind: 'property', detail: 'Grid resolution', insertText: 'resolution: 256' },
        { label: 'size', kind: 'property', detail: 'World size [x, z]', insertText: 'size: [1000, 1000]' },
    ],
    scatter: [
        { label: 'count', kind: 'property', detail: 'Instance count', insertText: 'count: 1000' },
        { label: 'radius', kind: 'property', detail: 'Scatter radius', insertText: 'radius: 50' },
        { label: 'seed', kind: 'property', detail: 'Random seed', insertText: 'seed: 42' },
        { label: 'pattern', kind: 'property', detail: '"random"|"poisson"|"grid"', insertText: 'pattern: "poisson"' },
        { label: 'min_distance', kind: 'property', detail: 'Min between items', insertText: 'min_distance: 1.0' },
        { label: 'align_to_surface', kind: 'property', detail: 'Boolean', insertText: 'align_to_surface: true' },
    ],

    // ── LOD properties ──────────────────────────────────────────────────────
    lod: [
        { label: 'fade_mode', kind: 'property', detail: '"cross_fade"|"speed_tree"|"none"', insertText: 'fade_mode: "cross_fade"' },
        { label: 'fade_width', kind: 'property', detail: 'Cross-fade distance', insertText: 'fade_width: 5.0' },
    ],
    render: [
        { label: 'cast_shadows', kind: 'property', detail: 'Boolean', insertText: 'cast_shadows: true' },
        { label: 'receive_shadows', kind: 'property', detail: 'Boolean', insertText: 'receive_shadows: true' },
        { label: 'layer', kind: 'property', detail: '"opaque"|"transparent"|"overlay"', insertText: 'layer: "opaque"' },
        { label: 'render_queue', kind: 'property', detail: 'Render order integer', insertText: 'render_queue: 2000' },
        { label: 'lightmap', kind: 'property', detail: 'Lightmap mode', insertText: 'lightmap: "baked"' },
    ],

    // ── Navigation properties ───────────────────────────────────────────────
    navmesh: [
        { label: 'agent_radius', kind: 'property', detail: 'Agent radius', insertText: 'agent_radius: 0.5' },
        { label: 'agent_height', kind: 'property', detail: 'Agent height', insertText: 'agent_height: 2.0' },
        { label: 'max_slope', kind: 'property', detail: 'Max walkable slope degrees', insertText: 'max_slope: 45' },
        { label: 'step_height', kind: 'property', detail: 'Max step height', insertText: 'step_height: 0.3' },
        { label: 'cell_size', kind: 'property', detail: 'Voxel cell size', insertText: 'cell_size: 0.3' },
        { label: 'cell_height', kind: 'property', detail: 'Voxel cell height', insertText: 'cell_height: 0.2' },
    ],
    nav_agent: [
        { label: 'speed', kind: 'property', detail: 'Movement speed', insertText: 'speed: 3.5' },
        { label: 'acceleration', kind: 'property', detail: 'Acceleration rate', insertText: 'acceleration: 8' },
        { label: 'stopping_distance', kind: 'property', detail: 'Stop threshold', insertText: 'stopping_distance: 0.5' },
        { label: 'auto_braking', kind: 'property', detail: 'Boolean', insertText: 'auto_braking: true' },
        { label: 'avoidance_priority', kind: 'property', detail: '0-99 (lower=higher)', insertText: 'avoidance_priority: 50' },
    ],
    behavior_tree: [
        { label: 'tick_rate', kind: 'property', detail: 'Update rate Hz', insertText: 'tick_rate: 10' },
        { label: 'restart_on_complete', kind: 'property', detail: 'Boolean', insertText: 'restart_on_complete: true' },
    ],
    obstacle: [
        { label: 'carve', kind: 'property', detail: 'Carve navmesh', insertText: 'carve: true' },
        { label: 'shape', kind: 'property', detail: '"box"|"capsule"', insertText: 'shape: "box"' },
        { label: 'size', kind: 'property', detail: 'Obstacle size', insertText: 'size: [2, 2, 2]' },
        { label: 'move_threshold', kind: 'property', detail: 'Re-carve threshold', insertText: 'move_threshold: 0.1' },
    ],
    nav_link: [
        { label: 'start', kind: 'property', detail: 'Start position', insertText: 'start: [0, 0, 0]' },
        { label: 'end', kind: 'property', detail: 'End position', insertText: 'end: [5, 2, 0]' },
        { label: 'bidirectional', kind: 'property', detail: 'Boolean', insertText: 'bidirectional: true' },
        { label: 'cost_modifier', kind: 'property', detail: 'Traversal cost', insertText: 'cost_modifier: 1.0' },
    ],
    crowd_manager: [
        { label: 'max_agents', kind: 'property', detail: 'Max concurrent agents', insertText: 'max_agents: 100' },
        { label: 'separation', kind: 'property', detail: 'Agent separation distance', insertText: 'separation: 0.5' },
        { label: 'obstacle_avoidance', kind: 'property', detail: '"low"|"medium"|"high"', insertText: 'obstacle_avoidance: "medium"' },
    ],

    // ── Input properties ────────────────────────────────────────────────────
    input: [
        { label: 'move', kind: 'property', detail: 'Movement binding', insertText: 'move: "left_stick"' },
        { label: 'jump', kind: 'property', detail: 'Jump binding', insertText: 'jump: "button_a"' },
        { label: 'look', kind: 'property', detail: 'Camera look binding', insertText: 'look: "right_stick"' },
        { label: 'interact', kind: 'property', detail: 'Interact binding', insertText: 'interact: "button_x"' },
        { label: 'fire', kind: 'property', detail: 'Fire/action binding', insertText: 'fire: "trigger_right"' },
        { label: 'grab', kind: 'property', detail: 'Grab binding', insertText: 'grab: "grip_right"' },
        { label: 'menu', kind: 'property', detail: 'Menu binding', insertText: 'menu: "button_menu"' },
        { label: 'deadzone', kind: 'property', detail: 'Stick deadzone 0.0-1.0', insertText: 'deadzone: 0.15' },
        { label: 'sensitivity', kind: 'property', detail: 'Input sensitivity', insertText: 'sensitivity: 1.0' },
    ],
    interaction: [
        { label: 'type', kind: 'property', detail: '"grab"|"poke"|"ray"|"gaze"', insertText: 'type: "grab"' },
        { label: 'hand', kind: 'property', detail: '"left"|"right"|"any"', insertText: 'hand: "any"' },
        { label: 'range', kind: 'property', detail: 'Interaction range', insertText: 'range: 2.0' },
        { label: 'haptic_feedback', kind: 'property', detail: 'Boolean', insertText: 'haptic_feedback: true' },
    ],
    gesture_profile: [
        { label: 'gestures', kind: 'property', detail: 'Recognized gestures', insertText: 'gestures: ["pinch", "wave", "point"]' },
        { label: 'sensitivity', kind: 'property', detail: '0.0 - 1.0', insertText: 'sensitivity: 0.8' },
        { label: 'hand_tracking', kind: 'property', detail: 'Boolean', insertText: 'hand_tracking: true' },
    ],
    controller_map: [
        { label: 'trigger', kind: 'property', detail: 'Trigger action', insertText: 'trigger: "fire"' },
        { label: 'grip', kind: 'property', detail: 'Grip action', insertText: 'grip: "grab"' },
        { label: 'thumbstick', kind: 'property', detail: 'Thumbstick action', insertText: 'thumbstick: "move"' },
        { label: 'button_a', kind: 'property', detail: 'A button action', insertText: 'button_a: "jump"' },
        { label: 'button_b', kind: 'property', detail: 'B button action', insertText: 'button_b: "crouch"' },
    ],

    // ── Post-processing properties ──────────────────────────────────────────
    post_processing: [
        { label: 'enabled', kind: 'property', detail: 'Boolean', insertText: 'enabled: true' },
        { label: 'priority', kind: 'property', detail: 'Stack priority', insertText: 'priority: 0' },
    ],

    // ── Test block properties ───────────────────────────────────────────────
    test: [
        { label: 'timeout', kind: 'property', detail: 'Timeout ms', insertText: 'timeout: 5000' },
        { label: 'skip', kind: 'property', detail: 'Boolean', insertText: 'skip: false' },
    ],
};

// =============================================================================
// BLOCK-CONTEXT SUB-BLOCK SUGGESTIONS
// When inside a parent block, these sub-blocks are contextually relevant
// =============================================================================

const BLOCK_SUBBLOCK_MAP: Record<string, CompletionItem[]> = {
    // Inside material blocks, suggest texture map sub-blocks and shader passes
    material: BLOCK_COMPLETIONS.filter(c =>
        c.label.endsWith('_map') || c.label === 'pass'),
    pbr_material: BLOCK_COMPLETIONS.filter(c =>
        c.label.endsWith('_map') || c.label === 'pass'),
    unlit_material: BLOCK_COMPLETIONS.filter(c =>
        c.label === 'emission_map' || c.label === 'opacity_map'),
    shader: BLOCK_COMPLETIONS.filter(c => c.label === 'pass'),
    toon_material: BLOCK_COMPLETIONS.filter(c =>
        c.label.endsWith('_map') || c.label === 'pass'),
    glass_material: BLOCK_COMPLETIONS.filter(c =>
        c.label.endsWith('_map') || c.label === 'pass'),
    subsurface_material: BLOCK_COMPLETIONS.filter(c =>
        c.label.endsWith('_map') || c.label === 'pass'),

    // Inside post_processing, suggest effect sub-blocks
    post_processing: BLOCK_COMPLETIONS.filter(c =>
        ['bloom', 'ambient_occlusion', 'ssao', 'color_grading', 'tone_mapping',
         'depth_of_field', 'motion_blur', 'vignette', 'chromatic_aberration',
         'fog', 'volumetric_fog', 'screen_space_reflections', 'ssr',
         'anti_aliasing', 'fxaa', 'smaa', 'taa', 'film_grain',
         'lens_flare', 'god_rays', 'outline', 'pixelate'].includes(c.label)),
    post_fx: BLOCK_COMPLETIONS.filter(c =>
        ['bloom', 'ambient_occlusion', 'ssao', 'color_grading', 'tone_mapping',
         'depth_of_field', 'motion_blur', 'vignette', 'chromatic_aberration',
         'fog', 'volumetric_fog', 'screen_space_reflections', 'ssr',
         'anti_aliasing', 'fxaa', 'smaa', 'taa', 'film_grain',
         'lens_flare', 'god_rays', 'outline', 'pixelate'].includes(c.label)),

    // Inside particle blocks, suggest particle module sub-blocks
    particles: BLOCK_COMPLETIONS.filter(c =>
        ['emission', 'lifetime', 'velocity', 'force', 'color_over_life',
         'size_over_life', 'noise', 'collision', 'sub_emitter',
         'shape', 'renderer', 'rotation_over_life', 'trails',
         'texture_sheet', 'inherit_velocity'].includes(c.label)),
    particle_system: BLOCK_COMPLETIONS.filter(c =>
        ['emission', 'lifetime', 'velocity', 'force', 'color_over_life',
         'size_over_life', 'noise', 'collision', 'sub_emitter',
         'shape', 'renderer', 'rotation_over_life', 'trails',
         'texture_sheet', 'inherit_velocity'].includes(c.label)),

    // Inside weather blocks, suggest weather layer sub-blocks
    weather: BLOCK_COMPLETIONS.filter(c =>
        ['rain', 'snow', 'wind', 'lightning', 'clouds', 'hail',
         'time_of_day', 'sun', 'moon', 'fog_layer', 'aurora', 'dust_storm'].includes(c.label)),
    climate: BLOCK_COMPLETIONS.filter(c =>
        ['rain', 'snow', 'wind', 'lightning', 'clouds', 'hail',
         'time_of_day', 'sun', 'moon', 'fog_layer', 'aurora', 'dust_storm'].includes(c.label)),

    // Inside procedural blocks, suggest noise functions and biome rules
    procedural: BLOCK_COMPLETIONS.filter(c =>
        ['perlin', 'simplex', 'voronoi', 'worley', 'fbm', 'ridged',
         'cellular', 'white_noise', 'curl', 'domain_warp', 'biome'].includes(c.label)),

    // Inside navigation blocks, suggest behavior tree nodes
    behavior_tree: BLOCK_COMPLETIONS.filter(c =>
        ['selector', 'sequence', 'condition', 'leaf', 'parallel',
         'decorator', 'inverter', 'repeater', 'cooldown', 'guard'].includes(c.label)),

    // Inside articulation blocks, suggest joint sub-blocks
    articulation: BLOCK_COMPLETIONS.filter(c =>
        ['joint', 'hinge', 'slider', 'ball_socket', 'fixed_joint',
         'd6_joint', 'spring_joint', 'prismatic'].includes(c.label)),

    // Inside physics container, suggest physics sub-blocks
    physics: BLOCK_COMPLETIONS.filter(c =>
        ['collider', 'trigger', 'rigidbody', 'force_field'].includes(c.label)),

    // Inside lod block, suggest level sub-blocks
    lod: [{ label: 'level', kind: 'module' as const, detail: 'LOD level at distance', insertText: 'level 0 {\n  mesh: "model.glb"\n}' }],
};

export class CompletionProvider {
    private customTraits: CompletionItem[] = [];

    /** Register a custom trait completion. */
    registerTrait(item: CompletionItem): void {
        this.customTraits.push(item);
    }

    /** Get context-specific property completions for a block type. */
    getBlockPropertyCompletions(blockType: string): CompletionItem[] {
        return BLOCK_PROPERTY_MAP[blockType] || [];
    }

    /** Get context-specific sub-block completions for a parent block type. */
    getBlockSubBlockCompletions(blockType: string): CompletionItem[] {
        return BLOCK_SUBBLOCK_MAP[blockType] || [];
    }

    /** Get completions at a cursor context. */
    getCompletions(context: { prefix: string; triggerChar?: string; blockContext?: string }): CompletionItem[] {
        const prefix = context.prefix.toLowerCase();

        // @ trigger → show traits and directives
        if (context.triggerChar === '@' || prefix.startsWith('@')) {
            const search = prefix.replace('@', '');
            return [...TRAIT_COMPLETIONS, ...DIRECTIVE_COMPLETIONS, ...this.customTraits]
                .filter(c => c.label.toLowerCase().startsWith(search));
        }

        // #[ trigger → show annotation completions
        if (context.triggerChar === '#' || prefix.startsWith('#[')) {
            return [
                { label: 'debug', kind: 'snippet', detail: 'Debug annotation', insertText: 'debug' },
                { label: 'profile', kind: 'snippet', detail: 'Profile annotation', insertText: 'profile("gpu")' },
                { label: 'editor_only', kind: 'snippet', detail: 'Editor-only annotation', insertText: 'editor_only' },
                { label: 'deprecated', kind: 'snippet', detail: 'Deprecation annotation', insertText: 'deprecated("reason")' },
                { label: 'serialize', kind: 'snippet', detail: 'Serialization hint', insertText: 'serialize' },
                { label: 'inspect', kind: 'snippet', detail: 'Inspector visibility', insertText: 'inspect' },
                { label: 'range', kind: 'snippet', detail: 'Value range constraint', insertText: 'range(0, 1)' },
                { label: 'tooltip', kind: 'snippet', detail: 'Tooltip text', insertText: 'tooltip("description")' },
            ];
        }

        // Inside a specific block → show context-specific properties AND sub-blocks
        if (context.blockContext) {
            const blockProps = this.getBlockPropertyCompletions(context.blockContext);
            const subBlocks = this.getBlockSubBlockCompletions(context.blockContext);
            if (blockProps.length > 0 || subBlocks.length > 0) {
                return [...blockProps, ...subBlocks, ...PROPERTY_COMPLETIONS]
                    .filter(c => !prefix || c.label.toLowerCase().startsWith(prefix));
            }
        }

        // No prefix → show block types and node types
        if (!prefix) {
            return [...BLOCK_COMPLETIONS, ...TYPE_COMPLETIONS, ...HSPLUS_COMPLETIONS];
        }

        // Property-like context
        if (prefix.includes(':') || prefix.includes('.')) {
            return PROPERTY_COMPLETIONS.filter(c =>
                c.label.toLowerCase().includes(prefix.split(/[:.]/g).pop() || ''),
            );
        }

        // General search across all completion types
        const all = [
            ...BLOCK_COMPLETIONS, ...TYPE_COMPLETIONS, ...PROPERTY_COMPLETIONS,
            ...TRAIT_COMPLETIONS, ...DIRECTIVE_COMPLETIONS, ...HSPLUS_COMPLETIONS,
            ...this.customTraits,
        ];
        return all.filter(c => c.label.toLowerCase().includes(prefix));
    }

    /** Get total available completions. */
    get totalCompletions(): number {
        return TRAIT_COMPLETIONS.length + DIRECTIVE_COMPLETIONS.length +
               TYPE_COMPLETIONS.length + PROPERTY_COMPLETIONS.length +
               BLOCK_COMPLETIONS.length + HSPLUS_COMPLETIONS.length +
               this.customTraits.length;
    }
}
