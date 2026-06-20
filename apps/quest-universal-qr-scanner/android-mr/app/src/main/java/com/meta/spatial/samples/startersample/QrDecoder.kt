package com.meta.spatial.samples.startersample

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
