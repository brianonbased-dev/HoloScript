# HoloRead — Real-World Text Reader for Meta Quest

HoloRead turns practical text in the physical world into a first-class Quest input. Aim the
passthrough camera at a sign, menu, label, whiteboard, or monitor; request one recognition pass;
then enlarge, copy, or hear the result.

The product source of truth is [`reader.holo`](./reader.holo) plus
[`reader-lifecycle.hsplus`](./reader-lifecycle.hsplus). `QuestCompiler` lowers those programs into
the generated project under `android-mr/`. The Kotlin is a bounded bridge to Camera2, bundled ML
Kit OCR, Android text-to-speech/clipboard, and Meta Spatial SDK; it is not a second product source.

## First tracer slice

- Audience: Quest 3/3S owners who need to use real-world text without removing the headset.
- Must have: explicit camera enablement, one-shot local OCR, targeting preview, magnification,
  copy, listen, and retry.
- Non-goals: translation, cloud AI, background capture, saved scans, navigation assistance, and
  claims about small-text accuracy before headset measurement.
- Privacy contract: bundled on-device model, no network permission, no frame or text persistence,
  no recognized-value logging.
- Go/no-go evidence: the generated APK must run on Quest 3 and read a practical printed-text test
  chart. Fine-print or blurred-text failure remains an optical boundary, not a software success.

## Build

From the HoloScript repository root:

```powershell
pnpm holoread:generate-native
pnpm check:holoread-born-from-source
pnpm holoread:build-debug
pnpm holoread:build-release -- --source-gate-only
```

`holoread:build-debug` requires JDK 17 and Android SDK 34 through `JAVA_HOME` and `ANDROID_HOME`.
It re-runs the source gate before invoking Gradle. The debug APK is:

```text
apps/quest-real-world-reader/android-mr/app/build/outputs/apk/debug/app-debug.apk
```

The release command runs the same source gate before resolving signing custody or invoking Gradle.
Omitting `--source-gate-only` requires the existing HoloKey-backed Android signing material and
produces the signed, minified release APK locally; it does not upload anything.

## Hardware spike

Install the exact generated APK, enable `Headset cameras`, and test large/medium/small printed
text, a menu, a product label, a whiteboard, and a monitor. Record what was actually readable,
end-to-end latency, mechanical behavior, and the operator result. Do not call the app
headset-approved from a build or launch alone. Current device evidence and the pending physical
review are recorded in [`HARDWARE_VALIDATION.md`](./HARDWARE_VALIDATION.md).
