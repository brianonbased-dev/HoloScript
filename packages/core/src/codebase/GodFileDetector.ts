/**
 * God File Detector
 *
 * Detects oversized/complex files and generates virtual split plans
 * for the absorb pipeline. Never modifies source files (G.GAP.05 prevention).
 *
 * Gap 4: Absorb pipeline god file handling.
 *
 * @version 1.0.0
 */

/**
 * Metrics for a file
 */
export interface FileMetrics {
  filePath: string;
  loc: number;
  functionCount: number;
  importCount: number;
  exportCount: number;
  classCount: number;
  cyclomaticComplexity: number;
}

/**
 * God file detection result
 */
export type GodFileClassification = 'normal' | 'warning' | 'god_file';

export interface GodFileReport {
  filePath: string;
  classification: GodFileClassification;
  metrics: FileMetrics;
  reasons: string[];
  splitPlan?: VirtualSplitPlan;
}

/**
 * A plan for virtually splitting a god file
 */
export interface VirtualSplitPlan {
  originalPath: string;
  segments: SplitSegment[];
  totalSegments: number;
}

/**
 * A segment of a virtual split
 */
export interface SplitSegment {
  suggestedName: string;
  startLine: number;
  endLine: number;
  type: 'class' | 'function-group' | 'export-cluster' | 'module';
  symbolCount: number;
  description: string;
}

/**
 * Thresholds for god file detection
 */
export interface GodFileThresholds {
  loc_warning: number;
  loc_god: number;
  functions_warning: number;
  functions_god: number;
  complexity_god: number;
  imports_god: number;
}

const DEFAULT_THRESHOLDS: GodFileThresholds = {
  loc_warning: 500,
  loc_god: 1000,
  functions_warning: 20,
  functions_god: 40,
  complexity_god: 50,
  imports_god: 30,
};

/**
 * God File Detector
 */
export class GodFileDetector {
  private thresholds: GodFileThresholds;

  constructor(thresholds?: Partial<GodFileThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Analyze a file's content and produce metrics + classification
   */
  analyze(filePath: string, content: string): GodFileReport {
    const metrics = this.computeMetrics(filePath, content);
    const reasons: string[] = [];
    let classification: GodFileClassification = 'normal';

    // Check LOC
    if (metrics.loc >= this.thresholds.loc_god) {
      reasons.push(`LOC ${metrics.loc} >= ${this.thresholds.loc_god} (god file threshold)`);
      classification = 'god_file';
    } else if (metrics.loc >= this.thresholds.loc_warning) {
      reasons.push(`LOC ${metrics.loc} >= ${this.thresholds.loc_warning} (warning threshold)`);
      classification = 'warning';
    }

    // Check function count
    if (metrics.functionCount >= this.thresholds.functions_god) {
      reasons.push(
        `Functions ${metrics.functionCount} >= ${this.thresholds.functions_god} (god file threshold)`
      );
      classification = 'god_file';
    } else if (metrics.functionCount >= this.thresholds.functions_warning) {
      reasons.push(
        `Functions ${metrics.functionCount} >= ${this.thresholds.functions_warning} (warning threshold)`
      );
      if (classification !== 'god_file') classification = 'warning';
    }

    // Check cyclomatic complexity
    if (metrics.cyclomaticComplexity >= this.thresholds.complexity_god) {
      reasons.push(
        `Cyclomatic complexity ${metrics.cyclomaticComplexity} >= ${this.thresholds.complexity_god}`
      );
      classification = 'god_file';
    }

    // Check import count
    if (metrics.importCount >= this.thresholds.imports_god) {
      reasons.push(`Imports ${metrics.importCount} >= ${this.thresholds.imports_god}`);
      if (classification !== 'god_file') classification = 'warning';
    }

    const report: GodFileReport = {
      filePath,
      classification,
      metrics,
      reasons,
    };

    // Generate split plan for god files
    if (classification === 'god_file') {
      report.splitPlan = this.suggestSplit(filePath, content, metrics);
    }

    return report;
  }

  /**
   * Compute metrics for a file
   */
  computeMetrics(filePath: string, content: string): FileMetrics {
    const lines = content.split('\n');
    const loc = lines.filter((l) => l.trim().length > 0 && !l.trim().startsWith('//')).length;

    // Count functions (function declarations, arrow functions, methods)
    const functionPattern =
      /\b(function\s+\w+|(?:async\s+)?(?:get|set)?\s*\w+\s*\(.*\)\s*(?::\s*\w[\w<>,\s|]*\s*)?{|\w+\s*=\s*(?:async\s+)?(?:\(.*\)|[\w]+)\s*=>)/g;
    const functionCount = (content.match(functionPattern) || []).length;

    // Count imports
    const importPattern = /\bimport\s+(?:type\s+)?(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from/g;
    const importCount = (content.match(importPattern) || []).length;

    // Count exports
    const exportPattern =
      /\bexport\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)/g;
    const exportCount = (content.match(exportPattern) || []).length;

    // Count classes
    const classPattern = /\bclass\s+\w+/g;
    const classCount = (content.match(classPattern) || []).length;

    // Cyclomatic complexity (approximation: count decision points)
    const complexityPatterns =
      /\b(if|else if|for|while|do|switch|case|catch|\?\?|&&|\|\||ternary)\b|\?(?!=)/g;
    const cyclomaticComplexity = (content.match(complexityPatterns) || []).length + 1;

    return {
      filePath,
      loc,
      functionCount,
      importCount,
      exportCount,
      classCount,
      cyclomaticComplexity,
    };
  }

  /**
   * Suggest a virtual split plan for a god file.
   * Only splits at top-level declaration boundaries (G.GAP.05 prevention).
   */
  suggestSplit(filePath: string, content: string, metrics: FileMetrics): VirtualSplitPlan {
    const lines = content.split('\n');
    const segments: SplitSegment[] = [];
    const baseName =
      filePath
        .replace(/\.[^.]+$/, '')
        .split(/[/\\]/)
        .pop() || 'module';

    // Find top-level boundaries (classes, large function groups, export clusters)
    let currentStart = 0;
    let currentType: SplitSegment['type'] = 'module';
    let currentName = '';
    let symbolCount = 0;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Track brace depth (only split at depth 0)
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }

      // Detect top-level class declarations
      const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch && braceDepth <= 1) {
        if (i > currentStart + 5) {
          segments.push({
            suggestedName: currentName || `${baseName}-segment-${segments.length}`,
            startLine: currentStart + 1,
            endLine: i,
            type: currentType,
            symbolCount,
            description: `Lines ${currentStart + 1}-${i}`,
          });
        }
        currentStart = i;
        currentType = 'class';
        currentName = classMatch[1];
        symbolCount = 0;
      }

      // Count symbols
      if (trimmed.match(/^(?:export\s+)?(?:const|let|var|function|class|interface|type|enum)\s/)) {
        symbolCount++;
      }
    }

    // Add final segment
    if (currentStart < lines.length - 1) {
      segments.push({
        suggestedName: currentName || `${baseName}-segment-${segments.length}`,
        startLine: currentStart + 1,
        endLine: lines.length,
        type: currentType,
        symbolCount,
        description: `Lines ${currentStart + 1}-${lines.length}`,
      });
    }

    // If we got only 1 segment, try function-group splitting
    if (segments.length <= 1) {
      return this.splitByFunctionGroups(filePath, content, metrics, baseName);
    }

    return {
      originalPath: filePath,
      segments,
      totalSegments: segments.length,
    };
  }

  private splitByFunctionGroups(
    filePath: string,
    content: string,
    _metrics: FileMetrics,
    baseName: string
  ): VirtualSplitPlan {
    const lines = content.split('\n');
    const segmentSize = Math.ceil(lines.length / 3);
    const segments: SplitSegment[] = [];

    for (let i = 0; i < 3; i++) {
      const start = i * segmentSize;
      const end = Math.min((i + 1) * segmentSize, lines.length);
      if (start >= lines.length) break;

      segments.push({
        suggestedName: `${baseName}-part-${i + 1}`,
        startLine: start + 1,
        endLine: end,
        type: 'function-group',
        symbolCount: 0,
        description: `Lines ${start + 1}-${end}`,
      });
    }

    return {
      originalPath: filePath,
      segments,
      totalSegments: segments.length,
    };
  }
}

/**
 * Create a god file detector with custom thresholds
 */
export function createGodFileDetector(thresholds?: Partial<GodFileThresholds>): GodFileDetector {
  return new GodFileDetector(thresholds);
}
