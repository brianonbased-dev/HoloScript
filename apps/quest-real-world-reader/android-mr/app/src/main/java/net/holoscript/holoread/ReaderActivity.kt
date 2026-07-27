// @generated from reader.holo + reader-lifecycle.hsplus bridge contract. DO NOT EDIT.
package net.holoscript.holoread

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
  private val cameraPermission = "horizonos.permission.HEADSET_CAMERA"
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
                            width = 1.3f,
                            height = 1.15f,
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
    private const val FOLLOW_DISTANCE = 1.2f
    private const val HEAD_LOCK_SMOOTHING = 0.2f
  }
}
