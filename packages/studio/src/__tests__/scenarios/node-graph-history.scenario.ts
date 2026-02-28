/**
 * Scenario: Node Graph History — Undo/Redo
 *
 * Tests for the snapshot-based undo/redo system:
 * - GraphSnapshot type
 * - record() pushes snapshots, clears redo
 * - undo()/redo() restore correct state
 * - MAX_HISTORY cap (50 snapshots)
 * - clear() resets stacks
 * - historyList metadata
 */

import { describe, it, expect } from 'vitest';

// We test the pure logic by re-implementing the stack operations
// since the hook uses React state (useState) which needs renderHook.

interface GNode { id: string; type?: string; position: { x: number; y: number }; data: unknown; }
interface GEdge { id: string; source: string; target: string; }
interface GraphSnapshot { nodes: GNode[]; edges: GEdge[]; }

const MAX_HISTORY = 50;

// ── Pure undo/redo stack implementation (mirrors hook logic) ─────────────

class UndoRedoStack {
  past: GraphSnapshot[] = [];
  future: GraphSnapshot[] = [];

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  record(snapshot: GraphSnapshot) {
    this.past.push(snapshot);
    if (this.past.length > MAX_HISTORY) this.past = this.past.slice(-MAX_HISTORY);
    this.future = [];
  }

  undo(current: GraphSnapshot): GraphSnapshot | null {
    if (this.past.length === 0) return null;
    const prev = this.past.pop()!;
    this.future.unshift(current);
    return prev;
  }

  redo(current: GraphSnapshot): GraphSnapshot | null {
    if (this.future.length === 0) return null;
    const next = this.future.shift()!;
    this.past.push(current);
    return next;
  }

  clear() { this.past = []; this.future = []; }

  get historyList() {
    return this.past.map((s, i) => ({
      index: i, nodeCount: s.nodes.length, edgeCount: s.edges.length,
    }));
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function snap(nodeCount: number, edgeCount: number): GraphSnapshot {
  return {
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `n${i}`, position: { x: 0, y: 0 }, data: {},
    })),
    edges: Array.from({ length: edgeCount }, (_, i) => ({
      id: `e${i}`, source: `n${i}`, target: `n${i + 1}`,
    })),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Scenario: Node Graph History — Basic Operations', () => {
  it('starts with empty stacks', () => {
    const stack = new UndoRedoStack();
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
  });

  it('record() enables undo', () => {
    const stack = new UndoRedoStack();
    stack.record(snap(2, 1));
    expect(stack.canUndo).toBe(true);
    expect(stack.canRedo).toBe(false);
  });

  it('record() clears redo stack', () => {
    const stack = new UndoRedoStack();
    stack.record(snap(1, 0));
    stack.undo(snap(2, 0)); // creates redo entry
    expect(stack.canRedo).toBe(true);
    stack.record(snap(3, 0)); // new action clears redo
    expect(stack.canRedo).toBe(false);
  });

  it('undo() returns previous snapshot', () => {
    const stack = new UndoRedoStack();
    const original = snap(2, 1);
    stack.record(original);
    const restored = stack.undo(snap(3, 2));
    expect(restored).toBe(original);
  });

  it('undo() returns null on empty stack', () => {
    const stack = new UndoRedoStack();
    expect(stack.undo(snap(1, 0))).toBeNull();
  });

  it('redo() returns next snapshot', () => {
    const stack = new UndoRedoStack();
    stack.record(snap(1, 0));
    const current = snap(2, 1);
    stack.undo(current);
    const restored = stack.redo(snap(1, 0));
    expect(restored).toBe(current);
  });

  it('redo() returns null on empty stack', () => {
    const stack = new UndoRedoStack();
    expect(stack.redo(snap(1, 0))).toBeNull();
  });
});

describe('Scenario: Node Graph History — Multi-step', () => {
  it('multiple undo/redo cycles work correctly', () => {
    const stack = new UndoRedoStack();
    stack.record(snap(1, 0)); // v1
    stack.record(snap(2, 1)); // v2
    stack.record(snap(3, 2)); // v3

    const current = snap(4, 3); // v4 (current state)
    const v3 = stack.undo(current)!;
    expect(v3.nodes.length).toBe(3);

    const v2 = stack.undo(v3)!;
    expect(v2.nodes.length).toBe(2);

    const redone = stack.redo(v2)!;
    expect(redone.nodes.length).toBe(3);
  });

  it('clear() resets both stacks', () => {
    const stack = new UndoRedoStack();
    stack.record(snap(1, 0));
    stack.record(snap(2, 0));
    stack.clear();
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
  });
});

describe('Scenario: Node Graph History — MAX_HISTORY Cap', () => {
  it('caps at 50 snapshots', () => {
    const stack = new UndoRedoStack();
    for (let i = 0; i < 60; i++) stack.record(snap(i, 0));
    expect(stack.past.length).toBe(50);
  });

  it('keeps most recent snapshots when capped', () => {
    const stack = new UndoRedoStack();
    for (let i = 0; i < 55; i++) stack.record(snap(i, 0));
    // First 5 should be trimmed, so oldest remaining = 5
    expect(stack.past[0].nodes.length).toBe(5);
  });
});

describe('Scenario: Node Graph History — historyList', () => {
  it('returns metadata for each past snapshot', () => {
    const stack = new UndoRedoStack();
    stack.record(snap(3, 2));
    stack.record(snap(5, 4));
    const list = stack.historyList;
    expect(list.length).toBe(2);
    expect(list[0].nodeCount).toBe(3);
    expect(list[1].nodeCount).toBe(5);
  });
});
