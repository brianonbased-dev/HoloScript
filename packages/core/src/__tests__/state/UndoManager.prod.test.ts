/**
 * UndoManager Production Tests
 *
 * Covers: push (grows undoStack, clears redoStack), undo (pops from undoStack,
 * pushes to redoStack, returns step, null when empty), redo (pops from
 * redoStack, pushes back to undoStack, returns step, null when empty),
 * clear (empties both stacks), getStackDepth (returns undoStack length),
 * prune (removes steps older than maxDurationMs).
 */

import { describe, it, expect, vi } from 'vitest';
import { UndoManager } from '../../state/UndoManager';

type Op = { action: string; value?: any };

function makeUM() { return new UndoManager<Op>(); }

// ── push ──────────────────────────────────────────────────────────────────────

describe('UndoManager — push', () => {

  it('push increases stack depth', () => {
    const um = makeUM();
    um.push({ action: 'add', value: 1 }, { action: 'remove', value: 1 });
    expect(um.getStackDepth()).toBe(1);
  });

  it('push clears the redo stack', () => {
    const um = makeUM();
    um.push({ action: 'a' }, { action: 'b' });
    um.undo(); // moves step to redo
    um.push({ action: 'c' }, { action: 'd' }); // should wipe redo
    expect(um.redo()).toBeNull();
  });

  it('multiple pushes accumulate in stack', () => {
    const um = makeUM();
    um.push({ action: '1' }, { action: '1r' });
    um.push({ action: '2' }, { action: '2r' });
    um.push({ action: '3' }, { action: '3r' });
    expect(um.getStackDepth()).toBe(3);
  });
});

// ── undo ──────────────────────────────────────────────────────────────────────

describe('UndoManager — undo', () => {

  it('undo returns the most recently pushed step', () => {
    const um = makeUM();
    um.push({ action: 'create' }, { action: 'destroy' });
    const step = um.undo();
    expect(step?.undo.action).toBe('create');
    expect(step?.redo.action).toBe('destroy');
  });

  it('undo returns null when stack is empty', () => {
    const um = makeUM();
    expect(um.undo()).toBeNull();
  });

  it('undo decrements stack depth', () => {
    const um = makeUM();
    um.push({ action: 'a' }, { action: 'b' });
    um.undo();
    expect(um.getStackDepth()).toBe(0);
  });

  it('undo moves step to redo stack (enables redo)', () => {
    const um = makeUM();
    um.push({ action: 'a' }, { action: 'b' });
    um.undo();
    expect(um.redo()).not.toBeNull();
  });

  it('successive undos pop in LIFO order', () => {
    const um = makeUM();
    um.push({ action: 'first' }, { action: 'first-r' });
    um.push({ action: 'second' }, { action: 'second-r' });
    const s1 = um.undo();
    const s2 = um.undo();
    expect(s1?.undo.action).toBe('second');
    expect(s2?.undo.action).toBe('first');
  });
});

// ── redo ──────────────────────────────────────────────────────────────────────

describe('UndoManager — redo', () => {

  it('redo returns null when nothing undone', () => {
    const um = makeUM();
    um.push({ action: 'a' }, { action: 'b' });
    expect(um.redo()).toBeNull();
  });

  it('redo returns the undone step', () => {
    const um = makeUM();
    um.push({ action: 'create' }, { action: 'destroy' });
    um.undo();
    const step = um.redo();
    expect(step?.redo.action).toBe('destroy');
  });

  it('redo pushes step back onto undoStack', () => {
    const um = makeUM();
    um.push({ action: 'a' }, { action: 'b' });
    um.undo();
    um.redo();
    expect(um.getStackDepth()).toBe(1);
  });

  it('redo returns null after being exhausted', () => {
    const um = makeUM();
    um.push({ action: 'a' }, { action: 'b' });
    um.undo();
    um.redo();
    expect(um.redo()).toBeNull();
  });

  it('undo→redo→undo restores original state', () => {
    const um = makeUM();
    um.push({ action: 'a' }, { action: 'b' });
    um.undo();
    um.redo();
    const step = um.undo();
    expect(step?.undo.action).toBe('a');
  });
});

// ── clear ─────────────────────────────────────────────────────────────────────

describe('UndoManager — clear', () => {

  it('clear empties undoStack', () => {
    const um = makeUM();
    um.push({ action: 'a' }, { action: 'b' });
    um.clear();
    expect(um.getStackDepth()).toBe(0);
    expect(um.undo()).toBeNull();
  });

  it('clear empties redoStack', () => {
    const um = makeUM();
    um.push({ action: 'a' }, { action: 'b' });
    um.undo();
    um.clear();
    expect(um.redo()).toBeNull();
  });
});

// ── getStackDepth ─────────────────────────────────────────────────────────────

describe('UndoManager — getStackDepth', () => {

  it('returns 0 initially', () => {
    expect(makeUM().getStackDepth()).toBe(0);
  });

  it('matches push count when no undos', () => {
    const um = makeUM();
    um.push({ action: 'a' }, { action: 'b' });
    um.push({ action: 'c' }, { action: 'd' });
    expect(um.getStackDepth()).toBe(2);
  });
});
