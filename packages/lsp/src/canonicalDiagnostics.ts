import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import {
  validateCanonicalSource,
  type CanonicalSourceSurface,
  type ConsentRules,
} from '@holoscript/core';
import { validate_detailed as validateCanonicalHsDetailed } from '@holoscript/wasm/node';

/**
 * Canonical extension-routed parse of an editor buffer, as LSP diagnostics.
 * allowEmpty: a brand-new file with nothing typed yet is not an error in the editor (no
 * HS1001). The CLI and MCP validate_holoscript still refuse it. Non-blank garbage such as
 * `{{{@@@` still reports errors.
 * consentRules: the .hs render_likeness result. The server has no source for it yet, so it
 * passes none and every likeness source (@face_mesh, @voice_print, @body_scan) shows HS1011
 * as an error: fail closed.
 */
export function canonicalSourceDiagnostics(
  text: string,
  surface: CanonicalSourceSurface,
  consentRules?: ConsentRules
) {
  const parseResult = validateCanonicalSource(
    { source: text, surface, allowEmpty: true, consentRules },
    { validateHsDetailed: validateCanonicalHsDetailed }
  );
  const diagnostics: Diagnostic[] = [];
  const push = (
    d: { line?: number; column?: number; message: string; code?: string },
    severity: DiagnosticSeverity
  ) =>
    diagnostics.push({
      severity,
      range: {
        start: { line: (d.line || 1) - 1, character: (d.column || 1) - 1 },
        end: { line: (d.line || 1) - 1, character: (d.column || 1) + 20 },
      },
      message: d.message,
      source: `holoscript-${parseResult.validator}`,
      ...(d.code ? { code: d.code } : {}),
    });
  for (const error of parseResult.errors ?? []) push(error, DiagnosticSeverity.Error);
  for (const warning of parseResult.warnings ?? []) push(warning, DiagnosticSeverity.Warning);
  return { parseResult, diagnostics };
}
