/**
 * ModerationTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { moderationHandler } from '../ModerationTrait';

const makeNode = () => ({
  id: 'n1', traits: new Set<string>(), emit: vi.fn(),
  __moderationState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = {
  sensitivity: 'medium' as const,
  categories: ['harassment', 'hate_speech'],
  action: 'warn' as const,
  moderate_text: true,
  moderate_voice: false,
  moderate_objects: true,
  escalation_threshold: 3,
  cooldown_seconds: 30,
};

describe('ModerationTrait', () => {
  it('has name "moderation"', () => {
    expect(moderationHandler.name).toBe('moderation');
  });

  it('defaultConfig sensitivity="medium"', () => {
    expect(moderationHandler.defaultConfig?.sensitivity).toBe('medium');
  });

  it('onAttach emits moderation_create', () => {
    const node = makeNode();
    moderationHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('moderation_create', expect.objectContaining({
      sensitivity: 'medium',
    }));
  });

  it('moderation_check emits moderation_analyze', () => {
    const node = makeNode();
    moderationHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    moderationHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'moderation_check', userId: 'u1', content: 'hello world', contentType: 'text',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('moderation_analyze', expect.objectContaining({
      userId: 'u1',
    }));
  });
});
