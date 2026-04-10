/**
 * HoloScript Formatter Configuration
 *
 * Configuration types and defaults for the HoloScript formatter.
 * Extracted to break circular dependency between index.ts and ConfigLoader.ts
 */

// =============================================================================
// TYPES
// =============================================================================

export type BraceStyle = 'same-line' | 'next-line' | 'stroustrup';
export type TrailingComma = 'none' | 'all' | 'multi-line';
export type ImportSortOrder = 'alphabetical' | 'grouped';
export type ImportGroupOrder = 'builtin' | 'external' | 'internal' | 'relative';

export interface FormatterConfig {
  // Indentation
  indentSize: number;
  useTabs: boolean;

  // Line length
  maxLineLength: number;

  // Braces
  braceStyle: BraceStyle;

  // Arrays/Objects
  trailingComma: TrailingComma;
  bracketSpacing: boolean;

  // Semicolons (HSPlus)
  semicolons: boolean;

  // Quotes
  singleQuote: boolean;

  // Imports
  sortImports: boolean;
  importSortOrder: ImportSortOrder;
  importGroupOrder: ImportGroupOrder[];
  importGroupSeparator: boolean;

  // Blank lines
  maxBlankLines: number;
  blankLineBeforeComposition: boolean;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_CONFIG: FormatterConfig = {
  indentSize: 2,
  useTabs: false,
  maxLineLength: 100,
  braceStyle: 'same-line',
  trailingComma: 'multi-line',
  bracketSpacing: true,
  semicolons: false,
  singleQuote: false,
  sortImports: true,
  importSortOrder: 'grouped',
  importGroupOrder: ['builtin', 'external', 'internal', 'relative'],
  importGroupSeparator: true,
  maxBlankLines: 1,
  blankLineBeforeComposition: true,
};
