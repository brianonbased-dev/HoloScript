/**
 * HoloScript Composition Parser — Rule-Family Modules
 *
 * Barrel export for the composition/ subdirectory.
 * W1-T2: Split HoloCompositionParser.ts by rule-family.
 *
 * The main HoloCompositionParser.ts re-exports from here for backward compatibility.
 * External consumers should still import from `HoloCompositionParser` or
 * `@holoscript/core/parser`.
 *
 * @version 1.0.0
 */

export { type TokenType, type Token, KEYWORDS, PRIMITIVE_SHAPES, LIGHT_PRIMITIVES } from './tokens';
export { HoloLexer } from './lexer';