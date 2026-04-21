# Remotion vs live React Three Fiber: capture patterns (2026-04-21)

**Task context:** Remotion is a first-class dependency in `packages/video-tutorials` (see `remotion`, `@remotion/cli`, `@remotion/renderer`). This note clarifies what “integration with live R3F scenes” can mean and what Remotion is built for.

## What Remotion is

- Remotion drives React components on a **timeline**: each output frame is rendered for a **known `frame` index** and **composition time** (`useCurrentFrame`, `useVideoConfig`). It is designed for **deterministic, batch-rendered** video (MP4, stills), not a browser game loop.
- The **`@remotion/three`** package (when used) wraps `Canvas` from React Three Fiber so the Three scene is advanced **in lockstep with Remotion’s frame clock**, not with wall-clock or `requestAnimationFrame` as the source of truth.

## What “live R3F” in Studio is

- HoloScript Studio (and similar apps) use R3F with a **real-time** loop: user input, physics, networking, and `performance.now()`-style behavior.
- That is **not the same execution model** as a Remotion composition, even if the JSX looks similar.

So “real-time Three.js scene capture” is **not** a single import away; you choose one of the patterns below.

## Pattern A — Remotion-native 3D (off-line video)

- Rebuild the **visual** you want in a Remotion composition using `@remotion/three` (or a static `Canvas` that only uses `useFrame` under Remotion’s clock).
- **Pros:** Pixel-perfect, reproducible, fits `remotion render` and CI.
- **Cons:** Duplicated scene logic unless you share data-only props and small presentational components; not literally “the same running Studio”.

*Repo touchpoint:* `packages/video-tutorials` compositions such as `R3FCompilerWalkthrough` today use the shared **`CompilerWalkthroughTemplate`** (slide-style walkthrough), not a full live Three stage—expanding to `@remotion/three` would be a **new** composition, not a wire-up of Studio’s canvas.

## Pattern B — Capture the real canvas (browser)

- From the **live** app: `HTMLCanvasElement.captureStream()` (plus optional `requestFrame` hooks), then `MediaRecorder` or WebCodecs, or pipe into WebRTC.
- **Pros:** True mirror of what the user sees in Studio; no duplicate scene.
- **Cons:** Encodes real-time glitches, timing, and resolution; not deterministic for golden-frame regression unless you add fixed seeds and disable interaction.

## Pattern C — Headless / automated browser

- Run Studio (or a story) in Playwright/Puppeteer, set viewport, **record video** or **screenshot per step**. That is “capture” for QA or trailers, not Remotion’s renderer.

- **Pros:** E2E fidelity without rewriting the 3D graph.
- **Cons:** Heavier ops; not the Remotion render pipeline.

## Pattern D — Shared scene data, two renderers

- Single source of truth: ECS / scene description / glTF. **Studio** uses R3F; **Remotion** uses `@remotion/three` to replay the same assets for a scripted camera path.
- **Pros:** Avoids copy-paste of geometry; can align marketing video with a known asset revision.
- **Cons:** You still implement two “players” (real-time vs frame-indexed), unless the scene is simple.

## Recommendation for HoloScript

1. **Tutorial MP4s** in `packages/video-tutorials`: keep using **Remotion** for deterministic output; if 3D is needed, add a dedicated **`@remotion/three`** composition and shared asset paths—do not assume the Studio canvas can be “dropped in.”
2. **Live session recording / demos of Studio:** prefer **Pattern B** or **C**, documented as a product feature, not as Remotion core.
3. If the product asks for **both** identical pixels and real-time input, treat it as a **roadmap** item: explicit sync protocol or replay-from-log—not “enable Remotion on the same canvas” by configuration alone.

## References

- Remotion: https://www.remotion.dev/docs/
- Remotion + Three: https://www.remotion.dev/docs/three
- `packages/video-tutorials/src/Root.tsx` — composition registry and frame budgets.
- `packages/video-tutorials/src/compositions/R3FCompilerWalkthrough.tsx` — R3F **compiler** walkthrough (narrative template, not live Studio embed).
