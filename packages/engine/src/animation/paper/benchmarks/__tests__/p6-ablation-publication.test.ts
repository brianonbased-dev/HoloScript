import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runPaper6AblationBenchmark,
  writePaper6AblationArtifact,
} from '../p6-ablation-publication';

describe('paper-6 constraint-solver ablation publication runner', () => {
  it('emits the three publication variants', () => {
    const artifact = runPaper6AblationBenchmark();
    expect(artifact.benchmark).toBe('paper-6-ablation-publication');
    expect(artifact.rows.map((row) => row.variant)).toEqual([
      'full-solver',
      'minus-solver',
      'baseline-no-pipeline',
    ]);
  });

  it('full solver is the reference hash and ablated variants diverge', () => {
    const artifact = runPaper6AblationBenchmark();
    const full = artifact.rows.find((row) => row.variant === 'full-solver');
    const minus = artifact.rows.find((row) => row.variant === 'minus-solver');
    const baseline = artifact.rows.find((row) => row.variant === 'baseline-no-pipeline');

    expect(full?.reference_hash_equal).toBe(true);
    expect(full?.divergence_vs_reference).toBe(0);
    expect(minus?.reference_hash_equal).toBe(false);
    expect((minus?.divergence_vs_reference ?? 0)).toBeGreaterThan(0);
    expect(baseline?.reference_hash_equal).toBe(false);
    expect((baseline?.divergence_vs_reference ?? 0)).toBeGreaterThan(0);
  });

  it('records positive per-frame timings for every row', () => {
    const artifact = runPaper6AblationBenchmark();
    for (const row of artifact.rows) {
      expect(row.per_frame_us).toBeGreaterThan(0);
    }
  });

  it('artifact round-trips from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paper6-ablation-'));
    try {
      const out = join(dir, 'paper-6-ablation-publication.json');
      const artifact = runPaper6AblationBenchmark();
      writePaper6AblationArtifact(artifact, out);
      const parsed = JSON.parse(readFileSync(out, 'utf8'));
      expect(parsed.schema_version).toBe('paper-6-ablation-v1');
      expect(parsed.rows).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
