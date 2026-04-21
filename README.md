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

## Why teams choose HoloScript

HoloScript is for teams that want to describe intent once and execute it across many targets.

### 1) Write intent, not glue code

Use semantic files (`.holo`, `.hsplus`, `.hs`) to define behavior, data, and interfaces.  
The runtime executes directly. Compilers optimize where available.

### 2) Build agent-native systems

HoloScript includes board workflows, MCP integration, connectors, and composable traits so agents can discover work, execute, and report with structured outputs.

### 3) Keep deployment paths flexible

The same composition can target multiple outputs (renderers, services, robotics, and more). If a compiler path is unavailable, runtime interpretation keeps your workflow alive.

### 4) Compose real product capabilities

Trait groups cover common production needs:

- payments and economy
- compliance and auditability
- search and data pipelines
- collaboration and synchronization
- observability and incident response
- AI/ML and agent orchestration
- IoT, simulation, and digital twins

### 5) Start small, scale systemically

Most teams begin with one use case (dashboard, workflow, agent task, or spatial scene) and expand by composing additional traits and plugins instead of rewriting infrastructure.

## Who this is for

- **Founders / product teams:** faster path from idea to running prototype.
- **Platform engineers:** one semantic layer for multi-target outputs.
- **Agent builders:** deterministic interfaces and task-driven execution loops.
- **Research / simulation teams:** provenance-aware workflows with replayability hooks.

## Example outcomes

- "Describe a service" -> compile to backend/service targets
- "Describe a scene" -> compile to spatial/render targets
- "Describe a robot" -> export to robotics/simulation targets
- "Describe an agent workflow" -> execute via board + tool ecosystem

## What to verify live

HoloScript avoids hardcoded ecosystem counts in docs. Verify current numbers from live sources:

- MCP tool count: `https://mcp.holoscript.net/health`
- Knowledge entries: `https://mcp-orchestrator-production-45f9.up.railway.app/health`
- Compiler/trait/package counts: see SSOT commands in `docs/NUMBERS.md`

### Honest gaps

These verticals have foundation traits but no dedicated domain coverage yet:

| Gap | Closest Existing | Distance |
| ----- | ----------------- | ---------- |
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

**Full provenance chain.** CAEL (Continuous Agentic Event Logging) records the perception → cognition → action → physics loop in a tamper-evident hash chain. The SimulationContract enforces physical guarantees (geometry hash, unit validation, deterministic stepping), ensuring the render model IS the solver model. Trust is compositional from shader to neural spike.

**Scientific Foundation (8-Paper Program).** HoloScript is the first platform where trust is algebraically composable via the **provenance semiring** (tropical min-plus/max-plus).

- **Trust by Construction:** Provable simulation accuracy (TET10 convergence p=1.99).
- **CAEL Agent Contracts:** Hash-chained, replayable, and forkable agent thoughts.
- **Trustworthy Tool Use:** independent trace replay for MCP tool verification.
- **Browser-Native SNN:** neuromorphic computing at 2,778 Hz via WebGPU compute shaders.
- **Conflict-Free Spatial State:** spatial CRDTs resolved via physics-native replay.
- **Sandboxed Embodied Simulation:** AI-generated physics verified in V8 isolates.
- **GraphRAG Self-Understanding:** provenance-backed codebase intelligence queries.

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
| -------- | -------- |
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
npx create-holoscript my-world
cd my-world && npm install && npm run dev
```

**Develop on the repo:**

```bash
git clone https://github.com/brianonbased-dev/HoloScript.git
cd HoloScript && pnpm install && pnpm build && pnpm test
```

**Agent validation (TypeScript):** After touching `packages/*`, run `pnpm preflight` so only **changed** packages are typechecked (fast, Windows-safe spawns). Narrow to TS only with `pnpm preflight --check=typescript,ts`. Before a large merge, use `pnpm preflight --full` (all packages; slower). Flags and checks live in `scripts/preflight.mjs`.

## Three file formats

| Extension | Purpose | Examples |
| ----------- | --------- | --------- |
| `.hs` | Data pipelines, ETL, transforms | Compiles to Node.js, JSON. Source → transform → sink workflows |
| `.hsplus` | Behaviors, agents, economics, IoT | Traits for networking, AI, state machines, digital twins, ZK proofs |
| `.holo` | Compositions, scenes, dashboards | Cross-platform AI-generated. Runtime interprets directly |

TypeScript is the last resort — for parsers, CLI, adapters, infrastructure. If you're writing `.ts` for business logic, you're doing it wrong.

### Versioning

npm and PyPI packages share the same major version. See the [Release Versioning Guide](./docs/guides/release-versioning.md).

## Agent quick reference

For agents connecting via MCP — what's available beyond the problems listed above.

**Local checks:** `pnpm preflight` (changed packages) · `pnpm preflight --check=typescript,ts` (TS only) · `pnpm preflight --full` (entire monorepo TS sweep).

**HoloDoor (security guardrails):** Use [docs/agents/holodoor-mcp.md](./docs/agents/holodoor-mcp.md). Corridor is deprecated; policy, hooks, and MCP validation live in the ai-ecosystem repo.

**Connectors** (deploy anywhere): `connector-github` (repos, PRs, CI/CD), `connector-railway` (deploy, envs, logs, costs), `connector-appstore` (TestFlight, Play Store), `connector-upstash` (Redis, vector search, QStash), `connector-vscode` (IDE sync), `connector-core` (build your own).

**IDE intelligence** (via MCP): `hs_scan_project`, `hs_diagnostics`, `hs_autocomplete`, `hs_refactor`, `hs_docs`, `hs_code_action`, `hs_hover`, `hs_go_to_definition`, `hs_find_references` — full LSP-equivalent over MCP.

**Self-improvement** (via MCP): Agents modify the codebase through MCP — `holo_write_file`, `holo_edit_file`, `holo_read_file`, `holo_git_commit`, `holo_run_tests_targeted`, plus refactoring and scaffolding. The codebase improves itself.

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
| ------- | ------------- |
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
| -------- | --------------------- |
| MCP tools | `curl https://mcp.holoscript.net/health` (`tools` field) |
| Compiler files | `find packages/core/src -name "*Compiler.ts" -not -name "CompilerBase*" -not -name "*.test.*"` |
| Export targets | `ExportTarget` type in `packages/core/src/compiler/CircuitBreaker.ts` |
| Trait files | `find packages/core/src/traits -name "*.ts" -not -name "*.test.*"` |
| Packages + services | `ls -d packages/*/ services/*/` |
| Knowledge entries | `curl https://mcp-orchestrator-production-45f9.up.railway.app/health` (`knowledge_entries`) |
| Plugins | `ls -d packages/plugins/*/` |

Every number in this README points to a live source. If a number is hardcoded, it's wrong — verify and fix it.

## Release

HoloScript release lanes are managed under `scripts/version-policy.json` (for example, `platform-v6`), and npm publishing is now guarded.

- Use `pnpm release:publish` for production publish flows.
- Raw `pnpm publish` at repo root is intentionally blocked.
- Guard checks run via `node scripts/release-guard.js` (git cleanliness, strict version policy, private package rules, semver validation, and tag awareness).

## Links

- [Operator runbook](./docs/ops/RUNBOOK.md) — deployment smoke checks, incidents, rollback
- [Full feature reference](./docs/reference/FULL_README.md) — compilers, renderers, identity, domain blocks, GPU pipelines
- [Compile API](https://mcp.holoscript.net/api/health) — live at `mcp.holoscript.net`
- [Absorb service](https://absorb.holoscript.net/health) — codebase intelligence
- [Studio](./packages/studio/README.md) — universal IDE
- [Academy](./docs/academy/level-1-fundamentals/01-what-is-holoscript.md) — learning path
- [TypeScript API reference](https://holoscript.net/docs/api/) — TypeDoc output (run `pnpm docs:api` locally → [`docs/api/`](./docs/api/))
- [Examples](./examples/README.md) — copy-paste starting points
- [Strategy](./docs/strategy/ROADMAP.md) — roadmap and vision
- [Plugins](./packages/plugins/) — domain extensions

---

v6.0.2 · [MIT License](./LICENSE)
