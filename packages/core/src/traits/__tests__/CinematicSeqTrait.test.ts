/**
 * CinematicSeqTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { cinematicSeqHandler } from '../CinematicSeqTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __cinState: undefined as unknown,
});

const defaultConfig = { fps: 24 };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('CinematicSeqTrait — metadata', () => {
  it('has name "cinematic_seq"', () => {
    expect(cinematicSeqHandler.name).toBe('cinematic_seq');
  });

  it('defaultConfig fps is 24', () => {
    expect(cinematicSeqHandler.defaultConfig?.fps).toBe(24);
  });
});

describe('CinematicSeqTrait — lifecycle', () => {
  it('onAttach initializes state', () => {
    const node = makeNode();
    cinematicSeqHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__cinState as { clips: unknown[]; currentFrame: number; playing: boolean };
    expect(state.clips).toEqual([]);
    expect(state.currentFrame).toBe(0);
    expect(state.playing).toBe(false);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    cinematicSeqHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cinematicSeqHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__cinState).toBeUndefined();
  });
});

describe('CinematicSeqTrait — onEvent', () => {
  it('cin:add_clip adds clip and emits cin:clip_added', () => {
    const node = makeNode();
    cinematicSeqHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cinematicSeqHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'cin:add_clip', clipName: 'intro', startFrame: 0, endFrame: 240,
    } as never);
    const state = node.__cinState as { clips: Array<Record<string, unknown>> };
    expect(state.clips.length).toBe(1);
    expect(state.clips[0].name).toBe('intro');
    expect(node.emit).toHaveBeenCalledWith('cin:clip_added', { clipName: 'intro', total: 1 });
  });

  it('cin:add_clip increments total for each clip', () => {
    const node = makeNode();
    cinematicSeqHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cinematicSeqHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'cin:add_clip', clipName: 'a', startFrame: 0, endFrame: 100,
    } as never);
    cinematicSeqHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'cin:add_clip', clipName: 'b', startFrame: 101, endFrame: 200,
    } as never);
    expect(node.emit).toHaveBeenLastCalledWith('cin:clip_added', { clipName: 'b', total: 2 });
  });

  it('cin:play sets playing=true and emits cin:playing', () => {
    const node = makeNode();
    cinematicSeqHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cinematicSeqHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'cin:play',
    } as never);
    const state = node.__cinState as { playing: boolean; currentFrame: number };
    expect(state.playing).toBe(true);
    expect(node.emit).toHaveBeenCalledWith('cin:playing', { frame: 0 });
  });

  it('cin:seek updates currentFrame and emits cin:seeked', () => {
    const node = makeNode();
    cinematicSeqHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cinematicSeqHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'cin:seek', frame: 120,
    } as never);
    const state = node.__cinState as { currentFrame: number };
    expect(state.currentFrame).toBe(120);
    expect(node.emit).toHaveBeenCalledWith('cin:seeked', { frame: 120 });
  });

  it('cin:stop sets playing=false and emits cin:stopped', () => {
    const node = makeNode();
    cinematicSeqHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cinematicSeqHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'cin:play',
    } as never);
    node.emit.mockClear();
    cinematicSeqHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'cin:stop',
    } as never);
    const state = node.__cinState as { playing: boolean };
    expect(state.playing).toBe(false);
    expect(node.emit).toHaveBeenCalledWith('cin:stopped', expect.objectContaining({ frame: 0 }));
  });
});
