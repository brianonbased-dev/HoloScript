/**
 * PluginManifest — declarative plugin descriptor (H1 proof machinery).
 *
 * Every plugin declares a `plugin.manifest.json` at its package root that
 * conforms to this schema. The runtime reads manifests to:
 *   1. Auto-register trait handlers (when `autoRegister: true`) so no
 *      hand-written `registerXxxTraitHandlers` call is needed in user code.
 *   2. Introspect plugins from LSP / marketplace / Brittney without importing
 *      plugin TypeScript — the manifest is machine-readable data, not code.
 *   3. Gate `StdlibPolicy` capability scoping at the declared plugin boundary.
 *   4. Provide the anchor point for `PluginSolverContract` in H2.
 *
 * ## Design constraints
 *
 * - DOMAIN-NEUTRAL. No domain nouns. Traits are registered by name strings;
 *   the manifest carries no domain-specific vocabulary.
 * - JSON-serializable. All fields are primitives or arrays of primitives.
 * - Additive. Optional fields may be absent; the runtime ignores unknown fields
 *   so manifests can carry H2 fields (`solverContract`, `receiptSchema`) before
 *   the engine is ready to consume them.
 *
 * ## Combination support
 *
 * `combinePluginRegistrations` (this module) accepts an array of
 * `PluginRegistration` objects — each pairing a manifest with a set of
 * `TraitRegistrarTarget` calls — and registers all traits into a single
 * registrar. This is the proto-composition primitive: it gives the caller
 * a flat list of plugin IDs that can be fed into a future `ComposedReceipt`
 * (H2 ProofCompositionLaw) without changing the calling convention.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A single trait entry in the manifest's `traits` array.
 * Carries the trait name plus optional human-readable metadata.
 */
export interface PluginTraitEntry {
  /** Trait name as registered in the runtime (e.g. `"eoq"`, `"menu"`). */
  name: string;
  /** Optional short description for tooling/LSP display. */
  description?: string;
  /** SI unit of the primary output field (if numeric). Pure display; not validated here. */
  outputUnit?: string;
}

/**
 * Declarative plugin manifest (`plugin.manifest.json`).
 *
 * Required fields: `id`, `version`, `traits`.
 * All other fields are optional additive metadata.
 */
export interface PluginManifest {
  /**
   * Stable plugin identifier. Used by the runtime collision guard
   * (`__pluginOwner`) and as the anchor for `PluginSolverContract` in H2.
   * Convention: kebab-case, no `@holoscript/` prefix (e.g. `"retail-ecommerce"`).
   */
  id: string;
  /** Semver version string. */
  version: string;
  /**
   * Array of traits this plugin registers. The runtime uses this list to
   * validate that every declared trait has a corresponding handler when
   * `autoRegister: true`.
   */
  traits: Array<string | PluginTraitEntry>;
  /**
   * Human-readable display name (e.g. `"Retail / E-commerce"`).
   * Used by marketplace and LSP hover.
   */
  name?: string;
  /** Short description of what this plugin provides. */
  description?: string;
  /**
   * When `true`, the runtime automatically calls the plugin's default
   * registration export (`registerTraitHandlers`) at scene init without
   * the user explicitly calling it. Default: `false`.
   *
   * This is the activation path that converts dead-wired plugins into
   * live-wired ones via manifest-only config — no code change at the
   * call site.
   */
  autoRegister?: boolean;
  /**
   * Minimum `@holoscript/core` semver required.
   * Used by the loader to refuse incompatible plugins cleanly.
   */
  coreVersion?: string;
  /**
   * Entry-point path (relative to package root) for the runtime registration
   * module. Defaults to `"./src/runtime.ts"` (or `"./dist/runtime.js"` post-build).
   * The auto-register loader resolves this path to invoke the registration export.
   */
  runtimeEntry?: string;
  /**
   * Optional H2 placeholder: reference to a `PluginSolverContract` declaration.
   * Absent until H2 ships; the loader ignores unknown fields, so manifests can
   * carry this early for tooling forward-compat.
   */
  solverContract?: string;
  /**
   * Optional H2 placeholder: identifier for a registered receipt schema.
   * When present, the runtime validates solver output against this schema
   * before issuing a receipt. Absent → freeform resultSummary (today's behavior).
   */
  receiptSchema?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the plain trait name from a manifest trait entry. */
export function traitName(entry: string | PluginTraitEntry): string {
  return typeof entry === 'string' ? entry : entry.name;
}

/** Return all trait names declared in a manifest. */
export function manifestTraitNames(manifest: PluginManifest): string[] {
  return manifest.traits.map(traitName);
}

// ── Plugin combination ────────────────────────────────────────────────────────

/**
 * A single plugin's runtime registration bundle.
 * Pair a `PluginManifest` with a `register` function that calls
 * `registerPluginTraits(target, …)` for this plugin's handlers.
 *
 * ## Usage
 * ```ts
 * const result = combinePluginRegistrations(registrar, [
 *   { manifest: aerospaceManifest, register: registerAerospaceTraitHandlers },
 *   { manifest: medicalManifest,   register: registerMedicalTraitHandlers   },
 * ]);
 * // result.pluginIds → ['aerospace', 'medical']
 * // result.traitNames → ['delta_v', 'orbit', 'diagnosis', 'treatment', …]
 * ```
 */
export interface PluginRegistration<TRegistrar = unknown> {
  manifest: PluginManifest;
  /** Call `registerPluginTraits(registrar, …)` inside this function. */
  register: (registrar: TRegistrar) => void;
}

/** Summary returned by `combinePluginRegistrations`. */
export interface CombinedPluginResult {
  /** Ordered list of plugin IDs that were registered. */
  pluginIds: string[];
  /** Flat union of all trait names declared across all plugins. */
  traitNames: string[];
}

/**
 * Register multiple plugins into a single trait registrar.
 *
 * This is the proto-composition primitive — the bridge between today's
 * independent plugin receipts and H2's `ComposedReceipt`. Call it at scene
 * init instead of calling each plugin's `register*TraitHandlers` individually.
 *
 * The caller supplies a `registrar` (any object with `registerTrait(name, handler)`),
 * and for each `PluginRegistration`, this function calls `registration.register(registrar)`.
 * After all registrations complete, the returned `CombinedPluginResult` carries
 * the flat union of IDs and trait names for use in receipt construction.
 *
 * Trait name collision (two plugins declaring the same name) is not checked
 * here — the underlying `registerPluginTraits` stamps `__pluginOwner` on each
 * handler, so the runtime's collision guard handles it at dispatch time.
 *
 * @param registrar  The runtime registrar to register all traits into.
 * @param plugins    Array of plugin registration bundles.
 * @returns          `{ pluginIds, traitNames }` — the union across all plugins.
 */
export function combinePluginRegistrations<TRegistrar>(
  registrar: TRegistrar,
  plugins: ReadonlyArray<PluginRegistration<TRegistrar>>,
): CombinedPluginResult {
  const pluginIds: string[] = [];
  const traitNames: string[] = [];

  for (const registration of plugins) {
    registration.register(registrar);
    pluginIds.push(registration.manifest.id);
    traitNames.push(...manifestTraitNames(registration.manifest));
  }

  return { pluginIds, traitNames };
}
