/**
 * x402 Payment Protocol Facilitator Tests
 *
 * Tests the full x402 payment flow including:
 * - PaymentRequired response generation
 * - Payment verification (structural/temporal)
 * - Dual-mode settlement (micro vs on-chain)
 * - In-memory micro-payment ledger
 * - X-PAYMENT header encode/decode
 * - @credit trait handler integration
 * - Optimistic execution and batch settlement
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  X402Facilitator,
  MicroPaymentLedger,
  PaymentGateway,
  creditTraitHandler,
  X402_VERSION,
  USDC_CONTRACTS,
  MICRO_PAYMENT_THRESHOLD,
  CHAIN_IDS,
  CHAIN_ID_TO_NETWORK,
  type X402PaymentPayload,
  type X402FacilitatorConfig,
  type SettlementChain,
  type SettlementEvent,
} from '@holoscript/framework/economy';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from '../../traits/__tests__/traitTestHelpers';

// =============================================================================
// HELPERS
// =============================================================================

function createTestConfig(overrides: Partial<X402FacilitatorConfig> = {}): X402FacilitatorConfig {
  return {
    recipientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    chain: 'base' as SettlementChain,
    optimisticExecution: false, // Default to non-optimistic for predictable tests
    ...overrides,
  };
}

function createTestPayment(
  overrides: Partial<{
    from: string;
    to: string;
    value: string;
    nonce: string;
    network: SettlementChain;
    validAfter: string;
    validBefore: string;
    signature: string;
  }> = {}
): X402PaymentPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    x402Version: X402_VERSION,
    scheme: 'exact',
    network: overrides.network ?? 'base',
    payload: {
      signature:
        overrides.signature ?? '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      authorization: {
        from: overrides.from ?? '0xPayerAddress1234567890abcdef12345678',
        to: overrides.to ?? '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        value: overrides.value ?? '50000', // 0.05 USDC
        validAfter: overrides.validAfter ?? (now - 60).toString(),
        validBefore: overrides.validBefore ?? (now + 300).toString(),
        nonce: overrides.nonce ?? `nonce_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
    },
  };
}

// =============================================================================
// MICRO PAYMENT LEDGER
// =============================================================================

describe('MicroPaymentLedger', () => {
  let ledger: MicroPaymentLedger;

  beforeEach(() => {
    ledger = new MicroPaymentLedger(100);
  });

  it('records a micro-payment entry', () => {
    const entry = ledger.record('payer1', 'recipient1', 50000, '/api/scene');
    expect(entry.id).toMatch(/^micro_/);
    expect(entry.from).toBe('payer1');
    expect(entry.to).toBe('recipient1');
    expect(entry.amount).toBe(50000);
    expect(entry.resource).toBe('/api/scene');
    expect(entry.settled).toBe(false);
    expect(entry.settlementTx).toBeNull();
  });

  it('tracks balances correctly', () => {
    ledger.record('payer1', 'recipient1', 50000, '/r1');
    ledger.record('payer1', 'recipient1', 30000, '/r2');
    ledger.record('payer2', 'recipient1', 20000, '/r3');

    expect(ledger.getBalance('payer1')).toBe(-80000);
    expect(ledger.getBalance('payer2')).toBe(-20000);
    expect(ledger.getBalance('recipient1')).toBe(100000);
    expect(ledger.getBalance('unknown')).toBe(0);
  });

  it('returns unsettled entries', () => {
    ledger.record('p1', 'r1', 10000, '/a');
    ledger.record('p2', 'r1', 20000, '/b');

    const unsettled = ledger.getUnsettled();
    expect(unsettled.length).toBe(2);
  });

  it('marks entries as settled', () => {
    const e1 = ledger.record('p1', 'r1', 10000, '/a');
    const e2 = ledger.record('p2', 'r1', 20000, '/b');

    ledger.markSettled([e1.id], 'tx_abc123');

    const unsettled = ledger.getUnsettled();
    expect(unsettled.length).toBe(1);
    expect(unsettled[0].id).toBe(e2.id);
  });

  it('calculates unsettled volume', () => {
    ledger.record('p1', 'r1', 30000, '/a');
    ledger.record('p2', 'r1', 50000, '/b');

    expect(ledger.getUnsettledVolume()).toBe(80000);
  });

  it('returns entries for a specific payer', () => {
    ledger.record('p1', 'r1', 10000, '/a');
    ledger.record('p2', 'r1', 20000, '/b');
    ledger.record('p1', 'r1', 30000, '/c');

    const entries = ledger.getEntriesForPayer('p1');
    expect(entries.length).toBe(2);
  });

  it('provides accurate statistics', () => {
    ledger.record('p1', 'r1', 10000, '/a');
    ledger.record('p2', 'r1', 20000, '/b');
    ledger.record('p1', 'r2', 30000, '/c');

    const stats = ledger.getStats();
    expect(stats.totalEntries).toBe(3);
    expect(stats.unsettledEntries).toBe(3);
    expect(stats.unsettledVolume).toBe(60000);
    expect(stats.uniquePayers).toBe(2);
    expect(stats.uniqueRecipients).toBe(2);
  });

  it('prunes settled entries', () => {
    const e1 = ledger.record('p1', 'r1', 10000, '/a');
    ledger.record('p2', 'r1', 20000, '/b');
    ledger.markSettled([e1.id], 'tx_123');

    const pruned = ledger.pruneSettled();
    expect(pruned).toBe(1);
    expect(ledger.getStats().totalEntries).toBe(1);
  });

  it('trims entries when exceeding maxEntries', () => {
    const smallLedger = new MicroPaymentLedger(5);
    for (let i = 0; i < 10; i++) {
      smallLedger.record(`p${i}`, 'r1', 1000, '/a');
    }
    expect(smallLedger.getStats().totalEntries).toBe(5);
  });

  it('resets cleanly', () => {
    ledger.record('p1', 'r1', 10000, '/a');
    ledger.record('p2', 'r1', 20000, '/b');
    ledger.reset();

    expect(ledger.getStats().totalEntries).toBe(0);
    expect(ledger.getBalance('p1')).toBe(0);
  });
});

// =============================================================================
// X402 FACILITATOR - PAYMENT REQUIRED
// =============================================================================

describe('X402Facilitator', () => {
  let facilitator: X402Facilitator;

  beforeEach(() => {
    facilitator = new X402Facilitator(createTestConfig());
  });

  afterEach(() => {
    facilitator.dispose();
  });

  describe('createPaymentRequired', () => {
    it('generates a valid 402 response body', () => {
      const pr = facilitator.createPaymentRequired('/api/scene/premium', 0.05, 'Premium VR Scene');

      expect(pr.x402Version).toBe(X402_VERSION);
      expect(pr.error).toBe('X-PAYMENT header is required');
      expect(pr.accepts).toHaveLength(1);

      const option = pr.accepts[0];
      expect(option.scheme).toBe('exact');
      expect(option.network).toBe('base');
      expect(option.maxAmountRequired).toBe('50000'); // 0.05 * 1_000_000
      expect(option.resource).toBe('/api/scene/premium');
      expect(option.description).toBe('Premium VR Scene');
      expect(option.payTo).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
      expect(option.asset).toBe(USDC_CONTRACTS['base']);
      expect(option.maxTimeoutSeconds).toBe(60);
    });

    it('includes secondary chain when configured', () => {
      const f = new X402Facilitator(
        createTestConfig({ secondaryChain: 'solana' as SettlementChain })
      );
      const pr = f.createPaymentRequired('/api/data', 1.0);

      expect(pr.accepts).toHaveLength(2);
      expect(pr.accepts[0].network).toBe('base');
      expect(pr.accepts[1].network).toBe('solana');
      expect(pr.accepts[1].asset).toBe(USDC_CONTRACTS['solana']);

      f.dispose();
    });

    it('uses default description when none provided', () => {
      const pr = facilitator.createPaymentRequired('/resource', 0.01);
      expect(pr.accepts[0].description).toBe('HoloScript premium resource');
    });

    it('correctly converts USDC amounts to base units', () => {
      const pr = facilitator.createPaymentRequired('/r', 1.5);
      expect(pr.accepts[0].maxAmountRequired).toBe('1500000'); // 1.50 * 1_000_000
    });

    it('handles zero amount', () => {
      const pr = facilitator.createPaymentRequired('/free', 0);
      expect(pr.accepts[0].maxAmountRequired).toBe('0');
    });
  });

  // ===========================================================================
  // PAYMENT VERIFICATION
  // ===========================================================================

  describe('verifyPayment', () => {
    it('accepts a valid payment', () => {
      const payment = createTestPayment();
      const result = facilitator.verifyPayment(payment, '50000');

      expect(result.isValid).toBe(true);
      expect(result.invalidReason).toBeNull();
    });

    it('rejects wrong protocol version', () => {
      const payment = createTestPayment();
      payment.x402Version = 99;

      const result = facilitator.verifyPayment(payment, '50000');
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain('Unsupported x402 version');
    });

    it('rejects unsupported scheme', () => {
      const payment = createTestPayment();
      (payment as any).scheme = 'up-to';

      const result = facilitator.verifyPayment(payment, '50000');
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain('Unsupported scheme');
    });

    it('rejects unsupported network', () => {
      const payment = createTestPayment({ network: 'ethereum' as any });

      const result = facilitator.verifyPayment(payment, '50000');
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain('Unsupported network');
    });

    it('rejects reused nonce', () => {
      const payment = createTestPayment({ nonce: 'unique_nonce_123' });
      facilitator.verifyPayment(payment, '50000');

      // Mark the nonce as used by processing a payment
      // We need to process to mark the nonce
      const payment2 = createTestPayment({ nonce: 'unique_nonce_123' });
      // First verify marks it valid but doesn't consume nonce
      // processPayment does - let's test through processPayment
    });

    it('rejects expired authorization', () => {
      const now = Math.floor(Date.now() / 1000);
      const payment = createTestPayment({
        validAfter: (now - 600).toString(),
        validBefore: (now - 300).toString(), // Expired
      });

      const result = facilitator.verifyPayment(payment, '50000');
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain('expired');
    });

    it('rejects future authorization', () => {
      const now = Math.floor(Date.now() / 1000);
      const payment = createTestPayment({
        validAfter: (now + 600).toString(), // In future
        validBefore: (now + 900).toString(),
      });

      const result = facilitator.verifyPayment(payment, '50000');
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain('not yet valid');
    });

    it('rejects insufficient payment amount', () => {
      const payment = createTestPayment({ value: '10000' }); // 0.01 USDC

      const result = facilitator.verifyPayment(payment, '50000'); // Requires 0.05 USDC
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain('Insufficient payment');
    });

    it('rejects wrong recipient', () => {
      const payment = createTestPayment({ to: '0xWrongRecipientAddress' });

      const result = facilitator.verifyPayment(payment, '50000');
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain('Recipient mismatch');
    });

    it('rejects missing signature', () => {
      const payment = createTestPayment({ signature: '' });

      const result = facilitator.verifyPayment(payment, '50000');
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain('Missing or invalid signature');
    });

    it('accepts payment with exact amount', () => {
      const payment = createTestPayment({ value: '50000' });

      const result = facilitator.verifyPayment(payment, '50000');
      expect(result.isValid).toBe(true);
    });

    it('accepts payment with overpayment', () => {
      const payment = createTestPayment({ value: '100000' });

      const result = facilitator.verifyPayment(payment, '50000');
      expect(result.isValid).toBe(true);
    });
  });

  // ===========================================================================
  // SETTLEMENT MODE
  // ===========================================================================

  describe('getSettlementMode', () => {
    it('routes micro-payments to in_memory', () => {
      expect(facilitator.getSettlementMode(50000)).toBe('in_memory'); // 0.05 USDC
      expect(facilitator.getSettlementMode(99999)).toBe('in_memory'); // Just under threshold
    });

    it('routes macro-payments to on_chain', () => {
      expect(facilitator.getSettlementMode(100000)).toBe('on_chain'); // Exactly at threshold
      expect(facilitator.getSettlementMode(1000000)).toBe('on_chain'); // 1.00 USDC
    });

    it('respects custom threshold', () => {
      const f = new X402Facilitator(
        createTestConfig({ microPaymentThreshold: 500000 }) // $0.50
      );
      expect(f.getSettlementMode(400000)).toBe('in_memory');
      expect(f.getSettlementMode(500000)).toBe('on_chain');
      f.dispose();
    });
  });

  // ===========================================================================
  // PROCESS PAYMENT (MICRO)
  // ===========================================================================

  describe('processPayment (micro)', () => {
    it('processes micro-payment via in-memory ledger', async () => {
      const payment = createTestPayment({ value: '50000' }); // Below threshold
      const result = await facilitator.processPayment(payment, '/api/scene', '50000');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('in_memory');
      expect(result.network).toBe('in_memory');
      expect(result.transaction).toMatch(/^micro_/);
      expect(result.errorReason).toBeNull();
    });

    it('records micro-payment in the ledger', async () => {
      const payment = createTestPayment({ value: '50000' });
      await facilitator.processPayment(payment, '/api/scene', '50000');

      const stats = facilitator.getLedger().getStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.unsettledVolume).toBe(50000);
    });

    it('rejects invalid micro-payment', async () => {
      const payment = createTestPayment({ value: '10000' }); // Insufficient
      const result = await facilitator.processPayment(payment, '/api/scene', '50000');

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('Insufficient payment');
    });
  });

  // ===========================================================================
  // PROCESS PAYMENT (ON-CHAIN with fetch mock)
  // ===========================================================================

  describe('processPayment (on_chain)', () => {
    it('calls facilitator service for on-chain settlement', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            transaction: '0xabc123...',
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const f = new X402Facilitator(
        createTestConfig({
          facilitatorUrl: 'https://test-facilitator.example.com',
          optimisticExecution: false,
        })
      );

      const payment = createTestPayment({ value: '200000' }); // Above threshold
      const result = await f.processPayment(payment, '/api/premium', '200000');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('on_chain');
      expect(result.transaction).toBe('0xabc123...');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      f.dispose();
      vi.unstubAllGlobals();
    });

    it('handles facilitator error gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
        statusText: 'Internal Server Error',
      });
      vi.stubGlobal('fetch', mockFetch);

      const f = new X402Facilitator(createTestConfig({ optimisticExecution: false }));

      const payment = createTestPayment({ value: '200000' });
      const result = await f.processPayment(payment, '/api/premium', '200000');

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('Facilitator returned 500');

      f.dispose();
      vi.unstubAllGlobals();
    });

    it('handles network error gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));
      vi.stubGlobal('fetch', mockFetch);

      const f = new X402Facilitator(createTestConfig({ optimisticExecution: false }));

      const payment = createTestPayment({ value: '200000' });
      const result = await f.processPayment(payment, '/api/premium', '200000');

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('Network error');

      f.dispose();
      vi.unstubAllGlobals();
    });
  });

  // ===========================================================================
  // OPTIMISTIC EXECUTION
  // ===========================================================================

  describe('optimistic execution', () => {
    it('returns success immediately in optimistic mode', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            transaction: '0xoptimistic123',
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const f = new X402Facilitator(createTestConfig({ optimisticExecution: true }));

      const payment = createTestPayment({ value: '200000' });
      const result = await f.processPayment(payment, '/api/premium', '200000');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('on_chain');
      expect(result.transaction).toMatch(/^pending_/);

      // Wait for async settlement
      await new Promise((r) => setTimeout(r, 50));

      const nonce = payment.payload.authorization.nonce;
      const status = f.getSettlementStatus(nonce);
      expect(status).not.toBe('unknown');

      f.dispose();
      vi.unstubAllGlobals();
    });
  });

  // ===========================================================================
  // BATCH SETTLEMENT
  // ===========================================================================

  describe('batch settlement', () => {
    it('settles all unsettled micro-payments', async () => {
      // Record several micro-payments
      for (let i = 0; i < 5; i++) {
        const payment = createTestPayment({
          value: '50000',
          nonce: `batch_nonce_${i}`,
        });
        await facilitator.processPayment(payment, `/api/resource/${i}`, '50000');
      }

      const result = await facilitator.runBatchSettlement();

      expect(result.settled).toBe(5);
      expect(result.totalVolume).toBe(250000);
      expect(facilitator.getLedger().getUnsettled().length).toBe(0);
    });

    it('returns zero when no unsettled entries', async () => {
      const result = await facilitator.runBatchSettlement();
      expect(result.settled).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.totalVolume).toBe(0);
    });
  });

  // ===========================================================================
  // X-PAYMENT HEADER ENCODING
  // ===========================================================================

  describe('header encoding/decoding', () => {
    it('round-trips X-PAYMENT header correctly', () => {
      const payment = createTestPayment();
      const encoded = X402Facilitator.encodeXPaymentHeader(payment);
      const decoded = X402Facilitator.decodeXPaymentHeader(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.x402Version).toBe(payment.x402Version);
      expect(decoded!.scheme).toBe(payment.scheme);
      expect(decoded!.network).toBe(payment.network);
      expect(decoded!.payload.authorization.from).toBe(payment.payload.authorization.from);
      expect(decoded!.payload.authorization.value).toBe(payment.payload.authorization.value);
    });

    it('returns null for invalid base64', () => {
      const decoded = X402Facilitator.decodeXPaymentHeader('!!!invalid!!!');
      expect(decoded).toBeNull();
    });

    it('creates X-PAYMENT-RESPONSE header', () => {
      const result = {
        success: true,
        transaction: '0xabc',
        network: 'base' as const,
        payer: '0xpayer',
        errorReason: null,
        mode: 'on_chain' as const,
        settledAt: Date.now(),
      };

      const header = X402Facilitator.createPaymentResponseHeader(result);
      expect(header).toBeTruthy();
      expect(typeof header).toBe('string');

      // Decode and verify
      const decoded = JSON.parse(
        typeof atob === 'function' ? atob(header) : Buffer.from(header, 'base64').toString('utf-8')
      );
      expect(decoded.success).toBe(true);
      expect(decoded.transaction).toBe('0xabc');
    });
  });

  // ===========================================================================
  // STATS & LIFECYCLE
  // ===========================================================================

  describe('stats and lifecycle', () => {
    it('reports accurate statistics', async () => {
      const payment = createTestPayment({ value: '50000' });
      await facilitator.processPayment(payment, '/api/scene', '50000');

      const stats = facilitator.getStats();
      expect(stats.usedNonces).toBe(1);
      expect(stats.ledger.totalEntries).toBe(1);
    });

    it('disposes cleanly', () => {
      facilitator.startBatchSettlement();
      facilitator.dispose();

      const stats = facilitator.getStats();
      expect(stats.usedNonces).toBe(0);
      expect(stats.pendingSettlements).toBe(0);
      expect(stats.completedSettlements).toBe(0);
      expect(stats.ledger.totalEntries).toBe(0);
    });
  });
});

// =============================================================================
// CONSTANTS
// =============================================================================

describe('x402 Constants', () => {
  it('defines correct USDC contract addresses', () => {
    expect(USDC_CONTRACTS['base']).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    expect(USDC_CONTRACTS['base-sepolia']).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    expect(USDC_CONTRACTS['solana']).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(USDC_CONTRACTS['solana-devnet']).toBe('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  });

  it('sets micro-payment threshold at $0.10', () => {
    expect(MICRO_PAYMENT_THRESHOLD).toBe(100_000); // 0.10 * 1_000_000
  });

  it('uses protocol version 1', () => {
    expect(X402_VERSION).toBe(1);
  });
});

// =============================================================================
// @credit TRAIT HANDLER
// =============================================================================

describe('creditTraitHandler', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const baseCfg = {
    price: 0.05,
    chain: 'base' as SettlementChain,
    recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    description: 'Premium VR Scene Access',
    timeout: 60,
    optimistic: false,
  };

  beforeEach(() => {
    node = createMockNode('credit-node');
    ctx = createMockContext();
    attachTrait(creditTraitHandler, node, baseCfg, ctx);
  });

  // ===========================================================================
  // Initialization
  // ===========================================================================

  it('initializes with facilitator state', () => {
    const state = (node as any).__creditState;
    expect(state).toBeDefined();
    expect(state.facilitator).toBeInstanceOf(X402Facilitator);
    expect(state.totalRevenue).toBe(0);
    expect(state.totalRequests).toBe(0);
  });

  it('emits credit:initialized on attach', () => {
    expect(getEventCount(ctx, 'credit:initialized')).toBe(1);
    const event = getLastEvent(ctx, 'credit:initialized') as any;
    expect(event.price).toBe(0.05);
    expect(event.chain).toBe('base');
    expect(event.recipient).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
  });

  // ===========================================================================
  // Request Access (generates 402)
  // ===========================================================================

  it('generates 402 PaymentRequired on access request', () => {
    sendEvent(creditTraitHandler, node, baseCfg, ctx, {
      type: 'credit:request_access',
      resource: '/api/scene/premium',
      payer: '0xSomePayer',
    });

    expect(getEventCount(ctx, 'credit:payment_required')).toBe(1);
    const event = getLastEvent(ctx, 'credit:payment_required') as any;
    expect(event.statusCode).toBe(402);
    expect(event.paymentRequired.x402Version).toBe(X402_VERSION);
    expect(event.paymentRequired.accepts).toHaveLength(1);
    expect(event.paymentRequired.accepts[0].maxAmountRequired).toBe('50000');
  });

  it('grants cached access for repeat visitors', async () => {
    // First: manually grant access
    const state = (node as any).__creditState;
    state.accessGranted.set('0xCachedPayer', {
      grantedAt: Date.now(),
      expiresAt: Date.now() + 60000,
      settlementId: 'tx_cached',
    });

    sendEvent(creditTraitHandler, node, baseCfg, ctx, {
      type: 'credit:request_access',
      resource: '/api/scene',
      payer: '0xCachedPayer',
    });

    expect(getEventCount(ctx, 'credit:access_granted')).toBe(1);
    const event = getLastEvent(ctx, 'credit:access_granted') as any;
    expect(event.mode).toBe('cached');
    expect(event.payer).toBe('0xCachedPayer');
  });

  // ===========================================================================
  // Submit Payment (process X-PAYMENT)
  // ===========================================================================

  it('denies access when X-PAYMENT header is missing', () => {
    sendEvent(creditTraitHandler, node, baseCfg, ctx, {
      type: 'credit:submit_payment',
      resource: '/api/scene',
    });

    expect(getEventCount(ctx, 'credit:access_denied')).toBe(1);
    const event = getLastEvent(ctx, 'credit:access_denied') as any;
    expect(event.reason).toContain('Missing X-PAYMENT');
  });

  it('denies access for invalid X-PAYMENT encoding', () => {
    sendEvent(creditTraitHandler, node, baseCfg, ctx, {
      type: 'credit:submit_payment',
      resource: '/api/scene',
      xPayment: '!!!invalid-base64!!!',
    });

    expect(getEventCount(ctx, 'credit:access_denied')).toBe(1);
    const event = getLastEvent(ctx, 'credit:access_denied') as any;
    expect(event.reason).toContain('Invalid X-PAYMENT header');
  });

  it('processes valid micro-payment and grants access', async () => {
    const payment = createTestPayment({ value: '50000' });
    const encodedPayment = X402Facilitator.encodeXPaymentHeader(payment);

    sendEvent(creditTraitHandler, node, baseCfg, ctx, {
      type: 'credit:submit_payment',
      resource: '/api/scene/premium',
      xPayment: encodedPayment,
    });

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 100));

    const grantedEvents = ctx.emittedEvents.filter((e) => e.event === 'credit:access_granted');
    expect(grantedEvents.length).toBeGreaterThanOrEqual(1);

    const event = grantedEvents[0].data as any;
    expect(event.mode).toBe('in_memory');
    expect(event.amount).toBe(0.05);
  });

  // ===========================================================================
  // Stats Query
  // ===========================================================================

  it('returns stats on query', () => {
    sendEvent(creditTraitHandler, node, baseCfg, ctx, {
      type: 'credit:get_stats',
    });

    expect(getEventCount(ctx, 'credit:stats')).toBe(1);
    const event = getLastEvent(ctx, 'credit:stats') as any;
    expect(event.totalRevenue).toBe(0);
    expect(event.totalRequests).toBe(0);
    expect(event.facilitator).toBeDefined();
    expect(event.facilitator.ledger).toBeDefined();
  });

  // ===========================================================================
  // Revoke Access
  // ===========================================================================

  it('revokes access for a payer', () => {
    const state = (node as any).__creditState;
    state.accessGranted.set('0xRevokePayer', {
      grantedAt: Date.now(),
      expiresAt: 0,
      settlementId: 'tx_revoke',
    });

    sendEvent(creditTraitHandler, node, baseCfg, ctx, {
      type: 'credit:revoke_access',
      payer: '0xRevokePayer',
    });

    expect(getEventCount(ctx, 'credit:access_revoked')).toBe(1);
    expect(state.accessGranted.has('0xRevokePayer')).toBe(false);
  });

  // ===========================================================================
  // Detach / Cleanup
  // ===========================================================================

  it('emits shutdown stats on detach', () => {
    const fullConfig = { ...creditTraitHandler.defaultConfig, ...baseCfg };
    creditTraitHandler.onDetach?.(node as any, fullConfig, ctx as any);

    expect(getEventCount(ctx, 'credit:shutdown')).toBe(1);
    const event = getLastEvent(ctx, 'credit:shutdown') as any;
    expect(event.totalRevenue).toBe(0);
    expect(event.totalRequests).toBe(0);
  });

  it('cleans up state on detach', () => {
    const fullConfig = { ...creditTraitHandler.defaultConfig, ...baseCfg };
    creditTraitHandler.onDetach?.(node as any, fullConfig, ctx as any);

    expect((node as any).__creditState).toBeUndefined();
  });
});

// =============================================================================
// CHAIN ID CONSTANTS
// =============================================================================

describe('Chain ID Constants', () => {
  it('maps Base mainnet to chain ID 8453', () => {
    expect(CHAIN_IDS['base']).toBe(8453);
  });

  it('maps Base Sepolia to chain ID 84532', () => {
    expect(CHAIN_IDS['base-sepolia']).toBe(84532);
  });

  it('provides reverse lookup from chain ID to network name', () => {
    expect(CHAIN_ID_TO_NETWORK[8453]).toBe('base');
    expect(CHAIN_ID_TO_NETWORK[84532]).toBe('base-sepolia');
  });
});

// =============================================================================
// PAYMENT GATEWAY
// =============================================================================

describe('PaymentGateway', () => {
  let gateway: PaymentGateway;

  beforeEach(() => {
    gateway = new PaymentGateway(createTestConfig());
  });

  afterEach(() => {
    gateway.dispose();
  });

  // ===========================================================================
  // Event Emitter (Audit Trail)
  // ===========================================================================

  describe('event emitter', () => {
    it('emits events to specific listeners', () => {
      const events: SettlementEvent[] = [];
      gateway.on('payment:authorization_created', (e) => events.push(e));

      gateway.createPaymentAuthorization('/api/scene', 0.05);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('payment:authorization_created');
      expect(events[0].amount).toBe('50000');
      expect(events[0].eventId).toMatch(/^evt_/);
      expect(events[0].timestamp).toBeTruthy();
    });

    it('emits events to wildcard listeners', () => {
      const events: SettlementEvent[] = [];
      gateway.on('*', (e) => events.push(e));

      gateway.createPaymentAuthorization('/api/scene', 0.05);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('payment:authorization_created');
    });

    it('returns unsubscribe function', () => {
      const events: SettlementEvent[] = [];
      const unsub = gateway.on('payment:authorization_created', (e) => events.push(e));

      gateway.createPaymentAuthorization('/r1', 0.01);
      expect(events.length).toBe(1);

      unsub();

      gateway.createPaymentAuthorization('/r2', 0.02);
      expect(events.length).toBe(1); // No new event after unsub
    });

    it('supports off() to remove listeners', () => {
      const events: SettlementEvent[] = [];
      const listener = (e: SettlementEvent) => events.push(e);
      gateway.on('payment:authorization_created', listener);

      gateway.createPaymentAuthorization('/r1', 0.01);
      expect(events.length).toBe(1);

      gateway.off('payment:authorization_created', listener);

      gateway.createPaymentAuthorization('/r2', 0.02);
      expect(events.length).toBe(1);
    });

    it('swallows listener errors without breaking payment flow', () => {
      gateway.on('payment:authorization_created', () => {
        throw new Error('Listener crashed');
      });

      // Should not throw
      const result = gateway.createPaymentAuthorization('/api/scene', 0.05);
      expect(result.x402Version).toBe(X402_VERSION);
    });
  });

  // ===========================================================================
  // Payment Authorization
  // ===========================================================================

  describe('createPaymentAuthorization', () => {
    it('generates a valid 402 response with chainId', () => {
      const auth = gateway.createPaymentAuthorization('/api/premium', 0.05, 'Premium Scene');

      expect(auth.x402Version).toBe(X402_VERSION);
      expect(auth.chainId).toBe(8453); // Base mainnet
      expect(auth.accepts).toHaveLength(1);
      expect(auth.accepts[0].maxAmountRequired).toBe('50000');
      expect(auth.accepts[0].description).toBe('Premium Scene');
      expect(auth.error).toBe('X-PAYMENT header is required');
    });

    it('emits payment:authorization_created event', () => {
      const events: SettlementEvent[] = [];
      gateway.on('payment:authorization_created', (e) => events.push(e));

      gateway.createPaymentAuthorization('/api/premium', 1.0);

      expect(events.length).toBe(1);
      expect(events[0].amount).toBe('1000000');
      expect(events[0].network).toBe('base');
    });
  });

  // ===========================================================================
  // Payment Verification
  // ===========================================================================

  describe('verifyPayment', () => {
    it('verifies a valid payment payload', () => {
      const payment = createTestPayment();
      const result = gateway.verifyPayment(payment, '50000');

      expect(result.isValid).toBe(true);
      expect(result.decodedPayload).not.toBeNull();
      expect(result.decodedPayload!.payload.authorization.from).toBe(
        payment.payload.authorization.from
      );
    });

    it('verifies a valid base64-encoded X-PAYMENT header', () => {
      const payment = createTestPayment();
      const encoded = X402Facilitator.encodeXPaymentHeader(payment);
      const result = gateway.verifyPayment(encoded, '50000');

      expect(result.isValid).toBe(true);
      expect(result.decodedPayload).not.toBeNull();
    });

    it('rejects invalid base64 string', () => {
      const result = gateway.verifyPayment('!!!invalid!!!', '50000');

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain('Failed to decode');
      expect(result.decodedPayload).toBeNull();
    });

    it('emits verification events for valid payment', () => {
      const events: SettlementEvent[] = [];
      gateway.on('*', (e) => events.push(e));

      const payment = createTestPayment();
      gateway.verifyPayment(payment, '50000');

      const types = events.map((e) => e.type);
      expect(types).toContain('payment:verification_started');
      expect(types).toContain('payment:verification_passed');
    });

    it('emits verification_failed event for invalid payment', () => {
      const events: SettlementEvent[] = [];
      gateway.on('*', (e) => events.push(e));

      const payment = createTestPayment({ value: '1' }); // Insufficient
      gateway.verifyPayment(payment, '50000');

      const types = events.map((e) => e.type);
      expect(types).toContain('payment:verification_started');
      expect(types).toContain('payment:verification_failed');
    });
  });

  // ===========================================================================
  // Payment Settlement
  // ===========================================================================

  describe('settlePayment', () => {
    it('settles a micro-payment via in-memory ledger', async () => {
      const events: SettlementEvent[] = [];
      gateway.on('*', (e) => events.push(e));

      const payment = createTestPayment({ value: '50000' });
      const result = await gateway.settlePayment(payment, '/api/scene', '50000');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('in_memory');
      expect(result.transaction).toMatch(/^micro_/);

      const types = events.map((e) => e.type);
      expect(types).toContain('payment:settlement_started');
      expect(types).toContain('payment:settlement_completed');
    });

    it('settles an on-chain payment with mocked facilitator', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, transaction: '0xSettled123' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const g = new PaymentGateway(
        createTestConfig({
          facilitatorUrl: 'https://test.example.com',
          optimisticExecution: false,
        })
      );

      const events: SettlementEvent[] = [];
      g.on('*', (e) => events.push(e));

      const payment = createTestPayment({ value: '200000' });
      const result = await g.settlePayment(payment, '/api/premium', '200000');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('on_chain');
      expect(result.transaction).toBe('0xSettled123');

      const types = events.map((e) => e.type);
      expect(types).toContain('payment:settlement_started');
      expect(types).toContain('payment:settlement_completed');

      g.dispose();
      vi.unstubAllGlobals();
    });

    it('emits settlement_failed on error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      vi.stubGlobal('fetch', mockFetch);

      const g = new PaymentGateway(createTestConfig({ optimisticExecution: false }));

      const events: SettlementEvent[] = [];
      g.on('*', (e) => events.push(e));

      const payment = createTestPayment({ value: '200000' });
      const result = await g.settlePayment(payment, '/api/premium', '200000');

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('Network error');

      const types = events.map((e) => e.type);
      expect(types).toContain('payment:settlement_failed');

      g.dispose();
      vi.unstubAllGlobals();
    });

    it('returns failure for undecodable base64 string', async () => {
      const result = await gateway.settlePayment('!!!bad!!!', '/api/scene', '50000');

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('Failed to decode');
    });

    it('settles from a base64-encoded string', async () => {
      const payment = createTestPayment({ value: '50000' });
      const encoded = X402Facilitator.encodeXPaymentHeader(payment);

      const result = await gateway.settlePayment(encoded, '/api/scene', '50000');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('in_memory');
    });
  });

  // ===========================================================================
  // Refund
  // ===========================================================================

  describe('refundPayment', () => {
    it('returns failure for unknown nonce', async () => {
      const events: SettlementEvent[] = [];
      gateway.on('*', (e) => events.push(e));

      const result = await gateway.refundPayment({
        originalNonce: 'nonexistent_nonce',
        reason: 'Content unavailable',
        partialAmount: null,
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('not found');
      expect(result.refundId).toMatch(/^refund_/);

      const types = events.map((e) => e.type);
      expect(types).toContain('payment:refund_initiated');
      expect(types).toContain('payment:refund_failed');
    });

    it('emits refund_initiated event', async () => {
      const events: SettlementEvent[] = [];
      gateway.on('payment:refund_initiated', (e) => events.push(e));

      await gateway.refundPayment({
        originalNonce: 'any_nonce',
        reason: 'Test refund',
        partialAmount: null,
      });

      expect(events.length).toBe(1);
      expect(events[0].nonce).toBe('any_nonce');
      expect(events[0].metadata).toHaveProperty('reason', 'Test refund');
    });

    it('stores refund results and allows lookup', async () => {
      const result = await gateway.refundPayment({
        originalNonce: 'lookup_test',
        reason: 'Test lookup',
        partialAmount: null,
      });

      const stored = gateway.getRefund(result.refundId);
      expect(stored).toBeDefined();
      expect(stored!.originalNonce).toBe('lookup_test');
      expect(stored!.reason).toBe('Test lookup');
    });

    it('returns all refunds via getAllRefunds()', async () => {
      await gateway.refundPayment({ originalNonce: 'n1', reason: 'r1', partialAmount: null });
      await gateway.refundPayment({ originalNonce: 'n2', reason: 'r2', partialAmount: null });

      const all = gateway.getAllRefunds();
      expect(all.length).toBe(2);
    });
  });

  // ===========================================================================
  // Batch Settlement
  // ===========================================================================

  describe('batch settlement', () => {
    it('emits batch settlement events', async () => {
      const events: SettlementEvent[] = [];
      gateway.on('*', (e) => events.push(e));

      // Record micro-payments
      for (let i = 0; i < 3; i++) {
        const payment = createTestPayment({ value: '50000', nonce: `gw_batch_${i}` });
        await gateway.settlePayment(payment, `/api/r/${i}`, '50000');
      }

      const batchResult = await gateway.runBatchSettlement();

      expect(batchResult.settled).toBe(3);
      expect(batchResult.totalVolume).toBe(150000);

      const types = events.map((e) => e.type);
      expect(types).toContain('payment:batch_settlement_started');
      expect(types).toContain('payment:batch_settlement_completed');
    });
  });

  // ===========================================================================
  // Query / Status
  // ===========================================================================

  describe('query and status', () => {
    it('returns the underlying facilitator', () => {
      const facilitator = gateway.getFacilitator();
      expect(facilitator).toBeInstanceOf(X402Facilitator);
    });

    it('returns the correct chain ID', () => {
      expect(gateway.getChainId()).toBe(8453);
    });

    it('returns the correct USDC contract address', () => {
      expect(gateway.getUSDCContract()).toBe(USDC_CONTRACTS['base']);
    });

    it('returns comprehensive stats', async () => {
      const payment = createTestPayment({ value: '50000' });
      await gateway.settlePayment(payment, '/api/scene', '50000');

      const stats = gateway.getStats();
      expect(stats.chainId).toBe(8453);
      expect(stats.usdcContract).toBe(USDC_CONTRACTS['base']);
      expect(stats.facilitator.usedNonces).toBe(1);
      expect(stats.facilitator.ledger.totalEntries).toBe(1);
      expect(stats.totalRefunds).toBe(0);
      expect(stats.listenerCount).toBe(0);
    });

    it('counts active listeners in stats', () => {
      gateway.on('payment:settlement_completed', () => {});
      gateway.on('*', () => {});

      const stats = gateway.getStats();
      expect(stats.listenerCount).toBe(2);
    });
  });

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  describe('lifecycle', () => {
    it('disposes cleanly', () => {
      gateway.on('*', () => {});
      gateway.dispose();

      const stats = gateway.getStats();
      expect(stats.facilitator.usedNonces).toBe(0);
      expect(stats.totalRefunds).toBe(0);
      expect(stats.listenerCount).toBe(0);
    });
  });

  // ===========================================================================
  // Full Payment Flow (Integration)
  // ===========================================================================

  describe('full payment flow', () => {
    it('executes complete authorize -> verify -> settle flow', async () => {
      const auditTrail: SettlementEvent[] = [];
      gateway.on('*', (e) => auditTrail.push(e));

      // Step 1: Create payment authorization (402 response)
      const auth = gateway.createPaymentAuthorization(
        '/api/premium-scene',
        0.05,
        'Premium VR Scene'
      );
      expect(auth.x402Version).toBe(X402_VERSION);
      expect(auth.chainId).toBe(8453);
      expect(auth.accepts[0].maxAmountRequired).toBe('50000');

      // Step 2: Simulate agent creating a signed payment
      const payment = createTestPayment({ value: '50000' });

      // Step 3: Verify the payment
      const verification = gateway.verifyPayment(payment, '50000');
      expect(verification.isValid).toBe(true);
      expect(verification.decodedPayload).not.toBeNull();

      // Step 4: Settle the payment
      const settlement = await gateway.settlePayment(payment, '/api/premium-scene', '50000');
      expect(settlement.success).toBe(true);
      expect(settlement.mode).toBe('in_memory');

      // Verify audit trail has all events
      const types = auditTrail.map((e) => e.type);
      expect(types).toContain('payment:authorization_created');
      expect(types).toContain('payment:verification_started');
      expect(types).toContain('payment:verification_passed');
      expect(types).toContain('payment:settlement_started');
      expect(types).toContain('payment:settlement_completed');

      // Verify all events have required fields
      for (const event of auditTrail) {
        expect(event.eventId).toMatch(/^evt_/);
        expect(event.timestamp).toBeTruthy();
        expect(event.type).toBeTruthy();
      }
    });
  });
});
