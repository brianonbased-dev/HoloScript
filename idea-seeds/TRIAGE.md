# Idea Seed Triage

**Repository:** HoloScript
**Generated from:** local idea seed files
**Seed count:** 30
**Build promotion threshold:** 40
**Paper promotion threshold:** 35

## Outcome Counts

- promote-to-build: 12
- promote-to-research: 0
- promote-to-paper-row: 1
- merge-into-existing: 1
- keep-dormant: 6
- retire-with-reason: 10

## Triage Table

| Seed | Outcome | Class | Score | Source | Reason |
|---|---|---|---|---|---|
| [Creator web-form surfaces (plugin register / trait define / training-data ingest) wired to REAL systems](2026-06-03_creator-web-form-surfaces-plugin-register-trait-define-training-data-ingest-wire.md) | retire-with-reason | deleted-work |  | HoloScript removed pages: app/workspace/plugins/new, app/workspace/traits/new, app/training-data/new (commit pending) | Low-score retired component seed; keep only if a current owner can name a live dependency. |
| [Declarative React agent-UI hooks (useAgent/circuit-breaker/degraded-mode/suspense-task) rebuild HoloScript-native](2026-06-05_declarative-react-agent-ui-hooks-useagent-circuit-breaker-degraded-mode-suspense.md) | retire-with-reason | deleted-work |  | packages/react-agent-sdk (retired 2026-06-04: deprecated on npm + private:true; legacy hand-TS, 0 consumers, never imported @holoscript/core) | Low-score retired component seed; keep only if a current owner can name a live dependency. |
| [Software/CPU fallback render tier for the native engine (headless + deterministic-test rendering)](2026-06-05_software-cpu-fallback-render-tier-for-the-native-engine-headless-deterministic-t.md) | retire-with-reason | deleted-work |  | packages/holo-vm/src/render/native-renderer.ts (slice 59bfe5ab6) SoftwareRasterBackend + NativeFramebuffer; supersede WebGPU primary with engine WebGPURenderer, but the CPU tier has standalone value | Low-score retired component seed; keep only if a current owner can name a live dependency. |
| [Gemini Interactions / Live API steps[] schema for real-time multi-turn](2026-06-08_gemini-interactions-live-api-steps-schema-real-time-multi-turn.md) | keep-dormant | unknown |  |  | Preserved for future scavenging; no current promotion signal crossed threshold. |
| [BrittneyVoiceFrontDoor voice ASR front-door for Founder Console next-actions (Brittney reads + listens for ordinal/label)](2026-06-09_brittneyvoicefrontdoor-voice-asr-front-door-for-founder-console-next-actions-bri.md) | retire-with-reason | deleted-work |  | packages/studio/src/components/quest/BrittneyVoiceFrontDoor.tsx (commit a1832fea8 N4, deleted N3 cutover 2026-06-09) | Low-score retired component seed; keep only if a current owner can name a live dependency. |
| [QuestProofPanel verifiable proof display for Studio quest completion flow](2026-06-09_questproofpanel-verifiable-proof-display-for-studio-quest-flow.md) | retire-with-reason | deleted-work |  | packages/studio/src/components/quest/QuestProofPanel.tsx (removed/renamed, flagged by holo-ci/render-surface SURFACE-SHRANK, workload ci-875511b2-mq78b1y3) | Low-score retired component seed; keep only if a current owner can name a live dependency. |
| [Retired npm packages connector-upstash, connector-vscode, graphql-api, hologram-worker, holoscript-agent, marketplace-api, registry](2026-06-09_retired-npm-packages-connector-upstash-graphql-marketplace-registry-hologram-worker.md) | retire-with-reason | retired-component |  | holo-ci/publish-surface SURFACE-SHRANK, workload ci-875511b2-mq78b1y3, sha 875511b2 | Low-score retired component seed; keep only if a current owner can name a live dependency. |
| [Idea Seed](2026-06-10_hs-connect-execute-wiring-topology-validator-semantic-pass.md) | keep-dormant | unknown |  |  | Preserved for future scavenging; no current promotion signal crossed threshold. |
| [Unknown-trait warning needs union allowlist, not VR_TRAITS-only (parser)](2026-06-14_unknown-trait-warning-needs-union-allowlist-not-vr-traits-only-parser.md) | retire-with-reason | deleted-work |  | packages/core/src/parser/HoloCompositionParser.ts parseTraitName ~3380 | Low-score retired component seed; keep only if a current owner can name a live dependency. |
| [3D real-estate tour compilers (Matterpak + HoloGram MLS)](2026-06-16_3d-real-estate-tour-compilers-matterpak-hologram-mls.md) | retire-with-reason | deleted-work |  | research/2026-05-10_3d-real-estate-virtual-tour.md; deleted compilers MatterpakCompiler + HoloGramMLSCompiler (dead/POC, zero importers, retired during the compiler-poison capstone) | Low-score retired component seed; keep only if a current owner can name a live dependency. |
| [Adaptive Platform Layers Architecture & Implementation Plan](archive-farm/2026-05-12_archive_adaptive-platform-layers-architecture-implementation-plan.md) | promote-to-build | security-instinct | 75 | docs/archive/ADAPTIVE_PLATFORM_LAYERS.md | Build-worthy implementation signal with score 75; review for an actionable board or backlog task. |
| [Autonomous TODOs: Agent Identity Framework](archive-farm/2026-05-12_archive_autonomous-todos-agent-identity-framework.md) | promote-to-build | security-instinct | 50 | docs/archive/AUTONOMOUS_TODOS.md | Build-worthy implementation signal with score 50; review for an actionable board or backlog task. |
| [Build Your Own Platform with HoloScript](archive-farm/2026-05-12_archive_build-your-own-platform-with-holoscript.md) | promote-to-build | security-instinct | 47 | docs/archive/BUILD_YOUR_OWN_PLATFORM.md | Build-worthy implementation signal with score 47; review for an actionable board or backlog task. |
| [HoloScript Autonomous Enhancements Summary](archive-farm/2026-05-12_archive_holoscript-autonomous-enhancements-summary.md) | retire-with-reason | security-instinct | 61 | docs/archive/AUTONOMOUS_ENHANCEMENTS_2026-02-26.md | Seed text says the idea is already represented, superseded, or should not be preserved. |
| [HoloScript Foundation](archive-farm/2026-05-12_archive_holoscript-foundation.md) | promote-to-build | runtime-instinct | 49 | docs/archive/FOUNDATION.md | Build-worthy implementation signal with score 49; review for an actionable board or backlog task. |
| [HoloScript+ Phase 6-8: Complete Navigation Guide](archive-farm/2026-05-12_archive_holoscript-phase-6-8-complete-navigation-guide.md) | promote-to-build | runtime-instinct | 46 | docs/archive/NAVIGATION_GUIDE.md | Build-worthy implementation signal with score 46; review for an actionable board or backlog task. |
| [HoloScript Trait Coverage Audit](archive-farm/2026-05-12_archive_holoscript-trait-coverage-audit.md) | promote-to-build | security-instinct | 47 | docs/archive/TRAIT_COVERAGE_AUDIT.md | Build-worthy implementation signal with score 47; review for an actionable board or backlog task. |
| [HoloScript Use Case Research: Comprehensive Competitive Analysis](archive-farm/2026-05-12_archive_holoscript-use-case-research-comprehensive-competitive-analysis.md) | promote-to-build | security-instinct | 51 | docs/archive/USE_CASE_RESEARCH_COMPREHENSIVE.md | Build-worthy implementation signal with score 51; review for an actionable board or backlog task. |
| [RFC: @platform() Conditional Compilation](archive-farm/2026-05-12_archive_rfc-platform-conditional-compilation.md) | promote-to-build | runtime-instinct | 55 | docs/archive/RFC_PLATFORM_CONDITIONAL_COMPILATION.md | Build-worthy implementation signal with score 55; review for an actionable board or backlog task. |
| [Shared-Sort Multiview Foveated Gaussian Splatting: Sublinear Scaling for Collaborative VR](archive-farm/2026-05-12_archive_shared-sort-multiview-foveated-gaussian-splatting-sublinear-scaling-for-collabor.md) | promote-to-paper-row | runtime-instinct | 46 | docs/archive/P043_MULTIVIEW_FOVEATED_GS_PAPER.md | Explicit paper/evidence signal with score 46; review for paper matrix or evidence backlog. |
| [GPU Acceleration - Month 1 COMPLETE](archive-farm/2026-05-12_features_gpu-acceleration-month-1-complete.md) | retire-with-reason | runtime-instinct | 49 | docs/archive/features/GPU_ACCELERATION_MONTH_1_COMPLETE.md | Seed text says the idea is already represented, superseded, or should not be preserved. |
| [HoloScript Roadmap v3.0.x v5.0 (Merged)](archive-farm/2026-05-12_reports_holoscript-roadmap-v3-0-x-v5-0-merged.md) | promote-to-build | security-instinct | 70 | docs/archive/reports/ROADMAP_v3.1-v5.0_MERGED.md | Build-worthy implementation signal with score 70; review for an actionable board or backlog task. |
| [HoloLand TS-Only Package Classification](research-farm/2026-05-12_audit-reports_hololand-ts-only-package-classification.md) | merge-into-existing | retired-component | 38 | research/audit-reports/hololand-ts-only-classification-2026-05-07.md | Retired/deleted component should be reconciled with deletion ledgers or current package disposition before task promotion. |
| [Agentic Internet Composition Demo task1778125252148qe2i](research-farm/2026-05-12_research_agentic-internet-composition-demo-task1778125252148qe2i.md) | promote-to-build | paper-instinct | 43 | research/2026-05-06_agentic-internet-composition-demo.md | Build-worthy implementation signal with score 43; review for an actionable board or backlog task. |
| [Alpha-Acceptance-Rate Measurement Protocol for Tier-2 LLM-Speculative Dispatch](research-farm/2026-05-12_research_alpha-acceptance-rate-measurement-protocol-for-tier-2-llm-speculative-dispatch.md) | keep-dormant | security-instinct | 31 | research/2026-05-10_alpha-measurement-protocol.md | Preserved for future scavenging; no current promotion signal crossed threshold. |
| [Cursor .mdc rule format spec research (Phase 1 follow-up)](research-farm/2026-05-12_research_cursor-mdc-rule-format-spec-research-phase-1-follow-up.md) | keep-dormant | security-instinct | 37 | research/2026-05-06_cursor-mdc-spec.md | Preserved for future scavenging; no current promotion signal crossed threshold. |
| [Isaac Lab Sim-to-Real: HoloScript Interop Memo](research-farm/2026-05-12_research_isaac-lab-sim-to-real-holoscript-interop-memo.md) | promote-to-build | security-instinct | 51 | research/2026-04-19_isaac-lab-sim-to-real.md | Build-worthy implementation signal with score 51; review for an actionable board or backlog task. |
| [pose.predict Trait Design Memo](research-farm/2026-05-12_research_pose-predict-trait-design-memo.md) | keep-dormant | runtime-instinct | 36 | research/2026-04-28_pose-predict-design.md | Preserved for future scavenging; no current promotion signal crossed threshold. |
| [TODO-R2 WASM Performance Benchmark Results](research-farm/2026-05-12_research_todo-r2-wasm-performance-benchmark-results.md) | promote-to-build | runtime-instinct | 48 | research/2026-04-19_todo-r2-wasm-bench-results.md | Build-worthy implementation signal with score 48; review for an actionable board or backlog task. |
| [xsp6 Trezor anchor first production-anchored settlement receipt](research-farm/2026-05-12_research_xsp6-trezor-anchor-first-production-anchored-settlement-receipt.md) | keep-dormant | runtime-instinct | 30 | research/2026-05-07_xsp6-trezor-anchor-proof.md | Preserved for future scavenging; no current promotion signal crossed threshold. |

## Action Candidates

- retire-with-reason: [Creator web-form surfaces (plugin register / trait define / training-data ingest) wired to REAL systems](2026-06-03_creator-web-form-surfaces-plugin-register-trait-define-training-data-ingest-wire.md)
- retire-with-reason: [Declarative React agent-UI hooks (useAgent/circuit-breaker/degraded-mode/suspense-task) rebuild HoloScript-native](2026-06-05_declarative-react-agent-ui-hooks-useagent-circuit-breaker-degraded-mode-suspense.md)
- retire-with-reason: [Software/CPU fallback render tier for the native engine (headless + deterministic-test rendering)](2026-06-05_software-cpu-fallback-render-tier-for-the-native-engine-headless-deterministic-t.md)
- retire-with-reason: [BrittneyVoiceFrontDoor voice ASR front-door for Founder Console next-actions (Brittney reads + listens for ordinal/label)](2026-06-09_brittneyvoicefrontdoor-voice-asr-front-door-for-founder-console-next-actions-bri.md)
- retire-with-reason: [QuestProofPanel verifiable proof display for Studio quest completion flow](2026-06-09_questproofpanel-verifiable-proof-display-for-studio-quest-flow.md)
- retire-with-reason: [Retired npm packages connector-upstash, connector-vscode, graphql-api, hologram-worker, holoscript-agent, marketplace-api, registry](2026-06-09_retired-npm-packages-connector-upstash-graphql-marketplace-registry-hologram-worker.md)
- retire-with-reason: [Unknown-trait warning needs union allowlist, not VR_TRAITS-only (parser)](2026-06-14_unknown-trait-warning-needs-union-allowlist-not-vr-traits-only-parser.md)
- retire-with-reason: [3D real-estate tour compilers (Matterpak + HoloGram MLS)](2026-06-16_3d-real-estate-tour-compilers-matterpak-hologram-mls.md)
- promote-to-build: [Adaptive Platform Layers Architecture & Implementation Plan](archive-farm/2026-05-12_archive_adaptive-platform-layers-architecture-implementation-plan.md)
- promote-to-build: [Autonomous TODOs: Agent Identity Framework](archive-farm/2026-05-12_archive_autonomous-todos-agent-identity-framework.md)
- promote-to-build: [Build Your Own Platform with HoloScript](archive-farm/2026-05-12_archive_build-your-own-platform-with-holoscript.md)
- retire-with-reason: [HoloScript Autonomous Enhancements Summary](archive-farm/2026-05-12_archive_holoscript-autonomous-enhancements-summary.md)
- promote-to-build: [HoloScript Foundation](archive-farm/2026-05-12_archive_holoscript-foundation.md)
- promote-to-build: [HoloScript+ Phase 6-8: Complete Navigation Guide](archive-farm/2026-05-12_archive_holoscript-phase-6-8-complete-navigation-guide.md)
- promote-to-build: [HoloScript Trait Coverage Audit](archive-farm/2026-05-12_archive_holoscript-trait-coverage-audit.md)
- promote-to-build: [HoloScript Use Case Research: Comprehensive Competitive Analysis](archive-farm/2026-05-12_archive_holoscript-use-case-research-comprehensive-competitive-analysis.md)
- promote-to-build: [RFC: @platform() Conditional Compilation](archive-farm/2026-05-12_archive_rfc-platform-conditional-compilation.md)
- promote-to-paper-row: [Shared-Sort Multiview Foveated Gaussian Splatting: Sublinear Scaling for Collaborative VR](archive-farm/2026-05-12_archive_shared-sort-multiview-foveated-gaussian-splatting-sublinear-scaling-for-collabor.md)
- retire-with-reason: [GPU Acceleration - Month 1 COMPLETE](archive-farm/2026-05-12_features_gpu-acceleration-month-1-complete.md)
- promote-to-build: [HoloScript Roadmap v3.0.x v5.0 (Merged)](archive-farm/2026-05-12_reports_holoscript-roadmap-v3-0-x-v5-0-merged.md)
- merge-into-existing: [HoloLand TS-Only Package Classification](research-farm/2026-05-12_audit-reports_hololand-ts-only-package-classification.md)
- promote-to-build: [Agentic Internet Composition Demo task1778125252148qe2i](research-farm/2026-05-12_research_agentic-internet-composition-demo-task1778125252148qe2i.md)
- promote-to-build: [Isaac Lab Sim-to-Real: HoloScript Interop Memo](research-farm/2026-05-12_research_isaac-lab-sim-to-real-holoscript-interop-memo.md)
- promote-to-build: [TODO-R2 WASM Performance Benchmark Results](research-farm/2026-05-12_research_todo-r2-wasm-performance-benchmark-results.md)

Regenerate with:

```powershell
node C:/Users/josep/.ai-ecosystem/scripts/triage-idea-seeds.mjs --root C:\Users\josep\Documents\GitHub\HoloScript
```
