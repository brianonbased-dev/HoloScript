import { describe, it, expect } from 'vitest';
import { DialogueRunner, type DialogueNode } from '@holoscript/engine/dialogue';
import { EmotionSystem } from '@holoscript/engine/dialogue';
import { BarkManager } from '@holoscript/engine/dialogue';

describe('Cycle 162: Dialogue Extensions', () => {
  // -------------------------------------------------------------------------
  // DialogueRunner
  // -------------------------------------------------------------------------

  it('should traverse nodes and substitute variables', () => {
    const runner = new DialogueRunner();
    runner.loadNodes([
      { id: 'n1', type: 'text', speaker: 'NPC', text: 'Hello {player}!', nextId: 'n2' },
      { id: 'n2', type: 'text', speaker: 'NPC', text: 'Goodbye!' },
    ]);
    runner.setVariable('player', 'Alice');

    const first = runner.start('n1')!;
    expect(runner.resolveText(first.text!)).toBe('Hello Alice!');

    const second = runner.advance()!;
    expect(second.text).toBe('Goodbye!');
  });

  it('should follow conditional branches', () => {
    const runner = new DialogueRunner();
    runner.loadNodes([
      { id: 'b1', type: 'branch', condition: 'hasKey', trueNextId: 'yes', falseNextId: 'no' },
      { id: 'yes', type: 'text', text: 'Door opens!' },
      { id: 'no', type: 'text', text: 'Locked.' },
    ]);

    runner.setVariable('hasKey', false);
    const result = runner.start('b1')!;
    expect(result.text).toBe('Locked.');
  });

  // -------------------------------------------------------------------------
  // EmotionSystem
  // -------------------------------------------------------------------------

  it('should track emotions with decay', () => {
    const emo = new EmotionSystem();
    emo.setEmotion('npc1', 'anger', 0.8, 0.5);

    expect(emo.getDominantEmotion('npc1')).toBe('anger');

    emo.update(1); // Decay 0.5/s → 0.8 - 0.5 = 0.3
    expect(emo.getEmotion('npc1', 'anger')).toBeCloseTo(0.3);
  });

  it('should track relationships', () => {
    const emo = new EmotionSystem();
    emo.setRelationship('npc1', 'player', 0.5);
    emo.modifyRelationship('npc1', 'player', -0.3);

    expect(emo.getRelationship('npc1', 'player')).toBeCloseTo(0.2);
  });

  // -------------------------------------------------------------------------
  // BarkManager
  // -------------------------------------------------------------------------

  it('should trigger contextual barks with cooldowns', () => {
    const barks = new BarkManager();
    barks.registerBark({
      id: 'combat_taunt',
      context: 'combat',
      lines: ['Ha!', 'Take that!'],
      priority: 5,
      cooldown: 2,
      maxRange: 0,
    });

    barks.tick(0);
    const bark1 = barks.trigger('combat', 'warrior');
    expect(bark1).not.toBeNull();

    // On cooldown
    barks.tick(1);
    const bark2 = barks.trigger('combat', 'warrior');
    expect(bark2).toBeNull();

    // Cooldown expired
    barks.tick(3);
    const bark3 = barks.trigger('combat', 'warrior');
    expect(bark3).not.toBeNull();
  });
});
