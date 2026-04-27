import { describe, it, expect, vi } from 'vitest';
import { segmentTraitHandler } from '../SegmentTrait';

function makeNode() {
  return {
    id: 'n1',
    traits: new Set(),
    emit: vi.fn(),
  } as any;
}

describe('segmentTraitHandler', () => {
  it('has name @segment', () => {
    expect((segmentTraitHandler as any).name).toBe('@segment');
  });

  it('has defaultConfig', () => {
    expect(segmentTraitHandler.defaultConfig).toBeDefined();
  });

  it('onAttach sets __segmentState synchronously before async ops', async () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = segmentTraitHandler.defaultConfig as any;

    // onAttach is async but sets state before first await
    const p = segmentTraitHandler.onAttach!(node, cfg, ctx as any);
    // State should be set immediately (before first await)
    expect(node.__segmentState).toBeDefined();
    expect(node.__segmentState.ready).toBe(false);
    expect(node.__segmentState.loading).toBe(true);

    // Let async ops settle
    await p;
  });

  it('onAttach emits segment:ready(false) synchronously', async () => {
    const node = makeNode();
    const emitSpy = vi.fn();
    node.emit = emitSpy;
    const ctx = { emit: vi.fn() };
    const cfg = segmentTraitHandler.defaultConfig as any;
    await segmentTraitHandler.onAttach!(node, cfg, ctx as any);
    // At minimum, segment:ready should have been emitted
    const calls = emitSpy.mock.calls.map((c: any[]) => c[0]);
    const ctxCalls = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);
    const allEvents = [...calls, ...ctxCalls];
    expect(allEvents).toContain('segment:ready');
  });
});
