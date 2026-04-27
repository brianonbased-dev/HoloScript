import { describe, it, expect, vi } from 'vitest';
import {
  executeNarrative,
  executeQuest,
  executeDialogue,
} from '../narrative-executors.js';
import type { NarrativeContext } from '../narrative-executors.js';
import type { NarrativeNode, QuestNode, DialogueNode } from '../../types.js';

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeCtx(): NarrativeContext {
  return {
    quests: new Map(),
    setActiveQuestId: vi.fn(),
    setDialogueState: vi.fn(),
  };
}

function makeQuest(id: string): QuestNode {
  return {
    type: 'quest',
    id,
    title: `Quest ${id}`,
    description: '',
    objectives: [],
    rewards: [],
  } as unknown as QuestNode;
}

describe('executeNarrative', () => {
  it('registers all quests in ctx.quests', async () => {
    const ctx = makeCtx();
    const q1 = makeQuest('q1');
    const q2 = makeQuest('q2');
    const node: NarrativeNode = {
      type: 'narrative',
      id: 'n1',
      quests: [q1, q2],
    } as unknown as NarrativeNode;
    const result = await executeNarrative(node, ctx);
    expect(ctx.quests.get('q1')).toBe(q1);
    expect(ctx.quests.get('q2')).toBe(q2);
    expect(result.success).toBe(true);
  });

  it('returns count of quests in output', async () => {
    const ctx = makeCtx();
    const node: NarrativeNode = {
      type: 'narrative',
      id: 'n1',
      quests: [makeQuest('a'), makeQuest('b'), makeQuest('c')],
    } as unknown as NarrativeNode;
    const result = await executeNarrative(node, ctx);
    expect(String(result.output)).toContain('3');
  });

  it('works with no quests', async () => {
    const ctx = makeCtx();
    const node: NarrativeNode = {
      type: 'narrative',
      id: 'n0',
      quests: [],
    } as unknown as NarrativeNode;
    const result = await executeNarrative(node, ctx);
    expect(result.success).toBe(true);
    expect(ctx.quests.size).toBe(0);
  });

  it('includes executionTime', async () => {
    const ctx = makeCtx();
    const node: NarrativeNode = { type: 'narrative', id: 'x', quests: [] } as unknown as NarrativeNode;
    const result = await executeNarrative(node, ctx);
    expect(typeof result.executionTime).toBe('number');
  });
});

describe('executeQuest', () => {
  it('sets active quest id', async () => {
    const ctx = makeCtx();
    const q = makeQuest('q42');
    const result = await executeQuest(q, ctx);
    expect(ctx.setActiveQuestId).toHaveBeenCalledWith('q42');
    expect(result.success).toBe(true);
  });

  it('registers quest in quests map', async () => {
    const ctx = makeCtx();
    const q = makeQuest('qX');
    await executeQuest(q, ctx);
    expect(ctx.quests.get('qX')).toBe(q);
  });

  it('output mentions quest id', async () => {
    const ctx = makeCtx();
    const q = makeQuest('q99');
    const result = await executeQuest(q, ctx);
    expect(String(result.output)).toContain('q99');
  });

  it('includes executionTime', async () => {
    const ctx = makeCtx();
    const q = makeQuest('q1');
    const result = await executeQuest(q, ctx);
    expect(typeof result.executionTime).toBe('number');
  });
});

describe('executeDialogue', () => {
  it('sets dialogue state with currentNodeId and speaker', async () => {
    const ctx = makeCtx();
    const node: DialogueNode = {
      type: 'dialogue',
      id: 'd1',
      speaker: 'Hero',
      text: 'Hello',
    } as unknown as DialogueNode;
    const result = await executeDialogue(node, ctx);
    expect(ctx.setDialogueState).toHaveBeenCalledWith({ currentNodeId: 'd1', speaker: 'Hero' });
    expect(result.success).toBe(true);
  });

  it('output mentions node id', async () => {
    const ctx = makeCtx();
    const node: DialogueNode = {
      type: 'dialogue',
      id: 'dlg5',
      speaker: 'NPC',
      text: 'Hi',
    } as unknown as DialogueNode;
    const result = await executeDialogue(node, ctx);
    expect(String(result.output)).toContain('dlg5');
  });

  it('includes executionTime', async () => {
    const ctx = makeCtx();
    const node: DialogueNode = { type: 'dialogue', id: 'd', speaker: 'S', text: 'T' } as unknown as DialogueNode;
    const result = await executeDialogue(node, ctx);
    expect(typeof result.executionTime).toBe('number');
  });
});
