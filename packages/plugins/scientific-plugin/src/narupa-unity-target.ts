/**
 * Narupa Unity Compilation Target v1.0
 * Extends HoloScript compiler to generate Unity scenes with Narupa integration
 * Generates C# scripts for VR-based molecular dynamics visualization
 */

import { NarupaProcessManager } from './narupa-process-manager';
import { NarupaServerConfig } from './types';

/**
 * Represents a parsed HoloScript object with scientific traits
 */
export interface HoloScriptObject {
  name: string;
  traits: string[];
  properties: Record<string, any>;
  children?: HoloScriptObject[];
}

/**
 * Unity scene generation options
 */
export interface UnityGenerationOptions {
  /** Output directory for generated files */
  outputDir: string;
  /** Scene name */
  sceneName: string;
  /** Namespace for generated C# classes */
  namespace?: string;
  /** Include VR camera rig */
  includeVRRig?: boolean;
  /** Target Unity version */
  unityVersion?: string;
}

/**
 * Narupa Unity Target Compiler
 * Compiles HoloScript .holo files to Unity C# scenes with Narupa integration
 */
export class NarupaUnityTarget {
  private processManager: NarupaProcessManager;
  private generatedClasses: Map<string, string> = new Map();

  constructor(processManager?: NarupaProcessManager) {
    this.processManager = processManager || new NarupaProcessManager();
  }

  /**
   * Compile HoloScript objects to Unity scene
   */
  async compile(
    objects: HoloScriptObject[],
    options: UnityGenerationOptions
  ): Promise<{ scene: string; scripts: Map<string, string> }> {
    const scripts = new Map<string, string>();

    // Generate main scene controller
    const sceneController = this.generateSceneController(objects, options);
    scripts.set('NarupaSceneController.cs', sceneController);

    // Generate individual component scripts
    for (const obj of objects) {
      const componentScripts = this.generateComponentScripts(obj, options);
      componentScripts.forEach((code, name) => scripts.set(name, code));
    }

    // Generate Unity scene file
    const scene = this.generateUnityScene(objects, options);

    return { scene, scripts };
  }

  /**
   * Generate main scene controller C# script
   */
  private generateSceneController(
    objects: HoloScriptObject[],
    options: UnityGenerationOptions
  ): string {
    const namespace = options.namespace || 'HoloScript.Narupa';
    const narupaObjects = objects.filter(
      (obj) =>
        obj.traits.includes('narupa_integration') || obj.traits.includes('molecular_dynamics')
    );

    return `using UnityEngine;
using System.Collections;
using System.Collections.Generic;
using Nanover.Frontend.Unity;
using Nanover.Core;

namespace ${namespace}
{
    /// <summary>
    /// Scene controller for ${options.sceneName}
    /// Generated from HoloScript by Narupa Unity Target
    /// </summary>
    public class NarupaSceneController : MonoBehaviour
    {
        [Header("Narupa Configuration")]
        public string serverHost = "localhost";
        public int basePort = 38801;

        [Header("Scene Objects")]
${narupaObjects.map((obj, _i) => `        public GameObject ${this.sanitizeName(obj.name)}Object;`).join('\n')}

        private List<NanovarImdClient> activeClients = new List<NanovarImdClient>();

        void Start()
        {
            StartCoroutine(InitializeNarupaConnections());
        }

        IEnumerator InitializeNarupaConnections()
        {
            // Wait for Narupa servers to start
            yield return new WaitForSeconds(2.0f);

${narupaObjects
  .map((obj, i) => {
    const port = this.extractPort(obj) || `basePort + ${i}`;
    const varName = this.sanitizeName(obj.name);
    return `
            // Connect ${obj.name}
            if (${varName}Object != null)
            {
                var client${i} = ${varName}Object.AddComponent<NanovarImdClient>();
                client${i}.Address = serverHost;
                client${i}.Port = ${port};
                client${i}.Connect();
                activeClients.Add(client${i});
                Debug.Log("Connected to Narupa server at " + serverHost + ":" + ${port});
            }`;
  })
  .join('\n')}
        }

        void OnDestroy()
        {
            // Cleanup connections
            foreach (var client in activeClients)
            {
                if (client != null && client.IsConnected)
                {
                    client.Disconnect();
                }
            }
        }

        /// <summary>
        /// Get client for a specific object
        /// </summary>
        public NanovarImdClient GetClient(string objectName)
        {
            switch (objectName)
            {
${narupaObjects
  .map(
    (obj, _i) => `                case "${obj.name}":
                    return ${this.sanitizeName(obj.name)}Object?.GetComponent<NanovarImdClient>();`
  )
  .join('\n')}
                default:
                    return null;
            }
        }
    }
}
`;
  }

  /**
   * Generate component scripts for individual objects
   */
  private generateComponentScripts(
    obj: HoloScriptObject,
    options: UnityGenerationOptions
  ): Map<string, string> {
    const scripts = new Map<string, string>();
    const namespace = options.namespace || 'HoloScript.Narupa';

    // Generate molecular visualization component
    if (
      obj.traits.includes('protein_visualization') ||
      obj.traits.includes('ligand_visualization')
    ) {
      const className = `${this.sanitizeName(obj.name)}Visualizer`;
      const script = this.generateVisualizerScript(obj, className, namespace);
      scripts.set(`${className}.cs`, script);
    }

    // Generate interaction component
    if (obj.traits.includes('interactive_forces')) {
      const className = `${this.sanitizeName(obj.name)}Interactor`;
      const script = this.generateInteractorScript(obj, className, namespace);
      scripts.set(`${className}.cs`, script);
    }

    // Generate trajectory playback component
    if (obj.traits.includes('trajectory_playback')) {
      const className = `${this.sanitizeName(obj.name)}TrajectoryPlayer`;
      const script = this.generateTrajectoryPlayerScript(obj, className, namespace);
      scripts.set(`${className}.cs`, script);
    }

    return scripts;
  }

  /**
   * Generate molecular visualizer component
   */
  private generateVisualizerScript(
    obj: HoloScriptObject,
    className: string,
    namespace: string
  ): string {
    const renderMode = obj.properties.render_mode || 'ball_and_stick';
    const colorScheme = obj.properties.color_scheme || 'element';

    return `using UnityEngine;
using Nanover.Frontend.Unity;
using Nanover.Visualisation;

namespace ${namespace}
{
    /// <summary>
    /// Molecular visualizer for ${obj.name}
    /// </summary>
    public class ${className} : MonoBehaviour
    {
        [Header("Visualization Settings")]
        public RenderMode renderMode = RenderMode.${this.toPascalCase(renderMode)};
        public ColorScheme colorScheme = ColorScheme.${this.toPascalCase(colorScheme)};

        private MolecularRenderer molecularRenderer;
        private NanovarImdClient client;

        void Start()
        {
            client = GetComponent<NanovarImdClient>();
            molecularRenderer = gameObject.AddComponent<MolecularRenderer>();
            molecularRenderer.SetRenderMode(renderMode);
            molecularRenderer.SetColorScheme(colorScheme);

            if (client != null)
            {
                client.OnFrameReceived += OnMolecularFrameReceived;
            }
        }

        void OnMolecularFrameReceived(FrameData frame)
        {
            if (molecularRenderer != null)
            {
                molecularRenderer.UpdateFrame(frame);
            }
        }

        void OnDestroy()
        {
            if (client != null)
            {
                client.OnFrameReceived -= OnMolecularFrameReceived;
            }
        }

        public enum RenderMode
        {
            BallAndStick,
            SpaceFilling,
            Ribbon,
            Surface,
            Wireframe
        }

        public enum ColorScheme
        {
            Element,
            Residue,
            Chain,
            BFactor,
            Charge
        }
    }
}
`;
  }

  /**
   * Generate VR interaction component
   */
  private generateInteractorScript(
    obj: HoloScriptObject,
    className: string,
    namespace: string
  ): string {
    const forceScale = obj.properties.force_scale || 1.0;

    return `using UnityEngine;
using Nanover.Frontend.Unity;
using Nanover.Core.Science;

namespace ${namespace}
{
    /// <summary>
    /// VR interaction controller for ${obj.name}
    /// </summary>
    public class ${className} : MonoBehaviour
    {
        [Header("Interaction Settings")]
        public float forceScale = ${forceScale}f;
        public float interactionRadius = 0.5f;

        private NanovarImdClient client;
        private Transform leftController;
        private Transform rightController;

        void Start()
        {
            client = GetComponent<NanovarImdClient>();

            // Find VR controllers (assuming OpenXR or similar)
            leftController = GameObject.Find("LeftHand Controller")?.transform;
            rightController = GameObject.Find("RightHand Controller")?.transform;
        }

        void Update()
        {
            if (client == null || !client.IsConnected)
                return;

            ApplyControllerForces(leftController);
            ApplyControllerForces(rightController);
        }

        void ApplyControllerForces(Transform controller)
        {
            if (controller == null)
                return;

            Vector3 position = controller.position;
            Vector3 velocity = controller.GetComponent<Rigidbody>()?.velocity ?? Vector3.zero;

            // Find nearby atoms and apply forces
            var nearbyAtoms = client.GetAtomsInRadius(position, interactionRadius);
            foreach (var atom in nearbyAtoms)
            {
                Vector3 force = velocity * forceScale;
                client.ApplyForce(atom.Index, force);
            }
        }
    }
}
`;
  }

  /**
   * Generate trajectory playback component
   */
  private generateTrajectoryPlayerScript(
    obj: HoloScriptObject,
    className: string,
    namespace: string
  ): string {
    return `using UnityEngine;
using Nanover.Frontend.Unity;

namespace ${namespace}
{
    /// <summary>
    /// Trajectory playback controller for ${obj.name}
    /// </summary>
    public class ${className} : MonoBehaviour
    {
        [Header("Playback Settings")]
        public bool autoPlay = true;
        public float playbackSpeed = 1.0f;
        public bool loop = true;

        private NanovarImdClient client;
        private int currentFrame = 0;
        private int totalFrames = 0;
        private float timer = 0f;

        void Start()
        {
            client = GetComponent<NanovarImdClient>();
            if (client != null)
            {
                client.OnTrajectoryLoaded += OnTrajectoryLoaded;
            }
        }

        void Update()
        {
            if (!autoPlay || client == null || totalFrames == 0)
                return;

            timer += Time.deltaTime * playbackSpeed;

            if (timer >= 1.0f / 30.0f) // 30 FPS playback
            {
                timer = 0f;
                AdvanceFrame();
            }
        }

        void AdvanceFrame()
        {
            currentFrame++;

            if (currentFrame >= totalFrames)
            {
                if (loop)
                {
                    currentFrame = 0;
                }
                else
                {
                    autoPlay = false;
                    return;
                }
            }

            client.SeekToFrame(currentFrame);
        }

        void OnTrajectoryLoaded(int frameCount)
        {
            totalFrames = frameCount;
            Debug.Log($"Loaded trajectory with {frameCount} frames");
        }

        public void Play()
        {
            autoPlay = true;
        }

        public void Pause()
        {
            autoPlay = false;
        }

        public void Stop()
        {
            autoPlay = false;
            currentFrame = 0;
            client?.SeekToFrame(0);
        }

        public void SetFrame(int frame)
        {
            currentFrame = Mathf.Clamp(frame, 0, totalFrames - 1);
            client?.SeekToFrame(currentFrame);
        }
    }
}
`;
  }

  /**
   * Generate Unity scene file (.unity format)
   */
  private generateUnityScene(objects: HoloScriptObject[], _options: UnityGenerationOptions): string {
    // Simplified Unity scene YAML
    const sceneObjects = objects.map((obj, i) => this.generateSceneObject(obj, i + 1));

    return `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_OcclusionBakeSettings:
    smallestOccluder: 5
    smallestHole: 0.25
    backfaceThreshold: 100
  m_SceneGUID: 00000000000000000000000000000000
  m_OcclusionCullingData: {fileID: 0}
--- !u!104 &2
RenderSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 9
  m_Fog: 0
  m_FogColor: {r: 0.5, g: 0.5, b: 0.5, a: 1}
  m_FogMode: 3
  m_FogDensity: 0.01
  m_LinearFogStart: 0
  m_LinearFogEnd: 300
  m_AmbientSkyColor: {r: 0.212, g: 0.227, b: 0.259, a: 1}
  m_AmbientEquatorColor: {r: 0.114, g: 0.125, b: 0.134, a: 1}
  m_AmbientGroundColor: {r: 0.047, g: 0.043, b: 0.035, a: 1}
  m_AmbientIntensity: 1
  m_AmbientMode: 0
  m_SubtractiveShadowColor: {r: 0.42, g: 0.478, b: 0.627, a: 1}
  m_SkyboxMaterial: {fileID: 10304, guid: 0000000000000000f000000000000000, type: 0}
--- !u!1 &100
GameObject:
  m_ObjectHideFlags: 0
  m_PrefabParentObject: {fileID: 0}
  m_PrefabInternal: {fileID: 0}
  serializedVersion: 5
  m_Component:
  - component: {fileID: 101}
  - component: {fileID: 102}
  m_Layer: 0
  m_Name: NarupaSceneController
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &101
Transform:
  m_ObjectHideFlags: 0
  m_PrefabParentObject: {fileID: 0}
  m_PrefabInternal: {fileID: 0}
  m_GameObject: {fileID: 100}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_Children: []
  m_Father: {fileID: 0}
  m_RootOrder: 0
--- !u!114 &102
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_PrefabParentObject: {fileID: 0}
  m_PrefabInternal: {fileID: 0}
  m_GameObject: {fileID: 100}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: ${this.generateGUID()}, type: 3}
  m_Name:
  m_EditorClassIdentifier:
${sceneObjects.join('\n')}
`;
  }

  /**
   * Generate Unity scene object entry
   */
  private generateSceneObject(obj: HoloScriptObject, index: number): string {
    const position = obj.properties.position || [0, 0, 0];
    const rotation = obj.properties.rotation || [0, 0, 0];
    const scale = obj.properties.scale || [1, 1, 1];

    return `--- !u!1 &${100 + index * 10}
GameObject:
  m_ObjectHideFlags: 0
  m_Name: ${obj.name}
  m_TagString: Untagged
  m_Layer: 0
  m_IsActive: 1
--- !u!4 &${101 + index * 10}
Transform:
  m_LocalPosition: {x: ${position[0]}, y: ${position[1]}, z: ${position[2]}}
  m_LocalRotation: {x: ${rotation[0]}, y: ${rotation[1]}, z: ${rotation[2]}, w: 1}
  m_LocalScale: {x: ${scale[0]}, y: ${scale[1]}, z: ${scale[2]}}`;
  }

  /**
   * Utility: Sanitize name for C# identifier
   */
  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  }

  /**
   * Utility: Convert to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Utility: Extract port from object properties
   */
  private extractPort(obj: HoloScriptObject): number | null {
    return obj.properties.server_port || obj.properties.port || null;
  }

  /**
   * Utility: Generate Unity GUID
   */
  private generateGUID(): string {
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    return `${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}`;
  }
}
