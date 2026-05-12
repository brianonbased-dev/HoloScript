import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBakingProgressBridge,
  projectStateToPacket,
  type BakingJobStateLike,
  type BakingPipelineErrorLike,
} from '../BakingProgressBridge';
import type { INeuralTrainingProgressPacket } from '../NetworkTypes';

// =============================================================================
// Mock transport — captures broadcasts and lets us flip the connected flag.
// =============================================================================

class MockTransport {
  public connected = true;
  public sent: INeuralTrainingProgressPacket[] = [];

  broadcastTrainingProgress(packet: INeuralTrainingProgressPacket): boolean {
    if (!this.connected) return false;
    this.sent.push(packet);
    return true;
  }
}

function makeState(overrides: Partial<BakingJobStateLike> = {}): BakingJobStateLike {
  return {
    jobId: 'job-1',
    stage: 'training',
    overallProgress: 25,
    stageProgress: {
      training: { progress: 50, message: 'iter 15000/30000', estimatedTimeRemainingMs: 600_000 },
    },
    trainingMetrics: { psnr: 28.4, ssim: 0.91, lpips: 0.07, gaussianCount: 450_000 },
    actualCost: 1.2,
    ...overrides,
  };
}

describe('projectStateToPacket', () => {
  // ---------------------------------------------------------------------------
  // FALSE / edge — missing stage entry
  // ---------------------------------------------------------------------------

  it('FALSE: stage with no stageProgress entry yields stageProgress=0 and message=undefined', () => {
    const state = makeState({ stage: 'idle', stageProgress: {} });
    const packet = projectStateToPacket(state, { now: 1000 });
    expect(packet.stageProgress).toBe(0);
    expect(packet.message).toBeUndefined();
    expect(packet.estimatedTimeRemainingMs).toBeUndefined();
  });

  it('FALSE: non-error projection omits error field', () => {
    const state = makeState({ error: { stage: 'training', message: 'OOM', code: 'OOM', retryable: false } });
    const packet = projectStateToPacket(state, { now: 1000 });
    expect(packet.terminal).toBeUndefined();
    expect(packet.error).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // TRUE — happy projection
  // ---------------------------------------------------------------------------

  it('TRUE: full state projects all fields verbatim', () => {
    const state = makeState();
    const packet = projectStateToPacket(state, { now: 9999, previousStage: 'uploading' });
    expect(packet.jobId).toBe('job-1');
    expect(packet.stage).toBe('training');
    expect(packet.previousStage).toBe('uploading');
    expect(packet.overallProgress).toBe(25);
    expect(packet.stageProgress).toBe(50);
    expect(packet.message).toBe('iter 15000/30000');
    expect(packet.estimatedTimeRemainingMs).toBe(600_000);
    expect(packet.trainingMetrics).toEqual({
      psnr: 28.4,
      ssim: 0.91,
      lpips: 0.07,
      gaussianCount: 450_000,
    });
    expect(packet.actualCost).toBe(1.2);
    expect(packet.timestamp).toBe(9999);
  });

  it('TRUE: terminal=error includes the error payload', () => {
    const errInfo = { stage: 'training', message: 'OOM', code: 'OOM', retryable: false };
    const state = makeState({ stage: 'failed', error: errInfo });
    const packet = projectStateToPacket(state, { now: 1000, terminal: 'error' });
    expect(packet.terminal).toBe('error');
    expect(packet.error).toEqual(errInfo);
  });

  it('TRUE: terminal=complete omits error field even when error exists', () => {
    const state = makeState({ error: { stage: 'training', message: 'X', code: 'Y', retryable: false } });
    const packet = projectStateToPacket(state, { now: 1000, terminal: 'complete' });
    expect(packet.terminal).toBe('complete');
    expect(packet.error).toBeUndefined();
  });
});

describe('createBakingProgressBridge', () => {
  let transport: MockTransport;

  beforeEach(() => {
    transport = new MockTransport();
  });

  // ---------------------------------------------------------------------------
  // FALSE — transport disconnected: nothing reaches wire
  // ---------------------------------------------------------------------------

  it('FALSE: disconnected transport drops the packet (no send, no record without history)', () => {
    transport.connected = false;
    const bridge = createBakingProgressBridge(transport);
    bridge.onProgress(makeState());
    expect(transport.sent).toHaveLength(0);
    expect(bridge.getSentCount()).toBe(0);
    expect(bridge.getDroppedCount()).toBe(1);
    expect(bridge.getHistory()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // TRUE — onProgress
  // ---------------------------------------------------------------------------

  it('TRUE: onProgress with connected transport broadcasts one packet and counts it', () => {
    const bridge = createBakingProgressBridge(transport, { now: () => 100 });
    bridge.onProgress(makeState());
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].stage).toBe('training');
    expect(transport.sent[0].overallProgress).toBe(25);
    expect(transport.sent[0].timestamp).toBe(100);
    expect(bridge.getSentCount()).toBe(1);
    expect(bridge.getDroppedCount()).toBe(0);
  });

  it('TRUE: onStageTransition broadcasts a packet annotated with previousStage', () => {
    const bridge = createBakingProgressBridge(transport, { now: () => 200 });
    bridge.onStageTransition('uploading', 'training', makeState());
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].previousStage).toBe('uploading');
    expect(transport.sent[0].stage).toBe('training');
  });

  it('TRUE: onComplete broadcasts a terminal=complete packet', () => {
    const bridge = createBakingProgressBridge(transport, { now: () => 300 });
    bridge.onComplete(makeState({ stage: 'complete', overallProgress: 100 }));
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].terminal).toBe('complete');
    expect(transport.sent[0].overallProgress).toBe(100);
  });

  it('TRUE: onError broadcasts a terminal=error packet carrying the error info', () => {
    const bridge = createBakingProgressBridge(transport, { now: () => 400 });
    const errInfo: BakingPipelineErrorLike = {
      stage: 'training',
      message: 'OOM at iter 12k',
      code: 'OOM',
      retryable: true,
    };
    const state = makeState({
      stage: 'failed',
      error: { stage: errInfo.stage, message: errInfo.message, code: errInfo.code, retryable: errInfo.retryable },
    });
    bridge.onError(errInfo, state);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].terminal).toBe('error');
    expect(transport.sent[0].error?.message).toBe('OOM at iter 12k');
    expect(transport.sent[0].error?.retryable).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // History buffer — FALSE + TRUE
  // ---------------------------------------------------------------------------

  it('FALSE: recordHistory disabled (default) means getHistory stays empty even on send', () => {
    const bridge = createBakingProgressBridge(transport);
    bridge.onProgress(makeState());
    bridge.onProgress(makeState({ overallProgress: 50 }));
    expect(bridge.getHistory()).toEqual([]);
    expect(transport.sent).toHaveLength(2);
  });

  it('TRUE: recordHistory enabled retains packets in order for late-joining replay', () => {
    const bridge = createBakingProgressBridge(transport, { recordHistory: true, now: () => 500 });
    bridge.onProgress(makeState({ overallProgress: 10 }));
    bridge.onProgress(makeState({ overallProgress: 20 }));
    bridge.onProgress(makeState({ overallProgress: 30 }));
    const hist = bridge.getHistory();
    expect(hist).toHaveLength(3);
    expect(hist.map((p) => p.overallProgress)).toEqual([10, 20, 30]);
  });

  it('TRUE: recordHistory still buffers even when transport is disconnected (replay-on-reconnect path)', () => {
    transport.connected = false;
    const bridge = createBakingProgressBridge(transport, { recordHistory: true });
    bridge.onProgress(makeState());
    bridge.onProgress(makeState({ overallProgress: 50 }));
    expect(transport.sent).toHaveLength(0);
    expect(bridge.getHistory()).toHaveLength(2);
    expect(bridge.getDroppedCount()).toBe(2);
  });

  it('TRUE: historyLimit caps the ring buffer to the most recent N packets', () => {
    const bridge = createBakingProgressBridge(transport, {
      recordHistory: true,
      historyLimit: 3,
    });
    for (let i = 0; i < 7; i++) {
      bridge.onProgress(makeState({ overallProgress: i }));
    }
    const hist = bridge.getHistory();
    expect(hist).toHaveLength(3);
    expect(hist.map((p) => p.overallProgress)).toEqual([4, 5, 6]);
  });

  it('TRUE: clearHistory empties the buffer', () => {
    const bridge = createBakingProgressBridge(transport, { recordHistory: true });
    bridge.onProgress(makeState());
    bridge.onProgress(makeState());
    bridge.clearHistory();
    expect(bridge.getHistory()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Reconnect replay (composes history with broadcast — caller responsibility)
  // ---------------------------------------------------------------------------

  it('TRUE: caller can replay history through transport.broadcastTrainingProgress after reconnect', () => {
    transport.connected = false;
    const bridge = createBakingProgressBridge(transport, { recordHistory: true });
    bridge.onProgress(makeState({ overallProgress: 10 }));
    bridge.onProgress(makeState({ overallProgress: 20 }));
    expect(transport.sent).toHaveLength(0);

    transport.connected = true;
    bridge.getHistory().forEach((p) => transport.broadcastTrainingProgress(p));

    expect(transport.sent).toHaveLength(2);
    expect(transport.sent.map((p) => p.overallProgress)).toEqual([10, 20]);
  });
});
