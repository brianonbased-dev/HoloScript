/**
 * SyntheticGraphFactory — HoloGraph Phase 3 / Paper 26
 *
 * Generates deterministic synthetic CodebaseGraphs for benchmarking.
 * Used by Paper26Benchmark to produce controlled event-chain scenarios
 * with known ground-truth for recall measurement.
 *
 * ## Graph topology
 *
 * Each synthetic graph has:
 *   - `numFiles` source files, evenly distributed across domain packages
 *   - `numEvents` distinct event names (namespaced as `domain:action`)
 *   - Each event has 1 emitter file + `listenersPerEvent` listener files
 *   - Each file has `symsPerFile` symbols (1 exported function per symbol)
 *   - All event name strings are unique and deterministic (seeded by index)
 *
 * ## Usage
 *
 *   const factory = new SyntheticGraphFactory({ numFiles: 500, numEvents: 50 });
 *   const { graph, groundTruth } = factory.build();
 *   // groundTruth.get('snn:spike') → { emitterFile, listenerFiles[] }
 *
 * @version 1.0.0 — Paper 26 evidence layer
 */

import { CodebaseGraph } from '../CodebaseGraph';
import type { ScannedFile, ExternalSymbolDefinition, EmitSite, ListenSite } from '../types';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface SyntheticGraphOptions {
  /** Total number of source files in the graph. Default: 500 */
  numFiles?: number;
  /** Number of distinct event names. Default: 50 */
  numEvents?: number;
  /** Number of listener files per event. Default: 3 */
  listenersPerEvent?: number;
  /** Number of exported symbols per file. Default: 4 */
  symsPerFile?: number;
  /** Seed string for deterministic generation. Default: 'holograph-paper26' */
  seed?: string;
}

// =============================================================================
// GROUND TRUTH
// =============================================================================

/** Known ground truth for a single event — used to compute recall. */
export interface EventGroundTruth {
  eventName: string;
  /** File that emits this event */
  emitterFile: string;
  /** Files that listen to this event */
  listenerFiles: string[];
  /** All files involved (emitter + listeners) */
  allFiles: string[];
}

export interface SyntheticGraphResult {
  graph: CodebaseGraph;
  /** All event names in the graph, in insertion order */
  eventNames: string[];
  /** Ground truth per event name */
  groundTruth: Map<string, EventGroundTruth>;
  /** Total files */
  numFiles: number;
  /** Total symbols */
  numSymbols: number;
}

// =============================================================================
// FACTORY
// =============================================================================

const DOMAINS = [
  'snn', 'pillar', 'cortical', 'thermal', 'acoustic',
  'rendering', 'compiler', 'agent', 'storage', 'integrity',
];

const ACTIONS = [
  'spike', 'burst', 'slice', 'route', 'emit',
  'dispatch', 'process', 'validate', 'store', 'retrieve',
  'transform', 'encode', 'decode', 'sync', 'flush',
];

const PACKAGES = [
  'packages/snn-webgpu/src',
  'packages/core/src/traits/pillar',
  'packages/core/src/compilers',
  'packages/mcp-server/src',
  'packages/absorb-service/src',
  'packages/r3f-renderer/src',
  'packages/studio/src',
  'packages/plugins/robotics/src',
  'packages/core/src/integrity',
  'packages/core/src/lang',
];

export class SyntheticGraphFactory {
  private readonly opts: Required<SyntheticGraphOptions>;
  private counter = 0;

  constructor(opts: SyntheticGraphOptions = {}) {
    this.opts = {
      numFiles:         opts.numFiles         ?? 500,
      numEvents:        opts.numEvents         ?? 50,
      listenersPerEvent: opts.listenersPerEvent ?? 3,
      symsPerFile:      opts.symsPerFile       ?? 4,
      seed:             opts.seed              ?? 'holograph-paper26',
    };
  }

  /**
   * Build a synthetic CodebaseGraph with known event-chain ground truth.
   */
  build(): SyntheticGraphResult {
    this.counter = 0;
    const { numFiles, numEvents, listenersPerEvent, symsPerFile } = this.opts;

    // Generate file paths
    const filePaths: string[] = [];
    for (let i = 0; i < numFiles; i++) {
      const pkg = PACKAGES[i % PACKAGES.length];
      filePaths.push(`${pkg}/Module_${i.toString().padStart(4, '0')}.ts`);
    }

    // Generate event names (numEvents distinct names)
    const eventNames: string[] = [];
    for (let i = 0; i < numEvents; i++) {
      const domain = DOMAINS[i % DOMAINS.length];
      const action = ACTIONS[Math.floor(i / DOMAINS.length) % ACTIONS.length];
      const suffix = Math.floor(i / (DOMAINS.length * ACTIONS.length));
      eventNames.push(suffix > 0 ? `${domain}:${action}_${suffix}` : `${domain}:${action}`);
    }

    // Assign emitter + listeners for each event
    const groundTruth = new Map<string, EventGroundTruth>();
    // Track which files have event sites (for ScannedFile construction)
    const emitSitesByFile = new Map<string, EmitSite[]>();
    const listenSitesByFile = new Map<string, ListenSite[]>();

    let fileIndex = 0;
    for (let e = 0; e < numEvents; e++) {
      const eventName = eventNames[e];
      const emitterFile = filePaths[fileIndex % numFiles];
      fileIndex++;

      const listenerFiles: string[] = [];
      for (let l = 0; l < listenersPerEvent; l++) {
        listenerFiles.push(filePaths[fileIndex % numFiles]);
        fileIndex++;
      }

      groundTruth.set(eventName, {
        eventName,
        emitterFile,
        listenerFiles,
        allFiles: [emitterFile, ...listenerFiles],
      });

      // Register emit site
      if (!emitSitesByFile.has(emitterFile)) emitSitesByFile.set(emitterFile, []);
      emitSitesByFile.get(emitterFile)!.push({
        callerId: `fn0:${emitterFile}`,
        eventName,
        filePath: emitterFile,
        line: 10,
        column: 0,
      });

      // Register listen sites
      for (const lf of listenerFiles) {
        if (!listenSitesByFile.has(lf)) listenSitesByFile.set(lf, []);
        listenSitesByFile.get(lf)!.push({
          callerId: `fn0:${lf}`,
          eventName,
          filePath: lf,
          line: 20,
          column: 0,
        });
      }
    }

    // Build ScannedFile objects
    const files: ScannedFile[] = filePaths.map((fp, i) => {
      const symbols: ExternalSymbolDefinition[] = [];
      for (let s = 0; s < symsPerFile; s++) {
        symbols.push({
          name: `fn${s}`,
          type: s === 0 ? 'function' : 'method',
          language: 'typescript',
          visibility: 'public',
          filePath: fp,
          line: s * 10 + 1,
          isExported: s === 0,
          signature: `function fn${s}(x: number): void`,
        });
      }
      return {
        path: fp,
        language: 'typescript',
        symbols,
        imports: [],
        calls: [],
        emitSites: emitSitesByFile.get(fp),
        listenSites: listenSitesByFile.get(fp),
        loc: symsPerFile * 15,
        sizeBytes: symsPerFile * 200,
      };
    });

    // Build graph
    const graph = new CodebaseGraph();
    for (const f of files) graph.addFile(f);
    graph.buildIndexes();

    return {
      graph,
      eventNames,
      groundTruth,
      numFiles,
      numSymbols: numFiles * symsPerFile,
    };
  }
}
