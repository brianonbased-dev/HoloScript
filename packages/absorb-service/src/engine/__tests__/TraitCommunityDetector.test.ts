/**
 * TraitCommunityDetector — unit tests (HoloGraph Phase 1)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TraitCommunityDetector } from '../TraitCommunityDetector';
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

function makeFile(
  filePath: string,
  opts: {
    emitSites?: Array<{ eventName: string }>;
    listenSites?: Array<{ eventName: string }>;
  } = {},
): ScannedFile {
  return {
    path: filePath,
    language: 'typescript',
    symbols: [makeSym('fn', filePath)],
    imports: [],
    calls: [],
    emitSites: (opts.emitSites ?? []).map(e => ({
      callerId: 'fn',
      eventName: e.eventName,
      filePath,
      line: 10,
      column: 0,
    })),
    listenSites: (opts.listenSites ?? []).map(e => ({
      callerId: 'fn',
      eventName: e.eventName,
      filePath,
      line: 20,
      column: 0,
    })),
    loc: 50,
    sizeBytes: 1000,
  };
}

function buildGraph(files: ScannedFile[]): CodebaseGraph {
  const g = new CodebaseGraph();
  for (const f of files) g.addFile(f);
  g.buildIndexes();
  return g;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TraitCommunityDetector', () => {
  let detector: TraitCommunityDetector;

  beforeEach(() => {
    detector = new TraitCommunityDetector({ louvainFallback: false });
  });

  it('detects trait:pillar community from traits/pillar/ path', () => {
    const graph = buildGraph([
      makeFile('packages/core/src/traits/pillar/SliceEmitter.ts'),
      makeFile('packages/core/src/traits/pillar/GyriSulciPartitioner.ts'),
    ]);
    const comms = detector.detect(graph);
    expect(comms.has('trait:pillar')).toBe(true);
    expect(comms.get('trait:pillar')!.length).toBe(2);
  });

  it('detects trait:brain-geo from traits/brainGeo/ (camelCase → kebab)', () => {
    const graph = buildGraph([
      makeFile('packages/core/src/traits/brainGeo/BrainCoordMapper.ts'),
    ]);
    const comms = detector.detect(graph);
    expect(comms.has('trait:brain-geo')).toBe(true);
  });

  it('detects trait:integrity from traits/integrity/', () => {
    const graph = buildGraph([
      makeFile('packages/core/src/traits/integrity/LatentIntegrityLayer.ts'),
    ]);
    const comms = detector.detect(graph);
    expect(comms.has('trait:integrity')).toBe(true);
  });

  it('detects compiler:vr community from VRCompiler.ts', () => {
    const graph = buildGraph([
      makeFile('packages/core/src/compilers/VRCompiler.ts'),
    ]);
    const comms = detector.detect(graph);
    expect(comms.has('compiler:vr')).toBe(true);
  });

  it('detects compiler:unity from UnityCompiler.ts', () => {
    const graph = buildGraph([
      makeFile('packages/core/src/compilers/UnityCompiler.ts'),
    ]);
    const comms = detector.detect(graph);
    expect(comms.has('compiler:unity')).toBe(true);
  });

  it('detects plugin:robotics from packages/plugins/robotics/', () => {
    const graph = buildGraph([
      makeFile('packages/plugins/robotics/src/RoboticsPlugin.ts'),
    ]);
    const comms = detector.detect(graph);
    expect(comms.has('plugin:robotics')).toBe(true);
  });

  it('detects plugin:alphafold from packages/plugins/alphafold/', () => {
    const graph = buildGraph([
      makeFile('packages/plugins/alphafold/src/AlphaFoldPlugin.ts'),
    ]);
    const comms = detector.detect(graph);
    expect(comms.has('plugin:alphafold')).toBe(true);
  });

  it('detects events:snn community from event namespace', () => {
    const graph = buildGraph([
      makeFile('packages/snn-webgpu/src/Spike.ts', {
        emitSites: [{ eventName: 'snn:spike' }, { eventName: 'snn:burst' }],
      }),
    ]);
    const comms = detector.detect(graph);
    expect(comms.has('events:snn')).toBe(true);
  });

  it('detects events:pillar from listen-side event namespace', () => {
    const graph = buildGraph([
      makeFile('packages/core/src/misc/Handler.ts', {
        listenSites: [{ eventName: 'pillar:slice' }],
      }),
    ]);
    const comms = detector.detect(graph);
    expect(comms.has('events:pillar')).toBe(true);
  });

  it('trait:pillar takes priority over events for trait files', () => {
    // File is in traits/pillar/ AND emits events — trait wins (Pass 1 first)
    const graph = buildGraph([
      makeFile('packages/core/src/traits/pillar/SliceEmitter.ts', {
        emitSites: [{ eventName: 'snn:spike' }],
      }),
    ]);
    const comms = detector.detect(graph);
    expect(comms.has('trait:pillar')).toBe(true);
    expect(comms.has('events:snn')).toBe(false);
  });

  it('each file appears in exactly one community', () => {
    const graph = buildGraph([
      makeFile('packages/core/src/traits/pillar/A.ts'),
      makeFile('packages/core/src/compilers/VRCompiler.ts'),
      makeFile('packages/plugins/robotics/src/R.ts'),
    ]);
    const comms = detector.detect(graph);
    const allAssigned = Array.from(comms.values()).flat();
    const unique = new Set(allAssigned);
    expect(unique.size).toBe(allAssigned.length); // no duplicates
  });

  it('multiple trait namespaces create separate communities', () => {
    const graph = buildGraph([
      makeFile('packages/core/src/traits/pillar/A.ts'),
      makeFile('packages/core/src/traits/integrity/B.ts'),
      makeFile('packages/core/src/traits/snn/C.ts'),
    ]);
    const comms = detector.detect(graph);
    expect(comms.has('trait:pillar')).toBe(true);
    expect(comms.has('trait:integrity')).toBe(true);
    expect(comms.has('trait:snn')).toBe(true);
  });
});
