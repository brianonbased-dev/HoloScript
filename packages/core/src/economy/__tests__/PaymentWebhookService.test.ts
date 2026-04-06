/**
 * PaymentWebhookService tests — v5.8 "Live Economy"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaymentWebhookService } from '@holoscript/framework/economy';
import type { WebhookPayload } from '@holoscript/framework/economy';

function makePayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    eventId: `evt-${Date.now()}`,
    type: 'payment.confirmed',
    provider: 'x402',
    timestamp: new Date().toISOString(),
    data: {},
    ...overrides,
  };
}

describe('PaymentWebhookService', () => {
  let service: PaymentWebhookService;

  beforeEach(() => {
    service = new PaymentWebhookService({
      secrets: { x402: 'test-secret-x402', stripe: 'test-secret-stripe' },
    });
  });

  // ===========================================================================
  // SIGNATURE VERIFICATION
  // ===========================================================================

  describe('verifySignature', () => {
    it('verifies valid HMAC-SHA256 signature', () => {
      const payload = makePayload();
      const rawBody = JSON.stringify(payload);
      const signature = service.createSignature(rawBody, 'x402');

      const result = service.verifySignature(rawBody, signature, 'x402');
      expect(result.verified).toBe(true);
      expect(result.provider).toBe('x402');
      expect(result.payload).toBeDefined();
      expect(result.payload!.eventId).toBe(payload.eventId);
    });

    it('rejects invalid signature', () => {
      const rawBody = JSON.stringify(makePayload());
      const result = service.verifySignature(rawBody, 'invalid-sig', 'x402');
      expect(result.verified).toBe(false);
      expect(result.error).toContain('Invalid HMAC');
    });

    it('rejects unknown provider', () => {
      const rawBody = JSON.stringify(makePayload({ provider: 'custom' }));
      const result = service.verifySignature(rawBody, 'any', 'custom');
      expect(result.verified).toBe(false);
      expect(result.error).toContain('No secret configured');
    });

    it('rejects expired webhooks', () => {
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
      const payload = makePayload({ timestamp: oldTimestamp });
      const rawBody = JSON.stringify(payload);
      const signature = service.createSignature(rawBody, 'x402');

      const result = service.verifySignature(rawBody, signature, 'x402');
      expect(result.verified).toBe(false);
      expect(result.error).toContain('too old');
    });

    it('rejects invalid JSON', () => {
      const rawBody = 'not json {{{';
      const signature = service.createSignature(rawBody, 'x402');
      const result = service.verifySignature(rawBody, signature, 'x402');
      expect(result.verified).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });
  });

  // ===========================================================================
  // PROCESSING
  // ===========================================================================

  describe('processWebhook', () => {
    it('processes a webhook and marks it as processed', async () => {
      const payload = makePayload({ eventId: 'evt-unique-1' });
      const result = await service.processWebhook(payload);
      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt-unique-1');
      expect(service.isProcessed('evt-unique-1')).toBe(true);
    });

    it('deduplicates by eventId', async () => {
      const payload = makePayload({ eventId: 'evt-dup-1' });
      await service.processWebhook(payload);
      const result = await service.processWebhook(payload);
      expect(result.success).toBe(true);
      expect(service.getStats().duplicates).toBe(1);
    });

    it('invokes registered handlers', async () => {
      const calls: string[] = [];
      service.on('payment.confirmed', (p) => {
        calls.push(p.eventId);
        return { success: true, eventId: p.eventId, type: p.type };
      });

      const payload = makePayload({ eventId: 'evt-handler-1' });
      await service.processWebhook(payload);
      expect(calls).toContain('evt-handler-1');
    });

    it('handles handler errors and adds to retry queue', async () => {
      service.on('payment.confirmed', () => {
        throw new Error('handler crashed');
      });

      const payload = makePayload({ eventId: 'evt-error-1' });
      const result = await service.processWebhook(payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('handler crashed');
      expect(service.getRetryQueueLength()).toBe(1);
    });
  });

  // ===========================================================================
  // LEDGER UPDATE CALLBACK
  // ===========================================================================

  describe('ledger update', () => {
    it('calls ledger update callback on payment.confirmed', async () => {
      const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
      service.onLedgerUpdate((entryId, data) => {
        updates.push({ id: entryId, data });
      });

      const payload = makePayload({
        eventId: 'evt-ledger-1',
        type: 'payment.confirmed',
        ledgerEntryId: 'ledger-123',
        transactionHash: '0xabc',
      });
      await service.processWebhook(payload);

      expect(updates).toHaveLength(1);
      expect(updates[0].id).toBe('ledger-123');
      expect(updates[0].data).toEqual({ settled: true, settlementTx: '0xabc' });
    });
  });

  // ===========================================================================
  // RETRY QUEUE
  // ===========================================================================

  describe('retry queue', () => {
    it('processes retry queue entries', async () => {
      // Use zero backoff so retry entries are immediately ready
      const retryService = new PaymentWebhookService({
        secrets: { x402: 'test-secret-x402' },
        retryBackoffMs: 0,
      });

      let shouldFail = true;
      retryService.on('payment.confirmed', () => {
        if (shouldFail) throw new Error('fail');
        return { success: true, eventId: '', type: 'payment.confirmed' as const };
      });

      const payload = makePayload({ eventId: 'evt-retry-1' });
      await retryService.processWebhook(payload);
      expect(retryService.getRetryQueueLength()).toBe(1);

      // Fix the handler
      shouldFail = false;
      const processed = await retryService.processRetryQueue();
      expect(processed).toBe(1);
      expect(retryService.getRetryQueueLength()).toBe(0);
    });
  });

  // ===========================================================================
  // STATS
  // ===========================================================================

  describe('stats', () => {
    it('tracks comprehensive stats', async () => {
      const payload1 = makePayload({ eventId: 'evt-s1' });
      const rawBody = JSON.stringify(payload1);
      const sig = service.createSignature(rawBody, 'x402');

      service.verifySignature(rawBody, sig, 'x402');
      await service.processWebhook(payload1);

      const stats = service.getStats();
      expect(stats.received).toBe(1);
      expect(stats.verified).toBe(1);
      expect(stats.processed).toBe(1);
      expect(stats.failed).toBe(0);
    });
  });

  // ===========================================================================
  // HANDLER REMOVAL
  // ===========================================================================

  describe('handler management', () => {
    it('removes handlers with off()', async () => {
      const calls: string[] = [];
      const handler = () => {
        calls.push('called');
        return { success: true, eventId: '', type: 'payment.confirmed' as const };
      };

      service.on('payment.confirmed', handler);
      service.off('payment.confirmed', handler);

      await service.processWebhook(makePayload({ eventId: 'evt-off-1' }));
      expect(calls).toHaveLength(0);
    });
  });
});
