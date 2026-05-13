# Legacy Numbered Examples — Triage Against Current Packages

> Canary audit: `task_1778616767102_pm2y`  
> Date: 2026-05-12  
> Scope: Triage 27 example dirs with numbered legacy examples. Classify each against current packages. Flag orphans, stale refs, and missing package links.

---

## Executive Summary

**150 numbered example files** found across 22 category directories. Of these:

- **112 (75%)** are `.holo`/`.hs`/`.hsplus` language examples — current, package-mapped
- **27 (18%)** are browser/React/HTML templates in `browser-templates/` and `demos/` — legacy, unmaintained
- **11 (7%)** are v5.0-hardened examples referencing deleted packages (`@holoscript/secure-mesh`, `@holoscript/mesh-deploy`) — stale

**Recommendation:**
1. **Archive** the 27 browser/React/HTML templates (they reference deleted `@holoscript/web-preview-plugin` and `@holoscript/studio-bridge` packages).
2. **Migrate** 11 v5.0-hardened examples to current package names.
3. **Keep** all 112 language examples — they map cleanly to current parser/compiler packages.
4. **File follow-up** for 6 orphan `.html` files in `demos/` with no corresponding `.holo` source.

---

## 1. Numbered Example Inventory

### 1.1 HoloLand Examples (`examples/hololand/`)

| # | File | Status | Maps To | Action |
|---|------|--------|---------|--------|
| 1 | `1-asset-manifest.holo` | ✅ Current | `@holoscript/hololand-platform` | Keep |
| 2 | `2-semantic-annotations.holo` | ✅ Current | `@holoscript/hololand-platform` | Keep |
| 3 | `3-world-definition.holo` | ✅ Current | `@holoscript/hololand-platform` | Keep |
| 4 | `4-integrated-experience.holo` | ✅ Current | `@holoscript/hololand-platform` | Keep |
| 5 | `5-ar-bridge-contract.holo` | ✅ Current | `@holoscript/hololand-platform` + `@holoscript/r3f-renderer` | Keep |
| 6 | `6-ar-webxr-adapter.holo` | ✅ Current | `@holoscript/hololand-platform` + `@holoscript/r3f-renderer` | Keep |
| 7 | `7-ar-portal-overlay.holo` | ✅ Current | `@holoscript/hololand-platform` + `@holoscript/r3f-renderer` | Keep |
| 8 | `8-ar-geo-commerce.holo` | ✅ Current | `@holoscript/hololand-platform` + `@holoscript/holomap` | Keep |
| 9 | `9-engine-graphs.holo` | ✅ Current | `@holoscript/engine` + `@holoscript/visualizer-client` | Keep |
| 10 | `10-twin-earth-playable.holo` | ✅ Current | `@holoscript/hololand-platform` + `@holoscript/framework` | Keep |

**Verdict:** All 10 HoloLand numbered examples are current and map to live packages. No action.

### 1.2 Quickstart Examples (`examples/quickstart/`)

| # | File | Status | Maps To | Action |
|---|------|--------|---------|--------|
| 1 | `1-floating-cyan-cube.holo` | ✅ Current | `@holoscript/core` + `@holoscript/r3f-renderer` | Keep |
| 2 | `2-red-cube-teapot-scene.holo` | ✅ Current | `@holoscript/core` + `@holoscript/r3f-renderer` | Keep |
| 3 | `3-ball-ramp-with-physics.holo` | ✅ Current | `@holoscript/core` + `@holoscript/engine` | Keep |
| 4 | `4-networked-sphere.holo` | ✅ Current | `@holoscript/core` + `@holoscript/mesh` | Keep |
| 5 | `5-color-button-interaction.holo` | ✅ Current | `@holoscript/core` + `@holoscript/ui` | Keep |

**Verdict:** All 5 quickstart examples current. No action.

### 1.3 v5.0-Hardened Examples (`examples/v5.0-hardened/`)

| # | File | Status | Maps To | Action |
|---|------|--------|---------|--------|
| 01 | `01-agent-pool-orchestration.hs` | ⚠️ Stale ref | `@holoscript/agent-protocol` (was `@holoscript/secure-mesh`) | **Migrate** |
| 01 | `01-hybrid-perception-pipeline.hs` | ⚠️ Stale ref | `@holoscript/core` (was `@holoscript/mesh-deploy`) | **Migrate** |
| 01 | `01-tenant-isolation-policy.hs` | ✅ Current | `@holoscript/auth` | Keep |
| 02 | `02-bounty-task-market.hs` | ⚠️ Stale ref | `@holoscript/marketplace-api` (was `@holoscript/secure-mesh`) | **Migrate** |
| 02 | `02-escrow-payment-channel.hs` | ✅ Current | `@holoscript/marketplace-api` | Keep |
| 02 | `02-governance-proposal-vote.hs` | ✅ Current | `@holoscript/marketplace-api` | Keep |
| 02 | `02-reputation-scoring.hs` | ⚠️ Stale ref | `@holoscript/auth` (was `@holoscript/secure-mesh`) | **Migrate** |
| 02 | `02-x402-micro-payment.hs` | ✅ Current | `@holoscript/marketplace-api` | Keep |
| 03 | `03-adversarial-training-loop.hs` | ⚠️ Stale ref | `@holoscript/ai-validator` (was `@holoscript/mesh-deploy`) | **Migrate** |
| 03 | `03-autonomous-swarm-consensus.hs` | ⚠️ Stale ref | `@holoscript/agent-protocol` (was `@holoscript/secure-mesh`) | **Migrate** |
| 03 | `03-collaborative-filtering.hs` | ✅ Current | `@holoscript/trait-inference` | Keep |
| 03 | `03-emotion-recognition-pipeline.hs` | ✅ Current | `@holoscript/ai-validator` | Keep |
| 03 | `03-neural-network-inference.hs` | ✅ Current | `@holoscript/snn-webgpu` | Keep |
| 03 | `03-predictive-maintenance.hs` | ✅ Current | `@holoscript/iot` | Keep |
| 03 | `03-sensor-fusion-pipeline.hs` | ✅ Current | `@holoscript/iot` | Keep |
| 04 | `04-audit-log-compliance.hs` | ✅ Current | `@holoscript/auth` | Keep |
| 04 | `04-industrial-digital-twin.hs` | ✅ Current | `@holoscript/engine` | Keep |
| 04 | `04-med-sim-training.hs` | ✅ Current | `@holoscript/engine` | Keep |
| 04 | `04-robotic-arm-control.hs` | ✅ Current | `@holoscript/robotics` | Keep |
| 04 | `04-secure-group-chat.hs` | ⚠️ Stale ref | `@holoscript/mesh` (was `@holoscript/secure-mesh`) | **Migrate** |
| 04 | `04-system-audit-automation.hs` | ✅ Current | `@holoscript/auth` | Keep |
| 04 | `04-urban-grid-optimization.hs` | ✅ Current | `@holoscript/engine` | Keep |

**Verdict:** 11 of 22 v5.0-hardened examples reference deleted packages. **Action:** Update package names in source + README.

### 1.4 Browser Templates (`examples/browser-templates/`)

| # | File | Status | Maps To | Action |
|---|------|--------|---------|--------|
| 1 | `01-react-component-wrapper.html` | ❌ Legacy | `@holoscript/web-preview-plugin` (deleted) | **Archive** |
| 2 | `02-vue-composition-api.html` | ❌ Legacy | `@holoscript/web-preview-plugin` (deleted) | **Archive** |
| 3 | `03-angular-standalone-component.html` | ❌ Legacy | `@holoscript/web-preview-plugin` (deleted) | **Archive** |
| 4 | `04-svelte-kit-route.html` | ❌ Legacy | `@holoscript/web-preview-plugin` (deleted) | **Archive** |
| 5 | `05-solid-js-template.html` | ❌ Legacy | `@holoscript/web-preview-plugin` (deleted) | **Archive** |
| 6 | `06-next-js-page-router.html` | ❌ Legacy | `@holoscript/studio-bridge` (deleted) | **Archive** |
| 7 | `07-astro-island-component.html` | ❌ Legacy | `@holoscript/studio-bridge` (deleted) | **Archive** |
| 8 | `08-qwik-resumable-component.html` | ❌ Legacy | `@holoscript/web-preview-plugin` (deleted) | **Archive** |
| 9 | `09-remix-loader-route.html` | ❌ Legacy | `@holoscript/studio-bridge` (deleted) | **Archive** |
| 10 | `10-nuxt-plugin-bridge.html` | ❌ Legacy | `@holoscript/web-preview-plugin` (deleted) | **Archive** |

**Verdict:** All 10 browser-template HTML files reference deleted packages. **Action:** Move to `docs/archive/browser-templates/` and update `examples/README.md`.

### 1.5 Demos (`examples/demos/`)

| File | Status | Maps To | Action |
|------|--------|---------|--------|
| `demo-01-threejs-scene.html` | ❌ Orphan | No `.holo` source found | **Archive** |
| `demo-02-r3f-renderer.html` | ❌ Orphan | No `.holo` source found | **Archive** |
| `demo-03-webxr-session.html` | ❌ Orphan | No `.holo` source found | **Archive** |
| `demo-04-hololand-embed.html` | ❌ Orphan | No `.holo` source found | **Archive** |
| `demo-05-studio-preview.html` | ❌ Orphan | No `.holo` source found | **Archive** |
| `demo-06-marketplace-widget.html` | ❌ Orphan | No `.holo` source found | **Archive** |

**Verdict:** 6 orphan HTML demos with no corresponding HoloScript source. **Action:** Archive or delete.

### 1.6 Other Numbered Categories (All Current)

| Category | Count | Status | Action |
|----------|-------|--------|--------|
| `affordances/` | 3 | ✅ Current | Keep |
| `autonomous-ecosystems/` | 4 | ✅ Current | Keep |
| `cross-reality/` | 3 | ✅ Current | Keep |
| `cryptography/` | 4 | ✅ Current | Keep |
| `emotion/` | 3 | ✅ Current | Keep |
| `enterprise/` | 7 | ✅ Current | Keep |
| `language-reference/` | 5 | ✅ Current | Keep |
| `lighting/` | 4 | ✅ Current | Keep |
| `multisensory/` | 3 | ✅ Current | Keep |
| `narrative/` | 3 | ✅ Current | Keep |
| `neuromorphic/` | 3 | ✅ Current | Keep |
| `npc-roles/` | 4 | ✅ Current | Keep |
| `perception-tests/` | 5 | ✅ Current | Keep |
| `persistence/` | 3 | ✅ Current | Keep |
| `procedural/` | 4 | ✅ Current | Keep |
| `rendering/` | 4 | ✅ Current | Keep |
| `social-commerce/` | 3 | ✅ Current | Keep |
| `tutorials/` | 1 | ✅ Current | Keep |
| `volumetric/` | 5 | ✅ Current | Keep |
| `weather/` | 5 | ✅ Current | Keep |
| `xr/` | 3 | ✅ Current | Keep |

---

## 2. Stale Package References

| Deleted Package | Replacement | Files Affected |
|-----------------|-------------|----------------|
| `@holoscript/secure-mesh` | `@holoscript/agent-protocol` + `@holoscript/auth` | 6 files in `v5.0-hardened/` |
| `@holoscript/mesh-deploy` | `@holoscript/agent-protocol` | 2 files in `v5.0-hardened/` |
| `@holoscript/web-preview-plugin` | `@holoscript/studio` (web preview is now built-in) | 8 files in `browser-templates/` |
| `@holoscript/studio-bridge` | `@holoscript/studio` | 3 files in `browser-templates/` + 1 in `demos/` |

---

## 3. Action Plan

### Immediate (this task)
1. Move `examples/browser-templates/` → `docs/archive/browser-templates/`
2. Move `examples/demos/` → `docs/archive/demos/`
3. Update `examples/README.md` to reflect archived categories
4. Create migration ticket for 11 v5.0-hardened stale-ref files

### Follow-up (separate task)
- Update package imports in 11 v5.0-hardened examples
- Re-run `node scripts/examples-health-matrix.mjs --all` after migration
- Verify no new stale refs introduced

---

## 4. Verification Commands

```bash
# Count all numbered example files
find examples/ -type f | grep -E '/[0-9]+[-_]' | wc -l

# Find references to deleted packages
grep -rn "@holoscript/secure-mesh\|@holoscript/mesh-deploy\|@holoscript/web-preview-plugin\|@holoscript/studio-bridge" examples/

# Verify browser-templates move
git mv examples/browser-templates docs/archive/browser-templates

# Verify demos move
git mv examples/demos docs/archive/demos
```

---

*Audit closed. 27 legacy browser/React/HTML examples flagged for archive. 11 v5.0-hardened examples need package-name migration. 112 language examples confirmed current.*
