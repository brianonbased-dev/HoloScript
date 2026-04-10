import { describe, it, expect, beforeEach } from 'vitest';
import { dialogueHandler } from '../DialogueTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('DialogueTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    dialogue_tree: {
      start: {
        id: 'start',
        speaker: 'Guard',
        text: 'Halt! Who goes there?',
        emotion: 'suspicious',
        options: [
          { text: 'A friend.', nextNode: 'friend' },
          { text: 'None of your business.', nextNode: 'hostile', condition: 'brave' },
        ],
      },
      friend: {
        id: 'friend',
        speaker: 'Guard',
        text: 'Welcome, friend.',
        onEnter: 'open_gate',
      },
      hostile: {
        id: 'hostile',
        speaker: 'Guard',
        text: 'Then you shall not pass!',
      },
      timed: {
        id: 'timed',
        speaker: 'NPC',
        text: 'Wait for it...',
        delay: 1,
        nextNode: 'friend',
      },
    } as any,
    start_node: 'start',
    llm_dynamic: false,
    personality: '',
    knowledge_base: '',
    voice_enabled: false,
    voice_id: '',
    emotion_aware: true,
    speaker_name: 'NPC',
    player_name: 'Player',
    history_limit: 100,
  };

  beforeEach(() => {
    node = createMockNode('dlg');
    ctx = createMockContext();
    attachTrait(dialogueHandler, node, cfg, ctx);
  });

  it('initializes inactive', () => {
    const s = (node as any).__dialogueState;
    expect(s.isActive).toBe(false);
    expect(s.currentNodeId).toBeNull();
  });

  it('start_dialogue activates and enters start node', () => {
    sendEvent(dialogueHandler, node, cfg, ctx, { type: 'start_dialogue' });
    expect((node as any).__dialogueState.isActive).toBe(true);
    expect(getEventCount(ctx, 'dialogue_started')).toBe(1);
    expect(getEventCount(ctx, 'dialogue_line')).toBe(1);
    const line = getLastEvent(ctx, 'dialogue_line') as any;
    expect(line.text).toBe('Halt! Who goes there?');
  });

  it('presents filtered options (brave explicitly false)', () => {
    sendEvent(dialogueHandler, node, cfg, ctx, {
      type: 'start_dialogue',
      context: { brave: false },
    });
    const opts = getLastEvent(ctx, 'dialogue_options') as any;
    expect(opts.options).toHaveLength(1);
    expect(opts.options[0].text).toBe('A friend.');
  });

  it('shows conditional option when blackboard has key', () => {
    sendEvent(dialogueHandler, node, cfg, ctx, {
      type: 'start_dialogue',
      context: { brave: true },
    });
    const opts = getLastEvent(ctx, 'dialogue_options') as any;
    expect(opts.options).toHaveLength(2);
  });

  it('select_option advances to next node', () => {
    sendEvent(dialogueHandler, node, cfg, ctx, { type: 'start_dialogue' });
    sendEvent(dialogueHandler, node, cfg, ctx, { type: 'select_option', index: 0 });
    const line = getLastEvent(ctx, 'dialogue_line') as any;
    expect(line.text).toBe('Welcome, friend.');
    expect(getEventCount(ctx, 'dialogue_action')).toBe(1);
  });

  it('end_dialogue deactivates', () => {
    sendEvent(dialogueHandler, node, cfg, ctx, { type: 'start_dialogue' });
    sendEvent(dialogueHandler, node, cfg, ctx, { type: 'end_dialogue' });
    expect((node as any).__dialogueState.isActive).toBe(false);
    expect(getEventCount(ctx, 'dialogue_ended')).toBe(1);
  });

  it('inject_text adds to history', () => {
    sendEvent(dialogueHandler, node, cfg, ctx, { type: 'start_dialogue' });
    sendEvent(dialogueHandler, node, cfg, ctx, {
      type: 'inject_text',
      text: 'Dynamic line',
      speaker: 'AI',
    });
    expect(getEventCount(ctx, 'dialogue_line')).toBe(2);
  });

  it('set_dialogue_var updates blackboard', () => {
    sendEvent(dialogueHandler, node, cfg, ctx, { type: 'start_dialogue' });
    sendEvent(dialogueHandler, node, cfg, ctx, {
      type: 'set_dialogue_var',
      key: 'gold',
      value: 100,
    });
    expect((node as any).__dialogueState.blackboard.gold).toBe(100);
  });

  it('auto-advance via delay on update', () => {
    const timedCfg = { ...cfg, start_node: 'timed' };
    const n2 = createMockNode('t2');
    const c2 = createMockContext();
    attachTrait(dialogueHandler, n2, timedCfg, c2);
    sendEvent(dialogueHandler, n2, timedCfg, c2, { type: 'start_dialogue' });
    // First dialogue_line from entering 'timed' node
    expect(getEventCount(c2, 'dialogue_line')).toBe(1);
    updateTrait(dialogueHandler, n2, timedCfg, c2, 1.5);
    // Should have advanced to 'friend' node, second dialogue_line
    expect(getEventCount(c2, 'dialogue_line')).toBeGreaterThanOrEqual(2);
  });

  it('detach cleans up state', () => {
    dialogueHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__dialogueState).toBeUndefined();
  });
});
