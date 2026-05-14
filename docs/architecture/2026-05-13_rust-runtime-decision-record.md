# ADR-2026-05-13: Rust Runtime — Retire/Revive/Replace Decision Record

> Status: **ACCEPTED** — Retire the historical Rust spatial-agent stack; keep Rust footprint minimal.
> Decision owner: claude1 (HoloScript Core)
> Date: 2026-05-13
> Ledger: `docs/cross-language-deletion-ledger.md` (rows 38–39)

---

## 1. Context

In early 2026 the HoloScript monorepo contained a substantial Rust surface:

| Package | Purpose | Approx. LOC | Status |
|---|---|---|---|
| `packages/spatial-engine` | Agent runtime, perception, networking, persistence, Z3 world-gen solver | ~31 files | **Retired** 2026-04-01 (commit `c5887f4e7`) |
| `packages/spatial-engine-wasm` | WASM companion to `spatial-engine` | small | **Retired** with parent |
| `packages/shader-preview-wgpu` | Native Studio shader preview via wgpu | ~909 LOC | **Retired** 2026-04-01 |
| `packages/holoscript-component` | WIT/component-model compiler + parser | ~3,200 LOC | **Retired** 2026-04-01 |

On 2026-04-05 commit `79bf360b8` removed the retired entries from the workspace `Cargo.toml` and lockfile, completing the Phase-2 extraction.

The current live Rust surface is:

| Package | Purpose | LOC | Workspace member |
|---|---|---|---|
| `packages/compiler-wasm` | HoloScript parser + type-checker compiled to WASM for browser execution | ~3,329 | Yes |
| `packages/tauri-app/src-tauri` | Tauri 2.0 native desktop shell for HoloScript Studio | ~665 | Yes |
| **Total live Rust** | | **~3,994** | **2 crates** |

The production agent runtime is `@holoscript/holoscript-agent` (TypeScript / Node). The spatial simulation engine lives in `packages/core` (TypeScript). No Rust spatial, agent, or simulation code remains in the workspace.

This decision record evaluates four futures for Rust in the HoloScript/HoloLand ecosystem and selects one.

---

## 2. Options Evaluated

### Option A — Revive as Reusable Runtime
**Proposal:** Restore `packages/spatial-engine` and `packages/spatial-engine-wasm` as a sovereign Rust agent/simulation runtime that TypeScript runtimes can optionally delegate to for compute-heavy workloads.

**Evidence against:**
- The retired stack mixed concerns (agent runtime, Redis/Postgres/Neo4j/Pinecone clients, networking, event store, replay, Z3 solver) without a current cargo-checkable product owner.
- `packages/core` already hosts a TypeScript spatial engine that compiles to 28+ targets via the multi-target compiler pipeline.
- Headless agent runtime is `@holoscript/holoscript-agent` (TypeScript/Node). There is no performance bottleneck justifying a Rust rewrite.
- The old crate had no deterministic test suite that passed in CI; reviving it would require weeks of archaeology before any product could use it.

**Cost:** ~3–4 engineer-weeks to resurrect + ongoing maintenance of a 5th-language runtime (Rust, in addition to TS, WGSL, `.holo`, and `.hsplus`).

**Verdict:** REJECTED.

---

### Option B — HoloLand Bridge
**Proposal:** Maintain a Rust bridge crate in HoloScript that the HoloLand platform repo depends on for native spatial compute.

**Evidence against:**
- The 2026-04-01 reorganization already migrated spatial packages (`gpu`, `haptics`, `ik`, `navigation`, `physics-joints`, etc.) to the HoloLand platform repo (commit `333bfe280` and related).
- The boundary between HoloScript (language/compiler/agent substrate) and HoloLand (platform/world runtime) is intentionally sharp. Rust bridge code belongs on the platform side, not in the language repo.
- No cross-repo dependency currently requires a shared Rust crate.

**Cost:** Low if minimal, but adds a cross-repo contract that must be version-locked and CI-tested on both sides.

**Verdict:** REJECTED.

---

### Option C — Simulation / Hardware Validator
**Proposal:** Introduce a new Rust crate that validates simulation determinism, GPU shader outputs, or hardware-in-the-loop behavior.

**Evidence against:**
- No active product request for a Rust-native validator. The existing validation surface is:
  - `packages/snn-webgpu` (WGSL/TS) for GPU spiking-neural-network tests
  - Vitest + `packages/core` unit/integration tests for simulation correctness
  - The Embodied Simulation Contract (Paper 22+) is formalized in Lean 4, not Rust.
- A Rust validator would duplicate the TypeScript test runner for non-Rust code, adding toolchain friction without unique capability.

**Re-entry condition:** If a future product needs deterministic physics replay at >60 Hz with sub-millisecond variance guarantees, a minimal Rust validator crate may be justified. At that time it must start with one deterministic test and a named owner, not by reviving the old spatial-engine tree.

**Verdict:** REJECTED for now.

---

### Option D — Retired / Keep Minimal (ACCEPTED)
**Proposal:** Retain only the two current Rust crates (`compiler-wasm`, Tauri app). Treat the historical spatial-agent stack as intentionally retired. Do not add new Rust packages unless they clear a high re-entry bar.

**Evidence for:**
- `compiler-wasm` has a clear, narrow scope: parse HoloScript source in the browser. It builds in CI (`cargo test` or `wasm-pack`), has typed JS bindings (`wasm-bindgen`), and is consumed by Studio and core.
- `tauri-app` has a clear scope: native desktop shell. It is owned by the Studio team and ships as a downloadable binary.
- Both crates are cargo-checkable, have `Cargo.toml` entries in the workspace, and build without external native dependencies.
- Deleting the spatial-engine stack reduced workspace build times and eliminated 5,000+ LOC of unmaintained Rust.

**Cost:** Two Rust toolchains to maintain (WASM via `wasm-pack`, native via `cargo`). This is acceptable because both are load-bearing and have active owners.

**Verdict:** ACCEPTED.

---

## 3. Migration Path

### Already completed
1. **2026-04-01** commit `c5887f4e7` — deleted `spatial-engine`, `spatial-engine-wasm`, `shader-preview-wgpu`, `holoscript-component`.
2. **2026-04-05** commit `79bf360b8` — cleaned workspace `Cargo.toml` and `Cargo.lock`.
3. **2026-05-12** — `docs/cross-language-deletion-ledger.md` rows 38–39 record the disposition as `retired`.
4. **2026-05-12** — `docs/packages/rust-spatial-stack-history.md` documents the retirement rationale for future audits.

### No further migration required
No source code depends on the retired crates. The TypeScript spatial engine in `packages/core` is the canonical replacement surface.

---

## 4. Re-Entry Bar

A new Rust crate may enter the workspace **only** when all of the following hold:

1. **Product need** — a current roadmap item explicitly requires a Rust-native capability that TypeScript/WASM/WGSL cannot provide.
2. **Deterministic test** — the crate ships with at least one test that passes in CI (`cargo test` or `wasm-pack test`).
3. **Small typed API** — exposes a minimal, typed interface consumed by Studio, core, or the MCP server.
4. **Named owner** — a team member or headless agent is assigned as maintainer in `docs/PACKAGE_OWNERSHIP.md`.
5. **Workspace hygiene** — added to root `Cargo.toml` members, builds in CI, and does not re-introduce unmaintained sub-crates.

**Historical precedent:** The old spatial-engine failed bars 2, 3, and 4. Any revival must start fresh, not by restoring the deleted tree.

---

## 5. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Future audit assumes Rust "never existed" in the ecosystem | Medium | Low (reputational) | `rust-spatial-stack-history.md` and this ADR are canonical. Point auditors to these files. |
| Someone revives the old tree without reading the re-entry bar | Medium | High (tech-debt) | Pre-commit hook should block re-adding deleted `packages/spatial-engine` paths without an explicit ADR amendment. |
| `compiler-wasm` drifts into spatial-engine scope creep | Low | High | Code-review gate: `compiler-wasm` must stay a parser/type-checker. No agent runtime, no persistence, no networking. |
| Tauri app accumulates Rust business logic that belongs in TS | Medium | Medium | Architecture rule: Tauri commands are thin wrappers over TS/MCP APIs. Complex logic stays in `packages/core` or `packages/mcp-server`. |

---

## 6. Verification

```bash
# Confirm only 2 workspace members
$ cat Cargo.toml | grep -A5 'members ='
members = [
    "packages/compiler-wasm",
    "packages/tauri-app/src-tauri",
]

# Confirm no retired packages in HEAD
$ ls packages/spatial-engine 2>/dev/null || echo "Retired — correct"
Retired — correct

# Confirm live Rust builds
$ cd packages/compiler-wasm && cargo check 2>/dev/null && echo "OK" || echo "FAIL"
OK

$ cd packages/tauri-app/src-tauri && cargo check 2>/dev/null && echo "OK" || echo "FAIL"
OK
```

---

## 7. References

- `docs/packages/rust-spatial-stack-history.md` — retirement timeline and per-package disposition.
- `docs/cross-language-deletion-ledger.md` — rows 38–39 (`spatial-engine`, `spatial-engine-wasm`).
- `research/2026-05-12_deleted-package-disposition-audit.md` — full 52-package audit including retired Rust.
- `Cargo.toml` — workspace member list (2 crates).
- `packages/compiler-wasm/package.json` — scope and build scripts.
- `packages/tauri-app/src-tauri/Cargo.toml` — native desktop shell dependencies.

---

## 8. Decision Summary

| Question | Answer |
|---|---|
| Should the old `spatial-engine` stack be revived? | **No.** It was retired intentionally. |
| Should Rust expand into a HoloLand bridge or validator? | **No.** Not justified by current product needs. |
| What Rust stays in the repo? | `packages/compiler-wasm` (WASM parser) and `packages/tauri-app/src-tauri` (desktop shell). |
| What is the re-entry bar? | Product need + deterministic test + small typed API + named owner + workspace hygiene. |
| Who owns this decision? | HoloScript Core team (`@claude1`, claim `task_1778619015439_ci60`). |

**Next review date:** When a product roadmap item explicitly requires a Rust-native capability, or at the next annual architecture review, whichever comes first.
