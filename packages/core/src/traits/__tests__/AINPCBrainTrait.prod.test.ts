/**
 * AINPCBrainTrait — Production Test Suite
 *
 * ainpcBrainHandler extends llmAgentHandler via spread.
 * Adds NPC-specific state (__npcState) on top of __llmAgentState.
 *
 * Key behaviours:
 * 1. defaultConfig — all LLM defaults + NPC-specific fields
 * 2. onAttach — calls llm base (creates __llmAgentState), creates __npcState,
 *               emits ainpc_init with personality/dialogueRange/voiceEnabled/systemPrompt
 * 3. onDetach — removes __npcState (llm state also removed by base)
 * 4. onUpdate — decays relationship_delta by 0.99 each frame
 * 5. onEvent:
 *    - player_enter_dialogue_range → emits on_player_nearby (only when !in_dialogue)
 *    - player_exit_dialogue_range  → sets in_dialogue=false, emits on_dialogue_end (only when in_dialogue=true)
 *    - player_interact             → sets in_dialogue=true, increments conversation_count, emits on_dialogue_start
 *    - relationship_change         → clamps to -1..1, emits on_relationship_updated with delta
 * 6. personality system prompt mapping (5 personas)
 */
import { describe, it, expect, vi } from 'vitest';
import { ainpcBrainHandler } from '../AINPCBrainTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(id = 'npc_node') {
  return { id, properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof ainpcBrainHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...ainpcBrainHandler.defaultConfig!, ...cfg };
  ainpcBrainHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('ainpcBrainHandler.defaultConfig', () => {
  const d = ainpcBrainHandler.defaultConfig!;
  it('dialogue_range=5.0', () => expect(d.dialogue_range).toBe(5.0));
  it('voice_enabled=true', () => expect(d.voice_enabled).toBe(true));
  it('personality=helpful', () => expect(d.personality).toBe('helpful'));
  it('memory_size=20', () => expect(d.memory_size).toBe(20));
  it('conversation_history=true', () => expect(d.conversation_history).toBe(true));
  it('player_relationship=0.5', () => expect(d.player_relationship).toBe(0.5));
  it('idle_behavior=static', () => expect(d.idle_behavior).toBe('static'));
  // Inherited from LLMAgent defaults
  it('model=gpt-4', () => expect(d.model).toBe('gpt-4'));
  it('temperature=0.7', () => expect(d.temperature).toBeCloseTo(0.7));
  it('bounded_autonomy=true', () => expect(d.bounded_autonomy).toBe(true));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('ainpcBrainHandler.onAttach', () => {
  it('creates __npcState with in_dialogue=false', () => {
    const { node } = attach();
    const s = (node as any).__npcState;
    expect(s).toBeDefined();
    expect(s.in_dialogue).toBe(false);
  });

  it('creates __npcState with conversation_count=0', () => {
    const { node } = attach();
    expect((node as any).__npcState.conversation_count).toBe(0);
  });

  it('also creates __llmAgentState from base handler', () => {
    const { node } = attach();
    expect((node as any).__llmAgentState).toBeDefined();
  });

  it('emits ainpc_init with personality', () => {
    const { ctx } = attach({ personality: 'wise' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'ainpc_init',
      expect.objectContaining({ personality: 'wise' })
    );
  });

  it('emits ainpc_init with dialogueRange', () => {
    const { ctx } = attach({ dialogue_range: 10.0 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'ainpc_init',
      expect.objectContaining({ dialogueRange: 10.0 })
    );
  });

  it('emits ainpc_init with voiceEnabled', () => {
    const { ctx } = attach({ voice_enabled: false });
    expect(ctx.emit).toHaveBeenCalledWith(
      'ainpc_init',
      expect.objectContaining({ voiceEnabled: false })
    );
  });

  it('emits ainpc_init with non-empty systemPrompt for helpful persona', () => {
    const { ctx } = attach({ personality: 'helpful' });
    const [, payload] = ctx.emit.mock.calls.find(([ev]) => ev === 'ainpc_init')!;
    expect(payload.systemPrompt).toContain('helpful');
  });

  it('uses helpful prompt as fallback for unknown personality', () => {
    const { ctx } = attach({ personality: 'unknown_persona' as any });
    const [, payload] = ctx.emit.mock.calls.find(([ev]) => ev === 'ainpc_init')!;
    expect(payload.systemPrompt).toContain('helpful');
  });

  it('sarcastic persona prompt contains sarcastic', () => {
    const { ctx } = attach({ personality: 'sarcastic' });
    const [, payload] = ctx.emit.mock.calls.find(([ev]) => ev === 'ainpc_init')!;
    expect(payload.systemPrompt.toLowerCase()).toContain('sarcastic');
  });

  it('wise persona prompt contains wise', () => {
    const { ctx } = attach({ personality: 'wise' });
    const [, payload] = ctx.emit.mock.calls.find(([ev]) => ev === 'ainpc_init')!;
    expect(payload.systemPrompt.toLowerCase()).toContain('wise');
  });

  it('mysterious persona prompt contains mysterious', () => {
    const { ctx } = attach({ personality: 'mysterious' });
    const [, payload] = ctx.emit.mock.calls.find(([ev]) => ev === 'ainpc_init')!;
    expect(payload.systemPrompt.toLowerCase()).toContain('mysterious');
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('ainpcBrainHandler.onDetach', () => {
  it('removes __npcState', () => {
    const { node, ctx, config } = attach();
    ainpcBrainHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__npcState).toBeUndefined();
  });

  it('removes __llmAgentState (via base handler)', () => {
    const { node, ctx, config } = attach();
    ainpcBrainHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__llmAgentState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('ainpcBrainHandler.onUpdate — relationship decay', () => {
  it('decays non-zero relationship_delta by 0.99', () => {
    const { node, ctx, config } = attach();
    (node as any).__npcState.relationship_delta = 1.0;
    ainpcBrainHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node as any).__npcState.relationship_delta).toBeCloseTo(0.99, 5);
  });

  it('does NOT decay when relationship_delta=0', () => {
    const { node, ctx, config } = attach();
    (node as any).__npcState.relationship_delta = 0;
    ainpcBrainHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node as any).__npcState.relationship_delta).toBe(0);
  });
});

// ─── onEvent: player_enter_dialogue_range ────────────────────────────────────

describe('ainpcBrainHandler.onEvent — player_enter_dialogue_range', () => {
  it('emits on_player_nearby when !in_dialogue', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'player_enter_dialogue_range',
      playerId: 'p1',
      distance: 3.0,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_player_nearby',
      expect.objectContaining({ playerId: 'p1', distance: 3.0 })
    );
  });

  it('does NOT emit on_player_nearby when already in_dialogue', () => {
    const { node, ctx, config } = attach();
    (node as any).__npcState.in_dialogue = true;
    ctx.emit.mockClear();
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'player_enter_dialogue_range',
      playerId: 'p1',
      distance: 3.0,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_player_nearby', expect.anything());
  });
});

// ─── onEvent: player_exit_dialogue_range ─────────────────────────────────────

describe('ainpcBrainHandler.onEvent — player_exit_dialogue_range', () => {
  it('sets in_dialogue=false and emits on_dialogue_end when in_dialogue=true', () => {
    const { node, ctx, config } = attach();
    (node as any).__npcState.in_dialogue = true;
    ctx.emit.mockClear();
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'player_exit_dialogue_range',
    });
    expect((node as any).__npcState.in_dialogue).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('on_dialogue_end', expect.any(Object));
  });

  it('does NOT emit on_dialogue_end when not in_dialogue', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'player_exit_dialogue_range',
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_dialogue_end', expect.anything());
  });
});

// ─── onEvent: player_interact ─────────────────────────────────────────────────

describe('ainpcBrainHandler.onEvent — player_interact', () => {
  it('sets in_dialogue=true', () => {
    const { node, ctx, config } = attach();
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'player_interact',
      playerId: 'p1',
    });
    expect((node as any).__npcState.in_dialogue).toBe(true);
  });

  it('increments conversation_count', () => {
    const { node, ctx, config } = attach();
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'player_interact',
      playerId: 'p1',
    });
    expect((node as any).__npcState.conversation_count).toBe(1);
  });

  it('emits on_dialogue_start with playerId + conversationCount', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'player_interact',
      playerId: 'p2',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_dialogue_start',
      expect.objectContaining({
        playerId: 'p2',
        conversationCount: 1,
      })
    );
  });

  it('accumulates multiple interactions', () => {
    const { node, ctx, config } = attach();
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'player_interact',
      playerId: 'p1',
    });
    (node as any).__npcState.in_dialogue = false;
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'player_interact',
      playerId: 'p1',
    });
    expect((node as any).__npcState.conversation_count).toBe(2);
  });
});

// ─── onEvent: relationship_change ────────────────────────────────────────────

describe('ainpcBrainHandler.onEvent — relationship_change', () => {
  it('applies delta to player_relationship', () => {
    const { node, ctx, config } = attach({ player_relationship: 0.5 });
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'relationship_change',
      delta: 0.2,
    });
    expect(config.player_relationship).toBeCloseTo(0.7, 5);
  });

  it('clamps positive overshoot to 1.0', () => {
    const { node, ctx, config } = attach({ player_relationship: 0.9 });
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'relationship_change',
      delta: 0.5,
    });
    expect(config.player_relationship).toBe(1.0);
  });

  it('clamps negative underflow to -1.0', () => {
    const { node, ctx, config } = attach({ player_relationship: -0.8 });
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'relationship_change',
      delta: -0.5,
    });
    expect(config.player_relationship).toBe(-1.0);
  });

  it('emits on_relationship_updated with relationship+delta', () => {
    const { node, ctx, config } = attach({ player_relationship: 0.0 });
    ctx.emit.mockClear();
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'relationship_change',
      delta: 0.3,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_relationship_updated',
      expect.objectContaining({
        relationship: expect.closeTo(0.3, 5),
        delta: 0.3,
      })
    );
  });

  it('stores delta in relationship_delta for decay', () => {
    const { node, ctx, config } = attach();
    ainpcBrainHandler.onEvent!(node as any, config, ctx as any, {
      type: 'relationship_change',
      delta: 0.4,
    });
    expect((node as any).__npcState.relationship_delta).toBe(0.4);
  });
});
