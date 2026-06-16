/**
 * PluginKeywordRegistry — runtime-injectable .hs verb table (H2 language-extension seam).
 *
 * Converts today's hardcoded keyword dispatch (locomotion `move/turn`,
 * cognitive `llm_call/recall`) into an append-only registry. Every verb must
 * declare a `NodeTypeFamily` — a BOUNDED set defined here in core. This is
 * the one seam that lets any vertical extend the language without forking core:
 *
 *   - Plugins add verbs to existing families (`actuate` → `'control'`,
 *     `dose` → `'sensor'`, `measure_qubits` → `'sensor'`, `emit_gcode` → `'control'`).
 *   - Plugins CANNOT create new families — that would be forking core.
 *   - The table is append-only: once registered, a verb cannot be remapped.
 *   - After scene init, `seal()` prevents further registrations.
 *
 * ## Alignment with existing types
 *
 * `NodeTypeFamily` is a superset of `ReactionCategory`
 * (`packages/core/src/types/base.ts`) — all existing reaction categories map
 * 1-to-1, and two new H2 families (`'cognitive'`, `'sensor'`, `'control'`,
 * `'transaction'`) are added for AI/LLM, robotics/IoT, and economic verbs.
 *
 * ## Machine-introspection
 *
 * `entries()` returns a read-only flat list of `VerbEntry` objects —
 * zero TS import needed. LSP, marketplace, and Brittney can read the registry
 * without importing plugin TypeScript.
 */

// ── Node-type families ────────────────────────────────────────────────────────

/**
 * Bounded set of node-type families. Core defines this set; plugins CANNOT
 * extend it (that would be forking core). Plugins ADD verbs to existing
 * families only.
 *
 * Families align with `ReactionCategory` from `types/base.ts` where they
 * overlap, plus new H2 families for the cognitive / control / sensor /
 * transaction verticals.
 */
export const NODE_TYPE_FAMILIES = [
  // ── Existing reaction categories (from ReactionCategory) ──────────────────
  'movement',    // locomotion: move, turn, strafe, jump, land
  'interaction', // object interaction verbs
  'collision',   // physics collision response
  'lifecycle',   // attach, detach, spawn, destroy
  'combat',      // combat/attack verbs
  'signal',      // event emission verbs
  // ── H2 additions ─────────────────────────────────────────────────────────
  'cognitive',   // AI/LLM: llm_call, recall, rag_query, plan, reflect
  'control',     // actuate, drive, set_joint, emit_gcode (ControlLoopTrait)
  'sensor',      // measure, read, sample, measure_qubits (robotics/IoT/QM)
  'transaction', // pay, transfer, stake (x402 economic)
] as const;

/** A family that a verb belongs to. Plugins may register verbs in these families. */
export type NodeTypeFamily = (typeof NODE_TYPE_FAMILIES)[number];

// ── Entry type ────────────────────────────────────────────────────────────────

/** A single entry in the keyword registry. */
export interface VerbEntry {
  /** The .hs verb string (e.g., `'move'`, `'actuate'`, `'emit_gcode'`). */
  readonly verb: string;
  /** The node-type family this verb belongs to. */
  readonly family: NodeTypeFamily;
  /**
   * The plugin that registered this verb.
   * `'core'` for built-in verbs (locomotion + cognitive).
   */
  readonly registeredBy: string;
}

// ── Registry class ────────────────────────────────────────────────────────────

/**
 * Append-only runtime registry mapping .hs verbs to node-type families.
 *
 * Use the module-level `globalKeywordRegistry` singleton; instantiate a fresh
 * one only in tests.
 */
export class PluginKeywordRegistry {
  private readonly table = new Map<string, VerbEntry>();
  private _sealed = false;

  constructor() {
    this._registerBuiltins();
  }

  private _registerBuiltins(): void {
    // Locomotion verbs (MOVEMENT_VERBS in LocomotionActions.ts)
    for (const verb of ['move', 'turn', 'strafe', 'jump', 'land']) {
      this.table.set(verb, { verb, family: 'movement', registeredBy: 'core' });
    }
    // Cognitive verbs (COGNITIVE_VERBS in CognitiveActions.ts)
    for (const verb of ['llm_call', 'recall', 'rag_query', 'plan', 'reflect']) {
      this.table.set(verb, { verb, family: 'cognitive', registeredBy: 'core' });
    }
  }

  /**
   * Register a plugin-supplied verb.
   *
   * @param verb      The .hs verb (e.g., `'actuate'`, `'emit_gcode'`). Must be
   *                  a non-empty string containing only `[a-z0-9_]`.
   * @param family    Must be a known `NodeTypeFamily`. Conformance gate rejects
   *                  anything outside the fixed set.
   * @param pluginId  The registering plugin's manifest id (e.g., `'robotics'`).
   *
   * @throws If the registry is sealed, the family is unknown, or the verb is
   *         already registered by a DIFFERENT plugin (idempotent for same plugin).
   */
  register(verb: string, family: NodeTypeFamily, pluginId: string): void {
    if (this._sealed) {
      throw new Error(
        `[PluginKeywordRegistry] Registry is sealed — cannot register verb "${verb}" after scene init.`,
      );
    }

    if (!verb || !/^[a-z][a-z0-9_]*$/.test(verb)) {
      throw new Error(
        `[PluginKeywordRegistry] Invalid verb "${verb}". Must match [a-z][a-z0-9_]*.`,
      );
    }

    if (!(NODE_TYPE_FAMILIES as ReadonlyArray<string>).includes(family)) {
      throw new Error(
        `[PluginKeywordRegistry] Unknown node-type family "${family}". ` +
          `Must be one of: ${NODE_TYPE_FAMILIES.join(', ')}.`,
      );
    }

    const existing = this.table.get(verb);
    if (existing) {
      if (existing.registeredBy === pluginId) {
        return; // idempotent re-registration by the same plugin
      }
      throw new Error(
        `[PluginKeywordRegistry] Verb "${verb}" is already registered by plugin "${existing.registeredBy}". ` +
          `Cannot be re-registered by "${pluginId}".`,
      );
    }

    this.table.set(verb, { verb, family, registeredBy: pluginId });
  }

  /**
   * Seal the registry after scene init. All plugin verbs must be registered
   * before this call. After sealing, `register()` throws.
   *
   * Idempotent — calling seal() on an already-sealed registry is a no-op.
   */
  seal(): void {
    this._sealed = true;
  }

  /** Whether the registry has been sealed. */
  get isSealed(): boolean {
    return this._sealed;
  }

  /**
   * Look up the `NodeTypeFamily` for a verb.
   * Returns `undefined` for unregistered verbs.
   */
  lookupFamily(verb: string): NodeTypeFamily | undefined {
    return this.table.get(verb)?.family;
  }

  /** Returns `true` if the verb is registered (built-in or plugin-supplied). */
  isKnownVerb(verb: string): boolean {
    return this.table.has(verb);
  }

  /**
   * Return all registered `VerbEntry` objects — the flat machine-introspectable
   * table. Safe for LSP / marketplace / Brittney to read without importing TS.
   */
  entries(): ReadonlyArray<VerbEntry> {
    return [...this.table.values()];
  }

  /** Return all registered verbs for a given family. */
  verbsInFamily(family: NodeTypeFamily): ReadonlyArray<string> {
    return [...this.table.values()].filter((e) => e.family === family).map((e) => e.verb);
  }

  /** Total number of registered verbs. */
  get size(): number {
    return this.table.size;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Global singleton registry — one table per process.
 *
 * Plugins call `registerPluginVerb()` at registration time (before scene-init
 * seal). The parser and runtime call `globalKeywordRegistry.lookupFamily()` to
 * dispatch unknown verbs without hardcoded switch/case.
 */
export const globalKeywordRegistry = new PluginKeywordRegistry();

// ── Plugin API ────────────────────────────────────────────────────────────────

/**
 * Register a plugin-supplied .hs verb into the global registry.
 *
 * Call during plugin registration (alongside `registerPluginTraits`) — before
 * the scene-init seal fires.
 *
 * @example
 * ```ts
 * // In a robotics plugin runtime.ts:
 * registerPluginVerb('actuate', 'control', 'robotics');
 * registerPluginVerb('measure_joint', 'sensor', 'robotics');
 * ```
 */
export function registerPluginVerb(
  verb: string,
  family: NodeTypeFamily,
  pluginId: string,
): void {
  globalKeywordRegistry.register(verb, family, pluginId);
}

/**
 * Convenience: register multiple verbs for one plugin in a single call.
 *
 * @example
 * ```ts
 * registerPluginVerbs('robotics', [
 *   { verb: 'actuate',       family: 'control' },
 *   { verb: 'measure_joint', family: 'sensor'  },
 * ]);
 * ```
 */
export function registerPluginVerbs(
  pluginId: string,
  verbs: ReadonlyArray<{ verb: string; family: NodeTypeFamily }>,
): void {
  for (const { verb, family } of verbs) {
    globalKeywordRegistry.register(verb, family, pluginId);
  }
}
