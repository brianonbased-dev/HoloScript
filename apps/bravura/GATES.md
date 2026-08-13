# Bravura — Game Ledger

**Bravura** — VR maestro-training / conducting game. Single premium release.
Founder direction (2026-08-12): basic black room; hands visible, controller
option; the orchestra is just the instruments, realistic-looking, NOT
cartoon. Identity: "the more eccentric you are, the better the game learns
you."

Gates 1–2 (tempo-latency probe, measured green with receipts) live in
`apps/tempo-latency-probe/GATES.md`. This file is the game ledger from
gate 3 onward. Research record: memory `vr-conducting-game-idea`; report
artifact "The Conducting Game — Research Report".

## Gate 3 — The black room with the first instrument (opened 2026-08-13)

One realistic-first-pass instrument (timpani — the conductor's anchor: its
whole musical job is the beat, so the gate-2 tempo/phase machinery IS its
performance) standing in a black room under one warm spotlight; your hands
visible; it strikes on the engine's beats and follows your conducting.

### F.076 four-question gate

1. **Falsifiable claim.** Desktop: the room renders (black stage, spotlit
   copper timpani on legs, floor disc, fog); waving the mouse conducts it —
   timpani strikes land ON engine beat events with a SynthEngine-rendered
   timpani sound, tempo+phase following identical to gate 2. VR (Quest
   browser): stereo views come straight from XR view/projection matrices;
   hands render as joint constellations (controllers as batons when hands
   are absent); a world-space HUD shows live BPM and the latest trial
   verdict; exiting shows the same verdict page and receipt as the probe.
   The probe app's self-test remains green after the shared-code refactor
   (audio-pipeline regression guard).
2. **Real seam.** Audio/conducting: the SAME shared modules as gates 1–2
   (probe's conductor/beatDetector/verdict, engine SequencerImpl +
   SynthEngine + nudgePhase + gridAround) — Bravura imports them, no forks.
   Rendering: app-local sovereign WebGL renderer — NAMED DECISION: the
   engine's XR path is XRWebGPUBinding-gated (its own header: headset
   support uneven, WebGL fallback expected, and that fallback is the
   legacy three.js surface being retired). Port to the engine's native
   WebGPU XR path is seeded for when the binding ships on Quest browser.
   Serving: local-only this gate (founder-skill ruling 2026-08-13 — the
   production-over-local default targets service consumption, not the
   measurement bench; no static-hosting surface exists and the studio SPA
   false-greens static paths). TRIPWIRE: on Joseph's first failed solo
   attempt at the adb-reverse path, hosted serving becomes the next gate
   item — no second attempt required.
3. **Failing-if-broken evidence.** (a) Probe self-test re-run after the
   refactor — must stay green (same numbers class as gate 2). (b) Desktop
   render verified by screenshot review (the instrument must read as a
   timpani, not a toy — founder's realism bar, first-pass). (c) Strike
   visuals are scheduled from the SAME beat event and audibleAt timestamp
   that schedules the sound — one source, no separate clock to drift.
   (d) Receipts unchanged (game/gate fields updated), click log intact.
4. **Scope + blast.** New `apps/bravura/**`; probe app touched only by the
   behavior-preserving refactor (verdict.ts extraction, conductor
   setClickBuffers addition) — regression-checked. Out of scope, named:
   more instruments, orchestra layout, teaching/levels, remix, hosted
   serving, engine-renderer port, photoreal PBR/textures (first-pass
   materials this gate; upgrade path named). Regression surface: probe app
   (guarded by (a)); engine untouched this gate.

### Premortem (inline — fork executor 529s persist)

1. **Stereo/camera math wrong → discomfort or mis-render.** Guard: VR uses
   XR-provided projectionMatrix and view.transform.inverse.matrix verbatim;
   the only hand-rolled camera is the desktop fallback.
2. **Timpani reads as a toy.** Guard: screenshot iteration on materials
   (copper needs warm spec + fresnel rim; head needs sheen); the bar this
   gate is "first-pass realistic," recorded; photoreal upgrade named out of
   scope.
3. **Audio-visual desync.** Strike flash scheduled at the click's audibleAt
   from the same event; tolerance one frame. True audible-vs-visual
   alignment is only provable in-headset — carried to Joseph's run.
4. **Hand-joint rendering cost** (50 joints × 2 eyes as separate draws).
   Fine at this scene size; if Quest frame rate dips, merge to one
   instanced-ish mesh — named fallback, not built preemptively.
5. **Hands unavailable in session** → controller batons; neither → the room
   still runs and desktop mouse still conducts (no dead end).
6. **Scope creep toward the orchestra.** One instrument. The ledger holds
   the line.

### Exit criteria — closed 2026-08-13 (in-headset run standing)

- [x] Desktop room verified by screenshots across two material passes
      (pass 1: spotlight pool invisible — floor albedo ate it; copper read
      black. pass 2: metal-weighted warm fill + hotter spot + brighter floor
      → copper reads as copper, stage pool visible, hoop separates). Live
      synthetic-mouse run mid-screenshot: YOU 158 · ENSEMBLE 158 on the HUD,
      trial measured 536 ms / 1.43 beats (desktop path, amber as expected
      from gate 2's known ~90 ms DOM-dispatch overhead), receipt built.
- [x] Timpani voice verified by waveform stats: proper drum decay
      (RMS quarters 0.18 → 0.04 → 0.01 → 0); a peak-at-1.0 clip on the
      downbeat was caught by the stats and trimmed (gain 0.88).
- [x] Probe self-test regression after the shared-code refactor: **green,
      unchanged class** — speed-up 448 ms / 1.21 beats, slow-down 1136 ms /
      2.07 beats, offset 68 ms (gate-2 close was 1.20 / 2.05 / 73).
- [x] VR path code-complete on the proven XR seam: 25-joint hand
      constellations, controller batons (full grip orientation), world-space
      HUD, per-eye render from XR matrices, framebuffer binding. In-headset
      verification is Joseph's standing criterion (RUN.md; tripwire above).
- [x] Committed with the ledger updated.

## The curriculum — how Bravura teaches maestro (standing roadmap, founder ask 2026-08-13)

"Add the scoring so it can teach me; we also need to teach other things on
how to maestro." The skills a real conducting education covers, mapped to
gates. Each lesson must pass the house rule: the room teaches by responding
honestly, never by feeling like homework.

| Skill | What the room measures | Gate |
|---|---|---|
| Steady hand | interval evenness (wobble) | **4 (this gate)** |
| Landing the beat | signed hand-vs-grid offset (early/late) | **4 (this gate)** |
| Louder & softer | stroke size → strike strength; contrast + control | **4 (this gate)** |
| Clean tempo changes | the gate-2 step trials, reframed as a lesson | 5 |
| Beat patterns (4/4, 3/4, 2/4 shapes) | stroke direction path vs pattern template | 5+ |
| The preparation & downbeat (starting) | upbeat→downbeat gesture pair from silence | 5+ |
| Cueing (bringing a section in) | point/look at a section on its entrance | needs sections (6+) |
| Holds & releases (fermata) | sustain gesture, clean cutoff | 6+ |
| Subdivision (slow music in 8) | double-time hand over half-time grid | later |
| Expression → remix | the earned Maestro tier from the research report | later |

## Gate 4 — Scoring: the room starts teaching (opened 2026-08-13)

### F.076 four-question gate

1. **Falsifiable claim.** (a) Dynamics: stroke size drives strike strength —
   a small wave strikes soft, a big wave strikes hard (per-strike gain from
   detector stroke amplitude; verified by receipt velocities from a
   synthetic small-vs-big run). (b) Scoring: every hand beat gets a SIGNED
   offset vs the engine grid (early/late, from `gridAround`) and a rolling
   steadiness measure (interval variation). (c) Teaching loop v0: three
   HUD-guided lessons — Steady Hand (free tempo, evenness), On the Beat
   (the drum leads at fixed tempo, you land on it; follow-drive disabled in
   lead mode), Louder & Softer (alternate big/small on prompt) — each ends
   in a plain-words score card; results land in the receipt and bests in
   localStorage. (d) The probe app's self-test stays green (conductor
   changes are additive; follow mode remains default).
2. **Real seam.** Same shared conductor/detector modules (probe) and engine
   transport (`gridAround` becomes load-bearing for scoring — the exact use
   case named when it landed). Lessons and scoring live in `apps/bravura`.
3. **Failing-if-broken evidence.** Synthetic desktop runs per lesson with
   known inputs and expected verdict classes: a steady wave must score
   "steady," a deliberately wobbled wave must score worse (negative
   control); an aligned-to-drum wave must beat a phase-shifted one; a
   big/small alternating wave must show contrast a flat wave lacks. Probe
   self-test regression. Receipts carry per-lesson raw numbers.
4. **Scope + blast.** `apps/bravura/**` + additive-only edits to the shared
   conductor/detector (new fields/callbacks, default behavior unchanged —
   regression-guarded). Out of scope, named: beat-pattern shape recognition,
   cueing/sections, fermata, voice prompts, cross-session progression
   beyond localStorage bests, any server. Regression risk: conductor
   velocity path altering probe loudness (default velocity 1.0 = old
   behavior); lead mode leaking into follow mode (flag defaults 'follow').

### Premortem (inline)

1. **Teaching feels like homework** (the checklist's named wrongness mark).
   Guard: lessons are ~30 seconds, prompts are one line, the score card
   speaks plain words ("rock steady", "a touch early"), and free play stays
   the default mode — lessons are a button, not a wall.
2. **Signed offset lies near the half-beat boundary** (nearest-grid
   ambiguity). Guard: offsets beyond ±40% of a period are scored "lost the
   beat" rather than early/late — no pretending precision where the metric
   folds.
3. **Dynamics double-drives tempo** (big strokes also read as slower
   strokes). Guard: velocity normalizes against a running stroke median;
   detector timing path untouched by amplitude.
4. **Lead mode fights gate-2 muscle memory** (drum stops following → feels
   broken). Guard: lesson prompt says the drum leads before it starts; free
   play restores following the moment the lesson ends.
5. **Score inflation** (grading only completed strokes hides misses). Guard:
   L2 counts drum beats without a matching hand beat as misses in the score.

### Gate 4 exit criteria — closed 2026-08-13

- [x] Dynamics verified: big/small blocks produce velocities 1.0 vs 0.44
      (contrast 2.27); flat strokes produce contrast 1.00. Strike glow
      scales with velocity (visual half of dynamics).
- [x] L1/L2/L3 positive AND negative controls, deterministic driver
      (direct conductor.feed with sample-exact timestamps — the first
      pointer-event driver was itself the flaky thing and polluted all
      three scores; its receipts are the record of why):
      good student **95 / 95 / 92 (all green)** — CV 0.9%, 34 ms median
      on-beat with 0 misses, contrast 2.27;
      bad student **28 / 30 / 35 (warn/bad)** — CV 13%, 249 ms chasing,
      contrast 1.00 — with the correct coaching line each time.
- [x] Probe self-test regression green: 1.17 / 2.09 beats, offset 59 ms.
- [x] Committed; ledger + curriculum updated; in-headset run standing.

### Gate 4 findings

1. **The instrument's own lag must be subtracted from coaching.** A
   grid-perfect synthetic conductor still measures ~34 ms "late" (beat
   detection latency), so the "you land late" hint threshold sits at 55 ms;
   asymmetric with the early hint at −25 ms. Proper per-input-mode latency
   calibration is the named gate-5 improvement.
2. **The verifier can be the bug**: the first driver (dispatched pointer
   events, wall-clock scheduled, blocks counted its own way) failed all
   three lessons on a "good" performance — timer jitter, a half-period sign
   error, and block misalignment, plus possible live-cursor interference.
   Deterministic direct-feed drivers are now the house verification pattern
   for input-driven features.
3. **Auto-rest (founder question made feature)**: "why do the beats
   continue with no cursor movement?" → in follow mode the ensemble now
   rests after 8 silent beats (measured: rests at exactly 4.8 s at 100 BPM)
   and wakes on the next stroke. The full musical answer — taught cutoff
   gestures — is the curriculum's holds-and-releases lesson (gate 6+).
4. **Whole page is the podium** (founder bug report): pointer conducting
   was bound to one element; input anywhere now conducts in both apps.

### Gate 3 findings

1. **The audio pipeline carried over untouched** — the timpani is literally
   the gate-2 clicks with different buffers (`setClickBuffers`), so the
   certified following needed zero re-verification beyond the regression
   run. The strike flash and the strike sound come from the same beat event.
2. **Material truth in a one-light room**: metals die without environment —
   the fix that made copper read was weighting the fill light BY metalness
   (metal reflects its environment; the fill IS the environment here).
3. **Verification without eyes works**: the pixel-grid probe proved the
   scene rendered before any screenshot could (the first black screenshot
   was the classic unpreserved-drawing-buffer capture artifact, not a render
   bug), and waveform stats caught a real clip a listen-through might have
   missed.
