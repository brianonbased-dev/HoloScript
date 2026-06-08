/**
 * Integration proof: the hr-workforce `pay_equity` trait, once registered via
 * the runtime's real `registerTrait` seam, is dispatched BY THE RUNTIME and
 * runs the deterministic pay-equity analytic solver — NOT called directly as a
 * handler object.
 *
 * Mirrors government-civic-plugin's runtime-integration reference
 * (civic_decision). Drives the real path: executeNode(orb) -> orb-executor ->
 * applyDirectives -> traitHandlers.get('pay_equity').onAttach ->
 * payEquityAnalysis. The negative control proves the registration is
 * load-bearing (without it, the trait is a dead no-op — which is exactly the
 * tier's status quo).
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerHrWorkforceTraitHandlers } from '../runtime';
import type { Employee } from '../workforce';

// ── Hand-derived fixture ────────────────────────────────────────────────────
// Two groups, each with 2 employees (payEquityAnalysis requires ≥2 per group).
//   male   salaries: [100000, 100000] => meanSalaryA = 200000 / 2 = 100000
//   female salaries: [ 80000,  80000] => meanSalaryB = 160000 / 2 =  80000
// Per the solver formula  rawGapPct = ((meanA - meanB) / meanB) * 100:
//   rawGapPct = ((100000 - 80000) / 80000) * 100
//             = (20000 / 80000) * 100
//             = 0.25 * 100
//             = 25.0   (men earn 25% more than women, raw)
// These values are derived BY HAND from the formula above, NOT read back from
// the solver. The handler surfaces meanSalaryA / meanSalaryB / rawGapPct, so we
// assert against the hand arithmetic.
const EQUITY_EMPLOYEES: Employee[] = [
  {
    id: 'm1',
    salary: 100000,
    group: 'male',
    yearsExperience: 5,
    performanceRating: 3,
    jobLevel: 3,
    tenureYears: 4,
  },
  {
    id: 'm2',
    salary: 100000,
    group: 'male',
    yearsExperience: 5,
    performanceRating: 3,
    jobLevel: 3,
    tenureYears: 4,
  },
  {
    id: 'f1',
    salary: 80000,
    group: 'female',
    yearsExperience: 5,
    performanceRating: 3,
    jobLevel: 3,
    tenureYears: 4,
  },
  {
    id: 'f2',
    salary: 80000,
    group: 'female',
    yearsExperience: 5,
    performanceRating: 3,
    jobLevel: 3,
    tenureYears: 4,
  },
];

function payEquityOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'workforce',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'pay_equity', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('hr-workforce -> HoloScript runtime integration (pay_equity)', () => {
  it('runtime dispatch runs the pay-equity solver for a registered @pay_equity orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerHrWorkforceTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('pay_equity_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(
      payEquityOrb({ employees: EQUITY_EMPLOYEES, groupA: 'male', groupB: 'female' }) as never
    );
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    // Hand-checked (see fixture comment): meanA=100000, meanB=80000, gap=25.0%.
    expect(summary.groupA).toBe('male');
    expect(summary.groupB).toBe('female');
    expect(summary.meanSalaryA as number).toBeCloseTo(100000, 6);
    expect(summary.meanSalaryB as number).toBeCloseTo(80000, 6);
    expect(summary.rawGapPct as number).toBeCloseTo(25.0, 6);
    expect(summary.employeeCount).toBe(4);
  });

  it('NEGATIVE CONTROL: without registration the @pay_equity trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('pay_equity_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(
      payEquityOrb({ employees: EQUITY_EMPLOYEES, groupA: 'male', groupB: 'female' }) as never
    );
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerHrWorkforceTraitHandlers(runtime);

    await runtime.executeNode(
      payEquityOrb({ employees: EQUITY_EMPLOYEES, groupA: 'male', groupB: 'female' }) as never
    );
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['pay_equity:workforce'] as
      | { groupA?: string; groupB?: string; rawGapPct?: number; employeeCount?: number }
      | undefined;
    expect(persisted).toBeDefined();
    expect(persisted?.groupA).toBe('male');
    expect(persisted?.groupB).toBe('female');
    // Same hand-derived 25.0% raw gap, now read from durable runtime state.
    expect(persisted?.rawGapPct).toBeCloseTo(25.0, 6);
    expect(persisted?.employeeCount).toBe(4);
  });

  it('emits pay_equity_error (does not throw through the runtime) for invalid config', async () => {
    const runtime = new HoloScriptRuntime();
    registerHrWorkforceTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('pay_equity_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // groupB 'female' has only ONE matching employee, but the real solver
    // requires ≥2 per group and throws "Group 'female' needs at least 2
    // employees" — the handler's try/catch turns that into a pay_equity_error
    // rather than a throw through the runtime.
    const malformed: Employee[] = [
      {
        id: 'm1',
        salary: 100000,
        group: 'male',
        yearsExperience: 5,
        performanceRating: 3,
        jobLevel: 3,
        tenureYears: 4,
      },
      {
        id: 'm2',
        salary: 100000,
        group: 'male',
        yearsExperience: 5,
        performanceRating: 3,
        jobLevel: 3,
        tenureYears: 4,
      },
      {
        id: 'f1',
        salary: 80000,
        group: 'female',
        yearsExperience: 5,
        performanceRating: 3,
        jobLevel: 3,
        tenureYears: 4,
      },
    ];
    await runtime.executeNode(
      payEquityOrb({ employees: malformed, groupA: 'male', groupB: 'female' }) as never
    );
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('at least 2');
  });
});
