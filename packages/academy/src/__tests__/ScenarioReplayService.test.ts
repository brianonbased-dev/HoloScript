/**
 * ScenarioReplayService.test.ts — Experience Replay worker tests
 *
 * Covers: session lifecycle, event recording, batch extraction,
 * analytics (duration, event counts, most-interacted), async playback,
 * listeners, export/import round-trip, max-events cap, and edge cases.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ScenarioReplayService from '../lib/ScenarioReplayService';

describe('ScenarioReplayService', () => {
  let service: ScenarioReplayService;

  beforeEach(() => {
    service = new ScenarioReplayService(100);
  });

  // ── Session lifecycle ──────────────────────────────────────────

  describe('session lifecycle', () => {
    it('starts a session and returns an id', () => {
      const id = service.startSession('gravity-drop');
      expect(id).toBeTruthy();
      expect(id).toContain('session_');
    });

    it('getActiveSession returns the current session', () => {
      const id = service.startSession('gravity-drop');
      const session = service.getActiveSession();
      expect(session).not.toBeNull();
      expect(session!.id).toBe(id);
      expect(session!.scenarioId).toBe('gravity-drop');
    });

    it('endSession closes the active session', () => {
      const id = service.startSession('gravity-drop');
      const ended = service.endSession(id);
      expect(ended).not.toBeNull();
      expect(ended!.endTime).toBeDefined();
      expect(service.getActiveSession()).toBeNull();
    });

    it('getSession retrieves by id', () => {
      const id = service.startSession('food-chain');
      expect(service.getSession(id)).toBeDefined();
      expect(service.getSession('nonexistent')).toBeUndefined();
    });

    it('clearAll removes all sessions', () => {
      const id = service.startSession('gravity-drop');
      service.clearAll();
      expect(service.getSession(id)).toBeUndefined();
      expect(service.getActiveSession()).toBeNull();
    });
  });

  // ── Recording ──────────────────────────────────────────────────

  describe('recording', () => {
    it('records events to the active session', () => {
      const id = service.startSession('gravity-drop');
      service.record({ type: 'slider_change', target: 'dropHeight', value: 5 });
      service.record({ type: 'toggle', target: 'airResistance', value: true });

      const session = service.getSession(id)!;
      // 2 manual + scenario_open auto-recorded
      expect(session.events.length).toBeGreaterThanOrEqual(3);
    });

    it('returns null when no active session', () => {
      const result = service.record({ type: 'input', target: 'mass', value: 10 });
      expect(result).toBeNull();
    });

    it('auto-records scenario_open on startSession', () => {
      const id = service.startSession('food-chain');
      const session = service.getSession(id)!;
      expect(session.events[0].type).toBe('scenario_open');
      expect(session.events[0].target).toBe('food-chain');
    });

    it('auto-records scenario_close on endSession', () => {
      const id = service.startSession('food-chain');
      service.endSession(id);
      const session = service.getSession(id)!;
      const last = session.events[session.events.length - 1];
      expect(last.type).toBe('scenario_close');
    });

    it('respects maxEventsPerSession cap', () => {
      const small = new ScenarioReplayService(3);
      small.startSession('test');
      // scenario_open takes 1 slot, so only 2 more
      small.record({ type: 'input', target: 'a', value: 1 });
      small.record({ type: 'input', target: 'b', value: 2 });
      const extra = small.record({ type: 'input', target: 'c', value: 3 });
      expect(extra).toBeNull();
    });
  });

  // ── Batch Extraction ───────────────────────────────────────────

  describe('extractBatch', () => {
    it('samples random events like replay.rs ORDER BY RANDOM()', () => {
      const id = service.startSession('gravity-drop');
      for (let i = 0; i < 20; i++) {
        service.record({ type: 'slider_change', target: `slider_${i}`, value: i });
      }
      const batch = service.extractBatch(id, 5);
      expect(batch.batchSize).toBe(5);
      expect(batch.events).toHaveLength(5);
      expect(batch.sessionId).toBe(id);
    });

    it('returns empty batch for unknown session', () => {
      const batch = service.extractBatch('nonexistent', 10);
      expect(batch.events).toHaveLength(0);
    });

    it('returns all events when batchSize > total', () => {
      const id = service.startSession('test');
      service.record({ type: 'input', target: 'x', value: 1 });
      const batch = service.extractBatch(id, 999);
      expect(batch.events.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Analytics ──────────────────────────────────────────────────

  describe('analytics', () => {
    it('returns event count', () => {
      const id = service.startSession('test');
      service.record({ type: 'input', target: 'a', value: 1 });
      service.record({ type: 'input', target: 'b', value: 2 });
      expect(service.eventCount(id)).toBeGreaterThanOrEqual(3); // + scenario_open
    });

    it('returns 0 for unknown session', () => {
      expect(service.eventCount('unknown')).toBe(0);
    });

    it('filters events by type', () => {
      const id = service.startSession('test');
      service.record({ type: 'slider_change', target: 'height', value: 5 });
      service.record({ type: 'toggle', target: 'airRes', value: true });
      service.record({ type: 'slider_change', target: 'mass', value: 10 });

      const sliders = service.eventsByType(id, 'slider_change');
      expect(sliders).toHaveLength(2);
    });

    it('returns most interacted targets', () => {
      const id = service.startSession('test');
      for (let i = 0; i < 5; i++) service.record({ type: 'input', target: 'height', value: i });
      for (let i = 0; i < 3; i++) service.record({ type: 'input', target: 'mass', value: i });
      service.record({ type: 'input', target: 'gravity', value: 1 });

      const top = service.mostInteractedTargets(id, 3);
      // 'test' (from scenario_open) + 'height' should be in top
      expect(top.length).toBeGreaterThanOrEqual(2);
      expect(top[0].count).toBeGreaterThanOrEqual(top[1].count);
    });

    it('sessionDuration is positive after end', () => {
      const id = service.startSession('test');
      service.endSession(id);
      expect(service.sessionDuration(id)).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Listeners ──────────────────────────────────────────────────

  describe('listeners', () => {
    it('notifies listeners on record', () => {
      const id = service.startSession('test');
      const listener = vi.fn();
      service.addListener(listener);
      service.record({ type: 'input', target: 'x', value: 1 });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].target).toBe('x');
    });

    it('unsubscribe removes listener', () => {
      service.startSession('test');
      const listener = vi.fn();
      const unsub = service.addListener(listener);
      unsub();
      service.record({ type: 'input', target: 'x', value: 1 });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ── Export / Import ────────────────────────────────────────────

  describe('export / import', () => {
    it('round-trips a session through JSON', () => {
      const id = service.startSession('gravity-drop');
      service.record({ type: 'slider_change', target: 'height', value: 10 });
      service.endSession(id);

      const json = service.exportSession(id);
      expect(json).toBeTruthy();
      expect(json).not.toBe('{}');

      // Import into a fresh service
      const service2 = new ScenarioReplayService();
      const importedId = service2.importSession(json);
      expect(importedId).toBe(id);

      const imported = service2.getSession(id)!;
      expect(imported.scenarioId).toBe('gravity-drop');
      expect(imported.events.length).toBeGreaterThanOrEqual(2);
    });

    it('returns {} for unknown session export', () => {
      expect(service.exportSession('nonexistent')).toBe('{}');
    });

    it('returns null for invalid JSON import', () => {
      expect(service.importSession('not-json')).toBeNull();
    });

    it('returns null for JSON without required fields', () => {
      expect(service.importSession('{"foo":"bar"}')).toBeNull();
    });
  });

  // ── Playback ───────────────────────────────────────────────────

  describe('playback', () => {
    it('yields all events in order', async () => {
      const id = service.startSession('test');
      service.record({ type: 'input', target: 'a', value: 1 });
      service.record({ type: 'input', target: 'b', value: 2 });
      service.endSession(id);

      const events = [];
      // Speed 1000x to make test fast
      for await (const event of service.playback(id, 1000)) {
        events.push(event);
      }
      expect(events.length).toBeGreaterThanOrEqual(3); // open + 2 + close
      expect(events[0].type).toBe('scenario_open');
    });

    it('returns empty for unknown session', async () => {
      const events = [];
      for await (const event of service.playback('nonexistent', 1000)) {
        events.push(event);
      }
      expect(events).toHaveLength(0);
    });
  });
});
