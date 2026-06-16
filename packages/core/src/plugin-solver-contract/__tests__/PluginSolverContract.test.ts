import { describe, it, expect } from 'vitest';
import {
  PluginSolverContractRegistry,
  SolverReceiptSchemaRegistry,
  wrapSolverInContract,
  globalContractRegistry,
  globalSchemaRegistry,
} from '../PluginSolverContract';
import type {
  PluginSolverContract,
  SolverReceiptSchemaEntry,
  PluginClauseContext,
} from '../PluginSolverContract';

// ── Test fixtures ─────────────────────────────────────────────────────────────

interface EoqConfig {
  annualDemand: number;
  orderingCost: number;
  holdingCost: number;
}

interface EoqResult {
  eoq: number;
  ordersPerYear: number;
  totalAnnualCost: number;
}

function eoqSolver(config: EoqConfig): EoqResult {
  const { annualDemand, orderingCost, holdingCost } = config;
  const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);
  const ordersPerYear = annualDemand / eoq;
  const totalAnnualCost = ordersPerYear * orderingCost + (eoq / 2) * holdingCost;
  return { eoq, ordersPerYear, totalAnnualCost };
}

const EOQ_CONTRACT: PluginSolverContract = {
  id: 'retail-ecommerce-v1',
  pluginId: 'retail-ecommerce',
  description: 'Proves EOQ result is positive and demand-consistent.',
  preconditions: [
    {
      id: 'positive_demand',
      kind: 'precondition',
      description: 'Annual demand must be > 0',
    },
    {
      id: 'positive_costs',
      kind: 'precondition',
      description: 'Ordering and holding costs must be > 0',
    },
  ],
  invariants: [],
  postconditions: [
    {
      id: 'positive_eoq',
      kind: 'postcondition',
      description: 'EOQ result must be a finite positive number',
    },
    {
      id: 'warn_high_orders',
      kind: 'postcondition',
      description: 'Warn when orders/year exceeds 100 (unusual)',
      severity: 'warning',
    },
  ],
};

const EOQ_SCHEMA: SolverReceiptSchemaEntry = {
  id: 'retail-ecommerce-receipt-v1',
  pluginId: 'retail-ecommerce',
  description: 'EOQ result shape: eoq, ordersPerYear, totalAnnualCost all positive numbers.',
  validate: (raw) => {
    const r = raw as Record<string, unknown>;
    const violations = [];
    if (typeof r?.eoq !== 'number' || r.eoq <= 0)
      violations.push({ field: 'eoq', message: 'must be a positive number' });
    if (typeof r?.ordersPerYear !== 'number' || r.ordersPerYear <= 0)
      violations.push({ field: 'ordersPerYear', message: 'must be a positive number' });
    if (typeof r?.totalAnnualCost !== 'number' || r.totalAnnualCost <= 0)
      violations.push({ field: 'totalAnnualCost', message: 'must be a positive number' });
    return { valid: violations.length === 0, violations };
  },
};

// Fresh registries for test isolation
function freshRegistries() {
  const contractReg = new PluginSolverContractRegistry();
  const schemaReg = new SolverReceiptSchemaRegistry();
  contractReg.registerContract(EOQ_CONTRACT);
  contractReg.registerEvaluator('retail-ecommerce-v1', 'positive_demand', (ctx) => {
    const c = ctx.config as EoqConfig;
    return typeof c.annualDemand === 'number' && c.annualDemand > 0;
  });
  contractReg.registerEvaluator('retail-ecommerce-v1', 'positive_costs', (ctx) => {
    const c = ctx.config as EoqConfig;
    return c.orderingCost > 0 && c.holdingCost > 0;
  });
  contractReg.registerEvaluator('retail-ecommerce-v1', 'positive_eoq', (ctx) => {
    const r = ctx.result as EoqResult | undefined;
    return typeof r?.eoq === 'number' && r.eoq > 0 && Number.isFinite(r.eoq);
  });
  contractReg.registerEvaluator('retail-ecommerce-v1', 'warn_high_orders', (ctx) => {
    const r = ctx.result as EoqResult | undefined;
    return (r?.ordersPerYear ?? 0) <= 100;
  });
  schemaReg.registerSchema(EOQ_SCHEMA);
  return { contractReg, schemaReg };
}

// ── PluginSolverContractRegistry ──────────────────────────────────────────────

describe('PluginSolverContractRegistry.registerContract', () => {
  it('registers a contract and returns it via getContract', () => {
    const reg = new PluginSolverContractRegistry();
    reg.registerContract(EOQ_CONTRACT);
    expect(reg.getContract('retail-ecommerce-v1')).toEqual(EOQ_CONTRACT);
  });

  it('is idempotent when the same plugin re-registers', () => {
    const reg = new PluginSolverContractRegistry();
    reg.registerContract(EOQ_CONTRACT);
    expect(() => reg.registerContract(EOQ_CONTRACT)).not.toThrow();
  });

  it('throws when a different plugin tries to register the same id', () => {
    const reg = new PluginSolverContractRegistry();
    reg.registerContract(EOQ_CONTRACT);
    const other: PluginSolverContract = { ...EOQ_CONTRACT, pluginId: 'imposter' };
    expect(() => reg.registerContract(other)).toThrow(/already registered/);
  });

  it('increments size on new registration', () => {
    const reg = new PluginSolverContractRegistry();
    expect(reg.size).toBe(0);
    reg.registerContract(EOQ_CONTRACT);
    expect(reg.size).toBe(1);
  });

  it('returns undefined for an unregistered id', () => {
    const reg = new PluginSolverContractRegistry();
    expect(reg.getContract('nonexistent')).toBeUndefined();
  });
});

describe('PluginSolverContractRegistry.registerEvaluator', () => {
  it('registers an evaluator retrievable via getEvaluator', () => {
    const reg = new PluginSolverContractRegistry();
    reg.registerContract(EOQ_CONTRACT);
    const ev = (ctx: PluginClauseContext) => true;
    reg.registerEvaluator('retail-ecommerce-v1', 'positive_demand', ev);
    expect(reg.getEvaluator('retail-ecommerce-v1', 'positive_demand')).toBe(ev);
  });

  it('returns undefined for an unregistered evaluator', () => {
    const reg = new PluginSolverContractRegistry();
    expect(reg.getEvaluator('nonexistent', 'clause')).toBeUndefined();
  });
});

// ── SolverReceiptSchemaRegistry ───────────────────────────────────────────────

describe('SolverReceiptSchemaRegistry.registerSchema', () => {
  it('registers a schema and returns it via getSchema', () => {
    const reg = new SolverReceiptSchemaRegistry();
    reg.registerSchema(EOQ_SCHEMA);
    expect(reg.getSchema('retail-ecommerce-receipt-v1')).toEqual(EOQ_SCHEMA);
  });

  it('is idempotent for the same plugin', () => {
    const reg = new SolverReceiptSchemaRegistry();
    reg.registerSchema(EOQ_SCHEMA);
    expect(() => reg.registerSchema(EOQ_SCHEMA)).not.toThrow();
  });

  it('throws when a different plugin claims the same schema id', () => {
    const reg = new SolverReceiptSchemaRegistry();
    reg.registerSchema(EOQ_SCHEMA);
    const other = { ...EOQ_SCHEMA, pluginId: 'imposter' };
    expect(() => reg.registerSchema(other)).toThrow(/already registered/);
  });
});

describe('SolverReceiptSchemaRegistry.validate', () => {
  it('returns null when schema is not registered (freeform)', () => {
    const reg = new SolverReceiptSchemaRegistry();
    expect(reg.validate('nonexistent-schema', {})).toBeNull();
  });

  it('returns valid:true for a conforming result', () => {
    const reg = new SolverReceiptSchemaRegistry();
    reg.registerSchema(EOQ_SCHEMA);
    const result = reg.validate('retail-ecommerce-receipt-v1', {
      eoq: 100,
      ordersPerYear: 10,
      totalAnnualCost: 500,
    });
    expect(result?.valid).toBe(true);
    expect(result?.violations).toHaveLength(0);
  });

  it('returns valid:false with violations for a non-conforming result', () => {
    const reg = new SolverReceiptSchemaRegistry();
    reg.registerSchema(EOQ_SCHEMA);
    const result = reg.validate('retail-ecommerce-receipt-v1', { eoq: -5 });
    expect(result?.valid).toBe(false);
    expect(result?.violations.length).toBeGreaterThan(0);
  });
});

// ── wrapSolverInContract ──────────────────────────────────────────────────────

describe('wrapSolverInContract — happy path', () => {
  it('runs the solver and returns contractVerified:true when all clauses pass', () => {
    const { contractReg, schemaReg } = freshRegistries();
    const wrapped = wrapSolverInContract(
      eoqSolver,
      'retail-ecommerce-v1',
      'retail-ecommerce-receipt-v1',
      contractReg,
      schemaReg,
    );
    const out = wrapped({ annualDemand: 1000, orderingCost: 50, holdingCost: 2 });
    expect(out.contractVerified).toBe(true);
    expect(out.clauseViolations.filter((v) => v.severity === 'error')).toHaveLength(0);
    expect(out.result.eoq).toBeGreaterThan(0);
  });

  it('sets schemaValid:true when result conforms to schema', () => {
    const { contractReg, schemaReg } = freshRegistries();
    const wrapped = wrapSolverInContract(
      eoqSolver,
      'retail-ecommerce-v1',
      'retail-ecommerce-receipt-v1',
      contractReg,
      schemaReg,
    );
    const out = wrapped({ annualDemand: 1000, orderingCost: 50, holdingCost: 2 });
    expect(out.schemaValid).toBe(true);
    expect(out.schemaId).toBe('retail-ecommerce-receipt-v1');
    expect(out.schemaViolations).toHaveLength(0);
  });
});

describe('wrapSolverInContract — precondition failure', () => {
  it('aborts before running solver when an error-severity precondition fires', () => {
    const { contractReg, schemaReg } = freshRegistries();
    const wrapped = wrapSolverInContract(
      eoqSolver,
      'retail-ecommerce-v1',
      'retail-ecommerce-receipt-v1',
      contractReg,
      schemaReg,
    );
    const out = wrapped({ annualDemand: -100, orderingCost: 50, holdingCost: 2 });
    expect(out.contractVerified).toBe(false);
    expect(out.clauseViolations.some((v) => v.clauseId === 'positive_demand')).toBe(true);
    // result should be undefined since we aborted early
    expect(out.result).toBeUndefined();
  });
});

describe('wrapSolverInContract — postcondition failure', () => {
  it('sets contractVerified:false when an error-severity postcondition fires', () => {
    const { contractReg, schemaReg } = freshRegistries();
    // Solver that returns negative eoq (pathological)
    const brokenSolver = (_: EoqConfig) => ({ eoq: -1, ordersPerYear: 0, totalAnnualCost: 0 });
    const wrapped = wrapSolverInContract(
      brokenSolver,
      'retail-ecommerce-v1',
      'retail-ecommerce-receipt-v1',
      contractReg,
      schemaReg,
    );
    const out = wrapped({ annualDemand: 1000, orderingCost: 50, holdingCost: 2 });
    expect(out.contractVerified).toBe(false);
    expect(out.clauseViolations.some((v) => v.clauseId === 'positive_eoq')).toBe(true);
  });

  it('keeps contractVerified:true for warning-only postconditions', () => {
    const { contractReg, schemaReg } = freshRegistries();
    // High demand → >100 orders/year → triggers warn_high_orders (warning, not error)
    const out = wrapSolverInContract(
      eoqSolver,
      'retail-ecommerce-v1',
      'retail-ecommerce-receipt-v1',
      contractReg,
      schemaReg,
    )({ annualDemand: 100_000, orderingCost: 1, holdingCost: 2 });
    expect(out.contractVerified).toBe(true);
    const warn = out.clauseViolations.find((v) => v.clauseId === 'warn_high_orders');
    expect(warn?.severity).toBe('warning');
  });
});

describe('wrapSolverInContract — schema validation', () => {
  it('sets schemaValid:null when no schemaId is provided (freeform)', () => {
    const { contractReg, schemaReg } = freshRegistries();
    const out = wrapSolverInContract(
      eoqSolver,
      'retail-ecommerce-v1',
      undefined,
      contractReg,
      schemaReg,
    )({ annualDemand: 1000, orderingCost: 50, holdingCost: 2 });
    expect(out.schemaValid).toBeNull();
    expect(out.schemaId).toBeNull();
  });

  it('sets schemaValid:null when schemaId is provided but not registered', () => {
    const { contractReg, schemaReg } = freshRegistries();
    const out = wrapSolverInContract(
      eoqSolver,
      'retail-ecommerce-v1',
      'unregistered-schema',
      contractReg,
      schemaReg,
    )({ annualDemand: 1000, orderingCost: 50, holdingCost: 2 });
    expect(out.schemaValid).toBeNull();
  });

  it('sets schemaValid:false with violations when result fails schema', () => {
    const { contractReg, schemaReg } = freshRegistries();
    const brokenSolver = (_: EoqConfig) => ({ eoq: -99, ordersPerYear: 0, totalAnnualCost: 0 });
    const out = wrapSolverInContract(
      brokenSolver,
      undefined, // no contract
      'retail-ecommerce-receipt-v1',
      contractReg,
      schemaReg,
    )({ annualDemand: 1000, orderingCost: 50, holdingCost: 2 });
    expect(out.schemaValid).toBe(false);
    expect(out.schemaViolations.length).toBeGreaterThan(0);
  });
});

describe('wrapSolverInContract — no contract registered', () => {
  it('runs solver unguarded when contractId is undefined', () => {
    const { contractReg, schemaReg } = freshRegistries();
    const out = wrapSolverInContract(
      eoqSolver,
      undefined,
      'retail-ecommerce-receipt-v1',
      contractReg,
      schemaReg,
    )({ annualDemand: 1000, orderingCost: 50, holdingCost: 2 });
    expect(out.contractVerified).toBe(true); // no clauses → no violations → verified
    expect(out.clauseViolations).toHaveLength(0);
    expect(out.result.eoq).toBeGreaterThan(0);
  });

  it('runs solver unguarded when contractId points to unregistered contract', () => {
    const { contractReg, schemaReg } = freshRegistries();
    const out = wrapSolverInContract(
      eoqSolver,
      'nonexistent-contract',
      undefined,
      contractReg,
      schemaReg,
    )({ annualDemand: 1000, orderingCost: 50, holdingCost: 2 });
    expect(out.contractVerified).toBe(true);
  });
});

// ── Singletons ────────────────────────────────────────────────────────────────

describe('global singletons', () => {
  it('globalContractRegistry is a PluginSolverContractRegistry instance', () => {
    expect(globalContractRegistry).toBeInstanceOf(PluginSolverContractRegistry);
  });

  it('globalSchemaRegistry is a SolverReceiptSchemaRegistry instance', () => {
    expect(globalSchemaRegistry).toBeInstanceOf(SolverReceiptSchemaRegistry);
  });
});
