# M.010.07 — Dual-Phone Volumetric Capture (Execution Spec)

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Use two phones as a calibrated stereo pair to capture 3D objects and export them into `.holo` scene assets with usable geometry + texture alignment.

## Product behavior

1. Primary phone starts capture session and generates pairing QR.
2. Secondary phone joins and syncs timestamps.
3. Both devices record synchronized multi-view frames while user circles object.
4. Reconstruction pipeline fuses depth/stereo + pose streams into mesh.
5. Output is packaged as `.holo` object block + referenced texture assets.

## Core constraints

- Clock skew budget: < 20ms between capture streams
- Pose drift must be corrected with periodic visual marker relocalization
- Export must include confidence metadata to avoid false precision in Studio

## Technical architecture

### Capture session

- Session roles: `host` and `peer`
- Shared session metadata:
  - `sessionId`
  - camera intrinsics
  - calibration baseline
  - capture framerate target

### Synchronization

- Time sync handshake at join + periodic drift correction
- Frame envelope:

```ts
interface StereoFrameEnvelope {
  sessionId: string;
  deviceRole: 'host' | 'peer';
  timestampMs: number;
  pose: {
    position: [number, number, number];
    rotation: [number, number, number, number];
  };
  intrinsics: number[];
  imageRef: string;
  depthRef?: string;
}
```

### Reconstruction pipeline

1. Pair frame windows by nearest synchronized timestamps
2. Triangulate sparse points using stereo correspondences
3. Fuse with depth maps when available
4. Build mesh + run hole filling + smoothing (bounded)
5. UV unwrap + texture bake
6. Emit `.holo` template/object payload

### Export contract

- Geometry output: `model/<sessionId>.glb`
- Texture output: `textures/<sessionId>_albedo.png`
- `.holo` reference snippet includes quality/confidence fields

## Proposed code touch points

- `packages/runtime/` — capture session orchestrator + sync protocol
- `packages/core/` — `.holo` exporter extension for volumetric capture metadata
- `packages/studio/` — import panel for dual-phone capture output + confidence badges

## Failure taxonomy

- `PAIRING_TIMEOUT`
- `TIME_SYNC_DRIFT_EXCEEDED`
- `INSUFFICIENT_PARALLAX`
- `RECONSTRUCTION_LOW_CONFIDENCE`
- `EXPORT_SERIALIZATION_FAILED`

## Acceptance criteria

1. Two-device pairing succeeds in < 15s under local network conditions.
2. Captured object reconstructs into valid mesh and imports into Studio.
3. Exported `.holo` scene reference resolves assets without manual patching.
4. Capture confidence score is exposed and persisted in output metadata.
5. Failure modes produce actionable user guidance (reposition, relight, recapture).

## Test plan

### Unit

- frame pairing logic under timestamp jitter
- sync drift correction math
- export schema validation

### Integration

- synthetic dual-stream reconstruction test
- degraded network simulation for pairing/sync resilience
- low-parallax capture failure path

### Device validation

- Android + Android pair
- iOS + iOS pair
- mixed pair (feature-flag if unsupported in v1)

## Shipping slices

- Slice A: Pairing + sync protocol + schema tests
- Slice B: Reconstruction core + mesh export path
- Slice C: Studio ingestion + confidence UX + end-to-end demo

## Metrics

- `stereo_pair_success_rate`
- `capture_sync_drift_ms`
- `reconstruction_success_rate`
- `export_success_rate`
- `capture_to_import_latency_ms`

## Definition of done

- End-to-end dual-phone capture -> `.holo` import demonstrated
- acceptance criteria pass
- confidence metadata and error guidance available in Studio
- docs updated for operator workflow and known limitations
