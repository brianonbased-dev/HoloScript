/**
 * Tests for SyncEngine
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncEngine, createSyncEngine } from '../SyncEngine';
import type { VisualGraph, HoloNode, HoloEdge, ASTNode } from '../types';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestGraph(nodes: HoloNode[] = [], edges: HoloEdge[] = []): VisualGraph {
  return {
    nodes,
    edges,
    metadata: {
      name: 'Test Graph',
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

function createNode(
  id: string,
  type: string,
  category: 'event' | 'action' | 'logic' | 'data',
  label: string,
  properties: Record<string, unknown> = {},
): HoloNode {
  return {
    id,
    type: 'holoNode',
    position: { x: 0, y: 0 },
    data: {
      type,
      label,
      category,
      properties,
      inputs: [],
      outputs: [],
    },
  } as any;
}

function createTestAST(): ASTNode[] {
  return [{
    type: 'orb',
    name: 'testOrb',
    properties: {},
    methods: [],
    children: [{
      type: 'event-handler',
      directives: [{
        type: 'lifecycle',
        hook: 'on_click',
        body: [],
      }],
    }],
  } as any];
}

// ============================================================================
// Tests
// ============================================================================

describe('SyncEngine', () => {
  let engine: SyncEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new SyncEngine({ debounceMs: 100 });
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
  });

  describe('lifecycle', () => {
    it('should create with default options', () => {
      const eng = createSyncEngine();
      expect(eng).toBeInstanceOf(SyncEngine);
      expect(eng.getState().active).toBe(false);
    });

    it('should start and stop', () => {
      engine.start();
      expect(engine.getState().active).toBe(true);

      engine.stop();
      expect(engine.getState().active).toBe(false);
    });

    it('should accept custom options', () => {
      const eng = new SyncEngine({
        direction: 'visual-to-ast',
        debounceMs: 500,
        codeFormat: 'holo',
      });
      expect(eng.getState().direction).toBe('visual-to-ast');
    });
  });

  describe('event system', () => {
    it('should emit sync-start event', () => {
      const listener = vi.fn();
      engine.on('sync-start', listener);
      engine.start();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync-start',
          timestamp: expect.any(Number),
        }),
      );
    });

    it('should support unsubscribe via returned function', () => {
      const listener = vi.fn();
      const unsubscribe = engine.on('sync-start', listener);

      engine.start();
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      engine.stop();
      engine.start();
      // Should not be called again after unsubscribe
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should support off() for removing listeners', () => {
      const listener = vi.fn();
      engine.on('sync-start', listener);

      engine.start();
      expect(listener).toHaveBeenCalledTimes(1);

      engine.off('sync-start', listener);
      engine.stop();
      engine.start();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in listeners gracefully', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Test error');
      });
      const goodListener = vi.fn();

      engine.on('sync-start', errorListener);
      engine.on('sync-start', goodListener);

      // Should not throw
      engine.start();
      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('visual-to-ast sync', () => {
    it('should not sync when engine is stopped', () => {
      const listener = vi.fn();
      engine.on('sync-complete', listener);

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);

      vi.advanceTimersByTime(200);
      expect(listener).not.toHaveBeenCalled();
    });

    it('should sync visual changes after debounce period', () => {
      const listener = vi.fn();
      engine.on('sync-complete', listener);
      engine.start();

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);

      // Before debounce
      expect(listener).not.toHaveBeenCalled();

      // After debounce
      vi.advanceTimersByTime(150);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync-complete',
          data: expect.objectContaining({
            direction: 'visual-to-ast',
          }),
        }),
      );
    });

    it('should debounce rapid changes', () => {
      const listener = vi.fn();
      engine.on('sync-complete', listener);
      engine.start();

      const graph1 = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      const graph2 = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
        createNode('act1', 'play_sound', 'action', 'Play Sound'),
      ]);

      engine.onVisualChanged(graph1);
      vi.advanceTimersByTime(50);
      engine.onVisualChanged(graph2);

      // Only one sync should occur after the debounce
      vi.advanceTimersByTime(150);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should not sync visual changes when direction is ast-to-visual', () => {
      const eng = new SyncEngine({ direction: 'ast-to-visual', debounceMs: 100 });
      const listener = vi.fn();
      eng.on('sync-complete', listener);
      eng.start();

      eng.onVisualChanged(createTestGraph());
      vi.advanceTimersByTime(200);

      expect(listener).not.toHaveBeenCalled();
      eng.stop();
    });

    it('should generate code after sync', () => {
      engine.start();

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(150);

      const code = engine.getGeneratedCode();
      expect(code).toContain('orb');
    });
  });

  describe('ast-to-visual sync', () => {
    it('should sync AST changes after debounce period', () => {
      const listener = vi.fn();
      engine.on('sync-complete', listener);
      engine.start();

      engine.onASTChanged(createTestAST());

      vi.advanceTimersByTime(150);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: 'ast-to-visual',
          }),
        }),
      );
    });

    it('should not sync AST changes when direction is visual-to-ast', () => {
      const eng = new SyncEngine({ direction: 'visual-to-ast', debounceMs: 100 });
      const listener = vi.fn();
      eng.on('sync-complete', listener);
      eng.start();

      eng.onASTChanged(createTestAST());
      vi.advanceTimersByTime(200);

      expect(listener).not.toHaveBeenCalled();
      eng.stop();
    });
  });

  describe('code-to-visual sync', () => {
    it('should translate code to visual graph', () => {
      const listener = vi.fn();
      engine.on('sync-complete', listener);
      engine.start();

      engine.onCodeChanged(`orb testOrb {
  @clickable
  on_click: {
  }
}`);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync-complete',
          data: expect.objectContaining({
            direction: 'code-to-visual',
          }),
        }),
      );
    });
  });

  describe('syncNow', () => {
    it('should force immediate visual-to-ast sync', () => {
      engine.start();

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);

      const result = engine.syncNow('visual-to-ast');
      expect(result).toBeDefined();
    });

    it('should force immediate ast-to-visual sync', () => {
      engine.start();

      engine.onASTChanged(createTestAST());

      const result = engine.syncNow('ast-to-visual');
      expect(result).toBeDefined();
    });

    it('should return null when no data is available', () => {
      engine.start();

      const result = engine.syncNow('visual-to-ast');
      expect(result).toBeNull();
    });
  });

  describe('round-trip validation', () => {
    it('should validate round-trip with simple graph', () => {
      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);

      const result = engine.validateRoundTrip(graph);

      expect(result.originalNodes).toBe(1);
      expect(result.roundTripNodes).toBeGreaterThanOrEqual(0);
      expect(result.diagnostics).toBeDefined();
    });

    it('should detect lost nodes in round-trip', () => {
      const graph = createTestGraph([
        createNode('x1', 'custom_unknown', 'action', 'Unknown'),
      ]);

      const result = engine.validateRoundTrip(graph);

      // The unknown node type cannot round-trip faithfully
      expect(result.equivalent).toBe(false);
    });
  });

  describe('change tracking', () => {
    it('should record change events', () => {
      engine.recordChange({
        type: 'node-added',
        origin: 'visual',
        visualNodeId: 'ev1',
      });

      const changes = engine.getPendingChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('node-added');
      expect(changes[0].timestamp).toBeDefined();
    });

    it('should emit change events', () => {
      const listener = vi.fn();
      engine.on('change', listener);

      engine.recordChange({
        type: 'node-updated',
        origin: 'visual',
        visualNodeId: 'ev1',
        previousValue: 'red',
        newValue: 'blue',
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should clear changes', () => {
      engine.recordChange({
        type: 'node-added',
        origin: 'visual',
        visualNodeId: 'ev1',
      });

      engine.clearChanges();
      expect(engine.getPendingChanges()).toHaveLength(0);
    });
  });

  describe('mapping queries', () => {
    it('should find AST path for visual node', () => {
      engine.start();

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(150);

      const astPath = engine.findASTPath('ev1');
      expect(astPath).toBeDefined();
    });

    it('should find visual node for AST path', () => {
      engine.start();

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(150);

      const mappings = engine.getMappings();
      if (mappings.length > 0) {
        const visualNodeId = engine.findVisualNode(mappings[0].astPath);
        expect(visualNodeId).toBeDefined();
      }
    });

    it('should get all mappings for a visual node', () => {
      engine.start();

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(150);

      const nodeMappings = engine.getMappingsForVisualNode('ev1');
      expect(nodeMappings).toBeDefined();
    });

    it('should get mappings by AST path prefix', () => {
      engine.start();

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(150);

      const allMappings = engine.getMappings();
      if (allMappings.length > 0) {
        const pathPrefix = allMappings[0].astPath.split('.')[0];
        const prefixMappings = engine.getMappingsForASTPath(pathPrefix);
        expect(prefixMappings.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('diagnostics', () => {
    it('should emit diagnostics events during sync', () => {
      const diagListener = vi.fn();
      engine.on('diagnostics', diagListener);
      engine.start();

      // A graph with a disconnected action will produce warnings
      const graph = createTestGraph([
        createNode('act1', 'play_sound', 'action', 'Play Sound'),
      ]);
      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(150);

      const diagnostics = engine.getDiagnostics();
      expect(diagnostics.length).toBeGreaterThan(0);
    });

    it('should emit mapping-updated events during sync', () => {
      const mapListener = vi.fn();
      engine.on('mapping-updated', mapListener);
      engine.start();

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(150);

      expect(mapListener).toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    it('should track pending changes count', () => {
      engine.start();

      const graph = createTestGraph([]);
      engine.onVisualChanged(graph);

      expect(engine.getState().pendingChanges).toBe(1);

      engine.onVisualChanged(graph);
      expect(engine.getState().pendingChanges).toBe(2);
    });

    it('should reset pending changes after sync', () => {
      engine.start();

      const graph = createTestGraph([]);
      engine.onVisualChanged(graph);
      engine.onVisualChanged(graph);

      vi.advanceTimersByTime(150);
      expect(engine.getState().pendingChanges).toBe(0);
    });

    it('should update lastSyncTimestamp after sync', () => {
      engine.start();

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(150);

      expect(engine.getState().lastSyncTimestamp).toBeGreaterThan(0);
    });
  });
});
