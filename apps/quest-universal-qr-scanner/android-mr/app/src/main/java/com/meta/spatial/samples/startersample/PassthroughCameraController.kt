package com.meta.spatial.samples.startersample

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
 * Power profile: the battery win is the THROTTLE — at most one decode attempt every
 * [IDLE_INTERVAL_MS] (~5 fps, not the full camera frame rate). The idle "sense" pass runs at FULL
 * resolution with try-harder OFF; quarter-res sensing was too coarse to detect a QR on a monitor at
 * normal distance (~2 px per module → undecodable). The instant a QR is sensed it ramps up to a
 * full-resolution, try-harder read for an accurate value, then reports it. Scanning can be paused
 * (e.g. while the user decides in a popup) via [pauseScanning].
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
        private const val IDLE_DOWNSCALE = 1
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
        Log.i(TAG, "opening camera id=$cameraId ${width}x$height (idle: 1/$IDLE_DOWNSCALE res every ${IDLE_INTERVAL_MS}ms)")
        openCamera(cameraId)
    }

    private fun selectPassthroughCameraId(): String? {
        var sourceMatch: String? = null
        for (id in cameraManager.cameraIdList) {
            val ch = cameraManager.getCameraCharacteristics(id)
            val source = readVendorByte(ch, KEY_CAMERA_SOURCE)
            val position = readVendorByte(ch, KEY_CAMERA_POSITION)
            val facing = ch.get(CameraCharacteristics.LENS_FACING)
            val sizes = ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                ?.getOutputSizes(ImageFormat.YUV_420_888)?.joinToString(",") { "${it.width}x${it.height}" }
            Log.i(TAG, "DEBUG camera id=$id source=$source position=$position facing=$facing yuvSizes=[$sizes]")
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

    private fun onFrame(imageReader: ImageReader) {
        val image: Image = imageReader.acquireLatestImage() ?: return
        try {
            if (paused) return
            val now = System.currentTimeMillis()
            if (now - lastDecodeAttemptMs < IDLE_INTERVAL_MS) return
            lastDecodeAttemptMs = now
            attempts++

            if (attempts == 1 || attempts == 30) {
                try {
                    val y = packYPlane(image)
                    val f = java.io.File(
                        context.getExternalFilesDir(null),
                        "frame_${attempts}_${image.width}x${image.height}.gray"
                    )
                    f.writeBytes(y)
                    Log.i(TAG, "DEBUG saved Y-plane attempt=$attempts ${image.width}x${image.height} -> ${f.absolutePath}")
                } catch (e: Exception) {
                    Log.w(TAG, "DEBUG frame save failed", e)
                }
            }

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
