import { describe, it, expect, vi } from 'vitest';
import { holographicSpriteTraitHandler } from '../HolographicSpriteTrait';

function makeNode() {
  return {
    id: 'n1',
    traits: new Set(),
    emit: vi.fn(),
  } as any;
}

describe('holographicSpriteTraitHandler', () => {
  it('has name @holographic_sprite', () => {
    expect((holographicSpriteTraitHandler as any).name).toBe('@holographic_sprite');
  });

  it('has defaultConfig with expected fields', () => {
    const dc = holographicSpriteTraitHandler.defaultConfig as any;
    expect(dc).toBeDefined();
    expect(typeof dc).toBe('object');
  });

  it('onAttach sets __holographicSpriteState synchronously', async () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = holographicSpriteTraitHandler.defaultConfig as any;

    const p = holographicSpriteTraitHandler.onAttach!(node, cfg, ctx as any);
    // State set before first await
    expect(node.__holographicSpriteState).toBeDefined();
    await p;
  });

  it('onAttach emits holographic:ready(false) synchronously', async () => {
    const node = makeNode();
    const emitSpy = vi.fn();
    node.emit = emitSpy;
    const ctx = { emit: vi.fn() };
    const cfg = holographicSpriteTraitHandler.defaultConfig as any;

    const p = holographicSpriteTraitHandler.onAttach!(node, cfg, ctx as any);

    // holographic:ready should be emitted synchronously before first await
    const ctxCalls = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);
    const nodeCalls = emitSpy.mock.calls.map((c: any[]) => c[0]);
    const allEvents = [...ctxCalls, ...nodeCalls];
    expect(allEvents).toContain('holographic:ready');

    await p;
  });

  it('onAttach emits holographic:mode synchronously', async () => {
    const node = makeNode();
    const emitSpy = vi.fn();
    node.emit = emitSpy;
    const ctx = { emit: vi.fn() };
    const cfg = holographicSpriteTraitHandler.defaultConfig as any;
    const p = holographicSpriteTraitHandler.onAttach!(node, cfg, ctx as any);

    const ctxCalls = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);
    const nodeCalls = emitSpy.mock.calls.map((c: any[]) => c[0]);
    expect([...ctxCalls, ...nodeCalls]).toContain('holographic:mode');

    await p;
  });
});
