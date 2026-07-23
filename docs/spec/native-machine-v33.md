# Native machine contract v33: deterministic multi-file modules

## Status

`hs-machine-v33` extends the native compiler from a single source string to a deterministic
project graph rooted at one canonical `.hs` entry file. The Rust+WASM parser remains the syntax
authority for `import` and `export`; the native compiler now resolves and links those AST nodes
instead of rejecting them as unsupported top-level constructs. V33 is an internal
capability/evidence contract under the
[native machine release ladder](native-machine-release-ladder.md), not a public SemVer release.

## Resolution and visibility

- Imports must be explicit relative `.hs` paths such as `./math.hs` or `../lib/math.hs`.
- The entry file's directory is the project root. Canonicalized imports may not escape it,
  including through symlinks or `..`.
- Named exports are the only cross-module interface. Imports of private or missing declarations
  fail before object lowering.
- Named aliases are supported. Each dependency module receives a stable symbol namespace derived
  from its project-relative path, so same-named private declarations cannot collide.
- Each canonical module is loaded once. A repeated compile of the same source graph emits identical
  object bytes.

## Fail-closed boundary

V33 rejects absolute and bare module specifiers, non-`.hs` targets, missing files, project-root
escapes, empty import lists, duplicate or colliding local bindings, missing exports, invalid export
declarations, and dependency cycles. Diagnostics name the importing module and, for cycles, the
exact project-relative cycle.

The module layer does not weaken a predecessor machine contract. After deterministic graph assembly
and symbol isolation, the merged AST is lowered by the existing inferred V0-V32 semantic contract.
The outward receipt is `hs-machine-v33` because it additionally proves project resolution.
Single-file inputs without `import` or `export` continue to report their predecessor contract.

## Evidence

The canonical project is
[`examples/native/multi-file-modules/entry.hs`](../../examples/native/multi-file-modules/entry.hs)
with its exported dependency
[`math.hs`](../../examples/native/multi-file-modules/math.hs).
`packages/compiler-native/tests/multi_file_modules.rs` compiles the graph twice and compares exact
object bytes, links and runs an executable that exits 5, preserves a V1 single-file receipt, and
proves aggregate types plus same-named private helpers remain isolated across module boundaries. It
also adversarially covers private imports, cycles, root escapes, and bare specifiers.

The immediate predecessor is
[native machine contract v32](native-machine-v32.md).
