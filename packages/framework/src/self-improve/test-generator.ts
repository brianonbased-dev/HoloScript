// STATUS: Scaffold — requires absorb service connection and LLM provider for production use
/**
 * TestGenerator — Auto-generate tests for framework source files.
 *
 * @experimental
 *
 * Uses the LLM adapter to generate vitest test files from source code.
 * Part of FW-1.0 self-evolution: the framework writes its own tests.
 */

import { callLLM } from '../llm/llm-adapter';
import type { ModelConfig } from '../types';
import { readFileSync, existsSync } from 'fs';
import { basename, dirname, resolve } from 'path';

export interface TestGeneratorConfig {
  /** LLM model configuration */
  model: ModelConfig;
  /** Maximum tokens for test generation */
  maxTokens?: number;
  /** Temperature (lower = more deterministic tests) */
  temperature?: number;
  /** Test framework (default: vitest) */
  testFramework?: 'vitest' | 'jest';
  /** Additional context to include in the prompt */
  additionalContext?: string;
}

export interface GeneratedTest {
  /** Source file path */
  sourceFile: string;
  /** Generated test file content */
  testContent: string;
  /** Suggested test file path */
  testFilePath: string;
  /** Number of test cases generated */
  testCount: number;
  /** LLM tokens used */
  tokensUsed: number;
}

const SYSTEM_PROMPT = `You are a test generation expert for TypeScript projects using vitest.
Given a source file, generate comprehensive test cases that:
1. Test all exported functions and classes
2. Cover happy paths and edge cases
3. Use vi.mock() for external dependencies
4. Follow the AAA pattern (Arrange, Act, Assert)
5. Use descriptive test names

Output ONLY the test file content — no explanations, no markdown fences.
Use import { describe, it, expect, vi } from 'vitest';`;

const JEST_SYSTEM_PROMPT = SYSTEM_PROMPT.replace(
  "import { describe, it, expect, vi } from 'vitest';",
  "Use jest globals (describe, it, expect, jest)."
);

/**
 * TestGenerator — generates test files from source code via LLM.
 *
 * @experimental
 *
 * Usage:
 * ```ts
 * const gen = new TestGenerator({ model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' } });
 * const result = await gen.generateTests('src/self-improve/absorb-scanner.ts');
 * ```
 */
export class TestGenerator {
  private readonly config: TestGeneratorConfig;

  constructor(config: TestGeneratorConfig) {
    this.config = {
      maxTokens: 4096,
      temperature: 0.3,
      testFramework: 'vitest',
      ...config,
    };
  }

  /**
   * Generate a test file for the given source file.
   *
   * @param filePath - Path to the TypeScript source file
   * @returns Generated test content and metadata
   */
  async generateTests(filePath: string): Promise<GeneratedTest> {
    const absPath = resolve(filePath);

    if (!existsSync(absPath)) {
      throw new Error(`Source file not found: ${absPath}`);
    }

    const source = readFileSync(absPath, 'utf-8');
    const fileName = basename(absPath, '.ts');
    const dir = dirname(absPath);

    const systemPrompt = this.config.testFramework === 'jest'
      ? JEST_SYSTEM_PROMPT
      : SYSTEM_PROMPT;

    const userPrompt = [
      `Generate tests for this TypeScript file: ${basename(absPath)}`,
      '',
      '```typescript',
      source,
      '```',
      this.config.additionalContext ? `\nAdditional context:\n${this.config.additionalContext}` : '',
    ].join('\n');

    const response = await callLLM(this.config.model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    const testContent = cleanTestOutput(response.content);
    const testCount = countTestCases(testContent);

    // Determine test file path
    const testFilePath = resolve(dir, '__tests__', `${fileName}.test.ts`);

    return {
      sourceFile: absPath,
      testContent,
      testFilePath,
      testCount,
      tokensUsed: response.tokensUsed ?? 0,
    };
  }

  /**
   * Generate tests for multiple files.
   *
   * @param filePaths - Array of source file paths
   * @returns Array of generated tests
   */
  async generateBatch(filePaths: string[]): Promise<GeneratedTest[]> {
    const results: GeneratedTest[] = [];
    for (const filePath of filePaths) {
      try {
        const result = await this.generateTests(filePath);
        results.push(result);
      } catch {
        // Skip files that fail — don't block the batch
      }
    }
    return results;
  }
}

/** Strip markdown fences if the LLM included them. */
function cleanTestOutput(content: string): string {
  let cleaned = content.trim();
  // Remove leading ```typescript or ```ts
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    }
  }
  // Remove trailing ```
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3).trimEnd();
  }
  return cleaned;
}

/** Count the number of it() or test() calls in the content. */
function countTestCases(content: string): number {
  const matches = content.match(/\b(?:it|test)\s*\(/g);
  return matches ? matches.length : 0;
}
