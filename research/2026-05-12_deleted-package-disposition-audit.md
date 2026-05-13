# Deleted Package Disposition Audit

> Date: 2026-05-12
> Agent: claudecode-claude-x402
> Scope: All package roots under `packages/` that no longer exist in HEAD
> Canonical count: 52 removed package roots (cross-language)
> Ledger: `docs/cross-language-deletion-ledger.md`

## Executive Summary

A full git-history scan identified **52 removed package roots** under `packages/` that once held source code (TypeScript, Rust, Kotlin, WGSL, `.holo`) but no longer exist. This audit categorizes each root by disposition, links the deletion commit, names the current owner/replacement, and flags any revive candidates. Three additional artifacts (`packages/.bench-logs`, `packages/README.md`) were excluded because they never contained source code.

The 52 roots break down as:

| Disposition | Count | Description |
|---|---|---|
| **migrated** | 20 | Moved to Hololand platform repo or other external home |
| **merged** | 10 | Absorbed into another in-repo package |
| **superseded** | 7 | Replaced by a newer or better-scoped package |
| **retired** | 8 | Intentionally removed; no direct replacement |
| **unfinished** | 5 | Incomplete/abandoned; cleaned up |
| **revive-candidate** | 1 | Viable to bring back; capability not yet replaced |
| **bad-idea** | 1 | Deliberately discarded design |

Total: 52

---

## Migrated (20) — Moved to Hololand Platform Repo

Moved in commit `333bfe280` and related reorganization commits. These packages are now owned by the Hololand platform repository.

| Package | Lang | Deletion Commit | Current Owner |
|---|---|---|---|
| `packages/accessibility` | TS | `333bfe280` | Hololand platform repo |
| `packages/babylon-adapter` | TS | `284b55757` | Hololand platform repo |
| `packages/creator-tools` | TS | `284b55757` | Hololand platform repo |
| `packages/gestures` | TS | `333bfe280` | Hololand platform repo |
| `packages/gpu` | TS | `333bfe280` | Hololand platform repo |
| `packages/haptics` | TS | `333bfe280` | Hololand platform repo |
| `packages/ik` | TS | `333bfe280` | Hololand platform repo |
| `packages/lod` | TS | `333bfe280` | Hololand platform repo |
| `packages/multiplayer` | TS | `333bfe280` | Hololand platform repo |
| `packages/navigation` | TS | `333bfe280` | Hololand platform repo |
| `packages/network` | TS | `333bfe280` | Hololand platform repo |
| `packages/pcg` | TS | `333bfe280` | Hololand platform repo |
| `packages/physics-joints` | TS | `333bfe280` | Hololand platform repo |
| `packages/playcanvas-adapter` | TS | `284b55757` | Hololand platform repo |
| `packages/portals` | TS | `333bfe280` | Hololand platform repo |
| `packages/spatial-audio` | TS | `333bfe280` | Hololand platform repo |
| `packages/state-sync` | TS | `333bfe280` | Hololand platform repo |
| `packages/streaming` | TS | `333bfe280` | Hololand platform repo |
| `packages/three-adapter` | TS | `284b55757` | Hololand platform repo |
| `packages/voice` | TS | `333bfe280` | Hololand platform repo |

---

## Merged (10) — Absorbed Into Another In-Repo Package

| Package | Lang | Deletion Commit | Merged Into | Evidence |
|---|---|---|---|---|
| `packages/academy` | TS | `ec816e408` | `packages/studio` / docs | "remove duplicated academy package" |
| `packages/agent-setup` | TS | `557be80b1` | `packages/create-holoscript` | "merge @holoscript/agent-setup as second bin" |
| `packages/collab-server` | TS | `db10ea246` | `packages/mcp-server` | "merge @holoscript/collab-server → mcp-server" |
| `packages/compiler` | TS | `52bc38eb3` | `packages/core` | "delete 5 re-export shim packages" |
| `packages/compiler-utils` | TS | `52bc38eb3` | `packages/core` | "delete 5 re-export shim packages" |
| `packages/fs` | TS | `5c02107e0` | `packages/std` | `fs/` module exists in `packages/std/src/fs/` |
| `packages/parser` | TS | `52bc38eb3` | `packages/core` | "delete 5 re-export shim packages" |
| `packages/playground` | TS | `5c02107e0` | `packages/studio` | Deleted alongside other platform packages; functionality absorbed |
| `packages/semantic-2d` | TS | `8822ef639` | `packages/core` | "merge @holoscript/semantic-2d" |
| `packages/traits` | TS | `52bc38eb3` | `packages/core` | "delete 5 re-export shim packages" |

---

## Superseded (7) — Replaced by Newer / Better-Scoped Package

| Package | Lang | Deletion Commit | Superseded By | Evidence |
|---|---|---|---|---|
| `packages/agent-sdk` | TS | `ed3994213` | `packages/framework` | "remove deprecated @holoscript/agent-sdk (superseded by framework)" |
| `packages/connectors` | TS | `3e473d117` | `packages/connector-*` | Split into `connector-core`, `connector-appstore`, `connector-github`, `connector-moltbook`, `connector-railway`, `connector-upstash`, `connector-vscode` |
| `packages/create-holoscript-app` | TS | `359e18348` | `packages/create-holoscript` | Scaffold functionality replaced by the newer `create-holoscript` package |
| `packages/snn-poc` | TS/WGSL | `3e473d117` | `packages/snn-webgpu` | POC replaced by production `snn-webgpu` GPU implementation |
| `packages/store` | TS | `3e473d117` | `packages/marketplace-api` / `packages/core` | Store functionality absorbed into marketplace and core packages |
| `packages/uaa2-client` | TS | `2dddc5040` | `packages/holoscript-agent` | Renamed to `infinityassistant`, later migrated; uaa2 dependency removed. Now covered by `holoscript-agent` |
| `packages/unity-adapter` | TS | `284b55757` | `packages/unity-sdk` (then retired) | Adapter layer moved; SDK later also retired in ghost cleanup |

---

## Retired (8) — Intentionally Removed, No Direct Replacement

| Package | Lang | Deletion Commit | Notes |
|---|---|---|---|
| `packages/holoscript-component` | TS | `c5887f4e7` | Ghost package with zero source code at time of deletion |
| `packages/intellij` | Kotlin/Gradle | `c5887f4e7` | IntelliJ plugin; no current IDE plugin in repo |
| `packages/neovim` | TS | `c5887f4e7` | Ghost package with zero source code at time of deletion |
| `packages/shader-preview-wgpu` | TS/WGSL | `c5887f4e7` | Ghost package with zero source code at time of deletion |
| `packages/spatial-engine` | Rust | `c5887f4e7` | Rust spatial engine retired; TypeScript spatial engine lives in `packages/core`. See `docs/ecosystem` for Rust spatial-engine retirement audit. |
| `packages/spatial-engine-wasm` | Rust/WASM | `c5887f4e7` | WASM companion to `spatial-engine`; retired with it |
| `packages/test` | TS | `c5887f4e7` | Visual regression / snapshot test harness. Root-level vitest now handles testing. |
| `packages/unity-sdk` | TS | `c5887f4e7` | Ghost package with zero source code at time of deletion |

---

## Unfinished (5) — Incomplete / Abandoned

| Package | Lang | Deletion Commit | Notes |
|---|---|---|---|
| `packages/commerce` | TS | `d0a5317e0` | Only test stubs existed; no implementation |
| `packages/components` | `.holo` | `c5887f4e7` | `.holo` component library; no TypeScript source or package.json |
| `packages/demo-apps` | TS | `d0a5317e0` | Incomplete demo collection; no package.json |
| `packages/intelligence` | TS | `9ab9fa2f8` | Empty stubs deleted during circular-dependency cleanup |
| `packages/vrchat-export` | TS | `284b55757` | VRChat compiler/exporter; incomplete, moved to Hololand then not revived |

---

## Revive-Candidate (1)

| Package | Lang | Deletion Commit | Revival Argument |
|---|---|---|---|
| `packages/vrchat-export` | TS | `284b55757` | VRChat remains a major social-VR platform. A sovereign compiler target for VRChat (Udon/VRChat-specific output) aligns with HoloScript's multi-target thesis. No current `packages/compiler-vrchat` or equivalent exists. See compiler count verification: `find *Compiler.ts` — VRChat compiler is absent from the current roster. |

---

## Bad-Idea (1)

| Package | Lang | Deletion Commit | Notes |
|---|---|---|---|
| `packages/vm-bridge` | TS | `81a037a6e` | "archive vm-bridge + drop hardcoded ai-validator trait list". VM bridge pattern was an abstraction leak between HoloScript runtime and external VMs. Replaced by direct compiler targets and WASM runtime. |

---

## Appendix: Verification Commands

```bash
# Reproduce the removed-roots list
git log --all --pretty=format: --name-only --diff-filter=A | grep '^packages/' | awk -F/ '{print $1"/"$2}' | sort -u > /tmp/past_roots.txt
git ls-tree -d -r HEAD --name-only | awk -F/ '{print $1"/"$2}' | grep '^packages/' | sort -u > /tmp/current_roots.txt
comm -23 /tmp/past_roots.txt /tmp/current_roots.txt

# Count package.json-having removed roots
cat /tmp/removed_roots.txt | sed 's|packages/||' | while read pkg; do
  git log --all --pretty=format: --name-only -- "packages/$pkg/package.json" | grep -q . && echo "$pkg"
done | wc -l

# Count all removed roots (excluding artifacts)
cat /tmp/removed_roots.txt | grep -v '^packages/\.' | grep -v 'README.md' | wc -l
```

---

## Cross-Language Deletion Ledger Link

Canonical ledger lives at `docs/cross-language-deletion-ledger.md` (machine-friendly, append-only, permanent).
