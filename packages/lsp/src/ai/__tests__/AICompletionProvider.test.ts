/**
 * Tests for AI Completion Provider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AICompletionProvider } from '../AICompletionProvider';
import { ContextGatherer } from '../ContextGatherer';
import { PromptBuilder } from '../PromptBuilder';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Mock AI adapter
const mockAdapter = {
  complete: vi.fn(),
  embed: vi.fn(),
  name: 'mock',
};

// Helper to create text document
function createDocument(content: string, uri: string = 'test.hsplus'): TextDocument {
  return TextDocument.create(uri, 'holoscript', 1, content);
}

describe('AICompletionProvider', () => {
  let provider: AICompletionProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AICompletionProvider(mockAdapter as any);
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const p = new AICompletionProvider();
      // Provider should work without adapter (returns empty)
      expect(p).toBeDefined();
    });

    it('should accept custom config', () => {
      const p = new AICompletionProvider(mockAdapter as any, {
        enabled: false,
        maxCompletions: 3,
      });
      expect(p).toBeDefined();
    });

    it('should allow config updates', () => {
      provider.setConfig({ enabled: false });
      // Completions should be disabled now
    });
  });

  describe('getCompletions', () => {
    it('should return empty for disabled provider', async () => {
      provider.setConfig({ enabled: false });

      const doc = createDocument('orb test {\n  @\n}');
      const result = await provider.getCompletions(doc, { line: 1, character: 3 }, '@');

      expect(result.completions).toHaveLength(0);
    });

    it('should return empty without adapter', async () => {
      const p = new AICompletionProvider();

      const doc = createDocument('orb test {\n  @\n}');
      const result = await p.getCompletions(doc, { line: 1, character: 3 }, '@');

      expect(result.completions).toHaveLength(0);
    });

    it('should query AI for trait completions', async () => {
      mockAdapter.complete.mockResolvedValue({
        text: 'grabbable, collidable, physics',
      });

      const doc = createDocument('orb button {\n  @\n}');
      const result = await provider.getCompletions(doc, { line: 1, character: 3 }, '@');

      expect(mockAdapter.complete).toHaveBeenCalled();
      expect(result.completions.length).toBeGreaterThan(0);
    });

    it('should parse trait suggestions correctly', async () => {
      mockAdapter.complete.mockResolvedValue({
        text: 'grabbable, collidable',
      });

      const doc = createDocument('orb item {\n  @\n}');
      const result = await provider.getCompletions(doc, { line: 1, character: 3 }, '@');

      const labels = result.completions.map((c) => c.label);
      expect(labels).toContain('@grabbable');
      expect(labels).toContain('@collidable');
    });

    it('should use cache for repeated requests', async () => {
      mockAdapter.complete.mockResolvedValue({
        text: 'grabbable',
      });

      const doc = createDocument('orb item {\n  @\n}');

      // First request
      await provider.getCompletions(doc, { line: 1, character: 3 }, '@');
      expect(mockAdapter.complete).toHaveBeenCalledTimes(1);

      // Second request - should use cache
      const result2 = await provider.getCompletions(doc, { line: 1, character: 3 }, '@');
      expect(mockAdapter.complete).toHaveBeenCalledTimes(1);
      expect(result2.isFromCache).toBe(true);
    });

    it('should clear cache', () => {
      provider.clearCache();
      // No error means success
    });
  });

  describe('error fixes', () => {
    it('should get error fix suggestions', async () => {
      mockAdapter.complete.mockResolvedValue({
        text: '```hsplus\n@grabbable\n```',
      });

      const doc = createDocument('orb item {\n  @grabaable\n}');
      const fixes = await provider.getErrorFixes(doc, {
        message: 'Unknown trait: @grabaable',
        line: 1,
        column: 3,
      });

      expect(fixes.length).toBeGreaterThan(0);
      expect(fixes[0].label).toContain('Fix');
    });
  });
});

describe('ContextGatherer', () => {
  let gatherer: ContextGatherer;

  beforeEach(() => {
    gatherer = new ContextGatherer();
  });

  describe('gather', () => {
    it('should detect trait context', () => {
      const doc = createDocument('orb test {\n  @\n}');
      const context = gatherer.gather(doc, { line: 1, character: 3 }, '@');

      expect(context.type).toBe('trait');
    });

    it('should detect comment context', () => {
      const doc = createDocument('orb test {\n  // Add health system\n}');
      const context = gatherer.gather(doc, { line: 1, character: 20 });

      expect(context.type).toBe('comment');
    });

    it('should extract object name', () => {
      const doc = createDocument('orb myButton {\n  @grabbable\n}');
      const context = gatherer.gather(doc, { line: 1, character: 5 });

      expect(context.objectName).toBe('myButton');
    });

    it('should extract object type', () => {
      const doc = createDocument('orb myButton {\n  @grabbable\n}');
      const context = gatherer.gather(doc, { line: 1, character: 5 });

      expect(context.objectType).toBe('orb');
    });

    it('should extract existing traits', () => {
      const doc = createDocument('orb item {\n  @grabbable\n  @collidable\n  @\n}');
      const context = gatherer.gather(doc, { line: 3, character: 3 }, '@');

      expect(context.existingTraits).toContain('grabbable');
      expect(context.existingTraits).toContain('collidable');
    });

    it('should handle property context', () => {
      const doc = createDocument('orb item {\n  position:\n}');
      const context = gatherer.gather(doc, { line: 1, character: 11 });

      expect(context.type).toBe('value');
    });

    it('should include line prefix and suffix', () => {
      const doc = createDocument('orb item {\n  @grab\n}');
      const context = gatherer.gather(doc, { line: 1, character: 6 });

      expect(context.linePrefix).toBe('  @gra');
      expect(context.lineSuffix).toBe('b');
    });
  });

  describe('error context', () => {
    it('should gather error context', () => {
      const doc = createDocument('orb item {\n  @unknown\n}');
      const context = gatherer.gatherErrorContext(doc, {
        message: 'Unknown trait',
        line: 1,
        column: 3,
      });

      expect(context.errorMessage).toBe('Unknown trait');
      expect(context.errorLine).toBe(1);
    });
  });
});

describe('PromptBuilder', () => {
  let builder: PromptBuilder;

  beforeEach(() => {
    builder = new PromptBuilder();
  });

  describe('buildTraitPrompt', () => {
    it('should include object information', () => {
      const prompt = builder.buildTraitPrompt({
        type: 'trait',
        linePrefix: '@',
        lineSuffix: '',
        fullLine: '  @',
        objectName: 'myButton',
        objectType: 'orb',
        existingTraits: ['grabbable'],
        indentLevel: 1,
        line: 1,
        column: 3,
        surroundingLines: ['orb myButton {', '  @', '}'],
      });

      expect(prompt).toContain('myButton');
      expect(prompt).toContain('orb');
      expect(prompt).toContain('grabbable');
    });

    it('should include instructions for trait suggestions', () => {
      const prompt = builder.buildTraitPrompt({
        type: 'trait',
        linePrefix: '@',
        lineSuffix: '',
        fullLine: '  @',
        indentLevel: 1,
        line: 1,
        column: 3,
        surroundingLines: ['orb item {', '  @', '}'],
      });

      expect(prompt).toContain('trait');
    });
  });

  describe('buildCodeGenPrompt', () => {
    it('should include comment text', () => {
      const prompt = builder.buildCodeGenPrompt({
        type: 'comment',
        linePrefix: '// Create a health system',
        lineSuffix: '',
        fullLine: '// Create a health system',
        comment: 'Create a health system',
        indentLevel: 1,
        line: 1,
        column: 25,
        surroundingLines: ['orb player {', '// Create a health system', '}'],
      });

      expect(prompt).toContain('Create a health system');
    });
  });

  describe('buildErrorFixPrompt', () => {
    it('should include error message', () => {
      const prompt = builder.buildErrorFixPrompt(
        {
          type: 'trait',
          linePrefix: '@grabaable',
          lineSuffix: '',
          fullLine: '  @grabaable',
          indentLevel: 1,
          line: 1,
          column: 3,
          errorMessage: 'Unknown trait: @grabaable',
          errorLine: 1,
          errorColumn: 3,
          surroundingLines: ['orb item {', '  @grabaable', '}'],
        },
        {
          message: 'Unknown trait: @grabaable',
          line: 1,
          column: 3,
        }
      );

      expect(prompt).toContain('Unknown trait');
      expect(prompt).toContain('grabaable');
    });
  });
});
