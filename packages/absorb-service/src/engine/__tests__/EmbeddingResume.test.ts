/**
 * An interrupted embedding build resumes from its journal instead of starting
 * over (2026-10-04: a warm cancelled at batch 11,127 of 12,615 lost every
 * vector and restarted at batch 1).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CodebaseGraph } from '../CodebaseGraph';
import { EmbeddingIndex } from '../EmbeddingIndex';
import {
  appendAll,
  appendEmbeddingJournal,
  readEmbeddingJournal,
  removeEmbeddingJournal,
} from '../EmbeddingJournal';
import type { EmbeddingProvider } from '../providers/EmbeddingProvider';
import type { ExternalSymbolDefinition } from '../types';

function makeSymbol(index: number): ExternalSymbolDefinition {
  return {
    name: `Symbol${index}`,
    type: 'function',
    filePath: `src/symbol-${index}.ts`,
    line: index + 1,
    column: 1,
    language: 'typescript',
    visibility: 'public',
    signature: `function Symbol${index}(): void`,
  };
}

/** Deterministic, text-dependent vectors, like HoloEmbed. */
function vectorFor(text: string): number[] {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return [text.length, hash % 1000, (hash >>> 10) % 1000, 1];
}

function countingProvider(transform: (text: string) => number[] = vectorFor) {
  const embedded: string[] = [];
  const provider: EmbeddingProvider = {
    name: 'test-provider',
    getEmbeddings: vi.fn(async (texts: string[]) => {
      embedded.push(...texts);
      return texts.map(transform);
    }),
  };
  return { provider, embedded };
}

function journalFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'embedding-journal-')), 'journal.bin');
}

describe('EmbeddingJournal', () => {
  it('round-trips vectors, ignores a torn final record, and restarts on a new dimension', () => {
    const file = journalFile();
    appendEmbeddingJournal(file, [
      { text: 'alpha', embedding: new Float32Array([1, 2, 3]) },
      { text: 'βeta', embedding: new Float32Array([4, 5, 6]) },
    ]);
    appendEmbeddingJournal(file, [{ text: 'gamma', embedding: new Float32Array([7, 8, 9]) }]);
    // Simulate a crash in the middle of the next append.
    fs.appendFileSync(file, Buffer.from([9, 0, 0, 0, 0x61, 0x62]));

    const read = readEmbeddingJournal(file);
    expect(read.map((entry) => entry.text)).toEqual(['alpha', 'βeta', 'gamma']);
    expect(Array.from(read[2].embedding)).toEqual([7, 8, 9]);

    appendEmbeddingJournal(file, [{ text: 'wide', embedding: new Float32Array([1, 2, 3, 4]) }]);
    expect(readEmbeddingJournal(file).map((entry) => entry.text)).toEqual(['wide']);

    removeEmbeddingJournal(file);
    expect(readEmbeddingJournal(file)).toEqual([]);
  });
});

describe('journal robustness (review of #492)', () => {
  it('appends after a torn tail without corrupting or losing the new records', () => {
    const file = journalFile();
    const v = (n: number) => new Float32Array([n, n, n + 0.5]);
    appendEmbeddingJournal(file, [
      { text: 'alpha', embedding: v(1) },
      { text: 'beta', embedding: v(2) },
      { text: 'gamma', embedding: v(3) },
    ]);
    const size = fs.statSync(file).size;
    fs.truncateSync(file, size - 6); // crash mid-record: gamma is torn
    appendEmbeddingJournal(file, [
      { text: 'delta', embedding: v(4) },
      { text: 'epsilon', embedding: v(5) },
    ]);
    const read = readEmbeddingJournal(file);
    expect(read.map((e) => e.text)).toEqual(['alpha', 'beta', 'delta', 'epsilon']);
    expect(Array.from(read[2].embedding)).toEqual([4, 4, 4.5]);
    expect(Array.from(read[3].embedding)).toEqual([5, 5, 5.5]);
  });

  it('seeds and journals 130k entries without a spread RangeError', () => {
    const many = Array.from({ length: 130_000 }, (_, i) => ({
      text: `t${i}`,
      embedding: new Float32Array([i, 1]),
    }));
    const seed: typeof many = [];
    expect(() => appendAll(seed, many)).not.toThrow();
    expect(seed).toHaveLength(130_000);
    const file = journalFile();
    appendEmbeddingJournal(file, many);
    const back = readEmbeddingJournal(file);
    expect(back).toHaveLength(130_000);
    expect(Array.from(back[129_999].embedding)).toEqual([129_999, 1]);
  });
});

describe('resuming an interrupted embedding build', () => {
  it('computes only the symbols the interrupted build had not reached', async () => {
    const symbols = Array.from({ length: 100 }, (_, i) => makeSymbol(i));
    const graph = { getAllSymbols: () => symbols } as unknown as CodebaseGraph;
    const file = journalFile();

    // First attempt: cancelled by the job guard after 60 symbols.
    const first = countingProvider();
    const interrupted = new EmbeddingIndex({ provider: first.provider, batchSize: 10, useWorkers: false });
    await expect(
      interrupted.refreshIndex(
        graph,
        (_batch, _total, processed) => {
          if (processed >= 60) throw new Error('system_memory_reserve_exhausted');
        },
        { onEmbedded: (entries) => appendEmbeddingJournal(file, entries) }
      )
    ).rejects.toThrow('system_memory_reserve_exhausted');
    const journaled = readEmbeddingJournal(file);
    expect(journaled.length).toBeGreaterThanOrEqual(60);

    // Second attempt: verified seed from the journal, so only the rest is computed.
    const second = countingProvider();
    const resumed = new EmbeddingIndex({ provider: second.provider, batchSize: 10, useWorkers: false });
    expect(await resumed.verifyReusableEmbeddings(journaled, 8)).toBe(true);
    second.embedded.length = 0;
    const receipt = await resumed.refreshIndex(graph, undefined, { seed: journaled });

    expect(receipt.totalSymbols).toBe(100);
    expect(receipt.reusedSymbols).toBe(journaled.length);
    expect(receipt.embeddedSymbols).toBe(100 - journaled.length);
    expect(second.embedded).toHaveLength(100 - journaled.length);

    // The resumed index equals one built from scratch.
    const fresh = new EmbeddingIndex({ provider: countingProvider().provider, batchSize: 10, useWorkers: false });
    await fresh.buildIndex(graph);
    const vectors = (index: EmbeddingIndex) =>
      index.reusableEmbeddings().map((entry) => [entry.text, Array.from(entry.embedding)]);
    expect(vectors(resumed)).toEqual(vectors(fresh));
  });

  it('refuses to reuse vectors from a different encoder', async () => {
    const symbols = Array.from({ length: 20 }, (_, i) => makeSymbol(i));
    const graph = { getAllSymbols: () => symbols } as unknown as CodebaseGraph;
    const old = new EmbeddingIndex({
      provider: countingProvider((text) => vectorFor(text).map((v) => v + 0.5)).provider,
      batchSize: 10,
      useWorkers: false,
    });
    await old.buildIndex(graph);

    const current = new EmbeddingIndex({ provider: countingProvider().provider, batchSize: 10, useWorkers: false });
    expect(await current.verifyReusableEmbeddings(old.reusableEmbeddings())).toBe(false);
  });
});
