# Android XR Reference App

Golden reference for the `compile_to_android_xr` target, Google's Jetpack XR / Android XR
headset form factor. This is the Android XR counterpart of the Quest scanner's `android-mr/`
reference: a golden-diff gate over committed generated output plus a real Gradle
`assembleDebug` build harness.

> Not Meta Quest. Quest/Horizon is `compile_to_quest`
> (`apps/quest-universal-qr-scanner`, Meta Spatial SDK). This target is Google's Jetpack XR
> (`androidx.xr.*`).

## Layout

| Path                                                                                                                     | What                                                                               | Authored / Generated       |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------- |
| `scene.holo`                                                                                                             | HoloScript composition source of truth                                             | author                     |
| `compile-config.mts`                                                                                                     | package/activity constants shared by generator and gates                           | author                     |
| `generate-native.mts`                                                                                                    | parses `scene.holo`, runs `AndroidXRCompiler.compileToFiles`, writes `android-xr/` | author                     |
| `android-xr/app/src/**`, `android-xr/app/{build.gradle.kts,AndroidManifest.xml}`                                         | generated Kotlin plus module Gradle/manifest                                       | generated, never hand-edit |
| `android-xr/{settings,build}.gradle.kts`, `gradle.properties`, `gradlew*`, `gradle/wrapper/**`, `app/proguard-rules.pro` | build scaffold                                                                     | author                     |

## Edit, Regenerate, Gate

```bash
# 1. edit scene.holo
# 2. regenerate the generated Kotlin
npx tsx apps/android-xr-reference/generate-native.mts
# 3. prove no drift
npx tsx scripts/holo-ci/check-android-xr-emit-matches-reference.mts
# negative self-test: proves the gate detects drift
npx tsx scripts/holo-ci/check-android-xr-emit-matches-reference.mts --self-test
```

Hand-editing a generated `.kt` instead of `scene.holo` makes the gate go red. This is the
W.783 doctrine: gate the emitter before fixing its output, so codegen-correctness work is
drift-controlled.

## Build Status

The Gradle build harness is real and works end-to-end. Build via the committed wrapper with
JDK 17, Android SDK platform 36, AGP 8.9.1, and Gradle 8.11.1:

```bash
cd apps/android-xr-reference/android-xr
JAVA_HOME=/c/tools/jdk-17.0.19+10 ANDROID_HOME=/c/Android \
  ./gradlew assembleDebug --no-daemon --console=plain
```

Status on 2026-06-21: generated Kotlin builds. The compiler targets the real Jetpack XR
surface used by the resolved dependencies: `androidx.xr.runtime.Session`, runtime `Config`,
SceneCore `Entity.create(...)`, `Vector3` poses/scales, `Quaternion.Identity`, and suspend-safe
glTF loading in `XRNodeFactory`. The reference scene reaches `:app:assembleDebug` successfully.

The active CI/fleet gate is HoloCI, not GitHub Actions:

```bash
JAVA_HOME=/c/tools/jdk-17.0.19+10 ANDROID_HOME=/c/Android \
  npx tsx scripts/holo-ci/check-android-xr-build-verify.mts --require-toolchain
```

That gate writes freshly emitted compiler output over a throwaway copy of this Gradle skeleton
and runs `assembleDebug`, so it proves the compiler output builds rather than only proving the
checked-in reference app builds.
