'use client';

/**
 * SafetyStatusBar — Compact safety verdict badge for the editor toolbar
 *
 * Shows a live safety analysis result as a compact inline badge:
 * - Green shield: safe
 * - Yellow shield: caution
 * - Red shield: unsafe
 * - Spinner: analyzing
 *
 * Click to open the full Safety panel in the right sidebar.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { runSafetyPass, type SafetyPassResult } from '@holoscript/core';

// ═══════════════════════════════════════════════════════════════════

interface SafetyStatusBarProps {
  /** Current HoloScript code from the editor */
  code: string;
  /** Debounce delay in ms before re-analyzing (default 500) */
  debounceMs?: number;
  /** Called when user clicks the badge to expand full panel */
  onOpenPanel?: () => void;
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; icon: string; label: string }> = {
  safe: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: '🛡️', label: 'Safe' },
  caution: { bg: 'bg-amber-500/15', text: 'text-amber-400', icon: '⚠️', label: 'Caution' },
  unsafe: { bg: 'bg-red-500/15', text: 'text-red-400', icon: '🚫', label: 'Unsafe' },
};

/**
 * Extract @trait names from HoloScript source code (lightweight parse).
 */
function extractTraits(code: string): string[] {
  const re = /@([a-zA-Z_]\w*)/g;
  const traits = new Set<string>();
  let m;
  while ((m = re.exec(code)) !== null) {
    traits.add(`@${m[1]}`);
  }
  return [...traits];
}

/**
 * Build minimal EffectASTNode from extracted traits.
 */
function codeToNodes(code: string) {
  const traits = extractTraits(code);
  if (traits.length === 0) return [];

  // Group into "objects" by scanning for `object <name> { ... }`
  const objectRe = /object\s+(\w+)\s*\{/g;
  const objects: { name: string; pos: number }[] = [];
  let om;
  while ((om = objectRe.exec(code)) !== null) {
    objects.push({ name: om[1], pos: om.index });
  }

  if (objects.length === 0) {
    // No explicit objects — treat entire code as one module
    return [{ type: 'object' as const, name: 'module', traits, calls: [], declaredEffects: [] }];
  }

  // Simple: all traits belong to last object (good enough for live analysis)
  return objects.map((obj) => ({
    type: 'object' as const,
    name: obj.name,
    traits,
    calls: [],
    declaredEffects: [],
  }));
}

export function SafetyStatusBar({ code, debounceMs = 500, onOpenPanel }: SafetyStatusBarProps) {
  const [result, setResult] = useState<SafetyPassResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyze = useCallback((src: string) => {
    const nodes = codeToNodes(src);
    if (nodes.length === 0) {
      setResult(null);
      return;
    }
    setIsAnalyzing(true);
    try {
      const r = runSafetyPass(nodes, {
        moduleId: 'editor-live',
        targetPlatforms: ['quest3', 'webxr'],
        trustLevel: 'basic',
        generateCertificate: false,
      });
      setResult(r);
    } catch {
      setResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => analyze(code), debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code, debounceMs, analyze]);

  // No code or no result yet
  if (!code.trim() || !result) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-studio-muted px-2 py-1">
        <span className="opacity-50">🛡️</span>
        <span>No code to analyze</span>
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-studio-muted px-2 py-1">
        <span className="animate-spin">⟳</span>
        <span>Analyzing...</span>
      </div>
    );
  }

  const verdict = result.report.verdict;
  const style = VERDICT_STYLES[verdict] || VERDICT_STYLES.safe;
  const danger = result.report.dangerScore;
  const effectCount = result.report.effects?.totalEffects ?? 0;

  return (
    <button
      onClick={onOpenPanel}
      className={`flex items-center gap-2 text-xs px-2.5 py-1 rounded-md transition cursor-pointer ${style.bg} ${style.text} hover:opacity-80`}
      title="Click to open Safety panel"
    >
      <span>{style.icon}</span>
      <span className="font-semibold">{style.label}</span>
      <span className="opacity-60">·</span>
      <span className="opacity-80">
        Danger: {typeof danger === 'number' ? danger.toFixed(1) : danger}
      </span>
      <span className="opacity-60">·</span>
      <span className="opacity-80">{effectCount} effects</span>
    </button>
  );
}
