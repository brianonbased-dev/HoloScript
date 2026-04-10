/**
 * Semantic Diff Engine - Sprint 2 Priority 8
 *
 * AST-based comparison that:
 * - Ignores whitespace and formatting changes
 * - Ignores comment changes
 * - Detects renamed symbols
 * - Detects moved code blocks
 * - Classifies meaningful changes
 */

// =============================================================================
// TYPES
// =============================================================================

export type ChangeType = 'added' | 'removed' | 'modified' | 'renamed' | 'moved' | 'unchanged';

export interface DiffChange {
  /** Type of change */
  type: ChangeType;
  /** Path to the changed node (e.g., "objects.Player.traits") */
  path: string;
  /** Old value (for removed/modified) */
  oldValue?: unknown;
  /** New value (for added/modified) */
  newValue?: unknown;
  /** Original name (for renamed) */
  oldName?: string;
  /** New name (for renamed) */
  newName?: string;
  /** Line number in old file */
  oldLine?: number;
  /** Line number in new file */
  newLine?: number;
  /** Human-readable description */
  description: string;
}

export interface SemanticDiffResult {
  /** Whether the files are semantically equivalent */
  equivalent: boolean;
  /** Total number of changes */
  changeCount: number;
  /** Categorized changes */
  changes: DiffChange[];
  /** Summary by change type */
  summary: Record<ChangeType, number>;
  /** Files compared */
  files: { old: string; new: string };
}

export interface DiffOptions {
  /** Ignore comment changes */
  ignoreComments: boolean;
  /** Ignore whitespace/formatting */
  ignoreFormatting: boolean;
  /** Detect renamed symbols */
  detectRenames: boolean;
  /** Detect moved code blocks */
  detectMoves: boolean;
  /** Similarity threshold for rename detection (0-1) */
  renameThreshold: number;
}

const DEFAULT_OPTIONS: DiffOptions = {
  ignoreComments: true,
  ignoreFormatting: true,
  detectRenames: true,
  detectMoves: true,
  renameThreshold: 0.8,
};

// =============================================================================
// AST NODE TYPES (simplified for diffing)
// =============================================================================

interface ASTNode {
  type: string;
  name?: string;
  value?: unknown;
  children?: ASTNode[];
  properties?: Record<string, unknown>;
  traits?: unknown[];
  line?: number;
  [key: string]: unknown;
}

// =============================================================================
// SEMANTIC DIFF ENGINE
// =============================================================================

export class SemanticDiffEngine {
  private options: DiffOptions;

  constructor(options: Partial<DiffOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Compare two AST trees and return semantic differences
   */
  diff(oldAST: ASTNode, newAST: ASTNode, oldFile = 'old', newFile = 'new'): SemanticDiffResult {
    const changes: DiffChange[] = [];

    // Normalize ASTs (remove comments, normalize whitespace if configured)
    const normalizedOld = this.normalizeAST(oldAST);
    const normalizedNew = this.normalizeAST(newAST);

    // Compare recursively
    this.compareNodes(normalizedOld, normalizedNew, '', changes);

    // Post-process for renames and moves
    if (this.options.detectRenames) {
      this.detectRenames(changes);
    }

    if (this.options.detectMoves) {
      this.detectMoves(changes);
    }

    // Calculate summary
    const summary: Record<ChangeType, number> = {
      added: 0,
      removed: 0,
      modified: 0,
      renamed: 0,
      moved: 0,
      unchanged: 0,
    };

    for (const change of changes) {
      summary[change.type]++;
    }

    return {
      equivalent: changes.length === 0,
      changeCount: changes.length,
      changes,
      summary,
      files: { old: oldFile, new: newFile },
    };
  }

  /**
   * Normalize AST by removing comments and normalizing structure
   */
  private normalizeAST(node: ASTNode): ASTNode {
    if (!node || typeof node !== 'object') {
      return node;
    }

    const result: ASTNode = { type: node.type };

    for (const [key, value] of Object.entries(node)) {
      // Skip comments if configured
      if (this.options.ignoreComments && key === 'comments') {
        continue;
      }

      // Skip location info for comparison
      if (key === 'loc' || key === 'start' || key === 'end') {
        continue;
      }

      // Recursively normalize
      if (Array.isArray(value)) {
        result[key] = value
          .filter((item) => !(this.options.ignoreComments && item?.type === 'Comment'))
          .map((item) => (typeof item === 'object' ? this.normalizeAST(item) : item));
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.normalizeAST(value as ASTNode);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Compare two nodes recursively
   */
  private compareNodes(
    oldNode: ASTNode | undefined,
    newNode: ASTNode | undefined,
    path: string,
    changes: DiffChange[]
  ): void {
    // Handle null/undefined
    if (!oldNode && !newNode) return;

    if (!oldNode && newNode) {
      changes.push({
        type: 'added',
        path,
        newValue: newNode,
        newLine: newNode.line,
        description: `Added ${newNode.type}${newNode.name ? ` "${newNode.name}"` : ''} at ${path}`,
      });
      return;
    }

    if (oldNode && !newNode) {
      changes.push({
        type: 'removed',
        path,
        oldValue: oldNode,
        oldLine: oldNode.line,
        description: `Removed ${oldNode.type}${oldNode.name ? ` "${oldNode.name}"` : ''} at ${path}`,
      });
      return;
    }

    // Both exist - compare
    if (oldNode!.type !== newNode!.type) {
      changes.push({
        type: 'modified',
        path,
        oldValue: oldNode,
        newValue: newNode,
        oldLine: oldNode!.line,
        newLine: newNode!.line,
        description: `Changed type from ${oldNode!.type} to ${newNode!.type} at ${path}`,
      });
      return;
    }

    // Compare properties
    const oldKeys = new Set(
      Object.keys(oldNode!).filter((k) => !['type', 'line', 'loc'].includes(k))
    );
    const newKeys = new Set(
      Object.keys(newNode!).filter((k) => !['type', 'line', 'loc'].includes(k))
    );

    // Check for added keys
    for (const key of newKeys) {
      if (!oldKeys.has(key)) {
        const childPath = path ? `${path}.${key}` : key;
        changes.push({
          type: 'added',
          path: childPath,
          newValue: newNode![key],
          newLine: newNode!.line,
          description: `Added property "${key}" at ${childPath}`,
        });
      }
    }

    // Check for removed keys
    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        const childPath = path ? `${path}.${key}` : key;
        changes.push({
          type: 'removed',
          path: childPath,
          oldValue: oldNode![key],
          oldLine: oldNode!.line,
          description: `Removed property "${key}" at ${childPath}`,
        });
      }
    }

    // Compare shared keys
    for (const key of oldKeys) {
      if (newKeys.has(key)) {
        const childPath = path ? `${path}.${key}` : key;
        const oldValue = oldNode![key];
        const newValue = newNode![key];

        if (Array.isArray(oldValue) && Array.isArray(newValue)) {
          this.compareArrays(oldValue, newValue, childPath, changes);
        } else if (
          typeof oldValue === 'object' &&
          oldValue !== null &&
          typeof newValue === 'object' &&
          newValue !== null
        ) {
          this.compareNodes(oldValue as ASTNode, newValue as ASTNode, childPath, changes);
        } else if (!this.valuesEqual(oldValue, newValue)) {
          changes.push({
            type: 'modified',
            path: childPath,
            oldValue,
            newValue,
            oldLine: oldNode!.line,
            newLine: newNode!.line,
            description: `Changed "${key}" from ${JSON.stringify(oldValue)} to ${JSON.stringify(newValue)}`,
          });
        }
      }
    }
  }

  /**
   * Compare two arrays
   */
  private compareArrays(
    oldArr: unknown[],
    newArr: unknown[],
    path: string,
    changes: DiffChange[]
  ): void {
    const maxLen = Math.max(oldArr.length, newArr.length);

    for (let i = 0; i < maxLen; i++) {
      const childPath = `${path}[${i}]`;

      if (i >= oldArr.length) {
        changes.push({
          type: 'added',
          path: childPath,
          newValue: newArr[i],
          description: `Added element at ${childPath}`,
        });
      } else if (i >= newArr.length) {
        changes.push({
          type: 'removed',
          path: childPath,
          oldValue: oldArr[i],
          description: `Removed element at ${childPath}`,
        });
      } else if (typeof oldArr[i] === 'object' && typeof newArr[i] === 'object') {
        this.compareNodes(oldArr[i] as ASTNode, newArr[i] as ASTNode, childPath, changes);
      } else if (!this.valuesEqual(oldArr[i], newArr[i])) {
        changes.push({
          type: 'modified',
          path: childPath,
          oldValue: oldArr[i],
          newValue: newArr[i],
          description: `Changed element at ${childPath}`,
        });
      }
    }
  }

  /**
   * Check if two values are equal
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object' && a !== null && b !== null) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  /**
   * Detect renamed symbols from add/remove pairs
   */
  private detectRenames(changes: DiffChange[]): void {
    const additions = changes.filter((c) => c.type === 'added' && c.newValue);
    const removals = changes.filter((c) => c.type === 'removed' && c.oldValue);

    for (const removal of removals) {
      for (const addition of additions) {
        const similarity = this.calculateSimilarity(removal.oldValue, addition.newValue);

        if (similarity >= this.options.renameThreshold) {
          // Convert to rename
          const oldName = this.extractName(removal.oldValue);
          const newName = this.extractName(addition.newValue);

          if (oldName && newName && oldName !== newName) {
            // Mark both as handled
            removal.type = 'renamed';
            removal.newValue = addition.newValue;
            removal.oldName = oldName;
            removal.newName = newName;
            removal.description = `Renamed "${oldName}" to "${newName}"`;

            // Remove the addition
            const addIndex = changes.indexOf(addition);
            if (addIndex !== -1) {
              changes.splice(addIndex, 1);
            }
            break;
          }
        }
      }
    }
  }

  /**
   * Detect moved code blocks
   */
  private detectMoves(changes: DiffChange[]): void {
    const additions = changes.filter((c) => c.type === 'added');
    const removals = changes.filter((c) => c.type === 'removed');

    for (const removal of removals) {
      for (const addition of additions) {
        // Check if values are identical but paths differ
        if (
          JSON.stringify(removal.oldValue) === JSON.stringify(addition.newValue) &&
          removal.path !== addition.path
        ) {
          // Convert to move
          removal.type = 'moved';
          removal.newValue = addition.newValue;
          removal.newLine = addition.newLine;
          removal.description = `Moved from ${removal.path} to ${addition.path}`;

          // Remove the addition
          const addIndex = changes.indexOf(addition);
          if (addIndex !== -1) {
            changes.splice(addIndex, 1);
          }
          break;
        }
      }
    }
  }

  /**
   * Calculate similarity between two values
   */
  private calculateSimilarity(a: unknown, b: unknown): number {
    if (!a || !b) return 0;

    const strA = JSON.stringify(a);
    const strB = JSON.stringify(b);

    // Simple Jaccard similarity on tokens
    const tokensA = new Set(strA.split(/[^\w]+/).filter(Boolean));
    const tokensB = new Set(strB.split(/[^\w]+/).filter(Boolean));

    const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Extract name from an AST node
   */
  private extractName(value: unknown): string | undefined {
    if (typeof value === 'object' && value !== null) {
      const node = value as ASTNode;
      return node.name || (node as { id?: string }).id;
    }
    return undefined;
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Compare two AST trees with default options
 */
export function semanticDiff(
  oldAST: ASTNode,
  newAST: ASTNode,
  options?: Partial<DiffOptions>
): SemanticDiffResult {
  const engine = new SemanticDiffEngine(options);
  return engine.diff(oldAST, newAST);
}

/**
 * Format diff result as human-readable string
 */
export function formatDiffResult(result: SemanticDiffResult): string {
  const lines: string[] = [];

  if (result.equivalent) {
    lines.push('Files are semantically equivalent.');
    return lines.join('\n');
  }

  lines.push(`Found ${result.changeCount} change(s):`);
  lines.push('');

  // Group by type
  const byType: Record<ChangeType, DiffChange[]> = {
    added: [],
    removed: [],
    modified: [],
    renamed: [],
    moved: [],
    unchanged: [],
  };

  for (const change of result.changes) {
    byType[change.type].push(change);
  }

  const typeLabels: Record<ChangeType, string> = {
    added: '➕ Added',
    removed: '➖ Removed',
    modified: '📝 Modified',
    renamed: '🔄 Renamed',
    moved: '📦 Moved',
    unchanged: '✓ Unchanged',
  };

  for (const type of ['added', 'removed', 'modified', 'renamed', 'moved'] as ChangeType[]) {
    const typeChanges = byType[type];
    if (typeChanges.length > 0) {
      lines.push(`${typeLabels[type]} (${typeChanges.length}):`);
      for (const change of typeChanges) {
        const lineInfo = change.oldLine ? `:${change.oldLine}` : '';
        lines.push(`  ${change.path}${lineInfo} - ${change.description}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Export as JSON for CI integration
 */
export function diffToJSON(result: SemanticDiffResult): string {
  return JSON.stringify(result, null, 2);
}
