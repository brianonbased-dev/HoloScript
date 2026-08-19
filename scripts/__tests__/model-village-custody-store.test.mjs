/* global Buffer, process */

/**
 * Offline node --test suite for the MV-B1 sealed custody store
 * (scripts/model-village-custody-store.mjs). No network, no providers, no
 * git — scratch stores live under node:os tmpdir and are removed after each
 * test.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CUSTODY_ACCESS_LOG_ENTRY_SCHEMA,
  CUSTODY_ACCESS_LOG_GENESIS,
  CUSTODY_STORE_CLAIM_BOUNDARY,
  CUSTODY_TOMBSTONE_SCHEMA,
  CustodyDuplicateObjectError,
  CustodyIntegrityError,
  CustodyKeyDestroyedError,
  CustodyLockError,
  CustodyValidationError,
  SEALED_CUSTODY_STORE_SCHEMA,
  createSealedCustodyStore,
  openSealedCustodyStore,
} from '../model-village-custody-store.mjs';
import {
  canonicalDigest,
  canonicalJson,
} from '../model-village-phase0b-runtime.mjs';

const RETENTION_POLICY = Object.freeze({
  description:
    'Engineering certification drill retention policy; frozen before any '
    + 'live run per the sealed-store spec requirement.',
  frozenAt: '2026-07-26T00:00:00.000Z',
  policyId: 'mv-b1-drill-retention-v1',
});

function makeScratchDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mv-custody-'));
  t.after(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  return dir;
}

function makeStore(t, overrides = {}) {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'store');
  const store = createSealedCustodyStore({
    operator: 'operator-drill-01',
    retentionPolicy: RETENTION_POLICY,
    rootDir,
    runLabel: 'mv-b1-custody-drill',
    ...overrides,
  });
  return { rootDir, store };
}

function readAccessLogEntries(rootDir) {
  return readFileSync(path.join(rootDir, 'access-log.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

test('seal/read roundtrip is byte-exact for raw bytes and canonical values', (t) => {
  const { store } = makeStore(t);
  const payload = randomBytes(257);
  const sealed = store.sealObject({
    bytes: payload,
    kind: 'raw-model-response',
    label: 'drill-response-01',
  });
  assert.match(sealed.custodyId, /^[a-f0-9]{64}$/);
  assert.equal(sealed.byteLength, 257);
  const read = store.readObject(sealed.custodyId);
  assert.ok(read.bytes.equals(payload), 'plaintext bytes must roundtrip exactly');
  assert.equal(read.kind, 'raw-model-response');
  assert.equal(read.label, 'drill-response-01');

  const valueSealed = store.sealObject({
    kind: 'structured-fixture',
    label: 'drill-value-01',
    value: { alpha: 1, nested: { deep: true } },
  });
  const valueRead = store.readObject(valueSealed.custodyId);
  assert.equal(
    valueRead.bytes.toString('utf8'),
    '{"alpha":1,"nested":{"deep":true}}',
  );
  const verification = store.verifyIntegrity();
  assert.equal(verification.ok, true);
  assert.equal(verification.mode, 'plaintext-decrypt');
  assert.equal(
    verification.claimBoundary.liveStudyRunClaimed,
    false,
    'claim boundary must ride every verification result',
  );
});

test('sealObject(value) custodyId is key-order independent and duplicate-guarded', (t) => {
  const { store } = makeStore(t);
  const first = store.sealObject({
    kind: 'structured-fixture',
    label: 'order-a',
    value: { b: 2, a: 1 },
  });
  assert.equal(
    first.custodyId,
    canonicalDigest({ a: 1, b: 2 }),
    'custodyId must equal the canonical digest of the value',
  );
  let duplicate = null;
  try {
    store.sealObject({
      kind: 'structured-fixture',
      label: 'order-b',
      value: { a: 1, b: 2 },
    });
  } catch (error) {
    duplicate = error;
  }
  assert.ok(duplicate instanceof CustodyDuplicateObjectError);
  assert.equal(
    duplicate.custodyId,
    first.custodyId,
    'reordered keys must address the identical sealed object',
  );
});

test('access-log chain tamper fails verifyIntegrity', (t) => {
  const { rootDir, store } = makeStore(t);
  store.sealObject({
    bytes: Buffer.from('tamper-target', 'utf8'),
    kind: 'raw-model-response',
    label: 'drill-tamper-01',
  });
  const logPath = path.join(rootDir, 'access-log.jsonl');
  const lines = readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
  assert.ok(lines.length >= 2, 'expected create + seal entries');
  const tampered = JSON.parse(lines[1]);
  tampered.operator = 'tampered-operator';
  lines[1] = JSON.stringify(tampered);
  writeFileSync(logPath, `${lines.join('\n')}\n`);
  const verification = store.verifyIntegrity();
  assert.equal(verification.ok, false);
  const chainCheck = verification.checks.find(
    (check) => check.name === 'access-log-chain',
  );
  assert.equal(chainCheck.ok, false);
  assert.match(chainCheck.detail, /entryHash|chain/i);
  // Release the exclusive handle lock so the reopen attempt reaches the
  // chain validation (and still fails loud there).
  store.close();
  assert.throws(
    () => openSealedCustodyStore({ operator: 'operator-two', rootDir }),
    CustodyIntegrityError,
    'reopen over a tampered chain must fail loud',
  );
});

test('ciphertext tamper makes readObject throw and verifyIntegrity fail', (t) => {
  const { rootDir, store } = makeStore(t);
  const sealed = store.sealObject({
    bytes: Buffer.from('ciphertext-tamper-target', 'utf8'),
    kind: 'raw-model-response',
    label: 'drill-tamper-02',
  });
  const objectPath = path.join(rootDir, 'objects', `${sealed.custodyId}.enc`);
  const fileBytes = Buffer.from(readFileSync(objectPath));
  fileBytes[fileBytes.length - 1] ^= 0xff;
  writeFileSync(objectPath, fileBytes);
  assert.throws(
    () => store.readObject(sealed.custodyId),
    CustodyIntegrityError,
  );
  const verification = store.verifyIntegrity();
  assert.equal(verification.ok, false);
  const objectsCheck = verification.checks.find(
    (check) => check.name === 'objects-content',
  );
  assert.equal(objectsCheck.ok, false);
});

test('key destruction: tombstone appended, reads blocked, checksum-mode verify ok', (t) => {
  const { rootDir, store } = makeStore(t);
  const sealed = store.sealObject({
    bytes: Buffer.from('to-be-deleted-by-key-destruction', 'utf8'),
    kind: 'raw-model-response',
    label: 'drill-delete-01',
  });
  const tombstone = store.destroyContentKey({
    reason: 'retention window elapsed (engineering drill)',
  });
  assert.equal(tombstone.schema, CUSTODY_TOMBSTONE_SCHEMA);
  assert.equal(tombstone.scope, 'all-objects');
  assert.deepEqual(
    Object.keys(tombstone).sort(),
    ['at', 'keyFingerprint', 'reason', 'schema', 'scope'],
    'tombstone must be nonidentifying: no labels, kinds, or custodyIds',
  );
  assert.equal(
    existsSync(path.join(rootDir, 'key', 'content-key.bin')),
    false,
    'key file must be unlinked after zero-overwrite',
  );
  const tombstoneLines = readFileSync(
    path.join(rootDir, 'tombstones.jsonl'),
    'utf8',
  )
    .split('\n')
    .filter((line) => line.length > 0);
  assert.equal(tombstoneLines.length, 1);
  assert.throws(
    () => store.readObject(sealed.custodyId),
    CustodyKeyDestroyedError,
  );
  assert.throws(
    () => store.sealObject({
      bytes: Buffer.from('late', 'utf8'),
      kind: 'raw-model-response',
      label: 'too-late',
    }),
    CustodyKeyDestroyedError,
  );
  const verification = store.verifyIntegrity();
  assert.equal(verification.mode, 'ciphertext-checksum-only');
  assert.equal(
    verification.ok,
    true,
    'intact chains must still verify after key destruction',
  );

  store.close();
  const reopened = openSealedCustodyStore({
    operator: 'operator-after-destruction',
    rootDir,
  });
  assert.throws(
    () => reopened.readObject(sealed.custodyId),
    CustodyKeyDestroyedError,
    'reopened destroyed store must stay read-blocked',
  );
  const reopenedVerification = reopened.verifyIntegrity();
  assert.equal(reopenedVerification.mode, 'ciphertext-checksum-only');
  assert.equal(reopenedVerification.ok, true);
  const listing = reopened.listObjects();
  assert.equal(listing.length, 1);
  assert.equal(listing[0].metadataAvailable, false);
});

test('backup roundtrip verifies, excludes key custody, and detects tamper', (t) => {
  const { store } = makeStore(t);
  store.sealObject({
    bytes: Buffer.from('backup-object-one', 'utf8'),
    kind: 'raw-model-response',
    label: 'drill-backup-01',
  });
  const second = store.sealObject({
    bytes: Buffer.from('backup-object-two', 'utf8'),
    kind: 'raw-model-response',
    label: 'drill-backup-02',
  });
  const backup = store.createBackup();
  assert.equal(backup.ok, true);
  assert.equal(
    existsSync(path.join(backup.backupDir, 'key')),
    false,
    'backup must not widen key custody',
  );
  const firstVerify = store.verifyBackup();
  assert.equal(firstVerify.ok, true);
  const fullVerify = store.verifyIntegrity();
  assert.equal(fullVerify.ok, true);
  const backupCheck = fullVerify.checks.find(
    (check) => check.name === 'backup-checksums',
  );
  assert.equal(backupCheck.ok, true);

  const backedUpObject = path.join(
    backup.backupDir,
    'objects',
    `${second.custodyId}.enc`,
  );
  const bytes = Buffer.from(readFileSync(backedUpObject));
  bytes[bytes.length - 1] ^= 0x01;
  writeFileSync(backedUpObject, bytes);
  const tamperedVerify = store.verifyBackup();
  assert.equal(tamperedVerify.ok, false);
  const fileCheck = tamperedVerify.checks.find(
    (check) => check.name === 'backup-file-checksums',
  );
  assert.equal(fileCheck.ok, false);
  assert.match(fileCheck.detail, /sha256 mismatch/);
});

test('missing or empty operator is rejected everywhere', (t) => {
  const scratch = makeScratchDir(t);
  assert.throws(
    () => createSealedCustodyStore({
      operator: '',
      retentionPolicy: RETENTION_POLICY,
      rootDir: path.join(scratch, 'store-a'),
      runLabel: 'mv-b1-custody-drill',
    }),
    CustodyValidationError,
  );
  assert.throws(
    () => createSealedCustodyStore({
      retentionPolicy: RETENTION_POLICY,
      rootDir: path.join(scratch, 'store-b'),
      runLabel: 'mv-b1-custody-drill',
    }),
    CustodyValidationError,
  );
  const { rootDir } = makeStore(t);
  assert.throws(
    () => openSealedCustodyStore({ rootDir }),
    CustodyValidationError,
  );
  assert.throws(
    () => openSealedCustodyStore({ operator: '', rootDir }),
    CustodyValidationError,
  );
});

test('createSealedCustodyStore refuses a non-empty rootDir', (t) => {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'occupied');
  mkdirSync(rootDir, { recursive: true });
  writeFileSync(path.join(rootDir, 'stray.txt'), 'occupied');
  assert.throws(
    () => createSealedCustodyStore({
      operator: 'operator-drill-01',
      retentionPolicy: RETENTION_POLICY,
      rootDir,
      runLabel: 'mv-b1-custody-drill',
    }),
    /not empty/,
  );
});

test('reopen preserves the chain, appends an open entry, and keeps sequence monotonic', (t) => {
  const { rootDir, store } = makeStore(t);
  const sealed = store.sealObject({
    bytes: Buffer.from('reopen-roundtrip', 'utf8'),
    kind: 'raw-model-response',
    label: 'drill-reopen-01',
  });
  store.close();
  const reopened = openSealedCustodyStore({
    operator: 'operator-two',
    rootDir,
  });
  const manifest = reopened.getManifest();
  assert.equal(manifest.schema, SEALED_CUSTODY_STORE_SCHEMA);
  assert.equal(
    manifest.operator,
    'operator-drill-01',
    'manifest records the creating operator',
  );
  const read = reopened.readObject(sealed.custodyId);
  assert.equal(read.bytes.toString('utf8'), 'reopen-roundtrip');

  const entries = readAccessLogEntries(rootDir);
  assert.deepEqual(
    entries.map((entry) => entry.operation),
    ['create', 'seal', 'open', 'read'],
  );
  assert.deepEqual(
    entries.map((entry) => entry.sequence),
    [1, 2, 3, 4],
  );
  assert.equal(entries[0].prevEntryHash, CUSTODY_ACCESS_LOG_GENESIS);
  for (const entry of entries) {
    assert.equal(entry.schema, CUSTODY_ACCESS_LOG_ENTRY_SCHEMA);
  }
  for (let index = 1; index < entries.length; index += 1) {
    assert.equal(
      entries[index].prevEntryHash,
      entries[index - 1].entryHash,
      'each entry must chain from its predecessor',
    );
  }
  assert.equal(entries[2].operator, 'operator-two');
  const verification = reopened.verifyIntegrity();
  assert.equal(verification.ok, true);
});

test('a second live handle is refused; close() releases the exclusive lock', (t) => {
  const { rootDir, store } = makeStore(t);
  // Two live handles would share one in-memory chain tail and write
  // duplicate sequence numbers — the historical no-recovery corruption.
  assert.throws(
    () => openSealedCustodyStore({ operator: 'operator-two', rootDir }),
    CustodyLockError,
    'a concurrent second handle must be refused while the first is live',
  );
  store.sealObject({
    bytes: Buffer.from('written-under-lock', 'utf8'),
    kind: 'raw-model-response',
    label: 'drill-lock-01',
  });
  store.close();
  store.close(); // idempotent
  assert.throws(
    () => store.sealObject({
      bytes: Buffer.from('after-close', 'utf8'),
      kind: 'raw-model-response',
      label: 'drill-lock-refused',
    }),
    CustodyValidationError,
    'a closed handle must refuse operations',
  );
  assert.equal(
    existsSync(path.join(rootDir, 'store.lock')),
    false,
    'close() must release the lock file',
  );
  const reopened = openSealedCustodyStore({ operator: 'operator-two', rootDir });
  const sealed = reopened.sealObject({
    bytes: Buffer.from('post-reopen-append', 'utf8'),
    kind: 'raw-model-response',
    label: 'drill-lock-02',
  });
  assert.match(sealed.custodyId, /^[a-f0-9]{64}$/);
  const verification = reopened.verifyIntegrity();
  assert.equal(verification.ok, true, 'sequenced handoff keeps the chain valid');
  reopened.close();
});

test('a moved on-disk tail refuses the append instead of forking the chain', (t) => {
  const { rootDir, store } = makeStore(t);
  store.sealObject({
    bytes: Buffer.from('fork-fence-target', 'utf8'),
    kind: 'raw-model-response',
    label: 'drill-fork-01',
  });
  const logPath = path.join(rootDir, 'access-log.jsonl');
  const lines = readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
  // Simulate a foreign writer appending behind this handle's back.
  writeFileSync(logPath, `${[...lines, lines[lines.length - 1]].join('\n')}\n`);
  const logAfterForeignAppend = readFileSync(logPath, 'utf8');
  assert.throws(
    () => store.sealObject({
      bytes: Buffer.from('would-fork-the-chain', 'utf8'),
      kind: 'raw-model-response',
      label: 'drill-fork-02',
    }),
    CustodyIntegrityError,
    'a stale handle must fail loud on its own write',
  );
  assert.equal(
    readFileSync(logPath, 'utf8'),
    logAfterForeignAppend,
    'the refused append must not extend the log',
  );
});

/**
 * Reseal an access-log chain so every prevEntryHash links from genesis and every
 * entryHash recomputes — WITHOUT renumbering `sequence`. This is what a
 * competent tamperer does after removing a line: repair the hashes so the chain
 * is internally consistent again. Only the monotonic-sequence check can see
 * through it.
 */
function resealAccessLog(entries) {
  let prevHash = CUSTODY_ACCESS_LOG_GENESIS;
  return entries.map((entry) => {
    const { entryHash, ...unsigned } = entry;
    void entryHash;
    const rechained = { ...unsigned, prevEntryHash: prevHash };
    const resealedHash = canonicalDigest(rechained);
    prevHash = resealedHash;
    return { ...rechained, entryHash: resealedHash };
  });
}

function writeAccessLogEntries(rootDir, entries) {
  writeFileSync(
    path.join(rootDir, 'access-log.jsonl'),
    `${entries.map((entry) => canonicalJson(entry)).join('\n')}\n`,
  );
}

/**
 * The custody store's sequence-monotonicity guard is a SEPARATE defense from the
 * hash chain, and it is the only one that survives a competent reseal. Without
 * this test the guard could be deleted outright and the whole 15-suite Model
 * Village chain would still exit 0 — a silently erased custody access record
 * would pass every gate. (The twin guard in model-village-trust-registry.mjs has
 * had its own test since day one; this module's copy did not.)
 */
test('access-log sequence monotonicity survives a fully resealed chain', (t) => {
  const { rootDir, store } = makeStore(t);
  const sealed = store.sealObject({
    bytes: Buffer.from('monotonicity-target', 'utf8'),
    kind: 'raw-model-response',
    label: 'drill-monotonic-01',
  });
  // create, seal, read, list, read — a middle READ entry can be removed without
  // disturbing the objects-vs-seal-log cross reference, which isolates this test
  // to the sequence guard alone.
  store.readObject(sealed.custodyId);
  store.listObjects();
  store.readObject(sealed.custodyId);

  store.close();

  const entries = readAccessLogEntries(rootDir);
  assert.deepEqual(
    entries.map((entry) => entry.operation),
    ['create', 'seal', 'read', 'list', 'read'],
  );

  // Control: resealing WITHOUT dropping anything must leave a store that still
  // opens and verifies. If this fails, the helper below is not a faithful
  // reseal and the negative case would prove nothing.
  writeAccessLogEntries(rootDir, resealAccessLog(entries));
  const reopened = openSealedCustodyStore({ operator: 'operator-two', rootDir });
  assert.equal(
    reopened.verifyIntegrity().ok,
    true,
    'the reseal helper must reproduce a valid chain, or the tamper case is unsound',
  );
  reopened.close();

  // Erase a middle read and reseal every remaining hash.
  const live = readAccessLogEntries(rootDir);
  const dropIndex = live.findIndex(
    (entry, index) => index > 0 && index < live.length - 1 && entry.operation === 'read',
  );
  assert.ok(dropIndex > 0, 'expected a middle read entry to erase');
  const dropped = resealAccessLog(live.filter((_, index) => index !== dropIndex));

  // The tampered log is hash-perfect: genesis link, forward chain, and every
  // entryHash recompute all hold. Sequence numbering is the ONLY residue.
  assert.equal(dropped[0].prevEntryHash, CUSTODY_ACCESS_LOG_GENESIS);
  for (let index = 1; index < dropped.length; index += 1) {
    assert.equal(dropped[index].prevEntryHash, dropped[index - 1].entryHash);
  }
  for (const entry of dropped) {
    const { entryHash, ...unsigned } = entry;
    assert.equal(canonicalDigest(unsigned), entryHash);
  }
  const expectedSequences = live
    .filter((_, index) => index !== dropIndex)
    .map((entry) => entry.sequence);
  assert.deepEqual(
    dropped.map((entry) => entry.sequence),
    expectedSequences,
    'the removed entry must leave a hole in the sequence and nothing else',
  );
  assert.equal(
    dropped[dropIndex].sequence - dropped[dropIndex - 1].sequence,
    2,
    'the hole must be exactly one erased entry',
  );

  writeAccessLogEntries(rootDir, dropped);
  assert.throws(
    () => openSealedCustodyStore({ operator: 'operator-three', rootDir }),
    (error) => error instanceof CustodyIntegrityError
      && /breaks monotonic order/.test(error.message),
    'an erased access-log entry must be rejected by the sequence guard — the '
    + 'hash chain alone cannot see it',
  );
});

test(
  'content key file and key/ directory are owner-only on POSIX hosts',
  { skip: process.platform === 'win32' },
  (t) => {
    const { rootDir, store } = makeStore(t);
    const keyMode = statSync(
      path.join(rootDir, 'key', 'content-key.bin'),
    ).mode & 0o777;
    assert.equal(
      keyMode & 0o077,
      0,
      `key file mode 0${keyMode.toString(8)} must not be group/world accessible`,
    );
    const dirMode = statSync(path.join(rootDir, 'key')).mode & 0o777;
    assert.equal(
      dirMode & 0o077,
      0,
      `key directory mode 0${dirMode.toString(8)} must be owner-only`,
    );
    const verification = store.verifyIntegrity();
    const keyCheck = verification.checks.find(
      (check) => check.name === 'key-custody',
    );
    assert.equal(keyCheck.ok, true);
  },
);

test('claim boundary pins every never-claim flag false', () => {
  assert.equal(CUSTODY_STORE_CLAIM_BOUNDARY.liveStudyRunClaimed, false);
  assert.equal(CUSTODY_STORE_CLAIM_BOUNDARY.phase1AdmissionClaimed, false);
  assert.equal(CUSTODY_STORE_CLAIM_BOUNDARY.phase1ReadinessClaimed, false);
  assert.equal(CUSTODY_STORE_CLAIM_BOUNDARY.sixResidentLiveTurnsClaimed, false);
  assert.equal(
    CUSTODY_STORE_CLAIM_BOUNDARY.blindedAliasAssignmentClaimed,
    false,
  );
  assert.equal(
    CUSTODY_STORE_CLAIM_BOUNDARY.sealedAdapterAliasRouteAssignmentIncluded,
    false,
    'adapter_a/b/c alias-to-route assignment is out of scope for this lane',
  );
  assert.equal(
    CUSTODY_STORE_CLAIM_BOUNDARY.productionValidatorCustodyClaimed,
    false,
  );
  assert.equal(
    CUSTODY_STORE_CLAIM_BOUNDARY.processCrashDurabilityClaimed,
    false,
  );
  assert.equal(
    CUSTODY_STORE_CLAIM_BOUNDARY.temperatureZeroDeterminismClaimed,
    false,
    'temperature zero is not a determinism receipt (spec determinism boundary)',
  );
  assert.ok(Object.isFrozen(CUSTODY_STORE_CLAIM_BOUNDARY));
});

// ---------------------------------------------------------------------------
// MV-B5 gap G1 regression: destroyContentKey is crash-atomic.
//
// destroyContentKey appends the nonidentifying tombstone FIRST — that append is
// the durable commit record — so the reachable crash windows all leave a
// tombstone on disk with the key file in one of two states. Each is
// reconstructed directly here (a real SIGKILL cannot split those sub-syscall
// windows; the MV-B5 crash drill covers the process-level proof).
// ---------------------------------------------------------------------------

/**
 * Builds a store, seals one object, runs the real destroy, and hands back the
 * pre-destroy key bytes so a caller can put the key file back into whatever
 * intermediate state an interrupted destroy would have left.
 */
function destroyedStoreWithKeyBytes(t) {
  const { rootDir, store } = makeStore(t);
  const sealed = store.sealObject({
    bytes: Buffer.from('g1-crash-atomicity-object', 'utf8'),
    kind: 'raw-model-response',
    label: 'g1-drill-object',
  });
  const keyPath = path.join(rootDir, 'key', 'content-key.bin');
  const keyBytes = Buffer.from(readFileSync(keyPath));
  store.destroyContentKey({ reason: 'G1 crash-atomicity regression drill' });
  store.close();
  return { keyBytes, keyPath, rootDir, sealed };
}

function assertOpensIntoDestroyedState(rootDir, keyPath, sealed, label) {
  const reopened = openSealedCustodyStore({
    operator: 'operator-drill-01',
    rootDir,
  });
  assert.equal(
    existsSync(keyPath),
    false,
    `${label}: open must roll the committed destruction FORWARD and remove the key file`,
  );
  assert.throws(
    () => reopened.readObject(sealed.custodyId),
    CustodyKeyDestroyedError,
    `${label}: the key must never be resurrected by recovery`,
  );
  const verification = reopened.verifyIntegrity();
  assert.equal(verification.mode, 'ciphertext-checksum-only', label);
  assert.equal(verification.ok, true, label);
  reopened.close();
}

test('G1: a destroy crashed after the tombstone commit but before the key scrub recovers', (t) => {
  const { keyBytes, keyPath, rootDir, sealed } = destroyedStoreWithKeyBytes(t);
  // Crash window 1: tombstone committed, key file completely untouched.
  writeFileSync(keyPath, keyBytes, { mode: 0o600 });
  assertOpensIntoDestroyedState(rootDir, keyPath, sealed, 'intact-key window');
});

test('G1: a destroy crashed after the key was zeroed but before the unlink recovers', (t) => {
  const { keyPath, rootDir, sealed } = destroyedStoreWithKeyBytes(t);
  // Crash window 2: tombstone committed, key zeroed by the scrub, not unlinked.
  writeFileSync(keyPath, Buffer.alloc(32), { mode: 0o600 });
  assertOpensIntoDestroyedState(rootDir, keyPath, sealed, 'zeroed-key window');
});

test('G1 fix did NOT weaken the fingerprint check for an intact untombstoned key', (t) => {
  const { rootDir, store } = makeStore(t);
  store.sealObject({
    bytes: Buffer.from('fingerprint-guard-object', 'utf8'),
    kind: 'raw-model-response',
    label: 'fingerprint-guard',
  });
  store.close();
  const keyPath = path.join(rootDir, 'key', 'content-key.bin');
  assert.equal(
    existsSync(path.join(rootDir, 'tombstones.jsonl')),
    false,
    'precondition: no tombstone on record',
  );

  // A wrong-but-well-formed key still fails closed.
  writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
  assert.throws(
    () => openSealedCustodyStore({ operator: 'operator-drill-01', rootDir }),
    (error) => error instanceof CustodyIntegrityError
      && /does not match the manifest keyFingerprint/.test(error.message),
    'an intact key that disagrees with the manifest must still be rejected',
  );

  // A ZEROED key with no tombstone is not a destruction — nothing committed it.
  writeFileSync(keyPath, Buffer.alloc(32), { mode: 0o600 });
  assert.throws(
    () => openSealedCustodyStore({ operator: 'operator-drill-01', rootDir }),
    CustodyIntegrityError,
    'a zeroed key with no tombstone must not be accepted as a destroyed state',
  );
});

test('G1: key bytes under a tombstone that are neither the key nor the zero residue fail closed', (t) => {
  const { keyPath, rootDir } = destroyedStoreWithKeyBytes(t);
  writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
  assert.throws(
    () => openSealedCustodyStore({ operator: 'operator-drill-01', rootDir }),
    (error) => error instanceof CustodyIntegrityError
      && /refusing to open a tampered key file/.test(error.message),
    'roll-forward accepts only the two states destroyContentKey itself leaves',
  );
});

test('G1: the tombstone stays nonidentifying (no kind, label, or plaintext)', (t) => {
  const { rootDir, store } = makeStore(t);
  const plaintext = 'g1-blinding-sensitive-plaintext';
  store.sealObject({
    bytes: Buffer.from(plaintext, 'utf8'),
    kind: 'raw-model-response',
    label: 'g1-blinding-secret-label',
  });
  store.destroyContentKey({ reason: 'G1 blinding regression drill' });
  store.close();
  const raw = readFileSync(path.join(rootDir, 'tombstones.jsonl'), 'utf8');
  const lines = raw.split('\n').filter((line) => line.length > 0);
  assert.equal(lines.length, 1);
  assert.deepEqual(
    Object.keys(JSON.parse(lines[0])).sort(),
    ['at', 'keyFingerprint', 'reason', 'schema', 'scope'],
  );
  for (const forbidden of [
    plaintext,
    'g1-blinding-secret-label',
    'raw-model-response',
    'label',
    'kind',
  ]) {
    assert.equal(
      raw.includes(forbidden),
      false,
      `tombstone must not carry '${forbidden}' (MV-B3 blinding depends on this)`,
    );
  }
});

// ---------------------------------------------------------------------------
// MV-B5 gap G1, review round 2. The commit record is the HASH-CHAINED
// 'destroy-key' access-log entry, not the unauthenticated tombstone line.
// These pin the three properties the review demanded:
//   (a) a stray/forged/foreign tombstone must NOT destroy a healthy store,
//   (b) the keyFingerprint check must stay STRONGER, never weaker,
//   (c) the ordering (commit durable before the first key byte) is provable.
// ---------------------------------------------------------------------------

/** Writes a syntactically valid tombstone line with NO chain entry behind it. */
function writeUncorroboratedTombstone(rootDir, { keyFingerprint } = {}) {
  const manifest = JSON.parse(
    readFileSync(path.join(rootDir, 'store-manifest.json'), 'utf8'),
  );
  const tombstone = {
    at: '2026-07-27T00:00:00.000Z',
    keyFingerprint: keyFingerprint ?? manifest.keyFingerprint,
    reason: 'stray line: partial restore, retried tool, or forgery',
    schema: CUSTODY_TOMBSTONE_SCHEMA,
    scope: 'all-objects',
  };
  writeFileSync(
    path.join(rootDir, 'tombstones.jsonl'),
    `${canonicalJson(tombstone)}\n`,
    'utf8',
  );
  return tombstone;
}

test('G1: a tombstone with no corroborating chain entry must NOT destroy a healthy store', (t) => {
  const { rootDir, store } = makeStore(t);
  const sealed = store.sealObject({
    bytes: Buffer.from('healthy-store-plaintext', 'utf8'),
    kind: 'raw-model-response',
    label: 'uncorroborated-tombstone-guard',
  });
  store.close();
  const keyPath = path.join(rootDir, 'key', 'content-key.bin');
  const keyBefore = readFileSync(keyPath);

  writeUncorroboratedTombstone(rootDir);
  assert.throws(
    () => openSealedCustodyStore({ operator: 'operator-drill-01', rootDir }),
    (error) => error instanceof CustodyIntegrityError
      && /no .?destroy-key.? entry/.test(error.message),
    'one appended line must not be accepted as a commit record',
  );
  // The refusal is NON-DESTRUCTIVE: the live key is untouched, so removing the
  // stray line fully recovers. Destruction stays irreversible; a refusal is not
  // a destruction.
  assert.equal(existsSync(keyPath), true, 'the live key file survives the refusal');
  assert.deepEqual(readFileSync(keyPath), keyBefore, 'the key bytes are untouched');
  rmSync(path.join(rootDir, 'tombstones.jsonl'), { force: true });
  const reopened = openSealedCustodyStore({ operator: 'operator-drill-01', rootDir });
  assert.equal(
    reopened.readObject(sealed.custodyId).bytes.toString('utf8'),
    'healthy-store-plaintext',
    'the store is fully usable again once the stray line is removed',
  );
  reopened.close();
});

test('G1: a tombstone naming a FOREIGN keyFingerprint is rejected, not honoured', (t) => {
  const { rootDir, store } = makeStore(t);
  store.sealObject({
    bytes: Buffer.from('foreign-fingerprint-guard', 'utf8'),
    kind: 'raw-model-response',
    label: 'foreign-fingerprint',
  });
  store.destroyContentKey({ reason: 'real destruction, really committed' });
  store.close();
  // Replace the real tombstone with one naming a DIFFERENT store's key.
  writeUncorroboratedTombstone(rootDir, {
    keyFingerprint: canonicalDigest('some-other-store-key'),
  });
  assert.throws(
    () => openSealedCustodyStore({ operator: 'operator-drill-01', rootDir }),
    (error) => error instanceof CustodyIntegrityError
      && /does not match the manifest keyFingerprint/.test(error.message),
    'a tombstone must be BOUND to this store, not merely well-formed',
  );
});

test('G1: a crash between the commit entry and the tombstone append re-emits the tombstone', (t) => {
  const { rootDir, store } = makeStore(t);
  const sealed = store.sealObject({
    bytes: Buffer.from('commit-before-tombstone', 'utf8'),
    kind: 'raw-model-response',
    label: 'commit-window',
  });
  const tombstone = store.destroyContentKey({ reason: 'G1 commit-window drill' });
  store.close();
  // The exact state a crash between step 1 and step 2 leaves.
  rmSync(path.join(rootDir, 'tombstones.jsonl'), { force: true });

  const reopened = openSealedCustodyStore({ operator: 'operator-drill-01', rootDir });
  const lines = readFileSync(path.join(rootDir, 'tombstones.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
  assert.equal(lines.length, 1, 'exactly one tombstone is re-emitted');
  assert.deepEqual(
    JSON.parse(lines[0]),
    { ...tombstone },
    'the tombstone is re-emitted VERBATIM from the committed chain entry',
  );
  assert.throws(
    () => reopened.readObject(sealed.custodyId),
    CustodyKeyDestroyedError,
    'the destruction still rolls forward, never backward',
  );
  reopened.close();
});

test('G1: a torn tombstone tail is repaired, while a torn ACCESS-LOG tail still fails closed', (t) => {
  const { rootDir, store } = makeStore(t);
  const sealed = store.sealObject({
    bytes: Buffer.from('torn-tombstone-tail', 'utf8'),
    kind: 'raw-model-response',
    label: 'torn-tombstone',
  });
  store.destroyContentKey({ reason: 'G1 torn-tombstone drill' });
  store.close();
  const tombstonesPath = path.join(rootDir, 'tombstones.jsonl');
  const written = readFileSync(tombstonesPath, 'utf8');
  // An append torn mid-write: no terminating newline, unparseable.
  writeFileSync(tombstonesPath, written.slice(0, 60), 'utf8');

  const reopened = openSealedCustodyStore({ operator: 'operator-drill-01', rootDir });
  const lines = readFileSync(tombstonesPath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
  assert.equal(lines.length, 1, 'the torn fragment is dropped and one line re-emitted');
  assert.doesNotThrow(() => JSON.parse(lines[0]), 'the surviving line parses');
  assert.throws(
    () => reopened.readObject(sealed.custodyId),
    CustodyKeyDestroyedError,
  );
  assert.equal(reopened.verifyIntegrity().ok, true);
  reopened.close();

  // The AUTHENTICATED log keeps the opposite, fail-closed behaviour.
  const logPath = path.join(rootDir, 'access-log.jsonl');
  writeFileSync(
    logPath,
    `${readFileSync(logPath, 'utf8')}{"at":"2026-07-27T00:00`,
    'utf8',
  );
  assert.throws(
    () => openSealedCustodyStore({ operator: 'operator-drill-01', rootDir }),
    CustodyIntegrityError,
    'a torn access-log tail must NOT be auto-repaired',
  );
});

test('G1 ORDERING: the commit record is durable before the first key byte is touched', (t) => {
  const { rootDir, store } = makeStore(t);
  store.sealObject({
    bytes: Buffer.from('ordering-proof-object', 'utf8'),
    kind: 'raw-model-response',
    label: 'ordering-proof',
  });
  const keyPath = path.join(rootDir, 'key', 'content-key.bin');
  const keyBefore = readFileSync(keyPath);
  // Make the key file unwritable so the production scrub throws at exactly the
  // ordering boundary. On a host that ignores the mode bits (POSIX root) the
  // destroy completes instead; the roll-forward assertions below hold either
  // way, and the discriminating assertions run only when the fault took effect.
  chmodSync(keyPath, 0o444);
  let interrupted = false;
  try {
    store.destroyContentKey({ reason: 'G1 ordering drill' });
  } catch {
    interrupted = true;
  }
  if (existsSync(keyPath)) chmodSync(keyPath, 0o600);
  if (interrupted) {
    // Commit-FIRST: the chain entry and the tombstone are already durable and
    // the key file is untouched. A scrub-first ordering commits NOTHING here,
    // so these three assertions are what go red on an ordering regression.
    const entries = readAccessLogEntries(rootDir);
    assert.ok(
      entries.some((entry) => entry.operation === 'destroy-key'),
      'the destroy-key commit entry is durable even though the scrub failed',
    );
    assert.deepEqual(
      readFileSync(keyPath),
      keyBefore,
      'not one key byte was touched before the commit landed',
    );
    assert.ok(
      readFileSync(path.join(rootDir, 'tombstones.jsonl'), 'utf8').trim().length > 0,
      'the tombstone followed the commit',
    );
  }
  store.close();
  // Either way, recovery must roll the committed destruction FORWARD.
  const reopened = openSealedCustodyStore({ operator: 'operator-drill-01', rootDir });
  assert.equal(existsSync(keyPath), false, 'open completed the interrupted scrub');
  const verification = reopened.verifyIntegrity();
  assert.equal(verification.mode, 'ciphertext-checksum-only');
  assert.equal(verification.ok, true);
  reopened.close();
});

// ---------------------------------------------------------------------------
// MV-B5 gap G2 applied to the CUSTODY lock (the review's third minor finding):
// the store lock used the same path-bound break, so contenders that each proved
// the recorded pid dead all unlinked and retried, producing TWO concurrent
// handles on a store whose entire lock rationale is that a second handle forks
// the append-only chain. Real processes, not a simulation.
// ---------------------------------------------------------------------------

test('G2/custody: real processes racing a STALE store.lock yield exactly one handle', async (t) => {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'store');
  createSealedCustodyStore({
    operator: 'operator-drill-01',
    retentionPolicy: RETENTION_POLICY,
    rootDir,
    runLabel: 'mv-b1-custody-drill',
  }).close();

  // A pid that has certainly exited.
  const corpse = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  const deadPid = corpse.pid;
  await new Promise((resolve) => corpse.on('exit', resolve));

  const moduleUrl = pathToFileURL(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'model-village-custody-store.mjs'),
  ).href;
  const barrier = path.join(scratch, 'barrier');
  const results = path.join(scratch, 'results.jsonl');
  const source = [
    `const m = await import(${JSON.stringify(moduleUrl)});`,
    "const fs = await import('node:fs');",
    `const barrier = ${JSON.stringify(barrier)};`,
    `const results = ${JSON.stringify(results)};`,
    'const deadline = Date.now() + 20000;',
    'while (!fs.existsSync(barrier) && Date.now() < deadline) { /* spin */ }',
    'let row;',
    'try {',
    `  const s = m.openSealedCustodyStore({ rootDir: ${JSON.stringify(rootDir)}, operator: 'racer' });`,
    '  const until = Date.now() + 40; while (Date.now() < until) { /* hold */ }',
    '  s.close();',
    '  row = { pid: process.pid, won: true };',
    '} catch (error) { row = { pid: process.pid, won: false, name: error.name }; }',
    'fs.appendFileSync(results, JSON.stringify(row) + String.fromCharCode(10));',
  ].join('\n');

  for (let trial = 0; trial < 4; trial += 1) {
    writeFileSync(results, '', 'utf8');
    rmSync(barrier, { force: true });
    writeFileSync(
      path.join(rootDir, 'store.lock'),
      canonicalJson({
        acquiredAt: '2026-07-27T00:00:00.000Z',
        operator: 'ghost',
        pid: deadPid,
      }),
      'utf8',
    );
    const kids = [];
    for (let index = 0; index < 6; index += 1) {
      kids.push(spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: 'ignore' }));
    }
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    writeFileSync(barrier, 'go', 'utf8');
    await Promise.all(kids.map((kid) => new Promise((resolve) => kid.on('exit', resolve))));
    const rows = readFileSync(results, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
    const winners = rows.filter((row) => row.won);
    assert.equal(
      winners.length,
      1,
      `trial ${trial}: exactly one handle may win a stale-lock race, got `
      + `${winners.length} (${JSON.stringify(rows)})`,
    );
    assert.equal(
      existsSync(path.join(rootDir, 'store.lock')),
      false,
      `trial ${trial}: the winner released the lock on close()`,
    );
  }
});
