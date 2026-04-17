'use strict';

/**
 * @holoscript/eslint-rules — no-regex-hs-parsing
 *
 * Blocks regex-based parsing of HoloScript syntax outside packages/core/.
 *
 * The rule flags regex literals and `new RegExp(...)` constructors whose
 * pattern contains HoloScript declaration keywords or trait decorators.
 * Inside packages/core/ and the core parser fixtures the rule is inactive
 * — that IS the parser.
 *
 * @see NORTH_STAR.md DT-14
 * @see memory/feedback_no-regex-hs-parsing.md
 */

const HS_DECLARATION_KEYWORDS = [
  'composition',
  'object',
  'scene',
  'group',
  'template',
  'environment',
  'timeline',
  'zone',
  'ui_panel',
  'ui_button',
  'ui_text',
  'ui_slider',
  'ui_input',
  'ui_image',
  'actor',
];

const KNOWN_TRAITS = [
  'grabbable',
  'throwable',
  'hoverable',
  'rotatable',
  'scalable',
  'snappable',
  'teleportable',
];

/**
 * Returns true if `pattern` (a raw regex source string) looks like it's
 * trying to parse HoloScript syntax. Matches on shape, not full semantics.
 */
function patternLooksLikeHoloScript(pattern) {
  if (typeof pattern !== 'string') return false;
  if (pattern.length < 4) return false;

  for (const kw of HS_DECLARATION_KEYWORDS) {
    // `composition\s`, `composition\b`, `composition\w`, `composition#name`
    if (pattern.includes(`${kw}\\s`)) return true;
    if (pattern.includes(`${kw}\\b`)) return true;
    if (pattern.includes(`${kw}\\w`)) return true;
    if (pattern.includes(`${kw}#`)) return true;
  }

  // Trait decorator attempts: `@\w+`, `@[a-z]+`, named traits
  if (pattern.includes('@\\w')) return true;
  if (pattern.includes('@[a-z')) return true;
  for (const trait of KNOWN_TRAITS) {
    if (pattern.includes(`@${trait}`)) return true;
  }

  return false;
}

/**
 * Files where regex HoloScript parsing is the canonical implementation
 * or where matches are irrelevant (tests, the rule itself).
 */
const EXEMPT_PATH_SEGMENTS = [
  '/packages/core/',
  '/tools/eslint-rules/',
  '/__tests__/',
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
];

function isExemptFile(filename) {
  if (!filename) return true;
  const normalized = filename.replace(/\\/g, '/');
  return EXEMPT_PATH_SEGMENTS.some((seg) => normalized.includes(seg));
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow regex parsing of HoloScript syntax outside @holoscript/core. Use HoloCompositionParser or parseHoloPartial instead.',
      recommended: true,
    },
    schema: [],
    messages: {
      regexHsParse:
        'Regex parsing of HoloScript syntax detected. Use `HoloCompositionParser` or `parseHoloPartial` from `@holoscript/core`. See NORTH_STAR.md DT-14.',
    },
  },

  create(context) {
    const filename =
      typeof context.filename === 'string'
        ? context.filename
        : typeof context.getFilename === 'function'
          ? context.getFilename()
          : '';

    if (isExemptFile(filename)) {
      return {};
    }

    return {
      Literal(node) {
        if (!node.regex) return;
        if (patternLooksLikeHoloScript(node.regex.pattern)) {
          context.report({ node, messageId: 'regexHsParse' });
        }
      },

      NewExpression(node) {
        if (!node.callee || node.callee.name !== 'RegExp') return;
        const arg = node.arguments && node.arguments[0];
        if (!arg) return;
        if (arg.type === 'Literal' && typeof arg.value === 'string') {
          if (patternLooksLikeHoloScript(arg.value)) {
            context.report({ node, messageId: 'regexHsParse' });
          }
        } else if (arg.type === 'TemplateLiteral' && arg.quasis.length > 0) {
          const joined = arg.quasis.map((q) => q.value.raw).join('');
          if (patternLooksLikeHoloScript(joined)) {
            context.report({ node, messageId: 'regexHsParse' });
          }
        }
      },
    };
  },
};
