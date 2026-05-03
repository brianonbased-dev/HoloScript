'use client';
/**
 * usePerformanceRegressionBridge — Wires usePerformanceRegression to scene graph state.
 *
 * When frame time exceeds the VR threshold (9ms default), batch-regresses all
 * mesh entities to draft maturity (instanced primitives). When FPS recovers
 * (sustained below 7ms for ~30 frames), promotes them back to their original
 * maturity levels.
 *
 * This closes the gap between the monitor (which detects regression) and the
 * scene (which needs to switch render modes). It also syncs the editor store's
 * geometricViewMode so the toolbar reflects the auto-regression state.
 *
 * @see P.084 — VR Performance Regression Pattern
 * @see W.080 — Draft primitives are cheapest rendering AND collision proxy
 * @see task_1776640937112_0ozn — [hololand] VR performance regression to draft primitives
 *
 * VR recovery thresholds (per the research spec):
 * - Regress at 9ms frame time for 5 consecutive frames (~55ms at 90Hz)
 * - Promote back when sustained <11.5ms (~85fps) for 170 frames (~2s at 85fps)
 * - Desktop can use looser thresholds (higher thresholdMs, lower recoveryFrames)
 */

import { useRef, useCallback, useEffect } from 'react';
import { usePerformanceRegression } from '@holoscript/r3f-renderer';
import type { UsePerformanceRegressionOptions } from '@holoscript/r3f-renderer';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';
import { useStudioBus } from './useStudioBus';
import type { AssetMaturity } from '@holoscript/core';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UsePerformanceRegressionBridgeOptions
  extends UsePerformanceRegressionOptions {
  /**
   * Whether to auto-update the editor store's geometricViewMode during
   * regression. Default: true. Set to false if you only want scene graph
   * mutations without toolbar changes (e.g. for headless or VR-only use).
   */
  syncViewMode?: boolean;

  /**
   * Minimum time in ms between regression/recovery state changes.
   * Prevents rapid oscillation (thrashing) at the threshold boundary.
   * Default: 500ms
   */
  debounceMs?: number;
}

interface MaturitySnapshot {
  nodeId: string;
  previousMaturity: AssetMaturity | undefined;
}

// ── Hook ────────────────────────────────────────────────────────────────────────

/**
 * Hook that bridges performance regression detection to scene graph maturity.
 *
 * Must be called inside a React Three Fiber <Canvas> because it uses
 * usePerformanceRegression (which calls useFrame internally).
 *
 * Usage:
 * ```tsx
 * <Canvas>
 *   <PerformanceRegressionBridge />
 *   <SceneContent />
 * </Canvas>
 * ```
 */
export function usePerformanceRegressionBridge(
  options: UsePerformanceRegressionBridgeOptions = {}
) {
  const {
    syncViewMode = true,
    debounceMs = 500,
    thresholdMs = 9.0,
    consecutiveFrames = 5,
    recoveryFrames = 30,
    recoveryThresholdMs = 7.0,
    enabled = true,
  } = options;

  // Track pre-regression maturity so we can restore on recovery
  const maturitySnapshotRef = useRef<MaturitySnapshot[]>([]);
  const lastTransitionRef = useRef<number>(0);
  const isAutoRegressedRef = useRef(false);

  const updateNode = useSceneGraphStore((s) => s.updateNode);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const setGeometricViewMode = useEditorStore((s) => s.setGeometricViewMode);
  const setGeometricPipelineTransitioning = useEditorStore(
    (s) => s.setGeometricPipelineTransitioning
  );
  const { emit } = useStudioBus();

  // The onRegression callback fires on every state TRANSITION (not every frame).
  const onRegression = useCallback(
    (regressed: boolean) => {
      const now = Date.now();
      if (now - lastTransitionRef.current < debounceMs) return;
      lastTransitionRef.current = now;

      if (regressed) {
        // ── REGRESS: snapshot current maturity, then batch-switch to draft ──
        const snapshot: MaturitySnapshot[] = [];
        const currentNodes = useSceneGraphStore.getState().nodes;
        for (const node of currentNodes) {
          if (!node.id) continue;
          // Only regress mesh-type nodes (skip lights, groups, splats, etc.)
          if (node.type && node.type !== 'mesh') continue;
          snapshot.push({
            nodeId: node.id,
            previousMaturity: node.assetMaturity,
          });
          updateNode(node.id, { assetMaturity: 'draft' });
        }
        maturitySnapshotRef.current = snapshot;
        isAutoRegressedRef.current = true;

        if (syncViewMode) {
          setGeometricViewMode('draft');
        }

        emit('performance:regress', {
          timestamp: now,
          nodeCount: snapshot.length,
          thresholdMs,
        });
      } else {
        // ── RECOVER: restore previous maturity levels ──
        const snapshot = maturitySnapshotRef.current;
        if (snapshot.length === 0) {
          // No snapshot to restore — set all mesh nodes to 'mesh' as default
          const currentNodes = useSceneGraphStore.getState().nodes;
          for (const node of currentNodes) {
            if (!node.id) continue;
            if (node.type && node.type !== 'mesh') continue;
            updateNode(node.id, { assetMaturity: 'mesh' });
          }
        } else {
          for (const entry of snapshot) {
            // Restore the maturity the node had before regression.
            // If it was undefined (no explicit maturity), default to 'mesh'.
            const maturity = entry.previousMaturity || 'mesh';
            updateNode(entry.nodeId, { assetMaturity: maturity });
          }
        }
        maturitySnapshotRef.current = [];
        isAutoRegressedRef.current = false;

        if (syncViewMode) {
          setGeometricViewMode('mesh');
        }

        emit('performance:recover', {
          timestamp: now,
          nodeCount: snapshot.length,
          recoveryThresholdMs,
        });
      }
    },
    [
      updateNode,
      syncViewMode,
      setGeometricViewMode,
      emit,
      thresholdMs,
      recoveryThresholdMs,
      debounceMs,
    ]
  );

  // Set transitioning flag during batch updates
  const onTransitionStart = useCallback(() => {
    setGeometricPipelineTransitioning(true);
  }, [setGeometricPipelineTransitioning]);

  const onTransitionEnd = useCallback(() => {
    setGeometricPipelineTransitioning(false);
  }, [setGeometricPipelineTransitioning]);

  // Monitor frame performance via R3F's render loop
  const perfResult = usePerformanceRegression({
    thresholdMs,
    consecutiveFrames,
    recoveryFrames,
    recoveryThresholdMs,
    enabled,
    onRegression,
  });

  // Emit metrics to the Studio bus for LODMetricsPanel and other consumers.
  // This replaces the old PerformanceBridge's lodMetrics:tick emission path.
  // Uses requestAnimationFrame throttling instead of useFrame to avoid the
  // fiber dedup issue — the regression state is already tracked by the hook
  // via the R3F render loop, and we just mirror it to the bus here.
  useEffect(() => {
    if (!enabled) return;
    let raf: number;
    let lastEmit = 0;
    const THROTTLE_MS = 100; // ~10Hz bus update rate

    const tick = () => {
      const now = Date.now();
      if (now - lastEmit >= THROTTLE_MS) {
        lastEmit = now;
        emit('lodMetrics:tick', {
          timestamp: now,
          avgFrameTimeMs: perfResult.avgFrameTimeMs,
          isRegressed: perfResult.isRegressed,
          regressionCount: perfResult.regressionCount,
          recoveryCount: perfResult.recoveryCount,
          // LOD distribution is not available outside Canvas context;
          // LODMetricsPanel uses simulated fallback when these are zero.
          levelDistribution: [0, 0, 0, 0],
          totalTriangles: 0,
          entityCount: 0,
        });
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    enabled,
    perfResult.avgFrameTimeMs,
    perfResult.isRegressed,
    perfResult.regressionCount,
    perfResult.recoveryCount,
    emit,
  ]);

  // Clear transitioning flag after batch updates complete (next frame)
  useEffect(() => {
    if (perfResult.isRegressed) {
      onTransitionStart();
      // Use requestAnimationFrame to clear the transitioning flag after React
      // has had a chance to render the draft nodes.
      const raf = requestAnimationFrame(() => {
        onTransitionEnd();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [perfResult.isRegressed, onTransitionStart, onTransitionEnd]);

  return {
    ...perfResult,
    /** Whether the bridge is currently in auto-regression mode */
    isAutoRegressed: isAutoRegressedRef.current,
    /** Number of nodes currently in regression snapshot */
    regressedNodeCount: maturitySnapshotRef.current.length,
  };
}

// ── Component wrapper ──────────────────────────────────────────────────────────

/**
 * Component wrapper for usePerformanceRegressionBridge.
 * Must be placed inside a React Three Fiber <Canvas>.
 */
export function PerformanceRegressionBridge(
  props: UsePerformanceRegressionBridgeOptions = {}
) {
  usePerformanceRegressionBridge(props);
  return null;
}