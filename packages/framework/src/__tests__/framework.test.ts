import { describe, it, expect } from 'vitest';
import { defineAgent, defineTeam, KnowledgeStore } from '../index';
import { Sequence, Selector, Action, Condition, BehaviorTree } from '../behavior';
import type { AgentConfig } from '../types';
// ── defineAgent ──

describe('defineAgent', () => {
  const validAgent: AgentConfig = {
    name: 'TestCoder',
    role: 'coder',
    model: { provider: 'anthropic', model: 'claude-sonnet-4' },
    capabilities: ['code-generation'],
    claimFilter: { roles: ['coder'], maxPriority: 8 },
  };

  it('returns a valid agent config', () => {
    const agent = defineAgent(validAgent);
    expect(agent.name).toBe('TestCoder');
    expect(agent.role).toBe('coder');
    expect(agent.knowledgeDomains).toEqual(['general']); // default
  });

  it('throws on empty name', () => {
    expect(() => defineAgent({ ...validAgent, name: '' })).toThrow('name is required');
  });

  it('throws on invalid role', () => {
    expect(() => defineAgent({ ...validAgent, role: 'wizard' as unknown as AgentConfig['role'] })).toThrow('Invalid role');
  });

  it('throws on missing model', () => {
    expect(() => defineAgent({ ...validAgent, model: { provider: 'anthropic', model: '' } })).toThrow('model');
  });

  it('throws on empty capabilities', () => {
    expect(() => defineAgent({ ...validAgent, capabilities: [] })).toThrow('capability');
  });
});

// ── defineTeam ──

describe('defineTeam', () => {
  const coder = defineAgent({
    name: 'Coder',
    role: 'coder',
    model: { provider: 'anthropic', model: 'claude-sonnet-4' },
    capabilities: ['code-generation'],
    claimFilter: { roles: ['coder'], maxPriority: 8 },
  });

  const reviewer = defineAgent({
    name: 'Reviewer',
    role: 'reviewer',
    model: { provider: 'openai', model: 'gpt-4o' },
    capabilities: ['code-review'],
    claimFilter: { roles: ['reviewer'], maxPriority: 5 },
  });

  it('creates a team with agents', () => {
    const team = defineTeam({
      name: 'test-team',
      agents: [coder, reviewer],
    });
    expect(team.name).toBe('test-team');
    expect(team.openTasks).toHaveLength(0);
  });

  it('throws on empty name', () => {
    expect(() => defineTeam({ name: '', agents: [coder] })).toThrow('name');
  });

  it('throws on no agents', () => {
    expect(() => defineTeam({ name: 'test', agents: [] })).toThrow('at least one');
  });

  it('throws on duplicate agent names', () => {
    expect(() => defineTeam({ name: 'test', agents: [coder, coder] })).toThrow('Duplicate');
  });

  it('throws when agents exceed max slots', () => {
    expect(() => defineTeam({ name: 'test', agents: [coder, reviewer], maxSlots: 1 })).toThrow('slots');
  });
});

// ── Task Board ──

describe('Team.addTasks', () => {
  it('adds tasks and deduplicates', async () => {
    const team = defineTeam({
      name: 'board-test',
      agents: [defineAgent({
        name: 'A', role: 'coder',
        model: { provider: 'anthropic', model: 'claude-sonnet-4' },
        capabilities: ['c'], claimFilter: { roles: ['coder'], maxPriority: 10 },
      })],
    });

    const added1 = await team.addTasks([
      { title: 'Fix auth bug', description: 'JWT expired', priority: 1 },
      { title: 'Add tests', description: 'Coverage gap', priority: 3 },
    ]);
    expect(added1).toHaveLength(2);
    expect(team.openTasks).toHaveLength(2);

    // Dedup: same title shouldn't add again
    const added2 = await team.addTasks([
      { title: 'Fix auth bug', description: 'duplicate', priority: 1 },
      { title: 'New task', description: 'fresh', priority: 5 },
    ]);
    expect(added2).toHaveLength(1);
    expect(team.openTasks).toHaveLength(3);
  });

  it('sorts open tasks by priority', async () => {
    const team = defineTeam({
      name: 'priority-test',
      agents: [defineAgent({
        name: 'A', role: 'coder',
        model: { provider: 'anthropic', model: 'claude-sonnet-4' },
        capabilities: ['c'], claimFilter: { roles: ['coder'], maxPriority: 10 },
      })],
    });

    await team.addTasks([
      { title: 'Low', description: '', priority: 5 },
      { title: 'Critical', description: '', priority: 1 },
      { title: 'Medium', description: '', priority: 3 },
    ]);

    const tasks = team.openTasks;
    expect(tasks[0].title).toBe('Critical');
    expect(tasks[1].title).toBe('Medium');
    expect(tasks[2].title).toBe('Low');
  });
});

// ── Scout ──

describe('Team.scoutFromTodos', () => {
  it('parses grep output into tasks', async () => {
    const team = defineTeam({
      name: 'scout-test',
      agents: [defineAgent({
        name: 'A', role: 'coder',
        model: { provider: 'anthropic', model: 'claude-sonnet-4' },
        capabilities: ['c'], claimFilter: { roles: ['coder'], maxPriority: 10 },
      })],
    });

    const grepOutput = [
      'src/auth.ts:42: // TODO: add rate limiting',
      'src/db.ts:100: // FIXME: connection pool leak',
      'src/api.ts:200: // HACK: temporary workaround for CORS',
    ].join('\n');

    const tasks = await team.scoutFromTodos(grepOutput);
    expect(tasks).toHaveLength(3);

    // addTasks returns in insertion order; openTasks sorts by priority
    const sorted = team.openTasks;
    expect(sorted[0].title).toContain('FIXME'); // highest priority (2) sorts first
    expect(sorted[0].priority).toBe(2); // FIXME = priority 2
    expect(sorted[1].priority).toBe(3); // TODO = priority 3
    expect(sorted[2].priority).toBe(3); // HACK = priority 3
  });
});

// ── KnowledgeStore ──

describe('KnowledgeStore', () => {
  it('publishes and searches entries', () => {
    const store = new KnowledgeStore({ persist: false });

    store.publish({ type: 'pattern', content: 'Use JWT for stateless auth', domain: 'security', confidence: 0.9, source: 'Coder' }, 'Coder');
    store.publish({ type: 'gotcha', content: 'Never store tokens in localStorage', domain: 'security', confidence: 0.95, source: 'Reviewer' }, 'Reviewer');
    store.publish({ type: 'wisdom', content: 'GraphQL reduces over-fetching', domain: 'api', confidence: 0.7, source: 'Researcher' }, 'Researcher');

    expect(store.size).toBe(3);

    const authResults = store.search('auth token');
    expect(authResults.length).toBeGreaterThan(0);
    expect(authResults[0].domain).toBe('security');

    const apiResults = store.byDomain('api');
    expect(apiResults).toHaveLength(1);
  });

  it('deduplicates identical content', () => {
    const store = new KnowledgeStore({ persist: false });

    const e1 = store.publish({ type: 'wisdom', content: 'Test your code', domain: 'general', confidence: 0.8, source: 'A' }, 'A');
    const e2 = store.publish({ type: 'wisdom', content: 'Test your code', domain: 'general', confidence: 0.8, source: 'B' }, 'B');

    expect(e1.id).toBe(e2.id); // same entry returned
    expect(store.size).toBe(1);
  });

  it('compounds cross-domain insights', () => {
    const store = new KnowledgeStore({ persist: false });

    store.publish({ type: 'pattern', content: 'Rate limiting prevents abuse', domain: 'security', confidence: 0.9, source: 'A' }, 'A');
    store.publish({ type: 'pattern', content: 'Cache invalidation is hard', domain: 'performance', confidence: 0.8, source: 'B' }, 'B');

    const crossRefs = store.compound([
      { type: 'wisdom', content: 'Rate limiting and caching need coordination', domain: 'architecture', confidence: 0.7, source: 'C' },
    ]);

    expect(crossRefs).toBeGreaterThan(0);
  });
});

// ── Behavior Tree (composed from @holoscript/core) ──

describe('Behavior Tree', () => {
  it('Sequence succeeds when all children succeed', () => {
    const tree = new BehaviorTree(
      Sequence([
        Action('a', () => 'success'),
        Action('b', () => 'success'),
      ])
    );
    expect(tree.tick(0)).toBe('success');
  });

  it('Sequence fails on first failure', () => {
    let bRan = false;
    const tree = new BehaviorTree(
      Sequence([
        Action('a', () => 'failure'),
        Action('b', () => { bRan = true; return 'success'; }),
      ])
    );
    expect(tree.tick(0)).toBe('failure');
    expect(bRan).toBe(false);
  });

  it('Selector succeeds on first success', () => {
    const tree = new BehaviorTree(
      Selector([
        Action('a', () => 'failure'),
        Action('b', () => 'success'),
        Action('c', () => 'failure'),
      ])
    );
    expect(tree.tick(0)).toBe('success');
  });

  it('Condition + Action composes', () => {
    let executed = false;
    const tree = new BehaviorTree(
      Sequence([
        Condition('check', () => true),
        Action('do', () => { executed = true; return 'success'; }),
      ])
    );
    tree.tick(0);
    expect(executed).toBe(true);
  });

  it('convenience builders produce core node types', () => {
    const seq = Sequence([Action('test', () => 'success')]);
    expect(seq.type).toBe('sequence');
    const sel = Selector([Action('test', () => 'success')]);
    expect(sel.type).toBe('selector');
  });
});
