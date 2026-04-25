import { describe, it, expect } from 'vitest';
import { verifyCAELHashChain } from '@holoscript/engine/simulation';
import { UISessionRecorder } from '../uiSessionRecorder';

describe('UISessionRecorder (Paper 24 pre-study CAEL instrumentation)', () => {
  it('emits an init event with study metadata', () => {
    const r = new UISessionRecorder({
      participantHash: 'p7c3a',
      taskId: 't-author-cube',
      studyVersion: '2026-04-24-capstone-uist',
    });
    const trace = r.getTrace();
    expect(trace).toHaveLength(1);
    expect(trace[0].event).toBe('init');
    expect(trace[0].payload.solverType).toBe('ui.session.v1');
    expect(trace[0].payload.participantHash).toBe('p7c3a');
    expect(trace[0].payload.taskId).toBe('t-author-cube');
    expect(trace[0].payload.studyVersion).toBe('2026-04-24-capstone-uist');
    expect(trace[0].prevHash).toBe('cael.genesis');
    expect(trace[0].hash).toMatch(/^cael-[a-f0-9]+$/);
  });

  it('logInteraction appends interaction events with chained hashes', () => {
    const r = new UISessionRecorder();
    r.logInteraction('ui.placement.click', { x: 1, y: 2, z: 3 });
    r.logInteraction('ui.gizmo.transform', { objectId: 'cube-7', dx: 0.1 });
    const trace = r.getTrace();
    expect(trace).toHaveLength(3); // init + 2 interactions
    expect(trace[1].event).toBe('interaction');
    expect((trace[1].payload as { type: string }).type).toBe('ui.placement.click');
    expect(trace[2].event).toBe('interaction');
    expect((trace[2].payload as { type: string }).type).toBe('ui.gizmo.transform');
    // Hash chain integrity: each prevHash matches the previous entry's hash.
    expect(trace[1].prevHash).toBe(trace[0].hash);
    expect(trace[2].prevHash).toBe(trace[1].hash);
  });

  it('emitted trace passes verifyCAELHashChain (engine-side validator)', () => {
    const r = new UISessionRecorder({ participantHash: 'p1' });
    for (let i = 0; i < 5; i++) {
      r.logInteraction('ui.test', { i });
    }
    r.finalize({ note: 'test-end' });
    const trace = r.getTrace();
    const result = verifyCAELHashChain(trace, 'fnv1a');
    expect(result.valid).toBe(true);
  });

  it('finalize is idempotent and emits exactly one final event', () => {
    const r = new UISessionRecorder();
    r.logInteraction('ui.test', {});
    r.finalize({ extra: 'a' });
    r.finalize({ extra: 'b' });
    const trace = r.getTrace();
    const finals = trace.filter((e) => e.event === 'final');
    expect(finals).toHaveLength(1);
    // After finalize, further logs are dropped (recorder is closed).
    r.logInteraction('ui.late', {});
    expect(r.getTrace()).toEqual(trace);
  });

  it('toJSONL produces newline-delimited valid JSON entries', () => {
    const r = new UISessionRecorder();
    r.logInteraction('ui.placement.click', { x: 0 });
    const jsonl = r.toJSONL();
    const lines = jsonl.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('runId is unique per recorder instance', () => {
    const r1 = new UISessionRecorder();
    const r2 = new UISessionRecorder();
    expect(r1.getRunId()).not.toBe(r2.getRunId());
    expect(r1.getRunId()).toMatch(/^ui-\d+-[a-z0-9]+$/);
  });

  it('isFinalized reflects state correctly', () => {
    const r = new UISessionRecorder();
    expect(r.isFinalized()).toBe(false);
    r.finalize();
    expect(r.isFinalized()).toBe(true);
  });
});
