/**
 * Portal AR Compiler Codegen Tests (M.010.06)
 *
 * Verifies that AndroidCompiler and IOSCompiler emit correct native code
 * when portal_* traits are present in a HoloComposition.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AndroidCompiler } from '../AndroidCompiler';
import { IOSCompiler } from '../IOSCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

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

// Helper to create a minimal composition
function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'PortalTestScene',
    objects: [],
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  };
}

// Helper to create an object with portal traits
function createPortalObject(name: string, traitNames: string[]): HoloObjectDecl {
  return {
    name,
    properties: [],
    traits: traitNames.map((t) => ({ name: t, config: {} })),
  } as unknown as HoloObjectDecl;
}

describe('Portal AR - AndroidCompiler', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
  });

  it('emits SceneView portal sidecar when portal_mode is present', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_mode'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.portalARSetup).toContain('PortalARManager');
    expect(result.portalARSetup).toContain('setupPortalAR');
    expect(result.portalARSetup).toContain('configurePortalSession');
    expect(result.portalARSetup).toContain('Config.DepthMode.AUTOMATIC');
    expect(result.portalARSetup).toContain('Config.LightEstimationMode.ENVIRONMENTAL_HDR');
    expect(result.activityFile).not.toContain('setupPortalAR');
    expectNoSceneform(result.portalARSetup);
  });

  it('emits portal occlusion, parallax, boundary, mesh, and lighting helpers', () => {
    const composition = createComposition({
      objects: [
        createPortalObject('Scene', [
          'portal_occlusion',
          'portal_parallax',
          'portal_depth_fade',
          'portal_world_mesh',
          'portal_mesh_occlusion',
          'portal_peek_through',
          'portal_boundary',
          'portal_lighting_match',
        ]),
      ],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.portalARSetup).toContain('updateDepthOcclusion');
    expect(result.portalARSetup).toContain('applyParallaxCorrection');
    expect(result.portalARSetup).toContain('enableDepthFade');
    expect(result.portalARSetup).toContain('reconstructMesh');
    expect(result.portalARSetup).toContain('updateMeshOcclusion');
    expect(result.portalARSetup).toContain('portalTiltThreshold');
    expect(result.portalARSetup).toContain('setPortalVisibility');
    expect(result.portalARSetup).toContain('PortalBoundary');
    expect(result.portalARSetup).toContain('Shape.CIRCLE');
    expect(result.portalARSetup).toContain('updateLighting');
    expectNoSceneform(result.portalARSetup);
  });

  it('writes PortalARSetup.kt in compileToFiles', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_mode'])],
    });
    const files = compiler.compileToFiles(composition, 'test-token');
    expect(files).toHaveProperty('app/src/main/java/com/holoscript/generated/PortalARSetup.kt');
  });

  it('does not emit portal sidecar without portal traits', () => {
    const composition = createComposition({
      objects: [createPortalObject('Cube', [])],
    });
    const result = compiler.compile(composition, 'test-token');
    expect(result.portalARSetup).toBeUndefined();
  });
});

describe('Portal AR — IOSCompiler', () => {
  let compiler: IOSCompiler;

  beforeEach(() => {
    compiler = new IOSCompiler();
  });

  it('should not emit portal file when no portal traits present', () => {
    const composition = createComposition({
      objects: [createPortalObject('Cube', [])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toBeUndefined();
  });

  it('should emit portal file when portal_mode trait present', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_mode'])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toBeDefined();
    expect(result.portalARFile).toContain('PortalARManager');
    expect(result.portalARFile).toContain('ARWorldTrackingConfiguration');
  });

  it('should configure ARKit scene depth', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_mode'])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toContain('.sceneDepth');
    expect(result.portalARFile).toContain('frameSemantics');
  });

  it('should emit scene reconstruction for portal_world_mesh', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_world_mesh'])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toContain('sceneReconstruction');
    expect(result.portalARFile).toContain('.mesh');
  });

  it('should emit depth occlusion for portal_occlusion', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_occlusion'])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toContain('updateDepthOcclusion');
    expect(result.portalARFile).toContain('depthMap');
    expect(result.portalARFile).toContain('CVPixelBuffer');
  });

  it('should emit people occlusion for portal_people_occlusion', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_people_occlusion'])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toContain('personSegmentationWithDepth');
    expect(result.portalARFile).toContain('ARMatteGenerator');
    expect(result.portalARFile).toContain('updatePeopleOcclusion');
  });

  it('should emit parallax correction for portal_parallax', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_parallax'])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toContain('applyParallaxCorrection');
    expect(result.portalARFile).toContain('cameraTransform');
    expect(result.portalARFile).toContain('parallaxFactor');
  });

  it('should emit depth fade shader for portal_depth_fade', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_depth_fade'])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toContain('applyDepthFade');
    expect(result.portalARFile).toContain('nearPlane');
    expect(result.portalARFile).toContain('farPlane');
    expect(result.portalARFile).toContain('simd_distance');
  });

  it('should emit lighting match via environment probe for portal_lighting_match', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_lighting_match'])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toContain('environmentTexturing');
    expect(result.portalARFile).toContain('updateLightingMatch');
    expect(result.portalARFile).toContain('ambientIntensity');
    expect(result.portalARFile).toContain('ambientColorTemperature');
  });

  it('should emit portal boundary with shape options for portal_boundary', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_boundary'])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toContain('createPortalBoundary');
    expect(result.portalARFile).toContain('SCNTorus');
    expect(result.portalARFile).toContain('SCNBox');
  });

  it('should emit edge glow shader for portal_edge_glow', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_edge_glow'])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toContain('applyEdgeGlow');
    expect(result.portalARFile).toContain('shaderModifiers');
    expect(result.portalARFile).toContain('glowIntensity');
  });

  it('should emit peek through via tilt for portal_peek_through', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_peek_through'])],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toContain('checkPeekThrough');
    expect(result.portalARFile).toContain('tiltThreshold');
    expect(result.portalARFile).toContain('portalEnabled');
  });

  it('should wire ARSessionDelegate with active traits', () => {
    const composition = createComposition({
      objects: [
        createPortalObject('Scene', [
          'portal_mode',
          'portal_occlusion',
          'portal_people_occlusion',
          'portal_parallax',
          'portal_depth_fade',
          'portal_lighting_match',
          'portal_peek_through',
        ]),
      ],
    });
    const result = compiler.compile(composition);
    // All per-frame methods should be called in session delegate
    expect(result.portalARFile).toContain(
      'func session(_ session: ARSession, didUpdate frame: ARFrame)'
    );
    expect(result.portalARFile).toContain('checkPeekThrough(frame: frame)');
    expect(result.portalARFile).toContain('updateDepthOcclusion(frame: frame)');
    expect(result.portalARFile).toContain('updatePeopleOcclusion(frame: frame)');
    expect(result.portalARFile).toContain('applyParallaxCorrection(frame: frame)');
    expect(result.portalARFile).toContain('applyDepthFade(frame: frame)');
    expect(result.portalARFile).toContain('updateLightingMatch(frame: frame)');
  });

  it('should handle all portal traits combined', () => {
    const composition = createComposition({
      objects: [
        createPortalObject('Scene', [
          'portal_mode',
          'portal_occlusion',
          'portal_people_occlusion',
          'portal_parallax',
          'portal_depth_fade',
          'portal_environment_twin',
          'portal_lighting_match',
          'portal_boundary',
          'portal_edge_glow',
          'portal_world_mesh',
          'portal_mesh_occlusion',
          'portal_peek_through',
        ]),
      ],
    });
    const result = compiler.compile(composition);
    expect(result.portalARFile).toBeDefined();
    expect(result.portalARFile).toContain('PortalARManager');
    expect(result.portalARFile).toContain('sceneReconstruction');
    expect(result.portalARFile).toContain('ARMatteGenerator');
    expect(result.portalARFile).toContain('createPortalBoundary');
    expect(result.portalARFile).toContain('applyEdgeGlow');
  });
});
