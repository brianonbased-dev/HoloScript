/**
 * @holoscript/core/compiler/GasOptimizationAnalyzer
 *
 * Hand-crafted declarations mirroring
 * packages/core/src/compiler/GasOptimizationAnalyzer.ts.
 */

export type GasOptimizationSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type GasOptimizationCategory =
  | 'storage'
  | 'arithmetic'
  | 'loops'
  | 'errors'
  | 'memory'
  | 'external-calls'
  | 'visibility';

export interface CodeLocation {
  file: string;
  line: number;
  column: number;
  length: number;
  snippet?: string;
}

export interface GasOptimization {
  id: string;
  severity: GasOptimizationSeverity;
  category: GasOptimizationCategory;
  location: CodeLocation;
  issue: string;
  suggestion: string;
  potentialSavings: number;
  autoFixAvailable: boolean;
  autoFix?: string;
}

export interface GasAnalysisReport {
  totalOptimizations: number;
  totalPotentialSavings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  optimizations: GasOptimization[];
  summary: string[];
  appliedFixes?: number;
}

export interface AnalyzerOptions {
  enableAutoFix: boolean;
  severityThreshold: GasOptimizationSeverity;
  categories: string[];
  ignorePatterns?: string[];
}

export declare class GasOptimizationAnalyzer {
  constructor(options?: Partial<AnalyzerOptions>);
  analyze(code: string, filename?: string): GasAnalysisReport;
}

export declare const ANALYZER_PRESETS: {
  readonly production: {
    enableAutoFix: false;
    severityThreshold: 'medium';
    categories: string[];
  };
  readonly development: {
    enableAutoFix: true;
    severityThreshold: 'info';
    categories: string[];
  };
};
