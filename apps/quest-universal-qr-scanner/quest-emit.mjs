// quest-emit.mjs — HoloScript → Meta Quest app emitter (incremental codegen backend).
//
// SINGLE SOURCE OF TRUTH for what `compile_to_quest` emits. The golden-diff gate
// (scripts/holo-ci/check-quest-emit-matches-reference.mjs) runs this and FAILS CI on any drift
// between an emitted file and the committed reference app. Files flip 'reference' → 'emitted'
// one at a time, smallest first; each is only 'emitted' once its output byte-matches the
// hand-authored reference. This is the drift guard the pre-mortem mandated before emitting Kotlin.
//
// NOTE: this is the interim Node home for the emitter. It will be ported into the in-core
// QuestCompiler (packages/core) behind the same gate — the gate is emitter-location-agnostic.
import { readFileSync } from 'node:fs';

// The full reference app, with per-file emit status. 'emitted' = the emitter produces it and the
// gate enforces a byte match. 'reference' = still hand-authored (golden), not yet emitted.
export const GOLDEN_MANIFEST = [
  { path: 'android/app/src/main/res/values/generated.xml', status: 'emitted' },
  { path: 'android/app/src/main/java/net/holoscript/qrscanner/QrDecoder.kt', status: 'emitted' },
  { path: 'android/app/src/main/AndroidManifest.xml', status: 'reference' },
  { path: 'android/app/build.gradle.kts', status: 'reference' },
  { path: 'android/build.gradle.kts', status: 'emitted' },
  { path: 'android/settings.gradle.kts', status: 'emitted' },
  { path: 'android/app/src/main/res/values/themes.xml', status: 'emitted' },
  { path: 'android/app/src/main/res/layout/activity_main.xml', status: 'emitted' },
  { path: 'android/app/src/main/res/drawable/ic_launcher.xml', status: 'emitted' },
  { path: 'android/app/src/main/java/net/holoscript/qrscanner/MainActivity.kt', status: 'reference' },
  { path: 'android/app/src/main/java/net/holoscript/qrscanner/PassthroughCameraController.kt', status: 'reference' },
];

function parseSpec(specText) {
  const str = (k, d) => (specText.match(new RegExp(`${k}\\s*:\\s*"([^"]*)"`)) || [, d])[1];
  const int = (k, d) => {
    const m = specText.match(new RegExp(`${k}\\s*:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : d;
  };
  return {
    app_name: str('display_name', 'Universal QR Scanner'),
    privacy_note: str('privacy_note', 'Frames are decoded on-device. Nothing is stored or sent.'),
    webtask_scheme: /kind:\s*"quest_web_task"/.test(specText) ? 'ovrweb://webtask?uri=' : '',
    dedupe_window_ms: int('dedupe_window_ms', 2500),
    frame_width: int('width', 1280),
    frame_height: int('height', 960),
    camera_source: int('camera_source', 0),
    camera_position: int('position', 0),
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function emitGeneratedXml(cfg) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- @generated from scanner.holo by generate.mjs — DO NOT EDIT. Run: node generate.mjs -->
<resources>
    <string name="app_name">${esc(cfg.app_name)}</string>
    <string name="privacy_note">${esc(cfg.privacy_note)}</string>
    <string name="webtask_scheme">${esc(cfg.webtask_scheme)}</string>
    <integer name="dedupe_window_ms">${cfg.dedupe_window_ms}</integer>
    <integer name="frame_width">${cfg.frame_width}</integer>
    <integer name="frame_height">${cfg.frame_height}</integer>
    <integer name="camera_source">${cfg.camera_source}</integer>
    <integer name="camera_position">${cfg.camera_position}</integer>
</resources>
`;
}

// Static Kotlin file (no spec-driven config) — emitted verbatim; the golden gate enforces it
// byte-matches the reference. First Kotlin file flipped reference→emitted (smallest first).
function emitQrDecoderKt() {
  return `package net.holoscript.qrscanner

import com.google.zxing.BinaryBitmap
import com.google.zxing.ChecksumException
import com.google.zxing.DecodeHintType
import com.google.zxing.FormatException
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader

/**
 * ZXing QR decode from a Y (luminance) plane. Pure-Java, GMS-free (Quest has no Play Services).
 *
 * No dedupe/throttle here — the controller owns scan cadence and cooldown. [tryHarder] is off for
 * the cheap idle "sense" pass and on for the full-resolution read once a QR is sensed.
 */
class QrDecoder {
    private val reader = QRCodeReader()

    fun decode(yPlane: ByteArray, width: Int, height: Int, tryHarder: Boolean): String? {
        val source = PlanarYUVLuminanceSource(yPlane, width, height, 0, 0, width, height, false)
        val bitmap = BinaryBitmap(HybridBinarizer(source))
        val hints: Map<DecodeHintType, Any> =
            if (tryHarder) mapOf(DecodeHintType.TRY_HARDER to true) else emptyMap()
        return try {
            reader.decode(bitmap, hints).text
        } catch (e: NotFoundException) {
            null
        } catch (e: ChecksumException) {
            null
        } catch (e: FormatException) {
            null
        } finally {
            reader.reset()
        }
    }
}
`;
}

function emitSettingsGradle() {
  return `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "UniversalQrScanner"
include(":app")
`;
}

function emitRootBuildGradle() {
  return `// Root build file — Universal QR Scanner (Meta Quest 3 / 3S)
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
`;
}

function emitThemesXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.UniversalQrScanner" parent="android:Theme.DeviceDefault.NoActionBar" />
</resources>
`;
}

function emitIcLauncherXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#101418" android:pathData="M0,0h108v108h-108z" />
    <!-- QR finder squares + a few modules -->
    <path android:fillColor="#9FE2BF" android:pathData="M18,18h28v28h-28z M26,26h12v12h-12z" android:fillType="evenOdd" />
    <path android:fillColor="#9FE2BF" android:pathData="M62,18h28v28h-28z M70,26h12v12h-12z" android:fillType="evenOdd" />
    <path android:fillColor="#9FE2BF" android:pathData="M18,62h28v28h-28z M26,70h12v12h-12z" android:fillType="evenOdd" />
    <path android:fillColor="#FFFFFF" android:pathData="M62,62h8v8h-8z M78,62h8v8h-8z M70,70h8v8h-8z M62,78h8v8h-8z M78,78h8v8h-8z" />
</vector>
`;
}

function emitActivityMainXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center"
    android:padding="36dp"
    android:background="#101418">

    <TextView
        android:id="@+id/status"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:textColor="#9FE2BF"
        android:textSize="20sp"
        android:gravity="center" />

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="@string/privacy_note"
        android:textColor="#5A6470"
        android:textSize="13sp"
        android:gravity="center"
        android:paddingTop="24dp" />
</LinearLayout>
`;
}

// path → emit function, for every file currently marked 'emitted'.
const EMITTERS = {
  'android/app/src/main/res/values/generated.xml': emitGeneratedXml,
  'android/app/src/main/java/net/holoscript/qrscanner/QrDecoder.kt': emitQrDecoderKt,
  'android/build.gradle.kts': emitRootBuildGradle,
  'android/settings.gradle.kts': emitSettingsGradle,
  'android/app/src/main/res/values/themes.xml': emitThemesXml,
  'android/app/src/main/res/layout/activity_main.xml': emitActivityMainXml,
  'android/app/src/main/res/drawable/ic_launcher.xml': emitIcLauncherXml,
};

/** Returns { relpath: content } for every currently-EMITTED file, derived from the spec. */
export function emitQuestFiles(specPath) {
  const cfg = parseSpec(readFileSync(specPath, 'utf8'));
  const out = {};
  for (const f of GOLDEN_MANIFEST) {
    if (f.status !== 'emitted') continue;
    const fn = EMITTERS[f.path];
    if (!fn) throw new Error(`No emitter registered for 'emitted' file: ${f.path}`);
    out[f.path] = fn(cfg);
  }
  return out;
}
