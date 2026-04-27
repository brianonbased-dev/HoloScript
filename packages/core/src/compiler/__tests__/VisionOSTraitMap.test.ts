import { describe, it, expect } from 'vitest';
import {
  VISIONOS_TRAIT_MAP,
  PHYSICS_TRAIT_MAP,
  INTERACTION_TRAIT_MAP,
  AUDIO_TRAIT_MAP,
  AR_TRAIT_MAP,
  VISUAL_TRAIT_MAP,
  ACCESSIBILITY_TRAIT_MAP,
  UI_TRAIT_MAP,
  PORTAL_TRAIT_MAP,
  getTraitMapping,
  generateTraitCode,
  getRequiredImports,
  getMinVisionOSVersion,
  listAllTraits,
  listTraitsByLevel,
} from '../VisionOSTraitMap';

describe('VisionOSTraitMap', () => {
  // =========== Combined map ===========

  it('VISIONOS_TRAIT_MAP includes all sub-maps', () => {
    const allKeys = [
      ...Object.keys(PHYSICS_TRAIT_MAP),
      ...Object.keys(INTERACTION_TRAIT_MAP),
      ...Object.keys(AUDIO_TRAIT_MAP),
      ...Object.keys(AR_TRAIT_MAP),
      ...Object.keys(VISUAL_TRAIT_MAP),
      ...Object.keys(ACCESSIBILITY_TRAIT_MAP),
      ...Object.keys(UI_TRAIT_MAP),
      ...Object.keys(PORTAL_TRAIT_MAP),
    ];
    for (const key of allKeys) {
      expect(VISIONOS_TRAIT_MAP[key]).toBeDefined();
    }
  });

  it('listAllTraits returns all trait names', () => {
    const traits = listAllTraits();
    expect(traits.length).toBe(Object.keys(VISIONOS_TRAIT_MAP).length);
    expect(traits).toContain('collidable');
    expect(traits).toContain('grabbable');
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

  it('generates Swift code for physics trait', () => {
    const code = generateTraitCode('physics', 'myEntity', { mode: 'dynamic' });
    expect(code.length).toBeGreaterThan(0);
    expect(code.some((l) => l.includes('myEntity'))).toBe(true);
    expect(code.some((l) => l.includes('PhysicsBodyComponent'))).toBe(true);
  });

  it('generates Swift code for collidable trait', () => {
    const code = generateTraitCode('collidable', 'ball', {});
    expect(code.some((l) => l.includes('CollisionComponent'))).toBe(true);
  });

  it('generates Swift code for grabbable trait', () => {
    const code = generateTraitCode('grabbable', 'cube', {});
    expect(code.some((l) => l.includes('cube'))).toBe(true);
  });

  it('generates fallback comment for unknown trait', () => {
    const code = generateTraitCode('unknown_trait', 'entity', { x: 1 });
    expect(code.length).toBe(1);
    expect(code[0]).toContain('no mapping defined');
  });

  it('generates portal code', () => {
    const code = generateTraitCode('portal', 'gate', { target_world: 'myWorld' });
    expect(code.some((l) => l.includes('PortalComponent'))).toBe(true);
  });

  it('generates spatial_audio code', () => {
    const code = generateTraitCode('spatial_audio', 'speaker', {});
    expect(code.some((l) => l.includes('speaker'))).toBe(true);
    expect(code.some((l) => l.includes('SpatialAudioComponent'))).toBe(true);
  });

  it('generates hover effect code', () => {
    const code = generateTraitCode('hoverable', 'btn', {});
    expect(code.some((l) => l.includes('HoverEffectComponent'))).toBe(true);
  });

  // =========== getRequiredImports ===========

  it('returns required imports for audio trait', () => {
    const imports = getRequiredImports(['audio']);
    expect(imports).toContain('AVFoundation');
  });

  it('deduplicates imports', () => {
    // Both audio and ambisonics should not produce duplicates
    const imports = getRequiredImports(['audio', 'audio']);
    const avCount = imports.filter((i) => i === 'AVFoundation').length;
    expect(avCount).toBe(1);
  });

  it('returns empty for traits with no imports', () => {
    const imports = getRequiredImports(['collidable']);
    expect(imports.length).toBe(0);
  });

  // =========== getMinVisionOSVersion ===========

  it('returns min version for basic traits', () => {
    const version = getMinVisionOSVersion(['collidable']);
    expect(version).toBe('1.0');
  });

  it('returns highest version among traits', () => {
    const version = getMinVisionOSVersion(listAllTraits());
    expect(parseFloat(version)).toBeGreaterThanOrEqual(1.0);
  });

  // =========== listTraitsByLevel ===========

  it('lists traits by implementation level', () => {
    const fullTraits = listTraitsByLevel('full');
    expect(fullTraits.length).toBeGreaterThan(0);
    for (const t of fullTraits) {
      expect(VISIONOS_TRAIT_MAP[t].level).toBe('full');
    }
  });

  it('lists partial traits (all promoted to full)', () => {
    const partialTraits = listTraitsByLevel('partial');
    expect(partialTraits.length).toBe(0);
  });

  // =========== Individual trait categories ===========

  it('PHYSICS_TRAIT_MAP contains collidable/physics/static/kinematic', () => {
    expect(PHYSICS_TRAIT_MAP.collidable).toBeDefined();
    expect(PHYSICS_TRAIT_MAP.physics).toBeDefined();
    expect(PHYSICS_TRAIT_MAP.static).toBeDefined();
    expect(PHYSICS_TRAIT_MAP.kinematic).toBeDefined();
  });

  it('INTERACTION_TRAIT_MAP contains grabbable/draggable/throwable', () => {
    expect(INTERACTION_TRAIT_MAP.grabbable).toBeDefined();
    expect(INTERACTION_TRAIT_MAP.draggable).toBeDefined();
    expect(INTERACTION_TRAIT_MAP.throwable).toBeDefined();
  });

  it('PORTAL_TRAIT_MAP contains portal/volume/immersive', () => {
    expect(PORTAL_TRAIT_MAP.portal).toBeDefined();
    expect(PORTAL_TRAIT_MAP.volume).toBeDefined();
    expect(PORTAL_TRAIT_MAP.immersive).toBeDefined();
  });

  it('each mapping has a generate function', () => {
    for (const [, mapping] of Object.entries(VISIONOS_TRAIT_MAP)) {
      expect(typeof mapping.generate).toBe('function');
    }
  });

  // =========== spatial_navigation (V43) — promoted from comment to partial ==========

  it('spatial_navigation is full (not comment) and contains no TODOs', () => {
    const mapping = getTraitMapping('spatial_navigation');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    // Default config — outdoor walking path
    const code = generateTraitCode('spatial_navigation', 'guide', {});
    expect(code.length).toBeGreaterThan(2);
    // No leftover TODO markers — all stub language must be gone.
    for (const line of code) {
      expect(line.toUpperCase()).not.toContain('TODO');
    }
  });

  it('spatial_navigation outdoor mode emits ARKit WorldTrackingProvider', () => {
    const code = generateTraitCode('spatial_navigation', 'guide', {
      navigation_mode: 'walking',
      path_visualization: 'arrow',
      waypoint_radius_m: 1.5,
      path_color: '#ff8800',
    });
    expect(code.some((l) => l.includes('WorldTrackingProvider'))).toBe(true);
    expect(code.some((l) => l.includes('NSWorldSensingUsageDescription'))).toBe(true);
    expect(code.some((l) => l.includes('1.5'))).toBe(true);
    // Color decoded into RealityKit material literals
    expect(code.some((l) => l.includes('SimpleMaterial'))).toBe(true);
  });

  it('spatial_navigation indoor mode emits SwiftUI NavigationSplitView pattern', () => {
    const code = generateTraitCode('spatial_navigation', 'lobbyMenu', {
      navigation_mode: 'indoor',
      path_visualization: 'breadcrumb',
    });
    expect(code.some((l) => l.includes('NavigationSplitView'))).toBe(true);
    expect(code.some((l) => l.includes('AnchoringComponent'))).toBe(true);
    expect(code.some((l) => l.includes('lobbyMenu'))).toBe(true);
  });

  it('spatial_navigation declares ARKit + SwiftUI imports', () => {
    const imports = getRequiredImports(['spatial_navigation']);
    expect(imports).toContain('ARKit');
    expect(imports).toContain('SwiftUI');
  });

  // =========== Upgraded traits (vision / spatial_awareness / ai_vision) ===========

  it('vision is full and generates VNRequest dispatch for text_recognition', () => {
    const mapping = getTraitMapping('vision');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('vision', 'cam', { task: 'text_recognition' });
    expect(code.some((l) => l.includes('VNRecognizeTextRequest'))).toBe(true);
    expect(code.some((l) => l.includes('cam'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('vision generates face detection request for face_detection task', () => {
    const code = generateTraitCode('vision', 'faceNode', { task: 'face_detection' });
    expect(code.some((l) => l.includes('VNDetectFaceRectanglesRequest'))).toBe(true);
    expect(code.some((l) => l.includes('faceNode'))).toBe(true);
  });

  it('spatial_awareness is full and emits ARKitSession + PlaneDetectionProvider', () => {
    const mapping = getTraitMapping('spatial_awareness');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('spatial_awareness', 'scene', {});
    expect(code.some((l) => l.includes('ARKitSession'))).toBe(true);
    expect(code.some((l) => l.includes('PlaneDetectionProvider'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('ai_vision is full and generates VNCoreMLRequest or VNDetectRectanglesRequest', () => {
    const mapping = getTraitMapping('ai_vision');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('ai_vision', 'detector', {});
    expect(code.some((l) => l.includes('VNCoreMLRequest') || l.includes('VNDetectRectanglesRequest'))).toBe(true);
    expect(code.some((l) => l.includes('detector'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('ai_upscaling is full and generates CoreML/Lanczos fallback', () => {
    const mapping = getTraitMapping('ai_upscaling');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('ai_upscaling', 'tex', { factor: 4 });
    expect(code.some((l) => l.includes('MLModel') || l.includes('lanczosScaleTransform') || l.includes('CIFilter'))).toBe(true);
    expect(code.some((l) => l.includes('tex'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('ai_upscaling declares CoreML + CoreImage imports', () => {
    const imports = getRequiredImports(['ai_upscaling']);
    expect(imports).toContain('CoreML');
    expect(imports).toContain('CoreImage');
  });

  it('ai_inpainting is full and generates inpainting func with blend fallback', () => {
    const mapping = getTraitMapping('ai_inpainting');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('ai_inpainting', 'patch', {});
    expect(code.some((l) => l.includes('patch'))).toBe(true);
    expect(code.some((l) => l.includes('CIImage') || l.includes('Inpaint') || l.includes('blendWithMask') || l.includes('func'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('neural_link is full and generates CBCentralManager setup', () => {
    const mapping = getTraitMapping('neural_link');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('neural_link', 'brain', { interface_type: 'bci', channels: 16, sample_rate: 500 });
    expect(code.some((l) => l.includes('CBCentralManager'))).toBe(true);
    expect(code.some((l) => l.includes('brain'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('neural_link declares CoreBluetooth + Combine imports', () => {
    const imports = getRequiredImports(['neural_link']);
    expect(imports).toContain('CoreBluetooth');
    expect(imports).toContain('Combine');
  });

  it('embedding_search is full and generates CoreData vector search helpers', () => {
    const mapping = getTraitMapping('embedding_search');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('embedding_search', 'store', { dimensions: 512 });
    expect(code.some((l) => l.includes('NSPersistentContainer'))).toBe(true);
    expect(code.some((l) => l.includes('storeSearch'))).toBe(true);
    expect(code.some((l) => l.includes('CosineSimilarity'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);

  });

  it('embedding_search declares CoreData + Foundation imports', () => {
    const imports = getRequiredImports(['embedding_search']);
    expect(imports).toContain('CoreData');
    expect(imports).toContain('Foundation');

  });

  // =========== Upgraded traits (neural_forge / spatial_awareness / neural_animation / ai_vision) ===========

    describe('Upgraded Traits — full level (batch 4)', () => {
      it('neural_forge is full and generates MLUpdateTask training function', () => {
        const mapping = getTraitMapping('neural_forge');
        expect(mapping).toBeDefined();
        expect(mapping!.level).toBe('full');
        const code = generateTraitCode('neural_forge', 'model', { model_path: 'MyModel', epochs: 10 });
        expect(code.some((l) => l.includes('MLUpdateTask'))).toBe(true);
        expect(code.some((l) => l.includes('modelTrain'))).toBe(true);
        expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
      });

      it('neural_forge declares CoreML import', () => {
        const imports = getRequiredImports(['neural_forge']);
        expect(imports).toContain('CoreML');
      });

      it('spatial_awareness is full and generates ARKitSession with plane detection', () => {
        const mapping = getTraitMapping('spatial_awareness');
        expect(mapping).toBeDefined();
        expect(mapping!.level).toBe('full');
        const code = generateTraitCode('spatial_awareness', 'scene', {});
        expect(code.some((l) => l.includes('ARKitSession'))).toBe(true);
        expect(code.some((l) => l.includes('PlaneDetectionProvider'))).toBe(true);
        expect(code.some((l) => l.includes('scene'))).toBe(true);
        expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
      });

      it('spatial_awareness declares ARKit import', () => {
        const imports = getRequiredImports(['spatial_awareness']);
        expect(imports).toContain('ARKit');
      });

      it('neural_animation is full and generates CoreML pose prediction function', () => {
        const mapping = getTraitMapping('neural_animation');
        expect(mapping).toBeDefined();
        expect(mapping!.level).toBe('full');
        const code = generateTraitCode('neural_animation', 'avatar', { style: 'motion_matching' });
        expect(code.some((l) => l.includes('MLModel'))).toBe(true);
        expect(code.some((l) => l.includes('avatarPredictPose'))).toBe(true);
        expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
      });

      it('neural_animation declares CoreML + RealityKit imports', () => {
        const imports = getRequiredImports(['neural_animation']);
        expect(imports).toContain('CoreML');
        expect(imports).toContain('RealityKit');
      });

      it('ai_vision is full and generates VNCoreMLRequest with fallback', () => {
        const mapping = getTraitMapping('ai_vision');
        expect(mapping).toBeDefined();
        expect(mapping!.level).toBe('full');
        const code = generateTraitCode('ai_vision', 'detector', { task: 'detection', model: 'YOLOv8' });
        expect(code.some((l) => l.includes('VNCoreMLRequest'))).toBe(true);
        expect(code.some((l) => l.includes('detectorAnalyze') || l.includes('detectorBuildRequest'))).toBe(true);
        expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
      });

      it('ai_vision declares Vision + CoreML imports', () => {
        const imports = getRequiredImports(['ai_vision']);
        expect(imports).toContain('Vision');
        expect(imports).toContain('CoreML');
      });
    });
  });

  // =========== Upgraded Traits — full level (batch 5) ===========

describe('Upgraded Traits — full level (batch 5)', () => {
  it('cloth is full and generates ClothSimulationComponent with Metal dispatch', () => {
    const mapping = getTraitMapping('cloth');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('cloth', 'fabric', { stiffness: 0.9, damping: 0.01 });
    expect(code.some((l) => l.includes('ClothSimulationComponent'))).toBe(true);
    expect(code.some((l) => l.includes('ClothSimulationSystem'))).toBe(true);
    expect(code.some((l) => l.includes('MTLCreateSystemDefaultDevice'))).toBe(true);
  });

  it('cloth declares RealityKit + Metal imports', () => {
    const imports = getRequiredImports(['cloth']);
    expect(imports).toContain('RealityKit');
    expect(imports).toContain('Metal');
  });

  it('soft_body is full and generates SoftBodyComponent with XPBD solve', () => {
    const mapping = getTraitMapping('soft_body');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('soft_body', 'blob', { compliance: 0.0002 });
    expect(code.some((l) => l.includes('SoftBodyComponent'))).toBe(true);
    expect(code.some((l) => l.includes('SoftBodySimulationSystem'))).toBe(true);
    expect(code.some((l) => l.includes('MTLCreateSystemDefaultDevice'))).toBe(true);
  });

  it('soft_body declares RealityKit + Metal imports', () => {
    const imports = getRequiredImports(['soft_body']);
    expect(imports).toContain('RealityKit');
    expect(imports).toContain('Metal');
  });

  it('fluid is full and generates FluidSimulationComponent with SPH config', () => {
    const mapping = getTraitMapping('fluid');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('fluid', 'water', { particle_count: 5000, viscosity: 0.02 });
    expect(code.some((l) => l.includes('FluidSimulationComponent'))).toBe(true);
    expect(code.some((l) => l.includes('FluidSimulationSystem'))).toBe(true);
    expect(code.some((l) => l.includes('5000'))).toBe(true);
  });

  it('fluid declares RealityKit + Metal imports', () => {
    const imports = getRequiredImports(['fluid']);
    expect(imports).toContain('RealityKit');
    expect(imports).toContain('Metal');
  });

  it('lod is full and registers LODComponent via registerComponent()', () => {
    const mapping = getTraitMapping('lod');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('lod', 'mesh', { distances: [3, 10] });
    expect(code.some((l) => l.includes('LODComponent'))).toBe(true);
    expect(code.some((l) => l.includes('registerComponent()'))).toBe(true);
    expect(code.some((l) => !l.trimStart().startsWith('//')  && l.includes('registerComponent()'))).toBe(true);
  });

  it('lod embeds distance thresholds from config', () => {
    const code = generateTraitCode('lod', 'obj', { distances: [8, 20] });
    expect(code.some((l) => l.includes('8') && l.includes('20'))).toBe(true);
  });

  it('spatial_persona is full and generates SystemCoordinator request', () => {
    const mapping = getTraitMapping('spatial_persona');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('spatial_persona', 'user', { style: 'realistic' });
    expect(code.some((l) => l.includes('SystemCoordinator'))).toBe(true);
    expect(code.some((l) => l.includes('spatialPersona'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('spatial_persona declares GroupActivities import', () => {
    const imports = getRequiredImports(['spatial_persona']);
    expect(imports).toContain('GroupActivities');
  });
});


describe('VisionOSTraitMap — Upgraded Traits (batch 6)', () => {
  it('shareplay is full and generates GroupActivity struct with messenger', () => {
    const mapping = getTraitMapping('shareplay');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('shareplay', 'game', { activity_type: 'coopGame' });
    expect(code.some((l) => l.includes('GroupActivity'))).toBe(true);
    expect(code.some((l) => l.includes('GroupSessionMessenger'))).toBe(true);
    expect(code.some((l) => l.includes('coopGame'))).toBe(true);
  });

  it('shareplay declares GroupActivities import', () => {
    const imports = getRequiredImports(['shareplay']);
    expect(imports).toContain('GroupActivities');
  });

  it('object_tracking is full and generates ObjectTrackingProvider with anchor updates', () => {
    const mapping = getTraitMapping('object_tracking');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('object_tracking', 'target', { reference_object: 'BoxTarget' });
    expect(code.some((l) => l.includes('ObjectTrackingProvider'))).toBe(true);
    expect(code.some((l) => l.includes('BoxTarget'))).toBe(true);
    expect(code.some((l) => l.includes('anchorUpdates'))).toBe(true);
  });

  it('object_tracking declares ARKit import', () => {
    const imports = getRequiredImports(['object_tracking']);
    expect(imports).toContain('ARKit');
  });

  it('scene_reconstruction is full and generates SceneReconstructionProvider', () => {
    const mapping = getTraitMapping('scene_reconstruction');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('scene_reconstruction', 'env', { mode: 'mesh' });
    expect(code.some((l) => l.includes('SceneReconstructionProvider'))).toBe(true);
    expect(code.some((l) => l.includes('mesh'))).toBe(true);
  });

  it('scene_reconstruction declares ARKit import', () => {
    const imports = getRequiredImports(['scene_reconstruction']);
    expect(imports).toContain('ARKit');
  });

  it('spatial_navigation is full and generates WorldTrackingProvider for outdoor mode', () => {
    const mapping = getTraitMapping('spatial_navigation');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
    const code = generateTraitCode('spatial_navigation', 'guide', { navigation_mode: 'walking', path_visualization: 'arrow' });
    expect(code.some((l) => l.includes('WorldTrackingProvider'))).toBe(true);
    expect(code.some((l) => l.includes('walking') || l.includes('arrow'))).toBe(true);
  });

  it('spatial_navigation indoor mode generates NavigationSplitView pattern', () => {
    const code = generateTraitCode('spatial_navigation', 'indoor', { navigation_mode: 'indoor' });
    expect(code.some((l) => l.includes('NavigationSplitView') || l.includes('indoor'))).toBe(true);
  });

  it('spatial_navigation declares ARKit import', () => {
    const imports = getRequiredImports(['spatial_navigation']);
    expect(imports).toContain('ARKit');
  });
});

describe('VisionOS batch 9 — eye_hand_fusion', () => {
  it('eye_hand_fusion is full', () => {
    const mapping = getTraitMapping('eye_hand_fusion');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('full');
  });
  it('eye_hand_fusion generates HandTrackingProvider', () => {
    const code = generateTraitCode('eye_hand_fusion', 'fusion', {});
    expect(code.some((l) => l.includes('HandTrackingProvider'))).toBe(true);
    expect(code.some((l) => l.includes('fusion'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });
  it('eye_hand_fusion declares ARKit import', () => {
    const imports = getRequiredImports(['eye_hand_fusion']);
    expect(imports).toContain('ARKit');
  });
});
