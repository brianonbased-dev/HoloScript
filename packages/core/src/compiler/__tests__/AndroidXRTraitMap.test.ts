import { describe, it, expect } from 'vitest';
import {
  ANDROIDXR_TRAIT_MAP,
  PHYSICS_TRAIT_MAP,
  INTERACTION_TRAIT_MAP,
  AUDIO_TRAIT_MAP,
  AR_TRAIT_MAP,
  VISUAL_TRAIT_MAP,
  ACCESSIBILITY_TRAIT_MAP,
  UI_TRAIT_MAP,
  ENVIRONMENT_TRAIT_MAP,
  DP3_TRAIT_MAP,
  V43_TRAIT_MAP,
  GLASSES_TRAIT_MAP,
  MULTIPLAYER_TRAIT_MAP,
  AI_TRAIT_MAP,
  getTraitMapping,
  generateTraitCode,
  getRequiredImports,
  getMinSdkVersion,
  listAllTraits,
  listTraitsByLevel,
} from '../AndroidXRTraitMap';

describe('AndroidXRTraitMap', () => {
  // =========== Combined map ===========

  it('ANDROIDXR_TRAIT_MAP includes all sub-maps', () => {
    const allKeys = [
      ...Object.keys(PHYSICS_TRAIT_MAP),
      ...Object.keys(INTERACTION_TRAIT_MAP),
      ...Object.keys(AUDIO_TRAIT_MAP),
      ...Object.keys(AR_TRAIT_MAP),
      ...Object.keys(VISUAL_TRAIT_MAP),
      ...Object.keys(ACCESSIBILITY_TRAIT_MAP),
      ...Object.keys(UI_TRAIT_MAP),
      ...Object.keys(ENVIRONMENT_TRAIT_MAP),
      ...Object.keys(DP3_TRAIT_MAP),
      ...Object.keys(V43_TRAIT_MAP),
      ...Object.keys(GLASSES_TRAIT_MAP),
      ...Object.keys(MULTIPLAYER_TRAIT_MAP),
      ...Object.keys(AI_TRAIT_MAP),
    ];
    for (const key of allKeys) {
      expect(ANDROIDXR_TRAIT_MAP[key]).toBeDefined();
    }
  });

  it('has at least 120 traits mapped', () => {
    const traits = listAllTraits();
    expect(traits.length).toBeGreaterThanOrEqual(120);
  });

  it('listAllTraits returns all trait names', () => {
    const traits = listAllTraits();
    expect(traits.length).toBe(Object.keys(ANDROIDXR_TRAIT_MAP).length);
    expect(traits).toContain('collidable');
    expect(traits).toContain('grabbable');
    expect(traits).toContain('pathfinding');
    expect(traits).toContain('state_sync');
  });

  // =========== getTraitMapping ===========

  it('returns mapping for known trait', () => {
    const mapping = getTraitMapping('collidable');
    expect(mapping).toBeDefined();
    expect(mapping!.trait).toBe('collidable');
    expect(mapping!.components).toContain('CollisionComponent');
  });

  it('returns undefined for unknown trait', () => {
    expect(getTraitMapping('nonexistent')).toBeUndefined();
  });

  // =========== generateTraitCode ===========

  it('generates Kotlin code for physics trait', () => {
    const code = generateTraitCode('physics', 'myEntity', { mode: 'dynamic' });
    expect(code.length).toBeGreaterThan(0);
    expect(code.some((l) => l.includes('myEntity'))).toBe(true);
    expect(code.some((l) => l.includes('PhysicsComponent'))).toBe(true);
  });

  it('generates fallback comment for unknown trait', () => {
    const code = generateTraitCode('unknown_trait', 'entity', { x: 1 });
    expect(code.length).toBe(1);
    expect(code[0]).toContain('no Android XR mapping defined');
  });

  // =========== Physics traits ===========

  it('generates cloth PBD simulation code', () => {
    const code = generateTraitCode('cloth', 'flag', { stiffness: 0.9, width: 30, height: 30 });
    expect(code.some((l) => l.includes('PBDClothSimulation'))).toBe(true);
    expect(code.some((l) => l.includes('GLES31'))).toBe(true);
    expect(code.some((l) => l.includes('GL_COMPUTE_SHADER'))).toBe(true);
  });

  it('generates soft body XPBD code', () => {
    const code = generateTraitCode('soft_body', 'jelly', { compliance: 0.001, substeps: 8 });
    expect(code.some((l) => l.includes('XPBDSoftBodySolver'))).toBe(true);
    expect(code.some((l) => l.includes('Lagrange multipliers'))).toBe(true);
  });

  it('generates fluid SPH simulation code', () => {
    const code = generateTraitCode('fluid', 'water', { particle_count: 50000 });
    expect(code.some((l) => l.includes('SPHFluidSimulation'))).toBe(true);
    expect(code.some((l) => l.includes('Spatial hashing'))).toBe(true);
    expect(code.some((l) => l.includes('densityProgram'))).toBe(true);
  });

  it('generates PBD constraint code', () => {
    const code = generateTraitCode('pbd_constraint', 'spring', {
      type: 'distance',
      stiffness: 0.8,
    });
    expect(code.some((l) => l.includes('PBDConstraint'))).toBe(true);
    expect(code.some((l) => l.includes('DISTANCE'))).toBe(true);
  });

  it('generates XPBD solver code', () => {
    const code = generateTraitCode('xpbd_solver', 'sim', { substeps: 10 });
    expect(code.some((l) => l.includes('XPBDSolver'))).toBe(true);
    expect(code.some((l) => l.includes('substeps = 10'))).toBe(true);
  });

  it('generates SPH pressure kernel code', () => {
    const code = generateTraitCode('sph_pressure', 'fluid', { gas_constant: 3000 });
    expect(code.some((l) => l.includes('SPHPressureKernel'))).toBe(true);
    expect(code.some((l) => l.includes('Poly6 kernel'))).toBe(true);
  });

  it('generates rigid body chain code', () => {
    const code = generateTraitCode('rigid_body_chain', 'chain', { link_count: 20 });
    expect(code.some((l) => l.includes('0 until 20'))).toBe(true);
    expect(code.some((l) => l.includes('JointConstraint'))).toBe(true);
  });

  it('generates ragdoll code', () => {
    const code = generateTraitCode('ragdoll', 'enemy', { bone_count: 20 });
    expect(code.some((l) => l.includes('RagdollController'))).toBe(true);
    expect(code.some((l) => l.includes('buildFromSkeleton'))).toBe(true);
  });

  it('generates buoyancy code', () => {
    const code = generateTraitCode('buoyancy', 'boat', { water_level: -1.0 });
    expect(code.some((l) => l.includes('BuoyancyComponent'))).toBe(true);
    expect(code.some((l) => l.includes('buoyancyForce'))).toBe(true);
  });

  it('generates wind force code', () => {
    const code = generateTraitCode('wind_force', 'tree', { direction: [1, 0, 0.5], strength: 8 });
    expect(code.some((l) => l.includes('WindForce'))).toBe(true);
    expect(code.some((l) => l.includes('SimplexNoise'))).toBe(true);
  });

  it('generates gravity zone code', () => {
    const code = generateTraitCode('gravity_zone', 'planet', { gravity: [0, -20, 0], radius: 15 });
    expect(code.some((l) => l.includes('GravityZone'))).toBe(true);
    expect(code.some((l) => l.includes('getEntitiesInRange'))).toBe(true);
  });

  // =========== Audio traits ===========

  it('generates reverb zone code', () => {
    const code = generateTraitCode('reverb_zone', 'hall', { preset: 'largeHall' });
    expect(code.some((l) => l.includes('EnvironmentalReverb'))).toBe(true);
    expect(code.some((l) => l.includes('PresetReverb'))).toBe(true);
  });

  it('generates audio occlusion code', () => {
    const code = generateTraitCode('audio_occlusion', 'src', { attenuation: 0.2 });
    expect(code.some((l) => l.includes('AudioOcclusionProcessor'))).toBe(true);
    expect(code.some((l) => l.includes('raycastOcclusion'))).toBe(true);
  });

  it('generates audio filter code', () => {
    const code = generateTraitCode('audio_filter', 'music', { type: 'equalizer' });
    expect(code.some((l) => l.includes('Equalizer'))).toBe(true);
    expect(code.some((l) => l.includes('BassBoost'))).toBe(true);
  });

  it('generates audio mixer code', () => {
    const code = generateTraitCode('audio_mixer', 'mix', { channels: 16 });
    expect(code.some((l) => l.includes('setMaxStreams(16)'))).toBe(true);
  });

  it('generates doppler effect code', () => {
    const code = generateTraitCode('doppler_effect', 'car', { speed_of_sound: 340 });
    expect(code.some((l) => l.includes('Doppler'))).toBe(true);
    expect(code.some((l) => l.includes('pitchShift'))).toBe(true);
  });

  it('generates audio zone code', () => {
    const code = generateTraitCode('audio_zone', 'room', { radius: 10 });
    expect(code.some((l) => l.includes('ZoneRadius'))).toBe(true);
    expect(code.some((l) => l.includes('FadeDist'))).toBe(true);
  });

  it('generates voice synthesis code', () => {
    const code = generateTraitCode('voice_synthesis', 'narrator', { pitch: 1.2 });
    expect(code.some((l) => l.includes('TextToSpeech'))).toBe(true);
  });

  it('generates audio reverb code', () => {
    const code = generateTraitCode('audio_reverb', 'cave', { wet_mix: 0.6 });
    expect(code.some((l) => l.includes('EnvironmentalReverb'))).toBe(true);
  });

  // =========== Rendering traits ===========

  it('generates instancing code', () => {
    const code = generateTraitCode('instancing', 'trees', { count: 500 });
    expect(code.some((l) => l.includes('InstanceCount = 500'))).toBe(true);
    expect(code.some((l) => l.includes('VertexBuffer'))).toBe(true);
  });

  it('generates GPU culling code', () => {
    const code = generateTraitCode('gpu_culling', 'scene', { frustum: true, occlusion: true });
    expect(code.some((l) => l.includes('DepthPrePass.ENABLED'))).toBe(true);
  });

  it('generates screen space reflections code', () => {
    const code = generateTraitCode('screen_space_reflections', 'floor', { quality: 'high' });
    expect(code.some((l) => l.includes('screenSpaceReflectionsOptions'))).toBe(true);
  });

  it('generates volumetric fog code', () => {
    const code = generateTraitCode('volumetric_fog', 'atmosphere', { density: 0.05 });
    expect(code.some((l) => l.includes('fogOptions'))).toBe(true);
    expect(code.some((l) => l.includes('0.05f'))).toBe(true);
  });

  it('generates decal projector code', () => {
    const code = generateTraitCode('decal_projector', 'blood', { texture: 'splat.png' });
    expect(code.some((l) => l.includes('DecalTexture'))).toBe(true);
  });

  it('generates wireframe code', () => {
    const code = generateTraitCode('wireframe', 'debug', {});
    expect(code.some((l) => l.includes('wireframeMaterialData'))).toBe(true);
  });

  it('generates outline code', () => {
    const code = generateTraitCode('outline', 'selected', { color: '#ff0000', width: 3 });
    expect(code.some((l) => l.includes('outlineMaterialData'))).toBe(true);
    expect(code.some((l) => l.includes('outlineWidth'))).toBe(true);
  });

  it('generates bloom code', () => {
    const code = generateTraitCode('bloom', 'glow', { intensity: 0.8 });
    expect(code.some((l) => l.includes('bloomOptions'))).toBe(true);
    expect(code.some((l) => l.includes('strength = 0.8f'))).toBe(true);
  });

  it('generates chromatic aberration code', () => {
    const code = generateTraitCode('chromatic_aberration', 'lens', { intensity: 0.3 });
    expect(code.some((l) => l.includes('chromaticAberrationData'))).toBe(true);
  });

  it('generates depth of field code', () => {
    const code = generateTraitCode('depth_of_field', 'cam', { focus_distance: 5.0 });
    expect(code.some((l) => l.includes('depthOfFieldOptions'))).toBe(true);
    expect(code.some((l) => l.includes('focusDistance = 5f'))).toBe(true);
  });

  it('generates color grading code', () => {
    const code = generateTraitCode('color_grading', 'scene', { tone_mapping: 'FILMIC' });
    expect(code.some((l) => l.includes('ColorGrading.Builder'))).toBe(true);
    expect(code.some((l) => l.includes('FILMIC'))).toBe(true);
  });

  it('generates particle emitter code', () => {
    const code = generateTraitCode('particle_emitter', 'fire', { rate: 200, max_particles: 5000 });
    expect(code.some((l) => l.includes('GL_SHADER_STORAGE_BUFFER'))).toBe(true);
    expect(code.some((l) => l.includes('particleEmitShaderSource'))).toBe(true);
  });

  it('generates shadow caster with RenderableManager', () => {
    const code = generateTraitCode('shadow_caster', 'obj', {});
    expect(code.some((l) => l.includes('setCastShadows'))).toBe(true);
    expect(code.some((l) => l.includes('setScreenSpaceContactShadows'))).toBe(true);
  });

  // =========== Multiplayer traits ===========

  it('generates state sync code', () => {
    const code = generateTraitCode('state_sync', 'game', {
      strategy: 'P2P_CLUSTER',
      sync_rate: 30,
    });
    expect(code.some((l) => l.includes('Nearby.getConnectionsClient'))).toBe(true);
    expect(code.some((l) => l.includes('P2P_CLUSTER'))).toBe(true);
    expect(code.some((l) => l.includes('sendPayload'))).toBe(true);
  });

  it('generates voice chat code', () => {
    const code = generateTraitCode('voice_chat', 'vc', { spatial: true, codec: 'OPUS' });
    expect(code.some((l) => l.includes('AudioRecord'))).toBe(true);
    expect(code.some((l) => l.includes('VOICE_COMMUNICATION'))).toBe(true);
    expect(code.some((l) => l.includes('PointSourceParams'))).toBe(true);
  });

  it('generates lobby code', () => {
    const code = generateTraitCode('lobby', 'room', { max_players: 12 });
    expect(code.some((l) => l.includes('MaxPlayers = 12'))).toBe(true);
    expect(code.some((l) => l.includes('HostLobby'))).toBe(true);
  });

  it('generates networked physics code', () => {
    const code = generateTraitCode('networked_physics', 'ball', { authority: 'host' });
    expect(code.some((l) => l.includes('PhysicsState'))).toBe(true);
    expect(code.some((l) => l.includes('InterpolateState'))).toBe(true);
  });

  it('generates networked transform code', () => {
    const code = generateTraitCode('networked_transform', 'avatar', { sync_rate: 20 });
    expect(code.some((l) => l.includes('TransformSyncJob'))).toBe(true);
    expect(code.some((l) => l.includes('broadcastPayload'))).toBe(true);
  });

  it('generates spectator mode code', () => {
    const code = generateTraitCode('spectator_mode', 'cam', {});
    expect(code.some((l) => l.includes('EnterSpectatorMode'))).toBe(true);
    expect(code.some((l) => l.includes('ExitSpectatorMode'))).toBe(true);
  });

  it('generates shared anchor code', () => {
    const code = generateTraitCode('shared_anchor', 'table', { persistent: true });
    expect(code.some((l) => l.includes('Anchor.create'))).toBe(true);
    expect(code.some((l) => l.includes('anchor.persist'))).toBe(true);
    expect(code.some((l) => l.includes('broadcastPayload'))).toBe(true);
  });

  // =========== AI traits ===========

  it('generates pathfinding code', () => {
    const code = generateTraitCode('pathfinding', 'npc', {
      algorithm: 'a_star',
      agent_radius: 0.5,
    });
    expect(code.some((l) => l.includes('NavigationMesh'))).toBe(true);
    expect(code.some((l) => l.includes('findPath'))).toBe(true);
    expect(code.some((l) => l.includes('A_STAR'))).toBe(true);
  });

  it('generates dialogue system code', () => {
    const code = generateTraitCode('dialogue_system', 'npc', { backend: 'gemini_nano' });
    expect(code.some((l) => l.includes('DialogueEntry'))).toBe(true);
    expect(code.some((l) => l.includes('GenerateResponse'))).toBe(true);
    expect(code.some((l) => l.includes('GeminiNano'))).toBe(true);
  });

  it('generates behavior tree code', () => {
    const code = generateTraitCode('behavior_tree', 'ai', { tick_rate: 20 });
    expect(code.some((l) => l.includes('BTNode'))).toBe(true);
    expect(code.some((l) => l.includes('Sequence'))).toBe(true);
    expect(code.some((l) => l.includes('Selector'))).toBe(true);
  });

  it('generates GOAP planner code', () => {
    const code = generateTraitCode('goal_planner', 'guard', { max_depth: 15 });
    expect(code.some((l) => l.includes('WorldState'))).toBe(true);
    expect(code.some((l) => l.includes('A* search'))).toBe(true);
    expect(code.some((l) => l.includes('PriorityQueue'))).toBe(true);
  });

  it('generates NPC perception code', () => {
    const code = generateTraitCode('npc_perception', 'sentry', {
      view_angle: 90,
      view_distance: 20,
    });
    expect(code.some((l) => l.includes('PerceivedEntity'))).toBe(true);
    expect(code.some((l) => l.includes('Vision cone check'))).toBe(true);
    expect(code.some((l) => l.includes('Hearing check'))).toBe(true);
  });

  it('generates gesture recognition code', () => {
    const code = generateTraitCode('gesture_recognition', 'hand', { gestures: ['pinch', 'fist'] });
    expect(code.some((l) => l.includes('ClassifyGesture'))).toBe(true);
    expect(code.some((l) => l.includes('PINCH'))).toBe(true);
    expect(code.some((l) => l.includes('FIST'))).toBe(true);
  });

  it('generates speech to text code', () => {
    const code = generateTraitCode('speech_to_text', 'mic', { language: 'en-US' });
    expect(code.some((l) => l.includes('SpeechRecognizer'))).toBe(true);
    expect(code.some((l) => l.includes('RecognizerIntent'))).toBe(true);
  });

  it('generates text to speech code', () => {
    const code = generateTraitCode('text_to_speech', 'speaker', { language: 'en-US' });
    expect(code.some((l) => l.includes('TextToSpeech'))).toBe(true);
    expect(code.some((l) => l.includes('Speak'))).toBe(true);
  });

  it('generates NPC steering code', () => {
    const code = generateTraitCode('npc_steering', 'agent', { max_speed: 5 });
    expect(code.some((l) => l.includes('Seek'))).toBe(true);
    expect(code.some((l) => l.includes('Flee'))).toBe(true);
    expect(code.some((l) => l.includes('Arrive'))).toBe(true);
    expect(code.some((l) => l.includes('Wander'))).toBe(true);
  });

  it('generates emotion system code', () => {
    const code = generateTraitCode('emotion_system', 'npc', { decay_rate: 0.05 });
    expect(code.some((l) => l.includes('EmotionState'))).toBe(true);
    expect(code.some((l) => l.includes('GetDominantEmotion'))).toBe(true);
  });

  it('generates upgraded ai_npc_brain code (not comment-only)', () => {
    const mapping = getTraitMapping('ai_npc_brain');
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('ai_npc_brain', 'npc', { model: 'gemini-nano' });
    expect(code.some((l) => l.includes('NPCBrain'))).toBe(true);
    expect(code.some((l) => l.includes('Think'))).toBe(true);
  });

  it('embedding_search emits SQLite FTS stub when feature flag enabled', () => {
    const mapping = getTraitMapping('embedding_search');
    expect(mapping!.level).toBe('full');

    const code = generateTraitCode('embedding_search', 'searchNode', {
      dimensions: 384,
      enable_sqlite_fts_stub: true,
      table: 'city_vectors',
    });

    expect(code.some((l) => l.includes('SQLiteOpenHelper'))).toBe(true);
    expect(code.some((l) => l.includes('CREATE VIRTUAL TABLE'))).toBe(true);
    expect(code.some((l) => l.includes('city_vectors'))).toBe(true);
  });

  it('embedding_search generates ANN retrieval when feature flag disabled', () => {
    const code = generateTraitCode('embedding_search', 'searchNode', {
      dimensions: 384,
      enable_sqlite_fts_stub: false,
    });

    expect(code.some((l) => l.includes('CosineSimilarity'))).toBe(true);
    expect(code.some((l) => l.includes('AnnSearch'))).toBe(true);
  });

  // =========== Upgraded traits ===========

  it('portal upgraded to full', () => {
    const mapping = getTraitMapping('portal');
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('portal', 'gateway', { target_world: 'dungeon' });
    expect(code.some((l) => l.includes('stencil'))).toBe(true);
  });

  it('spatial_persona upgraded to full', () => {
    const mapping = getTraitMapping('spatial_persona');
    expect(mapping!.level).toBe('full');
  });

  it('vision upgraded to full -- generates ML Kit code for classification', () => {
    const mapping = getTraitMapping('vision');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('vision', 'camNode', { task: 'classification' });
    expect(code.some((l) => l.includes('ImageLabeling'))).toBe(true);
    expect(code.some((l) => l.includes('camNode'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('vision generates ML Kit text recognition for text_recognition task', () => {
    const code = generateTraitCode('vision', 'docScanner', { task: 'text_recognition' });
    expect(code.some((l) => l.includes('TextRecognition'))).toBe(true);
    expect(code.some((l) => l.includes('docScanner'))).toBe(true);
  });

  it('vision generates ML Kit face detection for face_detection task', () => {
    const code = generateTraitCode('vision', 'faceNode', { task: 'face_detection' });
    expect(code.some((l) => l.includes('FaceDetection'))).toBe(true);
    expect(code.some((l) => l.includes('faceNode'))).toBe(true);
  });

  it('ai_vision upgraded to full -- generates ObjectDetector when no model specified', () => {
    const mapping = getTraitMapping('ai_vision');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('ai_vision', 'detector', {});
    expect(code.some((l) => l.includes('ObjectDetection'))).toBe(true);
    expect(code.some((l) => l.includes('detector'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('ai_vision generates TFLite Interpreter when model asset provided', () => {
    const code = generateTraitCode('ai_vision', 'aiCam', { model: 'my_model.tflite' });
    expect(code.some((l) => l.includes('Interpreter'))).toBe(true);
    expect(code.some((l) => l.includes('my_model.tflite'))).toBe(true);
    expect(code.some((l) => l.includes('aiCam'))).toBe(true);
  });

  it('shareplay upgraded to full', () => {
    const mapping = getTraitMapping('shareplay');
    expect(mapping!.level).toBe('full');
  });

  it('object_tracking upgraded to full', () => {
    const mapping = getTraitMapping('object_tracking');
    expect(mapping!.level).toBe('full');
  });

  it('spatial_navigation upgraded to full', () => {
    const mapping = getTraitMapping('spatial_navigation');
    expect(mapping!.level).toBe('full');
  });

  // =========== getRequiredImports ===========

  it('collects imports from multiple traits', () => {
    const imports = getRequiredImports(['physics', 'audio', 'hand_tracking']);
    expect(imports.length).toBeGreaterThan(3);
    expect(imports).toContain('android.media.SoundPool');
  });

  // =========== getMinSdkVersion ===========

  it('returns max SDK version across traits', () => {
    const sdk = getMinSdkVersion(['face_tracking', 'drm_video']);
    expect(sdk).toBe(30);
  });

  it('returns default for traits without minSdkVersion', () => {
    const sdk = getMinSdkVersion(['grabbable']);
    expect(sdk).toBe(26);
  });

  // =========== listTraitsByLevel ===========

  it('lists partial traits (should include new physics/audio/rendering/multiplayer/AI)', () => {
    const partial = listTraitsByLevel('partial');
    expect(partial).not.toContain('cloth');
    expect(partial).not.toContain('collidable');
    expect(partial).not.toContain('physics');
    expect(partial).not.toContain('static');
    expect(partial).not.toContain('kinematic');
    expect(partial).not.toContain('soft_body');
    expect(partial).not.toContain('fluid');
    expect(partial).not.toContain('pbd_constraint');
    expect(partial).not.toContain('xpbd_solver');
    expect(partial).not.toContain('sph_pressure');
    expect(partial).not.toContain('reverb_zone');
    expect(partial).not.toContain('audio_occlusion');
    // batch 12 promoted
    expect(partial).not.toContain('mesh_detection');
    expect(partial).not.toContain('eye_tracking');
    expect(partial).not.toContain('occlusion');
    expect(partial).not.toContain('geospatial');
    expect(partial).not.toContain('billboard');
    expect(partial).not.toContain('particle_emitter');
    expect(partial).not.toContain('lod');
    expect(partial).not.toContain('shadow_caster');
    expect(partial).not.toContain('shadow_receiver');
    expect(partial).not.toContain('instancing');
    // batch 13 promoted
    expect(partial).not.toContain('gpu_culling');
    expect(partial).not.toContain('screen_space_reflections');
    expect(partial).not.toContain('volumetric_fog');
    expect(partial).not.toContain('decal_projector');
    expect(partial).not.toContain('wireframe');
    expect(partial).not.toContain('outline');
    expect(partial).not.toContain('bloom');
    expect(partial).not.toContain('chromatic_aberration');
    expect(partial).not.toContain('depth_of_field');
    expect(partial).not.toContain('color_grading');
    // batch 14 promoted
    expect(partial).not.toContain('ui_hand_menu');
    expect(partial).not.toContain('ui_billboard');
    expect(partial).not.toContain('portal');
    expect(partial).not.toContain('spatial_persona');
    expect(partial).not.toContain('shareplay');
    expect(partial).not.toContain('object_tracking');
    expect(partial).not.toContain('scene_reconstruction');
    expect(partial).not.toContain('spatial_navigation');
    expect(partial).not.toContain('eye_tracked');
    expect(partial).not.toContain('eye_hand_fusion');
    // batch 15
    expect(partial).not.toContain('controlnet');
    expect(partial).not.toContain('ai_texture_gen');
    expect(partial).not.toContain('diffusion_realtime');
    expect(partial).not.toContain('ai_upscaling');
    expect(partial).not.toContain('ai_inpainting');
    expect(partial).not.toContain('neural_link');
    expect(partial).not.toContain('neural_forge');
    expect(partial).not.toContain('embedding_search');
    expect(partial).not.toContain('ai_npc_brain');
    expect(partial).not.toContain('vector_db');
    expect(partial).not.toContain('vision');
    expect(partial).not.toContain('spatial_awareness');
    expect(partial).not.toContain('neural_animation');
    expect(partial).not.toContain('ai_vision');
    expect(partial).not.toContain('state_sync');
    expect(partial).not.toContain('voice_chat');
    expect(partial).not.toContain('lobby');
    expect(partial).not.toContain('networked_physics');
    expect(partial).not.toContain('networked_transform');
    expect(partial).not.toContain('spectator_mode');
    expect(partial).not.toContain('shared_anchor');
    expect(partial).toContain('pathfinding');
    expect(partial).toContain('behavior_tree');
  });

  // =========== Every trait generates non-empty code ===========

  it('every mapped trait generates at least one line of code', () => {
    const traits = listAllTraits();
    // visible trait returns empty array when visible=true (default) -- this is intentional
    const emptyWhenDefault = new Set(['visible']);
    for (const trait of traits) {
      if (emptyWhenDefault.has(trait)) continue;
      const code = generateTraitCode(trait, 'testEntity', {});
      expect(code.length, `trait "${trait}" should generate code`).toBeGreaterThan(0);
    }
  });

  it('every trait references the varName in output', () => {
    const traits = listAllTraits();
    // Some traits like ai_inpainting don't use varName; skip those
    const exceptions = new Set([
      'ai_inpainting',
      'neural_forge',
      'vector_db',
      'visible',
      'invisible',
    ]);
    for (const trait of traits) {
      if (exceptions.has(trait)) continue;
      const code = generateTraitCode(trait, 'myTestVar', {});
      const joined = code.join('\n');
      expect(
        joined.includes('myTestVar') || joined.includes('@'),
        `trait "${trait}" should reference varName`
      ).toBe(true);
    }
  });

  it('ai_upscaling is full and generates TFLite Interpreter for super resolution', () => {
    const mapping = getTraitMapping('ai_upscaling');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('ai_upscaling', 'upscaler', {});
    expect(code.some((l) => l.includes('Interpreter'))).toBe(true);
    expect(code.some((l) => l.includes('upscaler'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('ai_upscaling uses custom model asset when provided', () => {
    const code = generateTraitCode('ai_upscaling', 'hdTex', { model: 'my_sr_model.tflite' });
    expect(code.some((l) => l.includes('my_sr_model.tflite'))).toBe(true);
  });

  it('ai_inpainting is full and generates TFLite inpainting func', () => {
    const mapping = getTraitMapping('ai_inpainting');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('ai_inpainting', 'restore', {});
    expect(code.some((l) => l.includes('Interpreter'))).toBe(true);
    expect(code.some((l) => l.includes('restore'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('ai_inpainting uses custom model asset when provided', () => {
    const code = generateTraitCode('ai_inpainting', 'fixer', { model: 'custom_inpaint.tflite' });
    expect(code.some((l) => l.includes('custom_inpaint.tflite'))).toBe(true);
  });
});

describe('AndroidXRTraitMap — Upgraded Audio Traits (batch 4)', () => {
  it('audio_reverb is full and generates EnvironmentalReverb setup', () => {
    const mapping = getTraitMapping('audio_reverb');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('audio_reverb', 'room', { wet_mix: 0.5, room_size: 0.8 });
    expect(code.some((l) => l.includes('EnvironmentalReverb'))).toBe(true);
    expect(code.some((l) => l.includes('roomReverb'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('audio_reverb declares EnvironmentalReverb import', () => {
    const imports = getRequiredImports(['audio_reverb']);
    expect(imports).toContain('android.media.audiofx.EnvironmentalReverb');
  });

  it('reverb_zone is full and generates both EnvironmentalReverb and PresetReverb', () => {
    const mapping = getTraitMapping('reverb_zone');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('reverb_zone', 'hall', { preset: 'largeHall', decay_time: 2000 });
    expect(code.some((l) => l.includes('EnvironmentalReverb'))).toBe(true);
    expect(code.some((l) => l.includes('PresetReverb'))).toBe(true);
    expect(code.some((l) => l.includes('hallReverb'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('reverb_zone uses correct preset constant for largeHall', () => {
    const code = generateTraitCode('reverb_zone', 'hall', { preset: 'largeHall' });
    expect(code.some((l) => l.includes('PRESET_LARGEHALL'))).toBe(true);
  });

  it('audio_occlusion is full and generates AudioOcclusionProcessor with raycast', () => {
    const mapping = getTraitMapping('audio_occlusion');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('audio_occlusion', 'src', { attenuation: 0.2, low_pass_cutoff: 600 });
    expect(code.some((l) => l.includes('AudioOcclusionProcessor'))).toBe(true);
    expect(code.some((l) => l.includes('raycastOcclusion'))).toBe(true);
    expect(code.some((l) => l.includes('srcSoundPool') || l.includes('setVolume'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('audio_occlusion declares SpatialSoundPool import', () => {
    const imports = getRequiredImports(['audio_occlusion']);
    expect(imports.some((i) => i.includes('SpatialSoundPool'))).toBe(true);
  });
});

describe('AndroidXRTraitMap — Upgraded Physics Traits (batch 5)', () => {
  it('collidable is full and generates InteractableComponent with event handler', () => {
    const mapping = getTraitMapping('collidable');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('collidable', 'box', { mode: 'trigger' });
    expect(code.some((l) => l.includes('InteractableComponent'))).toBe(true);
    expect(code.some((l) => l.includes('addComponent'))).toBe(true);
  });

  it('collidable mode is embedded in output', () => {
    const code = generateTraitCode('collidable', 'box', { mode: 'sensor' });
    expect(code.some((l) => l.includes('sensor'))).toBe(true);
  });

  it('physics is full and generates PhysicsComponent with mass, friction, restitution', () => {
    const mapping = getTraitMapping('physics');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('physics', 'ball', { mass: 2.5, friction: 0.4, restitution: 0.6 });
    expect(code.some((l) => l.includes('PhysicsComponent'))).toBe(true);
    expect(code.some((l) => l.includes('2.5'))).toBe(true);
    expect(code.some((l) => l.includes('0.4'))).toBe(true);
    expect(code.some((l) => l.includes('0.6'))).toBe(true);
  });

  it('physics defaults to dynamic mode', () => {
    const code = generateTraitCode('physics', 'obj', {});
    expect(code.some((l) => l.includes('DYNAMIC'))).toBe(true);
  });

  it('static is full and generates STATIC PhysicsMode', () => {
    const mapping = getTraitMapping('static');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('static', 'wall', {});
    expect(code.some((l) => l.includes('PhysicsMode.STATIC'))).toBe(true);
    expect(code.some((l) => l.includes('addComponent'))).toBe(true);
  });

  it('kinematic is full and generates KINEMATIC PhysicsMode', () => {
    const mapping = getTraitMapping('kinematic');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('kinematic', 'platform', {});
    expect(code.some((l) => l.includes('PhysicsMode.KINEMATIC'))).toBe(true);
  });

  it('cloth is full and generates PBDClothSimulation with GLES31 compute dispatch', () => {
    const mapping = getTraitMapping('cloth');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('cloth', 'flag', { stiffness: 0.7, width: 30, height: 30 });
    expect(code.some((l) => l.includes('PBDClothSimulation'))).toBe(true);
    expect(code.some((l) => l.includes('GLES31'))).toBe(true);
    expect(code.some((l) => l.includes('glDispatchCompute'))).toBe(true);
  });

  it('cloth embeds grid dimensions from config', () => {
    const code = generateTraitCode('cloth', 'sheet', { width: 40, height: 50 });
    expect(code.some((l) => l.includes('40'))).toBe(true);
    expect(code.some((l) => l.includes('50'))).toBe(true);
  });
});


describe('AndroidXRTraitMap — Upgraded Advanced Physics Traits (batch 6)', () => {
  it('soft_body is full and generates XPBDSoftBodySolver with GLES31 dispatch', () => {
    const mapping = getTraitMapping('soft_body');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('soft_body', 'jelly', { substeps: 6, compliance: 0.0002 });
    expect(code.some((l) => l.includes('XPBDSoftBodySolver'))).toBe(true);
    expect(code.some((l) => l.includes('GLES31'))).toBe(true);
    expect(code.some((l) => l.includes('6'))).toBe(true);
  });

  it('fluid is full and generates SPHFluidSimulation with 3-pass compute', () => {
    const mapping = getTraitMapping('fluid');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('fluid', 'water', { particle_count: 8000, viscosity: 0.03 });
    expect(code.some((l) => l.includes('SPHFluidSimulation'))).toBe(true);
    expect(code.some((l) => l.includes('GLES31'))).toBe(true);
    expect(code.some((l) => l.includes('8000'))).toBe(true);
  });

  it('pbd_constraint is full and generates PBDConstraint with projection formula', () => {
    const mapping = getTraitMapping('pbd_constraint');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('pbd_constraint', 'rope', { type: 'distance', stiffness: 0.9, rest_length: 2.0 });
    expect(code.some((l) => l.includes('PBDConstraint'))).toBe(true);
    expect(code.some((l) => l.includes('distance') || l.includes('DISTANCE'))).toBe(true);
    expect(code.some((l) => l.includes('0.9'))).toBe(true);
  });

  it('xpbd_solver is full and generates XPBDSolver with substep loop', () => {
    const mapping = getTraitMapping('xpbd_solver');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('xpbd_solver', 'body', { substeps: 8, gravity: -9.81, max_particles: 50000 });
    expect(code.some((l) => l.includes('XPBDSolver'))).toBe(true);
    expect(code.some((l) => l.includes('8'))).toBe(true);
    expect(code.some((l) => l.includes('step') || l.includes('bindEntity'))).toBe(true);
  });

  it('sph_pressure is full and generates SPHPressureKernel with poly6', () => {
    const mapping = getTraitMapping('sph_pressure');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('sph_pressure', 'fluid', { kernel_radius: 0.05, gas_constant: 2000, rest_density: 1000 });
    expect(code.some((l) => l.includes('SPHPressureKernel'))).toBe(true);
    expect(code.some((l) => l.includes('2000'))).toBe(true);
    expect(code.some((l) => l.includes('attachTo') || l.includes('Pressure'))).toBe(true);
  });

  describe('AndroidXR batch 12 \u2014 AR perception + rendering traits', () => {
    it('mesh_detection is full and generates ARCore mesh reconstruction', () => {
      const mapping = getTraitMapping('mesh_detection');
      expect(mapping).toBeDefined();
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('mesh_detection', 'scene', {});
      expect(code.some((l) => l.includes('createMeshReconstruction') || l.includes('mesh'))).toBe(true);
    });

    it('eye_tracking is full and generates InteractableComponent hover events', () => {
      const mapping = getTraitMapping('eye_tracking');
      expect(mapping).toBeDefined();
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('eye_tracking', 'btn', {});
      expect(code.some((l) => l.includes('InteractableComponent'))).toBe(true);
      expect(code.some((l) => l.includes('HOVER_ENTER') || l.includes('HOVER_EXIT'))).toBe(true);
    });

    it('occlusion is full and generates ARCore depth occlusion', () => {
      const mapping = getTraitMapping('occlusion');
      expect(mapping).toBeDefined();
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('occlusion', 'wall', {});
      expect(code.some((l) => l.includes('depthMode') || l.includes('DepthMode'))).toBe(true);
    });

    it('geospatial is full and generates Earth geospatial anchor', () => {
      const mapping = getTraitMapping('geospatial');
      expect(mapping).toBeDefined();
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('geospatial', 'marker', { latitude: 37.7749, longitude: -122.4194, altitude: 10 });
      expect(code.some((l) => l.includes('createAnchor') || l.includes('Earth') || l.includes('earth'))).toBe(true);
      expect(code.some((l) => l.includes('37.7749'))).toBe(true);
    });

    it('billboard is full and generates look-at rotation callback', () => {
      const mapping = getTraitMapping('billboard');
      expect(mapping).toBeDefined();
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('billboard', 'label', {});
      expect(code.some((l) => l.includes('lookRotation') || l.includes('setPose') || l.includes('addOnUpdateListener'))).toBe(true);
    });

    it('particle_emitter is full and generates GPU compute particle system', () => {
      const mapping = getTraitMapping('particle_emitter');
      expect(mapping).toBeDefined();
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('particle_emitter', 'sparks', { rate: 200, max_particles: 2000 });
      expect(code.some((l) => l.includes('GLES31') || l.includes('GL_SHADER_STORAGE_BUFFER'))).toBe(true);
      expect(code.some((l) => l.includes('2000'))).toBe(true);
    });

    it('lod is full and generates distance-based LOD callback', () => {
      const mapping = getTraitMapping('lod');
      expect(mapping).toBeDefined();
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('lod', 'tree', { distances: [3, 20] });
      expect(code.some((l) => l.includes('distance') || l.includes('dist'))).toBe(true);
      expect(code.some((l) => l.includes('3') || l.includes('20'))).toBe(true);
    });

    it('shadow_caster is full and generates Filament setCastShadows', () => {
      const mapping = getTraitMapping('shadow_caster');
      expect(mapping).toBeDefined();
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('shadow_caster', 'obj', {});
      expect(code.some((l) => l.includes('setCastShadows'))).toBe(true);
    });

    it('shadow_receiver is full and generates Filament setReceiveShadows', () => {
      const mapping = getTraitMapping('shadow_receiver');
      expect(mapping).toBeDefined();
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('shadow_receiver', 'floor', {});
      expect(code.some((l) => l.includes('setReceiveShadows'))).toBe(true);
    });

    it('instancing is full and generates GPU instancing with VertexBuffer', () => {
      const mapping = getTraitMapping('instancing');
      expect(mapping).toBeDefined();
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('instancing', 'tree', { count: 500 });
      expect(code.some((l) => l.includes('VertexBuffer') || l.includes('InstanceCount') || l.includes('instanc'))).toBe(true);
      expect(code.some((l) => l.includes('500'))).toBe(true);
    });
  });

  describe('AndroidXR batch 13 -- post-processing + rendering traits', () => {
    it('gpu_culling is full and generates Filament view culling', () => {
      const m = getTraitMapping('gpu_culling');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('gpu_culling', 'scene', { frustum: true, occlusion: false });
      expect(code.some((l) => l.includes('View') || l.includes('culling') || l.includes('Culling') || l.includes('setEnabled'))).toBe(true);
    });
    it('screen_space_reflections is full and generates Filament SSR options', () => {
      const m = getTraitMapping('screen_space_reflections');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('screen_space_reflections', 'view', { quality: 'high' });
      expect(code.some((l) => l.includes('ScreenSpaceReflections') || l.includes('ssrOptions') || l.includes('reflection'))).toBe(true);
    });
    it('volumetric_fog is full and generates Filament FogOptions', () => {
      const m = getTraitMapping('volumetric_fog');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('volumetric_fog', 'scene', { density: 0.05 });
      expect(code.some((l) => l.includes('FogOptions') || l.includes('fog') || l.includes('density'))).toBe(true);
    });
    it('decal_projector is full and generates decal texture projection', () => {
      const m = getTraitMapping('decal_projector');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('decal_projector', 'wall', { texture: 'cracks.png' });
      expect(code.some((l) => l.includes('decal') || l.includes('Decal') || l.includes('Material') || l.includes('texture'))).toBe(true);
    });
    it('wireframe is full and generates wireframe material', () => {
      const m = getTraitMapping('wireframe');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('wireframe', 'mesh', {});
      expect(code.some((l) => l.includes('wireframe') || l.includes('Wireframe') || l.includes('Material'))).toBe(true);
    });
    it('outline is full and generates back-face outline pass', () => {
      const m = getTraitMapping('outline');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('outline', 'obj', { color: '#ff0000', width: 2 });
      expect(code.some((l) => l.includes('outline') || l.includes('Outline') || l.includes('backFace') || l.includes('Material'))).toBe(true);
    });
    it('bloom is full and generates Filament BloomOptions', () => {
      const m = getTraitMapping('bloom');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('bloom', 'view', { strength: 0.5, threshold: 0.8 });
      expect(code.some((l) => l.includes('BloomOptions') || l.includes('bloom') || l.includes('strength'))).toBe(true);
    });
    it('chromatic_aberration is full and generates CA post-process material', () => {
      const m = getTraitMapping('chromatic_aberration');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('chromatic_aberration', 'camera', { offset: 0.005 });
      expect(code.some((l) => l.includes('chromatic') || l.includes('Chromatic') || l.includes('Material') || l.includes('offset'))).toBe(true);
    });
    it('depth_of_field is full and generates Filament DepthOfFieldOptions', () => {
      const m = getTraitMapping('depth_of_field');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('depth_of_field', 'cam', { focus_distance: 3.0, aperture: 2.8 });
      expect(code.some((l) => l.includes('DepthOfField') || l.includes('depthOfField') || l.includes('focusDistance'))).toBe(true);
    });
    it('color_grading is full and generates Filament ColorGrading', () => {
      const m = getTraitMapping('color_grading');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('color_grading', 'view', { exposure: 0.5, contrast: 1.2 });
      expect(code.some((l) => l.includes('ColorGrading') || l.includes('colorGrading') || l.includes('toneMapping'))).toBe(true);
    });
  });

  describe('AndroidXR batch 14 -- UI + AR tracking traits', () => {
    it('ui_hand_menu is full and generates hand-attached panel code', () => {
      const m = getTraitMapping('ui_hand_menu');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('ui_hand_menu', 'menu', { hand: 'right' });
      expect(code.some((l) => l.includes('Hand') || l.includes('palm') || l.includes('handState'))).toBe(true);
    });
    it('ui_billboard is full and generates billboard panel code', () => {
      const m = getTraitMapping('ui_billboard');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('ui_billboard', 'hud', {});
      expect(code.some((l) => l.includes('BillboardComponent') || l.includes('SpatialPanel') || l.includes('billboard'))).toBe(true);
    });
    it('portal is full and generates stencil portal code', () => {
      const m = getTraitMapping('portal');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('portal', 'gate', { target_world: 'cavern', radius: 1.5 });
      expect(code.some((l) => l.includes('portal') || l.includes('stencil') || l.includes('GltfModel'))).toBe(true);
    });
    it('spatial_persona is full and generates avatar tracking code', () => {
      const m = getTraitMapping('spatial_persona');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('spatial_persona', 'avatar', { style: 'cartoon', model: 'hero.glb' });
      expect(code.some((l) => l.includes('GltfModel') || l.includes('avatar') || l.includes('headPose'))).toBe(true);
    });
    it('shareplay is full and generates Nearby Connections code', () => {
      const m = getTraitMapping('shareplay');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('shareplay', 'session', { activity_type: 'chess', max_participants: 2 });
      expect(code.some((l) => l.includes('Nearby') || l.includes('Connection') || l.includes('Payload'))).toBe(true);
    });
    it('object_tracking is full and generates ARCore AugmentedImage code', () => {
      const m = getTraitMapping('object_tracking');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('object_tracking', 'marker', { reference_object: 'Logo', mode: 'image' });
      expect(code.some((l) => l.includes('AugmentedImage') || l.includes('ImageDb') || l.includes('trackingState'))).toBe(true);
    });
    it('scene_reconstruction is full and generates depth-based point cloud code', () => {
      const m = getTraitMapping('scene_reconstruction');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('scene_reconstruction', 'scan', { mode: 'mesh', max_points: 3000 });
      expect(code.some((l) => l.includes('depthImage') || l.includes('PointCloud') || l.includes('depth'))).toBe(true);
    });
    it('spatial_navigation is full and generates InteractableComponent nav code', () => {
      const m = getTraitMapping('spatial_navigation');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('spatial_navigation', 'nav', { mode: 'gaze' });
      expect(code.some((l) => l.includes('NavTarget') || l.includes('InteractableComponent') || l.includes('HOVER'))).toBe(true);
    });
    it('eye_tracked is full and generates hover-based gaze code', () => {
      const m = getTraitMapping('eye_tracked');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('eye_tracked', 'target', {});
      expect(code.some((l) => l.includes('HOVER') || l.includes('gaze') || l.includes('InteractableComponent'))).toBe(true);
    });
    it('eye_hand_fusion is full and generates combined gaze+hand interaction code', () => {
      const m = getTraitMapping('eye_hand_fusion');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('eye_hand_fusion', 'obj', {});
      expect(code.some((l) => l.includes('Hand') || l.includes('HOVER') || l.includes('InteractableComponent') || l.includes('fusion'))).toBe(true);
    });
  });

  describe('batch 15 -- AI generative + neural traits', () => {
    it('controlnet is full and generates TFLite infer function', () => {
      const mapping = getTraitMapping('controlnet');
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('controlnet', 'cn', {});
      expect(code.some((l) => l.includes('ControlNetInfer'))).toBe(true);
      expect(code.some((l) => l.includes('TensorImage') || l.includes('tflite') || l.includes('Interpreter'))).toBe(true);
      expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
    });

    it('controlnet with endpoint generates remote inference path', () => {
      const code = generateTraitCode('controlnet', 'cn', { endpoint: 'http://ml.local' });
      expect(code.some((l) => l.includes('http://ml.local'))).toBe(true);
      expect(code.some((l) => l.includes('HttpURLConnection'))).toBe(true);
    });

    it('ai_texture_gen is full and generates texture function', () => {
      const mapping = getTraitMapping('ai_texture_gen');
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('ai_texture_gen', 'texNode', { style: 'photorealistic' });
      expect(code.some((l) => l.includes('GenerateTexture'))).toBe(true);
      expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
    });

    it('diffusion_realtime is full and generates TFLite diffusion loop', () => {
      const mapping = getTraitMapping('diffusion_realtime');
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('diffusion_realtime', 'diff', { steps: 4 });
      expect(code.some((l) => l.includes('RunDiffusion'))).toBe(true);
      expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
    });

    it('diffusion_realtime with vulkan backend emits Vulkan stub', () => {
      const code = generateTraitCode('diffusion_realtime', 'diff', { backend: 'vulkan' });
      expect(code.some((l) => l.includes('Vulkan') || l.includes('SPIR-V') || l.includes('vulkan'))).toBe(true);
    });

    it('ai_upscaling is full and generates Upscale function', () => {
      const mapping = getTraitMapping('ai_upscaling');
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('ai_upscaling', 'upscaler', { factor: 2 });
      expect(code.some((l) => l.includes('Upscale'))).toBe(true);
      expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
    });

    it('ai_inpainting is full and generates Inpaint function', () => {
      const mapping = getTraitMapping('ai_inpainting');
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('ai_inpainting', 'inpaint', {});
      expect(code.some((l) => l.includes('Inpaint'))).toBe(true);
      expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
    });

    it('neural_link is full and generates BCI callback', () => {
      const mapping = getTraitMapping('neural_link');
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('neural_link', 'bci', { channels: 8, sample_rate: 250 });
      expect(code.some((l) => l.includes('BciCallback'))).toBe(true);
      expect(code.some((l) => l.includes('BandPower'))).toBe(true);
      expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
    });

    it('neural_forge is full and generates NNAPI train step', () => {
      const mapping = getTraitMapping('neural_forge');
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('neural_forge', 'nf', { epochs: 5 });
      expect(code.some((l) => l.includes('TrainStep'))).toBe(true);
      expect(code.some((l) => l.includes('NnApiDelegate'))).toBe(true);
      expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
    });

    it('embedding_search is full and generates cosine similarity ANN search', () => {
      const mapping = getTraitMapping('embedding_search');
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('embedding_search', 'emb', { dimensions: 1536 });
      expect(code.some((l) => l.includes('CosineSimilarity'))).toBe(true);
      expect(code.some((l) => l.includes('AnnSearch'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('ai_npc_brain is full and generates Think function', () => {
      const mapping = getTraitMapping('ai_npc_brain');
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('ai_npc_brain', 'npc', { model: 'gemini-nano' });
      expect(code.some((l) => l.includes('Think'))).toBe(true);
      expect(code.some((l) => l.includes('gemini-nano') || l.includes('GeminiNano'))).toBe(true);
      expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
    });

    it('vector_db is full and generates VDB upsert + query functions', () => {
      const mapping = getTraitMapping('vector_db');
      expect(mapping!.level).toBe('full');
      const code = generateTraitCode('vector_db', 'vdb', { backend: 'chroma' });
      expect(code.some((l) => l.includes('Upsert') || l.includes('upsert'))).toBe(true);
      expect(code.some((l) => l.includes('Query') || l.includes('query'))).toBe(true);
      expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
    });
  });

  // ===========================================================================
  // batch 16 -- vision + spatial AI traits
  // ===========================================================================
  describe('batch 16 -- vision + spatial AI traits', () => {
    it('vision is full and generates ML Kit classification pipeline', () => {
      const m = getTraitMapping('vision');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('vision', 'vis', { task: 'classification' });
      expect(code.length).toBeGreaterThan(0);
      expect(code.some((l) => l.includes('ImageLabeling') || l.includes('Labeler'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('vision generates text_recognition pipeline', () => {
      const code = generateTraitCode('vision', 'vis', { task: 'text_recognition' });
      expect(code.some((l) => l.includes('TextRecognition') || l.includes('Recognizer'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('vision generates face_detection pipeline', () => {
      const code = generateTraitCode('vision', 'vis', { task: 'face_detection' });
      expect(code.some((l) => l.includes('FaceDetection') || l.includes('Detector'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('vision generates barcode pipeline', () => {
      const code = generateTraitCode('vision', 'vis', { task: 'barcode' });
      expect(code.some((l) => l.includes('BarcodeScanning') || l.includes('Scanner'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('vision has required imports', () => {
      const imports = getRequiredImports(['vision']);
      expect(imports.some((i) => i.includes('mlkit'))).toBe(true);
    });

    it('spatial_awareness is full and generates ARCore configuration', () => {
      const m = getTraitMapping('spatial_awareness');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('spatial_awareness', 'sa', {});
      expect(code.length).toBeGreaterThan(0);
      expect(code.some((l) => l.includes('planeFindingMode') || l.includes('depthMode'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('spatial_awareness generates plane detection callback', () => {
      const code = generateTraitCode('spatial_awareness', 'sa', {});
      expect(code.some((l) => l.includes('OnFrame') || l.includes('Trackable') || l.includes('Plane'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('spatial_awareness respects depth_mode config', () => {
      const code = generateTraitCode('spatial_awareness', 'sa', { depth_mode: 'DISABLED' });
      expect(code.some((l) => l.includes('DISABLED'))).toBe(true);
    });

    it('spatial_awareness has ARCore imports', () => {
      const imports = getRequiredImports(['spatial_awareness']);
      expect(imports.some((i) => i.includes('arcore') || i.includes('ar.core'))).toBe(true);
    });

    it('neural_animation is full and generates TFLite inference', () => {
      const m = getTraitMapping('neural_animation');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('neural_animation', 'na', { style: 'motion_matching' });
      expect(code.length).toBeGreaterThan(0);
      expect(code.some((l) => l.includes('Interpreter') || l.includes('tflite'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('neural_animation generates pose application function', () => {
      const code = generateTraitCode('neural_animation', 'na', {});
      expect(code.some((l) => l.includes('ApplyPose') || l.includes('GltfModelEntity'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('neural_animation uses custom style in model asset name', () => {
      const code = generateTraitCode('neural_animation', 'na', { style: 'locomotion' });
      expect(code.some((l) => l.includes('locomotion'))).toBe(true);
    });

    it('neural_animation has TFLite and GltfModelEntity imports', () => {
      const imports = getRequiredImports(['neural_animation']);
      expect(imports.some((i) => i.includes('tflite') || i.includes('tensorflow'))).toBe(true);
      expect(imports.some((i) => i.includes('GltfModelEntity'))).toBe(true);
    });

    it('ai_vision is full and generates ML Kit ObjectDetector', () => {
      const m = getTraitMapping('ai_vision');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
      const code = generateTraitCode('ai_vision', 'aiv', { task: 'detection' });
      expect(code.length).toBeGreaterThan(0);
      expect(code.some((l) => l.includes('ObjectDetect') || l.includes('ObjectDetector'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('ai_vision generates custom TFLite model path when model provided', () => {
      const code = generateTraitCode('ai_vision', 'aiv', { model: 'my_model.tflite' });
      expect(code.some((l) => l.includes('my_model.tflite'))).toBe(true);
      expect(code.some((l) => l.includes('Interpreter'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('ai_vision has ML Kit imports', () => {
      const imports = getRequiredImports(['ai_vision']);
      expect(imports.some((i) => i.includes('mlkit') || i.includes('ObjectDetect'))).toBe(true);
    });
  });

  describe('batch 17 -- networking + multiplayer traits', () => {
    it('state_sync is promoted to full level', () => {
      const m = getTraitMapping('state_sync');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
    });

    it('state_sync generates Nearby connections and sync loop', () => {
      const code = generateTraitCode('state_sync', 'stateNode', {});
      expect(code.length).toBeGreaterThan(0);
      expect(code.some((l) => l.includes('startAdvertising'))).toBe(true);
      expect(code.some((l) => l.includes('SyncJob'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('state_sync uses custom strategy config', () => {
      const code = generateTraitCode('state_sync', 'n', { strategy: 'P2P_CLUSTER', sync_rate: 30 });
      expect(code.some((l) => l.includes('P2P_CLUSTER'))).toBe(true);
    });

    it('state_sync has Nearby imports', () => {
      const imports = getRequiredImports(['state_sync']);
      expect(imports.some((i) => i.includes('Nearby'))).toBe(true);
    });

    it('voice_chat is promoted to full level', () => {
      const m = getTraitMapping('voice_chat');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
    });

    it('voice_chat generates AudioRecord and capture job', () => {
      const code = generateTraitCode('voice_chat', 'vcNode', {});
      expect(code.length).toBeGreaterThan(0);
      expect(code.some((l) => l.includes('AudioRecord'))).toBe(true);
      expect(code.some((l) => l.includes('CaptureJob'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('voice_chat adds spatial source when spatial=true', () => {
      const code = generateTraitCode('voice_chat', 'vc', { spatial: true });
      expect(code.some((l) => l.includes('PointSourceParams'))).toBe(true);
    });

    it('voice_chat has audio and spatial imports', () => {
      const imports = getRequiredImports(['voice_chat']);
      expect(imports.some((i) => i.includes('AudioRecord'))).toBe(true);
    });

    it('lobby is promoted to full level', () => {
      const m = getTraitMapping('lobby');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
    });

    it('lobby generates player list and host function', () => {
      const code = generateTraitCode('lobby', 'lobbyNode', {});
      expect(code.length).toBeGreaterThan(0);
      expect(code.some((l) => l.includes('mutableListOf'))).toBe(true);
      expect(code.some((l) => l.includes('HostLobby'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('lobby generates auto-start logic when auto_start=true', () => {
      const code = generateTraitCode('lobby', 'lb', { auto_start: true });
      expect(code.some((l) => l.includes('CheckReady'))).toBe(true);
    });

    it('networked_physics is promoted to full level', () => {
      const m = getTraitMapping('networked_physics');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
    });

    it('networked_physics generates PhysicsState and broadcast', () => {
      const code = generateTraitCode('networked_physics', 'npNode', {});
      expect(code.length).toBeGreaterThan(0);
      expect(code.some((l) => l.includes('PhysicsState'))).toBe(true);
      expect(code.some((l) => l.includes('SendPhysicsState'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('networked_physics generates interpolation when enabled', () => {
      const code = generateTraitCode('networked_physics', 'np', { interpolation: true });
      expect(code.some((l) => l.includes('InterpolateState'))).toBe(true);
    });

    it('networked_transform is promoted to full level', () => {
      const m = getTraitMapping('networked_transform');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
    });

    it('networked_transform generates sync job with deadzone', () => {
      const code = generateTraitCode('networked_transform', 'ntNode', {});
      expect(code.length).toBeGreaterThan(0);
      expect(code.some((l) => l.includes('TransformSyncJob'))).toBe(true);
      expect(code.some((l) => l.includes('posDelta'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('spectator_mode is promoted to full level', () => {
      const m = getTraitMapping('spectator_mode');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
    });

    it('spectator_mode generates enter/exit spectator functions', () => {
      const code = generateTraitCode('spectator_mode', 'specNode', {});
      expect(code.length).toBeGreaterThan(0);
      expect(code.some((l) => l.includes('EnterSpectatorMode'))).toBe(true);
      expect(code.some((l) => l.includes('ExitSpectatorMode'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('spectator_mode adds free camera lines when free_camera=true', () => {
      const code = generateTraitCode('spectator_mode', 'spec', { free_camera: true });
      expect(code.some((l) => l.includes('Free camera'))).toBe(true);
    });

    it('shared_anchor is promoted to full level', () => {
      const m = getTraitMapping('shared_anchor');
      expect(m).toBeDefined();
      expect(m!.level).toBe('full');
    });

    it('shared_anchor generates AnchorEntity and peer broadcast', () => {
      const code = generateTraitCode('shared_anchor', 'anchorNode', {});
      expect(code.length).toBeGreaterThan(0);
      expect(code.some((l) => l.includes('AnchorEntity'))).toBe(true);
      expect(code.some((l) => l.includes('broadcastPayload'))).toBe(true);
      expect(code.every((l) => !l.includes('TODO'))).toBe(true);
    });

    it('shared_anchor persists UUID when persistent=true', () => {
      const code = generateTraitCode('shared_anchor', 'anc', { persistent: true });
      expect(code.some((l) => l.includes('persist()'))).toBe(true);
    });

    it('shared_anchor has AnchorEntity and ARCore imports', () => {
      const imports = getRequiredImports(['shared_anchor']);
      expect(imports.some((i) => i.includes('AnchorEntity'))).toBe(true);
    });

    it('batch 17 traits are not in partial list', () => {
      const partial = listTraitsByLevel('partial');
      expect(partial).not.toContain('state_sync');
      expect(partial).not.toContain('voice_chat');
      expect(partial).not.toContain('lobby');
      expect(partial).not.toContain('networked_physics');
      expect(partial).not.toContain('networked_transform');
      expect(partial).not.toContain('spectator_mode');
      expect(partial).not.toContain('shared_anchor');
    });
  });
});
