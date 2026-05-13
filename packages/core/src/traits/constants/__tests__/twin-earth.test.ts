/**
 * Twin Earth Traits — comprehensive tests
 */
import { describe, it, expect } from 'vitest';
import { TWIN_EARTH_TRAITS } from '../twin-earth';
import { VR_TRAITS } from '../index';

describe('Twin Earth Traits', () => {
  it('exports 39 traits', () => {
    expect(TWIN_EARTH_TRAITS).toHaveLength(39);
  });

  it('contains EarthLayer traits', () => {
    expect(TWIN_EARTH_TRAITS).toContain('earth_layer');
    expect(TWIN_EARTH_TRAITS).toContain('earth_terrain');
    expect(TWIN_EARTH_TRAITS).toContain('earth_building');
    expect(TWIN_EARTH_TRAITS).toContain('earth_road');
    expect(TWIN_EARTH_TRAITS).toContain('earth_vegetation');
    expect(TWIN_EARTH_TRAITS).toContain('earth_water');
    expect(TWIN_EARTH_TRAITS).toContain('earth_poi');
    expect(TWIN_EARTH_TRAITS).toContain('earth_boundary');
  });

  it('contains GeoAnchor traits', () => {
    expect(TWIN_EARTH_TRAITS).toContain('game_geo_anchor');
    expect(TWIN_EARTH_TRAITS).toContain('game_geo_heading');
    expect(TWIN_EARTH_TRAITS).toContain('game_geo_radius');
    expect(TWIN_EARTH_TRAITS).toContain('game_geo_persistent');
  });

  it('contains Place traits', () => {
    expect(TWIN_EARTH_TRAITS).toContain('game_place');
    expect(TWIN_EARTH_TRAITS).toContain('place_zone');
    expect(TWIN_EARTH_TRAITS).toContain('place_ingress');
    expect(TWIN_EARTH_TRAITS).toContain('place_egress');
    expect(TWIN_EARTH_TRAITS).toContain('place_social');
    expect(TWIN_EARTH_TRAITS).toContain('place_capacity');
    expect(TWIN_EARTH_TRAITS).toContain('place_schedule');
  });

  it('contains PrivacyRule traits', () => {
    expect(TWIN_EARTH_TRAITS).toContain('privacy_rule');
    expect(TWIN_EARTH_TRAITS).toContain('privacy_collection_scope');
    expect(TWIN_EARTH_TRAITS).toContain('privacy_retention_policy');
    expect(TWIN_EARTH_TRAITS).toContain('privacy_consent_receipt');
    expect(TWIN_EARTH_TRAITS).toContain('privacy_anonymization');
    expect(TWIN_EARTH_TRAITS).toContain('privacy_opt_out');
    expect(TWIN_EARTH_TRAITS).toContain('privacy_audit_log');
  });

  it('contains LocationQuest traits', () => {
    expect(TWIN_EARTH_TRAITS).toContain('location_quest');
    expect(TWIN_EARTH_TRAITS).toContain('location_quest_checkin');
    expect(TWIN_EARTH_TRAITS).toContain('location_quest_radius');
    expect(TWIN_EARTH_TRAITS).toContain('location_quest_proximity');
    expect(TWIN_EARTH_TRAITS).toContain('location_quest_streak');
    expect(TWIN_EARTH_TRAITS).toContain('location_quest_route');
    expect(TWIN_EARTH_TRAITS).toContain('location_quest_timegate');
  });

  it('contains Degradation traits', () => {
    expect(TWIN_EARTH_TRAITS).toContain('mobile_degradation');
    expect(TWIN_EARTH_TRAITS).toContain('browser_degradation');
    expect(TWIN_EARTH_TRAITS).toContain('degradation_map_view');
    expect(TWIN_EARTH_TRAITS).toContain('degradation_static_render');
    expect(TWIN_EARTH_TRAITS).toContain('degradation_text_description');
    expect(TWIN_EARTH_TRAITS).toContain('degradation_audio_narration');
  });

  it('all traits are included in VR_TRAITS', () => {
    for (const trait of TWIN_EARTH_TRAITS) {
      expect(VR_TRAITS).toContain(trait);
    }
  });

  it('has no duplicate traits', () => {
    const unique = new Set(TWIN_EARTH_TRAITS);
    expect(unique.size).toBe(TWIN_EARTH_TRAITS.length);
  });

  it('all trait names follow snake_case convention', () => {
    for (const trait of TWIN_EARTH_TRAITS) {
      expect(trait).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
