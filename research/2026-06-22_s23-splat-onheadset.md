# S23 real-capture splat → on-headset (D.106 photoreal tier, real content) — F.076 gate

Slice: bring the already-generated Jetson 3DGS capture (`jetson:/mnt/nvme/holo/3dgs_s23_culled.ply`)
onto the Quest via our sovereign PLY→SPZ glue + the shipped native Splat emit.

1. **Falsifiable claim:** `generate-native` emits `World_s23_capture.kt` containing
   `Splat(Uri.parse("apk:///splats/s23-scene.spz"))`; `WorldsRegistry` gains `"s23-capture"`; the 3
   marketing worlds (shangri-la/aurora/hololand) + `splat-test` `.kt` are **byte-unchanged**; the
   `.spz` is a valid 140k-splat SPZ v3 (round-trip already verified: count ok, pos err 0.000122 m).
   On a Quest cast, scanning `holoscript://world/s23-capture` shows the real captured scene as a splat
   cloud diorama. (Visual = the only headset-gated part.)

2. **Real seam:** production path `worlds/*.holo` → quest compiler → `World_*.kt` + `WorldsRegistry`
   → APK → Meta `com.meta.spatial.splat.Splat`. The `splat:` emit branch + `SplatFeature` + gradle dep
   shipped in 9143d58d6; this slice feeds that seam REAL content via the reusable transcode glue
   (`scripts/transcode-ply-to-spz.mts`, dogfoods engine GaussianPlyLoader + SpzCodec). Not test-only.

3. **Failing-if-broken evidence:** golden-diff (marketing worlds byte-match), `quest-world-emit-splat`
   unit test (5/5), transcode round-trip (passed), `pnpm --filter @holoscript/core build`. The cloud
   APK Kotlin compile is the unproven-local step (same as 9143) — but this commit adds NO new gradle
   dep (the dep already shipped in 9143), only a content asset + a world, so its build risk is strictly
   lower than 9143's.

4. **Scope + blast:** ADD `worlds/s23-capture.holo`, `assets/splats/s23-scene.spz` (2.1 MiB),
   `scripts/transcode-ply-to-spz.mts`; REGEN `WorldsRegistry.kt` + new `World_s23_capture.kt`.
   OUT OF SCOPE: the 3 marketing worlds + splat-test (must stay byte-unchanged — verified via git diff),
   gradle/dep/SplatFeature (already shipped). Regression: only if generate-native perturbs the
   marketing worlds — gated by the byte-diff check. Source `.ply` stays on the Jetson (not committed).
   Orientation/scale of the capture (COLMAP frame) may need a one-line tweak after the headset look.
