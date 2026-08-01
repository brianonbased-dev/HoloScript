import { createHash, sign, verify, type KeyObject } from 'node:crypto';

import type { DeviceProfileId } from './device-release-plan';

export const DEVICE_RELEASE_INDEX_SCHEMA = 'holoscript-device-release-index/v0.1.0';

export interface DeviceReleaseIndexEntry {
  readonly profileId: DeviceProfileId;
  readonly phase: 'source-materialized';
  readonly sourceSha256: string;
  readonly planSha256: string;
  readonly materializationSha256: string;
}

export interface SignedDeviceReleaseIndex {
  readonly schema: typeof DEVICE_RELEASE_INDEX_SCHEMA;
  readonly issuedAt: string;
  readonly entries: readonly DeviceReleaseIndexEntry[];
  readonly claimBoundary: {
    readonly signatureVerifiedImpliesBuiltArtifacts: false;
    readonly signatureVerifiedImpliesHardwareCertified: false;
  };
  readonly signer: {
    readonly publicKeySpkiSha256: string;
  };
  readonly signature: {
    readonly algorithm: 'Ed25519';
    readonly payloadSha256: string;
    readonly valueBase64: string;
  };
}

export interface CreateSignedDeviceReleaseIndexInput {
  readonly issuedAt: string;
  readonly entries: readonly DeviceReleaseIndexEntry[];
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
}

export interface DeviceReleaseIndexVerification {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function publicKeyFingerprint(publicKey: KeyObject): string {
  const exported = publicKey.export({ type: 'spki', format: 'der' });
  return sha256(typeof exported === 'string' ? Buffer.from(exported) : exported);
}

function assertSha256(name: string, value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${name} must be a lowercase SHA-256 hash`);
}

function unsignedPayload(
  index: SignedDeviceReleaseIndex
): Omit<SignedDeviceReleaseIndex, 'signature'> {
  const { signature: _signature, ...payload } = index;
  return payload;
}

export function createSignedDeviceReleaseIndex(
  input: CreateSignedDeviceReleaseIndexInput
): SignedDeviceReleaseIndex {
  if (new Date(input.issuedAt).toISOString() !== input.issuedAt) {
    throw new Error('issuedAt must be a canonical ISO-8601 timestamp');
  }
  if (input.entries.length === 0) throw new Error('Release index requires at least one entry');
  for (const entry of input.entries) {
    assertSha256('sourceSha256', entry.sourceSha256);
    assertSha256('planSha256', entry.planSha256);
    assertSha256('materializationSha256', entry.materializationSha256);
  }
  const entries = [...input.entries].sort((left, right) =>
    left.profileId.localeCompare(right.profileId)
  );
  if (new Set(entries.map((entry) => entry.profileId)).size !== entries.length) {
    throw new Error('Release index cannot contain duplicate device profiles');
  }

  const payload: Omit<SignedDeviceReleaseIndex, 'signature'> = {
    schema: DEVICE_RELEASE_INDEX_SCHEMA,
    issuedAt: input.issuedAt,
    entries,
    claimBoundary: {
      signatureVerifiedImpliesBuiltArtifacts: false as const,
      signatureVerifiedImpliesHardwareCertified: false as const,
    },
    signer: { publicKeySpkiSha256: publicKeyFingerprint(input.publicKey) },
  };
  const canonicalPayload = canonicalJson(payload);
  return {
    ...payload,
    signature: {
      algorithm: 'Ed25519',
      payloadSha256: sha256(canonicalPayload),
      valueBase64: sign(null, Buffer.from(canonicalPayload), input.privateKey).toString('base64'),
    },
  };
}

export function verifySignedDeviceReleaseIndex(
  index: SignedDeviceReleaseIndex,
  publicKey: KeyObject
): DeviceReleaseIndexVerification {
  const errors: string[] = [];
  if (index.schema !== DEVICE_RELEASE_INDEX_SCHEMA) errors.push('schema mismatch');
  if (publicKeyFingerprint(publicKey) !== index.signer.publicKeySpkiSha256) {
    errors.push('signer fingerprint mismatch');
  }
  for (const entry of index.entries) {
    for (const [name, value] of Object.entries(entry).filter(([name]) => name.endsWith('Sha256'))) {
      if (!/^[a-f0-9]{64}$/.test(String(value))) errors.push(`${name} is malformed`);
    }
  }

  const canonicalPayload = canonicalJson(unsignedPayload(index));
  if (sha256(canonicalPayload) !== index.signature.payloadSha256) {
    errors.push('payload hash mismatch');
  }
  let signatureValid = false;
  try {
    signatureValid = verify(
      null,
      Buffer.from(canonicalPayload),
      publicKey,
      Buffer.from(index.signature.valueBase64, 'base64')
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) errors.push('signature verification failed');

  return { valid: errors.length === 0, errors };
}
