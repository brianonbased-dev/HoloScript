# HoloTest v0: Native Source Test Runner

Status: implemented by `packages/compiler-native`.

HoloTest is the native test contract for the compiler-machine subset of HoloScript. It is deliberately source-authored and compiler-backed: every test is compiled by `holoscriptc`'s native backend, then the resulting owned executable is run. It is not a TypeScript assertion wrapper around HoloScript-shaped data.

## Contract

- A HoloTest case is a file ending in `.test.hs`.
- A case passes when its typed HoloScript `main(): i32` returns `0`.
- A nonzero exit is a failed assertion; a compiler diagnostic is a compile error.
- Test files are discovered recursively in lexical path order and compiled into an isolated temporary artifact directory.
- `holotest` deletes that directory by default. `--keep-artifacts` retains it for native-debug investigation.

```hs
// arithmetic.test.hs
function add(left: i32, right: i32): i32 {
  return left + right
}

function main(): i32 {
  if add(2, 3) == 5 {
    return 0
  }
  return 1
}
```

```powershell
cargo run -p holoscript-native --bin holotest -- examples/native-tests
cargo run -p holoscript-native --bin holotest -- examples/native-tests --json
```

`--json` emits a portable receipt with every source path, status, exit code, and diagnostic. This is the handoff boundary for HoloCI and future HoloMesh proof storage.

## Why this shape

The inherited convention—Rust tests compiling a handful of fixture strings—proves backend behavior but does not let an HoloScript author specify a test suite in HoloScript. HoloTest moves the execution subject into `.hs`, keeps the compiler as the authority, and gives CI one truthful result contract.

v0 intentionally does not add a `test {}` keyword, a VM-only executor, snapshots, mocks, parallel execution, or cross-target parity claims. A future language syntax should lower to this receipt shape so there remains one native execution and reporting path.
