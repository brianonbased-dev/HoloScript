/**
 * EXP-1 C3 — REAL provenance coverage via CAEL.
 *
 * Replaces the conservative fail-honest stub (which always reported 0 traced) with
 * an HONEST, replayable measure of "provenance by construction":
 *
 *   A model output (a scene mutation) is TRACED iff it can be bound, in a
 *   hash-sealed CAEL record, to a REPLAYABLE SimulationContract verification —
 *   the same deterministic oracle (verifySceneMutation) the runner grades with.
 *   The record is rebuilt here from PUBLIC inputs (the task's scene + contract and
 *   the model's mutation), so a third party recomputing it gets the same chain.
 *   That is what makes it provenance and not an unfalsifiable claim.
 *
 * Honest boundaries (NOT overclaimed):
 *   - This measures STRUCTURAL provenance: the output is hash-bound to a replayable
 *     contract check. It does NOT assert the output is semantically "true" beyond
 *     what the contract verifies.
 *   - Provenance ≠ correctness: a mutation that FAILS its contract is still traced
 *     (we can prove it failed). Coverage counts contract-bound outputs, pass or fail.
 *   - An UNSCOPED task (no contract) cannot be traced to a contract check, so it
 *     honestly scores 0 — coverage is penalised exactly where provenance is absent.
 *   - No mutation emitted ⇒ no claim ⇒ totalClaims 0 (neither rewarded nor punished;
 *     the runner treats 0/0 as coverage 1, i.e. "nothing to trace").
 */

import {
  buildBrittneyCaelRecord,
  verifyBrittneyCaelRecord,
} from '../../brittney/cael';
import { verifySceneMutation, type ContractResolver } from '../../brittney/SimContractGate';
import type { ProvenanceChecker } from './types';

export const caelProvenance: ProvenanceChecker = async (result, task) => {
  // A "claim" = the model asserted a scene change (emitted a mutation).
  if (!result.mutation) return { totalClaims: 0, tracedClaims: 0 };

  // Replayable provenance requires a contract to verify the mutation against.
  // An unscoped scene has nothing to bind to → a claim, but not traceable.
  if (!task.contract) return { totalClaims: 1, tracedClaims: 0 };

  const contract = task.contract;
  const resolver: ContractResolver = (ref) => (ref === contract.id ? contract : null);

  // Re-run the INDEPENDENT, deterministic oracle (the replayable check).
  const oracle = verifySceneMutation(task.sceneContext, result.mutation, resolver);

  // Bind output → contract-verification in a hash-sealed CAEL record, rebuilt from
  // public inputs (deterministic: tick_iso is not part of any layer hash).
  const record = buildBrittneyCaelRecord({
    sessionId: `exp1:${task.id}`,
    round: 0,
    model: 'exp1-arm',
    messages: [],
    finalText: result.rawOutput,
    toolCalls: [
      {
        name: result.mutation.tool,
        input: result.mutation.input,
        result: { passed: oracle.passed, contractId: oracle.contractId },
      },
    ],
    evidencePaths: [],
    // Non-null binds the output to a contract check (pass OR fail = provenance).
    simContractCheck: { passed: oracle.passed, constraints: [oracle.contractId] },
    prevChain: null,
  });

  const traced =
    verifyBrittneyCaelRecord(record) && record.simContractCheck !== null ? 1 : 0;
  return { totalClaims: 1, tracedClaims: traced };
};
