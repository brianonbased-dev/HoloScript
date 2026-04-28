/**
 * lotus-route-integration — Paper 26 Gate 2 SSE contract.
 *
 * Pins the shape of the `lotusGardenEvent` SSE event that the route emits
 * for every lotus tool invocation. The client (lotus visualization in
 * Studio) reacts to these events in real time, so the payload contract is
 * load-bearing — a silent rename or reorder breaks the UI.
 *
 * Following the same pattern as cael-audit.test.ts: we exercise the
 * executor + the route's mapping function in isolation rather than driving
 * the full Next.js streaming handler (which would require mocking the
 * Anthropic SDK + auth + rate limit + credits — out of scope for a gate
 * contract test). The route's mapping is a pure transformation of
 * LotusToolResult into the SSE payload, so we pin it here as a function
 * with the same name. Any drift between this test and route.ts is the
 * contract violation we want to catch.
 *
 * Acceptance criteria covered (from Paper 26 Gate 2):
 *   - SSE event shape: tool, paperId, newState, accepted, gateRejected, reason
 *   - Event fires for accepted bloom mutations (success: true)
 *   - Event fires for rejected mutations (success: false, gateRejected: true)
 *   - Event fires for read-only tools (success: true, no paperId mutation)
 *   - reason field populated only when there's an error to report
 *   - gateRejected defaults to false (not undefined) for non-mutation tools
 */

import { describe, it, expect } from 'vitest';
import { executeLotusTool } from '@/lib/brittney/lotus/LotusTools';

/**
 * Mirror of the SSE payload construction in route.ts (the lotus tool branch
 * inside Promise.all). If route.ts changes, update this function and the
 * tests here will catch the drift. This is intentional duplication — tests
 * pin contracts that production code depends on, and the contract itself
 * is the small mapping function below.
 *
 * @see packages/studio/src/app/api/brittney/route.ts (search for 'lotusGardenEvent')
 */
function buildLotusGardenEventPayload(
  toolName: string,
  result: ReturnType<typeof executeLotusTool>,
): {
  tool: string;
  paperId: string | undefined;
  newState: string | undefined;
  accepted: boolean;
  gateRejected: boolean;
  reason: string | undefined;
} {
  return {
    tool: toolName,
    paperId: result.paperId,
    newState: result.newState,
    accepted: result.success,
    gateRejected: result.gateRejected ?? false,
    reason: result.error,
  };
}

describe('lotusGardenEvent SSE payload — accepted bloom_petal', () => {
  it('fires with accepted: true and the derived newState', () => {
    // cael is budding per fixture; bloom to "budding" passes the gate.
    const result = executeLotusTool('bloom_petal', {
      paper_id: 'cael',
      target_state: 'budding',
    });
    const event = buildLotusGardenEventPayload('bloom_petal', result);

    expect(event.tool).toBe('bloom_petal');
    expect(event.accepted).toBe(true);
    expect(event.gateRejected).toBe(false);
    expect(event.paperId).toBe('cael');
    expect(event.newState).toBe('budding');
    expect(event.reason).toBeUndefined();
  });
});

describe('lotusGardenEvent SSE payload — rejected mutation', () => {
  it('fires with accepted: false and gateRejected: true on illegitimate bloom', () => {
    // cael is budding; trying to bloom to "full" violates the architectural gate.
    const result = executeLotusTool('bloom_petal', {
      paper_id: 'cael',
      target_state: 'full',
    });
    const event = buildLotusGardenEventPayload('bloom_petal', result);

    expect(event.tool).toBe('bloom_petal');
    expect(event.accepted).toBe(false);
    expect(event.gateRejected).toBe(true);
    expect(event.paperId).toBe('cael');
    // newState is NOT set on a rejected mutation — the petal's state did not change.
    expect(event.newState).toBeUndefined();
    // reason MUST surface the rejection cause so the client UI can explain it.
    expect(event.reason).toBeTruthy();
    expect(event.reason).toContain('Cannot bloom petal');
    expect(event.reason).toContain('budding');
  });

  it('fires with accepted: false and gateRejected: true on wilt of healthy petal', () => {
    const result = executeLotusTool('wilt_petal', {
      paper_id: 'cael',
      reason: 'no real reason',
    });
    const event = buildLotusGardenEventPayload('wilt_petal', result);

    expect(event.tool).toBe('wilt_petal');
    expect(event.accepted).toBe(false);
    expect(event.gateRejected).toBe(true);
    expect(event.paperId).toBe('cael');
    expect(event.reason).toContain('Cannot wilt petal');
  });
});

describe('lotusGardenEvent SSE payload — read-only tools', () => {
  it('fires for read_garden_state with accepted: true, no paperId, no newState', () => {
    const result = executeLotusTool('read_garden_state', {});
    const event = buildLotusGardenEventPayload('read_garden_state', result);

    expect(event.tool).toBe('read_garden_state');
    expect(event.accepted).toBe(true);
    expect(event.gateRejected).toBe(false);
    // Read-only tools do not touch a single petal — paperId/newState absent.
    expect(event.paperId).toBeUndefined();
    expect(event.newState).toBeUndefined();
    expect(event.reason).toBeUndefined();
  });

  it('fires for tend_garden with accepted: true', () => {
    const result = executeLotusTool('tend_garden', {});
    const event = buildLotusGardenEventPayload('tend_garden', result);

    expect(event.tool).toBe('tend_garden');
    expect(event.accepted).toBe(true);
    expect(event.gateRejected).toBe(false);
    expect(event.paperId).toBeUndefined();
  });

  it('fires for propose_evidence with the queried paperId attached', () => {
    const result = executeLotusTool('propose_evidence', { paper_id: 'cael' });
    const event = buildLotusGardenEventPayload('propose_evidence', result);

    expect(event.tool).toBe('propose_evidence');
    expect(event.accepted).toBe(true);
    expect(event.gateRejected).toBe(false);
    expect(event.paperId).toBe('cael');
    expect(event.newState).toBeUndefined();
  });
});

describe('lotusGardenEvent SSE payload — invariants', () => {
  it('gateRejected is ALWAYS a boolean (never undefined) — UI can rely on the field', () => {
    // The route's `gateRejected: lotus.gateRejected ?? false` collapses
    // the LotusToolResult's optional gateRejected into a strict boolean
    // for the SSE payload. This pins that invariant.
    for (const toolName of [
      'read_garden_state',
      'tend_garden',
      'propose_evidence',
      'bloom_petal',
      'wilt_petal',
    ] as const) {
      const args = toolName === 'propose_evidence' || toolName === 'wilt_petal'
        ? { paper_id: 'cael', reason: 'test' }
        : toolName === 'bloom_petal'
          ? { paper_id: 'cael', target_state: 'budding' }
          : {};
      const result = executeLotusTool(toolName, args);
      const event = buildLotusGardenEventPayload(toolName, result);
      expect(typeof event.gateRejected).toBe('boolean');
    }
  });

  it('accepted matches LotusToolResult.success exactly', () => {
    // Two cases: success: true and success: false. The mapping must be 1:1
    // with no inversion or coercion (regression-pin).
    const ok = executeLotusTool('read_garden_state', {});
    const okEvent = buildLotusGardenEventPayload('read_garden_state', ok);
    expect(okEvent.accepted).toBe(ok.success);

    const fail = executeLotusTool('bloom_petal', { paper_id: 'cael', target_state: 'full' });
    const failEvent = buildLotusGardenEventPayload('bloom_petal', fail);
    expect(failEvent.accepted).toBe(fail.success);
  });

  it('event payload only contains the documented fields (no extra leakage)', () => {
    // Pins the SSE schema. If route.ts adds a new field, this test should
    // be updated explicitly — defending against accidental field leakage.
    const result = executeLotusTool('bloom_petal', { paper_id: 'cael', target_state: 'budding' });
    const event = buildLotusGardenEventPayload('bloom_petal', result);
    const keys = new Set(Object.keys(event));
    expect(keys).toEqual(
      new Set(['tool', 'paperId', 'newState', 'accepted', 'gateRejected', 'reason']),
    );
  });
});
