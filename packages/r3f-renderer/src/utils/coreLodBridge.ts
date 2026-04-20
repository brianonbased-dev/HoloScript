/**
 * Bridge @holoscript/core performance LODConfig into the prop shape used by LODMeshNode.
 */

import type { LODConfig as CoreLODConfig, LODLevel as CoreLODLevel } from '@holoscript/core';

function defaultPolygonRatio(levelIndex: number, levelCount: number): number {
  if (levelCount <= 1) return 1;
  return 1 / Math.pow(2, Math.min(levelIndex, 4));
}

function levelToRendererEntry(
  lvl: CoreLODLevel,
  levelIndex: number,
  levelCount: number
): {
  level: number;
  distance: number;
  polygonRatio: number;
  textureScale: number;
  disabledFeatures?: string[];
} {
  const meta = lvl.meta && typeof lvl.meta === 'object' ? lvl.meta : undefined;
  const polygonRatio =
    meta && typeof meta.polygonRatio === 'number'
      ? meta.polygonRatio
      : defaultPolygonRatio(levelIndex, levelCount);
  const textureScale =
    meta && typeof meta.textureScale === 'number' ? meta.textureScale : polygonRatio;
  let disabledFeatures: string[] | undefined;
  if (meta && Array.isArray(meta.disabledFeatures)) {
    disabledFeatures = meta.disabledFeatures.filter((x) => typeof x === 'string') as string[];
  }
  return {
    level: levelIndex,
    distance: lvl.minDistance,
    polygonRatio,
    textureScale,
    ...(disabledFeatures && disabledFeatures.length > 0 ? { disabledFeatures } : {}),
  };
}

/** True when `value` matches core `LODConfig` (entityId + distance thresholds). */
export function isCoreLODConfig(value: unknown): value is CoreLODConfig {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.entityId !== 'string' || !Array.isArray(o.levels)) return false;
  if (o.levels.length === 0) return false;
  return o.levels.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const l = item as Record<string, unknown>;
    return typeof l.minDistance === 'number' && typeof l.label === 'string';
  });
}

/**
 * Convert core LOD registration into renderer LOD props (distances + quality metadata per level).
 */
export function coreLODConfigToRendererProp(core: CoreLODConfig): {
  id: string;
  levels: Array<{
    level: number;
    distance: number;
    polygonRatio: number;
    textureScale: number;
    disabledFeatures?: string[];
  }>;
} {
  const sorted = [...core.levels].sort((a, b) => a.minDistance - b.minDistance);
  const n = sorted.length;
  return {
    id: core.entityId,
    levels: sorted.map((lvl, i) => levelToRendererEntry(lvl, i, n)),
  };
}

/** Node bag `lodConfig` with `levels[].level` + `distance` (renderer / compiler shape). */
export function isRendererLODConfigProp(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const levels = (value as { levels?: unknown }).levels;
  if (!Array.isArray(levels) || levels.length === 0) return false;
  return levels.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const l = item as Record<string, unknown>;
    return typeof l.level === 'number' && typeof l.distance === 'number';
  });
}
