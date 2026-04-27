import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runPaper6MecanimBenchmark,
  writePaper6Artifact,
} from '../p6-gpu-publication';
import {
  PAPER_6_RIG_FIXTURES,
  PAPER_6_MECANIM_VERSION_CHAIN,
  HOLOSCRIPT_CONTRACT_BASELINE,
  fnv1a32,
  sampleRigUnderPolicy,
  runMecanimDivergenceMatrix,
} from '../../Paper6MecanimDivergenceProbe';

describe('paper-6 Mecanim cross-version divergence publication runner', () => {
  it('produces a (10 rigs x 3 versions) matrix at canonical scale', () => {
    const pub = runPaper6MecanimBenchmark();
    expect(pub.benchmark).toBe('paper-6-mecanim-divergence');
    expect(pub.rig_count).toBe(10);
    expect(pub.version_count).toBe(3);
    expect(pub.cells.length).toBe(30); // 10 rigs x 3 versions
    expect(pub.per_version.length).toBe(3);
    expect(pub.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('paper_ref points at the actual paper source file', () => {
    const pub = runPaper6MecanimBenchmark();
    expect(pub.paper_ref).toContain('paper-6-animation-sca.tex');
  });

  it('every cell carries both hashes and a maxL1Delta', () => {
    const pub = runPaper6MecanimBenchmark();
    for (const cell of pub.cells) {
      expect(typeof cell.baselineHash).toBe('number');
      expect(typeof cell.versionHash).toBe('number');
      expect(typeof cell.hashesEqual).toBe('boolean');
      expect(cell.hashesEqual).toBe(cell.baselineHash === cell.versionHash);
      expect(cell.maxL1Delta).toBeGreaterThanOrEqual(0);
      expect(cell.sampleByteCount).toBeGreaterThan(0);
    }
  });

  it('per-version stats carry divergenceRate, meanMaxL1, p99MaxL1', () => {
    const pub = runPaper6MecanimBenchmark();
    for (const v of pub.per_version) {
      expect(v.rigCount).toBe(10);
      expect(v.divergenceRate).toBeGreaterThanOrEqual(0);
      expect(v.divergenceRate).toBeLessThanOrEqual(1);
      expect(v.meanMaxL1).toBeGreaterThanOrEqual(0);
      // p99 of a positive-domain set is at least the mean.
      expect(v.p99MaxL1).toBeGreaterThanOrEqual(v.meanMaxL1);
    }
  });

  it('markdown table renders all 3 canonical Mecanim versions', () => {
    const pub = runPaper6MecanimBenchmark();
    expect(pub.markdown_table).toContain('Unity 2021.3 LTS');
    expect(pub.markdown_table).toContain('Unity 2022.3 LTS');
    expect(pub.markdown_table).toContain('Unity 2023.2');
    // Header columns the paper's table references.
    expect(pub.markdown_table).toContain('Divergence rate');
    expect(pub.markdown_table).toContain('Mean max-L1');
    expect(pub.markdown_table).toContain('p99 max-L1');
  });

  it('artifact round-trips from disk with schema intact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paper6-'));
    try {
      const out_path = join(dir, 'paper-6-gpu-bench.json');
      const pub = runPaper6MecanimBenchmark();
      writePaper6Artifact(pub, out_path);
      expect(existsSync(out_path)).toBe(true);
      const parsed = JSON.parse(readFileSync(out_path, 'utf8'));
      expect(parsed.benchmark).toBe('paper-6-mecanim-divergence');
      expect(parsed.paper_ref).toContain('paper-6-animation-sca.tex');
      expect(parsed.cells.length).toBe(30);
      expect(parsed.per_version.length).toBe(3);
      expect(parsed.spec_version).toContain('paper-6');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('per-version order matches PAPER_6_MECANIM_VERSION_CHAIN order', () => {
    const pub = runPaper6MecanimBenchmark();
    for (let i = 0; i < pub.per_version.length; i++) {
      expect(pub.per_version[i]!.versionLabel).toBe(PAPER_6_MECANIM_VERSION_CHAIN[i]!.label);
    }
  });
});

describe('paper-6 Mecanim divergence probe — direct invariants', () => {
  it('contract baseline diverges zero from itself across every rig (sanity)', () => {
    for (const rig of PAPER_6_RIG_FIXTURES) {
      const a = sampleRigUnderPolicy(rig, HOLOSCRIPT_CONTRACT_BASELINE);
      const b = sampleRigUnderPolicy(rig, HOLOSCRIPT_CONTRACT_BASELINE);
      expect(fnv1a32(a)).toBe(fnv1a32(b));
    }
  });

  it('FNV-1a is deterministic across calls', () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(fnv1a32(buf)).toBe(fnv1a32(buf));
  });

  it('matrix run is deterministic — two runs produce the same cells', () => {
    const r1 = runMecanimDivergenceMatrix();
    const r2 = runMecanimDivergenceMatrix();
    expect(r1.cells.length).toBe(r2.cells.length);
    for (let i = 0; i < r1.cells.length; i++) {
      const a = r1.cells[i]!;
      const b = r2.cells[i]!;
      expect(a.rigId).toBe(b.rigId);
      expect(a.versionLabel).toBe(b.versionLabel);
      expect(a.baselineHash).toBe(b.baselineHash);
      expect(a.versionHash).toBe(b.versionHash);
      expect(a.hashesEqual).toBe(b.hashesEqual);
      expect(a.maxL1Delta).toBe(b.maxL1Delta);
    }
  });

  it('at least one Unity minor version diverges on at least one rig (paper claim)', () => {
    // The paper's claim is that minor-version Mecanim chains DO drift.
    // The harness must reproduce that — otherwise our policy model is broken.
    const report = runMecanimDivergenceMatrix();
    const anyDivergence = report.perVersion.some((v) => v.divergedCount > 0);
    expect(anyDivergence).toBe(true);
  });

  it('rig fixture set is exactly the 10 AAA rigs the paper cites', () => {
    expect(PAPER_6_RIG_FIXTURES.length).toBe(10);
    const ids = new Set(PAPER_6_RIG_FIXTURES.map((r) => r.id));
    expect(ids.size).toBe(10); // unique
  });
});
