import { describe, it, expect, vi } from 'vitest';
import { npcAIHandler } from '../traits/NPCAITrait';

describe('Multi-Agent Interaction Test', () => {
  it('should allow multiple NPCs to parse actions independently', () => {
    // NPC 1: "Alice"
    const aliceNode = { id: 'alice', properties: {} };
    const aliceContext = { emit: vi.fn() } as any;
    npcAIHandler.onAttach!(aliceNode as any, npcAIHandler.defaultConfig, aliceContext);

    // NPC 2: "Bob"
    const bobNode = { id: 'bob', properties: {} };
    const bobContext = { emit: vi.fn() } as any;
    npcAIHandler.onAttach!(bobNode as any, npcAIHandler.defaultConfig, bobContext);

    // Alice responds with a move action
    npcAIHandler.onEvent!(aliceNode as any, npcAIHandler.defaultConfig, aliceContext, {
      type: 'npc_ai_response',
      text: 'Hello Bob! <action type="move" x="1" />',
    });

    // Bob responds with a pulse action
    npcAIHandler.onEvent!(bobNode as any, npcAIHandler.defaultConfig, bobContext, {
      type: 'npc_ai_response',
      text: 'Hi Alice! <action type="pulse" color="red" />',
    });

    // Verify Alice's move
    expect(aliceContext.emit).toHaveBeenCalledWith(
      'npc_behavior_move',
      expect.objectContaining({
        node: expect.objectContaining({ id: 'alice' }),
        params: { x: '1' },
      })
    );

    // Verify Bob's pulse
    expect(bobContext.emit).toHaveBeenCalledWith(
      'npc_behavior_pulse',
      expect.objectContaining({
        node: expect.objectContaining({ id: 'bob' }),
        params: { color: 'red' },
      })
    );

    // Cross-verify: Alice should NOT have Bob's pulse
    const aliceCalls = aliceContext.emit.mock.calls.map((c) => c[0]);
    expect(aliceCalls).not.toContain('npc_behavior_pulse');

    // Cross-verify: Bob should NOT have Alice's move
    const bobCalls = bobContext.emit.mock.calls.map((c) => c[0]);
    expect(bobCalls).not.toContain('npc_behavior_move');
  });
});

