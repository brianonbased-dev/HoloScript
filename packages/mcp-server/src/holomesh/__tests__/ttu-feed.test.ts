/**
 * Tests for the TTU multi-agent convergence feed (sibling task _0v98).
 *
 * Covers the contract that lets many agents share one
 * `crdt://holomesh/feed/ttu/<sessionId>` session:
 *   - publish wakes pending step() callers (FIFO, no orphans)
 *   - publish queues frames when no one is waiting (bounded queue)
 *   - step times out cleanly without leaking timers
 *   - presence / stats reflect SSE subscribers (only — not REST callers)
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  publishTtuFrame,
  submitTtuStep,
  getTtuPresence,
  getTtuStats,
  getTtuHistory,
  _resetTtuFeedForTests,
  type TtuFrame,
  type TtuScene,
} from '../ttu-feed';

const SCENE: TtuScene = {
  cameraPosition: [0, 1.7, 5],
  cameraForward: [0, 0, -1],
  sunDirection: [0, 1, 0],
  sunColor: [1, 1, 1],
};

function makeFrame(frameId: number): TtuFrame {
  return {
    frameId,
    producedAtMs: Date.now(),
    productionTimeMs: 1.0,
    probes: [
      {
        index: 0,
        position: [0, 0, 0],
        rgb: [1, 1, 1],
        confidence: 0.9,
      },
    ],
    source: 'local',
  };
}

afterEach(() => {
  _resetTtuFeedForTests();
});

describe('ttu-feed: publish + step convergence', () => {
  it('returns a queued frame synchronously when one is already published', async () => {
    publishTtuFrame('s1', makeFrame(7), 'producer-a');
    const frame = await submitTtuStep('s1', SCENE, 'consumer-x', 1_000);
    expect(frame.frameId).toBe(7);
    // Publisher attribution is preserved end-to-end.
    expect(frame.publisherAgentId).toBe('producer-a');
  });

  it('wakes a pending step() when a frame is published mid-flight', async () => {
    const stepPromise = submitTtuStep('s2', SCENE, 'consumer-y', 2_000);
    // Publish a frame on the next tick — the consumer is waiting.
    setTimeout(() => publishTtuFrame('s2', makeFrame(11), 'producer-b'), 10);
    const frame = await stepPromise;
    expect(frame.frameId).toBe(11);
    expect(frame.publisherAgentId).toBe('producer-b');
  });

  it('serves multiple concurrent step() callers in publish order (FIFO)', async () => {
    const a = submitTtuStep('s3', SCENE, 'consumer-1', 2_000);
    const b = submitTtuStep('s3', SCENE, 'consumer-2', 2_000);
    const c = submitTtuStep('s3', SCENE, 'consumer-3', 2_000);

    publishTtuFrame('s3', makeFrame(101), 'p1');
    publishTtuFrame('s3', makeFrame(102), 'p2');
    publishTtuFrame('s3', makeFrame(103), 'p3');

    const [fa, fb, fc] = await Promise.all([a, b, c]);
    expect(fa.frameId).toBe(101);
    expect(fb.frameId).toBe(102);
    expect(fc.frameId).toBe(103);
  });

  it('rejects step() with a timeout error when no producer answers', async () => {
    await expect(submitTtuStep('s4', SCENE, 'consumer-z', 60)).rejects.toThrow(
      /no frame within/,
    );
  });

  it('reports queued + pending counts in stats', async () => {
    // Queue two frames with no consumers waiting.
    publishTtuFrame('s5', makeFrame(1), 'p');
    publishTtuFrame('s5', makeFrame(2), 'p');
    // Park a consumer (don't await) so it appears in `pending`.
    const parked = submitTtuStep('s5', SCENE, 'late-consumer', 2_000);
    // The first queued frame satisfies the parked consumer immediately,
    // leaving 1 queued + 0 pending. (Drain it so we don't dangle.)
    await parked;
    const stats = getTtuStats()['s5'];
    expect(stats.queued).toBe(1);
    expect(stats.pending).toBe(0);
  });

  it('records both scene and frame events into history', async () => {
    publishTtuFrame('s6', makeFrame(99), 'producer');
    await submitTtuStep('s6', SCENE, 'consumer', 1_000);
    const history = getTtuHistory('s6');
    const types = history.map((e) => e.type);
    expect(types).toContain('scene');
    expect(types).toContain('frame');
  });

  it('returns empty presence for a session with no SSE subscribers', () => {
    publishTtuFrame('s7', makeFrame(0), 'producer');
    expect(getTtuPresence('s7')).toEqual([]);
  });
});

describe('ttu-feed: backpressure', () => {
  it('caps the frame queue (oldest frames drop, newest survive)', async () => {
    // MAX_FRAME_QUEUE is 16. Publish 20, then drain via 16 step() calls.
    for (let i = 0; i < 20; i++) {
      publishTtuFrame('sQ', makeFrame(i), 'producer');
    }
    const drained: number[] = [];
    for (let i = 0; i < 16; i++) {
      const f = await submitTtuStep('sQ', SCENE, 'c', 500);
      drained.push(f.frameId);
    }
    // First 4 frames (0..3) were dropped; we should see 4..19.
    expect(drained[0]).toBe(4);
    expect(drained[15]).toBe(19);
  });
});

describe('ttu-feed: concurrent multi-agent convergence', () => {
  it('lets two producers and two consumers converge on one session', async () => {
    // Two consumers wait on the same session.
    const cA = submitTtuStep('swarm', SCENE, 'agent-A', 2_000);
    const cB = submitTtuStep('swarm', SCENE, 'agent-B', 2_000);

    // Two producers publish concurrently — fanout must serve both.
    const r1 = publishTtuFrame('swarm', makeFrame(1), 'producer-1');
    const r2 = publishTtuFrame('swarm', makeFrame(2), 'producer-2');

    const [fA, fB] = await Promise.all([cA, cB]);
    // Both consumers got a frame — neither timed out.
    expect([fA.frameId, fB.frameId].sort()).toEqual([1, 2]);
    // The publish layer reported each frame as delivered (not queued).
    expect(r1.queued).toBe(false);
    expect(r2.queued).toBe(false);
  });
});
