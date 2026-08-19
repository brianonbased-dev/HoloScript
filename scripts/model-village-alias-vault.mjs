/* global Buffer */

/**
 * Model Village MV-B3 sealed adapter-alias assignment vault (CUSTODY LANE).
 *
 * Implements the spec's blinding requirement
 * (docs/specs/HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md, "Isolation and blinding",
 * lines 188-204): model and adapter identity is sealed until analysis;
 * residents and observers never receive adapter identity or provider route.
 * The frozen `adapter_a` / `adapter_b` / `adapter_c` aliases are public study
 * vocabulary (they are declared openly in
 * source/proofs/model-village-trial-kernel.hs); the mapping from those
 * aliases to certified provider ROUTES is the sealed secret.
 *
 * Language boundary (spec "Source layout"): this module is JavaScript
 * transport, canonicalization, sealing, and verification only. It contains no
 * resident reasoning, no village rules, no experimental treatments, no
 * scoring policy, and no model-specific behavior. The assignment matrix is
 * canonical `.hs` source DATA read through the shipped extractor, never
 * re-authored here.
 *
 * ===========================================================================
 * THE BLINDING LAW (the load-bearing rule of this module)
 * ===========================================================================
 * The alias -> route map may exist ONLY inside the encrypted custody store
 * and in the caller's memory on a successful, authorized unblinding. It must
 * NEVER appear in a public receipt field, a log line, a thrown error message,
 * a filename, or any `.hs` / `.holo` source. Public artifacts carry
 * COMMITMENTS (salted hashes) only.
 *
 * Consequences enforced in code:
 * - Every error message raised here is mapping-free: it names neither a
 *   routeId nor which aliases collided. `distinctRouteCount` is already a
 *   public aggregate; naming WHICH two aliases share a route would leak
 *   strictly more than the public commitment does, so the messages stay
 *   generic on purpose (see failBlind).
 * - verifyAliasAssignmentCommitment runs an ACTIVE anti-leak audit over every
 *   string in the artifact (ROUTE_SHAPED_PATTERNS) and fails a commitment
 *   that carries anything route-shaped, rather than trusting construction.
 * - issueUnblindingReceipt is FAIL-NEUTRAL: on any refusal it returns a
 *   receipt with failNeutral true, revealed null, and every unproven field
 *   null. It never throws, and a refusal never echoes a field from an
 *   unverified commitment (an attacker-supplied "commitment" could otherwise
 *   smuggle a route string into a receipt this module signed).
 *
 * ===========================================================================
 * HIDING LIMIT — stated plainly, not overclaimed
 * ===========================================================================
 * aliasCommitments[alias] = canonicalDigest({ alias, routeId, salt }).
 *
 * What this buys: including `alias` in the preimage means two aliases sharing
 * ONE route still produce DIFFERENT commitments, so the public commitment set
 * never reveals which aliases were paired under route reuse (only the
 * aggregate distinctRouteCount discloses that reuse happened at all).
 *
 * The converse, honestly: the alias set is public and fixed at three, and the
 * candidate routeId set is small and public (the engineering lane declares its
 * routes openly). Within THIS ARTIFACT the 32-byte salt is the only thing
 * between an attacker and the full mapping. With the salt sealed, a guess
 * cannot be confirmed here. If the salt ever leaks — a copied sealed record, a
 * backup that widened key custody, a recovered content key — the mapping is
 * recoverable by enumerating at most |aliases| x |routes| digests, which is
 * trivially small.
 *
 * TWO PRECONDITIONS THIS MODULE CANNOT ENFORCE ALONE, stated because the
 * original wording ("secrecy reduces ENTIRELY to salt secrecy") was FALSE
 * without them and was falsified in review:
 *
 *  1. The CALLER must not choose the assignment by a rule that is a
 *     deterministic function of public source. A salted commitment hides a
 *     mapping the reader cannot otherwise predict; it hides nothing if the
 *     reader can recompute the mapping from the tracked file that produced it
 *     and then simply believe it. sealAliasAssignment therefore takes the map
 *     as caller input and cannot check this — the shipped caller
 *     (check-hololand-model-village-alias-custody.mjs) draws the assignment
 *     with a CSPRNG for exactly this reason, and states the residual candidate
 *     space in its claim boundary.
 *  2. No SIBLING public artifact of the same run may publish a bare digest
 *     whose preimage is route-correlated (the provider's raw response bytes,
 *     or a receipt embedding them). Such a digest is a replay-and-compare
 *     oracle that recovers the route for a capture, and a public seat->alias
 *     allocation then converts that into an element of this mapping. The
 *     captured-response lane nulls those digests under blinding and publishes
 *     salted commitments instead.
 *
 * Therefore this module claims: GIVEN a caller-chosen assignment that is not
 * publicly derivable, and given no sibling artifact publishing a
 * route-correlated bare digest, mapping secrecy reduces to salt secrecy, which
 * reduces to custody-key secrecy. It does NOT claim information-theoretic
 * hiding, it does NOT claim the mapping survives a compromised custody store,
 * and it does NOT claim to hide the residual aggregate distinctRouteCount,
 * which is published on purpose.
 *
 * ===========================================================================
 * CLAIM BOUNDARY (what this slice does NOT claim)
 * ===========================================================================
 * Not a live study run. Not Phase 1 admission or readiness. Not a blinded
 * EVALUATION (behavioral blinding is explicitly not claimed by the spec).
 * Not post-lock presentation execution — profile admission is the
 * presentation lane's contract in
 * source/domains/agents/model-village-art-direction.hsplus, which itself
 * declares postlockPolicyExecutionStatus
 * "declarative_source_contract_not_observed_runtime_execution". Not
 * family-to-model attribution. And it does NOT change the frozen phase0b
 * plan: that lane still runs its synthetic captured responses, unmodified.
 *
 * Lane convergence: where a field here shares a name with the presentation
 * lane's declarative structs (commitmentId, canonicalHash, priorReceiptHash,
 * terminalCommitmentId, terminalCommitmentHash, runId,
 * assignmentManifestHash, failNeutral) the name is reused EXACTLY so the
 * custody-issued receipt can be lifted into that lane's richer typed artifact
 * without renaming. The declared chain is terminalCommitment -> unblinding
 * receipt -> family-binding receipt (art-direction lines 706-713); this module
 * issues the middle link and chains its priorReceiptHash from the terminal
 * commitment accordingly.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GENESIS_RECEIPT_HASH,
  verifyAdapterCertificationReceipt,
} from './model-village-adapter-runtime.mjs';
import { extractCanonicalAdapterMatrix } from './model-village-canonical-lifecycle.mjs';
import {
  canonicalDigest,
  canonicalJson,
} from './model-village-phase0b-runtime.mjs';

export const ALIAS_VAULT_SCHEMA = 'hololand.model-village-alias-vault.v1';
export const ALIAS_ASSIGNMENT_COMMITMENT_SCHEMA =
  'hololand.model-village-alias-assignment-commitment.v1';
export const UNBLINDING_RECEIPT_SCHEMA =
  'hololand.model-village-unblinding-receipt.v1';
export const ALIAS_VAULT_ENGINE = 'hololand-model-village-alias-vault-v1';

const KERNEL_SOURCE_PATH = 'source/proofs/model-village-trial-kernel.hs';
const CUSTODY_KIND = 'alias-assignment-vault';
const SALT_BYTE_LENGTH = 32;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SALT_PATTERN = /^[a-f0-9]{64}$/;
const BLOCK_IDS = Object.freeze(['block1', 'block2', 'block3']);

/**
 * The three frozen study aliases (kernel object ModelVillageStudyMatrix
 * modelAdapters). Public vocabulary — it is the alias-to-route MAP that is
 * sealed, never the alias names themselves.
 */
const STUDY_ALIASES = Object.freeze(['adapter_a', 'adapter_b', 'adapter_c']);

/**
 * MV-B3 run-id naming law. MV-B2 exports its own RUN_ID_PATTERN for `mv-b2-`
 * ids; that export is deliberately untouched. MV-B3 ids are LOCAL to this
 * module so the two lanes cannot silently accept each other's run ids.
 */
const MV_B3_RUN_ID_PATTERN = /^mv-b3-[a-z0-9][a-z0-9-]*$/;

/**
 * Active anti-leak audit patterns. A public MV-B3 artifact carrying any
 * string that looks like a provider route has already failed the blinding
 * law, regardless of which field it hid in.
 *
 * Every pattern is deliberately UNANCHORED (substring, not prefix). An
 * anchored `^sovereign-` rule only catches a routeId that is the whole value;
 * a leak that concatenates the route into a longer string — `sealed-by-
 * <routeId>`, an error echo, a composed label — walks straight past it. That
 * exact hole was caught by the suite before this module shipped, which is why
 * the rule is substring-scoped now. No legitimate MV-B3 public field
 * (schemas, engine id, blockId, sha256 hex, ISO timestamps) contains any of
 * these fragments, so the strictness costs nothing.
 */
const ROUTE_SHAPED_PATTERNS = Object.freeze([
  /sovereign-/i,
  /:\/\//,
  /https?:/i,
  /localhost/i,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
]);

const COMMITMENT_KEYS = Object.freeze([
  'aliasCommitments',
  'assignmentManifestHash',
  'at',
  'blockId',
  'certificationCommitment',
  'certifiedRouteCount',
  'distinctRouteCount',
  'engine',
  'kernelSourceHash',
  'priorReceiptHash',
  'receiptHash',
  'routeReuseDeclared',
  'schema',
  'sealedRecordHash',
  'vaultCustodyId',
]);

const VAULT_RECORD_KEYS = Object.freeze([
  'aliasRouteMap',
  'blockId',
  'certificationReceiptHashes',
  'salt',
  'schema',
  'seatBindings',
  'sealedAt',
]);

const SEAT_BINDING_KEYS = Object.freeze([
  'adapter_alias',
  'assignment_manifest_hash',
  'persona_id',
  'resident_id',
  'run_id',
  'seat_id',
]);

const UNBLINDING_RECEIPT_KEYS = Object.freeze([
  'aliasCommitmentsVerified',
  'assignmentManifestHash',
  'at',
  'authorizedBy',
  'canonicalHash',
  'commitmentId',
  'engine',
  'failNeutral',
  'priorReceiptHash',
  'receiptHash',
  'receiptId',
  'revealedInReceipt',
  'runId',
  'schema',
  'terminalCommitmentHash',
  'terminalCommitmentId',
]);

const TERMINAL_COMMITMENT_KEYS = Object.freeze([
  'assignmentManifestHash',
  'canonicalHash',
  'commitmentId',
  'runId',
]);

const AUTHORIZATION_KEYS = Object.freeze(['dataCustodian', 'protocolLead']);

/** Typed error for every alias-vault failure. Messages are mapping-free. */
export class ModelVillageAliasVaultError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelVillageAliasVaultError';
  }
}

/**
 * Every throw in this module goes through here. The message must never name a
 * routeId, an endpoint, or which aliases collided — a thrown error is one of
 * the leak surfaces the blinding law closes.
 */
function failBlind(message) {
  throw new ModelVillageAliasVaultError(message);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function isoNow() {
  return new Date().toISOString();
}

function normalizeSource(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failBlind(`${label} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    const missing = expected.filter((key) => !actual.includes(key));
    const unexpected = actual.filter((key) => !expected.includes(key));
    failBlind(
      `${label} keys differ; missing=${canonicalJson(missing)} `
      + `unexpected=${canonicalJson(unexpected)}`,
    );
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    failBlind(`${label} must be a non-empty string`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    failBlind(`${label} must be lowercase sha256 hex`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') failBlind(`${label} must be a boolean`);
}

function assertBlockId(value, label) {
  if (!BLOCK_IDS.includes(value)) {
    failBlind(`${label} must be one of ${canonicalJson([...BLOCK_IDS])}`);
  }
}

/**
 * Route-shaped string audit. Walks keys and string values recursively. This
 * is deliberately an ACTIVE assertion rather than a construction-time
 * comfort: a future field, a future caller, or a doctored artifact that
 * smuggles an endpoint into a public receipt fails verification loudly
 * instead of shipping a broken blind.
 */
function assertNoRouteShapedStrings(value, label) {
  const visit = (node, nodeLabel) => {
    if (typeof node === 'string') {
      for (const pattern of ROUTE_SHAPED_PATTERNS) {
        if (pattern.test(node)) {
          // The offending value is NOT echoed — that would re-leak it.
          failBlind(
            `${nodeLabel} carries a route-shaped string; public MV-B3 `
            + 'artifacts carry commitments only (blinding law)',
          );
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${nodeLabel}[${index}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        visit(key, `${nodeLabel} key`);
        visit(node[key], `${nodeLabel}.${key}`);
      }
    }
  };
  visit(value, label);
}

function sealCommitment(unsigned) {
  return deepFreeze({ ...unsigned, receiptHash: canonicalDigest(unsigned) });
}

/**
 * Two-stage receipt hashing for the unblinding receipt.
 *
 * `canonicalHash` is the canonical digest of the receipt BODY (every field
 * except canonicalHash and receiptHash). It exists because the presentation
 * lane's declarative VerifiedUnblindingReceipt names the receipt's canonical
 * hash `canonicalHash`, while MV-B1/MV-B2 receipts name their sealed digest
 * `receiptHash`. Rather than pick one and force a rename at the lane seam,
 * both are carried: canonicalHash covers the body, and receiptHash then
 * covers body + canonicalHash — so tampering with canonicalHash alone also
 * breaks receiptHash.
 */
function sealUnblindingReceipt(body) {
  const canonicalHash = canonicalDigest(body);
  const unsigned = { ...body, canonicalHash };
  return deepFreeze({ ...unsigned, receiptHash: canonicalDigest(unsigned) });
}

// ---------------------------------------------------------------------------
// Frozen assignment matrix (kernel `.hs` DATA, read through the shipped
// extractor — never re-parsed here).
// ---------------------------------------------------------------------------

/**
 * Loads the frozen mixed-assignment matrix from
 * source/proofs/model-village-trial-kernel.hs and derives the per-block
 * assignment manifest hashes.
 *
 * The matrix itself is read by extractCanonicalAdapterMatrix (exported by
 * scripts/model-village-canonical-lifecycle.mjs), which enforces the frozen
 * persona/seat order, the exact per-block adapter allocation, and the latin
 * square (each persona/seat receives each adapter exactly once across the
 * three blocks). Re-parsing that matrix here would create a second, drifting
 * authority for a FROZEN artifact, so it is imported instead.
 *
 * assignmentManifestHash mirrors the MV-L12 formula EXACTLY
 * (scripts/model-village-canonical-lifecycle.mjs lines 564-568):
 *   canonicalDigest({ adapters, blockId, personasAndSeats })
 * so an MV-B3 commitment and an MV-L12 block plan agree on the hash that
 * identifies a block's assignment. That agreement is asserted independently
 * in the test suite rather than assumed.
 *
 * kernelSourceHash is the sha256 of the LINE-ENDING-NORMALIZED kernel source,
 * so a CRLF checkout cannot change the hash of an unchanged frozen file.
 *
 * @param {{hololandRoot?: string}} [options]
 * @returns {{
 *   matrix: {blocks: Record<string, string[]>, counterbalance: string,
 *            personasAndSeats: string[]},
 *   kernelSourceHash: string,
 *   assignmentManifestHashByBlock: {block1: string, block2: string, block3: string}
 * }}
 */
export function loadFrozenAssignmentMatrix({ hololandRoot } = {}) {
  const root = hololandRoot
    ? path.resolve(hololandRoot)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const kernelPath = path.join(root, ...KERNEL_SOURCE_PATH.split('/'));
  let raw;
  try {
    raw = readFileSync(kernelPath, 'utf8');
  } catch (error) {
    failBlind(
      `frozen trial kernel is unreadable at ${KERNEL_SOURCE_PATH}: `
      + `${error?.message ?? String(error)}`,
    );
  }
  const source = normalizeSource(raw);
  const kernelSourceHash = createHash('sha256')
    .update(Buffer.from(source, 'utf8'))
    .digest('hex');

  let matrix;
  try {
    matrix = extractCanonicalAdapterMatrix(source);
  } catch (error) {
    failBlind(
      `frozen assignment matrix failed canonical extraction: `
      + `${error?.message ?? String(error)}`,
    );
  }
  assertObject(matrix, 'frozen matrix');
  if (!Array.isArray(matrix.personasAndSeats) || matrix.personasAndSeats.length !== 6) {
    failBlind('frozen matrix must declare exactly six persona/seat entries');
  }
  for (const blockId of BLOCK_IDS) {
    const adapters = matrix.blocks?.[blockId];
    if (!Array.isArray(adapters) || adapters.length !== 6) {
      failBlind(`frozen matrix ${blockId} must declare exactly six adapters`);
    }
    for (const alias of adapters) {
      if (!STUDY_ALIASES.includes(alias)) {
        failBlind(`frozen matrix ${blockId} carries an unknown study alias`);
      }
    }
  }
  assertNonEmptyString(matrix.counterbalance, 'frozen matrix counterbalance');

  const assignmentManifestHashByBlock = Object.fromEntries(
    BLOCK_IDS.map((blockId) => [
      blockId,
      canonicalDigest({
        adapters: matrix.blocks[blockId],
        blockId,
        personasAndSeats: matrix.personasAndSeats,
      }),
    ]),
  );

  return deepFreeze({
    assignmentManifestHashByBlock,
    kernelSourceHash,
    matrix: {
      blocks: Object.fromEntries(
        BLOCK_IDS.map((blockId) => [blockId, [...matrix.blocks[blockId]]]),
      ),
      counterbalance: matrix.counterbalance,
      personasAndSeats: [...matrix.personasAndSeats],
    },
  });
}

function validateMatrixBundle(matrixBundle, blockId) {
  assertExactKeys(
    matrixBundle,
    ['assignmentManifestHashByBlock', 'kernelSourceHash', 'matrix'],
    'matrixBundle',
  );
  assertSha256(matrixBundle.kernelSourceHash, 'matrixBundle.kernelSourceHash');
  assertExactKeys(
    matrixBundle.assignmentManifestHashByBlock,
    BLOCK_IDS,
    'matrixBundle.assignmentManifestHashByBlock',
  );
  for (const id of BLOCK_IDS) {
    assertSha256(
      matrixBundle.assignmentManifestHashByBlock[id],
      `matrixBundle.assignmentManifestHashByBlock.${id}`,
    );
  }
  assertExactKeys(
    matrixBundle.matrix,
    ['blocks', 'counterbalance', 'personasAndSeats'],
    'matrixBundle.matrix',
  );
  const { matrix } = matrixBundle;
  if (!Array.isArray(matrix.personasAndSeats) || matrix.personasAndSeats.length !== 6) {
    failBlind('matrixBundle.matrix.personasAndSeats must hold six entries');
  }
  assertExactKeys(matrix.blocks, BLOCK_IDS, 'matrixBundle.matrix.blocks');
  const adapters = matrix.blocks[blockId];
  if (!Array.isArray(adapters) || adapters.length !== 6) {
    failBlind(`matrixBundle.matrix.blocks.${blockId} must hold six adapters`);
  }
  // Recompute the block hash from the bundle's OWN matrix: a doctored bundle
  // whose hash and matrix disagree is refused rather than receipted.
  const recomputed = canonicalDigest({
    adapters,
    blockId,
    personasAndSeats: matrix.personasAndSeats,
  });
  if (recomputed !== matrixBundle.assignmentManifestHashByBlock[blockId]) {
    failBlind(
      `matrixBundle assignmentManifestHash for ${blockId} does not recompute `
      + 'from its own matrix',
    );
  }
  return recomputed;
}

/**
 * Seat bindings in MV-L12's EXACT shape (snake_case keys, positional
 * derivation): resident-0N maps to personasAndSeats[N-1] and to
 * blocks[blockId][N-1]. Mirrors buildSeatBindings in
 * scripts/model-village-canonical-lifecycle.mjs so a future integrator can
 * compare an MV-B3 sealed record against an MV-L12 block plan field for
 * field. Note the seat -> alias binding is PUBLIC (it is declared in the
 * frozen kernel); only the alias -> route map is sealed.
 */
function buildSeatBindings(matrix, blockId, runId, assignmentManifestHash) {
  return matrix.personasAndSeats.map((personaSeat, index) => {
    const [personaId, seatId] = String(personaSeat).split('@');
    if (!personaId || !seatId) {
      failBlind('frozen persona/seat entry is not in persona@seat form');
    }
    return {
      adapter_alias: matrix.blocks[blockId][index],
      assignment_manifest_hash: assignmentManifestHash,
      persona_id: personaId,
      resident_id: `resident-${String(index + 1).padStart(2, '0')}`,
      run_id: runId,
      seat_id: seatId,
    };
  });
}

function mvB3RunIdForBlock(blockId) {
  const runId = `mv-b3-${blockId}`;
  if (!MV_B3_RUN_ID_PATTERN.test(runId)) {
    failBlind('derived MV-B3 run id violates the MV-B3 naming law');
  }
  return runId;
}

// ---------------------------------------------------------------------------
// Sealing (custody side).
// ---------------------------------------------------------------------------

function validateCustodyStore(custodyStore, required) {
  if (!custodyStore || typeof custodyStore !== 'object') {
    failBlind('custodyStore must be a sealed custody store handle');
  }
  for (const method of required) {
    if (typeof custodyStore[method] !== 'function') {
      failBlind(`custodyStore must expose ${method}`);
    }
  }
}

/**
 * Verifies every supplied MV-B1 certification receipt and indexes it by
 * routeId. Every element must VERIFY and be certified === true — a route that
 * was never certified can never be sealed as a study adapter, and a
 * malformed receipt in the array is a caller bug, not a soft skip. Two
 * receipts for one routeId are permitted only when they are the same receipt
 * (identical receiptHash); conflicting evidence for one route is ambiguous
 * and refused.
 */
function indexCertifications(certifications) {
  if (!Array.isArray(certifications) || certifications.length === 0) {
    failBlind('certifications must be a non-empty array of MV-B1 receipts');
  }
  const byRoute = new Map();
  certifications.forEach((receipt, index) => {
    const check = verifyAdapterCertificationReceipt(receipt);
    if (!check.ok) {
      failBlind(
        `certifications[${index}] is not a valid MV-B1 certification receipt: `
        + `${check.failureReason}`,
      );
    }
    if (receipt.certified !== true) {
      failBlind(
        `certifications[${index}] is not certified; an uncertified route can `
        + 'never be sealed as a study adapter',
      );
    }
    const existing = byRoute.get(receipt.routeId);
    if (existing && existing.receiptHash !== receipt.receiptHash) {
      failBlind(
        'certifications carry two different receipts for one route; '
        + 'ambiguous certification evidence is refused',
      );
    }
    byRoute.set(receipt.routeId, receipt);
  });
  return byRoute;
}

/**
 * Seals the alias -> route assignment for one frozen block and returns the
 * PUBLIC commitment.
 *
 * The sealed record (custody kind 'alias-assignment-vault') carries the full
 * secret: schema, blockId, aliasRouteMap, salt, seatBindings,
 * certificationReceiptHashes, sealedAt. The returned commitment carries NO
 * mapping — only salted per-alias digests plus public aggregates.
 *
 * Route reuse: the engineering lane has only two live sovereign routes, so a
 * three-alias study assignment may have to reuse one. Reuse is NOT silently
 * permitted; it must be an EXPLICIT, receipted choice (`allowRouteReuse:
 * true`), and the commitment then states routeReuseDeclared and
 * distinctRouteCount truthfully. A study that reuses a route is a different
 * study, and the public receipt says so.
 *
 * `operator` is validated for call-site discipline but is deliberately absent
 * from the public commitment: named-operator accounting is the custody
 * store's job (it appends a hash-chained access-log entry naming its operator
 * for this seal), and an operator name has no business riding a blinded
 * public artifact.
 *
 * `priorReceiptHash` is optional and defaults to the MV-B1 genesis hash — the
 * commitment is the head of the MV-B3 blinding chain unless the caller
 * already holds a prior MV-B3 receipt to chain from.
 *
 * @returns {Readonly<object>} the public AliasAssignmentCommitment
 */
export function sealAliasAssignment({
  custodyStore,
  operator,
  blockId,
  aliasRouteMap,
  matrixBundle,
  certifications,
  allowRouteReuse = false,
  priorReceiptHash = GENESIS_RECEIPT_HASH,
} = {}) {
  validateCustodyStore(custodyStore, ['sealObject']);
  assertNonEmptyString(operator, 'operator');
  assertBlockId(blockId, 'blockId');
  assertBoolean(allowRouteReuse, 'allowRouteReuse');
  assertSha256(priorReceiptHash, 'priorReceiptHash');

  assertExactKeys(aliasRouteMap, STUDY_ALIASES, 'aliasRouteMap');
  for (const alias of STUDY_ALIASES) {
    assertNonEmptyString(aliasRouteMap[alias], `aliasRouteMap.${alias}`);
  }
  const routeIds = STUDY_ALIASES.map((alias) => aliasRouteMap[alias]);
  const distinctRouteIds = [...new Set(routeIds)];
  const distinctRouteCount = distinctRouteIds.length;
  const routeReuseDeclared = distinctRouteCount < STUDY_ALIASES.length;
  if (routeReuseDeclared && allowRouteReuse !== true) {
    failBlind(
      'aliasRouteMap assigns fewer distinct routes than study aliases; route '
      + 'reuse must be an explicit receipted choice (allowRouteReuse: true)',
    );
  }

  const assignmentManifestHash = validateMatrixBundle(matrixBundle, blockId);
  const certificationsByRoute = indexCertifications(certifications);
  for (const routeId of distinctRouteIds) {
    if (!certificationsByRoute.has(routeId)) {
      // Mapping-free message: naming the route would leak an assignment.
      failBlind(
        'aliasRouteMap references a route with no certified MV-B1 '
        + 'certification receipt in certifications',
      );
    }
  }

  // 32 bytes of CSPRNG, fresh for every sealing. The salt is what makes the
  // small public routeId space unguessable, and it is also what makes the
  // content-addressed custodyId non-enumerable (the vault plaintext would
  // otherwise hash over a tiny known space).
  const salt = randomBytes(SALT_BYTE_LENGTH).toString('hex');
  const runId = mvB3RunIdForBlock(blockId);
  const seatBindings = buildSeatBindings(
    matrixBundle.matrix,
    blockId,
    runId,
    assignmentManifestHash,
  );
  seatBindings.forEach((binding, index) => {
    assertExactKeys(binding, SEAT_BINDING_KEYS, `seatBindings[${index}]`);
  });

  const sealedRecord = {
    aliasRouteMap: Object.fromEntries(
      STUDY_ALIASES.map((alias) => [alias, aliasRouteMap[alias]]),
    ),
    blockId,
    certificationReceiptHashes: Object.fromEntries(
      STUDY_ALIASES.map((alias) => [
        alias,
        certificationsByRoute.get(aliasRouteMap[alias]).receiptHash,
      ]),
    ),
    salt,
    schema: ALIAS_VAULT_SCHEMA,
    seatBindings,
    sealedAt: isoNow(),
  };
  assertExactKeys(sealedRecord, VAULT_RECORD_KEYS, 'sealed vault record');

  // canonicalDigest of the record. Under the MV-B1 store's sha256-plaintext
  // addressing this equals the returned custodyId, but the equality is NOT
  // required here: custodyStore is an injected dependency, and a store that
  // addresses objects differently must still work. The test suite asserts the
  // equality holds for the real MV-B1 store.
  const sealedRecordHash = canonicalDigest(sealedRecord);
  const sealed = custodyStore.sealObject({
    kind: CUSTODY_KIND,
    // The label is stored ENCRYPTED by the MV-B1 store; it still carries no
    // route material, so a future store with plaintext metadata cannot leak
    // through it either.
    label: `${CUSTODY_KIND}:${blockId}`,
    value: sealedRecord,
  });
  if (!sealed || typeof sealed.custodyId !== 'string' || sealed.custodyId.length === 0) {
    failBlind('custodyStore.sealObject did not return a custodyId');
  }

  // Salted digest over the SORTED DISTINCT MV-B1 certification receipt hashes
  // actually used by this assignment. certifiedRouteCount alone is a number
  // this module wrote next to another number it wrote — a foreign verifier
  // learns nothing about certification from it (the D.131/DT-24 pattern: a
  // check that reads only a record verifies that someone wrote the record).
  // This commitment is the evidence that survives into the public artifact: a
  // party who later holds the sealed record can bind the commitment to REAL
  // MV-B1 receipts, and issueUnblindingReceipt re-derives it as a condition of
  // revealing. Salted because the receipt-hash set is otherwise enumerable
  // from the openly published engineering certification receipts.
  const certificationCommitment = canonicalDigest({
    certificationReceiptHashes: [
      ...new Set(distinctRouteIds.map(
        (routeId) => certificationsByRoute.get(routeId).receiptHash,
      )),
    ].sort(),
    salt,
  });

  const unsigned = {
    aliasCommitments: Object.fromEntries(
      STUDY_ALIASES.map((alias) => [
        alias,
        // Including `alias` in the preimage keeps two aliases sharing one
        // route from producing an identical commitment — reuse PAIRING stays
        // hidden even though the aggregate count is public.
        canonicalDigest({ alias, routeId: aliasRouteMap[alias], salt }),
      ]),
    ),
    assignmentManifestHash,
    at: isoNow(),
    blockId,
    certificationCommitment,
    certifiedRouteCount: distinctRouteCount,
    distinctRouteCount,
    engine: ALIAS_VAULT_ENGINE,
    kernelSourceHash: matrixBundle.kernelSourceHash,
    priorReceiptHash,
    routeReuseDeclared,
    schema: ALIAS_ASSIGNMENT_COMMITMENT_SCHEMA,
    sealedRecordHash,
    vaultCustodyId: sealed.custodyId,
  };
  const commitment = sealCommitment(unsigned);
  // Final construction-side blind check: never hand back a commitment that
  // would fail its own verifier.
  const check = verifyAliasAssignmentCommitment(commitment);
  if (!check.ok) {
    failBlind(`sealed commitment failed self-verification: ${check.failureReason}`);
  }
  return commitment;
}

/**
 * Verifies a public AliasAssignmentCommitment: closed keys, schema/engine
 * pin, exact alias set, aggregate coherence, receiptHash recompute, and the
 * ACTIVE anti-leak audit (no route-shaped string anywhere in the artifact).
 *
 * VERIFICATION LIMIT, stated plainly: this is SELF-CONSISTENCY plus
 * anti-leak, NOT authenticity. Nothing here is signed, so a party who can
 * re-hash can produce a self-consistent commitment for any assignment. What
 * verification does buy: an artifact cannot be edited in place, cannot carry
 * an off-alias key set, cannot state incoherent aggregates, and cannot carry
 * a route-shaped string. Authenticity (signature / signerId / trustedSigner)
 * belongs to the presentation lane's typed contract and is not issued here.
 *
 * @returns {{ok: boolean, failureReason: string|null}}
 */
export function verifyAliasAssignmentCommitment(commitment) {
  try {
    assertExactKeys(commitment, COMMITMENT_KEYS, 'alias assignment commitment');
    if (commitment.schema !== ALIAS_ASSIGNMENT_COMMITMENT_SCHEMA) {
      failBlind(
        `alias assignment commitment schema must be `
        + `'${ALIAS_ASSIGNMENT_COMMITMENT_SCHEMA}'`,
      );
    }
    if (commitment.engine !== ALIAS_VAULT_ENGINE) {
      failBlind(`alias assignment commitment engine must be '${ALIAS_VAULT_ENGINE}'`);
    }
    assertBlockId(commitment.blockId, 'commitment.blockId');
    assertSha256(commitment.assignmentManifestHash, 'commitment.assignmentManifestHash');
    assertSha256(commitment.kernelSourceHash, 'commitment.kernelSourceHash');
    assertSha256(commitment.sealedRecordHash, 'commitment.sealedRecordHash');
    assertSha256(commitment.priorReceiptHash, 'commitment.priorReceiptHash');
    assertSha256(commitment.vaultCustodyId, 'commitment.vaultCustodyId');
    assertSha256(commitment.certificationCommitment, 'commitment.certificationCommitment');
    assertNonEmptyString(commitment.at, 'commitment.at');

    assertExactKeys(commitment.aliasCommitments, STUDY_ALIASES, 'commitment.aliasCommitments');
    for (const alias of STUDY_ALIASES) {
      assertSha256(commitment.aliasCommitments[alias], `commitment.aliasCommitments.${alias}`);
    }
    if (
      new Set(Object.values(commitment.aliasCommitments)).size
      !== STUDY_ALIASES.length
    ) {
      failBlind(
        'commitment.aliasCommitments must hold three distinct digests; equal '
        + 'digests would disclose an alias pairing',
      );
    }

    assertBoolean(commitment.routeReuseDeclared, 'commitment.routeReuseDeclared');
    if (
      !Number.isInteger(commitment.distinctRouteCount)
      || commitment.distinctRouteCount < 1
      || commitment.distinctRouteCount > STUDY_ALIASES.length
    ) {
      failBlind('commitment.distinctRouteCount must be an integer in 1..3');
    }
    if (
      commitment.routeReuseDeclared
      !== (commitment.distinctRouteCount < STUDY_ALIASES.length)
    ) {
      failBlind('commitment.routeReuseDeclared disagrees with distinctRouteCount');
    }
    if (commitment.certifiedRouteCount !== commitment.distinctRouteCount) {
      failBlind(
        'commitment.certifiedRouteCount must equal distinctRouteCount; every '
        + 'distinct route must carry a certified MV-B1 receipt',
      );
    }
    // HONEST LIMIT on the three aggregates above: every rule here is INTERNAL
    // COHERENCE. A coherent lie (three distinct routes declared over a sealed
    // two-route assignment) passes, because nothing verifiable here reaches
    // the sealed record. The aggregates are BOUND to the sealed truth exactly
    // once, in issueUnblindingReceipt, which recomputes all three (and
    // re-derives certificationCommitment) from the opened record and refuses
    // to reveal on a mismatch. A consumer that never unblinds holds a
    // self-consistent claim, not a verified one.

    // Anti-leak audit runs BEFORE the hash recompute so a leaking artifact is
    // reported as a blinding failure, not as a hash mismatch.
    assertNoRouteShapedStrings(commitment, 'commitment');

    const { receiptHash, ...unsigned } = commitment;
    assertSha256(receiptHash, 'commitment.receiptHash');
    if (canonicalDigest(unsigned) !== receiptHash) {
      failBlind('commitment receiptHash does not recompute');
    }
    return { ok: true, failureReason: null };
  } catch (error) {
    return { ok: false, failureReason: error?.message ?? String(error) };
  }
}

// ---------------------------------------------------------------------------
// Unblinding issuance (the sealed key-holder step).
// ---------------------------------------------------------------------------

/**
 * Projects the two-person authorization into the receipt shape without ever
 * throwing: unknown or malformed authorizers become null so a refusal receipt
 * still has closed keys.
 */
function projectAuthorization(authorization) {
  // authorizedBy is the ONLY free-text field on an unblinding receipt, which
  // makes it the whole smuggle surface. A route-shaped authorizer name (a
  // URN-style custodian id, a host, a dotted quad, anything containing
  // `sovereign-`) is REJECTED here rather than passed through: previously it
  // rode into a receipt that had already performed an irreversible reveal and
  // then failed its own verifier, leaving the reveal permanently unverifiable
  // with no re-issue path. Nulling it here turns that into a fail-neutral
  // refusal BEFORE anything is opened.
  const pick = (value) => {
    if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
      return null;
    }
    for (const pattern of ROUTE_SHAPED_PATTERNS) {
      if (pattern.test(value)) return null;
    }
    return value;
  };
  try {
    if (!authorization || typeof authorization !== 'object' || Array.isArray(authorization)) {
      return { dataCustodian: null, protocolLead: null };
    }
    return {
      dataCustodian: pick(authorization.dataCustodian),
      protocolLead: pick(authorization.protocolLead),
    };
  } catch {
    // A caller-supplied getter or Proxy must not throw OUT of the unblinding
    // boundary: its message escapes into logs and is itself a leak surface.
    return { dataCustodian: null, protocolLead: null };
  }
}

function assertAuthorizationComplete(authorization, projected) {
  assertExactKeys(authorization ?? {}, AUTHORIZATION_KEYS, 'authorization');
  if (projected.protocolLead === null || projected.dataCustodian === null) {
    failBlind('authorization requires both a protocolLead and a dataCustodian');
  }
  // Two-person rule: two NAMES, not one person holding both roles.
  if (projected.protocolLead === projected.dataCustodian) {
    failBlind(
      'authorization protocolLead and dataCustodian must be different '
      + 'authorizers (two-person rule)',
    );
  }
}

/**
 * Validates the terminal commitment binding.
 *
 * WHAT THE RUNTIME ACTUALLY HAS TODAY: a verified V4 run receipt carries a
 * BARE sha256 terminal commitment — that value is `canonicalHash` here. The
 * other three fields are the caller's run binding (which run, which frozen
 * block assignment, and the id under which the terminal commitment is
 * referenced); they are supplied evidence, not signatures.
 *
 * The presentation lane's declarative VerifiedTerminalCommitment
 * (source/domains/agents/model-village-art-direction.hsplus lines 748-760) is
 * a separate, RICHER 12-field artifact adding verified / canonicalHashVerified
 * / signature / signatureVerified / signerId / trustedSigner /
 * finalObservationRoot / failNeutral. This receipt is deliberately shaped so
 * it can be lifted into that artifact without renaming a field: commitmentId,
 * canonicalHash, runId, assignmentManifestHash and terminalCommitment* are the
 * lane's own names. Nothing here claims that lane's verification has executed.
 */
function assertTerminalCommitment(terminalCommitment, commitment) {
  assertExactKeys(
    terminalCommitment,
    TERMINAL_COMMITMENT_KEYS,
    'terminalCommitment',
  );
  assertNonEmptyString(terminalCommitment.commitmentId, 'terminalCommitment.commitmentId');
  assertSha256(terminalCommitment.canonicalHash, 'terminalCommitment.canonicalHash');
  assertSha256(
    terminalCommitment.assignmentManifestHash,
    'terminalCommitment.assignmentManifestHash',
  );
  assertNonEmptyString(terminalCommitment.runId, 'terminalCommitment.runId');
  if (!MV_B3_RUN_ID_PATTERN.test(terminalCommitment.runId)) {
    failBlind(`terminalCommitment.runId must match ${MV_B3_RUN_ID_PATTERN}`);
  }
  if (terminalCommitment.runId !== mvB3RunIdForBlock(commitment.blockId)) {
    failBlind("terminalCommitment.runId is not this block's MV-B3 run id");
  }
  if (
    terminalCommitment.assignmentManifestHash !== commitment.assignmentManifestHash
  ) {
    failBlind(
      'terminalCommitment.assignmentManifestHash does not match the sealed '
      + 'commitment; refusing to unblind a different assignment',
    );
  }
  assertNoRouteShapedStrings(terminalCommitment, 'terminalCommitment');
}

/**
 * Issues the unblinding receipt — the CUSTODY-SIDE key-holder step of the
 * declared chain terminalCommitment -> unblindingReceipt ->
 * familyBindingReceipt.
 *
 * This is also the ONLY place the commitment's public aggregates
 * (distinctRouteCount, routeReuseDeclared, certifiedRouteCount,
 * certificationCommitment) are bound to the sealed truth: they are recomputed
 * from the opened record, and a mismatch refuses the reveal.
 *
 * FAIL-NEUTRAL BY DEFAULT AND BY CONSTRUCTION. A missing, malformed, or
 * mismatched terminal commitment; an unverifiable commitment; an unopenable
 * vault (for example after content-key destruction); a null or non-object
 * argument; an authorizer name that is route-shaped or otherwise unusable; a
 * commitment whose aggregates disagree with the sealed assignment; or
 * incomplete authorization all return a refusal receipt with
 * `failNeutral: true` and
 * `revealed: null`. Nothing is revealed, and nothing is thrown — a throw at
 * an unblinding boundary is itself a leak surface (stack traces and messages
 * escape into logs), and a caller that catches nothing would otherwise learn
 * WHY the reveal failed.
 *
 * The refusal receipt carries no diagnostic reason string by design: the key
 * set is closed, and a free-text reason is exactly the field that would
 * eventually carry a route. Diagnosis is by which fields are null — a refusal
 * populates a field only after that field's own check has passed, and it
 * NEVER echoes a field from a commitment that did not verify.
 *
 * On success the alias -> route map is returned to the CALLER IN MEMORY only.
 * The receipt never contains it; `revealedInReceipt` is pinned false so the
 * artifact itself asserts that.
 *
 * @param {{
 *   custodyStore: object,
 *   operator: string,
 *   commitment: object,
 *   terminalCommitment: {commitmentId: string, canonicalHash: string,
 *                        runId: string, assignmentManifestHash: string},
 *   authorization: {protocolLead: string, dataCustodian: string}
 * }} input
 * @returns {{receipt: Readonly<object>, revealed: Readonly<Record<string,string>>|null}}
 */
export function issueUnblindingReceipt(input) {
  // The parameter object is NOT destructured in the signature: `= {}` does not
  // defend against an explicit null, and a TypeError thrown out of an
  // unblinding boundary is itself a leak surface (the JSDoc above promises
  // nothing is thrown here).
  const options = input && typeof input === 'object' && !Array.isArray(input)
    ? input
    : {};
  const authorizedBy = projectAuthorization(options.authorization);
  // Fields are promoted out of `pending` only after their own check passes,
  // so a refusal receipt can never echo unverified caller input.
  const pending = {
    assignmentManifestHash: null,
    commitmentId: null,
    runId: null,
    terminalCommitmentHash: null,
    terminalCommitmentId: null,
  };
  /**
   * A receipt whose every field is machine-derived: no caller string reaches
   * it, so it always passes its own verifier. It is what this boundary emits
   * when the normal receipt would not verify — a durable artifact recording a
   * refusal is strictly better than one recording an unverifiable reveal.
   */
  const neutralFallbackReceipt = () => sealUnblindingReceipt({
    aliasCommitmentsVerified: false,
    assignmentManifestHash: null,
    at: isoNow(),
    authorizedBy: { dataCustodian: null, protocolLead: null },
    commitmentId: null,
    engine: ALIAS_VAULT_ENGINE,
    failNeutral: true,
    priorReceiptHash: null,
    receiptId: `mv-b3-unblinding-${randomUUID()}`,
    revealedInReceipt: false,
    runId: null,
    schema: UNBLINDING_RECEIPT_SCHEMA,
    terminalCommitmentHash: null,
    terminalCommitmentId: null,
  });
  // ISSUANCE-SIDE SELF-AUDIT, matching every other issuance path in this slice
  // (sealAliasAssignment self-verifies; captureResponseUnderCustody runs the
  // anti-leak fence plus its own verifier). Without it this boundary could
  // return a successful reveal carried by a receipt that fails
  // verifyUnblindingReceipt — and the reveal is irreversible, so the artifact
  // recording it would be permanently unverifiable.
  const buildReceipt = (extra) => {
    const receipt = sealUnblindingReceipt({
      aliasCommitmentsVerified: extra.aliasCommitmentsVerified,
      assignmentManifestHash: pending.assignmentManifestHash,
      at: isoNow(),
      authorizedBy: { ...authorizedBy },
      commitmentId: pending.commitmentId,
      engine: ALIAS_VAULT_ENGINE,
      failNeutral: extra.failNeutral,
      // The declared chain: an unblinding receipt chains from the terminal
      // commitment (art-direction lines 706-713 assert exactly this equality).
      priorReceiptHash: pending.terminalCommitmentHash,
      receiptId: `mv-b3-unblinding-${randomUUID()}`,
      revealedInReceipt: false,
      runId: pending.runId,
      schema: UNBLINDING_RECEIPT_SCHEMA,
      terminalCommitmentHash: pending.terminalCommitmentHash,
      terminalCommitmentId: pending.terminalCommitmentId,
    });
    return verifyUnblindingReceipt(receipt).ok ? receipt : neutralFallbackReceipt();
  };

  try {
    const { custodyStore, operator, commitment, terminalCommitment } = options;
    validateCustodyStore(custodyStore, ['readObject']);
    assertNonEmptyString(operator, 'operator');

    const commitmentCheck = verifyAliasAssignmentCommitment(commitment);
    if (!commitmentCheck.ok) {
      failBlind(`commitment did not verify: ${commitmentCheck.failureReason}`);
    }
    pending.commitmentId = commitment.receiptHash;
    pending.assignmentManifestHash = commitment.assignmentManifestHash;

    if (terminalCommitment === undefined || terminalCommitment === null) {
      failBlind('terminalCommitment is required to unblind');
    }
    assertTerminalCommitment(terminalCommitment, commitment);
    pending.runId = terminalCommitment.runId;
    pending.terminalCommitmentId = terminalCommitment.commitmentId;
    pending.terminalCommitmentHash = terminalCommitment.canonicalHash;

    assertAuthorizationComplete(options.authorization, authorizedBy);

    const opened = custodyStore.readObject(commitment.vaultCustodyId);
    if (!opened || !opened.bytes) {
      failBlind('sealed vault object could not be opened');
    }
    if (opened.kind !== CUSTODY_KIND) {
      failBlind('sealed object is not an alias-assignment vault record');
    }
    let record;
    try {
      record = JSON.parse(Buffer.from(opened.bytes).toString('utf8'));
    } catch {
      failBlind('sealed vault record is not valid JSON');
    }
    assertExactKeys(record, VAULT_RECORD_KEYS, 'sealed vault record');
    if (record.schema !== ALIAS_VAULT_SCHEMA) {
      failBlind(`sealed vault record schema must be '${ALIAS_VAULT_SCHEMA}'`);
    }
    if (record.blockId !== commitment.blockId) {
      failBlind('sealed vault record is for a different block');
    }
    if (typeof record.salt !== 'string' || !SALT_PATTERN.test(record.salt)) {
      failBlind('sealed vault record salt is malformed');
    }
    assertExactKeys(record.aliasRouteMap, STUDY_ALIASES, 'sealed aliasRouteMap');
    if (canonicalDigest(record) !== commitment.sealedRecordHash) {
      failBlind('sealed vault record does not match commitment.sealedRecordHash');
    }

    // Re-derive every public commitment from the sealed pair. This is what
    // aliasCommitmentsVerified asserts: the sealed mapping is the one the
    // public commitment committed to, not a substituted record.
    for (const alias of STUDY_ALIASES) {
      const routeId = record.aliasRouteMap[alias];
      assertNonEmptyString(routeId, `sealed aliasRouteMap.${alias}`);
      const recomputed = canonicalDigest({ alias, routeId, salt: record.salt });
      if (recomputed !== commitment.aliasCommitments[alias]) {
        failBlind('sealed alias assignment does not re-hash to its public commitment');
      }
    }

    // REBIND THE PUBLIC AGGREGATES TO THE SEALED TRUTH. The sealed map is in
    // hand at exactly this moment, so recomputing costs nothing — and without
    // it the commitment's aggregates were never verified against anything:
    // verifyAliasAssignmentCommitment only checks that they cohere with each
    // other, so a forged commitment declaring three distinct routes over a
    // sealed two-route (reused) assignment unblinded successfully. That
    // matters because routeReuseDeclared is a scientific-integrity claim —
    // "a study that reuses a route is a different study, and the public
    // receipt says so". Now it verifiably does.
    const sealedRouteIds = STUDY_ALIASES.map((alias) => record.aliasRouteMap[alias]);
    const sealedDistinctRouteIds = [...new Set(sealedRouteIds)];
    if (commitment.distinctRouteCount !== sealedDistinctRouteIds.length) {
      failBlind('commitment.distinctRouteCount disagrees with the sealed assignment');
    }
    if (
      commitment.routeReuseDeclared
      !== (sealedDistinctRouteIds.length < STUDY_ALIASES.length)
    ) {
      failBlind('commitment.routeReuseDeclared disagrees with the sealed assignment');
    }
    assertExactKeys(
      record.certificationReceiptHashes,
      STUDY_ALIASES,
      'sealed certificationReceiptHashes',
    );
    const sealedCertificationHashes = [
      ...new Set(STUDY_ALIASES.map((alias) => record.certificationReceiptHashes[alias])),
    ].sort();
    for (const hash of sealedCertificationHashes) {
      assertSha256(hash, 'sealed certification receipt hash');
    }
    if (commitment.certifiedRouteCount !== sealedCertificationHashes.length) {
      failBlind(
        'commitment.certifiedRouteCount disagrees with the sealed certification '
        + 'evidence',
      );
    }
    if (
      canonicalDigest({
        certificationReceiptHashes: sealedCertificationHashes,
        salt: record.salt,
      }) !== commitment.certificationCommitment
    ) {
      failBlind(
        'sealed certification evidence does not re-derive commitment.'
        + 'certificationCommitment',
      );
    }

    const revealed = deepFreeze(
      Object.fromEntries(
        STUDY_ALIASES.map((alias) => [alias, record.aliasRouteMap[alias]]),
      ),
    );
    const receipt = buildReceipt({
      aliasCommitmentsVerified: true,
      failNeutral: false,
    });
    if (receipt.failNeutral !== false) {
      // The self-audit refused the reveal receipt, so nothing is revealed: an
      // unverifiable artifact must never be the record of a reveal.
      return { receipt, revealed: null };
    }
    return { receipt, revealed };
  } catch {
    // Deliberately swallowed: the caught error may quote sealed material, and
    // the whole point of a fail-neutral boundary is that a refusal discloses
    // nothing beyond "it did not happen".
    return {
      receipt: buildReceipt({
        aliasCommitmentsVerified: false,
        failNeutral: true,
      }),
      revealed: null,
    };
  }
}

/**
 * Verifies an unblinding receipt: closed keys, schema/engine pin, both hash
 * recomputes (canonicalHash over the body, receiptHash over body +
 * canonicalHash), the pinned revealedInReceipt === false, the declared chain
 * equality priorReceiptHash === terminalCommitmentHash, fail-neutral field
 * coherence, and the active anti-leak audit.
 *
 * @returns {{ok: boolean, failureReason: string|null}}
 */
export function verifyUnblindingReceipt(receipt) {
  try {
    assertExactKeys(receipt, UNBLINDING_RECEIPT_KEYS, 'unblinding receipt');
    if (receipt.schema !== UNBLINDING_RECEIPT_SCHEMA) {
      failBlind(`unblinding receipt schema must be '${UNBLINDING_RECEIPT_SCHEMA}'`);
    }
    if (receipt.engine !== ALIAS_VAULT_ENGINE) {
      failBlind(`unblinding receipt engine must be '${ALIAS_VAULT_ENGINE}'`);
    }
    assertNonEmptyString(receipt.receiptId, 'receipt.receiptId');
    assertNonEmptyString(receipt.at, 'receipt.at');
    assertBoolean(receipt.failNeutral, 'receipt.failNeutral');
    assertBoolean(receipt.aliasCommitmentsVerified, 'receipt.aliasCommitmentsVerified');
    if (receipt.revealedInReceipt !== false) {
      failBlind(
        'receipt.revealedInReceipt must be false; an unblinding receipt never '
        + 'carries the mapping',
      );
    }
    assertExactKeys(receipt.authorizedBy, AUTHORIZATION_KEYS, 'receipt.authorizedBy');
    for (const key of AUTHORIZATION_KEYS) {
      const value = receipt.authorizedBy[key];
      if (value !== null && (typeof value !== 'string' || value.length === 0)) {
        failBlind(`receipt.authorizedBy.${key} must be a non-empty string or null`);
      }
    }

    const nullableHashes = [
      'assignmentManifestHash',
      'commitmentId',
      'priorReceiptHash',
      'terminalCommitmentHash',
    ];
    for (const key of nullableHashes) {
      if (receipt[key] !== null) assertSha256(receipt[key], `receipt.${key}`);
    }
    if (receipt.runId !== null) {
      assertNonEmptyString(receipt.runId, 'receipt.runId');
      if (!MV_B3_RUN_ID_PATTERN.test(receipt.runId)) {
        failBlind(`receipt.runId must match ${MV_B3_RUN_ID_PATTERN}`);
      }
    }
    if (receipt.terminalCommitmentId !== null) {
      assertNonEmptyString(receipt.terminalCommitmentId, 'receipt.terminalCommitmentId');
    }
    if (receipt.priorReceiptHash !== receipt.terminalCommitmentHash) {
      failBlind(
        'receipt.priorReceiptHash must equal terminalCommitmentHash (declared '
        + 'chain: terminal commitment -> unblinding receipt)',
      );
    }

    if (receipt.failNeutral === false) {
      if (receipt.aliasCommitmentsVerified !== true) {
        failBlind('a successful unblinding receipt must set aliasCommitmentsVerified');
      }
      for (const key of [...nullableHashes, 'runId', 'terminalCommitmentId']) {
        if (receipt[key] === null) {
          failBlind(`a successful unblinding receipt must carry ${key}`);
        }
      }
      for (const key of AUTHORIZATION_KEYS) {
        if (receipt.authorizedBy[key] === null) {
          failBlind(`a successful unblinding receipt must name ${key}`);
        }
      }
      if (receipt.authorizedBy.protocolLead === receipt.authorizedBy.dataCustodian) {
        failBlind('a successful unblinding receipt must name two different authorizers');
      }
    } else if (receipt.aliasCommitmentsVerified !== false) {
      failBlind('a fail-neutral refusal must not claim aliasCommitmentsVerified');
    }

    assertNoRouteShapedStrings(receipt, 'unblinding receipt');

    const { canonicalHash, receiptHash, ...body } = receipt;
    assertSha256(canonicalHash, 'receipt.canonicalHash');
    assertSha256(receiptHash, 'receipt.receiptHash');
    if (canonicalDigest(body) !== canonicalHash) {
      failBlind('unblinding receipt canonicalHash does not recompute');
    }
    if (canonicalDigest({ ...body, canonicalHash }) !== receiptHash) {
      failBlind('unblinding receipt receiptHash does not recompute');
    }
    return { ok: true, failureReason: null };
  } catch (error) {
    return { ok: false, failureReason: error?.message ?? String(error) };
  }
}
