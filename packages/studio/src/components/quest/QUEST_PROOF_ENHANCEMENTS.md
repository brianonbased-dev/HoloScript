# Quest Proof — enhancement backlog

Findings from deep-ratchet 2026-05-24 on the Quest Proof Dashboard
(`/t/<id>/quest-proof`). Bounded fixes already landed in the same commit; the
items below are unbounded / touch shared tunnel behavior and need a decision.

## E1 — Proof must not be captured through a capability-spoofing relay (LANDED 2026-05-24)

> RESOLVED per founder decision 2026-05-24: suppress the relay shim when a runId is
> present (proof mode); keep it for runId-less preview. Local origin is an optional
> control run, NOT the acceptance gate — Quest proof must work through
> HoloGate/HoloTunnel/Cloudflare (the real headset operator lane). Implemented in
> mcp-orchestrator `tunnelRoutes.ts` (proofMode threaded from runId → patchScript omits
> the isSessionSupported override, sets `window.__holotunnelProofMode`; preview sets
> `window.__holotunnelXrShim`). QuestProbe reads the authoritative `__holotunnelXrShim`
> flag (`QuestProbe.tsx`). Tests: tunnelRoutes proof/preview shim cases (17/17).
> DEPLOY REQUIRED: orchestrator change is live only after Railway deploy.

**CONTEXT.** The HoloTunnel relay injects a shim
(`mcp-orchestrator/src/routes/tunnelRoutes.ts:279-283`) that forces
`navigator.xr.isSessionSupported('immersive-vr') => Promise.resolve(true)` for any
`/Quest/i` user-agent viewing through the tunnel. The QuestProbe capability check
reads that value (`QuestProbe.tsx` `checkWebXR`, the `WebXR immersive-vr` receipt).
Result: every "WebXR immersive-vr OK" receipt captured _through the tunnel_ is a
tautology — it proves the injected stub resolved `true`, not that the device
supports VR. Confirmed against the 2026-05-24 run: all four receipts carry
`url=https://mcp-orchestrator-…railway.app` (tunneled), so the immersive-vr OK is
spoofed. (The `immersive-ar` flag and, crucially, `VR session start` —
`requestSession`, which the relay does NOT spoof — remain genuine.)

Bounded fix already landed: when tunneled on a Quest UA, the immersive-vr capability
receipt now emits WARN + discloses the shim instead of a hollow OK. This stops the
lie but does not give back a genuine capability signal through the tunnel.

**INTENT.** A proof run captured through the relay should carry the same evidentiary
weight as one captured on the device's local origin — or be clearly marked as
preview-only. The shim exists to let the diagnostic "Enter VR" button appear through
the tunnel (a _preview_ affordance); it must not contaminate _proof capture_.

**PATH.**

1. Gate the shim on intent: do not override `isSessionSupported` when the request
   carries a proof runId (e.g. `?runId=` present, or a `x-quest-proof` header the
   relay can read), so capability checks read the real device value during proof.
2. OR have the relay stamp a response header / injected flag
   (`window.__holotunnelXrShim = true`) that QuestProbe reads directly, replacing the
   current path-based `isTunneledPreview()` heuristic with an authoritative signal.
3. OR require proof runs to execute on the device's local origin (un-tunneled) and
   treat tunneled receipts as preview-tier in the dashboard's receipt counts.

**RISK / OWNER.** Changes shared HoloTunnel behavior relied on by other tunneled XR
preview pages (the Enter VR button visibility). Founder-gate per CLAUDE.md §0 (shared
infra / production doctrine). Blast radius: any page that depends on the forced
`isSessionSupported` to show XR entry through the tunnel.

> NOTE: E2 and E3 both live in `QuestProofPanel.tsx`, which at the time of this
> ratchet (2026-05-24) holds an **uncommitted in-flight peer feature** ("Screenshot
> Evidence": `captureDisplayFrame`, upload UI, `ScreenshotApiResponse`, plus its test
> assertions). Per the carousel rule (F.042 / "never sweep a peer's in-flight work
> into your commit"), these two fixes were deliberately NOT applied here — applying
> them would entangle my hunks with the peer's uncommitted work. They are bounded and
> safe to land once the peer's screenshot feature is committed (or by whoever commits
> that feature).

## E2 — `visualStatus` ("Ready"/"Caution") is a frozen hand-edited constant (THIN)

**CONTEXT.** `QuestProofPanel.tsx` `PROOF_PAGES[].visualStatus` / `visualNote` (e.g.
"Renders cleanly in local visual sweep") are hardcoded literals decoupled from any
receipt or live check, last hand-edited 2026-05-23 (`cbe4e77f3`). They render as
green/amber badges that read like proof, while the live receipt panel beside them can
honestly show 0. Not conflated, but the badge implies more confidence than a frozen
constant warrants.

**INTENT.** The badge should reflect the most recent _captured_ receipt for that page

- run, not a frozen editorial guess that silently goes stale.

**PATH.** Derive `visualStatus` from `latestByPage[page.id]` (already computed in the
panel) — OK→Ready, WARN→Caution, FAIL→Skip, none→Unverified — falling back to the
static note only when no receipt exists. Add a one-line caption clarifying the badge
is a prior local sweep, not a live proof. Bounded, local to the panel; no founder
gate. Deferred per the peer-work note above.

## E3 — Guarded page's primary button mislabel (THIN)

**CONTEXT.** For a guarded page, the primary launch button reads "Open Fallback" and
is aria-labelled "Open guarded fallback for X", but its `href` points at the **real**
guarded page (`target`), not the fallback. The actual fallback is a _separate_ "Open
explicit fallback" link. The design intent is "open anyway (advisory guard)", so the
href is correct — the label is the bug (the panel test at line ~96 codifies the real
href, confirming intent).

**INTENT.** Label should match destination: opening the real guarded page should not
be called a "fallback."

**PATH.** Button text "Open Fallback" → "Open Anyway"; aria-label "Open guarded
fallback for X" → "Open X anyway (guarded)"; update the matching test assertion.
Bounded, no founder gate. Deferred per the peer-work note above.

## E4 — HoloMap (D.018): scan-derived anchor + drift (LANDED 2026-05-24)

> RESOLVED per founder decision 2026-05-24. Implemented in
> `packages/core/src/reconstruction/HoloMapRuntime.ts`:
>
> - **Anchor pose** = centroid of EVERY observed point (eviction-adjusted global
>   accumulator), so a single tampered point moves the anchor (a bounds _center_
>   would not). Anchor rotation = yaw aligned to the camera trajectory heading.
> - **Anchor descriptor** = observed-volume extent + global mean confidence
>   (a coarse re-localization feature equal to the manifest bounds extent).
> - **Drift** (`estimatedDriftMeters`) = registration residual: per-frame camera
>   pose deviation from a constant-velocity prediction, accumulated over the
>   capture. **Loop closure** fires on a keyframe-position revisit.
>   Drift exposed via `mcpReconstructStep` return (holo-reconstruct-sessions.ts).
>   gate-33 now asserts (falsifiable negative controls): a one-byte capture tamper
>   changes the anchor pose AND the drift; drift accumulates > 0; descriptor equals
>   the observed bounds extent (not the old [1,0,0,1] stub). 16/16 gate checks pass,
>   digest reproduces. Determinism preserved (61/61 HoloMap core tests).
>   NOT yet derived (honest scope): a real physical-room video scan (gate-33 still
>   uses a deterministic fixture) and full bundle-adjustment loop-closure correction
>   (revisit detection only). Acceptance bar (anchor from scan, drift from residual,
>   tamper-sensitive receipts) — MET.

### Original finding (for history)

## E4 (orig) — HoloMap anchor + drift were constants, not scan-derived (OVERCLAIM)

**CONTEXT.** Deep-ratchet 2026-05-24 of the HoloMap product line (gold-game gate-33
`gate-33-holomap-scan-verify.mjs`). The reconstruction is REAL and falsifiable: the
HoloMapRuntime micro-encoder derives 3D points per-pixel from the capture frames
(`packages/core/src/reconstruction/holoMapMicroEncoder.ts:273-328`), and the gate's
negative control (one-byte capture tamper) genuinely changes capture/replay/room
digests. BUT the **anchor pose and drift-correction are hardcoded constants**:
`HoloMapRuntime.step` sets `anchorPose.position=[0,0,0]`, `anchorDescriptor=[1,0,0,1]`,
`estimatedDriftMeters=0`, `lastLoopClosureFrame=-1`
(`packages/core/src/reconstruction/HoloMapRuntime.ts:635-644`). Only `revision`
(=frame.index+1) varies. The named `holomap_anchor_context` /
`holomap_drift_correction` traits are not runtime-active in this path. The gate-33
`proves.anchor` previously read "the pose/revision the GOLD room uses as its placement
anchor" — implying scan-derived placement. **Claim tightened in the same commit**:
gate-33 now discloses the fixed-origin pose + adds an `anchorScope` field. The points
ARE scan-derived; the anchor/drift are NOT. (Device-capture side note: HoloMap capture
is `getUserMedia` camera, NOT WebXR, so it does NOT inherit the quest-proof tunnel
`isSessionSupported` spoof — E1 is WebXR-scoped only.)

**INTENT.** Derive the anchor pose from the reconstructed geometry (e.g. centroid /
bounds / dominant-plane of the scan points) and produce a real drift estimate +
loop-closure signal, so `holomap_anchor_context` / `holomap_drift_correction` are
genuinely runtime-active and the GOLD room placement is scan-grounded.

**PATH.** In `HoloMapRuntime.step`, replace the constant `anchorPose` with a pose
computed from the aggregated runtime points (already available — the export reads
them); compute `estimatedDriftMeters` from inter-frame trajectory delta; wire the two
named traits into the step. Add a gate-33 assertion that the anchor pose VARIES with
the capture (a second negative control over anchor position), so the leg becomes
falsifiable rather than constant.

**RISK / OWNER.** Touches `@holoscript/core` reconstruction runtime (shared engine
consumed by the GOLD game per D.063). Real algorithm work, not a one-liner; bounded to
HoloMapRuntime + gate-33. No spend, no public posture — agent-ownable, but coordinate
if another agent holds the reconstruction runtime.
