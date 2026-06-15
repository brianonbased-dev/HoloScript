/**
 * Known-Trait Union Seam — single source of truth (SSOT) for the parser,
 * language server, and linter's trait vocabulary.
 *
 * WHY this exists
 * ---------------
 * The VR trait registry (`VR_TRAITS`) is large but it is *not* the whole story.
 * Two other vocabularies are first-class but were historically invisible to the
 * unknown-trait checks, producing false-positive "Unknown trait" warnings:
 *
 *   1. **Native2D / panel reactive-composition traits** — the flat, screen-native
 *      UI vocabulary (`@panel`, `@text`, `@button`, `@fetch`, `@bind`, `@hook`,
 *      `@view`, `@page`, `@route`, …) consumed by `Native2DCompiler` and emitted by
 *      the Studio `.holo` panels. See `compiler/Native2DCompiler.ts` `traits.*`
 *      accesses and `traits/Native2DTraits.ts` handlers.
 *   2. **Code-graph traits** — the auto-generated studio UI graph vocabulary
 *      (`@route`, `@file`, `@reused_in`, `@uses_stores`, `@calls_apis`) emitted by
 *      `@holoscript/studio-ui-graph` (`src/emit.ts`).
 *
 * This module unions those vocabularies into one injectable set so the parser,
 * LSP, and linter share exactly one trait dictionary. Plugin-contributed trait
 * names are passed via `extras` at the call site (kept out of core so core never
 * depends on studio/plugins — plugins are data, not code).
 *
 * The union is *injected* (never imported by the parser core directly) so the
 * default behavior is unchanged when no set is supplied. See
 * `HoloParserOptions.knownTraits` and `ErrorRecovery`.
 */

import { VR_TRAITS } from '../constants';

/**
 * Native2D / panel reactive-composition trait names.
 *
 * Derived from the `traits.*` accesses in `compiler/Native2DCompiler.ts` and the
 * `@view` / `@native_panel` usage in the Studio `.holo` panels, plus the panel
 * handler names in `traits/Native2DTraits.ts`.
 */
export const NATIVE2D_TRAITS = [
  'text',
  'fetch',
  'bind',
  'hook',
  'theme',
  'panel',
  'slot',
  'link',
  'button',
  'image',
  'input',
  'icon',
  'when',
  'each',
  'count_of',
  'form',
  'semantic_layout',
  'semantic_entity',
  'color',
  'content',
  'layout',
  'native_panel',
  'view',
  'page',
  'route',
  'metadata',
] as const;

/**
 * Code-graph trait names emitted by `@holoscript/studio-ui-graph` (`src/emit.ts`).
 *
 * NOTE: `emit.ts` also emits `@used_in` in its summary blocks, but the page/
 * component nodes — the ones an `.holo` author writes/round-trips — use the five
 * below. Kept aligned with the verified design.
 */
export const CODE_GRAPH_TRAITS = ['route', 'file', 'reused_in', 'uses_stores', 'calls_apis'] as const;

/**
 * Build the injectable union of all known trait names.
 *
 * The base is `VR_TRAITS` (back-compat: the existing parser fallback), unioned
 * with the Native2D and code-graph vocabularies and any caller-supplied `extras`
 * (e.g. plugin-contributed trait names — wired separately so core stays
 * plugin-agnostic).
 *
 * @param extras Additional trait-name arrays (flattened) to include. Each entry
 *   may be a single array or a nested array of arrays.
 * @returns A `Set<string>` of every known trait name.
 */
export function buildKnownTraitSet(
  extras: ReadonlyArray<string | readonly string[]> = []
): Set<string> {
  return new Set<string>([
    ...VR_TRAITS,
    ...NATIVE2D_TRAITS,
    ...CODE_GRAPH_TRAITS,
    ...extras.flat(),
  ]);
}
