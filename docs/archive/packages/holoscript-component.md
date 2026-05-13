# HoloScript Component

**Retired historical WASM Component Model package.**

## Status

`@holoscript/component` is not present in the current package tree and should not
be documented as a live package. It existed as part of the early Rust/WASM
spatial stack and was retired from main in April 2026.

Use `@holoscript/wasm` / `packages/compiler-wasm` for the current Rust-backed
portable parser surface.

See [Rust Spatial Stack History](./rust-spatial-stack-history.md) for the
timeline and re-entry bar.

## Re-Entry Bar

Recreate this package only as a fresh workspace member with:

- WIT files owned in the package.
- A cargo-checkable Rust crate.
- A package manifest.
- A smoke instantiation test proving the component loads from a non-JS host.

## See Also

- [Compiler WASM](./compiler-wasm.md)
- [WASM](./wasm.md)
- [Parser](./parser.md)
- [Rust Spatial Stack History](./rust-spatial-stack-history.md)
