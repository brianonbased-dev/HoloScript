# Universal QR Scanner — Release Runbook (Meta Horizon Store)

The app is **signed-release ready**. Everything below the "Engineering: DONE" line is verified
on-device; the two **Founder-only** steps remain because they require your signing-key custody and
your Meta developer identity — neither can (or should) be done by an agent.

> Native principle (F.126): the app icon, `build.gradle.kts`, and `AndroidManifest.xml` are
> **`@generated` from `scanner.holo`** by the quest compiler. To change app metadata (version, icon
> colors, name), edit `scanner.holo` and recompile — never hand-edit `android-mr/`. The canonical
> signed-build command compiles `scanner.holo` plus `worlds/*.holo`, verifies the materialization
> independently, and only then accesses signing custody or invokes Gradle.

---

## Engineering: DONE ✅ (verified on-device, commit `1753203ca`)

- **App icon** — emitted `ic_launcher.xml` (HoloScript QR-glyph + holo-lens mark), wired as
  `android:icon`. Colors come from `scanner.holo` `environment.icon { background / qr_color / holo_color }`.
- **Release signing config** — `app/build.gradle.kts` reads the keystore from a **gitignored**
  `keystore.properties` (or env vars); debug builds still work with no keystore. No secret is ever committed.
- **Horizon manifest** — `supportedDevices = quest3|quest3s`, `PASSTHROUGH required=true`,
  `headtracking required=true`, `android:icon`, `excludeFromRecents=true`, VR launcher category,
  `HEADSET_CAMERA` permission, version from `scanner.holo` `environment.version { code / name }`.
- **64-bit only** — emitted gradle `ndk { abiFilters += "arm64-v8a" }` strips 32-bit/x86 native libs
  (VRC.Quest.Packaging.6; a 32-bit binary fails review).
- **Verified:** `assembleDebug` GREEN · `assembleRelease` GREEN → signed `app-release.apk` (~120 MB,
  under Horizon's 1 GB) · **v2 signature verified** · **APK contains only `lib/arm64-v8a`** · golden
  drift gate green.

> **Horizon developer app:** `1114952721709215` (already created in the dashboard — the upload target).

## Pre-submission VRC readiness (Meta Quest review)

Review runs **Technical → Content → Publishing**. Mandatory technical VRCs and our status:

| VRC               | Requirement                                    | Status                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packaging.2       | APK v2 signature                               | ✅ verified v2                                                                                                                                                                                     |
| Packaging.6       | 64-bit (arm64-v8a) only                        | ✅ fixed — arm64-only                                                                                                                                                                              |
| Packaging.1       | Manifest conforms (VR category, version)       | ✅ emitted                                                                                                                                                                                         |
| Packaging.5       | APK < 1 GB                                     | ✅ ~120 MB                                                                                                                                                                                         |
| Functional.14     | Passthrough app launches in passthrough        | ✅ `enablePassthrough(true)` on scene-ready                                                                                                                                                        |
| Functional.1 / 5  | No crashes; responds to head tracking          | ▶ playtest (BETA channel)                                                                                                                                                                          |
| Performance.1 / 3 | Hits refresh rate; graphics ≤ 4 s or VR loader | ▶ playtest (lightweight panel + passthrough)                                                                                                                                                       |
| Security.2        | Minimum permissions                            | ⚠ manifest declares `HAND_TRACKING`/`RENDER_MODEL` (Spatial-SDK starter inheritance) the scanner may not use — trim after a headset test confirms controller input still works; not a hard blocker |
| Security.1        | Entitlement check                              | ➖ **recommended, NOT required** — no Platform SDK integration needed                                                                                                                              |

**Founder/submission-side (not build):** Data Use Checkup (declare the passthrough camera — "frames decoded on-device, not stored/transmitted"), Content Guidelines, IARC age rating, and the listing assets. Use a **Release Channel (ALPHA/BETA)** to install on-headset with no review before the public submission.

Current version: `versionCode 1` / `versionName "1.0.0"` (bump both in `scanner.holo`'s `version` block
for each store re-upload — Horizon requires a strictly higher `versionCode` each time).

---

## Founder step 1 — Production signing keystore (custody, via HoloKey)

The release key signs every present and future build. **If it is ever lost, you can NEVER ship an
update** — Meta has no key recovery (unlike Google Play). It is yours to own and back up. The
signing secrets live in **HoloKey** (the wallet-keyed vault) — encrypted at rest, resolved at build
time — never in a plaintext file. `build-release.mjs` resolves them, materializes the keystore to a
private tmp file, builds, and **deletes the keystore after the build**.

### 1a. Generate the keystore (once, ever)

```bash
keytool -genkeypair -v \
  -keystore release.keystore \
  -alias quest_qr \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Joseph Krzywoszyja, OU=HoloScript, O=HoloScript, L=YourCity, S=YourState, C=US"
```

**Back up `release.keystore` to two secure locations (offline). Record the passwords.** HoloKey holds
the _operational_ copy; your offline backup is the custody master. Losing the HoloKey KEK ≠ losing the
keystore as long as that offline backup exists.

### 1b. Store the four secrets in HoloKey (once)

The vault needs a KEK + Postgres in env: `HOLOKEY_PROD_KEK_CURRENT` + `HOLOKEY_PROD_KEK_<ID>`
(`node scripts/holokey.mjs gen-kek` prints them) and `DATABASE_URL`.

```bash
node scripts/holokey.mjs set KEYSTORE_PASSWORD    '<store-password>'
node scripts/holokey.mjs set KEY_PASSWORD         '<key-password>'
node scripts/holokey.mjs set KEY_ALIAS            'quest_qr'
node scripts/holokey.mjs set ANDROID_KEYSTORE_B64 "$(base64 -w0 release.keystore)"
```

(I can run these for you secrets-safely — the values go only into the encrypted vault, never into chat
or a committed/logged file.) Secrets are owner-bound under `HOLOKEY_OWNER` (default `infra`); the build
must resolve under the same owner.

### 1c. Build the signed APK

```bash
# env: JAVA_HOME (JDK 17) + ANDROID_HOME, plus the HoloKey KEK + DATABASE_URL (so the vault is ON)
pnpm holoqr:build-release
# → android-mr/app/build/outputs/apk/release/app-release.apk  (signed v2)
```

`holoqr:build-release` first runs the real HoloCompositionParser and QuestCompiler over
`scanner.holo` and every bundled world, then runs the independent Quest golden-diff gate. A parser,
compiler, or generated-output mismatch blocks the build before signing secrets are resolved. For a
safe proof with no signing or Gradle, run `pnpm check:holoqr-born-from-source`.

After the source gate passes, `build-release.mjs` resolves the four secrets from HoloKey (or, if the
vault is OFF, from matching env vars
`KEYSTORE_PASSWORD`/`KEY_PASSWORD`/`KEY_ALIAS`/`ANDROID_KEYSTORE_B64`), writes the keystore to a
`0o600` temporary file, runs `gradlew assembleRelease`, and unlinks the temporary keystore. The
`android-mr/app/build.gradle.kts` file already reads `KEYSTORE_FILE` and the other values from env. A
plaintext `keystore.properties` still works as a local-only optional override but is gitignored and
unnecessary with HoloKey.

> Verified (2026-06-22): the full resolve → materialize → `assembleRelease` → v2-signed APK → cleanup
> chain builds GREEN on-device via the env-fallback path (same resolver code the vault uses).

---

## Founder step 2 — Horizon Store submission (your Meta account)

The upload is a public commitment under your developer identity, so it's yours. As of 2026 "App Lab"
is merged into the single Meta Horizon Store — every public title goes through review; there is no
review-skip path, but a clean utility passes the basic technical/content/privacy bar.

1. **developers.meta.com/horizon** → sign in with your developer account; finish org verification + payout/tax if needed.
2. **Create the app** (name = exactly as it will appear; platform = Meta Quest; category = utility).
3. **Upload build** → `app-release.apk`. The validator checks: APK (not AAB), arm64, v2 signing +
   `headtracking` feature, `versionCode` higher than any prior accepted build.
4. **Test first (recommended):** use a **Release Channel** (ALPHA/BETA/RC, invite-only, **no review**)
   to install on your headset and verify before public submission.
5. **Fill listing + declarations** (assets list below).
6. **IARC age-rating questionnaire** (in-dashboard).
7. **Data Use questionnaire** — declare the passthrough camera: _"camera frames are processed on-device
   to decode QR codes; frames are not stored or transmitted."_ A **Privacy Policy URL is required**
   (see `PRIVACY.md`).
8. **Submit for review** — Technical → Content → Publishing. Submit ≥ 2 weeks before any target date.

### Listing assets to provide (24-bit PNG unless noted)

- App icon **512×512** (no transparency) · Spatialized icon **180×180** (transparent)
- Hero **3000×900** · Cover landscape **2560×1440** · square **1440×1440** · portrait **1008×1440** · mini **1080×360**
- Logo (transparent) up to **9000×1440** (32-bit)
- **5 screenshots** (no dupes) **2560×1440** — capture on-device from a BETA-channel install
- Trailer (optional, recommended): MP4 H.264/AAC, 1080p–2K, 30 s–2 min + a 2560×1440 cover
- Text: name, short + long descriptions, Privacy Policy URL, supported devices (Quest 3 / 3S), comfort rating, languages

For agent-operated UI evidence:

```powershell
pnpm holoqr:capture-quest `
  -DeviceSerial <serial> `
  -OutputPath <file.png> `
  -BootstrapScrcpy
```

This captures HoloQR's live app-owned 1080x1080 panel and emits a receipt beside it. That proof
deliberately excludes the Quest compositor, passthrough, and native world entities. The five public
2560x1440 listing screenshots still require Meta Quest Developer Hub compositor capture; do not
upscale the panel receipt and call it a full in-headset screenshot.

I can produce the icon/cover/logo art set from the emitted `ic_launcher.xml` brand on request.

---

## Sources

Meta Horizon publishing docs (upload, manifest, signing, submit, asset guidelines, release channels)
— verified June 2026. Key facts: APK + v2 signing, `quest3|quest3s` supportedDevices, monotonic
`versionCode`, App-Lab-merged-into-Store.
