import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { generateDataset, toJsonl } from '../generateDataset';

/**
 * Emits the EXP-2 SFT corpus to disk. Gated on EXP2_EMIT=1 so it does not write
 * during normal test runs. Train/eval split by disjoint seed.
 */
describe.runIf(process.env.EXP2_EMIT === '1')('EXP-2 dataset emit', () => {
  it('writes train + eval JSONL', () => {
    const dir = process.env.EXP2_OUT_DIR || join(process.cwd(), '.exp2-data');
    mkdirSync(dir, { recursive: true });
    const train = toJsonl(generateDataset(4000, 42));
    const evalSet = toJsonl(generateDataset(800, 99));
    writeFileSync(join(dir, 'exp2-train.jsonl'), train, 'utf8');
    writeFileSync(join(dir, 'exp2-eval.jsonl'), evalSet, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`EXP2_EMITTED train=4000 eval=800 -> ${dir}`);
    expect(train.split('\n').filter(Boolean).length).toBe(4000);
    expect(evalSet.split('\n').filter(Boolean).length).toBe(800);
  });
});
