/**
 * Type definitions for the HoloScript preview engine.
 */

export interface ParsedObject {
  name: string;
  geometry: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: number;
  material: string;
  glow: boolean;
  texture?: string;
  textureRepeat?: [number, number];
  textureOffset?: [number, number];
  animate?: string;
  animSpeed?: number;
  animAmplitude?: number;
  animRadius?: number;
}

export interface ParsedEnvironment {
  skybox?: string;
  fog?: { color: string; density: number };
  background?: string;
}

export interface ParseResult {
  objects: ParsedObject[];
  environment: ParsedEnvironment;
}

export interface AnimatedEntry {
  mesh: any; // THREE.Mesh
  type: string;
  speed: number;
  amplitude: number;
  radius: number;
  originalY: number;
  originalPos: { x: number; y: number; z: number };
}

export interface SceneState {
  objects: any[]; // THREE.Mesh[]
  animatedObjects: AnimatedEntry[];
  particleSystems: any[];
  wireframeMode: boolean;
  showGrid: boolean;
  showAxes: boolean;
}

/** Configuration for the preview renderer. */
export interface RendererConfig {
  /** Background color (hex). Default: 0x1a1a2e */
  backgroundColor?: number;
  /** Enable shadows. Default: true */
  shadows?: boolean;
  /** Enable antialiasing. Default: true */
  antialias?: boolean;
  /** Max pixel ratio. Default: 2 */
  maxPixelRatio?: number;
  /** Enable orbit controls damping. Default: true */
  enableDamping?: boolean;
  /** Camera field of view. Default: 60 */
  fov?: number;
  /** Initial camera position. Default: [8, 6, 8] */
  cameraPosition?: [number, number, number];
  /** Show grid helper. Default: true */
  showGrid?: boolean;
  /** Show axes helper. Default: true */
  showAxes?: boolean;
  /** Grid size. Default: 20 */
  gridSize?: number;
}
