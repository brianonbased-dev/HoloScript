/**
 * Portal AR Compiler Codegen Tests (M.010.06)
 *
 * Verifies that AndroidCompiler and IOSCompiler emit correct native code
 * when portal_* traits are present in a HoloComposition.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AndroidCompiler } from '../AndroidCompiler';
import { IOSCompiler } from '../IOSCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

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
function createPortalObject(
  name: string,
  traitNames: string[]
): HoloObjectDecl {
  return {
    name,
    properties: [],
    traits: traitNames.map((t) => ({ name: t, config: {} })),
  } as unknown as HoloObjectDecl;
}

describe('Portal AR — AndroidCompiler', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
  });

  it('should not emit portal code when no portal traits present', () => {
    const composition = createComposition({
      objects: [createPortalObject('Cube', [])],
    });
    const result = compiler.compile(composition);
    expect(result.activityFile).not.toContain('setupPortalAR');
    expect(result.activityFile).not.toContain('Portal AR');
  });

  it('should emit setupPortalAR when portal_mode trait present', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_mode'])],
    });
    const result = compiler.compile(composition);
    expect(result.activityFile).toContain('setupPortalAR()');
    expect(result.activityFile).toContain('Portal AR');
    expect(result.activityFile).toContain('HolographicRenderer');
  });

  it('should configure ARCore depth mode', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_mode'])],
    });
    const result = compiler.compile(composition);
    expect(result.activityFile).toContain('Config.DepthMode.AUTOMATIC');
    expect(result.activityFile).toContain('Config.LightEstimationMode.ENVIRONMENTAL_HDR');
  });

  it('should emit depth occlusion code for portal_occlusion', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_occlusion'])],
    });
    const result = compiler.compile(composition);
    expect(result.activityFile).toContain('acquireDepthImage16Bits');
    expect(result.activityFile).toContain('updateDepthOcclusion');
  });

  it('should emit parallax correction for portal_parallax', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_parallax'])],
    });
    const result = compiler.compile(composition);
    expect(result.activityFile).toContain('applyParallaxCorrection');
    expect(result.activityFile).toContain('cameraPose');
  });

  it('should emit depth fade for portal_depth_fade', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_depth_fade'])],
    });
    const result = compiler.compile(composition);
    expect(result.activityFile).toContain('enableDepthFade');
    expect(result.activityFile).toContain('nearPlane');
    expect(result.activityFile).toContain('farPlane');
  });

  it('should emit world mesh code for portal_world_mesh', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_world_mesh'])],
    });
    const result = compiler.compile(composition);
    expect(result.activityFile).toContain('reconstructMesh');
    expect(result.activityFile).toContain('updateMeshOcclusion');
  });

  it('should emit peek through via tilt for portal_peek_through', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_peek_through'])],
    });
    const result = compiler.compile(composition);
    expect(result.activityFile).toContain('SensorManager');
    expect(result.activityFile).toContain('portalTiltThreshold');
    expect(result.activityFile).toContain('setPortalVisibility');
  });

  it('should emit boundary setup for portal_boundary', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_boundary'])],
    });
    const result = compiler.compile(composition);
    expect(result.activityFile).toContain('PortalBoundary');
    expect(result.activityFile).toContain('Shape.CIRCLE');
  });

  it('should emit lighting match for portal_lighting_match', () => {
    const composition = createComposition({
      objects: [createPortalObject('Scene', ['portal_lighting_match'])],
    });
    const result = compiler.compile(composition);
    expect(result.activityFile).toContain('lightEstimate');
    expect(result.activityFile).toContain('updateLighting');
    expect(result.activityFile).toContain('getColorCorrection');
  });

  it('should handle multiple portal traits together', () => {
    const composition = createComposition({
      objects: [
        createPortalObject('Scene', [
          'portal_mode',
          'portal_occlusion',
          'portal_parallax',
          'portal_depth_fade',
          'portal_lighting_match',
          'portal_boundary',
        ]),
      ],
    });
    const result = compiler.compile(composition);
    expect(result.activityFile).toContain('setupPortalAR');
    expect(result.activityFile).toContain('updateDepthOcclusion');
    expect(result.activityFile).toContain('applyParallaxCorrection');
    expect(result.activityFile).toContain('enableDepthFade');
    expect(result.activityFile).toContain('updateLighting');
    expect(result.activityFile).toContain('PortalBoundary');
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
    expect(result.portalARFile).toContain('func session(_ session: ARSession, didUpdate frame: ARFrame)');
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
