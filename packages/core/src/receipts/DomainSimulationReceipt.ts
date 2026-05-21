export const DOMAIN_SIMULATION_RECEIPT_SCHEMA =
  'holoscript.domain-simulation-receipt.v0.1.0' as const;

export type DomainSimulationReceiptSchema = typeof DOMAIN_SIMULATION_RECEIPT_SCHEMA;
export type DomainSimulationReceiptHashAlgorithm = 'fnv1a32';

export type DomainReceiptJson =
  | string
  | number
  | boolean
  | null
  | DomainReceiptJson[]
  | { [key: string]: DomainReceiptJson };

export interface DomainSimulationReceiptAcceptance {
  accepted: boolean;
  violations: Array<{ criterion: string; message: string }>;
}

export interface DomainSimulationReceiptInput {
  plugin: string;
  pluginVersion: string;
  runId: string;
  createdAt?: string;
  modelId?: string;
  solverConfig: {
    solverType: string;
    scale: string;
    [key: string]: DomainReceiptJson;
  };
  resultSummary: { [key: string]: DomainReceiptJson };
  acceptance: DomainSimulationReceiptAcceptance;
  cael?: {
    version?: 'cael.v1';
    event?: string;
    solverType?: string;
  };
  artifacts?: Array<{
    kind: string;
    path?: string;
    hash?: string;
  }>;
}

export interface DomainSimulationReceipt {
  schema: DomainSimulationReceiptSchema;
  plugin: string;
  pluginVersion: string;
  runId: string;
  createdAt: string;
  modelId?: string;
  solverConfig: {
    solverType: string;
    scale: string;
    [key: string]: DomainReceiptJson;
  };
  resultSummary: { [key: string]: DomainReceiptJson };
  cael: {
    version: 'cael.v1';
    event: string;
    solverType: string;
  };
  acceptance: DomainSimulationReceiptAcceptance;
  artifacts?: Array<{
    kind: string;
    path?: string;
    hash?: string;
  }>;
  payloadHash: string;
  hashAlgorithm: DomainSimulationReceiptHashAlgorithm;
}

export interface DomainSimulationReceiptVerification {
  valid: boolean;
  errors: string[];
}

export function buildDomainSimulationReceipt(
  input: DomainSimulationReceiptInput,
): DomainSimulationReceipt {
  const receiptWithoutHash = {
    schema: DOMAIN_SIMULATION_RECEIPT_SCHEMA,
    plugin: input.plugin,
    pluginVersion: input.pluginVersion,
    runId: input.runId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
    solverConfig: input.solverConfig,
    resultSummary: input.resultSummary,
    cael: {
      version: input.cael?.version ?? 'cael.v1',
      event: input.cael?.event ?? `${input.plugin}.simulation_receipt`,
      solverType: input.cael?.solverType ?? `${input.plugin}.${input.solverConfig.solverType}`,
    },
    acceptance: input.acceptance,
    ...(input.artifacts !== undefined ? { artifacts: input.artifacts } : {}),
  };

  return {
    ...receiptWithoutHash,
    payloadHash: stableDomainReceiptHash(receiptWithoutHash),
    hashAlgorithm: 'fnv1a32',
  };
}

export function verifyDomainSimulationReceipt(
  receipt: DomainSimulationReceipt,
): DomainSimulationReceiptVerification {
  const errors: string[] = [];
  const { payloadHash, hashAlgorithm, ...receiptWithoutHash } = receipt;
  if (hashAlgorithm !== 'fnv1a32') {
    errors.push(`unsupported hashAlgorithm: ${hashAlgorithm}`);
  }

  const expected = stableDomainReceiptHash(receiptWithoutHash);
  if (payloadHash !== expected) {
    errors.push(`payloadHash mismatch: expected ${expected}, got ${payloadHash}`);
  }

  if (receipt.cael.version !== 'cael.v1') {
    errors.push(`unsupported CAEL version: ${receipt.cael.version}`);
  }
  if (!receipt.solverConfig.solverType.trim()) {
    errors.push('solverConfig.solverType is required');
  }
  if (!receipt.solverConfig.scale.trim()) {
    errors.push('solverConfig.scale is required');
  }

  return { valid: errors.length === 0, errors };
}

export function stableDomainReceiptHash(payload: unknown): string {
  return `fnv1a32:${fnv1a32(canonicalizeDomainReceiptPayload(payload))}`;
}

export function canonicalizeDomainReceiptPayload(payload: unknown): string {
  return JSON.stringify(toDomainReceiptJson(payload));
}

function toDomainReceiptJson(value: unknown): DomainReceiptJson {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('[domain-receipt] Non-finite numbers are not receipt-safe');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toDomainReceiptJson(item));
  }
  if (typeof value === 'object') {
    const out: { [key: string]: DomainReceiptJson } = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        out[key] = toDomainReceiptJson(entry);
      }
    }
    return out;
  }

  throw new Error(`[domain-receipt] Unsupported receipt payload value: ${typeof value}`);
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
