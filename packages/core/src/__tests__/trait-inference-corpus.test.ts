import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const CORPUS_PATH = join(
  REPO_ROOT,
  'research',
  'paper-19',
  'datasets',
  'phase-3-trait-inference-production.jsonl',
);

function readJsonl(path: string) {
  const raw = readFileSync(path, 'utf-8');
  const rows: any[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

describe('Paper-19 Production Trait-Inference Corpus', () => {
  it('corpus file exists', () => {
    expect(existsSync(CORPUS_PATH)).toBe(true);
  });

  const rows = readJsonl(CORPUS_PATH);

  it('has non-empty rows', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it('every row has a description', () => {
    for (const r of rows) {
      expect(r.description).toBeTruthy();
    }
  });

  it('splits are non-empty', () => {
    const splits = { train: 0, dev: 0, test: 0 };
    for (const r of rows) {
      if (r.split in splits) splits[r.split]++;
    }
    expect(splits.train).toBeGreaterThan(0);
    expect(splits.dev).toBeGreaterThan(0);
    expect(splits.test).toBeGreaterThan(0);
  });

  it('held-out test set is disjoint from train (no leakage)', () => {
    const trainCombos = new Set<string>();
    for (const r of rows) {
      if (r.split === 'train') {
        trainCombos.add(r.gold_traits.slice().sort().join('|'));
      }
    }
    for (const r of rows) {
      if (r.split === 'test' && r.metadata?.split_role === 'novel-combination-test') {
        const combo = r.gold_traits.slice().sort().join('|');
        expect(trainCombos.has(combo)).toBe(false);
      }
    }
  });

  it('has at least 300 novel-combination test rows', () => {
    const novelTest = rows.filter(
      (r) => r.split === 'test' && r.metadata?.split_role === 'novel-combination-test',
    );
    expect(novelTest.length).toBeGreaterThanOrEqual(300);
  });

  it('novel_combination flag is true for all novel-combination-test rows', () => {
    for (const r of rows) {
      if (r.split === 'test' && r.metadata?.split_role === 'novel-combination-test') {
        expect(r.metadata.novel_combination).toBe(true);
      }
    }
  });
});
