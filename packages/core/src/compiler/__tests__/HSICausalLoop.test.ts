/**
 * HSI-IR Stage-B causal loop — acceptance tests (board task 6mg9).
 *
 * Covers the board acceptance criteria verbatim:
 *  - {}, family-skewed input, missing handler, and unresolved evidence all fail closed;
 *  - transparent / opaque / unknown cases select distinct actions;
 *  - one IR-edge counterfactual predictably flips action/outcome;
 *  - direct-policy/text and same-fields-JSON baselines recorded with latency + invalid-action rate;
 *  - no LLM/provider call anywhere in the proof (the whole loop is synchronous + deterministic).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { parseHoloStrict } from '../../parser/HoloCompositionParser';
import { lowerCompositionToHSIIR } from '../HSIIRCompiler';
import type { Capability } from '../identity/CapabilityToken';
import {
  runCausalLoop,
  runCausalLoopFromIR,
  withOpacityCounterfactual,
  benchmarkBaselines,
  HSI_CAUSAL_LOOP_SCHEMA_VERSION,
  type HSICausalLoopInput,
} from '../HSICausalLoop';

const FIXTURE_PATH = join(__dirname, '..', '..', '__tests__', 'fixtures', 'hs-core-barrier-world.hsplus');
const SOURCE = readFileSync(FIXTURE_PATH, 'utf8');
const WORLD = 'holoscript://world/HSCoreBarrierWorld';

const FULL_GRANT: Capability[] = [
  { with: WORLD, can: 'world/traverse' },
  { with: WORLD, can: 'world/inspect' },
];

function baseInput(barrier: string, grant: Capability[] = FULL_GRANT): HSICausalLoopInput {
  return { sourceText: SOURCE, agent: 'Scout', target: 'Beacon', barrier, grantedCapabilities: grant };
}

describe('HSI-IR Stage-B causal loop (task 6mg9)', () => {
  describe('distinct actions for transparent / opaque / unknown', () => {
    it('transparent barrier (GlassPane) resolves clear -> safe -> traverse -> goal reached', () => {
      const r = runCausalLoop(baseInput('GlassPane'));
      expect(r.resolution).toEqual({ status: 'resolved', occluded: false, occluder: null, reason: null });
      expect(r.policy).toBe('safe');
      expect(r.action.name).toBe('traverse');
      expect(r.action.granted).toBe(true);
      expect(r.mutation.applied).toBe(true);
      expect(r.nextState).toEqual({ goalReached: true, traversals: 1, inspections: 0 });
      expect(r.outcome).toBe('goal-reached');
      expect(r.failClosed).toBe(false);
      expect(r.mutation.traceValid).toBe(true);
    });

    it('opaque barrier (StoneSlab) resolves occluded -> block -> hold -> no goal', () => {
      const r = runCausalLoop(baseInput('StoneSlab'));
      expect(r.resolution).toEqual({ status: 'resolved', occluded: true, occluder: 'StoneSlab', reason: null });
      expect(r.policy).toBe('block');
      expect(r.action.name).toBe('hold');
      expect(r.mutation.applied).toBe(false);
      expect(r.nextState?.goalReached).toBe(false);
      expect(r.nextState?.traversals).toBe(0);
      expect(r.outcome).toBe('held');
    });

    it('unknown barrier (VeilPanel) resolves underdetermined -> inspect -> probe -> no goal', () => {
      const r = runCausalLoop(baseInput('VeilPanel'));
      expect(r.resolution).toEqual({ status: 'unresolvable', occluded: null, occluder: null, reason: 'underdetermined' });
      expect(r.policy).toBe('inspect');
      expect(r.action.name).toBe('inspect');
      expect(r.mutation.applied).toBe(true);
      expect(r.nextState).toEqual({ goalReached: false, traversals: 0, inspections: 1 });
      expect(r.outcome).toBe('inspected');
    });

    it('the three cases select three distinct actions and outcomes', () => {
      const actions = ['GlassPane', 'StoneSlab', 'VeilPanel'].map((b) => runCausalLoop(baseInput(b)).action.name);
      const outcomes = ['GlassPane', 'StoneSlab', 'VeilPanel'].map((b) => runCausalLoop(baseInput(b)).outcome);
      expect(new Set(actions).size).toBe(3);
      expect(new Set(outcomes).size).toBe(3);
      expect(actions).toEqual(['traverse', 'hold', 'inspect']);
    });
  });

  describe('four distinct fail-closed paths', () => {
    it('{} empty world fails closed at admission', () => {
      const r = runCausalLoop({ sourceText: '', agent: 'Scout', target: 'Beacon', barrier: 'GlassPane', grantedCapabilities: FULL_GRANT });
      expect(r.admission.admitted).toBe(false);
      expect(r.failClosed).toBe(true);
      expect(r.mutation.applied).toBe(false);
      expect(r.outcome).toBe('blocked-fail-closed');
      expect(r.nextState).toBeNull();
    });

    it('family-skewed query (agent is not an agent-role entity) fails closed', () => {
      // StoneSlab has role "barrier", not "agent" — a skewed perception query.
      const r = runCausalLoop({ sourceText: SOURCE, agent: 'StoneSlab', target: 'Beacon', barrier: 'GlassPane', grantedCapabilities: FULL_GRANT });
      expect(r.admission.error).toBe('family-skewed-query');
      expect(r.failClosed).toBe(true);
      expect(r.mutation.applied).toBe(false);
      expect(r.outcome).toBe('blocked-fail-closed');
    });

    it('missing handler (no granted capability for the action) fails closed — no mutation', () => {
      // Transparent barrier would traverse, but the grant set lacks world/traverse.
      const r = runCausalLoop(baseInput('GlassPane', []));
      expect(r.policy).toBe('safe');
      expect(r.action.name).toBe('traverse');
      expect(r.action.granted).toBe(false);
      expect(r.action.denial).toContain('world/traverse');
      expect(r.failClosed).toBe(true);
      expect(r.mutation.applied).toBe(false);
      expect(r.nextState).toBeNull();
    });

    it('unresolved evidence never yields a confident traverse (fails closed against confabulation)', () => {
      const r = runCausalLoop(baseInput('VeilPanel'));
      expect(r.action.name).not.toBe('traverse');
      expect(r.nextState?.goalReached).toBe(false);
      expect(r.outcome).toBe('inspected');
    });
  });

  describe('one IR-edge counterfactual predictably flips action and outcome', () => {
    it('flipping VeilPanel opacity unknown -> transparent flips inspect->traverse and goal false->true', () => {
      const ir = lowerCompositionToHSIIR(parseHoloStrict(SOURCE), { sourceText: SOURCE });
      const input = baseInput('VeilPanel');

      const factual = runCausalLoopFromIR(ir, input);
      expect(factual.action.name).toBe('inspect');
      expect(factual.nextState?.goalReached).toBe(false);

      const counterfactualIr = withOpacityCounterfactual(ir, 'VeilPanel', 'transparent');
      const counterfactual = runCausalLoopFromIR(counterfactualIr, input);
      expect(counterfactual.action.name).toBe('traverse');
      expect(counterfactual.nextState?.goalReached).toBe(true);

      // The action and the outcome both flipped from exactly one IR-edge change.
      expect(counterfactual.action.name).not.toBe(factual.action.name);
      expect(counterfactual.nextState?.goalReached).not.toBe(factual.nextState?.goalReached);
      // The counterfactual left the caller's IR untouched.
      expect(runCausalLoopFromIR(ir, input).action.name).toBe('inspect');
    });

    it('flipping transparent -> opaque flips traverse->hold', () => {
      const ir = lowerCompositionToHSIIR(parseHoloStrict(SOURCE), { sourceText: SOURCE });
      const input = baseInput('GlassPane');
      expect(runCausalLoopFromIR(ir, input).action.name).toBe('traverse');
      const cf = withOpacityCounterfactual(ir, 'GlassPane', 'opaque');
      expect(runCausalLoopFromIR(cf, input).action.name).toBe('hold');
    });
  });

  describe('baselines recorded with latency + invalid-action rate', () => {
    it('gap-aware loop has zero invalid actions; both baselines confabulate over non-transparent barriers', () => {
      const ir = lowerCompositionToHSIIR(parseHoloStrict(SOURCE), { sourceText: SOURCE });
      const barriers = ['GlassPane', 'StoneSlab', 'VeilPanel'];
      const results = benchmarkBaselines(ir, 'Scout', 'Beacon', barriers, () => performance.now());

      const byKind = Object.fromEntries(results.map((r) => [r.kind, r]));

      // Gap-aware loop: never traverses an opaque/unknown barrier.
      expect(byKind['gap-aware-loop'].invalidActionRate).toBe(0);

      // direct-policy/text: no gap awareness — confabulates a traverse over the unknown VeilPanel.
      expect(byKind['direct-policy-text'].invalidActionRate).toBeGreaterThan(0);

      // same-fields-json: reads opacity but coerces unknown -> transparent — also traverses VeilPanel.
      expect(byKind['same-fields-json'].invalidActionRate).toBeGreaterThan(0);

      // Latency is recorded for each and is a finite, non-negative number.
      for (const r of results) {
        expect(Number.isFinite(r.latencyMsPerDecision)).toBe(true);
        expect(r.latencyMsPerDecision).toBeGreaterThanOrEqual(0);
        expect(r.decisions).toHaveLength(3);
      }
    });
  });

  describe('determinism (no LLM / no wall clock / no randomness in the receipt)', () => {
    it('same input yields an identical deterministic digest across runs', () => {
      const a = runCausalLoop(baseInput('VeilPanel'));
      const b = runCausalLoop(baseInput('VeilPanel'));
      expect(a.deterministicDigest).toBe(b.deterministicDigest);
      expect(a.schemaVersion).toBe(HSI_CAUSAL_LOOP_SCHEMA_VERSION);
      expect(a.deterministicDigest.startsWith('sha256:')).toBe(true);
    });

    it('distinct barriers yield distinct receipt digests', () => {
      const digests = ['GlassPane', 'StoneSlab', 'VeilPanel'].map((b) => runCausalLoop(baseInput(b)).deterministicDigest);
      expect(new Set(digests).size).toBe(3);
    });
  });
});
