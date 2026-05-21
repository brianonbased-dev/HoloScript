/**
 * BrainCoordNodeMapper — HoloGraph Phase 2
 *
 * Maps every symbol in a CodebaseGraph to an MNI152 brain coordinate and
 * populates CodebaseGraph.nodePositions with those coordinates.
 *
 * ## Why brain coordinates for code?
 *
 * Paper 33 (Brain-Geometry Storage Topology) proposes that PillarDomains
 * map to MNI152 coordinates derived from published fMRI meta-analyses of the
 * brain regions that perform analogous cognitive operations:
 *
 *   physics code    → Superior Parietal Lobule (30,-50,60)  — spatial reasoning
 *   language code   → Wernicke's area (-52,-32,8)           — language processing
 *   compiler code   → DLPFC (44,36,20)                      — rule application
 *   rendering code  → Visual cortex (-45,-68,5)             — visual output
 *   integrity code  → ACC (0,20,30)                         — conflict monitoring
 *
 * These are NOT arbitrary: they're the coordinates where the analogous
 * computation happens in the biological information processor that evolutionary
 * selection has been optimizing for 500 million years.
 *
 * ## Hot/cold routing
 *
 * GyriSulciPartitioner classifies each coordinate as gyrus (hot/in-memory) or
 * sulcus (cold/persistent). This gives us natural cache routing:
 *
 *   physics, compiler, language, rendering, agent → gyrus → HOT (in-memory)
 *   coordination, truth_approval, storage, init, shutdown → sulcus → COLD (disk)
 *
 * The graph's hot-path nodes (physics solvers, compilers, language tools) stay
 * in memory; coordination metadata and audit trails go to cold storage.
 *
 * ## Implementation
 *
 * Self-contained: inlines the PillarDomain→BrainCoord mapping (mirrors
 * BrainCoordMapper seed table) to avoid an optional @holoscript/core dependency.
 * When @holoscript/core is available, the seed table is the SSOT —
 * this file mirrors it; any update to BrainCoordMapper.ts should be reflected here.
 *
 * ## Usage
 *
 *   import { BrainCoordNodeMapper } from './BrainCoordNodeMapper';
 *   const mapper = new BrainCoordNodeMapper();
 *   mapper.populate(graph); // fills nodePositions + returns hot/cold stats
 *
 * After populate(), holo_ask_codebase and visualization tools can query
 * nodePositions to render the codebase as a cortical surface.
 */

import type { CodebaseGraph } from './CodebaseGraph';

// =============================================================================
// DOMAIN → BRAINCOORD SEED TABLE
// (mirrors packages/core/src/traits/pillar/BrainCoordMapper.ts seed table)
// =============================================================================

export type BrainCoordSurfaceType = 'gyrus' | 'sulcus' | 'unknown';
export type CacheTier = 'hot' | 'cold';

export interface DomainBrainCoord {
  domain: string;
  mni_x: number;
  mni_y: number;
  mni_z: number;
  surface_type: BrainCoordSurfaceType;
  tier: CacheTier;
  /** Brodmann area for provenance */
  brodmann_area?: number;
}

/** Mirrors BrainCoordMapper seed table (10 domains). Source of truth: BrainCoordMapper.ts */
const DOMAIN_SEED_TABLE: DomainBrainCoord[] = [
  { domain: 'physics',        mni_x: 30,  mni_y: -50, mni_z: 60,  surface_type: 'gyrus',  tier: 'hot',  brodmann_area: 7  },
  { domain: 'compiler',       mni_x: 44,  mni_y: 36,  mni_z: 20,  surface_type: 'gyrus',  tier: 'hot',  brodmann_area: 46 },
  { domain: 'language',       mni_x: -52, mni_y: -32, mni_z: 8,   surface_type: 'gyrus',  tier: 'hot',  brodmann_area: 22 },
  { domain: 'rendering',      mni_x: -45, mni_y: -68, mni_z: 5,   surface_type: 'gyrus',  tier: 'hot',  brodmann_area: 19 },
  { domain: 'agent',          mni_x: -54, mni_y: -56, mni_z: 22,  surface_type: 'gyrus',  tier: 'hot',  brodmann_area: 39 },
  { domain: 'coordination',   mni_x: 0,   mni_y: 25,  mni_z: 30,  surface_type: 'sulcus', tier: 'cold', brodmann_area: 24 },
  { domain: 'storage',        mni_x: 28,  mni_y: -22, mni_z: -14, surface_type: 'sulcus', tier: 'cold', brodmann_area: 28 },
  { domain: 'truth_approval', mni_x: 0,   mni_y: 20,  mni_z: 30,  surface_type: 'sulcus', tier: 'cold', brodmann_area: 24 },
  { domain: 'init',           mni_x: 8,   mni_y: -12, mni_z: 4,   surface_type: 'sulcus', tier: 'cold', brodmann_area: 37 },
  { domain: 'shutdown',       mni_x: 0,   mni_y: -28, mni_z: -8,  surface_type: 'sulcus', tier: 'cold', brodmann_area: 35 },
];

/** Default coordinate for unrecognized domains — thalamic origin */
const UNKNOWN_COORD: DomainBrainCoord = {
  domain: 'unknown', mni_x: 0, mni_y: -12, mni_z: 4,
  surface_type: 'unknown', tier: 'cold',
};

// =============================================================================
// TYPES
// =============================================================================

export interface NodeBrainCoord {
  /** Symbol key (matches CodebaseGraph.nodePositions key) */
  symbolKey: string;
  mni_x: number;
  mni_y: number;
  mni_z: number;
  surface_type: BrainCoordSurfaceType;
  tier: CacheTier;
  /** Detected domain for this file path */
  domain: string;
  /** Distance to nearest seed entry (mm) */
  nearest_distance_mm: number;
}

export interface PopulateResult {
  totalNodes: number;
  hotNodes: number;
  coldNodes: number;
  unknownNodes: number;
  /** Coverage: fraction of symbols that got a non-unknown coordinate */
  coverage: number;
  /** Distribution across domains */
  domainCounts: Record<string, number>;
}

// =============================================================================
// BRAIN COORD NODE MAPPER
// =============================================================================

export class BrainCoordNodeMapper {
  /** Full per-symbol coordinate metadata (populated by populate()) */
  private nodeMeta: Map<string, NodeBrainCoord> = new Map();

  /**
   * Populate CodebaseGraph.nodePositions from BrainCoord domain mapping.
   *
   * For each symbol in the graph:
   *   1. Detect the PillarDomain from the file path
   *   2. Look up the BrainCoord for that domain
   *   3. Set nodePositions[symbolKey] = [mni_x, mni_y, mni_z]
   *   4. Cache hot/cold tier in this.nodeMeta
   *
   * After this call, nodePositions reflects the cortical address space:
   * physics solvers cluster at (30,-50,60), compilers at (44,36,20), etc.
   */
  populate(graph: CodebaseGraph): PopulateResult {
    this.nodeMeta.clear();
    const domainCounts: Record<string, number> = {};
    let hot = 0, cold = 0, unknown = 0;

    const symbols = graph.getAllSymbols();
    for (const sym of symbols) {
      const domain = this.detectDomain(sym.filePath);
      const coord = this.lookupCoord(domain);
      const key = this.makeKey(sym);

      const meta: NodeBrainCoord = {
        symbolKey:          key,
        mni_x:              coord.mni_x,
        mni_y:              coord.mni_y,
        mni_z:              coord.mni_z,
        surface_type:       coord.surface_type,
        tier:               coord.tier,
        domain:             coord.domain,
        nearest_distance_mm: 0, // exact match for domain lookup
      };
      this.nodeMeta.set(key, meta);
      graph.nodePositions.set(key, [coord.mni_x, coord.mni_y, coord.mni_z]);

      domainCounts[coord.domain] = (domainCounts[coord.domain] ?? 0) + 1;
      if (coord.surface_type === 'gyrus')   hot++;
      else if (coord.surface_type === 'sulcus') cold++;
      else unknown++;
    }

    const total = symbols.length;
    return {
      totalNodes: total,
      hotNodes: hot,
      coldNodes: cold,
      unknownNodes: unknown,
      coverage: total > 0 ? (hot + cold) / total : 0,
      domainCounts,
    };
  }

  /**
   * Get the hot/cold tier for a specific symbol key.
   * Returns 'cold' if key is not found (fail-safe: don't lose data).
   */
  getTier(symbolKey: string): CacheTier {
    return this.nodeMeta.get(symbolKey)?.tier ?? 'cold';
  }

  /**
   * Get full brain coordinate metadata for a symbol.
   */
  getMeta(symbolKey: string): NodeBrainCoord | undefined {
    return this.nodeMeta.get(symbolKey);
  }

  /**
   * All hot (gyral) symbol keys — suitable for in-memory LRU cache.
   */
  hotKeys(): string[] {
    return Array.from(this.nodeMeta.values())
      .filter(m => m.tier === 'hot')
      .map(m => m.symbolKey);
  }

  /**
   * All cold (sulcal) symbol keys — suitable for disk-backed index.
   */
  coldKeys(): string[] {
    return Array.from(this.nodeMeta.values())
      .filter(m => m.tier === 'cold')
      .map(m => m.symbolKey);
  }

  /**
   * Get the BrainCoord cluster centroid for a domain.
   * Useful for rendering: "where does this domain live on the cortex?"
   */
  domainCentroid(domain: string): [number, number, number] {
    const coord = this.lookupCoord(domain);
    return [coord.mni_x, coord.mni_y, coord.mni_z];
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Detect PillarDomain from file path using structural heuristics.
   *
   * Priority order (first match wins):
   *   1. Explicit directory markers (traits/, compilers/, plugins/)
   *   2. Keyword patterns in path segments
   *   3. Package-level defaults
   *   4. Fallback: 'coordination'
   */
  detectDomain(filePath: string): string {
    const f = filePath.replace(/\\/g, '/').toLowerCase();
    const segments = f.split('/');

    // ── Physics: solvers, WASM, simulation, brain-geo spatial ──────────────
    if (this._match(f, ['/physics', '/solver', '/wasm', '/snn', '/webgpu',
                        '/simulation', 'brain-geo', '/mni', '/cortical',
                        'gyri', 'sulci', 'braincoord'])) return 'physics';

    // ── Compiler: compilation, AST, code generation ─────────────────────────
    if (this._match(f, ['/compiler', 'compiler.ts', '/compilers/', 'compile_to',
                        '/ast', '/codegen', '/transpil', '/lsp', '/formatter',
                        '/linter', '/parser'])) return 'compiler';

    // ── Language: NLP, text processing, tokenization ─────────────────────────
    if (this._match(f, ['/language', '/nlp', '/tokeniz', '/embedding',
                        '/inference', '/llm', '/model'])) return 'language';

    // ── Rendering: visual output, R3F, hologram, 3D ──────────────────────────
    if (this._match(f, ['/render', '/r3f', '/visual', '/hologram', '/hologr',
                        '/3d', '/canvas', '/scene', '/three', '/studio',
                        '/animation', '/preview', '/hololand'])) return 'rendering';

    // ── Agent: orchestration, MCP, HoloMesh ──────────────────────────────────
    if (this._match(f, ['/agent', '/mcp', '/holomesh', '/orchestrat',
                        '/uaa2', '/trait', '/holoscript'])) return 'agent';

    // ── Storage: absorb, knowledge, vault ────────────────────────────────────
    if (this._match(f, ['/absorb', '/knowledge', '/vault', '/gold',
                        '/database', '/db/', '/storage', '/cache',
                        '/repository', '/persist'])) return 'storage';

    // ── Truth/integrity: security, audit, sandbox ────────────────────────────
    if (this._match(f, ['/integrity', '/security', '/sandbox', '/audit',
                        '/byzantine', '/sycoph', '/validity', '/verify',
                        '/attestat', '/receipt'])) return 'truth_approval';

    // ── Coordination: pillar, slice, planning ────────────────────────────────
    if (this._match(f, ['/pillar', '/slice', '/coordinat', '/planning',
                        '/schedule', '/dispatch', '/routing', '/index'])) return 'coordination';

    // ── Init: startup, bootstrap, config ────────────────────────────────────
    if (this._match(f, ['/init', '/bootstrap', '/startup', '/config',
                        '/setup', '/register', '/plugin', '/hook'])) return 'init';

    // ── Shutdown: teardown, lifecycle end ────────────────────────────────────
    if (this._match(f, ['/shutdown', '/teardown', '/cleanup', '/lifecycle'])) return 'shutdown';

    // ── Monitoring: tests, benchmarks, metrics ───────────────────────────────
    if (this._match(f, ['/__tests__', '.test.', '.spec.', '/bench',
                        '/monitor', '/metric', '/telemetry', '/log'])) return 'agent'; // monitoring → agent domain

    // ── Package-level defaults ───────────────────────────────────────────────
    if (f.includes('packages/core'))         return 'compiler';   // core = language/compiler
    if (f.includes('packages/mcp-server'))   return 'coordination';
    if (f.includes('packages/studio'))       return 'rendering';
    if (f.includes('packages/r3f-renderer')) return 'rendering';
    if (f.includes('packages/plugins'))      return 'init';
    if (f.includes('packages/snn'))          return 'physics';

    return 'coordination'; // default
  }

  /** Find the nearest seed entry for a domain string */
  private lookupCoord(domain: string): DomainBrainCoord {
    const exact = DOMAIN_SEED_TABLE.find(d => d.domain === domain);
    if (exact) return exact;

    // Partial match: 'physics-ext' → 'physics'
    const partial = DOMAIN_SEED_TABLE.find(d => domain.startsWith(d.domain));
    if (partial) return partial;

    return UNKNOWN_COORD;
  }

  /** Check if any of the pattern strings appear in the file path */
  private _match(filePath: string, patterns: string[]): boolean {
    return patterns.some(p => filePath.includes(p));
  }

  /**
   * Stable symbol key matching CodebaseGraph's makeSymbolId format.
   * "type:owner.name:filePath:line" — we reconstruct the same key.
   */
  private makeKey(sym: { type: string; name: string; owner?: string; filePath: string; line: number }): string {
    const owner = sym.owner ? `${sym.owner}.` : '';
    return `${sym.type}:${owner}${sym.name}:${sym.filePath}:${sym.line}`;
  }
}
