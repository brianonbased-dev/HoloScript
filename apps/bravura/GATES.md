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
