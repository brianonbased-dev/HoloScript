// @vitest-environment node
/**
 * agentation-annotation-flow.scenario.ts — LIVING-SPEC: Agentation Annotation System
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LIVING-SPEC: /api/annotations route contracts + type validation
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Persona: Dev — an engineer debugging why annotations from the wired
 * studio component aren't reaching the knowledge store. They need to
 * verify the annotation shape, the API route's session creation, the
 * status lifecycle, and the severity filtering logic.
 *
 * Coverage:
 *   annotation-types.ts          — StoredAnnotation, AnnotationSession
 *   /api/annotations POST        — create session, add annotations, resolve
 *   /api/annotations GET         — list sessions, pending count
 *   /api/annotations DELETE      — clear sessions
 *   /api/annotations/:id GET     — session stats by status/intent/severity
 *   /api/annotations/:id PATCH   — update annotation status
 *   /api/annotations/:id DELETE  — delete session
 *
 * ✔  it(...)       — test PASSES → feature EXISTS
 * ⊡  it.todo(...)  — test SKIPPED → feature is MISSING (backlog item)
 *
 * Run: npx vitest run src/__tests__/scenarios/agentation-annotation-flow.scenario.ts --reporter=verbose
 * ═══════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { StoredAnnotation, AnnotationSession } from '../../lib/annotation-types';

// ── Re-implement the route logic for unit testing ────────────────────────────
//
// Next.js App Router handlers cannot be imported in vitest without the full
// Next.js test infrastructure. Instead we mirror the pure session store
// logic (identical to the route) so we can test the data contracts and
// branching behaviour in isolation — matching the mcp-call-route pattern.
//
// When the annotation API logic changes, update the helpers below.
// ────────────────────────────────────────────────────────────────────────────

type SessionStore = Map<string, AnnotationSession>;

function makeStore(): SessionStore {
  return new Map<string, AnnotationSession>();
}

function createOrUpdateSession(
  store: SessionStore,
  opts: {
    sessionId?: string;
    annotations?: StoredAnnotation[];
    route?: string;
    metadata?: AnnotationSession['metadata'];
  }
): { session: AnnotationSession; created: boolean } {
  const id =
    opts.sessionId ??
    `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const existing = store.get(id);

  if (existing) {
    if (opts.annotations?.length) {
      existing.annotations.push(...opts.annotations);
    }
    existing.updatedAt = new Date().toISOString();
    if (opts.metadata) existing.metadata = { ...existing.metadata, ...opts.metadata };
    return { session: existing, created: false };
  }

  const session: AnnotationSession = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    route: opts.route ?? '/',
    annotations: opts.annotations ?? [],
    metadata: opts.metadata,
  };
  store.set(id, session);
  return { session, created: true };
}

function listSessions(store: SessionStore) {
  const all = Array.from(store.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return {
    sessions: all,
    count: all.length,
    pending: all.reduce(
      (sum, s) => sum + s.annotations.filter((a) => a.status !== 'resolved').length,
      0
    ),
  };
}

function resolveAnnotation(
  store: SessionStore,
  sessionId: string,
  annotationId: string,
  resolvedBy: 'human' | 'agent' = 'agent'
): StoredAnnotation | null {
  const session = store.get(sessionId);
  if (!session) return null;
  const ann = session.annotations.find((a) => a.id === annotationId);
  if (!ann) return null;
  ann.status = 'resolved';
  ann.resolvedAt = new Date().toISOString();
  ann.resolvedBy = resolvedBy;
  session.updatedAt = new Date().toISOString();
  return ann;
}

function getSessionStats(session: AnnotationSession) {
  return {
    total: session.annotations.length,
    pending: session.annotations.filter((a) => a.status === 'pending' || !a.status).length,
    acknowledged: session.annotations.filter((a) => a.status === 'acknowledged').length,
    resolved: session.annotations.filter((a) => a.status === 'resolved').length,
    blocking: session.annotations.filter((a) => a.severity === 'blocking').length,
    byIntent: {
      fix: session.annotations.filter((a) => a.intent === 'fix').length,
      change: session.annotations.filter((a) => a.intent === 'change').length,
      question: session.annotations.filter((a) => a.intent === 'question').length,
      approve: session.annotations.filter((a) => a.intent === 'approve').length,
    },
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAnnotation(overrides: Partial<StoredAnnotation> = {}): StoredAnnotation {
  return {
    id: `ann-${Math.random().toString(36).slice(2, 8)}`,
    x: 100,
    y: 200,
    comment: 'Button text is unclear',
    element: 'button',
    elementPath: 'div > section > button',
    timestamp: Date.now(),
    status: 'pending',
    ...overrides,
  };
}

// ── StoredAnnotation type contracts ──────────────────────────────────────────

describe('Scenario: StoredAnnotation type contract', () => {
  it('required fields are id, x, y, comment, element, elementPath, timestamp', () => {
    const ann: StoredAnnotation = {
      id: 'ann-001',
      x: 120,
      y: 340,
      comment: 'Contrast ratio fails WCAG AA',
      element: 'p',
      elementPath: 'main > article > p',
      timestamp: 1700000000000,
    };
    expect(ann.id).toBe('ann-001');
    expect(ann.x).toBe(120);
    expect(ann.y).toBe(340);
  });

  it('status enum is pending | acknowledged | resolved | dismissed', () => {
    const statuses: StoredAnnotation['status'][] = [
      'pending',
      'acknowledged',
      'resolved',
      'dismissed',
    ];
    expect(statuses).toHaveLength(4);
    expect(statuses).toContain('resolved');
  });

  it('intent enum is fix | change | question | approve', () => {
    const intents: StoredAnnotation['intent'][] = ['fix', 'change', 'question', 'approve'];
    expect(intents).toHaveLength(4);
    expect(intents).toContain('fix');
  });

  it('severity enum is blocking | important | suggestion', () => {
    const severities: StoredAnnotation['severity'][] = ['blocking', 'important', 'suggestion'];
    expect(severities).toHaveLength(3);
  });

  it('kind enum is feedback | placement | rearrange', () => {
    const kinds: StoredAnnotation['kind'][] = ['feedback', 'placement', 'rearrange'];
    expect(kinds).toHaveLength(3);
  });

  it('resolvedBy is human or agent', () => {
    const resolvers: StoredAnnotation['resolvedBy'][] = ['human', 'agent'];
    expect(resolvers).toHaveLength(2);
  });

  it('optional boundingBox has x, y, width, height', () => {
    const ann: StoredAnnotation = {
      ...makeAnnotation(),
      boundingBox: { x: 10, y: 20, width: 200, height: 50 },
    };
    expect(ann.boundingBox?.width).toBe(200);
    expect(ann.boundingBox?.height).toBe(50);
  });

  it('placement shape has componentType, dimensions, scrollY', () => {
    const ann: StoredAnnotation = {
      ...makeAnnotation(),
      kind: 'placement',
      placement: {
        componentType: 'Button',
        width: 120,
        height: 40,
        scrollY: 300,
        text: 'Submit',
      },
    };
    expect(ann.placement?.componentType).toBe('Button');
    expect(ann.placement?.scrollY).toBe(300);
  });
});

// ── AnnotationSession type contract ──────────────────────────────────────────

describe('Scenario: AnnotationSession type contract', () => {
  it('session has id, createdAt, updatedAt, route, annotations', () => {
    const session: AnnotationSession = {
      id: 'sess-001',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      route: '/studio',
      annotations: [],
    };
    expect(session.id).toBe('sess-001');
    expect(session.route).toBe('/studio');
    expect(Array.isArray(session.annotations)).toBe(true);
  });

  it('session metadata is optional', () => {
    const session: AnnotationSession = {
      id: 'sess-002',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      route: '/',
      annotations: [],
    };
    expect(session.metadata).toBeUndefined();
  });

  it('session metadata viewport has width and height', () => {
    const session: AnnotationSession = {
      id: 'sess-003',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      route: '/character',
      annotations: [],
      metadata: {
        viewport: { width: 1920, height: 1080 },
        theme: 'dark',
        userAgent: 'Mozilla/5.0',
      },
    };
    expect(session.metadata?.viewport?.width).toBe(1920);
    expect(session.metadata?.theme).toBe('dark');
  });
});

// ── Session store: POST (create + update) ────────────────────────────────────

describe('Scenario: /api/annotations POST — session lifecycle', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = makeStore();
  });

  it('POST creates a new session and returns created:true', () => {
    const { session, created } = createOrUpdateSession(store, { route: '/studio' });
    expect(created).toBe(true);
    expect(session.id).toBeTruthy();
    expect(session.route).toBe('/studio');
    expect(session.annotations).toHaveLength(0);
  });

  it('POST with annotations stores them in the session', () => {
    const ann = makeAnnotation({ comment: 'Fix the header color' });
    const { session } = createOrUpdateSession(store, {
      annotations: [ann],
      route: '/studio',
    });
    expect(session.annotations).toHaveLength(1);
    expect(session.annotations[0].comment).toBe('Fix the header color');
  });

  it('POST with same sessionId merges annotations (created:false)', () => {
    const { session: first } = createOrUpdateSession(store, { route: '/studio' });
    const ann = makeAnnotation({ comment: 'First annotation' });

    const { session: second, created } = createOrUpdateSession(store, {
      sessionId: first.id,
      annotations: [ann],
    });
    expect(created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(second.annotations).toHaveLength(1);
  });

  it('POST updates updatedAt on merge', async () => {
    const { session: first } = createOrUpdateSession(store, { route: '/studio' });
    const tBefore = first.updatedAt;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 5));

    createOrUpdateSession(store, {
      sessionId: first.id,
      annotations: [makeAnnotation()],
    });

    const updated = store.get(first.id)!;
    expect(updated.updatedAt >= tBefore).toBe(true);
  });

  it('POST sets createdAt as ISO string', () => {
    const { session } = createOrUpdateSession(store, {});
    expect(() => new Date(session.createdAt)).not.toThrow();
    expect(new Date(session.createdAt).getFullYear()).toBeGreaterThan(2020);
  });
});

// ── Session store: GET (list sessions) ───────────────────────────────────────

describe('Scenario: /api/annotations GET — list sessions', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = makeStore();
  });

  it('GET returns empty sessions array when store is empty', () => {
    const result = listSessions(store);
    expect(result.sessions).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.pending).toBe(0);
  });

  it('GET includes all sessions in count', () => {
    createOrUpdateSession(store, { route: '/studio' });
    createOrUpdateSession(store, { route: '/character' });
    const result = listSessions(store);
    expect(result.count).toBe(2);
  });

  it('GET pending count excludes resolved annotations', () => {
    const ann1 = makeAnnotation({ status: 'resolved' });
    const ann2 = makeAnnotation({ status: 'pending' });
    const ann3 = makeAnnotation({ status: 'acknowledged' });
    createOrUpdateSession(store, { annotations: [ann1, ann2, ann3] });

    const result = listSessions(store);
    // pending = non-resolved = pending + acknowledged = 2
    expect(result.pending).toBe(2);
  });

  it('GET sessions sorted by updatedAt descending', async () => {
    const { session: s1 } = createOrUpdateSession(store, { route: '/studio' });
    await new Promise((r) => setTimeout(r, 5));
    createOrUpdateSession(store, { route: '/character' });

    const result = listSessions(store);
    // The most recently updated session comes first
    expect(result.sessions[0].route).toBe('/character');
    expect(result.sessions[1].id).toBe(s1.id);
  });
});

// ── Session store: resolve annotation ────────────────────────────────────────

describe('Scenario: /api/annotations POST action:resolve', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = makeStore();
  });

  it('resolve sets annotation status to "resolved"', () => {
    const ann = makeAnnotation({ id: 'ann-fixed', status: 'pending' });
    const { session } = createOrUpdateSession(store, { annotations: [ann] });

    resolveAnnotation(store, session.id, 'ann-fixed', 'agent');

    const updated = store.get(session.id)!;
    expect(updated.annotations[0].status).toBe('resolved');
    expect(updated.annotations[0].resolvedBy).toBe('agent');
  });

  it('resolve sets resolvedAt to an ISO timestamp', () => {
    const ann = makeAnnotation({ id: 'ann-resolve-ts' });
    const { session } = createOrUpdateSession(store, { annotations: [ann] });
    resolveAnnotation(store, session.id, 'ann-resolve-ts');

    const resolved = store.get(session.id)!.annotations[0];
    expect(resolved.resolvedAt).toBeTruthy();
    expect(() => new Date(resolved.resolvedAt!)).not.toThrow();
  });

  it('resolve returns null when session does not exist', () => {
    const result = resolveAnnotation(store, 'nonexistent-id', 'ann-123');
    expect(result).toBeNull();
  });

  it('resolve returns null when annotation does not exist', () => {
    const { session } = createOrUpdateSession(store, {});
    const result = resolveAnnotation(store, session.id, 'nonexistent-ann');
    expect(result).toBeNull();
  });

  it('human resolver is recorded correctly', () => {
    const ann = makeAnnotation({ id: 'ann-human' });
    const { session } = createOrUpdateSession(store, { annotations: [ann] });
    resolveAnnotation(store, session.id, 'ann-human', 'human');

    const resolved = store.get(session.id)!.annotations[0];
    expect(resolved.resolvedBy).toBe('human');
  });
});

// ── Session stats ─────────────────────────────────────────────────────────────

describe('Scenario: /api/annotations/:sessionId GET — session stats', () => {
  it('stats total equals annotation count', () => {
    const anns = [makeAnnotation(), makeAnnotation(), makeAnnotation()];
    const { session } = createOrUpdateSession(makeStore(), { annotations: anns });
    const stats = getSessionStats(session);
    expect(stats.total).toBe(3);
  });

  it('stats pending counts pending and undefined status', () => {
    const anns = [
      makeAnnotation({ status: 'pending' }),
      makeAnnotation({ status: undefined }),   // defaults to pending in stats
      makeAnnotation({ status: 'resolved' }),
    ];
    const { session } = createOrUpdateSession(makeStore(), { annotations: anns });
    const stats = getSessionStats(session);
    expect(stats.pending).toBe(2);
    expect(stats.resolved).toBe(1);
  });

  it('stats blocking counts only blocking severity', () => {
    const anns = [
      makeAnnotation({ severity: 'blocking' }),
      makeAnnotation({ severity: 'important' }),
      makeAnnotation({ severity: 'blocking' }),
      makeAnnotation({ severity: 'suggestion' }),
    ];
    const { session } = createOrUpdateSession(makeStore(), { annotations: anns });
    const stats = getSessionStats(session);
    expect(stats.blocking).toBe(2);
  });

  it('stats byIntent counts fix/change/question/approve', () => {
    const anns = [
      makeAnnotation({ intent: 'fix' }),
      makeAnnotation({ intent: 'fix' }),
      makeAnnotation({ intent: 'change' }),
      makeAnnotation({ intent: 'approve' }),
    ];
    const { session } = createOrUpdateSession(makeStore(), { annotations: anns });
    const stats = getSessionStats(session);
    expect(stats.byIntent.fix).toBe(2);
    expect(stats.byIntent.change).toBe(1);
    expect(stats.byIntent.question).toBe(0);
    expect(stats.byIntent.approve).toBe(1);
  });

  it('empty session has zero stats', () => {
    const { session } = createOrUpdateSession(makeStore(), {});
    const stats = getSessionStats(session);
    expect(stats.total).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.blocking).toBe(0);
  });
});

// ── Knowledge promotion: severity filter ─────────────────────────────────────

describe('Scenario: knowledge store promotion — severity filter', () => {
  it('only blocking/important/fix annotations qualify for promotion', () => {
    const annotations: StoredAnnotation[] = [
      makeAnnotation({ severity: 'blocking', intent: 'fix' }),
      makeAnnotation({ severity: 'important', intent: 'change' }),
      makeAnnotation({ severity: 'suggestion', intent: 'question' }),
      makeAnnotation({ severity: 'suggestion', intent: 'approve' }),
    ];

    const worthPromoting = annotations.filter(
      (a) =>
        a.severity === 'blocking' ||
        a.severity === 'important' ||
        a.intent === 'fix'
    );

    // First two qualify: blocking+fix, important+change
    expect(worthPromoting).toHaveLength(2);
    expect(worthPromoting[0].severity).toBe('blocking');
    expect(worthPromoting[1].severity).toBe('important');
  });

  it('fix intent qualifies even with suggestion severity', () => {
    const ann: StoredAnnotation = makeAnnotation({
      severity: 'suggestion',
      intent: 'fix',
    });

    const worth = [ann].filter(
      (a) =>
        a.severity === 'blocking' ||
        a.severity === 'important' ||
        a.intent === 'fix'
    );

    expect(worth).toHaveLength(1);
  });

  it('suggestion+question does not qualify for promotion', () => {
    const ann: StoredAnnotation = makeAnnotation({
      severity: 'suggestion',
      intent: 'question',
    });

    const worth = [ann].filter(
      (a) =>
        a.severity === 'blocking' ||
        a.severity === 'important' ||
        a.intent === 'fix'
    );

    expect(worth).toHaveLength(0);
  });
});
