import { describe, it, expect } from 'vitest';
import { SkillRouter } from '../skill-router';
import type { AgentConfig, TaskDef } from '../types';

function makeAgent(overrides: Partial<AgentConfig> & { name: string }): AgentConfig {
  return {
    role: 'coder',
    model: { provider: 'anthropic', model: 'claude-sonnet-4' },
    capabilities: ['code-generation'],
    claimFilter: { roles: ['coder'], maxPriority: 8 },
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskDef> = {}): TaskDef {
  return {
    id: 'task-1',
    title: 'Fix the parser bug',
    description: 'The parser fails on nested objects',
    status: 'open',
    priority: 3,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('SkillRouter', () => {
  const router = new SkillRouter();

  const coder = makeAgent({
    name: 'Coder',
    capabilities: ['code-generation', 'parser', 'typescript'],
    claimFilter: { roles: ['coder'], maxPriority: 8 },
  });

  const reviewer = makeAgent({
    name: 'Reviewer',
    role: 'reviewer',
    capabilities: ['code-review', 'security-audit'],
    claimFilter: { roles: ['reviewer', 'tester'], maxPriority: 5 },
  });

  const researcher = makeAgent({
    name: 'Researcher',
    role: 'researcher',
    capabilities: ['research', 'documentation'],
    claimFilter: { roles: ['researcher'], maxPriority: 10 },
  });

  const agents = [coder, reviewer, researcher];

  it('routes to best-fit agent by capability match', () => {
    const task = makeTask({ title: 'Fix the parser bug in typescript' });
    const result = router.route(task, agents);
    expect(result.agent?.name).toBe('Coder');
    expect(result.score).toBeGreaterThan(0);
  });

  it('returns null when no agents available', () => {
    const task = makeTask();
    const result = router.route(task, []);
    expect(result.agent).toBeNull();
    expect(result.reason).toContain('No agents');
  });

  it('filters by priority alignment', () => {
    const task = makeTask({ priority: 7 });
    // Reviewer has maxPriority 5, so should be filtered out
    const result = router.route(task, agents);
    expect(result.candidates.find(c => c.agent.name === 'Reviewer')).toBeUndefined();
  });

  it('scores role match bonus', () => {
    const task = makeTask({
      title: 'Review the authentication module',
      role: 'reviewer',
    });
    const result = router.route(task, agents);
    const reviewerCandidate = result.candidates.find(c => c.agent.name === 'Reviewer');
    expect(reviewerCandidate?.roleMatch).toBe(true);
  });

  it('respects required capabilities filter', () => {
    const task = makeTask({ title: 'Security audit of payment flow' });
    const result = router.route(task, agents, {
      requiredCapabilities: ['security-audit'],
    });
    // Only reviewer has security-audit
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].agent.name).toBe('Reviewer');
  });

  it('applies minimum score threshold', () => {
    const task = makeTask({ title: 'Something completely unrelated' });
    const result = router.route(task, agents, { minScore: 100 });
    expect(result.agent).toBeNull();
    expect(result.reason).toContain('below minimum threshold');
  });

  it('routeMultiple returns top N candidates', () => {
    const task = makeTask({ title: 'Fix parser and review typescript code' });
    const result = router.routeMultiple(task, agents, 2);
    expect(result.candidates.length).toBeLessThanOrEqual(2);
  });

  it('sorts candidates by score descending', () => {
    const task = makeTask({ title: 'Fix the parser bug in typescript' });
    const result = router.route(task, agents);
    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i - 1].score).toBeGreaterThanOrEqual(result.candidates[i].score);
    }
  });

  it('tracks matched capabilities in result', () => {
    const task = makeTask({ title: 'Fix the parser bug in typescript' });
    const result = router.route(task, agents);
    const coderCandidate = result.candidates.find(c => c.agent.name === 'Coder');
    expect(coderCandidate?.matchedCapabilities).toContain('parser');
    expect(coderCandidate?.matchedCapabilities).toContain('typescript');
  });
});
