/** @module Interface holoscript:core/generator@1.0.0 **/
export function generateObject(description: string): string;
export function generateScene(description: string): string;
export function suggestTraits(description: string): Array<TraitDef>;
export type TraitDef = import('./holoscript-core-types.js').TraitDef;
