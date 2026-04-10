# M.010.13 — iOS Ultra Wideband (U1/U2) Shared AR Positioning (Execution Spec)

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Use iOS Ultra Wideband proximity/ranging signals (U1/U2-capable devices) to improve device-to-device spatial alignment for shared AR, targeting centimeter-class relative positioning for collaboration bootstrap.

## Product behavior

1. User starts shared AR session on iOS.
2. Nearby UWB-capable peer devices are discovered and paired.
3. UWB ranging contributes relative position constraints.
4. AR alignment solver fuses UWB + visual anchors.
5. Shared holographic scene appears consistently aligned across devices.

## Scope

### In scope (v1)

- UWB capability detection and session gating
- peer ranging signal ingestion
- fusion model for UWB constraints with AR alignment
- confidence scoring and drift correction triggers
- graceful fallback when UWB unavailable/noisy

### Out of scope (v1)

- multi-floor/large venue absolute geolocation
- cross-platform UWB interoperability beyond iOS baseline
- enterprise secure ranging profiles

## Architecture

### 1) Capability and pairing layer

```ts
interface UwbCapabilityProfile {
  deviceSupportsUwb: boolean;
  chipClass: 'U1' | 'U2' | 'unknown';
  osSupport: boolean;
  canRangePeers: boolean;
}
```

- gate advanced alignment mode on capability profile
- pair peers via session handshake + permissions

### 2) Ranging measurement model

```ts
interface UwbRangeSample {
  sessionId: string;
  localDeviceId: string;
  remoteDeviceId: string;
  distanceMeters: number;
  azimuthRad?: number;
  elevationRad?: number;
  quality: number; // 0..1
  timestampMs: number;
}
```

### 3) Fusion and alignment solver

- visual-anchor baseline alignment first
- apply UWB constraints to reduce relative drift
- weighted fusion by measurement quality and recency
- expose `alignmentConfidence` metric to UX layer

### 4) Drift management and fallback

- if UWB quality degrades below threshold:
  - suspend UWB weight
  - maintain visual-only mode
  - prompt optional re-pair/re-range

## Proposed code touch points

- `packages/runtime/`
  - UWB adapter + sample ingestion
  - fusion solver hooks for shared AR alignment
- `packages/core/`
  - alignment-confidence schema and session metadata
- `packages/studio/` / mobile shared-AR controls
  - UWB status, confidence, and fallback indicators

## Failure taxonomy

- `UWB_UNSUPPORTED_DEVICE`
- `UWB_PERMISSION_DENIED`
- `PEER_RANGING_UNAVAILABLE`
- `UWB_SIGNAL_LOW_QUALITY`
- `ALIGNMENT_FUSION_UNSTABLE`

## Acceptance criteria

1. UWB-capable iOS peers can pair and produce ranging samples.
2. Shared AR alignment quality improves vs visual-only baseline in controlled test.
3. Confidence score reflects real measurement stability.
4. Fallback to visual-only mode is automatic and non-destructive.
5. Session preserves continuity during temporary ranging dropouts.

## Test plan

### Unit

- range sample validation and normalization
- fusion weight logic by quality/recency
- confidence score computation

### Integration

- pairing -> ranging stream -> alignment update pipeline
- signal degradation fallback transitions
- reconnect and re-range behavior

### Device validation

- U1/U2 iPhone pair scenarios
- varied distance/orientation tests
- occlusion/interference sensitivity checks

## Shipping slices

- Slice A: capability + ranging adapter
- Slice B: fusion solver integration + confidence output
- Slice C: fallback hardening + telemetry + operator UX

## Metrics

- `uwb_pairing_success_total`
- `uwb_range_sample_rate`
- `uwb_alignment_confidence`
- `uwb_fallback_activation_total`
- `shared_ar_alignment_error_cm`

## Definition of done

- UWB-assisted shared AR alignment works on supported iOS devices
- acceptance criteria pass
- fallback is reliable on unsupported/low-quality conditions
- support matrix and operating constraints documented
