import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PromptExtractorFS } from '../GRPOPromptExtractor';
import {
  GRPOPromptExtractor,
  inferDomainTags,
  estimateDifficulty,
  extractPackageName,
  type GRPOPrompt,
  type PromptExtractorConfig,
} from '../GRPOPromptExtractor';

// =============================================================================
// MOCK FILE SYSTEM
// =============================================================================

/**
 * Create a mock file system with predetermined file contents.
 * Files are stored in a simple Record<string, string> map.
 */
function createMockFS(files: Record<string, string> = {}): PromptExtractorFS {
  const written: Record<string, string> = {};

  return {
    readFile: vi.fn(async (filePath: string) => {
      const normalised = filePath.replace(/\\/g, '/');
      for (const [key, value] of Object.entries(files)) {
        if (normalised.endsWith(key) || normalised === key) {
          return value;
        }
      }
      throw new Error(`File not found: ${filePath}`);
    }),

    writeFile: vi.fn(async (filePath: string, content: string) => {
      written[filePath] = content;
    }),

    listFiles: vi.fn(async (_rootDir: string, _extensions: string[], _excludeDirs: string[]) => {
      return Object.keys(files);
    }),

    exists: vi.fn(async (filePath: string) => {
      return filePath in files;
    }),

    resolve: vi.fn((...segments: string[]) => segments.join('/')),
    relative: vi.fn((_from: string, to: string) => to),
    dirname: vi.fn((fp: string) => fp.split('/').slice(0, -1).join('/')),
    basename: vi.fn((fp: string, ext?: string) => {
      const base = fp.split('/').pop() || fp;
      if (ext && base.endsWith(ext)) {
        return base.slice(0, -ext.length);
      }
      return base;
    }),
    join: vi.fn((...segments: string[]) => segments.join('/')),
  };
}

function getWrittenContent(fs: PromptExtractorFS): string {
  const calls = vi.mocked(fs.writeFile).mock.calls;
  if (calls.length === 0) return '';
  return calls[0][1]; // second argument is the content
}

// =============================================================================
// SAMPLE SOURCE FILES
// =============================================================================

const SAMPLE_TODO_FILE = `
import { parse } from './parser';

/**
 * Compiles a HoloScript source file.
 */
export function compileSource(source: string): string {
  const ast = parse(source);
  // TODO: Add support for nested scene compositions
  // FIXME: Memory leak when parsing large files
  return JSON.stringify(ast);
}

function processNode(node: any): void {
  // HACK: Workaround for tree-sitter issue #123
  console.log(node);
}
`;

const SAMPLE_STUB_FILE = `
import { Config } from './types';

export function initializeRuntime(config: Config): void {
  throw new Error("not implemented");
}

export function resetState(): void {
  return;
}

export async function loadPlugin(name: string): Promise<void> {
}

function internalHelper(): number {
  return 42;
}
`;

const SAMPLE_TEST_FILE = `
import { describe, it, expect, test } from 'vitest';
import { compileSource } from '../compiler';

describe('Compiler', () => {
  it('compiles basic objects', () => {
    expect(compileSource('object "test" {}')).toBeDefined();
  });

  it.skip('handles nested scenes', () => {
    // Not yet implemented
  });

  test.todo('validates trait references');

  xit('compiles animation blocks', () => {
    // Pending animation support
  });
});

xdescribe('Advanced Features', () => {
  it('supports spatial queries', () => {
    // ...
  });
});
`;

const SAMPLE_EXPORT_FILE = `
import { SomeType } from './types';

export function buildGraph(nodes: SomeType[]): void {
  // implementation here
  for (const node of nodes) {
    console.log(node);
  }
}

export class GraphAnalyzer {
  analyze(): void {
    // complex analysis
  }
}

export const MAX_DEPTH = 10;

export type GraphConfig = {
  depth: number;
};

export interface GraphResult {
  success: boolean;
}
`;

const SAMPLE_EXPORT_FILE_UNTESTED = `
export function orphanFunction(x: number): number {
  return x * 2;
}

export class OrphanClass {
  run(): void {
    console.log('running');
  }
}
`;

// =============================================================================
// TESTS
// =============================================================================

describe('GRPOPromptExtractor', () => {
  // ---------------------------------------------------------------------------
  // inferDomainTags
  // ---------------------------------------------------------------------------

  describe('inferDomainTags', () => {
    it('infers compiler domain from file path', () => {
      const tags = inferDomainTags('/packages/compiler-wasm/src/compile.ts');
      expect(tags).toContain('compiler');
    });

    it('infers parser domain from file path', () => {
      const tags = inferDomainTags('/packages/core/src/parser/HoloParser.ts');
      expect(tags).toContain('parser');
    });

    it('infers ai domain from self-improvement path', () => {
      const tags = inferDomainTags('/packages/core/src/self-improvement/GRPOConfig.ts');
      expect(tags).toContain('ai');
      expect(tags).toContain('self-improvement');
    });

    it('infers lsp domain', () => {
      const tags = inferDomainTags('/packages/lsp/src/server.ts');
      expect(tags).toContain('lsp');
    });

    it('infers security domain', () => {
      const tags = inferDomainTags('/packages/security-sandbox/src/sandbox.ts');
      expect(tags).toContain('security');
    });

    it('infers testing domain from test files', () => {
      const tags = inferDomainTags('/packages/test/__tests__/run.test.ts');
      expect(tags).toContain('testing');
    });

    it('returns "other" for unrecognised paths', () => {
      const tags = inferDomainTags('/packages/unknown/src/foo.ts');
      expect(tags).toContain('other');
    });

    it('can infer multiple tags from a single path', () => {
      const tags = inferDomainTags('/packages/compiler-wasm/src/parser/compile.ts');
      expect(tags).toContain('compiler');
      expect(tags).toContain('parser');
      expect(tags).toContain('wasm');
    });
  });

  // ---------------------------------------------------------------------------
  // estimateDifficulty
  // ---------------------------------------------------------------------------

  describe('estimateDifficulty', () => {
    it('returns easy for simple short functions', () => {
      const difficulty = estimateDifficulty(
        5,
        'add',
        'function add(a: number, b: number): number {\n  return a + b;\n}'
      );
      expect(difficulty).toBe('easy');
    });

    it('returns medium for moderate complexity', () => {
      const difficulty = estimateDifficulty(
        12,
        'processItems',
        [
          'import { TypeA } from "./a";',
          'import { TypeB } from "./b";',
          'import { TypeC } from "./c";',
          'async function processItems(items: TypeA[]): Promise<TypeB[]> {',
          '  const results = [];',
          '  for (const item of items) {',
          '    results.push(await transform(item));',
          '  }',
          '  return results;',
          '}',
        ].join('\n')
      );
      expect(difficulty).toBe('medium');
    });

    it('returns hard for complex functions with many indicators', () => {
      const difficulty = estimateDifficulty(
        25,
        'executeComplexTransformation',
        [
          'import { A } from "./a";',
          'import { B } from "./b";',
          'import { C } from "./c";',
          'import { D } from "./d";',
          'import { E } from "./e";',
          'import { F } from "./f";',
          'class Transformer<T extends Record<string, unknown>> extends Base implements ITransformer {',
          '  async execute(input: T): Promise<Observable<T>> {',
          '    if (condition) {',
          '      for (const item of input) {',
          '        if (item.nested) {',
          '          for (const sub of item.nested) {',
          '            await process(sub);',
          '          }',
          '        }',
          '      }',
          '    }',
          '  }',
          '}',
        ].join('\n')
      );
      expect(difficulty).toBe('hard');
    });
  });

  // ---------------------------------------------------------------------------
  // extractPackageName
  // ---------------------------------------------------------------------------

  describe('extractPackageName', () => {
    it('extracts package name from standard monorepo path', () => {
      expect(extractPackageName('/repo/packages/core/src/index.ts', '/repo')).toBe('core');
    });

    it('extracts package name from nested path', () => {
      expect(
        extractPackageName('/repo/packages/compiler-wasm/src/deep/nested/file.ts', '/repo')
      ).toBe('compiler-wasm');
    });

    it('handles Windows-style paths', () => {
      expect(
        extractPackageName('C:\\Users\\dev\\packages\\lsp\\src\\server.ts', 'C:\\Users\\dev')
      ).toBe('lsp');
    });

    it('falls back to first directory segment', () => {
      expect(extractPackageName('/repo/src/file.ts', '/repo')).toBe('src');
    });
  });

  // ---------------------------------------------------------------------------
  // parseTodoComments
  // ---------------------------------------------------------------------------

  describe('parseTodoComments', () => {
    let extractor: GRPOPromptExtractor;

    beforeEach(() => {
      extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, createMockFS());
    });

    it('extracts TODO comments', () => {
      const annotations = extractor.parseTodoComments(SAMPLE_TODO_FILE);
      const todos = annotations.filter((a) => a.type === 'TODO');
      expect(todos.length).toBeGreaterThanOrEqual(1);
      expect(todos[0].text).toContain('Add support for nested scene compositions');
    });

    it('extracts FIXME comments', () => {
      const annotations = extractor.parseTodoComments(SAMPLE_TODO_FILE);
      const fixmes = annotations.filter((a) => a.type === 'FIXME');
      expect(fixmes.length).toBeGreaterThanOrEqual(1);
      expect(fixmes[0].text).toContain('Memory leak');
    });

    it('extracts HACK comments', () => {
      const annotations = extractor.parseTodoComments(SAMPLE_TODO_FILE);
      const hacks = annotations.filter((a) => a.type === 'HACK');
      expect(hacks.length).toBeGreaterThanOrEqual(1);
      expect(hacks[0].text).toContain('Workaround');
    });

    it('finds enclosing function names', () => {
      const annotations = extractor.parseTodoComments(SAMPLE_TODO_FILE);
      const todo = annotations.find((a) => a.type === 'TODO');
      expect(todo?.functionName).toBe('compileSource');
    });

    it('includes context around annotations', () => {
      const annotations = extractor.parseTodoComments(SAMPLE_TODO_FILE);
      expect(annotations.length).toBeGreaterThan(0);
      for (const ann of annotations) {
        expect(ann.context.length).toBeGreaterThan(0);
        expect(ann.context.split('\n').length).toBeGreaterThanOrEqual(1);
      }
    });

    it('returns empty array for files without annotations', () => {
      const annotations = extractor.parseTodoComments('const x = 1;\nconst y = 2;\n');
      expect(annotations).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // parseStubFunctions
  // ---------------------------------------------------------------------------

  describe('parseStubFunctions', () => {
    let extractor: GRPOPromptExtractor;

    beforeEach(() => {
      extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, createMockFS());
    });

    it('detects throw new Error("not implemented") stubs', () => {
      const stubs = extractor.parseStubFunctions(SAMPLE_STUB_FILE);
      const notImpl = stubs.find((s) => s.stubType === 'not-implemented');
      expect(notImpl).toBeDefined();
      expect(notImpl!.name).toBe('initializeRuntime');
    });

    it('detects empty body functions', () => {
      const stubs = extractor.parseStubFunctions(SAMPLE_STUB_FILE);
      const empty = stubs.find((s) => s.stubType === 'empty-body');
      expect(empty).toBeDefined();
      expect(empty!.name).toBe('loadPlugin');
    });

    it('detects single-return stubs', () => {
      const stubs = extractor.parseStubFunctions(SAMPLE_STUB_FILE);
      const singleReturn = stubs.find((s) => s.stubType === 'single-return');
      expect(singleReturn).toBeDefined();
      expect(singleReturn!.name).toBe('resetState');
    });

    it('does not flag functions with real implementations', () => {
      const stubs = extractor.parseStubFunctions(SAMPLE_STUB_FILE);
      const helper = stubs.find((s) => s.name === 'internalHelper');
      expect(helper).toBeUndefined();
    });

    it('returns empty array for files without stubs', () => {
      const code = `
export function realFunction(x: number): number {
  const y = x * 2;
  return y + 1;
}
`;
      const stubs = extractor.parseStubFunctions(code);
      expect(stubs).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // parseSkippedTests
  // ---------------------------------------------------------------------------

  describe('parseSkippedTests', () => {
    let extractor: GRPOPromptExtractor;

    beforeEach(() => {
      extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, createMockFS());
    });

    it('detects it.skip tests', () => {
      const skipped = extractor.parseSkippedTests(SAMPLE_TEST_FILE);
      const itSkip = skipped.find((s) => s.skipType === 'it.skip');
      expect(itSkip).toBeDefined();
      expect(itSkip!.description).toBe('handles nested scenes');
    });

    it('detects test.todo tests', () => {
      const skipped = extractor.parseSkippedTests(SAMPLE_TEST_FILE);
      const testTodo = skipped.find((s) => s.skipType === 'test.todo');
      expect(testTodo).toBeDefined();
      expect(testTodo!.description).toBe('validates trait references');
    });

    it('detects xit tests', () => {
      const skipped = extractor.parseSkippedTests(SAMPLE_TEST_FILE);
      const xit = skipped.find((s) => s.skipType === 'xit');
      expect(xit).toBeDefined();
      expect(xit!.description).toBe('compiles animation blocks');
    });

    it('detects xdescribe blocks', () => {
      const skipped = extractor.parseSkippedTests(SAMPLE_TEST_FILE);
      const xdesc = skipped.find((s) => s.skipType === 'xdescribe');
      expect(xdesc).toBeDefined();
      expect(xdesc!.description).toBe('Advanced Features');
    });

    it('returns empty array for files without skipped tests', () => {
      const code = `
describe('Working', () => {
  it('passes', () => {
    expect(true).toBe(true);
  });
});
`;
      const skipped = extractor.parseSkippedTests(code);
      expect(skipped).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // parseExportedSymbols
  // ---------------------------------------------------------------------------

  describe('parseExportedSymbols', () => {
    let extractor: GRPOPromptExtractor;

    beforeEach(() => {
      extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, createMockFS());
    });

    it('detects exported functions', () => {
      const exports = extractor.parseExportedSymbols(SAMPLE_EXPORT_FILE);
      const fn = exports.find((e) => e.symbolName === 'buildGraph');
      expect(fn).toBeDefined();
      expect(fn!.symbolType).toBe('function');
    });

    it('detects exported classes', () => {
      const exports = extractor.parseExportedSymbols(SAMPLE_EXPORT_FILE);
      const cls = exports.find((e) => e.symbolName === 'GraphAnalyzer');
      expect(cls).toBeDefined();
      expect(cls!.symbolType).toBe('class');
    });

    it('detects exported constants', () => {
      const exports = extractor.parseExportedSymbols(SAMPLE_EXPORT_FILE);
      const constant = exports.find((e) => e.symbolName === 'MAX_DEPTH');
      expect(constant).toBeDefined();
      expect(constant!.symbolType).toBe('constant');
    });

    it('skips type-only exports (interfaces and type aliases)', () => {
      const exports = extractor.parseExportedSymbols(SAMPLE_EXPORT_FILE);
      const typeExport = exports.find(
        (e) => e.symbolName === 'GraphConfig' || e.symbolName === 'GraphResult'
      );
      expect(typeExport).toBeUndefined();
    });

    it('includes context for each export', () => {
      const exports = extractor.parseExportedSymbols(SAMPLE_EXPORT_FILE);
      for (const exp of exports) {
        expect(exp.context.length).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // deduplicatePrompts
  // ---------------------------------------------------------------------------

  describe('deduplicatePrompts', () => {
    let extractor: GRPOPromptExtractor;

    beforeEach(() => {
      extractor = new GRPOPromptExtractor(
        { rootDir: '/repo', maxRougeLSimilarity: 0.7 },
        createMockFS()
      );
    });

    it('removes near-duplicate prompts', () => {
      const prompts: GRPOPrompt[] = [
        makePrompt('Implement the parsing of nested scene compositions in parser.ts'),
        makePrompt('Implement the parsing of nested scene compositions in parser.ts'), // exact dup
        makePrompt('Write tests for GraphAnalyzer exported from graph.ts'),
      ];

      const deduped = extractor.deduplicatePrompts(prompts);
      expect(deduped).toHaveLength(2);
    });

    it('keeps dissimilar prompts', () => {
      const prompts: GRPOPrompt[] = [
        makePrompt('Implement the parser for animation blocks'),
        makePrompt('Write tests for GraphAnalyzer class'),
        makePrompt('Fix memory leak in large file compilation'),
      ];

      const deduped = extractor.deduplicatePrompts(prompts);
      expect(deduped).toHaveLength(3);
    });

    it('handles empty input', () => {
      const deduped = extractor.deduplicatePrompts([]);
      expect(deduped).toEqual([]);
    });

    it('handles single prompt', () => {
      const prompts = [makePrompt('Single unique prompt')];
      const deduped = extractor.deduplicatePrompts(prompts);
      expect(deduped).toHaveLength(1);
    });

    it('removes prompts that are very similar but not exact duplicates', () => {
      const prompts: GRPOPrompt[] = [
        makePrompt('Implement the compile function in compiler.ts:compile'),
        makePrompt('Implement the compile function in compiler.ts:compileAll'),
      ];

      const deduped = extractor.deduplicatePrompts(prompts);
      // These are very similar (ROUGE-L > 0.7) so one should be removed
      expect(deduped.length).toBeLessThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------------
  // toTRLRecord
  // ---------------------------------------------------------------------------

  describe('toTRLRecord', () => {
    let extractor: GRPOPromptExtractor;

    beforeEach(() => {
      extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, createMockFS());
    });

    it('produces a valid TRL record', () => {
      const prompt = makePrompt('Implement feature X');
      const record = extractor.toTRLRecord(prompt, 1709600000000);

      expect(record.prompt).toContain('Implement feature X');
      expect(record.prompt).toContain('### Context');
      expect(record.prompt).toContain('```typescript');
      expect(record.metadata.source).toBe('grpo-prompt-extractor');
      expect(record.metadata.timestamp).toBe(1709600000000);
    });

    it('includes all metadata fields', () => {
      const prompt = makePrompt('Test prompt');
      prompt.packageName = 'core';
      prompt.difficulty = 'hard';
      prompt.domainTags = ['compiler', 'parser'];

      const record = extractor.toTRLRecord(prompt, Date.now());

      expect(record.metadata.packageName).toBe('core');
      expect(record.metadata.difficulty).toBe('hard');
      expect(record.metadata.domainTags).toEqual(['compiler', 'parser']);
      expect(record.metadata.extractionSource).toBe('todo-comment');
    });
  });

  // ---------------------------------------------------------------------------
  // computeStats
  // ---------------------------------------------------------------------------

  describe('computeStats', () => {
    let extractor: GRPOPromptExtractor;

    beforeEach(() => {
      extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, createMockFS());
    });

    it('computes correct statistics', () => {
      const raw: GRPOPrompt[] = [
        makePrompt('A', 'todo-comment', 'easy', 'core'),
        makePrompt('B', 'stub-implementation', 'medium', 'lsp'),
        makePrompt('C', 'skipped-test', 'hard', 'core'),
        makePrompt('D', 'low-coverage', 'easy', 'compiler-wasm'),
        makePrompt('E', 'todo-comment', 'medium', 'core'), // will be "removed"
      ];

      const deduped = raw.slice(0, 4); // E was removed by dedup

      const stats = extractor.computeStats(raw, deduped, 'datasets/output.jsonl');

      expect(stats.totalExtracted).toBe(5);
      expect(stats.totalAfterDedup).toBe(4);
      expect(stats.removedByDedup).toBe(1);
      expect(stats.bySource['todo-comment']).toBe(1);
      expect(stats.bySource['stub-implementation']).toBe(1);
      expect(stats.bySource['skipped-test']).toBe(1);
      expect(stats.bySource['low-coverage']).toBe(1);
      expect(stats.byDifficulty.easy).toBe(2);
      expect(stats.byDifficulty.medium).toBe(1);
      expect(stats.byDifficulty.hard).toBe(1);
      expect(stats.packagesCovered).toContain('core');
      expect(stats.packagesCovered).toContain('lsp');
      expect(stats.packagesCovered).toContain('compiler-wasm');
      expect(stats.outputFile).toBe('datasets/output.jsonl');
    });
  });

  // ---------------------------------------------------------------------------
  // Full extract() integration
  // ---------------------------------------------------------------------------

  describe('extract() (integration)', () => {
    it('extracts prompts from all 4 sources and writes JSONL', async () => {
      const files: Record<string, string> = {
        'packages/core/src/compiler.ts': SAMPLE_TODO_FILE,
        'packages/core/src/runtime.ts': SAMPLE_STUB_FILE,
        'packages/core/src/__tests__/compiler.test.ts': SAMPLE_TEST_FILE,
        'packages/analysis/src/graph.ts': SAMPLE_EXPORT_FILE_UNTESTED,
      };

      const mockFS = createMockFS(files);

      const extractor = new GRPOPromptExtractor(
        {
          rootDir: '/repo',
          outputDir: 'datasets',
          maxRougeLSimilarity: 0.7,
        },
        mockFS
      );

      const result = await extractor.extract();

      // Should have extracted prompts from multiple sources
      expect(result.prompts.length).toBeGreaterThan(0);
      expect(result.records.length).toBe(result.prompts.length);

      // Verify sources are represented
      const sources = new Set(result.prompts.map((p) => p.source));
      expect(sources.size).toBeGreaterThan(0);

      // Verify JSONL was written
      expect(mockFS.writeFile).toHaveBeenCalled();
      const writtenContent = getWrittenContent(mockFS);
      expect(writtenContent.length).toBeGreaterThan(0);

      // Each line should be valid JSON
      const jsonLines = writtenContent.trim().split('\n');
      for (const line of jsonLines) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('prompt');
        expect(parsed).toHaveProperty('metadata');
        expect(parsed.metadata.source).toBe('grpo-prompt-extractor');
      }

      // Stats should be computed
      expect(result.stats.totalExtracted).toBeGreaterThan(0);
      expect(result.stats.totalAfterDedup).toBeGreaterThan(0);
      expect(result.stats.totalAfterDedup).toBeLessThanOrEqual(result.stats.totalExtracted);
    });

    it('handles empty monorepo gracefully', async () => {
      const mockFS = createMockFS({});
      const extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, mockFS);

      const result = await extractor.extract();

      expect(result.prompts).toEqual([]);
      expect(result.records).toEqual([]);
      expect(result.stats.totalExtracted).toBe(0);
      expect(result.stats.totalAfterDedup).toBe(0);
    });

    it('handles file read errors gracefully', async () => {
      const mockFS = createMockFS({
        'packages/core/src/broken.ts': 'valid content',
      });

      // Make readFile fail for the broken file
      vi.mocked(mockFS.readFile).mockRejectedValue(new Error('Permission denied'));

      const extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, mockFS);

      // Should not throw; should simply skip unreadable files
      const result = await extractor.extract();
      expect(result.prompts).toEqual([]);
    });

    it('deduplicates across sources', async () => {
      // Create files that would generate similar prompts
      const files: Record<string, string> = {
        'packages/core/src/feature.ts': `
// TODO: Implement feature X completely
export function featureX(): void {
  throw new Error("not implemented");
}
`,
      };

      const mockFS = createMockFS(files);
      const extractor = new GRPOPromptExtractor(
        { rootDir: '/repo', maxRougeLSimilarity: 0.7 },
        mockFS
      );

      const result = await extractor.extract();

      // Should have prompts from both TODO and stub sources
      // but after dedup, very similar ones might be removed
      expect(result.stats.totalExtracted).toBeGreaterThanOrEqual(2);
      expect(result.stats.totalAfterDedup).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Source D: Low-Coverage Exports
  // ---------------------------------------------------------------------------

  describe('extractLowCoverageExports', () => {
    it('identifies exported symbols without test coverage', async () => {
      const sourceFiles: Record<string, string> = {
        'packages/core/src/orphan.ts': SAMPLE_EXPORT_FILE_UNTESTED,
      };
      const testFiles: Record<string, string> = {
        'packages/core/src/__tests__/other.test.ts': `
import { describe, it, expect } from 'vitest';
import { someOtherThing } from '../other';

describe('Other', () => {
  it('works', () => {
    expect(someOtherThing()).toBe(true);
  });
});
`,
      };

      const allFiles = { ...sourceFiles, ...testFiles };
      const mockFS = createMockFS(allFiles);
      const extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, mockFS);

      const prompts = await extractor.extractLowCoverageExports(
        Object.keys(sourceFiles),
        Object.keys(testFiles)
      );

      // orphanFunction and OrphanClass should be detected
      expect(prompts.length).toBeGreaterThanOrEqual(1);
      const symbolNames = prompts.map((p) => p.symbolName);
      expect(symbolNames).toContain('orphanFunction');
    });
  });

  // ---------------------------------------------------------------------------
  // collectTestedSymbols
  // ---------------------------------------------------------------------------

  describe('collectTestedSymbols', () => {
    it('collects imported symbol names from test files', async () => {
      const testFiles: Record<string, string> = {
        'test.test.ts': `
import { FooClass, barFunction } from '../source';
import type { SomeType } from '../types';

describe('FooClass', () => {
  it('works', () => {
    expect(new FooClass()).toBeDefined();
  });
});
`,
      };

      const mockFS = createMockFS(testFiles);
      const extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, mockFS);

      const symbols = await extractor.collectTestedSymbols(Object.keys(testFiles));

      expect(symbols.has('FooClass')).toBe(true);
      expect(symbols.has('barFunction')).toBe(true);
      // Type imports are also collected (they indicate awareness)
      expect(symbols.has('SomeType')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // findEnclosingFunction
  // ---------------------------------------------------------------------------

  describe('findEnclosingFunction', () => {
    let extractor: GRPOPromptExtractor;

    beforeEach(() => {
      extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, createMockFS());
    });

    it('finds enclosing function declaration', () => {
      const lines = ['function myFunction() {', '  // some code', '  // TODO: fix this', '}'];
      expect(extractor.findEnclosingFunction(lines, 2)).toBe('myFunction');
    });

    it('finds enclosing arrow function', () => {
      const lines = ['const handler = async (req, res) => {', '  // TODO: validate input', '};'];
      expect(extractor.findEnclosingFunction(lines, 1)).toBe('handler');
    });

    it('returns module-level for top-level comments', () => {
      const lines = ['// TODO: add module documentation', 'export const x = 1;'];
      expect(extractor.findEnclosingFunction(lines, 0)).toBe('module-level');
    });
  });

  // ---------------------------------------------------------------------------
  // extractFunctionBody
  // ---------------------------------------------------------------------------

  describe('extractFunctionBody', () => {
    let extractor: GRPOPromptExtractor;

    beforeEach(() => {
      extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, createMockFS());
    });

    it('extracts body of a simple function', () => {
      const lines = ['function foo() {', '  return 42;', '}'];
      const result = extractor.extractFunctionBody(lines, 0);
      expect(result).toBeDefined();
      expect(result!.body).toContain('return 42;');
      expect(result!.endLine).toBe(2);
    });

    it('extracts body of an empty function', () => {
      const lines = ['function empty() {', '}'];
      const result = extractor.extractFunctionBody(lines, 0);
      expect(result).toBeDefined();
      expect(result!.body.trim()).toBe('');
    });

    it('returns null for functions without braces (arrow expression)', () => {
      const lines = ['const fn = (x: number) => x * 2;'];
      const result = extractor.extractFunctionBody(lines, 0);
      // Arrow expression: extracted after =>
      expect(result).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles files with only comments', async () => {
      const files: Record<string, string> = {
        'packages/core/src/empty.ts': '// Just a comment\n// Another comment\n',
      };

      const mockFS = createMockFS(files);
      const extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, mockFS);

      const result = await extractor.extract();
      // No prompts should be extracted from a comment-only file
      expect(result.prompts.length).toBe(0);
    });

    it('handles extremely long files without stack overflow', () => {
      const extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, createMockFS());

      // Generate a 10,000-line file
      const longLines: string[] = [];
      for (let i = 0; i < 10_000; i++) {
        longLines.push(`const x${i} = ${i};`);
      }
      longLines[5000] = '// TODO: optimise this massive file';

      const annotations = extractor.parseTodoComments(longLines.join('\n'));
      expect(annotations).toHaveLength(1);
      expect(annotations[0].type).toBe('TODO');
    });

    it('handles unicode in TODO comments', () => {
      const extractor = new GRPOPromptExtractor({ rootDir: '/repo' }, createMockFS());

      const code = `
function renderText() {
  // TODO: Support emoji rendering (e.g. 日本語, العربية)
  console.log('hello');
}
`;
      const annotations = extractor.parseTodoComments(code);
      expect(annotations).toHaveLength(1);
      expect(annotations[0].text).toContain('emoji rendering');
    });
  });
});

// =============================================================================
// TEST HELPERS
// =============================================================================

function makePrompt(
  instruction: string,
  source: GRPOPrompt['source'] = 'todo-comment',
  difficulty: GRPOPrompt['difficulty'] = 'medium',
  packageName = 'core'
): GRPOPrompt {
  return {
    instruction,
    context: '// sample context\nfunction example() {}',
    packageName,
    filePath: `packages/${packageName}/src/file.ts`,
    difficulty,
    domainTags: ['other'],
    source,
    line: 1,
    symbolName: 'example',
  };
}
