# Universal QR Scanner — Meta Quest 3 / 3S

The Quest can't natively scan arbitrary QR codes (Meta restricts native scanning to WiFi
provisioning). This app fills that gap: launch it, point the headset's passthrough cameras at
any QR code, and it decodes the value and opens URLs in the Quest Browser.

First HoloScript-authored app targeting a major XR store. Source of truth is
[`scanner.holo`](./scanner.holo); the Android project under [`android/`](./android) is the
materialization. Origin + full build record:
`ai-ecosystem/research/2026-06-19_universal-qr-scanner-quest-build.md`.

## How it works
- **2D panel app** (not an immersive VR scene). Runs in the Quest windowed environment.
- **Passthrough camera** via standard Android **Camera2** (Meta exposes the headset cameras as
  logical Camera2 devices). Selects the forward passthrough RGB camera using Meta's vendor
  `CameraCharacteristics` (`com.meta.extra_metadata.camera_source==0`, `position==0`).
- **Decode** on the YUV Y (luminance) plane with **ZXing core** (`com.google.zxing:core:3.5.3`) —
  GMS-free, because Quest/Horizon OS has no Google Play Services (ML Kit unbundled would not work).
- **Open URL** in the Quest Browser via the documented Web Task scheme:
  `ovrweb://webtask?uri=<url-encoded-url>` (plain `https` `ACTION_VIEW` is *not* the Quest path).
- **Privacy**: frames are decoded on-device; nothing is stored or transmitted.

## Requirements
- Quest 3 / 3S on **Horizon OS v76+** (Camera2 passthrough code path).
- The user grants the `Headset cameras` permission on first run (system-enforced opt-in + a
  persistent recording indicator while scanning — do not attempt to suppress it).

## Build

### Option A — Cloud build (recommended; no local toolchain)
A GitHub Actions workflow is committed at
`.github/workflows/quest-qr-scanner-build.yml`. It builds the release APK and uploads it as an
artifact. To get a **signed** APK, add these repo secrets (base64 your keystore):

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | `base64 -w0 release.keystore` |
| `KEY_ALIAS` | your key alias (e.g. `quest_qr`) |
| `KEYSTORE_PASSWORD` | keystore password |
| `KEY_PASSWORD` | key password |

Trigger it from the Actions tab (`workflow_dispatch`) or by pushing a change under
`apps/quest-universal-qr-scanner/**`. Without the secrets it still builds an **unsigned** release APK.

### Option B — Local build
Requires JDK 17, Android SDK (Build-Tools 34+, Platform 34). Then:
```bash
cd android
node ../generate.mjs                  # refresh spec-driven resources
gradle wrapper --gradle-version 8.9   # one-time: create the gradle wrapper jar
cp keystore.properties.example keystore.properties   # then edit with your keystore (gitignored)
./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

### Signing — generate a keystore once
```bash
keytool -genkeypair -v -keystore release.keystore -alias quest_qr \
        -keyalg RSA -keysize 2048 -validity 10000
```
Keep `release.keystore` safe — it is the app's identity on the store. Never commit it (`.gitignore`
already excludes `*.keystore`, `*.jks`, and `keystore.properties`).

## Install on a Quest (sideload, for testing)
```bash
adb install -r app-release.apk
# launch it from the headset's app library (Unknown Sources)
```

## Publish to the Meta Horizon Store
1. Create a developer **organization** at the Meta Horizon Developer Dashboard and complete
   **Admin Verification** (government-issued ID — an individual can publish this way; no DUNS, no
   documented fee).
2. Host a **Privacy Policy** URL (template: app decodes QR codes on-device using the headset
   camera; no frames stored or transmitted) — required because the app accesses the camera.
3. Create an app, upload the **signed APK** (Horizon Store takes APK; AAB is not documented as
   accepted). Target SDK ≥ 32, min SDK 34.
4. Push to an **ALPHA / BETA release channel** first (invite-only, low friction) to validate
   on-device, then promote to **Production** (triggers full app review).

## Changing app config
Edit [`scanner.holo`](./scanner.holo), then `node generate.mjs`. That rewrites
`android/app/src/main/res/values/generated.xml` (app name, privacy note, frame size, camera
selection, dedupe window, webtask scheme), which the Kotlin reads at runtime.
