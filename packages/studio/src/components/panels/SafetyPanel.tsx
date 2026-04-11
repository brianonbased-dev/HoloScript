'use client';

/**
 * SafetyPanel — Live safety analysis panel for HoloScript Studio
 *
 * Shows real-time safety report as the user writes code:
 * - Verdict badge (safe/warnings/unsafe)
 * - Danger score meter
 * - Effect categories with violations
 * - Budget utilization bars
 * - Capability requirements
 */

import React, { useEffect, _useMemo } from 'react';
import { useSafetyPass } from '../../hooks/useSafetyPass';
import type { _SafetyReport, _SafetyVerdict } from '@holoscript/core';
import type { EffectASTNode } from '@holoscript/core';

// ═══════════════════════════════════════════════════════════════════

interface SafetyPanelProps {
  /** AST nodes to analyze (from parser output) */
  nodes: EffectASTNode[];
  /** Target platform for budget checking */
  targetPlatform?: string;
  /** Trust level */
  trustLevel?: string;
  /** Auto-analyze on node changes */
  autoAnalyze?: boolean;
  /** Compact mode (smaller display) */
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════════════

const VERDICT_STYLES: Record<string, { icon: string; color: string; bg: string }> = {
  safe: { icon: '✅', color: '#10b981', bg: '#10b98115' },
  warnings: { icon: '⚠️', color: '#f59e0b', bg: '#f59e0b15' },
  unsafe: { icon: '🛑', color: '#ef4444', bg: '#ef444415' },
};

export function SafetyPanel({
  nodes,
  targetPlatform,
  trustLevel,
  autoAnalyze = true,
  compact = false,
}: SafetyPanelProps) {
  const { report, analyze, verdict, dangerScore, isAnalyzing } = useSafetyPass();

  /** Typed view of the nested report structure for UI rendering */
  interface SafetyReportView {
    effects: { totalEffects: number; categories: string[]; violations: { message: string; severity: string }[] };
    budget: { diagnostics: { category: string; used: number; max: number; usagePercent: number }[] };
    capabilities: { missing: { scope: string; requiredBy: string }[] };
    verdict: string;
    moduleId: string;
  }

  useEffect(() => {
    if (autoAnalyze && nodes.length > 0) {
      analyze(nodes, {
        targetPlatforms: targetPlatform ? [targetPlatform] as string[] : undefined,
        trustLevel,
      });
    }
  }, [nodes, targetPlatform, trustLevel, autoAnalyze, analyze]);

  if (!report) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>🛡️ Safety Analysis</div>
        <div style={styles.empty}>Write some HoloScript to see safety analysis</div>
      </div>
    );
  }

  const reportView = report as unknown as SafetyReportView;

  const vs = verdict ? VERDICT_STYLES[verdict] : VERDICT_STYLES.safe;

  if (compact) {
    return (
      <div style={{ ...styles.badge, background: vs.bg, borderColor: vs.color }}>
        {vs.icon} {verdict?.toUpperCase()} · {dangerScore}/10
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        🛡️ Safety Analysis
        {isAnalyzing && <span style={styles.spinner}>⟳</span>}
      </div>

      {/* Verdict Badge */}
      <div style={{ ...styles.verdictBox, background: vs.bg, borderColor: vs.color }}>
        <span style={styles.verdictIcon}>{vs.icon}</span>
        <span style={{ ...styles.verdictText, color: vs.color }}>{verdict?.toUpperCase()}</span>
        <span style={styles.dangerScore}>Danger: {dangerScore}/10</span>
      </div>

      {/* Effects */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Effects ({reportView.effects.totalEffects})</div>
        <div style={styles.tagList}>
          {reportView.effects.categories.map((cat: string) => (
            <span key={cat} style={styles.tag}>
              {cat}
            </span>
          ))}
        </div>
        {reportView.effects.violations.length > 0 && (
          <div style={styles.violations}>
            {reportView.effects.violations.map((v, i: number) => (
              <div
                key={i}
                style={{
                  ...styles.violation,
                  color: v.severity === 'error' ? '#ef4444' : '#f59e0b',
                }}
              >
                {v.severity === 'error' ? '✗' : '⚠'} {v.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Budget */}
      {reportView.budget.diagnostics.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Budget</div>
          {reportView.budget.diagnostics.map((d, i: number) => (
            <div key={i} style={styles.budgetRow}>
              <span style={styles.budgetLabel}>{d.category}</span>
              <div style={styles.budgetBar}>
                <div
                  style={{
                    ...styles.budgetFill,
                    width: `${Math.min(d.usagePercent, 100)}%`,
                    background:
                      d.usagePercent > 100
                        ? '#ef4444'
                        : d.usagePercent > 80
                          ? '#f59e0b'
                          : '#10b981',
                  }}
                />
              </div>
              <span style={styles.budgetPercent}>{d.usagePercent.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Capabilities */}
      {reportView.capabilities.missing.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Missing Capabilities</div>
          {reportView.capabilities.missing.map((cap, i: number) => (
            <div key={i} style={styles.capMissing}>
              🔒 {cap.scope} — required by {cap.requiredBy}
            </div>
          ))}
        </div>
      )}

      {/* Certificate */}
      {reportView.verdict !== 'unsafe' && (
        <div style={{ ...styles.section, background: '#10b98110' }}>
          <div style={styles.sectionTitle}>📜 Safety Certificate</div>
          <div style={styles.certHash}>Module: {String(reportView.moduleId)}</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 12,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    color: '#e0e0e0',
    background: '#1a1a2e',
    borderRadius: 8,
    border: '1px solid #2a2a4a',
  },
  header: {
    fontWeight: 700,
    fontSize: 14,
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  spinner: { animation: 'spin 1s linear infinite', fontSize: 16 },
  empty: { color: '#666', fontStyle: 'italic', padding: '16px 0', textAlign: 'center' },
  verdictBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid',
    marginBottom: 12,
  },
  verdictIcon: { fontSize: 20 },
  verdictText: { fontWeight: 700, fontSize: 14, flex: 1 },
  dangerScore: { fontSize: 12, color: '#aaa' },
  section: { marginBottom: 12, padding: 8, background: '#1e1e3a', borderRadius: 6 },
  sectionTitle: { fontWeight: 600, fontSize: 12, marginBottom: 6, color: '#a0a0ff' },
  tagList: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
  tag: {
    padding: '2px 8px',
    background: '#2a2a5a',
    borderRadius: 4,
    fontSize: 11,
    color: '#c0c0ff',
  },
  violations: { marginTop: 8 },
  violation: { fontSize: 12, padding: '2px 0' },
  budgetRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  budgetLabel: { width: 100, fontSize: 11, color: '#aaa' },
  budgetBar: {
    flex: 1,
    height: 6,
    background: '#2a2a4a',
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  budgetFill: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  budgetPercent: { width: 40, textAlign: 'right' as const, fontSize: 11, color: '#aaa' },
  capMissing: { fontSize: 12, padding: '2px 0', color: '#f59e0b' },
  certHash: { fontSize: 11, fontFamily: 'monospace', color: '#10b981' },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid',
  },
};
