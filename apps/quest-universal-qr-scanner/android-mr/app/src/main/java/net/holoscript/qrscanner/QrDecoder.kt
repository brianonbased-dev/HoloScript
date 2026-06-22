package net.holoscript.qrscanner

import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.common.HybridBinarizer

/*
 * @generated from scanner.holo by the quest compiler (compile_to_quest, surface: immersive_mr).
 * DO NOT EDIT — change decode behavior in scanner.holo's `decoder qr` block and recompile.
 *
 * ZXing QR decode from a Y (luminance) plane. Pure-Java, GMS-free (Quest has no Play Services).
 * Always reads with TRY_HARDER and ALSO_INVERTED (dark-mode / light-on-dark monitor QRs). If the full
 * frame returns nothing, a second pass searches a centered crop for a small/centered code.
 * No dedupe/throttle here — the controller owns scan cadence and cooldown.
 */
class QrDecoder {
    private val reader = MultiFormatReader().apply {
        setHints(
            mapOf(
                DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
                DecodeHintType.TRY_HARDER to true,
                DecodeHintType.ALSO_INVERTED to true,
            )
        )
    }

    fun decode(yPlane: ByteArray, width: Int, height: Int): String? {
        decodeRegion(yPlane, width, height, 0, 0, width, height)?.let { return it }
        // Center-crop fallback for a small/centered code.
        val cw = minOf(640, width)
        val ch = minOf(480, height)
        val left = (width - cw) / 2
        val top = (height - ch) / 2
        return decodeRegion(yPlane, width, height, left, top, cw, ch)
    }

    private fun decodeRegion(
        yPlane: ByteArray,
        dataWidth: Int,
        dataHeight: Int,
        left: Int,
        top: Int,
        w: Int,
        h: Int,
    ): String? {
        val source = PlanarYUVLuminanceSource(yPlane, dataWidth, dataHeight, left, top, w, h, false)
        val bitmap = BinaryBitmap(HybridBinarizer(source))
        return try {
            reader.decodeWithState(bitmap).text
        } catch (e: ReaderException) {
            null
        } finally {
            reader.reset()
        }
    }
}
