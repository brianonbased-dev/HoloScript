// @generated from reader.holo @document_ocr(engine="mlkit_bundled"). DO NOT EDIT.
package net.holoscript.holoread

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

class TextRecognizer : AutoCloseable {
  private val client = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  fun recognize(
      bitmap: Bitmap,
      onResult: (String) -> Unit,
      onError: (String) -> Unit,
  ) {
    val image = InputImage.fromBitmap(bitmap, 0)
    client.process(image)
        .addOnSuccessListener { result -> onResult(result.text.trim()) }
        .addOnFailureListener { error -> onError(error.message ?: "Text recognition failed") }
  }

  override fun close() {
    client.close()
  }
}
