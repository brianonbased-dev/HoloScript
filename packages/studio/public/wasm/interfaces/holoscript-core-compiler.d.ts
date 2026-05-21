/** @module Interface holoscript:core/compiler@1.0.0 **/
export function compile(source: string, target: CompileTarget): CompileResult;
export function compileAst(ast: CompositionNode, target: CompileTarget): CompileResult;
export function listTargets(): Array<CompileTarget>;
export type CompositionNode = import('./holoscript-core-types.js').CompositionNode;
export type CompileTarget = import('./holoscript-core-types.js').CompileTarget;
export type CompileResult = import('./holoscript-core-types.js').CompileResult;
