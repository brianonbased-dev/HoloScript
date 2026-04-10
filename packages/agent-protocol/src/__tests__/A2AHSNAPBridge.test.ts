import { describe, expect, it } from 'vitest';

import { A2AHSNAPBridge } from '../A2AHSNAPBridge';
import { CANONICAL_TASK_BRIDGE_SCHEMA } from '../task-bridge-schema';

describe('A2AHSNAPBridge', () => {
  it('translates canonical task metadata into an A2A sendMessage payload', () => {
    const bridge = new A2AHSNAPBridge();
    const envelope = bridge.toCanonicalTask({
      id: 'bridge-1',
      from: 'planner',
      to: 'builder',
      intent: 'compile_hs',
      skillId: 'compile_hs',
      input: { code: 'object Cube {}' },
      idempotency_key: 'idem-bridge',
    });

    const request = bridge.toA2AMessage(envelope, {
      requestId: 'rpc-bridge',
      timestamp: '2026-04-09T00:00:00.000Z',
    });

    expect(request.method).toBe('a2a.sendMessage');
    expect(request.params.message.parts[0].data.schema).toBe(CANONICAL_TASK_BRIDGE_SCHEMA);
    expect(request.params.message.parts[0].data.idempotencyKey).toBe('idem-bridge');
  });

  it('translates an A2A payload into HSNAP source', () => {
    const bridge = new A2AHSNAPBridge();

    const hsnap = bridge.translateA2AToHSNAP(
      {
        params: {
          message: {
            parts: [
              {
                data: {
                  taskId: 'legacy-bridge',
                  intent: 'compile_hs',
                  skillId: 'compile_hs',
                  arguments: { code: 'object Legacy {}' },
                  idempotencyKey: 'legacy-idem',
                },
              },
            ],
          },
        },
      },
      {
        compositionName: 'LegacyBridgeTask',
      }
    );

    expect(hsnap).toContain('@task');
    expect(hsnap).toContain('composition LegacyBridgeTask');
    expect(hsnap).toContain('legacy-idem');
  });

  it('translates HSNAP source back into A2A sendMessage', () => {
    const bridge = new A2AHSNAPBridge();
    const request = bridge.translateHSNAPToA2A(
      `@task {
      id: "bridge-hsnap-1"
      intent: "compile_hs"
      skillId: "compile_hs"
      input: { code: "object Sphere {}", target: "webgpu" }
      idempotency_key: "idem-hsnap"
    }

    composition BridgeTask {}`,
      {
        requestId: 'rpc-hsnap',
        timestamp: '2026-04-09T01:00:00.000Z',
      }
    );

    expect(request.id).toBe('rpc-hsnap');
    expect(request.params.message.parts[0].data.skillId).toBe('compile_hs');
    expect(request.params.message.parts[0].data.idempotencyKey).toBe('idem-hsnap');
  });

  it('returns null for invalid A2A payloads when translating to HSNAP', () => {
    const bridge = new A2AHSNAPBridge();
    expect(bridge.translateA2AToHSNAP(null)).toBeNull();
  });
});
