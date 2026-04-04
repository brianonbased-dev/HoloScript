# M.010.11 — iOS AirPods Spatial Audio (Execution Spec)

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Bind holographic audio emitters to iOS head-tracked spatial audio (AirPods-supported devices) so scene sound sources remain stable in world space as users turn their heads.

## Product behavior

1. User enables spatial audio mode on iOS.
2. Runtime detects compatible output route (AirPods + head tracking support).
3. Scene audio emitters are mapped to spatial anchors.
4. Head rotation updates audio rendering perspective in real time.
5. Fallback to standard stereo when unsupported.

## In scope (v1)

- route capability detection and gating
- emitter-to-anchor spatial mapping
- listener/head orientation pipeline
- low-latency update path for head movement
- fallback and diagnostics UI

## Architecture

### Capability profile

```ts
interface SpatialAudioProfile {
  routeType: 'airpods' | 'bluetooth' | 'speaker' | 'unknown';
  supportsHeadTracking: boolean;
  supportsSpatialRendering: boolean;
  sampleRateHz: number;
}
```

### Runtime model

- world emitters in scene graph
- listener pose from device/head tracking feed
- render bus applies orientation transform and attenuation

### Sync model (optional multi-user)

- only emitters + source events networked
- listener/head orientation local per participant

## Failure taxonomy

- `AUDIO_ROUTE_UNSUPPORTED`
- `HEAD_TRACKING_UNAVAILABLE`
- `SPATIAL_RENDER_INIT_FAILED`
- `EMITTER_BIND_FAILED`

## Acceptance criteria

1. Head turns produce stable, directionally consistent source localization.
2. Multiple emitters preserve separability and distance cues.
3. Unsupported route automatically falls back without session break.
4. Runtime exposes active profile + failure reason in diagnostics.

## Test plan

- unit: emitter transform + attenuation math
- integration: profile detection -> render pipeline activation
- device: AirPods-supported iOS hardware across movement scenarios

## Shipping slices

- Slice A: capability detection + profile surface
- Slice B: emitter/listener spatial pipeline
- Slice C: diagnostics + fallback hardening + UX polish

## Metrics

- `spatial_audio_session_start_total`
- `spatial_audio_headtrack_latency_ms`
- `spatial_audio_fallback_total`
- `spatial_audio_emitter_count`

## Definition of done

- iOS AirPods head-tracked spatial audio works in `.holo` scenes with fallback and telemetry.
