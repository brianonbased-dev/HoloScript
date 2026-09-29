const WHITESPACE = /\s/;

/** `composition` in any ASCII letter case, not followed by an identifier character. */
const COMPOSITION_KEYWORD = /composition(?![A-Za-z0-9_])/iy;

/**
 * Does this HoloScript text open as a `.holo` composition?
 *
 * Studio renders text that arrives without a file name (the /create editor, the
 * Preview tab, share links, Brittney's build pane), so it decides from the text
 * which parser reads it. The answer is "yes" exactly when the first token the
 * `.holo` lexer (packages/core/src/parser/composition/lexer.ts) produces is the
 * `composition` keyword, which is the test `HoloCompositionParser.parse` makes
 * before it calls `parseComposition`.
 *
 * Skipped before the keyword, as the lexer skips them:
 * - whitespace and blank lines;
 * - `//` line comments, which end only at "\n" (the lexer does not end one at a
 *   lone "\r");
 * - block comments. An unclosed one runs to the end of the text, so nothing after
 *   it counts.
 *
 * The keyword is matched the way the lexer matches keywords: in any letter case,
 * and only as a whole word (`compositions` and `composition_2` are identifiers).
 *
 * Deliberately not skipped, because the lexer does not treat them as comments:
 * `#` lines, including a `#!` shebang (`#` is a real token), and `import` or
 * `using` statements. The lexer also drops stray characters such as `$`; those
 * are not skipped here either, so this never says "composition" where the parser
 * would not. `holoCompositionSource.test.ts` holds it to the real lexer.
 */
export function isHoloCompositionSource(source: string): boolean {
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (WHITESPACE.test(ch)) {
      i += 1;
    } else if (ch === '/' && source[i + 1] === '/') {
      const lineEnd = source.indexOf('\n', i + 2);
      if (lineEnd === -1) return false;
      i = lineEnd + 1;
    } else if (ch === '/' && source[i + 1] === '*') {
      const commentEnd = source.indexOf('*/', i + 2);
      if (commentEnd === -1) return false;
      i = commentEnd + 2;
    } else {
      break;
    }
  }
  COMPOSITION_KEYWORD.lastIndex = i;
  return COMPOSITION_KEYWORD.test(source);
}

/** How the caller says the text should be read: `auto` decides from the text. */
export type SceneSourceFormatHint = 'auto' | 'holo' | 'hsplus';

/** The part of a parse result the choice looks at. */
interface ParseOutcome {
  errors?: readonly unknown[];
}

/** Which parser's reading to use, with that parser's result. */
export type SceneSourceReading<C, H> =
  { form: 'composition'; result: C } | { form: 'hsplus'; result: H };

function hasErrors(outcome: ParseOutcome): boolean {
  return !!outcome.errors && outcome.errors.length > 0;
}

/**
 * Read scene text with the right parser: the one choice Studio's viewport makes.
 *
 * With `auto`, text that opens as a composition (see isHoloCompositionSource) is
 * read by the composition parser. `.hsplus` has composition blocks too, with its
 * own syntax (arrow-function handlers, for one), and many `.hsplus` files open
 * with a comment. So when the composition parser rejects the text and the
 * `.hsplus` parser accepts it, the `.hsplus` reading is used, which is how
 * Studio read comment-led text before it looked past comments. When neither
 * accepts it, the composition parser's errors are the ones reported. Text that
 * does not open as a composition goes to the `.hsplus` parser, as before.
 *
 * `holo` and `hsplus` force one parser, with no fallback.
 */
export function parseSceneSource<C extends ParseOutcome, H extends ParseOutcome>(
  code: string,
  formatHint: SceneSourceFormatHint,
  parse: { composition: (code: string) => C; hsplus: (code: string) => H }
): SceneSourceReading<C, H> {
  if (formatHint === 'holo') return { form: 'composition', result: parse.composition(code) };
  if (formatHint === 'hsplus' || !isHoloCompositionSource(code)) {
    return { form: 'hsplus', result: parse.hsplus(code) };
  }

  const composition = parse.composition(code);
  if (!hasErrors(composition)) return { form: 'composition', result: composition };

  const hsplus = parse.hsplus(code);
  if (!hasErrors(hsplus)) return { form: 'hsplus', result: hsplus };
  return { form: 'composition', result: composition };
}
