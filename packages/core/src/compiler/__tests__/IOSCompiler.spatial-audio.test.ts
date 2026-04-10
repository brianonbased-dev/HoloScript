import { describe, it, expect, vi } from 'vitest';
import { IOSCompiler } from '../IOSCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

function makeSpatialAudioComposition(traits: string[] = ['spatial_audio_airpods']): HoloComposition {
  return makeComposition({
    objects: [
      {
        name: 'audio_scene',
        properties: [],
        traits: traits.map((t) => ({ name: t, config: {} })),
      },
    ] as any,
  });
}

function allSpatialAudioTraits(): string[] {
  return [
    'spatial_audio_airpods',
    'audio_head_track',
    'audio_source_3d',
    'audio_falloff',
    'audio_directivity',
    'audio_reverb_match',
    'audio_occlusion',
  ];
}

describe('IOSCompiler — AirPods Spatial Audio (M.010.11)', () => {
  // =========== Detection ===========

  it('does NOT emit spatialAudioFile when no spatial audio traits present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.spatialAudioFile).toBeUndefined();
  });

  it('emits spatialAudioFile when spatial_audio_airpods trait is present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toBeDefined();
    expect(typeof result.spatialAudioFile).toBe('string');
    expect(result.spatialAudioFile!.length).toBeGreaterThan(0);
  });

  it('emits spatialAudioFile for any single spatial audio trait', () => {
    const compiler = new IOSCompiler();
    for (const trait of allSpatialAudioTraits()) {
      const result = compiler.compile(makeSpatialAudioComposition([trait]), 'test-token');
      expect(result.spatialAudioFile).toBeDefined();
    }
  });

  // =========== Framework imports ===========

  it('imports AVFoundation framework', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('import AVFoundation');
  });

  it('imports PHASE framework', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('import PHASE');
  });

  it('imports CoreMotion for head tracking', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('import CoreMotion');
  });

  it('imports ARKit', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('import ARKit');
  });

  it('imports SwiftUI', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('import SwiftUI');
  });

  // =========== SpatialAudioManager ===========

  it('generates SpatialAudioManager class with default className', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('class GeneratedARSceneSpatialAudioManager');
  });

  it('respects custom className option', () => {
    const compiler = new IOSCompiler({ className: 'MyScene' });
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('class MySceneSpatialAudioManager');
  });

  it('contains PHASEEngine property', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('PHASEEngine');
  });

  it('contains PHASEListener', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('PHASEListener');
  });

  it('contains setupSpatialAudio method', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('func setupSpatialAudio(arSession: ARSession)');
  });

  // =========== Head tracking (audio_head_track) ===========

  it('generates CMHeadphoneMotionManager when audio_head_track present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSpatialAudioComposition(['spatial_audio_airpods', 'audio_head_track']),
      'test-token'
    );
    expect(result.spatialAudioFile).toContain('CMHeadphoneMotionManager');
    expect(result.spatialAudioFile).toContain('func startHeadTracking()');
    expect(result.spatialAudioFile).toContain('func stopHeadTracking()');
    expect(result.spatialAudioFile).toContain('headTrackingActive');
  });

  it('does not emit head tracking without audio_head_track', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSpatialAudioComposition(['spatial_audio_airpods']),
      'test-token'
    );
    expect(result.spatialAudioFile).not.toContain('func startHeadTracking()');
  });

  it('updates listener orientation from head motion', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSpatialAudioComposition(['spatial_audio_airpods', 'audio_head_track']),
      'test-token'
    );
    expect(result.spatialAudioFile).toContain('updateListenerOrientation');
    expect(result.spatialAudioFile).toContain('attitude.yaw');
  });

  // =========== 3D audio sources (audio_source_3d) ===========

  it('generates addAudioSource when audio_source_3d present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSpatialAudioComposition(['spatial_audio_airpods', 'audio_source_3d']),
      'test-token'
    );
    expect(result.spatialAudioFile).toContain('func addAudioSource');
    expect(result.spatialAudioFile).toContain('func updateSourcePosition');
    expect(result.spatialAudioFile).toContain('func removeAudioSource');
    expect(result.spatialAudioFile).toContain('PHASESource');
  });

  it('does not emit source methods without audio_source_3d', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSpatialAudioComposition(['spatial_audio_airpods']),
      'test-token'
    );
    expect(result.spatialAudioFile).not.toContain('func addAudioSource');
  });

  // =========== Distance falloff (audio_falloff) ===========

  it('generates distance model when audio_falloff present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSpatialAudioComposition(['spatial_audio_airpods', 'audio_falloff']),
      'test-token'
    );
    expect(result.spatialAudioFile).toContain('AudioFalloffModel');
    expect(result.spatialAudioFile).toContain('PHASEGeometricSpreadingDistanceModelParameters');
    expect(result.spatialAudioFile).toContain('distanceModelParameters');
  });

  // =========== Directivity (audio_directivity) ===========

  it('generates directivity cone when audio_directivity present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSpatialAudioComposition(['spatial_audio_airpods', 'audio_directivity']),
      'test-token'
    );
    expect(result.spatialAudioFile).toContain('PHASECardioidDirectivityModelParameters');
    expect(result.spatialAudioFile).toContain('sourceDirectivityModelParameters');
  });

  // =========== Reverb matching (audio_reverb_match) ===========

  it('generates reverb matching when audio_reverb_match present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSpatialAudioComposition(['spatial_audio_airpods', 'audio_reverb_match']),
      'test-token'
    );
    expect(result.spatialAudioFile).toContain('func configureReverbFromRoom');
    expect(result.spatialAudioFile).toContain('PHASEReverbPreset');
  });

  it('does not emit reverb without audio_reverb_match', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSpatialAudioComposition(['spatial_audio_airpods']),
      'test-token'
    );
    expect(result.spatialAudioFile).not.toContain('func configureReverbFromRoom');
  });

  // =========== Audio occlusion (audio_occlusion) ===========

  it('generates occlusion handling when audio_occlusion present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSpatialAudioComposition(['spatial_audio_airpods', 'audio_occlusion']),
      'test-token'
    );
    expect(result.spatialAudioFile).toContain('func updateOcclusionForSource');
    expect(result.spatialAudioFile).toContain('attenuationDb');
  });

  it('does not emit occlusion without audio_occlusion', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSpatialAudioComposition(['spatial_audio_airpods']),
      'test-token'
    );
    expect(result.spatialAudioFile).not.toContain('func updateOcclusionForSource');
  });

  // =========== ARKit integration ===========

  it('generates ARKit camera-to-listener update', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('func updateListenerFromCamera');
    expect(result.spatialAudioFile).toContain('frame.camera.transform');
  });

  // =========== Cleanup ===========

  it('generates teardown method', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('func teardown()');
    expect(result.spatialAudioFile).toContain('phaseEngine?.stop()');
  });

  // =========== SwiftUI View ===========

  it('generates SwiftUI SpatialAudioView', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('struct GeneratedARSceneSpatialAudioView: View');
  });

  it('SpatialAudioView shows active status', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(result.spatialAudioFile).toContain('Spatial Audio Active');
    expect(result.spatialAudioFile).toContain('Spatial Audio Inactive');
  });

  // =========== All traits combined ===========

  it('compiles with all 7 spatial audio traits without error', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(allSpatialAudioTraits()), 'test-token');
    expect(result.spatialAudioFile).toBeDefined();
    expect(result.spatialAudioFile!.length).toBeGreaterThan(500);
  });

  it('all traits produce a coherent file with all sections', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(allSpatialAudioTraits()), 'test-token');
    const file = result.spatialAudioFile!;
    // All major sections present
    expect(file).toContain('SpatialAudioManager');
    expect(file).toContain('SpatialAudioView');
    expect(file).toContain('PHASEEngine');
    expect(file).toContain('CMHeadphoneMotionManager');
    expect(file).toContain('func addAudioSource');
    expect(file).toContain('AudioFalloffModel');
    expect(file).toContain('PHASECardioidDirectivityModelParameters');
    expect(file).toContain('func configureReverbFromRoom');
    expect(file).toContain('func updateOcclusionForSource');
    expect(file).toContain('func teardown');
  });

  // =========== Does not break other results ===========

  it('still produces viewFile, sceneFile, stateFile, infoPlist alongside spatialAudioFile', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSpatialAudioComposition(), 'test-token');
    expect(typeof result.viewFile).toBe('string');
    expect(typeof result.sceneFile).toBe('string');
    expect(typeof result.stateFile).toBe('string');
    expect(typeof result.infoPlist).toBe('string');
    expect(typeof result.spatialAudioFile).toBe('string');
  });
});
