/** @module Interface holoscript:core/type-checker@2.0.0 **/
export function check(source: string): Array<Diagnostic>;
export function inferTypeAt(source: string, offset: number): TypeInfo | undefined;
export function completionsAt(source: string, offset: number): Array<string>;
export type TypeInfo = import('./holoscript-core-types.js').TypeInfo;
export type Diagnostic = import('./holoscript-core-types.js').Diagnostic;
