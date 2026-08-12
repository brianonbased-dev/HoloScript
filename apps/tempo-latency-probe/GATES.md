# Conducting Game — Gate Ledger

Game: VR maestro-training / conducting game (working title TBD).
Research record: memory `vr-conducting-game-idea`; report artifact "The Conducting Game — Research Report" (2026-08-12).

## Gate 1 — Tempo-latency probe (IN PROGRESS, opened 2026-08-12)

**Purpose:** the single most gameplay-critical number — how long between a
conductor's tempo change and the ensemble audibly following — was unmeasurable
from published sources (every quantified claim failed verification). Measure it
on real hardware instead of assuming it.

### F.076 four-question gate

1. **Falsifiable claim.** When this gate closes: waving a hand (VR wrist /
   controller grip / desktop mouse) produces detected beats that drive the real
   `SequencerImpl.setTempoAnchored()`; clicks are rendered by the real
   `SynthEngine` and scheduled at engine beat timestamps; the page reports a
   measured median step-change latency (ms and beats). The in-page self-test
   (synthetic wave, 120→180 BPM step) locks with latency ≤ 2.5 beats. With the
   naive-`setBPM` fault deliberately injected (negative control), the self-test
   visibly degrades (beat burst / failed lock) — the measurement can go red.
2. **Real seam.** Imports `SequencerImpl`, `SynthEngine`, `AudioTypes` directly
   from `packages/engine/src/audio/` — the shipping engine modules, no copies,
   no mocks. The sequencer clock IS the WebAudio output clock (one clock
   domain). VR input uses the same browser WebXR hand-joint seam the studio's
   Quest hand-tracking receipt uses. The probe is a gate app, not yet a
   production consumer; it breaks if the engine modules break.
3. **Failing-if-broken evidence.** (a) Self-test button: deterministic synthetic
   conductor through the identical pipeline; broken connection or measurement ⇒
   no lock / red verdict. (b) Negative control: `useNaiveSetter` flag reproduces
   the documented `bpm`-setter beat-burst fault; self-test must go red under it.
   (c) Receipt JSON with raw trials, audio latencies, device info — auditable
   after the fact. Desktop path verified end-to-end before gate close; Quest
   in-headset run is the exit criterion.
4. **Scope + blast.** New files only under `apps/tempo-latency-probe/**`. Zero
   edits to `packages/**` or shared surfaces (engine imported read-only by
   esbuild). Out of scope, named as decisions: in-VR visual HUD (audio +
   post-session verdict instead), tempo smoothing / ensemble-musicianship
   model (this gate measures the floor: instant anchored following),
   Quest-native APK path, studio/CLI integration. Regression surface in-repo:
   none (additive). Worst failure mode is the probe misreporting — covered by
   (3).

### Exit criteria

- [x] Desktop mode: wave → beat → tempo follows; step trials lock; verdict +
      receipt render. Verified 2026-08-12 by synthetic pointer input: 22 beats
      detected, 1 trial locked (100→150 BPM, 1677 ms / 4.19 beats), verdict and
      receipt rendered.
- [x] Self-test machinery + negative control, verified 2026-08-12. Healthy run
      (100→160 BPM): locked at **1757 ms / 4.74 beats**, beat-to-click offset
      157 ms. Fault-injected run (naive `bpm` setter): **3035 ms / 8.01 beats**,
      offset 311 ms — the instrument cleanly separates healthy from broken and
      both leave receipts. NOTE, honestly: the falsifiable claim above predicted
      healthy lock ≤ 2.5 beats; **that prediction was falsified** (4.74). The
      instrument works; the number surprised us — which is what the gate is for.
- [ ] Quest in-headset run by Joseph: hears the ensemble follow; post-session
      verdict in plain words; receipt saved. (Instructions in RUN.md.)

### Measured findings (desktop, this machine, commit at receipt)

1. **Current-config floor is RED: ~4.7 beats to lock a 60% tempo jump.**
   Decomposition (now measured separately per trial): ~850 ms is the
   median-of-3 tempo estimator converging; ~900 ms is ensemble re-anchor +
   first confirmed beat. The estimator is the biggest lever and is exactly the
   seeded gate-2 work (musicianship model / faster trend detection).
2. **Tempo-following ≠ phase alignment.** Steady-state beat-to-click offset is
   ~157 ms (~0.4 beat) — structural: `setTempoAnchored` preserves beat-position
   continuity, so the grid never re-phases onto the player's downbeat. The
   game will want gentle phase correction toward the hand's beat instant.
   Discovered by the probe; deferred to gate 2 by name.
3. Audio path on this desktop: baseLatency/outputLatency recorded per receipt;
   Quest numbers pending the in-headset run.

### Verdict bands (design targets, not industry standards — none exist)

- Median step latency ≤ 1.25 beats → "follows within about a beat" (green)
- ≤ 2.5 beats → "a couple of beats behind" (amber)
- else → "too slow to feel like conducting" (red)

### Premortem (inline — the /premortem fork executor returned 529 three times today; this section is what it was for)

Six months out, ways this gate turns out to have failed, and what guards each:

1. **False green — measured the wrong thing.** The lock metric (3 consecutive
   clicks within 8% of target) could over- or under-state perceived following;
   `outputLatency` may be 0/garbage on Quest browser; beat detection itself
   hides a half-stroke of latency. Guards: per-beat phase offset reported
   separately from step latency; raw trials in the receipt; self-test has a
   computable expected band and must land in it; definitions written in RUN.md.
2. **Desktop-verified, headset-divergent.** Thresholds tuned in pixels don't
   fit meters; hands unavailable in some sessions. Guards: per-mode configs;
   controller-grip fallback; and the honest framing that a RED measurement is
   still a successful gate — the gate produces a number, not a pass.
3. **Never reaches the headset** — https/adb serving friction defeats a
   non-developer. Guard: RUN.md gives two paths; if Joseph can't run it solo,
   that is a named surface gap (hosted deploy is the fix, next gate), not a
   quiet death.
4. **Engine drift under the probe.** The bundle imports engine source; a later
   engine change could shift the number. Guard: receipt records the repo
   commit; re-measure after engine audio changes.
5. **Silent regression to the naive setter** (the documented beat-burst bug).
   Guard: the negative-control toggle stays in the UI; self-test must go red
   under it. A control that can't fail proves nothing.
6. **Scope creep** — HUD/smoothing/cueing sneak in before the floor is
   measured. Guard: deferred list below + idea seed in
   `docs/handbooks/idea-seeds.md`; exit criteria frozen above.

### Deferred (named, not silent)

In-VR HUD; smoothing model; per-section cueing; Quest-native hand joints
(native emit still has no hand-input wiring — browser WebXR is the gate-1
path); /journalist receipt verification pass; **hosted serving** (probe is
local-only this gate — deliberate: localhost is the WebXR secure context with
zero deploy surface and no network variance in the measurement; a hosted
probe page becomes gate-2 work iff serving friction blocks Joseph running it
solo). One narrow cast is accepted and documented in source: the
`IAudioContext` adapter seam in conductor.ts (Sequencer verifiably reads only
`currentTime`; the adapter is typed, the cast is at the constructor boundary).
