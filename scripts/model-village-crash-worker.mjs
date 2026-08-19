/* global Buffer, process */

/**
 * MV-B5 crash-drill child worker (spawned by model-village-crash-drill.mjs).
 *
 * Two roles, selected by --role:
 *   --role=crash   : performs a REAL production sealed-store / persistent-state
 *                    operation (or deterministically establishes the exact
 *                    on-disk state a crash at an un-catchable sub-syscall window
 *                    would produce), signals the parent at the exact moment it
 *                    is safe to kill, then BLOCKS. It installs no signal handler
 *                    — SIGKILL is uncatchable by design, which is the point.
 *   --role=recover : opens/recovers the store in this FRESH process using only
 *                    production recovery code and prints a single verdict line.
 *
 * All stores live under the drill's per-case scratch dir (os.tmpdir-rooted,
 * chosen by the parent). This worker never touches a path outside --case-dir
 * and never kills any process.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';

import {
  createSealedCustodyStore,
  CustodyIntegrityError,
  CustodyKeyDestroyedError,
  openSealedCustodyStore,
} from './model-village-custody-store.mjs';
import {
  acquirePersistentStoreLock,
  initializePersistentStore,
  readPersistentState,
} from './model-village-phase0b-runtime.mjs';
import {
  buildDrillPlaintext,
  buildValidatorFixture,
  custodyIdForBytes,
  custodyRootFor,
  DRILL_RUN_LABEL,
  phase0bStoreDirFor,
  retentionPolicyFixture,
} from './model-village-crash-drill.mjs';

const READY_TOKEN = 'MV_CRASH_READY';
const VERDICT_MARKER = 'MV_CRASH_VERDICT ';
// Printed synchronously as the very first act of main(), by BOTH roles. It is
// the only thing in the drill that ties a receipt's pid to a process that
// actually ran this file: the parent's spawn-observed pid must equal the pid
// the child reported about itself, so an emitter cannot substitute a throwaway
// child's pid for work it performed somewhere else.
const SELF_PID_MARKER = 'MV_CRASH_PID ';
const MAX_OUTCOME = 600;

function parseArgs(argv) {
  const out = {};
  for (const entry of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(entry);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function trunc(value, max = 200) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function bound(value) {
  return trunc(value, MAX_OUTCOME);
}

/** Uncatchable block: emits READY, then parks the thread until SIGKILL. */
function signalReadyAndBlock() {
  writeSync(1, `${READY_TOKEN}\n`);
  blockForever();
}

function blockForever() {
  // Atomics.wait on the main thread is permitted in Node and blocks with no
  // CPU and no timeout; only process termination ends it.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}

function custodyPaths(caseDir) {
  const root = custodyRootFor(caseDir);
  return {
    root,
    accessLog: path.join(root, 'access-log.jsonl'),
    manifest: path.join(root, 'store-manifest.json'),
    keyFile: path.join(root, 'key', 'content-key.bin'),
    objectsDir: path.join(root, 'objects'),
    tombstones: path.join(root, 'tombstones.jsonl'),
  };
}

/**
 * Where the ordering case records whether its filesystem fault actually
 * interrupted the production destroy. Kept OUTSIDE the custody root so it can
 * never be mistaken for store content.
 */
function orderingMechanismPath(caseDir) {
  return path.join(caseDir, 'ordering-mechanism.json');
}

function fileSha256(filePath) {
  return existsSync(filePath) ? sha256Hex(readFileSync(filePath)) : null;
}

function accessLogEntries(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function accessLogTailHash(filePath) {
  try {
    const entries = accessLogEntries(filePath);
    if (entries.length === 0) return fileSha256(filePath);
    const tail = entries[entries.length - 1];
    return typeof tail.entryHash === 'string' ? tail.entryHash : fileSha256(filePath);
  } catch {
    return fileSha256(filePath);
  }
}

function orphanTempFiles(storeDir) {
  if (!existsSync(storeDir)) return [];
  return readdirSync(storeDir).filter(
    (name) => name.startsWith('.state-') && name.endsWith('.tmp'),
  );
}

// ---------------------------------------------------------------------------
// role=crash
// ---------------------------------------------------------------------------

function runCrash(args) {
  const { scenario, operator, seed } = args;
  const size = Number(args.size);
  const caseDir = args['case-dir'];

  switch (scenario) {
    case 'custody-seal-killed-mid-write': {
      // Real mid-write kill: the parent watches for the `.enc` and SIGKILLs the
      // instant it appears, landing inside the large ciphertext writeSync.
      const store = createSealedCustodyStore({
        rootDir: custodyRootFor(caseDir),
        runLabel: DRILL_RUN_LABEL,
        operator,
        retentionPolicy: retentionPolicyFixture(),
      });
      const bytes = buildDrillPlaintext(seed, size);
      // No READY line: the object-file trigger fires from openSync inside seal.
      store.sealObject({
        bytes,
        kind: 'model-response-ciphertext',
        label: 'mv-b5-drill-object',
      });
      // Reached only if the write finished before the kill; block so the
      // parent's fallback still delivers a real SIGKILL.
      blockForever();
      return;
    }

    case 'custody-lock-held-by-killed-pid': {
      // Real live-lock-holder kill: createSealedCustodyStore acquires store.lock
      // recording THIS pid; we block holding it until SIGKILL.
      createSealedCustodyStore({
        rootDir: custodyRootFor(caseDir),
        runLabel: DRILL_RUN_LABEL,
        operator,
        retentionPolicy: retentionPolicyFixture(),
      });
      signalReadyAndBlock();
      return;
    }

    case 'persistent-state-killed-after-rename': {
      // Real completed atomic write (production writeAtomicState), then kill.
      const fixture = buildValidatorFixture();
      initializePersistentStore({
        storeDir: phase0bStoreDirFor(caseDir),
        trustedValidatorConfig: fixture.trustedValidatorConfig,
        validatorReceipt: fixture.validatorReceipt,
        initialWorld: fixture.initialWorld,
      });
      signalReadyAndBlock();
      return;
    }

    case 'persistent-state-killed-before-rename': {
      // Real committed prior state (production writeAtomicState) + a real orphan
      // temp modeling an interrupted next-write that never reached its rename.
      // (The temp→rename window is a synchronous no-yield span an external
      // SIGKILL cannot split; see the harness MECHANISM NOTE + gapsFound.)
      const storeDir = phase0bStoreDirFor(caseDir);
      const fixture = buildValidatorFixture();
      initializePersistentStore({
        storeDir,
        trustedValidatorConfig: fixture.trustedValidatorConfig,
        validatorReceipt: fixture.validatorReceipt,
        initialWorld: fixture.initialWorld,
      });
      const tempPath = path.join(
        storeDir,
        `.state-${process.pid}-${randomUUID()}.tmp`,
      );
      writeFileSync(
        tempPath,
        `${JSON.stringify({ interruptedNextWrite: true, revision: 1 })}\n`,
        'utf8',
      );
      signalReadyAndBlock();
      return;
    }

    case 'access-log-torn-append': {
      // Real store with a clean [create, seal] chain, then a real partial
      // trailing line modeling a torn append that never got its newline.
      const paths = custodyPaths(caseDir);
      const store = createSealedCustodyStore({
        rootDir: paths.root,
        runLabel: DRILL_RUN_LABEL,
        operator,
        retentionPolicy: retentionPolicyFixture(),
      });
      store.sealObject({
        bytes: Buffer.from('mv-b5-access-log-object', 'utf8'),
        kind: 'model-response-ciphertext',
        label: 'mv-b5-drill-object',
      });
      store.close();
      appendFileSync(
        paths.accessLog,
        '{"at":"2026-07-27T00:00:00.000Z","operation":"read","sequen',
        'utf8',
      );
      signalReadyAndBlock();
      return;
    }

    case 'persistent-state-lock-leak-after-kill': {
      // A persistence lock GENUINELY leaked by a writer killed while holding
      // it. initializePersistentStore commits and releases its own lock, so
      // this worker then takes the REAL production lock
      // (acquirePersistentStoreLock — the exact call withStoreLock makes) and
      // blocks forever holding it. The SIGKILL that follows skips the release
      // entirely: no file is hand-built, and the leaked state.lock carries
      // THIS worker's pid, which is dead by the time recovery runs.
      const storeDir = phase0bStoreDirFor(caseDir);
      const fixture = buildValidatorFixture();
      initializePersistentStore({
        storeDir,
        trustedValidatorConfig: fixture.trustedValidatorConfig,
        validatorReceipt: fixture.validatorReceipt,
        initialWorld: fixture.initialWorld,
      });
      acquirePersistentStoreLock(storeDir);
      signalReadyAndBlock();
      return;
    }

    case 'custody-destroy-key-killed-mid-destroy': {
      // Models a crash inside destroyContentKey AFTER its commit point.
      // destroyContentKey appends the hash-chained 'destroy-key' access-log
      // entry FIRST (that append is the durable commit record), then the
      // nonidentifying tombstone, and only then scrubs+unlinks the key, so the
      // reachable crash window is "destruction committed, key file still on
      // disk" — the widest window, spanning everything between the commit fsync
      // and the unlink.
      //
      // MECHANISM (honest): that window is sub-syscall and cannot be split by
      // an external SIGKILL, so the state is established with production code
      // plus real file ops — seal a real object, run the REAL production
      // destroyContentKey (real commit entry, real tombstone, real scrub, real
      // unlink), then put the original key bytes back exactly where the
      // interrupted scrub would have left them. Recovery must roll the
      // destruction FORWARD and must NOT resurrect the restored key.
      //
      // COVERAGE BOUNDARY (why the sibling case below exists): because this
      // case runs the destroy to COMPLETION, its on-disk state is identical
      // whether the commit record is written first or last. It therefore proves
      // the RECOVERY half of G1 and is structurally blind to the ORDERING half;
      // custody-destroy-key-killed-before-key-scrub covers that.
      const paths = custodyPaths(caseDir);
      const store = createSealedCustodyStore({
        rootDir: paths.root,
        runLabel: DRILL_RUN_LABEL,
        operator,
        retentionPolicy: retentionPolicyFixture(),
      });
      store.sealObject({
        bytes: Buffer.from('mv-b5-key-destroy-object', 'utf8'),
        kind: 'model-response-ciphertext',
        label: 'mv-b5-drill-object',
      });
      const keyBytesBeforeDestroy = readFileSync(paths.keyFile);
      store.destroyContentKey({
        reason: 'mv-b5 crash drill: destroy interrupted after the commit point',
      });
      store.close();
      writeFileSync(paths.keyFile, keyBytesBeforeDestroy, { mode: 0o600 });
      signalReadyAndBlock();
      return;
    }

    case 'custody-destroy-key-killed-before-key-scrub': {
      // ORDERING half of G1, and the only case that can detect an ordering
      // regression. NO on-disk state is modeled: the REAL production
      // destroyContentKey is interrupted at the key scrub itself by a real
      // filesystem fault (the key file is made unwritable, so the production
      // scrubAndUnlinkKeyFile throws at exactly the ordering boundary).
      //   - commit-first (correct): the destroy-key chain entry and the
      //     tombstone are already durable when the scrub fails, so recovery
      //     rolls the destruction forward.
      //   - scrub-first (regressed): the scrub is the FIRST step, so it throws
      //     before anything is committed, the store reopens with a LIVE key,
      //     and the recovery verdict flips to invariantHeld:false.
      const paths = custodyPaths(caseDir);
      const store = createSealedCustodyStore({
        rootDir: paths.root,
        runLabel: DRILL_RUN_LABEL,
        operator,
        retentionPolicy: retentionPolicyFixture(),
      });
      store.sealObject({
        bytes: Buffer.from('mv-b5-key-destroy-ordering-object', 'utf8'),
        kind: 'model-response-ciphertext',
        label: 'mv-b5-drill-object',
      });
      const keyBytesBeforeDestroy = readFileSync(paths.keyFile);
      chmodSync(paths.keyFile, 0o444);
      let interrupted = false;
      try {
        store.destroyContentKey({
          reason: 'mv-b5 crash drill: destroy interrupted at the key scrub',
        });
      } catch {
        interrupted = true;
      }
      // Restore write access so recovery's roll-forward scrub is not blocked by
      // the fault we injected (the fault models the crash, not the aftermath).
      if (existsSync(paths.keyFile)) chmodSync(paths.keyFile, 0o600);
      if (!interrupted) {
        // The host let the scrub through (e.g. POSIX root ignores the mode
        // bits). Fall back to the ratified modeling so the drill still asserts
        // roll-forward, and record that this run could NOT discriminate the
        // ordering. The receipt says so rather than implying coverage.
        writeFileSync(paths.keyFile, keyBytesBeforeDestroy, { mode: 0o600 });
      }
      writeFileSync(
        orderingMechanismPath(caseDir),
        JSON.stringify({ interrupted }),
        'utf8',
      );
      store.close();
      signalReadyAndBlock();
      return;
    }

    case 'custody-tombstone-torn-append': {
      // Crash INSIDE step 2 of destroyContentKey (the tombstone append), which
      // the commit-record reorder made a survivable window: the hash-chained
      // destroy-key entry is already durable, and the tombstone line is torn.
      // Establish it with production code plus one real file op — run the REAL
      // destroy, then replace the tombstone file with an unterminated fragment
      // of the very line production wrote.
      const paths = custodyPaths(caseDir);
      const store = createSealedCustodyStore({
        rootDir: paths.root,
        runLabel: DRILL_RUN_LABEL,
        operator,
        retentionPolicy: retentionPolicyFixture(),
      });
      store.sealObject({
        bytes: Buffer.from('mv-b5-tombstone-torn-object', 'utf8'),
        kind: 'model-response-ciphertext',
        label: 'mv-b5-drill-object',
      });
      store.destroyContentKey({
        reason: 'mv-b5 crash drill: tombstone append torn mid-write',
      });
      store.close();
      const written = readFileSync(paths.tombstones, 'utf8');
      // A torn append: the same bytes production wrote, cut mid-line, with no
      // terminating newline — exactly what a crash inside the write leaves.
      writeFileSync(
        paths.tombstones,
        written.slice(0, Math.floor(written.length * 0.6)),
        'utf8',
      );
      signalReadyAndBlock();
      return;
    }

    default:
      throw new Error(`unknown crash scenario ${scenario}`);
  }
}

// ---------------------------------------------------------------------------
// role=recover  (fresh process; production recovery code only)
// ---------------------------------------------------------------------------

function emitVerdict(verdict) {
  writeSync(
    1,
    `${VERDICT_MARKER}${JSON.stringify({
      invariantHeld: Boolean(verdict.invariantHeld),
      observedOutcome: bound(verdict.observedOutcome),
      storeStateHashAfterRecovery: verdict.storeStateHashAfterRecovery ?? null,
    })}\n`,
  );
}

function recoverCustodySealMidWrite(args) {
  const { operator, seed } = args;
  const size = Number(args.size);
  const paths = custodyPaths(args['case-dir']);
  try {
    const store = openSealedCustodyStore({ rootDir: paths.root, operator });
    // Opening validated the whole access-log chain; a torn chain would throw.
    const custodyId = custodyIdForBytes(buildDrillPlaintext(seed, size));
    const objectPath = path.join(paths.objectsDir, `${custodyId}.enc`);

    let objectState;
    if (!existsSync(objectPath)) {
      objectState = 'absent';
    } else {
      try {
        store.readObject(custodyId);
        objectState = 'readable';
      } catch (error) {
        objectState = `rejected(${error.name})`;
      }
    }
    const recorded = accessLogEntries(paths.accessLog).some(
      (entry) => entry.operation === 'seal' && entry.custodyId === custodyId,
    );
    const verify = store.verifyIntegrity();
    const tailHash = accessLogTailHash(paths.accessLog);
    store.close();

    // Admitted-as-valid ONLY if the object is readable AND recorded in the seal
    // log AND verifyIntegrity is clean. Any half-write fails at least one.
    const admittedValid = objectState === 'readable' && recorded && verify.ok;
    return {
      invariantHeld: !admittedValid,
      observedOutcome:
        `store opened; access-log chain intact; object=${objectState}; `
        + `recordedInSealLog=${recorded}; verifyIntegrity.ok=${verify.ok}; `
        + 'a half-written object was not admitted as a valid recorded object',
      storeStateHashAfterRecovery: tailHash,
    };
  } catch (error) {
    return {
      invariantHeld: false,
      observedOutcome: `recovery open failed unexpectedly: ${trunc(error.message)}`,
      storeStateHashAfterRecovery: fileSha256(paths.accessLog) ?? fileSha256(paths.manifest),
    };
  }
}

function recoverCustodyLockHeld(args) {
  const { operator } = args;
  const paths = custodyPaths(args['case-dir']);
  try {
    const store = openSealedCustodyStore({ rootDir: paths.root, operator });
    const tailHash = accessLogTailHash(paths.accessLog);
    store.close();
    return {
      invariantHeld: true,
      observedOutcome:
        'stale-pid custody store.lock reclaimed by a fresh open (self-healing '
        + 'stale-lock break); no hang',
      storeStateHashAfterRecovery: tailHash,
    };
  } catch (error) {
    return {
      invariantHeld: false,
      observedOutcome:
        `fresh open did not reclaim the stale-pid lock: ${trunc(error.message)}`,
      storeStateHashAfterRecovery: fileSha256(paths.manifest),
    };
  }
}

function recoverPersistentAfterRename(args) {
  const storeDir = phase0bStoreDirFor(args['case-dir']);
  try {
    const state = readPersistentState(storeDir);
    return {
      invariantHeld: state.revision === 0,
      observedOutcome:
        'fresh process read the complete post-rename state.json; '
        + `validatePersistentState passed; revision=${state.revision}`,
      storeStateHashAfterRecovery: state.stateHash,
    };
  } catch (error) {
    return {
      invariantHeld: false,
      observedOutcome:
        `post-rename state was unreadable or torn: ${trunc(error.message)}`,
      storeStateHashAfterRecovery: fileSha256(path.join(storeDir, 'state.json')),
    };
  }
}

function recoverPersistentBeforeRename(args) {
  const storeDir = phase0bStoreDirFor(args['case-dir']);
  try {
    const state = readPersistentState(storeDir);
    const orphans = orphanTempFiles(storeDir);
    return {
      invariantHeld: state.revision === 0 && orphans.length >= 1,
      observedOutcome:
        'fresh process read the complete prior state.json '
        + `(revision=${state.revision}); validatePersistentState passed; `
        + `${orphans.length} orphan temp ignored; never torn`,
      storeStateHashAfterRecovery: state.stateHash,
    };
  } catch (error) {
    return {
      invariantHeld: false,
      observedOutcome:
        `prior state torn/unreadable after pre-rename interruption: ${trunc(error.message)}`,
      storeStateHashAfterRecovery: fileSha256(path.join(storeDir, 'state.json')),
    };
  }
}

function recoverAccessLogTorn(args) {
  const { operator } = args;
  const paths = custodyPaths(args['case-dir']);
  try {
    const store = openSealedCustodyStore({ rootDir: paths.root, operator });
    store.close();
    return {
      invariantHeld: false,
      observedOutcome:
        'torn access-log tail was silently accepted (open succeeded) — '
        + 'fail-closed invariant VIOLATED',
      storeStateHashAfterRecovery: fileSha256(paths.accessLog),
    };
  } catch (error) {
    const failedClosed =
      error instanceof CustodyIntegrityError
      || error.name === 'CustodyIntegrityError'
      || /valid JSON|corrupt|integrity/i.test(error.message);
    return {
      invariantHeld: failedClosed,
      observedOutcome: failedClosed
        ? `torn access-log tail detected; open failed closed (${error.name}); `
          + 'no auto-truncate; manual repair of the partial line required'
        : `open failed with an unexpected error: ${trunc(error.message)}`,
      storeStateHashAfterRecovery: fileSha256(paths.accessLog),
    };
  }
}

function recoverPersistentLockLeak(args) {
  const storeDir = phase0bStoreDirFor(args['case-dir']);
  let readable = false;
  let stateHash = null;
  try {
    const state = readPersistentState(storeDir);
    readable = true;
    stateHash = state.stateHash;
  } catch {
    /* reads may still fail if state itself is bad; captured in outcome */
  }
  // A fresh writer must reclaim the dead holder's lock. The store already has
  // a state.json, so the reclaiming writer is expected to get PAST the lock and
  // fail on the "already exists" guard instead — reaching that guard is the
  // proof the lock was broken. Still being refused with "locked by another
  // writer" is the G2 regression signal.
  let writerBlocked = false;
  let writerOutcome = 'initializePersistentStore unexpectedly succeeded';
  try {
    const fixture = buildValidatorFixture();
    initializePersistentStore({
      storeDir,
      trustedValidatorConfig: fixture.trustedValidatorConfig,
      validatorReceipt: fixture.validatorReceipt,
      initialWorld: fixture.initialWorld,
    });
  } catch (error) {
    writerBlocked = /locked by another writer/.test(error.message);
    writerOutcome = `initializePersistentStore threw "${trunc(error.message, 90)}"`;
  }
  const lockReclaimed = !existsSync(path.join(storeDir, 'state.lock'));
  const held = !writerBlocked && lockReclaimed && readable;
  return {
    invariantHeld: held,
    observedOutcome: held
      ? 'the state.lock genuinely leaked by the SIGKILLed holder was reclaimed: '
        + 'its recorded pid was proven dead, the stale lock was broken once, a '
        + `fresh writer got past the lock (${writerOutcome}), no lock file `
        + 'remains, and reads still validate'
      : 'REGRESSION G2: the leaked state.lock was not reclaimed '
        + `(writerBlocked=${writerBlocked}, lockFileRemoved=${lockReclaimed}, `
        + `stateReadable=${readable}; ${writerOutcome})`,
    storeStateHashAfterRecovery: stateHash ?? fileSha256(path.join(storeDir, 'state.json')),
  };
}

/**
 * The invariant is not merely "it opens": a committed destruction must be
 * rolled FORWARD and stay irreversible. All four properties must hold, so this
 * verdict flips back to false the moment the G1 fix regresses.
 */
function recoverCustodyDestroyKey(args, { note = '', extraChecks = null } = {}) {
  const { operator } = args;
  const paths = custodyPaths(args['case-dir']);
  try {
    const store = openSealedCustodyStore({ rootDir: paths.root, operator });
    let readBlocked = false;
    let readOutcome = 'readObject unexpectedly returned plaintext';
    try {
      const [entry] = store.listObjects();
      store.readObject(entry.custodyId);
    } catch (error) {
      readBlocked = error instanceof CustodyKeyDestroyedError;
      readOutcome = `readObject threw ${error.name}`;
    }
    const verification = store.verifyIntegrity();
    store.close();
    const keyRolledForward = !existsSync(paths.keyFile);
    const checksumMode = verification.mode === 'ciphertext-checksum-only';
    const verifyOk = verification.ok === true;
    const extra = extraChecks ? extraChecks(paths) : { ok: true, detail: '' };
    const held = keyRolledForward && readBlocked && checksumMode && verifyOk
      && extra.ok;
    return {
      invariantHeld: held,
      observedOutcome: held
        ? 'store opened after the post-commit-point crash; the committed '
          + 'destruction was rolled FORWARD (restored key file scrubbed and '
          + `unlinked at open), ${readOutcome}, verifyIntegrity ok in `
          + `ciphertext-checksum-only mode${extra.detail}${note}`
        : 'REGRESSION: recovery did not restore the destroyed state '
          + `(keyFileRemoved=${keyRolledForward}, readBlocked=${readBlocked}, `
          + `mode=${verification.mode}, verifyOk=${verifyOk}; ${readOutcome}`
          + `${extra.ok ? '' : `; ${extra.detail}`})${note}`,
      storeStateHashAfterRecovery: accessLogTailHash(paths.accessLog),
    };
  } catch (error) {
    return {
      invariantHeld: false,
      observedOutcome:
        'REGRESSION: a crash after the destroy commit point wedges the store; '
        + `openSealedCustodyStore throws ${error.name} `
        + `("${trunc(error.message, 120)}"); no code path recovers${note}`,
      storeStateHashAfterRecovery: fileSha256(paths.manifest),
    };
  }
}

/**
 * ORDERING half of G1. Same four properties as the recovery case, plus the
 * mechanism the crash worker actually achieved: `interrupted:true` means the
 * production destroy really failed at the key-scrub boundary, which is the
 * state only a commit-FIRST ordering can survive.
 */
function recoverCustodyDestroyKeyOrdering(args) {
  let interrupted = null;
  try {
    interrupted = JSON.parse(
      readFileSync(orderingMechanismPath(args['case-dir']), 'utf8'),
    ).interrupted === true;
  } catch {
    interrupted = null;
  }
  const note = interrupted === true
    ? '; production destroyContentKey was really interrupted AT the key scrub, '
      + 'so the commit record proved durable before any key byte was touched'
    : '; NOTE: the host did not honour the injected key-file fault, so this run '
      + 'fell back to the modeled post-commit state and did NOT discriminate '
      + 'the commit ordering';
  return recoverCustodyDestroyKey(args, { note });
}

/**
 * A torn tombstone append must be repaired, not fatal: exactly one valid
 * tombstone line must be present after open, re-emitted from the committed
 * hash-chained entry.
 */
function recoverCustodyTombstoneTorn(args) {
  return recoverCustodyDestroyKey(args, {
    note: '; the torn tombstone tail was dropped and the tombstone re-emitted '
      + 'from the committed destroy-key chain entry',
    extraChecks: (paths) => {
      const lines = existsSync(paths.tombstones)
        ? readFileSync(paths.tombstones, 'utf8')
          .split('\n')
          .filter((line) => line.length > 0)
        : [];
      let parsed = 0;
      for (const line of lines) {
        try {
          JSON.parse(line);
          parsed += 1;
        } catch {
          /* counted as unparseable below */
        }
      }
      const ok = lines.length === 1 && parsed === 1;
      return {
        ok,
        detail: ok
          ? '; tombstones.jsonl holds exactly one valid line'
          : `tombstones.jsonl holds ${lines.length} line(s), ${parsed} parseable`,
      };
    },
  });
}

function runRecover(args) {
  const { scenario } = args;
  switch (scenario) {
    case 'custody-seal-killed-mid-write':
      return recoverCustodySealMidWrite(args);
    case 'custody-lock-held-by-killed-pid':
      return recoverCustodyLockHeld(args);
    case 'persistent-state-killed-after-rename':
      return recoverPersistentAfterRename(args);
    case 'persistent-state-killed-before-rename':
      return recoverPersistentBeforeRename(args);
    case 'access-log-torn-append':
      return recoverAccessLogTorn(args);
    case 'persistent-state-lock-leak-after-kill':
      return recoverPersistentLockLeak(args);
    case 'custody-destroy-key-killed-mid-destroy':
      return recoverCustodyDestroyKey(args);
    case 'custody-destroy-key-killed-before-key-scrub':
      return recoverCustodyDestroyKeyOrdering(args);
    case 'custody-tombstone-torn-append':
      return recoverCustodyTombstoneTorn(args);
    default:
      throw new Error(`unknown recover scenario ${scenario}`);
  }
}

// ---------------------------------------------------------------------------
// entrypoint
// ---------------------------------------------------------------------------

function main() {
  writeSync(1, `${SELF_PID_MARKER}${process.pid}\n`);
  const args = parseArgs(process.argv.slice(2));
  if (args.role === 'crash') {
    runCrash(args);
    // runCrash never returns (it blocks until SIGKILL).
    return;
  }
  if (args.role === 'recover') {
    let verdict;
    try {
      verdict = runRecover(args);
    } catch (error) {
      verdict = {
        invariantHeld: false,
        observedOutcome: `recovery worker error: ${trunc(error.message)}`,
        storeStateHashAfterRecovery: null,
      };
    }
    emitVerdict(verdict);
    return;
  }
  writeSync(2, `crash worker: unknown or missing --role (${args.role})\n`);
  process.exitCode = 2;
}

main();
