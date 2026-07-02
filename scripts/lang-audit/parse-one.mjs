/**
 * Shared per-file parse logic for the BLAST 1/3 language-integrity audit.
 *
 * Mirrors packages/cli/src/cli.ts's `validate`/`parse` subcommand branching
 * EXACTLY (same parser classes, same success-computation) so this audit
 * measures the SAME parser every live tool (CLI, parse_hs/validate_holoscript
 * MCP tools) actually uses today -- confirmed via research 2026-07-02 that
 * @holoscript/core's HoloScriptPlusParser/HoloScriptCodeParser are a pure TS
 * implementation, NOT a wrapper around the separate, unwired Rust/WASM
 * compiler-wasm module. Measuring compiler-wasm instead would tell us
 * nothing about what's actually poisoning the coder-eval corpus today.
 *
 * G2 (lying success flag): for .hsplus, never trust `result.success` --
 * compute pass/fail from `errors.length === 0`, exactly like cli.ts:1041.
 */
import fs from 'node:fs';

export async function parseOneFile(absPath) {
  const ext = absPath.slice(absPath.lastIndexOf('.'));
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf-8');
  } catch (e) {
    return { file: absPath, ext, outcome: 'read-error', errorCount: null, error: String(e) };
  }

  const outcome = await parseContent(content, ext);
  if (outcome.errored) {
    return { file: absPath, ext, outcome: 'exception', errorCount: null, error: outcome.error };
  }

  const pass = outcome.errorCount === 0;

  // G1 newline-invariance check: reparse with the trailing newline flipped.
  // A file whose verdict changes based on trailing-newline presence alone is
  // hitting the reproduced EOF-DEDENT bug -- flag it regardless of which way
  // the base parse went, since either direction is a real integrity problem.
  const flipped = content.endsWith('\n') ? content.replace(/\n+$/, '') : content + '\n';
  const flippedOutcome = await parseContent(flipped, ext);
  const newlineInvariant = !flippedOutcome.errored && (flippedOutcome.errorCount === 0) === pass;

  return {
    file: absPath,
    ext,
    outcome: pass ? 'pass' : 'fail',
    errorCount: outcome.errorCount,
    newlineInvariant,
  };
}

async function parseContent(content, ext) {
  try {
    if (ext === '.holo') {
      const { HoloCompositionParser } = await import('@holoscript/core');
      const result = new HoloCompositionParser().parse(content);
      return { errorCount: result.success ? 0 : (result.errors?.length ?? 1) };
    }
    if (ext === '.hsplus') {
      const { HoloScriptPlusParser } = await import('@holoscript/core');
      const result = new HoloScriptPlusParser().parse(content);
      const errors = result.errors ?? [];
      return { errorCount: errors.length };
    }
    // .hs: pipeline vs plain code, mirroring cli.ts's stricter pipeline detection.
    const { parsePipeline, HoloScriptCodeParser } = await import('@holoscript/core');
    const contentNoComments = content.replace(/\/\/[^\n]*/g, '');
    const isPipeline = /^[ \t]*pipeline\s+["']?\w/m.test(contentNoComments);
    if (isPipeline) {
      const result = parsePipeline(content);
      return { errorCount: result.success ? 0 : (result.errors?.length ?? 1) };
    }
    const result = new HoloScriptCodeParser().parse(content);
    const success = result.success ?? false;
    return { errorCount: success ? 0 : (result.errors?.length ?? 1) };
  } catch (e) {
    return { errored: true, error: e instanceof Error ? e.message : String(e) };
  }
}
