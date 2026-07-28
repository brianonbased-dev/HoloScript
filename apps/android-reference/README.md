# Android (ARCore) reference app

Golden reference for the `compile_to_android` target (legacy **plain-Android / ARCore**, phone-AR
form factor). This is the second half of the Android `.kt` build-verify setup — the counterpart of
the Android-XR `apps/android-xr-reference/` reference. It lifts the legacy Android Kotlin target
toward the **Quest / Android-XR standard**: a golden-diff gate over a committed reference, plus a
real `gradle assembleDebug` build harness.

> **Not Android XR, not Quest.** Google's Jetpack XR (headset) is `compile_to_android_xr`
> (`apps/android-xr-reference/`, `androidx.xr.*`). Meta Quest/Horizon is `compile_to_quest`
> (`apps/quest-universal-qr-scanner`, Meta Spatial SDK). **This** target is plain phone-AR via
> **SceneView 4.18.0** (`io.github.sceneview:arsceneview`, Apache 2.0 — Compose-native ARScene over
> Filament + ARCore), the maintained successor to the EOL Sceneform fork.

## Layout

| Path                                                                                                                  | What                                                                          | Authored / generated        |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------- |
| `scene.holo`                                                                                                          | the HoloScript composition (source of truth)                                  | **author this**             |
| `compile-config.mts`                                                                                                  | package/class constants shared by generator + gate                            | author                      |
| `generate-native.mts`                                                                                                 | parses `scene.holo`, runs `AndroidCompiler.compileToFiles`, writes `android/` | author                      |
| `android/app/src/**`, `android/app/{build.gradle.kts,AndroidManifest.xml}`                                            | **@generated** Kotlin + module gradle/manifest                                | generated — never hand-edit |
| `android/{settings,build}.gradle.kts`, `gradle.properties`, `gradlew*`, `gradle/wrapper/**`, `app/proguard-rules.pro` | hand-maintained build scaffold                                                | author                      |

## Edit → regenerate → gate

```bash
# 1. edit scene.holo
# 2. regenerate the @generated Kotlin
npx tsx apps/android-reference/generate-native.mts
# 3. prove no drift (also runs in pre-commit Gate 5e-and and as a vitest twin in `pnpm test`)
npx tsx scripts/holo-ci/check-android-emit-matches-reference.mts
# negative self-test — proves the gate itself goes red on drift:
npx tsx scripts/holo-ci/check-android-emit-matches-reference.mts --self-test
```

Hand-editing a generated `.kt` (instead of `scene.holo`) makes the gate go red. This is the
W.783 doctrine: **gate the emitter BEFORE fixing its output**, so codegen-correctness work is
drift-controlled.

## Build status — GREEN (golden-diff + real gradle build + on-device, 2026-06-21)

`compile_to_android` was **retargeted off the EOL Sceneform fork onto SceneView 4.18.0** (Apache 2.0,
Compose-native ARScene over Filament + ARCore). The base render path is proven GREEN end-to-end:

1. ✅ **golden-diff** — `check-android-emit-matches-reference.mts`: the emitter byte-matches `android/`.
2. ✅ **build-verify** — `check-android-build-verify.mts --require-toolchain`: a real
   `gradle assembleDebug` over a fresh copy of the emit produces `app-debug.apk`.
3. ✅ **on-device** — the APK installs and runs a live ARCore session (camera + IMU frames, Filament
   renderer) on a Galaxy S23 Ultra, no crash.

With the local toolchain (JDK 17 `C:\tools\jdk-17.0.19+10`, the committed gradle wrapper, Android SDK
`C:\Android` + platform 36; AGP 8.9.1, Kotlin 2.3.21, Gradle 8.11.1 in the root scaffold):

```bash
cd apps/android-reference/android
JAVA_HOME=/c/tools/jdk-17.0.19+10 ANDROID_HOME=/c/Android ./gradlew assembleDebug --no-daemon
# or the gate (probe-gated, builds when the toolchain is present):
JAVA_HOME=... ANDROID_HOME=... npx tsx scripts/holo-ci/check-android-build-verify.mts --require-toolchain
```

The emit is a Compose `ComponentActivity` hosting a declarative SceneView `ARScene { }` with one node
composable (`CubeNode` / `SphereNode` / `CylinderNode`) per HoloScript object — **no ArFragment, no
R.layout, no NodeFactory, no SceneState ViewModel** (SceneView's declarative model dissolves them).

### Wave 2 — feature traits not yet ported to SceneView

The feature-trait emitters in `AndroidFeatureGenerators` / `AndroidPeripheralGenerators` (geo-anchor,
geospatial VPS, depth scan, portal AR, hand tracking, authoring, haptic, nearby, foldable, DeX, lens,
WebXR) are still Sceneform-coupled — they emitted into the old AppCompatActivity and were never
buildable. The new Compose activity does not wire them, and the base `build.gradle.kts` drops their
conditional deps. Porting each to SceneView (one device-proven reference per feature) is a tracked
wave-2 effort on the HoloMesh board. The Android-side feature test suites were removed/quarantined
accordingly; the iOS halves (IOSCompiler) are unaffected.

## Context

- Reference impl (Android-XR): `apps/android-xr-reference/`, commit `c2e5bcb43`.
- `ai-ecosystem/research/2026-06-20_android-xr-build-verify-gate.md`, MEMORY W.802/W.803, F.126
  (validation IS construction), W.783 (gate before fixing emit).
