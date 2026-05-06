/**
 * ExternalAgentAdapter
 *
 * Quarantine-first receipt layer for specialist agents that run outside the
 * local CAEL/HoloScript trust boundary.
 */

import { createHash } from 'node:crypto';

export const EXTERNAL_AGENT_RECEIPT_SCHEMA_VERSION = '1.0.0';
export const CLAUDE_MANAGED_AGENTS_PROVIDER_ID = 'anthropic.claude-managed-agents';
export const CLAUDE_MANAGED_AGENTS_BETA_HEADER = 'managed-agents-2026-04-01';

export type ExternalAgentVendor = 'anthropic' | 'openai' | 'google' | 'local' | 'other';
export type ExternalAgentQuarantineState = 'quarantined' | 'validated' | 'promoted' | 'rejected';
export type ExternalAgentArtifactHashKind = 'sha256-content' | 'sha256-descriptor';

export interface ExternalAgentIdentity {
  id: string;
  vendor: ExternalAgentVendor;
  label?: string;
  model?: string;
  betaHeader?: string;
}

export interface ExternalAgentSessionReceipt {
  id: string;
  status?: string;
  agentId?: string;
  environmentId?: string;
  url?: string;
}

export interface ExternalAgentEventInput {
  id?: string;
  type: string;
  processedAt?: string;
  sessionThreadId?: string;
  summary?: string;
  payload?: unknown;
}

export interface ExternalAgentEventReceipt {
  id?: string;
  type: string;
  processedAt?: string;
  sessionThreadId?: string;
  summary?: string;
  rawHash: string;
}

export interface ExternalAgentArtifactInput {
  id?: string;
  path?: string;
  uri?: string;
  type: string;
  producer: string;
  content?: string;
  contentHash?: string;
  validator?: string;
}

export interface ExternalAgentArtifactReceipt {
  id?: string;
  path?: string;
  uri?: string;
  type: string;
  producer: string;
  validator?: string;
  hash: string;
  hashKind: ExternalAgentArtifactHashKind;
}

export interface ExternalAgentOutcomeInput {
  id: string;
  score?: number;
  passed?: boolean;
  rubricHash?: string;
  summary?: string;
  criteria?: Array<{
    id: string;
    score: number;
    passed: boolean;
    gap?: string;
  }>;
}

export interface ExternalAgentOutcomeReceipt {
  id: string;
  score?: number;
  passed?: boolean;
  rubricHash?: string;
  summary?: string;
  criteriaHash?: string;
}

export interface ExternalAgentValidationCommand {
  id?: string;
  command: string;
  required?: boolean;
}

export interface ExternalAgentValidationResult extends ExternalAgentValidationCommand {
  passed: boolean;
  exitCode?: number;
  stdoutHash?: string;
  stderrHash?: string;
  validator?: string;
}

export interface MemoryReceiptReference {
  id: string;
  sourceReceiptHash: string;
  promotedBy: string;
  promotedAt: string;
  destination: 'candidate-memory' | 'wpg-review' | 'retained-memory';
}

export interface ExternalAgentQuarantineReceipt {
  state: ExternalAgentQuarantineState;
  reason: string;
  localValidationRequired: boolean;
  memoryPromotion?: MemoryReceiptReference;
}

export interface ExternalAgentRequestReceipt {
  promptHash?: string;
  inputArtifactHashes: ExternalAgentArtifactReceipt[];
  metadataHash?: string;
}

export interface ExternalAgentReceipt {
  schemaVersion: typeof EXTERNAL_AGENT_RECEIPT_SCHEMA_VERSION;
  receiptId: string;
  provider: string;
  taskId?: string;
  createdAt: string;
  captureHash: string;
  agent: ExternalAgentIdentity;
  session: ExternalAgentSessionReceipt;
  request: ExternalAgentRequestReceipt;
  events: ExternalAgentEventReceipt[];
  outcomes: ExternalAgentOutcomeReceipt[];
  artifacts: ExternalAgentArtifactReceipt[];
  validation: ExternalAgentValidationResult[];
  quarantine: ExternalAgentQuarantineReceipt;
  persistentMemoryWriteAllowed: false;
  metadata?: Record<string, unknown>;
}

export interface ExternalAgentReceiptInput {
  provider: string;
  agent: ExternalAgentIdentity;
  session: ExternalAgentSessionReceipt;
  taskId?: string;
  prompt?: string;
  inputArtifacts?: ExternalAgentArtifactInput[];
  events?: ExternalAgentEventInput[];
  outcomes?: ExternalAgentOutcomeInput[];
  artifacts?: ExternalAgentArtifactInput[];
  validation?: ExternalAgentValidationResult[];
  localValidationRequired?: boolean;
  metadata?: Record<string, unknown>;
  now?: () => Date;
}

export interface ClaudeManagedAgentSession {
  id: string;
  status?: string;
  agentId?: string;
  environmentId?: string;
  url?: string;
}

export interface ClaudeManagedAgentCreateSessionInput {
  agent: string | { type: 'agent'; id: string; version: number };
  environmentId: string;
  vaultIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface ClaudeManagedAgentUserEvent {
  type: 'user.message';
  content: Array<{ type: 'text'; text: string }>;
}

export interface ClaudeManagedAgentClient {
  createSession(input: ClaudeManagedAgentCreateSessionInput): Promise<ClaudeManagedAgentSession>;
  sendUserEvent(sessionId: string, event: ClaudeManagedAgentUserEvent): Promise<void>;
  retrieveSession(sessionId: string): Promise<ClaudeManagedAgentSession>;
  listEvents(sessionId: string): Promise<ExternalAgentEventInput[]>;
  listArtifacts?(sessionId: string): Promise<ExternalAgentArtifactInput[]>;
  listOutcomes?(sessionId: string): Promise<ExternalAgentOutcomeInput[]>;
}

export interface ClaudeManagedAgentsSdkCreateSessionInput {
  agent: string | { type: 'agent'; id: string; version: number };
  environment_id: string;
  vault_ids?: string[];
  metadata?: Record<string, unknown>;
}

export interface ClaudeManagedAgentsSdk {
  beta: {
    sessions: {
      create(input: ClaudeManagedAgentsSdkCreateSessionInput): Promise<unknown>;
      retrieve(sessionId: string): Promise<unknown>;
      events: {
        send(sessionId: string, input: { events: ClaudeManagedAgentUserEvent[] }): Promise<unknown>;
        list(sessionId: string): Promise<unknown>;
      };
    };
  };
}

export interface ClaudeManagedAgentAdapterConfig {
  client: ClaudeManagedAgentClient;
  agentId: string;
  environmentId: string;
  model?: string;
  provider?: string;
  now?: () => Date;
}

export interface ClaudeManagedAgentRunRequest {
  taskId?: string;
  prompt: string;
  agent?: string | { type: 'agent'; id: string; version: number };
  environmentId?: string;
  vaultIds?: string[];
  inputArtifacts?: ExternalAgentArtifactInput[];
  validation?: ExternalAgentValidationResult[];
  metadata?: Record<string, unknown>;
}

export interface ClaudeManagedAgentReadRequest {
  sessionId: string;
  taskId?: string;
  prompt?: string;
  inputArtifacts?: ExternalAgentArtifactInput[];
  validation?: ExternalAgentValidationResult[];
  metadata?: Record<string, unknown>;
}

export interface ExternalAgentBenchmarkCase extends ClaudeManagedAgentRunRequest {
  scorer?: (receipt: ExternalAgentReceipt) => number;
}

export interface ExternalAgentBenchmarkResult {
  backendId: string;
  receipt: ExternalAgentReceipt;
  score: number;
  passed: boolean;
}

export interface ExternalAgentBenchmarkBackend {
  readonly backendId: string;
  runBenchmarkCase(input: ExternalAgentBenchmarkCase): Promise<ExternalAgentBenchmarkResult>;
}

export function hashText(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function hashStableJson(value: unknown): string {
  return hashText(JSON.stringify(stabilizeForHash(value)));
}

export function createClaudeManagedAgentsSdkClient(sdk: ClaudeManagedAgentsSdk): ClaudeManagedAgentClient {
  return {
    async createSession(input) {
      return toManagedAgentSession(
        await sdk.beta.sessions.create({
          agent: input.agent,
          environment_id: input.environmentId,
          ...(input.vaultIds ? { vault_ids: input.vaultIds.slice() } : {}),
          ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
        })
      );
    },
    async sendUserEvent(sessionId, event) {
      await sdk.beta.sessions.events.send(sessionId, { events: [event] });
    },
    async retrieveSession(sessionId) {
      return toManagedAgentSession(await sdk.beta.sessions.retrieve(sessionId));
    },
    async listEvents(sessionId) {
      return toEventList(await sdk.beta.sessions.events.list(sessionId));
    },
  };
}

export function createExternalAgentReceipt(input: ExternalAgentReceiptInput): ExternalAgentReceipt {
  const events = (input.events ?? []).map(toEventReceipt);
  const artifacts = (input.artifacts ?? []).map(toArtifactReceipt);
  const outcomes = (input.outcomes ?? []).map(toOutcomeReceipt);
  const inputArtifactHashes = (input.inputArtifacts ?? []).map(toArtifactReceipt);
  const validation = (input.validation ?? []).map((result) => ({ ...result }));
  const request: ExternalAgentRequestReceipt = {
    ...(input.prompt ? { promptHash: hashText(input.prompt) } : {}),
    inputArtifactHashes,
    ...(input.metadata ? { metadataHash: hashStableJson(input.metadata) } : {}),
  };

  const captureMaterial = {
    provider: input.provider,
    agent: input.agent,
    session: input.session,
    request,
    events,
    outcomes,
    artifacts,
  };
  const captureHash = hashStableJson(captureMaterial);

  return {
    schemaVersion: EXTERNAL_AGENT_RECEIPT_SCHEMA_VERSION,
    receiptId: `ext_${captureHash.slice(0, 16)}`,
    provider: input.provider,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    createdAt: (input.now?.() ?? new Date()).toISOString(),
    captureHash,
    agent: { ...input.agent },
    session: { ...input.session },
    request,
    events,
    outcomes,
    artifacts,
    validation,
    quarantine: {
      state: 'quarantined',
      reason: 'External agent output requires local validation before any memory promotion.',
      localValidationRequired: input.localValidationRequired ?? true,
    },
    persistentMemoryWriteAllowed: false,
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
  };
}

export function applyExternalAgentValidation(
  receipt: ExternalAgentReceipt,
  validation: ExternalAgentValidationResult[]
): ExternalAgentReceipt {
  const copiedValidation = validation.map((result) => ({ ...result }));
  if (copiedValidation.length === 0) {
    return {
      ...receipt,
      validation: [],
      quarantine: {
        state: 'quarantined',
        reason: 'No local validation evidence attached.',
        localValidationRequired: true,
      },
      persistentMemoryWriteAllowed: false,
    };
  }

  const requiredFailure = copiedValidation.find((result) => result.required !== false && !result.passed);
  return {
    ...receipt,
    validation: copiedValidation,
    quarantine: {
      state: requiredFailure ? 'rejected' : 'validated',
      reason: requiredFailure
        ? `Required validation failed: ${requiredFailure.id ?? requiredFailure.command}.`
        : 'Local validation passed; receipt remains memory-isolated until MemoryReceipt promotion.',
      localValidationRequired: false,
    },
    persistentMemoryWriteAllowed: false,
  };
}

export function promoteExternalAgentReceipt(
  receipt: ExternalAgentReceipt,
  memoryReceipt: MemoryReceiptReference
): ExternalAgentReceipt {
  if (receipt.quarantine.state !== 'validated') {
    throw new Error('ExternalAgentReceipt must be locally validated before MemoryReceipt promotion.');
  }
  if (memoryReceipt.sourceReceiptHash !== receipt.captureHash) {
    throw new Error('MemoryReceipt source hash must match the external agent capture hash.');
  }
  return {
    ...receipt,
    quarantine: {
      state: 'promoted',
      reason: 'Promoted by MemoryReceipt reference; adapter still has no direct memory-write capability.',
      localValidationRequired: false,
      memoryPromotion: { ...memoryReceipt },
    },
    persistentMemoryWriteAllowed: false,
  };
}

export class ClaudeManagedAgentAdapter implements ExternalAgentBenchmarkBackend {
  readonly backendId = 'claude-managed-agent-quarantined';
  private readonly config: ClaudeManagedAgentAdapterConfig;

  constructor(config: ClaudeManagedAgentAdapterConfig) {
    this.config = config;
  }

  async launchAndRead(request: ClaudeManagedAgentRunRequest): Promise<ExternalAgentReceipt> {
    if (!request.prompt.trim()) {
      throw new Error('ClaudeManagedAgentAdapter.launchAndRead requires a non-empty prompt.');
    }

    const session = await this.config.client.createSession({
      agent: request.agent ?? this.config.agentId,
      environmentId: request.environmentId ?? this.config.environmentId,
      vaultIds: request.vaultIds?.slice(),
      metadata: request.metadata ? { ...request.metadata } : undefined,
    });

    await this.config.client.sendUserEvent(session.id, {
      type: 'user.message',
      content: [{ type: 'text', text: request.prompt }],
    });

    return this.readSession({
      sessionId: session.id,
      taskId: request.taskId,
      prompt: request.prompt,
      inputArtifacts: request.inputArtifacts,
      validation: request.validation,
      metadata: request.metadata,
    });
  }

  async readSession(request: ClaudeManagedAgentReadRequest): Promise<ExternalAgentReceipt> {
    const [session, events, artifacts, outcomes] = await Promise.all([
      this.config.client.retrieveSession(request.sessionId),
      this.config.client.listEvents(request.sessionId),
      this.config.client.listArtifacts?.(request.sessionId) ?? Promise.resolve([]),
      this.config.client.listOutcomes?.(request.sessionId) ?? Promise.resolve([]),
    ]);

    const receipt = createExternalAgentReceipt({
      provider: this.config.provider ?? CLAUDE_MANAGED_AGENTS_PROVIDER_ID,
      agent: {
        id: session.agentId ?? this.config.agentId,
        vendor: 'anthropic',
        label: 'Claude Managed Agent',
        model: this.config.model,
        betaHeader: CLAUDE_MANAGED_AGENTS_BETA_HEADER,
      },
      session: {
        id: session.id,
        status: session.status,
        agentId: session.agentId ?? this.config.agentId,
        environmentId: session.environmentId ?? this.config.environmentId,
        url: session.url,
      },
      taskId: request.taskId,
      prompt: request.prompt,
      inputArtifacts: request.inputArtifacts,
      events,
      artifacts,
      outcomes,
      validation: request.validation,
      metadata: request.metadata,
      now: this.config.now,
    });

    return request.validation ? applyExternalAgentValidation(receipt, request.validation) : receipt;
  }

  async runBenchmarkCase(input: ExternalAgentBenchmarkCase): Promise<ExternalAgentBenchmarkResult> {
    const receipt = await this.launchAndRead(input);
    const firstOutcomeScore = receipt.outcomes.find((outcome) => typeof outcome.score === 'number')?.score ?? 0;
    const score = input.scorer ? input.scorer(receipt) : firstOutcomeScore;
    return {
      backendId: this.backendId,
      receipt,
      score,
      passed: receipt.quarantine.state === 'validated' || receipt.quarantine.state === 'promoted',
    };
  }
}

function toEventReceipt(event: ExternalAgentEventInput): ExternalAgentEventReceipt {
  return {
    ...(event.id ? { id: event.id } : {}),
    type: event.type,
    ...(event.processedAt ? { processedAt: event.processedAt } : {}),
    ...(event.sessionThreadId ? { sessionThreadId: event.sessionThreadId } : {}),
    ...(event.summary ? { summary: event.summary } : {}),
    rawHash: hashStableJson(event),
  };
}

function toArtifactReceipt(artifact: ExternalAgentArtifactInput): ExternalAgentArtifactReceipt {
  const hasContentHash = Boolean(artifact.contentHash);
  const hasContent = artifact.content !== undefined;
  const hash = artifact.contentHash
    ?? (hasContent ? hashText(artifact.content ?? '') : hashStableJson({
      id: artifact.id,
      path: artifact.path,
      uri: artifact.uri,
      type: artifact.type,
      producer: artifact.producer,
    }));
  return {
    ...(artifact.id ? { id: artifact.id } : {}),
    ...(artifact.path ? { path: artifact.path } : {}),
    ...(artifact.uri ? { uri: artifact.uri } : {}),
    type: artifact.type,
    producer: artifact.producer,
    ...(artifact.validator ? { validator: artifact.validator } : {}),
    hash,
    hashKind: hasContentHash || hasContent ? 'sha256-content' : 'sha256-descriptor',
  };
}

function toOutcomeReceipt(outcome: ExternalAgentOutcomeInput): ExternalAgentOutcomeReceipt {
  return {
    id: outcome.id,
    ...(typeof outcome.score === 'number' ? { score: clamp01(outcome.score) } : {}),
    ...(typeof outcome.passed === 'boolean' ? { passed: outcome.passed } : {}),
    ...(outcome.rubricHash ? { rubricHash: outcome.rubricHash } : {}),
    ...(outcome.summary ? { summary: outcome.summary } : {}),
    ...(outcome.criteria ? { criteriaHash: hashStableJson(outcome.criteria) } : {}),
  };
}

function toManagedAgentSession(value: unknown): ClaudeManagedAgentSession {
  const record = asRecord(value);
  const id = stringField(record, ['id']);
  if (!id) {
    throw new Error('Claude Managed Agents SDK response did not include a session id.');
  }
  return {
    id,
    ...(stringField(record, ['status']) ? { status: stringField(record, ['status']) } : {}),
    ...(stringField(record, ['agentId', 'agent_id']) ? { agentId: stringField(record, ['agentId', 'agent_id']) } : {}),
    ...(stringField(record, ['environmentId', 'environment_id'])
      ? { environmentId: stringField(record, ['environmentId', 'environment_id']) }
      : {}),
    ...(stringField(record, ['url']) ? { url: stringField(record, ['url']) } : {}),
  };
}

function toEventList(value: unknown): ExternalAgentEventInput[] {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(asRecord(value).data)
      ? asRecord(value).data as unknown[]
      : [];
  return list.map((event) => {
    const record = asRecord(event);
    return {
      id: stringField(record, ['id']),
      type: stringField(record, ['type']) ?? 'unknown.event',
      processedAt: stringField(record, ['processedAt', 'processed_at']),
      sessionThreadId: stringField(record, ['sessionThreadId', 'session_thread_id']),
      summary: stringField(record, ['summary']),
      payload: event,
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function stabilizeForHash(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => item === undefined ? null : stabilizeForHash(item));
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item === undefined || typeof item === 'function') continue;
    normalized[key] = stabilizeForHash(item);
  }
  return normalized;
}
