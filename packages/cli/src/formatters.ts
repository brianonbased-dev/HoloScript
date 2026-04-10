/**
 * Output formatters for CLI
 */

import type { ASTNode } from '@holoscript/core-types/ast';
import type { ExecutionResult } from '@holoscript/core';

export function formatAST(ast: ASTNode[], options: { json?: boolean } = {}): string {
  if (options.json) {
    return JSON.stringify(ast, null, 2);
  }

  return ast.map((node, i) => formatNode(node, i)).join('\n\n');
}

function formatNode(node: ASTNode, index: number): string {
  const lines: string[] = [];
  lines.push(`[${index}] ${node.type.toUpperCase()}`);

  if ('name' in node && node.name) {
    lines.push(`    name: ${node.name}`);
  }

  if (node.position) {
    const { x, y, z } = node.position;
    lines.push(`    position: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
  }

  if (node.hologram) {
    lines.push(`    hologram: ${node.hologram.shape} (${node.hologram.color})`);
  }

  return lines.join('\n');
}

export function formatError(error: Error | string): string {
  const message = typeof error === 'string' ? error : error.message;
  return `Error: ${message}`;
}

export function formatResult(result: ExecutionResult, options: { json?: boolean } = {}): string {
  if (options.json) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];
  lines.push(`Execution ${result.success ? 'succeeded' : 'failed'}`);

  if (result.executionTime !== undefined) {
    lines.push(`Duration: ${result.executionTime}ms`);
  }

  if (result.error) {
    lines.push(`\nError: ${result.error}`);
  }

  if (result.hologram) {
    lines.push(`\nHologram: ${result.hologram.shape} (${result.hologram.color})`);
  }

  if (result.spatialPosition) {
    const { x, y, z } = result.spatialPosition;
    lines.push(`Position: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
  }

  if (result.output) {
    lines.push(`\nOutput:`);
    lines.push(JSON.stringify(result.output, null, 2));
  }

  return lines.join('\n');
}
