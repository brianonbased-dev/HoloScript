/**
 * AccessibilityPanel.tsx — Accessibility Auditor
 * Powered by accessibilityAuditor.ts
 */
import React, { useState, useMemo } from 'react';
import {
  contrastRatio,
  meetsWCAG,
  rampCompliant,
  doorWidthCompliant,
  type WCAGLevel,
} from '@/lib/accessibilityAuditor';

interface AccessibilityIssue {
  id: string;
  type: string;
  description: string;
  severity: string;
  wcagCriteria: string;
  location: string;
  recommendation: string;
}

const LEVEL_COLORS: Record<WCAGLevel, string> = { A: '#f59e0b', AA: '#22c55e', AAA: '#06b6d4' };

const s = {
  panel: {
    background: 'linear-gradient(180deg, #0f1210 0%, #15201a 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#c8e8d8',
    fontFamily: "'Inter', sans-serif",
    minHeight: 600,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(34,197,94,0.15)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #22c55e, #06b6d4)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(34,197,94,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#22c55e',
    marginBottom: 10,
  } as React.CSSProperties,
};

export function AccessibilityPanel() {
  const [fg, setFg] = useState('#333333');
  const [bg, setBg] = useState('#ffffff');
  const [rampSlope, setRampSlope] = useState(1 / 12);
  const [doorWidth, setDoorWidth] = useState(90);

  const contrast = useMemo(() => contrastRatio(fg, bg), [fg, bg]);
  const wcagA = useMemo(() => meetsWCAG(contrast, 'A'), [contrast]);
  const wcagAA = useMemo(() => meetsWCAG(contrast, 'AA'), [contrast]);
  const wcagAAA = useMemo(() => meetsWCAG(contrast, 'AAA'), [contrast]);
  const rampOk = useMemo(() => rampCompliant(rampSlope), [rampSlope]);
  const doorOk = useMemo(() => doorWidthCompliant(doorWidth), [doorWidth]);

  const issues: AccessibilityIssue[] = [
    {
      id: 'i1',
      type: 'visual',
      description: 'Missing alt text on hero image',
      severity: 'major',
      wcagCriteria: '1.1.1',
      location: 'Homepage',
      recommendation: 'Add descriptive alt text',
    },
    {
      id: 'i2',
      type: 'motor',
      description: 'No keyboard navigation on dropdown',
      severity: 'critical',
      wcagCriteria: '2.1.1',
      location: 'Navigation',
      recommendation: 'Add tabIndex and key handlers',
    },
    {
      id: 'i3',
      type: 'cognitive',
      description: 'Complex form lacks instructions',
      severity: 'minor',
      wcagCriteria: '3.3.2',
      location: 'Contact Form',
      recommendation: 'Add field labels and helper text',
    },
  ];

  const SEV_COLORS: Record<string, string> = {
    critical: '#ef4444',
    major: '#f59e0b',
    minor: '#22c55e',
  };

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>♿ Accessibility Auditor</span>
        <span style={{ fontSize: 12, color: '#22c55e' }}>WCAG 2.1</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🎨 Contrast Checker</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 13 }}>
          <label>
            Foreground: <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
          </label>
          <label>
            Background: <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
          </label>
        </div>
        <div style={{ padding: 12, background: bg, borderRadius: 6, marginBottom: 8 }}>
          <span style={{ color: fg, fontSize: 16, fontWeight: 700 }}>
            Sample Text · Ratio: {contrast.toFixed(2)}:1
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['A', 'AA', 'AAA'] as WCAGLevel[]).map((level) => {
            const passes = level === 'A' ? wcagA : level === 'AA' ? wcagAA : wcagAAA;
            return (
              <div
                key={level}
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  background: passes ? `${LEVEL_COLORS[level]}15` : 'rgba(239,68,68,0.1)',
                  color: passes ? LEVEL_COLORS[level] : '#ef4444',
                  border: `1px solid ${passes ? `${LEVEL_COLORS[level]}30` : 'rgba(239,68,68,0.3)'}`,
                }}
              >
                {level}: {passes ? '✅ Pass' : '❌ Fail'}
              </div>
            );
          })}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🏗️ Physical Access</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <div
            style={{
              padding: 10,
              borderRadius: 6,
              border: `1px solid ${rampOk ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: rampOk ? '#4ade80' : '#ef4444' }}>
              {rampOk ? '✅' : '❌'} Ramp 1:{Math.round(1 / rampSlope)}
            </div>
            <div style={{ fontSize: 10, color: '#889' }}>ADA: max 1:12</div>
          </div>
          <div
            style={{
              padding: 10,
              borderRadius: 6,
              border: `1px solid ${doorOk ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: doorOk ? '#4ade80' : '#ef4444' }}>
              {doorOk ? '✅' : '❌'} Door {doorWidth}cm
            </div>
            <div style={{ fontSize: 10, color: '#889' }}>ADA: min 81.3cm</div>
          </div>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🔍 Issues Found</div>
        {issues.map((issue) => (
          <div
            key={issue.id}
            style={{
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 6,
              marginBottom: 4,
              borderLeft: `3px solid ${SEV_COLORS[issue.severity]}`,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>{issue.description}</span>
              <span style={{ color: SEV_COLORS[issue.severity], fontWeight: 700, fontSize: 11 }}>
                {issue.severity}
              </span>
            </div>
            <div style={{ color: '#889', fontSize: 11, marginTop: 2 }}>
              WCAG {issue.wcagCriteria} · {issue.location} · 💡 {issue.recommendation}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AccessibilityPanel;
