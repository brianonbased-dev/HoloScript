import { Webhook } from 'standardwebhooks';

import { sha256, stableHash } from './hash';
import {
  buildManagedAgentLifecycleReceipt,
  type AnthropicLifecycleAction,
  type AnthropicLifecycleResourceKind,
  type ManagedAgentLifecycleReceipt,
  type NormalizedAnthropicLifecycleEvent,
} from './receipt';

export const ANTHROPIC_LIFECYCLE_EVENT_TYPES = [
  'environment.created',
  'environment.updated',
  'environment.archived',
  'environment.deleted',
  'memory_store.created',
  'memory_store.archived',
  'memory_store.deleted',
] as const;

export type AnthropicLifecycleEventType = (typeof ANTHROPIC_LIFECYCLE_EVENT_TYPES)[number];

export interface AnthropicLifecycleWebhookEvent {
  type: 'event';
  id: string;
  created_at: string;
  data: {
    type: AnthropicLifecycleEventType;
    id: string;
    organization_id: string;
    workspace_id: string;
  };
}

export interface HoloKeySecretReference {
  provider: 'holokey';
  keyId: string;
  version?: string;
}

export interface HoloKeyResolvedSecret {
  value: string;
  expiresAt?: string;
}

export type HoloKeyWebhookSecretResolver = (
  reference: HoloKeySecretReference
) => Promise<HoloKeyResolvedSecret>;

export interface ManagedAgentWebhookReplayGuard {
  claim(dedupeKey: string, receiptHash: string): Promise<'accepted' | 'duplicate' | 'conflict'>;
}

export interface VerifyAnthropicLifecycleWebhookInput {
  body: string;
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  secretRef: HoloKeySecretReference;
  resolveSecret: HoloKeyWebhookSecretResolver;
  replayGuard?: ManagedAgentWebhookReplayGuard;
}

export async function verifyAnthropicLifecycleWebhook(
  input: VerifyAnthropicLifecycleWebhookInput
): Promise<ManagedAgentLifecycleReceipt> {
  if (!input.body) throw new Error('webhook body must not be empty');
  if (input.secretRef.provider !== 'holokey' || !input.secretRef.keyId.trim()) {
    throw new Error('webhook secret must be resolved through a non-empty HoloKey reference');
  }
  const headers = normalizeHeaders(input.headers);
  const resolved = await input.resolveSecret(structuredClone(input.secretRef));
  if (!resolved.value.startsWith('whsec_')) {
    throw new Error('HoloKey resolver did not return an Anthropic whsec_ signing secret');
  }
  const now = new Date();
  if (resolved.expiresAt !== undefined) {
    const expiresAt = Date.parse(resolved.expiresAt);
    if (!Number.isFinite(expiresAt)) throw new Error('HoloKey secret expiry must be RFC 3339');
    if (expiresAt <= now.getTime()) throw new Error('HoloKey webhook signing secret is expired');
  }

  let unwrapped: unknown;
  try {
    unwrapped = new Webhook(resolved.value).verify(input.body, headers);
  } catch (error) {
    throw new Error(`Anthropic webhook verification failed: ${errorMessage(error)}`);
  }
  const event = normalizeLifecycleEvent(unwrapped);
  if (headers['webhook-id'] !== event.id) {
    throw new Error('webhook-id header must match the signed event id');
  }
  const timestamp = headers['webhook-timestamp'];
  const signature = headers['webhook-signature'];
  const receipt = buildManagedAgentLifecycleReceipt({
    event,
    delivery: {
      webhookId: headers['webhook-id'],
      timestamp,
      signatureHash: sha256(signature),
    },
    bodyHash: sha256(input.body),
    secretRefHash: stableHash(input.secretRef),
    generatedAt: now.toISOString(),
  });
  if (input.replayGuard) {
    const disposition = await input.replayGuard.claim(
      receipt.delivery.dedupeKey,
      receipt.integrity.eventHash
    );
    if (disposition !== 'accepted') {
      throw new Error(`Anthropic webhook replay rejected: ${disposition}`);
    }
  }
  return receipt;
}

export function normalizeLifecycleEvent(value: unknown): NormalizedAnthropicLifecycleEvent {
  const event = record(value, 'webhook event');
  if (event.type !== 'event') throw new Error('webhook payload type must be event');
  const id = nonEmptyString(event.id, 'webhook event id');
  const createdAt = nonEmptyString(event.created_at, 'webhook created_at');
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error('webhook created_at must be RFC 3339');
  }
  const data = record(event.data, 'webhook data');
  const type = nonEmptyString(data.type, 'webhook data type');
  if (!ANTHROPIC_LIFECYCLE_EVENT_TYPES.includes(type as AnthropicLifecycleEventType)) {
    throw new Error(`unsupported Anthropic lifecycle event type: ${type}`);
  }
  const [kind, action] = type.split('.') as [
    AnthropicLifecycleResourceKind,
    AnthropicLifecycleAction,
  ];
  return {
    id,
    createdAt,
    type,
    resource: {
      kind,
      id: nonEmptyString(data.id, 'webhook resource id'),
      action,
    },
    scope: {
      organizationId: nonEmptyString(data.organization_id, 'webhook organization_id'),
      workspaceId: nonEmptyString(data.workspace_id, 'webhook workspace_id'),
    },
  };
}

function normalizeHeaders(headers: VerifyAnthropicLifecycleWebhookInput['headers']): Record<
  string,
  string
> & {
  'webhook-id': string;
  'webhook-timestamp': string;
  'webhook-signature': string;
} {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') normalized[key.toLowerCase()] = value;
    else if (Array.isArray(value) && typeof value[0] === 'string') {
      normalized[key.toLowerCase()] = value[0];
    }
  }
  for (const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature'] as const) {
    if (!normalized[name]) throw new Error(`missing required webhook header: ${name}`);
  }
  return normalized as Record<string, string> & {
    'webhook-id': string;
    'webhook-timestamp': string;
    'webhook-signature': string;
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
