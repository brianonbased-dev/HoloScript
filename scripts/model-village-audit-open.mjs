/* global Buffer, process */

/**
 * MV-B5 read-only audit-open primitive for the Model Village sealed custody
 * store (the named MV-B1 follow-up).
 *
 * WHY THIS EXISTS (the gap it closes):
 * `openSealedCustodyStore` (scripts/model-village-custody-store.mjs) is a
 * MUTATING open. It (a) acquires the exclusive store.lock
 * (model-village-custody-store.mjs:1555 -> acquireStoreLock -> writeFileDurable
 * with the 'wx' exclusive flag at :334) and (b) appends an 'open' access-log
 * entry (:1601-1602 via SealedCustodyStore.bootstrap -> #appendAccessEntry).
 * `verifyIntegrity` then appends a SECOND entry, a 'verify' entry
 * (model-village-custody-store.mjs:1202). Consequences:
 *   - A preserved/FROZEN copy cannot be audited with verifyIntegrity without
 *     changing it: every audit lengthens the append-only chain and moves the
 *     tail hash.
 *   - A copy on READ-ONLY media cannot be opened at all: acquireStoreLock's
 *     exclusive create throws EROFS/EACCES before any verification runs.
 *   - A copy whose lock file is stale (crash residue) or held by a live handle
 *     forces lock arbitration that a pure auditor should never perform.
 * There is no lock-free, non-appending open in the production API today.
 *
 * This module implements that missing primitive AGAINST THE RAW FILES: it
 * re-verifies the access-log hash chain, every object's ciphertext checksum
 * (or plaintext hash when the content key is present), the manifest's closed
 * key set, the tombstones, and any backup checksums, WITHOUT acquiring the
 * lock and WITHOUT appending anything. It only ever reads
 * (readFileSync/existsSync/readdirSync/statSync), so it works on a frozen
 * copy, a read-only directory, or a copy whose lock file is stale.
 *
 * It is an INDEPENDENT read-only re-verifier, not a second custody handle: it
 * duplicates the verification MATH (canonical-digest chaining, sha256
 * checksums, GCM decryption) but claims none of the store's write guarantees.
 * The exact closed key sets and cipher parameters below mirror the SSOT in
 * scripts/model-village-custody-store.mjs; they are re-declared here (not
 * imported) precisely because the auditor must not depend on the store's
 * private surface. If those closed sets ever change in the store, this file's
 * mirrored constants are the single place to update.
 *
 * Claim boundary: single-host read-only re-verification. It does NOT repair,
 * does NOT prove distributed/multi-host consensus, and does NOT prove
 * durability against media failure or an OS that lies about fsync. It reports
 * inconsistent states; it never fixes them.
 */

import { createDecipheriv, createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

import {
  CUSTODY_ACCESS_LOG_ENTRY_SCHEMA,
  CUSTODY_ACCESS_LOG_GENESIS,
  CUSTODY_BACKUP_CHECKSUMS_SCHEMA,
  CUSTODY_OPERATIONS,
  CUSTODY_STORE_CLAIM_BOUNDARY,
  CUSTODY_TOMBSTONE_SCHEMA,
  SEALED_CUSTODY_STORE_SCHEMA,
} from './model-village-custody-store.mjs';
import { canonicalDigest, canonicalJson } from './model-village-phase0b-runtime.mjs';

export const AUDIT_OPEN_SCHEMA = 'hololand.model-village-audit-open.v1';

/**
 * What a read-only audit-open explicitly does NOT claim. Rides every result so
 * a consumer can never over-read the guarantee.
 */
export const AUDIT_OPEN_CLAIM_BOUNDARY = Object.freeze({
  readOnlyReVerification: true,
  singleHostVerification: true,
  acquiresExclusiveLock: false,
  appendsAccessLogEntry: false,
  mutatesStore: false,
  repairsInconsistency: false,
  usesProductionOpenApi: false,
  distributedMultiHostConsensusClaimed: false,
  mediaFailureDurabilityClaimed: false,
  fsyncHonestyClaimed: false,
});

/** Typed error for malformed audit-open results. */
export class ModelVillageAuditOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelVillageAuditOpenError';
  }
}

// --- Constants mirrored from model-village-custody-store.mjs (SSOT there). ---
const CIPHER = 'aes-256-gcm';
const CUSTODY_ID_ALGORITHM = 'sha256-plaintext';
const KEY_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;
const MIN_ENC_FILE_LENGTH = IV_BYTE_LENGTH + AUTH_TAG_BYTE_LENGTH;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
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

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ModelVillageAuditOpenError(`${label} must be a non-empty string`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function exactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return canonicalJson(actual) === canonicalJson(expected);
}

function isSha256(value) {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

function readJsonlLines(filePath, label) {
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter((line) => line.length > 0);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new ModelVillageAuditOpenError(
        `${label} line ${index + 1} is not valid JSON: ${error.message}`,
      );
    }
  });
}

/**
 * AES-256-GCM read-only decrypt: fileBytes = IV(12) || authTag(16) ||
 * ciphertext, AAD binds the object to its custody address. Mirrors the store's
 * decryptBytes; throws on auth-tag failure.
 */
function decryptGcm(key, aad, fileBytes, label) {
  if (!Buffer.isBuffer(fileBytes) || fileBytes.length < MIN_ENC_FILE_LENGTH) {
    throw new ModelVillageAuditOpenError(
      `${label} is too short to contain IV and auth tag`,
    );
  }
  const iv = fileBytes.subarray(0, IV_BYTE_LENGTH);
  const authTag = fileBytes.subarray(IV_BYTE_LENGTH, MIN_ENC_FILE_LENGTH);
  const ciphertext = fileBytes.subarray(MIN_ENC_FILE_LENGTH);
  const decipher = createDecipheriv(CIPHER, key, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Read-only manifest shape re-verification (closed keys + pinned values). */
function checkManifestShape(manifest) {
  if (!exactKeys(manifest, MANIFEST_KEYS)) {
    throw new ModelVillageAuditOpenError('manifest closed key set differs');
  }
  if (manifest.schema !== SEALED_CUSTODY_STORE_SCHEMA) {
    throw new ModelVillageAuditOpenError('manifest schema mismatch');
  }
  if (manifest.cipher !== CIPHER) {
    throw new ModelVillageAuditOpenError('manifest cipher mismatch');
  }
  if (manifest.custodyIdAlgorithm !== CUSTODY_ID_ALGORITHM) {
    throw new ModelVillageAuditOpenError('manifest custodyIdAlgorithm mismatch');
  }
  if (!isSha256(manifest.keyFingerprint)) {
    throw new ModelVillageAuditOpenError('manifest keyFingerprint is not sha256');
  }
  assertNonEmptyString(manifest.storeId, 'manifest.storeId');
  assertNonEmptyString(manifest.operator, 'manifest.operator');
  assertNonEmptyString(manifest.runLabel, 'manifest.runLabel');
  if (!ISO_UTC_PATTERN.test(manifest.createdAt)) {
    throw new ModelVillageAuditOpenError('manifest.createdAt is not ISO-8601 UTC');
  }
  if (!exactKeys(manifest.retentionPolicy, RETENTION_POLICY_KEYS)) {
    throw new ModelVillageAuditOpenError('retentionPolicy closed key set differs');
  }
  if (manifest.retentionPolicy.deletionMethod !== DELETION_METHOD) {
    throw new ModelVillageAuditOpenError('retentionPolicy.deletionMethod mismatch');
  }
  if (manifest.retentionPolicy.tombstoneMethod !== TOMBSTONE_METHOD) {
    throw new ModelVillageAuditOpenError('retentionPolicy.tombstoneMethod mismatch');
  }
}

function checkTombstoneShape(tombstone, label, keyFingerprint) {
  if (!exactKeys(tombstone, TOMBSTONE_KEYS)) {
    throw new ModelVillageAuditOpenError(`${label} closed key set differs`);
  }
  if (tombstone.schema !== CUSTODY_TOMBSTONE_SCHEMA) {
    throw new ModelVillageAuditOpenError(`${label} schema mismatch`);
  }
  if (tombstone.scope !== TOMBSTONE_SCOPE) {
    throw new ModelVillageAuditOpenError(`${label} scope mismatch`);
  }
  assertNonEmptyString(tombstone.reason, `${label} reason`);
  if (!ISO_UTC_PATTERN.test(tombstone.at)) {
    throw new ModelVillageAuditOpenError(`${label} at is not ISO-8601 UTC`);
  }
  if (!isSha256(tombstone.keyFingerprint)) {
    throw new ModelVillageAuditOpenError(`${label} keyFingerprint is not sha256`);
  }
  if (keyFingerprint && tombstone.keyFingerprint !== keyFingerprint) {
    throw new ModelVillageAuditOpenError(
      `${label} keyFingerprint does not match the manifest`,
    );
  }
}

/**
 * Re-verify the access-log hash chain read-only, mirroring the store's
 * validateAccessLogChain: sequences monotonic from 1, prevEntryHash chained
 * from CUSTODY_ACCESS_LOG_GENESIS, each entryHash === canonicalDigest(entry
 * minus entryHash). Returns { length, tailHash, sealDetails }.
 */
function verifyChainReadOnly(entries) {
  const allowed = new Set([
    ...ACCESS_LOG_REQUIRED_KEYS,
    ...ACCESS_LOG_OPTIONAL_KEYS,
  ]);
  const sealDetails = new Map();
  let prevHash = CUSTODY_ACCESS_LOG_GENESIS;
  let expectedSequence = 1;
  for (const entry of entries) {
    const label = `access-log entry ${expectedSequence}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ModelVillageAuditOpenError(`${label} is not an object`);
    }
    for (const key of Object.keys(entry)) {
      if (!allowed.has(key)) {
        throw new ModelVillageAuditOpenError(`${label} has unexpected key '${key}'`);
      }
    }
    for (const key of ACCESS_LOG_REQUIRED_KEYS) {
      if (!(key in entry)) {
        throw new ModelVillageAuditOpenError(`${label} is missing key '${key}'`);
      }
    }
    if (entry.schema !== CUSTODY_ACCESS_LOG_ENTRY_SCHEMA) {
      throw new ModelVillageAuditOpenError(`${label} schema mismatch`);
    }
    if (!CUSTODY_OPERATIONS.includes(entry.operation)) {
      throw new ModelVillageAuditOpenError(
        `${label} operation '${entry.operation}' is not a known custody operation`,
      );
    }
    if (entry.sequence !== expectedSequence) {
      throw new ModelVillageAuditOpenError(
        `${label} sequence ${entry.sequence} breaks monotonic order `
        + `(expected ${expectedSequence})`,
      );
    }
    if (entry.prevEntryHash !== prevHash) {
      throw new ModelVillageAuditOpenError(
        `${label} prevEntryHash does not chain from the previous entry`,
      );
    }
    if (!isSha256(entry.entryHash)) {
      throw new ModelVillageAuditOpenError(`${label} entryHash is not sha256`);
    }
    const { entryHash, ...unsigned } = entry;
    if (canonicalDigest(unsigned) !== entryHash) {
      throw new ModelVillageAuditOpenError(
        `${label} entryHash does not match its recomputed canonical digest`,
      );
    }
    if (entry.operation === 'seal' && entry.custodyId) {
      sealDetails.set(entry.custodyId, entry.detail);
    }
    prevHash = entryHash;
    expectedSequence += 1;
  }
  return { length: entries.length, tailHash: prevHash, sealDetails };
}

/**
 * Read-only, lock-free, non-appending audit of a preserved/frozen sealed
 * custody store copy. Unlike verifyIntegrity (which acquires the exclusive
 * lock via open and appends 'open' + 'verify' entries), this reads the raw
 * files only and mutates nothing.
 *
 * @param {{ rootDir: string }} args
 * @returns {{ ok, mode, checks: Array<{name, ok, detail}>, claimBoundary,
 *   accessLogLength, accessLogTailHash }}
 */
export function auditOpenCustodyStore({ rootDir } = {}) {
  assertNonEmptyString(rootDir, 'rootDir');
  const root = path.resolve(rootDir);
  const manifestPath = path.join(root, 'store-manifest.json');
  const keyPath = path.join(root, 'key', 'content-key.bin');
  const objectsDir = path.join(root, 'objects');
  const accessLogPath = path.join(root, 'access-log.jsonl');
  const tombstonesPath = path.join(root, 'tombstones.jsonl');
  const backupDir = path.join(root, 'backup');

  const checks = [];
  const addCheck = (name, ok, detail) => {
    checks.push(Object.freeze({ name, ok: Boolean(ok), detail }));
  };

  // Manifest (read-only shape re-verification).
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    checkManifestShape(manifest);
    addCheck('manifest', true, 'closed keys and schema verified');
  } catch (error) {
    manifest = null;
    addCheck('manifest', false, error.message);
  }

  // Key custody + verification mode.
  const keyPresent = existsSync(keyPath);
  const mode = keyPresent ? 'plaintext-decrypt' : 'ciphertext-checksum-only';
  let key = null;
  if (keyPresent) {
    try {
      const keyBytes = readFileSync(keyPath);
      const keyOk = keyBytes.length === KEY_BYTE_LENGTH
        && manifest
        && sha256Hex(keyBytes) === manifest.keyFingerprint;
      if (keyOk) {
        key = keyBytes;
        // POSIX-only: a widened key file silently defeats deletion-by-key-
        // destruction (win32 mode bits are synthetic/ACL-backed).
        if (process.platform !== 'win32') {
          const keyMode = statSync(keyPath).mode & 0o777;
          if ((keyMode & 0o077) !== 0) {
            addCheck(
              'key-custody',
              false,
              `key file mode 0${keyMode.toString(8)} is group/world accessible; `
              + 'sealed key custody requires owner-only 0600',
            );
          } else {
            addCheck('key-custody', true, 'key file matches manifest keyFingerprint');
          }
        } else {
          addCheck('key-custody', true, 'key file matches manifest keyFingerprint');
        }
      } else {
        addCheck(
          'key-custody',
          false,
          'key file does not match manifest keyFingerprint',
        );
      }
    } catch (error) {
      addCheck('key-custody', false, `key file unreadable: ${error.message}`);
    }
  } else {
    let tombstoneCount = 0;
    try {
      tombstoneCount = existsSync(tombstonesPath)
        ? readJsonlLines(tombstonesPath, 'tombstones').length
        : 0;
    } catch {
      tombstoneCount = 0;
    }
    addCheck(
      'key-custody',
      tombstoneCount >= 1,
      tombstoneCount >= 1
        ? 'content key destroyed with tombstone on record'
        : 'content key file absent and no tombstone records its destruction',
    );
  }

  // Access-log chain (read-only re-verification).
  let chain = null;
  try {
    if (!existsSync(accessLogPath)) {
      throw new ModelVillageAuditOpenError('access-log.jsonl does not exist');
    }
    const entries = readJsonlLines(accessLogPath, 'access-log');
    if (entries.length === 0) {
      throw new ModelVillageAuditOpenError(
        'access log is empty; a sealed store always records its create entry',
      );
    }
    chain = verifyChainReadOnly(entries);
    addCheck(
      'access-log-chain',
      true,
      `${chain.length} entries chained from genesis with monotonic sequence`,
    );
  } catch (error) {
    addCheck('access-log-chain', false, error.message);
  }

  // Objects (plaintext-decrypt when key present, else ciphertext-checksum-only).
  try {
    const contentFiles = [];
    const metaSet = new Set();
    if (existsSync(objectsDir)) {
      for (const name of readdirSync(objectsDir).sort()) {
        if (name.endsWith('.meta.enc')) metaSet.add(name);
        else if (name.endsWith('.enc')) contentFiles.push(name);
        else {
          throw new ModelVillageAuditOpenError(
            `objects/ contains unexpected file '${name}'`,
          );
        }
      }
    }
    const failures = [];
    const fileIds = new Set();
    for (const name of contentFiles) {
      const custodyId = name.slice(0, -'.enc'.length);
      if (!SHA256_PATTERN.test(custodyId)) {
        failures.push(`${name}: file name is not a custodyId`);
        continue;
      }
      fileIds.add(custodyId);
      const fileBytes = readFileSync(path.join(objectsDir, name));
      const metaName = `${custodyId}.meta.enc`;
      const hasMeta = metaSet.has(metaName);
      if (!hasMeta) failures.push(`${custodyId}: metadata record missing`);
      if (mode === 'plaintext-decrypt' && key) {
        try {
          const plaintext = decryptGcm(
            key,
            custodyId,
            fileBytes,
            `sealed object ${custodyId}`,
          );
          if (sha256Hex(plaintext) !== custodyId) {
            failures.push(`${custodyId}: plaintext hash mismatch`);
          }
          if (hasMeta) {
            const metaPlain = decryptGcm(
              key,
              `${custodyId}:metadata`,
              readFileSync(path.join(objectsDir, metaName)),
              `sealed object metadata ${custodyId}`,
            );
            const metadata = JSON.parse(metaPlain.toString('utf8'));
            if (!exactKeys(metadata, OBJECT_METADATA_KEYS)) {
              failures.push(`${custodyId}: metadata closed key set differs`);
            } else if (metadata.byteLength !== plaintext.length) {
              failures.push(`${custodyId}: metadata byteLength disagrees with plaintext`);
            }
          }
        } catch (error) {
          failures.push(`${custodyId}: ${error.message}`);
        }
      } else {
        // Ciphertext-checksum-only: the append-only chain is the authority.
        const seal = chain ? chain.sealDetails.get(custodyId) : undefined;
        if (!seal) {
          failures.push(
            `${custodyId}: no seal record available for checksum-only verify`,
          );
        } else {
          if (sha256Hex(fileBytes) !== seal.ciphertextSha256) {
            failures.push(`${custodyId}: ciphertext checksum mismatch`);
          }
          if (hasMeta) {
            const metaBytes = readFileSync(path.join(objectsDir, metaName));
            if (sha256Hex(metaBytes) !== seal.metadataCiphertextSha256) {
              failures.push(`${custodyId}: metadata ciphertext checksum mismatch`);
            }
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

    // Objects <-> seal-log cross reference.
    if (chain) {
      const missingFiles = [...chain.sealDetails.keys()].filter(
        (custodyId) => !fileIds.has(custodyId),
      );
      const unrecordedFiles = [...fileIds].filter(
        (custodyId) => !chain.sealDetails.has(custodyId),
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
    const tombstones = existsSync(tombstonesPath)
      ? readJsonlLines(tombstonesPath, 'tombstones')
      : [];
    tombstones.forEach((tombstone, index) => {
      checkTombstoneShape(
        tombstone,
        `tombstone ${index + 1}`,
        manifest ? manifest.keyFingerprint : null,
      );
    });
    if (!keyPresent && tombstones.length === 0) {
      throw new ModelVillageAuditOpenError(
        'content key is destroyed but no tombstone is on record',
      );
    }
    addCheck('tombstones', true, `${tombstones.length} tombstone(s) validated`);
  } catch (error) {
    addCheck('tombstones', false, error.message);
  }

  // Backup checksums, when a backup exists.
  if (existsSync(backupDir)) {
    try {
      const checksums = JSON.parse(
        readFileSync(path.join(backupDir, 'checksums.json'), 'utf8'),
      );
      if (!exactKeys(checksums, BACKUP_CHECKSUMS_KEYS)) {
        throw new ModelVillageAuditOpenError('backup checksums closed key set differs');
      }
      if (checksums.schema !== CUSTODY_BACKUP_CHECKSUMS_SCHEMA) {
        throw new ModelVillageAuditOpenError('backup checksums schema mismatch');
      }
      if (checksums.keyExcluded !== true) {
        throw new ModelVillageAuditOpenError('backup must declare keyExcluded: true');
      }
      if (existsSync(path.join(backupDir, 'key'))) {
        throw new ModelVillageAuditOpenError('backup/ contains key/ material');
      }
      const details = [];
      for (const [relative, expected] of Object.entries(checksums.files)) {
        const filePath = path.join(backupDir, ...relative.split('/'));
        if (!existsSync(filePath)) {
          details.push(`${relative}: missing`);
          continue;
        }
        if (sha256Hex(readFileSync(filePath)) !== expected) {
          details.push(`${relative}: sha256 mismatch`);
        }
      }
      addCheck(
        'backup-checksums',
        details.length === 0,
        details.length === 0
          ? `${Object.keys(checksums.files).length} backup file(s) verified`
          : details.join('; '),
      );
    } catch (error) {
      addCheck('backup-checksums', false, error.message);
    }
  }

  const ok = checks.every((check) => check.ok);
  return deepFreeze({
    ok,
    mode,
    checks,
    claimBoundary: AUDIT_OPEN_CLAIM_BOUNDARY,
    accessLogLength: chain ? chain.length : null,
    accessLogTailHash: chain ? chain.tailHash : null,
    schema: AUDIT_OPEN_SCHEMA,
  });
}

/**
 * Structural validation of an audit-open result: ok is boolean, checks is an
 * array of { name, ok, detail }, ok equals the conjunction of the checks, and
 * a claimBoundary rides the result. Throws ModelVillageAuditOpenError on any
 * malformed shape; returns true otherwise.
 */
export function verifyAuditOpenResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new ModelVillageAuditOpenError('audit-open result must be an object');
  }
  if (typeof result.ok !== 'boolean') {
    throw new ModelVillageAuditOpenError('audit-open result.ok must be a boolean');
  }
  if (!Array.isArray(result.checks) || result.checks.length === 0) {
    throw new ModelVillageAuditOpenError('audit-open result.checks must be a non-empty array');
  }
  for (const check of result.checks) {
    if (
      !check
      || typeof check !== 'object'
      || typeof check.name !== 'string'
      || typeof check.ok !== 'boolean'
      || typeof check.detail !== 'string'
    ) {
      throw new ModelVillageAuditOpenError(
        'each audit-open check must be { name:string, ok:boolean, detail:string }',
      );
    }
  }
  const conjunction = result.checks.every((check) => check.ok);
  if (result.ok !== conjunction) {
    throw new ModelVillageAuditOpenError(
      'audit-open result.ok must equal the conjunction of its checks',
    );
  }
  if (!result.claimBoundary || typeof result.claimBoundary !== 'object') {
    throw new ModelVillageAuditOpenError('audit-open result.claimBoundary is required');
  }
  if (result.claimBoundary.appendsAccessLogEntry !== false
    || result.claimBoundary.acquiresExclusiveLock !== false) {
    throw new ModelVillageAuditOpenError(
      'audit-open claimBoundary must pin acquiresExclusiveLock=false and '
      + 'appendsAccessLogEntry=false (a read-only audit mutates nothing)',
    );
  }
  return true;
}

// Reference to the store's own claim boundary so callers can cross-check that
// this read-only auditor never asserts a guarantee the store itself disclaims.
export { CUSTODY_STORE_CLAIM_BOUNDARY };
