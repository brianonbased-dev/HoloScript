# Studio Repo Management PRD

## Overview

HoloScript Studio will evolve into a repo-native intelligence platform that lets users import any codebase, visualize it, run safe autonomous improvement daemons, and ship reviewable upgrades back to GitHub.

This PRD translates the Studio Repo Management strategy into an implementation-ready product document.

Studio should also be treated as a HoloScript-native runtime surface. Logs, agents, activity, forks, architecture, and review state should all be representable through the Studio runtime, with `codebase.holo` serving as the immersive deep-view of the same workspace.

## Problem Statement

Developers inherit legacy repositories that are difficult to understand, risky to modify, and expensive to maintain. GitHub tracks history well, but it does not provide semantic understanding, improvement planning, or architecture-level visibility.

Studio should solve this by combining:

1. repository ingestion and workspace management,
2. Project DNA classification,
3. daemon-guided code improvements,
4. visualization of architecture and risk,
5. safe patch review and GitHub handoff.
6. HoloScript-native operational surfaces for logs, agents, activity, and forks.
7. an immersive `codebase.holo` representation for spatial repo exploration.

## Goals

1. Let any user import or upload any repository into Studio.
2. Produce a meaningful Project DNA profile within minutes.
3. Run a daemon dry-run that generates useful, reviewable patch proposals.
4. Visualize architecture, risk, and daemon targeting to build user trust.
5. Apply or export patches without bypassing safe branch and review workflows.
6. Render core Studio surfaces through a consistent HoloScript-native workspace model.
7. Let users open an immersive `codebase.holo` view of the same repo when they want a spatial workflow.

## Non-Goals

1. Replacing GitHub as the source of truth for commit history.
2. Auto-applying high-risk patches directly to default branches.
3. Restricting Studio to HoloScript-native repositories.
4. Making spatial visualization mandatory for all workflows.

## Target Users

### Solo Maintainer

Needs quick insight into a legacy repo and low-risk improvement suggestions.

### Small Engineering Team

Needs shared architecture visibility, safe daemon jobs, and PR-ready patches.

### Agency or Consultant

Needs rapid understanding of unfamiliar client repos and improvement recommendations.

### AI-Native Team

Needs autonomous, policy-aware maintenance loops across multiple repos.

## User Stories

### Import and Analyze

1. As a user, I want to connect GitHub or upload a zip so I can create a Studio workspace from an existing repo.
2. As a user, I want Studio to classify my project automatically so I do not need to hand-configure daemon behavior.
3. As a user, I want to see an architecture map and risk heatmap so I can trust the daemon before it proposes changes.
4. As a user, I want the imported repo to be materialized as a HoloScript-native workspace so every Studio surface is driven from the same model.

### Run Daemon Jobs

1. As a user, I want Studio to recommend a daemon profile and mode so I can start safely.
2. As a user, I want daemon jobs to run in isolated workspaces so my original repo is protected.
3. As a user, I want the daemon to explain why it selected each file so the job is reviewable.
4. As a user, I want to inspect daemon logs, agent decisions, and activity streams in Studio without switching mental models or tools.

### Review and Apply

1. As a user, I want semantic diffs and confidence tiers so I can quickly decide what to accept.
2. As a user, I want to apply patches to a branch or export them as a patch file.
3. As a user, I want Studio to open a GitHub PR with a semantic summary.
4. As a user, I want to see how the patch changes the architecture and workspace state, not just the raw diff.

### Immersive Exploration

1. As a user, I want to open `codebase.holo` so I can immerse myself in my repo when I need a deeper spatial understanding.
2. As a user, I want packages, files, agents, and services to be navigable objects in the immersive workspace.
3. As a user, I want the immersive view and the 2D Studio view to be two renderings of the same underlying workspace data.

### Team and Governance

1. As a team lead, I want policy controls that restrict dangerous patch categories.
2. As an organization admin, I want job metrics and audit logs.
3. As a reviewer, I want to see daemon job outcomes over time.

## Functional Requirements

### Workspace Management

1. Support GitHub OAuth and archive upload.
2. Create isolated per-repo workspaces.
3. Track branches, job history, and patch history.

### Project DNA

1. Detect stack, framework, runtime, and risk signals.
2. Recommend daemon profile and execution mode.
3. Persist Project DNA on the workspace.

### Daemon Jobs

1. Support `quick`, `balanced`, and `deep` modes.
2. Support profile-aware pass selection.
3. Enforce path denylist, cycle limits, token budgets, and file caps.
4. Produce patch proposals, logs, metrics, and summaries.

### Visualization

1. Render architecture graph.
2. Render risk heatmap.
3. Render daemon plan view.
4. Render semantic diff view.
5. Render timeline or historical health view.
6. Render operational surfaces for logs, agents, activity, and forks.
7. Render `codebase.holo` for immersive workspace navigation.

### GitHub Integration

1. Create workspace branches.
2. Export patch or apply to branch.
3. Open PR with semantic summary and validation data.

## Success Metrics

### Adoption

1. Percentage of imported workspaces that complete Project DNA successfully.
2. Percentage of workspaces that run at least one daemon job.
3. Percentage of daemon jobs that result in at least one accepted patch.

### Quality

1. Average quality delta per completed daemon job.
2. Patch acceptance rate by profile and mode.
3. Review-required vs rejected patch ratio.

### Trust and Usability

1. Median time from import to first meaningful visualization.
2. Median time from import to first daemon result.
3. User-reported clarity of daemon rationale and repo visualization.
4. Percentage of active workspaces that open at least one operational surface beyond code diffs.
5. Percentage of eligible workspaces that launch immersive `codebase.holo` exploration.

### Safety

1. Zero direct writes to protected paths.
2. Zero default-branch direct-apply incidents.
3. Percentage of failed jobs with complete audit trails.

## MVP Scope

1. GitHub connect plus archive upload.
2. Workspace creation.
3. Project DNA detection.
4. Repo map and risk heatmap.
5. Daemon dry-run jobs.
6. Patch review UI.
7. Export patch or open PR.
8. Initial HoloScript-native operational surfaces for logs and activity.

## Phase 2 Scope

1. Saved daemon profiles.
2. Team workspaces and role controls.
3. Cost and duration estimation.
4. Semantic diff expansion.
5. Policy packs by organization.
6. Agent and fork lineage surfaces.
7. First immersive `codebase.holo` release.

## Phase 3 Scope

1. Multi-agent daemon swarms.
2. Private runners.
3. Temporal architecture playback.
4. Spatial repo navigation.
5. Org-specific planner packs.
6. Full HoloScript-native Studio shell for primary repo workflows.

## Risks

1. Overpromising auto-fix quality before patch review is strong enough.
2. Tight coupling between visualization and daemon execution complexity.
3. Treating HoloScript-native repos as the primary target instead of legacy repos.
4. Allowing execution features to outpace policy and safety controls.

## Open Questions

1. What is the exact isolation model for uploaded repos in Studio-hosted environments?
2. Which visualization views ship in MVP versus Phase 2?
3. Should GitHub PR creation be available in MVP or after patch review maturity improves?
4. What billing primitive leads: workspaces, daemon minutes, or patch applications?
