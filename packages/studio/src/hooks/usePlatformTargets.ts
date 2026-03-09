'use client';

/**
 * usePlatformTargets — React hook for platform target selection
 */

import { useState, useCallback, useMemo } from 'react';
import {
  XR_PLATFORM_CATEGORIES,
  XR_PLATFORM_CAPABILITIES,
  XR_ALL_PLATFORMS,
  platformCategory,
  embodimentFor,
  agentBudgetFor,
  hasCapability,
  resolvePlatforms,
  type XRPlatformTarget,
  type XRPlatformCategory,
  type XRPlatformCapabilities,
  type EmbodimentType,
  type PlatformCondition,
} from '@holoscript/core';

// ═══════════════════════════════════════════════════════════════════

export interface PlatformInfo {
  target: XRPlatformTarget;
  category: XRPlatformCategory;
  capabilities: XRPlatformCapabilities;
  embodiment: EmbodimentType;
  agentBudgetMs: number;
}

export interface UsePlatformTargetsReturn {
  platforms: PlatformInfo[];
  selected: XRPlatformTarget;
  selectedInfo: PlatformInfo;
  select: (target: XRPlatformTarget) => void;
  resolve: (condition: PlatformCondition) => XRPlatformTarget[];
  hasCap: (cap: keyof XRPlatformCapabilities) => boolean;
  grouped: Record<XRPlatformCategory, PlatformInfo[]>;
  categories: XRPlatformCategory[];
}

function buildInfo(target: XRPlatformTarget): PlatformInfo {
  return {
    target,
    category: platformCategory(target),
    capabilities: XR_PLATFORM_CAPABILITIES[target],
    embodiment: embodimentFor(target),
    agentBudgetMs: agentBudgetFor(target),
  };
}

export function usePlatformTargets(initial: XRPlatformTarget = 'quest3'): UsePlatformTargetsReturn {
  const [selected, setSelected] = useState<XRPlatformTarget>(initial);

  const platforms = useMemo(() => (XR_ALL_PLATFORMS as XRPlatformTarget[]).map(buildInfo), []);
  const selectedInfo = useMemo(() => buildInfo(selected), [selected]);

  const grouped = useMemo(() => {
    const groups: Record<string, PlatformInfo[]> = {};
    for (const cat of Object.keys(XR_PLATFORM_CATEGORIES)) {
      groups[cat] = (XR_PLATFORM_CATEGORIES[cat as XRPlatformCategory] as XRPlatformTarget[]).map(
        buildInfo
      );
    }
    return groups as Record<XRPlatformCategory, PlatformInfo[]>;
  }, []);

  const categories = useMemo(() => Object.keys(XR_PLATFORM_CATEGORIES) as XRPlatformCategory[], []);
  const select = useCallback((target: XRPlatformTarget) => setSelected(target), []);
  const resolve = useCallback((condition: PlatformCondition) => resolvePlatforms(condition), []);
  const hasCap = useCallback(
    (cap: keyof XRPlatformCapabilities) => hasCapability(selected, cap),
    [selected]
  );

  return { platforms, selected, selectedInfo, select, resolve, hasCap, grouped, categories };
}
