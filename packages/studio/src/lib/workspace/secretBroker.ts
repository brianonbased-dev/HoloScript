import { createHash } from 'crypto';

export interface SecretGrantInput {
  workspaceId: string;
  agentId: string;
  secretRef: string;
  capabilityRef: string;
  purpose: string;
  ttlSeconds?: number;
  now?: Date;
}

export interface SecretGrantReceipt {
  version: 1;
  grantId: string;
  workspaceId: string;
  agentId: string;
  secretRef: string;
  capabilityRef: string;
  purpose: string;
  issuedAt: string;
  expiresAt: string;
  accessMode: 'brokered-handle';
  plaintextReturned: false;
  receiptHash: string;
  auditTags: string[];
}

const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 60 * 60;

function normalizeRequired(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (/[\r\n]/.test(normalized)) throw new Error(`${field} must be single-line`);
  return normalized;
}

function ttlSeconds(value: number | undefined): number {
  if (value === undefined) return 15 * 60;
  if (!Number.isFinite(value)) return 15 * 60;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(value)));
}

function assertWorkspaceSecret(workspaceId: string, secretRef: string): void {
  const prefix = `secret://workspace/${workspaceId}/`;
  if (!secretRef.startsWith(prefix)) {
    throw new Error('secretRef must be a secret:// handle scoped to the workspace');
  }
}

function assertCapability(capabilityRef: string): void {
  if (!capabilityRef.startsWith('cap://daemon/secrets/')) {
    throw new Error('capabilityRef must be a daemon secret capability');
  }
}

function hashReceipt(value: Omit<SecretGrantReceipt, 'receiptHash'>): string {
  const canonical = JSON.stringify(value);
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function createSecretGrant(input: SecretGrantInput): SecretGrantReceipt {
  const workspaceId = normalizeRequired(input.workspaceId, 'workspaceId');
  const agentId = normalizeRequired(input.agentId, 'agentId');
  const secretRef = normalizeRequired(input.secretRef, 'secretRef');
  const capabilityRef = normalizeRequired(input.capabilityRef, 'capabilityRef');
  const purpose = normalizeRequired(input.purpose, 'purpose');
  assertWorkspaceSecret(workspaceId, secretRef);
  assertCapability(capabilityRef);

  const issuedAtDate = input.now ?? new Date();
  const expiresAtDate = new Date(issuedAtDate.getTime() + ttlSeconds(input.ttlSeconds) * 1000);
  const issuedAt = issuedAtDate.toISOString();
  const expiresAt = expiresAtDate.toISOString();
  const grantSeed = [workspaceId, agentId, secretRef, capabilityRef, purpose, issuedAt].join('|');
  const grantId = `sgrant_${createHash('sha256').update(grantSeed).digest('hex').slice(0, 24)}`;

  const unsigned: Omit<SecretGrantReceipt, 'receiptHash'> = {
    version: 1,
    grantId,
    workspaceId,
    agentId,
    secretRef,
    capabilityRef,
    purpose,
    issuedAt,
    expiresAt,
    accessMode: 'brokered-handle',
    plaintextReturned: false,
    auditTags: ['agent-secret-grant', 'handles-only', 'no-plaintext'],
  };

  return {
    ...unsigned,
    receiptHash: hashReceipt(unsigned),
  };
}
