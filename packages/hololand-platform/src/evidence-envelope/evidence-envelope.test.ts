import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildEvidenceEnvelope,
  buildPaper12HololandEvidenceEnvelope,
  verifyEvidenceEnvelope,
  type EvidenceEnvelopeRuntime,
} from './index';

const FIXED_NOW = '2026-05-14T12:00:00.000Z';

const RUNTIME: EvidenceEnvelopeRuntime = {
  os: 'win32',
  release: '10.0.0',
  arch: 'x64',
  nodeVersion: 'v22.0.0',
  v8Version: '12.4.0',
  pnpmVersion: '10.0.0',
  cpuModel: 'test-cpu',
  logicalCores: 16,
  totalMemoryGB: 64,
};

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'evidence-envelope-'));
}

describe('HoloScript evidence envelope', () => {
  it('binds environment, artifacts, and rerun command into a verifiable hash', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'artifact.json'), '{"ok":true}\n', 'utf8');

    const manifest = buildEvidenceEnvelope({
      cwd: dir,
      generatedAt: FIXED_NOW,
      paper: { id: '12', title: 'HoloLand' },
      hardwareTier: 'codex-hardware-local',
      runtime: RUNTIME,
      sourceRevisions: [{ repo: 'HoloScript', commit: 'abc123', dirty: false }],
      setupCommand: 'pnpm install --frozen-lockfile',
      seed: 'paper-12-seed',
      harnessCommand: 'pnpm --filter @holoscript/hololand-platform run device-lab',
      rerunCommand: 'pnpm --filter @holoscript/hololand-platform run evidence-envelope',
      artifacts: [
        {
          repo: 'HoloScript',
          path: 'artifact.json',
          role: 'receipt',
        },
      ],
    });

    expect(manifest.schemaVersion).toBe('holoscript.evidence-envelope.v1');
    expect(manifest.manifestId).toMatch(/^eenv_[a-f0-9]{16}$/);
    expect(manifest.environment.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.reproducibility.artifactPaths).toEqual(['HoloScript:artifact.json']);
    expect(manifest.artifacts[0]).toMatchObject({
      exists: true,
      bytes: 12,
      sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(verifyEvidenceEnvelope(manifest)).toMatchObject({ valid: true });
  });

  it('detects manifest tampering', () => {
    const manifest = buildEvidenceEnvelope({
      generatedAt: FIXED_NOW,
      paper: { id: '12', title: 'HoloLand' },
      hardwareTier: 'codex-hardware-local',
      runtime: RUNTIME,
      sourceRevisions: [],
      seed: 'seed-a',
      harnessCommand: 'pnpm test',
      rerunCommand: 'pnpm test',
      artifacts: [],
    });

    const tampered = {
      ...manifest,
      reproducibility: {
        ...manifest.reproducibility,
        seed: 'seed-b',
      },
    };

    expect(verifyEvidenceEnvelope(tampered).valid).toBe(false);
    expect(verifyEvidenceEnvelope(tampered).reason).toContain('hash mismatch');
  });

  it('builds the Paper 12 HoloLand preset with calibration and public citation paths', () => {
    const manifest = buildPaper12HololandEvidenceEnvelope({
      cwd: makeTempDir(),
      generatedAt: FIXED_NOW,
      runtime: RUNTIME,
      sourceRevisions: [{ repo: 'HoloScript', commit: 'abc123', dirty: false }],
      hardwareTier: 'codex-hardware-local',
    });

    expect(manifest.paper).toMatchObject({
      id: '12',
      title: 'HoloLand',
      basename: 'paper-12-holo-i3d.tex',
    });
    expect(manifest.calibration.checks.map((check) => check.id)).toEqual([
      'runtime-inventory',
      'device-lab',
      'trace-corpus',
    ]);
    expect(manifest.reproducibility.rerunCommand).toContain(
      'pnpm --filter @holoscript/hololand-platform run evidence-envelope',
    );
    expect(manifest.artifacts.map((artifact) => artifact.path)).toContain(
      'docs/public/evidence/evidence-envelope.schema.json',
    );
    expect(verifyEvidenceEnvelope(manifest).valid).toBe(true);
  });
});
