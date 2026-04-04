# M.010.10 — iOS Object Capture Photogrammetry (Execution Spec)

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Integrate iOS Object Capture workflow for walk-around photogrammetry so creators can capture real objects and export textured 3D assets that embed cleanly into `.holo` scenes.

## Product behavior

1. User starts Object Capture mode on supported iOS device.
2. Guided capture UX helps gather complete photo coverage.
3. Reconstruction generates textured 3D model.
4. Asset is packaged with metadata and imported into scene library.
5. User places resulting object into active `.holo` composition.

## In scope (v1)

- capture session orchestration and guidance states
- reconstruction job lifecycle and progress tracking
- model + texture packaging and import metadata
- `.holo` scene insertion path for captured assets
- quality/confidence indicators for resulting model

## Architecture

### Capture session contract

```ts
interface ObjectCaptureSession {
  sessionId: string;
  status: 'collecting' | 'processing' | 'complete' | 'failed';
  frameCount: number;
  coverageScore: number; // 0..1
  startedAtMs: number;
}
```

### Reconstruction output contract

```ts
interface CapturedModelArtifact {
  modelPath: string;       // e.g. glb/usdz path
  texturePaths: string[];
  triangleCount: number;
  boundingBox: { min: [number,number,number]; max: [number,number,number] };
  confidence: number;
  captureSessionId: string;
}
```

### Pipeline

1. collect frames with guidance feedback
2. submit processing job
3. monitor processing state
4. validate output quality thresholds
5. publish artifact into `.holo` asset registry

## Failure taxonomy

- `OBJECT_CAPTURE_UNSUPPORTED`
- `INSUFFICIENT_COVERAGE`
- `RECONSTRUCTION_FAILED`
- `ARTIFACT_VALIDATION_FAILED`
- `IMPORT_BIND_FAILED`

## Acceptance criteria

1. Supported iOS device can complete capture->reconstruction->import flow.
2. Exported artifact can be inserted into `.holo` scene without manual conversion.
3. Coverage/quality feedback prevents common failed captures.
4. Failed reconstruction exits with actionable retry guidance.

## Test plan

- unit: coverage scoring + artifact validation
- integration: capture lifecycle and job state transitions
- device: varied lighting/surface complexity/object scale

## Shipping slices

- Slice A: capture session + guidance UI
- Slice B: reconstruction lifecycle + artifact contract
- Slice C: scene insertion + quality diagnostics + docs

## Metrics

- `object_capture_session_start_total`
- `object_capture_success_total`
- `object_capture_failure_total{code}`
- `object_capture_processing_latency_ms`
- `object_capture_import_success_total`

## Definition of done

- End-to-end iOS Object Capture into `.holo` workflow is functional with quality diagnostics and fallback guidance.
