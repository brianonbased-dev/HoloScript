/**
 * DayNightCycle.prod.test.ts
 *
 * Production tests for DayNightCycle — time control, sun/moon angles,
 * intensities, ambient colour, period classification, events, and update loop.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DayNightCycle } from '../DayNightCycle';
import type { TimeOfDay } from '../DayNightCycle';

describe('DayNightCycle', () => {
  let dnc: DayNightCycle;

  beforeEach(() => { dnc = new DayNightCycle(); });

  // -------------------------------------------------------------------------
  // Time control
  // -------------------------------------------------------------------------
  describe('setTime / getTime', () => {
    it('default start time is 8', () => {
      expect(dnc.getTime()).toBe(8);
    });

    it('setTime(12) → getTime() === 12', () => {
      dnc.setTime(12);
      expect(dnc.getTime()).toBe(12);
    });

    it('setTime wraps values ≥ 24', () => {
      dnc.setTime(25);
      expect(dnc.getTime()).toBeCloseTo(1);
    });

    it('setTime wraps negative values', () => {
      dnc.setTime(-1);
      expect(dnc.getTime()).toBeCloseTo(23);
    });
  });

  // -------------------------------------------------------------------------
  // Time scale & pause
  // -------------------------------------------------------------------------
  describe('timeScale / pause / resume', () => {
    it('default timeScale is 1', () => {
      expect(dnc.getTimeScale()).toBe(1);
    });

    it('setTimeScale clamps to 0 minimum', () => {
      dnc.setTimeScale(-5);
      expect(dnc.getTimeScale()).toBe(0);
    });

    it('pause prevents time advancing', () => {
      dnc.setTime(8);
      dnc.pause();
      dnc.update(3600);
      expect(dnc.getTime()).toBe(8);
    });

    it('resume allows time to advance', () => {
      dnc.setTime(8);
      dnc.pause();
      dnc.resume();
      dnc.update(1); // 1 real second at scale=1 → 1/3600 hours
      expect(dnc.getTime()).toBeCloseTo(8 + 1 / 3600, 3);
    });

    it('isPaused reflects state', () => {
      dnc.pause();
      expect(dnc.isPaused()).toBe(true);
      dnc.resume();
      expect(dnc.isPaused()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Update & day rollover
  // -------------------------------------------------------------------------
  describe('update() — time advance and day rollover', () => {
    it('advance by 1 hour: dt=3600 at scale=1', () => {
      dnc.setTime(8);
      dnc.update(3600); // 3600s * 1 / 3600 = 1 hour
      expect(dnc.getTime()).toBeCloseTo(9, 2);
    });

    it('advance by 1 hour at timeScale=3600', () => {
      dnc.setTime(8);
      dnc.setTimeScale(3600);
      dnc.update(1); // 1 real second × 3600 scale / 3600 = 1 hour
      expect(dnc.getTime()).toBeCloseTo(9, 3);
    });

    it('day rollover increments dayCount', () => {
      dnc.setTime(23.9);
      dnc.setTimeScale(3600);
      dnc.update(10); // push past midnight
      expect(dnc.getDayCount()).toBe(1);
    });

    it('time wraps to [0, 24) after rollover', () => {
      dnc.setTime(23.9);
      dnc.setTimeScale(3600);
      dnc.update(10);
      expect(dnc.getTime()).toBeGreaterThanOrEqual(0);
      expect(dnc.getTime()).toBeLessThan(24);
    });
  });

  // -------------------------------------------------------------------------
  // Sun / Moon
  // -------------------------------------------------------------------------
  describe('getSunAngle()', () => {
    it('sun angle at 6 = 0 (sunrise)', () => {
      dnc.setTime(6);
      expect(dnc.getSunAngle()).toBeCloseTo(0);
    });

    it('sun angle at 12 (noon) = 90°', () => {
      dnc.setTime(12);
      expect(dnc.getSunAngle()).toBeCloseTo(90);
    });

    it('sun angle at 18 (sunset) = 180°', () => {
      dnc.setTime(18);
      expect(dnc.getSunAngle()).toBeCloseTo(180);
    });

    it('sun below horizon at night → -1', () => {
      dnc.setTime(0);
      expect(dnc.getSunAngle()).toBe(-1);
    });
  });

  describe('getMoonAngle()', () => {
    it('moon angle at 0 = 30° (0 + 6 = 6 hours into 12-hr arc)', () => {
      dnc.setTime(0);
      expect(dnc.getMoonAngle()).toBeCloseTo((6 / 12) * 180);
    });

    it('moon angle at 18 = 0° (moonrise)', () => {
      dnc.setTime(18);
      expect(dnc.getMoonAngle()).toBeCloseTo(0);
    });

    it('moon below horizon during day → -1', () => {
      dnc.setTime(12);
      expect(dnc.getMoonAngle()).toBe(-1);
    });
  });

  describe('getSunIntensity() / getMoonIntensity()', () => {
    it('sun intensity at noon ≈ 1 (sin(90°))', () => {
      dnc.setTime(12);
      expect(dnc.getSunIntensity()).toBeCloseTo(1, 5);
    });

    it('sun intensity at night = 0', () => {
      dnc.setTime(0);
      expect(dnc.getSunIntensity()).toBe(0);
    });

    it('moon intensity at midnight is positive', () => {
      dnc.setTime(0);
      expect(dnc.getMoonIntensity()).toBeGreaterThan(0);
    });

    it('moon intensity never exceeds 0.3', () => {
      for (const t of [0, 18, 21, 6]) {
        dnc.setTime(t);
        expect(dnc.getMoonIntensity()).toBeLessThanOrEqual(0.3 + 1e-9);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Ambient colour
  // -------------------------------------------------------------------------
  describe('getAmbientColor()', () => {
    it('noon → day colour (r=1, g≈0.95, b≈0.9)', () => {
      dnc.setTime(12);
      const c = dnc.getAmbientColor();
      expect(c.r).toBe(1);
      expect(c.g).toBeCloseTo(0.95);
    });

    it('midnight → night colour (dark blue-ish)', () => {
      dnc.setTime(0);
      const c = dnc.getAmbientColor();
      expect(c.r).toBeLessThan(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // Period classification
  // -------------------------------------------------------------------------
  describe('getPeriod()', () => {
    const cases: [number, TimeOfDay][] = [
      [5.5, 'dawn'],
      [9, 'morning'],
      [12, 'noon'],
      [14, 'afternoon'],
      [18, 'dusk'],
      [20, 'evening'],
      [23, 'night'],
      [1.5, 'midnight'],
    ];
    for (const [h, expected] of cases) {
      it(`time=${h} → period="${expected}"`, () => {
        dnc.setTime(h);
        expect(dnc.getPeriod()).toBe(expected);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Period change event
  // -------------------------------------------------------------------------
  describe('onPeriodChange()', () => {
    it('fires callback when period changes', () => {
      dnc.setTime(10.9); // late morning
      const cb = vi.fn();
      dnc.onPeriodChange(cb);
      // Jump to noon (period changes: morning → noon)
      dnc.setTime(12);
      dnc.setTimeScale(3600);
      dnc.update(1); // advance slightly inside noon
      expect(cb).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getState / getFormattedTime
  // -------------------------------------------------------------------------
  describe('getState()', () => {
    it('returns all expected fields', () => {
      dnc.setTime(12);
      const s = dnc.getState();
      expect(s).toHaveProperty('time');
      expect(s).toHaveProperty('sunAngle');
      expect(s).toHaveProperty('moonAngle');
      expect(s).toHaveProperty('sunIntensity');
      expect(s).toHaveProperty('moonIntensity');
      expect(s).toHaveProperty('ambientColor');
      expect(s).toHaveProperty('period');
      expect(s).toHaveProperty('dayCount');
    });
  });

  describe('getFormattedTime()', () => {
    it('formats 8h as "08:00"', () => {
      dnc.setTime(8);
      expect(dnc.getFormattedTime()).toBe('08:00');
    });

    it('formats 13.5h as "13:30"', () => {
      dnc.setTime(13.5);
      expect(dnc.getFormattedTime()).toBe('13:30');
    });
  });
});
