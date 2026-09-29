/**
 * Regression tests for a hang in HoloScriptPlusParser.parse(): certain
 * constructs sent a parse loop spinning forever without consuming a token
 * or making any other forward progress. Since parsing is synchronous, this
 * is a genuine process hang, not a slow parse — it blocks any tool that
 * calls .parse() on the affected source (LSP, watch mode, repo-wide
 * sweeps). Board task_1790634481269_amrk.
 *
 * Found via two real Hololand files that never returned:
 *
 * 1. `packages/platform/ui/src/components/Button.hsplus` (line 149) hangs in
 *    parseMatchExpression()'s case loop. `match true { <expr> => ... }` is a
 *    boolean-guard-chain idiom where each case "pattern" is an arbitrary
 *    expression (e.g. `!self.enabled`), not a literal/identifier/`_`.
 *    parseMatchPattern() only recognizes the latter; for anything else it
 *    calls this.error(...) (recording a positioned diagnostic) and returns
 *    null WITHOUT consuming a token. parseMatchExpression's while loop did
 *    not notice the lack of progress and retried the same token forever.
 *
 * 2. `library/src/Compiler/Parser.hsplus` (packages/platform/library/...,
 *    struct ASTNode, line 83) hangs in parseStructBlock()'s field loop via
 *    recoverStructField(). A struct field starting with an unsupported
 *    token (`[` for a TS-style index signature `[key: string]: any`) is
 *    rejected by isStructFieldNameToken(). recoverStructField() seeded its
 *    boundary scan from `this.previous()`, which — whenever the struct
 *    already had a prior field — is the NEWLINE token skipStructWhitespace()
 *    had just consumed. A NEWLINE token's own `.offset` IS the newline
 *    character's position, so the very next boundary scan re-found that
 *    same already-spent newline immediately and returned having consumed
 *    nothing, forever.
 *
 * Both are fixed by guaranteeing the loop makes progress (or the recovery
 * helper it calls does) at the exact point it could stall, while still
 * reporting a normal positioned parser error — not by adding a global
 * iteration cap that would silently truncate parsing elsewhere.
 *
 * The Hololand files themselves are external, read-only inputs (not part of
 * this repo) and are not copied here; these are minimal, self-contained
 * reproductions of the same two constructs, plus full-file sweeps recorded
 * separately in the PR description.
 */
import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { HoloScriptPlusParser, type HSPlusParseResult } from '../HoloScriptPlusParser';

/**
 * Runs `parser.parse(source)` under a hard wall-clock bound using node:vm's
 * script-execution timeout.
 *
 * A plain `Promise`/`setTimeout` race (or vitest's own per-test `timeout`
 * option) cannot detect this failure: the hang is a purely synchronous loop
 * with no `await` or I/O, so it starves the event loop and nothing —
 * including a timer meant to abort it — ever gets a chance to run. V8's
 * `vm.Script` timeout is different: it can interrupt synchronous JS
 * execution mid-loop (the same mechanism Node uses to bound untrusted
 * scripts), so it is the one thing that reliably turns "the process hangs
 * forever" into an observable, fast test failure. `parser` and `source` are
 * plain data/objects passed into the sandbox; only the `parser.parse(...)`
 * call itself runs inside the bounded context.
 */
function parseWithBoundedTime(
  parser: HoloScriptPlusParser,
  source: string,
  ms: number
): { hung: boolean; result?: HSPlusParseResult } {
  const sandbox: { parser: HoloScriptPlusParser; source: string; result?: HSPlusParseResult } = {
    parser,
    source,
    result: undefined,
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext('result = parser.parse(source);', sandbox, { timeout: ms });
    return { hung: false, result: sandbox.result };
  } catch (e) {
    const hung = e instanceof Error && /timed out/i.test(e.message);
    if (!hung) throw e;
    return { hung: true };
  }
}

describe('HoloScriptPlusParser - reader hang regression', () => {
  // Per-test timeout is intentionally short: on the fixed parser both cases
  // return in single-digit milliseconds. 5s leaves headroom for CI jitter
  // while still failing (not hanging the suite) quickly if the bug returns.
  const TEST_TIMEOUT_MS = 5000;
  const BOUND_MS = 2000;

  it(
    'does not hang on `match true { <expr> => ... }` (Button.hsplus repro)',
    () => {
      const parser = new HoloScriptPlusParser({ enableVRTraits: true });
      // Minimal reduction of Button.hsplus line 149 (`let bgColor: string =
      // match true { !self.enabled => ..., ... }` inside a @method body): the
      // hang is in parseMatchExpression's case loop, reachable from any value
      // position, so an object-property value exercises the identical path
      // without depending on @method body handling.
      const source = [
        'orb Button {',
        '  color: match true {',
        '    !self.enabled => self.disabledColor,',
        '    self.state == ButtonState.pressed => self.pressedColor,',
        '    _ => self.backgroundColor',
        '  }',
        '}',
      ].join('\n');

      const { hung, result } = parseWithBoundedTime(parser, source, BOUND_MS);

      expect(hung).toBe(false);
      expect(result).toBeDefined();
      // `!self.enabled` as a case "pattern" is a boolean-guard idiom, not the
      // literal/identifier/`_` grammar parseMatchPattern supports. This test
      // is about the hang, not about adding that grammar, so a positioned
      // HSP300 is the expected, correct outcome here: parsing finishes and
      // reports it instead of never returning.
      expect(result!.success).toBe(false);
      expect(
        result!.errors.some(
          (e) => e.code === 'HSP300' && /Unexpected token in expression/.test(e.message)
        )
      ).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'does not hang on a struct index-signature field after a normal field (Parser.hsplus repro)',
    () => {
      const parser = new HoloScriptPlusParser({ enableVRTraits: true });
      const source = ['struct ASTNode {', '  type: NodeType', '  [key: string]: any', '}'].join(
        '\n'
      );

      const { hung, result } = parseWithBoundedTime(parser, source, BOUND_MS);

      expect(hung).toBe(false);
      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
      expect(
        result!.errors.some(
          (e) => e.code === 'HSP100' && /Expected struct field name, got LBRACKET/.test(e.message)
        )
      ).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'still parses a struct whose only field is an index signature (no preceding field)',
    () => {
      // Companion case: when the unsupported `[...]` field is the FIRST thing
      // in the struct body, the pre-fix code happened not to hang (the token
      // before it is a zero-width INDENT marker, not a NEWLINE whose offset
      // collides with the boundary scan). Kept here as a same-family guard so
      // a future refactor of recoverStructField can't quietly re-break this
      // previously-fine case while fixing another.
      const parser = new HoloScriptPlusParser({ enableVRTraits: true });
      const source = ['struct Foo {', '  [key: string]: any', '}'].join('\n');

      const { hung, result } = parseWithBoundedTime(parser, source, BOUND_MS);

      expect(hung).toBe(false);
      expect(result).toBeDefined();
    },
    TEST_TIMEOUT_MS
  );
});
