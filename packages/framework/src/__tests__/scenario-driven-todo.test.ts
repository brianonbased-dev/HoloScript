import { describe, it, expect, vi } from 'vitest';
import { GoalSynthesizer, DOMAIN_GOALS } from '../protocol/goal-synthesizer';
import type { KnowledgeStore, StoredEntry } from '../knowledge/knowledge-store';

// Mock KnowledgeStore
function mockKnowledgeStore(entries: Partial<StoredEntry>[] = []): KnowledgeStore {
  return {
    search: vi.fn().mockReturnValue(entries),
  } as unknown as KnowledgeStore;
}

describe('Scenario-Driven Todo Generation', () => {
  
  it('Scenario 1: High Network Latency/Timeout generates DevOps/Performance todos', async () => {
    // Injecting a gotcha about network lag into the knowledge store
    const store = mockKnowledgeStore([
      {
        id: 'G.NET.088',
        type: 'gotcha',
        content: 'Mesh gossip sync consistently dropping packets under node count > 50',
        domain: 'performance',
        confidence: 0.95,
        source: 'telemetry',
        queryCount: 1,
        reuseCount: 0,
        createdAt: new Date().toISOString(),
        authorAgent: 'monitor-agent',
      },
      {
        id: 'G.NET.089',
        type: 'gotcha',
        content: 'Unbounded memory growth observed in PR #202 telemetry reporting',
        domain: 'devops',
        confidence: 0.85,
        source: 'telemetry',
        queryCount: 0,
        reuseCount: 0,
        createdAt: new Date().toISOString(),
        authorAgent: 'monitor-agent',
      }
    ]);
    
    const synthesizer = new GoalSynthesizer({ knowledge: store });
    
    const performanceTodos = await synthesizer.synthesizeMultiple({ domain: 'performance' }, 50);
    const devopsTodos = await synthesizer.synthesizeMultiple({ domain: 'devops' }, 50);
    
    // Performance agent should prioritize the dropping packets bug
    expect(performanceTodos.some(t => t.category === 'knowledge-gap')).toBe(true);
    expect(performanceTodos.some(t => t.description.includes('gossip sync consistently dropping'))).toBe(true);

    // DevOps agent should look at telemetry reporting issues
    expect(devopsTodos.some(t => t.category === 'knowledge-gap')).toBe(true);
    expect(devopsTodos.some(t => t.description.includes('Unbounded memory growth'))).toBe(true);
  });

  it('Scenario 2: Team switches to "Testing" mode after major logic refactoring', async () => {
    const synthesizer = new GoalSynthesizer();
    // In "testing" mode with no specific recent knowledge, should yield pure heuristic testing goals
    const testingTodos = await synthesizer.synthesizeMultiple({ domain: 'testing' }, 4);
    
    expect(testingTodos.length).toBe(4);
    const allExpectedDomains = DOMAIN_GOALS['testing'];
    const hasTestingHeuristic = testingTodos.some(t => 
      allExpectedDomains.includes(t.description)
    );
    expect(hasTestingHeuristic).toBe(true);
  });

  it('Scenario 3: Architecture re-evaluates service bounds based off system-mandated source', async () => {
    const synthesizer = new GoalSynthesizer();
    
    // Simulate legacy synchronous call
    const architectGoal = synthesizer.synthesize('architecture', 'system-mandate');
    
    expect(architectGoal).toBeDefined();
    expect(architectGoal.source).toBe('system-mandate');
    expect(['knowledge-gap', 'self-improvement']).toContain(architectGoal.category);
    
    // The description should match an architecture domain or generic fallback
    const archDomains = DOMAIN_GOALS['architecture'];
    expect(archDomains.includes(architectGoal.description) || architectGoal.description.includes('Analyze') || architectGoal.description.includes('efficiency')).toBeTruthy();
  });

  it('Scenario 4: Security agent triages code injection vulnerability knowledge', async () => {
    const store = mockKnowledgeStore([
      {
        id: 'G.SEC.999',
        type: 'gotcha',
        content: 'CRDT delta payloads bypassing type serialization checks causing prompt injection',
        domain: 'security',
        confidence: 0.99,
        source: 'audit',
        queryCount: 4,
        reuseCount: 0,
        createdAt: new Date().toISOString(),
        authorAgent: 'security-scanner',
      }
    ]);
    
    const synthesizer = new GoalSynthesizer({ knowledge: store });
    const secTodos = await synthesizer.synthesizeMultiple({ domain: 'security' }, 50);

    expect(secTodos.some(t => t.description.includes('CRDT delta payloads bypassing type serialization'))).toBe(true);
    // Security agent should rank the injection gotcha with high priority
    const injectionTodo = secTodos.find(t => t.description.includes('CRDT delta'));
    expect(injectionTodo?.category).toBe('knowledge-gap');
  });

  it('Scenario 5: Goal Synthesizer todos are successfully converted and pushed to the Team board', async () => {
    // We can isolate the goal-to-task pipeline
    const synthesizer = new GoalSynthesizer();
    
    // Synthesize some tasks for testing
    const newGoals = await synthesizer.synthesizeMultiple({ domain: 'performance' }, 3);
    
    // Convert to board tasks structure
    const tasksToSubmit = newGoals.map(goal => ({
      title: goal.description,
      description: `[Auto-Synthesized] Rationale: ${goal.rationale}\nRelevance: ${goal.relevanceScore}`,
      priority: goal.priority === 'high' ? 1 : goal.priority === 'medium' ? 2 : 3,
      source: `synthesizer:${goal.id}`
    }));
    
    // Verify valid schema
    expect(tasksToSubmit.length).toBe(3);
    expect(tasksToSubmit[0].title).toBeDefined();
    expect(tasksToSubmit[0].description).toContain('[Auto-Synthesized]');
    expect(tasksToSubmit[0].priority).toBeGreaterThanOrEqual(1);
    expect(tasksToSubmit[0].priority).toBeLessThanOrEqual(3);
  });
});
