import { describe, expect, it } from 'vitest';
import {
  createTaskExecutionAttributeClaims,
  validateAgentAttributeClaims,
} from '../care-claims';

describe('holoscript-agent care claims', () => {
  it('creates a portable care claim for task execution audit events', () => {
    const claims = createTaskExecutionAttributeClaims({
      agentHandle: 'jetson-agent',
      taskId: 'task_1',
      taskTitle: 'deploy bovine landing',
      costUsd: 0,
      durationMs: 1234,
      totalTokens: 42,
      commitHash: 'abc123',
    });

    expect(validateAgentAttributeClaims(claims)).toEqual({ valid: true, errors: [] });
    expect(claims[0]).toMatchObject({
      attribute: 'care',
      persistence: 'single_event',
      costOrPriority: 'costUsd=0.000000; durationMs=1234; totalTokens=42',
    });
    expect(claims[0].evidenceRefs).toContain('commit:abc123');
  });
});
