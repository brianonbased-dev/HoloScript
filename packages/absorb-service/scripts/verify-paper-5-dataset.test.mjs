import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_PAPER_5_DATASET, auditPaper5Dataset } from './verify-paper-5-dataset.mjs';

function withMutatedDataset(mutate, run) {
  const directory = mkdtempSync(join(tmpdir(), 'paper-5-dataset-'));
  const path = join(directory, 'dataset.json');
  const dataset = JSON.parse(readFileSync(DEFAULT_PAPER_5_DATASET, 'utf8'));
  mutate(dataset);
  writeFileSync(path, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  try {
    run(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('frozen Paper 5 corpus passes source, balance, and leakage gates', () => {
  const { receipt } = auditPaper5Dataset();
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.counts.queries, 54);
  assert.deepEqual(receipt.counts.categories, {
    dependency: 18,
    impact: 18,
    reasoning: 18,
  });
  assert.equal(receipt.counts.goldFiles, 160);
  assert.equal(receipt.errors.length, 0);
});

test('rejects a relevance label whose source anchor cannot be verified', () => {
  withMutatedDataset(
    (dataset) => {
      dataset.queries[0].gold[0].anchors = ['definitely-not-a-source-anchor'];
    },
    (path) => {
      const { receipt } = auditPaper5Dataset(path);
      assert.equal(receipt.status, 'fail');
      assert.ok(receipt.errors.some((error) => error.includes('missing-anchor')));
    }
  );
});

test('rejects a query that exposes a relevant file basename', () => {
  withMutatedDataset(
    (dataset) => {
      dataset.queries[0].query =
        'Which GraphRAGEngine implementation combines semantic candidates with graph evidence?';
    },
    (path) => {
      const { receipt } = auditPaper5Dataset(path);
      assert.equal(receipt.status, 'fail');
      assert.ok(receipt.errors.some((error) => error.includes('query-leaks-gold-basename')));
    }
  );
});

test('rejects a corpus below the frozen query and category floors', () => {
  withMutatedDataset(
    (dataset) => {
      dataset.queries = dataset.queries.slice(0, 18);
    },
    (path) => {
      const { receipt } = auditPaper5Dataset(path);
      assert.equal(receipt.status, 'fail');
      assert.ok(receipt.errors.includes('query-count-below-50'));
      assert.ok(receipt.errors.includes('impact-count-below-15'));
      assert.ok(receipt.errors.includes('reasoning-count-below-15'));
    }
  );
});
