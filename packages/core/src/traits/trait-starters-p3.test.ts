import { describe, it, expect, beforeEach } from 'vitest';
import { moodHandler } from './MoodTrait';
import { persistentHandler } from './PersistentTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './__tests__/traitTestHelpers';

interface MoodEventPayload {
  mood: string;
  intensity: number;
}

interface PersistentEventPayload {
  key: string;
  value: unknown;
  backend?: string;
}

describe('P3 Board Starters - Mood + Persistent Traits (task_1779183224900_z051)', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('p3-trait-node');
    ctx = createMockContext();
  });

  describe('MoodTrait (emotion-mood gap filler)', () => {
    it('should attach with default calm mood and emit', () => {
      attachTrait(moodHandler, node, {}, ctx);

      expect(getEventCount(ctx, 'mood_attached')).toBe(1);
      const data = getLastEvent(ctx, 'mood_attached') as MoodEventPayload | undefined;
      expect(data?.mood).toBe('calm');
      expect(data?.intensity).toBeGreaterThan(0.5);
      const state = node.__moodState as { current: string } | undefined;
      expect(state?.current).toBe('calm');
    });

    it('should handle set_mood event and emit change', () => {
      attachTrait(moodHandler, node, { initial: 'serene' }, ctx);
      sendEvent(
        moodHandler,
        node,
        {},
        ctx,
        { type: 'set_mood', mood: 'excited', intensity: 0.95 }
      );

      const change = getLastEvent(ctx, 'mood_changed') as MoodEventPayload | undefined;
      expect(change?.mood).toBe('excited');
      const state = node.__moodState as { current: string } | undefined;
      expect(state?.current).toBe('excited');
    });

    it('should decay intensity on update', () => {
      attachTrait(moodHandler, node, { initial: 'happy', intensity: 0.9 }, ctx);
      updateTrait(moodHandler, node, {}, ctx, 100);
      updateTrait(moodHandler, node, {}, ctx, 100);

      const state = node.__moodState as { intensity: number } | undefined;
      expect(state?.intensity).toBeLessThan(0.9);
    });
  });

  describe('PersistentTrait (state-persistence gap filler)', () => {
    it('should attach, store default, and emit', () => {
      attachTrait(persistentHandler, node, { key: 'p3-test-key', defaultValue: { foo: 42 } }, ctx);

      expect(getEventCount(ctx, 'persistent_attached')).toBe(1);
      const data = getLastEvent(ctx, 'persistent_attached') as PersistentEventPayload | undefined;
      expect(data?.key).toBe('p3-test-key');
      expect(data?.value).toEqual({ foo: 42 });
    });

    it('should support persistent_set event and update', () => {
      attachTrait(persistentHandler, node, { key: 'p3-test-key' }, ctx);
      sendEvent(
        persistentHandler,
        node,
        {},
        ctx,
        { type: 'persistent_set', key: 'p3-test-key', value: 'persisted!' }
      );

      const updated = getLastEvent(ctx, 'persistent_updated') as PersistentEventPayload | undefined;
      expect(updated?.value).toBe('persisted!');
    });

    it('should support file backend for durable restart (simulated)', () => {
      // First "process"
      const node1 = createMockNode('file-persist-node');
      const ctx1 = createMockContext();
      attachTrait(persistentHandler, node1, { key: 'durable-test', defaultValue: { version: 7 }, backend: 'file' }, ctx1);

      sendEvent(
        persistentHandler,
        node1,
        {},
        ctx1,
        { type: 'persistent_set', key: 'durable-test', value: { version: 42, savedAt: 'now' } }
      );

      // Simulate restart: new node + re-attach with same key + file backend
      const node2 = createMockNode('file-persist-node-restart');
      const ctx2 = createMockContext();
      attachTrait(persistentHandler, node2, { key: 'durable-test', backend: 'file' }, ctx2);

      const attached = getLastEvent(ctx2, 'persistent_attached') as PersistentEventPayload | undefined;
      expect(attached?.backend).toBe('file');
      // The value written in "first process" should be visible after "restart"
      expect((attached?.value as any)?.version).toBe(42);
    });
  });
});
