import { describe, it, expect, beforeEach } from 'vitest';
import { ainpcBrainHandler } from '../AINPCBrainTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

describe('AINPCBrainTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    model: 'gpt-4',
    system_prompt: '',
    context_window: 4096,
    temperature: 0.7,
    tools: [] as any[],
    max_actions_per_turn: 3,
    bounded_autonomy: true,
    escalation_conditions: [],
    rate_limit_ms: 100,
    max_history_length: 50,
    dialogue_range: 5.0,
    voice_enabled: true,
    personality: 'helpful',
    memory_size: 20,
    conversation_history: true,
    player_relationship: 0.5,
    idle_behavior: 'static' as const,
  };

  beforeEach(() => {
    node = createMockNode('npc');
    ctx = createMockContext();
    attachTrait(ainpcBrainHandler, node, cfg, ctx);
  });

  it('initializes LLM state and NPC state', () => {
    expect((node as any).__llmAgentState).toBeDefined();
    expect((node as any).__npcState).toBeDefined();
    expect((node as any).__npcState.in_dialogue).toBe(false);
  });

  it('emits ainpc_init on attach', () => {
    expect(getEventCount(ctx, 'ainpc_init')).toBe(1);
  });

  it('player_enter_dialogue_range emits on_player_nearby', () => {
    sendEvent(ainpcBrainHandler, node, cfg, ctx, {
      type: 'player_enter_dialogue_range', playerId: 'p1', distance: 3.0,
    });
    expect(getEventCount(ctx, 'on_player_nearby')).toBe(1);
  });

  it('player_interact starts dialogue', () => {
    sendEvent(ainpcBrainHandler, node, cfg, ctx, {
      type: 'player_interact', playerId: 'p1',
    });
    expect((node as any).__npcState.in_dialogue).toBe(true);
    expect((node as any).__npcState.conversation_count).toBe(1);
    expect(getEventCount(ctx, 'on_dialogue_start')).toBe(1);
  });

  it('player_exit_dialogue_range ends dialogue', () => {
    sendEvent(ainpcBrainHandler, node, cfg, ctx, {
      type: 'player_interact', playerId: 'p1',
    });
    sendEvent(ainpcBrainHandler, node, cfg, ctx, {
      type: 'player_exit_dialogue_range',
    });
    expect((node as any).__npcState.in_dialogue).toBe(false);
    expect(getEventCount(ctx, 'on_dialogue_end')).toBe(1);
  });

  it('relationship_change emits on_relationship_updated', () => {
    // sendEvent creates a merged config copy, so we verify via emitted event data
    sendEvent(ainpcBrainHandler, node, cfg, ctx, {
      type: 'relationship_change', delta: 0.2,
    });
    expect(getEventCount(ctx, 'on_relationship_updated')).toBe(1);
    const ev = getLastEvent(ctx, 'on_relationship_updated') as any;
    expect(ev.delta).toBe(0.2);
    expect(ev.relationship).toBeCloseTo(0.7);
  });

  it('detach cleans up both states', () => {
    ainpcBrainHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__llmAgentState).toBeUndefined();
    expect((node as any).__npcState).toBeUndefined();
  });
});
