# Cross-Domain Composition Examples

Real-world applications rarely fit a single domain. These examples demonstrate combining **multiple domain handlers** in a single `.holo` file — showing how IoT, architecture, music, education, rendering, navigation, and Web3 features compose naturally in HoloScript.

## Available Examples

| Example | Domains Combined | Key Features |
|---|---|---|
| **[Smart Building](smart-building.holo)** | IoT + Architecture + DataViz | BIM model with sensor heatmaps, occupancy charts, energy trends, HVAC control |
| **[Concert Venue](concert-venue.holo)** | Music + Input + Rendering + Procedural | Spatial audio, hand-tracked instruments, volumetric fog, beat-synced particles |
| **[Immersive Classroom](immersive-classroom.holo)** | Education + DataViz + Navigation + Web3 | Guided learning stations, interactive data exploration, NFT certificates |

## How Cross-Domain Composition Works

Each domain handler in HoloScript compiles independently — a `@sensor` trait goes through the IoT pipeline, a `@chart_3d` trait goes through the DataViz pipeline, etc. When multiple domains appear in one file, HoloScript:

1. **Parses** all domain blocks and traits
2. **Routes** each to the appropriate domain compiler
3. **Merges** the compiled output into a single platform target
4. **Preserves** cross-domain references (e.g., sensor data flowing into chart visualization)

## Cross-Domain Interactions

The real power is in **actions that span domains**:

```
// In concert-venue.holo — a single action triggers music, particles, AND rendering
action onBeatDetected(bpm) {
  emit("procedural:beat_sync", { bpm: bpm })     // Procedural domain
  emit("render:laser_pulse")                       // Rendering domain
}
```

## Compile Commands

```bash
holoscript compile cross-domain/smart-building.holo --target r3f
holoscript compile cross-domain/concert-venue.holo --target unity
holoscript compile cross-domain/immersive-classroom.holo --target openxr
```
