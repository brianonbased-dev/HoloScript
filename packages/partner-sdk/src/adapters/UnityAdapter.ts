/**
 * Unity Export Adapter
 *
 * Generates C# scripts and Unity prefabs from HoloScript scenes.
 */

import type { SceneGraph, SceneNode } from '../runtime/types.js';

// ============================================================================
// Types
// ============================================================================

export interface UnityExportConfig {
  /** Target Unity version */
  unityVersion: '2021' | '2022' | '2023';
  /** Render pipeline */
  renderPipeline: 'builtin' | 'urp' | 'hdrp';
  /** Include XR support */
  xrSupport?: boolean;
  /** Physics backend */
  physicsBackend?: 'physx' | 'havok';
  /** Output directory */
  outputDir: string;
  /** Namespace for generated scripts */
  namespace?: string;
}

export interface UnityExportResult {
  /** Generated C# script files */
  scripts: GeneratedFile[];
  /** Prefab definitions (JSON) */
  prefabs: GeneratedFile[];
  /** Scene definition */
  scene: GeneratedFile;
  /** Assembly definition */
  asmdef: GeneratedFile;
  /** Package manifest */
  packageJson: GeneratedFile;
}

export interface GeneratedFile {
  path: string;
  content: string;
  type: 'csharp' | 'prefab' | 'scene' | 'asmdef' | 'json';
}

// ============================================================================
// Unity Export Adapter
// ============================================================================

export class UnityExportAdapter {
  private config: UnityExportConfig;

  constructor(config: UnityExportConfig) {
    this.config = {
      namespace: 'HoloScript.Generated',
      xrSupport: false,
      physicsBackend: 'physx',
      ...config,
    };
  }

  /**
   * Export scene graph to Unity assets
   */
  export(scene: SceneGraph): UnityExportResult {
    const scripts: GeneratedFile[] = [];
    const prefabs: GeneratedFile[] = [];

    // Generate scripts and prefabs for each object
    for (const node of scene.objects) {
      const script = this.generateScript(node);
      scripts.push(script);

      const prefab = this.generatePrefab(node);
      prefabs.push(prefab);
    }

    // Generate scene file
    const sceneFile = this.generateScene(scene);

    // Generate assembly definition
    const asmdef = this.generateAsmdef();

    // Generate package.json
    const packageJson = this.generatePackageJson();

    return {
      scripts,
      prefabs,
      scene: sceneFile,
      asmdef,
      packageJson,
    };
  }

  // --------------------------------
  // Script Generation
  // --------------------------------

  private generateScript(node: SceneNode): GeneratedFile {
    const className = this.toPascalCase(node.name);
    const traits = this.mapTraitsToComponents(node.traits);

    const content = `using UnityEngine;
${this.config.xrSupport ? 'using UnityEngine.XR.Interaction.Toolkit;' : ''}
using System.Collections;

namespace ${this.config.namespace}
{
    /// <summary>
    /// Generated from HoloScript object: ${node.name}
    /// </summary>
${traits.map((t) => `    [RequireComponent(typeof(${t}))]`).join('\n')}
    public class ${className} : MonoBehaviour
    {
        [Header("HoloScript Properties")]
${this.generatePropertyFields(node.properties)}

        private void Awake()
        {
            Initialize();
        }

        private void Initialize()
        {
            // Apply initial properties
            transform.position = new Vector3(${node.position.join(', ')});
            transform.eulerAngles = new Vector3(${node.rotation.join(', ')});
            transform.localScale = ${typeof node.scale === 'number' ? `Vector3.one * ${node.scale}f` : `new Vector3(${node.scale.join(', ')})`};
${this.generatePropertyInitialization(node.properties)}
        }

${this.generateTraitMethods(node.traits)}
    }
}
`;

    return {
      path: `${this.config.outputDir}/Scripts/${className}.cs`,
      content,
      type: 'csharp',
    };
  }

  private generatePropertyFields(properties: Record<string, unknown>): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(properties)) {
      const fieldName = this.toCamelCase(key);
      const fieldType = this.getCSharpType(value);
      const defaultValue = this.getCSharpValue(value);

      lines.push(`        [SerializeField] private ${fieldType} ${fieldName} = ${defaultValue};`);
    }

    return lines.join('\n');
  }

  private generatePropertyInitialization(properties: Record<string, unknown>): string {
    const lines: string[] = [];

    for (const key of Object.keys(properties)) {
      const fieldName = this.toCamelCase(key);
      // Properties are already set via serialization
      lines.push(`            // ${fieldName} applied from inspector`);
    }

    return lines.join('\n');
  }

  private generateTraitMethods(traits: string[]): string {
    const methods: string[] = [];

    if (traits.includes('@grabbable')) {
      methods.push(`
        #region Grabbable
        public void OnGrab()
        {
            // Called when object is grabbed
            Debug.Log($"{name} grabbed");
        }

        public void OnRelease()
        {
            // Called when object is released
            Debug.Log($"{name} released");
        }
        #endregion`);
    }

    if (traits.includes('@collidable')) {
      methods.push(`
        #region Collidable
        private void OnCollisionEnter(Collision collision)
        {
            // Handle collision
            Debug.Log($"{name} collided with {collision.gameObject.name}");
        }

        private void OnTriggerEnter(Collider other)
        {
            // Handle trigger
            Debug.Log($"{name} triggered by {other.gameObject.name}");
        }
        #endregion`);
    }

    if (traits.includes('@pointable')) {
      methods.push(`
        #region Pointable
        public void OnPointerEnter()
        {
            // Called when pointer enters
        }

        public void OnPointerExit()
        {
            // Called when pointer exits
        }

        public void OnPointerClick()
        {
            // Called when pointed at and clicked
        }
        #endregion`);
    }

    return methods.join('\n');
  }

  // --------------------------------
  // Prefab Generation
  // --------------------------------

  private generatePrefab(node: SceneNode): GeneratedFile {
    const className = this.toPascalCase(node.name);

    const prefabData = {
      name: node.name,
      components: [
        { type: 'Transform', position: node.position, rotation: node.rotation, scale: node.scale },
        { type: this.mapGeometryToMesh(node.type) },
        { type: 'MeshRenderer' },
        { type: className },
        ...this.mapTraitsToComponents(node.traits).map((t) => ({ type: t })),
      ],
    };

    return {
      path: `${this.config.outputDir}/Prefabs/${node.name}.prefab.json`,
      content: JSON.stringify(prefabData, null, 2),
      type: 'prefab',
    };
  }

  // --------------------------------
  // Scene Generation
  // --------------------------------

  private generateScene(scene: SceneGraph): GeneratedFile {
    const sceneData = {
      name: scene.name,
      renderSettings: {
        skybox: scene.environment.skybox,
        ambientIntensity: scene.environment.ambientLight,
        fog: scene.environment.fog,
      },
      physics: {
        gravity: scene.environment.gravity
          ? [scene.environment.gravity.x, scene.environment.gravity.y, scene.environment.gravity.z]
          : [0, -9.81, 0],
      },
      objects: scene.objects.map((node) => ({
        prefab: `Prefabs/${node.name}`,
        position: node.position,
        rotation: node.rotation,
        scale: node.scale,
      })),
    };

    return {
      path: `${this.config.outputDir}/Scenes/${scene.name}.unity.json`,
      content: JSON.stringify(sceneData, null, 2),
      type: 'scene',
    };
  }

  // --------------------------------
  // Assembly Definition
  // --------------------------------

  private generateAsmdef(): GeneratedFile {
    const asmdef = {
      name: this.config.namespace,
      references: [
        'GUID:a0b2aec0b14c4c47b7ded37e49ac8c6d', // Unity.XR.CoreUtils
        ...(this.config.xrSupport
          ? ['GUID:784e32b5b7f28f04e9ab828f84b4abf4'] // Unity.XR.Interaction.Toolkit
          : []),
      ],
      includePlatforms: [],
      excludePlatforms: [],
      allowUnsafeCode: false,
      overrideReferences: false,
      precompiledReferences: [],
      autoReferenced: true,
      defineConstraints: [],
      versionDefines: [],
      noEngineReferences: false,
    };

    return {
      path: `${this.config.outputDir}/${this.config.namespace}.asmdef`,
      content: JSON.stringify(asmdef, null, 2),
      type: 'asmdef',
    };
  }

  // --------------------------------
  // Package Manifest
  // --------------------------------

  private generatePackageJson(): GeneratedFile {
    const pkg = {
      name: `com.holoscript.generated`,
      version: '1.0.0',
      displayName: 'HoloScript Generated',
      description: 'Auto-generated Unity package from HoloScript',
      unity: this.config.unityVersion === '2023' ? '2023.1' : `${this.config.unityVersion}.3`,
      dependencies: {
        ...(this.config.xrSupport && {
          'com.unity.xr.interaction.toolkit': '2.5.2',
        }),
      },
    };

    return {
      path: `${this.config.outputDir}/package.json`,
      content: JSON.stringify(pkg, null, 2),
      type: 'json',
    };
  }

  // --------------------------------
  // Helpers
  // --------------------------------

  private mapTraitsToComponents(traits: string[]): string[] {
    const components: string[] = [];

    for (const trait of traits) {
      switch (trait) {
        case '@grabbable':
          components.push(this.config.xrSupport ? 'XRGrabInteractable' : 'Rigidbody');
          break;
        case '@collidable':
          components.push('Collider');
          components.push('Rigidbody');
          break;
        case '@physics':
          components.push('Rigidbody');
          break;
        case '@networked':
          components.push('NetworkObject');
          break;
        case '@spatial_audio':
          components.push('AudioSource');
          break;
      }
    }

    return [...new Set(components)];
  }

  private mapGeometryToMesh(type: string): string {
    const meshMap: Record<string, string> = {
      cube: 'MeshFilter:Cube',
      sphere: 'MeshFilter:Sphere',
      cylinder: 'MeshFilter:Cylinder',
      capsule: 'MeshFilter:Capsule',
      plane: 'MeshFilter:Plane',
    };
    return meshMap[type] || 'MeshFilter';
  }

  private getCSharpType(value: unknown): string {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'int' : 'float';
    }
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'bool';
    if (Array.isArray(value)) {
      if (value.length === 3) return 'Vector3';
      if (value.length === 4) return 'Vector4';
      return 'float[]';
    }
    return 'object';
  }

  private getCSharpValue(value: unknown): string {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? String(value) : `${value}f`;
    }
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      if (value.length === 3) return `new Vector3(${value.join('f, ')}f)`;
      return `new float[] { ${value.join('f, ')}f }`;
    }
    return 'null';
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (c) => c.toUpperCase());
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (c) => c.toLowerCase());
  }
}

/**
 * Create Unity export adapter
 */
export function createUnityAdapter(config: UnityExportConfig): UnityExportAdapter {
  return new UnityExportAdapter(config);
}
