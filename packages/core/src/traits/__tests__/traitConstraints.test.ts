/**
 * traitConstraints Tests
 *
 * Tests the built-in trait constraint definitions: validates structure,
 * ensures completeness, and verifies key constraint relationships.
 */

import { describe, it, expect } from 'vitest';
import { BUILTIN_CONSTRAINTS } from '../traitConstraints';

describe('traitConstraints — BUILTIN_CONSTRAINTS', () => {
  describe('structural integrity', () => {
    it('exports a non-empty array', () => {
      expect(Array.isArray(BUILTIN_CONSTRAINTS)).toBe(true);
      expect(BUILTIN_CONSTRAINTS.length).toBeGreaterThan(0);
    });

    it('every constraint has a valid type', () => {
      const validTypes = ['requires', 'conflicts', 'oneof'];
      for (const constraint of BUILTIN_CONSTRAINTS) {
        expect(validTypes).toContain(constraint.type);
      }
    });

    it('every constraint has a non-empty source', () => {
      for (const constraint of BUILTIN_CONSTRAINTS) {
        expect(typeof constraint.source).toBe('string');
        expect(constraint.source.length).toBeGreaterThan(0);
      }
    });

    it('every constraint has a non-empty targets array', () => {
      for (const constraint of BUILTIN_CONSTRAINTS) {
        expect(Array.isArray(constraint.targets)).toBe(true);
        expect(constraint.targets.length).toBeGreaterThan(0);
        for (const target of constraint.targets) {
          expect(typeof target).toBe('string');
          expect(target.length).toBeGreaterThan(0);
        }
      }
    });

    it('every constraint has a message string', () => {
      for (const constraint of BUILTIN_CONSTRAINTS) {
        expect(typeof constraint.message).toBe('string');
        expect(constraint.message!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('physics & interaction requirements', () => {
    it('physics requires collidable', () => {
      const c = BUILTIN_CONSTRAINTS.find((x) => x.type === 'requires' && x.source === 'physics');
      expect(c).toBeDefined();
      expect(c!.targets).toContain('collidable');
    });

    it('grabbable requires physics', () => {
      const c = BUILTIN_CONSTRAINTS.find((x) => x.type === 'requires' && x.source === 'grabbable');
      expect(c).toBeDefined();
      expect(c!.targets).toContain('physics');
    });

    it('throwable requires grabbable', () => {
      const c = BUILTIN_CONSTRAINTS.find((x) => x.type === 'requires' && x.source === 'throwable');
      expect(c).toBeDefined();
      expect(c!.targets).toContain('grabbable');
    });
  });

  describe('conflict rules', () => {
    it('static conflicts with physics and interaction traits', () => {
      const c = BUILTIN_CONSTRAINTS.find((x) => x.type === 'conflicts' && x.source === 'static');
      expect(c).toBeDefined();
      expect(c!.targets).toContain('physics');
      expect(c!.targets).toContain('grabbable');
    });

    it('kinematic conflicts with physics', () => {
      const c = BUILTIN_CONSTRAINTS.find((x) => x.type === 'conflicts' && x.source === 'kinematic');
      expect(c).toBeDefined();
      expect(c!.targets).toContain('physics');
    });

    it('invisible conflicts with hover and pointer', () => {
      const c = BUILTIN_CONSTRAINTS.find((x) => x.type === 'conflicts' && x.source === 'invisible');
      expect(c).toBeDefined();
      expect(c!.targets).toContain('hoverable');
      expect(c!.targets).toContain('pointable');
    });
  });

  describe('platform exclusivity', () => {
    it('vr_only conflicts with ar_only', () => {
      const c = BUILTIN_CONSTRAINTS.find((x) => x.type === 'conflicts' && x.source === 'vr_only');
      expect(c).toBeDefined();
      expect(c!.targets).toContain('ar_only');
    });

    it('desktop_only conflicts with vr_only and ar_only', () => {
      const c = BUILTIN_CONSTRAINTS.find(
        (x) => x.type === 'conflicts' && x.source === 'desktop_only'
      );
      expect(c).toBeDefined();
      expect(c!.targets).toContain('vr_only');
      expect(c!.targets).toContain('ar_only');
    });
  });

  describe('material & mesh dependencies', () => {
    it('cloth requires mesh', () => {
      const c = BUILTIN_CONSTRAINTS.find((x) => x.type === 'requires' && x.source === 'cloth');
      expect(c).toBeDefined();
      expect(c!.targets).toContain('mesh');
    });

    it('soft_body requires mesh', () => {
      const c = BUILTIN_CONSTRAINTS.find((x) => x.type === 'requires' && x.source === 'soft_body');
      expect(c).toBeDefined();
      expect(c!.targets).toContain('mesh');
    });
  });

  describe('networking requirements', () => {
    it('networked requires physics', () => {
      const c = BUILTIN_CONSTRAINTS.find((x) => x.type === 'requires' && x.source === 'networked');
      expect(c).toBeDefined();
      expect(c!.targets).toContain('physics');
    });

    it('local_only conflicts with networked', () => {
      const c = BUILTIN_CONSTRAINTS.find(
        (x) => x.type === 'conflicts' && x.source === 'local_only'
      );
      expect(c).toBeDefined();
      expect(c!.targets).toContain('networked');
    });
  });

  describe('one-of rules', () => {
    it('has interaction_mode oneof constraint', () => {
      const c = BUILTIN_CONSTRAINTS.find(
        (x) => x.type === 'oneof' && x.source === 'interaction_mode'
      );
      expect(c).toBeDefined();
      expect(c!.targets).toContain('grabbable');
      expect(c!.targets).toContain('clickable');
      expect(c!.targets).toContain('draggable');
    });

    it('has ui_position_mode oneof constraint', () => {
      const c = BUILTIN_CONSTRAINTS.find(
        (x) => x.type === 'oneof' && x.source === 'ui_position_mode'
      );
      expect(c).toBeDefined();
      expect(c!.targets.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('UI constraints', () => {
    it('ui_floating conflicts with ui_anchored and ui_docked', () => {
      const c = BUILTIN_CONSTRAINTS.find(
        (x) => x.type === 'conflicts' && x.source === 'ui_floating'
      );
      expect(c).toBeDefined();
      expect(c!.targets).toContain('ui_anchored');
      expect(c!.targets).toContain('ui_docked');
    });

    it('ui_keyboard requires ui_input', () => {
      const c = BUILTIN_CONSTRAINTS.find(
        (x) => x.type === 'requires' && x.source === 'ui_keyboard'
      );
      expect(c).toBeDefined();
      expect(c!.targets).toContain('ui_input');
    });
  });
});
