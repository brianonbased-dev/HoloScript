/** @module Interface holoscript:core/generator@1.0.0 **/
export function generateObject(description: string): string;
export function generateScene(description: string): string;
export function suggestTraits(description: string): Array<TraitDef>;

/**
 * APL-WIT-3 (Gap #4): Sovereign generator surface for offline WASM contexts.
 *
 * When the WASM generator world is unavailable (offline, PhoneSleeveVR,
 * Quest 3, embedded WASM), the generator interface falls back to the
 * SovereignGeneratorAdapter which resolves through:
 *   1. Local Brittney 15M (Ollama/WebLLM) — sovereign, offline
 *   2. Cloud Brittney — if online and not offlineOnly
 *   3. Keyword/template fallback — always available, no LLM
 *
 * The WASM generator world calls these same functions; the sovereign adapter
 * provides the same interface for TypeScript fallback and Studio UI.
 *
 * @see @holoscript/core/world/SovereignGeneratorAdapter
 */
export interface SovereignGeneratorResult {
  code: string;
  metadata: {
    description: string;
    traits: string[];
    geometry: string;
    generationMs?: number;
    source: 'sovereign-local' | 'sovereign-cloud' | 'keyword-fallback' | 'mock';
  };
}

export type TraitDef = import('./holoscript-core-types.js').TraitDef;
