/* global Buffer */

/**
 * Offline node --test suite for the MV-B5 read-only audit-open primitive
 * (scripts/model-village-audit-open.mjs). No network, no providers, no git —
 * scratch stores live under node:os tmpdir and are removed after each test.
 *
 * Proves auditOpenCustodyStore verifies a preserved/frozen sealed custody copy
 * WITHOUT acquiring the exclusive lock and WITHOUT appending an access-log
 * entry (the exact gap that stops verifyIntegrity from auditing a frozen or
 * read-only copy), and that it still FLAGS tamper.
 */

import assert from 'node:assert/strict';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import {
  AUDIT_OPEN_CLAIM_BOUNDARY,
  AUDIT_OPEN_SCHEMA,
  ModelVillageAuditOpenError,
  auditOpenCustodyStore,
  verifyAuditOpenResult,
} from '../model-village-audit-open.mjs';
import {
  createSealedCustodyStore,
  openSealedCustodyStore,
} from '../model-village-custody-store.mjs';

const RETENTION_POLICY = Object.freeze({
  description:
    'MV-B5 audit-open test retention policy; frozen before any live run per '
    + 'the sealed-store spec requirement.',
  frozenAt: '2026-07-27T00:00:00.000Z',
  policyId: 'mv-b5-audit-open-retention-v1',
});

function makeScratchDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mv-audit-'));
  t.after(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  return dir;
}

function accessLogPath(rootDir) {
  return path.join(rootDir, 'access-log.jsonl');
}

function readLogLines(rootDir) {
  return readFileSync(accessLogPath(rootDir), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
}

function sealSampleStore(rootDir, operator = 'operator-audit-01') {
  const store = createSealedCustodyStore({
    operator,
    retentionPolicy: RETENTION_POLICY,
    rootDir,
    runLabel: 'mv-b5-audit-open',
  });
  const first = store.sealObject({
    bytes: Buffer.from('sealed-response-one'),
    kind: 'raw-model-response',
    label: 'audit-obj-01',
  });
  const second = store.sealObject({
    kind: 'structured-fixture',
    label: 'audit-obj-02',
    value: { alpha: 1, nested: { deep: true } },
  });
  store.close();
  return { first, second };
}

test('audit-open verifies a sealed store read-only with NO append and NO lock', (t) => {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'store');
  sealSampleStore(rootDir);

  const linesBefore = readLogLines(rootDir);
  const mtimeBefore = statSync(accessLogPath(rootDir)).mtimeMs;
  assert.equal(
    existsSync(path.join(rootDir, 'store.lock')),
    false,
    'closed store must have no lock file to begin with',
  );

  const result = auditOpenCustodyStore({ rootDir });
  assert.equal(result.ok, true, 'clean sealed store must audit ok');
  assert.equal(result.mode, 'plaintext-decrypt');
  assert.equal(result.schema, AUDIT_OPEN_SCHEMA);
  assert.equal(verifyAuditOpenResult(result), true);
  for (const name of [
    'manifest',
    'key-custody',
    'access-log-chain',
    'objects-content',
    'objects-vs-seal-log',
    'tombstones',
  ]) {
    const check = result.checks.find((entry) => entry.name === name);
    assert.ok(check, `expected an audit check named ${name}`);
    assert.equal(check.ok, true, `${name} must pass: ${check && check.detail}`);
  }

  // The audit must not have mutated anything: no new lock, no new log entry,
  // identical tail, identical file mtime.
  assert.equal(
    existsSync(path.join(rootDir, 'store.lock')),
    false,
    'audit-open must NOT create a lock file',
  );
  const linesAfter = readLogLines(rootDir);
  assert.equal(linesAfter.length, linesBefore.length, 'audit must not append');
  assert.deepEqual(linesAfter, linesBefore, 'audit must leave the log byte-identical');
  assert.equal(
    statSync(accessLogPath(rootDir)).mtimeMs,
    mtimeBefore,
    'audit must not rewrite the access log',
  );

  // Two audits are identical (pure function of the on-disk state).
  const again = auditOpenCustodyStore({ rootDir });
  assert.equal(again.accessLogTailHash, result.accessLogTailHash);
  assert.equal(again.accessLogLength, result.accessLogLength);
  assert.equal(readLogLines(rootDir).length, linesBefore.length);
});

test('GAP: verifyIntegrity mutates the chain (append-on-verify), audit-open does not', (t) => {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'store');
  sealSampleStore(rootDir);
  const lengthAtRest = readLogLines(rootDir).length;

  // The production audit path (open + verifyIntegrity) appends 'open' AND
  // 'verify' entries — proving why a frozen/read-only copy cannot be audited
  // with it. Confirms model-village-custody-store.mjs:1601 (open append) and
  // :1202 (verify append), and :1555 (open acquires the exclusive lock).
  const handle = openSealedCustodyStore({ rootDir, operator: 'operator-audit-01' });
  const afterOpen = readLogLines(rootDir).length;
  const verification = handle.verifyIntegrity();
  const afterVerify = readLogLines(rootDir).length;
  handle.close();
  assert.equal(verification.ok, true);
  assert.equal(afterOpen, lengthAtRest + 1, 'openSealedCustodyStore appends an open entry');
  assert.equal(afterVerify, afterOpen + 1, 'verifyIntegrity appends a verify entry');

  // audit-open over the same (now-longer) chain still mutates nothing.
  const lengthNow = readLogLines(rootDir).length;
  const result = auditOpenCustodyStore({ rootDir });
  assert.equal(result.ok, true);
  assert.equal(readLogLines(rootDir).length, lengthNow, 'audit-open never appends');
});

test('audit-open works on a COPY whose lock file is stale', (t) => {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'store');
  sealSampleStore(rootDir);

  const copyDir = path.join(scratch, 'frozen-copy');
  cpSync(rootDir, copyDir, { recursive: true });
  // Plant a stale/foreign lock (crash residue with a dead-looking pid).
  const staleLock = path.join(copyDir, 'store.lock');
  writeFileSync(
    staleLock,
    JSON.stringify({ acquiredAt: '2026-07-27T00:00:00.000Z', operator: 'ghost', pid: 999_999_999 }),
    'utf8',
  );
  const lockMtime = statSync(staleLock).mtimeMs;
  const lockBytes = readFileSync(staleLock);

  const result = auditOpenCustodyStore({ rootDir: copyDir });
  assert.equal(result.ok, true, 'a stale lock must not block a read-only audit');
  // The auditor never touched the lock (never acquired, never broke it).
  assert.equal(statSync(staleLock).mtimeMs, lockMtime, 'audit must not modify the lock');
  assert.deepEqual(readFileSync(staleLock), lockBytes, 'audit must not rewrite the lock');
});

test('audit-open works on a read-only directory copy', (t) => {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'store');
  sealSampleStore(rootDir);
  const copyDir = path.join(scratch, 'ro-copy');
  cpSync(rootDir, copyDir, { recursive: true });

  // On POSIX, strip write bits so any accidental write would EACCES. On win32
  // chmod is largely synthetic, so the no-mutation assertions above carry the
  // read-only-media guarantee instead.
  if (process.platform !== 'win32') {
    chmodSync(copyDir, 0o500);
    t.after(() => {
      chmodSync(copyDir, 0o700);
    });
  }
  const result = auditOpenCustodyStore({ rootDir: copyDir });
  assert.equal(result.ok, true, 'audit must succeed against a read-only copy');
  assert.equal(existsSync(path.join(copyDir, 'store.lock')), false);
});

test('audit-open FLAGS a tampered object in a copy', (t) => {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'store');
  const { first } = sealSampleStore(rootDir);
  const copyDir = path.join(scratch, 'tampered-copy');
  cpSync(rootDir, copyDir, { recursive: true });

  // Flip a ciphertext byte in one object → GCM auth fails on decrypt.
  const objPath = path.join(copyDir, 'objects', `${first.custodyId}.enc`);
  const bytes = readFileSync(objPath);
  bytes[bytes.length - 1] ^= 0xff;
  writeFileSync(objPath, bytes);

  const result = auditOpenCustodyStore({ rootDir: copyDir });
  assert.equal(result.ok, false, 'a tampered object must fail the audit');
  const objectsCheck = result.checks.find((c) => c.name === 'objects-content');
  assert.equal(objectsCheck.ok, false);
  assert.match(objectsCheck.detail, new RegExp(first.custodyId));
  assert.equal(verifyAuditOpenResult(result), true, 'a failing result is still well-formed');
});

test('audit-open FLAGS a tampered access-log chain in a copy', (t) => {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'store');
  sealSampleStore(rootDir);
  const copyDir = path.join(scratch, 'chain-tampered-copy');
  cpSync(rootDir, copyDir, { recursive: true });

  // Rewrite the first (create) entry's operator but keep its entryHash → the
  // recomputed canonical digest no longer matches.
  const lines = readLogLines(copyDir);
  const first = JSON.parse(lines[0]);
  first.operator = `${first.operator}-tampered`;
  lines[0] = JSON.stringify(first);
  writeFileSync(accessLogPath(copyDir), `${lines.join('\n')}\n`, 'utf8');

  const result = auditOpenCustodyStore({ rootDir: copyDir });
  assert.equal(result.ok, false);
  const chainCheck = result.checks.find((c) => c.name === 'access-log-chain');
  assert.equal(chainCheck.ok, false);
  assert.match(chainCheck.detail, /entryHash does not match/);
});

test('audit-open verifies a key-destroyed store in ciphertext-checksum mode', (t) => {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'store');
  const store = createSealedCustodyStore({
    operator: 'operator-audit-01',
    retentionPolicy: RETENTION_POLICY,
    rootDir,
    runLabel: 'mv-b5-audit-open',
  });
  store.sealObject({
    bytes: Buffer.from('to-be-key-destroyed'),
    kind: 'raw-model-response',
    label: 'destroy-obj-01',
  });
  store.destroyContentKey({ reason: 'MV-B5 audit-open key-destruction drill' });
  store.close();

  const result = auditOpenCustodyStore({ rootDir });
  assert.equal(result.mode, 'ciphertext-checksum-only');
  assert.equal(result.ok, true, 'destroyed-key store must verify by ciphertext checksum');
  const keyCheck = result.checks.find((c) => c.name === 'key-custody');
  assert.equal(keyCheck.ok, true);
  assert.match(keyCheck.detail, /tombstone/);
  const tombstones = result.checks.find((c) => c.name === 'tombstones');
  assert.equal(tombstones.ok, true);
});

test('audit-open detects ciphertext tamper AFTER key destruction (checksum mode)', (t) => {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'store');
  const store = createSealedCustodyStore({
    operator: 'operator-audit-01',
    retentionPolicy: RETENTION_POLICY,
    rootDir,
    runLabel: 'mv-b5-audit-open',
  });
  const sealed = store.sealObject({
    bytes: Buffer.from('checksum-authority-object'),
    kind: 'raw-model-response',
    label: 'destroy-obj-02',
  });
  store.destroyContentKey({ reason: 'MV-B5 audit-open checksum tamper drill' });
  store.close();

  const objPath = path.join(rootDir, 'objects', `${sealed.custodyId}.enc`);
  const bytes = readFileSync(objPath);
  bytes[0] ^= 0xff;
  writeFileSync(objPath, bytes);

  const result = auditOpenCustodyStore({ rootDir });
  assert.equal(result.mode, 'ciphertext-checksum-only');
  assert.equal(result.ok, false);
  const objectsCheck = result.checks.find((c) => c.name === 'objects-content');
  assert.equal(objectsCheck.ok, false);
  assert.match(objectsCheck.detail, /ciphertext checksum mismatch/);
});

test('audit-open claim boundary pins the read-only guarantees', (t) => {
  const scratch = makeScratchDir(t);
  const rootDir = path.join(scratch, 'store');
  sealSampleStore(rootDir);
  const result = auditOpenCustodyStore({ rootDir });
  assert.equal(result.claimBoundary, AUDIT_OPEN_CLAIM_BOUNDARY);
  assert.equal(result.claimBoundary.acquiresExclusiveLock, false);
  assert.equal(result.claimBoundary.appendsAccessLogEntry, false);
  assert.equal(result.claimBoundary.mutatesStore, false);
  assert.equal(result.claimBoundary.repairsInconsistency, false);
  assert.equal(result.claimBoundary.distributedMultiHostConsensusClaimed, false);
  assert.equal(result.claimBoundary.mediaFailureDurabilityClaimed, false);
});

test('verifyAuditOpenResult rejects malformed results', () => {
  assert.throws(() => verifyAuditOpenResult(null), ModelVillageAuditOpenError);
  assert.throws(
    () => verifyAuditOpenResult({ ok: 'yes', checks: [], claimBoundary: {} }),
    ModelVillageAuditOpenError,
  );
  assert.throws(
    () => verifyAuditOpenResult({ ok: true, checks: [], claimBoundary: {} }),
    ModelVillageAuditOpenError,
    'empty checks array must be rejected',
  );
  // ok must equal the conjunction of checks.
  assert.throws(
    () => verifyAuditOpenResult({
      ok: true,
      checks: [{ name: 'x', ok: false, detail: 'd' }],
      claimBoundary: { acquiresExclusiveLock: false, appendsAccessLogEntry: false },
    }),
    ModelVillageAuditOpenError,
  );
  // A well-formed failing result passes structural validation.
  assert.equal(
    verifyAuditOpenResult({
      ok: false,
      checks: [{ name: 'x', ok: false, detail: 'd' }],
      claimBoundary: { acquiresExclusiveLock: false, appendsAccessLogEntry: false },
    }),
    true,
  );
});
