import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TreeSitterManager, type ContentChange } from '../TreeSitterManager';

/**
 * Tests for TreeSitterManager - incremental tree-sitter parsing for HoloScript LSP.
 *
 * These tests cover:
 *   - Initialization and graceful degradation
 *   - Full document parsing (openDocument)
 *   - Incremental re-parsing (updateDocument)
 *   - Error diagnostic extraction
 *   - Document lifecycle (close / cleanup)
 *
 * Note: These tests require the native tree-sitter and tree-sitter-holoscript
 * bindings to be built.  In CI environments where native bindings are
 * unavailable, the manager will gracefully degrade and tests will verify
 * the degradation path instead.
 */

describe('TreeSitterManager', () => {
  let manager: TreeSitterManager;

  beforeEach(() => {
    manager = new TreeSitterManager();
  });

  describe('initialization', () => {
    it('should report not ready before initialization', () => {
      expect(manager.isReady()).toBe(false);
    });

    it('should attempt initialization without crashing', async () => {
      // This will either succeed (if native bindings are available) or
      // gracefully return false -- either way it should not throw.
      const result = await manager.initialize();
      expect(typeof result).toBe('boolean');
    });

    it('should report ready status matching initialization result', async () => {
      const result = await manager.initialize();
      expect(manager.isReady()).toBe(result);
    });
  });

  describe('when tree-sitter is unavailable', () => {
    it('openDocument should return null', () => {
      // Not initialized -- tree-sitter unavailable
      const tree = manager.openDocument('file:///test.holo', 'orb test {}', 1);
      expect(tree).toBeNull();
    });

    it('updateDocument should return null', () => {
      const tree = manager.updateDocument('file:///test.holo', 'orb test {}', 2, []);
      expect(tree).toBeNull();
    });

    it('extractDiagnostics should return empty array', () => {
      const diags = manager.extractDiagnostics('file:///test.holo');
      expect(diags).toEqual([]);
    });

    it('getTree should return null', () => {
      expect(manager.getTree('file:///test.holo')).toBeNull();
    });

    it('closeDocument should not throw', () => {
      expect(() => manager.closeDocument('file:///test.holo')).not.toThrow();
    });
  });

  // The remaining tests are conditional on native bindings being available
  describe('with native bindings (integration)', () => {
    let available = false;

    beforeEach(async () => {
      manager = new TreeSitterManager();
      available = await manager.initialize();
    });

    it('should parse a valid HoloScript document', () => {
      if (!available) return; // Skip if bindings not available

      const source = `composition "TestScene" {
  object "Cube" {
    position: [0, 1, 0]
    scale: [1, 1, 1]
  }
}`;
      const tree = manager.openDocument('file:///test.holo', source, 1);
      expect(tree).not.toBeNull();
      expect(tree!.rootNode).toBeDefined();
      expect(tree!.rootNode.type).toBe('source_file');
      expect(tree!.rootNode.hasError).toBe(false);
    });

    it('should detect syntax errors', () => {
      if (!available) return;

      const source = `composition "Broken" {
  object "Cube" {
    position: [0, 1,
  }
}`;
      manager.openDocument('file:///broken.holo', source, 1);
      const diags = manager.extractDiagnostics('file:///broken.holo');
      expect(diags.length).toBeGreaterThan(0);
      expect(diags.some((d) => d.severity === 'error')).toBe(true);
    });

    it('should perform incremental re-parse on edit', () => {
      if (!available) return;

      const original = `composition "Scene" {
  object "Cube" {
    position: [0, 0, 0]
  }
}`;
      manager.openDocument('file:///inc.holo', original, 1);

      // Simulate changing the second 0 to 1 in position: [0, 0, 0]
      // Line 2: "    position: [0, 0, 0]"
      //          0123456789012345678901
      //                                ^ char 18 is the second '0'
      const updated = `composition "Scene" {
  object "Cube" {
    position: [0, 1, 0]
  }
}`;
      const changes: ContentChange[] = [
        {
          range: {
            start: { line: 2, character: 18 },
            end: { line: 2, character: 19 },
          },
          rangeLength: 1,
          text: '1',
        },
      ];

      const newTree = manager.updateDocument('file:///inc.holo', updated, 2, changes);
      expect(newTree).not.toBeNull();
      expect(newTree!.rootNode.hasError).toBe(false);
    });

    it('should fall back to full parse when no previous tree exists', () => {
      if (!available) return;

      const source = `world "Test" { }`;
      const tree = manager.updateDocument('file:///new.holo', source, 1, []);
      expect(tree).not.toBeNull();
      expect(tree!.rootNode.type).toBe('source_file');
    });

    it('should handle full document replacement (no range in change)', () => {
      if (!available) return;

      const original = `composition "A" { }`;
      manager.openDocument('file:///replace.holo', original, 1);

      const replacement = `composition "B" {
  object "Sphere" {
    position: [1, 2, 3]
  }
}`;
      const changes: ContentChange[] = [{ text: replacement }];
      const tree = manager.updateDocument('file:///replace.holo', replacement, 2, changes);
      expect(tree).not.toBeNull();
      expect(tree!.rootNode.hasError).toBe(false);
    });

    it('should clean up on closeDocument', () => {
      if (!available) return;

      manager.openDocument('file:///close.holo', 'world "X" {}', 1);
      expect(manager.getTree('file:///close.holo')).not.toBeNull();

      manager.closeDocument('file:///close.holo');
      expect(manager.getTree('file:///close.holo')).toBeNull();
      expect(manager.extractDiagnostics('file:///close.holo')).toEqual([]);
    });

    it('should handle multiple sequential edits in one change batch', () => {
      if (!available) return;

      const original = `composition "Multi" {
  object "A" {
    position: [0, 0, 0]
    scale: [1, 1, 1]
  }
}`;
      manager.openDocument('file:///multi.holo', original, 1);

      // Two changes in one batch:
      // 1. Change position value
      // 2. Change scale value
      // Note: each change is relative to the state AFTER the previous one
      const afterChange1 = original.replace('[0, 0, 0]', '[1, 2, 3]');
      const afterBoth = afterChange1.replace('[1, 1, 1]', '[2, 2, 2]');

      const changes: ContentChange[] = [
        {
          range: {
            start: { line: 2, character: 15 },
            end: { line: 2, character: 24 },
          },
          text: '[1, 2, 3]',
        },
        {
          range: {
            start: { line: 3, character: 11 },
            end: { line: 3, character: 20 },
          },
          text: '[2, 2, 2]',
        },
      ];

      const tree = manager.updateDocument('file:///multi.holo', afterBoth, 2, changes);
      expect(tree).not.toBeNull();
      expect(tree!.rootNode.hasError).toBe(false);
    });

    it('should provide error diagnostics with accurate line numbers', () => {
      if (!available) return;

      const source = `composition "Errors" {
  object "Good" {
    position: [0, 0, 0]
  }
  object "Bad" {
    position: [broken syntax here
  }
}`;
      manager.openDocument('file:///errors.holo', source, 1);
      const diags = manager.extractDiagnostics('file:///errors.holo');
      expect(diags.length).toBeGreaterThan(0);

      // The error should be somewhere around line 5-6 (0-indexed)
      const errorDiag = diags.find((d) => d.severity === 'error');
      expect(errorDiag).toBeDefined();
      expect(errorDiag!.startLine).toBeGreaterThanOrEqual(4);
    });

    it('should return no diagnostics for valid documents', () => {
      if (!available) return;

      const source = `composition "Valid" {
  environment {
    sky: "sunset"
    ground: true
  }
  object "Cube" @grabbable {
    position: [0, 1, 0]
    scale: [1, 1, 1]
  }
}`;
      manager.openDocument('file:///valid.holo', source, 1);
      const diags = manager.extractDiagnostics('file:///valid.holo');
      expect(diags).toEqual([]);
    });

    it('should expose the language object', () => {
      if (!available) return;
      expect(manager.getLanguage()).not.toBeNull();
    });
  });
});
