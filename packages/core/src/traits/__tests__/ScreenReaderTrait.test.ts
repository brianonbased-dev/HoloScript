import { describe, it, expect, beforeEach } from 'vitest';
import { screenReaderHandler } from '../ScreenReaderTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('ScreenReaderTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    semantic_structure: true,
    navigation_order: 0,
    announce_changes: true,
    reading_mode: 'spatial' as const,
    sonify_position: true,
    distance_scaling: true,
    pitch_for_height: true,
    pan_for_position: true,
    verbosity: 'normal' as const,
  };

  beforeEach(() => {
    node = createMockNode('sr');
    (node as any).name = 'TestButton';
    (node as any).type = 'button';
    node.position = { x: 1, y: 2, z: 3 };
    ctx = createMockContext();
    attachTrait(screenReaderHandler, node, cfg, ctx);
  });

  it('initializes and registers', () => {
    expect((node as any).__screenReaderState.isFocused).toBe(false);
    expect(getEventCount(ctx, 'screen_reader_register')).toBe(1);
  });

  it('focus announces with spatial info', () => {
    sendEvent(screenReaderHandler, node, cfg, ctx, { type: 'screen_reader_focus' });
    expect((node as any).__screenReaderState.isFocused).toBe(true);
    const ev = getLastEvent(ctx, 'screen_reader_announce') as any;
    expect(ev.message).toContain('TestButton');
    expect(ev.message).toContain('Position');
    expect(ev.interrupt).toBe(true);
    expect(getEventCount(ctx, 'screen_reader_sonify')).toBe(1);
  });

  it('blur clears focus', () => {
    sendEvent(screenReaderHandler, node, cfg, ctx, { type: 'screen_reader_focus' });
    sendEvent(screenReaderHandler, node, cfg, ctx, { type: 'screen_reader_blur' });
    expect((node as any).__screenReaderState.isFocused).toBe(false);
  });

  it('navigate_next/prev emits focus events', () => {
    sendEvent(screenReaderHandler, node, cfg, ctx, { type: 'screen_reader_navigate_next' });
    expect(getEventCount(ctx, 'screen_reader_focus_next')).toBe(1);
    sendEvent(screenReaderHandler, node, cfg, ctx, { type: 'screen_reader_navigate_prev' });
    expect(getEventCount(ctx, 'screen_reader_focus_prev')).toBe(1);
  });

  it('navigate_in focuses first child', () => {
    sendEvent(screenReaderHandler, node, cfg, ctx, {
      type: 'screen_reader_add_child',
      childId: 'c1',
    });
    sendEvent(screenReaderHandler, node, cfg, ctx, { type: 'screen_reader_navigate_in' });
    expect(getEventCount(ctx, 'screen_reader_focus_child')).toBe(1);
  });

  it('announce_complete clears announcing flag', () => {
    (node as any).__screenReaderState.isAnnouncing = true;
    sendEvent(screenReaderHandler, node, cfg, ctx, { type: 'screen_reader_announce_complete' });
    expect((node as any).__screenReaderState.isAnnouncing).toBe(false);
  });

  it('describe queues announcement', () => {
    sendEvent(screenReaderHandler, node, cfg, ctx, { type: 'screen_reader_describe' });
    expect((node as any).__screenReaderState.announcementQueue.length).toBe(1);
    expect((node as any).__screenReaderState.announcementQueue[0]).toContain('TestButton');
  });

  it('update processes announcement queue', () => {
    sendEvent(screenReaderHandler, node, cfg, ctx, { type: 'screen_reader_describe' });
    ctx.clearEvents();
    updateTrait(screenReaderHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'screen_reader_announce')).toBe(1);
  });

  it('query returns state', () => {
    sendEvent(screenReaderHandler, node, cfg, ctx, { type: 'screen_reader_query', queryId: 'q1' });
    const r = getLastEvent(ctx, 'screen_reader_info') as any;
    expect(r.isFocused).toBe(false);
    expect(r.queryId).toBe('q1');
  });

  it('cleans up on detach', () => {
    screenReaderHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__screenReaderState).toBeUndefined();
    expect(getEventCount(ctx, 'screen_reader_unregister')).toBe(1);
  });
});
