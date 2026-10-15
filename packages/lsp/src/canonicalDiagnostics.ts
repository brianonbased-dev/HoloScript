import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { validateCanonicalSource, type CanonicalSourceSurface } from '@holoscript/core';
import { validate_detailed as validateCanonicalHsDetailed } from '@holoscript/wasm/node';

/**
 * Canonical extension-routed parse of an editor buffer, as LSP diagnostics.
 * allowEmpty: a brand-new file with nothing typed yet is not an error in the editor
 * (no HS1001). The CLI and MCP validate_holoscript still refuse it. Non-blank garbage
 * such as `{{{@@@` still reports errors.
 */
export function canonicalSourceDiagnostics(text: string, surface: CanonicalSourceSurface) {
  const parseResult = validateCanonicalSource(
    { source: text, surface, allowEmpty: true },
    { validateHsDetailed: validateCanonicalHsDetailed }
  );
  const diagnostics: Diagnostic[] = [];
  const push = (d: { line?: number; column?: number; message: string }, severity: DiagnosticSeverity) =>
    diagnostics.push({
      severity,
      range: {
        start: { line: (d.line || 1) - 1, character: (d.column || 1) - 1 },
        end: { line: (d.line || 1) - 1, character: (d.column || 1) + 20 },
      },
      message: d.message,
      source: `holoscript-${parseResult.validator}`,
    });
  for (const error of parseResult.errors ?? []) push(error, DiagnosticSeverity.Error);
  for (const warning of parseResult.warnings ?? []) push(warning, DiagnosticSeverity.Warning);
  return { parseResult, diagnostics };
}
