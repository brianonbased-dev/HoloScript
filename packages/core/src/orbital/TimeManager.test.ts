/**
 * Tests for TimeManager
 *
 * Covers:
 * - Constructor and initial state
 * - Time scale setting
 * - Pause/play/toggle
 * - Time advance
 * - Date setting
 * - Callback registration/deregistration
 * - State serialization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimeManager } from './TimeManager';

describe('TimeManager', () => {
  let tm: TimeManager;

  beforeEach(() => {
    tm = new TimeManager(new Date('2025-01-01T12:00:00Z'));
  });

  afterEach(() => {
    tm.stop();
  });

  describe('constructor', () => {
    it('initializes with given date', () => {
      const date = tm.getDate();
      expect(date.getFullYear()).toBe(2025);
    });

    it('starts unpaused', () => {
      expect(tm.getIsPaused()).toBe(false);
    });

    it('starts at 1x time scale', () => {
      expect(tm.getTimeScale()).toBe(1);
    });
  });

  describe('pause / play / toggle', () => {
    it('pauses time', () => {
      tm.pause();
      expect(tm.getIsPaused()).toBe(true);
    });

    it('resumes time', () => {
      tm.pause();
      tm.play();
      expect(tm.getIsPaused()).toBe(false);
    });

    it('toggles pause', () => {
      tm.togglePause();
      expect(tm.getIsPaused()).toBe(true);
      tm.togglePause();
      expect(tm.getIsPaused()).toBe(false);
    });
  });

  describe('time scale', () => {
    it('sets time scale', () => {
      tm.setTimeScale(10);
      expect(tm.getTimeScale()).toBe(10);
    });

    it('enforces minimum time scale', () => {
      tm.setTimeScale(0.01);
      expect(tm.getTimeScale()).toBe(0.1);
    });

    it('accepts fractional scale', () => {
      tm.setTimeScale(0.5);
      expect(tm.getTimeScale()).toBe(0.5);
    });
  });

  describe('advance', () => {
    it('advances julian date', () => {
      const before = tm.getJulianDate();
      tm.advance(86400000); // 1 day in ms
      const after = tm.getJulianDate();
      expect(after - before).toBeCloseTo(1.0, 3); // 1 day
    });

    it('respects time scale', () => {
      tm.setTimeScale(10);
      const before = tm.getJulianDate();
      tm.advance(86400000); // 1 day
      const after = tm.getJulianDate();
      expect(after - before).toBeCloseTo(10.0, 3); // 10 days at 10x
    });

    it('does not advance when paused', () => {
      tm.pause();
      const before = tm.getJulianDate();
      tm.advance(86400000);
      expect(tm.getJulianDate()).toBe(before);
    });
  });

  describe('setDate', () => {
    it('sets simulation date', () => {
      const newDate = new Date('2030-06-15T00:00:00Z');
      tm.setDate(newDate);
      const result = tm.getDate();
      expect(result.getFullYear()).toBe(2030);
    });
  });

  describe('callbacks', () => {
    it('registers and fires callbacks on advance', () => {
      const cb = vi.fn();
      tm.onUpdate(cb);
      tm.advance(86400000);
      expect(cb).toHaveBeenCalledOnce();
    });

    it('passes julian date and real date to callback', () => {
      const cb = vi.fn();
      tm.onUpdate(cb);
      tm.advance(86400000);
      expect(cb).toHaveBeenCalledWith(expect.any(Number), expect.any(Date));
    });

    it('unregisters callbacks', () => {
      const cb = vi.fn();
      tm.onUpdate(cb);
      tm.offUpdate(cb);
      tm.advance(86400000);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('returns serializable state', () => {
      const state = tm.getState();
      expect(state).toHaveProperty('julianDate');
      expect(state).toHaveProperty('timeScale');
      expect(state).toHaveProperty('isPaused');
      expect(state).toHaveProperty('date');
      expect(typeof state.date).toBe('string'); // ISO string
    });
  });
});
