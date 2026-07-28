'use strict';

/**
 * @holoscript/eslint-rules — no-raw-tailwind-color
 *
 * Flags raw Tailwind NEUTRAL-palette color utilities (slate/gray/zinc/neutral/stone)
 * in packages/studio/** where a `studio-*` design token exists to replace them.
 *
 * Why: research/2026-07-07_taste-audit-agent-ui-ux.md (W.701) found the studio design
 * system decayed because it was a LABEL, not a CONSTRAINT — `studio-*` tokens are defined
 * (packages/studio/tailwind.config.js) but 4 of 7 dashboards bypass them with generic
 * `bg-gray-800` / `text-slate-100` / inline hex. A design system is a checkable minimum or
 * it is nothing. This rule is that minimum: in studio, reach for a token, not a raw shade.
 *
 * Scope note: intentionally flags only the NEUTRAL palettes (slate/gray/zinc/neutral/stone),
 * which map 1:1 onto studio bg/panel/surface/border/text/muted. Semantic palettes
 * (red/green/amber/blue) are a separate, more nuanced pass (studio.success/error/warning/accent
 * exist but colored accents are sometimes intentional) — out of scope for v1 to keep the
 * signal high and the false-positive rate near zero.
 *
 * Severity is set at the config site (eslint.config.mjs) — 'warn' initially, matching the
 * repo's no-regex-hs-parsing precedent (surface the debt without breaking CI).
 */

// {prefix}-{neutral-palette}-{shade}[/{opacity}] — e.g. bg-gray-800, text-slate-100, hover:bg-gray-750
const RAW_NEUTRAL_RE =
  /\b(?:bg|text|border|ring|ring-offset|divide|from|to|via|outline|placeholder|caret|accent|decoration|shadow|fill|stroke)-(?:slate|gray|zinc|neutral|stone)-\d{2,3}(?:\/\d{1,3})?\b/g;

// Suggest the token family that replaces each neutral role.
const TOKEN_HINT = 'bg-studio-bg/panel/surface, text-studio-text/muted, border-studio-border';

const EXEMPT_PATH_SEGMENTS = [
  '/tools/eslint-rules/',
  '/__tests__/',
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '/tailwind.config',
];

function isExemptFile(filename) {
  if (!filename) return true;
  const normalized = filename.replace(/\\/g, '/');
  return EXEMPT_PATH_SEGMENTS.some((seg) => normalized.includes(seg));
}

/** Collect distinct raw-neutral classes in a string. */
function rawNeutralClasses(text) {
  if (typeof text !== 'string' || text.indexOf('-') === -1) return [];
  const found = text.match(RAW_NEUTRAL_RE);
  return found ? Array.from(new Set(found)) : [];
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow raw Tailwind neutral color utilities (gray/slate/zinc/neutral/stone) in packages/studio where a studio-* token exists. Use the design token, not a raw shade.',
      recommended: false,
    },
    schema: [],
    messages: {
      rawColor:
        "Raw Tailwind neutral color '{{cls}}'. Use a studio-* design token instead ({{hint}}). See packages/studio/tailwind.config.js and research/2026-07-07_taste-audit-agent-ui-ux.md (W.701).",
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

    const reportFrom = (node, text) => {
      for (const cls of rawNeutralClasses(text)) {
        context.report({ node, messageId: 'rawColor', data: { cls, hint: TOKEN_HINT } });
      }
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string') reportFrom(node, node.value);
      },
      TemplateElement(node) {
        if (node.value && typeof node.value.cooked === 'string')
          reportFrom(node, node.value.cooked);
      },
    };
  },
};
