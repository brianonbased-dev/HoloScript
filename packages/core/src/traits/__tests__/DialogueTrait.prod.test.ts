/**
 * DialogueTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { dialogueHandler } from '../DialogueTrait';

function makeNode() {
  return { id: 'dlg_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}

const SIMPLE_TREE = {
  start: {
    id: 'start',
    text: 'Hello traveller!',
    speaker: 'Guard',
    emotion: 'neutral',
    options: [
      { text: 'Hello!', nextNode: 'greeting' },
      { text: 'Goodbye.', nextNode: undefined },
    ],
  },
  greeting: {
    id: 'greeting',
    text: 'What brings you here?',
    speaker: 'Guard',
    options: [{ text: 'Just passing through.', nextNode: undefined }],
  },
};

const TIMED_TREE = {
  start: {
    id: 'start',
    text: 'Auto-advance line.',
    delay: 2,
    nextNode: 'second',
  },
  second: {
    id: 'second',
    text: 'Second line.',
  },
};

function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...dialogueHandler.defaultConfig!, ...cfg };
  dialogueHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

function startDialogue(node: any, ctx: any, config: any, overrides: any = {}) {
  dialogueHandler.onEvent!(node, config, ctx, { type: 'start_dialogue', ...overrides });
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('dialogueHandler.defaultConfig', () => {
  const d = dialogueHandler.defaultConfig!;
  it('dialogue_tree={}', () => expect(d.dialogue_tree).toEqual({}));
  it('start_node=start', () => expect(d.start_node).toBe('start'));
  it('llm_dynamic=false', () => expect(d.llm_dynamic).toBe(false));
  it('personality=""', () => expect(d.personality).toBe(''));
  it('voice_enabled=false', () => expect(d.voice_enabled).toBe(false));
  it('emotion_aware=true', () => expect(d.emotion_aware).toBe(true));
  it('speaker_name=NPC', () => expect(d.speaker_name).toBe('NPC'));
  it('player_name=Player', () => expect(d.player_name).toBe('Player'));
  it('history_limit=100', () => expect(d.history_limit).toBe(100));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('dialogueHandler.onAttach', () => {
  it('creates __dialogueState', () => expect(attach().node.__dialogueState).toBeDefined());
  it('isActive=false', () => expect(attach().node.__dialogueState.isActive).toBe(false));
  it('currentNodeId=null', () => expect(attach().node.__dialogueState.currentNodeId).toBeNull());
  it('history=[]', () => expect(attach().node.__dialogueState.history).toHaveLength(0));
  it('blackboard={}', () => expect(attach().node.__dialogueState.blackboard).toEqual({}));
  it('awaitingInput=false', () => expect(attach().node.__dialogueState.awaitingInput).toBe(false));
  it('autoAdvanceTimer=0', () => expect(attach().node.__dialogueState.autoAdvanceTimer).toBe(0));
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('dialogueHandler.onDetach', () => {
  it('removes __dialogueState', () => {
    const { node, config, ctx } = attach();
    dialogueHandler.onDetach!(node, config, ctx);
    expect(node.__dialogueState).toBeUndefined();
  });
});

// ─── onEvent — start_dialogue ─────────────────────────────────────────────────

describe('dialogueHandler.onEvent — start_dialogue', () => {
  it('sets isActive=true', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE, start_node: 'start' });
    startDialogue(node, ctx, config);
    expect(node.__dialogueState.isActive).toBe(true);
  });
  it('sets currentNodeId to start_node', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE, start_node: 'start' });
    startDialogue(node, ctx, config);
    expect(node.__dialogueState.currentNodeId).toBe('start');
  });
  it('custom startNode from event overrides config', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE, start_node: 'start' });
    startDialogue(node, ctx, config, { startNode: 'greeting' });
    expect(node.__dialogueState.currentNodeId).toBe('greeting');
  });
  it('clears history on start', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE, start_node: 'start' });
    node.__dialogueState.history.push({ speaker: 'X', text: 'old', timestamp: 0, isPlayer: false });
    startDialogue(node, ctx, config);
    // history gets first NPC line pushed immediately, length=1 not 0
    const hasOld = node.__dialogueState.history.some((h: any) => h.text === 'old');
    expect(hasOld).toBe(false);
  });
  it('copies context into blackboard', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config, { context: { questDone: true } });
    expect(node.__dialogueState.blackboard.questDone).toBe(true);
  });
  it('emits dialogue_started', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    ctx.emit.mockClear();
    startDialogue(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith('dialogue_started', expect.anything());
  });
  it('emits dialogue_line for first node text', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    ctx.emit.mockClear();
    startDialogue(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith(
      'dialogue_line',
      expect.objectContaining({ text: 'Hello traveller!' })
    );
  });
  it('emits dialogue_options when node has options', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    ctx.emit.mockClear();
    startDialogue(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith(
      'dialogue_options',
      expect.objectContaining({ options: expect.any(Array) })
    );
  });
  it('sets awaitingInput=true when node has options', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    expect(node.__dialogueState.awaitingInput).toBe(true);
  });
  it('pushes NPC line to history on enter', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    expect(node.__dialogueState.history[0].text).toBe('Hello traveller!');
    expect(node.__dialogueState.history[0].isPlayer).toBe(false);
  });
  it('speaker defaults to speaker_name when node.speaker not set', () => {
    const tree = { start: { id: 'start', text: 'Hi' } };
    const { node, ctx, config } = attach({ dialogue_tree: tree, speaker_name: 'Wizard' });
    startDialogue(node, ctx, config);
    expect(node.__dialogueState.history[0].speaker).toBe('Wizard');
  });
  it('emits speak when voice_enabled=true', () => {
    const { node, ctx, config } = attach({
      dialogue_tree: SIMPLE_TREE,
      voice_enabled: true,
      voice_id: 'voice1',
    });
    ctx.emit.mockClear();
    startDialogue(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith('speak', expect.objectContaining({ voice_id: 'voice1' }));
  });
  it('no speak when voice_enabled=false', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE, voice_enabled: false });
    ctx.emit.mockClear();
    startDialogue(node, ctx, config);
    expect(ctx.emit).not.toHaveBeenCalledWith('speak', expect.anything());
  });
  it('emits dialogue_action for onEnter action', () => {
    const tree = { start: { id: 'start', text: 'Hi', onEnter: 'unlock_door' } };
    const { node, ctx, config } = attach({ dialogue_tree: tree });
    ctx.emit.mockClear();
    startDialogue(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith(
      'dialogue_action',
      expect.objectContaining({ action: 'unlock_door' })
    );
  });
  it('ends dialogue when start_node not in tree', () => {
    const { node, ctx, config } = attach({ dialogue_tree: {}, start_node: 'missing' });
    ctx.emit.mockClear();
    startDialogue(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith('dialogue_ended', expect.anything());
    expect(node.__dialogueState.isActive).toBe(false);
  });
});

// ─── onEvent — select_option ──────────────────────────────────────────────────

describe('dialogueHandler.onEvent — select_option', () => {
  it('advances to nextNode on selection', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    dialogueHandler.onEvent!(node, config, ctx, { type: 'select_option', index: 0 });
    expect(node.__dialogueState.currentNodeId).toBe('greeting');
  });
  it('records player choice in history', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    dialogueHandler.onEvent!(node, config, ctx, { type: 'select_option', index: 0 });
    const playerEntry = node.__dialogueState.history.find((h: any) => h.isPlayer);
    expect(playerEntry?.text).toBe('Hello!');
  });
  it('ends dialogue when option has no nextNode', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    ctx.emit.mockClear();
    dialogueHandler.onEvent!(node, config, ctx, { type: 'select_option', index: 1 }); // Goodbye
    expect(ctx.emit).toHaveBeenCalledWith('dialogue_ended', expect.anything());
  });
  it('ignored when not awaitingInput', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    node.__dialogueState.awaitingInput = false;
    const nodeBefore = node.__dialogueState.currentNodeId;
    dialogueHandler.onEvent!(node, config, ctx, { type: 'select_option', index: 0 });
    expect(node.__dialogueState.currentNodeId).toBe(nodeBefore);
  });
  it('ignored when out-of-bounds option index', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    const nodeBefore = node.__dialogueState.currentNodeId;
    dialogueHandler.onEvent!(node, config, ctx, { type: 'select_option', index: 99 });
    expect(node.__dialogueState.currentNodeId).toBe(nodeBefore);
  });
  it('emits dialogue_action when option has action', () => {
    const tree = {
      start: {
        id: 'start',
        text: 'Hi',
        options: [
          { text: 'Take key', action: 'give_key', nextNode: undefined as unknown as string },
        ],
      },
    };
    const { node, ctx, config } = attach({ dialogue_tree: tree });
    startDialogue(node, ctx, config);
    ctx.emit.mockClear();
    dialogueHandler.onEvent!(node, config, ctx, { type: 'select_option', index: 0 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'dialogue_action',
      expect.objectContaining({ action: 'give_key' })
    );
  });
  it('emits dialogue_action for onExit when advancing', () => {
    const tree = {
      start: {
        id: 'start',
        text: 'Hi',
        onExit: 'close_gate',
        options: [{ text: 'Go', nextNode: 'next' }],
      },
      next: { id: 'next', text: 'Bye' },
    };
    const { node, ctx, config } = attach({ dialogue_tree: tree });
    startDialogue(node, ctx, config);
    ctx.emit.mockClear();
    dialogueHandler.onEvent!(node, config, ctx, { type: 'select_option', index: 0 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'dialogue_action',
      expect.objectContaining({ action: 'close_gate' })
    );
  });
  it('filters options by condition (blackboard key=false explicitly → hidden)', () => {
    const tree = {
      start: {
        id: 'start',
        text: 'Hi',
        options: [
          // Condition: show only if !locked (i.e. locked=false/undefined → !false = true shown; locked=true → hidden)
          { text: 'Secret option', condition: '!locked', nextNode: 'next' },
          { text: 'Normal option', nextNode: 'next' },
        ],
      },
      next: { id: 'next', text: 'Bye' },
    };
    const { node, ctx, config } = attach({ dialogue_tree: tree });
    // With locked=true in blackboard, '!locked' → !true = false → option hidden
    startDialogue(node, ctx, config, { context: { locked: true } });
    const optionsCall = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'dialogue_options')!;
    expect(optionsCall[1].options).toHaveLength(1); // only Normal option visible
  });
  it('shows option with truthy blackboard condition', () => {
    const tree = {
      start: {
        id: 'start',
        text: 'Hi',
        options: [{ text: 'Special', condition: 'hasKey', nextNode: 'next' }],
      },
      next: { id: 'next', text: 'Bye' },
    };
    const { node, ctx, config } = attach({ dialogue_tree: tree });
    startDialogue(node, ctx, config, { context: { hasKey: true } });
    const optionsCall = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'dialogue_options')!;
    expect(optionsCall[1].options).toHaveLength(1);
  });
});

// ─── onEvent — inject_text ────────────────────────────────────────────────────

describe('dialogueHandler.onEvent — inject_text', () => {
  it('adds to history', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    const histBefore = node.__dialogueState.history.length;
    dialogueHandler.onEvent!(node, config, ctx, {
      type: 'inject_text',
      text: 'Dynamic!',
      speaker: 'AI',
    });
    expect(node.__dialogueState.history.length).toBe(histBefore + 1);
  });
  it('emits dialogue_line', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    ctx.emit.mockClear();
    dialogueHandler.onEvent!(node, config, ctx, {
      type: 'inject_text',
      text: 'LLM reply',
      emotion: 'happy',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'dialogue_line',
      expect.objectContaining({ text: 'LLM reply', emotion: 'happy' })
    );
  });
  it('defaults speaker to speaker_name', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE, speaker_name: 'Mage' });
    startDialogue(node, ctx, config);
    dialogueHandler.onEvent!(node, config, ctx, {
      type: 'inject_text',
      text: 'Spell!',
      speaker: undefined,
    });
    const last = node.__dialogueState.history[node.__dialogueState.history.length - 1];
    expect(last.speaker).toBe('Mage');
  });
});

// ─── onEvent — set_dialogue_var / end_dialogue ────────────────────────────────

describe('dialogueHandler.onEvent — set_dialogue_var', () => {
  it('sets key in blackboard', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    dialogueHandler.onEvent!(node, config, ctx, {
      type: 'set_dialogue_var',
      key: 'completed',
      value: true,
    });
    expect(node.__dialogueState.blackboard.completed).toBe(true);
  });
  it('overwrites existing variable', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config, { context: { score: 5 } });
    dialogueHandler.onEvent!(node, config, ctx, {
      type: 'set_dialogue_var',
      key: 'score',
      value: 99,
    });
    expect(node.__dialogueState.blackboard.score).toBe(99);
  });
});

describe('dialogueHandler.onEvent — end_dialogue', () => {
  it('sets isActive=false', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    dialogueHandler.onEvent!(node, config, ctx, { type: 'end_dialogue' });
    expect(node.__dialogueState.isActive).toBe(false);
  });
  it('sets currentNodeId=null', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    dialogueHandler.onEvent!(node, config, ctx, { type: 'end_dialogue' });
    expect(node.__dialogueState.currentNodeId).toBeNull();
  });
  it('emits dialogue_ended with history', () => {
    const { node, ctx, config } = attach({ dialogue_tree: SIMPLE_TREE });
    startDialogue(node, ctx, config);
    ctx.emit.mockClear();
    dialogueHandler.onEvent!(node, config, ctx, { type: 'end_dialogue' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'dialogue_ended',
      expect.objectContaining({ history: expect.any(Array) })
    );
  });
});

// ─── onUpdate — auto-advance timer ───────────────────────────────────────────

describe('dialogueHandler.onUpdate — auto-advance', () => {
  it('accumulates autoAdvanceTimer', () => {
    const { node, ctx, config } = attach({ dialogue_tree: TIMED_TREE });
    startDialogue(node, ctx, config);
    node.__dialogueState.awaitingInput = false;
    dialogueHandler.onUpdate!(node, config, ctx, 1);
    expect(node.__dialogueState.autoAdvanceTimer).toBe(1);
  });
  it('advances to next node after delay elapsed', () => {
    const { node, ctx, config } = attach({ dialogue_tree: TIMED_TREE });
    startDialogue(node, ctx, config);
    node.__dialogueState.awaitingInput = false;
    dialogueHandler.onUpdate!(node, config, ctx, 3); // > 2s delay
    expect(node.__dialogueState.currentNodeId).toBe('second');
  });
  it('ends dialogue when auto-advance node has no nextNode', () => {
    const tree = {
      start: { id: 'start', text: 'Last.', delay: 1 },
    };
    const { node, ctx, config } = attach({ dialogue_tree: tree });
    startDialogue(node, ctx, config);
    node.__dialogueState.awaitingInput = false;
    ctx.emit.mockClear();
    dialogueHandler.onUpdate!(node, config, ctx, 2);
    expect(ctx.emit).toHaveBeenCalledWith('dialogue_ended', expect.anything());
  });
  it('does not auto-advance when awaitingInput=true', () => {
    const { node, ctx, config } = attach({ dialogue_tree: TIMED_TREE });
    startDialogue(node, ctx, config);
    node.__dialogueState.awaitingInput = true;
    dialogueHandler.onUpdate!(node, config, ctx, 5);
    expect(node.__dialogueState.currentNodeId).toBe('start');
  });
  it('does not update when isActive=false', () => {
    const { node, ctx, config } = attach({ dialogue_tree: TIMED_TREE });
    // Don't start dialogue
    dialogueHandler.onUpdate!(node, config, ctx, 5);
    expect(node.__dialogueState.autoAdvanceTimer).toBe(0);
  });
});
