# @holoscript/plugin-emergency-response

`@holoscript/plugin-emergency-response` is the emergency-response domain
plugin for HoloScript. It packages mass-casualty triage, evacuation-zone
planning, resource dispatch, incident command, emergency-analysis receipts, and
solver utilities behind one plugin surface.

## Install

```bash
npm install @holoscript/plugin-emergency-response
```

## Use

```ts
import {
  registerEmergencyResponsePlugin,
  EMERGENCY_RESPONSE_KEYWORDS,
  EMERGENCY_RESPONSE_TRAITS,
  startTriage,
  resourceDispatch,
  buildEmergencyReceipt,
} from '@holoscript/plugin-emergency-response';
```

## Package Surface

| Surface                           | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `triage`                          | START-style patient priority classification  |
| `evacuation_zone`                 | Geographic evacuation zones and route state  |
| `resource_dispatch`               | Emergency unit dispatch and status behavior  |
| `incident_command`                | Incident command and staging-area structure  |
| `startTriage`                     | Classifies patient triage categories         |
| `resourceDispatch`                | Assigns nearest compatible emergency units   |
| `incidentGrowthModel`             | Models incident spread over time             |
| `shelterCapacity`                 | Calculates emergency and extended capacity   |
| `evacuationRoutes`                | Computes capacity-constrained evacuation paths |
| `communicationCascade`            | Models notification-tree coverage            |
| `afterActionReport`               | Scores response-time, utilization, and coverage |
| `buildEmergencyReceipt`           | Emits CAEL-backed emergency-analysis receipts |
| `EMERGENCY_RESPONSE_TRAITS`       | Bundled trait handler list                   |
| `registerEmergencyResponsePlugin` | Registers plugin traits with a runtime target |
| `EMERGENCY_RESPONSE_KEYWORDS`     | Prompt and schema-mapper keyword routing     |

## Packaging Note

This package is currently `dist`-first: `main` points at `dist/index.js` and
`types` points at `dist/index.d.ts`. Run the package build before publishing or
auditing the npm artifact.

## Strategy Role

This package is domain plugin inventory, not a default fleet install. Use it
when emergency management, mass-casualty simulation, evacuation planning,
incident-command training, or resource-dispatch workflows need these traits
directly.

Keep core parser/compiler/runtime generic. Emergency-response vocabulary,
incident-management solver behavior, dispatch policy, and operational
simulation logic belongs here.

## Validation

```bash
corepack pnpm --filter @holoscript/plugin-emergency-response run build
corepack pnpm --filter @holoscript/plugin-emergency-response run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
