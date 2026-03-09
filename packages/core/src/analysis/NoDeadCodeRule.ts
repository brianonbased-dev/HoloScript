export interface DeadCodeDiagnostic {
  kind: 'composition' | 'template' | 'function' | 'property';
  name: string;
  filePath: string;
  line?: number;
  message: string;
}

export class NoDeadCodeRule {
  check(files: Map<string, string>): DeadCodeDiagnostic[] {
    const allDefs: any[] = [];
    const allRefs: any = new Set();
    for (const [filePath, source] of files) {
      const lines = source.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const tmpl = line.match(/template\s+(["'])([^"']+)/);
        if (tmpl) allDefs.push({ name: tmpl[2], kind: 'template', filePath, line: i + 1 });
        const fnM = line.match(/function\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (fnM) allDefs.push({ name: fnM[1], kind: 'function', filePath, line: i + 1 });
      }
      const usingMs = [...source.matchAll(/using\s+(["'])([^"']+)/g)];
      for (const m of usingMs) allRefs.add(m[2]);
      const identMs = [...source.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*[(.\[]/g)];
      for (const m of identMs) allRefs.add(m[1]);
    }
    return allDefs
      .filter((d) => allRefs.has(d.name) === false)
      .map((d) => ({
        kind: d.kind,
        name: d.name,
        filePath: d.filePath,
        line: d.line,
        message:
          d.kind === 'template'
            ? 'Template ' + d.name + ' is defined but never used'
            : 'Function ' + d.name + ' is never called',
      }));
  }
  formatReport(diagnostics: DeadCodeDiagnostic[]): string {
    if (diagnostics.length === 0) return 'No dead code found. 0 issues.';
    const lines: string[] = ['Dead Code Report: ' + diagnostics.length + ' issue(s) found', ''];
    for (const d of diagnostics) {
      lines.push(d.filePath + ':' + (d.line ?? '?') + ': ' + d.name + ' - ' + d.message);
    }
    return lines.join('\n');
  }
}
