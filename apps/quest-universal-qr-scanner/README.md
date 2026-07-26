# HoloQR - Universal QR Scanner for Meta Quest

HoloQR fills a gap in Quest: it scans arbitrary QR codes through the headset passthrough cameras,
decodes them on-device, opens ordinary links in Quest Browser, and enters HoloScript worlds from
world links.

This is a HoloScript-authored app, not a native app with a HoloScript label. The source of truth is
[`scanner.holo`](./scanner.holo) plus [`worlds/`](./worlds). The immersive Quest project under
[`android-mr/`](./android-mr) is compiler output and a bounded native bridge for platform APIs.

## Release invariant

The only supported shipping path is:

```text
scanner.holo + worlds/*.holo
  -> HoloCompositionParser + QuestCompiler
  -> generated android-mr sources
  -> independent golden-diff verification
  -> signed Gradle release APK
```

The release command runs that entire source gate before it resolves signing secrets or invokes
Gradle. A direct `gradlew assembleRelease` can be useful during native debugging, but it is not a
shipping command because it does not prove the APK came from the current HoloScript source.

## How it works

- Camera frames come from Quest's Android Camera2 passthrough path.
- ZXing decodes the YUV luminance plane locally; Google Play Services are not required.
- Ordinary URLs open in the full Quest Browser, with the Web Task scheme as a fallback.
- HoloScript world links enter compiler-generated immersive scenes.
- Camera frames are not stored or transmitted.

## Requirements

- Meta Quest 3 or 3S on a Horizon OS version that exposes passthrough Camera2 access.
- JDK 17 and the Android SDK for local native builds.
- The user-granted `Headset cameras` permission.

## Build

Run these commands from the HoloScript repository root:

```bash
pnpm holoqr:generate-native
pnpm check:holoqr-born-from-source
pnpm holoqr:build-release
```

- `holoqr:generate-native` materializes the Quest app from HoloScript.
- `check:holoqr-born-from-source` compiles and independently verifies the native reference without
  accessing signing custody or running Gradle.
- `holoqr:build-release` runs the same gate, then resolves signing custody and builds the signed APK.

The signed artifact is written to:

```text
apps/quest-universal-qr-scanner/android-mr/app/build/outputs/apk/release/app-release.apk
```

See [`RELEASE.md`](./RELEASE.md) for HoloKey signing custody, Meta validation, and store submission.

## Install on a Quest

For a sideloaded test build:

```bash
adb install -r apps/quest-universal-qr-scanner/android-mr/app/build/outputs/apk/release/app-release.apk
```

Install through an ALPHA or BETA release channel before public submission when validating the exact
store-signed artifact.

## Change the app

Edit [`scanner.holo`](./scanner.holo) or a world under [`worlds/`](./worlds), then run:

```bash
pnpm holoqr:generate-native
pnpm check:holoqr-born-from-source
```

Never hand-edit compiler-owned files under `android-mr/`. Native bridge files should contain only
platform capabilities that the HoloScript compiler/runtime cannot yet express, and each such bridge
is an explicit language gap rather than a second product source of truth.
