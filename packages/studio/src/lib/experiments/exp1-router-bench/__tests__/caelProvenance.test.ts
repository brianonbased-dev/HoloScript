import { describe, it, expect } from 'vitest';

import { buildBrittneyCaelRecord, verifyBrittneyCaelRecord } from '../../../brittney/cael';
import { caelProvenance } from '../caelProvenance';
import { EXP1_FIRST_SLICE } from '../tasks';
import type { ArmModelResult, BenchTask } from '../types';

const scopedTask = EXP1_FIRST_SLICE[0]; // has a contract (glow-safety-v1)

function resultWithMutation(): ArmModelResult {
  return {
    rawOutput:
      '{"tool":"set_trait_property","input":{"target":"lamp","trait":"glow","property":"intensity","value":1}}',
    mutation: {
      tool: 'set_trait_property',
      input: { target: 'lamp', trait: 'glow', property: 'intensity', value: 1 },
    },
    inputTokens: 100,
    outputTokens: 20,
  };
}

describe('verifyBrittneyCaelRecord', () => {
  it('verifies a well-formed record built from inputs', () => {
    const record = buildBrittneyCaelRecord({
      sessionId: 's1',
      round: 0,
      model: 'm',
      messages: [],
      finalText: 'hello',
      toolCalls: [{ name: 't', input: {}, result: {} }],
      evidencePaths: [],
      simContractCheck: { passed: true, constraints: ['c1'] },
      prevChain: null,
    });
    expect(verifyBrittneyCaelRecord(record)).toBe(true);
  });

  it('rejects a tampered record (mutated composite hash)', () => {
    const record = buildBrittneyCaelRecord({
      sessionId: 's1',
      round: 0,
      model: 'm',
      messages: [],
      finalText: 'hello',
      toolCalls: [],
      evidencePaths: [],
      simContractCheck: null,
      prevChain: null,
    });
    const tampered = { ...record, layer_hashes: [...record.layer_hashes.slice(0, 6), 'deadbeef'] };
    expect(verifyBrittneyCaelRecord(tampered)).toBe(false);
  });

  it('is deterministic — same inputs reproduce the same chain (replayability)', () => {
    const input = {
      sessionId: 'exp1:t',
      round: 0,
      model: 'm',
      messages: [],
      finalText: 'out',
      toolCalls: [{ name: 'x', input: { a: 1 } }],
      evidencePaths: [],
      simContractCheck: { passed: false, constraints: ['c'] },
      prevChain: null,
    };
    const a = buildBrittneyCaelRecord(input);
    const b = buildBrittneyCaelRecord(input);
    expect(a.fnv1a_chain).toBe(b.fnv1a_chain); // tick_iso is NOT in the hash
  });
});

describe('caelProvenance (C3 checker)', () => {
  it('traces a mutation bound to a contract (pass or fail)', async () => {
    const prov = await caelProvenance(resultWithMutation(), scopedTask);
    expect(prov.totalClaims).toBe(1);
    expect(prov.tracedClaims).toBe(1);
  });

  it('does NOT trace a mutation on an unscoped (no-contract) task', async () => {
    const unscoped: BenchTask = { ...scopedTask, contract: null };
    const prov = await caelProvenance(resultWithMutation(), unscoped);
    expect(prov.totalClaims).toBe(1);
    expect(prov.tracedClaims).toBe(0);
  });

  it('reports no claim when the model emitted no mutation', async () => {
    const noMutation: ArmModelResult = {
      rawOutput: '',
      mutation: null,
      inputTokens: 5,
      outputTokens: 0,
    };
    const prov = await caelProvenance(noMutation, scopedTask);
    expect(prov.totalClaims).toBe(0);
    expect(prov.tracedClaims).toBe(0);
  });
});
