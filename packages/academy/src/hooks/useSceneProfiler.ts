'use client';

/**
 * useSceneProfiler — computes real-time profiling metrics from scene store.
 * No external fetch — pure derived state from the scene graph.
 */

import { useMemo } from 'react';
import { useSceneStore } from '@/lib/stores';
import { useSceneGraphStore } from '@/lib/stores';

export interface ProfilerFinding {
  severity: 'error' | 'warning' | 'tip';
  message: string;
}

export interface ProfilerMetrics {
  nodeCount: number;
  meshCount: number;
  lightCount: number;
  audioCount: number;
  particleCount: number;
  traitCount: number;
  traitCoverage: number; // 0–1
  estimatedDrawCalls: number;
  complexityScore: number; // 0–100 (lower = simpler)
  complexityLabel: 'Lightweight' | 'Moderate' | 'Heavy' | 'Extreme';
  frameBudgetPercent: number; // estimated % of a 16.67ms frame
  findings: ProfilerFinding[];
}

const DRAW_CALL_WEIGHTS: Record<string, number> = {
  mesh: 1,
  splat: 4,
  camera: 0,
  light: 0.5,
  group: 0,
  audio: 0,
};

export function useSceneProfiler(): ProfilerMetrics {
  const nodes = useSceneGraphStore((s) => s.nodes);
  const code = useSceneStore((s) => s.code) ?? '';

  return useMemo<ProfilerMetrics>(() => {
    const nodeCount = nodes.length;
    const meshCount = nodes.filter((n) => n.type === 'mesh').length;
    const lightCount = nodes.filter((n) => n.type === 'light').length;
    const audioCount = nodes.filter((n) => n.type === 'audio').length;
    const splatCount = nodes.filter((n) => n.type === 'splat').length;
    const particleCount = (code.match(/@particles/g) ?? []).length;
    const traitCount = nodes.reduce((sum, n) => sum + (n.traits?.length ?? 0), 0);
    const nodesWithTraits = nodes.filter((n) => (n.traits?.length ?? 0) > 0).length;
    const traitCoverage = nodeCount > 0 ? nodesWithTraits / nodeCount : 0;

    // Estimated draw calls: each mesh=1, splat=4 (costlier), lights add shadow passes
    const shadowLights = nodes.filter(
      (n) => n.type === 'light' && n.traits?.some((t) => t.properties?.castShadow)
    ).length;
    const estimatedDrawCalls =
      nodes.reduce((sum, n) => sum + (DRAW_CALL_WEIGHTS[n.type] ?? 0), 0) +
      shadowLights * meshCount + // each shadow light re-renders all meshes
      particleCount * 1.5;

    // Complexity: 0–100
    const raw = estimatedDrawCalls * 1.5 + particleCount * 5 + splatCount * 20 + shadowLights * 10;
    const complexityScore = Math.min(100, Math.round(raw));
    const complexityLabel =
      complexityScore < 25
        ? 'Lightweight'
        : complexityScore < 55
          ? 'Moderate'
          : complexityScore < 80
            ? 'Heavy'
            : 'Extreme';

    // Frame budget: assume a mid-range GPU handles ~100 draw calls per 16ms
    const frameBudgetPercent = Math.min(100, Math.round((estimatedDrawCalls / 100) * 100));

    const findings: ProfilerFinding[] = [];
    if (splatCount > 2)
      findings.push({
        severity: 'warning',
        message: `${splatCount} Gaussian splats — each is GPU-intensive; consider LOD`,
      });
    if (shadowLights > 2)
      findings.push({
        severity: 'warning',
        message: `${shadowLights} shadow-casting lights multiply draw calls by ${meshCount}×`,
      });
    if (particleCount > 3)
      findings.push({
        severity: 'warning',
        message: `${particleCount} particle systems — cap emit rate or use instanced particles`,
      });
    if (nodeCount > 50)
      findings.push({
        severity: 'error',
        message: `${nodeCount} scene nodes — exceeds recommended limit of 50`,
      });
    if (traitCoverage < 0.3 && nodeCount > 3)
      findings.push({
        severity: 'tip',
        message: 'Low trait coverage — add @lod, @physics, or @material traits to improve quality',
      });
    if (lightCount > 4)
      findings.push({
        severity: 'tip',
        message: `${lightCount} lights — prefer baked lighting for static geometry`,
      });
    if (complexityScore < 20 && nodeCount < 3)
      findings.push({
        severity: 'tip',
        message: 'Scene is nearly empty — start adding objects from the palette',
      });

    return {
      nodeCount,
      meshCount,
      lightCount,
      audioCount,
      particleCount: splatCount + particleCount,
      traitCount,
      traitCoverage,
      estimatedDrawCalls: Math.round(estimatedDrawCalls),
      complexityScore,
      complexityLabel,
      frameBudgetPercent,
      findings,
    };
  }, [nodes, code]);
}
