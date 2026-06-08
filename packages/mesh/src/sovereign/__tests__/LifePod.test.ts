import { describe, expect, it } from 'vitest';
import {
  LifePodSignatureVerificationError,
  createLifePodSnapshot,
  generateLifePodSigningKeyPair,
  lifePodStateBytes,
  restoreLifePodSnapshot,
} from '../LifePod';

const agentState = {
  agentId: 'agent_durable_001',
  identity: {
    handle: 'lifepod-test-agent',
    family: 'openai',
  },
  memory: {
    activeGoal: 'restore without silent corruption',
    receipts: ['rcpt_001', 'rcpt_002'],
  },
  world: {
    worldId: 'world_lifepod_lab',
    cluster: 'cluster_a',
    tick: 42,
  },
};

function flipFirstStateByte(snapshot: ReturnType<typeof createLifePodSnapshot<typeof agentState>>) {
  const bytes = Buffer.from(snapshot.stateBytesBase64, 'base64');
  bytes[0] ^= 0xff;
  return {
    ...snapshot,
    stateBytesBase64: bytes.toString('base64'),
  };
}

describe('LifePod signed snapshots', () => {
  it('restores snapshot state byte-equal to the signed agent state', () => {
    const keyPair = generateLifePodSigningKeyPair();
    const snapshot = createLifePodSnapshot(agentState, {
      keyPair,
      lifePodId: 'lifepod_roundtrip_001',
      createdAt: '2026-05-26T04:40:00.000Z',
      createdBy: 'codex-hardware',
      metadata: {
        worldId: agentState.world.worldId,
        sourceCluster: agentState.world.cluster,
      },
    });

    const mutatedState = {
      ...agentState,
      world: {
        ...agentState.world,
        tick: 99,
      },
    };
    expect(mutatedState).not.toEqual(agentState);

    const restored = restoreLifePodSnapshot(snapshot, { publicKeyPem: keyPair.publicKeyPem });

    expect(restored.signatureVerified).toBe(true);
    expect(restored.state).toEqual(agentState);
    expect(
      Buffer.from(restored.stateBytes).equals(Buffer.from(lifePodStateBytes(agentState)))
    ).toBe(true);
  });

  it('rejects a snapshot whose signed state bytes were tampered', () => {
    const keyPair = generateLifePodSigningKeyPair();
    const snapshot = createLifePodSnapshot(agentState, {
      keyPair,
      lifePodId: 'lifepod_tamper_001',
      createdAt: '2026-05-26T04:41:00.000Z',
      createdBy: 'codex-hardware',
    });

    expect(() =>
      restoreLifePodSnapshot(flipFirstStateByte(snapshot), { publicKeyPem: keyPair.publicKeyPem })
    ).toThrow(LifePodSignatureVerificationError);
  });
});
