import { describe, expect, it } from 'vitest';

import {
  CANONICAL_TASK_BRIDGE_SCHEMA,
  a2aSendMessageToCanonicalTaskEnvelope,
  canonicalTaskToA2ASendMessage,
  canonicalTaskToHSNAPSource,
  createCanonicalTaskEnvelope,
  hsnapSourceToCanonicalTaskEnvelope,
} from '../task-bridge-schema';
import { parseHSNAPPayload } from '../hsnap-router';

describe('task bridge schema', () => {
  it('parses extended @task metadata fields from HSNAP source', () => {
    const parsed = parseHSNAPPayload(`@task {
      id: "t-bridge-1"
      from: "planner"
      to: "builder"
      intent: "compile_hs"
      skillId: "compile_hs"
      input: { code: "object Cube {}", target: "threejs" }
      idempotency_key: "idem-123"
      timeout: 15000
    }

    composition Task {}`);

    expect(parsed.task).toEqual({
      id: 't-bridge-1',
      from: 'planner',
      to: 'builder',
      intent: 'compile_hs',
      skillId: 'compile_hs',
      input: { code: 'object Cube {}', target: 'threejs' },
      idempotency_key: 'idem-123',
      timeout: 15000,
    });
  });

  it('round-trips canonical envelope through HSNAP source', () => {
    const envelope = createCanonicalTaskEnvelope({
      id: 't-roundtrip',
      from: 'planner',
      to: 'builder',
      intent: 'compile_hs',
      skillId: 'compile_hs',
      input: { code: 'object Cube {}' },
      idempotency_key: 'idem-rt',
    });

    const source = canonicalTaskToHSNAPSource(envelope, 'RoundTrip');
    const reparsed = hsnapSourceToCanonicalTaskEnvelope(source);

    expect(reparsed.schema).toBe(CANONICAL_TASK_BRIDGE_SCHEMA);
    expect(reparsed.task).toEqual(envelope.task);
  });

  it('round-trips canonical envelope through A2A sendMessage payload', () => {
    const envelope = createCanonicalTaskEnvelope({
      id: 't-a2a',
      intent: 'compile_hs',
      skillId: 'compile_hs',
      input: { code: 'object Sphere {}', target: 'webgpu' },
      idempotency_key: 'idem-a2a',
    });

    const request = canonicalTaskToA2ASendMessage(envelope, 'rpc-1', '2026-04-08T00:00:00.000Z');
    const decoded = a2aSendMessageToCanonicalTaskEnvelope(request);

    expect(request.params.message.parts[0].data.schema).toBe(CANONICAL_TASK_BRIDGE_SCHEMA);
    expect(decoded).toEqual(envelope);
  });

  it('upgrades legacy A2A payloads into canonical envelope', () => {
    const decoded = a2aSendMessageToCanonicalTaskEnvelope({
      params: {
        message: {
          parts: [
            {
              data: {
                taskId: 'legacy-1',
                intent: 'compile_hs',
                skillId: 'compile_hs',
                arguments: { code: 'object Legacy {}' },
                idempotencyKey: 'legacy-idem',
              },
            },
          ],
        },
      },
    });

    expect(decoded).toEqual({
      schema: CANONICAL_TASK_BRIDGE_SCHEMA,
      task: {
        id: 'legacy-1',
        intent: 'compile_hs',
        skillId: 'compile_hs',
        input: { code: 'object Legacy {}' },
        idempotency_key: 'legacy-idem',
      },
    });
  });
});
