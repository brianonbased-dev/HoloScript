#!/usr/bin/env node
/* global AbortSignal, Buffer, URL, console, process */

// HoloLand Model Village MV-B1 adapter + custody integration checker.
//
// ENGINEERING CERTIFICATION LANE (drill), NOT the study lane. Routes are
// declared openly by the frozen drill manifest; the sealed
// adapter_a/adapter_b/adapter_c alias-to-route assignment is explicitly OUT
// of scope and is never performed, claimed, or receipted here.
//
// Language boundary (spec HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md lines
// 106-108): this checker is JavaScript transport/canonicalize/verify only.
// The prompt, vocabulary, and route declarations are canonical `.hs` source
// data; certification and turn behavior live in the adapter runtime; sealed
// byte custody lives in the custody store. This file orchestrates and
// verifies; it authors no resident reasoning, treatments, or scoring.
//
// Public-receipt rule (spec lines 288-289): the emitted receipt carries
// hashes and bounded summaries only. Raw prompts, raw responses, and raw
// model text live exclusively in the sealed custody store.

import { createHash } from 'node:crypto';
import diagnosticsChannel from 'node:diagnostics_channel';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  canonicalDigest,
  canonicalJson,
} from './model-village-phase0b-runtime.mjs';
import {
  certifyLockedAdapterRoute,
  executeCertifiedModelTurn,
  loadAdapterCustodyDrillManifest,
  verifyAdapterCertificationReceipt,
  verifyModelTurnReceipt,
} from './model-village-adapter-runtime.mjs';
import {
  createSealedCustodyStore,
} from './model-village-custody-store.mjs';

export const ADAPTER_CUSTODY_RECEIPT_SCHEMA =
  'hololand.model-village-adapter-custody.v1';

const DEFAULT_OUTPUT = path.join(
  '.tmp', 'hololand', 'model-village', 'adapter-custody-receipt.json',
);
const DEFAULT_STORE_PARENT = path.join(
  '.tmp', 'hololand', 'model-village', 'adapter-custody',
);
const OPERATOR = 'mv-b1-adapter-custody-checker';
const RETENTION_POLICY_ID = 'mv-b1-drill-retention-v1';
const RETENTION_DESCRIPTION =
  'Engineering certification drill custody store: bounded drill artifacts '
  + 'only; deletable at any time via content-key destruction with a '
  + 'nonidentifying tombstone.';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const RECEIPT_KEYS = Object.freeze([
  'accessLogEntryCount',
  'claimBoundary',
  'custodyDrills',
  'drillId',
  'generatedAt',
  'manifestHash',
  'receiptHash',
  'routes',
  'schema',
  'storeManifestHash',
]);
const ROUTE_ENTRY_KEYS = Object.freeze([
  'certification',
  'certificationError',
  'declaredEndpoint',
  'endpointUsed',
  'required',
  'routeId',
  'turn',
  'turnError',
  'turnSkippedReason',
]);
const CUSTODY_DRILLS_KEYS = Object.freeze([
  'allOk',
  'backup',
  'backupVerify',
  'deletion',
  'deletionStoreRoot',
  'integrity',
  'readBackReplay',
  'storeRoot',
]);
const CLAIM_BOUNDARY_KEYS = Object.freeze([
  'blindedAliasAssignmentClaimed',
  'canonicalLaneProviderCallsIntroduced',
  'liveStudyRunClaimed',
  'notObserved',
  'observed',
  'phase1AdmissionClaimed',
  'processCrashDurabilityClaimed',
  'productionValidatorCustodyClaimed',
  'providerSamplingDeterminismClaimed',
  'sealedAdapterAliasRouteAssignmentIncluded',
  'sixResidentLiveTurnsClaimed',
  'sovereignRouteTransport',
]);
// Every flag this lane must NEVER claim, pinned to its only legal value.
const PINNED_CLAIM_BOUNDARY_VALUES = Object.freeze({
  blindedAliasAssignmentClaimed: false,
  canonicalLaneProviderCallsIntroduced: 0,
  liveStudyRunClaimed: false,
  phase1AdmissionClaimed: false,
  processCrashDurabilityClaimed: false,
  productionValidatorCustodyClaimed: false,
  providerSamplingDeterminismClaimed: false,
  sealedAdapterAliasRouteAssignmentIncluded: false,
  sixResidentLiveTurnsClaimed: false,
});

// ---------------------------------------------------------------------------
// Sovereign-route transport observation (DEFECT B fix).
//
// WHAT WAS WRONG. `liveSovereignRouteExercised: skipLive === false` restated a
// CLI flag. It was an assertion about INTENT, derived from the same input that
// set it, so it could not be false while the flag was absent. An adversary who
// passed a fabricated `fetchImpl` obtained certified:true,
// liveSovereignRouteExercised:true, latencyMs 1, modelIdReported
// "TOTALLY-NOT-A-REAL-MODEL", a self-verifying receipt and exit 0, with ZERO
// network calls. Nothing in the receipt was derived from the transport.
//
// WHAT REPLACES IT. An out-of-band measurement. undici publishes
// node:diagnostics_channel events from inside its own send path, carrying the
// real net.Socket, so for a caller that merely *returns fabricated data* the
// observation is out of reach: a fetch stub that answers from a canned object
// publishes nothing, whatever it returns.
//
// CORRECTED 2026-07-27 — WHAT THIS SEAM DOES *NOT* DO. An earlier version of
// this comment said the channel was "NOT reachable through the `fetchImpl` seam
// the caller controls". That sentence was FALSE and it was the load-bearing
// sentence of the design, so it is recorded here rather than quietly deleted.
// node:diagnostics_channel does not authenticate publishers. A caller who is
// already allowed to supply `fetchImpl` can, in ~12 more lines and with no new
// capability, `diagnosticsChannel.channel('undici:client:sendHeaders').publish`
// a message carrying a plain object with `remoteAddress`/`remotePort` set to
// the declared authority, plus a matching `undici:request:headers` message, and
// obtain verdict MEASURED_LIVE_TRANSPORT with all nine conjuncts true and ZERO
// TCP connects. Both layers below fall to the same forgery — including
// calibration, which the forger simply publishes for as well. Hardening that
// inspects only the MESSAGE cannot fix this: `Object.create(net.Socket.prototype)`
// with own `remoteAddress`/`remotePort` passes an `instanceof` check too.
// No in-process observer can be sound against an in-process adversary; that is
// a property of the seam, not a bug that a future patch here closes. It is
// therefore stated in `claimScope` (this measurement assumes a NON-ADVERSARIAL
// in-process caller) and carried as an OPEN residual, not as an out-of-scope
// "larger attack". The layers below remain load-bearing against every
// non-forging adversary, and each of those was executed as a test.
//
// Two independent layers, because either one alone is defeatable:
//
//   1. CALIBRATION (positive control, guards against a SILENT OBSERVER). One
//      request through the SAME fetch function the drill will use, aimed at a
//      throwaway in-process loopback listener. Loopback and in-process on
//      purpose: the control must not depend on any external service being up,
//      and must not put drill traffic on a real endpoint. If the observer does
//      not record that request on a real socket, this process cannot observe
//      its own transport, and the verdict is UNMEASURED — never "not live" and
//      never "live". A blind observer must never read as a negative result, or
//      a future Node/undici channel rename silently turns this gate green.
//   2. PER-ROUTE OBSERVATION (carries the claim). Calibration proves only that
//      the observer works, never that the route was contacted. An adversary
//      who forwards the calibration URL to the real fetch and fabricates the
//      routes still records ZERO drill-window requests, which CONTRADICTS a
//      completed turn; a contradiction is not a measurement, so that is
//      reported UNMEASURED too.
//
// DETERMINISTIC, NOT PROBABILISTIC. undici publishes sendHeaders exactly once
// per request, synchronously on the send path — there is no sampling window to
// miss and therefore no per-trial detection probability to derive. The
// non-vacuity proof is the run-time calibration positive control plus the
// adversarial tests in the test file, not a trial count.
//
// The verdict is DERIVED = min() over measured conjuncts and is re-derived at
// verification time, so flipping a stored verdict does not survive --verify.
// What this still does NOT prove is enumerated in `residuals` on every emitted
// receipt; read that before quoting this field.
// ---------------------------------------------------------------------------

export const TRANSPORT_VERDICTS = Object.freeze({
  live: 'MEASURED_LIVE_TRANSPORT',
  notLive: 'MEASURED_NO_LIVE_TRANSPORT',
  unmeasured: 'UNMEASURED',
});
const TRANSPORT_VERDICT_VALUES = Object.freeze(Object.values(TRANSPORT_VERDICTS));

const TRANSPORT_OBSERVER_NAME =
  'node:diagnostics_channel undici:client:sendHeaders+undici:request:headers';
const TRANSPORT_CLAIM_SCOPE =
  'MEASURED, ASSUMING A NON-ADVERSARIAL IN-PROCESS CALLER: real HTTP requests '
  + 'left this process over real sockets to the manifest-declared route address, '
  + 'and responses arrived on them. NOT CLAIMED: that the peer holding that '
  + 'address is a genuine sovereign model server, nor anything about the content '
  + 'it returned; and NOT claimed against a caller who forges the observation '
  + 'itself — a caller that can supply fetchImpl can also publish the '
  + 'diagnostics_channel messages this observation reads, so the assumption in '
  + 'the first clause is load-bearing and is NOT closed (residual 3). Any '
  + 'process holding that host:port satisfies this observation. See residuals.';
const TRANSPORT_RESIDUALS = Object.freeze([
  'address occupancy is not identity: any process holding the declared host:port satisfies this observation, so a squatter or a stand-in server is indistinguishable here',
  'response CONTENT is unattested: modelIdReported, packageVersionReported, and processInstanceId stay revisionEvidence tier server-reported, never verified revision custody',
  'OPEN, NOT CLOSED, and it is the REPORTED adversary rather than a larger one: node:diagnostics_channel does not authenticate publishers, so the same caller-supplied fetchImpl that motivated this fix can publish forged undici:client:sendHeaders + undici:request:headers messages naming the declared authority and obtain MEASURED_LIVE_TRANSPORT with all nine conjuncts true and zero TCP connects (executed). Calibration falls to the identical forgery, so neither layer holds against it, and message-shape hardening does not help (Object.create(net.Socket.prototype) with own remoteAddress/remotePort satisfies instanceof). No in-process observer can be sound against an in-process adversary; this receipt is evidence against a NON-forging caller only. Seam: scripts/check-hololand-model-village-adapter-custody.mjs:311 and :327 (the two subscribe handlers) and :393 (the calibration predicate)',
  'the observed socket and the sealed custody bytes are not cryptographically bound to each other; this measures that transport happened, not that these exact bytes crossed it',
  'concurrent drills share one process-wide observation window, so another drill contacting the same declared authority would be counted here',
  'verification re-derives the verdict from the recorded conjuncts and cross-checks them against the routes region; it cannot re-run the observation, so a receipt proves internal consistency, not a replayed measurement',
  'UNPORTED SITES, named because a sibling gate still publishes the field this one removed: scripts/check-hololand-model-village-turn-scheduler.mjs:1059 cross-checks receipt.claimBoundary.liveSovereignRouteExercised against runs.some(run => run.live), and run.live is itself set from that runner\'s skipLive input — the cross-check therefore scores its own input (W.890 self-scoring), and docs/reports/HOLOLAND_MODEL_VILLAGE_MV_B2_TURN_SCHEDULER_2026-07-26.md:110 publishes liveSovereignRouteExercised=true from it. That claim is NOT backed by any transport observation and must not be cited as one until this observation is ported there',
]);

const CALIBRATION_PATH = '/__mv-b1-transport-observer-calibration';
const CALIBRATION_TIMEOUT_MS = 5000;
// The positive control binds the loopback interface on an ephemeral port so it
// is unreachable off-box and cannot collide with a declared route.
export const OBSERVER_LOOPBACK_HOST = '127.0.0.1';

const TRANSPORT_KEYS = Object.freeze([
  'claimScope',
  'conjuncts',
  'declared',
  'observed',
  'residuals',
  'verdict',
]);
// Every conjunct is a MEASURED boolean. `declared` below is explicitly
// non-load-bearing: it exists so a reader can see what was aimed at, and no
// verdict branch reads it.
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

/**
 * DERIVED = min() over measured conjuncts; never declared, never stored as an
 * independent fact. UNMEASURED dominates: when the observer cannot prove it
 * sees this process's own transport, or its account contradicts the drill's,
 * no NEGATIVE conclusion is available either — absent evidence blocks rather
 * than resolving to the convenient answer.
 */
export function deriveTransportVerdict(conjuncts) {
  if (conjuncts?.observerCalibrated !== true) return TRANSPORT_VERDICTS.unmeasured;
  if (conjuncts.observerAccountConsistentWithDrill !== true) {
    return TRANSPORT_VERDICTS.unmeasured;
  }
  const live =
    conjuncts.endpointUsedMatchesDeclared === true
    && conjuncts.requestSentToDeclaredSocketAddress === true
    && conjuncts.everySendToDeclaredOriginHitDeclaredSocket === true
    && conjuncts.responseObservedFromDeclaredOrigin === true
    && conjuncts.chatPathSentToDeclaredAuthority === true
    && conjuncts.declaredAuthorityIsNotAnInProcessListener === true
    && conjuncts.requiredRouteTurnCompleted === true;
  return live ? TRANSPORT_VERDICTS.live : TRANSPORT_VERDICTS.notLive;
}

function endpointAuthority(endpoint) {
  const url = new URL(endpoint);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  return `${url.hostname}:${port}`;
}

/**
 * Subscribes to undici's own send-path channels. `sendHeaders` carries the
 * live net.Socket, so the recorded authority is where the bytes ACTUALLY went,
 * not where the URL said to go — a hosts-file or DNS redirect shows up as a
 * socket/origin mismatch rather than passing silently.
 */
export function createTransportObserver() {
  const sent = [];
  const responses = [];
  const subscriptions = [];
  const listen = (channel, handler) => {
    diagnosticsChannel.subscribe(channel, handler);
    subscriptions.push([channel, handler]);
  };
  listen('undici:client:sendHeaders', (message) => {
    const socket = message?.socket ?? null;
    const request = message?.request ?? null;
    const address = typeof socket?.remoteAddress === 'string'
      ? socket.remoteAddress
      : null;
    const port = Number.isInteger(socket?.remotePort) ? socket.remotePort : null;
    sent.push({
      method: typeof request?.method === 'string' ? request.method : null,
      origin: request?.origin == null ? null : String(request.origin),
      path: typeof request?.path === 'string' ? request.path : null,
      socketAuthority: address !== null && port !== null
        ? `${address}:${port}`
        : null,
    });
  });
  listen('undici:request:headers', (message) => {
    const request = message?.request ?? null;
    responses.push({
      origin: request?.origin == null ? null : String(request.origin),
      path: typeof request?.path === 'string' ? request.path : null,
      statusCode: Number.isInteger(message?.response?.statusCode)
        ? message.response.statusCode
        : null,
    });
  });
  return {
    mark: () => ({ responses: responses.length, sent: sent.length }),
    since: (mark) => ({
      responses: responses.slice(mark.responses),
      sent: sent.slice(mark.sent),
    }),
    stop: () => {
      for (const [channel, handler] of subscriptions) {
        diagnosticsChannel.unsubscribe(channel, handler);
      }
      subscriptions.length = 0;
    },
  };
}

/**
 * Positive control. Proves the observer can see a request made through the
 * EXACT fetch function the drill is about to use. A fabricated fetchImpl
 * returns its canned payload without touching a socket, so nothing is
 * recorded and calibration fails -> UNMEASURED -> the gate goes red instead of
 * quietly reporting a negative it never measured.
 */
export async function calibrateTransportObserver(observer, fetchFn) {
  let server = null;
  try {
    server = createServer((req, res) => {
      const body = Buffer.from('{"calibration":true}', 'utf8');
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': body.length,
      });
      res.end(body);
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, OBSERVER_LOOPBACK_HOST, resolve);
    });
    const { port } = server.address();
    const authority = `${OBSERVER_LOOPBACK_HOST}:${port}`;
    const origin = `http://${authority}`;
    const mark = observer.mark();
    let response;
    try {
      response = await fetchFn(`${origin}${CALIBRATION_PATH}`, {
        method: 'GET',
        signal: AbortSignal.timeout(CALIBRATION_TIMEOUT_MS),
      });
      if (typeof response?.arrayBuffer === 'function') await response.arrayBuffer();
    } catch (error) {
      return {
        authority,
        detail: `calibration request through the drill fetch function threw ${error?.name ?? 'Error'}`,
        ok: false,
      };
    }
    const seen = observer.since(mark);
    const observedSend = seen.sent.some(
      (entry) => entry.socketAuthority === authority
        && entry.path === CALIBRATION_PATH,
    );
    if (!observedSend) {
      return {
        authority,
        detail:
          'the drill fetch function returned a response the transport observer '
          + 'never saw on a socket: either it is not the platform fetch, or the '
          + 'observer is blind in this process',
        ok: false,
      };
    }
    return {
      authority,
      detail: 'observer recorded the calibration request on a real socket',
      ok: true,
    };
  } catch (error) {
    return {
      authority: null,
      detail: `calibration listener failed: ${error?.name ?? 'Error'}`,
      ok: false,
    };
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

export function buildTransportObservation({
  calibration,
  drillWindow,
  inProcessListenerAuthorities,
  requiredEntry,
  requiredRoute,
  skipLive,
}) {
  const declaredAuthority = endpointAuthority(requiredRoute.endpoint);
  const declaredOrigin = new URL(requiredRoute.endpoint).origin;
  const { chatPath } = requiredRoute;

  const sentToDeclaredOrigin = drillWindow.sent.filter(
    (entry) => entry.origin === declaredOrigin,
  );
  const responsesFromDeclaredOrigin = drillWindow.responses.filter(
    (entry) => entry.origin === declaredOrigin,
  );
  const sentToDeclaredSocket = sentToDeclaredOrigin.filter(
    (entry) => entry.socketAuthority === declaredAuthority,
  );
  const chatPathRequests = sentToDeclaredSocket.filter(
    (entry) => entry.path === chatPath && entry.method === 'POST',
  );
  const turnCompleted = requiredEntry?.turn?.turnCompleted === true;

  const observed = {
    calibrationDetail: calibration.detail,
    chatPathRequestsToDeclaredAuthority: chatPathRequests.length,
    drillWindowRequestCount: drillWindow.sent.length,
    inProcessListenerAuthorities: [...inProcessListenerAuthorities].sort(),
    observerCalibrated: calibration.ok === true,
    observerName: TRANSPORT_OBSERVER_NAME,
    requestsToDeclaredOrigin: sentToDeclaredOrigin.length,
    responseStatusesFromDeclaredOrigin: responsesFromDeclaredOrigin
      .map((entry) => (entry.statusCode === null ? -1 : entry.statusCode))
      .sort((a, b) => a - b),
    socketAuthoritiesObserved: [...new Set(
      drillWindow.sent
        .map((entry) => entry.socketAuthority)
        .filter((value) => typeof value === 'string'),
    )].sort(),
  };

  const conjuncts = {
    chatPathSentToDeclaredAuthority: chatPathRequests.length > 0,
    // Closes the ephemeral-port collision hole by MEASUREMENT rather than by
    // trusting the --skip-live flag: if the declared authority is a listener
    // this process bound, reaching it proves nothing about a sovereign peer.
    declaredAuthorityIsNotAnInProcessListener:
      !inProcessListenerAuthorities.has(declaredAuthority),
    endpointUsedMatchesDeclared:
      requiredEntry?.endpointUsed === requiredEntry?.declaredEndpoint,
    // A partial hit is not a hit: if ANY send to the declared origin landed on
    // some other socket, the address the drill reached is not established.
    everySendToDeclaredOriginHitDeclaredSocket:
      sentToDeclaredOrigin.length > 0
      && sentToDeclaredSocket.length === sentToDeclaredOrigin.length,
    // A completed turn with zero observed sockets is a CONTRADICTION between
    // two accounts of the same events, not a negative measurement.
    observerAccountConsistentWithDrill:
      !(turnCompleted && drillWindow.sent.length === 0),
    observerCalibrated: calibration.ok === true,
    requestSentToDeclaredSocketAddress: sentToDeclaredSocket.length > 0,
    requiredRouteTurnCompleted: turnCompleted,
    responseObservedFromDeclaredOrigin: responsesFromDeclaredOrigin.length > 0,
  };

  return {
    claimScope: TRANSPORT_CLAIM_SCOPE,
    conjuncts,
    declared: {
      requiredRouteAuthority: declaredAuthority,
      requiredRouteId: requiredRoute.routeId,
      skipLiveRequested: skipLive === true,
    },
    observed,
    residuals: [...TRANSPORT_RESIDUALS],
    verdict: deriveTransportVerdict(conjuncts),
  };
}

export class AdapterCustodyCheckError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdapterCustodyCheckError';
  }
}

function fail(message) {
  throw new AdapterCustodyCheckError(message);
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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
    const missing = expected.filter((key) => !actual.includes(key));
    const unexpected = actual.filter((key) => !expected.includes(key));
    fail(
      `${label} keys differ; missing=${canonicalJson(missing)} `
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

function drillTimestamp() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-p${process.pid}`;
}

function countJsonlLines(filePath) {
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .length;
}

// ---------------------------------------------------------------------------
// --skip-live stub: one in-process OpenAI-compatible node:http server per
// route on 127.0.0.1 (ephemeral port). Payloads embed the routeId so the two
// routes seal DISTINCT bytes (the custody store is content-addressed and
// refuses duplicate plaintext). The stub's chat reply is a vocabulary-valid
// proposal so the offline lane exercises the full parse path.
// ---------------------------------------------------------------------------

function stubChatContent(routeId) {
  return JSON.stringify({
    action: 'contribute_water',
    target: 'commons_cistern',
    amount: 1,
    reason: `stub drill contribution (${routeId})`,
  });
}

function startCertificationStub(route) {
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
            message: { content: stubChatContent(routeId), role: 'assistant' },
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
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        endpoint: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Custody drills on the primary and disposable stores.
// ---------------------------------------------------------------------------

function runReadBackReplayDrill(store, requiredTurn) {
  if (
    !requiredTurn
    || requiredTurn.turnCompleted !== true
    || typeof requiredTurn.custodyRefs?.requestCustodyId !== 'string'
    || typeof requiredTurn.custodyRefs?.responseCustodyId !== 'string'
  ) {
    return {
      ok: false,
      requestByteHashMatches: false,
      requestCustodyId: requiredTurn?.custodyRefs?.requestCustodyId ?? null,
      responseByteHashMatches: false,
      responseCustodyId: requiredTurn?.custodyRefs?.responseCustodyId ?? null,
      responseHashMatches: false,
    };
  }
  const { requestCustodyId, responseCustodyId } = requiredTurn.custodyRefs;
  const requestRead = store.readObject(requestCustodyId);
  const responseRead = store.readObject(responseCustodyId);
  const requestByteHashMatches =
    sha256Hex(requestRead.bytes) === requestCustodyId
    && sha256Hex(requestRead.bytes) === requiredTurn.promptHash;
  const responseByteHashMatches =
    sha256Hex(responseRead.bytes) === responseCustodyId;
  const responseHashMatches =
    sha256Hex(responseRead.bytes) === requiredTurn.responseHash;
  return {
    ok: requestByteHashMatches && responseByteHashMatches && responseHashMatches,
    requestByteHashMatches,
    requestCustodyId,
    responseByteHashMatches,
    responseCustodyId,
    responseHashMatches,
  };
}

function summarizeChecks(result) {
  return {
    ok: result.ok === true,
    checkCount: result.checks.length,
    failedChecks: result.checks
      .filter((check) => check.ok !== true)
      .map((check) => check.name),
  };
}

function runDeletionDrill({ deletionRoot, primaryStore, primaryStoreRoot }) {
  const deletionStore = createSealedCustodyStore({
    rootDir: deletionRoot,
    runLabel: 'mv-b1-adapter-custody-deletion-drill',
    operator: OPERATOR,
    retentionPolicy: {
      description: RETENTION_DESCRIPTION,
      frozenAt: new Date().toISOString(),
      policyId: RETENTION_POLICY_ID,
    },
  });
  const sealed = deletionStore.sealObject({
    bytes: Buffer.from(
      `mv-b1 deletion drill object ${new Date().toISOString()} p${process.pid}`,
      'utf8',
    ),
    kind: 'deletion-drill-object',
    label: 'mv-b1:deletion-drill',
  });
  const tombstone = deletionStore.destroyContentKey({
    reason: 'mv-b1 engineering drill: prove deletion-by-key-destruction',
  });
  let readFailsAfterKeyDestruction = false;
  let readFailureName = null;
  try {
    deletionStore.readObject(sealed.custodyId);
  } catch (error) {
    readFailsAfterKeyDestruction = true;
    readFailureName = error?.name ?? 'Error';
  }
  const tombstoneWritten =
    typeof tombstone?.at === 'string'
    && countJsonlLines(path.join(deletionRoot, 'tombstones.jsonl')) >= 1;
  const checksumVerify = deletionStore.verifyIntegrity();
  const primaryStoreKeyIntact =
    primaryStore.keyDestroyed === false
    && existsSync(path.join(primaryStoreRoot, 'key', 'content-key.bin'));
  const ok =
    readFailsAfterKeyDestruction
    && readFailureName === 'CustodyKeyDestroyedError'
    && tombstoneWritten
    && checksumVerify.mode === 'ciphertext-checksum-only'
    && checksumVerify.ok === true
    && primaryStoreKeyIntact;
  // Release the exclusive store lock: the deletion drill's handle is done.
  deletionStore.close();
  return {
    ok,
    checksumOnlyVerifyMode: checksumVerify.mode,
    checksumOnlyVerifyOk: checksumVerify.ok === true,
    custodyId: sealed.custodyId,
    primaryStoreKeyIntact,
    readFailsAfterKeyDestruction,
    readFailureName,
    tombstoneWritten,
  };
}

// ---------------------------------------------------------------------------
// Drill execution.
// ---------------------------------------------------------------------------

export async function runAdapterCustodyDrill({
  root = process.cwd(),
  output = DEFAULT_OUTPUT,
  storeRoot = null,
  skipLive = false,
  fetchImpl = null,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const bundle = await loadAdapterCustodyDrillManifest({
    hololandRoot: resolvedRoot,
  });
  const { manifestHash } = bundle;

  const storeParent = storeRoot
    ? path.resolve(resolvedRoot, storeRoot)
    : path.resolve(resolvedRoot, DEFAULT_STORE_PARENT, drillTimestamp());
  const primaryStoreRoot = path.join(storeParent, 'store');
  const deletionRoot = path.join(storeParent, 'deletion-drill');

  const store = createSealedCustodyStore({
    rootDir: primaryStoreRoot,
    runLabel: 'mv-b1-adapter-custody-drill',
    operator: OPERATOR,
    retentionPolicy: {
      description: RETENTION_DESCRIPTION,
      frozenAt: new Date().toISOString(),
      policyId: RETENTION_POLICY_ID,
    },
  });

  const failures = [];
  const routeEntries = [];
  const stubs = [];
  const activeFetch = fetchImpl ?? globalThis.fetch;

  // Every authority THIS process binds. Reaching one of these proves nothing
  // about a sovereign peer, so the set is recorded and subtracted at verdict
  // time — that is what makes --skip-live structurally unable to certify
  // liveness even if an ephemeral port ever collided with a declared one.
  const inProcessListenerAuthorities = new Set();
  const observer = createTransportObserver();
  let calibration;
  let drillWindow = { responses: [], sent: [] };

  try {
    calibration = await calibrateTransportObserver(observer, activeFetch);
    if (calibration.authority !== null) {
      inProcessListenerAuthorities.add(calibration.authority);
    }
    const drillMark = observer.mark();

    for (const route of bundle.routes) {
      let effectiveRoute = {
        ...route,
        ceilings: { ...route.ceilings },
      };
      if (skipLive) {
        const stub = await startCertificationStub(route);
        stubs.push(stub);
        inProcessListenerAuthorities.add(endpointAuthority(stub.endpoint));
        effectiveRoute = { ...effectiveRoute, endpoint: stub.endpoint };
      }

      const entry = {
        certification: null,
        certificationError: null,
        declaredEndpoint: route.endpoint,
        endpointUsed: effectiveRoute.endpoint,
        required: route.required,
        routeId: route.routeId,
        turn: null,
        turnError: null,
        turnSkippedReason: null,
      };

      try {
        entry.certification = await certifyLockedAdapterRoute({
          route: effectiveRoute,
          drill: bundle,
          custodyStore: store,
          operator: OPERATOR,
          priorReceiptHash: manifestHash,
          fetchImpl: activeFetch,
        });
      } catch (error) {
        entry.certificationError = error?.message ?? String(error);
        entry.turnSkippedReason = 'certification-error';
      }

      if (entry.certification && entry.certification.certified !== true) {
        entry.turnSkippedReason = 'route-not-certified';
      } else if (entry.certification) {
        try {
          entry.turn = await executeCertifiedModelTurn({
            route: effectiveRoute,
            certification: entry.certification,
            drill: bundle,
            custodyStore: store,
            operator: OPERATOR,
            priorReceiptHash: entry.certification.receiptHash,
            fetchImpl: activeFetch,
          });
        } catch (error) {
          entry.turnError = error?.message ?? String(error);
        }
      }

      routeEntries.push(entry);

      if (route.required) {
        if (!entry.certification) {
          failures.push(
            `required route ${route.routeId} certification errored: `
            + `${entry.certificationError}`,
          );
        } else if (entry.certification.certified !== true) {
          failures.push(
            `required route ${route.routeId} did not certify `
            + `(${entry.certification.failureReason})`,
          );
        } else if (!entry.turn) {
          failures.push(
            `required route ${route.routeId} turn errored: ${entry.turnError}`,
          );
        } else if (entry.turn.turnCompleted !== true) {
          failures.push(
            `required route ${route.routeId} turn did not complete `
            + `(${entry.turn.errorClass})`,
          );
        } else if (entry.turn.proposalDecision === 'not_evaluated') {
          failures.push(
            `required route ${route.routeId} turn produced no parsed `
            + 'proposal decision',
          );
        }
      }
      // Optional route failures are receipted above, never fatal.
    }
    drillWindow = observer.since(drillMark);
  } finally {
    for (const stub of stubs) await stub.close();
    observer.stop();
  }

  // Custody drills on the primary store, then the disposable deletion store.
  const requiredEntry = routeEntries.find((entry) => entry.required) ?? null;
  const readBackReplay = runReadBackReplayDrill(
    store,
    requiredEntry?.turn ?? null,
  );
  const integrity = {
    mode: null,
    ...(() => {
      const result = store.verifyIntegrity();
      return { ...summarizeChecks(result), mode: result.mode };
    })(),
  };
  const backupResult = store.createBackup();
  const backup = {
    ok: backupResult.ok === true,
    fileCount: backupResult.fileCount,
  };
  const backupVerifyResult = store.verifyBackup();
  const backupVerify = {
    ok: backupVerifyResult.ok === true,
    failedChecks: backupVerifyResult.checks
      .filter((check) => check.ok !== true)
      .map((check) => check.name),
  };
  const deletion = runDeletionDrill({
    deletionRoot,
    primaryStore: store,
    primaryStoreRoot,
  });
  const custodyDrills = {
    allOk:
      readBackReplay.ok
      && integrity.ok
      && backup.ok
      && backupVerify.ok
      && deletion.ok,
    backup,
    backupVerify,
    deletion,
    deletionStoreRoot: normalizePath(resolvedRoot, deletionRoot),
    integrity,
    readBackReplay,
    storeRoot: normalizePath(resolvedRoot, primaryStoreRoot),
  };
  for (const [name, drill] of Object.entries({
    'read-back replay': readBackReplay,
    integrity,
    backup,
    'backup verify': backupVerify,
    deletion,
  })) {
    if (drill.ok !== true) failures.push(`custody drill failed: ${name}`);
  }

  const storeManifestHash = canonicalDigest(store.getManifest());
  const accessLogEntryCount = countJsonlLines(
    path.join(primaryStoreRoot, 'access-log.jsonl'),
  );
  // All primary-store drills are complete; release its exclusive lock so a
  // later operator handle can open the store root for audit.
  store.close();

  const transport = buildTransportObservation({
    calibration,
    drillWindow,
    inProcessListenerAuthorities,
    requiredEntry,
    requiredRoute: bundle.routes.find((route) => route.required) ?? bundle.routes[0],
    skipLive,
  });
  // Absent evidence blocks. UNMEASURED is never allowed to pass as either of
  // the other two states, and the live lane must MEASURE liveness rather than
  // inherit it from the absence of --skip-live.
  if (transport.verdict === TRANSPORT_VERDICTS.unmeasured) {
    failures.push(
      'sovereign-route transport is UNMEASURED '
      + `(${transport.observed.calibrationDetail}); the receipt cannot state `
      + 'whether a live route was exercised, so this gate fails closed',
    );
  } else if (skipLive && transport.verdict !== TRANSPORT_VERDICTS.notLive) {
    failures.push(
      `--skip-live must measure ${TRANSPORT_VERDICTS.notLive}; `
      + `measured ${transport.verdict}`,
    );
  } else if (!skipLive && transport.verdict !== TRANSPORT_VERDICTS.live) {
    failures.push(
      `the live lane requires ${TRANSPORT_VERDICTS.live}; measured `
      + `${transport.verdict}. Failed conjuncts: ${Object.entries(transport.conjuncts)
        .filter(([, value]) => value !== true)
        .map(([name]) => name)
        .join(', ') || 'none'}`,
    );
  }

  const claimBoundary = {
    observed: [
      'first executable adapter seam: manifest-pinned route certification and model-turn execution',
      `certified sovereign route(s): ${routeEntries
        .filter((entry) => entry.certification?.certified === true)
        .map((entry) => entry.routeId)
        .join(', ') || 'none'} (certification is this drill's own probe result; `
      + `transport to the declared address is separately measured: ${transport.verdict})`,
      'one receipted model turn per certified route in the engineering certification lane',
      'sealed custody write, read-back replay, integrity verify, backup, backup verify, hash-chained access log, key destruction, and nonidentifying tombstone drills',
      'zero-retry by construction: retryCount pinned 0 in the manifest and verified in every receipt',
      'raw prompt and response bytes custody-only; the public receipt carries hashes and bounded summaries',
    ],
    notObserved: [
      'live study run',
      'Phase 1 admission or readiness',
      'six-resident live turns',
      'blinded alias assignment (the sealed adapter_a/adapter_b/adapter_c alias-to-route assignment is out of scope for this drill)',
      'production validator custody',
      'process-crash durability',
      'provider sampling determinism (temperature zero is not a determinism receipt)',
      'peer identity at the declared route address: transport reaching that host:port is measured, but nothing here proves WHICH server holds it',
    ],
    ...PINNED_CLAIM_BOUNDARY_VALUES,
    sovereignRouteTransport: transport,
  };

  const unsigned = {
    schema: ADAPTER_CUSTODY_RECEIPT_SCHEMA,
    drillId: bundle.drill.drillId,
    manifestHash,
    generatedAt: new Date().toISOString(),
    routes: routeEntries,
    custodyDrills,
    storeManifestHash,
    accessLogEntryCount,
    claimBoundary,
  };
  const receipt = { ...unsigned, receiptHash: canonicalDigest(unsigned) };

  const resolvedOutput = path.resolve(resolvedRoot, output);
  mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(receipt, null, 2)}\n`);

  const verification = verifyAdapterCustodyReceipt(receipt);
  if (!verification.ok) {
    failures.push(`emitted receipt failed self-verification: ${verification.failureReason}`);
  }

  if (failures.length > 0) {
    throw new AdapterCustodyCheckError(
      `Model Village adapter custody drill failed: ${failures.join('; ')}. `
      + `Receipt: ${resolvedOutput}`,
    );
  }

  return { receipt, output: resolvedOutput };
}

// ---------------------------------------------------------------------------
// Receipt verification (closed keys, schema pin, pinned claim boundary,
// nested receipt verification, chain binding, self-hash recompute — same
// pattern as verifyPhase0BReceiptHash: the receiptHash covers everything
// but itself, so tampering ANY field fails).
// ---------------------------------------------------------------------------

/**
 * The stored verdict is never trusted. It is RE-DERIVED from the recorded
 * conjuncts, and the conjuncts that describe the drill are cross-checked
 * against the independent `routes` region of the same receipt — so flipping a
 * single flag to manufacture a live claim contradicts either the derivation,
 * the routes array, or the counts that back it, and fails --verify.
 */
function verifyTransportObservation(transport, requiredEntry) {
  assertExactKeys(
    transport,
    TRANSPORT_KEYS,
    'receipt.claimBoundary.sovereignRouteTransport',
  );
  const label = 'sovereignRouteTransport';
  if (transport.claimScope !== TRANSPORT_CLAIM_SCOPE) {
    fail(`${label}.claimScope drifted from the pinned scope statement`);
  }
  if (canonicalJson(transport.residuals) !== canonicalJson([...TRANSPORT_RESIDUALS])) {
    fail(`${label}.residuals drifted from the pinned residual list`);
  }
  assertExactKeys(transport.conjuncts, TRANSPORT_CONJUNCT_KEYS, `${label}.conjuncts`);
  for (const key of TRANSPORT_CONJUNCT_KEYS) {
    if (typeof transport.conjuncts[key] !== 'boolean') {
      fail(`${label}.conjuncts.${key} must be boolean`);
    }
  }
  assertExactKeys(transport.declared, TRANSPORT_DECLARED_KEYS, `${label}.declared`);
  assertExactKeys(transport.observed, TRANSPORT_OBSERVED_KEYS, `${label}.observed`);

  if (!TRANSPORT_VERDICT_VALUES.includes(transport.verdict)) {
    fail(`${label}.verdict must be one of ${canonicalJson(TRANSPORT_VERDICT_VALUES)}`);
  }
  if (transport.verdict !== deriveTransportVerdict(transport.conjuncts)) {
    fail(`${label}.verdict does not re-derive from its own conjuncts`);
  }

  const { conjuncts, declared, observed } = transport;
  if (observed.observerName !== TRANSPORT_OBSERVER_NAME) {
    fail(`${label}.observed.observerName drifted`);
  }
  assertNonEmptyString(observed.calibrationDetail, `${label}.observed.calibrationDetail`);
  if (typeof observed.observerCalibrated !== 'boolean') {
    fail(`${label}.observed.observerCalibrated must be boolean`);
  }
  if (observed.observerCalibrated !== conjuncts.observerCalibrated) {
    fail(`${label}.observed.observerCalibrated disagrees with its conjunct`);
  }
  for (const key of [
    'chatPathRequestsToDeclaredAuthority',
    'drillWindowRequestCount',
    'requestsToDeclaredOrigin',
  ]) {
    if (!Number.isInteger(observed[key]) || observed[key] < 0) {
      fail(`${label}.observed.${key} must be a non-negative integer`);
    }
  }
  for (const key of [
    'inProcessListenerAuthorities',
    'responseStatusesFromDeclaredOrigin',
    'socketAuthoritiesObserved',
  ]) {
    if (!Array.isArray(observed[key])) {
      fail(`${label}.observed.${key} must be an array`);
    }
  }

  // Counts must back the booleans they are supposed to summarize.
  if (conjuncts.requestSentToDeclaredSocketAddress
    && observed.requestsToDeclaredOrigin < 1) {
    fail(`${label} claims a send to the declared socket with zero observed requests`);
  }
  if (conjuncts.chatPathSentToDeclaredAuthority
    && observed.chatPathRequestsToDeclaredAuthority < 1) {
    fail(`${label} claims a chat-path send with zero observed chat-path requests`);
  }
  if (conjuncts.responseObservedFromDeclaredOrigin
    && observed.responseStatusesFromDeclaredOrigin.length < 1) {
    fail(`${label} claims a response with zero observed response statuses`);
  }
  if (conjuncts.everySendToDeclaredOriginHitDeclaredSocket
    && observed.requestsToDeclaredOrigin < 1) {
    fail(`${label} claims full socket agreement over zero observed requests`);
  }
  if (conjuncts.observerAccountConsistentWithDrill === false
    && observed.drillWindowRequestCount !== 0) {
    fail(`${label} reports an observer/drill contradiction that its counts do not show`);
  }
  if (conjuncts.declaredAuthorityIsNotAnInProcessListener
    !== !observed.inProcessListenerAuthorities.includes(declared.requiredRouteAuthority)) {
    fail(`${label} in-process-listener conjunct disagrees with the recorded authorities`);
  }
  // Emitter invariant: a calibrated run necessarily bound the calibration
  // listener, so an empty set means the record was stripped. Without this the
  // set could be emptied to make the declared authority look external.
  if (observed.observerCalibrated
    && observed.inProcessListenerAuthorities.length === 0) {
    fail(
      `${label}.observed.inProcessListenerAuthorities is empty on a calibrated `
      + 'run, which is impossible: calibration itself binds a listener',
    );
  }

  // Cross-region binding: these conjuncts describe the required route entry,
  // so they must agree with it.
  if (!requiredEntry) fail(`${label} has no required route entry to bind against`);
  if (declared.requiredRouteId !== requiredEntry.routeId) {
    fail(`${label}.declared.requiredRouteId does not bind the required route`);
  }
  if (declared.requiredRouteAuthority !== endpointAuthority(requiredEntry.declaredEndpoint)) {
    fail(`${label}.declared.requiredRouteAuthority does not match the declared endpoint`);
  }
  if (typeof declared.skipLiveRequested !== 'boolean') {
    fail(`${label}.declared.skipLiveRequested must be boolean`);
  }
  // `declared` never feeds the verdict, but it must not contradict measured
  // evidence either: the live lane always aims at the declared endpoint, so a
  // receipt relabelled as a live run while the required route demonstrably
  // used a different endpoint is rejected. The converse is deliberately NOT
  // enforced — a --skip-live run whose ephemeral stub port happened to collide
  // with the declared one is legitimate, and the in-process-listener conjunct
  // is what keeps that case off MEASURED_LIVE_TRANSPORT.
  if (!declared.skipLiveRequested && !conjuncts.endpointUsedMatchesDeclared) {
    fail(
      `${label}.declared.skipLiveRequested claims a live lane while the `
      + 'required route used an endpoint other than the declared one',
    );
  }
  if (conjuncts.endpointUsedMatchesDeclared
    !== (requiredEntry.endpointUsed === requiredEntry.declaredEndpoint)) {
    fail(`${label} endpointUsedMatchesDeclared disagrees with the routes region`);
  }
  if (conjuncts.requiredRouteTurnCompleted
    !== (requiredEntry.turn?.turnCompleted === true)) {
    fail(`${label} requiredRouteTurnCompleted disagrees with the routes region`);
  }
  // --skip-live can never certify liveness, structurally: a stub run reaches
  // an authority this process bound, which the conjuncts already exclude.
  if (transport.verdict === TRANSPORT_VERDICTS.live && declared.skipLiveRequested) {
    fail(`${label} certifies live transport on a --skip-live run`);
  }
}

export function verifyAdapterCustodyReceipt(receipt) {
  try {
    assertExactKeys(receipt, RECEIPT_KEYS, 'adapter custody receipt');
    if (receipt.schema !== ADAPTER_CUSTODY_RECEIPT_SCHEMA) {
      fail(`receipt schema must be '${ADAPTER_CUSTODY_RECEIPT_SCHEMA}'`);
    }
    assertNonEmptyString(receipt.drillId, 'receipt.drillId');
    assertSha256(receipt.manifestHash, 'receipt.manifestHash');
    assertNonEmptyString(receipt.generatedAt, 'receipt.generatedAt');
    assertSha256(receipt.storeManifestHash, 'receipt.storeManifestHash');
    if (
      !Number.isInteger(receipt.accessLogEntryCount)
      || receipt.accessLogEntryCount < 1
    ) {
      fail('receipt.accessLogEntryCount must be a positive integer');
    }

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
    for (const listName of ['observed', 'notObserved']) {
      const list = receipt.claimBoundary[listName];
      if (!Array.isArray(list) || list.length === 0) {
        fail(`receipt.claimBoundary.${listName} must be a non-empty array`);
      }
      for (const item of list) {
        assertNonEmptyString(item, `receipt.claimBoundary.${listName} entry`);
      }
    }

    if (!Array.isArray(receipt.routes) || receipt.routes.length === 0) {
      fail('receipt.routes must be a non-empty array');
    }
    let requiredCount = 0;
    receipt.routes.forEach((entry, index) => {
      const label = `receipt.routes[${index}]`;
      assertExactKeys(entry, ROUTE_ENTRY_KEYS, label);
      assertNonEmptyString(entry.routeId, `${label}.routeId`);
      assertNonEmptyString(entry.declaredEndpoint, `${label}.declaredEndpoint`);
      assertNonEmptyString(entry.endpointUsed, `${label}.endpointUsed`);
      if (typeof entry.required !== 'boolean') {
        fail(`${label}.required must be boolean`);
      }
      if (entry.required) requiredCount += 1;
      if (entry.certification !== null) {
        const check = verifyAdapterCertificationReceipt(entry.certification);
        if (!check.ok) {
          fail(`${label}.certification invalid: ${check.failureReason}`);
        }
        if (entry.certification.routeId !== entry.routeId) {
          fail(`${label}.certification routeId does not bind this route`);
        }
        if (entry.certification.priorReceiptHash !== receipt.manifestHash) {
          fail(`${label}.certification does not chain from the manifest hash`);
        }
      }
      if (entry.turn !== null) {
        if (entry.certification === null) {
          fail(`${label} carries a turn without a certification`);
        }
        const check = verifyModelTurnReceipt(entry.turn);
        if (!check.ok) fail(`${label}.turn invalid: ${check.failureReason}`);
        if (entry.turn.routeId !== entry.routeId) {
          fail(`${label}.turn routeId does not bind this route`);
        }
        if (entry.turn.priorReceiptHash !== entry.certification.receiptHash) {
          fail(`${label}.turn does not chain from its certification receipt`);
        }
      }
    });
    if (requiredCount < 1) {
      fail('receipt.routes must include at least one required route');
    }

    verifyTransportObservation(
      receipt.claimBoundary.sovereignRouteTransport,
      receipt.routes.find((entry) => entry.required) ?? null,
    );

    assertExactKeys(receipt.custodyDrills, CUSTODY_DRILLS_KEYS, 'receipt.custodyDrills');
    for (const drillKey of [
      'readBackReplay', 'integrity', 'backup', 'backupVerify', 'deletion',
    ]) {
      assertObject(receipt.custodyDrills[drillKey], `receipt.custodyDrills.${drillKey}`);
      if (typeof receipt.custodyDrills[drillKey].ok !== 'boolean') {
        fail(`receipt.custodyDrills.${drillKey}.ok must be boolean`);
      }
    }
    if (typeof receipt.custodyDrills.allOk !== 'boolean') {
      fail('receipt.custodyDrills.allOk must be boolean');
    }

    const { receiptHash, ...unsigned } = receipt;
    assertSha256(receiptHash, 'receipt.receiptHash');
    if (canonicalDigest(unsigned) !== receiptHash) {
      fail('receipt.receiptHash does not recompute');
    }
    // Re-DERIVED from the receipt's own conjuncts, never read off the stored
    // verdict field, so a caller of --verify sees what the observations imply
    // rather than what the file says they imply.
    return {
      failureReason: null,
      ok: true,
      transportVerdict: deriveTransportVerdict(
        receipt.claimBoundary.sovereignRouteTransport.conjuncts,
      ),
    };
  } catch (error) {
    return {
      failureReason: error?.message ?? String(error),
      ok: false,
      transportVerdict: null,
    };
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
      console.log(`HoloLand Model Village adapter + custody drill check

Usage:
  node scripts/check-hololand-model-village-adapter-custody.mjs [options]

Options:
  --root <path>        HoloLand repository root
  --output <path>      Receipt output path
  --store-root <path>  Parent directory for the drill custody stores
  --skip-live          Certify against in-process stubs instead of the
                       declared sovereign routes. Transport to the declared
                       address is still MEASURED, and must come back
                       MEASURED_NO_LIVE_TRANSPORT; --skip-live cannot certify
                       liveness and is not what decides the verdict.
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

function describeRoute(entry) {
  const certified = entry.certification?.certified === true;
  const parts = [
    `route ${entry.routeId} (${entry.required ? 'required' : 'optional'}):`,
    certified ? 'certified' : `NOT certified (${entry.certification?.failureReason ?? entry.certificationError})`,
  ];
  if (entry.turn) {
    parts.push(
      `turn ${entry.turn.turnCompleted ? 'completed' : `failed (${entry.turn.errorClass})`}`,
      `latency ${entry.turn.latencyMs}ms`,
      `proposal ${entry.turn.proposalDecision}`,
    );
  } else if (entry.turnSkippedReason) {
    parts.push(`turn skipped: ${entry.turnSkippedReason}`);
  } else if (entry.turnError) {
    parts.push(`turn errored: ${entry.turnError}`);
  }
  return parts.join(' ');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs();
    if (args.verify) {
      const receipt = JSON.parse(
        readFileSync(path.resolve(args.root, args.verify), 'utf8'),
      );
      const verification = verifyAdapterCustodyReceipt(receipt);
      if (!verification.ok) {
        console.error('[hololand-model-village-adapter-custody] verify FAILED');
        console.error(verification.failureReason);
        process.exit(1);
      }
      // The verify lane must not be quieter than the drill lane about absent
      // evidence. It used to print "verify ok" and exit 0 for a receipt whose
      // transport verdict was UNMEASURED — and --verify is exactly the path a
      // published report cites as "self-verified", so the published-evidence
      // path was the one path that never mentioned the verdict at all.
      console.log(
        `sovereign-route transport: ${verification.transportVerdict}`,
      );
      if (verification.transportVerdict === TRANSPORT_VERDICTS.unmeasured) {
        console.error('[hololand-model-village-adapter-custody] verify FAILED');
        console.error(
          'the receipt is internally consistent but its sovereign-route '
          + 'transport verdict is UNMEASURED: it records that the observation '
          + 'could not be made, so it must not be cited as evidence of either '
          + 'a live or a non-live route',
        );
        process.exit(1);
      }
      console.log('[hololand-model-village-adapter-custody] verify ok');
      console.log(`receiptHash: ${receipt.receiptHash}`);
    } else {
      const { receipt, output } = await runAdapterCustodyDrill(args);
      if (args.json) {
        console.log(JSON.stringify(receipt, null, 2));
      } else {
        console.log('[hololand-model-village-adapter-custody] ok');
        console.log(`receipt: ${output}`);
        console.log(`manifestHash: ${receipt.manifestHash}`);
        for (const entry of receipt.routes) console.log(describeRoute(entry));
        console.log(`custody drills allOk: ${receipt.custodyDrills.allOk}`);
        console.log(`access-log entries: ${receipt.accessLogEntryCount}`);
        const transport = receipt.claimBoundary.sovereignRouteTransport;
        console.log(
          `sovereign-route transport: ${transport.verdict} `
          + `(${transport.observed.requestsToDeclaredOrigin} request(s) observed `
          + `to ${transport.declared.requiredRouteAuthority}, `
          + `${transport.observed.drillWindowRequestCount} on real sockets in the `
          + 'drill window)',
        );
        console.log(`  observer: ${transport.observed.calibrationDetail}`);
        console.log(`  scope: ${transport.claimScope}`);
        console.log('live study run: not claimed (engineering certification lane)');
      }
    }
  } catch (error) {
    console.error('[hololand-model-village-adapter-custody] failed');
    console.error(error.message || error);
    process.exit(1);
  }
}
