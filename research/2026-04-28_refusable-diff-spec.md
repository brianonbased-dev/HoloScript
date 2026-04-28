# `<RefusableDiff />` Studio Component Spec

**Status:** Spec / Plan-only (task_1777366583512_pidk)  
**Author:** github-copilot  
**Date:** 2026-04-28  
**Target file:** `packages/studio/src/components/RefusableDiff.tsx`  
**References:** research/2026-04-28_cascadeur-EVOLVED.md §frontend, P.700.01 (animator-primacy), D.027 (Brittney diff contract)

---

## 1. Purpose

`<RefusableDiff />` is a **universal "AI suggestion wrapper"** for HoloScript Studio. Any system that generates a mutation to user-authored data (Brittney NL-to-pose, `physics_validate_animation`, `pose.predict`, schema-mapper, scene-composer) wraps its output in this component before presenting it to the animator.

**Principle P.700.01 — Animator primacy:** the user's original data is never mutated until an explicit `accept()` call. The component renders the ORIGINAL by default; the suggestion is a preview overlay the user must actively accept.

---

## 2. Props Interface

```typescript
// packages/studio/src/components/RefusableDiff.tsx

export interface RefusableDiffData<T = unknown> {
  /** The user's original, immutable, authoritative value */
  original: T;

  /** The AI/physics system's suggested replacement */
  suggested: T;

  /**
   * Scalar distance metric between original and suggested (system-defined).
   * Examples:
   *   - pose: average joint angular deviation in radians
   *   - animation: per-frame RMSE across joints
   *   - schema: weighted field-diff count
   * Range: [0, ∞). 0 = identical. UI shows as percentage or raw value.
   */
  deviation_metric: number;

  /**
   * Human-readable label for deviation_metric.
   * E.g. "avg joint deviation 12.4°" or "18 fields changed"
   */
  deviation_label?: string;
}

export interface RefusableDiffProps<T = unknown> extends RefusableDiffData<T> {
  /** Accept the suggestion — replaces original with suggested in caller's state */
  onAccept: () => void;

  /** Reject the suggestion — no state change, component unmounts or resets */
  onReject: () => void;

  /**
   * Accept a blend of original and suggested at parameter t ∈ [0, 1].
   * t=0 → pure original, t=1 → pure suggested.
   * Only called when the system supports blending (renderHint includes 'blend').
   */
  onPartialBlend?: (t: number) => void;

  /**
   * How to render the diff. Defaults to 'side-by-side'.
   * The component chooses the best default for its data type via renderHint.
   */
  visualMode?: 'side-by-side' | 'overlay' | 'slider-blend' | 'table';

  /**
   * Hint from the producer about what visualizations make sense.
   * E.g. ['side-by-side', 'slider-blend'] for pose data.
   * 'table' is always available as fallback.
   */
  renderHints?: Array<'side-by-side' | 'overlay' | 'slider-blend' | 'table' | 'blend'>;

  /**
   * Custom renderer for the content (original/suggested slot).
   * If omitted, falls back to JSON pretty-print (table mode).
   */
  renderSlot?: (value: T, role: 'original' | 'suggested') => React.ReactNode;

  /**
   * Label shown in the header.
   * E.g. "Brittney pose suggestion" or "Physics validation result"
   */
  title?: string;

  /** Source system that produced the suggestion (for audit display). */
  source?: string;

  /**
   * If true, the accept/reject buttons are disabled (read-only preview).
   * Useful for diff history / playback views.
   */
  readOnly?: boolean;
}
```

---

## 3. Default Render Behavior (P.700.01)

1. **Before any interaction:** renders the ORIGINAL in the main viewport. The suggestion is shown in a collapsible "suggestion preview" panel — NOT in the main view.
2. **On hover/focus of suggestion panel:** overlay or side-by-side preview becomes active.
3. **Accept:** replaces the main viewport with suggested; calls `onAccept()`. Component enters "accepted" state (no further action buttons).
4. **Reject:** collapses/dismisses; calls `onReject()`. Main view reverts to original (was never changed).
5. **Partial blend (slider-blend mode only):** live-previews the blend as slider moves; calls `onPartialBlend(t)` when the user commits (mouseup / Enter).

---

## 4. Visualization Modes

### 4.1 Side-by-side (default for pose/schema)
```
┌─────────────────────────────────────────────────┐
│  ⚠ Brittney pose suggestion   Δ 12.4°           │
├────────────────┬────────────────────────────────┤
│   ORIGINAL     │   SUGGESTED                    │
│   [renderSlot] │   [renderSlot]                 │
│                │                                │
├────────────────┴────────────────────────────────┤
│         [✓ Accept]   [✗ Reject]                 │
└─────────────────────────────────────────────────┘
```

### 4.2 Overlay (for 3D viewport / animation curves)
Renders original in full opacity, suggested as a ghost layer (50% opacity, distinct color). Toggle button to flip visibility. Accept/Reject in floating toolbar.

### 4.3 Slider-blend (for continuous interpolation)
```
┌─────────────────────────────────────────────────┐
│  ⚠ Physics validation result   Δ 8.1°           │
│                                                 │
│   ORIGINAL ◄──────┼──────► SUGGESTED            │
│                   t=0.5                         │
│                                                 │
│         [✓ Accept blend]   [✗ Reject]           │
└─────────────────────────────────────────────────┘
```
Slider position drives `onPartialBlend(t)` in real-time during drag. Commit on Accept. Reject always restores t=0 (original).

### 4.4 Table (fallback for schema/field diffs)
Row-per-field diff table:
```
Field              Original       Suggested      Δ
─────────────────────────────────────────────────
root.position.y    0.0            0.12           +0.12
spine.rotation.x   0.0            -0.04          -0.04
...
```
Changed fields highlighted. Added fields shown with `+` badge. Removed fields shown with `−` badge.

---

## 5. Consumers

| Consumer | `renderHints` | `deviation_metric` | Notes |
|----------|--------------|-------------------|-------|
| `pose.predict` trait | `['side-by-side', 'slider-blend', 'blend']` | avg joint angular deviation (rad) | renderSlot uses 3D rig viewport |
| `physics_validate_animation` | `['side-by-side', 'slider-blend', 'blend']` | per-frame RMSE | renderSlot uses animation curve view |
| schema-mapper | `['table', 'side-by-side']` | weighted field-diff count | renderSlot uses JSON tree |
| scene-composer | `['side-by-side']` | object-count diff | renderSlot uses .holo AST diff |
| Brittney diff (D.027) | `['side-by-side']` | line-diff count | renderSlot uses code diff viewer |

---

## 6. Accessibility + UX Requirements

- **Keyboard:** Tab to suggestion panel, Enter to accept, Escape to reject. Slider accessible via arrow keys.
- **Screen reader:** announce "AI suggestion available: {title}, deviation: {deviation_label}. Press Enter to accept, Escape to reject."
- **Color blindness:** deviation_metric traffic-light (green/yellow/red) must also have icon (✓/!/✗) and text label — no color-only signaling.
- **Undo integration:** `onAccept()` caller is responsible for pushing to undo stack (component does not manage undo).

---

## 7. Audit / Provenance Display

Per D.027, every diff rendered through this component should surface:
- **Source** — which system produced it (e.g. "Brittney v2.1 / fireworks/qwen3-235b")
- **Timestamp** — when the suggestion was generated
- **Session ID** — CAEL trace ID if available (for replay)

These appear in a collapsible "Provenance" footer row, not in the main diff UI.

---

## 8. Package Placement

```
packages/studio/
  src/
    components/
      RefusableDiff.tsx          ← main component
      RefusableDiff.test.tsx     ← unit tests (not in this task)
      RefusableDiff.stories.tsx  ← Storybook story (not in this task)
    types/
      refusable-diff.ts          ← exported types (RefusableDiffData, RefusableDiffProps)
```

Export from `packages/studio/src/index.ts`:
```typescript
export { RefusableDiff } from './components/RefusableDiff';
export type { RefusableDiffProps, RefusableDiffData } from './types/refusable-diff';
```

---

## 9. Out of Scope (This Task)

- Actual TSX implementation (wait for impl ticket)
- Storybook stories
- Unit tests
- CSS/Tailwind styling beyond layout spec
- 3D renderSlot implementation for pose.predict (tracked separately)

---

## 10. Open Questions (For /founder Ruling)

1. Should `onPartialBlend` be a continuous callback (called on every slider tick) or only on commit? Answer determines whether producers need a fast-path interpolation or can use heavyweight solvers.
2. Should the ORIGINAL slot be completely hidden in overlay mode (to prevent subconscious anchoring) or always visible?
3. Is "Accept" permanent or should the component support a "revert to original" action after acceptance? (Recommendation: delegate to caller's undo stack, not component state.)
