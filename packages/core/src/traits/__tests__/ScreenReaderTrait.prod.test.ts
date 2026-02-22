/**
 * ScreenReaderTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { screenReaderHandler } from '../ScreenReaderTrait';

function makeNode(extra: any = {}) {
  return { id: 'sr_node', name: 'Button', type: 'interactive', ...extra };
}
function makeContext() { return { emit: vi.fn() }; }
function attachNode(config: any = {}, nodeExtras: any = {}) {
  const node = makeNode(nodeExtras);
  const ctx = makeContext();
  const cfg = { ...screenReaderHandler.defaultConfig!, ...config };
  screenReaderHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

describe('screenReaderHandler.defaultConfig', () => {
  it('semantic_structure = true', () => expect(screenReaderHandler.defaultConfig!.semantic_structure).toBe(true));
  it('navigation_order = 0', () => expect(screenReaderHandler.defaultConfig!.navigation_order).toBe(0));
  it('announce_changes = true', () => expect(screenReaderHandler.defaultConfig!.announce_changes).toBe(true));
  it('reading_mode = spatial', () => expect(screenReaderHandler.defaultConfig!.reading_mode).toBe('spatial'));
  it('sonify_position = false', () => expect(screenReaderHandler.defaultConfig!.sonify_position).toBe(false));
  it('distance_scaling = true', () => expect(screenReaderHandler.defaultConfig!.distance_scaling).toBe(true));
  it('pitch_for_height = true', () => expect(screenReaderHandler.defaultConfig!.pitch_for_height).toBe(true));
  it('pan_for_position = true', () => expect(screenReaderHandler.defaultConfig!.pan_for_position).toBe(true));
  it('verbosity = normal', () => expect(screenReaderHandler.defaultConfig!.verbosity).toBe('normal'));
});

describe('screenReaderHandler.onAttach', () => {
  it('creates __screenReaderState', () => expect((attachNode().node as any).__screenReaderState).toBeDefined());
  it('isFocused = false', () => expect((attachNode().node as any).__screenReaderState.isFocused).toBe(false));
  it('isAnnouncing = false', () => expect((attachNode().node as any).__screenReaderState.isAnnouncing).toBe(false));
  it('announcementQueue = []', () => expect((attachNode().node as any).__screenReaderState.announcementQueue).toEqual([]));
  it('navigationStack = []', () => expect((attachNode().node as any).__screenReaderState.navigationStack).toEqual([]));
  it('childNodes = []', () => expect((attachNode().node as any).__screenReaderState.childNodes).toEqual([]));
  it('captures initial position from node.position', () => {
    const { node } = attachNode({}, { position: { x: 1, y: 2, z: 3 } });
    expect((node as any).__screenReaderState.lastPosition).toEqual({ x: 1, y: 2, z: 3 });
  });
  it('emits screen_reader_register with order, semanticStructure, readingMode', () => {
    const { ctx } = attachNode({ navigation_order: 5, semantic_structure: false, reading_mode: 'linear' });
    expect(ctx.emit).toHaveBeenCalledWith('screen_reader_register', expect.objectContaining({
      order: 5, semanticStructure: false, readingMode: 'linear',
    }));
  });
});

describe('screenReaderHandler.onDetach', () => {
  it('removes __screenReaderState', () => {
    const { node, cfg, ctx } = attachNode();
    screenReaderHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__screenReaderState).toBeUndefined();
  });
  it('emits screen_reader_unregister', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    screenReaderHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('screen_reader_unregister', expect.any(Object));
  });
});

describe('screenReaderHandler.onUpdate — queue processing', () => {
  it('shifts message and emits screen_reader_announce when not announcing', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__screenReaderState.announcementQueue = ['Hello', 'World'];
    (node as any).__screenReaderState.isAnnouncing = false;
    ctx.emit.mockClear();
    screenReaderHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('screen_reader_announce', expect.objectContaining({ message: 'Hello', interrupt: false }));
    expect((node as any).__screenReaderState.isAnnouncing).toBe(true);
    expect((node as any).__screenReaderState.announcementQueue).toEqual(['World']);
  });
  it('skips queue when isAnnouncing=true', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__screenReaderState.announcementQueue = ['Pending'];
    (node as any).__screenReaderState.isAnnouncing = true;
    ctx.emit.mockClear();
    screenReaderHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('screen_reader_announce', expect.any(Object));
  });
  it('does nothing when queue empty', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    screenReaderHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('screen_reader_announce', expect.any(Object));
  });
});

describe('screenReaderHandler.onUpdate — position changes', () => {
  it('updates lastPosition and sonifies when distMoved>0.5 + focused + sonify_position=true', () => {
    const { node, cfg, ctx } = attachNode({ announce_changes: true, sonify_position: true });
    (node as any).__screenReaderState.isFocused = true;
    (node as any).__screenReaderState.lastPosition = { x: 0, y: 0, z: 0 };
    (node as any).position = { x: 2, y: 0, z: 0 };
    ctx.emit.mockClear();
    screenReaderHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__screenReaderState.lastPosition).toEqual({ x: 2, y: 0, z: 0 });
    expect(ctx.emit).toHaveBeenCalledWith('screen_reader_sonify', expect.any(Object));
  });
  it('does NOT sonify when dist ≤ 0.5', () => {
    const { node, cfg, ctx } = attachNode({ announce_changes: true, sonify_position: true });
    (node as any).__screenReaderState.isFocused = true;
    (node as any).__screenReaderState.lastPosition = { x: 0, y: 0, z: 0 };
    (node as any).position = { x: 0.1, y: 0, z: 0 };
    ctx.emit.mockClear();
    screenReaderHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('screen_reader_sonify', expect.any(Object));
  });
  it('does NOT sonify when not focused', () => {
    const { node, cfg, ctx } = attachNode({ announce_changes: true, sonify_position: true });
    (node as any).__screenReaderState.isFocused = false;
    (node as any).__screenReaderState.lastPosition = { x: 0, y: 0, z: 0 };
    (node as any).position = { x: 5, y: 0, z: 0 };
    ctx.emit.mockClear();
    screenReaderHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('screen_reader_sonify', expect.any(Object));
  });
});

describe('screenReaderHandler.onEvent — screen_reader_focus', () => {
  it('sets isFocused=true and pushes node id to stack', () => {
    const { node, cfg, ctx } = attachNode();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_focus' });
    expect((node as any).__screenReaderState.isFocused).toBe(true);
    expect((node as any).__screenReaderState.navigationStack).toContain('sr_node');
  });
  it('emits screen_reader_announce with interrupt=true', () => {
    const { node, cfg, ctx } = attachNode({ sonify_position: false });
    ctx.emit.mockClear();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_focus' });
    expect(ctx.emit).toHaveBeenCalledWith('screen_reader_announce', expect.objectContaining({ interrupt: true }));
  });
  it('verbosity=minimal → only name', () => {
    const node = { id: 'btn', name: 'Submit', type: 'button' } as any;
    const ctx = makeContext();
    const cfg = { ...screenReaderHandler.defaultConfig!, verbosity: 'minimal' as const, sonify_position: false, reading_mode: 'linear' as const };
    screenReaderHandler.onAttach!(node, cfg, ctx);
    ctx.emit.mockClear();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_focus' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'screen_reader_announce');
    expect(call?.[1].message).toBe('Submit');
  });
  it('verbosity=verbose → includes "interactive element"', () => {
    const { node, cfg, ctx } = attachNode({ verbosity: 'verbose', sonify_position: false });
    ctx.emit.mockClear();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_focus' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'screen_reader_announce');
    expect(call?.[1].message).toContain('interactive element');
  });
  it('reading_mode=spatial appends Position to announcement', () => {
    const node = { id: 'n', name: 'Box', type: 'mesh', position: { x: 1, y: 2, z: 3 } } as any;
    const ctx = makeContext();
    const cfg = { ...screenReaderHandler.defaultConfig!, reading_mode: 'spatial' as const, sonify_position: false };
    screenReaderHandler.onAttach!(node, cfg, ctx);
    ctx.emit.mockClear();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_focus' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'screen_reader_announce');
    expect(call?.[1].message).toContain('Position');
  });
  it('emits on_screen_reader_focus', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_focus' });
    expect(ctx.emit).toHaveBeenCalledWith('on_screen_reader_focus', expect.any(Object));
  });
});

describe('screenReaderHandler.onEvent — misc', () => {
  it('blur: isFocused=false + pops stack', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__screenReaderState.isFocused = true;
    (node as any).__screenReaderState.navigationStack = ['sr_node'];
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_blur' });
    expect((node as any).__screenReaderState.isFocused).toBe(false);
    expect((node as any).__screenReaderState.navigationStack).toHaveLength(0);
  });
  it('navigate_next emits focus_next with order+mode', () => {
    const { node, cfg, ctx } = attachNode({ navigation_order: 3, reading_mode: 'linear' });
    ctx.emit.mockClear();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_navigate_next' });
    expect(ctx.emit).toHaveBeenCalledWith('screen_reader_focus_next', expect.objectContaining({ order: 3, mode: 'linear' }));
  });
  it('navigate_prev emits focus_prev', () => {
    const { node, cfg, ctx } = attachNode({ navigation_order: 2 });
    ctx.emit.mockClear();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_navigate_prev' });
    expect(ctx.emit).toHaveBeenCalledWith('screen_reader_focus_prev', expect.any(Object));
  });
  it('navigate_in emits focus_child for first child', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__screenReaderState.childNodes = ['child_1', 'child_2'];
    ctx.emit.mockClear();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_navigate_in' });
    expect(ctx.emit).toHaveBeenCalledWith('screen_reader_focus_child', expect.objectContaining({ childId: 'child_1' }));
  });
  it('navigate_in does NOT emit when no children', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_navigate_in' });
    expect(ctx.emit).not.toHaveBeenCalledWith('screen_reader_focus_child', expect.any(Object));
  });
  it('navigate_out emits focus_parent', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_navigate_out' });
    expect(ctx.emit).toHaveBeenCalledWith('screen_reader_focus_parent', expect.any(Object));
  });
  it('announce_complete sets isAnnouncing=false', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__screenReaderState.isAnnouncing = true;
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_announce_complete' });
    expect((node as any).__screenReaderState.isAnnouncing).toBe(false);
  });
  it('add_child appends and deduplicates', () => {
    const { node, cfg, ctx } = attachNode();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_add_child', childId: 'c1' });
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_add_child', childId: 'c1' });
    expect((node as any).__screenReaderState.childNodes).toHaveLength(1);
  });
  it('describe pushes description to announcementQueue', () => {
    const { node, cfg, ctx } = attachNode();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_describe' });
    expect((node as any).__screenReaderState.announcementQueue.length).toBe(1);
    expect((node as any).__screenReaderState.announcementQueue[0]).toContain('Button');
  });
  it('query emits screen_reader_info snapshot', () => {
    const { node, cfg, ctx } = attachNode({ navigation_order: 7, reading_mode: 'hierarchical' });
    (node as any).__screenReaderState.isFocused = true;
    (node as any).__screenReaderState.childNodes = ['c1', 'c2'];
    ctx.emit.mockClear();
    screenReaderHandler.onEvent!(node, cfg, ctx, { type: 'screen_reader_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith('screen_reader_info', expect.objectContaining({
      queryId: 'q1', isFocused: true, navigationOrder: 7, readingMode: 'hierarchical', childCount: 2,
    }));
  });
});
