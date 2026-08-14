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

## Gate 5 — Tempo changes + beat patterns (opened 2026-08-13)

### F.076 four-question gate

1. **Falsifiable claim.** (a) Detection-lag calibration: the ~34 ms
   gesture-detection lag is subtracted at the source (conductor's signed
   offset), so a grid-perfect synthetic conductor scores |bias| < 15 ms in
   On the Beat, and the probe's steady-state offset drops ~30 ms with lock
   latencies unchanged-or-better (regression must stay green, else revert).
   (b) Lesson 4 "Changing Tempo": staged prompts (hold → speed UP → slow
   DOWN) reuse the certified step-trial machinery; each direction graded by
   its certified band; a prompt-ignoring run times out and scores low.
   (c) Lessons 5–6 "The Four / The Three": the detector gains lateral (x)
   tracking; each beat is classified left/center/right against the player's
   own spread; bars are matched against the 4/4 [center,left,right,center]
   and 3/4 [center,right,center] lateral templates; the HUD draws the
   pattern diagram during the lesson. A template-following synthetic run
   scores high; a vertical-only run scores low.
2. **Real seam.** Same shared detector/conductor (x is an additive optional
   field on BeatSample; XR feeds wrist x, desktop feeds clientX); the
   certified trial machinery and verdict bands become the lesson's grader —
   the measurement IS the teacher.
3. **Failing-if-broken evidence.** Deterministic direct-feed drivers (house
   pattern from gate 4), positive AND negative per lesson; probe self-test
   regression; On-the-Beat bias re-check after calibration; receipts carry
   per-lesson raw numbers (trial latencies, per-bar match sequences).
4. **Scope + blast.** `apps/bravura/**` + additive shared-module edits
   (BeatSample.x, beatXs, calibration constant). Out of scope, named:
   3/4-vs-4/4 auto-detection, downbeat-anchored bar alignment grading
   (groups count from lesson start; noted in the lesson sub-text), left-
   handed mirrored patterns (seeded), preparation/downbeat lesson, cueing.
   Regression risk: calibration shifts phase snap — guarded by the probe
   regression gate with explicit revert criterion.

### Premortem (inline)

1. **Calibration overshoots on some input mode** (mouse vs hands differ).
   Guard: single conservative constant (34 ms, measured on the desktop
   path); per-mode calibration remains the follow-up; revert criterion
   explicit.
2. **Lateral classification thrashes on narrow conducting** (player barely
   moves sideways → everything "center" → pattern lessons unpassable by
   honest smallness). Guard: spread-relative thresholds with a minimum
   absolute spread; if spread is too small the lesson says "make the shape
   bigger" rather than scoring zero.
3. **Tempo lesson deadlocks** (student never triggers a trial). Guard:
   12 s per-direction timeout with a "no change heard" card, scored low but
   never stuck.
4. **Pattern templates fight handedness.** Right-handed templates this
   gate; mirrored templates seeded, named in the lesson text.
5. **Five lessons feel long.** Runtime ~3 minutes total; each lesson is
   still individually short; free play remains the default room.

### Gate 5 exit criteria — closed 2026-08-13 (one claim half-reverted, recorded)

- [x] Calibration, with a correction the regression gate forced: applying
      tCal to the PHASE SNAP broke the certified numbers (offset 59→405 ms,
      up-lock 1.17→2.08 beats) because the lock-stamp floor and offset
      metric are tuned to the detection frame — **reverted per the ledger's
      own criterion**; the probe re-ran green (1.20/2.13, offset 69).
      Calibration lives ONLY in the scoring offsets, where the grid-perfect
      synthetic now reads **bias −6 ms, median 6 ms** (was +34) with no
      false coaching line. Two frames, both documented in the conductor.
- [x] L4 Changing Tempo: obedient driver **95** — "1.2 beats — crisp" both
      directions, graded by the certified bands; prompt-ignoring driver
      **10** — "no clear change heard" twice, clean 12 s timeouts, no
      deadlock.
- [x] L5 The Four: shape-following driver **100** (5/5 bars, spread 260);
      vertical-only driver **15** with "Make the shape BIGGER" guidance.
      L6 The Three: **100** (5/5 bars). HUD draws the numbered pattern
      diagrams during both lessons.
- [x] Committed; ledger updated; in-headset run standing.

### Gate 5 findings

1. **A calibration is not one number, it's one number per frame of
   reference.** The same 34 ms constant that fixes coaching (hand-vs-grid
   truth) breaks the follow-feel metrics (click-vs-detection consistency).
   The regression gate caught it in one run; the revert criterion written
   before the change made the decision automatic. This is why the criterion
   gets written first.
2. **The certified measurement became the teacher without modification** —
   Lesson 4 grades with the same trial machinery and bands the probe
   certifies, so the lesson can never drift from the measured truth.
3. Six lessons now teach: steady hand, landing the beat, dynamics, tempo
   changes, the 4-pattern, the 3-pattern. Next in the curriculum:
   preparation & downbeat (starting from silence), then sections for
   cueing. Left-handed mirrored patterns and downbeat-anchored bar
   alignment remain seeded.

## Gate 6 — Preparation & downbeat (opened 2026-08-13)

### F.076 four-question gate

1. **Falsifiable claim.** (a) New conductor capability `armDownbeat()`: with
   the ensemble silent, a sustained upstroke from stillness marks the
   preparation start; the next detected beat is THE downbeat — the ensemble
   starts sounding ON it, at the tempo implied by the preparation's
   duration (prep ≈ one beat). (b) Auto-rest completes: a rested ensemble
   no longer resumes on any twitch — it arms, and wakes only on a real
   downbeat at the prep-implied tempo (the status line's "give a downbeat"
   promise becomes literally true). (c) Lesson 7 "The Downbeat": three
   trials of listen (drum demos 90) → silence → prepare → strike; graded on
   started-tempo error vs the demonstrated 90 and on hesitations (re-preps
   before the strike); a 90-prep synthetic scores high, a 140-prep scores
   low on tempo, a stutter-prep loses hesitation points, and a no-strike
   trial times out as a miss. (d) Probe self-test stays green (arming is
   inert unless enabled: autoRestBeats stays null in the probe, armed
   defaults false).
2. **Real seam.** Detector gains stillness/upstroke sensing (per-config
   velocity thresholds); conductor gains the arming state machine wired to
   the same engine transport (`setBPM` + fresh `start()` = first beat fires
   on the downbeat within one 25 ms tick). The lesson polls the same
   conductor state the free-play wake uses — one mechanism, two consumers.
3. **Failing-if-broken evidence.** Deterministic drivers: correct-tempo
   prep, wrong-tempo prep, stutter prep, no-strike timeout; a free-play
   rest→wake check asserting the restarted BPM ≈ the prep tempo; probe
   regression. Receipts carry per-trial started-BPM and hesitations.
4. **Scope + blast.** `apps/bravura/**` + additive detector/conductor
   changes. The auto-rest wake path CHANGES (pause→resume becomes
   stop→armed-downbeat) — this is the one deliberate behavior change,
   named here; it only exists where autoRestBeats is set (Bravura), never
   in the probe. Out of scope: choosing your own target tempo (lesson
   prescribes 90 after demoing it), cutoff/release gestures (next), fermata.

### Premortem (inline)

1. **Upstroke sensing misfires on hand tremor** → false preps. Guard:
   stillness must hold ≥0.35 s and the rise velocity threshold is high
   (250 px/s desktop, 0.35 m/s XR); a false prep only re-arms — the
   downbeat still lands on the next real bottom; hesitation count surfaces
   it instead of hiding it.
2. **Prep duration ≠ intended beat for real humans** (breath speed varies).
   Guard: generous bands (±8% full marks, ±15% good) and the lesson demos
   the target immediately before each trial.
3. **Free-play wake feels broken if the first stroke after rest is casual**
   (slow drag up → very slow started tempo). Guard: started BPM clamps to
   40–220; a out-of-range prep restarts at the pre-rest tempo instead.
4. **Trial deadlock.** 10 s no-strike timeout per trial, scored as a miss,
   never stuck.

### Gate 6 exit criteria — closed 2026-08-13 (all receipts on the final build)

- [x] Downbeat mechanism: clean prep starts the ensemble ON the strike at
      **85 vs target 90 (5.9%, inside ±8%)**, deterministic ×3; free-play
      rest→wake produces a REAL prepared downbeat
      (`lastDownbeat {bpm:111, casual:false}` from a 120-promise prep).
- [x] Lesson paths, one receipt each: clean **95** ("started at 85" ×3,
      0 hesitations); wrong-tempo **25** ("started at 127" ×3); stutter
      **85** (= 95 − exactly one hesitation penalty per trial, flight-log
      proven: `prep hes=0 → prep hes=1 → downbeat 0.709 s later`);
      mixed run: timeout → "no downbeat", creep-then-strike →
      "strike without a breath" (`prep=none casual=true` in the log),
      clean → "started at 85". Score 40 bad, every path distinct.
- [x] Probe self-test regression green on the final detector:
      1.17 / 2.11 beats, offset 59 ms, all 32 wave beats detected.
- [x] Committed; ledger updated; in-headset run standing.

### Gate 6 findings — the sensor war, won by the flight recorder

Detecting "a breath from stillness, then a strike" took three rounds of
real bugs, each found by a control run + the arming flight log, each fixed
at the root:

1. **Instant rise threshold missed human starts.** Real hands accelerate
   smoothly; the first out-of-still sample is never fast. Fix: stillness
   breaking upward arms a 120 ms grace window to reach decisive speed, and
   the preparation is dated from the TRUE motion start.
2. **Stillness residue fabricated strikes.** The smoothed velocity keeps
   the sign of the last motion at microscopic size, so a rise after a
   downward-ending hesitation read as a strike at the rise's own start
   (log: prep and downbeat at the identical sample). Fix: a bottom only
   counts if the hand genuinely DESCENDED into it — tested against the
   descent's PEAK speed, not the flip-sample velocity (the EMA glides
   through zero even on a full-speed strike).
3. **One in-band sample isn't stillness.** The glide through the still band
   at every gentle turn wiped the descent peak right before real strikes
   (a build where NO beat could fire — the probe would have caught it too).
   Fix: stillness actions require 100 ms residency.

Also learned: rising from stillness into a stroke IS a preparation whether
the player intends it or not — so "casual" (unprepared) starts are only
creeping or downward-first strikes, which is the musically truer mechanic
than the spec's original wording. The certified probe path survived all
three fixes unchanged (receipt above) — the beat definition got stricter
only where real strokes never live.

## Gate 7 — The second instrument and the cue (opened 2026-08-13)

### F.076 four-question gate

1. **Falsifiable claim.** (a) A second instrument stands in the room:
   tubular chimes — brass frame, five graduated tubes, bell voices rendered
   by the engine SynthEngine (inharmonic partials, long ring), striking on
   beats 1 and 3 of the bar with the conductor's dynamics, glowing per
   strike. (b) Ensemble state: chimes idle dark and silent; a sustained
   point at them (≈250 ms) toggles a pending entrance/exit that lands
   QUANTIZED on the next bar's downbeat — musical, never mid-bar. (c) Cue
   detection: VR left-hand index ray (wrist→index-tip) or controller grip
   ray within ~20° of the chimes; desktop cursor within the chimes'
   projected screen radius. The ray math is unit-checked in-page with
   synthetic vectors. (d) Lesson 8 "The Cue": the drum leads at 90; the HUD
   counts bars; the chimes enter on bar 3's downbeat — point at them ON the
   entrance; graded by cue-to-entrance offset (±0.5 beat full marks, ±1
   they still enter, beyond/miss they stay silent). Three trials. An
   on-time synthetic cue scores high; a late cue low; no cue = miss and no
   entrance heard. (e) Probe self-test stays green (shared-module change is
   one additive click counter).
2. **Real seam.** Chimes ride the SAME beat events and velocity the timpani
   does (one engine grid, one dynamics stream); entrance quantization reads
   the engine's own bar structure (beat-in-bar from the sequencer's beat
   events). Cueing is app-level (bravura), pointing input reuses the
   already-captured hand joints / grip matrices / cursor.
3. **Failing-if-broken evidence.** Deterministic drivers: on-time cue ×3,
   late cue, no-cue; free-play toggle run asserting the entrance lands on a
   downbeat (click-log timestamps vs grid); bell-voice waveform stats
   (long-ring decay); screenshot of the two-instrument room; in-page ray
   unit checks; probe regression.
4. **Scope + blast.** `apps/bravura/**` plus one additive conductor field
   (public click/beat-in-bar counters for lessons). Out of scope, named:
   more instruments/sections beyond the chimes, gaze-based cueing, cue
   DURING self-conducted tempo (lesson isolates the skill with the drum
   leading; free play composes them), stereo/spatial panning per instrument
   position (seeded — the engine has HRTF spatialization unbuilt into the
   room), fermata/cutoff. Regression: probe (guarded), lesson 1–7 behavior
   (untouched paths; spot-checked by the downbeat lesson's driver rerun if
   shared code shifts).

### Premortem (inline)

1. **Pointing false-positives while conducting** (the beat hand sweeps past
   the chimes' direction). Guards: cue needs 250 ms sustained pointing; in
   VR the BEAT hand is excluded (left hand or either controller cues); on
   desktop the cursor must sit within the chimes' radius, and waving is
   vertical while the chimes sit far to the side.
2. **The chimes drown the timpani** (long ring stacking). Guard: bell gain
   trimmed, strikes only on beats 1/3, ring capped ~2.5 s, master path
   already clip-checked by waveform stats.
3. **Quantized entrance feels unresponsive** ("I pointed, nothing
   happened"). Guard: immediate visual acknowledgment — the chimes glow
   faintly the moment the cue registers (pending state), then sound on the
   downbeat; the HUD names it ("chimes: joining on 1").
4. **Desktop screen-projection drift** (resize changes the projected
   radius). Guard: projection recomputed per frame from the live matrices.
5. **Lesson count-in confusion.** The HUD counts bars and beats big and
   plain, and the entrance bar is named in the prompt.

### Gate 7 exit criteria — closed 2026-08-13

- [x] Chimes render (screenshot: dim brass tubes waiting beside the spotlit
      timpani — idle state reads as "present but uninvited") and ring
      properly (bell stats: peak 0.78 no-clip, RMS quarters
      0.090→0.027→0.012→0.001 over a 2.8 s buffer — true bell decay).
- [x] All six ray/projection unit checks pass in-page (straight-on, 40°
      reject, 90° angle, grip-forward, screen-center projection, behind-
      camera null).
- [x] Free-play toggle, log-verified: exactly **2 cues → 2 transitions**,
      entrance and exit both landing quantized on downbeats (4.8 s apart =
      exactly two bars). This receipt came from a REDESIGN forced by the
      first field run: **ten cues fired from two intended points** —
      boundary jitter re-armed the tracker endlessly (and a parked cursor
      would toggle forever). Cues are now per-EPISODE: gaps <0.6 s merge,
      only a clean departure arms a new cue; a parked cursor fires exactly
      once.
- [x] Lesson 8 receipts: on-time ×3 → **95** ("on it", 0.02–0.07 beats,
      all entrances heard); mixed → **60 warn**: "on it (0.03)" / "0.91
      beats late — they still made it" (audible entrance at ±1 beat) /
      "no cue" (miss — the chimes stayed silent; no reward for a missed
      invitation).
- [x] Probe regression green, unchanged: 1.17 / 2.11 beats, offset 59 ms.
      Committed; in-headset run standing.

### Gate 7 findings

1. **The room is an ensemble now**: two instruments on one engine grid and
   one dynamics stream; entrances/exits are musical facts (quantized to
   the bar) rather than UI toggles, and the pending glow acknowledges the
   cue the instant it lands.
2. **A cue is an episode, not a level.** Anything held (a parked cursor, a
   steady point) must fire once, not oscillate — found in the first field
   run's receipt, fixed in the tracker's shape, provable in the cue log.
3. The lesson isolates the skill (drum leads, you cue); free play composes
   both (conduct AND cue). Spatial audio per instrument position is the
   named seed for when the engine's HRTF stack enters the room.

## Gate 8 — The hold and the cutoff (opened 2026-08-13)

### F.076 four-question gate

1. **Falsifiable claim.** (a) HOLD: while conducting, raising the hand and
   freezing it (stillness residency ≥0.45 s in the UPPER part of the
   player's own recent stroke range, frac ≥0.6) pauses the transport ON its
   position — beats stop, rings sustain (a true fermata; pause not stop, so
   the bar resumes where it held). (b) CUTOFF: from the hold, one decisive
   motion (either direction, same grace-window physics as the preparation)
   stops the ensemble, ramps the ensemble bus silent in ~80 ms, and ARMS
   the downbeat — the next entrance requires a real preparation (gate 6's
   machinery closes the circle). The armed downbeat restores the bus.
   (c) Lesson 9 "The Hold & the Cut", 3 trials of the full grammar:
   conduct 6 beats → raise & freeze → hold ≥1.5 s → cut on prompt →
   silence → give the downbeat to begin again. Graded: no hold = miss;
   premature cut = "the hold broke early"; hold with no cut = "left them
   hanging"; clean hold+cut high. (d) Probe unaffected: holds are gated
   behind `holdsEnabled` (default false; Bravura enables).
2. **Real seam.** Detector gains sustained-still reporting (with the
   player-relative height fraction from a relaxing y-range tracker) and a
   direction-agnostic decisive-move event built on the SAME grace-window
   physics the preparation uses; conductor gains the hold state machine on
   the same transport (pause/stop/arm). All instrument audio now routes
   through one ensemble bus (additive `output` field, default
   destination — probe path unchanged), which is what a cutoff silences.
3. **Failing-if-broken evidence.** Free-play receipt: conduct → hold
   (isHolding true, seq paused) → flick (armed, bus ≈0) → prep →
   downbeat (bus ≈1, playing). Lesson receipts: clean ×3 high; never-hold
   miss; premature-cut mid-band. Probe regression green. Bus gain values
   read directly in the receipts.
4. **Scope + blast.** `apps/bravura/**` + additive shared-module changes
   (detector callbacks + range tracker; conductor hold machine + output
   field + hold/cutoff counters). The one behavior change is
   Bravura-only and flag-gated. Out of scope, named: release-into-continue
   (resuming WITHOUT a cutoff — conservatory refinement, seeded),
   hold-length musicality scoring, cutoff gesture-shape grading (loop vs
   flick), per-instrument holds.

### Premortem (inline)

1. **Holds fire during normal conducting pauses** (thinking with the hand
   up). Guard: 0.45 s residency + upper-range requirement + follow-mode
   playing only; the low still hand keeps meaning "resting toward
   auto-rest" (existing path, untouched).
2. **The cutoff triggers on the resume wave instead of a flick.** Accepted
   and NAMED: any decisive exit from a hold cuts — strict grammar this
   gate; release-into-continue is the seeded refinement.
3. **Bus silencing cuts the room's future too** (armed downbeat inaudible).
   Guard: the armed-downbeat flow restores the bus before the first strike
   sounds; receipt asserts gain ≈1 after restart.
4. **Range tracker drifts during long holds** (hi relaxes toward the held
   y, so frac decays). Hold ENTRY uses the pre-hold range; once holding,
   exit is only via cutoff — entry threshold drift is irrelevant mid-hold.
5. **Lesson deadlocks.** Per-phase timeouts (hold 8 s, cut 6 s, restart
   10 s with programmatic recovery), every path scored, never stuck.

### Gate 8 exit criteria — closed 2026-08-13

- [x] Free-play full-grammar receipt, state-sampled at every stage:
      hold-entered (holding, seq PAUSED, bus 1 — rings sustain) → held-2s
      (stable) → after-cutoff (armed, stopped, bus ramping 0.38→0) →
      after-downbeat (playing, **bus 1 restored**). The restore receipt
      forced an architecture fix first — see findings.
- [x] Lesson 9 receipts: clean ×3 → **95** ("held 2 s, clean cut" — total
      command); impatient (cut at ~0.7 s) → **55** ("the hold broke
      early"); never-freezes → **10** ("the hand never froze"). All paths
      distinct, no deadlocks (timeouts recovered the transport).
- [x] Probe regression green: 1.18 / 2.07 beats, offset 67 ms (the new
      senses idle inertly on the certified path).
- [x] Committed; ledger updated; in-headset run standing.

### Gate 8 findings

1. **Sound must never hang off a render frame.** The first bus-restore
   lived in the HUD pump (rAF-driven); the browser pane stopped
   compositing mid-battery and the room stayed permanently silent after a
   cutoff — with zero errors. The trace (downbeat fired, transport playing,
   gain frozen at 0, and finally rAF counted: 0 frames in 2.5 s) forced the
   right architecture: audio-critical transitions ride the conductor's own
   events (`onDownbeat`), and a 250 ms heartbeat keeps lessons/HUD state
   advancing when frames stall. This is exactly the Quest headset-off case
   — found on the desk before it could be found on a face.
2. **The grammar is closed.** Conduct → raise-and-freeze (fermata: PAUSED,
   so the bar resumes where it held; rings sustain through) → one decisive
   flick (cutoff: silence + ARMED) → breath → downbeat (bus restored on
   the event, at the prep's tempo). Gate 6's preparation machinery is the
   cutoff's other half; Joseph's original "why do the beats continue?"
   question is now answered end-to-end in gesture.
3. The hold entry is player-relative (upper 40% of THEIR recent stroke
   range), so small and large conductors freeze on equal terms. Seeded:
   release-into-continue (resuming from a fermata without a cutoff).

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

---

## Field report — first in-headset run (2026-08-13, Quest 3, hand tracking)

The standing in-headset item fired. Joseph's report, verbatim signal: "its very
buggy its almost lagging or doesnt even seem to go off of my hand gestures …
theres nothing saying this is how you should move your hands." He could not get
past Lesson 1. Every word of that was a real defect. Four found, four fixed.

### Defect 1 — both hands fed the detector at once (`xrSession.ts`)

The input loop fed the conductor per-input-source: with both hands tracked and
`inputSources` enumerating left first (Quest does), BOTH wrists fed every
frame. Two different heights interleaved into one signal — the detector read
garbage. Every human stands with both hands up; the desk drivers never did.
Also: a wrist that lost tracking mid-stroke kept feeding its stale frozen
height (fast motion is exactly when Quest drops joints), and its NaN x
poisoned the lateral stats.

**Fix**: collect all inputs first, then feed exactly ONE source per frame.
The podium hand is sticky — the incumbent keeps it unless it goes still while
the other hand clearly bounces (~1.5 s), so left-handed conductors take over
naturally and a raised cue hand cannot steal the beat. A briefly-lost wrist
feeds *nothing* (a gap is honest; a spike is not); controllers carry the beat
only when no hand is tracked at all.

### Defect 2 — "Teach me" + mode switch froze the counter at 0/18 (`main.ts`)

Lessons bind to one conductor at `startAll`. Every mode switch builds a fresh
conductor, so "Teach me" → "Enter the room" left the engine watching the DEAD
desktop conductor: the beat counter could never move. This alone made Lesson 1
unpassable in VR — the founder's exact experience.

**Fix**: `rebindLessons()` in both mode starters — an active lesson run
restarts on the fresh conductor in the new mode's units.
**Receipt (browser pane, desktop path, final build)**: Lesson 1 passed 97/100
via the house direct-feed driver; then mid-lesson mode switch → the NEW
conductor accrued 24 beats and the lesson re-ran and re-scored (52/100 — the
driver's phase chopped at the switch; the point is the counter MOVED). Before
the fix this scenario froze at 0 forever.

### Defect 3 — nothing taught the motion (lessons.ts, main.ts)

The room listens for one thing — a hand bouncing, beat at the bottom — and
never said or showed it. A non-conductor cannot know.

**Fix**: three teachers. (1) A glowing guide ball bounces on the drum head
during Lesson 1's opening, landing exactly on the drum's real clicks (what you
see IS what you hear); it fades once the student flows (4 beats). (2) The
wrist the room is listening to gets a warm glow — and the glow vanishing IS
the tracking-lost signal, truth over mystery. (3) Plain words: "Bounce your
hand like the glowing ball — the bottom of each bounce is a beat", plus a
25-second stuck line ("The room watches ONE hand bounce. Bigger, calmer
strokes — like bouncing a ball on the drum.").

### Defect 4 — the status line swallowed button clicks (index.html)

`#status` was pinned at a fixed offset that assumed a one-row toolbar; when
the buttons wrapped, the text overlaid them and ate their clicks (found when
MY pane clicks vanished — plausibly hit Joseph on the Quest browser too).
Fixed: status flows below the buttons inside the toolbar, `pointer-events:
none`.

### Open

- **In-headset re-run is the only receipt that counts for Defect 1** — the
  desk cannot produce real Quest hand-tracking (dual hands, joint dropouts,
  72/90 Hz cadence). Awaiting Joseph's second run.
- "Almost lagging": working hypothesis is the dual-feed chaos made the audio
  feel disconnected from the hand. If lag survives the re-run, profile
  rendering next — 50 per-joint sphere draws × 2 eyes is the suspect.

### Finding

**A gate proven on the desk is not proven on the face.** Eight closed gates
with receipts, and the first real user could not pass Lesson 1 — because the
desk drivers feed one clean stream and a human stands there with two hands up.
The input seam between the real device and the detector is its own surface and
needs its own negative controls (dual-source, joint-dropout, handedness).

---

## Field report 2 — instrumenting the founder's LIVE headset (2026-08-14)

Joseph, mid-session, on the desktop testing that produced field report 1:
"what your doing is a lot different than what i experience in VR on the headset."
Correct, and the correction changed the method. A mouse on a flat screen is not
the product: different units, one input stream instead of two hands, and a HUD
that shares the same flat view instead of sitting somewhere in a room.

### Method: read the real session, don't simulate it

The Quest browser exposes `@chrome_devtools_remote`. Bridged with
`adb forward tcp:9222 localabstract:chrome_devtools_remote`, the live page on
his face is directly inspectable (`scratchpad/quest.mjs` evaluates JS in it).
Everything below is measured from HIS session while he wore the headset, not
from a driver. **This is now the house method for any headset claim.**

Instruments installed live: a rolling hand-sample recorder wrapping
`conductor.feed`, and a gaze recorder wrapping `XRFrame.prototype.getViewerPose`
(head yaw/pitch/height per frame).

### The finding: he was reading, not conducting

4000 gaze frames, his real head at **1.41 m** (the room assumed ~1.6 m):

| where he looked | share of frames |
|---|---|
| instruction panel (yaw 28.8° right) | **59.0%** |
| chimes (yaw 38.5°) | 51.1% |
| guide ball (yaw 0°) | 12.8% |
| **the drum (yaw 0°)** | **8.7%** |

The words were 29° off-axis from the teaching. To read them he had to turn away
from the drum, his hands, and the guide ball demonstrating the motion — so he
never watched the demonstration, and stopped conducting every time he read.
"It's all built like an actual maestro is playing" is the symptom of a room
whose only explanation channel is text placed where the teaching is not.

His hands were never the problem: median stroke **0.163 m** against a 0.04 m
threshold, 92 BPM, beat offset 44 ms. He conducts big and clear.

### Fixes (all measured, all committed)

1. **Words moved to where the teaching is** — panel at yaw 0 directly above
   the drum, and **player-relative in height** (`placeHud` tracks the real head
   Y from the XR pose; a fixed height is wrong for every body but the author's).
   Panel enlarged 0.64→0.80 m wide with the aspect matched to the 640x320
   canvas, because at 1.45 m the instruction line rendered ~16 device pixels
   tall on Quest 3 — legible but effortful, and effortful reading is itself a
   reason the eyes never leave.
2. **The panel could lie.** Measured live: it read "HOLD — frozen" while the
   drum was playing and nothing was frozen. Status was written by one-shot
   EVENTS that outlive the state they described. It is now DERIVED every pump
   (`liveStatus`) and phrased as the next MOTION, never a state name.
3. **Two hands, two instruments** (his ask: "i cant make the two instruments
   play separately with both hands"). The free hand now has its OWN detector
   and plays the chimes directly, with its own beats and its own dynamics
   normalised to that hand's median stroke. Pointing still INVITES the section
   to play along on the beat; bouncing PLAYS them yourself. Field-report-1's
   one-podium-hand rule is preserved exactly — the conductor still receives a
   single stream; the second hand goes to a separate detector, never
   interleaved.
   **Receipt**: podium hand at 90 and free hand at 60 simultaneously →
   12 podium beats / 13 drum clicks at a measured 90 BPM, 8 free-hand beats /
   8 chime strikes. Neither dragged the other. **Control**: free hand held
   still while the podium hand conducts → 11 drum clicks, **0** chime strikes.
4. **Stopping is musical now** (his: "when i stop they still play and eventually
   stopped but not seemingly natural"). Auto-rest was 8 silent beats and could
   fire mid-bar. Now 2 silent beats AND only on a bar line: they finish the bar
   and wait together, like an ensemble that lost its conductor.

### The next gate, in the founder's words (2026-08-14)

> "it should be each instrument is independent and the specific ways of moving
> hands depends on solos and playing together. sometimes there are over 100
> instruments."

This is the product, and it is bigger than the two hardcoded instruments. The
model it implies:

- **Every section is an independent player** with its own state (silent,
  following, soloing, held), not a fixed pair wired to a fixed pair of hands.
- **Addressing must scale past the number of hands.** Two hands cannot select
  among 100 sections; *attention* can. Gaze is the conductor's real selector —
  you look at the section you are bringing in. The gaze plumbing proven above
  is exactly the mechanism.
- **The same gesture means different things depending on WHO is addressed** —
  a lift to a soloist swells one line; the same lift to the whole ensemble
  swells everything. Solo vs tutti is a property of the address, not the motion.

Deferred deliberately rather than half-built: this is a section/addressing
architecture, not a patch, and it must land with its own receipts.

### Finding

**Desk-proven, then face-proven, then LIVE-proven.** Field report 1 fixed what a
desk could reach. Only the live session showed that the room's whole explanation
channel sat outside the field of view of the thing it explained. Instrument the
real device before believing any claim about what a person experiences in it.
