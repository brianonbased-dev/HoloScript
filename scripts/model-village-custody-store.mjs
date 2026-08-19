/* global Buffer, process, structuredClone */

/**
 * Model Village sealed local custody store (MV-B1 engineering certification
 * lane).
 *
 * Implements the spec's sealed local research store
 * (docs/specs/HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md, "Safety, consent, and
 * isolation"): raw model text remains in a sealed local research store with
 * named operator access and a retention/deletion policy frozen before live
 * runs; durable public receipts carry nonidentifying hashes only; later
 * deletion is reconciled through content-key destruction or a nonidentifying
 * tombstone rather than rewriting the append-only chain.
 *
 * Language boundary (spec "Source layout" section): this module is JavaScript
 * transport/canonicalization/verification only. It contains no resident
 * reasoning, village rules, experimental treatments, scoring policy, or
 * model-specific behavior. It seals opaque bytes and verifies hashes.
 *
 * Design decisions (each documented at its implementation site):
 * - Layout under rootDir: store-manifest.json, key/content-key.bin,
 *   objects/<custodyId>.enc (+ objects/<custodyId>.meta.enc),
 *   access-log.jsonl, tombstones.jsonl, backup/.
 * - custodyId = sha256 hex of the PLAINTEXT bytes, so public receipts can
 *   reference sealed content by a nonidentifying content hash without any
 *   custody-store lookup.
 * - Cipher aes-256-gcm, fresh random 12-byte IV per object, file bytes =
 *   IV || authTag || ciphertext, AAD = custodyId. Decrypt re-verifies
 *   plaintext hash === custodyId, so a key/file mixup cannot silently return
 *   the wrong plaintext.
 * - kind/label metadata is ALSO encrypted (objects/<id>.meta.enc, same
 *   content key, AAD = custodyId + ':metadata'). Rationale: labels/kinds may
 *   be identifying, and the spec's deletion story is content-key destruction;
 *   if metadata stayed plaintext, key destruction would not complete
 *   deletion. Destroying the one content key renders content AND metadata
 *   unrecoverable together.
 * - EVERY store operation appends a hash-chained access-log entry
 *   (write-then-fsync), giving named-operator access accounting. Access-log
 *   entries are nonidentifying: they carry custodyIds and ciphertext hashes,
 *   never kind, label, plaintext, or plaintext hashes beyond the custodyId
 *   itself (which the spec already treats as a public nonidentifying hash).
 * - Key destruction commits through the HASH-CHAINED ACCESS LOG: the
 *   'destroy-key' entry is appended and fsynced FIRST — that append is the
 *   durable commit record — and only then is the nonidentifying tombstone
 *   written and the key file overwritten with zeros, fsynced, and unlinked;
 *   the append-only chain is never rewritten. The access log is the only
 *   AUTHENTICATED record in the store (every entry chains from genesis and
 *   re-hashes), so it — never an unauthenticated tombstone line — is what
 *   decides that a destruction happened. Because the entry commits first, a
 *   crash mid-destroy is recoverable: open sees the committed entry, rolls the
 *   destruction forward (re-emitting the tombstone if needed, completing the
 *   scrub/unlink), and never resurrects the key. A tombstone with no
 *   corroborating chain entry fails CLOSED rather than destroying a live key.
 *   After destruction, integrity verification degrades to
 *   ciphertext-checksum-only mode using the ciphertext sha256 values that were
 *   recorded in the seal access-log entries.
 * - Backups deliberately EXCLUDE key/ — a backup must not widen key custody.
 *   A backup that carried the content key would silently create a second key
 *   custodian and defeat key-destruction deletion. Backups therefore contain
 *   only ciphertext, the manifest, and the append-only logs, plus a
 *   checksums.json for tamper detection.
 * - EXCLUSIVE HANDLE LOCK: create/open acquire an exclusive store.lock under
 *   the root for the lifetime of the handle (released by close()). Two live
 *   handles would share one in-memory chain tail and write duplicate
 *   access-log sequence numbers — permanently failing chain validation with
 *   no repair path — so the second acquire fails loud (CustodyLockError)
 *   instead. A lock whose recorded pid is dead is treated as crash residue
 *   and broken once; a lock held by a live pid is never stolen. As a second
 *   fence, every append re-reads the on-disk log tail first and refuses to
 *   fork the chain if the tail moved outside this handle.
 * - KEY FILE PERMISSIONS: key/ is created 0o700 and content-key.bin written
 *   0o600 (owner-only). On POSIX hosts verifyIntegrity's key-custody check
 *   fails if the key file has widened to group/world access — a copied key
 *   silently defeats deletion-by-key-destruction. On win32 mode bits are
 *   synthetic (ACL-backed), so the mode assertion is POSIX-only.
 *
 * Claim boundary (engineering certification lane, NOT the study lane): this
 * module performs no live study run, no Phase 1 admission, no model turns,
 * no blinded alias assignment. The sealed adapter_a/b/c alias-to-route
 * assignment is explicitly OUT of scope here. See
 * CUSTODY_STORE_CLAIM_BOUNDARY.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';

import {
  breakStaleLockFile,
  canonicalDigest,
  canonicalJson,
  releaseOwnedLockFile,
  rememberOwnedLockFile,
} from './model-village-phase0b-runtime.mjs';

export const SEALED_CUSTODY_STORE_SCHEMA =
  'hololand.model-village-sealed-custody-store.v1';
export const CUSTODY_ACCESS_LOG_ENTRY_SCHEMA =
  'hololand.model-village-custody-access-log-entry.v1';
export const CUSTODY_TOMBSTONE_SCHEMA =
  'hololand.model-village-custody-tombstone.v1';
export const CUSTODY_BACKUP_CHECKSUMS_SCHEMA =
  'hololand.model-village-custody-backup-checksums.v1';

/** Chain seed for the first access-log entry's prevEntryHash. */
export const CUSTODY_ACCESS_LOG_GENESIS = 'custody-access-log-genesis-v1';

const CIPHER = 'aes-256-gcm';
const CUSTODY_ID_ALGORITHM = 'sha256-plaintext';
const LOCK_FILE_NAME = 'store.lock';
const KEY_FILE_MODE = 0o600;
const KEY_DIR_MODE = 0o700;
const KEY_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;
const MIN_ENC_FILE_LENGTH = IV_BYTE_LENGTH + AUTH_TAG_BYTE_LENGTH;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const MAX_TOMBSTONE_REASON_LENGTH = 200;
const DELETION_METHOD = 'content-key-destruction';
const TOMBSTONE_METHOD = 'append-only-nonidentifying';
const TOMBSTONE_SCOPE = 'all-objects';

const MANIFEST_KEYS = Object.freeze([
  'cipher',
  'createdAt',
  'custodyIdAlgorithm',
  'keyFingerprint',
  'operator',
  'retentionPolicy',
  'runLabel',
  'schema',
  'storeId',
]);
const RETENTION_POLICY_KEYS = Object.freeze([
  'deletionMethod',
  'description',
  'frozenAt',
  'policyId',
  'tombstoneMethod',
]);
const RETENTION_POLICY_INPUT_KEYS = Object.freeze([
  'description',
  'frozenAt',
  'policyId',
]);
const ACCESS_LOG_REQUIRED_KEYS = Object.freeze([
  'at',
  'entryHash',
  'operation',
  'operator',
  'prevEntryHash',
  'schema',
  'sequence',
]);
const ACCESS_LOG_OPTIONAL_KEYS = Object.freeze(['custodyId', 'detail']);
const TOMBSTONE_KEYS = Object.freeze([
  'at',
  'keyFingerprint',
  'reason',
  'schema',
  'scope',
]);
const OBJECT_METADATA_KEYS = Object.freeze(['byteLength', 'kind', 'label']);
const BACKUP_CHECKSUMS_KEYS = Object.freeze([
  'createdAt',
  'files',
  'keyExcluded',
  'schema',
]);
export const CUSTODY_OPERATIONS = Object.freeze([
  'backup',
  'create',
  'destroy-key',
  'list',
  'open',
  'read',
  'seal',
  'verify',
  'verify-backup',
]);

/**
 * Explicit claim boundary for the engineering certification (drill) lane.
 * Every flag that the MV-B1 backend slice must NEVER claim is pinned false
 * here and carried on verifyIntegrity() results. Temperature zero is not a
 * determinism receipt (spec "Determinism boundary").
 */
export const CUSTODY_STORE_CLAIM_BOUNDARY = Object.freeze({
  engineeringCertificationDrill: true,
  sealedLocalStoreImplemented: true,
  blindedAliasAssignmentClaimed: false,
  liveStudyRunClaimed: false,
  phase1AdmissionClaimed: false,
  phase1ReadinessClaimed: false,
  processCrashDurabilityClaimed: false,
  productionValidatorCustodyClaimed: false,
  rawModelTextInPublicReceiptsClaimed: false,
  sealedAdapterAliasRouteAssignmentIncluded: false,
  sixResidentLiveTurnsClaimed: false,
  temperatureZeroDeterminismClaimed: false,
});

/** Base typed error for all custody-store failures (fail loud, no coercion). */
export class CustodyStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CustodyStoreError';
  }
}

/** Input/shape validation failure. */
export class CustodyValidationError extends CustodyStoreError {
  constructor(message) {
    super(message);
    this.name = 'CustodyValidationError';
  }
}

/** On-disk state contradicts the recorded chain/hashes/manifest. */
export class CustodyIntegrityError extends CustodyStoreError {
  constructor(message) {
    super(message);
    this.name = 'CustodyIntegrityError';
  }
}

/**
 * The content key has been destroyed (deletion-by-key-destruction); plaintext
 * operations are permanently unavailable for this store.
 */
export class CustodyKeyDestroyedError extends CustodyStoreError {
  constructor(message) {
    super(message);
    this.name = 'CustodyKeyDestroyedError';
  }
}

/**
 * Content-addressed duplicate: the plaintext is already sealed. Carries the
 * existing custodyId so callers can prove content-address equality without
 * re-sealing.
 */
export class CustodyDuplicateObjectError extends CustodyStoreError {
  constructor(message, custodyId) {
    super(message);
    this.name = 'CustodyDuplicateObjectError';
    this.custodyId = custodyId;
  }
}

/**
 * Another live handle holds this store root's exclusive lock. A second
 * concurrent writer would fork the append-only chain (duplicate sequence
 * numbers permanently fail validateAccessLogChain with no repair path), so
 * the second acquire fails loud instead of corrupting custody.
 */
export class CustodyLockError extends CustodyStoreError {
  constructor(message) {
    super(message);
    this.name = 'CustodyLockError';
  }
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function isoNow() {
  return new Date().toISOString();
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CustodyValidationError(`${label} must be a non-empty string`);
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CustodyValidationError(`${label} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    const missing = expected.filter((key) => !actual.includes(key));
    const unexpected = actual.filter((key) => !expected.includes(key));
    throw new CustodyValidationError(
      `${label} keys differ; missing=${canonicalJson(missing)} `
      + `unexpected=${canonicalJson(unexpected)}`,
    );
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new CustodyValidationError(`${label} must be lowercase sha256 hex`);
  }
}

function assertIsoUtc(value, label) {
  if (typeof value !== 'string' || !ISO_UTC_PATTERN.test(value)) {
    throw new CustodyValidationError(`${label} must be an ISO-8601 UTC timestamp`);
  }
}

/**
 * Durable write: open exclusively (or truncating), write, fsync, close.
 * fsync is issued on the file descriptor before close so the write is pushed
 * to stable storage before we report success. NOTE: this is single-process
 * write durability only; process-crash durability is explicitly NOT claimed
 * (CUSTODY_STORE_CLAIM_BOUNDARY.processCrashDurabilityClaimed === false).
 */
function writeFileDurable(filePath, buffer, { exclusive = false, mode } = {}) {
  // mode === undefined falls through to Node's default (0o666 pre-umask);
  // key material passes an explicit 0o600 so it is owner-only from creation.
  const fd = openSync(filePath, exclusive ? 'wx' : 'w', mode);
  try {
    writeSync(fd, buffer, 0, buffer.length);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Append-is-write-then-fsync for the jsonl logs. */
function appendLineDurable(filePath, line) {
  const fd = openSync(filePath, 'a');
  try {
    const buffer = Buffer.from(`${line}\n`, 'utf8');
    writeSync(fd, buffer, 0, buffer.length);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function readJsonlEntries(filePath, label) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter((line) => line.length > 0);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new CustodyIntegrityError(
        `${label} line ${index + 1} is not valid JSON: ${error.message}`,
      );
    }
  });
}

/**
 * Tombstone reader with ONE narrow, documented repair: a trailing line that is
 * NOT newline-terminated is an append that never completed. appendLineDurable
 * writes `${line}\n` in a single write+fsync, so a completed append always ends
 * the file with '\n'; an unterminated tail therefore cannot be a durable
 * record. Such a tail is dropped when it does not parse (and kept, re-
 * terminated, when it does), and the file is rewritten to a clean
 * newline-terminated form. Without that rewrite a later append would glue
 * itself onto the fragment and turn a recoverable interruption into a permanent
 * parse failure — the exact wedge G1 exists to eliminate.
 *
 * DELIBERATELY NOT APPLIED to access-log.jsonl. That file is the hash-chained
 * record of authority: a torn tail there is tamper-or-corruption evidence and
 * openSealedCustodyStore must keep failing closed on it (the MV-B5
 * access-log-torn-append drill asserts exactly that). Only committed lines
 * are ever dropped here — never one that was fsynced with its newline.
 */
function readTombstoneEntries(filePath) {
  if (!existsSync(filePath)) return { entries: [], repairedTail: null };
  const raw = readFileSync(filePath, 'utf8');
  if (raw.length === 0) return { entries: [], repairedTail: null };
  const lines = raw.split('\n').filter((line) => line.length > 0);
  let repairedTail = null;
  if (!raw.endsWith('\n') && lines.length > 0) {
    let tailParses = true;
    try {
      JSON.parse(lines[lines.length - 1]);
    } catch {
      tailParses = false;
    }
    if (tailParses) {
      repairedTail = 're-terminated-complete-partial-append';
    } else {
      lines.pop();
      repairedTail = 'dropped-unparseable-partial-append';
    }
    writeFileDurable(
      filePath,
      Buffer.from(lines.map((line) => `${line}\n`).join(''), 'utf8'),
    );
  }
  const entries = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new CustodyIntegrityError(
        `tombstones line ${index + 1} is not valid JSON: ${error.message}`,
      );
    }
  });
  return { entries, repairedTail };
}

/**
 * AES-256-GCM seal: file bytes = IV || authTag || ciphertext. A fresh random
 * 12-byte IV is generated per object (never reused; key+IV reuse would break
 * GCM). The AAD binds the ciphertext to its custody address so an .enc file
 * cannot be renamed to another custodyId without detection.
 */
function encryptBytes(key, aad, plaintext) {
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv(CIPHER, key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

function decryptBytes(key, aad, fileBytes, label) {
  if (!Buffer.isBuffer(fileBytes) || fileBytes.length < MIN_ENC_FILE_LENGTH) {
    throw new CustodyIntegrityError(
      `${label} is too short to contain IV and auth tag`,
    );
  }
  const iv = fileBytes.subarray(0, IV_BYTE_LENGTH);
  const authTag = fileBytes.subarray(IV_BYTE_LENGTH, MIN_ENC_FILE_LENGTH);
  const ciphertext = fileBytes.subarray(MIN_ENC_FILE_LENGTH);
  const decipher = createDecipheriv(CIPHER, key, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new CustodyIntegrityError(
      `${label} failed authenticated decryption: ${error.message}`,
    );
  }
}

function validateRetentionPolicy(retentionPolicy) {
  assertExactKeys(retentionPolicy, RETENTION_POLICY_KEYS, 'retentionPolicy');
  assertNonEmptyString(retentionPolicy.policyId, 'retentionPolicy.policyId');
  assertNonEmptyString(
    retentionPolicy.description,
    'retentionPolicy.description',
  );
  assertIsoUtc(retentionPolicy.frozenAt, 'retentionPolicy.frozenAt');
  if (retentionPolicy.deletionMethod !== DELETION_METHOD) {
    throw new CustodyValidationError(
      `retentionPolicy.deletionMethod must be '${DELETION_METHOD}'`,
    );
  }
  if (retentionPolicy.tombstoneMethod !== TOMBSTONE_METHOD) {
    throw new CustodyValidationError(
      `retentionPolicy.tombstoneMethod must be '${TOMBSTONE_METHOD}'`,
    );
  }
}

function validateManifest(manifest) {
  assertExactKeys(manifest, MANIFEST_KEYS, 'store manifest');
  if (manifest.schema !== SEALED_CUSTODY_STORE_SCHEMA) {
    throw new CustodyValidationError(
      `store manifest schema must be '${SEALED_CUSTODY_STORE_SCHEMA}'`,
    );
  }
  assertNonEmptyString(manifest.storeId, 'manifest.storeId');
  assertNonEmptyString(manifest.runLabel, 'manifest.runLabel');
  assertNonEmptyString(manifest.operator, 'manifest.operator');
  assertIsoUtc(manifest.createdAt, 'manifest.createdAt');
  if (manifest.cipher !== CIPHER) {
    throw new CustodyValidationError(`manifest.cipher must be '${CIPHER}'`);
  }
  if (manifest.custodyIdAlgorithm !== CUSTODY_ID_ALGORITHM) {
    throw new CustodyValidationError(
      `manifest.custodyIdAlgorithm must be '${CUSTODY_ID_ALGORITHM}'`,
    );
  }
  assertSha256(manifest.keyFingerprint, 'manifest.keyFingerprint');
  validateRetentionPolicy(manifest.retentionPolicy);
}

/**
 * Shape validation plus, when `expectedKeyFingerprint` is supplied, a BINDING
 * check that the tombstone names THIS store's content key. Without the binding
 * a tombstone copied from another store (or carrying an arbitrary digest) would
 * be accepted as this store's deletion record; verifyIntegrity already enforces
 * the same cross-check, so the two paths now agree.
 */
function validateTombstone(tombstone, label, expectedKeyFingerprint) {
  assertExactKeys(tombstone, TOMBSTONE_KEYS, label);
  if (tombstone.schema !== CUSTODY_TOMBSTONE_SCHEMA) {
    throw new CustodyValidationError(
      `${label} schema must be '${CUSTODY_TOMBSTONE_SCHEMA}'`,
    );
  }
  if (tombstone.scope !== TOMBSTONE_SCOPE) {
    throw new CustodyValidationError(`${label} scope must be '${TOMBSTONE_SCOPE}'`);
  }
  assertNonEmptyString(tombstone.reason, `${label} reason`);
  if (tombstone.reason.length > MAX_TOMBSTONE_REASON_LENGTH) {
    throw new CustodyValidationError(
      `${label} reason exceeds ${MAX_TOMBSTONE_REASON_LENGTH} characters; `
      + 'tombstones must stay bounded and nonidentifying',
    );
  }
  assertIsoUtc(tombstone.at, `${label} at`);
  assertSha256(tombstone.keyFingerprint, `${label} keyFingerprint`);
  if (
    expectedKeyFingerprint !== undefined
    && tombstone.keyFingerprint !== expectedKeyFingerprint
  ) {
    throw new CustodyIntegrityError(
      `${label} keyFingerprint does not match the manifest keyFingerprint; a `
      + 'tombstone from another store is not this store\'s deletion record',
    );
  }
}

function validateAccessLogEntryShape(entry, label) {
  assertObject(entry, label);
  const keys = Object.keys(entry);
  const allowed = new Set([
    ...ACCESS_LOG_REQUIRED_KEYS,
    ...ACCESS_LOG_OPTIONAL_KEYS,
  ]);
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new CustodyValidationError(`${label} has unexpected key '${key}'`);
    }
  }
  for (const key of ACCESS_LOG_REQUIRED_KEYS) {
    if (!(key in entry)) {
      throw new CustodyValidationError(`${label} is missing key '${key}'`);
    }
  }
  if (entry.schema !== CUSTODY_ACCESS_LOG_ENTRY_SCHEMA) {
    throw new CustodyValidationError(
      `${label} schema must be '${CUSTODY_ACCESS_LOG_ENTRY_SCHEMA}'`,
    );
  }
  if (!Number.isInteger(entry.sequence) || entry.sequence < 1) {
    throw new CustodyValidationError(`${label} sequence must be an integer >= 1`);
  }
  assertNonEmptyString(entry.operator, `${label} operator`);
  if (!CUSTODY_OPERATIONS.includes(entry.operation)) {
    throw new CustodyValidationError(
      `${label} operation '${entry.operation}' is not a known custody operation`,
    );
  }
  assertIsoUtc(entry.at, `${label} at`);
  assertNonEmptyString(entry.prevEntryHash, `${label} prevEntryHash`);
  assertSha256(entry.entryHash, `${label} entryHash`);
  if ('custodyId' in entry) {
    assertSha256(entry.custodyId, `${label} custodyId`);
  }
}

/**
 * Full chain validation: sequences are monotonic from 1, prevEntryHash chains
 * from CUSTODY_ACCESS_LOG_GENESIS, and every entryHash recomputes as the
 * canonicalDigest of the entry minus entryHash. Returns the tail state.
 */
function validateAccessLogChain(entries) {
  let prevHash = CUSTODY_ACCESS_LOG_GENESIS;
  let expectedSequence = 1;
  for (const entry of entries) {
    const label = `access-log entry ${expectedSequence}`;
    validateAccessLogEntryShape(entry, label);
    if (entry.sequence !== expectedSequence) {
      throw new CustodyIntegrityError(
        `${label} sequence ${entry.sequence} breaks monotonic order `
        + `(expected ${expectedSequence})`,
      );
    }
    if (entry.prevEntryHash !== prevHash) {
      throw new CustodyIntegrityError(
        `${label} prevEntryHash does not chain from the previous entry`,
      );
    }
    const { entryHash, ...unsigned } = entry;
    const recomputed = canonicalDigest(unsigned);
    if (recomputed !== entryHash) {
      throw new CustodyIntegrityError(
        `${label} entryHash does not match its recomputed canonical digest`,
      );
    }
    prevHash = entryHash;
    expectedSequence += 1;
  }
  return {
    lastEntryHash: prevHash,
    lastSequence: expectedSequence - 1,
  };
}

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but is not signalable by us — alive.
    return error?.code === 'EPERM';
  }
}

/**
 * Exclusive advisory lock over the store root, held for the lifetime of a
 * handle (released by close()). Two live handles would both hold the same
 * in-memory chain tail and write duplicate access-log sequence numbers,
 * permanently failing validateAccessLogChain — so the second acquire fails
 * loud. A lock whose recorded pid is no longer alive is crash residue and is
 * broken exactly once; a lock held by a live pid is never stolen (manual
 * unlink of the lock file is the deliberate operator recovery path).
 *
 * The stale break goes through the SHARED breakStaleLockFile primitive in
 * model-village-phase0b-runtime.mjs (MV-B5 gap G2) so the two custody-bearing
 * locks in this codebase cannot drift. A bare unlinkSync here had the same
 * defect the phase0b lock did: it is bound to a PATH, so every contender that
 * read one stale holder removed whatever was at that path — measured at TWO
 * simultaneous handles per trial against a store whose entire lock rationale is
 * that a second handle forks the append-only chain. Mutual exclusion is decided
 * only by the exclusive create; the break just clears crash residue, and it now
 * proves it removed the exact bytes it inspected.
 */
function acquireStoreLock(rootDir, operator) {
  const lockPath = path.join(rootDir, LOCK_FILE_NAME);
  const payload = Buffer.from(
    canonicalJson({ acquiredAt: isoNow(), operator, pid: process.pid }),
    'utf8',
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileDurable(lockPath, payload, { exclusive: true });
      rememberOwnedLockFile(lockPath, payload);
      return lockPath;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let observed;
      try {
        observed = readFileSync(lockPath);
      } catch (readError) {
        if (readError?.code === 'ENOENT') continue; // vanished; retry create
        throw readError;
      }
      let holder = null;
      try {
        holder = JSON.parse(observed.toString('utf8'));
      } catch {
        holder = null;
      }
      if (holder && pidIsAlive(holder.pid)) {
        throw new CustodyLockError(
          `store root is locked by a live handle (pid ${holder.pid}, `
          + `operator ${holder.operator}, acquired ${holder.acquiredAt}); `
          + 'close() that handle first — a second concurrent handle would '
          + `fork the append-only chain. Lock file: ${lockPath}`,
        );
      }
      if (attempt === 1 || holder === null) {
        throw new CustodyLockError(
          `store lock at ${lockPath} could not be acquired (unreadable or `
          + 'contended); refusing to open a second handle blind',
        );
      }
      // Crash residue: the recorded pid is gone. Break it EXACTLY ONCE and
      // IDENTITY-BOUND (shared primitive; never a bare path unlink).
      const outcome = breakStaleLockFile(lockPath, observed);
      // ONLY the contender that actually moved the stale file may retry.
      if (outcome === 'broke') continue;
      throw new CustodyLockError(
        `store lock at ${lockPath} was claimed by another contender while its `
        + `stale holder (pid ${holder.pid}) was being cleared (${outcome}); `
        + 'refusing to break a lock that is no longer the one that was proven '
        + 'dead',
      );
    }
  }
  throw new CustodyLockError(`store lock at ${lockPath} could not be acquired`);
}

/**
 * Ownership-verified release: only the bytes this process wrote are removed, so
 * close() can never unlink a SUCCESSOR's lock and hand two handles the same
 * append-only chain.
 */
function releaseStoreLock(lockPath) {
  releaseOwnedLockFile(lockPath);
}

/**
 * True when the key file holds exactly the all-zero residue our own scrub
 * writes. This is deliberately narrow: under a tombstone we accept ONLY the
 * two states destroyContentKey itself can leave behind (the still-intact key,
 * or this zeroed residue). Any other key bytes are tamper, not crash residue.
 */
function isZeroedKeyResidue(keyBytes) {
  return keyBytes.length === KEY_BYTE_LENGTH && keyBytes.every((byte) => byte === 0);
}

/**
 * Idempotent key-file destruction: overwrite with zeros, fsync, unlink. Safe
 * to re-run against an already-scrubbed or already-absent file, which is what
 * makes destruction roll-forward-able after a crash (see destroyContentKey and
 * openSealedCustodyStore).
 */
function scrubAndUnlinkKeyFile(keyPath) {
  if (!existsSync(keyPath)) return;
  try {
    const fd = openSync(keyPath, 'r+');
    try {
      const zeros = Buffer.alloc(KEY_BYTE_LENGTH);
      writeSync(fd, zeros, 0, zeros.length, 0);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    // The file vanished between the existsSync and the open (another
    // roll-forward completed it); the unlink below is then a no-op.
    if (error?.code !== 'ENOENT') throw error;
  }
  try {
    unlinkSync(keyPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function listObjectFileNames(objectsDir) {
  if (!existsSync(objectsDir)) return { contentFiles: [], metaFiles: [] };
  const names = readdirSync(objectsDir).sort();
  const contentFiles = [];
  const metaFiles = [];
  for (const name of names) {
    if (name.endsWith('.meta.enc')) {
      metaFiles.push(name);
    } else if (name.endsWith('.enc')) {
      contentFiles.push(name);
    } else {
      throw new CustodyIntegrityError(
        `objects/ contains unexpected file '${name}'`,
      );
    }
  }
  return { contentFiles, metaFiles };
}

function walkFilesRelative(rootDir, currentDir = rootDir, output = []) {
  for (const name of readdirSync(currentDir).sort()) {
    const absolute = path.join(currentDir, name);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      walkFilesRelative(rootDir, absolute, output);
    } else {
      output.push(path.relative(rootDir, absolute).split(path.sep).join('/'));
    }
  }
  return output;
}

class SealedCustodyStore {
  #rootDir;
  #operator;
  #manifest;
  #key;
  #lastSequence;
  #lastEntryHash;
  #tombstones;
  #lockPath;
  #closed;

  /**
   * Module-internal factory: constructs the instance and appends the initial
   * access-log entry ('create' or 'open') through the private appender.
   * Static methods may touch private fields of same-class instances, which
   * keeps #appendAccessEntry sealed from external callers — audit entries
   * only ever come from the store's own public operations.
   */
  static bootstrap(internalToken, state, operation, extras) {
    const store = new SealedCustodyStore(internalToken, state);
    store.#appendAccessEntry(operation, extras);
    return store;
  }

  constructor(internalToken, state) {
    if (internalToken !== CONSTRUCTOR_TOKEN) {
      throw new CustodyValidationError(
        'use createSealedCustodyStore or openSealedCustodyStore',
      );
    }
    this.#rootDir = state.rootDir;
    this.#operator = state.operator;
    this.#manifest = state.manifest;
    this.#key = state.key;
    this.#lastSequence = state.lastSequence;
    this.#lastEntryHash = state.lastEntryHash;
    this.#tombstones = state.tombstones;
    this.#lockPath = state.lockPath;
    this.#closed = false;
  }

  get #manifestPath() {
    return path.join(this.#rootDir, 'store-manifest.json');
  }

  get #keyPath() {
    return path.join(this.#rootDir, 'key', 'content-key.bin');
  }

  get #objectsDir() {
    return path.join(this.#rootDir, 'objects');
  }

  get #accessLogPath() {
    return path.join(this.#rootDir, 'access-log.jsonl');
  }

  get #tombstonesPath() {
    return path.join(this.#rootDir, 'tombstones.jsonl');
  }

  get #backupDir() {
    return path.join(this.#rootDir, 'backup');
  }

  #objectPath(custodyId) {
    return path.join(this.#objectsDir, `${custodyId}.enc`);
  }

  #metadataPath(custodyId) {
    return path.join(this.#objectsDir, `${custodyId}.meta.enc`);
  }

  get keyDestroyed() {
    return this.#key === null;
  }

  get closed() {
    return this.#closed;
  }

  #assertOpenHandle(actionLabel) {
    if (this.#closed) {
      throw new CustodyValidationError(
        `${actionLabel} is unavailable: this store handle is closed `
        + '(the exclusive store lock has been released)',
      );
    }
  }

  /**
   * Releases the exclusive store-root lock and inertly closes this handle.
   * Idempotent. Required before another handle may open the same store —
   * the lock is held for the lifetime of the handle by design.
   */
  close() {
    if (this.#closed) return;
    this.#closed = true;
    releaseStoreLock(this.#lockPath);
  }

  /**
   * Fork detection (second fence behind the exclusive lock): before every
   * append, re-read the on-disk tail and require it to match this handle's
   * in-memory chain state. A stale handle — or an external append — fails
   * loud on its OWN write instead of writing a duplicate sequence number and
   * permanently corrupting the append-only chain.
   */
  #assertLogTailMatchesHandle() {
    const atGenesis = this.#lastEntryHash === CUSTODY_ACCESS_LOG_GENESIS;
    if (!existsSync(this.#accessLogPath)) {
      if (!atGenesis) {
        throw new CustodyIntegrityError(
          'access log vanished under a live handle; refusing to append',
        );
      }
      return;
    }
    const lines = readFileSync(this.#accessLogPath, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0);
    if (lines.length === 0) {
      if (!atGenesis) {
        throw new CustodyIntegrityError(
          'access log emptied under a live handle; refusing to append',
        );
      }
      return;
    }
    let tail = null;
    try {
      tail = JSON.parse(lines[lines.length - 1]);
    } catch {
      throw new CustodyIntegrityError(
        'access-log tail is not valid JSON; refusing to append over corruption',
      );
    }
    // Sequences are monotonic from 1, so the entry count must equal this
    // handle's last sequence — that also catches a foreign append that
    // duplicated the tail line byte-for-byte (identical entryHash/sequence),
    // which is exactly the dual-handle corruption shape.
    if (
      lines.length !== this.#lastSequence
      || tail?.entryHash !== this.#lastEntryHash
      || tail?.sequence !== this.#lastSequence
    ) {
      throw new CustodyIntegrityError(
        'access-log tail moved outside this handle (concurrent or external '
        + 'append detected); refusing to fork the chain',
      );
    }
  }

  /**
   * Named-operator access accounting: every operation appends a hash-chained
   * entry (write-then-fsync). The entryHash covers everything but itself and
   * chains via prevEntryHash from CUSTODY_ACCESS_LOG_GENESIS, so later edits
   * to any line are detectable without rewriting the append-only chain.
   * Entries carry no kind/label/plaintext — nonidentifying by construction.
   */
  #appendAccessEntry(operation, { custodyId, detail } = {}) {
    this.#assertLogTailMatchesHandle();
    const unsigned = {
      at: isoNow(),
      operation,
      operator: this.#operator,
      prevEntryHash: this.#lastEntryHash,
      schema: CUSTODY_ACCESS_LOG_ENTRY_SCHEMA,
      sequence: this.#lastSequence + 1,
    };
    if (custodyId !== undefined) unsigned.custodyId = custodyId;
    if (detail !== undefined) unsigned.detail = detail;
    const entryHash = canonicalDigest(unsigned);
    const entry = { ...unsigned, entryHash };
    appendLineDurable(this.#accessLogPath, canonicalJson(entry));
    this.#lastSequence = entry.sequence;
    this.#lastEntryHash = entryHash;
    return entry;
  }

  #requireLiveKey(actionLabel) {
    if (this.#key === null) {
      throw new CustodyKeyDestroyedError(
        `${actionLabel} is unavailable: the content key was destroyed `
        + '(deletion-by-key-destruction); ciphertext and the append-only '
        + 'chain remain, plaintext is unrecoverable',
      );
    }
    return this.#key;
  }

  getManifest() {
    return deepFreeze(structuredClone(this.#manifest));
  }

  /**
   * Seal raw bytes (or a canonical-JSON value) into custody.
   * custodyId = sha256 hex of the plaintext bytes; for `value` inputs the
   * plaintext is canonicalJson(value) UTF-8 bytes, so key order can never
   * change the custodyId (custodyId === canonicalDigest(value)).
   */
  sealObject({ bytes, value, kind, label } = {}) {
    this.#assertOpenHandle('sealObject');
    this.#requireLiveKey('sealObject');
    const hasBytes = bytes !== undefined;
    const hasValue = value !== undefined;
    if (hasBytes === hasValue) {
      throw new CustodyValidationError(
        'sealObject requires exactly one of bytes or value',
      );
    }
    let plaintext;
    if (hasBytes) {
      if (!Buffer.isBuffer(bytes)) {
        throw new CustodyValidationError('sealObject bytes must be a Buffer');
      }
      plaintext = Buffer.from(bytes);
    } else {
      plaintext = Buffer.from(canonicalJson(value), 'utf8');
    }
    assertNonEmptyString(kind, 'sealObject kind');
    assertNonEmptyString(label, 'sealObject label');
    const custodyId = sha256Hex(plaintext);
    const objectPath = this.#objectPath(custodyId);
    if (existsSync(objectPath)) {
      throw new CustodyDuplicateObjectError(
        `plaintext is already sealed under custodyId ${custodyId}`,
        custodyId,
      );
    }
    const fileBytes = encryptBytes(this.#key, custodyId, plaintext);
    const metadataPlaintext = Buffer.from(
      canonicalJson({ byteLength: plaintext.length, kind, label }),
      'utf8',
    );
    const metadataBytes = encryptBytes(
      this.#key,
      `${custodyId}:metadata`,
      metadataPlaintext,
    );
    writeFileDurable(objectPath, fileBytes, { exclusive: true });
    writeFileDurable(this.#metadataPath(custodyId), metadataBytes, {
      exclusive: true,
    });
    // Ciphertext checksums recorded here power checksum-only integrity
    // verification after key destruction. Nonidentifying: no kind/label.
    this.#appendAccessEntry('seal', {
      custodyId,
      detail: {
        ciphertextByteLength: fileBytes.length,
        ciphertextSha256: sha256Hex(fileBytes),
        metadataCiphertextSha256: sha256Hex(metadataBytes),
      },
    });
    return Object.freeze({ custodyId, byteLength: plaintext.length });
  }

  /**
   * Decrypts and returns { bytes, kind, label }. The decrypted plaintext is
   * re-hashed and must equal the custodyId (sha256-plaintext addressing);
   * GCM auth-tag failure or hash mismatch throws CustodyIntegrityError.
   * Successful reads are appended to the access log; a failed decrypt throws
   * before any log append (the verify operation is the audit surface for
   * corrupt objects).
   */
  readObject(custodyId) {
    this.#assertOpenHandle('readObject');
    assertSha256(custodyId, 'custodyId');
    const key = this.#requireLiveKey('readObject');
    const objectPath = this.#objectPath(custodyId);
    if (!existsSync(objectPath)) {
      throw new CustodyValidationError(
        `no sealed object exists for custodyId ${custodyId}`,
      );
    }
    const plaintext = decryptBytes(
      key,
      custodyId,
      readFileSync(objectPath),
      `sealed object ${custodyId}`,
    );
    const recomputed = sha256Hex(plaintext);
    if (recomputed !== custodyId) {
      throw new CustodyIntegrityError(
        `sealed object ${custodyId} decrypted to plaintext whose hash `
        + `${recomputed} does not match its custodyId`,
      );
    }
    const metadataPath = this.#metadataPath(custodyId);
    if (!existsSync(metadataPath)) {
      throw new CustodyIntegrityError(
        `sealed object ${custodyId} is missing its metadata record`,
      );
    }
    const metadata = JSON.parse(
      decryptBytes(
        key,
        `${custodyId}:metadata`,
        readFileSync(metadataPath),
        `sealed object metadata ${custodyId}`,
      ).toString('utf8'),
    );
    assertExactKeys(metadata, OBJECT_METADATA_KEYS, `metadata ${custodyId}`);
    if (metadata.byteLength !== plaintext.length) {
      throw new CustodyIntegrityError(
        `sealed object ${custodyId} metadata byteLength disagrees with plaintext`,
      );
    }
    this.#appendAccessEntry('read', { custodyId });
    return Object.freeze({
      bytes: plaintext,
      kind: metadata.kind,
      label: metadata.label,
    });
  }

  /**
   * Lists sealed objects. With a live key, metadata (kind/label/byteLength)
   * is decrypted; after key destruction only custodyIds remain readable —
   * metadataAvailable flags the difference honestly instead of guessing.
   */
  listObjects() {
    this.#assertOpenHandle('listObjects');
    const { contentFiles } = listObjectFileNames(this.#objectsDir);
    const entries = contentFiles.map((name) => {
      const custodyId = name.slice(0, -'.enc'.length);
      assertSha256(custodyId, `object file name ${name}`);
      if (this.#key === null) {
        return { custodyId, metadataAvailable: false };
      }
      const metadata = JSON.parse(
        decryptBytes(
          this.#key,
          `${custodyId}:metadata`,
          readFileSync(this.#metadataPath(custodyId)),
          `sealed object metadata ${custodyId}`,
        ).toString('utf8'),
      );
      assertExactKeys(metadata, OBJECT_METADATA_KEYS, `metadata ${custodyId}`);
      return {
        byteLength: metadata.byteLength,
        custodyId,
        kind: metadata.kind,
        label: metadata.label,
        metadataAvailable: true,
      };
    });
    this.#appendAccessEntry('list', {
      detail: { objectCount: entries.length },
    });
    return deepFreeze(entries);
  }

  /**
   * Deletion is reconciled through key destruction, never by rewriting the
   * append-only chain (spec sealed-store requirement).
   *
   * CRASH-ATOMICITY (MV-B5 gap G1): the durable COMMIT RECORD is the
   * HASH-CHAINED 'destroy-key' access-log entry, and it is appended and fsynced
   * FIRST, before a single key byte is touched. Sequence:
   * 1. append the 'destroy-key' access-log entry + fsync — it carries the whole
   *    nonidentifying tombstone in its detail, so the tombstone is recoverable
   *    from the authenticated chain alone,
   * 2. append the NONIDENTIFYING tombstone (no labels, no kinds, no custodyIds
   *    — scope 'all-objects' plus the key fingerprint and a bounded reason),
   * 3. overwrite key file bytes with zeros + fsync, then unlink it,
   * 4. zero and drop the in-memory key (in a finally: once step 1 lands the
   *    destruction is COMMITTED, so this handle must never serve plaintext
   *    again even if 2 or 3 throws).
   *
   * WHY THE CHAIN AND NOT THE TOMBSTONE: tombstones.jsonl is unauthenticated —
   * any stray, duplicated, or restored line would look identical to a real
   * record. Making the tombstone the commit record therefore let ONE appended
   * line irreversibly destroy a healthy store at its next open. The access log
   * chains every entry from genesis and re-hashes it, so an accidental or
   * partial-restore artifact cannot forge a commit: it breaks the chain and
   * fails loud instead.
   *
   * A crash anywhere in 2-4 leaves the committed entry on disk with the
   * tombstone present or absent and the key file intact or zeroed;
   * openSealedCustodyStore recognizes the committed entry and rolls the
   * destruction FORWARD (never backward — destruction stays irreversible),
   * re-emitting the tombstone from the entry when needed. A crash before step 1
   * leaves an untouched live store, which is the correct "the destroy never
   * happened" outcome. The original order (scrub first, commit last) left a
   * zeroed key with no commit record, which no code path could recover.
   *
   * Afterwards readObject/sealObject throw CustodyKeyDestroyedError and
   * verifyIntegrity switches to ciphertext-checksum-only mode.
   */
  destroyContentKey({ reason } = {}) {
    this.#assertOpenHandle('destroyContentKey');
    assertNonEmptyString(reason, 'destroyContentKey reason');
    if (reason.length > MAX_TOMBSTONE_REASON_LENGTH) {
      throw new CustodyValidationError(
        `destroyContentKey reason exceeds ${MAX_TOMBSTONE_REASON_LENGTH} `
        + 'characters; tombstone reasons must stay bounded and nonidentifying',
      );
    }
    this.#requireLiveKey('destroyContentKey');
    const tombstone = {
      at: isoNow(),
      keyFingerprint: this.#manifest.keyFingerprint,
      reason,
      schema: CUSTODY_TOMBSTONE_SCHEMA,
      scope: TOMBSTONE_SCOPE,
    };
    validateTombstone(tombstone, 'tombstone', this.#manifest.keyFingerprint);
    // STEP 1 — COMMIT POINT (authenticated, append-only, fsynced).
    this.#appendAccessEntry('destroy-key', {
      detail: { keyFingerprint: this.#manifest.keyFingerprint, tombstone },
    });
    try {
      // STEP 2 — the nonidentifying tombstone. Append-only: never rewritten.
      appendLineDurable(this.#tombstonesPath, canonicalJson(tombstone));
      this.#tombstones = [...this.#tombstones, tombstone];
      // STEP 3 — zero, fsync, unlink the key file.
      scrubAndUnlinkKeyFile(this.#keyPath);
    } finally {
      // STEP 4 — the in-memory key dies with the commit, unconditionally.
      if (this.#key !== null) {
        this.#key.fill(0);
        this.#key = null;
      }
    }
    return deepFreeze(tombstone);
  }

  /**
   * Copies manifest + objects + logs into backup/ with a checksums.json.
   * The key/ directory is deliberately EXCLUDED: a backup must not widen key
   * custody — copying the content key would create a second custodian and
   * defeat deletion-by-key-destruction. Backups are therefore ciphertext-only
   * and remain useful for chain/ciphertext preservation and tamper evidence.
   * An existing backup is replaced wholesale (single-slot backup by design;
   * the append-only truth lives in the store, not the backup).
   */
  createBackup() {
    this.#assertOpenHandle('createBackup');
    // Log first so the copied access-log contains its own backup entry.
    this.#appendAccessEntry('backup', {
      detail: { keyExcluded: true },
    });
    const backupDir = this.#backupDir;
    rmSync(backupDir, { force: true, recursive: true });
    mkdirSync(path.join(backupDir, 'objects'), { recursive: true });
    const relativeFiles = ['store-manifest.json', 'access-log.jsonl'];
    if (existsSync(this.#tombstonesPath)) {
      relativeFiles.push('tombstones.jsonl');
    }
    const { contentFiles, metaFiles } = listObjectFileNames(this.#objectsDir);
    for (const name of [...contentFiles, ...metaFiles]) {
      relativeFiles.push(`objects/${name}`);
    }
    const files = {};
    for (const relative of relativeFiles.sort()) {
      const bytes = readFileSync(
        path.join(this.#rootDir, ...relative.split('/')),
      );
      writeFileDurable(
        path.join(backupDir, ...relative.split('/')),
        bytes,
        { exclusive: true },
      );
      files[relative] = sha256Hex(bytes);
    }
    const checksums = {
      createdAt: isoNow(),
      files,
      keyExcluded: true,
      schema: CUSTODY_BACKUP_CHECKSUMS_SCHEMA,
    };
    writeFileDurable(
      path.join(backupDir, 'checksums.json'),
      Buffer.from(canonicalJson(checksums), 'utf8'),
      { exclusive: true },
    );
    return Object.freeze({
      backupDir,
      fileCount: relativeFiles.length,
      ok: true,
    });
  }

  #verifyBackupChecks() {
    const checks = [];
    const addCheck = (name, ok, detail) => {
      checks.push(Object.freeze({ name, ok, detail }));
    };
    const backupDir = this.#backupDir;
    if (!existsSync(backupDir)) {
      addCheck('backup-present', false, 'backup/ does not exist');
      return checks;
    }
    addCheck('backup-present', true, 'backup/ exists');
    if (existsSync(path.join(backupDir, 'key'))) {
      addCheck(
        'backup-key-excluded',
        false,
        'backup/ contains key/ — backups must not widen key custody',
      );
    } else {
      addCheck('backup-key-excluded', true, 'no key material in backup/');
    }
    let checksums = null;
    try {
      checksums = JSON.parse(
        readFileSync(path.join(backupDir, 'checksums.json'), 'utf8'),
      );
      assertExactKeys(checksums, BACKUP_CHECKSUMS_KEYS, 'backup checksums');
      if (checksums.schema !== CUSTODY_BACKUP_CHECKSUMS_SCHEMA) {
        throw new CustodyValidationError(
          `backup checksums schema must be '${CUSTODY_BACKUP_CHECKSUMS_SCHEMA}'`,
        );
      }
      assertObject(checksums.files, 'backup checksums files');
      if (checksums.keyExcluded !== true) {
        throw new CustodyValidationError(
          'backup checksums must declare keyExcluded: true',
        );
      }
      addCheck('backup-checksums-schema', true, 'checksums.json is well formed');
    } catch (error) {
      addCheck('backup-checksums-schema', false, error.message);
      return checks;
    }
    let allFilesOk = true;
    const details = [];
    for (const [relative, expected] of Object.entries(checksums.files)) {
      const filePath = path.join(backupDir, ...relative.split('/'));
      if (!existsSync(filePath)) {
        allFilesOk = false;
        details.push(`${relative}: missing`);
        continue;
      }
      const actual = sha256Hex(readFileSync(filePath));
      if (actual !== expected) {
        allFilesOk = false;
        details.push(`${relative}: sha256 mismatch`);
      }
    }
    const actualFiles = walkFilesRelative(backupDir).filter(
      (relative) => relative !== 'checksums.json',
    );
    for (const relative of actualFiles) {
      if (!(relative in checksums.files)) {
        allFilesOk = false;
        details.push(`${relative}: not listed in checksums.json`);
      }
    }
    addCheck(
      'backup-file-checksums',
      allFilesOk,
      allFilesOk
        ? `${Object.keys(checksums.files).length} file(s) verified`
        : details.join('; '),
    );
    return checks;
  }

  verifyBackup() {
    this.#assertOpenHandle('verifyBackup');
    this.#appendAccessEntry('verify-backup');
    const checks = this.#verifyBackupChecks();
    const ok = checks.every((check) => check.ok);
    return deepFreeze({ checks, ok });
  }

  /**
   * Full-store integrity verification. With a live key: every object is
   * decrypted and its plaintext hash must equal its custodyId. After key
   * destruction: ciphertext-checksum-only mode — each ciphertext file is
   * checked against the ciphertext sha256 recorded in its seal access-log
   * entry (the append-only chain is the checksum authority), and the chain
   * itself must still validate. Always checks: manifest closed keys/schema,
   * access-log chain + monotonic sequence, tombstone schema validity, and
   * backup checksums when a backup is present.
   */
  verifyIntegrity() {
    this.#assertOpenHandle('verifyIntegrity');
    this.#appendAccessEntry('verify');
    const mode = this.#key === null
      ? 'ciphertext-checksum-only'
      : 'plaintext-decrypt';
    const checks = [];
    const addCheck = (name, ok, detail) => {
      checks.push(Object.freeze({ name, ok, detail }));
    };

    // Manifest (re-read from disk to catch on-disk tamper).
    let manifestOk = true;
    try {
      const onDisk = JSON.parse(readFileSync(this.#manifestPath, 'utf8'));
      validateManifest(onDisk);
      if (canonicalJson(onDisk) !== canonicalJson(this.#manifest)) {
        throw new CustodyIntegrityError(
          'on-disk manifest differs from the manifest loaded at open',
        );
      }
      addCheck('manifest-schema', true, 'closed keys and schema verified');
    } catch (error) {
      manifestOk = false;
      addCheck('manifest-schema', false, error.message);
    }

    // Key custody.
    if (this.#key === null) {
      const keyGone = !existsSync(this.#keyPath);
      const tombstonePresent = this.#tombstones.length >= 1;
      addCheck(
        'key-custody',
        keyGone && tombstonePresent,
        keyGone && tombstonePresent
          ? 'content key destroyed with tombstone on record'
          : 'destroyed-key state is inconsistent '
            + `(keyFileAbsent=${keyGone}, tombstonePresent=${tombstonePresent})`,
      );
    } else {
      let keyOk = false;
      let keyDetail = '';
      try {
        const keyBytes = readFileSync(this.#keyPath);
        keyOk = keyBytes.length === KEY_BYTE_LENGTH
          && sha256Hex(keyBytes) === this.#manifest.keyFingerprint;
        keyDetail = keyOk
          ? 'key file matches manifest keyFingerprint'
          : 'key file does not match manifest keyFingerprint';
        // POSIX-only: a key file widened to group/world access lets any local
        // user copy the key BEFORE destruction, silently defeating
        // deletion-by-key-destruction. win32 mode bits are synthetic
        // (ACL-backed), so the assertion is meaningless there.
        if (keyOk && process.platform !== 'win32') {
          const keyMode = statSync(this.#keyPath).mode & 0o777;
          if ((keyMode & 0o077) !== 0) {
            keyOk = false;
            keyDetail = `key file mode 0${keyMode.toString(8)} is group/world `
              + 'accessible; sealed key custody requires owner-only 0600';
          }
        }
      } catch (error) {
        keyDetail = `key file unreadable: ${error.message}`;
      }
      addCheck('key-custody', keyOk, keyDetail);
    }

    // Access-log chain (re-read from disk).
    let logEntries = null;
    try {
      const entries = readJsonlEntries(this.#accessLogPath, 'access-log');
      validateAccessLogChain(entries);
      logEntries = entries;
      addCheck(
        'access-log-chain',
        true,
        `${entries.length} entries chained from genesis with monotonic sequence`,
      );
    } catch (error) {
      addCheck('access-log-chain', false, error.message);
    }

    // Seal records from the (valid) log power checksum-only object checks
    // and the objects-vs-seal-log cross reference.
    const sealDetails = new Map();
    if (logEntries) {
      for (const entry of logEntries) {
        if (entry.operation === 'seal' && entry.custodyId) {
          sealDetails.set(entry.custodyId, entry.detail);
        }
      }
    }

    // Objects.
    try {
      const { contentFiles, metaFiles } = listObjectFileNames(this.#objectsDir);
      const metaSet = new Set(metaFiles);
      const failures = [];
      for (const name of contentFiles) {
        const custodyId = name.slice(0, -'.enc'.length);
        if (!SHA256_PATTERN.test(custodyId)) {
          failures.push(`${name}: file name is not a custodyId`);
          continue;
        }
        if (!metaSet.has(`${custodyId}.meta.enc`)) {
          failures.push(`${custodyId}: metadata record missing`);
        }
        const fileBytes = readFileSync(this.#objectPath(custodyId));
        if (mode === 'plaintext-decrypt') {
          try {
            const plaintext = decryptBytes(
              this.#key,
              custodyId,
              fileBytes,
              `sealed object ${custodyId}`,
            );
            if (sha256Hex(plaintext) !== custodyId) {
              failures.push(`${custodyId}: plaintext hash mismatch`);
            }
            decryptBytes(
              this.#key,
              `${custodyId}:metadata`,
              readFileSync(this.#metadataPath(custodyId)),
              `sealed object metadata ${custodyId}`,
            );
          } catch (error) {
            failures.push(`${custodyId}: ${error.message}`);
          }
        } else {
          const seal = sealDetails.get(custodyId);
          if (!seal) {
            failures.push(
              `${custodyId}: no seal record available for checksum-only verify`,
            );
          } else {
            if (sha256Hex(fileBytes) !== seal.ciphertextSha256) {
              failures.push(`${custodyId}: ciphertext checksum mismatch`);
            }
            const metaBytes = readFileSync(this.#metadataPath(custodyId));
            if (sha256Hex(metaBytes) !== seal.metadataCiphertextSha256) {
              failures.push(
                `${custodyId}: metadata ciphertext checksum mismatch`,
              );
            }
          }
        }
      }
      addCheck(
        'objects-content',
        failures.length === 0,
        failures.length === 0
          ? `${contentFiles.length} object(s) verified in ${mode} mode`
          : failures.join('; '),
      );
      if (logEntries) {
        const fileIds = new Set(
          contentFiles.map((name) => name.slice(0, -'.enc'.length)),
        );
        const missingFiles = [...sealDetails.keys()].filter(
          (custodyId) => !fileIds.has(custodyId),
        );
        const unrecordedFiles = [...fileIds].filter(
          (custodyId) => !sealDetails.has(custodyId),
        );
        const crossOk = missingFiles.length === 0 && unrecordedFiles.length === 0;
        addCheck(
          'objects-vs-seal-log',
          crossOk,
          crossOk
            ? 'sealed object files and seal log records agree'
            : `missingFiles=${canonicalJson(missingFiles)} `
              + `unrecordedFiles=${canonicalJson(unrecordedFiles)}`,
        );
      } else {
        addCheck(
          'objects-vs-seal-log',
          false,
          'access-log chain invalid; seal records unavailable',
        );
      }
    } catch (error) {
      addCheck('objects-content', false, error.message);
    }

    // Tombstones.
    try {
      const tombstones = readJsonlEntries(this.#tombstonesPath, 'tombstones');
      tombstones.forEach((tombstone, index) => {
        validateTombstone(tombstone, `tombstone ${index + 1}`);
        if (
          manifestOk
          && tombstone.keyFingerprint !== this.#manifest.keyFingerprint
        ) {
          throw new CustodyIntegrityError(
            `tombstone ${index + 1} keyFingerprint does not match the manifest`,
          );
        }
      });
      if (this.#key === null && tombstones.length === 0) {
        throw new CustodyIntegrityError(
          'content key is destroyed but no tombstone is on record',
        );
      }
      addCheck(
        'tombstones',
        true,
        `${tombstones.length} tombstone(s) validated`,
      );
    } catch (error) {
      addCheck('tombstones', false, error.message);
    }

    // Backup checksums, when a backup exists.
    if (existsSync(this.#backupDir)) {
      const backupChecks = this.#verifyBackupChecks();
      const backupOk = backupChecks.every((check) => check.ok);
      addCheck(
        'backup-checksums',
        backupOk,
        backupOk
          ? 'backup checksums verified'
          : backupChecks
            .filter((check) => !check.ok)
            .map((check) => `${check.name}: ${check.detail}`)
            .join('; '),
      );
    }

    const ok = checks.every((check) => check.ok);
    return deepFreeze({
      checks,
      claimBoundary: CUSTODY_STORE_CLAIM_BOUNDARY,
      mode,
      ok,
    });
  }
}

const CONSTRUCTOR_TOKEN = Symbol('sealed-custody-store-internal');

/**
 * Creates a new sealed custody store. Fails loud if rootDir already exists
 * non-empty (a sealed store is never layered over prior content). The
 * retention/deletion policy is frozen into the manifest at creation time —
 * the spec requires it frozen before live runs; the caller supplies
 * { policyId, frozenAt, description } and the store pins the deletion method
 * to content-key destruction with append-only nonidentifying tombstones.
 */
export function createSealedCustodyStore({
  rootDir,
  runLabel,
  operator,
  retentionPolicy,
} = {}) {
  assertNonEmptyString(rootDir, 'rootDir');
  assertNonEmptyString(runLabel, 'runLabel');
  assertNonEmptyString(operator, 'operator');
  assertExactKeys(
    retentionPolicy,
    RETENTION_POLICY_INPUT_KEYS,
    'retentionPolicy',
  );
  const resolvedRoot = path.resolve(rootDir);
  if (existsSync(resolvedRoot)) {
    if (!statSync(resolvedRoot).isDirectory()) {
      throw new CustodyValidationError(
        `rootDir ${resolvedRoot} exists and is not a directory`,
      );
    }
    if (readdirSync(resolvedRoot).length > 0) {
      throw new CustodyValidationError(
        `rootDir ${resolvedRoot} exists and is not empty; refusing to seal `
        + 'over prior content',
      );
    }
  }
  // key/ is owner-only from creation (0o700; mode ignored on win32 where
  // ACL inheritance governs) — the content key must never be group/world
  // readable, or key destruction stops being deletion.
  mkdirSync(path.join(resolvedRoot, 'key'), {
    mode: KEY_DIR_MODE,
    recursive: true,
  });
  mkdirSync(path.join(resolvedRoot, 'objects'), { recursive: true });
  const lockPath = acquireStoreLock(resolvedRoot, operator);
  try {
    const key = randomBytes(KEY_BYTE_LENGTH);
    writeFileDurable(
      path.join(resolvedRoot, 'key', 'content-key.bin'),
      key,
      { exclusive: true, mode: KEY_FILE_MODE },
    );
    const manifest = {
      cipher: CIPHER,
      createdAt: isoNow(),
      custodyIdAlgorithm: CUSTODY_ID_ALGORITHM,
      keyFingerprint: sha256Hex(key),
      operator,
      retentionPolicy: {
        deletionMethod: DELETION_METHOD,
        description: retentionPolicy.description,
        frozenAt: retentionPolicy.frozenAt,
        policyId: retentionPolicy.policyId,
        tombstoneMethod: TOMBSTONE_METHOD,
      },
      runLabel,
      schema: SEALED_CUSTODY_STORE_SCHEMA,
      storeId: randomUUID(),
    };
    validateManifest(manifest);
    writeFileDurable(
      path.join(resolvedRoot, 'store-manifest.json'),
      Buffer.from(canonicalJson(manifest), 'utf8'),
      { exclusive: true },
    );
    return SealedCustodyStore.bootstrap(
      CONSTRUCTOR_TOKEN,
      {
        key,
        lastEntryHash: CUSTODY_ACCESS_LOG_GENESIS,
        lastSequence: 0,
        lockPath,
        manifest: deepFreeze(manifest),
        operator,
        rootDir: resolvedRoot,
        tombstones: [],
      },
      'create',
      { detail: { storeId: manifest.storeId } },
    );
  } catch (error) {
    releaseStoreLock(lockPath);
    throw error;
  }
}

/**
 * Opens an existing sealed custody store: validates the manifest (closed
 * keys), verifies the key fingerprint when the key survives (or requires a
 * tombstone when it does not), fully re-validates the access-log chain, then
 * appends the 'open' entry. A tampered chain fails the open loudly.
 */
export function openSealedCustodyStore({ rootDir, operator } = {}) {
  assertNonEmptyString(rootDir, 'rootDir');
  assertNonEmptyString(operator, 'operator');
  const resolvedRoot = path.resolve(rootDir);
  const manifestPath = path.join(resolvedRoot, 'store-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new CustodyValidationError(
      `no sealed custody store manifest at ${manifestPath}`,
    );
  }
  // The exclusive lock is taken BEFORE reading chain state so the validated
  // tail cannot be moved by a concurrent handle between open and first
  // append. Released on any open failure and by close().
  const lockPath = acquireStoreLock(resolvedRoot, operator);
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    validateManifest(manifest);

    // The hash-chained access log is read and validated FIRST because it is
    // the only AUTHENTICATED record in the store. It — never an
    // unauthenticated tombstone line — decides whether a key destruction was
    // committed (MV-B5 G1). A tampered or torn chain still fails the open loud.
    const accessLogPath = path.join(resolvedRoot, 'access-log.jsonl');
    const entries = readJsonlEntries(accessLogPath, 'access-log');
    if (entries.length === 0) {
      throw new CustodyIntegrityError(
        'access log is empty; a sealed store always records its create entry',
      );
    }
    const tail = validateAccessLogChain(entries);
    const destroyEntry = entries
      .filter((entry) => entry.operation === 'destroy-key')
      .pop() ?? null;
    const destructionCommitted = destroyEntry !== null;

    const tombstonesPath = path.join(resolvedRoot, 'tombstones.jsonl');
    const { entries: tombstones } = readTombstoneEntries(tombstonesPath);
    tombstones.forEach((tombstone, index) => {
      validateTombstone(
        tombstone,
        `tombstone ${index + 1}`,
        manifest.keyFingerprint,
      );
    });
    if (!destructionCommitted && tombstones.length > 0) {
      // A tombstone is a CONSEQUENCE of a committed destruction, never the
      // commit itself. One stray/duplicated/restored line must not be able to
      // destroy a healthy store's key at open.
      throw new CustodyIntegrityError(
        'tombstone(s) are on record but the hash-chained access log records no '
        + "'destroy-key' entry committing that destruction; an unauthenticated "
        + 'tombstone line is not a commit record, so the live content key is '
        + 'NOT destroyed — repair the store rather than losing the key',
      );
    }

    const keyPath = path.join(resolvedRoot, 'key', 'content-key.bin');
    let key = null;
    let keyDestructionCompletedOnOpen = false;
    if (destructionCommitted) {
      // MV-B5 gap G1 recovery. The chain says the destruction is committed, so
      // roll it FORWARD — never backward, a committed destruction must stay
      // irreversible.
      if (existsSync(keyPath)) {
        const keyBytes = readFileSync(keyPath);
        const matchesFingerprint = keyBytes.length === KEY_BYTE_LENGTH
          && sha256Hex(keyBytes) === manifest.keyFingerprint;
        // Only the two states destroyContentKey itself can leave are accepted
        // (still-intact key, or the all-zero scrub residue); anything else is
        // tamper and the fingerprint check still fails closed.
        if (!matchesFingerprint && !isZeroedKeyResidue(keyBytes)) {
          keyBytes.fill(0);
          throw new CustodyIntegrityError(
            'content key file is neither the manifest key nor the zeroed '
            + 'residue of an interrupted destruction, yet a tombstone records '
            + 'that destruction; refusing to open a tampered key file',
          );
        }
        keyBytes.fill(0);
        scrubAndUnlinkKeyFile(keyPath);
        keyDestructionCompletedOnOpen = true;
      }
      if (tombstones.length === 0) {
        // Crash between step 1 (commit) and step 2 (tombstone append). The
        // tombstone travels inside the committed, hash-chained entry, so it is
        // re-emitted verbatim rather than reconstructed from guesswork.
        const committedTombstone = destroyEntry.detail?.tombstone;
        if (!committedTombstone || typeof committedTombstone !== 'object') {
          throw new CustodyIntegrityError(
            "the committed 'destroy-key' access-log entry carries no "
            + 'recoverable tombstone and tombstones.jsonl is empty; the '
            + 'nonidentifying tombstone cannot be re-emitted',
          );
        }
        validateTombstone(
          committedTombstone,
          'committed tombstone',
          manifest.keyFingerprint,
        );
        appendLineDurable(tombstonesPath, canonicalJson(committedTombstone));
        tombstones.push(committedTombstone);
        keyDestructionCompletedOnOpen = true;
      }
    } else if (existsSync(keyPath)) {
      const keyBytes = readFileSync(keyPath);
      // Unchanged, and deliberately NOT weakened: an intact key file that
      // disagrees with the manifest fingerprint, with no committed destruction
      // on record, is corruption or tamper.
      if (
        keyBytes.length !== KEY_BYTE_LENGTH
        || sha256Hex(keyBytes) !== manifest.keyFingerprint
      ) {
        throw new CustodyIntegrityError(
          'content key file does not match the manifest keyFingerprint',
        );
      }
      key = keyBytes;
    } else {
      throw new CustodyIntegrityError(
        'content key file is missing but no committed destroy-key entry '
        + 'records its destruction',
      );
    }
    return SealedCustodyStore.bootstrap(
      CONSTRUCTOR_TOKEN,
      {
        key,
        lastEntryHash: tail.lastEntryHash,
        lastSequence: tail.lastSequence,
        lockPath,
        manifest: deepFreeze(manifest),
        operator,
        rootDir: resolvedRoot,
        tombstones,
      },
      'open',
      {
        detail: keyDestructionCompletedOnOpen
          // Recorded in the append-only chain because this open MUTATED the
          // store: it completed a committed-but-interrupted key destruction.
          ? { keyDestructionCompletedOnOpen: true, keyPresent: false }
          : { keyPresent: key !== null },
      },
    );
  } catch (error) {
    releaseStoreLock(lockPath);
    throw error;
  }
}

export { SealedCustodyStore };
