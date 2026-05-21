/**
 * BrainCoordNodeMapper — unit tests (HoloGraph Phase 2)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BrainCoordNodeMapper } from '../BrainCoordNodeMapper';
import { CodebaseGraph } from '../CodebaseGraph';
import type { ScannedFile, ExternalSymbolDefinition } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSym(name: string, filePath: string): ExternalSymbolDefinition {
  return {
    name,
    type: 'function',
    language: 'typescript',
    visibility: 'public',
    filePath,
    line: 1,
    isExported: true,
  };
}

function makeFile(filePath: string, symName = 'fn'): ScannedFile {
  return {
    path: filePath,
    language: 'typescript',
    symbols: [makeSym(symName, filePath)],
    imports: [],
    calls: [],
    loc: 20,
    sizeBytes: 500,
  };
}

function buildGraph(files: ScannedFile[]): CodebaseGraph {
  const g = new CodebaseGraph();
  for (const f of files) g.addFile(f);
  g.buildIndexes();
  return g;
}

// ─── detectDomain heuristics ─────────────────────────────────────────────────

describe('BrainCoordNodeMapper.detectDomain', () => {
  let mapper: BrainCoordNodeMapper;

  beforeEach(() => {
    mapper = new BrainCoordNodeMapper();
  });

  it('detects physics for /solver/ path', () => {
    expect(mapper.detectDomain('/packages/snn/src/solver/SpikeSolver.ts')).toBe('physics');
  });

  it('detects compiler for /compilers/ path', () => {
    expect(mapper.detectDomain('/packages/core/src/compilers/VRCompiler.ts')).toBe('compiler');
  });

  it('detects language for /nlp/ path', () => {
    expect(mapper.detectDomain('/packages/core/src/nlp/Tokenizer.ts')).toBe('language');
  });

  it('detects rendering for /render/ path', () => {
    expect(mapper.detectDomain('/packages/r3f-renderer/src/render/Scene.ts')).toBe('rendering');
  });

  it('detects agent for /mcp/ path', () => {
    expect(mapper.detectDomain('/packages/mcp-server/src/mcp/Dispatcher.ts')).toBe('agent');
  });

  it('detects storage for /absorb/ path', () => {
    expect(mapper.detectDomain('/packages/absorb-service/src/absorb/Scanner.ts')).toBe('storage');
  });

  it('detects truth_approval for /integrity/ path (no /trait/ prefix)', () => {
    // /traits/ triggers 'agent' first; a plain /integrity/ path goes to truth_approval
    expect(mapper.detectDomain('/packages/core/src/integrity/LatentLayer.ts')).toBe('truth_approval');
  });

  it('detects coordination for /pillar/ path (no /trait/ prefix)', () => {
    // /traits/ triggers 'agent'; a plain /pillar/ path goes to coordination
    expect(mapper.detectDomain('/packages/core/src/pillar/SliceDispatcher.ts')).toBe('coordination');
  });

  it('detects init for /config/ path', () => {
    expect(mapper.detectDomain('/packages/core/src/config/AppConfig.ts')).toBe('init');
  });

  it('detects shutdown for /shutdown/ path', () => {
    expect(mapper.detectDomain('/packages/core/src/shutdown/Teardown.ts')).toBe('shutdown');
  });

  it('returns coordination as default for unrecognized path', () => {
    expect(mapper.detectDomain('/packages/misc/src/Unknown.ts')).toBe('coordination');
  });

  it('packages/core defaults to compiler', () => {
    expect(mapper.detectDomain('/packages/core/src/SomeModule.ts')).toBe('compiler');
  });

  it('packages/snn defaults to physics', () => {
    expect(mapper.detectDomain('/packages/snn/src/SomeModule.ts')).toBe('physics');
  });

  it('packages/studio defaults to rendering', () => {
    expect(mapper.detectDomain('/packages/studio/src/SomeModule.ts')).toBe('rendering');
  });
});

// ─── domainCentroid ─────────────────────────────────────────────────────────

describe('BrainCoordNodeMapper.domainCentroid', () => {
  let mapper: BrainCoordNodeMapper;

  beforeEach(() => {
    mapper = new BrainCoordNodeMapper();
  });

  it('returns correct MNI for physics (SPL)', () => {
    const [x, y, z] = mapper.domainCentroid('physics');
    expect(x).toBe(30);
    expect(y).toBe(-50);
    expect(z).toBe(60);
  });

  it('returns correct MNI for language (Wernicke)', () => {
    const [x, y, z] = mapper.domainCentroid('language');
    expect(x).toBe(-52);
    expect(y).toBe(-32);
    expect(z).toBe(8);
  });

  it('returns numbers for unknown domain', () => {
    const [x, y, z] = mapper.domainCentroid('completely_unknown_xyz');
    expect(typeof x).toBe('number');
    expect(typeof y).toBe('number');
    expect(typeof z).toBe('number');
  });
});

// ─── populate() ──────────────────────────────────────────────────────────────

describe('BrainCoordNodeMapper.populate', () => {
  let mapper: BrainCoordNodeMapper;

  beforeEach(() => {
    mapper = new BrainCoordNodeMapper();
  });

  it('fills nodePositions for all symbols', () => {
    const graph = buildGraph([
      makeFile('/packages/core/src/compilers/VRCompiler.ts', 'compile'),
      makeFile('/packages/snn/src/solver/SpikeSolver.ts', 'solve'),
    ]);
    mapper.populate(graph);
    expect(graph.nodePositions.size).toBe(2);
  });

  it('returns correct totalNodes count', () => {
    const graph = buildGraph([
      makeFile('/packages/core/src/compilers/VRCompiler.ts'),
      makeFile('/packages/core/src/compilers/UnityCompiler.ts'),
      makeFile('/packages/snn/src/solver/SpikeSolver.ts'),
    ]);
    const result = mapper.populate(graph);
    expect(result.totalNodes).toBe(3);
  });

  it('physics files get gyrus/hot classification', () => {
    const graph = buildGraph([
      makeFile('/packages/snn/src/solver/SpikeSolver.ts', 'solve'),
    ]);
    const result = mapper.populate(graph);
    expect(result.hotNodes).toBe(1);
    expect(result.coldNodes).toBe(0);
  });

  it('coordination files get sulcus/cold classification', () => {
    // Use a plain /pillar/ path — /traits/ would match 'agent' (hot) first
    const graph = buildGraph([
      makeFile('/packages/core/src/pillar/SliceDispatcher.ts', 'dispatch'),
    ]);
    const result = mapper.populate(graph);
    expect(result.coldNodes).toBe(1);
    expect(result.hotNodes).toBe(0);
  });

  it('compiler files get hot classification', () => {
    const graph = buildGraph([
      makeFile('/packages/core/src/compilers/VRCompiler.ts', 'compile'),
    ]);
    const result = mapper.populate(graph);
    expect(result.hotNodes).toBe(1);
  });

  it('coverage is 1.0 when no unknown domains', () => {
    const graph = buildGraph([
      makeFile('/packages/snn/src/solver/SpikeSolver.ts'),
      makeFile('/packages/core/src/compilers/VRCompiler.ts'),
    ]);
    const result = mapper.populate(graph);
    // All domains should map to either gyrus or sulcus (no 'unknown' surface_type)
    expect(result.coverage).toBe(1);
  });

  it('nodePositions contain valid MNI triples', () => {
    const graph = buildGraph([
      makeFile('/packages/snn/src/solver/SpikeSolver.ts', 'solve'),
    ]);
    mapper.populate(graph);
    for (const [, pos] of graph.nodePositions) {
      expect(pos).toHaveLength(3);
      expect(typeof pos[0]).toBe('number');
      expect(typeof pos[1]).toBe('number');
      expect(typeof pos[2]).toBe('number');
    }
  });

  it('physics symbols cluster at physics centroid', () => {
    const graph = buildGraph([
      makeFile('/packages/snn/src/solver/SpikeSolver.ts', 'solve'),
    ]);
    mapper.populate(graph);
    const [pos] = Array.from(graph.nodePositions.values());
    const [cx, cy, cz] = mapper.domainCentroid('physics');
    expect(pos[0]).toBe(cx);
    expect(pos[1]).toBe(cy);
    expect(pos[2]).toBe(cz);
  });

  it('domainCounts tracks distribution', () => {
    const graph = buildGraph([
      makeFile('/packages/snn/src/solver/SpikeSolver.ts'),
      makeFile('/packages/snn/src/solver/HeatSolver.ts'),
      makeFile('/packages/core/src/compilers/VRCompiler.ts'),
    ]);
    const result = mapper.populate(graph);
    expect(result.domainCounts['physics']).toBe(2);
    expect(result.domainCounts['compiler']).toBe(1);
  });

  it('populate() clears previous state on second call', () => {
    const graph1 = buildGraph([makeFile('/packages/snn/src/solver/S.ts')]);
    mapper.populate(graph1);

    const graph2 = buildGraph([makeFile('/packages/core/src/compilers/C.ts')]);
    const result = mapper.populate(graph2);
    expect(result.totalNodes).toBe(1);
    // Stale keys from graph1 must NOT appear
    expect(mapper.getMeta('function:S:/packages/snn/src/solver/S.ts:1')).toBeUndefined();
  });

  it('getTier returns hot for gyral symbol', () => {
    const graph = buildGraph([makeFile('/packages/snn/src/solver/SpikeSolver.ts', 'solve')]);
    mapper.populate(graph);
    const key = Array.from(graph.nodePositions.keys())[0];
    expect(mapper.getTier(key)).toBe('hot');
  });

  it('getTier returns cold for sulcal symbol', () => {
    const graph = buildGraph([makeFile('/packages/core/src/pillar/SliceDispatcher.ts', 'dispatch')]);
    mapper.populate(graph);
    const key = Array.from(graph.nodePositions.keys())[0];
    expect(mapper.getTier(key)).toBe('cold');
  });

  it('hotKeys() and coldKeys() partition all symbols', () => {
    const graph = buildGraph([
      makeFile('/packages/snn/src/solver/SpikeSolver.ts', 'solve'),
      makeFile('/packages/core/src/traits/pillar/SliceEmitter.ts', 'emit'),
    ]);
    mapper.populate(graph);
    const hot = mapper.hotKeys();
    const cold = mapper.coldKeys();
    const all = [...hot, ...cold].sort();
    const expected = Array.from(graph.nodePositions.keys()).sort();
    expect(all).toEqual(expected);
  });

  it('getMeta returns full coordinate metadata', () => {
    const graph = buildGraph([makeFile('/packages/snn/src/solver/SpikeSolver.ts', 'solve')]);
    mapper.populate(graph);
    const key = Array.from(graph.nodePositions.keys())[0];
    const meta = mapper.getMeta(key);
    expect(meta).toBeDefined();
    expect(meta!.domain).toBe('physics');
    expect(meta!.tier).toBe('hot');
    expect(meta!.surface_type).toBe('gyrus');
  });
});
