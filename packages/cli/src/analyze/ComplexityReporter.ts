import type { ComplexityReport } from './ComplexityAnalyzer.js';

export class ComplexityReporter {
  formatTable(report: ComplexityReport): string {
    const sep = '-'.repeat(90);
    const colH =
      this._pr('File', 45) + ' ' +
      this._pl('CC', 4) + ' ' +
      this._pl('Depth', 5) + ' ' +
      this._pl('Lines', 5) + ' ' +
      this._pl('Grade', 5);
    const rows = report.files.map(
      (f) =>
        this._pr(f.filePath, 45) + ' ' +
        this._pl(String(f.cyclomaticComplexity), 4) + ' ' +
        this._pl(String(f.nestingDepth), 5) + ' ' +
        this._pl(String(f.lineCount), 5) + ' ' +
        this._pl(f.grade, 5),
    );
    const footer = [
      '',
      'Average CC   : ' + report.averageCC,
      'Average Depth: ' + report.averageDepth,
      'Overall Grade: ' + report.overallGrade,
      'Summary      : ' + report.summary,
    ];
    const recs: string[] = [];
    for (const f of report.files) {
      for (const r of f.recommendations) {
        recs.push('  [' + f.filePath + ']: ' + r);
      }
    }
    const parts = ['Complexity Analysis Report', sep, colH, sep, ...rows, sep, ...footer];
    if (recs.length > 0) {
      parts.push('', 'Recommendations:');
      parts.push(...recs);
    }
    return parts.join('\n');
  }

  formatJSON(report: ComplexityReport): string {
    return JSON.stringify(report, null, 2);
  }

  private _pr(s: string, len: number): string {
    return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
  }

  private _pl(s: string, len: number): string {
    return s.length >= len ? s.slice(0, len) : ' '.repeat(len - s.length) + s;
  }
}
