/**
 * AI Glasses Trait Mapping System
 *
 * Maps HoloScript traits to Jetpack Compose Glimmer components, Jetpack Projected
 * APIs, and Android XR SDK primitives targeting AI Glasses with transparent displays.
 *
 * Used by AIGlassesCompiler for trait-to-native conversion.
 *
 * Platform stack:
 *   - Jetpack Compose Glimmer (Card, Button, Text, ListItem, TitleChip, Surface, Icon)
 *   - Jetpack Projected (ProjectedContext, ProjectedDeviceController, ProjectedDisplayController)
 *   - GlimmerTheme (colors, shapes, typography optimized for optical see-through)
 *   - Touchpad gestures (tap, swipe, long-press) via Modifier.surface(focusable=true)
 *   - Voice command handlers via Android SpeechRecognizer
 *   - ARCore for glasses (lightweight plane detection, camera)
 *
 * Form factor constraints:
 *   - No depth/3D rendering (2D overlay on transparent display)
 *   - Limited FOV (~30 degrees diagonal)
 *   - Ambient display (additive — black is transparent, bright colors for content)
 *   - Input: touchpad on temple arm + voice commands (no hand/eye tracking)
 *   - 2-second animation transitions (not 500ms) for heads-up comfort
 *
 * Target devices:
 *   - Samsung Galaxy XR (Project Haean) — 2026
 *   - Warby Parker / Gentle Monster design partner glasses
 *   - Any Android XR glasses with xr_projected display category
 *
 * @version 1.0.0 — Android XR SDK DP3 + Jetpack Compose Glimmer
 */

// =============================================================================
// AI GLASSES COMPONENT TYPES
// =============================================================================

export type AIGlassesComponent =
  | 'GlimmerCard'
  | 'GlimmerButton'
  | 'GlimmerText'
  | 'GlimmerListItem'
  | 'GlimmerTitleChip'
  | 'GlimmerSurface'
  | 'GlimmerIcon'
  | 'ProjectedDisplayController'
  | 'ProjectedDeviceController'
  | 'ProjectedContext'
  | 'SpeechRecognizer'
  | 'TouchpadGesture'
  | 'CameraProvider'
  | 'AudioManager';

export type TraitImplementationLevel =
  | 'full' // Generates complete Kotlin/Glimmer code
  | 'partial' // Generates some code with placeholders
  | 'comment' // Only generates documentation comment
  | 'unsupported'; // Not available on AI Glasses form factor

export interface AIGlassesTraitMapping {
  /** HoloScript trait name */
  trait: string;
  /** AI Glasses components to use */
  components: AIGlassesComponent[];
  /** Implementation completeness */
  level: TraitImplementationLevel;
  /** Required Kotlin/Android imports */
  imports?: string[];
  /** Required minimum SDK version */
  minSdkVersion?: number;
  /** Code generator function */
  generate: (varName: string, config: Record<string, unknown>) => string[];
}

// =============================================================================
// UI TRAITS — Glimmer Composables (Primary for AI Glasses)
// =============================================================================

export const UI_TRAIT_MAP: Record<string, AIGlassesTraitMapping> = {
  glimmer_card: {
    trait: 'glimmer_card',
    components: ['GlimmerCard', 'GlimmerText', 'GlimmerButton'],
    level: 'full',
    imports: ['androidx.xr.glimmer.Card', 'androidx.xr.glimmer.Text', 'androidx.xr.glimmer.Button'],
    generate: (varName, config) => {
      const title = String(config.title || varName);
      const subtitle = String(config.subtitle || '');
      const actionLabel = String(config.action_label || 'View');
      return [
        `// @glimmer_card -- Glimmer Card composable for transparent HUD`,
        `Card(`,
        `    title = { Text("${title}") },`,
        `    action = {`,
        `        Button(onClick = { /* ${varName} action */ }) {`,
        `            Text("${actionLabel}")`,
        `        }`,
        `    }`,
        `) {`,
        ...(subtitle ? [`    Text("${subtitle}")`] : [`    // ${varName} card content`]),
        `}`,
      ];
    },
  },

  glimmer_list: {
    trait: 'glimmer_list',
    components: ['GlimmerListItem', 'GlimmerText'],
    level: 'full',
    imports: ['androidx.xr.glimmer.ListItem', 'androidx.xr.glimmer.Text'],
    generate: (varName, config) => {
      const items = (config.items as string[]) ?? [];
      const lines = [`// @glimmer_list -- Glimmer List composable for transparent HUD`, `Column {`];
      if (items.length > 0) {
        for (const item of items) {
          lines.push(`    ListItem(label = { Text("${item}") })`);
        }
      } else {
        lines.push(`    ListItem(label = { Text("${varName}") })`);
      }
      lines.push(`}`);
      return lines;
    },
  },

  glimmer_title_chip: {
    trait: 'glimmer_title_chip',
    components: ['GlimmerTitleChip'],
    level: 'full',
    imports: ['androidx.xr.glimmer.TitleChip'],
    generate: (varName, config) => {
      const title = String(config.title || varName);
      return [
        `// @glimmer_title_chip -- Glimmer TitleChip for transparent HUD`,
        `TitleChip(title = "${title}")`,
      ];
    },
  },

  glimmer_button: {
    trait: 'glimmer_button',
    components: ['GlimmerButton', 'GlimmerText'],
    level: 'full',
    imports: ['androidx.xr.glimmer.Button', 'androidx.xr.glimmer.Text'],
    generate: (varName, config) => {
      const label = String(config.label || varName);
      const size = String(config.size || 'medium');
      const sizeMap: Record<string, string> = {
        small: 'ButtonSize.Small',
        medium: 'ButtonSize.Medium',
        large: 'ButtonSize.Large',
      };
      return [
        `// @glimmer_button -- Glimmer Button for transparent HUD`,
        `Button(`,
        `    onClick = { /* ${varName} click handler */ },`,
        `    size = ${sizeMap[size] || 'ButtonSize.Medium'}`,
        `) {`,
        `    Text("${label}")`,
        `}`,
      ];
    },
  },

  glimmer_text: {
    trait: 'glimmer_text',
    components: ['GlimmerText'],
    level: 'full',
    imports: ['androidx.xr.glimmer.Text', 'androidx.xr.glimmer.GlimmerTheme'],
    generate: (varName, config) => {
      const content = String(config.content || config.text || varName);
      const style = String(config.style || 'body');
      const styleMap: Record<string, string> = {
        headline: 'GlimmerTheme.typography.headline',
        body: 'GlimmerTheme.typography.body',
        label: 'GlimmerTheme.typography.label',
        display: 'GlimmerTheme.typography.display',
        title: 'GlimmerTheme.typography.title',
        caption: 'GlimmerTheme.typography.caption',
      };
      return [
        `// @glimmer_text -- Glimmer Text for transparent HUD`,
        `Text(`,
        `    text = "${content}",`,
        `    style = ${styleMap[style] || 'GlimmerTheme.typography.body'}`,
        `)`,
      ];
    },
  },

  glimmer_surface: {
    trait: 'glimmer_surface',
    components: ['GlimmerSurface'],
    level: 'full',
    imports: ['androidx.xr.glimmer.surface', 'androidx.compose.ui.Modifier'],
    generate: (varName, config) => {
      const focusable = config.focusable ?? true;
      const depth = String(config.depth || 'default');
      return [
        `// @glimmer_surface -- Glimmer Surface container for transparent HUD`,
        `Box(`,
        `    modifier = Modifier`,
        `        .surface(focusable = ${focusable})`,
        `        .fillMaxWidth()`,
        `) {`,
        `    // ${varName} content (depth: ${depth})`,
        `}`,
      ];
    },
  },

  glimmer_icon: {
    trait: 'glimmer_icon',
    components: ['GlimmerIcon'],
    level: 'full',
    imports: ['androidx.xr.glimmer.Icon', 'androidx.compose.material.icons.Icons'],
    generate: (varName, config) => {
      const icon = String(config.icon || 'Info');
      const desc = String(config.description || varName);
      return [
        `// @glimmer_icon -- Glimmer Icon (Material Symbols Rounded)`,
        `Icon(`,
        `    imageVector = Icons.Rounded.${icon},`,
        `    contentDescription = "${desc}"`,
        `)`,
      ];
    },
  },

  ui_floating: {
    trait: 'ui_floating',
    components: ['GlimmerCard', 'GlimmerText'],
    level: 'full',
    imports: ['androidx.xr.glimmer.Card', 'androidx.xr.glimmer.Text'],
    generate: (varName, config) => {
      const title = String(config.title || 'Info');
      return [
        `// @ui_floating -- Glimmer Card floating overlay on transparent HUD`,
        `// AI Glasses: no depth positioning, 2D overlay only`,
        `Card(`,
        `    title = { Text("${title}") }`,
        `) {`,
        `    Text("${varName} content")`,
        `}`,
      ];
    },
  },

  ui_docked: {
    trait: 'ui_docked',
    components: ['GlimmerSurface', 'GlimmerText'],
    level: 'full',
    imports: [
      'androidx.xr.glimmer.surface',
      'androidx.xr.glimmer.Text',
      'androidx.compose.foundation.layout.Arrangement',
      'androidx.compose.foundation.layout.Row',
    ],
    generate: (varName, config) => {
      const position = String(config.position || 'bottom');
      return [
        `// @ui_docked -- docked UI element at ${position} of glasses display`,
        `Box(`,
        `    modifier = Modifier`,
        `        .surface(focusable = false)`,
        `        .fillMaxWidth()`,
        `        .align(Alignment.${position === 'top' ? 'TopCenter' : 'BottomCenter'})`,
        `) {`,
        `    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {`,
        `        // ${varName} docked controls`,
        `    }`,
        `}`,
      ];
    },
  },

  ui_billboard: {
    trait: 'ui_billboard',
    components: ['GlimmerText'],
    level: 'unsupported',
    generate: (varName) => [
      `// @ui_billboard -- UNSUPPORTED on AI Glasses (no 3D/depth rendering)`,
      `// AI Glasses use 2D HUD overlays only; use glimmer_card for ${varName}`,
    ],
  },

  ui_anchored: {
    trait: 'ui_anchored',
    components: ['GlimmerCard'],
    level: 'comment',
    generate: (varName, config) => {
      const to = String(config.to || 'screen');
      return [
        `// @ui_anchored -- AI Glasses: all UI is screen-anchored (no world anchoring)`,
        `// Requested anchor: ${to}; glasses only support display-fixed overlays`,
        `// Use glimmer_card or glimmer_surface for ${varName}`,
      ];
    },
  },

  ui_hand_menu: {
    trait: 'ui_hand_menu',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @ui_hand_menu -- UNSUPPORTED on AI Glasses (no hand tracking)`,
      `// AI Glasses use touchpad + voice input; no hand tracking for ${varName}`,
    ],
  },
};

// =============================================================================
// INPUT TRAITS — Touchpad Gestures + Voice Commands
// =============================================================================

export const INPUT_TRAIT_MAP: Record<string, AIGlassesTraitMapping> = {
  glasses_touchpad: {
    trait: 'glasses_touchpad',
    components: ['TouchpadGesture', 'GlimmerSurface'],
    level: 'full',
    imports: ['androidx.xr.glimmer.surface'],
    generate: (varName) => [
      `// @glasses_touchpad -- touchpad input on glasses temple arm`,
      `// Gestures: tap, swipe (up/down/left/right), long-press`,
      `// Glimmer components have built-in touchpad focus/interaction support`,
      `Modifier.surface(focusable = true) // enables touchpad focus for ${varName}`,
    ],
  },

  glasses_voice: {
    trait: 'glasses_voice',
    components: ['SpeechRecognizer'],
    level: 'full',
    imports: [
      'android.speech.SpeechRecognizer',
      'android.speech.RecognizerIntent',
      'android.content.Intent',
    ],
    generate: (varName, config) => {
      const commands = (config.commands as string[]) ?? [];
      const wakeWord = String(config.wake_word || 'Hey Google');
      return [
        `// @glasses_voice -- voice command handler for AI glasses`,
        `// Wake word: "${wakeWord}"`,
        `// Commands: ${commands.length > 0 ? commands.join(', ') : 'system default'}`,
        `val ${varName}Recognizer = SpeechRecognizer.createSpeechRecognizer(this)`,
        `val ${varName}Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {`,
        `    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)`,
        `    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)`,
        `}`,
        `${varName}Recognizer.setRecognitionListener(object : RecognitionListener {`,
        `    override fun onResults(results: Bundle?) {`,
        `        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)`,
        `        val command = matches?.firstOrNull()?.lowercase() ?: return`,
        ...(commands.length > 0
          ? [
              `        when {`,
              ...commands.map(
                (cmd) =>
                  `            command.contains("${cmd.toLowerCase()}") -> { /* handle "${cmd}" */ }`
              ),
              `            else -> { /* unrecognized command */ }`,
              `        }`,
            ]
          : [`        // Process voice command: $command`]),
        `    }`,
        `    override fun onPartialResults(partialResults: Bundle?) {}`,
        `    override fun onError(error: Int) {}`,
        `    override fun onReadyForSpeech(params: Bundle?) {}`,
        `    override fun onBeginningOfSpeech() {}`,
        `    override fun onRmsChanged(rmsdB: Float) {}`,
        `    override fun onBufferReceived(buffer: ByteArray?) {}`,
        `    override fun onEndOfSpeech() {}`,
        `    override fun onEvent(eventType: Int, params: Bundle?) {}`,
        `})`,
      ];
    },
  },

  clickable: {
    trait: 'clickable',
    components: ['TouchpadGesture', 'GlimmerSurface'],
    level: 'full',
    imports: ['androidx.xr.glimmer.surface', 'androidx.compose.foundation.clickable'],
    generate: (varName) => [
      `// @clickable -- touchpad tap handler (AI Glasses)`,
      `Modifier`,
      `    .surface(focusable = true)`,
      `    .clickable { /* ${varName} tap handler */ }`,
    ],
  },

  hoverable: {
    trait: 'hoverable',
    components: ['TouchpadGesture', 'GlimmerSurface'],
    level: 'partial',
    imports: ['androidx.xr.glimmer.surface'],
    generate: (varName) => [
      `// @hoverable -- AI Glasses: touchpad focus replaces hover`,
      `// Outline-based visual feedback applied automatically by Glimmer`,
      `Modifier.surface(focusable = true) // focus state provides hover effect for ${varName}`,
    ],
  },

  draggable: {
    trait: 'draggable',
    components: ['TouchpadGesture'],
    level: 'partial',
    imports: ['androidx.xr.glimmer.surface'],
    generate: (varName, config) => {
      const direction = String(config.direction || 'horizontal');
      return [
        `// @draggable -- touchpad swipe gesture maps to drag (${direction})`,
        `// AI Glasses: swipe on touchpad translates to list scrolling or navigation`,
        `Modifier.surface(focusable = true) // touchpad swipe for ${varName}`,
      ];
    },
  },

  grabbable: {
    trait: 'grabbable',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @grabbable -- UNSUPPORTED on AI Glasses (no hand/controller tracking)`,
      `// AI Glasses use touchpad + voice; no grab interaction for ${varName}`,
    ],
  },

  throwable: {
    trait: 'throwable',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @throwable -- UNSUPPORTED on AI Glasses (no physics/3D)`,
      `// AI Glasses render 2D HUD overlays only for ${varName}`,
    ],
  },

  pointable: {
    trait: 'pointable',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @pointable -- UNSUPPORTED on AI Glasses (no spatial pointing)`,
      `// AI Glasses use touchpad focus for ${varName}`,
    ],
  },

  scalable: {
    trait: 'scalable',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @scalable -- UNSUPPORTED on AI Glasses (no pinch-to-scale)`,
      `// AI Glasses have fixed display scale for ${varName}`,
    ],
  },

  rotatable: {
    trait: 'rotatable',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @rotatable -- UNSUPPORTED on AI Glasses (no rotation gestures)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },
};

// =============================================================================
// DISPLAY & HARDWARE TRAITS — Projected API
// =============================================================================

export const DISPLAY_TRAIT_MAP: Record<string, AIGlassesTraitMapping> = {
  glasses_display: {
    trait: 'glasses_display',
    components: ['ProjectedDisplayController', 'ProjectedDeviceController'],
    level: 'full',
    imports: [
      'androidx.xr.projected.ProjectedDisplayController',
      'androidx.xr.projected.ProjectedDeviceController',
      'androidx.xr.projected.ProjectedDeviceController.Companion.CAPABILITY_VISUAL_UI',
    ],
    generate: (varName, config) => {
      const brightness = config.brightness ?? 1.0;
      return [
        `// @glasses_display -- AI Glasses display control via Projected API`,
        `// Brightness: ${brightness}`,
        `lifecycleScope.launch {`,
        `    val ${varName}Controller = ProjectedDeviceController.create(this@GlassesActivity)`,
        `    val hasVisualUI = ${varName}Controller.capabilities.contains(CAPABILITY_VISUAL_UI)`,
        `    if (hasVisualUI) {`,
        `        val ${varName}Display = ProjectedDisplayController.create(this@GlassesActivity)`,
        `        // Display is available, show AR overlay`,
        `    }`,
        `}`,
      ];
    },
  },

  projected_camera: {
    trait: 'projected_camera',
    components: ['ProjectedContext', 'CameraProvider'],
    level: 'full',
    imports: [
      'androidx.xr.projected.ProjectedContext',
      'androidx.camera.lifecycle.ProcessCameraProvider',
      'androidx.camera.core.CameraSelector',
      'androidx.camera.core.ImageCapture',
    ],
    generate: (varName, config) => {
      const resolution = String(config.resolution || '1920x1080');
      const fps = config.fps ?? 30;
      return [
        `// @projected_camera -- AI Glasses camera via Projected API`,
        `// Resolution: ${resolution}, FPS: ${fps}`,
        `val ${varName}GlassesContext = ProjectedContext.createProjectedDeviceContext(this)`,
        `val ${varName}CameraFuture = ProcessCameraProvider.getInstance(${varName}GlassesContext)`,
        `${varName}CameraFuture.addListener({`,
        `    val cameraProvider = ${varName}CameraFuture.get()`,
        `    val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA`,
        `    if (cameraProvider.hasCamera(cameraSelector)) {`,
        `        val imageCapture = ImageCapture.Builder().build()`,
        `        cameraProvider.bindToLifecycle(this, cameraSelector, imageCapture)`,
        `    }`,
        `}, ContextCompat.getMainExecutor(this))`,
      ];
    },
  },

  projected_audio: {
    trait: 'projected_audio',
    components: ['ProjectedContext', 'AudioManager'],
    level: 'full',
    imports: ['androidx.xr.projected.ProjectedContext', 'android.media.AudioManager'],
    generate: (varName) => [
      `// @projected_audio -- AI Glasses audio via Bluetooth A2DP/HFP`,
      `// Audio routing handled automatically via Android AudioManager`,
      `val ${varName}GlassesContext = ProjectedContext.createProjectedDeviceContext(this)`,
      `val ${varName}AudioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager`,
      `// Use ${varName}GlassesContext for glasses speaker output`,
    ],
  },
};

// =============================================================================
// AUDIO TRAITS — Simplified for glasses speakers
// =============================================================================

export const AUDIO_TRAIT_MAP: Record<string, AIGlassesTraitMapping> = {
  audio: {
    trait: 'audio',
    components: ['AudioManager'],
    level: 'full',
    imports: ['android.media.AudioAttributes', 'android.media.SoundPool'],
    generate: (varName, config) => {
      const src = String(config.src || config.source || '');
      const loop = config.loop ?? false;
      const volume = config.volume ?? 1.0;
      return [
        `// @audio -- glasses speaker audio playback`,
        `val ${varName}SoundPool = SoundPool.Builder()`,
        `    .setAudioAttributes(AudioAttributes.Builder()`,
        `        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)`,
        `        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).build())`,
        `    .build()`,
        `val ${varName}SoundId = ${varName}SoundPool.load(context.assets.openFd("${src}"), 0)`,
        `${varName}SoundPool.setOnLoadCompleteListener { pool, id, status ->`,
        `    if (status == 0) pool.play(id, ${volume}f, ${volume}f, 1, ${loop ? -1 : 0}, 1.0f)`,
        `}`,
      ];
    },
  },

  spatial_audio: {
    trait: 'spatial_audio',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @spatial_audio -- UNSUPPORTED on AI Glasses (no spatial audio hardware)`,
      `// AI Glasses use stereo Bluetooth audio only for ${varName}`,
    ],
  },

  ambisonics: {
    trait: 'ambisonics',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @ambisonics -- UNSUPPORTED on AI Glasses (no ambisonic rendering)`,
      `// AI Glasses use stereo Bluetooth audio only for ${varName}`,
    ],
  },
};

// =============================================================================
// ACCESSIBILITY TRAITS
// =============================================================================

export const ACCESSIBILITY_TRAIT_MAP: Record<string, AIGlassesTraitMapping> = {
  accessible: {
    trait: 'accessible',
    components: ['GlimmerText'],
    level: 'full',
    imports: [
      'androidx.compose.ui.semantics.semantics',
      'androidx.compose.ui.semantics.contentDescription',
    ],
    generate: (varName, config) => {
      const label = String(config.label || '');
      const hint = String(config.hint || '');
      return [
        `// @accessible -- Android accessibility for AI Glasses`,
        `Modifier.semantics {`,
        `    contentDescription = "${label}"`,
        ...(hint ? [`    // Hint: ${hint}`] : []),
        `}`,
        `// TalkBack announces: "${label}" for ${varName}`,
      ];
    },
  },

  alt_text: {
    trait: 'alt_text',
    components: ['GlimmerText'],
    level: 'full',
    generate: (varName, config) => {
      const text = String(config.text || '');
      return [
        `// @alt_text -- contentDescription for TalkBack on AI Glasses`,
        `Modifier.semantics { contentDescription = "${text}" } // ${varName}`,
      ];
    },
  },

  high_contrast: {
    trait: 'high_contrast',
    components: ['GlimmerSurface'],
    level: 'full',
    imports: ['android.provider.Settings'],
    generate: (varName) => [
      `// @high_contrast -- high contrast mode for transparent display`,
      `// CRITICAL for AI Glasses: additive display means low-contrast is unreadable`,
      `val ${varName}HighContrast = Settings.Secure.getInt(`,
      `    context.contentResolver,`,
      `    Settings.Secure.ACCESSIBILITY_HIGH_TEXT_CONTRAST_ENABLED, 0`,
      `) == 1`,
      `// GlimmerTheme already uses bright colors on black for optimal contrast`,
    ],
  },

  motion_reduced: {
    trait: 'motion_reduced',
    components: [],
    level: 'full',
    imports: ['android.provider.Settings'],
    generate: (varName) => [
      `// @motion_reduced -- respect reduce-motion for heads-up display`,
      `// AI Glasses default: 2-second transitions (not 500ms)`,
      `val ${varName}ReduceMotion = Settings.Global.getFloat(`,
      `    context.contentResolver,`,
      `    Settings.Global.ANIMATOR_DURATION_SCALE, 1.0f`,
      `) == 0f`,
      `if (${varName}ReduceMotion) {`,
      `    // Skip all animations, use instant transitions`,
      `} else {`,
      `    // Use Glimmer 2-second transition defaults`,
      `}`,
    ],
  },
};

// =============================================================================
// AR/PERCEPTION TRAITS — Limited on AI Glasses
// =============================================================================

export const AR_TRAIT_MAP: Record<string, AIGlassesTraitMapping> = {
  anchor: {
    trait: 'anchor',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @anchor -- UNSUPPORTED on AI Glasses (no world anchoring)`,
      `// AI Glasses display is screen-fixed, not world-locked for ${varName}`,
    ],
  },

  plane_detection: {
    trait: 'plane_detection',
    components: ['CameraProvider'],
    level: 'partial',
    imports: [
      'com.google.ar.core.Session',
      'com.google.ar.core.Config',
      'com.google.ar.core.Plane',
      'com.google.ar.core.TrackingState',
    ],
    generate: (varName, config) => {
      const planeType = String(config.plane_type || 'horizontal');
      const planeModeMap: Record<string, string> = {
        horizontal: 'Config.PlaneFindingMode.HORIZONTAL',
        vertical: 'Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL',
        both: 'Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL',
      };
      const planeMode = planeModeMap[planeType] ?? planeModeMap['horizontal'];
      const confidence = Number(config.min_confidence ?? 0.7);
      return [
        `// @plane_detection -- ARCore lightweight plane detection for AI Glasses`,
        `// AI Glasses: camera-only (no depth sensor), limited to ${planeType} surfaces`,
        `val arSession = Session(context).apply {`,
        `    val arConfig = config.apply {`,
        `        planeFindingMode = ${planeMode}`,
        `        lightEstimationMode = Config.LightEstimationMode.AMBIENT_INTENSITY`,
        `    }`,
        `    configure(arConfig)`,
        `}`,
        ``,
        `// Process detected planes for ${varName}`,
        `fun onPlaneDetected(plane: Plane) {`,
        `    if (plane.trackingState == TrackingState.TRACKING &&`,
        `        plane.type == Plane.Type.${planeType === 'vertical' ? 'VERTICAL' : 'HORIZONTAL_UPWARD_FACING'}) {`,
        `        val extent = plane.extentX * plane.extentZ`,
        `        if (extent > ${confidence}) {`,
        `            // Surface detected: center=(%.2f, %.2f, %.2f) extent=%.1fm`,
        `            val pose = plane.centerPose`,
        `            // ${varName}: overlay HUD content anchored to detected surface`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },

  hand_tracking: {
    trait: 'hand_tracking',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @hand_tracking -- UNSUPPORTED on AI Glasses (no hand tracking sensors)`,
      `// AI Glasses use touchpad input only for ${varName}`,
    ],
  },

  eye_tracking: {
    trait: 'eye_tracking',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @eye_tracking -- UNSUPPORTED on AI Glasses (no eye tracking sensors)`,
      `// AI Glasses use touchpad focus for ${varName}`,
    ],
  },

  face_tracking: {
    trait: 'face_tracking',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @face_tracking -- UNSUPPORTED on AI Glasses (no face tracking)`,
      `// Consider using projected_camera for basic face detection for ${varName}`,
    ],
  },

  world_anchor: {
    trait: 'world_anchor',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @world_anchor -- UNSUPPORTED on AI Glasses (no world anchoring)`,
      `// AI Glasses display is screen-fixed for ${varName}`,
    ],
  },

  geospatial: {
    trait: 'geospatial',
    components: ['ProjectedDeviceController'],
    level: 'partial',
    imports: [
      'android.location.LocationManager',
      'android.location.LocationListener',
      'android.location.Criteria',
      'android.Manifest',
    ],
    generate: (varName, config) => {
      const lat = Number(config.latitude ?? 0);
      const lng = Number(config.longitude ?? 0);
      const accuracy = String(config.accuracy || 'fine');
      const intervalMs = Number(config.update_interval_ms ?? 5000);
      const accuracyConst =
        accuracy === 'coarse' ? 'Criteria.ACCURACY_COARSE' : 'Criteria.ACCURACY_FINE';
      return [
        `// @geospatial -- AI Glasses: GPS via paired phone (accuracy: ${accuracy})`,
        `val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager`,
        `val criteria = Criteria().apply {`,
        `    accuracy = ${accuracyConst}`,
        `    powerRequirement = Criteria.POWER_${accuracy === 'coarse' ? 'LOW' : 'MEDIUM'}`,
        `}`,
        `val provider = locationManager.getBestProvider(criteria, true) ?: "fused"`,
        ``,
        `// Location listener for ${varName}`,
        `val locationListener = object : LocationListener {`,
        `    override fun onLocationChanged(location: android.location.Location) {`,
        `        val lat = location.latitude  // initial: ${lat}`,
        `        val lng = location.longitude // initial: ${lng}`,
        `        val alt = location.altitude`,
        `        val acc = location.accuracy`,
        `        // ${varName}: update HUD overlay with geospatial position`,
        `    }`,
        `}`,
        ``,
        `// Request updates every ${intervalMs}ms, minimum displacement 1m`,
        `locationManager.requestLocationUpdates(`,
        `    provider, ${intervalMs}L, 1.0f, locationListener`,
        `)`,
      ];
    },
  },
};

// =============================================================================
// VISUAL TRAITS — Simplified for 2D HUD
// =============================================================================

export const VISUAL_TRAIT_MAP: Record<string, AIGlassesTraitMapping> = {
  visible: {
    trait: 'visible',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const visible = config.visible ?? true;
      return visible ? [] : [`// ${varName}: hidden`, `if (false) { /* ${varName} composable */ }`];
    },
  },

  invisible: {
    trait: 'invisible',
    components: [],
    level: 'full',
    generate: (varName) => [`// ${varName}: invisible -- not rendered on glasses display`],
  },

  billboard: {
    trait: 'billboard',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @billboard -- UNSUPPORTED on AI Glasses (no 3D rendering)`,
      `// All content is display-fixed on transparent HUD for ${varName}`,
    ],
  },

  animated: {
    trait: 'animated',
    components: ['GlimmerSurface'],
    level: 'partial',
    imports: [
      'androidx.compose.animation.AnimatedVisibility',
      'androidx.compose.animation.fadeIn',
      'androidx.compose.animation.fadeOut',
    ],
    generate: (varName, config) => {
      const duration = config.duration ?? 2000; // Glimmer default: 2 seconds
      return [
        `// @animated -- Glimmer animation (${duration}ms, glasses-optimized)`,
        `// AI Glasses: 2-second transitions for heads-up comfort`,
        `AnimatedVisibility(`,
        `    visible = true,`,
        `    enter = fadeIn(animationSpec = tween(${duration})),`,
        `    exit = fadeOut(animationSpec = tween(${duration}))`,
        `) {`,
        `    // ${varName} animated content`,
        `}`,
      ];
    },
  },

  lod: {
    trait: 'lod',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @lod -- UNSUPPORTED on AI Glasses (no 3D rendering / LOD switching)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },

  particle_emitter: {
    trait: 'particle_emitter',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @particle_emitter -- UNSUPPORTED on AI Glasses (no particle rendering)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },

  shadow_caster: {
    trait: 'shadow_caster',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @shadow_caster -- UNSUPPORTED on AI Glasses (no shadow rendering)`,
      `// Additive transparent display cannot render shadows for ${varName}`,
    ],
  },

  shadow_receiver: {
    trait: 'shadow_receiver',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @shadow_receiver -- UNSUPPORTED on AI Glasses (no shadow rendering)`,
      `// Additive transparent display cannot render shadows for ${varName}`,
    ],
  },
};

// =============================================================================
// ENVIRONMENT/IMMERSIVE TRAITS — Mostly unsupported
// =============================================================================

export const ENVIRONMENT_TRAIT_MAP: Record<string, AIGlassesTraitMapping> = {
  immersive: {
    trait: 'immersive',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @immersive -- UNSUPPORTED on AI Glasses (no immersive mode)`,
      `// AI Glasses are always see-through with ambient overlay for ${varName}`,
    ],
  },

  portal: {
    trait: 'portal',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @portal -- UNSUPPORTED on AI Glasses (no portal rendering)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },

  volume: {
    trait: 'volume',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @volume -- UNSUPPORTED on AI Glasses (no volumetric rendering)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },

  volumetric_window: {
    trait: 'volumetric_window',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @volumetric_window -- UNSUPPORTED on AI Glasses (no volumetric rendering)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },
};

// =============================================================================
// AI/ML TRAITS — Leverage on-device Gemini Nano
// =============================================================================

export const AI_TRAIT_MAP: Record<string, AIGlassesTraitMapping> = {
  vision: {
    trait: 'vision',
    components: ['CameraProvider'],
    level: 'comment',
    imports: ['com.google.mlkit.vision'],
    generate: (varName, config) => {
      const task = String(config.task || 'classification');
      return [
        `// @vision -- ML Kit Vision via glasses camera (task: ${task})`,
        `// Use projected_camera to capture, ML Kit to analyze for ${varName}`,
      ];
    },
  },

  ai_vision: {
    trait: 'ai_vision',
    components: ['CameraProvider'],
    level: 'partial',
    imports: [
      'com.google.mlkit.vision.common.InputImage',
      'com.google.mlkit.vision.objects.ObjectDetection',
      'com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions',
      'com.google.mlkit.vision.text.TextRecognition',
      'com.google.mlkit.vision.text.latin.TextRecognizerOptions',
      'com.google.mlkit.vision.pose.PoseDetection',
      'com.google.mlkit.vision.pose.defaults.PoseDetectorOptions',
    ],
    generate: (varName, config) => {
      const task = String(config.task || 'detection');
      const taskMap: Record<string, { detector: string; options: string; resultType: string }> = {
        detection: {
          detector: 'ObjectDetection.getClient',
          options: [
            'ObjectDetectorOptions.Builder()',
            '    .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)',
            '    .enableMultipleObjects()',
            '    .enableClassification()',
            '    .build()',
          ].join('\n'),
          resultType: 'DetectedObject',
        },
        text: {
          detector: 'TextRecognition.getClient',
          options: 'TextRecognizerOptions.Builder().build()',
          resultType: 'Text',
        },
        pose: {
          detector: 'PoseDetection.getClient',
          options: [
            'PoseDetectorOptions.Builder()',
            '    .setDetectorMode(PoseDetectorOptions.STREAM_MODE)',
            '    .build()',
          ].join('\n'),
          resultType: 'Pose',
        },
      };
      const selected = taskMap[task] ?? taskMap['detection'];
      return [
        `// @ai_vision -- ML Kit on-device inference via glasses camera (task: ${task})`,
        `// AI Glasses: camera feed -> ML Kit -> HUD overlay result`,
        `val mlKitOptions = ${selected.options}`,
        `val detector = ${selected.detector}(mlKitOptions)`,
        ``,
        `// Process camera frames for ${varName}`,
        `fun processFrame(image: InputImage) {`,
        `    detector.process(image)`,
        `        .addOnSuccessListener { results ->`,
        `            // ${varName}: ${selected.resultType} detected, update HUD overlay`,
        `            for (result in results) {`,
        `                // Render bounding box / landmarks on glasses display`,
        `            }`,
        `        }`,
        `        .addOnFailureListener { e ->`,
        `            // ${varName}: ML Kit ${task} failed: \${e.message}`,
        `        }`,
        `}`,
      ];
    },
  },

  ai_npc_brain: {
    trait: 'ai_npc_brain',
    components: [],
    level: 'partial',
    imports: [
      'com.google.ai.edge.aicore.GenerativeModel',
      'com.google.ai.edge.aicore.GenerationConfig',
      'com.google.ai.edge.aicore.Content',
    ],
    generate: (varName, config) => {
      const model = String(config.model || 'gemini-nano');
      const maxTokens = Number(config.max_tokens ?? 256);
      const temperature = Number(config.temperature ?? 0.7);
      const systemPrompt = String(
        config.system_prompt || `You are ${varName}, an AI assistant on smart glasses.`
      );
      return [
        `// @ai_npc_brain -- on-device Gemini Nano LLM for ${varName} (model: ${model})`,
        `// AI Glasses: fully on-device inference, no network required`,
        `val generationConfig = GenerationConfig.Builder().apply {`,
        `    maxOutputTokens = ${maxTokens}`,
        `    temperature = ${temperature}f`,
        `}.build()`,
        ``,
        `val generativeModel = GenerativeModel(`,
        `    modelName = "${model}",`,
        `    generationConfig = generationConfig`,
        `)`,
        ``,
        `// On-device LLM inference for ${varName}`,
        `suspend fun generateResponse(userInput: String): String {`,
        `    val content = Content.Builder().apply {`,
        `        addText("${systemPrompt}")`,
        `        addText(userInput)`,
        `    }.build()`,
        `    val response = generativeModel.generateContent(content)`,
        `    return response.text ?: "// ${varName}: no response generated"`,
        `}`,
      ];
    },
  },
};

// =============================================================================
// PHYSICS TRAITS — All unsupported on AI Glasses
// =============================================================================

export const PHYSICS_TRAIT_MAP: Record<string, AIGlassesTraitMapping> = {
  collidable: {
    trait: 'collidable',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @collidable -- UNSUPPORTED on AI Glasses (no 3D physics)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },

  physics: {
    trait: 'physics',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @physics -- UNSUPPORTED on AI Glasses (no physics simulation)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },

  static: {
    trait: 'static',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @static -- UNSUPPORTED on AI Glasses (no physics)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },

  kinematic: {
    trait: 'kinematic',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @kinematic -- UNSUPPORTED on AI Glasses (no physics)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },

  cloth: {
    trait: 'cloth',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @cloth -- UNSUPPORTED on AI Glasses (no cloth simulation)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },

  soft_body: {
    trait: 'soft_body',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @soft_body -- UNSUPPORTED on AI Glasses (no soft body simulation)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },

  fluid: {
    trait: 'fluid',
    components: [],
    level: 'unsupported',
    generate: (varName) => [
      `// @fluid -- UNSUPPORTED on AI Glasses (no fluid simulation)`,
      `// AI Glasses render flat 2D overlays for ${varName}`,
    ],
  },
};

// =============================================================================
// COMBINED TRAIT MAP
// =============================================================================

export const AIGLASSES_TRAIT_MAP: Record<string, AIGlassesTraitMapping> = {
  ...UI_TRAIT_MAP,
  ...INPUT_TRAIT_MAP,
  ...DISPLAY_TRAIT_MAP,
  ...AUDIO_TRAIT_MAP,
  ...ACCESSIBILITY_TRAIT_MAP,
  ...AR_TRAIT_MAP,
  ...VISUAL_TRAIT_MAP,
  ...ENVIRONMENT_TRAIT_MAP,
  ...AI_TRAIT_MAP,
  ...PHYSICS_TRAIT_MAP,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getTraitMapping(traitName: string): AIGlassesTraitMapping | undefined {
  return AIGLASSES_TRAIT_MAP[traitName];
}

export function generateTraitCode(
  traitName: string,
  varName: string,
  config: Record<string, unknown>
): string[] {
  const mapping = getTraitMapping(traitName);
  if (!mapping) {
    return [`// @${traitName} -- no AI Glasses mapping defined: ${JSON.stringify(config)}`];
  }
  return mapping.generate(varName, config);
}

export function getRequiredImports(traits: string[]): string[] {
  const imports = new Set<string>();
  for (const trait of traits) {
    const mapping = getTraitMapping(trait);
    if (mapping?.imports) {
      mapping.imports.forEach((i) => imports.add(i));
    }
  }
  return Array.from(imports);
}

export function getMinSdkVersion(traits: string[]): number {
  let maxSdk = 30; // AI Glasses require SDK 30+
  for (const trait of traits) {
    const mapping = getTraitMapping(trait);
    if (mapping?.minSdkVersion && mapping.minSdkVersion > maxSdk) {
      maxSdk = mapping.minSdkVersion;
    }
  }
  return maxSdk;
}

export function listAllTraits(): string[] {
  return Object.keys(AIGLASSES_TRAIT_MAP);
}

export function listTraitsByLevel(level: TraitImplementationLevel): string[] {
  return Object.entries(AIGLASSES_TRAIT_MAP)
    .filter(([_, mapping]) => mapping.level === level)
    .map(([name]) => name);
}

// =============================================================================
// COVERAGE TRACKING
// =============================================================================

export interface AIGlassesTraitCoverageReport {
  /** Total number of traits mapped */
  total: number;
  /** Traits with full implementation */
  full: string[];
  /** Traits with partial implementation */
  partial: string[];
  /** Traits with comment-only stubs */
  comment: string[];
  /** Traits marked as unsupported (form factor constraint) */
  unsupported: string[];
  /** Coverage percentage (full + partial / total) */
  coveragePercent: number;
  /** Full implementation percentage (full only / total) */
  fullCoveragePercent: number;
  /** Form factor analysis */
  formFactorAnalysis: {
    /** Traits that work on glasses */
    supported: string[];
    /** Traits blocked by form factor (no depth, no hand tracking, etc.) */
    blockedByFormFactor: string[];
    /** Reason each trait is blocked */
    blockReasons: Record<string, string>;
  };
  /** Platform comparison vs Android XR headset */
  headsetComparison: {
    /** Traits available on headset but not glasses */
    headsetOnly: string[];
    /** Traits available on both */
    bothFormFactors: string[];
    /** Traits unique to glasses (Glimmer-specific) */
    glassesOnly: string[];
  };
}

/**
 * Generates a comprehensive coverage report for AI Glasses trait support,
 * including form factor constraint analysis.
 *
 * @param androidXRTraits - Array of trait names from AndroidXR headset trait map
 * @returns AIGlassesTraitCoverageReport
 */
export function generateCoverageReport(androidXRTraits: string[]): AIGlassesTraitCoverageReport {
  const glassesTraits = Object.keys(AIGLASSES_TRAIT_MAP);

  const full = listTraitsByLevel('full');
  const partial = listTraitsByLevel('partial');
  const comment = listTraitsByLevel('comment');
  const unsupported = listTraitsByLevel('unsupported');

  const total = glassesTraits.length;
  const coveragePercent =
    total > 0 ? Math.round(((full.length + partial.length) / total) * 100 * 10) / 10 : 0;
  const fullCoveragePercent = total > 0 ? Math.round((full.length / total) * 100 * 10) / 10 : 0;

  const supported = [...full, ...partial, ...comment];
  const blockedByFormFactor = unsupported;

  const blockReasons: Record<string, string> = {};
  for (const trait of unsupported) {
    const mapping = AIGLASSES_TRAIT_MAP[trait];
    if (mapping) {
      const code = mapping.generate('_', {});
      const reason =
        code[0]?.replace(/^\/\/ @\w+ -- /, '').replace(/ for _$/, '') || 'form factor constraint';
      blockReasons[trait] = reason;
    }
  }

  const glassesSet = new Set(glassesTraits);
  const headsetSet = new Set(androidXRTraits);

  const headsetOnly = androidXRTraits.filter((t) => !glassesSet.has(t));
  const glassesOnly = glassesTraits.filter((t) => !headsetSet.has(t));
  const bothFormFactors = glassesTraits.filter((t) => headsetSet.has(t));

  return {
    total,
    full,
    partial,
    comment,
    unsupported,
    coveragePercent,
    fullCoveragePercent,
    formFactorAnalysis: {
      supported,
      blockedByFormFactor,
      blockReasons,
    },
    headsetComparison: {
      headsetOnly,
      bothFormFactors,
      glassesOnly,
    },
  };
}

/**
 * Returns a human-readable coverage summary string.
 */
export function getCoverageSummary(androidXRTraits: string[]): string {
  const report = generateCoverageReport(androidXRTraits);
  const lines = [
    `=== AI Glasses Trait Coverage Report ===`,
    `Total traits mapped: ${report.total}`,
    `  Full:        ${report.full.length} (${report.fullCoveragePercent}%)`,
    `  Partial:     ${report.partial.length}`,
    `  Comment:     ${report.comment.length}`,
    `  Unsupported: ${report.unsupported.length} (form factor constraint)`,
    ``,
    `Implementation coverage: ${report.coveragePercent}% (full + partial)`,
    `Full coverage:           ${report.fullCoveragePercent}%`,
    ``,
    `Form factor constraints:`,
    `  Supported:   ${report.formFactorAnalysis.supported.length} traits`,
    `  Blocked:     ${report.formFactorAnalysis.blockedByFormFactor.length} traits`,
    ``,
  ];

  if (report.formFactorAnalysis.blockedByFormFactor.length > 0) {
    lines.push(`Blocked by form factor:`);
    for (const t of report.formFactorAnalysis.blockedByFormFactor) {
      const reason = report.formFactorAnalysis.blockReasons[t] || 'form factor constraint';
      lines.push(`  - ${t}: ${reason}`);
    }
  }

  lines.push(``);
  lines.push(`Headset comparison:`);
  lines.push(`  Both form factors: ${report.headsetComparison.bothFormFactors.length}`);
  lines.push(`  Headset only:      ${report.headsetComparison.headsetOnly.length}`);
  lines.push(`  Glasses only:      ${report.headsetComparison.glassesOnly.length}`);

  return lines.join('\n');
}
