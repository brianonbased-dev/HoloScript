import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InMemorySkillDatabase,
  SkillDownloadStatsTracker,
  SkillMarketplaceService,
  SkillRatingService,
  type SkillPaymentVerifier,
} from '../SkillMarketplaceService.js';
import { createSkillMarketplaceRoutes } from '../skillRoutes.js';
import type { SkillPublishRequest } from '../types.js';
import type { x402PaymentReceipt, x402PaymentService } from '../x402PaymentService.js';

function makePublishRequest(overrides: Partial<SkillPublishRequest> = {}): SkillPublishRequest {
  return {
    name: 'Paid Workflow',
    version: '1.0.0',
    description: 'Workflow used to verify paid skill purchase receipts',
    category: 'workflow',
    targetPlatform: 'claude',
    entrypoint: 'SKILL.md',
    files: [
      {
        path: 'SKILL.md',
        content: '# Paid Workflow\n\nUse this workflow after purchase.',
        mimeType: 'text/markdown',
        sizeBytes: 52,
      },
    ],
    license: 'MIT',
    keywords: ['paid', 'workflow'],
    pricingModel: 'one_time',
    price: 999,
    permissions: ['read_files'],
    sandboxed: true,
    ...overrides,
  };
}

function makeReceipt(
  skillId: string,
  overrides: Partial<x402PaymentReceipt> = {}
): x402PaymentReceipt {
  return {
    payment_id: 'pay_skill_001',
    transaction_hash: `0x${'ab'.repeat(32)}`,
    block_number: 1,
    timestamp: Math.floor(Date.now() / 1000),
    payer_address: '0x0000000000000000000000000000000000000001',
    recipient_address: '0x000000000000000000000000000000000000dEaD',
    amount: 9.99,
    asset: 'USDC',
    network: 'base',
    content_id: skillId,
    access_granted: true,
    ...overrides,
  };
}

async function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe('SkillMarketplace paid x402 flow', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    const closingServer = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => {
      closingServer.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('verifies purchase receipts before issuing paid skill download URLs', async () => {
    const paymentVerifier: SkillPaymentVerifier = {
      verifyPayment: vi.fn(),
    };
    const service = new SkillMarketplaceService(
      new InMemorySkillDatabase(),
      new SkillDownloadStatsTracker(),
      new SkillRatingService(),
      paymentVerifier
    );
    const published = await service.publishSkill(makePublishRequest(), 'creator-token');
    const receipt = makeReceipt(published.skillId);
    vi.mocked(paymentVerifier.verifyPayment).mockResolvedValue(receipt);

    const paymentResponder = {
      verifyPayment: paymentVerifier.verifyPayment,
      return402Response: vi.fn((res: express.Response, request: { payment_id: string }) => {
        res.status(402).header('WWW-Authenticate', 'x402').json({
          success: false,
          error: { code: 'PAYMENT_REQUIRED', message: 'Payment required' },
          payment_id: request.payment_id,
        });
      }),
    } as unknown as x402PaymentService;

    const app = express();
    app.use(express.json());
    app.use('/skills', createSkillMarketplaceRoutes(service, paymentResponder));
    const listener = await listen(app);
    server = listener.server;
    const baseUrl = listener.baseUrl;

    const purchaseChallenge = await fetch(`${baseUrl}/skills/${published.skillId}/purchase`, {
      method: 'POST',
      headers: { authorization: 'Bearer buyer-token' },
    });
    expect(purchaseChallenge.status).toBe(402);
    expect(paymentResponder.return402Response).toHaveBeenCalledOnce();

    const purchaseResponse = await fetch(`${baseUrl}/skills/${published.skillId}/purchase`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer buyer-token',
        'x-payment-id': receipt.payment_id,
      },
    });
    expect(purchaseResponse.status).toBe(200);
    const purchaseBody = await purchaseResponse.json();
    expect(purchaseBody.data).toMatchObject({
      downloadUrl: `/api/skills/${published.skillId}/download`,
      receipt: {
        paymentId: receipt.payment_id,
        contentId: published.skillId,
        amount: 9.99,
      },
    });

    const deniedDownload = await fetch(`${baseUrl}/skills/${published.skillId}/download`);
    expect(deniedDownload.status).toBe(402);

    const downloadResponse = await fetch(`${baseUrl}/skills/${published.skillId}/download`, {
      headers: { 'x-payment-id': receipt.payment_id },
    });
    expect(downloadResponse.status).toBe(200);
    const downloadBody = await downloadResponse.json();
    expect(downloadBody.data).toMatchObject({
      url: `/api/skills/${published.skillId}/download`,
      receipt: { paymentId: receipt.payment_id },
    });

    const stats = await service.getSkillDownloadStats(published.skillId);
    expect(stats.total).toBe(1);
    expect(paymentVerifier.verifyPayment).toHaveBeenCalledWith(receipt.payment_id);
  });

  it('rejects receipts for another paid skill', async () => {
    const paymentVerifier: SkillPaymentVerifier = {
      verifyPayment: vi.fn(),
    };
    const service = new SkillMarketplaceService(
      new InMemorySkillDatabase(),
      new SkillDownloadStatsTracker(),
      new SkillRatingService(),
      paymentVerifier
    );
    const published = await service.publishSkill(makePublishRequest(), 'creator-token');
    vi.mocked(paymentVerifier.verifyPayment).mockResolvedValue(
      makeReceipt('skill-someone-else')
    );

    await expect(
      service.purchaseSkill(published.skillId, 'buyer-token', 'pay_skill_001')
    ).rejects.toMatchObject({ code: 'PAYMENT_RECEIPT_MISMATCH' });
  });
});
