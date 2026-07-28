import { describe, expect, it } from 'vitest';
import { mergeIR, propositionCore, propositionPolarity, propositionsContradict } from '../merge';
import type { UAALMergeableIR } from '../merge';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Stable stringify with sorted keys, mirroring merge's canonical form. */
function canon(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canon(item)}`);
  return `{${entries.join(',')}}`;
}

const COLLECTION_KEYS = new Set(['entities', 'events', 'propositions', 'beliefs']);

function stripSuffix(id: string): string {
  return id.replace(/(?:__b\d*)+$/, '');
}

/**
 * Content multiset of a merged IR, normalized so that suffix assignment is
 * invisible: node ids and auxiliary keys have the `__b`/`__bN` suffix
 * stripped, and array-valued auxiliary fields compare as sorted multisets.
 */
function contentMultiset(ir: UAALMergeableIR): string[] {
  const items: string[] = [];
  for (const [key, value] of Object.entries(ir)) {
    const baseKey = stripSuffix(key);
    if (COLLECTION_KEYS.has(baseKey) && Array.isArray(value)) {
      for (const node of value) {
        let normalized: unknown = node;
        if (isRecord(node) && typeof node.id === 'string') {
          normalized = { ...node, id: stripSuffix(node.id) };
        }
        items.push(`${baseKey}|${canon(normalized)}`);
      }
      continue;
    }
    const valueCanon = Array.isArray(value)
      ? `[${value.map(canon).sort().join(',')}]`
      : canon(value);
    items.push(`field|${baseKey}|${valueCanon}`);
  }
  return items.sort();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const docA: UAALMergeableIR = {
  entities: [
    { id: 'e_door', kind: 'object', label: 'Door' },
    { id: 'e_key', kind: 'object', label: 'Key' },
  ],
  events: [{ id: 'ev_open', actor: 'marin', act: 'open', object: 'e_door', t: 1 }],
  propositions: [
    { id: 'p_unlocked', subject: 'e_door', predicate: 'is_locked', negated: true },
    { id: 'p_wind', text: 'wind is blowing' },
  ],
  beliefs: [{ id: 'b_marin', agent: 'marin', prop: 'p_unlocked' }],
  causal: [{ from: 'ev_open', to: 'p_unlocked', mechanism: 'direct observation' }],
  t_now: 5,
};

const docB: UAALMergeableIR = {
  entities: [
    { id: 'e_door', kind: 'object', label: 'Door' }, // identical to a's — dedupes
    { id: 'e_key', kind: 'object', label: 'Brass Key' }, // same id, different content
  ],
  propositions: [
    { id: 'p_locked', subject: 'e_door', predicate: 'is_locked' }, // contradicts p_unlocked
    { id: 'p_wind', text: 'wind is blowing' }, // identical — dedupes
  ],
  beliefs: [{ id: 'b_rowan', agent: 'rowan', prop: 'p_locked' }],
  causal: [
    { from: 'ev_open', to: 'p_unlocked', mechanism: 'direct observation' }, // duplicate link
    { from: 'rumor', to: 'p_locked', mechanism: 'hearsay' },
  ],
  t_now: 9, // divergent scalar field
};

/** Internally contradictory document — merge must NOT flag its own pairs. */
const docInternal: UAALMergeableIR = {
  propositions: [
    { id: 'p_blue', subject: 'sky', predicate: 'is_blue' },
    { id: 'p_not_blue', subject: 'sky', predicate: 'is_blue', negated: true },
  ],
};

const docValueFalse: UAALMergeableIR = {
  propositions: [{ id: 'p_gray', subject: 'sky', predicate: 'is_blue', value: false }],
};

const fixturePool: UAALMergeableIR[] = [
  docA,
  docB,
  docInternal,
  docValueFalse,
  {},
  { entities: [{ id: 'e_solo', label: 'Solo' }], notes: 'plain scalar' },
];

// ---------------------------------------------------------------------------
// Union + dedupe + conflict retention
// ---------------------------------------------------------------------------

describe('mergeIR union semantics', () => {
  it('unions all four collections by id and dedupes deep-equal nodes', () => {
    const { ir } = mergeIR(docA, docB);
    const entityIds = (ir.entities ?? []).map((entity) => entity.id);
    expect(entityIds).toEqual(['e_door', 'e_key', 'e_key__b']);
    expect((ir.events ?? []).map((event) => event.id)).toEqual(['ev_open']);
    expect((ir.propositions ?? []).map((prop) => prop.id)).toEqual([
      'p_unlocked',
      'p_wind',
      'p_locked',
    ]);
    expect((ir.beliefs ?? []).map((belief) => belief.id)).toEqual(['b_marin', 'b_rowan']);
  });

  it('retains BOTH divergent same-id nodes and records the conflict', () => {
    const { ir, conflicts } = mergeIR(docA, docB);
    const divergence = conflicts.find(
      (conflict) => conflict.nodeKind === 'entity' && conflict.id === 'e_key'
    );
    expect(divergence).toBeDefined();
    expect(divergence?.kind).toBe('divergence');
    expect(divergence?.a).toEqual({ id: 'e_key', kind: 'object', label: 'Key' });
    expect(divergence?.b).toEqual({ id: 'e_key', kind: 'object', label: 'Brass Key' });
    expect(divergence?.bRetainedId).toBe('e_key__b');
    const suffixed = (ir.entities ?? []).find((entity) => entity.id === 'e_key__b');
    expect(suffixed?.label).toBe('Brass Key');
    // Nothing dropped: a's version is intact under the original id.
    const original = (ir.entities ?? []).find((entity) => entity.id === 'e_key');
    expect(original?.label).toBe('Key');
  });

  it('escalates the suffix deterministically when the suffixed id is already taken', () => {
    const a: UAALMergeableIR = {
      propositions: [
        { id: 'p1', text: 'alpha' },
        { id: 'p1__b', text: 'squatter' },
      ],
    };
    const b: UAALMergeableIR = { propositions: [{ id: 'p1', text: 'beta' }] };
    const { ir, conflicts } = mergeIR(a, b);
    const ids = (ir.propositions ?? []).map((prop) => prop.id);
    expect(ids).toEqual(['p1', 'p1__b', 'p1__b2']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(conflicts[0]?.bRetainedId).toBe('p1__b2');
  });

  it('supports a custom suffix via options', () => {
    const { ir } = mergeIR(docA, docB, { suffix: '@remote' });
    expect((ir.entities ?? []).map((entity) => entity.id)).toContain('e_key@remote');
  });

  it('unions array-of-object auxiliary fields (e.g. causal) with dedupe', () => {
    const { ir } = mergeIR(docA, docB);
    expect(ir.causal).toEqual([
      { from: 'ev_open', to: 'p_unlocked', mechanism: 'direct observation' },
      { from: 'rumor', to: 'p_locked', mechanism: 'hearsay' },
    ]);
  });

  it('retains BOTH sides of a divergent scalar auxiliary field', () => {
    const { ir, conflicts } = mergeIR(docA, docB);
    expect(ir.t_now).toBe(5);
    expect(ir.t_now__b).toBe(9);
    const fieldConflict = conflicts.find((conflict) => conflict.nodeKind === 'field');
    expect(fieldConflict).toEqual({
      id: 't_now',
      kind: 'divergence',
      nodeKind: 'field',
      a: 5,
      b: 9,
      bRetainedId: 't_now__b',
    });
  });

  it('keeps id-less nodes from both sides, deduping only deep-equal ones', () => {
    const a: UAALMergeableIR = { beliefs: [{ agent: 'marin', prop: 'p1' }] };
    const b: UAALMergeableIR = {
      beliefs: [
        { agent: 'marin', prop: 'p1' }, // deep-equal — dedupes
        { agent: 'rowan', prop: 'p2' },
      ],
    };
    const { ir, conflicts } = mergeIR(a, b);
    expect(ir.beliefs).toEqual([
      { agent: 'marin', prop: 'p1' },
      { agent: 'rowan', prop: 'p2' },
    ]);
    expect(conflicts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Contradiction heuristic
// ---------------------------------------------------------------------------

describe('mergeIR contradiction detection', () => {
  it('flags cross-document subject+predicate propositions with negated mismatch', () => {
    const { ir, conflicts } = mergeIR(docA, docB);
    const contradiction = conflicts.find((conflict) => conflict.kind === 'contradiction');
    expect(contradiction).toBeDefined();
    expect(contradiction?.nodeKind).toBe('proposition');
    expect(contradiction?.id).toBe('p_unlocked~p_locked');
    expect(contradiction?.a).toEqual({
      id: 'p_unlocked',
      subject: 'e_door',
      predicate: 'is_locked',
      negated: true,
    });
    expect(contradiction?.b).toEqual({ id: 'p_locked', subject: 'e_door', predicate: 'is_locked' });
    // Both propositions retained in the merged document.
    const ids = (ir.propositions ?? []).map((prop) => prop.id);
    expect(ids).toContain('p_unlocked');
    expect(ids).toContain('p_locked');
  });

  it('treats value === false as negative polarity', () => {
    const { conflicts } = mergeIR(docInternal, docValueFalse);
    // p_blue (+) from internal vs p_gray (value:false, -) from b → contradiction.
    // p_not_blue (-) vs p_gray (-) → same polarity, no contradiction.
    const contradictions = conflicts.filter((conflict) => conflict.kind === 'contradiction');
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0]?.id).toBe('p_blue~p_gray');
  });

  it('matches cores via the prop and text fields as well', () => {
    const a: UAALMergeableIR = { propositions: [{ id: 'x1', prop: 'Door Is  Open' }] };
    const b: UAALMergeableIR = {
      propositions: [{ id: 'y1', prop: 'door is open', negated: true }],
    };
    expect(mergeIR(a, b).conflicts.some((conflict) => conflict.kind === 'contradiction')).toBe(
      true
    );

    const c: UAALMergeableIR = { propositions: [{ id: 'x2', text: 'rain fell' }] };
    const d: UAALMergeableIR = { propositions: [{ id: 'y2', text: 'rain fell', value: false }] };
    expect(mergeIR(c, d).conflicts.some((conflict) => conflict.kind === 'contradiction')).toBe(
      true
    );
  });

  it('same-id contradictory pair is reported once with kind contradiction', () => {
    const a: UAALMergeableIR = {
      propositions: [{ id: 'p1', subject: 'sky', predicate: 'is_blue' }],
    };
    const b: UAALMergeableIR = {
      propositions: [{ id: 'p1', subject: 'sky', predicate: 'is_blue', negated: true }],
    };
    const { ir, conflicts } = mergeIR(a, b);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe('contradiction');
    expect(conflicts[0]?.id).toBe('p1');
    expect(conflicts[0]?.bRetainedId).toBe('p1__b');
    expect((ir.propositions ?? []).map((prop) => prop.id)).toEqual(['p1', 'p1__b']);
  });

  it('does NOT flag pairs already co-present inside one source document', () => {
    // docInternal contains its own contradiction; merging with itself or with a
    // doc that shares one member must not surface the pre-existing pair.
    expect(mergeIR(docInternal, docInternal).conflicts).toEqual([]);
    const shared: UAALMergeableIR = {
      propositions: [clone((docInternal.propositions ?? [])[0])],
    };
    // shared's p_blue is co-present in docInternal → not merge-introduced.
    expect(mergeIR(docInternal, shared).conflicts).toEqual([]);
  });

  it('does not parse textual negation and ignores the negates id-link', () => {
    const a: UAALMergeableIR = { propositions: [{ id: 'p1', text: 'door is open' }] };
    const b: UAALMergeableIR = { propositions: [{ id: 'p2', text: 'door is not open' }] };
    expect(mergeIR(a, b).conflicts).toEqual([]);

    const c: UAALMergeableIR = { propositions: [{ id: 'q1', subject: 's', predicate: 'p' }] };
    const d: UAALMergeableIR = {
      propositions: [{ id: 'q2', negates: 'q1', subject: 'other', predicate: 'p' }],
    };
    expect(mergeIR(c, d).conflicts).toEqual([]);
  });

  it('exposes the documented heuristic primitives', () => {
    expect(propositionCore({ prop: '  Sky  IS blue ' })).toBe('sky is blue');
    expect(propositionCore({ text: 'Rain fell' })).toBe('rain fell');
    expect(propositionCore({ subject: 'Sky', predicate: 'is_blue' })).toBe('sky|is_blue|');
    expect(propositionCore({ subject: 'Sky', predicate: 'is_blue', object: 'Today' })).toBe(
      'sky|is_blue|today'
    );
    expect(propositionCore({ id: 'p1' })).toBeNull();

    expect(propositionPolarity({})).toBe(1);
    expect(propositionPolarity({ negated: true })).toBe(-1);
    expect(propositionPolarity({ value: false })).toBe(-1);
    expect(propositionPolarity({ negated: true, value: false })).toBe(1); // double negation
    expect(propositionPolarity({ value: 5 })).toBe(1); // non-boolean value ignored

    expect(
      propositionsContradict(
        { subject: 'sky', predicate: 'is_blue' },
        { subject: 'sky', predicate: 'is_blue', negated: true }
      )
    ).toBe(true);
    expect(propositionsContradict({ text: 'a' }, { text: 'b', negated: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Algebraic properties
// ---------------------------------------------------------------------------

describe('mergeIR algebraic properties', () => {
  it('is idempotent: mergeIR(a, a) is content-equal to a with zero conflicts', () => {
    for (const doc of fixturePool) {
      const { ir, conflicts } = mergeIR(doc, doc);
      expect(conflicts).toEqual([]);
      expect(canon(ir)).toBe(canon(clone(doc)));
    }
  });

  it('is commutative up to suffix assignment: same content multiset over all fixture pairs', () => {
    for (const a of fixturePool) {
      for (const b of fixturePool) {
        const forward = contentMultiset(mergeIR(a, b).ir);
        const backward = contentMultiset(mergeIR(b, a).ir);
        expect(forward).toEqual(backward);
      }
    }
  });

  it('is deterministic: repeated calls produce deep-equal results', () => {
    const first = mergeIR(docA, docB);
    const second = mergeIR(docA, docB);
    expect(second).toEqual(first);
  });

  it('is pure: inputs are never mutated', () => {
    const aBefore = canon(docA);
    const bBefore = canon(docB);
    mergeIR(docA, docB);
    mergeIR(docB, docA);
    expect(canon(docA)).toBe(aBefore);
    expect(canon(docB)).toBe(bBefore);
  });

  it('returned ir shares no references with the inputs', () => {
    const { ir } = mergeIR(docA, docB);
    expect(ir.entities?.[0]).not.toBe(docA.entities?.[0]);
    (ir.entities?.[0] as Record<string, unknown>).label = 'MUTATED';
    expect(docA.entities?.[0]?.label).toBe('Door');
  });
});

// ---------------------------------------------------------------------------
// Empty / malformed tolerance
// ---------------------------------------------------------------------------

describe('mergeIR empty and malformed tolerance', () => {
  it('merges empty documents', () => {
    expect(mergeIR({}, {})).toEqual({ ir: {}, conflicts: [] });
  });

  it('merging with an empty document preserves the other side', () => {
    const { ir, conflicts } = mergeIR(docA, {});
    expect(conflicts).toEqual([]);
    expect(canon(ir)).toBe(canon(clone(docA)));
    const reversed = mergeIR({}, docA);
    expect(reversed.conflicts).toEqual([]);
    expect(canon(reversed.ir)).toBe(canon(clone(docA)));
  });

  it('tolerates non-object inputs', () => {
    const bad = null as unknown as UAALMergeableIR;
    expect(mergeIR(bad, docA).conflicts).toEqual([]);
    expect(canon(mergeIR(bad, docA).ir)).toBe(canon(clone(docA)));
    expect(mergeIR(docA, bad).conflicts).toEqual([]);
  });

  it('treats a non-array collection value as a divergent auxiliary field (nothing dropped)', () => {
    const malformed = { propositions: 'garbage', t_now: 5 } as unknown as UAALMergeableIR;
    const { ir, conflicts } = mergeIR(docA, malformed);
    // a's real propositions survive under the key; the garbage survives suffixed.
    expect(Array.isArray(ir.propositions)).toBe(true);
    expect(ir.propositions__b).toBe('garbage');
    const conflict = conflicts.find((entry) => entry.id === 'propositions');
    expect(conflict?.kind).toBe('divergence');
    expect(conflict?.nodeKind).toBe('field');
    // t_now is deep-equal on both sides — no conflict for it.
    expect(conflicts.filter((entry) => entry.id === 't_now')).toEqual([]);
  });

  it('tolerates non-object nodes inside collections', () => {
    const weird = {
      propositions: [null, 42, 'stray', { id: 'p_ok', text: 'fine' }],
    } as unknown as UAALMergeableIR;
    const { ir, conflicts } = mergeIR(weird, weird);
    expect(conflicts).toEqual([]);
    expect(ir.propositions).toEqual([null, 42, 'stray', { id: 'p_ok', text: 'fine' }]);
  });

  it('collapses exact internal duplicates without conflicts', () => {
    const dup: UAALMergeableIR = {
      entities: [
        { id: 'e1', label: 'One' },
        { id: 'e1', label: 'One' },
      ],
    };
    const { ir, conflicts } = mergeIR(dup, {});
    expect(ir.entities).toEqual([{ id: 'e1', label: 'One' }]);
    expect(conflicts).toEqual([]);
  });
});
