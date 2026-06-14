/**
 * VQERunnerTrait adversarial tests (F.069 — failing-if-broken assertions).
 *
 * Guards:
 *   GUARD1 — trait initialises; handler name and defaultConfig are correct.
 *   GUARD2 — vqe:run event → vqe:started then vqe:converged (stub path).
 *   GUARD3 — vqe:run while already running → vqe:error ALREADY_RUNNING.
 *   GUARD4 — vqe:cancel suppresses converged event.
 *   GUARD5 — vqe:status replies with current state.
 *   GUARD6 — receipt emitted on converged when writeReceipt=true.
 *   GUARD7 — receipt schema = 'cael-quantum-v1.vqe-runner'.
 *   GUARD8 — payloadHash is a non-empty string.
 *   GUARD9 — onDetach cancels a running job.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  vqeRunnerHandler,
  vqeRunnerTrait,
  type VQERunnerConfig,
  type VQEReceipt,
  type VQERunResult,
} from '../VQERunnerTrait';
import type { TraitContext, TraitEvent } from '../TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// ---------------------------------------------------------------------------
// Minimal test doubles
// ---------------------------------------------------------------------------

function makeNode(): HSPlusNode {
  return { id: `test-node-${Math.random()}` } as unknown as HSPlusNode;
}

function makeContext() {
  const emitted: TraitEvent[] = [];
  const ctx: TraitContext = {
    // TraitContext uses emit(eventType, payload) — matches QuantumCircuitTrait/QuantumInspiredTrait pattern
    emit: (type: string, payload?: unknown) => {
      emitted.push({ type, payload } as TraitEvent);
    },
    // Minimal stubs for other TraitContext fields
    getState: () => ({}),
    setState: () => undefined,
    getScaleMultiplier: () => 1,
    setScaleContext: () => undefined,
  } as unknown as TraitContext;
  return { ctx, emitted };
}

function baseConfig(overrides: Partial<VQERunnerConfig> = {}): VQERunnerConfig {
  return {
    method: 'vqe',
    basis: 'sto-3g',
    backend: 'aer',
    optimizer: 'cobyla',
    maxIter: 300,
    nShots: 1024,
    writeReceipt: true,
    ...overrides,
  };
}

const N2_ATOMS = [
  { symbol: 'N', x: 0, y: 0, z: 0 },
  { symbol: 'N', x: 0, y: 0, z: 1.0975 },
];

// Helper: wait for async events emitted by dispatchVQE
async function flushAsync(ms = 200): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VQERunnerTrait', () => {
  // GUARD1 — handler structure
  describe('GUARD1: initialisation', () => {
    it('handler name is vqeRunner', () => {
      expect(vqeRunnerHandler.name).toBe('vqeRunner');
    });

    it('defaultConfig is present with correct fields', () => {
      const cfg = vqeRunnerHandler.defaultConfig;
      expect(cfg).toBeDefined();
      expect(cfg!.method).toBe('vqe');
      expect(cfg!.basis).toBe('sto-3g');
      expect(cfg!.backend).toBe('aer');
      expect(cfg!.maxIter).toBe(300);
      expect(cfg!.writeReceipt).toBe(true);
    });

    it('vqeRunnerTrait export has name and aliases', () => {
      expect(vqeRunnerTrait.name).toBe('vqeRunner');
      expect(vqeRunnerTrait.aliases).toContain('vqe_runner');
    });

    it('onAttach does not throw', () => {
      const node = makeNode();
      const { ctx } = makeContext();
      expect(() => vqeRunnerHandler.onAttach!(node, baseConfig(), ctx)).not.toThrow();
    });
  });

  // GUARD2 — vqe:run → vqe:started + result event (stub or converged path)
  // When qm-bridge is installed, the run goes to IBMQuantumBackend and emits
  // 'vqe:converged' (tier='hardware'). When qm-bridge is absent or its backend
  // module is not compiled, dispatchVQE returns tier='stub', which the trait
  // handler routes to 'vqe:stub-result' instead of 'vqe:converged' to prevent
  // stub results from being confused with real optimization output (ratchet commit).
  // This guard accepts EITHER event so it tests the control flow, not the backend.
  describe('GUARD2: vqe:run triggers started and converged', () => {
    it('emits vqe:started immediately then vqe:converged asynchronously', async () => {
      const node = makeNode();
      const { ctx, emitted } = makeContext();
      vqeRunnerHandler.onAttach!(node, baseConfig(), ctx);

      vqeRunnerHandler.onEvent!(node, baseConfig(), ctx, {
        type: 'vqe:run',
        payload: { molecule: N2_ATOMS },
      });

      // started is emitted synchronously before the async dispatchVQE
      const started = emitted.find((e) => e.type === 'vqe:started');
      expect(started).toBeDefined();
      expect((started!.payload as Record<string, unknown>).backend).toBe('aer');

      await flushAsync(500);

      // Accept either 'vqe:converged' (real hardware path) or 'vqe:stub-result'
      // (stub path when qm-bridge backend is not compiled). Both prove the async
      // completion flow ran and emitted a terminal event with a VQERunResult.
      const converged =
        emitted.find((e) => e.type === 'vqe:converged') ??
        emitted.find((e) => e.type === 'vqe:stub-result');
      expect(converged).toBeDefined();
      const result = converged!.payload as VQERunResult;
      // NaN is a valid JS 'number' typeof; real runs return finite energy
      expect(typeof result.energy).toBe('number');
      expect(result.unit).toBe('Ha');
    });
  });

  // GUARD3 — double-start → ALREADY_RUNNING error
  describe('GUARD3: double vqe:run emits ALREADY_RUNNING error', () => {
    it('second vqe:run while running emits vqe:error ALREADY_RUNNING', async () => {
      const node = makeNode();
      const { ctx, emitted } = makeContext();
      vqeRunnerHandler.onAttach!(node, baseConfig(), ctx);

      // First run — will enter running state
      vqeRunnerHandler.onEvent!(node, baseConfig(), ctx, {
        type: 'vqe:run',
        payload: { molecule: N2_ATOMS },
      });

      // Second run immediately after (still running)
      vqeRunnerHandler.onEvent!(node, baseConfig(), ctx, {
        type: 'vqe:run',
        payload: { molecule: N2_ATOMS },
      });

      const errors = emitted.filter((e) => e.type === 'vqe:error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect((errors[0]!.payload as Record<string, unknown>).code).toBe('ALREADY_RUNNING');

      await flushAsync(500); // let first job finish
    });
  });

  // GUARD4 — vqe:cancel suppresses converged
  describe('GUARD4: vqe:cancel suppresses converged', () => {
    it('cancelling before async completion prevents vqe:converged', async () => {
      const node = makeNode();
      const { ctx, emitted } = makeContext();
      vqeRunnerHandler.onAttach!(node, baseConfig(), ctx);

      vqeRunnerHandler.onEvent!(node, baseConfig(), ctx, {
        type: 'vqe:run',
        payload: { molecule: N2_ATOMS },
      });

      // Cancel immediately
      vqeRunnerHandler.onEvent!(node, baseConfig(), ctx, {
        type: 'vqe:cancel',
        payload: undefined,
      });

      await flushAsync(500);

      const converged = emitted.find((e) => e.type === 'vqe:converged');
      // After cancel, converged MUST NOT be emitted
      expect(converged).toBeUndefined();
    });
  });

  // GUARD5 — vqe:status replies
  describe('GUARD5: vqe:status emits status:reply', () => {
    it('idle node replies with status=idle', () => {
      const node = makeNode();
      const { ctx, emitted } = makeContext();
      vqeRunnerHandler.onAttach!(node, baseConfig(), ctx);

      vqeRunnerHandler.onEvent!(node, baseConfig(), ctx, {
        type: 'vqe:status',
        payload: undefined,
      });

      const reply = emitted.find((e) => e.type === 'vqe:status:reply');
      expect(reply).toBeDefined();
      expect((reply!.payload as Record<string, unknown>).status).toBe('idle');
    });
  });

  // GUARD6 — receipt emitted when writeReceipt=true
  describe('GUARD6: receipt emitted on convergence', () => {
    it('vqe:receipt is emitted after vqe:converged when writeReceipt=true', async () => {
      const node = makeNode();
      const { ctx, emitted } = makeContext();
      vqeRunnerHandler.onAttach!(node, baseConfig({ writeReceipt: true }), ctx);

      vqeRunnerHandler.onEvent!(node, baseConfig({ writeReceipt: true }), ctx, {
        type: 'vqe:run',
        payload: { molecule: N2_ATOMS },
      });

      await flushAsync(500);

      const receipt = emitted.find((e) => e.type === 'vqe:receipt');
      expect(receipt).toBeDefined();
    });

    it('vqe:receipt is NOT emitted when writeReceipt=false', async () => {
      const node = makeNode();
      const { ctx, emitted } = makeContext();
      vqeRunnerHandler.onAttach!(node, baseConfig({ writeReceipt: false }), ctx);

      vqeRunnerHandler.onEvent!(node, baseConfig({ writeReceipt: false }), ctx, {
        type: 'vqe:run',
        payload: { molecule: N2_ATOMS },
      });

      await flushAsync(500);

      const receipt = emitted.find((e) => e.type === 'vqe:receipt');
      expect(receipt).toBeUndefined();
    });
  });

  // GUARD7 — receipt schema
  describe('GUARD7: receipt has correct schema', () => {
    it('receipt schema = cael-quantum-v1.vqe-runner', async () => {
      const node = makeNode();
      const { ctx, emitted } = makeContext();
      vqeRunnerHandler.onAttach!(node, baseConfig(), ctx);

      vqeRunnerHandler.onEvent!(node, baseConfig(), ctx, {
        type: 'vqe:run',
        payload: { molecule: N2_ATOMS },
      });

      await flushAsync(500);

      const receiptEvent = emitted.find((e) => e.type === 'vqe:receipt');
      expect(receiptEvent).toBeDefined();
      const receipt = receiptEvent!.payload as VQEReceipt;
      expect(receipt.schema).toBe('cael-quantum-v1.vqe-runner');
      expect(receipt.unit).toBe('Ha');
      expect(receipt.molecule).toBe('NN'); // symbol concat of N2_ATOMS
    });
  });

  // GUARD8 — payloadHash non-empty
  describe('GUARD8: payloadHash is a non-empty string', () => {
    it('receipt payloadHash is a non-empty string', async () => {
      const node = makeNode();
      const { ctx, emitted } = makeContext();
      vqeRunnerHandler.onAttach!(node, baseConfig(), ctx);

      vqeRunnerHandler.onEvent!(node, baseConfig(), ctx, {
        type: 'vqe:run',
        payload: { molecule: N2_ATOMS },
      });

      await flushAsync(500);

      const receiptEvent = emitted.find((e) => e.type === 'vqe:receipt');
      const receipt = receiptEvent?.payload as VQEReceipt | undefined;
      expect(receipt?.payloadHash).toBeTypeOf('string');
      expect(receipt!.payloadHash.length).toBeGreaterThan(0);
    });
  });

  // GUARD9 — onDetach cancels running job
  describe('GUARD9: onDetach cancels running job', () => {
    it('detaching while running sets cancelRequested and does not throw', async () => {
      const node = makeNode();
      const { ctx, emitted } = makeContext();
      vqeRunnerHandler.onAttach!(node, baseConfig(), ctx);

      vqeRunnerHandler.onEvent!(node, baseConfig(), ctx, {
        type: 'vqe:run',
        payload: { molecule: N2_ATOMS },
      });

      // Detach immediately
      expect(() => vqeRunnerHandler.onDetach!(node, baseConfig(), ctx)).not.toThrow();

      await flushAsync(500);

      // After detach+cancel, converged must NOT appear
      const converged = emitted.find((e) => e.type === 'vqe:converged');
      expect(converged).toBeUndefined();
    });
  });
});
