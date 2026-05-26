import {
  createHash,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';

export type LifePodJsonValue =
  | null
  | boolean
  | number
  | string
  | LifePodJsonValue[]
  | { [key: string]: LifePodJsonValue | undefined };

export type LifePodSigningKeyPair = {
  privateKeyPem: string;
  publicKeyPem: string;
};

export type LifePodSnapshot<TState = LifePodJsonValue> = {
  schema: 'holomesh.lifepod.snapshot.v1';
  lifePodId: string;
  createdAt: string;
  createdBy: string;
  signatureAlgorithm: 'ed25519';
  publicKeyPem: string;
  stateSha256: string;
  stateBytesBase64: string;
  signature: string;
  metadata?: Record<string, LifePodJsonValue | undefined>;
  stateType?: string;
};

export type RestoredLifePodSnapshot<TState = LifePodJsonValue> = {
  lifePodId: string;
  state: TState;
  stateBytes: Uint8Array;
  stateSha256: string;
  metadata: Record<string, LifePodJsonValue | undefined>;
  signatureVerified: true;
};

export class LifePodSignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LifePodSignatureVerificationError';
  }
}

export function generateLifePodSigningKeyPair(): LifePodSigningKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export function canonicalLifePodJson(value: unknown): string {
  if (value === null) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());

  const kind = typeof value;
  if (kind === 'string' || kind === 'boolean') return JSON.stringify(value);
  if (kind === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('LifePod state cannot contain non-finite numbers');
    return JSON.stringify(value);
  }
  if (kind === 'undefined') throw new TypeError('LifePod state cannot contain undefined');
  if (kind === 'bigint' || kind === 'function' || kind === 'symbol') {
    throw new TypeError(`LifePod state cannot contain ${kind}`);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalLifePodJson(item)).join(',')}]`;
  }

  if (kind === 'object') {
    const objectValue = value as Record<string, unknown>;
    const entries = Object.keys(objectValue)
      .sort()
      .filter((key) => objectValue[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalLifePodJson(objectValue[key])}`);
    return `{${entries.join(',')}}`;
  }

  throw new TypeError('Unsupported LifePod state value');
}

export function lifePodStateBytes(value: unknown): Uint8Array {
  return Buffer.from(canonicalLifePodJson(value), 'utf8');
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function signedPayload(snapshot: Omit<LifePodSnapshot, 'signature' | 'publicKeyPem'>): Uint8Array {
  return lifePodStateBytes({
    createdAt: snapshot.createdAt,
    createdBy: snapshot.createdBy,
    lifePodId: snapshot.lifePodId,
    metadata: snapshot.metadata ?? {},
    schema: snapshot.schema,
    signatureAlgorithm: snapshot.signatureAlgorithm,
    stateBytesBase64: snapshot.stateBytesBase64,
    stateSha256: snapshot.stateSha256,
    stateType: snapshot.stateType ?? null,
  });
}

function parseStateBytes<TState>(bytes: Uint8Array): TState {
  return JSON.parse(Buffer.from(bytes).toString('utf8')) as TState;
}

export function createLifePodSnapshot<TState extends LifePodJsonValue>(
  state: TState,
  options: {
    keyPair: LifePodSigningKeyPair;
    lifePodId?: string;
    createdAt?: string;
    createdBy?: string;
    metadata?: Record<string, LifePodJsonValue | undefined>;
    stateType?: string;
  }
): LifePodSnapshot<TState> {
  const stateBytes = lifePodStateBytes(state);
  const stateSha256 = sha256Hex(stateBytes);
  const unsigned = {
    schema: 'holomesh.lifepod.snapshot.v1' as const,
    lifePodId: options.lifePodId ?? `lifepod_${stateSha256.slice(0, 20)}`,
    createdAt: options.createdAt ?? new Date().toISOString(),
    createdBy: options.createdBy ?? 'unknown-agent',
    signatureAlgorithm: 'ed25519' as const,
    stateSha256,
    stateBytesBase64: Buffer.from(stateBytes).toString('base64'),
    metadata: options.metadata ?? {},
    stateType: options.stateType,
  };
  const signature = sign(null, signedPayload(unsigned), options.keyPair.privateKeyPem).toString('base64');

  return {
    ...unsigned,
    publicKeyPem: options.keyPair.publicKeyPem,
    signature,
  };
}

export function restoreLifePodSnapshot<TState extends LifePodJsonValue = LifePodJsonValue>(
  snapshot: LifePodSnapshot<TState>,
  options: { publicKeyPem?: string } = {}
): RestoredLifePodSnapshot<TState> {
  const stateBytes = Buffer.from(snapshot.stateBytesBase64, 'base64');
  const stateSha256 = sha256Hex(stateBytes);
  if (stateSha256 !== snapshot.stateSha256) {
    throw new LifePodSignatureVerificationError('LifePod signature verification failed: state digest mismatch');
  }

  const publicKeyPem = options.publicKeyPem ?? snapshot.publicKeyPem;
  const ok = verify(
    null,
    signedPayload(snapshot),
    publicKeyPem,
    Buffer.from(snapshot.signature, 'base64')
  );
  if (!ok) {
    throw new LifePodSignatureVerificationError('LifePod signature verification failed');
  }

  const state = parseStateBytes<TState>(stateBytes);
  const restoredBytes = lifePodStateBytes(state);
  if (Buffer.compare(Buffer.from(restoredBytes), stateBytes) !== 0) {
    throw new LifePodSignatureVerificationError('LifePod signature verification failed: non-canonical state bytes');
  }

  return {
    lifePodId: snapshot.lifePodId,
    state,
    stateBytes,
    stateSha256,
    metadata: snapshot.metadata ?? {},
    signatureVerified: true,
  };
}
