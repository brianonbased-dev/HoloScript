/**
 * HoloScript -> Meta Quest real-world text reader emitter.
 *
 * This is a bounded bridge lowering. Product behavior and policy are collected from the existing
 * sovereign trait vocabulary: @passthrough_camera, @document_ocr, @magnifiable,
 * @speech_synthesis, @spatial_panel, @consent_gate, and @onboarding. Kotlin owns only Horizon OS,
 * Camera2, ML Kit, Android TTS/clipboard, and Meta Spatial SDK calls.
 */
import type { HoloComposition, HoloObjectTrait, HoloValue } from '../parser/HoloCompositionTypes';

type Obj = Record<string, HoloValue>;
const vstr = (value: HoloValue | undefined, fallback: string): string =>
  typeof value === 'string' ? value : fallback;
const vnum = (value: HoloValue | undefined, fallback: number): number =>
  typeof value === 'number' ? value : fallback;
const vbool = (value: HoloValue | undefined, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;
const vobj = (value: HoloValue | undefined): Obj =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {};
const varr = (value: HoloValue | undefined): HoloValue[] => (Array.isArray(value) ? value : []);

export interface QuestReaderFeatures {
  packageName: string;
  appName: string;
  versionCode: number;
  versionName: string;
  iconBackground: string;
  iconPrimary: string;
  iconAccent: string;
  panelX: number;
  panelY: number;
  panelZ: number;
  panelWidth: number;
  panelHeight: number;
  followDistance: number;
  permission: string;
  cameraSource: number;
  cameraPosition: number;
  frameWidth: number;
  frameHeight: number;
  previewDownscale: number;
  ocrEngine: string;
  ocrIntervalMs: number;
  centerCropFraction: number;
  minTextChars: number;
  localOnly: boolean;
  discardFrames: boolean;
  logTextValues: boolean;
  minMagnification: number;
  maxMagnification: number;
  speechBackend: string;
  speechLanguage: string;
  speechRate: number;
  speechPitch: number;
  title: string;
  tagline: string;
  aimTip: string;
  privacyNote: string;
  enableAction: string;
  scanAction: string;
  copyAction: string;
  speakAction: string;
  consentExplicit: boolean;
  consentPurpose: string;
}

function defaults(): QuestReaderFeatures {
  return {
    packageName: 'net.holoscript.holoread',
    appName: 'HoloRead',
    versionCode: 1,
    versionName: '0.1.0',
    iconBackground: '#0B1020',
    iconPrimary: '#67E8F9',
    iconAccent: '#F8FAFC',
    panelX: 0,
    panelY: 1.3,
    panelZ: 1.5,
    panelWidth: 1.3,
    panelHeight: 1.15,
    followDistance: 1.2,
    permission: 'horizonos.permission.HEADSET_CAMERA',
    cameraSource: 0,
    cameraPosition: 0,
    frameWidth: 1280,
    frameHeight: 1280,
    previewDownscale: 4,
    ocrEngine: '',
    ocrIntervalMs: 600,
    centerCropFraction: 0.72,
    minTextChars: 2,
    localOnly: true,
    discardFrames: true,
    logTextValues: false,
    minMagnification: 1,
    maxMagnification: 3,
    speechBackend: '',
    speechLanguage: 'en-US',
    speechRate: 1,
    speechPitch: 0,
    title: 'HoloRead',
    tagline: 'Read real-world text without leaving mixed reality',
    aimTip: 'Large, well-lit text works best.',
    privacyNote: 'Recognition runs on-device. Frames and text are not transmitted or saved.',
    enableAction: 'Enable camera',
    scanAction: 'Read text',
    copyAction: 'Copy',
    speakAction: 'Listen',
    consentExplicit: false,
    consentPurpose: '',
  };
}

export function isQuestReader(composition?: HoloComposition): boolean {
  return (composition?.objects ?? []).some((object) =>
    (object.traits ?? []).some((trait) => trait.name === 'document_ocr')
  );
}

export function collectQuestReaderFeatures(composition: HoloComposition): QuestReaderFeatures {
  const features = defaults();
  const environment = composition.environment?.properties ?? [];
  features.packageName = vstr(
    environment.find((property) => property.key === 'package')?.value as HoloValue,
    features.packageName
  );
  const version = vobj(
    environment.find((property) => property.key === 'version')?.value as HoloValue
  );
  features.versionCode = vnum(version.code, features.versionCode);
  features.versionName = vstr(version.name, features.versionName);
  const icon = vobj(environment.find((property) => property.key === 'icon')?.value as HoloValue);
  features.iconBackground = vstr(icon.background, features.iconBackground);
  features.iconPrimary = vstr(icon.primary, features.iconPrimary);
  features.iconAccent = vstr(icon.accent, features.iconAccent);

  for (const object of composition.objects ?? []) {
    for (const trait of (object.traits ?? []) as HoloObjectTrait[]) {
      const config: Obj = trait.config ?? {};
      switch (trait.name) {
        case 'passthrough_camera':
          features.permission = vstr(config.permission, features.permission);
          features.cameraSource = vnum(config.camera_source, features.cameraSource);
          features.cameraPosition = vnum(config.camera_position, features.cameraPosition);
          features.frameWidth = vnum(config.frame_width, features.frameWidth);
          features.frameHeight = vnum(config.frame_height, features.frameHeight);
          features.previewDownscale = vnum(config.preview_downscale, features.previewDownscale);
          break;
        case 'document_ocr':
          features.ocrEngine = vstr(config.engine, features.ocrEngine);
          features.ocrIntervalMs = vnum(config.interval_ms, features.ocrIntervalMs);
          features.centerCropFraction = vnum(
            config.center_crop_fraction,
            features.centerCropFraction
          );
          features.minTextChars = vnum(config.min_text_chars, features.minTextChars);
          features.localOnly = vbool(config.local_only, features.localOnly);
          features.discardFrames = vbool(config.discard_frames, features.discardFrames);
          features.logTextValues = vbool(config.log_text_values, features.logTextValues);
          if (vstr(config.output_format, 'text') !== 'text') {
            throw new Error(
              'quest-reader-emit: Quest reader v1 requires @document_ocr.output_format="text"'
            );
          }
          break;
        case 'magnifiable':
          features.minMagnification = vnum(config.min_scale, features.minMagnification);
          features.maxMagnification = vnum(config.max_scale, features.maxMagnification);
          break;
        case 'speech_synthesis':
          features.speechBackend = vstr(config.backend, features.speechBackend);
          features.speechLanguage = vstr(config.language, features.speechLanguage);
          features.speechRate = vnum(config.speed, features.speechRate);
          features.speechPitch = vnum(config.pitch, features.speechPitch);
          break;
        case 'spatial_panel': {
          const place = vobj(config.place);
          const size = vobj(config.size);
          features.panelX = vnum(place.x, features.panelX);
          features.panelY = vnum(place.y, features.panelY);
          features.panelZ = vnum(place.z, features.panelZ);
          features.panelWidth = vnum(size.width, features.panelWidth);
          features.panelHeight = vnum(size.height, features.panelHeight);
          features.followDistance = vnum(config.follow_distance, features.followDistance);
          features.appName = vstr(config.title, features.appName);
          break;
        }
        case 'consent_gate': {
          const scopes = varr(config.scope).filter(
            (scope): scope is string => typeof scope === 'string'
          );
          if (scopes.includes('camera_processing')) {
            features.consentExplicit = vbool(config.require_explicit, false);
            features.consentPurpose = vstr(config.purpose, '');
          }
          break;
        }
        case 'onboarding':
          features.title = vstr(config.title, features.title);
          features.tagline = vstr(config.tagline, features.tagline);
          features.aimTip = vstr(config.aim_tip, features.aimTip);
          features.privacyNote = vstr(config.privacy_note, features.privacyNote);
          features.enableAction = vstr(config.start_action, features.enableAction);
          features.scanAction = vstr(config.scan_action, features.scanAction);
          features.copyAction = vstr(config.copy_action, features.copyAction);
          features.speakAction = vstr(config.speak_action, features.speakAction);
          break;
      }
    }
  }
  validateFeatures(features);
  return features;
}

function validateFeatures(features: QuestReaderFeatures): void {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(features.packageName)) {
    throw new Error(`quest-reader-emit: invalid Android package "${features.packageName}"`);
  }
  if (features.ocrEngine !== 'mlkit_bundled') {
    throw new Error(
      'quest-reader-emit: Quest v1 supports only @document_ocr.engine="mlkit_bundled"'
    );
  }
  if (!features.localOnly || !features.discardFrames || features.logTextValues) {
    throw new Error(
      'quest-reader-emit: Quest OCR must be local_only, discard_frames, and log_text_values=false'
    );
  }
  if (!features.consentExplicit || features.consentPurpose.trim().length === 0) {
    throw new Error(
      'quest-reader-emit: camera_processing requires explicit consent and a non-empty purpose'
    );
  }
  if (features.speechBackend !== 'android_tts') {
    throw new Error(
      'quest-reader-emit: Quest v1 supports only @speech_synthesis.backend="android_tts"'
    );
  }
  if (
    !Number.isFinite(features.ocrIntervalMs) ||
    features.ocrIntervalMs < 250 ||
    features.ocrIntervalMs > 5000
  ) {
    throw new Error('quest-reader-emit: OCR interval must be between 250 and 5000 ms');
  }
  if (
    !Number.isFinite(features.centerCropFraction) ||
    features.centerCropFraction < 0.2 ||
    features.centerCropFraction > 1
  ) {
    throw new Error('quest-reader-emit: center_crop_fraction must be between 0.2 and 1.0');
  }
  if (
    !Number.isFinite(features.maxMagnification) ||
    features.maxMagnification < features.minMagnification ||
    features.maxMagnification > 8
  ) {
    throw new Error('quest-reader-emit: invalid magnification bounds');
  }
}

const kotlinString = (value: string): string =>
  '"' +
  value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n') +
  '"';
const floatLiteral = (value: number): string =>
  Number.isInteger(value) ? `${value}.0f` : `${value}f`;
const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function emitQuestReaderFiles(composition: HoloComposition): Record<string, string> {
  const features = collectQuestReaderFeatures(composition);
  const sourceDirectory = `app/src/main/java/${features.packageName.replace(/\./g, '/')}`;
  return {
    [`${sourceDirectory}/ReaderContent.kt`]: emitReaderContent(features),
    [`${sourceDirectory}/TextRecognizer.kt`]: emitTextRecognizer(features),
    [`${sourceDirectory}/PassthroughCameraController.kt`]: emitCameraController(features),
    [`${sourceDirectory}/ReaderPanel.kt`]: emitReaderPanel(features),
    [`${sourceDirectory}/ReaderActivity.kt`]: emitReaderActivity(features),
    'app/src/main/res/values/strings.xml': emitStrings(features),
    'app/src/main/res/values/styles.xml': emitStyles(),
    'app/src/main/res/values/ids.xml': emitIds(),
    'app/src/main/res/drawable/ic_launcher.xml': emitIcon(features),
    'app/build.gradle.kts': emitBuildGradle(features),
    'app/proguard-rules.pro': emitProguard(),
    'app/src/main/AndroidManifest.xml': emitManifest(features),
  };
}

function emitReaderContent(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo by QuestCompiler. DO NOT EDIT.
package ${features.packageName}

object ReaderContent {
  const val appName = ${kotlinString(features.appName)}
  const val title = ${kotlinString(features.title)}
  const val tagline = ${kotlinString(features.tagline)}
  const val aimTip = ${kotlinString(features.aimTip)}
  const val privacyNote = ${kotlinString(features.privacyNote)}
  const val enableAction = ${kotlinString(features.enableAction)}
  const val scanAction = ${kotlinString(features.scanAction)}
  const val copyAction = ${kotlinString(features.copyAction)}
  const val speakAction = ${kotlinString(features.speakAction)}
  const val minTextChars = ${Math.floor(features.minTextChars)}
  const val minMagnification = ${floatLiteral(features.minMagnification)}
  const val maxMagnification = ${floatLiteral(features.maxMagnification)}
  const val speechLanguage = ${kotlinString(features.speechLanguage)}
  const val speechRate = ${floatLiteral(features.speechRate)}
  const val speechPitch = ${floatLiteral(1 + features.speechPitch)}
  const val panelX = ${floatLiteral(features.panelX)}
  const val panelY = ${floatLiteral(features.panelY)}
  const val panelZ = ${floatLiteral(features.panelZ)}
}
`;
}

function emitTextRecognizer(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo @document_ocr(engine="mlkit_bundled"). DO NOT EDIT.
package ${features.packageName}

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

class TextRecognizer : AutoCloseable {
  private val client = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  fun recognize(
      bitmap: Bitmap,
      onResult: (String) -> Unit,
      onError: (String) -> Unit,
  ) {
    val image = InputImage.fromBitmap(bitmap, 0)
    client.process(image)
        .addOnSuccessListener { result -> onResult(result.text.trim()) }
        .addOnFailureListener { error -> onError(error.message ?: "Text recognition failed") }
  }

  override fun close() {
    client.close()
  }
}
`;
}

function emitCameraController(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo @passthrough_camera + @document_ocr. DO NOT EDIT.
package ${features.packageName}

import android.content.Context
import android.graphics.Bitmap
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
import android.util.Size
import java.util.concurrent.atomic.AtomicBoolean

class PassthroughCameraController(
    context: Context,
    private val onPreview: (Bitmap) -> Unit,
    private val onCaptureReady: () -> Unit,
    private val onRecognized: (String) -> Unit,
    private val onError: (String) -> Unit,
) {
  companion object {
    private const val TAG = "HoloReadCamera"
    private const val KEY_CAMERA_SOURCE = "com.meta.extra_metadata.camera_source"
    private const val KEY_CAMERA_POSITION = "com.meta.extra_metadata.position"
    private const val CAMERA_SOURCE = ${features.cameraSource}
    private const val CAMERA_POSITION = ${features.cameraPosition}
    private const val OCR_INTERVAL_MS = ${Math.floor(features.ocrIntervalMs)}L
    private const val CENTER_CROP_FRACTION = ${floatLiteral(features.centerCropFraction)}
    private const val PREVIEW_DOWNSCALE = ${Math.floor(features.previewDownscale)}
    private const val FALLBACK_WIDTH = ${Math.floor(features.frameWidth)}
    private const val FALLBACK_HEIGHT = ${Math.floor(features.frameHeight)}
  }

  private val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
  private val recognizer = TextRecognizer()
  private val recognitionRequested = AtomicBoolean(false)
  private val recognitionInFlight = AtomicBoolean(false)
  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private var device: CameraDevice? = null
  private var session: CameraCaptureSession? = null
  private var reader: ImageReader? = null
  private var captureWidth = FALLBACK_WIDTH
  private var captureHeight = FALLBACK_HEIGHT
  private var lastRecognitionMs = 0L
  private var lastPreviewMs = 0L

  fun requestRecognition(): Boolean {
    if (recognitionInFlight.get()) return false
    return recognitionRequested.compareAndSet(false, true)
  }

  fun start() {
    thread = HandlerThread("holoread-camera").also { it.start() }
    handler = Handler(thread!!.looper)
    val cameraId = selectPassthroughCameraId()
    if (cameraId == null) {
      onError("No passthrough camera found. HoloRead requires Quest 3 or Quest 3S.")
      return
    }
    pickLargestYuvSize(cameraId)?.let { size ->
      captureWidth = size.width
      captureHeight = size.height
    }
    openCamera(cameraId)
  }

  private fun pickLargestYuvSize(cameraId: String): Size? =
      try {
        cameraManager.getCameraCharacteristics(cameraId)
            .get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            ?.getOutputSizes(ImageFormat.YUV_420_888)
            ?.maxByOrNull { size -> size.width.toLong() * size.height }
      } catch (error: Exception) {
        Log.w(TAG, "Camera size query failed; using declared fallback", error)
        null
      }

  private fun selectPassthroughCameraId(): String? {
    var sourceMatch: String? = null
    for (id in cameraManager.cameraIdList) {
      val characteristics = cameraManager.getCameraCharacteristics(id)
      val source = readVendorByte(characteristics, KEY_CAMERA_SOURCE)
      val position = readVendorByte(characteristics, KEY_CAMERA_POSITION)
      if (source?.toInt() == CAMERA_SOURCE) {
        if (sourceMatch == null) sourceMatch = id
        if (position?.toInt() == CAMERA_POSITION) return id
      }
    }
    return sourceMatch
        ?: cameraManager.cameraIdList.firstOrNull { id ->
          cameraManager.getCameraCharacteristics(id)
              .get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        }
        ?: cameraManager.cameraIdList.firstOrNull()
  }

  private fun readVendorByte(
      characteristics: CameraCharacteristics,
      name: String,
  ): Byte? =
      try {
        characteristics.get(CameraCharacteristics.Key(name, Byte::class.javaObjectType))
      } catch (_: IllegalArgumentException) {
        null
      }

  @Suppress("MissingPermission")
  private fun openCamera(cameraId: String) {
    reader =
        ImageReader.newInstance(captureWidth, captureHeight, ImageFormat.YUV_420_888, 2).apply {
          setOnImageAvailableListener({ source -> onFrame(source) }, handler)
        }
    cameraManager.openCamera(
        cameraId,
        object : CameraDevice.StateCallback() {
          override fun onOpened(camera: CameraDevice) {
            device = camera
            createSession(camera)
          }
          override fun onDisconnected(camera: CameraDevice) {
            camera.close()
            device = null
          }
          override fun onError(camera: CameraDevice, error: Int) {
            onError("Camera error " + error)
            camera.close()
            device = null
          }
        },
        handler,
    )
  }

  private fun createSession(camera: CameraDevice) {
    val surface = reader!!.surface
    camera.createCaptureSession(
        listOf(surface),
        object : CameraCaptureSession.StateCallback() {
          override fun onConfigured(configured: CameraCaptureSession) {
            session = configured
            val request =
                camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                  addTarget(surface)
                  set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF)
                }
            configured.setRepeatingRequest(request.build(), null, handler)
          }
          override fun onConfigureFailed(configured: CameraCaptureSession) {
            onError("Could not configure the passthrough camera")
          }
        },
        handler,
    )
  }

  private fun onFrame(source: ImageReader) {
    val image: Image = source.acquireLatestImage() ?: return
    try {
      val packedY = packYPlane(image)
      val now = System.currentTimeMillis()
      if (now - lastPreviewMs >= 100L) {
        lastPreviewMs = now
        onPreview(buildPreview(packedY, image.width, image.height))
      }
      if (!recognitionRequested.get() || recognitionInFlight.get()) return
      if (now - lastRecognitionMs < OCR_INTERVAL_MS) return
      if (!recognitionRequested.compareAndSet(true, false)) return
      recognitionInFlight.set(true)
      lastRecognitionMs = now
      onCaptureReady()
      val crop = buildCenterCrop(packedY, image.width, image.height)
      recognizer.recognize(
          crop,
          onResult = { text ->
            crop.recycle()
            recognitionInFlight.set(false)
            onRecognized(text)
          },
          onError = { message ->
            crop.recycle()
            recognitionInFlight.set(false)
            onError(message)
          },
      )
    } catch (error: Exception) {
      recognitionRequested.set(false)
      recognitionInFlight.set(false)
      onError("Camera frame processing failed")
      Log.w(TAG, "Camera frame processing failed", error)
    } finally {
      image.close()
    }
  }

  private fun packYPlane(image: Image): ByteArray {
    val plane = image.planes[0]
    val buffer = plane.buffer
    val width = image.width
    val height = image.height
    val rowStride = plane.rowStride
    val output = ByteArray(width * height)
    val row = ByteArray(rowStride)
    var destination = 0
    for (index in 0 until height) {
      buffer.position(index * rowStride)
      val count = minOf(rowStride, buffer.remaining())
      buffer.get(row, 0, count)
      System.arraycopy(row, 0, output, destination, width)
      destination += width
    }
    return output
  }

  private fun buildPreview(y: ByteArray, width: Int, height: Int): Bitmap {
    val step = maxOf(1, PREVIEW_DOWNSCALE)
    val previewWidth = maxOf(1, width / step)
    val previewHeight = maxOf(1, height / step)
    val pixels = IntArray(previewWidth * previewHeight)
    var destination = 0
    for (row in 0 until previewHeight) {
      val sourceRow = row * step * width
      for (column in 0 until previewWidth) {
        val value = y[sourceRow + column * step].toInt() and 0xff
        pixels[destination++] =
            (0xff shl 24) or (value shl 16) or (value shl 8) or value
      }
    }
    return Bitmap.createBitmap(
        pixels,
        previewWidth,
        previewHeight,
        Bitmap.Config.ARGB_8888,
    )
  }

  private fun buildCenterCrop(y: ByteArray, width: Int, height: Int): Bitmap {
    val cropWidth = maxOf(1, (width * CENTER_CROP_FRACTION).toInt())
    val cropHeight = maxOf(1, (height * CENTER_CROP_FRACTION).toInt())
    val left = (width - cropWidth) / 2
    val top = (height - cropHeight) / 2
    val pixels = IntArray(cropWidth * cropHeight)
    var destination = 0
    for (row in 0 until cropHeight) {
      val sourceRow = (top + row) * width + left
      for (column in 0 until cropWidth) {
        val value = y[sourceRow + column].toInt() and 0xff
        pixels[destination++] =
            (0xff shl 24) or (value shl 16) or (value shl 8) or value
      }
    }
    return Bitmap.createBitmap(pixels, cropWidth, cropHeight, Bitmap.Config.ARGB_8888)
  }

  fun stop() {
    recognitionRequested.set(false)
    recognitionInFlight.set(false)
    try {
      session?.stopRepeating()
    } catch (_: Exception) {}
    session?.close()
    session = null
    device?.close()
    device = null
    reader?.close()
    reader = null
    recognizer.close()
    thread?.quitSafely()
    thread = null
    handler = null
  }
}
`;
}

function emitReaderPanel(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo UI, @magnifiable, and @speech_synthesis. DO NOT EDIT.
package ${features.packageName}

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meta.spatial.uiset.theme.LocalColorScheme
import com.meta.spatial.uiset.theme.SpatialTheme
import com.meta.spatial.uiset.theme.darkSpatialColorScheme

enum class ReaderScreen { CONSENT, READY, WORKING, RESULT, ERROR }

object ReaderState {
  var screen by mutableStateOf(ReaderScreen.CONSENT)
  var status by mutableStateOf("Camera access is off")
  var preview by mutableStateOf<ImageBitmap?>(null)
  var recognizedText by mutableStateOf("")
  var magnification by mutableFloatStateOf(ReaderContent.minMagnification)
  var onEnable: (() -> Unit)? = null
  var onRead: (() -> Unit)? = null
  var onCopy: ((String) -> Unit)? = null
  var onSpeak: ((String) -> Unit)? = null

  fun updatePreview(bitmap: Bitmap) {
    preview = bitmap.asImageBitmap()
  }
}

@Composable
fun ReaderPanel() {
  SpatialTheme(colorScheme = darkSpatialColorScheme()) {
    Column(
        modifier =
            Modifier.fillMaxSize()
                .clip(SpatialTheme.shapes.large)
                .background(brush = LocalColorScheme.current.panel)
                .verticalScroll(rememberScrollState())
                .padding(34.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top,
    ) {
      Text(
          ReaderContent.title,
          fontSize = 34.sp,
          fontWeight = FontWeight.Bold,
          color = Color(0xFF67E8F9),
      )
      Spacer(Modifier.size(8.dp))
      Text(ReaderContent.tagline, fontSize = 18.sp, textAlign = TextAlign.Center)
      Spacer(Modifier.size(20.dp))
      when (ReaderState.screen) {
        ReaderScreen.CONSENT -> ConsentScreen()
        ReaderScreen.READY -> CaptureScreen(working = false)
        ReaderScreen.WORKING -> CaptureScreen(working = true)
        ReaderScreen.RESULT -> ResultScreen()
        ReaderScreen.ERROR -> ErrorScreen()
      }
    }
  }
}

@Composable
private fun ConsentScreen() {
  Text(ReaderContent.privacyNote, fontSize = 18.sp, textAlign = TextAlign.Center)
  Spacer(Modifier.size(14.dp))
  Text(ReaderContent.aimTip, fontSize = 16.sp, textAlign = TextAlign.Center)
  Spacer(Modifier.size(24.dp))
  Button(onClick = { ReaderState.onEnable?.invoke() }) { Text(ReaderContent.enableAction) }
}

@Composable
private fun CaptureScreen(working: Boolean) {
  Box(
      modifier =
          Modifier.fillMaxWidth()
              .height(330.dp)
              .clip(RoundedCornerShape(18.dp))
              .background(Color.Black)
              .border(3.dp, Color(0xFF67E8F9), RoundedCornerShape(18.dp)),
      contentAlignment = Alignment.Center,
  ) {
    ReaderState.preview?.let { preview ->
      Image(
          bitmap = preview,
          contentDescription = "Passthrough text targeting preview",
          modifier = Modifier.fillMaxSize(),
          contentScale = ContentScale.Crop,
      )
    }
    Box(
        modifier =
            Modifier.fillMaxWidth(0.72f)
                .height(230.dp)
                .border(2.dp, Color.White, RoundedCornerShape(10.dp))
    )
  }
  Spacer(Modifier.size(14.dp))
  Text(
      if (working) "Reading on device..." else ReaderState.status,
      fontSize = 17.sp,
      textAlign = TextAlign.Center,
  )
  Spacer(Modifier.size(16.dp))
  Button(enabled = !working, onClick = { ReaderState.onRead?.invoke() }) {
    Text(ReaderContent.scanAction)
  }
}

@Composable
private fun ResultScreen() {
  Text(
      ReaderState.recognizedText,
      modifier = Modifier.fillMaxWidth(),
      fontSize = (24f * ReaderState.magnification).sp,
      lineHeight = (30f * ReaderState.magnification).sp,
      textAlign = TextAlign.Start,
  )
  Spacer(Modifier.size(20.dp))
  val text = ReaderState.recognizedText
  Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
    Button(onClick = { ReaderState.onCopy?.invoke(text) }) { Text(ReaderContent.copyAction) }
    Button(onClick = { ReaderState.onSpeak?.invoke(text) }) { Text(ReaderContent.speakAction) }
    Button(
        enabled = ReaderState.magnification < ReaderContent.maxMagnification,
        onClick = {
          ReaderState.magnification =
              minOf(ReaderContent.maxMagnification, ReaderState.magnification + 0.5f)
        },
    ) {
      Text("Bigger")
    }
    Button(
        enabled = ReaderState.magnification > ReaderContent.minMagnification,
        onClick = {
          ReaderState.magnification =
              maxOf(ReaderContent.minMagnification, ReaderState.magnification - 0.5f)
        },
    ) {
      Text("Smaller")
    }
  }
  Spacer(Modifier.size(12.dp))
  Button(onClick = { ReaderState.onRead?.invoke() }) { Text("Read again") }
}

@Composable
private fun ErrorScreen() {
  Text(ReaderState.status, fontSize = 19.sp, textAlign = TextAlign.Center)
  Spacer(Modifier.size(18.dp))
  Button(onClick = { ReaderState.onRead?.invoke() }) { Text("Try again") }
}
`;
}

function emitReaderActivity(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo + reader-lifecycle.hsplus bridge contract. DO NOT EDIT.
package ${features.packageName}

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.tts.TextToSpeech
import androidx.compose.ui.platform.ComposeView
import com.meta.spatial.compose.ComposeFeature
import com.meta.spatial.compose.ComposeViewPanelRegistration
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.SpatialFeature
import com.meta.spatial.core.Vector3
import com.meta.spatial.runtime.ReferenceSpace
import com.meta.spatial.toolkit.AppSystemActivity
import com.meta.spatial.toolkit.DpPerMeterDisplayOptions
import com.meta.spatial.toolkit.Panel
import com.meta.spatial.toolkit.PanelRegistration
import com.meta.spatial.toolkit.PanelStyleOptions
import com.meta.spatial.toolkit.QuadShapeOptions
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.UIPanelSettings
import com.meta.spatial.vr.VRFeature
import java.util.Locale

class ReaderActivity : AppSystemActivity(), TextToSpeech.OnInitListener {
  private val cameraPermission = ${kotlinString(features.permission)}
  private var controller: PassthroughCameraController? = null
  private var panelEntity: Entity? = null
  private var smoothPose: Pose? = null
  private var sceneReady = false
  private var textToSpeech: TextToSpeech? = null
  private var speechReady = false
  private val lifecycle = ReaderLifecycleMachine()

  override fun registerFeatures(): List<SpatialFeature> =
      listOf(VRFeature(this), ComposeFeature())

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    textToSpeech = TextToSpeech(this, this)
    ReaderState.onEnable = {
      if (hasCameraPermission()) startReader()
      else requestPermissions(arrayOf(cameraPermission), REQUEST_CAMERA)
    }
    ReaderState.onRead = {
      val transition = lifecycle.fireScanRequested()
      if (transition?.to != ReaderLifecycleMachine.State.CAPTURING) {
        ReaderState.status = "A recognition pass is already running"
      } else if (controller?.requestRecognition() == true) {
        ReaderState.screen = ReaderScreen.WORKING
        ReaderState.status = "Capturing requested frame"
      } else {
        lifecycle.fireRecognitionFailed()
        ReaderState.screen = ReaderScreen.ERROR
        ReaderState.status = "Camera is not ready"
      }
    }
    ReaderState.onCopy = { text ->
      val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("HoloRead", text))
      ReaderState.status = "Copied"
    }
    ReaderState.onSpeak = { text ->
      if (speechReady) {
        textToSpeech?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "holoread-result")
      } else {
        ReaderState.status = "Speech is not ready"
      }
    }
  }

  override fun onInit(status: Int) {
    if (status != TextToSpeech.SUCCESS) {
      speechReady = false
      return
    }
    val languageTag = Locale.forLanguageTag(ReaderContent.speechLanguage)
    val languageStatus = textToSpeech?.setLanguage(languageTag) ?: TextToSpeech.ERROR
    speechReady =
        languageStatus != TextToSpeech.LANG_MISSING_DATA &&
            languageStatus != TextToSpeech.LANG_NOT_SUPPORTED
    textToSpeech?.setSpeechRate(ReaderContent.speechRate)
    textToSpeech?.setPitch(ReaderContent.speechPitch)
  }

  override fun onSceneReady() {
    super.onSceneReady()
    scene.setReferenceSpace(ReferenceSpace.LOCAL_FLOOR)
    scene.enablePassthrough(true)
    if (panelEntity == null) {
      panelEntity =
          Entity.create(
              listOf(
                  Panel(R.id.panel),
                  Transform(
                      Pose(
                          Vector3(
                              ReaderContent.panelX,
                              ReaderContent.panelY,
                              ReaderContent.panelZ,
                          )
                      )
                  ),
              )
          )
    }
    sceneReady = true
  }

  override fun onSceneTick() {
    super.onSceneTick()
    if (!sceneReady || !hasWindowFocus()) return
    val panel = panelEntity ?: return
    val target = scene.getViewerPose().times(Pose(Vector3(0f, 0f, FOLLOW_DISTANCE)))
    val current = smoothPose
    val next =
        if (current == null) {
          target
        } else {
          val position =
              Vector3(
                  current.t.x + (target.t.x - current.t.x) * HEAD_LOCK_SMOOTHING,
                  current.t.y + (target.t.y - current.t.y) * HEAD_LOCK_SMOOTHING,
                  current.t.z + (target.t.z - current.t.z) * HEAD_LOCK_SMOOTHING,
              )
          Pose(position, target.q)
        }
    smoothPose = next
    panel.setComponents(Transform(next))
  }

  private fun startReader() {
    if (!sceneReady || controller != null) return
    controller =
        PassthroughCameraController(
                context = this,
                onPreview = { bitmap ->
                  runOnUiThread {
                    ReaderState.updatePreview(bitmap)
                    if (ReaderState.screen == ReaderScreen.CONSENT) {
                      ReaderState.screen = ReaderScreen.READY
                    }
                    ReaderState.status = "Place text inside the frame"
                  }
                },
                onCaptureReady = {
                  runOnUiThread {
                    lifecycle.fireCaptureReady()
                    ReaderState.screen = ReaderScreen.WORKING
                  }
                },
                onRecognized = { text ->
                  runOnUiThread {
                    if (text.length >= ReaderContent.minTextChars) {
                      lifecycle.fireRecognitionSucceeded()
                      ReaderState.recognizedText = text
                      ReaderState.magnification = ReaderContent.minMagnification
                      ReaderState.screen = ReaderScreen.RESULT
                      ReaderState.status = "Text recognized"
                    } else {
                      lifecycle.fireRecognitionFailed()
                      ReaderState.screen = ReaderScreen.ERROR
                      ReaderState.status = "No readable text found. Move closer or improve lighting."
                    }
                  }
                },
                onError = { message ->
                  runOnUiThread {
                    lifecycle.fireRecognitionFailed()
                    ReaderState.screen = ReaderScreen.ERROR
                    ReaderState.status = message
                  }
                },
            )
            .also { it.start() }
  }

  private fun hasCameraPermission(): Boolean =
      checkSelfPermission(cameraPermission) == PackageManager.PERMISSION_GRANTED

  override fun onRequestPermissionsResult(
      requestCode: Int,
      permissions: Array<out String>,
      grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQUEST_CAMERA &&
        grantResults.isNotEmpty() &&
        grantResults[0] == PackageManager.PERMISSION_GRANTED) {
      startReader()
    } else if (requestCode == REQUEST_CAMERA) {
      ReaderState.screen = ReaderScreen.ERROR
      ReaderState.status = "Camera permission denied. Enable Headset cameras in Quest Settings."
    }
  }

  override fun onSpatialShutdown() {
    controller?.stop()
    controller = null
    textToSpeech?.stop()
    textToSpeech?.shutdown()
    textToSpeech = null
    super.onSpatialShutdown()
  }

  override fun registerPanels(): List<PanelRegistration> =
      listOf(
          ComposeViewPanelRegistration(
              R.id.panel,
              composeViewCreator = { _, context ->
                ComposeView(context).apply { setContent { ReaderPanel() } }
              },
              settingsCreator = {
                UIPanelSettings(
                    shape =
                        QuadShapeOptions(
                            width = ${floatLiteral(features.panelWidth)},
                            height = ${floatLiteral(features.panelHeight)},
                        ),
                    style =
                        PanelStyleOptions(
                            themeResourceId = R.style.PanelAppThemeTransparent
                        ),
                    display = DpPerMeterDisplayOptions(),
                )
              },
          )
      )

  companion object {
    private const val REQUEST_CAMERA = 201
    private const val FOLLOW_DISTANCE = ${floatLiteral(features.followDistance)}
    private const val HEAD_LOCK_SMOOTHING = 0.2f
  }
}
`;
}

function emitStrings(features: QuestReaderFeatures): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<!-- @generated from reader.holo by QuestCompiler. -->
<resources>
  <string name="app_name">${xmlEscape(features.appName)}</string>
</resources>
`;
}

function emitStyles(): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<!-- @generated by QuestCompiler. -->
<resources>
  <style name="Theme.Transparent" parent="android:Theme">
    <item name="android:windowIsTranslucent">true</item>
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:windowContentOverlay">@null</item>
    <item name="android:windowNoTitle">true</item>
    <item name="android:backgroundDimEnabled">false</item>
  </style>
  <style name="PanelAppThemeTransparent" parent="android:Theme">
    <item name="android:windowIsTranslucent">true</item>
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:windowContentOverlay">@null</item>
    <item name="android:windowNoTitle">true</item>
    <item name="android:backgroundDimEnabled">false</item>
  </style>
</resources>
`;
}

function emitIds(): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<!-- @generated by QuestCompiler. -->
<resources>
  <item type="id" name="panel" />
</resources>
`;
}

function emitIcon(features: QuestReaderFeatures): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<!-- @generated from reader.holo environment.icon by QuestCompiler. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
  <path android:fillColor="${features.iconBackground}" android:pathData="M0,0h108v108h-108z" />
  <path android:fillColor="${features.iconPrimary}" android:pathData="M18,22h72v10h-72z M18,44h58v10h-58z M18,66h68v10h-68z" />
  <path android:fillColor="${features.iconAccent}" android:pathData="M82,43h8v33h-8z M72,54h28v8h-28z" />
</vector>
`;
}

function emitBuildGradle(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo by QuestCompiler. DO NOT EDIT.
import java.io.FileInputStream
import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.jetbrains.kotlin.android)
  alias(libs.plugins.meta.spatial.plugin)
  alias(libs.plugins.compose.compiler)
}

val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
  if (keystorePropsFile.exists()) FileInputStream(keystorePropsFile).use { load(it) }
}
fun signingValue(propKey: String, envKey: String): String? =
    keystoreProps.getProperty(propKey) ?: System.getenv(envKey)

android {
  namespace = "${features.packageName}"
  compileSdk = 34
  defaultConfig {
    applicationId = "${features.packageName}"
    minSdk = 34
    targetSdk = 34
    versionCode = ${Math.floor(features.versionCode)}
    versionName = "${features.versionName}"
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    ndk { abiFilters += "arm64-v8a" }
  }
  packaging { resources.excludes.add("META-INF/LICENSE") }
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
  lint {
    abortOnError = false
    checkReleaseBuilds = true
  }
  buildTypes {
    release {
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      val releaseSigning = signingConfigs.getByName("release")
      if (releaseSigning.storeFile != null) signingConfig = releaseSigning
    }
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  composeOptions { kotlinCompilerExtensionVersion = "1.5.15" }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions { jvmTarget = "17" }
}

dependencies {
  implementation(libs.androidx.core.ktx)
  testImplementation(libs.junit)
  androidTestImplementation(libs.androidx.junit)
  androidTestImplementation(libs.androidx.espresso.core)
  implementation(libs.androidx.activity.compose)
  implementation(platform(libs.androidx.compose.bom))
  implementation(libs.androidx.ui)
  implementation(libs.androidx.ui.graphics)
  implementation(libs.androidx.material3)
  implementation(libs.androidx.ui.tooling.preview)
  debugImplementation(libs.androidx.ui.tooling)

  // Bundled model: no Google Play Services, account, network, or first-run model download.
  implementation("com.google.mlkit:text-recognition:16.0.1")

  implementation(libs.meta.spatial.sdk.base)
  implementation(libs.meta.spatial.sdk.compose)
  implementation(libs.meta.spatial.sdk.toolkit)
  implementation(libs.meta.spatial.sdk.vr)
  implementation(libs.meta.spatial.sdk.isdk)
  implementation(libs.meta.spatial.sdk.uiset)
}

spatial {
  allowUsageDataCollection.set(false)
}
`;
}

function emitProguard(): string {
  return `# @generated by QuestCompiler.
-dontwarn horizonos.app.container.**
-dontwarn vros.os.**
-keepclasseswithmembers,includedescriptorclasses class com.meta.spatial.** {
    native <methods>;
}
-keepclassmembers,includedescriptorclasses class com.meta.spatial.** {
    *** native*(...);
}
-keep class com.meta.spatial.**.R { *; }
-keep class com.meta.spatial.**.R$* { *; }
-keep class com.meta.spatial.toolkit.** { *; }
-keep class com.meta.spatial.isdk.** { *; }
`;
}

function emitManifest(features: QuestReaderFeatures): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<!-- @generated from reader.holo privacy and device declarations by QuestCompiler. -->
<manifest
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:horizonos="http://schemas.horizonos/sdk"
    xmlns:tools="http://schemas.android.com/tools"
    android:versionCode="${Math.floor(features.versionCode)}"
    android:versionName="${xmlEscape(features.versionName)}"
    android:installLocation="auto">

  <horizonos:uses-horizonos-sdk horizonos:minSdkVersion="74" horizonos:targetSdkVersion="74" />
  <uses-feature android:name="android.hardware.vr.headtracking" android:required="true" />
  <uses-feature android:name="oculus.software.handtracking" android:required="false" />
  <uses-feature android:name="com.oculus.feature.PASSTHROUGH" android:required="true" />
  <uses-feature android:name="android.hardware.camera2.any" android:required="true" />
  <uses-feature android:glEsVersion="0x00030001" />
  <uses-permission android:name="com.oculus.permission.HAND_TRACKING" />
  <uses-permission android:name="${xmlEscape(features.permission)}" />

  <!-- HoloRead is local-only. Remove network/media permissions from every transitive manifest. -->
  <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" tools:node="remove" />
  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" tools:node="remove" />
  <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" tools:node="remove" />
  <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" tools:node="remove" />
  <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" tools:node="remove" />

  <application
      android:allowBackup="false"
      android:icon="@drawable/ic_launcher"
      android:label="@string/app_name">
    <meta-data android:name="com.oculus.supportedDevices" android:value="quest3|quest3s" />
    <meta-data android:name="com.oculus.handtracking.version" android:value="V2.0" />
    <meta-data android:name="com.oculus.vr.focusaware" android:value="true" />
    <uses-native-library android:name="libossdk.oculus.so" android:required="true" />
    <activity
        android:name="${features.packageName}.ReaderActivity"
        android:launchMode="singleTask"
        android:screenOrientation="landscape"
        android:excludeFromRecents="true"
        android:configChanges="screenSize|screenLayout|orientation|keyboardHidden|keyboard|navigation|uiMode"
        android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="com.oculus.intent.category.VR" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`;
}
