package net.holoscript.qrscanner

import com.google.zxing.BinaryBitmap
import com.google.zxing.ChecksumException
import com.google.zxing.DecodeHintType
import com.google.zxing.FormatException
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader

/**
 * Decodes QR codes from a Camera2 YUV_420_888 Y (luminance) plane using ZXing core.
 * Pure-Java, GMS-free — Quest/Horizon OS has no Google Play Services.
 *
 * Dedupes repeated payloads within [dedupeWindowMs] so one physical QR doesn't fire every frame.
 */
class QrDecoder(private val dedupeWindowMs: Long) {

    private val reader = QRCodeReader()
    private val hints = mapOf<DecodeHintType, Any>(DecodeHintType.TRY_HARDER to true)

    private var lastText: String? = null
    private var lastTimeMs: Long = 0L

    /**
     * @param yPlane tightly-packed luminance bytes (length == width*height, no row padding)
     * @return decoded text, or null if no QR found / a duplicate inside the dedupe window
     */
    fun decode(yPlane: ByteArray, width: Int, height: Int): String? {
        val source = PlanarYUVLuminanceSource(
            yPlane, width, height, 0, 0, width, height, false
        )
        val bitmap = BinaryBitmap(HybridBinarizer(source))
        val text: String? = try {
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
        if (text.isNullOrEmpty()) return null

        val now = System.currentTimeMillis()
        if (text == lastText && now - lastTimeMs < dedupeWindowMs) return null
        lastText = text
        lastTimeMs = now
        return text
    }
}
