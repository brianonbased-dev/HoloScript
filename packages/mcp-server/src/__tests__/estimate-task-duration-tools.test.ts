import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  estimateTaskDurationTools,
  handleEstimateTaskDurationTool,
  type EstimateTaskDurationResult,
} from '../tools/estimate_task_duration';
import { handleTool } from '../handlers';
import { tools } from '../tools';

interface FixtureArtifact {
  generatedAt: string;
  windowSinceLabel: string;
  windowSinceGit: string;
  totals: {
    bindingCoveragePct: number;
    boundCommits: number;
    boundTasks: number;
  };
  taxonomy: Array<{ taskType: string; n: number }>;
  taskTypeStats: Record<
    string,
    {
      taskType: string;
      commitCount: number;
      boundToTaskPct: number;
      distinctAuthors: number;
      repos: Record<string, number>;
      interCommitGapSecs: {
        n: number;
        min: number;
        p50: number;
        p90: number;
        p99: number;
        max: number;
        mean: number;
      } | null;
    }
  >;
  taskDurations: Record<
    string,
    {
      taskCount: number;
      durationSecs: {
        n: number;
        min: number;
        p50: number;
        p90: number;
        p99: number;
        max: number;
        mean: number;
      };
    }
  >;
  caveats: string[];
}

describe('holo_estimate_task_duration', () => {
  let tempDir: string;
  let artifactPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'estimate-duration-'));
    artifactPath = join(tempDir, 'agent-time-last30d-to-20260504.json');
    await writeFile(artifactPath, JSON.stringify(makeArtifact(), null, 2), 'utf-8');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('registers the tool definition in the public tool list', () => {
    expect(estimateTaskDurationTools[0].name).toBe('holo_estimate_task_duration');
    expect(tools.some((tool) => tool.name === 'holo_estimate_task_duration')).toBe(true);
  });

  it('uses bound multi-commit task durations before proxy gaps', async () => {
    const result = (await handleEstimateTaskDurationTool('holo_estimate_task_duration', {
      taskType: 'fix_core',
      percentile: 'p90',
      dataPath: artifactPath,
    })) as EstimateTaskDurationResult;

    expect(result.success).toBe(true);
    expect(result.matchedTaskType).toBe('fix-core');
    expect(result.basis).toBe('multi_commit_task_duration');
    expect(result.estimateSecs).toBe(2400);
    expect(result.estimateMinutes).toBe(40);
    expect(result.sampleSize).toBe(2);
  });

  it('falls back to inter-commit gap proxy when task durations are absent', async () => {
    const result = (await handleEstimateTaskDurationTool('holo_estimate_task_duration', {
      taskType: 'feat-mcp',
      dataPath: artifactPath,
    })) as EstimateTaskDurationResult;

    expect(result.success).toBe(true);
    expect(result.matchedTaskType).toBe('feat-mcp');
    expect(result.basis).toBe('inter_commit_gap_proxy');
    expect(result.confidence).toBe('low');
    expect(result.estimateSecs).toBe(300);
    expect(result.caveats).toContain('fixture caveat');
  });

  it('can infer the task type from a conventional commit style task title', async () => {
    const result = (await handleEstimateTaskDurationTool('holo_estimate_task_duration', {
      taskTitle: 'feat(mcp): expose duration estimates',
      percentile: 'mean',
      dataPath: artifactPath,
    })) as EstimateTaskDurationResult;

    expect(result.success).toBe(true);
    expect(result.inferredTaskType).toBe('feat-mcp');
    expect(result.matchedTaskType).toBe('feat-mcp');
    expect(result.estimateSecs).toBe(500);
  });

  it('returns alternatives when the requested task type is missing', async () => {
    const result = (await handleEstimateTaskDurationTool('holo_estimate_task_duration', {
      taskType: 'unknown-scope',
      dataPath: artifactPath,
      maxAlternatives: 2,
    })) as EstimateTaskDurationResult;

    expect(result.success).toBe(false);
    expect(result.status).toBe('not_found');
    expect(result.alternatives.map((alt) => alt.taskType)).toEqual(['feat-mcp', 'fix-core']);
  });

  it('is dispatched by handleTool before the generic holo_ graph route', async () => {
    const result = (await handleTool('holo_estimate_task_duration', {
      taskType: 'feat-mcp',
      dataPath: artifactPath,
    })) as EstimateTaskDurationResult;

    expect(result.success).toBe(true);
    expect(result.matchedTaskType).toBe('feat-mcp');
  });

  it('returns a catalog when no task type is supplied', async () => {
    const result = (await handleEstimateTaskDurationTool('holo_estimate_task_duration', {
      dataPath: artifactPath,
      includeCaveats: false,
    })) as EstimateTaskDurationResult;

    expect(result.success).toBe(true);
    expect(result.status).toBe('catalog');
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.caveats).toEqual([]);
  });
});

function makeArtifact(): FixtureArtifact {
  return {
    generatedAt: '2026-05-04T00:00:00.000Z',
    windowSinceLabel: 'last-30-days',
    windowSinceGit: '30 days ago',
    totals: {
      bindingCoveragePct: 10,
      boundCommits: 2,
      boundTasks: 1,
    },
    taxonomy: [
      { taskType: 'feat-mcp', n: 8 },
      { taskType: 'fix-core', n: 5 },
      { taskType: 'docs-paper', n: 3 },
    ],
    taskTypeStats: {
      'feat-mcp': {
        taskType: 'feat-mcp',
        commitCount: 8,
        boundToTaskPct: 0,
        distinctAuthors: 1,
        repos: { HoloScript: 8 },
        interCommitGapSecs: {
          n: 3,
          min: 60,
          p50: 300,
          p90: 900,
          p99: 1200,
          max: 1200,
          mean: 500,
        },
      },
      'fix-core': {
        taskType: 'fix-core',
        commitCount: 5,
        boundToTaskPct: 40,
        distinctAuthors: 1,
        repos: { HoloScript: 5 },
        interCommitGapSecs: {
          n: 4,
          min: 120,
          p50: 600,
          p90: 1800,
          p99: 1800,
          max: 1800,
          mean: 780,
        },
      },
      'docs-paper': {
        taskType: 'docs-paper',
        commitCount: 3,
        boundToTaskPct: 0,
        distinctAuthors: 1,
        repos: { 'ai-ecosystem': 3 },
        interCommitGapSecs: null,
      },
    },
    taskDurations: {
      'fix-core': {
        taskCount: 2,
        durationSecs: {
          n: 2,
          min: 600,
          p50: 1200,
          p90: 2400,
          p99: 2400,
          max: 2400,
          mean: 1800,
        },
      },
    },
    caveats: ['fixture caveat'],
  };
}
