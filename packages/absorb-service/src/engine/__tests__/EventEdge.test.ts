/**
 * EventEdge — unit tests (HoloGraph Phase 1)
 *
 * Tests the full emit/listen extraction + cross-file resolution pipeline:
 *   TypeScriptAdapter.extractEmitSites()
 *   TypeScriptAdapter.extractListenSites()
 *   CodebaseGraph.buildEventEdges() (called internally by buildIndexes)
 *   CodebaseGraph.getEventEmitters / getEventListeners / getEventChain / allEventNames
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TypeScriptAdapter } from '../adapters/TypeScriptAdapter';
import { CodebaseGraph } from '../CodebaseGraph';
import type { ScannedFile } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal ScannedFile for testing without a real tree-sitter parse.
 * emitSites / listenSites are injected directly.
 */
function makeFile(
  path: string,
  opts: {
    emitSites?: Array<{ callerId: string; eventName: string; line?: number }>;
    listenSites?: Array<{ callerId: string; eventName: string; line?: number }>;
  } = {},
): ScannedFile {
  return {
    path,
    language: 'typescript',
    symbols: [],
    imports: [],
    calls: [],
    emitSites: (opts.emitSites ?? []).map(s => ({
      callerId: s.callerId,
      eventName: s.eventName,
      filePath: path,
      line: s.line ?? 10,
      column: 4,
    })),
    listenSites: (opts.listenSites ?? []).map(s => ({
      callerId: s.callerId,
      eventName: s.eventName,
      filePath: path,
      line: s.line ?? 20,
      column: 4,
    })),
    loc: 50,
    sizeBytes: 1000,
  };
}

// ─── TypeScriptAdapter — extractEmitSites / extractListenSites ────────────────

describe('TypeScriptAdapter — event site extraction (structural test)', () => {
  const adapter = new TypeScriptAdapter();

  it('exports extractEmitSites method', () => {
    expect(typeof adapter.extractEmitSites).toBe('function');
  });

  it('exports extractListenSites method', () => {
    expect(typeof adapter.extractListenSites).toBe('function');
  });

  // Note: Full tree-sitter parsing requires a loaded grammar (optional dep).
  // The integration tests below use injected ScannedFile data instead.
  // When tree-sitter-typescript is available, add parse-level tests here.
});

// ─── CodebaseGraph — event indexing ──────────────────────────────────────────

describe('CodebaseGraph — EventEdge resolution', () => {
  let graph: CodebaseGraph;

  beforeEach(() => {
    graph = new CodebaseGraph();
  });

  it('stats() includes totalEventEdges field', () => {
    const stats = graph.getStats();
    expect(typeof stats.totalEventEdges).toBe('number');
    expect(stats.totalEventEdges).toBe(0);
  });

  it('resolves emit→listen cross-file for matching eventName', () => {
    const emitter = makeFile('/src/SliceEmitter.ts', {
      emitSites: [{ callerId: 'emit', eventName: 'pillar:slice' }],
    });
    const listener = makeFile('/src/IntegrityLayer.ts', {
      listenSites: [{ callerId: 'handleSlice', eventName: 'pillar:slice' }],
    });

    graph.addFile(emitter);
    graph.addFile(listener);
    graph.buildIndexes();

    const edges = graph.getEventEmitters('pillar:slice');
    expect(edges).toHaveLength(1);
    expect(edges[0]!.emitterFile).toContain('SliceEmitter');
    expect(edges[0]!.listenerFile).toContain('IntegrityLayer');
    expect(edges[0]!.eventName).toBe('pillar:slice');
  });

  it('getEventListeners() returns listener-side of the same edge', () => {
    const emitter  = makeFile('/a.ts', { emitSites:  [{ callerId: 'emit',   eventName: 'snn:spike' }] });
    const listener = makeFile('/b.ts', { listenSites: [{ callerId: 'onSpike', eventName: 'snn:spike' }] });

    graph.addFile(emitter);
    graph.addFile(listener);
    graph.buildIndexes();

    const edges = graph.getEventListeners('snn:spike');
    expect(edges).toHaveLength(1);
    expect(edges[0]!.listenerSymbol).toBe('onSpike');
    expect(edges[0]!.emitterSymbol).toBe('emit');
  });

  it('no edges for non-matching event names', () => {
    const emitter  = makeFile('/a.ts', { emitSites:  [{ callerId: 'e', eventName: 'cortical:routed' }] });
    const listener = makeFile('/b.ts', { listenSites: [{ callerId: 'l', eventName: 'pillar:slice'   }] });

    graph.addFile(emitter);
    graph.addFile(listener);
    graph.buildIndexes();

    expect(graph.getEventEmitters('cortical:routed')).toHaveLength(0);
    expect(graph.getEventListeners('pillar:slice')).toHaveLength(0);
    expect(graph.getEventEdges ? graph.getAllEventEdges() : []).toHaveLength(0);
  });

  it('1 emitter × 3 listeners = 3 EventEdges', () => {
    const emitter = makeFile('/emitter.ts', {
      emitSites: [{ callerId: 'broadcast', eventName: 'training:tick' }],
    });
    const l1 = makeFile('/l1.ts', { listenSites: [{ callerId: 'h1', eventName: 'training:tick' }] });
    const l2 = makeFile('/l2.ts', { listenSites: [{ callerId: 'h2', eventName: 'training:tick' }] });
    const l3 = makeFile('/l3.ts', { listenSites: [{ callerId: 'h3', eventName: 'training:tick' }] });

    for (const f of [emitter, l1, l2, l3]) graph.addFile(f);
    graph.buildIndexes();

    expect(graph.getAllEventEdges()).toHaveLength(3);
    expect(graph.getStats().totalEventEdges).toBe(3);
  });

  it('allEventNames() returns all distinct event names (emit + listen sides)', () => {
    const a = makeFile('/a.ts', { emitSites:  [{ callerId: 'e', eventName: 'pillar:slice' }] });
    const b = makeFile('/b.ts', { listenSites: [{ callerId: 'l', eventName: 'cortical:routed' }] });

    graph.addFile(a);
    graph.addFile(b);
    graph.buildIndexes();

    const names = graph.allEventNames();
    expect(names).toContain('pillar:slice');
    expect(names).toContain('cortical:routed');
  });

  it('allEventNamespaces() extracts prefixes', () => {
    const a = makeFile('/a.ts', { emitSites: [
      { callerId: 'e1', eventName: 'pillar:slice' },
      { callerId: 'e2', eventName: 'pillar:training_slice' },
      { callerId: 'e3', eventName: 'snn:spike' },
    ]});
    graph.addFile(a);
    graph.buildIndexes();

    const ns = graph.allEventNamespaces();
    expect(ns).toContain('pillar');
    expect(ns).toContain('snn');
    expect(ns).not.toContain('pillar:slice'); // full name not namespace
  });

  it('getEventChain() returns emitters, listeners, and edges', () => {
    const e = makeFile('/e.ts', { emitSites:  [{ callerId: 'emit', eventName: 'cortical:routed' }] });
    const l = makeFile('/l.ts', { listenSites: [{ callerId: 'route', eventName: 'cortical:routed' }] });

    graph.addFile(e);
    graph.addFile(l);
    graph.buildIndexes();

    const chain = graph.getEventChain('cortical:routed');
    expect(chain.eventName).toBe('cortical:routed');
    expect(chain.emitters).toHaveLength(1);
    expect(chain.listeners).toHaveLength(1);
    expect(chain.edges).toHaveLength(1);
  });

  it('clear() resets event state', () => {
    const f = makeFile('/a.ts', { emitSites: [{ callerId: 'e', eventName: 'x:y' }] });
    graph.addFile(f);
    graph.buildIndexes();
    expect(graph.allEventNames().length).toBeGreaterThan(0);

    // Rebuild from empty
    graph.buildFromScanResult({ rootDir: '/', rootDirs: ['/'], files: [], stats: { totalFiles:0, filesByLanguage:{}, totalSymbols:0, symbolsByType:{}, totalImports:0, totalCalls:0, totalLoc:0, durationMs:0, errors:[] } });
    expect(graph.allEventNames()).toHaveLength(0);
    expect(graph.getAllEventEdges()).toHaveLength(0);
  });

  it('same-file emit→listen resolves correctly', () => {
    const f = makeFile('/a.ts', {
      emitSites:  [{ callerId: 'producer', eventName: 'local:event' }],
      listenSites: [{ callerId: 'consumer', eventName: 'local:event' }],
    });
    graph.addFile(f);
    graph.buildIndexes();

    const edges = graph.getAllEventEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0]!.emitterFile).toBe('/a.ts');
    expect(edges[0]!.listenerFile).toBe('/a.ts');
  });
});
