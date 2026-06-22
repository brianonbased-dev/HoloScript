# Universal QR Scanner — Release Runbook (Meta Horizon Store)

The app is **signed-release ready**. Everything below the "Engineering: DONE" line is verified
on-device; the two **Founder-only** steps remain because they require your signing-key custody and
your Meta developer identity — neither can (or should) be done by an agent.

> Native principle (F.126): the app icon, `build.gradle.kts`, and `AndroidManifest.xml` are
> **`@generated` from `scanner.holo`** by the quest compiler. To change app metadata (version, icon
> colors, name), edit `scanner.holo` and recompile — never hand-edit `android-mr/`.

---

## Engineering: DONE ✅ (verified on-device, commit `1753203ca`)

- **App icon** — emitted `ic_launcher.xml` (HoloScript QR-glyph + holo-lens mark), wired as
  `android:icon`. Colors come from `scanner.holo` `environment.icon { background / qr_color / holo_color }`.
- **Release signing config** — `app/build.gradle.kts` reads the keystore from a **gitignored**
  `keystore.properties` (or env vars); debug builds still work with no keystore. No secret is ever committed.
- **Horizon manifest** — `supportedDevices = quest3|quest3s`, `PASSTHROUGH required=true`,
  `headtracking required=true`, `android:icon`, `excludeFromRecents=true`, VR launcher category,
  `HEADSET_CAMERA` permission, version from `scanner.holo` `environment.version { code / name }`.
- **Verified:** `assembleDebug` GREEN · `assembleRelease` GREEN → signed `app-release.apk` (~120 MB,
  under Horizon's 1 GB) · **v2 signature verified** (Horizon's requirement) · golden drift gate green.

Current version: `versionCode 1` / `versionName "1.0.0"` (bump both in `scanner.holo`'s `version` block
for each store re-upload — Horizon requires a strictly higher `versionCode` each time).

---

## Founder step 1 — Production signing keystore (custody)

The release key signs every present and future build. **If it is ever lost, you can NEVER ship an
update** — Meta has no key recovery (unlike Google Play). It is yours to own and back up.

**Option A (recommended for you): ask me to generate it.** I will run `keytool`, write the key to a
path you choose *outside* git, and put the path + a strong password ONLY into the gitignored
`keystore.properties` (never into chat or any committed/logged file). You then **back up that keystore
file + copy the password into your password manager.** That's the whole custody step.

**Option B (you run it yourself):**
```bash
keytool -genkeypair -v \
  -keystore holoscript-qrscanner-release.keystore \
  -alias holoscript-qrscanner \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Joseph Krzywoszyja, OU=HoloScript, O=HoloScript, L=YourCity, S=YourState, C=US"
```
Then create `apps/quest-universal-qr-scanner/android-mr/keystore.properties` (gitignored — verify
`git status` does NOT show it):
```properties
storeFile=C:/secure/path/holoscript-qrscanner-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=holoscript-qrscanner
keyPassword=YOUR_KEY_PASSWORD
```

**Back up the keystore to two secure locations. Record the passwords. Do not lose either.**

### Build the signed APK
```bash
cd apps/quest-universal-qr-scanner/android-mr
./gradlew :app:assembleRelease
# → app/build/outputs/apk/release/app-release.apk  (signed v2)
```

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
7. **Data Use questionnaire** — declare the passthrough camera: *"camera frames are processed on-device
   to decode QR codes; frames are not stored or transmitted."* A **Privacy Policy URL is required**
   (see `PRIVACY.md`).
8. **Submit for review** — Technical → Content → Publishing. Submit ≥ 2 weeks before any target date.

### Listing assets to provide (24-bit PNG unless noted)
- App icon **512×512** (no transparency) · Spatialized icon **180×180** (transparent)
- Hero **3000×900** · Cover landscape **2560×1440** · square **1440×1440** · portrait **1008×1440** · mini **1080×360**
- Logo (transparent) up to **9000×1440** (32-bit)
- **5 screenshots** (no dupes) **2560×1440** — capture on-device from a BETA-channel install
- Trailer (optional, recommended): MP4 H.264/AAC, 1080p–2K, 30 s–2 min + a 2560×1440 cover
- Text: name, short + long descriptions, Privacy Policy URL, supported devices (Quest 3 / 3S), comfort rating, languages

I can produce the icon/cover/logo art set from the emitted `ic_launcher.xml` brand on request.

---

## Sources
Meta Horizon publishing docs (upload, manifest, signing, submit, asset guidelines, release channels)
— verified June 2026. Key facts: APK + v2 signing, `quest3|quest3s` supportedDevices, monotonic
`versionCode`, App-Lab-merged-into-Store.
