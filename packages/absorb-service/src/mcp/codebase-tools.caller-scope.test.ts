/**
 * Remote (/mcp) callers of the structural codebase tools never see the operator's shared
 * graph (Mapping 07:58 H1), and only a job's owner or the service key may cancel it (H2).
 * ctx undefined = trusted local / bare service key; ctx present = a remote caller.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  handleCodebaseTool,
  registerAbsorbJobForTests,
  resetCodebaseToolStateForTests,
} from './codebase-tools';

const OWNER = { ownerId: 'gh-user-1', serverKeysAllowed: false };
const OTHER = { ownerId: 'gh-user-2', serverKeysAllowed: false };
const NO_OWNER = { ownerId: null, serverKeysAllowed: true };

describe('codebase tools: caller scope', () => {
  beforeEach(() => resetCodebaseToolStateForTests(false));

  it.each([
    'holo_query_codebase',
    'holo_impact_analysis',
    'holo_resolve_symbol',
    'holo_graph_status',
  ])('%s for a remote caller is caller-scoped: no shared/operator graph, refused', async (name) => {
    for (const ctx of [OWNER, NO_OWNER]) {
      const out = (await handleCodebaseTool(name, { query: 'x', symbol: 'x' }, ctx)) as Record<
        string,
        unknown
      >;
      expect(out).toMatchObject({ callerScoped: true, status: 403 });
    }
  });

  it('holo_get_absorb_status: only the job owner sees it; others and ownerless callers get 403', async () => {
    registerAbsorbJobForTests('absorb-owned-1', 'gh-user-1');
    const mine = (await handleCodebaseTool(
      'holo_get_absorb_status',
      { jobId: 'absorb-owned-1' },
      OWNER
    )) as any;
    expect(mine.status).not.toBe(403);
    expect(mine.jobId).toBe('absorb-owned-1');
    for (const ctx of [OTHER, NO_OWNER]) {
      const out = (await handleCodebaseTool(
        'holo_get_absorb_status',
        { jobId: 'absorb-owned-1' },
        ctx
      )) as any;
      expect(out).toMatchObject({ status: 403, callerScoped: true });
    }
  });

  it('H2 holo_cancel_absorb: a non-owner gets 403 and the job keeps running', async () => {
    registerAbsorbJobForTests('absorb-owned-2', 'gh-user-1');
    for (const ctx of [OTHER, NO_OWNER]) {
      const out = (await handleCodebaseTool(
        'holo_cancel_absorb',
        { jobId: 'absorb-owned-2' },
        ctx
      )) as any;
      expect(out).toMatchObject({ status: 403 });
      expect(out.accepted).toBeUndefined();
    }
    const st = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: 'absorb-owned-2',
    })) as any;
    expect(st.status).toBe('scanning');
  });

  it('H2 holo_cancel_absorb: an operator job (no owner) cannot be cancelled by a remote caller', async () => {
    registerAbsorbJobForTests('absorb-operator-1', null);
    const out = (await handleCodebaseTool(
      'holo_cancel_absorb',
      { jobId: 'absorb-operator-1' },
      OWNER
    )) as any;
    expect(out).toMatchObject({ status: 403 });
  });

  it('H2 holo_cancel_absorb: the owner and the service key (no ctx) may cancel', async () => {
    registerAbsorbJobForTests('absorb-owned-3', 'gh-user-1');
    const a = (await handleCodebaseTool(
      'holo_cancel_absorb',
      { jobId: 'absorb-owned-3' },
      OWNER
    )) as any;
    expect(a.accepted).toBe(true);
    registerAbsorbJobForTests('absorb-owned-4', 'gh-user-1');
    const b = (await handleCodebaseTool('holo_cancel_absorb', { jobId: 'absorb-owned-4' })) as any;
    expect(b.accepted).toBe(true);
  });
});
