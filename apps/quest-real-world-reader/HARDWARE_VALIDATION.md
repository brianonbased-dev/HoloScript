# HoloRead Quest 3 validation

## Version 0.2 host release evidence

Date: 2026-07-28

Package: `net.holoscript.holoread`

Version: `0.2.0` (`versionCode=2`)

- The born-from-source gate byte-matched all 17 emitted files; all 10 Kotlin source and test files
  are compiler output with no alternate native source.
- The HoloRead compiler and vocabulary suites passed 18 tests.
- The Android `ContextEngineTest` suite passed two tests.
- The scoped `@holoscript/core` build passed.
- Gradle assembled a signed, minified release APK after the source gate.
- APK: `android-mr/app/build/outputs/apk/release/app-release.apk`
- APK SHA-256: `AD4745B915989C12EDAE7070DC75EA5F8378748B80D5A0778F76BD629C1B8DBD`
- APK size: 97,748,718 bytes.
- `apksigner verify --verbose --print-certs`: PASS using APK Signature Scheme v2; one signer.
- Merged manifest: headset camera, optional hand tracking, `INTERNET`, and
  `ACCESS_NETWORK_STATE` are present. Storage and media-read permissions are absent;
  `allowBackup=false` and `usesCleartextTraffic=false`.
- Static security review found no custom hostname verifier, embedded WebView, app-owned HTTP
  client, recognized-text logging, or frame/text file output.
- The repository-wide core test command remained baseline-red after its dependency build pass:
  unrelated runtime suites cannot resolve optional `@holoscript/engine`,
  `@holoscript/openusd-plugin`, and `@holoscript/platform` peers, and the daemon suite times out
  behind the missing platform artifact. The HoloRead-scoped suites, strict core typecheck, and
  core build are green.

Headset install and the new context/source/translation interaction pass are **PENDING** for 0.2.0:
ADB did not expose a connected device during this host build. Do not promote the 0.1.0 headset
result below into a 0.2.0 hardware claim.

## Version 0.1 headset evidence

Date: 2026-07-26

Device: Meta Quest 3 (`2G0YC5ZG03033W`), Android 14 / API 34

Package: `net.holoscript.holoread`

Version: `0.1.0` (`versionCode=1`)

## Automated and host-operated evidence

- `pnpm check:holoread-born-from-source`: PASS. A fresh compile of `reader.holo` and
  `reader-lifecycle.hsplus` byte-matched all 13 emitted files; all six Kotlin product files were
  compiler output with no alternate native source.
- `pnpm holoread:build-release`: PASS. Gradle assembled a signed and minified release APK after the
  source gate.
- APK: `android-mr/app/build/outputs/apk/release/app-release.apk`
- APK SHA-256: `8DF1442E3E1E1CCCD8A9005E52A38A618C93B3FDE87DB5CB001BE2E200687003`
- APK size: 79,406,206 bytes.
- `apksigner verify --verbose`: PASS using APK Signature Scheme v2; one signer.
- Merged manifest: headset camera and optional hand tracking are present. `INTERNET`,
  external-storage, and media-read permissions are absent.
- `adb install -r`: PASS.
- `am start -W -n net.holoscript.holoread/.ReaderActivity`: PASS, cold launch.
- Readback: HoloRead was the resumed activity with a live process and zero matching fatal,
  `SecurityException`, or `CameraAccessException` log lines.

The release bridge follows Meta's
[Passthrough Camera API requirements](https://developers.meta.com/horizon/documentation/unity/unity-pca-overview/)
for Quest 3/3S, Horizon OS 74+, Camera2, and `HEADSET_CAMERA`. OCR uses Google's
[bundled ML Kit text-recognition artifact](https://developers.google.com/ml-kit/vision/text-recognition/v2/android),
so recognition does not depend on Google Play Services or a first-run model download.

## Physical operator review

Status: **PENDING**

Required test:

1. Select **Enable camera** and approve headset-camera access.
2. Aim the center frame at large and medium practical text.
3. Select **Read text**.
4. Confirm the recognized text, retry behavior, magnification controls, copy, and listen actions.
5. Record the exact readable text or exact error below.

Operator result: pending.

Do not call HoloRead headset-approved until this section records the operator result. A successful
build, install, and launch proves the bridge but not passthrough optical legibility or OCR accuracy.

## Repository-wide boundary

The scoped core build and public-type test passed. The full recursive monorepo build later stopped
in the unrelated `@holoscript/alphafold-plugin` baseline configuration with `TS5096`
(`allowImportingTsExtensions` requires `noEmit` or `emitDeclarationOnly`). HoloRead does not import
or depend on that package.
