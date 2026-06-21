/**
 * Geo-Anchor Compilation Tests
 *
 * Tests that geo-anchor traits produce correct ARCore (Android) and
 * ARKit (iOS) code for GPS-pinned persistent holographic scenes.
 */

// NOTE: the AndroidCompiler — Geo-Anchor block was removed in the 2026-06-21 Sceneform→SceneView
// retarget (geo-anchor wiring is a pending wave-2 SceneView feature port; tracked on the HoloMesh
// board). The IOSCompiler half below is unaffected.
import { describe, it, expect } from 'vitest';
import { IOSCompiler } from '../IOSCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

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
