# PhoneSleeveVR Examples — Sovereign Revival Path

This directory contains modern, AI-augmented experiences for the PhoneSleeveVR category (the 15M-device sovereign revival).

## modern-meditation.holo

A calm floating-orb meditation garden demonstrating the post-2024 revival stack:

- Sovereign `PhoneSleeveVRCompiler` (no Google runtime)
- `aiSnnTracking` — snn-webgpu on-device perception (replaces old DeviceOrientation)
- `aiVoiceCommands` — natural language control
- Full receipt/provenance ready

### Compile (current sovereign path)

```bash
# From the HoloScript repo root
npx tsx packages/cli/src/cli.ts compile \
  examples/phonesleevevr/modern-meditation.holo \
  --target phonesleevevr \
  --ai-snn-tracking \
  --ai-voice-commands \
  --output modern-meditation.cardboard.html
```

Or using the installed CLI once built:

```bash
hs compile examples/phonesleevevr/modern-meditation.holo \
   --target phonesleevevr \
   --ai-snn-tracking \
   --ai-voice-commands \
   --output modern-meditation.cardboard.html
```

The output is a single self-contained HTML file that runs in any modern phone browser inside a cheap viewer (or even without lenses as a "sleeve" experience).

## Revival Context

See the full revival guide:

`docs/revival/phonesleevevr-revival.md`

This example is the first living artifact of the Tier-A SOVEREIGN-REVIVAL (15M devices, sentiment alive, zero prior active work until this marathon).

Next slices (claimable):
- Real snn-webgpu perception adapter feeding the compiler runtime
- Brittney prompt pack for PhoneSleeveVR experiences
- End-to-end demo with live tracking + voice
- Public narrative + "15 million devices, one sovereign compiler"

Every compiled experience should carry a SimulationContract receipt and be visible on the public HoloMesh surface (D.055).