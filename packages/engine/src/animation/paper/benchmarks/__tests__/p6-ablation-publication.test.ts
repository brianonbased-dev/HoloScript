import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runPaper6AblationBenchmark,
  writePaper6AblationArtifact,
} from '../p6-ablation-publication';

const artifact = runPaper6AblationBenchmark();
const packageReceiptText = readFileSync(
  new URL('../../../../../.bench-logs/paper-6-ablation-publication.json', import.meta.url),
  'utf8'
);
const rootReceiptText = readFileSync(
  new URL('../../../../../../../.bench-logs/paper-6-ablation-publication.json', import.meta.url),
  'utf8'
);
const frozenArtifact = JSON.parse(packageReceiptText);

describe('paper-6 foot-Y preprocessing and playback publication runner', () => {
  it('emits the three publication variants', () => {
    expect(artifact.benchmark).toBe('paper-6-ablation-publication');
    expect(artifact.rows.map((row) => row.variant)).toEqual([
      'foot-y-normalized',
      'retarget-only',
      'raw-position-only',
    ]);
  });

  it('compares aligned semantic position channels', () => {
    const normalized = artifact.rows.find((row) => row.variant === 'foot-y-normalized');
    const retargetOnly = artifact.rows.find((row) => row.variant === 'retarget-only');
    const raw = artifact.rows.find((row) => row.variant === 'raw-position-only');

    expect(normalized?.reference_hash_equal).toBe(true);
    expect(normalized?.max_position_l1_vs_reference).toBe(0);
    expect(retargetOnly?.reference_hash_equal).toBe(false);
    expect(retargetOnly?.max_position_l1_vs_reference ?? 0).toBeGreaterThan(0);
    expect(raw?.reference_hash_equal).toBe(false);
    expect(raw?.comparison_hash).toBe(retargetOnly?.comparison_hash);
    expect(raw?.max_position_l1_vs_reference).toBe(retargetOnly?.max_position_l1_vs_reference);
    expect(normalized?.sampled_tracks).toBe(28);
    expect(retargetOnly?.sampled_tracks).toBe(28);
    expect(raw?.sampled_tracks).toBe(21);
  });

  it('pins the live workload and semantic comparison results', () => {
    expect(artifact).toMatchObject({
      frames: 60,
      iterations_per_round: 1500,
      warmup_iterations: 100,
      timing_rounds: 5,
    });
    expect(
      artifact.rows.map(
        ({
          variant,
          sampled_tracks,
          comparison_hash,
          reference_hash_equal,
          max_position_l1_vs_reference,
        }) => ({
          variant,
          sampled_tracks,
          comparison_hash,
          reference_hash_equal,
          max_position_l1_vs_reference,
        })
      )
    ).toEqual([
      {
        variant: 'foot-y-normalized',
        sampled_tracks: 28,
        comparison_hash: '18aad9ad',
        reference_hash_equal: true,
        max_position_l1_vs_reference: 0,
      },
      {
        variant: 'retarget-only',
        sampled_tracks: 28,
        comparison_hash: 'fc2cd0f5',
        reference_hash_equal: false,
        max_position_l1_vs_reference: 0.033,
      },
      {
        variant: 'raw-position-only',
        sampled_tracks: 21,
        comparison_hash: 'fc2cd0f5',
        reference_hash_equal: false,
        max_position_l1_vs_reference: 0.033,
      },
    ]);
  });

  it('records bounded sample-only timing rounds for every row', () => {
    for (const row of artifact.rows) {
      expect(row.sample_only_per_frame_us_min).toBeGreaterThan(0);
      expect(row.sample_only_per_frame_us_median).toBeGreaterThanOrEqual(
        row.sample_only_per_frame_us_min
      );
      expect(row.sample_only_per_frame_us_max).toBeGreaterThanOrEqual(
        row.sample_only_per_frame_us_median
      );
    }
  });

  it('artifact round-trips from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paper6-ablation-'));
    try {
      const out = join(dir, 'paper-6-ablation-publication.json');
      writePaper6AblationArtifact(artifact, out);
      const parsed = JSON.parse(readFileSync(out, 'utf8'));
      expect(parsed.schema_version).toBe('paper-6-ablation-v2');
      expect(parsed.sampling_contract).toBe('full-clip-playback+quaternion-nlerp[x,y,z,w]');
      expect(parsed.comparison_contract).toBe('aligned-position[x,y,z]-in-source-bone-order');
      expect(parsed.warmup_iterations).toBe(100);
      expect(parsed.environment.execution).toBe('single-process-cpu-javascript');
      expect(parsed.environment.cpu_model).toEqual(expect.any(String));
      expect(parsed.rows).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('pins the committed receipt and its public timing table', () => {
    expect(rootReceiptText).toBe(packageReceiptText);
    expect(frozenArtifact).toMatchObject({
      schema_version: 'paper-6-ablation-v2',
      frames: 60,
      iterations_per_round: 1500,
      warmup_iterations: 100,
      timing_rounds: 5,
      sampling_contract: 'full-clip-playback+quaternion-nlerp[x,y,z,w]',
      comparison_contract: 'aligned-position[x,y,z]-in-source-bone-order',
    });
    expect(frozenArtifact.rows).toEqual([
      {
        variant: 'foot-y-normalized',
        sample_only_per_frame_us_median: 18.475,
        sample_only_per_frame_us_min: 18.104,
        sample_only_per_frame_us_max: 19.088,
        sampled_tracks: 28,
        comparison_hash: '18aad9ad',
        reference_hash_equal: true,
        max_position_l1_vs_reference: 0,
      },
      {
        variant: 'retarget-only',
        sample_only_per_frame_us_median: 19.011,
        sample_only_per_frame_us_min: 18.464,
        sample_only_per_frame_us_max: 19.501,
        sampled_tracks: 28,
        comparison_hash: 'fc2cd0f5',
        reference_hash_equal: false,
        max_position_l1_vs_reference: 0.033,
      },
      {
        variant: 'raw-position-only',
        sample_only_per_frame_us_median: 14.105,
        sample_only_per_frame_us_min: 13.772,
        sample_only_per_frame_us_max: 15.542,
        sampled_tracks: 21,
        comparison_hash: 'fc2cd0f5',
        reference_hash_equal: false,
        max_position_l1_vs_reference: 0.033,
      },
    ]);
  });
});
