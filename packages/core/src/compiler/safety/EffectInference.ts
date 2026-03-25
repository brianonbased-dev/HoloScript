/**
 * @fileoverview Effect Inference Engine
 * @module @holoscript/core/compiler/safety
 *
 * Maps HoloScript traits and built-in functions to their effect signatures.
 * Provides bottom-up inference: given an AST node, compute the effect row
 * by looking up known effects and composing callee rows.
 *
 * @version 1.0.0
 */

import { EffectRow, VREffect, EffectDeclaration, EffectCategory } from '../../types/effects';

// =============================================================================
// TRAIT â†’ EFFECT MAPPINGS
// =============================================================================

/**
 * Maps standard HoloScript trait names to their effect rows.
 * When a function uses a trait, it inherits these effects.
 */
export const TRAIT_EFFECTS: Record<string, VREffect[]> = {
  // Rendering traits
  '@mesh': ['render:spawn'],
  '@material': ['render:material'],
  '@particle': ['render:particle', 'render:spawn', 'resource:gpu'],
  '@light': ['render:light'],
  '@shader': ['render:shader', 'resource:gpu'],
  '@gaussian': ['render:gaussian', 'resource:gpu', 'resource:memory'],
  '@camera': ['render:spawn'],
  '@sprite': ['render:spawn'],
  '@vfx': ['render:particle', 'render:shader', 'resource:gpu'],

  // Physics traits
  '@physics': ['physics:force', 'physics:collision', 'resource:cpu'],
  '@rigidbody': ['physics:force', 'physics:collision'],
  '@collider': ['physics:collision'],
  '@joint': ['physics:joint'],
  '@trigger': ['physics:collision'],
  '@gravity': ['physics:gravity'],
  '@teleport': ['physics:teleport'],

  // Audio traits
  '@audio': ['audio:play'],
  '@spatial_audio': ['audio:spatial'],
  '@reverb': ['audio:reverb'],
  '@music': ['audio:play', 'audio:global'],

  // State traits
  '@state': ['state:read', 'state:write'],
  '@persistent': ['state:persistent', 'io:write'],
  '@global_state': ['state:global'],

  // Networking
  '@networked': ['io:network', 'state:write'],
  '@multiplayer': ['io:network', 'agent:communicate'],
  '@sync': ['io:network', 'state:write'],

  // Agent traits
  '@agent': ['agent:spawn', 'resource:cpu'],
  '@npc': ['agent:spawn', 'agent:observe'],
  '@ai': ['agent:observe', 'resource:cpu'],
  '@behavior': ['agent:observe', 'state:read'],

  // Inventory / economy
  '@inventory': ['inventory:take', 'inventory:give'],
  '@tradeable': ['inventory:trade'],
  '@consumable': ['inventory:destroy'],
  '@loot': ['inventory:give'],

  // Authority / permissions
  '@owned': ['authority:own'],
  '@delegated': ['authority:delegate'],
  '@zone': ['authority:zone'],

  // Animation (mostly pure, some render effects)
  '@animation': ['render:material'],
  '@keyframe': ['state:read'],
  '@tween': ['state:read', 'state:write'],

  // Script / lifecycle
  '@script': ['state:read', 'state:write'],
  '@timer': ['io:timer'],
  '@event': ['state:read'],

  // Sandbox (explicitly limited)
  '@sandbox': [], // Pure â€” sandboxed code should have no effects

  // Culture traits (emergent agent culture)
  '@norm_compliant': ['agent:observe', 'agent:communicate'], // Must observe + report norms
  '@cultural_memory': ['state:read', 'state:write', 'state:persistent'], // Dual memory persistence
  '@cultural_trace': ['state:write', 'render:spawn'], // Spatial stigmergic markers

  // GPU Compute traits
  '@compute_shader': ['resource:gpu', 'render:shader'],
  '@render_pipeline': ['resource:gpu', 'render:spawn'],
  '@post_process': ['resource:gpu', 'render:material'],
  '@ray_trace': ['resource:gpu', 'resource:cpu'],

  // ML / Tensor traits
  '@tensor_op': ['resource:gpu', 'resource:memory'],
  '@onnx_runtime': ['resource:cpu', 'resource:memory'],
  '@training_loop': ['resource:gpu', 'resource:cpu', 'resource:memory'],

  // Database / Persistence traits
  '@sql_query': ['io:read', 'io:write'],
  '@orm_entity': ['io:read', 'io:write', 'state:read', 'state:write'],
  '@offline_sync': ['io:network', 'io:write', 'state:persistent'],
  '@reactive_store': ['state:read', 'state:write'],

  // Spatial Algorithm traits
  '@astar': ['resource:cpu'],
  '@navmesh_solver': ['resource:cpu', 'resource:memory'],
  '@optimization': ['resource:cpu'],

  // Debug / Cinematic traits
  '@time_travel_debug': ['state:read', 'state:write', 'resource:memory'],
  '@spatial_profiler': ['state:read', 'resource:cpu'],
  '@cinematic_seq': ['render:spawn', 'state:read'],
  '@ai_camera': ['render:spawn', 'agent:observe'],

  // FFI / OS traits
  '@ffi': ['io:read', 'io:write'],
  '@native_call': ['io:read', 'io:write'],
  '@wasm_bridge': ['resource:memory', 'resource:cpu'],
  '@sys_io': ['io:read', 'io:write'],

  // Concurrency traits
  '@actor': ['agent:spawn', 'agent:communicate'],
  '@csp_channel': ['state:read', 'state:write'],
  '@temporal_guard': ['state:read'],
  '@deadlock_free': ['resource:cpu'],

  // Auto-generated effect mappings

// Î“Ã²Ã‰Î“Ã²Ã‰Î“Ã²Ã‰ NEW TRAIT_EFFECTS Î“Ã²Ã‰Î“Ã²Ã‰Î“Ã²Ã‰
  '@absorb': [],
  '@abtest': [],
  '@accessible': [],
  '@advanced_lighting': ['render:spawn', 'resource:gpu'],
  '@advanced_pbr': [],
  '@advanced_texturing': [],
  '@agent_discovery': ['agent:spawn', 'resource:cpu'],
  '@agent_portal': ['agent:spawn', 'resource:cpu'],
  '@ai_inpainting': ['agent:spawn', 'resource:cpu'],
  '@ai_npc_brain': ['agent:spawn', 'resource:cpu'],
  '@ai_texture_gen': ['agent:spawn', 'resource:cpu'],
  '@ai_upscaling': ['agent:spawn', 'resource:cpu'],
  '@alert': [],
  '@alt_text': [],
  '@ambisonics': ['audio:play'],
  '@analytics': ['state:read'],
  '@anchor': [],
  '@api_key': [],
  '@approval': [],
  '@audio_material': ['render:spawn', 'resource:gpu'],
  '@audio_occlusion': ['audio:play'],
  '@audio_portal': ['audio:play'],
  '@audit_log': [],
  '@autocomplete': [],
  '@avatar_embodiment': [],
  '@batch_job': [],
  '@behavior_tree': ['agent:spawn', 'resource:cpu'],
  '@biofeedback': ['io:read', 'io:write'],
  '@blackboard': [],
  '@blob_store': ['state:read', 'state:write'],
  '@body_tracking': ['state:read'],
  '@buffer': [],
  '@buoyancy': ['physics:force', 'physics:collision'],
  '@cache': ['state:read', 'state:write'],
  '@canary': [],
  '@chain': ['agent:spawn', 'resource:cpu'],
  '@change_tracking': ['state:read'],
  '@chaos_test': [],
  '@choreography': [],
  '@circuit_breaker': [],
  '@cloth': ['physics:force', 'physics:collision'],
  '@co_located': [],
  '@compute': ['resource:gpu', 'resource:cpu'],
  '@consent_gate': ['authority:own'],
  '@consent_management': ['authority:own'],
  '@controller': [],
  '@controlnet': [],
  '@cron': [],
  '@database': ['state:read', 'state:write'],
  '@data_binding': [],
  '@data_lineage': [],
  '@data_quality': [],
  '@data_retention': ['io:read', 'io:write'],
  '@data_transform': ['state:read', 'state:write'],
  '@deploy': [],
  '@destruction': ['io:read', 'io:write'],
  '@dialogue': [],
  '@diffusion_realtime': ['io:read', 'io:write'],
  '@digital_twin': [],
  '@discord': [],
  '@economy': [],
  '@email': ['agent:spawn', 'resource:cpu'],
  '@embedding_search': [],
  '@embedding': [],
  '@emotional_voice': ['audio:play'],
  '@emotion': ['io:read', 'io:write'],
  '@encryption': ['io:read', 'io:write'],
  '@env_config': [],
  '@etl': [],
  '@eye_tracked': ['state:read'],
  '@faceted_search': [],
  '@face_tracking': ['state:read'],
  '@faction': ['agent:spawn', 'resource:cpu'],
  '@fbx': [],
  '@feature_flag': [],
  '@feedback_loop': [],
  '@file_system': ['io:read', 'io:write'],
  '@fine_tune': [],
  '@fixture': [],
  '@flow_field': [],
  '@fluid': ['physics:force', 'physics:collision'],
  '@form_builder': ['state:read', 'state:write'],
  '@full_text_search': [],
  '@gaussian_splat': ['render:spawn', 'resource:gpu'],
  '@gdpr': ['authority:own'],
  '@geospatial_anchor': [],
  '@geospatial': [],
  '@gesture_recognition': ['io:read', 'io:write'],
  '@global_illumination': ['io:read', 'io:write'],
  '@gltf': [],
  '@goal_oriented': [],
  '@gpu_buffer': ['resource:gpu', 'resource:cpu'],
  '@gpu_particle': ['render:spawn', 'resource:gpu'],
  '@gpu_physics': ['physics:force', 'physics:collision'],
  '@graphql': ['io:network'],
  '@ui_hand_menu': [],
  '@hand_mesh_ai': ['render:spawn', 'resource:gpu'],
  '@pinch': [],
  '@haptic_cue': [],
  '@soft': ['physics:force', 'physics:collision'],
  '@head_tracked_audio': ['audio:play'],
  '@healthcheck': [],
  '@high_contrast': [],
  '@hitl': [],
  '@hot_reload': [],
  '@hrtf': ['audio:play'],
  '@hsm_integration': ['io:read', 'io:write'],
  '@image_resize': [],
  '@incident': [],
  '@index': [],
  '@inference': [],
  '@interactive_graph': [],
  '@invoice': ['audio:play'],
  '@jwt': ['authority:own'],
  '@layer_aware': [],
  '@light_estimation': ['render:spawn', 'resource:gpu'],
  '@low_vowel': [],
  '@llm_agent': ['agent:spawn', 'resource:cpu'],
  '@load_test': [],
  '@locale': [],
  '@log_aggregator': [],
  '@magnifiable': [],
  '@markdown_render': ['render:spawn', 'resource:gpu'],
  '@marketplace_integration': ['io:read', 'io:write'],
  '@marketplace': [],
  '@material_x': ['render:spawn', 'resource:gpu'],
  '@memory': ['agent:spawn', 'resource:cpu'],
  '@mesh_detection': ['render:spawn', 'resource:gpu'],
  '@mfa': ['authority:own'],
  '@migrate': [],
  '@mitosis': [],
  '@mock': [],
  '@model_load': [],
  '@motion_reduced': ['io:read', 'io:write'],
  '@mqtt_pub': ['io:network'],
  '@mqtt_sink': ['io:network'],
  '@mqtt_source': ['io:network'],
  '@multi_agent': ['agent:spawn', 'resource:cpu'],
  '@negotiation': ['io:read', 'io:write'],
  '@nerf': ['render:spawn', 'resource:gpu'],
  '@networked_avatar': ['io:network'],
  '@neural_animation': ['agent:spawn', 'resource:cpu'],
  '@neural_forge': ['agent:spawn', 'resource:cpu'],
  '@neural_link': ['agent:spawn', 'resource:cpu'],
  '@nft': [],
  '@npc_ai': ['agent:spawn', 'resource:cpu'],
  '@oauth': ['authority:own'],
  '@object_tracking': ['state:read'],
  '@occlusion': ['io:read', 'io:write'],
  '@openxr_hal': [],
  '@orbital': [],
  '@package_signing': ['authority:own'],
  '@pagerduty': [],
  '@partner_sdk': [],
  '@patrol': ['agent:spawn', 'resource:cpu'],
  '@pdf_generate': ['io:read', 'io:write'],
  '@perception': ['agent:spawn', 'resource:cpu'],
  '@permission': ['io:read', 'io:write'],
  '@persistent_anchor': ['state:read', 'state:write'],
  '@photogrammetry': [],
  '@pipeline': [],
  '@plane_detection': ['io:read', 'io:write'],
  '@point_cloud': [],
  '@poi': [],
  '@portable': [],
  '@pose_estimation': ['io:read', 'io:write'],
  '@profiler': ['io:read', 'io:write'],
  '@prompt_template': [],
  '@push_notification': ['io:read', 'io:write'],
  '@query': [],
  '@quota': [],
  '@rag_knowledge': [],
  '@rate_limiter': [],
  '@ray_tracing': [],
  '@rbac': ['authority:own'],
  '@realitykit_mesh': ['render:spawn', 'resource:gpu'],
  '@refund': [],
  '@remote_presence': [],
  '@render_network': ['io:network'],
  '@rest_endpoint': ['io:network'],
  '@retry': [],
  '@reverb_zone': ['audio:play'],
  '@roadmap_node': [],
  '@role': [],
  '@rollback': [],
  '@rollout': [],
  '@rooftop_anchor': [],
  '@room_mesh': ['render:spawn', 'resource:gpu'],
  '@rope': ['physics:force', 'physics:collision'],
  '@rpc': ['io:network'],
  '@rsa_encryption': ['io:read', 'io:write'],
  '@rtl': [],
  '@sandbox_execution': ['io:read', 'io:write'],
  '@scene_graph': [],
  '@scene_reconstruction': ['io:read', 'io:write'],
  '@scheduler': [],
  '@schema_migrate': [],
  '@screen_reader': ['render:spawn', 'resource:gpu'],
  '@screen_space_effects': ['render:spawn', 'resource:gpu'],
  '@script_test': [],
  '@scrollable': [],
  '@seated': [],
  '@secret': ['authority:own'],
  '@sensor': [],
  '@session': ['io:read', 'io:write'],
  '@hologram': [],
  '@shared_anchor': [],
  '@shared_world': [],
  '@shareplay': [],
  '@shell': [],
  '@base': [],
  '@url': [],
  '@slack_alert': [],
  '@slack': [],
  '@slo_monitor': ['state:read'],
  '@sms': ['io:read', 'io:write'],
  '@snapshot_test': ['state:read', 'state:write'],
  '@snapshot': ['state:read', 'state:write'],
  '@soft_body': ['physics:force', 'physics:collision'],
  '@sonification': ['io:read', 'io:write'],
  '@spatial_accessory': ['authority:own'],
  '@spatial_audio_cue': ['audio:play'],
  '@spatial_navigation': ['io:read', 'io:write'],
  '@spatial_persona': [],
  '@spectator': [],
  '@sse': ['io:network'],
  '@sso_saml': ['authority:own'],
  '@stable_diffusion': ['io:read', 'io:write'],
  '@state_machine': ['state:read', 'state:write'],
  '@stream': ['io:network'],
  '@stripe': [],
  '@structured_logger': [],
  '@subscription': ['io:read', 'io:write'],
  '@subsurface_scattering': [],
  '@subtitle': [],
  '@task_queue': [],
  '@tenant': [],
  '@terrain_anchor': ['agent:spawn', 'resource:cpu'],
  '@timeout_guard': [],
  '@timezone': [],
  '@token_gated': [],
  '@transform': ['state:read', 'state:write'],
  '@translation': ['io:read', 'io:write'],
  '@urdf_robot': [],
  '@usd': [],
  '@user_monitor': ['state:read'],
  '@vector_db': [],
  '@vector_search': [],
  '@video_transcode': [],
  '@vision': ['io:read', 'io:write'],
  '@voice_mesh': ['render:spawn', 'resource:gpu'],
  '@voice_proximity': ['audio:play'],
  '@volumetric': ['render:spawn', 'resource:gpu'],
  '@volumetric_video': ['render:spawn', 'resource:gpu'],
  '@volumetric_window': ['render:spawn', 'resource:gpu'],
  '@vps': [],
  '@vulnerability_scanner': [],
  '@wallet': [],
  '@watcher': [],
  '@webhook_out': ['io:network'],
  '@webhook': ['io:network'],
  '@wind': [],
  '@workflow': [],
  '@wot_thing': [],
  '@zero_knowledge_proof': ['authority:own'],
  '@public_hash': [],
};

/**
 * Maps built-in functions to their effect rows.
 */
export const BUILTIN_EFFECTS: Record<string, VREffect[]> = {
  // Object manipulation
  spawn: ['render:spawn', 'resource:memory'],
  destroy: ['render:destroy'],
  clone: ['render:spawn', 'resource:memory'],

  // Physics
  applyForce: ['physics:force'],
  applyImpulse: ['physics:impulse'],
  setVelocity: ['physics:force'],
  teleportTo: ['physics:teleport'],
  setGravity: ['physics:gravity'],

  // Audio
  playSound: ['audio:play'],
  stopSound: ['audio:stop'],
  playSpatial: ['audio:spatial'],
  playMusic: ['audio:global'],

  // State
  setState: ['state:write'],
  getState: ['state:read'],
  setGlobal: ['state:global'],
  persist: ['state:persistent', 'io:write'],
  load: ['state:read', 'io:read'],
  save: ['state:write', 'io:write'],

  // IO
  fetch: ['io:network'],
  httpGet: ['io:network'],
  httpPost: ['io:network', 'io:write'],
  readFile: ['io:read'],
  writeFile: ['io:write'],
  setTimeout: ['io:timer'],
  setInterval: ['io:timer'],

  // Inventory
  giveItem: ['inventory:give'],
  takeItem: ['inventory:take'],
  destroyItem: ['inventory:destroy'],
  tradeWith: ['inventory:trade'],

  // Agent
  spawnAgent: ['agent:spawn', 'resource:cpu'],
  killAgent: ['agent:kill'],
  sendMessage: ['agent:communicate'],
  observe: ['agent:observe'],

  // Authority
  transferOwnership: ['authority:delegate'],
  revokeAccess: ['authority:revoke'],
  claimZone: ['authority:zone'],

  // Resource-heavy operations
  createParticleSystem: ['render:particle', 'resource:gpu'],
  compileShader: ['render:shader', 'resource:gpu'],
  allocateBuffer: ['resource:memory', 'resource:gpu'],

  // Pure functions (no effects)
  'Math.sin': [],
  'Math.cos': [],
  'Math.random': [],
  lerp: [],
  clamp: [],
  distance: [],
  normalize: [],
  dot: [],
  cross: [],
};

// =============================================================================
// INFERENCE ENGINE
// =============================================================================

/** Result of inferring effects for an AST node */
export interface InferredEffects {
  /** The inferred effect row */
  row: EffectRow;
  /** Source of each effect (which trait/function caused it) */
  sources: Map<VREffect, string[]>;
  /** Any warnings generated during inference */
  warnings: string[];
}

/**
 * Infer effects from a list of trait names used by an object/function.
 */
export function inferFromTraits(traitNames: string[]): InferredEffects {
  const allEffects: VREffect[] = [];
  const sources = new Map<VREffect, string[]>();
  const warnings: string[] = [];

  for (const trait of traitNames) {
    const normalized = trait.startsWith('@') ? trait : `@${trait}`;
    const effects = TRAIT_EFFECTS[normalized];
    if (effects) {
      for (const e of effects) {
        allEffects.push(e);
        const existing = sources.get(e) || [];
        existing.push(normalized);
        sources.set(e, existing);
      }
    } else {
      warnings.push(`Unknown trait '${normalized}': cannot infer effects. Assuming pure.`);
    }
  }

  return { row: new EffectRow(allEffects), sources, warnings };
}

/**
 * Infer effects from a list of built-in function calls.
 */
export function inferFromBuiltins(functionNames: string[]): InferredEffects {
  const allEffects: VREffect[] = [];
  const sources = new Map<VREffect, string[]>();
  const warnings: string[] = [];

  for (const fn of functionNames) {
    const effects = BUILTIN_EFFECTS[fn];
    if (effects) {
      for (const e of effects) {
        allEffects.push(e);
        const existing = sources.get(e) || [];
        existing.push(fn);
        sources.set(e, existing);
      }
    }
    // Unknown functions are NOT warned â€” they may be user-defined (checked separately)
  }

  return { row: new EffectRow(allEffects), sources, warnings };
}

/**
 * Compose multiple inferred effect rows into a single row.
 * This is the row-polymorphic union: fn effects = âˆª(callee effects).
 */
export function composeEffects(...inferred: InferredEffects[]): InferredEffects {
  let combined = EffectRow.PURE;
  const allSources = new Map<VREffect, string[]>();
  const allWarnings: string[] = [];

  for (const inf of inferred) {
    combined = combined.union(inf.row);
    for (const [effect, srcs] of inf.sources) {
      const existing = allSources.get(effect) || [];
      allSources.set(effect, [...existing, ...srcs]);
    }
    allWarnings.push(...inf.warnings);
  }

  return { row: combined, sources: allSources, warnings: allWarnings };
}

/**
 * Get the effect declaration for a trait.
 */
export function traitEffectDeclaration(traitName: string): EffectDeclaration {
  const normalized = traitName.startsWith('@') ? traitName : `@${traitName}`;
  const effects = TRAIT_EFFECTS[normalized];
  return {
    declared: effects ? new EffectRow(effects) : EffectRow.PURE,
    origin: effects ? 'annotated' : 'inferred',
  };
}

/**
 * List all known trait names.
 */
export function knownTraits(): string[] {
  return Object.keys(TRAIT_EFFECTS);
}

/**
 * List all known built-in function names.
 */
export function knownBuiltins(): string[] {
  return Object.keys(BUILTIN_EFFECTS);
}
