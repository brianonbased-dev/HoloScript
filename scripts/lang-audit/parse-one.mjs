/**
 * Shared per-file parse logic for the BLAST language-integrity audit.
 *
 * Mirrors packages/cli/src/cli.ts's `validate`/`parse` subcommand branching
 * through assertReallyValid(), so this audit measures the same parser every live
 * tool (CLI, parse_hs/validate_holoscript MCP tools) actually uses today while
 * refusing the known false-positive modes:
 *   - errors hidden behind `success: true`,
 *   - trailing-newline verdict drift,
 *   - AST node loss where source declarations can be counted.
 */
import fs from 'node:fs';
import { checkReallyValid } from './assert-really-valid.mjs';

export async function parseOneFile(absPath) {
  const ext = absPath.slice(absPath.lastIndexOf('.'));
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf-8');
  } catch (e) {
    return { file: absPath, ext, outcome: 'read-error', errorCount: null, error: String(e) };
  }

  const outcome = await checkReallyValid(content, ext);

  return {
    file: absPath,
    ext,
    outcome: outcome.ok ? 'pass' : 'fail',
    errorCount: outcome.primary.errorCount,
    newlineInvariant: outcome.newlineInvariant,
    nodeCountFidelity: outcome.nodeCountFidelity,
    sourceNodeCount: outcome.sourceNodeCount.count,
    astNodeCount: outcome.astNodeCount,
    guardErrors: outcome.diagnostics.map((d) => d.code),
  };
}
