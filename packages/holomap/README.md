# @holoscript/holomap

HoloMap operator UX: ingest-path profiles, paper-harness scene-source probes,
spatial anchoring, and CAEL experiment-axis helpers for reconstruction
pipelines (Marble-compatibility scenes vs the native HoloMap WebGPU path).

External and public consumers — operators and researchers running
reconstruction experiments, and agent-framework integrators building on top
of `@holoscript/core`'s reconstruction runtime — bring their own video
frames, reconstruction runtime instance, and paper/report IDs. This package
supplies plain-language labels, comparison tables, and axis bookkeeping; it
does not ship a reconstruction engine, a renderer, or a dataset.

## Installation

```bash
npm install @holoscript/holomap
```

## Quick start

```ts
import {
  RECONSTRUCTION_PROFILES,
  HOLOMAP_VERTICAL_PROFILES,
  measureBoundsDimension,
  resolveCaelExperiment1SceneAxis,
  formatIngestComparisonMarkdown,
} from '@holoscript/holomap';

// Plain-language ingest-path profile lookup (operator UX, not engine config):
const profile = RECONSTRUCTION_PROFILES['native-holomap-v1'];
console.log(profile.plainName); // "Native scene (HoloMap)"

// Resolve which scene-source axis a run should use, from your own env:
const axis = resolveCaelExperiment1SceneAxis(process);

// Anchor a reconstruction to a known real-world dimension (metric vs relative-scale-only):
const dim = measureBoundsDimension(manifest, 'y');
```

Vertical profiles (`base` / `indoor` / `outdoor` / `object`) and their JSON
twins ship under `profiles/` — load them via
`import('@holoscript/holomap/profiles/native-holomap-v1.json')` or read the
files directly; they are plain data, not code.

## What's in this package

- `ingestPath` — `RECONSTRUCTION_PROFILES` / `HOLOMAP_VERTICAL_PROFILES`:
  plain-language metadata mapping env/argv/profile IDs to ingest paths.
- `anchor` — spatial anchoring: binds a reconstruction to a known real-world
  dimension and tags exports `metric` vs `relative-scale-only` so a caller
  can never mistake an unanchored export for a correctly-scaled one.
- `comparisonReport` — formats Marble-compatibility vs native-HoloMap ingest
  runs into a markdown comparison table with contract fingerprints.
- `paperHarnessProbe` — lightweight ingest probes for paper harnesses
  (fingerprints a path for logs/reviewer tables; does not replace full I/O).
- `caelExperiment1` — scene-source axis resolution and condition labeling for
  CAEL experiment protocols.
- `stepwise` — `StepwiseVideoReconstructor`: a stage-by-stage reconstruction
  driver (`ingest` → `depth` → `merge`) that exposes intermediate state so a
  bad stage can be corrected without restarting the whole pipeline.

## Package boundary & release posture

This package targets operators and agent-framework integrators, not end
consumers of a finished 3D asset. It does not ship a reconstruction engine
(that is `@holoscript/core`'s `createHoloMapRuntime`, a caller-owned peer
you bring yourself), a GPU driver, or any founder-local or private-workspace
default — video frames, camera intrinsics, and environment variables such as
`CAEL_EXP1_SCENE_AXIS` are all supplied by the caller.

Release posture: v0-preview. Known limitations — `paperHarnessProbe` is
explicitly a lightweight fingerprinting probe, not a substitute for full
Marble I/O; anchoring only guards against scale drift on the axis you
measure, and an unanchored export is tagged `relative-scale-only` rather
than silently treated as metric. Profile IDs and vertical trait lists are
still evolving — pin an exact package version if you persist profile IDs in
reports; there is no in-package rollback for a reconstruction run itself
(retry/rollback of the underlying video/runtime session is caller-owned).

## Testing

```bash
npm test    # vitest run
```

## License

MIT License - See [LICENSE](./LICENSE) for details.
