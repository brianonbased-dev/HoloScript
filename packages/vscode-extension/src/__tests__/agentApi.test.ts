/**
 * Tests for HoloScriptAgentAPI
 *
 * Validates the Agent API that enables AI agents (Brittney, Claude, etc.)
 * to programmatically control the HoloScript VS Code extension:
 *   - Singleton lifecycle
 *   - Object generation from descriptions
 *   - Trait listing and filtering
 *   - Syntax validation
 *   - Scene analysis
 *   - Extension status
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock vscode before importing the module under test
vi.mock('vscode', () => ({
  window: {
    activeTextEditor: undefined,
    showTextDocument: vi.fn().mockResolvedValue({
      edit: vi.fn().mockResolvedValue(true),
      selection: { active: { line: 0, character: 0 } },
    }),
    showInformationMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: '/mock/workspace' },
      },
    ],
    openTextDocument: vi.fn().mockResolvedValue({
      getText: vi.fn().mockReturnValue(''),
      fileName: 'test.holo',
      languageId: 'holoscript',
    }),
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
    })),
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
  },
  env: {
    machineId: 'test1234',
  },
  CompletionItemKind: { Keyword: 13 },
  CompletionItem: class {
    label: string;
    kind?: number;
    constructor(label: string, kind?: number) {
      this.label = label;
      this.kind = kind;
    }
  },
  SnippetString: class {
    value: string;
    constructor(value: string) {
      this.value = value;
    }
  },
  MarkdownString: class {
    value: string;
    constructor(value = '') {
      this.value = value;
    }
    appendMarkdown(v: string) {
      this.value += v;
      return this;
    }
    appendCodeblock(v: string) {
      this.value += v;
      return this;
    }
  },
}));

// Mock http to prevent real network calls from broadcastAgentTelemetry
vi.mock('http', () => ({
  request: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    write: vi.fn(),
    end: vi.fn(),
  })),
}));

// Mock fs for createHoloFile
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock previewPanel
vi.mock('../previewPanel', () => ({
  HoloScriptPreviewPanel: {
    currentPanel: undefined,
    createOrShow: vi.fn(),
  },
}));

import { HoloScriptAgentAPI, agentAPI } from '../agentApi';
import type {
  AgentResponse,
  GenerateObjectRequest,
  SceneAnalysis,
} from '../agentApi';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HoloScriptAgentAPI', () => {
  // ── Singleton ───────────────────────────────────────────────────────────

  describe('singleton pattern', () => {
    it('should return the same instance from getInstance()', () => {
      const a = HoloScriptAgentAPI.getInstance();
      const b = HoloScriptAgentAPI.getInstance();
      expect(a).toBe(b);
    });

    it('should export agentAPI as the singleton', () => {
      expect(agentAPI).toBe(HoloScriptAgentAPI.getInstance());
    });
  });

  // ── generateObject ─────────────────────────────────────────────────────

  describe('generateObject', () => {
    let api: HoloScriptAgentAPI;

    beforeEach(() => {
      api = HoloScriptAgentAPI.getInstance();
    });

    it('should return success with generated code', async () => {
      const result = await api.generateObject({
        description: 'a red ball',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as any;
      expect(data.code).toBeDefined();
      expect(typeof data.code).toBe('string');
      expect(data.objectName).toBe('ARedBall' || 'ARed');
    });

    it('should default to hsplus format', async () => {
      const result = await api.generateObject({
        description: 'a cube',
      });

      const data = result.data as any;
      expect(data.format).toBe('hsplus');
      expect(data.code).toContain('orb');
    });

    it('should generate holo format when requested', async () => {
      const result = await api.generateObject({
        description: 'a cube',
        format: 'holo',
      });

      const data = result.data as any;
      expect(data.code).toContain('object');
    });

    it('should auto-detect @grabbable from "grab" in description', async () => {
      const result = await api.generateObject({
        description: 'a box you can grab',
      });

      const data = result.data as any;
      expect(data.suggestedTraits).toContain('@grabbable');
    });

    it('should auto-detect @throwable from "throw" in description', async () => {
      const result = await api.generateObject({
        description: 'a ball you can throw',
      });

      const data = result.data as any;
      expect(data.suggestedTraits).toContain('@throwable');
    });

    it('should auto-detect @collidable from "solid" in description', async () => {
      const result = await api.generateObject({
        description: 'a solid wall',
      });

      const data = result.data as any;
      expect(data.suggestedTraits).toContain('@collidable');
    });

    it('should auto-detect @glowing from "glow" in description', async () => {
      const result = await api.generateObject({
        description: 'a glowing orb',
      });

      const data = result.data as any;
      expect(data.suggestedTraits).toContain('@glowing');
    });

    it('should auto-detect @clickable from "button" in description', async () => {
      const result = await api.generateObject({
        description: 'a button',
      });

      const data = result.data as any;
      expect(data.suggestedTraits).toContain('@clickable');
    });

    it('should auto-detect @networked from "multiplayer" in description', async () => {
      const result = await api.generateObject({
        description: 'a multiplayer scoreboard',
      });

      const data = result.data as any;
      expect(data.suggestedTraits).toContain('@networked');
    });

    it('should auto-detect @physics from "gravity" in description', async () => {
      const result = await api.generateObject({
        description: 'a crate with gravity',
      });

      const data = result.data as any;
      expect(data.suggestedTraits).toContain('@physics');
    });

    it('should auto-detect @stackable from "stack" in description', async () => {
      const result = await api.generateObject({
        description: 'blocks that stack',
      });

      const data = result.data as any;
      expect(data.suggestedTraits).toContain('@stackable');
    });

    it('should auto-detect @hoverable from "hover" in description', async () => {
      const result = await api.generateObject({
        description: 'an icon that reacts to hover',
      });

      const data = result.data as any;
      expect(data.suggestedTraits).toContain('@hoverable');
    });

    it('should include explicitly passed traits', async () => {
      const result = await api.generateObject({
        description: 'a generic widget',
        traits: ['@transparent', '@billboard'],
      });

      const data = result.data as any;
      expect(data.suggestedTraits).toContain('@transparent');
      expect(data.suggestedTraits).toContain('@billboard');
    });

    it('should deduplicate auto-detected and explicit traits', async () => {
      const result = await api.generateObject({
        description: 'a glowing light',
        traits: ['@glowing'],
      });

      const data = result.data as any;
      const glowCount = data.suggestedTraits.filter(
        (t: string) => t === '@glowing'
      ).length;
      expect(glowCount).toBe(1);
    });

    it('should derive object name from first two words of description', async () => {
      const result = await api.generateObject({
        description: 'magic crystal ball with physics',
      });

      const data = result.data as any;
      expect(data.objectName).toBe('MagicCrystal');
    });
  });

  // ── listTraits ──────────────────────────────────────────────────────────

  describe('listTraits', () => {
    let api: HoloScriptAgentAPI;

    beforeEach(() => {
      api = HoloScriptAgentAPI.getInstance();
    });

    it('should return all trait categories when no filter', async () => {
      const result = await api.listTraits();

      expect(result.success).toBe(true);
      const data = result.data as Record<string, string[]>;
      expect(Object.keys(data)).toContain('interaction');
      expect(Object.keys(data)).toContain('physics');
      expect(Object.keys(data)).toContain('visual');
      expect(Object.keys(data)).toContain('networking');
      expect(Object.keys(data)).toContain('behavior');
      expect(Object.keys(data)).toContain('spatial');
      expect(Object.keys(data)).toContain('audio');
      expect(Object.keys(data)).toContain('state');
    });

    it('should return only requested category', async () => {
      const result = await api.listTraits('interaction');

      expect(result.success).toBe(true);
      const data = result.data as Record<string, string[]>;
      expect(Object.keys(data)).toEqual(['interaction']);
      expect(data.interaction).toContain('@grabbable');
    });

    it('should return all categories for unknown category', async () => {
      const result = await api.listTraits('nonexistent');

      expect(result.success).toBe(true);
      const data = result.data as Record<string, string[]>;
      expect(Object.keys(data).length).toBeGreaterThan(1);
    });
  });

  // ── validateSyntax ─────────────────────────────────────────────────────

  describe('validateSyntax', () => {
    let api: HoloScriptAgentAPI;

    beforeEach(() => {
      api = HoloScriptAgentAPI.getInstance();
    });

    it('should validate balanced braces as valid', async () => {
      const result = await api.validateSyntax(
        'orb test {\n  @grabbable\n  position: [0, 1, 0]\n}'
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.valid).toBe(true);
      expect(data.errors).toHaveLength(0);
    });

    it('should detect unbalanced braces', async () => {
      const result = await api.validateSyntax(
        'orb test {\n  @grabbable\n  position: [0, 1, 0]\n'
      );

      expect(result.success).toBe(false);
      const data = result.data as any;
      expect(data.valid).toBe(false);
      expect(data.errors.length).toBeGreaterThan(0);
      expect(data.errors[0].message).toContain('Unbalanced braces');
    });

    it('should report line count', async () => {
      const content = 'line 1\nline 2\nline 3';
      const result = await api.validateSyntax(content);

      const data = result.data as any;
      expect(data.lineCount).toBe(3);
    });

    it('should return error when no content provided and no editor', async () => {
      const result = await api.validateSyntax();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No content to validate');
    });

    it('should handle strings with braces inside quotes', async () => {
      const result = await api.validateSyntax(
        'orb test {\n  name: "hello {world}"\n}'
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.valid).toBe(true);
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────

  describe('getStatus', () => {
    let api: HoloScriptAgentAPI;

    beforeEach(() => {
      api = HoloScriptAgentAPI.getInstance();
    });

    it('should return success with extension info', async () => {
      const result = await api.getStatus();

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.extensionVersion).toBe('1.2.0');
      expect(data.capabilities).toBeInstanceOf(Array);
      expect(data.capabilities.length).toBeGreaterThan(0);
    });

    it('should list all agent command capabilities', async () => {
      const result = await api.getStatus();
      const data = result.data as any;

      expect(data.capabilities).toContain('holoscript.agent.createFile');
      expect(data.capabilities).toContain('holoscript.agent.generateObject');
      expect(data.capabilities).toContain('holoscript.agent.analyzeScene');
      expect(data.capabilities).toContain('holoscript.agent.insertCode');
      expect(data.capabilities).toContain('holoscript.agent.openPreview');
      expect(data.capabilities).toContain('holoscript.agent.addTrait');
      expect(data.capabilities).toContain('holoscript.agent.listTraits');
      expect(data.capabilities).toContain('holoscript.agent.validate');
      expect(data.capabilities).toContain('holoscript.agent.status');
    });

    it('should report workspace status', async () => {
      const result = await api.getStatus();
      const data = result.data as any;

      expect(typeof data.workspaceOpen).toBe('boolean');
    });
  });

  // ── analyzeCurrentScene (no active editor) ─────────────────────────────

  describe('analyzeCurrentScene', () => {
    let api: HoloScriptAgentAPI;

    beforeEach(() => {
      api = HoloScriptAgentAPI.getInstance();
    });

    it('should return error when no HoloScript file is open', async () => {
      const result = await api.analyzeCurrentScene();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No HoloScript file open');
    });
  });

  // ── insertCodeAtCursor (no active editor) ──────────────────────────────

  describe('insertCodeAtCursor', () => {
    let api: HoloScriptAgentAPI;

    beforeEach(() => {
      api = HoloScriptAgentAPI.getInstance();
    });

    it('should return error when no active editor', async () => {
      const result = await api.insertCodeAtCursor('@grabbable');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active editor');
    });
  });

  // ── openPreview (not initialized) ──────────────────────────────────────

  describe('openPreview', () => {
    let api: HoloScriptAgentAPI;

    beforeEach(() => {
      api = HoloScriptAgentAPI.getInstance();
    });

    it('should return error when extension context is not initialized', async () => {
      const result = await api.openPreview();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Extension not initialized');
    });
  });

  // ── addTraitToObject (no active editor) ────────────────────────────────

  describe('addTraitToObject', () => {
    let api: HoloScriptAgentAPI;

    beforeEach(() => {
      api = HoloScriptAgentAPI.getInstance();
    });

    it('should return error when no HoloScript file is open', async () => {
      const result = await api.addTraitToObject('MyObject', '@physics');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No HoloScript file open');
    });
  });
});
