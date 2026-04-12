/**
 * SimulationQuery — Natural language query interface for simulation results.
 *
 * Maps common plain-English questions to field lookups and stat queries.
 * No LLM needed — pattern matching handles the most common questions.
 */

import type { SimSolver } from '../SimSolver';
import { interpretResults } from './SimulationInterpreter';

/**
 * Answer a natural language question about simulation results.
 * Returns a human-readable string answer.
 */
export function querySimulation(question: string, stats: Record<string, unknown>): string {
  const q = question.toLowerCase().trim();

  // Safety
  if (matches(q, ['safe', 'will it break', 'will it fail', 'yield', 'safety factor'])) {
    const sf = dig(stats, 'minSafetyFactor');
    if (sf === null) return 'No safety factor data available. This solver may not produce structural results.';
    if (sf < 1) return `No — the structure will yield. Safety factor is ${sf.toFixed(2)} (below 1.0). The material's strength is exceeded.`;
    if (sf < 2) return `Marginal — safety factor is ${sf.toFixed(2)}. Industry standard is typically 2.0-3.0. Consider reinforcement.`;
    return `Yes — safety factor is ${sf.toFixed(1)}. The structure is well within material limits.`;
  }

  // Max stress
  if (matches(q, ['max stress', 'maximum stress', 'peak stress', 'highest stress', 'von mises'])) {
    const s = dig(stats, 'maxVonMises');
    if (s === null) return 'No stress data available.';
    return `Maximum Von Mises stress: ${fmtStress(s)}.`;
  }

  // Convergence
  if (matches(q, ['converge', 'did it converge', 'convergence', 'iteration'])) {
    const c = dig(stats, 'converged', 'solveResult.converged');
    const it = dig(stats, 'iterations', 'solveResult.iterations');
    if (c === null) return 'No convergence data available.';
    return c ? `Yes, converged in ${it ?? '?'} iterations.` : `No — the solver did not converge after ${it ?? '?'} iterations. Results may be inaccurate.`;
  }

  // Time
  if (matches(q, ['how long', 'solve time', 'duration', 'how fast'])) {
    const t = dig(stats, 'solveTimeMs');
    if (t === null) return 'No timing data available.';
    return t < 1000 ? `${t.toFixed(0)} ms.` : `${(t / 1000).toFixed(1)} seconds.`;
  }

  // Temperature
  if (matches(q, ['temperature', 'how hot', 'thermal', 'heat'])) {
    const maxT = dig(stats, 'maxTemperature');
    const minT = dig(stats, 'minTemperature');
    if (maxT !== null && minT !== null) return `Temperature ranges from ${minT.toFixed(1)} to ${maxT.toFixed(1)}.`;
    return 'No temperature data available from this solver.';
  }

  // Velocity / flow
  if (matches(q, ['velocity', 'flow', 'speed', 'how fast is the flow'])) {
    const v = dig(stats, 'maxVelocity');
    if (v !== null) return `Peak velocity: ${v.toFixed(3)} m/s.`;
    return 'No velocity data available.';
  }

  // Pressure
  if (matches(q, ['pressure'])) {
    const p = dig(stats, 'maxPressure');
    if (p !== null) return `Peak pressure: ${fmtStress(p)}.`;
    return 'No pressure data available.';
  }

  // Nodes / elements / DOFs
  if (matches(q, ['how many nodes', 'how many elements', 'mesh size', 'dof', 'degrees of freedom'])) {
    const n = dig(stats, 'nodeCount');
    const e = dig(stats, 'elementCount');
    const d = dig(stats, 'dofCount');
    const parts: string[] = [];
    if (n !== null) parts.push(`${n.toLocaleString()} nodes`);
    if (e !== null) parts.push(`${e.toLocaleString()} elements`);
    if (d !== null) parts.push(`${d.toLocaleString()} DOFs`);
    return parts.length > 0 ? parts.join(', ') + '.' : 'No mesh size data available.';
  }

  // General summary
  if (matches(q, ['summary', 'overview', 'tell me about', 'what happened', 'results'])) {
    const insights = interpretResults(stats);
    if (insights.length === 0) return 'No significant findings from this simulation.';
    return insights.map((i) => `[${i.severity.toUpperCase()}] ${i.message}`).join('\n');
  }

  return `I couldn't find a specific answer for "${question}". Try asking about: safety, stress, convergence, temperature, velocity, pressure, or mesh size.`;
}

/**
 * Generate a complete auto-report from solver stats.
 */
export function generateAutoReport(
  solverType: string,
  stats: Record<string, unknown>,
  config?: Record<string, unknown>,
): string {
  const insights = interpretResults(stats);
  const lines: string[] = [];

  lines.push(`# Simulation Report`);
  lines.push('');
  lines.push(`**Solver**: ${solverType}`);
  lines.push(`**Date**: ${new Date().toISOString().split('T')[0]}`);
  lines.push('');

  // Executive Summary
  const criticals = insights.filter((i) => i.severity === 'critical');
  const warnings = insights.filter((i) => i.severity === 'warning');
  lines.push('## Executive Summary');
  lines.push('');
  if (criticals.length > 0) {
    lines.push(`**${criticals.length} critical issue(s) found.** Immediate action required.`);
  } else if (warnings.length > 0) {
    lines.push(`**${warnings.length} warning(s).** Review before proceeding.`);
  } else {
    lines.push('All checks passed. No issues detected.');
  }
  lines.push('');

  // Key Metrics
  lines.push('## Key Metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  const metrics: [string, string][] = [];
  const n = dig(stats, 'nodeCount'); if (n !== null) metrics.push(['Nodes', n.toLocaleString()]);
  const e = dig(stats, 'elementCount'); if (e !== null) metrics.push(['Elements', e.toLocaleString()]);
  const c = dig(stats, 'converged', 'solveResult.converged'); if (c !== null) metrics.push(['Converged', c ? 'Yes' : '**No**']);
  const it = dig(stats, 'iterations', 'solveResult.iterations'); if (it !== null) metrics.push(['Iterations', String(it)]);
  const ms = dig(stats, 'solveTimeMs'); if (ms !== null) metrics.push(['Solve Time', ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(1)} s`]);
  const sf = dig(stats, 'minSafetyFactor'); if (sf !== null) metrics.push(['Safety Factor', sf.toFixed(2)]);
  const vm = dig(stats, 'maxVonMises'); if (vm !== null) metrics.push(['Max Stress', fmtStress(vm)]);
  for (const [k, v] of metrics) lines.push(`| ${k} | ${v} |`);
  lines.push('');

  // Insights
  if (insights.length > 0) {
    lines.push('## Findings');
    lines.push('');
    for (const insight of insights) {
      const icon = insight.severity === 'critical' ? 'X' : insight.severity === 'warning' ? '!' : 'i';
      lines.push(`### [${icon}] ${insight.message}`);
      lines.push('');
      lines.push(insight.detail);
      lines.push('');
      lines.push(`**Recommendation**: ${insight.recommendation}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function matches(q: string, keywords: string[]): boolean {
  return keywords.some((k) => q.includes(k));
}

function dig(stats: Record<string, unknown>, ...paths: string[]): number | boolean | null {
  for (const path of paths) {
    const parts = path.split('.');
    let val: unknown = stats;
    for (const p of parts) {
      if (val && typeof val === 'object') val = (val as Record<string, unknown>)[p];
      else { val = undefined; break; }
    }
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'boolean') return val;
  }
  return null;
}

function fmtStress(pa: number): string {
  if (pa >= 1e9) return `${(pa / 1e9).toFixed(1)} GPa`;
  if (pa >= 1e6) return `${(pa / 1e6).toFixed(1)} MPa`;
  if (pa >= 1e3) return `${(pa / 1e3).toFixed(1)} kPa`;
  return `${pa.toFixed(1)} Pa`;
}
