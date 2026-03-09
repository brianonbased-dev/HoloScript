/**
 * traitConstraints Production Tests
 *
 * Validates BUILTIN_CONSTRAINTS data integrity, coverage, and rule types.
 */

import { describe, it, expect } from 'vitest';
import { BUILTIN_CONSTRAINTS } from '../traitConstraints';

describe('traitConstraints (BUILTIN_CONSTRAINTS) — Production', () => {
  it('is non-empty', () => {
    expect(BUILTIN_CONSTRAINTS.length).toBeGreaterThan(0);
  });

  describe('schema validation', () => {
    for (const [i, constraint] of BUILTIN_CONSTRAINTS.entries()) {
      describe(`constraint[${i}] ${constraint.source}`, () => {
        it('has valid type', () => {
          expect(['requires', 'conflicts', 'oneof']).toContain(constraint.type);
        });

        it('has source', () => {
          expect(constraint.source.length).toBeGreaterThan(0);
        });

        it('has targets', () => {
          expect(constraint.targets.length).toBeGreaterThan(0);
        });

        it('has message', () => {
          expect(constraint.message.length).toBeGreaterThan(0);
        });
      });
    }
  });

  describe('physics chain', () => {
    it('physics requires collidable', () => {
      const c = BUILTIN_CONSTRAINTS.find((c) => c.source === 'physics' && c.type === 'requires');
      expect(c?.targets).toContain('collidable');
    });

    it('grabbable requires physics', () => {
      const c = BUILTIN_CONSTRAINTS.find((c) => c.source === 'grabbable' && c.type === 'requires');
      expect(c?.targets).toContain('physics');
    });

    it('throwable requires grabbable', () => {
      const c = BUILTIN_CONSTRAINTS.find((c) => c.source === 'throwable' && c.type === 'requires');
      expect(c?.targets).toContain('grabbable');
    });
  });

  describe('conflict rules', () => {
    it('static conflicts physics', () => {
      const c = BUILTIN_CONSTRAINTS.find((c) => c.source === 'static' && c.type === 'conflicts');
      expect(c?.targets).toContain('physics');
    });

    it('vr_only conflicts ar_only', () => {
      const c = BUILTIN_CONSTRAINTS.find((c) => c.source === 'vr_only' && c.type === 'conflicts');
      expect(c?.targets).toContain('ar_only');
    });
  });

  describe('oneof rules', () => {
    it('interaction_mode is oneof', () => {
      const c = BUILTIN_CONSTRAINTS.find((c) => c.source === 'interaction_mode');
      expect(c?.type).toBe('oneof');
    });

    it('ui_position_mode is oneof', () => {
      const c = BUILTIN_CONSTRAINTS.find((c) => c.source === 'ui_position_mode');
      expect(c?.type).toBe('oneof');
    });
  });
});
