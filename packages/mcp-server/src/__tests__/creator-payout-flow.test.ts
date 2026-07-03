import { beforeEach, describe, expect, it } from 'vitest';

import { X402_VERSION, type X402PaymentPayload } from '@holoscript/framework/economy';

import {
  handleEconomyTool,
  recordProtocolCreatorRevenue,
  resetEconomySingletons,
} from '../economy-tools';

const CREATOR_ID = 'creator-ws9';
const CREATOR_WALLET = '0x0000000000000000000000000000000000000c09';
const PAYER_WALLET = '0x0000000000000000000000000000000000000b09';
const ONE_CENT_BASE_UNITS = 10_000;

interface CreatorEarningsResult {
  earnings: {
    totalNet: number;
    eventCount: number;
  };
  payouts: Array<{
    amount: number;
    method: string;
    status: string;
    transactionHash?: string;
  }>;
}

interface CreatorPayoutResult {
  status: string;
  receipt?: {
    amountBaseUnits: number;
    recipientWallet: string;
    unpaidBefore: number;
    settlement: {
      success: boolean;
      transaction: string | null;
      network: string;
      mode: string;
      payer: string;
    };
    payoutRecord: {
      amount: number;
      method: string;
      status: string;
      transactionHash?: string;
    };
    x402: {
      settlementMode: string;
      signatureVerification: string;
    };
  };
}

function makePaymentPayload(amountBaseUnits = ONE_CENT_BASE_UNITS): X402PaymentPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    x402Version: X402_VERSION,
    scheme: 'exact',
    network: 'base-sepolia',
    payload: {
      signature: `0x${'ab'.repeat(65)}`,
      authorization: {
        from: PAYER_WALLET,
        to: CREATOR_WALLET,
        value: String(amountBaseUnits),
        validAfter: String(now - 5),
        validBefore: String(now + 600),
        nonce: `ws9-${now}-${Math.random().toString(36).slice(2, 10)}`,
      },
    },
  };
}

describe('creator payout settlement flow', () => {
  beforeEach(() => {
    resetEconomySingletons();
  });

  it('settles a one-cent x402 creator payout and exposes the payout through get_creator_earnings', async () => {
    recordProtocolCreatorRevenue({
      creatorId: CREATOR_ID,
      contentHash: 'a'.repeat(64),
      grossAmount: 12_000,
      collectorId: 'collector-ws9',
      ledgerEntryId: 'collect-ws9',
    });

    const before = (await handleEconomyTool('get_creator_earnings', {
      creatorId: CREATOR_ID,
      period: 'all-time',
    })) as CreatorEarningsResult;

    expect(before.earnings.totalNet).toBeGreaterThanOrEqual(ONE_CENT_BASE_UNITS);
    expect(before.payouts).toEqual([]);

    const payout = (await handleEconomyTool('settle_creator_payout', {
      creatorId: CREATOR_ID,
      recipientWallet: CREATOR_WALLET,
      amountBaseUnits: ONE_CENT_BASE_UNITS,
      period: 'all-time',
      chain: 'base-sepolia',
      resource: 'creator-payout:ws9-proof',
      paymentPayload: makePaymentPayload(),
    })) as CreatorPayoutResult;

    expect(payout.status).toBe('success');
    expect(payout.receipt?.amountBaseUnits).toBe(ONE_CENT_BASE_UNITS);
    expect(payout.receipt?.recipientWallet).toBe(CREATOR_WALLET);
    expect(payout.receipt?.settlement).toMatchObject({
      success: true,
      network: 'in_memory',
      mode: 'in_memory',
      payer: PAYER_WALLET,
    });
    expect(payout.receipt?.settlement.transaction).toMatch(/^micro_/);
    expect(payout.receipt?.payoutRecord).toMatchObject({
      amount: ONE_CENT_BASE_UNITS,
      method: 'batch_settlement',
      status: 'completed',
    });
    expect(payout.receipt?.x402.signatureVerification).toContain('structural x402 payload');

    const after = (await handleEconomyTool('get_creator_earnings', {
      creatorId: CREATOR_ID,
      period: 'all-time',
    })) as CreatorEarningsResult;

    expect(after.payouts).toHaveLength(1);
    expect(after.payouts[0]).toMatchObject({
      amount: ONE_CENT_BASE_UNITS,
      method: 'batch_settlement',
      status: 'completed',
      transactionHash: payout.receipt?.settlement.transaction,
    });
  });
});
