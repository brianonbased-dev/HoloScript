# Wizard + Template Redundancy Audit — what the studio-ui-graph misses

**Date**: 2026-04-29
**Context**: The TSX→.holo emitter (`packages/studio-ui-graph`) walks `src/app/**/page.tsx` and traces JSX imports. It surfaces wizards as components-reused-across-pages, but it does NOT see (a) that multiple wizards implement the same product concept, (b) the wizard's internal step graph, or (c) any of the template data registries (templates aren't JSX, so the graph never visits them). The four roots — **Absorb, Holoclaw, HoloMesh, Studio** — show up in the graph as nodes; the wizard layer that *constructs a custom Studio* by routing across all four is invisible.

This memo names what's hidden.

## TL;DR

- **Wizards are Studio builders, not setup flows.** OnboardingWizard.tsx [packages/studio/src/components/wizard/OnboardingWizard.tsx](packages/studio/src/components/wizard/OnboardingWizard.tsx) explicitly offers 4 paths to build a custom Studio. Each path is implemented by a *separate* wizard component. Plus 7 more wizards with overlapping or adjacent purposes. **12 wizards, 3,917 LOC** in studio.
- **Templates live in 7 different registries.** None of them appear in the .holo graph. ~117 distinct templates across scene, preset, workspace, behavior-tree, workflow, shader, wardrobe layers.
- **Real redundancy exists.** OnboardingWizard ⟷ FirstRunWizard ⟷ QuickStartWizard all sit at the "first thing user sees" tier. Two scene-template registries (sceneTemplates + presets/templates) define overlapping concepts. WizardFlow.ts in Brittney duplicates BrittneyWizard.tsx's UX layer.

## The four roots, mapped to the 4 OnboardingWizard paths

OnboardingWizard.tsx contains 4 path descriptions (grepped from the file's `description:` lines):

| Path | One-line | Roots invoked | Implementing wizard |
|---|---|---|---|
| 1 | "GitHub → Pick a starter → Deploy → Live. The fastest way to get a live composition running." | Studio + GitHub | [QuickStartWizard.tsx](packages/studio/src/components/wizard/QuickStartWizard.tsx) (403 LOC) |
| 2 | "GitHub repo, CSV inventory, API schema, POS export — **Absorb** scans it, classifies it, and tells you what to build." | **Absorb** + Studio | [ImportRepoWizard.tsx](packages/studio/src/components/wizard/ImportRepoWizard.tsx) (199 LOC) + 5 Step components |
| 3 | "Pick a category, configure your IDE, and build. Game, robotics, healthcare, architecture, retail — 13 domains with tailored panels." | Studio (domain-templated) | [StudioSetupWizard.tsx](packages/studio/src/components/wizard/StudioSetupWizard.tsx) (189 LOC) + 5 Step components |
| 4 | "Tell Brittney about your business in plain language. She generates the compositions, picks the compilers, and builds your simulation." | **Holoclaw** (Brittney) + Studio | [BrittneyWizard.tsx](packages/studio/src/components/wizard/BrittneyWizard.tsx) (580 LOC) + WizardFlow.ts in lib/brittney |

**The .holo graph sees these as 5 distinct shared_components** ([packages/studio/.holo/studio.ui.holo](packages/studio/.holo/studio.ui.holo) — `shared_component ImportRepoWizard`, `shared_component StudioSetupWizard`, etc.) **but doesn't connect them as 4 implementations of the same Studio-builder product concept.**

**HoloMesh isn't a path.** None of the 4 OnboardingWizard paths route through HoloMesh, even though HoloMesh has its own template surface (`/api/holomesh/team/templates`). Either Path 5 ("Pick a HoloMesh team's published Studio config") is missing, or HoloMesh template-sharing is parallel-but-disconnected from the wizard onboarding flow.

## The wizard surface — 12 wizards, 3,917 LOC

`find packages/studio/src -iname "*Wizard*.tsx" -not -name "*.test.*"`:

| Wizard | LOC | Tier | Purpose | Redundancy notes |
|---|---|---|---|---|
| [OnboardingWizard.tsx](packages/studio/src/components/wizard/OnboardingWizard.tsx) | 154 | Entry | Pick one of 4 Studio-builder paths | overlaps FirstRunWizard, QuickStartWizard |
| [FirstRunWizard.tsx](packages/studio/src/components/wizard/FirstRunWizard.tsx) | 366 | Entry | First-launch tutorial; calls `/api/connectors/railway/deploy` | overlaps OnboardingWizard, QuickStartWizard |
| [QuickStartWizard.tsx](packages/studio/src/components/wizard/QuickStartWizard.tsx) | 403 | Path 1 | GitHub-starter route (Path 1 of OnboardingWizard) | also "first thing user sees" — possible merge target |
| [ImportRepoWizard.tsx](packages/studio/src/components/wizard/ImportRepoWizard.tsx) | 199 | Path 2 | Absorb-driven import (Path 2) | + Step0ChooseRepo, Step1SelectBranch, Step2ImportProgress, Step3ProjectDNA, Step4WorkspaceReady |
| [StudioSetupWizard.tsx](packages/studio/src/components/wizard/StudioSetupWizard.tsx) | 189 | Path 3 | Domain-templated setup (Path 3) | + Step0Category, Step1SubCategory, Step2ProjectSpecifics, Step3ExperienceLevel, Step4PreviewLaunch |
| [BrittneyWizard.tsx](packages/studio/src/components/wizard/BrittneyWizard.tsx) | 580 | Path 4 | Brittney-driven NL build (Path 4) | parallel to lib/brittney/WizardFlow.ts (engine layer) |
| [WorkspaceCreationWizard.tsx](packages/studio/src/components/wizard/WorkspaceCreationWizard.tsx) | 253 | Sub-entity | Creates trait/agent/plugin/template/training-data — NOT a Studio | distinct purpose; keep separate |
| [SplatCaptureWizard.tsx](packages/studio/src/components/assets/SplatCaptureWizard.tsx) | 511 | Asset | Splat capture flow | asset-specific; keep separate |
| [AIGeneratorWizard.tsx](packages/studio/src/components/generative/AIGeneratorWizard.tsx) | 150 | Asset | AI asset generation | reused across 4 workspace pages (agents/plugins/templates/traits) |
| [UploadWizard.tsx](packages/studio/src/components/marketplace/UploadWizard.tsx) | 349 | Marketplace | Marketplace upload | distinct |
| [MigrationWizard.tsx](packages/studio/src/components/self-custody/MigrationWizard.tsx) | 631 | Self-custody | Wallet/identity migration | distinct |
| [wizardData.tsx](packages/studio/src/components/wizard/wizardData.tsx) + [useStudioSetupWizard.ts](packages/studio/src/components/wizard/useStudioSetupWizard.ts) + [WizardFlow.ts](packages/studio/src/lib/brittney/WizardFlow.ts) | 132 + ? + ? | Support | Data + hook + Brittney executor | three files, three layers — bridge candidate |

**Redundancy at the entry tier**: OnboardingWizard, FirstRunWizard, QuickStartWizard all answer "user just opened Studio for the first time, what now?" — three wizards, ~923 LOC, no clean documented split between them.

**Path-implementer redundancy**: ImportRepoWizard and StudioSetupWizard each have their own `Step0..Step4` component family. The shells are nearly identical (progress bar + step content + nav buttons). One shared `<WizardShell>` could absorb both.

## The template surface — 7 registries, ~117 templates, ZERO in the graph

| Registry | Path | Count | Purpose |
|---|---|---|---|
| Scene templates | [packages/studio/src/data/sceneTemplates.ts](packages/studio/src/data/sceneTemplates.ts) | 42 (`grep -cE "id:.*'"`) | Studio scene starter templates |
| Preset templates | [packages/studio/src/lib/presets/templates/](packages/studio/src/lib/presets/templates/) | 50 files | Per-domain scene presets (anatomy-explorer, classroom-demo, digital-twin, …) |
| Workspace templates | [packages/studio/src/lib/workspace/templates/](packages/studio/src/lib/workspace/templates/) | 12 files | Project scaffolding (claude-md, agents-md, copilot-instructions, cursorrules, daemon-config, gemini-md, hooks, memory-md, north-star-md, …) |
| Behavior trees | [packages/studio/src/lib/templates/behaviorTrees.ts](packages/studio/src/lib/templates/behaviorTrees.ts) | (count TBD) | Agent behavior tree templates |
| Workflows | [packages/studio/src/lib/templates/workflows.ts](packages/studio/src/lib/templates/workflows.ts) | (count TBD) | Workflow templates |
| Shader templates | [packages/studio/src/features/shader-editor/ShaderTemplates.ts](packages/studio/src/features/shader-editor/ShaderTemplates.ts) | (count TBD) | Shader graph starting points |
| Wardrobe items | [packages/studio/src/data/wardrobeItems.ts](packages/studio/src/data/wardrobeItems.ts) | (count TBD) | Avatar wardrobe library |
| API: HoloMesh team templates | [packages/studio/src/app/api/holomesh/team/templates/](packages/studio/src/app/api/holomesh/team/templates/) + [/[id]/templates/](packages/studio/src/app/api/holomesh/team/[id]/templates/) | n/a | Network-published templates |

**The graph never visits these.** sceneTemplates.ts is pure data — no JSX — so the TSX→.holo emitter walks past it.

**Naming-vs-content overlap**: each preset file in `lib/presets/templates/` exports a `SceneTemplate` (see [packages/studio/src/lib/presets/templates/ai-composer.ts:1](packages/studio/src/lib/presets/templates/ai-composer.ts:1)) — the *same type* as the entries in `data/sceneTemplates.ts`. Same data shape, two registries, no documented "preset" vs "scene template" distinction. Either:
- The 50 presets should be entries in `sceneTemplates.ts` (one registry); or
- `sceneTemplates.ts` is a curated "starter" subset and the 50 presets are an extended catalog (then the relationship deserves a comment in both files).

## Wizard-as-Studio-builder, restated

The right model for the Studio surface is:

```
                    OnboardingWizard
                           │
        ┌──────────┬──────┼──────┬─────────┐
        ▼          ▼      ▼      ▼         ▼  (Path 5, missing)
   QuickStart  ImportRepo Studio Brittney  HoloMeshBrowse
   (Path 1)    (Path 2)   Setup  Wizard    (not yet)
                          (P3)   (P4)
        │          │      │      │         │
        ▼          ▼      ▼      ▼         ▼
   sceneTemplates Absorb-      preset-   Brittney-      HoloMesh
   (42 scenes)    classified   templates composed       team-published
                  workspace    (50 dom-  via WizardFlow
                  templates    ains)     + Studio APIs
                  (12 files)
                                          │
                                          ▼
                                   { TraitInferer
                                     Compiler picker
                                     Composition gen }

The ALL paths converge on:    →  a configured Studio instance
                                  (scene + workspace files +
                                   IDE config + agent compositions)
```

The wizards are how the four roots compose. OnboardingWizard names the seam, but no single document names the product.

## Recommendations

Ranked by leverage / risk:

1. **Document the wizard-as-Studio-builder model** in [packages/studio/README.md](packages/studio/README.md) (or a dedicated `WIZARDS.md`) so the four paths and the 4-roots map are not hidden in OnboardingWizard's `description:` strings. ~30 min, zero risk.
2. **Add Path 5: HoloMesh-published Studio configs.** Browse + import a Studio shell that another team has published. The endpoint already exists ([packages/studio/src/app/api/holomesh/team/templates/](packages/studio/src/app/api/holomesh/team/templates/)); a 5th OnboardingWizard tile + thin wrapper wizard ties HoloMesh into the onboarding surface for the first time. ~2 sessions, low risk, closes a real gap.
3. **Merge OnboardingWizard ⟷ FirstRunWizard** (or document why both exist). Both are entry-tier, ~520 LOC combined. ~1 session, medium risk (need to confirm trigger conditions for each).
4. **Extract `<WizardShell>`** that absorbs the Step0..Step4 progress + nav layout from ImportRepoWizard + StudioSetupWizard. Each path-implementer shrinks by 60-80 LOC. ~1 session, low risk.
5. **Unify scene templates.** Either flatten `lib/presets/templates/` into `data/sceneTemplates.ts` (one source-of-truth, 92 templates), or rename so the relationship is explicit (`data/curatedSceneTemplates.ts` + `lib/presets/templates/` = "domain catalog"). ~1 session, medium risk (downstream importers).
6. **Bridge BrittneyWizard.tsx ⟷ WizardFlow.ts.** UI layer and engine layer should be tied with one explicit interface; right now they're parallel implementations of "Brittney guides you through building a Studio." ~2 sessions, medium-high risk (cross-package).

Items 1, 2 are immediately shippable. Items 3-6 deserve their own scoped sessions, ideally one at a time.

## What the studio-ui-graph should also surface (v1.1+)

The TSX→.holo scan would catch more if it grew two extensions:

- **`@wizard_path("path-name")` annotation extraction.** Pages or wizard components carrying `@wizard_path("absorb-import")` would let the emitter render the path map directly.
- **Template-registry indexing.** A separate `data_registry "scene_templates"` block enumerated by walking `data/`, `lib/presets/templates/`, `lib/workspace/templates/`. Templates would no longer be invisible.

Both are deferrable. The audit above is what we have now without those extensions — and it's already enough to act on items 1 and 2 immediately.

## Coordinates for the next agent

- Studio-ui-graph output: [packages/studio/.holo/studio.ui.holo](packages/studio/.holo/studio.ui.holo)
- Wizard component dir: [packages/studio/src/components/wizard/](packages/studio/src/components/wizard/) (12 files)
- Template registries: 7 paths listed in §"The template surface" above
- Brittney engine: [packages/studio/src/lib/brittney/WizardFlow.ts](packages/studio/src/lib/brittney/WizardFlow.ts)
- HoloMesh template API: [packages/studio/src/app/api/holomesh/team/templates/](packages/studio/src/app/api/holomesh/team/templates/) + [/[id]/templates/](packages/studio/src/app/api/holomesh/team/[id]/templates/)
