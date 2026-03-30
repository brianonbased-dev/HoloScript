/**
 * Tests for Knowledge Extraction MCP Tools
 *
 * Verifies the absorb_extract_knowledge tool handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodebaseGraph } from '../../engine/CodebaseGraph';
import type { ScannedFile } from '../../engine/types';
import {
  handleKnowledgeExtractionTool,
  setKnowledgeExtractionGraph,
  knowledgeExtractionTools,
} from '../knowledge-extraction-tools';

// =============================================================================
// HELPERS
// =============================================================================

function makeFile(overrides: Partial<ScannedFile> & { path: string }): ScannedFile {
  return {
    language: 'typescript',
    symbols: [],
    imports: [],
    calls: [],
    loc: 50,
    sizeBytes: 1000,
    ...overrides,
  };
}

function buildGraph(files: ScannedFile[]): CodebaseGraph {
  const graph = new CodebaseGraph();
  graph.buildFromScanResult({
    rootDir: '/project',
    files,
    stats: {
      totalFiles: files.length,
      filesByLanguage: {},
      totalSymbols: files.reduce((s, f) => s + f.symbols.length, 0),
      symbolsByType: {},
      totalImports: files.reduce((s, f) => s + f.imports.length, 0),
      totalCalls: files.reduce((s, f) => s + f.calls.length, 0),
      totalLoc: files.reduce((s, f) => s + f.loc, 0),
      durationMs: 0,
      errors: [],
    },
  });
  return graph;
}

function parseResponse(result: { content: Array<{ type: string; text: string }> }): any {
  return JSON.parse(result.content[0].text);
}

// =============================================================================
// TESTS
// =============================================================================

describe('knowledge-extraction-tools', () => {
  afterEach(() => {
    setKnowledgeExtractionGraph(null);
  });

  describe('tool definitions', () => {
    it('exports exactly one tool', () => {
      expect(knowledgeExtractionTools).toHaveLength(1);
      expect(knowledgeExtractionTools[0].name).toBe('absorb_extract_knowledge');
    });

    it('tool has valid input schema', () => {
      const tool = knowledgeExtractionTools[0];
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    });
  });

  describe('handleKnowledgeExtractionTool', () => {
    it('returns error when no graph is loaded', async () => {
      const result = await handleKnowledgeExtractionTool('absorb_extract_knowledge', {});
      const data = parseResponse(result);
      expect(data.error).toContain('No codebase graph loaded');
    });

    it('returns error for unknown tool name', async () => {
      const result = await handleKnowledgeExtractionTool('unknown_tool', {});
      const data = parseResponse(result);
      expect(data.error).toContain('Unknown tool');
    });

    it('extracts knowledge from a loaded graph', async () => {
      const graph = buildGraph([
        makeFile({
          path: 'src/app.ts',
          symbols: [{ name: 'App', type: 'class', filePath: 'src/app.ts', line: 1, language: 'typescript', visibility: 'public' }],
          loc: 150,
        }),
        makeFile({
          path: 'src/utils.ts',
          symbols: [{ name: 'helper', type: 'function', filePath: 'src/utils.ts', line: 1, language: 'typescript', visibility: 'public' }],
          imports: [{ fromFile: 'src/utils.ts', toModule: './app', resolvedPath: 'src/app.ts', line: 1 }],
          loc: 80,
        }),
      ]);
      setKnowledgeExtractionGraph(graph);

      const result = await handleKnowledgeExtractionTool('absorb_extract_knowledge', {});
      const data = parseResponse(result);

      expect(data.success).toBe(true);
      expect(data.entries).toBeDefined();
      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.stats.totalExtracted).toBeGreaterThan(0);
      expect(data.usage).toBeDefined();
    });

    it('passes options through to extractor', async () => {
      const graph = buildGraph([
        makeFile({ path: 'src/a.ts', loc: 100 }),
        makeFile({ path: 'src/b.ts', loc: 200 }),
      ]);
      setKnowledgeExtractionGraph(graph);

      const result = await handleKnowledgeExtractionTool('absorb_extract_knowledge', {
        minConfidence: 0.9,
        maxPerType: 2,
        workspaceId: 'test-ws',
      });
      const data = parseResponse(result);

      expect(data.success).toBe(true);
      // All entries should have high confidence
      for (const entry of data.entries) {
        expect(entry.confidence).toBeGreaterThanOrEqual(0.9);
      }
      // Check workspace ID in entry IDs
      const hasWs = data.entries.some((e: any) => e.id.includes('test-ws'));
      if (data.entries.length > 0) {
        expect(hasWs).toBe(true);
      }
    });
  });
});
