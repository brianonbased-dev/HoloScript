import {
  type CAELTrace,
  type CAELTraceEntry,
  hashCAELEntry,
  toCAELJSONL,
  verifyCAELHashChain,
} from './CAELTrace';
import { sha256Bytes, type HashMode } from './sha256';

export type TwinPropertyValue =
  | string
  | number
  | boolean
  | null
  | TwinPropertyValue[]
  | { [key: string]: TwinPropertyValue };

export interface TwinDtdlContent {
  '@type': string | readonly string[];
  name: string;
  schema?: unknown;
  target?: string;
  writable?: boolean;
  properties?: readonly TwinDtdlContent[];
}

export interface TwinDtdlInterface {
  '@context': string;
  '@type': 'Interface';
  '@id': string;
  displayName?: string;
  description?: string;
  contents?: readonly TwinDtdlContent[];
}

export interface TwinDtdlBridgeSource {
  compiler: 'DTDLCompiler';
  sourceComposition: string;
  sourceCompositionHash?: string;
  dtdlVersion: 'v3';
  bridgeVersion?: string;
}

export interface TwinNodeInput {
  id: string;
  modelId: string;
  displayName?: string;
  properties?: Record<string, TwinPropertyValue>;
}

export interface TwinNode {
  id: string;
  modelId: string;
  displayName?: string;
  properties: Record<string, TwinPropertyValue>;
  telemetry: Record<string, TwinTelemetrySample[]>;
  createdAt: string;
  updatedAt: string;
}

export interface TwinRelationshipInput {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
  properties?: Record<string, TwinPropertyValue>;
}

export interface TwinRelationship {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
  properties: Record<string, TwinPropertyValue>;
  createdAt: string;
  updatedAt: string;
}

export interface TwinTelemetrySample {
  name: string;
  value: TwinPropertyValue;
  timestamp: string;
  unit?: string;
}

export interface TwinTelemetryBatch {
  twinId: string;
  source: string;
  protocol: 'mqtt-simulator' | 'opcua-simulator' | 'manual';
  receivedAt?: string;
  samples: TwinTelemetrySample[];
}

export interface TwinPropertyPredicate {
  name: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
  value: TwinPropertyValue;
}

export interface TwinRelationshipPredicate {
  twinId?: string;
  direction?: 'out' | 'in' | 'either';
  name?: string;
  sourceId?: string;
  targetId?: string;
}

export interface TwinGraphQuery {
  select: 'twins' | 'relationships' | 'properties' | 'telemetry';
  where?: {
    twinId?: string;
    modelId?: string;
    relationship?: TwinRelationshipPredicate;
    property?: TwinPropertyPredicate;
    telemetryName?: string;
  };
  limit?: number;
}

export interface TwinPropertyRecord {
  twinId: string;
  name: string;
  value: TwinPropertyValue;
}

export interface TwinTelemetryRecord {
  twinId: string;
  source: string;
  protocol: TwinTelemetryBatch['protocol'];
  sample: TwinTelemetrySample;
}

export interface TwinGraphQueryResult {
  twins: TwinNode[];
  relationships: TwinRelationship[];
  properties: TwinPropertyRecord[];
  telemetry: TwinTelemetryRecord[];
  queryReceipt: TwinHistoryReceipt;
}

export interface TwinGraphSnapshot {
  models: TwinDtdlInterface[];
  twins: TwinNode[];
  relationships: TwinRelationship[];
}

export type TwinGraphOperationAction =
  | 'register-models'
  | 'upsert-twin'
  | 'relationship-upsert'
  | 'property-update'
  | 'telemetry-ingress'
  | 'query';

export type TwinGraphOperation =
  | {
      action: 'register-models';
      dtdlInterfaces: TwinDtdlInterface[];
      source: TwinDtdlBridgeSource;
    }
  | { action: 'upsert-twin'; twin: TwinNodeInput; at: string }
  | { action: 'relationship-upsert'; relationship: TwinRelationshipInput; at: string }
  | {
      action: 'property-update';
      twinId: string;
      name: string;
      value: TwinPropertyValue;
      source: string;
      at: string;
    }
  | { action: 'telemetry-ingress'; batch: TwinTelemetryBatch; at: string }
  | {
      action: 'query';
      query: TwinGraphQuery;
      resultSummary: {
        twins: number;
        relationships: number;
        properties: number;
        telemetry: number;
      };
      at: string;
    };

export interface TwinReceiptTriad {
  semanticReceiptId: string;
  provenanceReceiptId: string;
  replayReceiptId: string;
}

export interface TwinCustodyReceipt {
  holokey: string;
  docsUmbrella: 'HoloGate';
  docsUmbrellaRole: 'umbrella term in docs, not an executable tool';
  umbrellaRoute: string;
  concreteTools: readonly string[];
}

export interface TwinHistoryReceipt {
  receiptId: string;
  operation: TwinGraphOperationAction;
  traceIndex: number;
  traceHash: string;
  prevHash: string;
  graphHash: string;
  dtdlInterfaceIds: string[];
  triad: TwinReceiptTriad;
  custody: TwinCustodyReceipt;
}

export interface TwinReplayVerification {
  success: boolean;
  hashChainValid: boolean;
  replayValid: boolean;
  totalEvents: number;
  graphHash: string;
  replayGraphHash?: string;
  brokenAt?: number;
  reason?: string;
  replayReceiptId: string;
}

export interface TwinGraphServiceOptions {
  runId?: string;
  hashMode?: HashMode;
  holokey?: string;
  umbrellaRoute?: string;
  clock?: () => number;
}

export interface IndustrialLineTwinDemoResult {
  service: TwinGraphService;
  receipts: TwinHistoryReceipt[];
  queryResult: TwinGraphQueryResult;
  verification: TwinReplayVerification;
}

interface TwinGraphState {
  models: Map<string, TwinDtdlInterface>;
  twins: Map<string, TwinNode>;
  relationships: Map<string, TwinRelationship>;
}

const DEFAULT_UMBRELLA_ROUTE = 'simulation.digital-twins.dtdl.cael-replay';

const CONCRETE_CUSTODY_TOOLS = [
  'HoloKey',
  'UmbrellaRoute',
  'TriadReceipt',
  'DTDLCompiler',
  'CAELTrace',
] as const;

export class TwinGraphService {
  private readonly runId: string;
  private readonly hashMode: HashMode;
  private readonly holokey: string;
  private readonly umbrellaRoute: string;
  private readonly clock: () => number;
  private readonly state: TwinGraphState = {
    models: new Map(),
    twins: new Map(),
    relationships: new Map(),
  };
  private readonly trace: CAELTrace = [];
  private lastHash = 'cael.genesis';

  constructor(options: TwinGraphServiceOptions = {}) {
    this.hashMode = options.hashMode ?? 'sha256';
    this.runId =
      options.runId ?? `cael:twin-graph:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.holokey = options.holokey ?? 'unassigned-holokey';
    this.umbrellaRoute = options.umbrellaRoute ?? DEFAULT_UMBRELLA_ROUTE;
    this.clock = options.clock ?? (() => Date.now());
    this.appendTrace('init', {
      service: 'twin-graph-service.v1',
      hashMode: this.hashMode,
      custody: this.custody(),
      graphHash: this.graphHash(),
    });
  }

  registerDtdlInterfaces(
    dtdlInterfaces: readonly TwinDtdlInterface[],
    source: TwinDtdlBridgeSource
  ): TwinHistoryReceipt {
    if (dtdlInterfaces.length === 0) {
      throw new Error('[TwinGraphService] registerDtdlInterfaces requires at least one interface.');
    }

    for (const iface of dtdlInterfaces) {
      if (iface['@context'] !== 'dtmi:dtdl:context;3') {
        throw new Error(
          `[TwinGraphService] ${iface['@id']} is not DTDL v3; expected dtmi:dtdl:context;3.`
        );
      }
      this.state.models.set(iface['@id'], cloneJson(iface));
    }

    return this.recordOperation({
      action: 'register-models',
      dtdlInterfaces: dtdlInterfaces.map((iface) => cloneJson(iface)),
      source: cloneJson(source),
    });
  }

  upsertTwin(input: TwinNodeInput): TwinHistoryReceipt {
    if (!this.state.models.has(input.modelId)) {
      throw new Error(`[TwinGraphService] Unknown modelId for twin ${input.id}: ${input.modelId}`);
    }
    const at = this.isoNow();
    const existing = this.state.twins.get(input.id);
    const next: TwinNode = {
      id: input.id,
      modelId: input.modelId,
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      properties: {
        ...(existing?.properties ?? {}),
        ...(input.properties ?? {}),
      },
      telemetry: existing?.telemetry ? cloneJson(existing.telemetry) : {},
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
    this.state.twins.set(input.id, next);
    return this.recordOperation({ action: 'upsert-twin', twin: cloneJson(input), at });
  }

  upsertRelationship(input: TwinRelationshipInput): TwinHistoryReceipt {
    if (!this.state.twins.has(input.sourceId)) {
      throw new Error(`[TwinGraphService] Unknown relationship source twin: ${input.sourceId}`);
    }
    if (!this.state.twins.has(input.targetId)) {
      throw new Error(`[TwinGraphService] Unknown relationship target twin: ${input.targetId}`);
    }

    const at = this.isoNow();
    const existing = this.state.relationships.get(input.id);
    const next: TwinRelationship = {
      id: input.id,
      name: input.name,
      sourceId: input.sourceId,
      targetId: input.targetId,
      properties: {
        ...(existing?.properties ?? {}),
        ...(input.properties ?? {}),
      },
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
    this.state.relationships.set(input.id, next);
    return this.recordOperation({
      action: 'relationship-upsert',
      relationship: cloneJson(input),
      at,
    });
  }

  updateProperty(
    twinId: string,
    name: string,
    value: TwinPropertyValue,
    options: { source: string; at?: string }
  ): TwinHistoryReceipt {
    const twin = this.requireTwin(twinId);
    const at = options.at ?? this.isoNow();
    twin.properties[name] = cloneJson(value);
    twin.updatedAt = at;
    this.state.twins.set(twinId, twin);
    return this.recordOperation({
      action: 'property-update',
      twinId,
      name,
      value: cloneJson(value),
      source: options.source,
      at,
    });
  }

  ingestTelemetry(batch: TwinTelemetryBatch): TwinHistoryReceipt {
    const twin = this.requireTwin(batch.twinId);
    const at = batch.receivedAt ?? this.isoNow();
    const normalized: TwinTelemetryBatch = {
      ...cloneJson(batch),
      receivedAt: at,
      samples: batch.samples.map((sample) => cloneJson(sample)),
    };

    for (const sample of normalized.samples) {
      const stream = twin.telemetry[sample.name] ?? [];
      stream.push(sample);
      twin.telemetry[sample.name] = stream;
      twin.properties[sample.name] = cloneJson(sample.value);
    }
    twin.updatedAt = at;
    this.state.twins.set(batch.twinId, twin);

    return this.recordOperation({ action: 'telemetry-ingress', batch: normalized, at });
  }

  query(query: TwinGraphQuery): TwinGraphQueryResult {
    const twins = this.selectTwins(query);
    const relationships = this.selectRelationships(query);
    const properties = query.select === 'properties' ? this.selectProperties(twins, query) : [];
    const telemetry = query.select === 'telemetry' ? this.selectTelemetry(twins, query) : [];

    const limited: TwinGraphQueryResult = {
      twins: applyLimit(twins, query.limit),
      relationships: applyLimit(relationships, query.limit),
      properties: applyLimit(properties, query.limit),
      telemetry: applyLimit(telemetry, query.limit),
      queryReceipt: this.recordOperation({
        action: 'query',
        query: cloneJson(query),
        resultSummary: {
          twins: twins.length,
          relationships: relationships.length,
          properties: properties.length,
          telemetry: telemetry.length,
        },
        at: this.isoNow(),
      }),
    };

    return cloneJson(limited);
  }

  getSnapshot(): TwinGraphSnapshot {
    return snapshotFromState(this.state);
  }

  getGraphHash(): string {
    return this.graphHash();
  }

  getTrace(): CAELTrace {
    return cloneJson(this.trace);
  }

  toReplayJSONL(): string {
    return toCAELJSONL(this.trace);
  }

  verifyReplay(): TwinReplayVerification {
    const chain = verifyCAELHashChain(this.trace, this.hashMode);
    if (!chain.valid) {
      return {
        success: false,
        hashChainValid: false,
        replayValid: false,
        totalEvents: this.trace.length,
        graphHash: this.graphHash(),
        brokenAt: chain.brokenAt,
        reason: chain.reason,
        replayReceiptId: this.replayReceiptId(),
      };
    }

    const replayState = replayStateFromTrace(this.trace);
    const replayGraphHash = graphHashFromState(replayState);
    const graphHash = this.graphHash();
    const replayValid = replayGraphHash === graphHash;
    return {
      success: replayValid,
      hashChainValid: true,
      replayValid,
      totalEvents: this.trace.length,
      graphHash,
      replayGraphHash,
      ...(replayValid ? {} : { reason: 'Replay graph hash does not match live graph hash.' }),
      replayReceiptId: this.replayReceiptId(),
    };
  }

  private requireTwin(twinId: string): TwinNode {
    const twin = this.state.twins.get(twinId);
    if (!twin) throw new Error(`[TwinGraphService] Unknown twin: ${twinId}`);
    return cloneJson(twin);
  }

  private selectTwins(query: TwinGraphQuery): TwinNode[] {
    if (query.select !== 'twins' && query.select !== 'properties' && query.select !== 'telemetry') {
      return [];
    }
    let twins = [...this.state.twins.values()].map((twin) => cloneJson(twin));
    const where = query.where;
    if (!where) return sortById(twins);

    if (where.twinId) twins = twins.filter((twin) => twin.id === where.twinId);
    if (where.modelId) twins = twins.filter((twin) => twin.modelId === where.modelId);
    if (where.relationship) {
      const ids = relatedTwinIds([...this.state.relationships.values()], where.relationship);
      twins = twins.filter((twin) => ids.has(twin.id));
    }
    if (where.property) {
      const property = where.property;
      twins = twins.filter((twin) => propertyMatches(twin.properties, property));
    }
    if (where.telemetryName) {
      twins = twins.filter((twin) => (twin.telemetry[where.telemetryName ?? ''] ?? []).length > 0);
    }

    return sortById(twins);
  }

  private selectRelationships(query: TwinGraphQuery): TwinRelationship[] {
    if (query.select !== 'relationships') return [];
    let relationships = [...this.state.relationships.values()].map((rel) => cloneJson(rel));
    const relWhere = query.where?.relationship;
    if (!relWhere) return sortById(relationships);

    relationships = relationships.filter((rel) => relationshipMatches(rel, relWhere));
    return sortById(relationships);
  }

  private selectProperties(
    twins: readonly TwinNode[],
    query: TwinGraphQuery
  ): TwinPropertyRecord[] {
    const name = query.where?.property?.name;
    const records: TwinPropertyRecord[] = [];
    for (const twin of twins) {
      for (const [propertyName, value] of Object.entries(twin.properties)) {
        if (name && propertyName !== name) continue;
        records.push({ twinId: twin.id, name: propertyName, value: cloneJson(value) });
      }
    }
    return records.sort((a, b) => `${a.twinId}:${a.name}`.localeCompare(`${b.twinId}:${b.name}`));
  }

  private selectTelemetry(
    twins: readonly TwinNode[],
    query: TwinGraphQuery
  ): TwinTelemetryRecord[] {
    const telemetryName = query.where?.telemetryName;
    const records: TwinTelemetryRecord[] = [];
    for (const twin of twins) {
      for (const [name, samples] of Object.entries(twin.telemetry)) {
        if (telemetryName && name !== telemetryName) continue;
        for (const sample of samples) {
          records.push({
            twinId: twin.id,
            source: 'stored-twin-telemetry',
            protocol: 'manual',
            sample: cloneJson(sample),
          });
        }
      }
    }
    return records.sort((a, b) =>
      `${a.twinId}:${a.sample.name}:${a.sample.timestamp}`.localeCompare(
        `${b.twinId}:${b.sample.name}:${b.sample.timestamp}`
      )
    );
  }

  private recordOperation(operation: TwinGraphOperation): TwinHistoryReceipt {
    const graphHash = this.graphHash();
    const entry = this.appendTrace('interaction', {
      action: operation.action,
      operation,
      graphHash,
      custody: this.custody(),
      dtdlInterfaceIds: this.dtdlInterfaceIds(),
    });
    return this.receiptForEntry(operation.action, entry, graphHash);
  }

  private appendTrace(
    event: CAELTraceEntry['event'],
    payload: Record<string, unknown>
  ): CAELTraceEntry {
    const entryWithoutHash: Omit<CAELTraceEntry, 'hash'> = {
      version: 'cael.v1',
      runId: this.runId,
      index: this.trace.length,
      event,
      timestamp: this.clock(),
      simTime: this.trace.length,
      prevHash: this.lastHash,
      payload: {
        ...payload,
        hashMode: this.hashMode,
      },
    };
    const hash = hashCAELEntry(entryWithoutHash, this.hashMode);
    const entry: CAELTraceEntry = { ...entryWithoutHash, hash };
    this.trace.push(entry);
    this.lastHash = hash;
    return entry;
  }

  private receiptForEntry(
    operation: TwinGraphOperationAction,
    entry: CAELTraceEntry,
    graphHash: string
  ): TwinHistoryReceipt {
    const semanticReceiptId = `twin-semantic-${graphHash.slice(15, 31)}`;
    const provenanceReceiptId = `twin-provenance-${entry.hash.replace(/^cael-sha-/, '').replace(/^cael-/, '')}`;
    const replayReceiptId = this.replayReceiptId();
    const receiptId = stableDigest(
      {
        operation,
        traceHash: entry.hash,
        graphHash,
        triad: [semanticReceiptId, provenanceReceiptId, replayReceiptId],
      },
      'twin-receipt'
    );

    return {
      receiptId,
      operation,
      traceIndex: entry.index,
      traceHash: entry.hash,
      prevHash: entry.prevHash,
      graphHash,
      dtdlInterfaceIds: this.dtdlInterfaceIds(),
      triad: {
        semanticReceiptId,
        provenanceReceiptId,
        replayReceiptId,
      },
      custody: this.custody(),
    };
  }

  private replayReceiptId(): string {
    return stableDigest(
      {
        runId: this.runId,
        traceLength: this.trace.length,
        lastHash: this.lastHash,
        graphHash: this.graphHash(),
      },
      'twin-replay'
    );
  }

  private custody(): TwinCustodyReceipt {
    return {
      holokey: this.holokey,
      docsUmbrella: 'HoloGate',
      docsUmbrellaRole: 'umbrella term in docs, not an executable tool',
      umbrellaRoute: this.umbrellaRoute,
      concreteTools: CONCRETE_CUSTODY_TOOLS,
    };
  }

  private dtdlInterfaceIds(): string[] {
    return [...this.state.models.keys()].sort();
  }

  private graphHash(): string {
    return graphHashFromState(this.state);
  }

  private isoNow(): string {
    return new Date(this.clock()).toISOString();
  }
}

export function runIndustrialLineTwinGraphDemo(options: {
  dtdlInterfaces: readonly TwinDtdlInterface[];
  clock?: () => number;
  holokey?: string;
}): IndustrialLineTwinDemoResult {
  const service = new TwinGraphService({
    runId: 'cael:twin-graph:industrial-line-demo',
    holokey: options.holokey ?? 'openai-codex-cg008-holokey',
    clock: options.clock,
  });

  const receipts: TwinHistoryReceipt[] = [];
  receipts.push(
    service.registerDtdlInterfaces(options.dtdlInterfaces, {
      compiler: 'DTDLCompiler',
      sourceComposition: 'IndustrialLineTwin',
      sourceCompositionHash: stableDigest('IndustrialLineTwin', 'holo-source'),
      dtdlVersion: 'v3',
      bridgeVersion: 'holoscript-dtdl-compiler/v1',
    })
  );

  const lineModelId = modelIdForDisplayName(options.dtdlInterfaces, 'IndustrialLineTwin');
  const pressModelId = modelIdForDisplayName(options.dtdlInterfaces, 'PressCell');
  const conveyorModelId = modelIdForDisplayName(options.dtdlInterfaces, 'ConveyorA');

  receipts.push(
    service.upsertTwin({
      id: 'line-a',
      modelId: lineModelId,
      displayName: 'Industrial line A',
      properties: { site: 'mesa-lab', throughputTarget: 120 },
    })
  );
  receipts.push(
    service.upsertTwin({
      id: 'press-1',
      modelId: pressModelId,
      displayName: 'Press cell 1',
      properties: { temperature: 68.5, vibrationRms: 0.09, status: 'nominal' },
    })
  );
  receipts.push(
    service.upsertTwin({
      id: 'conveyor-a',
      modelId: conveyorModelId,
      displayName: 'Conveyor A',
      properties: { speedMps: 1.8, status: 'nominal' },
    })
  );
  receipts.push(
    service.upsertRelationship({
      id: 'line-a-has-press-1',
      name: 'hasPressCell',
      sourceId: 'line-a',
      targetId: 'press-1',
      properties: { station: 1 },
    })
  );
  receipts.push(
    service.upsertRelationship({
      id: 'line-a-has-conveyor-a',
      name: 'hasConveyor',
      sourceId: 'line-a',
      targetId: 'conveyor-a',
      properties: { station: 2 },
    })
  );
  receipts.push(
    service.updateProperty('press-1', 'status', 'watch', {
      source: 'opcua-simulator://industrial-line-a/press-1/status',
    })
  );
  receipts.push(
    service.ingestTelemetry({
      twinId: 'press-1',
      source: 'mqtt-simulator://industrial-line-a/press-1',
      protocol: 'mqtt-simulator',
      samples: [
        {
          name: 'temperature',
          value: 82.4,
          unit: 'celsius',
          timestamp: '2026-07-01T15:00:00.000Z',
        },
        {
          name: 'vibrationRms',
          value: 0.18,
          unit: 'mm/s',
          timestamp: '2026-07-01T15:00:00.000Z',
        },
      ],
    })
  );

  const queryResult = service.query({
    select: 'twins',
    where: {
      relationship: { twinId: 'line-a', direction: 'out', name: 'hasPressCell' },
      property: { name: 'temperature', operator: 'gte', value: 80 },
    },
  });
  receipts.push(queryResult.queryReceipt);

  return {
    service,
    receipts,
    queryResult,
    verification: service.verifyReplay(),
  };
}

function modelIdForDisplayName(
  dtdlInterfaces: readonly TwinDtdlInterface[],
  displayName: string
): string {
  const iface = dtdlInterfaces.find((candidate) => candidate.displayName === displayName);
  if (!iface) {
    throw new Error(`[TwinGraphService] Missing DTDL interface displayName ${displayName}.`);
  }
  return iface['@id'];
}

function replayStateFromTrace(trace: readonly CAELTraceEntry[]): TwinGraphState {
  const state: TwinGraphState = {
    models: new Map(),
    twins: new Map(),
    relationships: new Map(),
  };

  for (const entry of trace) {
    if (entry.event !== 'interaction') continue;
    const operation = extractOperation(entry);
    applyOperation(state, operation);
  }

  return state;
}

function extractOperation(entry: CAELTraceEntry): TwinGraphOperation {
  const operation = entry.payload.operation;
  if (!isRecord(operation) || typeof operation.action !== 'string') {
    throw new Error(`[TwinGraphService] Trace entry ${entry.index} has no twin graph operation.`);
  }
  return operation as TwinGraphOperation;
}

function applyOperation(state: TwinGraphState, operation: TwinGraphOperation): void {
  switch (operation.action) {
    case 'register-models':
      for (const iface of operation.dtdlInterfaces)
        state.models.set(iface['@id'], cloneJson(iface));
      break;
    case 'upsert-twin': {
      const at = operation.at;
      const existing = state.twins.get(operation.twin.id);
      state.twins.set(operation.twin.id, {
        id: operation.twin.id,
        modelId: operation.twin.modelId,
        ...(operation.twin.displayName !== undefined
          ? { displayName: operation.twin.displayName }
          : {}),
        properties: {
          ...(existing?.properties ?? {}),
          ...(operation.twin.properties ?? {}),
        },
        telemetry: existing?.telemetry ? cloneJson(existing.telemetry) : {},
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      });
      break;
    }
    case 'relationship-upsert': {
      const at = operation.at;
      const existing = state.relationships.get(operation.relationship.id);
      state.relationships.set(operation.relationship.id, {
        id: operation.relationship.id,
        name: operation.relationship.name,
        sourceId: operation.relationship.sourceId,
        targetId: operation.relationship.targetId,
        properties: {
          ...(existing?.properties ?? {}),
          ...(operation.relationship.properties ?? {}),
        },
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      });
      break;
    }
    case 'property-update': {
      const twin = state.twins.get(operation.twinId);
      if (!twin) throw new Error(`[TwinGraphService] Replay missing twin ${operation.twinId}.`);
      twin.properties[operation.name] = cloneJson(operation.value);
      twin.updatedAt = operation.at;
      state.twins.set(operation.twinId, twin);
      break;
    }
    case 'telemetry-ingress': {
      const twin = state.twins.get(operation.batch.twinId);
      if (!twin)
        throw new Error(`[TwinGraphService] Replay missing twin ${operation.batch.twinId}.`);
      for (const sample of operation.batch.samples) {
        const stream = twin.telemetry[sample.name] ?? [];
        stream.push(cloneJson(sample));
        twin.telemetry[sample.name] = stream;
        twin.properties[sample.name] = cloneJson(sample.value);
      }
      twin.updatedAt = operation.at;
      state.twins.set(operation.batch.twinId, twin);
      break;
    }
    case 'query':
      break;
    default:
      assertNever(operation);
  }
}

function snapshotFromState(state: TwinGraphState): TwinGraphSnapshot {
  return {
    models: [...state.models.values()]
      .map((model) => cloneJson(model))
      .sort((a, b) => a['@id'].localeCompare(b['@id'])),
    twins: sortById([...state.twins.values()].map((twin) => cloneJson(twin))),
    relationships: sortById([...state.relationships.values()].map((rel) => cloneJson(rel))),
  };
}

function graphHashFromState(state: TwinGraphState): string {
  return stableDigest(snapshotFromState(state), 'twin-graph');
}

function stableDigest(value: unknown, prefix: string): string {
  const bytes = new TextEncoder().encode(stableStringify(value));
  return `${prefix}-sha-${sha256Bytes(bytes)}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortJson(item));
  if (!isRecord(value)) return value;

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const nested = value[key];
    if (nested !== undefined) out[key] = sortJson(nested);
  }
  return out;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

function applyLimit<T>(items: readonly T[], limit: number | undefined): T[] {
  const copy = [...items];
  return limit === undefined ? copy : copy.slice(0, limit);
}

function relatedTwinIds(
  relationships: readonly TwinRelationship[],
  predicate: TwinRelationshipPredicate
): Set<string> {
  const ids = new Set<string>();
  for (const relationship of relationships) {
    if (!relationshipMatches(relationship, predicate)) continue;
    const direction = predicate.direction ?? 'either';
    if (!predicate.twinId) {
      ids.add(relationship.sourceId);
      ids.add(relationship.targetId);
      continue;
    }
    if (direction === 'out' && relationship.sourceId === predicate.twinId) {
      ids.add(relationship.targetId);
    } else if (direction === 'in' && relationship.targetId === predicate.twinId) {
      ids.add(relationship.sourceId);
    } else if (direction === 'either') {
      if (relationship.sourceId === predicate.twinId) ids.add(relationship.targetId);
      if (relationship.targetId === predicate.twinId) ids.add(relationship.sourceId);
    }
  }
  return ids;
}

function relationshipMatches(
  relationship: TwinRelationship,
  predicate: TwinRelationshipPredicate
): boolean {
  if (predicate.name && relationship.name !== predicate.name) return false;
  if (predicate.sourceId && relationship.sourceId !== predicate.sourceId) return false;
  if (predicate.targetId && relationship.targetId !== predicate.targetId) return false;
  if (!predicate.twinId) return true;
  const direction = predicate.direction ?? 'either';
  if (direction === 'out') return relationship.sourceId === predicate.twinId;
  if (direction === 'in') return relationship.targetId === predicate.twinId;
  return relationship.sourceId === predicate.twinId || relationship.targetId === predicate.twinId;
}

function propertyMatches(
  properties: Record<string, TwinPropertyValue>,
  predicate: TwinPropertyPredicate
): boolean {
  const actual = properties[predicate.name];
  switch (predicate.operator) {
    case 'eq':
      return stableStringify(actual) === stableStringify(predicate.value);
    case 'ne':
      return stableStringify(actual) !== stableStringify(predicate.value);
    case 'gt':
      return numeric(actual) > numeric(predicate.value);
    case 'gte':
      return numeric(actual) >= numeric(predicate.value);
    case 'lt':
      return numeric(actual) < numeric(predicate.value);
    case 'lte':
      return numeric(actual) <= numeric(predicate.value);
    default:
      assertNever(predicate.operator);
  }
}

function numeric(value: TwinPropertyValue | undefined): number {
  if (typeof value !== 'number') {
    throw new Error('[TwinGraphService] Numeric property predicate requires numeric values.');
  }
  return value;
}

function assertNever(value: never): never {
  throw new Error(`[TwinGraphService] Unhandled variant: ${String(value)}`);
}
