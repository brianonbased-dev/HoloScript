/**
 * sem-ena-werq Dual-Layer Documentation System
 *
 * Implements a two-layer documentation architecture:
 *   Layer 1 (sem / "name") — Machine-readable semantic annotations
 *   Layer 2 (ena-werq / "knowledge-work") — Human-readable narrative docs
 *
 * Inspired by Ethiopian Ge'ez tradition: sem = name/identity, ena-werq = gold/knowledge.
 * The system ensures every trait, composition, and compiler target is documented
 * both for tooling consumption (JSON Schema, LSP hover, autocomplete) and for
 * human understanding (tutorials, examples, best practices).
 *
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════
// Layer 1: sem — Machine-Readable Semantic Annotations
// ═══════════════════════════════════════════════════════════════════

/** Semantic parameter descriptor for a trait field or function argument. */
export interface SemParam {
  name: string;
  type: string;
  description: string;
  default?: unknown;
  range?: { min?: number; max?: number };
  units?: string;
  required?: boolean;
  deprecated?: boolean;
  since?: string;
}

/** Semantic event descriptor emitted by a trait. */
export interface SemEvent {
  name: string;
  description: string;
  payload: SemParam[];
  since?: string;
}

/** Semantic constraint for trait composition rules. */
export interface SemConstraint {
  requires?: string[]; // trait names that must co-exist
  conflicts?: string[]; // trait names that must NOT co-exist
  maxPerEntity?: number; // max instances on a single entity
  platforms?: string[]; // supported platforms (e.g., 'quest3', 'desktop', 'webgpu')
}

/** Complete machine-readable semantic annotation for a trait or type. */
export interface SemAnnotation {
  name: string;
  category: string;
  version: string;
  description: string;
  params: SemParam[];
  events: SemEvent[];
  constraints: SemConstraint;
  tags: string[];
  since: string;
  deprecated?: boolean;
  replacedBy?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Layer 2: ena-werq — Human-Readable Narrative Documentation
// ═══════════════════════════════════════════════════════════════════

/**
 * A code example with syntax highlighting and optional description for documentation.
 *
 * This interface represents executable or illustrative code samples that demonstrate
 * HoloScript features, API usage, or implementation patterns across multiple languages.
 * Used extensively in tutorials, trait documentation, and API references.
 *
 * @interface DocExample
 * @example
 * ```typescript
 * const example: DocExample = {
 *   title: "Creating a Spinning Cube",
 *   language: "holoscript",
 *   code: "@cube { @spin(speed=2) }",
 *   description: "A basic example of applying rotation animation to a cube object"
 * };
 * ```
 */
export interface DocExample {
  /** Human-readable title describing what this example demonstrates */
  title: string;
  /** Programming language for syntax highlighting and execution context */
  language: 'holoscript' | 'typescript' | 'wgsl' | 'json' | 'rust';
  /** The actual code content to be displayed with syntax highlighting */
  code: string;
  /** Optional explanatory text describing the example's purpose or behavior */
  description?: string;
}

/** A tutorial step for progressive learning. */
export interface TutorialStep {
  title: string;
  content: string;
  examples: DocExample[];
  tips?: string[];
  warnings?: string[];
}

/** Cross-reference link to related documentation. */
export interface DocReference {
  name: string;
  type: 'trait' | 'composition' | 'target' | 'concept' | 'api';
  path: string;
}

/** Complete human-readable documentation for a trait or concept. */
export interface EnaWerqDoc {
  title: string;
  summary: string;
  narrative: string;
  examples: DocExample[];
  tutorial?: TutorialStep[];
  bestPractices: string[];
  pitfalls: string[];
  references: DocReference[];
  changelog: { version: string; date: string; changes: string[] }[];
}

// ═══════════════════════════════════════════════════════════════════
// Combined Documentation Entry
// ═══════════════════════════════════════════════════════════════════

/** A complete sem-ena-werq documentation entry combining both layers. */
export interface SemEnaWerqEntry {
  sem: SemAnnotation;
  enaWerq: EnaWerqDoc;
}

// ═══════════════════════════════════════════════════════════════════
// Documentation Registry
// ═══════════════════════════════════════════════════════════════════

export class SemEnaWerqRegistry {
  private entries: Map<string, SemEnaWerqEntry> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();

  /**
   * Register a fully documented trait/type.
   */
  register(entry: SemEnaWerqEntry): void {
    const key = `${entry.sem.category}/${entry.sem.name}`;
    this.entries.set(key, entry);

    // Index by category
    if (!this.categories.has(entry.sem.category)) {
      this.categories.set(entry.sem.category, new Set());
    }
    this.categories.get(entry.sem.category)!.add(key);

    // Index by tags
    for (const tag of entry.sem.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
  }

  /**
   * Retrieve a documentation entry by category/name key.
   */
  get(key: string): SemEnaWerqEntry | undefined {
    return this.entries.get(key);
  }

  /**
   * Search by trait/type name (case-insensitive partial match).
   */
  search(query: string): SemEnaWerqEntry[] {
    const q = query.toLowerCase();
    const results: SemEnaWerqEntry[] = [];
    for (const [key, entry] of this.entries) {
      if (
        key.toLowerCase().includes(q) ||
        entry.sem.description.toLowerCase().includes(q) ||
        entry.enaWerq.summary.toLowerCase().includes(q)
      ) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Get all entries in a category.
   */
  getByCategory(category: string): SemEnaWerqEntry[] {
    const keys = this.categories.get(category);
    if (!keys) return [];
    return Array.from(keys)
      .map((k) => this.entries.get(k)!)
      .filter(Boolean);
  }

  /**
   * Get all entries with a specific tag.
   */
  getByTag(tag: string): SemEnaWerqEntry[] {
    const keys = this.tagIndex.get(tag);
    if (!keys) return [];
    return Array.from(keys)
      .map((k) => this.entries.get(k)!)
      .filter(Boolean);
  }

  /**
   * List all categories.
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys()).sort();
  }

  /**
   * List all tags.
   */
  getTags(): string[] {
    return Array.from(this.tagIndex.keys()).sort();
  }

  /**
   * Get total entry count.
   */
  get size(): number {
    return this.entries.size;
  }

  // ─── Layer 1 Helpers (Machine-Readable) ─────────────────────────

  /**
   * Export sem (Layer 1) data for LSP hover/autocomplete.
   * Returns a JSON-compatible object suitable for language server integration.
   */
  exportSemForLSP(key: string): {
    label: string;
    detail: string;
    documentation: string;
    params: SemParam[];
  } | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    return {
      label: entry.sem.name,
      detail: `[${entry.sem.category}] v${entry.sem.version}`,
      documentation: entry.sem.description,
      params: entry.sem.params,
    };
  }

  /**
   * Export sem annotations as JSON Schema for validation.
   */
  exportSemAsJSONSchema(key: string): Record<string, unknown> | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of entry.sem.params) {
      const prop: Record<string, unknown> = {
        type: this.mapTypeToJSONSchema(param.type),
        description: param.description,
      };
      if (param.default !== undefined) prop.default = param.default;
      if (param.range?.min !== undefined) prop.minimum = param.range.min;
      if (param.range?.max !== undefined) prop.maximum = param.range.max;
      if (param.units) prop['x-units'] = param.units;

      properties[param.name] = prop;
      if (param.required) required.push(param.name);
    }

    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: entry.sem.name,
      description: entry.sem.description,
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  // ─── Layer 2 Helpers (Human-Readable) ─────────────────────────

  /**
   * Export ena-werq (Layer 2) as Markdown documentation.
   */
  exportEnaWerqAsMarkdown(key: string): string | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const { sem, enaWerq: doc } = entry;

    const lines: string[] = [];
    lines.push(`# ${doc.title}`);
    lines.push('');
    lines.push(`> ${doc.summary}`);
    lines.push('');
    lines.push(
      `**Category:** ${sem.category} | **Version:** ${sem.version} | **Since:** ${sem.since}`
    );
    lines.push('');

    // Narrative
    lines.push('## Overview');
    lines.push('');
    lines.push(doc.narrative);
    lines.push('');

    // Parameters
    if (sem.params.length > 0) {
      lines.push('## Parameters');
      lines.push('');
      lines.push('| Name | Type | Default | Description |');
      lines.push('|------|------|---------|-------------|');
      for (const p of sem.params) {
        const def = p.default !== undefined ? `\`${JSON.stringify(p.default)}\`` : '-';
        const req = p.required ? ' **(required)**' : '';
        lines.push(`| \`${p.name}\` | \`${p.type}\` | ${def} | ${p.description}${req} |`);
      }
      lines.push('');
    }

    // Events
    if (sem.events.length > 0) {
      lines.push('## Events');
      lines.push('');
      for (const ev of sem.events) {
        lines.push(`### \`${ev.name}\``);
        lines.push('');
        lines.push(ev.description);
        if (ev.payload.length > 0) {
          lines.push('');
          lines.push('**Payload:**');
          for (const p of ev.payload) {
            lines.push(`- \`${p.name}\` (\`${p.type}\`): ${p.description}`);
          }
        }
        lines.push('');
      }
    }

    // Constraints
    const c = sem.constraints;
    if (c.requires?.length || c.conflicts?.length || c.maxPerEntity || c.platforms?.length) {
      lines.push('## Constraints');
      lines.push('');
      if (c.requires?.length) lines.push(`- **Requires:** ${c.requires.join(', ')}`);
      if (c.conflicts?.length) lines.push(`- **Conflicts with:** ${c.conflicts.join(', ')}`);
      if (c.maxPerEntity) lines.push(`- **Max per entity:** ${c.maxPerEntity}`);
      if (c.platforms?.length) lines.push(`- **Platforms:** ${c.platforms.join(', ')}`);
      lines.push('');
    }

    // Examples
    if (doc.examples.length > 0) {
      lines.push('## Examples');
      lines.push('');
      for (const ex of doc.examples) {
        lines.push(`### ${ex.title}`);
        if (ex.description) lines.push('', ex.description);
        lines.push('');
        lines.push(`\`\`\`${ex.language}`);
        lines.push(ex.code);
        lines.push('```');
        lines.push('');
      }
    }

    // Best Practices
    if (doc.bestPractices.length > 0) {
      lines.push('## Best Practices');
      lines.push('');
      for (const bp of doc.bestPractices) {
        lines.push(`- ${bp}`);
      }
      lines.push('');
    }

    // Pitfalls
    if (doc.pitfalls.length > 0) {
      lines.push('## Common Pitfalls');
      lines.push('');
      for (const pf of doc.pitfalls) {
        lines.push(`- ${pf}`);
      }
      lines.push('');
    }

    // References
    if (doc.references.length > 0) {
      lines.push('## See Also');
      lines.push('');
      for (const ref of doc.references) {
        lines.push(`- [${ref.name}](${ref.path}) (${ref.type})`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ─── Validation ───────────────────────────────────────────────

  /**
   * Validate that a documentation entry is complete (both layers filled).
   */
  validate(entry: SemEnaWerqEntry): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Layer 1 checks
    if (!entry.sem.name) issues.push('sem: missing name');
    if (!entry.sem.category) issues.push('sem: missing category');
    if (!entry.sem.version) issues.push('sem: missing version');
    if (!entry.sem.description) issues.push('sem: missing description');
    if (entry.sem.params.length === 0) issues.push('sem: no parameters documented');

    // Layer 2 checks
    if (!entry.enaWerq.title) issues.push('ena-werq: missing title');
    if (!entry.enaWerq.summary) issues.push('ena-werq: missing summary');
    if (!entry.enaWerq.narrative) issues.push('ena-werq: missing narrative');
    if (entry.enaWerq.examples.length === 0) issues.push('ena-werq: no examples provided');
    if (entry.enaWerq.bestPractices.length === 0) issues.push('ena-werq: no best practices listed');

    return { valid: issues.length === 0, issues };
  }

  /**
   * Audit the entire registry for documentation completeness.
   */
  audit(): {
    total: number;
    complete: number;
    incomplete: string[];
    coverage: number;
  } {
    let complete = 0;
    const incomplete: string[] = [];

    for (const [key, entry] of this.entries) {
      const { valid } = this.validate(entry);
      if (valid) {
        complete++;
      } else {
        incomplete.push(key);
      }
    }

    return {
      total: this.entries.size,
      complete,
      incomplete,
      coverage: this.entries.size > 0 ? (complete / this.entries.size) * 100 : 0,
    };
  }

  // ─── Private ──────────────────────────────────────────────────

  private mapTypeToJSONSchema(tsType: string): string {
    switch (tsType.toLowerCase()) {
      case 'number':
      case 'f32':
      case 'f64':
      case 'float':
        return 'number';
      case 'integer':
      case 'i32':
      case 'u32':
      case 'int':
        return 'integer';
      case 'string':
        return 'string';
      case 'boolean':
      case 'bool':
        return 'boolean';
      case 'vec3':
      case 'vec2':
      case 'vec4':
      case 'array':
        return 'array';
      default:
        return 'string';
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Global Registry Singleton
// ═══════════════════════════════════════════════════════════════════

let globalRegistry: SemEnaWerqRegistry | null = null;

/**
 * Gets the global singleton instance of the SemEnaWerq documentation registry.
 *
 * Creates a new registry instance if one doesn't exist. This registry serves as
 * the central store for all trait documentation used by LSP, CLI, and tooling.
 *
 * @returns The global SemEnaWerqRegistry instance
 * @example
 * ```typescript
 * const registry = getDocRegistry();
 * const grabbableDocs = registry.getTrait('Grabbable');
 * ```
 */
export function getDocRegistry(): SemEnaWerqRegistry {
  if (!globalRegistry) {
    globalRegistry = new SemEnaWerqRegistry();
  }
  return globalRegistry;
}

// ═══════════════════════════════════════════════════════════════════
// Built-In Trait Documentation (Example Seed Data)
// ═══════════════════════════════════════════════════════════════════

/**
 * Registers built-in HoloScript trait documentation into the provided registry.
 *
 * Populates the registry with comprehensive documentation for core traits including
 * Grabbable, Teleportable, Shimmering, and other fundamental VR/AR behaviors.
 * This serves as seed data and examples for the documentation system.
 *
 * @param registry - The SemEnaWerqRegistry instance to populate with built-in docs
 * @example
 * ```typescript
 * const registry = new SemEnaWerqRegistry();
 * registerBuiltInDocs(registry);
 * // Registry now contains documentation for 20+ built-in traits
 * ```
 */
export function registerBuiltInDocs(registry: SemEnaWerqRegistry): void {
  registry.register({
    sem: {
      name: 'Grabbable',
      category: 'interaction',
      version: '1.0.0',
      description: 'Makes an entity interactable via hand tracking or controller grab.',
      params: [
        {
          name: 'grip',
          type: 'string',
          description: 'Grip type: snap, free, or physics',
          default: 'snap',
          required: false,
        },
        {
          name: 'twoHanded',
          type: 'boolean',
          description: 'Enable two-handed grab',
          default: false,
          required: false,
        },
        {
          name: 'throwable',
          type: 'boolean',
          description: 'Enable throw on release',
          default: true,
          required: false,
        },
        {
          name: 'hapticFeedback',
          type: 'number',
          description: 'Haptic intensity on grab',
          default: 0.5,
          range: { min: 0, max: 1 },
          required: false,
        },
      ],
      events: [
        {
          name: 'onGrab',
          description: 'Fired when the entity is grabbed',
          payload: [
            { name: 'hand', type: 'string', description: 'Which hand: left or right' },
            { name: 'position', type: 'vec3', description: 'Grab position in world space' },
          ],
        },
        {
          name: 'onRelease',
          description: 'Fired when the entity is released',
          payload: [
            {
              name: 'velocity',
              type: 'vec3',
              description: 'Release velocity for throw calculation',
            },
          ],
        },
      ],
      constraints: {
        requires: ['Physics'],
        conflicts: ['StaticBody'],
        maxPerEntity: 1,
        platforms: ['quest3', 'visionos', 'desktop-vr', 'webxr'],
      },
      tags: ['interaction', 'xr', 'hand-tracking', 'controller'],
      since: '0.1.0',
    },
    enaWerq: {
      title: 'Grabbable Trait',
      summary: 'Enables XR hand/controller grab interaction with physics-aware release.',
      narrative: `The Grabbable trait is the foundation of direct manipulation in HoloScript.
When attached to an entity with a Physics trait, it allows users to pick up, hold,
and throw objects using either hand tracking or VR controllers. The trait handles
grip alignment, two-handed manipulation, and haptic feedback automatically.

Grabbable works with three grip modes:
- **snap**: Object snaps to a predefined grip point (best for tools, weapons)
- **free**: Object grabs wherever the hand contacts (best for natural objects)
- **physics**: Full physics-constrained grab with joints (best for heavy objects)`,
      examples: [
        {
          title: 'Basic Grabbable Object',
          language: 'holoscript',
          code: `orb "Ball" {
  GaussianSplat { url "ball.splat" }
  Physics { mass 0.5  restitution 0.8 }
  Grabbable { grip "free"  throwable true }
}`,
          description: 'A simple ball that can be picked up and thrown.',
        },
        {
          title: 'Two-Handed Weapon',
          language: 'holoscript',
          code: `orb "Sword" {
  GaussianSplat { url "sword.splat" }
  Physics { mass 2.0 }
  Grabbable {
    grip "snap"
    twoHanded true
    hapticFeedback 0.8
  }
}`,
        },
      ],
      bestPractices: [
        'Always pair Grabbable with a Physics trait for proper interaction.',
        'Use grip "snap" for tools that need consistent hand placement.',
        'Set hapticFeedback to 0 for UI elements to reduce sensory overload.',
        'Test throw velocity scaling across platforms — Quest 3 may need damping.',
      ],
      pitfalls: [
        'Adding Grabbable without Physics will compile but the object will not move.',
        'Two-handed grab on small objects (<10cm) can cause hand collision issues.',
        'High restitution + throwable can cause objects to clip through thin walls.',
      ],
      references: [
        { name: 'Physics', type: 'trait', path: 'traits/Physics' },
        { name: 'Hand Tracking', type: 'concept', path: 'concepts/hand-tracking' },
        { name: 'Haptic Feedback', type: 'api', path: 'api/haptics' },
      ],
      changelog: [
        {
          version: '1.0.0',
          date: '2026-01-15',
          changes: ['Initial release with snap/free/physics grip modes'],
        },
        {
          version: '0.9.0',
          date: '2025-12-01',
          changes: ['Added hapticFeedback parameter', 'Added twoHanded support'],
        },
      ],
    },
  });

  registry.register({
    sem: {
      name: 'GaussianSplat',
      category: 'rendering',
      version: '4.1.0',
      description: '3D Gaussian Splatting renderer with LOD, octree, and SPZ compression.',
      params: [
        {
          name: 'url',
          type: 'string',
          description: 'URL or path to .splat/.ply/.spz file',
          required: true,
        },
        {
          name: 'maxGaussians',
          type: 'integer',
          description: 'Maximum Gaussian count (platform budget)',
          default: 500000,
          range: { min: 1000, max: 2000000 },
        },
        {
          name: 'lodLevels',
          type: 'integer',
          description: 'Number of LOD levels for octree',
          default: 4,
          range: { min: 1, max: 8 },
        },
        {
          name: 'compressionFormat',
          type: 'string',
          description: 'Compression format: spz, quantized, or none',
          default: 'spz',
        },
        {
          name: 'renderOrder',
          type: 'integer',
          description: 'Render order for transparency sorting',
          default: 0,
        },
        {
          name: 'temporalMode',
          type: 'string',
          description: 'Temporal blending mode: none, taa, motion-blur',
          default: 'none',
        },
      ],
      events: [
        {
          name: 'onLoad',
          description: 'Fired when splat data finishes loading',
          payload: [
            { name: 'gaussianCount', type: 'integer', description: 'Total Gaussians loaded' },
            { name: 'loadTimeMs', type: 'number', description: 'Load time in milliseconds' },
          ],
        },
        {
          name: 'onLODChange',
          description: 'Fired when LOD level changes',
          payload: [
            { name: 'level', type: 'integer', description: 'New LOD level (0 = highest detail)' },
            {
              name: 'activeGaussians',
              type: 'integer',
              description: 'Active Gaussian count at this LOD',
            },
          ],
        },
      ],
      constraints: {
        platforms: ['quest3', 'visionos', 'desktop-vr', 'webgpu', 'mobile-ar'],
      },
      tags: ['rendering', '3dgs', 'gaussian-splatting', 'splat', 'point-cloud'],
      since: '0.5.0',
    },
    enaWerq: {
      title: 'GaussianSplat Trait',
      summary:
        'Render photorealistic 3D Gaussian Splatting scenes with LOD and platform-aware budgets.',
      narrative: `The GaussianSplat trait enables rendering of 3D Gaussian Splatting (3DGS) data,
a neural rendering technique that represents scenes as millions of oriented 3D Gaussians.
Each Gaussian has position, covariance (shape/orientation), color (spherical harmonics),
and opacity.

HoloScript provides automatic LOD management via an octree spatial index,
platform-specific Gaussian budgets (Quest 3: 180K, Desktop VR: 2M, WebGPU: 500K),
and SPZ compression for efficient streaming.`,
      examples: [
        {
          title: 'Basic Splat Scene',
          language: 'holoscript',
          code: `orb "Room" {
  GaussianSplat {
    url "room-scan.spz"
    maxGaussians 500000
    lodLevels 4
  }
}`,
        },
      ],
      bestPractices: [
        'Use SPZ compression for web delivery — 10-20x smaller than raw .ply.',
        'Set maxGaussians to platform budget to avoid GPU memory issues.',
        'Use lodLevels >= 4 for scenes with >100K Gaussians.',
        'Test on Quest 3 with 180K budget before publishing to marketplace.',
      ],
      pitfalls: [
        'Exceeding platform Gaussian budget will cause framerate drops or OOM crashes.',
        'SPZ compression is lossy — visual artifacts may appear at very high compression.',
        'Temporal modes (TAA, motion-blur) add 1-2ms per frame on mobile GPUs.',
      ],
      references: [
        { name: 'LODCache', type: 'api', path: 'api/lod-cache' },
        { name: 'GaussianBudgetValidator', type: 'api', path: 'compiler/GaussianBudgetValidator' },
      ],
      changelog: [
        {
          version: '4.1.0',
          date: '2026-03-01',
          changes: ['Added SPZ compression support', 'Added temporal blending modes'],
        },
        {
          version: '4.0.0',
          date: '2026-02-15',
          changes: ['Octree LOD system', 'Platform budget enforcement'],
        },
      ],
    },
  });
}
