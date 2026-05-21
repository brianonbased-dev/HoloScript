/** @module Interface holoscript:core/parser@1.0.0 **/
export function parse(source: string): ParseResult;
export function parseHeader(source: string): string;
export type ParseResult = import('./holoscript-core-types.js').ParseResult;
