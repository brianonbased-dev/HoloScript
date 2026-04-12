/**
 * SimulationInterpreter — Rules-based insight generation from solver results.
 *
 * Takes solver stats + field data and produces structured, human-readable
 * insights with severity, category, and recommendations.
 *
 * No LLM required — pure rules engine covering the most common
 * engineering assessments across all solver types.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type InsightSeverity = 'info' | 'warning' | 'critical';
export type InsightCategory = 'convergence' | 'safety' | 'accuracy' | 'performance' | 'stability';

export interface SimulationInsight {
  severity: InsightSeverity;
  category: InsightCategory;
  message: string;
  detail: string;
  recommendation: string;
}

// ── Interpreter ──────────────────────────────────────────────────────────────

/**
 * Analyze simulation results and generate insights.
 * Works with any solver's stats output.
 */
export function interpretResults(stats: Record<string, unknown>): SimulationInsight[] {
  const insights: SimulationInsight[] = [];

  // ── Convergence ────────────────────────────────────────────────
  const converged = extractBool(stats, 'converged', 'solveResult.converged');
  if (converged === false) {
    insights.push({
      severity: 'critical',
      category: 'convergence',
      message: 'Solver did not converge',
      detail: `The iterative solver failed to reach the convergence tolerance within the maximum iteration count (${extractNum(stats, 'iterations', 'solveResult.iterations') ?? '?'} iterations).`,
      recommendation: 'Increase maxIterations, refine the mesh, or check boundary conditions for consistency.',
    });
  } else if (converged === true) {
    const iterations = extractNum(stats, 'iterations', 'solveResult.iterations');
    if (iterations !== null && iterations > 500) {
      insights.push({
        severity: 'warning',
        category: 'performance',
        message: 'Slow convergence',
        detail: `Solver converged but required ${iterations} iterations. This suggests an ill-conditioned system.`,
        recommendation: 'Consider preconditioning, mesh refinement near stress concentrations, or checking for near-singular boundary conditions.',
      });
    }
  }

  // ── Structural Safety ──────────────────────────────────────────
  const minSafety = extractNum(stats, 'minSafetyFactor');
  if (minSafety !== null) {
    if (minSafety < 1.0) {
      insights.push({
        severity: 'critical',
        category: 'safety',
        message: 'Structure will yield under this load',
        detail: `Minimum safety factor is ${minSafety.toFixed(2)} (below 1.0). The material's yield strength is exceeded.`,
        recommendation: 'Increase cross-section, use a stronger material, or reduce the applied load.',
      });
    } else if (minSafety < 2.0) {
      insights.push({
        severity: 'warning',
        category: 'safety',
        message: 'Low safety margin',
        detail: `Safety factor is ${minSafety.toFixed(2)}. Industry standard for most applications is 2.0-3.0.`,
        recommendation: 'Consider increasing material thickness or using a higher-grade material for production use.',
      });
    } else {
      insights.push({
        severity: 'info',
        category: 'safety',
        message: `Safety factor: ${minSafety.toFixed(1)}`,
        detail: `The structure operates well within material limits.`,
        recommendation: 'Design is adequate. Consider weight optimization if the safety factor is excessive (>5).',
      });
    }
  }

  // ── Stress Levels ──────────────────────────────────────────────
  const maxStress = extractNum(stats, 'maxVonMises');
  if (maxStress !== null && maxStress > 0) {
    insights.push({
      severity: 'info',
      category: 'accuracy',
      message: `Peak Von Mises stress: ${formatStress(maxStress)}`,
      detail: 'Maximum stress occurs at the most loaded element.',
      recommendation: 'Check if the peak stress location is at a geometric singularity (sharp corner). If so, the value may be mesh-dependent.',
    });
  }

  // ── Displacement ───────────────────────────────────────────────
  const maxDisp = extractNum(stats, 'maxDisplacement');
  if (maxDisp !== null) {
    const domainSize = extractNum(stats, 'domainSize') ?? 1;
    const ratio = maxDisp / domainSize;
    if (ratio > 0.1) {
      insights.push({
        severity: 'warning',
        category: 'accuracy',
        message: 'Large deformation detected',
        detail: `Maximum displacement is ${(ratio * 100).toFixed(1)}% of the domain size. Linear elasticity assumptions may be invalid.`,
        recommendation: 'Consider nonlinear geometric analysis for displacements exceeding 5-10% of the characteristic dimension.',
      });
    }
  }

  // ── Thermal ────────────────────────────────────────────────────
  const maxTemp = extractNum(stats, 'maxTemperature');
  const minTemp = extractNum(stats, 'minTemperature');
  if (maxTemp !== null && minTemp !== null) {
    const range = maxTemp - minTemp;
    insights.push({
      severity: 'info',
      category: 'accuracy',
      message: `Temperature range: ${minTemp.toFixed(1)} to ${maxTemp.toFixed(1)} (${range.toFixed(1)} spread)`,
      detail: 'Temperature field summary across the domain.',
      recommendation: range > 500 ? 'Large thermal gradient — check for thermal stress coupling.' : 'Temperature distribution is moderate.',
    });
  }

  // ── CFD ────────────────────────────────────────────────────────
  const maxVelocity = extractNum(stats, 'maxVelocity');
  if (maxVelocity !== null && maxVelocity > 0) {
    insights.push({
      severity: 'info',
      category: 'accuracy',
      message: `Peak velocity: ${maxVelocity.toFixed(3)} m/s`,
      detail: 'Maximum flow velocity in the domain.',
      recommendation: maxVelocity > 100 ? 'High velocities detected — consider compressibility effects.' : 'Incompressible assumption is reasonable.',
    });
  }

  // ── EM ─────────────────────────────────────────────────────────
  const maxE = extractNum(stats, 'maxE');
  if (maxE !== null && maxE > 0) {
    insights.push({
      severity: 'info',
      category: 'accuracy',
      message: `Peak E-field: ${maxE.toExponential(2)} V/m`,
      detail: 'Maximum electric field magnitude in the FDTD domain.',
      recommendation: maxE > 3e6 ? 'Electric field exceeds air breakdown threshold (~3 MV/m). Dielectric failure possible.' : 'Field levels are within normal range.',
    });
  }

  // ── MD ─────────────────────────────────────────────────────────
  const temperature = extractNum(stats, 'temperature');
  const totalEnergy = extractNum(stats, 'totalEnergy');
  if (temperature !== null && totalEnergy !== null) {
    insights.push({
      severity: 'info',
      category: 'accuracy',
      message: `MD temperature: ${temperature.toFixed(2)} (reduced units)`,
      detail: `Total energy: ${totalEnergy.toFixed(4)}. System is ${temperature > 0.5 ? 'liquid-like' : 'solid-like'} at this temperature.`,
      recommendation: 'Ensure thermostat equilibration time is sufficient before production runs.',
    });
  }

  // ── Solve Time ─────────────────────────────────────────────────
  const solveTime = extractNum(stats, 'solveTimeMs');
  if (solveTime !== null && solveTime > 10000) {
    insights.push({
      severity: 'warning',
      category: 'performance',
      message: `Long solve time: ${(solveTime / 1000).toFixed(1)}s`,
      detail: 'The simulation took more than 10 seconds.',
      recommendation: 'Consider enabling GPU acceleration, reducing mesh density, or using a coarser initial solve.',
    });
  }

  return insights;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractNum(stats: Record<string, unknown>, ...paths: string[]): number | null {
  for (const path of paths) {
    const parts = path.split('.');
    let val: unknown = stats;
    for (const p of parts) {
      if (val && typeof val === 'object') val = (val as Record<string, unknown>)[p];
      else val = undefined;
    }
    if (typeof val === 'number' && Number.isFinite(val)) return val;
  }
  return null;
}

function extractBool(stats: Record<string, unknown>, ...paths: string[]): boolean | null {
  for (const path of paths) {
    const parts = path.split('.');
    let val: unknown = stats;
    for (const p of parts) {
      if (val && typeof val === 'object') val = (val as Record<string, unknown>)[p];
      else val = undefined;
    }
    if (typeof val === 'boolean') return val;
  }
  return null;
}

function formatStress(pa: number): string {
  if (pa >= 1e9) return `${(pa / 1e9).toFixed(1)} GPa`;
  if (pa >= 1e6) return `${(pa / 1e6).toFixed(1)} MPa`;
  if (pa >= 1e3) return `${(pa / 1e3).toFixed(1)} kPa`;
  return `${pa.toFixed(1)} Pa`;
}
