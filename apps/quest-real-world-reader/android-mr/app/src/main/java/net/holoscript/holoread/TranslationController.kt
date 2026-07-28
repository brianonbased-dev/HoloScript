// @generated from reader.holo @translation(provider="mlkit_on_device"). DO NOT EDIT.
package net.holoscript.holoread

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.languageid.LanguageIdentifier
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions

class TranslationController : AutoCloseable {
  private val languageIdentifier: LanguageIdentifier = LanguageIdentification.getClient()
  private var activeTranslator: Translator? = null

  fun translate(
      text: String,
      targetTag: String,
      onStatus: (String) -> Unit,
      onSuccess: (String) -> Unit,
      onError: (String) -> Unit,
  ) {
    if (text.isBlank()) {
      onError("There is no recognized text to translate")
      return
    }
    if (targetTag !in ReaderContent.targetLanguages) {
      onError("That translation language is not allowed by this HoloScript program")
      return
    }
    languageIdentifier
        .identifyLanguage(text)
        .addOnSuccessListener { identifiedTag ->
          val sourceTag = if (identifiedTag == "und") "en" else identifiedTag
          val sourceLanguage = TranslateLanguage.fromLanguageTag(sourceTag)
          val targetLanguage = TranslateLanguage.fromLanguageTag(targetTag)
          if (sourceLanguage == null || targetLanguage == null) {
            onError("This language pair is not supported on this device")
          } else if (sourceLanguage == targetLanguage) {
            onStatus("The text is already in the selected language")
            onSuccess(text)
          } else {
            translateWithModel(text, sourceLanguage, targetLanguage, onStatus, onSuccess, onError)
          }
        }
        .addOnFailureListener { onError("Language detection failed") }
  }

  private fun translateWithModel(
      text: String,
      sourceLanguage: String,
      targetLanguage: String,
      onStatus: (String) -> Unit,
      onSuccess: (String) -> Unit,
      onError: (String) -> Unit,
  ) {
    activeTranslator?.close()
    val options =
        TranslatorOptions.Builder()
            .setSourceLanguage(sourceLanguage)
            .setTargetLanguage(targetLanguage)
            .build()
    val translator = Translation.getClient(options)
    activeTranslator = translator
    val conditions = DownloadConditions.Builder().requireWifi().build()
    onStatus("Preparing an on-device language model over Wi-Fi")
    translator
        .downloadModelIfNeeded(conditions)
        .addOnSuccessListener {
          onStatus("Translating on device")
          translator
              .translate(text)
              .addOnSuccessListener { translated ->
                onSuccess(translated)
                release(translator)
              }
              .addOnFailureListener {
                onError("Translation failed")
                release(translator)
              }
        }
        .addOnFailureListener {
          onError("Language model download failed. Connect to Wi-Fi and try again.")
          release(translator)
        }
  }

  private fun release(translator: Translator) {
    translator.close()
    if (activeTranslator === translator) activeTranslator = null
  }

  override fun close() {
    languageIdentifier.close()
    activeTranslator?.close()
    activeTranslator = null
  }
}
