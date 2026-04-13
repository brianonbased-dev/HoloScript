/**
 * HoloScript → Android Kotlin ARCore Compiler
 *
 * Translates a HoloComposition AST into Kotlin code targeting
 * ARCore for Android augmented reality experiences.
 *
 * Emits:
 *   - Kotlin Activity with ARCore Session
 *   - SceneForm / Filament rendering
 *   - Plane detection and hit testing
 *   - Touch gesture handling
 *   - Spatial audio integration
 *
 * @version 1.0.0
 */

import type { HoloComposition, HoloObjectDecl, HoloValue } from '../parser/HoloCompositionTypes';
import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/platform';
import { GEOSPATIAL_DEFAULTS } from '../traits/constants/mobile/geospatial';
import {
  DEPTH_SCANNER_TRAITS,
  DEPTH_SCANNER_DEFAULTS,
} from '../traits/constants/mobile/depth-scanner';
import { PORTAL_AR_TRAITS } from '../traits/constants/mobile/portal-ar';
import { CAMERA_HAND_TRACKING_TRAITS } from '../traits/constants/mobile/camera-hand-tracking';
import { NPU_SCENE_TRAITS, NPU_SCENE_DEFAULTS } from '../traits/constants/mobile/npu-scene';
import {
  SPATIAL_AUTHORING_TRAITS,
  SPATIAL_AUTHORING_DEFAULTS,
} from '../traits/constants/mobile/spatial-authoring';
import { HAPTIC_FEEDBACK_TRAITS } from '../traits/constants/mobile/haptic-feedback';
import { NEARBY_CONNECTIONS_TRAITS } from '../traits/constants/mobile/nearby-connections';
import { FOLDABLE_DISPLAY_TRAITS } from '../traits/constants/mobile/foldable-display';
import { SAMSUNG_DEX_TRAITS } from '../traits/constants/mobile/samsung-dex';
import { GOOGLE_LENS_TRAITS } from '../traits/constants/mobile/google-lens';
import { WEBXR_TRAITS } from '../traits/constants/mobile/webxr';

export interface AndroidCompilerOptions {
  packageName?: string;
  className?: string;
  indent?: string;
  minSdk?: number;
  targetSdk?: number;
  useJetpackCompose?: boolean;
  useSceneform?: boolean; // Deprecated but simpler
  useFilament?: boolean; // Modern but complex
}

export interface AndroidCompileResult {
  activityFile: string;
  stateFile: string;
  nodeFactoryFile: string;
  manifestFile: string;
  buildGradle: string;
  /** NPU scene understanding setup — emitted when npu_* traits are present (ML Kit + NNAPI) */
  npuSceneSetup?: string;
  /** Spatial authoring setup — emitted when author_* traits are present (M.010.08) */
  authoringSetup?: string;
  /** Haptic feedback setup — emitted when haptic_* traits are present (M.010.05) */
  hapticSetup?: string;
  /** Nearby Connections setup — emitted when nearby_* traits are present (M.010.16) */
  nearbySetup?: string;
  /** Foldable display setup — emitted when foldable_* traits are present (M.010.17) */
  foldableSetup?: string;
  /** Samsung DeX setup — emitted when dex_* traits are present (M.010.18) */
  dexSetup?: string;
  /** Google Lens setup — emitted when lens_* traits are present (M.010.20) */
  lensSetup?: string;
  /** WebXR setup — emitted when webxr_* traits are present (M.010.19). JavaScript/HTML, not Kotlin. */
  webxrSetup?: string;
}

export class AndroidCompiler extends CompilerBase {
  protected readonly compilerName = 'AndroidCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.ANDROID;
  }

  private options: Required<AndroidCompilerOptions>;
  private lines: string[] = [];
  private indentLevel: number = 0;

  constructor(options: AndroidCompilerOptions = {}) {
    super();
    this.options = {
      packageName: options.packageName || 'com.holoscript.generated',
      className: options.className || 'GeneratedARScene',
      indent: options.indent || '    ',
      minSdk: options.minSdk || 26,
      targetSdk: options.targetSdk || 34,
      useJetpackCompose: options.useJetpackCompose ?? true,
      useSceneform: options.useSceneform ?? true,
      useFilament: options.useFilament ?? false,
    };
  }

  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): AndroidCompileResult {
    this.validateCompilerAccess(agentToken, outputPath);
    const result: AndroidCompileResult = {
      activityFile: this.generateActivityFile(composition),
      stateFile: this.generateStateFile(composition),
      nodeFactoryFile: this.generateNodeFactoryFile(composition),
      manifestFile: this.generateManifestFile(composition),
      buildGradle: this.generateBuildGradle(composition),
    };

    if (this.hasNPUSceneTraits(composition)) {
      result.npuSceneSetup = this.emitNPUSceneSetup(composition);
    }

    if (this.hasAuthoringTraits(composition)) {
      result.authoringSetup = this.emitAuthoringSetup(composition);
    }

    if (this.hasHapticTraits(composition)) {
      result.hapticSetup = this.emitHapticSetup(composition);
    }

    if (this.hasNearbyTraits(composition)) {
      result.nearbySetup = this.emitNearbySetup(composition);
    }

    if (this.hasFoldableTraits(composition)) {
      result.foldableSetup = this.emitFoldableSetup(composition);
    }

    if (this.hasDexTraits(composition)) {
      result.dexSetup = this.emitDexSetup(composition);
    }

    if (this.hasLensTraits(composition)) {
      result.lensSetup = this.emitLensSetup(composition);
    }

    if (this.hasWebXRTraits(composition)) {
      result.webxrSetup = this.emitWebXRSetup(composition);
    }

    return result;
  }

  private generateActivityFile(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;

    const pkg = this.options.packageName;
    const cls = this.options.className;

    this.emit('// Auto-generated by HoloScript AndroidCompiler');
    this.emit(
      `// Source: composition "${this.escapeStringValue(composition.name as string, 'Kotlin')}"`
    );
    this.emit('// Do not edit manually — regenerate from .holo source');
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import android.os.Bundle');
    this.emit('import android.view.MotionEvent');
    this.emit('import android.view.View');
    this.emit('import android.widget.Toast');
    this.emit('import androidx.appcompat.app.AppCompatActivity');
    this.emit('import androidx.lifecycle.ViewModelProvider');
    this.emit('import com.google.ar.core.*');
    this.emit('import com.google.ar.core.exceptions.*');
    this.emit('import com.google.ar.sceneform.*');
    this.emit('import com.google.ar.sceneform.math.Vector3');
    this.emit('import com.google.ar.sceneform.rendering.*');
    this.emit('import com.google.ar.sceneform.ux.*');
    this.emit('import java.util.concurrent.CompletableFuture');
    this.emit('');

    this.emit(`class ${cls}Activity : AppCompatActivity() {`);
    this.indentLevel++;

    // Properties
    this.emit('private lateinit var arFragment: ArFragment');
    this.emit('private lateinit var sceneState: SceneState');
    this.emit('private val placedNodes = mutableMapOf<String, TransformableNode>()');
    this.emit('');

    // onCreate
    this.emit('override fun onCreate(savedInstanceState: Bundle?) {');
    this.indentLevel++;
    this.emit('super.onCreate(savedInstanceState)');
    this.emit(`setContentView(R.layout.activity_ar_scene)`);
    this.emit('');
    this.emit('sceneState = ViewModelProvider(this)[SceneState::class.java]');
    this.emit(
      'arFragment = supportFragmentManager.findFragmentById(R.id.ar_fragment) as ArFragment'
    );
    this.emit('');
    this.emit('setupARSession()');
    this.emit('setupTapListener()');
    this.emit('setupUI()');
    // Geo-anchor: initialize location services and geo anchors
    if (this.hasGeoTraits(composition)) {
      this.emit('setupGeoAnchors()');
    }
    // ARCore Geospatial API: VPS-based street-level anchoring
    if (this.hasGeospatialVPSTraits(composition)) {
      this.emit('setupGeospatialVPS()');
    }
    // Depth Scanner: ARCore depth, ToF, stereo
    if (this.hasDepthScanTraits(composition)) {
      this.emit('setupDepthScanner()');
    }
    // Portal AR: full-scene holographic layer behind reality
    if (this.hasPortalARTraits(composition)) {
      this.emit('setupPortalAR()');
    }
    // Camera Hand Tracking: MediaPipe Hands gesture recognition
    if (this.hasHandTrackingTraits(composition)) {
      this.emit('setupHandTracking()');
    }
    // Spatial Authoring: gyro placement, pinch-scale, swipe browse, voice, shake undo
    if (this.hasAuthoringTraits(composition)) {
      this.emit('setupSpatialAuthoring()');
    }
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Setup AR Session
    this.emit('private fun setupARSession() {');
    this.indentLevel++;
    this.emit('arFragment.arSceneView.scene.addOnUpdateListener { frameTime ->');
    this.indentLevel++;
    this.emit('val frame = arFragment.arSceneView.arFrame ?: return@addOnUpdateListener');
    this.emit('');
    this.emit('// Track planes');
    this.emit('for (plane in frame.getUpdatedTrackables(Plane::class.java)) {');
    this.indentLevel++;
    this.emit('if (plane.trackingState == TrackingState.TRACKING) {');
    this.indentLevel++;
    this.emit('sceneState.onPlaneDetected(plane)');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Setup tap listener
    this.emit('private fun setupTapListener() {');
    this.indentLevel++;
    this.emit('arFragment.setOnTapArPlaneListener { hitResult, plane, motionEvent ->');
    this.indentLevel++;
    this.emit(
      'if (plane.type != Plane.Type.HORIZONTAL_UPWARD_FACING) return@setOnTapArPlaneListener'
    );
    this.emit('');
    this.emit('placeObject(hitResult)');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Place object
    this.emit('private fun placeObject(hitResult: HitResult) {');
    this.indentLevel++;
    this.emit('val anchor = hitResult.createAnchor()');
    this.emit('val anchorNode = AnchorNode(anchor)');
    this.emit('anchorNode.setParent(arFragment.arSceneView.scene)');
    this.emit('');
    this.emit('// Create node from factory');
    this.emit('NodeFactory.createDefaultNode(this) { renderable ->');
    this.indentLevel++;
    this.emit('val transformableNode = TransformableNode(arFragment.transformationSystem)');
    this.emit('transformableNode.setParent(anchorNode)');
    this.emit('transformableNode.renderable = renderable');
    this.emit('transformableNode.select()');
    this.emit('');
    this.emit('val id = java.util.UUID.randomUUID().toString()');
    this.emit('placedNodes[id] = transformableNode');
    this.emit('');
    this.emit('// Setup interaction');
    this.emit('transformableNode.setOnTapListener { _, _ ->');
    this.indentLevel++;
    this.emit('sceneState.onNodeTapped(id)');
    this.emit('animateNodeTap(transformableNode)');
    this.indentLevel--;
    this.emit('}');
    this.emit('');
    this.emit('android.util.Log.d("HoloScript", "Placed object: $id")');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Animate tap
    this.emit('private fun animateNodeTap(node: TransformableNode) {');
    this.indentLevel++;
    this.emit('val originalScale = node.localScale');
    this.emit(
      'val scaledUp = Vector3(originalScale.x * 1.2f, originalScale.y * 1.2f, originalScale.z * 1.2f)'
    );
    this.emit('');
    this.emit('android.animation.ObjectAnimator.ofObject(');
    this.indentLevel++;
    this.emit('node, "localScale",');
    this.emit('com.google.ar.sceneform.math.Vector3Evaluator(),');
    this.emit('originalScale, scaledUp, originalScale');
    this.indentLevel--;
    this.emit(').apply {');
    this.indentLevel++;
    this.emit('duration = 200');
    this.emit('start()');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Setup UI
    this.emit('private fun setupUI() {');
    this.indentLevel++;
    this.emit('findViewById<View>(R.id.reset_button)?.setOnClickListener {');
    this.indentLevel++;
    this.emit('resetScene()');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Reset scene
    this.emit('private fun resetScene() {');
    this.indentLevel++;
    this.emit('for (node in placedNodes.values) {');
    this.indentLevel++;
    this.emit('node.anchor?.detach()');
    this.emit('node.setParent(null)');
    this.indentLevel--;
    this.emit('}');
    this.emit('placedNodes.clear()');
    this.emit('');
    this.emit('sceneState.reset()');
    this.emit('Toast.makeText(this, "Scene reset", Toast.LENGTH_SHORT).show()');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Lifecycle
    this.emit('override fun onResume() {');
    this.indentLevel++;
    this.emit('super.onResume()');
    this.emit('checkARCoreAvailability()');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    this.emit('private fun checkARCoreAvailability() {');
    this.indentLevel++;
    this.emit('val availability = ArCoreApk.getInstance().checkAvailability(this)');
    this.emit('if (availability.isTransient) {');
    this.indentLevel++;
    this.emit('android.os.Handler(mainLooper).postDelayed({ checkARCoreAvailability() }, 200)');
    this.emit('return');
    this.indentLevel--;
    this.emit('}');
    this.emit('if (!availability.isSupported) {');
    this.indentLevel++;
    this.emit(
      'Toast.makeText(this, "ARCore is not supported on this device", Toast.LENGTH_LONG).show()'
    );
    this.emit('finish()');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');

    // Geo-anchor methods (emitted inside Activity class body)
    if (this.hasGeoTraits(composition)) {
      this.emitGeoAnchorSetup(composition);
    }

    // ARCore Geospatial API methods (emitted inside Activity class body)
    if (this.hasGeospatialVPSTraits(composition)) {
      this.emitGeospatialVPSSetup(composition);
    }

    // Depth Scanner methods (emitted inside Activity class body)
    if (this.hasDepthScanTraits(composition)) {
      this.emitDepthScanSetup(composition);
    }

    // Portal AR methods (emitted inside Activity class body)
    if (this.hasPortalARTraits(composition)) {
      this.emitPortalARSetup(composition);
    }

    // Camera Hand Tracking methods (emitted inside Activity class body)
    if (this.hasHandTrackingTraits(composition)) {
      this.emitHandTrackingSetup(composition);
    }

    // Spatial Authoring methods (emitted inside Activity class body)
    if (this.hasAuthoringTraits(composition)) {
      this.emitAuthoringInlineSetup(composition);
    }

    this.indentLevel--;
    this.emit('}');

    return this.lines.join('\n');
  }

  private generateStateFile(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;

    const pkg = this.options.packageName;

    this.emit('// Auto-generated by HoloScript AndroidCompiler');
    this.emit(`// State: ${this.escapeStringValue(composition.name as string, 'Kotlin')}`);
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import androidx.lifecycle.ViewModel');
    this.emit('import androidx.lifecycle.MutableLiveData');
    this.emit('import androidx.lifecycle.LiveData');
    this.emit('import com.google.ar.core.Plane');
    this.emit('');

    this.emit('class SceneState : ViewModel() {');
    this.indentLevel++;

    // State properties from composition
    if (composition.state) {
      this.emit('// === State Properties ===');
      for (const prop of composition.state.properties) {
        const kotlinType = this.toKotlinType(prop.value);
        const kotlinValue = this.toKotlinValue(prop.value);
        this.emit(
          `private val _${this.escapeStringValue(prop.key as string, 'Kotlin')} = MutableLiveData(${kotlinValue})`
        );
        this.emit(
          `val ${this.escapeStringValue(prop.key as string, 'Kotlin')}: LiveData<${kotlinType}> get() = _${this.escapeStringValue(prop.key as string, 'Kotlin')}`
        );
        this.emit('');
      }
    }

    // Detected planes
    this.emit('// === AR State ===');
    this.emit('private val _detectedPlanes = MutableLiveData<List<Plane>>(emptyList())');
    this.emit('val detectedPlanes: LiveData<List<Plane>> get() = _detectedPlanes');
    this.emit('');

    this.emit('private val _tappedNodes = MutableLiveData<String?>()');
    this.emit('val tappedNodes: LiveData<String?> get() = _tappedNodes');
    this.emit('');

    // Plane detection callback
    this.emit('fun onPlaneDetected(plane: Plane) {');
    this.indentLevel++;
    this.emit('val current = _detectedPlanes.value.orEmpty().toMutableList()');
    this.emit('if (!current.contains(plane)) {');
    this.indentLevel++;
    this.emit('current.add(plane)');
    this.emit('_detectedPlanes.value = current');
    this.emit('android.util.Log.d("HoloScript", "Plane detected: ${plane.type}")');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Node tapped callback
    this.emit('fun onNodeTapped(nodeId: String) {');
    this.indentLevel++;
    this.emit('_tappedNodes.value = nodeId');
    this.emit('android.util.Log.d("HoloScript", "Node tapped: $nodeId")');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Reset
    this.emit('fun reset() {');
    this.indentLevel++;
    this.emit('_detectedPlanes.value = emptyList()');
    this.emit('_tappedNodes.value = null');
    if (composition.state) {
      for (const prop of composition.state.properties) {
        const kotlinValue = this.toKotlinValue(prop.value);
        this.emit(
          `_${this.escapeStringValue(prop.key as string, 'Kotlin')}.value = ${kotlinValue}`
        );
      }
    }
    this.emit('android.util.Log.d("HoloScript", "State reset")');
    this.indentLevel--;
    this.emit('}');

    // Actions
    if (composition.logic?.actions) {
      this.emit('');
      this.emit('// === Actions ===');
      for (const action of composition.logic.actions) {
        this.compileAction(action);
      }
    }

    this.indentLevel--;
    this.emit('}');

    return this.lines.join('\n');
  }

  private generateNodeFactoryFile(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;

    const pkg = this.options.packageName;

    this.emit('// Auto-generated by HoloScript AndroidCompiler');
    this.emit(`// Node Factory: ${this.escapeStringValue(composition.name as string, 'Kotlin')}`);
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import android.content.Context');
    this.emit('import com.google.ar.sceneform.math.Vector3');
    this.emit('import com.google.ar.sceneform.rendering.*');
    this.emit('import com.google.android.filament.utils.Float3');
    this.emit('');

    this.emit('object NodeFactory {');
    this.indentLevel++;

    // Default node
    this.emit('fun createDefaultNode(context: Context, callback: (Renderable) -> Unit) {');
    this.indentLevel++;
    if (composition.objects?.length) {
      const firstObj = composition.objects[0];
      const color = this.findObjProp(firstObj, 'color');
      this.emit('MaterialFactory.makeOpaqueWithColor(');
      this.indentLevel++;
      this.emit('context,');
      this.emit(`Color(${this.toAndroidColor(color)})`);
      this.indentLevel--;
      this.emit(').thenAccept { material ->');
      this.indentLevel++;

      const meshType =
        this.findObjProp(firstObj, 'mesh') || this.findObjProp(firstObj, 'type') || 'cube';
      const geometry = this.getSceneformGeometry(meshType as string);
      this.emit(`${geometry}.thenAccept { renderable ->`);
      this.indentLevel++;
      this.emit('renderable.material = material');
      this.emit('callback(renderable)');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
    } else {
      this.emit('MaterialFactory.makeOpaqueWithColor(context, Color(android.graphics.Color.BLUE))');
      this.emit('    .thenCompose { material ->');
      this.emit(
        '        ShapeFactory.makeCube(Vector3(0.1f, 0.1f, 0.1f), Vector3.zero(), material)'
      );
      this.emit('    }');
      this.emit('    .thenAccept { renderable -> callback(renderable) }');
    }
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Object factory methods
    for (const obj of composition.objects || []) {
      this.compileObjectFactory(obj);
    }

    this.indentLevel--;
    this.emit('}');

    return this.lines.join('\n');
  }

  private compileObjectFactory(obj: HoloObjectDecl): void {
    const methodName = `create${this.sanitizeName(obj.name)}`;

    this.emit(`fun ${methodName}(context: Context, callback: (Renderable) -> Unit) {`);
    this.indentLevel++;

    const color = this.findObjProp(obj, 'color');
    const meshType = this.findObjProp(obj, 'mesh') || this.findObjProp(obj, 'type') || 'cube';

    this.emit('MaterialFactory.makeOpaqueWithColor(');
    this.indentLevel++;
    this.emit('context,');
    this.emit(`Color(${this.toAndroidColor(color)})`);
    this.indentLevel--;
    this.emit(').thenAccept { material ->');
    this.indentLevel++;

    const geometry = this.getSceneformGeometry(meshType as string);
    this.emit(`${geometry}.thenAccept { renderable ->`);
    this.indentLevel++;
    this.emit('renderable.material = material');
    this.emit('callback(renderable)');
    this.indentLevel--;
    this.emit('}');

    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.emit('');
  }

  private generateManifestFile(composition: HoloComposition): string {
    const pkg = this.options.packageName;
    const cls = this.options.className;
    const hasGeo = this.hasGeoTraits(composition);
    const hasGeospatialVPS = this.hasGeospatialVPSTraits(composition);

    const geoPermissions =
      hasGeo || hasGeospatialVPS
        ? `
    <!-- Geo-Anchor: Location permissions -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />`
        : '';

    const geospatialApiKeyMeta = hasGeospatialVPS
      ? `
        <!-- ARCore Geospatial API key (replace with your key from Google Cloud Console) -->
        <meta-data android:name="com.google.android.ar.API_KEY" android:value="\${GEOSPATIAL_API_KEY}" />`
      : '';

    return `<?xml version="1.0" encoding="utf-8"?>
<!-- Auto-generated by HoloScript AndroidCompiler -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${pkg}">

    <!-- AR Required -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera.ar" android:required="true" />

    <!-- ARCore Required -->
    <uses-feature android:glEsVersion="0x00030000" android:required="true" />${geoPermissions}

    <application
        android:allowBackup="true"
        android:label="${this.escapeStringValue(composition.name as string, 'XML')}"
        android:supportsRtl="true"
        android:theme="@style/Theme.AppCompat.NoActionBar">

        <!-- ARCore metadata -->
        <meta-data android:name="com.google.ar.core" android:value="required" />${geospatialApiKeyMeta}

        <activity
            android:name=".${cls}Activity"
            android:exported="true"
            android:configChanges="orientation|screenSize"
            android:screenOrientation="locked">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;
  }

  private generateBuildGradle(composition: HoloComposition): string {
    const hasGeospatialVPS = this.hasGeospatialVPSTraits(composition);
    const hasDepthScan = this.hasDepthScanTraits(composition);
    const hasHandTracking = this.hasHandTrackingTraits(composition);

    const geospatialDeps = hasGeospatialVPS
      ? `
    // ARCore Geospatial API (included in com.google.ar:core >= 1.31.0)
    // Location services for VPS
    implementation 'com.google.android.gms:play-services-location:21.1.0'`
      : '';

    const depthScanDeps = hasDepthScan
      ? `
    // ARCore Depth API (M.010.02b)
    implementation 'com.google.ar:core:1.40.0'`
      : '';

    const handTrackingDeps = hasHandTracking
      ? `
    // MediaPipe Hands — camera-based hand tracking (M.010.04)
    implementation 'com.google.mediapipe:solution-hands:0.10.14'
    // CameraX for front camera feed
    implementation 'androidx.camera:camera-core:1.3.1'
    implementation 'androidx.camera:camera-camera2:1.3.1'
    implementation 'androidx.camera:camera-lifecycle:1.3.1'`
      : '';

    const hasAuthoring = this.hasAuthoringTraits(composition);
    const authoringDeps = hasAuthoring
      ? `
    // Spatial Authoring — speech recognition (M.010.08)
    implementation 'androidx.recyclerview:recyclerview:1.3.2'`
      : '';

    return `// Auto-generated by HoloScript AndroidCompiler
// Source: ${this.escapeStringValue(composition.name as string, 'Kotlin')}

plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}

android {
    namespace '${this.options.packageName}'
    compileSdk ${this.options.targetSdk}

    defaultConfig {
        applicationId "${this.options.packageName}"
        minSdk ${this.options.minSdk}
        targetSdk ${this.options.targetSdk}
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = '17'
    }

    buildFeatures {
        viewBinding true
        compose ${this.options.useJetpackCompose}
    }
}

dependencies {
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.11.0'
    implementation 'androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0'
    implementation 'androidx.lifecycle:lifecycle-livedata-ktx:2.7.0'

    // ARCore (>= 1.31.0 includes Geospatial API)
    implementation 'com.google.ar:core:1.41.0'

    // Sceneform (maintained fork)
    implementation 'com.gorisse.thomas:sceneform:1.22.0'${geospatialDeps}${depthScanDeps}${handTrackingDeps}${authoringDeps}

    // Optional: Jetpack Compose
    ${
      this.options.useJetpackCompose
        ? `implementation platform('androidx.compose:compose-bom:2024.01.00')
    implementation 'androidx.compose.ui:ui'
    implementation 'androidx.compose.material3:material3'
    implementation 'androidx.activity:activity-compose:1.8.2'`
        : '// Compose disabled'
    }
}`;
  }

  private compileAction(action: { name: string }): void {
    const rawName = this.sanitizeName(action.name);
    const name = rawName.charAt(0).toLowerCase() + rawName.slice(1);
    this.emit(`fun ${name}() {`);
    this.indentLevel++;
    this.emit(
      `android.util.Log.d("HoloScript", "Action: ${this.escapeStringValue(action.name as string, 'Kotlin')}")`
    );
    this.emit('// Action implementation');
    this.indentLevel--;
    this.emit('}');
    this.emit('');
  }

  // === Geo-Anchor Methods ===

  private hasGeoTraits(composition: HoloComposition): boolean {
    const geoTraitNames = [
      'geo_anchor',
      'geo_persist',
      'geo_radius',
      'geo_compass_heading',
      'geo_altitude',
      'geo_cloud_anchor',
      'geo_terrain_snap',
      'geo_session_continuity',
      'geo_proximity_trigger',
      'geo_discoverable',
      'geo_arcore_geospatial',
      'geo_arkit_geo_anchor',
      // ARCore Geospatial API traits (M.010.15)
      'geospatial_vps',
      'geospatial_anchor',
      'geospatial_terrain_anchor',
      'geospatial_rooftop_anchor',
      'geospatial_streetscape',
      'geospatial_heading',
    ];
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (geoTraitNames.includes(name)) return true;
      }
    }
    return false;
  }

  /**
   * Check if any object uses the ARCore Geospatial API VPS traits specifically.
   */
  private hasGeospatialVPSTraits(composition: HoloComposition): boolean {
    const geospatialTraitNames = [
      'geospatial_vps',
      'geospatial_anchor',
      'geospatial_terrain_anchor',
      'geospatial_rooftop_anchor',
      'geospatial_streetscape',
      'geospatial_heading',
    ];
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (geospatialTraitNames.includes(name)) return true;
      }
    }
    return false;
  }

  private emitGeoAnchorSetup(composition: HoloComposition): void {
    this.emit('');
    this.emit('// === Geo-Anchor: GPS-pinned persistent holograms ===');
    this.emit(
      'private var fusedLocationClient: com.google.android.gms.location.FusedLocationProviderClient? = null'
    );
    this.emit('private val geoAnchors = mutableMapOf<String, Anchor>()');
    this.emit('');

    this.emit('private fun setupGeoAnchors() {');
    this.indentLevel++;
    this.emit(
      'fusedLocationClient = com.google.android.gms.location.LocationServices.getFusedLocationProviderClient(this)'
    );
    this.emit('');

    // Check for geo_arcore_geospatial trait
    const usesGeospatial = this.compositionHasTrait(composition, 'geo_arcore_geospatial');
    if (usesGeospatial) {
      this.emit('// Enable ARCore Geospatial API (VPS)');
      this.emit('val session = arFragment.arSceneView.session ?: return');
      this.emit('val config = session.config');
      this.emit('config.geospatialMode = Config.GeospatialMode.ENABLED');
      this.emit('session.configure(config)');
      this.emit('');
    }

    // Emit anchor creation for each geo_anchor object
    for (const obj of composition.objects || []) {
      const traits = obj.traits || [];
      const hasGeoAnchor = traits.some((t) => {
        const name = typeof t === 'string' ? t : t.name;
        return name === 'geo_anchor';
      });
      if (!hasGeoAnchor) continue;

      const geoAnchorTrait = traits.find((t) => {
        const name = typeof t === 'string' ? t : t.name;
        return name === 'geo_anchor';
      });
      const config = typeof geoAnchorTrait === 'string' ? {} : geoAnchorTrait?.config || {};
      const lat = (config as Record<string, unknown>).latitude ?? 0.0;
      const lng = (config as Record<string, unknown>).longitude ?? 0.0;

      const altTrait = traits.find((t) => {
        const name = typeof t === 'string' ? t : t.name;
        return name === 'geo_altitude';
      });
      const altConfig = typeof altTrait === 'string' ? {} : altTrait?.config || {};
      const alt = (altConfig as Record<string, unknown>).meters ?? 0.0;

      const headingTrait = traits.find((t) => {
        const name = typeof t === 'string' ? t : t.name;
        return name === 'geo_compass_heading';
      });
      const headingConfig = typeof headingTrait === 'string' ? {} : headingTrait?.config || {};
      const heading = (headingConfig as Record<string, unknown>).degrees ?? 0.0;

      this.emit(`// Geo-anchor: ${this.escapeStringValue(obj.name, 'Kotlin')}`);
      this.emit(
        `createGeoAnchor("${this.escapeStringValue(obj.name, 'Kotlin')}", ${lat}, ${lng}, ${alt}, ${heading}f)`
      );
    }

    // Cloud anchor persistence
    const usesPersist = this.compositionHasTrait(composition, 'geo_persist');
    const usesCloud = this.compositionHasTrait(composition, 'geo_cloud_anchor');
    if (usesPersist || usesCloud) {
      this.emit('');
      this.emit('// Restore persisted geo anchors');
      this.emit('restoreGeoAnchors()');
    }

    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // createGeoAnchor helper
    this.emit(
      'private fun createGeoAnchor(name: String, lat: Double, lng: Double, alt: Double, heading: Float) {'
    );
    this.indentLevel++;
    this.emit('val session = arFragment.arSceneView.session ?: return');
    this.emit('val earth = session.earth ?: return');
    this.emit('if (earth.trackingState != TrackingState.TRACKING) return');
    this.emit('');
    this.emit(
      'val anchor = earth.createAnchor(lat, lng, alt, 0f, 0f, Math.sin(Math.toRadians(heading.toDouble() / 2)).toFloat(), Math.cos(Math.toRadians(heading.toDouble() / 2)).toFloat())'
    );
    this.emit('geoAnchors[name] = anchor');
    this.emit('');
    this.emit('val anchorNode = AnchorNode(anchor)');
    this.emit('anchorNode.setParent(arFragment.arSceneView.scene)');
    this.emit('');
    this.emit('NodeFactory.createDefaultNode(this) { renderable ->');
    this.indentLevel++;
    this.emit('val node = TransformableNode(arFragment.transformationSystem)');
    this.emit('node.setParent(anchorNode)');
    this.emit('node.renderable = renderable');
    this.emit('placedNodes[name] = node');
    this.emit('android.util.Log.d("HoloScript", "Geo-anchored: $name at ($lat, $lng, $alt)")');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Cloud anchor save/restore
    if (usesPersist || usesCloud) {
      this.emit('private fun saveGeoAnchorToCloud(name: String, anchor: Anchor) {');
      this.indentLevel++;
      this.emit('val session = arFragment.arSceneView.session ?: return');
      this.emit('session.hostCloudAnchorAsync(anchor, 365) { cloudId, state ->');
      this.indentLevel++;
      this.emit('if (state == Anchor.CloudAnchorState.SUCCESS && cloudId != null) {');
      this.indentLevel++;
      this.emit('val prefs = getSharedPreferences("geo_anchors", MODE_PRIVATE)');
      this.emit('prefs.edit().putString(name, cloudId).apply()');
      this.emit('android.util.Log.d("HoloScript", "Cloud anchor saved: $name -> $cloudId")');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');

      this.emit('private fun restoreGeoAnchors() {');
      this.indentLevel++;
      this.emit('val prefs = getSharedPreferences("geo_anchors", MODE_PRIVATE)');
      this.emit('val session = arFragment.arSceneView.session ?: return');
      this.emit('for ((name, cloudId) in prefs.all) {');
      this.indentLevel++;
      this.emit('val id = cloudId as? String ?: continue');
      this.emit('session.resolveCloudAnchorAsync(id) { anchor, state ->');
      this.indentLevel++;
      this.emit('if (state == Anchor.CloudAnchorState.SUCCESS && anchor != null) {');
      this.indentLevel++;
      this.emit('geoAnchors[name] = anchor');
      this.emit('val anchorNode = AnchorNode(anchor)');
      this.emit('anchorNode.setParent(arFragment.arSceneView.scene)');
      this.emit('android.util.Log.d("HoloScript", "Restored cloud anchor: $name")');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }
  }

  private compositionHasTrait(composition: HoloComposition, traitName: string): boolean {
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (name === traitName) return true;
      }
    }
    return false;
  }

  // === ARCore Geospatial API (M.010.15) ===

  /**
   * Emit the full Geospatial VPS setup: session config, Earth tracking,
   * anchor creation (geo/terrain/rooftop), and Streetscape Geometry access.
   */
  private emitGeospatialVPSSetup(composition: HoloComposition): void {
    this.emit('');
    this.emit('// === ARCore Geospatial API: VPS street-level geo-anchoring ===');
    this.emit('private var earth: Earth? = null');
    this.emit('private val geospatialAnchors = mutableMapOf<String, Anchor>()');
    this.emit('');

    // --- setupGeospatialVPS ---
    this.emit('private fun setupGeospatialVPS() {');
    this.indentLevel++;
    this.emit('val session = arFragment.arSceneView.session ?: return');
    this.emit('val config = session.config');
    this.emit('config.geospatialMode = Config.GeospatialMode.ENABLED');

    // Enable Streetscape Geometry if any object uses it
    const usesStreetscape = this.compositionHasTrait(composition, 'geospatial_streetscape');
    if (usesStreetscape) {
      this.emit('config.streetscapeGeometryMode = Config.StreetscapeGeometryMode.ENABLED');
    }

    this.emit('session.configure(config)');
    this.emit('');
    this.emit('// Monitor geospatial tracking state');
    this.emit('arFragment.arSceneView.scene.addOnUpdateListener {');
    this.indentLevel++;
    this.emit('earth = session.earth');
    this.emit('val trackingState = earth?.trackingState ?: return@addOnUpdateListener');
    this.emit('if (trackingState != TrackingState.TRACKING) return@addOnUpdateListener');
    this.emit('');
    this.emit('val geospatialState = earth?.cameraGeospatialPose ?: return@addOnUpdateListener');
    this.emit(`val horizontalAccuracy = geospatialState.horizontalAccuracy`);
    this.emit(`val headingAccuracy = geospatialState.headingAccuracy`);
    this.emit('');
    this.emit(
      `if (horizontalAccuracy > ${GEOSPATIAL_DEFAULTS.vps.accuracyThreshold} || headingAccuracy > ${GEOSPATIAL_DEFAULTS.vps.headingAccuracyThreshold}) {`
    );
    this.indentLevel++;
    this.emit('// Accuracy not yet sufficient for anchoring');
    this.emit('return@addOnUpdateListener');
    this.indentLevel--;
    this.emit('}');
    this.emit('');
    this.emit(
      'android.util.Log.d("HoloScript", "Geospatial tracking: accuracy=$horizontalAccuracy m, heading=$headingAccuracy deg")'
    );

    if (usesStreetscape) {
      this.emit('');
      this.emit('// Process Streetscape Geometry meshes');
      this.emit('processStreetscapeGeometry(session)');
    }

    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // Create geospatial anchors for each object with geospatial traits
    for (const obj of composition.objects || []) {
      const traits = obj.traits || [];
      for (const trait of traits) {
        const tName = typeof trait === 'string' ? trait : trait.name;
        const tConfig = typeof trait === 'string' ? {} : trait.config || {};

        if (tName === 'geospatial_anchor') {
          const lat =
            (tConfig as Record<string, unknown>).latitude ?? GEOSPATIAL_DEFAULTS.anchor.latitude;
          const lng =
            (tConfig as Record<string, unknown>).longitude ?? GEOSPATIAL_DEFAULTS.anchor.longitude;
          const alt =
            (tConfig as Record<string, unknown>).altitude ?? GEOSPATIAL_DEFAULTS.anchor.altitude;
          const heading =
            (tConfig as Record<string, unknown>).heading ?? GEOSPATIAL_DEFAULTS.anchor.heading;
          this.emit(
            `createGeospatialAnchor("${this.escapeStringValue(obj.name, 'Kotlin')}", ${lat}, ${lng}, ${alt}, ${heading}f)`
          );
        }

        if (tName === 'geospatial_terrain_anchor') {
          const lat =
            (tConfig as Record<string, unknown>).latitude ??
            GEOSPATIAL_DEFAULTS.terrainAnchor.latitude;
          const lng =
            (tConfig as Record<string, unknown>).longitude ??
            GEOSPATIAL_DEFAULTS.terrainAnchor.longitude;
          const altOffset =
            (tConfig as Record<string, unknown>).altitudeOffset ??
            GEOSPATIAL_DEFAULTS.terrainAnchor.altitudeOffset;
          const heading =
            (tConfig as Record<string, unknown>).heading ??
            GEOSPATIAL_DEFAULTS.terrainAnchor.heading;
          this.emit(
            `resolveTerrainAnchor("${this.escapeStringValue(obj.name, 'Kotlin')}", ${lat}, ${lng}, ${altOffset}, ${heading}f)`
          );
        }

        if (tName === 'geospatial_rooftop_anchor') {
          const lat =
            (tConfig as Record<string, unknown>).latitude ??
            GEOSPATIAL_DEFAULTS.rooftopAnchor.latitude;
          const lng =
            (tConfig as Record<string, unknown>).longitude ??
            GEOSPATIAL_DEFAULTS.rooftopAnchor.longitude;
          const altOffset =
            (tConfig as Record<string, unknown>).altitudeOffset ??
            GEOSPATIAL_DEFAULTS.rooftopAnchor.altitudeOffset;
          const heading =
            (tConfig as Record<string, unknown>).heading ??
            GEOSPATIAL_DEFAULTS.rooftopAnchor.heading;
          this.emit(
            `resolveRooftopAnchor("${this.escapeStringValue(obj.name, 'Kotlin')}", ${lat}, ${lng}, ${altOffset}, ${heading}f)`
          );
        }
      }
    }

    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // --- createGeospatialAnchor ---
    this.emit(
      'private fun createGeospatialAnchor(name: String, lat: Double, lng: Double, alt: Double, heading: Float) {'
    );
    this.indentLevel++;
    this.emit('val earthRef = earth ?: return');
    this.emit('if (earthRef.trackingState != TrackingState.TRACKING) return');
    this.emit('');
    this.emit(
      'val anchor = earthRef.createAnchor(lat, lng, alt, 0f, 0f, Math.sin(Math.toRadians(heading.toDouble() / 2)).toFloat(), Math.cos(Math.toRadians(heading.toDouble() / 2)).toFloat())'
    );
    this.emit('geospatialAnchors[name] = anchor');
    this.emit('');
    this.emit('val anchorNode = AnchorNode(anchor)');
    this.emit('anchorNode.setParent(arFragment.arSceneView.scene)');
    this.emit('');
    this.emit('NodeFactory.createDefaultNode(this) { renderable ->');
    this.indentLevel++;
    this.emit('val node = TransformableNode(arFragment.transformationSystem)');
    this.emit('node.setParent(anchorNode)');
    this.emit('node.renderable = renderable');
    this.emit('placedNodes[name] = node');
    this.emit('android.util.Log.d("HoloScript", "Geospatial anchor: $name at ($lat, $lng, $alt)")');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // --- resolveTerrainAnchor ---
    if (this.compositionHasTrait(composition, 'geospatial_terrain_anchor')) {
      this.emit(
        'private fun resolveTerrainAnchor(name: String, lat: Double, lng: Double, altOffset: Double, heading: Float) {'
      );
      this.indentLevel++;
      this.emit('val earthRef = earth ?: return');
      this.emit('if (earthRef.trackingState != TrackingState.TRACKING) return');
      this.emit('');
      this.emit('val qx = 0f');
      this.emit('val qy = Math.sin(Math.toRadians(heading.toDouble() / 2)).toFloat()');
      this.emit('val qz = 0f');
      this.emit('val qw = Math.cos(Math.toRadians(heading.toDouble() / 2)).toFloat()');
      this.emit('');
      this.emit(
        'earthRef.resolveAnchorOnTerrainAsync(lat, lng, altOffset, qx, qy, qz, qw) { anchor, state ->'
      );
      this.indentLevel++;
      this.emit('if (state == Anchor.TerrainAnchorState.SUCCESS && anchor != null) {');
      this.indentLevel++;
      this.emit('geospatialAnchors[name] = anchor');
      this.emit('val anchorNode = AnchorNode(anchor)');
      this.emit('anchorNode.setParent(arFragment.arSceneView.scene)');
      this.emit('');
      this.emit(
        'NodeFactory.createDefaultNode(this@' + this.options.className + 'Activity) { renderable ->'
      );
      this.indentLevel++;
      this.emit('val node = TransformableNode(arFragment.transformationSystem)');
      this.emit('node.setParent(anchorNode)');
      this.emit('node.renderable = renderable');
      this.emit('placedNodes[name] = node');
      this.emit('android.util.Log.d("HoloScript", "Terrain anchor resolved: $name")');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // --- resolveRooftopAnchor ---
    if (this.compositionHasTrait(composition, 'geospatial_rooftop_anchor')) {
      this.emit(
        'private fun resolveRooftopAnchor(name: String, lat: Double, lng: Double, altOffset: Double, heading: Float) {'
      );
      this.indentLevel++;
      this.emit('val earthRef = earth ?: return');
      this.emit('if (earthRef.trackingState != TrackingState.TRACKING) return');
      this.emit('');
      this.emit('val qx = 0f');
      this.emit('val qy = Math.sin(Math.toRadians(heading.toDouble() / 2)).toFloat()');
      this.emit('val qz = 0f');
      this.emit('val qw = Math.cos(Math.toRadians(heading.toDouble() / 2)).toFloat()');
      this.emit('');
      this.emit(
        'earthRef.resolveAnchorOnRooftopAsync(lat, lng, altOffset, qx, qy, qz, qw) { anchor, state ->'
      );
      this.indentLevel++;
      this.emit('if (state == Anchor.RooftopAnchorState.SUCCESS && anchor != null) {');
      this.indentLevel++;
      this.emit('geospatialAnchors[name] = anchor');
      this.emit('val anchorNode = AnchorNode(anchor)');
      this.emit('anchorNode.setParent(arFragment.arSceneView.scene)');
      this.emit('');
      this.emit(
        'NodeFactory.createDefaultNode(this@' + this.options.className + 'Activity) { renderable ->'
      );
      this.indentLevel++;
      this.emit('val node = TransformableNode(arFragment.transformationSystem)');
      this.emit('node.setParent(anchorNode)');
      this.emit('node.renderable = renderable');
      this.emit('placedNodes[name] = node');
      this.emit('android.util.Log.d("HoloScript", "Rooftop anchor resolved: $name")');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // --- processStreetscapeGeometry ---
    if (usesStreetscape) {
      this.emit('private fun processStreetscapeGeometry(session: Session) {');
      this.indentLevel++;
      this.emit(
        'val streetscapeGeometries = session.getAllTrackables(StreetscapeGeometry::class.java)'
      );
      this.emit('for (geometry in streetscapeGeometries) {');
      this.indentLevel++;
      this.emit('if (geometry.trackingState != TrackingState.TRACKING) continue');
      this.emit('');
      this.emit('val mesh = geometry.meshes.firstOrNull() ?: continue');
      this.emit('val type = geometry.type');
      this.emit(
        'android.util.Log.d("HoloScript", "Streetscape geometry: type=$type, vertices=${mesh.vertexList.size}")'
      );
      this.emit('');
      this.emit('// Streetscape mesh available for occlusion, raycasting, or rendering');
      this.emit('// Type is TERRAIN or BUILDING');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }
  }

  // === Depth Scanner Methods (M.010.02b) ===

  /**
   * Check if any object uses depth scanner traits.
   */
  private hasDepthScanTraits(composition: HoloComposition): boolean {
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if ((DEPTH_SCANNER_TRAITS as readonly string[]).includes(name)) return true;
      }
    }
    return false;
  }

  /**
   * Emit Kotlin code for depth scanning: ARCore depth, ToF, stereo,
   * mesh generation, .holo conversion, realtime streaming, and export.
   */
  private emitDepthScanSetup(composition: HoloComposition): void {
    const hasMlArcore = this.compositionHasTrait(composition, 'depth_ml_arcore');
    const hasConfidence = this.compositionHasTrait(composition, 'depth_confidence_map');
    const hasAutoSelect = this.compositionHasTrait(composition, 'depth_auto_select');
    const hasMeshGenerate = this.compositionHasTrait(composition, 'depth_mesh_generate');
    const hasMeshToHolo = this.compositionHasTrait(composition, 'depth_mesh_to_holo');
    const hasRealtime = this.compositionHasTrait(composition, 'depth_realtime');
    const hasExport = this.compositionHasTrait(composition, 'depth_export');

    this.emit('');
    this.emit('// === Depth Scanner: ARCore depth, ToF, stereo (M.010.02b) ===');
    this.emit(
      `private val depthConfidenceThreshold = ${DEPTH_SCANNER_DEFAULTS.scan.confidenceThreshold}`
    );
    this.emit(`private val depthMaxMeters = ${DEPTH_SCANNER_DEFAULTS.scan.maxDepthMeters}f`);
    this.emit(`private val depthMeshDecimation = ${DEPTH_SCANNER_DEFAULTS.scan.meshDecimation}f`);
    this.emit('private var depthImage: android.media.Image? = null');
    if (hasConfidence) {
      this.emit('private var depthConfidenceImage: android.media.Image? = null');
    }
    this.emit('');

    // --- setupDepthScanner ---
    this.emit('private fun setupDepthScanner() {');
    this.indentLevel++;
    this.emit('val session = arFragment.arSceneView.session ?: return');
    this.emit('val config = session.config');
    this.emit('config.depthMode = Config.DepthMode.AUTOMATIC');
    this.emit('session.configure(config)');
    this.emit('android.util.Log.d("HoloScript", "Depth scanner: DepthMode.AUTOMATIC enabled")');
    this.emit('');

    if (hasAutoSelect) {
      this.emit('// Auto-select best depth source: ToF > ARCore ML > Stereo');
      this.emit('detectDepthSource()');
      this.emit('');
    }

    if (hasRealtime) {
      this.emit('// Continuous depth frame processing in render loop');
      this.emit('arFragment.arSceneView.scene.addOnUpdateListener { _ ->');
      this.indentLevel++;
      this.emit('val frame = arFragment.arSceneView.arFrame ?: return@addOnUpdateListener');
      this.emit('processDepthFrame(frame)');
      this.indentLevel--;
      this.emit('}');
    }

    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // --- processDepthFrame ---
    this.emit('private fun processDepthFrame(frame: Frame) {');
    this.indentLevel++;
    this.emit('try {');
    this.indentLevel++;

    if (hasMlArcore) {
      this.emit('// ARCore ML depth: acquire 16-bit depth image');
      this.emit('depthImage?.close()');
      this.emit('depthImage = frame.acquireDepthImage16Bits()');
    } else {
      this.emit('depthImage?.close()');
      this.emit('depthImage = frame.acquireDepthImage16Bits()');
    }

    if (hasConfidence) {
      this.emit('');
      this.emit('// Confidence map: per-pixel confidence (0-255)');
      this.emit('depthConfidenceImage?.close()');
      this.emit('depthConfidenceImage = frame.acquireRawDepthConfidenceImage()');
    }

    if (hasMeshGenerate) {
      this.emit('');
      this.emit('val depthImg = depthImage ?: return');
      this.emit('generateMeshFromDepth(depthImg)');
    }

    this.indentLevel--;
    this.emit('} catch (e: Exception) {');
    this.indentLevel++;
    this.emit('android.util.Log.w("HoloScript", "Depth frame unavailable: ${e.message}")');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // --- detectDepthSource (auto-select) ---
    if (hasAutoSelect) {
      this.emit('private fun detectDepthSource() {');
      this.indentLevel++;
      this.emit('val session = arFragment.arSceneView.session ?: return');
      this.emit('');
      this.emit('// Check ToF sensor availability');
      this.emit(
        'val hasToF = packageManager.hasSystemFeature("android.hardware.sensor.proximity")'
      );
      this.emit('');
      this.emit('// Check ARCore depth support');
      this.emit('val hasARCoreDepth = session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)');
      this.emit('');
      this.emit('// Check dual camera for stereo depth');
      this.emit(
        'val cameraManager = getSystemService(android.hardware.camera2.CameraManager::class.java)'
      );
      this.emit('val hasStereo = (cameraManager?.cameraIdList?.size ?: 0) >= 2');
      this.emit('');
      this.emit('// Priority: ToF > ARCore ML > Stereo');
      this.emit('val depthSource = when {');
      this.indentLevel++;
      this.emit('hasToF -> "ToF"');
      this.emit('hasARCoreDepth -> "ARCore_ML"');
      this.emit('hasStereo -> "Stereo"');
      this.emit('else -> "None"');
      this.indentLevel--;
      this.emit('}');
      this.emit(
        'android.util.Log.d("HoloScript", "Depth source selected: $depthSource (ToF=$hasToF, ARCore=$hasARCoreDepth, Stereo=$hasStereo)")'
      );
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // --- generateMeshFromDepth ---
    if (hasMeshGenerate) {
      this.emit('private fun generateMeshFromDepth(depthImage: android.media.Image) {');
      this.indentLevel++;
      this.emit('val width = depthImage.width');
      this.emit('val height = depthImage.height');
      this.emit('val buffer = depthImage.planes[0].buffer');
      this.emit('val vertices = mutableListOf<Vector3>()');
      this.emit('val indices = mutableListOf<Int>()');
      this.emit('');
      this.emit('// Convert depth pixels to 3D points with decimation');
      this.emit('val step = (1.0f / depthMeshDecimation).toInt().coerceAtLeast(1)');
      this.emit('for (y in 0 until height step step) {');
      this.indentLevel++;
      this.emit('for (x in 0 until width step step) {');
      this.indentLevel++;
      this.emit('val depthMm = buffer.getShort((y * width + x) * 2).toInt() and 0xFFFF');
      this.emit('val depthM = depthMm / 1000.0f');
      this.emit('if (depthM <= 0f || depthM > depthMaxMeters) continue');
      this.emit('');
      this.emit('// Unproject pixel to 3D point (simplified pinhole model)');
      this.emit('val fx = width / 2.0f  // focal length approximation');
      this.emit('val fy = height / 2.0f');
      this.emit('val cx = width / 2.0f');
      this.emit('val cy = height / 2.0f');
      this.emit('val px = (x - cx) / fx * depthM');
      this.emit('val py = (y - cy) / fy * depthM');
      this.emit('vertices.add(Vector3(px, py, depthM))');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
      this.emit('// Triangulate adjacent points into mesh');
      this.emit('val cols = width / step');
      this.emit('for (row in 0 until (vertices.size / cols) - 1) {');
      this.indentLevel++;
      this.emit('for (col in 0 until cols - 1) {');
      this.indentLevel++;
      this.emit('val i = row * cols + col');
      this.emit('indices.add(i)');
      this.emit('indices.add(i + 1)');
      this.emit('indices.add(i + cols)');
      this.emit('indices.add(i + 1)');
      this.emit('indices.add(i + cols + 1)');
      this.emit('indices.add(i + cols)');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
      this.emit(
        'android.util.Log.d("HoloScript", "Depth mesh: ${vertices.size} vertices, ${indices.size / 3} triangles")'
      );

      if (hasMeshToHolo) {
        this.emit('convertMeshToHolo(vertices, indices)');
      }

      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // --- convertMeshToHolo ---
    if (hasMeshToHolo) {
      this.emit('private fun convertMeshToHolo(vertices: List<Vector3>, indices: List<Int>) {');
      this.indentLevel++;
      this.emit('// Convert mesh vertices + classification to HoloScript entities');
      this.emit('val holoEntities = mutableListOf<Map<String, Any>>()');
      this.emit('for ((i, vertex) in vertices.withIndex()) {');
      this.indentLevel++;
      this.emit('holoEntities.add(mapOf(');
      this.indentLevel++;
      this.emit('"type" to "DepthPoint",');
      this.emit('"id" to "dp_$i",');
      this.emit('"position" to listOf(vertex.x, vertex.y, vertex.z),');
      this.emit('"classification" to "unknown"');
      this.indentLevel--;
      this.emit('))');
      this.indentLevel--;
      this.emit('}');
      this.emit(
        'android.util.Log.d("HoloScript", "Converted ${holoEntities.size} depth points to .holo entities")'
      );
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // --- exportDepthMesh ---
    if (hasExport) {
      const format = DEPTH_SCANNER_DEFAULTS.export.format;
      this.emit('private fun exportDepthMesh(vertices: List<Vector3>, indices: List<Int>) {');
      this.indentLevel++;
      this.emit(`val format = "${format}"`);
      this.emit('val filename = "depth_scan_${System.currentTimeMillis()}.$format"');
      this.emit('val file = java.io.File(getExternalFilesDir(null), filename)');
      this.emit('');
      this.emit('if (format == "obj") {');
      this.indentLevel++;
      this.emit('val sb = StringBuilder()');
      this.emit('sb.appendLine("# HoloScript Depth Scan Export")');
      this.emit('for (v in vertices) {');
      this.indentLevel++;
      this.emit('sb.appendLine("v ${v.x} ${v.y} ${v.z}")');
      this.indentLevel--;
      this.emit('}');
      this.emit('for (i in indices.indices step 3) {');
      this.indentLevel++;
      this.emit('sb.appendLine("f ${indices[i]+1} ${indices[i+1]+1} ${indices[i+2]+1}")');
      this.indentLevel--;
      this.emit('}');
      this.emit('file.writeText(sb.toString())');
      this.indentLevel--;
      this.emit('} else {');
      this.indentLevel++;
      this.emit('// GLB export: binary glTF format');
      this.emit('android.util.Log.d("HoloScript", "GLB export requires glTF serializer library")');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
      this.emit('android.util.Log.d("HoloScript", "Depth mesh exported: ${file.absolutePath}")');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }
  }

  // === NPU Scene Understanding (M.010.03) ===

  /**
   * Check whether the composition references any npu_* scene understanding traits.
   */
  private hasNPUSceneTraits(composition: HoloComposition): boolean {
    const npuNames: ReadonlyArray<string> = NPU_SCENE_TRAITS;
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (npuNames.includes(name)) return true;
      }
    }
    return false;
  }

  /**
   * Emit a standalone Kotlin file for NPU scene understanding using
   * ML Kit, TFLite, and NNAPI hardware acceleration.
   */
  private emitNPUSceneSetup(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;
    const pkg = this.options.packageName;
    const cls = this.options.className;
    const defaults = NPU_SCENE_DEFAULTS;
    const usedTraits = new Set<string>();
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if ((NPU_SCENE_TRAITS as ReadonlyArray<string>).includes(name)) {
          usedTraits.add(name);
        }
      }
    }
    this.emit('// Auto-generated by HoloScript AndroidCompiler — NPU Scene Understanding');
    this.emit(
      `// Source: composition "${this.escapeStringValue(composition.name as string, 'Kotlin')}"`
    );
    this.emit('// Requires ML Kit, CameraX, NNAPI delegate');
    this.emit('// Do not edit manually — regenerate from .holo source');
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import android.graphics.Bitmap');
    this.emit('import android.graphics.Rect');
    this.emit('import android.util.Log');
    this.emit('import android.util.Size');
    this.emit('import androidx.camera.core.ImageAnalysis');
    this.emit('import androidx.camera.core.ImageProxy');
    this.emit('import androidx.lifecycle.ViewModel');
    this.emit('import androidx.lifecycle.viewModelScope');
    this.emit('import kotlinx.coroutines.flow.MutableStateFlow');
    this.emit('import kotlinx.coroutines.flow.StateFlow');
    this.emit('import kotlinx.coroutines.launch');
    if (usedTraits.has('npu_detect')) {
      this.emit('import com.google.mlkit.vision.common.InputImage');
      this.emit('import com.google.mlkit.vision.objects.ObjectDetection');
      this.emit('import com.google.mlkit.vision.objects.ObjectDetector');
      this.emit('import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions');
    }
    if (usedTraits.has('npu_classify')) {
      this.emit('import com.google.mlkit.vision.common.InputImage');
      this.emit('import com.google.mlkit.vision.label.ImageLabeling');
      this.emit('import com.google.mlkit.vision.label.ImageLabeler');
      this.emit('import com.google.mlkit.vision.label.defaults.ImageLabelerOptions');
    }
    if (usedTraits.has('npu_segment')) {
      this.emit('import com.google.mlkit.vision.segmentation.Segmentation');
      this.emit('import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions');
    }
    if (usedTraits.has('npu_model_custom')) {
      this.emit('import org.tensorflow.lite.Interpreter');
      this.emit('import org.tensorflow.lite.nnapi.NnApiDelegate');
      this.emit('import com.google.mlkit.common.model.LocalModel');
    }
    this.emit('');
    this.emit('/** A single detection result from NPU scene understanding. */');
    this.emit('data class NPUDetection(');
    this.indentLevel++;
    this.emit('val label: String,');
    this.emit('val confidence: Float,');
    this.emit('val boundingBox: Rect? = null,');
    this.emit('val position: FloatArray? = null,');
    this.emit('val segmentationMask: Bitmap? = null,');
    this.emit('val depthValue: Float? = null');
    this.indentLevel--;
    this.emit(')');
    this.emit('');
    this.emit(`class ${cls}NPUSceneManager : ViewModel() {`);
    this.indentLevel++;
    this.emit('');
    this.emit('private val _detections = MutableStateFlow<List<NPUDetection>>(emptyList())');
    this.emit('val detections: StateFlow<List<NPUDetection>> = _detections');
    this.emit('');
    this.emit('private val _isProcessing = MutableStateFlow(false)');
    this.emit('val isProcessing: StateFlow<Boolean> = _isProcessing');
    this.emit('');
    this.emit('private var inferenceCount: Int = 0');
    this.emit(`private val confidenceThreshold: Float = ${defaults.confidenceThreshold}f`);
    this.emit(`private val maxDetections: Int = ${defaults.maxDetections}`);
    this.emit(`private val targetFPS: Int = ${defaults.targetFPS}`);
    this.emit(`private val entityScale: Float = ${defaults.entityScale}f`);
    this.emit(`private val labelOffsetY: Float = ${defaults.labelOffsetY}f`);
    this.emit('private var frameCounter: Int = 0');
    this.emit('private var lastProcessTimeMs: Long = 0');
    this.emit('');
    if (usedTraits.has('npu_detect')) {
      this.emit('// MARK: Object Detection (npu_detect)');
      this.emit('');
      this.emit('private val objectDetector: ObjectDetector by lazy {');
      this.indentLevel++;
      this.emit('val options = ObjectDetectorOptions.Builder()');
      this.emit('    .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)');
      this.emit('    .enableMultipleObjects()');
      this.emit('    .enableClassification()');
      this.emit('    .build()');
      this.emit('ObjectDetection.getClient(options)');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
      this.emit('fun detectObjects(image: InputImage) {');
      this.indentLevel++;
      this.emit('objectDetector.process(image)');
      this.emit('    .addOnSuccessListener { objects ->');
      this.indentLevel++;
      this.emit('val results = objects');
      this.emit(
        '    .filter { it.labels.isNotEmpty() && (it.labels.firstOrNull()?.confidence ?: 0f) >= confidenceThreshold }'
      );
      this.emit('    .take(maxDetections)');
      this.emit('    .map { obj ->');
      this.indentLevel++;
      this.emit('NPUDetection(');
      this.emit('    label = obj.labels.firstOrNull()?.text ?: "unknown",');
      this.emit('    confidence = obj.labels.firstOrNull()?.confidence ?: 0f,');
      this.emit('    boundingBox = obj.boundingBox');
      this.emit(')');
      this.indentLevel--;
      this.emit('    }');
      this.emit('_detections.value = results');
      this.emit('inferenceCount++');
      this.emit('Log.d("HoloScript", "Detected ${results.size} objects")');
      this.indentLevel--;
      this.emit('    }');
      this.emit('    .addOnFailureListener { e ->');
      this.indentLevel++;
      this.emit('Log.e("HoloScript", "Object detection failed", e)');
      this.indentLevel--;
      this.emit('    }');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }
    if (usedTraits.has('npu_classify')) {
      this.emit('// MARK: Classification (npu_classify)');
      this.emit('');
      this.emit('private val imageLabeler: ImageLabeler by lazy {');
      this.indentLevel++;
      this.emit('val options = ImageLabelerOptions.Builder()');
      this.emit(`    .setConfidenceThreshold(${defaults.confidenceThreshold}f)`);
      this.emit('    .build()');
      this.emit('ImageLabeling.getClient(options)');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
      this.emit('fun classifyImage(image: InputImage) {');
      this.indentLevel++;
      this.emit('imageLabeler.process(image)');
      this.emit('    .addOnSuccessListener { labels ->');
      this.indentLevel++;
      this.emit('val results = labels');
      this.emit('    .filter { it.confidence >= confidenceThreshold }');
      this.emit('    .take(maxDetections)');
      this.emit('    .map { label ->');
      this.indentLevel++;
      this.emit('NPUDetection(label = label.text, confidence = label.confidence)');
      this.indentLevel--;
      this.emit('    }');
      this.emit('_detections.value = results');
      this.emit('inferenceCount++');
      this.indentLevel--;
      this.emit('    }');
      this.emit('    .addOnFailureListener { e ->');
      this.indentLevel++;
      this.emit('Log.e("HoloScript", "Image classification failed", e)');
      this.indentLevel--;
      this.emit('    }');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }
    if (usedTraits.has('npu_segment')) {
      this.emit('// MARK: Segmentation (npu_segment)');
      this.emit('');
      this.emit('private val segmenter by lazy {');
      this.indentLevel++;
      this.emit('val options = SelfieSegmenterOptions.Builder()');
      this.emit('    .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)');
      this.emit('    .enableRawSizeMask()');
      this.emit('    .build()');
      this.emit('Segmentation.getClient(options)');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
      this.emit('fun segmentScene(image: InputImage) {');
      this.indentLevel++;
      this.emit('segmenter.process(image)');
      this.emit('    .addOnSuccessListener { mask ->');
      this.indentLevel++;
      this.emit('val buffer = mask.buffer');
      this.emit('val width = mask.width');
      this.emit('val height = mask.height');
      this.emit('val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)');
      this.emit('_detections.value = listOf(NPUDetection(');
      this.emit('    label = "person_segmentation", confidence = 1.0f,');
      this.emit('    segmentationMask = bitmap');
      this.emit('))');
      this.emit('inferenceCount++');
      this.indentLevel--;
      this.emit('    }');
      this.emit('    .addOnFailureListener { e ->');
      this.indentLevel++;
      this.emit('Log.e("HoloScript", "Segmentation failed", e)');
      this.indentLevel--;
      this.emit('    }');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }
    if (usedTraits.has('npu_entity_pipe')) {
      this.emit('// MARK: Entity Pipeline (npu_entity_pipe)');
      this.emit('');
      this.emit(
        'fun mapDetectionsToEntities(detections: List<NPUDetection>, arFragment: com.google.ar.sceneform.ux.ArFragment) {'
      );
      this.indentLevel++;
      this.emit('val scene = arFragment.arSceneView.scene');
      this.emit('for (detection in detections) {');
      this.indentLevel++;
      this.emit('val bbox = detection.boundingBox ?: continue');
      this.emit('val centerX = (bbox.left + bbox.right) / 2f');
      this.emit('val centerY = (bbox.top + bbox.bottom) / 2f');
      this.emit('val frame = arFragment.arSceneView.arFrame ?: continue');
      this.emit('val hits = frame.hitTest(centerX, centerY)');
      this.emit('val hit = hits.firstOrNull() ?: continue');
      this.emit('val anchor = hit.createAnchor()');
      this.emit('val anchorNode = com.google.ar.sceneform.AnchorNode(anchor)');
      this.emit('anchorNode.setParent(scene)');
      this.emit('com.google.ar.sceneform.rendering.MaterialFactory');
      this.emit('    .makeOpaqueWithColor(arFragment.requireContext(),');
      this.emit('        com.google.ar.sceneform.rendering.Color(0.2f, 0.6f, 1.0f, 0.6f))');
      this.emit('    .thenAccept { material ->');
      this.indentLevel++;
      this.emit(
        `val renderable = com.google.ar.sceneform.rendering.ShapeFactory.makeSphere(${defaults.entityScale}f, com.google.ar.sceneform.math.Vector3.zero(), material)`
      );
      this.emit(
        'val node = com.google.ar.sceneform.ux.TransformableNode(arFragment.transformationSystem)'
      );
      this.emit('node.setParent(anchorNode)');
      this.emit('node.renderable = renderable');
      this.emit('node.name = detection.label');
      this.emit('Log.d("HoloScript", "Entity created: ${detection.label}")');
      this.indentLevel--;
      this.emit('    }');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }
    if (usedTraits.has('npu_realtime')) {
      this.emit('// MARK: Realtime Processing (npu_realtime)');
      this.emit('');
      this.emit('fun createImageAnalyzer(): ImageAnalysis.Analyzer {');
      this.indentLevel++;
      this.emit('return ImageAnalysis.Analyzer { imageProxy ->');
      this.indentLevel++;
      this.emit('frameCounter++');
      this.emit('val now = System.currentTimeMillis()');
      this.emit('val intervalMs = 1000L / targetFPS');
      this.emit('if (now - lastProcessTimeMs < intervalMs) {');
      this.indentLevel++;
      this.emit('imageProxy.close()');
      this.emit('return@Analyzer');
      this.indentLevel--;
      this.emit('}');
      this.emit('lastProcessTimeMs = now');
      this.emit('_isProcessing.value = true');
      this.emit('');
      this.emit('@androidx.camera.core.ExperimentalGetImage');
      this.emit('val mediaImage = imageProxy.image');
      this.emit('if (mediaImage != null) {');
      this.indentLevel++;
      this.emit(
        'val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)'
      );
      if (usedTraits.has('npu_classify')) {
        this.emit('classifyImage(image)');
      }
      if (usedTraits.has('npu_detect')) {
        this.emit('detectObjects(image)');
      }
      if (usedTraits.has('npu_segment')) {
        this.emit('segmentScene(image)');
      }
      this.indentLevel--;
      this.emit('}');
      this.emit('_isProcessing.value = false');
      this.emit('imageProxy.close()');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }
    if (usedTraits.has('npu_model_custom')) {
      this.emit('// MARK: Custom Model (npu_model_custom)');
      this.emit('');
      this.emit('private var customInterpreter: Interpreter? = null');
      this.emit('');
      this.emit('fun loadCustomModel(context: android.content.Context, assetPath: String) {');
      this.indentLevel++;
      this.emit('val localModel = LocalModel.Builder()');
      this.emit('    .setAssetFilePath(assetPath)');
      this.emit('    .build()');
      this.emit('');
      this.emit('// NNAPI delegate for hardware acceleration');
      this.emit('val nnApiDelegate = NnApiDelegate()');
      this.emit('val options = Interpreter.Options().addDelegate(nnApiDelegate)');
      this.emit('');
      this.emit('val modelFile = context.assets.open(assetPath)');
      this.emit('val buffer = modelFile.readBytes()');
      this.emit('val byteBuffer = java.nio.ByteBuffer.allocateDirect(buffer.size)');
      this.emit('byteBuffer.put(buffer)');
      this.emit('customInterpreter = Interpreter(byteBuffer, options)');
      this.emit('Log.d("HoloScript", "Custom model loaded with NNAPI: $assetPath")');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }
    if (usedTraits.has('npu_label_overlay')) {
      this.emit('// MARK: Label Overlay (npu_label_overlay)');
      this.emit('');
      this.emit('fun createLabelOverlay(');
      this.emit('    detection: NPUDetection,');
      this.emit('    arFragment: com.google.ar.sceneform.ux.ArFragment,');
      this.emit('    anchorNode: com.google.ar.sceneform.AnchorNode');
      this.emit(') {');
      this.indentLevel++;
      this.emit('com.google.ar.sceneform.rendering.ViewRenderable.builder()');
      this.emit(
        '    .setView(arFragment.requireContext(), android.widget.TextView(arFragment.requireContext()).apply {'
      );
      this.indentLevel++;
      this.emit('text = "${detection.label} (${(detection.confidence * 100).toInt()}%)"');
      this.emit('setTextColor(android.graphics.Color.WHITE)');
      this.emit('setBackgroundColor(android.graphics.Color.argb(180, 0, 0, 0))');
      this.emit('setPadding(12, 6, 12, 6)');
      this.emit('textSize = 12f');
      this.indentLevel--;
      this.emit('    })');
      this.emit('    .build()');
      this.emit('    .thenAccept { renderable ->');
      this.indentLevel++;
      this.emit('val labelNode = com.google.ar.sceneform.Node()');
      this.emit('labelNode.setParent(anchorNode)');
      this.emit(
        `labelNode.localPosition = com.google.ar.sceneform.math.Vector3(0f, ${defaults.labelOffsetY}f, 0f)`
      );
      this.emit('labelNode.renderable = renderable');
      this.emit('Log.d("HoloScript", "Label overlay: ${detection.label}")');
      this.indentLevel--;
      this.emit('    }');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }
    this.indentLevel--;
    this.emit('}');
    return this.lines.join('\n');
  }

  // === Utility Methods ===

  private emit(line: string): void {
    const indent = this.options.indent.repeat(this.indentLevel);
    this.lines.push(indent + line);
  }

  private sanitizeName(name: string): string {
    const result = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  private getSceneformGeometry(meshType: string): string {
    const geometries: Record<string, string> = {
      cube: 'ShapeFactory.makeCube(Vector3(0.1f, 0.1f, 0.1f), Vector3.zero(), material)',
      box: 'ShapeFactory.makeCube(Vector3(0.1f, 0.1f, 0.1f), Vector3.zero(), material)',
      sphere: 'ShapeFactory.makeSphere(0.05f, Vector3.zero(), material)',
      cylinder: 'ShapeFactory.makeCylinder(0.05f, 0.1f, Vector3.zero(), material)',
    };
    return (
      geometries[meshType] ||
      'ShapeFactory.makeCube(Vector3(0.1f, 0.1f, 0.1f), Vector3.zero(), material)'
    );
  }

  private findObjProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    return obj.properties?.find((p) => p.key === key)?.value;
  }

  private toKotlinType(value: HoloValue): string {
    if (value === null) return 'Any?';
    if (typeof value === 'boolean') return 'Boolean';
    if (typeof value === 'number') return Number.isInteger(value) ? 'Int' : 'Float';
    if (typeof value === 'string') return 'String';
    if (Array.isArray(value)) {
      if (value.length === 3 && value.every((v) => typeof v === 'number')) return 'Vector3';
      return 'List<Any>';
    }
    return 'Any';
  }

  private toKotlinValue(value: HoloValue): string {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? `${value}` : `${value}f`;
    }
    if (typeof value === 'string') return `"${this.escapeStringValue(value, 'Kotlin')}"`;
    if (Array.isArray(value)) {
      if (value.length === 3 && value.every((v) => typeof v === 'number')) {
        return `Vector3(${value[0]}f, ${value[1]}f, ${value[2]}f)`;
      }
      return `listOf(${value.map((v) => this.toKotlinValue(v)).join(', ')})`;
    }
    return 'null';
  }

  private toAndroidColor(value: HoloValue | undefined): string {
    if (!value) return 'android.graphics.Color.BLUE';

    if (typeof value === 'string') {
      if (value.startsWith('#')) {
        return `android.graphics.Color.parseColor("${value}")`;
      }
      const colors: Record<string, string> = {
        red: 'android.graphics.Color.RED',
        green: 'android.graphics.Color.GREEN',
        blue: 'android.graphics.Color.BLUE',
        white: 'android.graphics.Color.WHITE',
        black: 'android.graphics.Color.BLACK',
        yellow: 'android.graphics.Color.YELLOW',
        cyan: 'android.graphics.Color.CYAN',
        magenta: 'android.graphics.Color.MAGENTA',
      };
      return colors[value.toLowerCase()] || 'android.graphics.Color.BLUE';
    }
    if (Array.isArray(value) && value.length >= 3) {
      const [r, g, b, a = 1] = value as number[];
      return `android.graphics.Color.argb(${Math.round(a * 255)}, ${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    }
    return 'android.graphics.Color.BLUE';
  }

  // === Portal AR Methods (M.010.06) ===

  private hasPortalARTraits(composition: HoloComposition): boolean {
    const portalNames: ReadonlyArray<string> = PORTAL_AR_TRAITS;
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (portalNames.includes(name)) return true;
      }
    }
    return false;
  }

  private emitPortalARSetup(composition: HoloComposition): void {
    this.emit('');
    this.emit('// === Portal AR: full-scene holographic layer behind reality ===');
    this.emit('private var portalSession: Session? = null');
    this.emit('private var portalRenderer: HolographicRenderer? = null');
    this.emit('private var depthTexture: Image? = null');
    this.emit('private var sceneMesh: Mesh? = null');
    this.emit('');

    // setupPortalAR
    this.emit('private fun setupPortalAR() {');
    this.indentLevel++;
    this.emit('val session = arFragment.arSceneView.session ?: return');
    this.emit('');
    this.emit('// Enable depth mode for portal occlusion');
    this.emit('val config = Config(session)');
    this.emit('config.depthMode = Config.DepthMode.AUTOMATIC');
    this.emit('config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR');

    // Scene mesh for world mesh traits
    if (
      this.compositionHasTrait(composition, 'portal_world_mesh') ||
      this.compositionHasTrait(composition, 'portal_mesh_occlusion')
    ) {
      this.emit('config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL');
      this.emit('// Enable scene mesh for portal world mesh integration');
      this.emit('if (session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {');
      this.indentLevel++;
      this.emit('config.depthMode = Config.DepthMode.AUTOMATIC');
      this.indentLevel--;
      this.emit('}');
    }

    this.emit('session.configure(config)');
    this.emit('portalSession = session');
    this.emit('');

    this.emit('// Create holographic render layer behind reality');
    this.emit('portalRenderer = HolographicRenderer(this)');
    this.emit('portalRenderer?.initialize(session)');
    this.emit('');

    // Portal occlusion via depth buffer
    if (this.compositionHasTrait(composition, 'portal_occlusion')) {
      this.emit('// Portal occlusion: real objects block holograms via depth buffer');
      this.emit('arFragment.arSceneView.scene.addOnUpdateListener { _ ->');
      this.indentLevel++;
      this.emit('val frame = arFragment.arSceneView.arFrame ?: return@addOnUpdateListener');
      this.emit('try {');
      this.indentLevel++;
      this.emit('depthTexture = frame.acquireDepthImage16Bits()');
      this.emit('portalRenderer?.updateDepthOcclusion(depthTexture!!)');
      this.indentLevel--;
      this.emit('} catch (e: Exception) {');
      this.indentLevel++;
      this.emit('// Depth not available on this frame');
      this.indentLevel--;
      this.emit('} finally {');
      this.indentLevel++;
      this.emit('depthTexture?.close()');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // Portal parallax from device pose
    if (this.compositionHasTrait(composition, 'portal_parallax')) {
      this.emit('// Portal parallax: depth-correct parallax from device pose');
      this.emit('arFragment.arSceneView.scene.addOnUpdateListener { _ ->');
      this.indentLevel++;
      this.emit('val frame = arFragment.arSceneView.arFrame ?: return@addOnUpdateListener');
      this.emit('val cameraPose = frame.camera.pose');
      this.emit('portalRenderer?.applyParallaxCorrection(cameraPose)');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // Portal depth fade
    if (this.compositionHasTrait(composition, 'portal_depth_fade')) {
      this.emit('// Portal depth fade: holograms fade at distance');
      this.emit('portalRenderer?.enableDepthFade(nearPlane = 0.1f, farPlane = 10.0f)');
      this.emit('');
    }

    // Portal world mesh / mesh occlusion
    if (
      this.compositionHasTrait(composition, 'portal_world_mesh') ||
      this.compositionHasTrait(composition, 'portal_mesh_occlusion')
    ) {
      this.emit('// Portal world mesh: scene mesh for realistic occlusion');
      this.emit('arFragment.arSceneView.scene.addOnUpdateListener { _ ->');
      this.indentLevel++;
      this.emit('val frame = arFragment.arSceneView.arFrame ?: return@addOnUpdateListener');
      this.emit('try {');
      this.indentLevel++;
      this.emit('val rawDepth = frame.acquireRawDepthImage16Bits()');
      this.emit('sceneMesh = portalRenderer?.reconstructMesh(rawDepth)');
      this.emit('portalRenderer?.updateMeshOcclusion(sceneMesh!!)');
      this.emit('rawDepth.close()');
      this.indentLevel--;
      this.emit('} catch (e: Exception) { /* depth not available */ }');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // Portal peek through via device tilt
    if (this.compositionHasTrait(composition, 'portal_peek_through')) {
      this.emit('// Portal peek through: tilt phone to reveal holographic layer');
      this.emit('val sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager');
      this.emit('val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)');
      this.emit('val portalTiltThreshold = 30.0f // degrees');
      this.emit('sensorManager.registerListener(object : SensorEventListener {');
      this.indentLevel++;
      this.emit('override fun onSensorChanged(event: SensorEvent) {');
      this.indentLevel++;
      this.emit(
        'val tiltAngle = Math.toDegrees(Math.atan2(event.values[1].toDouble(), event.values[2].toDouble())).toFloat()'
      );
      this.emit('portalRenderer?.setPortalVisibility(Math.abs(tiltAngle) > portalTiltThreshold)');
      this.indentLevel--;
      this.emit('}');
      this.emit('override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}');
      this.indentLevel--;
      this.emit('}, accelerometer, SensorManager.SENSOR_DELAY_UI)');
      this.emit('');
    }

    // Portal boundary
    if (this.compositionHasTrait(composition, 'portal_boundary')) {
      this.emit('// Portal boundary: configurable shape (circle/rect)');
      this.emit('val portalBoundary = PortalBoundary()');
      this.emit('portalBoundary.shape = PortalBoundary.Shape.CIRCLE // configurable');
      this.emit('portalBoundary.radius = 1.5f');
      this.emit('portalRenderer?.setBoundary(portalBoundary)');
      this.emit('');
    }

    // Portal lighting match
    if (this.compositionHasTrait(composition, 'portal_lighting_match')) {
      this.emit('// Portal lighting match: use ARCore light estimation');
      this.emit('arFragment.arSceneView.scene.addOnUpdateListener { _ ->');
      this.indentLevel++;
      this.emit('val frame = arFragment.arSceneView.arFrame ?: return@addOnUpdateListener');
      this.emit('val lightEstimate = frame.lightEstimate');
      this.emit('if (lightEstimate != null && lightEstimate.state == LightEstimate.State.VALID) {');
      this.indentLevel++;
      this.emit('val intensity = lightEstimate.pixelIntensity');
      this.emit('val colorCorrection = FloatArray(4)');
      this.emit('lightEstimate.getColorCorrection(colorCorrection, 0)');
      this.emit('portalRenderer?.updateLighting(intensity, colorCorrection)');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    this.emit('print("[HoloScript] Portal AR initialized")');
    this.indentLevel--;
    this.emit('}');
  }

  // === Camera Hand Tracking Methods (M.010.04) ===

  private hasHandTrackingTraits(composition: HoloComposition): boolean {
    const handTraitNames: ReadonlyArray<string> = CAMERA_HAND_TRACKING_TRAITS;
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (handTraitNames.includes(name)) return true;
      }
    }
    return false;
  }

  private emitHandTrackingSetup(composition: HoloComposition): void {
    this.emit('');
    this.emit('// === Camera Hand Tracking: MediaPipe Hands (M.010.04) ===');
    this.emit('private var handsolution: com.google.mediapipe.solutions.hands.Hands? = null');
    this.emit('');

    const twoHands = this.compositionHasTrait(composition, 'camera_hand_two_hands');
    const maxHands = twoHands ? 2 : 1;

    const hasPinch = this.compositionHasTrait(composition, 'camera_hand_gesture_pinch');
    const hasPoint = this.compositionHasTrait(composition, 'camera_hand_gesture_point');
    const hasPalm = this.compositionHasTrait(composition, 'camera_hand_gesture_palm');
    const hasFist = this.compositionHasTrait(composition, 'camera_hand_gesture_fist');
    const hasConfidence = this.compositionHasTrait(composition, 'camera_hand_confidence');
    const hasSkeleton = this.compositionHasTrait(composition, 'camera_hand_skeleton');
    const hasToSpatial = this.compositionHasTrait(composition, 'camera_hand_to_spatial');

    // setupHandTracking()
    this.emit('private fun setupHandTracking() {');
    this.indentLevel++;
    this.emit('val options = com.google.mediapipe.solutions.hands.HandsOptions.builder()');
    this.emit(`    .setMaxNumHands(${maxHands})`);
    this.emit('    .setStaticImageMode(false)');
    this.emit(
      '    .setRunningMode(com.google.mediapipe.solutions.hands.Hands.RUNNING_MODE_LIVE_STREAM)'
    );
    if (hasConfidence) {
      this.emit('    .setMinHandDetectionConfidence(0.7f)');
    } else {
      this.emit('    .setMinHandDetectionConfidence(0.5f)');
    }
    this.emit('    .setMinTrackingConfidence(0.5f)');
    this.emit('    .build()');
    this.emit('');
    this.emit('handsolution = com.google.mediapipe.solutions.hands.Hands(this, options)');
    this.emit('handsolution?.setResultListener { result ->');
    this.indentLevel++;
    this.emit('processHandResults(result)');
    this.indentLevel--;
    this.emit('}');
    this.emit('');
    this.emit('// Start CameraX front camera feed');
    this.emit('startCameraForHandTracking()');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // startCameraForHandTracking()
    this.emit('private fun startCameraForHandTracking() {');
    this.indentLevel++;
    this.emit(
      'val cameraProviderFuture = androidx.camera.lifecycle.ProcessCameraProvider.getInstance(this)'
    );
    this.emit('cameraProviderFuture.addListener({');
    this.indentLevel++;
    this.emit('val cameraProvider = cameraProviderFuture.get()');
    this.emit('val preview = androidx.camera.core.Preview.Builder().build()');
    this.emit('val imageAnalysis = androidx.camera.core.ImageAnalysis.Builder()');
    this.emit(
      '    .setBackpressureStrategy(androidx.camera.core.ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)'
    );
    this.emit('    .build()');
    this.emit(
      'imageAnalysis.setAnalyzer(java.util.concurrent.Executors.newSingleThreadExecutor()) { imageProxy ->'
    );
    this.indentLevel++;
    this.emit('handsolution?.send(imageProxy)');
    this.indentLevel--;
    this.emit('}');
    this.emit('val cameraSelector = androidx.camera.core.CameraSelector.DEFAULT_FRONT_CAMERA');
    this.emit('cameraProvider.unbindAll()');
    this.emit('cameraProvider.bindToLifecycle(this, cameraSelector, preview, imageAnalysis)');
    this.indentLevel--;
    this.emit('}, androidx.core.content.ContextCompat.getMainExecutor(this))');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // processHandResults()
    this.emit(
      'private fun processHandResults(result: com.google.mediapipe.solutions.hands.HandsResult) {'
    );
    this.indentLevel++;
    this.emit('if (result.multiHandLandmarks().isEmpty()) return');
    this.emit('');
    this.emit('for ((handIndex, landmarks) in result.multiHandLandmarks().withIndex()) {');
    this.indentLevel++;

    if (hasSkeleton) {
      this.emit('// 21-joint skeleton data');
      this.emit('val wrist = landmarks.landmarkList[0]');
      this.emit('val thumbCmc = landmarks.landmarkList[1]');
      this.emit('val thumbMcp = landmarks.landmarkList[2]');
      this.emit('val thumbIp = landmarks.landmarkList[3]');
      this.emit('val thumbTip = landmarks.landmarkList[4]');
      this.emit('val indexMcp = landmarks.landmarkList[5]');
      this.emit('val indexPip = landmarks.landmarkList[6]');
      this.emit('val indexDip = landmarks.landmarkList[7]');
      this.emit('val indexTip = landmarks.landmarkList[8]');
      this.emit('val middleMcp = landmarks.landmarkList[9]');
      this.emit('val middlePip = landmarks.landmarkList[10]');
      this.emit('val middleDip = landmarks.landmarkList[11]');
      this.emit('val middleTip = landmarks.landmarkList[12]');
      this.emit('val ringMcp = landmarks.landmarkList[13]');
      this.emit('val ringPip = landmarks.landmarkList[14]');
      this.emit('val ringDip = landmarks.landmarkList[15]');
      this.emit('val ringTip = landmarks.landmarkList[16]');
      this.emit('val pinkyMcp = landmarks.landmarkList[17]');
      this.emit('val pinkyPip = landmarks.landmarkList[18]');
      this.emit('val pinkyDip = landmarks.landmarkList[19]');
      this.emit('val pinkyTip = landmarks.landmarkList[20]');
      this.emit('');
    } else {
      this.emit('// Key landmarks for gesture recognition');
      this.emit('val thumbTip = landmarks.landmarkList[4]');
      this.emit('val indexMcp = landmarks.landmarkList[5]');
      this.emit('val indexPip = landmarks.landmarkList[6]');
      this.emit('val indexTip = landmarks.landmarkList[8]');
      this.emit('val middleMcp = landmarks.landmarkList[9]');
      this.emit('val middlePip = landmarks.landmarkList[10]');
      this.emit('val middleTip = landmarks.landmarkList[12]');
      this.emit('val ringMcp = landmarks.landmarkList[13]');
      this.emit('val ringPip = landmarks.landmarkList[14]');
      this.emit('val ringTip = landmarks.landmarkList[16]');
      this.emit('val pinkyMcp = landmarks.landmarkList[17]');
      this.emit('val pinkyPip = landmarks.landmarkList[18]');
      this.emit('val pinkyTip = landmarks.landmarkList[20]');
      this.emit('');
    }

    if (hasConfidence) {
      this.emit('// Filter low-confidence landmarks');
      this.emit('val minConfidence = 0.7f');
      this.emit(
        'if (thumbTip.visibility < minConfidence || indexTip.visibility < minConfidence) {'
      );
      this.indentLevel++;
      this.emit('continue');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    if (hasPinch) {
      this.emit('// Pinch gesture: thumb tip close to index tip');
      this.emit('val pinchDist = Math.sqrt(');
      this.emit('    Math.pow((thumbTip.x - indexTip.x).toDouble(), 2.0) +');
      this.emit('    Math.pow((thumbTip.y - indexTip.y).toDouble(), 2.0)');
      this.emit(').toFloat()');
      this.emit('if (pinchDist < 0.05f) {');
      this.indentLevel++;
      this.emit('android.util.Log.d("HoloScript", "Hand $handIndex: PINCH detected")');
      if (hasToSpatial) {
        this.emit('onSpatialInput("pinch", handIndex, thumbTip.x, thumbTip.y, thumbTip.z)');
      }
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    if (hasPoint) {
      this.emit('// Point gesture: index extended, others curled');
      this.emit('val indexExtended = indexTip.y < indexMcp.y');
      this.emit('val middleCurled = middleTip.y > middlePip.y');
      this.emit('val ringCurled = ringTip.y > ringPip.y');
      this.emit('val pinkyCurled = pinkyTip.y > pinkyPip.y');
      this.emit('if (indexExtended && middleCurled && ringCurled && pinkyCurled) {');
      this.indentLevel++;
      this.emit('android.util.Log.d("HoloScript", "Hand $handIndex: POINT detected")');
      if (hasToSpatial) {
        this.emit('onSpatialInput("point", handIndex, indexTip.x, indexTip.y, indexTip.z)');
      }
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    if (hasPalm) {
      this.emit('// Palm gesture: all fingertips above MCPs (open hand)');
      this.emit('val allExtended = indexTip.y < indexMcp.y && middleTip.y < middleMcp.y &&');
      this.emit('    ringTip.y < ringMcp.y && pinkyTip.y < pinkyMcp.y');
      this.emit('if (allExtended) {');
      this.indentLevel++;
      this.emit('android.util.Log.d("HoloScript", "Hand $handIndex: PALM detected")');
      if (hasToSpatial) {
        this.emit('onSpatialInput("palm", handIndex, indexTip.x, indexTip.y, indexTip.z)');
      }
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    if (hasFist) {
      this.emit('// Fist gesture: all fingertips below PIPs (closed hand)');
      this.emit('val allCurled = indexTip.y > indexPip.y && middleTip.y > middlePip.y &&');
      this.emit('    ringTip.y > ringPip.y && pinkyTip.y > pinkyPip.y');
      this.emit('if (allCurled) {');
      this.indentLevel++;
      this.emit('android.util.Log.d("HoloScript", "Hand $handIndex: FIST detected")');
      if (hasToSpatial) {
        this.emit('onSpatialInput("fist", handIndex, indexTip.x, indexTip.y, indexTip.z)');
      }
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');

    if (hasToSpatial) {
      this.emit('');
      this.emit(
        'private fun onSpatialInput(gesture: String, handIndex: Int, x: Float, y: Float, z: Float) {'
      );
      this.indentLevel++;
      this.emit('// Bridge to HoloScript spatial_input event system');
      this.emit('val event = mapOf(');
      this.indentLevel++;
      this.emit('"type" to "hand_gesture",');
      this.emit('"gesture" to gesture,');
      this.emit('"handIndex" to handIndex,');
      this.emit('"x" to x, "y" to y, "z" to z');
      this.indentLevel--;
      this.emit(')');
      this.emit('android.util.Log.d("HoloScript", "SpatialInput: $event")');
      this.indentLevel--;
      this.emit('}');
    }
  }
  // === Spatial Authoring Methods (M.010.08) ===

  private hasAuthoringTraits(composition: HoloComposition): boolean {
    const authoringNames: ReadonlyArray<string> = SPATIAL_AUTHORING_TRAITS;
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (authoringNames.includes(name)) return true;
      }
    }
    return false;
  }

  private emitAuthoringSetup(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;

    this.emit('// === Spatial Authoring Setup (M.010.08) ===');
    this.emit('');

    const hasGyro = this.compositionHasTrait(composition, 'author_gyro_place');
    const hasPinch = this.compositionHasTrait(composition, 'author_pinch_scale');
    const hasSwipe = this.compositionHasTrait(composition, 'author_swipe_browse');
    const hasVoice = this.compositionHasTrait(composition, 'author_voice_cmd');
    const hasShake = this.compositionHasTrait(composition, 'author_shake_undo');

    if (hasGyro) {
      this.emit(`private val gyroFilterAlpha = ${SPATIAL_AUTHORING_DEFAULTS.gyroFilterAlpha}f`);
      this.emit('private var sensorManager: android.hardware.SensorManager? = null');
      this.emit('private var rotationSensor: android.hardware.Sensor? = null');
    }
    if (hasPinch) {
      this.emit(`private val pinchScaleMin = ${SPATIAL_AUTHORING_DEFAULTS.pinchScaleMin}f`);
      this.emit(`private val pinchScaleMax = ${SPATIAL_AUTHORING_DEFAULTS.pinchScaleMax}f`);
      this.emit('private var scaleGestureDetector: android.view.ScaleGestureDetector? = null');
    }
    if (hasSwipe) {
      this.emit('private var gestureDetector: android.view.GestureDetector? = null');
    }
    if (hasVoice) {
      this.emit(`private val speechLocale = "${SPATIAL_AUTHORING_DEFAULTS.speechLocale}"`);
      this.emit('private var speechRecognizer: android.speech.SpeechRecognizer? = null');
    }
    if (hasShake) {
      this.emit(`private val shakeThreshold = ${SPATIAL_AUTHORING_DEFAULTS.shakeThreshold}f`);
      this.emit(`private val undoStackDepth = ${SPATIAL_AUTHORING_DEFAULTS.undoStackDepth}`);
      this.emit('private val undoStack = ArrayDeque<() -> Unit>()');
    }

    return this.lines.join('\n');
  }

  private emitAuthoringInlineSetup(composition: HoloComposition): void {
    this.emit('');
    this.emit('// --- Spatial Authoring inline setup (M.010.08) ---');

    if (this.compositionHasTrait(composition, 'author_gyro_place')) {
      this.emit('private fun setupGyroPlacement() {');
      this.indentLevel++;
      this.emit(
        'sensorManager = getSystemService(SENSOR_SERVICE) as android.hardware.SensorManager'
      );
      this.emit(
        'rotationSensor = sensorManager?.getDefaultSensor(android.hardware.Sensor.TYPE_ROTATION_VECTOR)'
      );
      this.indentLevel--;
      this.emit('}');
    }
    if (this.compositionHasTrait(composition, 'author_pinch_scale')) {
      this.emit('private fun setupPinchScale() {');
      this.indentLevel++;
      this.emit(
        'scaleGestureDetector = android.view.ScaleGestureDetector(this, object : android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {'
      );
      this.indentLevel++;
      this.emit('override fun onScale(detector: android.view.ScaleGestureDetector): Boolean {');
      this.indentLevel++;
      this.emit('val factor = detector.scaleFactor.coerceIn(pinchScaleMin, pinchScaleMax)');
      this.emit('selectedNode?.localScale = selectedNode?.localScale?.let { it.scaled(factor) }');
      this.emit('return true');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('})');
      this.indentLevel--;
      this.emit('}');
    }
    if (this.compositionHasTrait(composition, 'author_shake_undo')) {
      this.emit('private fun setupShakeUndo() {');
      this.indentLevel++;
      this.emit(
        'val accelerometer = sensorManager?.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER)'
      );
      this.emit('// Shake detection triggers undoStack.removeLastOrNull()?.invoke()');
      this.indentLevel--;
      this.emit('}');
    }
  }

  // ─── Haptic Feedback (M.010.05) ─────────────────────────────────────

  private hasHapticTraits(composition: HoloComposition): boolean {
    const names: ReadonlyArray<string> = HAPTIC_FEEDBACK_TRAITS;
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (names.includes(name)) return true;
      }
    }
    return false;
  }

  private emitHapticSetup(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;
    const pkg = this.options.packageName;
    const cls = this.options.className;

    this.emit('// Auto-generated by HoloScript AndroidCompiler — Haptic Feedback');
    this.emit(
      `// Source: composition "${this.escapeStringValue(composition.name as string, 'Kotlin')}"`
    );
    this.emit('// Requires Android API 26+ (VibrationEffect)');
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import android.content.Context');
    this.emit('import android.os.Build');
    this.emit('import android.os.VibrationEffect');
    this.emit('import android.os.Vibrator');
    this.emit('import android.os.VibratorManager');
    this.emit('import android.view.HapticFeedbackConstants');
    this.emit('');
    this.emit(`class ${cls}HapticManager(private val context: Context) {`);
    this.indentLevel++;
    this.emit('');
    this.emit('private val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= 31) {');
    this.indentLevel++;
    this.emit(
      '(context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator'
    );
    this.indentLevel--;
    this.emit('} else {');
    this.indentLevel++;
    this.emit(
      '@Suppress("DEPRECATION") context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator'
    );
    this.indentLevel--;
    this.emit('}');
    this.emit('');
    this.emit('private var intensityMultiplier: Float = 1.0f');
    this.emit('private var enabled: Boolean = true');
    this.emit('');

    if (this.compositionHasTrait(composition, 'haptic_enable')) {
      this.emit('fun setEnabled(on: Boolean) { enabled = on }');
      this.emit('');
    }
    if (this.compositionHasTrait(composition, 'haptic_intensity')) {
      this.emit('fun setIntensity(value: Float) { intensityMultiplier = value.coerceIn(0f, 1f) }');
      this.emit('');
    }

    this.emit('fun onTouch() { vibrate(VibrationEffect.EFFECT_CLICK) }');
    this.emit('fun onGrab() { vibrate(VibrationEffect.EFFECT_HEAVY_CLICK) }');
    this.emit('fun onThrow() { vibrate(VibrationEffect.EFFECT_DOUBLE_CLICK) }');
    this.emit('fun onImpact() { vibrate(VibrationEffect.EFFECT_TICK) }');
    this.emit('fun onSelect() { vibrate(VibrationEffect.EFFECT_CLICK) }');
    this.emit('');

    if (this.compositionHasTrait(composition, 'haptic_proximity')) {
      this.emit('fun onProximity(distance: Float) {');
      this.indentLevel++;
      this.emit('if (!enabled) return');
      this.emit(
        'val amplitude = ((1.0f - distance.coerceIn(0f, 1f)) * 255 * intensityMultiplier).toInt()'
      );
      this.emit('vibrator.vibrate(VibrationEffect.createOneShot(50, amplitude.coerceIn(1, 255)))');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    if (this.compositionHasTrait(composition, 'haptic_pattern_library')) {
      this.emit('fun playPattern(timings: LongArray, amplitudes: IntArray) {');
      this.indentLevel++;
      this.emit('if (!enabled) return');
      this.emit('vibrator.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1))');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    this.emit('private fun vibrate(effectId: Int) {');
    this.indentLevel++;
    this.emit('if (!enabled) return');
    this.emit('vibrator.vibrate(VibrationEffect.createPredefined(effectId))');
    this.indentLevel--;
    this.emit('}');

    this.indentLevel--;
    this.emit('}');

    return this.lines.join('\n');
  }

  // ─── Nearby Connections (M.010.16) ──────────────────────────────────

  private hasNearbyTraits(composition: HoloComposition): boolean {
    const names: ReadonlyArray<string> = NEARBY_CONNECTIONS_TRAITS;
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (names.includes(name)) return true;
      }
    }
    return false;
  }

  private emitNearbySetup(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;
    const pkg = this.options.packageName;
    const cls = this.options.className;

    this.emit('// Auto-generated by HoloScript AndroidCompiler — Nearby Connections');
    this.emit(
      `// Source: composition "${this.escapeStringValue(composition.name as string, 'Kotlin')}"`
    );
    this.emit('// Requires Google Play Services Nearby');
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import android.content.Context');
    this.emit('import android.util.Log');
    this.emit('import com.google.android.gms.nearby.Nearby');
    this.emit('import com.google.android.gms.nearby.connection.*');
    this.emit('');
    this.emit(`class ${cls}NearbyManager(private val context: Context) {`);
    this.indentLevel++;
    this.emit('');
    this.emit('private val TAG = "HoloNearby"');
    this.emit('private val SERVICE_ID = "com.holoscript.nearby"');
    this.emit('private val connectedEndpoints = mutableSetOf<String>()');
    this.emit('');
    this.emit('private val connectionCallback = object : ConnectionLifecycleCallback() {');
    this.indentLevel++;
    this.emit('override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {');
    this.indentLevel++;
    this.emit('Nearby.getConnectionsClient(context).acceptConnection(endpointId, payloadCallback)');
    this.indentLevel--;
    this.emit('}');
    this.emit(
      'override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {'
    );
    this.indentLevel++;
    this.emit('if (result.status.isSuccess) { connectedEndpoints.add(endpointId) }');
    this.indentLevel--;
    this.emit('}');
    this.emit(
      'override fun onDisconnected(endpointId: String) { connectedEndpoints.remove(endpointId) }'
    );
    this.indentLevel--;
    this.emit('}');
    this.emit('');
    this.emit('private val payloadCallback = object : PayloadCallback() {');
    this.indentLevel++;
    this.emit('override fun onPayloadReceived(endpointId: String, payload: Payload) {');
    this.indentLevel++;
    this.emit('Log.d(TAG, "Payload received from $endpointId")');
    this.indentLevel--;
    this.emit('}');
    this.emit(
      'override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {}'
    );
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    if (this.compositionHasTrait(composition, 'nearby_advertise')) {
      this.emit('fun startAdvertising() {');
      this.indentLevel++;
      this.emit(
        'val options = AdvertisingOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()'
      );
      this.emit(
        'Nearby.getConnectionsClient(context).startAdvertising("HoloDevice", SERVICE_ID, connectionCallback, options)'
      );
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    if (this.compositionHasTrait(composition, 'nearby_discover')) {
      this.emit('fun startDiscovery() {');
      this.indentLevel++;
      this.emit(
        'val options = DiscoveryOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()'
      );
      this.emit(
        'Nearby.getConnectionsClient(context).startDiscovery(SERVICE_ID, object : EndpointDiscoveryCallback() {'
      );
      this.indentLevel++;
      this.emit('override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {');
      this.indentLevel++;
      this.emit(
        'Nearby.getConnectionsClient(context).requestConnection("HoloDevice", endpointId, connectionCallback)'
      );
      this.indentLevel--;
      this.emit('}');
      this.emit(
        'override fun onEndpointLost(endpointId: String) { Log.d(TAG, "Lost $endpointId") }'
      );
      this.indentLevel--;
      this.emit('}, options)');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    if (this.compositionHasTrait(composition, 'nearby_broadcast')) {
      this.emit('fun broadcast(data: ByteArray) {');
      this.indentLevel++;
      this.emit('val payload = Payload.fromBytes(data)');
      this.emit(
        'connectedEndpoints.forEach { Nearby.getConnectionsClient(context).sendPayload(it, payload) }'
      );
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    this.emit('fun disconnect() {');
    this.indentLevel++;
    this.emit('Nearby.getConnectionsClient(context).stopAllEndpoints()');
    this.emit('connectedEndpoints.clear()');
    this.indentLevel--;
    this.emit('}');

    this.indentLevel--;
    this.emit('}');

    return this.lines.join('\n');
  }

  // ─── Foldable Display (M.010.17) ────────────────────────────────────

  private hasFoldableTraits(composition: HoloComposition): boolean {
    const names: ReadonlyArray<string> = FOLDABLE_DISPLAY_TRAITS;
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (names.includes(name)) return true;
      }
    }
    return false;
  }

  private emitFoldableSetup(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;
    const pkg = this.options.packageName;
    const cls = this.options.className;

    this.emit('// Auto-generated by HoloScript AndroidCompiler — Foldable Display');
    this.emit(
      `// Source: composition "${this.escapeStringValue(composition.name as string, 'Kotlin')}"`
    );
    this.emit('// Requires Jetpack WindowManager');
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import android.app.Activity');
    this.emit('import android.util.Log');
    this.emit('import androidx.lifecycle.ViewModel');
    this.emit('import androidx.lifecycle.viewModelScope');
    this.emit('import androidx.window.layout.FoldingFeature');
    this.emit('import androidx.window.layout.WindowInfoTracker');
    this.emit('import kotlinx.coroutines.flow.MutableStateFlow');
    this.emit('import kotlinx.coroutines.flow.StateFlow');
    this.emit('import kotlinx.coroutines.launch');
    this.emit('');
    this.emit(`class ${cls}FoldableManager : ViewModel() {`);
    this.indentLevel++;
    this.emit('');
    this.emit('private val _foldState = MutableStateFlow<FoldState>(FoldState.FLAT)');
    this.emit('val foldState: StateFlow<FoldState> = _foldState');
    this.emit('');
    this.emit('private val _hingeAngle = MutableStateFlow(180f)');
    this.emit('val hingeAngle: StateFlow<Float> = _hingeAngle');
    this.emit('');
    this.emit('enum class FoldState { FLAT, HALF_OPENED, FOLDED }');
    this.emit('');
    this.emit('fun observeWindowLayout(activity: Activity) {');
    this.indentLevel++;
    this.emit('viewModelScope.launch {');
    this.indentLevel++;
    this.emit(
      'WindowInfoTracker.getOrCreate(activity).windowLayoutInfo(activity).collect { layoutInfo ->'
    );
    this.indentLevel++;
    this.emit(
      'val foldingFeature = layoutInfo.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()'
    );
    this.emit('if (foldingFeature != null) {');
    this.indentLevel++;
    this.emit('_foldState.value = when (foldingFeature.state) {');
    this.indentLevel++;
    this.emit('FoldingFeature.State.HALF_OPENED -> FoldState.HALF_OPENED');
    this.emit('FoldingFeature.State.FLAT -> FoldState.FLAT');
    this.emit('else -> FoldState.FOLDED');
    this.indentLevel--;
    this.emit('}');

    if (this.compositionHasTrait(composition, 'foldable_hinge_angle')) {
      this.emit('// Hinge angle exposed via foldingFeature orientation');
      this.emit(
        'Log.d("HoloFoldable", "Fold state: ${foldingFeature.state}, orientation: ${foldingFeature.orientation}")'
      );
    }

    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    if (this.compositionHasTrait(composition, 'foldable_split_view')) {
      this.emit(
        'fun isSplitViewRecommended(): Boolean = _foldState.value == FoldState.HALF_OPENED'
      );
      this.emit('');
    }

    if (this.compositionHasTrait(composition, 'foldable_tabletop')) {
      this.emit('fun isTabletopMode(): Boolean = _foldState.value == FoldState.HALF_OPENED');
      this.emit('');
    }

    this.indentLevel--;
    this.emit('}');

    return this.lines.join('\n');
  }

  // ─── Samsung DeX (M.010.18) ─────────────────────────────────────────

  private hasDexTraits(composition: HoloComposition): boolean {
    const names: ReadonlyArray<string> = SAMSUNG_DEX_TRAITS;
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (names.includes(name)) return true;
      }
    }
    return false;
  }

  private emitDexSetup(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;
    const pkg = this.options.packageName;
    const cls = this.options.className;

    this.emit('// Auto-generated by HoloScript AndroidCompiler — Samsung DeX');
    this.emit(
      `// Source: composition "${this.escapeStringValue(composition.name as string, 'Kotlin')}"`
    );
    this.emit('// Samsung DeX mode detection and desktop UI transition');
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import android.app.Activity');
    this.emit('import android.content.res.Configuration');
    this.emit('import android.util.Log');
    this.emit('');
    this.emit(`class ${cls}DexManager(private val activity: Activity) {`);
    this.indentLevel++;
    this.emit('');
    this.emit('private val TAG = "HoloDex"');
    this.emit('');
    this.emit('fun isDeXMode(): Boolean {');
    this.indentLevel++;
    this.emit('val config = activity.resources.configuration');
    this.emit('return try {');
    this.indentLevel++;
    this.emit('val configClass = config.javaClass');
    this.emit(
      'val semDesktopModeEnabled = configClass.getField("SEM_DESKTOP_MODE_ENABLED").getInt(configClass)'
    );
    this.emit('val enabledField = configClass.getField("semDesktopModeEnabled").getInt(config)');
    this.emit('enabledField == semDesktopModeEnabled');
    this.indentLevel--;
    this.emit('} catch (e: Exception) { false }');
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    if (this.compositionHasTrait(composition, 'dex_handoff')) {
      this.emit('fun onDexModeChanged(isDex: Boolean) {');
      this.indentLevel++;
      this.emit('if (isDex) {');
      this.indentLevel++;
      this.emit('Log.d(TAG, "DeX connected — switching to desktop 3D editor")');
      this.emit('enableDesktopLayout()');
      this.indentLevel--;
      this.emit('} else {');
      this.indentLevel++;
      this.emit('Log.d(TAG, "DeX disconnected — switching to mobile AR")');
      this.emit('enableMobileLayout()');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    if (this.compositionHasTrait(composition, 'dex_desktop_controls')) {
      this.emit('fun enableDesktopLayout() {');
      this.indentLevel++;
      this.emit('// Enable mouse/keyboard controls, enlarge UI targets');
      this.emit('Log.d(TAG, "Desktop layout enabled with mouse/keyboard support")');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    if (this.compositionHasTrait(composition, 'dex_resolution_adapt')) {
      this.emit('fun adaptResolution() {');
      this.indentLevel++;
      this.emit('val display = activity.windowManager.defaultDisplay');
      this.emit('val metrics = android.util.DisplayMetrics()');
      this.emit('@Suppress("DEPRECATION") display.getRealMetrics(metrics)');
      this.emit('Log.d(TAG, "External display: ${metrics.widthPixels}x${metrics.heightPixels}")');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    this.emit('private fun enableMobileLayout() {');
    this.indentLevel++;
    this.emit('Log.d(TAG, "Mobile AR layout restored")');
    this.indentLevel--;
    this.emit('}');

    this.indentLevel--;
    this.emit('}');

    return this.lines.join('\n');
  }

  // ─── Google Lens (M.010.20) ─────────────────────────────────────────

  private hasLensTraits(composition: HoloComposition): boolean {
    const names: ReadonlyArray<string> = GOOGLE_LENS_TRAITS;
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (names.includes(name)) return true;
      }
    }
    return false;
  }

  private emitLensSetup(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;
    const pkg = this.options.packageName;
    const cls = this.options.className;
    const usedTraits = new Set<string>();
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if ((GOOGLE_LENS_TRAITS as ReadonlyArray<string>).includes(name)) {
          usedTraits.add(name);
        }
      }
    }

    this.emit('// Auto-generated by HoloScript AndroidCompiler — Google Lens Integration');
    this.emit(
      `// Source: composition "${this.escapeStringValue(composition.name as string, 'Kotlin')}"`
    );
    this.emit('// Requires ML Kit (vision, text, translate)');
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import android.graphics.Bitmap');
    this.emit('import android.util.Log');
    this.emit('import androidx.lifecycle.ViewModel');
    this.emit('import androidx.lifecycle.viewModelScope');
    this.emit('import kotlinx.coroutines.flow.MutableStateFlow');
    this.emit('import kotlinx.coroutines.flow.StateFlow');
    this.emit('import kotlinx.coroutines.launch');
    if (
      usedTraits.has('lens_recognize') ||
      usedTraits.has('lens_product_id') ||
      usedTraits.has('lens_plant_animal_id') ||
      usedTraits.has('lens_landmark_info')
    ) {
      this.emit('import com.google.mlkit.vision.common.InputImage');
      this.emit('import com.google.mlkit.vision.objects.ObjectDetection');
      this.emit('import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions');
      this.emit('import com.google.mlkit.vision.label.ImageLabeling');
      this.emit('import com.google.mlkit.vision.label.defaults.ImageLabelerOptions');
    }
    if (usedTraits.has('lens_text_overlay') || usedTraits.has('lens_translate')) {
      this.emit('import com.google.mlkit.vision.text.TextRecognition');
      this.emit('import com.google.mlkit.vision.text.latin.TextRecognizerOptions');
    }
    if (usedTraits.has('lens_translate')) {
      this.emit('import com.google.mlkit.nl.translate.TranslateLanguage');
      this.emit('import com.google.mlkit.nl.translate.Translation');
      this.emit('import com.google.mlkit.nl.translate.TranslatorOptions');
    }
    this.emit('');

    this.emit(
      'data class LensDetection(val label: String, val confidence: Float, val text: String? = null)'
    );
    this.emit('');
    this.emit(`class ${cls}LensManager : ViewModel() {`);
    this.indentLevel++;
    this.emit('');
    this.emit('private val TAG = "HoloLens"');
    this.emit('private val _detections = MutableStateFlow<List<LensDetection>>(emptyList())');
    this.emit('val detections: StateFlow<List<LensDetection>> = _detections');
    this.emit('');

    if (usedTraits.has('lens_recognize')) {
      this.emit('private val objectDetector by lazy {');
      this.indentLevel++;
      this.emit('ObjectDetection.getClient(ObjectDetectorOptions.Builder()');
      this.emit('    .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)');
      this.emit('    .enableMultipleObjects().enableClassification().build())');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
      this.emit('fun recognizeObjects(image: InputImage) {');
      this.indentLevel++;
      this.emit('objectDetector.process(image).addOnSuccessListener { objects ->');
      this.indentLevel++;
      this.emit(
        '_detections.value = objects.flatMap { it.labels }.map { LensDetection(it.text, it.confidence) }'
      );
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    if (usedTraits.has('lens_text_overlay')) {
      this.emit(
        'private val textRecognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.Builder().build()) }'
      );
      this.emit('');
      this.emit('fun recognizeText(image: InputImage) {');
      this.indentLevel++;
      this.emit('textRecognizer.process(image).addOnSuccessListener { visionText ->');
      this.indentLevel++;
      this.emit('Log.d(TAG, "Recognized: ${visionText.text}")');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    if (usedTraits.has('lens_translate')) {
      this.emit(
        'fun translateText(text: String, targetLang: String = "es", callback: (String) -> Unit) {'
      );
      this.indentLevel++;
      this.emit('val options = TranslatorOptions.Builder()');
      this.emit('    .setSourceLanguage(TranslateLanguage.ENGLISH)');
      this.emit('    .setTargetLanguage(targetLang).build()');
      this.emit('val translator = Translation.getClient(options)');
      this.emit('translator.downloadModelIfNeeded().addOnSuccessListener {');
      this.indentLevel++;
      this.emit('translator.translate(text).addOnSuccessListener { callback(it) }');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    this.indentLevel--;
    this.emit('}');

    return this.lines.join('\n');
  }

  // =====================================================================
  // WebXR Browser AR (M.010.19)
  // Emits JavaScript/HTML — runs in Chrome on Android, no app install.
  // =====================================================================

  private hasWebXRTraits(composition: HoloComposition): boolean {
    const names: ReadonlyArray<string> = WEBXR_TRAITS;
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (names.includes(name)) return true;
      }
    }
    return false;
  }

  private collectWebXRTraits(composition: HoloComposition): Set<string> {
    const usedTraits = new Set<string>();
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if ((WEBXR_TRAITS as ReadonlyArray<string>).includes(name)) {
          usedTraits.add(name);
        }
      }
    }
    return usedTraits;
  }

  private emitWebXRSetup(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;
    const usedTraits = this.collectWebXRTraits(composition);
    const compositionName = this.escapeStringValue(composition.name as string, 'TypeScript');

    // Determine session type
    const sessionType = usedTraits.has('webxr_session')
      ? 'immersive-ar'
      : usedTraits.has('webxr_inline')
        ? 'inline'
        : 'immersive-ar';

    // Determine reference space
    const refSpace = usedTraits.has('webxr_reference_space') ? 'local-floor' : 'local';

    // Build requiredFeatures array
    const requiredFeatures: string[] = [];
    if (usedTraits.has('webxr_hit_test')) requiredFeatures.push('hit-test');
    if (usedTraits.has('webxr_anchors')) requiredFeatures.push('anchors');
    if (usedTraits.has('webxr_light_estimation')) requiredFeatures.push('light-estimation');
    if (usedTraits.has('webxr_dom_overlay')) requiredFeatures.push('dom-overlay');
    if (usedTraits.has('webxr_depth_sensing')) requiredFeatures.push('depth-sensing');
    if (usedTraits.has('webxr_hand_tracking')) requiredFeatures.push('hand-tracking');
    if (usedTraits.has('webxr_layers')) requiredFeatures.push('layers');

    // --- HTML document ---
    this.emit('<!DOCTYPE html>');
    this.emit(`<html lang="en">`);
    this.emit('<head>');
    this.indentLevel++;
    this.emit('<meta charset="utf-8">');
    this.emit('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    this.emit(`<title>${compositionName} — WebXR</title>`);
    this.emit('<style>');
    this.indentLevel++;
    this.emit('body { margin: 0; overflow: hidden; }');
    this.emit('canvas { display: block; }');
    if (usedTraits.has('webxr_dom_overlay')) {
      this.emit(
        '#overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }'
      );
      this.emit(
        '#overlay .ui-panel { pointer-events: auto; background: rgba(0,0,0,0.6); color: #fff; padding: 12px; border-radius: 8px; margin: 16px; font-family: sans-serif; }'
      );
    }
    this.emit(
      '#no-xr { display: none; padding: 20px; text-align: center; font-family: sans-serif; }'
    );
    this.indentLevel--;
    this.emit('</style>');
    this.emit('<script type="importmap">');
    this.emit(
      '{ "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js", "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/" } }'
    );
    this.emit('</script>');
    this.indentLevel--;
    this.emit('</head>');
    this.emit('<body>');
    this.indentLevel++;
    if (usedTraits.has('webxr_dom_overlay')) {
      this.emit('<div id="overlay">');
      this.indentLevel++;
      this.emit(`<div class="ui-panel">${compositionName}</div>`);
      this.indentLevel--;
      this.emit('</div>');
    }
    this.emit('<div id="no-xr">WebXR not supported on this browser/device.</div>');
    this.emit('<script type="module">');
    this.indentLevel++;

    // --- JS imports ---
    this.emit("import * as THREE from 'three';");
    this.emit('');

    // --- Capability check ---
    this.emit('if (!navigator.xr) {');
    this.indentLevel++;
    this.emit("document.getElementById('no-xr').style.display = 'block';");
    this.emit("throw new Error('WebXR not supported');");
    this.indentLevel--;
    this.emit('}');
    this.emit('');

    // --- Renderer setup ---
    this.emit('const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });');
    this.emit('renderer.setPixelRatio(window.devicePixelRatio);');
    this.emit('renderer.setSize(window.innerWidth, window.innerHeight);');
    this.emit('renderer.xr.enabled = true;');
    this.emit('document.body.appendChild(renderer.domElement);');
    this.emit('');

    // --- Scene & camera ---
    this.emit('const scene = new THREE.Scene();');
    this.emit(
      'const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);'
    );
    this.emit('');

    // --- Ambient light ---
    this.emit('scene.add(new THREE.AmbientLight(0xffffff, 0.6));');

    // --- Light estimation ---
    if (usedTraits.has('webxr_light_estimation')) {
      this.emit('');
      this.emit('// WebXR Light Estimation');
      this.emit('const estimatedLight = new THREE.DirectionalLight(0xffffff, 1.0);');
      this.emit('estimatedLight.position.set(0.5, 1, 0.5);');
      this.emit('scene.add(estimatedLight);');
      this.emit('let xrLightProbe = null;');
    }
    this.emit('');

    // --- Scene objects from composition ---
    this.emit('// Scene objects from HoloScript composition');
    for (const obj of composition.objects || []) {
      const objName = obj.name || 'Object';
      const shape = this.findObjProp(obj, 'shape');
      const color = this.findObjProp(obj, 'color');
      const position = this.findObjProp(obj, 'position');

      let geometryClass = 'BoxGeometry(0.1, 0.1, 0.1)';
      if (shape === 'sphere') geometryClass = 'SphereGeometry(0.05, 32, 32)';
      else if (shape === 'cylinder') geometryClass = 'CylinderGeometry(0.05, 0.05, 0.1, 32)';
      else if (shape === 'plane') geometryClass = 'PlaneGeometry(0.2, 0.2)';

      const colorHex = typeof color === 'string' ? color : '#4488ff';
      const pos = Array.isArray(position) && position.length >= 3 ? position : [0, 0, -1];

      this.emit('{');
      this.indentLevel++;
      this.emit(`const geometry = new THREE.${geometryClass};`);
      this.emit(`const material = new THREE.MeshStandardMaterial({ color: '${colorHex}' });`);
      this.emit('const mesh = new THREE.Mesh(geometry, material);');
      this.emit(`mesh.name = '${this.escapeStringValue(objName, 'TypeScript')}';`);
      this.emit(`mesh.position.set(${pos[0]}, ${pos[1]}, ${pos[2]});`);
      this.emit('scene.add(mesh);');
      this.indentLevel--;
      this.emit('}');
    }
    this.emit('');

    // --- Hit test reticle ---
    if (usedTraits.has('webxr_hit_test')) {
      this.emit('// Hit test reticle');
      this.emit('const reticle = new THREE.Mesh(');
      this.emit('  new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2),');
      this.emit('  new THREE.MeshBasicMaterial({ color: 0x00ff00 })');
      this.emit(');');
      this.emit('reticle.matrixAutoUpdate = false;');
      this.emit('reticle.visible = false;');
      this.emit('scene.add(reticle);');
      this.emit('let hitTestSource = null;');
      this.emit('');
    }

    // --- Framebuffer ---
    if (usedTraits.has('webxr_framebuffer')) {
      this.emit('let xrFramebuffer = null;');
      this.emit('');
    }

    // --- Anchors storage ---
    if (usedTraits.has('webxr_anchors')) {
      this.emit('const anchors = new Map();');
      this.emit('');
      this.emit('async function createAnchor(frame, refSpace, position) {');
      this.indentLevel++;
      this.emit('const anchorPose = new XRRigidTransform(position);');
      this.emit('const anchor = await frame.createAnchor(anchorPose, refSpace);');
      this.emit('anchors.set(anchor, position);');
      this.emit('return anchor;');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // --- Hand tracking ---
    if (usedTraits.has('webxr_hand_tracking')) {
      this.emit('function updateHands(frame, refSpace) {');
      this.indentLevel++;
      this.emit('for (const source of frame.session.inputSources) {');
      this.indentLevel++;
      this.emit('if (!source.hand) continue;');
      this.emit('for (const [name, jointSpace] of source.hand) {');
      this.indentLevel++;
      this.emit('const jointPose = frame.getJointPose(jointSpace, refSpace);');
      this.emit('if (jointPose) { /* joint position: jointPose.transform.position */ }');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // --- Session options ---
    this.emit('// Session configuration');
    this.emit('const sessionOptions = {');
    this.indentLevel++;
    if (requiredFeatures.length > 0) {
      const featStr = requiredFeatures.map((f) => `'${f}'`).join(', ');
      this.emit(`requiredFeatures: [${featStr}],`);
    }
    if (usedTraits.has('webxr_dom_overlay')) {
      this.emit("domOverlay: { root: document.getElementById('overlay') },");
    }
    if (usedTraits.has('webxr_depth_sensing')) {
      this.emit(
        'depthSensing: { usagePreference: ["cpu-optimized"], dataFormatPreference: ["luminance-alpha"] },'
      );
    }
    this.indentLevel--;
    this.emit('};');
    this.emit('');

    // --- Request session ---
    this.emit(
      `navigator.xr.requestSession('${sessionType}', sessionOptions).then(async (session) => {`
    );
    this.indentLevel++;
    this.emit(`const refSpace = await session.requestReferenceSpace('${refSpace}');`);
    this.emit('renderer.xr.setReferenceSpace(refSpace);');
    this.emit('renderer.xr.setSession(session);');
    this.emit('');

    // Hit test source init
    if (usedTraits.has('webxr_hit_test')) {
      this.emit('// Initialize hit test source');
      this.emit("const viewerSpace = await session.requestReferenceSpace('viewer');");
      this.emit('hitTestSource = await session.requestHitTestSource({ space: viewerSpace });');
      this.emit('');
    }

    // Light probe init
    if (usedTraits.has('webxr_light_estimation')) {
      this.emit('// Initialize light probe');
      this.emit('xrLightProbe = await session.requestLightProbe();');
      this.emit('');
    }

    // Layers init
    if (usedTraits.has('webxr_layers')) {
      this.emit('// XR Layers');
      this.emit('const xrProjectionLayer = renderer.xr.getBaseLayer();');
      this.emit('');
    }

    // --- Render loop ---
    this.emit('renderer.setAnimationLoop((timestamp, frame) => {');
    this.indentLevel++;
    this.emit('if (!frame) return;');
    this.emit('');

    // Hit test per frame
    if (usedTraits.has('webxr_hit_test')) {
      this.emit('if (hitTestSource) {');
      this.indentLevel++;
      this.emit('const hitTestResults = frame.getHitTestResults(hitTestSource);');
      this.emit('if (hitTestResults.length > 0) {');
      this.indentLevel++;
      this.emit('const hit = hitTestResults[0];');
      this.emit('reticle.visible = true;');
      this.emit('reticle.matrix.fromArray(hit.getPose(refSpace).transform.matrix);');
      this.indentLevel--;
      this.emit('} else { reticle.visible = false; }');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // Light estimation per frame
    if (usedTraits.has('webxr_light_estimation')) {
      this.emit('if (xrLightProbe) {');
      this.indentLevel++;
      this.emit('const estimate = frame.getLightEstimate(xrLightProbe);');
      this.emit('if (estimate) {');
      this.indentLevel++;
      this.emit('const dir = estimate.primaryLightDirection;');
      this.emit('estimatedLight.position.set(dir.x, dir.y, dir.z);');
      this.emit('estimatedLight.intensity = estimate.primaryLightIntensity?.y || 1.0;');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // Depth sensing per frame
    if (usedTraits.has('webxr_depth_sensing')) {
      this.emit('// Depth sensing');
      this.emit('const viewerPose = frame.getViewerPose(refSpace);');
      this.emit('if (viewerPose) {');
      this.indentLevel++;
      this.emit('for (const view of viewerPose.views) {');
      this.indentLevel++;
      this.emit('const depthInfo = frame.getDepthInformation(view);');
      this.emit('if (depthInfo) { /* depthInfo.data contains depth buffer */ }');
      this.indentLevel--;
      this.emit('}');
      this.indentLevel--;
      this.emit('}');
      this.emit('');
    }

    // Hand tracking per frame
    if (usedTraits.has('webxr_hand_tracking')) {
      this.emit('updateHands(frame, refSpace);');
      this.emit('');
    }

    // Framebuffer access
    if (usedTraits.has('webxr_framebuffer')) {
      this.emit('xrFramebuffer = renderer.xr.getBaseLayer()?.framebuffer || null;');
      this.emit('');
    }

    this.emit('renderer.render(scene, camera);');
    this.indentLevel--;
    this.emit('});');
    this.emit('');

    // Session end cleanup
    this.emit("session.addEventListener('end', () => {");
    this.indentLevel++;
    this.emit('renderer.setAnimationLoop(null);');
    if (usedTraits.has('webxr_hit_test')) {
      this.emit('hitTestSource = null;');
    }
    this.indentLevel--;
    this.emit('});');

    this.indentLevel--;
    this.emit(
      "}).catch(err => { console.error('WebXR session failed:', err); document.getElementById('no-xr').style.display = 'block'; });"
    );

    this.indentLevel--;
    this.emit('</script>');
    this.indentLevel--;
    this.emit('</body>');
    this.emit('</html>');

    return this.lines.join('\n');
  }
}

export function compileToAndroid(
  composition: HoloComposition,
  options?: AndroidCompilerOptions
): Promise<AndroidCompileResult> {
  const compiler = new AndroidCompiler(options);
  return Promise.resolve(compiler.compile(composition, 'test-token', undefined));
}
