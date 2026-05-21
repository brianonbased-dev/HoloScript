/**
 * ProvenanceEdge — unit tests (HoloGraph Phase 2)
 *
 * Covers: registerProvenance(), getProvenanceForFile(), getAllProvenanceEdges(),
 * getValidatedFilePaths(), sliceDiversity(), isValidated(), clear() resets provenance
 */

import { describe, it, expect } from 'vitest';
import { CodebaseGraph } from '../CodebaseGraph';
import type { ScannedFile, ProvenanceEdge } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFile(filePath: string): ScannedFile {
  return {
    path: filePath,
    language: 'typescript',
    symbols: [{ name: 'fn', type: 'function', language: 'typescript', visibility: 'public', filePath, line: 1, isExported: true }],
    imports: [],
    calls: [],
    loc: 10,
    sizeBytes: 200,
  };
}

function makeReceipt(filePath: string, contractHash: string, opts?: Partial<ProvenanceEdge>): ProvenanceEdge {
  return {
    filePath,
    contractHash,
    simTimestampMs: Date.now(),
    ...opts,
  };
}

function buildGraph(filePaths: string[]): CodebaseGraph {
  const g = new CodebaseGraph();
  for (const p of filePaths) g.addFile(makeFile(p));
  g.buildIndexes();
  return g;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProvenanceEdge — registerProvenance + getProvenanceForFile', () => {
  it('registers a receipt and retrieves it by file', () => {
    const g = buildGraph(['/src/physics/Solver.ts']);
    g.registerProvenance(makeReceipt('/src/physics/Solver.ts', 'abc123'));
    const edges = g.getProvenanceForFile('/src/physics/Solver.ts');
    expect(edges).toHaveLength(1);
    expect(edges[0].contractHash).toBe('abc123');
  });

  it('returns [] for file with no receipts', () => {
    const g = buildGraph(['/src/physics/Solver.ts']);
    expect(g.getProvenanceForFile('/src/physics/Solver.ts')).toHaveLength(0);
  });

  it('accumulates multiple receipts for the same file', () => {
    const g = buildGraph(['/src/physics/Solver.ts']);
    g.registerProvenance(makeReceipt('/src/physics/Solver.ts', 'hash1'));
    g.registerProvenance(makeReceipt('/src/physics/Solver.ts', 'hash2'));
    g.registerProvenance(makeReceipt('/src/physics/Solver.ts', 'hash3'));
    expect(g.getProvenanceForFile('/src/physics/Solver.ts')).toHaveLength(3);
  });

  it('stores all receipt fields', () => {
    const g = buildGraph(['/src/a.ts']);
    const edge: ProvenanceEdge = {
      filePath: '/src/a.ts',
      symbolName: 'myFn',
      contractHash: 'sha256abc',
      simTimestampMs: 1_700_000_000_000,
      onchainTx: '0xdeadbeef',
      solver: 'thermal',
      domain: 'physics',
    };
    g.registerProvenance(edge);
    const stored = g.getProvenanceForFile('/src/a.ts')[0];
    expect(stored.symbolName).toBe('myFn');
    expect(stored.onchainTx).toBe('0xdeadbeef');
    expect(stored.solver).toBe('thermal');
    expect(stored.domain).toBe('physics');
  });
});

describe('ProvenanceEdge — getAllProvenanceEdges', () => {
  it('returns all receipts across all files', () => {
    const g = buildGraph(['/a.ts', '/b.ts']);
    g.registerProvenance(makeReceipt('/a.ts', 'h1'));
    g.registerProvenance(makeReceipt('/b.ts', 'h2'));
    g.registerProvenance(makeReceipt('/b.ts', 'h3'));
    expect(g.getAllProvenanceEdges()).toHaveLength(3);
  });

  it('returns [] when no receipts registered', () => {
    const g = buildGraph(['/a.ts']);
    expect(g.getAllProvenanceEdges()).toHaveLength(0);
  });
});

describe('ProvenanceEdge — getValidatedFilePaths', () => {
  it('lists only files that have at least one receipt', () => {
    const g = buildGraph(['/a.ts', '/b.ts', '/c.ts']);
    g.registerProvenance(makeReceipt('/a.ts', 'h1'));
    g.registerProvenance(makeReceipt('/c.ts', 'h2'));
    const validated = g.getValidatedFilePaths();
    expect(validated).toContain('/a.ts');
    expect(validated).toContain('/c.ts');
    expect(validated).not.toContain('/b.ts');
  });

  it('returns [] when no receipts exist', () => {
    const g = buildGraph(['/a.ts']);
    expect(g.getValidatedFilePaths()).toHaveLength(0);
  });
});

describe('ProvenanceEdge — isValidated', () => {
  it('returns true for file with a receipt', () => {
    const g = buildGraph(['/a.ts']);
    g.registerProvenance(makeReceipt('/a.ts', 'h1'));
    expect(g.isValidated('/a.ts')).toBe(true);
  });

  it('returns false for file with no receipt', () => {
    const g = buildGraph(['/a.ts']);
    expect(g.isValidated('/a.ts')).toBe(false);
  });
});

describe('ProvenanceEdge — sliceDiversity', () => {
  it('returns 0 for file with no receipts', () => {
    const g = buildGraph(['/a.ts']);
    expect(g.sliceDiversity('/a.ts')).toBe(0);
  });

  it('returns 1 for one unique contractHash', () => {
    const g = buildGraph(['/a.ts']);
    g.registerProvenance(makeReceipt('/a.ts', 'same_hash'));
    g.registerProvenance(makeReceipt('/a.ts', 'same_hash')); // duplicate
    expect(g.sliceDiversity('/a.ts')).toBe(1);
  });

  it('counts distinct contractHashes (Paper 32 §5 slice diversity)', () => {
    const g = buildGraph(['/a.ts']);
    g.registerProvenance(makeReceipt('/a.ts', 'thermal_run_1'));
    g.registerProvenance(makeReceipt('/a.ts', 'structural_run_1'));
    g.registerProvenance(makeReceipt('/a.ts', 'acoustic_run_1'));
    g.registerProvenance(makeReceipt('/a.ts', 'thermal_run_1')); // duplicate
    expect(g.sliceDiversity('/a.ts')).toBe(3);
  });

  it('different files have independent diversity counts', () => {
    const g = buildGraph(['/a.ts', '/b.ts']);
    g.registerProvenance(makeReceipt('/a.ts', 'h1'));
    g.registerProvenance(makeReceipt('/a.ts', 'h2'));
    g.registerProvenance(makeReceipt('/b.ts', 'h3'));
    expect(g.sliceDiversity('/a.ts')).toBe(2);
    expect(g.sliceDiversity('/b.ts')).toBe(1);
  });
});

describe('ProvenanceEdge — clear() resets provenance state', () => {
  it('provenance is gone after a buildFromScanResult (which calls clear())', () => {
    const g = buildGraph(['/a.ts']);
    g.registerProvenance(makeReceipt('/a.ts', 'h1'));
    expect(g.isValidated('/a.ts')).toBe(true);

    // Simulated rebuild (calls clear() internally)
    const result = {
      rootDir: '/',
      rootDirs: ['/'],
      files: [makeFile('/b.ts')],
      stats: { totalFiles: 1, filesByLanguage: {}, totalSymbols: 0, symbolsByType: {}, totalImports: 0, totalCalls: 0, totalLoc: 10, durationMs: 1, errors: [] },
    };
    g.buildFromScanResult(result);

    // Provenance from before clear() must be gone
    expect(g.isValidated('/a.ts')).toBe(false);
    expect(g.getAllProvenanceEdges()).toHaveLength(0);
    expect(g.getValidatedFilePaths()).toHaveLength(0);
  });

  it('does not inherit receipts registered before clear()', () => {
    const g = buildGraph(['/a.ts']);
    g.registerProvenance(makeReceipt('/a.ts', 'h_old'));

    const result = {
      rootDir: '/',
      rootDirs: ['/'],
      files: [makeFile('/a.ts')],
      stats: { totalFiles: 1, filesByLanguage: {}, totalSymbols: 0, symbolsByType: {}, totalImports: 0, totalCalls: 0, totalLoc: 10, durationMs: 1, errors: [] },
    };
    g.buildFromScanResult(result);

    expect(g.sliceDiversity('/a.ts')).toBe(0);
  });
});
