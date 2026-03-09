/**
 * Tests for RelayService
 *
 * Validates the Relay Service ("Brain" of Director Mode) that handles
 * bidirectional communication between the Runtime (Preview Panel) and the
 * Editor, including:
 *   - Transform updates (position, rotation, scale)
 *   - Voice command handling
 *   - Asset injection
 *   - Singleton lifecycle
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock vscode
// ---------------------------------------------------------------------------

const mockEditBuilder = {
  replace: vi.fn(),
  insert: vi.fn(),
};

const mockEditor = {
  edit: vi.fn((callback: (eb: typeof mockEditBuilder) => void) => {
    callback(mockEditBuilder);
    return Promise.resolve(true);
  }),
};

vi.mock('vscode', () => ({
  window: {
    showTextDocument: vi.fn().mockImplementation(() => {
      return Promise.resolve(mockEditor);
    }),
    showInformationMessage: vi.fn(),
  },
  workspace: {},
  Position: class {
    line: number;
    character: number;
    constructor(line: number, character: number) {
      this.line = line;
      this.character = character;
    }
  },
  Range: class {
    start: any;
    end: any;
    constructor(start: any, end: any) {
      this.start = start;
      this.end = end;
    }
  },
}));

import { RelayService } from '../services/RelayService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDocument(text: string) {
  const lines = text.split('\n');
  return {
    getText: vi.fn(() => text),
    positionAt: vi.fn((offset: number) => {
      let remaining = offset;
      for (let line = 0; line < lines.length; line++) {
        if (remaining <= lines[line].length) {
          return { line, character: remaining };
        }
        remaining -= lines[line].length + 1; // +1 for \n
      }
      return { line: lines.length - 1, character: 0 };
    }),
    lineAt: vi.fn((line: number) => {
      const lineText = lines[line] || '';
      const firstNonWhitespace = lineText.search(/\S/);
      return {
        text: lineText,
        firstNonWhitespaceCharacterIndex: firstNonWhitespace === -1 ? 0 : firstNonWhitespace,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RelayService', () => {
  let relay: RelayService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton between tests
    (RelayService as any).instance = undefined;
    relay = RelayService.getInstance();
  });

  // ── Singleton ───────────────────────────────────────────────────────────

  describe('singleton pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const a = RelayService.getInstance();
      const b = RelayService.getInstance();
      expect(a).toBe(b);
    });
  });

  // ── handleMessage routing ──────────────────────────────────────────────

  describe('handleMessage', () => {
    it('should route "transform" messages to handleTransformUpdate', async () => {
      const doc = createMockDocument('orb TestObj {\n  position: [0, 0, 0]\n}');

      await relay.handleMessage(
        {
          type: 'transform',
          id: 'TestObj',
          position: [1, 2, 3],
        },
        doc as any
      );

      // The editor.edit should have been called
      expect(mockEditor.edit).toHaveBeenCalled();
    });

    it('should route "voice_command" messages', async () => {
      const vscode = await import('vscode');
      const doc = createMockDocument('orb Test {}');

      await relay.handleMessage({ type: 'voice_command', text: 'create a sphere' }, doc as any);

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('create a sphere')
      );
    });

    it('should route "inject_asset" messages', async () => {
      const doc = createMockDocument('// scene\n');

      await relay.handleMessage(
        { type: 'inject_asset', assetId: 'cube', assetType: 'primitive' },
        doc as any
      );

      expect(mockEditor.edit).toHaveBeenCalled();
      expect(mockEditBuilder.insert).toHaveBeenCalled();
    });

    it('should handle unknown message types without error', async () => {
      const doc = createMockDocument('test');

      // Should not throw
      await relay.handleMessage({ type: 'unknown_type', data: {} }, doc as any);
    });
  });

  // ── Transform updates ─────────────────────────────────────────────────

  describe('transform updates', () => {
    it('should update position in an existing object block', async () => {
      const doc = createMockDocument('orb TestCube {\n  position: [0, 0, 0]\n  color: "red"\n}');

      await relay.handleMessage(
        {
          type: 'transform',
          id: 'TestCube',
          position: [5.123, 2.456, 3.789],
        },
        doc as any
      );

      expect(mockEditor.edit).toHaveBeenCalled();
      // The replace call should contain the formatted position
      expect(mockEditBuilder.replace).toHaveBeenCalled();
      const replaceCall = mockEditBuilder.replace.mock.calls[0];
      expect(replaceCall[1]).toContain('position: [5.123, 2.456, 3.789]');
    });

    it('should update rotation when provided', async () => {
      const doc = createMockDocument('orb TestCube {\n  rotation: [0, 0, 0]\n}');

      await relay.handleMessage(
        {
          type: 'transform',
          id: 'TestCube',
          rotation: [0.5, 1.0, 0.0],
        },
        doc as any
      );

      expect(mockEditBuilder.replace).toHaveBeenCalled();
      const replaceCall = mockEditBuilder.replace.mock.calls[0];
      expect(replaceCall[1]).toContain('rotation: [0.5, 1, 0]');
    });

    it('should update scale when provided', async () => {
      const doc = createMockDocument('orb TestCube {\n  scale: [1, 1, 1]\n}');

      await relay.handleMessage(
        {
          type: 'transform',
          id: 'TestCube',
          scale: [2.0, 2.0, 2.0],
        },
        doc as any
      );

      expect(mockEditBuilder.replace).toHaveBeenCalled();
      const replaceCall = mockEditBuilder.replace.mock.calls[0];
      expect(replaceCall[1]).toContain('scale: [2, 2, 2]');
    });

    it('should insert property when it does not exist', async () => {
      const doc = createMockDocument('orb TestCube {\n  color: "red"\n}');

      await relay.handleMessage(
        {
          type: 'transform',
          id: 'TestCube',
          position: [1, 2, 3],
        },
        doc as any
      );

      // Should call insert (not replace) because position does not exist
      expect(mockEditBuilder.insert).toHaveBeenCalled();
    });

    it('should warn when object is not found in document', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const doc = createMockDocument('orb Other { }');

      await relay.handleMessage(
        {
          type: 'transform',
          id: 'NonExistent',
          position: [1, 2, 3],
        },
        doc as any
      );

      // editor.edit should not have been called
      expect(mockEditor.edit).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle object keyword as well as orb', async () => {
      const doc = createMockDocument('object "MyObj" {\n  position: [0, 0, 0]\n}');

      await relay.handleMessage(
        {
          type: 'transform',
          id: 'MyObj',
          position: [10, 20, 30],
        },
        doc as any
      );

      expect(mockEditor.edit).toHaveBeenCalled();
    });

    it('should format numbers to 3 decimal places', async () => {
      const doc = createMockDocument('orb Box {\n  position: [0, 0, 0]\n}');

      await relay.handleMessage(
        {
          type: 'transform',
          id: 'Box',
          position: [1.123456789, 2.987654321, 3.000001],
        },
        doc as any
      );

      const replaceCall = mockEditBuilder.replace.mock.calls[0];
      // Values should be truncated to 3 decimal places
      expect(replaceCall[1]).toContain('1.123');
      expect(replaceCall[1]).toContain('2.988');
      expect(replaceCall[1]).toContain('3');
    });
  });

  // ── Asset injection ────────────────────────────────────────────────────

  describe('asset injection', () => {
    it('should inject a cube snippet', async () => {
      const doc = createMockDocument('// scene');

      await relay.handleMessage(
        { type: 'inject_asset', assetId: 'cube', assetType: 'primitive' },
        doc as any
      );

      const insertCall = mockEditBuilder.insert.mock.calls[0];
      const snippet = insertCall[1];
      expect(snippet).toContain('model: "cube"');
      expect(snippet).toContain('color: "cyan"');
      expect(snippet).toContain('@physics');
      expect(snippet).toContain('@grabbable');
    });

    it('should inject a sphere snippet', async () => {
      const doc = createMockDocument('// scene');

      await relay.handleMessage(
        { type: 'inject_asset', assetId: 'sphere', assetType: 'primitive' },
        doc as any
      );

      const insertCall = mockEditBuilder.insert.mock.calls[0];
      expect(insertCall[1]).toContain('model: "sphere"');
      expect(insertCall[1]).toContain('color: "magenta"');
    });

    it('should inject a light snippet', async () => {
      const doc = createMockDocument('// scene');

      await relay.handleMessage(
        { type: 'inject_asset', assetId: 'light', assetType: 'light' },
        doc as any
      );

      const insertCall = mockEditBuilder.insert.mock.calls[0];
      expect(insertCall[1]).toContain('type: "light"');
    });

    it('should inject a chair snippet', async () => {
      const doc = createMockDocument('// scene');

      await relay.handleMessage(
        { type: 'inject_asset', assetId: 'chair', assetType: 'furniture' },
        doc as any
      );

      const insertCall = mockEditBuilder.insert.mock.calls[0];
      expect(insertCall[1]).toContain('model: "chair"');
    });

    it('should inject a tree snippet', async () => {
      const doc = createMockDocument('// scene');

      await relay.handleMessage(
        { type: 'inject_asset', assetId: 'tree', assetType: 'nature' },
        doc as any
      );

      const insertCall = mockEditBuilder.insert.mock.calls[0];
      expect(insertCall[1]).toContain('model: "tree"');
    });

    it('should inject a robot snippet', async () => {
      const doc = createMockDocument('// scene');

      await relay.handleMessage(
        { type: 'inject_asset', assetId: 'robot', assetType: 'npc' },
        doc as any
      );

      const insertCall = mockEditBuilder.insert.mock.calls[0];
      expect(insertCall[1]).toContain('model: "robot"');
      expect(insertCall[1]).toContain('ai:');
    });

    it('should inject default cube for unknown asset ids', async () => {
      const doc = createMockDocument('// scene');

      await relay.handleMessage(
        {
          type: 'inject_asset',
          assetId: 'unknown_asset',
          assetType: 'custom',
        },
        doc as any
      );

      const insertCall = mockEditBuilder.insert.mock.calls[0];
      expect(insertCall[1]).toContain('model: "cube"');
    });

    it('should generate unique names with timestamp suffix', async () => {
      const doc = createMockDocument('// scene');

      await relay.handleMessage(
        { type: 'inject_asset', assetId: 'cube', assetType: 'primitive' },
        doc as any
      );

      const insertCall = mockEditBuilder.insert.mock.calls[0];
      // Name should contain "cube_" followed by a 4-digit timestamp suffix
      expect(insertCall[1]).toMatch(/cube_\d{4}/);
    });

    it('should show information message after injection', async () => {
      const vscode = await import('vscode');
      const doc = createMockDocument('// scene');

      await relay.handleMessage(
        { type: 'inject_asset', assetId: 'sphere', assetType: 'primitive' },
        doc as any
      );

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Director Mode: Injected')
      );
    });
  });

  // ── dispose ────────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('should not throw when disposing', () => {
      expect(() => relay.dispose()).not.toThrow();
    });
  });
});
