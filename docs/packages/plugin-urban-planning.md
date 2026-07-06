# @holoscript/plugin-urban-planning

`@holoscript/plugin-urban-planning` is the civic simulation and urban-planning
domain plugin for HoloScript. It packages zoning, traffic flow, population
density, geospatial climate, and economy bridge helpers behind one plugin
surface so city-planning behavior does not move into HoloScript core.

## Install

```bash
npm install @holoscript/plugin-urban-planning
```

## Use

```ts
import {
  createTrafficFlowHandler,
  createZoningHandler,
  revenueTickInputFromZoning,
} from '@holoscript/plugin-urban-planning';
```

## Package Surface

| Surface                            | Purpose                                       |
| ---------------------------------- | --------------------------------------------- |
| `zoning`                           | Land-use, density, and zoning-rule behavior   |
| `traffic_flow`                     | Road capacity and congestion trait handling   |
| `population_density`               | Population-density trait handling             |
| `geospatial_climate`               | Climate-aware spatial planning signals        |
| `bpr_traffic_solver`               | Bureau of Public Roads traffic-flow solver    |
| `URBAN_PLANNING_ECONOMY_PLUGIN_ID` | Economy bridge package identifier             |
| `revenueTickInputFromZoning`       | Converts zoning state into economy tick input |

## Packaging Note

This package is currently source-first: `main` points at `src/index.ts`, and the
test script runs Vitest directly against source. Treat a future `dist`
entrypoint migration as its own hardening pass.

## Strategy Role

This package is domain plugin inventory, not a default fleet install. Use it
when civic simulation, zoning, traffic, climate, or HoloLand city-governance
workflows need urban-planning traits directly.

Keep core parser/compiler/runtime generic. City-planning constraints, traffic
solver behavior, and civic economy bridges belong here.

## Validation

```bash
corepack pnpm --filter @holoscript/plugin-urban-planning run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
