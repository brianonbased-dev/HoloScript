package net.holoscript.qrscanner

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts

/**
 * Universal QR Scanner — 2D panel app for Meta Quest 3 / 3S.
 *
 * Flow: request HEADSET_CAMERA -> stream passthrough frames -> decode QR ->
 *       open URLs in the Quest Browser via the "Web Task" scheme (ovrweb://webtask?uri=...).
 *
 * Spec-driven values (resolution, camera selection, dedupe window, webtask scheme) come from
 * the @generated res/values/generated.xml, whose source of truth is ../../scanner.holo.
 */
class MainActivity : ComponentActivity() {

    private val cameraPermission = "horizonos.permission.HEADSET_CAMERA"

    private lateinit var statusView: TextView
    private lateinit var resultView: TextView
    private var controller: PassthroughCameraController? = null

    private val requestCamera =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startScanner()
            else status("Camera permission denied. Enable “Headset cameras” in Settings to scan.")
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        statusView = findViewById(R.id.status)
        resultView = findViewById(R.id.result)
        status("Point at a QR code…")
    }

    override fun onStart() {
        super.onStart()
        if (hasCameraPermission()) startScanner() else requestCamera.launch(cameraPermission)
    }

    override fun onStop() {
        super.onStop()
        controller?.stop()
        controller = null
    }

    private fun hasCameraPermission(): Boolean =
        checkSelfPermission(cameraPermission) == PackageManager.PERMISSION_GRANTED

    private fun startScanner() {
        if (controller != null) return
        status("Scanning… point at a QR code")
        controller = PassthroughCameraController(
            context = this,
            width = resources.getInteger(R.integer.frame_width),
            height = resources.getInteger(R.integer.frame_height),
            cameraSource = resources.getInteger(R.integer.camera_source),
            cameraPosition = resources.getInteger(R.integer.camera_position),
            dedupeWindowMs = resources.getInteger(R.integer.dedupe_window_ms).toLong(),
            onDecoded = { text -> runOnUiThread { onDecoded(text) } },
            onError = { msg -> runOnUiThread { status(msg) } },
        ).also { it.start() }
    }

    private fun onDecoded(text: String) {
        resultView.text = text
        if (isUrl(text)) {
            status("Opening: $text")
            openInQuestBrowser(text)
        } else {
            status("Scanned (not a link):")
        }
    }

    /** Quest "Web Task" scheme — the documented way to open a URL in the Quest Browser. */
    private fun openInQuestBrowser(url: String) {
        val webtask = getString(R.string.webtask_scheme) + Uri.encode(url)
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webtask)))
        } catch (e: Exception) {
            // Fallback to a plain view intent if the Web Task scheme is unavailable.
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
