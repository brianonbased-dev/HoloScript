# M.010.19 — Android WebXR (Chrome) Browser-Native XR (Execution Spec)

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Deliver a no-install Android XR path in Chrome using WebXR so users can load `.holo` experiences directly via URL, reducing onboarding friction and improving door-opening conversion.

## Product behavior

1. User opens a shared HoloScript link in Chrome on Android.
2. Page preflights WebXR support and required permissions.
3. User taps **Enter XR**.
4. Runtime bootstraps scene from `.holo` composition.
5. Session runs in browser-native immersive mode with fallback when unsupported.

## Why this opens doors

- Zero app install requirement dramatically improves first-use conversion.
- Enables instant demos for enterprise stakeholders and creators.
- Aligns with browser distribution and shareable URL workflows.

## Scope

### In scope (v1)

- WebXR feature detection + support matrix gate
- Android Chrome immersive-vr/immersive-ar session flow
- `.holo` -> WebXR runtime bootstrap path
- Fallback renderer mode for unsupported devices
- Session diagnostics and telemetry

### Out of scope (v1)

- Full parity with native mobile SDK features
- Offline caching guarantees beyond browser defaults
- Cross-browser support beyond Chromium family in initial launch

## Architecture

### 1) Capability preflight

At load, probe:

- `navigator.xr` presence
- supported session modes (`immersive-vr`, `immersive-ar`)
- required features availability
- optional features availability

Emit deterministic capability profile:

```ts
interface WebXRCapabilityProfile {
  xrAvailable: boolean;
  immersiveVr: boolean;
  immersiveAr: boolean;
  hitTest: boolean;
  localFloor: boolean;
  handTracking: boolean;
  reasonUnsupported?: string;
}
```

### 2) Session orchestrator

Flow:

1. `preflight()`
2. `requestSession(mode, requiredFeatures, optionalFeatures)`
3. `bindRenderer(session)`
4. `mountHoloScene(composition)`
5. `startFrameLoop()`

### 3) `.holo` bootstrap bridge

- Parse composition into scene graph
- Resolve assets for browser-safe transport
- Map interaction traits to WebXR-compatible input handlers

### 4) Fallback strategy

If XR unavailable:

- run non-immersive preview path
- preserve link/shareability
- provide explicit upgrade guidance (supported browser/device hints)

## Proposed code touch points

- `packages/runtime/`:
  - WebXR session manager + frame loop adapter
- `packages/core/`:
  - scene graph adaptation layer for browser runtime constraints
- `packages/studio/` or web frontend package:
  - capability UI + enter-xr controls + fallback UX

## Failure taxonomy

- `WEBXR_NOT_AVAILABLE`
- `SESSION_REQUEST_DENIED`
- `REQUIRED_FEATURE_MISSING`
- `ASSET_RESOLVE_FAILED`
- `FRAME_LOOP_INIT_FAILED`

All failures should preserve non-immersive fallback when possible.

## Acceptance criteria

1. Android Chrome supported devices can enter XR from a shared link in <= 3 taps.
2. `.holo` scene boots without app install and renders in XR session.
3. Unsupported devices receive graceful fallback + guidance (no hard failure screen).
4. Session entry/exit events and failure classes are logged to telemetry.
5. Regression test confirms no crash on browsers lacking `navigator.xr`.

## Test plan

### Unit

- capability profile detection logic
- session mode selection and required-feature validation
- fallback decision tree

### Integration

- URL load -> preflight -> session start -> scene mount
- denied permission path
- unsupported feature path with fallback activation

### Device validation

- Android Chrome with WebXR-capable hardware
- Android Chrome without XR capability
- latency and stability across repeated session enter/exit cycles

## Shipping slices

- Slice A: capability preflight + fallback UI
- Slice B: WebXR session orchestration + scene mount
- Slice C: telemetry, hardening, and demo-ready documentation

## Metrics

- `webxr_entry_attempt_total`
- `webxr_entry_success_total`
- `webxr_entry_failure_total{code}`
- `webxr_session_duration_ms`
- `webxr_fallback_activation_total`

## Definition of done

- URL-based Android Chrome WebXR flow works end-to-end
- fallback path is reliable and user-visible
- acceptance criteria pass
- docs include support matrix, known limitations, and rollout guidance
