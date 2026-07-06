# @holoscript/holomap

`@holoscript/holomap` is the HoloMap operator UX package for reconstruction
ingest paths, scene-source comparison probes, CAEL experiment scene-axis
helpers, metric anchoring, and stepwise reconstruction correction flows.

## Install

```bash
npm install @holoscript/holomap
```

## Use

```ts
import {
  anchorReconstruction,
  resolveIngestPath,
  runPaperHarnessIngestProbe,
  StepwiseVideoReconstructor,
} from '@holoscript/holomap';
```

## Package Surface

| Surface                           | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `resolveIngestPath`               | Selects Marble, HoloMap, or comparison paths |
| `RECONSTRUCTION_PROFILES`         | Named scene-source profile metadata          |
| `HOLOMAP_VERTICAL_PROFILES`       | Base, indoor, outdoor, and object profiles   |
| `runPaperHarnessIngestProbe`      | Lightweight paper-harness ingest probes      |
| `formatIngestComparisonMarkdown`  | Reviewer-facing comparison table formatter   |
| `resolveCaelExperiment1SceneAxis` | CAEL experiment scene-axis resolution        |
| `anchorReconstruction`            | Metric anchoring for reconstructed exports   |
| `assertAnchoredDimension`         | Test-facing metric-anchor assertion          |
| `StepwiseVideoReconstructor`      | Inspect/correct/replay reconstruction stages |
| `profiles/*`                      | Published HoloMap profile JSON assets        |

## Packaging Note

This package is `dist`-first: `main`, `module`, and `types` point at generated
artifacts, and the npm `files` list publishes `dist` plus `profiles`. Run the
package build before publishing, pack auditing, or validating downstream
consumption.

## Strategy Role

This package is the HoloMap operator and evidence surface, not the core
reconstruction runtime. Keep low-level reconstruction math in
`@holoscript/core`, HoloLand services in `@holoscript/hololand-platform`, and
browser preview components in renderer or Studio packages.

Use `@holoscript/holomap` when a workflow needs reconstruction profile
selection, HoloMap-vs-Marble comparison evidence, CAEL scene-axis labels,
metric export anchoring, or human-correctable reconstruction stages.

## Validation

```bash
corepack pnpm --filter @holoscript/holomap run build
corepack pnpm --filter @holoscript/holomap run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
node scripts/holo-ci/frozen-lockfile-check.mjs
corepack pnpm run package:opportunity-map
```
