#!/usr/bin/env node
/* global Buffer, URL, console, process */

// HoloLand Model Village MV-B2 live turn scheduler integration checker.
//
// ENGINEERING TRACER LANE, NOT the study lane. Residents resident-01..06 are
// engineering aliases mapped ROUND-ROBIN across the openly-declared certified
// sovereign routes from the frozen MV-B1 drill manifest; no blinded alias
// assignment is performed, claimed, or receipted here.
//
// ADMISSION-GATING DESIGN (load-bearing; stated on every receipt): a live
// model proposal NEVER becomes a world mutation directly. After the proposal
// barrier closes and adjudication runs, an ADMITTED proposal that EXACTLY
// matches the pre-authorized deterministic action (contribute_water ->
// commons_cistern, amount 1 -- the action already encoded in the frozen
// phase0b plan) GATES the execution of the existing deterministic V4 lane,
// and the action is committed from the VERIFIED V4 receipt through the
// existing atomic admission path. Admitted non-matches are receipted
// admitted_no_preauthorized_action and mutate nothing; denied proposals
// mutate nothing; a second admitted match in the same run is receipted
// preauthorized_action_already_committed and mutates nothing (the frozen
// plan pre-authorizes exactly one action per run). LIVE PROPOSALS GATE,
// DETERMINISTIC RECEIPTS MUTATE.
//
// Language boundary (spec HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md lines
// 106-108): this checker is orchestration, canonicalization, and
// verification only. The turn policy, snapshot fixture, pre-authorized
// catalog, routes, prompt, and vocabulary are canonical `.hs` source data.
//
// Public-receipt rule: the emitted receipt carries hashes, enums, and
// bounded projections only -- never raw model text (raw bytes live only in
// the per-run sealed custody stores).
//
// Two runs prove per-run isolation:
//   mv-b2-live-r1 -- LIVE sovereign routes (holoserve required, jetson
//                    optional-but-attempted; both endpoints are the frozen
//                    manifest-declared sovereign routes) unless --skip-live;
//   mv-b2-live-r2 -- in-process loopback stub routes ALWAYS (even in live
//                    mode; the same --skip-live offline convention as the
//                    shipped MV-B1 checker), proving multi-run isolation
//                    cheaply: the r1 run directory is byte-identical after
//                    r2 completes and cross-run custody reads are refused.
//
// LIVENESS IS MEASURED, NOT DECLARED. Whether run r1 actually reached the
// declared sovereign route is not read off the --skip-live flag: it is the
// three-state `claimBoundary.sovereignRouteTransport` verdict, derived from
// out-of-band node:diagnostics_channel undici send-path events (the observation
// is imported from the MV-B1 checker, not re-implemented). A run whose
// transport could not be observed is UNMEASURED and FAILS. See the block above
// TRANSPORT_REGION_KEYS for what this does and does not establish.

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  canonicalDigest,
  canonicalJson,
} from './model-village-phase0b-runtime.mjs';
// The sovereign-route transport OBSERVATION is shared with the MV-B1 gate on
// purpose: one implementation of the hard part, one place to attack. This gate
// imports it and never re-implements it. See the long comment block at
// scripts/check-hololand-model-village-adapter-custody.mjs:126 for the design,
// the two layers, and the residuals -- all of which apply here unchanged.
import {
  TRANSPORT_VERDICTS,
  buildTransportObservation,
  calibrateTransportObserver,
  createTransportObserver,
  deriveTransportVerdict,
} from './check-hololand-model-village-adapter-custody.mjs';
import {
  certifyLockedAdapterRoute,
  loadAdapterCustodyDrillManifest,
} from './model-village-adapter-runtime.mjs';
import {
  createTurnScheduler,
  loadTurnPolicyManifest,
  verifyRoundReceiptChain,
} from './model-village-turn-scheduler.mjs';
import {
  PREAUTHORIZED_ACTION_CATALOG,
  buildRefusedAdmissionReceipt,
  executeGatedAdmission,
  provisionIsolatedRun,
  verifyGatedAdmissionReceipt,
} from './model-village-admission-bridge.mjs';

export const TURN_SCHEDULER_RECEIPT_SCHEMA =
  'hololand.model-village-turn-scheduler.v1';

const DEFAULT_OUTPUT = path.join(
  '.tmp', 'hololand', 'model-village', 'turn-scheduler-receipt.json',
);
const DEFAULT_STORE_PARENT = path.join(
  '.tmp', 'hololand', 'model-village', 'turn-scheduler',
);
const OPERATOR = 'mv-b2-turn-scheduler-checker';
const LIVE_RUN_ID = 'mv-b2-live-r1';
const STUB_RUN_ID = 'mv-b2-live-r2';
// Loopback bind for the in-process offline stubs (MV-B1 checker convention).
const STUB_LOOPBACK_HOST = '127.0.0.1';
const RESIDENT_IDS = Object.freeze([
  'resident-01', 'resident-02', 'resident-03',
  'resident-04', 'resident-05', 'resident-06',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
// Disposable scratch stores the deterministic lane (tracer) leaves per gated
// execution; the checker owns cleanup of its OWN process's stores (same
// convention as the phase0b and admission-bridge test suites).
const TRACER_SCRATCH_SUBPATH = path.join(
  '.tmp', 'hololand', 'model-village', 'phase0b-runtime',
);
const TRACER_SCRATCH_PATTERN = new RegExp(
  '^(main|fault-before-rename|fault-after-rename|mismatch-target'
  + `|mismatch-state-hashes)-${process.pid}-`,
);

const RECEIPT_KEYS = Object.freeze([
  'claimBoundary',
  'generatedAt',
  'policyHash',
  'receiptHash',
  'runs',
  'schema',
  'vocabularyHash',
]);
const RUN_ENTRY_KEYS = Object.freeze([
  'actionDecisionReceipts',
  'barrierReceipt',
  'contaminationRegister',
  'custodyAccessLogEntryCount',
  'gatedAdmissionReceipts',
  'isolation',
  'residentRouteMapping',
  'routeCertifications',
  'routesStubbed',
  'runId',
  'runRootRelative',
  'safetyCheckReceipts',
]);
const ROUTE_CERTIFICATION_KEYS = Object.freeze([
  'certificationError',
  'certificationReceiptHash',
  'certified',
  'declaredEndpoint',
  'endpointUsed',
  'failureReason',
  'required',
  'routeId',
  'stubbed',
]);
const RESIDENT_MAPPING_KEYS = Object.freeze([
  'certificationReceiptHash',
  'residentId',
  'routeId',
]);
const ISOLATION_KEYS = Object.freeze([
  'crossRunCustodyReadRefused',
  'priorRunId',
  'priorRunRootHashAfter',
  'priorRunRootHashBefore',
  'priorRunUntouched',
]);
const CONTAMINATION_ENTRY_KEYS = Object.freeze(['at', 'detail', 'kind']);
// Every flag this lane must NEVER claim, pinned to its only legal value --
// the MV-B1 pinned set PLUS the four MV-B2 additions.
const PINNED_CLAIM_BOUNDARY_VALUES = Object.freeze({
  blindedAliasAssignmentClaimed: false,
  canonicalLaneProviderCallsIntroduced: 0,
  liveStudyRunClaimed: false,
  multiDayRunControlsClaimed: false,
  nativeLifecycleDispatchClaimed: false,
  openOutcomeCanonicalMutationClaimed: false,
  phase1AdmissionClaimed: false,
  processCrashDurabilityClaimed: false,
  productionValidatorCustodyClaimed: false,
  providerSamplingDeterminismClaimed: false,
  sealedAdapterAliasRouteAssignmentIncluded: false,
  sixResidentLiveStudyClaimed: false,
  sixResidentLiveTurnsClaimed: false,
});
const CLAIM_BOUNDARY_KEYS = Object.freeze([
  'notObserved',
  'observed',
  'sovereignRouteTransport',
  ...Object.keys(PINNED_CLAIM_BOUNDARY_VALUES),
]);

// ---------------------------------------------------------------------------
// Sovereign-route transport observation (ported from MV-B1, 2026-07-27).
//
// WHAT WAS WRONG HERE. `claimBoundary.liveSovereignRouteExercised` was
// `skipLive === false` -- a restatement of a CLI argument -- and the check that
// appeared to verify it compared it against `runs.some(run => run.live)`, where
// `run.live` was `!stubbed` and `stubbed` was that SAME `skipLive` input. The
// cross-check was `X === X`: it had zero detection power by construction, and
// no mutation to the runner could make the two sides disagree. EXECUTED at
// commit 804c511: overriding `globalThis.fetch` with a function that fabricates
// every health/models/chat response produced 22 fabricated calls, ZERO real
// sockets, `runs[0].live: true`, `liveSovereignRouteExercised: true`, and a
// receipt that self-verified ok -- the same adversary that motivated the MV-B1
// fix, reproduced against this gate.
//
// WHAT REPLACES IT. The MV-B1 out-of-band measurement, IMPORTED not copied:
// undici publishes node:diagnostics_channel events from inside its own send
// path carrying the real net.Socket, so a caller that merely returns fabricated
// data publishes nothing. Verdict is DERIVED = min() over measured conjuncts,
// three-state, and re-derived at verification time.
//
// SCOPE OF THE WINDOW. Only run r1 is measured. r2 is stub-by-construction in
// EVERY mode (it exists to prove per-run isolation, not liveness), so folding
// its loopback traffic into the window would only add noise. The window opens
// after calibration and closes the moment r1 returns.
//
// EVERY MV-B1 RESIDUAL APPLIES HERE UNCHANGED, including the OPEN one: an
// in-process caller that can supply a fabricated fetch can also publish forged
// diagnostics_channel messages and obtain MEASURED_LIVE_TRANSPORT with zero TCP
// connects. This is evidence against a NON-FORGING caller only. The residual
// list is inherited verbatim from the MV-B1 receipt rather than restated, so it
// cannot drift; two port-specific residuals are appended.
//
// ABSENT EVIDENCE BLOCKS. UNMEASURED is a FAILURE on both the run path and the
// --verify path (stricter than the MV-B1 gate, which warns on --verify). A run
// whose transport was never observed cannot reach any passing verdict at all,
// let alone the live one.
// ---------------------------------------------------------------------------

const TRANSPORT_REGION_KEYS = Object.freeze([
  'claimScope',
  'conjuncts',
  'declared',
  'observed',
  'residuals',
  'verdict',
]);
const TRANSPORT_CONJUNCT_KEYS = Object.freeze([
  'chatPathSentToDeclaredAuthority',
  'declaredAuthorityIsNotAnInProcessListener',
  'endpointUsedMatchesDeclared',
  'everySendToDeclaredOriginHitDeclaredSocket',
  'observerAccountConsistentWithDrill',
  'observerCalibrated',
  'requestSentToDeclaredSocketAddress',
  'requiredRouteTurnCompleted',
  'responseObservedFromDeclaredOrigin',
]);
const TRANSPORT_DECLARED_KEYS = Object.freeze([
  'requiredRouteAuthority',
  'requiredRouteId',
  'skipLiveRequested',
]);
const TRANSPORT_OBSERVED_KEYS = Object.freeze([
  'calibrationDetail',
  'chatPathRequestsToDeclaredAuthority',
  'drillWindowRequestCount',
  'inProcessListenerAuthorities',
  'observerCalibrated',
  'observerName',
  'requestsToDeclaredOrigin',
  'responseStatusesFromDeclaredOrigin',
  'socketAuthoritiesObserved',
]);
// The MV-B1 residual that names THIS file as an unported site is answered by
// this change. It is inherited verbatim anyway (provenance beats tidiness, and
// the MV-B1 checker is not edited from here), so the correction is appended as
// its own residual rather than by rewriting somebody else's text.
const PORT_RESIDUALS = Object.freeze([
  'PORT CORRECTION: the inherited MV-B1 residual that names scripts/check-hololand-model-village-turn-scheduler.mjs:1059 as an UNPORTED SITE is STALE as of this receipt -- the observation IS ported here, the self-scoring cross-check is deleted, and claimBoundary.liveSovereignRouteExercised no longer exists on this receipt. Still unported at time of writing: scripts/check-hololand-model-village-alias-custody.mjs, which continues to emit liveSovereignRouteExercised from its own skipLive input',
  'MEASURED WINDOW IS RUN r1 ONLY: mv-b2-live-r2 is stub-by-construction in every mode and is outside the observation window, so this verdict says nothing about r2 and r2 must never be cited for liveness. The in-process listener set does span both runs, which can only make the verdict more conservative, never less',
  'THE MEASURED ROUTE IS THE REQUIRED ROUTE ONLY: the optional route is attempted but its transport is not observed, so a run in which only the optional route was genuinely contacted would still be reported by the required route\'s conjuncts',
  'MODE CONSISTENCY WAS MISSING FROM THE FIRST PORT AND IS RESTORED (2026-07-28). The port brought the measurement and dropped MV-B1\'s two mode branches, so MEASURED_NO_LIVE_TRANSPORT passed in EVERY mode and the DEFAULT live lane could not fail for not being live. Exploited on the unmutated file with nothing but a caller-supplied fabricating fetch that forwarded calibration and issued one incidental real request to an unrelated loopback address: exit 0, verdict MEASURED_NO_LIVE_TRANSPORT, requestsToDeclaredOrigin 0, required route certified:true stubbed:false, receipt self-verifying, on a host where the true verdict was measurably MEASURED_LIVE_TRANSPORT. Both branches are now present at the emit path',
  'THE POSITIVE PATH IS NOW EXERCISED FROM THIS GATE (2026-07-28): a real sovereign holoserve on 127.0.0.1:8099 yields MEASURED_LIVE_TRANSPORT with 6 POSTs to the declared authority in the measured window, alongside MEASURED_NO_LIVE_TRANSPORT under --skip-live. The earlier residual saying this gate had only ever seen the measured-negative path is closed by execution',
  'DOCUMENTED GAP, NOT CLOSED: registerInProcessAuthority is called for the checker\'s own stub endpoints at scripts/check-hololand-model-village-turn-scheduler.mjs:556, and DELETING that call leaves both the gate (exit 0) and the 16-test suite green. That defense is therefore unexercised: the verify-time emptiness guard is satisfied by calibration alone, and the shipped manifest never binds a stub on the declared authority, so nothing today can reach it. It is counted as a defense while measuring nothing, and closing it needs a manifest whose stub and declared authority collide',
  'DOCUMENTED GAP, MEASURED AND SHADOWED: the routes-only refutation at scripts/check-hololand-model-village-turn-scheduler.mjs:1424-1433 (a receipt whose r1 was stubbed can never carry a live verdict) is UNREACHABLE and deleting it leaves gate and suite green. Executed 2026-07-28: flipping the verdict alone is caught by the verdict-vs-conjuncts re-derivation, and forcing every conjunct true to get past that is caught by conjuncts.endpointUsedMatchesDeclared disagreeing with the routes region -- because routesStubbed:true forces stubbed route certifications. The PROPERTY (a stubbed run cannot be laundered into a live verdict) is real and is now pinned by an executed test naming both dominating arms; the refutation line itself is credited with nothing. The emit/verify cross-check over requiredRouteTurnCompleted likewise remains a TAMPER check, not a second measurement, as stated in the code',
]);

export class TurnSchedulerCheckError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TurnSchedulerCheckError';
  }
}

function fail(message) {
  throw new TurnSchedulerCheckError(message);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    const missingKeys = expected.filter((key) => !actual.includes(key));
    const unexpected = actual.filter((key) => !expected.includes(key));
    fail(
      `${label} keys differ; missing=${canonicalJson(missingKeys)} `
      + `unexpected=${canonicalJson(unexpected)}`,
    );
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be lowercase sha256 hex`);
  }
}

function normalizePath(root, target) {
  const relative = path.relative(root, target);
  const chosen = relative.startsWith('..') ? target : relative;
  return chosen.split(path.sep).join('/');
}

function runTimestamp() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-p${process.pid}`;
}

/**
 * host:port for an endpoint, with the scheme default filled in -- the same
 * normalization the MV-B1 observation uses, so a declared endpoint and an
 * observed socket address compare on equal terms.
 */
function endpointAuthority(endpoint) {
  const url = new URL(endpoint);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  return `${url.hostname}:${port}`;
}

/**
 * The required route's turn COMPLETED when at least one resident mapped to that
 * route produced a safety-passing adjudicable turn. Computed ONLY from the run
 * entry's own receipted regions (residentRouteMapping + safetyCheckReceipts),
 * never from a runner variable -- so verification re-derives the identical
 * value from the receipt and a transport conjunct that disagrees with the runs
 * it was supposedly measured against is caught rather than believed.
 */
function requiredRouteTurnCompleted(run, requiredRouteId) {
  const residentsOnRequiredRoute = new Set(
    (Array.isArray(run?.residentRouteMapping) ? run.residentRouteMapping : [])
      .filter((entry) => entry?.routeId === requiredRouteId)
      .map((entry) => entry?.residentId),
  );
  return (Array.isArray(run?.safetyCheckReceipts) ? run.safetyCheckReceipts : [])
    .some((receipt) => receipt?.passed === true
      && residentsOnRequiredRoute.has(receipt?.residentId));
}

function countJsonlLines(filePath) {
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .length;
}

/**
 * Deterministic content hash of an entire directory tree (sorted relative
 * paths + file bytes). Byte-identical trees hash equal; any created,
 * deleted, or rewritten file changes the hash. This is the cross-run
 * isolation probe: run r1's tree must hash identically before and after
 * run r2 executes end to end.
 */
function hashDirectoryTree(rootDir) {
  const hash = createHash('sha256');
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const fullPath = path.join(dir, entry);
      const relative = path.relative(rootDir, fullPath).replaceAll('\\', '/');
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        hash.update(`D:${relative}\n`);
        walk(fullPath);
      } else {
        hash.update(`F:${relative}:${stats.size}\n`);
        hash.update(readFileSync(fullPath));
      }
    }
  };
  walk(rootDir);
  return hash.digest('hex');
}

function cleanOwnTracerScratch(resolvedRoot) {
  const scratchRoot = path.join(resolvedRoot, TRACER_SCRATCH_SUBPATH);
  if (!existsSync(scratchRoot)) return;
  for (const entry of readdirSync(scratchRoot)) {
    if (TRACER_SCRATCH_PATTERN.test(entry)) {
      rmSync(path.join(scratchRoot, entry), { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// --skip-live / r2 stub: one in-process OpenAI-compatible node:http server
// per route on the loopback interface (ephemeral port), the same offline
// convention as the MV-B1 checker. Payloads embed the routeId so routes seal
// distinct bytes. The first (required-twin) route proposes the exact
// pre-authorized catalog action; the second abstains (vocabulary-valid but
// NOT pre-authorized) so the offline lane exercises admit+match,
// admit+non-match, and already-committed refusals in one round.
// ---------------------------------------------------------------------------

function stubChatContent(routeId, proposalKind) {
  if (proposalKind === 'contribute') {
    return JSON.stringify({
      action: 'contribute_water',
      target: 'commons_cistern',
      amount: 1,
      reason: `stub tracer contribution (${routeId})`,
    });
  }
  return JSON.stringify({
    action: 'abstain',
    target: null,
    amount: null,
    reason: `stub tracer abstention (${routeId})`,
  });
}

function startTurnStub(route, proposalKind) {
  const { routeId } = route;
  const server = createServer((req, res) => {
    const respond = (status, payload) => {
      const body = Buffer.from(JSON.stringify(payload), 'utf8');
      res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': body.length,
      });
      res.end(body);
    };
    req.on('data', () => {});
    req.on('end', () => {
      if (req.method === 'GET' && req.url === route.healthPath) {
        respond(200, {
          process_instance_id: `stub-${routeId}`,
          status: 'ok',
          stub: true,
          version: `0.0.0-stub-${routeId}`,
        });
        return;
      }
      if (req.method === 'GET' && req.url === route.modelsPath) {
        respond(200, {
          data: [{ id: `stub-model-${routeId}`, object: 'model' }],
          object: 'list',
        });
        return;
      }
      if (req.method === 'POST' && req.url === route.chatPath) {
        respond(200, {
          choices: [{
            finish_reason: 'stop',
            index: 0,
            message: {
              content: stubChatContent(routeId, proposalKind),
              role: 'assistant',
            },
          }],
          id: `chatcmpl-stub-${routeId}`,
          model: `stub-model-${routeId}`,
          object: 'chat.completion',
          usage: { completion_tokens: 24, prompt_tokens: 96, total_tokens: 120 },
        });
        return;
      }
      respond(404, { error: 'not found' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, STUB_LOOPBACK_HOST, () => {
      const { port } = server.address();
      resolve({
        endpoint: `http://${STUB_LOOPBACK_HOST}:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// One complete run: provision -> certify -> six residents round-robin ->
// turn round (snapshot freeze, bounded concurrency, barrier, adjudication)
// -> gated admissions -> access-log count -> teardown -> isolation evidence.
// ---------------------------------------------------------------------------

async function executeOneRun({
  runId,
  stubbed,
  policyBundle,
  drillBundle,
  storeParent,
  resolvedRoot,
  failures,
  priorRun = null,
  // Every loopback listener THIS process binds is registered here, so the
  // transport observation can refuse to call "reaching the declared authority"
  // evidence of anything when the declared authority is our own stub.
  registerInProcessAuthority = () => {},
}) {
  const context = provisionIsolatedRun({
    hololandRoot: resolvedRoot,
    operator: OPERATOR,
    runId,
    scratchRoot: storeParent,
  });
  const runRoot = path.resolve(storeParent, runId);
  // Per-run isolation marker: a custody object that exists ONLY in this
  // run's sealed store. The next run proves cross-run isolation by having
  // its own store REFUSE to read this custodyId.
  const marker = context.custodyStore.sealObject({
    bytes: Buffer.from(`mv-b2 run isolation marker ${runId}`, 'utf8'),
    kind: 'mv-b2-run-isolation-marker',
    label: `${runId}:isolation-marker`,
  });

  const routeCertifications = [];
  const residentRouteMapping = [];
  const certifiedRoutes = [];
  const gatedAdmissionReceipts = [];
  const stubs = [];
  let round = null;
  let custodyAccessLogEntryCount = 0;
  let crossRunCustodyReadRefused = null;

  try {
    // (c) Certify routes through the MV-B1 seam. LIVE mode contacts the two
    // openly-declared sovereign routes (holoserve required, jetson
    // optional-but-attempted); stub mode serves both from loopback stubs.
    for (const [routeIndex, route] of drillBundle.routes.entries()) {
      let effectiveRoute = { ...route, ceilings: { ...route.ceilings } };
      if (stubbed) {
        const stub = await startTurnStub(
          route,
          routeIndex === 0 ? 'contribute' : 'abstain',
        );
        stubs.push(stub);
        registerInProcessAuthority(endpointAuthority(stub.endpoint));
        effectiveRoute = { ...effectiveRoute, endpoint: stub.endpoint };
      }
      const entry = {
        certificationError: null,
        certificationReceiptHash: null,
        certified: false,
        declaredEndpoint: route.endpoint,
        endpointUsed: effectiveRoute.endpoint,
        failureReason: null,
        required: route.required,
        routeId: route.routeId,
        stubbed,
      };
      try {
        const certification = await certifyLockedAdapterRoute({
          custodyStore: context.custodyStore,
          drill: drillBundle,
          operator: OPERATOR,
          priorReceiptHash: drillBundle.manifestHash,
          route: effectiveRoute,
        });
        entry.certified = certification.certified === true;
        entry.failureReason = certification.failureReason ?? null;
        entry.certificationReceiptHash = certification.receiptHash;
        if (entry.certified) {
          certifiedRoutes.push({
            certification,
            route: effectiveRoute,
            routeId: route.routeId,
          });
        }
      } catch (error) {
        entry.certificationError = error?.message ?? String(error);
      }
      if (route.required && entry.certified !== true) {
        failures.push(
          `[${runId}] required route ${route.routeId} did not certify `
          + `(${entry.failureReason ?? entry.certificationError})`,
        );
      }
      routeCertifications.push(entry);
    }
    if (certifiedRoutes.length === 0) {
      fail(
        `[${runId}] no route certified; the turn round cannot execute `
        + '(the required sovereign holoserve route must be reachable at its '
        + 'manifest-declared endpoint)',
      );
    }

    // Six residents, ROUND-ROBIN across the certified routes. This is the
    // openly-declared engineering mapping (receipted below), NOT a blinded
    // alias assignment. If only one route certifies, all six ride it.
    const residents = RESIDENT_IDS.map((residentId, index) => {
      const pick = certifiedRoutes[index % certifiedRoutes.length];
      residentRouteMapping.push({
        certificationReceiptHash: pick.certification.receiptHash,
        residentId,
        routeId: pick.routeId,
      });
      return {
        certification: pick.certification,
        residentId,
        route: pick.route,
      };
    });

    // (d) One scheduler round under the frozen policy: frozen snapshot
    // distribution, bounded concurrency, zero retry, proposal barrier,
    // default-deny adjudication. The scheduler emits receipts only.
    const scheduler = createTurnScheduler({
      custodyStore: context.custodyStore,
      operator: OPERATOR,
      policyBundle,
      residents,
    });
    round = await scheduler.executeTurnRound({
      priorReceiptHash: policyBundle.policyHash,
      publicSnapshot: JSON.parse(policyBundle.snapshotFixture.publicState),
      runId,
    });

    const chainCheck = verifyRoundReceiptChain({
      actionDecisionReceipts: round.actionDecisionReceipts,
      barrierReceipt: round.barrierReceipt,
      safetyCheckReceipts: round.safetyCheckReceipts,
    });
    if (!chainCheck.ok) {
      failures.push(
        `[${runId}] round receipt chain invalid: ${chainCheck.failureReason}`,
      );
    }
    if (round.barrierReceipt.frozen === true) {
      failures.push(
        `[${runId}] round froze on contamination: `
        + round.contaminationRegister.map((entry) => entry.kind).join(', '),
      );
    } else {
      const counts = round.barrierReceipt.resolvedCounts;
      const totalResolved = counts.completed + counts.failed + counts.timedOut;
      if (totalResolved !== residents.length) {
        failures.push(
          `[${runId}] barrier resolved ${totalResolved} turns for `
          + `${residents.length} residents`,
        );
      }
    }

    // Gated admissions -- LIVE PROPOSALS GATE, DETERMINISTIC RECEIPTS
    // MUTATE. The admission chain continues the round chain: the first
    // gated receipt chains from the LAST adjudication receipt (the barrier
    // hash when a frozen round produced none), so admission is provably
    // after the barrier closed and after adjudication completed.
    let admissionPrior = round.actionDecisionReceipts.length > 0
      ? round.actionDecisionReceipts[
        round.actionDecisionReceipts.length - 1
      ].receiptHash
      : round.barrierReceipt.barrierHash;
    let committed = false;
    for (const decision of round.actionDecisionReceipts) {
      const isCatalogMatch = decision.decision === 'admit'
        && decision.preauthorizedMatch === true;
      let outcome;
      if (isCatalogMatch && committed) {
        // The frozen plan pre-authorizes exactly ONE deterministic action
        // per run; further admitted matches are receipted refusals with NO
        // mutation (never a second V4 execution attempt).
        outcome = {
          admitted: false,
          receipt: buildRefusedAdmissionReceipt({
            actionDecisionReceiptHash: decision.receiptHash,
            policyHash: policyBundle.policyHash,
            priorReceiptHash: admissionPrior,
            refusalClass: 'preauthorized_action_already_committed',
            residentId: decision.residentId,
            runId,
            vocabularyHash: policyBundle.vocabularyHash,
          }),
        };
      } else {
        outcome = await executeGatedAdmission({
          actionDecisionReceipt: decision,
          expectedPolicyHash: policyBundle.policyHash,
          expectedVocabularyHash: policyBundle.vocabularyHash,
          operator: OPERATOR,
          preauthorizedCatalogEntry: PREAUTHORIZED_ACTION_CATALOG[0],
          priorReceiptHash: admissionPrior,
          runId,
          storeContext: context,
        });
        if (outcome.admitted === true) committed = true;
      }
      const admissionCheck = verifyGatedAdmissionReceipt(outcome.receipt);
      if (!admissionCheck.ok) {
        failures.push(
          `[${runId}] gated admission receipt for ${decision.residentId} `
          + `invalid: ${admissionCheck.failureReason}`,
        );
      }
      gatedAdmissionReceipts.push(outcome.receipt);
      admissionPrior = outcome.receipt.receiptHash;
    }
    const matchCount = round.actionDecisionReceipts.filter(
      (decision) =>
        decision.decision === 'admit' && decision.preauthorizedMatch === true,
    ).length;
    const admittedCount = gatedAdmissionReceipts.filter(
      (receipt) => receipt.admitted === true,
    ).length;
    if (admittedCount !== (matchCount > 0 ? 1 : 0)) {
      failures.push(
        `[${runId}] exactly-one-commit violated: ${admittedCount} `
        + `deterministic-lane commits for ${matchCount} catalog matches`,
      );
    }

    // Cross-run custody isolation probe: this run's sealed store must
    // refuse the PRIOR run's isolation-marker custodyId.
    if (priorRun) {
      crossRunCustodyReadRefused = false;
      try {
        context.custodyStore.readObject(priorRun.markerCustodyId);
      } catch {
        crossRunCustodyReadRefused = true;
      }
      if (crossRunCustodyReadRefused !== true) {
        failures.push(
          `[${runId}] cross-run custody read was NOT refused `
          + `(read ${priorRun.runId}'s isolation marker)`,
        );
      }
    }

    custodyAccessLogEntryCount = countJsonlLines(
      path.join(context.custodyDir, 'access-log.jsonl'),
    );
  } finally {
    context.teardown();
    for (const stub of stubs) await stub.close();
  }

  // Isolation evidence, computed AFTER this run has fully completed
  // (teardown included): the prior run's directory tree must be
  // byte-identical to its post-run snapshot.
  let isolation = null;
  if (priorRun) {
    const priorRunRootHashAfter = hashDirectoryTree(priorRun.runRoot);
    isolation = {
      crossRunCustodyReadRefused,
      priorRunId: priorRun.runId,
      priorRunRootHashAfter,
      priorRunRootHashBefore: priorRun.rootHashBefore,
      priorRunUntouched: priorRunRootHashAfter === priorRun.rootHashBefore,
    };
    if (isolation.priorRunUntouched !== true) {
      failures.push(
        `[${runId}] prior run ${priorRun.runId} directory changed during `
        + 'this run (cross-run state leak)',
      );
    }
  }

  return {
    custodyAccessLogEntryCount,
    gatedAdmissionReceipts,
    isolation,
    markerCustodyId: marker.custodyId,
    residentRouteMapping,
    round,
    routeCertifications,
    // CONFIGURATION, NOT A CLAIM. This records which endpoints the run was
    // pointed at; it says nothing about whether bytes crossed a socket. The
    // liveness claim lives in claimBoundary.sovereignRouteTransport and is
    // derived from measured sockets, never from this field or its input.
    routesStubbed: stubbed === true,
    runId,
    runRoot,
  };
}

// ---------------------------------------------------------------------------
// Check execution.
// ---------------------------------------------------------------------------

export async function runTurnSchedulerCheck({
  root = process.cwd(),
  output = DEFAULT_OUTPUT,
  storeRoot = null,
  skipLive = false,
} = {}) {
  const resolvedRoot = path.resolve(root);
  // (a) Load and pin both frozen manifests: the MV-B2 turn policy bundle
  // (policyHash) and the MV-B1 drill manifest (routes/prompt/vocabulary).
  const policyBundle = await loadTurnPolicyManifest({
    hololandRoot: resolvedRoot,
  });
  const drillBundle = await loadAdapterCustodyDrillManifest({
    hololandRoot: resolvedRoot,
  });

  const storeParent = storeRoot
    ? path.resolve(resolvedRoot, storeRoot)
    : path.resolve(resolvedRoot, DEFAULT_STORE_PARENT, runTimestamp());
  mkdirSync(storeParent, { recursive: true });

  const failures = [];
  const runResults = [];
  // Transport observation. The observer subscribes BEFORE anything runs;
  // calibration proves it can see this process's own transport through the
  // exact fetch the drill will use, and only then does the r1 window open.
  const observer = createTransportObserver();
  const inProcessListenerAuthorities = new Set();
  const registerInProcessAuthority = (authority) => {
    inProcessListenerAuthorities.add(authority);
  };
  let calibration = {
    authority: null,
    detail: 'calibration did not run',
    ok: false,
  };
  let drillWindow = { responses: [], sent: [] };
  try {
    calibration = await calibrateTransportObserver(observer, globalThis.fetch);
    if (typeof calibration.authority === 'string') {
      registerInProcessAuthority(calibration.authority);
    }

    // (b)-(d) Run 1: LIVE sovereign routes unless --skip-live. This is the
    // ONLY measured window.
    const mark = observer.mark();
    const firstRun = await executeOneRun({
      drillBundle,
      failures,
      policyBundle,
      registerInProcessAuthority,
      resolvedRoot,
      runId: LIVE_RUN_ID,
      storeParent,
      stubbed: skipLive,
    });
    drillWindow = observer.since(mark);
    runResults.push(firstRun);

    // (e) Run 2: stub routes ALWAYS (even in live mode) -- multi-run
    // isolation proven cheaply against run 1's completed directory tree.
    // Outside the measured window by design; its stub authorities are still
    // registered, which can only make the r1 verdict more conservative.
    const secondRun = await executeOneRun({
      drillBundle,
      failures,
      policyBundle,
      priorRun: {
        markerCustodyId: firstRun.markerCustodyId,
        rootHashBefore: hashDirectoryTree(firstRun.runRoot),
        runId: firstRun.runId,
        runRoot: firstRun.runRoot,
      },
      registerInProcessAuthority,
      resolvedRoot,
      runId: STUB_RUN_ID,
      storeParent,
      stubbed: true,
    });
    runResults.push(secondRun);
  } finally {
    observer.stop();
    cleanOwnTracerScratch(resolvedRoot);
  }

  const runs = runResults.map((result) => ({
    actionDecisionReceipts: result.round.actionDecisionReceipts,
    barrierReceipt: result.round.barrierReceipt,
    contaminationRegister: result.round.contaminationRegister,
    custodyAccessLogEntryCount: result.custodyAccessLogEntryCount,
    gatedAdmissionReceipts: result.gatedAdmissionReceipts,
    isolation: result.isolation,
    residentRouteMapping: result.residentRouteMapping,
    routeCertifications: result.routeCertifications,
    routesStubbed: result.routesStubbed,
    runId: result.runId,
    runRootRelative: normalizePath(resolvedRoot, result.runRoot),
    safetyCheckReceipts: result.round.safetyCheckReceipts,
  }));

  // (f) Sovereign-route transport verdict for run r1, DERIVED from measured
  // sockets. Nothing below reads skipLive: the only place it appears is the
  // explicitly non-load-bearing `declared.skipLiveRequested` breadcrumb, which
  // no verdict branch consults.
  const requiredRoute = drillBundle.routes.find((route) => route.required);
  if (!requiredRoute) fail('drill manifest declares no required route');
  const measuredRun = runs[0];
  const requiredEntry = measuredRun.routeCertifications.find(
    (entry) => entry.routeId === requiredRoute.routeId,
  );
  const baseTransport = buildTransportObservation({
    calibration,
    drillWindow,
    inProcessListenerAuthorities,
    requiredEntry: requiredEntry
      ? {
        declaredEndpoint: requiredEntry.declaredEndpoint,
        endpointUsed: requiredEntry.endpointUsed,
        // MV-B1 has one turn; MV-B2 has six residents round-robin, so the
        // required route's turn "completed" when at least one resident
        // mapped to it produced a safety-passing adjudicable turn. That is
        // recomputable from the receipt's own routes/mapping/safety regions,
        // which is what verification re-derives it from.
        turn: {
          turnCompleted: requiredRouteTurnCompleted(
            measuredRun,
            requiredRoute.routeId,
          ),
        },
      }
      : null,
    requiredRoute,
    skipLive,
  });
  const sovereignRouteTransport = {
    ...baseTransport,
    residuals: [...baseTransport.residuals, ...PORT_RESIDUALS],
  };

  // (g) Claim boundary: what this tracer observed, what it does not claim,
  // and the pinned never-claim flags (MV-B1 set plus the MV-B2 additions).
  const claimBoundary = {
    observed: [
      'runtime-issued turn opportunities with per-resident nonce and expiry, an in-run replay registry, and exactly one opportunity per resident per round',
      'frozen-snapshot distribution: one hash-pinned public snapshot for every resident, recomputed before each dispatch and again before adjudication',
      'bounded concurrency under the frozen concurrency+timeout policy with the measured high-water mark receipted in the proposal barrier',
      'proposal barrier closed before any adjudication or admission: safety and decision receipts chain from the barrier hash, gated admissions chain from the end of the adjudication chain',
      'default-deny adjudication receipts pinning the policy hash, proposal hash, and action-vocabulary hash',
      'gated admission where ONLY the deterministic V4 lane mutates: live proposals gate, deterministic receipts mutate; admitted non-matches, denials, and already-committed matches are receipted refusals with zero side effects',
      'per-run isolation: a fresh persistent store and fresh sealed custody store per runId; the prior run directory is byte-identical after the second run and cross-run custody reads are refused',
      'zero retry by construction: exactly one model-turn executor invocation per resident',
      'sovereign-route transport for run r1, MEASURED out of band from node:diagnostics_channel undici send-path events rather than declared: see claimBoundary.sovereignRouteTransport for the verdict, its conjuncts, and its residuals -- assumes a NON-ADVERSARIAL in-process caller',
    ],
    notObserved: [
      'live study run',
      'Phase 1 admission or readiness',
      'blinded alias assignment (residents map to openly-declared engineering routes; the sealed adapter_a/adapter_b/adapter_c alias-to-route assignment is out of scope)',
      'native lifecycle execution',
      'open-outcome canonical mutation (the headless plan schema requires the outcome up front; the open-outcome tier is a seeded future slice: idea-seeds/2026-07-26-open-outcome-receipt-tier.md)',
      'multi-day run controls',
      'six-resident live study (this is an engineering tracer; residents are engineering aliases)',
      'production validator custody',
      'process-crash durability',
      'provider sampling determinism (temperature zero is not a determinism receipt)',
      'sovereign-route transport for run r2 (stub-by-construction in every mode, outside the measured window) and for the optional route in either run',
      'the identity of whatever peer holds the declared address, and any resistance to a caller that forges the observation itself (see sovereignRouteTransport.residuals)',
    ],
    sovereignRouteTransport,
    ...PINNED_CLAIM_BOUNDARY_VALUES,
  };

  const unsigned = {
    schema: TURN_SCHEDULER_RECEIPT_SCHEMA,
    generatedAt: new Date().toISOString(),
    policyHash: policyBundle.policyHash,
    vocabularyHash: policyBundle.vocabularyHash,
    runs,
    claimBoundary,
  };
  const receipt = { ...unsigned, receiptHash: canonicalDigest(unsigned) };

  const resolvedOutput = path.resolve(resolvedRoot, output);
  mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(receipt, null, 2)}\n`);

  // ABSENT EVIDENCE BLOCKS. UNMEASURED is not a soft "we could not tell" --
  // it means the observer could not prove it sees this process's own transport,
  // or its account contradicts the drill's. Neither the live nor the not-live
  // conclusion is available, so the gate goes RED rather than resolving to the
  // convenient answer. A count of zero over zero attempts is vacuous.
  if (sovereignRouteTransport.verdict === TRANSPORT_VERDICTS.unmeasured) {
    failures.push(
      'sovereign-route transport is UNMEASURED for '
      + `${LIVE_RUN_ID}; absent evidence blocks, so this run may claim neither `
      + 'live nor not-live transport. calibration: '
      + `${sovereignRouteTransport.observed.calibrationDetail}; drill-window `
      + 'requests on real sockets: '
      + `${sovereignRouteTransport.observed.drillWindowRequestCount}`,
    );
  } else if (skipLive && sovereignRouteTransport.verdict !== TRANSPORT_VERDICTS.notLive) {
    // MODE CONSISTENCY. Ported from the MV-B1 gate
    // (check-hololand-model-village-adapter-custody.mjs:980-992) on 2026-07-28.
    // The first port of this observation brought the measurement and dropped
    // these two branches, which left the observation as instrumentation rather
    // than a gate: MEASURED_NO_LIVE_TRANSPORT passed in EVERY mode, so the
    // DEFAULT (live) lane could not fail for not being live. A caller-supplied
    // fabricating fetch that forwarded calibration and made one incidental real
    // request to an unrelated loopback address reached exit 0 with the required
    // route recorded certified/not-stubbed, zero packets to the sovereign route,
    // and a self-verifying signed receipt -- on a host where the true verdict
    // was measurably MEASURED_LIVE_TRANSPORT. No forged diagnostics_channel
    // messages were needed; one extra fetch was enough, because
    // observerAccountConsistentWithDrill was the only load-bearing condition.
    failures.push(
      `--skip-live must measure ${TRANSPORT_VERDICTS.notLive}; measured `
      + `${sovereignRouteTransport.verdict}`,
    );
  } else if (!skipLive && sovereignRouteTransport.verdict !== TRANSPORT_VERDICTS.live) {
    failures.push(
      `the live lane requires ${TRANSPORT_VERDICTS.live}; measured `
      + `${sovereignRouteTransport.verdict}. Failed conjuncts: `
      + `${Object.entries(sovereignRouteTransport.conjuncts)
        .filter(([, value]) => value !== true)
        .map(([name]) => name)
        .join(', ') || 'none'}`,
    );
  }

  const verification = verifyTurnSchedulerReceipt(receipt);
  if (!verification.ok) {
    failures.push(
      `emitted receipt failed self-verification: ${verification.failureReason}`,
    );
  }

  if (failures.length > 0) {
    throw new TurnSchedulerCheckError(
      `Model Village turn scheduler check failed: ${failures.join('; ')}. `
      + `Receipt: ${resolvedOutput}`,
    );
  }

  return { output: resolvedOutput, receipt, rounds: runResults };
}

// ---------------------------------------------------------------------------
// Receipt verification (closed keys, schema pin, pinned claim boundary,
// nested chain verification, gated-admission pairing and chain binding,
// isolation evidence, self-hash recompute).
// ---------------------------------------------------------------------------

function verifyRunEntry(run, index, receipt) {
  const label = `receipt.runs[${index}]`;
  assertExactKeys(run, RUN_ENTRY_KEYS, label);
  assertNonEmptyString(run.runId, `${label}.runId`);
  if (!run.runId.startsWith('mv-b2-')) {
    fail(`${label}.runId must use the engineering lane mv-b2- prefix`);
  }
  if (typeof run.routesStubbed !== 'boolean') {
    fail(`${label}.routesStubbed must be boolean`);
  }
  assertNonEmptyString(run.runRootRelative, `${label}.runRootRelative`);
  if (
    !Number.isInteger(run.custodyAccessLogEntryCount)
    || run.custodyAccessLogEntryCount < 1
  ) {
    fail(`${label}.custodyAccessLogEntryCount must be a positive integer`);
  }

  if (
    !Array.isArray(run.routeCertifications)
    || run.routeCertifications.length === 0
  ) {
    fail(`${label}.routeCertifications must be a non-empty array`);
  }
  const certifiedByRoute = new Map();
  let requiredCount = 0;
  run.routeCertifications.forEach((entry, certIndex) => {
    const certLabel = `${label}.routeCertifications[${certIndex}]`;
    assertExactKeys(entry, ROUTE_CERTIFICATION_KEYS, certLabel);
    assertNonEmptyString(entry.routeId, `${certLabel}.routeId`);
    assertNonEmptyString(entry.declaredEndpoint, `${certLabel}.declaredEndpoint`);
    assertNonEmptyString(entry.endpointUsed, `${certLabel}.endpointUsed`);
    if (typeof entry.required !== 'boolean') {
      fail(`${certLabel}.required must be boolean`);
    }
    if (typeof entry.certified !== 'boolean') {
      fail(`${certLabel}.certified must be boolean`);
    }
    if (entry.stubbed !== run.routesStubbed) {
      fail(`${certLabel}.stubbed must equal ${label}.routesStubbed`);
    }
    if (entry.required) requiredCount += 1;
    if (entry.certified) {
      assertSha256(
        entry.certificationReceiptHash,
        `${certLabel}.certificationReceiptHash`,
      );
      certifiedByRoute.set(entry.routeId, entry.certificationReceiptHash);
    }
  });
  if (requiredCount < 1) {
    fail(`${label}.routeCertifications must include a required route`);
  }

  if (
    !Array.isArray(run.residentRouteMapping)
    || run.residentRouteMapping.length === 0
  ) {
    fail(`${label}.residentRouteMapping must be a non-empty array`);
  }
  run.residentRouteMapping.forEach((entry, mapIndex) => {
    const mapLabel = `${label}.residentRouteMapping[${mapIndex}]`;
    assertExactKeys(entry, RESIDENT_MAPPING_KEYS, mapLabel);
    assertNonEmptyString(entry.residentId, `${mapLabel}.residentId`);
    if (!certifiedByRoute.has(entry.routeId)) {
      fail(`${mapLabel}.routeId ${entry.routeId} is not a certified route`);
    }
    if (entry.certificationReceiptHash !== certifiedByRoute.get(entry.routeId)) {
      fail(`${mapLabel} does not bind its route's certification receipt`);
    }
  });

  // Barrier + adjudication chain (the shared MV-B2 chain verifier), then
  // the receipt-level pins the chain verifier does not know about.
  const chainCheck = verifyRoundReceiptChain({
    actionDecisionReceipts: run.actionDecisionReceipts,
    barrierReceipt: run.barrierReceipt,
    safetyCheckReceipts: run.safetyCheckReceipts,
  });
  if (!chainCheck.ok) {
    fail(`${label} round chain invalid: ${chainCheck.failureReason}`);
  }
  if (run.barrierReceipt.runId !== run.runId) {
    fail(`${label}.barrierReceipt.runId does not bind this run`);
  }
  if (
    run.barrierReceipt.policyHash !== receipt.policyHash
    || run.barrierReceipt.priorReceiptHash !== receipt.policyHash
  ) {
    fail(`${label}.barrierReceipt does not pin/chain from the policy hash`);
  }
  for (const safety of run.safetyCheckReceipts) {
    if (safety.vocabularyHash !== receipt.vocabularyHash) {
      fail(`${label} safety receipt does not pin the vocabulary hash`);
    }
  }
  for (const decision of run.actionDecisionReceipts) {
    if (
      decision.policyHash !== receipt.policyHash
      || decision.vocabularyHash !== receipt.vocabularyHash
    ) {
      fail(`${label} decision receipt does not pin the policy/vocabulary hash`);
    }
  }

  if (!Array.isArray(run.contaminationRegister)) {
    fail(`${label}.contaminationRegister must be an array`);
  }
  run.contaminationRegister.forEach((entry, contaminationIndex) => {
    assertExactKeys(
      entry,
      CONTAMINATION_ENTRY_KEYS,
      `${label}.contaminationRegister[${contaminationIndex}]`,
    );
  });

  // Gated admissions: one receipt per decision receipt, chained from the
  // END of the adjudication chain (barrier hash when a frozen round emitted
  // no adjudication receipts), paired by decision hash and resident, and
  // committing through the deterministic lane EXACTLY once iff an admitted
  // catalog match exists.
  if (!Array.isArray(run.gatedAdmissionReceipts)) {
    fail(`${label}.gatedAdmissionReceipts must be an array`);
  }
  if (run.gatedAdmissionReceipts.length !== run.actionDecisionReceipts.length) {
    fail(`${label} gated admission receipts do not pair 1:1 with decisions`);
  }
  let admissionPrior = run.actionDecisionReceipts.length > 0
    ? run.actionDecisionReceipts[
      run.actionDecisionReceipts.length - 1
    ].receiptHash
    : run.barrierReceipt.barrierHash;
  let admittedCount = 0;
  let matchCount = 0;
  run.gatedAdmissionReceipts.forEach((admission, admissionIndex) => {
    const admissionLabel = `${label}.gatedAdmissionReceipts[${admissionIndex}]`;
    const admissionCheck = verifyGatedAdmissionReceipt(admission);
    if (!admissionCheck.ok) {
      fail(`${admissionLabel} invalid: ${admissionCheck.failureReason}`);
    }
    const decision = run.actionDecisionReceipts[admissionIndex];
    if (
      admission.runId !== run.runId
      || admission.residentId !== decision.residentId
      || admission.actionDecisionReceiptHash !== decision.receiptHash
    ) {
      fail(`${admissionLabel} does not bind its decision receipt`);
    }
    if (admission.priorReceiptHash !== admissionPrior) {
      fail(`${admissionLabel} breaks the admission chain`);
    }
    admissionPrior = admission.receiptHash;
    const isCatalogMatch = decision.decision === 'admit'
      && decision.preauthorizedMatch === true;
    if (isCatalogMatch) matchCount += 1;
    if (admission.admitted === true) {
      admittedCount += 1;
      if (!isCatalogMatch) {
        fail(`${admissionLabel} admitted without an admitted catalog match`);
      }
    } else if (decision.decision === 'deny') {
      if (
        !['barrier_frozen', 'decision_denied'].includes(admission.refusalClass)
      ) {
        fail(`${admissionLabel} denied decision has the wrong refusal class`);
      }
    } else if (!isCatalogMatch) {
      if (
        !['barrier_frozen', 'no_preauthorized_match']
          .includes(admission.refusalClass)
      ) {
        fail(`${admissionLabel} non-match admission has the wrong refusal class`);
      }
    } else if (
      !['barrier_frozen', 'preauthorized_action_already_committed']
        .includes(admission.refusalClass)
    ) {
      fail(
        `${admissionLabel} refused catalog match has the wrong refusal class`,
      );
    }
  });
  if (admittedCount > 1) {
    fail(`${label} committed the deterministic lane more than once`);
  }
  if (matchCount > 0 && admittedCount !== 1) {
    fail(
      `${label} has admitted catalog matches but `
      + `${admittedCount} deterministic-lane commits`,
    );
  }

  // Isolation evidence: absent on the first run, mandatory afterwards.
  if (index === 0) {
    if (run.isolation !== null) {
      fail(`${label}.isolation must be null for the first run`);
    }
  } else {
    assertExactKeys(run.isolation, ISOLATION_KEYS, `${label}.isolation`);
    assertSha256(
      run.isolation.priorRunRootHashBefore,
      `${label}.isolation.priorRunRootHashBefore`,
    );
    assertSha256(
      run.isolation.priorRunRootHashAfter,
      `${label}.isolation.priorRunRootHashAfter`,
    );
    if (
      run.isolation.priorRunUntouched !== true
      || run.isolation.priorRunRootHashBefore
        !== run.isolation.priorRunRootHashAfter
    ) {
      fail(`${label}.isolation does not prove the prior run untouched`);
    }
    if (run.isolation.crossRunCustodyReadRefused !== true) {
      fail(`${label}.isolation does not prove cross-run custody refusal`);
    }
    if (run.isolation.priorRunId !== receipt.runs[index - 1].runId) {
      fail(`${label}.isolation.priorRunId does not bind the prior run`);
    }
  }
}

/**
 * Verifies the sovereign-route transport region. This CANNOT re-run the
 * observation, so it does the two things that are available to it:
 *
 *   1. RE-DERIVES the verdict from the recorded conjuncts, so a stored verdict
 *      that was edited (or emitted by a future code path that computed it some
 *      other way) does not survive --verify; and
 *   2. CROSS-CHECKS the conjuncts against regions of the receipt that were
 *      written by a DIFFERENT producer -- the routes region, the resident
 *      mapping, and the safety receipts -- so the conjuncts cannot be their own
 *      only evidence.
 *
 * BE PRECISE ABOUT WHAT (2) IS WORTH. Inside the emitting process the same
 * helpers produce and re-derive those values, so (2) is a TAMPER and
 * FOREIGN-RECEIPT check, not an independent second measurement. It catches an
 * edited receipt, a re-signed forgery, and a receipt whose transport region was
 * copied from a different run; it does NOT catch a mis-derivation shared by
 * both sides. The load-bearing non-vacuity evidence is the pair of EXECUTED
 * adversary runs in the test file, and the inherited residual that says a
 * receipt proves internal consistency rather than a replayed measurement.
 *
 * UNMEASURED fails here too, not just on the run path: a receipt whose
 * transport was never observed is not a valid receipt to cite.
 */
function verifyTransportRegion(receipt) {
  const label = 'receipt.claimBoundary.sovereignRouteTransport';
  const transport = receipt.claimBoundary.sovereignRouteTransport;
  assertExactKeys(transport, TRANSPORT_REGION_KEYS, label);
  assertNonEmptyString(transport.claimScope, `${label}.claimScope`);
  assertExactKeys(transport.conjuncts, TRANSPORT_CONJUNCT_KEYS, `${label}.conjuncts`);
  assertExactKeys(transport.declared, TRANSPORT_DECLARED_KEYS, `${label}.declared`);
  assertExactKeys(transport.observed, TRANSPORT_OBSERVED_KEYS, `${label}.observed`);
  if (!Array.isArray(transport.residuals) || transport.residuals.length === 0) {
    fail(`${label}.residuals must be a non-empty array`);
  }
  for (const item of transport.residuals) {
    assertNonEmptyString(item, `${label}.residuals entry`);
  }
  for (const key of TRANSPORT_CONJUNCT_KEYS) {
    if (typeof transport.conjuncts[key] !== 'boolean') {
      fail(`${label}.conjuncts.${key} must be boolean`);
    }
  }

  const { conjuncts, declared, observed } = transport;
  // (1) The verdict is DERIVED, never stored as an independent fact.
  const rederived = deriveTransportVerdict(conjuncts);
  if (transport.verdict !== rederived) {
    fail(
      `${label}.verdict is ${canonicalJson(transport.verdict)} but the `
      + `recorded conjuncts derive ${canonicalJson(rederived)}`,
    );
  }
  if (transport.verdict === TRANSPORT_VERDICTS.unmeasured) {
    fail(
      `${label} is UNMEASURED: the observation could not run or its account `
      + 'contradicts the drill, so this receipt establishes neither live nor '
      + `not-live transport (${observed.calibrationDetail})`,
    );
  }

  // (2) Cross-checks against regions written by a different producer.
  const measuredRun = receipt.runs[0];
  if (!measuredRun || measuredRun.runId !== LIVE_RUN_ID) {
    fail(`${label} must be measured against ${LIVE_RUN_ID} as receipt.runs[0]`);
  }
  const requiredEntries = measuredRun.routeCertifications
    .filter((entry) => entry.required === true);
  if (requiredEntries.length !== 1) {
    fail(
      `${label} needs exactly one required route in ${LIVE_RUN_ID}; found `
      + `${requiredEntries.length}`,
    );
  }
  const [requiredEntry] = requiredEntries;
  if (declared.requiredRouteId !== requiredEntry.routeId) {
    fail(`${label}.declared.requiredRouteId does not bind the required route`);
  }
  if (
    declared.requiredRouteAuthority
    !== endpointAuthority(requiredEntry.declaredEndpoint)
  ) {
    fail(
      `${label}.declared.requiredRouteAuthority does not match the required `
      + "route's declared endpoint",
    );
  }
  if (
    conjuncts.endpointUsedMatchesDeclared
    !== (requiredEntry.endpointUsed === requiredEntry.declaredEndpoint)
  ) {
    fail(
      `${label}.conjuncts.endpointUsedMatchesDeclared disagrees with the `
      + 'routes region',
    );
  }
  if (
    conjuncts.requiredRouteTurnCompleted
    !== requiredRouteTurnCompleted(measuredRun, requiredEntry.routeId)
  ) {
    fail(
      `${label}.conjuncts.requiredRouteTurnCompleted disagrees with the `
      + "measured run's resident mapping and safety receipts",
    );
  }
  if (conjuncts.observerCalibrated !== (observed.observerCalibrated === true)) {
    fail(`${label}.conjuncts.observerCalibrated disagrees with the observation`);
  }
  if (!Array.isArray(observed.inProcessListenerAuthorities)) {
    fail(`${label}.observed.inProcessListenerAuthorities must be an array`);
  }
  if (
    conjuncts.declaredAuthorityIsNotAnInProcessListener
    !== !observed.inProcessListenerAuthorities.includes(
      declared.requiredRouteAuthority,
    )
  ) {
    fail(
      `${label}.conjuncts.declaredAuthorityIsNotAnInProcessListener disagrees `
      + 'with the recorded in-process listeners',
    );
  }
  // A calibrated observer bound its own loopback listener, so an empty set is
  // internally impossible and would mean the register was suppressed.
  if (
    conjuncts.observerCalibrated
    && observed.inProcessListenerAuthorities.length === 0
  ) {
    fail(
      `${label}.observed.inProcessListenerAuthorities is empty on a calibrated `
      + 'observer, which cannot happen: calibration binds a loopback listener',
    );
  }
  if (
    !Number.isInteger(observed.drillWindowRequestCount)
    || observed.drillWindowRequestCount < 0
  ) {
    fail(`${label}.observed.drillWindowRequestCount must be a non-negative integer`);
  }
  if (
    conjuncts.observerAccountConsistentWithDrill === false
    && observed.drillWindowRequestCount !== 0
  ) {
    fail(`${label}.conjuncts.observerAccountConsistentWithDrill is unexplained`);
  }
  // A stubbed run can never have exercised the declared sovereign route: the
  // routes region alone refutes a live verdict, independently of the observer.
  if (
    transport.verdict === TRANSPORT_VERDICTS.live
    && measuredRun.routesStubbed === true
  ) {
    fail(
      `${label}.verdict is MEASURED_LIVE_TRANSPORT but ${LIVE_RUN_ID} ran `
      + 'against in-process stub routes',
    );
  }
}

export function verifyTurnSchedulerReceipt(receipt) {
  try {
    assertExactKeys(receipt, RECEIPT_KEYS, 'turn scheduler receipt');
    if (receipt.schema !== TURN_SCHEDULER_RECEIPT_SCHEMA) {
      fail(`receipt schema must be '${TURN_SCHEDULER_RECEIPT_SCHEMA}'`);
    }
    assertNonEmptyString(receipt.generatedAt, 'receipt.generatedAt');
    assertSha256(receipt.policyHash, 'receipt.policyHash');
    assertSha256(receipt.vocabularyHash, 'receipt.vocabularyHash');

    assertExactKeys(
      receipt.claimBoundary,
      CLAIM_BOUNDARY_KEYS,
      'receipt.claimBoundary',
    );
    for (const [key, pinned] of Object.entries(PINNED_CLAIM_BOUNDARY_VALUES)) {
      if (receipt.claimBoundary[key] !== pinned) {
        fail(
          `receipt.claimBoundary.${key} must be ${canonicalJson(pinned)} `
          + '(never-claim flag)',
        );
      }
    }
    // The withdrawn claim must stay withdrawn: a receipt that reintroduces the
    // flag-derived boolean is rejected outright rather than silently accepted
    // alongside the measured verdict.
    if ('liveSovereignRouteExercised' in receipt.claimBoundary) {
      fail(
        'receipt.claimBoundary.liveSovereignRouteExercised was withdrawn (it '
        + 'restated a CLI flag); use claimBoundary.sovereignRouteTransport',
      );
    }
    for (const listName of ['observed', 'notObserved']) {
      const list = receipt.claimBoundary[listName];
      if (!Array.isArray(list) || list.length === 0) {
        fail(`receipt.claimBoundary.${listName} must be a non-empty array`);
      }
      for (const item of list) {
        assertNonEmptyString(item, `receipt.claimBoundary.${listName} entry`);
      }
    }

    if (!Array.isArray(receipt.runs) || receipt.runs.length === 0) {
      fail('receipt.runs must be a non-empty array');
    }
    receipt.runs.forEach((run, index) => verifyRunEntry(run, index, receipt));
    verifyTransportRegion(receipt);

    const { receiptHash, ...unsigned } = receipt;
    assertSha256(receiptHash, 'receipt.receiptHash');
    if (canonicalDigest(unsigned) !== receiptHash) {
      fail('receipt.receiptHash does not recompute');
    }
    return { ok: true, failureReason: null };
  } catch (error) {
    return { ok: false, failureReason: error?.message ?? String(error) };
  }
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    root: process.cwd(),
    output: DEFAULT_OUTPUT,
    storeRoot: null,
    skipLive: false,
    verify: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') args.root = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--store-root') args.storeRoot = argv[++index];
    else if (arg === '--skip-live') args.skipLive = true;
    else if (arg === '--verify') args.verify = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand Model Village MV-B2 live turn scheduler check

Usage:
  node scripts/check-hololand-model-village-turn-scheduler.mjs [options]

Options:
  --root <path>        HoloLand repository root
  --output <path>      Receipt output path
  --store-root <path>  Parent directory for the per-run isolated stores
  --skip-live          Run mv-b2-live-r1 against in-process loopback stubs
                       instead of the declared sovereign routes; mv-b2-live-r2
                       uses stubs in EVERY mode. This flag does NOT set the
                       liveness claim -- claimBoundary.sovereignRouteTransport
                       is measured from real socket events either way, and an
                       unobservable run fails as UNMEASURED
  --verify <path>      Verify an existing receipt file and exit
  --json               Print the bounded receipt as JSON
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function describeRun(run) {
  const lines = [];
  const barrier = run.barrierReceipt;
  lines.push(
    `run ${run.runId} `
    + `(${run.routesStubbed ? 'loopback stubs' : 'declared sovereign routes'}):`,
  );
  for (const entry of run.routeCertifications) {
    lines.push(
      `  route ${entry.routeId} (${entry.required ? 'required' : 'optional'}): `
      + (entry.certified
        ? `certified via ${entry.endpointUsed}`
        : `NOT certified (${entry.failureReason ?? entry.certificationError})`),
    );
  }
  for (const [index, decision] of run.actionDecisionReceipts.entries()) {
    const admission = run.gatedAdmissionReceipts[index];
    const outcome = admission.admitted === true
      ? 'gated deterministic-lane COMMIT'
      : `refused (${admission.refusalClass})`;
    lines.push(
      `  ${decision.residentId}: ${decision.decision}`
      + `${decision.preauthorizedMatch ? ' [preauthorized-match]' : ''} `
      + `(${decision.reason}) -> ${outcome}`,
    );
  }
  const admitted = run.gatedAdmissionReceipts
    .filter((receipt) => receipt.admitted === true).length;
  lines.push(`  gated admissions committed: ${admitted}`);
  lines.push(
    `  concurrency high-water mark: ${barrier.concurrencyHighWaterMark}`,
  );
  lines.push(
    `  barrier resolved counts: completed=${barrier.resolvedCounts.completed} `
    + `failed=${barrier.resolvedCounts.failed} `
    + `timedOut=${barrier.resolvedCounts.timedOut} frozen=${barrier.frozen}`,
  );
  lines.push(
    `  custody access-log entries: ${run.custodyAccessLogEntryCount}`,
  );
  if (run.isolation) {
    lines.push(
      `  isolation vs ${run.isolation.priorRunId}: `
      + `priorRunUntouched=${run.isolation.priorRunUntouched} `
      + `crossRunCustodyReadRefused=${run.isolation.crossRunCustodyReadRefused}`,
    );
  }
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs();
    if (args.verify) {
      const receipt = JSON.parse(
        readFileSync(path.resolve(args.root, args.verify), 'utf8'),
      );
      const verification = verifyTurnSchedulerReceipt(receipt);
      if (!verification.ok) {
        console.error('[hololand-model-village-turn-scheduler] verify FAILED');
        console.error(verification.failureReason);
        process.exit(1);
      }
      console.log('[hololand-model-village-turn-scheduler] verify ok');
      console.log(`receiptHash: ${receipt.receiptHash}`);
    } else {
      const { receipt, output } = await runTurnSchedulerCheck(args);
      if (args.json) {
        console.log(JSON.stringify(receipt, null, 2));
      } else {
        console.log('[hololand-model-village-turn-scheduler] ok');
        console.log(`receipt: ${output}`);
        console.log(`policyHash: ${receipt.policyHash}`);
        console.log(`vocabularyHash: ${receipt.vocabularyHash}`);
        for (const run of receipt.runs) console.log(describeRun(run));
        const transport = receipt.claimBoundary.sovereignRouteTransport;
        console.log(
          `sovereign-route transport (${LIVE_RUN_ID}): ${transport.verdict}`,
        );
        console.log(
          `  observer: ${transport.observed.observerName}; calibration: `
          + `${transport.observed.calibrationDetail}`,
        );
        console.log(
          `  ${transport.observed.drillWindowRequestCount} request(s) on real `
          + 'sockets in the measured window, '
          + `${transport.observed.chatPathRequestsToDeclaredAuthority} of them `
          + `POSTs to ${transport.declared.requiredRouteAuthority}`,
        );
        console.log(
          '  claim scope and residuals: see '
          + 'claimBoundary.sovereignRouteTransport (this is evidence against a '
          + 'NON-forging in-process caller only)',
        );
        console.log(
          'live study run: not claimed (engineering tracer lane; live '
          + 'proposals gate, deterministic receipts mutate)',
        );
      }
    }
  } catch (error) {
    console.error('[hololand-model-village-turn-scheduler] failed');
    console.error(error.message || error);
    process.exit(1);
  }
}
