# Examples Health Matrix

Generated from `examples/examples-health.matrix.json` by `node scripts/examples-health-matrix.mjs --write-markdown`.

## Status Definitions

| Status | Meaning | README/website posture |
| --- | --- | --- |
| supported | Parser returns `success: true` with no errors. | May be linked as a working example. |
| aspirational grammar | High-value story or target syntax ahead of the parser. | May be linked only when labeled aspirational. |
| expected-fail | Known parser failure with a reason. | Keep internal until promoted or explicitly discussed as failing. |
| deprecated | Retained for archive/history. | Do not feature as a current example. |

## Current Inventory

Scope: `examples/examples-health.matrix.json`

| Status | Files | Parse pass | Parse fail |
| --- | ---: | ---: | ---: |
| supported | 5 | 5 | 0 |
| aspirational grammar | 10 | 0 | 10 |
| expected-fail | 1 | 0 | 1 |
| deprecated | 1 | 0 | 1 |
| total | 17 | 5 | 12 |

The default gate covers the explicit health inventory. Use `node scripts/examples-health-matrix.mjs --all --json` for the expensive whole-corpus stress inventory; unlisted parser failures in that mode are classified as expected-fail with the parser's first error as the reason.

## Priority Matrix

| Example | Format | Status | Parser | Reason | Link posture |
| --- | --- | --- | --- | --- | --- |
| `examples/hello-world.hs` | .hs | supported | pass | Baseline .hs quickstart example. | Public link OK |
| `examples/hololand/vv-results-visualization-space.holo` | .holo | aspirational grammar | fail | Uses HoloLand V&V visualization grammar with nested post-processing and dashboard constructs not yet accepted by the parser. | Public link requires aspirational label |
| `examples/multiplayer-game.hsplus` | .hsplus | supported | pass | Baseline .hsplus behavior example. | Public link OK |
| `examples/novel-use-cases/05-robot-training-metaverse.holo` | .holo | aspirational grammar | fail | Uses autonomous ecosystem behavior blocks inside a .holo composition; HoloCompositionParser does not accept that grammar yet. | Public link requires aspirational label |
| `examples/novel-use-cases/05-robot-training-metaverse.hs` | .hs | aspirational grammar | fail | Uses on_error(...) pipeline handler syntax; PipelineParser does not accept that handler form yet. | Public link requires aspirational label |
| `examples/novel-use-cases/05-robot-training-metaverse.hsplus` | .hsplus | aspirational grammar | fail | Uses arrow transition shorthand in state-machine maps; HoloScriptPlusParser does not accept that shorthand yet. | Public link requires aspirational label |
| `examples/novel-use-cases/13-disaster-robotics-swarm.holo` | .holo | aspirational grammar | fail | Uses full disaster-training scene grammar that is ahead of the current .holo parser. | Public link requires aspirational label |
| `examples/novel-use-cases/13-disaster-robotics-swarm.hs` | .hs | aspirational grammar | fail | Uses dotted property expressions in pipeline properties; PipelineParser does not accept that expression shape yet. | Public link requires aspirational label |
| `examples/novel-use-cases/13-disaster-robotics-swarm.hsplus` | .hsplus | aspirational grammar | fail | Uses arrow transition shorthand in behavior state maps; HoloScriptPlusParser does not accept that shorthand yet. | Public link requires aspirational label |
| `examples/physics/advanced-physics-showcase.holo` | .holo | aspirational grammar | fail | Uses nested post_processing blocks and advanced physics traits ahead of the current parser grammar. | Public link requires aspirational label |
| `examples/product-viewer.holo` | .holo | expected-fail | fail | Current .holo parser rejects the product viewer's domain-dataviz string property form; keep out of public working-example links until promoted. | Internal only until promoted |
| `examples/sample-projects/physics-playground.holo` | .holo | aspirational grammar | fail | Uses nested post_processing blocks such as bloom { ... }; HoloCompositionParser currently expects property-value pairs there. | Public link requires aspirational label |
| `examples/showcase/physics-playground.holo` | .holo | aspirational grammar | fail | Uses showcase-scale physics grammar beyond the current declarative parser surface. | Public link requires aspirational label |
| `examples/site.holo` | .holo | deprecated | fail | Legacy v5 landing-page composition retained as archive material; do not feature as a current parser-supported example. | Archive only |
| `examples/solar_system.holo` | .holo | supported | pass | Baseline .holo scene example. | Public link OK |
| `examples/three-format-showcase/smart-gallery.hs` | .hs | supported | pass | Procedural lane of the three-format showcase parses successfully. | Public link OK |
| `examples/three-format-showcase/smart-gallery.hsplus` | .hsplus | supported | pass | Behavior lane of the three-format showcase parses successfully. | Public link OK |

## Operational Check

`node scripts/examples-health-matrix.mjs --check` fails when:

- a supported example does not parse
- a non-supported manual entry has no reason
- a manual path no longer exists
- this generated markdown is stale
