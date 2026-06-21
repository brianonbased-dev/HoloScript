# Android (ARCore) reference app

Golden reference for the `compile_to_android` target (legacy **plain-Android / ARCore**, phone-AR
form factor). This is the second half of the Android `.kt` build-verify setup — the counterpart of
the Android-XR `apps/android-xr-reference/` reference. It lifts the legacy Android Kotlin target
toward the **Quest / Android-XR standard**: a golden-diff gate over a committed reference, plus a
real `gradle assembleDebug` build harness.

> **Not Android XR, not Quest.** Google's Jetpack XR (headset) is `compile_to_android_xr`
> (`apps/android-xr-reference/`, `androidx.xr.*`). Meta Quest/Horizon is `compile_to_quest`
> (`apps/quest-universal-qr-scanner`, Meta Spatial SDK). **This** target is plain phone-AR ARCore
> (`com.google.ar:core` + Sceneform/Filament).

## Layout

| Path | What | Authored / generated |
|---|---|---|
| `scene.holo` | the HoloScript composition (source of truth) | **author this** |
| `compile-config.mts` | package/class constants shared by generator + gate | author |
| `generate-native.mts` | parses `scene.holo`, runs `AndroidCompiler.compileToFiles`, writes `android/` | author |
| `android/app/src/**`, `android/app/{build.gradle.kts,AndroidManifest.xml}` | **@generated** Kotlin + module gradle/manifest | generated — never hand-edit |
| `android/{settings,build}.gradle.kts`, `gradle.properties`, `gradlew*`, `gradle/wrapper/**`, `app/proguard-rules.pro` | hand-maintained build scaffold | author |

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

## Build status — DEPS + GRADLE GREEN; Kotlin/Sceneform codegen is the remaining gate

With the local toolchain (JDK 17 `C:\tools\jdk-17.0.19+10`, the committed gradle wrapper, Android SDK
`C:\Android` + platform 34):

```bash
cd apps/android-reference/android
JAVA_HOME=/c/tools/jdk-17.0.19+10 ANDROID_HOME=/c/Android ./gradlew assembleDebug --no-daemon
```

**Status (2026-06-21): the 4 gradle/dependency blockers are FIXED; the build now resolves all
dependencies and reaches `:app:compileDebugKotlin`.** Fixed in `AndroidARGenerators.ts`:

1. ✅ **Groovy→Kotlin DSL** — `generateBuildGradle` now emits valid Kotlin DSL (`id("...")`,
   `namespace = "..."`, `isMinifyEnabled = false`, `implementation("...")`, …).
2. ✅ **Compose-compiler plugin** — `id("org.jetbrains.kotlin.plugin.compose")` is now emitted when
   `useJetpackCompose` (the root scaffold supplies the version). The Activity does author Compose.
3. ✅ **`package=` removed** from `AndroidManifest.xml` (AGP 8; namespace lives in build.gradle).
4. ✅ **Real Sceneform coordinate** — `com.gorisse.thomas.sceneform:sceneform:1.23.0` (verified on
   Maven Central + JitPack); the old `com.gorisse.thomas:sceneform:1.22.0` did not exist.

### Remaining gate: Sceneform Kotlin-API codegen (19 errors, ARNodeFactory.kt + GeneratedARSceneActivity.kt)

~5 distinct issues in the emitted Kotlin (fix the emitter, not the generated files):
- **Missing `R.layout` / `R.id`** — the Activity references `R.layout.*` + `R.id.ar_fragment` but the
  emitter never emits the `res/layout/*.xml` resource (the ArFragment layout). Emit it.
- **`ModelRenderable` API** — `.thenAccept{}` (CompletableFuture) + `.material` don't resolve against
  Sceneform 1.23.0's surface. Verify the real `ModelRenderable.builder()` API.
- **`Vector3 *` operator** — `com.google.ar.sceneform.math.Vector3` has no Kotlin `times`/`*`
  operator; use `Vector3.multiply()` / `.scaled()`.
- **`anchor`** — unresolved reference.

> ⚠️ **Sceneform is end-of-life.** Google deprecated Sceneform in 2020; the Gorisse maintained fork
> (1.23.0) is itself archived. Grinding the emitter to produce correct Sceneform Kotlin is polishing
> a dead SDK. The strategic question (W.GOLD.002 — pour into sovereign, not bridge) is whether
> `compile_to_android` should instead retarget a current renderer (SceneView / Filament directly, or
> Jetpack XR) rather than complete the Sceneform path. Founder call.

Until the Kotlin codegen is green, do NOT add a `gradle assembleDebug` CI workflow (it would be red).
The golden-diff gate + `check-android-build-verify.mts` (skip-graceful) are the live gates.

## Context

- Reference impl (Android-XR): `apps/android-xr-reference/`, commit `c2e5bcb43`.
- `ai-ecosystem/research/2026-06-20_android-xr-build-verify-gate.md`, MEMORY W.802/W.803, F.126
  (validation IS construction), W.783 (gate before fixing emit).
