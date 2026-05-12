import { describe, it, expect, beforeEach } from 'vitest';
import { vocabularyRegisterHandler, DEFAULT_REGISTERS } from '../VocabularyRegisterTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('VocabularyRegisterTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('vr-1');
    ctx = createMockContext();
  });

  it('ships all 6 default registers', () => {
    expect(DEFAULT_REGISTERS).toHaveLength(6);
    const names = DEFAULT_REGISTERS.map((r) => r.name);
    expect(names).toContain('medieval-fantasy');
    expect(names).toContain('sci-fi-remnant');
    expect(names).toContain('modern-corporate');
    expect(names).toContain('ancient-formal');
    expect(names).toContain('criminal-underworld');
    expect(names).toContain('scholarly-archaic');
  });

  it('emits ready with active register', () => {
    attachTrait(vocabularyRegisterHandler, node, { active_register: 'sci-fi-remnant' }, ctx);
    const ev = getLastEvent(ctx, 'vocabulary_register_ready');
    expect(ev.activeRegister).toBe('sci-fi-remnant');
    expect(ev.available).toContain('modern-corporate');
  });

  it('switches register on event', () => {
    attachTrait(vocabularyRegisterHandler, node, {}, ctx);
    sendEvent(vocabularyRegisterHandler, node, {}, ctx, {
      type: 'vocabulary_switch',
      register: 'ancient-formal',
    });
    expect(getEventCount(ctx, 'vocabulary_switched')).toBe(1);
    const ev = getLastEvent(ctx, 'vocabulary_switched');
    expect(ev.register).toBe('ancient-formal');
  });

  it('fails switch for unknown register (false-case)', () => {
    attachTrait(vocabularyRegisterHandler, node, {}, ctx);
    sendEvent(vocabularyRegisterHandler, node, {}, ctx, {
      type: 'vocabulary_switch',
      register: 'nonexistent',
    });
    expect(getEventCount(ctx, 'vocabulary_switch_failed')).toBe(1);
  });

  it('injects vocabulary payload with tone hint', () => {
    attachTrait(vocabularyRegisterHandler, node, { active_register: 'medieval-fantasy', prepend_tone_hint: true }, ctx);
    sendEvent(vocabularyRegisterHandler, node, { active_register: 'medieval-fantasy', prepend_tone_hint: true }, ctx, {
      type: 'vocabulary_inject',
    });
    const ev = getLastEvent(ctx, 'vocabulary_injected');
    expect(ev.payload).toContain('[Tone]');
    expect(ev.payload).toContain('medieval-fantasy');
  });

  it('loads custom register at runtime', () => {
    attachTrait(vocabularyRegisterHandler, node, {}, ctx);
    sendEvent(vocabularyRegisterHandler, node, {}, ctx, {
      type: 'vocabulary_register_load',
      register: {
        name: 'pirate',
        description: ' nautical jargon',
        toneHint: 'Speak as a freebooter of the high seas.',
        entries: [{ term: 'binnacle', definition: 'The stand for the compass.' }],
      },
    });
    expect(getEventCount(ctx, 'vocabulary_register_loaded')).toBe(1);
    sendEvent(vocabularyRegisterHandler, node, {}, ctx, {
      type: 'vocabulary_switch',
      register: 'pirate',
    });
    expect(getEventCount(ctx, 'vocabulary_switched')).toBe(1);
  });
});
