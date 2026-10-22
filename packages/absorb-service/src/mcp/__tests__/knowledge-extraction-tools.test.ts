/**
 * Tests for Knowledge Extraction MCP Tools
 *
 * Verifies the absorb_extract_knowledge tool handler.
 */

import { describe, it, expect, vi } from 'vitest';
import { CodebaseGraph } from '../../engine/CodebaseGraph';
import type { ScannedFile } from '../../engine/types';
import {
  handleKnowledgeExtractionTool,
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
          symbols: [
            {
              name: 'App',
              type: 'class',
              filePath: 'src/app.ts',
              line: 1,
              language: 'typescript',
              visibility: 'public',
            },
          ],
          loc: 150,
        }),
        makeFile({
          path: 'src/utils.ts',
          symbols: [
            {
              name: 'helper',
              type: 'function',
              filePath: 'src/utils.ts',
              line: 1,
              language: 'typescript',
              visibility: 'public',
            },
          ],
          imports: [
            { fromFile: 'src/utils.ts', toModule: './app', resolvedPath: 'src/app.ts', line: 1 },
          ],
          loc: 80,
        }),
      ]);
      const result = await handleKnowledgeExtractionTool('absorb_extract_knowledge', {}, { graph });
      const data = parseResponse(result);

      expect(data.success).toBe(true);
      expect(data.entries).toBeDefined();
      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.stats.totalExtracted).toBeGreaterThan(0);
      expect(data.usage).toBeDefined();
    });

    it('absorbs a browser_session observe extract without a prior graph', async () => {
      const result = await handleKnowledgeExtractionTool('absorb_extract_knowledge', {
        observe: {
          operation: 'observe',
          session: { url: 'https://docs.holoscript.example/observe' },
          markdown: '# Observe Fixture\n\nfixture body text for absorb fold\n\n# Heading One',
          dom: {
            url: 'https://docs.holoscript.example/observe',
            title: 'Observe Fixture',
            bodyText: 'fixture body text for absorb fold',
          },
        },
        workspaceId: 'observe-page',
      });
      const data = parseResponse(result);

      expect(data.success).toBe(true);
      expect(data.entries).toBeDefined();
      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.pageExtract).toMatchObject({
        kind: 'HoloAbsorbPageExtract',
        url: 'https://docs.holoscript.example/observe',
        title: 'Observe Fixture',
        source: 'observe',
        formatId: 'markdown',
        sourceFiles: ['observed-page.holo', 'observed-page.md'],
      });
      expect(data.pageExtract.charCount).toBeGreaterThan(20);
      expect(data.pageExtract.sha256).toHaveLength(64);
    });

    it('passes options through to extractor', async () => {
      const graph = buildGraph([
        makeFile({ path: 'src/a.ts', loc: 100 }),
        makeFile({ path: 'src/b.ts', loc: 200 }),
      ]);
      const result = await handleKnowledgeExtractionTool(
        'absorb_extract_knowledge',
        { minConfidence: 0.9, maxPerType: 2, workspaceId: 'test-ws' },
        { graph }
      );
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
  describe('tenant isolation (no shared module graph)', () => {
    it("tenant B cannot read tenant A's last graph", async () => {
      const secret = 'TenantAlphaSecretRoadmap';
      const a = await handleKnowledgeExtractionTool('absorb_extract_knowledge', {
        markdown: `# ${secret}\n\nalpha private planning notes for the alpha workspace only`,
        title: secret,
        workspaceId: 'tenant-a',
      });
      const aData = parseResponse(a);
      expect(aData.success).toBe(true);
      expect(JSON.stringify(aData)).toContain(secret);

      // Tenant B calls right after with no input of its own.
      const b = await handleKnowledgeExtractionTool('absorb_extract_knowledge', { workspaceId: 'tenant-b' });
      const bText = JSON.stringify(parseResponse(b));
      expect(parseResponse(b).error).toContain('No codebase graph loaded');
      expect(bText).not.toContain(secret);
      expect(bText).not.toContain('tenant-a');
    });

    it("an in-process caller's graph is used for that call only", async () => {
      const graph = buildGraph([makeFile({ path: 'src/private-a.ts', loc: 120 })]);
      const a = parseResponse(await handleKnowledgeExtractionTool('absorb_extract_knowledge', { workspaceId: 'tenant-a' }, { graph }));
      expect(a.success).toBe(true);
      const b = parseResponse(await handleKnowledgeExtractionTool('absorb_extract_knowledge', { workspaceId: 'tenant-b' }));
      expect(b.error).toContain('No codebase graph loaded');
      expect(JSON.stringify(b)).not.toContain('private-a');
    });

    it("tenant B's own page builds B's graph, never mixed with A's", async () => {
      await handleKnowledgeExtractionTool('absorb_extract_knowledge', { markdown: '# AlphaOnlyHeading\n\nalpha text', workspaceId: 'tenant-a' });
      const b = parseResponse(await handleKnowledgeExtractionTool('absorb_extract_knowledge', { markdown: '# BetaHeading\n\nbeta text', workspaceId: 'tenant-b' }));
      expect(b.success).toBe(true);
      expect(JSON.stringify(b)).not.toContain('AlphaOnlyHeading');
    });

    it('no module-level graph setter or getter is exported', async () => {
      const mod = await import('../knowledge-extraction-tools');
      expect(mod).not.toHaveProperty('setKnowledgeExtractionGraph');
      expect(mod).not.toHaveProperty('getActiveGraph');
      const idx = await import('../index');
      expect(idx).not.toHaveProperty('setKnowledgeExtractionGraph');
      expect(idx).not.toHaveProperty('getActiveGraph');
    });
  });

  describe('caller url is never fetched server-side', () => {
    it.each([
      'http://169.254.169.254/latest/meta-data/',
      'http://127.0.0.1:8080/admin',
      'http://[fd00:ec2::254]/',
      'https://example.com/page',
    ])('url-only %s is refused without any network call', async (url) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be used'));
      try {
        const data = parseResponse(await handleKnowledgeExtractionTool('absorb_extract_knowledge', { url }));
        expect(data.error).toBe('url_fetch_refused');
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('url with page text is only a label and is not fetched', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be used'));
      try {
        const data = parseResponse(
          await handleKnowledgeExtractionTool('absorb_extract_knowledge', {
            url: 'http://169.254.169.254/latest/meta-data/',
            bodyText: 'caller supplied page text about widgets',
            title: 'Widgets',
          })
        );
        expect(data.success).toBe(true);
        expect(data.pageExtract.source).toBe('bodyText');
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
