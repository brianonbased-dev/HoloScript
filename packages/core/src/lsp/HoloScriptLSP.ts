/**
 * HoloScript Language Server Protocol (LSP) Service
 *
 * Provides IDE-integration features by wrapping the HoloCompositionParser:
 *
 *   - Diagnostics:     Real-time parse errors with line/column
 *   - Completions:     Keywords, material presets, environment presets, trait names
 *   - Hover:           Info for keywords, presets, traits, bind() expressions
 *   - Go-to-definition: Template references ("using" clauses)
 *   - Document symbols: Outline of composition structure
 *   - Semantic tokens:  Token classification for syntax highlighting
 *
 * This module does NOT implement the LSP transport (JSON-RPC); it provides
 * the pure-logic layer that any transport adapter (VS Code extension, Neovim,
 * Sublime, etc.) can call directly.
 *
 * @version 1.0.0
 */

import { HoloCompositionParser } from '../parser/HoloCompositionParser';
import type {
  HoloParseResult,
  HoloComposition,
  SourceLocation,
} from '../parser/HoloCompositionTypes';
import { MATERIAL_PRESETS, ENVIRONMENT_PRESETS } from '../compiler/R3FCompiler';
import { CompletionProvider } from './CompletionProvider';
import type { CompletionItem } from './CompletionProvider';
import { DiagnosticProvider } from './DiagnosticProvider';
import type { DiagnosticContext } from './DiagnosticProvider';
import { ImportResolver } from './ImportResolver';

// =============================================================================
// TYPES
// =============================================================================

export interface LSPDiagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  range: LSPRange;
  code?: string;
  source: string;
}

export interface LSPRange {
  start: LSPPosition;
  end: LSPPosition;
}

export interface LSPPosition {
  line: number; // 0-based
  character: number; // 0-based
}

export interface LSPCompletionItem {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
}

export type CompletionItemKind =
  | 'keyword'
  | 'property'
  | 'value'
  | 'snippet'
  | 'function'
  | 'class'
  | 'module'
  | 'enum'
  | 'decorator'
  | 'variable';

export interface LSPHoverResult {
  contents: string; // Markdown
  range?: LSPRange;
}

export interface LSPDefinitionResult {
  uri: string;
  range: LSPRange;
}

export interface LSPDocumentSymbol {
  name: string;
  kind: SymbolKind;
  range: LSPRange;
  selectionRange: LSPRange;
  children?: LSPDocumentSymbol[];
}

export type SymbolKind =
  | 'file'
  | 'module'
  | 'class'
  | 'method'
  | 'property'
  | 'field'
  | 'constructor'
  | 'enum'
  | 'function'
  | 'variable'
  | 'constant'
  | 'string'
  | 'object'
  | 'key'
  | 'event';

export interface LSPSemanticToken {
  line: number;
  startChar: number;
  length: number;
  tokenType: SemanticTokenType;
  tokenModifiers: SemanticTokenModifier[];
}

export type SemanticTokenType =
  | 'keyword'
  | 'type'
  | 'string'
  | 'number'
  | 'property'
  | 'variable'
  | 'function'
  | 'comment'
  | 'operator'
  | 'decorator';

export type SemanticTokenModifier =
  | 'declaration'
  | 'definition'
  | 'readonly'
  | 'static'
  | 'deprecated'
  | 'modification';

// =============================================================================
// KEYWORD & PRESET METADATA
// =============================================================================

const HOLO_KEYWORDS: Record<string, { detail: string; documentation: string }> = {
  composition: {
    detail: 'Root scene block',
    documentation:
      'Declares a HoloScript composition — the root container for an entire scene.\n\n```holo\ncomposition "My Scene" {\n  // environment, objects, lights, etc.\n}\n```',
  },
  environment: {
    detail: 'Scene environment settings',
    documentation:
      'Configures environment presets, fog, ambient light, skybox, and atmosphere.\n\n```holo\nenvironment {\n  preset: "forest_sunset"\n  fog: { color: "#cccccc", near: 10, far: 100 }\n  ambient_light: 0.5\n}\n```',
  },
  state: {
    detail: 'Reactive state block',
    documentation:
      'Declares reactive state variables that can be bound to UI/objects via `bind(state.xxx)`.\n\n```holo\nstate {\n  score: 0\n  health: 100\n}\n```',
  },
  template: {
    detail: 'Reusable object template',
    documentation:
      'Defines a template with traits, state, and actions that objects can inherit via `using`.\n\n```holo\ntemplate "Enemy" {\n  @collidable\n  @physics(mass: 2.0)\n  state { health: 100 }\n}\n```',
  },
  object: {
    detail: 'Scene object',
    documentation:
      'Declares a 3D object with mesh, position, material, traits, and children.\n\n```holo\nobject "my_cube" {\n  mesh: "box"\n  position: [0, 1, 0]\n  material: { preset: "metal" }\n  @collidable\n}\n```',
  },
  spatial_group: {
    detail: 'Group of objects in space',
    documentation:
      'Groups objects under a shared transform. Supports `at [x,y,z]` shorthand.\n\n```holo\nspatial_group "Gallery" at [0, 0, -5] {\n  object "painting" { ... }\n}\n```',
  },
  light: {
    detail: 'Light source',
    documentation:
      'First-class light block. Types: directional, point, spot, hemisphere, ambient, area.\n\n```holo\nlight "sun" directional {\n  color: "#ffffff"\n  intensity: 1.5\n  cast_shadow: true\n}\n```',
  },
  effects: {
    detail: 'Post-processing effects',
    documentation:
      'Configures post-processing effects like bloom, vignette, SSAO, DOF.\n\n```holo\neffects {\n  bloom { intensity: 1.5, luminanceThreshold: 0.2 }\n  vignette { darkness: 0.5 }\n}\n```',
  },
  camera: {
    detail: 'Scene camera',
    documentation:
      'Configures the scene camera. Types: perspective, orthographic, cinematic.\n\n```holo\ncamera perspective {\n  fov: 75\n  position: [0, 5, 15]\n  look_at: [0, 0, 0]\n}\n```',
  },
  timeline: {
    detail: 'Animation timeline',
    documentation:
      'Sequenced animation choreography with timed actions.\n\n```holo\ntimeline "intro" {\n  autoplay: true\n  0.0: animate "camera" { position: [0, 5, 10] }\n  1.5: emit "scene_ready"\n}\n```',
  },
  audio: {
    detail: 'Audio source',
    documentation:
      'Spatial or global audio block.\n\n```holo\naudio "bgm" {\n  src: "music.mp3"\n  volume: 0.6\n  loop: true\n  spatial: false\n}\n```',
  },
  zone: {
    detail: 'Interaction zone',
    documentation:
      'Trigger volume with event handlers.\n\n```holo\nzone "entrance" {\n  shape: "box"\n  size: [10, 5, 10]\n  on_enter { show_notification("Welcome!") }\n}\n```',
  },
  ui: {
    detail: 'HUD overlay',
    documentation:
      'Screen-space UI overlay with elements.\n\n```holo\nui {\n  element "score" {\n    type: "text"\n    text: bind(state.score)\n  }\n}\n```',
  },
  transition: {
    detail: 'Scene transition',
    documentation:
      'Scene-to-scene navigation effect.\n\n```holo\ntransition "to_lobby" {\n  target: "/worlds/lobby"\n  effect: "fade"\n  duration: 1.5\n}\n```',
  },
  logic: {
    detail: 'Game logic block',
    documentation:
      'Event handlers and actions for scene logic.\n\n```holo\nlogic {\n  on_enter { show_notification("Scene loaded") }\n  action update() { state.score += 1 }\n}\n```',
  },

  // ── v4.2 Simulation Domain Blocks ──────────────────────────────────────
  material: {
    detail: 'PBR material block',
    documentation:
      'Defines a physically-based material.\\n\\n```holo\\nmaterial "Steel" {\\n  baseColor: "#888"\\n  metallic: 1.0\\n  roughness: 0.3\\n}\\n```',
  },
  rigidbody: {
    detail: 'Rigid body physics',
    documentation:
      'Dynamic rigid body with mass and gravity.\\n\\n```holo\\nrigidbody { mass: 10, use_gravity: true }\\n```',
  },
  collider: {
    detail: 'Collision shape',
    documentation:
      'Physics collision shape (box, sphere, capsule, mesh).\\n\\n```holo\\ncollider { shape: "box", half_extents: [1,1,1] }\\n```',
  },
  particles: {
    detail: 'Particle system',
    documentation:
      'GPU particle system with emission/velocity/color modules.\\n\\n```holo\\nparticles "Fire" { max_particles: 10000 }\\n```',
  },
  post_processing: {
    detail: 'Post-processing stack',
    documentation:
      'Screen-space effects: bloom, DOF, SSAO, color grading.\\n\\n```holo\\npost_processing { bloom { intensity: 1.5 } }\\n```',
  },
  audio_source: {
    detail: 'Spatial audio source',
    documentation:
      '3D audio emitter with HRTF spatialization.\\n\\n```holo\\naudio_source "BGM" { clip: "music.ogg", spatialization: "hrtf" }\\n```',
  },
  weather: {
    detail: 'Weather system',
    documentation:
      'Multi-layer weather: rain, snow, wind, fog, clouds, lightning.\\n\\n```holo\\nweather "Forest" { layer rain { intensity: 0.7 } }\\n```',
  },
  procedural: {
    detail: 'Procedural generation',
    documentation:
      'Noise-based terrain and scatter with biome rules.\\n\\n```holo\\nprocedural "Terrain" { noise perlin { scale: 100 } }\\n```',
  },
  lod: {
    detail: 'Level of detail',
    documentation:
      'Distance-based LOD tiers.\\n\\n```holo\\nlod { level 0 { distance: 0 } level 1 { distance: 50 } }\\n```',
  },
  navmesh: {
    detail: 'Navigation mesh',
    documentation:
      'AI navigation with agent radius/height.\\n\\n```holo\\nnavmesh { agent_radius: 0.5, agent_height: 2.0 }\\n```',
  },
  behavior_tree: {
    detail: 'AI behavior tree',
    documentation:
      'Hierarchical decision tree for NPC AI.\\n\\n```holo\\nbehavior_tree "Guard" { selector { sequence { ... } } }\\n```',
  },
  input: {
    detail: 'Input bindings',
    documentation:
      'Maps controller/keyboard to actions.\\n\\n```holo\\ninput "Controls" { "jump": primary_button }\\n```',
  },
};

const TRAIT_COMPLETIONS: Record<string, { detail: string; documentation: string }> = {
  '@collidable': {
    detail: 'Static collision body',
    documentation: 'Makes the object a static collider with automatic shape detection.',
  },
  '@grabbable': {
    detail: 'Grab interaction',
    documentation:
      'Enables VR grab interaction. Automatically adds dynamic rigid body and collider.',
  },
  '@physics': {
    detail: 'Dynamic physics body',
    documentation:
      'Adds a dynamic rigid body with configurable mass.\n\n```holo\n@physics(mass: 2.0)\n```',
  },
  '@animated': {
    detail: 'Animation controller',
    documentation:
      'Enables animation on the object. Supports rotate, pulse, float, bob.\n\n```holo\n@animated(rotate: { speed: 1.5, axis: [0, 1, 0] })\n```',
  },
  '@bloom': {
    detail: 'Bloom effect',
    documentation: 'Tags the object for bloom post-processing.',
  },
  '@portal': {
    detail: 'Navigation portal',
    documentation:
      'Creates a portal to another scene.\n\n```holo\n@portal(destination: "/worlds/lobby")\n```',
  },
  '@orbit': {
    detail: 'Orbital constraint',
    documentation:
      'Makes the object orbit around a target.\n\n```holo\n@orbit(target: "sun", radius: 5, speed: 0.5)\n```',
  },
  '@attach': {
    detail: 'Attachment constraint',
    documentation:
      'Attaches the object to another with an offset.\n\n```holo\n@attach(target: "player", offset: [0, 1, 0])\n```',
  },
  '@follow': {
    detail: 'Follow constraint',
    documentation:
      'Makes the object follow a target.\n\n```holo\n@follow(target: "player", speed: 2.0, distance: 3)\n```',
  },
  '@look_at': {
    detail: 'Look-at constraint',
    documentation:
      'Makes the object always face a target.\n\n```holo\n@look_at(target: "player")\n```',
  },
  '@networked': {
    detail: 'Network synchronization',
    documentation: 'Enables multiplayer synchronization for this object.',
  },

  // ── Phase 1: Environment Understanding ──────────────────────────────
  '@plane_detection': {
    detail: 'AR plane detection',
    documentation:
      'Detects horizontal/vertical surfaces in the real world.\n\n```holo\n@plane_detection(mode: "horizontal", min_area: 0.5)\n```',
  },
  '@mesh_detection': {
    detail: 'AR mesh detection',
    documentation:
      'Detects and classifies real-world mesh geometry.\n\n```holo\n@mesh_detection(classification: true, physics_collider: true)\n```',
  },
  '@anchor': {
    detail: 'Spatial anchor',
    documentation:
      'Anchors an object to a real-world location.\n\n```holo\n@anchor(type: "plane", tracking_quality: "high")\n```',
  },
  '@persistent_anchor': {
    detail: 'Persistent spatial anchor',
    documentation:
      'Anchors that persist across sessions via local or cloud storage.\n\n```holo\n@persistent_anchor(storage: "cloud", ttl: 86400)\n```',
  },
  '@shared_anchor': {
    detail: 'Shared spatial anchor',
    documentation:
      'Anchors shared across multiple users for co-located AR.\n\n```holo\n@shared_anchor(authority: "creator", max_users: 10)\n```',
  },
  '@geospatial': {
    detail: 'Geospatial positioning',
    documentation:
      'Places objects at real-world GPS coordinates.\n\n```holo\n@geospatial(latitude: 37.7749, longitude: -122.4194)\n```',
  },
  '@occlusion': {
    detail: 'AR occlusion',
    documentation:
      'Enables real-world occlusion of virtual objects.\n\n```holo\n@occlusion(mode: "environment", depth_quality: "high")\n```',
  },
  '@light_estimation': {
    detail: 'AR light estimation',
    documentation:
      'Estimates real-world lighting conditions to match virtual objects.\n\n```holo\n@light_estimation(mode: "environmental_probe", auto_apply: true)\n```',
  },

  // ── Phase 2: Input Modalities ───────────────────────────────────────
  '@eye_tracking': {
    detail: 'Eye/gaze tracking',
    documentation:
      'Tracks user eye gaze for interaction and foveated rendering.\n\n```holo\n@eye_tracking(dwell_time: 800, gaze_highlight: true)\n```',
  },
  '@hand_tracking': {
    detail: 'Hand tracking',
    documentation:
      'Full hand skeleton tracking with gesture recognition.\n\n```holo\n@hand_tracking(gesture_set: "default", pinch_threshold: 0.8)\n```',
  },
  '@controller': {
    detail: 'VR controller input',
    documentation:
      'Maps VR controller buttons, triggers, and thumbsticks.\n\n```holo\n@controller(haptic_feedback: true, dead_zone: 0.1)\n```',
  },
  '@spatial_accessory': {
    detail: 'Spatial accessory input',
    documentation:
      'Supports external spatial input devices (trackers, keyboards).\n\n```holo\n@spatial_accessory(device_type: "tracker", mapping: "custom")\n```',
  },
  '@body_tracking': {
    detail: 'Full body tracking',
    documentation:
      'Full-body pose estimation for avatar embodiment.\n\n```holo\n@body_tracking(tracking_level: "full_body", ik_fallback: true)\n```',
  },
  '@face_tracking': {
    detail: 'Facial tracking',
    documentation:
      'Tracks facial expressions via blend shapes.\n\n```holo\n@face_tracking(blend_shapes: 52, eye_tracking: true)\n```',
  },
  '@haptic': {
    detail: 'Haptic feedback',
    documentation:
      'Configures haptic feedback patterns for VR controllers.\n\n```holo\n@haptic(intensity: 0.5, duration: 100, pattern: "pulse")\n```',
  },

  // ── Phase 3: Accessibility ──────────────────────────────────────────
  '@accessible': {
    detail: 'Accessibility master trait',
    documentation:
      'Master accessibility trait with ARIA-like role, label, and description.\n\n```holo\n@accessible(role: "button", label: "Open menu")\n```',
  },
  '@alt_text': {
    detail: 'Alternative text',
    documentation:
      'Provides descriptive text for screen readers and assistive tech.\n\n```holo\n@alt_text(text: "A red sphere floating above the table")\n```',
  },
  '@spatial_audio_cue': {
    detail: 'Spatial audio cue',
    documentation:
      'Provides audio feedback cues for spatial orientation.\n\n```holo\n@spatial_audio_cue(cue_type: "proximity", earcon: "ping")\n```',
  },
  '@sonification': {
    detail: 'Data sonification',
    documentation:
      'Maps data values to audio frequencies for non-visual feedback.\n\n```holo\n@sonification(data_source: "state.value", min_freq: 200, max_freq: 2000)\n```',
  },
  '@haptic_cue': {
    detail: 'Haptic accessibility cue',
    documentation:
      'Provides haptic patterns for non-visual spatial cues.\n\n```holo\n@haptic_cue(pattern: "pulse", intensity: 0.6)\n```',
  },
  '@magnifiable': {
    detail: 'Magnification support',
    documentation:
      'Enables magnification for low-vision users.\n\n```holo\n@magnifiable(min_scale: 1.0, max_scale: 5.0, trigger: "pinch")\n```',
  },
  '@high_contrast': {
    detail: 'High contrast mode',
    documentation:
      'Applies high-contrast visual styling for visibility.\n\n```holo\n@high_contrast(mode: "outline", outline_color: "#ffffff")\n```',
  },
  '@motion_reduced': {
    detail: 'Reduced motion',
    documentation:
      'Reduces or eliminates animations for motion-sensitive users.\n\n```holo\n@motion_reduced(disable_parallax: true, reduce_animations: true)\n```',
  },
  '@subtitle': {
    detail: 'Subtitle display',
    documentation:
      'Displays subtitles for audio content.\n\n```holo\n@subtitle(language: "en", font_size: 24, position: "bottom")\n```',
  },
  '@screen_reader': {
    detail: 'Screen reader support',
    documentation:
      'Provides semantic structure for screen reader navigation.\n\n```holo\n@screen_reader(navigation_order: 1, announce_changes: true)\n```',
  },

  // ── Phase 4: Gaussian Splatting & Volumetric ────────────────────────
  '@gaussian_splat': {
    detail: 'Gaussian splat rendering',
    documentation:
      'Renders 3D Gaussian splat point clouds for photorealistic scenes.\n\n```holo\n@gaussian_splat(source: "/models/scene.ply", quality: "high")\n```',
  },
  '@nerf': {
    detail: 'Neural radiance field',
    documentation:
      'Renders neural radiance field (NeRF) models.\n\n```holo\n@nerf(model_url: "/models/scene.nerf", resolution: "medium")\n```',
  },
  '@volumetric_video': {
    detail: 'Volumetric video playback',
    documentation:
      'Plays volumetric video captures in 3D space.\n\n```holo\n@volumetric_video(source: "/video/capture.4dgs", loop: true)\n```',
  },
  '@point_cloud': {
    detail: 'Point cloud rendering',
    documentation:
      'Renders large-scale point cloud data.\n\n```holo\n@point_cloud(source: "/data/scan.las", point_size: 0.01)\n```',
  },
  '@photogrammetry': {
    detail: 'Photogrammetry capture',
    documentation:
      'Reconstructs 3D geometry from photos or depth data.\n\n```holo\n@photogrammetry(source_type: "images", quality: "high")\n```',
  },

  // ── Phase 5: WebGPU Compute ─────────────────────────────────────────
  '@compute': {
    detail: 'GPU compute shader',
    documentation:
      'Runs custom WebGPU compute shaders for parallel processing.\n\n```holo\n@compute(workgroup_size: [64, 1, 1], dispatch: [256, 1, 1])\n```',
  },
  '@gpu_particle': {
    detail: 'GPU particle system',
    documentation:
      'GPU-accelerated particle system with millions of particles.\n\n```holo\n@gpu_particle(count: 100000, emission_rate: 5000)\n```',
  },
  '@gpu_physics': {
    detail: 'GPU physics simulation',
    documentation:
      'GPU-accelerated physics for cloth, fluids, and soft bodies.\n\n```holo\n@gpu_physics(type: "cloth", resolution: 64, substeps: 4)\n```',
  },
  '@gpu_buffer': {
    detail: 'GPU buffer',
    documentation:
      'Manages shared GPU buffer resources for compute pipelines.\n\n```holo\n@gpu_buffer(size: 1048576, usage: "storage")\n```',
  },

  // ── Phase 6: Digital Twin & IoT ─────────────────────────────────────
  '@sensor': {
    detail: 'IoT sensor binding',
    documentation:
      'Connects to IoT sensor data streams.\n\n```holo\n@sensor(type: "temperature", protocol: "mqtt", endpoint: "sensors/room1")\n```',
  },
  '@digital_twin': {
    detail: 'Digital twin sync',
    documentation:
      'Synchronizes a virtual object with its physical twin.\n\n```holo\n@digital_twin(source_id: "machine-001", sync_interval: 1000)\n```',
  },
  '@data_binding': {
    detail: 'Data binding',
    documentation:
      'Binds object properties to external data sources.\n\n```holo\n@data_binding(source: "api/metrics", mapping: { color: "status" })\n```',
  },
  '@alert': {
    detail: 'Alert trigger',
    documentation:
      'Triggers visual/audio/haptic alerts based on conditions.\n\n```holo\n@alert(condition: "value > 100", severity: "warning")\n```',
  },
  '@heatmap_3d': {
    detail: '3D heatmap visualization',
    documentation:
      'Visualizes data as a 3D heatmap overlay.\n\n```holo\n@heatmap_3d(data_source: "usage_data", color_ramp: "thermal")\n```',
  },

  // ── Phase 7: Autonomous Agents ──────────────────────────────────────
  '@behavior_tree': {
    detail: 'Behavior tree AI',
    documentation:
      'Attaches a behavior tree for autonomous decision-making.\n\n```holo\n@behavior_tree(tick_rate: 10, debug_visualize: false)\n```',
  },
  '@goal_oriented': {
    detail: 'Goal-oriented AI',
    documentation:
      'GOAP-style goal-oriented action planning.\n\n```holo\n@goal_oriented(planning_method: "goap", replan_interval: 5000)\n```',
  },
  '@llm_agent': {
    detail: 'LLM-powered agent',
    documentation:
      'Uses a large language model for autonomous reasoning.\n\n```holo\n@llm_agent(model: "gpt-4", temperature: 0.7)\n```',
  },
  '@memory': {
    detail: 'Agent memory',
    documentation:
      'Gives agents episodic and semantic memory.\n\n```holo\n@memory(capacity: 100, decay_rate: 0.01)\n```',
  },
  '@perception': {
    detail: 'Agent perception',
    documentation:
      'Gives agents sight, hearing, and spatial awareness.\n\n```holo\n@perception(sight_range: 20, hearing_range: 10, fov: 120)\n```',
  },
  '@emotion': {
    detail: 'Emotion model',
    documentation:
      'Simulates emotional states that influence behavior.\n\n```holo\n@emotion(model: "pad", decay_rate: 0.05)\n```',
  },
  '@dialogue': {
    detail: 'Dialogue system',
    documentation:
      'Enables conversational dialogue with branching trees or LLM.\n\n```holo\n@dialogue(mode: "branching", voice_enabled: true)\n```',
  },
  '@faction': {
    detail: 'Faction membership',
    documentation:
      'Assigns agents to factions with reputation systems.\n\n```holo\n@faction(faction_id: "villagers", hostility_threshold: -50)\n```',
  },
  '@patrol': {
    detail: 'Patrol behavior',
    documentation:
      'Defines patrol routes with waypoints.\n\n```holo\n@patrol(waypoints: [[0,0,0], [10,0,0]], patrol_type: "loop")\n```',
  },

  // ── Phase 8: Advanced Spatial Audio ─────────────────────────────────
  '@ambisonics': {
    detail: 'Ambisonic audio',
    documentation:
      'Higher-order ambisonic spatial audio encoding.\n\n```holo\n@ambisonics(order: 3, format: "ambiX")\n```',
  },
  '@hrtf': {
    detail: 'HRTF audio',
    documentation:
      'Head-related transfer function for binaural spatialization.\n\n```holo\n@hrtf(profile: "default", near_field: true)\n```',
  },
  '@reverb_zone': {
    detail: 'Reverb zone',
    documentation:
      'Defines a spatial reverb zone with configurable acoustics.\n\n```holo\n@reverb_zone(preset: "cathedral", decay_time: 3.5)\n```',
  },
  '@audio_occlusion': {
    detail: 'Audio occlusion',
    documentation:
      'Simulates sound occlusion through physical materials.\n\n```holo\n@audio_occlusion(material_model: true, frequency_dependent: true)\n```',
  },
  '@audio_portal': {
    detail: 'Audio portal',
    documentation:
      'Sound portal connecting two acoustic zones.\n\n```holo\n@audio_portal(connected_zone: "hallway", opening_size: 2.0)\n```',
  },
  '@audio_material': {
    detail: 'Acoustic material',
    documentation:
      'Defines acoustic properties of surfaces.\n\n```holo\n@audio_material(absorption: 0.3, reflection: 0.7)\n```',
  },
  '@head_tracked_audio': {
    detail: 'Head-tracked audio',
    documentation:
      'Keeps audio anchored in world space relative to head movement.\n\n```holo\n@head_tracked_audio(tracking_mode: "world_locked")\n```',
  },

  // ── Phase 9: OpenUSD & Interoperability ─────────────────────────────
  '@usd': {
    detail: 'OpenUSD asset',
    documentation:
      'Loads and renders OpenUSD scene descriptions.\n\n```holo\n@usd(file_path: "/models/scene.usdz", variant_set: "LOD")\n```',
  },
  '@gltf': {
    detail: 'glTF asset',
    documentation:
      'Loads glTF/GLB 3D models with full PBR material support.\n\n```holo\n@gltf(url: "/models/asset.glb", draco: true)\n```',
  },
  '@fbx': {
    detail: 'FBX asset',
    documentation:
      'Loads FBX models with animation support.\n\n```holo\n@fbx(url: "/models/character.fbx", scale_factor: 0.01)\n```',
  },
  '@material_x': {
    detail: 'MaterialX material',
    documentation:
      'Applies MaterialX material definitions for cross-platform materials.\n\n```holo\n@material_x(document: "/materials/wood.mtlx")\n```',
  },
  '@scene_graph': {
    detail: 'Scene graph control',
    documentation:
      'Controls scene graph hierarchy, instancing, and visibility propagation.\n\n```holo\n@scene_graph(instancing: true, hierarchy_mode: "flatten")\n```',
  },

  // ── Phase 10: Co-Presence & Shared Experiences ──────────────────────
  '@co_located': {
    detail: 'Co-located experience',
    documentation:
      'Enables co-located multi-user AR/VR with shared spatial anchors.\n\n```holo\n@co_located(anchor_method: "visual", max_users: 4)\n```',
  },
  '@remote_presence': {
    detail: 'Remote presence',
    documentation:
      'Enables remote multi-user presence with avatar streaming.\n\n```holo\n@remote_presence(transport: "webrtc", codec: "av1")\n```',
  },
  '@shared_world': {
    detail: 'Shared world state',
    documentation:
      'Manages shared world state with authority and conflict resolution.\n\n```holo\n@shared_world(authority: "host", persistence: "cloud")\n```',
  },
  '@voice_proximity': {
    detail: 'Proximity voice chat',
    documentation:
      'Spatial voice chat with distance-based falloff.\n\n```holo\n@voice_proximity(max_distance: 20, falloff: "linear")\n```',
  },
  '@avatar_embodiment': {
    detail: 'Avatar embodiment',
    documentation:
      'Full avatar body tracking and IK for user embodiment.\n\n```holo\n@avatar_embodiment(tracking_level: "upper_body", mirror: true)\n```',
  },
  '@spectator': {
    detail: 'Spectator mode',
    documentation:
      'Enables spectator viewing of shared experiences.\n\n```holo\n@spectator(camera_mode: "free_fly", ui_overlay: true)\n```',
  },
  '@role': {
    detail: 'User role assignment',
    documentation:
      'Assigns roles with permissions in shared experiences.\n\n```holo\n@role(role_id: "moderator", permissions: ["kick", "mute"])\n```',
  },

  // ── Phase 11: Geospatial & AR Cloud ─────────────────────────────────
  '@geospatial_anchor': {
    detail: 'Geospatial anchor',
    documentation:
      'Anchors objects to precise GPS coordinates via AR cloud.\n\n```holo\n@geospatial_anchor(latitude: 37.7749, longitude: -122.4194)\n```',
  },
  '@terrain_anchor': {
    detail: 'Terrain anchor',
    documentation:
      'Anchors objects to terrain elevation at GPS coordinates.\n\n```holo\n@terrain_anchor(latitude: 37.7749, longitude: -122.4194)\n```',
  },
  '@rooftop_anchor': {
    detail: 'Rooftop anchor',
    documentation:
      'Anchors objects to building rooftops at GPS coordinates.\n\n```holo\n@rooftop_anchor(latitude: 37.7749, longitude: -122.4194)\n```',
  },
  '@vps': {
    detail: 'Visual positioning system',
    documentation:
      'Uses VPS for precise localization in mapped areas.\n\n```holo\n@vps(map_id: "downtown_sf", confidence_threshold: 0.8)\n```',
  },
  '@poi': {
    detail: 'Point of interest',
    documentation:
      'Marks an object as a point of interest with proximity triggers.\n\n```holo\n@poi(category: "landmark", radius: 50, label: "City Hall")\n```',
  },

  // ── Phase 12: Web3 & Ownership ──────────────────────────────────────
  '@nft': {
    detail: 'NFT-linked asset',
    documentation:
      'Links a 3D object to an NFT for provenance and ownership.\n\n```holo\n@nft(chain: "ethereum", contract: "0x...", token_id: "42")\n```',
  },
  '@token_gated': {
    detail: 'Token-gated access',
    documentation:
      'Restricts access based on token/NFT ownership.\n\n```holo\n@token_gated(chain: "ethereum", contract: "0x...", min_balance: 1)\n```',
  },
  '@wallet': {
    detail: 'Wallet connection',
    documentation:
      'Connects to Web3 wallets for authentication and transactions.\n\n```holo\n@wallet(chains: ["ethereum", "polygon"], auto_connect: true)\n```',
  },
  '@marketplace': {
    detail: 'Marketplace listing',
    documentation:
      'Lists objects on a marketplace for trading.\n\n```holo\n@marketplace(listing_type: "fixed_price", currency: "ETH")\n```',
  },
  '@portable': {
    detail: 'Cross-platform portable',
    documentation:
      'Enables exporting assets in interoperable formats.\n\n```holo\n@portable(formats: ["glb", "usdz"], metadata: "dublin_core")\n```',
  },

  // ── Phase 13: Physics Expansion ─────────────────────────────────────
  '@cloth': {
    detail: 'Cloth simulation',
    documentation:
      'Simulates cloth physics with wind and collision.\n\n```holo\n@cloth(stiffness: 0.8, damping: 0.1, wind_influence: 0.5)\n```',
  },
  '@fluid': {
    detail: 'Fluid simulation',
    documentation:
      'Simulates fluid dynamics with surface tension and viscosity.\n\n```holo\n@fluid(viscosity: 0.01, particle_count: 10000)\n```',
  },
  '@soft_body': {
    detail: 'Soft body physics',
    documentation:
      'Simulates deformable soft body objects.\n\n```holo\n@soft_body(elasticity: 0.5, pressure: 1.0)\n```',
  },
  '@rope': {
    detail: 'Rope simulation',
    documentation:
      'Simulates rope/cable physics with attachment points.\n\n```holo\n@rope(length: 5.0, segments: 20, stiffness: 0.9)\n```',
  },
  '@chain': {
    detail: 'Chain simulation',
    documentation:
      'Simulates chain link physics with break force.\n\n```holo\n@chain(link_count: 30, break_force: 500)\n```',
  },
  '@wind': {
    detail: 'Wind force',
    documentation:
      'Applies wind forces to physics objects.\n\n```holo\n@wind(direction: [1, 0, 0], strength: 5.0, turbulence: 0.3)\n```',
  },
  '@buoyancy': {
    detail: 'Buoyancy physics',
    documentation:
      'Simulates buoyancy for objects in water.\n\n```holo\n@buoyancy(water_level: 0, fluid_density: 1000)\n```',
  },
  '@destruction': {
    detail: 'Destructible object',
    documentation:
      'Enables destruction with fracture patterns and debris.\n\n```holo\n@destruction(health: 100, fracture_pattern: "voronoi")\n```',
  },

  // ── Phase 14: GPU Compute ───────────────────────────────────────────
  '@compute_shader': {
    detail: 'GPU compute shader',
    documentation:
      'Compiles and dispatches GPU compute shaders.\n\n```holo\n@compute_shader(max_workgroups: 256)\n```',
  },
  '@render_pipeline': {
    detail: 'Custom render pipeline',
    documentation:
      'Defines a custom multi-pass render pipeline.\n\n```holo\n@render_pipeline(max_passes: 8)\n```',
  },
  '@post_process': {
    detail: 'Post-processing effects',
    documentation:
      'Adds post-processing effects (bloom, SSAO, etc.).\n\n```holo\n@post_process(max_effects: 16)\n```',
  },
  '@ray_trace': {
    detail: 'Ray tracing',
    documentation:
      'Hardware-accelerated ray tracing for reflections and GI.\n\n```holo\n@ray_trace(max_bounces: 4, samples_per_pixel: 1)\n```',
  },

  // ── Phase 15: ML / Tensor ───────────────────────────────────────────
  '@tensor_op': {
    detail: 'Tensor operations',
    documentation:
      'GPU-accelerated tensor math (matmul, conv, etc.).\n\n```holo\n@tensor_op(max_dimensions: 4)\n```',
  },
  '@onnx_runtime': {
    detail: 'ONNX model runtime',
    documentation:
      'Loads and runs ONNX models for inference.\n\n```holo\n@onnx_runtime(execution_provider: "cpu")\n```',
  },
  '@training_loop': {
    detail: 'ML training loop',
    documentation:
      'Manages training epochs with loss tracking.\n\n```holo\n@training_loop(max_epochs: 100, learning_rate: 0.001)\n```',
  },

  // ── Phase 16: Database / Persistence ────────────────────────────────
  '@sql_query': {
    detail: 'SQL query execution',
    documentation:
      'Executes parameterized SQL queries.\n\n```holo\n@sql_query(max_results: 100)\n```',
  },
  '@orm_entity': {
    detail: 'ORM entity mapping',
    documentation:
      'Maps objects to database entities with CRUD.\n\n```holo\n@orm_entity(table_prefix: "game_")\n```',
  },
  '@offline_sync': {
    detail: 'Offline data sync',
    documentation:
      'Queues mutations offline and syncs when connected.\n\n```holo\n@offline_sync(sync_interval_ms: 5000)\n```',
  },
  '@reactive_store': {
    detail: 'Reactive key-value store',
    documentation:
      'Observable key-value store with subscriptions.\n\n```holo\n@reactive_store(max_keys: 500)\n```',
  },

  // ── Phase 17: Spatial Algorithms ────────────────────────────────────
  '@astar': {
    detail: 'A* pathfinding',
    documentation:
      'A* search with configurable heuristic.\n\n```holo\n@astar(max_iterations: 10000, heuristic: "euclidean")\n```',
  },
  '@navmesh_solver': {
    detail: 'Navigation mesh solver',
    documentation:
      'Builds and queries navigation meshes.\n\n```holo\n@navmesh_solver(cell_size: 0.5)\n```',
  },
  '@optimization': {
    detail: 'Mathematical optimization',
    documentation:
      'Solves constrained optimization problems.\n\n```holo\n@optimization(max_iterations: 1000, tolerance: 1e-6)\n```',
  },

  // ── Phase 18: Debug / Cinematic ─────────────────────────────────────
  '@time_travel_debug': {
    detail: 'Time-travel debugger',
    documentation:
      'Captures state snapshots for rewind/replay.\n\n```holo\n@time_travel_debug(max_snapshots: 100)\n```',
  },
  '@spatial_profiler': {
    detail: 'Spatial profiler',
    documentation:
      'Profiles FPS, draw calls, and GPU metrics.\n\n```holo\n@spatial_profiler(sample_rate_ms: 16)\n```',
  },
  '@cinematic_seq': {
    detail: 'Cinematic sequencer',
    documentation:
      'Timeline-based cinematic clip sequencer.\n\n```holo\n@cinematic_seq(fps: 24)\n```',
  },
  '@ai_camera': {
    detail: 'AI camera director',
    documentation:
      'AI-driven camera tracking and framing.\n\n```holo\n@ai_camera(tracking_speed: 1.0)\n```',
  },

  // ── Phase 19: FFI / OS Bindings ─────────────────────────────────────
  '@ffi': {
    detail: 'Foreign function interface',
    documentation:
      'Binds and calls foreign library symbols.\n\n```holo\n@ffi(allowed_libs: ["libm"])\n```',
  },
  '@native_call': {
    detail: 'Native API call',
    documentation:
      'Invokes native OS/platform APIs in a sandbox.\n\n```holo\n@native_call(sandbox: true)\n```',
  },
  '@wasm_bridge': {
    detail: 'WebAssembly bridge',
    documentation:
      'Loads and calls WebAssembly modules.\n\n```holo\n@wasm_bridge(max_memory_pages: 256)\n```',
  },
  '@sys_io': {
    detail: 'System I/O',
    documentation:
      'Filesystem read/write with permission control.\n\n```holo\n@sys_io(allow_write: false)\n```',
  },

  // ── Phase 20: Concurrency ──────────────────────────────────────────
  '@actor': {
    detail: 'Actor model',
    documentation: 'Message-passing actor with mailbox.\n\n```holo\n@actor(mailbox_size: 10)\n```',
  },
  '@csp_channel': {
    detail: 'CSP channel',
    documentation:
      'Communicating sequential processes channel.\n\n```holo\n@csp_channel(buffer_size: 10)\n```',
  },
  '@temporal_guard': {
    detail: 'Temporal logic guard',
    documentation:
      'Asserts temporal properties (liveness, safety).\n\n```holo\n@temporal_guard(default_timeout_ms: 5000)\n```',
  },
  '@deadlock_free': {
    detail: 'Deadlock freedom verifier',
    documentation:
      'Tracks resource ownership and prevents deadlocks.\n\n```holo\n@deadlock_free(max_resources: 100)\n```',
  },

  // ── Auto-generated completions ──
};

// =============================================================================
// LSP SERVICE
// =============================================================================

export class HoloScriptLSP {
  private parser: HoloCompositionParser;
  private cachedResult: HoloParseResult | null = null;
  private cachedSource: string = '';
  private completionProvider: CompletionProvider;
  private diagnosticProvider: DiagnosticProvider;
  private importResolver: ImportResolver;

  constructor(options?: { rootDir?: string }) {
    this.parser = new HoloCompositionParser({ tolerant: true, locations: true });
    this.completionProvider = new CompletionProvider();
    this.diagnosticProvider = new DiagnosticProvider();
    this.importResolver = new ImportResolver({ rootDir: options?.rootDir ?? '.' });
  }

  /**
   * Parse a document and return diagnostics.
   */
  getDiagnostics(source: string): LSPDiagnostic[] {
    const result = this.parseAndCache(source);
    const diagnostics: LSPDiagnostic[] = [];

    for (const error of result.errors) {
      diagnostics.push({
        severity: 'error',
        message: error.message,
        range: this.locToRange(error.loc),
        code: error.code,
        source: 'holoscript',
      });
    }

    for (const warning of result.warnings) {
      diagnostics.push({
        severity: 'warning',
        message: warning.message,
        range: this.locToRange(warning.loc),
        code: warning.code,
        source: 'holoscript',
      });
    }

    // Semantic warnings
    if (result.ast) {
      this.addSemanticWarnings(result.ast, diagnostics);
    }

    // v4.2: Domain block validation (HS004, HS005)
    if (result.ast) {
      const traitNames = new Set<string>();
      for (const t of result.ast.templates) {
        for (const tr of t.traits) traitNames.add(tr.name);
      }
      for (const obj of result.ast.objects) {
        for (const tr of obj.traits) traitNames.add(tr.name);
      }
      const domainNodes: any[] = (result.ast as any).domainBlocks ?? [];
      const ctx: DiagnosticContext = { nodes: domainNodes, knownTraits: traitNames };
      const providerDiags = this.diagnosticProvider.diagnose(ctx);
      for (const d of providerDiags) {
        diagnostics.push({
          severity: d.severity as any,
          message: d.message,
          range: {
            start: { line: d.line, character: d.column },
            end: { line: d.line, character: d.column + 1 },
          },
          code: d.code,
          source: 'holoscript',
        });
      }
    }

    return diagnostics;
  }

  /**
   * Get completion items at a position.
   */
  getCompletions(source: string, position: LSPPosition): LSPCompletionItem[] {
    const line = this.getLine(source, position.line);
    const prefix = line.substring(0, position.character).trimStart();
    const items: LSPCompletionItem[] = [];

    // Inside a composition — suggest top-level keywords
    if (this.isTopLevel(source, position)) {
      for (const [keyword, meta] of Object.entries(HOLO_KEYWORDS)) {
        items.push({
          label: keyword,
          kind: 'keyword',
          detail: meta.detail,
          documentation: meta.documentation,
          sortText: `0_${keyword}`,
        });
      }
    }

    // After @ — suggest traits
    if (prefix.endsWith('@') || prefix.match(/@\w*$/)) {
      for (const [trait, meta] of Object.entries(TRAIT_COMPLETIONS)) {
        items.push({
          label: trait,
          kind: 'decorator',
          detail: meta.detail,
          documentation: meta.documentation,
          insertText: trait.substring(1), // remove leading @
          sortText: `1_${trait}`,
        });
      }
    }

    // After "preset:" — suggest material presets
    if (prefix.match(/preset\s*:\s*"?$/)) {
      for (const preset of Object.keys(MATERIAL_PRESETS)) {
        items.push({
          label: preset,
          kind: 'value',
          detail: `Material preset: ${preset}`,
          documentation: `PBR properties: ${JSON.stringify(MATERIAL_PRESETS[preset], null, 2)}`,
          insertText: `"${preset}"`,
          sortText: `2_${preset}`,
        });
      }

      for (const preset of Object.keys(ENVIRONMENT_PRESETS)) {
        items.push({
          label: preset,
          kind: 'value',
          detail: `Environment preset: ${preset}`,
          insertText: `"${preset}"`,
          sortText: `3_${preset}`,
        });
      }
    }

    // After "mesh:" — suggest mesh types
    if (prefix.match(/mesh\s*:\s*"?$/)) {
      const meshTypes = [
        'sphere',
        'box',
        'cube',
        'cylinder',
        'cone',
        'plane',
        'torus',
        'ring',
        'capsule',
      ];
      for (const mesh of meshTypes) {
        items.push({
          label: mesh,
          kind: 'value',
          detail: `Mesh type: ${mesh}`,
          insertText: `"${mesh}"`,
          sortText: `2_${mesh}`,
        });
      }
    }

    // After "type:" — suggest object types
    if (prefix.match(/type\s*:\s*"?$/)) {
      const types = [
        'text',
        'sparkles',
        'portal',
        'directional',
        'point',
        'spot',
        'hemisphere',
        'ambient',
      ];
      for (const t of types) {
        items.push({
          label: t,
          kind: 'value',
          detail: `Object type: ${t}`,
          insertText: `"${t}"`,
          sortText: `2_${t}`,
        });
      }
    }

    // After "using" — suggest template names
    if (prefix.match(/using\s+"?$/)) {
      const result = this.parseAndCache(source);
      if (result.ast?.templates) {
        for (const tmpl of result.ast.templates) {
          items.push({
            label: tmpl.name,
            kind: 'class',
            detail: `Template: ${tmpl.name}`,
            documentation: `Traits: ${tmpl.traits.map((t) => '@' + t.name).join(', ') || 'none'}`,
            insertText: `"${tmpl.name}"`,
            sortText: `1_${tmpl.name}`,
          });
        }
      }
    }

    // bind() function
    if (prefix.match(/\bbind\s*\($/)) {
      const result = this.parseAndCache(source);
      if (result.ast?.state) {
        for (const prop of result.ast.state.properties) {
          items.push({
            label: `state.${prop.key}`,
            kind: 'variable',
            detail: `State: ${prop.key} = ${JSON.stringify(prop.value)}`,
            sortText: `0_${prop.key}`,
          });
        }
      }
    }

    // v4.2: Simulation block completions from CompletionProvider
    const blockContext = this.detectBlockContext(source, position);
    const providerItems = this.completionProvider.getCompletions({
      prefix: prefix.replace(/^@/, ''),
      triggerChar: prefix.endsWith('@') ? '@' : undefined,
      blockContext,
    });
    for (const pi of providerItems) {
      // Avoid duplicates with existing items
      if (!items.some((i) => i.label === pi.label)) {
        items.push({
          label: pi.label,
          kind:
            pi.kind === 'block' ? 'snippet' : pi.kind === 'trait' ? 'decorator' : (pi.kind as any),
          detail: pi.detail,
          documentation: pi.documentation,
          insertText: pi.insertText,
          sortText: `4_${pi.label}`,
        });
      }
    }

    // v4.2: Import completions
    if (prefix.match(/import\s+.*from\s+["']?$/)) {
      for (const pkg of this.importResolver.getKnownPackages()) {
        items.push({
          label: pkg,
          kind: 'module',
          detail: 'HoloScript package',
          insertText: `"${pkg}"`,
          sortText: `5_${pkg}`,
        });
      }
    }

    return items;
  }

  /**
   * Detect which domain block the cursor is inside.
   */
  private detectBlockContext(source: string, position: LSPPosition): string | undefined {
    const lines = source.split('\n');
    const blockKeywords = [
      'material',
      'rigidbody',
      'collider',
      'particles',
      'post_processing',
      'audio_source',
      'weather',
      'procedural',
      'lod',
      'navmesh',
      'behavior_tree',
      'input',
    ];
    // Walk backwards from cursor to find enclosing block
    let depth = 0;
    for (let i = position.line; i >= 0; i--) {
      const line = lines[i] || '';
      depth += (line.match(/}/g) || []).length;
      depth -= (line.match(/{/g) || []).length;
      if (depth < 0) {
        for (const kw of blockKeywords) {
          if (line.trimStart().startsWith(kw)) return kw;
        }
      }
    }
    return undefined;
  }

  /**
   * Get hover information at a position.
   */
  getHover(source: string, position: LSPPosition): LSPHoverResult | null {
    const line = this.getLine(source, position.line);
    const word = this.getWordAt(line, position.character);

    if (!word) return null;

    // Keyword hover
    if (HOLO_KEYWORDS[word.toLowerCase()]) {
      const meta = HOLO_KEYWORDS[word.toLowerCase()];
      return {
        contents: `### ${word}\n\n${meta.documentation}`,
        range: this.wordRange(position.line, word, line),
      };
    }

    // Trait hover (word after @)
    const traitKey = `@${word}`;
    if (TRAIT_COMPLETIONS[traitKey]) {
      const meta = TRAIT_COMPLETIONS[traitKey];
      return {
        contents: `### ${traitKey}\n\n${meta.documentation}`,
        range: this.wordRange(position.line, word, line),
      };
    }

    // Material preset hover
    if (MATERIAL_PRESETS[word]) {
      const props = MATERIAL_PRESETS[word];
      return {
        contents: `### Material Preset: \`${word}\`\n\n\`\`\`json\n${JSON.stringify(props, null, 2)}\n\`\`\``,
        range: this.wordRange(position.line, word, line),
      };
    }

    // Environment preset hover
    if (ENVIRONMENT_PRESETS[word]) {
      return {
        contents: `### Environment Preset: \`${word}\`\n\nConfigures skybox, lighting, fog, and ground for the "${word}" environment.`,
        range: this.wordRange(position.line, word, line),
      };
    }

    // bind() hover
    if (word === 'bind') {
      return {
        contents:
          '### `bind(source, transform?)`\n\nReactive data binding. Binds a UI or object property to a state variable.\n\n```holo\ntext: bind(state.score)\nvalue: bind(state.health, "formatPercent")\n```',
        range: this.wordRange(position.line, word, line),
      };
    }

    return null;
  }

  /**
   * Find the definition of a symbol (e.g., template references).
   */
  getDefinition(source: string, position: LSPPosition): LSPDefinitionResult | null {
    const line = this.getLine(source, position.line);
    const word = this.getWordAt(line, position.character);

    if (!word) return null;

    // Check if this is a template reference
    const result = this.parseAndCache(source);
    if (result.ast?.templates) {
      for (const tmpl of result.ast.templates) {
        if (tmpl.name === word) {
          // Find the template definition line
          const defLine = this.findLineContaining(source, `template "${word}"`);
          if (defLine >= 0) {
            return {
              uri: '', // Same file
              range: {
                start: { line: defLine, character: 0 },
                end: { line: defLine, character: line.length },
              },
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Get document symbols (outline).
   */
  getDocumentSymbols(source: string): LSPDocumentSymbol[] {
    const result = this.parseAndCache(source);
    if (!result.ast) return [];

    const symbols: LSPDocumentSymbol[] = [];
    const comp = result.ast;

    // Composition root
    const root: LSPDocumentSymbol = {
      name: comp.name,
      kind: 'module',
      range: this.fullDocRange(source),
      selectionRange: this.lineRange(0),
      children: [],
    };

    // Environment
    if (comp.environment) {
      root.children!.push({
        name: 'environment',
        kind: 'object',
        range: this.findBlockRange(source, 'environment'),
        selectionRange: this.findBlockRange(source, 'environment'),
      });
    }

    // State
    if (comp.state) {
      const stateSymbol: LSPDocumentSymbol = {
        name: 'state',
        kind: 'object',
        range: this.findBlockRange(source, 'state'),
        selectionRange: this.findBlockRange(source, 'state'),
        children: comp.state.properties.map((p) => ({
          name: p.key,
          kind: 'variable' as SymbolKind,
          range: this.findBlockRange(source, p.key),
          selectionRange: this.findBlockRange(source, p.key),
        })),
      };
      root.children!.push(stateSymbol);
    }

    // Templates
    for (const tmpl of comp.templates) {
      root.children!.push({
        name: `template "${tmpl.name}"`,
        kind: 'class',
        range: this.findBlockRange(source, `template "${tmpl.name}"`),
        selectionRange: this.findBlockRange(source, `template "${tmpl.name}"`),
      });
    }

    // Lights
    for (const light of comp.lights) {
      root.children!.push({
        name: `light "${light.name}" (${light.lightType})`,
        kind: 'property',
        range: this.findBlockRange(source, `light "${light.name}"`),
        selectionRange: this.findBlockRange(source, `light "${light.name}"`),
      });
    }

    // Objects
    for (const obj of comp.objects) {
      root.children!.push({
        name: `object "${obj.name}"`,
        kind: 'object',
        range: this.findBlockRange(source, `object "${obj.name}"`),
        selectionRange: this.findBlockRange(source, `object "${obj.name}"`),
      });
    }

    // Spatial groups
    for (const group of comp.spatialGroups) {
      root.children!.push({
        name: `spatial_group "${group.name}"`,
        kind: 'module',
        range: this.findBlockRange(source, `spatial_group "${group.name}"`),
        selectionRange: this.findBlockRange(source, `spatial_group "${group.name}"`),
      });
    }

    // Timelines
    for (const tl of comp.timelines) {
      root.children!.push({
        name: `timeline "${tl.name}"`,
        kind: 'function',
        range: this.findBlockRange(source, `timeline "${tl.name}"`),
        selectionRange: this.findBlockRange(source, `timeline "${tl.name}"`),
      });
    }

    // Audio
    for (const a of comp.audio) {
      root.children!.push({
        name: `audio "${a.name}"`,
        kind: 'event',
        range: this.findBlockRange(source, `audio "${a.name}"`),
        selectionRange: this.findBlockRange(source, `audio "${a.name}"`),
      });
    }

    // Zones
    for (const z of comp.zones) {
      root.children!.push({
        name: `zone "${z.name}"`,
        kind: 'event',
        range: this.findBlockRange(source, `zone "${z.name}"`),
        selectionRange: this.findBlockRange(source, `zone "${z.name}"`),
      });
    }

    symbols.push(root);
    return symbols;
  }

  /**
   * Validate composition semantics (beyond parse errors).
   */
  validateSemantics(source: string): LSPDiagnostic[] {
    return this.getDiagnostics(source).filter((d) => d.code?.startsWith('semantic'));
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private parseAndCache(source: string): HoloParseResult {
    if (source !== this.cachedSource || !this.cachedResult) {
      this.cachedSource = source;
      this.cachedResult = this.parser.parse(source);
    }
    return this.cachedResult;
  }

  private addSemanticWarnings(ast: HoloComposition, diagnostics: LSPDiagnostic[]): void {
    // Warn about objects referencing undefined templates
    const templateNames = new Set(ast.templates.map((t) => t.name));
    for (const obj of ast.objects) {
      if (obj.template && !templateNames.has(obj.template)) {
        diagnostics.push({
          severity: 'warning',
          message: `Template "${obj.template}" is not defined`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          code: 'semantic.undefined-template',
          source: 'holoscript',
        });
      }
    }

    // Warn about duplicate object names
    const objNames = new Map<string, number>();
    const allObjects = [...ast.objects];
    for (const group of ast.spatialGroups) {
      allObjects.push(...group.objects);
    }
    for (const obj of allObjects) {
      const count = (objNames.get(obj.name) || 0) + 1;
      objNames.set(obj.name, count);
    }
    for (const [name, count] of objNames) {
      if (count > 1) {
        diagnostics.push({
          severity: 'warning',
          message: `Object name "${name}" is used ${count} times — consider unique names`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          code: 'semantic.duplicate-name',
          source: 'holoscript',
        });
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private locToRange(loc?: SourceLocation): LSPRange {
    if (!loc) return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    const line = Math.max(0, loc.line - 1); // Convert 1-based to 0-based
    const character = Math.max(0, loc.column - 1);
    return {
      start: { line, character },
      end: { line, character: character + 1 },
    };
  }

  private getLine(source: string, lineNum: number): string {
    return source.split('\n')[lineNum] || '';
  }

  private getWordAt(line: string, character: number): string | null {
    const before = line.substring(0, character);
    const after = line.substring(character);
    const wordBefore = before.match(/[\w]+$/)?.[0] || '';
    const wordAfter = after.match(/^[\w]+/)?.[0] || '';
    const word = wordBefore + wordAfter;
    return word || null;
  }

  private isTopLevel(source: string, position: LSPPosition): boolean {
    const lines = source.split('\n');
    let depth = 0;
    for (let i = 0; i < position.line && i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
    }
    return depth === 1; // Inside composition but not nested deeper
  }

  private findLineContaining(source: string, text: string): number {
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(text)) return i;
    }
    return -1;
  }

  private wordRange(line: number, word: string, lineText: string): LSPRange {
    const start = lineText.indexOf(word);
    return {
      start: { line, character: Math.max(0, start) },
      end: { line, character: Math.max(0, start) + word.length },
    };
  }

  private fullDocRange(source: string): LSPRange {
    const lines = source.split('\n');
    return {
      start: { line: 0, character: 0 },
      end: { line: lines.length - 1, character: (lines[lines.length - 1] || '').length },
    };
  }

  private lineRange(line: number): LSPRange {
    return {
      start: { line, character: 0 },
      end: { line, character: 100 },
    };
  }

  private findBlockRange(source: string, keyword: string): LSPRange {
    const line = this.findLineContaining(source, keyword);
    if (line < 0) return this.lineRange(0);
    return {
      start: { line, character: 0 },
      end: { line, character: 100 },
    };
  }
}
