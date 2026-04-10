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

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'GeoScene', objects: [], ...overrides } as HoloComposition;
}

function makeGeoVPSComposition(
  traits: Array<{ name: string; config?: Record<string, unknown> }>
): HoloComposition {
  return makeComposition({
    objects: [
      {
        name: 'GeoObject',
        properties: [{ key: 'geometry', value: 'box' }],
        traits: traits.map((t) => ({
          type: 'ObjectTrait' as const,
          name: t.name,
          config: t.config || {},
        })),
      },
    ] as HoloComposition['objects'],
  });
}

describe('AndroidCompiler — ARCore Geospatial API (M.010.15)', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
  });

  // =========== geospatial_vps trait ===========

  describe('geospatial_vps trait', () => {
    it('emits GeospatialMode.ENABLED in activity file', () => {
      const comp = makeGeoVPSComposition([{ name: 'geospatial_vps' }]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('GeospatialMode.ENABLED');
    });

    it('emits setupGeospatialVPS call in onCreate', () => {
      const comp = makeGeoVPSComposition([{ name: 'geospatial_vps' }]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('setupGeospatialVPS()');
    });

    it('emits Earth tracking state check', () => {
      const comp = makeGeoVPSComposition([{ name: 'geospatial_vps' }]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('cameraGeospatialPose');
      expect(result.activityFile).toContain('horizontalAccuracy');
      expect(result.activityFile).toContain('headingAccuracy');
    });

    it('adds location permissions to manifest', () => {
      const comp = makeGeoVPSComposition([{ name: 'geospatial_vps' }]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.manifestFile).toContain('ACCESS_FINE_LOCATION');
      expect(result.manifestFile).toContain('ACCESS_COARSE_LOCATION');
    });

    it('adds Geospatial API key meta-data to manifest', () => {
      const comp = makeGeoVPSComposition([{ name: 'geospatial_vps' }]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.manifestFile).toContain('com.google.android.ar.API_KEY');
      expect(result.manifestFile).toContain('GEOSPATIAL_API_KEY');
    });

    it('adds play-services-location to gradle', () => {
      const comp = makeGeoVPSComposition([{ name: 'geospatial_vps' }]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.buildGradle).toContain('play-services-location');
    });
  });

  // =========== geospatial_anchor trait ===========

  describe('geospatial_anchor trait', () => {
    it('emits createGeospatialAnchor call', () => {
      const comp = makeGeoVPSComposition([
        {
          name: 'geospatial_anchor',
          config: { latitude: 37.7749, longitude: -122.4194, altitude: 10, heading: 90 },
        },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('createGeospatialAnchor');
      expect(result.activityFile).toContain('37.7749');
      expect(result.activityFile).toContain('-122.4194');
    });

    it('emits Earth.createAnchor with quaternion heading', () => {
      const comp = makeGeoVPSComposition([
        {
          name: 'geospatial_anchor',
          config: { latitude: 0, longitude: 0, altitude: 0, heading: 0 },
        },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('earthRef.createAnchor(lat, lng, alt');
      expect(result.activityFile).toContain('Math.toRadians');
    });

    it('uses default config values when config is empty', () => {
      const comp = makeGeoVPSComposition([{ name: 'geospatial_anchor' }]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('createGeospatialAnchor');
    });
  });

  // =========== geospatial_terrain_anchor trait ===========

  describe('geospatial_terrain_anchor trait', () => {
    it('emits resolveTerrainAnchor call', () => {
      const comp = makeGeoVPSComposition([
        {
          name: 'geospatial_terrain_anchor',
          config: { latitude: 48.8566, longitude: 2.3522, altitudeOffset: 1.5, heading: 180 },
        },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('resolveTerrainAnchor');
      expect(result.activityFile).toContain('48.8566');
    });

    it('emits resolveAnchorOnTerrainAsync', () => {
      const comp = makeGeoVPSComposition([
        { name: 'geospatial_terrain_anchor', config: { latitude: 0, longitude: 0 } },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('resolveAnchorOnTerrainAsync');
      expect(result.activityFile).toContain('TerrainAnchorState.SUCCESS');
    });
  });

  // =========== geospatial_rooftop_anchor trait ===========

  describe('geospatial_rooftop_anchor trait', () => {
    it('emits resolveRooftopAnchor call', () => {
      const comp = makeGeoVPSComposition([
        {
          name: 'geospatial_rooftop_anchor',
          config: { latitude: 51.5074, longitude: -0.1278, altitudeOffset: 2.0, heading: 0 },
        },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('resolveRooftopAnchor');
      expect(result.activityFile).toContain('51.5074');
    });

    it('emits resolveAnchorOnRooftopAsync', () => {
      const comp = makeGeoVPSComposition([
        { name: 'geospatial_rooftop_anchor', config: { latitude: 0, longitude: 0 } },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('resolveAnchorOnRooftopAsync');
      expect(result.activityFile).toContain('RooftopAnchorState.SUCCESS');
    });
  });

  // =========== geospatial_streetscape trait ===========

  describe('geospatial_streetscape trait', () => {
    it('emits StreetscapeGeometryMode.ENABLED', () => {
      const comp = makeGeoVPSComposition([{ name: 'geospatial_streetscape' }]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('StreetscapeGeometryMode.ENABLED');
    });

    it('emits processStreetscapeGeometry method', () => {
      const comp = makeGeoVPSComposition([{ name: 'geospatial_streetscape' }]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('processStreetscapeGeometry');
      expect(result.activityFile).toContain('getAllTrackables(StreetscapeGeometry::class.java)');
    });

    it('does not emit streetscape code when trait is absent', () => {
      const comp = makeGeoVPSComposition([{ name: 'geospatial_vps' }]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).not.toContain('StreetscapeGeometryMode');
      expect(result.activityFile).not.toContain('processStreetscapeGeometry');
    });
  });

  // =========== No geospatial traits ===========

  describe('baseline without geospatial traits', () => {
    it('does not emit geospatial code when no traits present', () => {
      const comp = makeComposition();
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).not.toContain('setupGeospatialVPS');
      expect(result.activityFile).not.toContain('GeospatialMode');
      expect(result.manifestFile).not.toContain('com.google.android.ar.API_KEY');
      expect(result.buildGradle).not.toContain('play-services-location');
    });
  });

  // =========== Combined traits ===========

  describe('combined geospatial traits', () => {
    it('handles multiple geospatial traits on one object', () => {
      const comp = makeGeoVPSComposition([
        { name: 'geospatial_vps' },
        {
          name: 'geospatial_anchor',
          config: { latitude: 40.7128, longitude: -74.006, altitude: 5, heading: 45 },
        },
        { name: 'geospatial_streetscape' },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('GeospatialMode.ENABLED');
      expect(result.activityFile).toContain('StreetscapeGeometryMode.ENABLED');
      expect(result.activityFile).toContain('createGeospatialAnchor');
      expect(result.activityFile).toContain('processStreetscapeGeometry');
    });

    it('handles terrain + rooftop anchors together', () => {
      const comp = makeComposition({
        objects: [
          {
            name: 'TerrainObj',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'geospatial_terrain_anchor',
                config: { latitude: 1, longitude: 2 },
              },
            ],
          },
          {
            name: 'RooftopObj',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'geospatial_rooftop_anchor',
                config: { latitude: 3, longitude: 4 },
              },
            ],
          },
        ] as HoloComposition['objects'],
      });
      const result = compiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('resolveTerrainAnchor');
      expect(result.activityFile).toContain('resolveRooftopAnchor');
    });
  });

  // =========== Trait constants ===========

  describe('trait constants', () => {
    it('exports GEOSPATIAL_ARCORE_TRAITS with 6 traits', async () => {
      const { GEOSPATIAL_ARCORE_TRAITS } = await import('../../traits/constants/geospatial');
      expect(GEOSPATIAL_ARCORE_TRAITS).toHaveLength(6);
      expect(GEOSPATIAL_ARCORE_TRAITS).toContain('geospatial_vps');
      expect(GEOSPATIAL_ARCORE_TRAITS).toContain('geospatial_anchor');
      expect(GEOSPATIAL_ARCORE_TRAITS).toContain('geospatial_terrain_anchor');
      expect(GEOSPATIAL_ARCORE_TRAITS).toContain('geospatial_rooftop_anchor');
      expect(GEOSPATIAL_ARCORE_TRAITS).toContain('geospatial_streetscape');
      expect(GEOSPATIAL_ARCORE_TRAITS).toContain('geospatial_heading');
    });

    it('exports GEOSPATIAL_DEFAULTS with sensible values', async () => {
      const { GEOSPATIAL_DEFAULTS } = await import('../../traits/constants/geospatial');
      expect(GEOSPATIAL_DEFAULTS.vps.accuracyThreshold).toBe(25);
      expect(GEOSPATIAL_DEFAULTS.vps.headingAccuracyThreshold).toBe(25);
      expect(GEOSPATIAL_DEFAULTS.vps.localizationTimeout).toBe(30_000);
      expect(GEOSPATIAL_DEFAULTS.anchor.resolveTimeout).toBe(10_000);
      expect(GEOSPATIAL_DEFAULTS.streetscape.enableTerrain).toBe(true);
      expect(GEOSPATIAL_DEFAULTS.streetscape.enableBuildings).toBe(true);
    });

    it('traits are included in VR_TRAITS barrel', async () => {
      const { VR_TRAITS } = await import('../../traits/constants/index');
      expect(VR_TRAITS).toContain('geospatial_vps');
      expect(VR_TRAITS).toContain('geospatial_streetscape');
    });
  });
});
