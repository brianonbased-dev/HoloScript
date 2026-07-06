---
name: sim
description: >
  Single surface for the HoloScript simulation stack. THIN: capability_manifest sandbox gate is stubbed-around — the MCP tool definition is missing from the live tool manifest (last verified 2026-07-06; re-check the live manifest before treating as blocked); skill falls back to reporting the blocker — solver inventory, structural/thermal MCP solves, multi-physics coupling, SimulationContract evidence, CAEL trace verification, experiment orchestration, GpuBackedSolver readback. Wraps `SimSolver` + `SolverAdapters` + `CouplingManagerV2` + `SimulationContract` + `solve_structural` + `solve_thermal` + `verify_cael_trace` + `ExperimentOrchestrator` + `SimulationSolverFactory` + `CAELAgentLoop`. Closes the Tier-C strategic-packaging gap surfaced in `research/2026-05-16_missing-simulations-holoscript.md`. Origin: F.054 / `/capabilities` orphan-surface pattern (same shape as `/compile`, `/hologram`, `/protocol`). Invoke with `/sim <subcommand>` or let it auto-route from natural language.
argument-hint: "[list|thermal|structural|run|couple|contract|verify|status|quote|paid|fleet|receipts|capability-manifest|adapter|domain|sweep] [args...]"
project-dir: C:/Users/Josep/Documents/GitHub/HoloScript
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Task
disable-model-invocation: false
context: fork
agent: general-purpose
---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOLOSCRIPT /sim SURFACE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Directive**: $ARGUMENTS
**Mode**: Autonomous (fork)
**Role**: Simulation operator — drive solvers, couplings, evidence packs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Working directories

- **HoloScript repo**: `C:/Users/Josep/Documents/GitHub/HoloScript`
- **Simulation engine**: `packages/engine/src/simulation/`
- **Physics solvers**: `packages/engine/src/physics/`
- **QM plugin**: `packages/plugins/qm-bridge/`
- **Domain coverage SSOT**: `docs/simulation/DOMAIN_COVERAGE.md`
- **Companion research**: `c:/Users/josep/.ai-ecosystem/research/2026-05-16_missing-simulations-holoscript.md`

## What this skill covers

HoloScript ships domain simulation solvers across multiple physics domains (live count: `glob packages/engine/src/{simulation,physics}/*Solver*.ts` + `docs/simulation/DOMAIN_COVERAGE.md`) + multi-physics coupling + a GpuBackedSolver mixin + a CAEL embodied agent harness + a QM bridge. They are accessed today through code (`new ThermalSolver(...)`, `couplingManager.register(...)`) — that's where the orphan-surface gap lives. This skill closes it.

The simulation surface composes these primitives (live names — verify via `glob packages/engine/src/simulation/*Solver*.ts`):

| Layer | Primitives |
|-------|-----------|
| Solver interface | `SimSolver`, `GpuBackedSolver` (mixin with `readbackOutput()` post-step hash) |
| Domain solvers | `ThermalSolver`, `StructuralSolver`, `StructuralSolverTET10`, `HydraulicSolver`, `AcousticSolver`, `FDTDSolver`, `NavierStokesSolver`, `MultiphaseNSSolver`, `MolecularDynamicsSolver`, `ReactionDiffusionSolver` (+ `SeismicSolver` planned) |
| MCP solver tools | `solve_structural` (TET10 FEM + CAEL receipt), `solve_thermal` (thermal field + CAEL receipt) |
| Logic solver MCP tool | `solve_logic` (truth-table / SAT-style boolean logic solve) |
| Paid/fleet dispatch tools | `sim_quote`, `sim_run_paid`, `sim_fleet_status` |
| Physics solvers | `PBDSolver`, `SoftBodySolver`, `ConstraintSolver`, `SparseLinearSolver` (GPU) |
| Animation/AI | `IKSolver`, `NavmeshSolverTrait` |
| Plugin | `QmSolver` (HF/DFT/MP2/CCSD/CCSD(T)/GFN-xTB/PBE/B3LYP/HSE06/PBE0 via Psi4/QE/TBLite) |
| Adapter | `SolverAdapters` (uniform polymorphic wrapping) |
| Multi-physics | `CouplingManager`, `CouplingManagerV2` (generic `FieldCoupling`) |
| Mesh | `AutoMesher` (TET4 + TET10 upgrade), `BoundaryConditions` |
| V&V | `SimulationContract` (6 guarantees per W.GOLD.013), `ConvergenceControl` |
| Receipt verification | MCP `verify_cael_trace` (hash-chain + replay validity for CAEL traces) |
| Receipt registry | MCP `holo_list_receipt_capabilities`, `holo_query_receipts` |
| Capability admission | `capability_manifest` fork/sandbox gate; use the MCP tool when present, otherwise report the missing tool definition as the blocker before paid fleet dispatch |
| Embodied | `CAELAgentLoop` (sensor + cognition + action selector + action mapper) |
| Witness | `agentDialogRecord`, `cael-canon` |
| Sweep | `ExperimentOrchestrator` |
| Factory | `SimulationSolverFactory` (trait-handler delegation; runtime-registration audit pending per `/stub-audit`) |

## Subcommands

### `/sim list`
List every shipped solver + status. Reads `docs/simulation/DOMAIN_COVERAGE.md` and emits the three-status matrix (solver-shipped / trait-shipped / runtime-validated). Use this as the first move on any "what simulations do we have" question.

**Implementation**: read `docs/simulation/DOMAIN_COVERAGE.md`; render the rows; if no doc found, fall through to `glob packages/engine/src/{simulation,physics}/*Solver*.ts` and emit the live list.

### `/sim run <solver> [config-json]`
Instantiate a solver and run its `step()` (transient) or `solve()` (steady-state) loop. Print field readouts (`getField(name)`) and stats (`getStats()`).

Examples:
- `/sim run thermal '{"gridResolution":[64,64,64],"domainSize":[0.1,0.1,0.1],"sources":[{"position":[32,32,32],"power":1.0}]}'`
- `/sim run navier-stokes '{"lid-driven":true,"reynolds":100}'`

**Implementation**: import the named solver class, construct with parsed config, run `dt`/`steps` per config, capture output via `getField()` + `getStats()`. For `GpuBackedSolver` implementations also call `readbackOutput()` and report the hash.

### `/sim thermal <config-json> [steps]`
Route a thermal solve through the MCP `solve_thermal` tool. This is the
receipt-producing path for heat-conduction jobs, not just a local class
instantiation. Accept either the engine-native shape (`gridResolution`,
`domainSize`, `materials`, `defaultMaterial`, `boundaryConditions`, `sources`,
`initialTemperature`, optional `timeStep`) or the legacy advertised shape
(`gridSize`, `spacing`, `material`, `sources`, `boundaryConditions`,
`initialTemperature`).

Return the solver result plus receipt fields: `caelTraceId`, `traceHash`,
`traceJSONL`, `provenance`, and `verifyUrl`. If a caller asks whether the
receipt is valid, immediately route the returned `caelTraceId` to `/sim verify`.

MCP call shape:

```json
{
  "jsonrpc": "2.0",
  "id": "sim-thermal",
  "method": "tools/call",
  "params": {
    "name": "solve_thermal",
    "arguments": {
      "config": {
        "gridResolution": [3, 3, 3],
        "domainSize": [1, 1, 1],
        "materials": {},
        "defaultMaterial": "water",
        "boundaryConditions": [],
        "sources": [],
        "initialTemperature": 20
      },
      "steps": 10
    }
  }
}
```

**Validation fixture**: `packages/mcp-server/src/__tests__/simulation-tools.test.ts`
asserts `solve_thermal` returns CAEL trace metadata and accepts the legacy
`gridSize`/`spacing` shape.

### `/sim structural <config-json>`
Route a structural FEM solve through the MCP `solve_structural` tool. This is
the receipt-producing path for TET10 structural analysis. Accept the advertised
solver config shape: `nodes`, `elements`, `materials` (`E`, `nu`), `forces`,
and `constraints`.

Return displacement/stress outputs plus receipt fields: `caelTraceId`,
`traceHash`, `traceJSONL`, `provenance`, and `verifyUrl`. If a caller asks
whether the receipt is valid, immediately route the returned `caelTraceId` to
`/sim verify`.

MCP call shape:

```json
{
  "jsonrpc": "2.0",
  "id": "sim-structural",
  "method": "tools/call",
  "params": {
    "name": "solve_structural",
    "arguments": {
      "config": {
        "nodes": [],
        "elements": [],
        "materials": { "E": 200000000000, "nu": 0.3 },
        "forces": [],
        "constraints": []
      }
    }
  }
}
```

### `/sim couple <solver-a> <solver-b> <field> [direction]`
Register a `FieldCoupling` between two solvers via `CouplingManagerV2`. Direction = `a→b` (push field from A's output into B's input) or bidirectional.

Example:
- `/sim couple thermal reaction-diffusion temperature a→b` — Arrhenius rate evaluation reads thermal field; reaction enthalpy writes heat source back.

**Implementation**: instantiate both solvers, create the `FieldCoupling` descriptor, call `couplingManager.register(...)`, run a coupled timestep loop, emit per-step coupling stats.

### `/sim contract <solver-name> [--evidence-pack-out=<path>]`
Run the named solver under `SimulationContract` and emit a 6-guarantee evidence pack (per `docs/strategy/simulation-contract-evidence-pack-example.json`). The 6 guarantees:
1. Geometry integrity (FNV-1a hash match between solver and render mesh)
2. Unit validation (range-checked against material database)
3. Deterministic stepping (fixed-dt accumulator, frame-rate-independent)
4. Interaction provenance (every user action logged with sim time)
5. Auto-provenance (every solve() records config + results + timing)
6. Exact replay (provenance record → bitwise-identical reproduction)

**Pattern X.903 invariant**: every new solver in the project MUST ship with an evidence-pack template. If `/sim contract` returns missing-template for a solver, file a board task to add it.

### `/sim verify <traceId|trace-jsonl-path>`
Verify a CAEL receipt trace through the MCP `verify_cael_trace` tool. Use a
`cael:*` trace id returned by `solve_structural` or `solve_thermal` when the
trace is still in the server registry, or read a local JSONL receipt file and
pass it as `traceJSONL`.

Return the verifier fields without softening them: `success`,
`hashChainValid`, `replayValid`, `solverType`, `totalSteps`,
`totalSimTime`, `brokenAt`, and `reason` when present. A tampered trace must
show `success:false`, `hashChainValid:false`, and `replayValid:false`.

MCP call shape:

```json
{
  "jsonrpc": "2.0",
  "id": "sim-verify",
  "method": "tools/call",
  "params": {
    "name": "verify_cael_trace",
    "arguments": {
      "traceId": "cael:..."
    }
  }
}
```

**Validation fixture**: `packages/mcp-server/src/__tests__/simulation-tools.test.ts`
already asserts both sides of the subcommand contract: a known-good thermal
trace verifies by `traceId`, and a tampered `traceJSONL` fails hash-chain and
replay verification.

### `/sim status [jobId]`
Query the orchestrator for active simulation jobs. No jobId → list all active. With jobId → progress + ETA + stats. Maps to live MCP `get_compilation_status` shape where applicable.

### `/sim quote <request-json>`
Ask the paid simulation layer for a zero-spend estimate before dispatch. Maps to MCP `sim_quote` and should report provider, lane, expected spend, runtime, artifact target, and the capability/receipt prerequisites required before a paid run can start.

### `/sim paid <request-json>`
Dispatch a paid simulation autonomously after a quote exists, provided the run stays within the current daily remote GPU/compute cap (Vast.ai rental + paid LLM API) — see [`SPEND.md`](../../../SPEND.md) for the cap amount and what counts toward it. No per-action founder approval is required within the cap; approval is required only when a single run or the day's cumulative GPU/compute spend would exceed it. Local fleet (Jetson Orin + laptop GPU) is uncapped and always autonomous. Maps to MCP `sim_run_paid`; return the run id, lane id, spend ceiling, artifact path, and receipt/capability handles needed for follow-up verification.

### `/sim fleet [jobId|laneId]`
Query paid/fleet simulation state. Maps to MCP `sim_fleet_status`; with no id, summarize active lanes and outstanding artifacts; with an id, report status, receipt ids, blockers, and the next safe local verification command.

### `/sim receipts [query-json]`
List or query receipts that prove simulation/fleet work happened. Use MCP `holo_list_receipt_capabilities` to discover supported receipt classes and MCP `holo_query_receipts` for concrete receipt lookup. Prefer this path when a room agent needs proof without rerunning a solve.

### `/sim capability-manifest <request-json>`
Declare or inspect the capability contract required by a paid/fleet simulation route. Use MCP `capability_manifest` when the tool is present; if the no-live cartographer inventory only finds the fork/sandbox gate, report the missing tool definition as the blocker before a fork, sandbox, or spend-bearing route crosses from local planning into fleet execution.

### `/sim adapter <solver-name>`
Show the `SolverAdapter` wrapping a given solver (the polymorphic-access wrapper). Verify the adapter exists and exposes `fieldNames` / `getField(name)` / `getStats()` per the `SimSolver` interface contract.

### `/sim domain [domain-name]`
Show coverage for a named physics domain (thermal, structural, EM, CFD, MD, RD, QM, etc.) — both shipped solvers and gap classification per `docs/simulation/DOMAIN_COVERAGE.md`. With no arg: print the full domain coverage matrix.

### `/sim sweep <solver> <param> <range>`
Drive `ExperimentOrchestrator` for a parameter sweep over `<solver>.<param>` across `<range>` (e.g., `0.01:0.1:0.01` → start:end:step). Emits CSV + a SimulationContract evidence pack per sweep point.

Example:
- `/sim sweep thermal sources[0].power 0.5:5.0:0.5`

### `/sim trait <trait-name>`
Show which trait wraps which solver + runtime-validation status. Cross-references `packages/core/src/traits/*Trait.ts` against the domain coverage matrix.

Examples:
- `/sim trait RigidbodyTrait` → maps to `ConstraintSolver` + `PBDSolver`, runtime-validated ✅
- `/sim trait ClothTrait` → Pattern B stub (12-LOC onUpdate), superseded by `AdvancedClothTrait`
- `/sim trait thermalSimulationHandler` → factory-delegated, Pattern B suspected — run `/stub-audit` for details

## Auto-routing from natural language

If the user types `/sim <natural language question>` without naming a subcommand, route as follows:

| Question shape | Route to |
|----------------|----------|
| "what simulations do we ship?" / "what solvers exist?" | `/sim list` |
| "run thermal sim with X" / "solve heat conduction" | `/sim thermal` |
| "run structural analysis" / "solve FEM stress" | `/sim structural` |
| "simulate Y under Z" for non-thermal solvers | `/sim run` |
| "couple thermal and structural" / "FSI workflow" | `/sim couple` |
| "is this evidence-pack valid?" / "produce contract receipt" | `/sim contract` |
| "verify this CAEL trace" / "is this solver receipt tampered?" | `/sim verify` |
| "what's the status of job X?" | `/sim status` |
| "what fleet sim jobs are active?" / "paid sim status" | `/sim fleet` |
| "what would this paid sim cost?" | `/sim quote` |
| "run this paid simulation" | `/sim paid` |
| "which receipt proves this fleet sim?" / "query simulation receipts" | `/sim receipts` |
| "does this request declare its capability?" | `/sim capability-manifest` |
| "does FDTD have an adapter?" / "is the solver wrapped?" | `/sim adapter` |
| "what's our EM coverage?" / "do we do plasma?" | `/sim domain` |
| "vary the Reynolds number from 100 to 1000" | `/sim sweep` |
| "which trait calls the thermal solver?" | `/sim trait` |

## Composition with other skills

- **`/codebase`** for deep solver-internals questions. `/sim` is the operator surface; `/codebase` is the implementation surface.
- **`/holosim`** (user-level, `~/.claude/skills/holosim`) when the task is to *inhabit* the simulation as a first-person CAEL embodied agent (perceive → think → act → fork → dream) and produce CAEL trace evidence for the papers. `/sim` is the operator API; `/holosim` is the embodied role.
- **`/stub-audit`** to verify Pattern B status of any trait `/sim trait` flags as "factory-delegated, suspected stub."
- **`/compile`** when a simulation result needs to be turned into a deployable artifact (e.g., `/sim thermal` → `.holo` → `/compile to webgpu`).
- **`/hologram`** when a simulation field needs to be rendered as a hologram for HoloLand/Quest.
- **`/protocol`** when a SimContract evidence pack or verified CAEL receipt is the artifact being collected on-chain.
- **`/research`** for "what simulations are we missing" type questions — points back to `research/2026-05-16_missing-simulations-holoscript.md`.

## Failure modes and known limitations

- **GpuBackedSolver overclaim**: the mixin interface is defined; no domain solver currently has a GPU kernel implementation. `/sim run thermal` runs CPU. AUTONOMIZE TODOs #6–#8 ship GPU kernels for FDTD/NS/MD in Wave 2; once those land, `/sim run <solver>` should auto-detect GPU and report.
- **Trait-level Pattern B fog**: `thermalSimulationHandler`, `structuralFEMHandler`, `ClothTrait` are factory-delegated and the runtime-registration path is unaudited. `/sim trait <name>` will flag these — run `/stub-audit` for confirmation before claiming "shipped."
- **No coupled FSI demo yet**: `CouplingManagerV2` supports it conceptually; no validated fluid-structure-interaction example ships. `/sim couple navier-stokes structural <field>` will work but the demo evidence pack is pending.
- **Climate / DestinE**: out of scope. NMoS row `climate-weather-digital-twin` classifies as `watch` (no proactive scaffolding). `/sim` will refuse climate requests and route to the founder ruling.
- **Pattern X.903 invariant unenforced**: there's no harness today that *fails* `/sim contract` when a solver ships without an evidence pack. Future Tier-C work (`holo_validate_evidence_pack` MCP tool per Q.901) will close this.

## Domain-mapping cheat sheet

| Domain | Primary solver | Coupling-ready partners | Trait |
|--------|----------------|--------------------------|-------|
| Heat conduction | `ThermalSolver` | Structural (thermal stress), ReactionDiffusion (Arrhenius+heat-source), Hydraulic (heat exchange) | `thermalSimulationHandler` (Pattern B suspected) |
| Linear elasticity | `StructuralSolver` / `StructuralSolverTET10` | Thermal, Hydraulic (FSI conceptual) | `structuralFEMHandler` (Pattern B suspected) |
| Pipe networks | `HydraulicSolver` | Thermal | — |
| Acoustic waves | `AcousticSolver` | (independent today) | — |
| Maxwell EM | `FDTDSolver` | (independent today) | — |
| Incompressible CFD | `NavierStokesSolver` | Structural (FSI conceptual) | — |
| Multiphase CFD | `MultiphaseNSSolver` | (independent today) | — |
| Atomic MD | `MolecularDynamicsSolver` | (independent today) | — |
| Chemistry/biology | `ReactionDiffusionSolver` | Thermal (Arrhenius rates + heat export) | — |
| Quantum chemistry | `QmSolver` (plugin) | Reaction-diffusion (potential — not wired) | — |
| Rigid bodies | `ConstraintSolver` + `PBDSolver` | (independent today) | `RigidbodyTrait` ✅ |
| Soft bodies | `SoftBodySolver` | Rigidbody (constraints) | — |
| SPH fluid | (via trait) | Rigidbody (constraints conceptual) | `FluidSimulationTrait` ✅ |
| Cloth (PBD) | (via trait) | Rigidbody (constraints) | `AdvancedClothTrait` ✅ |
| Spiking neurons (LIF) | `snn-webgpu` runtime | NeuralAnimationTrait (motion-matching) | (paper-2 substrate) |
| Inverse kinematics | `IKSolver` | NavmeshSolverTrait | — |
| Pathfinding | `NavmeshSolverTrait` | IKSolver | (trait-shipped) |

For gap inventory and missing domains, route to `/sim domain` (which renders Tier-A/B/C tables from `docs/simulation/DOMAIN_COVERAGE.md`).

## Output discipline (per F.052 ai-ecosystem framing)

This skill operates *within* the ecosystem — solvers, traits, evidence packs are the actors. Don't frame outputs as "a user wants to simulate X" — frame as "the simulation surface produces evidence pack Y under contract Z." Substrate properties, not user scenarios.

## Refresh contract

This skill refreshes when:
- A new `*Solver*.ts` lands in `packages/engine/src/{simulation,physics}/` → add to domain-mapping cheat sheet + DOMAIN_COVERAGE.md row.
- A new trait wraps a solver → cross-link in `/sim trait` mapping.
- A new coupling lands in `CouplingManagerV2` → add to coupling-ready partners column.
- A new CAEL receipt verifier or trace registry shape lands → update `/sim verify` and rerun `packages/mcp-server/src/__tests__/simulation-tools.test.ts`.
- A founder ruling changes an NMoS classification → propagate via `/sim domain`.
- `/stub-audit` results land → bump Pattern B flags off (or sharpen them).

- A new paid/fleet simulation MCP tool lands -> update `/sim quote`, `/sim paid`, `/sim fleet`, and the cartographer coverage rule.
- A new receipt or capability registry shape lands -> update `/sim receipts` or `/sim capability-manifest` and rerun the cartographer fleet-receipts dispatch report.

## Covered MCP tools

`solve_structural`, `solve_thermal`, `solve_logic`, `verify_cael_trace`,
`sim_quote`, `sim_run_paid`, `sim_fleet_status`,
`holo_list_receipt_capabilities`, `holo_query_receipts`,
`capability_manifest`

End of skill.
