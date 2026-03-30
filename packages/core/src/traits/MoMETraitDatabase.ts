/**
 * MoMETraitDatabase — Mixture of Memory Experts for Trait Queries
 *
 * TODO-005: MoME Prototype for Trait Database
 *
 * Architecture:
 *   A router receives trait queries and dispatches them to the most relevant
 *   expert sub-database. Each expert is specialized in a trait category
 *   (rendering, physics, audio, animation, AI, network, etc.) and maintains
 *   its own index for fast retrieval.
 *
 * Features:
 * - Multiple specialized sub-databases for different trait categories
 * - Intelligent router that dispatches queries to the right expert
 * - Relevance scoring and cross-expert fallback
 * - Memory-efficient storage with lazy loading per expert
 * - Unified query API that merges results from multiple experts
 * - Cache layer with LRU eviction
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export type TraitCategory =
  | 'rendering'
  | 'physics'
  | 'audio'
  | 'animation'
  | 'ai'
  | 'network'
  | 'ui'
  | 'input'
  | 'lifecycle'
  | 'data'
  | 'spatial'
  | 'general';

export interface TraitDefinition {
  name: string;
  category: TraitCategory;
  description: string;
  parameters: TraitParameter[];
  compatibleWith: string[];
  conflictsWith: string[];
  version: string;
  tags: string[];
  examples?: string[];
  performance?: PerformanceProfile;
}

export interface TraitParameter {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'color' | 'vec2' | 'vec3' | 'vec4' | 'enum' | 'asset';
  default?: unknown;
  min?: number;
  max?: number;
  enumValues?: string[];
  description: string;
  required: boolean;
}

export interface PerformanceProfile {
  gpuCost: 'negligible' | 'low' | 'medium' | 'high' | 'extreme';
  cpuCost: 'negligible' | 'low' | 'medium' | 'high' | 'extreme';
  memoryCost: 'negligible' | 'low' | 'medium' | 'high';
  drawCallImpact: number; // additional draw calls
  vrSafe: boolean;
  mobileSafe: boolean;
}

export interface QueryOptions {
  maxResults: number;
  minRelevance: number;
  categories?: TraitCategory[];
  tags?: string[];
  includeDeprecated?: boolean;
  platformFilter?: 'desktop' | 'mobile' | 'vr' | 'ar';
}

export interface QueryResult {
  trait: TraitDefinition;
  relevance: number; // 0-1
  expert: TraitCategory;
  matchType: 'exact' | 'fuzzy' | 'tag' | 'description';
}

export interface ExpertStats {
  category: TraitCategory;
  traitCount: number;
  lastAccess: number;
  hitCount: number;
  avgQueryTimeMs: number;
}

// =============================================================================
// EXPERT SUB-DATABASE
// =============================================================================

/**
 * A specialized sub-database for a single trait category.
 * Maintains its own index for fast name, tag, and description search.
 */
export class TraitExpert {
  readonly category: TraitCategory;
  private traits: Map<string, TraitDefinition> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map(); // tag -> trait names
  private nameTokens: Map<string, string[]> = new Map(); // trait name -> tokens
  private hitCount = 0;
  private lastAccess = 0;
  private totalQueryTimeMs = 0;
  private queryCount = 0;

  constructor(category: TraitCategory) {
    this.category = category;
  }

  /** Add a trait definition to this expert. */
  addTrait(trait: TraitDefinition): void {
    if (trait.category !== this.category) {
      throw new Error(
        `TraitExpert[${this.category}]: cannot add trait "${trait.name}" with category "${trait.category}"`
      );
    }

    this.traits.set(trait.name, trait);

    // Index tags
    for (const tag of trait.tags) {
      const normalized = tag.toLowerCase();
      if (!this.tagIndex.has(normalized)) {
        this.tagIndex.set(normalized, new Set());
      }
      this.tagIndex.get(normalized)!.add(trait.name);
    }

    // Tokenize name for fuzzy search
    this.nameTokens.set(
      trait.name,
      trait.name
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    );
  }

  /** Remove a trait by name. */
  removeTrait(name: string): boolean {
    const trait = this.traits.get(name);
    if (!trait) return false;

    this.traits.delete(name);
    this.nameTokens.delete(name);

    // Clean tag index
    for (const tag of trait.tags) {
      const set = this.tagIndex.get(tag.toLowerCase());
      if (set) {
        set.delete(name);
        if (set.size === 0) this.tagIndex.delete(tag.toLowerCase());
      }
    }

    return true;
  }

  /** Query this expert for matching traits. */
  query(queryText: string, options: QueryOptions): QueryResult[] {
    const start = performance.now();
    this.lastAccess = Date.now();
    this.hitCount++;

    const results: QueryResult[] = [];
    const queryLower = queryText.toLowerCase();
    const queryTokens = queryLower.split(/[^a-z0-9]+/).filter(Boolean);

    for (const [name, trait] of this.traits) {
      let relevance = 0;
      let matchType: QueryResult['matchType'] = 'description';

      // Exact name match
      if (name.toLowerCase() === queryLower || `@${name.toLowerCase()}` === queryLower) {
        relevance = 1.0;
        matchType = 'exact';
      }
      // Partial name match
      else if (name.toLowerCase().includes(queryLower)) {
        relevance = 0.85;
        matchType = 'fuzzy';
      }
      // Token overlap with name
      else {
        const nameToks = this.nameTokens.get(name) || [];
        const overlap = queryTokens.filter((qt) =>
          nameToks.some((nt) => nt.includes(qt) || qt.includes(nt))
        );
        if (overlap.length > 0) {
          relevance = 0.5 + (overlap.length / Math.max(queryTokens.length, 1)) * 0.3;
          matchType = 'fuzzy';
        }
      }

      // Tag match boost
      for (const qt of queryTokens) {
        const tagSet = this.tagIndex.get(qt);
        if (tagSet?.has(name)) {
          relevance = Math.max(relevance, 0.7);
          if (matchType === 'description') matchType = 'tag';
        }
      }

      // Description match
      if (relevance === 0 && trait.description.toLowerCase().includes(queryLower)) {
        relevance = 0.4;
        matchType = 'description';
      }

      // Tag filter
      if (options.tags && options.tags.length > 0) {
        const traitTags = new Set(trait.tags.map((t) => t.toLowerCase()));
        const hasMatchingTag = options.tags.some((t) => traitTags.has(t.toLowerCase()));
        if (!hasMatchingTag) relevance *= 0.3;
      }

      // Platform filter
      if (options.platformFilter && trait.performance) {
        if (options.platformFilter === 'mobile' && !trait.performance.mobileSafe) {
          relevance *= 0.5;
        }
        if (options.platformFilter === 'vr' && !trait.performance.vrSafe) {
          relevance *= 0.5;
        }
      }

      if (relevance >= options.minRelevance) {
        results.push({
          trait,
          relevance,
          expert: this.category,
          matchType,
        });
      }
    }

    // Sort by relevance descending
    results.sort((a, b) => b.relevance - a.relevance);

    const elapsed = performance.now() - start;
    this.totalQueryTimeMs += elapsed;
    this.queryCount++;

    return results.slice(0, options.maxResults);
  }

  /** Get trait by exact name. */
  getTrait(name: string): TraitDefinition | undefined {
    this.hitCount++;
    this.lastAccess = Date.now();
    return this.traits.get(name);
  }

  /** List all traits in this expert. */
  listTraits(): TraitDefinition[] {
    return Array.from(this.traits.values());
  }

  /** Get stats for this expert. */
  getStats(): ExpertStats {
    return {
      category: this.category,
      traitCount: this.traits.size,
      lastAccess: this.lastAccess,
      hitCount: this.hitCount,
      avgQueryTimeMs: this.queryCount > 0 ? this.totalQueryTimeMs / this.queryCount : 0,
    };
  }

  get size(): number {
    return this.traits.size;
  }
}

// =============================================================================
// LRU CACHE
// =============================================================================

class LRUCache<K, V> {
  private map: Map<K, V> = new Map();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest (first entry)
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

// =============================================================================
// ROUTER
// =============================================================================

/**
 * Routes incoming queries to the most relevant expert(s).
 * Uses keyword heuristics to determine which expert categories to query.
 */

const CATEGORY_KEYWORDS: Record<TraitCategory, string[]> = {
  rendering: [
    'material',
    'color',
    'texture',
    'shader',
    'pbr',
    'emissive',
    'metallic',
    'roughness',
    'iridescence',
    'clearcoat',
    'transmission',
    'glass',
    'toon',
    'render',
    'light',
    'shadow',
    'glow',
    'bloom',
    'opacity',
    'transparent',
    'reflective',
    'subsurface',
    'sss',
  ],
  physics: [
    'physics',
    'rigid',
    'body',
    'collider',
    'collision',
    'gravity',
    'force',
    'velocity',
    'mass',
    'friction',
    'restitution',
    'kinematic',
    'dynamic',
    'constraint',
    'joint',
    'ragdoll',
    'trigger',
  ],
  audio: [
    'audio',
    'sound',
    'music',
    'spatial',
    'volume',
    'pitch',
    'reverb',
    'echo',
    'distortion',
    'filter',
    'oscillator',
    'synth',
    'ambience',
    'sfx',
    'listener',
  ],
  animation: [
    'animation',
    'animate',
    'tween',
    'keyframe',
    'interpolate',
    'ease',
    'spring',
    'morph',
    'blend',
    'skeleton',
    'bone',
    'ik',
    'procedural',
    'walk',
    'idle',
    'loop',
    'clip',
  ],
  ai: [
    'ai',
    'agent',
    'behavior',
    'state',
    'machine',
    'decision',
    'tree',
    'pathfinding',
    'navmesh',
    'npc',
    'dialogue',
    'goal',
    'utility',
    'perception',
    'sensor',
    'blackboard',
    'snn',
    'neural',
  ],
  network: [
    'network',
    'multiplayer',
    'sync',
    'replicate',
    'rpc',
    'lobby',
    'authority',
    'prediction',
    'interpolation',
    'latency',
    'matchmaking',
    'socket',
    'websocket',
    'crdt',
  ],
  ui: [
    'ui',
    'hud',
    'canvas',
    'button',
    'text',
    'panel',
    'tooltip',
    'menu',
    'cursor',
    'minimap',
    'health',
    'bar',
    'inventory',
    'widget',
  ],
  input: [
    'input',
    'keyboard',
    'mouse',
    'gamepad',
    'touch',
    'gesture',
    'pointer',
    'controller',
    'vr',
    'xr',
    'hand',
    'tracking',
    'ray',
    'click',
    'drag',
  ],
  lifecycle: [
    'lifecycle',
    'init',
    'update',
    'destroy',
    'spawn',
    'despawn',
    'enable',
    'disable',
    'awake',
    'start',
    'tick',
    'frame',
    'event',
    'trigger',
  ],
  data: [
    'data',
    'store',
    'state',
    'reactive',
    'observable',
    'binding',
    'serialize',
    'persist',
    'save',
    'load',
    'config',
    'json',
    'schema',
  ],
  spatial: [
    'spatial',
    'transform',
    'position',
    'rotation',
    'scale',
    'parent',
    'child',
    'hierarchy',
    'lod',
    'culling',
    'frustum',
    'octree',
    'bvh',
    'portal',
    'teleport',
  ],
  general: [
    'general',
    'tag',
    'name',
    'group',
    'layer',
    'mask',
    'debug',
    'gizmo',
    'comment',
    'metadata',
    'script',
  ],
};

function routeQuery(queryText: string, categoryFilter?: TraitCategory[]): TraitCategory[] {
  const queryLower = queryText.toLowerCase();
  const scores: Map<TraitCategory, number> = new Map();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (queryLower.includes(keyword)) {
        // Longer keyword matches are more significant
        score += keyword.length;
      }
    }
    if (score > 0) {
      scores.set(category as TraitCategory, score);
    }
  }

  // If no keywords matched, query all experts
  if (scores.size === 0) {
    return categoryFilter || (Object.keys(CATEGORY_KEYWORDS) as TraitCategory[]);
  }

  // Sort by score descending, take top 3
  let ranked = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);

  // Apply category filter if provided
  if (categoryFilter) {
    ranked = ranked.filter((c) => categoryFilter.includes(c));
    if (ranked.length === 0) return categoryFilter;
  }

  return ranked.slice(0, 3);
}

// =============================================================================
// MoME TRAIT DATABASE
// =============================================================================

export interface MoMEDatabaseOptions {
  cacheSize?: number;
  defaultMaxResults?: number;
  defaultMinRelevance?: number;
}

/**
 * Mixture of Memory Experts Trait Database.
 *
 * Central entry point for querying HoloScript trait definitions.
 * Internally dispatches queries to specialized expert sub-databases
 * and merges results with relevance scoring.
 */
export class MoMETraitDatabase {
  private experts: Map<TraitCategory, TraitExpert> = new Map();
  private cache: LRUCache<string, QueryResult[]>;
  private defaultMaxResults: number;
  private defaultMinRelevance: number;

  constructor(options: MoMEDatabaseOptions = {}) {
    this.cache = new LRUCache(options.cacheSize ?? 256);
    this.defaultMaxResults = options.defaultMaxResults ?? 20;
    this.defaultMinRelevance = options.defaultMinRelevance ?? 0.1;

    // Initialize all expert categories
    for (const category of Object.keys(CATEGORY_KEYWORDS) as TraitCategory[]) {
      this.experts.set(category, new TraitExpert(category));
    }
  }

  // ─── Trait Management ─────────────────────────────────────────────────

  /** Register a trait definition. Routes to the appropriate expert. */
  register(trait: TraitDefinition): void {
    const expert = this.experts.get(trait.category);
    if (!expert) {
      throw new Error(`Unknown trait category: ${trait.category}`);
    }
    expert.addTrait(trait);
    this.cache.clear(); // Invalidate cache
  }

  /** Register multiple traits at once. */
  registerBatch(traits: TraitDefinition[]): void {
    for (const trait of traits) {
      const expert = this.experts.get(trait.category);
      if (expert) {
        expert.addTrait(trait);
      }
    }
    this.cache.clear();
  }

  /** Remove a trait by name and category. */
  remove(name: string, category: TraitCategory): boolean {
    const expert = this.experts.get(category);
    if (!expert) return false;
    const removed = expert.removeTrait(name);
    if (removed) this.cache.clear();
    return removed;
  }

  /** Get a trait by exact name. Searches all experts if category not specified. */
  get(name: string, category?: TraitCategory): TraitDefinition | undefined {
    if (category) {
      return this.experts.get(category)?.getTrait(name);
    }
    for (const expert of this.experts.values()) {
      const trait = expert.getTrait(name);
      if (trait) return trait;
    }
    return undefined;
  }

  // ─── Querying ─────────────────────────────────────────────────────────

  /** Query traits using natural language or keywords. Routes to best experts. */
  query(queryText: string, options?: Partial<QueryOptions>): QueryResult[] {
    const opts: QueryOptions = {
      maxResults: options?.maxResults ?? this.defaultMaxResults,
      minRelevance: options?.minRelevance ?? this.defaultMinRelevance,
      categories: options?.categories,
      tags: options?.tags,
      includeDeprecated: options?.includeDeprecated ?? false,
      platformFilter: options?.platformFilter,
    };

    // Check cache
    const cacheKey = `${queryText}|${JSON.stringify(opts)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Route query to relevant experts
    const targetCategories = routeQuery(queryText, opts.categories);
    const allResults: QueryResult[] = [];

    for (const category of targetCategories) {
      const expert = this.experts.get(category);
      if (!expert || expert.size === 0) continue;

      const results = expert.query(queryText, opts);
      allResults.push(...results);
    }

    // Merge, deduplicate, and sort
    const seen = new Set<string>();
    const merged = allResults.filter((r) => {
      if (seen.has(r.trait.name)) return false;
      seen.add(r.trait.name);
      return true;
    });

    merged.sort((a, b) => b.relevance - a.relevance);
    const final = merged.slice(0, opts.maxResults);

    this.cache.set(cacheKey, final);
    return final;
  }

  /** Find traits compatible with a given trait. */
  findCompatible(traitName: string): TraitDefinition[] {
    const trait = this.get(traitName);
    if (!trait) return [];

    return trait.compatibleWith
      .map((name) => this.get(name))
      .filter((t): t is TraitDefinition => t !== undefined);
  }

  /** Find traits that conflict with a given trait. */
  findConflicts(traitName: string): TraitDefinition[] {
    const trait = this.get(traitName);
    if (!trait) return [];

    return trait.conflictsWith
      .map((name) => this.get(name))
      .filter((t): t is TraitDefinition => t !== undefined);
  }

  /** List all traits in a category. */
  listCategory(category: TraitCategory): TraitDefinition[] {
    return this.experts.get(category)?.listTraits() || [];
  }

  /** List all registered traits across all experts. */
  listAll(): TraitDefinition[] {
    const all: TraitDefinition[] = [];
    for (const expert of this.experts.values()) {
      all.push(...expert.listTraits());
    }
    return all;
  }

  // ─── Statistics ───────────────────────────────────────────────────────

  /** Get stats for all experts. */
  getStats(): ExpertStats[] {
    return Array.from(this.experts.values()).map((e) => e.getStats());
  }

  /** Get total trait count across all experts. */
  get totalTraits(): number {
    let total = 0;
    for (const expert of this.experts.values()) {
      total += expert.size;
    }
    return total;
  }

  /** Get category distribution. */
  getCategoryDistribution(): Record<TraitCategory, number> {
    const dist: Partial<Record<TraitCategory, number>> = {};
    for (const [category, expert] of this.experts) {
      dist[category] = expert.size;
    }
    return dist as Record<TraitCategory, number>;
  }

  /** Clear the query cache. */
  clearCache(): void {
    this.cache.clear();
  }
}

// =============================================================================
// FACTORY + BUILT-IN TRAITS
// =============================================================================

/**
 * Create a MoME database pre-loaded with core HoloScript traits.
 */
export function createMoMETraitDatabase(options?: MoMEDatabaseOptions): MoMETraitDatabase {
  const db = new MoMETraitDatabase(options);

  // Register built-in rendering traits
  const renderingTraits: TraitDefinition[] = [
    {
      name: 'material',
      category: 'rendering',
      description: 'Base PBR material with color, metalness, and roughness',
      parameters: [
        { name: 'preset', type: 'string', description: 'Material preset name', required: false },
        { name: 'color', type: 'color', description: 'Base color', required: false },
        {
          name: 'metalness',
          type: 'number',
          min: 0,
          max: 1,
          default: 0,
          description: 'Metalness factor',
          required: false,
        },
        {
          name: 'roughness',
          type: 'number',
          min: 0,
          max: 1,
          default: 0.5,
          description: 'Roughness factor',
          required: false,
        },
      ],
      compatibleWith: ['emissive', 'iridescence', 'clearcoat', 'transmission'],
      conflictsWith: [],
      version: '1.0.0',
      tags: ['pbr', 'material', 'color', 'basic'],
      performance: {
        gpuCost: 'low',
        cpuCost: 'negligible',
        memoryCost: 'low',
        drawCallImpact: 0,
        vrSafe: true,
        mobileSafe: true,
      },
    },
    {
      name: 'emissive',
      category: 'rendering',
      description: 'Emissive glow effect for self-illuminated surfaces',
      parameters: [
        { name: 'color', type: 'color', description: 'Emission color', required: false },
        {
          name: 'intensity',
          type: 'number',
          min: 0,
          max: 10,
          default: 1,
          description: 'Emission intensity',
          required: false,
        },
      ],
      compatibleWith: ['material', 'bloom'],
      conflictsWith: [],
      version: '1.0.0',
      tags: ['glow', 'light', 'emission', 'neon'],
      performance: {
        gpuCost: 'low',
        cpuCost: 'negligible',
        memoryCost: 'negligible',
        drawCallImpact: 0,
        vrSafe: true,
        mobileSafe: true,
      },
    },
    {
      name: 'iridescence',
      category: 'rendering',
      description: 'Thin-film iridescence for soap bubble / oil slick effects',
      parameters: [
        {
          name: 'strength',
          type: 'number',
          min: 0,
          max: 1,
          default: 0.5,
          description: 'Iridescence strength',
          required: false,
        },
        {
          name: 'ior',
          type: 'number',
          min: 1,
          max: 2.5,
          default: 1.3,
          description: 'Index of refraction',
          required: false,
        },
      ],
      compatibleWith: ['material', 'clearcoat'],
      conflictsWith: ['toon'],
      version: '1.0.0',
      tags: ['iridescence', 'rainbow', 'thin-film', 'advanced-pbr'],
      performance: {
        gpuCost: 'medium',
        cpuCost: 'negligible',
        memoryCost: 'low',
        drawCallImpact: 0,
        vrSafe: true,
        mobileSafe: false,
      },
    },
    {
      name: 'transmission',
      category: 'rendering',
      description: 'Glass / transparent material with refraction',
      parameters: [
        {
          name: 'factor',
          type: 'number',
          min: 0,
          max: 1,
          default: 1,
          description: 'Transmission factor',
          required: false,
        },
        {
          name: 'thickness',
          type: 'number',
          min: 0,
          max: 10,
          default: 0.5,
          description: 'Material thickness',
          required: false,
        },
        {
          name: 'ior',
          type: 'number',
          min: 1,
          max: 2.5,
          default: 1.5,
          description: 'Index of refraction',
          required: false,
        },
      ],
      compatibleWith: ['material'],
      conflictsWith: ['toon'],
      version: '1.0.0',
      tags: ['glass', 'transparent', 'refraction', 'transmission'],
      performance: {
        gpuCost: 'high',
        cpuCost: 'negligible',
        memoryCost: 'low',
        drawCallImpact: 1,
        vrSafe: false,
        mobileSafe: false,
      },
    },
    {
      name: 'subsurface',
      category: 'rendering',
      description: 'Subsurface scattering for skin, wax, marble effects',
      parameters: [
        { name: 'color', type: 'color', description: 'Scattering color', required: false },
        {
          name: 'thickness',
          type: 'number',
          min: 0,
          max: 5,
          default: 1,
          description: 'Scattering depth',
          required: false,
        },
      ],
      compatibleWith: ['material'],
      conflictsWith: ['toon', 'transmission'],
      version: '1.0.0',
      tags: ['sss', 'skin', 'wax', 'subsurface', 'scattering'],
      performance: {
        gpuCost: 'high',
        cpuCost: 'low',
        memoryCost: 'low',
        drawCallImpact: 0,
        vrSafe: false,
        mobileSafe: false,
      },
    },
  ];

  // Register built-in physics traits
  const physicsTraits: TraitDefinition[] = [
    {
      name: 'rigidBody',
      category: 'physics',
      description: 'Rigid body physics simulation',
      parameters: [
        {
          name: 'type',
          type: 'enum',
          enumValues: ['dynamic', 'kinematic', 'static'],
          default: 'dynamic',
          description: 'Body type',
          required: false,
        },
        {
          name: 'mass',
          type: 'number',
          min: 0,
          max: 10000,
          default: 1,
          description: 'Mass in kg',
          required: false,
        },
        {
          name: 'friction',
          type: 'number',
          min: 0,
          max: 1,
          default: 0.5,
          description: 'Surface friction',
          required: false,
        },
        {
          name: 'restitution',
          type: 'number',
          min: 0,
          max: 1,
          default: 0.3,
          description: 'Bounciness',
          required: false,
        },
      ],
      compatibleWith: ['collider'],
      conflictsWith: [],
      version: '1.0.0',
      tags: ['physics', 'rigid', 'dynamic', 'simulation'],
      performance: {
        gpuCost: 'negligible',
        cpuCost: 'medium',
        memoryCost: 'low',
        drawCallImpact: 0,
        vrSafe: true,
        mobileSafe: true,
      },
    },
    {
      name: 'collider',
      category: 'physics',
      description: 'Collision shape for physics interaction',
      parameters: [
        {
          name: 'shape',
          type: 'enum',
          enumValues: ['box', 'sphere', 'capsule', 'mesh', 'convex'],
          default: 'box',
          description: 'Collider shape',
          required: false,
        },
        {
          name: 'isTrigger',
          type: 'boolean',
          default: false,
          description: 'Trigger (no collision response)',
          required: false,
        },
      ],
      compatibleWith: ['rigidBody'],
      conflictsWith: [],
      version: '1.0.0',
      tags: ['collision', 'collider', 'shape', 'trigger'],
      performance: {
        gpuCost: 'negligible',
        cpuCost: 'low',
        memoryCost: 'low',
        drawCallImpact: 0,
        vrSafe: true,
        mobileSafe: true,
      },
    },
  ];

  // Register built-in audio traits
  const audioTraits: TraitDefinition[] = [
    {
      name: 'spatialAudio',
      category: 'audio',
      description: 'Positional 3D audio source with distance attenuation',
      parameters: [
        { name: 'src', type: 'asset', description: 'Audio file path', required: true },
        {
          name: 'volume',
          type: 'number',
          min: 0,
          max: 1,
          default: 1,
          description: 'Volume level',
          required: false,
        },
        {
          name: 'rolloff',
          type: 'enum',
          enumValues: ['linear', 'inverse', 'exponential'],
          default: 'inverse',
          description: 'Distance rolloff model',
          required: false,
        },
        {
          name: 'maxDistance',
          type: 'number',
          min: 1,
          max: 1000,
          default: 50,
          description: 'Max audible distance',
          required: false,
        },
        {
          name: 'loop',
          type: 'boolean',
          default: false,
          description: 'Loop playback',
          required: false,
        },
      ],
      compatibleWith: [],
      conflictsWith: [],
      version: '1.0.0',
      tags: ['audio', 'spatial', '3d', 'sound', 'positional'],
      performance: {
        gpuCost: 'negligible',
        cpuCost: 'medium',
        memoryCost: 'medium',
        drawCallImpact: 0,
        vrSafe: true,
        mobileSafe: true,
      },
    },
  ];

  // Register built-in animation traits
  const animationTraits: TraitDefinition[] = [
    {
      name: 'animate',
      category: 'animation',
      description: 'Property animation with easing and looping',
      parameters: [
        { name: 'property', type: 'string', description: 'Target property path', required: true },
        { name: 'from', type: 'number', description: 'Start value', required: false },
        { name: 'to', type: 'number', description: 'End value', required: true },
        {
          name: 'duration',
          type: 'number',
          min: 0,
          default: 1,
          description: 'Duration in seconds',
          required: false,
        },
        {
          name: 'easing',
          type: 'enum',
          enumValues: ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring'],
          default: 'ease-in-out',
          description: 'Easing function',
          required: false,
        },
        {
          name: 'loop',
          type: 'boolean',
          default: false,
          description: 'Loop animation',
          required: false,
        },
      ],
      compatibleWith: [],
      conflictsWith: [],
      version: '1.0.0',
      tags: ['animation', 'tween', 'motion', 'easing'],
      performance: {
        gpuCost: 'negligible',
        cpuCost: 'low',
        memoryCost: 'negligible',
        drawCallImpact: 0,
        vrSafe: true,
        mobileSafe: true,
      },
    },
  ];

  db.registerBatch([...renderingTraits, ...physicsTraits, ...audioTraits, ...animationTraits]);

  return db;
}

export default MoMETraitDatabase;
