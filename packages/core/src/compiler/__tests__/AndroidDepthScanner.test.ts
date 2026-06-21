import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AndroidCompiler } from '../AndroidCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

const SCENEFORM_TOKENS = [
  'arFragment',
  'ArFragment',
  'TransformableNode',
  'NodeFactory',
  'com.google.ar.sceneform',
];

function expectNoSceneform(code: string | undefined): void {
  expect(code).toBeDefined();
  for (const token of SCENEFORM_TOKENS) {
    expect(code!).not.toContain(token);
  }
}

function makeDepthComposition(traits: string[]): HoloComposition {
  return {
    name: 'DepthScanScene',
    objects: [
      {
        name: 'Scanner',
        properties: [{ key: 'geometry', value: 'sphere' }],
        traits: traits.map((name) => ({
          type: 'ObjectTrait' as const,
          name,
          config: {},
        })),
      },
    ],
  } as HoloComposition;
}

describe('AndroidCompiler - SceneView depth scanner sidecar', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
  });

  it('emits ARCore depth session setup into depthScanSetup', () => {
    const result = compiler.compile(makeDepthComposition(['depth_scan']), 'test-token');

    expect(result.depthScanSetup).toContain('configureDepthSession');
    expect(result.depthScanSetup).toContain('Config.DepthMode.AUTOMATIC');
    expect(result.depthScanSetup).toContain('depthConfidenceThreshold = 128');
    expect(result.depthScanSetup).toContain('depthMaxMeters = 5f');
    expect(result.depthScanSetup).toContain('depthMeshDecimation = 0.5f');
    expect(result.activityFile).not.toContain('setupDepthScanner');
    expectNoSceneform(result.depthScanSetup);
  });

  it('emits depth frame acquisition and mesh generation helpers', () => {
    const result = compiler.compile(
      makeDepthComposition([
        'depth_scan',
        'depth_ml_arcore',
        'depth_confidence_map',
        'depth_auto_select',
        'depth_mesh_generate',
        'depth_mesh_to_holo',
        'depth_export',
      ]),
      'test-token'
    );

    expect(result.depthScanSetup).toContain('frame.acquireDepthImage16Bits()');
    expect(result.depthScanSetup).toContain('frame.acquireRawDepthConfidenceImage()');
    expect(result.depthScanSetup).toContain('detectDepthSource');
    expect(result.depthScanSetup).toContain('generateMeshFromDepth');
    expect(result.depthScanSetup).toContain('convertDepthMeshToHolo');
    expect(result.depthScanSetup).toContain('exportDepthMesh');
    expect(result.depthScanSetup).toContain('DepthPoint');
    expectNoSceneform(result.depthScanSetup);
  });

  it('writes DepthScanSetup.kt in compileToFiles', () => {
    const files = compiler.compileToFiles(makeDepthComposition(['depth_scan']), 'test-token');
    expect(files).toHaveProperty('app/src/main/java/com/holoscript/generated/DepthScanSetup.kt');
  });

  it('does not emit depth sidecar without depth traits', () => {
    const result = compiler.compile(
      { name: 'PlainScene', objects: [] } as unknown as HoloComposition,
      'test-token'
    );
    expect(result.depthScanSetup).toBeUndefined();
  });
});
