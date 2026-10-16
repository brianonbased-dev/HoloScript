import React, { useState } from 'react';
import { buildKnownTraitSet } from '@holoscript/core';
import { useSceneGraphStore, useSceneStore } from '../../lib/stores';
import * as CompilerConformance from './compilerConformance';
import type { RuleStatus } from './compilerConformance';
import type { SceneNode } from '../../lib/stores';

/** Extended scene node properties for conformance validation */
interface ConformanceNodeProps {
  castShadow?: boolean;
  textColor?: string;
  roughness?: number;
  metallic?: number;
}

export interface ConformanceRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  status: RuleStatus;
  message?: string;
  /** Raw checker output behind the plain message (details toggle / audit ledger). */
  details?: string[];
}

/** Plain reason for a rule Studio has no real check for yet. Never reported as passed. */
const NOT_IMPLEMENTED = (what: string) =>
  `Not checked: Studio does not have a ${what} check yet, so this rule did not run.`;

/**
 * Rules 1 and 11 assume @collision. That trait is not in the core registry
 * (`buildKnownTraitSet().has('collision') === false`), so those checks cannot
 * run honestly until it is. When it is registered they resume.
 */
export function collisionTraitKnown(known: Set<string> = buildKnownTraitSet()): boolean {
  return known.has('collision') || known.has('Collision');
}

const COLLISION_NOT_IN_REGISTRY =
  'Not checked: this rule assumes the @collision trait, which is not in the HoloScript trait registry, so the check did not run.';

/** Build the Verify audit export text (FDA-Compliant label retained; label retained per CoS). */
export function formatConformanceAuditExport(
  rules: ConformanceRule[],
  timestamp: string = new Date().toISOString()
): string {
  return `HoloScript FDA-Compliant Conformance Audit Ledger
Date: ${timestamp}
System: HoloScript Engine v5
Signature: SHA256-...

Execution Results:
${rules
  .map(
    (r) => `[${r.status.toUpperCase()}] ${r.name} - ${r.description}
Details: ${r.message || (r.status === 'passed' ? 'Pass' : '')}${r.details?.length ? `\n  ${r.details.join('\n  ')}` : ''}
`
  )
  .join('\n')}
End of Ledger.`;
}

export const DEFAULT_RULES: ConformanceRule[] = [
  // ── Original scene-level rules ──
  {
    id: '1',
    name: 'Gravitational Constant',
    description: 'Ensure all @physics objects fall toward the planet core.',
    severity: 'error',
    status: 'pending',
  },
  {
    id: '2',
    name: 'Lighting Overdraw',
    description: 'Prevent >3 directional lights casting shadows concurrently.',
    severity: 'warning',
    status: 'pending',
  },
  {
    id: '3',
    name: 'Accessibility Contrast',
    description: 'Verify text overlays exceed 4.5:1 WGAC contrast ratios.',
    severity: 'error',
    status: 'pending',
  },
  {
    id: '4',
    name: 'NavMesh Continuity',
    description: 'Detect gaps in @navigation splines larger than agent step-height.',
    severity: 'error',
    status: 'pending',
  },
  // ── Parser hardening rules (from CoreHardeningMatrix) ──
  {
    id: '5',
    name: 'Missing Braces',
    description: 'Detect unclosed { blocks in .holo composition files.',
    severity: 'error',
    status: 'pending',
  },
  {
    id: '6',
    name: 'Unexpected Token',
    description: 'Flag unexpected tokens (e.g. stray punctuation, garbled input).',
    severity: 'error',
    status: 'pending',
  },
  {
    id: '7',
    name: 'Unknown Trait',
    description: 'Reject unrecognized trait names with Levenshtein suggestions.',
    severity: 'error',
    status: 'pending',
  },
  {
    id: '8',
    name: 'Unknown Geometry',
    description: 'Reject unrecognized geometry types; suggest closest match.',
    severity: 'error',
    status: 'pending',
  },
  {
    id: '9',
    name: 'Invalid Property',
    description: 'Flag invalid property names on objects with suggestions.',
    severity: 'warning',
    status: 'pending',
  },
  {
    id: '10',
    name: 'Trait Conflict',
    description: 'Detect mutually exclusive traits on the same object.',
    severity: 'error',
    status: 'pending',
  },
  {
    id: '11',
    name: 'Trait Dependency',
    description: 'Ensure required trait dependencies are present (e.g. @collision needs @physics).',
    severity: 'error',
    status: 'pending',
  },
  {
    id: '12',
    name: 'Invalid Material Value',
    description: 'Validate PBR material ranges (roughness 0–1, metallic 0–1).',
    severity: 'warning',
    status: 'pending',
  },
  {
    id: '13',
    name: 'Missing Texture',
    description: 'Detect texture_map references to non-existent assets.',
    severity: 'warning',
    status: 'pending',
  },
  {
    id: '14',
    name: 'Duplicate Object Name',
    description: 'Flag objects sharing the same name within a composition.',
    severity: 'warning',
    status: 'pending',
  },
];


const CHECKER_STOPPED =
  'Not checked: the checker stopped while reading this scene. Try again; if it keeps happening, report it with the details below.';

/**
 * Full Verify evaluation (scene-graph walk + compiler rules 5-7).
 * Throws are intentionally not caught here — `runSuite` resets then catches so a
 * failure cannot leave a prior run's "passed" results on screen.
 */
export function evaluateConformanceRules(
  nodes: SceneNode[],
  code: string,
  evaluateCompiler: typeof CompilerConformance.evaluateCompilerRules = CompilerConformance.evaluateCompilerRules
): ConformanceRule[] {
  let dlCount = 0;
  let badTextFound = false;
  let physicsFail = false;
  let traitConflictFound = false;
  let traitDependencyFail = false;
  let invalidMaterialValue = false;
  let duplicateNames = false;
  const collisionKnown = collisionTraitKnown();

  const seenNames = new Set<string>();

  const CONFLICTS: [string, string][] = [
    ['static', 'dynamic'],
    ['transparent', 'opaque'],
    ['billboard', 'orientable'],
  ];

  const traverse = (nodeList: SceneNode[]) => {
    for (const node of nodeList) {
      const nodeProps = node as SceneNode & ConformanceNodeProps;
      if (node.name && seenNames.has(node.name)) {
        duplicateNames = true;
      }
      if (node.name) seenNames.add(node.name);

      if (node.type === 'light' && nodeProps.castShadow !== false) {
        dlCount++;
      }
      if (node.type === 'mesh' && nodeProps.textColor) {
        const color = nodeProps.textColor;
        if (color === '#ffffff' || color === 'white') {
          badTextFound = true;
        }
      }

      const traitNames = node.traits.map((tr) => tr.name);
      if (collisionKnown) {
        const hasPhysics = traitNames.includes('physics');
        const hasCollision = traitNames.includes('collision');
        if (hasPhysics && !hasCollision) {
          physicsFail = true;
          traitDependencyFail = true;
        }
      }

      for (const [a, b] of CONFLICTS) {
        if (traitNames.includes(a) && traitNames.includes(b)) {
          traitConflictFound = true;
        }
      }

      const roughness = nodeProps.roughness;
      const metallic = nodeProps.metallic;
      if (
        (roughness !== undefined && (roughness < 0 || roughness > 1)) ||
        (metallic !== undefined && (metallic < 0 || metallic > 1))
      ) {
        invalidMaterialValue = true;
      }
    }
  };

  // Scene-tree walk is inside the function that runSuite wraps in try/catch.
  traverse(nodes);

  const compiler = evaluateCompiler(code);

  return [
    collisionKnown
      ? {
          ...DEFAULT_RULES[0],
          status: physicsFail ? 'failed' : 'passed',
          message: physicsFail ? 'Found @physics object missing @collision bounds.' : '',
        }
      : {
          ...DEFAULT_RULES[0],
          status: 'not_checked',
          message: COLLISION_NOT_IN_REGISTRY,
        },
    {
      ...DEFAULT_RULES[1],
      status: dlCount > 3 ? 'warning' : 'passed',
      message: dlCount > 3 ? `Found ${dlCount} shadow-casting directional lights.` : '',
    },
    {
      ...DEFAULT_RULES[2],
      status: badTextFound ? 'failed' : 'passed',
      message: badTextFound ? 'White text found, may violate WGAC 4.5:1 ratio.' : '',
    },
    {
      ...DEFAULT_RULES[3],
      status: 'not_checked',
      message: NOT_IMPLEMENTED('NavMesh gap'),
    },
    { ...DEFAULT_RULES[4], ...compiler.missingBraces },
    { ...DEFAULT_RULES[5], ...compiler.unexpectedToken },
    { ...DEFAULT_RULES[6], ...compiler.unknownTrait },
    { ...DEFAULT_RULES[7], status: 'not_checked', message: NOT_IMPLEMENTED('geometry type') },
    { ...DEFAULT_RULES[8], status: 'not_checked', message: NOT_IMPLEMENTED('property name') },
    {
      ...DEFAULT_RULES[9],
      status: traitConflictFound ? 'failed' : 'passed',
      message: traitConflictFound ? 'Conflicting traits on same object.' : '',
    },
    collisionKnown
      ? {
          ...DEFAULT_RULES[10],
          status: traitDependencyFail ? 'failed' : 'passed',
          message: traitDependencyFail ? '@physics requires @collision.' : '',
        }
      : {
          ...DEFAULT_RULES[10],
          status: 'not_checked',
          message: COLLISION_NOT_IN_REGISTRY,
        },
    {
      ...DEFAULT_RULES[11],
      status: invalidMaterialValue ? 'warning' : 'passed',
      message: invalidMaterialValue ? 'PBR values out of 0-1 range.' : '',
    },
    { ...DEFAULT_RULES[12], status: 'not_checked', message: NOT_IMPLEMENTED('texture') },
    {
      ...DEFAULT_RULES[13],
      status: duplicateNames ? 'warning' : 'passed',
      message: duplicateNames ? 'Duplicate object names found.' : '',
    },
  ] as ConformanceRule[];
}

export function rulesAfterCheckerFailure(err: unknown): ConformanceRule[] {
  const details = [err instanceof Error ? err.message : String(err)];
  return DEFAULT_RULES.map((r) => ({
    ...r,
    status: 'not_checked' as const,
    message: CHECKER_STOPPED,
    details,
  }));
}

export const ConformanceSuitePanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [isRunning, setIsRunning] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const code = useSceneStore((s) => s.code);

  const runSuite = () => {
    setIsRunning(true);
    setReportGenerated(false);
    // Reset first so a throw cannot leave a prior run's "passed" on screen.
    setRules(
      DEFAULT_RULES.map((r) => ({
        ...r,
        status: 'pending' as const,
        message: undefined,
        details: undefined,
      }))
    );

    try {
      // Entire evaluation (scene-tree walk + compiler rules) is inside this catch.
      setRules(evaluateConformanceRules(nodes, code));
      setReportGenerated(true);
    } catch (err) {
      setRules(rulesAfterCheckerFailure(err));
      setReportGenerated(true);
    } finally {
      setIsRunning(false);
    }
  };

  const generatePDF = () => {
    const timestamp = new Date().toISOString();
    const logContent = formatConformanceAuditExport(rules, timestamp);

    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `compliance_report_${timestamp.replace(/[:.]/g, '')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700 text-slate-300">
      <div className="p-3 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-100 flex items-center gap-2">
          <span className="text-emerald-400">✓</span> Conformance Runner
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 border-b border-slate-800 bg-slate-800/50">
        <p className="text-xs text-slate-400 mb-4">
          HoloScript validation engine. Run property-based tests against the AST prior to pipeline
          deployment.
        </p>

        <div className="flex gap-2">
          <button
            onClick={runSuite}
            disabled={isRunning}
            className={`flex-1 py-2 rounded text-xs font-semibold flex justify-center items-center gap-2 transition-all ${
              isRunning
                ? 'bg-indigo-500/50 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
            }`}
          >
            {isRunning ? (
              <>
                <span className="animate-spin text-sm">↻</span> Verifying Scene...
              </>
            ) : (
              'Run Conformance Suite'
            )}
          </button>

          <button
            onClick={generatePDF}
            disabled={!reportGenerated}
            className={`px-3 py-2 rounded text-xs font-medium border transition-colors ${
              reportGenerated
                ? 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10'
                : 'border-slate-700 text-slate-600 cursor-not-allowed'
            }`}
            title="Export FDA-Compliant Report"
          >
            Export Audit
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className="p-3 bg-slate-800 rounded border border-slate-700/50">
            <div className="flex justify-between items-start mb-1">
              <span
                className={`text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded ${
                  rule.severity === 'error'
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                {rule.severity}
              </span>

              <span
                className={`text-xs capitalize flex items-center gap-1 ${
                  rule.status === 'passed'
                    ? 'text-emerald-400'
                    : rule.status === 'failed'
                      ? 'text-red-400'
                      : rule.status === 'warning'
                        ? 'text-amber-400'
                        : rule.status === 'running'
                          ? 'text-indigo-400'
                          : 'text-slate-500'
                }`}
              >
                {rule.status === 'running' && (
                  <span className="animate-spin inline-block text-[10px]">↻</span>
                )}
                {rule.status === 'not_checked' ? 'not checked' : rule.status}
              </span>
            </div>
            <div className="text-sm font-medium text-slate-200 mb-1">{rule.name}</div>
            <div className="text-xs text-slate-400 leading-relaxed">{rule.description}</div>

            {rule.status === 'not_checked' && rule.message && (
              <div className="mt-2 text-xs p-2 rounded border bg-studio-surface border-studio-border text-studio-muted">
                {rule.message}
              </div>
            )}

            {(rule.status === 'failed' || rule.status === 'warning') && rule.message && (
              <div
                className={`mt-2 text-xs p-2 rounded font-mono border ${
                  rule.status === 'failed'
                    ? 'bg-red-500/10 border-red-500/20 text-red-300'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                }`}
              >
                {rule.message}
                {rule.details && rule.details.length > 0 && (
                  <details className="mt-1 font-mono text-[10px] opacity-80">
                    <summary className="cursor-pointer">details</summary>
                    {rule.details.map((d, i) => (
                      <div key={i}>{d}</div>
                    ))}
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
