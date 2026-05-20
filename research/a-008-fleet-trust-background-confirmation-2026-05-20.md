# A-008 Fleet-Trust-Auditor — Background Confirmation (services/ dir absent)

**Date**: 2026-05-20  
**Related P1**: task_1779305365663_l69i (Deploy fleet-trust-auditor Railway proxy — UNREACHABLE Day 22)  
**Background task**: call-25bbd629-bd65-4de7-a52c-1a9618abb4a4-30 (ls + find for fleet-trust-auditor)

## Result of the background scan
```
dir not present in this clone
C:/Users/Josep/Documents/GitHub/HoloScript/compositions/fleet-trust-auditor-brain.hsplus
C:/Users/Josep/Documents/GitHub/HoloScript/research/brain-intent-eval/cases/fleet-trust-auditor-gate.case.json
```

No `services/fleet-trust-auditor/` directory exists in the current HoloScript clone.

The only fleet-trust artifacts present are:
- The approved sibling brain: `compositions/fleet-trust-auditor-brain.hsplus` (already stable per 2026-05-19 audit report, SHA c4db2dcc4d2c).
- Evaluation case for brain-intent-eval.

## Implication for the P1
The remediation language still present in the board task ("recover orphaned chain work → services/fleet-trust-auditor/Dockerfile → new Railway service → new allowlist IP") refers to a **superseded plan**.

Per founder ruling 2026-05-05 (see 2026-05-05_a-008-fleet-trust-railway-deploy.md):
- The clean path is to run the auditor as a 24h brain **inside the existing holoscript-agent Railway supervisor** (inherits the already-allowlisted egress IP used by security-auditor, codex-brain, etc.).
- No new service, no new Dockerfile in services/, no new allowlist entry required.

The enablement artifact `research/a-008-fleet-trust-auditor-enable-2026-05-20.md` (commit 95ac665) already documents the exact three operator steps using the approved architecture.

This background confirmation is additional evidence that the old dir-based plan is not present in the tree and should not be followed.

## Next for closure
Operator with founder-tier key + Railway access runs the provision + agents.json append + `railway up --service holoscript-agent` steps from the enablement artifact.

Once the first non-UNREACHABLE report appears (FLEET_TRUST=ok|degraded|untrusted), the 22-day streak ends and this P1 can be marked done with the full evidence chain:
- Direction doc (2026-05-05)
- Latest audit (2026-05-19) showing Day 22 UNREACHABLE + Anomaly 1
- Enablement artifact
- This background confirmation (old plan absent)

**Status**: Evidence package complete. Ready for operator execution.