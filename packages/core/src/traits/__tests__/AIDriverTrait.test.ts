import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AIDriverTrait, BehaviorTreeRunner, GOAPPlanner, createAIDriverTrait } from '../AIDriverTrait';

describe('AIDriverTrait', () => {
  let ai: AIDriverTrait;

  afterEach(() => {
    ai?.dispose();
  });

  beforeEach(() => {
    ai = createAIDriverTrait({
      npcId: 'npc_1',
      decisionMode: 'hybrid',
      personality: { sociability: 0.5, aggression: 0.3, curiosity: 0.6, loyalty: 0.7 },
    });
  });

  it('initializes with defaults', () => {
    const ctx = ai.getContext();
    expect(ctx.npcId).toBe('npc_1');
    expect(ctx.state).toBe('idle');
    expect(ctx.energy).toBe(1.0);
    expect(ctx.mood).toBe(0);
  });

  it('setPosition updates context', () => {
    ai.setPosition([10, 0, 5]);
    expect(ai.getContext().position).toEqual([10, 0, 5]);
  });

  it('updatePerception updates perception data', () => {
    ai.updatePerception(['a', 'b'], ['a']);
    const ctx = ai.getContext();
    expect(ctx.perception.nearbyEntities).toEqual(['a', 'b']);
    expect(ctx.perception.visibleEntities).toEqual(['a']);
  });

  it('speak records dialogue', () => {
    ai.speak('Hello there');
    const ctx = ai.getContext();
    expect(ctx.dialogue!.lastSaid).toBe('Hello there');
    expect(ctx.dialogue!.conversationHistory).toHaveLength(1);
  });

  it('hear records incoming dialogue', () => {
    ai.hear('player', 'Hi');
    const ctx = ai.getContext();
    expect(ctx.dialogue!.lastHeard).toBe('Hi');
    expect(ctx.dialogue!.conversationHistory[0].speaker).toBe('player');
  });

  it('dispose cleans up', () => {
    ai.startAI();
    ai.dispose();
    // Should not throw
    const ctx = ai.getContext();
    expect(ctx.memory.size).toBe(0);
  });
});

describe('BehaviorTreeRunner', () => {
  it('executes sequence (all succeed)', async () => {
    const runner = new BehaviorTreeRunner({
      id: 'root',
      type: 'sequence',
      children: [
        { id: 'a1', type: 'action', action: async () => true },
        { id: 'a2', type: 'action', action: async () => true },
      ],
    });
    const ctx = { npcId: 'test', position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], memory: new Map(), state: 'idle' as const, energy: 1, mood: 0, perception: { nearbyEntities: [], visibleEntities: [] } };
    expect(await runner.tick(ctx)).toBe(true);
  });

  it('sequence fails if one fails', async () => {
    const runner = new BehaviorTreeRunner({
      id: 'root',
      type: 'sequence',
      children: [
        { id: 'a1', type: 'action', action: async () => true },
        { id: 'a2', type: 'action', action: async () => false },
      ],
    });
    const ctx = { npcId: 'test', position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], memory: new Map(), state: 'idle' as const, energy: 1, mood: 0, perception: { nearbyEntities: [], visibleEntities: [] } };
    expect(await runner.tick(ctx)).toBe(false);
  });

  it('selector succeeds on first success', async () => {
    const runner = new BehaviorTreeRunner({
      id: 'root',
      type: 'selector',
      children: [
        { id: 'a1', type: 'action', action: async () => false },
        { id: 'a2', type: 'action', action: async () => true },
      ],
    });
    const ctx = { npcId: 'test', position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], memory: new Map(), state: 'idle' as const, energy: 1, mood: 0, perception: { nearbyEntities: [], visibleEntities: [] } };
    expect(await runner.tick(ctx)).toBe(true);
  });

  it('condition node evaluates', async () => {
    const runner = new BehaviorTreeRunner({
      id: 'root',
      type: 'condition',
      condition: (ctx) => ctx.energy > 0.5,
    });
    const ctx = { npcId: 'test', position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], memory: new Map(), state: 'idle' as const, energy: 1, mood: 0, perception: { nearbyEntities: [], visibleEntities: [] } };
    expect(await runner.tick(ctx)).toBe(true);
  });

  it('parallel runs all children', async () => {
    const runner = new BehaviorTreeRunner({
      id: 'root',
      type: 'parallel',
      children: [
        { id: 'a1', type: 'action', action: async () => true },
        { id: 'a2', type: 'action', action: async () => true },
      ],
    });
    const ctx = { npcId: 'test', position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], memory: new Map(), state: 'idle' as const, energy: 1, mood: 0, perception: { nearbyEntities: [], visibleEntities: [] } };
    expect(await runner.tick(ctx)).toBe(true);
  });
});

describe('GOAPPlanner', () => {
  it('plans achievable goal', () => {
    const planner = new GOAPPlanner([
      { id: 'eat', name: 'Eat', priority: 1, preconditions: new Map([['hasFood', true]]), effects: new Map([['hunger', 0]]), cost: 1 },
    ]);
    const state = new Map<string, unknown>([['hasFood', true]]);
    const goal = { id: 'eat', name: 'Eat', priority: 1, preconditions: new Map([['hasFood', true]]), effects: new Map([['hunger', 0]]), cost: 1 };
    const plan = planner.planGoal(state, goal);
    expect(plan).toHaveLength(1);
  });

  it('returns empty for unachievable goal', () => {
    const planner = new GOAPPlanner([
      { id: 'eat', name: 'Eat', priority: 1, preconditions: new Map([['hasFood', true]]), effects: new Map(), cost: 1 },
    ]);
    const state = new Map<string, unknown>([['hasFood', false]]);
    const goal = { id: 'eat', name: 'Eat', priority: 1, preconditions: new Map([['hasFood', true]]), effects: new Map(), cost: 1 };
    const plan = planner.planGoal(state, goal);
    expect(plan).toHaveLength(0);
  });
});
