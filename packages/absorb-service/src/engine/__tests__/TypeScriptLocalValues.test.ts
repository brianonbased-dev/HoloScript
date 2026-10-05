/**
 * Function-local values are not symbols (2026-10-05). Before this, every
 * `const`/`let` inside every function body became a 'constant' symbol: about
 * 72% of HoloScript's 398k symbols and most of its 1.5 GB HoloEmbed index.
 * Module-level constants and function-valued declarators (local helpers) stay.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapterForLanguage } from '../adapters';
import type { ParseTree } from '../types';

const SOURCE = `
export const API_VERSION = 3;
const internalLimit = 10;
let mutableTop = 'x';

export function handler(input: number): number {
  const doubled = input * 2;
  let total = 0;
  const helper = (n: number) => n + 1;
  for (const item of [1, 2]) { const inLoop = item; total += inLoop; }
  return helper(doubled + total);
}

export class Service {
  run(): void {
    const local = 1;
    const inner = function () { const deeper = 2; return deeper; };
    void local; void inner;
  }
}

export const arrow = () => {
  const insideArrow = 5;
  return insideArrow;
};
`;

let tree: ParseTree | null = null;

beforeAll(async () => {
  try {
    const tsMod = (await import('tree-sitter')) as unknown as { default?: unknown };
    const TreeSitter = (tsMod.default ?? tsMod) as new () => {
      setLanguage(language: unknown): void;
      parse(source: string): ParseTree;
    };
    const grammarMod = (await import('tree-sitter-typescript')) as unknown as {
      default?: { typescript?: unknown };
      typescript?: unknown;
    };
    const grammar = (grammarMod.default ?? grammarMod).typescript;
    const parser = new TreeSitter();
    parser.setLanguage(grammar);
    tree = parser.parse(SOURCE);
  } catch {
    tree = null;
  }
});

describe('TypeScript local values', () => {
  it('keeps module-level constants and local helper functions, drops function-local values', (ctx) => {
    if (!tree) {
      ctx.skip('tree-sitter-typescript did not load — nothing was parsed, nothing is proven');
      return;
    }
    const adapter = getAdapterForLanguage('typescript')!;
    const names = adapter.extractSymbols(tree, 'src/sample.ts').map((s) => `${s.type}:${s.name}`);

    for (const kept of [
      'constant:API_VERSION',
      'constant:internalLimit',
      'constant:mutableTop',
      'function:handler',
      'function:helper',
      'function:arrow',
      'function:inner',
    ]) {
      expect(names, kept).toContain(kept);
    }
    for (const dropped of ['doubled', 'total', 'inLoop', 'local', 'deeper', 'insideArrow']) {
      expect(names.some((entry) => entry.endsWith(`:${dropped}`)), dropped).toBe(false);
    }
  });
});
