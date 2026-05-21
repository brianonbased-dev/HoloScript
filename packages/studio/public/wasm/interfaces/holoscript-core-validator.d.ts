/** @module Interface holoscript:core/validator@1.0.0 **/
export function validate(source: string): ValidationResult;
export function traitExists(name: string): boolean;
export function getTrait(name: string): TraitDef | undefined;
export function listTraits(): Array<TraitDef>;
export function listTraitsByCategory(category: string): Array<TraitDef>;
export type ValidationResult = import('./holoscript-core-types.js').ValidationResult;
export type TraitDef = import('./holoscript-core-types.js').TraitDef;
