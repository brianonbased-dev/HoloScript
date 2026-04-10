/**
 * Deprecation Registry
 *
 * Sprint 5 Priority 2: Deprecation Warnings
 *
 * Central registry for tracking deprecated APIs, traits, and syntax.
 * Provides migration hints and replacement suggestions.
 *
 * @version 1.0.0
 */

/**
 * Deprecation severity levels
 */
export type DeprecationSeverity = 'warning' | 'error' | 'info';

/**
 * Deprecation entry
 */
export interface DeprecationEntry {
  /** Unique identifier for the deprecation */
  id: string;
  /** Type of deprecated item */
  type: 'trait' | 'property' | 'function' | 'syntax' | 'api' | 'keyword';
  /** Name of the deprecated item */
  name: string;
  /** Human-readable deprecation message */
  message: string;
  /** Suggested replacement */
  replacement?: string;
  /** Version when deprecated */
  since?: string;
  /** Version when it will be removed */
  removeIn?: string;
  /** Detailed migration guide */
  migrationGuide?: string;
  /** Link to documentation */
  documentationUrl?: string;
  /** Severity level */
  severity: DeprecationSeverity;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Deprecation match result
 */
export interface DeprecationMatch {
  entry: DeprecationEntry;
  location?: {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  };
  context?: string;
}

/**
 * Deprecation Registry
 *
 * Manages a centralized registry of deprecated items and provides
 * lookup functionality.
 */
export class DeprecationRegistry {
  private entries: Map<string, DeprecationEntry> = new Map();
  private traitEntries: Map<string, DeprecationEntry> = new Map();
  private propertyEntries: Map<string, DeprecationEntry> = new Map();
  private functionEntries: Map<string, DeprecationEntry> = new Map();
  private syntaxPatterns: Array<{ pattern: RegExp; entry: DeprecationEntry }> = [];

  constructor() {
    this.registerBuiltInDeprecations();
  }

  /**
   * Register a deprecation entry
   */
  register(entry: DeprecationEntry): void {
    this.entries.set(entry.id, entry);

    // Index by type for fast lookup
    switch (entry.type) {
      case 'trait':
        this.traitEntries.set(entry.name, entry);
        break;
      case 'property':
        this.propertyEntries.set(entry.name, entry);
        break;
      case 'function':
        this.functionEntries.set(entry.name, entry);
        break;
      case 'syntax':
        // Syntax deprecations use pattern matching
        if (entry.metadata?.pattern instanceof RegExp) {
          this.syntaxPatterns.push({
            pattern: entry.metadata.pattern,
            entry,
          });
        }
        break;
    }
  }

  /**
   * Check if a trait is deprecated
   */
  isTraitDeprecated(name: string): DeprecationEntry | undefined {
    return this.traitEntries.get(name);
  }

  /**
   * Check if a property is deprecated
   */
  isPropertyDeprecated(name: string): DeprecationEntry | undefined {
    return this.propertyEntries.get(name);
  }

  /**
   * Check if a function is deprecated
   */
  isFunctionDeprecated(name: string): DeprecationEntry | undefined {
    return this.functionEntries.get(name);
  }

  /**
   * Check source against syntax deprecations
   */
  checkSyntax(source: string): DeprecationMatch[] {
    const matches: DeprecationMatch[] = [];

    for (const { pattern, entry } of this.syntaxPatterns) {
      const lines = source.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(line)) !== null) {
          matches.push({
            entry,
            location: {
              line: i + 1,
              column: match.index + 1,
              endColumn: match.index + match[0].length + 1,
            },
            context: match[0],
          });
        }
      }
    }

    return matches;
  }

  /**
   * Get all registered deprecations
   */
  getAll(): DeprecationEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get deprecation by ID
   */
  get(id: string): DeprecationEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Get all deprecated traits
   */
  getDeprecatedTraits(): DeprecationEntry[] {
    return Array.from(this.traitEntries.values());
  }

  /**
   * Get all deprecated properties
   */
  getDeprecatedProperties(): DeprecationEntry[] {
    return Array.from(this.propertyEntries.values());
  }

  /**
   * Get all deprecated functions
   */
  getDeprecatedFunctions(): DeprecationEntry[] {
    return Array.from(this.functionEntries.values());
  }

  /**
   * Clear all entries (useful for testing)
   */
  clear(): void {
    this.entries.clear();
    this.traitEntries.clear();
    this.propertyEntries.clear();
    this.functionEntries.clear();
    this.syntaxPatterns = [];
  }

  /**
   * Register built-in deprecations for HoloScript
   */
  private registerBuiltInDeprecations(): void {
    // Deprecated traits
    this.register({
      id: 'trait-talkable',
      type: 'trait',
      name: 'talkable',
      message: 'The @talkable trait is deprecated',
      replacement: '@voice',
      since: '2.0.0',
      removeIn: '3.0.0',
      migrationGuide: 'Replace @talkable with @voice for better audio API integration',
      severity: 'warning',
    });

    this.register({
      id: 'trait-collision',
      type: 'trait',
      name: 'collision',
      message: 'The @collision trait is deprecated',
      replacement: '@physics or @trigger',
      since: '2.0.0',
      removeIn: '3.0.0',
      migrationGuide: 'Use @physics for physical collisions or @trigger for non-physical events',
      severity: 'warning',
    });

    this.register({
      id: 'trait-interactive',
      type: 'trait',
      name: 'interactive',
      message: 'The @interactive trait is deprecated',
      replacement: '@grabbable, @pointable, or @hoverable',
      since: '2.1.0',
      removeIn: '3.0.0',
      migrationGuide: 'Use specific interaction traits for better control',
      severity: 'warning',
    });

    this.register({
      id: 'trait-collidable',
      type: 'trait',
      name: 'collidable',
      message: 'The @collidable trait is deprecated',
      replacement: '@physics',
      since: '2.0.0',
      removeIn: '3.0.0',
      migrationGuide: 'Use @physics with collision options',
      severity: 'warning',
    });

    // Deprecated properties
    this.register({
      id: 'prop-old-position',
      type: 'property',
      name: 'pos',
      message: 'The "pos" property is deprecated',
      replacement: 'position',
      since: '2.0.0',
      removeIn: '3.0.0',
      migrationGuide: 'Rename "pos" to "position" for consistency',
      severity: 'warning',
    });

    this.register({
      id: 'prop-old-rotation',
      type: 'property',
      name: 'rot',
      message: 'The "rot" property is deprecated',
      replacement: 'rotation',
      since: '2.0.0',
      removeIn: '3.0.0',
      migrationGuide: 'Rename "rot" to "rotation" for consistency',
      severity: 'warning',
    });

    this.register({
      id: 'prop-old-scale',
      type: 'property',
      name: 'scl',
      message: 'The "scl" property is deprecated',
      replacement: 'scale',
      since: '2.0.0',
      removeIn: '3.0.0',
      migrationGuide: 'Rename "scl" to "scale" for consistency',
      severity: 'warning',
    });

    this.register({
      id: 'prop-texture',
      type: 'property',
      name: 'texture',
      message: 'The "texture" property is deprecated',
      replacement: 'material.map',
      since: '2.1.0',
      removeIn: '3.0.0',
      migrationGuide: 'Use material block with map property for textures',
      severity: 'warning',
    });

    // Deprecated functions
    this.register({
      id: 'func-spawn',
      type: 'function',
      name: 'spawn',
      message: 'The spawn() function is deprecated',
      replacement: 'create() or instantiate()',
      since: '2.0.0',
      removeIn: '3.0.0',
      migrationGuide: 'Use create() for simple objects or instantiate() for templates',
      severity: 'warning',
    });

    this.register({
      id: 'func-destroy',
      type: 'function',
      name: 'destroy',
      message: 'The destroy() function is deprecated',
      replacement: 'remove()',
      since: '2.0.0',
      removeIn: '3.0.0',
      migrationGuide: 'Use remove() for cleaner resource cleanup',
      severity: 'warning',
    });

    // Deprecated syntax patterns
    this.register({
      id: 'syntax-old-event',
      type: 'syntax',
      name: 'on_event syntax',
      message: 'The on_event() syntax is deprecated',
      replacement: '@on_* handlers',
      since: '2.0.0',
      removeIn: '3.0.0',
      migrationGuide: 'Use @on_click, @on_hover, etc. instead of on_event("click")',
      severity: 'warning',
      metadata: {
        pattern: /\bon_event\s*\(/g,
      },
    });

    this.register({
      id: 'syntax-object-keyword',
      type: 'syntax',
      name: 'object keyword',
      message: 'The "object" keyword is deprecated',
      replacement: 'orb',
      since: '2.0.0',
      removeIn: '3.0.0',
      migrationGuide: 'Use "orb" instead of "object" for 3D entities',
      severity: 'warning',
      metadata: {
        pattern: /\bobject\s+["']/g,
      },
    });

    this.register({
      id: 'syntax-var-keyword',
      type: 'syntax',
      name: 'var keyword',
      message: 'The "var" keyword is deprecated',
      replacement: 'const or let',
      since: '1.0.0',
      removeIn: '2.5.0',
      migrationGuide: 'Use "const" for constants and "let" for variables',
      severity: 'error',
      metadata: {
        pattern: /\bvar\s+/g,
      },
    });
  }
}

/**
 * Default global registry instance
 */
export const defaultRegistry = new DeprecationRegistry();

/**
 * Create a new registry (useful for testing or custom configurations)
 */
export function createDeprecationRegistry(): DeprecationRegistry {
  return new DeprecationRegistry();
}

/**
 * Register a deprecation in the default registry
 */
export function registerDeprecation(entry: DeprecationEntry): void {
  defaultRegistry.register(entry);
}

/**
 * Check if a trait is deprecated (using default registry)
 */
export function isTraitDeprecated(name: string): DeprecationEntry | undefined {
  return defaultRegistry.isTraitDeprecated(name);
}

/**
 * Check source for syntax deprecations (using default registry)
 */
export function checkSyntaxDeprecations(source: string): DeprecationMatch[] {
  return defaultRegistry.checkSyntax(source);
}
