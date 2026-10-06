import { describe, expect, it } from 'vitest';
import type { DaemonJob } from '@/lib/daemon/types';
import {
  describeJobOutcome,
  directShipWarning,
  startMissionCtaLabel,
  workspaceReadiness,
} from '../workbenchHonesty';
import type { ProjectWorkspaceOverview } from '../workspaceOverview';

function workspace(patch: Partial<ProjectWorkspaceOverview> = {}): ProjectWorkspaceOverview {
  return {
    id: 'ws-1',
    name: 'The-Mending-Box',
    localPath: '/data/workspaces/ws-1/The-Mending-Box',
    branch: 'main',
    status: 'ready',
    fileCount: 12,
    metadata: {},
    lastAbsorbedAt: new Date().toISOString(),
    ...patch,
  };
}

function job(patch: Partial<DaemonJob> = {}): DaemonJob {
  return {
    id: 'dj_test',
    projectId: 'ws-1',
    profile: 'balanced',
    projectDna: {
      kind: 'unknown',
      confidence: 0.65,
      detectedStack: ['imported repo'],
      recommendedProfile: 'balanced',
      notes: [],
      daemonAgent: {
        missionProfile: 'holoheal',
        agentName: 'HoloHeal',
        skills: ['heal'],
        authorityRefs: [],
        schedules: [],
        rawSecretAccess: false,
      },
    },
    status: 'completed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: 100,
    statusMessage: 'Complete',
    summary: 'lipstick success',
    patches: [],
    metrics: {
      qualityDelta: 0,
      qualityBefore: 50,
      qualityAfter: 50,
      filesChanged: 0,
      filesAnalyzed: 0,
      cycles: 1,
      durationMs: 10,
    },
    absorb: {
      leafFirstOrder: [],
      inDegree: {},
      communities: {},
      totalFiles: 0,
      totalSymbols: 0,
      durationMs: 1,
      graphJson: '{}',
      hubFiles: [],
    },
    ...patch,
  };
}

describe('workbenchHonesty', () => {
  it('never shows Ready alongside Absorb stale / Build unknown', () => {
    const stale = workspace({ lastAbsorbedAt: null, metadata: {} });
    const readiness = workspaceReadiness(stale, [], { status: 'clean', branch: 'main', changedFiles: 0, checkedAt: new Date().toISOString() });
    expect(readiness.ready).toBe(false);
    expect(readiness.label).not.toBe('Ready');
    expect(readiness.label.toLowerCase()).toMatch(/absorb stale|not ready|build/);
    expect(readiness.blockers.some((b) => b.code === 'absorb_stale' || b.code === 'build_unknown')).toBe(
      true
    );
  });

  it('collapses Build:unknown into blockers instead of Ready', () => {
    const fresh = workspace({
      lastAbsorbedAt: new Date().toISOString(),
      metadata: {},
    });
    const readiness = workspaceReadiness(fresh, [], {
      status: 'clean',
      branch: 'main',
      changedFiles: 0,
      checkedAt: new Date().toISOString(),
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.label).toBe('Build: unknown');
  });

  it('labels primary CTA Start HoloHeal', () => {
    expect(startMissionCtaLabel('holoheal', 'HoloHeal', 1)).toBe('Start HoloHeal');
    expect(startMissionCtaLabel('builder', 'Builder', 3)).toBe('Start 3 × Builder');
  });

  it('zero-delta completed job says Finished, nothing to change', () => {
    const outcome = describeJobOutcome(
      job({
        absorb: {
          leafFirstOrder: ['a.ts'],
          inDegree: { 'a.ts': 0 },
          communities: {},
          totalFiles: 1,
          totalSymbols: 1,
          durationMs: 1,
          graphJson: '{}',
          hubFiles: [],
        },
        metrics: {
          qualityDelta: 0,
          qualityBefore: 50,
          qualityAfter: 50,
          filesChanged: 0,
          filesAnalyzed: 4,
          cycles: 1,
          durationMs: 10,
        },
      })
    );
    expect(outcome.headline).toBe('Finished, nothing to change');
    expect(outcome.tone).toBe('neutral');
    expect(outcome.showProgressPercent).toBe(false);
  });

  it('empty absorb completed job is Blocked, not heal success', () => {
    const outcome = describeJobOutcome(job());
    expect(outcome.headline).toMatch(/Blocked/i);
    expect(outcome.tone).toBe('blocked');
    expect(outcome.honesty ?? '').toMatch(/empty/i);
  });

  it('0 files examined is not heal success', () => {
    const outcome = describeJobOutcome(
      job({
        absorb: {
          leafFirstOrder: ['a.ts'],
          inDegree: {},
          communities: {},
          totalFiles: 3,
          totalSymbols: 0,
          durationMs: 1,
          graphJson: '{}',
          hubFiles: [],
        },
        metrics: {
          qualityDelta: 0,
          qualityBefore: 0,
          qualityAfter: 0,
          filesChanged: 0,
          filesAnalyzed: 0,
          cycles: 1,
          durationMs: 10,
        },
      })
    );
    expect(outcome.headline).toMatch(/nothing examined/i);
    expect(outcome.tone).toBe('degraded');
  });

  it('direct-ship warning explains meaning and next step', () => {
    expect(directShipWarning(true)).toMatch(/without a PR/i);
    expect(directShipWarning(false)).toMatch(/Settings/i);
  });
});
