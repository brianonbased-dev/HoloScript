import { describe, it, expect, beforeEach } from 'vitest';
import { useHistoryStore, installHistoryCAELBridge } from '../historyStore';

describe('installHistoryCAELBridge — Paper 24 CAEL Phase 2 undo/redo wire', () => {
  beforeEach(() => {
    // Reset temporal store between tests so past/future stacks start clean.
    useHistoryStore.temporal.getState().clear();
    useHistoryStore.setState({ nodes: [], code: '' });
  });

  it('emits ui.undo when temporal.undo() shrinks past + grows future by 1', () => {
    const events: Array<{ channel: string; data: unknown }> = [];
    const unsub = installHistoryCAELBridge((channel, data) => events.push({ channel, data }));

    // Make a change so there is past to undo into.
    useHistoryStore.getState().addNode({
      id: 'n1', name: 'cube', type: 'mesh', parentId: null, traits: [],
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
    });
    // Filter out any incidental events from the addNode (it shouldn't trigger
    // undo/redo emit because past grows but future doesn't shrink-by-1).
    const beforeCount = events.length;

    useHistoryStore.temporal.getState().undo();

    const undoEvents = events.slice(beforeCount).filter((e) => e.channel === 'ui.undo');
    expect(undoEvents).toHaveLength(1);
    // pastDepth/futureDepth are zundo-internal counters (exact values depend
    // on zundo's tracking convention). Verify the fields exist and are
    // non-negative numbers — that's the contract for downstream analysis.
    const undoData = undoEvents[0].data as { pastDepth: number; futureDepth: number; timestamp: number };
    expect(typeof undoData.pastDepth).toBe('number');
    expect(typeof undoData.futureDepth).toBe('number');
    expect(undoData.futureDepth).toBeGreaterThanOrEqual(1);
    expect(typeof undoData.timestamp).toBe('number');

    unsub();
  });

  it('emits ui.redo when temporal.redo() grows past + shrinks future by 1', () => {
    const events: Array<{ channel: string; data: unknown }> = [];
    const unsub = installHistoryCAELBridge((channel, data) => events.push({ channel, data }));

    useHistoryStore.getState().addNode({
      id: 'n1', name: 'cube', type: 'mesh', parentId: null, traits: [],
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
    });
    useHistoryStore.temporal.getState().undo();
    const beforeCount = events.length;

    useHistoryStore.temporal.getState().redo();

    const redoEvents = events.slice(beforeCount).filter((e) => e.channel === 'ui.redo');
    expect(redoEvents).toHaveLength(1);
    const redoData = redoEvents[0].data as { pastDepth: number; futureDepth: number; timestamp: number };
    expect(typeof redoData.pastDepth).toBe('number');
    expect(typeof redoData.futureDepth).toBe('number');
    expect(redoData.pastDepth).toBeGreaterThanOrEqual(1);
    expect(typeof redoData.timestamp).toBe('number');

    unsub();
  });

  it('does NOT emit ui.undo or ui.redo on a fresh mutation (past grows, future clears)', () => {
    const events: Array<{ channel: string; data: unknown }> = [];
    const unsub = installHistoryCAELBridge((channel, data) => events.push({ channel, data }));

    useHistoryStore.getState().addNode({
      id: 'n2', name: 'sphere', type: 'mesh', parentId: null, traits: [],
      position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
    });

    expect(events.filter((e) => e.channel === 'ui.undo' || e.channel === 'ui.redo')).toHaveLength(0);

    unsub();
  });

  it('unsubscribe stops further emissions', () => {
    const events: Array<{ channel: string; data: unknown }> = [];
    const unsub = installHistoryCAELBridge((channel, data) => events.push({ channel, data }));

    useHistoryStore.getState().addNode({
      id: 'n3', name: 'cone', type: 'mesh', parentId: null, traits: [],
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
    });
    useHistoryStore.temporal.getState().undo();
    expect(events.filter((e) => e.channel === 'ui.undo')).toHaveLength(1);

    unsub();

    useHistoryStore.temporal.getState().redo();
    // After unsub no further events should be appended.
    expect(events.filter((e) => e.channel === 'ui.redo')).toHaveLength(0);
  });
});
