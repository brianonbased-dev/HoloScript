/* global Buffer, process, structuredClone */

// Model Village MV-B1 locked-adapter runtime (ENGINEERING CERTIFICATION LANE).
//
// Language boundary (spec lines 106-108): this module is transport,
// canonicalization, and verification only. It contains no resident reasoning,
// no village rules, no experimental treatments, no scoring policy, and no
// model-specific behavior. The prompt template and proposal vocabulary are
// canonical `.hs` source data consumed here, never authored here.
//
// Claim boundary: nothing in this module is a live study run, Phase 1
// admission, blinded alias assignment, or a determinism receipt. Temperature
// zero is not a determinism receipt (spec line 226). The sealed
// adapter_a/adapter_b/adapter_c alias-to-route assignment is out of scope.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalDigest,
  canonicalJson,
} from './model-village-phase0b-runtime.mjs';

export const ADAPTER_CERTIFICATION_SCHEMA =
  'hololand.model-village-adapter-certification.v1';
export const MODEL_TURN_RECEIPT_SCHEMA =
  'hololand.model-village-model-turn.v1';
export const ADAPTER_RUNTIME_ENGINE =
  'hololand-model-village-adapter-runtime-v1';
export const ADAPTER_CUSTODY_DRILL_SCHEMA =
  'hololand.model-village-adapter-custody-drill.v1';
export const ADAPTER_CUSTODY_DRILL_SOURCE_PATH =
  'source/proofs/model-village-adapter-custody-drill.hs';

export const GENESIS_RECEIPT_HASH = '0'.repeat(64);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SERIALIZER_VERSION = 'mv-b1-serializer-v1';
const FALLBACK_EVIDENCE = 'no-fallback-code-path-single-endpoint';
const HIDDEN_PROMPT_ENHANCEMENT_EVIDENCE = 'none-request-bytes-hashed';
const PROPOSAL_REASON_MAX_LENGTH = 240;
const REPORTED_STRING_MAX_LENGTH = 200;
// Bounded response-body read: a hostile or looping endpoint cannot buffer
// more than this into memory before the read fails loud and is receipted.
const MAX_RESPONSE_BODY_BYTES = 5 * 1024 * 1024;
// Public-receipt usage boundary (spec lines 288-289): only these integer
// token-count keys may ride a provider's usage subtree into the durable
// public receipt. Everything else (arbitrary keys, nested objects, strings)
// is dropped at sanitization and rejected at verification.
const USAGE_REPORTED_KEYS = Object.freeze([
  'completion_tokens',
  'prompt_tokens',
  'total_tokens',
]);
// Cache-state honesty: no cache-control probe exists in this engine version,
// so the receipt asserts only that no probe ran (probed:false) plus the
// spec-legal unknown-contamination state — never an unprobed claim about
// what the provider supports.
const CACHE_STATE_EVIDENCE = Object.freeze({
  providerCacheControlProbed: false,
  state: 'unknown_contamination_receipted',
});

const EXPECTED_MANIFEST_OBJECT_NAMES = Object.freeze([
  'ModelVillageAdapterCustodyDrill',
  'ModelVillageSovereignRouteHoloserveLaptop',
  'ModelVillageSovereignRouteJetsonHolollama',
  'ModelVillageCertificationTurnPrompt',
  'ModelVillageProposalVocabulary',
]);
const DRILL_KEYS = Object.freeze([
  'drillId',
  'lane',
  'laneStatement',
  'routesDeclaredOpenly',
  'schemaId',
  'sealedAliasAssignmentInScope',
  'studyLaneClaimed',
  'type',
]);
const ROUTE_SOURCE_KEYS = Object.freeze([
  'chatPath',
  'endpoint',
  'healthPath',
  'maxOutputTokens',
  'modelsPath',
  'required',
  'retryCount',
  'routeId',
  'seedRequested',
  'temperature',
  'timeoutMs',
  'transport',
  'type',
]);
const PROMPT_KEYS = Object.freeze([
  'messageCount',
  'messageRole',
  'promptId',
  'promptTemplate',
  'systemMessagePermitted',
  'type',
]);
const VOCABULARY_KEYS = Object.freeze([
  'actionsRequiringNullTargetAndAmount',
  'actionsRequiringTargetAndAmount',
  'allowedActions',
  'allowedTargets',
  'amountMax',
  'amountMin',
  'defaultDecision',
  'deniedActions',
  'type',
  'vocabularyId',
]);
const RUNTIME_ROUTE_KEYS = Object.freeze([
  'ceilings',
  'chatPath',
  'endpoint',
  'healthPath',
  'modelsPath',
  'required',
  'routeId',
  'transport',
]);
const CEILING_KEYS = Object.freeze([
  'maxOutputTokens',
  'retryCount',
  'seedRequested',
  'temperature',
  'timeoutMs',
]);
const CERTIFICATION_RECEIPT_KEYS = Object.freeze([
  'at',
  'cacheStateEvidence',
  'ceilings',
  'certified',
  'endpoint',
  'engine',
  'failureReason',
  'fallbackDisabled',
  'fallbackEvidence',
  'hiddenPromptEnhancement',
  'priorReceiptHash',
  'probeLatencyMs',
  'promptTemplateHash',
  'receiptHash',
  'revisionEvidence',
  'routeId',
  'schema',
  'serializerHash',
  'transport',
]);
const REVISION_EVIDENCE_KEYS = Object.freeze([
  'evidenceCustodyIds',
  'modelIdReported',
  'packageVersionReported',
  'processInstanceId',
  'tier',
]);
const CACHE_STATE_EVIDENCE_KEYS = Object.freeze([
  'providerCacheControlProbed',
  'state',
]);
const MODEL_TURN_RECEIPT_KEYS = Object.freeze([
  'at',
  'cacheStateEvidence',
  'custodyRefs',
  'endpoint',
  'engine',
  'errorClass',
  'fallbackEvidence',
  'generationParameters',
  'latencyMs',
  'parsedProposal',
  'priorReceiptHash',
  'promptHash',
  'proposalDecision',
  'proposalReason',
  'receiptHash',
  'responseHash',
  'retries',
  'revisionEvidence',
  'routeId',
  'schema',
  'turnCompleted',
  'usageReported',
]);
const GENERATION_PARAMETER_KEYS = Object.freeze([
  'maxOutputTokens',
  'seedAcceptedEvidence',
  'seedRequested',
  'temperature',
]);
const CUSTODY_REF_KEYS = Object.freeze([
  'requestCustodyId',
  'responseCustodyId',
]);
const PUBLIC_PARSED_PROPOSAL_KEYS = Object.freeze([
  'action',
  'amount',
  'reasonLength',
  'reasonSha256',
  'target',
]);
const PROPOSAL_OBJECT_KEYS = Object.freeze([
  'action',
  'amount',
  'reason',
  'target',
]);

export class ModelVillageAdapterRuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelVillageAdapterRuntimeError';
  }
}

function fail(message) {
  throw new ModelVillageAdapterRuntimeError(message);
}

function normalizeSource(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function sha256HexOfBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
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

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${label} must be a positive integer`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be lowercase sha256 hex`);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array`);
  }
  for (const entry of value) assertNonEmptyString(entry, `${label} entry`);
  if (new Set(value).size !== value.length) {
    fail(`${label} entries must be distinct`);
  }
}

// ---------------------------------------------------------------------------
// Drill manifest loading (mirrors instantiatePhase1Manifests / the phase0b
// resolveHoloScriptRoot behavior: env HOLOSCRIPT_ROOT else ../HoloScript).
// ---------------------------------------------------------------------------

function resolveHoloScriptCorePath(hololandRoot) {
  const candidate = process.env.HOLOSCRIPT_ROOT
    ? path.resolve(process.env.HOLOSCRIPT_ROOT)
    : path.resolve(hololandRoot, '..', 'HoloScript');
  const corePath = path.join(candidate, 'packages', 'core', 'dist', 'index.js');
  if (!existsSync(corePath)) {
    fail(
      `HoloScript core build is unavailable at ${candidate}; `
      + 'set HOLOSCRIPT_ROOT to the built HoloScript repository',
    );
  }
  return corePath;
}

function scanManifestObjectBlocks(source) {
  const blocks = [];
  const pattern = /\bobject\s+"([^"]+)"\s*\{/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let cursor = pattern.lastIndex;
    let depth = 1;
    let inString = false;
    let escaped = false;
    let lineComment = false;
    for (; cursor < source.length && depth > 0; cursor += 1) {
      const character = source[cursor];
      const next = source[cursor + 1];
      if (lineComment) {
        if (character === '\n') lineComment = false;
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '/' && next === '/') {
        lineComment = true;
        cursor += 1;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
    }
    if (depth !== 0) fail(`Drill manifest object ${match[1]} is unclosed`);
    blocks.push({
      name: match[1],
      body: source.slice(pattern.lastIndex, cursor - 1),
    });
    pattern.lastIndex = cursor;
  }
  return blocks;
}

function assertNoDuplicateManifestProperties(source) {
  const blocks = scanManifestObjectBlocks(source);
  for (const block of blocks) {
    const seen = new Set();
    for (const line of block.body.split('\n')) {
      const lineMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (!lineMatch) continue;
      if (seen.has(lineMatch[1])) {
        fail(`Drill manifest object ${block.name} duplicates property ${lineMatch[1]}`);
      }
      seen.add(lineMatch[1]);
    }
  }
  return blocks.map((block) => block.name);
}

function manifestNodeMap(parseResult, source) {
  if (
    !parseResult?.success
    || !Array.isArray(parseResult.ast)
    || (parseResult.errors?.length ?? 0) > 0
  ) {
    fail(
      'Adapter custody drill manifest failed HoloScript parsing: '
      + `${canonicalJson(parseResult?.errors ?? [])}`,
    );
  }
  const sourceNames = assertNoDuplicateManifestProperties(source);
  const parsedNames = parseResult.ast.map((node) => node.name);
  if (
    new Set(sourceNames).size !== sourceNames.length
    || new Set(parsedNames).size !== parsedNames.length
    || canonicalJson(sourceNames) !== canonicalJson(parsedNames)
  ) {
    fail('Adapter custody drill source/AST object identities differ');
  }
  return new Map(parseResult.ast.map((node) => [node.name, node.properties]));
}

function assertRoutePath(value, label) {
  assertNonEmptyString(value, label);
  if (!value.startsWith('/')) fail(`${label} must start with '/'`);
}

function assertHttpEndpoint(value, label) {
  assertNonEmptyString(value, label);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an absolute URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail(`${label} must be an http(s) URL`);
  }
}

function validateAndNormalizeRoute(node, name, pinned) {
  const route = structuredClone(node);
  assertExactKeys(route, ROUTE_SOURCE_KEYS, `route ${name}`);
  if (route.type !== 'adapter_route_declaration') {
    fail(`route ${name} has the wrong type`);
  }
  if (route.routeId !== pinned.routeId) {
    fail(`route ${name} routeId drifted from ${pinned.routeId}`);
  }
  if (route.transport !== 'openai-chat-completions-v1') {
    fail(`route ${name} transport drifted`);
  }
  if (route.endpoint !== pinned.endpoint) {
    fail(`route ${name} endpoint drifted from ${pinned.endpoint}`);
  }
  if (route.required !== pinned.required) {
    fail(`route ${name} required flag drifted`);
  }
  assertHttpEndpoint(route.endpoint, `route ${name} endpoint`);
  assertRoutePath(route.healthPath, `route ${name} healthPath`);
  assertRoutePath(route.modelsPath, `route ${name} modelsPath`);
  assertRoutePath(route.chatPath, `route ${name} chatPath`);
  assertPositiveInteger(route.maxOutputTokens, `route ${name} maxOutputTokens`);
  assertPositiveInteger(route.timeoutMs, `route ${name} timeoutMs`);
  if (route.retryCount !== 0) {
    fail(`route ${name} retryCount must be 0 (zero-retry by construction)`);
  }
  if (!Number.isFinite(route.temperature) || route.temperature < 0) {
    fail(`route ${name} temperature must be a finite non-negative number`);
  }
  if (!Number.isInteger(route.seedRequested)) {
    fail(`route ${name} seedRequested must be an integer`);
  }
  return {
    ceilings: {
      maxOutputTokens: route.maxOutputTokens,
      retryCount: route.retryCount,
      seedRequested: route.seedRequested,
      temperature: route.temperature,
      timeoutMs: route.timeoutMs,
    },
    chatPath: route.chatPath,
    endpoint: route.endpoint,
    healthPath: route.healthPath,
    modelsPath: route.modelsPath,
    required: route.required,
    routeId: route.routeId,
    transport: route.transport,
  };
}

export async function loadAdapterCustodyDrillManifest({
  hololandRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const corePath = resolveHoloScriptCorePath(hololandRoot);
  const core = await import(pathToFileURL(corePath).href);
  if (typeof core.HoloScriptCodeParser !== 'function') {
    fail('HoloScript core is missing HoloScriptCodeParser');
  }
  const source = normalizeSource(
    readFileSync(path.resolve(hololandRoot, ADAPTER_CUSTODY_DRILL_SOURCE_PATH), 'utf8'),
  );
  const parser = new core.HoloScriptCodeParser();
  const nodes = manifestNodeMap(parser.parse(source), source);
  if (
    canonicalJson([...nodes.keys()])
    !== canonicalJson([...EXPECTED_MANIFEST_OBJECT_NAMES])
  ) {
    fail('Adapter custody drill object set/order is not canonical');
  }

  const drill = structuredClone(nodes.get(EXPECTED_MANIFEST_OBJECT_NAMES[0]));
  assertExactKeys(drill, DRILL_KEYS, 'adapter custody drill');
  if (
    drill.type !== 'adapter_custody_drill'
    || drill.schemaId !== ADAPTER_CUSTODY_DRILL_SCHEMA
    || drill.drillId !== 'mv-b1-adapter-custody-v1'
    || drill.lane !== 'engineering_certification'
    || drill.routesDeclaredOpenly !== true
    || drill.sealedAliasAssignmentInScope !== false
    || drill.studyLaneClaimed !== false
  ) {
    fail('Adapter custody drill identity/lane declaration is invalid');
  }
  assertNonEmptyString(drill.laneStatement, 'drill laneStatement');
  if (
    !drill.laneStatement.includes('engineering certification lane')
    || !drill.laneStatement.includes('out of scope')
  ) {
    fail('Drill laneStatement must state the lane and the alias-assignment exclusion');
  }

  const routes = [
    validateAndNormalizeRoute(
      nodes.get(EXPECTED_MANIFEST_OBJECT_NAMES[1]),
      EXPECTED_MANIFEST_OBJECT_NAMES[1],
      {
        routeId: 'sovereign-holoserve-laptop',
        endpoint: 'http://127.0.0.1:8099',
        required: true,
      },
    ),
    validateAndNormalizeRoute(
      nodes.get(EXPECTED_MANIFEST_OBJECT_NAMES[2]),
      EXPECTED_MANIFEST_OBJECT_NAMES[2],
      {
        routeId: 'sovereign-holollama-jetson',
        endpoint: 'http://192.168.0.119:18080',
        required: false,
      },
    ),
  ];

  const prompt = structuredClone(nodes.get(EXPECTED_MANIFEST_OBJECT_NAMES[3]));
  assertExactKeys(prompt, PROMPT_KEYS, 'certification turn prompt');
  if (
    prompt.type !== 'certification_turn_prompt'
    || prompt.systemMessagePermitted !== false
    || prompt.messageCount !== 1
    || prompt.messageRole !== 'user'
  ) {
    fail('Certification turn prompt message policy is invalid');
  }
  assertNonEmptyString(prompt.promptTemplate, 'promptTemplate');
  if (
    !prompt.promptTemplate.includes('{"water": 2}')
    || !prompt.promptTemplate.includes('contribute_water')
    || !prompt.promptTemplate.includes('abstain')
    || !prompt.promptTemplate.includes('no other text')
  ) {
    fail('promptTemplate does not carry the canonical certification turn');
  }

  const vocabulary = structuredClone(nodes.get(EXPECTED_MANIFEST_OBJECT_NAMES[4]));
  assertExactKeys(vocabulary, VOCABULARY_KEYS, 'proposal vocabulary');
  if (
    vocabulary.type !== 'proposal_vocabulary'
    || vocabulary.defaultDecision !== 'deny'
  ) {
    fail('Proposal vocabulary type/defaultDecision is invalid');
  }
  assertStringArray(vocabulary.allowedActions, 'vocabulary allowedActions');
  assertStringArray(vocabulary.deniedActions, 'vocabulary deniedActions');
  assertStringArray(vocabulary.allowedTargets, 'vocabulary allowedTargets');
  assertStringArray(
    vocabulary.actionsRequiringTargetAndAmount,
    'vocabulary actionsRequiringTargetAndAmount',
  );
  assertStringArray(
    vocabulary.actionsRequiringNullTargetAndAmount,
    'vocabulary actionsRequiringNullTargetAndAmount',
  );
  for (const action of vocabulary.deniedActions) {
    if (vocabulary.allowedActions.includes(action)) {
      fail(`vocabulary action ${action} is both allowed and denied`);
    }
  }
  const shapeRuled = [
    ...vocabulary.actionsRequiringTargetAndAmount,
    ...vocabulary.actionsRequiringNullTargetAndAmount,
  ];
  if (
    new Set(shapeRuled).size !== shapeRuled.length
    || canonicalJson([...shapeRuled].sort())
      !== canonicalJson([...vocabulary.allowedActions].sort())
  ) {
    fail('vocabulary shape rules must partition allowedActions exactly');
  }
  assertPositiveInteger(vocabulary.amountMin, 'vocabulary amountMin');
  assertPositiveInteger(vocabulary.amountMax, 'vocabulary amountMax');
  if (vocabulary.amountMin > vocabulary.amountMax) {
    fail('vocabulary amountMin exceeds amountMax');
  }

  const bundle = { drill, prompt, routes, vocabulary };
  return deepFreeze({ ...bundle, manifestHash: canonicalDigest(bundle) });
}

// ---------------------------------------------------------------------------
// Shared runtime validation helpers.
// ---------------------------------------------------------------------------

function validateRuntimeRoute(route, label = 'route') {
  assertExactKeys(route, RUNTIME_ROUTE_KEYS, label);
  assertNonEmptyString(route.routeId, `${label}.routeId`);
  if (route.transport !== 'openai-chat-completions-v1') {
    fail(`${label}.transport is unsupported`);
  }
  assertHttpEndpoint(route.endpoint, `${label}.endpoint`);
  assertRoutePath(route.healthPath, `${label}.healthPath`);
  assertRoutePath(route.modelsPath, `${label}.modelsPath`);
  assertRoutePath(route.chatPath, `${label}.chatPath`);
  if (typeof route.required !== 'boolean') fail(`${label}.required must be boolean`);
  assertExactKeys(route.ceilings, CEILING_KEYS, `${label}.ceilings`);
  assertPositiveInteger(route.ceilings.maxOutputTokens, `${label}.ceilings.maxOutputTokens`);
  assertPositiveInteger(route.ceilings.timeoutMs, `${label}.ceilings.timeoutMs`);
  if (route.ceilings.retryCount !== 0) {
    fail(`${label}.ceilings.retryCount must be 0 (zero-retry by construction)`);
  }
  if (!Number.isFinite(route.ceilings.temperature) || route.ceilings.temperature < 0) {
    fail(`${label}.ceilings.temperature must be a finite non-negative number`);
  }
  if (!Number.isInteger(route.ceilings.seedRequested)) {
    fail(`${label}.ceilings.seedRequested must be an integer`);
  }
}

function validateCustodyStore(custodyStore) {
  if (
    !custodyStore
    || typeof custodyStore.sealObject !== 'function'
    || typeof custodyStore.readObject !== 'function'
  ) {
    fail('custodyStore must expose sealObject and readObject');
  }
}

/**
 * Closed-key vocabulary validation shared by validateDrillBundle and
 * parseProposal. A malformed vocabulary fails loud with a typed error
 * BEFORE any provider call — never as a bare TypeError after the response
 * has already been sealed (which would leave a provider interaction with
 * no ModelTurnReceipt).
 */
function validateVocabularyShape(vocabulary, label = 'vocabulary') {
  assertExactKeys(vocabulary, VOCABULARY_KEYS, label);
  assertStringArray(vocabulary.allowedActions, `${label}.allowedActions`);
  assertStringArray(vocabulary.deniedActions, `${label}.deniedActions`);
  assertStringArray(vocabulary.allowedTargets, `${label}.allowedTargets`);
  assertStringArray(
    vocabulary.actionsRequiringTargetAndAmount,
    `${label}.actionsRequiringTargetAndAmount`,
  );
  assertStringArray(
    vocabulary.actionsRequiringNullTargetAndAmount,
    `${label}.actionsRequiringNullTargetAndAmount`,
  );
  assertPositiveInteger(vocabulary.amountMin, `${label}.amountMin`);
  assertPositiveInteger(vocabulary.amountMax, `${label}.amountMax`);
}

function validateDrillBundle(drill) {
  assertObject(drill, 'drill bundle');
  assertObject(drill.prompt, 'drill bundle prompt');
  assertNonEmptyString(drill.prompt.promptTemplate, 'drill bundle promptTemplate');
  validateVocabularyShape(drill.vocabulary, 'drill bundle vocabulary');
}

function validatePriorReceiptHash(priorReceiptHash) {
  assertSha256(priorReceiptHash, 'priorReceiptHash');
}

/**
 * Content-addressed idempotent seal. The custody store refuses duplicate
 * plaintext by throwing CustodyDuplicateObjectError carrying the existing
 * custodyId — for this runtime a duplicate is PROOF of custody, not a
 * failure: repeated turns replay the identical certification request bytes
 * (the six-resident lane replays one prompt per route), and two routes
 * served by the same software can return byte-identical health bodies.
 * Both reuse the existing custodyId instead of throwing past the receipt
 * boundary. Detection is by error name + custodyId because the store is an
 * injected duck-typed dependency, never imported here.
 */
async function sealBytes(custodyStore, bytes, kind, label) {
  let sealed;
  try {
    sealed = await custodyStore.sealObject({ bytes, kind, label });
  } catch (error) {
    if (
      error?.name === 'CustodyDuplicateObjectError'
      && typeof error.custodyId === 'string'
      && error.custodyId.length > 0
    ) {
      return error.custodyId;
    }
    throw error;
  }
  if (!sealed || typeof sealed.custodyId !== 'string' || sealed.custodyId.length === 0) {
    fail(`custodyStore.sealObject did not return a custodyId for ${label}`);
  }
  return sealed.custodyId;
}

/**
 * Bounded body read. AbortSignal.timeout on the fetch also aborts the body
 * stream, and this cap bounds MEMORY independently of time. Falls back to
 * arrayBuffer (still cap-checked) when a fetch stub exposes no stream.
 */
async function readBodyBounded(response, maxBytes) {
  const overflow = () => {
    const error = new Error(
      `response body exceeds the ${maxBytes}-byte public drill cap`,
    );
    error.name = 'ResponseTooLargeError';
    return error;
  };
  if (!response.body || typeof response.body.getReader !== 'function') {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw overflow();
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw overflow();
      chunks.push(Buffer.from(value));
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The stream already errored or closed; nothing left to release.
    }
  }
  return Buffer.concat(chunks);
}

function classifyTransportErrorName(name) {
  return name === 'TimeoutError' || name === 'AbortError'
    ? 'transport_timeout'
    : 'transport_error';
}

function tryParseJsonBytes(bytes) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    return null;
  }
}

function reportedString(value) {
  if (
    typeof value === 'string'
    && value.length > 0
    && value.length <= REPORTED_STRING_MAX_LENGTH
  ) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function pickReportedString(payload, keys) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  for (const key of keys) {
    const candidate = reportedString(payload[key]);
    if (candidate !== null) return candidate;
  }
  return null;
}

/**
 * Public-receipt usage projection (spec lines 288-289): usage is a
 * provider-controlled subtree, so it is projected to a CLOSED set of
 * non-negative integer token counts. Arbitrary keys, nested objects, and
 * strings are dropped — a provider echoing prompt/response/scratchpad text
 * under usage cannot export raw model text into the durable public receipt.
 * verifyModelTurnReceipt enforces the same closed shape.
 */
function sanitizeReportedUsage(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const projected = {};
  for (const key of USAGE_REPORTED_KEYS) {
    const value = usage[key];
    if (Number.isInteger(value) && value >= 0) projected[key] = value;
  }
  return Object.keys(projected).length > 0 ? projected : null;
}

function buildSerializerDescriptor(transport) {
  return {
    messageShape: ['content', 'role'],
    // 'model' is on the wire ONLY when certification reported a model id
    // (the /v1/models probe is optional), so it is declared as a conditional
    // field — the pinned descriptor describes the actual serialized bytes in
    // both branches instead of asserting a key the wire request may omit.
    optionalRequestFields: { model: 'present-only-when-model-id-reported' },
    requestShape: ['max_tokens', 'messages', 'seed', 'temperature'],
    serializerVersion: SERIALIZER_VERSION,
    transport,
  };
}

function sealReceipt(unsigned) {
  return deepFreeze({ ...unsigned, receiptHash: canonicalDigest(unsigned) });
}

// ---------------------------------------------------------------------------
// Adapter route certification (spec lines 206-228).
// ---------------------------------------------------------------------------

export async function certifyLockedAdapterRoute({
  route,
  drill,
  custodyStore,
  operator,
  priorReceiptHash = GENESIS_RECEIPT_HASH,
  fetchImpl = globalThis.fetch,
}) {
  validateRuntimeRoute(route);
  validateDrillBundle(drill);
  validateCustodyStore(custodyStore);
  assertNonEmptyString(operator, 'operator');
  validatePriorReceiptHash(priorReceiptHash);
  if (typeof fetchImpl !== 'function') fail('fetchImpl must be a function');

  const serializerHash = canonicalDigest(buildSerializerDescriptor(route.transport));
  const promptTemplateHash = sha256HexOfBytes(
    Buffer.from(drill.prompt.promptTemplate, 'utf8'),
  );

  let certified = false;
  let failureReason = null;
  let modelIdReported = null;
  let processInstanceId = null;
  let packageVersionReported = null;
  const evidenceCustodyIds = [];
  const startedAt = Date.now();

  // Certification failures are receipted, never thrown (probe lane). The
  // failure phase is tracked so the public failureReason states what
  // actually failed: an endpoint that answered but whose evidence could not
  // be sealed is 'evidence_seal_failed', never laundered into a false
  // 'health_probe_unreachable' claim.
  let failurePhase = 'health_probe_unreachable';
  try {
    const healthResponse = await fetchImpl(
      new URL(route.healthPath, route.endpoint).href,
      { method: 'GET', signal: AbortSignal.timeout(route.ceilings.timeoutMs) },
    );
    failurePhase = 'health_probe_body_read_failed';
    const healthBytes = await readBodyBounded(
      healthResponse,
      MAX_RESPONSE_BODY_BYTES,
    );
    failurePhase = 'evidence_seal_failed';
    evidenceCustodyIds.push(await sealBytes(
      custodyStore,
      healthBytes,
      'adapter-route-health-probe',
      `${route.routeId}:health`,
    ));
    if (!healthResponse.ok) {
      failureReason = `health_probe_http_${healthResponse.status}`;
    } else {
      // Evidence tier is server-reported: these values are whatever the
      // server chose to report, not verified revision custody.
      const healthPayload = tryParseJsonBytes(healthBytes);
      processInstanceId = pickReportedString(healthPayload, [
        'process_instance_id',
        'processInstanceId',
        'instance_id',
        'instanceId',
        'pid',
      ]);
      packageVersionReported = pickReportedString(healthPayload, [
        'version',
        'package_version',
        'packageVersion',
      ]);
      try {
        const modelsResponse = await fetchImpl(
          new URL(route.modelsPath, route.endpoint).href,
          { method: 'GET', signal: AbortSignal.timeout(route.ceilings.timeoutMs) },
        );
        const modelsBytes = await readBodyBounded(
          modelsResponse,
          MAX_RESPONSE_BODY_BYTES,
        );
        evidenceCustodyIds.push(await sealBytes(
          custodyStore,
          modelsBytes,
          'adapter-route-models-probe',
          `${route.routeId}:models`,
        ));
        if (modelsResponse.ok) {
          const modelsPayload = tryParseJsonBytes(modelsBytes);
          const firstModel = Array.isArray(modelsPayload?.data)
            ? modelsPayload.data[0]
            : null;
          modelIdReported = reportedString(firstModel?.id);
        }
      } catch {
        // The models probe is optional; health evidence stands on its own.
      }
      certified = true;
    }
  } catch (error) {
    failureReason = `${failurePhase}:${error?.name ?? 'Error'}`;
  }

  const unsigned = {
    at: new Date().toISOString(),
    cacheStateEvidence: { ...CACHE_STATE_EVIDENCE },
    ceilings: { ...route.ceilings },
    certified,
    endpoint: route.endpoint,
    engine: ADAPTER_RUNTIME_ENGINE,
    failureReason,
    fallbackDisabled: true,
    fallbackEvidence: FALLBACK_EVIDENCE,
    hiddenPromptEnhancement: HIDDEN_PROMPT_ENHANCEMENT_EVIDENCE,
    priorReceiptHash,
    probeLatencyMs: Math.max(0, Date.now() - startedAt),
    promptTemplateHash,
    revisionEvidence: {
      evidenceCustodyIds,
      modelIdReported,
      packageVersionReported,
      processInstanceId,
      tier: 'server-reported',
    },
    routeId: route.routeId,
    schema: ADAPTER_CERTIFICATION_SCHEMA,
    serializerHash,
    transport: route.transport,
  };
  return sealReceipt(unsigned);
}

// ---------------------------------------------------------------------------
// Strict proposal parsing (default deny; spec line 297 and vocabulary data).
// The rules applied here are vocabulary manifest DATA, not JS-authored policy.
// ---------------------------------------------------------------------------

export function parseProposal(text, vocabulary) {
  validateVocabularyShape(vocabulary, 'vocabulary');
  const deny = (reason) => Object.freeze({ decision: 'deny', reason });
  if (typeof text !== 'string' || text.length === 0) {
    return deny('proposal-not-a-string');
  }
  let parsed;
  try {
    // JSON.parse admits only one complete JSON value; any surrounding prose
    // or a second object fails here and falls to default deny.
    parsed = JSON.parse(text);
  } catch {
    return deny('proposal-not-exactly-one-json-object');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return deny('proposal-not-a-json-object');
  }
  const actualKeys = Object.keys(parsed).sort();
  if (canonicalJson(actualKeys) !== canonicalJson([...PROPOSAL_OBJECT_KEYS])) {
    return deny('proposal-keys-not-closed');
  }
  const { action, amount, reason, target } = parsed;
  if (typeof action !== 'string') return deny('proposal-action-not-a-string');
  if (vocabulary.deniedActions.includes(action)) return deny('denied-action');
  if (!vocabulary.allowedActions.includes(action)) return deny('unknown-action');
  if (
    typeof reason !== 'string'
    || reason.length === 0
    || reason.length > PROPOSAL_REASON_MAX_LENGTH
  ) {
    return deny('proposal-reason-not-short-string');
  }
  if (vocabulary.actionsRequiringNullTargetAndAmount.includes(action)) {
    if (target !== null || amount !== null) {
      return deny('null-shape-action-requires-null-target-and-amount');
    }
  } else if (vocabulary.actionsRequiringTargetAndAmount.includes(action)) {
    if (typeof target !== 'string' || !vocabulary.allowedTargets.includes(target)) {
      return deny('unknown-target');
    }
    if (
      !Number.isInteger(amount)
      || amount < vocabulary.amountMin
      || amount > vocabulary.amountMax
    ) {
      return deny('amount-out-of-bounds');
    }
  } else {
    return deny('action-shape-rule-missing');
  }
  return Object.freeze({
    decision: 'valid_proposal',
    parsed: Object.freeze({ action, amount, reason, target }),
  });
}

function boundedPublicProposal(parsed) {
  // Public receipts never carry raw model text (spec lines 288-289): the
  // free-form reason field is projected to its hash and length only.
  return {
    action: parsed.action,
    amount: parsed.amount,
    reasonLength: parsed.reason.length,
    reasonSha256: sha256HexOfBytes(Buffer.from(parsed.reason, 'utf8')),
    target: parsed.target,
  };
}

// ---------------------------------------------------------------------------
// Certified model turn execution (spec lines 278-291).
// ---------------------------------------------------------------------------

export async function executeCertifiedModelTurn({
  route,
  certification,
  drill,
  custodyStore,
  operator,
  priorReceiptHash = GENESIS_RECEIPT_HASH,
  fetchImpl = globalThis.fetch,
}) {
  validateRuntimeRoute(route);
  validateDrillBundle(drill);
  validateCustodyStore(custodyStore);
  assertNonEmptyString(operator, 'operator');
  validatePriorReceiptHash(priorReceiptHash);
  if (typeof fetchImpl !== 'function') fail('fetchImpl must be a function');

  const certificationCheck = verifyAdapterCertificationReceipt(certification);
  if (!certificationCheck.ok) {
    fail(`certification receipt is invalid: ${certificationCheck.failureReason}`);
  }
  if (certification.certified !== true) {
    fail('route is not certified; refusing to execute a model turn');
  }
  if (certification.routeId !== route.routeId || certification.endpoint !== route.endpoint) {
    fail('certification receipt does not bind this route');
  }

  // Render the template EXACTLY. The template is the complete single user
  // message; no system message, no additions, no substitutions.
  const promptContent = drill.prompt.promptTemplate;
  const requestBody = {};
  if (typeof certification.revisionEvidence.modelIdReported === 'string') {
    requestBody.model = certification.revisionEvidence.modelIdReported;
  }
  requestBody.messages = [{ role: 'user', content: promptContent }];
  requestBody.temperature = route.ceilings.temperature;
  requestBody.max_tokens = route.ceilings.maxOutputTokens;
  requestBody.seed = route.ceilings.seedRequested;

  // Serialize ONCE; these exact bytes are hashed, sealed, and sent. Any
  // hidden prompt enhancement would break promptHash against the wire bytes.
  const requestBytes = Buffer.from(JSON.stringify(requestBody), 'utf8');
  const promptHash = sha256HexOfBytes(requestBytes);
  const requestCustodyId = await sealBytes(
    custodyStore,
    requestBytes,
    'model-turn-request',
    `${route.routeId}:turn-request`,
  );

  const baseReceipt = (overrides) => sealReceipt({
    at: new Date().toISOString(),
    cacheStateEvidence: { ...CACHE_STATE_EVIDENCE },
    endpoint: route.endpoint,
    engine: ADAPTER_RUNTIME_ENGINE,
    fallbackEvidence: FALLBACK_EVIDENCE,
    generationParameters: {
      maxOutputTokens: route.ceilings.maxOutputTokens,
      seedAcceptedEvidence: 'unverified',
      seedRequested: route.ceilings.seedRequested,
      temperature: route.ceilings.temperature,
    },
    priorReceiptHash,
    promptHash,
    retries: 0,
    revisionEvidence: structuredClone(certification.revisionEvidence),
    routeId: route.routeId,
    schema: MODEL_TURN_RECEIPT_SCHEMA,
    ...overrides,
  });

  const failedTurn = (errorClass, proposalReason, latencyMs) => baseReceipt({
    custodyRefs: { requestCustodyId, responseCustodyId: null },
    errorClass,
    latencyMs,
    parsedProposal: null,
    proposalDecision: 'not_evaluated',
    proposalReason,
    responseHash: null,
    turnCompleted: false,
    usageReported: null,
  });

  // ONE request. retryCount is 0 by construction: there is no retry loop and
  // no second fetch call on any code path below.
  const startedAt = Date.now();
  let response;
  try {
    response = await fetchImpl(new URL(route.chatPath, route.endpoint).href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: requestBytes,
      signal: AbortSignal.timeout(route.ceilings.timeoutMs),
    });
  } catch (error) {
    return failedTurn(
      classifyTransportErrorName(error?.name),
      'no-response-received-transport-failure',
      Math.max(0, Date.now() - startedAt),
    );
  }
  if (!response.ok) {
    return failedTurn(
      `http_${response.status}`,
      'no-usable-response-http-error',
      Math.max(0, Date.now() - startedAt),
    );
  }

  // The body read is a transport step too: a server that returns 200 headers
  // and then dies mid-body (socket reset, truncated content-length, abort
  // firing during the stream) is receipted as a failed turn — it never
  // escapes as an unreceipted exception. The read is also byte-capped.
  let responseBytes;
  try {
    responseBytes = await readBodyBounded(response, MAX_RESPONSE_BODY_BYTES);
  } catch (error) {
    const errorClass = error?.name === 'ResponseTooLargeError'
      ? 'response_body_too_large'
      : classifyTransportErrorName(error?.name);
    return failedTurn(
      errorClass,
      'response-body-read-failed',
      Math.max(0, Date.now() - startedAt),
    );
  }
  const latencyMs = Math.max(0, Date.now() - startedAt);
  const responseHash = sha256HexOfBytes(responseBytes);
  const responseCustodyId = await sealBytes(
    custodyStore,
    responseBytes,
    'model-turn-response',
    `${route.routeId}:turn-response`,
  );

  const envelope = tryParseJsonBytes(responseBytes);
  const content = envelope?.choices?.[0]?.message?.content;
  let parsedProposal = null;
  let proposalDecision;
  let proposalReason;
  if (typeof content !== 'string') {
    proposalDecision = 'deny';
    proposalReason = 'missing-choices-message-content';
  } else {
    const evaluated = parseProposal(content, drill.vocabulary);
    if (evaluated.decision === 'valid_proposal') {
      proposalDecision = 'valid_proposal';
      proposalReason = 'vocabulary-valid-proposal';
      parsedProposal = boundedPublicProposal(evaluated.parsed);
    } else {
      proposalDecision = 'deny';
      proposalReason = evaluated.reason;
    }
  }

  return baseReceipt({
    custodyRefs: { requestCustodyId, responseCustodyId },
    errorClass: null,
    latencyMs,
    parsedProposal,
    proposalDecision,
    proposalReason,
    responseHash,
    turnCompleted: true,
    usageReported: sanitizeReportedUsage(envelope?.usage),
  });
}

// ---------------------------------------------------------------------------
// Receipt verification (closed keys, schema pin, hash recompute).
// ---------------------------------------------------------------------------

function verifyReceiptCore(receipt, { schema, keys, label, extra }) {
  try {
    assertExactKeys(receipt, keys, label);
    if (receipt.schema !== schema) fail(`${label} schema is not ${schema}`);
    if (receipt.engine !== ADAPTER_RUNTIME_ENGINE) {
      fail(`${label} engine is not ${ADAPTER_RUNTIME_ENGINE}`);
    }
    assertSha256(receipt.priorReceiptHash, `${label}.priorReceiptHash`);
    assertExactKeys(
      receipt.revisionEvidence,
      REVISION_EVIDENCE_KEYS,
      `${label}.revisionEvidence`,
    );
    if (receipt.revisionEvidence.tier !== 'server-reported') {
      fail(`${label}.revisionEvidence.tier must be server-reported`);
    }
    if (!Array.isArray(receipt.revisionEvidence.evidenceCustodyIds)) {
      fail(`${label}.revisionEvidence.evidenceCustodyIds must be an array`);
    }
    assertExactKeys(
      receipt.cacheStateEvidence,
      CACHE_STATE_EVIDENCE_KEYS,
      `${label}.cacheStateEvidence`,
    );
    if (
      receipt.cacheStateEvidence.providerCacheControlProbed
        !== CACHE_STATE_EVIDENCE.providerCacheControlProbed
      || receipt.cacheStateEvidence.state !== CACHE_STATE_EVIDENCE.state
    ) {
      fail(
        `${label}.cacheStateEvidence must assert only the unprobed `
        + 'unknown-contamination state (no cache probe exists in this engine)',
      );
    }
    extra(receipt);
    const { receiptHash, ...unsigned } = receipt;
    assertSha256(receiptHash, `${label}.receiptHash`);
    if (canonicalDigest(unsigned) !== receiptHash) {
      fail(`${label} receiptHash does not recompute`);
    }
    return { ok: true, failureReason: null };
  } catch (error) {
    return { ok: false, failureReason: error?.message ?? String(error) };
  }
}

export function verifyAdapterCertificationReceipt(receipt) {
  return verifyReceiptCore(receipt, {
    schema: ADAPTER_CERTIFICATION_SCHEMA,
    keys: CERTIFICATION_RECEIPT_KEYS,
    label: 'adapter certification receipt',
    extra: (value) => {
      if (typeof value.certified !== 'boolean') {
        fail('adapter certification receipt certified must be boolean');
      }
      if (value.fallbackDisabled !== true) {
        fail('adapter certification receipt fallbackDisabled must be true');
      }
      if (value.fallbackEvidence !== FALLBACK_EVIDENCE) {
        fail('adapter certification receipt fallbackEvidence drifted');
      }
      if (value.hiddenPromptEnhancement !== HIDDEN_PROMPT_ENHANCEMENT_EVIDENCE) {
        fail('adapter certification receipt hiddenPromptEnhancement drifted');
      }
      assertExactKeys(value.ceilings, CEILING_KEYS, 'certification ceilings');
      assertSha256(value.serializerHash, 'certification serializerHash');
      assertSha256(value.promptTemplateHash, 'certification promptTemplateHash');
      if (value.certified === false && typeof value.failureReason !== 'string') {
        fail('uncertified receipt must carry a failureReason string');
      }
    },
  });
}

export function verifyModelTurnReceipt(receipt) {
  return verifyReceiptCore(receipt, {
    schema: MODEL_TURN_RECEIPT_SCHEMA,
    keys: MODEL_TURN_RECEIPT_KEYS,
    label: 'model turn receipt',
    extra: (value) => {
      if (typeof value.turnCompleted !== 'boolean') {
        fail('model turn receipt turnCompleted must be boolean');
      }
      if (value.retries !== 0) {
        fail('model turn receipt retries must be 0 (zero-retry by construction)');
      }
      if (value.fallbackEvidence !== FALLBACK_EVIDENCE) {
        fail('model turn receipt fallbackEvidence drifted');
      }
      assertSha256(value.promptHash, 'model turn promptHash');
      assertExactKeys(
        value.generationParameters,
        GENERATION_PARAMETER_KEYS,
        'model turn generationParameters',
      );
      if (value.generationParameters.seedAcceptedEvidence !== 'unverified') {
        fail('model turn seedAcceptedEvidence must be unverified');
      }
      assertExactKeys(value.custodyRefs, CUSTODY_REF_KEYS, 'model turn custodyRefs');
      assertNonEmptyString(value.custodyRefs.requestCustodyId, 'requestCustodyId');
      if (value.turnCompleted === true) {
        assertSha256(value.responseHash, 'model turn responseHash');
        assertNonEmptyString(value.custodyRefs.responseCustodyId, 'responseCustodyId');
        if (value.errorClass !== null) {
          fail('completed model turn must have null errorClass');
        }
      } else {
        if (value.responseHash !== null) {
          fail('failed model turn must have null responseHash');
        }
        if (value.custodyRefs.responseCustodyId !== null) {
          fail('failed model turn must have null responseCustodyId');
        }
        assertNonEmptyString(value.errorClass, 'failed model turn errorClass');
      }
      if (value.parsedProposal !== null) {
        assertExactKeys(
          value.parsedProposal,
          PUBLIC_PARSED_PROPOSAL_KEYS,
          'model turn parsedProposal',
        );
        assertSha256(value.parsedProposal.reasonSha256, 'parsedProposal.reasonSha256');
      }
      // Closed usage shape (spec lines 288-289): a receipt whose usage
      // subtree carries anything beyond non-negative integer token counts
      // does not verify — raw model-adjacent text cannot hide there.
      if (value.usageReported !== null) {
        assertObject(value.usageReported, 'model turn usageReported');
        const usageKeys = Object.keys(value.usageReported);
        if (usageKeys.length === 0) {
          fail('model turn usageReported must be null when no token counts survive');
        }
        for (const key of usageKeys) {
          if (!USAGE_REPORTED_KEYS.includes(key)) {
            fail(
              `model turn usageReported key '${key}' is outside the closed `
              + 'token-count set',
            );
          }
          const count = value.usageReported[key];
          if (!Number.isInteger(count) || count < 0) {
            fail(`model turn usageReported.${key} must be a non-negative integer`);
          }
        }
      }
    },
  });
}
