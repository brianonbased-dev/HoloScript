/**
 * TypeAliasRegistry
 *
 * Stores and resolves `type` alias declarations:
 *
 *   type Color = string | number[]
 *   type List<T> = T[]
 *   type Handler = () => void
 *
 * Supports:
 * - Simple aliases:  type Pos = [number, number, number]
 * - Union aliases:   type State = "idle" | "loading" | "error"
 * - Generic aliases: type Optional<T> = T | null
 * - Recursive detection (prevents infinite expansion)
 */

import type { TypeAliasDeclaration, TypeAliasKind } from '../types';

export interface ResolvedAlias {
  name: string;
  kind: TypeAliasKind;
  /** Fully expanded definition with type params substituted */
  expanded: string;
  /** Whether the alias is generic */
  isGeneric: boolean;
  typeParams: string[];
}

export class TypeAliasRegistry {
  private aliases: Map<string, TypeAliasDeclaration> = new Map();
  /** Tracks which aliases are currently being expanded (cycle detection) */
  private expanding: Set<string> = new Set();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  register(decl: TypeAliasDeclaration): void {
    this.aliases.set(decl.name, decl);
  }

  has(name: string): boolean {
    return this.aliases.has(name);
  }

  get(name: string): TypeAliasDeclaration | undefined {
    return this.aliases.get(name);
  }

  all(): TypeAliasDeclaration[] {
    return Array.from(this.aliases.values());
  }

  clear(): void {
    this.aliases.clear();
    this.expanding.clear();
  }

  // ---------------------------------------------------------------------------
  // Parsing helper (parses a `type Foo = ...` source line)
  // ---------------------------------------------------------------------------

  /**
   * Parse a type alias declaration from source text.
   * Recognises:
   *   type Name = definition
   *   type Name<T, U> = definition
   */
  static parse(source: string, line?: number): TypeAliasDeclaration | null {
    // Match: type Name<Params> = definition
    const match = source.match(
      /^\s*type\s+([A-Z][A-Za-z0-9_]*)(?:<([^>]+)>)?\s*=\s*(.+)$/
    );
    if (!match) return null;

    const name = match[1];
    const rawParams = match[2];
    const definition = match[3].trim();

    const typeParams = rawParams
      ? rawParams.split(',').map((p) => p.trim()).filter(Boolean)
      : [];

    const isUnion = definition.includes('|');
    const kind: TypeAliasKind =
      typeParams.length > 0 ? 'generic' : isUnion ? 'union' : 'simple';

    return { name, kind, definition, typeParams, line };
  }

  // ---------------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve an alias by name, substituting type params if provided.
   * Returns null if unknown or recursive.
   *
   * Example:
   *   registry.resolve('Optional', ['string'])
   *   → 'string | null'
   */
  resolve(name: string, typeArgs: string[] = []): string | null {
    if (this.expanding.has(name)) {
      // Recursive type detected — return the name itself as a sentinel
      return null;
    }

    const decl = this.aliases.get(name);
    if (!decl) return null;

    // Direct self-reference check (e.g. type Loop = Loop[])
    if (this.containsAlias(decl.definition, name)) {
      return null;
    }

    this.expanding.add(name);
    try {
      let expanded = decl.definition;

      // Substitute type params (always run; unmatched params fall back to 'any')
      if (decl.typeParams && decl.typeParams.length > 0) {
        for (let i = 0; i < decl.typeParams.length; i++) {
          const param = decl.typeParams[i];
          const arg = typeArgs[i] ?? 'any';
          expanded = expanded.replace(new RegExp(`\\b${param}\\b`, 'g'), arg);
        }
      }

      // Recursively expand any alias references in the definition
      expanded = this.expandReferences(expanded);

      return expanded;
    } finally {
      this.expanding.delete(name);
    }
  }

  /**
   * Detect recursive/self-referential type aliases.
   */
  isRecursive(name: string): boolean {
    const decl = this.aliases.get(name);
    if (!decl) return false;

    this.expanding.add(name);
    const result = this.containsAlias(decl.definition, name);
    this.expanding.delete(name);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private expandReferences(definition: string): string {
    // Replace alias names that appear as words in the definition
    let result = definition;
    for (const [aliasName, decl] of this.aliases) {
      if (this.expanding.has(aliasName)) continue; // Skip circular
      const pattern = new RegExp(`\\b${aliasName}\\b`, 'g');
      if (pattern.test(result)) {
        const resolved = this.resolve(aliasName);
        if (resolved) {
          result = result.replace(new RegExp(`\\b${aliasName}\\b`, 'g'), `(${resolved})`);
        }
      }
    }
    return result;
  }

  private containsAlias(definition: string, targetName: string): boolean {
    const pattern = new RegExp(`\\b${targetName}\\b`);
    return pattern.test(definition);
  }
}
