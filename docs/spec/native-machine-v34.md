# Native machine contract v34: first-class ignorance in native aggregates

## Status

`hs-machine-v34` adds an executable native consumer for struct-field `@unknown`. A field such as
`@unknown reading: i32` is not metadata and is not lowered to raw `i32`: it becomes an inline,
tagged `Uncertain<i32>` carrier with a stable meaning-gap reason code. V34 is an internal
capability/evidence contract under the
[native machine release ladder](native-machine-release-ladder.md), not a public SemVer release.

This first structured carrier remains a canonical `.hs` capability. The TypeScript `.hsplus`
parser now exposes typed fields and admitted annotations in its public AST for `struct`
declarations, distinguishes typed fields from preserved-opaque legacy members, and retains the raw
body. Optionality and authored defaults remain explicit. The public core function
`lowerHSPlusUnknownStructsToMeaning` explicitly parses source and projects parser-produced
structured `@unknown` fields through a defensive shape-validating adapter that delegates to the
canonical struct-field lowering. Plain `parse()` remains syntax-only; syntax admission remains the
parser's job.

That explicit source-to-meaning path is not a V34 native-execution claim. `compiler-native` does
not consume `.hsplus`; `interface` and `class` bodies remain raw; and the Kotlin bridge rejects
typed structs. No cross-backend parity is claimed.

## Source contract

Only `@unknown` may modify a structured native field:

```hs
struct Sensor {
    @unknown reading: i32
}
```

The first carrier admits scalar `bool`, `i32`, and `i64` payloads. Construction must state the
epistemic branch:

```hs
Sensor(known(21))
Sensor(unknown("underdetermined"))
```

Unknown reasons are compiled from the canonical `@holoscript/meaning` vocabulary:

| Code | Reason                   |
| ---: | ------------------------ |
|    1 | `underdetermined`        |
|    2 | `unprioritized_conflict` |
|    3 | `cyclic_dependency`      |
|    4 | `missing_precondition`   |
|    5 | `irreducible_stochastic` |

Code zero is reserved for a known field.

## Inline ABI

An uncertain scalar uses three aligned components:

1. one-byte known tag at relative offset 0;
2. 32-bit reason code at relative offset 4; and
3. aligned payload at relative offset 8.

`Uncertain<bool>` and `Uncertain<i32>` occupy 12 bytes aligned to 4;
`Uncertain<i64>` occupies 16 bytes aligned to 8. The carrier is allocation-free. Field type,
offsets, reason-ABI version, and the uncertainty marker participate in the aggregate ABI
fingerprint, so `Uncertain<i32>` can never validate as raw `i32`.

Foreign aggregate materialization validates the tag/reason invariant before loading the payload:
known requires reason zero; unknown requires a reason in the closed range 1–5. Invalid records trap
before HoloScript accepts ownership or reads the uncertain payload.

## Honesty operations

- `isKnown(record.field)` reads only the tag and is the action-gating primitive.
- `unknownReason(record.field)` reads the stable reason code for an abstention receipt.
- `load(record.field) ?? fallback` branches on the tag. The payload is loaded only on the known
  branch; the fallback is evaluated only on the unknown branch.

Bare `load`, raw `store`, raw constructor payloads, fallback laundering, and borrowing an annotated
payload fail with native diagnostics. This prevents an uncertainty-bearing field from silently
becoming `T`.

## Evidence

The canonical program is
[`examples/native/uncertain-steward-honesty-gate-exit-five.hs`](../../examples/native/uncertain-steward-honesty-gate-exit-five.hs).
It executes a named steward honesty gate twice:

- an unknown counter abstains, records `missing_precondition`, leaves the action counter absent,
  and does not consume a poison payload; then
- a known counter proceeds and returns five.

`packages/compiler-native/tests/native_smoke.rs` inspects the exact carrier layout, proves its
fingerprint differs from raw `i32`, compiles and runs the executable on the host, and covers the
fail-closed boundary. Compiler-WASM tests pin annotation-to-field alignment and Kotlin refusal.
The meaning-package end-to-end test parses the real WASM AST and lowers the same aligned struct
metadata to canonical `Uncertain<T>`.

The immediate predecessor is
[native machine contract v33](native-machine-v33.md).
