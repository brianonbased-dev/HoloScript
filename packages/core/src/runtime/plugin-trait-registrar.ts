/**
 * Shared plugin trait registrar (premortem 2026-06-07, task_1780881034070_wnlv P1).
 *
 * Gives every domain plugin ONE identical registration shape so wiring ~50
 * built-but-dead-wired plugins can't diverge into 50 hand-rolled registrars
 * (the premortem's "49 copies of a pattern with two holes" failure). Each
 * handler is owner-tagged with its plugin id so the HoloScriptRuntime
 * collision guard can name BOTH the prior and incoming plugin on a clash
 * (e.g. two plugins both declaring 'vitals_monitor').
 *
 * Registration is OPT-IN by design: an app/runtime only sees a plugin's traits
 * if it explicitly calls the plugin's registrar — existing .holo content in a
 * runtime that doesn't opt in is unaffected (contains the behavior-change blast
 * radius of re-activating previously-no-op trait names).
 */

/** Minimal behavioral trait handler shape — `name` + lifecycle hooks read at dispatch. */
export interface PluginTraitHandler {
  name: string;
  [key: string]: unknown;
}

/** Anything exposing `registerTrait` — e.g. `@holoscript/core` HoloScriptRuntime. */
export interface TraitRegistrarTarget {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Marker key stamped onto each handler by `registerPluginTraits`, read by the
 * runtime's collision guard to name the owning plugin in a clash warning.
 */
export const TRAIT_OWNER_KEY = '__pluginOwner' as const;

/**
 * Register a plugin's behavioral trait handlers into a runtime, tagging each
 * with its owning `pluginId`. Idempotent against the runtime's keep-first
 * collision guard: a name already registered (by this or another plugin) is
 * warned-and-skipped, never silently overwritten.
 */
export function registerPluginTraits(
  target: TraitRegistrarTarget,
  pluginId: string,
  handlers: readonly PluginTraitHandler[],
): void {
  for (const handler of handlers) {
    (handler as Record<string, unknown>)[TRAIT_OWNER_KEY] = pluginId;
    target.registerTrait(handler.name, handler);
  }
}
