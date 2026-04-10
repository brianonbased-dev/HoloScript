# M.010.17 — Android Foldable Display Split-View XR (Execution Spec)

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Enable a foldable-first interaction mode where Android foldables (Galaxy Fold/Flip class) use split-screen layout:

- **Viewfinder pane**: immersive scene preview
- **Control pane**: editing/scene controls

This converts foldables into practical mobile XR workstations for authoring and demo workflows.

## Product behavior

1. User opens HoloScript mobile session on foldable.
2. Runtime detects fold posture + window class.
3. App switches to split XR layout automatically (or via toggle).
4. Left/top pane renders viewfinder scene; right/bottom pane exposes controls.
5. Edits in control pane apply to viewfinder in real time.

## Scope

### In scope (v1)

- Foldable capability + posture detection
- Dynamic pane orchestration for split mode
- Real-time control-to-view updates
- Portrait/landscape posture-aware pane ratios
- Graceful fallback on non-foldables

### Out of scope (v1)

- Multi-window collaboration across apps
- Full desktop-grade panel docking
- Vendor-specific hinge-angle optimization beyond baseline categories

## Architecture

### 1) Device capability and posture probe

Capture runtime profile:

```ts
interface FoldableProfile {
  isFoldable: boolean;
  posture: 'closed' | 'half_open' | 'open' | 'unknown';
  orientation: 'portrait' | 'landscape';
  preferredSplit: 'horizontal' | 'vertical';
  viewfinderRatio: number;
  controlRatio: number;
}
```

### 2) Split layout orchestrator

- Establish two rendering surfaces/components:
  - `XRViewfinderPane`
  - `ControlPane`
- Shared reactive scene state channel keeps both panes synchronized.

### 3) Input routing model

- Gesture/input in control pane mutates scene command stream.
- Viewfinder receives command stream and re-renders incrementally.
- Prevent cross-pane gesture collision via pane-scoped hit testing.

### 4) Fallback behavior

- Non-foldable devices use stacked single-pane mode.
- Foldable unsupported posture falls back to standard mode with prompt.

## Proposed code touch points

- `packages/studio/` (mobile authoring UI)
  - add foldable split layout container and pane components
- `packages/runtime/`
  - add posture/capability adapter and synchronized render channel
- `packages/core/`
  - add split-mode state schema metadata for persistence

## Failure taxonomy

- `FOLDABLE_PROFILE_UNAVAILABLE`
- `UNSUPPORTED_POSTURE_TRANSITION`
- `PANE_SYNC_TIMEOUT`
- `COMMAND_STREAM_BACKPRESSURE`
- `VIEWFINDER_RENDER_DEGRADED`

## Acceptance criteria

1. Foldable device auto-enters split mode in supported posture.
2. Control pane actions reflect in viewfinder under 100ms median local latency.
3. Posture/orientation changes preserve session state without crash.
4. Non-foldable fallback path remains fully functional.
5. Telemetry captures split-mode engagement and failure events.

## Test plan

### Unit

- foldable profile derivation logic
- pane ratio/orientation calculations
- command routing and pane-scoped input guards

### Integration

- split mode activation/deactivation lifecycle
- orientation + posture transition handling
- control-pane mutation -> viewfinder update path

### Device validation

- Galaxy Fold open/half-open/closed transitions
- Galaxy Flip posture transitions
- sustained editing session stability and heat/perf checks

## Shipping slices

- Slice A: foldable detection + split container
- Slice B: synchronized panes + input routing
- Slice C: transition hardening + telemetry + UX polish

## Metrics

- `foldable_mode_entry_total`
- `foldable_mode_active_duration_ms`
- `pane_sync_latency_ms`
- `posture_transition_failure_total`
- `foldable_fallback_activation_total`

## Definition of done

- Foldable split-view XR authoring works end-to-end on target devices
- acceptance criteria pass
- fallback behavior verified on non-foldable Android
- docs updated with support matrix and posture behavior
