# Studio component deduplication — audit (phase 1)

**Board:** `task_1776640937112_vwt6`  
**Source:** `2026-03-01_holoscript-studio-ide-audit.md` (component deduplication)  
**Scope:** `packages/studio/src/components/panels/` (+ sidebar shell)

## Findings

### 1. Repeated panel chrome (high frequency)

Many panels share the same **layout and typography shell**:

- Root: `className="p-3 space-y-3 text-xs"`
- Title row: `flex items-center justify-between` plus `h3` with `text-sm font-semibold text-studio-text` and optional `span` with `text-[10px] text-studio-muted` for stats

**Examples:** `CameraPanel.tsx`, `LightingPanel.tsx` (same header pattern), and the same classes appear across dozens of `*Panel.tsx` files under `panels/`.

**Dedup direction:** Introduce a small presentational wrapper, e.g. `StudioPanelFrame({ title, subtitle, emoji?, children })`, or a `panelChrome` tailwind constant in one module, and migrate panels incrementally (domain-by-domain to avoid a megabranch).

### 2. Sidebar import fan-out

`RightPanelSidebar.tsx` directly imports **40+** panel components. That is manageable for tree-shaking in dev, but it is a **merge-conflict hotspot** and makes “which panel exists” implicit.

**Dedup direction:** Optional lazy `dynamic()`/`React.lazy` per tab (larger change) or keep static imports but generate the tab→component map from `types/panels.ts` + a single registry object to avoid duplicate tab ids.

### 3. Emoji / icon maps

Several panels define local `Record<string, string>` maps for mode icons (e.g. camera modes, light types). Pattern repeats; not harmful, but a shared `studioPanelIcons` map (or Lucide) would shrink noise.

### 4. Out of scope for this memo

- **Industry / scenario** panels under `components/industry/` use different product chrome; treat as a second audit pass.
- **Deduplication of business logic** (hooks) is already partially centralized (`useCamera`, `useLighting`, etc.); further hook merges need domain review.

## Recommended sequencing

1. Add `StudioPanelFrame` (or equivalent) + migrate **3 pilot panels** (Camera, Lighting, Viewport) to validate API.
2. Roll out to remaining `panels/*` in batches with UI snapshot or Playwright smoke if available.
3. Revisit `RightPanelSidebar` registry only after frame migration stabilizes.

## What remains after this audit

- Implement the wrapper + migrations (estimate aligns with source “~3 days” if QA included).
- Measure bundle impact if moving to lazy-loaded panels.
