import { describe, it, expect } from 'vitest';
import { GEO_ANCHOR_TRAITS } from '../mobile/geo-anchor';
import { VR_TRAITS } from '../index';

describe('Geo-Anchor Traits', () => {
  it('exports 12 traits', () => {
    expect(GEO_ANCHOR_TRAITS).toHaveLength(12);
  });

  it('contains anchor traits', () => {
    expect(GEO_ANCHOR_TRAITS).toContain('geo_anchor');
    expect(GEO_ANCHOR_TRAITS).toContain('geo_altitude');
    expect(GEO_ANCHOR_TRAITS).toContain('geo_compass_heading');
    expect(GEO_ANCHOR_TRAITS).toContain('geo_terrain_snap');
  });

  it('contains persistence traits', () => {
    expect(GEO_ANCHOR_TRAITS).toContain('geo_persist');
    expect(GEO_ANCHOR_TRAITS).toContain('geo_cloud_anchor');
    expect(GEO_ANCHOR_TRAITS).toContain('geo_session_continuity');
  });

  it('contains radius and discovery traits', () => {
    expect(GEO_ANCHOR_TRAITS).toContain('geo_radius');
    expect(GEO_ANCHOR_TRAITS).toContain('geo_proximity_trigger');
    expect(GEO_ANCHOR_TRAITS).toContain('geo_discoverable');
  });

  it('contains platform hint traits', () => {
    expect(GEO_ANCHOR_TRAITS).toContain('geo_arcore_geospatial');
    expect(GEO_ANCHOR_TRAITS).toContain('geo_arkit_geo_anchor');
  });

  it('all traits are included in VR_TRAITS', () => {
    for (const trait of GEO_ANCHOR_TRAITS) {
      expect(VR_TRAITS).toContain(trait);
    }
  });

  it('has no duplicate traits', () => {
    const unique = new Set(GEO_ANCHOR_TRAITS);
    expect(unique.size).toBe(GEO_ANCHOR_TRAITS.length);
  });

  it('all trait names follow snake_case convention', () => {
    for (const trait of GEO_ANCHOR_TRAITS) {
      expect(trait).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
