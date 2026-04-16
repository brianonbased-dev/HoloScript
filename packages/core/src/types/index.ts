/**
 * Internal composition types for R3F / compiler pipelines.
 * Import via `from '../types/index'` — the package root resolves `./types` to `types.ts`, not this file.
 * Intentionally not re-exported from `src/barrel` (avoids TS2308 vs `legacy-exports`).
 */

import type { HoloComposition as HoloCompositionIR } from '../parser/HoloCompositionTypes';

/** Loose structural type for composition sub-nodes in the R3F pipeline */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional escape hatch vs Holo* interfaces (no index signature)
export type CompositionChild = Record<string, any>;

/**
 * Parser output may attach a flat `children` list (`CompositionNode` pipeline) in addition to
 * first-class HoloComposition fields.
 */
export type HoloComposition = HoloCompositionIR & {
  children?: CompositionChild[];
};
