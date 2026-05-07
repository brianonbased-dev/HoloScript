import { describe, it, expect } from 'vitest';
import {
  calculateBurnRate,
  severityFromBurnRate,
  hoursRemaining,
  evaluateBurnRate,
  createMonthlyBudget,
  type BurnRateWindow,
  type BurnRateBudget,
} from './sla-burn-rate';

const BUDGET: BurnRateBudget = {
  totalBudget: 43_200, // 1% of 4.32M monthly requests
  budgetPeriodSeconds: 30 * 24 * 3_600,
};

function makeWindow(bad: number, total: number, durationSeconds = 3_600): BurnRateWindow {
  return { badEvents: bad, totalEvents: total, durationSeconds };
}

describe('calculateBurnRate', () => {
  it('returns 0 for zero budget', () => {
    expect(calculateBurnRate(makeWindow(10, 100), { totalBudget: 0, budgetPeriodSeconds: 1 })).toBe(0);
  });

  it('returns 0 for zero window duration', () => {
    expect(calculateBurnRate(makeWindow(10, 100, 0), BUDGET)).toBe(0);
  });

  it('computes burn rate = 1.0 when window rate equals budget rate', () => {
    // Budget rate = 43_200 / 2_592_000 = 0.01667 bad events / second
    // Window: 60 bad events in 1 hour = 60 / 3_600 = 0.01667
    // Burn rate = 0.01667 / 0.01667 = 1.0
    expect(calculateBurnRate(makeWindow(60, 3_600), BUDGET)).toBeCloseTo(1.0, 2);
  });

  it('computes burn rate = 2.0 when consuming twice the budget rate', () => {
    // 120 bad events in 1 hour = 0.03333 / sec
    // Burn rate = 0.03333 / 0.01667 = 2.0
    expect(calculateBurnRate(makeWindow(120, 3_600), BUDGET)).toBeCloseTo(2.0, 1);
  });

  it('handles fractional burn rates below 1.0', () => {
    // 30 bad events in 1 hour = half the budget rate
    expect(calculateBurnRate(makeWindow(30, 3_600), BUDGET)).toBeCloseTo(0.5, 1);
  });
});

describe('severityFromBurnRate', () => {
  it('ok below 3x', () => {
    expect(severityFromBurnRate(0)).toBe('ok');
    expect(severityFromBurnRate(2.9)).toBe('ok');
  });

  it('warn at 3x', () => {
    expect(severityFromBurnRate(3.0)).toBe('warn');
    expect(severityFromBurnRate(5.9)).toBe('warn');
  });

  it('ticket at 6x', () => {
    expect(severityFromBurnRate(6.0)).toBe('ticket');
    expect(severityFromBurnRate(13.9)).toBe('ticket');
  });

  it('page at 14x', () => {
    expect(severityFromBurnRate(14.0)).toBe('page');
    expect(severityFromBurnRate(50)).toBe('page');
  });
});

describe('hoursRemaining', () => {
  it('returns Infinity for zero burn rate', () => {
    expect(hoursRemaining(0, BUDGET.budgetPeriodSeconds)).toBe(Infinity);
  });

  it('returns 720h for 1.0 burn rate on monthly budget', () => {
    expect(hoursRemaining(1.0, BUDGET.budgetPeriodSeconds)).toBe(720);
  });

  it('returns 240h for 3.0 burn rate', () => {
    expect(hoursRemaining(3.0, BUDGET.budgetPeriodSeconds)).toBe(240);
  });

  it('returns 51.4h for 14.0 burn rate', () => {
    expect(hoursRemaining(14.0, BUDGET.budgetPeriodSeconds)).toBeCloseTo(51.4, 0);
  });
});

describe('evaluateBurnRate', () => {
  it('ok when both windows are healthy', () => {
    const result = evaluateBurnRate(
      makeWindow(30, 3_600), // 0.5x
      makeWindow(2, 300, 300), // ~0.4x in 5m
      BUDGET
    );
    expect(result.severity).toBe('ok');
    expect(result.triggeringWindow).toBe('1h');
    expect(result.burnRate).toBeCloseTo(0.5, 1);
    expect(result.hoursRemaining).toBe(1440);
  });

  it('warn from 1h window', () => {
    const result = evaluateBurnRate(
      makeWindow(180, 3_600), // 3.0x
      makeWindow(5, 300, 300), // ~1.0x in 5m
      BUDGET
    );
    expect(result.severity).toBe('warn');
    expect(result.triggeringWindow).toBe('1h');
    expect(result.hoursRemaining).toBe(240);
  });

  it('page from 1h window', () => {
    const result = evaluateBurnRate(
      makeWindow(840, 3_600), // 14.0x
      makeWindow(10, 300, 300), // ~2.0x in 5m
      BUDGET
    );
    expect(result.severity).toBe('page');
    expect(result.triggeringWindow).toBe('1h');
    expect(result.hoursRemaining).toBeCloseTo(51.4, 0);
  });

  it('5m window wins when it is more severe', () => {
    // 1h is ticket (6x), 5m is page (16.8x)
    const result = evaluateBurnRate(
      makeWindow(360, 3_600, 3_600), // 6.0x → ticket
      makeWindow(84, 300, 300), // 16.8x in 5m -> page
      BUDGET
    );
    expect(result.severity).toBe('page');
    expect(result.triggeringWindow).toBe('5m');
  });

  it('includes severity in summary when alerting', () => {
    const result = evaluateBurnRate(
      makeWindow(360, 3_600),
      makeWindow(5, 300, 300),
      BUDGET
    );
    expect(result.summary).toContain('TICKET');
    expect(result.summary).toContain('1h');
  });

  it('ok summary is reassuring', () => {
    const result = evaluateBurnRate(
      makeWindow(30, 3_600, 3_600),
      makeWindow(2, 300, 300),
      BUDGET
    );
    expect(result.summary).toContain('healthy');
    expect(result.summary).toContain('1440.0h');
  });
});

describe('createMonthlyBudget', () => {
  it('creates a 99.9% SLO budget', () => {
    const budget = createMonthlyBudget(10_000_000, 99.9);
    expect(budget.totalBudget).toBe(10_000); // 0.1% of 10M
    expect(budget.budgetPeriodSeconds).toBe(30 * 24 * 3_600);
  });

  it('creates a 99% SLO budget', () => {
    const budget = createMonthlyBudget(1_000_000, 99.0);
    expect(budget.totalBudget).toBe(10_000); // 1% of 1M
  });
});
