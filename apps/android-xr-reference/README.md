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

The gradle build harness is real and works end-to-end. With the local toolchain
(JDK 17 `C:\tools\jdk-17.0.19+10`, Gradle 8.9, Android SDK `C:\Android` + platform 35):

```bash
cd apps/android-xr-reference/android-xr
JAVA_HOME=/c/tools/jdk-17.0.19+10 ANDROID_HOME=/c/Android \
  /c/tools/gradle-8.9/bin/gradle assembleDebug --no-daemon --console=plain
```

resolves AGP 8.5.2, Kotlin 2.0.20, the Compose compiler plugin, Compose BOM, Filament, and
ARCore, then **fails at `:app:checkDebugAarMetadata`**:

```
> Could not find androidx.xr:xr:1.0.0-alpha01.
```

i.e. the build infra is sound; the **AndroidXR codegen emits non-buildable output**. Known
codegen defects to fix before a green APK (the next gate):

1. **Placeholder Maven coordinates** — `androidx.xr.scenecore:scenecore:1.0.0-alpha01`,
   `androidx.xr.compose:compose:1.0.0-alpha01`, `androidx.xr.arcore:arcore:1.0.0-alpha01`,
   `androidx.xr:xr:1.0.0-alpha01` are not published. Replace with the real Android XR SDK
   coordinates/versions (`AndroidXRGenerators.ts` `generateBuildGradle`).
2. **`Pose(Float3(...))` type mismatch** — `androidx.xr.runtime.math.Pose` takes `Vector3`, not
   filament `Float3`; the same file mixes both. (`AndroidXRGenerators.ts` node factory + scene.)
3. **Mixed ARCore APIs** — `com.google.ar.core.Config` used as a Jetpack XR `scene.configure`.
4. **`package=` in `AndroidManifest.xml`** — removed in AGP 8 (namespace lives in build.gradle).
5. **Geometry is a dead comment** (`// Geometry: BoxShape` even for a sphere) — never attached
   to the entity.

Until those are fixed, do NOT add a `gradle assembleDebug` CI workflow (it would be red). The
golden-diff gate + vitest twin are the live gates today.
