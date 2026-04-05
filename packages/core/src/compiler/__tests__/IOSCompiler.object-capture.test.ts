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

function makeObjectCaptureComposition(
  traitNames: string[] = ['object_capture']
): HoloComposition {
  return makeComposition({
    objects: [
      {
        name: 'scanned_object',
        properties: [],
        traits: traitNames.map((name) => ({ name, config: {} })),
      },
    ] as any,
  });
}

describe('IOSCompiler — Object Capture integration (M.010.10)', () => {
  // =========== Detection ===========

  it('does NOT emit objectCaptureFile when no object_capture traits present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.objectCaptureFile).toBeUndefined();
  });

  it('emits objectCaptureFile when object_capture trait is present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toBeDefined();
    expect(typeof result.objectCaptureFile).toBe('string');
    expect(result.objectCaptureFile!.length).toBeGreaterThan(0);
  });

  it('emits objectCaptureFile for any IOS_OBJECT_CAPTURE_TRAITS member', () => {
    const traits = [
      'object_capture',
      'object_capture_guide',
      'object_capture_feedback',
      'photogrammetry_scan',
      'pbr_texture_extract',
      'object_capture_lod',
      'object_capture_to_holo',
      'object_capture_export_usdz',
    ];
    for (const trait of traits) {
      const compiler = new IOSCompiler();
      const result = compiler.compile(makeObjectCaptureComposition([trait]), 'test-token');
      expect(result.objectCaptureFile).toBeDefined();
    }
  });

  // =========== Framework imports ===========

  it('imports RealityKit framework', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('import RealityKit');
  });

  it('imports SwiftUI', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('import SwiftUI');
  });

  it('imports Combine', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('import Combine');
  });

  it('imports os for Logger', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('import os');
  });

  it('includes iOS 17 requirement comment', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('iOS 17.0+');
  });

  // =========== HoloCapturedEntity model ===========

  it('defines HoloCapturedEntity struct', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('struct HoloCapturedEntity: Identifiable');
    expect(result.objectCaptureFile).toContain('let name: String');
    expect(result.objectCaptureFile).toContain('let modelURL: URL');
  });

  it('defines BoundingBox nested struct', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('struct BoundingBox');
    expect(result.objectCaptureFile).toContain('let center: SIMD3<Float>');
    expect(result.objectCaptureFile).toContain('let extents: SIMD3<Float>');
  });

  it('defines DetailLevel enum with all LOD cases', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('enum DetailLevel: String, CaseIterable');
    expect(result.objectCaptureFile).toContain('case preview');
    expect(result.objectCaptureFile).toContain('case reduced');
    expect(result.objectCaptureFile).toContain('case medium');
    expect(result.objectCaptureFile).toContain('case full');
    expect(result.objectCaptureFile).toContain('case raw');
  });

  it('defines PBRMaterialSet with all texture maps', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('struct PBRMaterialSet');
    expect(result.objectCaptureFile).toContain('let diffuseMap: URL?');
    expect(result.objectCaptureFile).toContain('let normalMap: URL?');
    expect(result.objectCaptureFile).toContain('let roughnessMap: URL?');
    expect(result.objectCaptureFile).toContain('let metallicMap: URL?');
    expect(result.objectCaptureFile).toContain('let aoMap: URL?');
  });

  // =========== ObjectCaptureManager class ===========

  it('generates ObjectCaptureManager class', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('class GeneratedARSceneObjectCaptureManager');
  });

  it('respects custom className option', () => {
    const compiler = new IOSCompiler({ className: 'MyCapture' });
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('class MyCaptureObjectCaptureManager');
    expect(result.objectCaptureFile).toContain('struct MyCaptureObjectCaptureView');
  });

  it('defines CaptureState enum', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('enum CaptureState: Equatable');
    expect(result.objectCaptureFile).toContain('case ready');
    expect(result.objectCaptureFile).toContain('case capturing');
    expect(result.objectCaptureFile).toContain('case processing');
    expect(result.objectCaptureFile).toContain('case completed');
    expect(result.objectCaptureFile).toContain('case failed(String)');
  });

  // =========== ObjectCaptureSession setup ===========

  it('creates ObjectCaptureSession', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('ObjectCaptureSession()');
  });

  it('configures ObjectCaptureSession.Configuration', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('ObjectCaptureSession.Configuration()');
    expect(result.objectCaptureFile).toContain('configuration.isOverCaptureEnabled = true');
  });

  it('checks ObjectCaptureSession.isSupported', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('ObjectCaptureSession.isSupported');
  });

  it('includes startCapture and stopCapture methods', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('func startCapture()');
    expect(result.objectCaptureFile).toContain('func stopCapture()');
  });

  // =========== object_capture_guide ===========

  it('generates ObjectCapturePointCloudView for guided capture', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('ObjectCapturePointCloudView');
  });

  // =========== object_capture_feedback ===========

  it('generates session state observation for feedback', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('observeSession');
    expect(result.objectCaptureFile).toContain('stateUpdates');
    expect(result.objectCaptureFile).toContain('feedbackMessages');
  });

  it('handles session state transitions', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeObjectCaptureComposition(['object_capture_feedback']),
      'test-token'
    );
    expect(result.objectCaptureFile).toContain('case .ready:');
    expect(result.objectCaptureFile).toContain('case .detecting:');
    expect(result.objectCaptureFile).toContain('case .capturing:');
    expect(result.objectCaptureFile).toContain('case .finishing:');
    expect(result.objectCaptureFile).toContain('case .completed:');
    expect(result.objectCaptureFile).toContain('case .failed');
  });

  // =========== photogrammetry_scan ===========

  it('generates PhotogrammetrySession pipeline', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('PhotogrammetrySession');
    expect(result.objectCaptureFile).toContain('processCapture');
  });

  it('handles photogrammetry output events', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('.requestProgress');
    expect(result.objectCaptureFile).toContain('.requestComplete');
    expect(result.objectCaptureFile).toContain('.requestError');
  });

  // =========== pbr_texture_extract ===========

  it('generates PBR material extraction with .full detail', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('extractPBRMaterials');
    expect(result.objectCaptureFile).toContain('detail: .full');
  });

  it('checks for diffuse, normal, roughness, metallic, AO maps', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('"diffuse.png"');
    expect(result.objectCaptureFile).toContain('"normal.png"');
    expect(result.objectCaptureFile).toContain('"roughness.png"');
    expect(result.objectCaptureFile).toContain('"metallic.png"');
    expect(result.objectCaptureFile).toContain('"ao.png"');
  });

  // =========== object_capture_lod ===========

  it('generates LOD level generation', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('generateAllLODs');
    expect(result.objectCaptureFile).toContain('detail = .preview');
    expect(result.objectCaptureFile).toContain('detail = .reduced');
    expect(result.objectCaptureFile).toContain('detail = .medium');
    expect(result.objectCaptureFile).toContain('detail = .full');
    expect(result.objectCaptureFile).toContain('detail = .raw');
  });

  // =========== object_capture_to_holo ===========

  it('generates .holo conversion function', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('func convertToHolo()');
    expect(result.objectCaptureFile).toContain('scene CapturedObject');
    expect(result.objectCaptureFile).toContain('traits: [object_capture, photogrammetry_scan]');
  });

  // =========== object_capture_export_usdz ===========

  it('generates USDZ export function', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('func exportUSDZ()');
    expect(result.objectCaptureFile).toContain('"export.usdz"');
    expect(result.objectCaptureFile).toContain('copyItem');
  });

  // =========== SwiftUI View ===========

  it('generates SwiftUI ObjectCaptureView', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain(
      'struct GeneratedARSceneObjectCaptureView: View'
    );
  });

  it('includes capture control buttons', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('Button("Start Capture")');
    expect(result.objectCaptureFile).toContain('Button("Finish Capture")');
  });

  it('includes progress indicator', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('ProgressView');
    expect(result.objectCaptureFile).toContain('Processing:');
  });

  it('includes model preview view', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeObjectCaptureComposition(), 'test-token');
    expect(result.objectCaptureFile).toContain('struct GeneratedARSceneModelPreviewView: View');
    expect(result.objectCaptureFile).toContain('Model3D');
    expect(result.objectCaptureFile).toContain('Captured Object');
  });

  // =========== Selective trait codegen ===========

  it('emits PBR extraction only when pbr_texture_extract trait present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeObjectCaptureComposition(['object_capture_guide']),
      'test-token'
    );
    // object_capture_guide alone should not emit PBR extraction
    expect(result.objectCaptureFile).not.toContain('extractPBRMaterials');
  });

  it('emits LOD generation only when object_capture_lod trait present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeObjectCaptureComposition(['object_capture_guide']),
      'test-token'
    );
    expect(result.objectCaptureFile).not.toContain('generateAllLODs');
  });

  it('includes PBR maps in holo output when pbr_texture_extract is present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeObjectCaptureComposition(['object_capture_to_holo', 'pbr_texture_extract']),
      'test-token'
    );
    expect(result.objectCaptureFile).toContain('diffuse_map');
    expect(result.objectCaptureFile).toContain('normal_map');
    expect(result.objectCaptureFile).toContain('roughness_map');
    expect(result.objectCaptureFile).toContain('metallic_map');
    expect(result.objectCaptureFile).toContain('ao_map');
  });
});
