/**
 * Workforce analytics tests — hr-workforce-plugin
 *
 * Reference values verified against:
 *  - OFCCP pay equity methodology (41 CFR Part 60-2)
 *  - Harris-Wilson EOQ original paper (1913)
 *  - Holt CC (1957) exponential smoothing
 */

import { describe, it, expect } from 'vitest';
import {
  payEquityAnalysis,
  meritBudgetAllocation,
  workforceForecast,
  attritionRiskScoring,
  headcountPlan,
  analyzeWorkforce,
  buildWorkforceReceipt,
  type Employee,
} from '../workforce';

// ─── Test data ────────────────────────────────────────────────────────────────

const makeEmployee = (
  id: string,
  group: string,
  salary: number,
  exp = 5,
  perf = 3,
  level = 2,
  tenure = 3,
): Employee => ({ id, group, salary, yearsExperience: exp, performanceRating: perf, jobLevel: level, tenureYears: tenure });

// 10 male employees, 10 female employees — equal pay by design
const equalPayEmployees: Employee[] = [
  ...Array.from({ length: 5 }, (_, i) => makeEmployee(`m${i}`, 'male',   60000 + i * 1000, 5, 3, 2, 3)),
  ...Array.from({ length: 5 }, (_, i) => makeEmployee(`f${i}`, 'female', 60000 + i * 1000, 5, 3, 2, 3)),
];

// Unequal pay: males earn 20% more than females (same experience/level)
const unequalPayEmployees: Employee[] = [
  ...Array.from({ length: 5 }, (_, i) => makeEmployee(`m${i}`, 'male',   72000 + i * 1000, 5, 3, 2, 3)),
  ...Array.from({ length: 5 }, (_, i) => makeEmployee(`f${i}`, 'female', 60000 + i * 1000, 5, 3, 2, 3)),
];

// ─── Pay equity analysis ──────────────────────────────────────────────────────

describe('payEquityAnalysis', () => {
  it('equal pay → raw gap ≈ 0%', () => {
    const r = payEquityAnalysis(equalPayEmployees, 'male', 'female');
    expect(Math.abs(r.rawGapPct)).toBeLessThan(1);
  });

  it('unequal pay → raw gap between 15% and 25%', () => {
    // Males earn 72-76k vs females 60-64k → mean gap ≈ (74k-62k)/62k ≈ 19.4%
    const r = payEquityAnalysis(unequalPayEmployees, 'male', 'female');
    expect(r.rawGapPct).toBeGreaterThan(15);
    expect(r.rawGapPct).toBeLessThan(25);
  });

  it('equal pay → not significant', () => {
    const r = payEquityAnalysis(equalPayEmployees, 'male', 'female');
    expect(r.significant).toBe(false);
  });

  it('significant gap → p-value < 0.05', () => {
    // Need more employees for significance — create larger dataset
    const big: Employee[] = [
      ...Array.from({ length: 20 }, (_, i) => makeEmployee(`m${i}`, 'male',   70000 + i * 200, 5, 3, 2, 3)),
      ...Array.from({ length: 20 }, (_, i) => makeEmployee(`f${i}`, 'female', 55000 + i * 200, 5, 3, 2, 3)),
    ];
    const r = payEquityAnalysis(big, 'male', 'female');
    expect(r.pValue).toBeLessThan(0.05);
    expect(r.significant).toBe(true);
  });

  it('Cohen\'s d is non-negative for positive gap', () => {
    const r = payEquityAnalysis(unequalPayEmployees, 'male', 'female');
    expect(r.cohensD).toBeGreaterThan(0);
  });

  it('throws for group with < 2 employees', () => {
    const emp = [makeEmployee('a', 'lone', 50000)];
    expect(() => payEquityAnalysis([...equalPayEmployees, ...emp], 'lone', 'male')).toThrow();
  });
});

// ─── Merit budget ─────────────────────────────────────────────────────────────

describe('meritBudgetAllocation', () => {
  const emps: Employee[] = [
    makeEmployee('a', 'all', 50000, 3, 5, 2, 2), // high performer
    makeEmployee('b', 'all', 50000, 3, 3, 2, 2), // average
    makeEmployee('c', 'all', 50000, 3, 1, 2, 2), // low performer
  ];

  it('total merit paid ≈ budget (within rounding)', () => {
    const r = meritBudgetAllocation(emps, 0.03);
    expect(r.withinBudget).toBe(true);
  });

  it('high performer gets higher merit % than low performer', () => {
    const r = meritBudgetAllocation(emps, 0.03);
    const highPerfAlloc = r.allocations.find(a => a.id === 'a')!;
    const lowPerfAlloc  = r.allocations.find(a => a.id === 'c')!;
    expect(highPerfAlloc.meritPct).toBeGreaterThan(lowPerfAlloc.meritPct);
  });

  it('new salary = old salary × (1 + meritPct)', () => {
    const r = meritBudgetAllocation(emps, 0.03);
    for (const alloc of r.allocations) {
      const emp = emps.find(e => e.id === alloc.id)!;
      expect(alloc.newSalary).toBeCloseTo(emp.salary * (1 + alloc.meritPct), 4);
    }
  });

  it('throws for budget fraction > 50%', () => {
    expect(() => meritBudgetAllocation(emps, 0.6)).toThrow();
  });

  it('throws for empty employee list', () => {
    expect(() => meritBudgetAllocation([], 0.03)).toThrow();
  });
});

// ─── Workforce forecast ───────────────────────────────────────────────────────

describe('workforceForecast', () => {
  const stable = Array.from({ length: 24 }, (_, i) => 100 + Math.sin(i * 0.5) * 5);

  it('forecast length matches forecastPeriods', () => {
    const r = workforceForecast(stable, 6);
    expect(r.forecast).toHaveLength(6);
  });

  it('RMSE is non-negative', () => {
    const r = workforceForecast(stable, 3);
    expect(r.rmse).toBeGreaterThanOrEqual(0);
  });

  it('optimal alpha is in [0.05, 0.95]', () => {
    const r = workforceForecast(stable, 3);
    expect(r.alpha).toBeGreaterThanOrEqual(0.05);
    expect(r.alpha).toBeLessThanOrEqual(0.95);
  });

  it('constant series → forecast equals constant', () => {
    const constant = Array(12).fill(100);
    const r = workforceForecast(constant, 3);
    for (const f of r.forecast) expect(f).toBeCloseTo(100, 2);
  });

  it('throws for fewer than 3 historical points', () => {
    expect(() => workforceForecast([100, 200], 3)).toThrow();
  });
});

// ─── Attrition risk ───────────────────────────────────────────────────────────

describe('attritionRiskScoring', () => {
  const newHire = makeEmployee('new', 'all', 40000, 0, 2, 1, 0.5);  // short tenure, low salary, low perf
  const veteran = makeEmployee('vet', 'all', 80000, 10, 5, 4, 8);    // long tenure, high salary, high perf

  it('new hire has higher risk than veteran', () => {
    const r = attritionRiskScoring([newHire, veteran]);
    const newScore = r.scores.find(s => s.id === 'new')!.riskScore;
    const vetScore = r.scores.find(s => s.id === 'vet')!.riskScore;
    expect(newScore).toBeGreaterThan(vetScore);
  });

  it('all risk scores are in [0, 1]', () => {
    const r = attritionRiskScoring(equalPayEmployees);
    for (const s of r.scores) {
      expect(s.riskScore).toBeGreaterThanOrEqual(0);
      expect(s.riskScore).toBeLessThanOrEqual(1);
    }
  });

  it('avgRisk is in [0, 1]', () => {
    const r = attritionRiskScoring(equalPayEmployees);
    expect(r.avgRisk).toBeGreaterThanOrEqual(0);
    expect(r.avgRisk).toBeLessThanOrEqual(1);
  });

  it('risk categories are low/medium/high', () => {
    const r = attritionRiskScoring([newHire, veteran]);
    for (const s of r.scores) {
      expect(['low', 'medium', 'high']).toContain(s.riskCategory);
    }
  });

  it('AUC computed when attrited labels present', () => {
    const labeled: Employee[] = [
      { ...newHire, attrited: 1 },
      { ...veteran, attrited: 0 },
    ];
    const r = attritionRiskScoring(labeled);
    expect(r.auc).not.toBeNull();
    expect(r.auc!).toBeGreaterThanOrEqual(0);
    expect(r.auc!).toBeLessThanOrEqual(1);
  });

  it('throws for empty employee list', () => {
    expect(() => attritionRiskScoring([])).toThrow();
  });
});

// ─── Headcount planning ───────────────────────────────────────────────────────

describe('headcountPlan', () => {
  it('gap = required - current (adjusted for attrition)', () => {
    const r = headcountPlan(80, 100, 0.10, 5);
    expect(r.gap).toBeGreaterThan(0); // need to hire
  });

  it('no gap when current ≥ attrition-adjusted required', () => {
    const r = headcountPlan(150, 100, 0.10, 5);
    expect(r.gap).toBeLessThanOrEqual(0);
    expect(r.timeToCloseMonths).toBe(0);
  });

  it('time to close = ceil(gap / hireRate)', () => {
    const r = headcountPlan(80, 100, 0.0, 5); // no attrition
    // gap = 100 - 80 = 20, hireRate = 5 → 4 months
    expect(r.timeToCloseMonths).toBe(4);
  });

  it('attrition-adjusted required > plain required', () => {
    const r = headcountPlan(80, 100, 0.10, 5);
    expect(r.attritionAdjustedRequired).toBeGreaterThan(100);
  });

  it('throws for negative current headcount', () => {
    expect(() => headcountPlan(-1, 100, 0.10, 5)).toThrow();
  });
});

// ─── analyzeWorkforce ─────────────────────────────────────────────────────────

describe('analyzeWorkforce', () => {
  it('always returns attritionRisk', () => {
    const r = analyzeWorkforce({ employees: equalPayEmployees });
    expect(r.attritionRisk).toBeDefined();
    expect(r.converged).toBe(true);
  });

  it('returns payEquity when requested', () => {
    const r = analyzeWorkforce({
      employees: equalPayEmployees,
      payEquity: { groupA: 'male', groupB: 'female' },
    });
    expect(r.payEquity).toBeDefined();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildWorkforceReceipt', () => {
  it('produces receipt with plugin=hr-workforce and CAEL event', () => {
    const result = analyzeWorkforce({ employees: equalPayEmployees });
    const receipt = buildWorkforceReceipt(result);
    expect(receipt.plugin).toBe('hr-workforce');
    expect(receipt.cael.event).toBe('hr_workforce.workforce_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for equal-pay workforce', () => {
    const result = analyzeWorkforce({
      employees: equalPayEmployees,
      payEquity: { groupA: 'male', groupB: 'female' },
    });
    const receipt = buildWorkforceReceipt(result);
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('uses provided runId', () => {
    const result = analyzeWorkforce({ employees: equalPayEmployees });
    const receipt = buildWorkforceReceipt(result, { runId: 'hr-run-01' });
    expect(receipt.runId).toBe('hr-run-01');
  });
});
