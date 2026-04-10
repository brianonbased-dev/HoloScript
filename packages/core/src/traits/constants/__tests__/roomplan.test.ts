import { describe, it, expect } from 'vitest';
import { ROOMPLAN_TRAITS } from '../roomplan';
import { VR_TRAITS } from '../index';

describe('RoomPlan Traits', () => {
  it('exports 21 traits', () => {
    expect(ROOMPLAN_TRAITS).toHaveLength(21);
  });

  it('contains scanning traits', () => {
    expect(ROOMPLAN_TRAITS).toContain('roomplan_scan');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_realtime_preview');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_scan_quality');
  });

  it('contains structural surface traits', () => {
    expect(ROOMPLAN_TRAITS).toContain('roomplan_wall');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_floor');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_ceiling');
  });

  it('contains opening traits', () => {
    expect(ROOMPLAN_TRAITS).toContain('roomplan_door');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_window');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_opening');
  });

  it('contains furniture & fixture traits', () => {
    expect(ROOMPLAN_TRAITS).toContain('roomplan_furniture');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_table');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_chair');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_sofa');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_bed');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_storage');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_appliance');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_fixture');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_screen');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_fireplace');
  });

  it('contains output traits', () => {
    expect(ROOMPLAN_TRAITS).toContain('roomplan_scene_export');
    expect(ROOMPLAN_TRAITS).toContain('roomplan_coordinate_map');
  });

  it('all traits are included in VR_TRAITS', () => {
    for (const trait of ROOMPLAN_TRAITS) {
      expect(VR_TRAITS).toContain(trait);
    }
  });

  it('has no duplicate traits', () => {
    const unique = new Set(ROOMPLAN_TRAITS);
    expect(unique.size).toBe(ROOMPLAN_TRAITS.length);
  });

  it('all trait names follow snake_case convention', () => {
    for (const trait of ROOMPLAN_TRAITS) {
      expect(trait).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('all traits start with roomplan_ prefix', () => {
    for (const trait of ROOMPLAN_TRAITS) {
      expect(trait).toMatch(/^roomplan_/);
    }
  });
});
