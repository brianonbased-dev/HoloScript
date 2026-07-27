# HoloRead Quest 3 validation

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
