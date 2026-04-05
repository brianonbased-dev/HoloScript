import { describe, it, expect, vi } from 'vitest';
import { defineAgent } from '../define-agent';
import { defineTeam } from '../define-team';
import { KnowledgeStore } from '../knowledge/knowledge-store';
import { SequenceNode, SelectorNode, ActionNode, ConditionNode, BehaviorTree } from '../behavior';
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
      new SequenceNode([
        new ActionNode('a', () => 'success'),
        new ActionNode('b', () => 'success'),
      ])
    );
    expect(tree.tick(0)).toBe('success');
  });

  it('Sequence fails on first failure', () => {
    let bRan = false;
    const tree = new BehaviorTree(
      new SequenceNode([
        new ActionNode('a', () => 'failure'),
        new ActionNode('b', () => { bRan = true; return 'success'; }),
      ])
    );
    expect(tree.tick(0)).toBe('failure');
    expect(bRan).toBe(false);
  });

  it('Selector succeeds on first success', () => {
    const tree = new BehaviorTree(
      new SelectorNode([
        new ActionNode('a', () => 'failure'),
        new ActionNode('b', () => 'success'),
        new ActionNode('c', () => 'failure'),
      ])
    );
    expect(tree.tick(0)).toBe('success');
  });

  it('Condition + Action composes', () => {
    let executed = false;
    const tree = new BehaviorTree(
      new SequenceNode([
        new ConditionNode('check', () => true),
        new ActionNode('do', () => { executed = true; return 'success'; }),
      ])
    );
    tree.tick(0);
    expect(executed).toBe(true);
  });

  it('convenience builders produce core node types', () => {
    const seq = new SequenceNode([new ActionNode('test', () => 'success')]);
    expect(seq.type).toBe('sequence');
    const sel = new SelectorNode([new ActionNode('test', () => 'success')]);
    expect(sel.type).toBe('selector');
  });
});

// ── Goal Synthesis ──

vi.mock('../protocol-agent', () => ({
  runProtocolCycle: vi.fn().mockResolvedValue({
    summary: 'Completed synthesized task',
    insights: [
      { type: 'wisdom', content: 'Autonomous goals keep agents productive', domain: 'security', confidence: 0.7, source: 'Coder' },
    ],
  }),
}));

describe('Goal Synthesis (empty board)', () => {
  const makeTeam = () =>
    defineTeam({
      name: 'synth-test',
      agents: [
        defineAgent({
          name: 'Coder',
          role: 'coder',
          model: { provider: 'anthropic', model: 'claude-sonnet-4' },
          capabilities: ['code-generation'],
          claimFilter: { roles: ['coder'], maxPriority: 10 },
          knowledgeDomains: ['security'],
        }),
      ],
    });

  it('synthesizes a goal when board is empty instead of skipping', async () => {
    const team = makeTeam();
    // Board is empty — agent should synthesize
    const result = await team.runCycle();
    expect(result.agentResults).toHaveLength(1);
    const agentResult = result.agentResults[0];
    expect(agentResult.action).toBe('synthesized');
    expect(agentResult.taskId).toBeTruthy();
    expect(agentResult.taskTitle).toBeTruthy();
    expect(agentResult.summary).toBe('Completed synthesized task');
    // The synthesized task should be completed and removed from the board
    expect(team.openTasks).toHaveLength(0);
    expect(team.completedCount).toBe(1);
  });

  it('claims existing tasks normally when board has tasks', async () => {
    const team = makeTeam();
    await team.addTasks([
      { title: 'Fix auth bug', description: 'JWT issue', priority: 1, role: 'coder' },
      { title: 'Add tests', description: 'Coverage', priority: 2, role: 'coder' },
      { title: 'Refactor DB', description: 'Cleanup', priority: 3, role: 'coder' },
    ]);
    expect(team.openTasks).toHaveLength(3);

    const result = await team.runCycle();
    const agentResult = result.agentResults[0];
    // Should claim a real task, not synthesize
    expect(agentResult.action).toBe('completed');
    expect(agentResult.taskTitle).toBe('Fix auth bug');
    expect(team.openTasks).toHaveLength(2);
  });

  it('synthesized task has source prefix synthesizer:', async () => {
    const team = makeTeam();
    const result = await team.runCycle();
    // The task was completed and moved to doneLog, but we can verify via the cycle result
    expect(result.agentResults[0].taskId).toMatch(/^task_synth_/);
  });

  it('publishes knowledge from synthesized task execution', async () => {
    const team = makeTeam();
    const result = await team.runCycle();
    expect(result.knowledgeProduced).toHaveLength(1);
    expect(result.knowledgeProduced[0].type).toBe('wisdom');
    expect(result.knowledgeProduced[0].content).toContain('Autonomous goals');
  });
});

// ── Remote facade methods ──

describe('Team remote facade methods', () => {
  const agent = defineAgent({
    name: 'A', role: 'coder',
    model: { provider: 'anthropic', model: 'claude-sonnet-4' },
    capabilities: ['c'], claimFilter: { roles: ['coder'], maxPriority: 10 },
  });

  // Helper: create a local-only team (no boardUrl)
  function localTeam() {
    return defineTeam({ name: 'local-team', agents: [agent] });
  }

  // Helper: create a remote team with mocked fetch
  function remoteTeam(mockResponse: Record<string, unknown>) {
    const team = defineTeam({
      name: 'remote-team',
      agents: [agent],
      boardUrl: 'https://example.com',
      boardApiKey: 'test-key',
    });
    // Mock global fetch
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => mockResponse,
    } as Response);
    return { team, fetchSpy };
  }

  // ── suggest() (remote) ──

  describe('suggest() remote', () => {
    it('calls POST /suggestions with correct body', async () => {
      const { team, fetchSpy } = remoteTeam({ suggestion: { id: 's1', title: 'idea', status: 'open', votes: 0, createdAt: '2026-01-01' } });
      const result = await team.suggest('idea', { description: 'desc', category: 'ux', evidence: 'data' });
      expect(result.suggestion.id).toBe('s1');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/holomesh/team/remote-team/suggestions');
      expect(opts?.method).toBe('POST');
      const body = JSON.parse(opts?.body as string);
      expect(body.title).toBe('idea');
      expect(body.description).toBe('desc');
      expect(body.category).toBe('ux');
      expect(body.evidence).toBe('data');
      fetchSpy.mockRestore();
    });

    it('throws on error response', async () => {
      const { team, fetchSpy } = remoteTeam({ error: 'bad request' });
      await expect(team.suggest('x')).rejects.toThrow('bad request');
      fetchSpy.mockRestore();
    });
  });

  // ── vote() (remote) ──

  describe('vote() remote', () => {
    it('calls PATCH /suggestions/:id with vote action', async () => {
      const { team, fetchSpy } = remoteTeam({ suggestion: { id: 's1', title: 'idea', status: 'open', votes: 1, createdAt: '2026-01-01' } });
      const result = await team.vote('s1', 1, 'good idea');
      expect(result.suggestion.votes).toBe(1);
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/holomesh/team/remote-team/suggestions/s1');
      expect(opts?.method).toBe('PATCH');
      const body = JSON.parse(opts?.body as string);
      expect(body.action).toBe('vote');
      expect(body.value).toBe(1);
      expect(body.reason).toBe('good idea');
      fetchSpy.mockRestore();
    });
  });

  // ── suggestions() (remote) ──

  describe('suggestions() remote', () => {
    it('calls GET /suggestions without filter', async () => {
      const { team, fetchSpy } = remoteTeam({ suggestions: [] });
      const result = await team.suggestions();
      expect(result.suggestions).toEqual([]);
      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/holomesh/team/remote-team/suggestions');
      expect(url).not.toContain('?status=');
      fetchSpy.mockRestore();
    });

    it('calls GET /suggestions?status=open with filter', async () => {
      const { team, fetchSpy } = remoteTeam({ suggestions: [{ id: 's1' }] });
      await team.suggestions('open');
      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('?status=open');
      fetchSpy.mockRestore();
    });
  });

  // ── setMode() ──

  describe('setMode()', () => {
    it('throws on local-only team', async () => {
      const team = localTeam();
      await expect(team.setMode('audit')).rejects.toThrow('requires a remote board');
    });

    it('calls POST /mode with mode body', async () => {
      const { team, fetchSpy } = remoteTeam({ mode: 'audit', previousMode: 'build' });
      const result = await team.setMode('audit');
      expect(result.mode).toBe('audit');
      expect(result.previousMode).toBe('build');
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/holomesh/team/remote-team/mode');
      expect(opts?.method).toBe('POST');
      const body = JSON.parse(opts?.body as string);
      expect(body.mode).toBe('audit');
      fetchSpy.mockRestore();
    });
  });

  // ── derive() ──

  describe('derive()', () => {
    it('throws on local-only team', async () => {
      const team = localTeam();
      await expect(team.derive('audit', '# Findings')).rejects.toThrow('requires a remote board');
    });

    it('calls POST /board/derive with source and content', async () => {
      const { team, fetchSpy } = remoteTeam({ tasks: [{ id: 't1', title: 'Fix X' }] });
      const result = await team.derive('audit-report', '# Findings\n- Fix X');
      expect(result.tasks).toHaveLength(1);
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/holomesh/team/remote-team/board/derive');
      expect(opts?.method).toBe('POST');
      const body = JSON.parse(opts?.body as string);
      expect(body.source).toBe('audit-report');
      expect(body.content).toBe('# Findings\n- Fix X');
      fetchSpy.mockRestore();
    });
  });

  // ── presence() ──

  describe('presence()', () => {
    it('throws on local-only team', async () => {
      const team = localTeam();
      await expect(team.presence()).rejects.toThrow('requires a remote board');
    });

    it('calls GET /slots', async () => {
      const { team, fetchSpy } = remoteTeam({ slots: [{ agentName: 'A', role: 'coder', status: 'active' }] });
      const result = await team.presence();
      expect(result.slots).toHaveLength(1);
      expect(result.slots[0].agentName).toBe('A');
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/holomesh/team/remote-team/slots');
      expect(opts?.method).toBe('GET');
      fetchSpy.mockRestore();
    });
  });

  // ── heartbeat() ──

  describe('heartbeat()', () => {
    it('throws on local-only team', async () => {
      const team = localTeam();
      await expect(team.heartbeat()).rejects.toThrow('requires a remote board');
    });

    it('calls POST /presence with ide_type and status', async () => {
      const { team, fetchSpy } = remoteTeam({ ok: true });
      const result = await team.heartbeat('vscode');
      expect(result.ok).toBe(true);
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/holomesh/team/remote-team/presence');
      expect(opts?.method).toBe('POST');
      const body = JSON.parse(opts?.body as string);
      expect(body.ide_type).toBe('vscode');
      expect(body.status).toBe('active');
      fetchSpy.mockRestore();
    });

    it('defaults ide_type to unknown', async () => {
      const { team, fetchSpy } = remoteTeam({ ok: true });
      await team.heartbeat();
      const [, opts] = fetchSpy.mock.calls[0];
      const body = JSON.parse(opts?.body as string);
      expect(body.ide_type).toBe('unknown');
      fetchSpy.mockRestore();
    });
  });
});

// ── Local Suggestions (FW-0.3) ──

describe('Team local suggestions', () => {
  const agent1 = defineAgent({
    name: 'Alice', role: 'coder',
    model: { provider: 'anthropic', model: 'claude-sonnet-4' },
    capabilities: ['code-generation'], claimFilter: { roles: ['coder'], maxPriority: 10 },
  });
  const agent2 = defineAgent({
    name: 'Bob', role: 'researcher',
    model: { provider: 'anthropic', model: 'claude-sonnet-4' },
    capabilities: ['research'], claimFilter: { roles: ['researcher'], maxPriority: 10 },
  });

  function makeTeam() {
    return defineTeam({ name: 'test-team', agents: [agent1, agent2] });
  }

  describe('suggest()', () => {
    it('creates a local suggestion with defaults', async () => {
      const team = makeTeam();
      const result = await team.suggest('Add caching layer');
      expect(result.suggestion.id).toMatch(/^sug_/);
      expect(result.suggestion.title).toBe('Add caching layer');
      expect(result.suggestion.status).toBe('open');
      expect(result.suggestion.proposedBy).toBe('anonymous');
      expect(result.suggestion.votes).toEqual([]);
      expect(result.suggestion.score).toBe(0);
    });

    it('creates a suggestion with all options', async () => {
      const team = makeTeam();
      const result = await team.suggest('Refactor parser', {
        description: 'The parser is too complex',
        category: 'architecture',
        evidence: 'Cyclomatic complexity > 20',
        proposedBy: 'Alice',
        autoPromoteThreshold: 3,
        autoDismissThreshold: 2,
      });
      const s = result.suggestion;
      expect(s.description).toBe('The parser is too complex');
      expect(s.category).toBe('architecture');
      expect(s.evidence).toBe('Cyclomatic complexity > 20');
      expect(s.proposedBy).toBe('Alice');
      expect(s.autoPromoteThreshold).toBe(3);
      expect(s.autoDismissThreshold).toBe(2);
    });

    it('throws on empty title', async () => {
      const team = makeTeam();
      await expect(team.suggest('   ')).rejects.toThrow('title is required');
    });

    it('deduplicates against open suggestions', async () => {
      const team = makeTeam();
      await team.suggest('Add caching');
      await expect(team.suggest('add  CACHING')).rejects.toThrow('similar open suggestion');
    });

    it('allows resubmission after dismiss', async () => {
      const team = makeTeam();
      const { suggestion } = (await team.suggest('Add caching'));
      team.dismissSuggestion(suggestion.id);
      // Should not throw — dismissed suggestions don't block new ones
      const result = await team.suggest('Add caching');
      expect(result.suggestion.status).toBe('open');
    });
  });

  describe('vote()', () => {
    it('records an upvote', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('Idea');
      const result = await team.vote(suggestion.id, 'Alice', 'up');
      expect(result.suggestion.votes).toHaveLength(1);
      expect(result.suggestion.votes[0].agent).toBe('Alice');
      expect(result.suggestion.votes[0].vote).toBe('up');
      expect(result.suggestion.score).toBe(1);
    });

    it('records a downvote', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('Bad idea');
      const result = await team.vote(suggestion.id, 'Bob', 'down', 'not useful');
      expect(result.suggestion.votes[0].vote).toBe('down');
      expect(result.suggestion.votes[0].reason).toBe('not useful');
      expect(result.suggestion.score).toBe(-1);
    });

    it('replaces previous vote from same agent', async () => {
      const team = makeTeam();
      // High threshold so first vote doesn't auto-promote
      const { suggestion } = await team.suggest('Idea', { autoPromoteThreshold: 10 });
      await team.vote(suggestion.id, 'Alice', 'up');
      const result = await team.vote(suggestion.id, 'Alice', 'down');
      expect(result.suggestion.votes).toHaveLength(1);
      expect(result.suggestion.votes[0].vote).toBe('down');
      expect(result.suggestion.score).toBe(-1);
    });

    it('throws on unknown suggestion', async () => {
      const team = makeTeam();
      await expect(team.vote('nonexistent', 'Alice', 'up')).rejects.toThrow('Suggestion not found');
    });

    it('throws on closed suggestion', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('Idea');
      team.dismissSuggestion(suggestion.id);
      await expect(team.vote(suggestion.id, 'Alice', 'up')).rejects.toThrow('voting closed');
    });

    it('auto-promotes when upvotes reach threshold', async () => {
      const team = makeTeam();
      // Default threshold = ceil(2 agents / 2) = 1
      const { suggestion } = await team.suggest('Ship it', { proposedBy: 'Alice' });
      const result = await team.vote(suggestion.id, 'Alice', 'up');
      expect(result.suggestion.status).toBe('promoted');
      expect(result.promotedTaskId).toBeDefined();
      expect(result.promotedTaskId).toMatch(/^task_/);
      // Verify task was added to board
      expect(team.openTasks.some(t => t.source === `suggestion:${suggestion.id}`)).toBe(true);
    });

    it('auto-dismisses when downvotes reach threshold', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('Bad plan');
      const result = await team.vote(suggestion.id, 'Bob', 'down');
      expect(result.suggestion.status).toBe('dismissed');
      expect(result.suggestion.resolvedAt).toBeDefined();
    });

    it('respects custom autoPromoteThreshold', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('Needs consensus', { autoPromoteThreshold: 2 });
      // First vote: not enough
      const r1 = await team.vote(suggestion.id, 'Alice', 'up');
      expect(r1.suggestion.status).toBe('open');
      // Second vote: reaches threshold
      const r2 = await team.vote(suggestion.id, 'Bob', 'up');
      expect(r2.suggestion.status).toBe('promoted');
      expect(r2.promotedTaskId).toBeDefined();
    });

    it('respects custom autoDismissThreshold', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('Maybe bad', { autoDismissThreshold: 2 });
      const r1 = await team.vote(suggestion.id, 'Alice', 'down');
      expect(r1.suggestion.status).toBe('open');
      const r2 = await team.vote(suggestion.id, 'Bob', 'down');
      expect(r2.suggestion.status).toBe('dismissed');
    });
  });

  describe('suggestions()', () => {
    it('returns empty list initially', async () => {
      const team = makeTeam();
      const result = await team.suggestions();
      expect(result.suggestions).toEqual([]);
    });

    it('returns all suggestions', async () => {
      const team = makeTeam();
      await team.suggest('A');
      await team.suggest('B');
      const result = await team.suggestions();
      expect(result.suggestions).toHaveLength(2);
    });

    it('filters by status', async () => {
      const team = makeTeam();
      const { suggestion: s1 } = await team.suggest('Keep');
      await team.suggest('Dismiss me');
      const list = await team.suggestions();
      team.dismissSuggestion(list.suggestions[1].id);

      const open = await team.suggestions('open');
      expect(open.suggestions).toHaveLength(1);
      expect(open.suggestions[0].id).toBe(s1.id);

      const dismissed = await team.suggestions('dismissed');
      expect(dismissed.suggestions).toHaveLength(1);
    });
  });

  describe('promoteSuggestion()', () => {
    it('promotes and creates a board task', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('Build widget', {
        description: 'We need a widget',
        proposedBy: 'Alice',
      });
      const result = await team.promoteSuggestion(suggestion.id, 'Bob');
      expect(result.suggestion.status).toBe('promoted');
      expect(result.promotedTaskId).toBeDefined();
      const task = team.openTasks.find(t => t.id === result.promotedTaskId);
      expect(task).toBeDefined();
      expect(task!.title).toBe('Build widget');
      expect(task!.description).toContain('Promoted by Bob');
      expect(task!.source).toBe(`suggestion:${suggestion.id}`);
    });

    it('throws on already promoted', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('X');
      await team.promoteSuggestion(suggestion.id);
      await expect(team.promoteSuggestion(suggestion.id)).rejects.toThrow('already promoted');
    });

    it('throws on not found', async () => {
      const team = makeTeam();
      await expect(team.promoteSuggestion('nope')).rejects.toThrow('not found');
    });

    it('assigns priority 2 for architecture category', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('Restructure', { category: 'architecture' });
      const result = await team.promoteSuggestion(suggestion.id);
      const task = team.openTasks.find(t => t.id === result.promotedTaskId);
      expect(task!.priority).toBe(2);
    });

    it('assigns priority 3 for testing category', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('Add tests', { category: 'testing' });
      const result = await team.promoteSuggestion(suggestion.id);
      const task = team.openTasks.find(t => t.id === result.promotedTaskId);
      expect(task!.priority).toBe(3);
    });
  });

  describe('dismissSuggestion()', () => {
    it('dismisses an open suggestion', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('Nah');
      const result = team.dismissSuggestion(suggestion.id);
      expect(result.suggestion.status).toBe('dismissed');
      expect(result.suggestion.resolvedAt).toBeDefined();
    });

    it('throws on already dismissed', async () => {
      const team = makeTeam();
      const { suggestion } = await team.suggest('Gone');
      team.dismissSuggestion(suggestion.id);
      expect(() => team.dismissSuggestion(suggestion.id)).toThrow('already dismissed');
    });

    it('throws on remote team', async () => {
      const team = defineTeam({
        name: 'remote', agents: [agent1],
        boardUrl: 'https://example.com', boardApiKey: 'key',
      });
      expect(() => team.dismissSuggestion('s1')).toThrow('not supported in remote mode');
    });
  });
});
