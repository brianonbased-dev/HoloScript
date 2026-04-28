import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hashFloat32Array,
  composeHashes,
  runCrossBackendDeterminismMatrix,
  runFullLoopDemoV2,
  formatDeterminismMarkdown,
  formatFullLoopDemoMarkdown,
  PAPER_8_SOLVER_MODES,
  PAPER_8_CHAIN_LENGTHS,
  PAPER_8_GPU_CONFIGS,
  PAPER_8_TASK_COUNT_DEFAULT,
  PAPER_8_SEED_DEFAULT,
} from '../../Paper8CrossBackendDeterminismProbe';
import {
  runPaper8DeterminismBenchmark,
  runPaper8FullLoopDemoBenchmark,
  writePaper8DeterminismArtifact,
  writePaper8FullLoopArtifact,
} from '../paper-8-publication';

// ─── hashFloat32Array ────────────────────────────────────────────────────────

describe('hashFloat32Array', () => {
  it('produces the same hash for the same data (deterministic)', () => {
    const buf = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    expect(hashFloat32Array(buf)).toBe(hashFloat32Array(buf));
  });

  it('produces different hashes for different data', () => {
    const a = new Float32Array([1.0, 2.0, 3.0]);
    const b = new Float32Array([1.0, 2.0, 4.0]);
    expect(hashFloat32Array(a)).not.toBe(hashFloat32Array(b));
  });

  it('returns a uint32 value', () => {
    const buf = new Float32Array([0.5, 1.5, 2.5]);
    const h = hashFloat32Array(buf);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffff_ffff);
    expect(Number.isInteger(h)).toBe(true);
  });

  it('respects the seed parameter', () => {
    const buf = new Float32Array([1.0, 2.0]);
    const h1 = hashFloat32Array(buf, 0x1234);
    const h2 = hashFloat32Array(buf, 0x5678);
    expect(h1).not.toBe(h2);
  });

  it('is consistent across repeated calls with same input', () => {
    const buf = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const results = Array.from({ length: 5 }, () => hashFloat32Array(buf, 42));
    expect(new Set(results).size).toBe(1);
  });
});

// ─── composeHashes ────────────────────────────────────────────────────────────

describe('composeHashes', () => {
  it('returns a uint32', () => {
    const h = composeHashes(0xdeadbeef, 0xcafebabe);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffff_ffff);
  });

  it('is deterministic', () => {
    expect(composeHashes(0x1234, 0x5678)).toBe(composeHashes(0x1234, 0x5678));
  });

  it('is sensitive to both inputs', () => {
    const h1 = composeHashes(0xaaaa, 0xbbbb);
    const h2 = composeHashes(0xaaaa, 0xcccc);
    const h3 = composeHashes(0xdddd, 0xbbbb);
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
  });
});

// ─── Constants ────────────────────────────────────────────────────────────────

describe('paper-8 constants', () => {
  it('has 3 solver modes', () => {
    expect(PAPER_8_SOLVER_MODES).toHaveLength(3);
    expect(PAPER_8_SOLVER_MODES).toContain('analytic');
    expect(PAPER_8_SOLVER_MODES).toContain('ccd');
    expect(PAPER_8_SOLVER_MODES).toContain('fabrik');
  });

  it('has 4 chain lengths', () => {
    expect(PAPER_8_CHAIN_LENGTHS).toHaveLength(4);
    expect(PAPER_8_CHAIN_LENGTHS).toContain(2);
    expect(PAPER_8_CHAIN_LENGTHS).toContain(10);
  });

  it('has 4 GPU configurations', () => {
    expect(PAPER_8_GPU_CONFIGS).toHaveLength(4);
    expect(PAPER_8_GPU_CONFIGS.map((g) => g.id)).toContain('rtx6000-ada');
    expect(PAPER_8_GPU_CONFIGS.map((g) => g.id)).toContain('h100-80gb');
  });

  it('default task count is 10,000', () => {
    expect(PAPER_8_TASK_COUNT_DEFAULT).toBe(10_000);
  });

  it('default seed is 1337', () => {
    expect(PAPER_8_SEED_DEFAULT).toBe(1337);
  });
});

// ─── Cross-Backend Determinism Matrix ────────────────────────────────────────

describe('runCrossBackendDeterminismMatrix', () => {
  it('produces 12 cells (3 modes × 4 chain lengths) at CI task count', () => {
    const result = runCrossBackendDeterminismMatrix({ taskCount: 64, seed: 42 });
    expect(result.cells).toHaveLength(12);
    expect(result.totalCount).toBe(12);
  });

  it('all cells pass (hash A === hash B) — determinism contract', () => {
    const result = runCrossBackendDeterminismMatrix({ taskCount: 64, seed: 99 });
    for (const cell of result.cells) {
      expect(cell.passed).toBe(true);
    }
    expect(result.overallPassed).toBe(true);
    expect(result.passCount).toBe(12);
  });

  it('each cell has correct mode and chain length', () => {
    const result = runCrossBackendDeterminismMatrix({ taskCount: 32, seed: 1 });
    const modes = new Set(result.cells.map((c) => c.mode));
    const lengths = new Set(result.cells.map((c) => c.chainLength));
    expect(modes).toEqual(new Set(['analytic', 'ccd', 'fabrik']));
    expect(lengths).toEqual(new Set([2, 3, 5, 10]));
  });

  it('cells carry positive elapsed times', () => {
    const result = runCrossBackendDeterminismMatrix({ taskCount: 32, seed: 7 });
    for (const cell of result.cells) {
      expect(cell.runAMs).toBeGreaterThanOrEqual(0);
      expect(cell.runBMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('hash values are non-zero uint32', () => {
    const result = runCrossBackendDeterminismMatrix({ taskCount: 32, seed: 11 });
    for (const cell of result.cells) {
      expect(cell.hashA).toBeGreaterThan(0);
      expect(cell.hashB).toBeGreaterThan(0);
      expect(cell.hashA).toBeLessThanOrEqual(0xffff_ffff);
    }
  });

  it('different seeds produce different hashes', () => {
    const r1 = runCrossBackendDeterminismMatrix({ taskCount: 32, seed: 1 });
    const r2 = runCrossBackendDeterminismMatrix({ taskCount: 32, seed: 2 });
    // At least one cell should differ
    const diffCount = r1.cells.filter((c, i) => c.hashA !== r2.cells[i]!.hashA).length;
    expect(diffCount).toBeGreaterThan(0);
  });

  it('results are reproducible across independent calls', () => {
    const r1 = runCrossBackendDeterminismMatrix({ taskCount: 32, seed: 55 });
    const r2 = runCrossBackendDeterminismMatrix({ taskCount: 32, seed: 55 });
    for (let i = 0; i < r1.cells.length; i++) {
      expect(r1.cells[i]!.hashA).toBe(r2.cells[i]!.hashA);
    }
  });
});

// ─── Determinism Markdown ─────────────────────────────────────────────────────

describe('formatDeterminismMarkdown', () => {
  it('renders all 3 modes in the table', () => {
    const result = runCrossBackendDeterminismMatrix({ taskCount: 32, seed: 3 });
    const md = formatDeterminismMarkdown(result);
    expect(md).toContain('analytic');
    expect(md).toContain('ccd');
    expect(md).toContain('fabrik');
  });

  it('contains pass rate summary', () => {
    const result = runCrossBackendDeterminismMatrix({ taskCount: 32, seed: 4 });
    const md = formatDeterminismMarkdown(result);
    expect(md).toContain('Pass rate:');
    expect(md).toContain('ALL PASS');
  });

  it('has header and separator rows', () => {
    const result = runCrossBackendDeterminismMatrix({ taskCount: 32, seed: 5 });
    const md = formatDeterminismMarkdown(result);
    expect(md).toContain('| Mode |');
    expect(md).toContain('|---');
  });
});

// ─── Full Loop Demo v2 ────────────────────────────────────────────────────────

describe('runFullLoopDemoV2', () => {
  it('produces correct agent and frame counts', () => {
    const result = runFullLoopDemoV2({ agentCount: 10, frameCount: 5, seed: 42 });
    expect(result.agentCount).toBe(10);
    expect(result.frameCount).toBe(5);
    expect(result.frames).toHaveLength(5);
  });

  it('each frame has correct agent count', () => {
    const result = runFullLoopDemoV2({ agentCount: 20, frameCount: 3, seed: 7 });
    for (const frame of result.frames) {
      expect(frame.agents).toHaveLength(20);
    }
  });

  it('frame hashes are non-zero', () => {
    const result = runFullLoopDemoV2({ agentCount: 5, frameCount: 4, seed: 99 });
    for (const frame of result.frames) {
      expect(frame.composedFrameHash).toBeGreaterThan(0);
    }
  });

  it('provenance overhead latency fields are non-negative', () => {
    const result = runFullLoopDemoV2({ agentCount: 10, frameCount: 5, seed: 13 });
    expect(result.meanPhysicsMs).toBeGreaterThanOrEqual(0);
    expect(result.meanAnimMs).toBeGreaterThanOrEqual(0);
    expect(result.meanIKMs).toBeGreaterThanOrEqual(0);
    expect(result.meanClothMs).toBeGreaterThanOrEqual(0);
    expect(result.meanTotalMs).toBeGreaterThanOrEqual(0);
  });

  it('meets the 0.34 ms/frame target for small agent counts', () => {
    // Lightweight model should comfortably meet the JS-overhead target
    const result = runFullLoopDemoV2({ agentCount: 10, frameCount: 5, seed: 77 });
    expect(result.meetsTarget).toBe(true);
  });

  it('target ms is 0.34', () => {
    const result = runFullLoopDemoV2({ agentCount: 5, frameCount: 2, seed: 1 });
    expect(result.targetMs).toBe(0.34);
  });

  it('agent frames carry all four subsystem hashes', () => {
    const result = runFullLoopDemoV2({ agentCount: 3, frameCount: 2, seed: 22 });
    for (const frame of result.frames) {
      for (const ag of frame.agents) {
        expect(ag.physicsHash).toBeGreaterThan(0);
        expect(ag.animHash).toBeGreaterThan(0);
        expect(ag.ikHash).toBeGreaterThan(0);
        expect(ag.clothHash).toBeGreaterThan(0);
        expect(ag.composedHash).toBeGreaterThan(0);
      }
    }
  });

  it('composed frame hash changes across frames (non-trivial)', () => {
    const result = runFullLoopDemoV2({ agentCount: 5, frameCount: 10, seed: 33 });
    const hashes = new Set(result.frames.map((f) => f.composedFrameHash));
    expect(hashes.size).toBeGreaterThan(1);
  });
});

// ─── Full Loop Demo Markdown ──────────────────────────────────────────────────

describe('formatFullLoopDemoMarkdown', () => {
  it('contains all 4 subsystems', () => {
    const result = runFullLoopDemoV2({ agentCount: 5, frameCount: 3, seed: 8 });
    const md = formatFullLoopDemoMarkdown(result);
    expect(md).toContain('Physics');
    expect(md).toContain('Animation');
    expect(md).toContain('IK');
    expect(md).toContain('Cloth');
  });

  it('contains target met line', () => {
    const result = runFullLoopDemoV2({ agentCount: 5, frameCount: 3, seed: 9 });
    const md = formatFullLoopDemoMarkdown(result);
    expect(md).toMatch(/Target met:/);
  });
});

// ─── Publication Runner — Determinism ────────────────────────────────────────

describe('runPaper8DeterminismBenchmark', () => {
  it('produces a valid publication object at CI task count', () => {
    const pub = runPaper8DeterminismBenchmark({ taskCount: 32, seed: 42 });
    expect(pub.benchmark).toBe('paper-8-cross-backend-determinism');
    expect(pub.paper_ref).toContain('paper-8-unified-siggraph.tex');
    expect(pub.spec_version).toContain('paper-8');
    expect(pub.task_count).toBe(32);
    expect(pub.seed).toBe(42);
    expect(pub.matrix.cells).toHaveLength(12);
    expect(pub.matrix.overallPassed).toBe(true);
    expect(pub.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('markdown table is rendered', () => {
    const pub = runPaper8DeterminismBenchmark({ taskCount: 32, seed: 1 });
    expect(pub.markdown_table).toContain('analytic');
    expect(pub.markdown_table).toContain('Pass rate:');
  });

  it('artifact round-trips from disk with schema intact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paper8-det-'));
    try {
      const out_path = join(dir, 'paper-8-determinism.json');
      const pub = runPaper8DeterminismBenchmark({ taskCount: 32, seed: 55 });
      writePaper8DeterminismArtifact(pub, out_path);
      expect(existsSync(out_path)).toBe(true);
      const parsed = JSON.parse(readFileSync(out_path, 'utf8'));
      expect(parsed.benchmark).toBe('paper-8-cross-backend-determinism');
      expect(parsed.matrix.overallPassed).toBe(true);
      expect(parsed.matrix.cells).toHaveLength(12);
      expect(parsed.gpu_configs).toHaveLength(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Publication Runner — Full Loop Demo ────────────────────────────────────

describe('runPaper8FullLoopDemoBenchmark', () => {
  it('produces a valid publication object', () => {
    const pub = runPaper8FullLoopDemoBenchmark({ agentCount: 10, frameCount: 5, seed: 42 });
    expect(pub.benchmark).toBe('paper-8-full-loop-demo-v2');
    expect(pub.paper_ref).toContain('paper-8-unified-siggraph.tex');
    expect(pub.agent_count).toBe(10);
    expect(pub.frame_count).toBe(5);
    expect(pub.result.frames).toHaveLength(5);
    expect(pub.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('markdown summary is rendered', () => {
    const pub = runPaper8FullLoopDemoBenchmark({ agentCount: 5, frameCount: 3, seed: 7 });
    expect(pub.markdown_summary).toContain('Physics');
    expect(pub.markdown_summary).toContain('Target met:');
  });

  it('artifact round-trips from disk with schema intact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paper8-fl-'));
    try {
      const out_path = join(dir, 'paper-8-full-loop-demo.json');
      const pub = runPaper8FullLoopDemoBenchmark({ agentCount: 5, frameCount: 3, seed: 99 });
      writePaper8FullLoopArtifact(pub, out_path);
      expect(existsSync(out_path)).toBe(true);
      const parsed = JSON.parse(readFileSync(out_path, 'utf8'));
      expect(parsed.benchmark).toBe('paper-8-full-loop-demo-v2');
      expect(parsed.agent_count).toBe(5);
      expect(parsed.result.frames).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
