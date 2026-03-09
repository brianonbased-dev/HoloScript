import { CyclomaticComplexity } from './metrics/CyclomaticComplexity.js';
import { NestingDepth } from './metrics/NestingDepth.js';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface FileComplexity {
  filePath: string;
  cyclomaticComplexity: number;
  nestingDepth: number;
  lineCount: number;
  grade: Grade;
  recommendations: string[];
}

export interface ComplexityReport {
  files: FileComplexity[];
  averageCC: number;
  averageDepth: number;
  overallGrade: Grade;
  summary: string;
}

export interface ComplexityAnalyzerOptions {
  ccThresholdWarn?: number;
  ccThresholdError?: number;
  depthThreshold?: number;
}

export class ComplexityAnalyzer {
  private readonly ccWarn: number;
  private readonly ccError: number;
  private readonly depthThreshold: number;
  private readonly cc: CyclomaticComplexity;
  private readonly nd: NestingDepth;

  constructor(options: ComplexityAnalyzerOptions = {}) {
    this.ccWarn = options.ccThresholdWarn ?? 8;
    this.ccError = options.ccThresholdError ?? 15;
    this.depthThreshold = options.depthThreshold ?? 4;
    this.cc = new CyclomaticComplexity();
    this.nd = new NestingDepth();
  }

  analyze(files: Map<string, string>): ComplexityReport {
    const fileResults: FileComplexity[] = [];
    for (const [filePath, content] of files) {
      const cyclomaticComplexity = this.cc.calculate(content);
      const nestingResult = this.nd.calculate(content);
      const nestingDepth = nestingResult.maxDepth;
      const lineCount = content.split('\n').length;
      const grade = ComplexityAnalyzer.gradeFor(cyclomaticComplexity, nestingDepth);
      const recommendations = this._buildRecommendations(
        filePath,
        cyclomaticComplexity,
        nestingDepth,
        lineCount
      );
      fileResults.push({
        filePath,
        cyclomaticComplexity,
        nestingDepth,
        lineCount,
        grade,
        recommendations,
      });
    }
    if (fileResults.length === 0) {
      return {
        files: [],
        averageCC: 0,
        averageDepth: 0,
        overallGrade: 'A',
        summary: 'No files analyzed.',
      };
    }
    const averageCC =
      fileResults.reduce((s, f) => s + f.cyclomaticComplexity, 0) / fileResults.length;
    const averageDepth = fileResults.reduce((s, f) => s + f.nestingDepth, 0) / fileResults.length;
    const overallGrade = ComplexityAnalyzer.gradeFor(
      Math.round(averageCC),
      Math.round(averageDepth)
    );
    const problematic = fileResults.filter(
      (f) => f.grade === 'C' || f.grade === 'D' || f.grade === 'F'
    );
    const summary =
      problematic.length === 0
        ? 'All ' + fileResults.length + ' file(s) meet complexity thresholds.'
        : problematic.length +
          ' of ' +
          fileResults.length +
          ' file(s) exceed complexity thresholds.';
    return {
      files: fileResults,
      averageCC: Math.round(averageCC * 100) / 100,
      averageDepth: Math.round(averageDepth * 100) / 100,
      overallGrade,
      summary,
    };
  }

  static gradeFor(cc: number, depth: number): Grade {
    if (cc > 20 || depth > 5) return 'F';
    if (cc > 12 || depth > 4) return 'D';
    if (cc > 8 || depth > 3) return 'C';
    if (cc > 5 || depth > 2) return 'B';
    return 'A';
  }

  private _buildRecommendations(
    _filePath: string,
    cc: number,
    depth: number,
    lineCount: number
  ): string[] {
    const recs: string[] = [];
    if (cc > this.ccError) {
      recs.push(
        'High cyclomatic complexity (' +
          cc +
          '): consider breaking this file into smaller functions.'
      );
    } else if (cc > this.ccWarn) {
      recs.push(
        'Elevated cyclomatic complexity (' + cc + '): review branching logic for simplification.'
      );
    }
    if (depth > this.depthThreshold) {
      recs.push(
        'Deep nesting detected (depth ' + depth + '): extract nested blocks into named functions.'
      );
    }
    if (lineCount > 300) {
      recs.push(
        'File is large (' + lineCount + ' lines): consider splitting into smaller modules.'
      );
    }
    return recs;
  }
}
