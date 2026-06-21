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

## Build status — HARNESS GREEN, CODEGEN RED (the next gate)

The gradle build harness is real and works end-to-end up to project configuration. With the local
toolchain (JDK 17 `C:\tools\jdk-17.0.19+10`, Gradle 8.9, Android SDK `C:\Android` + platform 34):

```bash
cd apps/android-reference/android
JAVA_HOME=/c/tools/jdk-17.0.19+10 ANDROID_HOME=/c/Android \
  /c/tools/gradle-8.9/bin/gradle assembleDebug --no-daemon --console=plain
```

resolves AGP 8.5.2, Kotlin 2.0.20, forks the build daemon, and reaches `> Configure project :app`,
then **fails compiling `app/build.gradle.kts`**:

```
e: .../app/build.gradle.kts:5:8: Unexpected tokens (use ';' to separate expressions on the same line)
e: .../app/build.gradle.kts:5:5: Function invocation 'id(...)' expected
e: .../app/build.gradle.kts:5:5: No value passed for parameter 'id'
...
BUILD FAILED in 36s
```

i.e. the build infra is sound; the **AndroidCompiler codegen emits non-buildable output**. Known
codegen defects to fix before a green APK (the next gate — all in `AndroidARGenerators.ts`
`generateBuildGradle`/`generateManifestFile`, never in the generated files):

1. **Groovy DSL emitted into a `.kts` (Kotlin DSL) file** — `generateBuildGradle` emits
   `id 'com.android.application'` / `namespace 'net.holoscript.android'` / `implementation '...'`
   (single quotes, no `id(...)` call, no `version`). That is Groovy, but `compileToFiles` keys the
   output `app/build.gradle.kts`. Fix EITHER: (a) emit Kotlin DSL — `id("com.android.application")`,
   `namespace = "..."`, `implementation("...")`, `proguardFiles(getDefaultProguardFile("..."), "...")`,
   `JavaVersion.VERSION_17`, `jvmTarget = "17"` — OR (b) key the output `app/build.gradle` (Groovy)
   and adjust the scaffold/settings accordingly. The reference scaffold (root `build.gradle.kts` +
   `settings.gradle.kts`) is already Kotlin DSL, so emitting Kotlin DSL is the cleaner fix.
2. **`buildFeatures { compose true }` without the compose-compiler plugin** — on Kotlin 2.x, Compose
   requires the `org.jetbrains.kotlin.plugin.compose` plugin in the module `plugins {}` block. The
   emitter sets `compose true` but never declares the plugin (the root scaffold declares it
   `apply false`, so the emitter only needs to add the plugin id). Alternatively, drop `compose true`
   for the ARCore reference, which does not author any Compose UI.
3. **`package=` attribute in `AndroidManifest.xml`** (line 4) — removed in AGP 8; the application id /
   namespace now lives in `build.gradle` only. `generateManifestFile` must drop the `package="..."`
   attribute from the `<manifest>` element.
4. **Sceneform is deprecated** — `com.gorisse.thomas:sceneform:1.22.0` is a community-maintained fork
   (resolvable only via JitPack, which the scaffold `settings.gradle.kts` now adds). Prefer Filament
   (`AndroidCompilerOptions.useFilament`) for a future-proof reference; Sceneform is end-of-life.

Until those are fixed, do NOT add a `gradle assembleDebug` CI workflow (it would be red). The
golden-diff gate + vitest twin are the live gates today.

## Context

- Reference impl (Android-XR): `apps/android-xr-reference/`, commit `c2e5bcb43`.
- `ai-ecosystem/research/2026-06-20_android-xr-build-verify-gate.md`, MEMORY W.802/W.803, F.126
  (validation IS construction), W.783 (gate before fixing emit).
