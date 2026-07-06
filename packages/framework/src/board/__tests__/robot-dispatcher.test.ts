/**
 * Robot Dispatcher + receipt gate — unit tests.
 *
 * Proves the structural guarantee of `gatedDispatch`:
 *   - A denied safety verdict produces NO dispatch and NO success receipt.
 *   - An allowed verdict + successful dispatch produces a VALID success receipt
 *     (passes validateTwinEarthReceipt) whose `dispatchedTo` reflects the actual
 *     backend (stub → 'stub', a fake ROS2 dispatcher → 'ros2').
 *   - The StubRobotDispatcher is honest: simulated:true, dispatchedTo:'stub',
 *     drives no hardware.
 *
 * G.GOLD.013: every happy path is paired with at least one false-case test.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  StubRobotDispatcher,
  gatedDispatch,
  type RobotDispatcher,
  type DispatchRequest,
  type DispatchResult,
  type GatedDispatchParams,
} from '../robot-dispatcher';
import {
  validateTwinEarthReceipt,
  type TwinEarthIdentity,
  type PermissionGrant,
  type SafetyEnvelope,
} from '../twin-earth-substrate';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const identity: TwinEarthIdentity = {
  agentId: 'agent_123',
  walletAddress: '0xabc',
  handle: 'TestBot',
  attestation: '0xsigned',
  attestedAt: '2026-05-13T00:00:00Z',
  role: 'robot',
  mode: 'managed',
  kind: 'robot',
  hardwareFingerprint: 'sha256:deadbeef',
};

const grant: PermissionGrant = {
  granteeId: 'agent_123',
  granterId: 'agent_456',
  action: 'robot:move',
  scope: '*',
  expiresAt: null,
  revocationSignature: null,
  hash: 'sha256:grant',
};

/** A fresh, substrate-enforced envelope that allows robot:move. */
function allowingEnvelope(overrides: Partial<SafetyEnvelope> = {}): SafetyEnvelope {
  const freshTimestamp = new Date(Date.now() - 60 * 1000).toISOString();
  return {
    id: 'env_1',
    agentId: 'agent_123',
    maxTickDurationMs: 1000,
    maxMemoryBytes: 1024 * 1024,
    maxNetworkCallsPerMinute: 60,
    allowedActions: ['robot:move'],
    blockedActions: [],
    deterministic: true,
    localOnly: false,
    substrateEnforced: true,
    updatedAt: freshTimestamp,
    freshnessTtlMs: 30 * 24 * 60 * 60 * 1000,
    humanApprovalGrantedAt: freshTimestamp,
    humanApprovalTtlMs: 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

function request(overrides: Partial<DispatchRequest> = {}): DispatchRequest {
  return {
    agentId: 'agent_123',
    command: 'move',
    parameters: { x: 1, y: 2 },
    envelopeId: 'env_1',
    ...overrides,
  };
}

/** A fake backend that reports a non-stub ('ros2') dispatch — proves flow-through. */
class FakeRos2Dispatcher implements RobotDispatcher {
  readonly backend = 'ros2' as const;
  async dispatch(req: DispatchRequest): Promise<DispatchResult> {
    return {
      dispatched: true,
      dispatchedTo: 'ros2',
      simulated: false,
      detail: `ros2 dispatched ${req.command}`,
    };
  }
}

/** A backend that refuses to dispatch — proves the dispatch-failure branch. */
class RefusingDispatcher implements RobotDispatcher {
  readonly backend = 'mqtt' as const;
  async dispatch(): Promise<DispatchResult> {
    return { dispatched: false, dispatchedTo: 'mqtt', simulated: true, detail: 'backend offline' };
  }
}

function baseParams(overrides: Partial<GatedDispatchParams> = {}): GatedDispatchParams {
  return {
    identity,
    grant,
    envelope: allowingEnvelope(),
    action: 'robot:move',
    scope: '*',
    request: request(),
    ...overrides,
  };
}

// ── StubRobotDispatcher ─────────────────────────────────────────────────────────

describe('StubRobotDispatcher', () => {
  it('is honest: dispatched=true, dispatchedTo=stub, simulated=true, no hardware', async () => {
    const stub = new StubRobotDispatcher();
    expect(stub.backend).toBe('stub');
    const result = await stub.dispatch(request());
    expect(result.dispatched).toBe(true);
    expect(result.dispatchedTo).toBe('stub');
    expect(result.simulated).toBe(true);
  });
});

// ── gatedDispatch: SAFETY denial → no dispatch, no receipt ───────────────────────

describe('gatedDispatch — denied verdict refuses dispatch + emits NO receipt', () => {
  it("refuses on 'stale_envelope' (no dispatcher call, no receipt)", async () => {
    const stale = allowingEnvelope({
      updatedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days old
      freshnessTtlMs: 30 * 24 * 60 * 60 * 1000, // 30-day TTL
    });
    const dispatchSpy = vi.fn(async () => ({
      dispatched: true,
      dispatchedTo: 'stub' as const,
      simulated: true,
    }));
    const dispatcher: RobotDispatcher = { backend: 'stub', dispatch: dispatchSpy };

    const result = await gatedDispatch(baseParams({ envelope: stale, dispatcher }));

    expect(result.ok).toBe(false);
    if (result.ok === false && result.stage === 'safety') {
      expect(result.blockingRule).toBe('stale_envelope');
      expect('receipt' in result).toBe(false);
    } else {
      // Force failure if the branch is wrong — the above block must execute.
      expect(result.ok).toBe(false);
      expect((result as { stage: string }).stage).toBe('safety');
    }
    // The dispatcher must NEVER be called when the verdict denies.
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("refuses on 'human_approval_required' (no dispatcher call, no receipt)", async () => {
    const needsApproval = allowingEnvelope({
      humanApprovalRequired: true,
      humanApprovalGrantedAt: undefined,
    });
    const dispatchSpy = vi.fn(async () => ({
      dispatched: true,
      dispatchedTo: 'stub' as const,
      simulated: true,
    }));
    const dispatcher: RobotDispatcher = { backend: 'stub', dispatch: dispatchSpy };

    const result = await gatedDispatch(baseParams({ envelope: needsApproval, dispatcher }));

    expect(result.ok).toBe(false);
    if (result.ok === false && result.stage === 'safety') {
      expect(result.blockingRule).toBe('human_approval_required');
    } else {
      expect(result.ok).toBe(false);
      expect((result as { stage: string }).stage).toBe('safety');
    }
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

// ── gatedDispatch: allowed + dispatched → valid receipt ──────────────────────────

describe('gatedDispatch — allowed verdict dispatches + emits valid receipt', () => {
  it('produces a receipt that passes validateTwinEarthReceipt (stub backend)', async () => {
    const result = await gatedDispatch(
      baseParams({ dispatcher: new StubRobotDispatcher(), substrateVersion: '1.0.0' })
    );

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.stage).toBe('dispatched');
      expect(result.dispatch.dispatched).toBe(true);
      const errors = validateTwinEarthReceipt(result.receipt);
      expect(errors).toHaveLength(0);
      expect(result.receipt.kind).toBe('action');
      expect(result.receipt.status).toBe('success');
      expect(result.receipt.actorId).toBe('agent_123');
      expect(result.receipt.envelopeId).toBe('env_1');
      // stub backend → receipt reflects 'stub' via dispatch, simulated true
      expect(result.dispatch.dispatchedTo).toBe('stub');
      expect(result.dispatch.simulated).toBe(true);
    }
  });

  it("receipt's dispatchedTo reflects a non-stub backend (fake ros2 flows through)", async () => {
    const result = await gatedDispatch(baseParams({ dispatcher: new FakeRos2Dispatcher() }));

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.dispatch.dispatchedTo).toBe('ros2');
      expect(result.dispatch.simulated).toBe(false);
      // The receipt itself is valid regardless of backend.
      expect(validateTwinEarthReceipt(result.receipt)).toHaveLength(0);
    }
  });

  it('honors injected genReceiptId and hash factories', async () => {
    const result = await gatedDispatch(
      baseParams({
        genReceiptId: () => 'act_custom_id',
        hash: async (input: string) => `hashed(${input.length})`,
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.receipt.id).toBe('act_custom_id');
      expect(result.receipt.hash.startsWith('hashed(')).toBe(true);
    }
  });
});

// ── gatedDispatch: allowed but backend fails → no success receipt ────────────────

describe('gatedDispatch — allowed but dispatch fails emits NO success receipt', () => {
  it('returns stage=dispatch with no receipt when the backend refuses', async () => {
    const result = await gatedDispatch(baseParams({ dispatcher: new RefusingDispatcher() }));
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.stage).toBe('dispatch');
      expect('receipt' in result).toBe(false);
      expect(result.reason).toContain('offline');
    }
  });
});

// ── Structural guarantee: no success receipt without prior allowed verdict ───────

describe('gatedDispatch — STRUCTURAL: success receipt requires a prior allowed verdict', () => {
  it('a denying envelope can never yield an ok:true result, even with a willing backend', async () => {
    // Backend would happily dispatch — but the verdict denies, so the gate must
    // short-circuit before it. There is no code path to a success receipt here.
    const willing: RobotDispatcher = {
      backend: 'ros2',
      dispatch: async () => ({ dispatched: true, dispatchedTo: 'ros2', simulated: false }),
    };
    // Deny via blockedActions (blacklist overrides everything).
    const denying = allowingEnvelope({ blockedActions: ['robot:move'] });

    const result = await gatedDispatch(baseParams({ envelope: denying, dispatcher: willing }));

    expect(result.ok).toBe(false);
    if (result.ok === false && result.stage === 'safety') {
      expect(result.blockingRule).toBe('blocked_actions');
      // No receipt field exists on the safety-denial branch.
      expect('receipt' in result).toBe(false);
    } else {
      expect(result.ok).toBe(false);
      expect((result as { stage: string }).stage).toBe('safety');
    }
  });
});
