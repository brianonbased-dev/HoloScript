# M.010.14 — iOS TrueDepth Face Tracking (52 Blendshapes) Execution Spec

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Mirror user facial expressions into holographic avatars using iOS TrueDepth face tracking with the full ARKit blendshape set, producing low-latency expressive telepresence in HoloScript scenes.

## Product behavior

1. User enables Face Tracking in iOS mobile session.
2. Front camera initializes TrueDepth tracking.
3. Runtime streams blendshape coefficients per frame.
4. Avatar rig maps coefficients to target morphs.
5. Remote peers (or local preview) see expression-driven avatar updates in near real time.

## Scope

### In scope (v1)

- ARKit face anchor ingestion
- 52-blendshape coefficient capture and normalization
- Avatar morph mapping profile (`BlendshapeMap`)
- local preview + network packet integration
- fallback behavior when TrueDepth unavailable

### Out of scope (v1)

- custom rig auto-retargeting ML
- full body + face fusion solve
- non-iOS depth camera parity

## Architecture

### 1) Capture adapter (iOS)

- source: ARKit face anchor update callback
- output: normalized coefficient frame

```ts
interface FaceBlendshapeFrame {
  sessionId: string;
  timestampMs: number;
  trackingState: 'normal' | 'limited' | 'unavailable';
  coefficients: Record<string, number>; // 52 ARKit blendshape keys
}
```

### 2) Mapping layer

- `BlendshapeMap` ties ARKit keys -> avatar morph targets
- supports per-target gain, clamp, and smoothing

```ts
interface BlendshapeMapEntry {
  source: string;
  target: string;
  gain?: number;
  min?: number;
  max?: number;
  smoothing?: number;
}
```

### 3) Runtime application

- apply mapped coefficients each render frame
- optional exponential smoothing to reduce jitter
- expression quality scoring for telemetry

### 4) Network payload (optional shared mode)

- quantized coefficient delta packets
- dropped-frame tolerance + interpolation

## Proposed code touch points

- `packages/runtime/`
  - iOS face tracking adapter
  - coefficient smoothing + mapping utilities
- `packages/core/`
  - blendshape mapping schema + validation
- `packages/studio/` or mobile UI package
  - enable/disable controls and calibration preview

## Failure taxonomy

- `TRUDEPTH_NOT_AVAILABLE`
- `FACE_TRACKING_PERMISSION_DENIED`
- `TRACKING_STATE_LIMITED`
- `BLENDSHAPE_MAP_MISSING_TARGETS`
- `NETWORK_EXPRESSION_DROP`

## Acceptance criteria

1. TrueDepth-supported device captures and applies 52-blendshape updates.
2. Avatar expression update latency meets target (<80ms local path median).
3. Tracking loss degrades gracefully without avatar corruption.
4. Blendshape mapping profile can be adjusted per avatar rig.
5. Fallback path exists for unsupported devices and is user-visible.

## Test plan

### Unit

- blendshape mapping transform correctness
- smoothing/clamping behavior
- quantization encode/decode integrity

### Integration

- ARKit frame ingestion -> avatar morph application
- tracking limited/unavailable transitions
- network expression packet replay and interpolation

### Device validation

- iPhone TrueDepth devices (multiple generations)
- low-light and occlusion conditions
- long-session stability and thermal behavior

## Shipping slices

- Slice A: capture adapter + mapping schema
- Slice B: runtime application + local preview controls
- Slice C: network sync + hardening + calibration UX

## Metrics

- `face_tracking_session_start_total`
- `face_tracking_frame_rate`
- `face_tracking_latency_ms`
- `face_tracking_limited_state_total`
- `face_tracking_fallback_activation_total`

## Definition of done

- End-to-end iOS TrueDepth expression mirroring works on supported devices
- acceptance criteria pass
- fallback and calibration UX documented
- operator notes include rig mapping guidance and known limits
