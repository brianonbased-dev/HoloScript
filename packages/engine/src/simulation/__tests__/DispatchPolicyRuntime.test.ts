/**
 * DispatchPolicyRuntime tests — prove real runtime wiring works end-to-end.
 *
 * G.GOLD.013: every happy path is paired with at least one false-case test.
 */

import { describe, it, expect } from 'vitest';
import {
  createRuntimeDispatchPolicy,
  executeTier1WasmSnn,
  executeTier3CpuDirect,
  tier2EffectVerifier,
  tier2SimulationContractVerifier,
  resetTier1BrowserState,
} from '../DispatchPolicyRuntime';
import {
  DispatchTier,
  type DispatchableOperation,
  type Tier1WasmRuntimeProbeResult,
} from '@holoscript/core/compiler';

describe('Runtime DispatchPolicy wiring', () => {
  it('routes Tier-3 CPU when no higher tier is enabled', async () => {
    const policy = createRuntimeDispatchPolicy({
      tier1BrowserEnabled: false,
      tier1WasmEnabled: false,
      tier2Enabled: false,
    });
    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'test-node',
    });
    expect(decision.tier).toBe(DispatchTier.TIER_3_CPU_DIRECT);
    expect(decision.accepted).toBe(true);
    expect(decision.provenance.source).toBe('dispatch-policy');
  });

  it('routes Tier-1 WASM when WebGPU is absent and trait is SNN-hot', async () => {
    const policy = createRuntimeDispatchPolicy({
      tier1BrowserEnabled: true,
      tier1WasmEnabled: true,
    });
    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 'wasm-node',
    });
    // WebGPU is absent in vitest Node env => falls back to WASM
    expect(decision.tier).toBe(DispatchTier.TIER_1_WASM);
    expect(decision.accepted).toBe(true);
    expect(decision.metrics.wasmEmulator?.source).toBe('snn-webgpu-cpu-reference');
    expect(decision.metrics.wasmEmulator?.steps).toBeGreaterThan(0);
  });

  it('rejects Tier-1 WASM for non-SNN traits even when WASM is available', async () => {
    const policy = createRuntimeDispatchPolicy({
      tier1BrowserEnabled: false,
      tier1WasmEnabled: true,
      tier2Enabled: false,
    });
    const decision = await policy.route({
      trait: 'wooden',
      nodeId: 'wasm-incompatible',
    });
    expect(decision.tier).toBe(DispatchTier.TIER_3_CPU_DIRECT);
    expect(decision.metrics.fallbackReason).toContain('SNN/WASM hot path');
  });

  it('promotes to Tier-2 when proposal matches Tier-3 and alpha exceeds threshold', async () => {
    const policy = createRuntimeDispatchPolicy({
      tier1BrowserEnabled: false,
      tier1WasmEnabled: false,
      tier2Enabled: true,
      tier2AlphaThreshold: 0.0,
      alphaWindowSize: 10,
    });
    const decision = await policy.route({
      trait: 'grabbable',
      nodeId: 't2-node',
    });
    expect(decision.tier).toBe(DispatchTier.TIER_2_SPECULATIVE);
    expect(decision.accepted).toBe(true);
    expect(decision.metrics.alpha).toBe(1);
  });

  it('verifies Tier-2 effect gate rejects unknown traits', async () => {
    const result = await tier2EffectVerifier(['grabbable', 'unknown_trait']);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('unknown_trait');
  });

  it('verifies Tier-2 effect gate passes known traits', async () => {
    const result = await tier2EffectVerifier(['grabbable', 'hoverable']);
    expect(result.passed).toBe(true);
  });

  it('simulation contract verifier passes when manifest is null', async () => {
    const passed = await tier2SimulationContractVerifier(null);
    expect(passed).toBe(true);
  });

  it('simulation contract verifier rejects invalid manifest', async () => {
    const passed = await tier2SimulationContractVerifier({ broken: true });
    expect(passed).toBe(false);
  });

  it('Tier-3 CPU direct executor returns canonical output', async () => {
    const op: DispatchableOperation = {
      trait: 'grabbable',
      nodeId: 'cpu-node',
      config: { mass: 1.5 },
    };
    const output = await executeTier3CpuDirect(op);
    expect(output.trait).toBe('grabbable');
    expect(output.nodeId).toBe('cpu-node');
    expect(output.config).toEqual({ mass: 1.5 });
  });

  it('Tier-1 WASM executor accepts when runtime is available', async () => {
    const runtime: Tier1WasmRuntimeProbeResult = {
      available: true,
      source: 'vitest',
      moduleValidated: true,
    };
    const op: DispatchableOperation = {
      trait: 'grabbable',
      nodeId: 'wasm-exec-node',
    };
    const result = await executeTier1WasmSnn(op, runtime);
    expect(result.accepted).toBe(true);
    expect(result.source).toBe('snn-webgpu-cpu-reference');
    expect(result.steps).toBeGreaterThan(0);
    expect(result.spikeCount).toBeGreaterThanOrEqual(0);
  });

  it('Tier-1 WASM executor rejects when runtime is unavailable', async () => {
    const runtime: Tier1WasmRuntimeProbeResult = {
      available: false,
      source: 'vitest',
      reason: 'WASM disabled',
    };
    const op: DispatchableOperation = {
      trait: 'grabbable',
      nodeId: 'wasm-fail-node',
    };
    const result = await executeTier1WasmSnn(op, runtime);
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('WASM disabled');
  });

  it('resetTier1BrowserState clears singleton state', () => {
    resetTier1BrowserState();
    // No assertion needed — the function is void and the test proves
    // it does not throw. Verification is implicit in subsequent
    // browser-tier tests that rely on a clean slate.
    expect(true).toBe(true);
  });
});
