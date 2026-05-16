import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHoloMapRuntime,
  HOLOMAP_DEFAULTS,
  type ReconstructionFrame,
} from '../HoloMapRuntime';
import { resetHoloMapTelemetryForTests } from '../holoMapTelemetry';
import { assertHoloMapManifestContract } from '../simulationContractBinding';

const previousHoloMapLog = process.env.HOLOMAP_LOG;
const previousHoloMapLogSteps = process.env.HOLOMAP_LOG_STEPS;

function restoreTelemetryEnv(): void {
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

function parseHoloMapLogs(log: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return log.mock.calls.map(([line]) => {
    const text = String(line);
    expect(text.startsWith('[HoloMap] ')).toBe(true);
    return JSON.parse(text.slice('[HoloMap] '.length)) as Record<string, unknown>;
  });
}

describe('HoloMapRuntime vertical slice', () => {
  afterEach(() => {
    restoreTelemetryEnv();
    resetHoloMapTelemetryForTests();
    vi.restoreAllMocks();
  });

  it('initializes, steps, finalizes and returns deterministic replay hash', async () => {
    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 42,
      modelHash: 'test-model',
      videoHash: 'fixture-1',
    });

    const frame: ReconstructionFrame = {
      index: 0,
      timestampMs: 0,
      rgb: new Uint8Array([128, 64, 32, 255]),
      width: 1,
      height: 1,
      stride: 4,
    };

    const step = await runtime.step(frame);
    expect(step.pose.position.length).toBe(3);
    expect(step.points.positions.length).toBeGreaterThan(0);

    const manifest = await runtime.finalize();
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.replayHash.length).toBeGreaterThan(8);
    assertHoloMapManifestContract(manifest);

    const replay = runtime.replayHash();
    expect(replay).toBe(manifest.replayHash);

    await runtime.dispose();
  });

  it('wires runtime steps to compact telemetry summaries by default', async () => {
    delete process.env.HOLOMAP_LOG;
    delete process.env.HOLOMAP_LOG_STEPS;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 42,
      modelHash: 'test-model',
      videoHash: 'fixture-telemetry',
      targetFPS: 10000,
    });

    for (let i = 0; i < 3; i += 1) {
      const frame: ReconstructionFrame = {
        index: i,
        timestampMs: i + 1,
        rgb: new Uint8Array([128, 64, 32, 255]),
        width: 1,
        height: 1,
        stride: 4,
      };
      await runtime.step(frame);
    }

    await runtime.finalize();
    await runtime.dispose();

    const calls = parseHoloMapLogs(log);
    expect(calls.map((payload) => payload.event)).toEqual([
      'init',
      'step_summary',
      'finalize',
      'dispose',
    ]);
    expect(calls.some((payload) => payload.event === 'step')).toBe(false);
    expect(calls[1]).toMatchObject({
      event: 'step_summary',
      reason: 'finalize',
      stepCount: 3,
      firstFrameIndex: 0,
      lastFrameIndex: 2,
    });
  });
});
