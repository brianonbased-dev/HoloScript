/**
 * @fileoverview Cross-File Authority Symbol Graph — the round-3 symbol-table foundation
 * @module @holoscript/core/compiler/authority
 *
 * The merged cross-file symbol table that both deferred MMO round-3 seeds land on
 * (research/2026-06-15_mmo-next-round-advancement.md §5/§7; idea-seeds.md):
 *
 *   - P2.0  `ServerAuthorityBundleSplitter` — partition one source into an
 *           authoritative server bundle + a predicting client SDK, with a static
 *           proof that `@server_only` symbols are unreachable from client code.
 *   - P2.12 cross-file `ProvenanceBoundsChecker` — upgrade the 3 single-file
 *           caveated obligations (ability_spam, unvalidated_cast, info_leak) from
 *           "satisfied-with-caveat" to genuinely verified.
 *
 * "Build the symbol table once, and both land on top of it."
 *
 * DESIGN — soundness over reuse. This is deliberately NOT built on
 * `analysis/ReferenceGraph`: that pass is a heuristic, regex-based dead-code
 * detector (sound enough to flag an unused orb, NOT sound enough to back a
 * compile-time security proof — a false negative there is an info-leak hole that
 * would invalidate the verifiable-anti-cheat-by-construction claim). This graph is
 * populated from STRUCTURED compiler output and explicit semantic use-edges, never
 * by string-scanning bodies, so {@link AuthoritySymbolGraph.findViolations} is a
 * conservative over-approximation of "reachable" — it can only report MORE
 * reachability than truly exists, never less. That direction is the safe one for a
 * proof: it never claims a leak is absent when it is present.
 *
 * Pure, deterministic, no I/O.
 *
 * @version 1.0.0
 */

// =============================================================================
// PUBLIC TYPES
// =============================================================================

/**
 * Authority tier of a symbol, ordered most-restrictive → least-restrictive.
 * - `server_only`  — never leaves the server (RNG seed, loot rolls, cooldown
 *                    registry, boss-phase thresholds, validation logic).
 * - `server`       — server-authoritative but its existence/config is allowed to
 *                    be visible to the client (e.g. the max-move-speed cap a
 *                    client uses for prediction).
 * - `replicated`   — synced to clients over the wire (a `@type`-decorated field).
 * - `client`       — client-only (cosmetic/prediction surface).
 * - `unknown`      — tier not yet determined.
 */
export type AuthorityTier = 'server_only' | 'server' | 'replicated' | 'client' | 'unknown';

/** Kind of symbol the graph tracks, for diagnostics and partitioning. */
export type AuthoritySymbolKind =
  | 'ability'
  | 'authority_block'
  | 'brain'
  | 'loot_table'
  | 'world_layer'
  | 'schema_field'
  | 'registry'
  | 'constant'
  | 'room_method'
  | 'npc'
  | 'data_field';

/** A single symbol in the cross-file authority graph. */
export interface AuthoritySymbol {
  /**
   * Canonical, line-stable key: `${sourceFile}#${qualifier}.${name}` (or
   * `${sourceFile}#${name}` with no qualifier). Use {@link AuthoritySymbolGraph.keyFor}.
   */
  key: string;
  name: string;
  sourceFile: string;
  kind: AuthoritySymbolKind;
  tier: AuthorityTier;
  /**
   * True when this symbol is emitted onto the client-facing wire surface — e.g. a
   * `@type`-decorated Colyseus schema field. A `server_only` symbol that is also
   * `clientExposed` is an immediate leak, independent of reachability.
   */
  clientExposed?: boolean;
  /** Keys of symbols this symbol references (directed use-edges). */
  refs: Set<string>;
}

/** A detected authority violation: a server-only symbol the client can observe. */
export interface AuthorityViolation {
  symbol: AuthoritySymbol;
  /**
   * - `exposed`   — the symbol is replicated on the client wire surface.
   * - `reachable` — a client-bundle root transitively references it.
   */
  kind: 'exposed' | 'reachable';
  reason: string;
  /** client-root → … → server_only symbol (keys). Present for `reachable`. */
  path?: string[];
}

/** Server/client partition of the graph's symbols. */
export interface AuthorityPartition {
  /** Symbols that belong in the authoritative server bundle. */
  serverSet: AuthoritySymbol[];
  /** Symbols safe to ship in the client bundle (replicated/client + reachable). */
  clientSet: AuthoritySymbol[];
}

// =============================================================================
// TIER ORDERING
// =============================================================================

const TIER_RANK: Record<AuthorityTier, number> = {
  server_only: 4,
  server: 3,
  replicated: 2,
  client: 1,
  unknown: 0,
};

/** Returns the more-restrictive of two tiers (used when a symbol is re-declared). */
export function mostRestrictiveTier(a: AuthorityTier, b: AuthorityTier): AuthorityTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

// =============================================================================
// GRAPH
// =============================================================================

/** Input shape for {@link AuthoritySymbolGraph.addSymbol}. */
export interface AuthoritySymbolInput {
  key: string;
  name: string;
  sourceFile: string;
  kind: AuthoritySymbolKind;
  tier: AuthorityTier;
  clientExposed?: boolean;
  refs?: Iterable<string>;
}

/**
 * A cross-file symbol table tagged with authority tiers and use-edges, with a
 * sound "is this server-only symbol reachable from the client?" query.
 */
export class AuthoritySymbolGraph {
  private readonly symbols = new Map<string, AuthoritySymbol>();
  private readonly clientRoots = new Set<string>();

  /** Build a canonical, line-stable symbol key. */
  static keyFor(sourceFile: string, name: string, qualifier?: string): string {
    return qualifier ? `${sourceFile}#${qualifier}.${name}` : `${sourceFile}#${name}`;
  }

  /**
   * Add (or merge into) a symbol. Re-declaring an existing key merges its
   * use-edges, ORs `clientExposed`, and keeps the MORE restrictive tier — so two
   * partial views of the same symbol never weaken its classification.
   */
  addSymbol(input: AuthoritySymbolInput): AuthoritySymbol {
    const existing = this.symbols.get(input.key);
    if (existing) {
      existing.tier = mostRestrictiveTier(existing.tier, input.tier);
      existing.clientExposed = existing.clientExposed || input.clientExposed === true;
      if (input.refs) for (const r of input.refs) existing.refs.add(r);
      return existing;
    }
    const created: AuthoritySymbol = {
      key: input.key,
      name: input.name,
      sourceFile: input.sourceFile,
      kind: input.kind,
      tier: input.tier,
      clientExposed: input.clientExposed === true,
      refs: new Set(input.refs ?? []),
    };
    this.symbols.set(input.key, created);
    return created;
  }

  /** Add a directed use-edge `from → to`. The target need not exist yet. */
  addRef(fromKey: string, toKey: string): void {
    const from = this.symbols.get(fromKey);
    if (from) from.refs.add(toKey);
  }

  /** Mark a symbol as a client-bundle root (the client surface starts here). */
  markClientRoot(key: string): void {
    this.clientRoots.add(key);
  }

  get(key: string): AuthoritySymbol | undefined {
    return this.symbols.get(key);
  }

  has(key: string): boolean {
    return this.symbols.has(key);
  }

  /** All symbols, insertion-ordered. */
  all(): AuthoritySymbol[] {
    return [...this.symbols.values()];
  }

  /** Client-root keys that resolve to an existing symbol. */
  clientRootKeys(): string[] {
    return [...this.clientRoots].filter((k) => this.symbols.has(k));
  }

  get size(): number {
    return this.symbols.size;
  }

  /**
   * Keys reachable from any client root by following use-edges (BFS). Sound: only
   * explicit `refs` edges are traversed, so this never under-reports reachability.
   */
  reachableFromClient(): Set<string> {
    const seen = new Set<string>();
    const stack = this.clientRootKeys();
    while (stack.length > 0) {
      const k = stack.pop() as string;
      if (seen.has(k)) continue;
      seen.add(k);
      const sym = this.symbols.get(k);
      if (!sym) continue;
      for (const r of sym.refs) {
        if (!seen.has(r)) stack.push(r);
      }
    }
    return seen;
  }

  /**
   * All authority violations: every `server_only` symbol that is either exposed on
   * the client wire surface or transitively reachable from a client root.
   */
  findViolations(): AuthorityViolation[] {
    const reachable = this.reachableFromClient();
    const violations: AuthorityViolation[] = [];

    for (const sym of this.symbols.values()) {
      if (sym.tier !== 'server_only') continue;

      if (sym.clientExposed) {
        violations.push({
          symbol: sym,
          kind: 'exposed',
          reason: `server_only symbol '${sym.name}' (${sym.sourceFile}) is replicated on the client wire surface`,
        });
        continue;
      }

      if (reachable.has(sym.key)) {
        violations.push({
          symbol: sym,
          kind: 'reachable',
          reason: `server_only symbol '${sym.name}' (${sym.sourceFile}) is reachable from a client-bundle root`,
          path: this.tracePath(sym.key) ?? undefined,
        });
      }
    }

    return violations;
  }

  /**
   * Partition every symbol into the server set and the client set. The client set
   * is exactly the client/replicated-tier symbols plus anything reachable from a
   * client root; everything else (including all `server_only`) is server-side.
   */
  partition(): AuthorityPartition {
    const reachable = this.reachableFromClient();
    const serverSet: AuthoritySymbol[] = [];
    const clientSet: AuthoritySymbol[] = [];

    for (const sym of this.symbols.values()) {
      const clientVisible =
        sym.tier === 'client' ||
        sym.tier === 'replicated' ||
        sym.clientExposed === true ||
        reachable.has(sym.key);
      if (clientVisible) clientSet.push(sym);
      else serverSet.push(sym);
    }

    return { serverSet, clientSet };
  }

  /**
   * Reconstruct one client-root → target path over use-edges (for violation
   * evidence). Returns null when no path exists (target only `clientExposed`).
   */
  private tracePath(targetKey: string): string[] | null {
    const parents = new Map<string, string | null>();
    const queue: string[] = [];
    for (const root of this.clientRootKeys()) {
      parents.set(root, null);
      queue.push(root);
    }
    let head = 0;
    while (head < queue.length) {
      const k = queue[head++];
      if (k === targetKey) {
        const path: string[] = [];
        let cur: string | undefined = k;
        while (cur !== undefined) {
          path.unshift(cur);
          const p = parents.get(cur);
          cur = p === null || p === undefined ? undefined : p;
        }
        return path;
      }
      const sym = this.symbols.get(k);
      if (!sym) continue;
      for (const r of sym.refs) {
        if (!parents.has(r)) {
          parents.set(r, k);
          queue.push(r);
        }
      }
    }
    return null;
  }
}

/** Create an empty authority symbol graph. */
export function createAuthoritySymbolGraph(): AuthoritySymbolGraph {
  return new AuthoritySymbolGraph();
}
