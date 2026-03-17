# Studio Repo Management

HoloScript Studio should be positioned as a repo-native intelligence platform.

Core statement:

HoloScript Studio is a full repo management system that lets users import any GitHub project, understand it visually, run autonomous improvement daemons safely, and ship reviewable upgrades back to GitHub.

Studio should not just host HoloScript projects. Studio itself should run as a HoloScript-native system, where the repo graph, daemon orchestration, logs, agents, activity, forks, and review surfaces are all renderable through HoloScript.

Short version:

GitHub stores code. Studio understands, improves, and visualizes codebases.

HoloScript runs the intelligence layer, the surfaces, and the immersive view of the workspace.

## Primary Users

1. Solo developers with messy legacy repos.
2. Small teams maintaining service backends, dashboards, bots, MCP servers, and internal tools.
3. Agencies onboarding unfamiliar client repos.
4. AI-native teams who want daemon-assisted maintenance and architecture visibility.

## Core Entities

### User

- account
- billing tier
- connected Git providers
- workspace permissions

### Workspace

- one imported repo or uploaded project
- branch-aware
- private by default
- contains jobs, visualizations, and patch history

### Project DNA

- inferred repo classification
- stack
- framework
- runtime shape
- risk shape
- recommended daemon profile

### Daemon Profile

- service
- frontend
- data
- automation
- MCP/agent backend
- spatial/XR

### Daemon Job

- queued
- running
- validating
- packaged
- needs-review
- applied
- failed

### Patchset

- grouped file changes
- confidence tier
- semantic summary
- rollback metadata

### Visualization Model

- architecture graph
- risk heatmap
- daemon plan map
- semantic diff overlay
- timeline view

### Immersive Workspace

- repo can be materialized as codebase.holo
- same workspace can be viewed in 2D or immersive 3D/VR
- logs, agents, activity, and forks become navigable HoloScript surfaces

## Product Principles

1. Studio must not hardwire repo names or special-case internal repositories.
2. The daemon must reason from Project DNA, not repository identity.
3. GitHub remains the system of record for source control.
4. Studio becomes the system of intelligence, execution, and review.
5. Visualization is a trust layer and differentiator, not a gimmick.
6. Studio surfaces should be HoloScript-native wherever possible, not bolted on as a separate UI model.
7. The immersive repo experience must be an extension of the same workspace model, not a disconnected demo mode.

## User Flow

1. Import
   - connect GitHub or upload zip
   - choose repo and branch
   - create workspace
2. Analyze
   - Studio computes Project DNA
   - absorb and index graph
   - produce initial architecture and risk views
   - materialize workspace state into HoloScript-native renderable surfaces
3. Recommend
   - Studio suggests daemon profile
   - estimate cost, time, and likely outcomes
   - user selects `quick`, `balanced`, or `deep`
4. Execute
   - daemon runs in isolated sandbox
   - no direct write to default branch
   - collects metrics, diffs, and logs
5. Review
   - user sees patchset, confidence, semantic summary, and architecture delta
   - user can inspect logs, agents, activity, and forks through the same Studio runtime
6. Apply
   - apply to workspace branch
   - export patch
   - open GitHub PR
7. Immerse
   - user opens `codebase.holo`
   - workspace becomes explorable in spatial mode when desired

## Project DNA Schema

Suggested shape:

```ts
type ProjectKind =
  | 'service'
  | 'frontend'
  | 'data'
  | 'automation'
  | 'agent-backend'
  | 'library'
  | 'spatial'
  | 'unknown';

interface ProjectDNA {
  kind: ProjectKind;
  confidence: number;
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  runtimes: string[];
  repoShape: 'single-package' | 'monorepo' | 'polyglot' | 'unknown';
  riskSignals: string[];
  strengths: string[];
  recommendedProfile: string;
  recommendedMode: 'quick' | 'balanced' | 'deep';
}
```

## Daemon Profile Planner

The planner should never key on repo name. It should key on DNA.

Example output:

```ts
interface DaemonPlan {
  profile: 'service' | 'frontend' | 'data' | 'automation' | 'agent-backend' | 'spatial';
  mode: 'quick' | 'balanced' | 'deep';
  passes: Array<
    | 'absorb'
    | 'typefix'
    | 'docs'
    | 'coverage'
    | 'complexity'
    | 'target-sweep'
    | 'trait-sampling'
    | 'runtime-matrix'
    | 'absorb-roundtrip'
    | 'security-scan'
    | 'contract-check'
    | 'retry-backoff-check'
  >;
  maxFiles: number;
  maxCycles: number;
  tokenBudget: number;
  requiresHumanReview: boolean;
}
```

## Example Profiles

### Service Profile

- API contracts
- retries and timeouts
- validation
- test coverage
- typing

### Frontend Profile

- typing
- accessibility
- bundle and performance
- UI tests
- state correctness

### Data Profile

- schema validation
- parsing robustness
- null safety
- transformation correctness
- regression tests

### MCP or Agent Backend Profile

- tool contract stability
- request and response envelopes
- idempotency
- retries
- observability

### Automation or Bot Profile

- rate limiting
- dedupe
- scheduling reliability
- secret handling
- safety guards

### Spatial or XR Profile

- trait coverage
- runtime matrix
- target sweep
- absorb roundtrip

## Daemon Workflow

1. Intake
   - clone or unpack repo into isolated workspace
   - detect stack and manifests
   - compute DNA
2. Absorb
   - graph status
   - absorb repo
   - impact scan
   - architecture map
3. Plan
   - choose profile and pass order
   - rank candidate files by impact, value, and risk
4. Execute
   - deterministic low-cost passes first
   - expensive passes only when justified
   - stop on policy thresholds
5. Validate
   - run relevant tests and build checks
   - compute semantic quality delta
6. Package
   - build patchsets
   - tag confidence tiers
   - generate summary and rationale

## Confidence Tiers

### Safe Auto-Apply

- localized changes
- tests and build validated
- low-risk file classes

### Review Required

- cross-module edits
- interface changes
- incomplete verification

### Manual Only

- infra changes
- auth and secret handling
- migration-heavy edits
- large blast radius

## Visualization Views

### Repo Map

- packages, files, and modules as graph
- edges for imports and calls
- size by impact
- color by domain

### Risk Heatmap

- type errors
- churn
- low coverage
- failing modules
- dependency hotspots

### Daemon Plan View

- what the daemon will touch
- why it chose those targets
- expected gain and risk

### Semantic Diff View

- type safety improved
- APIs changed
- tests added
- complexity reduced
- contracts hardened

### Timeline View

- repo health over time
- daemon job outcomes
- patch acceptance rate
- architecture drift

### Operational Surfaces

- live logs
- daemon and agent activity
- branch and fork lineage
- patch review state
- collaboration presence

### Immersive codebase.holo

- same workspace represented as a HoloScript world
- packages, files, services, and agents become spatial objects
- users can move from 2D Studio panels into immersive exploration without changing data models

## Why Visualization Matters

Visualization is not decoration. It is the trust layer.

It helps users answer:

1. What is this repo?
2. Where is the risk?
3. Why did the daemon choose these files?
4. Did the daemon improve the architecture or just shuffle code?

In HoloScript Studio, visualization should also be execution-aware. The user should be able to see logs, agent state, fork topology, and system activity as part of the same runtime model, then step into `codebase.holo` when they want a deeper immersive view.

## GitHub Integration

1. GitHub remains source of truth.
2. Studio creates workspace branches.
3. Studio opens PRs with:
   - semantic summary
   - risk tier
   - validation results
   - architecture delta screenshot or embed

## MVP

1. GitHub connect plus zip upload
2. Workspace creation
3. Project DNA detection
4. Absorb-based repo map
5. Daemon dry-run job
6. Patch review UI
7. Open PR or export patch

## Phase 2

1. Real sandbox execution per workspace
2. Team workspaces and permissions
3. Semantic diff view
4. Policy controls
5. Cost and runtime estimates
6. Saved daemon profiles

## Phase 3

1. Multi-agent daemon swarms
2. Temporal architecture playback
3. Spatial and immersive repo navigation
4. Enterprise private runners
5. Custom org-specific profile packs

## Product Wedge

The wedge is not HoloScript-native repos. The wedge is legacy repos that are hard to understand and expensive to maintain.

If Studio can:

1. ingest any repo,
2. map it quickly,
3. recommend the right daemon strategy,
4. generate safe, reviewable upgrades,

then users will adopt it even before they care about HoloScript as a language.

## North Star

Studio should become the place where developers go to understand and improve a codebase, while GitHub remains the place where the canonical history lives.

If HoloScript succeeds here, it becomes a repo-native intelligence layer where users import any GitHub project, get a semantic workspace, and run autonomous improvement daemons that produce safe, reviewable upgrades.

The strongest version of this vision is that Studio is 100% HoloScript-run: the operational UI, the architecture view, the daemon surfaces, and the immersive `codebase.holo` experience all derive from the same underlying workspace reality.