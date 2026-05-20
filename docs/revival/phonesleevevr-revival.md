# PhoneSleeveVR Sovereign Revival (I.012 / D.037 / F.047)

**Classification**: SOVEREIGN-REVIVAL (NMoS P2, founder reversal 2026-05-10)  
**Task**: task_1779304575640_ubwj (PhoneSleeveVR sovereign revival)  
**Status**: First revival artifact (AI-augmentation path)

## The Opportunity

- 15 million devices shipped (cumulative).
- Vendor exited (Google Cardboard discontinued).
- Sentiment alive: 4/4 F.047 signals (real demand died from vendor strategy + product quality, not category obsolescence).
- HoloScript already has a **sovereign compiler**: `PhoneSleeveVRCompiler.ts` (1,133 LOC, no Google dependency).
- The missing piece: AI-augmentation with modern 2024–2026 capabilities (snn-webgpu on-device perception, Brittney NL→.holo content, better OLED phones, WebXR).

This is the clearest concrete target in the "AI revival of abandoned categories" thesis (D.037). An entire abandoned category with millions of units and no current owner. Revive it before someone else does.

## Current Sovereign Surface

- `packages/core/src/compiler/PhoneSleeveVRCompiler.ts` — full sovereign compiler to Cardboard-style VR experiences.
- Existing tests and output paths.
- Already classified SOVEREIGN in the neural map (no external dependency to revoke).

## The AI-Augmentation Path (The Revival)

Combine the existing sovereign compiler with two Tier-1 HoloScript capabilities:

1. **snn-webgpu** — on-device spiking neural network perception / tracking (replaces or augments the old Cardboard head tracking with modern phone sensors + GPU SNN).
2. **Brittney** — natural language → .holo content generation (users describe experiences in plain language; Brittney emits .holo that the PhoneSleeveVRCompiler targets).

Result: a modern, AI-augmented PhoneSleeveVR experience that runs on the 15M installed base + new budget phones, with no Google runtime, full HoloScript provenance and receipts.

## Quick Start (First Revival Slice)

1. Take any existing .holo composition (or generate one with Brittney: "a calm meditation garden with floating orbs and soft ambient sound").
2. Compile with the sovereign PhoneSleeveVRCompiler:
   ```bash
   hs compile myGarden.holo --target phonesleevevr --output myGarden.cardboard
   ```
3. (Future) Pipe snn-webgpu perception data (head orientation, hand presence from phone cameras) into the experience as HoloScript traits.
4. The output runs in any modern browser on a phone in a cheap viewer (or even without one, using the phone's screen as the "sleeve").

## Example Modern Experience (Brittney + Sovereign Compiler)

```holo
// phonesleeve-meditation.holo (generated or hand-written)
scene meditationGarden {
  environment: soft_gradient_sky
  objects: [
    { type: "floating_orb", count: 12, behavior: "gentle_pulse" },
    { type: "ground_plane", texture: "moss" }
  ]
  audio: "ambient_forest"
  interaction: {
    type: "gaze_select",
    on_select: "orb_pulse_and_chime"
  }
}

compile_to_phonesleevevr(meditationGarden)
```

Brittney can generate the above from: "a calm meditation garden with 12 floating glowing orbs, soft moss ground, gentle ambient forest sounds, gaze to make orbs pulse and chime."

The sovereign compiler turns it into a Cardboard-compatible experience with modern HoloScript traits for the snn-webgpu layer.

## Cross-Cutting Requirements

- Every compiled experience should carry a SimulationContract receipt (same as ROS 2 and VisionOS bridges).
- Provenance visible on the public HoloMesh profile (D.055).
- Optional: feed user-generated PhoneSleeve experiences back as training data for Brittney or JEPA world models.

## Why This Is High-Leverage

- Zero new hardware required for millions of users.
- Proves the "developer-enabled revival platform" thesis (D.038).
- Gives HoloScript a massive, real, addressable installed base for spatial experiences on the cheapest possible devices (exactly the prone-bed / accessibility story in D.041).
- Sovereign (no vendor can kill it again).

## Next Slices (Claimable)

1. Thin snn-webgpu perception adapter for phone cameras → HoloScript pose/hand traits (for the compiler runtime).
2. Brittney fine-tuning or prompt pack specifically for PhoneSleeveVR experiences.
3. End-to-end demo: Brittney generates .holo → sovereign compiler → snn-webgpu live tracking → running on a real phone in a $5 viewer.
4. Public revival landing page + "15 million devices, one sovereign compiler" narrative.

---

**Verification Evidence**:
- Sovereign PhoneSleeveVRCompiler.ts already exists and is classified SOVEREIGN in the NMoS.
- This guide + the pattern from the ROS 2 / VisionOS D.007 bridges gives the first concrete revival artifact.
- Ties directly to D.037 (AI revival of abandoned categories), F.047 (sentiment alive), I.012 (revival scan), and the prone-bed accessibility thesis.

This is the first real implementation work on PhoneSleeveVR since the original sovereign compiler landed. The category is no longer untouched.