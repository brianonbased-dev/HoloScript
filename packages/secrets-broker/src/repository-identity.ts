import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';

/**
 * HoloKey is the designated sole durable authority for repository identities.
 *
 * This module is the authority contract and bootstrap implementation. Injected
 * verifier/store capabilities are dependencies, not proof that an authenticated
 * durable HoloKey root issued or persisted a result. Production graduation stays
 * blocked until HoloKey supplies authenticated authority-root readback evidence.
 * The `holorepo.*` constants below name deprecated wire projections only and are
 * deliberately absent from every mutation input.
 */
export const HOLOKEY_REPOSITORY_IDENTITY_SCHEMA = 'holokey.repository-identity.v1';
export const HOLOKEY_REPOSITORY_AUTHORITY_INTENT_SCHEMA = 'holokey.repository-authority-intent.v1';
export const HOLOKEY_REPOSITORY_APPROVAL_SCHEMA = 'holokey.repository-authority-approval.v1';
export const HOLOKEY_REPOSITORY_CHECKPOINT_SCHEMA = 'holokey.repository-identity-checkpoint.v1';
export const HOLOKEY_REPOSITORY_TRANSITION_RECEIPT_SCHEMA =
  'holokey.repository-identity-transition-receipt.v1';
export const HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_SCHEMA =
  'holokey.repository-identity-compare-and-commit.v1';
export const HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_RESULT_SCHEMA =
  'holokey.repository-identity-compare-and-commit-result.v1';
export const HOLOKEY_REPOSITORY_IDENTITY_EVIDENCE_SCHEMA =
  'holokey.repository-identity-evidence.v1';
export const HOLOKEY_REPOSITORY_IDENTITY_VERIFICATION_SCHEMA =
  'holokey.repository-identity-verification.v1';
export const HOLOKEY_SIGNATURE_SCHEME = 'eip191_secp256k1';
export const MAX_APPROVALS = 32;

/** @deprecated Compatibility projection only. HoloRepo is not an identity authority. */
export const REPOSITORY_IDENTITY_SCHEMA = 'holorepo.repository-identity.v1';
/** @deprecated Compatibility projection only. HoloRepo is not an identity authority. */
export const REPOSITORY_AUTHORITY_ENVELOPE_SCHEMA = 'holorepo.repository-authority-envelope.v1';
/** @deprecated Compatibility projection only. HoloRepo is not an identity authority. */
export const REPOSITORY_AUTHORITY_APPROVAL_SCHEMA = 'holorepo.repository-authority-approval.v1';
/** @deprecated Compatibility projection only. HoloRepo is not an identity authority. */
export const REPOSITORY_DETACHED_SIGNATURE_SCHEMA = 'holorepo.detached-signature.v1';
/** @deprecated Compatibility projection only. HoloRepo is not an identity authority. */
export const REPOSITORY_IDENTITY_CHECKPOINT_SCHEMA = 'holorepo.repository-identity-checkpoint.v1';
/** @deprecated Compatibility projection only. HoloRepo is not an identity authority. */
export const REPOSITORY_IDENTITY_TRANSITION_RECEIPT_SCHEMA =
  'holorepo.repository-identity-transition-receipt.v1';
/** @deprecated Compatibility projection only. HoloRepo is not an identity authority. */
export const REPOSITORY_IDENTITY_LEDGER_SCHEMA = 'holorepo.repository-identity-ledger.v1';

export const REPOSITORY_IDENTITY_ACTIONS = [
  'promote',
  'rotate',
  'revoke',
  'migrate',
  'recover',
] as const;

export type RepositoryIdentityAction = (typeof REPOSITORY_IDENTITY_ACTIONS)[number];
export type RepositoryIdentityState = 'provisional' | 'active' | 'revoked';
export type RepositoryApprovalRole = 'bootstrap' | 'controller' | 'successor' | 'recovery';

type JsonPrimitive = null | boolean | number | string;
export type CanonicalJsonValue =
  | JsonPrimitive
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export interface RepositoryIdentityCanonicalizationLimits {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxContainerEntries: number;
  readonly maxStringBytes: number;
  readonly maxKeyBytes: number;
  readonly maxSerializedBytes: number;
}

const DEFAULT_CANONICALIZATION_LIMITS: RepositoryIdentityCanonicalizationLimits = Object.freeze({
  maxDepth: 24,
  maxNodes: 4_096,
  maxContainerEntries: 512,
  maxStringBytes: 16_384,
  maxKeyBytes: 256,
  maxSerializedBytes: 262_144,
});

const HASH_RE = /^sha256:[a-f0-9]{64}$/u;
const RECEIPT_DIGEST_RE = /^(?:sha256:[a-f0-9]{64}|sha512:[a-f0-9]{128})$/u;
const NONCE_RE = /^[a-f0-9]{32}$/u;
const SIGNATURE_RE = /^0x[a-fA-F0-9]{130}$/u;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{2,239}$/u;
const KEY_REF_RE = /^holokey:[A-Za-z0-9][A-Za-z0-9._/\-]{2,191}$/u;
const RAW_KEY_MATERIAL_RE = /^(?:0x)?[a-fA-F0-9]{64,130}$/u;
const CANONICAL_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/u;
const PERCENT_ENCODED_OCTET_RE = /%[0-9A-Fa-f]{2}/u;
const LOCAL_PATH_RE =
  /^(?:[A-Za-z]:[\\/]|\\\\|file:\/\/|\/(?:Users|home|tmp|var|mnt|opt|etc)(?:\/|\b))/u;
const PATH_TRAVERSAL_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/u;
const SECRET_VALUE_RE =
  /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]+|\b(?:github_pat_|gh[pousr]_|sk_(?:live|test)_|xox[baprs]-|AKIA|ASIA)[A-Za-z0-9_-]{8,})/u;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_AUTHORITY_TTL_MS = 24 * 60 * 60 * 1_000;
const REPOSITORY_SOUL_SCHEMA = 'holorepo.repository-soul.v1';
const ACTION_SET = new Set<string>(REPOSITORY_IDENTITY_ACTIONS);
const STATE_SET = new Set<RepositoryIdentityState>(['provisional', 'active', 'revoked']);
const LOCAL_BOOTSTRAP_PROVISIONAL_RESULTS = new WeakSet<object>();
const LOCAL_BOOTSTRAP_TRANSITION_RESULTS = new WeakSet<object>();

export type RepositoryIdentityErrorCode =
  | 'INVALID_CAPABILITY'
  | 'INVALID_INPUT'
  | 'CANONICALIZATION_REJECTED'
  | 'IDENTITY_INVALID'
  | 'INTENT_INVALID'
  | 'APPROVAL_INVALID'
  | 'SIGNATURE_REJECTED'
  | 'AUTHORITY_EXPIRED'
  | 'AUTHORITY_NOT_YET_VALID'
  | 'STORE_RESPONSE_INVALID'
  | 'STORE_CONFLICT'
  | 'STORE_FAILURE';

export class RepositoryIdentityAuthorityError extends Error {
  readonly code: RepositoryIdentityErrorCode;

  constructor(code: RepositoryIdentityErrorCode, message: string) {
    super(message);
    this.name = 'RepositoryIdentityAuthorityError';
    this.code = code;
  }
}

export interface RepositoryIdentityClock {
  now(): Date | string;
}

export interface RepositoryBinding {
  readonly repoId: string;
  readonly source: string;
  readonly canonicalRef: string;
}

export interface RepositorySoulRef {
  readonly schema: typeof REPOSITORY_SOUL_SCHEMA;
  readonly soulHash: string;
  readonly sourceDigest: string | null;
}

export interface RepositoryIdentityCustody {
  readonly mode: 'caller-owned';
  readonly bootstrapKeyRef: string;
  readonly recoveryKeyRefs: readonly string[];
  readonly recoveryThreshold: number;
}

export interface RepositoryIdentityLineage {
  readonly rootIdentityId: string;
  readonly previousIdentityHash: string | null;
  readonly transitionIntentHash: string | null;
}

export interface RepositoryIdentity {
  readonly schema: typeof HOLOKEY_REPOSITORY_IDENTITY_SCHEMA;
  readonly identityId: string;
  readonly state: RepositoryIdentityState;
  readonly generation: number;
  readonly repository: RepositoryBinding;
  readonly controllerKeyRef: string | null;
  readonly custody: RepositoryIdentityCustody;
  readonly soulRef: RepositorySoulRef;
  readonly lineage: RepositoryIdentityLineage;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly identityHash: string;
}

export interface RepositoryApprovalRequirement {
  readonly role: RepositoryApprovalRole;
  readonly keyRefs: readonly string[];
  readonly threshold: number;
}

export type RepositoryTransitionTarget =
  | { readonly controllerKeyRef: string }
  | { readonly reasonRef: string }
  | { readonly repository: RepositoryBinding; readonly controllerKeyRef: string };

export interface RepositoryAuthoritySubject {
  readonly identityId: string;
  readonly identityHash: string;
  readonly state: RepositoryIdentityState;
  readonly generation: number;
  readonly previousIntentHash: string | null;
}

export interface RepositoryAuthorityIntent {
  readonly schema: typeof HOLOKEY_REPOSITORY_AUTHORITY_INTENT_SCHEMA;
  readonly action: RepositoryIdentityAction;
  readonly subject: RepositoryAuthoritySubject;
  readonly sequence: number;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly authorityRef: string;
  readonly decisionRef: string;
  readonly target: RepositoryTransitionTarget;
  readonly requiredApprovals: readonly RepositoryApprovalRequirement[];
  readonly payloadHash: string;
  readonly signingMessage: string;
}

export interface RepositoryDetachedApproval {
  readonly schema: typeof HOLOKEY_REPOSITORY_APPROVAL_SCHEMA;
  readonly role: RepositoryApprovalRole;
  readonly keyRef: string;
  readonly scheme: typeof HOLOKEY_SIGNATURE_SCHEME;
  readonly payloadHash: string;
  readonly signature: string;
}

export interface RepositorySignatureVerificationRequest {
  readonly schema: typeof HOLOKEY_REPOSITORY_APPROVAL_SCHEMA;
  readonly role: RepositoryApprovalRole;
  readonly keyRef: string;
  readonly scheme: typeof HOLOKEY_SIGNATURE_SCHEME;
  readonly payloadHash: string;
  readonly signingMessage: string;
  readonly signingMessageHash: string;
  readonly signature: string;
  readonly signatureDigest: string;
}

export interface RepositorySignatureVerificationResult {
  readonly ok: true;
  readonly role: RepositoryApprovalRole;
  readonly keyRef: string;
  readonly scheme: typeof HOLOKEY_SIGNATURE_SCHEME;
  readonly payloadHash: string;
  readonly signingMessageHash: string;
  readonly signatureDigest: string;
  readonly signerRef: string;
  readonly receiptDigest: string;
}

export interface RepositoryIdentitySignatureVerifier {
  verify(
    request: RepositorySignatureVerificationRequest
  ): RepositorySignatureVerificationResult | Promise<RepositorySignatureVerificationResult>;
}

export interface RepositoryIdentityCheckpoint {
  readonly schema: typeof HOLOKEY_REPOSITORY_CHECKPOINT_SCHEMA;
  readonly identityId: string;
  readonly identityHash: string;
  readonly state: RepositoryIdentityState;
  readonly generation: number;
  readonly transitionIntentHash: string | null;
}

export interface RepositoryIdentityTransitionReceipt {
  readonly schema: typeof HOLOKEY_REPOSITORY_TRANSITION_RECEIPT_SCHEMA;
  readonly action: RepositoryIdentityAction;
  readonly sequence: number;
  readonly expectedCheckpointHash: string;
  readonly nonceHash: string;
  readonly payloadHash: string;
  readonly intentHash: string;
  readonly previousIdentityHash: string;
  readonly nextIdentityHash: string;
  readonly approvalReceiptDigests: readonly string[];
  readonly intentIssuedAt: string;
  readonly intentExpiresAt: string;
  readonly receiptHash: string;
}

export interface RepositoryIdentityCompareAndCommitRequest {
  readonly schema: typeof HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_SCHEMA;
  readonly expectedCheckpoint: RepositoryIdentityCheckpoint;
  readonly expectedCheckpointHash: string;
  readonly nonceHash: string;
  readonly payloadHash: string;
  readonly intentHash: string;
  readonly intentIssuedAt: string;
  readonly intentExpiresAt: string;
  readonly nextIdentityHash: string;
  readonly transitionReceiptHash: string;
  readonly nextIdentity: RepositoryIdentity;
  readonly transitionReceipt: RepositoryIdentityTransitionReceipt;
  readonly requestHash: string;
}

export type RepositoryIdentityCommitStatus = 'committed' | 'replayed-exact' | 'conflict';

export interface RepositoryIdentityCompareAndCommitResult {
  readonly schema: typeof HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_RESULT_SCHEMA;
  readonly status: RepositoryIdentityCommitStatus;
  readonly requestHash: string;
  readonly expectedCheckpointHash: string;
  readonly nonceHash: string;
  readonly payloadHash: string;
  readonly intentHash: string;
  readonly intentIssuedAt: string;
  readonly intentExpiresAt: string;
  readonly nextIdentityHash: string;
  readonly transitionReceiptHash: string;
  readonly receiptDigest: string;
}

export interface RepositoryIdentityAuthorityStore {
  /**
   * Implementations MUST enforce `intentIssuedAt` and `intentExpiresAt` with a
   * trusted store clock inside the same atomic transaction as checkpoint/nonce
   * comparison and commit. The signed timestamps are constraints, not a clock.
   */
  compareAndCommit(
    request: RepositoryIdentityCompareAndCommitRequest
  ): RepositoryIdentityCompareAndCommitResult | Promise<RepositoryIdentityCompareAndCommitResult>;
}

export interface RepositoryIdentityAuthorityCapabilities {
  readonly clock: RepositoryIdentityClock;
  readonly signatureVerifier: RepositoryIdentitySignatureVerifier;
  readonly authorityStore: RepositoryIdentityAuthorityStore;
}

export interface RepositoryIdentityTransitionResult {
  readonly status: Exclude<RepositoryIdentityCommitStatus, 'conflict'>;
  readonly authorityEvidence: 'caller-injected-contract-capabilities';
  readonly identity: RepositoryIdentity;
  readonly transitionReceipt: RepositoryIdentityTransitionReceipt;
  readonly storeReceipt: RepositoryIdentityCompareAndCommitResult;
}

export type HoloKeyIdentityAuthorityEvidence = 'caller-injected-contract-capabilities';

interface TraversalState {
  nodes: number;
  readonly seen: WeakSet<object>;
  readonly limits: RepositoryIdentityCanonicalizationLimits;
}

function fail(code: RepositoryIdentityErrorCode, message: string): never {
  throw new RepositoryIdentityAuthorityError(code, message);
}

function normalizeLimits(
  limits: Partial<RepositoryIdentityCanonicalizationLimits> | undefined
): RepositoryIdentityCanonicalizationLimits {
  if (limits === undefined) return DEFAULT_CANONICALIZATION_LIMITS;
  if (limits === null || typeof limits !== 'object' || isProxy(limits)) {
    fail('CANONICALIZATION_REJECTED', 'canonicalization limits must be an own-data record');
  }
  const proto = Object.getPrototypeOf(limits);
  if (proto !== Object.prototype && proto !== null) {
    fail('CANONICALIZATION_REJECTED', 'canonicalization limits must be a plain record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(limits);
  const allowed = new Set(Object.keys(DEFAULT_CANONICALIZATION_LIMITS));
  const merged: Record<string, number> = { ...DEFAULT_CANONICALIZATION_LIMITS };
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      fail('CANONICALIZATION_REJECTED', 'canonicalization limits contain an unknown field');
    }
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
      fail('CANONICALIZATION_REJECTED', 'canonicalization limits must use enumerable data fields');
    }
    merged[key] = descriptor.value as number;
  }
  for (const [name, value] of Object.entries(merged)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      fail(
        'CANONICALIZATION_REJECTED',
        `canonicalization limit ${name} must be a positive integer`
      );
    }
  }
  return Object.freeze(merged) as unknown as RepositoryIdentityCanonicalizationLimits;
}

function assertCanonicalString(value: string, label: string, maxBytes: number): string {
  if (value.normalize('NFC') !== value) {
    fail('CANONICALIZATION_REJECTED', `${label} must use Unicode NFC`);
  }
  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    fail('CANONICALIZATION_REJECTED', `${label} exceeds its UTF-8 byte limit`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail('CANONICALIZATION_REJECTED', `${label} contains an unpaired surrogate`);
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail('CANONICALIZATION_REJECTED', `${label} contains an unpaired surrogate`);
    }
  }
  return value;
}

function visitOwnJson(value: unknown, depth: number, state: TraversalState): CanonicalJsonValue {
  state.nodes += 1;
  if (state.nodes > state.limits.maxNodes) {
    fail('CANONICALIZATION_REJECTED', 'canonical value exceeds its node limit');
  }
  if (depth > state.limits.maxDepth) {
    fail('CANONICALIZATION_REJECTED', 'canonical value exceeds its depth limit');
  }

  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return assertCanonicalString(value, 'string value', state.limits.maxStringBytes);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail(
        'CANONICALIZATION_REJECTED',
        'canonical numbers must be finite and cannot be negative zero'
      );
    }
    return value;
  }
  if (typeof value !== 'object') {
    fail('CANONICALIZATION_REJECTED', 'canonical values must be JSON data');
  }
  if (isProxy(value)) {
    fail('CANONICALIZATION_REJECTED', 'proxy values are not accepted');
  }
  if (state.seen.has(value)) {
    fail('CANONICALIZATION_REJECTED', 'cyclic values are not accepted');
  }
  state.seen.add(value);

  const proto = Object.getPrototypeOf(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some((key) => typeof key === 'symbol')) {
    fail('CANONICALIZATION_REJECTED', 'symbol keys are not accepted');
  }

  if (Array.isArray(value)) {
    if (proto !== Array.prototype) {
      fail('CANONICALIZATION_REJECTED', 'array subclasses are not accepted');
    }
    if (value.length > state.limits.maxContainerEntries) {
      fail('CANONICALIZATION_REJECTED', 'array exceeds its entry limit');
    }
    const allowedKeys = new Set<string>(['length']);
    const result: CanonicalJsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      allowedKeys.add(key);
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
        fail('CANONICALIZATION_REJECTED', 'sparse arrays and array accessors are not accepted');
      }
      result.push(visitOwnJson(descriptor.value, depth + 1, state));
    }
    for (const key of ownKeys) {
      if (typeof key === 'string' && !allowedKeys.has(key)) {
        fail('CANONICALIZATION_REJECTED', 'arrays with extra own properties are not accepted');
      }
    }
    state.seen.delete(value);
    return result;
  }

  if (proto !== Object.prototype && proto !== null) {
    fail('CANONICALIZATION_REJECTED', 'only plain own-data records are accepted');
  }
  if (ownKeys.length > state.limits.maxContainerEntries) {
    fail('CANONICALIZATION_REJECTED', 'record exceeds its entry limit');
  }
  const entries: Array<[string, CanonicalJsonValue]> = [];
  for (const key of ownKeys) {
    if (typeof key !== 'string') continue;
    assertCanonicalString(key, 'record key', state.limits.maxKeyBytes);
    if (DANGEROUS_KEYS.has(key)) {
      fail('CANONICALIZATION_REJECTED', 'prototype-mutating record keys are not accepted');
    }
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
      fail(
        'CANONICALIZATION_REJECTED',
        'record accessors and non-enumerable fields are not accepted'
      );
    }
    entries.push([key, visitOwnJson(descriptor.value, depth + 1, state)]);
  }
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const result = Object.create(null) as Record<string, CanonicalJsonValue>;
  for (const [key, child] of entries) result[key] = child;
  state.seen.delete(value);
  return result;
}

/**
 * Canonicalize bounded JSON-compatible own data without invoking accessors.
 * Proxies, custom prototypes, cycles, sparse arrays, symbols, coercion, and
 * non-finite numbers are rejected before hashing.
 */
export function canonicalizeRepositoryIdentityValue(
  value: unknown,
  limits?: Partial<RepositoryIdentityCanonicalizationLimits>
): string {
  const normalizedLimits = normalizeLimits(limits);
  const canonical = JSON.stringify(
    visitOwnJson(value, 0, {
      nodes: 0,
      seen: new WeakSet<object>(),
      limits: normalizedLimits,
    })
  );
  if (Buffer.byteLength(canonical, 'utf8') > normalizedLimits.maxSerializedBytes) {
    fail('CANONICALIZATION_REJECTED', 'canonical value exceeds its serialized byte limit');
  }
  return canonical;
}

export function hashRepositoryIdentityValue(value: unknown): string {
  return sha256Utf8(canonicalizeRepositoryIdentityValue(value));
}

function sha256Utf8(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function detachedSignatureDigest(value: string): string {
  return `sha256:${createHash('sha256')
    .update(Buffer.from(value.slice(2), 'hex'))
    .digest('hex')}`;
}

function ownJsonClone<T>(value: unknown): T {
  return JSON.parse(canonicalizeRepositoryIdentityValue(value)) as T;
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_INPUT', `${label} must be a record`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string
): void {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail('INVALID_INPUT', `${label} is missing ${key}`);
    }
  }
  for (const key of keys) {
    if (!allowed.has(key)) fail('INVALID_INPUT', `${label} contains an unknown field`);
  }
}

function portableRef(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !REF_RE.test(value) ||
    CONTROL_RE.test(value) ||
    LOCAL_PATH_RE.test(value) ||
    PATH_TRAVERSAL_RE.test(value) ||
    SECRET_VALUE_RE.test(value)
  ) {
    fail('INVALID_INPUT', `${label} must be a portable non-secret reference`);
  }
  return value;
}

function keyReference(value: unknown, label: string): string {
  if (typeof value !== 'string' || !KEY_REF_RE.test(value)) {
    fail('INVALID_INPUT', `${label} must be a bounded holokey: reference`);
  }
  const identifier = value.slice('holokey:'.length);
  if (
    RAW_KEY_MATERIAL_RE.test(identifier) ||
    CONTROL_RE.test(value) ||
    PATH_TRAVERSAL_RE.test(value) ||
    SECRET_VALUE_RE.test(value)
  ) {
    fail('INVALID_INPUT', `${label} must name a key handle and cannot contain key material`);
  }
  return value;
}

function digest(value: unknown, label: string, receipt = false): string {
  if (typeof value !== 'string' || !(receipt ? RECEIPT_DIGEST_RE : HASH_RE).test(value)) {
    fail('INVALID_INPUT', `${label} must be an exact digest`);
  }
  return value;
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !CANONICAL_TIMESTAMP_RE.test(value)) {
    fail('INVALID_INPUT', `${label} must be a canonical UTC timestamp with milliseconds`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    fail('INVALID_INPUT', `${label} must be a real canonical UTC timestamp`);
  }
  return value;
}

function trustedNow(clock: RepositoryIdentityClock): string {
  if (!clock || typeof clock.now !== 'function') {
    fail('INVALID_CAPABILITY', 'an explicit trusted clock capability is required');
  }
  let timestamp: string;
  try {
    const value = clock.now();
    if (typeof value === 'string') {
      timestamp = value;
    } else if (
      value !== null &&
      typeof value === 'object' &&
      !isProxy(value) &&
      Object.getPrototypeOf(value) === Date.prototype
    ) {
      timestamp = Date.prototype.toISOString.call(value);
    } else {
      fail('INVALID_CAPABILITY', 'the trusted clock returned an unsupported value');
    }
  } catch {
    fail('INVALID_CAPABILITY', 'the trusted clock capability failed or returned an invalid date');
  }
  return canonicalTimestamp(timestamp, 'trusted clock result');
}

function canonicalExpiry(issuedAt: string, ttlMs: number): string {
  const expiresAtMs = Date.parse(issuedAt) + ttlMs;
  if (!Number.isFinite(expiresAtMs)) {
    fail('INVALID_INPUT', 'authority intent expiry is outside the canonical timestamp range');
  }
  let expiresAt: string;
  try {
    expiresAt = new Date(expiresAtMs).toISOString();
  } catch {
    fail('INVALID_INPUT', 'authority intent expiry is outside the canonical timestamp range');
  }
  if (!CANONICAL_TIMESTAMP_RE.test(expiresAt)) {
    fail('INVALID_INPUT', 'authority intent expiry is outside the canonical timestamp range');
  }
  return canonicalTimestamp(expiresAt, 'authority intent expiresAt');
}

function repositoryBinding(value: unknown, label = 'repository'): RepositoryBinding {
  const root = record(value, label);
  exactKeys(root, ['repoId', 'source', 'canonicalRef'], [], label);
  const repoId = portableRef(root.repoId, `${label}.repoId`);
  const canonicalRef = portableRef(root.canonicalRef, `${label}.canonicalRef`);
  if (typeof root.source !== 'string') fail('INVALID_INPUT', `${label}.source must be a URL`);
  if (PERCENT_ENCODED_OCTET_RE.test(root.source)) {
    fail('INVALID_INPUT', `${label}.source must be a credential-free http(s) URL`);
  }
  let parsed: URL;
  try {
    parsed = new URL(root.source);
  } catch {
    fail('INVALID_INPUT', `${label}.source must be a credential-free http(s) URL`);
  }
  const normalizedSource = parsed.toString();
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    Buffer.byteLength(root.source, 'utf8') > 2_048 ||
    CONTROL_RE.test(root.source) ||
    SECRET_VALUE_RE.test(root.source) ||
    PERCENT_ENCODED_OCTET_RE.test(normalizedSource)
  ) {
    fail('INVALID_INPUT', `${label}.source must be a credential-free http(s) URL`);
  }
  const source = normalizedSource
    .replace(/\.git\/?$/u, '')
    .replace(/\/$/u, '');
  return freezeDeep({ repoId, source, canonicalRef });
}

function soulReference(value: unknown): RepositorySoulRef {
  const root = record(value, 'soulRef');
  exactKeys(root, ['schema', 'soulHash'], ['sourceDigest'], 'soulRef');
  if (root.schema !== REPOSITORY_SOUL_SCHEMA) {
    fail('INVALID_INPUT', `soulRef.schema must be ${REPOSITORY_SOUL_SCHEMA}`);
  }
  return freezeDeep({
    schema: REPOSITORY_SOUL_SCHEMA,
    soulHash: digest(root.soulHash, 'soulRef.soulHash'),
    sourceDigest:
      root.sourceDigest === undefined || root.sourceDigest === null
        ? null
        : digest(root.sourceDigest, 'soulRef.sourceDigest'),
  });
}

function custody(value: unknown): RepositoryIdentityCustody {
  const root = record(value, 'custody');
  exactKeys(
    root,
    ['mode', 'bootstrapKeyRef', 'recoveryKeyRefs', 'recoveryThreshold'],
    [],
    'custody'
  );
  if (root.mode !== 'caller-owned') fail('INVALID_INPUT', 'custody.mode must be caller-owned');
  if (!Array.isArray(root.recoveryKeyRefs) || root.recoveryKeyRefs.length === 0) {
    fail('INVALID_INPUT', 'custody.recoveryKeyRefs must be a non-empty array');
  }
  const recoveryKeyRefs = root.recoveryKeyRefs.map((item, index) =>
    keyReference(item, `custody.recoveryKeyRefs[${index}]`)
  );
  if (recoveryKeyRefs.length > MAX_APPROVALS - 1) {
    fail('INVALID_INPUT', 'custody recovery key count exceeds the recoverable approval bound');
  }
  if (new Set(recoveryKeyRefs).size !== recoveryKeyRefs.length) {
    fail('INVALID_INPUT', 'custody.recoveryKeyRefs must be unique');
  }
  if (
    !Number.isSafeInteger(root.recoveryThreshold) ||
    Number(root.recoveryThreshold) < 1 ||
    Number(root.recoveryThreshold) > recoveryKeyRefs.length ||
    Number(root.recoveryThreshold) + 1 > MAX_APPROVALS
  ) {
    fail('INVALID_INPUT', 'custody.recoveryThreshold is outside the recovery key set');
  }
  return freezeDeep({
    mode: 'caller-owned',
    bootstrapKeyRef: keyReference(root.bootstrapKeyRef, 'custody.bootstrapKeyRef'),
    recoveryKeyRefs,
    recoveryThreshold: Number(root.recoveryThreshold),
  });
}

function identityIdFor(repository: RepositoryBinding): string {
  return `repository:${hashRepositoryIdentityValue({
    schema: 'holokey.repository-binding.v1',
    repository,
  }).slice('sha256:'.length)}`;
}

function identityMaterial(identity: Omit<RepositoryIdentity, 'identityHash'>): unknown {
  return identity;
}

function sealIdentity(identity: Omit<RepositoryIdentity, 'identityHash'>): RepositoryIdentity {
  return freezeDeep({
    ...identity,
    identityHash: hashRepositoryIdentityValue(identityMaterial(identity)),
  });
}

export interface BuildProvisionalRepositoryIdentityInput {
  readonly repository: RepositoryBinding;
  readonly custody: RepositoryIdentityCustody;
  readonly soulRef: RepositorySoulRef;
}

export function buildProvisionalRepositoryIdentity(
  input: unknown,
  capabilities: { readonly clock: RepositoryIdentityClock }
): RepositoryIdentity {
  const root = ownJsonClone<Record<string, unknown>>(input);
  exactKeys(root, ['repository', 'custody', 'soulRef'], [], 'provisional identity input');
  const repository = repositoryBinding(root.repository);
  const now = trustedNow(capabilities?.clock);
  const identityId = identityIdFor(repository);
  const identity = sealIdentity({
    schema: HOLOKEY_REPOSITORY_IDENTITY_SCHEMA,
    identityId,
    state: 'provisional',
    generation: 0,
    repository,
    controllerKeyRef: null,
    custody: custody(root.custody),
    soulRef: soulReference(root.soulRef),
    lineage: {
      rootIdentityId: identityId,
      previousIdentityHash: null,
      transitionIntentHash: null,
    },
    createdAt: now,
    updatedAt: now,
  });
  LOCAL_BOOTSTRAP_PROVISIONAL_RESULTS.add(identity);
  return identity;
}

function parseLineage(value: unknown, state: RepositoryIdentityState): RepositoryIdentityLineage {
  const root = record(value, 'identity.lineage');
  exactKeys(
    root,
    ['rootIdentityId', 'previousIdentityHash', 'transitionIntentHash'],
    [],
    'identity.lineage'
  );
  const previousIdentityHash =
    root.previousIdentityHash === null
      ? null
      : digest(root.previousIdentityHash, 'identity.lineage.previousIdentityHash');
  const transitionIntentHash =
    root.transitionIntentHash === null
      ? null
      : digest(root.transitionIntentHash, 'identity.lineage.transitionIntentHash');
  if (state === 'provisional' && (previousIdentityHash !== null || transitionIntentHash !== null)) {
    fail('IDENTITY_INVALID', 'a provisional identity cannot carry transition lineage');
  }
  if (state !== 'provisional' && (previousIdentityHash === null || transitionIntentHash === null)) {
    fail('IDENTITY_INVALID', 'a transitioned identity requires complete transition lineage');
  }
  return freezeDeep({
    rootIdentityId: portableRef(root.rootIdentityId, 'identity.lineage.rootIdentityId'),
    previousIdentityHash,
    transitionIntentHash,
  });
}

export function parseRepositoryIdentity(value: unknown): RepositoryIdentity {
  const root = ownJsonClone<Record<string, unknown>>(value);
  exactKeys(
    root,
    [
      'schema',
      'identityId',
      'state',
      'generation',
      'repository',
      'controllerKeyRef',
      'custody',
      'soulRef',
      'lineage',
      'createdAt',
      'updatedAt',
      'identityHash',
    ],
    [],
    'identity'
  );
  if (root.schema !== HOLOKEY_REPOSITORY_IDENTITY_SCHEMA) {
    fail('IDENTITY_INVALID', `identity.schema must be ${HOLOKEY_REPOSITORY_IDENTITY_SCHEMA}`);
  }
  if (typeof root.state !== 'string' || !STATE_SET.has(root.state as RepositoryIdentityState)) {
    fail('IDENTITY_INVALID', 'identity.state is invalid');
  }
  const state = root.state as RepositoryIdentityState;
  if (!Number.isSafeInteger(root.generation) || Number(root.generation) < 0) {
    fail('IDENTITY_INVALID', 'identity.generation must be a non-negative integer');
  }
  const generation = Number(root.generation);
  if ((state === 'provisional') !== (generation === 0)) {
    fail('IDENTITY_INVALID', 'identity state and generation disagree');
  }
  const repository = repositoryBinding(root.repository, 'identity.repository');
  const expectedIdentityId = identityIdFor(repository);
  const identityId = portableRef(root.identityId, 'identity.identityId');
  if (identityId !== expectedIdentityId) {
    fail('IDENTITY_INVALID', 'identityId does not bind the repository');
  }
  let controllerKeyRef: string | null = null;
  if (root.controllerKeyRef !== null) {
    controllerKeyRef = keyReference(root.controllerKeyRef, 'identity.controllerKeyRef');
  }
  if ((state === 'active') !== (controllerKeyRef !== null)) {
    fail('IDENTITY_INVALID', 'only an active identity can carry a controller key reference');
  }
  const createdAt = canonicalTimestamp(root.createdAt, 'identity.createdAt');
  const updatedAt = canonicalTimestamp(root.updatedAt, 'identity.updatedAt');
  if (updatedAt < createdAt) fail('IDENTITY_INVALID', 'identity.updatedAt precedes createdAt');
  const unsealed: Omit<RepositoryIdentity, 'identityHash'> = {
    schema: HOLOKEY_REPOSITORY_IDENTITY_SCHEMA,
    identityId,
    state,
    generation,
    repository,
    controllerKeyRef,
    custody: custody(root.custody),
    soulRef: soulReference(root.soulRef),
    lineage: parseLineage(root.lineage, state),
    createdAt,
    updatedAt,
  };
  if (unsealed.lineage.rootIdentityId.length === 0) {
    fail('IDENTITY_INVALID', 'identity lineage root is empty');
  }
  const identityHash = digest(root.identityHash, 'identity.identityHash');
  if (identityHash !== hashRepositoryIdentityValue(unsealed)) {
    fail('IDENTITY_INVALID', 'identityHash does not reproduce');
  }
  if (state === 'provisional' && unsealed.lineage.rootIdentityId !== identityId) {
    fail('IDENTITY_INVALID', 'a provisional identity lineage root must equal identityId');
  }
  return freezeDeep({ ...unsealed, identityHash });
}

export function validateRepositoryIdentity(value: unknown): {
  readonly ok: boolean;
  readonly errors: readonly RepositoryIdentityErrorCode[];
} {
  try {
    parseRepositoryIdentity(value);
    return Object.freeze({ ok: true, errors: Object.freeze([]) });
  } catch (error) {
    const code =
      error instanceof RepositoryIdentityAuthorityError ? error.code : 'IDENTITY_INVALID';
    return Object.freeze({ ok: false, errors: Object.freeze([code]) });
  }
}

function action(value: unknown): RepositoryIdentityAction {
  if (typeof value !== 'string' || !ACTION_SET.has(value)) {
    fail('INVALID_INPUT', 'repository identity action is invalid');
  }
  return value as RepositoryIdentityAction;
}

function stateAllowsAction(
  state: RepositoryIdentityState,
  requested: RepositoryIdentityAction
): boolean {
  return (
    (state === 'provisional' && requested === 'promote') ||
    (state === 'active' && ['rotate', 'revoke', 'migrate'].includes(requested)) ||
    (state === 'revoked' && requested === 'recover')
  );
}

function requireNextGeneration(identity: RepositoryIdentity): void {
  if (identity.generation >= Number.MAX_SAFE_INTEGER) {
    fail('INTENT_INVALID', 'repository identity generation is exhausted');
  }
}

function transitionTarget(
  requested: RepositoryIdentityAction,
  value: unknown
): RepositoryTransitionTarget {
  const root = record(value, 'transition target');
  if (requested === 'revoke') {
    exactKeys(root, ['reasonRef'], [], 'revoke target');
    return freezeDeep({ reasonRef: portableRef(root.reasonRef, 'revoke target.reasonRef') });
  }
  if (requested === 'migrate') {
    exactKeys(root, ['repository', 'controllerKeyRef'], [], 'migrate target');
    return freezeDeep({
      repository: repositoryBinding(root.repository, 'migrate target.repository'),
      controllerKeyRef: keyReference(root.controllerKeyRef, 'migrate target.controllerKeyRef'),
    });
  }
  exactKeys(root, ['controllerKeyRef'], [], `${requested} target`);
  return freezeDeep({
    controllerKeyRef: keyReference(root.controllerKeyRef, `${requested} target.controllerKeyRef`),
  });
}

function validateTargetSemantics(
  identity: RepositoryIdentity,
  requested: RepositoryIdentityAction,
  target: RepositoryTransitionTarget
): void {
  if (
    requested === 'rotate' &&
    (target as { controllerKeyRef: string }).controllerKeyRef === identity.controllerKeyRef
  ) {
    fail('INTENT_INVALID', 'rotate must select a different controller key reference');
  }
  if (
    requested === 'migrate' &&
    canonicalizeRepositoryIdentityValue(
      (target as { repository: RepositoryBinding }).repository
    ) === canonicalizeRepositoryIdentityValue(identity.repository)
  ) {
    fail('INTENT_INVALID', 'migrate must select a different repository binding');
  }
}

function approvalRequirements(
  identity: RepositoryIdentity,
  requested: RepositoryIdentityAction,
  target: RepositoryTransitionTarget
): readonly RepositoryApprovalRequirement[] {
  const successor = (): RepositoryApprovalRequirement => ({
    role: 'successor',
    keyRefs: [(target as { controllerKeyRef: string }).controllerKeyRef],
    threshold: 1,
  });
  if (requested === 'promote') {
    return freezeDeep([
      { role: 'bootstrap', keyRefs: [identity.custody.bootstrapKeyRef], threshold: 1 },
      successor(),
    ]);
  }
  if (requested === 'rotate' || requested === 'migrate') {
    return freezeDeep([
      { role: 'controller', keyRefs: [identity.controllerKeyRef as string], threshold: 1 },
      successor(),
    ]);
  }
  if (requested === 'revoke') {
    return freezeDeep([
      { role: 'controller', keyRefs: [identity.controllerKeyRef as string], threshold: 1 },
    ]);
  }
  return freezeDeep([
    {
      role: 'recovery',
      keyRefs: [...identity.custody.recoveryKeyRefs],
      threshold: identity.custody.recoveryThreshold,
    },
    successor(),
  ]);
}

function intentPayload(
  intent: Omit<RepositoryAuthorityIntent, 'payloadHash' | 'signingMessage'>
): unknown {
  return intent;
}

export interface BuildRepositoryAuthorityIntentInput {
  readonly identity: RepositoryIdentity;
  readonly action: RepositoryIdentityAction;
  readonly nonce: string;
  readonly ttlMs?: number;
  readonly authorityRef: string;
  readonly decisionRef: string;
  readonly target: RepositoryTransitionTarget;
}

export function buildRepositoryAuthorityIntent(
  input: unknown,
  capabilities: { readonly clock: RepositoryIdentityClock }
): RepositoryAuthorityIntent {
  const root = ownJsonClone<Record<string, unknown>>(input);
  exactKeys(
    root,
    ['identity', 'action', 'nonce', 'authorityRef', 'decisionRef', 'target'],
    ['ttlMs'],
    'authority intent input'
  );
  const identity = parseRepositoryIdentity(root.identity);
  requireNextGeneration(identity);
  const requested = action(root.action);
  if (!stateAllowsAction(identity.state, requested)) {
    fail('INTENT_INVALID', 'the requested action is not allowed from the current identity state');
  }
  if (typeof root.nonce !== 'string' || !NONCE_RE.test(root.nonce)) {
    fail('INVALID_INPUT', 'authority nonce must be 128 random bits encoded as lowercase hex');
  }
  const ttlMs = root.ttlMs === undefined ? MAX_AUTHORITY_TTL_MS : Number(root.ttlMs);
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_AUTHORITY_TTL_MS) {
    fail('INVALID_INPUT', 'authority intent TTL is outside its allowed range');
  }
  const issuedAt = trustedNow(capabilities?.clock);
  if (issuedAt < identity.updatedAt) {
    fail('AUTHORITY_NOT_YET_VALID', 'trusted clock precedes the current identity timestamp');
  }
  const expiresAt = canonicalExpiry(issuedAt, ttlMs);
  const target = transitionTarget(requested, root.target);
  validateTargetSemantics(identity, requested, target);
  const unsealed: Omit<RepositoryAuthorityIntent, 'payloadHash' | 'signingMessage'> = {
    schema: HOLOKEY_REPOSITORY_AUTHORITY_INTENT_SCHEMA,
    action: requested,
    subject: {
      identityId: identity.identityId,
      identityHash: identity.identityHash,
      state: identity.state,
      generation: identity.generation,
      previousIntentHash: identity.lineage.transitionIntentHash,
    },
    sequence: identity.generation + 1,
    nonce: root.nonce,
    issuedAt,
    expiresAt,
    authorityRef: portableRef(root.authorityRef, 'authorityRef'),
    decisionRef: portableRef(root.decisionRef, 'decisionRef'),
    target,
    requiredApprovals: approvalRequirements(identity, requested, target),
  };
  const signingMessage = canonicalizeRepositoryIdentityValue(intentPayload(unsealed));
  const sealed = freezeDeep({
    ...unsealed,
    payloadHash: hashRepositoryIdentityValue(intentPayload(unsealed)),
    signingMessage,
  });
  return parseIntent(sealed, identity);
}

function parseRequirement(value: unknown): RepositoryApprovalRequirement {
  const root = record(value, 'approval requirement');
  exactKeys(root, ['role', 'keyRefs', 'threshold'], [], 'approval requirement');
  const role = approvalRole(root.role);
  if (!Array.isArray(root.keyRefs) || root.keyRefs.length === 0) {
    fail('INTENT_INVALID', 'approval requirement keyRefs must be non-empty');
  }
  const keyRefs = root.keyRefs.map((item, index) =>
    keyReference(item, `approval requirement keyRefs[${index}]`)
  );
  if (new Set(keyRefs).size !== keyRefs.length) {
    fail('INTENT_INVALID', 'approval requirement keyRefs must be unique');
  }
  if (
    !Number.isSafeInteger(root.threshold) ||
    Number(root.threshold) < 1 ||
    Number(root.threshold) > keyRefs.length
  ) {
    fail('INTENT_INVALID', 'approval requirement threshold is invalid');
  }
  return freezeDeep({ role, keyRefs, threshold: Number(root.threshold) });
}

function approvalRole(value: unknown): RepositoryApprovalRole {
  if (!['bootstrap', 'controller', 'successor', 'recovery'].includes(String(value))) {
    fail('APPROVAL_INVALID', 'approval role is invalid');
  }
  return value as RepositoryApprovalRole;
}

function parseIntent(value: unknown, identity: RepositoryIdentity): RepositoryAuthorityIntent {
  const root = ownJsonClone<Record<string, unknown>>(value);
  exactKeys(
    root,
    [
      'schema',
      'action',
      'subject',
      'sequence',
      'nonce',
      'issuedAt',
      'expiresAt',
      'authorityRef',
      'decisionRef',
      'target',
      'requiredApprovals',
      'payloadHash',
      'signingMessage',
    ],
    [],
    'authority intent'
  );
  if (root.schema !== HOLOKEY_REPOSITORY_AUTHORITY_INTENT_SCHEMA) {
    fail('INTENT_INVALID', 'authority intent schema is invalid');
  }
  requireNextGeneration(identity);
  const requested = action(root.action);
  if (!stateAllowsAction(identity.state, requested)) {
    fail('INTENT_INVALID', 'authority intent action is invalid for the current state');
  }
  const subjectRoot = record(root.subject, 'authority intent subject');
  exactKeys(
    subjectRoot,
    ['identityId', 'identityHash', 'state', 'generation', 'previousIntentHash'],
    [],
    'authority intent subject'
  );
  const subject: RepositoryAuthoritySubject = freezeDeep({
    identityId: portableRef(subjectRoot.identityId, 'authority intent subject.identityId'),
    identityHash: digest(subjectRoot.identityHash, 'authority intent subject.identityHash'),
    state:
      typeof subjectRoot.state === 'string' &&
      STATE_SET.has(subjectRoot.state as RepositoryIdentityState)
        ? (subjectRoot.state as RepositoryIdentityState)
        : fail('INTENT_INVALID', 'authority intent subject.state is invalid'),
    generation:
      Number.isSafeInteger(subjectRoot.generation) && Number(subjectRoot.generation) >= 0
        ? Number(subjectRoot.generation)
        : fail('INTENT_INVALID', 'authority intent subject.generation is invalid'),
    previousIntentHash:
      subjectRoot.previousIntentHash === null
        ? null
        : digest(subjectRoot.previousIntentHash, 'authority intent subject.previousIntentHash'),
  });
  const expectedSubject: RepositoryAuthoritySubject = {
    identityId: identity.identityId,
    identityHash: identity.identityHash,
    state: identity.state,
    generation: identity.generation,
    previousIntentHash: identity.lineage.transitionIntentHash,
  };
  if (
    canonicalizeRepositoryIdentityValue(subject) !==
    canonicalizeRepositoryIdentityValue(expectedSubject)
  ) {
    fail('INTENT_INVALID', 'authority intent subject does not bind the current identity');
  }
  if (root.nonce === null || typeof root.nonce !== 'string' || !NONCE_RE.test(root.nonce)) {
    fail('INTENT_INVALID', 'authority intent nonce is invalid');
  }
  const issuedAt = canonicalTimestamp(root.issuedAt, 'authority intent issuedAt');
  const expiresAt = canonicalTimestamp(root.expiresAt, 'authority intent expiresAt');
  if (issuedAt < identity.updatedAt) {
    fail('INTENT_INVALID', 'authority intent predates the current identity timestamp');
  }
  if (
    expiresAt <= issuedAt ||
    Date.parse(expiresAt) - Date.parse(issuedAt) > MAX_AUTHORITY_TTL_MS
  ) {
    fail('INTENT_INVALID', 'authority intent validity interval is invalid');
  }
  if (!Number.isSafeInteger(root.sequence) || root.sequence !== identity.generation + 1) {
    fail('INTENT_INVALID', 'authority intent sequence is not the next identity generation');
  }
  const target = transitionTarget(requested, root.target);
  validateTargetSemantics(identity, requested, target);
  if (!Array.isArray(root.requiredApprovals)) {
    fail('INTENT_INVALID', 'authority intent requiredApprovals must be an array');
  }
  const requirements = root.requiredApprovals.map(parseRequirement);
  const expectedRequirements = approvalRequirements(identity, requested, target);
  if (
    canonicalizeRepositoryIdentityValue(requirements) !==
    canonicalizeRepositoryIdentityValue(expectedRequirements)
  ) {
    fail('INTENT_INVALID', 'authority intent approval requirements do not reproduce');
  }
  const unsealed: Omit<RepositoryAuthorityIntent, 'payloadHash' | 'signingMessage'> = {
    schema: HOLOKEY_REPOSITORY_AUTHORITY_INTENT_SCHEMA,
    action: requested,
    subject,
    sequence: Number(root.sequence),
    nonce: root.nonce,
    issuedAt,
    expiresAt,
    authorityRef: portableRef(root.authorityRef, 'authority intent authorityRef'),
    decisionRef: portableRef(root.decisionRef, 'authority intent decisionRef'),
    target,
    requiredApprovals: requirements,
  };
  const expectedSigningMessage = canonicalizeRepositoryIdentityValue(unsealed);
  const payloadHash = digest(root.payloadHash, 'authority intent payloadHash');
  if (
    root.signingMessage !== expectedSigningMessage ||
    payloadHash !== hashRepositoryIdentityValue(unsealed)
  ) {
    fail('INTENT_INVALID', 'authority intent payload proof does not reproduce');
  }
  return freezeDeep({ ...unsealed, payloadHash, signingMessage: expectedSigningMessage });
}

function parseApproval(value: unknown, payloadHash: string): RepositoryDetachedApproval {
  const root = ownJsonClone<Record<string, unknown>>(value);
  exactKeys(
    root,
    ['schema', 'role', 'keyRef', 'scheme', 'payloadHash', 'signature'],
    [],
    'detached approval'
  );
  if (root.schema !== HOLOKEY_REPOSITORY_APPROVAL_SCHEMA) {
    fail('APPROVAL_INVALID', 'detached approval schema is invalid');
  }
  if (root.scheme !== HOLOKEY_SIGNATURE_SCHEME) {
    fail('APPROVAL_INVALID', 'detached approval signature scheme is invalid');
  }
  if (root.payloadHash !== payloadHash) {
    fail('APPROVAL_INVALID', 'detached approval does not bind the authority payload');
  }
  if (typeof root.signature !== 'string' || !SIGNATURE_RE.test(root.signature)) {
    fail('APPROVAL_INVALID', 'detached approval signature encoding is invalid');
  }
  return freezeDeep({
    schema: HOLOKEY_REPOSITORY_APPROVAL_SCHEMA,
    role: approvalRole(root.role),
    keyRef: keyReference(root.keyRef, 'detached approval keyRef'),
    scheme: HOLOKEY_SIGNATURE_SCHEME,
    payloadHash,
    signature: root.signature,
  });
}

async function verifyApprovals(
  intent: RepositoryAuthorityIntent,
  approvalsValue: unknown,
  verifier: RepositoryIdentitySignatureVerifier
): Promise<readonly RepositorySignatureVerificationResult[]> {
  if (!verifier || typeof verifier.verify !== 'function') {
    fail('INVALID_CAPABILITY', 'an explicit signature verifier capability is required');
  }
  if (!Array.isArray(approvalsValue)) fail('APPROVAL_INVALID', 'approvals must be an array');
  if (approvalsValue.length > MAX_APPROVALS) {
    fail('APPROVAL_INVALID', 'approval count exceeds its bound');
  }
  const approvals = approvalsValue.map((item) => parseApproval(item, intent.payloadHash));
  const seenApproval = new Set<string>();
  const permittedApprovals = new Set(
    intent.requiredApprovals.flatMap((requirement) =>
      requirement.keyRefs.map((keyRef) => `${requirement.role}\u0000${keyRef}`)
    )
  );
  for (const approval of approvals) {
    const uniqueKey = `${approval.role}\u0000${approval.keyRef}`;
    if (!permittedApprovals.has(uniqueKey)) {
      fail('APPROVAL_INVALID', 'an approval is not authorized by the intent requirements');
    }
    if (seenApproval.has(uniqueKey))
      fail('APPROVAL_INVALID', 'duplicate approvals are not accepted');
    seenApproval.add(uniqueKey);
  }

  const verified: RepositorySignatureVerificationResult[] = [];
  for (const approval of approvals) {
    let rawResult: unknown;
    try {
      rawResult = await verifier.verify({
        schema: HOLOKEY_REPOSITORY_APPROVAL_SCHEMA,
        role: approval.role,
        keyRef: approval.keyRef,
        scheme: approval.scheme,
        payloadHash: approval.payloadHash,
        signingMessage: intent.signingMessage,
        signingMessageHash: intent.payloadHash,
        signature: approval.signature,
        signatureDigest: detachedSignatureDigest(approval.signature),
      });
    } catch {
      fail('SIGNATURE_REJECTED', 'the injected signature verifier rejected an approval');
    }
    const result = ownJsonClone<Record<string, unknown>>(rawResult);
    exactKeys(
      result,
      [
        'ok',
        'role',
        'keyRef',
        'scheme',
        'payloadHash',
        'signingMessageHash',
        'signatureDigest',
        'signerRef',
        'receiptDigest',
      ],
      [],
      'signature verification receipt'
    );
    const signatureDigest = detachedSignatureDigest(approval.signature);
    const signingMessageHash = sha256Utf8(intent.signingMessage);
    if (signingMessageHash !== intent.payloadHash) {
      fail('INTENT_INVALID', 'signing message bytes do not reproduce payloadHash');
    }
    if (
      result.ok !== true ||
      result.role !== approval.role ||
      result.keyRef !== approval.keyRef ||
      result.scheme !== approval.scheme ||
      result.payloadHash !== intent.payloadHash ||
      result.signingMessageHash !== signingMessageHash ||
      result.signatureDigest !== signatureDigest
    ) {
      fail('SIGNATURE_REJECTED', 'signature verification receipt is not bound to the approval');
    }
    verified.push(
      freezeDeep({
        ok: true,
        role: approval.role,
        keyRef: approval.keyRef,
        scheme: HOLOKEY_SIGNATURE_SCHEME,
        payloadHash: intent.payloadHash,
        signingMessageHash,
        signatureDigest,
        signerRef: portableRef(result.signerRef, 'signature verification signerRef'),
        receiptDigest: digest(result.receiptDigest, 'signature verification receiptDigest', true),
      })
    );
  }

  for (const requirement of intent.requiredApprovals) {
    const matching = verified.filter((result, index) => {
      const approval = approvals[index];
      return approval.role === requirement.role && requirement.keyRefs.includes(result.keyRef);
    });
    const keyRefs = new Set(matching.map((result) => result.keyRef));
    const signerRefs = new Set(matching.map((result) => result.signerRef));
    if (Math.min(keyRefs.size, signerRefs.size) < requirement.threshold) {
      fail('SIGNATURE_REJECTED', `${requirement.role} approval threshold was not met`);
    }
  }
  if (new Set(verified.map((result) => result.receiptDigest)).size !== verified.length) {
    fail('SIGNATURE_REJECTED', 'signature verification receipts must be distinct');
  }
  return freezeDeep(verified);
}

function transitionIntentHash(intent: RepositoryAuthorityIntent): string {
  return hashRepositoryIdentityValue({
    schema: 'holokey.repository-identity-transition-intent.v1',
    action: intent.action,
    subject: intent.subject,
    sequence: intent.sequence,
    authorityRef: intent.authorityRef,
    decisionRef: intent.decisionRef,
    target: intent.target,
  });
}

function deriveNextIdentity(
  current: RepositoryIdentity,
  intent: RepositoryAuthorityIntent,
  intentHash: string
): RepositoryIdentity {
  const repository =
    intent.action === 'migrate'
      ? (intent.target as { repository: RepositoryBinding }).repository
      : current.repository;
  const identityId = identityIdFor(repository);
  const state: RepositoryIdentityState = intent.action === 'revoke' ? 'revoked' : 'active';
  const controllerKeyRef =
    intent.action === 'revoke'
      ? null
      : (intent.target as { controllerKeyRef: string }).controllerKeyRef;
  return sealIdentity({
    schema: HOLOKEY_REPOSITORY_IDENTITY_SCHEMA,
    identityId,
    state,
    generation: intent.sequence,
    repository,
    controllerKeyRef,
    custody: current.custody,
    soulRef: current.soulRef,
    lineage: {
      rootIdentityId: current.lineage.rootIdentityId,
      previousIdentityHash: current.identityHash,
      transitionIntentHash: intentHash,
    },
    createdAt: current.createdAt,
    updatedAt: intent.issuedAt,
  });
}

function checkpointFor(identity: RepositoryIdentity): RepositoryIdentityCheckpoint {
  return freezeDeep({
    schema: HOLOKEY_REPOSITORY_CHECKPOINT_SCHEMA,
    identityId: identity.identityId,
    identityHash: identity.identityHash,
    state: identity.state,
    generation: identity.generation,
    transitionIntentHash: identity.lineage.transitionIntentHash,
  });
}

function sealTransitionReceipt(
  current: RepositoryIdentity,
  intent: RepositoryAuthorityIntent,
  expectedCheckpointHash: string,
  nonceHash: string,
  intentHash: string,
  nextIdentityHash: string,
  approvals: readonly RepositorySignatureVerificationResult[]
): RepositoryIdentityTransitionReceipt {
  const material: Omit<RepositoryIdentityTransitionReceipt, 'receiptHash'> = {
    schema: HOLOKEY_REPOSITORY_TRANSITION_RECEIPT_SCHEMA,
    action: intent.action,
    sequence: intent.sequence,
    expectedCheckpointHash,
    nonceHash,
    payloadHash: intent.payloadHash,
    intentHash,
    previousIdentityHash: current.identityHash,
    nextIdentityHash,
    approvalReceiptDigests: approvals.map((approval) => approval.receiptDigest).sort(),
    intentIssuedAt: intent.issuedAt,
    intentExpiresAt: intent.expiresAt,
  };
  return freezeDeep({ ...material, receiptHash: hashRepositoryIdentityValue(material) });
}

function compareAndCommitRequest(
  expectedCheckpoint: RepositoryIdentityCheckpoint,
  intent: RepositoryAuthorityIntent,
  intentHash: string,
  nextIdentity: RepositoryIdentity,
  transitionReceipt: RepositoryIdentityTransitionReceipt
): RepositoryIdentityCompareAndCommitRequest {
  const material: Omit<RepositoryIdentityCompareAndCommitRequest, 'requestHash'> = {
    schema: HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_SCHEMA,
    expectedCheckpoint,
    expectedCheckpointHash: transitionReceipt.expectedCheckpointHash,
    nonceHash: transitionReceipt.nonceHash,
    payloadHash: intent.payloadHash,
    intentHash,
    intentIssuedAt: intent.issuedAt,
    intentExpiresAt: intent.expiresAt,
    nextIdentityHash: nextIdentity.identityHash,
    transitionReceiptHash: transitionReceipt.receiptHash,
    nextIdentity,
    transitionReceipt,
  };
  return freezeDeep({ ...material, requestHash: hashRepositoryIdentityValue(material) });
}

function parseStoreResult(
  value: unknown,
  request: RepositoryIdentityCompareAndCommitRequest
): RepositoryIdentityCompareAndCommitResult {
  const root = ownJsonClone<Record<string, unknown>>(value);
  exactKeys(
    root,
    [
      'schema',
      'status',
      'requestHash',
      'expectedCheckpointHash',
      'nonceHash',
      'payloadHash',
      'intentHash',
      'intentIssuedAt',
      'intentExpiresAt',
      'nextIdentityHash',
      'transitionReceiptHash',
      'receiptDigest',
    ],
    [],
    'authority store result'
  );
  if (root.schema !== HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_RESULT_SCHEMA) {
    fail('STORE_RESPONSE_INVALID', 'authority store result schema is invalid');
  }
  if (!['committed', 'replayed-exact', 'conflict'].includes(String(root.status))) {
    fail('STORE_RESPONSE_INVALID', 'authority store result status is invalid');
  }
  const result: RepositoryIdentityCompareAndCommitResult = freezeDeep({
    schema: HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_RESULT_SCHEMA,
    status: root.status as RepositoryIdentityCommitStatus,
    requestHash: digest(root.requestHash, 'authority store result requestHash'),
    expectedCheckpointHash: digest(
      root.expectedCheckpointHash,
      'authority store result expectedCheckpointHash'
    ),
    nonceHash: digest(root.nonceHash, 'authority store result nonceHash'),
    payloadHash: digest(root.payloadHash, 'authority store result payloadHash'),
    intentHash: digest(root.intentHash, 'authority store result intentHash'),
    intentIssuedAt: canonicalTimestamp(
      root.intentIssuedAt,
      'authority store result intentIssuedAt'
    ),
    intentExpiresAt: canonicalTimestamp(
      root.intentExpiresAt,
      'authority store result intentExpiresAt'
    ),
    nextIdentityHash: digest(root.nextIdentityHash, 'authority store result nextIdentityHash'),
    transitionReceiptHash: digest(
      root.transitionReceiptHash,
      'authority store result transitionReceiptHash'
    ),
    receiptDigest: digest(root.receiptDigest, 'authority store result receiptDigest', true),
  });
  for (const key of [
    'requestHash',
    'expectedCheckpointHash',
    'nonceHash',
    'payloadHash',
    'intentHash',
    'intentIssuedAt',
    'intentExpiresAt',
    'nextIdentityHash',
    'transitionReceiptHash',
  ] as const) {
    if (result[key] !== request[key]) {
      fail('STORE_RESPONSE_INVALID', 'authority store result is not bound to the commit request');
    }
  }
  return result;
}

export interface TransitionRepositoryIdentityInput {
  readonly currentIdentity: RepositoryIdentity;
  readonly intent: RepositoryAuthorityIntent;
  readonly approvals: readonly RepositoryDetachedApproval[];
}

/**
 * Verify an intent and its detached approvals, derive the successor, then make
 * exactly one atomic store call. Checkpoint, nonce, payload, semantic intent,
 * successor identity, and transition receipt are all bound into that CAS.
 */
export async function transitionRepositoryIdentity(
  input: unknown,
  capabilities: RepositoryIdentityAuthorityCapabilities
): Promise<RepositoryIdentityTransitionResult> {
  const root = ownJsonClone<Record<string, unknown>>(input);
  exactKeys(root, ['currentIdentity', 'intent', 'approvals'], [], 'identity transition input');
  if (!capabilities || typeof capabilities !== 'object') {
    fail('INVALID_CAPABILITY', 'repository identity authority capabilities are required');
  }
  if (
    !capabilities.authorityStore ||
    typeof capabilities.authorityStore.compareAndCommit !== 'function'
  ) {
    fail('INVALID_CAPABILITY', 'an explicit atomic authority store capability is required');
  }
  const current = parseRepositoryIdentity(root.currentIdentity);
  const intent = parseIntent(root.intent, current);
  const now = Date.parse(trustedNow(capabilities.clock));
  if (now >= Date.parse(intent.expiresAt)) {
    fail('AUTHORITY_EXPIRED', 'authority intent has expired');
  }
  if (now < Date.parse(intent.issuedAt)) {
    fail('AUTHORITY_NOT_YET_VALID', 'authority intent is not yet valid');
  }
  const approvals = await verifyApprovals(intent, root.approvals, capabilities.signatureVerifier);
  const intentHash = transitionIntentHash(intent);
  const nextIdentity = deriveNextIdentity(current, intent, intentHash);
  const expectedCheckpoint = checkpointFor(current);
  const expectedCheckpointHash = hashRepositoryIdentityValue(expectedCheckpoint);
  const nonceHash = hashRepositoryIdentityValue(intent.nonce);
  const transitionReceipt = sealTransitionReceipt(
    current,
    intent,
    expectedCheckpointHash,
    nonceHash,
    intentHash,
    nextIdentity.identityHash,
    approvals
  );
  const request = compareAndCommitRequest(
    expectedCheckpoint,
    intent,
    intentHash,
    nextIdentity,
    transitionReceipt
  );
  const commitNow = Date.parse(trustedNow(capabilities.clock));
  if (commitNow >= Date.parse(intent.expiresAt)) {
    fail('AUTHORITY_EXPIRED', 'authority intent expired before atomic commit');
  }
  if (commitNow < Date.parse(intent.issuedAt)) {
    fail('AUTHORITY_NOT_YET_VALID', 'authority intent clock regressed before atomic commit');
  }
  let rawStoreResult: unknown;
  try {
    rawStoreResult = await capabilities.authorityStore.compareAndCommit(request);
  } catch {
    fail('STORE_FAILURE', 'the atomic authority store failed');
  }
  const storeReceipt = parseStoreResult(rawStoreResult, request);
  if (storeReceipt.status === 'conflict') {
    fail('STORE_CONFLICT', 'the repository identity checkpoint or nonce conflicted');
  }
  const result = freezeDeep({
    status: storeReceipt.status,
    authorityEvidence: 'caller-injected-contract-capabilities' as const,
    identity: nextIdentity,
    transitionReceipt,
    storeReceipt,
  });
  LOCAL_BOOTSTRAP_TRANSITION_RESULTS.add(result);
  return result;
}

/**
 * Exact 15-bit transition-table mask shared with `repository_identity.hsplus`.
 * Bit `state * 5 + action` is set iff that state/action pair is allowed. The
 * native gate observes three portable five-bit row masks and reconstructs this
 * value; it does not rely on a process exit status larger than 255.
 */
export function repositoryIdentityNativeTransitionTableMask(): number {
  const allowed = (state: number, requested: number): number => {
    if (state === 0 && requested === 0) return 1;
    if (state === 1 && (requested === 1 || requested === 2 || requested === 3)) return 1;
    if (state === 2 && requested === 4) return 1;
    return 0;
  };
  let tableMask = 0;
  for (let state = 0; state < 3; state += 1) {
    for (let requested = 0; requested < 5; requested += 1) {
      tableMask += allowed(state, requested) * 2 ** (state * 5 + requested);
    }
  }
  return tableMask;
}

export interface LegacyRepositoryIdentityProjection {
  readonly schema: typeof REPOSITORY_IDENTITY_SCHEMA;
  readonly identityId: string;
  readonly state: RepositoryIdentityState;
  readonly generation: number;
  readonly repository: RepositoryBinding;
  readonly controllerKeyRef: string | null;
  readonly custody: RepositoryIdentityCustody;
  readonly soulRef: RepositorySoulRef;
  readonly lineage: {
    readonly previousIdentityHash: string | null;
    readonly transitionReceiptHash: string | null;
  };
  readonly generatedAt: string;
  readonly identityHash: string;
  readonly authorityBoundary: {
    readonly requiredDurableIdentityAuthority: 'HoloKey';
    readonly evidence:
      | 'local-bootstrap-contract-only'
      | HoloKeyIdentityAuthorityEvidence;
    readonly authenticatedDurableReadback: false;
    readonly compatibilityOnly: true;
    readonly issuesIdentity: false;
    readonly mutatesIdentity: false;
  };
  readonly validation: { readonly ok: true; readonly errors: readonly [] };
  readonly ok: true;
  readonly reportHash: string;
}

export interface HoloKeyIdentityEvidence {
  readonly schema: typeof HOLOKEY_REPOSITORY_IDENTITY_EVIDENCE_SCHEMA;
  readonly authority: 'HoloKey';
  readonly authorityEvidence: HoloKeyIdentityAuthorityEvidence;
  readonly authenticatedDurableReadback: false;
  readonly identity: RepositoryIdentity;
}

export interface HoloKeyIdentityVerification {
  readonly schema: typeof HOLOKEY_REPOSITORY_IDENTITY_VERIFICATION_SCHEMA;
  readonly ok: true;
  readonly authority: 'HoloKey';
  readonly authorityEvidence: HoloKeyIdentityAuthorityEvidence;
  readonly authenticatedDurableReadback: false;
  readonly identity: RepositoryIdentity;
  readonly identityHash: string;
  readonly issuesIdentity: false;
  readonly persistsIdentity: false;
  readonly mutatesIdentity: false;
  readonly verificationHash: string;
}

function parseTransitionReceipt(value: unknown): RepositoryIdentityTransitionReceipt {
  const root = ownJsonClone<Record<string, unknown>>(value);
  exactKeys(
    root,
    [
      'schema',
      'action',
      'sequence',
      'expectedCheckpointHash',
      'nonceHash',
      'payloadHash',
      'intentHash',
      'previousIdentityHash',
      'nextIdentityHash',
      'approvalReceiptDigests',
      'intentIssuedAt',
      'intentExpiresAt',
      'receiptHash',
    ],
    [],
    'transition receipt'
  );
  if (root.schema !== HOLOKEY_REPOSITORY_TRANSITION_RECEIPT_SCHEMA) {
    fail('INVALID_INPUT', 'transition receipt schema is invalid');
  }
  if (!Number.isSafeInteger(root.sequence) || Number(root.sequence) < 1) {
    fail('INVALID_INPUT', 'transition receipt sequence is invalid');
  }
  if (!Array.isArray(root.approvalReceiptDigests) || root.approvalReceiptDigests.length === 0) {
    fail('INVALID_INPUT', 'transition receipt approval receipts must be non-empty');
  }
  const approvalReceiptDigests = root.approvalReceiptDigests.map((item, index) =>
    digest(item, `transition receipt approvalReceiptDigests[${index}]`, true)
  );
  const sortedReceipts = [...approvalReceiptDigests].sort();
  if (
    new Set(approvalReceiptDigests).size !== approvalReceiptDigests.length ||
    canonicalizeRepositoryIdentityValue(approvalReceiptDigests) !==
      canonicalizeRepositoryIdentityValue(sortedReceipts)
  ) {
    fail('INVALID_INPUT', 'transition receipt approval receipts must be unique and sorted');
  }
  const material: Omit<RepositoryIdentityTransitionReceipt, 'receiptHash'> = {
    schema: HOLOKEY_REPOSITORY_TRANSITION_RECEIPT_SCHEMA,
    action: action(root.action),
    sequence: Number(root.sequence),
    expectedCheckpointHash: digest(
      root.expectedCheckpointHash,
      'transition receipt expectedCheckpointHash'
    ),
    nonceHash: digest(root.nonceHash, 'transition receipt nonceHash'),
    payloadHash: digest(root.payloadHash, 'transition receipt payloadHash'),
    intentHash: digest(root.intentHash, 'transition receipt intentHash'),
    previousIdentityHash: digest(
      root.previousIdentityHash,
      'transition receipt previousIdentityHash'
    ),
    nextIdentityHash: digest(root.nextIdentityHash, 'transition receipt nextIdentityHash'),
    approvalReceiptDigests,
    intentIssuedAt: canonicalTimestamp(root.intentIssuedAt, 'transition receipt intentIssuedAt'),
    intentExpiresAt: canonicalTimestamp(root.intentExpiresAt, 'transition receipt intentExpiresAt'),
  };
  if (material.intentExpiresAt <= material.intentIssuedAt) {
    fail('INVALID_INPUT', 'transition receipt intent validity interval is invalid');
  }
  const receiptHash = digest(root.receiptHash, 'transition receipt receiptHash');
  if (receiptHash !== hashRepositoryIdentityValue(material)) {
    fail('INVALID_INPUT', 'transition receipt hash does not reproduce');
  }
  return freezeDeep({ ...material, receiptHash });
}

/**
 * Create the deprecated HoloRepo v1 wire shape from a closure-branded local
 * contract result minted in this module instance. The brand proves only an
 * unmodified same-module bootstrap flow; it is not authenticated HoloKey-root
 * issuance. This compatibility projection cannot originate or mutate identity
 * and deliberately refuses deserialized or caller-reconstructed hashes.
 */
export function projectLegacyRepositoryIdentity(
  value: RepositoryIdentity | RepositoryIdentityTransitionResult
): LegacyRepositoryIdentityProjection {
  if (!value || typeof value !== 'object' || isProxy(value)) {
    fail('INVALID_CAPABILITY', 'a same-module HoloKey contract result is required');
  }
  let identity: RepositoryIdentity;
  let transitionReceiptHash: string | null = null;
  if (LOCAL_BOOTSTRAP_TRANSITION_RESULTS.has(value)) {
    const transitionResult = value as RepositoryIdentityTransitionResult;
    if (transitionResult.authorityEvidence !== 'caller-injected-contract-capabilities') {
      fail('INVALID_INPUT', 'the local contract evidence marker is invalid');
    }
    identity = parseRepositoryIdentity(transitionResult.identity);
    const receipt = parseTransitionReceipt(transitionResult.transitionReceipt);
    if (
      receipt.sequence !== identity.generation ||
      receipt.previousIdentityHash !== identity.lineage.previousIdentityHash ||
      receipt.intentHash !== identity.lineage.transitionIntentHash ||
      receipt.nextIdentityHash !== identity.identityHash ||
      receipt.intentIssuedAt !== identity.updatedAt
    ) {
      fail('INVALID_INPUT', 'transition receipt does not bind the projected identity');
    }
    if (
      (identity.state === 'revoked') !== (receipt.action === 'revoke') ||
      (receipt.action === 'promote') !== (receipt.sequence === 1)
    ) {
      fail(
        'INVALID_INPUT',
        'transition receipt action is inconsistent with the projected identity'
      );
    }
    if (
      !['committed', 'replayed-exact'].includes(transitionResult.storeReceipt.status) ||
      transitionResult.storeReceipt.nextIdentityHash !== identity.identityHash ||
      transitionResult.storeReceipt.transitionReceiptHash !== receipt.receiptHash ||
      transitionResult.storeReceipt.intentHash !== receipt.intentHash ||
      transitionResult.storeReceipt.payloadHash !== receipt.payloadHash ||
      transitionResult.storeReceipt.intentIssuedAt !== receipt.intentIssuedAt ||
      transitionResult.storeReceipt.intentExpiresAt !== receipt.intentExpiresAt ||
      transitionResult.storeReceipt.nonceHash !== receipt.nonceHash ||
      transitionResult.storeReceipt.expectedCheckpointHash !== receipt.expectedCheckpointHash
    ) {
      fail('INVALID_INPUT', 'authority-store evidence does not bind the compatibility projection');
    }
    transitionReceiptHash = receipt.receiptHash;
  } else if (LOCAL_BOOTSTRAP_PROVISIONAL_RESULTS.has(value)) {
    identity = parseRepositoryIdentity(value);
    if (identity.state !== 'provisional') {
      fail('INVALID_INPUT', 'the local provisional contract brand has an invalid state');
    }
  } else {
    fail('INVALID_CAPABILITY', 'a same-module HoloKey contract result is required');
  }
  const material = {
    schema: REPOSITORY_IDENTITY_SCHEMA,
    identityId: identity.identityId,
    state: identity.state,
    generation: identity.generation,
    repository: identity.repository,
    controllerKeyRef: identity.controllerKeyRef,
    custody: identity.custody,
    soulRef: identity.soulRef,
    lineage: {
      previousIdentityHash: identity.lineage.previousIdentityHash,
      transitionReceiptHash,
    },
  } as const;
  const reportWithoutHash = {
    ...material,
    generatedAt: identity.updatedAt,
    identityHash: hashRepositoryIdentityValue(material),
    authorityBoundary: {
      requiredDurableIdentityAuthority: 'HoloKey' as const,
      evidence: 'local-bootstrap-contract-only' as const,
      authenticatedDurableReadback: false as const,
      compatibilityOnly: true as const,
      issuesIdentity: false as const,
      mutatesIdentity: false as const,
    },
    validation: { ok: true as const, errors: [] as const },
    ok: true as const,
    reportHash: null,
  };
  return freezeDeep({
    ...reportWithoutHash,
    reportHash: hashRepositoryIdentityValue(reportWithoutHash),
  });
}

function parseHoloKeyIdentityEvidence(value: unknown): HoloKeyIdentityEvidence {
  const root = ownJsonClone<Record<string, unknown>>(value);
  exactKeys(
    root,
    ['schema', 'authority', 'authorityEvidence', 'authenticatedDurableReadback', 'identity'],
    [],
    'HoloKey identity evidence'
  );
  if (root.schema !== HOLOKEY_REPOSITORY_IDENTITY_EVIDENCE_SCHEMA) {
    fail('IDENTITY_INVALID', 'HoloKey identity evidence schema is invalid');
  }
  if (root.authority !== 'HoloKey') {
    fail('INVALID_CAPABILITY', 'HoloKey identity evidence must name HoloKey as its authority');
  }
  if (root.authorityEvidence !== 'caller-injected-contract-capabilities') {
    fail(
      'INVALID_CAPABILITY',
      'authenticated durable readback requires an HoloKey root receipt'
    );
  }
  if (root.authenticatedDurableReadback !== false) {
    fail(
      'INVALID_CAPABILITY',
      'authenticated durable readback requires an HoloKey root receipt'
    );
  }
  return freezeDeep({
    schema: HOLOKEY_REPOSITORY_IDENTITY_EVIDENCE_SCHEMA,
    authority: 'HoloKey',
    authorityEvidence: 'caller-injected-contract-capabilities',
    authenticatedDurableReadback: false,
    identity: parseRepositoryIdentity(root.identity),
  });
}

/**
 * Verify a read-only HoloKey identity evidence envelope.
 *
 * The current envelope intentionally carries only caller-injected bootstrap
 * contract evidence. It validates the HoloKey schema and content binding, but
 * it never claims authenticated durable-root issuance or performs a mutation.
 */
export function verifyHoloKeyIdentityEvidence(
  value: unknown
): HoloKeyIdentityVerification {
  const evidence = parseHoloKeyIdentityEvidence(value);
  const material = {
    schema: HOLOKEY_REPOSITORY_IDENTITY_VERIFICATION_SCHEMA,
    authority: evidence.authority,
    authorityEvidence: evidence.authorityEvidence,
    authenticatedDurableReadback: evidence.authenticatedDurableReadback,
    identity: evidence.identity,
    identityHash: evidence.identity.identityHash,
    issuesIdentity: false,
    persistsIdentity: false,
    mutatesIdentity: false,
  } as const;
  return freezeDeep({
    ...material,
    ok: true,
    verificationHash: hashRepositoryIdentityValue(material),
  });
}

/**
 * Project verified HoloKey evidence into the deprecated HoloRepo v1 wire shape.
 * The result is compatibility-only and has no identity origination or mutation
 * capability; authenticated durable readback remains explicitly false.
 */
export function projectHoloKeyIdentityEvidence(
  value: unknown
): LegacyRepositoryIdentityProjection {
  const verification = verifyHoloKeyIdentityEvidence(value);
  const identity = verification.identity;
  const material = {
    schema: REPOSITORY_IDENTITY_SCHEMA,
    identityId: identity.identityId,
    state: identity.state,
    generation: identity.generation,
    repository: identity.repository,
    controllerKeyRef: identity.controllerKeyRef,
    custody: identity.custody,
    soulRef: identity.soulRef,
    lineage: {
      previousIdentityHash: identity.lineage.previousIdentityHash,
      transitionReceiptHash: null,
    },
  } as const;
  const reportWithoutHash = {
    ...material,
    generatedAt: identity.updatedAt,
    identityHash: hashRepositoryIdentityValue(material),
    authorityBoundary: {
      requiredDurableIdentityAuthority: 'HoloKey' as const,
      evidence: verification.authorityEvidence,
      authenticatedDurableReadback: false as const,
      compatibilityOnly: true as const,
      issuesIdentity: false as const,
      mutatesIdentity: false as const,
    },
    validation: { ok: true as const, errors: [] as const },
    ok: true as const,
    reportHash: null,
  };
  return freezeDeep({
    ...reportWithoutHash,
    reportHash: hashRepositoryIdentityValue(reportWithoutHash),
  });
}
