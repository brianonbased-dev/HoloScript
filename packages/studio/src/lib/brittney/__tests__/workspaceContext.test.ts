import { describe, expect, it } from 'vitest';
import { buildWorkspaceAssistantContext } from '../workspaceContext';

describe('buildWorkspaceAssistantContext', () => {
  it('binds imported repo context to the active workspace identity', () => {
    const context = buildWorkspaceAssistantContext({
      sceneContext: 'Scene is empty.',
      historyScope: 'workspace:ws_octocat_demo-app',
      routeScope: '/create',
      teamId: 'team-42',
      workspace: {
        id: 'ws_octocat_demo-app',
        name: 'demo-app',
        repoUrl: 'https://github.com/octocat/demo-app.git',
        branch: 'main',
        localPath: 'C:/Users/josep/.holoscript/workspaces/ws_octocat_demo-app',
        status: 'ready',
        absorbedAt: '2026-05-11T05:00:00.000Z',
        stats: { totalFiles: 42, totalSymbols: 900, totalLoc: 12000 },
        dna: {
          kind: 'frontend',
          confidence: 0.91,
          languages: ['TypeScript'],
          frameworks: ['Next.js', 'React'],
          packageManagers: ['pnpm'],
          repoShape: 'single-package',
          recommendedMode: 'balanced',
          riskSignals: ['missing tests'],
          strengths: ['typed routes'],
        },
      },
      git: {
        branch: 'main',
        upstream: 'origin/main',
        ahead: 1,
        behind: 0,
        clean: false,
        files: [{ path: 'src/app/page.tsx', status: 'M' }],
        recentCommits: [{ sha: 'abc123def4567890', message: 'fix workspace import' }],
      },
      board: {
        mode: 'audit',
        objective: 'Fix workspace bugs',
        board: {
          claimed: [
            {
              id: 'task-1',
              title: 'Scope Brittney and agent context',
              priority: 2,
              claimedByName: 'codex-hardware',
            },
          ],
        },
      },
      daemonJobs: [
        {
          id: 'dj-1',
          projectId: 'ws_octocat_demo-app',
          status: 'running',
          progress: 35,
          statusMessage: 'Analyzing repository graph',
          profile: 'balanced',
          metrics: { filesAnalyzed: 12, filesChanged: 0, qualityDelta: 0, cycles: 1 },
          absorb: { totalFiles: 42, totalSymbols: 900 },
        },
      ],
      agentRuntime: {
        isRunning: true,
        currentPhase: 'execute',
        currentAction: 'Generating workspace patch',
        cycleCount: 3,
      },
      toolCalls: [
        {
          toolName: 'holo_query_codebase',
          server: 'holoscript',
          status: 'success',
          duration: 120,
          triggeredBy: 'Brittney',
        },
      ],
    });

    expect(context).toContain('Assistant history scope: workspace:ws_octocat_demo-app');
    expect(context).toContain('Repository: https://github.com/octocat/demo-app.git');
    expect(context).toContain('Absorb graph: 42 files, 900 symbols, 12000 LOC');
    expect(context).toContain('Branch: main; upstream=origin/main; dirty; ahead=1; behind=0');
    expect(context).toContain('[P2 claimed] Scope Brittney and agent context (task-1)');
    expect(context).toContain('dj-1: running 35%; mission=balanced');
    expect(context).toContain('holo_query_codebase on holoscript: success 120ms');
    expect(context).toContain('--- Scene Context ---');
  });

  it('keeps project scoped sessions explicit when no workspace is active', () => {
    const context = buildWorkspaceAssistantContext({
      sceneContext: 'No object is currently selected.',
      historyScope: 'project:create:scene-1',
      routeScope: '/create',
      workspace: null,
    });

    expect(context).toContain('Assistant history scope: project:create:scene-1');
    expect(context).toContain('No active workspace');
    expect(context).toContain('No object is currently selected.');
  });
});
