/**
 * uAAL semantic IR merge — non-destructive union of two IR documents.
 *
 * Merge rules
 * ===========
 * Node collections (`entities`, `events`, `propositions`, `beliefs`) are
 * unioned by `id`:
 *   - Same id + deep-equal content        → deduped (one copy kept).
 *   - Same id + DIFFERENT content         → BOTH retained. The b-side node is
 *     kept under a deterministic suffixed id (`p1__b`, escalating to `p1__b2`,
 *     `p1__b3`, … on collision) and a conflict entry is recorded.
 *   - Nodes without a usable string `id`  → deduped by deep-equal content,
 *     otherwise all retained (they cannot collide).
 *   - Exact duplicates (same id, deep-equal) WITHIN one document are collapsed
 *     (set semantics — no information is lost).
 *
 * Every other top-level field is an "auxiliary field":
 *   - Present on one side only            → copied.
 *   - Deep-equal on both sides            → kept once.
 *   - Both arrays whose elements are all plain objects (e.g. `causal`)
 *                                         → multiset union (max count per
 *     distinct element, a-side order first).
 *   - Otherwise divergent                 → BOTH retained: a's value under the
 *     key, b's value under `key + suffix`, plus a `divergence` conflict.
 *
 * Contradiction heuristic (propositions) — exactly what is checked
 * =================================================================
 * Two propositions are contradictory when they share the same STATEMENT CORE
 * but have OPPOSITE POLARITY:
 *
 *   Statement core (first present wins):
 *     1. `prop`  — if a non-empty string, its normalized text is the core.
 *     2. `text`  — if a non-empty string, its normalized text is the core.
 *     3. `subject` + `predicate` (+ optional `object`) — if `subject` and
 *        `predicate` are non-empty strings, the core is
 *        `"<subject>|<predicate>|<object ?? ''>"` normalized.
 *     Propositions with no derivable core never match.
 *     Normalization = lowercase, trim, collapse internal whitespace.
 *
 *   Polarity: starts positive (+1);
 *     - flips when `negated === true` (literal boolean),
 *     - flips when `value === false` (literal boolean false only — any other
 *       `value`, including truthy scalars, does not affect polarity).
 *     Double negation (`negated: true` AND `value: false`) yields positive.
 *
 *   NOT checked: textual negation inside `prop`/`text` strings ("door is NOT
 *   open" is a different core, not a negation), the `negates` id-link field
 *   (that is belief-machinery structure, expected inside a single document),
 *   and the `holds` field.
 *
 *   Contradictions are only reported for pairs that the merge INTRODUCES:
 *   one proposition originating from `a`, one from `b`, and the pair not
 *   already co-present inside either single source document (this keeps
 *   `mergeIR(a, a)` conflict-free even when `a` is internally contradictory).
 *   Same-id contradictory pairs are reported once, via the id-collision path,
 *   with kind 'contradiction' instead of 'divergence'.
 *
 * Guarantees
 * ==========
 * - Non-destructive: nothing is silently dropped (only deep-equal duplicates
 *   are collapsed).
 * - Deterministic: output depends only on input order.
 * - Commutative up to id/key suffix assignment: mergeIR(a,b) and mergeIR(b,a)
 *   contain the same multiset of content.
 * - Idempotent: mergeIR(a, a) is content-equal to a with zero conflicts.
 * - Pure: inputs are never mutated; no I/O.
 */

import type {
  UAALSemanticBelief,
  UAALSemanticEntity,
  UAALSemanticEvent,
  UAALSemanticProposition,
} from './semantic';

export interface UAALMergeableIR {
  entities?: UAALSemanticEntity[];
  events?: UAALSemanticEvent[];
  propositions?: UAALSemanticProposition[];
  beliefs?: UAALSemanticBelief[];
  [key: string]: unknown;
}

export type UAALMergeNodeKind = 'entity' | 'event' | 'proposition' | 'belief' | 'field';

export type UAALMergeConflictKind = 'divergence' | 'contradiction';

export interface UAALMergeConflict {
  /** Colliding node id, field key, or `"<idA>~<idB>"` for cross-id contradictions. */
  id: string;
  kind: UAALMergeConflictKind;
  /** Which collection (or 'field' for auxiliary top-level fields) the conflict is in. */
  nodeKind: UAALMergeNodeKind;
  /** The a-side content involved in the conflict (as provided in input `a`). */
  a: unknown;
  /** The b-side content involved in the conflict (as provided in input `b`). */
  b: unknown;
  /** For id/key collisions: the suffixed id/key the b-side content was retained under. */
  bRetainedId?: string;
}

export interface UAALMergeOptions {
  /** Suffix used to keep colliding b-side ids/keys. Default `'__b'`. */
  suffix?: string;
}

export interface UAALMergeResult {
  ir: UAALMergeableIR;
  conflicts: UAALMergeConflict[];
}

const COLLECTIONS: ReadonlyArray<readonly [string, Exclude<UAALMergeNodeKind, 'field'>]> = [
  ['entities', 'entity'],
  ['events', 'event'],
  ['propositions', 'proposition'],
  ['beliefs', 'belief'],
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Stable canonical serialization: sorted keys, undefined dropped, cycle-safe. */
function canonical(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null || value === undefined) return 'null';
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') {
    return JSON.stringify(value) ?? 'null';
  }
  if (kind !== 'object') return JSON.stringify(String(value));
  const obj = value as object;
  if (seen.has(obj)) return '"[circular]"';
  seen.add(obj);
  let out: string;
  if (Array.isArray(obj)) {
    out = `[${obj.map((item) => canonical(item, seen)).join(',')}]`;
  } else {
    const entries = Object.entries(obj as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item, seen)}`);
    out = `{${entries.join(',')}}`;
  }
  seen.delete(obj);
  return out;
}

/** JSON-normalizing deep clone; falls back to the original reference for non-JSON values. */
function cloneValue<T>(value: T): T {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return value;
    return JSON.parse(text) as T;
  } catch {
    return value;
  }
}

function nodeId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function uniqueSuffixed(base: string, suffix: string, used: ReadonlySet<string>): string {
  let candidate = `${base}${suffix}`;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${base}${suffix}${counter}`;
    counter += 1;
  }
  return candidate;
}

function normalizeText(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Statement core per the documented heuristic; null when no core is derivable. */
export function propositionCore(prop: Record<string, unknown>): string | null {
  const direct = prop.prop;
  if (typeof direct === 'string' && direct.trim().length > 0) return normalizeText(direct);
  const text = prop.text;
  if (typeof text === 'string' && text.trim().length > 0) return normalizeText(text);
  const subject = prop.subject;
  const predicate = prop.predicate;
  if (
    typeof subject === 'string' &&
    subject.trim().length > 0 &&
    typeof predicate === 'string' &&
    predicate.trim().length > 0
  ) {
    const object = typeof prop.object === 'string' ? prop.object : '';
    return normalizeText(`${subject}|${predicate}|${object}`);
  }
  return null;
}

/** Polarity per the documented heuristic: +1 positive, -1 negative. */
export function propositionPolarity(prop: Record<string, unknown>): 1 | -1 {
  let polarity: 1 | -1 = 1;
  if (prop.negated === true) polarity = polarity === 1 ? -1 : 1;
  if (prop.value === false) polarity = polarity === 1 ? -1 : 1;
  return polarity;
}

/** True when two propositions share a statement core but disagree in polarity. */
export function propositionsContradict(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const coreA = propositionCore(a);
  if (coreA === null) return false;
  const coreB = propositionCore(b);
  if (coreB === null || coreA !== coreB) return false;
  return propositionPolarity(a) !== propositionPolarity(b);
}

interface RetainedBNode {
  /** The clone retained in the merged document (id possibly suffixed). */
  node: unknown;
  /** The original b-side value (pre-suffix), for co-presence checks and conflict payloads. */
  original: unknown;
  originalId: string | null;
}

interface CollectionMergeOutcome {
  merged: unknown[];
  retainedA: unknown[];
  appendedB: RetainedBNode[];
}

function mergeNodeCollection(
  listA: readonly unknown[],
  listB: readonly unknown[],
  nodeKind: Exclude<UAALMergeNodeKind, 'field'>,
  suffix: string,
  conflicts: UAALMergeConflict[]
): CollectionMergeOutcome {
  const merged: unknown[] = [];
  const retainedA: unknown[] = [];
  const appendedB: RetainedBNode[] = [];
  const byId = new Map<string, { first: unknown; canonicals: Set<string> }>();
  const usedIds = new Set<string>();
  const idlessCanonicals = new Set<string>();

  for (const raw of listA) {
    const id = nodeId(raw);
    const canon = canonical(raw);
    if (id === null) {
      if (idlessCanonicals.has(canon)) continue;
      idlessCanonicals.add(canon);
      const node = cloneValue(raw);
      merged.push(node);
      retainedA.push(node);
      continue;
    }
    const entry = byId.get(id);
    if (entry) {
      if (entry.canonicals.has(canon)) continue; // exact internal duplicate: collapse
      entry.canonicals.add(canon);
    } else {
      byId.set(id, { first: raw, canonicals: new Set([canon]) });
    }
    usedIds.add(id);
    const node = cloneValue(raw);
    merged.push(node);
    retainedA.push(node);
  }

  for (const raw of listB) {
    const id = nodeId(raw);
    const canon = canonical(raw);
    if (id === null) {
      if (idlessCanonicals.has(canon)) continue;
      idlessCanonicals.add(canon);
      const node = cloneValue(raw);
      merged.push(node);
      appendedB.push({ node, original: raw, originalId: null });
      continue;
    }
    const entry = byId.get(id);
    if (!entry) {
      byId.set(id, { first: raw, canonicals: new Set([canon]) });
      usedIds.add(id);
      const node = cloneValue(raw);
      merged.push(node);
      appendedB.push({ node, original: raw, originalId: id });
      continue;
    }
    if (entry.canonicals.has(canon)) continue; // deep-equal to an already-retained node: dedupe
    entry.canonicals.add(canon);

    const contradiction =
      nodeKind === 'proposition' &&
      isRecord(entry.first) &&
      isRecord(raw) &&
      propositionsContradict(entry.first, raw);
    const retainedId = uniqueSuffixed(id, suffix, usedIds);
    usedIds.add(retainedId);
    const node = cloneValue(raw) as Record<string, unknown>;
    node.id = retainedId;
    merged.push(node);
    appendedB.push({ node, original: raw, originalId: id });
    conflicts.push({
      id,
      kind: contradiction ? 'contradiction' : 'divergence',
      nodeKind,
      a: cloneValue(entry.first),
      b: cloneValue(raw),
      bRetainedId: retainedId,
    });
  }

  return { merged, retainedA, appendedB };
}

function crossContradictions(
  listA: readonly unknown[],
  listB: readonly unknown[],
  retainedA: readonly unknown[],
  appendedB: readonly RetainedBNode[],
  conflicts: UAALMergeConflict[]
): void {
  const aCanonicals = new Set(listA.map((item) => canonical(item)));
  const bCanonicals = new Set(listB.map((item) => canonical(item)));

  for (const x of retainedA) {
    if (!isRecord(x)) continue;
    if (propositionCore(x) === null) continue;
    if (bCanonicals.has(canonical(x))) continue; // co-present in b: not introduced by merge
    const xId = nodeId(x);
    for (const { original, originalId } of appendedB) {
      if (!isRecord(original)) continue;
      if (xId !== null && xId === originalId) continue; // same-id pairs handled at collision time
      if (aCanonicals.has(canonical(original))) continue; // co-present in a: not introduced by merge
      if (!propositionsContradict(x, original)) continue;
      const idA = xId;
      const idB = originalId;
      const conflictId =
        idA !== null && idB !== null
          ? idA === idB
            ? idA
            : `${idA}~${idB}`
          : (idA ?? idB ?? propositionCore(x) ?? '');
      conflicts.push({
        id: conflictId,
        kind: 'contradiction',
        nodeKind: 'proposition',
        a: cloneValue(x),
        b: cloneValue(original),
      });
    }
  }
}

function isArrayOfRecords(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

/** Multiset union (max count per distinct element), a-order first. */
function unionRecordArrays(listA: readonly unknown[], listB: readonly unknown[]): unknown[] {
  const out = listA.map((item) => cloneValue(item));
  const available = new Map<string, number>();
  for (const item of listA) {
    const canon = canonical(item);
    available.set(canon, (available.get(canon) ?? 0) + 1);
  }
  for (const item of listB) {
    const canon = canonical(item);
    const remaining = available.get(canon) ?? 0;
    if (remaining > 0) {
      available.set(canon, remaining - 1);
      continue;
    }
    out.push(cloneValue(item));
  }
  return out;
}

/**
 * Merge two semantic IR documents. Pure — inputs are never mutated.
 * See the module header for the full rule set and contradiction heuristic.
 */
export function mergeIR(
  a: UAALMergeableIR,
  b: UAALMergeableIR,
  opts?: UAALMergeOptions
): UAALMergeResult {
  const docA: Record<string, unknown> = isRecord(a) ? a : {};
  const docB: Record<string, unknown> = isRecord(b) ? b : {};
  const suffix = opts?.suffix !== undefined && opts.suffix.length > 0 ? opts.suffix : '__b';
  const conflicts: UAALMergeConflict[] = [];
  const out: Record<string, unknown> = {};

  // Collection keys mergeable as node collections (array-or-absent on BOTH sides).
  const mergedCollectionKeys = new Set<string>();
  const propositionScan: {
    listA: readonly unknown[];
    listB: readonly unknown[];
    retainedA: readonly unknown[];
    appendedB: readonly RetainedBNode[];
  }[] = [];

  for (const [key, nodeKind] of COLLECTIONS) {
    const rawA = docA[key];
    const rawB = docB[key];
    const aOk = rawA === undefined || Array.isArray(rawA);
    const bOk = rawB === undefined || Array.isArray(rawB);
    if (!aOk || !bOk) continue; // malformed collection value: fall through to auxiliary handling
    mergedCollectionKeys.add(key);
    if (rawA === undefined && rawB === undefined) continue;
    const listA = Array.isArray(rawA) ? rawA : [];
    const listB = Array.isArray(rawB) ? rawB : [];
    const { merged, retainedA, appendedB } = mergeNodeCollection(
      listA,
      listB,
      nodeKind,
      suffix,
      conflicts
    );
    out[key] = merged;
    if (nodeKind === 'proposition') {
      propositionScan.push({ listA, listB, retainedA, appendedB });
    }
  }

  for (const scan of propositionScan) {
    crossContradictions(scan.listA, scan.listB, scan.retainedA, scan.appendedB, conflicts);
  }

  // Auxiliary top-level fields (everything not merged as a node collection).
  const auxKeys: string[] = [];
  for (const key of Object.keys(docA)) {
    if (!mergedCollectionKeys.has(key) && docA[key] !== undefined) auxKeys.push(key);
  }
  for (const key of Object.keys(docB)) {
    if (!mergedCollectionKeys.has(key) && docB[key] !== undefined && !auxKeys.includes(key)) {
      auxKeys.push(key);
    }
  }

  const takenKeys = new Set<string>([
    ...Object.keys(docA),
    ...Object.keys(docB),
    ...Object.keys(out),
  ]);

  for (const key of auxKeys) {
    const valueA = docA[key];
    const valueB = docB[key];
    const hasA = valueA !== undefined;
    const hasB = valueB !== undefined;
    if (hasA && !hasB) {
      out[key] = cloneValue(valueA);
      continue;
    }
    if (!hasA && hasB) {
      out[key] = cloneValue(valueB);
      continue;
    }
    if (canonical(valueA) === canonical(valueB)) {
      out[key] = cloneValue(valueA);
      continue;
    }
    if (isArrayOfRecords(valueA) && isArrayOfRecords(valueB)) {
      out[key] = unionRecordArrays(valueA, valueB);
      continue;
    }
    // Divergent auxiliary field: retain both, a under the key, b under a suffixed key.
    out[key] = cloneValue(valueA);
    const altKey = uniqueSuffixed(key, suffix, takenKeys);
    takenKeys.add(altKey);
    out[altKey] = cloneValue(valueB);
    conflicts.push({
      id: key,
      kind: 'divergence',
      nodeKind: 'field',
      a: cloneValue(valueA),
      b: cloneValue(valueB),
      bRetainedId: altKey,
    });
  }

  return { ir: out as UAALMergeableIR, conflicts };
}
