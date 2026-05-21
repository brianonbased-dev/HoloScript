export const BOARD_WEBHOOK_EVENT_TYPES = [
  'task.created',
  'task.claimed',
  'task.done',
  'task.failed',
  'outcome.completed',
  'memory.promoted',
  'policy.violation',
] as const;

export const BOARD_WEBHOOK_ORDERING_GUARANTEE =
  'Delivery is at-least-once. Events are ordered by timestamp and optional sequence within a single taskId; cross-task ordering is best-effort.';

export const BOARD_WEBHOOK_FETCH_BY_ID_BEHAVIOR =
  'Consumers should treat the event id as idempotent and fetch the latest task/outcome/memory state by the fetchById URL when payload order is ambiguous.';

export type BoardWebhookEventType = (typeof BOARD_WEBHOOK_EVENT_TYPES)[number];
export type BoardWebhookDeliveryStatus = 'pending' | 'delivered' | 'retrying' | 'dead-lettered';
export type BoardWebhookOrderingScope = 'best-effort' | 'per-task' | 'per-team';

export interface BoardWebhookRetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs?: number;
}

export interface BoardWebhookSigningConfig {
  algorithm: 'hmac-sha256';
  signatureHeader?: string;
  timestampHeader?: string;
  toleranceSeconds?: number;
}

export interface BoardWebhookSubscription {
  id: string;
  url: string;
  events: Array<BoardWebhookEventType | '*'>;
  enabled?: boolean;
  secretRef?: string;
  signing?: BoardWebhookSigningConfig;
  retry?: BoardWebhookRetryPolicy;
  ordering?: BoardWebhookOrderingScope;
  deadLetterSink?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface BoardWebhookFetchById {
  id: string;
  url: string;
}

export interface BoardWebhookEnvelope<TPayload = Record<string, unknown>> {
  id: string;
  type: BoardWebhookEventType;
  timestamp: string;
  teamId: string;
  taskId?: string;
  agentId?: string;
  sequence?: number;
  payload: TPayload;
  fetchById?: BoardWebhookFetchById;
}

export interface CreateBoardWebhookEnvelopeOptions<TPayload = Record<string, unknown>> {
  id?: string;
  type: BoardWebhookEventType;
  timestamp?: string;
  teamId: string;
  taskId?: string;
  agentId?: string;
  sequence?: number;
  payload: TPayload;
  fetchById?: BoardWebhookFetchById;
}

export interface BoardWebhookRequest {
  method: 'POST';
  url: string;
  headers: Record<string, string>;
  body: string;
  idempotencyKey: string;
}

export interface BoardWebhookDelivery {
  subscriptionId: string;
  eventId: string;
  attempt: number;
  status: BoardWebhookDeliveryStatus;
  idempotencyKey: string;
  nextRetryAt?: string;
  lastError?: string;
  deadLetterSink?: string;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const encoder = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(message));
    return bytesToHex(new Uint8Array(signature));
  }

  const crypto = await import('crypto');
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseSignatureHeader(signature: string): { timestamp?: string; value?: string } {
  const parts = new Map(
    signature.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key?.trim(), value?.trim()] as const;
    })
  );
  return { timestamp: parts.get('t'), value: parts.get('v1') };
}

export function validateBoardWebhookSubscription(subscription: BoardWebhookSubscription): string[] {
  const errors: string[] = [];
  if (!subscription.id) errors.push('BoardWebhookSubscription.id is required.');
  if (!subscription.url) errors.push('BoardWebhookSubscription.url is required.');
  if (!subscription.events.length) errors.push('BoardWebhookSubscription.events is required.');
  for (const event of subscription.events) {
    if (event !== '*' && !(BOARD_WEBHOOK_EVENT_TYPES as readonly string[]).includes(event)) {
      errors.push(`BoardWebhookSubscription.events contains unsupported event: ${String(event)}.`);
    }
  }
  if (subscription.signing && subscription.signing.algorithm !== 'hmac-sha256') {
    errors.push(`BoardWebhookSubscription.signing.algorithm is unsupported: ${subscription.signing.algorithm}.`);
  }
  if (subscription.retry) {
    if (subscription.retry.maxAttempts < 1) {
      errors.push('BoardWebhookSubscription.retry.maxAttempts must be at least 1.');
    }
    if (subscription.retry.backoffMs < 0) {
      errors.push('BoardWebhookSubscription.retry.backoffMs cannot be negative.');
    }
  }
  return errors;
}

export function createBoardWebhookEnvelope<TPayload>(
  opts: CreateBoardWebhookEnvelopeOptions<TPayload>
): BoardWebhookEnvelope<TPayload> {
  return {
    id: opts.id ?? `evt_${opts.type.replace(/\./g, '_')}_${opts.timestamp ?? Date.now()}`,
    type: opts.type,
    timestamp: opts.timestamp ?? new Date().toISOString(),
    teamId: opts.teamId,
    taskId: opts.taskId,
    agentId: opts.agentId,
    sequence: opts.sequence,
    payload: opts.payload,
    fetchById: opts.fetchById,
  };
}

export function canonicalBoardWebhookBody(envelope: BoardWebhookEnvelope): string {
  return stableStringify(envelope);
}

export function shouldDeliverBoardWebhook(
  subscription: BoardWebhookSubscription,
  type: BoardWebhookEventType
): boolean {
  return subscription.enabled !== false && (subscription.events.includes('*') || subscription.events.includes(type));
}

export async function signBoardWebhookEnvelope(
  envelope: BoardWebhookEnvelope,
  secret: string
): Promise<string> {
  const body = canonicalBoardWebhookBody(envelope);
  const message = `${envelope.timestamp}.${body}`;
  const signature = await hmacSha256Hex(secret, message);
  return `t=${envelope.timestamp},v1=${signature}`;
}

export async function verifyBoardWebhookSignature(
  envelope: BoardWebhookEnvelope,
  secret: string,
  signatureHeader: string,
  opts: { now?: string; toleranceSeconds?: number } = {}
): Promise<boolean> {
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed.timestamp || !parsed.value) return false;

  const toleranceSeconds = opts.toleranceSeconds ?? 300;
  const nowMs = Date.parse(opts.now ?? new Date().toISOString());
  const timestampMs = Date.parse(parsed.timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > toleranceSeconds * 1000) {
    return false;
  }

  const expected = await signBoardWebhookEnvelope({ ...envelope, timestamp: parsed.timestamp }, secret);
  const expectedValue = parseSignatureHeader(expected).value;
  return expectedValue ? constantTimeEqual(expectedValue, parsed.value) : false;
}

export async function buildBoardWebhookRequest(
  subscription: BoardWebhookSubscription,
  envelope: BoardWebhookEnvelope,
  secret: string
): Promise<BoardWebhookRequest> {
  const signatureHeader = subscription.signing?.signatureHeader ?? 'x-holoscript-signature';
  const timestampHeader = subscription.signing?.timestampHeader ?? 'x-holoscript-timestamp';
  const body = canonicalBoardWebhookBody(envelope);
  const signature = await signBoardWebhookEnvelope(envelope, secret);
  const idempotencyKey = `${subscription.id}:${envelope.id}`;

  return {
    method: 'POST',
    url: subscription.url,
    body,
    idempotencyKey,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
      'x-holoscript-event-id': envelope.id,
      'x-holoscript-event-type': envelope.type,
      [timestampHeader]: envelope.timestamp,
      [signatureHeader]: signature,
      ...(subscription.headers ?? {}),
    },
  };
}

export function nextBoardWebhookRetry(
  delivery: BoardWebhookDelivery,
  subscription: BoardWebhookSubscription,
  now: string = new Date().toISOString()
): BoardWebhookDelivery {
  const retry = subscription.retry ?? { maxAttempts: 3, backoffMs: 1000 };
  if (delivery.attempt >= retry.maxAttempts) {
    return {
      ...delivery,
      status: 'dead-lettered',
      deadLetterSink: subscription.deadLetterSink,
      nextRetryAt: undefined,
    };
  }

  const delay = Math.min(
    retry.backoffMs * 2 ** Math.max(delivery.attempt - 1, 0),
    retry.maxBackoffMs ?? Number.MAX_SAFE_INTEGER
  );
  return {
    ...delivery,
    status: 'retrying',
    nextRetryAt: new Date(Date.parse(now) + delay).toISOString(),
  };
}

export function validateBoardWebhookEnvelope(envelope: BoardWebhookEnvelope): string[] {
  const errors: string[] = [];
  if (!envelope.id) errors.push('BoardWebhookEnvelope.id is required.');
  if (!envelope.type) errors.push('BoardWebhookEnvelope.type is required.');
  if (!envelope.timestamp) errors.push('BoardWebhookEnvelope.timestamp is required.');
  if (!envelope.teamId) errors.push('BoardWebhookEnvelope.teamId is required.');
  if (!(BOARD_WEBHOOK_EVENT_TYPES as readonly string[]).includes(envelope.type)) {
    errors.push(`BoardWebhookEnvelope.type is unsupported: ${String(envelope.type)}.`);
  }
  return errors;
}

export function cloneBoardWebhookEnvelope<TPayload = Record<string, unknown>>(
  envelope: BoardWebhookEnvelope<TPayload>
): BoardWebhookEnvelope<TPayload> {
  return {
    ...envelope,
    payload:
      envelope.payload && typeof envelope.payload === 'object' && !Array.isArray(envelope.payload)
        ? { ...envelope.payload } as TPayload
        : envelope.payload,
    fetchById: envelope.fetchById ? { ...envelope.fetchById } : undefined,
  };
}

export function isSupportedBoardWebhookEventType(value: string): value is BoardWebhookEventType {
  return (BOARD_WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

export function recordBoardWebhookDeliveryFailure(
  delivery: BoardWebhookDelivery,
  subscription: BoardWebhookSubscription,
  error: string,
  now: string = new Date().toISOString()
): BoardWebhookDelivery {
  return nextBoardWebhookRetry(
    {
      ...delivery,
      attempt: delivery.attempt + 1,
      lastError: error,
    },
    subscription,
    now
  );
}
