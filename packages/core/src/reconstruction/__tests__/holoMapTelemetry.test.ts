import { afterEach, describe, expect, it, vi } from 'vitest';
import { logHoloMapEvent, resetHoloMapTelemetryForTests } from '../holoMapTelemetry';

const previousHoloMapLog = process.env.HOLOMAP_LOG;
const previousHoloMapLogSteps = process.env.HOLOMAP_LOG_STEPS;

function restoreEnv(): void {
  if (previousHoloMapLog === undefined) {
    delete process.env.HOLOMAP_LOG;
  } else {
    process.env.HOLOMAP_LOG = previousHoloMapLog;
  }

  if (previousHoloMapLogSteps === undefined) {
    delete process.env.HOLOMAP_LOG_STEPS;
  } else {
    process.env.HOLOMAP_LOG_STEPS = previousHoloMapLogSteps;
  }
}

function parsedLogCalls(log: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return log.mock.calls.map(([line]) => {
    const text = String(line);
    expect(text.startsWith('[HoloMap] ')).toBe(true);
    return JSON.parse(text.slice('[HoloMap] '.length)) as Record<string, unknown>;
  });
}

describe('holoMapTelemetry', () => {
  afterEach(() => {
    restoreEnv();
    resetHoloMapTelemetryForTests();
    vi.restoreAllMocks();
  });

  it('summarizes high-volume step telemetry by default', () => {
    delete process.env.HOLOMAP_LOG;
    delete process.env.HOLOMAP_LOG_STEPS;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logHoloMapEvent('hm_test', 'init', { source: 'test' });
    logHoloMapEvent('hm_test', 'step', {
      frameIndex: 0,
      pointCount: 4,
      stepMs: 3,
      avgStepMs: 3,
      throttledSoFar: 0,
    });
    logHoloMapEvent('hm_test', 'step_throttled', {
      frameIndex: 1,
      elapsedFrameMs: 12,
      targetIntervalMs: 33,
    });
    logHoloMapEvent('hm_test', 'step_evict', {
      frameIndex: 0,
      evictedPoints: 4,
      retainedSteps: 2,
    });
    logHoloMapEvent('hm_test', 'step', {
      frameIndex: 2,
      pointCount: 5,
      stepMs: 5,
      avgStepMs: 4,
      throttledSoFar: 1,
    });

    expect(log).toHaveBeenCalledTimes(1);

    logHoloMapEvent('hm_test', 'finalize', { frameCount: 2, pointCount: 9 });

    const calls = parsedLogCalls(log);
    expect(calls.map((payload) => payload.event)).toEqual(['init', 'step_summary', 'finalize']);
    expect(calls[1]).toMatchObject({
      event: 'step_summary',
      reason: 'finalize',
      stepCount: 2,
      firstFrameIndex: 0,
      lastFrameIndex: 2,
      pointCountTotal: 9,
      avgStepMs: 4,
      maxStepMs: 5,
      minStepMs: 3,
      throttledCount: 1,
      evictionCount: 1,
      evictedPointTotal: 4,
      lastThrottledFrameIndex: 1,
      lastEvictedFrameIndex: 0,
      lastRetainedSteps: 2,
    });
  });

  it('keeps per-frame step logs behind verbose opt-in', () => {
    process.env.HOLOMAP_LOG = 'verbose';
    delete process.env.HOLOMAP_LOG_STEPS;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logHoloMapEvent('hm_verbose', 'step', {
      frameIndex: 7,
      pointCount: 8,
      stepMs: 2,
      avgStepMs: 2,
      throttledSoFar: 0,
    });
    logHoloMapEvent('hm_verbose', 'finalize', { frameCount: 1, pointCount: 8 });

    const calls = parsedLogCalls(log);
    expect(calls.map((payload) => payload.event)).toEqual(['step', 'finalize']);
    expect(calls[0]).toMatchObject({
      event: 'step',
      frameIndex: 7,
      pointCount: 8,
    });
  });

  it('suppresses logs and summaries when disabled', () => {
    process.env.HOLOMAP_LOG = '0';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logHoloMapEvent('hm_silent', 'step', {
      frameIndex: 3,
      pointCount: 4,
      stepMs: 6,
      avgStepMs: 6,
      throttledSoFar: 0,
    });
    logHoloMapEvent('hm_silent', 'finalize', { frameCount: 1, pointCount: 4 });

    expect(log).not.toHaveBeenCalled();
  });

  it('flushes pending summaries before error receipts', () => {
    delete process.env.HOLOMAP_LOG;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logHoloMapEvent('hm_error', 'step', {
      frameIndex: 4,
      pointCount: 9,
      stepMs: 7,
      avgStepMs: 7,
      throttledSoFar: 0,
    });
    logHoloMapEvent('hm_error', 'error', { message: 'boom' });

    const calls = parsedLogCalls(log);
    expect(calls.map((payload) => payload.event)).toEqual(['step_summary', 'error']);
    expect(calls[0]).toMatchObject({
      event: 'step_summary',
      reason: 'error',
      stepCount: 1,
      lastFrameIndex: 4,
    });
    expect(calls[1]).toMatchObject({ event: 'error', message: 'boom' });
  });
});
