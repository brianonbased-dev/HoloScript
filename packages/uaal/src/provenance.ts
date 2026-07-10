/**
 * provenance.ts — the uAAL provenance envelope + instance identity.
 *
 * uAAL is the canonical MEANING layer: its IR says what a claim IS. This module
 * adds the fields CAEL Attention needs to make that meaning a graph node — who
 * asserted it, when, from what causal chain, with what trust dynamics — plus
 * stable cross-document addressing so the same entity in session t and session
 * t+k can resolve to the same node.
 *
 * Design constraints (board task task_1783669630177_iwmp):
 * - ADDITIVE: every field is optional at the IR level; existing rows and
 *   recognisers are untouched. Strictness is opt-in via requireProvenance.
 * - FAIL-CLOSED validation: a PRESENT envelope with malformed fields is an
 *   error, never a warning — a wrong provenance claim is worse than none
 *   (the lenient-recogniser lesson).
 * - Signature is CARRIED, not verified here: wallet-signature verification is
 *   a substrate (CAEL-side) concern; the meaning layer just gives it a home.
 *
 * @module uaal/provenance
 */

/** How a claim came to be asserted — the CAEL trust prior keys off this. */
export type UAALSourceKind = 'observed' | 'derived' | 'reported' | 'synthetic';

export const UAAL_SOURCE_KINDS: readonly UAALSourceKind[] = [
  'observed',
  'derived',
  'reported',
  'synthetic',
];

/**
 * The provenance envelope: origination record for an IR document (or an
 * individual node, when attached at proposition/belief level).
 */
export interface UAALProvenance {
  /** Agent/principal that asserted this (handle, seat id, or wallet address). */
  asserted_by: string;
  /** ISO-8601 assertion time. */
  asserted_at: string;
  /** How the claim came to be (drives trust priors downstream). */
  source_kind: UAALSourceKind;
  /**
   * Causal chain: requestIds, trace ids, or parent instance URIs this claim
   * was derived from. Empty/absent = a root assertion.
   */
  causal_parents?: string[];
  /**
   * Wallet signature over the canonical document (carried, not verified here).
   */
  signature?: string;
  /** Count of INDEPENDENT corroborations (distinct asserted_by lineages). */
  corroboration?: number;
  /** Decay horizon (ISO-8601); null/absent = does not expire. */
  expires_at?: string | null;
  [key: string]: unknown;
}

/** Stable cross-document addressing for an IR document and its entities. */
export interface UAALInstanceIdentity {
  /**
   * Document-level stable id, e.g. "uaal:doc/<namespace>/<slug-or-ulid>".
   * Two documents with the same instance_id are versions of the same node.
   */
  instance_id: string;
  /**
   * Map from scenario-local entity ids (e.g. "e_mara") to stable URIs
   * (e.g. "uaal:entity/hololand/mara") so entity resolution has a target.
   * Unmapped local ids stay document-scoped — that is honest, not an error.
   */
  entity_uris?: Record<string, string>;
  [key: string]: unknown;
}

/** An IR document carrying the optional envelope fields this module defines. */
export interface UAALProvenancedDocument {
  provenance?: UAALProvenance;
  instance_id?: string;
  entity_uris?: Record<string, string>;
  [key: string]: unknown;
}

export interface UAALEnvelopeValidationOptions {
  /**
   * When true, a MISSING envelope is an error (CAEL write-admission mode).
   * Default false: absent envelope is valid (legacy rows unaffected).
   */
  requireProvenance?: boolean;
  /** Reference time for expiry evaluation; defaults to Date.now(). */
  nowMs?: number;
}

export interface UAALEnvelopeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** True when a valid envelope exists and expires_at is in the past. */
  expired: boolean;
}

const URI_RE = /^uaal:(doc|entity)\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/u;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate a provenance envelope in isolation (present ⇒ fail-closed). */
export function validateProvenance(prov: unknown, prefix = 'provenance'): string[] {
  const errors: string[] = [];
  if (!isPlainObject(prov)) return [`${prefix}: not an object`];

  if (typeof prov.asserted_by !== 'string' || prov.asserted_by.trim() === '') {
    errors.push(`${prefix}.asserted_by: required non-empty string`);
  }
  if (typeof prov.asserted_at !== 'string' || !ISO_RE.test(prov.asserted_at)) {
    errors.push(`${prefix}.asserted_at: required ISO-8601 timestamp`);
  }
  if (!UAAL_SOURCE_KINDS.includes(prov.source_kind as UAALSourceKind)) {
    errors.push(
      `${prefix}.source_kind: required one of ${UAAL_SOURCE_KINDS.join('|')} (got ${JSON.stringify(prov.source_kind)})`
    );
  }
  if (prov.causal_parents !== undefined) {
    if (
      !Array.isArray(prov.causal_parents) ||
      prov.causal_parents.some((p) => typeof p !== 'string' || p.trim() === '')
    ) {
      errors.push(`${prefix}.causal_parents: must be an array of non-empty strings`);
    }
  }
  if (prov.signature !== undefined && typeof prov.signature !== 'string') {
    errors.push(`${prefix}.signature: must be a string when present`);
  }
  if (prov.corroboration !== undefined) {
    const c = prov.corroboration;
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 0) {
      errors.push(`${prefix}.corroboration: must be a non-negative integer`);
    }
  }
  if (prov.expires_at !== undefined && prov.expires_at !== null) {
    if (typeof prov.expires_at !== 'string' || !ISO_RE.test(prov.expires_at)) {
      errors.push(`${prefix}.expires_at: must be null or an ISO-8601 timestamp`);
    }
  }
  return errors;
}

/** Validate the identity fields in isolation (present ⇒ fail-closed). */
export function validateIdentity(doc: UAALProvenancedDocument, prefix = ''): string[] {
  const errors: string[] = [];
  const p = (f: string) => (prefix ? `${prefix}.${f}` : f);

  if (doc.instance_id !== undefined) {
    if (typeof doc.instance_id !== 'string' || !URI_RE.test(doc.instance_id)) {
      errors.push(
        `${p('instance_id')}: must match uaal:doc/<namespace>/<slug> (got ${JSON.stringify(doc.instance_id)})`
      );
    } else if (!doc.instance_id.startsWith('uaal:doc/')) {
      errors.push(`${p('instance_id')}: must be a uaal:doc/ URI, not an entity URI`);
    }
  }
  if (doc.entity_uris !== undefined) {
    if (!isPlainObject(doc.entity_uris)) {
      errors.push(`${p('entity_uris')}: must be an object of localId -> uaal:entity/ URI`);
    } else {
      for (const [localId, uri] of Object.entries(doc.entity_uris)) {
        if (typeof uri !== 'string' || !URI_RE.test(uri) || !uri.startsWith('uaal:entity/')) {
          errors.push(`${p('entity_uris')}["${localId}"]: must be a uaal:entity/<namespace>/<slug> URI`);
        }
      }
    }
  }
  return errors;
}

/**
 * Validate a document's full envelope (provenance + identity).
 *
 * Absent envelope: valid unless requireProvenance (legacy rows unaffected).
 * Present envelope: fail-closed on every malformed field.
 * Expired envelope: valid:true + expired:true — expiry is a TRUST signal for
 * the consumer (attention weighting), not a well-formedness failure.
 */
export function validateEnvelope(
  doc: unknown,
  opts: UAALEnvelopeValidationOptions = {}
): UAALEnvelopeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let expired = false;

  if (!isPlainObject(doc)) {
    return { valid: false, errors: ['document: not an object'], warnings, expired };
  }
  const d = doc as UAALProvenancedDocument;

  if (d.provenance === undefined) {
    if (opts.requireProvenance) {
      errors.push('provenance: required (requireProvenance mode) but absent');
    }
  } else {
    errors.push(...validateProvenance(d.provenance));
    const exp = isPlainObject(d.provenance) ? d.provenance.expires_at : undefined;
    if (typeof exp === 'string' && ISO_RE.test(exp)) {
      const nowMs = opts.nowMs ?? Date.now();
      if (Date.parse(exp) <= nowMs) expired = true;
    }
  }

  if (opts.requireProvenance && d.instance_id === undefined) {
    errors.push('instance_id: required (requireProvenance mode) but absent');
  }
  errors.push(...validateIdentity(d));

  if (d.provenance && d.instance_id === undefined) {
    warnings.push('provenance present without instance_id — node is not graph-addressable');
  }

  return { valid: errors.length === 0, errors, warnings, expired };
}

/**
 * Attach an envelope to an IR document (returns a NEW object; input untouched).
 * Throws on a malformed envelope — never attaches bad provenance.
 */
export function attachProvenance<T extends Record<string, unknown>>(
  ir: T,
  provenance: UAALProvenance,
  identity?: UAALInstanceIdentity
): T & UAALProvenancedDocument {
  const provErrors = validateProvenance(provenance);
  if (provErrors.length > 0) {
    throw new Error(`attachProvenance: invalid envelope: ${provErrors.join('; ')}`);
  }
  const out: T & UAALProvenancedDocument = { ...ir, provenance };
  if (identity) {
    const idErrors = validateIdentity(identity as UAALProvenancedDocument);
    if (idErrors.length > 0) {
      throw new Error(`attachProvenance: invalid identity: ${idErrors.join('; ')}`);
    }
    out.instance_id = identity.instance_id;
    if (identity.entity_uris) out.entity_uris = identity.entity_uris;
  }
  return out;
}

/**
 * Effective trust score in [0,1] for attention weighting — a transparent,
 * documented default, not a learned model:
 *   base by source_kind (observed .9, derived .75, reported .5, synthetic .35)
 *   + corroboration bonus (+.05 each, cap +.2), scaled to 0 at/after expiry.
 * Documents without an envelope score 0 (unattributed meaning earns no trust).
 */
export function effectiveTrust(doc: UAALProvenancedDocument, nowMs = Date.now()): number {
  const prov = doc.provenance;
  if (!isPlainObject(prov) || validateProvenance(prov).length > 0) return 0;
  const base: Record<UAALSourceKind, number> = {
    observed: 0.9,
    derived: 0.75,
    reported: 0.5,
    synthetic: 0.35,
  };
  let score = base[prov.source_kind as UAALSourceKind] ?? 0;
  const corrob = typeof prov.corroboration === 'number' ? prov.corroboration : 0;
  score = Math.min(1, score + Math.min(0.2, corrob * 0.05));
  const exp = prov.expires_at;
  if (typeof exp === 'string' && ISO_RE.test(exp) && Date.parse(exp) <= nowMs) return 0;
  return score;
}
