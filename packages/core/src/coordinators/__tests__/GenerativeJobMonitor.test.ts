/**
 * GenerativeJobMonitor — third consumer-bus closing Pattern E for the
 * generative-AI trait cluster (AiInpainting + AiTextureGen + ControlNet
 * + DiffusionRealtime). Tests use a MockEventSource that mirrors how
 * TraitContextFactory.on/.emit work in production.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  GenerativeJobMonitor,
  type GenerativeJobEventSource,
  type GenerativeJobState,
} from '../GenerativeJobMonitor';

class MockEventSource implements GenerativeJobEventSource {
  private handlers = new Map<string, Array<(payload: unknown) => void>>();

  on(event: string, handler: (payload: unknown) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  fire(event: string, payload: unknown): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) handler(payload);
  }

  get subscriberCount(): number {
    return this.handlers.size;
  }
}

describe('GenerativeJobMonitor — Pattern E remediation for Ai* trait cluster', () => {
  let source: MockEventSource;
  let mon: GenerativeJobMonitor;

  beforeEach(() => {
    source = new MockEventSource();
    mon = new GenerativeJobMonitor(source);
  });

  it('subscribes to the full generative-job event vocabulary on construction', () => {
    // 7 inpainting + 5 texture_gen + 6 controlnet + 5 diffusion_rt = 23
    expect(source.subscriberCount).toBe(mon.subscribedEventCount);
    expect(mon.subscribedEventCount).toBe(23);
  });

  it('starts with empty state', () => {
    expect(mon.getAllJobs()).toEqual([]);
    expect(mon.isReady('inpainting')).toBe(false);
  });

  // ---- READY ----------------------------------------------------------

  describe('ready signals', () => {
    it('inpainting:ready marks inpainting kind as ready', () => {
      source.fire('inpainting:ready', { modelId: 'sd-inpaint' });
      expect(mon.isReady('inpainting')).toBe(true);
      expect(mon.isReady('texture_gen')).toBe(false);
    });

    it('multiple ready signals accumulate', () => {
      source.fire('inpainting:ready', {});
      source.fire('texture_gen:ready', {});
      source.fire('controlnet:ready', {});
      source.fire('diffusion_rt:ready', {});
      expect(mon.getStats().anyReady).toBe(true);
      expect(mon.isReady('inpainting')).toBe(true);
      expect(mon.isReady('texture_gen')).toBe(true);
      expect(mon.isReady('controlnet')).toBe(true);
      expect(mon.isReady('diffusion_rt')).toBe(true);
    });
  });

  // ---- QUEUED + STARTED ------------------------------------------------

  describe('lifecycle: queued → started → success', () => {
    it('texture_gen:queued tracks the job in queued state', () => {
      source.fire('texture_gen:queued', { requestId: 'r1', queueLength: 1 });
      const j = mon.getJob('r1');
      expect(j?.kind).toBe('texture_gen');
      expect(j?.status).toBe('queued');
    });

    it('texture_gen:started flips queued → running', () => {
      source.fire('texture_gen:queued', { requestId: 'r2' });
      source.fire('texture_gen:started', { requestId: 'r2' });
      expect(mon.getJob('r2')?.status).toBe('running');
    });

    it('texture_gen:applied marks job completed and computes durationMs', async () => {
      source.fire('texture_gen:started', { requestId: 'r3' });
      // Brief sleep so durationMs is observably > 0 on most platforms.
      await new Promise((r) => setTimeout(r, 5));
      source.fire('texture_gen:applied', { requestId: 'r3' });
      const j = mon.getJob('r3');
      expect(j?.status).toBe('completed');
      expect(j?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('inpainting:result marks job completed', () => {
      source.fire('inpainting:started', { requestId: 'i1' });
      source.fire('inpainting:result', { requestId: 'i1' });
      expect(mon.getJob('i1')?.status).toBe('completed');
    });

    it('inpainting:original_restored treated as success (terminal)', () => {
      source.fire('inpainting:started', { requestId: 'i2' });
      source.fire('inpainting:original_restored', { requestId: 'i2' });
      expect(mon.getJob('i2')?.status).toBe('completed');
    });

    it('controlnet:result completes the job', () => {
      source.fire('controlnet:started', { requestId: 'c1' });
      source.fire('controlnet:result', { requestId: 'c1' });
      expect(mon.getJob('c1')?.status).toBe('completed');
    });
  });

  // ---- CANCELLED + ERROR ----------------------------------------------

  describe('cancelled + error', () => {
    it('inpainting:cancelled before start does not create a job', () => {
      // No start, no jobId in payload — defensive: cancel without a job is a no-op
      source.fire('inpainting:cancelled', {});
      expect(mon.getAllJobs()).toEqual([]);
    });

    it('inpainting:error captures the message', () => {
      source.fire('inpainting:started', { requestId: 'i3' });
      source.fire('inpainting:error', { requestId: 'i3', message: 'GPU OOM' });
      const j = mon.getJob('i3');
      expect(j?.status).toBe('errored');
      expect(j?.error).toBe('GPU OOM');
    });

    it('controlnet:error preserves error string', () => {
      source.fire('controlnet:started', { requestId: 'c2' });
      source.fire('controlnet:error', { requestId: 'c2', error: 'invalid map type' });
      expect(mon.getJob('c2')?.error).toBe('invalid map type');
    });

    it('diffusion_rt:stopped flips a running session to cancelled', () => {
      source.fire('diffusion_rt:started', { sessionId: 'rt1' });
      source.fire('diffusion_rt:stopped', { sessionId: 'rt1', frameCount: 12 });
      expect(mon.getJob('rt1')?.status).toBe('cancelled');
    });
  });

  // ---- DIFFUSION_RT FRAMES --------------------------------------------

  describe('diffusion_rt frame tracking', () => {
    it('diffusion_rt:frame_ready synthesizes per-frame jobIds', () => {
      source.fire('diffusion_rt:frame_ready', { sessionId: 'rt1', frameNumber: 0 });
      source.fire('diffusion_rt:frame_ready', { sessionId: 'rt1', frameNumber: 1 });
      const jobs = mon.getJobsByKind('diffusion_rt');
      expect(jobs).toHaveLength(2);
      expect(jobs.map((j) => j.jobId).sort()).toEqual(['rt1:0', 'rt1:1']);
      expect(jobs.every((j) => j.status === 'completed')).toBe(true);
    });
  });

  // ---- CONFIG events (no state change) --------------------------------

  describe('config events do not mutate state', () => {
    it('inpainting:mask_set is observation-only', () => {
      source.fire('inpainting:mask_set', { requestId: 'foo' });
      expect(mon.getAllJobs()).toEqual([]);
    });

    it('controlnet:map_requested is observation-only', () => {
      source.fire('controlnet:map_requested', { requestId: 'bar' });
      expect(mon.getAllJobs()).toEqual([]);
    });

    it('diffusion_rt:prompt_updated is observation-only', () => {
      source.fire('diffusion_rt:started', { sessionId: 'rt2' });
      const before = mon.getJob('rt2')?.status;
      source.fire('diffusion_rt:prompt_updated', { sessionId: 'rt2', prompt: 'test' });
      expect(mon.getJob('rt2')?.status).toBe(before);
    });
  });

  // ---- DEFENSIVE ------------------------------------------------------

  describe('defensive', () => {
    it('ignores events without a resolvable jobId', () => {
      source.fire('inpainting:started', {});
      expect(mon.getAllJobs()).toEqual([]);
    });

    it('falls back across requestId / jobId / textureId / sessionId', () => {
      source.fire('texture_gen:queued', { textureId: 't1' });
      expect(mon.getJob('t1')?.kind).toBe('texture_gen');
    });
  });

  // ---- subscribe + bus discipline -------------------------------------

  describe('subscribe + bus discipline', () => {
    it('subscribers receive every job state change', () => {
      const seen: GenerativeJobState[] = [];
      mon.subscribe((s) => seen.push(s));
      source.fire('inpainting:started', { requestId: 'i1' });
      source.fire('inpainting:result', { requestId: 'i1' });
      expect(seen).toHaveLength(2);
      expect(seen[0].status).toBe('running');
      expect(seen[1].status).toBe('completed');
    });

    it('unsubscribe stops further deliveries', () => {
      const seen: GenerativeJobState[] = [];
      const unsub = mon.subscribe((s) => seen.push(s));
      source.fire('texture_gen:started', { requestId: 't1' });
      unsub();
      source.fire('texture_gen:applied', { requestId: 't1' });
      expect(seen).toHaveLength(1);
    });

    it('a thrown listener never crashes other listeners', () => {
      const seen: GenerativeJobState[] = [];
      mon.subscribe(() => {
        throw new Error('boom');
      });
      mon.subscribe((s) => seen.push(s));
      source.fire('inpainting:started', { requestId: 'i1' });
      expect(seen).toHaveLength(1);
    });
  });

  // ---- stats + reset --------------------------------------------------

  describe('stats + reset', () => {
    it('getStats aggregates per-kind counts', () => {
      source.fire('inpainting:started', { requestId: 'i1' });
      source.fire('inpainting:started', { requestId: 'i2' });
      source.fire('inpainting:result', { requestId: 'i1' });
      source.fire('inpainting:error', { requestId: 'i2', message: 'fail' });
      source.fire('texture_gen:queued', { requestId: 't1' });
      source.fire('controlnet:started', { requestId: 'c1' });
      source.fire('diffusion_rt:frame_ready', { sessionId: 'rt', frameNumber: 0 });
      const stats = mon.getStats();
      expect(stats.total).toBe(5);
      expect(stats.byKind.inpainting.completed).toBe(1);
      expect(stats.byKind.inpainting.errored).toBe(1);
      expect(stats.byKind.texture_gen.queued).toBe(1);
      expect(stats.byKind.controlnet.running).toBe(1);
      expect(stats.byKind.diffusion_rt.completed).toBe(1);
    });

    it('meanLatencyMs computed across completed jobs of a kind', () => {
      // Synthesize artificial duration by starting+resulting back-to-back.
      source.fire('inpainting:started', { requestId: 'i1' });
      source.fire('inpainting:result', { requestId: 'i1' });
      source.fire('inpainting:started', { requestId: 'i2' });
      source.fire('inpainting:result', { requestId: 'i2' });
      const stats = mon.getStats();
      // Both completed; durationMs >= 0 → mean is a real number, not NaN.
      expect(Number.isFinite(stats.byKind.inpainting.meanLatencyMs)).toBe(true);
      expect(stats.byKind.inpainting.completed).toBe(2);
    });

    it('reset clears jobs AND ready flags', () => {
      source.fire('inpainting:ready', {});
      source.fire('inpainting:started', { requestId: 'i1' });
      mon.reset();
      expect(mon.getAllJobs()).toEqual([]);
      expect(mon.isReady('inpainting')).toBe(false);
    });
  });
});
