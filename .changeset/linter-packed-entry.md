---
'@holoscript/linter': patch
---

linter: ship the entry files package.json declares. Published 6.1.1 declared `main: dist/index.js` but only built ESM `dist/index.mjs`, so `require('@holoscript/linter')` (and therefore `@holoscript/lsp`, which is CJS) failed with MODULE_NOT_FOUND. The build now emits CJS `dist/index.js` plus ESM `dist/index.mjs` behind an `exports` map, the `holoscript-lint` bin's `dist/cli.js` exists again, test-only `.d.ts` files are no longer packed, and `scripts/check-packed-entry.mjs` (`pnpm --filter @holoscript/linter test:pack-entry`) fails if a packed tarball lacks any declared entry.

Note: linter is in the `linked` group with lsp (6.2.0), so this patch versions linter to 6.2.1, not 6.1.2. That still satisfies lsp's `^6.1.1` range, so fresh installs of the live lsp 6.2.0 pick up the fix without an lsp bump.
