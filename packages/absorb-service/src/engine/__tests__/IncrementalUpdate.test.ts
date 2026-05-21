/**
 * CodebaseGraph incremental update — unit tests (HoloGraph Phase 2)
 *
 * Covers: removeFile(), updateFile(), patchFromChanges()
 */

import { describe, it, expect } from 'vitest';
import { CodebaseGraph } from '../CodebaseGraph';
import type { ScannedFile, ExternalSymbolDefinition } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSym(name: string, filePath: string, line = 1): ExternalSymbolDefinition {
  return {
    name,
    type: 'function',
    language: 'typescript',
    visibility: 'public',
    filePath,
    line,
    isExported: true,
  };
}

function makeFile(
  filePath: string,
  syms: string[] = ['fn'],
  opts: {
    emitSites?: Array<{ eventName: string; callerId?: string }>;
    listenSites?: Array<{ eventName: string; callerId?: string }>;
  } = {},
): ScannedFile {
  return {
    path: filePath,
    language: 'typescript',
    symbols: syms.map((n, i) => makeSym(n, filePath, i + 1)),
    imports: [],
    calls: [],
    emitSites: (opts.emitSites ?? []).map(e => ({
      callerId: e.callerId ?? syms[0] ?? 'fn',
      eventName: e.eventName,
      filePath,
      line: 10,
      column: 0,
    })),
    listenSites: (opts.listenSites ?? []).map(e => ({
      callerId: e.callerId ?? syms[0] ?? 'fn',
      eventName: e.eventName,
      filePath,
      line: 20,
      column: 0,
    })),
    loc: 30,
    sizeBytes: 600,
  };
}

function buildGraph(files: ScannedFile[]): CodebaseGraph {
  const g = new CodebaseGraph();
  for (const f of files) g.addFile(f);
  g.buildIndexes();
  return g;
}

// ─── removeFile() ────────────────────────────────────────────────────────────

describe('CodebaseGraph.removeFile', () => {
  it('returns false for unknown file', () => {
    const g = buildGraph([makeFile('/a.ts')]);
    expect(g.removeFile('/nonexistent.ts')).toBe(false);
  });

  it('returns true for known file and removes it', () => {
    const g = buildGraph([makeFile('/a.ts')]);
    expect(g.removeFile('/a.ts')).toBe(true);
    expect(g.getFilePaths()).not.toContain('/a.ts');
  });

  it('removes symbols belonging to the file', () => {
    const g = buildGraph([makeFile('/a.ts', ['foo', 'bar'])]);
    g.removeFile('/a.ts');
    g.buildIndexes();
    expect(g.findSymbolsByName('foo')).toHaveLength(0);
    expect(g.findSymbolsByName('bar')).toHaveLength(0);
  });

  it('leaves symbols from other files intact', () => {
    const g = buildGraph([makeFile('/a.ts', ['foo']), makeFile('/b.ts', ['bar'])]);
    g.removeFile('/a.ts');
    g.buildIndexes();
    expect(g.findSymbolsByName('bar')).toHaveLength(1);
    expect(g.findSymbolsByName('foo')).toHaveLength(0);
  });

  it('removes emitSites belonging to the file', () => {
    const g = buildGraph([
      makeFile('/emitter.ts', ['fn'], { emitSites: [{ eventName: 'ev:test' }] }),
    ]);
    expect(g.getAllEmitSites()).toHaveLength(1);
    g.removeFile('/emitter.ts');
    g.buildIndexes();
    expect(g.getAllEmitSites()).toHaveLength(0);
    expect(g.allEventNames()).not.toContain('ev:test');
  });

  it('removes listenSites belonging to the file', () => {
    const g = buildGraph([
      makeFile('/listener.ts', ['fn'], { listenSites: [{ eventName: 'ev:test' }] }),
    ]);
    expect(g.getAllListenSites()).toHaveLength(1);
    g.removeFile('/listener.ts');
    g.buildIndexes();
    expect(g.getAllListenSites()).toHaveLength(0);
  });

  it('EventEdge disappears when emitter file is removed', () => {
    const g = buildGraph([
      makeFile('/e.ts', ['emit'], { emitSites: [{ eventName: 'x:go' }] }),
      makeFile('/l.ts', ['listen'], { listenSites: [{ eventName: 'x:go' }] }),
    ]);
    expect(g.getAllEventEdges()).toHaveLength(1);
    g.removeFile('/e.ts');
    g.buildIndexes();
    expect(g.getAllEventEdges()).toHaveLength(0);
  });

  it('stats reflect removal', () => {
    const g = buildGraph([makeFile('/a.ts', ['f1', 'f2']), makeFile('/b.ts', ['g1'])]);
    const before = g.getStats();
    g.removeFile('/a.ts');
    g.buildIndexes();
    const after = g.getStats();
    expect(after.totalFiles).toBe(before.totalFiles - 1);
    expect(after.totalSymbols).toBe(before.totalSymbols - 2);
  });

  it('can be called before buildIndexes and still works', () => {
    const g = new CodebaseGraph();
    g.addFile(makeFile('/a.ts', ['foo']));
    // No buildIndexes call — symbolsByFile is empty
    expect(g.removeFile('/a.ts')).toBe(true);
    g.buildIndexes();
    expect(g.findSymbolsByName('foo')).toHaveLength(0);
  });
});

// ─── updateFile() ────────────────────────────────────────────────────────────

describe('CodebaseGraph.updateFile', () => {
  it('replaces symbols with new version', () => {
    const g = buildGraph([makeFile('/a.ts', ['oldFn'])]);
    g.updateFile(makeFile('/a.ts', ['newFn']));
    g.buildIndexes();
    expect(g.findSymbolsByName('oldFn')).toHaveLength(0);
    expect(g.findSymbolsByName('newFn')).toHaveLength(1);
  });

  it('file path persists after update', () => {
    const g = buildGraph([makeFile('/a.ts', ['fn'])]);
    g.updateFile(makeFile('/a.ts', ['fn2']));
    g.buildIndexes();
    expect(g.getFilePaths()).toContain('/a.ts');
  });

  it('updates event sites on file update', () => {
    const g = buildGraph([
      makeFile('/e.ts', ['fn'], { emitSites: [{ eventName: 'old:event' }] }),
    ]);
    g.updateFile(makeFile('/e.ts', ['fn'], { emitSites: [{ eventName: 'new:event' }] }));
    g.buildIndexes();
    expect(g.allEventNames()).toContain('new:event');
    expect(g.allEventNames()).not.toContain('old:event');
  });

  it('adding new symbols via update is reflected', () => {
    const g = buildGraph([makeFile('/a.ts', ['fn1'])]);
    g.updateFile(makeFile('/a.ts', ['fn1', 'fn2', 'fn3']));
    g.buildIndexes();
    expect(g.getSymbolsInFile('/a.ts')).toHaveLength(3);
  });
});

// ─── patchFromChanges() ──────────────────────────────────────────────────────

describe('CodebaseGraph.patchFromChanges', () => {
  it('applies added, modified, and removed in one pass', () => {
    const g = buildGraph([
      makeFile('/keep.ts', ['keepFn']),
      makeFile('/modify.ts', ['oldFn']),
      makeFile('/remove.ts', ['removeFn']),
    ]);

    g.patchFromChanges(
      [makeFile('/new.ts', ['newFn'])],       // added
      [makeFile('/modify.ts', ['updatedFn'])], // modified
      ['/remove.ts'],                           // removed
    );

    expect(g.findSymbolsByName('keepFn')).toHaveLength(1);
    expect(g.findSymbolsByName('newFn')).toHaveLength(1);
    expect(g.findSymbolsByName('updatedFn')).toHaveLength(1);
    expect(g.findSymbolsByName('oldFn')).toHaveLength(0);
    expect(g.findSymbolsByName('removeFn')).toHaveLength(0);
  });

  it('calls buildIndexes exactly once (all queries work after)', () => {
    const g = buildGraph([makeFile('/a.ts', ['fn'])]);

    g.patchFromChanges(
      [makeFile('/b.ts', ['bFn'])],
      [],
      ['/a.ts'],
    );

    // If indexes were not rebuilt, these would return empty
    expect(g.findSymbolsByName('bFn')).toHaveLength(1);
    expect(g.getFilePaths()).toContain('/b.ts');
    expect(g.getFilePaths()).not.toContain('/a.ts');
  });

  it('handles empty change sets', () => {
    const g = buildGraph([makeFile('/a.ts')]);
    const before = g.getStats();
    g.patchFromChanges([], [], []);
    const after = g.getStats();
    expect(after.totalFiles).toBe(before.totalFiles);
  });

  it('EventEdges are rebuilt from new event sites', () => {
    const g = buildGraph([
      makeFile('/e.ts', ['emitFn'], { emitSites: [{ eventName: 'ev:old' }] }),
      makeFile('/l.ts', ['listenFn'], { listenSites: [{ eventName: 'ev:old' }] }),
    ]);
    expect(g.getAllEventEdges()).toHaveLength(1);

    g.patchFromChanges(
      [],
      [makeFile('/e.ts', ['emitFn'], { emitSites: [{ eventName: 'ev:new' }] })],
      [],
    );

    // ev:new has no listener → no edges; ev:old still has a listen-side but no emit → no edges
    expect(g.getAllEventEdges()).toHaveLength(0);
    expect(g.allEventNames()).toContain('ev:new');
    // ev:old persists in allEventNames because the listener file still references it
    // but no EventEdges are created (no emitter for ev:old anymore)
    expect(g.getEventEmitters('ev:old')).toHaveLength(0);
  });

  it('stats are consistent after patch', () => {
    const g = buildGraph([
      makeFile('/a.ts', ['f1', 'f2']),
      makeFile('/b.ts', ['f3']),
    ]);
    g.patchFromChanges(
      [makeFile('/c.ts', ['f4', 'f5', 'f6'])],
      [],
      ['/a.ts'],
    );
    const stats = g.getStats();
    expect(stats.totalFiles).toBe(2); // b + c
    expect(stats.totalSymbols).toBe(4); // f3 + f4 + f5 + f6
  });
});
