# Hand-crafted `.d.ts` policy (G.004)

## What G.004 means

Some packages maintain a **small, intentional** hand-written declaration layer (e.g. barrel shims) alongside generated `dist/` output. That does **not** imply every file under `packages/*/dist/**/*.d.ts` is hand-crafted.

## Reality in this monorepo

- **Thousands** of `.d.ts` files under `dist/` are **build artifacts** from `tsup` / `tsc` / `generate-types.mjs`.
- Treat **only paths called out in `package.json` exports** or explicitly documented barrels as policy-bearing hand-crafted surfaces.

## For contributors

- Do not edit random `dist/**/*.d.ts` — change **source** `.ts` and rebuild.
- If you add a hand-crafted declaration, document it in the package README or next to the file with a one-line comment: `// hand-crafted: reason`.

## Git / review

Prefer **not** to commit bulk `dist/` changes as editorial work; they belong in release/build commits. If a package needs a curated top-level `index.d.ts` only, scope policy there rather than “all d.ts everywhere.”
