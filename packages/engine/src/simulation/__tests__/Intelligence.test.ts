/**
 * Phase 13: Intelligence Layer tests — interpreter, NL query, auto-report.
 */

import { describe, it, expect } from 'vitest';
import { interpretResults } from '../intelligence/SimulationInterpreter';
import { querySimulation, generateAutoReport } from '../intelligence/SimulationQuery';

describe('Phase 13: SimulationInterpreter', () => {
  it('flags safety factor < 1 as critical', () => {
    const insights = interpretResults({ minSafetyFactor: 0.7, converged: true });
    const critical = insights.find((i) => i.severity === 'critical' && i.category === 'safety');
    expect(critical).toBeDefined();
    expect(critical!.message).toContain('yield');
  });

  it('flags safety factor 1-2 as warning', () => {
    const insights = interpretResults({ minSafetyFactor: 1.5, converged: true });
    const warning = insights.find((i) => i.severity === 'warning' && i.category === 'safety');
    expect(warning).toBeDefined();
    expect(warning!.message).toContain('Low safety');
  });

  it('reports safe design for SF > 2', () => {
    const insights = interpretResults({ minSafetyFactor: 3.0, converged: true });
    const info = insights.find((i) => i.category === 'safety');
    expect(info).toBeDefined();
    expect(info!.severity).toBe('info');
  });

  it('flags non-convergence as critical', () => {
    const insights = interpretResults({ converged: false, iterations: 1000 });
    const critical = insights.find((i) => i.category === 'convergence');
    expect(critical).toBeDefined();
    expect(critical!.severity).toBe('critical');
  });

  it('reports stress in correct units', () => {
    const insights = interpretResults({ maxVonMises: 250e6, converged: true });
    const stress = insights.find((i) => i.message.includes('MPa'));
    expect(stress).toBeDefined();
  });

  it('handles nested solveResult stats', () => {
    const insights = interpretResults({ solveResult: { converged: false, iterations: 500 } });
    const critical = insights.find((i) => i.category === 'convergence');
    expect(critical).toBeDefined();
  });
});

describe('Phase 13: SimulationQuery', () => {
  const safeStats = { minSafetyFactor: 3.0, maxVonMises: 100e6, converged: true, solveTimeMs: 250, nodeCount: 1000, elementCount: 500 };
  const unsafeStats = { minSafetyFactor: 0.5, maxVonMises: 500e6, converged: true };

  it('"is this safe?" → yes for SF > 2', () => {
    const answer = querySimulation('is this safe?', safeStats);
    expect(answer).toContain('Yes');
    expect(answer).toContain('3.0');
  });

  it('"is this safe?" → no for SF < 1', () => {
    const answer = querySimulation('is this safe?', unsafeStats);
    expect(answer).toContain('No');
  });

  it('"max stress" → returns formatted stress', () => {
    const answer = querySimulation('what is the max stress?', safeStats);
    expect(answer).toContain('100.0 MPa');
  });

  it('"how long" → returns solve time', () => {
    const answer = querySimulation('how long did it take?', safeStats);
    expect(answer).toContain('250 ms');
  });

  it('"how many nodes" → returns mesh size', () => {
    const answer = querySimulation('how many nodes?', safeStats);
    expect(answer).toContain('1,000');
  });

  it('"summary" → returns insight list', () => {
    const answer = querySimulation('give me a summary', safeStats);
    expect(answer.length).toBeGreaterThan(0);
  });

  it('unknown question → helpful fallback', () => {
    const answer = querySimulation('what is the meaning of life?', safeStats);
    expect(answer).toContain('couldn\'t find');
  });
});

describe('Phase 13: Auto-Report', () => {
  it('generates Markdown report with all sections', () => {
    const stats = {
      nodeCount: 2000, elementCount: 800,
      converged: true, iterations: 45, solveTimeMs: 320,
      minSafetyFactor: 2.5, maxVonMises: 150e6,
    };

    const report = generateAutoReport('structural-tet10', stats);

    expect(report).toContain('# Simulation Report');
    expect(report).toContain('structural-tet10');
    expect(report).toContain('Executive Summary');
    expect(report).toContain('Key Metrics');
    expect(report).toContain('2,000');
    expect(report).toContain('150.0 MPa');
    expect(report).toContain('Findings');
  });

  it('flags critical issues in executive summary', () => {
    const report = generateAutoReport('structural', { converged: false, iterations: 1000 });
    expect(report).toContain('critical');
    expect(report).toContain('action required');
  });
});
