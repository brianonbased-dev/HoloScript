/**
 * Unit tests for narrative-executors — AUDIT-mode coverage
 *
 * Slice 15 executors. Each dispatches a small state mutation +
 * success-envelope response. State-mutator-closure pattern — the
 * first test suite for that pattern variant.
 *
 * **See**: packages/core/src/runtime/narrative-executors.ts (slice 15)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeNarrative,
  executeQuest,
  executeDialogue,
  type NarrativeContext,
} from './narrative-executors';
import type { DialogueNode, NarrativeNode, QuestNode } from '../types';

function makeCtx(): {
  ctx: NarrativeContext;
  quests: Map<string, QuestNode>;
  activeQuestId: string | undefined;
  dialogueState: { currentNodeId: string; speaker: string } | undefined;
} {
  const quests = new Map<string, QuestNode>();
  const state = {
    activeQuestId: undefined as string | undefined,
    dialogueState: undefined as { currentNodeId: string; speaker: string } | undefined,
  };
  const ctx: NarrativeContext = {
    quests,
    setActiveQuestId: (id) => { state.activeQuestId = id; },
    setDialogueState: (s) => { state.dialogueState = s; },
  };
  return {
    ctx,
    quests,
    get activeQuestId() { return state.activeQuestId; },
    get dialogueState() { return state.dialogueState; },
  } as never;
}

describe('executeNarrative', () => {
  it('registers all quests in the narrative', async () => {
    const { ctx, quests } = makeCtx();
    const q1 = { id: 'q1', title: 'First' } as QuestNode;
    const q2 = { id: 'q2', title: 'Second' } as QuestNode;
    const node: NarrativeNode = { type: 'narrative', id: 'tale-1', quests: [q1, q2] } as NarrativeNode;

    const result = await executeNarrative(node, ctx);

    expect(result.success).toBe(true);
    expect(quests.size).toBe(2);
    expect(quests.get('q1')).toBe(q1);
    expect(quests.get('q2')).toBe(q2);
  });

  it('output includes narrative id and quest count', async () => {
    const { ctx } = makeCtx();
    const node: NarrativeNode = { type: 'narrative', id: 'tale', quests: [{ id: 'q' } as QuestNode] } as NarrativeNode;
    const result = await executeNarrative(node, ctx);
    expect(result.output).toBe('Narrative tale initialized with 1 quests');
  });

  it('empty quest list still succeeds', async () => {
    const { ctx, quests } = makeCtx();
    const node: NarrativeNode = { type: 'narrative', id: 't', quests: [] } as NarrativeNode;
    const result = await executeNarrative(node, ctx);
    expect(result.success).toBe(true);
    expect(quests.size).toBe(0);
  });

  it('executionTime is recorded', async () => {
    const { ctx } = makeCtx();
    const node: NarrativeNode = { type: 'narrative', id: 't', quests: [] } as NarrativeNode;
    const result = await executeNarrative(node, ctx);
    expect(typeof result.executionTime).toBe('number');
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
  });

  it('does NOT touch activeQuestId or dialogueState', async () => {
    const wrap = makeCtx() as never as { ctx: NarrativeContext; activeQuestId: unknown; dialogueState: unknown };
    const node: NarrativeNode = { type: 'narrative', id: 't', quests: [{ id: 'q' } as QuestNode] } as NarrativeNode;
    await executeNarrative(node, wrap.ctx);
    expect(wrap.activeQuestId).toBeUndefined();
    expect(wrap.dialogueState).toBeUndefined();
  });
});

describe('executeQuest', () => {
  it('sets active quest id', async () => {
    const setActiveQuestId = vi.fn();
    const ctx: NarrativeContext = {
      quests: new Map(),
      setActiveQuestId,
      setDialogueState: vi.fn(),
    };
    const node: QuestNode = { id: 'q42', title: 'Epic' } as QuestNode;
    await executeQuest(node, ctx);
    expect(setActiveQuestId).toHaveBeenCalledWith('q42');
  });

  it('registers the quest in the quests map', async () => {
    const { ctx, quests } = makeCtx();
    const node: QuestNode = { id: 'q42', title: 'Epic' } as QuestNode;
    await executeQuest(node, ctx);
    expect(quests.get('q42')).toBe(node);
  });

  it('output includes quest id', async () => {
    const { ctx } = makeCtx();
    const node: QuestNode = { id: 'main', title: 'T' } as QuestNode;
    const result = await executeQuest(node, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Quest main started');
  });

  it('preserves existing quest registrations', async () => {
    const { ctx, quests } = makeCtx();
    const existing = { id: 'other', title: 'Other' } as QuestNode;
    quests.set('other', existing);

    const node: QuestNode = { id: 'new', title: 'New' } as QuestNode;
    await executeQuest(node, ctx);

    expect(quests.get('other')).toBe(existing);
    expect(quests.get('new')).toBe(node);
    expect(quests.size).toBe(2);
  });
});

describe('executeDialogue', () => {
  it('writes dialogue state with currentNodeId + speaker', async () => {
    const setDialogueState = vi.fn();
    const ctx: NarrativeContext = {
      quests: new Map(),
      setActiveQuestId: vi.fn(),
      setDialogueState,
    };
    const node: DialogueNode = { id: 'd1', speaker: 'Alice', text: 'Hello' } as DialogueNode;
    await executeDialogue(node, ctx);
    expect(setDialogueState).toHaveBeenCalledWith({ currentNodeId: 'd1', speaker: 'Alice' });
  });

  it('output references the dialogue node id', async () => {
    const { ctx } = makeCtx();
    const node: DialogueNode = { id: 'intro', speaker: 'S', text: 'T' } as DialogueNode;
    const result = await executeDialogue(node, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Dialogue node intro executed');
  });

  it('does NOT touch quests registry', async () => {
    const { ctx, quests } = makeCtx();
    const node: DialogueNode = { id: 'x', speaker: 'X', text: 'y' } as DialogueNode;
    await executeDialogue(node, ctx);
    expect(quests.size).toBe(0);
  });
});
