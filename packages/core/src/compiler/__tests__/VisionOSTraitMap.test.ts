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

  it('lists partial traits', () => {
    const partialTraits = listTraitsByLevel('partial');
    expect(partialTraits.length).toBeGreaterThan(0);
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

  it('spatial_navigation is partial (not comment) and contains no TODOs', () => {
    const mapping = getTraitMapping('spatial_navigation');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('partial');
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

  it('spatial_awareness is partial and emits ARKitSession + PlaneDetectionProvider', () => {
    const mapping = getTraitMapping('spatial_awareness');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('partial');
    const code = generateTraitCode('spatial_awareness', 'scene', {});
    expect(code.some((l) => l.includes('ARKitSession'))).toBe(true);
    expect(code.some((l) => l.includes('PlaneDetectionProvider'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('ai_vision is partial and generates VNCoreMLRequest or VNDetectRectanglesRequest', () => {
    const mapping = getTraitMapping('ai_vision');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('partial');
    const code = generateTraitCode('ai_vision', 'detector', {});
    expect(code.some((l) => l.includes('VNCoreMLRequest') || l.includes('VNDetectRectanglesRequest'))).toBe(true);
    expect(code.some((l) => l.includes('detector'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('ai_upscaling is partial and generates CoreML/Lanczos fallback', () => {
    const mapping = getTraitMapping('ai_upscaling');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('partial');
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

  it('ai_inpainting is partial and generates inpainting func with blend fallback', () => {
    const mapping = getTraitMapping('ai_inpainting');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('partial');
    const code = generateTraitCode('ai_inpainting', 'patch', {});
    expect(code.some((l) => l.includes('patch'))).toBe(true);
    expect(code.some((l) => l.includes('CIImage') || l.includes('Inpaint') || l.includes('blendWithMask') || l.includes('func'))).toBe(true);
    expect(code.every((l) => !l.toUpperCase().includes('TODO'))).toBe(true);
  });

  it('neural_link is partial and generates CBCentralManager setup', () => {
    const mapping = getTraitMapping('neural_link');
    expect(mapping).toBeDefined();
    expect(mapping!.level).toBe('partial');
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
