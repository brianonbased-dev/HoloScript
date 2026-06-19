/**
 * HoloScript → Meta Quest Compiler (production target `quest`).
 *
 * Emits a complete, native Meta Quest (Horizon OS) app project. Distinct from `android-xr`, which
 * targets GOOGLE Android XR (Jetpack XR `androidx.xr` / ARCore / Filament). `quest` targets META's
 * runtime: Camera2 passthrough (`horizonos.permission.HEADSET_CAMERA`), ZXing decode, the
 * `ovrweb://webtask` browser intent, Quest device targeting, and (later) the Meta Spatial SDK.
 *
 * SINGLE-SOURCE / DRIFT GUARD:
 *   `apps/quest-universal-qr-scanner` is the on-device-proven golden reference app. Two emitters
 *   reproduce it byte-for-byte from `scanner.holo`'s spec values:
 *     - dev/gate path  — `apps/quest-universal-qr-scanner/quest-emit.mjs` (pure Node), checked by
 *       the pre-commit gate `scripts/holo-ci/check-quest-emit-matches-reference.mjs`.
 *     - production path — THIS compiler, reached via `compile_to_quest` (ExportManager → MCP),
 *       checked by `__tests__/QuestCompiler.golden.test.ts` (byte-match vs the same reference).
 *   Both are anchored to the SAME reference, so neither can silently drift (pre-mortem keystone —
 *   a string-templater can't re-ship an already-fixed bug without a gate/test going red).
 *
 * CONFIG SOURCE: the 8 spec values (`scanner.holo` meta/source/decoder fields) map 1:1 onto
 * `QuestCompilerOptions`; the defaults below equal `scanner.holo`, so the default emit IS the
 * reference. Mapping a parsed `HoloComposition`'s fields onto these options (so an arbitrary `.holo`
 * drives the emit, not just the canonical scanner) is the next enhancement — see idea-seeds.md.
 */
import { CompilerBase } from './CompilerBase';
import type { HoloComposition } from '../parser/HoloCompositionTypes';

export interface QuestCompilerOptions {
  packageName?: string;
  appName?: string;
  dedupeWindowMs?: number;
  frameWidth?: number;
  frameHeight?: number;
  cameraSource?: number;
  cameraPosition?: number;
  webtaskScheme?: string;
  privacyNote?: string;
}

/** Resolved spec config — the shape the file emitters consume (mirrors quest-emit.mjs `cfg`). */
interface QuestConfig {
  app_name: string;
  privacy_note: string;
  webtask_scheme: string;
  dedupe_window_ms: number;
  frame_width: number;
  frame_height: number;
  camera_source: number;
  camera_position: number;
}

export class QuestCompiler extends CompilerBase {
  protected readonly compilerName = 'QuestCompiler';
  public options: Required<QuestCompilerOptions>;

  constructor(options: QuestCompilerOptions = {}) {
    super();
    this.options = {
      packageName: options.packageName ?? 'net.holoscript.qrscanner',
      appName: options.appName ?? 'Universal QR Scanner',
      dedupeWindowMs: options.dedupeWindowMs ?? 2500,
      frameWidth: options.frameWidth ?? 1280,
      frameHeight: options.frameHeight ?? 960,
      cameraSource: options.cameraSource ?? 0,
      cameraPosition: options.cameraPosition ?? 0,
      webtaskScheme: options.webtaskScheme ?? 'ovrweb://webtask?uri=',
      privacyNote:
        options.privacyNote ?? 'Frames are decoded on-device. Nothing is stored or sent.',
    };
  }

  /**
   * Emit the complete Quest app project: 11 files keyed by their reference-relative paths
   * (`android/...`, matching the golden reference and the GOLDEN_MANIFEST gate).
   */
  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): Record<string, string> {
    this.validateCompilerAccess(agentToken, outputPath);
    const cfg = this.resolveConfig(composition);
    return {
      'android/app/src/main/res/values/generated.xml': this.emitGeneratedXml(cfg),
      'android/app/src/main/java/net/holoscript/qrscanner/QrDecoder.kt': this.emitQrDecoderKt(),
      'android/app/src/main/AndroidManifest.xml': this.emitAndroidManifest(),
      'android/app/build.gradle.kts': this.emitAppBuildGradle(),
      'android/build.gradle.kts': this.emitRootBuildGradle(),
      'android/settings.gradle.kts': this.emitSettingsGradle(),
      'android/app/src/main/res/values/themes.xml': this.emitThemesXml(),
      'android/app/src/main/res/layout/activity_main.xml': this.emitActivityMainXml(),
      'android/app/src/main/res/drawable/ic_launcher.xml': this.emitIcLauncherXml(),
      'android/app/src/main/java/net/holoscript/qrscanner/MainActivity.kt': this.emitMainActivityKt(),
      'android/app/src/main/java/net/holoscript/qrscanner/PassthroughCameraController.kt':
        this.emitPassthroughControllerKt(),
    };
  }

  /**
   * Resolve emit config from options (defaults == scanner.holo). `composition` is accepted for the
   * production signature; field-level mapping (display_name/resolution/dedupe → options) is the
   * next step — today the canonical scanner emits from the defaults and is gate-verified byte-exact.
   */
  private resolveConfig(_composition?: HoloComposition): QuestConfig {
    const o = this.options;
    return {
      app_name: o.appName,
      privacy_note: o.privacyNote,
      webtask_scheme: o.webtaskScheme,
      dedupe_window_ms: o.dedupeWindowMs,
      frame_width: o.frameWidth,
      frame_height: o.frameHeight,
      camera_source: o.cameraSource,
      camera_position: o.cameraPosition,
    };
  }

  private esc(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private emitGeneratedXml(cfg: QuestConfig): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<!-- @generated from scanner.holo by generate.mjs — DO NOT EDIT. Run: node generate.mjs -->
<resources>
    <string name="app_name">${this.esc(cfg.app_name)}</string>
    <string name="privacy_note">${this.esc(cfg.privacy_note)}</string>
    <string name="webtask_scheme">${this.esc(cfg.webtask_scheme)}</string>
    <integer name="dedupe_window_ms">${cfg.dedupe_window_ms}</integer>
    <integer name="frame_width">${cfg.frame_width}</integer>
    <integer name="frame_height">${cfg.frame_height}</integer>
    <integer name="camera_source">${cfg.camera_source}</integer>
    <integer name="camera_position">${cfg.camera_position}</integer>
</resources>
`;
  }

  private emitQrDecoderKt(): string {
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

  private emitSettingsGradle(): string {
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

  private emitRootBuildGradle(): string {
    return `// Root build file — Universal QR Scanner (Meta Quest 3 / 3S)
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
`;
  }

  private emitThemesXml(): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.UniversalQrScanner" parent="android:Theme.DeviceDefault.NoActionBar" />
</resources>
`;
  }

  private emitIcLauncherXml(): string {
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

  private emitActivityMainXml(): string {
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

  private emitAndroidManifest(): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<!--
  Universal QR Scanner — Meta Quest 3 / 3S (Horizon Store)
  Source of truth: ../../scanner.holo  (regenerate config via generate.mjs)
  2D panel utility app: intentionally NO com.oculus.intent.category.VR.
-->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Passthrough camera — narrowest scope (passthrough only, not avatar cams).
         Runtime permission: also requested at runtime in MainActivity. -->
    <uses-permission android:name="horizonos.permission.HEADSET_CAMERA" />

    <!-- Camera2 hardware; Quest 3/3S only. Do NOT require VR headtracking (2D app). -->
    <uses-feature android:name="android.hardware.camera2.any" android:required="true" />
    <uses-feature android:name="android.hardware.vr.headtracking" android:required="false" />

    <application
        android:allowBackup="false"
        android:icon="@drawable/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.UniversalQrScanner">

        <!-- Store visibility: Quest 3 / 3S only -->
        <meta-data android:name="com.oculus.supportedDevices" android:value="quest3|quest3s" />

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden|screenLayout|uiMode"
            android:theme="@style/Theme.UniversalQrScanner">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
  }

  private emitAppBuildGradle(): string {
    return `import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Signing: read from keystore.properties (gitignored) OR env vars (CI). Never commit a keystore (F.106).
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) FileInputStream(keystorePropsFile).use { load(it) }
}
fun signingValue(propKey: String, envKey: String): String? =
    keystoreProps.getProperty(propKey) ?: System.getenv(envKey)

android {
    namespace = "net.holoscript.qrscanner"
    compileSdk = 34

    defaultConfig {
        applicationId = "net.holoscript.qrscanner"
        minSdk = 34          // Quest 3/3S; Camera2 passthrough path is HzOS v76+ (Android 14)
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        create("release") {
            val storePath = signingValue("storeFile", "KEYSTORE_FILE")
            if (storePath != null) {
                storeFile = file(storePath)
                storePassword = signingValue("storePassword", "KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // Minify off for the first store build to maximise build/run reliability (Meta sample parity).
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            val rel = signingConfigs.getByName("release")
            if (rel.storeFile != null) signingConfig = rel
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.0")
    // GMS-free QR decode — Quest has no Google Play Services, so ML Kit unbundled is unusable.
    implementation("com.google.zxing:core:3.5.3")
}
`;
  }

  private emitMainActivityKt(): string {
    return `package net.holoscript.qrscanner

import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts

/**
 * Universal QR Scanner — minimal 2D panel for Meta Quest 3 / 3S.
 *
 * The panel stays small and unobtrusive (a 2D app needs a foreground window to keep camera
 * access — Android blocks background camera). When the passthrough camera senses a QR, a popup
 * asks whether to open it; nothing auto-navigates. Scanning pauses while the popup is shown.
 */
class MainActivity : ComponentActivity() {

    private val cameraPermission = "horizonos.permission.HEADSET_CAMERA"
    private val tag = "QrScanner"

    private lateinit var statusView: TextView
    private var controller: PassthroughCameraController? = null
    private var dialog: AlertDialog? = null

    private val requestCamera =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startScanner()
            else status("Camera permission denied. Enable “Headset cameras” in Settings to scan.")
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        statusView = findViewById(R.id.status)
        status("Scanning for QR codes…")
    }

    override fun onStart() {
        super.onStart()
        if (hasCameraPermission()) startScanner() else requestCamera.launch(cameraPermission)
    }

    override fun onStop() {
        super.onStop()
        dialog?.dismiss()
        dialog = null
        controller?.stop()
        controller = null
    }

    private fun hasCameraPermission(): Boolean =
        checkSelfPermission(cameraPermission) == PackageManager.PERMISSION_GRANTED

    private fun startScanner() {
        if (controller != null) return
        status("Scanning for QR codes…")
        controller = PassthroughCameraController(
            context = this,
            width = resources.getInteger(R.integer.frame_width),
            height = resources.getInteger(R.integer.frame_height),
            cameraSource = resources.getInteger(R.integer.camera_source),
            cameraPosition = resources.getInteger(R.integer.camera_position),
            cooldownMs = resources.getInteger(R.integer.dedupe_window_ms).toLong(),
            onDecoded = { text -> runOnUiThread { onDecoded(text) } },
            onError = { msg -> runOnUiThread { status(msg) } },
        ).also { it.start() }
    }

    /** A QR was sensed — raise a popup; do not navigate automatically. */
    private fun onDecoded(text: String) {
        Log.i(tag, "decoded: $text")
        if (dialog?.isShowing == true) return        // a popup is already up
        controller?.pauseScanning()                  // stop scanning while the user decides
        val isLink = isUrl(text)
        val builder = AlertDialog.Builder(this)
            .setTitle(if (isLink) "QR code found" else "Scanned")
            .setMessage(text)
            .setOnDismissListener { controller?.resumeScanning() }
        if (isLink) {
            builder.setPositiveButton("Open") { _, _ ->
                Log.i(tag, "user opened: $text")
                openInQuestBrowser(text)
            }
            builder.setNegativeButton("Dismiss") { d, _ -> d.dismiss() }
        } else {
            builder.setNegativeButton("OK") { d, _ -> d.dismiss() }
        }
        dialog = builder.show()
    }

    /** Quest "Web Task" scheme — the documented way to open a URL in the Quest Browser. */
    private fun openInQuestBrowser(url: String) {
        val webtask = getString(R.string.webtask_scheme) + Uri.encode(url)
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webtask)))
        } catch (e: Exception) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            } catch (e2: Exception) {
                status("Could not open browser for: $url")
            }
        }
    }

    private fun isUrl(s: String): Boolean {
        val t = s.trim()
        return t.startsWith("http://", ignoreCase = true) ||
            t.startsWith("https://", ignoreCase = true)
    }

    private fun status(msg: String) {
        statusView.text = msg
    }
}
`;
  }

  private emitPassthroughControllerKt(): string {
    return `package net.holoscript.qrscanner

import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log

/**
 * Opens the Quest forward passthrough RGB camera via Camera2 and looks for QR codes.
 *
 * Power profile: when idle it attempts a decode at most every [IDLE_INTERVAL_MS] on a
 * 1/[IDLE_DOWNSCALE]-resolution frame with try-harder OFF (cheap "sensing"). The instant a QR is
 * sensed it ramps up to a full-resolution, try-harder read for an accurate value, then reports it.
 * Scanning can be paused (e.g. while the user decides in a popup) via [pauseScanning].
 *
 * Forward camera is selected via Meta's vendor characteristics
 * (com.meta.extra_metadata.camera_source==[cameraSource], position==[cameraPosition]).
 * Requires Quest 3 / 3S on Horizon OS v76+; permission must be granted before [start].
 */
class PassthroughCameraController(
    private val context: Context,
    private val width: Int,
    private val height: Int,
    private val cameraSource: Int,
    private val cameraPosition: Int,
    private val cooldownMs: Long,
    private val onDecoded: (String) -> Unit,
    private val onError: (String) -> Unit,
) {
    companion object {
        private const val TAG = "PassthroughCamera"
        private const val KEY_CAMERA_SOURCE = "com.meta.extra_metadata.camera_source"
        private const val KEY_CAMERA_POSITION = "com.meta.extra_metadata.position"
        private const val IDLE_INTERVAL_MS = 200L
        private const val IDLE_DOWNSCALE = 2
    }

    private val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    private val decoder = QrDecoder()

    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null

    @Volatile private var paused = false
    private var lastDecodeAttemptMs = 0L
    private var lastReported: String? = null
    private var lastReportedMs = 0L
    private var attempts = 0

    /** Stop processing frames (camera keeps running) — e.g. while a result popup is shown. */
    fun pauseScanning() { paused = true }

    /** Resume idle sensing. */
    fun resumeScanning() { paused = false; lastDecodeAttemptMs = 0 }

    fun start() {
        thread = HandlerThread("qr-camera").also { it.start() }
        handler = Handler(thread!!.looper)
        val cameraId = selectPassthroughCameraId()
        if (cameraId == null) {
            onError("No passthrough camera found. Requires Quest 3 / 3S on Horizon OS v76+.")
            return
        }
        Log.i(TAG, "opening camera id=$cameraId \${width}x$height (idle: 1/$IDLE_DOWNSCALE res every \${IDLE_INTERVAL_MS}ms)")
        openCamera(cameraId)
    }

    private fun selectPassthroughCameraId(): String? {
        var sourceMatch: String? = null
        for (id in cameraManager.cameraIdList) {
            val ch = cameraManager.getCameraCharacteristics(id)
            val source = readVendorByte(ch, KEY_CAMERA_SOURCE)
            val position = readVendorByte(ch, KEY_CAMERA_POSITION)
            if (source != null && source.toInt() == cameraSource) {
                if (sourceMatch == null) sourceMatch = id
                if (position != null && position.toInt() == cameraPosition) return id
            }
        }
        if (sourceMatch != null) return sourceMatch
        for (id in cameraManager.cameraIdList) {
            val ch = cameraManager.getCameraCharacteristics(id)
            if (ch.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK) {
                return id
            }
        }
        return cameraManager.cameraIdList.firstOrNull()
    }

    private fun readVendorByte(ch: CameraCharacteristics, name: String): Byte? = try {
        ch.get(CameraCharacteristics.Key(name, Byte::class.javaObjectType))
    } catch (e: IllegalArgumentException) {
        null
    }

    @Suppress("MissingPermission") // permission verified by MainActivity before start()
    private fun openCamera(cameraId: String) {
        reader = ImageReader.newInstance(width, height, ImageFormat.YUV_420_888, 2).apply {
            setOnImageAvailableListener({ r -> onFrame(r) }, handler)
        }
        cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
            override fun onOpened(camera: CameraDevice) {
                device = camera
                createSession(camera)
            }
            override fun onDisconnected(camera: CameraDevice) {
                camera.close(); device = null
            }
            override fun onError(camera: CameraDevice, error: Int) {
                onError("Camera error: $error")
                camera.close(); device = null
            }
        }, handler)
    }

    private fun createSession(camera: CameraDevice) {
        val surface = reader!!.surface
        camera.createCaptureSession(
            listOf(surface),
            object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(s: CameraCaptureSession) {
                    session = s
                    val req = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                        addTarget(surface)
                        set(
                            CaptureRequest.CONTROL_AF_MODE,
                            CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE
                        )
                    }
                    try {
                        s.setRepeatingRequest(req.build(), null, handler)
                    } catch (e: Exception) {
                        onError("Failed to start camera stream: \${e.message}")
                    }
                }
                override fun onConfigureFailed(s: CameraCaptureSession) {
                    onError("Failed to configure camera session.")
                }
            },
            handler
        )
    }

    private fun onFrame(imageReader: ImageReader) {
        val image: Image = imageReader.acquireLatestImage() ?: return
        try {
            if (paused) return
            val now = System.currentTimeMillis()
            if (now - lastDecodeAttemptMs < IDLE_INTERVAL_MS) return
            lastDecodeAttemptMs = now
            attempts++

            // Cheap idle sense: quarter-resolution, no try-harder.
            val (yS, wS, hS) = packYPlaneScaled(image, IDLE_DOWNSCALE)
            val sensed = decoder.decode(yS, wS, hS, tryHarder = false)
            if (sensed == null) {
                if (attempts % 50 == 0) Log.i(TAG, "idle sensing… attempts=$attempts")
                return
            }

            // Sensed a QR — ramp up to a full-resolution, thorough read for an accurate value.
            val yF = packYPlane(image)
            val precise = decoder.decode(yF, image.width, image.height, tryHarder = true) ?: sensed

            if (precise == lastReported && now - lastReportedMs < cooldownMs) return
            lastReported = precise
            lastReportedMs = now
            Log.i(TAG, "QR sensed+read (attempt $attempts): $precise")
            onDecoded(precise)
        } catch (e: Exception) {
            Log.w(TAG, "frame decode failed", e)
        } finally {
            image.close()
        }
    }

    /** Full-resolution, tightly-packed Y plane (rowStride padding removed). */
    private fun packYPlane(image: Image): ByteArray {
        val plane = image.planes[0]
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val w = image.width
        val h = image.height
        val out = ByteArray(w * h)
        val rowBuf = ByteArray(rowStride)
        var pos = 0
        for (r in 0 until h) {
            buffer.position(r * rowStride)
            val toRead = minOf(rowStride, buffer.remaining())
            buffer.get(rowBuf, 0, toRead)
            System.arraycopy(rowBuf, 0, out, pos, w)
            pos += w
        }
        return out
    }

    /** Subsampled Y plane (every [step]th pixel/row) — cheap luminance for idle sensing. */
    private fun packYPlaneScaled(image: Image, step: Int): Triple<ByteArray, Int, Int> {
        val plane = image.planes[0]
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val ow = image.width / step
        val oh = image.height / step
        val out = ByteArray(ow * oh)
        val rowBuf = ByteArray(rowStride)
        var idx = 0
        for (r in 0 until oh) {
            buffer.position(r * step * rowStride)
            val toRead = minOf(rowStride, buffer.remaining())
            buffer.get(rowBuf, 0, toRead)
            var sc = 0
            for (c in 0 until ow) { out[idx++] = rowBuf[sc]; sc += step }
        }
        return Triple(out, ow, oh)
    }

    fun stop() {
        paused = true
        try { session?.stopRepeating() } catch (_: Exception) {}
        session?.close(); session = null
        device?.close(); device = null
        reader?.close(); reader = null
        thread?.quitSafely(); thread = null; handler = null
    }
}
`;
  }
}
