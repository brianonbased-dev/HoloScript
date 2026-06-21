import { describe, expect, it } from 'vitest';
import type { DaemonJob } from '@/lib/daemon/types';
import {
  buildProjectDna,
  workspaceAbsorbStatus,
  workspaceAgentStatus,
  workspaceBuildStatus,
  type DaemonMissionLike,
  type ProjectWorkspaceOverview,
} from '../workspaceOverview';

function workspace(patch: Partial<ProjectWorkspaceOverview> = {}): ProjectWorkspaceOverview {
  return {
    id: 'workspace-1',
    name: 'Workspace One',
    localPath: '/home/user/.holoscript/workspaces/workspace-1/repo',
    branch: 'main',
    status: 'ready',
    fileCount: 42,
    metadata: {},
    lastAbsorbedAt: null,
    absorbJobs: [],
    ...patch,
  };
}

function job(patch: Partial<DaemonJob>): DaemonJob {
  return {
    id: 'job-1',
    projectId: 'workspace-1',
    profile: 'balanced',
    projectDna: {
      kind: 'unknown',
      confidence: 0.5,
      detectedStack: [],
      recommendedProfile: 'balanced',
      notes: [],
    },
    status: 'queued',
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    progress: 0,
    ...patch,
  };
}

describe('workspaceOverview', () => {
  it('reports stale, fresh, and active absorb states', () => {
    const now = Date.parse('2026-06-21T12:00:00.000Z');

    expect(workspaceAbsorbStatus(workspace(), now)).toBe('stale');
    expect(
      workspaceAbsorbStatus(workspace({ lastAbsorbedAt: '2026-06-21T00:30:00.000Z' }), now)
    ).toBe('fresh');
    expect(
      workspaceAbsorbStatus(workspace({ lastAbsorbedAt: '2026-06-19T00:30:00.000Z' }), now)
    ).toBe('stale');
    expect(
      workspaceAbsorbStatus(
        workspace({
          absorbJobs: [
            {
              id: 'absorb-1',
              status: 'running',
              depth: 'medium',
              updatedAt: '2026-06-21T11:00:00.000Z',
            },
          ],
        }),
        now
      )
    ).toBe('running');
  });

  it('normalizes build health metadata for the overview grid', () => {
    expect(workspaceBuildStatus(workspace({ metadata: { buildHealth: 'green' } }))).toBe('passing');
    expect(workspaceBuildStatus(workspace({ metadata: { lastBuild: { status: 'red' } } }))).toBe(
      'failing'
    );
    expect(workspaceBuildStatus(workspace({ metadata: {} }))).toBe('unknown');
  });

  it('uses the newest matching daemon job for agent status', () => {
    const target = workspace();
    const jobs = [
      job({
        id: 'older',
        status: 'completed',
        updatedAt: '2026-06-21T08:00:00.000Z',
      }),
      job({
        id: 'newer',
        status: 'running',
        updatedAt: '2026-06-21T09:00:00.000Z',
      }),
    ];

    expect(workspaceAgentStatus(target, jobs)).toBe('running');
  });

  it('builds daemon mission DNA for every selected workspace target', () => {
    const mission: DaemonMissionLike = {
      id: 'builder',
      name: 'Builder',
      description: 'Build the selected workspace.',
      defaultSkills: ['frontend', 'qa'],
      authorityRefs: ['D.081'],
      schedules: ['on-demand'],
    };

    const dna = buildProjectDna(workspace(), 'deep', mission);

    expect(dna.detectedStack).toContain('42 files');
    expect(dna.detectedStack).toContain('daemon:builder');
    expect(dna.recommendedProfile).toBe('deep');
    expect(dna.daemonAgent?.missionProfile).toBe('builder');
    expect(dna.daemonAgent?.skills).toEqual(['frontend', 'qa']);
  });
});
