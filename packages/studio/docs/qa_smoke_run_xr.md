# QA Script: WebXR Telemetry & Manifest Binding Smoke Test

This script formally verifies physical constraints when running the “Run XR” feature inside HoloScript Studio (Sprint 5/A objective). It ensures the device hardware loop successfully routes `xr_metrics` telemetry back into the Sovereign `GistPublicationManifest`.

## Prerequisites
- Meta Quest 3 / Vision Pro mapped to the local network or physical tether.
- Chrome/Safari with WebXR Device API enabled.
- `.env` configured with `GIST_MANIFEST_REQUIRE_X402=0` (unless actively testing economy rejection).

## Test Sequence

**Step 1: Editor Invocation**
1. Open HoloScript Studio > Node Graph view.
2. Construct a multi-node scene (e.g., `SceneRoot` → `BoxGeometry`).
3. Click **"Run XR"** from the Node Graph panel header.

**Expected Result 1:**
- Node graph dims but stays contextual.
- The `<WebXRViewer>` overlay mounts seamlessly without throwing WebGL context loss errors.

**Step 2: Physical Metrics Capture**
1. Enter Immersive AR.
2. Wave controllers through standard interaction bounds (approx. 5-10 seconds) to trigger `hitTestCount` metrics.
3. Allow occlusion depth map calculation to register a boolean valid signal (`occlusionProofAcquired: true`).

**Expected Result 2:**
- `Film3dXrMetricsBridge` samples at ~6Hz without frame-rate degradation (must stay >72hz).

**Step 3: Sovereign Bind & Publish**
1. Exit XR (press physical menu button on headset).
2. Click **"Publish"** from the toolbar.

**Expected Result 3:**
- A `200 Success` toast displays.
- The `.holoscript/gist-publication.manifest.json` correctly populates with the sampled `xr_metrics` (e.g. `{"hitTestCount": 42, "occlusionProofAcquired": true}`).
- *Note: If testing with `GIST_MANIFEST_REQUIRE_X402=true`, expect `402 Payment Required` and a UX prompt to the Foundation DAO flow.*

### Edge Cases to Validate
- Tab backgrounding and waking.
- Rapid re-run (`Stop XR` → `Run XR` → `Stop XR`).
- Very large, dense node graphs crashing the viewer allocation memory.
