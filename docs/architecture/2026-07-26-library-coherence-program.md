# HoloScript Library Coherence Program

**Status:** compiler-native contract shipped; runtime and production deployment follow-ups remain  
**Date:** 2026-07-26  
**Scope:** package identity, resolution, registry storage, publishing, release admission, native standard-library source, ABI projection, and catalog truth

## Decision

HoloScript libraries use `PackageIR` as their compiler-native package identity and a deterministic `PackageLockReceipt` as their resolved dependency receipt. JavaScript package manifests remain a distribution envelope, not the language's semantic package model.

This program serves:

- HoloScript authors publishing reusable `.holo`, `.hs`, and `.hsplus` source;
- compiler and runtime consumers resolving exact dependency graphs;
- agents and release operators verifying what is shipped and supported;
- JavaScript consumers installing the existing npm portfolio without conflating npm metadata with HoloScript semantics.

## Canonical contract

`packages/platform/src/registry/PackageIR.ts` owns the initial contract:

- package identity, exact semantic version, kind, compatibility, capabilities, sources, entrypoints, provenance, and support tier;
- canonical serialization and SHA-256 package digest;
- a sorted resolved dependency graph;
- exact-version source-integrity pins;
- a lock receipt that fails closed for malformed identities, duplicate or missing dependencies, private source paths, and cached-source digest mismatch.

The lock receipt proves only the canonical resolved graph and the bytes presented from cache. It does not prove registry governance, package authorship, reproducible compilation, install safety, or runtime correctness.

`packages/platform/wit/package-ir.wit` projects the same concepts for component-boundary consumers. The WIT file is an ABI contract only; it does not revive or claim a complete WebAssembly component runtime.

## Registry route ownership

The three public artifact classes remain separate:

| Artifact | Canonical route | Purpose |
| --- | --- | --- |
| Compiler-native library package | `POST /api/v1/packages` and exact-version/resolve reads under `/api/v1/packages/:namespace/:name` | Immutable `PackageIR` plus HoloScript source |
| Marketplace trait | `/api/v1/traits` | Trait discovery, rating, and marketplace metadata |
| Studio scene | MCP `/api/publish`; legacy `/api/registry` compatibility | Scene publishing and Studio discovery |

The library store authenticates namespace ownership, verifies the package digest, retains declared source, persists JSON state, and rejects mutation of an existing version. These properties are source-level server behavior; they are not evidence that a production registry deployment is currently configured.

## Resolution and offline behavior

The core import resolver accepts an explicit package lock and registry cache:

1. registry imports without an exact lock pin fail closed;
2. online resolution requests the exact version named by the lock;
3. source bytes are hashed before parsing;
4. offline resolution replays only a verified cache artifact;
5. version and digest participate in resolver cache identity.

There is no filesystem fallback for an unresolved registry import. The focused suites prove each contract independently, and `scripts/holo-ci/check-native-library-cold-consumer.mjs` joins them through a freshly packed npm consumer. That harness publishes through the packed CLI, restarts a standalone registry store, resolves the exact artifact through the packed compiler, verifies the digest before parsing, and replays the verified cache in a separate process with Node network APIs denied.

The cold harness proves the current source release cohort, not public-registry dependency closure. It must pack the current `@holoscript/meaning@0.1.1` source because the same-version public artifact lacks an export the current core imports. The receipt therefore exposes that registry drift instead of hiding it. Its deterministic assertion is compiler import/export resolution, not native host-runtime execution, and the network guard is process-level rather than an OS air gap.

## Native standard library

`@holoscript/std` now publishes native `math.hsplus` and `collections.hsplus` entrypoints alongside its host-language compatibility surface. The package declares itself as a HoloScript library artifact with experimental support.

Current boundary: the native source is shipped and statically traced, and TypeScript/Rust shadow parsers agree on the corpus. Host standard-library ABI execution parity is not yet proved.

## Release and catalog truth

The npm v1 release closure is derived from `scripts/holo-ci/npm-v1-release-manifest.json`. All 19 candidates must have either a fleet-consumption row or a repo-less candidate receipt row. Candidate receipts do not imply fleet deployment.

`scripts/holo-ci/package-catalog.mjs` generates `docs/packages/catalog.generated.md` from:

- the npm v1 release manifest;
- the package consumption matrix;
- the stewardship manifest;
- actual package manifests.

The narrative package index remains a discovery guide. Release counts, receipt lanes, versions, stewardship state, and compiler-native library declarations come from the generated catalog.

## Shipped slices

| Commit | Result |
| --- | --- |
| `c198fb608` | Compiler-native `PackageIR` and lock receipt |
| `54ab0160d` | Persistent immutable native package registry store and routes |
| `d2ab4f88d` | CLI publishing of declared HoloScript library artifacts |
| `b2d5246ab` | Lock-pinned, integrity-checked registry imports and offline replay |
| `1c7535e22` | Release admission and consumption receipts for all 19 npm v1 candidates |
| `522dbcb89` | Native standard-library source corpus and package exports |
| `62590569a` | WIT projection of the package contract |

## Acceptance status

| Acceptance condition | Status | Evidence boundary |
| --- | --- | --- |
| Compiler-native package identity and lock contract | Shipped | Platform unit tests, public type check, build |
| Persistent native library registry path | Shipped in source | Registry contract tests and build; no production deployment claim |
| CLI emits native library package artifacts | Shipped | CLI publish suite and build |
| Compiler verifies lock-pinned source and offline cache | Shipped | Core import-resolver suite and build |
| All npm v1 candidates admitted to release checks | Shipped | 19-candidate closure and consumption/architecture checks |
| Native std source distributed | Experimental | npm pack inspection and static/parser parity; no execution-parity claim |
| Package contract projected to WIT | Shipped as ABI | `wasm-tools` component embedding/new/validation |
| One cold external end-to-end native consumer | Shipped for current source cohort | Fresh packed CLI/platform/core/meaning, standalone registry restart, exact digest resolve, and process-guarded offline replay; public dependency closure remains false |
| Production native registry deployment | Open | Requires configured public registry, auth, storage, and operational receipts |
| Native std runtime execution parity | Open | Requires executable ABI tests across supported targets |

## Next gates

1. Bump and publish `@holoscript/meaning` with its current exports, then rerun the cold harness using registry dependencies only; do not treat same-version source drift as a valid public release.
2. Deploy the native package routes behind the intended production registry host and capture auth, persistence, restart, and rollback receipts.
3. Define and execute the standard-library ABI conformance suite across Node, browser-Wasm, and owned-metal targets.
4. Promote additional native libraries only after their source, compatibility, support tier, and runtime boundary appear in the generated catalog.
