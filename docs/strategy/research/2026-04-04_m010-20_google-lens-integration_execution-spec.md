# M.010.20 — Android Google Lens Integration (Execution Spec)

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Integrate Google Lens-style visual understanding into HoloScript mobile flow so users can point at real objects, extract semantic labels/relations, and inject those as typed entities into a `.holo` scene graph.

## Product behavior

1. User opens camera in mobile authoring mode.
2. User points at an object and taps **Understand**.
3. Vision service returns:
   - object label(s)
   - confidence
   - optional text/OCR
   - coarse spatial bounds
4. System maps result to HoloScript semantic nodes (`object`, `tag`, `metadata`).
5. Scene graph updates in real time and can be edited before commit.

## Door-opening impact

- Dramatically lowers scene-authoring friction from blank-canvas to semantic bootstrap.
- Converts real world context into structured holographic primitives.
- Creates a practical “AI-to-Holo” pipeline useful for demos, enterprise PoCs, and onboarding.

## Scope

### In scope (v1)

- Mobile camera capture + analysis trigger
- Vision-to-scene mapping for top-k object labels
- Confidence-aware insertion and user review UI
- `.holo` export path with attached semantic metadata

### Out of scope (v1)

- Full segmentation mesh extraction
- Continuous always-on analysis stream
- Multi-frame SLAM-grade object persistence

## Data contracts

```ts
interface LensDetection {
  id: string;
  label: string;
  confidence: number; // 0..1
  boundingBox?: { x: number; y: number; w: number; h: number };
  text?: string;
  attributes?: Record<string, string | number | boolean>;
}

interface SceneSemanticInsertion {
  nodeId: string;
  kind: 'object' | 'tag' | 'annotation';
  sourceDetectionId: string;
  label: string;
  confidence: number;
  metadata: Record<string, unknown>;
}
```

## Technical architecture

### 1) Mobile capture adapter

- Capture frame on user action
- Normalize image dimensions + orientation
- Route to configured analyzer backend (Lens-compatible interface)

### 2) Analyzer gateway

- Adapter interface for provider abstraction
- Returns canonical `LensDetection[]`
- Applies confidence threshold + dedup

### 3) Semantic mapper

- Maps detections into scene entities and tags
- Emits staged insertions in review buffer
- Supports accept/reject per insertion

### 4) Scene graph commit

- Accepted insertions merged into active `.holo` composition
- Adds provenance metadata:
  - analyzer provider
  - detection timestamp
  - confidence score

## Proposed code touch points

- `packages/studio/`:
  - mobile camera authoring panel
  - review/approve insertion UX
- `packages/core/`:
  - semantic insertion schema + scene graph merge utility
- `packages/llm-provider/` or adapter layer:
  - analyzer gateway + provider abstraction

## Failure taxonomy

- `ANALYZER_UNAVAILABLE`
- `FRAME_CAPTURE_FAILED`
- `NO_DETECTIONS`
- `LOW_CONFIDENCE_ONLY`
- `SCENE_INSERTION_CONFLICT`

Each failure should provide actionable UX fallback (retry, manual label entry, skip).

## Acceptance criteria

1. Single-frame object analysis returns semantic candidates in under 2s on target device/network.
2. User can approve/reject candidates before scene mutation.
3. Approved candidates appear in scene graph and persist in exported `.holo`.
4. Insertion metadata includes confidence + source provenance.
5. Failure states never corrupt existing scene graph.

## Test plan

### Unit

- detection canonicalization and threshold filtering
- semantic mapping correctness
- conflict-safe insertion merge

### Integration

- camera capture -> analyzer -> review buffer -> commit
- analyzer timeout fallback path
- duplicate detection suppression

### Device validation

- Android capture orientation correctness
- low-light and cluttered-background behavior
- latency and success-rate sampling

## Shipping slices

- Slice A: analyzer gateway + schema + mapper core
- Slice B: mobile review UX + commit pipeline
- Slice C: export/provenance + reliability hardening

## Metrics

- `lens_analysis_requests_total`
- `lens_analysis_success_total`
- `lens_analysis_latency_ms`
- `semantic_candidates_generated_total`
- `semantic_candidates_accepted_total`
- `scene_insert_conflict_total`

## Definition of done

- End-to-end point-and-understand flow works on Android mobile authoring path
- acceptance criteria pass
- `.holo` exports contain semantic insertions with provenance
- operator docs include setup, thresholds, and known limitations
