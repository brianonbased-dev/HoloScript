# @holoscript/plugin-threat-intelligence

`@holoscript/plugin-threat-intelligence` is the cybersecurity threat
intelligence domain plugin for HoloScript. It packages threat-feed ingestion,
IOC matching, SIEM integration, attack-graph behavior, registration helpers,
and solver utilities behind one plugin surface.

## Install

```bash
npm install @holoscript/plugin-threat-intelligence
```

## Use

```ts
import {
  registerThreatIntelligencePlugin,
  THREAT_INTELLIGENCE_KEYWORDS,
  THREAT_INTELLIGENCE_TRAITS,
} from '@holoscript/plugin-threat-intelligence';
```

## Package Surface

| Surface                            | Purpose                                       |
| ---------------------------------- | --------------------------------------------- |
| `threat_feed`                      | Threat feed ingestion and normalization       |
| `ioc_matching`                     | Indicator matching against observed signals   |
| `siem_integration`                 | SIEM pipeline integration behavior            |
| `attack_graph`                     | Attack path and dependency graph behavior     |
| `THREAT_INTELLIGENCE_TRAITS`       | Bundled trait handler list                    |
| `registerThreatIntelligencePlugin` | Registers plugin traits with a runtime target |
| `THREAT_INTELLIGENCE_KEYWORDS`     | Prompt and schema-mapper keyword routing      |
| `threatsolver`                     | Threat-analysis solver helpers                |

## Packaging Note

This package is currently `dist`-first: `main` points at `dist/index.js` and
`types` points at `dist/index.d.ts`. Run the package build before publishing or
auditing the npm artifact.

## Strategy Role

This package is domain plugin inventory, not a default fleet install. Use it
when cybersecurity, SOC, SIEM, threat feed, IOC, or attack-graph workflows need
these traits directly.

Keep core parser/compiler/runtime generic. Threat-intelligence vocabulary,
security workflow behavior, and SOC integration logic belongs here.

## Validation

```bash
corepack pnpm --filter @holoscript/plugin-threat-intelligence run build
corepack pnpm --filter @holoscript/plugin-threat-intelligence run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
