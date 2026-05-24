import { describe, expect, it } from 'vitest';
import {
  P043_REQUIRED_RUNS,
  artifactPathForP043QuestCell,
  buildP043QuestArtifact,
  metric,
  parseP043QuestCellId,
  validateP043QuestArtifact,
} from './p043QuestCapture';

describe('p043QuestCapture', () => {
  it('parses only Quest 3 matrix cell ids', () => {
    const cell = parseP043QuestCellId('quest3-adreno740__dense-2m__n4');

    expect(cell?.sceneId).toBe('dense-2m');
    expect(cell?.views).toBe(4);
    expect(artifactPathForP043QuestCell(cell!)).toBe(
      '.bench-logs/p043-sku-matrix/quest3-adreno740/dense-2m/n4.json'
    );
    expect(parseP043QuestCellId('rtx4090__dense-2m__n4')).toBeNull();
    expect(parseP043QuestCellId('quest3-adreno740__dense-2m__n8')).toBeNull();
  });

  it('computes percentile metrics with rounded samples', () => {
    expect(metric([4.12345, 1, 9, 2])).toMatchObject({
      samples: [4.1235, 1, 9, 2],
      p50: 2,
      p95: 9,
      p99: 9,
    });
  });

  it('builds a validator-compatible Quest artifact', () => {
    const cell = parseP043QuestCellId('quest3-adreno740__indoor-500k__n2');
    expect(cell).not.toBeNull();

    const artifact = buildP043QuestArtifact({
      cell: cell!,
      runSamples: [
        [10, 11],
        [9, 10],
        [8, 9],
      ],
      checksum: 42,
      adapterInfo: {},
      browserVersion: 'Quest Browser UA',
      osVersion: 'Quest',
      browserShell: 'Quest Browser',
      batteryState: '90% discharging',
      thermalState: 'cool',
    });

    const validation = validateP043QuestArtifact(artifact);
    expect(validation.ok).toBe(true);
    expect(artifact.requiredRuns).toBe(P043_REQUIRED_RUNS);
    expect(JSON.stringify(artifact.adapterInfo).toLowerCase()).toContain('qualcomm');
    expect(JSON.stringify(artifact.adapterInfo).toLowerCase()).toContain('adreno');
  });

  it('rejects smoke and wrong-adapter artifacts', () => {
    const cell = parseP043QuestCellId('quest3-adreno740__indoor-500k__n2');
    const artifact = buildP043QuestArtifact({
      cell: cell!,
      runSamples: [[1], [1], [1]],
      checksum: 1,
      adapterInfo: { vendor: 'NVIDIA', device: 'RTX 4090' },
      browserVersion: 'Chrome',
      osVersion: 'Windows',
      browserShell: 'Chrome',
      batteryState: 'unknown',
      thermalState: 'unknown',
    });

    artifact.captureMode = 'smoke-cpu';
    artifact.adapterInfo = { vendor: 'NVIDIA', device: 'RTX 4090' };

    const validation = validateP043QuestArtifact(artifact);
    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain('captureMode must not be smoke');
    expect(validation.errors).toContain('adapterInfo must include adreno');
    expect(validation.errors).toContain('adapterInfo must include qualcomm');
  });
});
