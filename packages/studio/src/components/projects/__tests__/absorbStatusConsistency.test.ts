/**
 * A failed absorb (e.g. the 502 "absorb service did not answer") records the
 * workspace row as status 'failed' and the job as 'failed'. The Workbench
 * pills must say "failed" too, not "stale".
 */
import { describe, expect, it } from 'vitest';
import { isWorkspaceAbsorbStale, workspaceAbsorbStatus, type ProjectWorkspaceOverview } from '../workspaceOverview';
import { workspaceReadiness } from '../workbenchHonesty';

function ws(over: Partial<ProjectWorkspaceOverview>): ProjectWorkspaceOverview {
  return {
    id: 'ws-1',
    name: 'repo',
    localPath: '/ws/ws-1/repo',
    branch: 'main',
    status: 'ready',
    fileCount: 121,
    metadata: {},
    lastAbsorbedAt: null,
    absorbJobs: [],
    ...over,
  };
}

describe('absorb status is consistent after a failed absorb', () => {
  it('a workspace row marked failed reads as failed, not stale', () => {
    expect(workspaceAbsorbStatus(ws({ status: 'failed' }))).toBe('failed');
  });

  it('a latest failed absorb job reads as failed, not stale', () => {
    const w = ws({
      absorbJobs: [
        { id: 'j1', status: 'failed', depth: 'medium', updatedAt: new Date().toISOString(), error: '502' },
      ],
    });
    expect(workspaceAbsorbStatus(w)).toBe('failed');
    expect(isWorkspaceAbsorbStale(w)).toBe(true); // still offered for re-scan
    const r = workspaceReadiness(w, [], null);
    expect(r.blockers.map((b) => b.code)).toContain('absorb_failed');
    expect(r.blockers.map((b) => b.code)).not.toContain('absorb_stale');
    expect(r.tone).toBe('blocked');
  });

  it('a later successful absorb clears an older failure', () => {
    const now = Date.now();
    const w = ws({
      lastAbsorbedAt: new Date(now - 1000).toISOString(),
      absorbJobs: [
        { id: 'j2', status: 'complete', depth: 'medium', updatedAt: new Date(now - 1000).toISOString() },
        { id: 'j1', status: 'failed', depth: 'medium', updatedAt: new Date(now - 60_000).toISOString() },
      ],
    });
    expect(workspaceAbsorbStatus(w, now)).toBe('fresh');
  });
});
