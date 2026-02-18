export interface ComplexityResult {
  name: string;
  complexity: number;
  line?: number;
}

export class CyclomaticComplexity {
  calculate(source: string): number {
    let complexity = 1;
    const cleaned = this._removeStrings(source);
    const noComments = this._removeComments(cleaned);
    const ifMatches = (noComments.match(/\bif\b/g) || []).length;
    complexity += ifMatches;
    const patterns: RegExp[] = [
      /\bmatch\b/g,
      /\bswitch\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /&&/g,
      /\|\|/g,
      /\?\?/g,
    ];
    for (const p of patterns) {
      const m = noComments.match(p);
      if (m) complexity += m.length;
    }
    return complexity;
  }
  analyzeFile(source: string, filePath: string): ComplexityResult[] {
    const results: ComplexityResult[] = [];
    const blockRe = /^[ \t]*(composition|fn|function)\s+(\w+)\s*[({]/gm;
    const blocks: Array<{ name: string; startLine: number; startIndex: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(source)) !== null) {
      const ln = source.slice(0, m.index).split('\n').length;
      blocks.push({ name: m[2], startLine: ln, startIndex: m.index });
    }
    if (blocks.length === 0) {
      const name = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? filePath;
      results.push({ name, complexity: this.calculate(source), line: 1 });
      return results;
    }
    for (let i = 0; i < blocks.length; i++) {
      const start = blocks[i].startIndex;
      const end = i + 1 < blocks.length ? blocks[i + 1].startIndex : source.length;
      results.push({
        name: blocks[i].name,
        complexity: this.calculate(source.slice(start, end)),
        line: blocks[i].startLine,
      });
    }
    return results;
  }
  private _removeStrings(source: string): string {
    // Simple removal: replace double-quoted, single-quoted, and template strings
    return source.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '').replace(/`[^`]*`/g, '');
  }
  private _removeComments(source: string): string {
    return source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  }
}
