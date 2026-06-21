import express, { type RequestHandler } from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReconstructionManifest } from '@holoscript/core/reconstruction';
import { createHololandRoutes, type HololandPaymentService } from '../hololandRoutes.js';
import type { x402PaymentReceipt } from '../x402PaymentService.js';
import {
  FileVrrTwinStore,
  InMemoryVrrTwinStore,
  VRRTwinService,
  VrrProtocolPublishError,
  parseCreateVrrTwinInput,
  type ProtocolPublishInput,
  type ProtocolPublisher,
  type VrrProtocolPublishReceipt,
} from '../VRRTwinService.js';

function makeManifest(overrides: Partial<ReconstructionManifest> = {}): ReconstructionManifest {
  const replayHash = overrides.replayHash ?? 'replay-phoenix-brew';
  return {
    version: '1.0.0',
    worldId: overrides.worldId ?? 'holomap-phoenix-brew',
    displayName: overrides.displayName ?? 'Phoenix Brew Scan',
    pointCount: overrides.pointCount ?? 4096,
    frameCount: overrides.frameCount ?? 128,
    bounds: overrides.bounds ?? {
      min: [0, 0, 0],
      max: [12, 3, 18],
    },
    replayHash,
    simulationContract: overrides.simulationContract ?? {
      kind: 'holomap.reconstruction.v1',
      replayFingerprint: replayHash,
      holoScriptBuild: '8.0.8-test',
    },
    provenance: overrides.provenance ?? {
      anchorHash: `self-attested:${replayHash}`,
      capturedAtIso: '2026-06-21T00:00:00.000Z',
    },
    assets: overrides.assets ?? {
      points: 'points.bin',
      trajectory: 'trajectory.json',
      anchors: 'anchors.json',
    },
    weightStrategy: overrides.weightStrategy ?? 'distill',
  };
}

function successPublisher(published: ProtocolPublishInput[] = []): ProtocolPublisher {
  return {
    async publish(input) {
      published.push(input);
      return {
        status: 'success',
        protocolId: 'proto_vrr_phoenix_brew',
        contentHash: 'a'.repeat(64),
        collectUrl: 'https://mcp.holoscript.net/collect/a',
        revenuePreview: { creator: '80%', platform: '10%', agent: '10%' },
        raw: { status: 'success' },
      };
    },
  };
}

function failingPublisher(): ProtocolPublisher {
  return {
    async publish(): Promise<VrrProtocolPublishReceipt> {
      return {
        status: 'error',
        error: 'SERVER_UNAVAILABLE',
        message: 'protocol publish unavailable',
        raw: { status: 'error' },
      };
    },
  };
}

function makePaymentReceipt(contentId = 'vrr_twin_phoenix_brew'): x402PaymentReceipt {
  return {
    payment_id: 'pay_vrr_001',
    transaction_hash: `0x${'ab'.repeat(32)}`,
    block_number: 1,
    timestamp: Math.floor(Date.now() / 1000),
    payer_address: '0x0000000000000000000000000000000000000001',
    recipient_address: '0x000000000000000000000000000000000000dEaD',
    amount: 500,
    asset: 'USDC',
    network: 'base',
    content_id: contentId,
    access_granted: true,
  };
}

function makePaymentService(
  receipt: x402PaymentReceipt = makePaymentReceipt()
): HololandPaymentService {
  return {
    requirePayment(_config): RequestHandler {
      return (req, _res, next) => {
        (req as typeof req & { paymentReceipt?: x402PaymentReceipt }).paymentReceipt = receipt;
        next();
      };
    },
    async facilitatorCallback(_req, res) {
      res.json({ success: true });
    },
    processRevenueSplit(amount, creatorAddress, agentAddress) {
      return {
        creator: { address: creatorAddress, amount: amount * 0.8 },
        platform: { amount: agentAddress ? amount * 0.1 : amount * 0.2 },
        agent: agentAddress ? { address: agentAddress, amount: amount * 0.1 } : null,
      };
    },
  };
}

async function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error('Expected response body to be an object');
}

describe('VRRTwinService', () => {
  it('creates a protocol-published VRR twin with HoloMap captures and a persistent geo anchor', async () => {
    const published: ProtocolPublishInput[] = [];
    const store = new InMemoryVrrTwinStore();
    const service = new VRRTwinService({
      store,
      protocolPublisher: successPublisher(published),
      now: () => new Date('2026-06-21T00:00:00.000Z'),
    });

    const result = await service.create({
      businessId: 'phoenix-brew',
      geoLocation: {
        name: 'Phoenix Brew',
        lat: 33.4484,
        lng: -112.074,
        radius_m: 35,
      },
      manifests: [makeManifest()],
      inventoryApi: 'https://inventory.example.test/phoenix-brew',
      creatorAddress: '0x1234567890123456789012345678901234567890',
      agentAddress: '0x00000000000000000000000000000000000000a1',
    });

    expect(result.twin.id).toBe('vrr_twin_phoenix_brew');
    expect(result.twin.geoAnchor).toMatchObject({
      businessId: 'phoenix-brew',
      lat: 33.4484,
      lng: -112.074,
      radius: 35,
      persistent: true,
    });
    expect(result.twin.geoAnchor.safety.doctrine).toBe('D.044');
    expect(result.twin.captures[0]).toMatchObject({
      worldId: 'holomap-phoenix-brew',
      replayHash: 'replay-phoenix-brew',
      pointCount: 4096,
    });
    expect(result.holoscript).toContain('@vrr_twin');
    expect(result.holoscript).toContain('@holomap_capture');
    expect(result.holoscript).toContain('replay-phoenix-brew');
    expect(published[0]).toMatchObject({
      author: '0x1234567890123456789012345678901234567890',
      license: 'commercial',
      price: '0',
    });
    expect(published[0]?.code).toContain('inventory_sync');
    await expect(store.getTwinByBusinessId('phoenix-brew')).resolves.toMatchObject({
      id: 'vrr_twin_phoenix_brew',
    });
  });

  it('persists twins through the file store and queries by location radius', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vrr-twin-store-'));
    const filePath = path.join(dir, 'twins.json');
    try {
      const service = new VRRTwinService({
        store: new FileVrrTwinStore(filePath),
        protocolPublisher: successPublisher(),
        now: () => new Date('2026-06-21T00:00:00.000Z'),
      });
      await service.create({
        businessId: 'phoenix-brew',
        geoLocation: { lat: 33.4484, lng: -112.074, radiusMeters: 50 },
        manifests: [makeManifest()],
      });

      const reloadedStore = new FileVrrTwinStore(filePath);
      await expect(reloadedStore.getTwinByBusinessId('phoenix-brew')).resolves.toMatchObject({
        id: 'vrr_twin_phoenix_brew',
      });
      await expect(
        reloadedStore.listTwins({ lat: 33.4484, lng: -112.074, radiusMeters: 10 })
      ).resolves.toHaveLength(1);
      await expect(
        reloadedStore.listTwins({ lat: 34.0522, lng: -118.2437, radiusMeters: 10 })
      ).resolves.toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not store a twin when protocol_publish fails', async () => {
    const store = new InMemoryVrrTwinStore();
    const service = new VRRTwinService({
      store,
      protocolPublisher: failingPublisher(),
    });

    await expect(
      service.create({
        businessId: 'phoenix-brew',
        geoLocation: { lat: 33.4484, lng: -112.074 },
        manifests: [makeManifest()],
      })
    ).rejects.toBeInstanceOf(VrrProtocolPublishError);
    await expect(store.listTwins()).resolves.toHaveLength(0);
  });

  it('parses route aliases for captures, creator, agent, and protocol options', () => {
    const input = parseCreateVrrTwinInput({
      business_id: 'phoenix-brew',
      geo_location: { latitude: 33.4484, longitude: -112.074 },
      captures: [{ manifest: makeManifest() }],
      creator_address: '0x1234567890123456789012345678901234567890',
      agent_address: '0x00000000000000000000000000000000000000a1',
      protocol_price_eth: '0.01',
      protocol_license: 'commercial',
      mint_as_nft: true,
    });

    expect(input.businessId).toBe('phoenix-brew');
    expect(input.manifests).toHaveLength(1);
    expect(input.creatorAddress).toBe('0x1234567890123456789012345678901234567890');
    expect(input.agentAddress).toBe('0x00000000000000000000000000000000000000a1');
    expect(input.protocolPriceEth).toBe('0.01');
    expect(input.protocolLicense).toBe('commercial');
    expect(input.mintAsNFT).toBe(true);
  });
});

describe('Hololand VRR routes', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    const closing = server;
    server = undefined;
    await closeServer(closing);
  });

  it('creates, reads, and geo-queries a real stored VRR twin', async () => {
    const service = new VRRTwinService({
      store: new InMemoryVrrTwinStore(),
      protocolPublisher: successPublisher(),
      now: () => new Date('2026-06-21T00:00:00.000Z'),
    });
    const app = express();
    app.use(express.json());
    app.use('/api/v1', createHololandRoutes(makePaymentService(), { vrrTwinService: service }));
    const listener = await listen(app);
    server = listener.server;

    const createResponse = await fetch(`${listener.baseUrl}/api/v1/create-vrr-twin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: 'phoenix-brew',
        geo_location: { name: 'Phoenix Brew', lat: 33.4484, lng: -112.074, radius_m: 35 },
        reconstruction_manifest: makeManifest(),
        inventory_api: 'https://inventory.example.test/phoenix-brew',
        creator_address: '0x1234567890123456789012345678901234567890',
        agent_address: '0x00000000000000000000000000000000000000a1',
      }),
    });
    expect(createResponse.status).toBe(200);
    const createBody = asRecord(await createResponse.json());
    expect(createBody.vrr_twin_id).toBe('vrr_twin_phoenix_brew');
    expect(asRecord(createBody.protocol_publish).status).toBe('success');
    expect(asRecord(createBody.revenue_split).creator).toMatchObject({
      amount: 400,
      address: '0x1234567890123456789012345678901234567890',
    });

    const twinBody = asRecord(createBody.vrr_twin);
    expect(asRecord(twinBody.geo_anchor).persistent).toBe(true);
    expect(twinBody.captures).toHaveLength(1);
    expect(String(createBody.config)).toContain('@reality_mirror');

    const readResponse = await fetch(`${listener.baseUrl}/api/v1/business/phoenix-brew/vrr-twin`);
    expect(readResponse.status).toBe(200);
    const readBody = asRecord(await readResponse.json());
    expect(readBody.vrr_twin_id).toBe('vrr_twin_phoenix_brew');

    const queryResponse = await fetch(
      `${listener.baseUrl}/api/v1/vrr-twins?lat=33.4484&lng=-112.074&radius_m=10`
    );
    expect(queryResponse.status).toBe(200);
    const queryBody = asRecord(await queryResponse.json());
    expect(queryBody.total).toBe(1);
  });

  it('returns 400 for a paid VRR create request without a HoloMap manifest', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/v1',
      createHololandRoutes(makePaymentService(), {
        vrrTwinService: new VRRTwinService({
          store: new InMemoryVrrTwinStore(),
          protocolPublisher: successPublisher(),
        }),
      })
    );
    const listener = await listen(app);
    server = listener.server;

    const response = await fetch(`${listener.baseUrl}/api/v1/create-vrr-twin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: 'phoenix-brew',
        geo_location: { lat: 33.4484, lng: -112.074 },
      }),
    });
    expect(response.status).toBe(400);
    const body = asRecord(await response.json());
    expect(asRecord(body.error).code).toBe('INVALID_VRR_TWIN_INPUT');
  });

  it('returns 502 instead of storing a twin when protocol publishing fails', async () => {
    const service = new VRRTwinService({
      store: new InMemoryVrrTwinStore(),
      protocolPublisher: failingPublisher(),
    });
    const app = express();
    app.use(express.json());
    app.use('/api/v1', createHololandRoutes(makePaymentService(), { vrrTwinService: service }));
    const listener = await listen(app);
    server = listener.server;

    const response = await fetch(`${listener.baseUrl}/api/v1/create-vrr-twin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: 'phoenix-brew',
        geo_location: { lat: 33.4484, lng: -112.074 },
        reconstruction_manifest: makeManifest(),
      }),
    });
    expect(response.status).toBe(502);
    const body = asRecord(await response.json());
    expect(asRecord(body.error).code).toBe('VRR_PROTOCOL_PUBLISH_FAILED');
    await expect(service.query()).resolves.toHaveLength(0);
  });
});
