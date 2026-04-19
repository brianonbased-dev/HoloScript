import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeHoloMapReplayFingerprint } from '../replayFingerprint';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('HoloMap golden replay fingerprint', () => {
  it('matches checked-in fixture (bump fixture intentionally when algorithm changes)', () => {
    const expected = readFileSync(
      join(__dirname, '../__fixtures__/GOLDEN_REPLAY_FINGERPRINT.txt'),
      'utf8',
    )
      .trim()
      .replace(/\r?\n/g, '');

    const fp = computeHoloMapReplayFingerprint({
      modelHash: 'golden-ci',
      seed: 0,
      weightStrategy: 'distill',
      videoHash: 'golden-2x2',
    });

    expect(fp).toBe(expected);
  });
});
