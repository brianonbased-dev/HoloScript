/**
 * Output formatters for CLI
 */
import type { ASTNode, ExecutionResult } from '@holoscript/core';
export declare function formatAST(ast: ASTNode[], options?: {
    json?: boolean;
}): string;
export declare function formatError(error: Error | string): string;
export declare function formatResult(result: ExecutionResult, options?: {
    json?: boolean;
}): string;
