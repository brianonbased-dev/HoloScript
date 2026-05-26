import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@holoscript/framework/economy', () => {
  interface RevenueEvent {
    id: string;
    creatorId: string;
    pluginId: string;
    grossAmount: number;
    platformFee: number;
    netAmount: number;
    timestamp: number;
    payerId: string;
    ledgerEntryId?: string;
  }

  class CreatorRevenueAggregator {
    private events = new Map<string, RevenueEvent[]>();
    private eventCounter = 0;
    private platformFeeRate = 0.15;

    recordRevenue(
      creatorId: string,
      pluginId: string,
      grossAmount: number,
      payerId: string,
      ledgerEntryId?: string
    ) {
      const platformFee = Math.floor(grossAmount * this.platformFeeRate);
      const event: RevenueEvent = {
        id: `rev-${++this.eventCounter}`,
        creatorId,
        pluginId,
        grossAmount,
        platformFee,
        netAmount: grossAmount - platformFee,
        timestamp: Date.now(),
        payerId,
        ledgerEntryId,
      };
      this.events.set(creatorId, [...(this.events.get(creatorId) ?? []), event]);
      return event;
    }

    getCreatorEarnings(creatorId: string) {
      const events = this.events.get(creatorId) ?? [];
      const byPlugin = new Map<
        string,
        {
          pluginId: string;
          grossAmount: number;
          platformFee: number;
          netAmount: number;
          eventCount: number;
          uniquePayers: Set<string>;
        }
      >();
      for (const event of events) {
        const current = byPlugin.get(event.pluginId) ?? {
          pluginId: event.pluginId,
          grossAmount: 0,
          platformFee: 0,
          netAmount: 0,
          eventCount: 0,
          uniquePayers: new Set<string>(),
        };
        current.grossAmount += event.grossAmount;
        current.platformFee += event.platformFee;
        current.netAmount += event.netAmount;
        current.eventCount += 1;
        current.uniquePayers.add(event.payerId);
        byPlugin.set(event.pluginId, current);
      }
      return {
        creatorId,
        totalGross: events.reduce((sum, event) => sum + event.grossAmount, 0),
        totalFees: events.reduce((sum, event) => sum + event.platformFee, 0),
        totalNet: events.reduce((sum, event) => sum + event.netAmount, 0),
        byPlugin,
        eventCount: events.length,
        periodStart: new Date(0).toISOString(),
        periodEnd: new Date(Date.now() + 1000).toISOString(),
      };
    }

    getCreatorPayouts() {
      return [];
    }

    getPlatformFeeRate() {
      return this.platformFeeRate;
    }
  }

  class AgentBudgetEnforcer {}
  class UsageMeter {}
  class UnifiedBudgetOptimizer {}

  return {
    AgentBudgetEnforcer,
    UsageMeter,
    CreatorRevenueAggregator,
    UnifiedBudgetOptimizer,
    DEFAULT_COST_FLOOR: { baseFee: 0 },
  };
});

vi.mock('@holoscript/core', () => {
  const bpsDenom = 10_000n;
  const ethToWei = (eth: string): bigint => {
    const [whole = '0', rawFraction = ''] = eth.split('.');
    const fraction = rawFraction.padEnd(18, '0').slice(0, 18);
    return BigInt(whole || '0') * 10n ** 18n + BigInt(fraction || '0');
  };

  return {
    PROTOCOL_CONSTANTS: {
      DEFAULT_REFERRAL_BPS: 200,
      PLATFORM_FEE_BPS: 250,
      BPS_DENOMINATOR: 10_000,
    },
    ethToWei,
    parse: () => ({ errors: [] }),
    generateProvenance: (
      _code: string,
      _ast: unknown,
      options: { author: string; license: string }
    ) => ({
      hash: 'e'.repeat(64),
      author: options.author,
      license: options.license,
      publishMode: 'test',
      imports: [],
      created: '2026-05-26T00:00:00.000Z',
    }),
    calculateRevenueDistribution: (
      collectPrice: bigint,
      creator: string,
      _imports: unknown[],
      options: { referrer?: string } = {}
    ) => {
      if (collectPrice === 0n) return { totalPrice: collectPrice, flows: [] };
      const platform = (collectPrice * 250n) / bpsDenom;
      const referral = options.referrer ? (collectPrice * 200n) / bpsDenom : 0n;
      const creatorAmount = collectPrice - platform - referral;
      const flows = [
        { recipient: 'platform', amount: platform, reason: 'platform', bps: 250 },
        ...(options.referrer
          ? [{ recipient: options.referrer, amount: referral, reason: 'referral', bps: 200 }]
          : []),
        { recipient: creator, amount: creatorAmount, reason: 'creator', bps: 9750 },
      ];
      return { totalPrice: collectPrice, flows };
    },
    formatRevenueDistribution: () => ['mock revenue distribution'],
  };
});

import { handleEconomyTool, resetEconomySingletons } from '../economy-tools';
import { handleProtocolTool } from '../protocol-tools';

interface ToolResult {
  status?: string;
  contentHash?: string;
  provenance?: { hash?: string };
  revenueRecorded?: { creatorId: string; grossAmount: number; eventId: string } | null;
  earnings?: {
    totalGross: number;
    totalNet: number;
    eventCount: number;
    byPlugin: Array<{
      pluginId: string;
      grossAmount: number;
      netAmount: number;
      eventCount: number;
      uniquePayers: number;
    }>;
  };
  flows?: Array<{ recipient: string; amount: string; reason: string }>;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...init.headers },
  });
}

describe('protocol earn loop', () => {
  const records = new Map<string, Record<string, unknown>>();
  const originalServerUrl = process.env.HOLOSCRIPT_SERVER_URL;
  const originalApiKey = process.env.HOLOSCRIPT_API_KEY;

  beforeEach(() => {
    resetEconomySingletons();
    records.clear();
    process.env.HOLOSCRIPT_SERVER_URL = 'https://protocol.test';
    process.env.HOLOSCRIPT_API_KEY = 'test-key';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const method = init?.method ?? 'GET';

        if (url.pathname === '/api/protocol/metadata' && method === 'POST') {
          return jsonResponse({ metadataURI: `${url.origin}/metadata/test` }, { status: 201 });
        }

        if (url.pathname === '/api/protocol' && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          const contentHash = String(body.contentHash);
          records.set(contentHash, { ...body, contentHash, editionCount: 0 });
          return jsonResponse(
            {
              protocolId: `protocol-${contentHash.slice(0, 8)}`,
              contentHash,
              collectUrl: `${url.origin}/collect/${contentHash}`,
            },
            { status: 201 }
          );
        }

        if (url.pathname.startsWith('/api/protocol/') && method === 'GET') {
          const contentHash = url.pathname.replace('/api/protocol/', '');
          const record = records.get(contentHash);
          return record
            ? jsonResponse(record)
            : jsonResponse({ error: 'Protocol record not found' }, { status: 404 });
        }

        if (url.pathname.startsWith('/api/collect/') && method === 'POST') {
          const contentHash = url.pathname.replace('/api/collect/', '');
          const record = records.get(contentHash);
          if (!record) {
            return jsonResponse({ error: 'Composition not found' }, { status: 404 });
          }
          const body = JSON.parse(String(init?.body)) as { quantity?: number };
          const quantity = body.quantity ?? 1;
          const currentCount = typeof record.editionCount === 'number' ? record.editionCount : 0;
          record.editionCount = currentCount + quantity;
          return jsonResponse({
            editions: Array.from({ length: quantity }, (_, i) => currentCount + i + 1),
            txHash: `tx-${contentHash.slice(0, 8)}`,
          });
        }

        return jsonResponse({ error: `Unhandled ${method} ${url.pathname}` }, { status: 500 });
      })
    );
  });

  afterEach(() => {
    resetEconomySingletons();
    vi.unstubAllGlobals();
    process.env.HOLOSCRIPT_SERVER_URL = originalServerUrl;
    process.env.HOLOSCRIPT_API_KEY = originalApiKey;
  });

  it('publishes, collects as a second identity, and exposes non-zero creator earnings', async () => {
    const creatorId = 'creator-alpha';
    const collectorId = 'collector-beta';
    const price = '0.000000000001';

    const publish = (await handleProtocolTool('holo_protocol_publish', {
      code: 'composition "EarnLoop" {}',
      author: creatorId,
      license: 'commercial',
      price,
    })) as ToolResult;

    expect(publish.status).toBe('success');
    const contentHash = publish.contentHash ?? publish.provenance?.hash;
    expect(contentHash).toMatch(/^[a-f0-9]{64}$/);

    const revenue = (await handleProtocolTool('holo_protocol_revenue', {
      price,
      author: creatorId,
    })) as ToolResult;
    expect(revenue.status).toBe('success');
    expect(
      Number(revenue.flows?.find((flow) => flow.reason === 'creator')?.amount ?? 0)
    ).toBeGreaterThan(0);

    const beforeCollect = (await handleEconomyTool('get_creator_earnings', {
      creatorId,
      period: 'all-time',
    })) as ToolResult;
    expect(beforeCollect.earnings?.totalNet).toBe(0);

    const collect = (await handleProtocolTool('holo_protocol_collect', {
      contentHash,
      collectorId,
      quantity: 1,
    })) as ToolResult;

    expect(collect.status).toBe('success');
    expect(collect.revenueRecorded).toMatchObject({ creatorId });
    expect(collect.revenueRecorded?.grossAmount).toBeGreaterThan(0);

    const earnings = (await handleEconomyTool('get_creator_earnings', {
      creatorId,
      period: 'all-time',
    })) as ToolResult;

    expect(earnings.earnings?.eventCount).toBe(1);
    expect(earnings.earnings?.totalGross).toBeGreaterThan(0);
    expect(earnings.earnings?.totalNet).toBeGreaterThan(0);
    expect(earnings.earnings?.byPlugin[0]).toMatchObject({
      pluginId: `protocol:${contentHash}`,
      eventCount: 1,
      uniquePayers: 1,
    });
  });
});
