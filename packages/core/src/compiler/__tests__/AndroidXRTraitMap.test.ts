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
    expect(mapping!.level).toBe('partial');
    const code = generateTraitCode('ai_npc_brain', 'npc', { model: 'gemini-nano' });
    expect(code.some((l) => l.includes('NPCBrain'))).toBe(true);
    expect(code.some((l) => l.includes('Think'))).toBe(true);
  });

  // =========== Upgraded traits ===========

  it('portal upgraded from comment to partial', () => {
    const mapping = getTraitMapping('portal');
    expect(mapping!.level).toBe('partial');
    const code = generateTraitCode('portal', 'gateway', { target_world: 'dungeon' });
    expect(code.some((l) => l.includes('stencil'))).toBe(true);
  });

  it('spatial_persona upgraded from comment to partial', () => {
    const mapping = getTraitMapping('spatial_persona');
    expect(mapping!.level).toBe('partial');
  });

  it('shareplay upgraded from comment to partial', () => {
    const mapping = getTraitMapping('shareplay');
    expect(mapping!.level).toBe('partial');
  });

  it('object_tracking upgraded from comment to partial', () => {
    const mapping = getTraitMapping('object_tracking');
    expect(mapping!.level).toBe('partial');
  });

  it('spatial_navigation upgraded from comment to partial', () => {
    const mapping = getTraitMapping('spatial_navigation');
    expect(mapping!.level).toBe('partial');
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
    expect(partial).toContain('cloth');
    expect(partial).toContain('soft_body');
    expect(partial).toContain('fluid');
    expect(partial).toContain('pbd_constraint');
    expect(partial).toContain('reverb_zone');
    expect(partial).toContain('audio_occlusion');
    expect(partial).toContain('instancing');
    expect(partial).toContain('bloom');
    expect(partial).toContain('state_sync');
    expect(partial).toContain('voice_chat');
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
});
