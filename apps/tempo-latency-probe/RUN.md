# Tempo Latency Probe — how to run it

This is Gate 1 of the conducting game. It answers one question: **when you
change your conducting speed, how fast does the ensemble follow?** Nobody has
published that number — we measure it instead of guessing.

## What you do (plain version)

1. Someone starts the probe (two commands below) and gives you the page.
2. Press **Enter VR** on the Quest, and wave one hand up and down like a
   conductor. You'll hear a click follow your beat.
3. Wave steadily for about ten beats, then **clearly speed up** and hold the
   new speed. Do that a few times. Slow down too.
4. Take the headset off. The page shows the verdict in plain words —
   green: "follows within about a beat," amber: "a couple of beats behind,"
   red: "too slow to feel like conducting" — plus the measured number.
5. Press **Download receipt** to save the proof.

No headset handy? **Desktop mode** does the same thing with the mouse, and
**Self-test** runs a robot conductor with no hands at all.

The **"Self-test with fault"** button deliberately runs a known engine bug.
It is SUPPOSED to look broken — it proves the measurement can catch a fault
(a check that can't fail proves nothing).

## Starting it (technical)

```bash
cd apps/tempo-latency-probe
node build.mjs
node serve.mjs
```

Open http://localhost:4173.

### Getting it onto the Quest

WebXR requires a secure context; `localhost` qualifies. With the Quest on USB
and developer mode enabled:

```bash
adb reverse tcp:4173 tcp:4173
```

Then open **http://localhost:4173** in the Quest browser. (A LAN IP will load
the page but the VR button stays disabled — not a secure context.)

## What the numbers mean

- **Tempo change → ensemble locked**: from your last beat at the old speed to
  the first click at your new speed (confirmed by a run of three steady clicks
  within 8% — the run is evidence, only its first click counts as the lock).
  Reported in ms and in beats. This is THE number. Each trial also records the
  detector-only portion separately, so estimator lag and ensemble lag can be
  told apart.
- **Beat-to-click offset**: how far the nearest click lands from each of your
  hand-beats (median ms). Feel of "is it with me."
- Audible click times include the browser's reported audio output latency.
- Verdict bands (green ≤ 1.25 beats, amber ≤ 2.5, red above) are our design
  targets — no industry standard exists; that's why this probe exists.

## What this probe is made of

The point of Gate 1 is connecting proven parts, not writing new ones:

- Beat clock: the engine's real `SequencerImpl` (its `setTempoAnchored()` is
  the live-conducting tempo change).
- Click sound: rendered by the engine's real `SynthEngine`.
- Engine musical time runs directly on the WebAudio output clock (one clock
  domain, so gesture times and click times are directly comparable).
- Hands: browser WebXR hand joints (wrist), controller grip as fallback,
  mouse on desktop.

Receipt JSON records: commit, mode, input source, device, audio latencies,
every trial, and the verdict.
