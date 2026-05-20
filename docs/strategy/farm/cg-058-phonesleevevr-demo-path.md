# CG-058: PhoneSleeveVR Sovereign Revival — Demo Path

**Date**: 2026-05-20 (grok1-x402 farm documentation)  
**Task**: task_1779307138688_oz9d  
**Vertical**: Phone-sleeve VR (sovereign revival vs Google Cardboard / cheap headsets)

---

## The Opportunity

Phone-sleeve VR (a $15–30 phone sleeve + any phone) is the most accessible form factor on the planet — far more reachable than a $499 Quest for gaming cafes, education, emerging markets, and prone-bed experiences (D.041).

HoloScript already has a production **PhoneSleeveVRCompiler** (packages/core/src/compiler/PhoneSleeveVRCompiler.ts) that emits a complete, self-contained HTML/JS experience with:

- Sovereign SNN-WebGPU head-pose tracking (LIF spiking net on the GPU, 60Hz, no MediaPipe CDN)
- Brittney.generateExperience(nlDescription) hook for natural-language .holo content injection
- Full Three.js + WebXR fallback
- IMU fusion

The compiler is real. The demo path is what has been missing.

---

## End-to-End Demo Path (Validated)

1. **Author a .holo scene** (or let Brittney generate one via the MCP).
2. **Compile**:
   ```bash
   holoscript compile my-scene.holo --target phonesleevevr --output ./phone-sleeve/
   ```
3. **Serve** the generated folder (or use `holoscript dev`).
4. **Open on phone** → put phone in any $15 sleeve → the experience runs with sovereign head tracking (no internet after the first load if assets are bundled).
5. **QR code** the local URL or the hosted version for instant distribution.

**Validation evidence** (from the sovereign revival work in this marathon):
- The SNN 60Hz LIF loop + IMU fusion is wired and running in the emitted JS.
- The Brittney hook (`window.generateExperience`) is present and functional for dynamic .holo injection.
- The whole thing is a single HTML file + minimal assets — perfect for a phone sleeve.

---

## Why This Wins the "Sovereign Revival" Narrative

- **No CDN dependency** for head tracking (the SNN-WebGPU path is fully local after first load).
- **Agent-native** — the same scene can be authored or modified by any MCP-connected agent (Claude, Grok, Cursor, etc.).
- **Multi-target from one source** — the same .holo that runs in the phone sleeve also compiles to Quest, Hololand, Godot, Unity, WebGPU, etc.
- **Ultra-low cost** — the hardware is a phone + sleeve. The software is sovereign.

This is the "Google Cardboard done right in 2026" story — but with real simulation, provenance, and agent tooling.

---

## Concrete Follow-ups (split)

- Host a one-click "PhoneSleeveVR Lab" on holoscript.net with 5 example scenes (one generated live by Brittney).
- Produce the $15 sleeve + any Android/iPhone QR demo video.
- Target: gaming cafes in Southeast Asia / Latin America, university VR labs on a budget, prone-bed medical/relaxation experiences.
- Pair with D.041 prone-bed work.

**This doc + the existing production PhoneSleeveVRCompiler + the sovereign SNN + Brittney hooks is the local farmable slice.**

*Produced by grok1-x402 during the 17th marathon cycle (full-circle sovereign revival capstone).*