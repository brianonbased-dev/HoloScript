/**
 * Brittney's self-check: does the code she is about to put in the editor
 * actually draw?
 *
 * Until 2026-09-28 nothing on her path looked at the HoloScript she wrote.
 * `apply_code` handed the model's text straight to the browser, the viewport
 * then failed to draw it, and the parse errors never reached her, so she could
 * not know, let alone fix it. The route now runs this on every `apply_code`
 * call. A failure goes back to her as the tool's result, in the same turn, and
 * she repairs it before anything reaches the person.
 *
 * The check is the viewport's own pipeline (runScenePipeline), not a stricter
 * or looser copy: what passes here is exactly what the Studio can draw.
 */
import { runScenePipeline } from '@/lib/scenePipeline';
import type { PipelineResult } from '@/types';

export type AppliedCodeCheck = { ok: true } | { ok: false; errors: string[] };

/** At most this many errors go back to the model; the first few are the useful ones. */
const MAX_ERRORS = 5;

function codeFrom(input: Record<string, unknown>): string {
  return typeof input['code'] === 'string' ? input['code'] : '';
}

/**
 * `draw` is always the viewport's pipeline in production. It is a parameter so
 * a test can hand the check a result no real input produces today: measured
 * 2026-09-28, everything that parses yields a tree (a comment alone gives a
 * fragment), so the "parsed, nothing to draw" refusal below is a guard for a
 * future compiler, and only an injected result can prove it still refuses.
 */
export function checkAppliedCode(
  input: Record<string, unknown>,
  draw: (code: string) => PipelineResult = runScenePipeline
): AppliedCodeCheck {
  const code = codeFrom(input);
  if (!code.trim()) {
    return { ok: false, errors: ['apply_code was called without any HoloScript code'] };
  }
  const drawn = draw(code);
  if (drawn.errors.length > 0) {
    return {
      ok: false,
      errors: drawn.errors
        .slice(0, MAX_ERRORS)
        .map((e) => (typeof e.line === 'number' ? `line ${e.line}: ${e.message}` : e.message)),
    };
  }
  if (!drawn.r3fTree) {
    return { ok: false, errors: ['The code parsed, but produced nothing the Studio can draw'] };
  }
  return { ok: true };
}

/** The tool result Brittney reads when her code does not draw. */
export function repairRequest(errors: string[]): string {
  return [
    'The Studio could not draw this HoloScript, so it was NOT applied. Errors:',
    ...errors.map((e, i) => `${i + 1}. ${e}`),
    'Fix these and call apply_code again with the complete corrected code.',
  ].join('\n');
}

/** What the person sees in the chat while she repairs it. */
export function repairNotice(errors: string[]): string {
  return `The Studio could not draw that yet, so Brittney is fixing it: ${errors[0] ?? 'unknown error'}`;
}
