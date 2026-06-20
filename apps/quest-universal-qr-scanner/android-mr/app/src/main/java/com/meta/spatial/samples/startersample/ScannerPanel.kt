/*
 * @generated from scanner.holo by the quest compiler (compile_to_quest, surface: immersive_mr).
 * DO NOT EDIT — change copy in scanner.holo (onboarding/tutorial) and recompile.
 *
 * Universal QR Scanner — spatial panel UI (Compose). Screens (all @generated from scanner.holo's
 * `onboarding`, `tutorial`, `ambient_scan`): WELCOME → TUTORIAL → SCANNING.
 *  - Panels scroll (never clip) and carry Back navigation.
 *  - TUTORIAL plays an animated demo: a scan line sweeps the on-device mock QR, then a success
 *    checkmark animates in with the decoded link.
 *  - SCANNING shows only a small "Scanning… / Menu" pill (the rest transparent) so the user keeps
 *    working; a real read pops a full RESULT card, then it returns to the pill.
 */
package com.meta.spatial.samples.startersample

import android.graphics.Bitmap
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.meta.spatial.uiset.theme.LocalColorScheme
import com.meta.spatial.uiset.theme.SpatialTheme
import com.meta.spatial.uiset.theme.darkSpatialColorScheme
import kotlinx.coroutines.delay

enum class Screen {
  WELCOME,
  TUTORIAL,
  SCANNING,
}

data class HowTo(val context: String, val text: String)

private val ScanAccent = Color(0xFF34D399)
private val SuccessGreen = Color(0xFF22C55E)
private const val QR_DP = 180

fun qrImageBitmap(text: String, sizePx: Int): ImageBitmap {
  val bits = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, sizePx, sizePx)
  val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
  for (x in 0 until sizePx) {
    for (y in 0 until sizePx) {
      bmp.setPixel(x, y, if (bits.get(x, y)) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
    }
  }
  return bmp.asImageBitmap()
}

object ScannerState {
  var screen by mutableStateOf(Screen.WELCOME)
  var status by mutableStateOf("Point at a QR code…")
  var lastResult by mutableStateOf<String?>(null)
  var pendingUrl by mutableStateOf<String?>(null)
  var onOpen: ((String) -> Unit)? = null
  var onStart: (() -> Unit)? = null
  var mockQr by mutableStateOf<ImageBitmap?>(null)

  // Content comes from ScannerContent.kt — @generated from scanner.holo by the quest compiler.
  // Edit copy in scanner.holo (onboarding/tutorial), recompile — never here.
  val title = ScannerContent.title
  val tagline = ScannerContent.tagline
  val howTo = ScannerContent.howTo
  val aimTip = ScannerContent.aimTip
  val demoUrl = ScannerContent.demoUrl

  fun reset() {
    pendingUrl = null
    lastResult = null
    status = "Point at a QR code…"
  }
}

@Composable
fun ScannerPanel() {
  SpatialTheme(colorScheme = darkSpatialColorScheme()) {
    when (ScannerState.screen) {
      Screen.WELCOME -> PanelSurface { WelcomeScreen() }
      Screen.TUTORIAL -> PanelSurface { TutorialScreen() }
      Screen.SCANNING ->
          // Ambient: while scanning, render NOTHING (clear passthrough). A read pops the result card
          // on the head-locked panel; dismissing it returns to the clear view.
          if (ScannerState.pendingUrl != null || ScannerState.lastResult != null) {
            PanelSurface { ResultCard() }
          }
    }
  }
}

/** Full panel surface — scrollable so content never clips, top-aligned. */
@Composable
private fun PanelSurface(content: @Composable () -> Unit) {
  Column(
      modifier =
          Modifier.fillMaxSize()
              .clip(SpatialTheme.shapes.large)
              .background(brush = LocalColorScheme.current.panel)
              .verticalScroll(rememberScrollState())
              .padding(40.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Top,
  ) {
    content()
  }
}

@Composable
private fun WelcomeScreen() {
  Heading(ScannerState.title)
  Spacer(Modifier.size(8.dp))
  Body(ScannerState.tagline, secondary = true)
  Spacer(Modifier.size(22.dp))
  ScannerState.howTo.forEach { row ->
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
      Text(
          text = row.context,
          modifier = Modifier.width(210.dp),
          style = SpatialTheme.typography.body1Strong.copy(color = SpatialTheme.colorScheme.primaryAlphaBackground),
      )
      Spacer(Modifier.size(14.dp))
      Body(row.text)
    }
  }
  Spacer(Modifier.size(16.dp))
  Body(ScannerState.aimTip, secondary = true)
  Spacer(Modifier.size(24.dp))
  Row {
    Button(onClick = { ScannerState.screen = Screen.TUTORIAL }) { Text("See how it works") }
    Spacer(Modifier.size(14.dp))
    Button(onClick = { startScanning() }) { Text("Start scanning") }
  }
}

@Composable
private fun TutorialScreen() {
  var demoKey by remember { mutableStateOf(0) }
  var scanned by remember { mutableStateOf(false) }
  LaunchedEffect(demoKey) {
    scanned = false
    delay(2400)
    scanned = true
  }

  Heading("How it works")
  Spacer(Modifier.size(16.dp))
  Box(modifier = Modifier.size(QR_DP.dp), contentAlignment = Alignment.Center) {
    ScannerState.mockQr?.let { qr ->
      Image(
          bitmap = qr,
          contentDescription = "Example QR code",
          modifier = Modifier.size(QR_DP.dp).clip(RoundedCornerShape(12.dp)).alpha(if (scanned) 0.35f else 1f),
      )
    }
    if (!scanned) {
      val inf = rememberInfiniteTransition(label = "scan")
      val y by
          inf.animateFloat(
              initialValue = 0f,
              targetValue = QR_DP.toFloat(),
              animationSpec = infiniteRepeatable(tween(1100, easing = LinearEasing), RepeatMode.Restart),
              label = "scanY",
          )
      Box(modifier = Modifier.width(QR_DP.dp).height(3.dp).offset(y = (y - QR_DP / 2f).dp).background(ScanAccent))
    } else {
      val scale by animateFloatAsState(targetValue = 1f, animationSpec = tween(420), label = "check")
      Box(
          modifier = Modifier.size(96.dp).scale(scale).clip(CircleShape).background(SuccessGreen),
          contentAlignment = Alignment.Center,
      ) {
        Text(text = "✓", fontSize = 56.sp, fontWeight = FontWeight.Medium, color = Color.White)
      }
    }
  }
  Spacer(Modifier.size(14.dp))
  if (!scanned) {
    Body("Scanning…", secondary = true)
  } else {
    Text(text = "Scanned!", style = SpatialTheme.typography.body1Strong.copy(color = SuccessGreen))
    Spacer(Modifier.size(2.dp))
    Body(ScannerState.demoUrl, secondary = true)
  }
  Spacer(Modifier.size(10.dp))
  Body("Look at any real QR and it reads automatically.", secondary = true)
  Spacer(Modifier.size(22.dp))
  Row {
    Button(onClick = { ScannerState.screen = Screen.WELCOME }) { Text("Back") }
    Spacer(Modifier.size(12.dp))
    Button(onClick = { demoKey++ }) { Text("Replay") }
    Spacer(Modifier.size(12.dp))
    Button(onClick = { startScanning() }) { Text("Start scanning") }
  }
}

@Composable
private fun ResultCard() {
  val scale by animateFloatAsState(targetValue = 1f, animationSpec = tween(360), label = "result")
  Box(
      modifier = Modifier.size(88.dp).scale(scale).clip(CircleShape).background(SuccessGreen),
      contentAlignment = Alignment.Center,
  ) {
    Text(text = "✓", fontSize = 48.sp, color = Color.White)
  }
  Spacer(Modifier.size(14.dp))
  Heading("QR found")
  Spacer(Modifier.size(12.dp))
  val url = ScannerState.pendingUrl
  if (url != null) {
    Body(url)
    Spacer(Modifier.size(20.dp))
    Row {
      Button(
          onClick = {
            ScannerState.onOpen?.invoke(url)
            ScannerState.reset()
          }
      ) {
        Text("Open in browser")
      }
      Spacer(Modifier.size(14.dp))
      Button(onClick = { ScannerState.reset() }) { Text("Dismiss") }
    }
  } else {
    Body(ScannerState.lastResult ?: "")
    Spacer(Modifier.size(20.dp))
    Button(onClick = { ScannerState.reset() }) { Text("Dismiss") }
  }
}

private fun startScanning() {
  ScannerState.reset()
  ScannerState.screen = Screen.SCANNING
  ScannerState.onStart?.invoke()
}

@Composable
private fun Heading(text: String) {
  Text(
      text = text,
      textAlign = TextAlign.Center,
      style = SpatialTheme.typography.headline1Strong.copy(color = SpatialTheme.colorScheme.primaryAlphaBackground),
  )
}

@Composable
private fun Body(text: String, secondary: Boolean = false) {
  Text(
      text = text,
      textAlign = TextAlign.Center,
      style =
          SpatialTheme.typography.body1.copy(
              color =
                  if (secondary) SpatialTheme.colorScheme.secondaryAlphaBackground
                  else SpatialTheme.colorScheme.primaryAlphaBackground
          ),
  )
}
