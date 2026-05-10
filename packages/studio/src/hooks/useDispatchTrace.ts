'use client';
/**
 * useDispatchTrace — React hook for per-frame dispatch decision telemetry.
 *
 * Manages a DispatchTraceCollector, simulates dispatch decisions on each
 * animation frame (when dispatch monitoring is active), and exposes the
 * decision history + current tier for RuntimeTierPanel consumption.
 *
 * The hook also wires into the Studio bus so other components can
 * subscribe to dispatch events without importing the hook directly.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  DispatchTraceCollector,
  type StudioDispatchDecision,
  type StudioDispatchTier,
  type DispatchMode,
  DISPATCH_MODES,
} from '@/lib/dispatchTrace';
import { useStudioBus } from './useStudioBus';

interface UseDispatchTraceOptions {
  /** Number of frames to retain in the rolling trace buffer. */
  historySize?: number;
  /** Initial dispatch mode. */
  initialMode?: DispatchMode;
  /** Whether to auto-start monitoring on mount. */
  autoStart?: boolean;
  /** Simulated frame interval in ms (0 = use requestAnimationFrame). */
  simulatedIntervalMs?: number;
}

interface UseDispatchTraceReturn {
  /** Current dispatch mode (A/B toggle state). */
  mode: DispatchMode;
  /** Set dispatch mode directly. */
  setMode: (mode: DispatchMode) => void;
  /** Cycle to the next dispatch mode. */
  cycleMode: () => void;
  /** Whether dispatch monitoring is actively sampling. */
  isRunning: boolean;
  /** Start/resume monitoring. */
  start: () => void;
  /** Pause monitoring. */
  stop: () => void;
  /** Reset trace buffer. */
  reset: () => void;
  /** Latest dispatch decision (or null if none yet). */
  latest: StudioDispatchDecision | null;
  /** Rolling history of latency values (ms). */
  latencyHistory: number[];
  /** Rolling history of alpha values (0–1, undefined for non-Tier-2). */
  alphaHistory: (number | undefined)[];
  /** Rolling history of tier labels. */
  tierHistory: StudioDispatchTier[];
  /** Per-tier occurrence counts in the current window. */
  tierCounts: Record<StudioDispatchTier, number>;
  /** Available dispatch modes with metadata. */
  modes: typeof DISPATCH_MODES;
  /** Total frames recorded. */
  frameCount: number;
  /** Average latency over the current window (ms). */
  avgLatency: number;
  /** Current speculative-decoding alpha (0–1), if applicable. */
  currentAlpha: number | undefined;
  /** Whether the current frame was promoted to a higher tier (vs fallback). */
  wasPromoted: boolean;
}

// Deterministic-ish demo decisions for when no real DispatchPolicy is wired.
function simulateDecision(
  mode: DispatchMode,
  frameIndex: number,
  trait: string
): StudioDispatchDecision {
  const now = performance.now();
  const baseLatency = mode === 'cpu-only' ? 2.5 : mode === 'tier-1-only' ? 0.8 : 1.4;
  const jitter = Math.sin(frameIndex * 0.1) * 0.3 + (Math.random() - 0.5) * 0.4;
  const latency = Math.max(0.1, baseLatency + jitter);

  let tier: StudioDispatchTier = 'tier-3-cpu-direct';
  let accepted = true;
  let alpha: number | undefined;
  let fallbackReason: string | undefined;
  let spikeTrain: number[] | undefined;

  switch (mode) {
    case 'tier-1-only': {
      const webgpuAvailable = navigator.gpu !== undefined;
      const nirAvailable = frameIndex % 47 === 0; // sporadic demo
      if (webgpuAvailable && frameIndex % 3 !== 0) {
        tier = 'tier-1-browser';
        spikeTrain = Array.from({ length: 16 }, () => Math.random());
      } else if (nirAvailable) {
        tier = 'tier-1-neuromorphic';
        spikeTrain = Array.from({ length: 16 }, () => Math.random() * 0.8 + 0.2);
      } else {
        tier = 'tier-3-cpu-direct';
        fallbackReason = webgpuAvailable ? 'Trait incompatible with SNN' : 'WebGPU unavailable';
      }
      break;
    }
    case 'tier-1-2': {
      const webgpuAvailable = navigator.gpu !== undefined;
      if (webgpuAvailable && frameIndex % 5 !== 0) {
        tier = 'tier-1-browser';
        spikeTrain = Array.from({ length: 16 }, () => Math.random());
      } else {
        // Tier-2 speculative
        const windowSize = 50;
        const successes = Math.max(0, windowSize - (frameIndex % (windowSize + 1)));
        alpha = successes / windowSize;
        const threshold = 0.85;
        if (alpha >= threshold) {
          tier = 'tier-2-speculative';
        } else {
          tier = 'tier-3-cpu-direct';
          fallbackReason = `Verifier passed; alpha ${alpha.toFixed(2)} < threshold ${threshold}`;
        }
      }
      break;
    }
    case 'all-three': {
      const webgpuAvailable = navigator.gpu !== undefined;
      const nirAvailable = frameIndex % 89 === 0;
      if (webgpuAvailable && frameIndex % 7 !== 0) {
        tier = 'tier-1-browser';
        spikeTrain = Array.from({ length: 16 }, () => Math.random());
      } else if (nirAvailable) {
        tier = 'tier-1-neuromorphic';
        spikeTrain = Array.from({ length: 16 }, () => Math.random() * 0.8 + 0.2);
      } else {
        const windowSize = 50;
        const successes = Math.max(0, windowSize - (frameIndex % (windowSize + 5)));
        alpha = successes / windowSize;
        const threshold = 0.85;
        if (alpha >= threshold) {
          tier = 'tier-2-speculative';
        } else {
          tier = 'tier-3-cpu-direct';
          fallbackReason = `Verifier passed; alpha ${alpha.toFixed(2)} < threshold ${threshold}`;
        }
      }
      break;
    }
    case 'cpu-only':
      tier = 'tier-3-cpu-direct';
      break;
  }

  return {
    tier,
    accepted,
    trait,
    nodeId: `demo-node-${frameIndex % 4}`,
    metrics: {
      tierAttempted: tier,
      tierAccepted: accepted,
      latencyEstimateMs: Math.round(latency * 100) / 100,
      alpha,
      fallbackReason,
    },
    replayFingerprint: `fnv1a-64:${(Math.random() * 0xffffffffffffffff).toString(16)}`,
    timestamp: now,
  };
}

export function useDispatchTrace(opts: UseDispatchTraceOptions = {}): UseDispatchTraceReturn {
  const { historySize = 120, initialMode = 'all-three', autoStart = true, simulatedIntervalMs } = opts;

  const collectorRef = useRef(new DispatchTraceCollector(historySize));
  const [mode, setModeState] = useState<DispatchMode>(initialMode);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [frameCount, setFrameCount] = useState(0);
  const [latest, setLatest] = useState<StudioDispatchDecision | null>(null);
  const frameIndexRef = useRef(0);
  const { emit } = useStudioBus();

  const tick = useCallback(() => {
    const fi = frameIndexRef.current++;
    const decision = simulateDecision(mode, fi, 'grabbable');
    const spikeTrain = decision.tier.startsWith('tier-1') ? Array.from({ length: 16 }, () => Math.random()) : undefined;

    collectorRef.current.record(decision, spikeTrain);
    setLatest(decision);
    setFrameCount((c) => c + 1);

    // Emit to studio bus so CAEL + other consumers can tap the stream
    emit('dispatch.decision', {
      frame: fi,
      tier: decision.tier,
      accepted: decision.accepted,
      latencyMs: decision.metrics.latencyEstimateMs,
      alpha: decision.metrics.alpha ?? null,
      mode,
    });
  }, [mode, emit]);

  useEffect(() => {
    if (!isRunning) return;

    let rafId = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (simulatedIntervalMs && simulatedIntervalMs > 0) {
      intervalId = setInterval(tick, simulatedIntervalMs);
    } else {
      const loop = () => {
        tick();
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isRunning, tick, simulatedIntervalMs]);

  const setMode = useCallback(
    (next: DispatchMode) => {
      setModeState(next);
      emit('dispatch.modeChange', { from: mode, to: next });
    },
    [mode, emit]
  );

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const idx = DISPATCH_MODES.findIndex((m) => m.value === prev);
      const next = DISPATCH_MODES[(idx + 1) % DISPATCH_MODES.length].value;
      return next;
    });
  }, []);

  const start = useCallback(() => setIsRunning(true), []);
  const stop = useCallback(() => setIsRunning(false), []);
  const reset = useCallback(() => {
    collectorRef.current.reset();
    frameIndexRef.current = 0;
    setFrameCount(0);
    setLatest(null);
    emit('dispatch.reset', {});
  }, [emit]);

  const trace = collectorRef.current.getTrace();
  const latencyHistory = trace.entries.map((e) => e.decision.metrics.latencyEstimateMs);
  const alphaHistory = trace.entries.map((e) => e.decision.metrics.alpha);
  const tierHistory = trace.entries.map((e) => e.decision.tier);
  const tierCounts = collectorRef.current.getTierCounts();
  const avgLatency = latencyHistory.length > 0 ? latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length : 0;
  const wasPromoted = latest !== null && latest.tier !== 'tier-3-cpu-direct';

  return {
    mode,
    setMode,
    cycleMode,
    isRunning,
    start,
    stop,
    reset,
    latest,
    latencyHistory,
    alphaHistory,
    tierHistory,
    tierCounts,
    modes: DISPATCH_MODES,
    frameCount,
    avgLatency: Math.round(avgLatency * 100) / 100,
    currentAlpha: latest?.metrics.alpha,
    wasPromoted,
  };
}
