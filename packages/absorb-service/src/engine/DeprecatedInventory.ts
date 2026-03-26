/**
 * Deprecated Symbol Inventory
 *
 * SCARF-inspired symbol-level deprecation tracking.
 * Classifies deprecated symbols as DEAD, REFERENCED, or DYNAMIC.
 *
 * Gap 5: Deprecated directory cleanup.
 *
 * @version 1.0.0
 */

/**
 * Classification of a deprecated symbol
 */
export type SymbolClassification = 'DEAD' | 'REFERENCED' | 'DYNAMIC';

/**
 * A deprecated symbol entry in the inventory
 */
export interface DeprecatedSymbol {
  /** Symbol name (function, class, type, etc.) */
  symbolName: string;
  /** File path where the symbol is defined */
  filePath: string;
  /** Type of export */
  exportType: 'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'default' | 'unknown';
  /** Classification based on usage analysis */
  classification: SymbolClassification;
  /** Number of files that import this symbol */
  importerCount: number;
  /** Files that import this symbol */
  importerFiles: string[];
  /** Suggested replacement (if known) */
  suggestedReplacement?: string;
  /** Whether this symbol is used in MCP tool calls at runtime */
  usedInMCPRuntime?: boolean;
}

/**
 * Full inventory of deprecated symbols
 */
export interface DeprecatedInventory {
  /** Timestamp of inventory generation */
  generatedAt: string;
  /** Total deprecated symbols found */
  totalSymbols: number;
  /** Breakdown by classification */
  byClassification: {
    DEAD: number;
    REFERENCED: number;
    DYNAMIC: number;
  };
  /** All symbol entries */
  symbols: DeprecatedSymbol[];
}

/**
 * Migration action for a deprecated symbol
 */
export type MigrationAction = 'delete' | 'codemod' | 'promote' | 'manual';

/**
 * Migration plan for a deprecated symbol
 */
export interface MigrationPlan {
  symbol: DeprecatedSymbol;
  action: MigrationAction;
  targetPath?: string;
  codemodDescription?: string;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Inventory builder that scans source files for deprecated symbol usage
 */
export class DeprecatedInventoryBuilder {
  private symbols: DeprecatedSymbol[] = [];

  /**
   * Add a deprecated symbol from a deprecated file
   */
  addSymbol(
    symbolName: string,
    filePath: string,
    exportType: DeprecatedSymbol['exportType'] = 'unknown'
  ): void {
    this.symbols.push({
      symbolName,
      filePath,
      exportType,
      classification: 'DEAD',
      importerCount: 0,
      importerFiles: [],
    });
  }

  /**
   * Record an import site for a deprecated symbol
   */
  recordImporter(symbolName: string, importerFile: string): void {
    const symbol = this.symbols.find(s => s.symbolName === symbolName);
    if (symbol) {
      if (!symbol.importerFiles.includes(importerFile)) {
        symbol.importerFiles.push(importerFile);
        symbol.importerCount = symbol.importerFiles.length;
      }
      symbol.classification = 'REFERENCED';
    }
  }

  /**
   * Mark a symbol as dynamically referenced (string-based)
   */
  markDynamic(symbolName: string): void {
    const symbol = this.symbols.find(s => s.symbolName === symbolName);
    if (symbol) {
      symbol.classification = 'DYNAMIC';
    }
  }

  /**
   * Mark a symbol as used in MCP runtime
   */
  markMCPRuntime(symbolName: string): void {
    const symbol = this.symbols.find(s => s.symbolName === symbolName);
    if (symbol) {
      symbol.usedInMCPRuntime = true;
      // MCP runtime usage elevates to REFERENCED even if statically dead
      if (symbol.classification === 'DEAD') {
        symbol.classification = 'DYNAMIC';
      }
    }
  }

  /**
   * Set suggested replacement for a symbol
   */
  setSuggestedReplacement(symbolName: string, replacement: string): void {
    const symbol = this.symbols.find(s => s.symbolName === symbolName);
    if (symbol) {
      symbol.suggestedReplacement = replacement;
    }
  }

  /**
   * Build the inventory
   */
  build(): DeprecatedInventory {
    return {
      generatedAt: new Date().toISOString(),
      totalSymbols: this.symbols.length,
      byClassification: {
        DEAD: this.symbols.filter(s => s.classification === 'DEAD').length,
        REFERENCED: this.symbols.filter(s => s.classification === 'REFERENCED').length,
        DYNAMIC: this.symbols.filter(s => s.classification === 'DYNAMIC').length,
      },
      symbols: [...this.symbols],
    };
  }

  /**
   * Generate migration plans for all symbols
   */
  generateMigrationPlans(): MigrationPlan[] {
    return this.symbols.map(symbol => {
      if (symbol.classification === 'DEAD') {
        return {
          symbol,
          action: 'delete' as MigrationAction,
          riskLevel: 'low' as const,
        };
      }

      if (symbol.classification === 'DYNAMIC' || symbol.usedInMCPRuntime) {
        return {
          symbol,
          action: 'manual' as MigrationAction,
          riskLevel: 'high' as const,
          codemodDescription: 'Requires manual review: dynamic/runtime references detected',
        };
      }

      // REFERENCED
      if (symbol.suggestedReplacement) {
        return {
          symbol,
          action: 'codemod' as MigrationAction,
          riskLevel: symbol.importerCount > 10 ? 'high' as const : 'medium' as const,
          codemodDescription: `Replace imports of '${symbol.symbolName}' with '${symbol.suggestedReplacement}'`,
        };
      }

      // No replacement known - promote out of deprecated/
      return {
        symbol,
        action: 'promote' as MigrationAction,
        riskLevel: 'medium' as const,
        codemodDescription: `Promote '${symbol.symbolName}' to proper package location`,
      };
    });
  }

  /**
   * Get summary statistics
   */
  getSummary(): string {
    const inv = this.build();
    return [
      `Deprecated Symbol Inventory (${inv.generatedAt})`,
      `Total: ${inv.totalSymbols}`,
      `  DEAD: ${inv.byClassification.DEAD} (safe to delete)`,
      `  REFERENCED: ${inv.byClassification.REFERENCED} (need migration)`,
      `  DYNAMIC: ${inv.byClassification.DYNAMIC} (need manual review)`,
    ].join('\n');
  }
}

/**
 * Create a new inventory builder
 */
export function createDeprecatedInventoryBuilder(): DeprecatedInventoryBuilder {
  return new DeprecatedInventoryBuilder();
}

/**
 * Extract export names from a TypeScript source file (lightweight parser)
 */
export function extractExportsFromSource(source: string): Array<{ name: string; type: DeprecatedSymbol['exportType'] }> {
  const exports: Array<{ name: string; type: DeprecatedSymbol['exportType'] }> = [];

  // Match export declarations
  const patterns: Array<{ re: RegExp; type: DeprecatedSymbol['exportType'] }> = [
    { re: /export\s+(?:async\s+)?function\s+(\w+)/g, type: 'function' },
    { re: /export\s+class\s+(\w+)/g, type: 'class' },
    { re: /export\s+interface\s+(\w+)/g, type: 'interface' },
    { re: /export\s+type\s+(\w+)/g, type: 'type' },
    { re: /export\s+const\s+(\w+)/g, type: 'const' },
    { re: /export\s+enum\s+(\w+)/g, type: 'enum' },
    { re: /export\s+default\s+(?:class|function)\s+(\w+)/g, type: 'default' },
  ];

  for (const { re, type } of patterns) {
    let match;
    while ((match = re.exec(source)) !== null) {
      exports.push({ name: match[1], type });
    }
  }

  // Match re-exports: export { Foo, Bar } from './something'
  const reExportPattern = /export\s*\{([^}]+)\}/g;
  let reMatch;
  while ((reMatch = reExportPattern.exec(source)) !== null) {
    const names = reMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop()?.trim()).filter(Boolean);
    for (const name of names) {
      if (name && !name.startsWith('type ')) {
        exports.push({ name, type: 'unknown' });
      }
    }
  }

  return exports;
}
