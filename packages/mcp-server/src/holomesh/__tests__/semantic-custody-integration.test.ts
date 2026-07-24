import { describe, expect, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  InMemorySemanticReplayStore,
  SEMANTIC_CUSTODY_SCHEMA,
  buildSemanticCustodyBinding,
  createSemanticMessage,
  prepareSemanticMessageV2,
  recursiveLinkHandler,
  semanticCollabHandler,
  type RecursiveLinkConfig,
  type RecursiveLinkMessage,
  type SemanticCollabConfig,
  type SemanticCollaborationMessage,
  type SemanticCustodyMessageLike,
} from '@holoscript/core/traits';
import type { HSPlusNode, TraitContext } from '../../../../core/src/traits/TraitTypes';
import { admitHoloMeshSemanticMessage, buildSigningPayload } from '../request-signing';

const account = privateKeyToAccount(generatePrivateKey());
const nowMs = Date.parse('2026-07-24T02:40:00.000Z');

function context() {
  return {
    emit: vi.fn(),
  } as unknown as TraitContext;
}

async function signedMessage(
  nonce = 'semantic-nonce-001'
): Promise<SemanticCollaborationMessage & SemanticCustodyMessageLike> {
  const legacy = createSemanticMessage(
    'codex-hardware',
    'holomesh-room',
    {
      axis_1_id: 'risk',
      axis_2_id: 'opportunity',
      pos_1: -0.25,
      pos_2: 0.75,
      pillar_id: 'production-uAAL',
      pillar_domain: 'coordination',
    },
    {
      mni_x: 12,
      mni_y: -24,
      mni_z: 36,
      cortical_depth: 4,
    },
    {
      attestation_hash: 'x402:test-attestation',
      surface_id: 'codex-hardware',
    }
  );
  legacy.message_id = 'semcol-production-001';
  legacy.created_at_ms = nowMs;
  legacy.payload = {
    action: 'recursive_link',
    loop: 'inner',
    command: 'inspect',
    link_receipt: 'simulation-contract:test',
  };

  const message = prepareSemanticMessageV2(legacy, 'recursive_link', nonce, {
    ...legacy.provenance,
    holokey: 'openai-codex-test-x402',
    signer_address: account.address,
  }) as SemanticCollaborationMessage & SemanticCustodyMessageLike;
  const body = await buildSemanticCustodyBinding(message);
  const timestamp = new Date(nowMs).toISOString();
  const signature = await account.signMessage({
    message: buildSigningPayload({ body, nonce, timestamp }),
  });
  message.custody = {
    schema: SEMANTIC_CUSTODY_SCHEMA,
    signed: {
      body,
      signature,
      signer_address: account.address,
      nonce,
      timestamp,
    },
  };
  return message;
}

const semanticConfig: SemanticCollabConfig = {
  enforce_receipt_gate: true,
  cosine_anomaly_threshold: 0.15,
  centroid_drift_threshold: 0.4,
  log_to_knowledge_store: false,
  custody_mode: 'strict',
};

const recursiveConfig: RecursiveLinkConfig = {
  require_receipt: true,
  default_loop: 'inner',
  custody_mode: 'strict',
};

describe('signed semantic custody production integration', () => {
  it('admits a real HoloMesh EIP-191 envelope and both handlers emit one receipt', async () => {
    const message = await signedMessage();
    const replayStore = new InMemorySemanticReplayStore();
    const admission = await admitHoloMeshSemanticMessage(message, {
      replayStore,
      nowMs,
    });
    expect(admission.ok).toBe(true);
    if (!admission.ok) throw new Error(admission.reason);
    expect(admission.receipt.receipt_digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const semanticNode = {} as HSPlusNode;
    const semanticContext = context();
    semanticCollabHandler.onAttach?.(semanticNode, semanticConfig, semanticContext);
    semanticCollabHandler.onEvent?.(semanticNode, semanticConfig, semanticContext, {
      type: 'semcol:receive',
      message,
    });
    expect(semanticContext.emit).toHaveBeenCalledWith('semcol:custody_receipt', {
      receipt: admission.receipt,
    });
    expect(semanticContext.emit).toHaveBeenCalledWith('semcol:received', { message });

    const link: RecursiveLinkMessage = {
      from: message.from,
      to: message.to,
      loop: 'inner',
      slice: message.pillar_slice,
      receipt: 'simulation-contract:test',
      timestamp_ms: nowMs,
      semantic_message: message,
    };
    const recursiveNode = {} as HSPlusNode;
    const recursiveContext = context();
    recursiveLinkHandler.onAttach?.(recursiveNode, recursiveConfig, recursiveContext);
    recursiveLinkHandler.onEvent?.(recursiveNode, recursiveConfig, recursiveContext, {
      type: 'recursive_link:receive',
      message: link,
    });
    expect(recursiveContext.emit).toHaveBeenCalledWith('recursive_link:custody_receipt', {
      receipt: admission.receipt,
    });
    expect(recursiveContext.emit).toHaveBeenCalledWith('recursive_link:received', {
      ...link,
      custody_receipt: admission.receipt,
    });
  });

  it('rejects payload tampering, signer mismatch, and nonce replay', async () => {
    const message = await signedMessage('semantic-nonce-002');
    const replayStore = new InMemorySemanticReplayStore();
    const first = await admitHoloMeshSemanticMessage(message, { replayStore, nowMs });
    expect(first.ok).toBe(true);

    const replay = await admitHoloMeshSemanticMessage(message, { replayStore, nowMs });
    expect(replay).toMatchObject({ ok: false, reason: 'replay' });

    const tampered = await signedMessage('semantic-nonce-003');
    tampered.payload = { ...tampered.payload, command: 'advance' };
    const tamperAdmission = await admitHoloMeshSemanticMessage(tampered, {
      replayStore,
      nowMs,
    });
    expect(tamperAdmission).toMatchObject({ ok: false, reason: 'binding-mismatch' });

    const wrongSigner = await signedMessage('semantic-nonce-004');
    wrongSigner.provenance.signer_address = '0x0000000000000000000000000000000000000001';
    const signerAdmission = await admitHoloMeshSemanticMessage(wrongSigner, {
      replayStore,
      nowMs,
    });
    expect(signerAdmission).toMatchObject({ ok: false, reason: 'binding-mismatch' });
  });

  it('invalidates handler admission if an admitted object is mutated', async () => {
    const message = await signedMessage('semantic-nonce-005');
    const admission = await admitHoloMeshSemanticMessage(message, {
      replayStore: new InMemorySemanticReplayStore(),
      nowMs,
    });
    expect(admission.ok).toBe(true);

    message.payload = { ...message.payload, action: 'different_action' };
    const node = {} as HSPlusNode;
    const ctx = context();
    semanticCollabHandler.onAttach?.(node, semanticConfig, ctx);
    semanticCollabHandler.onEvent?.(node, semanticConfig, ctx, {
      type: 'semcol:receive',
      message,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'semcol:integrity_fail',
      expect.objectContaining({ reason: 'action_payload_mismatch' })
    );
    expect(ctx.emit).not.toHaveBeenCalledWith('semcol:received', expect.anything());
  });

  it('rejects a strict recursive link without a real SimulationContract receipt', async () => {
    const message = await signedMessage('semantic-nonce-006');
    const admission = await admitHoloMeshSemanticMessage(message, {
      replayStore: new InMemorySemanticReplayStore(),
      nowMs,
    });
    expect(admission.ok).toBe(true);

    const node = {} as HSPlusNode;
    const ctx = context();
    recursiveLinkHandler.onAttach?.(node, recursiveConfig, ctx);
    recursiveLinkHandler.onEvent?.(node, recursiveConfig, ctx, {
      type: 'recursive_link:receive',
      message: {
        from: message.from,
        to: message.to,
        loop: 'inner',
        slice: message.pillar_slice,
        timestamp_ms: nowMs,
        semantic_message: message,
      } satisfies RecursiveLinkMessage,
    });
    expect(ctx.emit).toHaveBeenCalledWith('recursive_link:error', {
      code: 'RECEIPT_REQUIRED',
      message: 'strict recursive links require a SimulationContract receipt',
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('recursive_link:received', expect.anything());
  });

  it('keeps legacy decoding explicit and fail-closed in strict mode', () => {
    const legacy = createSemanticMessage(
      'legacy-a',
      'legacy-b',
      {
        axis_1_id: 'risk',
        axis_2_id: 'opportunity',
        pos_1: 0,
        pos_2: 0,
        pillar_id: 'legacy',
        pillar_domain: 'coordination',
      },
      { mni_x: 0, mni_y: 0, mni_z: 0, cortical_depth: 1 },
      { attestation_hash: 'legacy', surface_id: 'legacy-a' }
    );
    const node = {} as HSPlusNode;
    const ctx = context();
    semanticCollabHandler.onAttach?.(node, semanticConfig, ctx);
    semanticCollabHandler.onEvent?.(node, semanticConfig, ctx, {
      type: 'semcol:receive',
      message: legacy,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'semcol:integrity_fail',
      expect.objectContaining({ reason: 'unverified_custody' })
    );
  });
});
