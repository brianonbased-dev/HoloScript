package net.holoscript.qrscanner

/*
 * @generated from scanner.holo by the quest compiler (compile_to_quest, surface: immersive_mr).
 * DO NOT EDIT — change the app by editing scanner.holo's onboarding / tutorial / spatial_panel
 * traits and recompiling. The Compose UI in ScannerPanel.kt renders THIS data.
 */
object ScannerContent {
  const val appName = "HoloQR"
  const val title = "HoloQR"
  const val tagline = "Read QR codes — right in mixed reality"
  const val aimTip = "Center the QR in your view, about an arm's length away, and hold steady for a moment."
  const val startAction = "Start scanning"
  const val tutorialAction = "See how it works"
  const val tutorialHeading = "How it works"
  const val demoUrl = "https://holoscript.studio"

  // world_portal copy (scan a QR → enter a HoloScript world).
  const val leaveAction = "Leave world"
  const val enteringLabel = "Entered"
  const val demoWorldUrl = "holoscript://world/hololand"

  val howTo: List<HowTo> =
      listOf(
          HowTo("At your computer", "Look at a QR on your screen — the scanner reads it straight through passthrough."),
          HowTo("On the go", "Out in the world? Just look at a QR code — posters, products, signs, menus."),
          HowTo("From a phone", "Show a QR on another phone or screen and look at it."),
          HowTo("Into a world", "Scan a HoloScript world QR to step inside it — then keep scanning to hop worlds."),
      )

  val tutorialSteps: List<String> =
      listOf(
          "Look at a QR code in your space — no buttons, it reads automatically.",
          "When it reads, a card appears with the link.",
          "Tap Open to launch it in the Quest browser.",
          "Scan a HoloScript world QR to step inside it — your room fades and you're in the world, still scanning.",
      )

  // Spatial-panel placement (meters; Spatial SDK is left-handed, +Z = forward).
  const val panelX = 0.0f
  const val panelY = 1.3f
  const val panelZ = 1.5f
}
