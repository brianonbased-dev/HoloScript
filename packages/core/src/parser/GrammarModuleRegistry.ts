/**
 * Grammar Module Registry — horizontal expansion for parser-side sub-modules
 *
 * Mirrors `compiler/DialectRegistry.ts` (the working, in-repo pattern that already
 * solves horizontal-expansion-without-a-hand-edited-switch on the COMPILE-TARGET
 * side). The parser side never got equivalent treatment — new lightweight `.hs`
 * sub-parsers (knowledge blocks, prompt files, server route files, ...) had to be
 * hand-imported wherever they were needed instead of self-registering.
 *
 * This is a small, focused proof-slice: register(descriptor) with duplicate-name
 * rejection, plus a minimal lookup surface. It is proportionate to proving the
 * pattern on ONE module (HSKnowledgeParser) — it does not build speculative
 * infrastructure (no lowering-pipeline machinery, no risk tiers) for grammar
 * modules that do not exist yet. If/when more `.hs` sub-parsers want to register,
 * extend this registry the way DialectRegistry grew — not by inventing a second,
 * divergent registry shape.
 *
 * Deliberately NOT touched here: the 6753-line parser/HoloScriptPlusParser.ts core
 * itself. That decomposition is Phase 2, out of scope for this proof-slice.
 *
 * @example
 * ```typescript
 * GrammarModuleRegistry.register({
 *   name: 'hs-knowledge',
 *   description: 'Lightweight regex parser for .hs knowledge/prompt/server files',
 *   parse: (source) => parseKnowledge(source),
 * });
 *
 * const mod = GrammarModuleRegistry.get('hs-knowledge');
 * ```
 */

/** Grammar module registration descriptor */
export interface GrammarModuleDescriptor {
  /** Unique module name (used as registry key) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Reference to the actual parse function or class for this module */
  parse: (source: string) => unknown;
}

/** Read-only grammar module info (safe for discovery) */
export interface GrammarModuleInfo {
  name: string;
  description: string;
}

// ── Registry ─────────────────────────────────────────────────────────────────

class GrammarModuleRegistryImpl {
  private modules = new Map<string, GrammarModuleDescriptor>();

  /**
   * Register a new grammar module.
   * @throws Error if a module with the same name already exists
   */
  register(descriptor: GrammarModuleDescriptor): void {
    if (this.modules.has(descriptor.name)) {
      throw new Error(
        `Grammar module "${descriptor.name}" is already registered. ` +
          `Use GrammarModuleRegistry.override() to replace an existing module.`
      );
    }
    this.modules.set(descriptor.name, descriptor);
  }

  /**
   * Override an existing grammar module registration.
   */
  override(descriptor: GrammarModuleDescriptor): void {
    this.modules.set(descriptor.name, descriptor);
  }

  /**
   * Unregister a grammar module.
   */
  unregister(name: string): boolean {
    return this.modules.delete(name);
  }

  /**
   * Check if a grammar module is registered.
   */
  has(name: string): boolean {
    return this.modules.has(name);
  }

  /**
   * Get a registered grammar module descriptor (includes the callable parse fn).
   */
  get(name: string): GrammarModuleDescriptor | undefined {
    return this.modules.get(name);
  }

  /**
   * Parse source using a registered grammar module.
   * @throws Error if module not found
   */
  parseWith(name: string, source: string): unknown {
    const desc = this.modules.get(name);
    if (!desc) {
      const available = [...this.modules.keys()].join(', ');
      throw new Error(`Unknown grammar module "${name}". Available: ${available}`);
    }
    return desc.parse(source);
  }

  /**
   * List all registered grammar modules (discovery info only, no parse fn).
   */
  list(): GrammarModuleInfo[] {
    return [...this.modules.values()].map((desc) => ({
      name: desc.name,
      description: desc.description,
    }));
  }

  /**
   * Get all registered grammar module names.
   */
  names(): string[] {
    return [...this.modules.keys()];
  }

  /**
   * Get count of registered grammar modules.
   */
  get size(): number {
    return this.modules.size;
  }
}

/** Singleton grammar module registry */
export const GrammarModuleRegistry = new GrammarModuleRegistryImpl();

// Note on boot strategy (deliberately simpler than DialectRegistry's
// ensureDialectsBooted() + registerBuiltinDialects() indirection): with only
// ONE grammar module registered today (HSKnowledgeParser, self-registering at
// its own import time — see bottom of HSKnowledgeParser.ts), a separate
// registerBuiltinGrammarModules() boot-list file would be speculative
// infrastructure for modules that don't exist yet. If/when a second grammar
// module is added, promote to a DialectRegistry-style boot-list at that point
// rather than before.
