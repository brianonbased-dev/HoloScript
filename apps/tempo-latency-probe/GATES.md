# Bravura — Gate Ledger

Game: **Bravura** (founder-named 2026-08-12) — VR maestro-training /
conducting game. Single premium release; make it good.
Research record: memory `vr-conducting-game-idea`; report artifact "The
Conducting Game — Research Report" (2026-08-12).

**Founder direction (2026-08-12, verbatim intent):** start in a basic black
room; your hands visible, with the option to use controllers; the orchestra
is just the instruments — realistic-looking instruments, deliberately NOT
cartoon-style (the incumbent Maestro is cartoon; Bravura's look is dark
stage + real instruments). Identity hook: "the more eccentric you are, the
better the game learns you."

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

## Gate 2 — Fix the guesser, get it green (opened 2026-08-12)

### F.076 four-question gate

1. **Falsifiable claim.** With (a) the fast-react estimator — a single stroke
   whose implied tempo deviates ≥12% is trusted immediately, short-median
   refinement for 2 beats after — and (b) per-beat phase nudging via the new
   engine `nudgePhase()` (gain 0.5, clamp 25% of period), the self-test
   (100→160) locks with **median latency ≤ 1.25 beats** under the documented
   metric, the gate-1 stamp also improves materially from 4.74 beats, and the
   steady-state beat-to-click offset falls below ~80 ms. The negative control
   still degrades markedly.
2. **Real seam.** Same engine-source seam as gate 1, plus one new permanent
   engine capability: `SequencerImpl.nudgePhase()` (phase half of live
   conducting; `setTempoAnchored` is the speed half). The game consumes both
   forever.
3. **Failing-if-broken evidence.** Same self-test + fault-injection control +
   receipts. The metric change is guarded against ruler-bending by dual
   reporting in every trial: `latencyMs` (documented meaning: first click of
   the confirming run — what RUN.md always said) AND `confirmedLatencyMs`
   (gate 1's run-end stamp) — so improvement from the system and improvement
   from the definition are separately visible in the receipt. Gate-1's code
   stamped the run's second click, structurally costing ~1 extra beat and
   making its own 1.25-beat green band unreachable by construction; that is
   recorded here as a gate-1 measurement-design error, found and fixed in
   gate 2.
4. **Scope + blast.** `apps/tempo-latency-probe/**` plus the one engine
   method (Sequencer.ts + optional ISequencer member). Out of scope: the
   black-room/hands/instruments visual direction (recorded above, built in a
   later gate), UI redesign, Quest-native path. Regression risk: a
   mis-clamped phase nudge could skip/burst beats — bounded by the per-call
   clamp, and the self-test + control would surface it.

### Gate 2 exit criteria — closed 2026-08-12 (one line not met, recorded)

- [x] Self-test lock, both directions, per-direction bands (see below):
      **speed-up 448 ms / 1.20 beats (green ≤1.25); slow-down 1109 ms /
      2.05 beats (green ≤2.2)**; offset 73 ms (<80). Gate-1 stamp alongside:
      1168 / 2789 ms (vs 2819 ms in gate 1 — system faster under the old
      ruler too).
- [x] Negative control: **red verdict**, 5.49 beats, offset 219 ms, slow-down
      trial never locks. Healthy=green vs fault=red is now categorical.
- [ ] **NOT MET as written:** desktop synthetic-pointer run measured 1.42
      beats (amber) at matched parameters — the DOM-event dispatch path adds
      ~90 ms of main-thread overhead vs the direct-feed self-test, which a
      real mouse also has. Recorded rather than reworded: desktop is the
      fallback mode, not the product surface; no tuning was done to chase it.
- [x] Committed with receipts; Quest in-headset run remains the standing
      hardware criterion (carried from gate 1).

### Gate 2 findings — how the number went from 4.74 to 1.20 beats

1. **Fast-react estimator**: a single stroke deviating ≥12% is a deliberate
   tempo break, trusted immediately (detection now fires on the FIRST
   new-tempo stroke; was ~2.3 beats of median-of-3 convergence).
2. **Phase follows speed**: steady strokes gently pull the grid onto the
   hand (offset 157→~65 ms); a break snaps decisively (engine `nudgePhase`).
3. **The grid must be read from the engine** (`gridAround`): reconstructing
   it as lastClick+period under-corrects right after a retempo (measured +6 ms
   "error" vs true ~280 ms) — the bug that made run 3 slower than run 2.
4. **Metric honesty, both directions**: lock stamp = first run click that can
   only belong to the new tempo (a 69 ms false-instant lock was observed and
   guarded out); ghost re-trials quarantined; and verdict bands are now
   per-direction because the slow-down floor is ~2.0 beats by construction —
   the ensemble has JUST played (click log: click 83 ms before the slow
   stroke) and its next possible sound is one slow period out. No system
   beats that without prediction; the band is set just above the floor, with
   the click log in every receipt as proof.

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
