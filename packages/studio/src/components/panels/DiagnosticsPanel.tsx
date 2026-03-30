'use client';
/**
 * DiagnosticsPanel — Unified error/warning/info display
 *
 * Renders HoloDiagnostic entries from parser, compiler, and runtime
 * in a single panel with severity filtering, source grouping, and
 * actionable quick-fix buttons.
 *
 * Uses the @holoscript/core HoloDiagnostic schema.
 */
import React, { useState, useMemo } from 'react';

// ── Types (mirroring @holoscript/core/errors/HoloDiagnostic) ───────
type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';
type DiagnosticOrigin = 'parser' | 'compiler' | 'runtime' | 'lint';

interface QuickFix {
  title: string;
  range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
  newText: string;
}

interface HoloDiagnostic {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  origin: DiagnosticOrigin;
  context?: string;
  suggestion?: string;
  quickFixes?: QuickFix[];
  file?: string;
}

// ── Severity config ────────────────────────────────────────────────
const SEVERITY_CONFIG = {
  error: { icon: '❌', color: '#ef4444', bg: '#ef444422', label: 'Error' },
  warning: { icon: '⚠️', color: '#f59e0b', bg: '#f59e0b22', label: 'Warning' },
  info: { icon: 'ℹ️', color: '#3b82f6', bg: '#3b82f622', label: 'Info' },
  hint: { icon: '💡', color: '#8b5cf6', bg: '#8b5cf622', label: 'Hint' },
} as const;

const ORIGIN_LABELS: Record<DiagnosticOrigin, string> = {
  parser: 'Parser',
  compiler: 'Compiler',
  runtime: 'Runtime',
  lint: 'Lint',
};

// ── Demo diagnostics (replace with store integration) ──────────────
const DEMO_DIAGNOSTICS: HoloDiagnostic[] = [
  {
    code: 'HSP004',
    message: 'Unclosed brace — missing }',
    severity: 'error',
    line: 15,
    column: 3,
    origin: 'parser',
    context: 'object "Player" {',
    suggestion: 'Add a closing } brace after the object body',
    file: 'scene.holo',
    quickFixes: [
      {
        title: 'Insert closing }',
        range: { startLine: 22, startColumn: 0, endLine: 22, endColumn: 0 },
        newText: '}\n',
      },
    ],
  },
  {
    code: 'HSC003',
    message: 'Unknown trait "@floatable" — did you mean "@physics"?',
    severity: 'warning',
    line: 8,
    column: 18,
    origin: 'compiler',
    suggestion:
      'Replace @floatable with @physics and set use_gravity: false in a rigidbody {} block',
    file: 'scene.holo',
  },
  {
    code: 'HSL001',
    message: 'Unused variable "speed" in module Timer',
    severity: 'info',
    line: 31,
    column: 12,
    origin: 'lint',
    file: 'game.hsplus',
  },
  {
    code: 'HSR005',
    message: 'Asset load failure: "missing_model.glb" not found',
    severity: 'error',
    line: 0,
    column: 0,
    origin: 'runtime',
    suggestion: 'Check asset path or add the file to the assets directory',
  },
];

export function DiagnosticsPanel() {
  const [diagnostics] = useState<HoloDiagnostic[]>(DEMO_DIAGNOSTICS);
  const [severityFilter, setSeverityFilter] = useState<DiagnosticSeverity | 'all'>('all');
  const [originFilter, setOriginFilter] = useState<DiagnosticOrigin | 'all'>('all');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return diagnostics.filter((d) => {
      if (severityFilter !== 'all' && d.severity !== severityFilter) return false;
      if (originFilter !== 'all' && d.origin !== originFilter) return false;
      return true;
    });
  }, [diagnostics, severityFilter, originFilter]);

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0, hint: 0 };
    diagnostics.forEach((d) => c[d.severity]++);
    return c;
  }, [diagnostics]);

  return (
    <div className="p-3 space-y-2 text-xs">
      {/* Header with counts */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🔍 Diagnostics</h3>
        <div className="flex gap-1.5 items-center">
          {(Object.keys(SEVERITY_CONFIG) as DiagnosticSeverity[]).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(severityFilter === sev ? 'all' : sev)}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition
                ${severityFilter === sev ? 'ring-1 ring-white/30' : ''}`}
              style={{
                backgroundColor: counts[sev] > 0 ? SEVERITY_CONFIG[sev].bg : 'transparent',
                color: counts[sev] > 0 ? SEVERITY_CONFIG[sev].color : '#666',
              }}
              title={`Filter: ${SEVERITY_CONFIG[sev].label}s (${counts[sev]})`}
            >
              <span>{SEVERITY_CONFIG[sev].icon}</span>
              <span>{counts[sev]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Origin filter */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setOriginFilter('all')}
          className={`px-1.5 py-0.5 rounded text-[9px] transition
            ${originFilter === 'all' ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
        >
          All
        </button>
        {(Object.keys(ORIGIN_LABELS) as DiagnosticOrigin[]).map((orig) => (
          <button
            key={orig}
            onClick={() => setOriginFilter(originFilter === orig ? 'all' : orig)}
            className={`px-1.5 py-0.5 rounded text-[9px] transition
              ${originFilter === orig ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            {ORIGIN_LABELS[orig]}
          </button>
        ))}
      </div>

      {/* Diagnostic list */}
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-studio-muted">
            <div className="text-2xl mb-1">✅</div>
            <p>No diagnostics. Code looks clean!</p>
          </div>
        )}

        {filtered.map((diag, i) => {
          const sev = SEVERITY_CONFIG[diag.severity];
          const isExpanded = expandedIdx === i;

          return (
            <div
              key={`${diag.code}-${diag.line}-${i}`}
              className="rounded border transition cursor-pointer"
              style={{
                borderColor: `${sev.color}33`,
                backgroundColor: isExpanded ? `${sev.color}11` : 'transparent',
              }}
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
            >
              {/* Summary row */}
              <div className="flex items-start gap-1.5 px-2 py-1.5">
                <span className="flex-shrink-0 mt-0.5">{sev.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="px-1 rounded text-[8px] font-mono font-bold"
                      style={{ backgroundColor: sev.bg, color: sev.color }}
                    >
                      {diag.code}
                    </span>
                    <span className="text-[9px] text-studio-muted">
                      {ORIGIN_LABELS[diag.origin]}
                    </span>
                    {diag.file && (
                      <span className="text-[9px] text-studio-muted font-mono">
                        {diag.file}:{diag.line}:{diag.column}
                      </span>
                    )}
                  </div>
                  <p className="text-studio-text text-[10px] mt-0.5 leading-tight">
                    {diag.message}
                  </p>
                </div>
                <span className="text-[8px] text-studio-muted flex-shrink-0">
                  {isExpanded ? '▾' : '▸'}
                </span>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div
                  className="px-2 pb-2 space-y-1.5 border-t"
                  style={{ borderColor: `${sev.color}22` }}
                >
                  {/* Context snippet */}
                  {diag.context && (
                    <div className="mt-1.5">
                      <div className="text-[8px] text-studio-muted mb-0.5">Context</div>
                      <pre className="px-2 py-1 bg-studio-panel/30 rounded text-[9px] font-mono text-studio-text overflow-x-auto">
                        <span className="text-studio-muted mr-2">{diag.line} │</span>
                        {diag.context}
                      </pre>
                    </div>
                  )}

                  {/* Suggestion */}
                  {diag.suggestion && (
                    <div className="flex items-start gap-1">
                      <span className="text-[9px]">💡</span>
                      <p className="text-[9px] text-studio-accent/80">{diag.suggestion}</p>
                    </div>
                  )}

                  {/* Quick fixes */}
                  {diag.quickFixes && diag.quickFixes.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {diag.quickFixes.map((fix, fi) => (
                        <button
                          key={fi}
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Wire to editor store to apply fix
                            console.log('[DiagnosticsPanel] Apply fix:', fix.title, fix);
                          }}
                          className="px-2 py-0.5 rounded text-[9px] font-medium transition
                            bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                        >
                          🔧 {fix.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-[9px] text-studio-muted text-center">
        {filtered.length} / {diagnostics.length} diagnostics · {counts.error} errors ·{' '}
        {counts.warning} warnings
      </div>
    </div>
  );
}
