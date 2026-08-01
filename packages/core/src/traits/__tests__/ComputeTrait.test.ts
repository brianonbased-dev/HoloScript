import { describe, it, expect, beforeEach } from 'vitest';
import { computeHandler } from '../ComputeTrait';
import {
  COMPUTE_WORK_UNIT_SCHEMA_VERSION,
  buildComputeWorkUnit,
  validateComputeWorkUnitContract,
} from '../../compiler/ComputeWorkUnitCompiler';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('ComputeTrait', () => {
  const sourceBinding = {
    objectName: 'thermal-tracer',
    sourceDigest: 'a'.repeat(64),
    sourceDigestKind: 'canonical_ast',
    compiler: 'ComputeWorkUnitCompiler',
    compilerVersion: '1.0.0',
  } as const;
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    workgroup_size: [64, 1, 1] as [number, number, number],
    dispatch: [4, 1, 1] as [number, number, number],
    shader_source: 'fn main() {}',
    bindings: {},
    auto_dispatch: false,
    dispatch_on_update: false,
    shared_memory_size: 0,
  };

  beforeEach(() => {
    node = createMockNode('comp');
    ctx = createMockContext();
    attachTrait(computeHandler, node, cfg, ctx);
  });

  it('emits compute_init on attach when shader source present', () => {
    expect(getEventCount(ctx, 'compute_init')).toBe(1);
    expect((node as any).__computeState.isReady).toBe(false);
  });

  it('builds an accelerator-neutral work unit from outcome intent', () => {
    const plannedCfg = {
      ...cfg,
      intent: 'Advance the thermal field one explicit step.',
      allowed_accelerators: ['cpu', 'gpu'] as const,
      placement_policy: 'local_only' as const,
      data_classification: 'confidential' as const,
      quality_metric: 'max_abs_error',
      quality_operator: 'lte' as const,
      quality_threshold: 1e-5,
      quality_reference: 'cpu_reference' as const,
      deadline_ms: 5_000,
      budget_currency: 'USD' as const,
      max_cost_minor_units: 0,
      allow_fallback: true,
    };
    const workUnit = buildComputeWorkUnit(plannedCfg, sourceBinding);

    expect(workUnit.schemaVersion).toBe(COMPUTE_WORK_UNIT_SCHEMA_VERSION);
    expect(workUnit.intent).toBe('Advance the thermal field one explicit step.');
    expect(workUnit.source_evidence).toBe(`sha256:${sourceBinding.sourceDigest}`);
    expect(workUnit.compute.policy).toMatchObject({
      placement: 'local_only',
      externalAccess: 'denied',
      allowedAccelerators: ['cpu', 'gpu'],
    });
    expect(workUnit.compute.quality).toEqual({
      metric: 'max_abs_error',
      operator: 'lte',
      threshold: 1e-5,
      reference: 'cpu_reference',
    });
    expect(workUnit.forbidden_actions).toContain('network:external');
    expect(validateComputeWorkUnitContract(workUnit)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a compute work unit that silently enables bridge placement or spend', () => {
    const invalid = buildComputeWorkUnit(
      {
        ...cfg,
        intent: 'Local-only thermal step.',
        placement_policy: 'local_only',
        budget_currency: 'USD',
        max_cost_minor_units: 0,
      },
      sourceBinding
    );
    const tampered = {
      ...invalid,
      compute: {
        ...invalid.compute,
        policy: { ...invalid.compute.policy, externalAccess: 'approved_only' },
        budget: { ...invalid.compute.budget, maxCostMinorUnits: 2 },
      },
    };

    const validation = validateComputeWorkUnitContract(tampered);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        'local_only placement requires externalAccess=denied',
        'local_only placement requires maxCostMinorUnits=0',
      ])
    );
  });

  it('keeps external bridge placement as a request requiring runtime admission', () => {
    const workUnit = buildComputeWorkUnit(
      {
        ...cfg,
        intent: 'Request an admitted external accelerator when owned capacity is unavailable.',
        placement_policy: 'external_bridge_requested',
        allowed_accelerators: ['gpu'],
      },
      sourceBinding
    );

    expect(workUnit.compute.policy).toMatchObject({
      placement: 'external_bridge_requested',
      externalAccess: 'requires_admission',
      bridgeAdmission: 'runtime_receipt_required',
    });
    expect(workUnit.allowed_actions).toContain('compute:request_bridge');
    expect(workUnit.forbidden_actions).toContain('compute:unapproved_bridge');
    expect(workUnit.required_runtime_evidence).toContain('holoscript.compute-bridge-admission.v1');
    expect(validateComputeWorkUnitContract(workUnit)).toEqual({ valid: true, errors: [] });
  });

  it('rejects removal of the unapproved-bridge prohibition', () => {
    const valid = buildComputeWorkUnit(
      {
        intent: 'Request external GPU capacity only after admission.',
        placement_policy: 'external_bridge_requested',
      },
      sourceBinding
    );
    const tampered = { ...valid, forbidden_actions: [] };

    expect(validateComputeWorkUnitContract(tampered).errors).toContain(
      'forbidden_actions must include compute:unapproved_bridge'
    );
  });

  it('rejects done criteria that no longer matches the authored quality rule', () => {
    const valid = buildComputeWorkUnit(
      {
        intent: 'Match a CPU reference within a bounded error.',
        quality_metric: 'max_abs_error',
        quality_operator: 'lte',
        quality_threshold: 1e-5,
        quality_reference: 'cpu_reference',
      },
      sourceBinding
    );
    const tampered = { ...valid, done_criteria: 'always pass' };

    expect(validateComputeWorkUnitContract(tampered).errors).toContain(
      'done_criteria must match compute.quality'
    );
  });

  it('rejects runtime provider state embedded in the authored contract', () => {
    const valid = buildComputeWorkUnit(
      {
        ...cfg,
        intent: 'Provider-neutral thermal step.',
        placement_policy: 'owned_fleet',
        allowed_accelerators: ['gpu'],
      },
      sourceBinding
    );
    const tampered = {
      ...valid,
      compute: {
        ...valid.compute,
        source: { ...valid.compute.source, provider: 'example-cloud' },
        policy: {
          ...valid.compute.policy,
          allowedAccelerators: ['cuda'],
          livePriceUsd: 0.5,
        },
      },
    };

    const validation = validateComputeWorkUnitContract(tampered);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        'compute.source.provider is not allowed in an authored work unit',
        'compute.policy.livePriceUsd is not allowed in an authored work unit',
        'compute.policy.allowedAccelerators contains an invalid accelerator',
      ])
    );
  });

  it('fails compilation for invalid authored accelerator, money, or runtime placement state', () => {
    expect(() =>
      buildComputeWorkUnit(
        {
          intent: 'Do not silently rewrite this request.',
          allowed_accelerators: ['cuda'] as never,
        },
        sourceBinding
      )
    ).toThrow('allowed_accelerators');
    expect(() =>
      buildComputeWorkUnit(
        {
          intent: 'Use an integer monetary ceiling.',
          placement_policy: 'owned_fleet',
          max_cost_minor_units: 1.5,
        },
        sourceBinding
      )
    ).toThrow('max_cost_minor_units');
    expect(() =>
      buildComputeWorkUnit(
        {
          intent: 'Do not silently reconcile contradictory custody.',
          placement_policy: 'local_only',
          max_cost_minor_units: 1,
        },
        sourceBinding
      )
    ).toThrow('local_only placement requires max_cost_minor_units=0');
    expect(() =>
      buildComputeWorkUnit(
        {
          intent: 'Keep provider selection at runtime.',
          provider: 'example-cloud',
        } as never,
        sourceBinding
      )
    ).toThrow('provider is runtime placement state');
  });

  it('compute_initialized marks ready', () => {
    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_initialized',
      shaderModule: 'sm',
      pipeline: 'pl',
    });
    expect((node as any).__computeState.isReady).toBe(true);
    expect(getEventCount(ctx, 'on_compute_ready')).toBe(1);
  });

  it('compute_dispatch emits execute when ready', () => {
    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_initialized',
      shaderModule: 'sm',
      pipeline: 'pl',
    });
    sendEvent(computeHandler, node, cfg, ctx, { type: 'compute_dispatch' });
    expect(getEventCount(ctx, 'compute_execute')).toBe(1);
  });

  it('compute_dispatch errors when not ready', () => {
    sendEvent(computeHandler, node, cfg, ctx, { type: 'compute_dispatch' });
    expect(getEventCount(ctx, 'on_compute_error')).toBe(1);
  });

  it('dispatch_on_update triggers auto dispatch', () => {
    const autoCfg = { ...cfg, dispatch_on_update: true };
    const n2 = createMockNode('au');
    const c2 = createMockContext();
    attachTrait(computeHandler, n2, autoCfg, c2);
    sendEvent(computeHandler, n2, autoCfg, c2, {
      type: 'compute_initialized',
      shaderModule: 'sm',
      pipeline: 'pl',
    });
    updateTrait(computeHandler, n2, autoCfg, c2, 0.016);
    expect(getEventCount(c2, 'compute_execute')).toBe(1);
  });

  it('buffer create and write flow', () => {
    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_create_buffer',
      binding: {
        name: 'data',
        group: 0,
        binding: 0,
        usage: 'read_write',
        dataType: 'f32',
        size: 256,
      },
    });
    expect(getEventCount(ctx, 'compute_allocate_buffer')).toBe(1);

    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_buffer_created',
      name: 'data',
      handle: 'h1',
      group: 0,
    });
    expect((node as any).__computeState.buffers.size).toBe(1);
  });

  it('write_buffer with missing buffer errors', () => {
    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_write_buffer',
      buffer: 'nope',
      data: 'x',
    });
    expect(getEventCount(ctx, 'on_compute_error')).toBe(1);
  });

  it('compute_complete increments execution count', () => {
    sendEvent(computeHandler, node, cfg, ctx, { type: 'compute_complete', executionTime: 1.5 });
    expect((node as any).__computeState.executionCount).toBe(1);
    expect(getEventCount(ctx, 'on_compute_complete')).toBe(1);
  });

  it('query returns state', () => {
    sendEvent(computeHandler, node, cfg, ctx, { type: 'compute_query', queryId: 'q1' });
    const info = getLastEvent(ctx, 'compute_info') as any;
    expect(info.queryId).toBe('q1');
    expect(info.isReady).toBe(false);
  });

  it('detach emits destroy when ready', () => {
    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_initialized',
      shaderModule: 'sm',
      pipeline: 'pl',
    });
    computeHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__computeState).toBeUndefined();
    expect(getEventCount(ctx, 'compute_destroy')).toBe(1);
  });
});
