package net.holoscript.qrscanner

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
