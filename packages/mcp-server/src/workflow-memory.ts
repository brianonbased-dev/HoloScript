/**
 * WorkflowMemory - durable Loro CRDT memory scoped to one workflow run.
 *
 * The MCP workflow engine is synchronous today, but multi-agent workflows often
 * span process/session boundaries. This store gives every run a named Loro doc
 * backed by a snapshot file so agents can share intermediate facts without
 * relying on the in-memory execute() context.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LoroDoc } from 'loro-crdt';

export type WorkflowMemoryValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'any';

export interface WorkflowMemoryFieldSchema {
  type: WorkflowMemoryValueType;
  description?: string;
  required?: boolean;
}

export type WorkflowMemorySchema = Record<string, WorkflowMemoryFieldSchema | WorkflowMemoryValueType>;

export interface WorkflowMemoryConfig {
  enabled?: boolean;
  runId?: string;
  schema?: WorkflowMemorySchema;
  assignedAgentIds?: string[];
  gcOnCompletion?: boolean;
  retentionMs?: number;
}

export interface WorkflowMemoryEntry {
  key: string;
  value: unknown;
  valueType: WorkflowMemoryValueType;
  schemaType: WorkflowMemoryValueType;
  writerAgentId: string;
  updatedAt: string;
  operationId: string;
  sequence: number;
}

export interface WorkflowMemoryEvent {
  id: string;
  type: 'write' | 'complete';
  key?: string;
  writerAgentId: string;
  at: string;
  sequence: number;
}

interface PersistedWorkflowMemory {
  schemaVersion: 'holoscript.workflow-memory.v1';
  workflowRunId: string;
  snapshotBase64: string;
  schema: WorkflowMemorySchema;
  assignedAgentIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WorkflowMemoryReadResult {
  success: true;
  workflowRunId: string;
  key?: string;
  entries: Record<string, WorkflowMemoryEntry>;
  entry?: WorkflowMemoryEntry;
  totalKeys: number;
  snapshotBase64?: string;
  persisted: boolean;
  storePath: string;
}

function defaultMemoryDir(): string {
  return (
    process.env.HOLOSCRIPT_WORKFLOW_MEMORY_DIR ||
    path.join(process.env.HOLOSCRIPT_CACHE_DIR || path.join(os.homedir(), '.holoscript'), 'workflow-memory')
  );
}

function safeRunId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('workflowRunId is required and must be a non-empty string.');
  }
  const runId = value.trim();
  if (runId.length > 160) throw new Error('workflowRunId must be 160 characters or fewer.');
  if (!/^[A-Za-z0-9._:@/-]+$/.test(runId)) {
    throw new Error('workflowRunId contains unsupported characters.');
  }
  return runId;
}

function safeKey(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('key is required and must be a non-empty string.');
  }
  const key = value.trim();
  if (key.length > 160) throw new Error('key must be 160 characters or fewer.');
  if (!/^[A-Za-z0-9._:@/-]+$/.test(key)) {
    throw new Error('key contains unsupported characters.');
  }
  return key;
}

function safeAgentId(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'unknown-agent';
}

function valueType(value: unknown): WorkflowMemoryValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return type;
  if (type === 'object') return 'object';
  throw new Error(`Unsupported workflow memory value type: ${type}`);
}

function normalizeSchema(schema?: WorkflowMemorySchema): WorkflowMemorySchema {
  const normalized: WorkflowMemorySchema = {};
  for (const [key, raw] of Object.entries(schema ?? {})) {
    const safe = safeKey(key);
    if (typeof raw === 'string') {
      normalized[safe] = raw;
    } else if (raw && typeof raw === 'object') {
      normalized[safe] = {
        type: raw.type ?? 'any',
        description: raw.description,
        required: raw.required === true,
      };
    }
  }
  return normalized;
}

function schemaTypeFor(schema: WorkflowMemorySchema, key: string): WorkflowMemoryValueType {
  const raw = schema[key];
  if (!raw) return 'any';
  return typeof raw === 'string' ? raw : raw.type;
}

function assertSchemaValue(schema: WorkflowMemorySchema, key: string, value: unknown): WorkflowMemoryValueType {
  const actual = valueType(value);
  const expected = schemaTypeFor(schema, key);
  if (expected !== 'any' && expected !== actual) {
    throw new Error(`workflow memory key "${key}" expects ${expected}, got ${actual}.`);
  }
  return actual;
}

function assertJsonSerializable(value: unknown): void {
  try {
    JSON.stringify(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`workflow memory value must be JSON-serializable: ${message}`);
  }
}

function parseJsonRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  return raw as Record<string, string>;
}

function encodeSnapshot(doc: LoroDoc): string {
  return Buffer.from(doc.export({ mode: 'snapshot' })).toString('base64');
}

function importSnapshot(doc: LoroDoc, snapshotBase64: string): void {
  if (!snapshotBase64) return;
  doc.import(new Uint8Array(Buffer.from(snapshotBase64, 'base64')));
}

function operationId(workflowRunId: string, key: string, sequence: number, value: unknown): string {
  const digest = createHash('sha256')
    .update(workflowRunId)
    .update('\0')
    .update(key)
    .update('\0')
    .update(String(sequence))
    .update('\0')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 16);
  return `wmem_${sequence}_${digest}`;
}

function fileStem(workflowRunId: string): string {
  const slug = workflowRunId.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 72) || 'workflow';
  const digest = createHash('sha256').update(workflowRunId).digest('hex').slice(0, 12);
  return `${slug}_${digest}.json`;
}

export class WorkflowMemoryDocument {
  readonly workflowRunId: string;
  readonly storePath: string;

  private doc: LoroDoc;
  private schema: WorkflowMemorySchema;
  private assignedAgentIds: string[];
  private createdAt: string;
  private updatedAt: string;
  private completedAt?: string;

  constructor(
    workflowRunId: string,
    storePath: string,
    options: { schema?: WorkflowMemorySchema; assignedAgentIds?: string[] } = {}
  ) {
    this.workflowRunId = safeRunId(workflowRunId);
    this.storePath = storePath;
    this.doc = new LoroDoc();
    this.schema = normalizeSchema(options.schema);
    this.assignedAgentIds = [...new Set(options.assignedAgentIds ?? [])];
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.doc.getMap('entries');
    this.doc.getList('events');
  }

  static load(
    workflowRunId: string,
    storePath: string,
    persisted: PersistedWorkflowMemory,
    options: { schema?: WorkflowMemorySchema; assignedAgentIds?: string[] } = {}
  ): WorkflowMemoryDocument {
    const memory = new WorkflowMemoryDocument(workflowRunId, storePath, {
      schema: { ...persisted.schema, ...normalizeSchema(options.schema) },
      assignedAgentIds: [...persisted.assignedAgentIds, ...(options.assignedAgentIds ?? [])],
    });
    importSnapshot(memory.doc, persisted.snapshotBase64);
    memory.createdAt = persisted.createdAt;
    memory.updatedAt = persisted.updatedAt;
    memory.completedAt = persisted.completedAt;
    return memory;
  }

  configure(options: { schema?: WorkflowMemorySchema; assignedAgentIds?: string[] } = {}): void {
    this.schema = { ...this.schema, ...normalizeSchema(options.schema) };
    this.assignedAgentIds = [
      ...new Set([...this.assignedAgentIds, ...(options.assignedAgentIds ?? [])]),
    ];
  }

  write(keyInput: unknown, value: unknown, writerAgentIdInput?: unknown): WorkflowMemoryEntry {
    const key = safeKey(keyInput);
    const writerAgentId = safeAgentId(writerAgentIdInput);
    this.assertWriter(writerAgentId);
    assertJsonSerializable(value);
    const actualType = assertSchemaValue(this.schema, key, value);

    const events = this.doc.getList('events');
    const sequence = events.length + 1;
    const updatedAt = new Date().toISOString();
    const entry: WorkflowMemoryEntry = {
      key,
      value,
      valueType: actualType,
      schemaType: schemaTypeFor(this.schema, key),
      writerAgentId,
      updatedAt,
      operationId: operationId(this.workflowRunId, key, sequence, value),
      sequence,
    };

    this.doc.getMap('entries').set(key, JSON.stringify(entry));
    const event: WorkflowMemoryEvent = {
      id: entry.operationId,
      type: 'write',
      key,
      writerAgentId,
      at: updatedAt,
      sequence,
    };
    events.insert(events.length, JSON.stringify(event));
    this.doc.commit();
    this.updatedAt = updatedAt;
    return entry;
  }

  read(keyInput?: unknown): WorkflowMemoryReadResult {
    const entries = this.entries();
    if (keyInput !== undefined) {
      const key = safeKey(keyInput);
      return {
        success: true,
        workflowRunId: this.workflowRunId,
        key,
        entries: entries[key] ? { [key]: entries[key] } : {},
        entry: entries[key],
        totalKeys: entries[key] ? 1 : 0,
        persisted: fs.existsSync(this.storePath),
        storePath: this.storePath,
      };
    }
    return {
      success: true,
      workflowRunId: this.workflowRunId,
      entries,
      totalKeys: Object.keys(entries).length,
      persisted: fs.existsSync(this.storePath),
      storePath: this.storePath,
    };
  }

  subscribe(sinceCursorInput?: unknown, includeSnapshot = false): Record<string, unknown> {
    const sinceCursor =
      typeof sinceCursorInput === 'number' && Number.isFinite(sinceCursorInput)
        ? Math.max(0, Math.floor(sinceCursorInput))
        : 0;
    const events = this.events().filter((event) => event.sequence > sinceCursor);
    const nextCursor = events.length > 0 ? events[events.length - 1].sequence : sinceCursor;
    return {
      success: true,
      workflowRunId: this.workflowRunId,
      subscriptionId: `wmem_sub_${createHash('sha1')
        .update(`${this.workflowRunId}:${sinceCursor}`)
        .digest('hex')
        .slice(0, 12)}`,
      mode: 'cursor',
      subscribeUrl: `workflow-memory://${encodeURIComponent(this.workflowRunId)}?cursor=${nextCursor}`,
      cursor: sinceCursor,
      nextCursor,
      events,
      eventCount: events.length,
      ...(includeSnapshot ? { snapshotBase64: this.exportSnapshotBase64() } : {}),
    };
  }

  complete(writerAgentIdInput?: unknown): Record<string, unknown> {
    const writerAgentId = safeAgentId(writerAgentIdInput);
    const events = this.doc.getList('events');
    const sequence = events.length + 1;
    const at = new Date().toISOString();
    const event: WorkflowMemoryEvent = {
      id: operationId(this.workflowRunId, '__complete__', sequence, at),
      type: 'complete',
      writerAgentId,
      at,
      sequence,
    };
    events.insert(events.length, JSON.stringify(event));
    this.doc.commit();
    this.updatedAt = at;
    this.completedAt = at;
    return {
      workflowRunId: this.workflowRunId,
      completedAt: at,
      finalSnapshotBase64: this.exportSnapshotBase64(),
      finalEventCursor: sequence,
      totalKeys: Object.keys(this.entries()).length,
    };
  }

  exportSnapshotBase64(): string {
    return encodeSnapshot(this.doc);
  }

  toPersisted(): PersistedWorkflowMemory {
    return {
      schemaVersion: 'holoscript.workflow-memory.v1',
      workflowRunId: this.workflowRunId,
      snapshotBase64: this.exportSnapshotBase64(),
      schema: this.schema,
      assignedAgentIds: this.assignedAgentIds,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
    };
  }

  private entries(): Record<string, WorkflowMemoryEntry> {
    const raw = parseJsonRecord(this.doc.getMap('entries').toJSON());
    const entries: Record<string, WorkflowMemoryEntry> = {};
    for (const [key, value] of Object.entries(raw)) {
      entries[key] = JSON.parse(value) as WorkflowMemoryEntry;
    }
    return entries;
  }

  private events(): WorkflowMemoryEvent[] {
    const list = this.doc.getList('events');
    const events: WorkflowMemoryEvent[] = [];
    for (let index = 0; index < list.length; index += 1) {
      const raw = list.get(index);
      if (typeof raw === 'string') events.push(JSON.parse(raw) as WorkflowMemoryEvent);
    }
    return events;
  }

  private assertWriter(writerAgentId: string): void {
    if (writerAgentId === 'execute_workflow' || writerAgentId === 'system') return;
    if (this.assignedAgentIds.length === 0) return;
    if (!this.assignedAgentIds.includes(writerAgentId)) {
      throw new Error(`agent "${writerAgentId}" is not assigned to workflow "${this.workflowRunId}".`);
    }
  }
}

export class WorkflowMemoryStore {
  private cache = new Map<string, WorkflowMemoryDocument>();

  constructor(private readonly rootDir = defaultMemoryDir()) {}

  open(
    workflowRunIdInput: unknown,
    options: { schema?: WorkflowMemorySchema; assignedAgentIds?: string[] } = {}
  ): WorkflowMemoryDocument {
    const workflowRunId = safeRunId(workflowRunIdInput);
    const storePath = this.pathFor(workflowRunId);
    const cached = this.cache.get(workflowRunId);
    if (cached) {
      cached.configure(options);
      return cached;
    }

    let document: WorkflowMemoryDocument;
    if (fs.existsSync(storePath)) {
      const persisted = JSON.parse(fs.readFileSync(storePath, 'utf8')) as PersistedWorkflowMemory;
      document = WorkflowMemoryDocument.load(workflowRunId, storePath, persisted, options);
    } else {
      document = new WorkflowMemoryDocument(workflowRunId, storePath, options);
    }
    this.cache.set(workflowRunId, document);
    return document;
  }

  write(args: {
    workflowRunId: unknown;
    key: unknown;
    value: unknown;
    writerAgentId?: unknown;
    schema?: WorkflowMemorySchema;
    assignedAgentIds?: string[];
  }): { success: true; workflowRunId: string; entry: WorkflowMemoryEntry; storePath: string } {
    const document = this.open(args.workflowRunId, {
      schema: args.schema,
      assignedAgentIds: args.assignedAgentIds,
    });
    const entry = document.write(args.key, args.value, args.writerAgentId);
    this.persist(document);
    return {
      success: true,
      workflowRunId: document.workflowRunId,
      entry,
      storePath: document.storePath,
    };
  }

  read(args: {
    workflowRunId: unknown;
    key?: unknown;
    includeSnapshot?: boolean;
  }): WorkflowMemoryReadResult {
    const document = this.open(args.workflowRunId);
    const result = document.read(args.key);
    return args.includeSnapshot
      ? { ...result, snapshotBase64: document.exportSnapshotBase64() }
      : result;
  }

  subscribe(args: {
    workflowRunId: unknown;
    sinceCursor?: unknown;
    includeSnapshot?: boolean;
  }): Record<string, unknown> {
    const document = this.open(args.workflowRunId);
    return document.subscribe(args.sinceCursor, args.includeSnapshot === true);
  }

  complete(args: {
    workflowRunId: unknown;
    writerAgentId?: unknown;
    gc?: boolean;
  }): Record<string, unknown> {
    const document = this.open(args.workflowRunId);
    const result = document.complete(args.writerAgentId);
    this.persist(document);
    if (args.gc !== false) this.gc(document.workflowRunId);
    return { success: true, ...result, gc: args.gc !== false };
  }

  persist(document: WorkflowMemoryDocument): void {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(document.storePath, `${JSON.stringify(document.toPersisted(), null, 2)}\n`);
  }

  gc(workflowRunIdInput: unknown): boolean {
    const workflowRunId = safeRunId(workflowRunIdInput);
    this.cache.delete(workflowRunId);
    const storePath = this.pathFor(workflowRunId);
    if (fs.existsSync(storePath)) {
      fs.rmSync(storePath, { force: true });
      return true;
    }
    return false;
  }

  pathFor(workflowRunIdInput: unknown): string {
    const workflowRunId = safeRunId(workflowRunIdInput);
    return path.join(this.rootDir, fileStem(workflowRunId));
  }
}

let defaultStore: WorkflowMemoryStore | null = null;

export function getWorkflowMemoryStore(): WorkflowMemoryStore {
  if (!defaultStore) defaultStore = new WorkflowMemoryStore();
  return defaultStore;
}

export function setWorkflowMemoryStoreForTest(store: WorkflowMemoryStore | null): void {
  defaultStore = store;
}

export function normalizeWorkflowMemoryConfig(
  raw: unknown,
  fallbackRunId: string
): Required<Pick<WorkflowMemoryConfig, 'enabled' | 'runId' | 'gcOnCompletion'>> &
  Omit<WorkflowMemoryConfig, 'enabled' | 'runId' | 'gcOnCompletion'> {
  const input = raw && typeof raw === 'object' ? (raw as WorkflowMemoryConfig) : {};
  const enabled = input.enabled === true || Boolean(input.runId || input.schema);
  return {
    enabled,
    runId: input.runId ? safeRunId(input.runId) : fallbackRunId,
    schema: normalizeSchema(input.schema),
    assignedAgentIds: Array.isArray(input.assignedAgentIds)
      ? input.assignedAgentIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [],
    gcOnCompletion: input.gcOnCompletion !== false,
    retentionMs: typeof input.retentionMs === 'number' ? input.retentionMs : undefined,
  };
}
