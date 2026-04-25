import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIDataBinding } from '../ui/UIDataBinding';

// =============================================================================
// C269 — UI Data Binding
// =============================================================================

describe('UIDataBinding', () => {
  let db: UIDataBinding;
  beforeEach(() => {
    db = new UIDataBinding();
  });

  it('set and get model value', () => {
    db.set('player.name', 'Hero');
    expect(db.get('player.name')).toBe('Hero');
  });

  it('get returns undefined for missing path', () => {
    expect(db.get('nope')).toBeUndefined();
  });

  it('bind creates a binding', () => {
    const b = db.bind('player.hp', 'hpLabel', 'text');
    expect(b.modelPath).toBe('player.hp');
    expect(db.getBindingCount()).toBe(1);
  });

  it('unbind removes binding', () => {
    const b = db.bind('player.hp', 'hpLabel', 'text');
    expect(db.unbind(b.id)).toBe(true);
    expect(db.getBindingCount()).toBe(0);
  });

  it('resolve returns stringified value', () => {
    db.set('score', 42);
    const b = db.bind('score', 'scoreLabel', 'text');
    expect(db.resolve(b.id)).toBe('42');
  });

  it('resolve with formatter', () => {
    db.set('score', 42);
    const b = db.bind('score', 'scoreLabel', 'text', 'one-way', (v) => `Score: ${v}`);
    expect(db.resolve(b.id)).toBe('Score: 42');
  });

  it('resolve returns empty string for undefined value', () => {
    const b = db.bind('missing', 'w1', 'text');
    expect(db.resolve(b.id)).toBe('');
  });

  it('resolve returns null for unknown binding', () => {
    expect(db.resolve('nope')).toBeNull();
  });

  it('getBindingsForWidget filters by widget', () => {
    db.bind('a', 'w1', 'text');
    db.bind('b', 'w2', 'text');
    db.bind('c', 'w1', 'color');
    expect(db.getBindingsForWidget('w1')).toHaveLength(2);
  });

  it('getBindingsForPath filters by model path', () => {
    db.bind('hp', 'w1', 'text');
    db.bind('hp', 'w2', 'width');
    db.bind('mp', 'w3', 'text');
    expect(db.getBindingsForPath('hp')).toHaveLength(2);
  });

  it('onChange fires when model value changes', () => {
    const cb = vi.fn();
    db.onChange('hp', cb);
    db.set('hp', 100);
    expect(cb).toHaveBeenCalledWith(100, undefined);
    db.set('hp', 80);
    expect(cb).toHaveBeenCalledWith(80, 100);
  });

  it('propagate resolves all bindings', () => {
    db.set('a', 1);
    db.set('b', 2);
    const b1 = db.bind('a', 'w1', 'text');
    const b2 = db.bind('b', 'w2', 'text');
    const result = db.propagate();
    expect(result.get(b1.id)).toBe('1');
    expect(result.get(b2.id)).toBe('2');
  });

  it('getModel returns shallow copy', () => {
    db.set('x', 10);
    const model = db.getModel();
    model[0] = 99;
    expect(db.get('x')).toBe(10); // unchanged
  });
});
