package net.holoscript.qrscanner

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
import java.nio.ByteBuffer

/**
 * Opens the Quest forward passthrough RGB camera via the standard Android Camera2 API
 * (Meta's "Passthrough Camera API" exposes the headset cameras as logical Camera2 devices),
 * streams YUV_420_888 frames, extracts the Y plane, and feeds [QrDecoder].
 *
 * Forward camera selection uses Meta's vendor CameraCharacteristics:
 *   com.meta.extra_metadata.camera_source == [cameraSource] (0 = passthrough RGB)
 *   com.meta.extra_metadata.position      == [cameraPosition] (0 = left/forward)
 *
 * Requires Quest 3 / 3S on Horizon OS v76+. Permission must be granted before [start].
 */
class PassthroughCameraController(
    private val context: Context,
    private val width: Int,
    private val height: Int,
    private val cameraSource: Int,
    private val cameraPosition: Int,
    dedupeWindowMs: Long,
    private val onDecoded: (String) -> Unit,
    private val onError: (String) -> Unit,
) {
    companion object {
        private const val TAG = "PassthroughCamera"
        private const val KEY_CAMERA_SOURCE = "com.meta.extra_metadata.camera_source"
        private const val KEY_CAMERA_POSITION = "com.meta.extra_metadata.position"
    }

    private val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    private val decoder = QrDecoder(dedupeWindowMs)

    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null
    private var busy = false

    fun start() {
        thread = HandlerThread("qr-camera").also { it.start() }
        handler = Handler(thread!!.looper)
        val cameraId = selectPassthroughCameraId()
        if (cameraId == null) {
            onError("No passthrough camera found. Requires Quest 3 / 3S on Horizon OS v76+.")
            return
        }
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

        // Vendor keys absent (older OS / emulator): fall back to first back-facing camera.
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
        null // vendor key not present on this device
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
                        onError("Failed to start camera stream: ${e.message}")
                    }
                }
                override fun onConfigureFailed(s: CameraCaptureSession) {
                    onError("Failed to configure camera session.")
                }
            },
            handler
        )
    }

    private fun onFrame(reader: ImageReader) {
        val image: Image = reader.acquireLatestImage() ?: return
        // Drop frames while a decode is in flight — QR scanning doesn't need every frame.
        if (busy) { image.close(); return }
        busy = true
        try {
            val y = packYPlane(image)
            val text = decoder.decode(y, image.width, image.height)
            if (text != null) onDecoded(text)
        } catch (e: Exception) {
            Log.w(TAG, "frame decode failed", e)
        } finally {
            image.close()
            busy = false
        }
    }

    /** Copy the Y plane into a tightly-packed width*height array, stripping rowStride padding. */
    private fun packYPlane(image: Image): ByteArray {
        val plane = image.planes[0]
        val buffer: ByteBuffer = plane.buffer
        val rowStride = plane.rowStride
        val w = image.width
        val h = image.height
        val out = ByteArray(w * h)
        if (rowStride == w) {
            buffer.get(out, 0, w * h)
        } else {
            val row = ByteArray(rowStride)
            var pos = 0
            for (r in 0 until h) {
                buffer.position(r * rowStride)
                val toRead = minOf(rowStride, buffer.remaining())
                buffer.get(row, 0, toRead)
                System.arraycopy(row, 0, out, pos, w)
                pos += w
            }
        }
        return out
    }

    fun stop() {
        try { session?.stopRepeating() } catch (_: Exception) {}
        session?.close(); session = null
        device?.close(); device = null
        reader?.close(); reader = null
        thread?.quitSafely(); thread = null; handler = null
    }
}
