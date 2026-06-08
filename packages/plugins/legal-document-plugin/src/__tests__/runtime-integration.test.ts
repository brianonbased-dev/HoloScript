/**
 * Integration proof: the legal-document `legal_analysis` trait, once registered
 * via the runtime's real `registerTrait` seam, is dispatched BY THE RUNTIME and
 * runs the contract analytics solver — NOT called directly as a handler object
 * (the thin convention every other trait test uses).
 *
 * Mirrors energy-grid's runtime-integration proof (deep-ratchet 2026-06-07).
 * Drives the real path: executeNode(orb) -> orb-executor -> applyDirectives ->
 * traitHandlers.get('legal_analysis').onAttach -> analyzeLegalDocument.
 * The negative control proves the registration is load-bearing (without it,
 * the trait is a dead no-op — which is exactly the tier's status quo).
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerLegalDocumentTraitHandlers } from '../runtime';

// A short contract exercising every solver facet: two SHALL obligations
// (indemnify / shall-not assign), a $50,000 liquidated-damages penalty clause,
// a non-compete + arbitration risk surface. Hand-checked against the real
// solver: gradeLevel ~7.91, riskScore 49 (medium), maxPenaltyExposure 50000,
// 2 obligations, flaggedTerms include indemnify / liquidated damages / penalty.
const SAMPLE_CONTRACT =
  'The Vendor shall indemnify the Client against all claims. ' +
  'The Vendor shall not assign this agreement without consent. ' +
  'Liquidated damages of $50,000 apply for late delivery. ' +
  'This agreement contains a non-compete clause and is governed by arbitration. ' +
  'The penalty for breach is severe.';

function legalAnalysisOrb(text: string): unknown {
  return {
    type: 'orb',
    name: 'legal',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'legal_analysis', config: { text } }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('legal-document -> HoloScript runtime integration (deep-ratchet 2026-06-07)', () => {
  it('runtime dispatch runs the contract analyzer for a registered @legal_analysis orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerLegalDocumentTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('legal_analysis_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(legalAnalysisOrb(SAMPLE_CONTRACT) as never);
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    expect(summary.converged).toBe(true);
    // Hand-checked from the solver: Flesch-Kincaid grade level ~7.91.
    const gradeLevel = summary.readingGradeLevel as number;
    expect(gradeLevel).toBeGreaterThan(7);
    expect(gradeLevel).toBeLessThan(9);
    // Keyword-weighted clause risk: exactly 49 -> 'medium'.
    expect(summary.riskScore).toBe(49);
    expect(summary.riskCategory).toBe('medium');
    // The $50,000 liquidated-damages clause is the full max penalty exposure.
    expect(summary.maxPenaltyExposureUSD).toBe(50000);
    // Two SHALL/SHALL-NOT obligations were extracted.
    expect(summary.obligationCount).toBe(2);
    // High-risk terms were flagged by the scorer.
    const flagged = summary.flaggedTerms as string[];
    expect(flagged).toContain('indemnify');
    expect(flagged).toContain('liquidated damages');
    expect(flagged).toContain('non-compete');
  });

  it('NEGATIVE CONTROL: without registration the @legal_analysis trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('legal_analysis_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(legalAnalysisOrb(SAMPLE_CONTRACT) as never);
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerLegalDocumentTraitHandlers(runtime);

    await runtime.executeNode(legalAnalysisOrb(SAMPLE_CONTRACT) as never);
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['legal_analysis:legal'] as
      | { converged?: boolean; riskScore?: number; riskCategory?: string }
      | undefined;
    expect(persisted).toBeDefined();
    expect(persisted?.converged).toBe(true);
    expect(persisted?.riskScore).toBe(49);
    expect(persisted?.riskCategory).toBe('medium');
  });

  it('emits legal_analysis_error (does not throw through the runtime) for empty input', async () => {
    const runtime = new HoloScriptRuntime();
    registerLegalDocumentTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('legal_analysis_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // Orb whose @legal_analysis directive carries empty document text.
    await runtime.executeNode(legalAnalysisOrb('   ') as never);
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('config.text');
  });
});
