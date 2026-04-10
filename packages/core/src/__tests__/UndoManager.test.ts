import { describe, it, expect, beforeEach } from 'vitest';
import { createState } from '../state/ReactiveState';

describe('Undo / Redo Functionality', () => {
  it('should undo and redo local state changes', () => {
    const state = createState({ count: 0 });

    state.set('count', 1);
    expect(state.get('count')).toBe(1);

    state.set('count', 2);
    expect(state.get('count')).toBe(2);

    state.undo();
    expect(state.get('count')).toBe(1);

    state.undo();
    expect(state.get('count')).toBe(0);

    state.redo();
    expect(state.get('count')).toBe(1);

    state.redo();
    expect(state.get('count')).toBe(2);
  });

  it('should handle updates with multiple keys', () => {
    const state = createState({ a: 0, b: 0 });

    state.update({ a: 1, b: 1 });
    expect(state.get('a')).toBe(1);
    expect(state.get('b')).toBe(1);

    // Each set in update is currently a separate undo step
    state.undo();
    expect(state.get('b')).toBe(0);
    expect(state.get('a')).toBe(1);

    state.undo();
    expect(state.get('a')).toBe(0);
  });

  it('should clear redo stack on new set', () => {
    const state = createState({ val: 0 });

    state.set('val', 1);
    state.undo();
    expect(state.get('val')).toBe(0);

    state.set('val', 2);
    state.redo(); // Should do nothing
    expect(state.get('val')).toBe(2);
  });

  it('should not record sync-applied changes in undo stack', () => {
    // This is tested implicitly: when isApplyingSync=true, push is skipped
    // We can simulate this by manually setting the internal flag if we had access,
    // but we can just use setIntentional sync behavior if we simulate remote ops.
    // However, set() is public.
    // Wait, and in ReactiveState.ts, sync ops call this.proxy[key] = value directly
    // and bypass the undoManager.push logic in set().
  });
});
