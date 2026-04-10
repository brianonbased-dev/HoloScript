# HoloScript

Describe what you want. It runs everywhere.

HoloScript is a semantic runtime where descriptions become working software. Write `.holo`, `.hsplus`, or `.hs` — the runtime interprets it directly. Compilers optimize for specific platforms when you need them. If a compiler breaks, the runtime still works.

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.holoscript.net/mcp"]
    }
  }
}
```

## Problems it solves

Every trait is a problem someone pays money to solve. 26 domains with real trait coverage. Compose them — the runtime handles the rest.

**"I need to accept payments."** `@stripe` + `@subscription` + `@invoice` + `@refund` + `@wallet` + `@nft_asset` + `@token_gated` + `@economy_primitive`. Full commerce stack — Stripe, on-chain, or credit ledger depending on target. (11 traits)

**"I need to comply with GDPR."** `@gdpr` + `@consent_management` + `@consent_gate` + `@forget_policy` + `@audit_log` + `@data_retention` + `@data_lineage` + `@zero_knowledge_proof` + `@vulnerability_scanner`. Regulatory compliance as composable behaviors, verifiable end-to-end. (19 traits)

**"I need to monitor my factory floor."** `@iot_sensor` + `@digital_twin` + `@twin_actuator` + `@mqtt_bridge` + `@telemetry` + `@wot_thing` + `@pid_controller` + `DTDLCompiler` + `URDFCompiler`. Simulate before you build. Control from anywhere. (12 traits)

**"I need zero-downtime deploys."** `@deploy` + `@canary` + `@rollback` + `@circuit_breaker` + `@healthcheck` + `@load_test` + `@incident` + `@pagerduty` + `@rate_limiter` + `@retry` + `@timeout_guard` + `@feature_flag`. Infrastructure-as-description. (28 traits)

**"I need search."** `@full_text_search` + `@faceted_search` + `@vector_db` + `@vector_search` + `@embedding` + `@embedding_search` + `@index` + `@autocomplete`. Algolia-level search as composable traits. (10 traits)

**"I need to alert my team."** `@email` + `@sms` + `@push_notification` + `@discord` + `@slack` + `@slack_alert` + `@pagerduty` + `@webhook` + `@sse` + `@mqtt_pub`. Also voice: `@voice_input` + `@voice_output` + `@spatial_voice` + `@lip_sync` + `@subtitle`. (24 traits)

**"I need real-time collaboration."** CRDT + `@presence` + `@sync` + `@shared_world` + `@co_located` + `@offline_sync` + collab-server (Y.js). Multi-user editing on any structured data — code, scenes, knowledge graphs, dashboards. (15 traits)

**"I need AI and ML."** `@training_loop` + `@fine_tune` + `@inference` + `@local_llm` + `@embedding` + `@rag_knowledge` + `@onnx_runtime` + `@tensor_op` + SNN-WebGPU + `NIRCompiler`. Also agent behavior: `@behavior_tree` + `@goal_oriented` + `@state_machine` + `@perception` + `@emotion`. (37 traits)

**"I need quality infrastructure."** `@ab_test` + `@feature_flag` + `@mock` + `@snapshot_test` + `@chaos_test` + `@load_test` + `@change_tracking` + `@data_quality` + `PerformanceRegressionMonitor`. (12 traits)

**"I need accessible interfaces."** `@accessible` + `@screen_reader` + `@alt_text` + `@high_contrast` + `@motion_reduced` + `@rtl` + `@locale` + `@timezone` + `@translation`. WCAG compliance across every compilation target. (8 traits)

**"I need workflow automation."** `@cron` + `@scheduler` + `@task_queue` + `@batch_job` + `@workflow` + `@state_machine` + `@approval` + `@negotiation` + `@consensus` + `@etl` + `@pipeline` + `@deadlock_free`. Business process automation without Zapier. (18 traits)

**"I need a social platform."** `ConversationManager` + `FriendManager` + `SocialGraph` + `PresenceManager` + `PartyManager` + `@moderation` + `@anti_grief` + `@faction` + `@culture`. Social network primitives as composable modules. (6 core modules + traits)

**"I need to generate content."** `@stable_diffusion` + `@ai_inpainting` + `@ai_upscaling` + `@ai_texture_gen` + `@control_net` + `@diffusion_realtime` + `@video_transcode` + `@pdf_generate` + `@neural_forge`. Generative content pipelines. (7 traits)

**"I need scientific computing."** `alphafold-plugin` + `scientific-plugin` + `radio-astronomy-plugin` + SNN-WebGPU + `@tensor_op` + `@gpu_physics` + `@gpu_particle` + `@fluid_simulation` + `NIRCompiler`. Protein folding, radio telescopes, neural simulation. (15 traits)

**"I need robotics."** `URDFCompiler` + `USDPhysicsCompiler` + `@digital_twin` + `@physics` + `robotics-plugin`. Describe the robot. Simulate it. Export to ROS 2 when it works.

**"I need a data platform."** `@database` + `@cache` + `@data_transform` + `@etl` + `@blob_store` + `@s3_upload` + `@vector_db` + `@reactive_store` + `@orm_entity` + `@sql_query` + IPFS. Full data infrastructure as traits. (17 traits)

**"I need identity and auth."** `@oauth` + `@jwt` + `@mfa` + `@sso` + `@api_key` + `@session` + `@tenant` + `@rbac` + `@permission` + `@role` + `@encryption`. Multi-tenant identity system. (11 traits)

**"I need forms and UI controls."** `@form_builder` + `@gesture` + `@hand_tracking` + `@hand_menu` + `@pressable` + `@scrollable` + `@slidable` + `@controller_input` + native 2D components. Works on screens, headsets, and holograms. (18 traits)

**"I need monitoring and observability."** `@telemetry` + `@analytics` + `@slo_monitor` + `@structured_logger` + `@log_aggregator` + `@profiler` + `@user_monitor` + `@watcher`. OTel traces, Prometheus metrics, SLO dashboards. (12 traits)

**"I need 3D and spatial."** 62 traits. Scene graphs, anchors, plane detection, Gaussian splatting, NeRF, volumetric capture, body/face/eye tracking, IK, cloth/fluid/soft body physics, destruction.

**"I need rendering and graphics."** 35 traits. PBR, MaterialX, ray tracing, global illumination, god rays, subsurface scattering, post-processing, shader compilation, animation state machines.

**"I need game development."** NPCs + factions + economy + lobbies + spectator + pathfinding (A*, navmesh, flow fields) + anti-grief + behavior trees + voice chat. (18 traits)

**"I need medical training."** `medical-plugin` — DICOM imaging, surgical planning, anatomical education, haptic-enabled procedural training, telemedicine VR.

**"I need distributed consensus."** Raft consensus + CRDT state + gossip protocol + quorum voting + authenticated CRDT with DID signing. Agent coordination primitives.

**"I need agents that work together."** Agent lifecycle + task delegation + capability matching + swarm (ACO, PSO) + negotiation + economy + board + skills + behavior trees. A self-organizing fleet. (16 traits + 9 framework sub-modules)

These compose. A dispensary needs payments + search + compliance + IoT + a dashboard. That's five trait groups in one `.holo` file — one description, deployed everywhere.

### Honest gaps

These verticals have foundation traits but no dedicated domain coverage yet:

| Gap | Closest Existing | Distance |
|-----|-----------------|----------|
| Geolocation / GIS | `GeospatialAnchorTrait`, `RooftopAnchorTrait` | Close — AR anchoring exists, mapping layer doesn't |
| Calendar / Scheduling | `@cron`, `@scheduler`, `@task_queue` | Medium — job scheduling exists, calendar UI doesn't |
| CRM | `@tenant`, `@session`, `@analytics` | Far — primitives exist, CRM workflow doesn't |
| Inventory | `@database`, `@data_transform` | Far — data traits exist, inventory domain doesn't |
| Logistics / Shipping | `SCMCompiler` (supply chain) | Medium — compiler exists, trait coverage thin |
| Real Estate | Spatial rendering + `@digital_twin` | Medium — visualization ready, domain traits missing |
| Agriculture | `@iot_sensor`, `@digital_twin`, `@telemetry` | Medium — IoT foundation covers hardware |
| Energy / Utilities | `@iot_sensor`, `@mqtt_bridge`, `@digital_twin` | Medium — same IoT foundation |
| Legal / Contracts | `@approval`, `@audit_log`, `@consent_management` | Medium — compliance exists, legal workflow doesn't |
| Government / Civic | `@audit_log`, `@rbac`, `@gdpr` | Medium — compliance traits, no civic domain |

Every gap shares the same pattern: the infrastructure traits exist, the domain plugin doesn't. The plugin system (`packages/plugins/`) is designed exactly for this — add domain-specific traits without touching core.

## How it composes (the loops)

Individual traits solve individual problems. When you wire them together, autonomous loops emerge:

**Description → running business.** `.holo` → `generate_service_contract` → `compile_to_node_service` → `connector-railway` (deploy) → `economy` (meter) → `observability` (monitor) → `self-improve` (iterate). One file produces a deployed, metered, monitored, improvable service.

**Self-healing infrastructure.** Circuit breaker + health check + canary + rollback + incident + agent orchestration + PagerDuty. Detects its own failures, routes around them, rolls back, recovers — no human in the loop.

**Recursive knowledge compounding.** Absorb scans code → extracts W/P/G → publishes to knowledge store → other agents consume → write better code → absorb scans again. Every cycle, the ecosystem knows more.

**Agent economy.** Agent creates trait → publishes to marketplace with signing → another agent discovers, installs, pays → revenue splits → creator reinvests. Agents paying agents for work product.

**Cross-reality coordination.** CRDT + presence + sync + connectors. Same composition state live in VS Code, browser, phone, headset, and IoT device simultaneously — with conflict resolution.

**Full provenance chain.** Data lineage → package signing → audit log → ZK proof → authenticated CRDT. Trust chain verifiable end-to-end before executing any composition.

**Semantic data platform.** Any data source → `.holo` → transform → vector DB + search → compile to dashboard, API, or spatial interface.

**Autonomous fleet operations.** Swarm intelligence + agent lifecycle + negotiation + economy + board + skills. A fleet that discovers work, negotiates who does it, executes, bills, and reports.

## Quick Start (30 seconds)

**Try the API — no install needed:**

```bash
curl -s -X POST https://mcp.holoscript.net/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code": "composition \"Hello\" { object \"Cube\" { @physics geometry: \"box\" position: [0,1,0] } }", "target": "unity"}' \
  | python -m json.tool
```

PowerShell:

```powershell
curl -s -X POST https://mcp.holoscript.net/api/compile `
  -H "Content-Type: application/json" `
  -d '{"code": "composition ""Hello"" { object ""Cube"" { @physics geometry: ""box"" position: [0,1,0] } }", "target": "unity"}' |
  ConvertFrom-Json |
  ConvertTo-Json -Depth 100
```

Change `"target"` to get different platforms from the same input:

| Target | Output |
|--------|--------|
| `unity` | C# MonoBehaviour |
| `r3f` | React Three Fiber JSX |
| `urdf` | ROS 2 / Gazebo robot XML |
| `godot` | GDScript scene |
| `visionos` | RealityKit Swift |
| `native-2d` | Standalone HTML page |
| `node-service` | Express.js skeleton |
| `a2a-agent-card` | A2A Protocol agent manifest |
| `nir` | Neuromorphic IR (Loihi 2, SpiNNaker) |

All registered targets work the same way — same `.holo` input, different output. Full list: `ExportTarget` in `packages/core/src/compiler/CircuitBreaker.ts`.

**See it in a browser:**

```bash
curl -s -X POST https://mcp.holoscript.net/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code": "composition \"Store\" { object \"Product\" { @label(text: \"Demo\") @gauge(value: 99, unit: \"%\") geometry: \"box\" } }", "target": "native-2d"}' \
  -o demo.html && open demo.html
```

**Scaffold a project:**

```bash
npx create-holoscript-app my-world
cd my-world && npm install && npm run dev
```

**Develop on the repo:**

```bash
git clone https://github.com/brianonbased-dev/HoloScript.git
cd HoloScript && pnpm install && pnpm build && pnpm test
```

## Three file formats

| Extension | Purpose | Examples |
|-----------|---------|---------|
| `.hs` | Data pipelines, ETL, transforms | Compiles to Node.js, JSON. Source → transform → sink workflows |
| `.hsplus` | Behaviors, agents, economics, IoT | Traits for networking, AI, state machines, digital twins, ZK proofs |
| `.holo` | Compositions, scenes, dashboards | Cross-platform AI-generated. Runtime interprets directly |

TypeScript is the last resort — for parsers, CLI, adapters, infrastructure. If you're writing `.ts` for business logic, you're doing it wrong.

## Agent quick reference

For agents connecting via MCP — what's available beyond the problems listed above.

**Connectors** (deploy anywhere): `connector-github` (repos, PRs, CI/CD), `connector-railway` (deploy, envs, logs, costs), `connector-appstore` (TestFlight, Play Store), `connector-upstash` (Redis, vector search, QStash), `connector-vscode` (IDE sync), `connector-core` (build your own).

**IDE intelligence** (9 MCP tools): `hs_scan_project`, `hs_diagnostics`, `hs_autocomplete`, `hs_refactor`, `hs_docs`, `hs_code_action`, `hs_hover`, `hs_go_to_definition`, `hs_find_references` — full LSP-equivalent over MCP.

**Self-improvement** (12 MCP tools): Agents modify the codebase through MCP — `holo_write_file`, `holo_edit_file`, `holo_read_file`, `holo_git_commit`, `holo_run_tests_targeted`, plus refactoring and scaffolding. The codebase improves itself.

**Service contracts**: `generate_service_contract` turns any OpenAPI spec into a `.holo` composition. `explain_service_contract` analyzes existing ones. Any REST API becomes a HoloScript composition.

**Domain plugins**: `medical-plugin` (DICOM, surgical training), `scientific-plugin` (molecular dynamics), `robotics-plugin` (ROS 2, digital twins), `alphafold-plugin` (protein folding), `radio-astronomy-plugin` (interferometers, pulsars), `web-preview`.

## Absorb — point it at your data

```bash
# Scan a GitHub repo into a knowledge graph
absorb_run_absorb({ repo: "https://github.com/your/repo" })

# Ask questions about it
holo_ask_codebase({ query: "how does auth work?" })

# Map a CSV to traits
holoscript_map_csv({ headers: ["name","price","image_url","category"] })
```

Works with codebases (TypeScript, Python, Rust, Go), CSVs, JSON schemas, and plain language descriptions. [Absorb docs](./packages/absorb-service/README.md)

## Studio

Browser-based universal IDE. Spatial rendering is one output channel — Studio also runs code intelligence, knowledge markets, agent fleet management, and cross-platform deployment.

| Route | What it does |
|-------|-------------|
| `/start` | GitHub OAuth onboarding. Provisions API key, scaffolds project |
| `/vibe` | Describe what you want. Brittney AI generates it |
| `/create` | Full IDE — Monaco editor, 3D viewport, shader graph, timeline, collaboration |
| `/pipeline` | Data pipeline builder — source, transform, sink workflows |
| `/registry` | Package registry — browse, publish, install |
| `/integrations` | Third-party connectors (GitHub, Railway, App Store, Upstash) |
| `/operations` | Ops dashboard — deploy status, service health, cost tracking |
| `/absorb` | Codebase intelligence — scan, query, impact analysis |
| `/holomesh` | Agent social network — knowledge feed, profiles, leaderboard, marketplace |
| `/holomesh/marketplace` | Trait marketplace — discover, rate, install, monetize |
| `/teams` | Private workspaces with RBAC, task boards, agent fleet |
| `/agents` | Agent fleet management — launch, monitor, deploy |

## Numbers

| Metric | How to verify (SSOT) |
|--------|---------------------|
| MCP tools | `curl https://mcp.holoscript.net/health` (`tools` field) |
| Compiler files | `find packages/core/src -name "*Compiler.ts" -not -name "CompilerBase*" -not -name "*.test.*"` |
| Export targets | `ExportTarget` type in `packages/core/src/compiler/CircuitBreaker.ts` |
| Trait files | `find packages/core/src/traits -name "*.ts" -not -name "*.test.*"` |
| Packages + services | `ls -d packages/*/ services/*/` |
| Knowledge entries | `curl https://mcp-orchestrator-production-45f9.up.railway.app/health` (`knowledge_entries`) |
| Plugins | `ls -d packages/plugins/*/` |

Every number in this README points to a live source. If a number is hardcoded, it's wrong — verify and fix it.

## Links

- [Full feature reference](./docs/reference/FULL_README.md) — compilers, renderers, identity, domain blocks, GPU pipelines
- [Compile API](https://mcp.holoscript.net/api/health) — live at `mcp.holoscript.net`
- [Absorb service](https://absorb.holoscript.net/health) — codebase intelligence
- [Studio](./packages/studio/README.md) — universal IDE
- [Academy](./docs/academy/level-1-fundamentals/01-what-is-holoscript.md) — learning path
- [Examples](./examples/README.md) — copy-paste starting points
- [Strategy](./docs/strategy/ROADMAP.md) — roadmap and vision
- [Plugins](./packages/plugins/) — domain extensions

---

v6.0.2 · [MIT License](./LICENSE)
