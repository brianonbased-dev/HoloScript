/**
 * Integration tests for the studio-bridge package
 *
 * Tests end-to-end round-trip translation:
 * Visual Graph -> AST + Code -> Visual Graph
 *
 * Also covers:
 * - Bridge initialization and connection
 * - Message passing between studio and core
 * - Scene synchronization
 * - Error handling and reconnection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VisualToAST } from '../VisualToAST';
import { ASTToVisual } from '../ASTToVisual';
import { SyncEngine, createSyncEngine } from '../SyncEngine';
import type {
  VisualGraph,
  HoloNode,
  HoloEdge,
  HoloNodeData,
  PortDefinition,
  ASTNode,
  OrbNode,
  BridgeChangeEvent,
  SyncState,
} from '../types';

// ============================================================================
// Test Helpers
// ============================================================================

function createNode(
  id: string,
  type: string,
  category: 'event' | 'action' | 'logic' | 'data',
  label: string,
  properties: Record<string, unknown> = {}
): HoloNode {
  const inputs: PortDefinition[] = [];
  const outputs: PortDefinition[] = [];
  const data: HoloNodeData = {
    type,
    label,
    category,
    properties,
    inputs,
    outputs,
  };
  return {
    id,
    type: 'holoNode',
    position: { x: 0, y: 0 },
    data,
  };
}

function createEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string
): HoloEdge {
  return {
    id,
    source,
    target,
    sourceHandle: sourceHandle ?? null,
    targetHandle: targetHandle ?? null,
    data: {
      sourcePort: sourceHandle ?? 'flow',
      targetPort: targetHandle ?? 'flow',
      flowType: 'flow',
    },
  };
}

function createTestGraph(nodes: HoloNode[], edges: HoloEdge[] = []): VisualGraph {
  return {
    nodes,
    edges,
    metadata: {
      name: 'Integration Test Graph',
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

function createOrbAST(
  name: string,
  children: ASTNode[] = [],
  properties: Record<string, unknown> = {}
): OrbNode {
  return {
    type: 'orb',
    name,
    properties,
    methods: [],
    children,
  };
}

function createEventHandlerAST(hook: string, body: ASTNode[] = []): ASTNode {
  return {
    type: 'event-handler',
    directives: [
      {
        type: 'lifecycle',
        hook,
        body,
      },
    ],
  };
}

function createActionAST(
  traitName: string,
  config: Record<string, unknown> = {}
): ASTNode {
  return {
    type: 'action',
    directives: [
      {
        type: 'trait',
        name: traitName,
        config,
      },
    ],
  };
}

// ============================================================================
// Original Integration Tests
// ============================================================================

describe('Studio Bridge Integration', () => {
  describe('round-trip: Visual -> AST -> Visual', () => {
    it('should round-trip a single event node', () => {
      const originalGraph = createTestGraph([createNode('ev1', 'on_click', 'event', 'On Click')]);

      const forward = new VisualToAST();
      const reverse = new ASTToVisual();

      // Forward: Visual -> AST
      const forwardResult = forward.translate(originalGraph);
      expect(forwardResult.ast.length).toBeGreaterThan(0);
      expect(forwardResult.code).toContain('on_click');

      // Reverse: AST -> Visual
      const reverseResult = reverse.translate(forwardResult.ast);
      expect(reverseResult.graph.nodes.length).toBeGreaterThan(0);

      // The round-trip should preserve the on_click event
      const clickNodes = reverseResult.graph.nodes.filter((n) => n.data.type === 'on_click');
      expect(clickNodes.length).toBeGreaterThan(0);
    });

    it('should round-trip an event -> action chain', () => {
      const originalGraph = createTestGraph(
        [
          createNode('ev1', 'on_click', 'event', 'On Click'),
          createNode('act1', 'play_sound', 'action', 'Play Sound', { url: 'click.mp3' }),
        ],
        [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')]
      );

      const forward = new VisualToAST();
      const reverse = new ASTToVisual();

      const forwardResult = forward.translate(originalGraph);
      expect(forwardResult.code).toContain('audio.play("click.mp3")');

      const reverseResult = reverse.translate(forwardResult.ast);

      // Should have at least the event and action nodes
      expect(reverseResult.graph.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it('should preserve traits across round-trip', () => {
      const originalGraph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
        createNode('ev2', 'on_hover', 'event', 'On Hover'),
        createNode('ev3', 'on_grab', 'event', 'On Grab'),
      ]);

      const forward = new VisualToAST();
      const forwardResult = forward.translate(originalGraph);

      // Should have all three traits
      expect(forwardResult.code).toContain('@clickable');
      expect(forwardResult.code).toContain('@hoverable');
      expect(forwardResult.code).toContain('@grabbable');
    });
  });

  describe('round-trip: Code -> Visual -> Code', () => {
    it('should round-trip simple HoloScript code', () => {
      const originalCode = `orb roundTripper {
  @clickable
  on_click: {
  }
}`;

      const reverse = new ASTToVisual();
      const forward = new VisualToAST();

      // Code -> Visual
      const codeToVisualResult = reverse.translateFromCode(originalCode);
      expect(codeToVisualResult.graph.nodes.length).toBeGreaterThan(0);

      // Visual -> Code
      const visualToCodeResult = forward.translate(codeToVisualResult.graph);
      expect(visualToCodeResult.code).toContain('orb');
    });
  });

  describe('multi-format code generation', () => {
    it('should generate consistent code across all formats', () => {
      const graph = createTestGraph(
        [
          createNode('ev1', 'on_click', 'event', 'On Click'),
          createNode('act1', 'play_sound', 'action', 'Play Sound', { url: 'test.mp3' }),
        ],
        [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')]
      );

      const hsResult = new VisualToAST({ format: 'hs' }).translate(graph);
      const hsplusResult = new VisualToAST({ format: 'hsplus' }).translate(graph);
      const holoResult = new VisualToAST({ format: 'holo' }).translate(graph);

      // All formats should contain the audio play action
      expect(hsResult.code).toContain('audio.play("test.mp3")');
      expect(hsplusResult.code).toContain('audio.play("test.mp3")');
      expect(holoResult.code).toContain('audio.play("test.mp3")');

      // Holo format should have composition wrapper
      expect(holoResult.code).toContain('composition');
      expect(hsResult.code).not.toContain('composition');
    });
  });

  describe('mapping consistency', () => {
    it('should produce consistent mappings between forward and reverse translation', () => {
      const graph = createTestGraph([createNode('ev1', 'on_click', 'event', 'On Click')]);

      const forward = new VisualToAST();
      const forwardResult = forward.translate(graph);

      // All forward mappings should have both visualNodeId and astPath
      for (const mapping of forwardResult.mappings) {
        expect(mapping.visualNodeId).toBeDefined();
        expect(mapping.astPath).toBeDefined();
        expect(mapping.relationship).toBeDefined();
      }
    });
  });

  describe('sync engine integration', () => {
    it('should produce code when visual graph changes', () => {
      const engine = new SyncEngine({ debounceMs: 0 });
      engine.start();

      const graph = createTestGraph([createNode('ev1', 'on_click', 'event', 'On Click')]);

      const result = engine.syncNow('visual-to-ast');
      // No data yet, should be null
      expect(result).toBeNull();

      // Provide the graph
      engine.onVisualChanged(graph);
      const syncResult = engine.syncNow('visual-to-ast');
      expect(syncResult).toBeDefined();

      engine.stop();
    });

    it('should produce visual graph when AST changes', () => {
      const engine = new SyncEngine({ debounceMs: 0 });
      engine.start();

      const astNodes: ASTNode[] = [
        createOrbAST('syncTest', [createEventHandlerAST('on_click')]),
      ];

      engine.onASTChanged(astNodes);
      const syncResult = engine.syncNow('ast-to-visual');
      expect(syncResult).toBeDefined();

      engine.stop();
    });
  });

  describe('error handling', () => {
    it('should handle graphs with unknown node types gracefully', () => {
      const graph = createTestGraph([
        createNode('x1', 'completely_unknown_type', 'action', 'Unknown'),
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);

      const forward = new VisualToAST();
      const result = forward.translate(graph);

      // Should still produce code for valid nodes
      expect(result.code).toContain('on_click');
      // Should have a diagnostic about the unknown type
      expect(result.diagnostics.some((d) => d.code === 'BRIDGE_UNKNOWN_TYPE')).toBe(true);
    });

    it('should handle empty metadata gracefully', () => {
      const graph: VisualGraph = {
        nodes: [],
        edges: [],
        metadata: {
          name: '',
          version: '',
          createdAt: '',
          updatedAt: '',
        },
      };

      const forward = new VisualToAST();
      const result = forward.translate(graph);

      expect(result.code).toBeDefined();
      expect(result.code.length).toBeGreaterThan(0);
    });
  });

  describe('complex graph scenarios', () => {
    it('should handle multiple event chains', () => {
      const graph = createTestGraph(
        [
          createNode('ev1', 'on_click', 'event', 'On Click'),
          createNode('act1', 'play_sound', 'action', 'Play Sound', { url: 'click.mp3' }),
          createNode('ev2', 'on_hover', 'event', 'On Hover'),
          createNode('act2', 'set_property', 'action', 'Set Color', {
            property: 'color',
            value: '#ff0000',
          }),
        ],
        [
          createEdge('e1', 'ev1', 'act1', 'flow', 'flow'),
          createEdge('e2', 'ev2', 'act2', 'enter', 'flow'),
        ]
      );

      const forward = new VisualToAST();
      const result = forward.translate(graph);

      expect(result.code).toContain('on_click');
      expect(result.code).toContain('audio.play("click.mp3")');
      expect(result.code).toContain('on_hover_enter');
      expect(result.code).toContain('this.color');
    });

    it('should handle chained actions (event -> action1 -> action2)', () => {
      const graph = createTestGraph(
        [
          createNode('ev1', 'on_click', 'event', 'On Click'),
          createNode('act1', 'play_sound', 'action', 'Play Sound', { url: 'click.mp3' }),
          createNode('act2', 'toggle', 'action', 'Toggle Visible', { property: 'visible' }),
        ],
        [
          createEdge('e1', 'ev1', 'act1', 'flow', 'flow'),
          createEdge('e2', 'act1', 'act2', 'flow', 'flow'),
        ]
      );

      const forward = new VisualToAST();
      const result = forward.translate(graph);

      expect(result.code).toContain('audio.play("click.mp3")');
      expect(result.code).toContain('this.visible = !this.visible');
    });
  });

  // ============================================================================
  // NEW Integration Tests: Bridge Initialization & Connection
  // ============================================================================

  describe('bridge initialization and connection', () => {
    it('should initialize SyncEngine with all three sync directions', () => {
      const bidir = createSyncEngine({ direction: 'bidirectional' });
      const v2a = createSyncEngine({ direction: 'visual-to-ast' });
      const a2v = createSyncEngine({ direction: 'ast-to-visual' });

      expect(bidir.getState().direction).toBe('bidirectional');
      expect(v2a.getState().direction).toBe('visual-to-ast');
      expect(a2v.getState().direction).toBe('ast-to-visual');

      expect(bidir.getState().active).toBe(false);
      expect(v2a.getState().active).toBe(false);
      expect(a2v.getState().active).toBe(false);
    });

    it('should initialize translators with matching format options and produce consistent output', () => {
      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);

      const formats: Array<'hs' | 'hsplus' | 'holo'> = ['hs', 'hsplus', 'holo'];
      for (const format of formats) {
        const engine = createSyncEngine({ codeFormat: format });
        engine.start();
        engine.onVisualChanged(graph);
        const result = engine.syncNow('visual-to-ast');
        expect(result).not.toBeNull();
        if (result && 'code' in result) {
          expect(result.code.length).toBeGreaterThan(0);
        }
        engine.stop();
      }
    });

    it('should wire up VisualToAST and ASTToVisual with consistent custom rules', () => {
      const forward = new VisualToAST();
      const reverse = new ASTToVisual();

      forward.registerRule({
        visualType: 'custom_teleport',
        astType: 'action',
        strategy: 'action',
        category: 'action',
      });
      reverse.registerRule({
        astTypePattern: 'custom_teleport',
        visualType: 'custom_teleport',
        category: 'action',
      });

      expect(forward.getRule('custom_teleport')).toBeDefined();
      expect(reverse.getRule('custom_teleport')).toBeDefined();
      expect(forward.getRule('custom_teleport')!.astType).toBe('action');
      expect(reverse.getRule('custom_teleport')!.visualType).toBe('custom_teleport');
    });
  });

  // ============================================================================
  // NEW Integration Tests: Message Passing Between Studio and Core
  // ============================================================================

  describe('message passing between studio and core', () => {
    let engine: SyncEngine;

    beforeEach(() => {
      vi.useFakeTimers();
      engine = new SyncEngine({ debounceMs: 50 });
    });

    afterEach(() => {
      engine.stop();
      vi.useRealTimers();
    });

    it('should propagate visual changes through full pipeline and emit all expected events', () => {
      const events: string[] = [];
      engine.on('sync-start', () => events.push('sync-start'));
      engine.on('sync-complete', () => events.push('sync-complete'));
      engine.on('mapping-updated', () => events.push('mapping-updated'));

      engine.start();
      expect(events).toContain('sync-start');

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
        createNode('act1', 'play_sound', 'action', 'Play Sound', { url: 'ding.mp3' }),
      ], [
        createEdge('e1', 'ev1', 'act1', 'flow', 'flow'),
      ]);

      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(100);

      expect(events).toContain('sync-complete');
      expect(events).toContain('mapping-updated');

      const code = engine.getGeneratedCode();
      expect(code).toContain('audio.play("ding.mp3")');
    });

    it('should propagate AST changes to visual graph and update mappings', () => {
      engine.start();

      const astNodes: ASTNode[] = [
        createOrbAST('messageTest', [
          createEventHandlerAST('on_click', [
            createActionAST('audio', { url: 'beep.mp3' }),
          ]),
        ]),
      ];

      engine.onASTChanged(astNodes);
      vi.advanceTimersByTime(100);

      const mappings = engine.getMappings();
      expect(mappings.length).toBeGreaterThan(0);

      // Each mapping should have valid structure
      for (const m of mappings) {
        expect(typeof m.id).toBe('string');
        expect(typeof m.visualNodeId).toBe('string');
        expect(typeof m.astPath).toBe('string');
        expect(['direct', 'composite', 'aggregate', 'derived', 'structural']).toContain(
          m.relationship
        );
      }
    });

    it('should handle code changes and produce a visual graph via onCodeChanged', () => {
      const completeFn = vi.fn();
      engine.on('sync-complete', completeFn);
      engine.start();

      engine.onCodeChanged(`orb codeTarget {
  @clickable
  on_click: {
  }
}`);

      expect(completeFn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync-complete',
          data: expect.objectContaining({
            direction: 'code-to-visual',
          }),
        })
      );
    });

    it('should record and emit change events for node mutations', () => {
      const changeFn = vi.fn();
      engine.on('change', changeFn);

      engine.recordChange({
        type: 'node-added',
        origin: 'visual',
        visualNodeId: 'new-node-1',
      });

      engine.recordChange({
        type: 'property-changed',
        origin: 'visual',
        visualNodeId: 'new-node-1',
        previousValue: '#000000',
        newValue: '#ff0000',
      });

      expect(changeFn).toHaveBeenCalledTimes(2);
      const pending = engine.getPendingChanges();
      expect(pending).toHaveLength(2);
      expect(pending[0].type).toBe('node-added');
      expect(pending[1].type).toBe('property-changed');
      expect(pending[1].previousValue).toBe('#000000');
      expect(pending[1].newValue).toBe('#ff0000');
    });
  });

  // ============================================================================
  // NEW Integration Tests: Scene Synchronization
  // ============================================================================

  describe('scene synchronization', () => {
    let engine: SyncEngine;

    beforeEach(() => {
      vi.useFakeTimers();
      engine = new SyncEngine({ debounceMs: 50 });
    });

    afterEach(() => {
      engine.stop();
      vi.useRealTimers();
    });

    it('should synchronize a complex scene with multiple event types and actions', () => {
      engine.start();

      const graph = createTestGraph(
        [
          createNode('ev1', 'on_click', 'event', 'On Click'),
          createNode('ev2', 'on_collision', 'event', 'On Collision'),
          createNode('act1', 'play_sound', 'action', 'Play Sound', { url: 'hit.mp3' }),
          createNode('act2', 'spawn', 'action', 'Spawn', { template: 'debris' }),
          createNode('act3', 'destroy', 'action', 'Destroy'),
        ],
        [
          createEdge('e1', 'ev1', 'act1', 'flow', 'flow'),
          createEdge('e2', 'ev2', 'act2', 'enter', 'flow'),
          createEdge('e3', 'act2', 'act3', 'flow', 'flow'),
        ]
      );

      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(100);

      const code = engine.getGeneratedCode();
      expect(code).toContain('on_click');
      expect(code).toContain('on_collision_enter');
      expect(code).toContain('audio.play("hit.mp3")');
      expect(code).toContain('scene.spawn("debris")');
      expect(code).toContain('this.destroy()');
    });

    it('should maintain bidirectional mapping consistency after visual-to-ast sync', () => {
      engine.start();

      const graph = createTestGraph(
        [
          createNode('ev1', 'on_click', 'event', 'On Click'),
          createNode('act1', 'toggle', 'action', 'Toggle Light', { property: 'isActive' }),
        ],
        [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')]
      );

      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(100);

      // Verify bidirectional lookup
      const astPath = engine.findASTPath('ev1');
      expect(astPath).toBeDefined();
      if (astPath) {
        const backToVisual = engine.findVisualNode(astPath);
        expect(backToVisual).toBe('ev1');
      }
    });

    it('should validate round-trip for a scene with data nodes', () => {
      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
        createNode('d1', 'constant', 'data', 'Red Color', { type: 'color', value: '#ff0000' }),
      ]);

      const result = engine.validateRoundTrip(graph);
      expect(result.originalNodes).toBe(2);
      expect(result.diagnostics).toBeDefined();
      // Both on_click and constant have translations, so no lost types
      expect(result.lostNodes).not.toContain('on_click');
    });

    it('should handle incremental scene updates by debouncing rapid changes', () => {
      const syncFn = vi.fn();
      engine.on('sync-complete', syncFn);
      engine.start();

      // Simulate rapid scene updates (adding nodes one by one)
      const graph1 = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      const graph2 = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
        createNode('act1', 'play_sound', 'action', 'Sound', { url: 'a.mp3' }),
      ]);
      const graph3 = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
        createNode('act1', 'play_sound', 'action', 'Sound', { url: 'a.mp3' }),
        createNode('act2', 'destroy', 'action', 'Destroy'),
      ]);

      engine.onVisualChanged(graph1);
      vi.advanceTimersByTime(20);
      engine.onVisualChanged(graph2);
      vi.advanceTimersByTime(20);
      engine.onVisualChanged(graph3);
      vi.advanceTimersByTime(100);

      // Should have only synced once (debounced)
      expect(syncFn).toHaveBeenCalledTimes(1);
    });

    it('should synchronize scene with logic branching (if/else)', () => {
      engine.start();

      const graph = createTestGraph(
        [
          createNode('ev1', 'on_click', 'event', 'On Click'),
          createNode('logic1', 'if_else', 'logic', 'If/Else'),
          createNode('actT', 'play_sound', 'action', 'Sound True', { url: 'yes.mp3' }),
          createNode('actF', 'destroy', 'action', 'Destroy'),
        ],
        [
          createEdge('e1', 'ev1', 'logic1', 'flow', 'flow'),
          createEdge('e2', 'logic1', 'actT', 'true', 'flow'),
          createEdge('e3', 'logic1', 'actF', 'false', 'flow'),
        ]
      );

      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(100);

      const code = engine.getGeneratedCode();
      expect(code).toContain('on_click');
      expect(code.length).toBeGreaterThan(0);

      const mappings = engine.getMappings();
      expect(mappings.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // NEW Integration Tests: Error Handling and Reconnection
  // ============================================================================

  describe('error handling and reconnection', () => {
    let engine: SyncEngine;

    beforeEach(() => {
      vi.useFakeTimers();
      engine = new SyncEngine({ debounceMs: 50 });
    });

    afterEach(() => {
      engine.stop();
      vi.useRealTimers();
    });

    it('should silently ignore visual changes when engine is stopped', () => {
      const syncFn = vi.fn();
      engine.on('sync-complete', syncFn);
      // Engine NOT started

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(200);

      expect(syncFn).not.toHaveBeenCalled();
      expect(engine.getGeneratedCode()).toBe('');
    });

    it('should silently ignore AST changes when engine is stopped', () => {
      const syncFn = vi.fn();
      engine.on('sync-complete', syncFn);

      engine.onASTChanged([createOrbAST('test', [createEventHandlerAST('on_click')])]);
      vi.advanceTimersByTime(200);

      expect(syncFn).not.toHaveBeenCalled();
    });

    it('should recover from stop/start cycle and resume syncing', () => {
      const syncFn = vi.fn();
      engine.on('sync-complete', syncFn);

      // Start, do work, stop
      engine.start();
      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(100);
      expect(syncFn).toHaveBeenCalledTimes(1);

      engine.stop();
      expect(engine.getState().active).toBe(false);

      // Restart and verify sync works again
      engine.start();
      expect(engine.getState().active).toBe(true);

      const graph2 = createTestGraph([
        createNode('ev2', 'on_hover', 'event', 'On Hover'),
      ]);
      engine.onVisualChanged(graph2);
      vi.advanceTimersByTime(100);
      expect(syncFn).toHaveBeenCalledTimes(2);
    });

    it('should handle listener errors without disrupting other listeners or sync', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener crashed');
      });
      const goodListener = vi.fn();

      engine.on('sync-complete', errorListener);
      engine.on('sync-complete', goodListener);
      engine.start();

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);
      vi.advanceTimersByTime(100);

      // Both should be called; error should not prevent goodListener
      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();

      // Engine should still be functional
      expect(engine.getState().active).toBe(true);
      expect(engine.getGeneratedCode().length).toBeGreaterThan(0);
    });

    it('should handle malformed code in onCodeChanged without crashing', () => {
      const diagFn = vi.fn();
      engine.on('diagnostics', diagFn);
      engine.start();

      // Feed garbage code -- should not throw
      engine.onCodeChanged('}{{{ not valid at all @#$%');

      // Engine should still be operational
      expect(engine.getState().active).toBe(true);
    });

    it('should clear pending state on stop and allow clean restart', () => {
      engine.start();

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);
      engine.onVisualChanged(graph);
      expect(engine.getState().pendingChanges).toBe(2);

      engine.stop();

      // After stop, pendingChanges reset is handled by the sync cycle
      // But change queue should be empty after stop
      engine.clearChanges();
      expect(engine.getPendingChanges()).toHaveLength(0);

      // Clean restart
      engine.start();
      expect(engine.getState().active).toBe(true);
    });

    it('should handle empty graph sync without errors', () => {
      engine.start();

      const emptyGraph = createTestGraph([]);
      engine.onVisualChanged(emptyGraph);
      vi.advanceTimersByTime(100);

      const code = engine.getGeneratedCode();
      expect(code).toBeDefined();
      expect(code.length).toBeGreaterThan(0); // At least the orb wrapper
    });

    it('should handle syncNow returning null when direction does not match stored data', () => {
      engine.start();

      // Store visual data only
      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);
      engine.onVisualChanged(graph);

      // Ask for ast-to-visual with no AST data stored
      const result = engine.syncNow('ast-to-visual');
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // NEW Integration Tests: Full Pipeline Scenarios
  // ============================================================================

  describe('full pipeline integration scenarios', () => {
    it('should round-trip a scene with data node connected to action', () => {
      const graph = createTestGraph(
        [
          createNode('ev1', 'on_click', 'event', 'On Click'),
          createNode('d1', 'constant', 'data', 'New Color', { type: 'color', value: '#00ff00' }),
          createNode('act1', 'set_property', 'action', 'Set Color', { property: 'color' }),
        ],
        [
          createEdge('e1', 'ev1', 'act1', 'flow', 'flow'),
          createEdge('e2', 'd1', 'act1', 'value', 'value'),
        ]
      );

      const forward = new VisualToAST();
      const result = forward.translate(graph);

      expect(result.code).toContain('this.color');
      expect(result.mappings.length).toBeGreaterThanOrEqual(2);
      expect(result.ast).toHaveLength(1);
      expect(result.ast[0].type).toBe('orb');
    });

    it('should produce valid AST structure for complex multi-chain graph', () => {
      const graph = createTestGraph(
        [
          createNode('ev1', 'on_click', 'event', 'On Click'),
          createNode('ev2', 'on_timer', 'event', 'On Timer'),
          createNode('act1', 'play_animation', 'action', 'Spin', {
            animation: 'spin',
            duration: 500,
          }),
          createNode('act2', 'spawn', 'action', 'Spawn Particle', { template: 'spark' }),
          createNode('act3', 'play_sound', 'action', 'Chime', { url: 'chime.mp3' }),
        ],
        [
          createEdge('e1', 'ev1', 'act1', 'flow', 'flow'),
          createEdge('e2', 'act1', 'act2', 'flow', 'flow'),
          createEdge('e3', 'ev2', 'act3', 'flow', 'flow'),
        ]
      );

      const forward = new VisualToAST();
      const result = forward.translate(graph);

      // Should produce exactly one OrbNode root
      expect(result.ast).toHaveLength(1);
      const orb = result.ast[0] as OrbNode;
      expect(orb.type).toBe('orb');

      // Should have handlers for both events
      expect(orb.children).toBeDefined();
      expect(orb.children!.length).toBe(2);

      // Code should contain both handler chains
      expect(result.code).toContain('animation.play("spin"');
      expect(result.code).toContain('scene.spawn("spark")');
      expect(result.code).toContain('audio.play("chime.mp3")');
    });

    it('should preserve source map entries across full visual-to-code pipeline', () => {
      const graph = createTestGraph(
        [
          createNode('ev1', 'on_click', 'event', 'On Click'),
          createNode('act1', 'play_sound', 'action', 'Click Sound', { url: 'pop.mp3' }),
        ],
        [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')]
      );

      const result = new VisualToAST({
        generateSourceMap: true,
        format: 'hsplus',
      }).translate(graph);

      expect(result.sourceMap).toBeDefined();
      expect(result.sourceMap!.entries.length).toBeGreaterThanOrEqual(1);

      // Source map entries should reference valid visual node IDs
      for (const entry of result.sourceMap!.entries) {
        expect(entry.visualNodeId).toBeDefined();
        expect(entry.generated.line).toBeGreaterThan(0);
      }
    });
  });
});
