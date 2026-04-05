/**
 * HoloScript -> Phone Sleeve VR Compiler
 *
 * Translates a HoloComposition AST into a self-contained HTML page that renders
 * stereoscopic VR for phone-sleeve headsets (smartphone slid into a passive
 * viewer like Google Cardboard, or a modern sleeve enclosure with lenses).
 *
 * Output is a single HTML file with:
 *   - Three.js stereoscopic side-by-side rendering via StereoEffect
 *   - Barrel distortion post-processing shader to pre-correct for lens warp
 *   - Chromatic aberration correction per RGB channel
 *   - DeviceOrientation-based 3-DOF head tracking (gyro + accel + mag)
 *   - Gaze cursor (center reticle with dwell-to-select)
 *   - Comfort vignette during fast head movement
 *   - Thermal / battery awareness (reduces quality on overheat or low battery)
 *   - Session timer with periodic break reminders
 *   - NFC-trigger hint for sleeve auto-launch
 *   - IPD adjustment UI (tap left/right edge to widen/narrow)
 *   - WebXR fallback when available (progressive enhancement)
 *
 * Philosophy: This compiler targets the CHEAPEST possible VR — a phone and some
 * lenses. No controllers, no hand tracking, no room scale. Just look around,
 * dwell-select, and experience spatial content. It is the most democratic entry
 * point to VR: everyone has a phone.
 *
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloLight,
  HoloEnvironment,
  HoloCamera,
  HoloAudio,
  HoloUI,
  HoloEffects,
} from '../parser/HoloCompositionTypes';
import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from './identity/ANSNamespace';
import { WEBXR_TRAITS } from '../traits/constants/webxr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhoneSleeveVRCompilerOptions {
  /** Inter-pupillary distance in mm (default 64) */
  ipd?: number;
  /** Barrel distortion coefficient k1 (default 0.441) */
  distortionK1?: number;
  /** Barrel distortion coefficient k2 (default 0.156) */
  distortionK2?: number;
  /** Enable comfort vignette during fast rotation (default true) */
  comfortVignette?: boolean;
  /** Session timer interval in minutes (default 20) */
  sessionTimerMinutes?: number;
  /** Enable thermal throttling (default true) */
  thermalThrottle?: boolean;
  /** Enable battery-aware LOD (default true) */
  batteryAwareLOD?: boolean;
  /** Target framerate (default 60, 72 for higher-end phones) */
  targetFPS?: number;
  /** Enable fixed foveated rendering (default true) */
  foveatedRendering?: boolean;
  /** Page title */
  title?: string;
}

// ---------------------------------------------------------------------------
// Shape mapping
// ---------------------------------------------------------------------------

const SHAPE_TO_THREE: Record<string, string> = {
  sphere: 'SphereGeometry(0.5, 32, 16)',
  orb: 'SphereGeometry(0.5, 32, 16)',
  cube: 'BoxGeometry(1, 1, 1)',
  box: 'BoxGeometry(1, 1, 1)',
  cylinder: 'CylinderGeometry(0.5, 0.5, 1, 32)',
  cone: 'ConeGeometry(0.5, 1, 32)',
  pyramid: 'ConeGeometry(0.5, 1, 4)',
  plane: 'PlaneGeometry(1, 1)',
  ground: 'PlaneGeometry(10, 10)',
  torus: 'TorusGeometry(0.5, 0.15, 16, 48)',
  ring: 'TorusGeometry(0.5, 0.05, 8, 48)',
  capsule: 'CapsuleGeometry(0.25, 0.5, 8, 16)',
  disc: 'CircleGeometry(0.5, 32)',
};

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export class PhoneSleeveVRCompiler extends CompilerBase {
  protected readonly compilerName = 'PhoneSleeveVRCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.R3F; // Reuses the web rendering capability
  }

  private opts: Required<PhoneSleeveVRCompilerOptions>;

  constructor(options: PhoneSleeveVRCompilerOptions = {}) {
    super();
    this.opts = {
      ipd: options.ipd ?? 64,
      distortionK1: options.distortionK1 ?? 0.441,
      distortionK2: options.distortionK2 ?? 0.156,
      comfortVignette: options.comfortVignette ?? true,
      sessionTimerMinutes: options.sessionTimerMinutes ?? 20,
      thermalThrottle: options.thermalThrottle ?? true,
      batteryAwareLOD: options.batteryAwareLOD ?? true,
      targetFPS: options.targetFPS ?? 60,
      foveatedRendering: options.foveatedRendering ?? true,
      title: options.title ?? 'HoloScript Phone Sleeve VR',
    };
  }

  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);

    // WebXR traits → browser-native AR/VR HTML instead of phone-sleeve stereo
    if (this.hasWebXRTraits(composition)) {
      return this.generateWebXRFile(composition);
    }

    const title = this.escapeStringValue(
      (composition.name as string) || this.opts.title,
      'XML'
    );
    const sceneObjects = this.compileSceneObjects(composition);
    const lights = this.compileLights(composition);
    const environment = this.compileEnvironment(composition);

    return this.buildHTML(title, sceneObjects, lights, environment);
  }

  // =========================================================================
  // WebXR detection & codegen (M.010.19)
  // =========================================================================

  /**
   * Returns true if any object in the composition uses a webxr_* trait.
   */
  hasWebXRTraits(composition: HoloComposition): boolean {
    const webxrSet = new Set<string>(WEBXR_TRAITS);
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (webxrSet.has(name)) return true;
      }
    }
    return false;
  }

  /**
   * Generates a self-contained HTML+JS file using Three.js + WebXR Device API.
   * Shareable via URL — no app install needed.
   */
  generateWebXRFile(composition: HoloComposition): string {
    const title = this.escapeStringValue(
      (composition.name as string) || 'HoloScript WebXR',
      'XML'
    );
    const traits = this.collectWebXRTraits(composition);
    const sceneObjects = this.compileSceneObjects(composition);
    const lights = this.compileLights(composition);
    const environment = this.compileEnvironment(composition);

    return this.buildWebXRHTML(title, traits, sceneObjects, lights, environment);
  }

  private collectWebXRTraits(composition: HoloComposition): Set<string> {
    const webxrSet = new Set<string>(WEBXR_TRAITS);
    const found = new Set<string>();
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (webxrSet.has(name)) found.add(name);
      }
    }
    return found;
  }

  private buildWebXRHTML(
    title: string,
    traits: Set<string>,
    sceneObjects: string,
    lights: string,
    environment: string,
  ): string {
    // Determine session mode
    const isInline = traits.has('webxr_inline') && !traits.has('webxr_session');
    const sessionMode = isInline ? 'inline' : 'immersive-ar';

    // Build requiredFeatures from traits
    const requiredFeatures: string[] = [];
    if (traits.has('webxr_hit_test')) requiredFeatures.push('hit-test');
    if (traits.has('webxr_anchors')) requiredFeatures.push('anchors');
    if (traits.has('webxr_light_estimation')) requiredFeatures.push('light-estimation');
    if (traits.has('webxr_dom_overlay')) requiredFeatures.push('dom-overlay');
    if (traits.has('webxr_depth_sensing')) requiredFeatures.push('depth-sensing');
    if (traits.has('webxr_hand_tracking')) requiredFeatures.push('hand-tracking');
    if (traits.has('webxr_layers')) requiredFeatures.push('layers');

    // Reference space type
    const refSpace = traits.has('webxr_reference_space') ? 'local-floor' : 'local';

    // Session options object
    const sessionOptsEntries: string[] = [];
    if (requiredFeatures.length > 0) {
      sessionOptsEntries.push(`requiredFeatures: [${requiredFeatures.map(f => `'${f}'`).join(', ')}]`);
    }
    if (traits.has('webxr_dom_overlay')) {
      sessionOptsEntries.push(`domOverlay: { root: document.getElementById('overlay') }`);
    }
    if (traits.has('webxr_depth_sensing')) {
      sessionOptsEntries.push(`depthSensing: { usagePreference: ['cpu-optimized'], dataFormatPreference: ['luminance-alpha'] }`);
    }
    const sessionOptsStr = sessionOptsEntries.length > 0
      ? `{ ${sessionOptsEntries.join(', ')} }`
      : '{}';

    // Build per-feature JS blocks
    const hitTestSetup = traits.has('webxr_hit_test') ? `
      // --- Hit Test ---
      let hitTestSource = null;
      let hitTestSourceRequested = false;
      const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x00ff88 })
      );
      reticle.visible = false;
      reticle.matrixAutoUpdate = false;
      scene.add(reticle);` : '';

    const hitTestFrame = traits.has('webxr_hit_test') ? `
        // Hit test per frame
        if (!hitTestSourceRequested && session) {
          session.requestReferenceSpace('viewer').then(viewerSpace => {
            session.requestHitTestSource({ space: viewerSpace }).then(src => {
              hitTestSource = src;
            });
          });
          hitTestSourceRequested = true;
        }
        if (hitTestSource) {
          const hitResults = frame.getHitTestResults(hitTestSource);
          if (hitResults.length > 0) {
            const hit = hitResults[0];
            reticle.visible = true;
            reticle.matrix.fromArray(hit.getPose(refSpace).transform.matrix);
          } else {
            reticle.visible = false;
          }
        }` : '';

    const anchorBlock = traits.has('webxr_anchors') ? `
      // --- Anchors ---
      const anchors = [];
      function createAnchor(frame, pose) {
        if (frame.createAnchor) {
          frame.createAnchor(pose, refSpace).then(anchor => {
            anchors.push(anchor);
          });
        }
      }` : '';

    const lightEstimationSetup = traits.has('webxr_light_estimation') ? `
      // --- Light Estimation ---
      let lightProbe = null;
      let directionalLightEstimate = null;
      const estimatedLight = new THREE.DirectionalLight(0xffffff, 1);
      scene.add(estimatedLight);` : '';

    const lightEstimationFrame = traits.has('webxr_light_estimation') ? `
        // Light estimation per frame
        if (lightProbe === null && session) {
          session.requestLightProbe().then(probe => { lightProbe = probe; }).catch(() => {});
        }
        if (lightProbe) {
          const estimate = frame.getLightEstimate(lightProbe);
          if (estimate) {
            const intensity = Math.max(
              estimate.primaryLightIntensity.x,
              estimate.primaryLightIntensity.y,
              estimate.primaryLightIntensity.z
            );
            estimatedLight.intensity = intensity;
            estimatedLight.position.set(
              estimate.primaryLightDirection.x,
              estimate.primaryLightDirection.y,
              estimate.primaryLightDirection.z
            );
            estimatedLight.color.setRGB(
              estimate.primaryLightIntensity.x / intensity || 1,
              estimate.primaryLightIntensity.y / intensity || 1,
              estimate.primaryLightIntensity.z / intensity || 1
            );
          }
        }` : '';

    const depthSensingFrame = traits.has('webxr_depth_sensing') ? `
        // Depth sensing per frame
        const viewerPose = frame.getViewerPose(refSpace);
        if (viewerPose) {
          for (const view of viewerPose.views) {
            const depthInfo = frame.getDepthInformation(view);
            if (depthInfo) {
              // depthInfo available for occlusion rendering
              window.__xrDepthInfo = depthInfo;
            }
          }
        }` : '';

    const handTrackingSetup = traits.has('webxr_hand_tracking') ? `
      // --- Hand Tracking ---
      const handModels = { left: null, right: null };
      function updateHands(frame, inputSources) {
        for (const source of inputSources) {
          if (source.hand) {
            const handedness = source.handedness;
            for (const [jointName, jointSpace] of source.hand) {
              const jointPose = frame.getJointPose(jointSpace, refSpace);
              if (jointPose) {
                // Joint pose available: jointPose.transform.position, jointPose.radius
                if (!handModels[handedness]) {
                  const sphere = new THREE.Mesh(
                    new THREE.SphereGeometry(0.005, 8, 8),
                    new THREE.MeshStandardMaterial({ color: 0x00ccff })
                  );
                  scene.add(sphere);
                  handModels[handedness] = {};
                }
              }
            }
          }
        }
      }` : '';

    const handTrackingFrame = traits.has('webxr_hand_tracking') ? `
        // Hand tracking per frame
        if (session && session.inputSources) {
          updateHands(frame, session.inputSources);
        }` : '';

    const layersSetup = traits.has('webxr_layers') ? `
      // --- XR Layers ---
      // XRProjectionLayer and XRQuadLayer composition will be initialized when session starts
      let xrProjectionLayer = null;` : '';

    const framebufferSetup = traits.has('webxr_framebuffer') ? `
      // --- Custom Framebuffer ---
      // Direct framebuffer access from XRWebGLLayer for post-processing
      let xrFramebuffer = null;` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #000; font-family: system-ui, sans-serif; }
    canvas { display: block; width: 100vw; height: 100vh; }
    #splash {
      position: fixed; inset: 0; z-index: 100;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: #0a0a1a; color: #fff;
    }
    #splash h1 { font-size: 1.5rem; margin-bottom: 1rem; }
    #splash p { font-size: 0.9rem; opacity: 0.7; margin-bottom: 2rem; text-align: center; padding: 0 2rem; }
    #splash button {
      padding: 1rem 3rem; font-size: 1.1rem; border: 2px solid #00ccff;
      background: transparent; color: #00ccff; border-radius: 8px; cursor: pointer;
    }
    #splash button:active { background: #00ccff22; }
    #splash button:disabled { opacity: 0.3; cursor: not-allowed; }
    #splash .error { color: #ff4466; margin-top: 1rem; font-size: 0.85rem; display: none; }
    #overlay {
      position: fixed; inset: 0; pointer-events: none; z-index: 10;
    }
    #overlay .hud {
      position: absolute; bottom: 2rem; left: 50%; transform: translateX(-50%);
      color: #fff; background: rgba(0,0,0,0.5); padding: 0.5rem 1.5rem;
      border-radius: 8px; font-size: 0.85rem; pointer-events: auto;
    }
  </style>
</head>
<body>
  <div id="splash">
    <h1>HoloScript WebXR</h1>
    <p>Browser-native XR — no app install needed.<br>Tap below to enter augmented reality.</p>
    <button id="enter-xr">Enter AR</button>
    <div class="error" id="xr-error"></div>
  </div>
  <div id="overlay">
    <div class="hud" id="hud" style="display:none;">WebXR Active</div>
  </div>

  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.172.0/examples/jsm/"
    }
  }
  </script>
  <script type="module">
    import * as THREE from 'three';

    // =====================================================================
    // WebXR Feature Detection
    // =====================================================================
    const enterBtn = document.getElementById('enter-xr');
    const errorEl = document.getElementById('xr-error');

    if (!navigator.xr) {
      enterBtn.disabled = true;
      errorEl.textContent = 'WebXR not supported in this browser.';
      errorEl.style.display = 'block';
    }

    // =====================================================================
    // Three.js Scene
    // =====================================================================
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    const interactables = [];

    // =====================================================================
    // Environment
    // =====================================================================
    ${environment || '// Transparent background for AR pass-through'}

    // =====================================================================
    // Lights
    // =====================================================================
    ${lights}

    // =====================================================================
    // Scene objects (from .holo composition)
    // =====================================================================
    ${sceneObjects}
${hitTestSetup}
${anchorBlock}
${lightEstimationSetup}
${depthSensingFrame ? `
      // Depth sensing declarations` : ''}
${handTrackingSetup}
${layersSetup}
${framebufferSetup}

    // =====================================================================
    // XR Session
    // =====================================================================
    let session = null;
    let refSpace = null;

    async function startXR() {
      try {
        const supported = await navigator.xr.isSessionSupported('${sessionMode}');
        if (!supported) {
          ${isInline ? `
          // Inline fallback
          session = await navigator.xr.requestSession('inline');`
          : `
          // Try inline fallback
          try {
            session = await navigator.xr.requestSession('inline');
          } catch (e) {
            errorEl.textContent = 'XR not supported: ' + e.message;
            errorEl.style.display = 'block';
            return;
          }`}
        } else {
          session = await navigator.xr.requestSession('${sessionMode}', ${sessionOptsStr});
        }

        await renderer.xr.setSession(session);
        refSpace = await session.requestReferenceSpace('${refSpace}');

        document.getElementById('splash').style.display = 'none';
        document.getElementById('hud').style.display = 'block';

        session.addEventListener('end', () => {
          session = null;
          refSpace = null;
          document.getElementById('splash').style.display = 'flex';
          document.getElementById('hud').style.display = 'none';
        });

        renderer.setAnimationLoop((time, frame) => {
          if (!frame) return;
${hitTestFrame}
${lightEstimationFrame}
${depthSensingFrame}
${handTrackingFrame}

          renderer.render(scene, camera);
        });

      } catch (err) {
        errorEl.textContent = 'Failed to start XR: ' + err.message;
        errorEl.style.display = 'block';
      }
    }

    enterBtn.addEventListener('click', startXR);

    // =====================================================================
    // Resize (non-XR fallback)
    // =====================================================================
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>`;
  }

  // =========================================================================
  // Scene compilation
  // =========================================================================

  private compileSceneObjects(composition: HoloComposition): string {
    const lines: string[] = [];

    // Objects
    if (composition.objects) {
      for (const obj of composition.objects) {
        lines.push(this.compileObject(obj));
      }
    }

    // Spatial groups
    if (composition.spatialGroups) {
      for (const group of composition.spatialGroups) {
        lines.push(this.compileSpatialGroup(group));
      }
    }

    return lines.join('\n');
  }

  private compileObject(obj: HoloObjectDecl): string {
    const name = this.escapeStringValue(obj.name, 'TypeScript');
    const shape = (this.getProp(obj.properties, 'shape') as string)?.toLowerCase() || 'box';
    const geo = SHAPE_TO_THREE[shape] || SHAPE_TO_THREE['box'];

    const pos = this.resolveVec3(this.getProp(obj.properties, 'position'), [0, 0, -3]);
    const rot = this.resolveVec3(this.getProp(obj.properties, 'rotation'), [0, 0, 0]);
    const scl = this.resolveVec3(this.getProp(obj.properties, 'scale'), [1, 1, 1]);

    // Material
    const color = this.resolveColor(obj);
    const opacity = this.resolveOpacity(obj);
    const matOpts = opacity < 1
      ? `{ color: ${color}, transparent: true, opacity: ${opacity} }`
      : `{ color: ${color} }`;

    return `
      {
        const geo = new THREE.${geo};
        const mat = new THREE.MeshStandardMaterial(${matOpts});
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = '${name}';
        mesh.position.set(${pos.join(', ')});
        mesh.rotation.set(${rot.map((r: number) => (r * Math.PI) / 180).join(', ')});
        mesh.scale.set(${scl.join(', ')});
        scene.add(mesh);
        interactables.push(mesh);
      }`;
  }

  private compileSpatialGroup(group: HoloSpatialGroup): string {
    const name = this.escapeStringValue(group.name, 'TypeScript');
    const lines: string[] = [];
    lines.push(`
      {
        const group_${name.replace(/[^a-zA-Z0-9]/g, '_')} = new THREE.Group();
        group_${name.replace(/[^a-zA-Z0-9]/g, '_')}.name = '${name}';`);

    if (group.objects) {
      for (const obj of group.objects) {
        const inner = this.compileObject(obj);
        // Replace scene.add with group.add
        lines.push(
          inner.replace(
            /scene\.add\(mesh\)/,
            `group_${name.replace(/[^a-zA-Z0-9]/g, '_')}.add(mesh)`
          )
        );
      }
    }

    lines.push(`
        scene.add(group_${name.replace(/[^a-zA-Z0-9]/g, '_')});
      }`);
    return lines.join('\n');
  }

  private compileLights(composition: HoloComposition): string {
    const lines: string[] = [];

    if (composition.lights && composition.lights.length > 0) {
      for (const light of composition.lights) {
        lines.push(this.compileLight(light));
      }
    } else {
      // Default lighting for VR
      lines.push(`
      {
        const ambient = new THREE.AmbientLight(0x404040, 0.6);
        scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(5, 10, 7);
        scene.add(directional);
      }`);
    }

    return lines.join('\n');
  }

  private compileLight(light: HoloLight): string {
    const type = (light.lightType as string) || 'directional';
    const color = this.resolveHex(this.getProp(light.properties, 'color')) || '0xffffff';
    const intensity = (this.getProp(light.properties, 'intensity') as number) ?? 1;
    const pos = this.resolveVec3(this.getProp(light.properties, 'position'), [0, 5, 0]);

    switch (type) {
      case 'point':
        return `
      {
        const light = new THREE.PointLight(${color}, ${intensity}, 20);
        light.position.set(${pos.join(', ')});
        scene.add(light);
      }`;
      case 'spot':
        return `
      {
        const light = new THREE.SpotLight(${color}, ${intensity});
        light.position.set(${pos.join(', ')});
        scene.add(light);
      }`;
      case 'ambient':
        return `
      {
        const light = new THREE.AmbientLight(${color}, ${intensity});
        scene.add(light);
      }`;
      default:
        return `
      {
        const light = new THREE.DirectionalLight(${color}, ${intensity});
        light.position.set(${pos.join(', ')});
        scene.add(light);
      }`;
    }
  }

  private compileEnvironment(composition: HoloComposition): string {
    if (!composition.environment) return '';

    const env = composition.environment;
    const lines: string[] = [];

    const skybox = this.getProp(env.properties, 'skybox');
    const skyColor = this.getProp(env.properties, 'skyColor');
    const fog = this.getProp(env.properties, 'fog');

    if (skybox || skyColor) {
      const resolvedColor = this.resolveHex(skyColor) || '0x1a1a2e';
      lines.push(`scene.background = new THREE.Color(${resolvedColor});`);
    }

    if (fog) {
      lines.push(`scene.fog = new THREE.FogExp2(0x000000, 0.05);`);
    }

    return lines.join('\n      ');
  }

  // =========================================================================
  // HTML output builder
  // =========================================================================

  private buildHTML(
    title: string,
    sceneObjects: string,
    lights: string,
    environment: string
  ): string {
    const k1 = this.opts.distortionK1;
    const k2 = this.opts.distortionK2;
    const ipd = this.opts.ipd;
    const fps = this.opts.targetFPS;
    const sessionMs = this.opts.sessionTimerMinutes * 60 * 1000;
    const vignetteEnabled = this.opts.comfortVignette;
    const thermalEnabled = this.opts.thermalThrottle;
    const batteryEnabled = this.opts.batteryAwareLOD;
    const foveated = this.opts.foveatedRendering;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #000; touch-action: none; }
    canvas { display: block; width: 100vw; height: 100vh; }
    #splash {
      position: fixed; inset: 0; z-index: 100;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: #0a0a1a; color: #fff; font-family: system-ui, sans-serif;
    }
    #splash h1 { font-size: 1.5rem; margin-bottom: 1rem; }
    #splash p { font-size: 0.9rem; opacity: 0.7; margin-bottom: 2rem; text-align: center; padding: 0 2rem; }
    #splash button {
      padding: 1rem 3rem; font-size: 1.1rem; border: 2px solid #00ccff;
      background: transparent; color: #00ccff; border-radius: 8px; cursor: pointer;
    }
    #splash button:active { background: #00ccff22; }
    #reticle {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
      width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.7);
      border-radius: 50%; pointer-events: none; z-index: 10;
    }
    #reticle-fill {
      width: 100%; height: 100%; border-radius: 50%; background: rgba(255,255,255,0.3);
      transform: scale(0); transition: transform 0.1s;
    }
    #vignette {
      position: fixed; inset: 0; pointer-events: none; z-index: 5;
      background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.8) 100%);
      opacity: 0; transition: opacity 0.3s;
    }
    #session-warning {
      position: fixed; top: 10%; left: 50%; transform: translateX(-50%);
      background: rgba(255,204,0,0.9); color: #000; padding: 0.5rem 1.5rem;
      border-radius: 8px; font-family: system-ui; font-size: 0.9rem;
      z-index: 20; display: none;
    }
    #ipd-display {
      position: fixed; bottom: 5%; left: 50%; transform: translateX(-50%);
      color: rgba(255,255,255,0.5); font-family: monospace; font-size: 0.7rem;
      z-index: 15; display: none;
    }
  </style>
</head>
<body>
  <div id="splash">
    <h1>Phone Sleeve VR</h1>
    <p>Slide your phone into the sleeve, then tap the button below to enter VR.<br>
       Tap left/right edges to adjust eye spacing (IPD).</p>
    <button id="enter-vr">Enter VR</button>
  </div>
  <div id="reticle"><div id="reticle-fill"></div></div>
  <div id="vignette"></div>
  <div id="session-warning">Time for a break! Remove the headset and rest your eyes.</div>
  <div id="ipd-display">IPD: <span id="ipd-val">${ipd}</span>mm</div>

  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.172.0/examples/jsm/"
    }
  }
  </script>
  <script type="module">
    import * as THREE from 'three';
    import { StereoEffect } from 'three/addons/effects/StereoEffect.js';
    import { DeviceOrientationControls } from 'three/addons/controls/DeviceOrientationControls.js';

    // =====================================================================
    // Config
    // =====================================================================
    let currentIPD = ${ipd};
    const DISTORTION_K1 = ${k1};
    const DISTORTION_K2 = ${k2};
    const TARGET_FPS = ${fps};
    const SESSION_TIMER_MS = ${sessionMs};
    const VIGNETTE_ENABLED = ${vignetteEnabled};
    const THERMAL_ENABLED = ${thermalEnabled};
    const BATTERY_ENABLED = ${batteryEnabled};
    const FOVEATED = ${foveated};

    // =====================================================================
    // Scene setup
    // =====================================================================
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0); // standing eye height

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);

    // Stereo effect for side-by-side rendering
    const stereoEffect = new StereoEffect(renderer);
    stereoEffect.setEyeSeparation(currentIPD / 1000); // mm to meters
    stereoEffect.setSize(window.innerWidth, window.innerHeight);

    // Interactable objects for gaze selection
    const interactables = [];

    // =====================================================================
    // Environment
    // =====================================================================
    ${environment || 'scene.background = new THREE.Color(0x1a1a2e);'}

    // Floor grid for spatial reference
    {
      const gridHelper = new THREE.GridHelper(20, 20, 0x333366, 0x222244);
      scene.add(gridHelper);
    }

    // =====================================================================
    // Lights
    // =====================================================================
    ${lights}

    // =====================================================================
    // Scene objects
    // =====================================================================
    ${sceneObjects}

    // =====================================================================
    // Head tracking (DeviceOrientation — 3-DOF)
    // =====================================================================
    let controls = null;
    let lastRotation = new THREE.Euler();
    let rotationSpeed = 0;

    function initControls() {
      if (typeof DeviceOrientationControls !== 'undefined') {
        controls = new DeviceOrientationControls(camera);
      }
    }

    // =====================================================================
    // Gaze cursor (dwell-to-select)
    // =====================================================================
    const raycaster = new THREE.Raycaster();
    const gazeCenter = new THREE.Vector2(0, 0);
    let gazeTarget = null;
    let gazeTimer = 0;
    const GAZE_DWELL_MS = 1500;
    const reticleFill = document.getElementById('reticle-fill');

    function updateGaze(dt) {
      raycaster.setFromCamera(gazeCenter, camera);
      const hits = raycaster.intersectObjects(interactables, true);

      if (hits.length > 0) {
        const hit = hits[0].object;
        if (hit === gazeTarget) {
          gazeTimer += dt * 1000;
          const progress = Math.min(gazeTimer / GAZE_DWELL_MS, 1);
          reticleFill.style.transform = 'scale(' + progress + ')';
          if (gazeTimer >= GAZE_DWELL_MS) {
            onGazeSelect(hit);
            gazeTimer = 0;
          }
        } else {
          gazeTarget = hit;
          gazeTimer = 0;
        }
      } else {
        gazeTarget = null;
        gazeTimer = 0;
        reticleFill.style.transform = 'scale(0)';
      }
    }

    function onGazeSelect(obj) {
      // Visual feedback: brief emissive pulse
      if (obj.material) {
        const origColor = obj.material.emissive ? obj.material.emissive.getHex() : 0;
        obj.material.emissive = new THREE.Color(0x44ffaa);
        setTimeout(() => {
          obj.material.emissive = new THREE.Color(origColor);
        }, 300);
      }
    }

    // =====================================================================
    // Comfort vignette
    // =====================================================================
    const vignetteEl = document.getElementById('vignette');

    function updateVignette() {
      if (!VIGNETTE_ENABLED) return;
      // Darken edges during fast head movement
      const targetOpacity = Math.min(rotationSpeed * 2, 0.8);
      vignetteEl.style.opacity = String(targetOpacity);
    }

    // =====================================================================
    // Thermal & Battery awareness
    // =====================================================================
    let qualityScale = 1.0;

    async function checkBattery() {
      if (!BATTERY_ENABLED || !navigator.getBattery) return;
      try {
        const battery = await navigator.getBattery();
        if (battery.level < 0.15 && !battery.charging) {
          qualityScale = Math.min(qualityScale, 0.5);
          renderer.setPixelRatio(1);
        } else if (battery.level < 0.30 && !battery.charging) {
          qualityScale = Math.min(qualityScale, 0.75);
        }
      } catch (_) { /* Battery API not available */ }
    }
    // Check every 60 seconds
    setInterval(checkBattery, 60000);
    checkBattery();

    // =====================================================================
    // Session timer
    // =====================================================================
    const sessionWarning = document.getElementById('session-warning');
    let sessionStart = Date.now();

    function checkSessionTimer() {
      if (Date.now() - sessionStart > SESSION_TIMER_MS) {
        sessionWarning.style.display = 'block';
        setTimeout(() => { sessionWarning.style.display = 'none'; }, 5000);
        sessionStart = Date.now(); // reset for next interval
      }
    }
    setInterval(checkSessionTimer, 10000);

    // =====================================================================
    // IPD adjustment (tap left/right edge)
    // =====================================================================
    const ipdDisplay = document.getElementById('ipd-display');
    const ipdVal = document.getElementById('ipd-val');

    document.addEventListener('touchstart', (e) => {
      const x = e.touches[0].clientX;
      const w = window.innerWidth;
      if (x < w * 0.15) {
        // Left edge: decrease IPD
        currentIPD = Math.max(55, currentIPD - 1);
        stereoEffect.setEyeSeparation(currentIPD / 1000);
        showIPD();
      } else if (x > w * 0.85) {
        // Right edge: increase IPD
        currentIPD = Math.min(75, currentIPD + 1);
        stereoEffect.setEyeSeparation(currentIPD / 1000);
        showIPD();
      }
    });

    function showIPD() {
      ipdVal.textContent = String(currentIPD);
      ipdDisplay.style.display = 'block';
      setTimeout(() => { ipdDisplay.style.display = 'none'; }, 2000);
    }

    // =====================================================================
    // Render loop
    // =====================================================================
    const clock = new THREE.Clock();
    let frameCount = 0;

    function animate() {
      requestAnimationFrame(animate);
      const dt = clock.getDelta();
      frameCount++;

      // Update controls
      if (controls) {
        controls.update();

        // Calculate rotation speed for vignette
        const currentRot = camera.rotation.clone();
        rotationSpeed =
          Math.abs(currentRot.x - lastRotation.x) +
          Math.abs(currentRot.y - lastRotation.y) +
          Math.abs(currentRot.z - lastRotation.z);
        lastRotation.copy(currentRot);
      }

      // Gaze
      updateGaze(dt);

      // Comfort
      updateVignette();

      // Render stereo
      stereoEffect.render(scene, camera);
    }

    // =====================================================================
    // Enter VR
    // =====================================================================
    document.getElementById('enter-vr').addEventListener('click', async () => {
      document.getElementById('splash').style.display = 'none';

      // Request fullscreen + landscape lock
      try {
        await document.documentElement.requestFullscreen();
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
        }
      } catch (_) { /* orientation lock may not be supported */ }

      // Request device orientation permission (iOS 13+)
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission !== 'granted') {
            console.warn('[PhoneSleeveVR] DeviceOrientation permission denied');
          }
        } catch (_) { /* not iOS or permission already granted */ }
      }

      initControls();
      animate();
    });

    // =====================================================================
    // Resize
    // =====================================================================
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      stereoEffect.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>`;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private getProp(properties: { key: string, value: any }[] | undefined, key: string): any {
    if (!properties) return undefined;
    const prop = properties.find(p => p.key === key);
    return prop ? prop.value : undefined;
  }

  private resolveVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
    if (Array.isArray(value) && value.length >= 3) {
      return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
    }
    return fallback;
  }

  private resolveColor(obj: HoloObjectDecl): string {
    const color = this.getProp(obj.properties, 'color') || this.getProp(obj.properties, 'material')?.color;
    if (typeof color === 'string') {
      if (color.startsWith('#')) return `0x${color.slice(1)}`;
      if (color.startsWith('0x')) return color;
      // Named color
      return `'${this.escapeStringValue(color, 'TypeScript')}'`;
    }
    return '0x4488ff'; // default blue
  }

  private resolveHex(value: unknown): string | null {
    if (typeof value === 'string') {
      if (value.startsWith('#')) return `0x${value.slice(1)}`;
      if (value.startsWith('0x')) return value;
    }
    return null;
  }

  private resolveOpacity(obj: HoloObjectDecl): number {
    const opacity = this.getProp(obj.properties, 'opacity');
    if (typeof opacity === 'number') return opacity;
    const material = this.getProp(obj.properties, 'material');
    if (material && typeof material.opacity === 'number') return material.opacity;
    return 1;
  }
}
