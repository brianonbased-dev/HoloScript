/*
 * Universal QR Scanner — immersive Meta Spatial SDK (MR) app.
 * Adapted from the Meta Spatial SDK StarterSample (MIT). Passthrough MR + a programmatic Compose
 * spatial panel; the passthrough Camera2 feed is decoded with ZXing and results drive the panel.
 * No Spatial Editor scene/GLXF, so the build needs no Spatial Editor CLI.
 */
package com.meta.spatial.samples.startersample

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
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

class StarterSampleActivity : AppSystemActivity() {

  private val cameraPermission = "horizonos.permission.HEADSET_CAMERA"
  private val tag = "QrScanner"
  private var controller: PassthroughCameraController? = null
  private var sceneReady = false

  override fun registerFeatures(): List<SpatialFeature> =
      mutableListOf<SpatialFeature>(VRFeature(this), ComposeFeature())

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    ScannerState.onOpen = { url -> openInQuestBrowser(url) }
    ScannerState.onStart = { maybeStartScanner() }
    ScannerState.mockQr = qrImageBitmap(ScannerState.demoUrl, 360) // tutorial mock QR (on-device)
    if (!hasCameraPermission()) {
      requestPermissions(arrayOf(cameraPermission), REQUEST_CAMERA)
    }
  }

  override fun onSceneReady() {
    super.onSceneReady()
    scene.setReferenceSpace(ReferenceSpace.LOCAL_FLOOR)

    // Mixed reality: the user sees their real room (passthrough), so they aim the headset at a QR
    // naturally; the spatial panel floats in front showing scan status + result.
    scene.enablePassthrough(true)

    // Panel placement comes from scanner.holo's spatial_panel.place via @generated ScannerContent.
    // (Spatial SDK is left-handed, +Z = forward — negative z renders the panel behind the user.)
    Entity.create(
        listOf(
            Panel(R.id.panel),
            Transform(Pose(Vector3(ScannerContent.panelX, ScannerContent.panelY, ScannerContent.panelZ))),
        )
    )

    sceneReady = true
    // Camera starts when the user taps "Start scanning" on the welcome screen (ScannerState.onStart).
  }

  private fun maybeStartScanner() {
    if (controller != null ||
        !sceneReady ||
        !hasCameraPermission() ||
        ScannerState.screen != Screen.SCANNING)
        return
    ScannerState.status = "Point at a QR code…"
    controller =
        PassthroughCameraController(
                context = this,
                width = 1280,
                height = 960,
                cameraSource = 0,
                cameraPosition = 0,
                cooldownMs = 2500L,
                onDecoded = { text -> runOnUiThread { onDecoded(text) } },
                onError = { msg -> runOnUiThread { ScannerState.status = msg } },
            )
            .also { it.start() }
  }

  private fun onDecoded(text: String) {
    Log.i(tag, "decoded: $text")
    if (isUrl(text)) {
      ScannerState.pendingUrl = text
      ScannerState.lastResult = null
      ScannerState.status = "QR found — open it?"
    } else {
      ScannerState.pendingUrl = null
      ScannerState.lastResult = text
      ScannerState.status = "Scanned (not a link):"
    }
  }

  /** Quest "Web Task" scheme — the documented way to open a URL in the Quest Browser. */
  private fun openInQuestBrowser(url: String) {
    Log.i(tag, "user opened: $url")
    val webtask = "ovrweb://webtask?uri=" + Uri.encode(url)
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webtask)))
    } catch (e: Exception) {
      try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
      } catch (e2: Exception) {
        ScannerState.status = "Could not open browser for: $url"
      }
    }
  }

  private fun isUrl(s: String): Boolean {
    val t = s.trim()
    return t.startsWith("http://", ignoreCase = true) || t.startsWith("https://", ignoreCase = true)
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
      maybeStartScanner()
    } else if (requestCode == REQUEST_CAMERA) {
      ScannerState.status = "Camera permission denied. Enable “Headset cameras” to scan."
    }
  }

  override fun onSpatialShutdown() {
    controller?.stop()
    controller = null
    super.onSpatialShutdown()
  }

  override fun registerPanels(): List<PanelRegistration> =
      listOf(
          ComposeViewPanelRegistration(
              R.id.panel,
              composeViewCreator = { _, ctx ->
                ComposeView(ctx).apply { setContent { ScannerPanel() } }
              },
              settingsCreator = {
                UIPanelSettings(
                    shape = QuadShapeOptions(width = 1.2f, height = 1.2f),
                    style = PanelStyleOptions(themeResourceId = R.style.PanelAppThemeTransparent),
                    display = DpPerMeterDisplayOptions(),
                )
              },
          )
      )

  companion object {
    private const val REQUEST_CAMERA = 101
  }
}
