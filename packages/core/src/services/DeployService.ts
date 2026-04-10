/**
 * HoloScript Deploy Service
 *
 * Client-side API for deploying HoloScript to various platforms.
 * Actual compilation happens on backend services (infinityassistant.io).
 *
 * Supported Deploy Targets:
 * - Web (React, Next.js) - Local compilation
 * - React Three Fiber - Local compilation
 * - Flutter - Backend required
 * - SwiftUI - Backend required
 * - Jetpack Compose - Backend required
 * - Unity - Backend required
 * - Unreal Engine - Backend required
 * - Godot - Backend required
 * - Native VR (Quest, Vision Pro) - Backend required
 */

export type DeployTarget =
  | 'web'
  | 'react-three-fiber'
  | 'flutter'
  | 'swiftui'
  | 'jetpack-compose'
  | 'unity'
  | 'unreal'
  | 'godot'
  | 'quest-native'
  | 'vision-pro';

export interface DeployConfig {
  target: DeployTarget;
  holoScript: string;
  options?: {
    minify?: boolean;
    optimize?: boolean;
    debug?: boolean;
    outputDir?: string;
  };
}

export interface DeployResult {
  success: boolean;
  target: DeployTarget;
  code?: string;
  files?: Array<{ path: string; content: string }>;
  errors?: string[];
  warnings?: string[];
  metadata?: {
    compilationTime: number;
    outputSize: number;
    dependencies: string[];
  };
}

export interface DeployServiceConfig {
  /** Backend API URL (defaults to infinityassistant.io) */
  apiUrl?: string;
  /** API key for backend authentication */
  apiKey?: string;
  /** Enable local compilation where supported */
  enableLocalCompilation?: boolean;
}

/**
 * Deploy Service for compiling HoloScript to various targets
 */
export class DeployService {
  private config: Required<DeployServiceConfig>;

  // Targets that can be compiled locally
  private static LOCAL_TARGETS: DeployTarget[] = ['web', 'react-three-fiber'];

  constructor(config: DeployServiceConfig = {}) {
    this.config = {
      apiUrl: config.apiUrl ?? 'https://api.infinityassistant.io/v1/deploy',
      apiKey: config.apiKey ?? '',
      enableLocalCompilation: config.enableLocalCompilation ?? true,
    };
  }

  /**
   * Deploy HoloScript to a target platform
   */
  async deploy(config: DeployConfig): Promise<DeployResult> {
    const { target, holoScript, options } = config;

    // Check if local compilation is available
    if (this.config.enableLocalCompilation && DeployService.LOCAL_TARGETS.includes(target)) {
      return this.compileLocally(target, holoScript, options);
    }

    // Otherwise, use backend API
    return this.compileRemotely(target, holoScript, options);
  }

  /**
   * Get supported targets and their availability
   */
  getSupportedTargets(): Array<{ target: DeployTarget; local: boolean; requiresBackend: boolean }> {
    const allTargets: DeployTarget[] = [
      'web',
      'react-three-fiber',
      'flutter',
      'swiftui',
      'jetpack-compose',
      'unity',
      'unreal',
      'godot',
      'quest-native',
      'vision-pro',
    ];

    return allTargets.map((target) => ({
      target,
      local: DeployService.LOCAL_TARGETS.includes(target),
      requiresBackend: !DeployService.LOCAL_TARGETS.includes(target),
    }));
  }

  /**
   * Compile locally for web targets
   */
  private async compileLocally(
    target: DeployTarget,
    holoScript: string,
    options?: DeployConfig['options']
  ): Promise<DeployResult> {
    const startTime = performance.now();

    try {
      let code = '';

      if (target === 'web') {
        code = this.compileToWeb(holoScript, options);
      } else if (target === 'react-three-fiber') {
        code = this.compileToR3F(holoScript, options);
      }

      return {
        success: true,
        target,
        code,
        metadata: {
          compilationTime: performance.now() - startTime,
          outputSize: code.length,
          dependencies: this.extractDependencies(target),
        },
      };
    } catch (error) {
      return {
        success: false,
        target,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Compile remotely via backend API
   */
  private async compileRemotely(
    target: DeployTarget,
    holoScript: string,
    options?: DeployConfig['options']
  ): Promise<DeployResult> {
    if (!this.config.apiKey) {
      return {
        success: false,
        target,
        errors: [
          `Backend compilation for ${target} requires API key. Visit infinityassistant.io to get one.`,
        ],
      };
    }

    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({ target, holoScript, options }),
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        target,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Compile to vanilla web (HTML/JS)
   */
  private compileToWeb(holoScript: string, _options?: DeployConfig['options']): string {
    // Parse the HoloScript to extract objects and scene structure
    const objects = this.extractObjectsFromCode(holoScript);

    const objectCreationCode = objects
      .map((obj) => {
        const geometryCode = this.getGeometryCode(obj.type || 'sphere');
        const colorHex = this.colorToHex(obj.color || '#00ffff');
        const position = obj.position || [0, 0, 0];
        const scale = obj.scale || [1, 1, 1];

        return `  // Object: ${obj.name}
  const ${this.sanitizeName(obj.name)}Geometry = ${geometryCode};
  const ${this.sanitizeName(obj.name)}Material = new THREE.MeshStandardMaterial({ 
    color: ${colorHex},
    emissive: ${colorHex},
    emissiveIntensity: 0.2
  });
  const ${this.sanitizeName(obj.name)} = new THREE.Mesh(${this.sanitizeName(obj.name)}Geometry, ${this.sanitizeName(obj.name)}Material);
  ${this.sanitizeName(obj.name)}.position.set(${position.join(', ')});
  ${this.sanitizeName(obj.name)}.scale.set(${scale.join(', ')});
  scene.add(${this.sanitizeName(obj.name)});`;
      })
      .join('\n\n');

    return `// Generated from HoloScript
// Auto-generated Three.js scene

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createScene(container) {
  // Scene setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(0, 2, 5);
  
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);
  
  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  
  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 10, 5);
  scene.add(directionalLight);
  
  // Objects from HoloScript
${objectCreationCode}
  
  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  
  // Handle resize
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  
  return { scene, camera, renderer };
}
`;
  }

  /**
   * Compile to React Three Fiber
   */
  private compileToR3F(holoScript: string, _options?: DeployConfig['options']): string {
    // Parse the HoloScript to extract objects
    const objects = this.extractObjectsFromCode(holoScript);

    const componentCode = objects
      .map((obj) => {
        const geometryComponent = this.getR3FGeometry(obj.type || 'sphere');
        const color = obj.color || 'cyan';
        const position = obj.position || [0, 0, 0];
        const scale = obj.scale || [1, 1, 1];

        return `      {/* ${obj.name} */}
      <mesh position={[${position.join(', ')}]} scale={[${scale.join(', ')}]}>
        ${geometryComponent}
        <meshStandardMaterial color="${color}" emissive="${color}" emissiveIntensity={0.2} />
      </mesh>`;
      })
      .join('\n');

    return `// Generated React Three Fiber from HoloScript
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';

function SceneContent() {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      
      {/* Objects from HoloScript */}
${componentCode}
      
      {/* Controls */}
      <OrbitControls enableDamping />
    </>
  );
}

export function Scene() {
  return (
    <Canvas camera={{ position: [0, 2, 5], fov: 75 }}>
      <color attach="background" args={['#1a1a2e']} />
      <SceneContent />
    </Canvas>
  );
}
`;
  }

  /**
   * Helper: Extract objects from HoloScript code
   */
  private extractObjectsFromCode(
    code: string
  ): Array<{ name: string; type?: string; color?: string; position?: number[]; scale?: number[] }> {
    const objects: Array<{
      name: string;
      type?: string;
      color?: string;
      position?: number[];
      scale?: number[];
    }> = [];

    // Match object definitions
    const objectRegex =
      /(?:object|orb|cube|sphere|box|plane)\s+["']?([\\w-]+)["']?\s*[^{]*\{([^}]*)\}/gi;
    let match;

    while ((match = objectRegex.exec(code)) !== null) {
      const name = match[1];
      const propsStr = match[2] || '';

      const obj: {
        name: string;
        type?: string;
        color?: string;
        position?: number[];
        scale?: number[];
      } = { name };

      // Extract geometry
      const geoMatch = propsStr.match(/geometry:\s*["']?(\w+)["']?/i);
      obj.type = geoMatch ? geoMatch[1] : 'sphere';

      // Extract position
      const posMatch = propsStr.match(/position:\s*\[([^\]]+)\]/i);
      if (posMatch) {
        obj.position = posMatch[1].split(',').map((n) => parseFloat(n.trim()));
      }

      // Extract color
      const colorMatch = propsStr.match(/color:\s*["']?([#\w]+)["']?/i);
      if (colorMatch) obj.color = colorMatch[1];

      // Extract scale
      const scaleMatch = propsStr.match(/scale:\s*([\d.]+|\[[^\]]+\])/i);
      if (scaleMatch) {
        const val = scaleMatch[1];
        if (val.startsWith('[')) {
          obj.scale = val
            .slice(1, -1)
            .split(',')
            .map((n) => parseFloat(n.trim()));
        } else {
          const s = parseFloat(val);
          obj.scale = [s, s, s];
        }
      }

      objects.push(obj);
    }

    return objects;
  }

  private getGeometryCode(type: string): string {
    switch (type?.toLowerCase()) {
      case 'sphere':
      case 'orb':
        return 'new THREE.SphereGeometry(0.5, 32, 32)';
      case 'cube':
      case 'box':
        return 'new THREE.BoxGeometry(1, 1, 1)';
      case 'plane':
        return 'new THREE.PlaneGeometry(2, 2)';
      case 'cylinder':
        return 'new THREE.CylinderGeometry(0.5, 0.5, 1, 32)';
      case 'cone':
        return 'new THREE.ConeGeometry(0.5, 1, 32)';
      case 'torus':
        return 'new THREE.TorusGeometry(0.4, 0.15, 16, 48)';
      default:
        return 'new THREE.SphereGeometry(0.5, 32, 32)';
    }
  }

  private getR3FGeometry(type: string): string {
    switch (type?.toLowerCase()) {
      case 'sphere':
      case 'orb':
        return '<sphereGeometry args={[0.5, 32, 32]} />';
      case 'cube':
      case 'box':
        return '<boxGeometry args={[1, 1, 1]} />';
      case 'plane':
        return '<planeGeometry args={[2, 2]} />';
      case 'cylinder':
        return '<cylinderGeometry args={[0.5, 0.5, 1, 32]} />';
      case 'cone':
        return '<coneGeometry args={[0.5, 1, 32]} />';
      case 'torus':
        return '<torusGeometry args={[0.4, 0.15, 16, 48]} />';
      default:
        return '<sphereGeometry args={[0.5, 32, 32]} />';
    }
  }

  private colorToHex(color: string): string {
    if (color.startsWith('#')) return `0x${color.slice(1)}`;
    const colors: Record<string, string> = {
      red: '0xff0000',
      green: '0x00ff00',
      blue: '0x0000ff',
      yellow: '0xffff00',
      cyan: '0x00ffff',
      magenta: '0xff00ff',
      white: '0xffffff',
      black: '0x000000',
      orange: '0xffa500',
      purple: '0x800080',
      pink: '0xffc0cb',
    };
    return colors[color.toLowerCase()] || '0x00ffff';
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  }

  /**
   * Extract dependencies for a target
   */
  private extractDependencies(target: DeployTarget): string[] {
    const deps: Record<DeployTarget, string[]> = {
      web: [],
      'react-three-fiber': ['@react-three/fiber', '@react-three/drei', 'three'],
      flutter: ['flutter_holoscript'],
      swiftui: [],
      'jetpack-compose': ['holoscript-android'],
      unity: ['HoloScript.Unity'],
      unreal: ['HoloScriptUE'],
      godot: ['holoscript-godot'],
      'quest-native': ['holoscript-quest-sdk'],
      'vision-pro': ['holoscript-visionos'],
    };
    return deps[target] ?? [];
  }
}

/**
 * Create a deploy service instance
 */
export function createDeployService(config?: DeployServiceConfig): DeployService {
  return new DeployService(config);
}
