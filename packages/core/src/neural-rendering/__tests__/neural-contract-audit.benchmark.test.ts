import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSyntheticT1Manifest,
  runContractAuditBenchmark,
  writeBenchmarkArtifact,
} from '../benchmarks/neural-contract-audit';

describe('paper-13 benchmark runner', () => {
  it('builds a T1 manifest with 4 canonical viewpoints and non-empty bounds', async () => {
    const m = await buildSyntheticT1Manifest();
    expect(m.tier).toBe('T1');
    expect(m.canonical_viewpoints.length).toBe(4);
    expect(m.tolerance_bands).toBeDefined();
    expect(m.tolerance_bands!.psnr_min).toBeGreaterThan(0);
    expect(m.upgrade_path).toMatch(/^neural:/);
  });

  it('passing path: synthetic metrics stay within bounds, audit.pass=true', async () => {
    const r = await runContractAuditBenchmark();
    expect(r.benchmark).toBe('neural-contract-audit');
    expect(r.manifest_tier).toBe('T1');
    expect(r.viewpoints).toBe(4);
    expect(r.pass).toBe(true);
    expect(r.audit.violations).toEqual([]);
    expect(r.audit.per_view.length).toBe(4);
    expect(r.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('fail path: one viewpoint below PSNR bound → violation recorded', async () => {
    const r = await runContractAuditBenchmark({ exercise_fail_path: true });
    expect(r.pass).toBe(false);
    expect(r.audit.violations.length).toBeGreaterThanOrEqual(1);
    const psnrViolation = r.audit.violations.find((v) => v.metric === 'psnr');
    expect(psnrViolation).toBeDefined();
    expect(psnrViolation!.observed).toBeLessThan(psnrViolation!.bound);
  });

  it('benchmark artifact is valid JSON, round-trippable from disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'neural-audit-'));
    try {
      const out_path = join(dir, 'neural-contract-audit.json');
      const r = await runContractAuditBenchmark();
      writeBenchmarkArtifact(r, out_path);
      expect(existsSync(out_path)).toBe(true);
      const parsed = JSON.parse(readFileSync(out_path, 'utf8'));
      expect(parsed.benchmark).toBe('neural-contract-audit');
      expect(parsed.manifest_asset_id).toBe(r.manifest_asset_id);
      expect(parsed.audit.pass).toBe(r.audit.pass);
      expect(parsed.spec_version).toContain('paper-13');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('manifest asset_id is deterministic across repeated runs', async () => {
    const a = await buildSyntheticT1Manifest();
    const b = await buildSyntheticT1Manifest();
    // Different created_at could break this — fixture pins created_at, so it
    // must be stable.
    expect(a.asset_id).toBe(b.asset_id);
  });
});
