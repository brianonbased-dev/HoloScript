'use client';

/**
 * useSafetyPass — React hook for real-time HoloScript safety analysis
 *
 * Wires the 5-layer compile-time safety pass into the Studio editor.
 * As the user writes code, this hook runs the safety pass and provides
 * live feedback: effect warnings, budget meters, capability checks.
 */

import { useState, useCallback } from 'react';
import {
  runSafetyPass, quickSafetyCheck,
  type SafetyPassResult, type SafetyPassOptions, type EffectASTNode,
  type SafetyReport, type SafetyVerdict,
} from '@holoscript/core';

// ═══════════════════════════════════════════════════════════════════

export interface UseSafetyPassReturn {
  report: SafetyReport | null;
  result: SafetyPassResult | null;
  isAnalyzing: boolean;
  verdict: SafetyVerdict | null;
  dangerScore: number;
  quickCheck: (traits: string[], builtins: string[], trustLevel?: string) => boolean;
  analyze: (nodes: EffectASTNode[], options?: Partial<SafetyPassOptions>) => SafetyPassResult;
  clear: () => void;
}

export function useSafetyPass(): UseSafetyPassReturn {
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [result, setResult] = useState<SafetyPassResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyze = useCallback((nodes: EffectASTNode[], options: Partial<SafetyPassOptions> = {}) => {
    setIsAnalyzing(true);
    const passResult = runSafetyPass(nodes, {
      moduleId: options.moduleId || 'studio-live',
      targetPlatforms: options.targetPlatforms || ['quest3', 'webxr'],
      trustLevel: options.trustLevel || 'basic',
      generateCertificate: false,
      ...options,
    });
    setResult(passResult);
    setReport(passResult.report);
    setIsAnalyzing(false);
    return passResult;
  }, []);

  const quickCheck = useCallback((traits: string[], builtins: string[], trustLevel: string = 'basic') => {
    return quickSafetyCheck(traits, builtins, trustLevel);
  }, []);

  const clear = useCallback(() => { setReport(null); setResult(null); }, []);

  return {
    report, result, isAnalyzing,
    verdict: report?.verdict || null,
    dangerScore: report?.dangerScore || 0,
    quickCheck, analyze, clear,
  };
}
