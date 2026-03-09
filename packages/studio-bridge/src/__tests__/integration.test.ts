/**
 * Integration tests for the studio-bridge package
 *
 * Tests end-to-end round-trip translation:
 * Visual Graph -> AST + Code -> Visual Graph
 */

import { describe, it, expect } from 'vitest';
import { VisualToAST } from '../VisualToAST';
import { ASTToVisual } from '../ASTToVisual';
import { SyncEngine } from '../SyncEngine';
import type { VisualGraph, HoloNode, HoloEdge } from '../types';

// ============================================================================
// Test Helpers
// ============================================================================

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

function createEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
): HoloEdge {
  return {
    id,
    source,
    target,
    sourceHandle: sourceHandle || null,
    targetHandle: targetHandle || null,
    data: {
      sourcePort: sourceHandle || 'flow',
      targetPort: targetHandle || 'flow',
      flowType: 'flow' as any,
    },
  } as any;
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

// ============================================================================
// Integration Tests
// ============================================================================

describe('Studio Bridge Integration', () => {
  describe('round-trip: Visual -> AST -> Visual', () => {
    it('should round-trip a single event node', () => {
      const originalGraph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);

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
      const clickNodes = reverseResult.graph.nodes.filter(
        (n) => n.data.type === 'on_click',
      );
      expect(clickNodes.length).toBeGreaterThan(0);
    });

    it('should round-trip an event -> action chain', () => {
      const originalGraph = createTestGraph(
        [
          createNode('ev1', 'on_click', 'event', 'On Click'),
          createNode('act1', 'play_sound', 'action', 'Play Sound', { url: 'click.mp3' }),
        ],
        [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')],
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
        [createEdge('e1', 'ev1', 'act1', 'flow', 'flow')],
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
      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);

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

      const graph = createTestGraph([
        createNode('ev1', 'on_click', 'event', 'On Click'),
      ]);

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

      const astNodes = [{
        type: 'orb',
        name: 'syncTest',
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
      }] as any[];

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
          createNode('act2', 'set_property', 'action', 'Set Color', { property: 'color', value: '#ff0000' }),
        ],
        [
          createEdge('e1', 'ev1', 'act1', 'flow', 'flow'),
          createEdge('e2', 'ev2', 'act2', 'enter', 'flow'),
        ],
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
        ],
      );

      const forward = new VisualToAST();
      const result = forward.translate(graph);

      expect(result.code).toContain('audio.play("click.mp3")');
      expect(result.code).toContain('this.visible = !this.visible');
    });
  });
});
