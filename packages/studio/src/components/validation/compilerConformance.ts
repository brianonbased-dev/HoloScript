/**
 * compilerConformance.ts — the compiler-backed half of the Conformance Runner (H5).
 *
 * Rules 5 (Missing Braces), 6 (Unexpected Token) and 7 (Unknown Trait) are
 * answered by the real HoloScript parser and trait registry from
 * `@holoscript/core` — the same parser `useScenePipeline` already runs in the
 * browser to render the scene — over the scene's source (`useSceneStore.code`).
 *
 * Honesty contract: a rule only reports `passed` when its check actually ran.
 * When a check cannot run (no source yet, the format isn't supported by that
 * check, or the parser itself threw) the rule reports `not_checked` with a
 * plain-language reason. It never defaults to `passed`.
 */
import { parseHolo, HoloScriptPlusParser, buildKnownTraitSet } from '@holoscript/core';

export type RuleStatus = 'pending' | 'running' | 'passed' | 'failed' | 'warning' | 'not_checked';

export interface CompilerRuleResult {
  status: Exclude<RuleStatus, 'pending' | 'running'>;
  /** Plain-language reason a non-coder can act on. Empty only when passed. */
  message: string;
  /** Raw compiler messages, for the details view / audit export. */
  details?: string[];
}

export interface CompilerConformance {
  missingBraces: CompilerRuleResult;
  unexpectedToken: CompilerRuleResult;
  unknownTrait: CompilerRuleResult;
}

interface ParseIssue {
  message: string;
  line?: number;
}

const MAX_LISTED = 5;

function lineOf(e: { loc?: unknown; line?: number }): number | undefined {
  const loc = e.loc as { line?: number; start?: { line?: number } } | undefined;
  return loc?.line ?? loc?.start?.line ?? e.line;
}

function where(line?: number): string {
  return line ? ` (line ${line})` : '';
}

/** Parser messages that mean a `{` block was never closed. */
export function isUnclosedBlock(message: string): boolean {
  return /expected\s+(rbrace|'}')|got eof|unexpected end of (input|file)|unclosed|unterminated block/i.test(
    message
  );
}

function notChecked(message: string): CompilerRuleResult {
  return { status: 'not_checked', message };
}

function collectTraits(node: unknown, out: Array<{ name: string; line?: number }>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectTraits(n, out);
    return;
  }
  const rec = node as Record<string, unknown>;
  if (Array.isArray(rec.traits)) {
    for (const t of rec.traits as Array<{ name?: unknown; loc?: { start?: { line?: number } } }>) {
      if (t && typeof t.name === 'string') {
        out.push({
          name: t.name,
          line:
            t.loc?.start?.line ??
            (rec.loc as { start?: { line?: number } } | undefined)?.start?.line,
        });
      }
    }
  }
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'traits' || k === 'directives' || k === 'loc') continue;
    if (v && typeof v === 'object') collectTraits(v, out);
  }
}

export function evaluateCompilerRules(source: string): CompilerConformance {
  if (!source || !source.trim()) {
    const why =
      'There is no scene code to check yet. Build or load a scene, then run Verify again.';
    return {
      missingBraces: notChecked(why),
      unexpectedToken: notChecked(why),
      unknownTrait: notChecked(why),
    };
  }

  const isComposition = source.trimStart().startsWith('composition');
  let issues: ParseIssue[];
  let ast: unknown;
  try {
    if (isComposition) {
      const result = parseHolo(source);
      ast = result.ast;
      issues = (result.errors ?? []).map((e) => ({ message: String(e.message), line: lineOf(e) }));
    } else {
      const result = new HoloScriptPlusParser().parse(source) as {
        errors?: Array<string | { message?: string; line?: number }>;
      };
      issues = (result.errors ?? []).map((e) =>
        typeof e === 'string' ? { message: e } : { message: String(e.message ?? e), line: e.line }
      );
    }
  } catch (err) {
    const why =
      'The checker stopped before it could read this scene, so this rule was not checked. ' +
      'Try again; if it keeps happening, report it with the details below.';
    const details = [err instanceof Error ? err.message : String(err)];
    return {
      missingBraces: { ...notChecked(why), details },
      unexpectedToken: { ...notChecked(why), details },
      unknownTrait: { ...notChecked(why), details },
    };
  }

  // De-duplicate identical parser messages (the parser can repeat one error per recovery pass).
  const seen = new Set<string>();
  issues = issues.filter((i) => {
    const key = `${i.line ?? ''}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const unclosed = issues.filter((i) => isUnclosedBlock(i.message));
  const other = issues.filter((i) => !isUnclosedBlock(i.message));

  const missingBraces: CompilerRuleResult =
    unclosed.length > 0
      ? {
          status: 'failed',
          message:
            `A block was opened with "{" but never closed${where(unclosed[0].line)}. ` +
            'Add a closing "}" at the end of that block.',
          details: unclosed.slice(0, MAX_LISTED).map((i) => i.message + where(i.line)),
        }
      : { status: 'passed', message: '' };

  const unexpectedToken: CompilerRuleResult =
    other.length > 0
      ? {
          status: 'failed',
          message:
            `The scene has ${other.length === 1 ? 'a part' : `${other.length} parts`} the checker ` +
            `could not read${where(other[0].line)}. Remove or retype the stray text there.`,
          details: other.slice(0, MAX_LISTED).map((i) => i.message + where(i.line)),
        }
      : { status: 'passed', message: '' };

  let unknownTrait: CompilerRuleResult;
  if (!isComposition) {
    unknownTrait = notChecked(
      'Trait names are only checked for .holo compositions; this scene is in another format.'
    );
  } else if (!ast) {
    unknownTrait = notChecked(
      'Trait names could not be checked because the scene could not be read. Fix the problems above first.'
    );
  } else {
    const known = buildKnownTraitSet();
    const found: Array<{ name: string; line?: number }> = [];
    collectTraits(ast, found);
    const unknown = found.filter((t) => !known.has(t.name) && !known.has(t.name.toLowerCase()));
    const names = [...new Set(unknown.map((t) => t.name))];
    unknownTrait =
      names.length > 0
        ? {
            status: 'warning',
            message:
              `${names.length === 1 ? 'This trait is' : 'These traits are'} not known to HoloScript: ` +
              `${names
                .slice(0, MAX_LISTED)
                .map((n) => '@' + n)
                .join(', ')}` +
              `${names.length > MAX_LISTED ? ` and ${names.length - MAX_LISTED} more` : ''}. ` +
              'Check the spelling or pick a trait from the list.',
            details: unknown.slice(0, MAX_LISTED).map((t) => `@${t.name}${where(t.line)}`),
          }
        : { status: 'passed', message: '' };
  }

  return { missingBraces, unexpectedToken, unknownTrait };
}
