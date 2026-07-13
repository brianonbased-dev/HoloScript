# Founder visual control plane proof receipt

Task: `task_1783494037509_oz9f` — Build HoloScript-native founder visual control plane proof.

Artifacts:

- `experiments/holoshell-human-os-frontier/founder-visual-control-plane.holo`
- `experiments/holoshell-human-os-frontier/founder-control-plane-policy.hsplus`

Coverage map:

- Work lanes: `WorkLanes`
- Agent state: `AgentState`
- Telemetry: `Telemetry`
- Decision network: `DecisionNetwork`
- Receipts: `Receipts`
- Blockers: `Blockers`
- Stale state: `staleState` properties on lane/agent/telemetry/decision/blocker panels
- Next actions: `NextActions` and per-panel `nextAction` properties
- Founder controls: `ApproveControl`, `RedirectControl`, `RollbackControl`, `RecoveryControl`
- Prototype theatre label: `MissionHeader.properties.theatreLabel`
- Portable consumer evidence: HoloScript `.holo` source plus parser/compiler readback

Readback commands:

```powershell
node scripts/validate-holo-compile.mjs experiments/holoshell-human-os-frontier/founder-visual-control-plane.holo
node scripts/holo-ci/check-native-authoring-shape.mjs --staged
git diff --check -- experiments/holoshell-human-os-frontier/founder-visual-control-plane.holo experiments/holoshell-human-os-frontier/founder-control-plane-policy.hsplus experiments/holoshell-human-os-frontier/founder-visual-control-plane-readback.md
```

Observed readback:

- `parse.success = true`
- `ast.type = Composition | name = Founder Visual Control Plane`
- `ast.objects = 17 | lights = 0 | templates = 3`
- `total nodes = 19`

Boundary note:

This receipt treats the live signed board helper and local compiler readback as evidence. Retrieved or remembered queue context is not used as proof.
