import { describe, it, expect } from 'vitest';
import {
  composeReceipts,
  flattenForRecompose,
  verifyCompositionLaws,
  PROOF_COMPOSITION_LAWS,
} from '../ProofCompositionLaw';
import type { ComposedReceipt } from '../ProofCompositionLaw';
import type {
  WrappedSolverResult,
  PluginClauseViolation,
} from '../../plugin-solver-contract/PluginSolverContract';
import {
  wrapSolverInContract,
  PluginSolverContractRegistry,
  SolverReceiptSchemaRegistry,
} from '../../plugin-solver-contract/PluginSolverContract';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeResult(
  overrides: Partial<WrappedSolverResult<unknown>> = {}
): WrappedSolverResult<unknown> {
  return {
    result: {},
    contractVerified: true,
    schemaValid: null,
    schemaId: null,
    clauseViolations: [],
    schemaViolations: [],
    pluginId: 'test-plugin',
    contractId: 'test-contract',
    ...overrides,
  };
}

function makeViolation(clauseId: string, pluginId = 'test-plugin'): PluginClauseViolation {
  return {
    clauseId,
    kind: 'postcondition',
    severity: 'error',
    message: `Clause ${clauseId} violated`,
    pluginId,
  };
}

// ── PROOF_COMPOSITION_LAWS catalog ────────────────────────────────────────────

describe('PROOF_COMPOSITION_LAWS', () => {
  it('exports the five canonical law names', () => {
    expect(PROOF_COMPOSITION_LAWS).toContain('empty-identity');
    expect(PROOF_COMPOSITION_LAWS).toContain('and-monotone');
    expect(PROOF_COMPOSITION_LAWS).toContain('schema-null-coalescing-and');
    expect(PROOF_COMPOSITION_LAWS).toContain('violation-union');
    expect(PROOF_COMPOSITION_LAWS).toContain('flat-associativity');
    expect(PROOF_COMPOSITION_LAWS).toHaveLength(5);
  });
});

// ── Law 1: empty-identity ─────────────────────────────────────────────────────

describe('Law 1 — empty-identity', () => {
  it('composedVerified is true for empty composition', () => {
    expect(composeReceipts([]).composedVerified).toBe(true);
  });

  it('composedSchemaValid is null for empty composition', () => {
    expect(composeReceipts([]).composedSchemaValid).toBeNull();
  });

  it('allViolations is empty', () => {
    expect(composeReceipts([]).allViolations).toHaveLength(0);
  });

  it('allSchemaViolations is empty', () => {
    expect(composeReceipts([]).allSchemaViolations).toHaveLength(0);
  });

  it('pluginIds and contractIds are empty', () => {
    const r = composeReceipts([]);
    expect(r.pluginIds).toHaveLength(0);
    expect(r.contractIds).toHaveLength(0);
  });

  it('hash is a valid fnv1a32-prefixed string', () => {
    expect(composeReceipts([]).hash).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });
});

// ── Law 2: AND-monotone ───────────────────────────────────────────────────────

describe('Law 2 — and-monotone', () => {
  it('composedVerified is true when all components are verified', () => {
    const a = makeResult({ contractVerified: true });
    const b = makeResult({ contractVerified: true });
    expect(composeReceipts([a, b]).composedVerified).toBe(true);
  });

  it('composedVerified is false when any component is unverified', () => {
    const a = makeResult({ contractVerified: true });
    const b = makeResult({ contractVerified: false });
    expect(composeReceipts([a, b]).composedVerified).toBe(false);
  });

  it('AND-monotone is order-independent', () => {
    const a = makeResult({ contractVerified: true });
    const b = makeResult({ contractVerified: false });
    expect(composeReceipts([b, a]).composedVerified).toBe(false);
    expect(composeReceipts([a, b]).composedVerified).toBe(false);
  });

  it('single verified component → composedVerified true', () => {
    expect(composeReceipts([makeResult()]).composedVerified).toBe(true);
  });

  it('single unverified component → composedVerified false', () => {
    expect(composeReceipts([makeResult({ contractVerified: false })]).composedVerified).toBe(false);
  });
});

// ── Law 3: schema-null-coalescing-and ────────────────────────────────────────

describe('Law 3 — schema-null-coalescing-and', () => {
  it('null when all components are freeform', () => {
    expect(composeReceipts([makeResult(), makeResult()]).composedSchemaValid).toBeNull();
  });

  it('true when all non-null schemas pass (freeform mixed in)', () => {
    const a = makeResult({ schemaValid: true });
    const b = makeResult({ schemaValid: null });
    expect(composeReceipts([a, b]).composedSchemaValid).toBe(true);
  });

  it('true when all non-null schemas pass', () => {
    const a = makeResult({ schemaValid: true });
    const b = makeResult({ schemaValid: true });
    expect(composeReceipts([a, b]).composedSchemaValid).toBe(true);
  });

  it('false when any non-null schema fails', () => {
    const a = makeResult({ schemaValid: true });
    const b = makeResult({ schemaValid: false });
    expect(composeReceipts([a, b]).composedSchemaValid).toBe(false);
  });

  it('false when sole non-null schema fails (freeform alongside)', () => {
    const a = makeResult({ schemaValid: false });
    const b = makeResult({ schemaValid: null });
    expect(composeReceipts([a, b]).composedSchemaValid).toBe(false);
  });
});

// ── Law 4: violation-union ────────────────────────────────────────────────────

describe('Law 4 — violation-union', () => {
  it('allViolations is the union of all component clauseViolations', () => {
    const va = makeViolation('clause-a');
    const vb = makeViolation('clause-b');
    const a = makeResult({ clauseViolations: [va] });
    const b = makeResult({ clauseViolations: [vb] });
    const { allViolations } = composeReceipts([a, b]);
    expect(allViolations).toHaveLength(2);
    expect(allViolations.map((v) => v.clauseId)).toContain('clause-a');
    expect(allViolations.map((v) => v.clauseId)).toContain('clause-b');
  });

  it('allViolations preserves order within each component', () => {
    const v1 = makeViolation('first');
    const v2 = makeViolation('second');
    const a = makeResult({ clauseViolations: [v1, v2] });
    const { allViolations } = composeReceipts([a]);
    expect(allViolations[0].clauseId).toBe('first');
    expect(allViolations[1].clauseId).toBe('second');
  });

  it('allSchemaViolations is the union of all component schemaViolations', () => {
    const a = makeResult({ schemaViolations: [{ field: 'x', message: 'bad x' }] });
    const b = makeResult({ schemaViolations: [{ field: 'y', message: 'bad y' }] });
    expect(composeReceipts([a, b]).allSchemaViolations).toHaveLength(2);
  });

  it('empty components yield empty violation arrays', () => {
    expect(composeReceipts([makeResult(), makeResult()]).allViolations).toHaveLength(0);
  });
});

// ── Law 5: flat-associativity ─────────────────────────────────────────────────

describe('Law 5 — flat-associativity (via flattenForRecompose)', () => {
  it('compose(compose(A,B), C) is verification-equivalent to compose(A,B,C)', () => {
    const [a, b, c] = [makeResult(), makeResult(), makeResult()];
    const ab = composeReceipts([a, b]);
    const recomposed = composeReceipts(flattenForRecompose(ab, [c]));
    const direct = composeReceipts([a, b, c]);
    expect(recomposed.composedVerified).toBe(direct.composedVerified);
    expect(recomposed.composedSchemaValid).toBe(direct.composedSchemaValid);
    expect(recomposed.allViolations).toHaveLength(direct.allViolations.length);
  });

  it('flattenForRecompose without additional returns only the components', () => {
    const a = makeResult();
    const composed = composeReceipts([a]);
    expect(flattenForRecompose(composed)).toHaveLength(1);
  });

  it('holds when an unverified component is involved', () => {
    const [a, b, c] = [makeResult(), makeResult({ contractVerified: false }), makeResult()];
    const ab = composeReceipts([a, b]);
    const recomposed = composeReceipts(flattenForRecompose(ab, [c]));
    const direct = composeReceipts([a, b, c]);
    expect(recomposed.composedVerified).toBe(false);
    expect(direct.composedVerified).toBe(false);
  });

  it('flattenForRecompose is additive with multiple additional components', () => {
    const [a, b, c, d] = [makeResult(), makeResult(), makeResult(), makeResult()];
    const ab = composeReceipts([a, b]);
    const flat = flattenForRecompose(ab, [c, d]);
    expect(flat).toHaveLength(4);
    expect(composeReceipts(flat).composedVerified).toBe(true);
  });
});

// ── Provenance ─────────────────────────────────────────────────────────────────

describe('provenance — pluginIds and contractIds', () => {
  it('collects pluginIds from components', () => {
    const a = makeResult({ pluginId: 'plugin-a' });
    const b = makeResult({ pluginId: 'plugin-b' });
    const { pluginIds } = composeReceipts([a, b]);
    expect(pluginIds).toContain('plugin-a');
    expect(pluginIds).toContain('plugin-b');
  });

  it('deduplicates pluginIds', () => {
    const a = makeResult({ pluginId: 'plugin-a' });
    const b = makeResult({ pluginId: 'plugin-a' });
    expect(composeReceipts([a, b]).pluginIds).toHaveLength(1);
  });

  it('collects contractIds from components', () => {
    const a = makeResult({ contractId: 'contract-a' });
    const b = makeResult({ contractId: 'contract-b' });
    const { contractIds } = composeReceipts([a, b]);
    expect(contractIds).toContain('contract-a');
    expect(contractIds).toContain('contract-b');
  });

  it('deduplicates contractIds', () => {
    const a = makeResult({ contractId: 'contract-x' });
    const b = makeResult({ contractId: 'contract-x' });
    expect(composeReceipts([a, b]).contractIds).toHaveLength(1);
  });

  it('null pluginId and contractId are excluded from provenance', () => {
    const a = makeResult({ pluginId: null, contractId: null });
    const r = composeReceipts([a]);
    expect(r.pluginIds).toHaveLength(0);
    expect(r.contractIds).toHaveLength(0);
  });
});

// ── Hash ──────────────────────────────────────────────────────────────────────

describe('hash', () => {
  it('is a fnv1a32-prefixed 8-hex-char string', () => {
    expect(composeReceipts([makeResult()]).hash).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });

  it('is deterministic for identical compositions', () => {
    const a = makeResult();
    expect(composeReceipts([a]).hash).toBe(composeReceipts([a]).hash);
  });

  it('differs when contractVerified differs', () => {
    const v = makeResult({ contractVerified: true });
    const u = makeResult({ contractVerified: false });
    expect(composeReceipts([v]).hash).not.toBe(composeReceipts([u]).hash);
  });

  it('differs when schemaValid differs', () => {
    const a = makeResult({ schemaValid: true });
    const b = makeResult({ schemaValid: false });
    expect(composeReceipts([a]).hash).not.toBe(composeReceipts([b]).hash);
  });

  it('differs when violations differ', () => {
    const clean = makeResult({ clauseViolations: [] });
    const dirty = makeResult({ clauseViolations: [makeViolation('x')] });
    expect(composeReceipts([clean]).hash).not.toBe(composeReceipts([dirty]).hash);
  });

  it('empty composition has a stable hash', () => {
    expect(composeReceipts([]).hash).toBe(composeReceipts([]).hash);
  });
});

// ── verifyCompositionLaws ─────────────────────────────────────────────────────

describe('verifyCompositionLaws', () => {
  it('returns empty array for a law-compliant receipt', () => {
    const receipt = composeReceipts([makeResult(), makeResult({ schemaValid: true })]);
    expect(verifyCompositionLaws(receipt)).toHaveLength(0);
  });

  it('returns empty array for the empty composition', () => {
    expect(verifyCompositionLaws(composeReceipts([]))).toHaveLength(0);
  });

  it('detects and-monotone violation in a tampered receipt', () => {
    const receipt: ComposedReceipt = {
      ...composeReceipts([makeResult({ contractVerified: true })]),
      composedVerified: false, // tampered: should be true
    };
    expect(verifyCompositionLaws(receipt)).toContain('and-monotone');
  });

  it('detects schema-null-coalescing-and violation in a tampered receipt', () => {
    const receipt: ComposedReceipt = {
      ...composeReceipts([makeResult({ schemaValid: true })]),
      composedSchemaValid: null, // tampered: should be true
    };
    expect(verifyCompositionLaws(receipt)).toContain('schema-null-coalescing-and');
  });

  it('detects violation-union violation in a tampered receipt', () => {
    const v = makeViolation('x');
    const receipt: ComposedReceipt = {
      ...composeReceipts([makeResult({ clauseViolations: [v] })]),
      allViolations: [], // tampered: should have 1
    };
    expect(verifyCompositionLaws(receipt)).toContain('violation-union');
  });

  it('can detect multiple law violations simultaneously', () => {
    const v = makeViolation('x');
    const receipt: ComposedReceipt = {
      ...composeReceipts([makeResult({ contractVerified: true, clauseViolations: [v] })]),
      composedVerified: false, // tampered
      allViolations: [], // tampered
    };
    const failing = verifyCompositionLaws(receipt);
    expect(failing).toContain('and-monotone');
    expect(failing).toContain('violation-union');
  });
});

// ── Integration: wrapSolverInContract → composeReceipts ───────────────────────

describe('integration — wrapSolverInContract feeds composeReceipts', () => {
  interface EoqConfig {
    annualDemand: number;
    orderingCost: number;
    holdingCost: number;
  }

  function eoqSolver(cfg: EoqConfig) {
    const eoq = Math.sqrt((2 * cfg.annualDemand * cfg.orderingCost) / cfg.holdingCost);
    return { eoq, ordersPerYear: cfg.annualDemand / eoq };
  }

  it('composes two unguarded solver results into a verified receipt', () => {
    const contractReg = new PluginSolverContractRegistry();
    const schemaReg = new SolverReceiptSchemaRegistry();
    const wrapped = wrapSolverInContract(eoqSolver, undefined, undefined, contractReg, schemaReg);

    const r1 = wrapped({ annualDemand: 1000, orderingCost: 50, holdingCost: 2 });
    const r2 = wrapped({ annualDemand: 500, orderingCost: 30, holdingCost: 1 });

    const composed = composeReceipts([r1, r2]);
    expect(composed.composedVerified).toBe(true);
    expect(composed.components).toHaveLength(2);
    expect(verifyCompositionLaws(composed)).toHaveLength(0);
  });

  it('composed receipt inherits pluginId null when no contract provided', () => {
    const contractReg = new PluginSolverContractRegistry();
    const schemaReg = new SolverReceiptSchemaRegistry();
    const wrapped = wrapSolverInContract(eoqSolver, undefined, undefined, contractReg, schemaReg);
    const r = wrapped({ annualDemand: 1000, orderingCost: 50, holdingCost: 2 });

    expect(r.pluginId).toBeNull();
    expect(r.contractId).toBeNull();
    expect(composeReceipts([r]).pluginIds).toHaveLength(0);
  });
});
