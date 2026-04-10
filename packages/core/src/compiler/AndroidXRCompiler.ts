/**
 * HoloScript -> Android XR Compiler
 *
 * Translates a HoloComposition AST into Kotlin code targeting Android XR
 * (Jetpack XR / ARCore extensions).
 *
 * Updated for Android XR SDK Developer Preview 3:
 *   - SceneCoreEntity composable for placing entities in Subspace layouts
 *   - URI-based GltfModel loading (GltfModel.create with Uri/Path)
 *   - Face tracking with 68 blendshapes (FaceTrackingMode.BLEND_SHAPES)
 *   - UserSubspace follow-behavior for head-following UI
 *   - SurfaceEntity with DRM (SurfaceProtection.PROTECTED + Widevine)
 *
 * AI Glasses Mode (formFactor: 'glasses'):
 *   - Jetpack Compose Glimmer UI toolkit (GlimmerTheme, Card, Button, Text)
 *   - Jetpack Projected API (ProjectedContext, ProjectedDeviceController)
 *   - Lightweight AR overlay output vs immersive XR
 *   - xr_projected display category in manifest
 *   - Glasses-specific Gradle dependencies (glimmer, projected)
 *   - Touchpad + voice input modality
 *   - Optimized for optical see-through displays
 *
 * Emits:
 *   - Activity class with Jetpack Compose for XR (headset) or Glimmer (glasses)
 *   - ARCore Session setup
 *   - SceneCore entity hierarchy via SceneCoreEntity composable
 *   - Spatial panel and orb placement
 *   - GltfModelEntity with URI-based model loading
 *   - Passthrough and plane detection
 *   - Hand tracking and face tracking integration
 *   - Spatial audio with Oboe
 *   - SurfaceEntity with DRM-protected video playback
 *
 * @version 3.0.0 — Android XR SDK Developer Preview 3 + AI Glasses
 */

import { CompilerBase, type CompilerToken } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from './identity/ANSNamespace';
import type { Extensible } from '../types/utility-types';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloLight,
  HoloEnvironment,
  HoloCamera,
  HoloTimeline,
  HoloAudio,
  HoloZone,
  HoloUI,
  HoloTransition,
  HoloValue,
  HoloEffects,
} from '../parser/HoloCompositionTypes';
import {
  compileDomainBlocks,
  compileMaterialBlock,
  compilePhysicsBlock,
  compileParticleBlock,
  compilePostProcessingBlock,
  compileAudioSourceBlock,
  compileWeatherBlock,
  materialToAndroidXR,
  physicsToAndroidXR,
  particlesToAndroidXR,
  audioSourceToAndroidXR,
  weatherToAndroidXR,
} from './DomainBlockCompilerMixin';
import type { CompiledPostProcessing } from './DomainBlockCompilerMixin';

/**
 * Android XR form factor mode.
 *
 * - `headset`: Full immersive XR output targeting headsets (Samsung Project Moohan, etc.).
 *   Uses Jetpack Compose for XR with SceneCore, Subspace, SpatialPanel, and full 3D scene graph.
 *
 * - `glasses`: Lightweight AR overlay output targeting AI glasses (Samsung Project Haean, etc.).
 *   Uses Jetpack Compose Glimmer for UI, Jetpack Projected for hardware access, and generates
 *   a simplified composable tree optimized for optical see-through displays with touchpad/voice input.
 */
export type AndroidXRFormFactor = 'headset' | 'glasses';

export interface AndroidXRCompilerOptions {
  packageName?: string;
  activityName?: string;
  useFilament?: boolean;
  useARCore?: boolean;
  indent?: string;
  minSdk?: number;
  targetSdk?: number;
  /**
   * Target form factor for code generation.
   *
   * - `'headset'` (default): Immersive XR with SceneCore + Compose for XR.
   * - `'glasses'`: Lightweight AR overlay with Glimmer + Projected API.
   */
  formFactor?: AndroidXRFormFactor;
}

import type { AndroidXRCompileResult } from './CompilerTypes';
export type { AndroidXRCompileResult } from './CompilerTypes';

export class AndroidXRCompiler extends CompilerBase {
  protected readonly compilerName = 'AndroidXRCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.ANDROID_XR;
  }

  private options: Required<AndroidXRCompilerOptions>;
  private lines: string[] = [];
  private indentLevel: number = 0;

  constructor(options: AndroidXRCompilerOptions = {}) {
    super();
    this.options = {
      packageName: options.packageName || 'com.holoscript.generated',
      activityName: options.activityName || 'GeneratedXRActivity',
      useFilament: options.useFilament ?? true,
      useARCore: options.useARCore ?? true,
      indent: options.indent || '    ',
      minSdk: options.minSdk || 30,
      targetSdk: options.targetSdk || 35,
      formFactor: options.formFactor || 'headset',
    };
  }

  /** Returns true when targeting AI glasses form factor. */
  get isGlassesMode(): boolean {
    return this.options.formFactor === 'glasses';
  }

  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): AndroidXRCompileResult {
    this.validateCompilerAccess(agentToken, outputPath);

    if (this.isGlassesMode) {
      return {
        activityFile: this.generateGlassesActivityFile(composition),
        stateFile: this.generateStateFile(composition),
        nodeFactoryFile: this.generateNodeFactoryFile(composition),
        manifestFile: this.generateGlassesManifestFile(composition),
        buildGradle: this.generateGlassesBuildGradle(composition),
        glimmerComponentsFile: this.generateGlimmerComponentsFile(composition),
      };
    }

    return {
      activityFile: this.generateActivityFile(composition),
      stateFile: this.generateStateFile(composition),
      nodeFactoryFile: this.generateNodeFactoryFile(composition),
      manifestFile: this.generateManifestFile(composition),
      buildGradle: this.generateBuildGradle(composition),
    };
  }

  private generateActivityFile(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;

    this.emit('// Auto-generated by HoloScript AndroidXRCompiler');
    this.emit(
      `// Source: composition "${this.escapeStringValue(composition.name as string, 'Kotlin')}"`
    );
    this.emit('// Do not edit manually -- regenerate from .holo source');
    this.emit('');
    this.emit(`package ${this.options.packageName}`);
    this.emit('');
    this.emitImports(composition);
    this.emit('');
    this.emitActivityClass(composition);

    // v4.2: Domain Blocks (materials, physics, particles, post-processing, audio, weather)
    this.compileAndroidXRDomainBlocks(composition);

    return this.lines.join('\n');
  }

  // ─── State File ─────────────────────────────────────────────────────

  private generateStateFile(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;

    const pkg = this.options.packageName;

    this.emit('// Auto-generated by HoloScript AndroidXRCompiler');
    this.emit(`// State: ${this.escapeStringValue(composition.name as string, 'Kotlin')}`);
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import androidx.compose.runtime.mutableStateOf');
    this.emit('import androidx.compose.runtime.getValue');
    this.emit('import androidx.compose.runtime.setValue');
    this.emit('import androidx.lifecycle.ViewModel');
    this.emit('import androidx.lifecycle.MutableLiveData');
    this.emit('import androidx.lifecycle.LiveData');
    this.emit('import androidx.xr.runtime.math.Vector3');
    this.emit('');

    this.emit('class XRSceneState : ViewModel() {');
    this.indent();

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

    // XR-specific state
    this.emit('// === XR State ===');
    this.emit('private val _spatialCapabilities = MutableLiveData<Set<String>>(emptySet())');
    this.emit('val spatialCapabilities: LiveData<Set<String>> get() = _spatialCapabilities');
    this.emit('');

    this.emit(
      'private val _activeEntities = MutableLiveData<MutableMap<String, Any>>(mutableMapOf())'
    );
    this.emit('val activeEntities: LiveData<MutableMap<String, Any>> get() = _activeEntities');
    this.emit('');

    this.emit('private val _selectedEntity = MutableLiveData<String?>()');
    this.emit('val selectedEntity: LiveData<String?> get() = _selectedEntity');
    this.emit('');

    // Entity interaction callback
    this.emit('fun onEntitySelected(entityId: String) {');
    this.indent();
    this.emit('_selectedEntity.value = entityId');
    this.emit('android.util.Log.d("HoloScript", "Entity selected: $entityId")');
    this.dedent();
    this.emit('}');
    this.emit('');

    // Spatial capability update
    this.emit('fun updateSpatialCapabilities(capabilities: Set<String>) {');
    this.indent();
    this.emit('_spatialCapabilities.value = capabilities');
    this.dedent();
    this.emit('}');
    this.emit('');

    // Reset
    this.emit('fun reset() {');
    this.indent();
    this.emit('_spatialCapabilities.value = emptySet()');
    this.emit('_activeEntities.value = mutableMapOf()');
    this.emit('_selectedEntity.value = null');
    if (composition.state) {
      for (const prop of composition.state.properties) {
        const kotlinValue = this.toKotlinValue(prop.value);
        this.emit(
          `_${this.escapeStringValue(prop.key as string, 'Kotlin')}.value = ${kotlinValue}`
        );
      }
    }
    this.emit('android.util.Log.d("HoloScript", "XR State reset")');
    this.dedent();
    this.emit('}');

    // Actions
    if (composition.logic?.actions) {
      this.emit('');
      this.emit('// === Actions ===');
      for (const action of composition.logic.actions) {
        this.compileAction(action);
      }
    }

    this.dedent();
    this.emit('}');

    return this.lines.join('\n');
  }

  private compileAction(action: { name: string }): void {
    const rawName = this.sanitizeName(action.name);
    const name = rawName.charAt(0).toLowerCase() + rawName.slice(1);
    this.emit(`fun ${name}() {`);
    this.indent();
    this.emit(
      `android.util.Log.d("HoloScript", "Action: ${this.escapeStringValue(action.name, 'Kotlin')}")`
    );
    this.emit('// Action implementation');
    this.dedent();
    this.emit('}');
    this.emit('');
  }

  // ─── Node Factory File ──────────────────────────────────────────────

  private generateNodeFactoryFile(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;

    const pkg = this.options.packageName;

    this.emit('// Auto-generated by HoloScript AndroidXRCompiler');
    this.emit(`// Node Factory: ${this.escapeStringValue(composition.name as string, 'Kotlin')}`);
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import android.net.Uri');
    this.emit('import androidx.xr.scenecore.Session as XRSession');
    this.emit('import androidx.xr.scenecore.Entity');
    this.emit('import androidx.xr.scenecore.GltfModel');
    this.emit('import androidx.xr.scenecore.GltfModelEntity');
    this.emit('import androidx.xr.runtime.math.Pose');
    this.emit('import androidx.xr.runtime.math.Vector3');
    this.emit('import androidx.xr.runtime.math.Quaternion');
    this.emit('');

    this.emit('object XRNodeFactory {');
    this.indent();

    // Default entity creation
    this.emit('/**');
    this.emit(' * Create a default entity in the XR scene.');
    this.emit(' */');
    this.emit('fun createDefaultEntity(session: XRSession): Entity {');
    this.indent();
    if (composition.objects?.length) {
      const firstObj = composition.objects[0];
      const modelSrc = this.findProp(firstObj, 'model') ?? this.findProp(firstObj, 'src');
      if (modelSrc) {
        this.emit(`val gltfModel = GltfModel.create(session, Uri.parse("${modelSrc}"))`);
        this.emit('return GltfModelEntity.create(session, gltfModel).apply {');
        this.indent();
        this.emit('parent = session.scene.activitySpace');
        const pos = this.findProp(firstObj, 'position');
        if (pos && Array.isArray(pos)) {
          this.emit(
            `setPose(Pose(${this.toKotlinFloat3(pos as number[])}, Quaternion.identity()))`
          );
        }
        this.dedent();
        this.emit('}');
      } else {
        this.emit(
          `val entity = session.scene.createEntity("${this.escapeStringValue(firstObj.name as string, 'Kotlin')}")`
        );
        this.emit('entity.parent = session.scene.activitySpace');
        const pos = this.findProp(firstObj, 'position');
        if (pos && Array.isArray(pos)) {
          this.emit(
            `entity.setPose(Pose(${this.toKotlinFloat3(pos as number[])}, Quaternion.identity()))`
          );
        }
        this.emit('return entity');
      }
    } else {
      this.emit('val entity = session.scene.createEntity("default")');
      this.emit('entity.parent = session.scene.activitySpace');
      this.emit('return entity');
    }
    this.dedent();
    this.emit('}');
    this.emit('');

    // GltfModel loader
    this.emit('/**');
    this.emit(' * Load a glTF model and create a GltfModelEntity.');
    this.emit(' */');
    this.emit('fun loadGltfModel(');
    this.indent();
    this.emit('session: XRSession,');
    this.emit('modelUri: String,');
    this.emit('position: Vector3 = Vector3(0f, 0f, 0f),');
    this.emit('scale: Float = 1f');
    this.dedent();
    this.emit('): GltfModelEntity {');
    this.indent();
    this.emit('val gltfModel = GltfModel.create(session, Uri.parse(modelUri))');
    this.emit('return GltfModelEntity.create(session, gltfModel).apply {');
    this.indent();
    this.emit('parent = session.scene.activitySpace');
    this.emit('setPose(Pose(position, Quaternion.identity()))');
    this.emit('setScale(com.google.android.filament.utils.Float3(scale, scale, scale))');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.emit('');

    // Named entity factory methods for each object
    for (const obj of composition.objects || []) {
      this.compileObjectFactory(obj);
    }

    this.dedent();
    this.emit('}');

    return this.lines.join('\n');
  }

  private compileObjectFactory(obj: HoloObjectDecl): void {
    const methodName = `create${this.sanitizeName(obj.name).charAt(0).toUpperCase() + this.sanitizeName(obj.name).slice(1)}`;
    const modelSrc = this.findProp(obj, 'model') ?? this.findProp(obj, 'src');

    this.emit(`fun ${methodName}(session: XRSession): Entity {`);
    this.indent();

    if (modelSrc) {
      this.emit(`val gltfModel = GltfModel.create(session, Uri.parse("${modelSrc}"))`);
      this.emit('return GltfModelEntity.create(session, gltfModel).apply {');
      this.indent();
      this.emit('parent = session.scene.activitySpace');
      const pos = this.findProp(obj, 'position');
      if (pos && Array.isArray(pos)) {
        this.emit(`setPose(Pose(${this.toKotlinFloat3(pos as number[])}, Quaternion.identity()))`);
      }
      const scale = this.findProp(obj, 'scale');
      if (scale && Array.isArray(scale)) {
        this.emit(`setScale(${this.toKotlinFloat3(scale as number[])})`);
      } else if (typeof scale === 'number') {
        this.emit(
          `setScale(com.google.android.filament.utils.Float3(${scale}f, ${scale}f, ${scale}f))`
        );
      }
      this.dedent();
      this.emit('}');
    } else {
      this.emit(
        `val entity = session.scene.createEntity("${this.escapeStringValue(obj.name as string, 'Kotlin')}")`
      );
      this.emit('entity.parent = session.scene.activitySpace');
      const pos = this.findProp(obj, 'position');
      if (pos && Array.isArray(pos)) {
        this.emit(
          `entity.setPose(Pose(${this.toKotlinFloat3(pos as number[])}, Quaternion.identity()))`
        );
      }
      const scale = this.findProp(obj, 'scale');
      if (scale && Array.isArray(scale)) {
        this.emit(`entity.setScale(${this.toKotlinFloat3(scale as number[])})`);
      } else if (typeof scale === 'number') {
        this.emit(
          `entity.setScale(com.google.android.filament.utils.Float3(${scale}f, ${scale}f, ${scale}f))`
        );
      }
      this.emit('return entity');
    }

    this.dedent();
    this.emit('}');
    this.emit('');
  }

  // ─── Manifest File ──────────────────────────────────────────────────

  private generateManifestFile(composition: HoloComposition): string {
    const pkg = this.options.packageName;
    const activityName = this.options.activityName;

    // Detect XR-specific permissions based on composition traits
    const hasHandTracking = composition.objects?.some((o) =>
      o.traits?.some((t) => t.name === 'hand_tracking')
    );
    const hasFaceTracking = composition.objects?.some((o) =>
      o.traits?.some((t) => t.name === 'face_tracking')
    );
    const hasHeadFollow = composition.objects?.some((o) =>
      o.traits?.some((t) => t.name === 'follows_head' || t.name === 'head_follow')
    );
    const hasEyeTracking = composition.objects?.some((o) =>
      o.traits?.some((t) => t.name === 'eye_tracking' || t.name === 'eye_tracked')
    );
    const hasPlaneDetection = composition.objects?.some((o) =>
      o.traits?.some((t) => t.name === 'plane_detection' || t.name === 'anchor')
    );

    const xrPermissions: string[] = [];
    xrPermissions.push('    <uses-permission android:name="android.permission.CAMERA" />');
    if (hasHandTracking) {
      xrPermissions.push('    <uses-permission android:name="android.permission.HAND_TRACKING" />');
    }
    if (hasFaceTracking) {
      xrPermissions.push('    <uses-permission android:name="android.permission.FACE_TRACKING" />');
    }
    if (hasHeadFollow) {
      xrPermissions.push('    <uses-permission android:name="android.permission.HEAD_TRACKING" />');
    }
    if (hasEyeTracking) {
      xrPermissions.push('    <uses-permission android:name="android.permission.EYE_TRACKING" />');
    }
    if (hasPlaneDetection) {
      xrPermissions.push(
        '    <uses-permission android:name="android.permission.SCENE_UNDERSTANDING_COARSE" />'
      );
    }

    return `<?xml version="1.0" encoding="utf-8"?>
<!-- Auto-generated by HoloScript AndroidXRCompiler -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${pkg}">

    <!-- XR Permissions -->
${xrPermissions.join('\n')}

    <!-- XR Required Features -->
    <uses-feature android:name="android.hardware.xr.headtracking" android:required="true" />
    <uses-feature android:glEsVersion="0x00030002" android:required="true" />

    <application
        android:allowBackup="true"
        android:label="${this.escapeStringValue(composition.name as string, 'XML')}"
        android:supportsRtl="true"
        android:theme="@style/Theme.MaterialComponents.DayNight.NoActionBar">

        <!-- Android XR metadata -->
        <meta-data android:name="com.google.ar.core" android:value="required" />

        <activity
            android:name=".${activityName}"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden|screenLayout|uiMode"
            android:screenOrientation="landscape"
            android:enableOnBackInvokedCallback="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
                <category android:name="com.google.intent.category.XR" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;
  }

  // ─── Build Gradle File ──────────────────────────────────────────────

  private generateBuildGradle(composition: HoloComposition): string {
    const hasDrmVideo = composition.objects?.some((o) =>
      o.traits?.some((t) => t.name === 'drm_video' || t.name === 'protected_video')
    );

    return `// Auto-generated by HoloScript AndroidXRCompiler
// Source: ${this.escapeStringValue(composition.name as string, 'Kotlin')}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "${this.options.packageName}"
    compileSdk = ${this.options.targetSdk}

    defaultConfig {
        applicationId = "${this.options.packageName}"
        minSdk = ${this.options.minSdk}
        targetSdk = ${this.options.targetSdk}
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    // Core
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.0")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.8.0")
    implementation("androidx.activity:activity-compose:1.9.0")

    // Jetpack Compose
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.runtime:runtime")

    // Android XR - Jetpack XR SceneCore
    implementation("androidx.xr.scenecore:scenecore:1.0.0-alpha01")
    implementation("androidx.xr.compose:compose:1.0.0-alpha01")

    // Android XR - ARCore for Jetpack XR
    implementation("androidx.xr.arcore:arcore:1.0.0-alpha01")

    // Android XR - Runtime
    implementation("androidx.xr:xr:1.0.0-alpha01")

    // Filament (PBR Rendering)
    implementation("com.google.android.filament:filament-android:1.51.0")
    implementation("com.google.android.filament:filament-utils-android:1.51.0")
    implementation("com.google.android.filament:gltfio-android:1.51.0")
${
  hasDrmVideo
    ? `
    // Media3 ExoPlayer (DRM Video Playback)
    implementation("androidx.media3:media3-exoplayer:1.3.1")
    implementation("androidx.media3:media3-common:1.3.1")
    implementation("androidx.media3:media3-exoplayer-dash:1.3.1")
`
    : ''
}
    // ARCore
    implementation("com.google.ar:core:1.43.0")
}`;
  }

  // ─── Imports ─────────────────────────────────────────────────────────

  private emitImports(composition: HoloComposition): void {
    this.emit('import android.os.Bundle');
    this.emit('import android.net.Uri');
    this.emit('import android.animation.ObjectAnimator');
    this.emit('import android.animation.AnimatorSet');
    this.emit('');
    this.emit('import androidx.activity.ComponentActivity');
    this.emit('import androidx.activity.compose.setContent');
    this.emit('import androidx.compose.runtime.*');
    this.emit('import androidx.compose.foundation.layout.*');
    this.emit('import androidx.compose.material3.*');
    this.emit('import androidx.compose.ui.Modifier');
    this.emit('import androidx.compose.ui.graphics.Color');
    this.emit('');
    // DP3: Compose for XR spatial composables
    this.emit('import androidx.xr.compose.spatial.*');
    this.emit('import androidx.xr.compose.subspace.layout.*');
    this.emit('');
    // DP3: SceneCore entity types
    this.emit('import androidx.xr.scenecore.Entity');
    this.emit('import androidx.xr.scenecore.Session as XRSession');
    this.emit('import androidx.xr.scenecore.GltfModel');
    this.emit('import androidx.xr.scenecore.GltfModelEntity');
    this.emit('import androidx.xr.scenecore.SurfaceEntity');
    this.emit('import androidx.xr.scenecore.SpatialCapability');
    this.emit('import androidx.xr.runtime.math.Pose');
    this.emit('import androidx.xr.runtime.math.Vector3');
    this.emit('import androidx.xr.runtime.math.Quaternion');
    this.emit('');
    if (this.options.useARCore) {
      this.emit('import com.google.ar.core.Config');
      this.emit('import com.google.ar.core.Plane');
      this.emit('import com.google.ar.core.Anchor');
    }
    if (this.options.useFilament) {
      this.emit('import com.google.android.filament.LightManager');
      this.emit('import com.google.android.filament.utils.Float3');
    }
    const hasHandTracking = composition.objects?.some((o) =>
      o.traits?.some((t) => t.name === 'hand_tracking')
    );
    if (hasHandTracking) {
      this.emit('import androidx.xr.scenecore.InputEvent');
    }
    // DP3: Face tracking with 68 blendshapes
    const hasFaceTracking = composition.objects?.some((o) =>
      o.traits?.some((t) => t.name === 'face_tracking')
    );
    if (hasFaceTracking) {
      this.emit('import androidx.xr.arcore.Face');
      this.emit('import androidx.xr.arcore.FaceBlendShapeType');
      this.emit('import androidx.xr.arcore.FaceConfidenceRegion');
      this.emit('import androidx.xr.runtime.FaceTrackingMode');
    }
    // DP3: Head-following UI via UserSubspace
    const hasHeadFollow = composition.objects?.some((o) =>
      o.traits?.some((t) => t.name === 'follows_head' || t.name === 'head_follow')
    );
    if (hasHeadFollow) {
      this.emit('import androidx.xr.compose.spatial.UserSubspace');
    }
    // DP3: DRM-protected video via SurfaceEntity
    const hasDrmVideo = composition.objects?.some((o) =>
      o.traits?.some((t) => t.name === 'drm_video' || t.name === 'protected_video')
    );
    if (hasDrmVideo) {
      this.emit('import androidx.media3.exoplayer.ExoPlayer');
      this.emit('import androidx.media3.common.MediaItem');
      this.emit('import androidx.media3.common.C');
    }
    if (composition.audio?.length) {
      this.emit('import android.media.AudioAttributes');
      this.emit('import android.media.SoundPool');
      this.emit('import androidx.xr.scenecore.SpatialAudioTrack');
    }
  }

  // ─── Activity Class ──────────────────────────────────────────────────

  private emitActivityClass(composition: HoloComposition): void {
    this.emit(`class ${this.options.activityName} : ComponentActivity() {`);
    this.indent();
    this.emit('private lateinit var xrSession: XRSession');
    if (composition.audio?.length) this.emit('private lateinit var soundPool: SoundPool');
    this.emit('');

    this.emit('override fun onCreate(savedInstanceState: Bundle?) {');
    this.indent();
    this.emit('super.onCreate(savedInstanceState)');
    this.emit('xrSession = XRSession.create(this)');
    if (this.options.useARCore) {
      this.emit('');
      this.emitARSession();
    }
    if (composition.audio?.length) {
      this.emit('');
      this.emit('val audioAttrs = AudioAttributes.Builder()');
      this.indent();
      this.emit('.setUsage(AudioAttributes.USAGE_GAME)');
      this.emit('.setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()');
      this.dedent();
      this.emit(
        'soundPool = SoundPool.Builder().setMaxStreams(8).setAudioAttributes(audioAttrs).build()'
      );
    }
    this.emit('');
    this.emit('setContent {');
    this.indent();
    this.emit(`${this.sanitizeName(composition.name)}Scene()`);
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.emit('');

    this.emitSceneComposable(composition);
    for (const tl of composition.timelines ?? []) this.emitTimeline(tl);
    for (const tr of composition.transitions ?? []) this.emitTransition(tr);

    this.dedent();
    this.emit('}');
  }

  // ─── AR Session ──────────────────────────────────────────────────────

  private emitARSession(): void {
    this.emit('xrSession.scene.configure { config ->');
    this.indent();
    this.emit('config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL');
    this.emit('config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR');
    this.emit('config.depthMode = Config.DepthMode.AUTOMATIC');
    this.emit('config.updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE');
    this.dedent();
    this.emit('}');
  }

  // ─── Scene Composable ────────────────────────────────────────────────

  private emitSceneComposable(composition: HoloComposition): void {
    const name = this.sanitizeName(composition.name);
    this.emit('@Composable');
    this.emit(`private fun ${name}Scene() {`);
    this.indent();

    if (composition.state) {
      for (const p of composition.state.properties) {
        this.emit(
          `var ${this.escapeStringValue(p.key as string, 'Kotlin')} by remember { mutableStateOf(${this.toKotlinValue(p.value)}) }`
        );
      }
      this.emit('');
    }

    // DP3: Use Subspace as the top-level spatial layout container
    this.emit('Subspace {');
    this.indent();
    if (composition.environment) this.emitEnvironment(composition.environment);
    if (composition.camera) this.emitCamera(composition.camera);
    for (const l of composition.lights ?? []) this.emitLight(l);

    // DP3: Emit objects — head-following objects use UserSubspace,
    // 3D model objects use SceneCoreEntity composable, others use direct entity creation
    for (const o of composition.objects ?? []) {
      const hasHeadFollow = o.traits?.some(
        (t) => t.name === 'follows_head' || t.name === 'head_follow'
      );
      if (hasHeadFollow) {
        this.emit('');
        this.emit('// DP3: UserSubspace — head-following content');
        this.emit('UserSubspace {');
        this.indent();
        this.emitObject(o);
        this.dedent();
        this.emit('}');
      } else {
        this.emitObject(o);
      }
    }

    for (const g of composition.spatialGroups ?? []) this.emitGroup(g);
    for (const a of composition.audio ?? []) this.emitAudio(a);
    for (const z of composition.zones ?? []) this.emitZone(z);
    if (composition.ui) this.emitUI(composition.ui);
    if (composition.effects) this.emitEffects(composition.effects);
    this.dedent();
    this.emit('}');

    this.dedent();
    this.emit('}');
    this.emit('');
  }

  // ─── Environment ─────────────────────────────────────────────────────

  private emitEnvironment(env: HoloEnvironment): void {
    this.emit('// Environment');
    for (const prop of env.properties) {
      if (prop.key === 'preset' || prop.key === 'skybox') {
        this.emit(`// Preset: "${prop.value}"`);
        this.emit('xrSession.scene.configure { config ->');
        this.indent();
        this.emit('config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR');
        this.dedent();
        this.emit('}');
      } else if (prop.key === 'passthrough') {
        if (prop.value === true || prop.value === 'true') {
          this.emit('xrSession.scene.configure { it.focusMode = Config.FocusMode.AUTO }');
        }
      } else if (prop.key === 'fog' && typeof prop.value === 'object') {
        this.emit(`// Fog: ${JSON.stringify(prop.value)} -- apply via Filament renderer`);
      } else if (prop.key === 'ambient_light') {
        this.emit(`// Ambient light: ${prop.value}`);
      }
    }
  }

  // ─── Object ──────────────────────────────────────────────────────────

  private emitObject(obj: HoloObjectDecl): void {
    const v = this.sanitizeName(obj.name);
    const meshType = this.findProp(obj, 'mesh') ?? this.findProp(obj, 'type') ?? 'cube';
    const modelSrc = this.findProp(obj, 'model') ?? this.findProp(obj, 'src');
    this.emit('');
    this.emit(`// Object: ${this.escapeStringValue(obj.name as string, 'Kotlin')}`);

    // Trait: plane_detection
    if (obj.traits?.some((t) => t.name === 'plane_detection')) {
      this.emit(
        `val ${v}Plane = xrSession.scene.createEntity("${this.escapeStringValue(obj.name as string, 'Kotlin')}_plane")`
      );
      this.emit(`${v}Plane.setPose(Pose(Vector3(0f, 0f, 0f), Quaternion.identity()))`);
    }
    // Trait: anchor
    const anchor = obj.traits?.find((t) => t.name === 'anchor');
    if (anchor) {
      this.emit(
        `val ${v}Anchor = xrSession.scene.createAnchorEntity() // type: ${anchor.config?.type ?? 'plane'}`
      );
    }
    // Trait: hand_tracking
    if (obj.traits?.some((t) => t.name === 'hand_tracking')) {
      this.emit(`val ${v}Hand = HandNode(xrSession)`);
      this.emit(`${v}Hand.setOnInputEventListener { event: InputEvent -> /* hand input */ }`);
    }

    if (modelSrc) {
      // DP3: URI-based GltfModel loading via SceneCore (replaces ArModelNode)
      this.emit(`val ${v}GltfModel = GltfModel.create(xrSession, Uri.parse("${modelSrc}"))`);
      this.emit(`val ${v} = GltfModelEntity.create(xrSession, ${v}GltfModel).apply {`);
      this.indent();
      this.emit(`parent = xrSession.scene.activitySpace`);
      const modelPos = this.findProp(obj, 'position');
      if (modelPos && Array.isArray(modelPos)) {
        this.emit(
          `setPose(Pose(${this.toKotlinFloat3(modelPos as number[])}, Quaternion.identity()))`
        );
      }
      this.dedent();
      this.emit('}');
    } else if (meshType === 'text') {
      const text = this.findProp(obj, 'text') ?? obj.name;
      const color = this.findProp(obj, 'color');
      this.emit(`SpatialPanel(SubspaceModifier.width(200f).height(60f)) {`);
      this.indent();
      this.emit(
        `Text("${text}", color = ${color ? this.toKotlinColor(color as string) : 'Color.White'})`
      );
      this.dedent();
      this.emit('}');
    } else {
      this.emit(
        `val ${v} = xrSession.scene.createEntity("${this.escapeStringValue(obj.name as string, 'Kotlin')}")`
      );
      const pos = this.findProp(obj, 'position');
      if (pos && Array.isArray(pos)) {
        this.emit(
          `${v}.setPose(Pose(${this.toKotlinFloat3(pos as number[])}, Quaternion.identity()))`
        );
      }
      const scale = this.findProp(obj, 'scale');
      if (scale && Array.isArray(scale)) {
        this.emit(`${v}.setScale(${this.toKotlinFloat3(scale as number[])})`);
      } else if (typeof scale === 'number') {
        this.emit(`${v}.setScale(Float3(${scale}f, ${scale}f, ${scale}f))`);
      }
      const mat = this.findProp(obj, 'material');
      if (mat && typeof mat === 'object') {
        const m = mat as Record<string, any>;
        if (m.color) this.emit(`val ${v}Color = ${this.toKotlinColor(m.color)}`);
        if (m.roughness !== undefined) this.emit(`// roughness = ${m.roughness}f`);
        if (m.metalness !== undefined) this.emit(`// metalness = ${m.metalness}f`);
      }
      this.emit(`// Geometry: ${this.mapShapeToFilament(meshType as string)}`);
    }

    // Rotation comment
    const rot = this.findProp(obj, 'rotation');
    if (rot && Array.isArray(rot) && meshType !== 'text') {
      this.emit(`// Rotation: ${(rot as number[]).join(', ')} deg`);
    }

    // Remaining traits
    for (const t of obj.traits ?? []) {
      if (t.name === 'collidable') this.emit(`// Collision enabled for ${v}`);
      else if (t.name === 'physics') this.emit(`// Physics: mass=${t.config?.mass ?? 1.0}`);
      else if (t.name === 'grabbable') {
        this.emit(`${v}.setOnInputEventListener { _: InputEvent -> /* grab */ }`);
      }
      // DP3: Face tracking with 68 blendshapes
      else if (t.name === 'face_tracking') {
        this.emitFaceTracking(v, t.config ?? {});
      }
      // DP3: Head-following UI via UserSubspace
      else if (t.name === 'follows_head' || t.name === 'head_follow') {
        this.emitHeadFollowUI(v, obj, t.config ?? {});
      }
      // DP3: DRM-protected video via SurfaceEntity
      else if (t.name === 'drm_video' || t.name === 'protected_video') {
        this.emitDrmVideo(v, t.config ?? {});
      }
    }

    for (const child of obj.children ?? []) this.emitObject(child);
  }

  // ─── Spatial Group ───────────────────────────────────────────────────

  private emitGroup(group: HoloSpatialGroup): void {
    const v = this.sanitizeName(group.name);
    this.emit('');
    this.emit(`// Group: ${this.escapeStringValue(group.name as string, 'Kotlin')}`);
    this.emit(
      `val ${v} = xrSession.scene.createEntity("${this.escapeStringValue(group.name as string, 'Kotlin')}")`
    );
    for (const p of group.properties) {
      if (p.key === 'position' && Array.isArray(p.value))
        this.emit(
          `${v}.setPose(Pose(${this.toKotlinFloat3(p.value as number[])}, Quaternion.identity()))`
        );
      else if (p.key === 'scale' && Array.isArray(p.value))
        this.emit(`${v}.setScale(${this.toKotlinFloat3(p.value as number[])})`);
      else if (p.key === 'scale' && typeof p.value === 'number')
        this.emit(`${v}.setScale(Float3(${p.value}f, ${p.value}f, ${p.value}f))`);
    }
    for (const o of group.objects) {
      this.emitObject(o);
      this.emit(`${v}.addChild(${this.sanitizeName(o.name)})`);
    }
    for (const sub of group.groups ?? []) {
      this.emitGroup(sub);
      this.emit(`${v}.addChild(${this.sanitizeName(sub.name)})`);
    }
  }

  // ─── Light ───────────────────────────────────────────────────────────

  private emitLight(light: HoloLight): void {
    const v = this.sanitizeName(light.name);
    const typeMap: Record<string, string> = {
      directional: 'DIRECTIONAL',
      point: 'POINT',
      spot: 'SPOT',
      ambient: 'DIRECTIONAL',
      hemisphere: 'DIRECTIONAL',
      area: 'POINT',
    };
    this.emit('');
    this.emit(
      `val ${v} = xrSession.scene.createEntity("${this.escapeStringValue(light.name as string, 'Kotlin')}")`
    );
    this.emit(`// Filament type: LightManager.Type.${typeMap[light.lightType] ?? 'POINT'}`);

    const color = light.properties.find((p) => p.key === 'color');
    const intensity = light.properties.find((p) => p.key === 'intensity');
    const pos = light.properties.find((p) => p.key === 'position');
    if (color) this.emit(`// Color: ${color.value}`);
    if (intensity) this.emit(`// Intensity: ${(intensity.value as number) * 100000}f lux`);
    if (pos && Array.isArray(pos.value))
      this.emit(
        `${v}.setPose(Pose(${this.toKotlinFloat3(pos.value as number[])}, Quaternion.identity()))`
      );
  }

  // ─── Camera ──────────────────────────────────────────────────────────

  private emitCamera(cam: HoloCamera): void {
    this.emit(`// Camera: ${cam.cameraType}`);
    for (const p of cam.properties) {
      if (p.key === 'passthrough' && (p.value === true || p.value === 'true'))
        this.emit('xrSession.scene.configure { it.focusMode = Config.FocusMode.AUTO }');
      else if (p.key === 'fov') this.emit(`// FOV: ${p.value} -- managed by XR headset`);
    }
  }

  // ─── Timeline ────────────────────────────────────────────────────────

  private emitTimeline(tl: HoloTimeline): void {
    const fn = this.sanitizeName(tl.name);
    this.emit('');
    this.emit(`private fun playTimeline_${fn}() {`);
    this.indent();
    this.emit('val set = AnimatorSet()');
    this.emit('val anims = mutableListOf<ObjectAnimator>()');

    for (const e of tl.entries) {
      const ms = Math.round(e.time * 1000);
      if (e.action.kind === 'animate') {
        for (const [k, val] of Object.entries(e.action.properties)) {
          if (typeof val === 'number') {
            this.emit(
              `anims.add(ObjectAnimator.ofFloat(null, "${k}", ${val}f).apply { startDelay = ${ms}L; duration = 300L })`
            );
          }
        }
      } else if (e.action.kind === 'emit') {
        this.emit(`// @${e.time}s emit "${e.action.event}"`);
      } else if (e.action.kind === 'call') {
        this.emit(`// @${e.time}s call ${e.action.method}()`);
      }
    }

    this.emit('set.playTogether(anims as List<android.animation.Animator>)');
    if (tl.loop) {
      this.emit('set.addListener(object : android.animation.AnimatorListenerAdapter() {');
      this.indent();
      this.emit(
        `override fun onAnimationEnd(a: android.animation.Animator) { playTimeline_${fn}() }`
      );
      this.dedent();
      this.emit('})');
    }
    this.emit('set.start()');
    this.dedent();
    this.emit('}');
  }

  // ─── Audio ───────────────────────────────────────────────────────────

  private emitAudio(audio: HoloAudio): void {
    const v = this.sanitizeName(audio.name);
    const src = audio.properties.find((p) => p.key === 'src' || p.key === 'source')?.value;
    const spatial = audio.properties.find((p) => p.key === 'spatial')?.value;
    const volume = audio.properties.find((p) => p.key === 'volume')?.value ?? 1.0;
    const loop = audio.properties.find((p) => p.key === 'loop')?.value;
    const pos = audio.properties.find((p) => p.key === 'position')?.value;

    this.emit('');
    this.emit(`// Audio: ${this.escapeStringValue(audio.name as string, 'Kotlin')}`);
    if (src) {
      this.emit(`val ${v}Id = soundPool.load(this, R.raw.${this.sanitizeName(src as string)}, 1)`);
    }
    if (spatial && pos && Array.isArray(pos)) {
      this.emit(
        `val ${v}Entity = xrSession.scene.createEntity("${this.escapeStringValue(audio.name as string, 'Kotlin')}")`
      );
      this.emit(
        `${v}Entity.setPose(Pose(${this.toKotlinFloat3(pos as number[])}, Quaternion.identity()))`
      );
      this.emit(`val ${v}Track = SpatialAudioTrack(xrSession, ${v}Entity)`);
    }
    if (src) {
      this.emit(`soundPool.setOnLoadCompleteListener { pool, id, _ ->`);
      this.indent();
      this.emit(
        `if (id == ${v}Id) pool.play(id, ${volume}f, ${volume}f, 1, ${loop ? 1 : 0}, 1.0f)`
      );
      this.dedent();
      this.emit('}');
    }
  }

  // ─── UI ──────────────────────────────────────────────────────────────

  private emitUI(ui: HoloUI): void {
    this.emit('');
    this.emit('// UI Layer');
    for (const el of ui.elements) {
      const vn = this.sanitizeName(el.name);
      const w = el.properties.find((p) => p.key === 'width')?.value ?? 400;
      const h = el.properties.find((p) => p.key === 'height')?.value ?? 300;
      const text = el.properties.find((p) => p.key === 'text')?.value;
      const label = el.properties.find((p) => p.key === 'label')?.value;
      const elType = el.properties.find((p) => p.key === 'type')?.value;

      this.emit(`SpatialPanel(SubspaceModifier.width(${w}f).height(${h}f)) {`);
      this.indent();
      if (elType === 'button' && label) {
        this.emit(`Button(onClick = { /* ${vn} */ }) { Text("${label}") }`);
      } else if (text) {
        const color = el.properties.find((p) => p.key === 'color')?.value;
        this.emit(
          `Text("${text}", color = ${color ? this.toKotlinColor(color as string) : 'Color.White'})`
        );
      } else {
        this.emit(
          `Column(modifier = Modifier.fillMaxSize()) { Text("${this.escapeStringValue(el.name as string, 'Kotlin')}") }`
        );
      }
      this.dedent();
      this.emit('}');
    }
  }

  // ─── Zones ───────────────────────────────────────────────────────────

  private emitZone(zone: HoloZone): void {
    const v = this.sanitizeName(zone.name);
    this.emit(
      `val ${v} = xrSession.scene.createEntity("${this.escapeStringValue(zone.name as string, 'Kotlin')}")`
    );
    const pos = zone.properties.find((p) => p.key === 'position')?.value;
    if (pos && Array.isArray(pos))
      this.emit(
        `${v}.setPose(Pose(${this.toKotlinFloat3(pos as number[])}, Quaternion.identity()))`
      );
    const shape = zone.properties.find((p) => p.key === 'shape')?.value;
    const size = zone.properties.find((p) => p.key === 'size')?.value;
    const radius = zone.properties.find((p) => p.key === 'radius')?.value;
    if (shape === 'box' && size && Array.isArray(size))
      this.emit(`// Trigger volume: box ${(size as number[]).join('x')}`);
    else if (shape === 'sphere' && radius) this.emit(`// Trigger volume: sphere r=${radius}`);
    if (zone.handlers?.length)
      this.emit(`// Handlers: ${zone.handlers.map((h) => h.event).join(', ')}`);
  }

  // ─── Effects ─────────────────────────────────────────────────────────

  private emitEffects(effects: HoloEffects): void {
    this.emit('// Post-processing (Filament Renderer)');
    for (const fx of effects.effects)
      this.emit(`// ${fx.effectType}: ${JSON.stringify(fx.properties)}`);
  }

  // ─── DP3: Face Tracking with 68 Blendshapes ─────────────────────────

  private emitFaceTracking(varName: string, config: Record<string, unknown>): void {
    const blendshapes = (config.blendshapes as string[]) ?? [];
    this.emit('');
    this.emit(`// DP3: Face tracking — 68 blendshapes via ARCore for Jetpack XR`);
    this.emit(`// android.permission.FACE_TRACKING required`);
    this.emit(`val ${varName}FaceConfig = xrSession.config.copy(`);
    this.indent();
    this.emit('faceTracking = FaceTrackingMode.BLEND_SHAPES');
    this.dedent();
    this.emit(')');
    this.emit(`xrSession.configure(${varName}FaceConfig)`);
    this.emit('');
    this.emit(`val ${varName}Face = Face.getUserFace(xrSession)`);
    this.emit(`${varName}Face?.state?.collect { faceState ->`);
    this.indent();
    this.emit(`if (faceState.trackingState != TrackingState.TRACKING) return@collect`);
    if (blendshapes.length > 0) {
      for (const bs of blendshapes) {
        const bsConst = `FaceBlendShapeType.FACE_BLEND_SHAPE_TYPE_${bs.toUpperCase()}`;
        this.emit(`val ${varName}_${this.sanitizeName(bs)} = faceState.blendShapes[${bsConst}]`);
      }
    } else {
      this.emit(
        '// Access blendshapes: faceState.blendShapes[FaceBlendShapeType.FACE_BLEND_SHAPE_TYPE_*]'
      );
      this.emit(
        '// 68 blendshapes available: BROW_LOWERER_L/R, EYES_CLOSED_L/R, JAW_DROP, LIPS_TOWARD, etc.'
      );
    }
    this.emit(
      `val ${varName}Confidence = faceState.getConfidence(FaceConfidenceRegion.FACE_CONFIDENCE_REGION_LOWER)`
    );
    this.dedent();
    this.emit('}');
  }

  // ─── DP3: Head-Following UI via UserSubspace ──────────────────────

  private emitHeadFollowUI(
    varName: string,
    obj: HoloObjectDecl,
    config: Record<string, unknown>
  ): void {
    const distance = config.distance ?? config.follow_distance ?? 1.5;
    const w = this.findProp(obj, 'width') ?? config.width ?? 400;
    const h = this.findProp(obj, 'height') ?? config.height ?? 300;
    this.emit('');
    this.emit(`// DP3: Head-following UI panel via UserSubspace`);
    this.emit(`// android.permission.HEAD_TRACKING required`);
    this.emit(`// Content follows user's head at ${distance}m distance (soft-locking)`);
    this.emit(`SpatialPanel(SubspaceModifier.width(${w}f).height(${h}f)) {`);
    this.indent();
    const text = this.findProp(obj, 'text');
    const label = this.findProp(obj, 'label');
    if (text) {
      this.emit(`Text("${text}")`);
    } else if (label) {
      this.emit(`Text("${label}")`);
    } else {
      this.emit(
        `Column(modifier = Modifier.fillMaxSize()) { Text("${this.escapeStringValue(obj.name as string, 'Kotlin')}") }`
      );
    }
    this.dedent();
    this.emit('}');
  }

  // ─── DP3: DRM-Protected Video via SurfaceEntity ───────────────────

  private emitDrmVideo(varName: string, config: Record<string, unknown>): void {
    const videoUri = config.uri ?? config.src ?? config.source ?? '';
    const licenseUri = config.license_uri ?? config.drm_license ?? '';
    const stereoMode = (config.stereo_mode as string) ?? 'SIDE_BY_SIDE';
    const shape = (config.shape as string) ?? 'quad';
    const width = config.width ?? 1.0;
    const height = config.height ?? 1.0;
    const radius = config.radius ?? 5.0;
    this.emit('');
    this.emit(`// DP3: DRM-protected video via SurfaceEntity + Widevine`);

    // Determine shape
    let shapeCode: string;
    if (shape === 'sphere') {
      shapeCode = `SurfaceEntity.Shape.Sphere(${radius}f)`;
    } else if (shape === 'hemisphere') {
      shapeCode = `SurfaceEntity.Shape.Hemisphere(${radius}f)`;
    } else {
      shapeCode = `SurfaceEntity.Shape.Quad(FloatSize2d(${width}f, ${height}f))`;
    }

    const stereoModeMap: Record<string, string> = {
      SIDE_BY_SIDE: 'SurfaceEntity.StereoMode.SIDE_BY_SIDE',
      TOP_BOTTOM: 'SurfaceEntity.StereoMode.TOP_BOTTOM',
      MONO: 'SurfaceEntity.StereoMode.MONO',
      MULTIVIEW_LEFT: 'SurfaceEntity.StereoMode.MULTIVIEW_LEFT_PRIMARY',
      MULTIVIEW_RIGHT: 'SurfaceEntity.StereoMode.MULTIVIEW_RIGHT_PRIMARY',
    };
    const stereoModeKotlin = stereoModeMap[stereoMode] ?? 'SurfaceEntity.StereoMode.SIDE_BY_SIDE';

    this.emit(`val ${varName}Surface = SurfaceEntity.create(`);
    this.indent();
    this.emit('session = xrSession,');
    this.emit(`stereoMode = ${stereoModeKotlin},`);
    this.emit('pose = Pose(Vector3(0f, 0f, -1.5f), Quaternion.identity()),');
    this.emit(`shape = ${shapeCode},`);
    this.emit('surfaceProtection = SurfaceEntity.SurfaceProtection.PROTECTED');
    this.dedent();
    this.emit(')');

    if (videoUri) {
      this.emit('');
      this.emit(`val ${varName}MediaItem = MediaItem.Builder()`);
      this.indent();
      this.emit(`.setUri("${videoUri}")`);
      if (licenseUri) {
        this.emit('.setDrmConfiguration(');
        this.indent();
        this.emit('MediaItem.DrmConfiguration.Builder(C.WIDEVINE_UUID)');
        this.indent();
        this.emit(`.setLicenseUri("${licenseUri}")`);
        this.emit('.build()');
        this.dedent();
        this.dedent();
        this.emit(')');
      }
      this.emit('.build()');
      this.dedent();
      this.emit('');
      this.emit(`val ${varName}Player = ExoPlayer.Builder(this).build()`);
      this.emit(`${varName}Player.setVideoSurface(${varName}Surface.getSurface())`);
      this.emit(`${varName}Player.setMediaItem(${varName}MediaItem)`);
      this.emit(`${varName}Player.prepare()`);
      this.emit(`${varName}Player.play()`);
    }
  }

  // ─── Domain Blocks (v4.2) ──────────────────────────────────────────

  private compileAndroidXRDomainBlocks(composition: HoloComposition): void {
    const domainBlocks =
      ((composition as Extensible<HoloComposition>).domainBlocks as unknown[]) ?? [];
    if (domainBlocks.length === 0) return;

    this.emit('');
    this.emit('// === v4.2 Domain Blocks ===');

    let blockIdx = 0;
    const compiled = compileDomainBlocks(
      // @ts-expect-error During migration
      domainBlocks,
      {
        material: (block) => {
          const mat = compileMaterialBlock(block);
          return materialToAndroidXR(mat, `db${blockIdx++}`);
        },
        physics: (block) => {
          const phys = compilePhysicsBlock(block);
          return physicsToAndroidXR(phys, `db${blockIdx++}`);
        },
        vfx: (block) => {
          const ps = compileParticleBlock(block);
          return particlesToAndroidXR(ps, `db${blockIdx++}`);
        },
        postfx: (block) => {
          const pp = compilePostProcessingBlock(block);
          const postfx = pp as CompiledPostProcessing;
          const effects = postfx.effects
            .map((e) => `// Effect: ${e.type} — ${JSON.stringify(e.properties)}`)
            .join('\n');
          return `// Post-Processing: ${postfx.keyword} — configure via Filament Renderer post-processing\n${effects}`;
        },
        audio: (block) => {
          const audio = compileAudioSourceBlock(block);
          return audioSourceToAndroidXR(audio, `db${blockIdx++}`);
        },
        weather: (block) => {
          const weather = compileWeatherBlock(block);
          return weatherToAndroidXR(weather);
        },
      },
      (block) =>
        `// Domain block: ${block.domain}/${block.keyword} "${this.escapeStringValue(block.name as string, 'Kotlin')}"`
    );

    for (const line of compiled) {
      for (const l of line.split('\n')) {
        this.emit(l);
      }
    }
  }

  // ─── Transitions ─────────────────────────────────────────────────────

  private emitTransition(tr: HoloTransition): void {
    const fn = this.sanitizeName(tr.name);
    const target = tr.properties.find((p) => p.key === 'target')?.value;
    const dur = tr.properties.find((p) => p.key === 'duration')?.value ?? 0.5;
    this.emit('');
    this.emit(`private fun transition_${fn}() {`);
    this.indent();
    this.emit(`// -> "${target}"`);
    this.emit(
      `ObjectAnimator.ofFloat(null, "alpha", 1f, 0f).apply { duration = ${Math.round((dur as number) * 1000)}L }.start()`
    );
    this.dedent();
    this.emit('}');
  }

  // ─── Value Conversion Helpers ────────────────────────────────────────

  /** Converts [x, y, z] to `Float3(xf, yf, zf)`. */
  private toKotlinFloat3(arr: number[]): string {
    if (Array.isArray(arr) && arr.length >= 3) return `Float3(${arr[0]}f, ${arr[1]}f, ${arr[2]}f)`;
    if (Array.isArray(arr) && arr.length >= 1) return `Float3(${arr[0]}f, ${arr[0]}f, ${arr[0]}f)`;
    const v = typeof arr === 'number' ? arr : 0;
    return `Float3(${v}f, ${v}f, ${v}f)`;
  }

  /** Converts `#RRGGBB` or `#RRGGBBAA` to `Color(0xAARRGGBB)`. */
  private toKotlinColor(hex: string): string {
    if (typeof hex === 'string' && hex.startsWith('#')) {
      const raw = hex.slice(1);
      if (raw.length === 6) return `Color(0xFF${raw.toUpperCase()})`;
      if (raw.length === 8) {
        const [rr, gg, bb, aa] = [
          raw.substring(0, 2),
          raw.substring(2, 4),
          raw.substring(4, 6),
          raw.substring(6, 8),
        ];
        return `Color(0x${aa.toUpperCase()}${rr.toUpperCase()}${gg.toUpperCase()}${bb.toUpperCase()})`;
      }
    }
    return 'Color.White';
  }

  /** Maps HoloScript shape names to Filament geometric primitive descriptions. */
  private mapShapeToFilament(type: string): string {
    const map: Record<string, string> = {
      cube: 'BoxShape',
      box: 'BoxShape',
      sphere: 'IcoSphereShape',
      cylinder: 'CylinderShape',
      cone: 'ConeShape',
      plane: 'QuadShape',
      torus: 'CustomRingGeometry',
      capsule: 'CapsuleShape',
    };
    return map[type] ?? `Unknown("${type}")`;
  }

  // ─── Generic Helpers ─────────────────────────────────────────────────

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
    if (typeof value === 'number') return Number.isInteger(value) ? `${value}` : `${value}f`;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return `"${this.escapeStringValue(value, 'Kotlin')}"`;
    if (value === null) return 'null';
    if (Array.isArray(value))
      return `listOf(${value.map((v) => this.toKotlinValue(v)).join(', ')})`;
    return 'null';
  }

  private findProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    return obj.properties?.find((p) => p.key === key)?.value;
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private emit(line: string): void {
    this.lines.push(this.options.indent.repeat(this.indentLevel) + line);
  }

  private indent(): void {
    this.indentLevel++;
  }
  private dedent(): void {
    if (this.indentLevel > 0) this.indentLevel--;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI GLASSES MODE — Jetpack Compose Glimmer + Jetpack Projected
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generates the main Activity file for AI glasses form factor.
   *
   * Uses Jetpack Compose Glimmer (GlimmerTheme, Card, Button, Text) instead of
   * Material3 + SceneCore, and integrates ProjectedContext /
   * ProjectedDeviceController for hardware access.
   */
  private generateGlassesActivityFile(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;

    this.emit('// Auto-generated by HoloScript AndroidXRCompiler (AI Glasses mode)');
    this.emit(
      `// Source: composition "${this.escapeStringValue(composition.name as string, 'Kotlin')}"`
    );
    this.emit('// Form factor: AI Glasses (Jetpack Compose Glimmer + Jetpack Projected)');
    this.emit('// Do not edit manually -- regenerate from .holo source');
    this.emit('');
    this.emit(`package ${this.options.packageName}`);
    this.emit('');
    this.emitGlassesImports(composition);
    this.emit('');
    this.emitGlassesActivityClass(composition);

    return this.lines.join('\n');
  }

  /**
   * Emits Glimmer-specific imports for glasses mode.
   */
  private emitGlassesImports(composition: HoloComposition): void {
    this.emit('import android.os.Bundle');
    this.emit('');

    // Core Compose
    this.emit('import androidx.activity.ComponentActivity');
    this.emit('import androidx.activity.compose.setContent');
    this.emit('import androidx.compose.runtime.*');
    this.emit('import androidx.compose.foundation.layout.*');
    this.emit('import androidx.compose.ui.Alignment');
    this.emit('import androidx.compose.ui.Modifier');
    this.emit('import androidx.compose.ui.graphics.Color');
    this.emit('import androidx.lifecycle.lifecycleScope');
    this.emit('');

    // Jetpack Compose Glimmer
    this.emit('import androidx.xr.glimmer.GlimmerTheme');
    this.emit('import androidx.xr.glimmer.Card');
    this.emit('import androidx.xr.glimmer.Button');
    this.emit('import androidx.xr.glimmer.Text');
    this.emit('import androidx.xr.glimmer.ListItem');
    this.emit('import androidx.xr.glimmer.TitleChip');
    this.emit('import androidx.xr.glimmer.surface');
    this.emit('');

    // Jetpack Projected API
    this.emit('import androidx.xr.projected.ProjectedContext');
    this.emit('import androidx.xr.projected.ProjectedDeviceController');
    this.emit(
      'import androidx.xr.projected.ProjectedDeviceController.Companion.CAPABILITY_VISUAL_UI'
    );
    this.emit('import androidx.xr.projected.ProjectedDisplayController');
    this.emit('');

    // Coroutines for Projected lifecycle
    this.emit('import kotlinx.coroutines.launch');
    this.emit('');

    if (this.options.useARCore) {
      this.emit('// ARCore for Jetpack XR (motion tracking + geospatial on glasses)');
      this.emit('import com.google.ar.core.Config');
    }

    // Audio (if composition uses audio)
    if (composition.audio?.length) {
      this.emit('import android.media.AudioAttributes');
      this.emit('import android.media.SoundPool');
    }
  }

  /**
   * Emits the AI glasses Activity class using GlimmerTheme and Projected API.
   */
  private emitGlassesActivityClass(composition: HoloComposition): void {
    this.emit('@OptIn(ExperimentalProjectedApi::class)');
    this.emit(`class ${this.options.activityName} : ComponentActivity() {`);
    this.indent();

    // Glasses-specific state
    this.emit('private var displayController: ProjectedDisplayController? = null');
    this.emit('private var isVisualUiSupported by mutableStateOf(false)');
    this.emit('private var areVisualsOn by mutableStateOf(true)');
    if (composition.audio?.length) {
      this.emit('private lateinit var soundPool: SoundPool');
    }
    this.emit('');

    // onCreate
    this.emit('override fun onCreate(savedInstanceState: Bundle?) {');
    this.indent();
    this.emit('super.onCreate(savedInstanceState)');
    this.emit('');
    this.emit('// Detect glasses display capability via Projected API');
    this.emit('lifecycleScope.launch {');
    this.indent();
    this.emit(
      'val projectedDeviceController = ProjectedDeviceController.create(this@' +
        this.options.activityName +
        ')'
    );
    this.emit(
      'isVisualUiSupported = projectedDeviceController.capabilities.contains(CAPABILITY_VISUAL_UI)'
    );
    this.dedent();
    this.emit('}');
    this.emit('');

    if (composition.audio?.length) {
      this.emit('val audioAttrs = AudioAttributes.Builder()');
      this.indent();
      this.emit('.setUsage(AudioAttributes.USAGE_GAME)');
      this.emit('.setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()');
      this.dedent();
      this.emit(
        'soundPool = SoundPool.Builder().setMaxStreams(8).setAudioAttributes(audioAttrs).build()'
      );
      this.emit('');
    }

    this.emit('setContent {');
    this.indent();
    this.emit('GlimmerTheme {');
    this.indent();
    this.emit(`${this.sanitizeName(composition.name)}GlassesScreen(`);
    this.indent();
    this.emit('areVisualsOn = areVisualsOn,');
    this.emit('isVisualUiSupported = isVisualUiSupported,');
    this.emit(`onClose = { finish() }`);
    this.dedent();
    this.emit(')');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.emit('');

    // Main Glimmer composable
    this.emitGlassesSceneComposable(composition);

    this.dedent();
    this.emit('}');
  }

  /**
   * Emits the main Glimmer composable screen for AI glasses.
   *
   * Generates lightweight AR overlay UI using Glimmer components (Card, Text, Button,
   * ListItem, TitleChip) instead of the immersive SceneCore entity hierarchy used
   * in headset mode.
   */
  private emitGlassesSceneComposable(composition: HoloComposition): void {
    const name = this.sanitizeName(composition.name);

    this.emit('@Composable');
    this.emit(`private fun ${name}GlassesScreen(`);
    this.indent();
    this.emit('areVisualsOn: Boolean,');
    this.emit('isVisualUiSupported: Boolean,');
    this.emit('onClose: () -> Unit,');
    this.emit('modifier: Modifier = Modifier');
    this.dedent();
    this.emit(') {');
    this.indent();

    // State from composition
    if (composition.state) {
      for (const p of composition.state.properties) {
        this.emit(
          `var ${this.escapeStringValue(p.key as string, 'Kotlin')} by remember { mutableStateOf(${this.toKotlinValue(p.value)}) }`
        );
      }
      this.emit('');
    }

    // Outer Box with Glimmer surface modifier
    this.emit('Box(');
    this.indent();
    this.emit('modifier = modifier');
    this.indent();
    this.emit('.surface(focusable = false)');
    this.emit('.fillMaxSize(),');
    this.dedent();
    this.emit('contentAlignment = Alignment.Center');
    this.dedent();
    this.emit(') {');
    this.indent();

    // Branch on visual UI capability
    this.emit('if (isVisualUiSupported && areVisualsOn) {');
    this.indent();

    // Emit Glimmer UI tree
    this.emitGlimmerContentTree(composition);

    this.dedent();
    this.emit('} else {');
    this.indent();
    this.emit('// Audio-only fallback for glasses without display');
    this.emit('Text("Audio Guidance Mode Active")');
    this.dedent();
    this.emit('}');

    this.dedent();
    this.emit('}');

    this.dedent();
    this.emit('}');
    this.emit('');
  }

  /**
   * Emits Glimmer-based content tree: converts HoloScript objects/UI into
   * Card, TitleChip, ListItem, Button, and Text composables.
   */
  private emitGlimmerContentTree(composition: HoloComposition): void {
    this.emit('Column(');
    this.indent();
    this.emit('modifier = Modifier.fillMaxSize(),');
    this.emit('verticalArrangement = Arrangement.spacedBy(8.dp)');
    this.dedent();
    this.emit(') {');
    this.indent();

    // Title chip for composition name
    this.emit(
      `TitleChip(title = "${this.escapeStringValue(composition.name as string, 'Kotlin')}")`
    );
    this.emit('');

    // Convert objects to Glimmer cards
    for (const obj of composition.objects ?? []) {
      this.emitGlimmerObject(obj);
    }

    // UI elements as Glimmer components
    if (composition.ui) {
      this.emit('');
      this.emit('// UI Elements');
      for (const el of composition.ui.elements) {
        this.emitGlimmerUIElement(el);
      }
    }

    // Close button
    this.emit('');
    this.emit('Button(onClick = onClose) {');
    this.indent();
    this.emit('Text("Close")');
    this.dedent();
    this.emit('}');

    this.dedent();
    this.emit('}');
  }

  /**
   * Converts a HoloObject into a Glimmer Card composable.
   *
   * For glasses mode, 3D objects are represented as information cards showing
   * the object's name, type, and properties — the glasses display provides
   * AR overlay information rather than full 3D rendering.
   */
  private emitGlimmerObject(obj: HoloObjectDecl): void {
    const v = this.sanitizeName(obj.name);
    const meshType = this.findProp(obj, 'mesh') ?? this.findProp(obj, 'type') ?? 'object';
    const modelSrc = this.findProp(obj, 'model') ?? this.findProp(obj, 'src');
    const text = this.findProp(obj, 'text');

    this.emit(
      `// Object: ${this.escapeStringValue(obj.name as string, 'Kotlin')} (glasses overlay)`
    );

    if (text) {
      // Text objects become plain Text composables
      const color = this.findProp(obj, 'color');
      this.emit(
        `Text("${text}"${color ? `, color = ${this.toKotlinColor(color as string)}` : ''})`
      );
    } else if (modelSrc) {
      // 3D model objects become Card with model info
      this.emit(`Card(`);
      this.indent();
      this.emit(`title = { Text("${this.escapeStringValue(obj.name as string, 'Kotlin')}") },`);
      this.emit(`action = {`);
      this.indent();
      this.emit(`Button(onClick = { /* interact with ${v} */ }) {`);
      this.indent();
      this.emit('Text("View")');
      this.dedent();
      this.emit('}');
      this.dedent();
      this.emit('}');
      this.dedent();
      this.emit(') {');
      this.indent();
      this.emit(`Text("3D Model: ${modelSrc}")`);
      const pos = this.findProp(obj, 'position');
      if (pos && Array.isArray(pos)) {
        this.emit(`Text("Position: ${(pos as number[]).join(', ')}")`);
      }
      this.dedent();
      this.emit('}');
    } else {
      // Primitive objects become ListItems
      this.emit(`ListItem(`);
      this.indent();
      this.emit(
        `headlineContent = { Text("${this.escapeStringValue(obj.name as string, 'Kotlin')}") },`
      );
      this.emit(`supportingContent = { Text("Type: ${meshType}") }`);
      this.dedent();
      this.emit(')');
    }
    this.emit('');

    // Recurse children
    for (const child of obj.children ?? []) {
      this.emitGlimmerObject(child);
    }
  }

  /**
   * Converts a HoloUI element into appropriate Glimmer composable.
   */
  private emitGlimmerUIElement(el: {
    name: string;
    properties: Array<{ key: string; value: unknown }>;
  }): void {
    const vn = this.sanitizeName(el.name);
    const text = el.properties.find((p) => p.key === 'text')?.value;
    const label = el.properties.find((p) => p.key === 'label')?.value;
    const elType = el.properties.find((p) => p.key === 'type')?.value;

    if (elType === 'button' && label) {
      this.emit(`Button(onClick = { /* ${vn} */ }) { Text("${label}") }`);
    } else if (text) {
      const color = el.properties.find((p) => p.key === 'color')?.value;
      this.emit(
        `Text("${text}"${color ? `, color = ${this.toKotlinColor(color as string)}` : ''})`
      );
    } else {
      this.emit(
        `Card(title = { Text("${this.escapeStringValue(el.name as string, 'Kotlin')}") }) {`
      );
      this.indent();
      this.emit(`Text("${this.escapeStringValue(el.name as string, 'Kotlin')}")`);
      this.dedent();
      this.emit('}');
    }
  }

  // ─── Glasses Manifest ──────────────────────────────────────────────

  /**
   * Generates AndroidManifest.xml for AI glasses form factor.
   *
   * Key differences from headset:
   * - requiredDisplayCategory="xr_projected" on the activity
   * - No XR headtracking hardware requirement
   * - Camera permission for glasses camera via ProjectedContext
   */
  private generateGlassesManifestFile(composition: HoloComposition): string {
    const pkg = this.options.packageName;
    const activityName = this.options.activityName;

    const permissions: string[] = [];
    permissions.push('    <uses-permission android:name="android.permission.CAMERA" />');
    permissions.push('    <uses-permission android:name="android.permission.RECORD_AUDIO" />');
    permissions.push('    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />');

    const hasHandTracking = composition.objects?.some((o) =>
      o.traits?.some((t) => t.name === 'hand_tracking')
    );
    if (hasHandTracking) {
      permissions.push('    <uses-permission android:name="android.permission.HAND_TRACKING" />');
    }

    return `<?xml version="1.0" encoding="utf-8"?>
<!-- Auto-generated by HoloScript AndroidXRCompiler (AI Glasses mode) -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${pkg}">

    <!-- Glasses Permissions -->
${permissions.join('\n')}

    <application
        android:allowBackup="true"
        android:label="${this.escapeStringValue(composition.name as string, 'XML')}"
        android:supportsRtl="true"
        android:theme="@style/Theme.MaterialComponents.DayNight.NoActionBar">

        <!-- Android XR Glasses metadata -->
        <meta-data android:name="com.google.ar.core" android:value="optional" />

        <activity
            android:name=".${activityName}"
            android:exported="true"
            android:requiredDisplayCategory="xr_projected"
            android:label="${this.escapeStringValue(composition.name as string, 'XML')} AI Glasses">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;
  }

  // ─── Glasses Build Gradle ──────────────────────────────────────────

  /**
   * Generates build.gradle.kts for AI glasses form factor.
   *
   * Includes Jetpack Compose Glimmer and Jetpack Projected dependencies
   * instead of the full SceneCore/Filament stack used in headset mode.
   */
  private generateGlassesBuildGradle(composition: HoloComposition): string {
    return `// Auto-generated by HoloScript AndroidXRCompiler (AI Glasses mode)
// Source: ${this.escapeStringValue(composition.name as string, 'Kotlin')}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "${this.options.packageName}"
    compileSdk = ${this.options.targetSdk}

    defaultConfig {
        applicationId = "${this.options.packageName}"
        minSdk = ${this.options.minSdk}
        targetSdk = ${this.options.targetSdk}
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    // Core
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.0")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.8.0")
    implementation("androidx.activity:activity-compose:1.9.0")

    // Jetpack Compose
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.runtime:runtime")

    // Jetpack Compose Glimmer — AI Glasses UI toolkit
    implementation("androidx.xr.glimmer:glimmer:1.0.0-alpha06")

    // Jetpack Projected — AI Glasses hardware access
    implementation("androidx.xr.projected:projected:1.0.0-alpha04")

    // Android XR Runtime
    implementation("androidx.xr.runtime:runtime:1.0.0-alpha11")
    implementation("androidx.xr:xr:1.0.0-alpha01")

    // ARCore for Jetpack XR (motion tracking + geospatial on glasses)
    implementation("androidx.xr.arcore:arcore:1.0.0-alpha10")

    // CameraX (for glasses camera via ProjectedContext)
    implementation("androidx.camera:camera-core:1.4.0")
    implementation("androidx.camera:camera-camera2:1.4.0")
    implementation("androidx.camera:camera-lifecycle:1.4.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
}`;
  }

  // ─── Glimmer Components File ──────────────────────────────────────

  /**
   * Generates a dedicated Glimmer components file with reusable composables
   * for the AI glasses experience.
   *
   * This file contains:
   * - GlimmerOverlay: Root overlay composable for AR content
   * - GlimmerInfoCard: Object information card
   * - GlimmerActionButton: Touchpad-friendly action button
   * - ProjectedCameraPreview: Camera integration via ProjectedContext
   */
  private generateGlimmerComponentsFile(composition: HoloComposition): string {
    this.lines = [];
    this.indentLevel = 0;

    const pkg = this.options.packageName;
    const name = this.sanitizeName(composition.name);

    this.emit('// Auto-generated by HoloScript AndroidXRCompiler (AI Glasses mode)');
    this.emit(
      `// Glimmer Components: ${this.escapeStringValue(composition.name as string, 'Kotlin')}`
    );
    this.emit('');
    this.emit(`package ${pkg}`);
    this.emit('');
    this.emit('import androidx.compose.runtime.*');
    this.emit('import androidx.compose.foundation.layout.*');
    this.emit('import androidx.compose.ui.Alignment');
    this.emit('import androidx.compose.ui.Modifier');
    this.emit('import androidx.compose.ui.unit.dp');
    this.emit('');
    this.emit('import androidx.xr.glimmer.GlimmerTheme');
    this.emit('import androidx.xr.glimmer.Card');
    this.emit('import androidx.xr.glimmer.Button');
    this.emit('import androidx.xr.glimmer.Text');
    this.emit('import androidx.xr.glimmer.ListItem');
    this.emit('import androidx.xr.glimmer.TitleChip');
    this.emit('import androidx.xr.glimmer.surface');
    this.emit('');
    this.emit('import androidx.xr.projected.ProjectedContext');
    this.emit('');

    // GlimmerOverlay — root overlay composable
    this.emit('/**');
    this.emit(' * Root overlay composable for the AI glasses AR experience.');
    this.emit(' * Wraps content in GlimmerTheme with glasses-optimized styling.');
    this.emit(' */');
    this.emit('@Composable');
    this.emit(`fun ${name}GlimmerOverlay(`);
    this.indent();
    this.emit('isVisualUiSupported: Boolean,');
    this.emit('content: @Composable () -> Unit');
    this.dedent();
    this.emit(') {');
    this.indent();
    this.emit('GlimmerTheme {');
    this.indent();
    this.emit('Box(');
    this.indent();
    this.emit('modifier = Modifier');
    this.indent();
    this.emit('.surface(focusable = false)');
    this.emit('.fillMaxSize(),');
    this.dedent();
    this.emit('contentAlignment = Alignment.Center');
    this.dedent();
    this.emit(') {');
    this.indent();
    this.emit('if (isVisualUiSupported) {');
    this.indent();
    this.emit('content()');
    this.dedent();
    this.emit('} else {');
    this.indent();
    this.emit('Text("Audio Guidance Mode Active")');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.emit('');

    // GlimmerInfoCard — reusable object card
    this.emit('/**');
    this.emit(' * Glimmer info card for displaying object details in AR overlay.');
    this.emit(' * Optimized for optical see-through display with high contrast.');
    this.emit(' */');
    this.emit('@Composable');
    this.emit('fun GlimmerInfoCard(');
    this.indent();
    this.emit('title: String,');
    this.emit('subtitle: String = "",');
    this.emit('onAction: (() -> Unit)? = null,');
    this.emit('actionLabel: String = "View"');
    this.dedent();
    this.emit(') {');
    this.indent();
    this.emit('Card(');
    this.indent();
    this.emit('title = { Text(title) },');
    this.emit('action = onAction?.let { action ->');
    this.indent();
    this.emit('{');
    this.indent();
    this.emit('Button(onClick = action) {');
    this.indent();
    this.emit('Text(actionLabel)');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit(') {');
    this.indent();
    this.emit('if (subtitle.isNotEmpty()) {');
    this.indent();
    this.emit('Text(subtitle)');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.emit('');

    // GlimmerActionButton — touchpad-friendly action
    this.emit('/**');
    this.emit(' * Touchpad-friendly action button for AI glasses input.');
    this.emit(' * Pre-sized for comfortable touchpad tap targeting.');
    this.emit(' */');
    this.emit('@Composable');
    this.emit('fun GlimmerActionButton(');
    this.indent();
    this.emit('label: String,');
    this.emit('onClick: () -> Unit,');
    this.emit('modifier: Modifier = Modifier');
    this.dedent();
    this.emit(') {');
    this.indent();
    this.emit('Button(');
    this.indent();
    this.emit('onClick = onClick,');
    this.emit('modifier = modifier.fillMaxWidth()');
    this.dedent();
    this.emit(') {');
    this.indent();
    this.emit('Text(label)');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.emit('');

    // ProjectedCameraPreview helper
    this.emit('/**');
    this.emit(' * Accesses the AI glasses camera via ProjectedContext.');
    this.emit(
      " * Uses CameraX with projected device context for the glasses' outward-facing camera."
    );
    this.emit(' */');
    this.emit(
      'fun getGlassesCameraContext(hostContext: android.content.Context): android.content.Context? {'
    );
    this.indent();
    this.emit('return try {');
    this.indent();
    this.emit('ProjectedContext.createProjectedDeviceContext(hostContext)');
    this.dedent();
    this.emit('} catch (e: IllegalStateException) {');
    this.indent();
    this.emit('android.util.Log.w("HoloScript", "AI Glasses not connected: ${e.message}")');
    this.emit('null');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.emit('');

    // Connection monitor
    this.emit('/**');
    this.emit(' * Monitors AI glasses connection state via Jetpack Projected.');
    this.emit(' * Returns a Flow<Boolean> tracking whether glasses are connected.');
    this.emit(' */');
    this.emit('@Composable');
    this.emit(
      'fun rememberGlassesConnectionState(context: android.content.Context): State<Boolean> {'
    );
    this.indent();
    this.emit('val isConnected = remember { mutableStateOf(false) }');
    this.emit('LaunchedEffect(Unit) {');
    this.indent();
    this.emit(
      'ProjectedContext.isProjectedDeviceConnected(context, coroutineContext).collect { connected ->'
    );
    this.indent();
    this.emit('isConnected.value = connected');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('}');
    this.emit('return isConnected');
    this.dedent();
    this.emit('}');

    return this.lines.join('\n');
  }
}

export function compileToAndroidXR(
  composition: HoloComposition,
  options?: AndroidXRCompilerOptions
): AndroidXRCompileResult {
  const compiler = new AndroidXRCompiler(options);
  return compiler.compile(composition, '');
}
