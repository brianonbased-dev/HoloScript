import { describe, it, expect, vi } from 'vitest';
import { npcAIHandler } from '../NPCAITrait';

// ─── helpers ────────────────────────────────────────────────────────────────

type NPCConfig = NonNullable<Parameters<typeof npcAIHandler.onAttach>[1]>;

function mkCfg(o: Partial<NPCConfig> = {}): NPCConfig {
  return { ...npcAIHandler.defaultConfig!, ...o };
}

function mkNode(id = 'npc-node') {
  return { id } as any;
}

function mkCtx() {
  const emitted: any[] = [];
  return {
    emitted,
    emit: vi.fn((t: string, p: any) => emitted.push({ type: t, payload: p })) as any,
  };
}

function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  npcAIHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('npcAIHandler — defaultConfig', () => {
  it('model = hermes-3-70b', () => expect(npcAIHandler.defaultConfig?.model).toBe('hermes-3-70b'));
  it('intelligence_tier = advanced', () => expect(npcAIHandler.defaultConfig?.intelligence_tier).toBe('advanced'));
  it('perception_range = 10', () => expect(npcAIHandler.defaultConfig?.perception_range).toBe(10.0));
  it('personality_profile = professional', () => expect(npcAIHandler.defaultConfig?.personality_profile).toBe('professional'));
});

describe('npcAIHandler — onAttach', () => {
  it('creates __npcAIState', () => {
    const { node } = attach();
    expect((node as any).__npcAIState).toBeDefined();
  });
  it('isThinking = false', () => {
    const { node } = attach();
    expect((node as any).__npcAIState.isThinking).toBe(false);
  });
  it('emotionalState = neutral', () => {
    const { node } = attach();
    expect((node as any).__npcAIState.emotionalState).toBe('neutral');
  });
  it('goals = [wait_for_interaction]', () => {
    const { node } = attach();
    expect((node as any).__npcAIState.goals).toEqual(['wait_for_interaction']);
  });
  it('conversationHistory is empty', () => {
    const { node } = attach();
    expect((node as any).__npcAIState.conversationHistory).toHaveLength(0);
  });
  it('emits npc_ai_initialized', () => {
    const node = mkNode(); const ctx = mkCtx();
    npcAIHandler.onAttach!(node, mkCfg(), ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'npc_ai_initialized')).toBe(true);
  });
});

describe('npcAIHandler — onDetach', () => {
  it('removes __npcAIState', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__npcAIState).toBeUndefined();
  });
});

describe('npcAIHandler — onUpdate', () => {
  it('no-op when isThinking=true', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__npcAIState.isThinking = true;
    npcAIHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted).toHaveLength(0);
  });
  it('no-op when no state', () => {
    const node = mkNode(); const ctx = mkCtx();
    expect(() => npcAIHandler.onUpdate!(node, mkCfg(), ctx as any, 0.016)).not.toThrow();
  });
  it('runs without error when state exists and not thinking', () => {
    const { node, ctx, cfg } = attach();
    expect(() => npcAIHandler.onUpdate!(node, cfg, ctx as any, 0.016)).not.toThrow();
  });
});

describe('npcAIHandler — onEvent: npc_ai_prompt', () => {
  it('sets isThinking=true when prompt received', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_prompt', prompt: 'Hello NPC' } as any);
    expect((node as any).__npcAIState.isThinking).toBe(true);
  });
  it('adds prompt to conversationHistory as user role', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_prompt', prompt: 'Who are you?' } as any);
    const history = (node as any).__npcAIState.conversationHistory;
    expect(history[history.length - 1]).toEqual({ role: 'user', content: 'Who are you?' });
  });
  it('emits npc_ai_think_begin with prompt', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_prompt', prompt: 'test' } as any);
    expect(ctx.emitted.some((e: any) => e.type === 'npc_ai_think_begin')).toBe(true);
    expect(ctx.emitted.find((e: any) => e.type === 'npc_ai_think_begin')?.payload.prompt).toBe('test');
  });
  it('no-op when no state', () => {
    const node = mkNode(); const ctx = mkCtx();
    expect(() => npcAIHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'npc_ai_prompt', prompt: 'test' } as any)).not.toThrow();
  });
});

describe('npcAIHandler — onEvent: npc_ai_response', () => {
  it('sets isThinking=false', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__npcAIState.isThinking = true;
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_response', text: 'Hello there!' } as any);
    expect((node as any).__npcAIState.isThinking).toBe(false);
  });
  it('stores response as lastResponse', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_response', text: 'I am the guardian.' } as any);
    expect((node as any).__npcAIState.lastResponse).toBe('I am the guardian.');
  });
  it('appends response to conversationHistory as assistant role', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_response', text: 'Greetings traveller.' } as any);
    const history = (node as any).__npcAIState.conversationHistory;
    expect(history[history.length - 1]).toEqual({ role: 'assistant', content: 'Greetings traveller.' });
  });
  it('emits npc_ai_think_end with response', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_response', text: 'Done.' } as any);
    expect(ctx.emitted.some((e: any) => e.type === 'npc_ai_think_end')).toBe(true);
  });
  it('emits npc_ai_speak with response text', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_response', text: 'I speak!' } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'npc_ai_speak');
    expect(ev?.payload.text).toBe('I speak!');
  });
});

describe('npcAIHandler — action tag parsing', () => {
  it('emits npc_behavior_<type> for each <action> tag', () => {
    const { node, ctx, cfg } = attach();
    const response = 'Sure! <action type="move" target="door" /> I will walk to the door.';
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_response', text: response } as any);
    expect(ctx.emitted.some((e: any) => e.type === 'npc_behavior_move')).toBe(true);
  });
  it('emits npc_action for each <action> tag', () => {
    const { node, ctx, cfg } = attach();
    const response = '<action type="attack" damage="10" />';
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_response', text: response } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'npc_action');
    expect(ev?.payload.type).toBe('attack');
  });
  it('parses multiple action tags in one response', () => {
    const { node, ctx, cfg } = attach();
    const response = '<action type="draw_weapon" /><action type="taunt" />';
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_response', text: response } as any);
    const actions = ctx.emitted.filter((e: any) => e.type === 'npc_action');
    expect(actions).toHaveLength(2);
    expect(actions.map((a: any) => a.payload.type)).toContain('draw_weapon');
    expect(actions.map((a: any) => a.payload.type)).toContain('taunt');
  });
  it('parses action params correctly', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, {
      type: 'npc_ai_response',
      text: '<action type="give_item" item="sword" amount="1" />'
    } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'npc_behavior_give_item');
    expect(ev?.payload.params.item).toBe('sword');
    expect(ev?.payload.params.amount).toBe('1');
  });
  it('emits npc_ai_speak even when no action tags present', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_response', text: 'Just talking.' } as any);
    expect(ctx.emitted.some((e: any) => e.type === 'npc_ai_speak')).toBe(true);
    expect(ctx.emitted.filter((e: any) => e.type === 'npc_action')).toHaveLength(0);
  });
  it('no action emitted for malformed tag without type attr', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_response', text: '<action foo="bar" />' } as any);
    expect(ctx.emitted.filter((e: any) => e.type === 'npc_action')).toHaveLength(0);
  });
});

describe('npcAIHandler — onEvent: npc_ai_set_goal', () => {
  it('replaces goals array', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_set_goal', goals: ['attack', 'retreat'] } as any);
    expect((node as any).__npcAIState.goals).toEqual(['attack', 'retreat']);
  });
  it('keeps current goals when event.goals missing', () => {
    const { node, ctx, cfg } = attach();
    npcAIHandler.onEvent!(node, cfg, ctx as any, { type: 'npc_ai_set_goal' } as any);
    expect((node as any).__npcAIState.goals).toEqual(['wait_for_interaction']);
  });
});
