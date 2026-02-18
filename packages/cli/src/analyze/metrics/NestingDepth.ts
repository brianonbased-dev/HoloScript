export interface NestingResult {
  maxDepth: number;
  averageDepth: number;
  deepestLine?: number;
}

export class NestingDepth {
  calculate(source: string): NestingResult {
    const noComments = this._removeComments(source);
    const lines = noComments.split('\n');
    let currentDepth = 0;
    let maxDepth = 0;
    let deepestLine: number | undefined;
    let totalDepth = 0;
    let lineCount = 0;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      for (const ch of line) {
        if (ch === '{') {
          currentDepth++;
          if (currentDepth > maxDepth) {
            maxDepth = currentDepth;
            deepestLine = lineIndex + 1;
          }
        } else if (ch === '}') {
          currentDepth = Math.max(0, currentDepth - 1);
        }
      }
      totalDepth += currentDepth;
      lineCount++;
    }
    const averageDepth = lineCount > 0 ? totalDepth / lineCount : 0;
    return {
      maxDepth,
      averageDepth: Math.round(averageDepth * 100) / 100,
      deepestLine: maxDepth > 0 ? deepestLine : undefined,
    };
  }
  private _removeComments(source: string): string {
    return source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  }
}
