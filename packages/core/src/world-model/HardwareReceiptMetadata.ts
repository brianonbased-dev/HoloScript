/**
 * Portable hardware receipt metadata.
 *
 * CG-032 wedge: record hardware evidence in a vendor-neutral shape so
 * HoloScript receipts can travel across headsets, edge boxes, robots,
 * browsers, and embedded runtimes without collapsing into a vendor log.
 *
 * @module @holoscript/core/world-model
 */

export const HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION =
  'holoscript.hardware-receipt-metadata.v1' as const;

export type HardwareReceiptSchemaVersion =
  typeof HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION;

export interface HardwareReceiptTarget {
  readonly id: string;
  readonly kind: string;
  readonly architecture: string;
  readonly artifactKind: string;
}

export interface HardwareReceiptDevice {
  readonly vendor: string;
  readonly model: string;
  readonly accelerator: string | null;
  readonly driverVersions?: Readonly<Record<string, string>>;
  readonly deviceHash?: string;
}

export interface HardwareReceiptRuntime {
  readonly name: string;
  readonly version: string;
  readonly hostOS: string;
  readonly adapterFingerprint?: string;
}

export interface HardwareReceiptConstraint {
  readonly id: string;
  readonly description: string;
  readonly limit: string | number | boolean;
  readonly unit?: string;
  readonly source?: string;
}

export interface HardwareReceiptMeasuredResult {
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly method: string;
  readonly sampleCount?: number;
  readonly tolerance?: number;
}

export interface HardwareReceiptReplayInput {
  readonly kind: string;
  readonly uri: string;
  readonly sha256: string;
  readonly description?: string;
}

export interface HardwareReceiptProvenance {
  readonly capturedAt: string;
  readonly sourceCompositionHash: string;
  readonly commit?: string;
  readonly commandHash?: string;
  readonly trustReceiptId?: string;
  readonly simulationContractId?: string;
}

export interface HardwareReceiptOwner {
  readonly agent: string;
  readonly team?: string;
  readonly contact?: string;
}

export interface PortableHardwareReceiptMetadata {
  readonly schemaVersion: HardwareReceiptSchemaVersion;
  readonly target: HardwareReceiptTarget;
  readonly device: HardwareReceiptDevice;
  readonly runtime: HardwareReceiptRuntime;
  readonly compilerVersion: string;
  readonly constraints: readonly HardwareReceiptConstraint[];
  readonly measuredResults: readonly HardwareReceiptMeasuredResult[];
  readonly replayInputs: readonly HardwareReceiptReplayInput[];
  readonly provenance: HardwareReceiptProvenance;
  readonly owner: HardwareReceiptOwner;
}

export interface HardwareReceiptMetadataValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireText(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): void {
  if (!hasText(record[key])) {
    errors.push(`Missing ${path}.${key}`);
  }
}

function requireObject(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): Record<string, unknown> | null {
  const value = record[key];
  if (!isRecord(value)) {
    errors.push(`Missing ${key}`);
    return null;
  }
  return value;
}

function requireArray(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): readonly unknown[] | null {
  const value = record[key];
  if (!Array.isArray(value)) {
    errors.push(`Missing ${key}`);
    return null;
  }
  return value;
}

function validateConstraints(items: readonly unknown[], errors: string[]): void {
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`constraints[${index}] must be an object`);
      continue;
    }
    requireText(item, 'id', `constraints[${index}]`, errors);
    requireText(item, 'description', `constraints[${index}]`, errors);
    if (!['string', 'number', 'boolean'].includes(typeof item.limit)) {
      errors.push(`Missing constraints[${index}].limit`);
    }
  }
}

function validateMeasuredResults(items: readonly unknown[], errors: string[]): void {
  if (items.length === 0) {
    errors.push('measuredResults must include at least one measurement');
  }

  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`measuredResults[${index}] must be an object`);
      continue;
    }
    requireText(item, 'metric', `measuredResults[${index}]`, errors);
    if (typeof item.value !== 'number' || !Number.isFinite(item.value)) {
      errors.push(`Missing measuredResults[${index}].value`);
    }
    requireText(item, 'unit', `measuredResults[${index}]`, errors);
    requireText(item, 'method', `measuredResults[${index}]`, errors);
  }
}

function validateReplayInputs(items: readonly unknown[], errors: string[]): void {
  if (items.length === 0) {
    errors.push('replayInputs must include at least one replay input');
  }

  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`replayInputs[${index}] must be an object`);
      continue;
    }
    requireText(item, 'kind', `replayInputs[${index}]`, errors);
    requireText(item, 'uri', `replayInputs[${index}]`, errors);
    requireText(item, 'sha256', `replayInputs[${index}]`, errors);
  }
}

/**
 * Validate the portable hardware receipt metadata contract. This is intentionally
 * strict about identity, measurement, replay, provenance, and owner fields while
 * leaving vendor-specific driver details as optional metadata.
 */
export function validatePortableHardwareReceiptMetadata(
  receipt: unknown
): HardwareReceiptMetadataValidation {
  const errors: string[] = [];

  if (!isRecord(receipt)) {
    return { valid: false, errors: ['Hardware receipt metadata must be an object'] };
  }

  if (receipt.schemaVersion !== HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION}`
    );
  }

  const target = requireObject(receipt, 'target', errors);
  if (target) {
    requireText(target, 'id', 'target', errors);
    requireText(target, 'kind', 'target', errors);
    requireText(target, 'architecture', 'target', errors);
    requireText(target, 'artifactKind', 'target', errors);
  }

  const device = requireObject(receipt, 'device', errors);
  if (device) {
    requireText(device, 'vendor', 'device', errors);
    requireText(device, 'model', 'device', errors);
    if (device.accelerator !== null && device.accelerator !== undefined) {
      requireText(device, 'accelerator', 'device', errors);
    }
  }

  const runtime = requireObject(receipt, 'runtime', errors);
  if (runtime) {
    requireText(runtime, 'name', 'runtime', errors);
    requireText(runtime, 'version', 'runtime', errors);
    requireText(runtime, 'hostOS', 'runtime', errors);
  }

  requireText(receipt, 'compilerVersion', 'receipt', errors);

  const constraints = requireArray(receipt, 'constraints', errors);
  if (constraints) validateConstraints(constraints, errors);

  const measuredResults = requireArray(receipt, 'measuredResults', errors);
  if (measuredResults) validateMeasuredResults(measuredResults, errors);

  const replayInputs = requireArray(receipt, 'replayInputs', errors);
  if (replayInputs) validateReplayInputs(replayInputs, errors);

  const provenance = requireObject(receipt, 'provenance', errors);
  if (provenance) {
    requireText(provenance, 'capturedAt', 'provenance', errors);
    requireText(provenance, 'sourceCompositionHash', 'provenance', errors);
  }

  const owner = requireObject(receipt, 'owner', errors);
  if (owner) {
    requireText(owner, 'agent', 'owner', errors);
  }

  return { valid: errors.length === 0, errors };
}

export function isPortableHardwareReceiptMetadata(
  receipt: unknown
): receipt is PortableHardwareReceiptMetadata {
  return validatePortableHardwareReceiptMetadata(receipt).valid;
}
