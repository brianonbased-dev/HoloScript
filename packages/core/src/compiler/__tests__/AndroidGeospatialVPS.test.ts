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

function makeComposition(
  traits: Array<{ name: string; config?: Record<string, unknown> }>
): HoloComposition {
  return {
    name: 'GeoVPSScene',
    objects: [
      {
        name: 'GeoObject',
        properties: [{ key: 'geometry', value: 'box' }],
        traits: traits.map((trait) => ({
          type: 'ObjectTrait' as const,
          name: trait.name,
          config: trait.config ?? {},
        })),
      },
    ],
  } as HoloComposition;
}

describe('AndroidCompiler - SceneView Geospatial VPS sidecar', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
  });

  it('emits GeospatialMode and Earth tracking into geospatialVPSSetup', () => {
    const result = compiler.compile(makeComposition([{ name: 'geospatial_vps' }]), 'test-token');

    expect(result.geospatialVPSSetup).toContain('setupGeospatialVPS');
    expect(result.geospatialVPSSetup).toContain('GeospatialMode.ENABLED');
    expect(result.geospatialVPSSetup).toContain('cameraGeospatialPose');
    expect(result.geospatialVPSSetup).toContain('horizontalAccuracyThreshold = 25.0');
    expect(result.geospatialVPSSetup).toContain('headingAccuracyThreshold = 25.0');
    expect(result.manifestFile).toContain('ACCESS_FINE_LOCATION');
    expect(result.manifestFile).toContain('com.google.android.ar.API_KEY');
    expect(result.buildGradle).toContain('play-services-location');
    expect(result.activityFile).not.toContain('setupGeospatialVPS');
    expectNoSceneform(result.geospatialVPSSetup);
  });

  it('emits anchor, terrain, rooftop, and streetscape helpers', () => {
    const result = compiler.compile(
      makeComposition([
        { name: 'geospatial_anchor' },
        { name: 'geospatial_terrain_anchor' },
        { name: 'geospatial_rooftop_anchor' },
        { name: 'geospatial_streetscape' },
      ]),
      'test-token'
    );

    expect(result.geospatialVPSSetup).toContain('createGeospatialAnchor');
    expect(result.geospatialVPSSetup).toContain('earthRef.createAnchor');
    expect(result.geospatialVPSSetup).toContain('resolveAnchorOnTerrainAsync');
    expect(result.geospatialVPSSetup).toContain('resolveAnchorOnRooftopAsync');
    expect(result.geospatialVPSSetup).toContain('StreetscapeGeometryMode.ENABLED');
    expect(result.geospatialVPSSetup).toContain('processStreetscapeGeometry');
    expect(result.geospatialVPSSetup).toContain(
      'getAllTrackables(StreetscapeGeometry::class.java)'
    );
    expectNoSceneform(result.geospatialVPSSetup);
  });

  it('writes GeospatialVPSSetup.kt in compileToFiles', () => {
    const files = compiler.compileToFiles(
      makeComposition([{ name: 'geospatial_vps' }]),
      'test-token'
    );
    expect(files).toHaveProperty(
      'app/src/main/java/com/holoscript/generated/GeospatialVPSSetup.kt'
    );
  });

  it('does not emit geospatial artifacts without geospatial traits', () => {
    const result = compiler.compile(
      { name: 'PlainScene', objects: [] } as unknown as HoloComposition,
      'test-token'
    );
    expect(result.geospatialVPSSetup).toBeUndefined();
    expect(result.manifestFile).not.toContain('com.google.android.ar.API_KEY');
    expect(result.buildGradle).not.toContain('play-services-location');
  });
});
