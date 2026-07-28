import { sha256ReceiptHash } from '../board/receipt-hashing';

export const HOLOHUB_INSTALL_RECEIPT_VERSION = 'holohub.install-receipt.v0.1.0';

export const HOLOHUB_INSTALL_ARTIFACT_KINDS = ['plugin', 'trait'] as const;
export type HoloHubInstallArtifactKind = (typeof HOLOHUB_INSTALL_ARTIFACT_KINDS)[number];

export const HOLOHUB_INSTALL_PAYMENT_STATUSES = [
  'not_required',
  'required',
  'verified',
  'unavailable',
] as const;
export type HoloHubInstallPaymentStatus = (typeof HOLOHUB_INSTALL_PAYMENT_STATUSES)[number];

export const HOLOHUB_INSTALL_SIGNATURE_STATUSES = ['signed', 'unsigned', 'invalid'] as const;
export type HoloHubInstallSignatureStatus = (typeof HOLOHUB_INSTALL_SIGNATURE_STATUSES)[number];

export const HOLOHUB_INSTALL_DECISIONS = ['installable', 'blocked'] as const;
export type HoloHubInstallDecision = (typeof HOLOHUB_INSTALL_DECISIONS)[number];

export interface HoloHubInstallArtifact {
  kind: HoloHubInstallArtifactKind;
  id: string;
  name: string;
  version: string;
  packageUrl: string;
  shasum: string;
  sizeBytes: number;
  category?: string;
  author?: string;
  license?: string;
}

export interface HoloHubInstallListing {
  pricingModel: string;
  priceCents?: number;
  currency: string;
  marketplaceUrl: string;
}

export interface HoloHubInstallX402 {
  status: HoloHubInstallPaymentStatus;
  paymentId?: string;
  transactionHash?: string;
  payerAddress?: string;
  amount?: number;
  asset?: string;
  network?: string;
  contentId?: string;
  verifiedAt?: string;
  facilitator?: string;
}

export interface HoloHubInstallSignature {
  status: HoloHubInstallSignatureStatus;
  trusted: boolean;
  keyFingerprint?: string;
  author?: string;
  signedAt?: string;
  errors: string[];
  warnings: string[];
}

export interface HoloHubInstallCompatibility {
  targetStudioVersion?: string;
  targetPlatform?: string;
  compatible: boolean;
  warnings: string[];
  errors: string[];
}

export interface HoloHubInstallDependencies {
  installDependencies: boolean;
  resolved: Array<{ pluginId: string; version: string }>;
  conflicts: string[];
}

export interface HoloHubInstallPermissions {
  requested: string[];
  granted: string[];
  trustLevel: string;
}

export interface HoloHubInstallReceipt {
  schemaVersion: typeof HOLOHUB_INSTALL_RECEIPT_VERSION;
  id: string;
  generatedAt: string;
  artifact: HoloHubInstallArtifact;
  listing: HoloHubInstallListing;
  x402: HoloHubInstallX402;
  signature: HoloHubInstallSignature;
  compatibility: HoloHubInstallCompatibility;
  dependencies: HoloHubInstallDependencies;
  permissions: HoloHubInstallPermissions;
  decision: HoloHubInstallDecision;
  installCommand?: string;
  replayKey: string;
  hash: string;
  hashAlgorithm: 'sha256';
  provenance: string[];
}

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function validateStringArray(label: string, value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return;
  }

  for (const item of value) {
    if (!isNonEmptyString(item)) {
      errors.push(`${label} must contain only non-empty strings.`);
      return;
    }
  }
}

export function createHoloHubInstallReceipt(
  input: Omit<HoloHubInstallReceipt, 'hash' | 'hashAlgorithm'>
): HoloHubInstallReceipt {
  const draft = {
    ...input,
    hashAlgorithm: 'sha256' as const,
  };

  return {
    ...draft,
    hash: sha256ReceiptHash(draft as unknown as Record<string, unknown>),
  };
}

export function validateHoloHubInstallReceipt(receipt: HoloHubInstallReceipt): string[] {
  const errors: string[] = [];

  if (receipt.schemaVersion !== HOLOHUB_INSTALL_RECEIPT_VERSION) {
    errors.push('HoloHubInstallReceipt.schemaVersion is unsupported.');
  }
  if (!isNonEmptyString(receipt.id)) errors.push('HoloHubInstallReceipt.id is required.');
  if (!isIsoTimestamp(receipt.generatedAt)) {
    errors.push('HoloHubInstallReceipt.generatedAt must be a valid ISO-8601 timestamp.');
  }
  if (!isNonEmptyString(receipt.replayKey)) {
    errors.push('HoloHubInstallReceipt.replayKey is required.');
  }
  if (receipt.hashAlgorithm !== 'sha256') {
    errors.push('HoloHubInstallReceipt.hashAlgorithm must be sha256.');
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(receipt.hash)) {
    errors.push('HoloHubInstallReceipt.hash must be a sha256 receipt hash.');
  } else {
    const expected = sha256ReceiptHash(receipt as unknown as Record<string, unknown>);
    if (receipt.hash !== expected) {
      errors.push('HoloHubInstallReceipt.hash does not match the canonical receipt body.');
    }
  }

  if (!receipt.artifact) {
    errors.push('HoloHubInstallReceipt.artifact is required.');
  } else {
    if (!isOneOf(HOLOHUB_INSTALL_ARTIFACT_KINDS, receipt.artifact.kind)) {
      errors.push('HoloHubInstallArtifact.kind is unsupported.');
    }
    if (!isNonEmptyString(receipt.artifact.id)) {
      errors.push('HoloHubInstallArtifact.id is required.');
    }
    if (!isNonEmptyString(receipt.artifact.name)) {
      errors.push('HoloHubInstallArtifact.name is required.');
    }
    if (!isNonEmptyString(receipt.artifact.version)) {
      errors.push('HoloHubInstallArtifact.version is required.');
    }
    if (!isNonEmptyString(receipt.artifact.packageUrl)) {
      errors.push('HoloHubInstallArtifact.packageUrl is required.');
    }
    if (!isNonEmptyString(receipt.artifact.shasum) || !isSha256Hex(receipt.artifact.shasum)) {
      errors.push('HoloHubInstallArtifact.shasum must be a SHA-256 hex digest.');
    }
    if (!Number.isFinite(receipt.artifact.sizeBytes) || receipt.artifact.sizeBytes < 0) {
      errors.push('HoloHubInstallArtifact.sizeBytes must be a non-negative number.');
    }
  }

  if (!receipt.listing) {
    errors.push('HoloHubInstallReceipt.listing is required.');
  } else {
    if (!isNonEmptyString(receipt.listing.pricingModel)) {
      errors.push('HoloHubInstallListing.pricingModel is required.');
    }
    if (!isNonEmptyString(receipt.listing.currency)) {
      errors.push('HoloHubInstallListing.currency is required.');
    }
    if (!isNonEmptyString(receipt.listing.marketplaceUrl)) {
      errors.push('HoloHubInstallListing.marketplaceUrl is required.');
    }
  }

  if (!receipt.x402) {
    errors.push('HoloHubInstallReceipt.x402 is required.');
  } else if (!isOneOf(HOLOHUB_INSTALL_PAYMENT_STATUSES, receipt.x402.status)) {
    errors.push('HoloHubInstallX402.status is unsupported.');
  }

  if (!receipt.signature) {
    errors.push('HoloHubInstallReceipt.signature is required.');
  } else {
    if (!isOneOf(HOLOHUB_INSTALL_SIGNATURE_STATUSES, receipt.signature.status)) {
      errors.push('HoloHubInstallSignature.status is unsupported.');
    }
    if (typeof receipt.signature.trusted !== 'boolean') {
      errors.push('HoloHubInstallSignature.trusted must be a boolean.');
    }
    if (
      receipt.signature.status === 'signed' &&
      !isNonEmptyString(receipt.signature.keyFingerprint)
    ) {
      errors.push('HoloHubInstallSignature.keyFingerprint is required for signed artifacts.');
    }
    validateStringArray('HoloHubInstallSignature.errors', receipt.signature.errors, errors);
    validateStringArray('HoloHubInstallSignature.warnings', receipt.signature.warnings, errors);
  }

  if (!receipt.compatibility) {
    errors.push('HoloHubInstallReceipt.compatibility is required.');
  } else {
    if (typeof receipt.compatibility.compatible !== 'boolean') {
      errors.push('HoloHubInstallCompatibility.compatible must be a boolean.');
    }
    validateStringArray(
      'HoloHubInstallCompatibility.warnings',
      receipt.compatibility.warnings,
      errors
    );
    validateStringArray('HoloHubInstallCompatibility.errors', receipt.compatibility.errors, errors);
  }

  if (!receipt.dependencies) {
    errors.push('HoloHubInstallReceipt.dependencies is required.');
  } else {
    if (typeof receipt.dependencies.installDependencies !== 'boolean') {
      errors.push('HoloHubInstallDependencies.installDependencies must be a boolean.');
    }
    if (!Array.isArray(receipt.dependencies.resolved)) {
      errors.push('HoloHubInstallDependencies.resolved must be an array.');
    } else {
      for (const dep of receipt.dependencies.resolved) {
        if (!isNonEmptyString(dep.pluginId) || !isNonEmptyString(dep.version)) {
          errors.push('HoloHubInstallDependencies.resolved entries require pluginId and version.');
          break;
        }
      }
    }
    validateStringArray(
      'HoloHubInstallDependencies.conflicts',
      receipt.dependencies.conflicts,
      errors
    );
  }

  if (!receipt.permissions) {
    errors.push('HoloHubInstallReceipt.permissions is required.');
  } else {
    validateStringArray(
      'HoloHubInstallPermissions.requested',
      receipt.permissions.requested,
      errors
    );
    validateStringArray('HoloHubInstallPermissions.granted', receipt.permissions.granted, errors);
    if (!isNonEmptyString(receipt.permissions.trustLevel)) {
      errors.push('HoloHubInstallPermissions.trustLevel is required.');
    }

    const requested = new Set(receipt.permissions.requested);
    for (const granted of receipt.permissions.granted) {
      if (!requested.has(granted)) {
        errors.push(`Granted permission '${granted}' was not requested by the artifact.`);
      }
    }
  }

  if (!isOneOf(HOLOHUB_INSTALL_DECISIONS, receipt.decision)) {
    errors.push('HoloHubInstallReceipt.decision is unsupported.');
  }

  const paid = receipt.listing?.pricingModel !== 'free';
  if (paid && receipt.x402?.status !== 'verified') {
    errors.push('Paid HoloHub installs require a verified x402 receipt.');
  }
  if (receipt.decision === 'installable') {
    if (receipt.compatibility && !receipt.compatibility.compatible) {
      errors.push('Installable receipts cannot include blocking compatibility errors.');
    }
    if (receipt.dependencies?.conflicts.length) {
      errors.push('Installable receipts cannot include unresolved dependency conflicts.');
    }
  }

  validateStringArray('HoloHubInstallReceipt.provenance', receipt.provenance, errors);

  return errors;
}

export function cloneHoloHubInstallReceipt(receipt: HoloHubInstallReceipt): HoloHubInstallReceipt {
  return {
    ...receipt,
    artifact: { ...receipt.artifact },
    listing: { ...receipt.listing },
    x402: { ...receipt.x402 },
    signature: {
      ...receipt.signature,
      errors: [...receipt.signature.errors],
      warnings: [...receipt.signature.warnings],
    },
    compatibility: {
      ...receipt.compatibility,
      warnings: [...receipt.compatibility.warnings],
      errors: [...receipt.compatibility.errors],
    },
    dependencies: {
      installDependencies: receipt.dependencies.installDependencies,
      resolved: receipt.dependencies.resolved.map((dep) => ({ ...dep })),
      conflicts: [...receipt.dependencies.conflicts],
    },
    permissions: {
      ...receipt.permissions,
      requested: [...receipt.permissions.requested],
      granted: [...receipt.permissions.granted],
    },
    provenance: [...receipt.provenance],
  };
}

export function isSupportedHoloHubInstallPaymentStatus(
  value: string
): value is HoloHubInstallPaymentStatus {
  return isOneOf(HOLOHUB_INSTALL_PAYMENT_STATUSES, value);
}

export function isSupportedHoloHubInstallSignatureStatus(
  value: string
): value is HoloHubInstallSignatureStatus {
  return isOneOf(HOLOHUB_INSTALL_SIGNATURE_STATUSES, value);
}

export function isSupportedHoloHubInstallDecision(value: string): value is HoloHubInstallDecision {
  return isOneOf(HOLOHUB_INSTALL_DECISIONS, value);
}
