/**
 * ScenarioReplayService tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ScenarioReplayService } from '@/lib/ScenarioReplayService';

describe('ScenarioReplayService', () => {
  let svc: ScenarioReplayService;

  beforeEach(() => {
    svc = new ScenarioReplayService(100);
  });

  describe('Session Management', () => {
    it('should start a session', () => {
      const id = svc.startSession('dna');
      expect(id).toContain('session_');
      const session = svc.getSession(id);
      expect(session).toBeDefined();
      expect(session!.scenarioId).toBe('dna');
    });

    it('should track active session', () => {
      expect(svc.getActiveSession()).toBeNull();
      svc.startSession('dna');
      expect(svc.getActiveSession()).not.toBeNull();
    });

    it('should end a session and set endTime', () => {
      const id = svc.startSession('space');
      const session = svc.endSession(id);
      expect(session!.endTime).toBeDefined();
      expect(svc.getActiveSession()).toBeNull();
    });
  });

  describe('Recording', () => {
    it('should record events into active session', () => {
      const id = svc.startSession('climate');
      svc.record({ type: 'slider_change', target: 'co2', value: 450 });
      svc.record({ type: 'selection', target: 'scenario', value: 'SSP2-4.5' });
      const session = svc.getSession(id)!;
      // scenario_open + 2 manual = 3
      expect(session.events.length).toBe(3);
    });

    it('should return null when no active session', () => {
      const event = svc.record({ type: 'toggle', target: 'x', value: true });
      expect(event).toBeNull();
    });

    it('should respect max events per session', () => {
      const limited = new ScenarioReplayService(5);
      limited.startSession('wine');
      // scenario_open takes 1 slot, so 4 more
      for (let i = 0; i < 10; i++) {
        limited.record({ type: 'input', target: 'note', value: i });
      }
      expect(limited.getActiveSession()!.events.length).toBe(5);
    });
  });

  describe('Batch Extraction', () => {
    it('should extract random batch (like Rust ORDER BY RANDOM)', () => {
      const id = svc.startSession('forensic');
      for (let i = 0; i < 20; i++) {
        svc.record({ type: 'slider_change', target: `param_${i}`, value: i });
      }
      const batch = svc.extractBatch(id, 5);
      expect(batch.batchSize).toBe(5);
      expect(batch.events.length).toBe(5);
    });

    it('should return empty for unknown session', () => {
      const batch = svc.extractBatch('nope', 10);
      expect(batch.events).toHaveLength(0);
    });
  });

  describe('Analytics', () => {
    it('should compute session duration', () => {
      const id = svc.startSession('bridge');
      // endSession sets endTime
      svc.endSession(id);
      const dur = svc.sessionDuration(id);
      expect(dur).toBeGreaterThanOrEqual(0);
    });

    it('should count events', () => {
      const id = svc.startSession('geology');
      svc.record({ type: 'slider_change', target: 'depth', value: 100 });
      expect(svc.eventCount(id)).toBe(2); // open + slider
    });

    it('should filter events by type', () => {
      const id = svc.startSession('music');
      svc.record({ type: 'slider_change', target: 'gain', value: -3 });
      svc.record({ type: 'selection', target: 'note', value: 'C' });
      svc.record({ type: 'slider_change', target: 'bpm', value: 120 });
      const sliders = svc.eventsByType(id, 'slider_change');
      expect(sliders.length).toBe(2);
    });

    it('should compute most interacted targets', () => {
      const id = svc.startSession('escape');
      for (let i = 0; i < 5; i++) svc.record({ type: 'input', target: 'answer', value: i });
      for (let i = 0; i < 3; i++) svc.record({ type: 'toggle', target: 'hint', value: i });
      const top = svc.mostInteractedTargets(id, 2);
      expect(top[0].target).toBe('answer');
      expect(top[0].count).toBe(5);
    });
  });

  describe('Listeners', () => {
    it('should notify listeners on record', () => {
      const events: string[] = [];
      svc.addListener(e => events.push(e.type));
      svc.startSession('ocean');
      svc.record({ type: 'slider_change', target: 'depth', value: 500 });
      // scenario_open + slider_change
      expect(events).toEqual(['scenario_open', 'slider_change']);
    });

    it('should support unsubscribe', () => {
      const events: string[] = [];
      const unsub = svc.addListener(e => events.push(e.type));
      svc.startSession('farm');
      unsub();
      svc.record({ type: 'toggle', target: 'sensor', value: true });
      expect(events).toEqual(['scenario_open']); // only the open, toggle not captured
    });
  });

  describe('Serialization', () => {
    it('should export and import sessions', () => {
      const id = svc.startSession('molecular');
      svc.record({ type: 'selection', target: 'compound', value: 'Aspirin' });
      svc.endSession(id);

      const json = svc.exportSession(id);
      const svc2 = new ScenarioReplayService();
      const importedId = svc2.importSession(json);
      expect(importedId).toBe(id);
      expect(svc2.getSession(importedId!)!.events.length).toBeGreaterThan(0);
    });

    it('should return null for invalid JSON', () => {
      expect(svc.importSession('not json')).toBeNull();
    });
  });

  describe('Playback', () => {
    it('should yield events sequentially', async () => {
      const id = svc.startSession('dna');
      svc.record({ type: 'input', target: 'sequence', value: 'ATCG' });
      svc.record({ type: 'submit', target: 'analyze', value: null });
      svc.endSession(id);

      const replayed: string[] = [];
      for await (const event of svc.playback(id, 100)) {
        replayed.push(event.type);
      }
      // open + input + submit + close
      expect(replayed).toEqual(['scenario_open', 'input', 'submit', 'scenario_close']);
    });
  });

  describe('Cleanup', () => {
    it('should clear all sessions', () => {
      svc.startSession('epidemic');
      svc.startSession('courtroom');
      svc.clearAll();
      expect(svc.getActiveSession()).toBeNull();
    });
  });
});
