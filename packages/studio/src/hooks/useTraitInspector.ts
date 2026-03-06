'use client';

/**
 * useTraitInspector — React hook for trait details + culture norms
 */

import { useState, useCallback, useMemo } from 'react';
import {
  TRAIT_EFFECTS, inferFromTraits, knownTraits, knownBuiltins,
  type InferredEffects,
  type CulturalNorm, type NormCategory,
  BUILTIN_NORMS, getBuiltinNorm, normsByCategory, criticalMassForChange,
  isSafeTraitSet, dangerLevel, EffectRow,
} from '@holoscript/core';

// ═══════════════════════════════════════════════════════════════════

export interface TraitInfo {
  name: string;
  effects: string[];
  isSafe: boolean;
  dangerLevel: 'safe' | 'low' | 'medium' | 'high' | 'extreme';
  isCulture: boolean;
}

export interface UseTraitInspectorReturn {
  traits: TraitInfo[];
  cultureTraits: TraitInfo[];
  norms: CulturalNorm[];
  selectedTrait: TraitInfo | null;
  selectTrait: (name: string) => void;
  inferEffects: (traits: string[]) => InferredEffects;
  normsByCategory: (category: NormCategory) => CulturalNorm[];
  criticalMass: (normId: string, population: number) => number;
  normCategories: NormCategory[];
  builtins: string[];
}

const CULTURE_TRAITS = ['@norm_compliant', '@cultural_memory', '@cultural_trace'];

function buildTraitInfo(name: string): TraitInfo {
  const effects = TRAIT_EFFECTS[name] || [];
  const row = new EffectRow(effects);
  return {
    name, effects,
    isSafe: isSafeTraitSet([name]),
    dangerLevel: dangerLevel(row),
    isCulture: CULTURE_TRAITS.includes(name),
  };
}

export function useTraitInspector(): UseTraitInspectorReturn {
  const [selectedTrait, setSelectedTrait] = useState<TraitInfo | null>(null);

  const traits = useMemo(() => knownTraits().map(buildTraitInfo), []);
  const cultureTraits = useMemo(() => traits.filter(t => t.isCulture), [traits]);
  const norms = useMemo(() => BUILTIN_NORMS, []);
  const normCategories = useMemo((): NormCategory[] =>
    ['cooperation', 'communication', 'territory', 'exchange', 'authority', 'safety', 'ritual', 'identity'], []);
  const builtins = useMemo(() => knownBuiltins(), []);

  const selectTrait = useCallback((name: string) => {
    setSelectedTrait(buildTraitInfo(name.startsWith('@') ? name : `@${name}`));
  }, []);

  const inferEffects = useCallback((traitNames: string[]) => inferFromTraits(traitNames), []);
  const getNormsByCategory = useCallback((category: NormCategory) => normsByCategory(category), []);
  const criticalMass = useCallback((normId: string, population: number) => {
    const norm = getBuiltinNorm(normId);
    return norm ? criticalMassForChange(norm, population) : 0;
  }, []);

  return { traits, cultureTraits, norms, selectedTrait, selectTrait, inferEffects, normsByCategory: getNormsByCategory, criticalMass, normCategories, builtins };
}
