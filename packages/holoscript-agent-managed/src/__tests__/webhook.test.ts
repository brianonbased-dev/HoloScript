import { readFileSync } from 'node:fs';

import { Webhook } from 'standardwebhooks';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  replayManagedAgentLifecycleReceipt,
  verifyManagedAgentLifecycleReceipt,
  type ManagedAgentLifecycleReceipt,
} from '../receipt';
import {
  verifyAnthropicLifecycleWebhook,
  type AnthropicLifecycleWebhookEvent,
  type ManagedAgentWebhookReplayGuard,
} from '../webhook';

const NOW = new Date('2026-07-24T06:00:00.000Z');
const SECRET = `whsec_${Buffer.from('holoscript-managed-agent-test-key').toString('base64')}`;

afterEach(() => {
  vi.useRealTimers();
});

describe('Anthropic Managed Agents lifecycle webhooks', () => {
  it('verifies a HoloKey-resolved signature and emits replayable CAEL/uAAL evidence', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const fixture = signedFixture('environment.created');
    const receipt = await verifyAnthropicLifecycleWebhook({
      ...fixture,
      secretRef: {
        provider: 'holokey',
        keyId: 'anthropic-managed-agent-webhook',
        version: '7',
      },
      resolveSecret: vi.fn(async () => ({
        value: SECRET,
        expiresAt: '2026-07-25T00:00:00.000Z',
      })),
    });

    expect(receipt.delivery.verified).toBe(true);
    expect(receipt.event.resource).toEqual({
      kind: 'environment',
      id: 'env_fixture',
      action: 'created',
    });
    expect(receipt.cael).toMatchObject({
      schema: 'cael.external-agent-lifecycle.v1',
      signatureVerified: true,
    });
    expect(receipt.uaal).toMatchObject({
      schema: 'uaal.external-lifecycle-receipt.v1',
      operation: 'created',
      replay: {
        mode: 'idempotent-event',
        orderingGuaranteed: false,
      },
    });
    expect(receipt.custody.secretValueIncluded).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain(SECRET);
    expect(receipt.integrity.eventHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(verifyManagedAgentLifecycleReceipt(receipt)).toMatchObject({
      ok: true,
      blockers: [],
    });
    expect(replayManagedAgentLifecycleReceipt(receipt)).toEqual(receipt);
  });

  it('keeps Anthropic memory stores optional and non-authoritative', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const receipt = await verifyAnthropicLifecycleWebhook({
      ...signedFixture('memory_store.archived'),
      secretRef: { provider: 'holokey', keyId: 'memory-webhook' },
      resolveSecret: async () => ({ value: SECRET }),
    });

    expect(receipt.event.resource.kind).toBe('memory_store');
    expect(receipt.authority).toEqual({
      memoryBackend: 'optional-external-backend',
      sourceOfTruth: false,
      goldAuthority: false,
      directMemoryPromotionAllowed: false,
    });
  });

  it('rejects invalid signatures and deliveries outside the five-minute window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const valid = signedFixture('environment.updated');
    await expect(
      verifyAnthropicLifecycleWebhook({
        ...valid,
        headers: {
          ...valid.headers,
          'webhook-signature': 'v1,invalid',
        },
        secretRef: { provider: 'holokey', keyId: 'environment-webhook' },
        resolveSecret: async () => ({ value: SECRET }),
      })
    ).rejects.toThrow(/verification failed/i);

    const stale = signedFixture('environment.updated', new Date(NOW.getTime() - 301_000));
    await expect(
      verifyAnthropicLifecycleWebhook({
        ...stale,
        secretRef: { provider: 'holokey', keyId: 'environment-webhook' },
        resolveSecret: async () => ({ value: SECRET }),
      })
    ).rejects.toThrow(/timestamp too old/i);
  });

  it('rejects expired HoloKey resolutions and duplicate replay claims', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const fixture = signedFixture('memory_store.created');
    await expect(
      verifyAnthropicLifecycleWebhook({
        ...fixture,
        secretRef: { provider: 'holokey', keyId: 'memory-webhook' },
        resolveSecret: async () => ({
          value: SECRET,
          expiresAt: '2026-07-24T05:59:59.000Z',
        }),
      })
    ).rejects.toThrow(/secret is expired/i);

    const replayGuard: ManagedAgentWebhookReplayGuard = {
      claim: vi.fn(async () => 'duplicate'),
    };
    await expect(
      verifyAnthropicLifecycleWebhook({
        ...fixture,
        secretRef: { provider: 'holokey', keyId: 'memory-webhook' },
        resolveSecret: async () => ({ value: SECRET }),
        replayGuard,
      })
    ).rejects.toThrow(/replay rejected: duplicate/i);
  });

  it('detects receipt tampering during offline replay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const receipt = await verifyAnthropicLifecycleWebhook({
      ...signedFixture('environment.deleted'),
      secretRef: { provider: 'holokey', keyId: 'environment-webhook' },
      resolveSecret: async () => ({ value: SECRET }),
    });
    const tampered = structuredClone(receipt);
    tampered.cael.resourceId = 'env_substituted';

    const verification = verifyManagedAgentLifecycleReceipt(tampered);
    expect(verification.ok).toBe(false);
    expect(verification.blockers).toContain('receipt hash mismatch');
    expect(verification.blockers).toContain('CAEL projection mismatch');
    expect(() => replayManagedAgentLifecycleReceipt(tampered)).toThrow(/replay failed/);
  });

  it('replays the durable memory-store lifecycle receipt fixture without a secret', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL('../../test/fixtures/anthropic-memory-store-created.receipt.json', import.meta.url),
        'utf8'
      )
    ) as ManagedAgentLifecycleReceipt;

    expect(verifyManagedAgentLifecycleReceipt(fixture)).toEqual({
      ok: true,
      blockers: [],
      receiptHash: fixture.integrity.receiptHash,
    });
    expect(replayManagedAgentLifecycleReceipt(fixture)).toEqual(fixture);
    expect(JSON.stringify(fixture)).not.toContain('whsec_');
  });
});

function signedFixture(
  type: AnthropicLifecycleWebhookEvent['data']['type'],
  deliveryAt = NOW
): {
  body: string;
  headers: Record<string, string>;
} {
  const kind = type.startsWith('memory_store.') ? 'memstore_fixture' : 'env_fixture';
  const event: AnthropicLifecycleWebhookEvent = {
    type: 'event',
    id: `whe_${type.replaceAll('.', '_')}`,
    created_at: '2026-07-24T05:59:58.000Z',
    data: {
      type,
      id: kind,
      organization_id: 'org_fixture',
      workspace_id: 'workspace_fixture',
    },
  };
  const body = JSON.stringify(event);
  const webhook = new Webhook(SECRET);
  return {
    body,
    headers: {
      'webhook-id': event.id,
      'webhook-timestamp': String(Math.floor(deliveryAt.getTime() / 1000)),
      'webhook-signature': webhook.sign(event.id, deliveryAt, body),
    },
  };
}
