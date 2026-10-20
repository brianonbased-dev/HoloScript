# @holoscript/linter

## 6.2.2

### Patch Changes

- 0ed29dc: linter: ship the entry files package.json declares. Published 6.1.1 declared `main: dist/index.js` but only built ESM `dist/index.mjs`, so `require('@holoscript/linter')` (and therefore `@holoscript/lsp`, which is CJS) failed with MODULE_NOT_FOUND. The build now emits CJS `dist/index.js` plus ESM `dist/index.mjs` behind an `exports` map, the `holoscript-lint` bin's `dist/cli.js` exists again, test-only `.d.ts` files are no longer packed, and `scripts/check-packed-entry.mjs` (`pnpm --filter @holoscript/linter test:pack-entry`) fails if a packed tarball lacks any declared entry.

  Note: linter is in the `linked` group with lsp (6.2.0), so this patch versions linter to 6.2.1, not 6.1.2. That still satisfies lsp's `^6.1.1` range, so fresh installs of the live lsp 6.2.0 pick up the fix without an lsp bump.

- Updated dependencies [0ed29dc]
  - @holoscript/core@8.10.1

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.

## 6.0.3

### Patch Changes

- @holoscript/core@6.0.3
