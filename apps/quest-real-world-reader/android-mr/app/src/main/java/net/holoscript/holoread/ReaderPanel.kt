// @generated from reader.holo UI, @magnifiable, and @speech_synthesis. DO NOT EDIT.
package net.holoscript.holoread

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meta.spatial.uiset.theme.LocalColorScheme
import com.meta.spatial.uiset.theme.SpatialTheme
import com.meta.spatial.uiset.theme.darkSpatialColorScheme

enum class ReaderScreen { CONSENT, READY, WORKING, RESULT, ERROR }

object ReaderState {
  var screen by mutableStateOf(ReaderScreen.CONSENT)
  var status by mutableStateOf("Camera access is off")
  var preview by mutableStateOf<ImageBitmap?>(null)
  var recognizedText by mutableStateOf("")
  var magnification by mutableFloatStateOf(ReaderContent.minMagnification)
  var contextTerms by mutableStateOf<List<String>>(emptyList())
  var selectedTerm by mutableStateOf("")
  var explanation by mutableStateOf("")
  var menuInsights by mutableStateOf<List<VocabularyEntry>>(emptyList())
  var selectedTargetLanguage by mutableStateOf("es")
  var translatedText by mutableStateOf("")
  var translationStatus by mutableStateOf("")
  var onEnable: (() -> Unit)? = null
  var onRead: (() -> Unit)? = null
  var onCopy: ((String) -> Unit)? = null
  var onSpeak: ((String) -> Unit)? = null
  var onExplain: ((String) -> Unit)? = null
  var onTranslate: ((String, String) -> Unit)? = null
  var onOpenSource: ((String, String) -> Unit)? = null

  fun updatePreview(bitmap: Bitmap) {
    preview = bitmap.asImageBitmap()
  }
}

@Composable
fun ReaderPanel() {
  SpatialTheme(colorScheme = darkSpatialColorScheme()) {
    Column(
        modifier =
            Modifier.fillMaxSize()
                .clip(SpatialTheme.shapes.large)
                .background(brush = LocalColorScheme.current.panel)
                .verticalScroll(rememberScrollState())
                .padding(34.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top,
    ) {
      Text(
          ReaderContent.title,
          fontSize = 34.sp,
          fontWeight = FontWeight.Bold,
          color = Color(0xFF67E8F9),
      )
      Spacer(Modifier.size(8.dp))
      Text(ReaderContent.tagline, fontSize = 18.sp, textAlign = TextAlign.Center)
      Spacer(Modifier.size(20.dp))
      when (ReaderState.screen) {
        ReaderScreen.CONSENT -> ConsentScreen()
        ReaderScreen.READY -> CaptureScreen(working = false)
        ReaderScreen.WORKING -> CaptureScreen(working = true)
        ReaderScreen.RESULT -> ResultScreen()
        ReaderScreen.ERROR -> ErrorScreen()
      }
    }
  }
}

@Composable
private fun ConsentScreen() {
  Text(ReaderContent.privacyNote, fontSize = 18.sp, textAlign = TextAlign.Center)
  Spacer(Modifier.size(14.dp))
  Text(ReaderContent.aimTip, fontSize = 16.sp, textAlign = TextAlign.Center)
  Spacer(Modifier.size(24.dp))
  Button(onClick = { ReaderState.onEnable?.invoke() }) { Text(ReaderContent.enableAction) }
}

@Composable
private fun CaptureScreen(working: Boolean) {
  Box(
      modifier =
          Modifier.fillMaxWidth()
              .height(330.dp)
              .clip(RoundedCornerShape(18.dp))
              .background(Color.Black)
              .border(3.dp, Color(0xFF67E8F9), RoundedCornerShape(18.dp)),
      contentAlignment = Alignment.Center,
  ) {
    ReaderState.preview?.let { preview ->
      Image(
          bitmap = preview,
          contentDescription = "Passthrough text targeting preview",
          modifier = Modifier.fillMaxSize(),
          contentScale = ContentScale.Crop,
      )
    }
    Box(
        modifier =
            Modifier.fillMaxWidth(0.72f)
                .height(230.dp)
                .border(2.dp, Color.White, RoundedCornerShape(10.dp))
    )
  }
  Spacer(Modifier.size(14.dp))
  Text(
      if (working) "Reading on device..." else ReaderState.status,
      fontSize = 17.sp,
      textAlign = TextAlign.Center,
  )
  Spacer(Modifier.size(16.dp))
  Button(enabled = !working, onClick = { ReaderState.onRead?.invoke() }) {
    Text(ReaderContent.scanAction)
  }
}

@Composable
private fun ResultScreen() {
  Text(
      ReaderState.recognizedText,
      modifier = Modifier.fillMaxWidth(),
      fontSize = (24f * ReaderState.magnification).sp,
      lineHeight = (30f * ReaderState.magnification).sp,
      textAlign = TextAlign.Start,
  )
  Spacer(Modifier.size(20.dp))
  val text = ReaderState.recognizedText
  Row(
      modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
      horizontalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    Button(onClick = { ReaderState.onCopy?.invoke(text) }) { Text(ReaderContent.copyAction) }
    Button(onClick = { ReaderState.onSpeak?.invoke(text) }) { Text(ReaderContent.speakAction) }
    Button(
        enabled = ReaderState.magnification < ReaderContent.maxMagnification,
        onClick = {
          ReaderState.magnification =
              minOf(ReaderContent.maxMagnification, ReaderState.magnification + 0.5f)
        },
    ) {
      Text("Bigger")
    }
    Button(
        enabled = ReaderState.magnification > ReaderContent.minMagnification,
        onClick = {
          ReaderState.magnification =
              maxOf(ReaderContent.minMagnification, ReaderState.magnification - 0.5f)
        },
    ) {
      Text("Smaller")
    }
  }
  Spacer(Modifier.size(12.dp))
  Text(
      "Words and context",
      modifier = Modifier.fillMaxWidth(),
      fontSize = 21.sp,
      fontWeight = FontWeight.Bold,
  )
  Spacer(Modifier.size(8.dp))
  Row(
      modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    ReaderState.contextTerms.forEach { term ->
      Button(
          onClick = {
            ReaderState.selectedTerm = term
            ReaderState.onExplain?.invoke(term)
          }
      ) {
        Text(term)
      }
    }
  }
  if (ReaderState.selectedTerm.isNotBlank()) {
    Spacer(Modifier.size(10.dp))
    Text(
        ReaderState.selectedTerm,
        modifier = Modifier.fillMaxWidth(),
        fontSize = 20.sp,
        fontWeight = FontWeight.Bold,
        color = Color(0xFF67E8F9),
    )
    Text(
        ReaderState.explanation,
        modifier = Modifier.fillMaxWidth(),
        fontSize = 17.sp,
    )
    Spacer(Modifier.size(8.dp))
    Text(
        ReaderContent.sourceNotice,
        modifier = Modifier.fillMaxWidth(),
        fontSize = 14.sp,
    )
    Spacer(Modifier.size(6.dp))
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Button(
          onClick = {
            ReaderState.onOpenSource?.invoke("article", ReaderState.selectedTerm)
          }
      ) {
        Text("Article")
      }
      Button(
          onClick = {
            ReaderState.onOpenSource?.invoke("image", ReaderState.selectedTerm)
          }
      ) {
        Text("Images")
      }
      Button(
          onClick = {
            ReaderState.onOpenSource?.invoke("video", ReaderState.selectedTerm)
          }
      ) {
        Text("Video")
      }
    }
  }
  if (ReaderState.menuInsights.isNotEmpty()) {
    Spacer(Modifier.size(16.dp))
    Text(
        "Menu connections",
        modifier = Modifier.fillMaxWidth(),
        fontSize = 21.sp,
        fontWeight = FontWeight.Bold,
    )
    ReaderState.menuInsights.forEach { entry ->
      Spacer(Modifier.size(8.dp))
      Text(
          entry.term + " · " + entry.category,
          modifier = Modifier.fillMaxWidth(),
          fontSize = 18.sp,
          fontWeight = FontWeight.Bold,
      )
      Text(entry.definition, modifier = Modifier.fillMaxWidth(), fontSize = 16.sp)
      Text(
          "How it connects: " + entry.relationships.joinToString("; "),
          modifier = Modifier.fillMaxWidth(),
          fontSize = 15.sp,
      )
      Text(
          entry.allergenNotice,
          modifier = Modifier.fillMaxWidth(),
          fontSize = 15.sp,
          color = Color(0xFFFBBF24),
      )
    }
    Spacer(Modifier.size(8.dp))
    Text(
        "Ingredients vary. " + ReaderContent.allergenDisclaimer,
        modifier = Modifier.fillMaxWidth(),
        fontSize = 14.sp,
        color = Color(0xFFFBBF24),
    )
  }
  Spacer(Modifier.size(16.dp))
  Text(
      ReaderContent.translateAction,
      modifier = Modifier.fillMaxWidth(),
      fontSize = 21.sp,
      fontWeight = FontWeight.Bold,
  )
  Text(ReaderContent.translationNote, modifier = Modifier.fillMaxWidth(), fontSize = 14.sp)
  Spacer(Modifier.size(8.dp))
  Row(
      modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    ReaderContent.targetLanguages.forEach { language ->
      Button(onClick = { ReaderState.selectedTargetLanguage = language }) {
        Text(languageLabel(language))
      }
    }
  }
  Spacer(Modifier.size(8.dp))
  Button(
      onClick = {
        ReaderState.onTranslate?.invoke(text, ReaderState.selectedTargetLanguage)
      }
  ) {
    Text(ReaderContent.translateAction + " to " + languageLabel(ReaderState.selectedTargetLanguage))
  }
  if (ReaderState.translationStatus.isNotBlank()) {
    Spacer(Modifier.size(8.dp))
    Text(ReaderState.translationStatus, modifier = Modifier.fillMaxWidth(), fontSize = 15.sp)
  }
  if (ReaderState.translatedText.isNotBlank()) {
    Spacer(Modifier.size(8.dp))
    Text(
        ReaderState.translatedText,
        modifier = Modifier.fillMaxWidth(),
        fontSize = 20.sp,
        lineHeight = 26.sp,
    )
  }
  Spacer(Modifier.size(16.dp))
  Button(onClick = { ReaderState.onRead?.invoke() }) { Text("Read again") }
}

private fun languageLabel(tag: String): String =
    when (tag) {
      "en" -> "English"
      "es" -> "Spanish"
      "fr" -> "French"
      "de" -> "German"
      "it" -> "Italian"
      "ja" -> "Japanese"
      "ko" -> "Korean"
      "zh" -> "Chinese"
      else -> tag
    }

@Composable
private fun ErrorScreen() {
  Text(ReaderState.status, fontSize = 19.sp, textAlign = TextAlign.Center)
  Spacer(Modifier.size(18.dp))
  Button(onClick = { ReaderState.onRead?.invoke() }) { Text("Try again") }
}
