/**
 * Android XR Export Target Compiler
 *
 * Compiles HoloScript compositions to Android XR SDK-compatible packages
 * using the Jetpack XR library, Scene Core API, and ARCore extensions.
 *
 * Output: Android XR project structure with:
 * - SpatialEnvironment configurations
 * - Jetpack Compose XR spatial panels
 * - ARCore Geospatial anchors
 * - Scene Core entity definitions
 * - glTF/GLB asset manifests
 *
 * @version 1.0.0
 * @see https://developer.android.com/develop/xr
 */

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Android XR compilation configuration.
 */
export interface AndroidXRConfig {
  /** Target Android API level (default: 35 for Android XR) */
  minApiLevel?: number;
  /** Jetpack XR version */
  jetpackXRVersion?: string;
  /** Enable passthrough mode support */
  enablePassthrough?: boolean;
  /** Enable hand tracking */
  enableHandTracking?: boolean;
  /** Enable spatial audio */
  enableSpatialAudio?: boolean;
  /** Maximum spatial entity count */
  maxEntities?: number;
  /** Output path for generated Kotlin files */
  outputPath?: string;
  /** Package name for generated code */
  packageName?: string;
}

/**
 * A spatial entity definition for Android XR Scene Core.
 */
export interface XRSpatialEntity {
  /** Entity name */
  name: string;
  /** Entity type */
  type: 'panel' | 'orb' | 'model' | 'anchor' | 'volume' | 'environment';
  /** Position in meters [x, y, z] */
  position: [number, number, number];
  /** Rotation in quaternion [x, y, z, w] */
  rotation: [number, number, number, number];
  /** Scale factors [x, y, z] */
  scale: [number, number, number];
  /** glTF model path (for model entities) */
  modelPath?: string;
  /** Panel URL or content (for panel entities) */
  panelContent?: string;
  /** Traits applied to this entity */
  traits: string[];
  /** Custom properties from composition */
  properties: Record<string, unknown>;
}

/**
 * Compilation result for Android XR target.
 */
export interface AndroidXRCompilationResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** Generated Kotlin source files */
  files: Map<string, string>;
  /** Asset manifest */
  assets: Array<{ path: string; type: string; size?: number }>;
  /** Spatial entities */
  entities: XRSpatialEntity[];
  /** Warnings emitted during compilation */
  warnings: string[];
  /** Errors (if success is false) */
  errors: string[];
  /** Android manifest additions needed */
  manifestPermissions: string[];
  /** Gradle dependencies to add */
  gradleDependencies: string[];
}

// ── Trait Mapping ──────────────────────────────────────────────────────────

/**
 * Maps HoloScript traits to Android XR SDK components/behaviors.
 */
const TRAIT_TO_ANDROID_XR: Record<string, string> = {
  Grabbable: 'MovableComponent',
  Resizable: 'ResizableComponent',
  Physics: 'PhysicsComponent (via JoltPhysics)',
  Animation: 'AnimatorComponent',
  SpatialAudio: 'SpatialAudioComponent',
  HandTracking: 'HandTrackingComponent',
  Anchor: 'AnchorComponent',
  Passthrough: 'PassthroughComponent',
  GazeTarget: 'GazeInteractionComponent',
  Panel: 'SpatialPanel',
  Volume: 'SpatialVolume',
  Environment: 'SpatialEnvironment',
};

// ── Compiler ───────────────────────────────────────────────────────────────

/**
 * AndroidXRCompiler compiles HoloScript compositions to Android XR SDK packages.
 *
 * Usage:
 * ```typescript
 * const compiler = new AndroidXRCompiler({ packageName: 'com.example.myxrapp' });
 * const result = compiler.compile(composition);
 *
 * for (const [path, content] of result.files) {
 *   writeFile(path, content);
 * }
 * ```
 */
export class AndroidXRCompiler {
  private config: Required<AndroidXRConfig>;

  constructor(config: AndroidXRConfig = {}) {
    this.config = {
      minApiLevel: config.minApiLevel ?? 35,
      jetpackXRVersion: config.jetpackXRVersion ?? '1.0.0-alpha04',
      enablePassthrough: config.enablePassthrough ?? true,
      enableHandTracking: config.enableHandTracking ?? true,
      enableSpatialAudio: config.enableSpatialAudio ?? true,
      maxEntities: config.maxEntities ?? 256,
      outputPath: config.outputPath ?? 'app/src/main/java',
      packageName: config.packageName ?? 'com.holoscript.xr',
    };
  }

  /**
   * Compile a HoloScript composition to Android XR output.
   */
  compile(composition: {
    name: string;
    objects?: Array<{
      name: string;
      type?: string;
      traits?: string[];
      position?: [number, number, number];
      rotation?: [number, number, number, number];
      scale?: [number, number, number];
      model?: string;
      properties?: Record<string, unknown>;
    }>;
    settings?: Record<string, unknown>;
  }): AndroidXRCompilationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const files = new Map<string, string>();
    const assets: Array<{ path: string; type: string; size?: number }> = [];
    const entities: XRSpatialEntity[] = [];
    const manifestPermissions: string[] = [];
    const gradleDependencies: string[] = [];

    // Validate
    if (!composition.name) {
      errors.push('Composition name is required');
      return {
        success: false,
        files,
        assets,
        entities,
        warnings,
        errors,
        manifestPermissions,
        gradleDependencies,
      };
    }

    if ((composition.objects?.length ?? 0) > this.config.maxEntities) {
      warnings.push(
        `Composition has ${composition.objects?.length} entities, exceeding Android XR recommended limit of ${this.config.maxEntities}`
      );
    }

    // Core dependencies
    gradleDependencies.push(
      `implementation("androidx.xr.scenecore:scenecore:${this.config.jetpackXRVersion}")`,
      `implementation("androidx.xr.compose:compose:${this.config.jetpackXRVersion}")`,
      `implementation("androidx.xr.arcore:arcore:${this.config.jetpackXRVersion}")`
    );

    // Manifest permissions
    manifestPermissions.push(
      'android.permission.SCENE_UNDERSTANDING',
      'com.android.permission.XR_CONTENT'
    );

    if (this.config.enableHandTracking) {
      manifestPermissions.push('android.permission.HAND_TRACKING');
      gradleDependencies.push(
        `implementation("androidx.xr.input:input:${this.config.jetpackXRVersion}")`
      );
    }

    if (this.config.enableSpatialAudio) {
      gradleDependencies.push(
        `implementation("androidx.xr.media:media:${this.config.jetpackXRVersion}")`
      );
    }

    // Process objects into entities
    for (const obj of composition.objects ?? []) {
      const entity = this.processObject(obj, warnings);
      entities.push(entity);

      // Track model assets
      if (entity.modelPath) {
        assets.push({ path: entity.modelPath, type: 'model/gltf-binary' });
      }
    }

    // Generate Activity
    const activityCode = this.generateActivity(composition.name, entities);
    const activityPath = `${this.config.outputPath}/${this.config.packageName.replace(/\./g, '/')}/${this.sanitizeName(composition.name)}Activity.kt`;
    files.set(activityPath, activityCode);

    // Generate Scene class
    const sceneCode = this.generateSceneSetup(composition.name, entities);
    const scenePath = `${this.config.outputPath}/${this.config.packageName.replace(/\./g, '/')}/${this.sanitizeName(composition.name)}Scene.kt`;
    files.set(scenePath, sceneCode);

    // Generate entity data class
    const entityDataCode = this.generateEntityData(entities);
    const entityPath = `${this.config.outputPath}/${this.config.packageName.replace(/\./g, '/')}/entities/SpatialEntities.kt`;
    files.set(entityPath, entityDataCode);

    return {
      success: errors.length === 0,
      files,
      assets,
      entities,
      warnings,
      errors,
      manifestPermissions,
      gradleDependencies,
    };
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  private processObject(
    obj: {
      name: string;
      type?: string;
      traits?: string[];
      position?: [number, number, number];
      rotation?: [number, number, number, number];
      scale?: [number, number, number];
      model?: string;
      properties?: Record<string, unknown>;
    },
    warnings: string[]
  ): XRSpatialEntity {
    const entityType = this.mapType(obj.type);

    // Check for unsupported traits
    for (const trait of obj.traits ?? []) {
      if (!TRAIT_TO_ANDROID_XR[trait]) {
        warnings.push(
          `Trait '${trait}' on '${obj.name}' has no Android XR mapping; it will be ignored.`
        );
      }
    }

    return {
      name: obj.name,
      type: entityType,
      position: obj.position ?? [0, 0, 0],
      rotation: obj.rotation ?? [0, 0, 0, 1],
      scale: obj.scale ?? [1, 1, 1],
      modelPath: obj.model,
      traits: obj.traits ?? [],
      properties: obj.properties ?? {},
    };
  }

  private mapType(type?: string): XRSpatialEntity['type'] {
    switch (type?.toLowerCase()) {
      case 'panel':
        return 'panel';
      case 'volume':
        return 'volume';
      case 'environment':
        return 'environment';
      case 'anchor':
        return 'anchor';
      default:
        return 'model';
    }
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '').replace(/^[a-z]/, (c) => c.toUpperCase());
  }

  private generateActivity(compositionName: string, entities: XRSpatialEntity[]): string {
    const className = this.sanitizeName(compositionName);
    const pkg = this.config.packageName;

    return `package ${pkg}

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.xr.compose.spatial.Subspace
import androidx.xr.compose.spatial.SpatialPanel
import androidx.xr.compose.spatial.Volume
import androidx.xr.scenecore.Session as XrSession
import ${pkg}.entities.SpatialEntities

/**
 * ${className}Activity — Auto-generated from HoloScript composition '${compositionName}'
 *
 * Contains ${entities.length} spatial entities compiled from HoloScript.
 * Generated by HoloScript AndroidXRCompiler v1.0.0
 */
class ${className}Activity : ComponentActivity() {

    private lateinit var xrSession: XrSession

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        xrSession = XrSession.create(this)

        setContent {
            Subspace {
${entities
  .filter((e) => e.type === 'panel')
  .map(
    (e) => `                SpatialPanel(
                    SubspaceModifier
                        .offset(${e.position[0]}f, ${e.position[1]}f, ${e.position[2]}f)
                        .width(1.0f)
                        .height(0.75f)
                ) {
                    // Panel: ${e.name}
                    ${className}Scene.${this.sanitizeName(e.name)}Panel()
                }`
  )
  .join('\n')}
${entities
  .filter((e) => e.type === 'volume' || e.type === 'model')
  .map(
    (e) => `                Volume(
                    SubspaceModifier
                        .offset(${e.position[0]}f, ${e.position[1]}f, ${e.position[2]}f)
                        .scale(${e.scale[0]}f, ${e.scale[1]}f, ${e.scale[2]}f)
                ) {
                    // Volume: ${e.name}${e.modelPath ? `\n                    // Model: ${e.modelPath}` : ''}
                }`
  )
  .join('\n')}
            }
        }
    }

    override fun onResume() {
        super.onResume()
        xrSession.resume()
    }

    override fun onPause() {
        super.onPause()
        xrSession.pause()
    }

    override fun onDestroy() {
        super.onDestroy()
        xrSession.destroy()
    }
}
`;
  }

  private generateSceneSetup(compositionName: string, entities: XRSpatialEntity[]): string {
    const className = this.sanitizeName(compositionName);
    const pkg = this.config.packageName;

    return `package ${pkg}

import androidx.compose.runtime.Composable
import androidx.compose.material3.Text
import androidx.compose.material3.MaterialTheme

/**
 * ${className}Scene — Scene setup for Android XR
 *
 * Auto-generated from HoloScript composition '${compositionName}'.
 */
object ${className}Scene {

${entities
  .filter((e) => e.type === 'panel')
  .map(
    (e) => `    @Composable
    fun ${this.sanitizeName(e.name)}Panel() {
        Text(
            text = "${e.name}",
            style = MaterialTheme.typography.titleMedium,
        )
    }`
  )
  .join('\n\n')}

    /**
     * Total entity count: ${entities.length}
     * Panels: ${entities.filter((e) => e.type === 'panel').length}
     * Models: ${entities.filter((e) => e.type === 'model').length}
     * Volumes: ${entities.filter((e) => e.type === 'volume').length}
     */
    val entityCount = ${entities.length}
}
`;
  }

  private generateEntityData(entities: XRSpatialEntity[]): string {
    const pkg = this.config.packageName;

    return `package ${pkg}.entities

/**
 * SpatialEntities — Data definitions for all spatial entities.
 *
 * Auto-generated from HoloScript composition.
 */

data class SpatialEntityDef(
    val name: String,
    val type: String,
    val position: FloatArray,
    val rotation: FloatArray,
    val scale: FloatArray,
    val modelPath: String? = null,
    val traits: List<String> = emptyList(),
)

object SpatialEntities {
    val all: List<SpatialEntityDef> = listOf(
${entities
  .map(
    (e) => `        SpatialEntityDef(
            name = "${e.name}",
            type = "${e.type}",
            position = floatArrayOf(${e.position.join('f, ')}f),
            rotation = floatArrayOf(${e.rotation.join('f, ')}f),
            scale = floatArrayOf(${e.scale.join('f, ')}f),
            modelPath = ${e.modelPath ? `"${e.modelPath}"` : 'null'},
            traits = listOf(${e.traits.map((t) => `"${t}"`).join(', ')}),
        )`
  )
  .join(',\n')}
    )
}
`;
  }
}
