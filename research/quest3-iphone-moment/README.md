# HoloScript Quest 3 iPhone Moment — Plan Index

**Filed:** 2026-04-18
**Motivation:** Founder is not a developer, Quest 3 is his daily hardware, and the benchmark for the product is the iPhone moment — voice + hand + passthrough replace code + terminal + Unity. VRChat/CLI/npm remain developer go-to-market, not the identity.

**Primary bet:** Path A — Quest 3 browser + WebXR + voice + LLM-in-loop + HoloScript compile-in-wasm + one-tap share URL.

This directory contains three runnable plans:

| File | Purpose | Time to execute |
|---|---|---|
| [a-quest3-feasibility-probe.md](./a-quest3-feasibility-probe.md) | Drop-in HTML page Joseph loads on his Quest browser to verify WebXR, hand tracking, passthrough, microphone, SpeechRecognition, SharedArrayBuffer, and Studio reachability. Produces a GREEN/YELLOW/RED score. | 20 min in-headset |
| [b-voice-intent-grammar.md](./b-voice-intent-grammar.md) | Narrow subset of HoloScript the voice loop targets + full LLM system prompt for Claude Haiku 4.5 + verification step. Three worked examples, edit-mode prompt, hyperparameters. | Reference doc |
| [c-studio-share-path-map.md](./c-studio-share-path-map.md) | Map of what's already shipped in Studio for share URLs (80% — `/api/share`, `/shared/[id]`, `useSceneShare`, Drizzle+Postgres) and the six concrete gaps (G1–G6) to reach in-headset publish + QR handoff. Two-day sprint plan. | Two-day engineering sprint |

## The acceptance test these three plans unlock

Joseph, from cold:
1. Puts on Quest 3
2. Opens `studio.holoscript.net`
3. Speaks a scene into existence ("three torus rings of different colors spinning around a gold cube")
4. Grabs and moves objects with his hands
5. Taps a 3D publish button in-scene
6. Points his friend's phone camera at the QR that appears
7. Removes headset

All seven steps without a keyboard, terminal, Unity install, or SDK. That is the iPhone moment v0.

## Order of operations

1. **This weekend:** Joseph runs plan (a). 20 minutes. Produces observations file.
2. **Monday based on results:** either commit to the two-day sprint in plan (c), or schedule research spikes for the specific RED items the probe surfaces.
3. **In parallel with the (c) sprint:** wire plan (b)'s LLM prompt to a tiny Anthropic SDK client + the browser's `SpeechRecognition` API. This is ~1 day of work and independent of the Studio path. Can land before, during, or after (c) — it's a separate integration surface (a single client-side module).
4. **Dogfooding gate:** when (a) probe passes + (b) voice loop compiles a parseable scene + (c) in-VR publish button shows a working QR, Joseph runs the full 7-step acceptance test from cold. Video the run. That's the deliverable.

## What this plan explicitly does NOT try to do

- **Does not** replace the VRChat outreach track. VRChat remains the developer go-to-market. See the [VRChat Track A report](../2026-04-18_vrchat-dry-run-track-a-gate.md). Developer audience gets the CLI + UdonSharp story; non-developer audience gets the Quest iPhone moment. Both run.
- **Does not** bet on a Meta Store native app as v0. Path B (native Quest app) comes after Path A has paying or invested-time users.
- **Does not** solve multiplayer. Single-user authoring, many-viewer consumption is the v0 shape.
- **Does not** solve arbitrary HoloScript features via voice. Voice v0 is a narrow, tested grammar of primitives + 12 traits. Adding traits is adding rows to a table — incremental.

## Risk register (ordered by what would kill the plan)

| Risk | Signal | Mitigation |
|---|---|---|
| Meta Browser blocks `SpeechRecognition` in immersive-vr sessions | probe (a) #6 fails OR works in 2D but not in VR | Ship wasm whisper.cpp (~30MB) as fallback. Decision point at probe-day. |
| COOP/COEP breaks Studio's current third-party loads | probe (a) #7 YELLOW + Studio pages break after enabling headers | Audit third-party asset sources first; use `credentialless` COEP mode; host critical assets via Studio origin. |
| Voice LLM returns fluent but unparseable .holo | any single user test | Already mitigated in plan (b) — narrow grammar + one-retry + trait allow-list. Keep the retry budget at 1; don't let it balloon. |
| Latency from voice-to-render feels slow | Joseph says "it's fine" instead of "that's cool" on first use | Haiku + low max_tokens + compile-in-wasm keeps p50 under 1s. If still slow, cache prompt prefix via Anthropic prompt caching; the system prompt is fixed and long. |
| Quest 3 browser crashes after N minutes in VR | probe (a) extended session time observation | Session-resume on crash via `sessionStorage` + quick auto-recreate. Known Meta Browser issue with no easy fix; live with it for v0. |

## Next decision

Joseph runs plan (a) on his Quest. Everything downstream forks on the observations. No further work on (b) or (c) is wasted regardless of (a) results — the grammar and share-path docs are useful for Path B (native) too, just with a different runtime.
