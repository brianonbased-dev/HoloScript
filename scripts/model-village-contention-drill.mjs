/* global Buffer, process, setTimeout */

/**
 * MV-B5 multi-process CONTENTION drill for the Model Village sealed custody
 * store and the Phase-0B persistence store (closes gate row 578's remaining
 * "multi-process CAS ... and distributed locking", single-host).
 *
 * WHAT IT PROVES (executed, receipted):
 *  1. Custody config: N REAL child processes all open the SAME sealed custody
 *     store and seal concurrently. The store's exclusive store.lock
 *     (model-village-custody-store.mjs acquireStoreLock:567, released by
 *     close()) serializes them: at most one live handle at a time; every other
 *     opener is cleanly refused with a typed CustodyLockError and retries.
 *     The final access-log chain is linear and monotonic with NO interleaved
 *     or forked entries — verified read-only via auditOpenCustodyStore.
 *  2. Persistence config: N child processes race initializePersistentStore on
 *     one fresh storeDir. withStoreLock (phase0b-runtime.mjs:1577) serializes
 *     them — exactly one initializes, every other is cleanly refused ("locked
 *     by another writer" or "already exists"), and the final state validates.
 *  3. Non-vacuity control: two child processes deliberately BYPASS the lock and
 *     raw-append forking entries to a fresh store's access log (what two
 *     unsynchronized writers would produce). The drill confirms the chain
 *     check FLAGS the fork — proving the linear-chain assertion in (1) is not
 *     vacuously true.
 *
 * CLAIM BOUNDARY (HARD): single-host process serialization + same-host
 * multi-process contention only. This slice does NOT claim production/fleet
 * deployment, distributed (multi-host) consensus, or durability against media
 * failure / an OS that lies about fsync. Process-crash durability is a
 * separate drill (not this one); contention workers here run to completion and
 * are never SIGKILLed.
 *
 * Every child is spawned by this module (tracked pids), writes only under the
 * caller-provided scratch root, and is cleaned up on exit. The module doubles
 * as its own worker entry point when invoked as `node <thisfile> --worker
 * <jobFile>`; imported as a library, the worker block never runs.
 */

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditOpenCustodyStore } from './model-village-audit-open.mjs';
import {
  CUSTODY_ACCESS_LOG_ENTRY_SCHEMA,
  createSealedCustodyStore,
  openSealedCustodyStore,
} from './model-village-custody-store.mjs';
import {
  canonicalDigest,
  canonicalJson,
  createRuntimeInjectedValidatorFixture,
  initializePersistentStore,
  readPersistentState,
} from './model-village-phase0b-runtime.mjs';

export const CONTENTION_DRILL_SCHEMA = 'hololand.model-village-contention-drill.v1';
export const CONTENTION_DRILL_ENGINE = 'hololand-model-village-contention-drill-v1';

/** What this single-host contention slice explicitly does NOT claim. */
export const CONTENTION_DRILL_CLAIM_BOUNDARY = Object.freeze({
  singleHostProcessSerializationProven: true,
  sameHostMultiProcessContentionProven: true,
  productionFleetDeploymentClaimed: false,
  distributedMultiHostConsensusClaimed: false,
  mediaFailureDurabilityClaimed: false,
  fsyncHonestyClaimed: false,
  processCrashDurabilityClaimed: false,
});

export class ModelVillageContentionDrillError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelVillageContentionDrillError';
  }
}

const SELF_PATH = fileURLToPath(import.meta.url);
const DRILL_RETENTION_POLICY = Object.freeze({
  description:
    'MV-B5 contention drill retention policy; frozen before any live run per '
    + 'the sealed-store spec requirement.',
  frozenAt: '2026-07-27T00:00:00.000Z',
  policyId: 'mv-b5-contention-drill-retention-v1',
});
const DRILL_RUN_LABEL = 'mv-b5-contention-drill';
const WORKER_DEADLINE_MS = 30_000;

function isoNow() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assertPositiveInteger(value, label, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new ModelVillageContentionDrillError(`${label} must be an integer >= ${min}`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ModelVillageContentionDrillError(`${label} must be a non-empty string`);
  }
}

// --- Raw append that bypasses the custody store (control / worker use only). --
function rawAppendLine(filePath, line) {
  const fd = openSync(filePath, 'a');
  try {
    const buffer = Buffer.from(`${line}\n`, 'utf8');
    writeSync(fd, buffer, 0, buffer.length);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Minimal, structurally valid Phase-0B run manifest. It exists only to build a
 * signed validator receipt so initializePersistentStore reaches its
 * withStoreLock; the drill never executes actions. Values are deterministic
 * placeholders that satisfy assertRunManifest's closed-key/sha256/sequence
 * checks (no live study run is performed — see CLAIM BOUNDARY).
 */
function digestLabel(label) {
  return createHash('sha256').update(label).digest('hex');
}

function buildMinimalRunManifest() {
  const world = {
    acceptedActionCount: 0,
    emergencyStopState: 'armed',
    phase: 'running',
    publicWaterUnits: 0,
  };
  const action = (index) => ({
    args: {
      capturedResponseHash: digestLabel(`captured-response-${index}`),
      challengeManifestHash: digestLabel('challenge-manifest'),
      metricSpecHash: digestLabel('metric-spec'),
      parsedProposal: `contribute_water:PublicReservoir:${index + 1}`,
      residentId: `resident-${index}`,
    },
    authorization: {
      decisionReceiptId: `decision-${index}`,
      nonce: `authorization-nonce-${index}`,
      safetyReceiptId: `safety-${index}`,
      sequence: index,
      turnOpportunityId: `turn-${index}`,
    },
    entrypoint: 'contribute_water',
    expectedAllowed: true,
    expectedOutcome: 'accepted',
    scheduleEntryId: `schedule-${index}`,
    targetIds: ['PublicReservoir'],
  });
  return {
    actions: [action(0), action(1)],
    capturedResponses: [
      {
        adapterAlias: 'adapter_a',
        parsedProposal: 'contribute_water:PublicReservoir:1',
        residentId: 'resident-0',
        responseHash: digestLabel('captured-response-0'),
        responseId: 'response-0',
      },
      {
        adapterAlias: 'adapter_b',
        parsedProposal: 'contribute_water:PublicReservoir:2',
        residentId: 'resident-1',
        responseHash: digestLabel('captured-response-1'),
        responseId: 'response-1',
      },
    ],
    challengeManifestHash: digestLabel('challenge-manifest'),
    emergencyStop: {
      args: { residentId: 'resident-0' },
      authorization: {
        decisionReceiptId: 'decision-stop',
        nonce: 'authorization-nonce-stop',
        safetyReceiptId: 'safety-stop',
        sequence: 0,
        turnOpportunityId: 'turn-stop',
      },
      entrypoint: 'freeze_run',
      expectedAllowed: true,
      expectedFinalState: {
        ...world,
        emergencyStopState: 'triggered',
        phase: 'frozen',
      },
      expectedOutcome: 'run_frozen',
      scheduleEntryId: 'schedule-stop',
      targetIds: ['EmergencyStop'],
    },
    expectedFinalState: world,
    metricSpecHash: digestLabel('metric-spec'),
    runId: 'mv-phase0b-tracer-001',
    schema: 'hololand.model-village-phase0b-run-manifest.v1',
    sources: {
      behaviorSourceHash: digestLabel('behavior-source'),
      manifestSourceHash: digestLabel('manifest-source'),
      planExecutionSourceHash: digestLabel('plan-execution-source'),
      planTemplateSourceHash: digestLabel('plan-template-source'),
      stopPlanSourceHash: digestLabel('stop-plan-source'),
      visibleWorldSourceHash: digestLabel('visible-world-source'),
      worldSourceHash: digestLabel('world-source'),
    },
    validatorPolicyVersion: 'runtime-injected-ed25519-v1',
  };
}

// ============================ WORKER SIDE ============================

/**
 * Custody worker: retry-open the shared sealed store until the exclusive lock
 * is acquired (or the deadline), then seal opsPerWorker unique objects and
 * close. A CustodyLockError is the EXPECTED serialization refusal — count it
 * and retry. Any other error (e.g. a CustodyIntegrityError = a corrupted/
 * forked chain) is fatal and surfaced to the parent.
 */
async function runCustodyWorker(job) {
  const {
    rootDir, operator, opsPerWorker, workerId, deadlineMs,
  } = job;
  const deadline = Date.now() + deadlineMs;
  let store = null;
  let refusedOpens = 0;
  for (;;) {
    try {
      store = openSealedCustodyStore({ rootDir, operator });
      break;
    } catch (error) {
      if (error && error.name === 'CustodyLockError') {
        refusedOpens += 1;
        if (Date.now() > deadline) {
          return {
            ok: false, timedOut: true, committed: 0, refusedOpens,
          };
        }
        await sleep(2 + Math.floor(Math.random() * 12));
        continue;
      }
      return {
        ok: false,
        committed: 0,
        refusedOpens,
        errorName: error && error.name ? error.name : 'Error',
        message: error && error.message ? error.message : String(error),
      };
    }
  }
  let committed = 0;
  try {
    for (let index = 0; index < opsPerWorker; index += 1) {
      store.sealObject({
        kind: 'contention-drill',
        label: `worker-${workerId}-op-${index}`,
        value: { nonce: randomUUID(), op: index, worker: workerId },
      });
      committed += 1;
    }
  } catch (error) {
    store.close();
    return {
      ok: false,
      committed,
      refusedOpens,
      errorName: error && error.name ? error.name : 'Error',
      message: error && error.message ? error.message : String(error),
    };
  }
  store.close();
  return {
    ok: true, timedOut: false, committed, refusedOpens,
  };
}

/**
 * Persistence worker: a single initializePersistentStore attempt against the
 * shared fresh storeDir. Exactly one worker wins; every other is cleanly
 * refused. "locked by another writer" is the withStoreLock EEXIST refusal;
 * "already exists" is the post-lock genesis guard — both are the serialization
 * property, so both are reported ok:true with a typed outcome.
 */
function runPersistenceWorker(job) {
  const shared = JSON.parse(readFileSync(job.sharedFile, 'utf8'));
  try {
    initializePersistentStore({
      initialWorld: shared.initialWorld,
      storeDir: job.storeDir,
      trustedValidatorConfig: shared.trustedValidatorConfig,
      validatorReceipt: shared.validatorReceipt,
    });
    return { ok: true, outcome: 'initialized' };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (/locked by another writer/.test(message)) {
      return { ok: true, outcome: 'locked', message };
    }
    if (/already exists/.test(message)) {
      return { ok: true, outcome: 'exists', message };
    }
    return {
      ok: false,
      outcome: 'error',
      errorName: error && error.name ? error.name : 'Error',
      message,
    };
  }
}

/**
 * Control worker: BYPASS the store entirely and raw-append one forging
 * access-log entry at a fixed sequence/prevHash — exactly what a second
 * unsynchronized (lock-less) writer sharing the tail state would emit. Two of
 * these produce a genuine fork the chain validator must reject.
 */
function runControlForkWorker(job) {
  const unsigned = {
    at: job.at,
    operation: 'read',
    operator: job.operator,
    prevEntryHash: job.forgePrevHash,
    schema: CUSTODY_ACCESS_LOG_ENTRY_SCHEMA,
    sequence: job.forgeSequence,
  };
  const entryHash = canonicalDigest(unsigned);
  rawAppendLine(job.accessLogPath, canonicalJson({ ...unsigned, entryHash }));
  return { ok: true, appended: true };
}

async function workerMain(jobFile) {
  let result;
  try {
    const job = JSON.parse(readFileSync(jobFile, 'utf8'));
    if (job.kind === 'custody') result = await runCustodyWorker(job);
    else if (job.kind === 'persistence') result = runPersistenceWorker(job);
    else if (job.kind === 'control-fork') result = runControlForkWorker(job);
    else result = { ok: false, message: `unknown worker kind ${job.kind}` };
  } catch (error) {
    result = {
      ok: false,
      errorName: error && error.name ? error.name : 'Error',
      message: error && error.message ? error.message : String(error),
    };
  }
  process.stdout.write(JSON.stringify(result));
  process.exit(result && result.ok === false ? 1 : 0);
}

// ============================ PARENT SIDE ============================

function spawnWorker(job, jobFile, spawnedPids) {
  return new Promise((resolve) => {
    writeFileSync(jobFile, JSON.stringify(job), 'utf8');
    const child = spawn(process.execPath, [SELF_PATH, '--worker', jobFile], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const pid = child.pid;
    if (pid) spawnedPids.add(pid);
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', (error) => {
      if (pid) spawnedPids.delete(pid);
      resolve({
        pid, code: -1, parsed: null, stderr: String(error),
      });
    });
    child.on('close', (code) => {
      if (pid) spawnedPids.delete(pid);
      let parsed = null;
      try {
        parsed = JSON.parse(out.trim());
      } catch {
        parsed = null;
      }
      resolve({
        pid, code, parsed, stderr: err.trim(),
      });
    });
  });
}

function spawnWorkerBatch(jobs, jobDir, spawnedPids) {
  return Promise.all(
    jobs.map((job, index) => spawnWorker(
      job,
      path.join(jobDir, `job-${job.kind}-${index}.json`),
      spawnedPids,
    )),
  );
}

async function runCustodyConfig(runDir, operator, workerCount, opsPerWorker, spawnedPids) {
  const rootDir = path.join(runDir, 'custody-store');
  // Create + close so the lock is released before workers race to open it.
  const seed = createSealedCustodyStore({
    operator,
    retentionPolicy: DRILL_RETENTION_POLICY,
    rootDir,
    runLabel: DRILL_RUN_LABEL,
  });
  seed.close();

  const jobs = Array.from({ length: workerCount }, (unused, workerId) => ({
    deadlineMs: WORKER_DEADLINE_MS,
    kind: 'custody',
    operator,
    opsPerWorker,
    rootDir,
    workerId,
  }));
  const results = await spawnWorkerBatch(jobs, runDir, spawnedPids);

  for (const result of results) {
    if (result.parsed && result.parsed.errorName === 'CustodyIntegrityError') {
      throw new ModelVillageContentionDrillError(
        `a custody worker observed a corrupted/forked chain UNDER the lock — `
        + `serialization was violated: ${result.parsed.message}`,
      );
    }
    if (result.parsed && result.parsed.timedOut) {
      throw new ModelVillageContentionDrillError(
        'a custody worker timed out acquiring the exclusive lock',
      );
    }
    if (!result.parsed || result.parsed.ok !== true || result.code !== 0) {
      throw new ModelVillageContentionDrillError(
        `custody worker failed (code=${result.code}): `
        + `${(result.parsed && result.parsed.message) || result.stderr}`,
      );
    }
  }

  const opsCommitted = results.reduce((sum, r) => sum + r.parsed.committed, 0);
  const opsRefused = results.reduce((sum, r) => sum + r.parsed.refusedOpens, 0);

  // Read-only, non-appending verification of the FINAL chain.
  const audit = auditOpenCustodyStore({ rootDir });
  const chainCheck = audit.checks.find((check) => check.name === 'access-log-chain');
  const objectsCheck = audit.checks.find((check) => check.name === 'objects-content');
  const crossCheck = audit.checks.find((check) => check.name === 'objects-vs-seal-log');
  const finalChainLinear = Boolean(chainCheck && chainCheck.ok) && audit.ok;
  const finalChainLength = audit.accessLogLength;

  // Deterministic ground truth: 1 create entry + each worker's (1 open +
  // opsPerWorker seals). A fork or dropped entry breaks this exactly.
  const expectedChainLength = 1 + workerCount * (1 + opsPerWorker);

  if (opsCommitted !== workerCount * opsPerWorker) {
    throw new ModelVillageContentionDrillError(
      `opsCommitted ${opsCommitted} != expected ${workerCount * opsPerWorker}`,
    );
  }
  if (!finalChainLinear) {
    throw new ModelVillageContentionDrillError(
      `post-drill access-log chain is not linear — the lock failed to `
      + `serialize writers: ${chainCheck ? chainCheck.detail : 'no chain check'}`,
    );
  }
  if (finalChainLength !== expectedChainLength) {
    throw new ModelVillageContentionDrillError(
      `final chain length ${finalChainLength} != expected ${expectedChainLength}; `
      + 'a worker forked or dropped entries',
    );
  }
  if (!objectsCheck.ok || !crossCheck.ok) {
    throw new ModelVillageContentionDrillError(
      `post-drill object integrity failed: ${objectsCheck.detail}; ${crossCheck.detail}`,
    );
  }

  return {
    workerCount,
    opsPerWorker,
    opsCommitted,
    opsRefused,
    lockContentionObserved: opsRefused > 0,
    finalChainLinear,
    finalChainLength,
    accessLogTailHash: audit.accessLogTailHash,
  };
}

async function runPersistenceConfig(runDir, workerCount, spawnedPids) {
  const fixture = createRuntimeInjectedValidatorFixture();
  const validatorReceipt = fixture.issue(buildMinimalRunManifest());
  const initialWorld = {
    acceptedActionCount: 0,
    emergencyStopState: 'armed',
    phase: 'running',
    publicWaterUnits: 0,
  };
  const sharedFile = path.join(runDir, 'persistence-shared.json');
  writeFileSync(
    sharedFile,
    JSON.stringify({
      initialWorld,
      trustedValidatorConfig: fixture.config,
      validatorReceipt,
    }),
    'utf8',
  );
  const storeDir = path.join(runDir, 'persistence-store');
  const jobs = Array.from({ length: workerCount }, (unused, workerId) => ({
    kind: 'persistence',
    sharedFile,
    storeDir,
    workerId,
  }));
  const results = await spawnWorkerBatch(jobs, runDir, spawnedPids);

  const outcomes = results.map((r) => (r.parsed ? r.parsed.outcome : 'missing'));
  const initialized = outcomes.filter((o) => o === 'initialized').length;
  const refused = outcomes.filter((o) => o === 'locked' || o === 'exists').length;
  const unexpected = results.filter(
    (r) => !r.parsed
      || r.parsed.ok !== true
      || !['initialized', 'locked', 'exists'].includes(r.parsed.outcome),
  );
  if (unexpected.length > 0) {
    const first = unexpected[0];
    throw new ModelVillageContentionDrillError(
      `persistence worker produced an unexpected outcome: `
      + `${(first.parsed && first.parsed.message) || first.stderr}`,
    );
  }
  if (initialized !== 1) {
    throw new ModelVillageContentionDrillError(
      `withStoreLock did not serialize initialization: ${initialized} winners `
      + `(expected exactly 1); outcomes=${canonicalJson(outcomes)}`,
    );
  }

  let finalStateValid = false;
  let finalStateHash = null;
  try {
    const state = readPersistentState(storeDir);
    finalStateValid = true;
    finalStateHash = state.stateHash;
  } catch (error) {
    throw new ModelVillageContentionDrillError(
      `final persistent state did not validate: ${error.message}`,
    );
  }

  return {
    writerCount: workerCount,
    initialized,
    refused,
    serialized: initialized === 1,
    finalStateValid,
    finalStateHash,
    outcomes,
  };
}

/**
 * Non-vacuity control: build a fresh store, then spawn two lock-bypassing
 * children that raw-append forking entries at the same sequence. Confirm the
 * read-only chain check FLAGS the fork (finalChainLinear === false). If it did
 * not, the linear-chain assertion in the custody config would be vacuous.
 */
async function runControlConfig(runDir, operator, spawnedPids) {
  const rootDir = path.join(runDir, 'control-store');
  const seed = createSealedCustodyStore({
    operator,
    retentionPolicy: DRILL_RETENTION_POLICY,
    rootDir,
    runLabel: DRILL_RUN_LABEL,
  });
  seed.close();

  const before = auditOpenCustodyStore({ rootDir });
  if (!before.ok) {
    throw new ModelVillageContentionDrillError(
      `control seed store did not audit clean before fork injection: `
      + `${before.checks.filter((c) => !c.ok).map((c) => c.detail).join('; ')}`,
    );
  }
  const forgeSequence = before.accessLogLength + 1;
  const forgePrevHash = before.accessLogTailHash;
  const accessLogPath = path.join(rootDir, 'access-log.jsonl');
  const jobs = [
    {
      accessLogPath,
      at: '2026-07-27T00:00:00.001Z',
      forgePrevHash,
      forgeSequence,
      kind: 'control-fork',
      operator,
      workerId: 0,
    },
    {
      accessLogPath,
      at: '2026-07-27T00:00:00.002Z',
      forgePrevHash,
      forgeSequence,
      kind: 'control-fork',
      operator,
      workerId: 1,
    },
  ];
  const results = await spawnWorkerBatch(jobs, runDir, spawnedPids);
  for (const result of results) {
    if (!result.parsed || result.parsed.ok !== true) {
      throw new ModelVillageContentionDrillError(
        `control fork worker failed: ${(result.parsed && result.parsed.message) || result.stderr}`,
      );
    }
  }

  const after = auditOpenCustodyStore({ rootDir });
  const chainCheck = after.checks.find((check) => check.name === 'access-log-chain');
  const flagged = Boolean(chainCheck && chainCheck.ok === false);
  if (!flagged) {
    throw new ModelVillageContentionDrillError(
      'non-vacuity control FAILED: an unsynchronized forked chain was NOT '
      + 'flagged by the chain check — the linear-chain assertion is vacuous',
    );
  }
  return {
    forkInjected: true,
    finalChainLinear: Boolean(chainCheck && chainCheck.ok),
    flaggedByChainCheck: flagged,
    chainCheckDetail: chainCheck ? chainCheck.detail : null,
  };
}

/**
 * Run the full contention drill and return a signed receipt.
 *
 * @param {{ scratchRoot?: string, operator: string, workerCount: number,
 *   opsPerWorker: number }} args
 * @returns {Promise<{ receipt: object }>}
 */
export async function runContentionDrill({
  scratchRoot,
  operator,
  workerCount,
  opsPerWorker,
} = {}) {
  assertNonEmptyString(operator, 'operator');
  assertPositiveInteger(workerCount, 'workerCount', 2);
  assertPositiveInteger(opsPerWorker, 'opsPerWorker', 1);
  const baseRoot = scratchRoot ? path.resolve(scratchRoot) : os.tmpdir();
  const runDir = mkdtempSync(path.join(baseRoot, 'mv-contention-'));
  const spawnedPids = new Set();
  try {
    const custody = await runCustodyConfig(
      runDir, operator, workerCount, opsPerWorker, spawnedPids,
    );
    const persistence = await runPersistenceConfig(runDir, workerCount, spawnedPids);
    const control = await runControlConfig(runDir, operator, spawnedPids);

    const body = {
      schema: CONTENTION_DRILL_SCHEMA,
      engine: CONTENTION_DRILL_ENGINE,
      at: isoNow(),
      workerCount: custody.workerCount,
      opsPerWorker: custody.opsPerWorker,
      opsCommitted: custody.opsCommitted,
      opsRefused: custody.opsRefused,
      lockContentionObserved: custody.lockContentionObserved,
      finalChainLinear: custody.finalChainLinear,
      finalChainLength: custody.finalChainLength,
      accessLogTailHash: custody.accessLogTailHash,
      persistenceStoreLock: persistence,
      nonVacuityControl: control,
      claimBoundary: CONTENTION_DRILL_CLAIM_BOUNDARY,
    };
    const receipt = { ...body, receiptHash: canonicalDigest(body) };
    return { receipt };
  } finally {
    // Defense-in-depth: workers run to completion, but reap any survivor we
    // spawned before removing the scratch tree. Only our own tracked pids.
    for (const pid of spawnedPids) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already exited.
      }
    }
    rmSync(runDir, { force: true, recursive: true });
  }
}

/**
 * Structural + integrity validation of a contention-drill receipt: recompute
 * receiptHash and assert the load-bearing invariants hold. Throws
 * ModelVillageContentionDrillError on any malformed shape; returns true.
 */
export function verifyContentionDrillReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new ModelVillageContentionDrillError('receipt must be an object');
  }
  if (receipt.schema !== CONTENTION_DRILL_SCHEMA) {
    throw new ModelVillageContentionDrillError('receipt schema mismatch');
  }
  if (receipt.engine !== CONTENTION_DRILL_ENGINE) {
    throw new ModelVillageContentionDrillError('receipt engine mismatch');
  }
  const { receiptHash, ...body } = receipt;
  if (typeof receiptHash !== 'string' || canonicalDigest(body) !== receiptHash) {
    throw new ModelVillageContentionDrillError('receiptHash does not match its body');
  }
  if (receipt.finalChainLinear !== true) {
    throw new ModelVillageContentionDrillError('receipt.finalChainLinear must be true');
  }
  if (receipt.opsCommitted !== receipt.workerCount * receipt.opsPerWorker) {
    throw new ModelVillageContentionDrillError('receipt.opsCommitted is inconsistent');
  }
  if (!receipt.persistenceStoreLock || receipt.persistenceStoreLock.serialized !== true) {
    throw new ModelVillageContentionDrillError('persistence-store serialization not proven');
  }
  if (!receipt.nonVacuityControl || receipt.nonVacuityControl.flaggedByChainCheck !== true) {
    throw new ModelVillageContentionDrillError('non-vacuity control did not flag the fork');
  }
  return true;
}

// Worker entry point: only when invoked as `node <thisfile> --worker <jobFile>`.
// Imported as a library (tests, the drill parent), this block never runs.
const invokedAsMain = process.argv[1]
  && path.resolve(process.argv[1]) === SELF_PATH;
if (invokedAsMain && process.argv[2] === '--worker') {
  workerMain(process.argv[3]);
}
