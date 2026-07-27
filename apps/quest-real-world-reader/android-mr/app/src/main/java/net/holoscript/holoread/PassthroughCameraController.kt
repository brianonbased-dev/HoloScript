// @generated from reader.holo @passthrough_camera + @document_ocr. DO NOT EDIT.
package net.holoscript.holoread

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
    private const val CAMERA_SOURCE = 0
    private const val CAMERA_POSITION = 0
    private const val OCR_INTERVAL_MS = 600L
    private const val CENTER_CROP_FRACTION = 0.72f
    private const val PREVIEW_DOWNSCALE = 4
    private const val FALLBACK_WIDTH = 1280
    private const val FALLBACK_HEIGHT = 1280
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
