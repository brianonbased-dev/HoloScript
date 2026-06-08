/**
 * Integration proof: the government-civic `civic_decision` trait, once
 * registered via the runtime's real `registerTrait` seam, is dispatched BY THE
 * RUNTIME and runs the deterministic TOPSIS MCDA solver — NOT called directly
 * as a handler object.
 *
 * Mirrors energy-grid-plugin's runtime-integration reference (power_flow).
 * Drives the real path: executeNode(orb) -> orb-executor -> applyDirectives ->
 * traitHandlers.get('civic_decision').onAttach -> mcdaAnalysis.
 * The negative control proves the registration is load-bearing (without it,
 * the trait is a dead no-op — which is exactly the tier's status quo).
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerGovernmentCivicTraitHandlers } from '../runtime';
import type { MCDACandidate, MCDACriterion } from '../civicsolver';

// One benefit criterion (weight 1.0). Two candidates: A scores 100, B scores 0.
// normalize([100,0]) => A=1.0, B=0.0; weighted by 1.0 unchanged.
// ideal=1.0, antiIdeal=0.0 => TOPSIS: A = 1/(0+1) = 1.0, B = 0/(1+0) = 0.0.
// Ranked desc by TOPSIS => winner = 'A', A.rank=1, B.rank=2.
const TWO_CANDIDATE_CRITERIA: MCDACriterion[] = [
  { name: 'public_benefit', weight: 1.0, isBenefit: true },
];
const TWO_CANDIDATES: MCDACandidate[] = [
  { id: 'A', scores: [100] },
  { id: 'B', scores: [0] },
];

function civicDecisionOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'civic',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'civic_decision', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('government-civic -> HoloScript runtime integration (civic_decision)', () => {
  it('runtime dispatch runs the TOPSIS MCDA solver for a registered @civic_decision orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerGovernmentCivicTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('civic_decision_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(
      civicDecisionOrb({ candidates: TWO_CANDIDATES, criteria: TWO_CANDIDATE_CRITERIA }) as never
    );
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    // Hand-checked: candidate A (score 100) dominates B (score 0) on the single
    // benefit criterion, so TOPSIS makes A the winner at rank 1, B at rank 2.
    expect(summary.winner).toBe('A');
    expect(summary.candidateCount).toBe(2);
    expect(summary.criterionCount).toBe(1);
    const ranking = summary.ranking as Array<{ id: string; rank: number; topsisScore: number }>;
    expect(ranking[0].id).toBe('A');
    expect(ranking[0].rank).toBe(1);
    expect(ranking[0].topsisScore).toBeCloseTo(1.0, 6);
    expect(ranking[1].id).toBe('B');
    expect(ranking[1].rank).toBe(2);
    expect(ranking[1].topsisScore).toBeCloseTo(0.0, 6);
  });

  it('NEGATIVE CONTROL: without registration the @civic_decision trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('civic_decision_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(
      civicDecisionOrb({ candidates: TWO_CANDIDATES, criteria: TWO_CANDIDATE_CRITERIA }) as never
    );
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerGovernmentCivicTraitHandlers(runtime);

    await runtime.executeNode(
      civicDecisionOrb({ candidates: TWO_CANDIDATES, criteria: TWO_CANDIDATE_CRITERIA }) as never
    );
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['civic_decision:civic'] as
      | { winner?: string; candidateCount?: number }
      | undefined;
    expect(persisted).toBeDefined();
    expect(persisted?.winner).toBe('A');
    expect(persisted?.candidateCount).toBe(2);
  });

  it('emits civic_decision_error (does not throw through the runtime) for invalid config', async () => {
    const runtime = new HoloScriptRuntime();
    registerGovernmentCivicTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('civic_decision_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // candidate scores length (2) does not match criteria length (1) — the real
    // solver throws "scores.length must match criteria.length", which the
    // handler's try/catch turns into a civic_decision_error rather than a throw.
    const mismatched: MCDACandidate[] = [{ id: 'A', scores: [1, 2] }];
    await runtime.executeNode(
      civicDecisionOrb({ candidates: mismatched, criteria: TWO_CANDIDATE_CRITERIA }) as never
    );
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('match');
  });
});
