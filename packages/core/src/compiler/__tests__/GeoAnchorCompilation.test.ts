/**
 * Geo-Anchor Compilation Tests
 *
 * Tests that geo-anchor traits produce correct ARCore (Android) and
 * ARKit (iOS) code for GPS-pinned persistent holographic scenes.
 */

import { describe, it, expect, vi } from 'vitest';
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

function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'GeoTestScene',
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

function createGeoObject(
  name: string,
  traits: Array<string | { name: string; config?: Record<string, unknown> }> = []
): HoloObjectDecl {
  return {
    name,
    properties: [{ key: 'geometry', value: 'cube' }],
    traits,
  } as HoloObjectDecl;
}

describe('AndroidCompiler - Geo-Anchor', () => {
  const compiler = new AndroidCompiler();

  it('emits SceneView-native geo-anchor sidecar when geo_anchor is present', () => {
    const composition = createComposition({
      objects: [
        createGeoObject('Landmark', [
          { name: 'geo_anchor', config: { latitude: 34.0522, longitude: -118.2437 } },
          { name: 'geo_altitude', config: { meters: 12 } },
          { name: 'geo_compass_heading', config: { degrees: 45 } },
          'geo_persist',
        ]),
      ],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.geoAnchorSetup).toContain('SceneViewGeoAnchor');
    expect(result.geoAnchorSetup).toContain('setupGeoAnchors');
    expect(result.geoAnchorSetup).toContain('configureSessionForGeospatial');
    expect(result.geoAnchorSetup).toContain('createGeoAnchor');
    expect(result.geoAnchorSetup).toContain('34.0522');
    expect(result.geoAnchorSetup).toContain('-118.2437');
    expect(result.geoAnchorSetup).toContain('12');
    expect(result.geoAnchorSetup).toContain('45f');
    expect(result.geoAnchorSetup).toContain('saveGeoAnchorToCloud');
    expect(result.geoAnchorSetup).toContain('restoreGeoAnchors');
    expect(result.manifestFile).toContain('ACCESS_FINE_LOCATION');
    expect(result.buildGradle).toContain('play-services-location');
    expectNoSceneform(result.geoAnchorSetup);
  });

  it('writes GeoAnchorSetup.kt in compileToFiles', () => {
    const composition = createComposition({
      objects: [createGeoObject('Pin', ['geo_anchor'])],
    });
    const files = compiler.compileToFiles(composition, 'test-token');
    expect(files).toHaveProperty('app/src/main/java/com/holoscript/generated/GeoAnchorSetup.kt');
  });

  it('does not emit geo-anchor sidecar without geo traits', () => {
    const composition = createComposition({
      objects: [createGeoObject('Plain', [])],
    });
    const result = compiler.compile(composition, 'test-token');
    expect(result.geoAnchorSetup).toBeUndefined();
    expect(result.buildGradle).not.toContain('play-services-location');
  });
});

describe('IOSCompiler — Geo-Anchor', () => {
  const compiler = new IOSCompiler();

  it('emits geo-anchor methods when geo_anchor trait is present', () => {
    const composition = createComposition({
      objects: [
        createGeoObject('Landmark', [
          { name: 'geo_anchor', config: { latitude: 34.0522, longitude: -118.2437 } },
        ]),
      ],
    });
    const result = compiler.compile(composition);

    expect(result.stateFile).toContain('setupGeoAnchors');
    expect(result.stateFile).toContain('createLocationAnchor');
    expect(result.stateFile).toContain('34.0522');
    expect(result.stateFile).toContain('-118.2437');
  });

  it('imports CoreLocation when geo traits present', () => {
    const composition = createComposition({
      objects: [createGeoObject('Pin', ['geo_anchor'])],
    });
    const result = compiler.compile(composition);

    expect(result.viewFile).toContain('import CoreLocation');
  });

  it('does not import CoreLocation without geo traits', () => {
    const composition = createComposition({
      objects: [createGeoObject('Plain', ['clickable'])],
    });
    const result = compiler.compile(composition);

    expect(result.viewFile).not.toContain('CoreLocation');
  });

  it('adds location permission to Info.plist when geo traits present', () => {
    const composition = createComposition({
      objects: [createGeoObject('Pin', ['geo_anchor'])],
    });
    const result = compiler.compile(composition);

    expect(result.infoPlist).toContain('NSLocationWhenInUseUsageDescription');
    expect(result.infoPlist).toContain('location-services');
  });

  it('does not add location permission without geo traits', () => {
    const composition = createComposition({
      objects: [createGeoObject('Plain', [])],
    });
    const result = compiler.compile(composition);

    expect(result.infoPlist).not.toContain('NSLocationWhenInUseUsageDescription');
  });

  it('emits ARWorldMap persistence when geo_persist is present', () => {
    const composition = createComposition({
      objects: [createGeoObject('Persistent', ['geo_anchor', 'geo_persist'])],
    });
    const result = compiler.compile(composition);

    expect(result.stateFile).toContain('saveWorldMap');
    expect(result.stateFile).toContain('restoreWorldMap');
    expect(result.stateFile).toContain('ARWorldMap');
    expect(result.stateFile).toContain('worldMapURL');
  });

  it('emits ARGeoAnchor when geo_arkit_geo_anchor trait present', () => {
    const composition = createComposition({
      objects: [createGeoObject('GeoObj', ['geo_anchor', 'geo_arkit_geo_anchor'])],
    });
    const result = compiler.compile(composition);

    expect(result.stateFile).toContain('ARGeoAnchor');
    expect(result.stateFile).toContain('ARGeoTrackingConfiguration');
    expect(result.stateFile).toContain('createGeoAnchor');
  });

  it('does not emit geo code for compositions without geo traits', () => {
    const composition = createComposition({
      objects: [createGeoObject('NormalCube', [])],
    });
    const result = compiler.compile(composition);

    expect(result.stateFile).not.toContain('setupGeoAnchors');
    expect(result.stateFile).not.toContain('CLLocationManager');
  });
});
