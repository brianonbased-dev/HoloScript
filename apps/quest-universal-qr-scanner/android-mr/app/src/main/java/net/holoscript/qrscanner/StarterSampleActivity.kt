/*
 * @generated from scanner.holo by the quest compiler (compile_to_quest, surface: immersive_mr).
 * DO NOT EDIT — change the app in scanner.holo and recompile.
 *
 * Universal QR Scanner — immersive Meta Spatial SDK (MR) app. Passthrough MR + a programmatic Compose
 * spatial panel; the passthrough Camera2 feed is decoded with ZXing and results drive the panel.
 */
package net.holoscript.qrscanner

import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.compose.ui.platform.ComposeView
import com.meta.spatial.compose.ComposeFeature
import com.meta.spatial.compose.ComposeViewPanelRegistration
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.SpatialFeature
import com.meta.spatial.core.Query
import com.meta.spatial.core.Vector3
import com.meta.spatial.runtime.ButtonBits
import com.meta.spatial.runtime.ReferenceSpace
import com.meta.spatial.toolkit.AppSystemActivity
import com.meta.spatial.toolkit.Controller
import com.meta.spatial.toolkit.ControllerType
import com.meta.spatial.toolkit.DpPerMeterDisplayOptions
import com.meta.spatial.toolkit.Panel
import com.meta.spatial.toolkit.PanelRegistration
import com.meta.spatial.toolkit.PanelStyleOptions
import com.meta.spatial.toolkit.QuadShapeOptions
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.UIPanelSettings
import com.meta.spatial.vr.LocomotionSystem
import com.meta.spatial.vr.VRFeature

/** What to do with a scanned payload: OPEN it in the Quest browser, or COPY it to the clipboard. */
enum class QrAction { OPEN, COPY }

/** A classified QR payload: its content kind, the result-card label, and the primary action. */
data class QrContent(val kind: String, val label: String, val action: QrAction)

class StarterSampleActivity : AppSystemActivity() {

  private val cameraPermission = "horizonos.permission.HEADSET_CAMERA"
  private val tag = "QrScanner"
  private var controller: PassthroughCameraController? = null
  private var panelEntity: Entity? = null
  private val worldRenderer = WorldRenderer() // builds/tears down the themed 3D world while immersed
  private var smoothPose: Pose? = null // last head-locked panel pose, eased toward the head each tick
  private var sceneReady = false

  // Audible scan feedback (scanner.holo @qr_decode.feedback.sound): a short confirmation beep on every
  // decode so the user gets a non-visual cue even before they look at the result card. A reused
  // ToneGenerator (no audio asset needed); released in onSpatialShutdown.
  private val scanSound = true
  private var toneGen: ToneGenerator? = null

  // Custom continuous MMO locomotion: the player rig's accumulated world position + heading, integrated
  // each tick from the thumbstick DIRECTION bits on the Controller component (ButtonBits) — the SDK's
  // own input path (LocomotionSystem.isLeftRightButtonPressed) — and applied via scene.setViewOrigin.
  // This REPLACES the SDK's teleport locomotion in worlds with free continuous roam (F.118 MMO
  // mobility). The public stick is digital 4-way (no analog magnitude), which is classic MMO movement.
  private var playerX = 0f
  private var playerZ = 0f
  private var playerYaw = 0f // degrees; the rig heading (right stick turns it)
  private var lastLocoNanos = 0L

  override fun registerFeatures(): List<SpatialFeature> =
      mutableListOf<SpatialFeature>(VRFeature(this), ComposeFeature())

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    ScannerState.onOpen = { url -> openInQuestBrowser(url) }
    ScannerState.onStart = { maybeStartScanner() }
    ScannerState.onDismiss = { controller?.resumeScanning() } // resume scanning after a result clears
    ScannerState.onCopy = { text -> copyToClipboard(text) } // copy a non-link result to the clipboard
    ScannerState.onEnterWorld = { link -> enterWorld(link) } // scan a world QR → immerse
    ScannerState.onLeaveWorld = { leaveWorld() } // in-world "Leave world" → back to passthrough scanning
    ScannerState.mockQr = qrImageBitmap(ScannerState.demoUrl, 360) // tutorial mock QR (on-device)
    if (!hasCameraPermission()) {
      requestPermissions(arrayOf(cameraPermission), REQUEST_CAMERA)
    }
  }

  // Returning from the Quest browser (or any background) releases the camera; re-arm scanning so the
  // loop never gets stuck after Open/Dismiss. If the controller survived but was paused, resume it.
  override fun onResume() {
    super.onResume()
    if ((ScannerState.screen == Screen.SCANNING || ScannerState.screen == Screen.IN_WORLD) &&
        hasCameraPermission()) {
      if (controller == null) maybeStartScanner() else controller?.resumeScanning()
    }
  }

  override fun onSceneReady() {
    super.onSceneReady()
    scene.setReferenceSpace(ReferenceSpace.LOCAL_FLOOR)

    // Lighting for compiled worlds: a warm directional sun + soft ambient. Lit Materials shade with
    // depth; unlit "glow" Materials read as emissive. No IBL cubemap asset needed. (Harmless during
    // passthrough scanning — there is no 3D content then.)
    scene.setLightingEnvironment(
        Vector3(0.42f, 0.45f, 0.55f),
        Vector3(2.6f, 2.45f, 2.1f),
        -Vector3(1.0f, 2.6f, -1.4f),
        0.0f,
    )

    // Mixed reality: the user sees their real room (passthrough); the spatial panel floats in front.
    scene.enablePassthrough(true)

    // Panel placement comes from scanner.holo's spatial_panel.place via @generated ScannerContent.
    // (Spatial SDK is left-handed, +Z = forward — negative z renders the panel behind the user.)
    if (panelEntity == null) {
      panelEntity = Entity.create(
          listOf(
              Panel(R.id.panel),
              Transform(Pose(Vector3(ScannerContent.panelX, ScannerContent.panelY, ScannerContent.panelZ))),
          )
      )
    }

    sceneReady = true

    // MMO-style mobility invariant (F.118): a player is NEVER seated-locked in a world. If the scene
    // (re)initializes while the user is already immersed, full locomotion (left-stick glide + right-
    // stick turn, via the Spatial SDK LocomotionSystem) must be ON. The scanner HUD — MR passthrough
    // in your real room, not a world — is the only surface where locomotion is intentionally off.
    if (ScannerState.screen == Screen.IN_WORLD) {
      startLocomotion()
    }
    // Camera starts when the user taps "Start scanning" on the welcome screen (ScannerState.onStart).
  }

  // Head-locked HUD: each frame, place the panel FOLLOW_DISTANCE m in front of the head, facing the
  // user (Spatial SDK is left-handed, +Z = forward). The panel moves with your gaze — never stationary.
  // Position is EASED toward the head (lerp) so the HUD trails gently instead of rigidly snapping;
  // facing snaps to the head so text stays square to the eyes.
  override fun onSceneTick() {
    super.onSceneTick()
    if (!sceneReady) return
    // YIELD TO THE SYSTEM: when the Meta button opens the universal menu the app loses window focus
    // (it keeps rendering — focusaware) but must STOP driving the scene. Otherwise the head-locked,
    // interactive panel keeps following the head into the menu and competes for the controller pointer,
    // so the universal menu can't be dismissed ("menu opens and doesn't close"). Freeze the panel +
    // locomotion until focus returns; the system menu then behaves normally.
    if (!hasWindowFocus()) return
    if (ScannerState.screen == Screen.IN_WORLD) updateLocomotion() // MMO free-roam while immersed
    val p = panelEntity ?: return
    val target = scene.getViewerPose().times(Pose(Vector3(0f, 0f, FOLLOW_DISTANCE)))
    val cur = smoothPose
    val next =
        if (cur == null) {
          target
        } else {
          val a = HEAD_LOCK_SMOOTHING
          val t =
              Vector3(
                  cur.t.x + (target.t.x - cur.t.x) * a,
                  cur.t.y + (target.t.y - cur.t.y) * a,
                  cur.t.z + (target.t.z - cur.t.z) * a,
              )
          Pose(t, target.q)
        }
    smoothPose = next
    p.setComponents(Transform(next))

    // Simulate the world (spin / orbit / bob / float / sway) while immersed.
    worldRenderer.tick()
  }

  private fun maybeStartScanner() {
    if (controller != null ||
        !sceneReady ||
        !hasCameraPermission() ||
        ScannerState.screen != Screen.SCANNING)
        return
    ScannerState.status = "Point at a QR code…"
    controller =
        PassthroughCameraController(
                context = this,
                onDecoded = { text -> runOnUiThread { onDecoded(text) } },
                onError = { msg -> runOnUiThread { ScannerState.status = msg } },
            )
            .also { it.start() }
  }

  private fun onDecoded(text: String) {
    Log.i(tag, "decoded: $text")
    controller?.pauseScanning() // hold scanning while the result card is shown; resume on dismiss/open
    if (scanSound) playScanTone() // audible confirmation cue (config: @qr_decode.feedback.sound)
    // FUNCTIONAL-CORE / IMPERATIVE-SHELL: the ROUTING DECISION (which of four outcomes a scan is) is
    // .hs-authored pure boolean logic (Routing.decideRoute, below). This shell computes the three
    // boolean inputs — a HoloScript world link takes precedence (its own @world_portal patterns);
    // otherwise classify the payload (url / wifi / contact / email / phone / sms / geo / event / text)
    // from scanner.holo's @qr_decode.content_types — then APPLIES the returned route (state writes +
    // host call). classifyContent is computed only for non-world payloads (it only drives those routes).
    val isWorld = WorldPortal.isWorldLink(text)
    val c: QrContent? = if (isWorld) null else classifyContent(text)
    val isOpen = c?.action == QrAction.OPEN
    when (Routing.decideRoute(isWorld, WorldPortal.autoImmerse, isOpen)) {
      Routing.Route.EnterWorld -> enterWorld(text)
      Routing.Route.PendingWorld -> {
        ScannerState.pendingWorld = text
        ScannerState.pendingUrl = null
        ScannerState.lastResult = null
        ScannerState.resultKind = null
        ScannerState.resultLabel = null
        ScannerState.status = "World found — enter it?"
      }
      Routing.Route.OpenUrl -> {
        ScannerState.resultKind = c!!.kind
        ScannerState.resultLabel = c.label
        ScannerState.pendingUrl = text
        ScannerState.lastResult = null
        ScannerState.status = c.label + " — open it?"
      }
      Routing.Route.ShowResult -> {
        ScannerState.resultKind = c!!.kind
        ScannerState.resultLabel = c.label
        ScannerState.pendingUrl = null
        ScannerState.lastResult = text
        ScannerState.status = c.label
      }
    }
  }

  // ── @generated from logic/Routing.logic.hs (compile_to_kotlin) ──────────────────────────────
  // Pure boolean ROUTING DECISION for a decoded scan: the `enum class Route` + decideRoute(). The
  // onDecoded() shell above owns ALL side effects (Log / pauseScanning / playScanTone), the boolean
  // computations (WorldPortal.isWorldLink / classifyContent / WorldPortal.autoImmerse), the
  // ScannerState writes, and the enterWorld() host call; this object is the .hs-authored decision it
  // applies. Change logic/Routing.logic.hs and recompile — never hand-edit here.
  private object Routing {
    enum class Route { EnterWorld, PendingWorld, OpenUrl, ShowResult }

    fun decideRoute(isWorldLink: Boolean, autoImmerse: Boolean, isOpenAction: Boolean): Route {
      if (isWorldLink) {
        if (autoImmerse) {
          return Route.EnterWorld
        } else {
          return Route.PendingWorld
        }
      } else {
        if (isOpenAction) {
          return Route.OpenUrl
        } else {
          return Route.ShowResult
        }
      }
    }
  }

  // Immerse into a HoloScript world: drop passthrough (the real room vanishes — you are "in" the
  // world) and float a themed backdrop. The passthrough camera keeps decoding (the Camera2 feed is
  // the physical cameras, independent of what is rendered), so real QRs still scan inside the world —
  // scanning another world link hops worlds.
  private fun enterWorld(link: String) {
    Log.i(tag, "entering world: $link")
    val worldId = WorldPortal.worldId(link)
    // Prefer the compiled HoloScript world's own name; fall back to the name parsed from the link.
    val name = Worlds.displayName(worldId) ?: WorldPortal.worldName(link)
    ScannerState.enterWorld(name)
    if (sceneReady) {
      worldRenderer.enter(worldId) // compiled HoloScript world (worlds/<id>.holo) or themed fallback
      scene.enablePassthrough(false)
      // You're now IN the world — start custom continuous MMO locomotion (left stick = move/strafe,
      // right stick = turn), free continuous roam. Spawn at the world origin facing the scene.
      startLocomotion()
    }
    controller?.resumeScanning() // keep scanning inside the world
  }

  private fun enableLocomotion(on: Boolean) {
    try {
      systemManager.findSystem<LocomotionSystem>().enableLocomotion(on)
    } catch (e: Exception) {
      Log.w(tag, "locomotion toggle failed: ${e.message}")
    }
  }

  // Begin custom continuous locomotion for a world: reset the rig to the origin, prime the tick clock,
  // and turn the SDK's teleport LocomotionSystem OFF so the two don't fight over the view origin.
  private fun startLocomotion() {
    playerX = 0f
    playerZ = 0f
    playerYaw = 0f
    lastLocoNanos = 0L
    enableLocomotion(false) // SDK teleport OFF — custom continuous locomotion drives the rig instead
    scene.setViewOrigin(0f, 0f, 0f, 0f)
  }

  // Per-tick MMO locomotion: OR the thumbstick direction bits across every Controller, integrate
  // heading (right stick) + position (left stick, rig-relative) by dt, and apply via setViewOrigin.
  // Direction signs are tunable on-device (handedness of the yaw/forward convention).
  private fun updateLocomotion() {
    val now = System.nanoTime()
    if (lastLocoNanos == 0L) {
      lastLocoNanos = now
      return
    }
    val dt = (now - lastLocoNanos).coerceAtMost(100_000_000L) / 1_000_000_000f
    lastLocoNanos = now

    val bb = ButtonBits // Kotlin object singleton (reference directly; .INSTANCE is the Java view)
    var fwd = 0f
    var strafe = 0f
    var turn = 0f
    Query.where { has(Controller.id) }.forEach<Controller> { _, c ->
      if (c.type != ControllerType.CONTROLLER) return@forEach
      if (c.isDown(bb.ButtonThumbLU)) fwd += 1f
      if (c.isDown(bb.ButtonThumbLD)) fwd -= 1f
      if (c.isDown(bb.ButtonThumbLR)) strafe += 1f
      if (c.isDown(bb.ButtonThumbLL)) strafe -= 1f
      if (c.isDown(bb.ButtonThumbRR)) turn += 1f
      if (c.isDown(bb.ButtonThumbRL)) turn -= 1f
    }
    if (fwd == 0f && strafe == 0f && turn == 0f) return

    val moveSpeed = 2.6f // m/s — brisk MMO walk
    val turnSpeed = 90f // deg/s smooth comfort turn (right stick), on top of physical/room turning
    // Heading integration is .hs-authored math (Locomotion.newYaw); the shell only owns the state.
    if (turn != 0f) playerYaw = Locomotion.newYaw(playerYaw, turn, turnSpeed, dt)

    if (fwd != 0f || strafe != 0f) {
      // HEAD-RELATIVE movement: walk where you LOOK, not along a fixed rig yaw. (Rig-relative makes a
      // physical head-turn send you the wrong way.) The head's gaze-forward in world space = a point
      // 1 m in front of the head minus the head position, flattened to the ground — the same
      // getViewerPose().times(...) pattern the head-locked HUD uses. getViewerPose already includes the
      // rig yaw set below, so movement stays consistent after a stick turn.
      //
      // The SDK Pose subtraction below is the ONE thing that can't be expressed in .hs (its operands
      // are SDK Vector3 fields); everything downstream — gaze length, normalization, the ground-right
      // axis, and the position integration — is .hs-authored math (Locomotion.*).
      val head = scene.getViewerPose()
      val ahead = head.times(Pose(Vector3(0f, 0f, 1f)))
      val rawFx = ahead.t.x - head.t.x
      val rawFz = ahead.t.z - head.t.z
      val len = Locomotion.gazeLength(rawFx, rawFz)
      if (len > 1e-4f) {
        val fx = Locomotion.normalize(rawFx, len)
        val fz = Locomotion.normalize(rawFz, len)
        val rx = Locomotion.groundRightX(fz) // ground-right.x = -fz (gaze-forward rotated 90°)
        val rz = fx // ground-right.z = fx — a pure identity copy, so no .hs function (see Locomotion)
        playerX = Locomotion.newX(playerX, fwd, fx, strafe, rx, moveSpeed, dt)
        playerZ = Locomotion.newZ(playerZ, fwd, fz, strafe, rz, moveSpeed, dt)
      }
    }
    scene.setViewOrigin(playerX, 0f, playerZ, playerYaw)
  }

  // ── @generated from logic/Locomotion.logic.hs (compile_to_kotlin) ───────────────────────────
  // Pure single-assignment Float math for continuous MMO locomotion. The activity shell above owns
  // ALL state (playerX/playerZ/playerYaw, lastLocoNanos) and EVERY SDK/host call; this object is the
  // .hs-authored arithmetic it integrates with. Change logic/Locomotion.logic.hs and recompile —
  // never hand-edit here.
  private object Locomotion {
    fun newYaw(yaw: Float, turn: Float, turnSpeed: Float, dt: Float): Float {
      return yaw + turn * turnSpeed * dt
    }

    fun gazeLength(fx: Float, fz: Float): Float {
      return kotlin.math.sqrt(fx * fx + fz * fz)
    }

    fun normalize(component: Float, len: Float): Float {
      return component / len
    }

    fun groundRightX(fz: Float): Float {
      return -fz
    }

    fun newX(x: Float, fwd: Float, fx: Float, strafe: Float, rx: Float, moveSpeed: Float, dt: Float): Float {
      return x + (fwd * fx + strafe * rx) * moveSpeed * dt
    }

    fun newZ(z: Float, fwd: Float, fz: Float, strafe: Float, rz: Float, moveSpeed: Float, dt: Float): Float {
      return z + (fwd * fz + strafe * rz) * moveSpeed * dt
    }
  }

  // Leave the world: tear down the 3D world and restore passthrough scanning.
  private fun leaveWorld() {
    Log.i(tag, "leaving world")
    worldRenderer.leave()
    if (sceneReady) {
      enableLocomotion(false) // back to seated passthrough scanning — no movement
      scene.enablePassthrough(true)
    }
    ScannerState.leaveWorld()
    controller?.resumeScanning()
  }

  /** Quest "Web Task" scheme — the documented way to open a URL in the Quest Browser. */
  private fun openInQuestBrowser(url: String) {
    Log.i(tag, "user opened: $url")
    val webtask = "ovrweb://webtask?uri=" + Uri.encode(url)
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webtask)))
    } catch (e: Exception) {
      try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
      } catch (e2: Exception) {
        ScannerState.status = "Could not open browser for: $url"
      }
    }
  }

  // @generated content classifier — the when-arms come from scanner.holo's @qr_decode.content_types
  // (compiler token CONTENT_WHEN). Edit the rule table in scanner.holo and recompile — never here.
  // First match wins; `pre()` is a case-insensitive startsWith over the trimmed payload.
  private fun classifyContent(text: String): QrContent {
    val t = text.trim()
    fun pre(vararg ps: String): Boolean = ps.any { t.startsWith(it, ignoreCase = true) }
    return when {
      pre("http://", "https://") -> QrContent("url", "Link", QrAction.OPEN)
      pre("WIFI:") -> QrContent("wifi", "Wi-Fi network", QrAction.COPY)
      pre("BEGIN:VCARD", "MECARD:") -> QrContent("contact", "Contact card", QrAction.COPY)
      pre("mailto:", "MATMSG:") -> QrContent("email", "Email", QrAction.COPY)
      pre("tel:") -> QrContent("phone", "Phone number", QrAction.COPY)
      pre("sms:", "smsto:") -> QrContent("sms", "Message", QrAction.COPY)
      pre("geo:") -> QrContent("geo", "Location", QrAction.COPY)
      pre("BEGIN:VEVENT") -> QrContent("event", "Calendar event", QrAction.COPY)
      else -> QrContent("text", "Text", QrAction.COPY)
    }
  }

  /** A short confirmation beep on a successful decode (reuses one ToneGenerator). */
  private fun playScanTone() {
    try {
      val tg = toneGen ?: ToneGenerator(AudioManager.STREAM_MUSIC, 80).also { toneGen = it }
      tg.startTone(ToneGenerator.TONE_PROP_BEEP, 150)
    } catch (e: Exception) {
      Log.w(tag, "scan tone failed: ${e.message}")
    }
  }

  /** Copy a non-link result (Wi-Fi, contact, text, …) to the clipboard so the user can use it. */
  private fun copyToClipboard(text: String) {
    try {
      val cm =
          getSystemService(android.content.Context.CLIPBOARD_SERVICE)
              as android.content.ClipboardManager
      cm.setPrimaryClip(android.content.ClipData.newPlainText("QR", text))
      ScannerState.status = "Copied"
    } catch (e: Exception) {
      Log.w(tag, "clipboard failed: ${e.message}")
    }
  }

  private fun hasCameraPermission(): Boolean =
      checkSelfPermission(cameraPermission) == PackageManager.PERMISSION_GRANTED

  override fun onRequestPermissionsResult(
      requestCode: Int,
      permissions: Array<out String>,
      grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQUEST_CAMERA &&
        grantResults.isNotEmpty() &&
        grantResults[0] == PackageManager.PERMISSION_GRANTED) {
      maybeStartScanner()
    } else if (requestCode == REQUEST_CAMERA) {
      ScannerState.status = "Camera permission denied. Enable “Headset cameras” to scan."
    }
  }

  override fun onSpatialShutdown() {
    controller?.stop()
    controller = null
    toneGen?.release()
    toneGen = null
    super.onSpatialShutdown()
  }

  override fun registerPanels(): List<PanelRegistration> =
      listOf(
          // Head-locked HUD panel (welcome / tutorial / result card / in-world pill). The world itself
          // is real 3D geometry built by WorldRenderer — not a panel.
          ComposeViewPanelRegistration(
              R.id.panel,
              composeViewCreator = { _, ctx ->
                ComposeView(ctx).apply { setContent { ScannerPanel() } }
              },
              settingsCreator = {
                UIPanelSettings(
                    shape = QuadShapeOptions(width = 1.2f, height = 1.2f),
                    style = PanelStyleOptions(themeResourceId = R.style.PanelAppThemeTransparent),
                    display = DpPerMeterDisplayOptions(),
                )
              },
          )
      )

  companion object {
    private const val REQUEST_CAMERA = 101
    private const val FOLLOW_DISTANCE = 1.2f
    private const val HEAD_LOCK_SMOOTHING = 0.2f // 0..1 per tick; lower = smoother trail
  }
}
