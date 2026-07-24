import { stableHash } from './hash';

export const MANAGED_AGENT_LIFECYCLE_RECEIPT_SCHEMA =
  'holoscript.managed-agent.lifecycle-receipt.v1';
export const CAEL_MANAGED_AGENT_LIFECYCLE_SCHEMA = 'cael.external-agent-lifecycle.v1';
export const UAAL_MANAGED_AGENT_LIFECYCLE_SCHEMA = 'uaal.external-lifecycle-receipt.v1';

export type AnthropicLifecycleResourceKind = 'environment' | 'memory_store';
export type AnthropicLifecycleAction = 'created' | 'updated' | 'archived' | 'deleted';

export interface NormalizedAnthropicLifecycleEvent {
  id: string;
  createdAt: string;
  type: string;
  resource: {
    kind: AnthropicLifecycleResourceKind;
    id: string;
    action: AnthropicLifecycleAction;
  };
  scope: {
    organizationId: string;
    workspaceId: string;
  };
}

export interface ManagedAgentLifecycleReceiptInput {
  event: NormalizedAnthropicLifecycleEvent;
  delivery: {
    webhookId: string;
    timestamp: string;
    signatureHash: string;
  };
  bodyHash: string;
  secretRefHash: string;
  generatedAt: string;
}

export interface ManagedAgentLifecycleReceipt {
  schema: typeof MANAGED_AGENT_LIFECYCLE_RECEIPT_SCHEMA;
  receiptId: string;
  generatedAt: string;
  provider: 'anthropic.claude-managed-agents';
  event: NormalizedAnthropicLifecycleEvent;
  delivery: {
    webhookId: string;
    timestamp: string;
    signatureHash: string;
    verified: true;
    dedupeKey: string;
  };
  custody: {
    resolver: 'holokey';
    secretRefHash: string;
    secretValueIncluded: false;
  };
  authority: {
    memoryBackend: 'optional-external-backend';
    sourceOfTruth: false;
    goldAuthority: false;
    directMemoryPromotionAllowed: false;
  };
  cael: {
    schema: typeof CAEL_MANAGED_AGENT_LIFECYCLE_SCHEMA;
    event: string;
    provider: 'anthropic';
    resourceKind: AnthropicLifecycleResourceKind;
    resourceId: string;
    observedAt: string;
    signatureVerified: true;
    evidenceHash: string;
  };
  uaal: {
    schema: typeof UAAL_MANAGED_AGENT_LIFECYCLE_SCHEMA;
    operation: AnthropicLifecycleAction;
    actor: 'external-provider';
    resource: {
      kind: AnthropicLifecycleResourceKind;
      id: string;
    };
    evidenceHash: string;
    replay: {
      mode: 'idempotent-event';
      key: string;
      orderingGuaranteed: false;
    };
  };
  integrity: {
    bodyHash: string;
    eventHash: string;
    evidenceHash: string;
    receiptHash: string;
  };
}

export interface ManagedAgentLifecycleReceiptVerification {
  ok: boolean;
  blockers: string[];
  receiptHash: string;
}

export function buildManagedAgentLifecycleReceipt(
  input: ManagedAgentLifecycleReceiptInput
): ManagedAgentLifecycleReceipt {
  const event = structuredClone(input.event);
  const delivery = {
    webhookId: input.delivery.webhookId,
    timestamp: input.delivery.timestamp,
    signatureHash: input.delivery.signatureHash,
    verified: true as const,
    dedupeKey: `anthropic:${input.event.id}`,
  };
  const custody = {
    resolver: 'holokey' as const,
    secretRefHash: input.secretRefHash,
    secretValueIncluded: false as const,
  };
  const authority = {
    memoryBackend: 'optional-external-backend' as const,
    sourceOfTruth: false as const,
    goldAuthority: false as const,
    directMemoryPromotionAllowed: false as const,
  };
  const eventHash = stableHash({
    provider: 'anthropic.claude-managed-agents',
    event,
  });
  const evidenceHash = stableHash({
    provider: 'anthropic.claude-managed-agents',
    event,
    eventHash,
    delivery,
    custody,
    authority,
    bodyHash: input.bodyHash,
  });
  const cael: ManagedAgentLifecycleReceipt['cael'] = {
    schema: CAEL_MANAGED_AGENT_LIFECYCLE_SCHEMA,
    event: event.type,
    provider: 'anthropic' as const,
    resourceKind: event.resource.kind,
    resourceId: event.resource.id,
    observedAt: event.createdAt,
    signatureVerified: true as const,
    evidenceHash,
  };
  const uaal: ManagedAgentLifecycleReceipt['uaal'] = {
    schema: UAAL_MANAGED_AGENT_LIFECYCLE_SCHEMA,
    operation: event.resource.action,
    actor: 'external-provider' as const,
    resource: {
      kind: event.resource.kind,
      id: event.resource.id,
    },
    evidenceHash,
    replay: {
      mode: 'idempotent-event' as const,
      key: delivery.dedupeKey,
      orderingGuaranteed: false as const,
    },
  };
  const payload: ManagedAgentLifecycleReceipt = {
    schema: MANAGED_AGENT_LIFECYCLE_RECEIPT_SCHEMA,
    receiptId: `managed_${evidenceHash.slice('sha256:'.length, 'sha256:'.length + 20)}`,
    generatedAt: input.generatedAt,
    provider: 'anthropic.claude-managed-agents' as const,
    event,
    delivery,
    custody,
    authority,
    cael,
    uaal,
    integrity: {
      bodyHash: input.bodyHash,
      eventHash,
      evidenceHash,
      receiptHash: '',
    },
  };
  const receiptHash = stableHash(payload);
  return {
    ...payload,
    integrity: {
      ...payload.integrity,
      receiptHash,
    },
  };
}

export function verifyManagedAgentLifecycleReceipt(
  receipt: ManagedAgentLifecycleReceipt
): ManagedAgentLifecycleReceiptVerification {
  const blockers: string[] = [];
  if (receipt.schema !== MANAGED_AGENT_LIFECYCLE_RECEIPT_SCHEMA) {
    blockers.push(`schema must be ${MANAGED_AGENT_LIFECYCLE_RECEIPT_SCHEMA}`);
  }
  if (receipt.custody.secretValueIncluded !== false) {
    blockers.push('receipt must not include a webhook secret value');
  }
  if (
    receipt.authority.sourceOfTruth !== false ||
    receipt.authority.goldAuthority !== false ||
    receipt.authority.directMemoryPromotionAllowed !== false
  ) {
    blockers.push('external memory authority must remain disabled');
  }
  const replayed = buildManagedAgentLifecycleReceipt({
    event: receipt.event,
    delivery: {
      webhookId: receipt.delivery.webhookId,
      timestamp: receipt.delivery.timestamp,
      signatureHash: receipt.delivery.signatureHash,
    },
    bodyHash: receipt.integrity.bodyHash,
    secretRefHash: receipt.custody.secretRefHash,
    generatedAt: receipt.generatedAt,
  });
  const actualReceiptHash = stableHash({
    ...receipt,
    integrity: {
      ...receipt.integrity,
      receiptHash: '',
    },
  });
  if (receipt.integrity.eventHash !== replayed.integrity.eventHash) {
    blockers.push('event hash mismatch');
  }
  if (receipt.integrity.evidenceHash !== replayed.integrity.evidenceHash) {
    blockers.push('evidence hash mismatch');
  }
  if (
    receipt.integrity.receiptHash !== actualReceiptHash ||
    receipt.integrity.receiptHash !== replayed.integrity.receiptHash
  ) {
    blockers.push('receipt hash mismatch');
  }
  if (stableHash(receipt.cael) !== stableHash(replayed.cael)) {
    blockers.push('CAEL projection mismatch');
  }
  if (stableHash(receipt.uaal) !== stableHash(replayed.uaal)) {
    blockers.push('uAAL projection mismatch');
  }
  return {
    ok: blockers.length === 0,
    blockers,
    receiptHash: actualReceiptHash,
  };
}

export function replayManagedAgentLifecycleReceipt(
  receipt: ManagedAgentLifecycleReceipt
): ManagedAgentLifecycleReceipt {
  const verification = verifyManagedAgentLifecycleReceipt(receipt);
  if (!verification.ok) {
    throw new Error(`managed lifecycle receipt replay failed: ${verification.blockers.join('; ')}`);
  }
  return buildManagedAgentLifecycleReceipt({
    event: receipt.event,
    delivery: {
      webhookId: receipt.delivery.webhookId,
      timestamp: receipt.delivery.timestamp,
      signatureHash: receipt.delivery.signatureHash,
    },
    bodyHash: receipt.integrity.bodyHash,
    secretRefHash: receipt.custody.secretRefHash,
    generatedAt: receipt.generatedAt,
  });
}
