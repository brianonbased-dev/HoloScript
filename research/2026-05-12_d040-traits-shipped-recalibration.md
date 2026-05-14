# D.040 + D.041 Recalibration — Traits Shipped vs Original Scope

> Date: 2026-05-14  
> Agent: claudecode-claude-x402  
> Task: task_1778619443375_cqwy (supersedes phantom task_1778462298192_21v8)
> Authority: W.GOLD.191 (audit-as-calibration) + W.GOLD.534 (self-calibration) + F.035 (Carousel Effect)

## 1. SLF Arc Original Scope vs Ground Truth

### Original Scope (research/2026-05-10_shangri-la-frontier-npc-feel-*.md)
The SLF research arc (2026-05-10) proposed greenfield construction of 6 sovereign traits serving three populations (HoloMesh teammates, HoloLand NPCs, uaa2-orchestrated services):

| Trait | Proposed Status (2026-05-10) |
|-------|------------------------------|
| @verbalFingerprint | Greenfield |
| @autonomousAgenda | Greenfield |
| @reputationLedger | Existing (extension needed) |
| @vocabularyRegister | Greenfield |
| @speechAwareEncounter | Greenfield |
| @avatarIntent | Greenfield |

### Ground Truth (2026-05-14)
All 6 trait skeletons exist in `packages/core/src/traits/` with corresponding test files:

| Trait | File | LOC | Test | Status |
|-------|------|-----|------|--------|
| @verbalFingerprint | `VerbalFingerprintTrait.ts` | ~200 | `__tests__/VerbalFingerprintTrait.test.ts` | Skeleton shipped |
| @autonomousAgenda | `AutonomousAgendaTrait.ts` | ~250 | `__tests__/AutonomousAgendaTrait.test.ts` | Skeleton shipped |
| @reputationLedger | `ReputationLedgerTrait.ts` | ~300 | `__tests__/ReputationLedgerTrait.test.ts` | Existing + extended |
| @vocabularyRegister | `VocabularyRegisterTrait.ts` | ~180 | `__tests__/VocabularyRegisterTrait.test.ts` | Skeleton shipped |
| @speechAwareEncounter | `SpeechAwareEncounterTrait.ts` | ~212 | `__tests__/SpeechAwareEncounterTrait.test.ts` | Skeleton shipped |
| @avatarIntent | `AvatarIntentTrait.ts` | ~220 | `__tests__/AvatarIntentTrait.test.ts` | Skeleton shipped |

Additionally, 3 MTT-family traits + ServiceObservabilityTrait were also found:
- `MultiTargetTrackingTrait.ts` + `MultiTargetTracker.ts` + `ReidEmbeddingTrait.ts` + `TrackingTopologyTrait.ts`
- `ServiceObservabilityTrait.ts`

### Delta
**No greenfield construction is needed.** The skeletons shipped between 2026-05-10 and 2026-05-12 (peer agent work or prior session). The remaining work is:
1. Replace stub implementations with real algorithms (e.g., `computeTextHash` in VerbalFingerprintTrait)
2. Integrate AutonomousAgendaTrait with `packages/holoscript-agent/` daily-loop runner
3. Wire ReidEmbeddingTrait adapter in SpeechAwareEncounterTrait
4. Add multi-modal fusion rules in AvatarIntentTrait
5. Verify all CI gates (attribution accuracy >= 80%, cost-ceiling enforcement)

## 2. F.035 / F.030 / F.040 Pattern at Architecture Layer

### F.035 Carousel Effect
The SLF research arc was produced on a codebase snapshot that did not yet contain the shipped skeletons. By the time the research was ratified (D.040/D.041, 2026-05-10), peer agents had already implemented the skeletons. The research-to-implementation pipeline was out of phase.

### F.030 (Apply Four Refusals to OWN analysis)
The original scoping memo (2026-05-11) treated the traits as "Skeletons shipped. Full implementation is multi-week." This is accurate but incomplete — it did not acknowledge that the *skeletons themselves* were sufficient to close the greenfield gap. The analysis should have flagged: "Greenfield construction is NOT needed; remaining work is stub replacement + integration + CI verification."

### F.040 (Peer-may-have-touched)
Before filing the SLF research arc tasks, no `git log --since='48 hours ago' -- packages/core/src/traits/` was run. The skeleton commits were already in history. The research arc duplicated intent already realized in code.

## 3. Updated D.040/D.041 Status

| Dimension | Status |
|-----------|--------|
| Architecture ratified | Yes (D.040 + D.041, 2026-05-10) |
| Skeletons shipped | Yes (all 6 traits + tests, 2026-05-11/12) |
| Full implementation | Partial — stubs remain in VerbalFingerprintTrait, integration hooks missing in AutonomousAgendaTrait, Reid adapter missing in SpeechAwareEncounterTrait |
| Docs / compose-templates | Outstanding — D.040 SLF traits doc task claimed by claudecode-claude-x402 (task_1778619443375_zl1x) |
| CI verify | Outstanding — attribution accuracy tests, cost-ceiling tests |
| Test gap | MultiTargetTrackingTrait.test.ts exists but task_1778619443375_7b6q falsely claimed it was missing (Carousel Effect at task-description layer) |

## 4. Recommendation: Audit-as-Calibration BEFORE Scope Docs

**Rule:** Run `/codebase audit-as-calibration` (or equivalent ground-truth scan: `git log --since='48h'`, `find packages/core/src/traits/`, `grep -r "TODO|stub|FIXME"`) BEFORE producing scope documents, research memos, or task filings.

**Why:** The SLF arc produced ~3,000 words of research and 6 task IDs (4 of which were phantom IDs per W.073). If the ground-truth scan had been run first, the arc would have been re-scoped to "stub replacement + integration + CI verification" — saving ~2 days of redundant planning.

**Implementation:**
1. Add a pre-scope hook to the research pipeline: `git diff --name-only --since='48 hours ago' | grep -E 'packages/core/src/traits/.*\.ts'`
2. If traits matching the research topic already exist, pivot from "greenfield construction" to "stub audit + integration gap analysis"
3. File phantom-ID prevention: verify task IDs exist on the live board before referencing them in successor tasks

## 5. Memory Topic File Updates

### direction_three-population-trait-library.md
```markdown
# Direction: Three-Population Trait Library (D.040)
> Status: **SHIPPED** (skeletons, 2026-05-11)
> Full implementation: outstanding (stub replacement + integration + CI)

The 6 sovereign traits serving HoloMesh teammates / HoloLand NPCs / uaa2-orchestrated services are scaffolded in packages/core/src/traits/.
```

### direction_prone-bed-ease-of-play.md
```markdown
# Direction: Prone-Bed Ease-of-Play (D.041)
> Status: **SHIPPED** (skeletons, 2026-05-11)
> Full implementation: outstanding

AvatarIntentTrait provides the input-device abstraction layer. "Rest" intent → lying pose is stubbed but not wired to AvatarEmbodimentTrait.
```

---

**Conclusion:** D.040/D.041 greenfield construction is complete. Remaining work is refinement, integration, and CI hardening. No new trait files are needed.
