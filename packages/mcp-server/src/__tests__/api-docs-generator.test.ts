/**
 * APIDocsGenerator tests — v5.9 "Developer Portal"
 */

import { describe, it, expect } from 'vitest';
import { APIDocsGenerator } from '../api-docs-generator';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: overrides.name || 'test_tool',
    description: overrides.description || 'A test tool',
    inputSchema: overrides.inputSchema || {
      type: 'object' as const,
      properties: {
        input: { type: 'string', description: 'Input value' },
      },
      required: ['input'],
    },
  };
}

describe('APIDocsGenerator', () => {
  const generator = new APIDocsGenerator();

  // ===========================================================================
  // BASIC GENERATION
  // ===========================================================================

  describe('generate', () => {
    it('generates reference from tools', () => {
      const tools = [
        makeTool({ name: 'parse_hs', description: 'Parse HoloScript' }),
        makeTool({ name: 'explain_code', description: 'Explain code' }),
      ];
      const ref = generator.generate(tools);

      expect(ref.totalTools).toBe(2);
      expect(ref.categories.length).toBeGreaterThan(0);
      expect(ref.version).toBe('5.9.0');
      expect(ref.generatedAt).toBeDefined();
    });

    it('groups tools by category', () => {
      const tools = [
        makeTool({ name: 'parse_hs' }),
        makeTool({ name: 'parse_holo' }),
        makeTool({ name: 'explain_code' }),
      ];
      const ref = generator.generate(tools);

      const parseCategory = ref.categories.find((c) => c.name === 'Parsing & Validation');
      expect(parseCategory).toBeDefined();
      expect(parseCategory!.tools).toHaveLength(2);
    });
  });

  // ===========================================================================
  // TOOL DOCUMENTATION
  // ===========================================================================

  describe('tool documentation', () => {
    it('documents parameters', () => {
      const tool = makeTool({
        name: 'test_tool',
        inputSchema: {
          type: 'object' as const,
          properties: {
            code: { type: 'string', description: 'Source code' },
            format: { type: 'string', description: 'Format', enum: ['json', 'yaml'] },
            verbose: { type: 'boolean', description: 'Verbose', default: false },
          },
          required: ['code'],
        },
      });
      const ref = generator.generate([tool]);
      const doc = ref.categories[0].tools[0];

      expect(doc.parameters).toHaveLength(3);
      expect(doc.parameters[0].name).toBe('code');
      expect(doc.parameters[0].required).toBe(true);
      expect(doc.parameters[1].enumValues).toEqual(['json', 'yaml']);
      expect(doc.parameters[2].defaultValue).toBe(false);
    });

    it('generates usage examples', () => {
      const tool = makeTool({
        name: 'parse_hs',
        inputSchema: {
          type: 'object' as const,
          properties: {
            code: { type: 'string', description: 'Code' },
          },
          required: ['code'],
        },
      });
      const ref = generator.generate([tool]);
      const doc = ref.categories[0].tools[0];

      expect(doc.example).toBeDefined();
      const parsed = JSON.parse(doc.example!);
      expect(parsed.tool).toBe('parse_hs');
      expect(parsed.args.code).toBeDefined();
    });
  });

  // ===========================================================================
  // CATEGORIZATION
  // ===========================================================================

  describe('categorization', () => {
    it('categorizes by prefix rules', () => {
      const tools = [
        makeTool({ name: 'graph_traverse' }),
        makeTool({ name: 'ide_completion' }),
        makeTool({ name: 'brittney_chat' }),
        makeTool({ name: 'check_agent_budget' }),
        makeTool({ name: 'unknown_tool' }),
      ];
      const ref = generator.generate(tools);

      expect(ref.categories.find((c) => c.name === 'Graph Analysis')).toBeDefined();
      expect(ref.categories.find((c) => c.name === 'IDE Integration')).toBeDefined();
      expect(ref.categories.find((c) => c.name === 'AI Assistant')).toBeDefined();
      expect(ref.categories.find((c) => c.name === 'Economy')).toBeDefined();
      expect(ref.categories.find((c) => c.name === 'General')).toBeDefined();
    });

    it('provides category descriptions', () => {
      const tools = [makeTool({ name: 'parse_hs' })];
      const ref = generator.generate(tools);
      const cat = ref.categories.find((c) => c.name === 'Parsing & Validation');
      expect(cat!.description).toContain('Parse');
    });
  });

  // ===========================================================================
  // MARKDOWN OUTPUT
  // ===========================================================================

  describe('markdown output', () => {
    it('generates valid markdown', () => {
      const tools = [
        makeTool({ name: 'parse_hs', description: 'Parse code' }),
        makeTool({ name: 'graph_traverse', description: 'Traverse graph' }),
      ];
      const ref = generator.generate(tools);
      const md = generator.toMarkdown(ref);

      expect(md).toContain('# HoloScript MCP API Reference');
      expect(md).toContain('## Table of Contents');
      expect(md).toContain('### `parse_hs`');
      expect(md).toContain('| Parameter |');
    });
  });

  // ===========================================================================
  // JSON OUTPUT
  // ===========================================================================

  describe('JSON output', () => {
    it('generates valid JSON', () => {
      const tools = [makeTool({ name: 'test_tool' })];
      const ref = generator.generate(tools);
      const json = generator.toJSON(ref);

      const parsed = JSON.parse(json);
      expect(parsed.totalTools).toBe(1);
      expect(parsed.categories).toBeDefined();
    });
  });

  // ===========================================================================
  // AUTH DETECTION
  // ===========================================================================

  describe('auth detection', () => {
    it('marks absorb tools as requiring auth', () => {
      const tools = [makeTool({ name: 'absorb_typescript' }), makeTool({ name: 'parse_hs' })];
      const ref = generator.generate(tools);

      const allTools = ref.categories.flatMap((c) => c.tools);
      expect(allTools.find((t) => t.name === 'absorb_typescript')!.requiresAuth).toBe(true);
      expect(allTools.find((t) => t.name === 'parse_hs')!.requiresAuth).toBe(false);
    });
  });
});
