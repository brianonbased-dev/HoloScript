# HoloLand-to-HoloScript Substrate Request Process

> Canary: `task_1778618247917_cbsz`  
> Date: 2026-05-13  
> Scope: Lightweight process for HoloLand teams to file upstream substrate requests into HoloScript Core.  
> Authority: [`docs/strategy/vision/2026-03-09_holoscript-vs-hololand-strategic-boundary.md`](docs/strategy/vision/2026-03-09_holoscript-vs-hololand-strategic-boundary.md)  
> Related audit: [`research/2026-05-13_package-status-table-product-bridge-archive-upstream.md`](research/2026-05-13_package-status-table-product-bridge-archive-upstream.md)

---

## 1. The Boundary

**HoloScript** is the universal protocol, compiler, runtime, and economic layer.  
**HoloLand** is a reference implementation — one VR social platform built on top of HoloScript.

Any feature built for HoloLand must be pushed down the stack into HoloScript when it generalizes beyond a single game or world. HoloLand-specific logic (avatar cosmetics tied to a storefront, world-specific quest chains, HoloLand-branded UI) stays in HoloLand.

This process prevents the HoloScript repo from accumulating HoloLand domain code — a gap already measured at 10 packages (16 % of workspace) in the 2026-05-13 package audit.

---

## 2. Upstream vs. Keep-in-HoloLand Decision Tree

| If the need touches... | And it is... | Verdict | Example |
|---|---|---|---|
| **Language traits** | A new composable behavior that any `.holo` world could use | **UPSTREAM** to `@holoscript/core` traits | `@grabbable`, `@networked`, `@spatialAudio` |
| **Validators / receipts** | A deterministic check or proof that should hold across all runtimes | **UPSTREAM** to `@holoscript/core` or `@holoscript/ai-validator` | Receipt validation, simulation fidelity checks |
| **Runtime** | A new execution primitive (scheduler, memory model, physics integration) | **UPSTREAM** to `@holoscript/runtime` or `@holoscript/engine` | New ECS archetype, WebGPU compute dispatch |
| **MCP / CLI** | A tool or protocol endpoint that helps any developer, not just HoloLand builders | **UPSTREAM** to `@holoscript/mcp-server` or `@holoscript/cli` | `compile_to_quest`, `holo validate --strict` |
| **Compiler substrate** | A new compilation target, AST transform, or codegen pass | **UPSTREAM** to `@holoscript/core` compiler | `compile_to_babylon`, `compile_to_visionos` |
| **Game-specific mechanics** | A mechanic tied to HoloLand lore, economy, or matchmaking | **KEEP** in HoloLand | HoloLand battle-royale ring shrink, HoloLand token gates |
| **World-specific UI/UX** | HUD, menus, or tutorials branded for HoloLand | **KEEP** in HoloLand | HoloLand onboarding flow, HoloLand friend-list UI |
| **Social fabric (non-generalized)** | Features that only make sense inside HoloLand's social graph | **KEEP** in HoloLand | HoloLand party system, HoloLand voice-room topology |

**Rule of thumb:** if another independent spatial world (a hospital twin, a museum, a competitive arena) would benefit from the same primitive, upstream it. If it only makes sense inside HoloLand's social universe, keep it.

---

## 3. The Request Template

HoloLand teams file a substrate request by opening a **HoloMesh board task** in the HoloScript Core team with the following fields. Copy-paste this block into the task description.

```markdown
## Substrate Request

### 1. What is needed?
<!-- One-paragraph description of the feature or primitive. -->

### 2. Which substrate layer?
<!-- Check exactly one. -->
- [ ] Language trait (new `@trait` or extension to trait system)
- [ ] Validator / receipt (deterministic check or proof)
- [ ] Runtime primitive (execution, ECS, physics, rendering)
- [ ] MCP / CLI tool (developer-facing protocol or command)
- [ ] Compiler substrate (new target, AST pass, codegen)
- [ ] Other: _____________

### 3. Why does this generalize?
<!-- Name at least two non-HoloLand use cases that would reuse this primitive. -->
1.
2.

### 4. What stays in HoloLand?
<!-- List the HoloLand-specific glue, UI, or policy that does NOT belong in substrate. -->
-
-

### 5. Prior art in HoloScript
<!-- Search `packages/core`, `packages/runtime`, `packages/engine` for similar primitives. -->
- Similar trait:
- Similar runtime primitive:
- None found

### 6. Acceptance criteria (definition of done)
<!-- What must be true for the upstreamed code to be considered complete? -->
- [ ] Trait / validator / runtime module lands in correct `@holoscript/*` package
- [ ] Unit tests cover the generalized behavior (not HoloLand-specific state)
- [ ] Documentation updated in `docs/` or `packages/<name>/README.md`
- [ ] HoloLand integration PR references this substrate task
- [ ] No HoloLand-branded strings or HoloLand-specific config leak into substrate
```

---

## 4. Workflow

```
HoloLand team
    |
    v
[1] Fill template → file board task on HoloScript Core team
    |
    v
HoloScript Core architect (or /founder if architectural)
    |
    v
[2] Review against decision tree (≤ 48 h SLA)
    |     Accept ──→ [3] HoloScript Core team claims + implements
    |     Reject ──→ [4] HoloLand keeps it; task marked done with "rejected, keep local"
    |     Modify ──→ [5] Task description amended; go to [3]
    v
[6] HoloLand opens integration PR consuming the new substrate
    |
    v
[7] Both tasks marked done
```

**SLA:**  
- Review decision: **48 hours** after claim.  
- Implementation: follows normal HoloScript Core sprint priority (P1 = same sprint, P2 = next sprint, P3 = backlog).  

**Escalation:** if the HoloScript Core team is at full capacity, the requesting HoloLand team may implement the substrate change themselves and submit a PR, provided they follow the acceptance criteria above. The Core architect still reviews and merges.

---

## 5. Anti-Patterns (Do Not Upstream)

| Anti-pattern | Why it fails | What to do instead |
|---|---|---|
| Upstream a HoloLand-branded UI component | Substrate should be runtime-agnostic | Keep UI in HoloLand; upstream the underlying data model or trait if reusable |
| Upstream a world-specific quest graph | Quest logic tied to HoloLand lore | Keep quest graph in HoloLand; upstream a generic `@quest` trait system if other worlds need it |
| Upstream a vendor bridge with hardcoded vendor credentials | Leaks external dependency into core | Keep bridge in HoloLand or `packages/bridge/`; upstream only the trait interface |
| Upstream experimental code without tests or docs | Incubates tech debt in core | Keep in HoloLand `experimental/` until it meets the acceptance criteria |

---

## 6. Metrics

Track substrate health monthly:

| Metric | Source | Target |
|---|---|---|
| Packages classified `upstream` | `research/2026-05-13_package-status-table-product-bridge-archive-upstream.md` | Zero net growth; migrate existing 10 upstream packages |
| Substrate requests filed | Board tasks tagged `substrate-request` | > 0 per sprint (signals healthy boundary conversation) |
| Substrate request acceptance rate | Board done-log filtered by `substrate-request` | > 70 % (high bar means good pre-filtering; < 50 % means decision tree is unclear) |
| HoloLand → HoloScript commit ratio | `git log --since='30 days ago' -- packages/hololand-platform/` vs `packages/core/` | HoloLand commits should reference substrate tasks when touching core |

---

## 7. References

- Strategic boundary: [`docs/strategy/vision/2026-03-09_holoscript-vs-hololand-strategic-boundary.md`](docs/strategy/vision/2026-03-09_holoscript-vs-hololand-strategic-boundary.md)
- Package audit: [`research/2026-05-13_package-status-table-product-bridge-archive-upstream.md`](research/2026-05-13_package-status-table-product-bridge-archive-upstream.md)
- Package governance: [`docs/packages/governance.md`](docs/packages/governance.md)
- HoloLand integration guide: [`docs/integrations/hololand.md`](docs/integrations/hololand.md)
- Cross-language deletion ledger: [`docs/cross-language-deletion-ledger.md`](docs/cross-language-deletion-ledger.md) — use when migrating packages out of HoloScript repo

---

*Process defined by HoloScript Core team. Amend via `/room suggest` with category `process`.*
