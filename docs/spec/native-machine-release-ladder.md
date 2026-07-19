# HoloScript Native Machine Release Ladder

This document separates HoloScript's internal native-machine capability
contracts from the versions published to outward consumers.

## Three namespaces

| Namespace | Form | Meaning |
| --- | --- | --- |
| Machine contract | `hs-machine-vN` | Internal cumulative compiler/runtime capability and evidence selector. Not SemVer. |
| Outward preview | `0.x.y`, beginning at `0.1.0` | Publicly consumable preview with an explicit pre-stable compatibility boundary. |
| Public stable | `1.0.0` and later | Stable public compatibility, support, migration, and recovery contract. |

```text
hs-machine-v0 -> hs-machine-v1 -> ... -> hs-machine-vN
                                            |
                                            | outward-preview evidence gate
                                            v
                                         0.1.0 -> 0.x.y -> 1.0.0
```

The machine generation does not predict or equal the package/service version.
In particular:

- `hs-machine-v1` is not HoloScript `1.0.0`.
- `hs-machine-vN` does not bump npm, PyPI, protocol, or Railway release SemVer.
- There is no predetermined terminal `N`; agents keep building bounded
  successors until outward-consumer evidence is complete.
- The first outward release remains `0.1.0` even when the latest internal
  machine selector is much greater than one.

## Internal V0 through Vn contract

Each `hs-machine-vN` successor adds one bounded language, compiler, runtime,
ABI, diagnostic, or systems capability. It inherits every supported predecessor
contract unless a separately documented migration or removal says otherwise.

Every successor includes:

1. A canonical source example and `native-machine-vN.md` specification.
2. Positive compile/run proof and negative diagnostic or rejection proof.
3. Regression coverage for affected predecessor contracts.
4. A deterministic artifact or receipt readback on owned execution substrate.
5. HoloRepo admission plus explicit-path commit/push evidence.
6. Completion residue or a successor task naming the next bounded gap.

The compiler may report `hs-machine-vN` in an internal compile receipt. That is
a capability-selection receipt, not a public release declaration.

## Gate to outward `0.1.0`

The first preview may publish to npm, PyPI, Railway, and other declared outward
rails only after the declared consumer boundary has:

- a supported-feature and known-limit statement;
- a cumulative machine-contract conformance suite;
- a cold install or invocation path without a private workspace clone;
- deterministic artifacts and provenance receipts;
- public docs, examples, diagnostics, and a 0.x breaking-change policy;
- package/deployment boundary and secret-safety checks;
- rail dry-run or live readback; and
- a release owner, support boundary, and rollback path.

`0.1.0` permits public consumption. It does not permit a stable API,
production-ready, drop-in, or v1 compatibility claim.

## Gate to public `1.0.0`

The first stable public release additionally requires resolved or explicitly
accepted preview feedback, a compatibility baseline, a deprecation policy, an
upgrade path from the supported 0.x line, cold-consumer and rollback readback
on every declared rail, and cross-rail version/artifact/schema/support parity.

After `1.0.0`, public releases follow SemVer. Internal `hs-machine-vN`
development continues independently whenever new native capabilities are added.

The machine-enforced cross-ecosystem authority is
`config/v0-v1-release-standard.json` in the ai-ecosystem workspace and its
`check:v0-v1-release-standard` gate. This file is the public HoloScript
projection agents can consume without relying on private workspace context.
