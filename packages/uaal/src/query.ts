/**
 * uAAL semantic IR corpus query — flat, filtered reads over an array of IR docs.
 *
 * Semantics
 * =========
 * Documents are visited in corpus order; within a document, collections are
 * visited in the fixed order entity → event → proposition → belief, each in
 * array order, so results are deterministic.
 *
 * Filters (all optional, AND-combined):
 *   - `kind`          — restrict to one collection. An unrecognized kind
 *                       matches nothing.
 *   - `about`         — a node matches when, scanning its string values
 *                       (own enumerable properties, nested objects/arrays up
 *                       to depth 3):
 *                         * any string strictly equals `about` (entity-id /
 *                           reference equality — covers `id`, `subject`,
 *                           `object`, `actor`, `agent`, `prop`, …), OR
 *                         * any string CONTAINS `about` and is uri-like
 *                           (the value contains '://', or the property key is
 *                           uri/url/href/iri/source/source_uri).
 *                       Textual substring match on non-uri prose is NOT
 *                       performed.
 *   - `minConfidence` — node matches only when `node.confidence` is a number
 *                       and `>= minConfidence`; nodes without a numeric
 *                       confidence are EXCLUDED when this filter is set.
 *   - `sourceKind`    — document-level filter: only docs whose optional
 *                       `doc.provenance.source_kind` strictly equals it are
 *                       scanned. Docs without provenance are excluded when
 *                       this filter is set.
 *   - `limit`         — cap on total hits across the corpus (first-N in
 *                       traversal order). Non-finite or negative values are
 *                       ignored; `limit: 0` returns no hits.
 *
 * Provenance fields are read defensively — `doc.provenance?.source_kind` and
 * `doc.instance_id` are optional (the envelope module lands in parallel);
 * `instanceId` is set on a hit only when `doc.instance_id` is a string.
 *
 * Defensive tolerance: a non-array corpus yields []; non-object docs,
 * non-array collections, and non-object nodes are skipped.
 *
 * Pure: no I/O, inputs are never mutated. Hits reference the input nodes
 * directly (no cloning).
 */

import type {
  UAALSemanticBelief,
  UAALSemanticEntity,
  UAALSemanticEvent,
  UAALSemanticProposition,
} from './semantic';

export type UAALQueryKind = 'proposition' | 'belief' | 'event' | 'entity';

export interface UAALQueryProvenance {
  source_kind?: string;
  [key: string]: unknown;
}

export interface UAALQueryableIR {
  entities?: UAALSemanticEntity[];
  events?: UAALSemanticEvent[];
  propositions?: UAALSemanticProposition[];
  beliefs?: UAALSemanticBelief[];
  /** Optional envelope provenance — read defensively when present. */
  provenance?: UAALQueryProvenance;
  /** Optional envelope instance id — read defensively when present. */
  instance_id?: string;
  [key: string]: unknown;
}

export interface UAALQuery {
  /** Entity id (exact string match on any field) or uri substring match. */
  about?: string;
  kind?: UAALQueryKind;
  minConfidence?: number;
  sourceKind?: string;
  limit?: number;
}

export interface UAALQueryHit {
  docIndex: number;
  kind: UAALQueryKind;
  node: Record<string, unknown>;
  instanceId?: string;
}

const KIND_ORDER: ReadonlyArray<readonly [UAALQueryKind, string]> = [
  ['entity', 'entities'],
  ['event', 'events'],
  ['proposition', 'propositions'],
  ['belief', 'beliefs'],
] as const;

const URI_KEY_PATTERN = /^(uri|url|href|iri|source|source_uri)$/i;

const MAX_ABOUT_DEPTH = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringMatchesAbout(key: string, value: string, about: string): boolean {
  if (value === about) return true;
  if (!value.includes(about)) return false;
  return URI_KEY_PATTERN.test(key) || value.includes('://');
}

function valueMatchesAbout(key: string, value: unknown, about: string, depth: number): boolean {
  if (typeof value === 'string') return stringMatchesAbout(key, value, about);
  if (depth >= MAX_ABOUT_DEPTH) return false;
  if (Array.isArray(value)) {
    return value.some((item) => valueMatchesAbout(key, item, about, depth + 1));
  }
  if (isRecord(value)) {
    return Object.entries(value).some(([childKey, child]) =>
      valueMatchesAbout(childKey, child, about, depth + 1)
    );
  }
  return false;
}

/** True when a node references `about` per the documented matching rules. */
export function nodeMatchesAbout(node: Record<string, unknown>, about: string): boolean {
  return Object.entries(node).some(([key, value]) => valueMatchesAbout(key, value, about, 0));
}

/**
 * Query a corpus of semantic IR documents. Pure — returns flat hits in
 * deterministic traversal order. See the module header for filter semantics.
 */
export function queryIR(
  corpus: ReadonlyArray<UAALQueryableIR | null | undefined> | null | undefined,
  q?: UAALQuery | null
): UAALQueryHit[] {
  if (!Array.isArray(corpus)) return [];
  const query: UAALQuery = isRecord(q) ? (q as UAALQuery) : {};
  const limit =
    typeof query.limit === 'number' && Number.isFinite(query.limit) && query.limit >= 0
      ? Math.floor(query.limit)
      : Number.POSITIVE_INFINITY;
  if (limit === 0) return [];

  const hits: UAALQueryHit[] = [];

  for (let docIndex = 0; docIndex < corpus.length; docIndex += 1) {
    if (hits.length >= limit) break;
    const doc = corpus[docIndex];
    if (!isRecord(doc)) continue;

    if (typeof query.sourceKind === 'string') {
      const provenance = doc.provenance;
      const sourceKind = isRecord(provenance) ? provenance.source_kind : undefined;
      if (sourceKind !== query.sourceKind) continue;
    }

    const instanceId = typeof doc.instance_id === 'string' ? doc.instance_id : undefined;

    for (const [kind, key] of KIND_ORDER) {
      if (hits.length >= limit) break;
      if (query.kind !== undefined && query.kind !== kind) continue;
      const list = doc[key];
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        if (hits.length >= limit) break;
        if (!isRecord(raw)) continue;
        if (typeof query.minConfidence === 'number') {
          const confidence = raw.confidence;
          if (typeof confidence !== 'number' || confidence < query.minConfidence) continue;
        }
        if (typeof query.about === 'string' && query.about.length > 0) {
          if (!nodeMatchesAbout(raw, query.about)) continue;
        }
        hits.push(
          instanceId !== undefined
            ? { docIndex, kind, node: raw, instanceId }
            : { docIndex, kind, node: raw }
        );
      }
    }
  }

  return hits;
}
