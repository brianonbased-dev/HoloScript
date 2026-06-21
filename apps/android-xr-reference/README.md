# Android XR reference app

Golden reference for the `compile_to_android_xr` target (Google **Jetpack XR / Android XR**,
headset form factor). This is the Android-XR counterpart of the Quest scanner's `android-mr/`
reference — it lifts the Android XR Kotlin target toward the **Quest standard**: a golden-diff
gate over a committed reference, plus a real `gradle assembleDebug` build harness.

> **Not Meta Quest.** Quest/Horizon is `compile_to_quest` (`apps/quest-universal-qr-scanner`,
> Meta Spatial SDK). This target is Google's Jetpack XR (`androidx.xr.*`).

## Layout

| Path | What | Authored / generated |
|---|---|---|
| `scene.holo` | the HoloScript composition (source of truth) | **author this** |
| `compile-config.mts` | package/activity constants shared by generator + gate | author |
| `generate-native.mts` | parses `scene.holo`, runs `AndroidXRCompiler.compileToFiles`, writes `android-xr/` | author |
| `android-xr/app/src/**`, `android-xr/app/{build.gradle.kts,AndroidManifest.xml}` | **@generated** Kotlin + module gradle/manifest | generated — never hand-edit |
| `android-xr/{settings,build}.gradle.kts`, `gradle.properties`, `gradlew*`, `gradle/wrapper/**`, `app/proguard-rules.pro` | hand-maintained build scaffold | author |

## Edit → regenerate → gate

```bash
# 1. edit scene.holo
# 2. regenerate the @generated Kotlin
npx tsx apps/android-xr-reference/generate-native.mts
# 3. prove no drift (also runs in pre-commit Gate 5e-axr and as a vitest twin in `pnpm test`)
npx tsx scripts/holo-ci/check-android-xr-emit-matches-reference.mts
# negative self-test — proves the gate itself goes red on drift:
npx tsx scripts/holo-ci/check-android-xr-emit-matches-reference.mts --self-test
```

Hand-editing a generated `.kt` (instead of `scene.holo`) makes the gate go red. This is the
W.783 doctrine: **gate the emitter BEFORE fixing its output**, so codegen-correctness work is
drift-controlled.

## Build status — HARNESS GREEN, CODEGEN RED (the next gate)

The gradle build harness is real and works end-to-end. Build via the committed wrapper, with the
local toolchain (JDK 17 `C:\tools\jdk-17.0.19+10`, Android SDK `C:\Android` + **platform 36**;
the wrapper downloads gradle 8.11.1):

```bash
cd apps/android-xr-reference/android-xr
JAVA_HOME=/c/tools/jdk-17.0.19+10 ANDROID_HOME=/c/Android \
  ./gradlew assembleDebug --no-daemon --console=plain
```

**Status (2026-06-20): dependencies + toolchain FIXED; the build now reaches Kotlin compilation.**
It resolves the real `androidx.xr.{scenecore,compose,arcore,runtime}:1.0.0-alpha15` coordinates
(verified against Google Maven; the old `androidx.xr:xr` was a non-existent artifact), passes
`:app:checkDebugAarMetadata` (compileSdk 36 / AGP 8.9.1 / gradle 8.11.1, all required by the alpha15
libs), and **fails at `:app:compileDebugKotlin`** with **41 errors** — the emitted Kotlin targets a
wrong/speculative SceneCore API.

### Remaining gate: SceneCore alpha15 API rewrite (the emitter, `AndroidXRGenerators.ts`)

~8 distinct API concepts are wrong (do NOT hand-edit the generated `.kt` — fix the emitter, then
re-run `generate-native.mts`). Each MUST be verified against the real alpha15 API, not guessed:

1. **`Session` type/location** (8 errs) — emitted `androidx.xr.scenecore.Session`; in alpha15 the
   session lives elsewhere (`androidx.xr.runtime.Session` family). Verify the real type + factory.
2. **`session.scene` model** (12 errs) — the scene/entity-parent access (`scene`, `activitySpace`,
   `createEntity`) does not match alpha15. Verify the real scene + entity-creation API.
3. **`Quaternion.identity()`** (7 errs) — should be the `Quaternion.Identity` property, not a call.
4. **`Pose(Float3(...))`** (3 errs) — `Pose` takes `androidx.xr.runtime.math.Vector3`, not filament
   `Float3` (node factory + scene + `toKotlinFloat3` usage).
5. **Mixed classic-ARCore `Config`** — `planeFindingMode`/`lightEstimationMode`/`depthMode`/
   `updateMode` are `com.google.ar.core.Config`; Jetpack XR uses a different session config. Remove/replace.
6. **`HandNode`** — does not exist; remove the speculative hand-input scaffold.
7. **`GltfModel.create` is a `suspend fun`** — must be called from a coroutine.
8. **Geometry is a dead comment** (`// Geometry: BoxShape` even for a sphere) — never attached.

Until the build is green, do NOT add a `gradle assembleDebug` CI workflow (it would be red). The
golden-diff gate + vitest twin are the live gates today. The full error log: capture with the build
command above. Board task: `task_1781992603676_l7g7`.
