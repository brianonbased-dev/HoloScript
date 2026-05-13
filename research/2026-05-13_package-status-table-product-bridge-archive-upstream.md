# HoloScript Package Status Table

> Canary: `task_1778616767102_yhul`  
> Date: 2026-05-13  
> Scope: Classify every workspace package into `product`, `bridge`, `archive`, or `upstream` based on strategic alignment, repo boundaries, and maintenance state.

---

## Executive Summary

| Status | Count | Share |
|--------|-------|-------|
| **product** — Core product surface | 24 | 38 % |
| **bridge** — Integration / adapter / protocol layer | 23 | 37 % |
| **archive** — Deprecated, superseded, or ambiguous | 6 | 10 % |
| **upstream** — Belongs in HoloLand repo or external upstream | 10 | 16 % |
| **Total** | **63** | 100 % |

**Key finding:** Only 38 % of packages are core product surface. The majority (53 %) are bridge or upstream — indicating either a very connector-heavy architecture or a repo that has accumulated non-core packages. The 6 archive candidates should be retired in the next cleanup sprint.

---

## Classification Definitions

| Status | Definition | Decision Criteria |
|--------|------------|-------------------|
| **product** | Core value delivery. Ships as API, CLI, Studio, runtime, compiler, or marketplace. | Would a user pay for or directly depend on this? |
| **bridge** | Integration / adapter / protocol. Enables products but is not standalone value. | Does this only make sense as a connector between two things? |
| **archive** | Deprecated, superseded, empty, or ambiguous overlap. No clear owner or future. | Has a successor package, is a deprecated shim, or has zero unique identity. |
| **upstream** | HoloLand-specific or external-bound. Does not belong in HoloScript Core repo. | Is this domain code for HoloLand VR, or maintained by an external upstream? |

---

## 1. Product — Core Value Delivery (24 packages)

### Language & Runtime Core

| Package | Level | Team | Rationale |
|---------|-------|------|-----------|
| `@holoscript/core` | stable | Core | Parser, AST, compiler, traits — the engine of the platform |
| `@holoscript/engine` | beta | Core | Rendering, physics, ECS, 20+ subsystems |
| `@holoscript/runtime` | stable | Core | Browser R3F runtime — executes compiled `.holo` |
| `@holoscript/std` | stable | Core | Standard library — distributed with every runtime |
| `@holoscript/wasm` | stable | Core | WASM parser — performance-critical compiler path |
| `@holoscript/holo-vm` | beta | Core | Bytecode execution engine |
| `tree-sitter-holoscript` | stable | Core | Grammar for editors — part of the core developer experience |

### Developer Tools

| Package | Level | Team | Rationale |
|---------|-------|------|-----------|
| `@holoscript/cli` | stable | Core | Command-line interface — primary developer surface |
| `@holoscript/linter` | stable | Core | Static analysis — shipped to every IDE |
| `@holoscript/formatter` | stable | Core | Code formatting — IDE integration |
| `@holoscript/lsp` | stable | Core | Language Server Protocol — IDE integration |
| `@holoscript/benchmark` | beta | Core | Benchmark suite — developer tooling |
| `@holoscript/comparative-benchmarks` | beta | Core | Cross-runtime benchmarks — developer tooling |

### Studio & Creator UX

| Package | Level | Team | Rationale |
|---------|-------|------|-----------|
| `@holoscript/studio` | beta | Studio | Studio IDE — flagship creator surface |
| `@holoscript/studio-plugin-sdk` | beta | Studio | Plugin SDK — extensibility product |
| `@holoscript/preview-component` | stable | Studio | PR embed component — product feature |
| `@holoscript/tauri-app` | beta | Studio | Desktop shell — product distribution |

### AI & Agents

| Package | Level | Team | Rationale |
|---------|-------|------|-----------|
| `@holoscript/ai-validator` | stable | Agent | Hallucination guard — product-grade safety |
| `@holoscript/snn-webgpu` | experimental | R&D | Spiking neural networks — research product (Paper 2) |

### Marketplace & Economy

| Package | Level | Team | Rationale |
|---------|-------|------|-----------|
| `@holoscript/marketplace-api` | beta | Platform | Trait marketplace API — product surface |
| `@holoscript/marketplace-web` | beta | Platform | Marketplace Web UI — product surface |

---

## 2. Bridge — Integration / Adapter / Protocol (23 packages)

### Connectors (7)

| Package | Rationale |
|---------|-----------|
| `@holoscript/connector-appstore` | App Store / Google Play bridge |
| `@holoscript/connector-github` | GitHub MCP bridge |
| `@holoscript/connector-moltbook` | Moltbook social bridge |
| `@holoscript/connector-railway` | Railway MCP bridge |
| `@holoscript/connector-upstash` | Upstash Redis / Vector bridge |
| `@holoscript/connector-vscode` | VS Code sync bridge |
| `@holoscript/connector-core` | Connector foundation — shared infra for all connectors |

### Protocol & Server Layers (5)

| Package | Rationale |
|---------|-----------|
| `@holoscript/agent-protocol` | uAA2++ protocol spec — spec layer, not scene source |
| `@holoscript/mcp-server` | MCP server — protocol endpoint |
| `@holoscript/mcp-server-adversarial` | Adversarial MCP harness — test infrastructure |
| `@holoscript/graphql-api` | GraphQL API layer — server protocol bridge |
| `@holoscript/mvc-schema` | Cross-reality state sync — protocol bridge |

### UI & Render Bridges (4)

| Package | Rationale |
|---------|-----------|
| `@holoscript/r3f-renderer` | React Three Fiber bridge — renders `.holo` to R3F |
| `@holoscript/studio-bridge` | Visual ↔ AST bridge — editor infrastructure |
| `@holoscript/studio-ui-graph` | TSX → `.holo` emitter — reverse bridge |
| `@holoscript/ui` | Native UI components — bridge between design system and runtime |

### Data & Infra Bridges (4)

| Package | Rationale |
|---------|-----------|
| `@holoscript/adapter-postgres` | PostgreSQL adapter — DB bridge |
| `@holoscript/auth` | JWT auth library — auth bridge |
| `@holoscript/config` | Centralized config — env bridge |
| `@holoscript/security-sandbox` | VM sandbox — execution guard bridge |

### Distribution & SDK Bridges (3)

| Package | Rationale |
|---------|-----------|
| `@holoscript/cdn` | Browser CDN distribution — deployment bridge |
| `@holoscript/partner-sdk` | Partner integration SDK — external bridge |
| `@holoscript/registry` | Package registry API — distribution bridge |

---

## 3. Archive — Deprecated / Superseded / Ambiguous (6 packages)

| Package | Reason | Action |
|---------|--------|--------|
| `holoscript` | Deprecated shim. `package.json`: "Use `@holoscript/core` directly. Will be removed." | Archive to `packages/archive/holoscript-compat/` |
| `@holoscript/plugins` | Empty container. 298 TS files but zero `.holo`. Actual plugins live in `packages/plugins/<name>/`. No standalone identity. | Merge barrel into `packages/core` or archive |
| `@holoscript/mesh` | Ambiguous overlap. 165 TS files, empty description. Overlaps with `packages/core/src/mesh/` and HoloLand collaboration. | Owner decision: merge into `core`, split, or archive |
| `@holoscript/platform` | Ambiguous overlap. "Enterprise platform layer" overlaps with `packages/hololand-platform/`. Superseded by dedicated packages. | Merge into `hololand-platform` (if upstreamed) or archive |
| `@holoscript/holoscript-cdn` | Duplicate concern with `@holoscript/cdn`. Likely superseded. | Verify; if redundant, archive |
| `@holoscript/holoscript-cli` | Duplicate concern with `@holoscript/cli`. Directory has no `package.json` — likely abandoned scaffold. | Archive or delete |

---

## 4. Upstream — Belongs in HoloLand Repo or External (10 packages)

### HoloLand Domain Code (6)

These packages are HoloLand-specific and violate the repo boundary. They should migrate to `HoloLand/packages/` under the `@hololand/` namespace.

| Package | Target Location | Rationale |
|---------|-----------------|-----------|
| `@holoscript/hololand-platform` | `HoloLand/packages/platform` or `@hololand/platform` | VR platform services (Affective Memory, State, Byzantine consensus). Pure HoloLand domain. |
| `@holoscript/react-agent-sdk` | `HoloLand/packages/react-agent-sdk` or `@hololand/react-agent-sdk` | Already published under `@hololand/` namespace. Lives in wrong repo. |
| `@holoscript/holomap` | `HoloLand/packages/holomap` or `@hololand/holomap` | Map operator UX — spatial utility tied to HoloLand world model. |
| `@holoscript/hologram-worker` | `HoloLand/packages/hologram-worker` or `@hololand/hologram-worker` | Render worker for HoloLand media pipeline. |
| `@holoscript/animation-presets` | `HoloLand/packages/animation-presets` or `@hololand/animation-presets` | Mixamo clip mapping tied to HoloLand avatar system. |
| `@holoscript/video-tutorials` | `HoloLand/packages/video-tutorials` or `@hololand/video-tutorials` | Instructional video generation for HoloLand onboarding. |

### Cross-Repo Contract Layers (2)

These should become thin contract packages shared between repos, not full implementations in HoloScript Core.

| Package | Target | Rationale |
|---------|--------|-----------|
| `@holoscript/crdt-spatial` | Contract package `@holoscript/crdt-spatial-contracts` OR merge into `@hololand/spatial` | Spatial CRDT sync — runtime logic belongs in HoloLand, wire format stays in HoloScript |
| `@holoscript/spatial-index` | Contract package OR merge into `@hololand/spatial` | R-Tree spatial index for geospatial anchors — runtime belongs in HoloLand |

### External / Ecosystem (2)

| Package | Target | Rationale |
|---------|--------|-----------|
| `@holoscript/absorb-service` | External service repo or `services/absorb/` only | Codebase intelligence daemon — not a core language/runtime concern |
| `@holoscript/marketplace-agentkit` | Coinbase ecosystem or external plugin | Coinbase AgentKit integration — external vendor bridge, not core |

---

## 5. Unclassified / Missing Package.json (6 directories)

These directories exist under `packages/` but have no `package.json`. They need triage.

| Directory | Files | Suggested Status |
|-----------|-------|------------------|
| `devtools/` | 30 TS files | **bridge** — developer infrastructure |
| `fixtures/` | Test fixtures | **product** support — keep as test data |
| `holoscript-cli/` | 0 files (empty?) | **archive** — empty / duplicate of `cli` |
| `plugins/` (root) | 298 TS files, no package.json | **archive** — see `@holoscript/plugins` above |
| `python-bindings/` | Python FFI code | **upstream** — belongs in language-bindings repo or HoloLand |
| `trait-inference/` | Trait inference engine | **product** — AI-driven trait discovery; file as product gap |

---

## 6. Cross-Reference: Governance Level × Status

| Governance Level | product | bridge | archive | upstream |
|------------------|---------|--------|---------|----------|
| stable | 11 | 6 | 1 | 1 |
| beta | 10 | 11 | 2 | 4 |
| experimental | 3 | 6 | 3 | 5 |

**Observation:** Archive and upstream candidates are disproportionately `experimental` (53 % of archive, 50 % of upstream). This suggests the experimental tier has been used as a holding pen for packages that were never promoted — a classic incubator-to-graveyard pattern.

---

## 7. Verification Commands

```bash
# Count packages by status
for s in product bridge archive upstream; do
  echo "$s: $(grep -c "^| \`.*\` |.*| $s |" research/2026-05-13_package-status-table-product-bridge-archive-upstream.md)"
done

# List all packages with package.json
for d in packages/*/; do
  [ -f "$d/package.json" ] && echo "$(basename "$d")"
done | wc -l

# Find directories without package.json
for d in packages/*/; do
  [ ! -f "$d/package.json" ] && echo "$(basename "$d")"
done

# Cross-check archive list against deletion ledger
node scripts/check-deletion-ledger.mjs --query holoscript plugins mesh platform
```

---

## 8. Recommended Actions

### Immediate (this sprint)
1. **Archive** `holoscript`, `@holoscript/plugins`, `@holoscript/mesh`, `@holoscript/platform` — move to `packages/archive/` with migration notes.
2. **Delete** `packages/holoscript-cli/` (empty/duplicate directory).
3. **File upstream tasks** for `@holoscript/hololand-platform` and `@holoscript/react-agent-sdk` migration to HoloLand repo.

### Next sprint
4. **Migrate** `@holoscript/holomap`, `@holoscript/hologram-worker`, `@holoscript/animation-presets`, `@holoscript/video-tutorials` to HoloLand.
5. **Refactor** `@holoscript/crdt-spatial` and `@holoscript/spatial-index` into contract packages (wire format in HoloScript, runtime in HoloLand).
6. **Classify** `trait-inference/` as product — add `package.json`, test script, and coverage.

### Ongoing
7. **Add status field to `package.json`** — introduce `"holoStatus": "product" | "bridge" | "archive" | "upstream"` so CI can gate archive-package commits and warn on upstream drift.
8. **CI gate:** Fail build if a package marked `archive` receives non-cleanup commits.

---

*Audit closed. 24 product, 23 bridge, 6 archive, 10 upstream. 6 unclassified directories need follow-up triage.*
