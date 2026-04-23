import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runPaper7IKLatencyBenchmark,
  writePaper7Artifact,
} from '../ik-latency-publication';

describe('paper-7 IK latency publication runner', () => {
  it('produces a 12-cell matrix at reduced task_count for CI', () => {
    const pub = runPaper7IKLatencyBenchmark({
      task_count: 64, // CI-friendly; full 10,000 is for publication runs only
      warmup_runs: 0,
      measured_runs: 2,
      seed: 99,
    });
    expect(pub.benchmark).toBe('paper-7-ik-latency');
    expect(pub.cells.length).toBe(12); // 3 modes × 4 chain lengths
    expect(pub.task_count).toBe(64);
    expect(pub.measured_runs).toBe(2);
    expect(pub.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('markdown table renders all modes and all chain lengths', () => {
    const pub = runPaper7IKLatencyBenchmark({
      task_count: 32,
      warmup_runs: 0,
      measured_runs: 1,
      seed: 77,
    });
    expect(pub.markdown_table).toContain('| Analytic |');
    expect(pub.markdown_table).toContain('| CCD |');
    expect(pub.markdown_table).toContain('| FABRIK |');
    expect(pub.markdown_table).toContain('2 bones');
    expect(pub.markdown_table).toContain('10 bones');
  });

  it('every cell carries median + per-run microseconds', () => {
    const pub = runPaper7IKLatencyBenchmark({
      task_count: 32,
      warmup_runs: 0,
      measured_runs: 3,
      seed: 33,
    });
    for (const cell of pub.cells) {
      expect(cell.medianMicrosecondsPerSolve).toBeGreaterThanOrEqual(0);
      expect(cell.runMicrosecondsPerSolve).toHaveLength(3);
      expect(['analytic', 'ccd', 'fabrik']).toContain(cell.mode);
      expect([2, 3, 5, 10]).toContain(cell.chainLength);
    }
  });

  it('artifact round-trips from disk with schema intact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paper7-'));
    try {
      const out_path = join(dir, 'paper-7-ik-latency.json');
      const pub = runPaper7IKLatencyBenchmark({
        task_count: 32,
        warmup_runs: 0,
        measured_runs: 1,
        seed: 55,
      });
      writePaper7Artifact(pub, out_path);
      expect(existsSync(out_path)).toBe(true);
      const parsed = JSON.parse(readFileSync(out_path, 'utf8'));
      expect(parsed.benchmark).toBe('paper-7-ik-latency');
      expect(parsed.paper_ref).toContain('paper-7-ik-siggraph.tex');
      expect(parsed.cells.length).toBe(12);
      expect(parsed.spec_version).toContain('paper-7');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
