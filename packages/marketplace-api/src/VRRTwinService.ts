import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { z } from 'zod';
import type { ReconstructionManifest } from '@holoscript/core/reconstruction';

export type VrrProtocolLicense =
  | 'free'
  | 'cc_by'
  | 'cc_by_sa'
  | 'cc_by_nc'
  | 'commercial'
  | 'exclusive';

export interface VrrGeoLocation {
  lat: number;
  lng: number;
  radiusMeters: number;
  alt?: number;
  accuracyMeters?: number;
  name?: string;
  address?: string;
}

export interface VrrGeoAnchorSafetyEnvelope {
  doctrine: 'D.044';
  targetingUseProhibited: true;
  humanApprovalRequiredForActuation: true;
  permittedUses: string[];
  prohibitedUses: string[];
}

export interface VrrGeoAnchor {
  id: string;
  twinId: string;
  businessId: string;
  lat: number;
  lng: number;
  radius: number;
  persistent: true;
  source: 'business-geo-location';
  safety: VrrGeoAnchorSafetyEnvelope;
  createdAt: string;
  modifiedAt: string;
  alt?: number;
  accuracyMeters?: number;
  name?: string;
  address?: string;
}

export interface VrrCaptureBinding {
  captureId: string;
  worldId: string;
  displayName: string;
  replayHash: string;
  pointCount: number;
  frameCount: number;
  bounds: ReconstructionManifest['bounds'];
  simulationContract: ReconstructionManifest['simulationContract'];
  provenance: ReconstructionManifest['provenance'];
  assets: ReconstructionManifest['assets'];
  weightStrategy: ReconstructionManifest['weightStrategy'];
}

export interface ProtocolPublishInput {
  code: string;
  author: string;
  license?: VrrProtocolLicense;
  price?: string;
  mintAsNFT?: boolean;
}

export interface VrrProtocolPublishReceipt {
  status: string;
  raw: unknown;
  protocolId?: string;
  contentHash?: string;
  collectUrl?: string;
  revenuePreview?: unknown;
  provenance?: unknown;
  error?: string;
  message?: string;
}

export interface ProtocolPublisher {
  publish(input: ProtocolPublishInput): Promise<VrrProtocolPublishReceipt>;
}

export interface VrrTwinRecord {
  id: string;
  businessId: string;
  displayName: string;
  holoscript: string;
  geoAnchor: VrrGeoAnchor;
  captures: VrrCaptureBinding[];
  protocol: VrrProtocolPublishReceipt;
  syncApis: {
    inventory?: string;
  };
  createdAt: string;
  updatedAt: string;
  creatorAddress?: string;
  agentAddress?: string;
}

export interface CreateVrrTwinInput {
  businessId: string;
  geoLocation: unknown;
  manifests: unknown[];
  inventoryApi?: string;
  creatorAddress?: string;
  agentAddress?: string;
  author?: string;
  protocolPriceEth?: string;
  protocolLicense?: VrrProtocolLicense;
  mintAsNFT?: boolean;
}

export interface CreateVrrTwinResult {
  twin: VrrTwinRecord;
  protocolPublish: VrrProtocolPublishReceipt;
  holoscript: string;
}

export interface VrrTwinQuery {
  businessId?: string;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
}

export interface VrrTwinStore {
  saveTwin(record: VrrTwinRecord): Promise<void>;
  getTwinById(twinId: string): Promise<VrrTwinRecord | undefined>;
  getTwinByBusinessId(businessId: string): Promise<VrrTwinRecord | undefined>;
  listTwins(query?: VrrTwinQuery): Promise<VrrTwinRecord[]>;
  close?(): Promise<void>;
}

export class VrrProtocolPublishError extends Error {
  constructor(public readonly receipt: VrrProtocolPublishReceipt) {
    super(receipt.message || receipt.error || 'HoloScript protocol publish failed');
    this.name = 'VrrProtocolPublishError';
  }
}

export class VrrTwinInputError extends Error {
  constructor(
    message: string,
    public readonly issues: string[] = []
  ) {
    super(message);
    this.name = 'VrrTwinInputError';
  }
}

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

const reconstructionManifestSchema = z.object({
  version: z.literal('1.0.0'),
  worldId: z.string().min(1),
  displayName: z.string().min(1),
  pointCount: z.number().int().nonnegative(),
  frameCount: z.number().int().nonnegative(),
  bounds: z.object({
    min: vector3Schema,
    max: vector3Schema,
  }),
  replayHash: z.string().min(1),
  simulationContract: z.object({
    kind: z.literal('holomap.reconstruction.v1'),
    replayFingerprint: z.string().min(1),
    holoScriptBuild: z.string().min(1),
  }),
  provenance: z.object({
    anchorHash: z.string().optional(),
    opentimestampsProof: z.string().optional(),
    baseCalldataTx: z.string().optional(),
    capturedAtIso: z.string().min(1),
  }),
  assets: z.object({
    points: z.string().min(1),
    trajectory: z.string().min(1),
    anchors: z.string().min(1),
    splats: z.string().optional(),
  }),
  weightStrategy: z.enum(['distill', 'fine-tune', 'from-scratch']),
});

const geoLocationSchema = z
  .preprocess(
    (value) => {
      if (!isRecord(value)) return value;
      return {
        lat: value.lat ?? value.latitude,
        lng: value.lng ?? value.lon ?? value.longitude,
        alt: value.alt ?? value.altitude,
        radiusMeters: value.radiusMeters ?? value.radius_m ?? value.radius ?? 50,
        accuracyMeters: value.accuracyMeters ?? value.accuracy_m ?? value.accuracy,
        name: value.name,
        address: value.address,
      };
    },
    z.object({
      lat: z.number(),
      lng: z.number(),
      radiusMeters: z.number().positive().default(50),
      alt: z.number().optional(),
      accuracyMeters: z.number().positive().optional(),
      name: z.string().min(1).optional(),
      address: z.string().min(1).optional(),
    })
  )
  .superRefine((location, ctx) => {
    if (location.lat < -90 || location.lat > 90) {
      ctx.addIssue({ code: 'custom', message: 'Latitude must be between -90 and 90.' });
    }
    if (location.lng < -180 || location.lng > 180) {
      ctx.addIssue({ code: 'custom', message: 'Longitude must be between -180 and 180.' });
    }
  });

const storeStateSchema = z.object({
  version: z.literal(1),
  twins: z.array(z.unknown()),
});

const CREATE_VRR_TWIN_SQL = `
CREATE TABLE IF NOT EXISTS hololand_vrr_twins (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  data        JSONB NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hololand_vrr_twins_business ON hololand_vrr_twins (business_id);
CREATE INDEX IF NOT EXISTS idx_hololand_vrr_twins_lat_lng ON hololand_vrr_twins (lat, lng);
CREATE INDEX IF NOT EXISTS idx_hololand_vrr_twins_updated ON hololand_vrr_twins (updated_at);
`;

export class InMemoryVrrTwinStore implements VrrTwinStore {
  private readonly records = new Map<string, VrrTwinRecord>();

  async saveTwin(record: VrrTwinRecord): Promise<void> {
    this.records.set(record.id, cloneRecord(record));
  }

  async getTwinById(twinId: string): Promise<VrrTwinRecord | undefined> {
    const record = this.records.get(twinId);
    return record ? cloneRecord(record) : undefined;
  }

  async getTwinByBusinessId(businessId: string): Promise<VrrTwinRecord | undefined> {
    const normalized = normalizeBusinessId(businessId);
    const record = Array.from(this.records.values()).find(
      (candidate) => normalizeBusinessId(candidate.businessId) === normalized
    );
    return record ? cloneRecord(record) : undefined;
  }

  async listTwins(query: VrrTwinQuery = {}): Promise<VrrTwinRecord[]> {
    return filterTwins(Array.from(this.records.values()).map(cloneRecord), query);
  }
}

export class FileVrrTwinStore implements VrrTwinStore {
  constructor(private readonly filePath: string = defaultVrrTwinStorePath()) {}

  async saveTwin(record: VrrTwinRecord): Promise<void> {
    const records = await this.readRecords();
    const index = records.findIndex((candidate) => candidate.id === record.id);
    const next = cloneRecord(record);
    if (index >= 0) {
      records[index] = next;
    } else {
      records.push(next);
    }
    await this.writeRecords(records);
  }

  async getTwinById(twinId: string): Promise<VrrTwinRecord | undefined> {
    const records = await this.readRecords();
    const record = records.find((candidate) => candidate.id === twinId);
    return record ? cloneRecord(record) : undefined;
  }

  async getTwinByBusinessId(businessId: string): Promise<VrrTwinRecord | undefined> {
    const normalized = normalizeBusinessId(businessId);
    const records = await this.readRecords();
    const record = records.find(
      (candidate) => normalizeBusinessId(candidate.businessId) === normalized
    );
    return record ? cloneRecord(record) : undefined;
  }

  async listTwins(query: VrrTwinQuery = {}): Promise<VrrTwinRecord[]> {
    return filterTwins(await this.readRecords(), query);
  }

  private async readRecords(): Promise<VrrTwinRecord[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = storeStateSchema.parse(JSON.parse(raw));
      return parsed.twins.map((record) => parseStoredTwin(record));
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return [];
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid VRR twin store JSON at ${this.filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  private async writeRecords(records: VrrTwinRecord[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify({ version: 1, twins: records }, null, 2), 'utf8');
    await rename(tempPath, this.filePath);
  }
}

export class PostgresVrrTwinStore implements VrrTwinStore {
  private readonly pool: Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
    });
    this.ready = this.ensureSchema();
  }

  async saveTwin(record: VrrTwinRecord): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO hololand_vrr_twins (id, business_id, data, lat, lng, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
         business_id = EXCLUDED.business_id,
         data = EXCLUDED.data,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         updated_at = NOW()`,
      [
        record.id,
        record.businessId,
        JSON.stringify(record),
        record.geoAnchor.lat,
        record.geoAnchor.lng,
      ]
    );
  }

  async getTwinById(twinId: string): Promise<VrrTwinRecord | undefined> {
    await this.ready;
    const result = await this.pool.query('SELECT data FROM hololand_vrr_twins WHERE id = $1', [
      twinId,
    ]);
    const row = result.rows[0] as { data?: unknown } | undefined;
    return row?.data ? parseStoredTwin(row.data) : undefined;
  }

  async getTwinByBusinessId(businessId: string): Promise<VrrTwinRecord | undefined> {
    await this.ready;
    const result = await this.pool.query(
      'SELECT data FROM hololand_vrr_twins WHERE business_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [businessId]
    );
    const row = result.rows[0] as { data?: unknown } | undefined;
    return row?.data ? parseStoredTwin(row.data) : undefined;
  }

  async listTwins(query: VrrTwinQuery = {}): Promise<VrrTwinRecord[]> {
    await this.ready;
    const params: unknown[] = [];
    const where: string[] = [];
    if (query.businessId) {
      params.push(query.businessId);
      where.push(`business_id = $${params.length}`);
    }
    const result = await this.pool.query(
      `SELECT data FROM hololand_vrr_twins${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`,
      params
    );
    const records = result.rows.map((row: { data: unknown }) => parseStoredTwin(row.data));
    return filterTwins(records, query);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(CREATE_VRR_TWIN_SQL);
  }
}

export class McpProtocolPublisher implements ProtocolPublisher {
  constructor(
    private readonly serverUrl: string = process.env.HOLOSCRIPT_MCP_URL ||
      process.env.HOLOSCRIPT_SERVER_URL ||
      'https://mcp.holoscript.net',
    private readonly apiKey: string | undefined = process.env.HOLOSCRIPT_MCP_API_KEY ||
      process.env.HOLOSCRIPT_API_KEY
  ) {}

  async publish(input: ProtocolPublishInput): Promise<VrrProtocolPublishReceipt> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
      headers['x-mcp-api-key'] = this.apiKey;
    }

    const response = await fetch(`${this.serverUrl.replace(/\/$/, '')}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `vrr-publish-${Date.now()}`,
        method: 'tools/call',
        params: {
          name: 'holo_protocol_publish',
          arguments: input,
        },
      }),
    });

    const rawText = await response.text();
    const body = parseJsonOrMessage(rawText);

    if (!response.ok) {
      return {
        status: 'error',
        raw: body,
        error: 'PUBLISH_HTTP_FAILED',
        message: `holo_protocol_publish returned HTTP ${response.status}`,
      };
    }

    return normalizeProtocolPublishReceipt(body);
  }
}

export class VRRTwinService {
  private readonly store: VrrTwinStore;
  private readonly protocolPublisher: ProtocolPublisher;
  private readonly now: () => Date;

  constructor(
    options: {
      store?: VrrTwinStore;
      protocolPublisher?: ProtocolPublisher;
      now?: () => Date;
    } = {}
  ) {
    this.store = options.store ?? createDefaultVrrTwinStore();
    this.protocolPublisher = options.protocolPublisher ?? new McpProtocolPublisher();
    this.now = options.now ?? (() => new Date());
  }

  async create(input: CreateVrrTwinInput): Promise<CreateVrrTwinResult> {
    const businessId = assertNonEmptyString(input.businessId, 'businessId');
    const location = parseGeoLocation(input.geoLocation);
    const manifests = input.manifests.map(parseReconstructionManifest);
    if (manifests.length === 0) {
      throw new VrrTwinInputError('At least one HoloMap ReconstructionManifest is required.', [
        'reconstruction_manifest',
      ]);
    }

    const existing = await this.store.getTwinByBusinessId(businessId);
    const twinId = `vrr_twin_${slugifyVrrId(businessId)}`;
    const nowIso = this.now().toISOString();
    const createdAt = existing?.createdAt ?? nowIso;
    const captures = manifests.map(toCaptureBinding);
    const geoAnchor = buildGeoAnchor({
      twinId,
      businessId,
      location,
      captures,
      createdAt: existing?.geoAnchor.createdAt ?? nowIso,
      modifiedAt: nowIso,
    });

    const draft: Omit<VrrTwinRecord, 'protocol'> = {
      id: twinId,
      businessId,
      displayName: location.name ?? `${businessId} VRR Twin`,
      holoscript: '',
      geoAnchor,
      captures,
      syncApis: {},
      createdAt,
      updatedAt: nowIso,
    };
    if (input.inventoryApi) draft.syncApis.inventory = input.inventoryApi;
    if (input.creatorAddress) draft.creatorAddress = input.creatorAddress;
    if (input.agentAddress) draft.agentAddress = input.agentAddress;

    const holoscript = buildVrrTwinHoloScript(draft);
    const protocolPublish = await this.protocolPublisher.publish({
      code: holoscript,
      author: protocolAuthorFor(input),
      license: input.protocolLicense ?? 'commercial',
      price: input.protocolPriceEth ?? '0',
      mintAsNFT: input.mintAsNFT ?? false,
    });

    if (!isProtocolPublishSuccess(protocolPublish)) {
      throw new VrrProtocolPublishError(protocolPublish);
    }

    const record: VrrTwinRecord = {
      ...draft,
      holoscript,
      protocol: protocolPublish,
    };
    await this.store.saveTwin(record);

    return { twin: cloneRecord(record), protocolPublish, holoscript };
  }

  async getByBusinessId(businessId: string): Promise<VrrTwinRecord | undefined> {
    return this.store.getTwinByBusinessId(businessId);
  }

  async getById(twinId: string): Promise<VrrTwinRecord | undefined> {
    return this.store.getTwinById(twinId);
  }

  async query(query: VrrTwinQuery = {}): Promise<VrrTwinRecord[]> {
    return this.store.listTwins(query);
  }
}

export function parseCreateVrrTwinInput(body: unknown): CreateVrrTwinInput {
  if (!isRecord(body)) {
    throw new VrrTwinInputError('Request body must be a JSON object.');
  }

  const businessId = stringField(body, 'business_id') ?? stringField(body, 'businessId');
  if (!businessId) {
    throw new VrrTwinInputError('business_id is required.', ['business_id']);
  }

  const geoLocation = body.geo_location ?? body.geoLocation;
  if (!geoLocation) {
    throw new VrrTwinInputError('geo_location with lat/lng is required.', ['geo_location']);
  }

  const inventoryApi = stringField(body, 'inventory_api') ?? stringField(body, 'inventoryApi');
  const creatorAddress =
    stringField(body, 'creator_address') ?? stringField(body, 'creatorAddress');
  const agentAddress = stringField(body, 'agent_address') ?? stringField(body, 'agentAddress');
  const author = stringField(body, 'author');
  const protocolPriceEth =
    stringField(body, 'protocol_price_eth') ?? stringField(body, 'protocolPriceEth');
  const protocolLicenseValue = body.protocol_license ?? body.protocolLicense;
  const mintAsNFTValue = body.mint_as_nft ?? body.mintAsNFT;

  const input: CreateVrrTwinInput = {
    businessId,
    geoLocation,
    manifests: extractManifestInputs(body),
  };
  if (inventoryApi) input.inventoryApi = inventoryApi;
  if (creatorAddress) input.creatorAddress = creatorAddress;
  if (agentAddress) input.agentAddress = agentAddress;
  if (author) input.author = author;
  if (protocolPriceEth) input.protocolPriceEth = protocolPriceEth;
  if (isVrrProtocolLicense(protocolLicenseValue)) input.protocolLicense = protocolLicenseValue;
  if (typeof mintAsNFTValue === 'boolean') input.mintAsNFT = mintAsNFTValue;
  return input;
}

export function createDefaultVrrTwinStore(): VrrTwinStore {
  if (process.env.DATABASE_URL) return new PostgresVrrTwinStore(process.env.DATABASE_URL);
  return new FileVrrTwinStore();
}

export function buildVrrTwinHoloScript(
  record: Omit<VrrTwinRecord, 'protocol'> | VrrTwinRecord
): string {
  const slug = slugifyVrrId(record.businessId);
  const anchor = record.geoAnchor;
  const captureBlocks = record.captures
    .map(
      (capture) => `    object "${capture.captureId}" @holomap_capture {
      world_id: ${quote(capture.worldId)}
      replay_hash: ${quote(capture.replayHash)}
      points: ${capture.pointCount}
      frames: ${capture.frameCount}
      bounds: { min: ${tuple(capture.bounds.min)}, max: ${tuple(capture.bounds.max)} }
      provenance_anchor: ${quote(capture.provenance.anchorHash ?? 'self-attested')}
    }`
    )
    .join('\n');

  const inventory = record.syncApis.inventory
    ? `\n    inventory_sync: { endpoint: ${quote(record.syncApis.inventory)} }`
    : '';

  return `composition "vrr_twin_${slug}" {
  zone#${slug} @vrr_twin @reality_mirror @x402_paywall {
    business_id: ${quote(record.businessId)}
    twin_id: ${quote(record.id)}
    payment: { price_usdc: 500, asset: "USDC", network: "base" }
    geo_anchor: {
      id: ${quote(anchor.id)}
      lat: ${anchor.lat}
      lng: ${anchor.lng}
      radius_m: ${anchor.radius}
      persistent: true
      safety: ${quote(anchor.safety.doctrine)}
    }${inventory}
${captureBlocks}
  }
}`;
}

export function defaultVrrTwinStorePath(): string {
  return (
    process.env.HOLOLAND_VRR_TWIN_STORE_PATH ||
    process.env.VRR_TWIN_STORE_PATH ||
    path.join(homedir(), '.holoscript', 'hololand-vrr-twins.json')
  );
}

function extractManifestInputs(body: Record<string, unknown>): unknown[] {
  const candidates = [
    body.reconstruction_manifest,
    body.reconstructionManifest,
    body.reconstruction_manifests,
    body.reconstructionManifests,
    body.holomap_captures,
    body.holomapCaptures,
    body.captures,
  ].filter((value) => value !== undefined && value !== null);

  const manifests = candidates.flatMap((candidate) =>
    Array.isArray(candidate) ? candidate : [candidate]
  );
  return manifests.map(unwrapManifestCandidate);
}

function unwrapManifestCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  return (
    candidate.manifest ??
    candidate.reconstruction_manifest ??
    candidate.reconstructionManifest ??
    candidate
  );
}

function parseGeoLocation(value: unknown): VrrGeoLocation {
  const parsed = geoLocationSchema.safeParse(value);
  if (!parsed.success) {
    throw new VrrTwinInputError(
      'geo_location must include finite lat/lng coordinates.',
      parsed.error.issues.map((issue) => issue.message)
    );
  }
  return parsed.data;
}

function parseReconstructionManifest(value: unknown): ReconstructionManifest {
  const parsed = reconstructionManifestSchema.safeParse(value);
  if (!parsed.success) {
    throw new VrrTwinInputError(
      'Invalid HoloMap ReconstructionManifest.',
      parsed.error.issues.map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`)
    );
  }
  return parsed.data as ReconstructionManifest;
}

function toCaptureBinding(manifest: ReconstructionManifest): VrrCaptureBinding {
  return {
    captureId: `capture_${hashStable({
      worldId: manifest.worldId,
      replayHash: manifest.replayHash,
    }).slice(0, 12)}`,
    worldId: manifest.worldId,
    displayName: manifest.displayName,
    replayHash: manifest.replayHash,
    pointCount: manifest.pointCount,
    frameCount: manifest.frameCount,
    bounds: manifest.bounds,
    simulationContract: manifest.simulationContract,
    provenance: manifest.provenance,
    assets: manifest.assets,
    weightStrategy: manifest.weightStrategy,
  };
}

function buildGeoAnchor(input: {
  twinId: string;
  businessId: string;
  location: VrrGeoLocation;
  captures: VrrCaptureBinding[];
  createdAt: string;
  modifiedAt: string;
}): VrrGeoAnchor {
  const anchorId = `geo_anchor_${hashStable({
    twinId: input.twinId,
    lat: input.location.lat,
    lng: input.location.lng,
    captures: input.captures.map((capture) => capture.replayHash),
  }).slice(0, 12)}`;
  const anchor: VrrGeoAnchor = {
    id: anchorId,
    twinId: input.twinId,
    businessId: input.businessId,
    lat: input.location.lat,
    lng: input.location.lng,
    radius: input.location.radiusMeters,
    persistent: true,
    source: 'business-geo-location',
    safety: buildGeoAnchorSafetyEnvelope(),
    createdAt: input.createdAt,
    modifiedAt: input.modifiedAt,
  };
  if (input.location.alt !== undefined) anchor.alt = input.location.alt;
  if (input.location.accuracyMeters !== undefined) {
    anchor.accuracyMeters = input.location.accuracyMeters;
  }
  if (input.location.name) anchor.name = input.location.name;
  if (input.location.address) anchor.address = input.location.address;
  return anchor;
}

function buildGeoAnchorSafetyEnvelope(): VrrGeoAnchorSafetyEnvelope {
  return {
    doctrine: 'D.044',
    targetingUseProhibited: true,
    humanApprovalRequiredForActuation: true,
    permittedUses: ['world-locking', 'navigation', 'provenance', 'place-based-quest'],
    prohibitedUses: ['targeting', 'weapon-guidance', 'surveillance-target-selection'],
  };
}

function protocolAuthorFor(input: CreateVrrTwinInput): string {
  const raw = input.author ?? input.creatorAddress ?? input.businessId;
  return raw.startsWith('0x') ? raw : slugifyVrrId(raw);
}

function normalizeProtocolPublishReceipt(body: unknown): VrrProtocolPublishReceipt {
  const payload = unwrapProtocolPayload(body);
  const status =
    stringField(payload, 'status') ?? (payload.success === true ? 'success' : 'unknown');
  const provenance = isRecord(payload.provenance) ? payload.provenance : undefined;
  const provenanceHash = provenance ? stringField(provenance, 'hash') : undefined;
  const receipt: VrrProtocolPublishReceipt = {
    status,
    raw: body,
  };
  const protocolId =
    stringField(payload, 'protocolId') ??
    stringField(payload, 'protocol_id') ??
    stringField(payload, 'id');
  const contentHash =
    stringField(payload, 'contentHash') ??
    stringField(payload, 'content_hash') ??
    stringField(payload, 'hash') ??
    provenanceHash;
  const collectUrl =
    stringField(payload, 'collectUrl') ??
    stringField(payload, 'collect_url') ??
    stringField(payload, 'url');
  const error = stringField(payload, 'error');
  const message = stringField(payload, 'message');
  if (protocolId) receipt.protocolId = protocolId;
  if (contentHash) receipt.contentHash = contentHash;
  if (collectUrl) receipt.collectUrl = collectUrl;
  if (payload.revenuePreview !== undefined) receipt.revenuePreview = payload.revenuePreview;
  if (payload.provenance !== undefined) receipt.provenance = payload.provenance;
  if (error) receipt.error = error;
  if (message) receipt.message = message;
  return receipt;
}

function unwrapProtocolPayload(body: unknown): Record<string, unknown> {
  const root = isRecord(body) ? body : {};
  const result = isRecord(root.result) ? root.result : root;
  const content = Array.isArray(result.content) ? result.content : undefined;
  if (content) {
    for (const entry of content) {
      if (!isRecord(entry) || typeof entry.text !== 'string') continue;
      try {
        const parsed = JSON.parse(entry.text) as unknown;
        if (isRecord(parsed)) return parsed;
      } catch {
        return { status: 'error', message: entry.text };
      }
    }
  }
  return result;
}

function isProtocolPublishSuccess(receipt: VrrProtocolPublishReceipt): boolean {
  return receipt.status === 'success';
}

function parseStoredTwin(value: unknown): VrrTwinRecord {
  if (!isRecord(value)) throw new Error('Stored VRR twin is not an object.');
  const captures = Array.isArray(value.captures)
    ? value.captures.map((capture) => capture as VrrCaptureBinding)
    : [];
  const geoAnchor = value.geoAnchor as VrrGeoAnchor | undefined;
  const protocol = value.protocol as VrrProtocolPublishReceipt | undefined;
  if (
    typeof value.id !== 'string' ||
    typeof value.businessId !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.holoscript !== 'string' ||
    !geoAnchor ||
    !protocol ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('Stored VRR twin is missing required fields.');
  }
  const syncApis: VrrTwinRecord['syncApis'] = {};
  if (isRecord(value.syncApis) && typeof value.syncApis.inventory === 'string') {
    syncApis.inventory = value.syncApis.inventory;
  }
  const record: VrrTwinRecord = {
    id: value.id,
    businessId: value.businessId,
    displayName: value.displayName,
    holoscript: value.holoscript,
    geoAnchor,
    captures,
    protocol,
    syncApis,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
  if (typeof value.creatorAddress === 'string') record.creatorAddress = value.creatorAddress;
  if (typeof value.agentAddress === 'string') record.agentAddress = value.agentAddress;
  return record;
}

function filterTwins(records: VrrTwinRecord[], query: VrrTwinQuery): VrrTwinRecord[] {
  const normalizedBusinessId = query.businessId ? normalizeBusinessId(query.businessId) : undefined;
  return records.filter((record) => {
    if (normalizedBusinessId && normalizeBusinessId(record.businessId) !== normalizedBusinessId) {
      return false;
    }
    if (
      typeof query.lat === 'number' &&
      typeof query.lng === 'number' &&
      typeof query.radiusMeters === 'number'
    ) {
      return (
        geoDistanceMeters(
          { lat: query.lat, lng: query.lng },
          { lat: record.geoAnchor.lat, lng: record.geoAnchor.lng }
        ) <= query.radiusMeters
      );
    }
    return true;
  });
}

function geoDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const earthRadiusMeters = 6371000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
}

function cloneRecord(record: VrrTwinRecord): VrrTwinRecord {
  return JSON.parse(JSON.stringify(record)) as VrrTwinRecord;
}

function hashStable(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function normalizeBusinessId(value: string): string {
  return value.trim().toLowerCase();
}

function slugifyVrrId(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return slug || 'unnamed';
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new VrrTwinInputError(`${fieldName} must be a non-empty string.`, [fieldName]);
  }
  return value.trim();
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function tuple(value: readonly [number, number, number]): string {
  return `[${value.map((item) => Number(item.toFixed(6))).join(', ')}]`;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseJsonOrMessage(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isVrrProtocolLicense(value: unknown): value is VrrProtocolLicense {
  return (
    value === 'free' ||
    value === 'cc_by' ||
    value === 'cc_by_sa' ||
    value === 'cc_by_nc' ||
    value === 'commercial' ||
    value === 'exclusive'
  );
}
