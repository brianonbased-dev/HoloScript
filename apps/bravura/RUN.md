# Bravura — the black room (gate 3)

One drum in the dark. It follows your hands.

## What you do

1. Someone starts it (two commands below) and gives you the page.
2. **Desktop**: click "Desktop view," wave the mouse up and down over the
   room like a baton. The timpani strikes on your beat; the floating panel
   shows your tempo and the ensemble's, live.
3. **Quest**: click "Enter the room." Your hands appear as points of light.
   Wave one hand — the drum follows. Speed up and hold it; slow down and
   hold it. The panel in the room shows the numbers as you play.
4. Stop (or exit VR): the verdict appears in plain words, and the receipt
   button saves the proof.

## Starting it

```bash
cd apps/bravura
node build.mjs
node serve.mjs
```

Open http://localhost:4174.

### Quest

With the Quest on USB and developer mode enabled:

```bash
adb reverse tcp:4174 tcp:4174
```

Then open **http://localhost:4174** in the Quest browser and press
"Enter the room."

If this step blocks you even once, say so — per the gate ledger's tripwire,
a hosted version becomes the very next work item, no second attempt needed.

## What it's made of

- The beat brain is gates 1–2 unchanged: the engine's real sequencer
  (`setTempoAnchored` + `nudgePhase` + `gridAround`) with the certified
  green following (speed-up ≤1.25 beats; slow-down at the ~2-beat physical
  floor).
- The timpani's voice is rendered by the engine's own synthesizer — layered
  drum partials plus a mallet transient, 2 ms attack so it never feels late.
- The room is a ~300-line sovereign WebGL renderer (no third-party engine):
  one warm spotlight, a metal-aware fill, fog to black. The engine-native
  WebGPU XR port is seeded for when Quest browser ships the binding.
- Strike sound and strike flash come from the same engine beat event — they
  cannot drift apart.
