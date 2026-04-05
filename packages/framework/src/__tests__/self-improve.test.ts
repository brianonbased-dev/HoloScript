/**
 * Tests for FW-1.0 Self-Improvement Module
 *
 * FrameworkAbsorber, TestGenerator, PromptOptimizer
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock callLLM
vi.mock('../llm/llm-adapter', () => ({
  callLLM: vi.fn(),
}));

// Mock fs for TestGenerator
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => 'export function add(a: number, b: number): number { return a + b; }'),
  existsSync: vi.fn(() => true),
}));

import { FrameworkAbsorber } from '../self-improve/framework-absorber';
import { TestGenerator } from '../self-improve/test-generator';
import { PromptOptimizer } from '../self-improve/prompt-optimizer';
import { callLLM } from '../llm/llm-adapter';
import { existsSync } from 'fs';

const mockedCallLLM = vi.mocked(callLLM);
const mockedExistsSync = vi.mocked(existsSync);

// ── FrameworkAbsorber ──

describe('FrameworkAbsorber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with default config', () => {
    const absorber = new FrameworkAbsorber();
    expect(absorber).toBeInstanceOf(FrameworkAbsorber);
  });

  it('constructs with custom config', () => {
    const absorber = new FrameworkAbsorber({
      absorbUrl: 'https://custom.absorb.net',
      absorbApiKey: 'test-key',
      codebasePath: '/tmp/code',
    });
    expect(absorber).toBeInstanceOf(FrameworkAbsorber);
  });

  it('scanSelf falls back to knowledge store when absorb is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    // Second call for knowledge store query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { type: 'gotcha', content: 'Test gotcha', metadata: { domain: 'framework' } },
        ],
      }),
    });

    const absorber = new FrameworkAbsorber({ absorbApiKey: 'test-key', mcpApiKey: 'test-key' });
    const graph = await absorber.scanSelf();

    expect(graph).toBeDefined();
    expect(typeof graph.fileCount).toBe('number');
    expect(typeof graph.edgeCount).toBe('number');
    expect(Array.isArray(graph.modules)).toBe(true);
  });

  it('scanSelf returns graph from absorb health when reachable', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: 42, edges: 100, modules: ['core', 'self-improve'] }),
    });

    const absorber = new FrameworkAbsorber({ absorbApiKey: 'test-key' });
    const graph = await absorber.scanSelf();

    expect(graph.fileCount).toBe(42);
    expect(graph.edgeCount).toBe(100);
    expect(graph.modules).toEqual(['core', 'self-improve']);
  });

  it('scanSelf returns empty graph when no API key', async () => {
    // No key, no absorb call
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    const absorber = new FrameworkAbsorber({ absorbApiKey: '', mcpApiKey: '' });
    const graph = await absorber.scanSelf();

    expect(graph.fileCount).toBe(0);
    expect(graph.edgeCount).toBe(0);
  });

  it('findImprovements returns improvement list from knowledge store', async () => {
    // findImprovements calls runFullScan which calls scanFramework (knowledge store query)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { type: 'gotcha', content: 'Missing test coverage for X', metadata: { domain: 'framework', confidence: 0.8 } },
          { type: 'pattern', content: 'Use dependency injection', metadata: { domain: 'architecture' } },
        ],
      }),
    });

    const absorber = new FrameworkAbsorber({ absorbApiKey: '', mcpApiKey: 'test-key' });
    const improvements = await absorber.findImprovements();

    expect(Array.isArray(improvements)).toBe(true);
    // Only gotchas become improvements
    expect(improvements.length).toBe(1);
    expect(improvements[0].title).toContain('Missing test coverage');
    expect(improvements[0].confidence).toBeGreaterThan(0);
  });

  it('getKnowledge returns empty array before scan', () => {
    const absorber = new FrameworkAbsorber();
    expect(absorber.getKnowledge()).toEqual([]);
  });
});

// ── TestGenerator ──

describe('TestGenerator', () => {
  const modelConfig = { provider: 'anthropic' as const, model: 'claude-sonnet-4-20250514' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
  });

  it('constructs with config', () => {
    const gen = new TestGenerator({ model: modelConfig });
    expect(gen).toBeInstanceOf(TestGenerator);
  });

  it('generateTests calls LLM and returns test content', async () => {
    const testOutput = `import { describe, it, expect } from 'vitest';
import { add } from '../add';

describe('add', () => {
  it('adds two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });

  it('handles negative numbers', () => {
    expect(add(-1, 1)).toBe(0);
  });
});`;

    mockedCallLLM.mockResolvedValueOnce({
      content: testOutput,
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      tokensUsed: 500,
    });

    const gen = new TestGenerator({ model: modelConfig });
    const result = await gen.generateTests('src/add.ts');

    expect(result.testContent).toContain("describe('add'");
    expect(result.testCount).toBe(2);
    expect(result.tokensUsed).toBe(500);
    expect(mockedCallLLM).toHaveBeenCalledOnce();
  });

  it('strips markdown fences from LLM output', async () => {
    mockedCallLLM.mockResolvedValueOnce({
      content: '```typescript\nit("works", () => {});\n```',
      model: 'test',
      provider: 'anthropic',
    });

    const gen = new TestGenerator({ model: modelConfig });
    const result = await gen.generateTests('src/foo.ts');

    expect(result.testContent).not.toContain('```');
    expect(result.testContent).toContain('it("works"');
  });

  it('throws when source file does not exist', async () => {
    mockedExistsSync.mockReturnValue(false);

    const gen = new TestGenerator({ model: modelConfig });
    await expect(gen.generateTests('nonexistent.ts')).rejects.toThrow('Source file not found');
  });

  it('generateBatch handles multiple files', async () => {
    mockedCallLLM.mockResolvedValue({
      content: 'it("test", () => {});',
      model: 'test',
      provider: 'anthropic',
      tokensUsed: 100,
    });

    const gen = new TestGenerator({ model: modelConfig });
    const results = await gen.generateBatch(['src/a.ts', 'src/b.ts']);

    expect(results.length).toBe(2);
    expect(mockedCallLLM).toHaveBeenCalledTimes(2);
  });

  it('generateBatch skips files that fail', async () => {
    mockedExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
    mockedCallLLM.mockResolvedValueOnce({
      content: 'it("works", () => {});',
      model: 'test',
      provider: 'anthropic',
      tokensUsed: 50,
    });

    const gen = new TestGenerator({ model: modelConfig });
    const results = await gen.generateBatch(['nonexistent.ts', 'src/ok.ts']);

    expect(results.length).toBe(1);
  });
});

// ── PromptOptimizer ──

describe('PromptOptimizer', () => {
  const modelConfig = { provider: 'anthropic' as const, model: 'claude-sonnet-4-20250514' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with config', () => {
    const opt = new PromptOptimizer({ model: modelConfig });
    expect(opt).toBeInstanceOf(PromptOptimizer);
  });

  it('abTest runs both variants and returns a winner', async () => {
    // Mock callLLM: 3 runs per variant (6 calls) + 6 judge calls = 12 total
    let callCount = 0;
    mockedCallLLM.mockImplementation(async () => {
      callCount++;
      // Judge calls return JSON scores
      if (callCount % 2 === 0) {
        return {
          content: JSON.stringify({ relevance: 8, quality: 7, completeness: 9 }),
          model: 'test',
          provider: 'anthropic',
          tokensUsed: 50,
        };
      }
      return {
        content: 'Test response content',
        model: 'test',
        provider: 'anthropic',
        tokensUsed: 200,
      };
    });

    const opt = new PromptOptimizer({ model: modelConfig, runs: 2 });
    const result = await opt.abTest(
      'Explain this briefly.',
      'You are an expert. Explain this in detail.',
      'What is TypeScript?'
    );

    expect(result.task).toBe('What is TypeScript?');
    expect(result.variantA).toBeDefined();
    expect(result.variantB).toBeDefined();
    expect(['A', 'B', 'tie']).toContain(result.winner);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.totalTokens).toBeGreaterThanOrEqual(0);
    expect(result.variantA.responses.length).toBe(2);
    expect(result.variantB.responses.length).toBe(2);
  });

  it('handles judge failures gracefully (neutral score)', async () => {
    mockedCallLLM.mockImplementation(async (_config, messages) => {
      // Judge prompt contains "Score the following"
      const isJudge = messages.some(m => m.content.includes('Score the following') || m.content.includes('prompt quality evaluator'));
      if (isJudge) {
        throw new Error('LLM quota exceeded');
      }
      return {
        content: 'Some response',
        model: 'test',
        provider: 'anthropic',
        tokensUsed: 100,
      };
    });

    const opt = new PromptOptimizer({ model: modelConfig, runs: 1 });
    const result = await opt.abTest('Prompt A', 'Prompt B', 'Test task');

    // Both variants should get neutral scores (5) when judge fails
    expect(result.variantA.avgScore).toBe(5);
    expect(result.variantB.avgScore).toBe(5);
    expect(result.winner).toBe('tie');
  });

  it('reports correct variant scores', async () => {
    // Make variant A consistently better than variant B
    mockedCallLLM.mockImplementation(async (_config, messages) => {
      const systemMsg = messages.find(m => m.role === 'system');
      const isJudge = systemMsg?.content.includes('prompt quality evaluator');

      if (isJudge) {
        // Check if the response being judged is from variant A or B
        const userMsg = messages.find(m => m.role === 'user');
        const isVariantA = userMsg?.content.includes('Great response from A');
        return {
          content: JSON.stringify({
            relevance: isVariantA ? 9 : 4,
            quality: isVariantA ? 9 : 4,
            completeness: isVariantA ? 9 : 4,
          }),
          model: 'test',
          provider: 'anthropic',
          tokensUsed: 50,
        };
      }

      // Variant A uses system prompt "Prompt A"
      const isA = systemMsg?.content === 'Prompt A';
      return {
        content: isA ? 'Great response from A' : 'Mediocre response from B',
        model: 'test',
        provider: 'anthropic',
        tokensUsed: 100,
      };
    });

    const opt = new PromptOptimizer({ model: modelConfig, runs: 2 });
    const result = await opt.abTest('Prompt A', 'Prompt B', 'Test task');

    expect(result.variantA.avgScore).toBeGreaterThan(result.variantB.avgScore);
    expect(result.winner).toBe('A');
    expect(result.confidence).toBeGreaterThan(0);
  });
});
