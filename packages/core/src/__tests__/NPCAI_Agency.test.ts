import { describe, it, expect, vi } from 'vitest';
import { npcAIHandler } from '../traits/NPCAITrait';

describe('NPC Behavior Synthesis (Phase 12.1)', () => {
  it('should parse <action /> tags and emit behavior events', () => {
    const mockNode = { properties: {} };
    const mockConfig = npcAIHandler.defaultConfig;
    const mockContext = { emit: vi.fn() } as any;

    npcAIHandler.onAttach!(mockNode as any, mockConfig, mockContext);

    const responseText =
      'I am moving now. <action type="move" x="10" y="2" /> and pulsing. <action type="pulse" color="blue" />';

    // Simulate AI response event
    npcAIHandler.onEvent!(mockNode as any, mockConfig, mockContext, {
      type: 'npc_ai_response',
      text: responseText,
    });

    // Check behavior events
    expect(mockContext.emit).toHaveBeenCalledWith(
      'npc_behavior_move',
      expect.objectContaining({
        params: { x: '10', y: '2' },
      })
    );

    expect(mockContext.emit).toHaveBeenCalledWith(
      'npc_behavior_pulse',
      expect.objectContaining({
        params: { color: 'blue' },
      })
    );

    // Check generic action events
    expect(mockContext.emit).toHaveBeenCalledWith(
      'npc_action',
      expect.objectContaining({
        type: 'move',
        params: { x: '10', y: '2' },
      })
    );
  });

  it('should handle responses without actions gracefully', () => {
    const mockNode = { properties: {} };
    const mockConfig = npcAIHandler.defaultConfig;
    const mockContext = { emit: vi.fn() } as any;

    npcAIHandler.onAttach!(mockNode as any, mockConfig, mockContext);

    npcAIHandler.onEvent!(mockNode as any, mockConfig, mockContext, {
      type: 'npc_ai_response',
      text: 'Just a normal chat.',
    });

    expect(mockContext.emit).not.toHaveBeenCalledWith('npc_action', expect.anything());
    expect(mockContext.emit).toHaveBeenCalledWith('npc_ai_speak', expect.anything());
  });
});
